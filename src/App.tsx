/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  LiveClassroomSession,
  ABProProjectEvaluation,
  SystemConfig,
  CustomMiniRetoTemplate,
  MiniRetoAttemptRecord,
  AntiCheatLogEntry,
  UniversalCourseWorkspace
} from './types';
import { INITIAL_STUDENTS } from './data/students';
import { INITIAL_QUESTIONS, normalizeQuestionList } from './data/questions';
import { INITIAL_CUSTOM_MINI_RETOS } from './utils/miniRetosEngine';
import { enrichStudentsWithServerSummary } from './utils/academicServerSummary';
import { StudentPortal } from './components/StudentPortal';
import { ServerSaveProvider, ServerSaveResponse } from './components/ServerSaveContext';
import { AuthProvider, useAuthSession } from './context/AuthContext';
import { GraduationCap, BookOpen, Sliders, ArrowRight, CheckCircle2, RefreshCw, Sun, Moon, HelpCircle, X } from 'lucide-react';

const TeacherPanel = lazy(() =>
  import('./components/TeacherPanel').then((m) => ({ default: m.TeacherPanel }))
);
const EditorPanel = lazy(() =>
  import('./components/EditorPanel').then((m) => ({ default: m.EditorPanel }))
);
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
import {
  getEffectiveCourseMetadata,
  getEffectiveStudentsForWorkspace,
  getEffectiveQuestionsForWorkspace,
  generateBaseRetosForCourseModules
} from './utils/universalCourseEngine';
import {
  CURRENT_DATA_SCHEMA_VERSION,
  SchemaValidationReport,
  validateLocalCacheSchema,
  recordApiRequestDiagnostic,
  recordCacheDiagnosticError,
  stampCurrentSchemaVersion
} from './utils/systemDiagnostics';
import {
  DecryptedAuditEvent,
  AuditEventCategory,
  recordEncryptedAuditEvent,
  flushEncryptedAuditLogsToServer,
  loadDecryptedAuditEvents
} from './utils/encryptedAuditLogger';

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
  ACTIVE_EXAM_BACKUP: 'evaluaplus_active_exam_backup_v2',
  EDITOR_STUDENT_ROSTERS: 'evaluaplus_editor_rosters_v1',
  EDITOR_QUESTION_BANKS: 'evaluaplus_editor_qbanks_v1',
  EDITOR_COURSES_CATALOG: 'evaluaplus_editor_catalog_v1',
  EDITOR_TEACHERS: 'evaluaplus_editor_teachers_v1'
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
  umbralAprobacionMiniRetoPct: 60,
  studentRosterDatabases: [],
  questionBankDatabases: [],
  universalCoursesCatalog: [],
  registeredTeachers: [],
  deletedStudentRosterDbIds: [],
  deletedQuestionBankDbIds: []
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

  // Mecanismo de Carga Diferida de Datos por Demanda (On-Demand Lazy Data Initialization)
  // Evita la carga masiva en memoria de intentos, rúbricas ABPro y dataset académico hasta que el usuario seleccione un curso
  const hasSelectedCourseInitially = Boolean(
    authState.studentSelectedCourseId ||
      authState.teacherSelectedCourseId ||
      authState.activeView === 'editor'
  );
  const [isCourseDataHydratedOnDemand, setIsCourseDataHydratedOnDemand] = useState<boolean>(
    hasSelectedCourseInitially
  );
  const deferredCourseStructuresRef = useRef<{
    attempts: ExamAttemptResult[] | null;
    abproEvaluations: ABProProjectEvaluation[] | null;
    academicDataset: AcademicDataset | null;
  }>({
    attempts: null,
    abproEvaluations: null,
    academicDataset: null
  });

  // Registro de Eventos Cifrado Localmente (Encrypted Audit Log) con Sincronización Asíncrona
  const [encryptedAuditLogs, setEncryptedAuditLogs] = useState<DecryptedAuditEvent[]>(() =>
    loadDecryptedAuditEvents()
  );

  const logCriticalAppEvent = useCallback(
    (params: {
      category: AuditEventCategory;
      action: string;
      details: string;
      actorRole?: 'ESTUDIANTE' | 'DOCENTE' | 'EDITOR' | 'SISTEMA';
      actorId?: string;
      courseId?: string;
    }) => {
      const detectedRole: 'ESTUDIANTE' | 'DOCENTE' | 'EDITOR' | 'SISTEMA' =
        params.actorRole ||
        (authState.editorSessionActive
          ? 'EDITOR'
          : authState.teacherSessionActive
          ? 'DOCENTE'
          : authState.studentSessionActive
          ? 'ESTUDIANTE'
          : 'SISTEMA');
      const detectedActorId =
        params.actorId ||
        (detectedRole === 'EDITOR'
          ? 'EDITOR'
          : detectedRole === 'DOCENTE'
          ? authState.teacherAuthenticatedId || 'DOCENTE'
          : detectedRole === 'ESTUDIANTE'
          ? authState.verifiedStudentId || 'ESTUDIANTE'
          : 'SISTEMA');
      const detectedCourseId =
        params.courseId ||
        authState.teacherSelectedCourseId ||
        authState.studentSelectedCourseId ||
        'global';

      recordEncryptedAuditEvent({
        actorRole: detectedRole,
        actorId: detectedActorId,
        courseId: detectedCourseId,
        category: params.category,
        action: params.action,
        details: params.details
      });
      setEncryptedAuditLogs(loadDecryptedAuditEvents());
    },
    [
      authState.editorSessionActive,
      authState.teacherSessionActive,
      authState.studentSessionActive,
      authState.teacherAuthenticatedId,
      authState.verifiedStudentId,
      authState.teacherSelectedCourseId,
      authState.studentSelectedCourseId
    ]
  );

  const handleForceFlushEncryptedAuditLogs = useCallback(async () => {
    const res = await flushEncryptedAuditLogsToServer();
    setEncryptedAuditLogs(loadDecryptedAuditEvents());
    return res;
  }, []);

  useEffect(() => {
    const syncAuditInterval = setInterval(() => {
      void flushEncryptedAuditLogsToServer().then((res) => {
        if (res.flushedCount > 0) {
          setEncryptedAuditLogs(loadDecryptedAuditEvents());
        }
      });
    }, 12000);
    const handleOnline = () => {
      void handleForceFlushEncryptedAuditLogs();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      clearInterval(syncAuditInterval);
      window.removeEventListener('online', handleOnline);
    };
  }, [handleForceFlushEncryptedAuditLogs]);

  // Persistent State: Exam Attempts (Diferido hasta selección de curso para optimizar memoria del navegador)
  const [attempts, setAttempts] = useState<ExamAttemptResult[]>(() => {
    if (!hasSelectedCourseInitially) return [];
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

  // Persistent State: ABPro Project Evaluations (Diferido hasta selección de curso)
  const [abproEvaluations, setAbproEvaluations] = useState<ABProProjectEvaluation[]>(() => {
    if (!hasSelectedCourseInitially) return [];
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

  // Persistent State: Academic Dataset (Inicializado bajo demanda cuando se selecciona un curso)
  const [academicDataset, setAcademicDataset] = useState<AcademicDataset>(() => {
    if (!hasSelectedCourseInitially) {
      return buildInitialAcademicDataset([]);
    }
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

  // Hidrata bajo demanda las estructuras pesadas (academicDataset, attempts, abproEvaluations) cuando el estudiante o docente selecciona un curso
  useEffect(() => {
    const selectedCourseId =
      authState.studentSelectedCourseId ||
      authState.teacherSelectedCourseId ||
      (activeView === 'editor' ? config.activeCourseId || 'editor' : null);

    if (!selectedCourseId && !studentSessionActive && !teacherSessionActive && activeView !== 'editor') {
      return;
    }

    if (!isCourseDataHydratedOnDemand) {
      let hydratedAttempts = deferredCourseStructuresRef.current.attempts;
      if (!hydratedAttempts) {
        try {
          const rawAtt = localStorage.getItem(STORAGE_KEYS.ATTEMPTS);
          if (rawAtt) {
            const parsed = JSON.parse(rawAtt);
            if (Array.isArray(parsed)) hydratedAttempts = parsed;
          }
        } catch {
          // ignore
        }
      }

      let hydratedAbpro = deferredCourseStructuresRef.current.abproEvaluations;
      if (!hydratedAbpro) {
        try {
          const rawAb = localStorage.getItem(STORAGE_KEYS.ABPRO);
          if (rawAb) {
            const parsed = JSON.parse(rawAb);
            if (Array.isArray(parsed)) hydratedAbpro = parsed;
          }
        } catch {
          // ignore
        }
      }

      let rawAcademic = deferredCourseStructuresRef.current.academicDataset;
      if (!rawAcademic) {
        try {
          const rawAc = localStorage.getItem(STORAGE_KEYS.ACADEMIC_DATASET);
          if (rawAc) {
            const parsed = JSON.parse(rawAc);
            if (parsed && typeof parsed === 'object') rawAcademic = parsed;
          }
        } catch {
          // ignore
        }
      }

      const nextAtt = hydratedAttempts || stateRef.current.attempts;
      const nextAbpro = hydratedAbpro || stateRef.current.abproEvaluations;
      const meta = getEffectiveCourseMetadata(stateRef.current.config);
      const nextAcademic = rawAcademic
        ? normalizeAndSyncAcademicDataset(
            rawAcademic,
            stateRef.current.students,
            meta.modulosCurso,
            meta.nombreCurso
          )
        : normalizeAndSyncAcademicDataset(
            stateRef.current.academicDataset,
            stateRef.current.students,
            meta.modulosCurso,
            meta.nombreCurso
          );

      stateRef.current.attempts = nextAtt;
      stateRef.current.abproEvaluations = nextAbpro;
      stateRef.current.academicDataset = nextAcademic;

      setAttempts(nextAtt);
      setAbproEvaluations(nextAbpro);
      setAcademicDataset(nextAcademic);
      setIsCourseDataHydratedOnDemand(true);
    }
  }, [
    authState.studentSelectedCourseId,
    authState.teacherSelectedCourseId,
    activeView,
    studentSessionActive,
    teacherSessionActive,
    config.activeCourseId,
    isCourseDataHydratedOnDemand
  ]);

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
          const protectedEditorKeys = new Set<string>([
            STORAGE_KEYS.EDITOR_STUDENT_ROSTERS,
            STORAGE_KEYS.EDITOR_QUESTION_BANKS,
            STORAGE_KEYS.EDITOR_COURSES_CATALOG,
            STORAGE_KEYS.EDITOR_TEACHERS,
            'evaluaplus_global_auth_session_v1'
          ]);
          const keysToPurge = new Set<string>(
            Object.values(STORAGE_KEYS).filter((k) => !protectedEditorKeys.has(k))
          );
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (
              k &&
              k.startsWith('evaluaplus_') &&
              !protectedEditorKeys.has(k) &&
              !k.startsWith('evaluaplus_editor_')
            ) {
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
          // SEGURO ANTI-REINICIO Y AUTO-RECUPERACIÓN:
          // Si el servidor aún no tiene alguna colección del editor pero el cliente local sí, conservarla
          let localRosters: any[] = [];
          let localBanks: any[] = [];
          let localCatalog: any[] = [];
          let localTeachers: any[] = [];
          try {
            const rawR = localStorage.getItem(STORAGE_KEYS.EDITOR_STUDENT_ROSTERS);
            if (rawR) localRosters = JSON.parse(rawR);
            const rawB = localStorage.getItem(STORAGE_KEYS.EDITOR_QUESTION_BANKS);
            if (rawB) localBanks = JSON.parse(rawB);
            const rawC = localStorage.getItem(STORAGE_KEYS.EDITOR_COURSES_CATALOG);
            if (rawC) localCatalog = JSON.parse(rawC);
            const rawT = localStorage.getItem(STORAGE_KEYS.EDITOR_TEACHERS);
            if (rawT) localTeachers = JSON.parse(rawT);
          } catch {
            // ignore
          }

          const serverRosters = Array.isArray(data.config.studentRosterDatabases)
            ? data.config.studentRosterDatabases
            : [];
          const serverBanks = Array.isArray(data.config.questionBankDatabases)
            ? data.config.questionBankDatabases
            : [];
          const serverCatalog = Array.isArray(data.config.universalCoursesCatalog)
            ? data.config.universalCoursesCatalog
            : [];
          const serverTeachers = Array.isArray(data.config.registeredTeachers)
            ? data.config.registeredTeachers
            : [];

          const mergedRosters =
            serverRosters.length > 0
              ? serverRosters
              : localRosters.length > 0
              ? localRosters
              : stateRef.current.config.studentRosterDatabases || [];
          const mergedBanks =
            serverBanks.length > 0
              ? serverBanks
              : localBanks.length > 0
              ? localBanks
              : stateRef.current.config.questionBankDatabases || [];
          const mergedCatalog =
            serverCatalog.length > 0
              ? serverCatalog
              : localCatalog.length > 0
              ? localCatalog
              : stateRef.current.config.universalCoursesCatalog || [];
          const mergedTeachers =
            serverTeachers.length > 0
              ? serverTeachers
              : localTeachers.length > 0
              ? localTeachers
              : stateRef.current.config.registeredTeachers || [];

          if (mergedRosters.length > 0) {
            safeWriteLocalStorage(STORAGE_KEYS.EDITOR_STUDENT_ROSTERS, mergedRosters);
          }
          if (mergedBanks.length > 0) {
            safeWriteLocalStorage(STORAGE_KEYS.EDITOR_QUESTION_BANKS, mergedBanks);
          }
          if (mergedCatalog.length > 0) {
            safeWriteLocalStorage(STORAGE_KEYS.EDITOR_COURSES_CATALOG, mergedCatalog);
          }
          if (mergedTeachers.length > 0) {
            safeWriteLocalStorage(STORAGE_KEYS.EDITOR_TEACHERS, mergedTeachers);
          }

          const mergedConfig = {
            ...DEFAULT_CONFIG,
            ...data.config,
            studentRosterDatabases: mergedRosters,
            questionBankDatabases: mergedBanks,
            universalCoursesCatalog: mergedCatalog,
            registeredTeachers: mergedTeachers
          };
          setConfig(mergedConfig);
          stateRef.current.config = mergedConfig;
          safeWriteLocalStorage(STORAGE_KEYS.CONFIG, mergedConfig);

          // Si recuperamos colecciones locales que el servidor aún no tenía, auto-sincronizarlas al servidor
          if (
            mergedRosters.length > serverRosters.length ||
            mergedBanks.length > serverBanks.length ||
            mergedCatalog.length > serverCatalog.length
          ) {
            void pushServerMutation('/api/editor/databases', 'POST', {
              studentRosterDatabases: mergedRosters,
              questionBankDatabases: mergedBanks,
              universalCoursesCatalog: mergedCatalog,
              registeredTeachers: mergedTeachers,
              section: 'AutoHealSync',
              description: 'Auto-recuperación de bases del editor hacia el servidor'
            });
          }
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
          deferredCourseStructuresRef.current.attempts = data.attempts;
          safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, data.attempts);
          if (
            authState.studentSelectedCourseId ||
            authState.teacherSelectedCourseId ||
            authState.activeView !== 'inicio'
          ) {
            setAttempts(data.attempts);
            stateRef.current.attempts = data.attempts;
            setIsCourseDataHydratedOnDemand(true);
          }
        }

        if (Array.isArray(data.abproEvaluations)) {
          deferredCourseStructuresRef.current.abproEvaluations = data.abproEvaluations;
          safeWriteLocalStorage(STORAGE_KEYS.ABPRO, data.abproEvaluations);
          if (
            authState.studentSelectedCourseId ||
            authState.teacherSelectedCourseId ||
            authState.activeView !== 'inicio'
          ) {
            setAbproEvaluations(data.abproEvaluations);
            stateRef.current.abproEvaluations = data.abproEvaluations;
          }
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
        deferredCourseStructuresRef.current.academicDataset = sourceAcademic;
        if (
          authState.studentSelectedCourseId ||
          authState.teacherSelectedCourseId ||
          authState.activeView !== 'inicio'
        ) {
          const syncedAcademic = normalizeAndSyncAcademicDataset(
            sourceAcademic,
            stateRef.current.students,
            effectiveMeta.modulosCurso,
            effectiveMeta.nombreCurso
          );
          setAcademicDataset(syncedAcademic);
          stateRef.current.academicDataset = syncedAcademic;
          safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, syncedAcademic);
          setIsCourseDataHydratedOnDemand(true);
        } else {
          safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, sourceAcademic);
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

  // Initial authoritative hydration on mount + Adaptive multi-device synchronization + Focus & Storage & BroadcastChannel sync
  useEffect(() => {
    const pollIntervalMs = activeView === 'docente' ? 2500 : 6000;

    const runLightweightOrFullPoll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (pendingWritesCountRef.current > 0 || Date.now() - lastMutationStartedAtRef.current < 3500) {
        return;
      }
      try {
        const cRev = serverRevisionRef.current;
        const qRev = questionsRevisionRef.current;
        if (cRev <= 0) {
          await fetchAndApplyServerState(false);
          return;
        }
        const pingRes = await fetch(
          `/api/state/live-ping?clientRevision=${cRev}&clientQuestionsRevision=${qRev}&_t=${Date.now()}`,
          { method: 'GET', cache: 'no-store' }
        );
        if (pingRes.ok) {
          const pingData = await pingRes.json();
          if (pingData && pingData.upToDate) {
            if (Array.isArray(pingData.liveSessions)) {
              setLiveSessions(pingData.liveSessions);
              stateRef.current.liveSessions = pingData.liveSessions;
            }
            setLastServerSyncFormatted(new Date().toLocaleTimeString('es-CO'));
            return;
          }
        }
      } catch {
        // Fallback to standard state check
      }
      await fetchAndApplyServerState(false);
    };

    const interval = setInterval(() => {
      void runLightweightOrFullPoll();
    }, pollIntervalMs);

    const handleVisibilityOrFocus = () => {
      if (!document.hidden) {
        void runLightweightOrFullPoll();
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
          if (msg.type === 'SYNC_STATE_TO_CLOUD') {
            const actionType = msg.actionType;
            // 1. Asistencia de clase
            if (msg.academicDataset) {
              applyRealtimeAcademicDataset(msg.academicDataset);
            }
            // 2. Bloqueos y Notas en Estudiantes
            if (Array.isArray(msg.students)) {
              const enriched = enrichStudentsWithServerSummary(
                msg.students,
                msg.attempts || stateRef.current.attempts,
                msg.config || stateRef.current.config
              );
              stateRef.current.students = enriched;
              setStudents(enriched);
              safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, enriched);
            }
            // 3. Notas en Intentos
            if (Array.isArray(msg.attempts)) {
              stateRef.current.attempts = msg.attempts;
              setAttempts(msg.attempts);
              safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, msg.attempts);
            }
            // 4. Bloqueos de Examen y Configuración
            if (msg.config && typeof msg.config === 'object') {
              stateRef.current.config = msg.config;
              setConfig(msg.config);
              safeWriteLocalStorage(STORAGE_KEYS.CONFIG, msg.config);
            }
            // 5. Evaluaciones ABPro
            if (Array.isArray(msg.abproEvaluations)) {
              stateRef.current.abproEvaluations = msg.abproEvaluations;
              setAbproEvaluations(msg.abproEvaluations);
              safeWriteLocalStorage(STORAGE_KEYS.ABPRO, msg.abproEvaluations);
            }
            // Verificación autoritativa de segundo plano
            if (actionType === 'BLOCKS' || actionType === 'NOTES' || actionType === 'ATTENDANCE') {
              void fetchAndApplyServerState(false);
            }
          } else if (msg.type === 'ACADEMIC_DATASET_UPDATED' && msg.academicDataset) {
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
  }, [fetchAndApplyServerState, activeView]);

  // ============================================================================
  // CENTRALIZED PERSISTENCE ACTION WRAPPERS (Immediate UI + Server + Local Cache)
  // ============================================================================

  const syncActiveCourseWorkspaceInConfig = useCallback(
    (
      partialWorkspace: Partial<{
        students: StudentRecord[];
        questions: Question[];
        attempts: ExamAttemptResult[];
        abproEvaluations: ABProProjectEvaluation[];
        customMiniRetos: CustomMiniRetoTemplate[];
        academicDataset: AcademicDataset;
      }>,
      baseConfig: SystemConfig
    ): SystemConfig => {
      if (
        !Array.isArray(baseConfig.universalCoursesCatalog) ||
        baseConfig.universalCoursesCatalog.length === 0
      ) {
        return baseConfig;
      }
      const targetCourseId =
        baseConfig.activeCourseId || baseConfig.universalCoursesCatalog[0]?.meta?.courseId;
      if (!targetCourseId) return baseConfig;

      const updatedCatalog = baseConfig.universalCoursesCatalog.map((c) => {
        if (c.meta?.courseId !== targetCourseId) return c;
        const nextSt = partialWorkspace.students ?? c.students ?? [];
        const nextQ = partialWorkspace.questions ?? c.questions ?? [];
        const nextAtt = partialWorkspace.attempts ?? c.attempts ?? [];
        const nextRet = partialWorkspace.customMiniRetos ?? c.customMiniRetos ?? [];
        return {
          ...c,
          ...partialWorkspace,
          studentsCount: Array.isArray(nextSt) ? nextSt.length : c.studentsCount,
          questionsCount: Array.isArray(nextQ) ? nextQ.length : c.questionsCount,
          attemptsCount: Array.isArray(nextAtt) ? nextAtt.length : c.attemptsCount,
          retosCount: Array.isArray(nextRet) ? nextRet.length : c.retosCount,
          updatedAtIso: new Date().toISOString()
        };
      });
      return {
        ...baseConfig,
        universalCoursesCatalog: updatedCatalog
      };
    },
    []
  );

  const syncStudentsIntoActiveCourseConfig = useCallback(
    (nextStudents: StudentRecord[], baseConfig: SystemConfig): SystemConfig => {
      return syncActiveCourseWorkspaceInConfig({ students: nextStudents }, baseConfig);
    },
    [syncActiveCourseWorkspaceInConfig]
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
      const cleanUpdatedId = String(updated.id || '')
        .trim()
        .replace(/[\s.-]/g, '')
        .toUpperCase();

      const rawNext = stateRef.current.students.map((s) => {
        const cleanId = String(s?.id || '')
          .trim()
          .replace(/[\s.-]/g, '')
          .toUpperCase();
        return cleanId === cleanUpdatedId ? { ...s, ...updated } : s;
      });
      const next = enrichStudentsWithServerSummary(
        rawNext,
        stateRef.current.attempts,
        stateRef.current.config
      );
      stateRef.current.students = next;
      setStudents(next);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, next);

      // Keep active course and all assigned courses in universalCoursesCatalog & studentRosterDatabases synchronized
      let nextConfig = syncStudentsIntoActiveCourseConfig(next, stateRef.current.config);
      if (Array.isArray(nextConfig.universalCoursesCatalog)) {
        nextConfig = {
          ...nextConfig,
          universalCoursesCatalog: nextConfig.universalCoursesCatalog.map((course) => {
            if (!Array.isArray(course.students)) return course;
            let courseModified = false;
            const nextCourseStudents = course.students.map((st) => {
              const cleanStId = String(st?.id || '')
                .trim()
                .replace(/[\s.-]/g, '')
                .toUpperCase();
              if (cleanStId === cleanUpdatedId) {
                courseModified = true;
                return {
                  ...st,
                  nombre: updated.nombre,
                  codigoAcceso: updated.codigoAcceso,
                  correo: updated.correo,
                  whatsapp: updated.whatsapp
                };
              }
              return st;
            });
            return courseModified
              ? {
                  ...course,
                  students: nextCourseStudents,
                  updatedAtIso: new Date().toISOString()
                }
              : course;
          })
        };
      }
      if (Array.isArray(nextConfig.studentRosterDatabases)) {
        nextConfig = {
          ...nextConfig,
          studentRosterDatabases: nextConfig.studentRosterDatabases.map((db) => {
            if (!Array.isArray(db.students)) return db;
            let dbModified = false;
            const nextDbStudents = db.students.map((st) => {
              const cleanStId = String(st?.id || '')
                .trim()
                .replace(/[\s.-]/g, '')
                .toUpperCase();
              if (cleanStId === cleanUpdatedId) {
                dbModified = true;
                return {
                  ...st,
                  nombre: updated.nombre,
                  codigoAcceso: updated.codigoAcceso,
                  correo: updated.correo,
                  whatsapp: updated.whatsapp
                };
              }
              return st;
            });
            return dbModified
              ? {
                  ...db,
                  students: nextDbStudents,
                  updatedAtIso: new Date().toISOString()
                }
              : db;
          })
        };
      }

      if (nextConfig !== stateRef.current.config) {
        stateRef.current.config = nextConfig;
        setConfig(nextConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, nextConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: nextConfig });
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

      const enrichedUpdated =
        next.find(
          (s) =>
            String(s?.id || '')
              .trim()
              .replace(/[\s.-]/g, '')
              .toUpperCase() === cleanUpdatedId
        ) || updated;
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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        { questions: normalized },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      pushServerMutation('/api/state/questions', 'PUT', {
        questions: normalized,
        saveSnapshot: true
      });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig]
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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        { attempts: next, students: reEnriched },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      pushServerMutation('/api/state/attempts', 'PUT', { attempts: next });
      logCriticalAppEvent({
        category: 'CALIFICACIONES',
        action: 'ACTUALIZACION_INTENTOS_EXAMEN',
        details: `Modificación de registros de intentos de evaluación (Total: ${next.length} intento(s))`
      });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig, logCriticalAppEvent]
  );

  const handleUpdateABProEvaluations = useCallback(
    (next: ABProProjectEvaluation[]) => {
      stateRef.current.abproEvaluations = next;
      setAbproEvaluations(next);
      safeWriteLocalStorage(STORAGE_KEYS.ABPRO, next);

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        { abproEvaluations: next },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      pushServerMutation('/api/state/abpro', 'PUT', { abproEvaluations: next });
      logCriticalAppEvent({
        category: 'CALIFICACIONES',
        action: 'CALIFICACION_RUBRICA_ABPRO',
        details: `Actualización de calificaciones de proyecto ABPro (${next.length} registro(s) evaluados)`
      });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig, logCriticalAppEvent]
  );

  const handleUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>> = useCallback(
    (action) => {
      const prevCfg = stateRef.current.config;
      const next = typeof action === 'function' ? action(prevCfg) : action;
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

      // Auditar cambios críticos en configuración de examen
      const configDiffs: string[] = [];
      if (prevCfg.examenAbierto !== next.examenAbierto) {
        configDiffs.push(`examenAbierto: ${next.examenAbierto ? 'ABIERTO' : 'CERRADO'}`);
      }
      if (prevCfg.tiempoExamenIntegralMin !== next.tiempoExamenIntegralMin) {
        configDiffs.push(`tiempoIntegral: ${next.tiempoExamenIntegralMin}m`);
      }
      if (prevCfg.preguntasExamenIntegral !== next.preguntasExamenIntegral) {
        configDiffs.push(`preguntasIntegral: ${next.preguntasExamenIntegral}`);
      }
      if (prevCfg.tiempoExamenModuloMin !== next.tiempoExamenModuloMin) {
        configDiffs.push(`tiempoModulo: ${next.tiempoExamenModuloMin}m`);
      }
      if (prevCfg.preguntasExamenModulo !== next.preguntasExamenModulo) {
        configDiffs.push(`preguntasModulo: ${next.preguntasExamenModulo}`);
      }
      if (prevCfg.notaMinimaAprobacion !== next.notaMinimaAprobacion) {
        configDiffs.push(`umbralAprobacion: ${next.notaMinimaAprobacion}`);
      }
      if (prevCfg.exigirPinAula !== next.exigirPinAula || prevCfg.pinAulaDia !== next.pinAulaDia) {
        configDiffs.push(`PIN Aula: ${next.exigirPinAula ? next.pinAulaDia : 'Desactivado'}`);
      }
      if (configDiffs.length > 0) {
        logCriticalAppEvent({
          category: 'CONFIGURACION_EXAMEN',
          action: 'CAMBIO_PARAMETROS_EVALUACION',
          details: `Curso ${meta.codigoCurso || meta.nombreCurso}: ${configDiffs.join(' · ')}`
        });
      }
    },
    [pushServerMutation, logCriticalAppEvent]
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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        { customMiniRetos: next },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      pushServerMutation('/api/state/custom-mini-retos', 'PUT', { customMiniRetos: next });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig]
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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        {
          attempts: nextAttempts,
          students: nextStudents,
          academicDataset: syncedAcademic
        },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

      pushServerMutation('/api/academic-dataset/update', 'POST', {
        academicDataset: syncedAcademic
      });

      const enrichedUpdatedStudent =
        nextStudents.find((s) => s.id === updatedStudent.id) || updatedStudent;

      pushServerMutation('/api/state/attempt', 'POST', {
        attempt: attemptWithSyncFlag,
        student: enrichedUpdatedStudent
      });

      const finalGrade =
        typeof result.notaColombiana === 'number'
          ? result.notaColombiana
          : typeof result.notaFinal === 'number'
          ? result.notaFinal
          : 0;
      const modTitle = result.modalidadLabel || result.modalidadTitle || result.modalidad;
      const elapsedSec = result.tiempoEmpleadoSegundos || result.duracionSegundos || 0;

      try {
        logCriticalAppEvent({
          category: 'CALIFICACIONES',
          action: 'ENTREGA_EXAMEN_REGISTRADA',
          actorRole: 'ESTUDIANTE',
          actorId: updatedStudent.id,
          details: `Estudiante ${updatedStudent.nombre} (${updatedStudent.id}) entregó ${modTitle} · Nota: ${finalGrade.toFixed(2)}/5.0 · Tiempo: ${Math.round(elapsedSec / 60)} min`
        });
      } catch (logErr) {
        console.error('Error no crítico al registrar entrega en Audit Log:', logErr);
      }

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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        {
          students: nextStudents,
          academicDataset: syncedAcademic
        },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfig });
      }

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

      const syncedConfig = syncActiveCourseWorkspaceInConfig(
        { students: nextStudents },
        stateRef.current.config
      );
      if (syncedConfig !== stateRef.current.config) {
        stateRef.current.config = syncedConfig;
        setConfig(syncedConfig);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfig);
      }

      pushServerMutation('/api/state/anti-cheat-event', 'POST', {
        studentId,
        logEntry,
        updatedStudent: nextStudents.find((s) => s.id === studentId)
      });

      logCriticalAppEvent({
        category: 'ANTI_TRAMPA',
        action: logEntry.tipoDeteccion || 'ALERTA_ANTI_TRAMPA',
        actorRole: 'ESTUDIANTE',
        actorId: studentId,
        details: `${logEntry.studentName || studentId} · ${logEntry.etiquetaDeteccion || logEntry.tipoDeteccion}: ${logEntry.descripcion} (Acción: ${logEntry.accionTomada})`
      });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig, logCriticalAppEvent]
  );

  const handleActivateCourseWorkspace = useCallback(
    (targetWorkspace: UniversalCourseWorkspace) => {
      if (!targetWorkspace || !targetWorkspace.meta || !targetWorkspace.meta.courseId) return;

      const currentCfg = stateRef.current.config;
      const syncedCurrentCfg = syncActiveCourseWorkspaceInConfig(
        {
          students: stateRef.current.students,
          questions: stateRef.current.questions,
          attempts: stateRef.current.attempts,
          abproEvaluations: stateRef.current.abproEvaluations,
          customMiniRetos: stateRef.current.customMiniRetos,
          academicDataset: stateRef.current.academicDataset
        },
        currentCfg
      );

      const targetCourseId = targetWorkspace.meta.courseId;
      const freshTargetWorkspace =
        (syncedCurrentCfg.universalCoursesCatalog || []).find(
          (w) => w.meta?.courseId === targetCourseId
        ) || targetWorkspace;

      const targetMeta = getEffectiveCourseMetadata(syncedCurrentCfg, null, targetCourseId);
      const rawTargetStudents = getEffectiveStudentsForWorkspace(
        freshTargetWorkspace,
        syncedCurrentCfg,
        targetCourseId === currentCfg.activeCourseId ? stateRef.current.students : undefined
      );
      const rawTargetQuestions = getEffectiveQuestionsForWorkspace(
        freshTargetWorkspace,
        syncedCurrentCfg,
        targetCourseId === currentCfg.activeCourseId ? stateRef.current.questions : undefined
      );
      const normalizedQuestions =
        rawTargetQuestions.length > 0 ? normalizeQuestionList(rawTargetQuestions) : [];
      const targetAttempts =
        targetCourseId === currentCfg.activeCourseId
          ? stateRef.current.attempts
          : Array.isArray(freshTargetWorkspace.attempts)
          ? freshTargetWorkspace.attempts
          : [];
      const targetAbpro =
        targetCourseId === currentCfg.activeCourseId
          ? stateRef.current.abproEvaluations
          : Array.isArray(freshTargetWorkspace.abproEvaluations)
          ? freshTargetWorkspace.abproEvaluations
          : [];
      const targetRetos =
        targetCourseId === currentCfg.activeCourseId &&
        Array.isArray(stateRef.current.customMiniRetos) &&
        stateRef.current.customMiniRetos.length > 0
          ? stateRef.current.customMiniRetos
          : Array.isArray(freshTargetWorkspace.customMiniRetos) &&
            freshTargetWorkspace.customMiniRetos.length > 0
          ? freshTargetWorkspace.customMiniRetos
          : generateBaseRetosForCourseModules(targetMeta, normalizedQuestions);

      const nextConfig: SystemConfig = {
        ...syncedCurrentCfg,
        activeCourseId: targetMeta.courseId,
        activeCourseMeta: targetMeta
      };

      const enrichedStudents = enrichStudentsWithServerSummary(
        rawTargetStudents,
        targetAttempts,
        nextConfig
      );

      const nextAcademic = freshTargetWorkspace.academicDataset
        ? normalizeAndSyncAcademicDataset(
            freshTargetWorkspace.academicDataset,
            enrichedStudents,
            targetMeta.modulosCurso,
            targetMeta.nombreCurso
          )
        : buildInitialAcademicDataset(
            enrichedStudents,
            targetMeta.modulosCurso,
            targetMeta.nombreCurso
          );

      const finalConfig = syncActiveCourseWorkspaceInConfig(
        {
          students: enrichedStudents,
          questions: normalizedQuestions,
          attempts: targetAttempts,
          abproEvaluations: targetAbpro,
          customMiniRetos: targetRetos,
          academicDataset: nextAcademic
        },
        nextConfig
      );

      stateRef.current.config = finalConfig;
      stateRef.current.students = enrichedStudents;
      stateRef.current.questions = normalizedQuestions;
      stateRef.current.questionsBankExplicitlyCleared = normalizedQuestions.length === 0;
      stateRef.current.attempts = targetAttempts;
      stateRef.current.abproEvaluations = targetAbpro;
      stateRef.current.customMiniRetos = targetRetos;
      stateRef.current.academicDataset = nextAcademic;

      setConfig(finalConfig);
      setStudents(enrichedStudents);
      setQuestions(normalizedQuestions);
      setQuestionsBankExplicitlyCleared(normalizedQuestions.length === 0);
      setAttempts(targetAttempts);
      setAbproEvaluations(targetAbpro);
      setCustomMiniRetos(targetRetos);
      setAcademicDataset(nextAcademic);
      setIsCourseDataHydratedOnDemand(true);

      safeWriteLocalStorage(STORAGE_KEYS.CONFIG, finalConfig);
      safeWriteLocalStorage(STORAGE_KEYS.STUDENTS, enrichedStudents);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, normalizedQuestions);
      safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS_CLEARED, normalizedQuestions.length === 0);
      safeWriteLocalStorage(STORAGE_KEYS.ATTEMPTS, targetAttempts);
      safeWriteLocalStorage(STORAGE_KEYS.ABPRO, targetAbpro);
      safeWriteLocalStorage(STORAGE_KEYS.CUSTOM_MINI_RETOS, targetRetos);
      safeWriteLocalStorage(STORAGE_KEYS.ACADEMIC_DATASET, nextAcademic);

      void pushServerMutation('/api/state/save-all', 'POST', {
        section: 'student_course_switch',
        description: `Activación de curso (${targetMeta.nombreCurso})`,
        config: finalConfig,
        students: enrichedStudents,
        questions: normalizedQuestions,
        attempts: targetAttempts,
        abproEvaluations: targetAbpro,
        customMiniRetos: targetRetos,
        academicDataset: nextAcademic,
        questionsBankExplicitlyCleared: normalizedQuestions.length === 0
      });
    },
    [pushServerMutation, syncActiveCourseWorkspaceInConfig]
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

      const syncedConfigWithAcademic = syncActiveCourseWorkspaceInConfig(
        { academicDataset: normalized, students: currentRoster },
        stateRef.current.config
      );
      if (syncedConfigWithAcademic !== stateRef.current.config) {
        stateRef.current.config = syncedConfigWithAcademic;
        setConfig(syncedConfigWithAcademic);
        safeWriteLocalStorage(STORAGE_KEYS.CONFIG, syncedConfigWithAcademic);
        pushServerMutation('/api/state/config', 'PUT', { config: syncedConfigWithAcademic });
      }
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
      logCriticalAppEvent({
        category: 'ASISTENCIA_ACADEMICA',
        action: 'ACTUALIZACION_DATASET_ACADEMICO',
        details: `Actualización de asistencia o calificaciones por clase en ${meta.nombreCurso} (${normalized.records.length} estudiante(s))`
      });
    },
    [pushServerMutation, syncStudentsIntoActiveCourseConfig, logCriticalAppEvent]
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

        const isGlobal =
          sectionKey === 'global_save' ||
          sectionKey.includes('full') ||
          sectionKey === 'Panel General';

        let data: any = null;

        if (isGlobal) {
          const includeQuestions =
            sectionKey.includes('pregunta') ||
            sectionKey.includes('banco') ||
            sectionKey === 'global_save';
          if (includeQuestions) {
            safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, stateRef.current.questions);
          }

          data = await pushServerMutation('/api/state/save-all', 'POST', {
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
        } else {
          // Si es una acción del panel del editor, sincronizar directamente las colecciones a /api/editor/databases y shards
          if (sectionKey.includes('editor') || sectionKey.includes('nomina') || sectionKey.includes('banco') || sectionKey.includes('curso')) {
            const currentCfg = stateRef.current.config;
            if (Array.isArray(currentCfg.studentRosterDatabases) && currentCfg.studentRosterDatabases.length > 0) {
              safeWriteLocalStorage(STORAGE_KEYS.EDITOR_STUDENT_ROSTERS, currentCfg.studentRosterDatabases);
            }
            if (Array.isArray(currentCfg.questionBankDatabases) && currentCfg.questionBankDatabases.length > 0) {
              safeWriteLocalStorage(STORAGE_KEYS.EDITOR_QUESTION_BANKS, currentCfg.questionBankDatabases);
            }
            if (Array.isArray(currentCfg.universalCoursesCatalog) && currentCfg.universalCoursesCatalog.length > 0) {
              safeWriteLocalStorage(STORAGE_KEYS.EDITOR_COURSES_CATALOG, currentCfg.universalCoursesCatalog);
            }
            if (Array.isArray(currentCfg.registeredTeachers) && currentCfg.registeredTeachers.length > 0) {
              safeWriteLocalStorage(STORAGE_KEYS.EDITOR_TEACHERS, currentCfg.registeredTeachers);
            }

            // Guardar colecciones completas del editor atómicamente en el servidor
            void pushServerMutation('/api/editor/databases', 'POST', {
              studentRosterDatabases: currentCfg.studentRosterDatabases,
              questionBankDatabases: currentCfg.questionBankDatabases,
              universalCoursesCatalog: currentCfg.universalCoursesCatalog,
              registeredTeachers: currentCfg.registeredTeachers,
              activeCourseId: currentCfg.activeCourseId,
              activeCourseMeta: currentCfg.activeCourseMeta,
              section: sectionKey,
              description
            });
          }

          // Ultra-fast granular differential save (only transmits the modified entity, reducing payload from 1.5MB to ~2KB)
          let entity = 'config';
          let payloadData: any = stateRef.current.config;

          if (sectionKey.includes('pregunta') && !sectionKey.includes('panel_editor_banco')) {
            entity = 'questions';
            payloadData = stateRef.current.questions;
            safeWriteLocalStorage(STORAGE_KEYS.QUESTIONS, stateRef.current.questions);
          } else if (sectionKey === 'panel_editor_banco_preguntas' || sectionKey.includes('editor_banco')) {
            entity = 'questionBankDatabases';
            payloadData = stateRef.current.config.questionBankDatabases || [];
          } else if (sectionKey === 'panel_editor_nominas_estudiantes' || sectionKey.includes('editor_nomina')) {
            entity = 'studentRosterDatabases';
            payloadData = stateRef.current.config.studentRosterDatabases || [];
          } else if (sectionKey.includes('nomina') || sectionKey.includes('estudiante') || sectionKey.includes('student')) {
            entity = 'students';
            payloadData = stateRef.current.students;
          } else if (
            sectionKey.includes('asistencia') ||
            sectionKey.includes('clase') ||
            sectionKey.includes('academic')
          ) {
            entity = 'academicDataset';
            payloadData = stateRef.current.academicDataset;
          } else if (sectionKey.includes('intento') || sectionKey.includes('attempt')) {
            entity = 'attempts';
            payloadData = stateRef.current.attempts;
          } else if (sectionKey.includes('mini_reto') || sectionKey.includes('reto')) {
            entity = 'customMiniRetos';
            payloadData = stateRef.current.customMiniRetos;
          } else if (sectionKey.includes('curso') || sectionKey.includes('catalog')) {
            entity = 'universalCoursesCatalog';
            payloadData = stateRef.current.config.universalCoursesCatalog || [];
          }

          data = await pushServerMutation('/api/state/differential', 'POST', {
            entity,
            data: payloadData,
            section: sectionKey,
            description
          });
        }

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
  const [homeDarkMode, setHomeDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('evaluaplus_home_dark_mode') === '1';
    } catch {
      return false;
    }
  });
  const [homeSupportModalOpen, setHomeSupportModalOpen] = useState<boolean>(false);

  const handleToggleHomeDarkMode = () => {
    setHomeDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('evaluaplus_home_dark_mode', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    if (activeView !== 'inicio' || anySessionActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape' && homeSupportModalOpen) {
        setHomeSupportModalOpen(false);
        return;
      }
      if (e.key === '1') {
        handleSwitchToStudentLogin();
      } else if (e.key === '2') {
        handleSwitchToTeacherLogin();
      } else if (e.key === '3') {
        handleSwitchToEditorLogin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeView,
    anySessionActive,
    homeSupportModalOpen,
    handleSwitchToStudentLogin,
    handleSwitchToTeacherLogin,
    handleSwitchToEditorLogin
  ]);

  return (
    <ServerSaveProvider onExecuteServerSave={handleExecuteServerSave}>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col">
          {!isServerHydrated ? (
            <div
              className={`min-h-screen flex flex-col justify-between transition-colors duration-200 ${
                homeDarkMode
                  ? 'bg-slate-950 text-slate-100'
                  : 'bg-[#F8FAFC] text-slate-900'
              }`}
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="Sincronizando plataforma y cargando paneles principales"
            >
              {/* Skeleton Header */}
              <header
                className={`w-full border-b ${
                  homeDarkMode
                    ? 'border-slate-800/80 bg-slate-900/80'
                    : 'border-slate-200/80 bg-white/90'
                }`}
              >
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xl font-bold tracking-tight ${
                        homeDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Evalua<span className="text-sky-600">Plus</span>
                    </span>
                    <div
                      className={`hidden sm:block h-5 w-20 rounded-md animate-pulse ${
                        homeDarkMode ? 'bg-slate-800' : 'bg-slate-200/80'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className={`h-8 w-28 sm:w-32 rounded-xl border animate-pulse ${
                        homeDarkMode
                          ? 'bg-slate-900 border-slate-800'
                          : 'bg-slate-100 border-slate-200/80'
                      }`}
                    />
                    <div
                      className={`h-8 w-16 sm:w-20 rounded-xl border animate-pulse ${
                        homeDarkMode
                          ? 'bg-slate-900 border-slate-800'
                          : 'bg-slate-100 border-slate-200/80'
                      }`}
                    />
                  </div>
                </div>
              </header>

              {/* Skeleton Central Dashboard & Profile Cards */}
              <div className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-10">
                {/* Skeleton Hero Section */}
                <div className="max-w-2xl mx-auto w-full text-center space-y-4 flex flex-col items-center">
                  <div
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border ${
                      homeDarkMode
                        ? 'bg-slate-900 border-slate-800 text-sky-400'
                        : 'bg-white border-slate-200/90 text-sky-700 shadow-2xs'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Sincronizando Base de Datos Centralizada...</span>
                  </div>

                  <div
                    className={`h-8 sm:h-10 w-4/5 max-w-lg rounded-xl animate-pulse ${
                      homeDarkMode ? 'bg-slate-800/90' : 'bg-slate-200/90'
                    }`}
                  />
                  <div className="w-full max-w-xl space-y-2 flex flex-col items-center pt-1">
                    <div
                      className={`h-4 w-11/12 rounded-lg animate-pulse ${
                        homeDarkMode ? 'bg-slate-800/70' : 'bg-slate-200/75'
                      }`}
                    />
                    <div
                      className={`h-4 w-3/4 rounded-lg animate-pulse ${
                        homeDarkMode ? 'bg-slate-800/70' : 'bg-slate-200/75'
                      }`}
                    />
                  </div>
                  <div
                    className={`h-3.5 w-64 rounded-md animate-pulse mt-2 ${
                      homeDarkMode ? 'bg-slate-800/60' : 'bg-slate-200/60'
                    }`}
                  />
                </div>

                {/* Skeleton 3-Card Grid (Matching Estudiante, Docente, Editor Cards) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-stretch">
                  {[
                    { accent: homeDarkMode ? 'bg-sky-950/50' : 'bg-sky-50/90' },
                    { accent: homeDarkMode ? 'bg-emerald-950/50' : 'bg-emerald-50/90' },
                    { accent: homeDarkMode ? 'bg-indigo-950/50' : 'bg-indigo-50/90' }
                  ].map((card, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl p-7 sm:p-8 border flex flex-col items-center justify-between gap-5 ${
                        homeDarkMode
                          ? 'bg-slate-900/90 border-slate-800 shadow-lg shadow-black/20'
                          : 'bg-white border-slate-200/90 shadow-xs'
                      }`}
                    >
                      <div className="w-full space-y-3 flex flex-col items-center">
                        <div
                          className={`w-16 h-16 rounded-2xl animate-pulse ${card.accent}`}
                        />
                        <div
                          className={`h-6 w-28 rounded-lg animate-pulse ${
                            homeDarkMode ? 'bg-slate-800' : 'bg-slate-200/90'
                          }`}
                        />
                        <div className="w-full space-y-2 flex flex-col items-center pt-1">
                          <div
                            className={`h-3.5 w-4/5 rounded-md animate-pulse ${
                              homeDarkMode ? 'bg-slate-800/75' : 'bg-slate-200/70'
                            }`}
                          />
                          <div
                            className={`h-3.5 w-3/5 rounded-md animate-pulse ${
                              homeDarkMode ? 'bg-slate-800/60' : 'bg-slate-200/60'
                            }`}
                          />
                        </div>
                      </div>
                      <div
                        className={`h-4 w-20 rounded-md animate-pulse ${
                          homeDarkMode ? 'bg-slate-800' : 'bg-slate-200/80'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Skeleton Footer */}
              <footer
                className={`w-full border-t py-5 px-4 flex justify-center ${
                  homeDarkMode
                    ? 'border-slate-800/80 bg-slate-900/50'
                    : 'border-slate-200/80 bg-white/70'
                }`}
              >
                <div
                  className={`h-3.5 w-64 rounded-md animate-pulse ${
                    homeDarkMode ? 'bg-slate-800' : 'bg-slate-200/80'
                  }`}
                />
              </footer>
            </div>
          ) : activeView === 'inicio' && !anySessionActive ? (
            <div
              className={`min-h-screen flex flex-col justify-between transition-colors duration-200 ${
                homeDarkMode
                  ? 'bg-slate-950 text-slate-100'
                  : 'bg-[#F8FAFC] text-slate-900'
              }`}
            >
              {/* 1. Cabecera Limpia (Header) */}
              <header
                className={`w-full border-b transition-colors duration-200 ${
                  homeDarkMode
                    ? 'border-slate-800/80 bg-slate-900/80'
                    : 'border-slate-200/80 bg-white/90'
                } backdrop-blur-xs`}
              >
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                  {/* Izquierda: Nombre de la plataforma */}
                  <a
                    href="#inicio"
                    onClick={(e) => {
                      e.preventDefault();
                      handleGoToInitialHome();
                    }}
                    className="flex items-center gap-2.5 shrink-0 group focus-visible:outline-none"
                  >
                    <span
                      className={`text-xl font-bold tracking-tight transition-colors ${
                        homeDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Evalua<span className="text-sky-600">Plus</span>
                    </span>
                    {activeCourseMeta.codigoCurso && (
                      <span
                        className={`hidden sm:inline-block text-xs font-medium px-2 py-0.5 rounded-md border ${
                          homeDarkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {activeCourseMeta.codigoCurso}
                      </span>
                    )}
                  </a>

                  {/* Derecha: Botón sutil de Ayuda / Soporte e interruptor de Modo Oscuro/Claro */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setHomeSupportModalOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                        homeDarkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <HelpCircle className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>Ayuda / Soporte</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleHomeDarkMode}
                      aria-label={homeDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
                      title={homeDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                        homeDarkMode
                          ? 'bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {homeDarkMode ? (
                        <>
                          <Sun className="w-4 h-4 shrink-0" />
                          <span className="hidden sm:inline">Claro</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-4 h-4 shrink-0" />
                          <span className="hidden sm:inline">Oscuro</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </header>

              {/* 2. Zona Central (Hero Section) + 3. El Selector de Perfiles (Tarjetas Minimalistas) */}
              <div className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-10">
                {/* Hero Section */}
                <section className="max-w-2xl mx-auto text-center space-y-4">
                  {activeCourseMeta.nombreCurso && (
                    <p
                      className={`text-xs sm:text-sm font-medium tracking-wide ${
                        homeDarkMode ? 'text-sky-400' : 'text-sky-700'
                      }`}
                    >
                      {activeCourseMeta.nombreCurso}
                    </p>
                  )}

                  <h1
                    className={`text-2xl sm:text-4xl font-bold tracking-tight leading-snug ${
                      homeDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    ¡Hola! Te damos la bienvenida a EvaluaPlus.
                  </h1>

                  <p
                    className={`text-sm sm:text-base leading-relaxed ${
                      homeDarkMode ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Tu puerta de entrada digital a un espacio diseñado para gestionar tareas, exámenes y participación de forma sencilla.
                  </p>

                  <p
                    className={`pt-2 text-xs sm:text-sm font-semibold ${
                      homeDarkMode ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    Por favor, selecciona tu perfil para ingresar al panel:
                  </p>
                </section>

                {/* 3. El Selector de Perfiles (Tarjetas Minimalistas) */}
                <section
                  aria-label="Selección de perfil de acceso"
                  className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 items-stretch"
                >
                  {/* Tarjeta 1: Estudiante */}
                  <button
                    type="button"
                    onClick={handleSwitchToStudentLogin}
                    className={`group text-center rounded-2xl p-7 sm:p-8 border transition-all duration-200 flex flex-col items-center justify-between gap-5 cursor-pointer hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                      homeDarkMode
                        ? 'bg-slate-900/90 border-slate-800 hover:border-sky-500 hover:bg-slate-900 shadow-lg shadow-black/20'
                        : 'bg-white border-slate-200/90 hover:border-sky-500 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div className="space-y-3 flex flex-col items-center">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform duration-200 group-hover:scale-105 ${
                          homeDarkMode ? 'bg-sky-950/70' : 'bg-sky-50'
                        }`}
                        aria-hidden="true"
                      >
                        👨‍🎓
                      </div>
                      <h2
                        className={`text-xl font-bold transition-colors ${
                          homeDarkMode
                            ? 'text-white group-hover:text-sky-400'
                            : 'text-slate-900 group-hover:text-sky-700'
                        }`}
                      >
                        Estudiante
                      </h2>
                      <p
                        className={`text-sm leading-relaxed ${
                          homeDarkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        Entra para ver tus tareas y exámenes.
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                        homeDarkMode ? 'text-sky-400' : 'text-sky-700'
                      }`}
                    >
                      <span>Ingresar</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>

                  {/* Tarjeta 2: Docente */}
                  <button
                    type="button"
                    onClick={handleSwitchToTeacherLogin}
                    className={`group text-center rounded-2xl p-7 sm:p-8 border transition-all duration-200 flex flex-col items-center justify-between gap-5 cursor-pointer hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                      homeDarkMode
                        ? 'bg-slate-900/90 border-slate-800 hover:border-emerald-500 hover:bg-slate-900 shadow-lg shadow-black/20'
                        : 'bg-white border-slate-200/90 hover:border-emerald-600 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div className="space-y-3 flex flex-col items-center">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform duration-200 group-hover:scale-105 ${
                          homeDarkMode ? 'bg-emerald-950/70' : 'bg-emerald-50'
                        }`}
                        aria-hidden="true"
                      >
                        👩‍🏫
                      </div>
                      <h2
                        className={`text-xl font-bold transition-colors ${
                          homeDarkMode
                            ? 'text-white group-hover:text-emerald-400'
                            : 'text-slate-900 group-hover:text-emerald-700'
                        }`}
                      >
                        Docente
                      </h2>
                      <p
                        className={`text-sm leading-relaxed ${
                          homeDarkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        Gestiona tus clases y notas.
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                        homeDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                      }`}
                    >
                      <span>Ingresar</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>

                  {/* Tarjeta 3: Editor */}
                  <button
                    type="button"
                    onClick={handleSwitchToEditorLogin}
                    className={`group text-center rounded-2xl p-7 sm:p-8 border transition-all duration-200 flex flex-col items-center justify-between gap-5 cursor-pointer hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      homeDarkMode
                        ? 'bg-slate-900/90 border-slate-800 hover:border-indigo-500 hover:bg-slate-900 shadow-lg shadow-black/20'
                        : 'bg-white border-slate-200/90 hover:border-indigo-600 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div className="space-y-3 flex flex-col items-center">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform duration-200 group-hover:scale-105 ${
                          homeDarkMode ? 'bg-indigo-950/70' : 'bg-indigo-50'
                        }`}
                        aria-hidden="true"
                      >
                        ⚙️
                      </div>
                      <h2
                        className={`text-xl font-bold transition-colors ${
                          homeDarkMode
                            ? 'text-white group-hover:text-indigo-400'
                            : 'text-slate-900 group-hover:text-indigo-700'
                        }`}
                      >
                        Editor
                      </h2>
                      <p
                        className={`text-sm leading-relaxed ${
                          homeDarkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        Modifica cursos, temarios y recursos.
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                        homeDarkMode ? 'text-indigo-400' : 'text-indigo-700'
                      }`}
                    >
                      <span>Ingresar</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </section>
              </div>

              {/* 4. Pie de Página (Footer) */}
              <footer
                className={`w-full border-t py-5 px-4 text-center text-xs transition-colors duration-200 ${
                  homeDarkMode
                    ? 'border-slate-800/80 bg-slate-900/50 text-slate-400'
                    : 'border-slate-200/80 bg-white/70 text-slate-500'
                }`}
              >
                Desarrollado con ❤️ por el Prof. Fenix | © 2026
              </footer>

              {/* Modal Ligero de Ayuda / Soporte */}
              {homeSupportModalOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="home-support-title"
                >
                  <div
                    className={`w-full max-w-md rounded-2xl border p-6 shadow-xl space-y-4 ${
                      homeDarkMode
                        ? 'bg-slate-900 border-slate-800 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-sky-600 shrink-0" />
                        <h3 id="home-support-title" className="text-base font-bold">
                          Ayuda Rápida en el Aula
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHomeSupportModalOpen(false)}
                        aria-label="Cerrar ventana de ayuda"
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          homeDarkMode
                            ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div
                      className={`space-y-3 text-xs sm:text-sm leading-relaxed ${
                        homeDarkMode ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      <div
                        className={`p-3 rounded-xl border ${
                          homeDarkMode
                            ? 'bg-slate-800/60 border-slate-700'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <p className="font-semibold mb-1 text-sky-600">
                          👨‍🎓 ¿Eres estudiante y olvidaste tu código?
                        </p>
                        <p>
                          Ingresa a la tarjeta <strong>Estudiante</strong>, escribe tu número de documento y usa la opción de solicitar apoyo o recuperación en sala para notificar al docente.
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border ${
                          homeDarkMode
                            ? 'bg-slate-800/60 border-slate-700'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <p className="font-semibold mb-1 text-emerald-600">
                          📶 Respaldo automático sin internet
                        </p>
                        <p>
                          Tus respuestas de examen y registros se guardan de forma segura en el dispositivo y se sincronizan automáticamente al restablecer la conexión.
                        </p>
                      </div>

                      <div
                        className={`p-3 rounded-xl border ${
                          homeDarkMode
                            ? 'bg-slate-800/60 border-slate-700'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <p className="font-semibold mb-1 text-indigo-600">
                          ⌨️ Atajos rápidos desde computador
                        </p>
                        <p>
                          Presiona <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono">1</kbd> para Estudiante,{' '}
                          <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono">2</kbd> para Docente o{' '}
                          <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono">3</kbd> para Editor.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setHomeSupportModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Entendido
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
              onActivateCourseWorkspace={handleActivateCourseWorkspace}
            />
          ) : activeView === 'editor' ? (
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center px-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full text-center space-y-2 shadow-xs">
                    <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
                    <div className="text-sm font-bold text-slate-900">
                      Cargando Panel del Editor...
                    </div>
                  </div>
                </div>
              }
            >
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
            </Suspense>
          ) : (
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center px-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full text-center space-y-2 shadow-xs">
                    <RefreshCw className="w-5 h-5 text-slate-800 animate-spin mx-auto" />
                    <div className="text-sm font-bold text-slate-900">
                      Cargando Panel del Docente...
                    </div>
                  </div>
                </div>
              }
            >
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
                encryptedAuditLogs={encryptedAuditLogs}
                onForceFlushEncryptedAuditLogs={handleForceFlushEncryptedAuditLogs}
                isCourseDataHydratedOnDemand={isCourseDataHydratedOnDemand}
              />
            </Suspense>
          )}
        </main>

        {/* Quiet Institutional Footer (Only shown outside the initial gateway screen when a course is configured) */}
        {Boolean(activeCourseMeta.courseId) && !(activeView === 'inicio' && !anySessionActive) && (
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

const OBSOLETE_CACHE_ERROR_PATTERNS: RegExp[] = [
  /ArrowRight is not defined/i,
  /onSwitchToEditorLogin is not defined/i,
  /is not defined/i,
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Cannot read properties of (undefined|null)/i,
  /is not a function/i,
  /is not iterable/i,
  /Unexpected token/i
];

const PROTECTED_LOCAL_STORAGE_KEYS = new Set<string>([
  'evaluaplus_encrypted_audit_logs_v1',
  'evaluaplus_home_dark_mode',
  STORAGE_KEYS.ACTIVE_EXAM_BACKUP
]);

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  {
    hasError: boolean;
    errorMsg: string;
    retryCount: number;
    autoCleanedObsoleteCache: boolean;
  }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMsg: '',
      retryCount: 0,
      autoCleanedObsoleteCache: false
    };
  }

  static isObsoleteCacheError(error: any): boolean {
    const rawMessage = String(error?.message || error || '');
    const rawName = String(error?.name || '');
    const rawStack = String(error?.stack || '');
    const combined = `${rawName} ${rawMessage} ${rawStack}`;

    if (rawName === 'ReferenceError' || rawName === 'SyntaxError' || rawName === 'ChunkLoadError') {
      return true;
    }

    if (OBSOLETE_CACHE_ERROR_PATTERNS.some((pattern) => pattern.test(combined))) {
      return true;
    }

    try {
      const storedVersion = localStorage.getItem('evaluaplus_data_schema_version');
      if (storedVersion && storedVersion !== CURRENT_DATA_SCHEMA_VERSION) {
        return true;
      }
    } catch {
      // ignore storage read error
    }

    return false;
  }

  static purgeObsoleteLocalStorage(reason: string): number {
    let removedCount = 0;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (PROTECTED_LOCAL_STORAGE_KEYS.has(key)) {
          // Validate JSON integrity on protected keys (except simple string flags)
          if (key !== 'evaluaplus_home_dark_mode') {
            try {
              const raw = localStorage.getItem(key);
              if (raw) JSON.parse(raw);
            } catch {
              keysToRemove.push(key);
            }
          }
          continue;
        }
        if (
          key.startsWith('evaluaplus_') ||
          key.startsWith('firebase:previous_websocket_failure') ||
          key.includes('snapshot') ||
          key.includes('cache')
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
        removedCount++;
      });

      stampCurrentSchemaVersion();

      sessionStorage.setItem(
        'evaluaplus_last_auto_cache_cleanup',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          reason,
          removedCount
        })
      );
    } catch {
      // ignore storage errors
    }
    return removedCount;
  }

  static getDerivedStateFromError(error: any) {
    const isObsolete = AppErrorBoundary.isObsoleteCacheError(error);
    return {
      hasError: true,
      errorMsg: error?.message || 'Error inesperado de renderizado',
      autoCleanedObsoleteCache: isObsolete
    };
  }

  componentDidCatch(error: any) {
    const errorMessage = error?.message || 'Excepción de renderizado capturada por ErrorBoundary';
    const isObsoleteCache = AppErrorBoundary.isObsoleteCacheError(error);

    if (isObsoleteCache) {
      const purgedKeys = AppErrorBoundary.purgeObsoleteLocalStorage(errorMessage);
      recordCacheDiagnosticError({
        storageKey: 'AppErrorBoundary (AutoPurgeObsoleteCache)',
        severity: 'warning',
        reason: `Autolimpieza automática de caché obsoleta ejecutada (${purgedKeys} claves depuradas) tras detectar: ${errorMessage}`,
        missingFields: ['obsolete_cache_state'],
        detectedSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
        autoRepaired: true
      });
    } else {
      recordCacheDiagnosticError({
        storageKey: 'AppErrorBoundary (Render)',
        severity: 'error',
        reason: errorMessage,
        missingFields: ['render_component_tree'],
        detectedSchemaVersion: null,
        autoRepaired: true
      });

      try {
        const sanitizeArrayKey = (key: string) => {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            localStorage.removeItem(key);
          }
        };
        sanitizeArrayKey('evaluaplus_saved_roster_dbs_v1');
        sanitizeArrayKey('evaluaplus_saved_question_dbs_v1');
      } catch {
        // ignore
      }
    }

    const maxAutoRetries = isObsoleteCache ? 3 : 2;
    if (this.state.retryCount < maxAutoRetries) {
      setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          errorMsg: '',
          retryCount: prev.retryCount + 1,
          autoCleanedObsoleteCache: isObsoleteCache
        }));
      }, 30);
    }
  }

  render() {
    const maxAutoRetries = this.state.autoCleanedObsoleteCache ? 3 : 2;
    if (this.state.hasError && this.state.retryCount >= maxAutoRetries) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-lg text-center">
            <div className="text-base font-bold text-slate-900">
              Recuperación Automática de Vista
            </div>
            <p className="text-xs text-slate-600">
              Se detectó y depuró automáticamente una versión de caché obsoleta ({this.state.errorMsg}). El sistema está listo para continuar.
            </p>
            <button
              type="button"
              onClick={() => {
                AppErrorBoundary.purgeObsoleteLocalStorage(this.state.errorMsg);
                this.setState({
                  hasError: false,
                  errorMsg: '',
                  retryCount: 0,
                  autoCleanedObsoleteCache: true
                });
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
            >
              Reanudar Panel Ahora
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
