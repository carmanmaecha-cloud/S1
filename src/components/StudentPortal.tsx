import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StudentRecord,
  Question,
  SanitizedQuestion,
  ExamModality,
  ExamAttemptResult,
  LiveClassroomSession,
  SystemConfig,
  BloomLevel,
  CustomMiniRetoTemplate,
  MiniRetoAttemptRecord,
  AntiCheatLogEntry,
  AntiCheatDetectionType
} from '../types';
import { computePayloadChecksum, generateDeterministicAccessCode } from '../data/students';
import {
  INITIAL_QUESTIONS,
  normalizeQuestionList,
  equalizeQuestionPsychometrics
} from '../data/questions';
import { getEffectiveMaxLlamadosAtencion } from '../utils/academicServerSummary';
import {
  StudentPerformanceDashboard,
  ZeroTrialSimulatorModal
} from './StudentPerformanceDashboard';
import { StudentMiniRetosZone } from './StudentMiniRetosZone';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import { useAuthSession } from '../context/AuthContext';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Flag,
  LayoutGrid,
  Printer,
  Wifi,
  WifiOff,
  Lock,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  FileCheck2,
  UserCheck,
  Volume2,
  Sun,
  Type,
  Sparkles,
  QrCode,
  Edit3,
  BarChart3,
  BookOpen,
  Award,
  GraduationCap,
  PlayCircle,
  Maximize2,
  Trophy
} from 'lucide-react';

interface StudentPortalProps {
  students: StudentRecord[];
  onUpdateStudentProfile: (updated: StudentRecord) => void;
  questions: Question[];
  questionsBankExplicitlyCleared?: boolean;
  config: SystemConfig;
  attempts: ExamAttemptResult[];
  onRecordAttempt: (result: ExamAttemptResult, updatedStudent: StudentRecord) => void;
  onRecordRetoAttempt?: (
    studentId: string,
    retoAttempt: MiniRetoAttemptRecord,
    updatedStudent: StudentRecord
  ) => void;
  onRecordAntiCheatEvent?: (studentId: string, logEntry: AntiCheatLogEntry) => void;
  onUpdateLiveSession: (session: LiveClassroomSession | null, studentIdToRemove?: string) => void;
  onSwitchToTeacherLogin: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  logoutSignal?: number;
  customMiniRetos?: CustomMiniRetoTemplate[];
  activeExamsByStudent?: Record<string, any>;
  onSaveActiveExamBackup?: (studentId: string, backup: any | null) => void;
  onForceServerSync?: () => void;
}

const MODALITY_OPTIONS: {
  id: ExamModality;
  title: string;
  subtitle: string;
  badge: string;
  moduloFilter?: 1 | 2 | 3 | 4 | 5;
  questionsCount: number;
  durationMinutes: number;
}[] = [
  {
    id: 'integral',
    title: 'Examen Integral (Módulos 1 al 5)',
    subtitle: '40 preguntas aleatorias balanceadas (8 por módulo) • 80 minutos',
    badge: 'Evaluación Integral · 40 Reactivos · 80 Min',
    questionsCount: 40,
    durationMinutes: 80
  },
  {
    id: 'mod1',
    title: 'Examen Módulo 1: Introducción al Mapeo de Mercado',
    subtitle: '25 preguntas exclusivas del Módulo 1 • 50 minutos',
    badge: 'Módulo 1 · 25 Reactivos · 50 Min',
    moduloFilter: 1,
    questionsCount: 25,
    durationMinutes: 50
  },
  {
    id: 'mod2',
    title: 'Examen Módulo 2: Comportamiento del Consumidor',
    subtitle: '25 preguntas exclusivas del Módulo 2 • 50 minutos',
    badge: 'Módulo 2 · 25 Reactivos · 50 Min',
    moduloFilter: 2,
    questionsCount: 25,
    durationMinutes: 50
  },
  {
    id: 'mod3',
    title: 'Examen Módulo 3: Investigación de Mercados',
    subtitle: '25 preguntas exclusivas del Módulo 3 • 50 minutos',
    badge: 'Módulo 3 · 25 Reactivos · 50 Min',
    moduloFilter: 3,
    questionsCount: 25,
    durationMinutes: 50
  },
  {
    id: 'mod4',
    title: 'Examen Módulo 4: Segmentación y Posicionamiento',
    subtitle: '25 preguntas exclusivas del Módulo 4 • 50 minutos',
    badge: 'Módulo 4 · 25 Reactivos · 50 Min',
    moduloFilter: 4,
    questionsCount: 25,
    durationMinutes: 50
  },
  {
    id: 'mod5',
    title: 'Examen Módulo 5: Tendencias del Mercado y Consumidor',
    subtitle: '25 preguntas exclusivas del Módulo 5 • 50 minutos',
    badge: 'Módulo 5 · 25 Reactivos · 50 Min',
    moduloFilter: 5,
    questionsCount: 25,
    durationMinutes: 50
  }
];

const ACTIVE_EXAM_BACKUP_KEY = 'evaluaplus_active_exam_backup_v2';

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Generates a deterministic 21x21 SVG QR matrix from a verification string
 */
function VerificationQrSvg({ payload }: { payload: string }) {
  const size = 21;
  const cells: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (r0 + r < size && c0 + c < size) {
          cells[r0 + r][c0 + c] = isBorder || isInner;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinderTopLeft = r < 8 && c < 8;
      const inFinderTopRight = r < 8 && c >= size - 8;
      const inFinderBottomLeft = r >= size - 8 && c < 8;
      if (inFinderTopLeft || inFinderTopRight || inFinderBottomLeft) continue;
      const bit = ((hash >>> ((r * size + c) % 28)) ^ (r * 13 + c * 7)) & 1;
      cells[r][c] = bit === 1;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-24 h-24 border border-slate-300 rounded p-1 bg-white shrink-0"
      aria-label="Código QR de Verificación Oficial"
    >
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#0f172a" />
          ) : null
        )
      )}
    </svg>
  );
}

export function StudentPortal({
  students,
  onUpdateStudentProfile,
  questions,
  questionsBankExplicitlyCleared = false,
  config,
  attempts,
  onRecordAttempt,
  onRecordRetoAttempt,
  onRecordAntiCheatEvent,
  onUpdateLiveSession,
  onSwitchToTeacherLogin,
  onSessionActiveChange,
  logoutSignal,
  customMiniRetos = [],
  onSaveActiveExamBackup,
  onForceServerSync
}: StudentPortalProps) {
  // Step 1: Dual Authentication State (Clean Initial Screen)
  const [docIdInput, setDocIdInput] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [classroomPinInput, setClassroomPinInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [thirdAttemptBlockedModal, setThirdAttemptBlockedModal] = useState<{
    student: StudentRecord;
    bestGrade: number;
    att1: number | null;
    att2: number | null;
    modalidadLabel?: string;
  } | null>(null);

  // Step 2: Verified Student Session & Active Student Dashboard Sub-tabs (Persisted via AuthContext + sessionStorageWrapper)
  const {
    authState,
    loginStudent,
    logoutStudent,
    setStudentDashboardTab: persistStudentTab,
    setSelectedModality: persistSelectedModality,
    setStudentExamPhase: persistStudentExamPhase
  } = useAuthSession();
  const { handleExecuteServerSave } = useServerSave();

  const [verifiedStudentId, setVerifiedStudentId] = useState<string | null>(() =>
    authState.studentSessionActive && authState.verifiedStudentId
      ? authState.verifiedStudentId
      : null
  );
  const [studentDashboardTab, setStudentDashboardTabState] = useState<
    'modalidades' | 'mis_notas' | 'diagnostico_pedagogico' | 'mini_retos'
  >(() => authState.studentDashboardTab || 'modalidades');
  const [selectedModality, setSelectedModalityState] = useState<ExamModality>(
    () => authState.selectedModality || 'integral'
  );

  const setStudentDashboardTab = useCallback(
    (tab: 'modalidades' | 'mis_notas' | 'diagnostico_pedagogico' | 'mini_retos') => {
      setStudentDashboardTabState(tab);
      persistStudentTab(tab);
    },
    [persistStudentTab]
  );

  const setSelectedModality = useCallback(
    (mod: ExamModality) => {
      setSelectedModalityState(mod);
      persistSelectedModality(mod);
    },
    [persistSelectedModality]
  );

  // Edit Student Profile Modal (Name & Access Code editable, ID Read-only)
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileCodeInput, setProfileCodeInput] = useState('');
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);

  // Pre-Exam Induction Confirmation Modal (1-Warning Rule Induction) & Zero Trial Simulator
  const [inductionModalOpen, setInductionModalOpen] = useState(false);
  const [zeroTrialModalOpen, setZeroTrialModalOpen] = useState(false);

  // Monotonic Clock Synchronization (performance.now() decoupled from OS wall clock tampering)
  const bootPerfNowRef = useRef<number>(performance.now());
  const bootWallTimeMsRef = useRef<number>(Date.now());
  const examStartPerfRef = useRef<number>(performance.now());
  const examDurationSecRef = useRef<number>(80 * 60);
  const questionEnteredPerfRef = useRef<number>(performance.now());
  const lastMouseOrKeyPerfRef = useRef<number>(performance.now());
  const [secondsOnCurrentQuestion, setSecondsOnCurrentQuestion] = useState<number>(0);
  const [mouseIdleSeconds, setMouseIdleSeconds] = useState<number>(0);
  const [isSplitScreenDetected, setIsSplitScreenDetected] = useState<boolean>(false);
  const [isExtendedMonitorDetected, setIsExtendedMonitorDetected] = useState<boolean>(false);

  // Dynamic Modality Options derived from Teacher Custom Exam Configurator («Constructor de Pruebas a Medida»)
  const activeModalityOptions = useMemo(() => {
    const intQ = Math.max(5, Number(config.preguntasExamenIntegral) || 40);
    const intMin = Math.max(5, Number(config.tiempoExamenIntegralMin) || 80);
    const modQ = Math.max(5, Number(config.preguntasExamenModulo) || 25);
    const modMin = Math.max(5, Number(config.tiempoExamenModuloMin) || 50);
    const perModInIntegral = Math.max(1, Math.floor(intQ / 5));

    return MODALITY_OPTIONS.map((m) => {
      if (m.id === 'integral') {
        return {
          ...m,
          subtitle: `${intQ} preguntas aleatorias balanceadas (~${perModInIntegral} por módulo) • ${intMin} minutos`,
          badge: `Evaluación Integral · ${intQ} Reactivos · ${intMin} Min`,
          questionsCount: intQ,
          durationMinutes: intMin
        };
      }
      return {
        ...m,
        subtitle: `${modQ} preguntas exclusivas del Módulo ${m.moduloFilter} • ${modMin} minutos`,
        badge: `Módulo ${m.moduloFilter} · ${modQ} Reactivos · ${modMin} Min`,
        questionsCount: modQ,
        durationMinutes: modMin
      };
    });
  }, [
    config.preguntasExamenIntegral,
    config.tiempoExamenIntegralMin,
    config.preguntasExamenModulo,
    config.tiempoExamenModuloMin
  ]);

  // Step 3: Active Exam State (Restores active student session across page reload)
  const [examPhase, setExamPhaseState] = useState<
    'login' | 'modality_select' | 'active_exam' | 'results'
  >(() => {
    if (authState.studentSessionActive && authState.verifiedStudentId) {
      return 'modality_select';
    }
    return 'login';
  });

  const setExamPhase = useCallback(
    (phase: 'login' | 'modality_select' | 'active_exam' | 'results') => {
      setExamPhaseState(phase);
      persistStudentExamPhase(phase);
    },
    [persistStudentExamPhase]
  );
  const [activeQuestions, setActiveQuestions] = useState<SanitizedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(80 * 60);
  const [totalExamSeconds, setTotalExamSeconds] = useState(80 * 60);
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState<1 | 2>(1);
  const [payloadChecksum, setPayloadChecksum] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // DUA Live Accessibility Toolbar State
  const [duaFontSize, setDuaFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [duaWarmPaper, setDuaWarmPaper] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Anti-Cheat & Review Drawer States
  const [warningsCount, setWarningsCount] = useState(0);
  const [warningModalText, setWarningModalText] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string>('✓ Sin infracciones');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);
  const [finishedResult, setFinishedResult] = useState<ExamAttemptResult | null>(null);
  const attemptAntiCheatLogsRef = useRef<AntiCheatLogEntry[]>([]);
  const lastInfractionTimeMsRef = useRef<number>(0);
  const rapidAnswerStreakRef = useRef<number>(0);
  const lastAnswerPerfRef = useRef<number>(0);

  // Effective Anti-Cheat Config Flags for Exams (all default to true if undefined)
  const isExamAntiCheatMasterEnabled = config.antiTrampaExamenesActivo !== false;
  const isExamFocusGuardEnabled =
    isExamAntiCheatMasterEnabled && config.examenBloquearCambioPestanaFoco !== false;
  const isTabSwitchGuardEnabled =
    isExamFocusGuardEnabled && config.detectarCambioPestana !== false;
  const isMinimizeGuardEnabled =
    isExamFocusGuardEnabled && config.detectarMinimizarPestana !== false;
  const isAppSwitchGuardEnabled =
    isExamFocusGuardEnabled && config.detectarCambioAplicacion !== false;
  const isPointerAndDevToolsGuardEnabled =
    isExamAntiCheatMasterEnabled && config.detectarSalidaPunteroDevToolsIA !== false;
  const isRapidClickBurstGuardEnabled =
    isExamAntiCheatMasterEnabled && config.detectarRafagaRespuestaRapidaIA !== false;
  const isExamCopyShortcutGuardEnabled =
    isExamAntiCheatMasterEnabled && config.examenBloquearCopiaClicDerechoAtajos !== false;
  const isExamFullscreenGuardEnabled =
    isExamAntiCheatMasterEnabled && config.examenExigirPantallaCompleta !== false;
  const isExamSplitScreenGuardEnabled =
    isExamAntiCheatMasterEnabled && config.exigirPantallaMaximizada !== false;
  const isExamPsychometricEqualizerEnabled = config.ecualizadorPsicometricoActivo !== false;
  const isExamShuffleOptionsEnabled = config.barajarOpciones !== false;

  // Always lookup fresh student object from props
  const currentStudent = verifiedStudentId
    ? students.find((s) => s.id === verifiedStudentId) || null
    : null;

  // Effective allowed warnings ("llamados de atención") for this student (individual override or global default)
  const maxLlamadosPermitidos = useMemo(
    () => getEffectiveMaxLlamadosAtencion(currentStudent, config),
    [currentStudent, config]
  );

  // Notify parent App when a student session is active so the opposite panel is hidden
  useEffect(() => {
    const isSessionActive = Boolean(verifiedStudentId && examPhase !== 'login');
    onSessionActiveChange?.(isSessionActive);
  }, [verifiedStudentId, examPhase, onSessionActiveChange]);

  // Listen for global Cerrar Sesión button click from top header
  useEffect(() => {
    if (!logoutSignal) return;
    if (verifiedStudentId) {
      onUpdateLiveSession(null, verifiedStudentId);
    }
    logoutStudent();
    setVerifiedStudentId(null);
    setDocIdInput('');
    setAccessCodeInput('');
    setClassroomPinInput('');
    setThirdAttemptBlockedModal(null);
    setInductionModalOpen(false);
    setConfirmSubmitModal(false);
    setDrawerOpen(false);
    setFinishedResult(null);
    setExamPhase('login');
  }, [logoutSignal, verifiedStudentId, onUpdateLiveSession, logoutStudent, setExamPhase]);

  // Normalize active question bank from server (falls back to INITIAL_QUESTIONS only if empty and not explicitly cleared)
  const safeQuestions = useMemo(() => {
    if (Array.isArray(questions) && questions.length > 0) {
      return normalizeQuestionList(questions);
    }
    if (questionsBankExplicitlyCleared) {
      return [];
    }
    return normalizeQuestionList(INITIAL_QUESTIONS);
  }, [questions, questionsBankExplicitlyCleared]);

  // Student's own completed attempts
  const studentAttempts = useMemo(() => {
    if (!currentStudent) return [];
    return attempts
      .filter((a) => a && a.studentId === currentStudent.id)
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [attempts, currentStudent]);

  // Student's Pedagogical Diagnostics (Modules & Bloom Taxonomy & Weak Topics)
  const studentDiagnostics = useMemo(() => {
    const modStats: Record<number, { total: number; correct: number }> = {
      1: { total: 0, correct: 0 },
      2: { total: 0, correct: 0 },
      3: { total: 0, correct: 0 },
      4: { total: 0, correct: 0 },
      5: { total: 0, correct: 0 }
    };

    const bloomStats: Record<BloomLevel, { total: number; correct: number }> = {
      Conocer: { total: 0, correct: 0 },
      Comprensión: { total: 0, correct: 0 },
      Aplicación: { total: 0, correct: 0 },
      Análisis: { total: 0, correct: 0 },
      Evaluación: { total: 0, correct: 0 }
    };

    const topicErrors: Record<string, { total: number; errors: number; modulo: number }> = {};

    studentAttempts.forEach((att) => {
      const details = Array.isArray(att?.respuestasDetalle) ? att.respuestasDetalle : [];
      details.forEach((r) => {
        if (!r) return;
        if (modStats[r.modulo]) {
          modStats[r.modulo].total++;
          if (r.acierto) modStats[r.modulo].correct++;
        }
        if (bloomStats[r.bloom]) {
          bloomStats[r.bloom].total++;
          if (r.acierto) bloomStats[r.bloom].correct++;
        }
        if (!topicErrors[r.tema]) {
          topicErrors[r.tema] = { total: 0, errors: 0, modulo: r.modulo };
        }
        topicErrors[r.tema].total++;
        if (!r.acierto) {
          topicErrors[r.tema].errors++;
        }
      });
    });

    const weakTopics = Object.entries(topicErrors)
      .filter(([, data]) => data.errors > 0)
      .map(([tema, data]) => ({
        tema,
        modulo: data.modulo,
        total: data.total,
        errorRate: data.total > 0 ? Math.round((data.errors / data.total) * 100) : 0
      }))
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 6);

    return { modStats, bloomStats, weakTopics };
  }, [studentAttempts]);

  // Online / Offline Resilience Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Stop TTS when changing question or exiting exam
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [currentIndex, examPhase]);

  const handleToggleSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    const currentQ = activeQuestions[currentIndex];
    if (!currentQ) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToRead = `Pregunta ${currentIndex + 1}. Módulo ${currentQ.modulo}. ${currentQ.enunciado}. Opción A: ${currentQ.opciones.A}. Opción B: ${currentQ.opciones.B}. Opción C: ${currentQ.opciones.C}. Opción D: ${currentQ.opciones.D}.`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-CO';
    utterance.rate = 0.98;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Check if time window allows login (Synchronized via monotonic performance.now() to prevent OS clock manipulation)
  const isWithinAllowedTimeWindow = (): { allowed: boolean; message?: string } => {
    if (!config.ventanaHorariaActiva || !config.horaInicioPermitida || !config.horaFinPermitida) {
      return { allowed: true };
    }
    const elapsedSinceBootMs = performance.now() - bootPerfNowRef.current;
    const trustedTimestampMs = bootWallTimeMsRef.current + elapsedSinceBootMs;
    const clockDriftSec = Math.abs(Date.now() - trustedTimestampMs) / 1000;
    if (clockDriftSec > 180) {
      return {
        allowed: false,
        message:
          'Se detectó una alteración manual en el reloj del sistema operativo respecto al reloj monotónico de seguridad. Restaure la hora automática de su dispositivo.'
      };
    }
    const now = new Date(trustedTimestampMs);
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const allowedDays = config.diasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
    if (!allowedDays.includes(now.getDay())) {
      const allowedDaysLabels = allowedDays.map((d) => dayNames[d]).join(', ');
      return {
        allowed: false,
        message: `El acceso al examen no está habilitado hoy (${dayNames[now.getDay()]}). Días autorizados: ${allowedDaysLabels || 'Ninguno'}.`
      };
    }
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (currentHHMM < config.horaInicioPermitida || currentHHMM > config.horaFinPermitida) {
      return {
        allowed: false,
        message: `El acceso al examen solo está habilitado en la ventana horaria autorizada (${config.horaInicioPermitida} a ${config.horaFinPermitida}). Hora verificada: ${currentHHMM}.`
      };
    }
    return { allowed: true };
  };

  // Validate Dual Credentials (Step 1 -> Step 2)
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setThirdAttemptBlockedModal(null);

    const windowCheck = isWithinAllowedTimeWindow();
    if (!windowCheck.allowed) {
      setLoginError(windowCheck.message || 'Fuera de horario permitido.');
      return;
    }

    const cleanId = docIdInput.trim().replace(/[\s.-]/g, '').toUpperCase();
    const cleanCode = accessCodeInput.trim().toUpperCase();

    if (!cleanId || !cleanCode) {
      setLoginError('Código de acceso de sesión inválido para este ID de estudiante. Solicite su código al docente.');
      return;
    }

    if (config.exigirPinAula) {
      if (classroomPinInput.trim().toUpperCase() !== config.pinAulaDia.trim().toUpperCase()) {
        setLoginError('El PIN de Aula del Día ingresado no coincide con el proyectado por el docente en el salón.');
        return;
      }
    }

    // Find student in official roster (ignores dots, spaces or hyphens in document ID)
    const matchedStudent = students.find(
      (s) => s.id.trim().replace(/[\s.-]/g, '').toUpperCase() === cleanId
    );

    const isOfficialTestCredentials =
      cleanId === '1000000000' &&
      (cleanCode === '1000000000' || cleanCode === 'MM260000DEMO' || cleanCode === 'DEMO2026');

    const storedStudentCode = (matchedStudent?.codigoAcceso || '').trim().toUpperCase();
    const deterministicFallback = matchedStudent
      ? generateDeterministicAccessCode(matchedStudent.id).toUpperCase()
      : '';
    const isStudentCodeValid =
      Boolean(matchedStudent) &&
      (storedStudentCode === cleanCode ||
        (!storedStudentCode && deterministicFallback === cleanCode) ||
        isOfficialTestCredentials);

    if (!matchedStudent || !isStudentCodeValid) {
      setLoginError('Código de acceso de sesión inválido para este ID de estudiante. Solicite su código al docente.');
      return;
    }

    if (matchedStudent.suspendido) {
      setLoginError(
        `Acceso suspendido por sanción académica (${matchedStudent.conceptoInfraccion}). Solicite autorización al docente en el aula.`
      );
      return;
    }

    // Credentials verified! Allow student into the portal even if Estado Maestro del Examen is CERRADO
    // so they can always access "Zona de Retos & Insignias", "Calificaciones", and "Diagnóstico"
    // (only starting a new exam attempt is restricted when Estado Maestro del Examen is CERRADO).
    onForceServerSync?.();
    setVerifiedStudentId(matchedStudent.id);
    loginStudent(matchedStudent.id);
    setProfileNameInput(matchedStudent.nombre);
    setProfileCodeInput(matchedStudent.codigoAcceso);
    setExamPhase('modality_select');
  };

  // Save Student Self-Service Profile Update (Name & Access Code, ID Read-Only)
  const handleSaveStudentProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent) return;
    const cleanName = profileNameInput.trim();
    const cleanCode = profileCodeInput.trim().toUpperCase();
    if (!cleanName || cleanCode.length < 6) {
      setProfileSaveMsg('Ingrese su nombre completo y un código válido (mínimo 6 caracteres).');
      return;
    }
    const updated: StudentRecord = {
      ...currentStudent,
      nombre: cleanName,
      codigoAcceso: cleanCode
    };
    onUpdateStudentProfile(updated);
    void handleExecuteServerSave(
      'estudiante_perfil_datos',
      `Actualización automática de perfil del estudiante (${updated.nombre})`
    );
    setProfileSaveMsg('✓ Sus datos (Nombre y Código de Acceso) se actualizaron automáticamente en la Base de Datos del Servidor.');
    setTimeout(() => {
      setProfileSaveMsg(null);
      setEditProfileModalOpen(false);
    }, 1500);
  };

  // Helper to explicitly count completed attempts stored in `attempts` for a given student and exam modality
  const getExamAttemptCount = useCallback(
    (studentId: string, modalityId: ExamModality): number => {
      return attempts.filter(
        (a) =>
          Boolean(a) &&
          a.studentId === studentId &&
          (a.modalidad || 'integral') === modalityId
      ).length;
    },
    [attempts]
  );

  // Helper to get full attempt stats for a specific modality from `attempts`
  const getModalityAttemptStats = useCallback(
    (modalityId: ExamModality) => {
      if (!currentStudent) {
        return {
          count: 0,
          maxAllowed: 2,
          att1: null as ExamAttemptResult | null,
          att2: null as ExamAttemptResult | null,
          bestGrade: 0,
          isBlockedByTeacher: false,
          hasTwoAttempts: false,
          isExhausted: false
        };
      }
      const modAttempts = attempts
        .filter(
          (a) =>
            Boolean(a) &&
            a.studentId === currentStudent.id &&
            (a.modalidad || 'integral') === modalityId
        )
        .sort((a, b) => a.intentoNumero - b.intentoNumero);

      const countFromAttempts = getExamAttemptCount(currentStudent.id, modalityId);
      const maxAllowed = Math.min(2, currentStudent.maxIntentosPermitidos ?? 2);
      const att1 = modAttempts[0] || null;
      const att2 = modAttempts[1] || null;
      const bestGrade =
        modAttempts.length > 0 ? Math.max(...modAttempts.map((m) => m.notaColombiana)) : 0;
      const isBlockedByTeacher = Boolean(currentStudent.examenesBloqueados?.includes(modalityId));
      const hasTwoAttempts = countFromAttempts >= 2;
      const isExhausted = hasTwoAttempts || countFromAttempts >= maxAllowed;

      return {
        count: countFromAttempts,
        maxAllowed,
        att1,
        att2,
        bestGrade,
        isBlockedByTeacher,
        hasTwoAttempts,
        isExhausted
      };
    },
    [currentStudent, attempts, getExamAttemptCount]
  );

  // Refactored exam modality selection handler that explicitly verifies the attempt counter in `attempts`
  const handleSelectExamModality = useCallback(
    (modalityId: ExamModality, attemptToStart = false) => {
      if (!currentStudent) return;
      setSelectedModality(modalityId);

      const modConfig =
        activeModalityOptions.find((m) => m.id === modalityId) || activeModalityOptions[0];
      const st = getModalityAttemptStats(modalityId);

      if (st.count >= 2 || st.isExhausted) {
        setThirdAttemptBlockedModal({
          student: currentStudent,
          bestGrade: st.bestGrade,
          att1: st.att1 ? st.att1.notaColombiana : null,
          att2: st.att2 ? st.att2.notaColombiana : null,
          modalidadLabel: modConfig.title
        });
        setInductionModalOpen(false);
        return;
      }

      setThirdAttemptBlockedModal(null);
      const isMasterClosedForCurrentStudent =
        !config.examenAbierto ||
        Boolean((config.estudiantesConEstadoCerrado || []).includes(currentStudent.id));
      if (attemptToStart && !st.isBlockedByTeacher && !isMasterClosedForCurrentStudent) {
        setInductionModalOpen(true);
      }
    },
    [currentStudent, activeModalityOptions, getModalityAttemptStats, config.examenAbierto, config.estudiantesConEstadoCerrado]
  );

  // Helper to return to the main student panel and select an available exam modality
  const handleReturnToMainStudentPanel = useCallback(
    (excludeModalityId?: ExamModality) => {
      const candidate = activeModalityOptions.find((m) => {
        if (excludeModalityId && m.id === excludeModalityId) return false;
        const st = getModalityAttemptStats(m.id);
        return st.count < 2 && !st.isExhausted && !st.isBlockedByTeacher;
      });
      if (candidate) {
        setSelectedModality(candidate.id);
      }
      setThirdAttemptBlockedModal(null);
      setInductionModalOpen(false);
      setStudentDashboardTab('modalidades');
      setFinishedResult(null);
      setExamPhase('modality_select');
    },
    [activeModalityOptions, getModalityAttemptStats]
  );

  // Build non-repeating sanitized questions for Attempt 1 or Attempt 2 of the selected modality
  const startExamWithModality = () => {
    if (!currentStudent) return;

    const modConfig =
      activeModalityOptions.find((m) => m.id === selectedModality) || activeModalityOptions[0];
    const modStats = getModalityAttemptStats(selectedModality);

    if (modStats.isBlockedByTeacher) {
      setLoginError('Esta modalidad de examen ha sido bloqueada para su usuario por el docente.');
      return;
    }

    // Strict 2-attempt check per modality (3rd access blocked immediately)
    if (modStats.isExhausted) {
      setThirdAttemptBlockedModal({
        student: currentStudent,
        bestGrade: modStats.bestGrade,
        att1: modStats.att1 ? modStats.att1.notaColombiana : null,
        att2: modStats.att2 ? modStats.att2.notaColombiana : null,
        modalidadLabel: modConfig.title
      });
      setInductionModalOpen(false);
      return;
    }

    const attemptNum: 1 | 2 = modStats.count === 0 ? 1 : 2;

    // Collect all question IDs used in Attempt 1 for this specific modality so Attempt 2 NEVER repeats any question from Attempt 1
    const prevModUsed = Array.isArray(currentStudent.preguntasUsadasPorModalidad?.[selectedModality])
      ? currentStudent.preguntasUsadasPorModalidad[selectedModality]!
      : [];
    const prevAtt1Details = Array.isArray(modStats.att1?.respuestasDetalle)
      ? modStats.att1.respuestasDetalle.map((r) => r.questionId)
      : [];

    const usedIdsInModality = new Set<string>([...prevModUsed, ...prevAtt1Details]);

    let chosenRaw: Question[] = [];
    const targetCount = Math.max(5, modConfig.questionsCount || (selectedModality === 'integral' ? 40 : 25));

    if (selectedModality === 'integral') {
      // Balanced across Modules 1 to 5 according to configured question count
      const perMod = Math.max(1, Math.floor(targetCount / 5));
      const remainder = Math.max(0, targetCount - perMod * 5);
      for (let mod = 1 as 1 | 2 | 3 | 4 | 5; mod <= 5; mod++) {
        const takeCount = perMod + (mod <= remainder ? 1 : 0);
        const modQuestions = safeQuestions.filter((q) => Number(q.modulo) === mod);
        const effectiveModQuestions =
          modQuestions.length > 0
            ? modQuestions
            : INITIAL_QUESTIONS.filter((q) => Number(q.modulo) === mod);
        const pool = effectiveModQuestions.filter((q) => !usedIdsInModality.has(q.id));
        const fallbackPool = pool.length >= takeCount ? pool : effectiveModQuestions;
        const picked = shuffleArray(fallbackPool).slice(0, takeCount);
        chosenRaw.push(...picked);
      }
      chosenRaw = shuffleArray(chosenRaw);
    } else {
      // Questions exclusively from the selected module according to configured question count
      const targetMod = modConfig.moduloFilter || 1;
      const modQuestions = safeQuestions.filter((q) => Number(q.modulo) === targetMod);
      const effectiveModQuestions =
        modQuestions.length > 0
          ? modQuestions
          : INITIAL_QUESTIONS.filter((q) => Number(q.modulo) === targetMod);
      const pool = effectiveModQuestions.filter((q) => !usedIdsInModality.has(q.id));
      const fallbackPool = pool.length >= targetCount ? pool : effectiveModQuestions;
      chosenRaw = shuffleArray(fallbackPool).slice(0, targetCount);
    }

    // Sanitize payload for client: equalize psychometrics ("con cascarita" + equal length + mini-explanation in all options), omit `correcta` and `justificacion`, and shuffle options A/B/C/D
    const sanitized: SanitizedQuestion[] = chosenRaw.map((rawQ, idx) => {
      const q = isExamPsychometricEqualizerEnabled
        ? equalizeQuestionPsychometrics(rawQ, idx)
        : rawQ;
      const safeOpts = q.opciones || {
        A: 'Opción A',
        B: 'Opción B',
        C: 'Opción C',
        D: 'Opción D'
      };
      if (isExamShuffleOptionsEnabled) {
        const originalLetters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
        const permuted = shuffleArray(originalLetters);
        const mapaOrdenOpciones = {
          A: permuted[0],
          B: permuted[1],
          C: permuted[2],
          D: permuted[3]
        };
        return {
          id: q.id,
          modulo: q.modulo,
          tema: q.tema,
          bloom: q.bloom,
          enunciado: q.enunciado,
          tipoPregunta: q.tipoPregunta,
          nivel: q.nivel,
          rap: q.rap,
          contexto: q.contexto,
          pregunta: q.pregunta,
          opciones: {
            A: safeOpts[permuted[0]] || 'Opción A',
            B: safeOpts[permuted[1]] || 'Opción B',
            C: safeOpts[permuted[2]] || 'Opción C',
            D: safeOpts[permuted[3]] || 'Opción D'
          },
          mapaOrdenOpciones,
          casoGrafico: q.casoGrafico
        };
      }

      return {
        id: q.id,
        modulo: q.modulo,
        tema: q.tema,
        bloom: q.bloom,
        enunciado: q.enunciado,
        tipoPregunta: q.tipoPregunta,
        nivel: q.nivel,
        rap: q.rap,
        contexto: q.contexto,
        pregunta: q.pregunta,
        opciones: {
          A: safeOpts.A || 'Opción A',
          B: safeOpts.B || 'Opción B',
          C: safeOpts.C || 'Opción C',
          D: safeOpts.D || 'Opción D'
        },
        casoGrafico: q.casoGrafico
      };
    });

    const durationSec = modConfig.durationMinutes * 60;
    const checksum = computePayloadChecksum(
      sanitized.map((q) => q.id),
      currentStudent.id,
      attemptNum
    );

    examStartPerfRef.current = performance.now();
    examDurationSecRef.current = durationSec;
    questionEnteredPerfRef.current = performance.now();
    lastMouseOrKeyPerfRef.current = performance.now();
    perQuestionSecondsRef.current = {};
    setSecondsOnCurrentQuestion(0);
    setMouseIdleSeconds(0);

    setActiveQuestions(sanitized);
    setCurrentIndex(0);
    setAnswers({});
    setMarkedForReview({});
    setTimeLeftSeconds(durationSec);
    setTotalExamSeconds(durationSec);
    setCurrentAttemptNumber(attemptNum);
    setPayloadChecksum(checksum);
    setWarningsCount(0);
    setSuspensionReason('✓ Sin infracciones');
    setWarningModalText(null);
    attemptAntiCheatLogsRef.current = [];
    rapidAnswerStreakRef.current = 0;
    lastAnswerPerfRef.current = performance.now();
    setConfirmSubmitModal(false);
    setDrawerOpen(false);
    setInductionModalOpen(false);
    if (isExamFullscreenGuardEnabled) {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // ignore if blocked by iframe policy
      }
    }
    setExamPhase('active_exam');
  };

  // Ref for timeLeftSeconds and per-question seconds so callbacks and effects don't re-bind every 1 second
  const timeLeftRef = useRef(timeLeftSeconds);
  const perQuestionSecondsRef = useRef<Record<string, number>>({});
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    timeLeftRef.current = timeLeftSeconds;
  }, [timeLeftSeconds]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Finalize & Grade Exam (Normal Submit, Time-Out Auto-Submit, or Anti-Cheat Suspension)
  const finalizeExam = useCallback(
    (isSuspended: boolean, customInfractionConcept?: string) => {
      if (!currentStudent || activeQuestions.length === 0) return;

      const modConfig = MODALITY_OPTIONS.find((m) => m.id === selectedModality) || MODALITY_OPTIONS[0];
      const modStats = getModalityAttemptStats(selectedModality);
      const questionLookup = new Map<string, Question>();
      INITIAL_QUESTIONS.forEach((q) => questionLookup.set(q.id, q));
      safeQuestions.forEach((q) => questionLookup.set(q.id, q));

      const totalQ = activeQuestions.length;
      const elapsedSec = Math.max(1, totalExamSeconds - timeLeftRef.current);
      const fallbackAvgSec = Math.max(1, Math.round(elapsedSec / Math.max(1, totalQ)));

      let aciertosCount = 0;
      const detalle = activeQuestions.map((sq) => {
        const masterQ = questionLookup.get(sq.id);
        const displayedLetterChosen = answers[sq.id] || null;
        const chosenOriginalLetter =
          displayedLetterChosen && sq.mapaOrdenOpciones
            ? sq.mapaOrdenOpciones[displayedLetterChosen]
            : displayedLetterChosen;

        const correcta = masterQ ? masterQ.correcta : 'A';
        const isCorrect = !isSuspended && chosenOriginalLetter === correcta;
        if (isCorrect) aciertosCount++;

        const trackedSec = perQuestionSecondsRef.current[sq.id];
        const tiempoSegundos =
          typeof trackedSec === 'number' && trackedSec > 0 ? trackedSec : fallbackAvgSec;

        return {
          questionId: sq.id,
          modulo: sq.modulo,
          tema: sq.tema,
          bloom: sq.bloom,
          enunciado: sq.enunciado,
          opciones: masterQ ? masterQ.opciones : sq.opciones,
          elegida: chosenOriginalLetter,
          correcta,
          acierto: isCorrect,
          justificacion: masterQ
            ? masterQ.justificacion
            : 'Justificación verificada en el banco curricular.',
          tiempoSegundos
        };
      });

      const rawNota = isSuspended ? 0.0 : Number(((aciertosCount / totalQ) * 5.0).toFixed(1));
      const porcentaje = isSuspended ? 0 : Math.round((aciertosCount / totalQ) * 100);
      const finalConcept = isSuspended
        ? customInfractionConcept || suspensionReason || 'Suspendido por infracción de seguridad'
        : warningsCount > 0
        ? `${warningsCount}/${maxLlamadosPermitidos} Llamado(s) preventivo(s) (${suspensionReason})`
        : '✓ Sin infracciones';

      const minPassingGrade = Number(config.notaMinimaAprobacion) || 3.0;
      const estadoFinal: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO' = isSuspended
        ? 'SUSPENDIDO'
        : rawNota >= minPassingGrade
        ? 'APROBADO'
        : 'REPROBADO';

      const fechaStr = new Date().toLocaleString('es-CO');
      const firma = `VERIF-${currentStudent.codigoAcceso}-I${currentAttemptNumber}-${rawNota.toFixed(
        1
      )}-${payloadChecksum.slice(-6)}`;

      const result: ExamAttemptResult = {
        attemptId: `ATT-${currentStudent.id}-${selectedModality}-${currentAttemptNumber}-${Date.now()}`,
        fecha: fechaStr,
        timestampMs: Date.now(),
        studentId: currentStudent.id,
        studentName: currentStudent.nombre,
        codigoSesion: currentStudent.codigoAcceso,
        intentoNumero: currentAttemptNumber,
        modalidad: selectedModality,
        modalidadLabel: modConfig.title,
        totalPreguntas: totalQ,
        aciertos: aciertosCount,
        incorrectas: totalQ - aciertosCount,
        notaColombiana: rawNota,
        porcentaje,
        tiempoEmpleadoSegundos: elapsedSec,
        estado: estadoFinal,
        conceptoInfraccion: finalConcept,
        incidenciasCount: isSuspended ? Math.max(warningsCount, maxLlamadosPermitidos + 1) : warningsCount,
        maxLlamadosPermitidosEnIntento: maxLlamadosPermitidos,
        historialLlamadosIntento: [...attemptAntiCheatLogsRef.current],
        firmaVerificacion: firma,
        respuestasDetalle: detalle
      };

      const usedIds = activeQuestions.map((q) => q.id);
      const prevModalityUsed = Array.isArray(
        currentStudent.preguntasUsadasPorModalidad?.[selectedModality]
      )
        ? currentStudent.preguntasUsadasPorModalidad[selectedModality]!
        : [];
      const prevIntento1 = Array.isArray(currentStudent.preguntasIntento1)
        ? currentStudent.preguntasIntento1
        : [];
      const prevIntento2 = Array.isArray(currentStudent.preguntasIntento2)
        ? currentStudent.preguntasIntento2
        : [];
      const prevStudentLogs = Array.isArray(currentStudent.historialLlamadosAtencion)
        ? currentStudent.historialLlamadosAtencion
        : [];

      const updatedStudent: StudentRecord = {
        ...currentStudent,
        intentosUsados: Math.max(currentStudent.intentosUsados || 0, modStats.count + 1),
        suspendido: isSuspended ? true : Boolean(currentStudent.suspendido),
        conceptoInfraccion: isSuspended
          ? finalConcept
          : warningsCount > 0
          ? finalConcept
          : currentStudent.conceptoInfraccion || '✓ Sin infracciones',
        preguntasIntento1:
          currentAttemptNumber === 1
            ? Array.from(new Set([...prevIntento1, ...usedIds]))
            : prevIntento1,
        preguntasIntento2:
          currentAttemptNumber === 2
            ? Array.from(new Set([...prevIntento2, ...usedIds]))
            : prevIntento2,
        preguntasUsadasPorModalidad: {
          ...(currentStudent.preguntasUsadasPorModalidad || {}),
          [selectedModality]: Array.from(new Set([...prevModalityUsed, ...usedIds]))
        },
        historialLlamadosAtencion: [
          ...attemptAntiCheatLogsRef.current,
          ...prevStudentLogs
        ].slice(0, 150)
      };

      // Clear active backup & update live classroom monitor to show student completed exam and is viewing results
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      try {
        localStorage.removeItem(ACTIVE_EXAM_BACKUP_KEY);
      } catch {
        // ignore
      }
      onSaveActiveExamBackup?.(currentStudent.id, null);
      onUpdateLiveSession({
        studentId: currentStudent.id,
        studentName: currentStudent.nombre,
        codigoAcceso: currentStudent.codigoAcceso,
        modalidadLabel: `Resultados Entregados · ${modConfig.badge}`,
        intentoNumero: currentAttemptNumber,
        preguntaActual: totalQ,
        totalPreguntas: totalQ,
        respondidasCount: totalQ,
        tiempoRestanteSegundos: 0,
        advertencias: isSuspended ? 2 : warningsCount,
        motivoUltimaAdvertencia: finalConcept,
        online: isOnline,
        ultimaActualizacionMs: Date.now(),
        suspendido: isSuspended,
        pantallaMaximizada: true
      });
      onRecordAttempt(result, updatedStudent);
      void handleExecuteServerSave(
        'estudiante_certificado_resultados',
        `Registro automático de examen (${modConfig.title} - Intento #${currentAttemptNumber} - Nota: ${rawNota.toFixed(1)})`
      );
      setFinishedResult(result);
      setConfirmSubmitModal(false);
      setDrawerOpen(false);
      setExamPhase('results');
    },
    [
      currentStudent,
      activeQuestions,
      selectedModality,
      getModalityAttemptStats,
      safeQuestions,
      answers,
      totalExamSeconds,
      suspensionReason,
      warningsCount,
      currentAttemptNumber,
      payloadChecksum,
      config.notaMinimaAprobacion,
      onUpdateLiveSession,
      onRecordAttempt,
      onSaveActiveExamBackup,
      handleExecuteServerSave
    ]
  );

  // Reset per-question timer whenever the student navigates to another question or selects an answer
  useEffect(() => {
    if (examPhase !== 'active_exam') return;
    questionEnteredPerfRef.current = performance.now();
    setSecondsOnCurrentQuestion(0);
  }, [currentIndex, answers, examPhase]);

  // Monotonic Countdown Timer & Inactivity / Split-Screen Detector (Every 1 second via performance.now())
  useEffect(() => {
    if (examPhase !== 'active_exam' || !currentStudent) return;

    const checkScreenGeometry = () => {
      if (typeof window === 'undefined') return;
      const availW = window.screen?.availWidth || window.innerWidth;
      const isSplit = availW > 0 && window.innerWidth < availW * 0.85;
      const isExt = Boolean((window.screen as unknown as { isExtended?: boolean })?.isExtended);
      setIsSplitScreenDetected(isSplit);
      setIsExtendedMonitorDetected(isExt);
    };

    const markUserInteraction = () => {
      lastMouseOrKeyPerfRef.current = performance.now();
    };

    checkScreenGeometry();
    window.addEventListener('resize', checkScreenGeometry);
    window.addEventListener('mousemove', markUserInteraction);
    window.addEventListener('keydown', markUserInteraction);
    window.addEventListener('pointerdown', markUserInteraction);

    const timer = setInterval(() => {
      const nowPerf = performance.now();
      const elapsedExamSec = Math.floor((nowPerf - examStartPerfRef.current) / 1000);
      const nextRemaining = Math.max(0, examDurationSecRef.current - elapsedExamSec);
      setTimeLeftSeconds(nextRemaining);

      const qSec = Math.max(0, Math.floor((nowPerf - questionEnteredPerfRef.current) / 1000));
      setSecondsOnCurrentQuestion(qSec);

      const curQ = activeQuestions[currentIndexRef.current];
      if (curQ && curQ.id) {
        perQuestionSecondsRef.current[curQ.id] = (perQuestionSecondsRef.current[curQ.id] || 0) + 1;
      }

      const idleSec = Math.max(0, Math.floor((nowPerf - lastMouseOrKeyPerfRef.current) / 1000));
      setMouseIdleSeconds(idleSec);
      checkScreenGeometry();
    }, 1000);

    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', checkScreenGeometry);
      window.removeEventListener('mousemove', markUserInteraction);
      window.removeEventListener('keydown', markUserInteraction);
      window.removeEventListener('pointerdown', markUserInteraction);
    };
  }, [examPhase, currentStudent]);

  // Auto-submit when timer reaches 00:00
  useEffect(() => {
    if (examPhase === 'active_exam' && timeLeftSeconds === 0 && activeQuestions.length > 0) {
      finalizeExam(false);
    }
  }, [examPhase, timeLeftSeconds, activeQuestions.length, finalizeExam]);

  // Auto-suspend when anti-cheat infractions exceed maxLlamadosPermitidos
  useEffect(() => {
    if (
      examPhase === 'active_exam' &&
      isExamAntiCheatMasterEnabled &&
      warningsCount > maxLlamadosPermitidos &&
      activeQuestions.length > 0
    ) {
      finalizeExam(
        true,
        `${suspensionReason} (${warningsCount} llamados registrados · Límite permitido: ${maxLlamadosPermitidos})`
      );
    }
  }, [
    examPhase,
    isExamAntiCheatMasterEnabled,
    warningsCount,
    maxLlamadosPermitidos,
    suspensionReason,
    activeQuestions.length,
    finalizeExam
  ]);

  // Save & Broadcast helper (called on answer/question change and every 15s)
  const syncExamProgress = useCallback(() => {
    if (examPhase !== 'active_exam' || !currentStudent) return;

    const modConfig = MODALITY_OPTIONS.find((m) => m.id === selectedModality) || MODALITY_OPTIONS[0];
    const nowTime = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLastSavedTime(nowTime);

    const backupPayload = {
      studentId: currentStudent.id,
      attemptNumber: currentAttemptNumber,
      modality: selectedModality,
      answers,
      markedForReview,
      timeLeftSeconds: timeLeftRef.current,
      savedAt: nowTime
    };
    try {
      localStorage.setItem(ACTIVE_EXAM_BACKUP_KEY, JSON.stringify(backupPayload));
    } catch {
      // ignore
    }
    onSaveActiveExamBackup?.(currentStudent.id, backupPayload);

    const qSecNow = Math.max(
      0,
      Math.floor((performance.now() - questionEnteredPerfRef.current) / 1000)
    );
    const idleSecNow = Math.max(
      0,
      Math.floor((performance.now() - lastMouseOrKeyPerfRef.current) / 1000)
    );
    const availW = typeof window !== 'undefined' ? window.screen?.availWidth || window.innerWidth : 1000;
    const maximizedNow =
      typeof window !== 'undefined' ? window.innerWidth >= availW * 0.85 : true;

    onUpdateLiveSession({
      studentId: currentStudent.id,
      studentName: currentStudent.nombre,
      codigoAcceso: currentStudent.codigoAcceso,
      modalidadLabel: modConfig.badge,
      intentoNumero: currentAttemptNumber,
      preguntaActual: currentIndex + 1,
      totalPreguntas: activeQuestions.length,
      respondidasCount: Object.keys(answers).length,
      tiempoRestanteSegundos: timeLeftRef.current,
      advertencias: warningsCount,
      maxLlamadosPermitidos,
      motivoUltimaAdvertencia: suspensionReason,
      online: isOnline,
      ultimaActualizacionMs: Date.now(),
      suspendido: false,
      segundosEnPreguntaActual: qSecNow,
      inactividadMouseSegundos: idleSecNow,
      inactividadSospechosa: qSecNow >= 240,
      pantallaMaximizada: maximizedNow
    });
  }, [
    examPhase,
    currentStudent,
    selectedModality,
    currentAttemptNumber,
    answers,
    markedForReview,
    currentIndex,
    activeQuestions.length,
    warningsCount,
    suspensionReason,
    isOnline,
    onUpdateLiveSession,
    onSaveActiveExamBackup
  ]);

  // Trigger sync on state changes (answers, question navigation, warnings, online state)
  useEffect(() => {
    if (examPhase !== 'active_exam') return;
    syncExamProgress();
  }, [examPhase, syncExamProgress]);

  // Periodic Auto-Save & Heartbeat every 5 seconds during active exam
  useEffect(() => {
    if (examPhase !== 'active_exam') return;
    const interval = setInterval(() => {
      syncExamProgress();
    }, 5000);
    return () => clearInterval(interval);
  }, [examPhase, syncExamProgress]);

  // Live Presence Heartbeat whenever the student is logged in on the dashboard or results view
  // Ensures Teacher's "Dispositivos en Línea / Monitor Aula en Vivo" always reflects connected students in real time
  useEffect(() => {
    if (!currentStudent || examPhase === 'login' || examPhase === 'active_exam') return;

    const sendPortalPresence = () => {
      const tabLabels: Record<string, string> = {
        modalidades: 'Panel Estudiantil · Selección de Examen',
        mis_notas: 'Panel Estudiantil · Consultando Mis Notas',
        diagnostico_pedagogico: 'Panel Estudiantil · Diagnóstico Pedagógico',
        mini_retos: '🏅 En Zona de Retos & Insignias (IA)'
      };
      const activityLabel =
        examPhase === 'results'
          ? 'Panel Estudiantil · Revisando Resultados'
          : tabLabels[studentDashboardTab] || 'Conectado en Portal Estudiantil';
      const unlockedBadgesCount = ([1, 2, 3, 4, 5] as const).filter(
        (m) => currentStudent.progresoRetos?.[m]?.insigniaDesbloqueada
      ).length;

      onUpdateLiveSession({
        studentId: currentStudent.id,
        studentName: currentStudent.nombre,
        codigoAcceso: currentStudent.codigoAcceso,
        modalidadLabel: activityLabel,
        intentoNumero: (Math.min(2, (currentStudent.intentosUsados || 0) + 1) as 1 | 2) || 1,
        preguntaActual: unlockedBadgesCount,
        totalPreguntas: 5,
        respondidasCount: unlockedBadgesCount,
        tiempoRestanteSegundos: 0,
        advertencias: 0,
        motivoUltimaAdvertencia: currentStudent.conceptoInfraccion || '✓ Conectado en línea',
        online: isOnline,
        ultimaActualizacionMs: Date.now(),
        suspendido: Boolean(currentStudent.suspendido),
        pantallaMaximizada: true
      });
    };

    sendPortalPresence();
    const presenceInterval = setInterval(sendPortalPresence, 6000);
    return () => clearInterval(presenceInterval);
  }, [
    currentStudent,
    examPhase,
    studentDashboardTab,
    isOnline,
    onUpdateLiveSession
  ]);

  // Anti-Cheat Listeners: Tab Switch, Minimize Window, External App Switch (Alt+Tab), Fullscreen Exit, Split-Screen, DevTools, Pointer Leave, Right-Click, Copy/Paste/PrintScreen Shortcuts (with 1.0s start grace period)
  useEffect(() => {
    if (examPhase !== 'active_exam' || !isExamAntiCheatMasterEnabled) return;

    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 1000);

    let pointerLeaveTimer: ReturnType<typeof setTimeout> | null = null;

    const registerInfraction = (
      motivo: string,
      tipoDeteccion: AntiCheatDetectionType,
      etiquetaDeteccion: string
    ) => {
      if (!armed) return;
      const nowMs = Date.now();
      // Debounce simultaneous browser blur + visibilitychange events fired within 650ms of each other
      if (nowMs - lastInfractionTimeMsRef.current < 650) {
        return;
      }
      lastInfractionTimeMsRef.current = nowMs;

      const modConfig =
        MODALITY_OPTIONS.find((m) => m.id === selectedModality) || MODALITY_OPTIONS[0];
      setSuspensionReason(`${etiquetaDeteccion}: ${motivo}`);

      setWarningsCount((prev) => {
        const nextCount = prev + 1;
        const willSuspend = nextCount > maxLlamadosPermitidos;

        if (currentStudent) {
          const logEntry: AntiCheatLogEntry = {
            id: `AC-EX-${currentStudent.id}-${nowMs}-${nextCount}`,
            fecha: new Date().toLocaleString('es-CO'),
            timestampMs: nowMs,
            studentId: currentStudent.id,
            studentName: currentStudent.nombre,
            origen: 'EXAMEN',
            modalidadOModulo: modConfig.title,
            tipoDeteccion,
            etiquetaDeteccion,
            descripcion: motivo,
            llamadoNumero: nextCount,
            maxLlamadosPermitidos,
            accionTomada: willSuspend ? 'SUSPENSION_0_0' : 'LLAMADO_PREVENTIVO'
          };
          attemptAntiCheatLogsRef.current = [
            logEntry,
            ...attemptAntiCheatLogsRef.current
          ];
          onRecordAntiCheatEvent?.(currentStudent.id, logEntry);
        }

        if (!willSuspend) {
          const remainingWarnings = Math.max(0, maxLlamadosPermitidos - nextCount);
          setWarningModalText(
            `⚠️ Llamado de Atención #${nextCount} de ${maxLlamadosPermitidos} Permitidos (${etiquetaDeteccion}): Se detectó "${motivo}". ${
              remainingWarnings === 0
                ? '¡ATENCIÓN! Ha alcanzado el límite de llamados preventivos. La próxima incidencia suspenderá automáticamente su examen con calificación 0.0 / 5.0 (SUSPENDIDO).'
                : `Le quedan ${remainingWarnings} llamado(s) preventivo(s) antes de la suspensión automática con calificación 0.0 / 5.0.`
            }`
          );
        }
        return nextCount;
      });
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      const isMinimized =
        typeof window !== 'undefined' &&
        (window.outerWidth <= 220 ||
          window.outerHeight <= 140 ||
          window.screenX < -10000 ||
          window.screenY < -10000);

      if (isMinimized && isMinimizeGuardEnabled) {
        registerInfraction(
          'Ventana o pestaña del navegador minimizada durante el examen',
          'MINIMIZAR_PESTANA_VENTANA',
          'Minimizar Pestaña / Ventana'
        );
      } else if (isTabSwitchGuardEnabled) {
        registerInfraction(
          'Cambio a otra pestaña del navegador o envío de la evaluación a segundo plano',
          'CAMBIO_PESTANA',
          'Cambio de Pestaña'
        );
      }
    };

    const handleWindowBlur = () => {
      // Distinguish between Tab Switch (document.hidden) vs External Application Switch (Alt+Tab, WhatsApp, ChatGPT, Word, etc.)
      setTimeout(() => {
        if (!armed) return;
        const isMinimized =
          typeof window !== 'undefined' &&
          (window.outerWidth <= 220 ||
            window.outerHeight <= 140 ||
            window.screenX < -10000 ||
            window.screenY < -10000);
        if (isMinimized && isMinimizeGuardEnabled) {
          registerInfraction(
            'Minimizado de ventana del navegador detectado',
            'MINIMIZAR_PESTANA_VENTANA',
            'Minimizar Pestaña / Ventana'
          );
        } else if (document.hidden && isTabSwitchGuardEnabled) {
          registerInfraction(
            'Cambio de pestaña del navegador detectado',
            'CAMBIO_PESTANA',
            'Cambio de Pestaña'
          );
        } else if (!document.hasFocus() && isAppSwitchGuardEnabled) {
          registerInfraction(
            'Cambio de aplicación externa (Alt+Tab / clic fuera del navegador hacia otra app o ventana)',
            'CAMBIO_APLICACION_EXTERNA',
            'Cambio de Aplicación'
          );
        }
      }, 120);
    };

    const handleFullscreenChange = () => {
      if (armed && isExamFullscreenGuardEnabled && !document.fullscreenElement) {
        registerInfraction(
          'Salida del modo de Pantalla Completa durante el examen',
          'SALIDA_PANTALLA_COMPLETA',
          'Salida de Pantalla Completa'
        );
      }
    };

    const handleResizeOrDevTools = () => {
      if (!armed || typeof window === 'undefined') return;
      const isMinimized = window.outerWidth <= 220 || window.outerHeight <= 140;
      if (isMinimized && isMinimizeGuardEnabled) {
        registerInfraction(
          'Minimizado de la ventana de evaluación detectado',
          'MINIMIZAR_PESTANA_VENTANA',
          'Minimizar Pestaña / Ventana'
        );
        return;
      }
      // Detect docked DevTools console opening during active exam
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (isPointerAndDevToolsGuardEnabled && (widthDiff > 220 || heightDiff > 260)) {
        registerInfraction(
          'Apertura de panel lateral o consola de inspección (DevTools) detectada',
          'CAPTURA_IMPRESION_DEVTOOLS',
          'Consola / Panel Lateral'
        );
      }
    };

    const handleMouseLeaveDocument = (e: MouseEvent) => {
      if (!armed || !isPointerAndDevToolsGuardEnabled) return;
      if (
        e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        if (pointerLeaveTimer) clearTimeout(pointerLeaveTimer);
        pointerLeaveTimer = setTimeout(() => {
          if (!document.hasFocus()) {
            registerInfraction(
              'Puntero y foco fuera del área de evaluación hacia barra del sistema o segundo monitor (>3.5s)',
              'ABANDONO_PUNTERO_FUERA_VENTANA',
              'Salida de Ventana / Monitor'
            );
          }
        }, 3500);
      }
    };

    const handleMouseEnterDocument = () => {
      if (pointerLeaveTimer) {
        clearTimeout(pointerLeaveTimer);
        pointerLeaveTimer = null;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isExamCopyShortcutGuardEnabled) return;
      e.preventDefault();
      registerInfraction(
        'Intento de abrir menú contextual (Clic derecho)',
        'COPIA_PEGADO_CLIC_DERECHO',
        'Clic Derecho Bloqueado'
      );
    };

    const handleCopyCutPaste = (e: ClipboardEvent) => {
      if (!isExamCopyShortcutGuardEnabled) return;
      e.preventDefault();
      registerInfraction(
        `Intento prohibido de portapapeles (${e.type.toUpperCase()})`,
        'COPIA_PEGADO_CLIC_DERECHO',
        'Copia / Pegado Bloqueado'
      );
    };

    const handleDragDrop = (e: DragEvent) => {
      if (!isExamCopyShortcutGuardEnabled) return;
      e.preventDefault();
      registerInfraction(
        'Intento de arrastrar o soltar texto en la evaluación',
        'COPIA_PEGADO_CLIC_DERECHO',
        'Arrastrar Texto Bloqueado'
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toUpperCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (isAppSwitchGuardEnabled && e.altKey && key === 'TAB') {
        registerInfraction(
          'Uso de atajo Alt+Tab para cambiar de aplicación',
          'CAMBIO_APLICACION_EXTERNA',
          'Cambio de Aplicación (Alt+Tab)'
        );
        return;
      }

      if (!isExamCopyShortcutGuardEnabled) return;
      const isCopyOrSource =
        isCtrlOrMeta &&
        (key === 'C' || key === 'V' || key === 'X' || key === 'U' || key === 'P' || key === 'S');
      const isDevTools =
        key === 'F12' ||
        (isCtrlOrMeta && e.shiftKey && (key === 'I' || key === 'J' || key === 'C' || key === 'S'));
      const isPrintScreen = key === 'PRINTSCREEN';

      if (isCopyOrSource || isDevTools || isPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
        registerInfraction(
          `Intento de atajo restringido, captura o inspección (${
            isPrintScreen ? 'Captura PrintScreen' : isCtrlOrMeta ? `Ctrl+${key}` : key
          })`,
          isPrintScreen || isDevTools ? 'CAPTURA_IMPRESION_DEVTOOLS' : 'COPIA_PEGADO_CLIC_DERECHO',
          isPrintScreen ? 'Captura de Pantalla' : isDevTools ? 'Inspector F12' : 'Atajo de Copia'
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('resize', handleResizeOrDevTools);
    document.documentElement.addEventListener('mouseleave', handleMouseLeaveDocument);
    document.documentElement.addEventListener('mouseenter', handleMouseEnterDocument);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopyCutPaste);
    document.addEventListener('cut', handleCopyCutPaste);
    document.addEventListener('paste', handleCopyCutPaste);
    document.addEventListener('drop', handleDragDrop);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(armTimer);
      if (pointerLeaveTimer) clearTimeout(pointerLeaveTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('resize', handleResizeOrDevTools);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeaveDocument);
      document.documentElement.removeEventListener('mouseenter', handleMouseEnterDocument);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopyCutPaste);
      document.removeEventListener('cut', handleCopyCutPaste);
      document.removeEventListener('paste', handleCopyCutPaste);
      document.removeEventListener('drop', handleDragDrop);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    examPhase,
    currentStudent,
    selectedModality,
    maxLlamadosPermitidos,
    isExamAntiCheatMasterEnabled,
    isExamFocusGuardEnabled,
    isTabSwitchGuardEnabled,
    isMinimizeGuardEnabled,
    isAppSwitchGuardEnabled,
    isPointerAndDevToolsGuardEnabled,
    isExamFullscreenGuardEnabled,
    isExamCopyShortcutGuardEnabled,
    onRecordAntiCheatEvent
  ]);

  // Format MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ================= VIEW 1: PANTALLA INICIAL CON DOS OPCIONES (ESTUDIANTE / DOCENTE) Y VALIDACIÓN DUAL ESTRICTA =================
  if (examPhase === 'login') {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xs p-6 sm:p-8 space-y-6">
          {/* Selector Dual de Rol en la Pantalla Inicial: Iniciar como Estudiante o Iniciar como Docente */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              className="py-2.5 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Iniciar como Estudiante</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToTeacherLogin}
              className="py-2.5 px-3 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-white/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Iniciar como Docente</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">
              Marketing Digital PRU · La Dorada, Caldas
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Ingreso Oficial de Estudiante
            </h1>
            <p className="text-sm text-slate-600">
              Mapeo de Mercado y Comportamiento del Consumidor
            </p>
          </div>

          {/* Sala de Espera si el docente cerró el examen */}
          {!config.examenAbierto && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <Clock className="w-4 h-4 shrink-0 text-amber-700 animate-spin" />
                <span>Sala de Espera Activa · Evaluación Cerrada por el Docente</span>
              </div>
              <p className="leading-relaxed">
                {config.mensajeSalaEspera ||
                  'Por favor espere las indicaciones del docente en el aula para dar inicio a la sesión.'}
              </p>
            </div>
          )}

          {/* Bloqueo por Tercer Intento */}
          {thirdAttemptBlockedModal && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3 text-sm">
              <div className="flex items-start gap-2.5 text-amber-900 font-semibold">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  «Total intentos terminados. Has alcanzado el límite máximo de 2 intentos permitidos para esta evaluación.»
                </span>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200 space-y-1 text-xs text-slate-700 font-mono">
                <div>Estudiante: {thirdAttemptBlockedModal.student.nombre}</div>
                {thirdAttemptBlockedModal.modalidadLabel && (
                  <div>Evaluación: {thirdAttemptBlockedModal.modalidadLabel}</div>
                )}
                <div>
                  Intento 1:{' '}
                  {thirdAttemptBlockedModal.att1 !== null
                    ? `${thirdAttemptBlockedModal.att1.toFixed(1)} / 5.0`
                    : 'N/A'}
                </div>
                <div>
                  Intento 2:{' '}
                  {thirdAttemptBlockedModal.att2 !== null
                    ? `${thirdAttemptBlockedModal.att2.toFixed(1)} / 5.0`
                    : 'N/A'}
                </div>
                <div className="font-bold text-slate-900 pt-1 border-t border-slate-100">
                  Nota Definitiva Más Alta (Math.max): {thirdAttemptBlockedModal.bestGrade.toFixed(1)} / 5.0
                </div>
              </div>
            </div>
          )}

          {/* Error de Coincidencia Dual */}
          {loginError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-800 font-medium">
              <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="docId" className="block text-xs font-semibold text-slate-800">
                ID de Estudiante (Documento de Identidad)
              </label>
              <input
                id="docId"
                type="text"
                required
                autoComplete="off"
                value={docIdInput}
                onChange={(e) => setDocIdInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="accessCode" className="block text-xs font-semibold text-slate-800">
                Código de Acceso de Sesión
              </label>
              <input
                id="accessCode"
                type="text"
                required
                autoComplete="off"
                maxLength={24}
                value={accessCodeInput}
                onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
              />
            </div>

            {config.exigirPinAula && (
              <div className="space-y-1.5 pt-1">
                <label htmlFor="classroomPin" className="block text-xs font-semibold text-sky-900">
                  PIN de Aula Temporal del Día (Proyectado por el Docente)
                </label>
                <input
                  id="classroomPin"
                  type="text"
                  required
                  autoComplete="off"
                  value={classroomPinInput}
                  onChange={(e) => setClassroomPinInput(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-sky-300 bg-sky-50/50 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Directriz Institucional de Control Exclusivo del Docente (Sin enlaces de recuperación ni modo demo en inicio) */}
          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                El Código de Acceso de Sesión es personal e intransferible y debe ser solicitado directamente al docente en el aula.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================= VIEW 2: PANEL DEL ESTUDIANTE CON SESIÓN INICIADA (ACTIVA) =================
  if (examPhase === 'modality_select' && currentStudent) {
    const selectedModStats = getModalityAttemptStats(selectedModality);
    const selectedModConfig =
      activeModalityOptions.find((m) => m.id === selectedModality) || activeModalityOptions[0];

    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header de Bienvenida con Nombre Verificado, Simulador Prueba Cero, Botón Modificar Datos y Botón Cambiar Usuario */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Sesión Estudiantil Activa y Verificada</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Bienvenido(a), {currentStudent.nombre}
            </h1>
            <p className="text-xs text-slate-600 font-mono">
              ID de Estudiante (Solo Lectura): <strong>{currentStudent.id}</strong> · Código de Acceso Activo:{' '}
              <strong>{currentStudent.codigoAcceso}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setZeroTrialModalOpen(true)}
              className="px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 flex items-center gap-1.5 cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5 text-emerald-700" />
              <span>Simulador de Prueba Cero (2 Preguntas · Sin Gastar Intentos)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setProfileNameInput(currentStudent.nombre);
                setProfileCodeInput(currentStudent.codigoAcceso);
                setProfileSaveMsg(null);
                setEditProfileModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-sky-900 flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Modificar Datos del Estudiante</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (currentStudent) {
                  onUpdateLiveSession(null, currentStudent.id);
                }
                logoutStudent();
                setVerifiedStudentId(null);
                setDocIdInput('');
                setAccessCodeInput('');
                setClassroomPinInput('');
                setThirdAttemptBlockedModal(null);
                setExamPhase('login');
              }}
              className="px-3.5 py-2 rounded-lg border border-red-200 bg-red-50/70 text-xs font-semibold text-red-800 hover:bg-red-100 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cerrar Sesión / Cambiar de Usuario</span>
            </button>
          </div>
        </div>

        <OptionServerSaveBar
          sectionKey="estudiante_perfil_datos"
          label={`Sesión y Datos del Estudiante (${currentStudent.nombre})`}
          autoSave={true}
          watchValue={{
            nombre: currentStudent.nombre,
            codigoAcceso: currentStudent.codigoAcceso,
            intentos: currentStudent.intentosUsados,
            entregas: studentAttempts.length
          }}
        />

        {/* Dashboard de Rendimiento Estudiantil (Recharts: Evolución de Calificaciones vs. Promedio del Curso) */}
        <StudentPerformanceDashboard
          studentId={currentStudent.id}
          studentName={currentStudent.nombre}
          studentAttempts={studentAttempts}
          allAttempts={attempts}
          minPassingGrade={Number(config.notaMinimaAprobacion) || 3.0}
        />

        {/* Pestañas Internas del Panel del Estudiante */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-2">
          <button
            type="button"
            onClick={() => setStudentDashboardTab('modalidades')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
              studentDashboardTab === 'modalidades'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Exámenes Disponibles y Selector de Modalidad</span>
          </button>

          <button
            type="button"
            onClick={() => setStudentDashboardTab('mis_notas')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
              studentDashboardTab === 'mis_notas'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Notas Obtenidas en Exámenes Realizados ({studentAttempts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setStudentDashboardTab('diagnostico_pedagogico')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              studentDashboardTab === 'diagnostico_pedagogico'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Diagnóstico Pedagógico (Módulos y Bloom)</span>
          </button>

          <button
            type="button"
            onClick={() => setStudentDashboardTab('mini_retos')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              studentDashboardTab === 'mini_retos'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>
              🏅 Zona de Retos & Insignias (
              {
                ([1, 2, 3, 4, 5] as const).filter(
                  (m) => currentStudent.progresoRetos?.[m]?.insigniaDesbloqueada
                ).length
              }
              /5)
            </span>
          </button>
        </div>

        {/* SUB-TAB 1: SELECTOR DE MODALIDAD DEL EXAMEN Y CONTROL ESTRICTO DE 2 INTENTOS POR MODALIDAD */}
        {studentDashboardTab === 'modalidades' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            {(!config.examenAbierto ||
              (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id)) && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-950">
                <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-amber-900">
                    Estado Maestro del Examen: CERRADO (Deshabilitado por el Docente para su sesión)
                  </div>
                  <p>
                    {config.mensajeSalaEspera ||
                      'El docente ha cerrado temporalmente el inicio de evaluaciones. Puede consultar sus notas y diagnóstico mientras el docente habilita (ABIERTO) su acceso.'}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                Seleccione la Modalidad de Evaluación a Presentar
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Usted dispone de un máximo de <strong>2 intentos independientes por cada modalidad de examen</strong> (Intento 2 carga preguntas 100% nuevas sin repetir ninguna del Intento 1). Se conserva la nota más alta: <code>Math.max(Intento1, Intento2)</code>.
              </p>
            </div>

            {thirdAttemptBlockedModal && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 space-y-3 text-xs text-amber-950 shadow-xs">
                <div className="font-bold text-sm flex items-start gap-2 text-amber-900">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" />
                  <span>
                    «Total intentos terminados. Has alcanzado el límite máximo de 2 intentos permitidos para esta evaluación.»
                  </span>
                </div>
                <div className="bg-white rounded-lg p-3 border border-amber-200 flex flex-wrap items-center justify-between gap-3 font-mono">
                  <div className="space-y-0.5">
                    <div>
                      Evaluación deshabilitada: <strong>{thirdAttemptBlockedModal.modalidadLabel}</strong>
                    </div>
                    <div>
                      Intento 1:{' '}
                      <strong>
                        {thirdAttemptBlockedModal.att1 !== null
                          ? `${thirdAttemptBlockedModal.att1.toFixed(1)} / 5.0`
                          : 'N/A'}
                      </strong>{' '}
                      · Intento 2:{' '}
                      <strong>
                        {thirdAttemptBlockedModal.att2 !== null
                          ? `${thirdAttemptBlockedModal.att2.toFixed(1)} / 5.0`
                          : 'N/A'}
                      </strong>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-sm">
                    Nota Definitiva Más Alta (Math.max): {thirdAttemptBlockedModal.bestGrade.toFixed(1)} / 5.0
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-amber-900 font-medium">
                    Esta evaluación ya cumplió sus 2 intentos en el registro oficial. Puede volver al panel principal o seleccionar otro examen disponible:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setThirdAttemptBlockedModal(null)}
                      className="px-3 py-2 rounded-lg border border-amber-400 bg-white hover:bg-amber-100 text-amber-950 font-semibold text-xs cursor-pointer"
                    >
                      Volver al Panel Principal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReturnToMainStudentPanel(selectedModality)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Elegir Otro Examen Disponible</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {activeModalityOptions.map((mod) => {
                const isSelected = selectedModality === mod.id;
                const st = getModalityAttemptStats(mod.id);
                const isDisabledForStart = st.count >= 2 || st.isExhausted || st.isBlockedByTeacher;

                return (
                  <div
                    key={mod.id}
                    onClick={() => handleSelectExamModality(mod.id, false)}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      isDisabledForStart
                        ? isSelected
                          ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-500'
                          : 'border-slate-200 bg-slate-100/80 opacity-85'
                        : isSelected
                        ? 'border-sky-600 bg-sky-50/60 ring-1 ring-sky-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-semibold text-sky-800">{mod.badge}</span>
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                            st.isBlockedByTeacher
                              ? 'bg-red-100 text-red-800'
                              : st.count >= 2 || st.isExhausted
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {st.isBlockedByTeacher
                            ? '🔒 Bloqueado por Docente'
                            : st.count >= 2 || st.isExhausted
                            ? `🔒 Deshabilitado (${st.count}/2 Intentos)`
                            : `Disponible · Intentos: ${st.count} / ${st.maxAllowed}`}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">{mod.title}</div>
                      <p className="text-xs text-slate-600 leading-relaxed">{mod.subtitle}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 space-y-2">
                      {st.count > 0 && (
                        <div className="flex items-center justify-between text-xs font-mono bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200">
                          <span>
                            Intento 1: <strong>{st.att1 ? st.att1.notaColombiana.toFixed(1) : '—'}</strong>
                            {' · '}
                            Intento 2: <strong>{st.att2 ? st.att2.notaColombiana.toFixed(1) : '—'}</strong>
                          </span>
                          <span className="font-bold text-emerald-800">
                            Nota Definitiva (Math.max): {st.bestGrade.toFixed(1)} / 5.0
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={isDisabledForStart}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectExamModality(mod.id, true);
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {st.isBlockedByTeacher ? (
                          <span>🔒 Examen Bloqueado por Docente</span>
                        ) : st.count >= 2 || st.isExhausted ? (
                          <span>
                            ✓ Examen Deshabilitado ({st.count}/2 Intentos) · Nota: {st.bestGrade.toFixed(1)} / 5.0
                          </span>
                        ) : (
                          <>
                            <span>
                              {st.count === 0
                                ? 'Presentar Intento #1 de 2'
                                : 'Presentar Intento #2 de 2 (Preguntas Nuevas)'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inducción Previa sobre la Regla de 1 Advertencia y Escala Colombiana */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-700" />
                <span>
                  Inducción Previa de Integridad Académica (Regla de 1 Advertencia) y Escala Oficial (0.0 a 5.0)
                </span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>
                  Calificación en escala oficial colombiana de <strong>0.0 a 5.0</strong> (Aprobado ≥ 3.0).
                </li>
                <li>
                  <strong>Temporizador Cromático:</strong> 🟢 Verde (&gt; 15 min) · 🟡 Ámbar (≤ 15 min) · 🔴 Rojo pulsante (≤ 5 min) con auto-entrega en <code>00:00</code>.
                </li>
                <li>
                  <strong>Regla de 1 Advertencia Anti-Fraude:</strong> El sistema detecta salidas de la pestaña, cambio de ventanas e intentos de captura/clic derecho. Permite <strong>una única advertencia preventiva</strong>; al segundo evento, el examen queda suspendido automáticamente con nota <code>0.0</code>.
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <div className="text-xs text-slate-600">
                Modalidad seleccionada: <strong>{selectedModConfig.title}</strong> · Intentos registrados:{' '}
                <strong>
                  {selectedModStats.count} / {selectedModStats.maxAllowed}
                </strong>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {(selectedModStats.count >= 2 ||
                  selectedModStats.isExhausted ||
                  selectedModStats.isBlockedByTeacher) && (
                  <button
                    type="button"
                    onClick={() => handleReturnToMainStudentPanel(selectedModality)}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Volver al Panel Principal / Elegir Otro Examen</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={
                    !config.examenAbierto ||
                    (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id) ||
                    selectedModStats.count >= 2 ||
                    selectedModStats.isExhausted ||
                    selectedModStats.isBlockedByTeacher
                  }
                  onClick={() => handleSelectExamModality(selectedModality, true)}
                  className="py-3 px-6 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {!config.examenAbierto ||
                  (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id) ? (
                    <span>■ Estado Maestro del Examen: CERRADO</span>
                  ) : selectedModStats.isBlockedByTeacher ? (
                    <span>🔒 Examen Bloqueado por Docente</span>
                  ) : selectedModStats.count >= 2 || selectedModStats.isExhausted ? (
                    <span>
                      Inicio Deshabilitado (2/2 Intentos Cumplidos · Nota: {selectedModStats.bestGrade.toFixed(1)}/5.0)
                    </span>
                  ) : (
                    <>
                      <span>
                        Iniciar Intento #{selectedModStats.count + 1} de {selectedModStats.maxAllowed} Ahora
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
            <OptionServerSaveBar
              sectionKey="estudiante_modalidades_examen"
              label={`Modalidad Seleccionada (${selectedModConfig.title})`}
              autoSave={true}
              watchValue={{
                selectedModality,
                attemptsCount: studentAttempts.length
              }}
            />
          </div>
        )}

        {/* SUB-TAB 2: NOTAS OBTENIDAS EN LOS EXÁMENES REALIZADOS */}
        {studentDashboardTab === 'mis_notas' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Historial de Notas Obtenidas en los Exámenes Realizados
              </h2>
              <p className="text-xs text-slate-600">
                Consulte las calificaciones obtenidas en cada intento y abra el certificado o revisión pedagógica.
              </p>
            </div>

            {studentAttempts.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                Aún no ha registrado entregas de exámenes en esta sesión.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <th className="py-3 px-4">Fecha y Hora</th>
                      <th className="py-3 px-4">Modalidad de Evaluación</th>
                      <th className="py-3 px-4 text-center">Intento</th>
                      <th className="py-3 px-4 text-right">Aciertos</th>
                      <th className="py-3 px-4 text-right">Nota (0.0 - 5.0)</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {studentAttempts.map((att) => (
                      <tr key={att.attemptId} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-600">{att.fecha}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{att.modalidadLabel}</td>
                        <td className="py-3 px-4 text-center font-mono">#{att.intentoNumero}</td>
                        <td className="py-3 px-4 text-right font-mono">
                          {att.aciertos}/{att.totalPreguntas} ({att.porcentaje}%)
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                          {att.notaColombiana.toFixed(1)} / 5.0
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {att.estado === 'APROBADO' && (
                            <span className="text-emerald-700">✓ APROBADO</span>
                          )}
                          {att.estado === 'REPROBADO' && (
                            <span className="text-amber-700">✕ REPROBADO</span>
                          )}
                          {att.estado === 'SUSPENDIDO' && (
                            <span className="text-red-700">⚠️ SUSPENDIDO</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setFinishedResult(att);
                              setExamPhase('results');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
                          >
                            Ver Certificado / Revisión
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 3: PESTAÑA DIAGNÓSTICO PEDAGÓGICO (MÓDULOS Y TAXONOMÍA DE BLOOM) */}
        {studentDashboardTab === 'diagnostico_pedagogico' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Diagnóstico por Competencias y Rendimiento por Módulos
              </h2>
              <p className="text-xs text-slate-600">
                Desglose porcentual de aciertos en los Módulos del currículo, clasificación por nivel cognitivo (Taxonomía de Bloom) y conceptos por reforzar.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Desglose por Módulos */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Desglose Porcentual de Aciertos por Módulo Curricular
                </h3>
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((m) => {
                    const st = studentDiagnostics.modStats[m];
                    const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
                    const level =
                      st.total === 0
                        ? 'Sin evaluar aún'
                        : pct >= 75
                        ? '● Sobresaliente'
                        : pct >= 60
                        ? '▲ Aceptable'
                        : '■ Requiere Refuerzo';
                    return (
                      <div key={m} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">Módulo {m}</span>
                          <span className="font-mono">
                            {pct}% ({st.correct}/{st.total}) · <strong>{level}</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct >= 75
                                ? 'bg-emerald-600'
                                : pct >= 60
                                ? 'bg-sky-600'
                                : 'bg-amber-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Desglose por Taxonomía de Bloom */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Clasificación por Nivel Cognitivo (Taxonomía de Bloom)
                </h3>
                <div className="space-y-3">
                  {(
                    ['Conocer', 'Comprensión', 'Aplicación', 'Análisis', 'Evaluación'] as BloomLevel[]
                  ).map((b) => {
                    const st = studentDiagnostics.bloomStats[b];
                    const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
                    return (
                      <div key={b} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">{b}</span>
                          <span className="font-mono">
                            {pct}% ({st.correct}/{st.total} reactivos)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-800 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Conceptos con Mayor Tasa de Error */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Conceptos Prioritarios para Refuerzo Académico
              </h3>
              {studentDiagnostics.weakTopics.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No se registran conceptos con tasa de error o aún no ha completado intentos.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {studentDiagnostics.weakTopics.map((wt, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-amber-900">Módulo {wt.modulo}:</span>{' '}
                        <span className="font-medium text-slate-900">{wt.tema}</span>
                      </div>
                      <span className="font-mono font-bold text-red-700 shrink-0">
                        {wt.errorRate}% error
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-TAB 4: ZONA DE RETOS & INSIGNIAS (GAMIFICACIÓN CON EVALUACIÓN SEMÁNTICA POR IA) */}
        {studentDashboardTab === 'mini_retos' && (
          <StudentMiniRetosZone
            student={currentStudent}
            onUpdateStudentProfile={onUpdateStudentProfile}
            onRecordRetoAttempt={onRecordRetoAttempt}
            onRecordAntiCheatEvent={onRecordAntiCheatEvent}
            questions={safeQuestions}
            config={config}
            customMiniRetos={customMiniRetos}
          />
        )}

        {/* MODAL: MODIFICAR DATOS DEL ESTUDIANTE (ID SOLO LECTURA, NOMBRE Y CÓDIGO EDITABLES) */}
        {editProfileModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900">Modificar Datos del Estudiante</h3>
              <p className="text-xs text-slate-600">
                Puede actualizar su Nombre Completo y su Código de Acceso. El número de documento (ID) es de solo lectura por seguridad institucional.
              </p>

              <form onSubmit={handleSaveStudentProfile} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ID de Estudiante (Documento — Solo Lectura / Inhabilitado)
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={currentStudent.id}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Código de Acceso de Sesión
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={profileCodeInput}
                    onChange={(e) => setProfileCodeInput(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase"
                  />
                </div>

                {profileSaveMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                    {profileSaveMsg}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditProfileModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                  >
                    Guardar Mis Datos
                  </button>
                </div>
                <OptionServerSaveBar
                  sectionKey="estudiante_modal_datos"
                  label="Datos de Perfil del Estudiante"
                  autoSave={true}
                  watchValue={{ profileNameInput, profileCodeInput }}
                  compact={true}
                />
              </form>
            </div>
          </div>
        )}

        {/* MODAL: INDUCCIÓN PREVIA SOBRE LA REGLA DE 1 ADVERTENCIA ANTES DE INICIAR */}
        {inductionModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-amber-800">
                <ShieldCheck className="w-6 h-6 text-sky-700 shrink-0" />
                <h3 className="text-lg font-bold text-slate-900">
                  Inducción Previa: Regla de 1 Advertencia y Entorno Seguro
                </h3>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-950 leading-relaxed">
                <p className="font-bold">
                  Antes de comenzar su evaluación ({selectedModConfig.title}), tenga en cuenta:
                </p>
                <ul className="list-disc list-inside space-y-1.5">
                  <li>
                    El sistema supervisa en tiempo real <strong>salidas de la pestaña, cambios de ventana, salida de pantalla completa e intentos de captura o clic derecho</strong>.
                  </li>
                  <li>
                    <strong>1ª Incidencia:</strong> Se mostrará una única alerta emergente de advertencia preventiva.
                  </li>
                  <li>
                    <strong>2ª Incidencia:</strong> El examen quedará <strong>suspendido inmediatamente</strong> y registrado en la auditoría con fecha y hora exacta.
                  </li>
                  <li>
                    Sus respuestas y el tiempo restante se respaldan cada 30 segundos y en cada selección (Offline-First).
                  </li>
                </ul>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setInductionModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Regresar
                </button>
                <button
                  type="button"
                  onClick={startExamWithModality}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Acepto las Reglas · Comenzar Evaluación</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: SIMULADOR DE PRUEBA CERO (2 PREGUNTAS SIN GASTAR INTENTOS) */}
        {zeroTrialModalOpen && (
          <ZeroTrialSimulatorModal onClose={() => setZeroTrialModalOpen(false)} />
        )}
      </div>
    );
  }

  // Fallback de seguridad en caso de que examPhase sea 'active_exam' pero activeQuestions esté vacío
  if (examPhase === 'active_exam' && (!currentStudent || activeQuestions.length === 0)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Inicializando Banco de Evaluación</h2>
          <p className="text-xs text-slate-600">
            No se encontraron reactivos cargados para esta sesión activa. Haga clic abajo para regresar al panel principal y seleccionar nuevamente su modalidad.
          </p>
          <button
            type="button"
            onClick={() => setExamPhase('modality_select')}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
          >
            Volver al Panel Principal del Estudiante
          </button>
        </div>
      </div>
    );
  }

  // ================= VIEW 3: ENTORNO DE EXAMEN SEGURO Y OPTIMIZADO (1 PREGUNTA A LA VEZ) =================
  if (examPhase === 'active_exam' && currentStudent && activeQuestions.length > 0) {
    const currentQ = activeQuestions[currentIndex];
    const selectedOption = answers[currentQ.id] || null;
    const isMarked = !!markedForReview[currentQ.id];
    const answeredCount = Object.keys(answers).length;
    const pendingCount = activeQuestions.length - answeredCount;
    const markedCount = Object.values(markedForReview).filter(Boolean).length;
    const progressPct = Math.round((answeredCount / activeQuestions.length) * 100);

    // Chromatic Timer States: 🟢 > 15m (900s), 🟡 <= 15m, 🔴 <= 5m (300s)
    const timerBadgeStyle =
      timeLeftSeconds > 15 * 60
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
        : timeLeftSeconds > 5 * 60
        ? 'bg-amber-50 text-amber-800 border-amber-300'
        : 'bg-red-50 text-red-700 border-red-400 animate-pulse font-bold';

    const timerDotLabel =
      timeLeftSeconds > 15 * 60 ? '🟢' : timeLeftSeconds > 5 * 60 ? '🟡' : '🔴';

    const fontSizeClass =
      duaFontSize === 'xlarge'
        ? 'text-xl leading-relaxed'
        : duaFontSize === 'large'
        ? 'text-lg leading-relaxed'
        : 'text-base sm:text-lg leading-relaxed';

    const optionTextClass =
      duaFontSize === 'xlarge'
        ? 'text-base sm:text-lg'
        : duaFontSize === 'large'
        ? 'text-sm sm:text-base'
        : 'text-sm';

    return (
      <div
        className={`max-w-4xl mx-auto px-4 py-6 space-y-5 select-none transition-colors ${
          duaWarmPaper ? 'bg-amber-50/40 rounded-2xl' : ''
        }`}
      >
        {/* Top Sticky Status & Chromatic Timer Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>{currentStudent.nombre}</span>
              <span>•</span>
              <span>Intento #{currentAttemptNumber} de 2</span>
              <span>•</span>
              <span className="hidden sm:inline">{payloadChecksum}</span>
            </div>
            <div className="text-xs font-medium text-slate-700 flex items-center gap-3">
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Wifi className="w-3.5 h-3.5" /> En línea (Respaldo: {lastSavedTime})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  <WifiOff className="w-3.5 h-3.5" /> Modo Offline Resiliente Activo (Guardado en localStorage)
                </span>
              )}
              {warningsCount > 0 && (
                <span className="text-amber-700 font-semibold">
                  ⚠️ Llamados: {warningsCount}/{maxLlamadosPermitidos}
                </span>
              )}
              {secondsOnCurrentQuestion >= 240 && (
                <span className="text-amber-800 font-semibold font-mono">
                  ⏳ En esta pregunta: {formatTime(secondsOnCurrentQuestion)} (Inactivo: {mouseIdleSeconds}s)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Chromatic Timer */}
            <div
              className={`px-3.5 py-2 rounded-lg border font-mono text-sm tabular-nums flex items-center gap-2 ${timerBadgeStyle}`}
            >
              <Clock className="w-4 h-4" />
              <span>
                {timerDotLabel} {formatTime(timeLeftSeconds)}
              </span>
            </div>

            {/* Open Navigation Drawer Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Navegar ({answeredCount}/{activeQuestions.length})</span>
            </button>

            {/* Review & Submit Button */}
            <button
              type="button"
              onClick={() => setConfirmSubmitModal(true)}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              Revisar y Entregar
            </button>
          </div>
        </div>

        {/* Barra de Estado del Escudo Anti-Trampa en el Examen */}
        <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold ${
                isExamAntiCheatMasterEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {isExamAntiCheatMasterEnabled
                  ? '🛡️ Escudo Anti-Trampa Activo'
                  : '⚠️ Modo Flexible (Anti-Trampa Pausado por Docente)'}
              </span>
            </span>

            {isExamFocusGuardEnabled && (
              <span
                className={`px-2.5 py-1 rounded-md font-mono font-bold ${
                  warningsCount === 0
                    ? 'bg-slate-800 text-slate-300'
                    : 'bg-amber-500 text-slate-950 animate-pulse'
                }`}
              >
                Llamados Anti-Trampa: {warningsCount} / {maxLlamadosPermitidos} permitidos
              </span>
            )}

            {isExamCopyShortcutGuardEnabled && (
              <span className="px-2 py-1 rounded-md bg-slate-800 text-emerald-300 font-mono text-[11px]">
                ✓ Bloqueo Copia / Clic Derecho / F12
              </span>
            )}

            {isExamPsychometricEqualizerEnabled && (
              <span className="px-2 py-1 rounded-md bg-slate-800 text-sky-300 font-mono text-[11px]">
                🧠 Opciones Ecualizadas IA
              </span>
            )}
          </div>

          {isExamFullscreenGuardEnabled && (
            <button
              type="button"
              onClick={() => {
                try {
                  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                } catch {
                  // ignore
                }
              }}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Pantalla Completa Segura</span>
            </button>
          )}
        </div>

        {/* Alerta de Detección de Pantalla Dividida (<85% Ancho) o Monitor Secundario Extendido */}
        {isExamSplitScreenGuardEnabled &&
          (isSplitScreenDetected || isExtendedMonitorDetected) && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <Maximize2 className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  {isExtendedMonitorDetected
                    ? '⚠️ Monitor Secundario Extendido Detectado: Desconecte pantallas adicionales durante la evaluación.'
                    : '⚠️ Ventana No Maximizada / Pantalla Dividida (< 85%): Maximice la ventana del navegador para evitar alertas en el Monitor Docente.'}
                </span>
              </div>
              <span className="font-mono text-[11px] bg-white px-2.5 py-1 rounded border border-amber-300">
                Reportado al Monitor en Vivo
              </span>
            </div>
          )}

        {/* Barra de Accesibilidad DUA en Vivo */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-sky-700" />
            <span>Accesibilidad DUA:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setDuaFontSize('normal')}
                className={`px-2.5 py-1 font-semibold flex items-center gap-1 ${
                  duaFontSize === 'normal' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                }`}
              >
                <Type className="w-3 h-3" />
                <span>A</span>
              </button>
              <button
                type="button"
                onClick={() => setDuaFontSize('large')}
                className={`px-2.5 py-1 font-semibold ${
                  duaFontSize === 'large' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                }`}
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setDuaFontSize('xlarge')}
                className={`px-2.5 py-1 font-bold ${
                  duaFontSize === 'xlarge' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                }`}
              >
                A++
              </button>
            </div>

            <button
              type="button"
              onClick={() => setDuaWarmPaper((prev) => !prev)}
              className={`px-3 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${
                duaWarmPaper
                  ? 'bg-amber-100 border-amber-300 text-amber-950'
                  : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{duaWarmPaper ? 'Modo Papel Cálido Activo' : 'Lectura Cálida'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSpeech}
              className={`px-3 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${
                isSpeaking
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isSpeaking ? 'Detener Voz' : 'Escuchar Pregunta'}</span>
            </button>
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-600 font-medium">
            <span>
              Pregunta {currentIndex + 1} de {activeQuestions.length} · Módulo {currentQ.modulo} ({currentQ.tema})
            </span>
            <span className="font-mono">{progressPct}% completado</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-600 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Single Question Card */}
        <div
          className={`border rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 ${
            duaWarmPaper ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-mono font-semibold text-sky-700 uppercase">
                Reactivo {currentQ.id} · Nivel Cognitivo Bloom: {currentQ.bloom}
              </span>
              <h2 className={`font-semibold text-slate-900 ${fontSizeClass}`}>
                {currentQ.enunciado}
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                setMarkedForReview((prev) => ({
                  ...prev,
                  [currentQ.id]: !prev[currentQ.id]
                }))
              }
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                isMarked
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{isMarked ? 'Marcada para revisión' : 'Marcar para revisión'}</span>
            </button>
          </div>

          {/* Graphic Case Support (DUA Multiple Representation) */}
          {currentQ.casoGrafico && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-slate-800">{currentQ.casoGrafico.titulo}</div>
              <div className="space-y-2">
                {currentQ.casoGrafico.datos.map((d, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono text-slate-700">
                      <span>{d.etiqueta}</span>
                      <span className="font-bold">
                        {d.valor}
                        {d.unidad || ''}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-600 rounded-full"
                        style={{ width: `${Math.min(100, d.valor)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Large Touch-Friendly Options (A, B, C, D) */}
          <div className="space-y-3">
            {(['A', 'B', 'C', 'D'] as const).map((letter) => {
              const isChosen = selectedOption === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => {
                    const nowPerf = performance.now();
                    const isFirstSelectionForQuestion = !answers[currentQ.id];
                    if (isFirstSelectionForQuestion && isRapidClickBurstGuardEnabled) {
                      const timeSinceEnteredSec = (nowPerf - questionEnteredPerfRef.current) / 1000;
                      if (timeSinceEnteredSec < 2.2) {
                        rapidAnswerStreakRef.current += 1;
                      } else {
                        rapidAnswerStreakRef.current = 0;
                      }
                      if (rapidAnswerStreakRef.current >= 3) {
                        rapidAnswerStreakRef.current = 0;
                        const nowMs = Date.now();
                        setSuspensionReason(
                          'Ráfaga IA: 3 respuestas marcadas en menos de 2.2 segundos sin lectura comprensiva'
                        );
                        setWarningsCount((prev) => {
                          const nextCount = prev + 1;
                          const willSuspend = nextCount > maxLlamadosPermitidos;
                          if (currentStudent) {
                            const logEntry: AntiCheatLogEntry = {
                              id: `AC-BURST-${currentStudent.id}-${nowMs}-${nextCount}`,
                              fecha: new Date().toLocaleString('es-CO'),
                              timestampMs: nowMs,
                              studentId: currentStudent.id,
                              studentName: currentStudent.nombre,
                              origen: 'EXAMEN',
                              modalidadOModulo: selectedModConfig.title,
                              tipoDeteccion: 'RAFAGA_RESPUESTA_RAPIDA_IA',
                              etiquetaDeteccion: 'Ráfaga sin Lectura (IA)',
                              descripcion:
                                'Marcación consecutiva de 3 respuestas en menos de 2.2s por pregunta sin lectura del enunciado',
                              llamadoNumero: nextCount,
                              maxLlamadosPermitidos,
                              accionTomada: willSuspend ? 'SUSPENSION_0_0' : 'LLAMADO_PREVENTIVO'
                            };
                            attemptAntiCheatLogsRef.current = [
                              logEntry,
                              ...attemptAntiCheatLogsRef.current
                            ];
                            onRecordAntiCheatEvent?.(currentStudent.id, logEntry);
                          }
                          if (!willSuspend) {
                            setWarningModalText(
                              `⚠️ Llamado de Atención IA #${nextCount} de ${maxLlamadosPermitidos}: Se detectó marcación en ráfaga (<2.2 segundos por pregunta) sin lectura comprensiva del caso. Lea detenidamente cada enunciado y sus opciones.`
                            );
                          }
                          return nextCount;
                        });
                      }
                    }
                    lastAnswerPerfRef.current = nowPerf;
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQ.id]: letter
                    }));
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer ${
                    isChosen
                      ? 'border-sky-600 bg-sky-50/80 ring-1 ring-sky-600'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg font-mono font-bold text-sm flex items-center justify-center shrink-0 ${
                      isChosen
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {letter}
                  </span>
                  <span className={`text-slate-800 leading-relaxed pt-1 ${optionTextClass}`}>
                    {currentQ.opciones[letter]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom Question Navigation */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 disabled:opacity-40 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            {currentIndex < activeQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(activeQuestions.length - 1, i + 1))}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Siguiente Pregunta</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSubmitModal(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Revisar y Entregar Evaluación</span>
              </button>
            )}
          </div>
          <OptionServerSaveBar
            sectionKey="estudiante_examen_en_curso"
            label={`Progreso de Respuestas del Examen (${answeredCount}/${activeQuestions.length})`}
            autoSave={true}
            watchValue={{
              answeredCount,
              markedCount,
              duaFontSize,
              duaWarmPaper
            }}
          />
        </div>

        {/* Lateral Navigation Drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
            <div className="w-full max-w-sm bg-white h-full p-6 overflow-y-auto space-y-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">Mapa de Navegación</h3>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cerrar ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                  <div className="font-bold font-mono">{answeredCount}</div>
                  <div>Respondidas</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                  <div className="font-bold font-mono">{pendingCount}</div>
                  <div>Pendientes</div>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <div className="font-bold font-mono">{markedCount}</div>
                  <div>En Revisión</div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {activeQuestions.map((q, idx) => {
                  const ans = answers[q.id];
                  const rev = markedForReview[q.id];
                  const isCurr = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        setCurrentIndex(idx);
                        setDrawerOpen(false);
                      }}
                      className={`h-10 rounded-lg font-mono text-xs font-bold border transition-all ${
                        isCurr ? 'ring-2 ring-slate-900 ' : ''
                      }${
                        rev
                          ? 'bg-amber-100 border-amber-400 text-amber-900'
                          : ans
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setConfirmSubmitModal(true);
                }}
                className="w-full py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Ir a Confirmación de Entrega
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Modal Before Definitive Submission */}
        {confirmSubmitModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900">Confirmar Entrega Definitiva</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Verifique el estado de su evaluación antes de enviar para calificación automática en escala 0.0 a 5.0:
              </p>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span>Preguntas respondidas:</span>
                  <strong className="text-emerald-700">
                    {answeredCount} / {activeQuestions.length}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Preguntas sin responder:</span>
                  <strong className={pendingCount > 0 ? 'text-red-600' : 'text-slate-700'}>
                    {pendingCount}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Marcadas para revisión:</span>
                  <strong className="text-amber-700">{markedCount}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Tiempo restante:</span>
                  <strong>{formatTime(timeLeftSeconds)}</strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Volver al Examen
                </button>
                <button
                  type="button"
                  onClick={() => finalizeExam(false)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  Entregar Evaluación Ahora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Anti-Cheat Preventive Warning Modal */}
        {warningModalText && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
            <div className="bg-white border-2 border-amber-500 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2.5 text-amber-800 font-bold text-base">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                <span>
                  Llamado de Atención Anti-Trampa ({warningsCount} de {maxLlamadosPermitidos} permitidos)
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{warningModalText}</p>
              <button
                type="button"
                onClick={() => {
                  setWarningModalText(null);
                  if (isExamFullscreenGuardEnabled) {
                    try {
                      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                    } catch {
                      // ignore
                    }
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
              >
                Entendido, continuar en modo seguro
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= VIEW 4: RESULTADOS INMEDIATOS, REVISIÓN PEDAGÓGICA Y SEGUNDO INTENTO =================
  if (examPhase === 'results' && finishedResult && currentStudent) {
    const isSuspended = finishedResult.estado === 'SUSPENDIDO';
    const isApproved = finishedResult.estado === 'APROBADO';
    const modStats = getModalityAttemptStats(finishedResult.modalidad);
    const canStartSecondAttempt =
      !isSuspended && !currentStudent.suspendido && !modStats.isExhausted;

    const failedTopicsInAttempt = Array.from(
      new Set(
        finishedResult.respuestasDetalle
          .filter((r) => !r.acierto)
          .map((r) => `Módulo ${r.modulo}: ${r.tema}`)
      )
    ).slice(0, 3);

    // 1. Check per-student Retroalimentación (INMEDIATA vs DIFERIDA)
    const isImmediateFeedbackForStudent =
      config.retroalimentacionInmediata &&
      !(config.estudiantesConRetroalimentacionDiferida || []).includes(currentStudent.id);

    // 2. Check per-student Desglose Pregunta x Pregunta (HABILITADO vs DESHABILITADO)
    const isBreakdownEnabledForStudent =
      config.mostrarDesglosePregunta !== false &&
      !(config.estudiantesConDesgloseDeshabilitado || []).includes(currentStudent.id);

    // 3. Check Day & Time Window for Desglose Pregunta x Pregunta (Sin restricción de hora vs Días y Horas disponibles)
    const breakdownScheduleStatus = (() => {
      if (!config.desgloseVentanaHorariaActiva) {
        return { allowed: true, reason: '' };
      }
      const elapsedSinceBootMs = performance.now() - bootPerfNowRef.current;
      const trustedNow = new Date(bootWallTimeMsRef.current + elapsedSinceBootMs);
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const allowedDays = config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
      const startHHMM = config.desgloseHoraInicio || '06:00';
      const endHHMM = config.desgloseHoraFin || '22:00';
      const currentHHMM = `${String(trustedNow.getHours()).padStart(2, '0')}:${String(
        trustedNow.getMinutes()
      ).padStart(2, '0')}`;
      const allowedDaysText = allowedDays.map((d) => dayNames[d]).join(', ') || 'Ningún día';

      if (!allowedDays.includes(trustedNow.getDay())) {
        return {
          allowed: false,
          reason: `El Desglose Pregunta x Pregunta solo está disponible los días: ${allowedDaysText} en horario de ${startHHMM} a ${endHHMM} (Hoy es ${
            dayNames[trustedNow.getDay()]
          }).`
        };
      }
      if (currentHHMM < startHHMM || currentHHMM > endHHMM) {
        return {
          allowed: false,
          reason: `El Desglose Pregunta x Pregunta está programado de ${startHHMM} a ${endHHMM} (${allowedDaysText}). Hora actual verificada: ${currentHHMM}.`
        };
      }
      return { allowed: true, reason: '' };
    })();

    const showDetailedBreakdown =
      isImmediateFeedbackForStudent &&
      isBreakdownEnabledForStudent &&
      breakdownScheduleStatus.allowed;

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Printable Official Certificate Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          {isSuspended && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 text-red-900">
              <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="text-sm font-bold">
                  «Examen suspendido por infringir las reglas»
                </div>
                <p>
                  Concepto de auditoría registrado: <strong>{finishedResult.conceptoInfraccion}</strong>. Calificación asignada por sanción disciplinaria: <strong>0.0 / 5.0</strong>.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="space-y-1">
              <span className="text-xs font-mono font-semibold uppercase text-slate-500">
                Certificado Oficial de Calificación · La Dorada, Caldas
              </span>
              <h1 className="text-2xl font-bold text-slate-900">{finishedResult.studentName}</h1>
              <div className="text-xs font-mono text-slate-600">
                ID: {finishedResult.studentId} · Código Sesión: {finishedResult.codigoSesion} · Intento #
                {finishedResult.intentoNumero} ({finishedResult.modalidadLabel})
              </div>
            </div>

            <div className="flex items-center gap-4">
              <VerificationQrSvg payload={finishedResult.firmaVerificacion} />
              <div className="text-left sm:text-right space-y-1">
                <div className="text-xs font-semibold text-slate-500">Escala Oficial Colombiana</div>
                <div
                  className={`text-4xl font-bold font-mono tabular-nums ${
                    isSuspended
                      ? 'text-red-600'
                      : isApproved
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {finishedResult.notaColombiana.toFixed(1)}{' '}
                  <span className="text-lg text-slate-400">/ 5.0</span>
                </div>
                <div className="text-xs font-bold">
                  {isSuspended && <span className="text-red-700">⚠️ SUSPENDIDO (0.0)</span>}
                  {!isSuspended && isApproved && (
                    <span className="text-emerald-700">✓ APROBADO (≥ 3.0)</span>
                  )}
                  {!isSuspended && !isApproved && (
                    <span className="text-amber-700">✕ REPROBADO (&lt; 3.0)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Aciertos</div>
              <div className="text-base font-bold font-mono text-slate-900">
                {finishedResult.aciertos} / {finishedResult.totalPreguntas} ({finishedResult.porcentaje}%)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Tiempo Empleado</div>
              <div className="text-base font-bold font-mono text-slate-900">
                {formatTime(finishedResult.tiempoEmpleadoSegundos)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Nota Definitiva Modalidad</div>
              <div className="text-base font-bold font-mono text-sky-900">
                {modStats.bestGrade.toFixed(1)} / 5.0
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Hash / Firma Verificación</div>
              <div
                className="text-[11px] font-mono font-semibold text-slate-800 truncate"
                title={finishedResult.firmaVerificacion}
              >
                {finishedResult.firmaVerificacion}
              </div>
            </div>
          </div>

          {/* Aviso de Límite de 2 Intentos Cumplido en esta Evaluación y Retorno al Panel Principal */}
          {modStats.isExhausted && !isSuspended && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2.5 text-xs text-amber-950 no-print">
              <div className="font-bold text-sm flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <span>
                  «Total intentos terminados. Has alcanzado el límite máximo de 2 intentos permitidos para esta evaluación.»
                </span>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200 flex flex-wrap items-center justify-between gap-2 font-mono">
                <span>
                  Intento 1:{' '}
                  <strong>
                    {modStats.att1 ? `${modStats.att1.notaColombiana.toFixed(1)} / 5.0` : 'N/A'}
                  </strong>
                  {' · '}
                  Intento 2:{' '}
                  <strong>
                    {modStats.att2 ? `${modStats.att2.notaColombiana.toFixed(1)} / 5.0` : 'N/A'}
                  </strong>
                </span>
                <span className="font-bold text-emerald-800 text-sm">
                  Nota Definitiva Más Alta (Math.max): {modStats.bestGrade.toFixed(1)} / 5.0
                </span>
              </div>
              <p className="text-amber-900">
                Esta evaluación ha quedado deshabilitada tras completar sus 2 intentos. Puede regresar ahora al <strong>Panel Principal del Estudiante</strong> para iniciar otro examen de otro módulo o el Examen Integral.
              </p>
            </div>
          )}

          {/* Plan de Estudio Puente antes del Intento 2 */}
          {canStartSecondAttempt && failedTopicsInAttempt.length > 0 && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-2 text-xs text-sky-950 no-print">
              <div className="font-bold flex items-center gap-2 text-sky-900">
                <QrCode className="w-4 h-4 text-sky-700" />
                <span>Plan de Estudio Puente antes de su Intento #2 (Preguntas 100% Nuevas):</span>
              </div>
              <p className="text-sky-900/90">
                Repase estos ejes temáticos donde tuvo desaciertos antes de iniciar su segundo intento:
              </p>
              <ul className="list-disc list-inside font-medium space-y-0.5">
                {failedTopicsInAttempt.map((topic, idx) => (
                  <li key={idx}>{topic}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons: Print Certificate, Start 2nd Attempt, or Return to Student Panel to Take Another Exam */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Certificado Oficial (PDF)</span>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {canStartSecondAttempt && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModality(finishedResult.modalidad);
                    setFinishedResult(null);
                    setExamPhase('modality_select');
                    setInductionModalOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <span>Iniciar Segundo Intento (Preguntas Nuevas)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (modStats.count >= 2 || modStats.isExhausted) {
                    handleReturnToMainStudentPanel(finishedResult.modalidad);
                  } else {
                    setStudentDashboardTab('modalidades');
                    setFinishedResult(null);
                    setExamPhase('modality_select');
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>
                  {modStats.count >= 2 || modStats.isExhausted
                    ? 'Volver al Panel Principal del Estudiante (Iniciar Otro Examen)'
                    : 'Volver al Panel Principal del Estudiante'}
                </span>
              </button>
            </div>
          </div>
          <OptionServerSaveBar
            sectionKey="estudiante_certificado_resultados"
            label="Certificado y Calificación Oficial en Servidor"
            autoSave={true}
            watchValue={finishedResult.attemptId}
          />
        </div>

        {/* Pedagogical Feedback Section (Controlled by Teacher: Immediate vs Deferred + Toggle Breakdown) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900">
              Desglose Pregunta por Pregunta y Justificación Pedagógica
            </h2>
            <p className="text-xs text-slate-600">
              Análisis formativo de cada caso evaluado en la sesión.
            </p>
          </div>

          {!showDetailedBreakdown ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-xs text-amber-900 space-y-1.5">
              <div className="font-bold text-sm">
                {!isImmediateFeedbackForStudent
                  ? 'Retroalimentación en Modo DIFERIDA para su Sesión'
                  : !isBreakdownEnabledForStudent
                  ? 'Desglose Pregunta x Pregunta DESHABILITADO para su Sesión'
                  : 'Desglose Pregunta x Pregunta Fuera del Horario / Día Disponible'}
              </div>
              <p className="leading-relaxed">
                {!isImmediateFeedbackForStudent ? (
                  <>
                    Su calificación oficial ({finishedResult.notaColombiana.toFixed(1)} / 5.0) y su firma criptográfica (
                    {finishedResult.firmaVerificacion}) ya están registradas en firme. El docente ha configurado la{' '}
                    <strong>Retroalimentación DIFERIDA (Deshabilitada)</strong> para su usuario mientras finaliza la sesión académica.
                  </>
                ) : !isBreakdownEnabledForStudent ? (
                  <>
                    Su calificación oficial ({finishedResult.notaColombiana.toFixed(1)} / 5.0) está disponible, pero la visualización del{' '}
                    <strong>Desglose Pregunta x Pregunta se encuentra DESHABILITADA</strong> por el docente para su usuario.
                  </>
                ) : (
                  <>
                    {breakdownScheduleStatus.reason} Su nota oficial ({finishedResult.notaColombiana.toFixed(1)} / 5.0) ya se encuentra asegurada.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {finishedResult.respuestasDetalle.map((item, idx) => (
                <div
                  key={item.questionId}
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    item.acierto
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-red-200 bg-red-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-700">
                      Pregunta {idx + 1} ({item.questionId}) · Módulo {item.modulo} · {item.bloom}
                    </span>
                    {item.acierto ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> Correcta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-red-700">
                        <XCircle className="w-4 h-4" /> Incorrecta
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-slate-900">{item.enunciado}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <span className="text-slate-500 block">Respuesta elegida:</span>
                      <strong className={item.acierto ? 'text-emerald-700' : 'text-red-700'}>
                        {item.elegida
                          ? `${item.elegida}) ${item.opciones[item.elegida]}`
                          : 'Sin responder'}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                      <span className="text-slate-500 block">Opción correcta:</span>
                      <strong className="text-emerald-800">
                        {item.correcta}) {item.opciones[item.correcta]}
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white/90 border border-slate-200/80 text-slate-700 leading-relaxed">
                    <strong className="text-slate-900">Justificación Pedagógica: </strong>
                    {item.justificacion}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 text-center">
        <Trophy className="w-8 h-8 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Restaurando Portal Estudiantil</h2>
        <p className="text-xs text-slate-600">
          Su sesión está activa. Haga clic a continuación para abrir su Panel Principal o la Zona de Retos &amp; Insignias.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {currentStudent ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStudentDashboardTab('modalidades');
                  setExamPhase('modality_select');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                Ir a Exámenes por Módulo
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudentDashboardTab('mini_retos');
                  setExamPhase('modality_select');
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
              >
                🏅 Ir a Zona de Retos &amp; Insignias
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                logoutStudent();
                setVerifiedStudentId(null);
                setExamPhase('login');
              }}
              className="px-4 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
            >
              Iniciar Sesión de Estudiante
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
