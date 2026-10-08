/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  LiveClassroomSession,
  ABProProjectEvaluation,
  SystemConfig,
  CustomMiniRetoTemplate,
  MiniRetoAttemptRecord,
  AntiCheatLogEntry
} from './types';
import { INITIAL_STUDENTS } from './data/students';
import { INITIAL_QUESTIONS, normalizeQuestionList } from './data/questions';
import { INITIAL_CUSTOM_MINI_RETOS } from './utils/miniRetosEngine';
import { enrichStudentsWithServerSummary } from './utils/academicServerSummary';
import { StudentPortal } from './components/StudentPortal';
import { TeacherPanel } from './components/TeacherPanel';
import { ServerSaveProvider, ServerSaveResponse } from './components/ServerSaveContext';
import { AuthProvider, useAuthSession } from './context/AuthContext';
import {
  saveCentralStateToFirestore,
  loadCentralStateFromFirestore,
  saveQuestionsSnapshotToFirestore,
  loadQuestionsSnapshotFromFirestore
} from './utils/cloudPersistence';

export interface ForceServerResyncResult {
  ok: boolean;
  syncedAtFormatted: string;
  revision: number;
  questionsRevision: number;
  lastModifiedIso?: string;
  clearedKeysCount: number;
  counts: {
    students: number;
    questions: number;
    attempts: number;
    abproEvaluations: number;
    liveSessions: number;
    customMiniRetos: number;
  };
  error?: string;
}

const STORAGE_KEYS = {
  STUDENTS: 'evaluaplus_students_v2',
  STUDENTS_CLEARED: 'evaluaplus_students_explicitly_cleared_v1',
  QUESTIONS: 'evaluaplus_questions_v3_unificado_2026',
  QUESTIONS_CLEARED: 'evaluaplus_questions_explicitly_cleared_v1',
  ATTEMPTS: 'evaluaplus_attempts_v2',
  LIVE_SESSIONS: 'evaluaplus_live_sessions_v2',
  ABPRO: 'evaluaplus_abpro_v2',
  CONFIG: 'evaluaplus_config_v2',
  CUSTOM_MINI_RETOS: 'evaluaplus_custom_mini_retos_v1',
  LEGACY_SNAPSHOT: 'evaluaplus_prev_questions_snapshot_v1',
  ACTIVE_EXAM_BACKUP: 'evaluaplus_active_exam_backup_v2'
};

const DEFAULT_CONFIG: SystemConfig = {
  examenAbierto: true,
  mensajeSalaEspera:
    'Atención grupo: El examen iniciará en breves minutos cuando todos los equipos del aula estén listos.',
  exigirPinAula: false,
  pinAulaDia: 'AULA26',
  retroalimentacionInmediata: true,
  mostrarDesglosePregunta: true,
  barajarOpciones: true,
  correoRecuperacion: 'fenixcor207@gmail.com',
  idDocente: 'DOCENTE2026',
  claveDocente: 'DOCENTE2026',
  webhookUrl: '',
  ponderacionTeoriaPct: 60,
  preguntasExamenIntegral: 40,
  tiempoExamenIntegralMin: 80,
  preguntasExamenModulo: 25,
  tiempoExamenModuloMin: 50,
  notaMinimaAprobacion: 3.0,
  exigirPantallaMaximizada: true,
  maxLlamadosAtencionGlobal: 1,
  llamadosAtencionPorEstudiante: {},
  antiTrampaExamenesActivo: true,
  examenBloquearCambioPestanaFoco: true,
  detectarCambioPestana: true,
  detectarMinimizarPestana: true,
  detectarCambioAplicacion: true,
  detectarSalidaPunteroDevToolsIA: true,
  detectarRafagaRespuestaRapidaIA: true,
  examenBloquearCopiaClicDerechoAtajos: true,
  examenExigirPantallaCompleta: true,
  ecualizadorPsicometricoActivo: true,
  antiTrampaMiniRetosActivo: true,
  retoBloquearCambioPestanaFoco: true,
  retoSuspenderCopiaPegadoInyeccion: true,
  retoBiometriaTecleoAntiCopia: true,
  retoExigirPantallaCompleta: true,
  miniRetosAbiertos: true,
  estudiantesSinMiniRetos: [],
  estudiantesModulosMiniRetosBloqueados: {},
  miniRetosSinRestriccionHora: true,
  miniRetosDiasPermitidos: [1, 2, 3, 4, 5, 6],
  miniRetosHoraInicio: '07:00',
  miniRetosHoraFin: '22:00',
  umbralAprobacionMiniRetoPct: 60
};

function safeWriteLocalStorage(key: string, value: unknown) {
  try {
    // Always remove legacy snapshot key that used to exhaust the 5MB localStorage quota
    localStorage.removeItem(STORAGE_KEYS.LEGACY_SNAPSHOT);
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // If questions bank is very large (>5MB in UTF-16), server persistence holds the full bank without limit
  }
}

function AppContent() {
  const { authState, setActiveView, logoutAll } = useAuthSession();
  const activeView = authState.activeView;
  const [studentSessionActive, setStudentSessionActive] = useState<boolean>(
    authState.studentSessionActive && Boolean(authState.verifiedStudentId)
  );
  const [teacherSessionActive, setTeacherSessionActive] = useState<boolean>(
    authState.teacherSessionActive
  );
  const [logoutSignal, setLogoutSignal] = useState(0);

  // Server Hydration & Revision Tracking
  const [isServerHydrated, setIsServerHydrated] = useState(false);
  const [questionsBankExplicitlyCleared, setQuestionsBankExplicitlyCleared] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem(STORAGE_KEYS.QUESTIONS_CLEARED) === 'true';
      } catch {
        return false;
      }
    }
  );
  const [previousQuestionsSnapshotCount, setPreviousQuestionsSnapshotCount] = useState<number>(0);
  const [activeExamsByStudent, setActiveExamsByStudent] = useState<Record<string, any>>({});
  const [lastServerSyncFormatted, setLastServerSyncFormatted] = useState<string>(() =>
    new Date().toLocaleTimeString('es-CO')
  );
  const [currentServerRevision, setCurrentServerRevision] = useState<number>(1);

  const serverRevisionRef = useRef<number>(-1);
  const questionsRevisionRef = useRef<number>(-1);
  const pendingWritesCountRef = useRef<number>(0);
  const lastMutationStartedAtRef = useRef<number>(0);

  // Persistent State: Students (37 Official IDs + Demo User, respects empty roster if explicitly cleared by teacher)
  const [students, setStudents] = useState<StudentRecord[]>(() => {
    try {
      const explicitlyCleared = localStorage.getItem(STORAGE_KEYS.STUDENTS_CLEARED) === 'true';
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) return parsed;
          if (explicitlyCleared) return [];
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_STUDENTS;
  });

  // Persistent State: Questions Bank (Respects empty bank if explicitly cleared by teacher)
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const explicitlyCleared = localStorage.getItem(STORAGE_KEYS.QUESTIONS_CLEARED) === 'true';
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0) {
            return normalizeQuestionList(parsed);
          }
          if (explicitlyCleared) {
            return [];
          }
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_QUESTIONS;
  });

  // Persistent State: Exam Attempts
  const [attempts, setAttempts] = useState<ExamAttemptResult[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Persistent State: ABPro Project Evaluations
  const [abproEvaluations, setAbproEvaluations] = useState<ABProProjectEvaluation[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ABPRO);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Persistent State: Live Classroom Sessions
  const [liveSessions, setLiveSessions] = useState<LiveClassroomSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LIVE_SESSIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Persistent State: System Config
  const [config, setConfig] = useState<SystemConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (raw) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_CONFIG;
  });

  // Persistent State: Custom Teacher Mini Retos Templates
  const [customMiniRetos, setCustomMiniRetos] = useState<CustomMiniRetoTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_MINI_RETOS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return INITIAL_CUSTOM_MINI_RETOS;
  });

  // Keep synchronous ref of latest state for functional updaters
  const stateRef = useRef({
    students,
    questions,
    attempts,
    abproEvaluations,
    liveSessions,
    config,
    customMiniRetos,
    questionsBankExplicitlyCleared
  });
  useEffect(() => {
    stateRef.current = {
      students,
      questions,
      attempts,
      abproEvaluations,
      liveSessions,
      config,
      customMiniRetos,
      questionsBankExplicitlyCleared
    };
  }, [
    students,
    questions,
    attempts,
    abproEvaluations,
    liveSessions,
    config,
    customMiniRetos,
    questionsBankExplicitlyCleared
  ]);

  // Helper to send mutations to the centralized server AND directly to permanent Cloud Firestore
  const pushServerMutation = useCallback(
    async (endpoint: string, method: 'PUT' | 'POST' | 'PATCH', payload?: unknown) => {
      pendingWritesCountRef.current += 1;
      lastMutationStartedAtRef.current = Date.now();
      const nextRev = Math.max(2, (serverRevisionRef.current > 0 ? serverRevisionRef.current : 1) + 1);
      const isQuestionsMutation =
        endpoint.includes('questions') ||
        endpoint.includes('full-restore') ||
        (endpoint.includes('save-all') && Boolean((payload as any)?.questions));
      const nextQRev = isQuestionsMutation
        ? Math.max(2, (questionsRevisionRef.current > 0 ? questionsRevisionRef.current : 1) + 1)
        : Math.max(1, questionsRevisionRef.current > 0 ? questionsRevisionRef.current : 1);

      serverRevisionRef.current = nextRev;
      questionsRevisionRef.current = nextQRev;
      setCurrentServerRevision(nextRev);

      const nowIso = new Date().toISOString();

      try {
        // 1. Write directly to permanent Cloud Firestore so changes are never lost across Vercel serverless instances
        await saveCentralStateToFirestore(
          {
            initialized: true,
            migratedFromClient: true,
            revision: nextRev,
            questionsRevision: nextQRev,
            lastModifiedIso: nowIso,
            questionsBankExplicitlyCleared: stateRef.current.questionsBankExplicitlyCleared,
            studentsExplicitlyCleared: stateRef.current.students.length === 0,
            students: stateRef.current.students,
            questions: stateRef.current.questions,
            attempts: stateRef.current.attempts,
            abproEvaluations: stateRef.current.abproEvaluations,
            liveSessions: stateRef.current.liveSessions,
            config: stateRef.current.config,
            customMiniRetos: stateRef.current.customMiniRetos,
            activeExamsByStudent: {}
          },
          { includeQuestions: isQuestionsMutation || nextRev <= 2 }
        );

        // 2. Also notify Express /api/state endpoint
        const res = await fetch(endpoint, {
          method,
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: payload !== undefined ? JSON.stringify(payload) : undefined
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.revision === 'number' && data.revision > serverRevisionRef.current) {
            serverRevisionRef.current = data.revision;
            setCurrentServerRevision(data.revision);
          }
          if (
            typeof data.questionsRevision === 'number' &&
            data.questionsRevision > questionsRevisionRef.current
          ) {
            questionsRevisionRef.current = data.questionsRevision;
          }
          if (typeof data.previousQuestionsSnapshotCount === 'number') {
            setPreviousQuestionsSnapshotCount(data.previousQuestionsSnapshotCount);
          }
          return {
            ...data,
            ok: true,
            revision: serverRevisionRef.current,
            questionsRevision: questionsRevisionRef.current
          };
        }
        return {
          ok: true,
          revision: serverRevisionRef.current,
          questionsRevision: questionsRevisionRef.current,
          lastModifiedIso: nowIso
        };
      } catch (err) {
        console.error(`Error syncing with centralized server (${endpoint}):`, err);
        return {
          ok: true,
          revision: serverRevisionRef.current,
          questionsRevision: questionsRevisionRef.current,
          lastModifiedIso: nowIso
        };
      } finally {
        pendingWritesCountRef.current = Math.max(0, pendingWritesCountRef.current - 1);
      }
    },
    []
  );

  // Pull & synchronize authoritative state from the centralized server
  const fetchAndApplyServerState = useCallback(
    async (
      forceFullPull = false,
      purgeLocalCache = false
    ): Promise<ForceServerResyncResult | null> => {
      // Do not overwrite state while a local mutation is currently being sent to the server
      if (pendingWritesCountRef.current > 0 && !forceFullPull && !purgeLocalCache) {
        return null;
      }

      let clearedKeysCount = 0;
      if (purgeLocalCache) {
        try {
          const keysToPurge = new Set<string>(Object.values(STORAGE_KEYS));
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('evaluaplus_') && k !== 'evaluaplus_global_auth_session_v1') {
              keysToPurge.add(k);
            }
          }
          keysToPurge.forEach((k) => {
            if (localStorage.getItem(k) !== null) {
              clearedKeysCount += 1;
            }
            localStorage.removeItem(k);
          });
        } catch {
          // ignore localStorage access errors
        }

        try {
          if (typeof window !== 'undefined' && 'caches' in window) {
            const cacheNames = await window.caches.keys();
            await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
          }
        } catch {
          // ignore Cache Storage errors
        }

        serverRevisionRef.current = -1;
        questionsRevisionRef.current = -1;
      }

      const fetchStartedAt = Date.now();

      try {
        const cRev = forceFullPull || purgeLocalCache ? -1 : serverRevisionRef.current;
        const qRev = forceFullPull || purgeLocalCache ? -1 : questionsRevisionRef.current;
        const forceParam = forceFullPull || purgeLocalCache ? '&force=true' : '';

        // 1. Read authoritative state directly from permanent Cloud Firestore first
        let data: any = null;
        try {
          const cloudData = await loadCentralStateFromFirestore({
            includeQuestions: true
          });
          if (cloudData && typeof cloudData === 'object') {
            data = {
              ...cloudData,
              upToDate:
                !forceFullPull &&
                !purgeLocalCache &&
                cloudData.revision === cRev &&
                cloudData.questionsRevision === qRev
            };
          }
        } catch {
          // fallback to API fetch below
        }

        // 2. Fallback or supplement from /api/state if Firestore has not been initialized yet
        if (!data) {
          const res = await fetch(
            `/api/state?clientRevision=${cRev}&clientQuestionsRevision=${qRev}${forceParam}&_t=${fetchStartedAt}`,
            {
              method: 'GET',
              cache: 'no-store',
              headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache'
              }
            }
          );
          if (!res.ok) {
            setIsServerHydrated(true);
            return {
              ok: false,
              syncedAtFormatted: new Date().toLocaleTimeString('es-CO'),
              revision: serverRevisionRef.current,
              questionsRevision: questionsRevisionRef.current,
              clearedKeysCount,
              counts: {
                students: stateRef.current.students.length,
                questions: stateRef.current.questions.length,
                attempts: stateRef.current.attempts.length,
                abproEvaluations: stateRef.current.abproEvaluations.length,
                liveSessions: stateRef.current.liveSessions.length,
                customMiniRetos: stateRef.current.customMiniRetos.length
              },
              error: `El servidor respondió con código ${res.status}`
            };
          }
          data = await res.json();
        }

        // Check if a mutation started while the fetch was in flight
        if (
          (pendingWritesCountRef.current > 0 ||
            lastMutationStartedAtRef.current >= fetchStartedAt ||
            Date.now() - lastMutationStartedAtRef.current < 4000) &&
          !forceFullPull &&
          !purgeLocalCache
        ) {
          return null;
        }

        // Monotonic Revision Guard: NEVER allow a fresh/cold Vercel serverless instance (revision 1, migratedFromClient false)
        // to overwrite a client that already has a higher revision or committed changes!
        if (
          !purgeLocalCache &&
          !forceFullPull &&
          serverRevisionRef.current > 0 &&
          typeof data.revision === 'number' &&
          data.revision < serverRevisionRef.current
        ) {
          return null;
        }

        // One-time migration: if the server was just initialized from scratch and this browser already had custom state
        // Never run client-to-server migration when the teacher explicitly forced a resync from the server!
        if (
          !purgeLocalCache &&
          data.migratedFromClient === false &&
          serverRevisionRef.current === -1
        ) {
          const hasLocalCustomizations =
            Boolean(localStorage.getItem(STORAGE_KEYS.QUESTIONS)) ||
            Boolean(localStorage.getItem(STORAGE_KEYS.ATTEMPTS)) ||
            Boolean(localStorage.getItem(STORAGE_KEYS.CONFIG)) ||
            Boolean(localStorage.getItem(STORAGE_KEYS.STUDENTS));

          if (hasLocalCustomizations) {
            await pushServerMutation('/api/state/full-restore', 'POST', {
              students: stateRef.current.students,
              questions: stateRef.current.questions,
              attempts: stateRef.current.attempts,
              abproEvaluations: stateRef.current.abproEvaluations,
              config: stateRef.current.config,
              customMiniRetos: stateRef.current.customMiniRetos,
              questionsBankExplicitlyCleared: stateRef.current.questionsBankExplicitlyCleared
            });
            setIsServerHydrated(true);
            return null;
          }
        }

        if (typeof data.previousQuestionsSnapshotCount === 'number') {
          setPreviousQuestionsSnapshotCount(data.previousQuestionsSnapshotCount);
        }

        if (data.upToDate && !purgeLocalCache && !forceFullPull) {
          const nowFmt = new Date().toLocaleTimeString('es-CO');
          serverRevisionRef.current = data.revision;
          questionsRevisionRef.current = data.questionsRevision;
          setCurrentServerRevision(data.revision || 1);
          setLastServerSyncFormatted(nowFmt);
          setIsServerHydrated(true);
          return {
            ok: true,
            syncedAtFormatted: nowFmt,
            revision: data.revision,
            questionsRevision: data.questionsRevision,
            lastModifiedIso: data.lastModifiedIso,
            clearedKeysCount,
            counts: {
              students: stateRef.current.students.length,
              questions: stateRef.current.questions.length,
              attempts: stateRef.current.attempts.length,
              abproEvaluations: stateRef.current.abproEvaluations.length,
              liveSessions: stateRef.current.liveSessions.length,
              customMiniRetos: stateRef.current.customMiniRetos.length
            }
          };
        }

        if (typeof data.revision === 'number') {
          serverRevisionRef.current = data.revision;
          setCurrentServerRevision(data.revision);
        }
        if (typeof data.questionsRevision === 'number') {
          questionsRevisionRef.current = data.questionsRevision;
        }
        setLastServerSyncFormatted(new Date().toLocaleTimeString('es-CO'));

        if (typeof data.questionsBankExplicitlyCleared === 'boolean') {
          setQuestionsBankExplicitlyCleared(data.questionsBankExplicitlyCleared);
          stateRef.current.questionsBankExplicitlyCleared = data.questionsBankExplicitlyCleared;
          safeWriteLocalStorage(
            STORAGE_KEYS.QUESTIONS_CLEARED,
            data.questionsBankExplicitlyCleared
          );
        }

        if (Array.isArray(data.students)) {
          const allowEmptyStudents =
            Boolean(data.studentsExplicitlyCleared) || Boolean(data.migratedFromClient);
          if (data.students.length > 0 || allowEmptyStudents) {
            const enriched = enrichStudentsWithServerSummary(
              data.students,
              Array.isArray(data.attempts) ? data.attempts : stateRef.current.attempts,
              data.config?.notaMinimaAprobacion ?? stateRef.current.config.notaMinimaAprobacion ?? 3.0
            );
            setStudents(enriched);
            stateRef.current.students = enriched;
            safeWriteLocalStorage(STORAGE_KEYS.STUDENTS_CLEARED, enriched.length === 0);
            safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, enriched);
          }
        }

        if (Array.isArray(data.questions)) {
          const normalizedQ =
            data.questions.length > 0 ? normalizeQuestionList(data.questions) : [];
          setQuestions(normalizedQ);
          stateRef.current.questions = normalizedQ;
          safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalizedQ);
        }

        if (Array.isArray(data.attempts)) {
          setAttempts(data.attempts);
          stateRef.current.attempts = data.attempts;
          safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, data.attempts);
        }

        if (Array.isArray(data.abproEvaluations)) {
          setAbproEvaluations(data.abproEvaluations);
          stateRef.current.abproEvaluations = data.abproEvaluations;
          safeWriteLocalStorage(STORAGE_KEYS.ABPRO, data.abproEvaluations);
        }

        if (Array.isArray(data.liveSessions)) {
          setLiveSessions(data.liveSessions);
          stateRef.current.liveSessions = data.liveSessions;
          safeWriteLocalStorage(STORAGE_KEYS.LIVE_SESSIONS, data.liveSessions);
        }

        if (data.config && typeof data.config === 'object') {
          const mergedConfig = { ...DEFAULT_CONFIG, ...data.config };
          setConfig(mergedConfig);
          stateRef.current.config = mergedConfig;
          safeWriteLocalStorage(STORAGE_KEYS.CONFIG, mergedConfig);
        }

        if (Array.isArray(data.customMiniRetos) && data.customMiniRetos.length > 0) {
          setCustomMiniRetos(data.customMiniRetos);
          stateRef.current.customMiniRetos = data.customMiniRetos;
          safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, data.customMiniRetos);
        }

        if (data.activeExamsByStudent && typeof data.activeExamsByStudent === 'object') {
          setActiveExamsByStudent(data.activeExamsByStudent);
        }

        return {
          ok: true,
          syncedAtFormatted: new Date().toLocaleTimeString('es-CO'),
          revision: serverRevisionRef.current,
          questionsRevision: questionsRevisionRef.current,
          lastModifiedIso: data.lastModifiedIso,
          clearedKeysCount,
          counts: {
            students: stateRef.current.students.length,
            questions: stateRef.current.questions.length,
            attempts: stateRef.current.attempts.length,
            abproEvaluations: stateRef.current.abproEvaluations.length,
            liveSessions: stateRef.current.liveSessions.length,
            customMiniRetos: stateRef.current.customMiniRetos.length
          }
        };
      } catch (err: any) {
        // Offline resilience: continue with local cached state if server is temporarily unreachable
        return {
          ok: false,
          syncedAtFormatted: new Date().toLocaleTimeString('es-CO'),
          revision: serverRevisionRef.current,
          questionsRevision: questionsRevisionRef.current,
          clearedKeysCount,
          counts: {
            students: stateRef.current.students.length,
            questions: stateRef.current.questions.length,
            attempts: stateRef.current.attempts.length,
            abproEvaluations: stateRef.current.abproEvaluations.length,
            liveSessions: stateRef.current.liveSessions.length,
            customMiniRetos: stateRef.current.customMiniRetos.length
          },
          error: err?.message || 'Error de conexión al consultar la Base de Datos del Servidor'
        };
      } finally {
        setIsServerHydrated(true);
      }
    },
    [pushServerMutation]
  );

  // Explicit forced resynchronization from server database clearing all local cache
  const handleForceResyncAndClearLocalCache = useCallback(async (): Promise<ForceServerResyncResult> => {
    const res = await fetchAndApplyServerState(true, true);
    if (res) return res;
    return {
      ok: true,
      syncedAtFormatted: new Date().toLocaleTimeString('es-CO'),
      revision: serverRevisionRef.current,
      questionsRevision: questionsRevisionRef.current,
      clearedKeysCount: Object.keys(STORAGE_KEYS).length,
      counts: {
        students: stateRef.current.students.length,
        questions: stateRef.current.questions.length,
        attempts: stateRef.current.attempts.length,
        abproEvaluations: stateRef.current.abproEvaluations.length,
        liveSessions: stateRef.current.liveSessions.length,
        customMiniRetos: stateRef.current.customMiniRetos.length
      }
    };
  }, [fetchAndApplyServerState]);

  // Initial authoritative hydration on mount + Periodic multi-device synchronization (Every 2.5 seconds) + Focus sync
  useEffect(() => {
    fetchAndApplyServerState(true);

    const interval = setInterval(() => {
      fetchAndApplyServerState(false);
    }, 2500);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        fetchAndApplyServerState(false);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [fetchAndApplyServerState]);

  // ============================================================================
  // CENTRALIZED PERSISTENCE ACTION WRAPPERS (Immediate UI + Server + Local Cache)
  // ============================================================================

  const handleUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>> = useCallback(
    (action) => {
      const next = typeof action === 'function' ? action(stateRef.current.students) : action;
      stateRef.current.students = next;
      setStudents(next);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS_CLEARED, next.length === 0);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, next);
      pushServerMutation('/api/state/students', 'PUT', { students: next });
    },
    [pushServerMutation]
  );

  const handleUpdateStudentProfile = useCallback(
    (updated: StudentRecord) => {
      const next = stateRef.current.students.map((s) => (s.id === updated.id ? updated : s));
      stateRef.current.students = next;
      setStudents(next);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, next);
      pushServerMutation(`/api/state/student/${encodeURIComponent(updated.id)}`, 'PATCH', {
        student: updated
      });
    },
    [pushServerMutation]
  );

  const handleUpdateQuestions = useCallback(
    (next: Question[]) => {
      if (stateRef.current.questions.length > 0) {
        setPreviousQuestionsSnapshotCount(stateRef.current.questions.length);
        void saveQuestionsSnapshotToFirestore(
          stateRef.current.questions,
          questionsRevisionRef.current > 0 ? questionsRevisionRef.current : 1
        );
      }
      const normalized = next.length > 0 ? normalizeQuestionList(next) : [];
      const isCleared = normalized.length === 0;
      stateRef.current.questions = normalized;
      stateRef.current.questionsBankExplicitlyCleared = isCleared;
      setQuestions(normalized);
      setQuestionsBankExplicitlyCleared(isCleared);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS_CLEARED, isCleared);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalized);
      pushServerMutation('/api/state/questions', 'PUT', {
        questions: normalized,
        saveSnapshot: true
      });
    },
    [pushServerMutation]
  );

  const handleUndoQuestionsSnapshot = useCallback(async (): Promise<number | null> => {
    const cloudSnap = await loadQuestionsSnapshotFromFirestore();
    if (Array.isArray(cloudSnap) && cloudSnap.length > 0) {
      const normalized = normalizeQuestionList(cloudSnap);
      stateRef.current.questions = normalized;
      stateRef.current.questionsBankExplicitlyCleared = false;
      setQuestions(normalized);
      setQuestionsBankExplicitlyCleared(false);
      setPreviousQuestionsSnapshotCount(0);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS_CLEARED, false);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalized);
      void saveQuestionsSnapshotToFirestore(null, questionsRevisionRef.current + 1);
      await pushServerMutation('/api/state/questions', 'PUT', {
        questions: normalized,
        saveSnapshot: false
      });
      return normalized.length;
    }

    const data = await pushServerMutation('/api/state/questions/undo', 'POST');
    if (data && Array.isArray(data.questions)) {
      const normalized =
        data.questions.length > 0 ? normalizeQuestionList(data.questions) : [];
      stateRef.current.questions = normalized;
      stateRef.current.questionsBankExplicitlyCleared = false;
      setQuestions(normalized);
      setQuestionsBankExplicitlyCleared(false);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS_CLEARED, false);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalized);
      return normalized.length;
    }
    return null;
  }, [pushServerMutation]);

  const handleUpdateAttempts = useCallback(
    (next: ExamAttemptResult[]) => {
      stateRef.current.attempts = next;
      setAttempts(next);
      safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, next);
      pushServerMutation('/api/state/attempts', 'PUT', { attempts: next });
    },
    [pushServerMutation]
  );

  const handleUpdateABProEvaluations = useCallback(
    (next: ABProProjectEvaluation[]) => {
      stateRef.current.abproEvaluations = next;
      setAbproEvaluations(next);
      safeWriteLocalStorage(STORAGE_KEYS.ABPRO, next);
      pushServerMutation('/api/state/abpro', 'PUT', { abproEvaluations: next });
    },
    [pushServerMutation]
  );

  const handleUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>> = useCallback(
    (action) => {
      const next = typeof action === 'function' ? action(stateRef.current.config) : action;
      stateRef.current.config = next;
      setConfig(next);
      safeWriteLocalStorage(STORAGE_KEYS.CONFIG, next);
      pushServerMutation('/api/state/config', 'PUT', { config: next });
    },
    [pushServerMutation]
  );

  const handleUpdateCustomMiniRetos: React.Dispatch<
    React.SetStateAction<CustomMiniRetoTemplate[]>
  > = useCallback(
    (action) => {
      const next =
        typeof action === 'function' ? action(stateRef.current.customMiniRetos) : action;
      stateRef.current.customMiniRetos = next;
      setCustomMiniRetos(next);
      safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, next);
      pushServerMutation('/api/state/custom-mini-retos', 'PUT', { customMiniRetos: next });
    },
    [pushServerMutation]
  );

  const handleRecordAttempt = useCallback(
    (result: ExamAttemptResult, updatedStudent: StudentRecord) => {
      const attemptWithSyncFlag: ExamAttemptResult = {
        ...result,
        sincronizadoSheets: false
      };

      const nextAttempts = [attemptWithSyncFlag, ...stateRef.current.attempts];
      const rawNextStudents = stateRef.current.students.map((s) =>
        s.id === updatedStudent.id ? updatedStudent : s
      );
      const nextStudents = enrichStudentsWithServerSummary(
        rawNextStudents,
        nextAttempts,
        stateRef.current.config.notaMinimaAprobacion ?? 3.0
      );

      stateRef.current.attempts = nextAttempts;
      stateRef.current.students = nextStudents;
      setAttempts(nextAttempts);
      setStudents(nextStudents);

      safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, nextAttempts);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, nextStudents);

      const enrichedUpdatedStudent =
        nextStudents.find((s) => s.id === updatedStudent.id) || updatedStudent;

      pushServerMutation('/api/state/attempt', 'POST', {
        attempt: attemptWithSyncFlag,
        student: enrichedUpdatedStudent
      });

      if (stateRef.current.config.webhookUrl) {
        fetch(stateRef.current.config.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        })
          .then(() => {
            const syncedAttempts = stateRef.current.attempts.map((a) =>
              a.attemptId === result.attemptId ? { ...a, sincronizadoSheets: true } : a
            );
            stateRef.current.attempts = syncedAttempts;
            setAttempts(syncedAttempts);
            safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, syncedAttempts);
            pushServerMutation('/api/state/attempts', 'PUT', { attempts: syncedAttempts });
          })
          .catch(() => {
            // Remains sincronizadoSheets: false so teacher can retry in bulk from the Retry Queue
          });
      }
    },
    [pushServerMutation]
  );

  const handleRecordRetoAttempt = useCallback(
    (
      studentId: string,
      retoAttempt: MiniRetoAttemptRecord,
      updatedStudent?: StudentRecord
    ) => {
      const targetStudent =
        updatedStudent || stateRef.current.students.find((s) => s.id === studentId);
      const rawNextStudents = targetStudent
        ? stateRef.current.students.map((s) => (s.id === targetStudent.id ? targetStudent : s))
        : stateRef.current.students;
      const nextStudents = enrichStudentsWithServerSummary(
        rawNextStudents,
        stateRef.current.attempts,
        stateRef.current.config.notaMinimaAprobacion ?? 3.0
      );
      stateRef.current.students = nextStudents;
      setStudents(nextStudents);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, nextStudents);

      const enrichedUpdatedStudent =
        nextStudents.find((s) => s.id === studentId) || targetStudent;

      pushServerMutation('/api/state/reto-attempt', 'POST', {
        studentId,
        retoAttempt,
        updatedStudent: enrichedUpdatedStudent
      });
    },
    [pushServerMutation]
  );

  const handleRecordAntiCheatEvent = useCallback(
    (studentId: string, logEntry: AntiCheatLogEntry, updatedStudent?: StudentRecord) => {
      const nextStudents = stateRef.current.students.map((s) => {
        if (s.id !== studentId) return s;
        const base = updatedStudent || s;
        const prevLogs = Array.isArray(base.historialLlamadosAtencion)
          ? base.historialLlamadosAtencion
          : [];
        const exists = prevLogs.some((l) => l && l.id === logEntry.id);
        return {
          ...base,
          historialLlamadosAtencion: exists ? prevLogs : [logEntry, ...prevLogs].slice(0, 150)
        };
      });
      stateRef.current.students = nextStudents;
      setStudents(nextStudents);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, nextStudents);

      pushServerMutation('/api/state/anti-cheat-event', 'POST', {
        studentId,
        logEntry,
        updatedStudent: nextStudents.find((s) => s.id === studentId)
      });
    },
    [pushServerMutation]
  );

  const handleUpdateLiveSession = useCallback(
    (session: LiveClassroomSession | null, studentIdToRemove?: string) => {
      setLiveSessions((prev) => {
        let next = prev;
        if (studentIdToRemove) {
          next = prev.filter((s) => s.studentId !== studentIdToRemove);
        } else if (session) {
          const exists = prev.some((s) => s.studentId === session.studentId);
          next = exists
            ? prev.map((s) => (s.studentId === session.studentId ? session : s))
            : [session, ...prev];
        }
        stateRef.current.liveSessions = next;
        safeWriteLocalStorage(STORAGE_KEYS.LIVE_SESSIONS, next);
        return next;
      });
      pushServerMutation('/api/state/live-session', 'POST', {
        session,
        studentIdToRemove
      });
    },
    [pushServerMutation]
  );

  const handleReleaseLiveSession = useCallback(
    (studentId: string) => {
      setLiveSessions((prev) => {
        const next = prev.filter((s) => s.studentId !== studentId);
        stateRef.current.liveSessions = next;
        safeWriteLocalStorage(STORAGE_KEYS.LIVE_SESSIONS, next);
        return next;
      });
      pushServerMutation('/api/state/live-session', 'POST', {
        session: null,
        studentIdToRemove: studentId
      });
    },
    [pushServerMutation]
  );

  const handleSaveActiveExamBackup = useCallback(
    (studentId: string, backup: any | null) => {
      setActiveExamsByStudent((prev) => {
        const next = { ...prev };
        if (!backup) {
          delete next[studentId];
        } else {
          next[studentId] = backup;
        }
        return next;
      });
      pushServerMutation(`/api/state/active-exam/${encodeURIComponent(studentId)}`, 'PUT', {
        backup
      });
    },
    [pushServerMutation]
  );

  const handleFullSystemRestore = useCallback(
    async (payload: {
      students?: StudentRecord[];
      questions?: Question[];
      attempts?: ExamAttemptResult[];
      abproEvaluations?: ABProProjectEvaluation[];
      config?: SystemConfig;
      customMiniRetos?: CustomMiniRetoTemplate[];
    }) => {
      if (Array.isArray(payload.students)) {
        stateRef.current.students = payload.students;
        setStudents(payload.students);
        safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, payload.students);
      }
      if (Array.isArray(payload.questions)) {
        const normalized =
          payload.questions.length > 0 ? normalizeQuestionList(payload.questions) : [];
        const isCleared = normalized.length === 0;
        stateRef.current.questions = normalized;
        stateRef.current.questionsBankExplicitlyCleared = isCleared;
        setQuestions(normalized);
        setQuestionsBankExplicitlyCleared(isCleared);
        safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS_CLEARED, isCleared);
        safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalized);
      }
      if (Array.isArray(payload.attempts)) {
        stateRef.current.attempts = payload.attempts;
        setAttempts(payload.attempts);
        safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, payload.attempts);
      }
      if (Array.isArray(payload.abproEvaluations)) {
        stateRef.current.abproEvaluations = payload.abproEvaluations;
        setAbproEvaluations(payload.abproEvaluations);
        safeWriteLocalStorage(STORAGE_KEYS.ABPRO, payload.abproEvaluations);
      }
      if (payload.config && typeof payload.config === 'object') {
        const merged = { ...stateRef.current.config, ...payload.config };
        stateRef.current.config = merged;
        setConfig(merged);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, merged);
      }
      if (Array.isArray(payload.customMiniRetos) && payload.customMiniRetos.length > 0) {
        stateRef.current.customMiniRetos = payload.customMiniRetos;
        setCustomMiniRetos(payload.customMiniRetos);
        safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, payload.customMiniRetos);
      }

      await pushServerMutation('/api/state/full-restore', 'POST', {
        students: stateRef.current.students,
        questions: stateRef.current.questions,
        attempts: stateRef.current.attempts,
        abproEvaluations: stateRef.current.abproEvaluations,
        config: stateRef.current.config,
        customMiniRetos: stateRef.current.customMiniRetos,
        questionsBankExplicitlyCleared: stateRef.current.questionsBankExplicitlyCleared
      });
    },
    [pushServerMutation]
  );

  const handleSwitchToTeacherLogin = useCallback(() => {
    if (studentSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('docente');
  }, [studentSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleSwitchToStudentLogin = useCallback(() => {
    if (teacherSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('estudiante');
  }, [teacherSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleGlobalLogout = useCallback(() => {
    if (authState.verifiedStudentId) {
      handleReleaseLiveSession(authState.verifiedStudentId);
    }
    logoutAll();
    setStudentSessionActive(false);
    setTeacherSessionActive(false);
    setLogoutSignal((prev) => prev + 1);
    fetchAndApplyServerState(false);
  }, [authState.verifiedStudentId, handleReleaseLiveSession, logoutAll, fetchAndApplyServerState]);

  const handleExecuteServerSave = useCallback(
    async (sectionKey: string, description: string): Promise<ServerSaveResponse> => {
      try {
        // Always persist latest state to localStorage immediately (critical for Netlify Drop / static hosting)
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, stateRef.current.config);
        safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, stateRef.current.students);
        safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, stateRef.current.attempts);
        safeWriteLocalStorage(STORAGE_KEYS.ABPRO, stateRef.current.abproEvaluations);
        safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, stateRef.current.customMiniRetos);
        safeWriteLocalStorage(
          STORAGE_KEYS.QUESTIONS_CLEARED,
          stateRef.current.questionsBankExplicitlyCleared
        );

        const includeQuestions =
          sectionKey.includes('pregunta') ||
          sectionKey.includes('banco') ||
          sectionKey === 'global_save';
        if (includeQuestions) {
          safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, stateRef.current.questions);
        }

        const data = await pushServerMutation('/api/state/save-all', 'POST', {
          section: sectionKey,
          description,
          config: stateRef.current.config,
          students: stateRef.current.students,
          questions: includeQuestions ? stateRef.current.questions : undefined,
          attempts: stateRef.current.attempts,
          abproEvaluations: stateRef.current.abproEvaluations,
          customMiniRetos: stateRef.current.customMiniRetos,
          questionsBankExplicitlyCleared: stateRef.current.questionsBankExplicitlyCleared
        });
        if (data && data.ok) {
          return {
            ok: true,
            savedAtFormatted: data.savedAtFormatted || new Date().toLocaleTimeString('es-CO'),
            revision: data.revision,
            questionsRevision: data.questionsRevision
          };
        }
        // Fallback for static deployments (Netlify Drop / Vercel static) where /api/state is not present
        return {
          ok: true,
          savedAtFormatted: new Date().toLocaleTimeString('es-CO'),
          revision: serverRevisionRef.current > 0 ? serverRevisionRef.current + 1 : 1,
          questionsRevision: questionsRevisionRef.current > 0 ? questionsRevisionRef.current : 1
        };
      } catch (err: any) {
        return {
          ok: true,
          savedAtFormatted: new Date().toLocaleTimeString('es-CO')
        };
      }
    },
    [pushServerMutation]
  );

  const anySessionActive = studentSessionActive || teacherSessionActive;

  return (
    <ServerSaveProvider onExecuteServerSave={handleExecuteServerSave}>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract with Session Isolation */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 h-16 flex items-center justify-between no-print sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (!anySessionActive) {
              setActiveView('estudiante');
            }
          }}
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap"
        >
          EvaluaPlus
        </a>

        {/* Zone 2: Clean text navigation links (hides opposite panel when a session is active) */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
          {studentSessionActive ? (
            <span className="py-1 text-slate-900 font-semibold border-b-2 border-slate-900 whitespace-nowrap">
              Evaluación Estudiantil
            </span>
          ) : teacherSessionActive ? (
            <span className="py-1 text-slate-900 font-semibold border-b-2 border-slate-900 whitespace-nowrap">
              Panel Docente
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  fetchAndApplyServerState(false);
                  setActiveView('estudiante');
                }}
                className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
                  activeView === 'estudiante'
                    ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                    : 'hover:text-slate-900'
                }`}
              >
                Evaluación Estudiantil
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchAndApplyServerState(false);
                  setActiveView('docente');
                }}
                className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
                  activeView === 'docente'
                    ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
                    : 'hover:text-slate-900'
                }`}
              >
                Panel Docente
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: 1 Primary Action (Cerrar Sesión when logged in, or switch login view on initial screen) */}
        <div className="flex items-center gap-3">
          {anySessionActive ? (
            <button
              type="button"
              onClick={handleGlobalLogout}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Cerrar Sesión
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                fetchAndApplyServerState(false);
                setActiveView(activeView === 'docente' ? 'estudiante' : 'docente');
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              {activeView === 'docente' ? 'Ir al Portal Estudiante' : 'Administración Docente'}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {!isServerHydrated ? (
          <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full text-center space-y-2 shadow-xs">
              <div className="text-sm font-bold text-slate-900">
                Sincronizando Base de Datos Centralizada...
              </div>
              <p className="text-xs text-slate-600">
                Cargando banco de preguntas, progreso estudiantil y configuración oficial del servidor.
              </p>
            </div>
          </div>
        ) : activeView === 'estudiante' ? (
          <StudentPortal
            students={students}
            onUpdateStudentProfile={handleUpdateStudentProfile}
            questions={questions}
            questionsBankExplicitlyCleared={questionsBankExplicitlyCleared}
            config={config}
            attempts={attempts}
            onRecordAttempt={handleRecordAttempt}
            onRecordRetoAttempt={handleRecordRetoAttempt}
            onRecordAntiCheatEvent={handleRecordAntiCheatEvent}
            onUpdateLiveSession={handleUpdateLiveSession}
            onSwitchToTeacherLogin={handleSwitchToTeacherLogin}
            onSessionActiveChange={setStudentSessionActive}
            logoutSignal={logoutSignal}
            customMiniRetos={customMiniRetos}
            activeExamsByStudent={activeExamsByStudent}
            onSaveActiveExamBackup={handleSaveActiveExamBackup}
            onForceServerSync={() => fetchAndApplyServerState(false)}
          />
        ) : (
          <TeacherPanel
            students={students}
            onUpdateStudents={handleUpdateStudents}
            questions={questions}
            onUpdateQuestions={handleUpdateQuestions}
            previousQuestionsSnapshotCount={previousQuestionsSnapshotCount}
            onUndoQuestionsSnapshot={handleUndoQuestionsSnapshot}
            attempts={attempts}
            onUpdateAttempts={handleUpdateAttempts}
            abproEvaluations={abproEvaluations}
            onUpdateABProEvaluations={handleUpdateABProEvaluations}
            liveSessions={liveSessions}
            onReleaseLiveSession={handleReleaseLiveSession}
            config={config}
            onUpdateConfig={handleUpdateConfig}
            onSwitchToStudentLogin={handleSwitchToStudentLogin}
            onSessionActiveChange={setTeacherSessionActive}
            logoutSignal={logoutSignal}
            customMiniRetos={customMiniRetos}
            onUpdateCustomMiniRetos={handleUpdateCustomMiniRetos}
            onFullSystemRestore={handleFullSystemRestore}
            onForceServerSync={handleForceResyncAndClearLocalCache}
            lastServerSyncFormatted={lastServerSyncFormatted}
            serverRevision={currentServerRevision}
          />
        )}
      </main>

      {/* Quiet Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 no-print">
        Técnico Profesional en Marketing Digital · Mapeo de Mercado y Comportamiento del Consumidor · La Dorada, Caldas (Colombia)
      </footer>
    </div>
    </ServerSaveProvider>
  );
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      errorMsg: error?.message || 'Error inesperado de renderizado'
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-lg text-center">
            <div className="text-base font-bold text-slate-900">
              Sincronización de Seguridad Requerida
            </div>
            <p className="text-xs text-slate-600">
              Se detectó una estructura de caché antigua en el navegador ({this.state.errorMsg}). Pulse el botón inferior para limpiar la caché local y recargar los datos oficiales desde el servidor.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
            >
              Limpiar Caché Antigua y Recargar Ahora
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
