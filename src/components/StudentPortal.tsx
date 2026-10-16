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
  AntiCheatDetectionType,
  UniversalCourseWorkspace,
  AcademicReviewTicket,
  AcademicReviewTicketType,
  AcademicActivityKey
} from '../types';
import {
  getDefaultCourseScheduleConfig,
  evaluateAllCourseActivities,
  applyLateSubmissionPenalty
} from '../utils/academicScheduleEngine';
import { computePayloadChecksum, generateDeterministicAccessCode } from '../data/students';
import {
  INITIAL_QUESTIONS,
  normalizeQuestionList,
  equalizeQuestionPsychometrics
} from '../data/questions';
import { getEffectiveMaxLlamadosAtencion } from '../utils/academicServerSummary';
import {
  getEffectiveCourseMetadata,
  getAssignedCourseWorkspacesForStudent,
  findStudentAcrossAllCourses,
  DEFAULT_MODULE_GRADING_WEIGHTS,
  parseRawDocumentLinksToStructured
} from '../utils/universalCourseEngine';
import {
  StudentPerformanceDashboard,
  ZeroTrialSimulatorModal
} from './StudentPerformanceDashboard';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { StudentMiniRetosZone } from './StudentMiniRetosZone';
import { getEffectiveBadgesForCourse } from '../utils/miniRetosEngine';
import { StudentPersonalAcademicFicha } from './AcademicClassAttendanceModule';
import {
  AcademicDataset,
  ClassSessionId,
  buildInitialAcademicDataset,
  computeStudentAcademicSummary,
  createDefaultStudentAcademicRecord
} from '../data/classAttendanceAndGrades';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import { useAuthSession, StudentDashboardTabType } from '../context/AuthContext';
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
  Trophy,
  Download,
  Eye,
  EyeOff,
  Copy,
  Check,
  HelpCircle
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
    updatedStudent?: StudentRecord
  ) => void;
  onRecordAntiCheatEvent?: (
    studentId: string,
    logEntry: AntiCheatLogEntry,
    updatedStudent?: StudentRecord
  ) => void;
  onUpdateLiveSession: (session: LiveClassroomSession | null, studentIdToRemove?: string) => void;
  onSwitchToTeacherLogin: () => void;
  onSwitchToEditorLogin?: () => void;
  onGoToInitialHome?: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  logoutSignal?: number;
  customMiniRetos?: CustomMiniRetoTemplate[];
  academicDataset?: AcademicDataset;
  onUpdateAcademicDataset?: (nextDataset: AcademicDataset) => void;
  activeExamsByStudent?: Record<string, any>;
  onSaveActiveExamBackup?: (studentId: string, backup: any | null) => void;
  onForceServerSync?: () => void;
  onActivateCourseWorkspace?: (workspace: UniversalCourseWorkspace) => void;
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
  onSwitchToEditorLogin,
  onGoToInitialHome,
  onSessionActiveChange,
  logoutSignal,
  customMiniRetos = [],
  academicDataset,
  onUpdateAcademicDataset,
  onSaveActiveExamBackup,
  onForceServerSync,
  onActivateCourseWorkspace
}: StudentPortalProps) {
  // Step 1: Dual Authentication State (Clean Initial Screen)
  const [docIdInput, setDocIdInput] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [showLoginAccessCode, setShowLoginAccessCode] = useState(false);
  const [codeHelpRequestStatus, setCodeHelpRequestStatus] = useState<{
    type: 'idle' | 'sending' | 'sent' | 'error';
    message?: string;
  }>({ type: 'idle' });
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [classroomPinInput, setClassroomPinInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [rollCallFeedbackBanner, setRollCallFeedbackBanner] = useState<string | null>(null);
  const [thirdAttemptBlockedModal, setThirdAttemptBlockedModal] = useState<{
    student: StudentRecord;
    bestGrade: number;
    att1: number | null;
    att2: number | null;
    modalidadLabel?: string;
  } | null>(null);
  const [teacherBlockedNoticeModal, setTeacherBlockedNoticeModal] = useState<{
    actividad: 'Examen' | 'Mini Reto';
    detalle?: string;
  } | null>(null);

  // Step 2: Verified Student Session & Active Student Dashboard Sub-tabs (Persisted via AuthContext + sessionStorageWrapper)
  const {
    authState,
    loginStudent,
    logoutStudent,
    setStudentSelectedCourseId,
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
  const [isCourseSelectionWindowOpen, setIsCourseSelectionWindowOpen] = useState<boolean>(
    () => !authState.studentSelectedCourseId
  );
  const [courseSearchQuery, setCourseSearchQuery] = useState<string>('');
  const [studentDashboardTab, setStudentDashboardTabState] = useState<StudentDashboardTabType>(
    () => authState.studentDashboardTab || 'inicio'
  );
  const [tabHistory, setTabHistory] = useState<StudentDashboardTabType[]>([]);
  const [selectedModality, setSelectedModalityState] = useState<ExamModality>(
    () => authState.selectedModality || 'integral'
  );

  const setStudentDashboardTab = useCallback(
    (tab: StudentDashboardTabType) => {
      setStudentDashboardTabState((prev) => {
        if (prev !== tab) {
          setTabHistory((hist) => [...hist.slice(-10), prev]);
        }
        return tab;
      });
      persistStudentTab(tab);
    },
    [persistStudentTab]
  );

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

  const handleGoBackStudentTab = useCallback(() => {
    if (examPhase === 'results') {
      setFinishedResult(null);
      setExamPhaseState('modality_select');
      persistStudentExamPhase('modality_select');
      return;
    }
    setTabHistory((hist) => {
      if (hist.length === 0) {
        setStudentDashboardTabState('inicio');
        persistStudentTab('inicio');
        return [];
      }
      const nextHist = [...hist];
      const previousTab = nextHist.pop() || 'inicio';
      setStudentDashboardTabState(previousTab);
      persistStudentTab(previousTab);
      return nextHist;
    });
  }, [examPhase, persistStudentExamPhase, persistStudentTab]);

  const handleGoHomeStudentPanel = useCallback(() => {
    setFinishedResult(null);
    setThirdAttemptBlockedModal(null);
    setInductionModalOpen(false);
    setTabHistory([]);
    setStudentDashboardTabState('inicio');
    persistStudentTab('inicio');
    setExamPhaseState('modality_select');
    persistStudentExamPhase('modality_select');
  }, [persistStudentTab, persistStudentExamPhase]);

  const setSelectedModality = useCallback(
    (mod: ExamModality) => {
      setSelectedModalityState(mod);
      persistSelectedModality(mod);
    },
    [persistSelectedModality]
  );

  // Edit Student Profile Modal (Name, Access Code, Email & WhatsApp editable, ID Read-only)
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileCodeInput, setProfileCodeInput] = useState('');
  const [profileEmailInput, setProfileEmailInput] = useState('');
  const [profileWhatsappInput, setProfileWhatsappInput] = useState('');
  const [profileSaveMsg, setProfileSaveMsg] = useState<string | null>(null);

  // Pre-Exam Induction Confirmation Modal (1-Warning Rule Induction) & Zero Trial Simulator
  const [inductionModalOpen, setInductionModalOpen] = useState(false);
  const [zeroTrialModalOpen, setZeroTrialModalOpen] = useState(false);
  const [examFilterStatus, setExamFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [selectedRetoModuloJump, setSelectedRetoModuloJump] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Ruta de Aprendizaje Visual (Stepper), Centro de Alertas Flotante / Sonoro y Bottom Sheets (Modo Táctil Web OS)
  const [selectedStepperClassId, setSelectedStepperClassId] = useState<ClassSessionId>(1);
  const [rollCallSoundEnabled, setRollCallSoundEnabled] = useState<boolean>(true);
  const lastSoundPlayedKeyRef = useRef<string>('');
  const [studentBottomSheet, setStudentBottomSheet] = useState<
    'none' | 'entregar_trabajo' | 'justificar_falla' | 'perfil'
  >('none');
  const [sheetClassId, setSheetClassId] = useState<ClassSessionId>(1);
  const [sheetWorkText, setSheetWorkText] = useState<string>('');
  const [sheetWorkLink, setSheetWorkLink] = useState<string>('');
  const [sheetExcuseBlock, setSheetExcuseBlock] = useState<'A' | 'B' | 'AB'>('A');
  const [sheetExcuseReason, setSheetExcuseReason] = useState<string>('');
  const [sheetExcuseUrl, setSheetExcuseUrl] = useState<string>('');
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);

  // Estados para Ticket Formal de Revisión de Nota / Reclamo Académico / Excusa
  const [reviewTicketType, setReviewTicketType] = useState<AcademicReviewTicketType>('RECALIFICACION_EXAMEN');
  const [reviewTicketTargetId, setReviewTicketTargetId] = useState<string>('integral');
  const [reviewTicketTargetLabel, setReviewTicketTargetLabel] = useState<string>('Examen Integral Final');
  const [reviewTicketCurrentGrade, setReviewTicketCurrentGrade] = useState<number>(0);
  const [reviewTicketRequestedGrade, setReviewTicketRequestedGrade] = useState<string>('4.0');
  const [reviewTicketQuestionRef, setReviewTicketQuestionRef] = useState<string>('');

  const playRollCallChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq: number, startOffset: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
        gain.gain.setValueAtTime(0.16, ctx.currentTime + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startOffset);
        osc.stop(ctx.currentTime + startOffset + dur);
      };
      playTone(587.33, 0, 0.18); // D5
      playTone(880, 0.19, 0.28); // A5
    } catch {
      // Ignore audio autoplay block if user has not interacted yet
    }
  }, []);

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

  // Dynamic Course Metadata & Modality Options derived from Universal Course Engine
  const activeCourseMeta = useMemo(
    () => getEffectiveCourseMetadata(config, null, authState.studentSelectedCourseId),
    [config, authState.studentSelectedCourseId]
  );

  // Courses assigned to this authenticated student
  const assignedStudentCourses = useMemo(
    () =>
      getAssignedCourseWorkspacesForStudent(config, verifiedStudentId, {
        students,
        questions,
        attempts,
        customMiniRetos,
        academicDataset
      }),
    [config, verifiedStudentId, students, questions, attempts, customMiniRetos, academicDataset]
  );

  const filteredStudentCourses = useMemo(() => {
    const q = courseSearchQuery.trim().toLowerCase();
    if (!q) return assignedStudentCourses;
    return assignedStudentCourses.filter(
      (c) =>
        (c.meta?.nombreCurso || '').toLowerCase().includes(q) ||
        (c.meta?.codigoCurso || '').toLowerCase().includes(q) ||
        (c.meta?.programaAcademico || '').toLowerCase().includes(q) ||
        (c.meta?.periodoAcademico || '').toLowerCase().includes(q) ||
        (c.meta?.docenteResponsable || '').toLowerCase().includes(q)
    );
  }, [assignedStudentCourses, courseSearchQuery]);

  const handleSelectStudentCourse = useCallback(
    (workspace: UniversalCourseWorkspace) => {
      if (!workspace || !workspace.meta?.courseId) return;
      onActivateCourseWorkspace?.(workspace);
      setStudentSelectedCourseId(workspace.meta.courseId);
      setIsCourseSelectionWindowOpen(false);
      setFinishedResult(null);
      setThirdAttemptBlockedModal(null);
      setInductionModalOpen(false);
      setTabHistory([]);
      setStudentDashboardTabState('inicio');
      persistStudentTab('inicio');
      setExamPhase('modality_select');
    },
    [
      onActivateCourseWorkspace,
      setStudentSelectedCourseId,
      persistStudentTab,
      setExamPhase
    ]
  );

  const studentClassSessions = useMemo(() => {
    const mods = Array.isArray(activeCourseMeta.modulosCurso)
      ? activeCourseMeta.modulosCurso
      : [];
    if (mods.length > 0) {
      return mods.slice(0, 6).map((m, idx) => {
        const docs =
          Array.isArray(m.documentosEnlaces) && m.documentosEnlaces.length > 0
            ? m.documentosEnlaces
            : parseRawDocumentLinksToStructured(m.enlacesTextoRaw || '', idx + 1, m.shortTitle);
        return {
          id: (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          code: (m.code || `C${idx + 1}`) as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6',
          shortTitle: m.shortTitle,
          fullTitle: `Clase ${idx + 1} / Módulo ${idx + 1}: ${m.shortTitle}`,
          subtitle: m.description || m.fullTitle || m.shortTitle,
          examenesCount: m.examenesCount ?? 1,
          retosCount: m.retosCount ?? 2,
          ponderacion: m.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS,
          documentosEnlaces: docs
        };
      });
    }
    return academicDataset?.classSessions || [];
  }, [activeCourseMeta.modulosCurso, academicDataset?.classSessions]);

  const activeModalityOptions = useMemo(() => {
    const configuredExams = Array.isArray(activeCourseMeta.examenesCurso)
      ? activeCourseMeta.examenesCurso.filter((e) => e.activo !== false)
      : [];
    if (configuredExams.length > 0) {
      return configuredExams.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        badge: e.badge,
        moduloFilter: e.moduloFilter as 1 | 2 | 3 | 4 | 5 | undefined,
        questionsCount: Math.max(1, Number(e.questionsCount) || 25),
        durationMinutes: Math.max(5, Number(e.durationMinutes) || 50),
        maxAttempts: Math.max(1, Math.min(3, Number(e.maxAttempts) || 2))
      }));
    }

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
          durationMinutes: intMin,
          maxAttempts: 2
        };
      }
      return {
        ...m,
        subtitle: `${modQ} preguntas exclusivas del Módulo ${m.moduloFilter} • ${modMin} minutos`,
        badge: `Módulo ${m.moduloFilter} · ${modQ} Reactivos · ${modMin} Min`,
        questionsCount: modQ,
        durationMinutes: modMin,
        maxAttempts: 2
      };
    });
  }, [
    activeCourseMeta,
    config.preguntasExamenIntegral,
    config.tiempoExamenIntegralMin,
    config.preguntasExamenModulo,
    config.tiempoExamenModuloMin
  ]);

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

  // DUA Live Accessibility Toolbar State (Persisted in localStorage across modules)
  const [duaFontSize, setDuaFontSize] = useState<'normal' | 'large' | 'xlarge'>(() => {
    try {
      const saved = localStorage.getItem('evaluaplus_student_font_size_v1');
      if (saved === 'large' || saved === 'xlarge' || saved === 'normal') return saved;
    } catch {
      // ignore
    }
    return 'normal';
  });
  const [duaWarmPaper, setDuaWarmPaper] = useState<boolean>(() => {
    try {
      return localStorage.getItem('evaluaplus_student_warm_paper_v1') === 'true';
    } catch {
      return false;
    }
  });
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

  // Always lookup fresh student object from active roster or across assigned courses in universalCoursesCatalog
  const currentStudent = useMemo(() => {
    if (!verifiedStudentId) return null;
    const cleanVerified = String(verifiedStudentId).trim().replace(/[\s.-]/g, '').toUpperCase();
    const fromActive = students.find(
      (s) => String(s?.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === cleanVerified
    );
    if (fromActive) return fromActive;
    const acrossCatalog = findStudentAcrossAllCourses(cleanVerified, undefined, config, students);
    return acrossCatalog.student || null;
  }, [verifiedStudentId, students, config]);

  // Synchronize profile form inputs when currentStudent loads or updates
  useEffect(() => {
    if (!currentStudent) return;
    setProfileNameInput(currentStudent.nombre || '');
    setProfileCodeInput(currentStudent.codigoAcceso || '');
    setProfileEmailInput(currentStudent.correo || '');
    setProfileWhatsappInput(currentStudent.whatsapp || '');
  }, [
    currentStudent?.id,
    currentStudent?.nombre,
    currentStudent?.codigoAcceso,
    currentStudent?.correo,
    currentStudent?.whatsapp
  ]);

  const handleOpenStudentCredentialsSheet = useCallback(() => {
    if (!currentStudent) return;
    setProfileNameInput(currentStudent.nombre || '');
    setProfileCodeInput(currentStudent.codigoAcceso || '');
    setProfileEmailInput(currentStudent.correo || '');
    setProfileWhatsappInput(currentStudent.whatsapp || '');
    setProfileSaveMsg(null);
    setStudentBottomSheet('perfil');
  }, [currentStudent]);

  const handleLogoutCurrentStudent = useCallback(() => {
    if (verifiedStudentId) {
      onUpdateLiveSession(null, verifiedStudentId);
    } else if (currentStudent) {
      onUpdateLiveSession(null, currentStudent.id);
    }
    logoutStudent();
    setVerifiedStudentId(null);
    setIsCourseSelectionWindowOpen(true);
    setDocIdInput('');
    setAccessCodeInput('');
    setClassroomPinInput('');
    setThirdAttemptBlockedModal(null);
    setInductionModalOpen(false);
    setConfirmSubmitModal(false);
    setDrawerOpen(false);
    setFinishedResult(null);
    setTabHistory([]);
    setStudentBottomSheet('none');
    setSessionAtRiskModalOpen(false);
    setExamPhase('login');
  }, [verifiedStudentId, currentStudent, onUpdateLiveSession, logoutStudent, setExamPhase]);

  // ================= TEMPORIZADOR DE INACTIVIDAD GLOBAL DEL PANEL DEL ESTUDIANTE (15 MIN ALERTA 'SESIÓN EN RIESGO' + 5 MIN CIERRE AUTOMÁTICO) =================
  const INACTIVITY_WARNING_MS = 15 * 60 * 1000; // 15 minutos sin interacción -> muestra modal 'Sesión en riesgo'
  const INACTIVITY_AUTO_LOGOUT_MS = 20 * 60 * 1000; // +5 minutos adicionales (20 min en total) -> cierre de sesión automático
  const lastStudentActivityMsRef = useRef<number>(Date.now());
  const [sessionAtRiskModalOpen, setSessionAtRiskModalOpen] = useState<boolean>(false);
  const [sessionAtRiskCountdownSec, setSessionAtRiskCountdownSec] = useState<number>(5 * 60);
  const [examFocusMode, setExamFocusMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('evaluaplus_student_focus_mode_v1') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('evaluaplus_student_font_size_v1', duaFontSize);
      localStorage.setItem('evaluaplus_student_warm_paper_v1', String(duaWarmPaper));
      localStorage.setItem('evaluaplus_student_focus_mode_v1', String(examFocusMode));
    } catch {
      // ignore
    }
  }, [duaFontSize, duaWarmPaper, examFocusMode]);

  const handleRequestClassroomCodeHelp = async () => {
    const cleanDoc = (docIdInput || '').trim();
    if (!cleanDoc) {
      setCodeHelpRequestStatus({
        type: 'error',
        message: 'Primero escriba su ID de Estudiante arriba para notificar al docente.'
      });
      return;
    }
    setCodeHelpRequestStatus({ type: 'sending' });
    try {
      const res = await fetch('/api/auth/request-code-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cleanDoc })
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setCodeHelpRequestStatus({
          type: 'sent',
          message:
            data.message ||
            'Solicitud enviada al Panel del Docente. El profesor podrá visualizar su código en pantalla.'
        });
      } else {
        setCodeHelpRequestStatus({
          type: 'error',
          message: data?.error || 'No se pudo enviar la solicitud.'
        });
      }
    } catch {
      setCodeHelpRequestStatus({
        type: 'error',
        message: 'Sin conexión con el servidor del aula. Consulte directamente al docente.'
      });
    }
  };
  const [offlineSubmissionQueued, setOfflineSubmissionQueued] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem('evaluaplus_pending_offline_submission_v1'));
    } catch {
      return false;
    }
  });

  const handleConfirmKeepStudentSessionActive = useCallback(() => {
    lastStudentActivityMsRef.current = Date.now();
    setSessionAtRiskModalOpen(false);
    setSessionAtRiskCountdownSec(5 * 60);
  }, []);

  useEffect(() => {
    const isSessionActive = Boolean(verifiedStudentId && examPhase !== 'login');
    if (!isSessionActive) {
      setSessionAtRiskModalOpen(false);
      setSessionAtRiskCountdownSec(5 * 60);
      return;
    }

    lastStudentActivityMsRef.current = Date.now();

    let lastRecordedEventMs = 0;
    const registerUserActivity = () => {
      const now = Date.now();
      if (now - lastRecordedEventMs < 800) return;
      lastRecordedEventMs = now;
      // Si el modal de 'Sesión en riesgo' AÚN NO está abierto, cualquier interacción reinicia el temporizador de 15 minutos
      if (now - lastStudentActivityMsRef.current < INACTIVITY_WARNING_MS) {
        lastStudentActivityMsRef.current = now;
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'scroll',
      'click',
      'pointerdown'
    ];

    activityEvents.forEach((evt) =>
      window.addEventListener(evt, registerUserActivity, { passive: true })
    );

    const checkInterval = window.setInterval(() => {
      const elapsedMs = Date.now() - lastStudentActivityMsRef.current;
      if (elapsedMs >= INACTIVITY_AUTO_LOGOUT_MS) {
        setSessionAtRiskModalOpen(false);
        handleLogoutCurrentStudent();
        setLoginError(
          '🔒 Su sesión se cerró automáticamente por seguridad del aula tras 20 minutos de inactividad (15 minutos sin interacción + 5 minutos de espera en «Sesión en riesgo»).'
        );
      } else if (elapsedMs >= INACTIVITY_WARNING_MS) {
        const remainingSec = Math.max(
          0,
          Math.ceil((INACTIVITY_AUTO_LOGOUT_MS - elapsedMs) / 1000)
        );
        setSessionAtRiskModalOpen((prev) => (prev ? prev : true));
        setSessionAtRiskCountdownSec((prev) => (prev === remainingSec ? prev : remainingSec));
      } else {
        setSessionAtRiskModalOpen((prev) => (prev ? false : prev));
        setSessionAtRiskCountdownSec((prev) => (prev === 300 ? prev : 300));
      }
    }, 1000);

    return () => {
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, registerUserActivity)
      );
      window.clearInterval(checkInterval);
    };
  }, [
    verifiedStudentId,
    examPhase,
    INACTIVITY_WARNING_MS,
    INACTIVITY_AUTO_LOGOUT_MS,
    handleLogoutCurrentStudent
  ]);

  const globalSessionAtRiskModalNode =
    sessionAtRiskModalOpen && examPhase !== 'login' ? (
      <div className="fixed inset-0 z-[90] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 no-print">
        <div className="bg-white border-2 border-amber-400 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-[10px] font-extrabold uppercase">
                🛡️ Seguridad del Aula · Temporizador de Inactividad
              </span>
              <h3 className="text-lg font-extrabold text-slate-900">
                Sesión en riesgo por inactividad
              </h3>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            No se ha detectado interacción en los últimos <strong>15 minutos</strong>. Por seguridad del aula, su sesión se cerrará automáticamente en:
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Cierre automático de sesión en
            </div>
            <div className="text-3xl font-extrabold font-mono text-red-600 tabular-nums">
              {String(Math.floor(sessionAtRiskCountdownSec / 60)).padStart(2, '0')}:
              {String(sessionAtRiskCountdownSec % 60).padStart(2, '0')}
            </div>
            <div className="w-full h-2 bg-amber-200/70 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, Math.round((sessionAtRiskCountdownSec / 300) * 100))
                  )}%`
                }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleLogoutCurrentStudent}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cerrar sesión ahora</span>
            </button>
            <button
              type="button"
              onClick={handleConfirmKeepStudentSessionActive}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mantener sesión activa</span>
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const teacherBlockedModalNode = teacherBlockedNoticeModal ? (
    <div className="fixed inset-0 z-[95] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 no-print animate-in fade-in">
      <div className="bg-white border-2 border-red-500 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-300 text-red-600 flex items-center justify-center shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-red-100 text-red-900 font-mono text-[10px] font-extrabold uppercase">
              🚫 Restricción Académica
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              Acceso bloqueado por el docente de la asignatura
            </h3>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
          {teacherBlockedNoticeModal.detalle ||
            `El docente de la asignatura ha bloqueado su acceso a ${
              teacherBlockedNoticeModal.actividad.toLowerCase() === 'examen' ? 'este examen' : 'esta actividad'
            } para este curso.`}
        </p>

        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium">
          Si considera que esto es un error o requiere autorización extemporánea, comuníquese directamente con el docente de la asignatura para desbloquear su usuario desde la opción «Control de Estudiantes».
        </div>

        <button
          type="button"
          onClick={() => setTeacherBlockedNoticeModal(null)}
          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  ) : null;

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

  const [rollCallNowMs, setRollCallNowMs] = useState<number>(() => Date.now());
  const [rollCallCodeInputByClass, setRollCallCodeInputByClass] = useState<Record<number, string>>({});
  const [showStudentScheduleAgenda, setShowStudentScheduleAgenda] = useState<boolean>(false);

  const effectiveCourseSchedule = useMemo(
    () =>
      getDefaultCourseScheduleConfig({
        ...config,
        courseScheduleConfig:
          activeCourseMeta?.courseScheduleConfig || config.courseScheduleConfig
      }),
    [config, activeCourseMeta?.courseScheduleConfig]
  );

  const scheduleQuarterMinTick = Math.floor(rollCallNowMs / 15000);
  const liveActivityWindows = useMemo(
    () =>
      evaluateAllCourseActivities(
        effectiveCourseSchedule,
        new Date(rollCallNowMs),
        currentStudent?.id
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveCourseSchedule, scheduleQuarterMinTick, currentStudent?.id]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setRollCallNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Normalize active question bank from assigned course database or server
  const safeQuestions = useMemo(() => {
    // 1. Consultar base de datos de preguntas asignada al curso por su identificador exacto
    const qBankId = activeCourseMeta?.selectedQuestionBankDbId;
    if (qBankId && Array.isArray(config?.questionBankDatabases)) {
      const assignedBank = config.questionBankDatabases.find((db) => db && db.id === qBankId);
      if (assignedBank && Array.isArray(assignedBank.questions) && assignedBank.questions.length > 0) {
        return normalizeQuestionList(assignedBank.questions);
      }
    }

    // 2. Si el catálogo de cursos tiene el workspace de este curso
    const currentWorkspace = (config?.universalCoursesCatalog || []).find(
      (w) => w.meta?.courseId === activeCourseMeta?.courseId
    );
    if (currentWorkspace?.meta?.selectedQuestionBankDbId && Array.isArray(config?.questionBankDatabases)) {
      const matched = config.questionBankDatabases.find(
        (db) => db && db.id === currentWorkspace.meta.selectedQuestionBankDbId
      );
      if (matched && Array.isArray(matched.questions) && matched.questions.length > 0) {
        return normalizeQuestionList(matched.questions);
      }
    }
    if (Array.isArray(currentWorkspace?.questions) && currentWorkspace.questions.length > 0) {
      return normalizeQuestionList(currentWorkspace.questions);
    }

    // 3. Fallback a questions prop
    if (Array.isArray(questions) && questions.length > 0) {
      return normalizeQuestionList(questions);
    }
    if (questionsBankExplicitlyCleared) {
      return [];
    }
    return normalizeQuestionList(INITIAL_QUESTIONS);
  }, [
    activeCourseMeta?.selectedQuestionBankDbId,
    activeCourseMeta?.courseId,
    config?.questionBankDatabases,
    config?.universalCoursesCatalog,
    questions,
    questionsBankExplicitlyCleared
  ]);

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

  // Online / Offline Resilience Listener + Automatic Flush of Offline Queued Submissions
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      try {
        const queuedRaw = localStorage.getItem('evaluaplus_pending_offline_submission_v1');
        if (queuedRaw) {
          void handleExecuteServerSave(
            'estudiante_reenvio_offline_automatico',
            'Sincronización automática de entrega de examen guardada en cola offline'
          ).then(() => {
            try {
              localStorage.removeItem('evaluaplus_pending_offline_submission_v1');
            } catch {
              // ignore
            }
            setOfflineSubmissionQueued(false);
          });
        }
      } catch {
        // ignore
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleExecuteServerSave]);

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

    const cleanId = (docIdInput || '').trim().replace(/[\s.-]/g, '').toUpperCase();
    const cleanCode = (accessCodeInput || '').trim().toUpperCase();

    if (!cleanId || !cleanCode) {
      setLoginError('Código de acceso de sesión inválido para este ID de estudiante. Solicite su código al docente.');
      return;
    }

    if (config.exigirPinAula) {
      if ((classroomPinInput || '').trim().toUpperCase() !== String(config.pinAulaDia || '').trim().toUpperCase()) {
        setLoginError('El PIN de Aula del Día ingresado no coincide con el proyectado por el docente en el salón.');
        return;
      }
    }

    // Find student in official roster or across any course in universalCoursesCatalog
    const lookupResult = findStudentAcrossAllCourses(cleanId, cleanCode, config, students);
    const matchedStudent = lookupResult.student;
    const isStudentCodeValid = lookupResult.isValidCode;

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

    // Credentials verified! Show the Available Courses Window so the student can choose one of their assigned courses
    onForceServerSync?.();
    setVerifiedStudentId(matchedStudent.id);
    loginStudent(matchedStudent.id);
    setStudentSelectedCourseId(null);
    setIsCourseSelectionWindowOpen(true);
    setCourseSearchQuery('');
    setProfileNameInput(matchedStudent.nombre || '');
    setProfileCodeInput(matchedStudent.codigoAcceso || '');
    setProfileEmailInput(matchedStudent.correo || '');
    setProfileWhatsappInput(matchedStudent.whatsapp || '');
    setTabHistory([]);
    setStudentDashboardTabState('inicio');
    persistStudentTab('inicio');
    setExamPhase('modality_select');
  };

  // Save Student Self-Service Profile Update (Name, Access Code, Email & WhatsApp, ID Read-Only)
  const handleSaveStudentProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent) return;
    const cleanName = (profileNameInput || '').trim();
    const cleanCode = (profileCodeInput || '').trim().toUpperCase();
    const cleanEmail = (profileEmailInput || '').trim().toLowerCase();
    const cleanWhatsapp = (profileWhatsappInput || '').trim();
    if (!cleanName || cleanCode.length < 6) {
      setProfileSaveMsg('Ingrese su nombre completo y un código válido (mínimo 6 caracteres).');
      return;
    }
    const updated: StudentRecord = {
      ...currentStudent,
      nombre: cleanName,
      codigoAcceso: cleanCode,
      correo: cleanEmail,
      whatsapp: cleanWhatsapp
    };
    onUpdateStudentProfile(updated);
    void handleExecuteServerSave(
      'estudiante_perfil_datos',
      `Actualización automática de perfil del estudiante (${updated.nombre})`
    );
    fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: 'CuentaCredencialesEstudiante',
        description: `Estudiante ${updated.nombre} (${updated.id}) actualizó sus credenciales/datos de contacto (Correo: ${updated.correo || 'N/A'}, WhatsApp: ${updated.whatsapp || 'N/A'}).`,
        actorId: updated.id,
        actorRole: 'estudiante'
      })
    }).catch(() => {});
    setProfileSaveMsg(
      '✓ Sus datos (Nombre, Código de Acceso, Correo Electrónico y WhatsApp/Celular) se actualizaron automáticamente en la Base de Datos del Servidor.'
    );
    setTimeout(() => {
      setProfileSaveMsg(null);
      setEditProfileModalOpen(false);
      setStudentBottomSheet('none');
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
      const isBlockedByTeacher = Boolean(
        currentStudent.bloqueadoExamenesDocente ||
        currentStudent.examenesBloqueados?.includes(modalityId)
      );
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

      if (st.isBlockedByTeacher) {
        setTeacherBlockedNoticeModal({
          actividad: 'Examen',
          detalle: 'Acceso bloqueado por el docente de la asignatura'
        });
        setInductionModalOpen(false);
        return;
      }

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
      const hasPersonalExamExtension =
        liveActivityWindows.EXAMENES.status === 'EXTENSION_ACTIVE';
      const isMasterClosedForCurrentStudent =
        !hasPersonalExamExtension &&
        (!config.examenAbierto ||
          !liveActivityWindows.EXAMENES.isAccessible ||
          Boolean((config.estudiantesConEstadoCerrado || []).includes(currentStudent.id)));
      if (attemptToStart && !st.isBlockedByTeacher && !isMasterClosedForCurrentStudent) {
        setInductionModalOpen(true);
      }
    },
    [
      currentStudent,
      activeModalityOptions,
      getModalityAttemptStats,
      config.examenAbierto,
      config.estudiantesConEstadoCerrado,
      liveActivityWindows.EXAMENES
    ]
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
      setTeacherBlockedNoticeModal({
        actividad: 'Examen',
        detalle: 'Acceso bloqueado por el docente de la asignatura'
      });
      setLoginError('Acceso bloqueado por el docente de la asignatura');
      return;
    }

    if (!liveActivityWindows.EXAMENES.isAccessible) {
      setLoginError(
        `⏳ ${liveActivityWindows.EXAMENES.badgeText}: ${liveActivityWindows.EXAMENES.reasonDetail}`
      );
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
      // Automatically sum and integrate selected questions from all course modules (Módulo 1 to Módulo N)
      const courseModules =
        Array.isArray(activeCourseMeta?.modulosCurso) && activeCourseMeta.modulosCurso.length > 0
          ? activeCourseMeta.modulosCurso
          : [];
      const totalMods = Math.max(1, courseModules.length || activeCourseMeta?.cantidadModulos || 5);
      const defaultPerMod = Math.max(1, Math.floor(targetCount / totalMods));
      const remainder = Math.max(0, targetCount - defaultPerMod * totalMods);

      for (let idx = 0; idx < totalMods; idx++) {
        const modNum = courseModules[idx]?.id || idx + 1;
        const modDef = courseModules[idx];
        const explicitSelectedIds = Array.isArray(modDef?.preguntasSeleccionadasIntegralIds)
          ? modDef.preguntasSeleccionadasIntegralIds
          : [];
        const configuredModCount =
          explicitSelectedIds.length > 0
            ? explicitSelectedIds.length
            : typeof modDef?.preguntasParaIntegralCount === 'number' &&
              modDef.preguntasParaIntegralCount > 0
            ? modDef.preguntasParaIntegralCount
            : defaultPerMod + (idx + 1 <= remainder ? 1 : 0);

        const modQuestions = safeQuestions.filter((q) => Number(q.modulo) === Number(modNum));
        const effectiveModQuestions =
          modQuestions.length > 0
            ? modQuestions
            : INITIAL_QUESTIONS.filter((q) => Number(q.modulo) === Number(((modNum - 1) % 5) + 1));

        if (explicitSelectedIds.length > 0) {
          const explicitPool = effectiveModQuestions.filter((q) =>
            explicitSelectedIds.includes(q.id)
          );
          const unusedExplicit = explicitPool.filter((q) => !usedIdsInModality.has(q.id));
          const pickedPool =
            unusedExplicit.length >= explicitPool.length && explicitPool.length > 0
              ? unusedExplicit
              : explicitPool.length > 0
              ? explicitPool
              : effectiveModQuestions;
          chosenRaw.push(...shuffleArray(pickedPool).slice(0, configuredModCount));
        } else {
          const pool = effectiveModQuestions.filter((q) => !usedIdsInModality.has(q.id));
          const fallbackPool = pool.length >= configuredModCount ? pool : effectiveModQuestions;
          const picked = shuffleArray(fallbackPool).slice(0, configuredModCount);
          chosenRaw.push(...picked);
        }
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

    // Iniciar en modo ventana maximizada del navegador (sin forzar pantalla completa para evitar bloqueos del sistema)
    hasEnteredFullscreenRef.current = Boolean(document.fullscreenElement);
    try {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      // ignore
    }

    setExamPhase('active_exam');
  };

  // Ref for timeLeftSeconds and per-question seconds so callbacks and effects don't re-bind every 1 second
  const timeLeftRef = useRef(timeLeftSeconds);
  const perQuestionSecondsRef = useRef<Record<string, number>>({});
  const currentIndexRef = useRef(currentIndex);
  const hasEnteredFullscreenRef = useRef<boolean>(false);
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

      const baseRawNota = isSuspended ? 0.0 : Number(((aciertosCount / totalQ) * 5.0).toFixed(1));
      const latePenaltyEval = !isSuspended && liveActivityWindows?.EXAMENES
        ? applyLateSubmissionPenalty(baseRawNota, liveActivityWindows.EXAMENES)
        : { finalGrade: baseRawNota, penaltyApplied: false, penaltyDetail: '' };
      const rawNota = latePenaltyEval.finalGrade;
      const porcentaje = isSuspended ? 0 : Math.round((aciertosCount / totalQ) * 100);
      const baseConcept = isSuspended
        ? customInfractionConcept || suspensionReason || 'Suspendido por infracción de seguridad'
        : warningsCount > 0
        ? `${warningsCount}/${maxLlamadosPermitidos} Llamado(s) preventivo(s) (${suspensionReason})`
        : '✓ Sin infracciones';
      const finalConcept = latePenaltyEval.penaltyApplied
        ? `${baseConcept} · ${latePenaltyEval.penaltyDetail}`
        : baseConcept;

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

      const attemptIdStr = `ATT-${currentStudent.id}-${selectedModality}-${currentAttemptNumber}-${Date.now()}`;
      const result: ExamAttemptResult = {
        attemptId: attemptIdStr,
        id: attemptIdStr,
        fecha: fechaStr,
        timestampMs: Date.now(),
        studentId: currentStudent.id,
        studentName: currentStudent.nombre,
        codigoSesion: currentStudent.codigoAcceso,
        intentoNumero: currentAttemptNumber,
        modalidad: selectedModality,
        modalidadLabel: modConfig.title,
        modalidadTitle: modConfig.title,
        totalPreguntas: totalQ,
        aciertos: aciertosCount,
        incorrectas: totalQ - aciertosCount,
        notaColombiana: rawNota,
        notaFinal: rawNota,
        nota: rawNota,
        porcentaje,
        tiempoEmpleadoSegundos: elapsedSec,
        duracionSegundos: elapsedSec,
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
      try {
        onRecordAttempt(result, updatedStudent);
      } catch (err) {
        console.error('Error no crítico al invocar onRecordAttempt:', err);
      }

      if (!navigator.onLine || !isOnline) {
        try {
          localStorage.setItem(
            'evaluaplus_pending_offline_submission_v1',
            JSON.stringify({
              studentId: currentStudent.id,
              attemptId: result.attemptId || result.id || '',
              nota: rawNota,
              savedAtIso: new Date().toISOString()
            })
          );
          setOfflineSubmissionQueued(true);
        } catch {
          // ignore
        }
      }
      void handleExecuteServerSave(
        'estudiante_certificado_resultados',
        `Registro automático de examen (${modConfig.title} - Intento #${currentAttemptNumber} - Nota: ${rawNota.toFixed(1)})`
      ).then((ok) => {
        if (ok) {
          try {
            localStorage.removeItem('evaluaplus_pending_offline_submission_v1');
          } catch {
            // ignore
          }
          setOfflineSubmissionQueued(false);
        }
      });
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
      if (document.fullscreenElement) {
        hasEnteredFullscreenRef.current = true;
      } else if (armed && isExamFullscreenGuardEnabled && hasEnteredFullscreenRef.current) {
        hasEnteredFullscreenRef.current = false;
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

  const currentStudentAcademicRecord = currentStudent
    ? (academicDataset || buildInitialAcademicDataset(students)).records.find(
        (r) => r.studentId === currentStudent.id
      ) ||
      createDefaultStudentAcademicRecord(
        currentStudent.id,
        currentStudent.nombre,
        currentStudent.id
      )
    : null;

  const activeRollCallClasses = currentStudentAcademicRecord
    ? (studentClassSessions || [])
        .map((s) => s.id as ClassSessionId)
        .filter((cId) => {
          const c = currentStudentAcademicRecord.clases[cId];
          const isCalling = Boolean(
            c?.llamadoVirtualActivo ||
              (c as any)?.llamadoAsistenciaActivo ||
              c?.asistenciaB1Estado === 'llamando' ||
              c?.asistenciaB2Estado === 'llamando'
          );
          if (!isCalling) return false;
          if (c?.llamadoVirtualExpiraAtIso) {
            const expMs = new Date(c.llamadoVirtualExpiraAtIso).getTime();
            if (!Number.isNaN(expMs) && expMs <= rollCallNowMs) {
              return false;
            }
          }
          return true;
        })
    : [];

  const handleStudentRespondRollCall = (
    claseId: ClassSessionId,
    enteredCodeOptional?: string
  ) => {
    if (!onUpdateAcademicDataset || !currentStudent) return;
    const baseDataset = academicDataset || buildInitialAcademicDataset(students);
    const studentRec = baseDataset.records.find((r) => r.studentId === currentStudent.id);
    const prevCForCheck = studentRec?.clases?.[claseId];

    // If a strict code/keyword was typed, validate if needed; allow direct button click when method is alerta_boton_panel or when code matches
    const method = prevCForCheck?.llamadoVirtualMetodo || 'alerta_boton_panel';
    const expectedStudentPin = (prevCForCheck?.llamadoVirtualCodigoUnico || '').trim().toUpperCase();
    const expectedClassKeyword = (
      baseDataset.aperturaClaseActiva?.palabraClaveSecreta || ''
    )
      .trim()
      .toUpperCase();

    if (
      typeof enteredCodeOptional === 'string' &&
      enteredCodeOptional.trim().length > 0
    ) {
      const cleanTyped = enteredCodeOptional.trim().toUpperCase();
      const matchesPin = expectedStudentPin && cleanTyped === expectedStudentPin;
      const matchesKeyword = expectedClassKeyword && cleanTyped === expectedClassKeyword;
      if (!matchesPin && !matchesKeyword && (expectedStudentPin || expectedClassKeyword)) {
        setRollCallFeedbackBanner(
          `⚠️ El código ingresado (${cleanTyped}) no coincide con el código asignado. Verifique el código enviado a su WhatsApp/Correo o pulse el botón "¡Presente!" directo.`
        );
        setTimeout(() => setRollCallFeedbackBanner(null), 5000);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const existsInRecords = baseDataset.records.some((r) => r.studentId === currentStudent.id);
    const baseRecords = existsInRecords
      ? baseDataset.records
      : [
          ...baseDataset.records,
          createDefaultStudentAcademicRecord(
            currentStudent.id,
            currentStudent.nombre,
            currentStudent.id
          )
        ];
    const nextRecords = baseRecords.map((rec) => {
      if (rec.studentId !== currentStudent.id) return rec;
      const prevC = rec.clases[claseId];
      const bloqueTarget = prevC?.llamadoVirtualBloque;
      const isB1Target =
        bloqueTarget === 'ambos' ||
        bloqueTarget === 1 ||
        prevC?.asistenciaB1Estado === 'llamando' ||
        (!bloqueTarget && prevC?.asistenciaB2Estado !== 'llamando');
      const isB2Target =
        bloqueTarget === 'ambos' ||
        bloqueTarget === 2 ||
        prevC?.asistenciaB2Estado === 'llamando';

      const nextB1 = isB1Target ? 'presente_virtual' : prevC?.asistenciaB1Estado || 'sin_registrar';
      const nextB2 = isB2Target ? 'presente_virtual' : prevC?.asistenciaB2Estado || 'sin_registrar';
      const nextB1Bool = isB1Target ? true : prevC?.bloque1Asistio ?? true;
      const nextB2Bool = isB2Target ? true : prevC?.bloque2Asistio ?? true;

      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevC,
            bloque1Asistio: nextB1Bool,
            bloque2Asistio: nextB2Bool,
            asistenciaB1Estado: nextB1,
            asistenciaB2Estado: nextB2,
            asistenciaB1ConfirmadaAtIso: isB1Target
              ? nowIso
              : prevC?.asistenciaB1ConfirmadaAtIso,
            asistenciaB2ConfirmadaAtIso: isB2Target
              ? nowIso
              : prevC?.asistenciaB2ConfirmadaAtIso,
            llamadoVirtualActivo: false,
            llamadoVirtualRespondidoAtIso: nowIso
          }
        }
      };
    });
    onUpdateAcademicDataset({
      ...baseDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
    const csInfo = (studentClassSessions || []).find((s) => s.id === claseId);
    const bloqueStr =
      prevCForCheck?.llamadoVirtualBloque === 'ambos'
        ? 'Bloques A y B (B1 + B2)'
        : prevCForCheck?.llamadoVirtualBloque === 2
        ? 'Bloque B (B2)'
        : 'Bloque A (B1)';
    setRollCallFeedbackBanner(
      `✅ ¡PRESENTE REGISTRADO! Su asistencia para ${csInfo?.code || `Clase C${claseId}`} (${bloqueStr}) quedó grabada automáticamente en el Panel del Docente (${new Date().toLocaleTimeString('es-CO')}).`
    );
    setTimeout(() => setRollCallFeedbackBanner(null), 7000);
  };

  const handleStudentSubmitWork = (
    claseId: ClassSessionId,
    entregaTexto: string,
    entregaEnlace?: string
  ) => {
    if (!onUpdateAcademicDataset || !currentStudent) return;
    const baseDataset = academicDataset || buildInitialAcademicDataset(students);
    const nowIso = new Date().toISOString();
    const existsInRecords = baseDataset.records.some((r) => r.studentId === currentStudent.id);
    const baseRecords = existsInRecords
      ? baseDataset.records
      : [
          ...baseDataset.records,
          createDefaultStudentAcademicRecord(
            currentStudent.id,
            currentStudent.nombre,
            currentStudent.id
          )
        ];
    const nextRecords = baseRecords.map((rec) => {
      if (rec.studentId !== currentStudent.id) return rec;
      const prevC = rec.clases[claseId];
      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevC,
            trabajoEstado: 'pendiente_revision' as const,
            trabajoEntregaTexto: entregaTexto,
            trabajoEntregaEnlace: entregaEnlace || prevC?.trabajoEntregaEnlace || '',
            trabajoEntregadoAtIso: nowIso
          }
        }
      };
    });
    onUpdateAcademicDataset({
      ...baseDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
  };

  const handleStudentSubmitExcusa = (
    claseId: ClassSessionId,
    bloque: 'A' | 'B' | 'AB',
    motivo: string,
    soporteUrl: string
  ) => {
    if (!onUpdateAcademicDataset || !currentStudent) return;
    const baseDataset = academicDataset || buildInitialAcademicDataset(students);
    const nowIso = new Date().toISOString();
    const existsInRecords = baseDataset.records.some((r) => r.studentId === currentStudent.id);
    const baseRecords = existsInRecords
      ? baseDataset.records
      : [
          ...baseDataset.records,
          createDefaultStudentAcademicRecord(
            currentStudent.id,
            currentStudent.nombre,
            currentStudent.id
          )
        ];
    const nextRecords = baseRecords.map((rec) => {
      if (rec.studentId !== currentStudent.id) return rec;
      const prevC = rec.clases[claseId];
      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevC,
            asistenciaSolicitudEstado: 'pendiente' as const,
            asistenciaSolicitudBloque: bloque === 'AB' ? 'AMBOS' : bloque,
            asistenciaSolicitudMotivo: motivo,
            asistenciaSolicitudSoporteUrl: soporteUrl,
            asistenciaSolicitudFechaIso: nowIso,
            excusaEstado: 'pendiente_revision' as const,
            excusaBloque: bloque,
            excusaMotivo: motivo,
            excusaSoporteUrl: soporteUrl,
            excusaSolicitadaAtIso: nowIso
          }
        }
      };
    });
    onUpdateAcademicDataset({
      ...baseDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });

    if (onUpdateStudentProfile) {
      const csInfo = (studentClassSessions || []).find((s) => s.id === claseId);
      const label = `${csInfo?.code || `Clase C${claseId}`} — Excusa de Inasistencia (Bloque ${bloque})`;
      const newTicket: AcademicReviewTicket = {
        id: `TCK-${Date.now().toString(36).toUpperCase()}`,
        studentId: currentStudent.id,
        studentName: currentStudent.nombre,
        fechaCreacion: new Date(nowIso).toLocaleString('es-CO'),
        createdAtIso: nowIso,
        timestampMs: Date.now(),
        tipo: 'EXCUSA_INASISTENCIA',
        referenciaId: `clase_${claseId}`,
        referenciaLabel: label,
        targetId: `clase_${claseId}`,
        targetLabel: label,
        claseId,
        bloqueExcusa: bloque,
        motivoEstudiante: motivo,
        enlaceEvidencia: soporteUrl || undefined,
        soporteUrl: soporteUrl || undefined,
        estado: 'PENDIENTE'
      };
      const prevTickets = Array.isArray(currentStudent.solicitudesRevision)
        ? currentStudent.solicitudesRevision
        : [];
      onUpdateStudentProfile({
        ...currentStudent,
        solicitudesRevision: [newTicket, ...prevTickets]
      });
    }
  };

  const openFormalReviewTicketModal = (params: {
    tipo: AcademicReviewTicketType;
    targetId: string;
    targetLabel: string;
    notaActual?: number;
    preguntaReferencia?: string;
    claseId?: ClassSessionId;
  }) => {
    setReviewTicketType(params.tipo);
    setReviewTicketTargetId(params.targetId);
    setReviewTicketTargetLabel(params.targetLabel);
    const currentG = typeof params.notaActual === 'number' ? params.notaActual : 0;
    setReviewTicketCurrentGrade(currentG);
    setReviewTicketRequestedGrade(
      Math.min(5.0, Math.max(3.0, Number((currentG + 0.5).toFixed(1)))).toFixed(1)
    );
    setReviewTicketQuestionRef(params.preguntaReferencia || '');
    if (params.claseId) {
      setSheetClassId(params.claseId);
    }
    setSheetExcuseReason(
      params.preguntaReferencia
        ? `Solicito revisión académica respecto a ${params.preguntaReferencia}: considero que el enunciado admite interpretación válida porque...`
        : ''
    );
    setSheetExcuseUrl('');
    setSheetNotice(null);
    setStudentBottomSheet('justificar_falla');
  };

  const handleStudentSubmitFormalTicket = () => {
    if (!currentStudent) return;
    const cleanReason = sheetExcuseReason.trim();
    if (!cleanReason) {
      setSheetNotice('⚠️ Por favor describa la justificación académica o motivo de su solicitud.');
      return;
    }

    const nowIso = new Date().toISOString();
    if (reviewTicketType === 'EXCUSA_INASISTENCIA') {
      handleStudentSubmitExcusa(
        sheetClassId,
        sheetExcuseBlock,
        cleanReason,
        sheetExcuseUrl.trim()
      );
      setSheetNotice(
        `✓ Excusa de inasistencia para Clase C${sheetClassId} (Bloque ${sheetExcuseBlock}) radicada con éxito en la Bandeja del Docente.`
      );
      setTimeout(() => setStudentBottomSheet('none'), 1300);
      return;
    }

    const parsedReqGrade = Math.min(
      5.0,
      Math.max(0.0, Number(parseFloat(reviewTicketRequestedGrade || '0').toFixed(1)) || 0)
    );
    const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}`;
    const newTicket: AcademicReviewTicket = {
      id: ticketId,
      studentId: currentStudent.id,
      studentName: currentStudent.nombre,
      fechaCreacion: new Date(nowIso).toLocaleString('es-CO'),
      createdAtIso: nowIso,
      timestampMs: Date.now(),
      tipo: reviewTicketType,
      referenciaId: reviewTicketTargetId,
      referenciaLabel: reviewTicketTargetLabel,
      targetId: reviewTicketTargetId,
      targetLabel: reviewTicketTargetLabel,
      preguntaReferencia: reviewTicketQuestionRef.trim() || undefined,
      notaActual: Number(reviewTicketCurrentGrade.toFixed(1)),
      notaSolicitada: parsedReqGrade,
      motivoEstudiante: cleanReason,
      enlaceEvidencia: sheetExcuseUrl.trim() || undefined,
      soporteUrl: sheetExcuseUrl.trim() || undefined,
      estado: 'PENDIENTE'
    };

    const prevTickets = Array.isArray(currentStudent.solicitudesRevision)
      ? currentStudent.solicitudesRevision
      : [];
    onUpdateStudentProfile?.({
      ...currentStudent,
      solicitudesRevision: [newTicket, ...prevTickets]
    });

    setSheetNotice(
      `✓ Ticket #${ticketId} radicado exitosamente. El docente recibirá su solicitud en la Bandeja Centralizada.`
    );
    setTimeout(() => setStudentBottomSheet('none'), 1300);
  };

  // Emitir sonido automático cuando se detecte un nuevo llamado de asistencia activo
  useEffect(() => {
    if (!rollCallSoundEnabled || activeRollCallClasses.length === 0) return;
    const key = activeRollCallClasses
      .map((cId) => `${cId}:${currentStudentAcademicRecord?.clases?.[cId]?.llamadoVirtualEmitidoAtIso || ''}`)
      .join('|');
    if (key && key !== lastSoundPlayedKeyRef.current) {
      lastSoundPlayedKeyRef.current = key;
      playRollCallChime();
    }
  }, [activeRollCallClasses, currentStudentAcademicRecord, playRollCallChime, rollCallSoundEnabled]);

  // ================= VIEW 1: VENTANA DE INICIO DE SESIÓN DEL ESTUDIANTE =================
  if (examPhase === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xs p-6 sm:p-8 space-y-6">
          {onGoToInitialHome && (
            <div>
              <button
                type="button"
                onClick={onGoToInitialHome}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver</span>
              </button>
            </div>
          )}

          <div className="space-y-2 text-center">
            <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center mx-auto">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Estudiante
            </h1>
          </div>

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
              <label htmlFor="docId" className="block text-xs sm:text-sm font-bold text-slate-800">
                ID de Estudiante
              </label>
              <input
                id="docId"
                type="text"
                inputMode="numeric"
                required
                autoComplete="off"
                value={docIdInput}
                onChange={(e) => setDocIdInput(e.target.value)}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="accessCode" className="block text-xs sm:text-sm font-bold text-slate-800">
                  Código de Acceso de Sesión
                </label>
                <button
                  type="button"
                  onClick={() => setShowLoginAccessCode((v) => !v)}
                  className="text-[11px] font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  {showLoginAccessCode ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ocultar</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Mostrar</span>
                    </>
                  )}
                </button>
              </div>
              <input
                id="accessCode"
                type={showLoginAccessCode ? 'text' : 'password'}
                required
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={24}
                value={accessCodeInput}
                onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 text-base sm:text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
              />
            </div>

            {config.exigirPinAula && (
              <div className="space-y-1.5 pt-1">
                <label htmlFor="classroomPin" className="block text-xs sm:text-sm font-bold text-sky-900">
                  PIN de Aula Temporal del Día
                </label>
                <input
                  id="classroomPin"
                  type="text"
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={classroomPinInput}
                  onChange={(e) => setClassroomPinInput(e.target.value.toUpperCase())}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-sky-300 bg-sky-50/50 text-base sm:text-sm font-mono uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[52px] py-3.5 px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-base sm:text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Asistencia rápida en aula si olvidó su código */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button
                type="button"
                disabled={codeHelpRequestStatus.type === 'sending'}
                onClick={() => void handleRequestClassroomCodeHelp()}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-200 text-xs font-bold text-slate-700 hover:text-sky-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>
                  {codeHelpRequestStatus.type === 'sending'
                    ? 'Enviando aviso al docente en sala...'
                    : '¿Olvidó su código? Solicitar ayuda al docente en sala'}
                </span>
              </button>
              {codeHelpRequestStatus.message && (
                <div
                  className={`p-2.5 rounded-xl text-[11px] font-semibold border ${
                    codeHelpRequestStatus.type === 'sent'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {codeHelpRequestStatus.message}
                </div>
              )}
            </div>
          </form>

          {/* Navegación rápida entre perfiles de acceso */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Cambiar perfil de ingreso:</span>
            <div className="flex items-center gap-3 font-semibold">
              {onSwitchToTeacherLogin && (
                <button
                  type="button"
                  onClick={onSwitchToTeacherLogin}
                  className="text-slate-700 hover:text-slate-950 hover:underline underline-offset-4 cursor-pointer"
                >
                  Docente
                </button>
              )}
              {onSwitchToTeacherLogin && onSwitchToEditorLogin && (
                <span aria-hidden="true" className="text-slate-300">·</span>
              )}
              {onSwitchToEditorLogin && (
                <button
                  type="button"
                  onClick={onSwitchToEditorLogin}
                  className="text-indigo-700 hover:text-indigo-900 hover:underline underline-offset-4 cursor-pointer"
                >
                  Editor
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ================= VIEW 2A: VENTANA DE CURSOS DISPONIBLES ASIGNADOS AL ESTUDIANTE =================
  if (
    examPhase === 'modality_select' &&
    currentStudent &&
    (isCourseSelectionWindowOpen || !authState.studentSelectedCourseId)
  ) {
    const cleanCurrentId = String(currentStudent.id || '')
      .trim()
      .replace(/[\s.-]/g, '')
      .toUpperCase();

    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Cabecera de Bienvenida del Estudiante */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-800 uppercase tracking-wide">
                    Portal del Estudiante · Mis Cursos Disponibles
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                    {assignedStudentCourses.length}{' '}
                    {assignedStudentCourses.length === 1 ? 'curso asignado' : 'cursos asignados'}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Bienvenido(a), {currentStudent.nombre}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600">
                  ID Estudiante: <span className="font-mono font-bold text-slate-800">{currentStudent.id}</span> · Seleccione uno de los cursos que tiene asignados para cargar toda su información académica, lecciones, mini-retos, exámenes y calificaciones.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center shrink-0">
              {Boolean(authState.studentSelectedCourseId) && (
                <button
                  type="button"
                  onClick={() => setIsCourseSelectionWindowOpen(false)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                >
                  Volver al curso actual
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenStudentCredentialsSheet}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-transform whitespace-nowrap shrink-0 shadow-2xs"
                title="Cuenta y Credenciales del Estudiante"
              >
                <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Cuenta Estudiante</span>
              </button>
              <button
                type="button"
                onClick={handleLogoutCurrentStudent}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold text-red-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>

          {/* Buscador cuando hay cursos asignados */}
          {assignedStudentCourses.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-700">
                Filtrar mis cursos asignados ({filteredStudentCourses.length} de {assignedStudentCourses.length})
              </div>
              <input
                type="text"
                value={courseSearchQuery}
                onChange={(e) => setCourseSearchQuery(e.target.value)}
                placeholder="Buscar por nombre del curso, código, docente o periodo..."
                className="w-full sm:w-96 px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          )}

          {/* Listado de Cursos Asignados al Estudiante */}
          {filteredStudentCourses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-slate-900">
                No se encontraron cursos con ese criterio
              </div>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Verifique el término de búsqueda o consulte con su docente la asignación de su curso.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredStudentCourses.map((course) => {
                const cMeta = getEffectiveCourseMetadata(config, null, course.meta.courseId);
                const isCurrentlySelected =
                  authState.studentSelectedCourseId === cMeta.courseId ||
                  config.activeCourseId === cMeta.courseId;

                const courseRoster = Array.isArray(course.students) ? course.students : [];
                const studentInCourse =
                  courseRoster.find(
                    (s) =>
                      String(s?.id || '')
                        .trim()
                        .replace(/[\s.-]/g, '')
                        .toUpperCase() === cleanCurrentId
                  ) || currentStudent;

                const courseAttempts = Array.isArray(course.attempts) ? course.attempts : [];
                const myCourseAttempts = courseAttempts.filter(
                  (a) =>
                    String(a?.studentId || '')
                      .trim()
                      .replace(/[\s.-]/g, '')
                      .toUpperCase() === cleanCurrentId
                );
                const myBestGradeInCourse =
                  myCourseAttempts.length > 0
                    ? Math.max(...myCourseAttempts.map((a) => Number(a.notaColombiana) || 0))
                    : 0;
                const myUnlockedBadgesCount = ([1, 2, 3, 4, 5] as const).filter(
                  (m) => studentInCourse?.progresoRetos?.[m]?.insigniaDesbloqueada
                ).length;
                const modulesCount = Math.max(
                  1,
                  Array.isArray(cMeta.modulosCurso) && cMeta.modulosCurso.length > 0
                    ? cMeta.modulosCurso.length
                    : Number(cMeta.cantidadModulos) || 5
                );

                return (
                  <div
                    key={cMeta.courseId}
                    onClick={() => handleSelectStudentCourse(course)}
                    className={`group bg-white rounded-2xl p-6 border-2 transition-all flex flex-col justify-between gap-5 cursor-pointer shadow-xs hover:shadow-md ${
                      isCurrentlySelected
                        ? 'border-sky-600 ring-2 ring-sky-600/10'
                        : 'border-slate-200 hover:border-sky-600'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-mono text-xs font-bold">
                            {cMeta.codigoCurso || 'CURSO'}
                          </span>
                          {cMeta.periodoAcademico && (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                              {cMeta.periodoAcademico}
                            </span>
                          )}
                          {isCurrentlySelected && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                              Curso Activo
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                          {cMeta.nombreCurso || 'Curso Académico'}
                        </h2>
                        {cMeta.programaAcademico && (
                          <div className="text-xs font-semibold text-slate-600">
                            {cMeta.programaAcademico}
                            {cMeta.institucionSede ? ` · ${cMeta.institucionSede}` : ''}
                          </div>
                        )}
                        <div className="text-xs text-slate-500">
                          Docente:{' '}
                          <span className="font-semibold text-slate-700">
                            {cMeta.docenteResponsable || config.nombreDocente || 'Docente Titular'}
                          </span>
                        </div>
                        {cMeta.descripcionGeneral && (
                          <p className="text-xs text-slate-500 line-clamp-2 pt-1">
                            {cMeta.descripcionGeneral}
                          </p>
                        )}
                      </div>

                      {/* Resumen Académico del Estudiante en este Curso */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-500 uppercase">
                            Módulos / Clases
                          </div>
                          <div className="text-sm font-bold text-slate-900 font-mono">
                            {modulesCount}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-500 uppercase">
                            Mis Evaluaciones
                          </div>
                          <div className="text-sm font-bold text-slate-900 font-mono">
                            {myCourseAttempts.length}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-500 uppercase">
                            Mis Insignias
                          </div>
                          <div className="text-sm font-bold text-slate-900 font-mono">
                            {myUnlockedBadgesCount}/{modulesCount}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <div className="text-[10px] font-bold text-slate-500 uppercase">
                            Mejor Nota
                          </div>
                          <div className="text-sm font-bold text-sky-700 font-mono">
                            {myBestGradeInCourse > 0 ? `${myBestGradeInCourse.toFixed(1)}/5.0` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        Carga lecciones, retos, exámenes y notas del curso
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLogoutCurrentStudent();
                          }}
                          className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          title="Cerrar sesión del estudiante rápidamente"
                        >
                          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                          <span>Cerrar sesión</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectStudentCourse(course);
                          }}
                          className="px-4 py-2 rounded-xl bg-sky-600 group-hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                        >
                          <span>Elegir curso</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODAL / HOJA DE CUENTA Y CREDENCIALES DEL ESTUDIANTE EN LA VENTANA INICIAL DE CURSOS DISPONIBLES */}
        {studentBottomSheet === 'perfil' && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" />
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Cuenta y Credenciales del Estudiante
                    </h3>
                    <p className="text-slate-500 font-mono">
                      Documento / ID: {currentStudent.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudentBottomSheet('none')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-800 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveStudentProfile} className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Nombre Completo:
                    </label>
                    <input
                      type="text"
                      required
                      value={profileNameInput}
                      onChange={(e) => setProfileNameInput(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Código de Acceso Personal:
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={12}
                      value={profileCodeInput}
                      onChange={(e) => setProfileCodeInput(e.target.value.toUpperCase())}
                      className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono uppercase text-slate-900 font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Correo Electrónico:
                      </label>
                      <input
                        type="email"
                        value={profileEmailInput}
                        onChange={(e) => setProfileEmailInput(e.target.value)}
                        placeholder="estudiante@correo.com"
                        className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        WhatsApp/Celular:
                      </label>
                      <input
                        type="tel"
                        value={profileWhatsappInput}
                        onChange={(e) => setProfileWhatsappInput(e.target.value)}
                        placeholder="Ej: 3001234567"
                        className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                      />
                    </div>
                  </div>
                  {profileSaveMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                      {profileSaveMsg}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        handleLogoutCurrentStudent();
                        onGoToInitialHome?.();
                      }}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Cerrar Sesión</span>
                    </button>

                    <button
                      type="submit"
                      className="min-h-[48px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer active:scale-95 transition-transform"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
        {globalSessionAtRiskModalNode}
        {teacherBlockedModalNode}
      </div>
    );
  }

  // ================= VIEW 2B: PANEL DEL ESTUDIANTE CON SESIÓN INICIADA (ACTIVA) — REORGANIZADO PARA WEB Y MÓVIL =================
  if (examPhase === 'modality_select' && currentStudent && currentStudentAcademicRecord) {
    const selectedModStats = getModalityAttemptStats(selectedModality);
    const selectedModConfig =
      activeModalityOptions.find((m) => m.id === selectedModality) || activeModalityOptions[0];

    // Summary counters for the Student Status Overview
    const modalitiesOverview = activeModalityOptions.map((m) => {
      const st = getModalityAttemptStats(m.id);
      return {
        ...m,
        stats: st,
        hasCompletedAttempt: st.count > 0
      };
    });
    const completedExamsCount = modalitiesOverview.filter((m) => m.hasCompletedAttempt).length;
    const pendingExamsCount = Math.max(0, modalitiesOverview.length - completedExamsCount);
    const effectiveCourseBadgesOverview = getEffectiveBadgesForCourse(config);
    const totalCourseModulesCount = Math.max(1, effectiveCourseBadgesOverview.length);
    const unlockedBadgesCount = effectiveCourseBadgesOverview.filter((b) => {
      return Boolean(currentStudent.progresoRetos?.[b.modulo]?.insigniaDesbloqueada);
    }).length;
    const pendingRetosCount = Math.max(0, totalCourseModulesCount - unlockedBadgesCount);
    const studentBestOverallGrade =
      studentAttempts.length > 0
        ? Math.max(...studentAttempts.map((a) => a.notaColombiana))
        : 0;
    const minPass = Number(config.notaMinimaAprobacion) || 3.0;

    const filteredModalityOptions = modalitiesOverview.filter((m) => {
      if (examFilterStatus === 'pending') return !m.hasCompletedAttempt || (!m.stats.isExhausted && m.stats.count < 2);
      if (examFilterStatus === 'completed') return m.hasCompletedAttempt;
      return true;
    });

    const studentAcademicSummaryForChart = computeStudentAcademicSummary(
      currentStudentAcademicRecord,
      currentStudent,
      studentAttempts,
      studentClassSessions
    );

    const moduleGradesBarData = studentClassSessions.map((cs) => {
      const cId = cs.id as ClassSessionId;
      const cRec = studentAcademicSummaryForChart.record.clases[cId];
      const finalModGrade = Number((studentAcademicSummaryForChart.classFinals[cId] ?? 0).toFixed(2));
      const examGrade = Number((cRec?.examen ?? 0).toFixed(2));
      const practRetoGrade = Number(
        Math.max(Number(cRec?.trabajoPractico || 0), Number(cRec?.participacion || 0)).toFixed(2)
      );
      const bestSignal = Number(Math.max(finalModGrade, examGrade, practRetoGrade).toFixed(2));
      return {
        classId: cId,
        modulo: cs.code || `M${cId}`,
        nombreModulo: cs.shortTitle || cs.fullTitle || `Módulo ${cId}`,
        notaModulo: finalModGrade > 0 ? finalModGrade : bestSignal,
        notaExamen: examGrade,
        notaPracticaReto: practRetoGrade,
        metaMinima: minPass
      };
    });

    const evaluatedModulesInChartCount = moduleGradesBarData.filter(
      (d) => d.notaModulo > 0 || d.notaExamen > 0 || d.notaPracticaReto > 0
    ).length;

    const studentMenuCards = [
      {
        id: 'inicio' as const,
        badge: 'Módulo 1 · Inicio',
        title: 'Escritorio y Rendimiento',
        subtitle: 'Resumen académico y gráfica por módulos',
        metric: `Prom: ${studentAcademicSummaryForChart.promedioAcumulado.toFixed(1)} / 5.0`,
        icon: LayoutGrid,
        accentBg: 'bg-sky-50 text-sky-700 border-sky-200',
        activeRing: 'ring-sky-500/40',
        onClick: handleGoHomeStudentPanel,
        isActive: studentDashboardTab === 'inicio'
      },
      {
        id: 'material_modulos' as const,
        badge: 'Módulo 2 · Estudio',
        title: 'Lecciones y Material',
        subtitle: 'Guías de lectura y recursos descargables',
        metric: `${activeCourseMeta.cantidadModulos} Módulos`,
        icon: BookOpen,
        accentBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        activeRing: 'ring-emerald-500/40',
        onClick: () => setStudentDashboardTab('material_modulos'),
        isActive: studentDashboardTab === 'material_modulos'
      },
      {
        id: 'mini_retos' as const,
        badge: 'Módulo 3 · Práctica',
        title: 'Mini Retos e Insignias',
        subtitle: 'Entrenamiento gamificado por módulo',
        metric: `${unlockedBadgesCount}/${totalCourseModulesCount} Insignias`,
        icon: Trophy,
        accentBg: 'bg-amber-50 text-amber-700 border-amber-200',
        activeRing: 'ring-amber-500/40',
        onClick: () => setStudentDashboardTab('mini_retos'),
        isActive: studentDashboardTab === 'mini_retos'
      },
      {
        id: 'modalidades' as const,
        badge: 'Módulo 4 · Evaluación',
        title: 'Exámenes Oficiales',
        subtitle: 'Presentar evaluaciones y certificados',
        metric: `${completedExamsCount}/${modalitiesOverview.length} Exámenes`,
        icon: GraduationCap,
        accentBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        activeRing: 'ring-indigo-500/40',
        onClick: () => setStudentDashboardTab('modalidades'),
        isActive:
          studentDashboardTab === 'modalidades' ||
          studentDashboardTab === 'mis_notas' ||
          studentDashboardTab === 'diagnostico_pedagogico'
      },
      {
        id: 'notas_asistencia_clases' as const,
        badge: 'Módulo 5 · Boletín',
        title: 'Expediente y Asistencia',
        subtitle: 'Sábana C1–C6, simulador y reporte PDF',
        metric: `${studentAcademicSummaryForChart.porcentajeAsistencia}% Asist.`,
        icon: BarChart3,
        accentBg: 'bg-violet-50 text-violet-700 border-violet-200',
        activeRing: 'ring-violet-500/40',
        onClick: () => setStudentDashboardTab('notas_asistencia_clases'),
        isActive: studentDashboardTab === 'notas_asistencia_clases'
      }
    ];

    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 pb-24 lg:pb-10 space-y-4">
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

        {/* BARRA SUPERIOR DE ESTADO Y ACCIONES DE SESIÓN (DESPEJADA Y ORGANIZADA) */}
        <header className="bg-white border border-slate-200 rounded-2xl p-4 sm:px-6 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 shadow-2xs">
          {/* Zona 1: Marca / Curso Activo */}
          <div className="flex items-center gap-3 min-w-0">
            {studentDashboardTab !== 'inicio' && (
              <button
                type="button"
                onClick={handleGoHomeStudentPanel}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform shrink-0"
                title="Volver al Escritorio Principal"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Inicio</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <button
              type="button"
              onClick={handleGoHomeStudentPanel}
              className="text-left min-w-0 cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 font-mono text-[10px] font-bold text-sky-800 uppercase">
                  {activeCourseMeta.codigoCurso || 'CURSO'}
                </span>
                <span className="text-[11px] font-medium text-slate-500 truncate">
                  Docente: {activeCourseMeta.docenteResponsable || config.nombreDocente || 'Docente Titular'}
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate">
                {activeCourseMeta.nombreCurso || 'Portal del Estudiante'}
              </div>
            </button>
          </div>

          {/* Zona 2: Acciones de Sesión Organizadas en Tarjetas de Acción Rápida */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCourseSearchQuery('');
                setIsCourseSelectionWindowOpen(true);
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-sky-200 bg-sky-50/80 hover:bg-sky-100 text-sky-900 text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0"
              title="Ver mis cursos asignados y cambiar de curso"
            >
              <BookOpen className="w-4 h-4 text-sky-700 shrink-0" />
              <span>Cambiar curso</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white border border-sky-200 text-[10px] font-mono font-bold text-sky-800">
                {assignedStudentCourses.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowStudentScheduleAgenda((prev) => !prev)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0 ${
                showStudentScheduleAgenda
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900'
              }`}
              title="Ver cronograma de fechas de apertura/cierre del curso, horarios de exámenes, trabajos, mini retos y prórrogas"
            >
              <span>📅 Mi Agenda y Horarios</span>
            </button>
            <button
              type="button"
              onClick={handleOpenStudentCredentialsSheet}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0 shadow-2xs"
              title="Cuenta y Credenciales del Estudiante"
            >
              <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Cuenta Estudiante</span>
            </button>
            <button
              type="button"
              onClick={handleLogoutCurrentStudent}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all whitespace-nowrap shrink-0"
              title="Cerrar sesión rápidamente"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>

        {/* R1, R5 y R6: SEMÁFORO EN TIEMPO REAL DE VIGENCIA DEL CURSO, ACTIVIDADES Y AGENDA ACADÉMICA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:px-5 sm:py-3.5 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <span>🚦 Ventanas de Apertura y Cierre en Vivo:</span>
              </span>
              {(
                [
                  'CURSO_GENERAL',
                  'EXAMENES',
                  'TRABAJOS_TALLERES',
                  'MINI_RETOS',
                  'PARTICIPACION_ASISTENCIA'
                ] as AcademicActivityKey[]
              ).map((actKey) => {
                const st = liveActivityWindows[actKey];
                const badgeStyle =
                  st.status === 'OPEN'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : st.status === 'LATE_GRACE'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : st.status === 'EXTENSION_ACTIVE'
                    ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
                    : st.status === 'UPCOMING'
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900';
                return (
                  <button
                    key={actKey}
                    type="button"
                    onClick={() => setShowStudentScheduleAgenda((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition hover:opacity-90 ${badgeStyle}`}
                    title={`${st.label}: ${st.reasonDetail}`}
                  >
                    <span>{st.icon}</span>
                    <span className="font-extrabold">
                      {actKey === 'CURSO_GENERAL'
                        ? 'Curso'
                        : actKey === 'EXAMENES'
                        ? 'Exámenes'
                        : actKey === 'TRABAJOS_TALLERES'
                        ? 'Trabajos'
                        : actKey === 'MINI_RETOS'
                        ? 'Mini Retos'
                        : 'Participación'}
                      :
                    </span>
                    <span>{st.shortStatusLabel}</span>
                    <span className="font-mono text-[10px] opacity-80">
                      ({st.countdownText})
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowStudentScheduleAgenda((prev) => !prev)}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 self-start lg:self-center cursor-pointer whitespace-nowrap"
            >
              {showStudentScheduleAgenda
                ? 'Ocultar cronograma detallado ▲'
                : 'Ver fechas y horarios detallados ▼'}
            </button>
          </div>

          {/* Alerta si el Curso General está Cerrado o en Modo Consulta Solo Lectura (R1) */}
          {!liveActivityWindows.CURSO_GENERAL.isAccessible && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-extrabold">
                  {liveActivityWindows.CURSO_GENERAL.badgeText}:
                </span>{' '}
                <span>{liveActivityWindows.CURSO_GENERAL.reasonDetail}</span>
                {liveActivityWindows.CURSO_GENERAL.isReadOnlyConsultation && (
                  <span className="ml-1 font-bold text-indigo-900">
                    · Modo Consulta (Solo Lectura) habilitado para revisar tus calificaciones y certificados.
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded bg-white border border-amber-300 shrink-0">
                Vigencia: {liveActivityWindows.CURSO_GENERAL.openDate} →{' '}
                {liveActivityWindows.CURSO_GENERAL.closeDate}
              </span>
            </div>
          )}

          {/* R6: Agenda Académica Visual Desplegable del Estudiante */}
          {showStudentScheduleAgenda && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    📅 Cronograma Oficial de Fechas, Días y Rango de Horas del Curso
                  </h3>
                  <p className="text-xs text-slate-600">
                    Consulta las ventanas habilitadas para Exámenes, Trabajos/Talleres, Mini Retos y Participación, así como las reglas de entrega tardía o prórrogas individuales.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-mono text-[11px] font-bold">
                  Hora actual verificada:{' '}
                  {new Date(rollCallNowMs).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                {(
                  [
                    'CURSO_GENERAL',
                    'EXAMENES',
                    'TRABAJOS_TALLERES',
                    'MINI_RETOS',
                    'PARTICIPACION_ASISTENCIA'
                  ] as AcademicActivityKey[]
                ).map((actKey) => {
                  const st = liveActivityWindows[actKey];
                  const winCfg = effectiveCourseSchedule.activityWindows[actKey];
                  const cardBorder =
                    st.status === 'OPEN'
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : st.status === 'LATE_GRACE'
                      ? 'border-amber-300 bg-amber-50/40'
                      : st.status === 'EXTENSION_ACTIVE'
                      ? 'border-cyan-300 bg-cyan-50/40'
                      : st.status === 'UPCOMING'
                      ? 'border-yellow-300 bg-yellow-50/40'
                      : 'border-rose-300 bg-rose-50/40';

                  return (
                    <div
                      key={actKey}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 text-xs ${cardBorder}`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-base">{st.icon}</span>
                          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] font-extrabold text-slate-900">
                            {st.shortStatusLabel}
                          </span>
                        </div>
                        <div className="font-extrabold text-slate-900 leading-snug">
                          {st.label}
                        </div>
                        <div className="text-[11px] font-semibold text-indigo-900">
                          {st.badgeText}
                        </div>
                        <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-200/70">
                          <div>
                            <strong>Apertura:</strong>{' '}
                            <span className="font-mono">{st.openDate}</span>
                          </div>
                          <div>
                            <strong>Cierre:</strong>{' '}
                            <span className="font-mono">{st.closeDate}</span>
                          </div>
                          <div>
                            <strong>Días:</strong> {st.allowedDaysLabel}
                          </div>
                          <div>
                            <strong>Horario:</strong>{' '}
                            <span className="font-mono">{st.hoursRangeLabel}</span>
                          </div>
                          {winCfg?.allowLateSubmission && (
                            <div className="text-amber-900 font-medium">
                              <strong>Prórroga tardía:</strong> +{winCfg.lateGraceHours}h (-
                              {winCfg.latePenaltyPercent}%, máx {winCfg.maxGradeOnLate.toFixed(1)})
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-600 bg-white/80 rounded-lg p-2 border border-slate-200/80">
                        {st.reasonDetail}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MENÚ PRINCIPAL DEL ESTUDIANTE EN TARJETAS INTERACTIVAS (FÁCIL IDENTIFICACIÓN Y SIN AMONTONAMIENTO) */}
        <nav aria-label="Menú principal del estudiante" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {studentMenuCards.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  item.isActive
                    ? `bg-slate-900 text-white border-slate-900 shadow-md ring-2 ${item.activeRing}`
                    : 'bg-white hover:border-sky-300 text-slate-900 border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                      item.isActive
                        ? 'bg-white/15 text-sky-300 border-white/20'
                        : item.accentBg
                    }`}
                  >
                    <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.badge}</span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 shrink-0 ${
                      item.isActive ? 'text-sky-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold leading-snug">
                    {item.title}
                  </div>
                  <p
                    className={`text-[11px] mt-0.5 leading-snug ${
                      item.isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.subtitle}
                  </p>
                </div>
                <div
                  className={`text-[10px] font-mono font-bold pt-2 border-t flex items-center justify-between ${
                    item.isActive
                      ? 'border-slate-700 text-sky-300'
                      : 'border-slate-100 text-slate-700'
                  }`}
                >
                  <span>{item.metric}</span>
                  <span>{item.isActive ? '● Activo' : 'Abrir →'}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {rollCallFeedbackBanner && (
          <div className="bg-emerald-600 text-white rounded-2xl p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold">
            <span>{rollCallFeedbackBanner}</span>
            <button
              type="button"
              onClick={() => setRollCallFeedbackBanner(null)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-emerald-100 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* CENTRO DE ALERTAS FLOTANTE Y SONORO: LLAMADO VIRTUAL DE ASISTENCIA DEL DOCENTE */}
        {activeRollCallClasses.length > 0 && (
          <div className="bg-amber-50 border border-amber-400 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
              <div className="text-xs font-extrabold text-amber-950">
                Llamado de Asistencia en Curso ({activeRollCallClasses.length} sesión activa)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playRollCallChime()}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-bold cursor-pointer hover:bg-amber-100 active:scale-95 transition-transform whitespace-nowrap"
                >
                  Probar Timbre
                </button>
                <button
                  type="button"
                  onClick={() => setRollCallSoundEnabled((prev) => !prev)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap ${
                    rollCallSoundEnabled
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{rollCallSoundEnabled ? 'Sonido Activo' : 'Silenciado'}</span>
                </button>
              </div>
            </div>
            {activeRollCallClasses.map((cId) => {
              const csInfo = (studentClassSessions || []).find((s) => s.id === cId);
              const cRec = currentStudentAcademicRecord.clases[cId];
              const bloqueLabel =
                cRec?.llamadoVirtualBloque === 'ambos' ||
                (cRec?.asistenciaB1Estado === 'llamando' && cRec?.asistenciaB2Estado === 'llamando')
                  ? 'Bloques A y B'
                  : cRec?.llamadoVirtualBloque === 2 || cRec?.asistenciaB2Estado === 'llamando'
                  ? 'Bloque B'
                  : 'Bloque A';
              const expMs = cRec?.llamadoVirtualExpiraAtIso
                ? new Date(cRec.llamadoVirtualExpiraAtIso).getTime()
                : 0;
              const remSec =
                expMs > rollCallNowMs ? Math.max(0, Math.floor((expMs - rollCallNowMs) / 1000)) : null;
              const remFormatted =
                remSec !== null
                  ? `${String(Math.floor(remSec / 60)).padStart(2, '0')}:${String(remSec % 60).padStart(2, '0')}`
                  : 'Activo';
              const metodo = cRec?.llamadoVirtualMetodo || 'alerta_boton_panel';

              return (
                <div
                  key={cId}
                  className="bg-white border border-amber-300 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-xs font-mono text-amber-900">
                      <span>{csInfo?.code || `Clase C${cId}`}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{bloqueLabel}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-bold text-red-700 tabular-nums">
                        Tiempo restante: {remFormatted}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900">
                      Confirmación de Asistencia Requerida — {csInfo?.shortTitle || `Clase ${cId}`}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Pulse el botón para registrar su asistencia inmediatamente en la consola del docente.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                    {(metodo === 'codigo_unico_correo_whatsapp' ||
                      metodo === 'palabra_clave_secreta') && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={rollCallCodeInputByClass[cId] || ''}
                          onChange={(e) =>
                            setRollCallCodeInputByClass((prev) => ({
                              ...prev,
                              [cId]: e.target.value.toUpperCase()
                            }))
                          }
                          placeholder="Código PIN"
                          className="w-32 min-h-[48px] px-3 py-2.5 rounded-xl border border-indigo-300 font-mono text-xs font-bold uppercase text-slate-900 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleStudentRespondRollCall(cId, rollCallCodeInputByClass[cId] || '')
                          }
                          className="min-h-[48px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
                        >
                          Validar PIN
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStudentRespondRollCall(cId)}
                      className="min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer active:scale-95 transition-transform flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <span>Confirmar Presente ({csInfo?.code || `C${cId}`})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= CONTENEDOR PRINCIPAL DEL PANEL DEL ESTUDIANTE ================= */}
        <div className="w-full space-y-6">
          {studentDashboardTab === 'inicio' && (() => {
            const activeStepSession =
              studentClassSessions.find((s) => s.id === selectedStepperClassId) ||
              studentClassSessions[0];
            const stepId = (activeStepSession?.id || 1) as ClassSessionId;
            const stepRec = currentStudentAcademicRecord.clases[stepId];
            const stepExamMod: ExamModality =
              stepId <= 5 ? (`mod${stepId}` as ExamModality) : 'integral';
            const stepDocs = activeStepSession?.documentosEnlaces || [];
            const totalDocsCount = studentClassSessions.reduce(
              (acc, s) => acc + (s.documentosEnlaces?.length || 0),
              0
            );
            const studentTickets = Array.isArray(currentStudent.solicitudesRevision)
              ? currentStudent.solicitudesRevision
              : [];

            return (
              <div className="space-y-6">
                {/* 1. TARJETA HERO DE BIENVENIDA Y RESUMEN DEL CURSO SELECCIONADO */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 border border-slate-800">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-3 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-mono font-bold border border-sky-400/30">
                          {activeCourseMeta.codigoCurso || 'CURSO'}
                        </span>
                        {activeCourseMeta.periodoAcademico && (
                          <span className="px-3 py-1 rounded-lg bg-white/10 text-slate-200 font-semibold border border-white/10">
                            Periodo {activeCourseMeta.periodoAcademico}
                          </span>
                        )}
                        <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
                          Curso Activo
                        </span>
                      </div>

                      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                        {activeCourseMeta.nombreCurso || 'Curso Académico'}
                      </h1>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                        <span>
                          Docente: <strong className="text-white">{activeCourseMeta.docenteResponsable || config.nombreDocente || 'Docente Titular'}</strong>
                        </span>
                        {activeCourseMeta.programaAcademico && (
                          <>
                            <span aria-hidden="true" className="text-slate-500">·</span>
                            <span>{activeCourseMeta.programaAcademico}</span>
                          </>
                        )}
                        {activeCourseMeta.institucionSede && (
                          <>
                            <span aria-hidden="true" className="text-slate-500">·</span>
                            <span>{activeCourseMeta.institucionSede}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Botón para cambiar de curso */}
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCourseSearchQuery('');
                          setIsCourseSelectionWindowOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                        title="Volver al listado de cursos asignados"
                      >
                        <BookOpen className="w-4 h-4 text-sky-300" />
                        <span>Mis Cursos ({assignedStudentCourses.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Métricas Clave del Estudiante en este Curso */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="text-[11px] font-semibold text-sky-300 uppercase tracking-wide">
                        Promedio Ponderado
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums mt-0.5">
                        {studentAcademicSummaryForChart.promedioAcumulado.toFixed(1)} <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Meta mínima: {minPass.toFixed(1)}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wide">
                        Exámenes Oficiales
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums mt-0.5">
                        {completedExamsCount} <span className="text-xs text-slate-400 font-normal">/ {modalitiesOverview.length}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Mejor nota: {studentBestOverallGrade > 0 ? `${studentBestOverallGrade.toFixed(1)}/5.0` : '—'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wide">
                        Mini Retos e Insignias
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums mt-0.5">
                        {unlockedBadgesCount} <span className="text-xs text-slate-400 font-normal">/ {totalCourseModulesCount}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Insignias desbloqueadas
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                      <div className="text-[11px] font-semibold text-violet-300 uppercase tracking-wide">
                        Asistencia a Clases
                      </div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums mt-0.5">
                        {studentAcademicSummaryForChart.porcentajeAsistencia}%
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Sábana C1 a C6
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. HUB DE TARJETAS INTERACTIVAS ORGANIZADAS */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                        Tarjetas Interactivas del Curso
                      </h2>
                      <p className="text-xs text-slate-500">
                        Acceda a los recursos de estudio, evaluaciones oficiales, retos de práctica, expediente académico y entregas.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {/* TARJETA INTERACTIVA 1: RECURSOS DEL CURSO (LECCIONES Y MATERIAL) */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-emerald-100 hover:border-emerald-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <BookOpen className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                            {activeCourseMeta.cantidadModulos} Módulos de Estudio
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                            Recursos del Curso (Lecciones y Material)
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Guías temáticas de lectura, diapositivas oficiales, normativas y recursos descargables en formato PDF de cada módulo o clase.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Material disponible:</span>
                            <strong className="text-slate-900 font-mono">
                              {totalDocsCount} recurso(s)
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Modo de estudio:</span>
                            <span className="font-semibold text-emerald-700">Lectura lineal y descargas</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setStudentDashboardTab('material_modulos')}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                      >
                        <span>Abrir Lecciones y Descargas</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* TARJETA INTERACTIVA 2: EXÁMENES / EVALUACIONES */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-sky-100 hover:border-sky-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                            <GraduationCap className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-bold">
                            {completedExamsCount}/{modalitiesOverview.length} Realizados
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                            Exámenes y Evaluaciones
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Evaluaciones oficiales por módulo y Examen Integral final. Sistema con 2 intentos, preguntas aleatorias equilibradas y nota Math.max.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Mejor calificación:</span>
                            <strong className="text-sky-700 font-mono">
                              {studentBestOverallGrade > 0 ? `${studentBestOverallGrade.toFixed(1)} / 5.0` : 'Sin presentar'}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Intentos permitidos:</span>
                            <span className="font-semibold text-slate-700">2 intentos oficiales</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setStudentDashboardTab('modalidades')}
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                        >
                          <span>Ir a Exámenes Oficiales</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setZeroTrialModalOpen(true)}
                          className="w-full min-h-[36px] py-1.5 px-3 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <PlayCircle className="w-3.5 h-3.5 text-sky-700" />
                          <span>Ensayo Modo Cero (Sin Afectar Nota)</span>
                        </button>
                      </div>
                    </div>

                    {/* TARJETA INTERACTIVA 3: MINI RETOS E INSIGNIAS */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-amber-100 hover:border-amber-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                            <Trophy className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                            {unlockedBadgesCount}/{totalCourseModulesCount} Insignias
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                            Mini Retos e Insignias
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Entrenamiento interactivo con preguntas contrarreloj, retroalimentación formativa inmediata, rachas de aciertos y medallas coleccionables.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Insignias desbloqueadas:</span>
                            <strong className="text-amber-700 font-mono">
                              {unlockedBadgesCount} de {totalCourseModulesCount}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Retos por módulo:</span>
                            <span className="font-semibold text-slate-700">Gamificación activa</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setStudentDashboardTab('mini_retos')}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Trophy className="w-4 h-4 shrink-0" />
                        <span>Jugar Mini Retos Ahora</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* TARJETA INTERACTIVA 4: PROGRESO ACADÉMICO Y EXPEDIENTE */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-indigo-100 hover:border-indigo-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                            <BarChart3 className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                            {studentAcademicSummaryForChart.porcentajeAsistencia}% Asistencia
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                            Progreso Académico y Expediente
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Sábana consolidada de notas C1–C6, registro de asistencia a clases por bloques A/B, simulador interactivo y descarga de boletín en PDF.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Promedio general:</span>
                            <strong className="text-indigo-700 font-mono">
                              {studentAcademicSummaryForChart.promedioAcumulado.toFixed(1)} / 5.0
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Sábana de clases:</span>
                            <span className="font-semibold text-slate-700">Sesiones C1 a C6</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setStudentDashboardTab('notas_asistencia_clases')}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                      >
                        <span>Ver Expediente y Asistencia</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* TARJETA INTERACTIVA 5: TALLERES Y ENTREGAS PRÁCTICAS */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-cyan-100 hover:border-cyan-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
                            <FileCheck2 className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-800 text-[11px] font-bold">
                            Taller Clase {activeStepSession?.code || 'C1'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                            Talleres y Entregas Prácticas
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Radique sus trabajos prácticos, evidencias de taller o enlaces de repositorios (Drive, GitHub, Canva) para revisión y calificación docente.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Estado en {activeStepSession?.code || 'C1'}:</span>
                            <strong className="text-cyan-800 font-semibold">
                              {stepRec?.trabajoCalificado
                                ? `${stepRec.trabajoPractico.toFixed(1)} / 5.0`
                                : stepRec?.trabajoEstado === 'pendiente_revision'
                                ? 'En revisión'
                                : 'Sin entregar'}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Modalidad de entrega:</span>
                            <span className="font-semibold text-slate-700">Resumen y enlace web</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSheetClassId(stepId);
                          setSheetWorkText(stepRec?.trabajoEntregaTexto || '');
                          setSheetWorkLink(stepRec?.trabajoEntregaEnlace || '');
                          setSheetNotice(null);
                          setStudentBottomSheet('entregar_trabajo');
                        }}
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                      >
                        <FileCheck2 className="w-4 h-4 shrink-0" />
                        <span>Entregar Taller Práctico</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* TARJETA INTERACTIVA 6: REVISIÓN DE NOTAS Y EXCUSAS (TICKETS) */}
                    <div className="bg-white rounded-2xl p-6 border-2 border-rose-100 hover:border-rose-500 transition-all flex flex-col justify-between gap-5 shadow-xs hover:shadow-md group">
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                            {studentTickets.length} Radicado(s)
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-rose-700 transition-colors">
                            Revisión de Notas y Excusas
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Radique solicitudes formales de recalificación de exámenes, aclaración de preguntas o justificación médica de inasistencias con trazabilidad docente.
                          </p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1 text-slate-600">
                          <div className="flex items-center justify-between">
                            <span>Historial de tickets:</span>
                            <strong className="text-rose-800 font-mono">
                              {studentTickets.length} solicitud(es)
                            </strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Respuesta docente:</span>
                            <span className="font-semibold text-slate-700">Trazabilidad oficial</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openFormalReviewTicketModal({
                            tipo: 'RECALIFICACION_EXAMEN',
                            targetId: 'integral',
                            targetLabel: 'Examen Integral Final',
                            notaActual: 0.0
                          })
                        }
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Radicar Ticket o Excusa</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. RESUMEN DE RENDIMIENTO ACADÉMICO CON RECHARTS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                    <div className="space-y-0.5">
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700 uppercase tracking-wider">
                        <BarChart3 className="w-4 h-4" />
                        <span>Analítica Visual · Curso Actual</span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900">
                        Resumen de Rendimiento Académico por Módulos
                      </h2>
                      <p className="text-xs text-slate-500">
                        Calificaciones obtenidas en los diferentes módulos de{' '}
                        <strong className="text-slate-700">{activeCourseMeta.nombreCurso}</strong>{' '}
                        (escala 0.0 a 5.0).
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
                      <div className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900">
                        <span className="block text-[10px] font-sans font-semibold text-sky-700 uppercase">
                          Promedio Curso
                        </span>
                        <strong className="text-sm">
                          {studentAcademicSummaryForChart.promedioAcumulado.toFixed(1)} / 5.0
                        </strong>
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                        <span className="block text-[10px] font-sans font-semibold text-emerald-700 uppercase">
                          Módulos con Nota
                        </span>
                        <strong className="text-sm">
                          {evaluatedModulesInChartCount} / {moduleGradesBarData.length}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={moduleGradesBarData}
                        margin={{ top: 10, right: 16, left: -12, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="modulo"
                          tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                        />
                        <YAxis
                          domain={[0, 5]}
                          ticks={[0, 1, 2, 3, 4, 5]}
                          tick={{ fontSize: 11, fill: '#475569' }}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [
                            `${Number(value || 0).toFixed(2)} / 5.0`,
                            name
                          ]}
                          labelFormatter={(label, payload) => {
                            const item = payload?.[0]?.payload;
                            return item
                              ? `${item.modulo} — ${item.nombreModulo}`
                              : `Módulo ${label}`;
                          }}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            borderColor: '#cbd5e1',
                            borderRadius: '12px',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                        <ReferenceLine
                          y={minPass}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{
                            value: `Mín. ${minPass.toFixed(1)}`,
                            position: 'insideTopRight',
                            fill: '#dc2626',
                            fontSize: 10
                          }}
                        />
                        <Bar
                          dataKey="notaModulo"
                          name="Nota del Módulo"
                          fill="#0284c7"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={34}
                        />
                        <Bar
                          dataKey="notaExamen"
                          name="Examen del Módulo"
                          fill="#4f46e5"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        />
                        <Bar
                          dataKey="notaPracticaReto"
                          name="Trabajo / Mini Reto"
                          fill="#10b981"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Selector rápido por módulo debajo de la gráfica */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                    {moduleGradesBarData.map((mItem) => {
                      const isSelectedMod = selectedStepperClassId === mItem.classId;
                      const isPassing = mItem.notaModulo >= minPass;
                      return (
                        <button
                          key={mItem.classId}
                          type="button"
                          onClick={() => setSelectedStepperClassId(mItem.classId)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelectedMod
                              ? 'bg-sky-50 border-sky-400 ring-1 ring-sky-400/30'
                              : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-bold text-slate-900">
                              {mItem.modulo}
                            </span>
                            <span
                              className={`font-mono text-[11px] font-extrabold ${
                                mItem.notaModulo === 0
                                  ? 'text-slate-400'
                                  : isPassing
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {mItem.notaModulo > 0 ? mItem.notaModulo.toFixed(1) : '—'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {mItem.nombreModulo}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. MÓDULO ACTIVO EN CURSO Y ACCIONES DIRECTAS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="text-xs text-slate-500 font-mono">
                      <span>Módulo Activo Seleccionado</span>
                      <span aria-hidden="true"> · </span>
                      <span>{activeStepSession?.code || 'C1'}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{stepDocs.length} recurso(s) de lectura</span>
                    </div>
                    {/* Selector de módulo */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {studentClassSessions.map((cs) => {
                        const cId = cs.id as ClassSessionId;
                        const active = selectedStepperClassId === cId;
                        return (
                          <button
                            key={cId}
                            type="button"
                            onClick={() => setSelectedStepperClassId(cId)}
                            className={`min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-xl font-mono text-xs font-bold cursor-pointer active:scale-95 transition-transform ${
                              active
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {cs.code}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      {activeStepSession?.fullTitle || 'Módulo en Curso'}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Asistencia registrada:{' '}
                      <strong>
                        {stepRec?.asistenciaB1Estado === 'presente_virtual' ||
                        stepRec?.asistenciaB1Estado === 'presente_manual'
                          ? 'Presente (Bloque A)'
                          : stepRec?.asistenciaB1Estado === 'falla'
                          ? 'Falla registrada'
                          : 'Sin registrar'}
                      </strong>{' '}
                      · Taller práctico:{' '}
                      <strong>
                        {stepRec?.trabajoCalificado
                          ? `${stepRec.trabajoPractico.toFixed(1)} / 5.0`
                          : stepRec?.trabajoEstado === 'pendiente_revision'
                          ? 'En revisión docente'
                          : 'Sin entregar'}
                      </strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setStudentDashboardTab('material_modulos')}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-900 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold truncate">Lección {activeStepSession?.code}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (stepId <= 5) {
                          setSelectedRetoModuloJump(stepId as 1 | 2 | 3 | 4 | 5);
                        }
                        setStudentDashboardTab('mini_retos');
                      }}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-900 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                        <span className="text-xs font-bold truncate">Reto {activeStepSession?.code}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModality(stepExamMod);
                        setStudentDashboardTab('modalidades');
                      }}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-slate-900 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <GraduationCap className="w-4 h-4 text-sky-600 shrink-0" />
                        <span className="text-xs font-bold truncate">Examen {activeStepSession?.code}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSheetClassId(stepId);
                        setSheetWorkText(stepRec?.trabajoEntregaTexto || '');
                        setSheetWorkLink(stepRec?.trabajoEntregaEnlace || '');
                        setSheetNotice(null);
                        setStudentBottomSheet('entregar_trabajo');
                      }}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-cyan-50 hover:border-cyan-300 text-slate-900 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileCheck2 className="w-4 h-4 text-cyan-600 shrink-0" />
                        <span className="text-xs font-bold truncate">Entregar Taller</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* ================= SUB-VISTA: MODIFICAR MIS DATOS ================= */}
        {studentDashboardTab === 'modificar_datos' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-xs max-w-xl mx-auto space-y-5">
            <div className="border-b border-slate-100 pb-4 space-y-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-700">
                Perfil Personal del Estudiante
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Modificar Mis Datos
              </h2>
              <p className="text-xs text-slate-600">
                Actualice su Nombre Completo y su Código de Acceso de Sesión. El número de documento (ID) es de solo lectura por seguridad institucional.
              </p>
            </div>

            <form onSubmit={handleSaveStudentProfile} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  ID de Estudiante (Documento — Solo Lectura)
                </label>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={currentStudent.id}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  Nombre Completo del Estudiante
                </label>
                <input
                  type="text"
                  required
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  Código de Acceso de Sesión
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={profileCodeInput}
                  onChange={(e) => setProfileCodeInput(e.target.value.toUpperCase())}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={profileEmailInput}
                    onChange={(e) => setProfileEmailInput(e.target.value)}
                    placeholder="estudiante@correo.com"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    WhatsApp/Celular
                  </label>
                  <input
                    type="tel"
                    value={profileWhatsappInput}
                    onChange={(e) => setProfileWhatsappInput(e.target.value)}
                    placeholder="Ej: 3001234567"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>

              {profileSaveMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold text-xs">
                  {profileSaveMsg}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleGoHomeStudentPanel}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer shadow-2xs"
                >
                  Guardar Mis Datos
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= SUB-VISTA: MATERIAL DE CADA MÓDULO / CLASE ================= */}
        {studentDashboardTab === 'material_modulos' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-700">
                  Material de Estudio Oficial · {activeCourseMeta.nombreCurso}
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Material de cada módulo/clase ({activeCourseMeta.cantidadModulos} Módulos)
                </h2>
                <p className="text-xs text-slate-600">
                  Acceda y descargue los documentos de estudio de cada módulo y consulte la distribución porcentual de calificación.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {activeCourseMeta.modulosCurso.map((mod) => {
                const w = mod.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS;
                const docs =
                  Array.isArray(mod.documentosEnlaces) && mod.documentosEnlaces.length > 0
                    ? mod.documentosEnlaces
                    : parseRawDocumentLinksToStructured(
                        mod.enlacesTextoRaw || '',
                        mod.id,
                        mod.shortTitle
                      );
                return (
                  <div
                    key={mod.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-sky-800">
                          Módulo {mod.id} ({mod.code})
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-600">
                          {mod.examenesCount ?? 1} Ex. · {mod.retosCount ?? 2} Retos
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm leading-snug">
                        {mod.shortTitle}
                      </h4>
                      <div className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                        Ponderación: Comp. <strong>{w.comportamientoPct}%</strong> · Sustent.{' '}
                        <strong>{w.participacionPct}%</strong> · Examen{' '}
                        <strong>{w.examenPct}%</strong> · Trabajo{' '}
                        <strong>{w.trabajoPct}%</strong>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-200/80">
                      {docs.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-bold uppercase text-sky-900">
                            📎 Documentos para Descargar ({docs.length}):
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {docs.map((doc) => (
                              <a
                                key={doc.id}
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="min-h-[40px] px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-between gap-2 transition-colors"
                              >
                                <span className="truncate">{doc.titulo}</span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono shrink-0">
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Descargar</span>
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 italic">
                          Sin documentos adjuntos en este módulo por el momento.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= SUB-VISTA: MI VITRINA DE EXÁMENES (EXÁMENES, CERTIFICADOS Y DIAGNÓSTICO) ================= */}
        {(studentDashboardTab === 'modalidades' ||
          studentDashboardTab === 'mis_notas' ||
          studentDashboardTab === 'diagnostico_pedagogico') && (
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStudentDashboardTab('modalidades')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  studentDashboardTab === 'modalidades'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Exámenes ({completedExamsCount}/{modalitiesOverview.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStudentDashboardTab('mis_notas')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  studentDashboardTab === 'mis_notas'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Mis Certificados y Entregas ({studentAttempts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStudentDashboardTab('diagnostico_pedagogico')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  studentDashboardTab === 'diagnostico_pedagogico'
                    ? 'bg-indigo-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Diagnóstico por Módulos</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setZeroTrialModalOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5 text-emerald-700" />
              <span>Prueba Cero (Ensayo Gratis)</span>
            </button>
          </div>
        )}

        {/* ================= VENTANA 1: EXÁMENES DISPONIBLES Y ESTADO DE CADA EVALUACIÓN ================= */}
        {studentDashboardTab === 'modalidades' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
            {(!config.examenAbierto ||
              (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id)) && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-900 text-sm">
                      Estado Maestro del Examen: CERRADO temporalmente por el Docente
                    </div>
                    <p>
                      {config.mensajeSalaEspera ||
                        'El docente ha pausado temporalmente el inicio de exámenes. Mientras tanto, puede presentar Mini Retos o revisar sus Notas.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStudentDashboardTab('mini_retos')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                >
                  🏅 Ir a Mini Retos Disponibles →
                </button>
              </div>
            )}

            {/* Encabezado y Filtros Claros de Estado de Exámenes */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-700">
                  Ventana 1 · Evaluaciones Oficiales
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Seleccione el Examen que Desea Presentar o Consultar
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Dispone de <strong>2 intentos por examen</strong> (el Intento #2 carga preguntas 100% nuevas). Se conserva su nota más alta (<code>Math.max</code>).
                </p>
              </div>

              {/* Botones de Filtro Rápido de Estado (Adaptados a Móvil y Web) */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setExamFilterStatus('all')}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    examFilterStatus === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Todos ({modalitiesOverview.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExamFilterStatus('pending')}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    examFilterStatus === 'pending'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Disponibles
                </button>
                <button
                  type="button"
                  onClick={() => setExamFilterStatus('completed')}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    examFilterStatus === 'completed'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Realizados ({completedExamsCount})
                </button>
              </div>
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
                      Evaluación completada: <strong>{thirdAttemptBlockedModal.modalidadLabel}</strong>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                  <span className="text-amber-900 font-medium">
                    Esta evaluación ya cumplió sus 2 intentos oficiales. Seleccione otro examen disponible:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setThirdAttemptBlockedModal(null)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-amber-400 bg-white hover:bg-amber-100 text-amber-950 font-bold text-xs cursor-pointer"
                    >
                      Cerrar Aviso
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReturnToMainStudentPanel(selectedModality)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Seleccionar Otro Examen Disponible</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tarjetas de Exámenes Reorganizadas con Estado Claro y Botones Grandes para Móvil y Web */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredModalityOptions.map((mod) => {
                const isSelected = selectedModality === mod.id;
                const st = mod.stats;
                const isMasterClosed =
                  !config.examenAbierto ||
                  (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id);
                const isDisabledForStart =
                  st.count >= 2 || st.isExhausted || st.isBlockedByTeacher || isMasterClosed;

                return (
                  <div
                    key={mod.id}
                    onClick={() => handleSelectExamModality(mod.id, false)}
                    className={`text-left p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                      isDisabledForStart
                        ? isSelected
                          ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-500/50'
                          : 'border-slate-200 bg-slate-50/90'
                        : isSelected
                        ? 'border-sky-600 bg-sky-50/60 ring-2 ring-sky-600/50 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-bold text-sky-900">{mod.badge}</span>
                        <span
                          className={`font-mono font-bold px-2.5 py-1 rounded-md ${
                            st.isBlockedByTeacher
                              ? 'bg-red-100 text-red-800'
                              : st.count >= 2 || st.isExhausted
                              ? 'bg-emerald-100 text-emerald-900'
                              : st.count === 1
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {st.isBlockedByTeacher
                            ? '🔒 Bloqueado por Docente'
                            : st.count >= 2 || st.isExhausted
                            ? `✓ Completado (2/2 Intentos)`
                            : st.count === 1
                            ? `1 Intento Usado · Queda 1`
                            : `⏳ Pendiente (0/${st.maxAllowed} Intentos)`}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {mod.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{mod.subtitle}</p>
                    </div>

                    {/* Estado de Intentos y Nota Definitiva en 3 Cajas Claras */}
                    <div className="space-y-3 pt-3 border-t border-slate-200/80">
                      <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <div className="text-[10px] font-sans text-slate-500">Intento #1</div>
                          <div className="font-bold text-slate-900">
                            {st.att1 ? `${st.att1.notaColombiana.toFixed(1)}` : '—'}
                          </div>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-slate-200">
                          <div className="text-[10px] font-sans text-slate-500">Intento #2</div>
                          <div className="font-bold text-slate-900">
                            {st.att2 ? `${st.att2.notaColombiana.toFixed(1)}` : '—'}
                          </div>
                        </div>
                        <div
                          className={`p-2 rounded-xl border ${
                            st.count > 0
                              ? st.bestGrade >= minPass
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <div className="text-[10px] font-sans font-semibold">Definitiva</div>
                          <div className="font-bold">
                            {st.count > 0 ? `${st.bestGrade.toFixed(1)} / 5.0` : 'Sin nota'}
                          </div>
                        </div>
                      </div>

                      {/* Botón Grande de Acción Directa en Cada Tarjeta (Adaptado a Móvil min-h-[52px]) */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          disabled={isDisabledForStart}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectExamModality(mod.id, true);
                          }}
                          className="w-full min-h-[52px] py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-600 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                        >
                          {st.isBlockedByTeacher ? (
                            <span>🔒 Examen Bloqueado por Docente</span>
                          ) : isMasterClosed ? (
                            <span>⏳ Examen en Sala de Espera (Cerrado)</span>
                          ) : st.count >= 2 || st.isExhausted ? (
                            <span>
                              ✓ 2/2 Intentos Realizados · Nota: {st.bestGrade.toFixed(1)} / 5.0
                            </span>
                          ) : (
                            <>
                              <span>
                                {st.count === 0
                                  ? '▶ Presentar Intento #1 de 2 Ahora'
                                  : '▶ Presentar Intento #2 de 2 (Preguntas Nuevas)'}
                              </span>
                              <ArrowRight className="w-4 h-4 shrink-0" />
                            </>
                          )}
                        </button>

                        {st.count > 0 && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const latestAtt = st.att2 || st.att1;
                                if (latestAtt) {
                                  setFinishedResult(latestAtt);
                                  setExamPhase('results');
                                } else {
                                  setStudentDashboardTab('mis_notas');
                                }
                              }}
                              className="min-h-[52px] px-3.5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Ver Certificado
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFormalReviewTicketModal({
                                  tipo: 'RECALIFICACION_EXAMEN',
                                  targetId: mod.id,
                                  targetLabel: mod.title,
                                  notaActual: st.bestGrade
                                });
                              }}
                              className="min-h-[52px] px-3.5 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-extrabold shrink-0 cursor-pointer"
                              title="Enviar solicitud justificada de revisión de nota o pregunta de este examen"
                            >
                              🎫 Ticket Revisión
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen de Reglas y Barra Inferior de Acción Rápida */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
                <span>
                  Recordatorio de Reglas Oficiales · Escala 0.0 a 5.0 (Aprobado ≥ {minPass.toFixed(1)})
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Durante el examen activo están supervisados los cambios de pestaña, minimizado de ventana, cambio de aplicación y atajos de copia. Usted cuenta con <strong>{maxLlamadosPermitidos} llamado(s) preventivo(s)</strong> antes de la suspensión automática (0.0 / 5.0).
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="text-xs sm:text-sm text-slate-700">
                Seleccionado: <strong>{selectedModConfig.title}</strong> ({selectedModStats.count}/{selectedModStats.maxAllowed} intentos)
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStudentDashboardTab('mini_retos')}
                  className="min-h-[50px] py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>Ir a Mini Retos e Insignias ({unlockedBadgesCount}/5)</span>
                </button>

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
                  className="min-h-[52px] py-3.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {!config.examenAbierto ||
                  (config.estudiantesConEstadoCerrado || []).includes(currentStudent.id) ? (
                    <span>■ Examen Cerrado por Docente</span>
                  ) : selectedModStats.isBlockedByTeacher ? (
                    <span>🔒 Examen Bloqueado por Docente</span>
                  ) : selectedModStats.count >= 2 || selectedModStats.isExhausted ? (
                    <span>
                      ✓ 2/2 Intentos Cumplidos · Nota: {selectedModStats.bestGrade.toFixed(1)}/5.0
                    </span>
                  ) : (
                    <>
                      <span>
                        Iniciar Intento #{selectedModStats.count + 1} de {selectedModStats.maxAllowed} Ahora
                      </span>
                      <ArrowRight className="w-5 h-5 shrink-0" />
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

        {/* ================= VENTANA 3: MIS NOTAS, ESTADO GENERAL (EXÁMENES Y RETOS) Y CERTIFICADOS ================= */}
        {studentDashboardTab === 'mis_notas' && (
          <div className="space-y-6">
            {/* A. Tablero Completo de Estado General: ¿Qué Exámenes y Retos he realizado y cuáles me faltan? */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-700">
                    Ventana 3 · Control de Mi Progreso Académico
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                    Estado General de Mis Exámenes y Mini Retos
                  </h2>
                  <p className="text-xs text-slate-600">
                    Consulte en un solo lugar qué actividades ya completó, su calificación y toque cualquier actividad pendiente para ir a presentarla.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Columna 1: Estado de los 6 Exámenes Oficiales */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-sky-700" />
                      <span>Estado de Mis 6 Exámenes Oficiales</span>
                    </h3>
                    <span className="text-xs font-mono font-bold text-sky-800">
                      {completedExamsCount}/6 con nota
                    </span>
                  </div>

                  <div className="space-y-2">
                    {modalitiesOverview.map((m) => {
                      const st = m.stats;
                      const done = st.count > 0;
                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900">{m.title}</div>
                            <div className="text-slate-600 font-mono">
                              {done ? (
                                <>
                                  <span className="text-emerald-700 font-bold">✓ Realizado</span> · Intentos: {st.count}/2 ·{' '}
                                  <strong>Nota: {st.bestGrade.toFixed(1)} / 5.0</strong>
                                </>
                              ) : (
                                <>
                                  <span className="text-amber-700 font-bold">⏳ Pendiente por presentar</span> · Intentos: 0/2
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {done && (
                              <button
                                type="button"
                                onClick={() =>
                                  openFormalReviewTicketModal({
                                    tipo: 'RECALIFICACION_EXAMEN',
                                    targetId: m.id,
                                    targetLabel: m.title,
                                    notaActual: st.bestGrade
                                  })
                                }
                                className="min-h-[42px] px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold text-xs cursor-pointer"
                                title="Radicar Ticket de Revisión de Nota para este examen"
                              >
                                🎫 Revisión
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModality(m.id);
                                setStudentDashboardTab('modalidades');
                              }}
                              className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold text-xs shrink-0 cursor-pointer ${
                                done && st.isExhausted
                                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  : 'bg-sky-600 text-white hover:bg-sky-700'
                              }`}
                            >
                              {done && st.isExhausted
                                ? 'Ver Examen'
                                : done
                                ? '2º Intento →'
                                : 'Presentar →'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Columna 2: Estado de los 5 Mini Retos Semánticos */}
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-amber-50/30">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-600" />
                      <span>Estado de Mis Mini Retos IA ({effectiveCourseBadgesOverview.length})</span>
                    </h3>
                    <span className="text-xs font-mono font-bold text-amber-900">
                      🏅 {unlockedBadgesCount}/{effectiveCourseBadgesOverview.length} superados
                    </span>
                  </div>

                  <div className="space-y-2">
                    {effectiveCourseBadgesOverview.map((badgeItem) => {
                      const modNum = badgeItem.modulo;
                      const prog = currentStudent.progresoRetos?.[modNum];
                      const won = Boolean(prog?.insigniaDesbloqueada);
                      const used = Number(prog?.intentosUsados) || 0;
                      const bestPct = Number(prog?.mejorPorcentaje) || 0;
                      const suspended = Boolean(prog?.suspendidoPorTrampa);

                      return (
                        <div
                          key={modNum}
                          className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900">
                              {badgeItem.icono} {badgeItem.shortCode || `M${badgeItem.realModuloId || modNum}`} — {badgeItem.tituloPrincipal}
                            </div>
                            <div className="text-slate-600 font-mono">
                              {won ? (
                                <>
                                  <span className="text-emerald-700 font-bold">🏅 Insignia Ganada</span> · Mejor: <strong>{bestPct}%</strong> ({used}/3 int.)
                                </>
                              ) : suspended ? (
                                <span className="text-red-700 font-bold">🚨 Suspendido (0.0 / 5.0)</span>
                              ) : used > 0 ? (
                                <>
                                  <span className="text-amber-700 font-bold">🔄 En curso</span> · Mejor: {bestPct}% · Intentos: {used}/3
                                </>
                              ) : (
                                <>
                                  <span className="text-amber-700 font-bold">⏳ Pendiente por realizar</span> · Intentos: 0/3
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRetoModuloJump(modNum);
                              setStudentDashboardTab('mini_retos');
                            }}
                            className={`min-h-[42px] px-3.5 py-2 rounded-lg font-bold text-xs shrink-0 cursor-pointer ${
                              won
                                ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                                : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            }`}
                          >
                            {won ? 'Ver Insignia' : 'Ir al Reto →'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* B. Historial de Certificados y Exámenes Entregados (Tarjetas Grandes en Móvil + Tabla en Web) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Certificados Oficiales y Revisión de Exámenes Entregados ({studentAttempts.length})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Toque «Ver Certificado y Revisión» en cualquier intento para abrir el desglose de preguntas y descargar el certificado.
                  </p>
                </div>
                {studentAttempts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setStudentDashboardTab('modalidades')}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
                  >
                    Ir a Presentar Mi Primer Examen →
                  </button>
                )}
              </div>

              {studentAttempts.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-600 space-y-3">
                  <p>Aún no ha registrado entregas de exámenes oficiales en esta sesión.</p>
                </div>
              ) : (
                <>
                  {/* Vista Móvil: Tarjetas Grandes con Botón de Ancho Completo */}
                  <div className="grid grid-cols-1 gap-3 md:hidden">
                    {studentAttempts.map((att) => (
                      <div
                        key={att.attemptId}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[11px] text-slate-500 block">
                              {att.fecha} · Intento #{att.intentoNumero}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                              {att.modalidadLabel}
                            </h4>
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <div className="text-base font-extrabold text-slate-900">
                              {att.notaColombiana.toFixed(1)} / 5.0
                            </div>
                            <div className="text-[11px] font-bold">
                              {att.estado === 'APROBADO' && (
                                <span className="text-emerald-700">✓ APROBADO</span>
                              )}
                              {att.estado === 'REPROBADO' && (
                                <span className="text-amber-700">✕ REPROBADO</span>
                              )}
                              {att.estado === 'SUSPENDIDO' && (
                                <span className="text-red-700">⚠️ SUSPENDIDO</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-slate-600 font-mono pt-2 border-t border-slate-200/80">
                          <span>
                            Aciertos: <strong>{att.aciertos}/{att.totalPreguntas}</strong> ({att.porcentaje}%)
                          </span>
                          <span>Tiempo: {formatTime(att.tiempoEmpleadoSegundos)}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setFinishedResult(att);
                              setExamPhase('results');
                            }}
                            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <FileCheck2 className="w-4 h-4" />
                            <span>Ver Certificado y Preguntas</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openFormalReviewTicketModal({
                                tipo: 'RECALIFICACION_EXAMEN',
                                targetId: att.modalidad,
                                targetLabel: `${att.modalidadLabel} (Intento #${att.intentoNumero})`,
                                notaActual: att.notaColombiana
                              })
                            }
                            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>🎫 Solicitar Revisión de Nota</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Vista Web / Escritorio: Tabla Clara */}
                  <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                          <th className="py-3.5 px-4">Fecha y Hora</th>
                          <th className="py-3.5 px-4">Modalidad de Evaluación</th>
                          <th className="py-3.5 px-4 text-center">Intento</th>
                          <th className="py-3.5 px-4 text-right">Aciertos</th>
                          <th className="py-3.5 px-4 text-right">Nota (0.0 - 5.0)</th>
                          <th className="py-3.5 px-4">Estado</th>
                          <th className="py-3.5 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {studentAttempts.map((att) => (
                          <tr key={att.attemptId} className="hover:bg-slate-50">
                            <td className="py-3.5 px-4 font-mono text-slate-600">{att.fecha}</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-900">{att.modalidadLabel}</td>
                            <td className="py-3.5 px-4 text-center font-mono">#{att.intentoNumero}</td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                              {att.aciertos}/{att.totalPreguntas} ({att.porcentaje}%)
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-sm">
                              {att.notaColombiana.toFixed(1)} / 5.0
                            </td>
                            <td className="py-3.5 px-4 font-semibold">
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
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFinishedResult(att);
                                    setExamPhase('results');
                                  }}
                                  className="min-h-[38px] px-3 py-2 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
                                >
                                  Ver Certificado / Revisión
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openFormalReviewTicketModal({
                                      tipo: 'RECALIFICACION_EXAMEN',
                                      targetId: att.modalidad,
                                      targetLabel: `${att.modalidadLabel} (Intento #${att.intentoNumero})`,
                                      notaActual: att.notaColombiana
                                    })
                                  }
                                  className="min-h-[38px] px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold cursor-pointer"
                                  title="Enviar solicitud justificada de revisión de nota para este examen"
                                >
                                  🎫 Ticket Revisión
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* C. Cortes Académicos Calificados + Bandeja de Tickets de Revisión de Nota y Reclamos Académicos */}
            {(() => {
              const acadSummary = computeStudentAcademicSummary(
                currentStudentAcademicRecord,
                currentStudent,
                studentAttempts,
                studentClassSessions
              );
              const s1 = acadSummary.classSummaries.find((c) => c.classId === 1)?.notaFinalClase ?? 0;
              const s2 = acadSummary.classSummaries.find((c) => c.classId === 2)?.notaFinalClase ?? 0;
              const s3 = acadSummary.classSummaries.find((c) => c.classId === 3)?.notaFinalClase ?? 0;
              const s4 = acadSummary.classSummaries.find((c) => c.classId === 4)?.notaFinalClase ?? 0;
              const s5 = acadSummary.classSummaries.find((c) => c.classId === 5)?.notaFinalClase ?? 0;
              const s6 = acadSummary.classSummaries.find((c) => c.classId === 6)?.notaFinalClase ?? 0;
              const corte1Score = Number(((s1 + s2) / 2).toFixed(1));
              const corte2Score = Number(((s3 + s4) / 2).toFixed(1));
              const corte3Score = Number(((s5 + s6) / 2).toFixed(1));
              const studentTickets = Array.isArray(currentStudent.solicitudesRevision)
                ? currentStudent.solicitudesRevision
                : [];

              return (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-mono font-extrabold text-amber-900 uppercase">
                        🎫 Trazabilidad Oficial Estudiante ↔ Docente
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                        Cortes Calificados y Solicitudes Formales de Revisión de Nota / Excusas
                      </h3>
                      <p className="text-xs text-slate-600">
                        Envíe una solicitud justificada junto a cualquier examen, corte académico o sesión (ej. interpretación de pregunta o soporte médico de inasistencia) con respuesta oficial trazada del docente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openFormalReviewTicketModal({
                          tipo: 'RECALIFICACION_EXAMEN',
                          targetId: 'integral',
                          targetLabel: 'Examen Integral Final',
                          notaActual: 0.0
                        })
                      }
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shrink-0 cursor-pointer shadow-2xs"
                    >
                      + Nuevo Ticket de Revisión / Excusa
                    </button>
                  </div>

                  {/* Tarjetas de los 3 Cortes Académicos con botón de Ticket de Revisión */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    {[
                      {
                        id: 'corte_1',
                        title: 'Corte Académico 1 (30%)',
                        subtitle: 'Consolidado Clases S1 y S2 + Evaluaciones',
                        score: corte1Score
                      },
                      {
                        id: 'corte_2',
                        title: 'Corte Académico 2 (30%)',
                        subtitle: 'Consolidado Clases S3 y S4 + Evaluaciones',
                        score: corte2Score
                      },
                      {
                        id: 'corte_3',
                        title: 'Corte Académico 3 Final (40%)',
                        subtitle: 'Consolidado Clases S5, S6 y Proyecto ABPro',
                        score: corte3Score
                      }
                    ].map((cut) => (
                      <div
                        key={cut.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-slate-900 text-sm">{cut.title}</div>
                            <div className="text-[11px] text-slate-500">{cut.subtitle}</div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg font-mono font-extrabold text-sm ${
                              cut.score >= minPass
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cut.score.toFixed(1)} / 5.0
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openFormalReviewTicketModal({
                              tipo: 'REVISION_CORTE_NOTA',
                              targetId: cut.id,
                              targetLabel: cut.title,
                              notaActual: cut.score
                            })
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-white hover:bg-amber-50 border border-amber-300 text-amber-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span>🎫 Solicitar Revisión de {cut.title.split(' (')[0]}</span>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Historial de Tickets Enviados por el Estudiante */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-mono font-extrabold uppercase text-slate-700">
                        Historial de Mis Tickets de Revisión y Excusas ({studentTickets.length})
                      </h4>
                    </div>
                    {studentTickets.length === 0 ? (
                      <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                        No ha enviado solicitudes de revisión de nota ni excusas académicas hasta el momento.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {studentTickets.map((tck) => (
                          <div
                            key={tck.id}
                            className={`p-4 rounded-xl border text-xs space-y-2 ${
                              tck.estado === 'APROBADA'
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : tck.estado === 'RECHAZADA'
                                ? 'bg-rose-50/50 border-rose-200'
                                : 'bg-amber-50/40 border-amber-200'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                                  #{tck.id}
                                </span>
                                <span className="font-extrabold text-slate-900 text-sm">
                                  {tck.targetLabel}
                                </span>
                                {tck.preguntaReferencia && (
                                  <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-mono text-[10px] font-semibold text-slate-700">
                                    Ref: {tck.preguntaReferencia}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                                  tck.estado === 'APROBADA'
                                    ? 'bg-emerald-600 text-white'
                                    : tck.estado === 'RECHAZADA'
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-500 text-slate-950'
                                }`}
                              >
                                {tck.estado === 'APROBADA'
                                  ? '✓ APROBADA POR DOCENTE'
                                  : tck.estado === 'RECHAZADA'
                                  ? '✕ RECHAZADA'
                                  : '⏳ PENDIENTE DE RESPUESTA'}
                              </span>
                            </div>

                            <p className="text-slate-700 leading-relaxed">
                              <strong>Mi justificación:</strong> “{tck.motivoEstudiante}”
                            </p>

                            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-600">
                              <span>
                                Radicado: {new Date(tck.createdAtIso).toLocaleString('es-CO')}
                              </span>
                              {typeof tck.notaActual === 'number' && (
                                <span>Nota original: {tck.notaActual.toFixed(1)} / 5.0</span>
                              )}
                              {typeof tck.notaSolicitada === 'number' && (
                                <span>Nota solicitada: {tck.notaSolicitada.toFixed(1)} / 5.0</span>
                              )}
                              {typeof tck.notaAprobada === 'number' && (
                                <strong className="text-emerald-800">
                                  Nueva nota oficial: {tck.notaAprobada.toFixed(1)} / 5.0
                                </strong>
                              )}
                              {tck.soporteUrl && (
                                <a
                                  href={tck.soporteUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sky-700 font-bold underline"
                                >
                                  Ver Soporte Adjunto ↗
                                </a>
                              )}
                            </div>

                            {tck.comentarioDocente && (
                              <div className="p-3 rounded-lg bg-white border border-slate-200/90 text-slate-800 mt-1">
                                <div className="font-bold text-slate-900 mb-0.5">
                                  👨‍🏫 Respuesta Oficial del Docente{' '}
                                  {tck.respondedAtIso
                                    ? `(${new Date(tck.respondedAtIso).toLocaleString('es-CO')})`
                                    : ''}
                                  :
                                </div>
                                <p>{tck.comentarioDocente}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* D. Gráfica Comparativa de Rendimiento Estudiantil */}
            <StudentPerformanceDashboard
              studentId={currentStudent.id}
              studentName={currentStudent.nombre}
              studentAttempts={studentAttempts}
              allAttempts={attempts}
              minPassingGrade={minPass}
            />
          </div>
        )}

        {/* ================= VENTANA 4: DIAGNÓSTICO PEDAGÓGICO (MÓDULOS Y TAXONOMÍA DE BLOOM) ================= */}
        {studentDashboardTab === 'diagnostico_pedagogico' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-700">
                  Ventana 4 · Análisis por Competencias
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Diagnóstico por Módulos Curriculares y Nivel Cognitivo Bloom
                </h2>
                <p className="text-xs text-slate-600">
                  Identifique su porcentaje de dominio en cada módulo y acceda con un toque al Examen o Mini Reto de refuerzo.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Desglose por Módulos con Botones Directos a Examen y Reto */}
              <div className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Dominio por Módulo Curricular (Módulos 1 al 5)
                </h3>
                <div className="space-y-4">
                  {([1, 2, 3, 4, 5] as const).map((m) => {
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
                      <div key={m} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex flex-wrap justify-between items-center gap-1 text-xs">
                          <span className="font-bold text-slate-900">Módulo {m}</span>
                          <span className="font-mono">
                            {pct}% ({st.correct}/{st.total}) · <strong>{level}</strong>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
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
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModality(`mod${m}` as ExamModality);
                              setStudentDashboardTab('modalidades');
                            }}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer"
                          >
                            Ir a Examen Mód. {m}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRetoModuloJump(m);
                              setStudentDashboardTab('mini_retos');
                            }}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            🏅 Ir a Reto Mód. {m}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Desglose por Taxonomía de Bloom y Temas Prioritarios */}
              <div className="space-y-5">
                <div className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
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

                {/* Conceptos con Mayor Tasa de Error */}
                <div className="border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Conceptos Prioritarios para Refuerzo Académico
                  </h3>
                  {studentDiagnostics.weakTopics.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No se registran conceptos con tasa de error o aún no ha completado intentos.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5">
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
            </div>
          </div>
        )}

        {/* ================= VENTANA 5: FICHA PERSONAL DE NOTAS DE CLASE & ASISTENCIA (CLASES 1 A 6) ================= */}
        {studentDashboardTab === 'notas_asistencia_clases' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-700">
                  Ficha Personal Oficial · Sincronizada con el Panel Docente
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Mis Notas de Clase & Registro de Asistencia (Clases 1 a 6)
                </h2>
                <p className="text-xs text-slate-600">
                  Consulte su promedio acumulado presencial, porcentaje de asistencia por bloques (B1/B2) y el desglose de sus 6 sesiones con observaciones del docente.
                </p>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-sky-50 border border-sky-200 text-xs font-mono text-sky-950 shrink-0">
                Alumno: <strong>{currentStudent.nombre}</strong> ({currentStudent.id})
              </div>
            </div>

            <StudentPersonalAcademicFicha
              summary={computeStudentAcademicSummary(
                currentStudentAcademicRecord,
                currentStudent,
                studentAttempts,
                studentClassSessions
              )}
              classSessions={studentClassSessions}
              courseName={activeCourseMeta.nombreCurso}
              editableByTeacher={false}
              isStudentPortalView={true}
              onStudentRespondRollCall={handleStudentRespondRollCall}
              onStudentSubmitTrabajo={handleStudentSubmitWork}
              onStudentSubmitExcusa={handleStudentSubmitExcusa}
            />
          </div>
        )}

        {/* ================= VENTANA 2: ZONA DE MINI RETOS & INSIGNIAS (GAMIFICACIÓN CON IA) ================= */}
        {studentDashboardTab === 'mini_retos' && (
          Boolean(currentStudent.bloqueadoRetosDocente || (config.estudiantesSinMiniRetos || []).includes(currentStudent.id)) ? (
            <div className="bg-white border-2 border-red-300 rounded-2xl p-8 max-w-xl mx-auto my-12 text-center space-y-4 shadow-sm animate-in fade-in">
              <div className="w-16 h-16 bg-red-100 border border-red-200 rounded-full flex items-center justify-center mx-auto text-red-600">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <span className="inline-block px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold uppercase tracking-wider">
                  Acceso Restringido
                </span>
                <h3 className="text-xl font-extrabold text-slate-900">
                  Acceso bloqueado por el docente de la asignatura
                </h3>
                <p className="text-xs text-slate-600">
                  El docente de la asignatura ha restringido su acceso a la presentación de Mini Retos para este curso.
                </p>
              </div>
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-medium">
                Si requiere presentar un reto pendiente o justificar una actividad, solicite al docente habilitar su usuario desde la opción «Control de Estudiantes».
              </div>
              <button
                type="button"
                onClick={() => setStudentDashboardTab('inicio')}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Volver al Inicio del Curso
              </button>
            </div>
          ) : (
            <StudentMiniRetosZone
              student={currentStudent}
              onUpdateStudentProfile={onUpdateStudentProfile}
              onRecordRetoAttempt={onRecordRetoAttempt}
              onRecordAntiCheatEvent={onRecordAntiCheatEvent}
              questions={safeQuestions}
              config={config}
              customMiniRetos={customMiniRetos}
              initialModulo={selectedRetoModuloJump}
              onGoToExams={(mod) => {
                if (mod) {
                  setSelectedModality(`mod${mod}` as ExamModality);
                }
                setStudentDashboardTab('modalidades');
              }}
            />
          )
        )}
        </div>

        {/* BOTTOM SHEETS DESLIZABLES (HOJAS INFERIORES TÁCTILES PARA ENTREGA DE TRABAJO, EXCUSA Y PERFIL) */}
        {studentBottomSheet !== 'none' && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Grab Handle Táctil */}
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" />

              {studentBottomSheet === 'entregar_trabajo' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Entrega Rápida de Trabajo Práctico
                      </h3>
                      <p className="text-slate-500">
                        Envíe su resumen o enlace de repositorio/documento directamente al docente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudentBottomSheet('none')}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-800 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-800">
                      Seleccione Módulo / Clase:
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {studentClassSessions.map((cs) => {
                        const cId = cs.id as ClassSessionId;
                        const active = sheetClassId === cId;
                        return (
                          <button
                            key={cId}
                            type="button"
                            onClick={() => {
                              setSheetClassId(cId);
                              const existing = currentStudentAcademicRecord.clases[cId];
                              setSheetWorkText(existing?.trabajoEntregaTexto || '');
                              setSheetWorkLink(existing?.trabajoEntregaEnlace || '');
                            }}
                            className={`min-h-[48px] rounded-xl font-mono text-xs font-bold cursor-pointer active:scale-95 transition-transform ${
                              active
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {cs.code}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-800">
                      Descripción o Resumen del Trabajo Entregado:
                    </label>
                    <textarea
                      rows={3}
                      value={sheetWorkText}
                      onChange={(e) => setSheetWorkText(e.target.value)}
                      placeholder="Describa su entrega, hallazgos o respuesta práctica..."
                      className="w-full p-3 rounded-xl border border-slate-300 text-slate-900 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-800">
                      Enlace Adjunto (Google Drive, GitHub, Canva, PDF — Opcional):
                    </label>
                    <input
                      type="url"
                      value={sheetWorkLink}
                      onChange={(e) => setSheetWorkLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 text-xs"
                    />
                  </div>

                  {sheetNotice && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                      {sheetNotice}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStudentBottomSheet('none')}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer"
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!sheetWorkText.trim() && !sheetWorkLink.trim()) return;
                        handleStudentSubmitWork(
                          sheetClassId,
                          sheetWorkText.trim() || 'Entrega adjunta por enlace',
                          sheetWorkLink.trim()
                        );
                        setSheetNotice(
                          `✓ Trabajo de la Clase C${sheetClassId} enviado a revisión docente.`
                        );
                        setTimeout(() => setStudentBottomSheet('none'), 1200);
                      }}
                      className="min-h-[48px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer active:scale-95 transition-transform"
                    >
                      Enviar Entrega Ahora
                    </button>
                  </div>
                </div>
              )}

              {studentBottomSheet === 'justificar_falla' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-extrabold uppercase mb-1">
                        🎫 Ticket Oficial con Trazabilidad Académica
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        Solicitud Formal de Revisión de Nota / Excusa Académica
                      </h3>
                      <p className="text-slate-500">
                        Su solicitud queda radicada en la Bandeja Centralizada del Docente para respuesta oficial y actualización en un clic.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudentBottomSheet('none')}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-800 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Selector de Tipo de Ticket */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      {
                        id: 'RECALIFICACION_EXAMEN' as AcademicReviewTicketType,
                        label: '📝 Revisión de Examen / Pregunta'
                      },
                      {
                        id: 'REVISION_CORTE_NOTA' as AcademicReviewTicketType,
                        label: '📊 Revisión de Corte / Nota Clase'
                      },
                      {
                        id: 'EXCUSA_INASISTENCIA' as AcademicReviewTicketType,
                        label: '🏥 Excusa de Inasistencia'
                      }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setReviewTicketType(tab.id);
                          if (tab.id === 'RECALIFICACION_EXAMEN') {
                            const firstMod = modalitiesOverview[0];
                            setReviewTicketTargetId(firstMod?.id || 'integral');
                            setReviewTicketTargetLabel(firstMod?.title || 'Examen Integral');
                            setReviewTicketCurrentGrade(firstMod?.stats.bestGrade || 0);
                          } else if (tab.id === 'REVISION_CORTE_NOTA') {
                            setReviewTicketTargetId('corte_1');
                            setReviewTicketTargetLabel('Corte Académico 1 (30%)');
                          }
                        }}
                        className={`p-2.5 rounded-xl border font-bold text-left cursor-pointer transition-all ${
                          reviewTicketType === tab.id
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {reviewTicketType === 'EXCUSA_INASISTENCIA' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          Clase / Sesión a Justificar:
                        </label>
                        <select
                          value={sheetClassId}
                          onChange={(e) =>
                            setSheetClassId(Number(e.target.value) as ClassSessionId)
                          }
                          className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                        >
                          {studentClassSessions.map((cs) => (
                            <option key={cs.id} value={cs.id}>
                              {cs.code} — {cs.shortTitle}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          Bloque de Inasistencia:
                        </label>
                        <select
                          value={sheetExcuseBlock}
                          onChange={(e) =>
                            setSheetExcuseBlock(e.target.value as 'A' | 'B' | 'AB')
                          }
                          className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                        >
                          <option value="A">Bloque A (B1)</option>
                          <option value="B">Bloque B (B2)</option>
                          <option value="AB">Ambos Bloques (A y B)</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-800 mb-1">
                            {reviewTicketType === 'RECALIFICACION_EXAMEN'
                              ? 'Examen Oficial a Revisar:'
                              : 'Corte o Sesión Calificada:'}
                          </label>
                          {reviewTicketType === 'RECALIFICACION_EXAMEN' ? (
                            <select
                              value={reviewTicketTargetId}
                              onChange={(e) => {
                                const found = modalitiesOverview.find(
                                  (m) => m.id === e.target.value
                                );
                                setReviewTicketTargetId(e.target.value);
                                setReviewTicketTargetLabel(found?.title || e.target.value);
                                setReviewTicketCurrentGrade(found?.stats.bestGrade || 0);
                              }}
                              className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                            >
                              {modalitiesOverview.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.title} (Nota actual: {m.stats.bestGrade.toFixed(1)}/5.0)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={reviewTicketTargetId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReviewTicketTargetId(val);
                                const labels: Record<string, string> = {
                                  corte_1: 'Corte Académico 1 (30%)',
                                  corte_2: 'Corte Académico 2 (30%)',
                                  corte_3: 'Corte Académico 3 Final (40%)',
                                  clase_1: 'Clase C1 / Sesión 1',
                                  clase_2: 'Clase C2 / Sesión 2',
                                  clase_3: 'Clase C3 / Sesión 3',
                                  clase_4: 'Clase C4 / Sesión 4',
                                  clase_5: 'Clase C5 / Sesión 5',
                                  clase_6: 'Clase C6 / Sesión 6'
                                };
                                setReviewTicketTargetLabel(labels[val] || val);
                              }}
                              className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                            >
                              <option value="corte_1">Corte Académico 1 (30%)</option>
                              <option value="corte_2">Corte Académico 2 (30%)</option>
                              <option value="corte_3">Corte Académico 3 Final (40%)</option>
                              {studentClassSessions.map((cs) => (
                                <option key={cs.id} value={`clase_${cs.id}`}>
                                  Clase {cs.code}: {cs.shortTitle}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-slate-800 mb-1">
                              Nota Actual:
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={`${reviewTicketCurrentGrade.toFixed(1)} / 5.0`}
                              className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 font-mono font-bold text-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-800 mb-1">
                              Nota Solicitada:
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="5"
                              value={reviewTicketRequestedGrade}
                              onChange={(e) => setReviewTicketRequestedGrade(e.target.value)}
                              className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          Pregunta o Criterio Específico (Opcional, ej. &quot;Pregunta #4 / M1-04&quot;):
                        </label>
                        <input
                          type="text"
                          value={reviewTicketQuestionRef}
                          onChange={(e) => setReviewTicketQuestionRef(e.target.value)}
                          placeholder="Ej. Considero que la pregunta #4 tiene dos interpretaciones..."
                          className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Justificación Académica Detallada del Estudiante:
                    </label>
                    <textarea
                      rows={3}
                      value={sheetExcuseReason}
                      onChange={(e) => setSheetExcuseReason(e.target.value)}
                      placeholder={
                        reviewTicketType === 'EXCUSA_INASISTENCIA'
                          ? 'Ej. Adjunto excusa médica de la sesión S3 por incapacidad certificada...'
                          : 'Ej. Considero que la pregunta #4 tiene dos interpretaciones válidas según el material del Módulo 1...'
                      }
                      className="w-full p-3 rounded-xl border border-slate-300 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Enlace a Evidencia, Captura o Soporte Médico (Opcional):
                    </label>
                    <input
                      type="url"
                      value={sheetExcuseUrl}
                      onChange={(e) => setSheetExcuseUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                    />
                  </div>

                  {sheetNotice && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                      {sheetNotice}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStudentBottomSheet('none')}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleStudentSubmitFormalTicket}
                      className="min-h-[46px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer active:scale-95 transition-transform"
                    >
                      🎫 Radicar Ticket de Revisión Ahora
                    </button>
                  </div>
                </div>
              )}

              {studentBottomSheet === 'perfil' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Cuenta y Credenciales del Estudiante
                      </h3>
                      <p className="text-slate-500 font-mono">
                        Documento / ID: {currentStudent.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStudentBottomSheet('none')}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-800 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleSaveStudentProfile} className="space-y-3">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Nombre Completo:
                      </label>
                      <input
                        type="text"
                        required
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Código de Acceso Personal:
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={12}
                        value={profileCodeInput}
                        onChange={(e) => setProfileCodeInput(e.target.value.toUpperCase())}
                        className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono uppercase text-slate-900 font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          Correo Electrónico:
                        </label>
                        <input
                          type="email"
                          value={profileEmailInput}
                          onChange={(e) => setProfileEmailInput(e.target.value)}
                          placeholder="estudiante@correo.com"
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          WhatsApp/Celular:
                        </label>
                        <input
                          type="tel"
                          value={profileWhatsappInput}
                          onChange={(e) => setProfileWhatsappInput(e.target.value)}
                          placeholder="Ej: 3001234567"
                          className="w-full min-h-[48px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                        />
                      </div>
                    </div>
                    {profileSaveMsg && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                        {profileSaveMsg}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          handleLogoutCurrentStudent();
                          onGoToInitialHome?.();
                        }}
                        className="min-h-[48px] px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                      </button>

                      <button
                        type="submit"
                        className="min-h-[48px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer active:scale-95 transition-transform"
                      >
                        Guardar Cambios
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      value={profileEmailInput}
                      onChange={(e) => setProfileEmailInput(e.target.value)}
                      placeholder="estudiante@correo.com"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      WhatsApp/Celular
                    </label>
                    <input
                      type="tel"
                      value={profileWhatsappInput}
                      onChange={(e) => setProfileWhatsappInput(e.target.value)}
                      placeholder="Ej: 3001234567"
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                    />
                  </div>
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

        {/* DOCK INFERIOR PERSISTENTE ESTILO OS TÁCTIL (AL ALCANCE DEL PULGAR, HITBOX >= 48x48px) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 grid grid-cols-5 gap-1 shadow-lg no-print">
          <button
            type="button"
            onClick={handleGoHomeStudentPanel}
            className={`min-h-[48px] rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform ${
              studentDashboardTab === 'inicio'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="whitespace-nowrap">Inicio OS</span>
          </button>

          <button
            type="button"
            onClick={() => setStudentDashboardTab('material_modulos')}
            className={`min-h-[48px] rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform ${
              studentDashboardTab === 'material_modulos'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="whitespace-nowrap">Lecciones</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeRollCallClasses.length > 0) {
                handleStudentRespondRollCall(activeRollCallClasses[0]);
              } else {
                setSheetClassId(selectedStepperClassId);
                const existingW =
                  currentStudentAcademicRecord.clases[selectedStepperClassId];
                setSheetWorkText(existingW?.trabajoEntregaTexto || '');
                setSheetWorkLink(existingW?.trabajoEntregaEnlace || '');
                setSheetNotice(null);
                setStudentBottomSheet('entregar_trabajo');
              }
            }}
            className={`min-h-[48px] rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform ${
              activeRollCallClasses.length > 0
                ? 'bg-emerald-600 text-white'
                : studentBottomSheet === 'entregar_trabajo'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 text-slate-900'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span className="whitespace-nowrap">
              {activeRollCallClasses.length > 0 ? 'Presente' : 'Entregar'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setStudentDashboardTab(
                studentDashboardTab === 'modalidades' ? 'mini_retos' : 'modalidades'
              )
            }
            className={`min-h-[48px] rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform ${
              studentDashboardTab === 'mini_retos' || studentDashboardTab === 'modalidades'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span className="whitespace-nowrap">Evaluar</span>
          </button>

          <button
            type="button"
            onClick={() => setStudentDashboardTab('notas_asistencia_clases')}
            className={`min-h-[48px] rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 transition-transform ${
              studentDashboardTab === 'notas_asistencia_clases' ||
              studentDashboardTab === 'mis_notas'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="whitespace-nowrap">Notas</span>
          </button>
        </nav>
        {globalSessionAtRiskModalNode}
        {teacherBlockedModalNode}
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
        {globalSessionAtRiskModalNode}
        {teacherBlockedModalNode}
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
        {/* ALERTA EN TIEMPO REAL DURANTE EXAMEN: LLAMADO DE ASISTENCIA DEL DOCENTE */}
        {activeRollCallClasses.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-extrabold uppercase animate-pulse">
                📡 Llamado de Asistencia en Vivo
              </span>
              <div className="text-xs sm:text-sm font-extrabold text-amber-950">
                El docente está llamando a lista ahora. Confirme su asistencia sin salir de su evaluación:
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeRollCallClasses.map((cId) => {
                const csInfo = (studentClassSessions || []).find((s) => s.id === cId);
                return (
                  <button
                    key={cId}
                    type="button"
                    onClick={() => handleStudentRespondRollCall(cId)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                  >
                    🙋‍♂️ Responder Presente ({csInfo?.code || `C${cId}`})
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

            {/* Modo Foco (Sin Distracciones) Toggle Button */}
            <button
              type="button"
              onClick={() => setExamFocusMode((prev) => !prev)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                examFocusMode
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title="Ocultar barras secundarias para concentrarse únicamente en la pregunta y opciones"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {examFocusMode ? 'Salir Modo Foco' : 'Modo Foco'}
              </span>
            </button>

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

        {offlineSubmissionQueued && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-950 font-semibold">
            <span>
              📦 Cola Offline Activa: Su última entrega está resguardada localmente y se sincronizará con el servidor automáticamente al detectar conexión estable.
            </span>
          </div>
        )}

        {/* Barra de Estado del Escudo Anti-Trampa en el Examen (Oculta en Modo Foco para maximizar espacio vertical) */}
        {!examFocusMode && (
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

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-md bg-slate-800 text-sky-300 font-mono text-[11px] items-center gap-1.5 border border-slate-700">
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Modo Maximizado</span>
            </span>
            {isExamFullscreenGuardEnabled && (
              <button
                type="button"
                onClick={() => {
                  try {
                    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    } else if (document.fullscreenElement && document.exitFullscreen) {
                      document.exitFullscreen().catch(() => {});
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 cursor-pointer text-xs"
                title="Alternar pantalla completa de forma opcional"
              >
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                <span>{document.fullscreenElement ? 'Salir de Completa' : 'Pantalla Completa (Opcional)'}</span>
              </button>
            )}
          </div>
          </div>
        )}

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
                            const activeModInfo =
                              activeModalityOptions.find((m) => m.id === selectedModality) ||
                              activeModalityOptions[0];
                            const logEntry: AntiCheatLogEntry = {
                              id: `AC-BURST-${currentStudent.id}-${nowMs}-${nextCount}`,
                              fecha: new Date().toLocaleString('es-CO'),
                              timestampMs: nowMs,
                              studentId: currentStudent.id,
                              studentName: currentStudent.nombre,
                              origen: 'EXAMEN',
                              modalidadOModulo: activeModInfo.title,
                              tipoDeteccion: 'RAFAGA_RESPUESTA_RAPIDA_IA',
                              etiquetaDeteccion: 'Ráfaga sin Lectura (IA)',
                              descripcion:
                                'Marcación consecutiva de 3 respuestas en menos de 2.2s por pregunta sin lectura del enunciado',
                              llamadoNumero: nextCount,
                              numeroLlamado: nextCount,
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

          {/* Bottom Question Navigation — Botones Grandes Adaptados a Móvil y Web */}
          <div className="pt-4 border-t border-slate-100 grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="min-h-[50px] px-4 py-3 rounded-xl border border-slate-300 disabled:opacity-40 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Anterior</span>
            </button>

            {currentIndex < activeQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(activeQuestions.length - 1, i + 1))}
                className="min-h-[50px] px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSubmitModal(true)}
                className="min-h-[50px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileCheck2 className="w-4 h-4 shrink-0" />
                <span>Revisar y Entregar</span>
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
          <div className="h-14 sm:hidden" />
        </div>

        {/* Barra Inferior Fija Móvil (Mobile-First Ergonomic Navigation Sheet) */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xs border-t border-slate-700 px-3 py-2 flex items-center justify-between gap-2 text-white shadow-2xl no-print">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className="px-3 py-2 rounded-xl bg-slate-800 disabled:opacity-40 text-xs font-bold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ant.</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMarkedForReview((prev) => ({
                ...prev,
                [currentQ.id]: !prev[currentQ.id]
              }))
            }
            className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border cursor-pointer ${
              isMarked
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span>Duda</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-sky-300 cursor-pointer"
          >
            {currentIndex + 1}/{activeQuestions.length} ({answeredCount}✓)
          </button>

          {currentIndex < activeQuestions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(activeQuestions.length - 1, i + 1))}
              className="px-3.5 py-2 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Sig.</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmSubmitModal(true)}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Entregar</span>
            </button>
          )}
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

        {/* Confirmation & Missing Questions Warning Modal Before Submission */}
        {confirmSubmitModal && (() => {
          const missingQuestions = activeQuestions
            .map((q, idx) => ({ q, idx, isAnswered: Boolean(answers[q.id]) }))
            .filter((item) => !item.isAnswered);
          const hasMissing = missingQuestions.length > 0;

          return (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                {hasMissing ? (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          ⚠️ Advertencia: Preguntas Faltantes Sin Responder
                        </h3>
                        <p className="text-xs text-amber-900 font-medium mt-1">
                          Tienes <span className="font-bold underline">{missingQuestions.length}</span> de {activeQuestions.length} preguntas sin responder.
                        </p>
                      </div>
                    </div>

                    <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 space-y-2">
                      <p className="leading-relaxed">
                        Si entregas la evaluación ahora, las preguntas sin contestar obtendrán <strong className="text-red-700 font-bold">0.0 puntos (incorrectas)</strong> y se descontarán de tu calificación final.
                      </p>
                      <div>
                        <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-1.5">
                          Preguntas faltantes (clic en un número para ir a responderla):
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {missingQuestions.map((item) => (
                            <button
                              key={item.q.id}
                              type="button"
                              onClick={() => {
                                setCurrentIndex(item.idx);
                                setConfirmSubmitModal(false);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-mono font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                              title={`Ir a responder pregunta #${item.idx + 1}`}
                            >
                              <span>#{item.idx + 1}</span>
                              <span className="text-[10px] text-amber-700 font-normal">Ir ➔</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span>Preguntas respondidas:</span>
                        <strong className="text-emerald-700">{answeredCount} / {activeQuestions.length}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Preguntas sin responder:</span>
                        <strong className="text-red-600 font-bold">{missingQuestions.length}</strong>
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

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const firstMissingIdx = missingQuestions[0]?.idx ?? 0;
                          setCurrentIndex(firstMissingIdx);
                          setConfirmSubmitModal(false);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 cursor-pointer order-2 sm:order-1 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Volver a Responder Faltantes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => finalizeExam(false)}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md order-1 sm:order-2 transition-colors"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>Entregar evaluación ahora</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Confirmar Entrega Definitiva</h3>
                        <p className="text-xs text-slate-600 mt-1">
                          Has respondido el 100% de las preguntas ({activeQuestions.length}/{activeQuestions.length}).
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span>Preguntas respondidas:</span>
                        <strong className="text-emerald-700">{answeredCount} / {activeQuestions.length} (100%)</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Preguntas sin responder:</span>
                        <strong className="text-emerald-700">0 ✓</strong>
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
                        className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Volver al Examen
                      </button>
                      <button
                        type="button"
                        onClick={() => finalizeExam(false)}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>Entregar evaluación ahora</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

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
                }}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
              >
                Entendido, continuar en modo seguro
              </button>
            </div>
          </div>
        )}
        {globalSessionAtRiskModalNode}
        {teacherBlockedModalNode}
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
        {/* Barra Superior de Navegación (Regresar e Ir al Inicio del Panel del Estudiante) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGoBackStudentTab}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Regresar</span>
            </button>

            <button
              type="button"
              onClick={handleGoHomeStudentPanel}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs"
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Ir al inicio del panel del estudiante</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
            <div className="text-left sm:text-right text-xs">
              <div className="font-bold text-slate-900 text-sm">{currentStudent.nombre}</div>
              <div className="font-mono text-slate-500">ID: {currentStudent.id}</div>
            </div>
            <button
              type="button"
              onClick={handleLogoutCurrentStudent}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>

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

          {/* Comprobante Digital de Entrega Verificable con Hash */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-mono text-[10px] font-extrabold uppercase">
                  Recibo Digital Verificable
                </span>
                <span className="font-mono text-xs font-extrabold text-emerald-950">
                  Código Hash: #{finishedResult.firmaVerificacion.slice(-8).toUpperCase()}
                </span>
                {offlineSubmissionQueued && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold">
                    ⏳ En cola de sincronización offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-900">
                Conserve o copie este comprobante como respaldo institucional de su evaluación ({finishedResult.fechaHora}).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const receiptText = `COMPROBANTE OFICIAL DE EVALUACIÓN | Estudiante: ${finishedResult.studentName} (${finishedResult.studentId}) | Modalidad: ${finishedResult.modalidadLabel} (Intento #${finishedResult.intentoNumero}) | Nota: ${finishedResult.notaColombiana.toFixed(1)}/5.0 (${finishedResult.aciertos}/${finishedResult.totalPreguntas}) | Fecha: ${finishedResult.fechaHora} | Hash: ${finishedResult.firmaVerificacion}`;
                navigator.clipboard?.writeText(receiptText).then(() => {
                  setReceiptCopied(true);
                  setTimeout(() => setReceiptCopied(false), 3000);
                }).catch(() => {});
              }}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            >
              {receiptCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>¡Comprobante Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Copiar Comprobante Hash</span>
                </>
              )}
            </button>
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

          {/* Action Buttons: Print Certificate, Request Grade Review Ticket, Start 2nd Attempt, or Return to Student Panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 no-print">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[50px] w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Imprimir Certificado Oficial (PDF)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExamPhase('modality_select');
                  setStudentDashboardTab('mis_notas');
                  openFormalReviewTicketModal({
                    tipo: 'RECALIFICACION_EXAMEN',
                    targetId: finishedResult.modalidad,
                    targetLabel: `${finishedResult.modalidadLabel} (Intento #${finishedResult.intentoNumero})`,
                    notaActual: finishedResult.notaColombiana
                  });
                }}
                className="min-h-[50px] w-full sm:w-auto px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs sm:text-sm font-extrabold text-amber-950 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🎫 Solicitar Revisión de Nota / Reclamo</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {canStartSecondAttempt && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModality(finishedResult.modalidad);
                    setFinishedResult(null);
                    setExamPhase('modality_select');
                    setInductionModalOpen(true);
                  }}
                  className="min-h-[50px] w-full sm:w-auto px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span>Iniciar Segundo Intento (Preguntas Nuevas)</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
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
                className="min-h-[50px] w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>
                  {modStats.count >= 2 || modStats.isExhausted
                    ? 'Volver al Panel Principal (Elegir Otro Examen)'
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

                  <div className="p-3 rounded-lg bg-white/90 border border-slate-200/80 text-slate-700 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <strong className="text-slate-900">Justificación Pedagógica: </strong>
                      {item.justificacion}
                    </div>
                    {!item.acierto && (
                      <button
                        type="button"
                        onClick={() => {
                          setExamPhase('modality_select');
                          setStudentDashboardTab('mis_notas');
                          openFormalReviewTicketModal({
                            tipo: 'RECALIFICACION_EXAMEN',
                            targetId: finishedResult.modalidad,
                            targetLabel: `${finishedResult.modalidadLabel} (Intento #${finishedResult.intentoNumero})`,
                            notaActual: finishedResult.notaColombiana,
                            preguntaReferencia: `Pregunta #${idx + 1} (${item.questionId})`
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 font-bold text-[11px] shrink-0 cursor-pointer"
                      >
                        🎫 Reclamar Pregunta #{idx + 1}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {globalSessionAtRiskModalNode}
        {teacherBlockedModalNode}
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
      {globalSessionAtRiskModalNode}
      {teacherBlockedModalNode}
    </div>
  );
}
