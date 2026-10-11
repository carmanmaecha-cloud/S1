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
import { EditorPanel } from './components/EditorPanel';
import { ServerSaveProvider, ServerSaveResponse } from './components/ServerSaveContext';
import { AuthProvider, useAuthSession } from './context/AuthContext';
import { GraduationCap, BookOpen, Sliders, ArrowRight } from 'lucide-react';
import {
  saveCentralStateToFirestore,
  loadCentralStateFromFirestore,
  saveQuestionsSnapshotToFirestore,
  loadQuestionsSnapshotFromFirestore
} from './utils/cloudPersistence';
import {
  AcademicDataset,
  buildInitialAcademicDataset,
  normalizeAndSyncAcademicDataset
} from './data/classAttendanceAndGrades';
import { getEffectiveCourseMetadata } from './utils/universalCourseEngine';
import {
  CURRENT_DATA_SCHEMA_VERSION,
  SchemaValidationReport,
  validateLocalCacheSchema,
  recordApiRequestDiagnostic,
  recordCacheDiagnosticError,
  stampCurrentSchemaVersion
} from './utils/systemDiagnostics';

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
  ACADEMIC_DATASET: 'evaluaplus_academic_class_dataset_v1',
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
  const [editorSessionActive, setEditorSessionActive] = useState<boolean>(
    Boolean(authState.editorSessionActive)
  );
  const [logoutSignal, setLogoutSignal] = useState(0);

  // Startup Data Schema Version Verification (Silent auto-sync without intrusive banner)
  const [startupSchemaReport, setStartupSchemaReport] = useState<SchemaValidationReport>(() =>
    validateLocalCacheSchema({ recordIssuesToLog: true })
  );

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

  // Persistent State: Students (Starts empty until configured by Editor / Teacher)
  const [students, setStudents] = useState<StudentRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((s: any) => s && typeof s === 'object' && s.id && s.nombre)
            .map((s: any) => ({
              ...s,
              id: String(s.id),
              nombre: String(s.nombre),
              codigoAcceso: String(s.codigoAcceso || ''),
              intentosUsados: typeof s.intentosUsados === 'number' ? s.intentosUsados : 0,
              suspendido: Boolean(s.suspendido),
              conceptoInfraccion: s.conceptoInfraccion || '✓ Sin infracciones'
            }));
        }
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Persistent State: Questions Bank (Starts empty until configured by Editor / Teacher)
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.length > 0 ? normalizeQuestionList(parsed) : [];
        }
      }
    } catch {
      // fallback
    }
    return [];
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
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Persistent State: Academic Dataset (Classes 1 to 6 Grades & Attendance Blocks B1/B2 — strictly fed by the single `students` bank)
  const [academicDataset, setAcademicDataset] = useState<AcademicDataset>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACADEMIC_DATASET);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return normalizeAndSyncAcademicDataset(parsed, students);
        }
      }
    } catch {
      // fallback
    }
    return buildInitialAcademicDataset(students);
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
    academicDataset,
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
      academicDataset,
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
    academicDataset,
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
      const reqStartMs = performance.now();

      try {
        // 1. Primary: send mutation to Express /api/state endpoint (which persists to disk + cloud shards that changed)
        const res = await fetch(endpoint, {
          method,
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: payload !== undefined ? JSON.stringify(payload) : undefined
        });
        const latencyMs = Math.max(1, Math.round(performance.now() - reqStartMs));

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
          recordApiRequestDiagnostic({
            method,
            endpoint,
            status: res.status,
            ok: true,
            latencyMs,
            source: 'express_api',
            revision: serverRevisionRef.current
          });
          return {
            ...data,
            ok: true,
            revision: serverRevisionRef.current,
            questionsRevision: questionsRevisionRef.current
          };
        }

        recordApiRequestDiagnostic({
          method,
          endpoint,
          status: res.status,
          ok: false,
          latencyMs,
          source: 'express_api',
          revision: serverRevisionRef.current,
          errorMessage: `HTTP ${res.status}`
        });

        // 2. Fallback: write directly to Cloud Firestore only if the API endpoint could not be reached
        const fbStartMs = performance.now();
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
            academicDataset: stateRef.current.academicDataset,
            activeExamsByStudent: {}
          },
          { includeQuestions: isQuestionsMutation }
        );
        recordApiRequestDiagnostic({
          method,
          endpoint: `${endpoint} (Firestore Fallback)`,
          status: 200,
          ok: true,
          latencyMs: Math.max(1, Math.round(performance.now() - fbStartMs)),
          source: 'firestore_fallback',
          revision: serverRevisionRef.current
        });

        return {
          ok: true,
          revision: serverRevisionRef.current,
          questionsRevision: questionsRevisionRef.current,
          lastModifiedIso: nowIso
        };
      } catch (err: any) {
        const latencyMs = Math.max(1, Math.round(performance.now() - reqStartMs));
        recordApiRequestDiagnostic({
          method,
          endpoint,
          status: null,
          ok: false,
          latencyMs,
          source: 'network_error',
          revision: serverRevisionRef.current,
          errorMessage: err?.message || 'Error de red'
        });
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

        // 1. Query Express /api/state first (fast in-memory + disk persistence without burning Firestore read quota)
        let data: any = null;
        const apiStartPerf = performance.now();
        try {
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
          const apiLatencyMs = Math.max(1, Math.round(performance.now() - apiStartPerf));
          if (res.ok) {
            data = await res.json();
            recordApiRequestDiagnostic({
              method: 'GET',
              endpoint: forceFullPull ? '/api/state?force=true' : '/api/state',
              status: res.status,
              ok: true,
              latencyMs: apiLatencyMs,
              source: 'express_api',
              revision: typeof data?.revision === 'number' ? data.revision : serverRevisionRef.current
            });
          } else {
            recordApiRequestDiagnostic({
              method: 'GET',
              endpoint: '/api/state',
              status: res.status,
              ok: false,
              latencyMs: apiLatencyMs,
              source: 'express_api',
              errorMessage: `HTTP ${res.status}`
            });
          }
        } catch (apiErr: any) {
          const apiLatencyMs = Math.max(1, Math.round(performance.now() - apiStartPerf));
          recordApiRequestDiagnostic({
            method: 'GET',
            endpoint: '/api/state',
            status: null,
            ok: false,
            latencyMs: apiLatencyMs,
            source: 'network_error',
            errorMessage: apiErr?.message || 'API no disponible'
          });
          // fallback to Firestore below if API is unreachable
        }

        // 2. Fallback to Cloud Firestore only if /api/state was unreachable or uninitialized cold start
        if (!data || (data.migratedFromClient === false && (data.revision || 1) <= 1 && forceFullPull)) {
          try {
            const cloudData = await loadCentralStateFromFirestore({
              includeQuestions: forceFullPull || purgeLocalCache || qRev <= 0
            });
            if (
              cloudData &&
              typeof cloudData === 'object' &&
              (!data || cloudData.revision >= (data.revision || 0))
            ) {
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
            // ignore Firestore fallback errors
          }
        }

        if (!data) {
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
            error: 'No fue posible conectar con el servidor central'
          };
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

        if (data.config && typeof data.config === 'object') {
          const mergedConfig = { ...DEFAULT_CONFIG, ...data.config };
          setConfig(mergedConfig);
          stateRef.current.config = mergedConfig;
          safeWriteLocalStorage(STORAGE_KEYS.CONFIG, mergedConfig);
        }

        if (Array.isArray(data.students)) {
          const enriched = enrichStudentsWithServerSummary(
            data.students,
            Array.isArray(data.attempts) ? data.attempts : stateRef.current.attempts,
            stateRef.current.config
          );
          setStudents(enriched);
          stateRef.current.students = enriched;
          safeWriteLocalStorage(STORAGE_KEYS.STUDENTS_CLEARED, enriched.length === 0);
          safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, enriched);
        } else if (stateRef.current.students.length > 0) {
          const reEnriched = enrichStudentsWithServerSummary(
            stateRef.current.students,
            Array.isArray(data.attempts) ? data.attempts : stateRef.current.attempts,
            stateRef.current.config
          );
          setStudents(reEnriched);
          stateRef.current.students = reEnriched;
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

        if (Array.isArray(data.customMiniRetos)) {
          setCustomMiniRetos(data.customMiniRetos);
          stateRef.current.customMiniRetos = data.customMiniRetos;
          safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, data.customMiniRetos);
        }

        if (data.activeExamsByStudent && typeof data.activeExamsByStudent === 'object') {
          setActiveExamsByStudent(data.activeExamsByStudent);
        }

        const effectiveMeta = getEffectiveCourseMetadata(stateRef.current.config);
        const sourceAcademic =
          data.academicDataset && typeof data.academicDataset === 'object'
            ? data.academicDataset
            : stateRef.current.academicDataset;
        const syncedAcademic = normalizeAndSyncAcademicDataset(
          sourceAcademic,
          stateRef.current.students,
          effectiveMeta.modulosCurso,
          effectiveMeta.nombreCurso
        );
        setAcademicDataset(syncedAcademic);
        stateRef.current.academicDataset = syncedAcademic;
        safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);

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
    stampCurrentSchemaVersion();
    setStartupSchemaReport(validateLocalCacheSchema({ recordIssuesToLog: false }));
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

  // Automatic synchronization whenever entering Student Portal or Teacher Panel (or if local cache schema is outdated)
  useEffect(() => {
    const currentSchema = validateLocalCacheSchema({ recordIssuesToLog: false });
    if (currentSchema.requiresPreventiveClean || startupSchemaReport.requiresPreventiveClean) {
      void handleForceResyncAndClearLocalCache();
    } else {
      stampCurrentSchemaVersion();
      void fetchAndApplyServerState(true);
    }
  }, [
    activeView,
    studentSessionActive,
    teacherSessionActive,
    startupSchemaReport.requiresPreventiveClean,
    handleForceResyncAndClearLocalCache,
    fetchAndApplyServerState
  ]);

  // Initial authoritative hydration on mount + Periodic multi-device synchronization + Focus & Storage & BroadcastChannel sync
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAndApplyServerState(false);
    }, 2500);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        fetchAndApplyServerState(false);
      }
    };

    const applyRealtimeAcademicDataset = (incoming: unknown) => {
      if (!incoming || typeof incoming !== 'object') return;
      try {
        const meta = getEffectiveCourseMetadata(stateRef.current.config);
        const synced = normalizeAndSyncAcademicDataset(
          incoming as AcademicDataset,
          stateRef.current.students,
          meta.modulosCurso,
          meta.nombreCurso
        );
        stateRef.current.academicDataset = synced;
        setAcademicDataset(synced);
        safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, synced);
      } catch {
        // ignore
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === STORAGE_KEYS.ACADEMIC_DATASET && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          applyRealtimeAcademicDataset(parsed);
        } catch {
          // ignore
        }
      } else if (e.key === STORAGE_KEYS.STUDENTS || e.key === STORAGE_KEYS.ATTEMPTS) {
        fetchAndApplyServerState(false);
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('evaluaplus_realtime_sync_v1');
        bc.onmessage = (event) => {
          const msg = event?.data;
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'ACADEMIC_DATASET_UPDATED' && msg.academicDataset) {
            applyRealtimeAcademicDataset(msg.academicDataset);
          } else if (msg.type === 'FORCE_PULL') {
            fetchAndApplyServerState(false);
          }
        };
      } catch {
        bc = null;
      }
    }

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageChange);
      if (bc) {
        try {
          bc.close();
        } catch {
          // ignore
        }
      }
    };
  }, [fetchAndApplyServerState]);

  // ============================================================================
  // CENTRALIZED PERSISTENCE ACTION WRAPPERS (Immediate UI + Server + Local Cache)
  // ============================================================================

  const syncStudentsIntoActiveCourseConfig = useCallback(
    (nextStudents: StudentRecord[], baseConfig: SystemConfig): SystemConfig => {
      if (!Array.isArray(baseConfig.universalCoursesCatalog) || baseConfig.universalCoursesCatalog.length === 0) {
        return baseConfig;
      }
      const targetCourseId =
        baseConfig.activeCourseId || baseConfig.universalCoursesCatalog[0]?.meta?.courseId;
      if (!targetCourseId) return baseConfig;

      const updatedCatalog = baseConfig.universalCoursesCatalog.map((c) =>
        c.meta?.courseId === targetCourseId
          ? {
              ...c,
              students: nextStudents,
              updatedAtIso: new Date().toISOString()
            }
          : c
      );
      return {
        ...baseConfig,
        universalCoursesCatalog: updatedCatalog
      };
    },
    []
  );

  const handleUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>> = useCallback(
    (action) => {
      const rawNext = typeof action === 'function' ? action(stateRef.current.students) : action;
      const next = enrichStudentsWithServerSummary(
        rawNext,
        stateRef.current.attempts,
        stateRef.current.config
      );
      stateRef.current.students = next;
      setStudents(next);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS_CLEARED, next.length === 0);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, next);

      // Keep active course in universalCoursesCatalog synchronized with Control de Estudiantes
      const syncedConfig = syncStudentsIntoActiveCourseConfig(next, stateRef.current.config);
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      // Keep Clases y Asistencia (academicDataset) strictly synchronized with the single students bank & active course modules
      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        stateRef.current.academicDataset,
        next,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);

      pushServerMutation('/api/state/students', 'PUT', { students: next });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
  );

  const handleUpdateStudentProfile = useCallback(
    (updated: StudentRecord) => {
      const rawNext = stateRef.current.students.map((s) => (s.id === updated.id ? updated : s));
      const next = enrichStudentsWithServerSummary(
        rawNext,
        stateRef.current.attempts,
        stateRef.current.config
      );
      stateRef.current.students = next;
      setStudents(next);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, next);

      // Keep active course in universalCoursesCatalog synchronized with Control de Estudiantes
      const syncedConfig = syncStudentsIntoActiveCourseConfig(next, stateRef.current.config);
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
      }

      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        stateRef.current.academicDataset,
        next,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);

      const enrichedUpdated = next.find((s) => s.id === updated.id) || updated;
      pushServerMutation(`/api/state/student/${encodeURIComponent(updated.id)}`, 'PATCH', {
        student: enrichedUpdated
      });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
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
      const reEnriched = enrichStudentsWithServerSummary(
        stateRef.current.students,
        next,
        stateRef.current.config
      );
      stateRef.current.students = reEnriched;
      setStudents(reEnriched);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, reEnriched);
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

      // Re-enrich students & re-sync academicDataset immediately with the updated course metadata
      const reEnrichedStudents = enrichStudentsWithServerSummary(
        stateRef.current.students,
        stateRef.current.attempts,
        next
      );
      stateRef.current.students = reEnrichedStudents;
      setStudents(reEnrichedStudents);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, reEnrichedStudents);

      const meta = getEffectiveCourseMetadata(next);
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        stateRef.current.academicDataset,
        reEnrichedStudents,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);

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
        stateRef.current.config
      );

      stateRef.current.attempts = nextAttempts;
      stateRef.current.students = nextStudents;
      setAttempts(nextAttempts);
      setStudents(nextStudents);

      safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, nextAttempts);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, nextStudents);

      const syncedConfig = syncStudentsIntoActiveCourseConfig(nextStudents, stateRef.current.config);
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
      }

      // Synchronize exam grade into Clases y Asistencia (academicDataset) immediately
      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        stateRef.current.academicDataset,
        nextStudents,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);
      pushServerMutation('/api/academic-dataset/update', 'POST', {
        academicDataset: syncedAcademic
      });

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
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
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
        stateRef.current.config
      );
      stateRef.current.students = nextStudents;
      setStudents(nextStudents);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, nextStudents);

      const syncedConfig = syncStudentsIntoActiveCourseConfig(nextStudents, stateRef.current.config);
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
      }

      // Synchronize mini-reto grade into Clases y Asistencia (academicDataset) immediately
      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        stateRef.current.academicDataset,
        nextStudents,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);
      pushServerMutation('/api/academic-dataset/update', 'POST', {
        academicDataset: syncedAcademic
      });

      const enrichedUpdatedStudent =
        nextStudents.find((s) => s.id === studentId) || targetStudent;

      pushServerMutation('/api/state/reto-attempt', 'POST', {
        studentId,
        retoAttempt,
        updatedStudent: enrichedUpdatedStudent
      });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
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

  const handleUpdateAcademicDataset = useCallback(
    (
      nextDataset: AcademicDataset,
      options?: {
        syncNewStudentToRoster?: StudentRecord;
        removeStudentFromRosterId?: string;
      }
    ) => {
      let currentRoster = stateRef.current.students;
      let rosterMutated = false;
      if (options?.syncNewStudentToRoster) {
        const newSt = options.syncNewStudentToRoster;
        if (!currentRoster.some((s) => s.id === newSt.id)) {
          currentRoster = enrichStudentsWithServerSummary(
            [newSt, ...currentRoster],
            stateRef.current.attempts,
            stateRef.current.config
          );
          rosterMutated = true;
        }
      }
      if (options?.removeStudentFromRosterId) {
        currentRoster = currentRoster.filter((s) => s.id !== options.removeStudentFromRosterId);
        rosterMutated = true;
      }

      if (rosterMutated) {
        stateRef.current.students = currentRoster;
        setStudents(currentRoster);
        safeWriteLocalStorage(STORAGE_KEYS.STUDENTS_CLEARED, currentRoster.length === 0);
        safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, currentRoster);
        const syncedConfig = syncStudentsIntoActiveCourseConfig(
          currentRoster,
          stateRef.current.config
        );
        if (syncedConfig !== stateRef.current.config) {
          stateRef.current.config = syncedConfig;
          setConfig(syncedConfig);
          safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        }
        pushServerMutation('/api/state/students', 'PUT', { students: currentRoster });
      }

      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const normalized = normalizeAndSyncAcademicDataset(
        nextDataset,
        currentRoster,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = normalized;
      setAcademicDataset(normalized);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, normalized);
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('evaluaplus_realtime_sync_v1');
          bc.postMessage({
            type: 'ACADEMIC_DATASET_UPDATED',
            academicDataset: normalized,
            timestamp: Date.now()
          });
          bc.close();
        } catch {
          // ignore
        }
      }
      void pushServerMutation('/api/academic-dataset/update', 'POST', {
        academicDataset: normalized
      });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
  );

  const handleFullSystemRestore = useCallback(
    async (payload: {
      students?: StudentRecord[];
      questions?: Question[];
      attempts?: ExamAttemptResult[];
      abproEvaluations?: ABProProjectEvaluation[];
      config?: SystemConfig;
      customMiniRetos?: CustomMiniRetoTemplate[];
      academicDataset?: AcademicDataset;
    }) => {
      if (payload.config && typeof payload.config === 'object') {
        const merged = { ...stateRef.current.config, ...payload.config };
        stateRef.current.config = merged;
        setConfig(merged);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, merged);
      }
      if (Array.isArray(payload.attempts)) {
        stateRef.current.attempts = payload.attempts;
        setAttempts(payload.attempts);
        safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, payload.attempts);
      }
      if (Array.isArray(payload.students)) {
        const enriched = enrichStudentsWithServerSummary(
          payload.students,
          stateRef.current.attempts,
          stateRef.current.config
        );
        stateRef.current.students = enriched;
        setStudents(enriched);
        safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, enriched);
        const syncedCfg = syncStudentsIntoActiveCourseConfig(enriched, stateRef.current.config);
        if (syncedCfg !== stateRef.current.config) {
          stateRef.current.config = syncedCfg;
          setConfig(syncedCfg);
          safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedCfg);
        }
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
      if (Array.isArray(payload.abproEvaluations)) {
        stateRef.current.abproEvaluations = payload.abproEvaluations;
        setAbproEvaluations(payload.abproEvaluations);
        safeWriteLocalStorage(STORAGE_KEYS.ABPRO, payload.abproEvaluations);
      }
      if (Array.isArray(payload.customMiniRetos)) {
        stateRef.current.customMiniRetos = payload.customMiniRetos;
        setCustomMiniRetos(payload.customMiniRetos);
        safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, payload.customMiniRetos);
      }
      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const baseAcademic =
        payload.academicDataset && typeof payload.academicDataset === 'object'
          ? payload.academicDataset
          : stateRef.current.academicDataset;
      const syncedAcademic = normalizeAndSyncAcademicDataset(
        baseAcademic,
        stateRef.current.students,
        meta.modulosCurso,
        meta.nombreCurso
      );
      stateRef.current.academicDataset = syncedAcademic;
      setAcademicDataset(syncedAcademic);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);

      await pushServerMutation('/api/state/full-restore', 'POST', {
        students: stateRef.current.students,
        questions: stateRef.current.questions,
        attempts: stateRef.current.attempts,
        abproEvaluations: stateRef.current.abproEvaluations,
        config: stateRef.current.config,
        customMiniRetos: stateRef.current.customMiniRetos,
        academicDataset: stateRef.current.academicDataset,
        questionsBankExplicitlyCleared: stateRef.current.questionsBankExplicitlyCleared
      });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig]
  );

  const handleSwitchToTeacherLogin = useCallback(() => {
    if (studentSessionActive || editorSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('docente');
  }, [studentSessionActive, editorSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleSwitchToStudentLogin = useCallback(() => {
    if (teacherSessionActive || editorSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('estudiante');
  }, [teacherSessionActive, editorSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleSwitchToEditorLogin = useCallback(() => {
    if (studentSessionActive || teacherSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('editor');
  }, [studentSessionActive, teacherSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleGoToInitialHome = useCallback(() => {
    if (studentSessionActive || teacherSessionActive || editorSessionActive) return;
    fetchAndApplyServerState(false);
    setActiveView('inicio');
  }, [studentSessionActive, teacherSessionActive, editorSessionActive, fetchAndApplyServerState, setActiveView]);

  const handleGlobalLogout = useCallback(() => {
    if (authState.verifiedStudentId) {
      handleReleaseLiveSession(authState.verifiedStudentId);
    }
    logoutAll();
    setStudentSessionActive(false);
    setTeacherSessionActive(false);
    setEditorSessionActive(false);
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
        safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, stateRef.current.academicDataset);
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
          academicDataset: stateRef.current.academicDataset,
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

  const anySessionActive =
    studentSessionActive ||
    teacherSessionActive ||
    editorSessionActive ||
    Boolean(authState.editorSessionActive);
  const activeCourseMeta = getEffectiveCourseMetadata(config);

  return (
    <ServerSaveProvider onExecuteServerSave={handleExecuteServerSave}>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Main Content Area (Top Header Block Removed) */}
        <main className="flex-1 flex flex-col">
          {!isServerHydrated ? (
            <div className="min-h-screen flex items-center justify-center px-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full text-center space-y-2 shadow-xs">
                <div className="text-sm font-bold text-slate-900">
                  Sincronizando Base de Datos Centralizada...
                </div>
                <p className="text-xs text-slate-600">
                  Cargando estado oficial del servidor.
                </p>
              </div>
            </div>
          ) : activeView === 'inicio' && !anySessionActive ? (
            <div className="min-h-screen flex items-center justify-center px-4 py-12">
              <div className="max-w-5xl w-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Tarjeta Interactiva 1: Estudiante */}
                  <button
                    type="button"
                    onClick={handleSwitchToStudentLogin}
                    className="group text-left bg-white hover:bg-sky-50/40 border-2 border-slate-200 hover:border-sky-600 rounded-2xl p-8 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-8 cursor-pointer"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white flex items-center justify-center transition-colors">
                        <GraduationCap className="w-7 h-7" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                        Estudiante
                      </h2>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-700">
                      <span>Iniciar sesión</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>

                  {/* Tarjeta Interactiva 2: Docente */}
                  <button
                    type="button"
                    onClick={handleSwitchToTeacherLogin}
                    className="group text-left bg-white hover:bg-slate-900/5 border-2 border-slate-200 hover:border-slate-900 rounded-2xl p-8 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-8 cursor-pointer"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white flex items-center justify-center transition-colors">
                        <BookOpen className="w-7 h-7" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">
                        Docente
                      </h2>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900">
                      <span>Iniciar sesión</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>

                  {/* Tarjeta Interactiva 3: Editor */}
                  <button
                    type="button"
                    onClick={handleSwitchToEditorLogin}
                    className="group text-left bg-white hover:bg-indigo-50/40 border-2 border-slate-200 hover:border-indigo-600 rounded-2xl p-8 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-8 cursor-pointer"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors">
                        <Sliders className="w-7 h-7" />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                        Editor
                      </h2>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-700">
                      <span>Iniciar sesión</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                </div>
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
              onSwitchToEditorLogin={handleSwitchToEditorLogin}
              onGoToInitialHome={handleGoToInitialHome}
              onSessionActiveChange={setStudentSessionActive}
              logoutSignal={logoutSignal}
              customMiniRetos={customMiniRetos}
              academicDataset={academicDataset}
              onUpdateAcademicDataset={handleUpdateAcademicDataset}
              activeExamsByStudent={activeExamsByStudent}
              onSaveActiveExamBackup={handleSaveActiveExamBackup}
              onForceServerSync={() => fetchAndApplyServerState(true)}
            />
          ) : activeView === 'editor' ? (
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
              <EditorPanel
                config={config}
                onUpdateConfig={handleUpdateConfig}
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
                customMiniRetos={customMiniRetos}
                onUpdateCustomMiniRetos={handleUpdateCustomMiniRetos}
                academicDataset={academicDataset}
                onUpdateAcademicDataset={handleUpdateAcademicDataset}
                onFullSystemRestore={handleFullSystemRestore}
                onSessionActiveChange={setEditorSessionActive}
                logoutSignal={logoutSignal}
                onSwitchToStudentLogin={handleSwitchToStudentLogin}
                onSwitchToTeacherPanel={handleSwitchToTeacherLogin}
                onGoToInitialHome={handleGoToInitialHome}
                onForceServerSync={handleForceResyncAndClearLocalCache}
              />
            </div>
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
              onSwitchToEditorLogin={handleSwitchToEditorLogin}
              onGoToInitialHome={handleGoToInitialHome}
              onSessionActiveChange={setTeacherSessionActive}
              logoutSignal={logoutSignal}
              customMiniRetos={customMiniRetos}
              onUpdateCustomMiniRetos={handleUpdateCustomMiniRetos}
              academicDataset={academicDataset}
              onUpdateAcademicDataset={handleUpdateAcademicDataset}
              onFullSystemRestore={handleFullSystemRestore}
              onForceServerSync={handleForceResyncAndClearLocalCache}
              lastServerSyncFormatted={lastServerSyncFormatted}
              serverRevision={currentServerRevision}
            />
          )}
        </main>

        {/* Quiet Institutional Footer (Only shown when a course is configured and active) */}
        {Boolean(activeCourseMeta.courseId) && (
          <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 no-print">
            {activeCourseMeta.programaAcademico ? `${activeCourseMeta.programaAcademico} · ` : ''}
            {activeCourseMeta.nombreCurso}
            {activeCourseMeta.codigoCurso ? ` (${activeCourseMeta.codigoCurso})` : ''}
            {activeCourseMeta.institucionSede ? ` · ${activeCourseMeta.institucionSede}` : ''}
          </footer>
        )}
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

  componentDidCatch(error: any) {
    recordCacheDiagnosticError({
      storageKey: 'AppErrorBoundary (Render)',
      severity: 'error',
      reason: error?.message || 'Excepción de renderizado capturada por ErrorBoundary',
      missingFields: ['render_component_tree'],
      detectedSchemaVersion: null,
      autoRepaired: false
    });
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
              onClick={async () => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                  if ('caches' in window) {
                    const names = await window.caches.keys();
                    await Promise.all(names.map((n) => window.caches.delete(n)));
                  }
                } catch {
                  // ignore
                }
                const cleanUrl = `${window.location.pathname}?_v=${Date.now()}`;
                window.location.replace(cleanUrl);
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
