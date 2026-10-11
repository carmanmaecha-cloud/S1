import React, { useState, useMemo, useEffect } from 'react';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  LiveClassroomSession,
  ABProProjectEvaluation,
  SystemConfig,
  BloomLevel,
  CustomMiniRetoTemplate,
  MiniRetoAttemptRecord,
  StudentRetoModuleProgress,
  AntiCheatLogEntry
} from '../types';
import {
  getEffectiveMaxLlamadosAtencion,
  computeStudentServerSummary,
  getActiveExamModalitiesForConfig,
  OFFICIAL_EXAM_MODALITIES
} from '../utils/academicServerSummary';
import { generateDeterministicAccessCode } from '../data/students';
import {
  normalizeQuestionList,
  INITIAL_QUESTIONS,
  equalizeQuestionBank
} from '../data/questions';
import { ABProAndMultiCutGradebook } from './ABProAndMultiCutGradebook';
import { TeacherMiniRetosManager } from './TeacherMiniRetosManager';
import { TeacherExamsStatusManager } from './TeacherExamsStatusManager';
import {
  AcademicClassAttendanceManager,
  LiveAttendanceHubSection,
  ModuleViewTab,
  RecurringScheduleBlocksConfigurator
} from './AcademicClassAttendanceModule';
import { AcademicSummaryDashboard } from './AcademicSummaryDashboard';
import {
  getEffectiveCourseMetadata,
  getEffectiveRegisteredTeachers,
  canTeacherAccessCourse
} from '../utils/universalCourseEngine';
import {
  AcademicDataset,
  buildInitialAcademicDataset,
  computeStudentAcademicSummary,
  normalizeAndSyncAcademicDataset
} from '../data/classAttendanceAndGrades';
import { TeacherGroupStatisticsView } from './TeacherGroupStatisticsView';
import { TeacherRealtimeSummaryPanel } from './TeacherRealtimeSummaryPanel';
import { SystemDiagnosticsPanel } from './SystemDiagnosticsPanel';
import { recordApiRequestDiagnostic } from '../utils/systemDiagnostics';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import { useAuthSession } from '../context/AuthContext';
import type { ForceServerResyncResult } from '../App';
import {
  OFFICIAL_BADGES,
  getEffectiveBadgesForCourse,
  getDefaultRetoProgress
} from '../utils/miniRetosEngine';
import {
  parseStudentsFromExcelOrCsvFile,
  parseDelimitedTextToMatrix,
  extractStudentsFromMatrix,
  mergeImportedStudents,
  parseQuestionsFromAnyFile,
  extractQuestionsFromMatrix,
  downloadExcelFile
} from '../utils/excelParser';
import {
  Lock,
  Mail,
  Key,
  Users,
  Activity,
  FileSpreadsheet,
  BarChart3,
  BookOpen,
  Code2,
  ShieldAlert,
  Plus,
  Edit3,
  Trash2,
  Printer,
  Download,
  Upload,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Copy,
  Check,
  Unlock,
  Layers,
  Monitor,
  Shuffle,
  Database,
  GraduationCap,
  Clock,
  Eye,
  EyeOff,
  Trophy,
  Save,
  Award,
  Home,
  Bell,
  Settings,
  FolderCheck,
  LayoutGrid,
  Sliders,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  ArrowLeft
} from 'lucide-react';
import { ExamModality } from '../types';

interface TeacherPanelProps {
  students: StudentRecord[];
  onUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>>;
  questions: Question[];
  onUpdateQuestions: (next: Question[]) => void;
  previousQuestionsSnapshotCount?: number;
  onUndoQuestionsSnapshot?: () => Promise<number | null>;
  attempts: ExamAttemptResult[];
  onUpdateAttempts: (next: ExamAttemptResult[]) => void;
  abproEvaluations: ABProProjectEvaluation[];
  onUpdateABProEvaluations: (next: ABProProjectEvaluation[]) => void;
  liveSessions: LiveClassroomSession[];
  onReleaseLiveSession: (studentId: string) => void;
  config: SystemConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  onSwitchToStudentLogin?: () => void;
  onSwitchToEditorLogin?: () => void;
  onGoToInitialHome?: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  logoutSignal?: number;
  customMiniRetos?: CustomMiniRetoTemplate[];
  onUpdateCustomMiniRetos?: React.Dispatch<React.SetStateAction<CustomMiniRetoTemplate[]>>;
  academicDataset?: AcademicDataset;
  onUpdateAcademicDataset?: (
    nextDataset: AcademicDataset,
    options?: {
      syncNewStudentToRoster?: StudentRecord;
      removeStudentFromRosterId?: string;
    }
  ) => void;
  onFullSystemRestore?: (payload: {
    students?: StudentRecord[];
    questions?: Question[];
    attempts?: ExamAttemptResult[];
    abproEvaluations?: ABProProjectEvaluation[];
    config?: SystemConfig;
    customMiniRetos?: CustomMiniRetoTemplate[];
    academicDataset?: AcademicDataset;
  }) => Promise<void>;
  onForceServerSync?: () => Promise<ForceServerResyncResult | void> | void;
  lastServerSyncFormatted?: string;
  currentServerRevision?: number;
  serverRevision?: number;
}

type TeacherTab =
  | 'panel_central'
  | 'resumen_academico'
  | 'resumen_asistencia'
  | 'seguridad_convivencia'
  | 'monitor_vivo'
  | 'estudiantes'
  | 'calificaciones'
  | 'gestor_examenes'
  | 'gestion_academica_clases'
  | 'estadisticas_grupo'
  | 'mini_retos'
  | 'consolidado_abpro'
  | 'diagnostico'
  | 'diagnostico_sistema'
  | 'banco_preguntas'
  | 'integraciones'
  | 'seguridad_correo';

export function TeacherPanel({
  students,
  onUpdateStudents,
  questions,
  onUpdateQuestions,
  previousQuestionsSnapshotCount = 0,
  onUndoQuestionsSnapshot,
  attempts,
  onUpdateAttempts,
  abproEvaluations,
  onUpdateABProEvaluations,
  liveSessions,
  onReleaseLiveSession,
  config,
  onUpdateConfig,
  onSwitchToStudentLogin,
  onSwitchToEditorLogin,
  onGoToInitialHome,
  onSessionActiveChange,
  logoutSignal,
  customMiniRetos = [],
  onUpdateCustomMiniRetos = () => {},
  academicDataset,
  onUpdateAcademicDataset,
  onFullSystemRestore,
  onForceServerSync,
  lastServerSyncFormatted,
  currentServerRevision,
  serverRevision
}: TeacherPanelProps) {
  const effectiveServerRevision = currentServerRevision ?? serverRevision ?? 1;
  // Teacher Authentication State (Persisted across page reloads via AuthContext + sessionStorageWrapper)
  const {
    authState,
    loginTeacher,
    logoutTeacher,
    loginStudent,
    loginEditor,
    setTeacherActiveTab
  } = useAuthSession();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => authState.teacherSessionActive
  );
  const [teacherIdAttempt, setTeacherIdAttempt] = useState('');
  const [pinAttempt, setPinAttempt] = useState('');
  const [authDenied, setAuthDenied] = useState(false);
  const [firstLoginPromptOpen, setFirstLoginPromptOpen] = useState(false);

  // Sync teacher session active state with parent App to hide Student Portal while Teacher Session is active
  useEffect(() => {
    onSessionActiveChange?.(isAuthenticated);
  }, [isAuthenticated, onSessionActiveChange]);

  // Respond to parent logout signal
  useEffect(() => {
    if (logoutSignal && logoutSignal > 0) {
      logoutTeacher();
      setIsAuthenticated(false);
      setTeacherIdAttempt('');
      setPinAttempt('');
      setAuthDenied(false);
    }
  }, [logoutSignal, logoutTeacher]);

  // Active Tab (Always starts on clean initial LMS dashboard 'panel_central') & Navigation History
  const [activeTab, setActiveTabState] = useState<TeacherTab>('panel_central');
  const [tabHistory, setTabHistory] = useState<TeacherTab[]>(['panel_central']);
  const [mobileLmsMenuOpen, setMobileLmsMenuOpen] = useState<boolean>(false);
  const [sidebarOpenDesktop, setSidebarOpenDesktop] = useState<boolean>(true);
  const [activeControlDrawer, setActiveControlDrawer] = useState<
    'acceso_pin' | 'horarios_constructor' | 'antitrampa' | 'resumen_vivo' | 'all' | 'none'
  >('none');
  const [calificacionesSubTool, setCalificacionesSubTool] = useState<
    'none' | 'grafico' | 'anticopia' | 'sheets'
  >('none');
  const [calificacionesWorkspaceView, setCalificacionesWorkspaceView] =
    useState<ModuleViewTab>('vista2_por_clase');
  const [dashboardQuickSearch, setDashboardQuickSearch] = useState<string>('');

  // Estados para la vista "Resumen de Asistencia" + Heatmap de Ausentismo del Periodo Académico
  const [attendanceSummaryFilter, setAttendanceSummaryFilter] = useState<
    'ALL' | 'WITH_ABSENCES' | 'CRITICAL' | 'MODERATE' | 'PERFECT'
  >('ALL');
  const [attendanceSummarySearch, setAttendanceSummarySearch] = useState<string>('');
  const [attendanceSummarySort, setAttendanceSummarySort] = useState<
    'MOST_ABSENCES' | 'LOWEST_PCT' | 'ALPHABETICAL'
  >('MOST_ABSENCES');
  const [attendanceHeatmapBlockMode, setAttendanceHeatmapBlockMode] = useState<'ALL' | 'B1' | 'B2'>('ALL');
  const [attendanceHeatmapViewMode, setAttendanceHeatmapViewMode] = useState<
    'DAYS_OVERVIEW' | 'STUDENT_MATRIX'
  >('DAYS_OVERVIEW');
  const [selectedHeatmapClassId, setSelectedHeatmapClassId] = useState<ClassSessionId | null>(null);

  // Estados para la sección "Seguridad y Convivencia" (Filtros por Estado, Tipo de Infracción y Nivel de Severidad)
  const [convivenciaFilter, setConvivenciaFilter] = useState<
    'ALL' | 'WITH_INFRACTIONS' | 'BLOCKED' | 'CLEAN'
  >('ALL');
  const [convivenciaTypeFilter, setConvivenciaTypeFilter] = useState<
    | 'ALL'
    | 'CAMBIO_FOCO'
    | 'DEVTOOLS_INSPECTOR'
    | 'COPIA_PEGADO'
    | 'PANTALLA_DIVIDIDA'
    | 'BIOMETRIA_IA'
    | 'SUPERVISION_DOCENTE'
  >('ALL');
  const [convivenciaSeverityFilter, setConvivenciaSeverityFilter] = useState<
    'ALL' | 'CRITICA' | 'ALTA' | 'LEVE' | 'SIN_INFRACCIONES'
  >('ALL');
  const [manualInfractionTypeDraft, setManualInfractionTypeDraft] = useState<
    | 'CAMBIO_FOCO'
    | 'DEVTOOLS_INSPECTOR'
    | 'COPIA_PEGADO'
    | 'PANTALLA_DIVIDIDA'
    | 'BIOMETRIA_IA'
    | 'SUPERVISION_DOCENTE'
  >('CAMBIO_FOCO');
  const [convivenciaSearch, setConvivenciaSearch] = useState<string>('');
  const [convivenciaNotice, setConvivenciaNotice] = useState<string | null>(null);

  // Estados para Buscador Global / Paleta de Comandos Rápidos (Ctrl + K), Modo «Clase en Curso» (Vista Proyector) y Arquitectura Híbrida Web OS (Bottom Sheets + Inspector Lateral 3 Columnas)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState<string>('');
  const [projectorModeOpen, setProjectorModeOpen] = useState<boolean>(false);
  const [projectorNowMs, setProjectorNowMs] = useState<number>(() => Date.now());
  const [projectorCustomTimerSec, setProjectorCustomTimerSec] = useState<number>(0);
  const [projectorCustomTimerRunning, setProjectorCustomTimerRunning] = useState<boolean>(false);
  const [rightInspectorOpenDesktop, setRightInspectorOpenDesktop] = useState<boolean>(true);
  const [teacherBottomSheet, setTeacherBottomSheet] = useState<
    'none' | 'asistencia_rapida' | 'calificar_tareas' | 'alertas_desbloqueo' | 'menu_apps'
  >('none');
  const [quickRollCallClassId, setQuickRollCallClassId] = useState<ClassSessionId>(1);
  const [quickRollCallBlock, setQuickRollCallBlock] = useState<'B1' | 'B2'>('B1');
  const [quickRollCallMinutes, setQuickRollCallMinutes] = useState<number>(15);
  const [quickTouchFeedbackNotice, setQuickTouchFeedbackNotice] = useState<string | null>(null);

  // Atajo de teclado global Ctrl + K (o Cmd + K) para abrir la Paleta de Comandos Rápidos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reloj en vivo para el Modo «Clase en Curso» (Vista Proyector / Pantalla de Aula)
  useEffect(() => {
    if (!projectorModeOpen) return;
    const iv = window.setInterval(() => {
      setProjectorNowMs(Date.now());
      setProjectorCustomTimerSec((prev) => {
        if (!projectorCustomTimerRunning || prev <= 0) return prev;
        if (prev <= 1) {
          setProjectorCustomTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [projectorModeOpen, projectorCustomTimerRunning]);

  const activeCourseMeta = useMemo(
    () => getEffectiveCourseMetadata(config, authState.teacherAuthenticatedId),
    [config, authState.teacherAuthenticatedId]
  );
  const activeCourseExamModalities = useMemo(
    () => getActiveExamModalitiesForConfig(config),
    [config]
  );
  const examModalities = activeCourseExamModalities;
  const totalExamModalitiesCount = Math.max(1, examModalities.length);
  const activeCourseBadges = useMemo(() => getEffectiveBadgesForCourse(config), [config]);
  const totalRetosCount = Math.max(1, activeCourseBadges.length);

  // Auto-sync teacher's assigned course from universalCoursesCatalog when teacher is logged in
  useEffect(() => {
    if (!isAuthenticated) return;
    const teacherId = (authState.teacherAuthenticatedId || '')
      .trim()
      .replace(/[\s.-]/g, '')
      .toUpperCase();
    if (!teacherId) return;

    const catalog = Array.isArray(config.universalCoursesCatalog)
      ? config.universalCoursesCatalog.filter((w) => w && w.meta && w.meta.courseId)
      : [];
    if (catalog.length === 0) return;

    const teachersList = Array.isArray(config.registeredTeachers) ? config.registeredTeachers : [];
    const teacherRec = teachersList.find(
      (t) => String(t?.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === teacherId
    );

    const matchesTeacher = (meta: typeof activeCourseMeta) => {
      if (
        meta?.docenteAsignadoId &&
        String(meta.docenteAsignadoId || '').trim().replace(/[\s.-]/g, '').toUpperCase() === teacherId
      ) {
        return true;
      }
      if (
        Array.isArray(meta?.docentesAutorizadosIds) &&
        meta.docentesAutorizadosIds.some(
          (id) => String(id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === teacherId
        )
      ) {
        return true;
      }
      if (
        teacherRec &&
        Array.isArray(teacherRec.cursosAsignadosIds) &&
        teacherRec.cursosAsignadosIds.includes(meta.courseId)
      ) {
        return true;
      }
      return false;
    };

    const currentActiveInCat = catalog.find((w) => w.meta.courseId === config.activeCourseId);
    const targetWorkspace =
      currentActiveInCat && matchesTeacher(currentActiveInCat.meta)
        ? currentActiveInCat
        : catalog.find((w) => matchesTeacher(w.meta));

    if (!targetWorkspace) return;

    const needsCourseSwitch =
      config.activeCourseId !== targetWorkspace.meta.courseId ||
      config.activeCourseMeta?.courseId !== targetWorkspace.meta.courseId ||
      (config.activeCourseMeta?.modulosCurso?.length || 0) !==
        (targetWorkspace.meta.modulosCurso?.length || 0) ||
      config.activeCourseMeta?.updatedAtIso !== targetWorkspace.meta.updatedAtIso;

    if (needsCourseSwitch) {
      const switchingDifferentCourse = config.activeCourseId !== targetWorkspace.meta.courseId;
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: targetWorkspace.meta.courseId,
        activeCourseMeta: targetWorkspace.meta
      }));
      if (
        Array.isArray(targetWorkspace.questions) &&
        (switchingDifferentCourse ||
          (questions.length === 0 && targetWorkspace.questions.length > 0))
      ) {
        onUpdateQuestions(targetWorkspace.questions);
      }
      if (
        switchingDifferentCourse &&
        Array.isArray(targetWorkspace.students) &&
        targetWorkspace.students.length > 0
      ) {
        onUpdateStudents(targetWorkspace.students);
      }
      if (
        switchingDifferentCourse &&
        Array.isArray(targetWorkspace.attempts) &&
        targetWorkspace.attempts.length > 0
      ) {
        onUpdateAttempts(targetWorkspace.attempts);
      }
      if (
        Array.isArray(targetWorkspace.customMiniRetos) &&
        targetWorkspace.customMiniRetos.length > 0
      ) {
        onUpdateCustomMiniRetos(targetWorkspace.customMiniRetos);
      }
    } else if (
      Array.isArray(targetWorkspace.customMiniRetos) &&
      targetWorkspace.customMiniRetos.length > 0
    ) {
      const isMarketing =
        targetWorkspace.meta.courseId === 'COURSE-MARKETING-2026' ||
        targetWorkspace.meta.nombreCurso.toLowerCase().includes('marketing');
      const currentLooksLikeDefaultMarketing =
        !isMarketing &&
        customMiniRetos.length > 0 &&
        customMiniRetos.every((r) => String(r.id || '').startsWith('RETO-DOC-M'));
      if (customMiniRetos.length === 0 || currentLooksLikeDefaultMarketing) {
        onUpdateCustomMiniRetos(targetWorkspace.customMiniRetos);
      }
    }
  }, [
    isAuthenticated,
    authState.teacherAuthenticatedId,
    config.universalCoursesCatalog,
    config.activeCourseId,
    config.activeCourseMeta?.courseId,
    config.activeCourseMeta?.updatedAtIso
  ]);
  const effectiveAcademicDataset = useMemo(
    () =>
      normalizeAndSyncAcademicDataset(
        academicDataset || buildInitialAcademicDataset(students),
        students,
        activeCourseMeta.modulosCurso,
        activeCourseMeta.nombreCurso
      ),
    [academicDataset, students, activeCourseMeta.modulosCurso, activeCourseMeta.nombreCurso]
  );

  const setActiveTab = (tab: TeacherTab) => {
    setActiveTabState((prev) => {
      if (prev !== tab) {
        setTabHistory((hist) => [...hist.slice(-12), tab]);
      }
      return tab;
    });
    setTeacherActiveTab(tab);
    setMobileLmsMenuOpen(false);
    setActiveControlDrawer('none');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoToInitialScreen = () => {
    setActiveTab('panel_central');
  };

  const handleNavigateBack = () => {
    if (activeControlDrawer !== 'none') {
      setActiveControlDrawer('none');
      return;
    }
    if (tabHistory.length > 1) {
      const nextHistory = tabHistory.slice(0, -1);
      const previousTab = nextHistory[nextHistory.length - 1] || 'panel_central';
      setTabHistory(nextHistory);
      setActiveTabState(previousTab);
      setTeacherActiveTab(previousTab);
      setMobileLmsMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setActiveTab('panel_central');
    }
  };

  // Inline Quick Access Code Editor state + per-row pendingChange drafts & Guardando... state
  const [inlineEditingCodeStudentId, setInlineEditingCodeStudentId] = useState<string | null>(null);
  const [inlineCodeInputValue, setInlineCodeInputValue] = useState<string>('');
  const [studentCodeDrafts, setStudentCodeDrafts] = useState<Record<string, string>>({});
  const [savingStudentCodeId, setSavingStudentCodeId] = useState<string | null>(null);
  const [isSavingStudentModal, setIsSavingStudentModal] = useState<boolean>(false);
  const [studentUpdateBanner, setStudentUpdateBanner] = useState<string | null>(null);
  const [isSyncingInlineSave, setIsSyncingInlineSave] = useState<boolean>(false);
  const {
    dirtySections,
    isGlobalSaving,
    markSectionDirty,
    clearDirtyState,
    handleExecuteServerSave
  } = useServerSave();

  const [isForcingServerResync, setIsForcingServerResync] = useState<boolean>(false);
  const [forceResyncResult, setForceResyncResult] = useState<ForceServerResyncResult | null>(null);

  // Editable Config fields with explicit local pendingChange & Guardando... states
  const [pinAulaDraft, setPinAulaDraft] = useState<string>(config.pinAulaDia || 'AULA26');
  const [isSavingPinAula, setIsSavingPinAula] = useState<boolean>(false);
  const [mensajeSalaDraft, setMensajeSalaDraft] = useState<string>(config.mensajeSalaEspera || '');
  const [isSavingMensajeSala, setIsSavingMensajeSala] = useState<boolean>(false);
  const [examParamsDraft, setExamParamsDraft] = useState({
    preguntasExamenIntegral: config.preguntasExamenIntegral ?? 40,
    tiempoExamenIntegralMin: config.tiempoExamenIntegralMin ?? 80,
    preguntasExamenModulo: config.preguntasExamenModulo ?? 25,
    tiempoExamenModuloMin: config.tiempoExamenModuloMin ?? 50,
    notaMinimaAprobacion: config.notaMinimaAprobacion ?? 3.0
  });
  const [isSavingExamParams, setIsSavingExamParams] = useState<boolean>(false);
  const [isSavingEmail, setIsSavingEmail] = useState<boolean>(false);
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);
  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);

  useEffect(() => {
    setPinAulaDraft(config.pinAulaDia || 'AULA26');
  }, [config.pinAulaDia]);

  useEffect(() => {
    setMensajeSalaDraft(config.mensajeSalaEspera || '');
  }, [config.mensajeSalaEspera]);

  useEffect(() => {
    setExamParamsDraft({
      preguntasExamenIntegral: config.preguntasExamenIntegral ?? 40,
      tiempoExamenIntegralMin: config.tiempoExamenIntegralMin ?? 80,
      preguntasExamenModulo: config.preguntasExamenModulo ?? 25,
      tiempoExamenModuloMin: config.tiempoExamenModuloMin ?? 50,
      notaMinimaAprobacion: config.notaMinimaAprobacion ?? 3.0
    });
  }, [
    config.preguntasExamenIntegral,
    config.tiempoExamenIntegralMin,
    config.preguntasExamenModulo,
    config.tiempoExamenModuloMin,
    config.notaMinimaAprobacion
  ]);

  // Auditoría por Estudiante (Sección integrada en Gestión de Estudiantes + Modal de Inspección)
  const [selectedAuditStudentId, setSelectedAuditStudentId] = useState<string>(() => {
    const withAttempt = attempts[0]?.studentId;
    return withAttempt || students[0]?.id || '';
  });
  const [auditModalStudentId, setAuditModalStudentId] = useState<string | null>(null);
  const [auditActiveMode, setAuditActiveMode] = useState<'examenes' | 'retos'>('examenes');
  const [auditExamModalityFilter, setAuditExamModalityFilter] = useState<ExamModality | 'ALL'>('ALL');
  const [auditRetoModuloFilter, setAuditRetoModuloFilter] = useState<1 | 2 | 3 | 4 | 5 | 'ALL'>('ALL');
  const [confirmDeleteExamAttemptId, setConfirmDeleteExamAttemptId] = useState<string | null>(null);
  const [confirmDeleteRetoAttemptId, setConfirmDeleteRetoAttemptId] = useState<string | null>(null);
  const [deletingAuditAttemptId, setDeletingAuditAttemptId] = useState<string | null>(null);
  const deletingExamAttemptId = deletingAuditAttemptId;
  const deletingRetoAttemptId = deletingAuditAttemptId;
  const [auditActionNotice, setAuditActionNotice] = useState<string | null>(null);

  // Ensure selectedAuditStudentId always points to a valid student
  useEffect(() => {
    if (students.length > 0 && !students.some((s) => s.id === selectedAuditStudentId)) {
      setSelectedAuditStudentId(students[0].id);
    }
  }, [students, selectedAuditStudentId]);

  // Delete a specific Exam Attempt (Borrar intento de examen) and recalculate student's attempt counter & used questions
  const handleDeleteSpecificExamAttempt = async (attemptToDelete: ExamAttemptResult) => {
    setDeletingAuditAttemptId(attemptToDelete.attemptId);
    try {
      const remainingAttempts = attempts.filter((a) => a.attemptId !== attemptToDelete.attemptId);
      const remainingForStudent = remainingAttempts
        .filter((a) => a.studentId === attemptToDelete.studentId)
        .sort((a, b) => a.timestampMs - b.timestampMs);

      // Re-number remaining attempts per modality if Attempt 1 was deleted and Attempt 2 remains
      const renumberedAttempts = remainingAttempts.map((a) => {
        if (
          a.studentId === attemptToDelete.studentId &&
          (a.modalidad || 'integral') === (attemptToDelete.modalidad || 'integral')
        ) {
          const modList = remainingForStudent.filter(
            (x) => (x.modalidad || 'integral') === (attemptToDelete.modalidad || 'integral')
          );
          const idx = modList.findIndex((x) => x.attemptId === a.attemptId);
          return {
            ...a,
            intentoNumero: (idx === 0 ? 1 : 2) as 1 | 2
          };
        }
        return a;
      });

      let updatedStudentRecord: StudentRecord | undefined;
      const nextStudents = students.map((st) => {
        if (st.id !== attemptToDelete.studentId) return st;
        const modRemaining = remainingForStudent.filter(
          (x) => (x.modalidad || 'integral') === (attemptToDelete.modalidad || 'integral')
        );
        const usedInMod = Array.from(
          new Set(modRemaining.flatMap((x) => (x.respuestasDetalle || []).map((r) => r.questionId)))
        );
        const anySuspendedLeft = remainingForStudent.some((x) => x.estado === 'SUSPENDIDO');

        updatedStudentRecord = {
          ...st,
          intentosUsados: remainingForStudent.length,
          suspendido: anySuspendedLeft ? st.suspendido : false,
          conceptoInfraccion: anySuspendedLeft ? st.conceptoInfraccion : '✓ Sin infracciones',
          preguntasUsadasPorModalidad: {
            ...(st.preguntasUsadasPorModalidad || {}),
            [attemptToDelete.modalidad || 'integral']: usedInMod
          }
        };
        return updatedStudentRecord;
      });

      onUpdateAttempts(renumberedAttempts);
      commitTeacherStudentsUpdate(
        nextStudents,
        updatedStudentRecord,
        `✓ Intento #${attemptToDelete.intentoNumero} de "${attemptToDelete.modalidadLabel}" eliminado para ${attemptToDelete.studentName}.`
      );
      await handleExecuteServerSave(
        'auditoria_examen_borrado',
        `Intento de examen borrado (${attemptToDelete.studentName})`
      );
      setConfirmDeleteExamAttemptId(null);
      setAuditActionNotice(
        `✓ Se borró el Intento #${attemptToDelete.intentoNumero} de "${attemptToDelete.modalidadLabel}" (${attemptToDelete.notaColombiana.toFixed(1)} / 5.0) y el servidor confirmó la persistencia.`
      );
    } finally {
      setDeletingAuditAttemptId(null);
    }
  };

  // Delete a specific Mini-Reto Attempt (Borrar intento del reto) and recalculate student's module progress
  const handleDeleteSpecificRetoAttempt = async (
    studentId: string,
    attemptId: string,
    modulo: 1 | 2 | 3 | 4 | 5
  ) => {
    setDeletingAuditAttemptId(attemptId);
    try {
      const threshold = Number(config.umbralAprobacionMiniRetoPct) || 60;
      let updatedStudentRecord: StudentRecord | undefined;

      const nextStudents = students.map((st) => {
        if (st.id !== studentId) return st;
        const baseMap = getDefaultRetoProgress();
        const currentProg = st.progresoRetos?.[modulo] || baseMap[modulo];
        const remainingModAttempts = (currentProg.historialIntentos || []).filter(
          (a) => a && a.attemptId !== attemptId
        );
        const remainingGlobal = (st.historialIntentosRetos || []).filter(
          (a) => a && a.attemptId !== attemptId
        );
        const bestPct =
          remainingModAttempts.length > 0
            ? Math.max(...remainingModAttempts.map((a) => Number(a.porcentajeIA) || 0))
            : 0;
        const anyApproved = remainingModAttempts.some(
          (a) => a.aprobado || Number(a.porcentajeIA) >= threshold
        );
        const anySuspended = remainingModAttempts.some((a) => Boolean(a.suspendidoPorTrampa));
        const usedCount = remainingModAttempts.length;

        const nextModProg: StudentRetoModuleProgress = {
          ...currentProg,
          modulo,
          intentosUsados: usedCount,
          maxIntentos: currentProg.maxIntentos || 3,
          insigniaDesbloqueada: anyApproved,
          mejorPorcentaje: bestPct,
          bloqueadoPorFallo: !anyApproved && usedCount >= (currentProg.maxIntentos || 3),
          suspendidoPorTrampa: anySuspended,
          motivoSuspensionReto: anySuspended ? currentProg.motivoSuspensionReto : undefined,
          preguntasRetoUsadas: remainingModAttempts.map((a) => a.sourceQuestionId).filter(Boolean),
          mecanicasUsadas: remainingModAttempts.map((a) => a.mecanicaId).filter(Boolean),
          historialIntentos: remainingModAttempts
        };

        updatedStudentRecord = {
          ...st,
          progresoRetos: {
            ...baseMap,
            ...(st.progresoRetos || {}),
            [modulo]: nextModProg
          },
          historialIntentosRetos: remainingGlobal
        };
        return updatedStudentRecord;
      });

      commitTeacherStudentsUpdate(
        nextStudents,
        updatedStudentRecord,
        `✓ Intento del Reto (Módulo ${modulo}) eliminado y cupo habilitado en la Base de Datos del Servidor.`
      );
      await handleExecuteServerSave(
        'auditoria_reto_borrado',
        `Intento de reto borrado (Módulo ${modulo})`
      );
      setConfirmDeleteRetoAttemptId(null);
      setAuditActionNotice(
        `✓ Se borró el intento de reto del Módulo ${modulo} y el servidor confirmó la persistencia.`
      );
    } finally {
      setDeletingAuditAttemptId(null);
    }
  };

  /**
   * Centralized Teacher Update Functions:
   * Explicitly trigger both parent React state updates AND direct authoritative server writes
   * so no modification to student data, access codes, or exam configs ever stays only local.
   */
  const commitTeacherStudentsUpdate = (
    nextStudents: StudentRecord[],
    singleUpdatedStudent?: StudentRecord,
    confirmationMessage?: string
  ) => {
    onUpdateStudents(nextStudents);
    if (singleUpdatedStudent) {
      const t0 = performance.now();
      const ep = `/api/state/student/${encodeURIComponent(singleUpdatedStudent.id)}`;
      fetch(ep, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: singleUpdatedStudent })
      })
        .then((res) => {
          recordApiRequestDiagnostic({
            method: 'PATCH',
            endpoint: ep,
            status: res.status,
            ok: res.ok,
            latencyMs: Math.max(1, Math.round(performance.now() - t0)),
            source: 'express_api',
            revision: effectiveServerRevision
          });
        })
        .catch(() => {});
    }
    const t1 = performance.now();
    fetch('/api/state/students', {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: nextStudents })
    })
      .then((res) => {
        recordApiRequestDiagnostic({
          method: 'PUT',
          endpoint: '/api/state/students',
          status: res.status,
          ok: res.ok,
          latencyMs: Math.max(1, Math.round(performance.now() - t1)),
          source: 'express_api',
          revision: effectiveServerRevision
        });
      })
      .catch(() => {});

    if (confirmationMessage) {
      setStudentUpdateBanner(confirmationMessage);
      setTimeout(() => setStudentUpdateBanner(null), 5000);
    }
  };

  const commitTeacherConfigUpdate = (nextConfig: SystemConfig) => {
    onUpdateConfig(nextConfig);
    const t0 = performance.now();
    fetch('/api/state/config', {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: nextConfig })
    })
      .then((res) => {
        recordApiRequestDiagnostic({
          method: 'PUT',
          endpoint: '/api/state/config',
          status: res.status,
          ok: res.ok,
          latencyMs: Math.max(1, Math.round(performance.now() - t0)),
          source: 'express_api',
          revision: effectiveServerRevision
        });
      })
      .catch(() => {});
  };

  // Print Mode ('none' | 'fichas_aula' | 'acta_oficial' | 'examen_papel_plan_b')
  const [printMode, setPrintMode] = useState<
    'none' | 'fichas_aula' | 'acta_oficial' | 'examen_papel_plan_b'
  >('none');
  const [showBankAuditorModal, setShowBankAuditorModal] = useState(false);
  const [manualUnlockNotice, setManualUnlockNotice] = useState<string | null>(null);

  // Students CRUD, Batch Delete, Reset Attempts Count, & Per-Student Exam Block
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'sin_presentar' | 'con_intentos' | 'suspendidos'>('all');
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetAllowedAttemptsInput, setResetAllowedAttemptsInput] = useState<1 | 2>(2);
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null);
  const [selectedStudentIdsForBatch, setSelectedStudentIdsForBatch] = useState<string[]>([]);
  const [confirmBatchDeleteStudents, setConfirmBatchDeleteStudents] = useState(false);
  const [examBlockModalStudentId, setExamBlockModalStudentId] = useState<string | null>(null);
  const [batchExamBlockModalOpen, setBatchExamBlockModalOpen] = useState(false);
  const [batchExamBlockNotice, setBatchExamBlockNotice] = useState<string | null>(null);

  // Batch / Selection Access Code Editor ("Editar Código de Acceso para Todos o Seleccionados")
  const [batchAccessCodeModalOpen, setBatchAccessCodeModalOpen] = useState(false);
  const [batchCodeScope, setBatchCodeScope] = useState<'all' | 'selected'>('all');
  const [batchCodeStrategy, setBatchCodeStrategy] = useState<
    'unified' | 'prefix_doc4' | 'prefix_seq' | 'deterministic' | 'custom_table'
  >('unified');
  const [batchCodeBaseInput, setBatchCodeBaseInput] = useState('MM26DORADA');
  const [batchCodeCustomDrafts, setBatchCodeCustomDrafts] = useState<Record<string, string>>({});
  const [batchCodeStudentSearch, setBatchCodeStudentSearch] = useState('');
  const [batchCodeFeedback, setBatchCodeFeedback] = useState<string | null>(null);
  const [isSavingBatchCodes, setIsSavingBatchCodes] = useState(false);

  // Consolidated Grades Filters & Expanded Student Detail (All Exams & Attempts: Realizados + Pendientes)
  const [consolidatedSearch, setConsolidatedSearch] = useState('');
  const [consolidatedModalityFilter, setConsolidatedModalityFilter] = useState<'ALL' | ExamModality>('ALL');
  const [consolidatedStatusFilter, setConsolidatedStatusFilter] = useState<
    'all' | 'con_realizados' | 'con_pendientes' | 'sin_ningun_examen' | 'aprobados' | 'reprobados'
  >('all');
  const [expandedConsolidatedStudentId, setExpandedConsolidatedStudentId] = useState<string | null>(null);

  // Escucha activa de cambios en el estado global de estudiantes (Single Source of Truth)
  // Fuerza la limpieza inmediata de selecciones locales o modales de estudiantes eliminados
  const [studentRosterSyncPulse, setStudentRosterSyncPulse] = useState(0);
  useEffect(() => {
    setStudentRosterSyncPulse((p) => p + 1);
    const validIds = new Set(students.map((s) => s.id));
    setSelectedStudentIdsForBatch((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
    if (selectedAuditStudentId && !validIds.has(selectedAuditStudentId)) {
      setSelectedAuditStudentId(students[0]?.id || '');
    }
    if (auditModalStudentId && !validIds.has(auditModalStudentId)) {
      setAuditModalStudentId(null);
    }
    if (examBlockModalStudentId && !validIds.has(examBlockModalStudentId)) {
      setExamBlockModalStudentId(null);
    }
    if (expandedConsolidatedStudentId && !validIds.has(expandedConsolidatedStudentId)) {
      setExpandedConsolidatedStudentId(null);
    }
  }, [students]);

  // Master Exam State (Estado Maestro del Examen: ABIERTO / CERRADO por Estudiante o Para Todos)
  const [masterExamSelectorModalOpen, setMasterExamSelectorModalOpen] = useState(false);
  const [masterExamStudentSearch, setMasterExamStudentSearch] = useState('');
  const [masterExamFilter, setMasterExamFilter] = useState<'all' | 'abierto' | 'cerrado'>('all');
  const [masterExamSelectedIds, setMasterExamSelectedIds] = useState<string[]>([]);
  const [masterExamNotice, setMasterExamNotice] = useState<string | null>(null);

  // Retroalimentación (INMEDIATA / DIFERIDA por Estudiante o Para Todos)
  const [feedbackSelectorModalOpen, setFeedbackSelectorModalOpen] = useState(false);
  const [feedbackStudentSearch, setFeedbackStudentSearch] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'inmediata' | 'diferida'>('all');
  const [feedbackSelectedIds, setFeedbackSelectedIds] = useState<string[]>([]);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Desglose Pregunta x Pregunta (HABILITADO / DESHABILITADO por Estudiante o Para Todos + Días y Horas disponibles)
  const [breakdownSelectorModalOpen, setBreakdownSelectorModalOpen] = useState(false);
  const [breakdownStudentSearch, setBreakdownStudentSearch] = useState('');
  const [breakdownFilter, setBreakdownFilter] = useState<'all' | 'habilitado' | 'deshabilitado'>('all');
  const [breakdownSelectedIds, setBreakdownSelectedIds] = useState<string[]>([]);
  const [breakdownNotice, setBreakdownNotice] = useState<string | null>(null);

  // Student Modal (Add / Edit)
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [formStudentId, setFormStudentId] = useState('');
  const [formStudentName, setFormStudentName] = useState('');
  const [formStudentCode, setFormStudentCode] = useState('');
  const [formStudentEmail, setFormStudentEmail] = useState('');
  const [formStudentWhatsapp, setFormStudentWhatsapp] = useState('');
  const [studentModalError, setStudentModalError] = useState<string | null>(null);

  // Bulk Import Students Modal
  const [bulkStudentModalOpen, setBulkStudentModalOpen] = useState(false);
  const [bulkStudentText, setBulkStudentText] = useState('');
  const [bulkStudentMode, setBulkStudentMode] = useState<'merge' | 'replace'>('merge');
  const [bulkImportStatus, setBulkImportStatus] = useState<string | null>(null);
  const [bulkDraftRows, setBulkDraftRows] = useState<
    { id: string; nombre: string; correo: string; whatsapp: string; codigoAcceso: string }[]
  >([
    { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' },
    { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' },
    { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' }
  ]);

  // Questions Bank Filters & CRUD
  const [qSearch, setQSearch] = useState('');
  const [qModFilter, setQModFilter] = useState<number | 'all'>('all');
  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [formQId, setFormQId] = useState('');
  const [formQMod, setFormQMod] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formQTipoPregunta, setFormQTipoPregunta] = useState('Selección Múltiple con Única Respuesta');
  const [formQRap, setFormQRap] = useState('');
  const [formQContexto, setFormQContexto] = useState('');
  const [formQTema, setFormQTema] = useState('');
  const [formQBloom, setFormQBloom] = useState<BloomLevel>('Aplicación');
  const [formQEnunciado, setFormQEnunciado] = useState('');
  const [formQA, setFormQA] = useState('');
  const [formQB, setFormQB] = useState('');
  const [formQC, setFormQC] = useState('');
  const [formQD, setFormQD] = useState('');
  const [formQCorrecta, setFormQCorrecta] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [formQJustificacion, setFormQJustificacion] = useState('');
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);

  // Bulk Question Import Modal & Advanced Bank Controls
  const [bulkQModalOpen, setBulkQModalOpen] = useState(false);
  const [bulkQText, setBulkQText] = useState('');
  const [bulkQMode, setBulkQMode] = useState<'replace' | 'append'>('replace');
  const [bulkQFeedback, setBulkQFeedback] = useState<string | null>(null);
  const [showQStructureModal, setShowQStructureModal] = useState(false);
  const [confirmClearAllQuestions, setConfirmClearAllQuestions] = useState(false);
  const [confirmRestoreOfficialBank, setConfirmRestoreOfficialBank] = useState(false);
  const [previousQuestionsSnapshot, setPreviousQuestionsSnapshot] = useState<Question[] | null>(
    null
  );
  const [qPageSize, setQPageSize] = useState<number>(50);
  const [qCurrentPage, setQCurrentPage] = useState<number>(1);
  const [bankActionNotice, setBankActionNotice] = useState<string | null>(null);
  const [copiedStructureFormat, setCopiedStructureFormat] = useState<'csv' | 'json' | null>(null);

  // Security & Password Change Form
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [passChangeStatus, setPassChangeStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [emailInput, setEmailInput] = useState(() => String(config.correoRecuperacion || ''));
  const [emailSaveStatus, setEmailSaveStatus] = useState<string | null>(null);

  // Webhook Tester & Copy States
  const [webhookUrlInput, setWebhookUrlInput] = useState(() => String(config.webhookUrl || ''));
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [copiedAppsScript, setCopiedAppsScript] = useState(false);
  const [copiedBlogger, setCopiedBlogger] = useState(false);

  // Classroom Projector Mode (Full screen clean view for VideoBeam)
  const [projectorMode, setProjectorMode] = useState(false);

  // Google Sheets Retry Queue & Full System Backup (.evaluaplus.json)
  const [retrySyncStatus, setRetrySyncStatus] = useState<string | null>(null);
  const [backupRestoreStatus, setBackupRestoreStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    setEmailInput(config.correoRecuperacion || '');
  }, [config.correoRecuperacion]);

  useEffect(() => {
    setWebhookUrlInput(config.webhookUrl || '');
  }, [config.webhookUrl]);

  const handleExecuteForceServerResync = async () => {
    if (isForcingServerResync) return;
    setIsForcingServerResync(true);
    try {
      clearDirtyState();
      setStudentCodeDrafts({});
      setInlineEditingCodeStudentId(null);
      setInlineCodeInputValue('');
      setStudentUpdateBanner(null);

      const res = await onForceServerSync?.();
      if (res && typeof res === 'object') {
        setForceResyncResult(res);
      } else {
        setForceResyncResult({
          ok: true,
          syncedAtFormatted: new Date().toLocaleTimeString('es-CO'),
          revision: 1,
          questionsRevision: 1,
          clearedKeysCount: 9,
          counts: {
            students: students.length,
            questions: questions.length,
            attempts: attempts.length,
            abproEvaluations: abproEvaluations.length,
            liveSessions: liveSessions.length,
            customMiniRetos: customMiniRetos.length
          }
        });
      }
    } finally {
      setIsForcingServerResync(false);
    }
  };

  // Login Handler (Supports Master Teacher, Editor-assigned Teachers, Editor redirect, and Student auto-routing)
  const handleTeacherLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedId = (config.idDocente || 'DOCENTE2026').trim().toUpperCase();
    const enteredId = teacherIdAttempt.trim().replace(/[\s.-]/g, '').toUpperCase();
    const enteredPin = pinAttempt.trim();

    // Check if the user entered the Editor credentials
    const expectedEditorUser = (config.editorUsuario || 'EDITOR2026').trim().toUpperCase();
    const expectedEditorPass = (config.editorClave || 'EDITOR2026').trim();
    if (
      Boolean(enteredId && enteredPin) &&
      enteredId === expectedEditorUser &&
      enteredPin === expectedEditorPass
    ) {
      setAuthDenied(false);
      loginEditor(enteredId);
      onSwitchToEditorLogin?.();
      return;
    }

    // Check if a student accidentally entered their valid Student ID + Access Code on the Teacher Login form
    const matchedStudent = students.find(
      (s) => (s.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === enteredId
    );
    if (
      matchedStudent &&
      (matchedStudent.codigoAcceso || '').trim().toUpperCase() === enteredPin.toUpperCase()
    ) {
      setAuthDenied(false);
      loginStudent(matchedStudent.id);
      onSwitchToStudentLogin?.();
      return;
    }

    // Check registered teachers created/assigned in the Editor Panel
    const allTeachers = getEffectiveRegisteredTeachers(config);
    const matchedRegisteredTeacher = allTeachers.find(
      (t) =>
        t.activo !== false &&
        (t.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === enteredId &&
        (t.claveAcceso || '').trim() === enteredPin
    );

    // Also check if credentials match any course's directly assigned teacher (docenteAsignadoId + docenteAsignadoClave)
    const catalog = Array.isArray(config.universalCoursesCatalog)
      ? config.universalCoursesCatalog.filter((w) => w && w.meta && w.meta.courseId)
      : [];
    const matchedCourseWorkspace = catalog.find((w) => {
      const cTeacherId = (w.meta.docenteAsignadoId || '')
        .trim()
        .replace(/[\s.-]/g, '')
        .toUpperCase();
      const cTeacherPass = (w.meta.docenteAsignadoClave || '').trim();
      if (cTeacherId && cTeacherId === enteredId && cTeacherPass && cTeacherPass === enteredPin) {
        return true;
      }
      if (matchedRegisteredTeacher) {
        if (cTeacherId === enteredId) return true;
        if (
          Array.isArray(matchedRegisteredTeacher.cursosAsignadosIds) &&
          matchedRegisteredTeacher.cursosAsignadosIds.includes(w.meta.courseId)
        ) {
          return true;
        }
      }
      return false;
    });

    const isMasterMatch =
      Boolean(enteredId && enteredPin) &&
      (enteredId === expectedId || enteredId === 'DOCENTE2026') &&
      enteredPin === config.claveDocente;

    if (!isMasterMatch && !matchedRegisteredTeacher && !matchedCourseWorkspace) {
      setAuthDenied(true);
      return;
    }

    const authenticatedTeacherId =
      matchedRegisteredTeacher?.id ||
      matchedCourseWorkspace?.meta.docenteAsignadoId ||
      enteredId;

    if (matchedCourseWorkspace) {
      const switchingCourse = config.activeCourseId !== matchedCourseWorkspace.meta.courseId;
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: matchedCourseWorkspace.meta.courseId,
        activeCourseMeta: matchedCourseWorkspace.meta
      }));
      if (
        Array.isArray(matchedCourseWorkspace.questions) &&
        (switchingCourse ||
          (questions.length === 0 && matchedCourseWorkspace.questions.length > 0))
      ) {
        onUpdateQuestions(matchedCourseWorkspace.questions);
      }
      if (
        switchingCourse &&
        Array.isArray(matchedCourseWorkspace.students) &&
        matchedCourseWorkspace.students.length > 0
      ) {
        onUpdateStudents(matchedCourseWorkspace.students);
      }
      if (
        switchingCourse &&
        Array.isArray(matchedCourseWorkspace.attempts) &&
        matchedCourseWorkspace.attempts.length > 0
      ) {
        onUpdateAttempts(matchedCourseWorkspace.attempts);
      }
      if (
        Array.isArray(matchedCourseWorkspace.customMiniRetos) &&
        matchedCourseWorkspace.customMiniRetos.length > 0
      ) {
        onUpdateCustomMiniRetos(matchedCourseWorkspace.customMiniRetos);
      }
    }

    setAuthDenied(false);
    setIsAuthenticated(true);
    setActiveTabState('panel_central');
    setTabHistory(['panel_central']);
    setActiveControlDrawer('none');
    loginTeacher(authenticatedTeacherId);
    onForceServerSync?.();
    if (
      isMasterMatch &&
      config.claveDocente === 'DOCENTE2026' &&
      config.requiereCambioClaveInicial !== false
    ) {
      setFirstLoginPromptOpen(true);
    }
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const q = studentSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.nombre.toLowerCase().includes(q) ||
        s.codigoAcceso.toLowerCase().includes(q) ||
        (s.correo || '').toLowerCase().includes(q) ||
        (s.whatsapp || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (studentStatusFilter === 'sin_presentar') return s.intentosUsados === 0 && !s.suspendido;
      if (studentStatusFilter === 'con_intentos') return s.intentosUsados > 0 && !s.suspendido;
      if (studentStatusFilter === 'suspendidos') return s.suspendido;
      return true;
    });
  }, [students, studentSearch, studentStatusFilter]);

  // Anti-Copy / Collusion Detection Algorithm across Attempts
  const antiCopyAlerts = useMemo(() => {
    const alerts: {
      studentA: string;
      studentB: string;
      similarityPct: number;
      timeDiffSeconds: number;
      modalidad: string;
    }[] = [];

    for (let i = 0; i < attempts.length; i++) {
      for (let j = i + 1; j < attempts.length; j++) {
        const a1 = attempts[i];
        const a2 = attempts[j];
        if (a1.studentId === a2.studentId) continue;

        const timeDiffSec = Math.abs(a1.timestampMs - a2.timestampMs) / 1000;
        // Check if submitted within 4 minutes of each other
        if (timeDiffSec <= 240) {
          const map1 = new Map(a1.respuestasDetalle.map((r) => [r.questionId, r.elegida]));
          let sharedQuestions = 0;
          let identicalAnswers = 0;
          a2.respuestasDetalle.forEach((r2) => {
            if (map1.has(r2.questionId) && r2.elegida !== null) {
              sharedQuestions++;
              if (map1.get(r2.questionId) === r2.elegida) {
                identicalAnswers++;
              }
            }
          });

          if (sharedQuestions >= 5) {
            const sim = Math.round((identicalAnswers / sharedQuestions) * 100);
            if (sim >= 85) {
              alerts.push({
                studentA: `${a1.studentName} (${a1.studentId})`,
                studentB: `${a2.studentName} (${a2.studentId})`,
                similarityPct: sim,
                timeDiffSeconds: Math.round(timeDiffSec),
                modalidad: a1.modalidadLabel
              });
            }
          }
        }
      }
    }
    return alerts;
  }, [attempts]);

  // Consolidated Academic Report per Student (All 6 Exams & Attempts: Realizados + Pendientes/Sin presentar)
  const consolidatedGrades = useMemo(() => {
    const notaMinAprob = config.notaMinimaAprobacion ?? 3.0;
    return students.map((st) => {
      const stAttempts = attempts
        .filter((a) => String(a.studentId).toUpperCase() === String(st.id).toUpperCase())
        .sort((a, b) => a.intentoNumero - b.intentoNumero);

      const maxIntentosPorExamen = st.maxIntentosPermitidos ?? 2;

      // Detailed breakdown for each of the active exam modalities of the assigned course
      const examenesPorModalidad = activeCourseExamModalities.map((modInfo) => {
        const modAttempts = stAttempts
          .filter((a) => (a.modalidad || 'integral') === modInfo.id)
          .sort((a, b) => a.intentoNumero - b.intentoNumero);

        const att1 = modAttempts.find((a) => a.intentoNumero === 1) || modAttempts[0] || null;
        const att2 =
          modAttempts.find((a) => a.intentoNumero === 2) ||
          (modAttempts.length > 1 ? modAttempts[1] : null);

        const intentosRealizados = modAttempts.length;
        const intentosPendientes = Math.max(0, maxIntentosPorExamen - intentosRealizados);
        const realizado = intentosRealizados > 0;
        const bloqueado = (st.examenesBloqueados || []).includes(modInfo.id);

        let notaDefinitiva = 0.0;
        let porcentajeMejor = 0;
        if (realizado) {
          const allSuspended = modAttempts.every((a) => a.estado === 'SUSPENDIDO');
          if (st.suspendido && allSuspended) {
            notaDefinitiva = 0.0;
          } else {
            notaDefinitiva = Math.max(...modAttempts.map((a) => Number(a.notaColombiana) || 0));
            porcentajeMejor = Math.max(...modAttempts.map((a) => Number(a.porcentaje) || 0));
          }
        }

        const estado: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO' | 'SIN PRESENTAR' = !realizado
          ? 'SIN PRESENTAR'
          : modAttempts.some((a) => a.estado === 'SUSPENDIDO') && notaDefinitiva === 0
          ? 'SUSPENDIDO'
          : notaDefinitiva >= notaMinAprob
          ? 'APROBADO'
          : 'REPROBADO';

        return {
          modalidad: modInfo.id,
          label: modInfo.label,
          shortLabel: modInfo.shortLabel,
          realizado,
          bloqueado,
          att1,
          att2,
          intentosRealizados,
          maxIntentos: maxIntentosPorExamen,
          intentosPendientes,
          notaDefinitiva: Number(notaDefinitiva.toFixed(1)),
          porcentajeMejor,
          estado,
          ultimaFecha: modAttempts[modAttempts.length - 1]?.fecha || null
        };
      });

      const examenesRealizadosCount = examenesPorModalidad.filter((e) => e.realizado).length;
      const examenesPendientesCount = examenesPorModalidad.length - examenesRealizadosCount;
      const totalIntentosRealizados = examenesPorModalidad.reduce(
        (acc, e) => acc + e.intentosRealizados,
        0
      );
      const totalIntentosPosibles = examenesPorModalidad.length * maxIntentosPorExamen;
      const totalIntentosPendientes = Math.max(0, totalIntentosPosibles - totalIntentosRealizados);

      // Legacy / global Intento 1 & Intento 2 across any exam
      const att1 = stAttempts.find((a) => a.intentoNumero === 1) || stAttempts[0] || null;
      const att2 =
        stAttempts.find((a) => a.intentoNumero === 2) ||
        (stAttempts.length > 1 ? stAttempts[1] : null);

      const realizadosList = examenesPorModalidad.filter((e) => e.realizado);
      let definitiva = 0.0;
      let promedioPresentados = 0.0;
      if (st.suspendido && stAttempts.length > 0 && stAttempts.every((a) => a.estado === 'SUSPENDIDO')) {
        definitiva = 0.0;
        promedioPresentados = 0.0;
      } else if (realizadosList.length > 0) {
        definitiva = Math.max(...realizadosList.map((e) => e.notaDefinitiva));
        promedioPresentados = Number(
          (
            realizadosList.reduce((acc, e) => acc + e.notaDefinitiva, 0) / realizadosList.length
          ).toFixed(1)
        );
      }

      const promedio6Examenes =
        examenesPorModalidad.length > 0
          ? Number(
              (
                examenesPorModalidad.reduce((acc, e) => acc + e.notaDefinitiva, 0) /
                examenesPorModalidad.length
              ).toFixed(1)
            )
          : 0.0;

      const tieneAlgunRealizado = examenesRealizadosCount > 0 || st.intentosUsados > 0;

      const concepto: 'SUSPENDIDO' | 'APROBADO' | 'REPROBADO' | 'SIN PRESENTAR' = st.suspendido
        ? 'SUSPENDIDO'
        : !tieneAlgunRealizado
        ? 'SIN PRESENTAR'
        : definitiva >= notaMinAprob
        ? 'APROBADO'
        : 'REPROBADO';

      return {
        student: st,
        att1,
        att2,
        definitiva,
        promedioPresentados,
        promedio6Examenes,
        concepto,
        examenesPorModalidad,
        examenesRealizadosCount,
        examenesPendientesCount,
        totalIntentosRealizados,
        totalIntentosPosibles,
        totalIntentosPendientes
      };
    });
  }, [
    students,
    attempts,
    config.notaMinimaAprobacion,
    studentRosterSyncPulse,
    activeCourseExamModalities
  ]);

  const filteredConsolidatedGrades = useMemo(() => {
    const q = consolidatedSearch.trim().toLowerCase();
    return consolidatedGrades.filter((row) => {
      if (
        q &&
        !row.student.id.toLowerCase().includes(q) &&
        !row.student.nombre.toLowerCase().includes(q) &&
        !row.student.codigoAcceso.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (consolidatedModalityFilter !== 'ALL') {
        const modEntry = row.examenesPorModalidad.find(
          (m) => m.modalidad === consolidatedModalityFilter
        );
        if (!modEntry) return false;
        if (consolidatedStatusFilter === 'con_realizados') return modEntry.realizado;
        if (consolidatedStatusFilter === 'con_pendientes' || consolidatedStatusFilter === 'sin_ningun_examen')
          return !modEntry.realizado;
        if (consolidatedStatusFilter === 'aprobados') return modEntry.estado === 'APROBADO';
        if (consolidatedStatusFilter === 'reprobados')
          return modEntry.estado === 'REPROBADO' || modEntry.estado === 'SUSPENDIDO';
        return true;
      }

      if (consolidatedStatusFilter === 'con_realizados') return row.examenesRealizadosCount > 0;
      if (consolidatedStatusFilter === 'con_pendientes') return row.examenesPendientesCount > 0;
      if (consolidatedStatusFilter === 'sin_ningun_examen') return row.examenesRealizadosCount === 0;
      if (consolidatedStatusFilter === 'aprobados') return row.concepto === 'APROBADO';
      if (consolidatedStatusFilter === 'reprobados')
        return row.concepto === 'REPROBADO' || row.concepto === 'SUSPENDIDO';
      return true;
    });
  }, [consolidatedGrades, consolidatedSearch, consolidatedModalityFilter, consolidatedStatusFilter]);

  // Competency Diagnostics by Module & Bloom Level
  const diagnostics = useMemo(() => {
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
    const itemStats: Record<
      string,
      { questionId: string; enunciado: string; modulo: number; total: number; errors: number }
    > = {};

    attempts.forEach((att) => {
      att.respuestasDetalle.forEach((r) => {
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

        if (!itemStats[r.questionId]) {
          itemStats[r.questionId] = {
            questionId: r.questionId,
            enunciado: r.enunciado,
            modulo: r.modulo,
            total: 0,
            errors: 0
          };
        }
        itemStats[r.questionId].total++;
        if (!r.acierto) {
          itemStats[r.questionId].errors++;
        }
      });
    });

    const weakTopics = Object.entries(topicErrors)
      .map(([tema, data]) => ({
        tema,
        modulo: data.modulo,
        total: data.total,
        errorRate: data.total > 0 ? Math.round((data.errors / data.total) * 100) : 0
      }))
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 6);

    const psychometricItems = Object.values(itemStats)
      .map((it) => {
        const errorRate = it.total > 0 ? Math.round((it.errors / it.total) * 100) : 0;
        const successRate = 100 - errorRate;
        const classification: 'CRITICO_DIFICIL' | 'TRIVIAL' | 'CALIBRADO' =
          errorRate >= 80
            ? 'CRITICO_DIFICIL'
            : successRate >= 95 && it.total >= 2
            ? 'TRIVIAL'
            : 'CALIBRADO';
        return {
          ...it,
          errorRate,
          successRate,
          classification
        };
      })
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10);

    return { modStats, bloomStats, weakTopics, psychometricItems };
  }, [attempts]);

  // Grade Distribution Data for Bar Chart Visualization (0.0 to 5.0 Colombian Scale)
  const gradeDistributionBars = useMemo(() => {
    const buckets = [
      { label: '0.0 - 1.9 (Deficiente)', short: '0.0-1.9', count: 0, color: 'bg-red-600' },
      { label: '2.0 - 2.9 (Insuficiente)', short: '2.0-2.9', count: 0, color: 'bg-amber-500' },
      { label: '3.0 - 3.7 (Aceptable)', short: '3.0-3.7', count: 0, color: 'bg-sky-600' },
      { label: '3.8 - 4.4 (Sobresaliente)', short: '3.8-4.4', count: 0, color: 'bg-emerald-500' },
      { label: '4.5 - 5.0 (Excelente)', short: '4.5-5.0', count: 0, color: 'bg-emerald-700' }
    ];

    const evaluatedRows = consolidatedGrades.filter(
      (r) => r.student.intentosUsados > 0 || r.student.suspendido
    );

    evaluatedRows.forEach((r) => {
      const n = r.definitiva;
      if (n < 2.0) buckets[0].count++;
      else if (n < 3.0) buckets[1].count++;
      else if (n < 3.8) buckets[2].count++;
      else if (n < 4.5) buckets[3].count++;
      else buckets[4].count++;
    });

    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    return { buckets, totalEvaluated: evaluatedRows.length, maxCount };
  }, [consolidatedGrades]);

  // Retry Pending Google Sheets Sync Queue
  const pendingSheetsAttempts = useMemo(
    () => attempts.filter((a) => !a.sincronizadoSheets),
    [attempts]
  );

  const handleRetryPendingSheetsQueue = async () => {
    if (!config.webhookUrl) {
      setRetrySyncStatus(
        'Configure primero la URL del Webhook de Google Apps Script en la pestaña "Google Sheets & Blogger".'
      );
      return;
    }
    if (pendingSheetsAttempts.length === 0) {
      setRetrySyncStatus('Todas las calificaciones ya se encuentran sincronizadas con Google Sheets.');
      return;
    }

    setRetrySyncStatus(`Sincronizando ${pendingSheetsAttempts.length} entregas pendientes con Google Sheets...`);
    let successCount = 0;

    for (const att of pendingSheetsAttempts) {
      try {
        await fetch(config.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(att)
        });
        successCount++;
      } catch {
        // continue
      }
    }

    if (successCount > 0) {
      onUpdateAttempts(
        attempts.map((a) => ({
          ...a,
          sincronizadoSheets: true
        }))
      );
      setRetrySyncStatus(`✓ Se sincronizaron exitosamente ${successCount} entregas pendientes con Google Sheets.`);
    } else {
      setRetrySyncStatus('No se pudo conectar con Google Sheets. Verifique su conexión a internet.');
    }
  };

  // Full System Backup (.evaluaplus.json) Export & Restore
  const handleExportFullSystemBackup = () => {
    const backupPayload = {
      sistema: 'EvaluaPlus - Mapeo de Mercado y Comportamiento del Consumidor (La Dorada, Caldas)',
      version: '2.5',
      fechaRespaldo: new Date().toISOString(),
      config,
      students,
      attempts,
      abproEvaluations,
      questions,
      customMiniRetos
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Respaldo_Total_EvaluaPlus_${new Date().toISOString().slice(0, 10)}.evaluaplus.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupRestoreStatus({
      type: 'ok',
      msg: '✓ Copia de seguridad completa (.evaluaplus.json) descargada con éxito.'
    });
  };

  const handleImportFullSystemBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (!parsed.students || !Array.isArray(parsed.students)) {
          setBackupRestoreStatus({
            type: 'err',
            msg: 'El archivo seleccionado no tiene una estructura válida de respaldo EvaluaPlus.'
          });
          return;
        }
        if (onFullSystemRestore) {
          await onFullSystemRestore({
            students: parsed.students,
            questions: Array.isArray(parsed.questions) ? parsed.questions : undefined,
            attempts: Array.isArray(parsed.attempts) ? parsed.attempts : undefined,
            abproEvaluations: Array.isArray(parsed.abproEvaluations)
              ? parsed.abproEvaluations
              : undefined,
            config: parsed.config ? { ...config, ...parsed.config } : undefined,
            customMiniRetos: Array.isArray(parsed.customMiniRetos)
              ? parsed.customMiniRetos
              : undefined
          });
        } else {
          onUpdateStudents(parsed.students);
          if (Array.isArray(parsed.questions)) onUpdateQuestions(parsed.questions);
          if (Array.isArray(parsed.attempts)) onUpdateAttempts(parsed.attempts);
          if (Array.isArray(parsed.abproEvaluations))
            onUpdateABProEvaluations(parsed.abproEvaluations);
          if (parsed.config) onUpdateConfig({ ...config, ...parsed.config });
          if (Array.isArray(parsed.customMiniRetos))
            onUpdateCustomMiniRetos(parsed.customMiniRetos);
        }

        setBackupRestoreStatus({
          type: 'ok',
          msg: `✓ Respaldo restaurado y persistido en el servidor central: ${
            parsed.students.length
          } estudiantes, ${parsed.questions?.length || 0} preguntas y ${
            parsed.attempts?.length || 0
          } calificaciones.`
        });
      } catch {
        setBackupRestoreStatus({
          type: 'err',
          msg: 'Error al leer el archivo JSON de respaldo.'
        });
      }
    };
    reader.readAsText(file);
  };

  // Manual Unlock of Student Erroneously Blocked by Anti-Cheat (Preserves valid attempts & removes erroneous SUSPENDIDO attempt)
  const executeManualAntiCheatUnlock = (studentId: string) => {
    const target = students.find((s) => s.id === studentId);
    if (!target) return;

    const validAttempts = attempts.filter(
      (a) => !(a.studentId === studentId && a.estado === 'SUSPENDIDO')
    );
    const remainingForStudent = validAttempts.filter((a) => a.studentId === studentId).length;

    const nextStudents = students.map((s) =>
      s.id === studentId
        ? {
            ...s,
            suspendido: false,
            intentosUsados: remainingForStudent,
            conceptoInfraccion: '✓ Desbloqueado manualmente por el docente (Sin infracciones)'
          }
        : s
    );

    commitTeacherStudentsUpdate(nextStudents);
    onUpdateAttempts(validAttempts);
    onReleaseLiveSession(studentId);
    setManualUnlockNotice(
      `✓ Se desbloqueó manualmente al estudiante ${target.nombre} (${target.id}) y se anuló el bloqueo del sistema anti-trampa conservando sus intentos válidos (${remainingForStudent}).`
    );
    setTimeout(() => setManualUnlockNotice(null), 6000);
  };

  const [isEqualizingBankIA, setIsEqualizingBankIA] = useState(false);
  const [antiCheatControlModalOpen, setAntiCheatControlModalOpen] = useState(false);
  const [antiCheatActionNotice, setAntiCheatActionNotice] = useState<string | null>(null);
  const [warningLimitStudentSearch, setWarningLimitStudentSearch] = useState('');

  const activeExamAntiCheatFlags = [
    config.antiTrampaExamenesActivo !== false,
    config.examenBloquearCambioPestanaFoco !== false,
    config.detectarCambioPestana !== false,
    config.detectarMinimizarPestana !== false,
    config.detectarCambioAplicacion !== false,
    config.examenBloquearCopiaClicDerechoAtajos !== false,
    config.examenExigirPantallaCompleta !== false,
    config.exigirPantallaMaximizada !== false,
    config.detectarCapturaPantallaDevTools !== false,
    config.detectarAbandonoPunteroIA !== false,
    config.detectarRafagaClicsIA !== false,
    config.barajarOpciones !== false,
    config.ecualizadorPsicometricoActivo !== false
  ];
  const activeRetoAntiCheatFlags = [
    config.antiTrampaMiniRetosActivo !== false,
    config.retoBloquearCambioPestanaFoco !== false,
    config.retoSuspenderCopiaPegadoInyeccion !== false,
    config.retoBiometriaTecleoAntiCopia !== false,
    config.retoExigirPantallaCompleta !== false
  ];
  const activeExamAntiCheatCount = activeExamAntiCheatFlags.filter(Boolean).length;
  const activeRetoAntiCheatCount = activeRetoAntiCheatFlags.filter(Boolean).length;
  const totalActiveAntiCheatCount = activeExamAntiCheatCount + activeRetoAntiCheatCount;

  const handleSetGlobalWarningLimit = (limit: number) => {
    const safeLimit = Math.max(0, Math.min(10, Math.round(limit)));
    const nextConfig: SystemConfig = {
      ...config,
      maxLlamadosAtencionGlobal: safeLimit
    };
    commitTeacherConfigUpdate(nextConfig);
    void handleExecuteServerSave(
      'control_anti_trampas',
      `Actualización de Límite Global de Llamados de Atención (${safeLimit}) en BD del Servidor`
    );
    setAntiCheatActionNotice(
      `✓ Límite Global ajustado a ${safeLimit} llamado(s) de atención antes de suspensión automática (0.0 / 5.0) y guardado en el Servidor Central.`
    );
  };

  const handleApplyWarningLimitToAllStudents = (limit: number) => {
    const safeLimit = Math.max(0, Math.min(10, Math.round(limit)));
    const nextStudents = students.map((s) => ({
      ...s,
      maxLlamadosAtencionIndividual: undefined
    }));
    const nextConfig: SystemConfig = {
      ...config,
      maxLlamadosAtencionGlobal: safeLimit,
      llamadosAtencionPorEstudiante: {}
    };
    commitTeacherStudentsUpdate(nextStudents);
    commitTeacherConfigUpdate(nextConfig);
    void handleExecuteServerSave(
      'control_anti_trampas',
      `Aplicación de ${safeLimit} llamado(s) de atención para TODOS los estudiantes en BD del Servidor`
    );
    setAntiCheatActionNotice(
      `✓ Se ajustaron ${safeLimit} llamado(s) de atención por igual para TODOS los ${students.length} estudiantes en el Servidor.`
    );
  };

  const handleSetIndividualStudentWarningLimit = (studentId: string, limitOrGlobal: number | 'GLOBAL') => {
    const targetSt = students.find((s) => s.id === studentId);
    if (!targetSt) return;
    const isGlobal = limitOrGlobal === 'GLOBAL';
    const numericVal = isGlobal ? undefined : Math.max(0, Math.min(10, Math.round(Number(limitOrGlobal))));

    const updatedSt: StudentRecord = {
      ...targetSt,
      maxLlamadosAtencionIndividual: numericVal
    };
    const nextStudents = students.map((s) => (s.id === studentId ? updatedSt : s));
    const nextMap = { ...(config.llamadosAtencionPorEstudiante || {}) };
    if (isGlobal || numericVal === undefined) {
      delete nextMap[studentId];
    } else {
      nextMap[studentId] = numericVal;
    }

    commitTeacherStudentsUpdate(nextStudents, updatedSt);
    commitTeacherConfigUpdate({
      ...config,
      llamadosAtencionPorEstudiante: nextMap
    });
    void handleExecuteServerSave(
      'control_anti_trampas',
      `Ajuste individual de llamados de atención para ${targetSt.nombre} (${isGlobal ? 'Global' : numericVal}) en BD del Servidor`
    );
    setAntiCheatActionNotice(
      `✓ Llamados de atención para ${targetSt.nombre}: ${
        isGlobal
          ? `Usa regla global (${config.maxLlamadosAtencionGlobal ?? 1})`
          : `${numericVal} llamado(s) personalizado(s)`
      } — guardado en el Servidor.`
    );
  };

  const handleToggleAntiCheatField = (field: keyof SystemConfig) => {
    const currentVal = config[field] !== false;
    const nextConfig: SystemConfig = {
      ...config,
      [field]: !currentVal
    };
    commitTeacherConfigUpdate(nextConfig);
    void handleExecuteServerSave(
      'control_anti_trampas',
      `Actualización de método anti-trampa (${String(field)}: ${!currentVal ? 'HABILITADO' : 'DESHABILITADO'}) en BD del Servidor`
    );
    setAntiCheatActionNotice(
      `✓ Método "${String(field)}" ${!currentVal ? 'HABILITADO' : 'DESHABILITADO'} y guardado en el Servidor Central.`
    );
  };

  const handleEnableAllAntiCheatMethods = () => {
    const nextConfig: SystemConfig = {
      ...config,
      antiTrampaExamenesActivo: true,
      examenBloquearCambioPestanaFoco: true,
      detectarCambioPestana: true,
      detectarMinimizarPestana: true,
      detectarCambioAplicacion: true,
      examenBloquearCopiaClicDerechoAtajos: true,
      examenExigirPantallaCompleta: true,
      exigirPantallaMaximizada: true,
      detectarCapturaPantallaDevTools: true,
      detectarAbandonoPunteroIA: true,
      detectarRafagaClicsIA: true,
      barajarOpciones: true,
      ecualizadorPsicometricoActivo: true,
      antiTrampaMiniRetosActivo: true,
      retoBloquearCambioPestanaFoco: true,
      retoSuspenderCopiaPegadoInyeccion: true,
      retoBiometriaTecleoAntiCopia: true,
      retoExigirPantallaCompleta: true
    };
    commitTeacherConfigUpdate(nextConfig);
    void handleExecuteServerSave(
      'control_anti_trampas',
      'Restauración y habilitación total de los 18 métodos anti-trampas (Exámenes y Mini Retos) en BD del Servidor'
    );
    setAntiCheatActionNotice(
      '✓ Los 18 métodos anti-trampas (13 en Exámenes + 5 en Mini Retos) quedaron 100% HABILITADOS y sincronizados en la Base de Datos del Servidor.'
    );
  };

  const handleEqualizeQuestionBankIA = async (mode: 'all' | 'ai_deep' = 'all') => {
    if (questions.length === 0 || isEqualizingBankIA) return;
    setIsEqualizingBankIA(true);
    try {
      savePreviousQuestionsSnapshot(questions);
      const biasIds = bankQualityAudit.lengthBiasItems.map((b) => b.id);
      const res = await fetch('/api/ecualizar-preguntas-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          questionIds: mode === 'ai_deep' && biasIds.length > 0 ? biasIds.slice(0, 12) : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.questions) && data.questions.length > 0) {
          onUpdateQuestions(data.questions);
          setBankActionNotice(
            `✓ Inteligencia Anti-Patrones Aplicada y Guardada en el Servidor (${data.questions.length} reactivos): todas las opciones ahora tienen extensión homogénea, distractores con "cascarita" y mini-explicación simétrica.`
          );
          return;
        }
      }
      // Fallback local psychometric equalization + auto-save to server
      const equalized = equalizeQuestionBank(questions);
      onUpdateQuestions(equalized);
      setBankActionNotice(
        `✓ Ecualizador Psicométrico Aplicado y Guardado en el Servidor (${equalized.length} reactivos): se eliminó el sesgo de "la opción más larga" y se integraron distractores con cascarita y mini-explicación.`
      );
    } catch {
      const equalized = equalizeQuestionBank(questions);
      onUpdateQuestions(equalized);
      setBankActionNotice(
        `✓ Ecualizador Psicométrico Aplicado (${equalized.length} reactivos): opciones niveladas en extensión y con distractores de camuflaje.`
      );
    } finally {
      setIsEqualizingBankIA(false);
    }
  };

  // Automatic Question Bank Quality Validator (Auditor de Reactivos)
  const bankQualityAudit = useMemo(() => {
    const dist: Record<'A' | 'B' | 'C' | 'D', number> = { A: 0, B: 0, C: 0, D: 0 };
    const seenStatements = new Map<string, string>();
    const duplicateOrSimilar: { idA: string; idB: string; enunciado: string }[] = [];
    const lengthBiasItems: {
      id: string;
      modulo: number;
      correcta: string;
      correctLen: number;
      avgDistractorLen: number;
      enunciado: string;
    }[] = [];

    questions.forEach((q) => {
      const c = (q.correcta || 'A') as 'A' | 'B' | 'C' | 'D';
      if (dist[c] !== undefined) dist[c]++;

      const norm = (q.enunciado || '')
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñ]/g, '')
        .slice(0, 75);
      if (norm.length > 20) {
        if (seenStatements.has(norm)) {
          duplicateOrSimilar.push({
            idA: seenStatements.get(norm)!,
            idB: q.id,
            enunciado: q.enunciado
          });
        } else {
          seenStatements.set(norm, q.id);
        }
      }

      const opts = q.opciones || { A: '', B: '', C: '', D: '' };
      const correctLen = (opts[c] || '').length;
      const distractors = (['A', 'B', 'C', 'D'] as const)
        .filter((l) => l !== c)
        .map((l) => (opts[l] || '').length);
      const avgDist =
        distractors.reduce((acc, v) => acc + v, 0) / Math.max(1, distractors.length);

      if (correctLen > avgDist * 1.65 && correctLen - avgDist >= 35) {
        lengthBiasItems.push({
          id: q.id,
          modulo: q.modulo,
          correcta: c,
          correctLen,
          avgDistractorLen: Math.round(avgDist),
          enunciado: q.enunciado
        });
      }
    });

    const total = Math.max(1, questions.length);
    const distPct = {
      A: Math.round((dist.A / total) * 100),
      B: Math.round((dist.B / total) * 100),
      C: Math.round((dist.C / total) * 100),
      D: Math.round((dist.D / total) * 100)
    };
    const isDistributionUnbalanced = (['A', 'B', 'C', 'D'] as const).some(
      (l) => distPct[l] > 35 || distPct[l] < 15
    );

    return {
      dist,
      distPct,
      isDistributionUnbalanced,
      duplicateOrSimilar,
      lengthBiasItems
    };
  }, [questions]);

  // Paper Exam Generator (Plan B for Total Power Outage: Fila A, Fila B, Fila C of 20 questions each)
  const paperExamVersions = useMemo(() => {
    const base = questions.length >= 20 ? questions : [];
    const buildVersion = (fila: 'A' | 'B' | 'C', offset: number) => {
      const picked: Question[] = [];
      for (let i = 0; i < Math.min(20, base.length); i++) {
        picked.push(base[(i * 7 + offset) % base.length]);
      }
      return { fila, items: picked };
    };
    return [buildVersion('A', 0), buildVersion('B', 5), buildVersion('C', 11)];
  }, [questions]);

  // Reset Student Attempts Inline Handler (Without window.confirm!) with Configurable Allowed Attempts (1 or 2)
  const executeResetStudent = (studentId: string, allowedAttempts: 1 | 2 = 2) => {
    const nextStudents = students.map((s) =>
      s.id === studentId
        ? {
            ...s,
            intentosUsados: 0,
            maxIntentosPermitidos: allowedAttempts,
            suspendido: false,
            conceptoInfraccion: '✓ Sin infracciones',
            preguntasIntento1: [],
            preguntasIntento2: [],
            preguntasUsadasPorModalidad: {}
          }
        : s
    );
    const nextAttempts = attempts.filter((a) => a.studentId !== studentId);
    commitTeacherStudentsUpdate(nextStudents);
    onUpdateAttempts(nextAttempts);
    onReleaseLiveSession(studentId);
    setConfirmResetId(null);
  };

  // Batch Delete Selected Students Inline Handler
  const executeBatchDeleteStudents = () => {
    if (selectedStudentIdsForBatch.length === 0) return;
    const toRemove = new Set(selectedStudentIdsForBatch);
    const remainingStudents = students.filter((s) => !toRemove.has(s.id));
    commitTeacherStudentsUpdate(
      remainingStudents,
      undefined,
      `✓ ${toRemove.size} estudiante(s) eliminado(s) del Banco Único de Estudiantes y actualizado en Clases C1-C6, Asistencia, Exámenes y Retos.`
    );
    onUpdateAttempts(attempts.filter((a) => !toRemove.has(a.studentId)));
    onUpdateABProEvaluations(abproEvaluations.filter((e) => !toRemove.has(e.studentId)));
    toRemove.forEach((id) => onReleaseLiveSession(id));
    setSelectedStudentIdsForBatch([]);
    setConfirmBatchDeleteStudents(false);
  };

  // Toggle Specific Exam Modality Block for a Student
  const handleToggleStudentExamBlock = (studentId: string, modality: ExamModality) => {
    commitTeacherStudentsUpdate(
      students.map((s) => {
        if (s.id !== studentId) return s;
        const currentBlocked = s.examenesBloqueados || [];
        const isBlocked = currentBlocked.includes(modality);
        const nextBlocked = isBlocked
          ? currentBlocked.filter((m) => m !== modality)
          : [...currentBlocked, modality];
        return { ...s, examenesBloqueados: nextBlocked };
      })
    );
  };

  const handleBlockOrUnblockAllExamsForStudent = (studentId: string, blockAll: boolean) => {
    const allModalities: ExamModality[] = examModalities.map((m) => m.id);
    commitTeacherStudentsUpdate(
      students.map((s) =>
        s.id === studentId ? { ...s, examenesBloqueados: blockAll ? allModalities : [] } : s
      )
    );
  };

  // Batch Lock / Unlock Specific Exam Modality for All Selected Students
  const handleBatchSetModalityLock = (mod: ExamModality, shouldBlock: boolean) => {
    if (selectedStudentIdsForBatch.length === 0) return;
    const selectedSet = new Set(selectedStudentIdsForBatch);
    const nextStudents = students.map((s) => {
      if (!selectedSet.has(s.id)) return s;
      const current = s.examenesBloqueados || [];
      const nextBlocked = shouldBlock
        ? Array.from(new Set([...current, mod]))
        : current.filter((m) => m !== mod);
      return {
        ...s,
        examenesBloqueados: nextBlocked
      };
    });
    commitTeacherStudentsUpdate(nextStudents);
    setBatchExamBlockNotice(
      `✓ Se ha ${shouldBlock ? 'BLOQUEADO' : 'DESBLOQUEADO'} el examen (${mod.toUpperCase()}) para ${selectedStudentIdsForBatch.length} estudiante(s) seleccionado(s).`
    );
  };

  // Batch Lock / Unlock ALL Exam Modalities for All Selected Students
  const handleBatchBlockOrUnblockAllExams = (blockAll: boolean) => {
    if (selectedStudentIdsForBatch.length === 0) return;
    const selectedSet = new Set(selectedStudentIdsForBatch);
    const allMods: ExamModality[] = examModalities.map((m) => m.id);
    const nextStudents = students.map((s) => {
      if (!selectedSet.has(s.id)) return s;
      return {
        ...s,
        examenesBloqueados: blockAll ? allMods : []
      };
    });
    commitTeacherStudentsUpdate(nextStudents);
    setBatchExamBlockNotice(
      `✓ Se han ${blockAll ? 'BLOQUEADO TODOS los exámenes' : 'DESBLOQUEADO / HABILITADO TODOS los exámenes'} para los ${selectedStudentIdsForBatch.length} estudiante(s) seleccionado(s).`
    );
  };

  // ================= ESTADO MAESTRO DEL EXAMEN (ABIERTO / CERRADO) POR ESTUDIANTE Y PARA TODOS =================
  const isMasterOpenForStudent = (studentId: string): boolean => {
    if (!config.examenAbierto) return false;
    return !(config.estudiantesConEstadoCerrado || []).includes(studentId);
  };

  const masterClosedIdsSet = useMemo(() => {
    if (!config.examenAbierto) {
      return new Set(students.map((s) => s.id));
    }
    return new Set(config.estudiantesConEstadoCerrado || []);
  }, [config.examenAbierto, config.estudiantesConEstadoCerrado, students]);

  const masterOpenCount = students.filter((s) => !masterClosedIdsSet.has(s.id)).length;
  const masterClosedCount = students.length - masterOpenCount;

  // Enable (ABIERTO) for ALL students
  const handleMasterOpenAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      examenAbierto: true,
      estudiantesConEstadoCerrado: []
    });
    setMasterExamNotice(
      `✓ Estado Maestro del Examen HABILITADO (ABIERTO) para todos los ${students.length} estudiantes.`
    );
  };

  // Disable (CERRADO) for ALL students
  const handleMasterCloseAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      examenAbierto: false,
      estudiantesConEstadoCerrado: students.map((s) => s.id)
    });
    setMasterExamNotice(
      `■ Estado Maestro del Examen DESHABILITADO (CERRADO) para todos los ${students.length} estudiantes.`
    );
  };

  // Toggle ABIERTO / CERRADO for a single student
  const handleToggleMasterExamForStudent = (studentId: string) => {
    const nextClosedSet = new Set(masterClosedIdsSet);
    const wasClosed = nextClosedSet.has(studentId);
    if (wasClosed) {
      nextClosedSet.delete(studentId);
    } else {
      nextClosedSet.add(studentId);
    }
    const nextClosedArray = students.filter((s) => nextClosedSet.has(s.id)).map((s) => s.id);
    const allAreClosed = nextClosedArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      examenAbierto: !allAreClosed,
      estudiantesConEstadoCerrado: allAreClosed ? nextClosedArray : nextClosedArray
    });
  };

  // Batch set ABIERTO or CERRADO for selected students in the Master Exam State modal
  const handleBatchSetMasterExamState = (targetIds: string[], setOpen: boolean) => {
    if (targetIds.length === 0) return;
    const nextClosedSet = new Set(masterClosedIdsSet);
    targetIds.forEach((id) => {
      if (setOpen) {
        nextClosedSet.delete(id);
      } else {
        nextClosedSet.add(id);
      }
    });
    const nextClosedArray = students.filter((s) => nextClosedSet.has(s.id)).map((s) => s.id);
    const allAreClosed = nextClosedArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      examenAbierto: !allAreClosed,
      estudiantesConEstadoCerrado: nextClosedArray
    });
    setMasterExamNotice(
      `✓ Estado Maestro actualizado a ${
        setOpen ? 'ABIERTO (Habilitado)' : 'CERRADO (Deshabilitado)'
      } para ${targetIds.length} estudiante(s) seleccionado(s).`
    );
  };

  // ================= RETROALIMENTACIÓN (INMEDIATA / DIFERIDA) POR ESTUDIANTE Y PARA TODOS =================
  const isFeedbackImmediateForStudent = (studentId: string): boolean => {
    if (!config.retroalimentacionInmediata) return false;
    return !(config.estudiantesConRetroalimentacionDiferida || []).includes(studentId);
  };

  const feedbackDeferredIdsSet = useMemo(() => {
    if (!config.retroalimentacionInmediata) {
      return new Set(students.map((s) => s.id));
    }
    return new Set(config.estudiantesConRetroalimentacionDiferida || []);
  }, [config.retroalimentacionInmediata, config.estudiantesConRetroalimentacionDiferida, students]);

  const feedbackImmediateCount = students.filter((s) => !feedbackDeferredIdsSet.has(s.id)).length;
  const feedbackDeferredCount = students.length - feedbackImmediateCount;

  const handleFeedbackImmediateAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      retroalimentacionInmediata: true,
      estudiantesConRetroalimentacionDiferida: []
    });
    setFeedbackNotice(
      `✓ Retroalimentación HABILITADA (INMEDIATA) para todos los ${students.length} estudiantes.`
    );
  };

  const handleFeedbackDeferredAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      retroalimentacionInmediata: false,
      estudiantesConRetroalimentacionDiferida: students.map((s) => s.id)
    });
    setFeedbackNotice(
      `■ Retroalimentación DESHABILITADA (DIFERIDA) para todos los ${students.length} estudiantes.`
    );
  };

  const handleToggleFeedbackForStudent = (studentId: string) => {
    const nextDeferredSet = new Set(feedbackDeferredIdsSet);
    if (nextDeferredSet.has(studentId)) {
      nextDeferredSet.delete(studentId);
    } else {
      nextDeferredSet.add(studentId);
    }
    const nextDeferredArray = students.filter((s) => nextDeferredSet.has(s.id)).map((s) => s.id);
    const allAreDeferred = nextDeferredArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      retroalimentacionInmediata: !allAreDeferred,
      estudiantesConRetroalimentacionDiferida: nextDeferredArray
    });
  };

  const handleBatchSetFeedbackState = (targetIds: string[], setImmediate: boolean) => {
    if (targetIds.length === 0) return;
    const nextDeferredSet = new Set(feedbackDeferredIdsSet);
    targetIds.forEach((id) => {
      if (setImmediate) {
        nextDeferredSet.delete(id);
      } else {
        nextDeferredSet.add(id);
      }
    });
    const nextDeferredArray = students.filter((s) => nextDeferredSet.has(s.id)).map((s) => s.id);
    const allAreDeferred = nextDeferredArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      retroalimentacionInmediata: !allAreDeferred,
      estudiantesConRetroalimentacionDiferida: nextDeferredArray
    });
    setFeedbackNotice(
      `✓ Retroalimentación actualizada a ${
        setImmediate ? 'INMEDIATA (Habilitada)' : 'DIFERIDA (Deshabilitada)'
      } para ${targetIds.length} estudiante(s) seleccionado(s).`
    );
  };

  // ================= DESGLOSE PREGUNTA X PREGUNTA (HABILITADO / DESHABILITADO) POR ESTUDIANTE, PARA TODOS Y HORARIO =================
  const isBreakdownEnabledForStudent = (studentId: string): boolean => {
    if (config.mostrarDesglosePregunta === false) return false;
    return !(config.estudiantesConDesgloseDeshabilitado || []).includes(studentId);
  };

  const breakdownDisabledIdsSet = useMemo(() => {
    if (config.mostrarDesglosePregunta === false) {
      return new Set(students.map((s) => s.id));
    }
    return new Set(config.estudiantesConDesgloseDeshabilitado || []);
  }, [config.mostrarDesglosePregunta, config.estudiantesConDesgloseDeshabilitado, students]);

  const breakdownEnabledCount = students.filter((s) => !breakdownDisabledIdsSet.has(s.id)).length;
  const breakdownDisabledCount = students.length - breakdownEnabledCount;

  const handleBreakdownEnableAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      mostrarDesglosePregunta: true,
      estudiantesConDesgloseDeshabilitado: []
    });
    setBreakdownNotice(
      `✓ Desglose Pregunta x Pregunta HABILITADO para todos los ${students.length} estudiantes.`
    );
  };

  const handleBreakdownDisableAllStudents = () => {
    commitTeacherConfigUpdate({
      ...config,
      mostrarDesglosePregunta: false,
      estudiantesConDesgloseDeshabilitado: students.map((s) => s.id)
    });
    setBreakdownNotice(
      `■ Desglose Pregunta x Pregunta DESHABILITADO para todos los ${students.length} estudiantes.`
    );
  };

  const handleToggleBreakdownForStudent = (studentId: string) => {
    const nextDisabledSet = new Set(breakdownDisabledIdsSet);
    if (nextDisabledSet.has(studentId)) {
      nextDisabledSet.delete(studentId);
    } else {
      nextDisabledSet.add(studentId);
    }
    const nextDisabledArray = students.filter((s) => nextDisabledSet.has(s.id)).map((s) => s.id);
    const allAreDisabled = nextDisabledArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      mostrarDesglosePregunta: !allAreDisabled,
      estudiantesConDesgloseDeshabilitado: nextDisabledArray
    });
  };

  const handleBatchSetBreakdownState = (targetIds: string[], setEnabled: boolean) => {
    if (targetIds.length === 0) return;
    const nextDisabledSet = new Set(breakdownDisabledIdsSet);
    targetIds.forEach((id) => {
      if (setEnabled) {
        nextDisabledSet.delete(id);
      } else {
        nextDisabledSet.add(id);
      }
    });
    const nextDisabledArray = students.filter((s) => nextDisabledSet.has(s.id)).map((s) => s.id);
    const allAreDisabled = nextDisabledArray.length >= students.length && students.length > 0;
    commitTeacherConfigUpdate({
      ...config,
      mostrarDesglosePregunta: !allAreDisabled,
      estudiantesConDesgloseDeshabilitado: nextDisabledArray
    });
    setBreakdownNotice(
      `✓ Desglose Pregunta x Pregunta actualizado a ${
        setEnabled ? 'HABILITADO (Visible)' : 'DESHABILITADO (Oculto)'
      } para ${targetIds.length} estudiante(s) seleccionado(s).`
    );
  };

  const handleToggleBreakdownDay = (dayNumber: number) => {
    const currentDays = config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
    const exists = currentDays.includes(dayNumber);
    const nextDays = exists
      ? currentDays.filter((d) => d !== dayNumber)
      : [...currentDays, dayNumber];
    commitTeacherConfigUpdate({
      ...config,
      desgloseDiasPermitidos: nextDays
    });
  };

  const handleToggleClassWindowDay = (dayNumber: number) => {
    const currentDays = config.diasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
    const exists = currentDays.includes(dayNumber);
    const nextDays = exists
      ? currentDays.filter((d) => d !== dayNumber)
      : [...currentDays, dayNumber];
    commitTeacherConfigUpdate({
      ...config,
      diasPermitidos: nextDays
    });
  };

  // Delete Student Inline Handler
  const executeDeleteStudent = (studentId: string) => {
    const remainingStudents = students.filter((s) => s.id !== studentId);
    commitTeacherStudentsUpdate(
      remainingStudents,
      undefined,
      `✓ Estudiante (${studentId}) eliminado del Banco Único de Estudiantes y actualizado en Clases C1-C6, Asistencia, Exámenes y Retos.`
    );
    onUpdateAttempts(attempts.filter((a) => a.studentId !== studentId));
    onUpdateABProEvaluations(abproEvaluations.filter((e) => e.studentId !== studentId));
    onReleaseLiveSession(studentId);
    setSelectedStudentIdsForBatch((prev) => prev.filter((id) => id !== studentId));
    setConfirmDeleteStudentId(null);
  };

  // Open Add / Edit Student Modal
  const openAddStudentModal = () => {
    setEditingOriginalId(null);
    setFormStudentId('');
    setFormStudentName('');
    setFormStudentCode('');
    setFormStudentEmail('');
    setFormStudentWhatsapp('');
    setStudentModalError(null);
    setStudentModalOpen(true);
  };

  const openEditStudentModal = (st: StudentRecord) => {
    setEditingOriginalId(st.id || '');
    setFormStudentId(st.id || '');
    setFormStudentName(st.nombre || '');
    setFormStudentCode(st.codigoAcceso || '');
    setFormStudentEmail(st.correo || '');
    setFormStudentWhatsapp(st.whatsapp || '');
    setStudentModalError(null);
    setStudentModalOpen(true);
  };

  const originalEditingStudent = editingOriginalId
    ? students.find((s) => s.id === editingOriginalId) || null
    : null;
  const pendingStudentModalChange = editingOriginalId
    ? Boolean(
        originalEditingStudent &&
          ((formStudentId || '').trim() !== (originalEditingStudent.id || '').trim() ||
            (formStudentName || '').trim() !== (originalEditingStudent.nombre || '').trim() ||
            (formStudentCode || '').trim().toUpperCase() !==
              (originalEditingStudent.codigoAcceso || '').trim().toUpperCase() ||
            (formStudentEmail || '').trim() !== (originalEditingStudent.correo || '').trim() ||
            (formStudentWhatsapp || '').trim() !== (originalEditingStudent.whatsapp || '').trim())
      )
    : Boolean((formStudentId || '').trim() && (formStudentName || '').trim());

  const handleSaveStudentModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingStudentModalChange || isSavingStudentModal) return;

    const cleanId = formStudentId.trim();
    const cleanName = formStudentName.trim();
    const cleanCode = (
      formStudentCode.trim() || generateDeterministicAccessCode(cleanId)
    ).toUpperCase();
    const cleanEmail = formStudentEmail.trim() || undefined;
    const cleanWhatsapp = formStudentWhatsapp.trim() || undefined;

    if (!cleanId || !cleanName) {
      setStudentModalError('El ID del estudiante y el nombre completo son obligatorios.');
      return;
    }

    if (cleanCode.length < 4 || cleanCode.length > 24) {
      setStudentModalError(
        'El código de acceso debe tener entre 4 y 24 caracteres alfanuméricos.'
      );
      return;
    }

    const duplicate = students.find(
      (s) => s.id.toUpperCase() === cleanId.toUpperCase() && s.id !== editingOriginalId
    );
    if (duplicate) {
      setStudentModalError(`Ya existe un estudiante registrado con el documento ${cleanId}.`);
      return;
    }

    setIsSavingStudentModal(true);
    try {
      if (editingOriginalId) {
        let updatedRecord: StudentRecord | undefined;
        const nextStudents = students.map((s) => {
          if (s.id === editingOriginalId) {
            updatedRecord = {
              ...s,
              id: cleanId,
              nombre: cleanName,
              codigoAcceso: cleanCode,
              correo: cleanEmail,
              whatsapp: cleanWhatsapp
            };
            return updatedRecord;
          }
          return s;
        });
        commitTeacherStudentsUpdate(
          nextStudents,
          updatedRecord,
          `✓ Datos y Código de Acceso (${cleanCode}) de ${cleanName} guardados en la Base de Datos del Servidor.`
        );
        await handleExecuteServerSave(
          `modal_estudiante_${cleanId}`,
          `Datos y Código de Acceso de ${cleanName} (${cleanCode}) guardados en BD del Servidor`
        );
      } else {
        const newRecord: StudentRecord = {
          id: cleanId,
          nombre: cleanName,
          codigoAcceso: cleanCode,
          correo: cleanEmail,
          whatsapp: cleanWhatsapp,
          intentosUsados: 0,
          suspendido: false,
          conceptoInfraccion: '✓ Sin infracciones',
          preguntasIntento1: [],
          preguntasIntento2: []
        };
        commitTeacherStudentsUpdate(
          [newRecord, ...students],
          newRecord,
          `✓ Estudiante ${cleanName} (${cleanId}) registrado en la Base de Datos del Servidor con código ${cleanCode}.`
        );
        await handleExecuteServerSave(
          `nuevo_estudiante_${cleanId}`,
          `Nuevo estudiante ${cleanName} (${cleanId}) guardado en BD del Servidor`
        );
      }
      setStudentCodeDrafts((prev) => {
        const next = { ...prev };
        delete next[cleanId];
        if (editingOriginalId) delete next[editingOriginalId];
        return next;
      });
      setStudentModalOpen(false);
    } finally {
      setIsSavingStudentModal(false);
    }
  };

  const handleSaveDirectStudentCode = async (student: StudentRecord, rawCodeValue?: string) => {
    const cleanCode = (rawCodeValue ?? studentCodeDrafts[student.id] ?? student.codigoAcceso ?? '')
      .trim()
      .toUpperCase();
    const hasPendingChange = cleanCode !== (student.codigoAcceso || '').trim().toUpperCase();
    if (!hasPendingChange) return;

    if (cleanCode.length < 4 || cleanCode.length > 24) {
      setStudentUpdateBanner(
        '⚠️ El código de acceso debe tener entre 4 y 24 caracteres.'
      );
      return;
    }

    setSavingStudentCodeId(student.id);
    setIsSyncingInlineSave(true);
    try {
      const updatedRecord: StudentRecord = {
        ...student,
        codigoAcceso: cleanCode
      };
      const nextStudents = students.map((s) => (s.id === student.id ? updatedRecord : s));
      commitTeacherStudentsUpdate(
        nextStudents,
        updatedRecord,
        `✓ Código de Acceso de ${student.nombre} actualizado a "${cleanCode}" y confirmado por el servidor.`
      );
      await handleExecuteServerSave(
        `codigo_acceso_${student.id}`,
        `Código de Acceso de ${student.nombre} (${cleanCode}) guardado en BD del Servidor`
      );
      setStudentCodeDrafts((prev) => {
        const next = { ...prev };
        delete next[student.id];
        return next;
      });
      setInlineEditingCodeStudentId(null);
      setInlineCodeInputValue('');
    } finally {
      setSavingStudentCodeId(null);
      setIsSyncingInlineSave(false);
    }
  };

  const handleSaveInlineStudentCode = async (student: StudentRecord) => {
    await handleSaveDirectStudentCode(student, inlineCodeInputValue);
  };

  // Open Batch / Selection Access Code Editor Modal
  const openBatchAccessCodeEditor = (initialScope?: 'all' | 'selected') => {
    const scopeToUse =
      initialScope ?? (selectedStudentIdsForBatch.length > 0 ? 'selected' : 'all');
    setBatchCodeScope(scopeToUse);
    const initialMap: Record<string, string> = {};
    students.forEach((s) => {
      initialMap[s.id] = s.codigoAcceso;
    });
    setBatchCodeCustomDrafts(initialMap);
    setBatchCodeFeedback(null);
    setBatchAccessCodeModalOpen(true);
  };

  // Preview or compute next code for a student given current batch strategy
  const computePreviewBatchCodeForStudent = (st: StudentRecord, idx: number): string => {
    const cleanBase = (batchCodeBaseInput || 'MM26').trim().toUpperCase().replace(/\s+/g, '');
    if (batchCodeStrategy === 'unified') {
      return (cleanBase || 'MM26GRUPO').slice(0, 24);
    }
    if (batchCodeStrategy === 'prefix_doc4') {
      const last4 = st.id.replace(/\D/g, '').slice(-4).padStart(4, '0');
      return `${(cleanBase || 'MM26').slice(0, 18)}${last4}`.slice(0, 24);
    }
    if (batchCodeStrategy === 'prefix_seq') {
      const seq = String(idx + 1).padStart(2, '0');
      return `${(cleanBase || 'MM26').slice(0, 20)}${seq}`.slice(0, 24);
    }
    if (batchCodeStrategy === 'deterministic') {
      return generateDeterministicAccessCode(st.id).toUpperCase();
    }
    const customVal = (batchCodeCustomDrafts[st.id] ?? st.codigoAcceso ?? '').trim().toUpperCase();
    return customVal.slice(0, 24);
  };

  const handleApplyAndSaveBatchAccessCodes = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSavingBatchCodes) return;

    const targetIds =
      batchCodeScope === 'selected'
        ? selectedStudentIdsForBatch
        : students.map((s) => s.id);

    if (targetIds.length === 0) {
      setBatchCodeFeedback(
        '⚠️ No hay estudiantes seleccionados. Marque al menos un estudiante en la lista o elija "Todos los estudiantes".'
      );
      return;
    }

    const targetSet = new Set(targetIds);
    let targetIndex = 0;
    const invalidStudents: string[] = [];

    const nextStudents = students.map((st) => {
      if (!targetSet.has(st.id)) return st;
      const newCode = computePreviewBatchCodeForStudent(st, targetIndex++);
      if (newCode.length < 4 || newCode.length > 24) {
        invalidStudents.push(st.nombre);
      }
      return {
        ...st,
        codigoAcceso: newCode
      };
    });

    if (invalidStudents.length > 0) {
      setBatchCodeFeedback(
        `⚠️ El código de acceso debe tener entre 4 y 24 caracteres. Revise: ${invalidStudents
          .slice(0, 3)
          .join(', ')}.`
      );
      return;
    }

    setIsSavingBatchCodes(true);
    try {
      const msg =
        batchCodeScope === 'all'
          ? `✓ Códigos de Acceso actualizados para TODOS los ${targetIds.length} estudiantes y guardados en la Base de Datos del Servidor.`
          : `✓ Códigos de Acceso actualizados para ${targetIds.length} estudiante(s) seleccionado(s) y guardados en la Base de Datos del Servidor.`;

      commitTeacherStudentsUpdate(nextStudents, undefined, msg);
      await handleExecuteServerSave('nomina_estudiantes', msg);
      setStudentCodeDrafts((prev) => {
        const next = { ...prev };
        targetIds.forEach((id) => delete next[id]);
        return next;
      });
      setBatchCodeFeedback(msg);
      setTimeout(() => {
        setBatchAccessCodeModalOpen(false);
        setBatchCodeFeedback(null);
      }, 900);
    } finally {
      setIsSavingBatchCodes(false);
    }
  };

  const pendingPinAulaChange =
    (pinAulaDraft || '').trim().toUpperCase() !== (config.pinAulaDia || '').trim().toUpperCase();

  const handleSavePinAula = async () => {
    if (!pendingPinAulaChange || isSavingPinAula) return;
    const cleanPin = (pinAulaDraft || '').trim().toUpperCase() || 'AULA26';
    setIsSavingPinAula(true);
    try {
      commitTeacherConfigUpdate({
        ...config,
        pinAulaDia: cleanPin
      });
      await handleExecuteServerSave(
        'pin_aula_dia',
        `PIN de Aula del Día (${cleanPin}) guardado en BD del Servidor`
      );
    } finally {
      setIsSavingPinAula(false);
    }
  };

  const pendingMensajeSalaChange =
    (mensajeSalaDraft || '').trim() !== (config.mensajeSalaEspera || '').trim();

  const handleSaveMensajeSala = async () => {
    if (!pendingMensajeSalaChange || isSavingMensajeSala) return;
    setIsSavingMensajeSala(true);
    try {
      commitTeacherConfigUpdate({
        ...config,
        mensajeSalaEspera: mensajeSalaDraft
      });
      await handleExecuteServerSave(
        'mensaje_sala_espera',
        'Mensaje de Sala de Espera guardado en BD del Servidor'
      );
    } finally {
      setIsSavingMensajeSala(false);
    }
  };

  const pendingExamParamsChange =
    Number(examParamsDraft.preguntasExamenIntegral) !== Number(config.preguntasExamenIntegral ?? 40) ||
    Number(examParamsDraft.tiempoExamenIntegralMin) !== Number(config.tiempoExamenIntegralMin ?? 80) ||
    Number(examParamsDraft.preguntasExamenModulo) !== Number(config.preguntasExamenModulo ?? 25) ||
    Number(examParamsDraft.tiempoExamenModuloMin) !== Number(config.tiempoExamenModuloMin ?? 50) ||
    Number(examParamsDraft.notaMinimaAprobacion) !== Number(config.notaMinimaAprobacion ?? 3.0);

  const handleSaveExamParams = async () => {
    if (!pendingExamParamsChange || isSavingExamParams) return;
    setIsSavingExamParams(true);
    try {
      commitTeacherConfigUpdate({
        ...config,
        preguntasExamenIntegral: Math.max(5, Number(examParamsDraft.preguntasExamenIntegral) || 40),
        tiempoExamenIntegralMin: Math.max(5, Number(examParamsDraft.tiempoExamenIntegralMin) || 80),
        preguntasExamenModulo: Math.max(5, Number(examParamsDraft.preguntasExamenModulo) || 25),
        tiempoExamenModuloMin: Math.max(5, Number(examParamsDraft.tiempoExamenModuloMin) || 50),
        notaMinimaAprobacion: Math.min(
          5.0,
          Math.max(1.0, Number(examParamsDraft.notaMinimaAprobacion) || 3.0)
        )
      });
      await handleExecuteServerSave(
        'parametros_y_horarios_examen',
        'Parámetros del Constructor de Pruebas actualizados automáticamente en BD del Servidor'
      );
    } finally {
      setIsSavingExamParams(false);
    }
  };

  // Guardado automático de PIN de Aula al detectar cambios
  useEffect(() => {
    if (!pendingPinAulaChange || isSavingPinAula || (pinAulaDraft || '').trim().length < 3) return;
    const timer = setTimeout(() => {
      void handleSavePinAula();
    }, 650);
    return () => clearTimeout(timer);
  }, [pinAulaDraft, pendingPinAulaChange, isSavingPinAula]);

  // Guardado automático de Mensaje de Sala de Espera al detectar cambios
  useEffect(() => {
    if (!pendingMensajeSalaChange || isSavingMensajeSala) return;
    const timer = setTimeout(() => {
      void handleSaveMensajeSala();
    }, 700);
    return () => clearTimeout(timer);
  }, [mensajeSalaDraft, pendingMensajeSalaChange, isSavingMensajeSala]);

  // Guardado automático de Parámetros del Constructor de Pruebas al detectar cambios
  useEffect(() => {
    if (!pendingExamParamsChange || isSavingExamParams) return;
    const timer = setTimeout(() => {
      void handleSaveExamParams();
    }, 650);
    return () => clearTimeout(timer);
  }, [examParamsDraft, pendingExamParamsChange, isSavingExamParams]);

  // Guardado automático de Códigos de Acceso en la tabla de estudiantes al detectar cambios
  useEffect(() => {
    const entries = Object.entries(studentCodeDrafts);
    if (entries.length === 0 || savingStudentCodeId) return;
    const timer = setTimeout(() => {
      for (const [stId, draftVal] of entries) {
        const st = students.find((s) => s.id === stId);
        if (!st) continue;
        const clean = (draftVal || '').trim().toUpperCase();
        if (clean.length >= 4 && clean.length <= 24 && clean !== (st.codigoAcceso || '').trim().toUpperCase()) {
          void handleSaveDirectStudentCode(st, clean);
          break;
        }
      }
    }, 750);
    return () => clearTimeout(timer);
  }, [studentCodeDrafts, students, savingStudentCodeId]);

  // Bulk Import Students Handler (Casillas por Lote + Excel .xlsx / .xls / CSV / Texto Pegado)
  const handleBulkImportStudents = async () => {
    const fromFormRows = bulkDraftRows
      .filter((r) => r.id.trim() && r.nombre.trim())
      .map((r) => ({
        id: r.id.trim().replace(/[\s.\-,]/g, '').replace(/[^a-zA-Z0-9]/g, ''),
        nombre: r.nombre.trim().replace(/\s+/g, ' '),
        correo: r.correo.trim() || undefined,
        whatsapp: r.whatsapp.trim() || undefined,
        codigoAcceso:
          r.codigoAcceso.trim().length >= 4 && r.codigoAcceso.trim().length <= 24
            ? r.codigoAcceso.trim().toUpperCase()
            : undefined
      }))
      .filter((r) => r.id.length >= 3);

    const matrix = parseDelimitedTextToMatrix(bulkStudentText);
    const fromTextRows = extractStudentsFromMatrix(matrix);
    const parsedRows = [...fromFormRows, ...fromTextRows];

    if (parsedRows.length === 0) {
      setBulkImportStatus(
        '⚠️ No se detectaron estudiantes válidos. Ingrese al menos un estudiante en las casillas de lote (Documento y Nombre son obligatorios; Correo y WhatsApp son opcionales), pegue filas desde Excel o suba un archivo .xlsx / .csv.'
      );
      return;
    }

    const { nextStudents, addedCount, updatedCount } = mergeImportedStudents(
      students,
      parsedRows,
      bulkStudentMode
    );

    const summaryMsg =
      bulkStudentMode === 'replace'
        ? `✓ Nómina reemplazada y sincronizada en el Servidor: ${nextStudents.length} estudiante(s) activos (${addedCount} nuevos, ${updatedCount} conservados).`
        : `✓ Importación por lote completada y sincronizada en el Servidor: ${addedCount} estudiante(s) nuevos creados y ${updatedCount} actualizados (${nextStudents.length} en total).`;

    commitTeacherStudentsUpdate(nextStudents, undefined, summaryMsg);
    await handleExecuteServerSave('nomina_estudiantes', summaryMsg);
    setBulkImportStatus(summaryMsg);
    setBulkStudentText('');
    setBulkDraftRows([
      { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' },
      { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' },
      { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' }
    ]);
  };

  const handleUploadStudentExcelFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    modeOverride?: 'merge' | 'replace'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const effectiveMode = modeOverride ?? bulkStudentMode;
    try {
      setBulkImportStatus(`Procesando archivo "${file.name}"...`);
      const parsedRows = await parseStudentsFromExcelOrCsvFile(file);
      if (parsedRows.length === 0) {
        const errMsg = `⚠️ El archivo "${file.name}" no contiene filas con Documento/ID y Nombre reconocibles. Verifique que tenga una columna con el Documento (cédula/ID) y otra con el Nombre del estudiante.`;
        setBulkImportStatus(errMsg);
        setStudentUpdateBanner(errMsg);
        return;
      }

      const { nextStudents, addedCount, updatedCount } = mergeImportedStudents(
        students,
        parsedRows,
        effectiveMode
      );

      const summaryMsg =
        effectiveMode === 'replace'
          ? `✓ Archivo Excel "${file.name}" cargado (Modo Reemplazar): ${nextStudents.length} estudiante(s) guardados en la Base de Datos del Servidor.`
          : `✓ Archivo Excel "${file.name}" importado: ${addedCount} estudiante(s) nuevos y ${updatedCount} actualizados (${nextStudents.length} en total) en el Servidor.`;

      commitTeacherStudentsUpdate(nextStudents, undefined, summaryMsg);
      await handleExecuteServerSave('nomina_estudiantes', summaryMsg);
      setBulkImportStatus(summaryMsg);
    } catch (err) {
      const errMsg = `⚠️ Error al leer el archivo "${file.name}". Asegúrese de que sea un archivo Excel (.xlsx, .xls) o CSV válido.`;
      setBulkImportStatus(errMsg);
      setStudentUpdateBanner(errMsg);
      console.error(err);
    }
  };

  const downloadSampleStudentExcel = () => {
    const rows = [
      [
        'Documento',
        'Nombre Completo',
        'Correo Electrónico (Opcional)',
        'Número de WhatsApp (Opcional)',
        'Código Acceso (Opcional)'
      ],
      ['1058209901', 'Juan Camilo Restrepo', 'jcamilo@correo.com', '3101234567', ''],
      ['1058209902', 'María Fernanda Ríos', 'mrios@correo.com', '3159876543', ''],
      ['1058209903', 'Carlos Andrés Gómez', '', '', '']
    ];
    downloadExcelFile('Plantilla_Nomina_Estudiantes_EvaluaPlus.xlsx', 'Estudiantes', rows);
  };

  // CSV & Excel Export Helpers
  const downloadCsvFile = (filename: string, rows: string[][]) => {
    const csvContent =
      '\uFEFF' +
      rows
        .map((r) =>
          r
            .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
            .join(';')
        )
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportNominaAndGradesCsv = () => {
    const header = [
      'ID Estudiante',
      'Nombre Completo',
      'Correo Electrónico',
      'Número de WhatsApp',
      'Código Acceso (12 Car.)',
      `Exámenes Realizados (de ${totalExamModalitiesCount})`,
      'Exámenes Pendientes / Sin Presentar',
      'Total Intentos Realizados',
      'Total Intentos Pendientes',
      ...examModalities.map((m) => `${m.label} (Int1 / Int2 / Def / Estado)`),
      'Nota Definitiva Oficial',
      'Concepto Académico',
      'Suspensión / Infracción y Concepto'
    ];
    const formatModCell = (m: (typeof consolidatedGrades)[number]['examenesPorModalidad'][number]) => {
      const i1 = m.att1 ? `${m.att1.notaColombiana.toFixed(1)} (${m.att1.porcentaje}%)` : 'Sin presentar';
      const i2 = m.att2 ? `${m.att2.notaColombiana.toFixed(1)} (${m.att2.porcentaje}%)` : 'Sin presentar';
      const def = m.realizado ? m.notaDefinitiva.toFixed(1) : 'Pendiente';
      return `I1: ${i1} | I2: ${i2} | Def: ${def} | ${m.estado} (${m.intentosRealizados}/${m.maxIntentos} int.)`;
    };
    const rows = consolidatedGrades.map((cg) => [
      cg.student.id,
      cg.student.nombre,
      cg.student.correo || '',
      cg.student.whatsapp || '',
      cg.student.codigoAcceso,
      `${cg.examenesRealizadosCount}/${totalExamModalitiesCount}`,
      `${cg.examenesPendientesCount}/${totalExamModalitiesCount}`,
      String(cg.totalIntentosRealizados),
      String(cg.totalIntentosPendientes),
      ...cg.examenesPorModalidad.map(formatModCell),
      cg.examenesRealizadosCount > 0 || cg.student.suspendido ? cg.definitiva.toFixed(1) : 'SIN PRESENTAR',
      cg.concepto,
      cg.student.suspendido ? `⚠️ Suspendido: ${cg.student.conceptoInfraccion}` : cg.student.conceptoInfraccion
    ]);
    downloadCsvFile('Calificaciones_y_Nomina_EvaluaPlus_LaDorada.csv', [header, ...rows]);
  };

  const exportNominaAndGradesExcel = () => {
    const header = [
      'ID Estudiante',
      'Nombre Completo',
      'Correo Electrónico',
      'Número de WhatsApp',
      'Código Acceso',
      `Exámenes Realizados (de ${totalExamModalitiesCount})`,
      'Exámenes Sin Presentar',
      'Intentos Realizados',
      'Intentos Pendientes',
      ...examModalities.map((m) => m.label),
      'Nota Definitiva Oficial',
      'Concepto Académico',
      'Suspensión / Infracción y Concepto'
    ];
    const formatModCell = (m: (typeof consolidatedGrades)[number]['examenesPorModalidad'][number]) => {
      const i1 = m.att1 ? `${m.att1.notaColombiana.toFixed(1)}` : 'Pendiente';
      const i2 = m.att2 ? `${m.att2.notaColombiana.toFixed(1)}` : 'Pendiente';
      return m.realizado
        ? `Realizado (${m.intentosRealizados}/${m.maxIntentos} int.) · I1:${i1} · I2:${i2} · Def:${m.notaDefinitiva.toFixed(1)} (${m.estado})`
        : `SIN PRESENTAR (0/${m.maxIntentos} int. · I1:Pendiente · I2:Pendiente)`;
    };
    const rows = consolidatedGrades.map((cg) => [
      cg.student.id,
      cg.student.nombre,
      cg.student.correo || '',
      cg.student.whatsapp || '',
      cg.student.codigoAcceso,
      cg.examenesRealizadosCount,
      cg.examenesPendientesCount,
      cg.totalIntentosRealizados,
      cg.totalIntentosPendientes,
      ...cg.examenesPorModalidad.map(formatModCell),
      cg.examenesRealizadosCount > 0 || cg.student.suspendido ? Number(cg.definitiva.toFixed(1)) : 'SIN PRESENTAR',
      cg.concepto,
      cg.student.suspendido ? `⚠️ Suspendido: ${cg.student.conceptoInfraccion}` : cg.student.conceptoInfraccion
    ]);
    downloadExcelFile('Calificaciones_y_Nomina_EvaluaPlus_LaDorada.xlsx', 'Nomina_y_Notas', [
      header,
      ...rows
    ]);
  };

  const exportQuestionsCsv = () => {
    const header = [
      'ID Pregunta',
      'Módulo',
      'Tema',
      'Nivel Bloom',
      'Enunciado',
      'Opción A',
      'Opción B',
      'Opción C',
      'Opción D',
      'Opción Correcta',
      'Justificación Pedagógica'
    ];
    const rows = questions.map((q) => [
      q.id,
      String(q.modulo),
      q.tema,
      q.bloom,
      q.enunciado,
      q.opciones.A,
      q.opciones.B,
      q.opciones.C,
      q.opciones.D,
      q.correcta,
      q.justificacion
    ]);
    downloadCsvFile(`Lote_Masivo_${questions.length}_Preguntas_Activas_EvaluaPlus.csv`, [header, ...rows]);
  };

  const exportQuestionsExcel = () => {
    const header = [
      'ID Pregunta',
      'Módulo',
      'Tema',
      'Nivel Bloom',
      'Enunciado',
      'Opción A',
      'Opción B',
      'Opción C',
      'Opción D',
      'Opción Correcta',
      'Justificación Pedagógica'
    ];
    const rows = questions.map((q) => [
      q.id,
      q.modulo,
      q.tema,
      q.bloom,
      q.enunciado,
      q.opciones.A,
      q.opciones.B,
      q.opciones.C,
      q.opciones.D,
      q.correcta,
      q.justificacion
    ]);
    downloadExcelFile(
      `Banco_${questions.length}_Preguntas_EvaluaPlus.xlsx`,
      'Banco_Preguntas',
      [header, ...rows]
    );
  };

  const exportQuestionsJson = () => {
    const blob = new Blob([JSON.stringify(questions, null, 2)], {
      type: 'application/json;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lote_Masivo_${questions.length}_Preguntas_Activas_EvaluaPlus.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savePreviousQuestionsSnapshot = (snapshot: Question[]) => {
    // Only overwrite in-memory snapshot if snapshot has items, so clearing the bank then importing doesn't lose the prior non-empty bank
    if (snapshot.length > 0) {
      setPreviousQuestionsSnapshot(snapshot);
    }
  };

  const handleClearAllQuestions = () => {
    savePreviousQuestionsSnapshot(questions);
    onUpdateQuestions([]);
    setConfirmClearAllQuestions(false);
    setQCurrentPage(1);
    setBankActionNotice(
      '✓ Se eliminó todo el banco de preguntas y se guardó el cambio en el Servidor Central. Puede cargar una nueva versión o pulsar "Deshacer última carga".'
    );
  };

  const handleUndoLastQuestionBatch = async () => {
    if (onUndoQuestionsSnapshot) {
      const restoredServerCount = await onUndoQuestionsSnapshot();
      if (restoredServerCount !== null) {
        setPreviousQuestionsSnapshot(null);
        setQCurrentPage(1);
        setBankActionNotice(
          `✓ Se deshizo la última operación desde el Servidor Central. Banco restaurado a ${restoredServerCount} reactivos activos.`
        );
        return;
      }
    }
    if (!previousQuestionsSnapshot) return;
    const restoredCount = previousQuestionsSnapshot.length;
    onUpdateQuestions(previousQuestionsSnapshot);
    setPreviousQuestionsSnapshot(null);
    setQCurrentPage(1);
    setBankActionNotice(
      `✓ Se deshizo la última operación. Banco restaurado a ${restoredCount} reactivos activos en el Servidor Central.`
    );
  };

  // Trigger Print View (Fichas Recortables, Acta Oficial PDF, or Examen en Papel Plan B)
  const triggerPrintView = (mode: 'fichas_aula' | 'acta_oficial' | 'examen_papel_plan_b') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Questions Bank Filter & Save
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (qModFilter !== 'all' && q.modulo !== qModFilter) return false;
      const term = qSearch.trim().toLowerCase();
      if (!term) return true;
      return (
        q.id.toLowerCase().includes(term) ||
        q.enunciado.toLowerCase().includes(term) ||
        q.tema.toLowerCase().includes(term)
      );
    });
  }, [questions, qModFilter, qSearch]);

  const totalQuestionPages = Math.max(1, Math.ceil(filteredQuestions.length / qPageSize));
  const safeCurrentPage = Math.min(qCurrentPage, totalQuestionPages);
  const paginatedQuestions = useMemo(() => {
    const start = (safeCurrentPage - 1) * qPageSize;
    return filteredQuestions.slice(start, start + qPageSize);
  }, [filteredQuestions, safeCurrentPage, qPageSize]);

  const openNewQuestionModal = () => {
    setEditingQuestionId(null);
    setFormQId(`MM-M1-${String(questions.length + 1).padStart(3, '0')}`);
    setFormQMod(1);
    setFormQTipoPregunta('Selección Múltiple con Única Respuesta');
    setFormQRap('RAP-M1: Aplicar fundamentos de mapeo de mercado en el contexto local.');
    setFormQContexto('Contexto empresarial y comercial de La Dorada, Caldas.');
    setFormQTema('Definición y propósito del mapeo de mercado');
    setFormQBloom('Aplicación');
    setFormQEnunciado('');
    setFormQA('');
    setFormQB('');
    setFormQC('');
    setFormQD('');
    setFormQCorrecta('A');
    setFormQJustificacion('');
    setQModalOpen(true);
  };

  const openEditQuestionModal = (q: Question) => {
    setEditingQuestionId(q.id || '');
    setFormQId(q.id || '');
    setFormQMod((q.modulo as 1 | 2 | 3 | 4 | 5) || 1);
    setFormQTipoPregunta(q.tipoPregunta || 'Selección Múltiple con Única Respuesta');
    setFormQRap(q.rap || `RAP-M${q.modulo || 1}: Competencia del Módulo ${q.modulo || 1}`);
    setFormQContexto(q.contexto || `Caso comercial aplicado en La Dorada (Módulo ${q.modulo || 1})`);
    setFormQTema(q.tema || '');
    setFormQBloom(q.bloom || 'Aplicación');
    setFormQEnunciado(q.enunciado || q.pregunta || '');
    setFormQA(q.opciones?.A || '');
    setFormQB(q.opciones?.B || '');
    setFormQC(q.opciones?.C || '');
    setFormQD(q.opciones?.D || '');
    setFormQCorrecta(q.correcta || 'A');
    setFormQJustificacion(q.justificacion || '');
    setQModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const safeEnunciado = (formQEnunciado || '').trim();
    const newQ: Question = {
      id: (formQId || '').trim() || `MM-M${formQMod}-${Date.now()}`,
      modulo: formQMod,
      tema: (formQTema || '').trim() || `Módulo ${formQMod}`,
      bloom: formQBloom,
      enunciado: safeEnunciado,
      tipoPregunta: (formQTipoPregunta || '').trim() || 'Selección Múltiple con Única Respuesta',
      nivel: formQBloom,
      rap: (formQRap || '').trim() || `RAP-M${formQMod}: Competencia del Módulo ${formQMod}`,
      contexto: (formQContexto || '').trim() || `Contexto comercial en La Dorada, Caldas`,
      pregunta: safeEnunciado,
      opciones: {
        A: (formQA || '').trim(),
        B: (formQB || '').trim(),
        C: (formQC || '').trim(),
        D: (formQD || '').trim()
      },
      correcta: formQCorrecta,
      justificacion: (formQJustificacion || '').trim()
    };

    savePreviousQuestionsSnapshot(questions);
    if (editingQuestionId) {
      onUpdateQuestions(questions.map((q) => (q.id === editingQuestionId ? newQ : q)));
    } else {
      onUpdateQuestions([newQ, ...questions]);
    }
    setQModalOpen(false);
  };

  const processImportedQuestionText = (rawText: string, mode: 'replace' | 'append', sourceLabel?: string) => {
    try {
      const parsed = JSON.parse(rawText);
      const normalizedBatch = normalizeQuestionList(parsed);
      if (normalizedBatch.length > 0) {
        savePreviousQuestionsSnapshot(questions);
        const nextBank = mode === 'replace' ? normalizedBatch : [...normalizedBatch, ...questions];
        onUpdateQuestions(nextBank);
        const actionDesc =
          mode === 'replace'
            ? `Banco de Preguntas actualizado, reemplazado y persistido en el Servidor Central con ${normalizedBatch.length} reactivos activos${sourceLabel ? ` desde "${sourceLabel}"` : ''}.`
            : `Se agregaron ${normalizedBatch.length} preguntas al banco en el Servidor Central (${nextBank.length} reactivos en total).`;
        setBulkQFeedback(`${actionDesc} Sincronizado automáticamente en todos los equipos.`);
        setBankActionNotice(`✓ ${actionDesc}`);
        setBulkQText('');
        setQCurrentPage(1);
        return;
      }
    } catch {
      // Fallback: parse delimited matrix (Excel copy-paste, CSV, TSV)
    }

    const matrix = parseDelimitedTextToMatrix(rawText);
    const added = extractQuestionsFromMatrix(matrix, questions.length);

    if (added.length > 0) {
      savePreviousQuestionsSnapshot(questions);
      const nextBank = mode === 'replace' ? added : [...added, ...questions];
      onUpdateQuestions(nextBank);
      const actionDesc =
        mode === 'replace'
          ? `Banco de Preguntas actualizado con ${added.length} reactivos desde formato Excel/CSV${sourceLabel ? ` ("${sourceLabel}")` : ''}.`
          : `Se importaron ${added.length} preguntas desde formato Excel/CSV (${nextBank.length} en total).`;
      setBulkQFeedback(`${actionDesc} Puede usar "Deshacer la última carga" si lo requiere.`);
      setBankActionNotice(`✓ ${actionDesc}`);
      setBulkQText('');
      setQCurrentPage(1);
    } else {
      setBulkQFeedback(
        'Formato no reconocido. Seleccione un archivo Excel (.xlsx, .xls), CSV (.csv) o JSON (.json) válido, o consulte "Ver Estructura de Carga".'
      );
    }
  };

  const handleBulkImportQuestions = () => {
    processImportedQuestionText(bulkQText, bulkQMode);
  };

  const handleUploadQuestionFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'replace' | 'append'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const importedQuestions = await parseQuestionsFromAnyFile(file, questions.length);
      if (importedQuestions.length > 0) {
        savePreviousQuestionsSnapshot(questions);
        const nextBank = mode === 'replace' ? importedQuestions : [...importedQuestions, ...questions];
        onUpdateQuestions(nextBank);
        const actionDesc =
          mode === 'replace'
            ? `Banco de Preguntas actualizado y reemplazado en el Servidor Central con ${importedQuestions.length} reactivos desde "${file.name}".`
            : `Se agregaron ${importedQuestions.length} preguntas desde "${file.name}" al Banco del Servidor (${nextBank.length} reactivos en total).`;
        setBulkQFeedback(`✓ ${actionDesc}`);
        setBankActionNotice(`✓ ${actionDesc}`);
        setQCurrentPage(1);
      } else {
        const msg = `⚠️ No se encontraron preguntas válidas en "${file.name}". Verifique las columnas del archivo Excel (.xlsx/.xls), CSV o JSON.`;
        setBulkQFeedback(msg);
        setBankActionNotice(msg);
      }
    } catch (err) {
      console.error(err);
      const msg = `⚠️ Error al procesar el archivo "${file.name}". Verifique que sea un archivo Excel (.xlsx, .xls), CSV o JSON válido.`;
      setBulkQFeedback(msg);
      setBankActionNotice(msg);
    }
  };

  const handleRestoreOfficialUnifiedBank = () => {
    savePreviousQuestionsSnapshot(questions);
    onUpdateQuestions(INITIAL_QUESTIONS);
    setConfirmRestoreOfficialBank(false);
    setQCurrentPage(1);
    setBankActionNotice(
      `✓ Banco de Preguntas actualizado y guardado automáticamente en el Servidor con el Banco Oficial Unificado 2026 (${INITIAL_QUESTIONS.length} reactivos activos en los Módulos 1 al 5).`
    );
  };

  // Password, Recovery Email & Webhook Handlers with pendingChange and handleExecuteServerSave
  const pendingPasswordChange = Boolean(
    (currentPassInput || '').trim().length > 0 &&
      (newPassInput || '').trim().length > 0 &&
      (confirmPassInput || '').trim().length > 0 &&
      (newPassInput || '').trim() !== config.claveDocente
  );

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPasswordChange || isSavingPassword) return;
    if (currentPassInput !== config.claveDocente) {
      setPassChangeStatus({ type: 'err', msg: 'La contraseña actual ingresada es incorrecta.' });
      return;
    }
    if ((newPassInput || '').trim().length < 6) {
      setPassChangeStatus({ type: 'err', msg: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setPassChangeStatus({ type: 'err', msg: 'La confirmación de la nueva contraseña no coincide.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      commitTeacherConfigUpdate({ ...config, claveDocente: (newPassInput || '').trim() });
      await handleExecuteServerSave(
        'seguridad_y_respaldo',
        'Contraseña del Panel Docente actualizada en BD del Servidor'
      );
      setCurrentPassInput('');
      setNewPassInput('');
      setConfirmPassInput('');
      setPassChangeStatus({
        type: 'ok',
        msg: '✓ Contraseña docente actualizada y confirmada en la Base de Datos del Servidor.'
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const safeEmailInput = String(emailInput || '');
  const pendingEmailChange =
    safeEmailInput.trim() !== String(config.correoRecuperacion || '').trim() && safeEmailInput.includes('@');
  const isSavingRecoveryEmail = isSavingEmail;

  const handleSaveRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmailChange || isSavingEmail) return;
    setIsSavingEmail(true);
    try {
      commitTeacherConfigUpdate({ ...config, correoRecuperacion: safeEmailInput.trim() });
      await handleExecuteServerSave(
        'seguridad_y_respaldo',
        `Correo oficial (${safeEmailInput.trim()}) guardado en BD del Servidor`
      );
      setEmailSaveStatus('✓ Dirección de correo oficial guardada y confirmada en el servidor.');
      setTimeout(() => setEmailSaveStatus(null), 4000);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const safeWebhookUrlInput = String(webhookUrlInput || '');
  const pendingWebhookChange =
    safeWebhookUrlInput.trim() !== String(config.webhookUrl || '').trim();

  const handleSaveWebhookUrl = async () => {
    if (!pendingWebhookChange || isSavingWebhook) return;
    setIsSavingWebhook(true);
    try {
      commitTeacherConfigUpdate({ ...config, webhookUrl: safeWebhookUrlInput.trim() });
      await handleExecuteServerSave(
        'integraciones_webhook',
        'URL de Webhook Google Sheets actualizada automáticamente en BD del Servidor'
      );
      setWebhookStatus('✓ URL del Webhook actualizada automáticamente en la Base de Datos del Servidor.');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  // Guardado automático de Correo de Recuperación al detectar cambios válidos
  useEffect(() => {
    if (!pendingEmailChange || isSavingEmail || !safeEmailInput.includes('.')) return;
    const timer = setTimeout(() => {
      setIsSavingEmail(true);
      commitTeacherConfigUpdate({ ...config, correoRecuperacion: safeEmailInput.trim() });
      void handleExecuteServerSave(
        'seguridad_y_respaldo',
        `Correo oficial (${safeEmailInput.trim()}) actualizado automáticamente en BD del Servidor`
      ).finally(() => {
        setIsSavingEmail(false);
        setEmailSaveStatus('✓ Correo oficial actualizado automáticamente en la Base de Datos del Servidor.');
        setTimeout(() => setEmailSaveStatus(null), 4000);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [safeEmailInput, pendingEmailChange, isSavingEmail]);

  // Guardado automático de URL de Webhook al detectar cambios
  useEffect(() => {
    if (!pendingWebhookChange || isSavingWebhook) return;
    const timer = setTimeout(() => {
      void handleSaveWebhookUrl();
    }, 800);
    return () => clearTimeout(timer);
  }, [safeWebhookUrlInput, pendingWebhookChange, isSavingWebhook]);

  // Live Webhook Ping
  const handleTestWebhook = async () => {
    setIsSavingWebhook(true);
    setWebhookStatus('Guardando URL y enviando ping de prueba a Google Sheets Apps Script...');
    try {
      commitTeacherConfigUpdate({ ...config, webhookUrl: safeWebhookUrlInput.trim() });
      await handleExecuteServerSave(
        'integraciones_webhook',
        'URL de Webhook Google Sheets sincronizada en BD del Servidor'
      );
      if (!safeWebhookUrlInput.trim()) {
        setWebhookStatus('Ingrese primero la URL del Webhook desplegado en Google Apps Script.');
        return;
      }
      await fetch(safeWebhookUrlInput.trim(), {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PING_PRUEBA_EVALUAPLUS',
          fecha: new Date().toISOString(),
          curso: 'Mapeo de Mercado y Comportamiento del Consumidor - La Dorada'
        })
      });
      setWebhookStatus('✓ URL guardada en servidor y ping enviado con éxito a Google Sheets.');
    } catch {
      setWebhookStatus('No se pudo alcanzar la URL. Verifique que el Apps Script esté publicado como "Cualquier persona".');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const googleAppsScriptCode = `// ============================================================================
// GOOGLE APPS SCRIPT OFICIAL - EVALUACIONES EVALUAPLUS (LA DORADA, CALDAS)
// Curso: Mapeo de Mercado y Comportamiento del Consumidor
// Instrucciones: Pegar en Extensiones > Apps Script y publicar como App Web
// ============================================================================

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    // 1. Hoja "Calificaciones"
    var sheetCal = doc.getSheetByName('Calificaciones');
    if (!sheetCal) {
      sheetCal = doc.insertSheet('Calificaciones');
      sheetCal.appendRow([
        'Fecha', 'Código Sesión', 'ID Estudiante', 'Nombre',
        'Intento', 'Nota (0.0-5.0)', 'Porcentaje', 'Tiempo (seg)',
        'Incidencias Anti-Trampa', 'Estado y Concepto'
      ]);
    }

    sheetCal.appendRow([
      data.fecha || new Date().toLocaleString(),
      data.codigoSesion || '',
      data.studentId || '',
      data.studentName || '',
      data.intentoNumero || 1,
      data.notaColombiana || 0,
      (data.porcentaje || 0) + '%',
      data.tiempoEmpleadoSegundos || 0,
      data.incidenciasCount || 0,
      (data.estado || '') + ' - ' + (data.conceptoInfraccion || '')
    ]);

    // 2. Hoja "Respuestas_Detalle"
    var sheetDet = doc.getSheetByName('Respuestas_Detalle');
    if (!sheetDet) {
      sheetDet = doc.insertSheet('Respuestas_Detalle');
      sheetDet.appendRow([
        'Fecha', 'ID Estudiante', 'Intento', 'ID Pregunta',
        'Módulo', 'Opción Elegida', 'Respuesta Correcta', 'Acierto', 'Justificación'
      ]);
    }

    if (data.respuestasDetalle && data.respuestasDetalle.length) {
      data.respuestasDetalle.forEach(function(item) {
        sheetDet.appendRow([
          data.fecha,
          data.studentId,
          data.intentoNumero,
          item.questionId,
          item.modulo,
          item.elegida || 'Sin responder',
          item.correcta,
          item.acierto ? 'CORRECTA' : 'INCORRECTA',
          item.justificacion
        ]);
      });
    }

    // Notificación opcional al correo del docente
    if (data.notifyEmail) {
      MailApp.sendEmail({
        to: '${config.correoRecuperacion}',
        subject: 'EvaluaPlus Nota Registrada: ' + data.studentName + ' (' + data.notaColombiana + '/5.0)',
        body: 'El estudiante ' + data.studentName + ' (ID: ' + data.studentId + ') finalizó el Intento ' + data.intentoNumero + ' con nota ' + data.notaColombiana + '/5.0.'
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

  const bloggerIframeSnippet = `<!-- Integración Ligera EvaluaPlus para Blogger / Blogspot (Modo Vista HTML) -->
<div style="position: relative; width: 100%; max-width: 1200px; margin: 0 auto; overflow: hidden; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15,23,42,0.06);">
  <iframe
    src="${window.location.origin}"
    title="EvaluaPlus - Mapeo de Mercado y Comportamiento del Consumidor"
    style="width: 100%; height: 860px; border: 0; display: block;"
    allow="fullscreen; clipboard-write"
    loading="lazy">
  </iframe>
</div>`;

  // ================= MÉTRICAS EN TIEMPO REAL PARA EL PANEL DE CONTROL CENTRAL LMS =================
  const classroomCentralMetrics = useMemo(() => {
    const totalStudents = students.length;
    const minPassGrade = config.notaMinimaAprobacion ?? 3.0;
    const evaluatedRows = consolidatedGrades.filter(
      (r) => r.student.intentosUsados > 0 || r.att1 !== null || r.att2 !== null || r.student.suspendido
    );
    const evaluatedCount = evaluatedRows.length;
    const participationPct =
      totalStudents > 0 ? Math.round((evaluatedCount / totalStudents) * 100) : 0;

    const approvedCount = evaluatedRows.filter(
      (r) => !r.student.suspendido && r.definitiva >= minPassGrade
    ).length;
    const atRiskCount = evaluatedRows.filter(
      (r) => !r.student.suspendido && r.definitiva < minPassGrade
    ).length;
    const suspendedCount = students.filter((s) => s.suspendido).length;
    const activeStudentsCount = Math.max(0, totalStudents - suspendedCount);

    const avgGrade =
      evaluatedCount > 0
        ? Number(
            (
              evaluatedRows.reduce((acc, r) => acc + r.definitiva, 0) / evaluatedCount
            ).toFixed(2)
          )
        : 0;
    const approvalRatePct =
      evaluatedCount > 0 ? Math.round((approvedCount / evaluatedCount) * 100) : 0;

    // Métricas de Clases, Promedio Académico Grupal y Alertas de Inasistencia (Bloques B1/B2)
    const syncedAcademicDs = effectiveAcademicDataset;
    const classSummaries = syncedAcademicDs.records.map((rec) => {
      const rosterMatch = students.find((s) => s.id === rec.studentId) || null;
      return computeStudentAcademicSummary(
        rec,
        rosterMatch,
        attempts,
        syncedAcademicDs.classSessions
      );
    });

    const groupClassAvg =
      classSummaries.length > 0
        ? Number(
            (
              classSummaries.reduce((acc, s) => acc + s.promedioAcumulado, 0) /
              classSummaries.length
            ).toFixed(2)
          )
        : 0;

    const combinedGroupAvg =
      evaluatedCount > 0
        ? Number(((avgGrade + groupClassAvg) / 2).toFixed(2))
        : groupClassAvg;

    const excellentClassCount = classSummaries.filter(
      (s) => s.promedioAcumulado >= 4.0
    ).length;
    const approvedClassCount = classSummaries.filter(
      (s) => s.promedioAcumulado >= minPassGrade
    ).length;
    const atRiskClassCount = classSummaries.filter(
      (s) => s.promedioAcumulado < minPassGrade
    ).length;
    const classApprovalRatePct =
      classSummaries.length > 0
        ? Math.round((approvedClassCount / classSummaries.length) * 100)
        : 0;

    const criticalAbsenceStudents = classSummaries.filter(
      (s) => s.riesgoAusentismo === 'CRITICO'
    );
    const moderateAbsenceStudents = classSummaries.filter(
      (s) => s.riesgoAusentismo === 'MODERADO'
    );
    const perfectAttendanceCount = classSummaries.filter(
      (s) => s.riesgoAusentismo === 'PERFECTA'
    ).length;
    const totalAbsenceAlertsCount =
      criticalAbsenceStudents.length + moderateAbsenceStudents.length;
    const avgAttendancePct =
      classSummaries.length > 0
        ? Math.round(
            classSummaries.reduce((acc, s) => acc + s.porcentajeAsistencia, 0) /
              classSummaries.length
          )
        : 100;

    let totalBadgesUnlocked = 0;
    let studentsWithAllBadges = 0;
    const modCount = Math.max(1, activeCourseMeta.modulosCurso.length);
    students.forEach((st) => {
      let stBadges = 0;
      activeCourseMeta.modulosCurso.forEach((modItem) => {
        const mKey = modItem.id as 1 | 2 | 3 | 4 | 5;
        if (st.progresoRetos?.[mKey]?.insigniaDesbloqueada) {
          totalBadgesUnlocked++;
          stBadges++;
        }
      });
      if (stBadges >= modCount) {
        studentsWithAllBadges++;
      }
    });

    const liveFocusAlerts = liveSessions.filter((s) => (s.advertencias || 0) > 0).length;

    // Contadores dinámicos de tareas pendientes por calificar / revisar en el menú lateral
    const pendingWorksCount = classSummaries.reduce(
      (acc, s) => acc + (s.trabajosPendientesRevisionCount || 0),
      0
    );
    const pendingExcusesCount = classSummaries.reduce(
      (acc, s) => acc + (s.excusasPendientesRevisionCount || 0),
      0
    );

    // Cruce de Alertas Tempranas Automatizadas («Riesgo Académico Integral»: ≥ 2 factores simultáneos)
    const integralRiskStudents = classSummaries
      .map((s) => {
        const rosterSt = students.find((st) => st.id === s.record.studentId) || null;
        const infraccionesCount = Array.isArray(rosterSt?.historialLlamadosAtencion)
          ? rosterSt!.historialLlamadosAtencion.length
          : rosterSt?.advertenciasCambioFoco || 0;
        const isSuspended = Boolean(rosterSt?.suspendido);

        const hasAbsenceRisk = s.totalFallasBloques >= 2;
        const hasGradeRisk = s.promedioAcumulado < minPassGrade;
        const hasInfractionRisk = isSuspended || infraccionesCount >= 2;

        const factors: string[] = [];
        if (hasAbsenceRisk) {
          factors.push(`${s.totalFallasBloques} fallas de asistencia (≥ 2)`);
        }
        if (hasGradeRisk) {
          factors.push(`Nota acumulada ${s.promedioAcumulado.toFixed(1)} (< ${minPassGrade.toFixed(1)})`);
        }
        if (hasInfractionRisk) {
          factors.push(
            isSuspended
              ? `Turno bloqueado + ${infraccionesCount} infracción(es)`
              : `${infraccionesCount} infracciones anti-trampa`
          );
        }

        return {
          studentId: s.record.studentId,
          nombre: s.record.nombre,
          documento: s.record.documento,
          correo: rosterSt?.correo || '',
          whatsapp: rosterSt?.whatsapp || '',
          fallasCount: s.totalFallasBloques,
          promedioAcumulado: s.promedioAcumulado,
          infraccionesCount,
          isSuspended,
          factorsCount: factors.length,
          factors,
          planChoqueActivo: Boolean(
            s.record.reemplazoExamenIntegralAplicado || s.record.bonificacionRetosAplicada
          )
        };
      })
      .filter((item) => item.factorsCount >= 2)
      .sort((a, b) => {
        if (b.factorsCount !== a.factorsCount) return b.factorsCount - a.factorsCount;
        return a.promedioAcumulado - b.promedioAcumulado;
      });

    return {
      totalStudents,
      activeStudentsCount,
      evaluatedCount,
      participationPct,
      approvedCount,
      atRiskCount,
      suspendedCount,
      avgGrade,
      approvalRatePct,
      groupClassAvg,
      combinedGroupAvg,
      excellentClassCount,
      approvedClassCount,
      atRiskClassCount,
      classApprovalRatePct,
      criticalAbsenceStudents,
      moderateAbsenceStudents,
      perfectAttendanceCount,
      totalAbsenceAlertsCount,
      avgAttendancePct,
      totalBadgesUnlocked,
      studentsWithAllBadges,
      liveFocusAlerts,
      pendingWorksCount,
      pendingExcusesCount,
      integralRiskStudents
    };
  }, [students, consolidatedGrades, config.notaMinimaAprobacion, liveSessions, effectiveAcademicDataset, attempts]);

  // ================= PROTECTED TEACHER LOGIN SCREEN (NEVER EXPOSES PASSWORD) =================
  if (!isAuthenticated) {
    const mailtoHref = `mailto:${encodeURIComponent(
      config.correoRecuperacion
    )}?subject=${encodeURIComponent(
      'Solicitud de Recuperación de Clave Docente - EvaluaPlus'
    )}&body=${encodeURIComponent(
      'Estimado Coordinador / Administrador Académico,\n\nSolicito el envío o restablecimiento de la credencial de acceso al Panel Docente de la plataforma EvaluaPlus.\n\nAtentamente,\nDocente'
    )}`;

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
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
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Docente</h1>
          </div>

          {authDenied && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 text-xs text-red-900">
              <div className="font-bold flex items-center gap-2 text-red-800">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Restricción de Seguridad: Acceso Denegado</span>
              </div>
              <p className="leading-relaxed">
                La credencial ingresada no es válida o está vacía. Por protocolo de seguridad institucional, el sistema <strong>nunca expone claves en pantalla</strong>. Solicite su contraseña directamente al correo oficial configurado: <strong>{config.correoRecuperacion}</strong>
              </p>
              <a
                href={mailtoHref}
                className="w-full py-2.5 px-3 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Solicitar enviar al correo del docente</span>
              </a>
            </div>
          )}

          <form onSubmit={handleTeacherLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="teacher-id" className="block text-xs font-semibold text-slate-800">
                ID del Docente
              </label>
              <input
                id="teacher-id"
                type="text"
                required
                autoComplete="off"
                value={teacherIdAttempt}
                onChange={(e) => setTeacherIdAttempt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="teacher-pin" className="block text-xs font-semibold text-slate-800">
                Código de Acceso de Sesión
              </label>
              <input
                id="teacher-pin"
                type="password"
                required
                autoComplete="off"
                value={pinAttempt}
                onChange={(e) => setPinAttempt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ================= PRINT-ONLY VIEWS (FICHAS RECORTABLES O ACTA OFICIAL PDF) =================
  if (printMode === 'fichas_aula') {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6 bg-white">
        <div className="flex items-center justify-between border-b border-slate-300 pb-4 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Vista de Impresión: Fichas Individuales Recortables para Aula (37 Estudiantes)
            </h2>
            <p className="text-xs text-slate-600">
              Recorte y entregue cada ficha en mano al inicio de la sesión presencial en La Dorada.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Planilla Ahora</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('none')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
            >
              Volver al Panel Docente
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((st, idx) => (
            <div
              key={st.id}
              className="border-2 border-dashed border-slate-400 rounded-lg p-4 space-y-2 break-inside-avoid"
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-b border-slate-200 pb-1">
                <span>TÉCNICO MARKETING DIGITAL · LA DORADA</span>
                <span>FICHA #{idx + 1}</span>
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">{st.nombre}</div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded p-2">
                  <div className="text-[10px] text-slate-500">ID Estudiante (Documento)</div>
                  <div className="text-xs font-mono font-bold text-slate-900">{st.id}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-2">
                  <div className="text-[10px] text-slate-500">Código Único (12 Car.)</div>
                  <div className="text-xs font-mono font-bold text-sky-900">{st.codigoAcceso}</div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500">
                Curso: Mapeo de Mercado y Comportamiento del Consumidor · Máximo 2 intentos.
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (printMode === 'acta_oficial') {
    const evaluados = consolidatedGrades.filter((c) => c.student.intentosUsados > 0 || c.student.suspendido);
    const aprobados = consolidatedGrades.filter((c) => c.concepto === 'APROBADO');
    const promedioCurso =
      evaluados.length > 0
        ? (evaluados.reduce((acc, c) => acc + c.definitiva, 0) / evaluados.length).toFixed(2)
        : '0.00';
    const pctAprobacion =
      evaluados.length > 0 ? Math.round((aprobados.length / evaluados.length) * 100) : 0;

    return (
      <div className="max-w-5xl mx-auto p-8 space-y-6 bg-white text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 no-print">
          <div className="text-xs text-slate-600">
            Vista Previa del Acta Oficial de Calificaciones (Escala Colombiana 0.0 a 5.0)
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar como PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('none')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
            >
              Volver al Panel Docente
            </button>
          </div>
        </div>

        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Articulación Educación Media y Técnica Profesional · La Dorada, Caldas
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              ACTA OFICIAL DE CALIFICACIONES POR COMPETENCIAS
            </h1>
            <div className="text-xs text-slate-700 mt-1">
              Programa: <strong>Técnico Profesional en Marketing Digital</strong> · Asignatura:{' '}
              <strong>Mapeo de Mercado y Comportamiento del Consumidor (36 Horas)</strong>
            </div>
          </div>
          <div className="text-right font-mono text-xs space-y-0.5">
            <div>Fecha Emisión: {new Date().toLocaleDateString('es-CO')}</div>
            <div>Escala Oficial: 0.0 a 5.0 (Aprueba ≥ 3.0)</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="border border-slate-300 rounded-lg p-3">
            <div className="text-xs text-slate-500">Matrícula Total</div>
            <div className="text-lg font-bold font-mono">{students.length}</div>
          </div>
          <div className="border border-slate-300 rounded-lg p-3">
            <div className="text-xs text-slate-500">Estudiantes Evaluados</div>
            <div className="text-lg font-bold font-mono">{evaluados.length}</div>
          </div>
          <div className="border border-slate-300 rounded-lg p-3">
            <div className="text-xs text-slate-500">Promedio del Curso</div>
            <div className="text-lg font-bold font-mono">{promedioCurso} / 5.0</div>
          </div>
          <div className="border border-slate-300 rounded-lg p-3">
            <div className="text-xs text-slate-500">% de Aprobación</div>
            <div className="text-lg font-bold font-mono">{pctAprobacion}%</div>
          </div>
        </div>

        <table className="w-full text-left border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="py-2 px-3 border-r border-slate-300">#</th>
              <th className="py-2 px-3 border-r border-slate-300">Documento ID</th>
              <th className="py-2 px-3 border-r border-slate-300">Nombre del Estudiante</th>
              <th className="py-2 px-3 border-r border-slate-300 text-right">Intento 1</th>
              <th className="py-2 px-3 border-r border-slate-300 text-right">Intento 2</th>
              <th className="py-2 px-3 border-r border-slate-300 text-right">Definitiva</th>
              <th className="py-2 px-3 border-r border-slate-300">Concepto Académico</th>
              <th className="py-2 px-3">Auditoría Anti-Fraude</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {consolidatedGrades.map((row, idx) => (
              <tr key={row.student.id}>
                <td className="py-1.5 px-3 border-r border-slate-300 font-mono">{idx + 1}</td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-mono">{row.student.id}</td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-medium">{row.student.nombre}</td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-mono text-right">
                  {row.att1 ? row.att1.notaColombiana.toFixed(1) : '-'}
                </td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-mono text-right">
                  {row.att2 ? row.att2.notaColombiana.toFixed(1) : '-'}
                </td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-mono font-bold text-right">
                  {row.student.intentosUsados > 0 || row.student.suspendido ? row.definitiva.toFixed(1) : '-'}
                </td>
                <td className="py-1.5 px-3 border-r border-slate-300 font-semibold">{row.concepto}</td>
                <td className="py-1.5 px-3 text-[11px]">
                  {row.student.suspendido
                    ? `⚠️ Suspendido: ${row.student.conceptoInfraccion}`
                    : row.student.conceptoInfraccion}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-12 pt-16 text-center text-xs">
          <div className="border-t border-slate-900 pt-2">
            <div className="font-bold">Firma del Docente Titular / Instructor</div>
            <div className="text-slate-600">Mapeo de Mercado y Comportamiento del Consumidor</div>
          </div>
          <div className="border-t border-slate-900 pt-2">
            <div className="font-bold">Firma de Coordinación Académica</div>
            <div className="text-slate-600">Sede La Dorada, Caldas</div>
          </div>
        </div>
      </div>
    );
  }

  // ================= PLAN B PRINT VIEW: EXAMEN EN PAPEL (FILAS A, B y C + HOJA DE ÓVALOS + CLAVE DEL PROFESOR) =================
  if (printMode === 'examen_papel_plan_b') {
    return (
      <div className="max-w-5xl mx-auto p-8 space-y-8 bg-white text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 pb-4 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Plan B de Contingencia por Corte Eléctrico Total (Filas A, B y C · 20 Preguntas c/u)
            </h2>
            <p className="text-xs text-slate-600">
              Incluye los 3 cuadernillos distintos (Fila A, Fila B y Fila C), Hoja de Respuestas con Óvalos A-B-C-D y Clave Maestra del Profesor.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Cuadernillos Plan B y Clave</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('none')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Volver al Banco de Preguntas
            </button>
          </div>
        </div>

        {paperExamVersions.map((ver) => (
          <div key={ver.fila} className="space-y-5 border-b-2 border-slate-900 pb-8 break-after-page">
            <div className="border-2 border-slate-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-bold uppercase text-slate-600">
                  PLAN B CONTINGENCIA ELÉCTRICA · TÉCNICO PROFESIONAL EN MARKETING DIGITAL (LA DORADA)
                </div>
                <h1 className="text-xl font-bold text-slate-900">
                  EVALUACIÓN IMPRESA — CUADERNILLO FILA {ver.fila} (20 REACTIVOS)
                </h1>
                <div className="text-xs text-slate-700 mt-1">
                  Nombre del Estudiante: _______________________________________ Documento ID: ___________________
                </div>
              </div>
              <div className="text-right font-mono text-xs border border-slate-400 rounded-lg px-3 py-2">
                <div className="font-bold text-base">FILA {ver.fila}</div>
                <div>Escala: 0.0 a 5.0</div>
              </div>
            </div>

            {/* Hoja de Respuestas de Óvalos (A-B-C-D) integrada al inicio de cada Fila */}
            <div className="border border-slate-400 rounded-xl p-4 space-y-2 bg-slate-50/50">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Hoja de Respuestas Oficial (Rellene completamente el óvalo A, B, C o D) — Fila {ver.fila}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 text-xs font-mono pt-1">
                {ver.items.map((_, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border border-slate-300 rounded px-2 py-1 bg-white"
                  >
                    <span className="font-bold">{String(idx + 1).padStart(2, '0')}.</span>
                    <div className="flex items-center gap-1.5">
                      {(['A', 'B', 'C', 'D'] as const).map((letOpt) => (
                        <span
                          key={letOpt}
                          className="w-5 h-5 rounded-full border border-slate-700 inline-flex items-center justify-center text-[10px]"
                        >
                          {letOpt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Listado de 20 Preguntas de la Fila */}
            <div className="space-y-3 text-xs">
              {ver.items.map((q, idx) => (
                <div key={`${ver.fila}-${q.id}-${idx}`} className="border-b border-slate-200 pb-2.5 break-inside-avoid">
                  <div className="font-bold text-slate-900">
                    {idx + 1}. [Módulo {q.modulo} · {q.id}] {q.enunciado}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-1 pl-3 text-slate-800">
                    <div>A) {q.opciones.A}</div>
                    <div>B) {q.opciones.B}</div>
                    <div>C) {q.opciones.C}</div>
                    <div>D) {q.opciones.D}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Clave Maestra del Profesor para Calificación Rápida de Filas A, B y C */}
        <div className="border-2 border-slate-900 rounded-xl p-6 space-y-4 break-inside-avoid">
          <div>
            <span className="text-xs font-mono font-bold uppercase text-sky-800">
              USO EXCLUSIVO DEL DOCENTE TITULAR · NO ENTREGAR A LOS ESTUDIANTES
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              CLAVE MAESTRA DE RESPUESTAS DEL PROFESOR (FILA A, FILA B Y FILA C)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono">
            {paperExamVersions.map((ver) => (
              <div key={ver.fila} className="border border-slate-300 rounded-lg p-3.5 space-y-2">
                <div className="font-bold text-sm border-b border-slate-200 pb-1 text-slate-900">
                  CLAVE OFICIAL — FILA {ver.fila}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ver.items.map((q, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded">
                      <span>#{String(idx + 1).padStart(2, '0')} ({q.id}):</span>
                      <strong className="text-emerald-800">{q.correcta}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ================= SECCIONES PRINCIPALES TABULARES Y SIDEBAR PERSISTENTE =================
  const primaryTabularSections = [
    {
      pillarId: 'resumen',
      tab: 'panel_central' as TeacherTab,
      label: 'Resumen',
      fullLabel: 'Resumen y Panel de Control Central',
      badge: 'Inicio',
      icon: Monitor,
      relatedTabs: ['panel_central', 'resumen_academico'] as TeacherTab[],
      subTabs: [
        { id: 'panel_central' as TeacherTab, label: 'Dashboard de Métricas y Tarjetas', badge: 'Hub' },
        { id: 'resumen_academico' as TeacherTab, label: `Resumen Académico (C1–C${Math.max(1, activeCourseMeta.cantidadModulos)})`, badge: `C1–C${Math.max(1, activeCourseMeta.cantidadModulos)}` }
      ]
    },
    {
      pillarId: 'estudiantes',
      tab: 'estudiantes' as TeacherTab,
      label: 'Estudiantes',
      fullLabel: 'Control de Estudiantes, Clases y Asistencia',
      badge: `${students.length} activos`,
      icon: Users,
      relatedTabs: ['estudiantes', 'gestion_academica_clases', 'resumen_asistencia', 'seguridad_convivencia', 'monitor_vivo'] as TeacherTab[],
      subTabs: [
        { id: 'estudiantes' as TeacherTab, label: 'Nómina Oficial y Códigos de Acceso', badge: `${students.length}` },
        { id: 'gestion_academica_clases' as TeacherTab, label: `Clases C1–C${activeCourseMeta.cantidadModulos} y Asistencia`, badge: `${classroomCentralMetrics.totalAbsenceAlertsCount} alertas` },
        { id: 'resumen_asistencia' as TeacherTab, label: 'Resumen de Asistencia (Gráfico de Inasistencias)', badge: `${classroomCentralMetrics.avgAttendancePct}%` },
        { id: 'seguridad_convivencia' as TeacherTab, label: 'Seguridad y Convivencia (Infracciones Anti-Trampa)', badge: 'Convivencia' },
        { id: 'monitor_vivo' as TeacherTab, label: 'Monitor de Aula en Vivo', badge: `${liveSessions.length} online` }
      ]
    },
    {
      pillarId: 'examenes',
      tab: 'gestor_examenes' as TeacherTab,
      label: 'Exámenes',
      fullLabel: 'Gestor Docente de Exámenes Oficiales, Calificaciones y Banco de Ítems',
      badge: `${attempts.length} entregas`,
      icon: FileSpreadsheet,
      relatedTabs: ['gestor_examenes', 'calificaciones', 'consolidado_abpro'] as TeacherTab[],
      subTabs: [
        { id: 'gestor_examenes' as TeacherTab, label: `Gestor Docente de Exámenes (${activeCourseMeta.cantidadExamenes}/${activeCourseMeta.cantidadExamenes})`, badge: `${attempts.length}` },
        { id: 'calificaciones' as TeacherTab, label: 'Calificaciones de Exámenes y Auditoría', badge: `${attempts.length}` },
        { id: 'consolidado_abpro' as TeacherTab, label: 'Consolidado Multi-Corte y ABPro', badge: '3 cortes' }
      ]
    },
    {
      pillarId: 'retos',
      tab: 'mini_retos' as TeacherTab,
      label: 'Retos',
      fullLabel: 'Mini Retos IA, Insignias y Analítica Grupal',
      badge: `${classroomCentralMetrics.totalBadgesUnlocked} insignias`,
      icon: Trophy,
      relatedTabs: ['mini_retos', 'estadisticas_grupo', 'diagnostico', 'diagnostico_sistema', 'integraciones', 'seguridad_correo'] as TeacherTab[],
      subTabs: [
        { id: 'mini_retos' as TeacherTab, label: `Mini Retos e Insignias (${activeCourseMeta.cantidadRetos})`, badge: `${classroomCentralMetrics.totalBadgesUnlocked} insig.` },
        { id: 'estadisticas_grupo' as TeacherTab, label: 'Estadísticas del Grupo', badge: 'Gráficos' },
        { id: 'diagnostico' as TeacherTab, label: 'Psicometría y Taxonomía Bloom', badge: 'Bloom' },
        { id: 'diagnostico_sistema' as TeacherTab, label: 'Diagnóstico de Sistema (Caché y API)', badge: 'Latencia' },
        { id: 'integraciones' as TeacherTab, label: 'Google Sheets y Despliegue', badge: 'Nube' },
        { id: 'seguridad_correo' as TeacherTab, label: 'Seguridad, Claves y Respaldos', badge: 'JSON' }
      ]
    }
  ];

  const activePrimaryPillar =
    primaryTabularSections.find((p) => p.relatedTabs.includes(activeTab)) ||
    primaryTabularSections[0];

  // ================= LMS NAVIGATION CATEGORIES & WINDOWS DEFINITION =================
  const lmsCategories = [
    {
      categoryId: 'aula_asistencia',
      categoryTitle: '1. Gestión de Aula, Curso y Asistencia',
      items: [
        {
          id: 'panel_central' as TeacherTab,
          label: 'Panel de Control Central LMS',
          shortLabel: 'Panel Central',
          subtitle: 'Resumen visual de métricas del aula y cuadrícula de funciones',
          badge: 'Hub LMS',
          icon: Monitor
        },
        {
          id: 'estudiantes' as TeacherTab,
          label: 'Nómina y Códigos',
          shortLabel: 'Nómina',
          subtitle: 'Listado oficial, Excel, códigos y bloqueos',
          badge: `${students.length} alumnos`,
          icon: Users
        },
        {
          id: 'calificaciones' as TeacherTab,
          label: `Calificaciones y Asistencias (Clases C1–C${activeCourseMeta.cantidadModulos})`,
          shortLabel: 'Calificaciones y Asistencias',
          subtitle: `Notas manuales por componente, clases C1 a C${activeCourseMeta.cantidadModulos}, llamado virtual de asistencia y consolidado`,
          badge: `${activeCourseMeta.cantidadModulos} clases`,
          icon: GraduationCap
        },
        {
          id: 'resumen_asistencia' as TeacherTab,
          label: 'Resumen de Asistencia (Consolidado Gráfico de Inasistencias)',
          shortLabel: 'Resumen de Asistencia',
          subtitle: 'Consolidación gráfica de inasistencias por estudiante y por bloque basada en el academicDataset',
          badge: `${classroomCentralMetrics.avgAttendancePct}% asist.`,
          icon: BarChart3
        },
        {
          id: 'seguridad_convivencia' as TeacherTab,
          label: 'Seguridad y Convivencia (Infracciones Anti-Trampa)',
          shortLabel: 'Seguridad y Convivencia',
          subtitle: 'Ranking e historial de estudiantes con más infracciones detectadas en historialLlamadosAtencion',
          badge: 'Anti-Trampa',
          icon: ShieldAlert
        },
        {
          id: 'monitor_vivo' as TeacherTab,
          label: 'Monitor de Aula en Vivo',
          shortLabel: 'Monitor Vivo',
          subtitle: 'Supervisión de dispositivos activos en tiempo real',
          badge: `${liveSessions.length} en línea`,
          icon: Activity
        }
      ]
    },
    {
      categoryId: 'evaluaciones_banco',
      categoryTitle: '2. Evaluaciones y Banco de Ítems',
      items: [
        {
          id: 'gestor_examenes' as TeacherTab,
          label: `Gestor Docente de Exámenes Oficiales & Auditoría de Estado (${activeCourseMeta.cantidadExamenes}/${activeCourseMeta.cantidadExamenes})`,
          shortLabel: 'Gestor Exámenes',
          subtitle: 'Estado exclusivo de exámenes, intentos, reinicios y bloqueo por modalidad',
          badge: `${activeCourseMeta.cantidadExamenes}/${activeCourseMeta.cantidadExamenes} exám.`,
          icon: FileSpreadsheet
        },
        {
          id: 'mini_retos' as TeacherTab,
          label: 'Mini Retos & Insignias (IA)',
          shortLabel: 'Mini Retos IA',
          subtitle: `Evaluación gamificada (${activeCourseMeta.cantidadRetos} retos configurados)`,
          badge: `${activeCourseMeta.cantidadRetos} retos`,
          icon: Trophy
        },
        {
          id: 'consolidado_abpro' as TeacherTab,
          label: 'Multi-Corte & Proyecto ABPro',
          shortLabel: 'Cortes & ABPro',
          subtitle: 'Ponderación 30% / 30% / 40% y rúbricas de proyecto',
          badge: '3 cortes',
          icon: Layers
        }
      ]
    },
    {
      categoryId: 'analitica_diagnostico',
      categoryTitle: '3. Analítica y Diagnóstico',
      items: [
        {
          id: 'resumen_academico' as TeacherTab,
          label: `Dashboard de Resumen Académico (C1–C${Math.max(1, activeCourseMeta.cantidadModulos)})`,
          shortLabel: 'Resumen Académico',
          subtitle: 'Promedios automáticos por estudiante y por competencia desde el banco único',
          badge: `C1–C${Math.max(1, activeCourseMeta.cantidadModulos)}`,
          icon: BarChart3
        },
        {
          id: 'estadisticas_grupo' as TeacherTab,
          label: 'Estadísticas del Grupo',
          shortLabel: 'Estadísticas',
          subtitle: 'Gráficos de desempeño global y comparativas',
          badge: 'Gráficos',
          icon: BarChart3
        },
        {
          id: 'diagnostico' as TeacherTab,
          label: 'Diagnóstico & Psicometría',
          shortLabel: 'Psicometría',
          subtitle: 'Taxonomía de Bloom, RAPs e índice de dificultad',
          badge: 'Bloom & RAP',
          icon: BarChart3
        },
        {
          id: 'diagnostico_sistema' as TeacherTab,
          label: 'Diagnóstico de Sistema (Caché, API y Latencia)',
          shortLabel: 'Diagnóstico Sistema',
          subtitle: 'Verificación de esquema local, errores de caché y latencia del servidor',
          badge: 'Telemetría',
          icon: Activity
        }
      ]
    },
    {
      categoryId: 'sistema_seguridad',
      categoryTitle: '4. Administración, Nube y Seguridad',
      items: [
        {
          id: 'integraciones' as TeacherTab,
          label: 'Google Sheets & Despliegue Web',
          shortLabel: 'Integraciones',
          subtitle: 'Webhook Apps Script, sincronización e iframe',
          badge: 'Nube',
          icon: Code2
        },
        {
          id: 'seguridad_correo' as TeacherTab,
          label: 'Seguridad, Claves & Respaldos',
          shortLabel: 'Seguridad',
          subtitle: 'Contraseña docente, bitácora y copias JSON',
          badge: 'Respaldo',
          icon: Key
        }
      ]
    }
  ];

  const allLmsModules = lmsCategories.flatMap((c) =>
    c.items.map((item) => ({ ...item, categoryTitle: c.categoryTitle }))
  );
  const currentLmsModule =
    allLmsModules.find(
      (m) =>
        m.id ===
        (activeTab === 'gestion_academica_clases' ? 'calificaciones' : activeTab)
    ) || allLmsModules[0];
  const CurrentModuleIcon = currentLmsModule.icon;

  const isDrawerOpen = (
    key: 'acceso_pin' | 'horarios_constructor' | 'antitrampa' | 'resumen_vivo'
  ) => activeControlDrawer === 'all' || activeControlDrawer === key;

  const toggleDrawer = (
    key: 'acceso_pin' | 'horarios_constructor' | 'antitrampa' | 'resumen_vivo'
  ) => {
    setActiveControlDrawer((prev) => (prev === key ? 'none' : key));
  };

  // ================= MAIN TEACHER DASHBOARD VIEW (BLUEDOX-INSPIRED CLEAN LMS ARCHITECTURE) =================
  return (
    <div className="teacher-lms-workspace w-full min-h-screen bg-[#f2f5f9] text-slate-900 pb-20 lg:pb-8 overflow-x-hidden">
      {/* 1. BARRA SUPERIOR BLANCA ESTILO BLUEDOX: LOGO, SECCIONES PERSISTENTES, BUSCADOR RÁPIDO, ICONOS Y PERFIL DOCENTE */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 h-16 flex items-center justify-between gap-3 shadow-2xs">
        {/* Izquierda: Toggle Sidebar + Marca / Curso */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setMobileLmsMenuOpen((prev) => !prev);
              } else {
                setSidebarOpenDesktop((prev) => !prev);
              }
            }}
            className="w-10 h-10 rounded-xl bg-[#1e2631] hover:bg-slate-800 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors shadow-2xs"
            title="Mostrar u ocultar barra lateral"
          >
            <LayoutGrid className="w-5 h-5 text-sky-400" />
          </button>

          <button
            type="button"
            onClick={handleGoToInitialScreen}
            className="flex items-center gap-2.5 text-left group cursor-pointer min-w-0"
            title="Ir a la Pantalla Inicial del Panel Docente"
          >
            <div className="w-9 h-9 rounded-xl bg-[#25579e] text-white flex items-center justify-center font-extrabold text-sm shadow-2xs shrink-0">
              EP
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-[#1e3a6e] tracking-tight truncate group-hover:text-sky-700 transition-colors">
                  EvaluaPlus LMS
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-mono font-bold text-sky-800">
                  {activeCourseMeta.codigoCurso}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate max-w-[220px] sm:max-w-[300px]">
                {activeCourseMeta.nombreCurso}
              </div>
            </div>
          </button>
        </div>

        {/* Centro: Indicador Operativo en Vivo y Conmutadores de Consola Rápida (Sin duplicar las pestañas del árbol lateral) */}
        <div className="hidden lg:flex items-center gap-2 bg-slate-100/90 px-3 py-1.5 rounded-xl border border-slate-200">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                config.examenAbierto ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{config.examenAbierto ? 'Exámenes Abiertos' : 'Sala de Espera Activa'}</span>
          </span>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => setTeacherBottomSheet('asistencia_rapida')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200/90 text-xs font-bold text-emerald-800 cursor-pointer transition-all active:scale-[0.98]"
          >
            ✋ Pasar Asistencia
          </button>
          <button
            type="button"
            onClick={() => setTeacherBottomSheet('calificar_tareas')}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200/90 text-xs font-bold text-sky-900 flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
          >
            <span>📝 Calificar Rápido</span>
            {classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-extrabold">
                {classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setRightInspectorOpenDesktop((prev) => !prev)}
            className={`hidden 2xl:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
              rightInspectorOpenDesktop
                ? 'bg-[#25579e] text-white border-[#25579e]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Mostrar u ocultar la 3.ª columna derecha de Analítica e Inspector en Vivo"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>3 Columnas</span>
          </button>
        </div>

        {/* Derecha: Buscador Superior, Paleta Ctrl+K, Modo Proyector, Notificaciones y Perfil Docente */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Botón Paleta de Comandos Rápidos (Ctrl + K) */}
          <button
            type="button"
            onClick={() => {
              setCommandPaletteQuery('');
              setCommandPaletteOpen(true);
            }}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 cursor-pointer transition-colors shadow-2xs"
            title="Abrir Buscador Global y Paleta de Comandos Rápidos (Atajo: Ctrl + K)"
          >
            <Search className="w-3.5 h-3.5 text-[#25579e]" />
            <span className="hidden xl:inline">Buscar o Comando...</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-200 border border-slate-300 font-mono text-[10px] font-extrabold text-slate-700">
              Ctrl+K
            </kbd>
          </button>

          {/* Botón Modo «Clase en Curso» (Vista Proyector / Pantalla de Aula) */}
          <button
            type="button"
            onClick={() => setProjectorModeOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-extrabold cursor-pointer transition-colors shadow-2xs"
            title="Abrir Modo «Clase en Curso» (Vista limpia para Proyector / Videobeam del salón con PIN, QR, cronómetro gigante y asistencia en vivo)"
          >
            <Monitor className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="hidden md:inline">Modo Proyector</span>
          </button>

          {/* Icono Campana: Monitor en Vivo / Alertas */}
          <button
            type="button"
            onClick={() => setActiveTab('monitor_vivo')}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            title={`Monitor de Aula en Vivo (${liveSessions.length} en línea)`}
          >
            <Bell className="w-4 h-4" />
            {liveSessions.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* Tarjeta Perfil Docente + Botón Salir */}
          <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-slate-200 bg-slate-50/80 py-1 px-2.5 rounded-xl">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-xs font-bold text-slate-900">
                {config.idDocente || 'DOCENTE2026'}
              </div>
              <div className="text-[10px] font-medium text-emerald-700">
                ● PIN: {config.pinAulaDia || 'AULA26'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#1e2631] text-sky-300 font-bold text-xs flex items-center justify-center border-2 border-emerald-400 shrink-0">
              D
            </div>
            <button
              type="button"
              onClick={() => {
                logoutTeacher();
                setIsAuthenticated(false);
                setTeacherIdAttempt('');
                setPinAttempt('');
                setAuthDenied(false);
                onGoToInitialHome?.();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Cerrar sesión docente"
            >
              <Lock className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notificación Flotante de Sincronización con el Servidor */}
      {forceResyncResult && (
        <div className="max-w-[1600px] mx-auto px-4 pt-3">
          <div
            className={`rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              forceResyncResult.ok
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {forceResyncResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <div>
                <span className="font-bold">
                  {forceResyncResult.ok
                    ? `✓ Sincronización completada (${forceResyncResult.syncedAtFormatted})`
                    : `⚠️ Error al sincronizar (${forceResyncResult.error || 'Error de red'})`}
                </span>
                <span className="ml-3 font-mono text-[11px] text-slate-700">
                  Rev #{forceResyncResult.revision} · {students.length} alumnos · {questions.length} preguntas · {attempts.length} intentos
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForceResyncResult(null)}
              className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer self-end sm:self-center"
            >
              Cerrar ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. VENTANAS DESPLEGABLES FLOTANTES (MODAL CENTRADO: SE MUESTRA INMEDIATAMENTE AL DAR CLIC SIN DESPLAZAR LA PÁGINA) */}
      {activeControlDrawer !== 'none' && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveControlDrawer('none');
          }}
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>
                    {activeControlDrawer === 'acceso_pin' &&
                      'Ventana Desplegable · Acceso al Examen, PIN de Aula y Retroalimentación'}
                    {activeControlDrawer === 'horarios_constructor' &&
                      'Ventana Desplegable · Horarios y Constructor de Pruebas a Medida'}
                    {activeControlDrawer === 'antitrampa' &&
                      'Ventana Desplegable · Control Rápido del Escudo Anti-Trampa'}
                    {activeControlDrawer === 'resumen_vivo' &&
                      'Ventana Desplegable · Resumen Analítico y Gráficos en Tiempo Real'}
                    {activeControlDrawer === 'all' &&
                      'Ventanas Desplegables · Controles Maestros del Aula'}
                  </span>
                </div>
                {/* Selector rápido entre las 4 ventanas desplegables sin salir del modal */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {[
                    { id: 'acceso_pin' as const, label: 'Acceso y PIN' },
                    { id: 'horarios_constructor' as const, label: 'Horarios y Prueba a Medida' },
                    { id: 'antitrampa' as const, label: 'Escudo Anti-Trampa' },
                    { id: 'resumen_vivo' as const, label: 'Gráficos en Tiempo Real' }
                  ].map((dTab) => (
                    <button
                      key={dTab.id}
                      type="button"
                      onClick={() => setActiveControlDrawer(dTab.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        activeControlDrawer === dTab.id
                          ? 'bg-sky-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {dTab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveControlDrawer('none')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>← Volver / Cerrar Ventana ✕</span>
                </button>
              </div>
            </div>

          {/* PANEL DESPLEGABLE 1: ACCESO AL EXAMEN, PIN DE AULA, RETROALIMENTACIÓN Y DESGLOSE */}
          {isDrawerOpen('acceso_pin') && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Master Switch Open/Close Exam (Global o Por Estudiante) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">Estado Maestro del Examen</div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {masterClosedCount === 0 ? (
                          <span className="text-emerald-700 font-semibold">
                            ● ABIERTO PARA TODOS ({masterOpenCount}/{students.length})
                          </span>
                        ) : masterOpenCount === 0 ? (
                          <span className="text-red-700 font-semibold">
                            ■ CERRADO PARA TODOS (0/{students.length})
                          </span>
                        ) : (
                          <span className="text-sky-800 font-semibold">
                            ◐ SELECTIVO: {masterOpenCount} Abierto(s) · {masterClosedCount} Cerrado(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide text-slate-700">
                      {masterClosedCount === 0
                        ? 'ABIERTO'
                        : masterOpenCount === 0
                        ? 'CERRADO'
                        : 'POR ALUMNO'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={handleMasterOpenAllStudents}
                      className={`min-h-[48px] sm:min-h-[38px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        masterClosedCount === 0
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      ● ABIERTO (Todos)
                    </button>

                    <button
                      type="button"
                      onClick={handleMasterCloseAllStudents}
                      className={`min-h-[48px] sm:min-h-[38px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        masterOpenCount === 0
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-white border border-red-300 text-red-800 hover:bg-red-50'
                      }`}
                    >
                      ■ CERRADO (Todos)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMasterExamNotice(null);
                        setMasterExamSelectorModalOpen(true);
                      }}
                      className="col-span-2 min-h-[48px] sm:min-h-[38px] px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span>
                        Por Estudiante ({masterOpenCount} Abiertos / {masterClosedCount} Cerrados)
                      </span>
                    </button>
                  </div>
                  <OptionServerSaveBar
                    sectionKey="estado_maestro_examen"
                    label="Estado Maestro del Examen"
                    watchValue={[config.examenAbierto, config.estudiantesConEstadoCerrado]}
                    compact
                  />
                </div>

                {/* 2. Daily Classroom PIN Control */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between gap-2">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">PIN de Aula del Día</span>
                      <button
                        type="button"
                        onClick={() => onUpdateConfig({ ...config, exigirPinAula: !config.exigirPinAula })}
                        className={`min-h-[34px] text-xs font-semibold px-3 py-1 rounded-lg cursor-pointer ${
                          config.exigirPinAula
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {config.exigirPinAula ? 'PIN Exigido' : 'PIN Opcional'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        maxLength={8}
                        value={pinAulaDraft}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setPinAulaDraft(val);
                          if (val.trim() !== (config.pinAulaDia || '').trim().toUpperCase()) {
                            markSectionDirty('pin_aula_dia', `Cambios Pendientes en PIN de Aula (${val})`);
                          }
                        }}
                        className={`min-h-[44px] sm:min-h-[36px] w-28 px-3 py-1.5 text-xs font-mono font-bold uppercase bg-white border rounded-lg ${
                          pendingPinAulaChange ? 'border-amber-500 ring-1 ring-amber-400' : 'border-slate-300'
                        }`}
                        aria-label="PIN de Aula del Día"
                      />
                      <button
                        type="button"
                        disabled={!pendingPinAulaChange || isSavingPinAula}
                        onClick={handleSavePinAula}
                        className="flex-1 min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs sm:text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        {isSavingPinAula ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Guardar PIN</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <OptionServerSaveBar
                    sectionKey="pin_aula_dia"
                    label="PIN de Aula del Día"
                    watchValue={[config.exigirPinAula, config.pinAulaDia]}
                    compact
                  />
                </div>

                {/* 3. Immediate vs Deferred Pedagogical Feedback */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">Retroalimentación</div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {feedbackDeferredCount === 0 ? (
                          <span className="text-sky-700 font-semibold">
                            ● INMEDIATA ({feedbackImmediateCount}/{students.length})
                          </span>
                        ) : feedbackImmediateCount === 0 ? (
                          <span className="text-amber-700 font-semibold">
                            ■ DIFERIDA (0/{students.length})
                          </span>
                        ) : (
                          <span className="text-sky-800 font-semibold">
                            ◐ SELECTIVO: {feedbackImmediateCount} Inmed. · {feedbackDeferredCount} Dif.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={handleFeedbackImmediateAllStudents}
                      className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        feedbackDeferredCount === 0
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-white border border-sky-300 text-sky-800 hover:bg-sky-50'
                      }`}
                    >
                      ● INMEDIATA
                    </button>

                    <button
                      type="button"
                      onClick={handleFeedbackDeferredAllStudents}
                      className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        feedbackImmediateCount === 0
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-50'
                      }`}
                    >
                      ■ DIFERIDA
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFeedbackNotice(null);
                        setFeedbackSelectorModalOpen(true);
                      }}
                      className="col-span-2 min-h-[44px] sm:min-h-[36px] px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                      <span>
                        Por Estudiante ({feedbackImmediateCount} Inmed. / {feedbackDeferredCount} Dif.)
                      </span>
                    </button>
                  </div>
                  <OptionServerSaveBar
                    sectionKey="retroalimentacion"
                    label="Retroalimentación"
                    watchValue={[config.retroalimentacionInmediata, config.estudiantesConRetroalimentacionDiferida]}
                    compact
                  />
                </div>

                {/* 4. Desglose Pregunta x Pregunta */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                        {breakdownEnabledCount > 0 ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                        )}
                        <span>Desglose Pregunta x Pregunta</span>
                      </div>
                      <div className="text-[11px] font-medium text-slate-600">
                        {breakdownDisabledCount === 0 ? (
                          <span className="text-emerald-700 font-semibold">
                            ● HABILITADO ({breakdownEnabledCount}/{students.length})
                          </span>
                        ) : breakdownEnabledCount === 0 ? (
                          <span className="text-slate-600 font-semibold">
                            ■ OCULTO (0/{students.length})
                          </span>
                        ) : (
                          <span className="text-sky-800 font-semibold">
                            ◐ SELECTIVO: {breakdownEnabledCount} Hab. · {breakdownDisabledCount} Ocultos
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={handleBreakdownEnableAllStudents}
                      className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        breakdownDisabledCount === 0
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      ● HABILITAR
                    </button>

                    <button
                      type="button"
                      onClick={handleBreakdownDisableAllStudents}
                      className={`min-h-[44px] sm:min-h-[36px] px-2.5 py-2 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        breakdownEnabledCount === 0
                          ? 'bg-slate-700 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      ■ OCULTAR
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBreakdownNotice(null);
                        setBreakdownSelectorModalOpen(true);
                      }}
                      className="col-span-2 min-h-[44px] sm:min-h-[36px] px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      <span>
                        Alumnos y Horario ({breakdownEnabledCount} Hab. / {breakdownDisabledCount} Ocultos)
                      </span>
                    </button>
                  </div>
                  <OptionServerSaveBar
                    sectionKey="desglose_pregunta"
                    label="Desglose Pregunta x Pregunta"
                    watchValue={[
                      config.mostrarDesglosePregunta,
                      config.estudiantesConDesgloseDeshabilitado
                    ]}
                    compact
                  />
                </div>
              </div>

              {(!config.examenAbierto || masterClosedCount > 0) && (
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="font-semibold text-amber-900 shrink-0">
                    Mensaje de Sala de Espera ({masterClosedCount} estudiante(s) en estado CERRADO):
                  </div>
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={mensajeSalaDraft}
                      onChange={(e) => {
                        setMensajeSalaDraft(e.target.value);
                        if (e.target.value.trim() !== (config.mensajeSalaEspera || '').trim()) {
                          markSectionDirty(
                            'mensaje_sala_espera',
                            'Cambios Pendientes en Mensaje de Sala de Espera'
                          );
                        }
                      }}
                      placeholder="Ej. El examen iniciará a las 8:15 AM cuando todos estén sentados..."
                      className="flex-1 min-h-[42px] px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-900"
                    />
                    <button
                      type="button"
                      disabled={!pendingMensajeSalaChange || isSavingMensajeSala}
                      onClick={handleSaveMensajeSala}
                      className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {isSavingMensajeSala ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Guardar Mensaje</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PANEL DESPLEGABLE 2: HORARIOS Y CONSTRUCTOR DE PRUEBAS A MEDIDA */}
          {isDrawerOpen('horarios_constructor') && (
            <div className="space-y-3">
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Clock className="w-4 h-4 text-emerald-700" />
                    <span>Horario de «Desglose Pregunta x Pregunta»:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        desgloseVentanaHorariaActiva: !config.desgloseVentanaHorariaActiva,
                        desgloseDiasPermitidos: config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0],
                        desgloseHoraInicio: config.desgloseHoraInicio || '06:00',
                        desgloseHoraFin: config.desgloseHoraFin || '22:00'
                      })
                    }
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      config.desgloseVentanaHorariaActiva
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {config.desgloseVentanaHorariaActiva
                      ? 'Restricción de Días y Hora Activa'
                      : 'Sin restricción de hora'}
                  </button>

                  {config.desgloseVentanaHorariaActiva && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-600 font-semibold">Días:</span>
                        {[
                          { d: 1, l: 'Lun' },
                          { d: 2, l: 'Mar' },
                          { d: 3, l: 'Mié' },
                          { d: 4, l: 'Jue' },
                          { d: 5, l: 'Vie' },
                          { d: 6, l: 'Sáb' },
                          { d: 0, l: 'Dom' }
                        ].map((item) => {
                          const activeDays = config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
                          const isDayActive = activeDays.includes(item.d);
                          return (
                            <button
                              key={item.d}
                              type="button"
                              onClick={() => handleToggleBreakdownDay(item.d)}
                              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                isDayActive
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-white border border-slate-300 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {item.l}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-sans text-slate-600 font-semibold">De:</span>
                        <input
                          type="time"
                          value={config.desgloseHoraInicio || '06:00'}
                          onChange={(e) =>
                            onUpdateConfig({ ...config, desgloseHoraInicio: e.target.value })
                          }
                          className="min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-900"
                        />
                        <span className="font-sans text-slate-600 font-semibold">a:</span>
                        <input
                          type="time"
                          value={config.desgloseHoraFin || '22:00'}
                          onChange={(e) =>
                            onUpdateConfig({ ...config, desgloseHoraFin: e.target.value })
                          }
                          className="min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setBreakdownNotice(null);
                    setBreakdownSelectorModalOpen(true);
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-xs font-bold text-emerald-800 hover:bg-emerald-50 cursor-pointer shrink-0"
                >
                  Configurar por Estudiante y Días/Horas →
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Clock className="w-4 h-4 text-sky-700" />
                    <span>Ventana Horaria Programable de Clase:</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        ventanaHorariaActiva: !config.ventanaHorariaActiva,
                        diasPermitidos: config.diasPermitidos ?? [1, 2, 3, 4, 5, 6, 0]
                      })
                    }
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      config.ventanaHorariaActiva
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                  >
                    {config.ventanaHorariaActiva ? 'Restricción Días y Hora Activa' : 'Sin restricción de hora'}
                  </button>
                  {config.ventanaHorariaActiva && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-slate-600 font-semibold">Días:</span>
                        {[
                          { d: 1, l: 'Lun' },
                          { d: 2, l: 'Mar' },
                          { d: 3, l: 'Mié' },
                          { d: 4, l: 'Jue' },
                          { d: 5, l: 'Vie' },
                          { d: 6, l: 'Sáb' },
                          { d: 0, l: 'Dom' }
                        ].map((item) => {
                          const activeDays = config.diasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];
                          const isDayActive = activeDays.includes(item.d);
                          return (
                            <button
                              key={item.d}
                              type="button"
                              onClick={() => handleToggleClassWindowDay(item.d)}
                              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                isDayActive
                                  ? 'bg-sky-700 text-white'
                                  : 'bg-white border border-slate-300 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {item.l}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span>Desde:</span>
                        <input
                          type="time"
                          value={config.horaInicioPermitida || '06:00'}
                          onChange={(e) =>
                            onUpdateConfig({ ...config, horaInicioPermitida: e.target.value })
                          }
                          className="min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white"
                        />
                        <span>Hasta:</span>
                        <input
                          type="time"
                          value={config.horaFinPermitida || '22:00'}
                          onChange={(e) =>
                            onUpdateConfig({ ...config, horaFinPermitida: e.target.value })
                          }
                          className="min-h-[38px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-medium">Barajar Opciones A/B/C/D:</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        barajarOpciones: config.barajarOpciones === false ? true : false
                      })
                    }
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                      config.barajarOpciones !== false
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {config.barajarOpciones !== false ? 'Activo' : 'Desactivado'}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Shuffle className="w-4 h-4 text-sky-700" />
                  <span>Constructor de Pruebas a Medida:</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono">
                  <label className="flex items-center gap-1.5">
                    <span className="font-sans text-slate-600">Preguntas Integral:</span>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={examParamsDraft.preguntasExamenIntegral}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value) || 40);
                        setExamParamsDraft((prev) => ({ ...prev, preguntasExamenIntegral: val }));
                        markSectionDirty(
                          'parametros_y_horarios_examen',
                          'Cambios Pendientes en Constructor de Pruebas'
                        );
                      }}
                      className="min-h-[38px] w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="font-sans text-slate-600">Tiempo Integral (min):</span>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={examParamsDraft.tiempoExamenIntegralMin}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value) || 80);
                        setExamParamsDraft((prev) => ({ ...prev, tiempoExamenIntegralMin: val }));
                        markSectionDirty(
                          'parametros_y_horarios_examen',
                          'Cambios Pendientes en Constructor de Pruebas'
                        );
                      }}
                      className="min-h-[38px] w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="font-sans text-slate-600">Preguntas Módulo:</span>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={examParamsDraft.preguntasExamenModulo}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value) || 25);
                        setExamParamsDraft((prev) => ({ ...prev, preguntasExamenModulo: val }));
                        markSectionDirty(
                          'parametros_y_horarios_examen',
                          'Cambios Pendientes en Constructor de Pruebas'
                        );
                      }}
                      className="min-h-[38px] w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="font-sans text-slate-600">Tiempo Módulo (min):</span>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={examParamsDraft.tiempoExamenModuloMin}
                      onChange={(e) => {
                        const val = Math.max(5, Number(e.target.value) || 50);
                        setExamParamsDraft((prev) => ({ ...prev, tiempoExamenModuloMin: val }));
                        markSectionDirty(
                          'parametros_y_horarios_examen',
                          'Cambios Pendientes en Constructor de Pruebas'
                        );
                      }}
                      className="min-h-[38px] w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="font-sans text-slate-600">Nota Mínima:</span>
                    <input
                      type="number"
                      step="0.1"
                      min={1.0}
                      max={5.0}
                      value={examParamsDraft.notaMinimaAprobacion}
                      onChange={(e) => {
                        const val = Math.min(5.0, Math.max(1.0, Number(e.target.value) || 3.0));
                        setExamParamsDraft((prev) => ({ ...prev, notaMinimaAprobacion: val }));
                        markSectionDirty(
                          'parametros_y_horarios_examen',
                          'Cambios Pendientes en Constructor de Pruebas'
                        );
                      }}
                      className="min-h-[38px] w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-emerald-800"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={!pendingExamParamsChange || isSavingExamParams}
                    onClick={handleSaveExamParams}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-sans font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isSavingExamParams ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Guardar Parámetros</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        exigirPantallaMaximizada: config.exigirPantallaMaximizada === false ? true : false
                      })
                    }
                    className={`min-h-[42px] px-3 py-1.5 rounded-xl font-sans font-semibold cursor-pointer ${
                      config.exigirPantallaMaximizada !== false
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {config.exigirPantallaMaximizada !== false
                      ? 'Anti Split-Screen Activo (≥85%)'
                      : 'Split-Screen Permitido'}
                  </button>
                </div>
                <div className="w-full">
                  <OptionServerSaveBar
                    sectionKey="parametros_y_horarios_examen"
                    label="Parámetros de Examen, Ventanas Horarias y Opciones"
                    watchValue={[
                      config.desgloseVentanaHorariaActiva,
                      config.desgloseDiasPermitidos,
                      config.desgloseHoraInicio,
                      config.desgloseHoraFin,
                      config.ventanaHorariaActiva,
                      config.diasPermitidos,
                      config.horaInicioPermitida,
                      config.horaFinPermitida,
                      config.barajarOpciones,
                      config.preguntasExamenIntegral,
                      config.tiempoExamenIntegralMin,
                      config.preguntasExamenModulo,
                      config.tiempoExamenModuloMin,
                      config.notaMinimaAprobacion,
                      config.exigirPantallaMaximizada,
                      config.mensajeSalaEspera
                    ]}
                    compact
                  />
                </div>
              </div>

              {/* SECCIÓN DE CONFIGURACIÓN DE BLOQUES HORARIOS RECURRENTES POR ASIGNATURA (AUTOMATIZACIÓN DE APERTURA DE CLASES POR FECHAS, DÍAS Y HORAS) */}
              <RecurringScheduleBlocksConfigurator
                dataset={effectiveAcademicDataset}
                students={students}
                courseModules={activeCourseMeta.modulosCurso}
                courseName={activeCourseMeta.nombreCurso}
                onUpdateDataset={(nextDs, opts) => {
                  if (onUpdateAcademicDataset) {
                    onUpdateAcademicDataset(nextDs, opts);
                  }
                }}
                compact
              />
            </div>
          )}

          {/* PANEL DESPLEGABLE 3: BARRA MAESTRA DE CONTROL DE MÉTODOS ANTI-TRAMPAS */}
          {isDrawerOpen('antitrampa') && (
            <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Escudo Anti-Trampas Docente ({totalActiveAntiCheatCount}/12 Métodos Activos)</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                    Exámenes: <strong className="text-sky-300">{activeExamAntiCheatCount}/7 activos</strong> · Mini Retos:{' '}
                    <strong className="text-amber-300">{activeRetoAntiCheatCount}/5 activos</strong>
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Controle en todo momento la habilitación de los métodos anti-trampa en Exámenes y Mini Retos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleAntiCheatField('antiTrampaExamenesActivo')}
                  className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    config.antiTrampaExamenesActivo !== false
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Exámenes: {config.antiTrampaExamenesActivo !== false ? 'HABILITADO' : 'PAUSADO'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleAntiCheatField('antiTrampaMiniRetosActivo')}
                  className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    config.antiTrampaMiniRetosActivo !== false
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>
                    Mini Retos: {config.antiTrampaMiniRetosActivo !== false ? 'HABILITADO' : 'PAUSADO'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleEnableAllAntiCheatMethods}
                  className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span>Habilitar Todo (12/12)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAntiCheatActionNotice(null);
                    setAntiCheatControlModalOpen(true);
                  }}
                  className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>Configurar Detalles</span>
                </button>
              </div>
            </div>
          )}

          {/* PANEL DESPLEGABLE 4: RESUMEN EN TIEMPO REAL (RECHARTS) */}
          {isDrawerOpen('resumen_vivo') && (
            <div>
              <TeacherRealtimeSummaryPanel
                students={students}
                attempts={attempts}
                liveSessions={liveSessions}
                config={config}
                onNavigateTab={(tab) => setActiveTab(tab as TeacherTab)}
                onSelectStudentForAudit={(studentId) => {
                  setActiveControlDrawer('none');
                  setSelectedAuditStudentId(studentId);
                  setAuditModalStudentId(studentId);
                  setAuditActiveMode('retos');
                  setAuditRetoModuloFilter('ALL');
                }}
              />
            </div>
          )}
          </div>
        </div>
      )}

      {/* 3. ARQUITECTURA PRINCIPAL BLUEDOX: SIDEBAR OSCURO IZQUIERDO + ÁREA DE TRABAJO DERECHA */}
      <div className="flex flex-col lg:flex-row items-stretch min-h-[calc(100vh-4rem)]">
        {/* SIDEBAR OSCURO PERSISTENTE ESTILO BLUEDOX (CON CUADRÍCULA 2x2 SUPERIOR Y LISTA DE DASHBOARDS) */}
        {(sidebarOpenDesktop || mobileLmsMenuOpen) && (
          <aside
            aria-label="Menú lateral persistente del Panel Docente"
            className={`${
              mobileLmsMenuOpen ? 'block w-full' : 'hidden'
            } ${
              sidebarOpenDesktop ? 'lg:flex lg:w-64 shrink-0' : 'lg:hidden'
            } bg-[#1e2631] text-slate-200 flex-col justify-between select-none shadow-lg z-20`}
          >
            <div>
              {/* CUADRÍCULA 2x2 DE OPCIONES RÁPIDAS (COMO OPTION 1..4 EN BLUEDOX) */}
              <div className="p-3.5 grid grid-cols-2 gap-2.5 border-b border-slate-700/80">
                <button
                  type="button"
                  onClick={() => toggleDrawer('acceso_pin')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeControlDrawer === 'acceso_pin'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Unlock className="w-5 h-5 text-sky-400" />
                  <span className="text-[11px] font-semibold tracking-tight">PIN y Sala</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleDrawer('resumen_vivo')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeControlDrawer === 'resumen_vivo'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px] font-semibold tracking-tight">Resumen Vivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleDrawer('horarios_constructor')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeControlDrawer === 'horarios_constructor'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] font-semibold tracking-tight">Horarios Test</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleDrawer('antitrampa')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeControlDrawer === 'antitrampa'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <span className="text-[11px] font-semibold tracking-tight">Anti-Trampa</span>
                </button>
              </div>

              {/* SECCIÓN DASHBOARDS PRINCIPALES (CON BARRA ACTIVA RESALTADA ESTILO BLUEDOX) */}
              <div className="py-3">
                <button
                  type="button"
                  onClick={handleGoToInitialScreen}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-100 hover:bg-[#273140] cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Home className="w-4 h-4 text-sky-400" />
                    <span>Dashboards Docente</span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <div className="mt-1 space-y-0.5">
                  {[
                    {
                      id: 'panel_central' as TeacherTab,
                      label: 'Pantalla Inicial (Hub)',
                      pendingBadge:
                        classroomCentralMetrics.integralRiskStudents.length > 0
                          ? `${classroomCentralMetrics.integralRiskStudents.length} riesgo`
                          : null,
                      pendingColor: 'bg-rose-600 text-white'
                    },
                    {
                      id: 'estudiantes' as TeacherTab,
                      label: 'Control de Estudiantes',
                      pendingBadge:
                        classroomCentralMetrics.suspendedCount > 0
                          ? `🔓 ${classroomCentralMetrics.suspendedCount} bloq.`
                          : null,
                      pendingColor: 'bg-amber-500 text-slate-950'
                    },
                    {
                      id: 'gestor_examenes' as TeacherTab,
                      label: `Gestor de Exámenes (${activeCourseMeta.cantidadExamenes}/${activeCourseMeta.cantidadExamenes})`,
                      pendingBadge: null,
                      pendingColor: ''
                    },
                    {
                      id: 'calificaciones' as TeacherTab,
                      label: 'Calificaciones y Asistencias',
                      pendingBadge:
                        classroomCentralMetrics.pendingWorksCount +
                          classroomCentralMetrics.pendingExcusesCount >
                        0
                          ? `${
                              classroomCentralMetrics.pendingWorksCount +
                              classroomCentralMetrics.pendingExcusesCount
                            } pend.`
                          : null,
                      pendingColor: 'bg-sky-500 text-white'
                    },
                    {
                      id: 'resumen_asistencia' as TeacherTab,
                      label: 'Resumen de Asistencia',
                      pendingBadge:
                        classroomCentralMetrics.pendingExcusesCount > 0
                          ? `${classroomCentralMetrics.pendingExcusesCount} exc.`
                          : null,
                      pendingColor: 'bg-indigo-500 text-white'
                    },
                    {
                      id: 'seguridad_convivencia' as TeacherTab,
                      label: 'Seguridad y Convivencia',
                      pendingBadge:
                        classroomCentralMetrics.suspendedCount > 0
                          ? `${classroomCentralMetrics.suspendedCount}`
                          : null,
                      pendingColor: 'bg-rose-600 text-white'
                    },
                    {
                      id: 'mini_retos' as TeacherTab,
                      label: 'Mini Retos e Insignias',
                      pendingBadge: null,
                      pendingColor: ''
                    },
                    {
                      id: 'consolidado_abpro' as TeacherTab,
                      label: 'Cortes y Proyecto ABPro',
                      pendingBadge: null,
                      pendingColor: ''
                    }
                  ].map((dItem) => {
                    const isSelected =
                      activeTab === dItem.id ||
                      (dItem.id === 'calificaciones' && activeTab === 'gestion_academica_clases');
                    return (
                      <button
                        key={dItem.id}
                        type="button"
                        onClick={() => setActiveTab(dItem.id)}
                        className={`w-full pl-9 pr-3 py-2.5 text-left text-xs flex items-center justify-between gap-1.5 transition-colors cursor-pointer relative ${
                          isSelected
                            ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                            : 'text-slate-300 hover:bg-[#273140] hover:text-white font-medium'
                        }`}
                      >
                        <span className="truncate">{dItem.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {dItem.pendingBadge && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full font-mono text-[10px] font-extrabold ${dItem.pendingColor}`}
                            >
                              {dItem.pendingBadge}
                            </span>
                          )}
                          {isSelected && (
                            <span className="w-2 h-2 rotate-45 bg-[#f2f5f9] -mr-4 shrink-0 hidden lg:block" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* RESUMEN DE NOTIFICACIONES DE TAREAS PENDIENTES POR CALIFICAR / DESBLOQUEAR EN EL MENÚ LATERAL */}
                <div className="mx-3 mt-3 p-3 rounded-xl bg-[#273140] border border-slate-600/80 space-y-2 text-[11px]">
                  <div className="font-mono font-extrabold uppercase text-amber-300 flex items-center justify-between">
                    <span>🔔 Pendientes por Revisar</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px]">
                      {classroomCentralMetrics.pendingWorksCount +
                        classroomCentralMetrics.pendingExcusesCount +
                        classroomCentralMetrics.suspendedCount}
                    </span>
                  </div>
                  <div className="space-y-1 text-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setCalificacionesWorkspaceView('vista2_por_clase');
                        setActiveTab('calificaciones');
                      }}
                      className="w-full flex items-center justify-between hover:text-sky-300 cursor-pointer text-left"
                    >
                      <span>📝 Trabajos por calificar:</span>
                      <strong className="font-mono text-sky-300">
                        {classroomCentralMetrics.pendingWorksCount}
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalificacionesWorkspaceView('vista3_ausentismo');
                        setActiveTab('calificaciones');
                      }}
                      className="w-full flex items-center justify-between hover:text-indigo-300 cursor-pointer text-left"
                    >
                      <span>📋 Excusas por revisar:</span>
                      <strong className="font-mono text-indigo-300">
                        {classroomCentralMetrics.pendingExcusesCount}
                      </strong>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('estudiantes')}
                      className="w-full flex items-center justify-between hover:text-amber-300 cursor-pointer text-left"
                    >
                      <span>🔓 Solicitan desbloqueo:</span>
                      <strong className="font-mono text-amber-300">
                        {classroomCentralMetrics.suspendedCount}
                      </strong>
                    </button>
                  </div>
                </div>

                {/* MÓDULOS COMPLEMENTARIOS CON BADGES DE CONTEO (ESTILO WIDGETS / UI ELEMENTS / PAGES) */}
                <div className="mt-3 pt-3 border-t border-slate-700/80 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('monitor_vivo')}
                    className={`w-full px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'monitor_vivo'
                        ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                        : 'text-slate-300 hover:bg-[#273140] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <span>Monitor en Vivo</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold">
                        {liveSessions.length}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('estadisticas_grupo')}
                    className={`w-full px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'estadisticas_grupo'
                        ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                        : 'text-slate-300 hover:bg-[#273140] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <BarChart3 className="w-4 h-4 text-slate-400" />
                      <span>Estadísticas Grupo</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('diagnostico')}
                    className={`w-full px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'diagnostico'
                        ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                        : 'text-slate-300 hover:bg-[#273140] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Shuffle className="w-4 h-4 text-slate-400" />
                      <span>Psicometría Bloom</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('seguridad_correo')}
                    className={`w-full px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'seguridad_correo' || activeTab === 'integraciones'
                        ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                        : 'text-slate-300 hover:bg-[#273140] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Key className="w-4 h-4 text-slate-400" />
                      <span>Seguridad y Respaldos</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('diagnostico_sistema')}
                    className={`w-full px-4 py-2.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeTab === 'diagnostico_sistema'
                        ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                        : 'text-slate-300 hover:bg-[#273140] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span>Diagnóstico de Sistema</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-sky-600 text-white font-mono text-[10px] font-bold">
                        API
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Pie del Sidebar: Estado del Servidor en Vivo */}
            <div className="p-3.5 border-t border-slate-700/80 bg-[#181f28] text-[11px] text-slate-400 flex items-center justify-between">
              <span className="font-mono">Curso: {activeCourseMeta.codigoCurso}</span>
              <span className="text-emerald-400 font-bold">● Sincronizado</span>
            </div>
          </aside>
        )}

        {/* COLUMNA PRINCIPAL DE CONTENIDO (ESPACIO DE TRABAJO FLEXIBLE) */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* BARRA ÚNICA DE CONTEXTO, MIGAS DE PAN Y CONMUTADOR DE MÓDULOS (UNIFICADA SIN BOTONES DUPLICADOS) */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              {activeTab === 'panel_central' ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800 truncate">
                  <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 font-mono text-[10px] font-extrabold uppercase">
                    Web OS Híbrido
                  </span>
                  <span>
                    Consola Docente · <strong className="text-slate-950">{activeCourseMeta.nombreCurso}</strong>
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGoToInitialScreen}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#25579e] hover:bg-[#1e4682] active:scale-[0.98] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>Escritorio (Bento)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNavigateBack}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Atrás</span>
                  </button>

                  <div className="flex items-center gap-2 pl-1 min-w-0">
                    <CurrentModuleIcon className="w-4 h-4 text-[#25579e] shrink-0" />
                    <span className="text-xs font-bold text-[#25579e] hidden sm:inline">
                      {activePrimaryPillar.label}
                    </span>
                    <span className="text-slate-300 hidden sm:inline">/</span>
                    <span className="text-sm font-extrabold text-slate-900 truncate">
                      {currentLmsModule.label}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Derecha: Selector Rápido de Módulo + Sincronización */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 shrink-0">
              <label htmlFor="quick-window-select-top" className="sr-only">
                Saltar a módulo
              </label>
              <select
                id="quick-window-select-top"
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as TeacherTab)}
                className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900 cursor-pointer"
              >
                {allLmsModules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    Ir a: {mod.label} ({mod.badge})
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isForcingServerResync}
                onClick={handleExecuteForceServerResync}
                className="min-h-[38px] px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-800 font-bold flex items-center gap-1.5 cursor-pointer"
                title="Sincronizar con el servidor ahora"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isForcingServerResync ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isForcingServerResync ? 'Sincronizando...' : 'Sincronizar'}
                </span>
              </button>
            </div>
          </div>

          {/* 3A. PANTALLA INICIAL (DASHBOARD): CONSOLA BENTO TÁCTIL (ANDROID / WEB OS) + LANZADOR DE APPS DOCENTES */}
          {activeTab === 'panel_central' && (
            <div className="pb-8">
              {/* BANNER HERO COMPACTO CON BUSCADOR Y ACCIONES RÁPIDAS TÁCTILES */}
              <div className="bg-gradient-to-r from-[#1e3a6e] via-[#25579e] to-[#1e4b8f] text-white pt-6 pb-16 px-4 sm:px-8">
                <div className="max-w-[1480px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 text-sky-100 font-mono text-[10px] font-bold uppercase tracking-wider">
                      <span>📑 Consola de Gestión y Calificación · Web OS Táctil & Desktop</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                      Escritorio de Control Docente ({activeCourseMeta.codigoCurso})
                    </h2>
                    <p className="text-xs sm:text-sm text-sky-100/90">
                      Pase asistencia, califique entregas mediante hojas deslizables (Bottom Sheets) o abra cualquier módulo administrativo.
                    </p>
                  </div>

                  {/* Buscador Rápido Integrado en el Hero */}
                  <div className="w-full lg:w-96 flex items-stretch bg-white rounded-xl overflow-hidden shadow-lg">
                    <input
                      type="text"
                      value={dashboardQuickSearch}
                      onChange={(e) => setDashboardQuickSearch(e.target.value)}
                      placeholder="Filtrar apps (ej. Estudiantes, Asistencia, Exámenes...)"
                      className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    />
                    {dashboardQuickSearch && (
                      <button
                        type="button"
                        onClick={() => setDashboardQuickSearch('')}
                        className="px-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCommandPaletteQuery(dashboardQuickSearch);
                        setCommandPaletteOpen(true);
                      }}
                      className="px-4 py-2.5 bg-[#289c8e] hover:bg-[#218276] text-white text-xs font-bold cursor-pointer transition-colors shrink-0"
                    >
                      Ctrl+K
                    </button>
                  </div>
                </div>
              </div>

              {/* CUADRÍCULA BENTO DE WIDGETS OPERATIVOS TÁCTILES + LANZADOR DE MÓDULOS */}
              <div className="max-w-[1480px] mx-auto px-4 sm:px-6 -mt-10 relative z-10 space-y-6">
                {/* FILA SUPERIOR DE 3 WIDGETS BENTO DE ACCIÓN INMEDIATA (HOJAS DESLIZABLES EN MÓVIL/TABLET) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Widget Bento 1: Pasar Asistencia Rápida */}
                  <div className="bg-white border-2 border-emerald-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono text-[10px] font-extrabold uppercase">
                          Widget 1 · Asistencia Táctil
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 mt-1">
                          Consola Rápida de Asistencia ({classroomCentralMetrics.avgAttendancePct}%)
                        </h3>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Inicie llamado con temporizador o marque asistencia por bloque en 1 toque.
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 font-extrabold">
                        ✋
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTeacherBottomSheet('asistencia_rapida')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-extrabold cursor-pointer shadow-2xs transition-all"
                      >
                        Abrir Hoja Asistencia
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('resumen_asistencia')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 text-xs font-bold cursor-pointer transition-all"
                      >
                        Mapa de Calor →
                      </button>
                    </div>
                  </div>

                  {/* Widget Bento 2: Calificación Rápida de Tareas y Excusas (Bottom Sheet) */}
                  <div className="bg-white border-2 border-sky-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 font-mono text-[10px] font-extrabold uppercase">
                          Widget 2 · Calificación Touch
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 mt-1">
                          Tareas ({classroomCentralMetrics.pendingWorksCount}) y Excusas ({classroomCentralMetrics.pendingExcusesCount})
                        </h3>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Califique entregas pendientes o apruebe excusas desde una hoja inferior.
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0 font-mono font-extrabold text-sm">
                        {classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTeacherBottomSheet('calificar_tareas')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-[#25579e] hover:bg-[#1e4682] active:scale-[0.98] text-white text-xs font-extrabold cursor-pointer shadow-2xs transition-all"
                      >
                        Calificar en Hoja
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('calificaciones')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 text-xs font-bold cursor-pointer transition-all"
                      >
                        Sábana C1–C{activeCourseMeta.cantidadModulos} →
                      </button>
                    </div>
                  </div>

                  {/* Widget Bento 3: Alertas Grupales, PIN y Desbloqueo Anti-Trampa */}
                  <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-[10px] font-extrabold uppercase">
                          Widget 3 · Control de Aula
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 mt-1">
                          PIN: {config.pinAulaDia || 'AULA26'} · {classroomCentralMetrics.suspendedCount} Bloqueado(s)
                        </h3>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Envíe avisos a sala de espera, cambie el PIN o desbloquee alumnos en 1 toque.
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 font-extrabold">
                        🔓
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTeacherBottomSheet('alertas_desbloqueo')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 text-xs font-extrabold cursor-pointer shadow-2xs transition-all"
                      >
                        Alertas y Desbloqueo
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDrawer('acceso_pin')}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-800 text-xs font-bold cursor-pointer transition-all"
                      >
                        Configurar PIN →
                      </button>
                    </div>
                  </div>
                </div>
                {(() => {
                  const dashboardCards = [
                    {
                      id: 'card_estudiantes',
                      title: 'Estudiantes',
                      subtitle: `Nómina y códigos (${students.length})`,
                      icon: Users,
                      iconColor: 'text-sky-600',
                      accentBadge: '+',
                      onClick: () => setActiveTab('estudiantes')
                    },
                    {
                      id: 'card_clases',
                      title: 'Calificaciones y Asistencias',
                      subtitle: `Clases C1–C${activeCourseMeta.cantidadModulos} · Asistencia (${classroomCentralMetrics.avgAttendancePct}%) y notas`,
                      icon: GraduationCap,
                      iconColor: 'text-indigo-600',
                      onClick: () => setActiveTab('calificaciones')
                    },
                    {
                      id: 'card_resumen_academico',
                      title: 'Resumen Académico',
                      subtitle: `Promedios C1–C6 (${classroomCentralMetrics.groupClassAvg.toFixed(2)}) y competencias`,
                      icon: BarChart3,
                      iconColor: 'text-indigo-700',
                      onClick: () => setActiveTab('resumen_academico')
                    },
                    {
                      id: 'card_examenes',
                      title: 'Gestor Exámenes',
                      subtitle: `Estado de Exámenes (${activeCourseMeta.cantidadExamenes}/${activeCourseMeta.cantidadExamenes}) · ${attempts.length} entregas`,
                      icon: FileSpreadsheet,
                      iconColor: 'text-emerald-600',
                      onClick: () => setActiveTab('gestor_examenes')
                    },
                    {
                      id: 'card_retos',
                      title: 'Mini Retos',
                      subtitle: `${activeCourseMeta.cantidadRetos} retos · ${classroomCentralMetrics.totalBadgesUnlocked} insignias`,
                      icon: Trophy,
                      iconColor: 'text-amber-500',
                      onClick: () => setActiveTab('mini_retos')
                    },
                    {
                      id: 'card_monitor_vivo',
                      title: 'Monitor Vivo',
                      subtitle: `Aula en vivo (${liveSessions.length}), llamado asistencia y riesgo (${classroomCentralMetrics.integralRiskStudents.length})`,
                      icon: Monitor,
                      iconColor: 'text-teal-600',
                      onClick: () => setActiveTab('monitor_vivo')
                    },
                    {
                      id: 'card_resumen_asistencia',
                      title: 'Resumen de Asistencia',
                      subtitle: `Gráfico de inasistencias (${classroomCentralMetrics.avgAttendancePct}% asist.)`,
                      icon: BarChart3,
                      iconColor: 'text-emerald-600',
                      onClick: () => setActiveTab('resumen_asistencia')
                    },
                    {
                      id: 'card_seguridad_convivencia',
                      title: 'Seguridad y Convivencia',
                      subtitle: 'Infracciones anti-trampa e historial',
                      icon: ShieldAlert,
                      iconColor: 'text-rose-600',
                      onClick: () => setActiveTab('seguridad_convivencia')
                    },
                    {
                      id: 'card_seguridad_pin',
                      title: 'Seguridad y PIN',
                      subtitle: `PIN ${config.pinAulaDia || 'AULA26'} · Anti-trampa`,
                      icon: Lock,
                      iconColor: 'text-rose-600',
                      onClick: () => toggleDrawer('acceso_pin')
                    },
                    {
                      id: 'card_abpro',
                      title: 'Cortes y ABPro',
                      subtitle: 'Sábana 3 cortes y rúbrica',
                      icon: Layers,
                      iconColor: 'text-violet-600',
                      onClick: () => setActiveTab('consolidado_abpro')
                    },
                    {
                      id: 'card_estadisticas',
                      title: 'Estadísticas',
                      subtitle: 'Gráficos de desempeño',
                      icon: BarChart3,
                      iconColor: 'text-emerald-600',
                      onClick: () => setActiveTab('estadisticas_grupo')
                    },
                    {
                      id: 'card_psicometria',
                      title: 'Psicometría',
                      subtitle: 'Taxonomía Bloom y RAPs',
                      icon: Shuffle,
                      iconColor: 'text-cyan-600',
                      onClick: () => setActiveTab('diagnostico')
                    },
                    {
                      id: 'card_respaldo',
                      title: 'Diagnóstico y Nube',
                      subtitle: 'Caché, latencia API y respaldos',
                      icon: Database,
                      iconColor: 'text-slate-700',
                      onClick: () => setActiveTab('diagnostico_sistema')
                    }
                  ];

                  const q = dashboardQuickSearch.trim().toLowerCase();
                  const visibleCards = q
                    ? dashboardCards.filter(
                        (c) =>
                          c.title.toLowerCase().includes(q) ||
                          c.subtitle.toLowerCase().includes(q)
                      )
                    : dashboardCards;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      {visibleCards.map((card) => {
                        const CardIcon = card.icon;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={card.onClick}
                            className="bg-white hover:bg-sky-50/40 border border-slate-200/90 hover:border-sky-300 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center justify-center gap-2.5 group cursor-pointer min-h-[148px]"
                          >
                            <div className="relative w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-white border border-slate-200/80 flex items-center justify-center transition-transform group-hover:scale-105">
                              <CardIcon className={`w-6 h-6 ${card.iconColor}`} />
                              {card.accentBadge && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                  {card.accentBadge}
                                </span>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <div className="text-sm font-bold text-slate-800 group-hover:text-[#25579e]">
                                {card.title}
                              </div>
                              <div className="text-[11px] text-slate-400 leading-tight">
                                {card.subtitle}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 4. VISTA ENFOCADA DE LA SECCIÓN ACTIVA (SIN BARRA CONTEXTUAL DUPLICADA; CONTROLADA DESDE LA SUB-BARRA ÚNICA SUPERIOR) */}
          <div className={activeTab === 'panel_central' ? 'hidden' : 'p-4 sm:p-6 space-y-4'}>
            <div className="min-w-0 space-y-4">

      {/* ================= TAB: DASHBOARD DE RESUMEN ACADÉMICO (BANCO ÚNICO C1 A C6) ================= */}
      {activeTab === 'resumen_academico' && (
        <AcademicSummaryDashboard
          dataset={effectiveAcademicDataset}
          students={students}
          attempts={attempts}
          onNavigateToClassesTab={() => setActiveTab('calificaciones')}
        />
      )}

      {/* ================= TAB UNIFICADO: CALIFICACIONES Y ASISTENCIAS ================= */}
      {(activeTab === 'calificaciones' || activeTab === 'gestion_academica_clases') && (
        <AcademicClassAttendanceManager
          dataset={effectiveAcademicDataset}
          students={students}
          attempts={attempts}
          courseModules={activeCourseMeta.modulosCurso}
          courseName={activeCourseMeta.nombreCurso}
          externalSubView={calificacionesWorkspaceView}
          onChangeExternalSubView={setCalificacionesWorkspaceView}
          onUpdateDataset={(nextDs, opts) => {
            if (onUpdateAcademicDataset) {
              onUpdateAcademicDataset(nextDs, opts);
            }
          }}
        />
      )}

      {/* ================= TAB 1: ESTUDIANTES Y CÓDIGOS (MODO CONSULTA / SUPERVISIÓN OFICIAL DE AULA) ================= */}
      {activeTab === 'estudiantes' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Control de Estudiantes ({students.length} matriculados)
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200 text-[11px] font-bold">
                  👁️ Modo Consulta y Supervisión Oficial de Aula
                </span>
              </div>
              <p className="text-xs text-slate-600">
                La creación, carga masiva y gestión de matrícula se realiza desde el <strong>Panel del Editor</strong> al crear o modificar el curso. Aquí dispone de las herramientas operativas de supervisión en aula.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const listText = filteredStudents
                    .map(
                      (s, idx) =>
                        `${idx + 1}. ${s.nombre} | ID: ${s.id} | Código: ${s.codigoAcceso}`
                    )
                    .join('\n');
                  navigator.clipboard?.writeText(listText);
                  setStudentUpdateBanner(
                    `✓ Se copiaron al portapapeles los códigos de acceso de ${filteredStudents.length} estudiante(s) para entregar a los alumnos.`
                  );
                }}
                className="min-h-[48px] sm:min-h-[40px] px-4 py-2.5 sm:py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
                title="Copiar listado de códigos de acceso para entregar a los alumnos"
              >
                <Copy className="w-4 h-4 shrink-0" />
                <span>Copiar Códigos de Acceso ({filteredStudents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintMode('fichas_aula')}
                className="min-h-[48px] sm:min-h-[40px] px-4 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
                title="Imprimir fichas individuales recortables con ID y código de acceso para entregar en el aula"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Imprimir Fichas para Aula</span>
              </button>
            </div>
          </div>

          {/* Panel Administrativo de Desbloqueo Manual de Estudiantes Bloqueados por el Sistema Anti-Trampa */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-amber-950 flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-amber-700" />
                  <span>
                    Panel de Desbloqueo Manual por Sanción Anti-Trampa ({students.filter((s) => s.suspendido).length} bloqueados actualmente)
                  </span>
                </div>
                <p className="text-[11px] text-amber-900">
                  Si un estudiante fue bloqueado erróneamente por el sistema anti-trampa (ej. notificación emergente del sistema o corte momentáneo), desbloquéelo manualmente aquí conservando sus intentos previos.
                </p>
              </div>
            </div>

            {manualUnlockNotice && (
              <div className="p-2.5 rounded-lg bg-emerald-100 border border-emerald-300 text-xs font-semibold text-emerald-950">
                {manualUnlockNotice}
              </div>
            )}

            {students.filter((s) => s.suspendido).length === 0 ? (
              <div className="text-xs text-emerald-800 bg-white/80 border border-amber-200/80 rounded-lg px-3 py-2">
                ✓ Ningún estudiante se encuentra bloqueado actualmente por el sistema anti-trampa.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {students
                  .filter((s) => s.suspendido)
                  .map((st) => (
                    <div
                      key={st.id}
                      className="bg-white border border-amber-300 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {st.nombre} <span className="font-mono text-slate-500">({st.id})</span>
                        </div>
                        <div className="text-[11px] text-red-700">
                          Motivo: {st.conceptoInfraccion}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => executeManualAntiCheatUnlock(st.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Desbloquear Manualmente</span>
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {batchExamBlockNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950 flex items-center justify-between">
              <span>{batchExamBlockNotice}</span>
              <button
                type="button"
                onClick={() => setBatchExamBlockNotice(null)}
                className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
              >
                ✕
              </button>
            </div>
          )}

          {studentUpdateBanner && (
            <div className="p-3 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs">
              <span>{studentUpdateBanner}</span>
              <button
                type="button"
                onClick={() => setStudentUpdateBanner(null)}
                className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar por documento ID, nombre, correo, WhatsApp o código MM26..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'sin_presentar', label: 'Sin presentar' },
                { id: 'con_intentos', label: 'Con intentos' },
                { id: 'suspendidos', label: 'Suspendidos' }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStudentStatusFilter(f.id as typeof studentStatusFilter)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    studentStatusFilter === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Students Table — Ajustada al 100% del ancho en modo consulta / supervisión oficial */}
          <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 leading-tight">
                  <th className="py-2.5 px-2.5 w-[96px]">ID Estudiante</th>
                  <th className="py-2.5 px-2.5 min-w-[155px]">
                    <div>Nombre Completo</div>
                    <div className="text-[10px] font-normal text-slate-500">
                      Correo / WhatsApp
                    </div>
                  </th>
                  <th className="py-2.5 px-2 w-[180px]">
                    <span>Código de Acceso (Entrega Rápida)</span>
                  </th>
                  <th className="py-2.5 px-1.5 text-center w-[70px]">Intentos</th>
                  <th className="py-2.5 px-2 text-center w-[112px]">
                    Insignias ({activeCourseBadges.length}/{activeCourseBadges.length})
                  </th>
                  <th className="py-2.5 px-2">
                    <span>Auditoría y Estado de Exámenes</span>
                  </th>
                  <th className="py-2.5 px-2 w-[135px]">Suspensión / Concepto</th>
                  <th className="py-2.5 px-2 text-right w-[180px]">Supervisión y Reinicio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px] leading-snug">
                {filteredStudents.map((st) => {
                  const canReset = st.intentosUsados > 0 || st.suspendido || true;
                  const activeModalityIdSet = new Set(examModalities.map((m) => m.id));
                  const blockedCount = (st.examenesBloqueados || []).filter((id) =>
                    activeModalityIdSet.has(id)
                  ).length;
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors align-middle">
                      <td className="py-2 px-2.5 font-mono font-semibold text-slate-900 break-all">
                        {st.id}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-slate-900 break-words">
                        <div>{st.nombre}</div>
                        {(st.correo || st.whatsapp) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                            {st.correo && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-900 font-normal break-all"
                                title={`Correo electrónico: ${st.correo}`}
                              >
                                <span>✉️</span>
                                <span>{st.correo}</span>
                              </span>
                            )}
                            {st.whatsapp && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-normal"
                                title={`WhatsApp: ${st.whatsapp}`}
                              >
                                <span>📱</span>
                                <span>{st.whatsapp}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-sky-800">
                        <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                          <span className="text-[11px] font-mono font-bold uppercase text-sky-900">
                            {st.codigoAcceso}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(st.codigoAcceso);
                              setStudentUpdateBanner(
                                `✓ Código de acceso de ${st.nombre} (${st.codigoAcceso}) copiado al portapapeles.`
                              );
                            }}
                            className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-sans font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Copiar código de acceso de ${st.nombre}`}
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums font-semibold">
                        {(() => {
                          const srv = computeStudentServerSummary(st, attempts, config);
                          const effWarn = getEffectiveMaxLlamadosAtencion(st, config);
                          const isCustomWarn =
                            typeof st.maxLlamadosAtencionIndividual === 'number' ||
                            typeof config.llamadosAtencionPorEstudiante?.[st.id] === 'number';
                          return (
                            <div className="space-y-1 text-[10px] leading-tight">
                              <div className="font-bold text-slate-900">
                                {srv.totalIntentosExamenesRealizados} Int. ({srv.examenesRealizadosCount}/{totalExamModalitiesCount} Exám.)
                              </div>
                              <div className="text-emerald-700 font-semibold">
                                Prom: {srv.promedioExamenesPresentados.toFixed(1)} · Faltan: {srv.examenesFaltantesCount}
                              </div>
                              <div className="pt-0.5">
                                <label
                                  className="inline-flex items-center gap-0.5 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 text-[9px] text-indigo-950 font-sans font-semibold"
                                  title="Ajustar cuántos llamados de atención anti-trampa se permiten para este estudiante antes de suspender con 0.0"
                                >
                                  <span>🛡️ Llamados:</span>
                                  <select
                                    value={isCustomWarn ? String(effWarn) : 'GLOBAL'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleSetIndividualStudentWarningLimit(
                                        st.id,
                                        val === 'GLOBAL' ? 'GLOBAL' : Number(val)
                                      );
                                    }}
                                    className="bg-transparent font-mono font-bold text-indigo-900 focus:outline-none cursor-pointer"
                                  >
                                    <option value="GLOBAL">
                                      Global ({config.maxLlamadosAtencionGlobal ?? 1})
                                    </option>
                                    <option value="0">0 (Susp. Inmediata)</option>
                                    <option value="1">1 Llamado</option>
                                    <option value="2">2 Llamados</option>
                                    <option value="3">3 Llamados</option>
                                    <option value="4">4 Llamados</option>
                                    <option value="5">5 Llamados</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="inline-flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                          {activeCourseBadges.map((b) => {
                            const unlocked = Boolean(
                              st.progresoRetos?.[b.modulo]?.insigniaDesbloqueada
                            );
                            return (
                              <span
                                key={b.modulo}
                                title={`Módulo ${b.modulo}: ${b.tituloPrincipal} (${
                                  unlocked ? 'Desbloqueada' : 'Pendiente'
                                })`}
                                className={`text-xs ${unlocked ? 'opacity-100' : 'opacity-25 grayscale'}`}
                              >
                                {b.icono}
                              </span>
                            );
                          })}
                          {activeCourseBadges.length > 0 &&
                            activeCourseBadges.every(
                              (b) => st.progresoRetos?.[b.modulo]?.insigniaDesbloqueada
                            ) && (
                              <span
                                title={`Distinción Especial: Maestro Estratega PRU (${activeCourseBadges.length}/${activeCourseBadges.length})`}
                                className="text-xs ml-0.5"
                              >
                                🏆
                              </span>
                            )}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setExamBlockModalStudentId(st.id)}
                            className={`px-2 py-1 rounded-md border font-semibold inline-flex items-center gap-1 text-[10px] cursor-pointer ${
                              blockedCount >= totalExamModalitiesCount
                                ? 'border-red-300 bg-red-100 text-red-900'
                                : blockedCount > 0
                                ? 'border-amber-300 bg-amber-50 text-amber-900'
                                : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                            }`}
                            title="Haga clic para bloquear o desbloquear exámenes específicos para este estudiante"
                          >
                            {blockedCount > 0 ? (
                              <Lock className="w-3 h-3 text-red-600 shrink-0" />
                            ) : (
                              <Unlock className="w-3 h-3 text-emerald-600 shrink-0" />
                            )}
                            <span>
                              {blockedCount >= totalExamModalitiesCount
                                ? `${totalExamModalitiesCount}/${totalExamModalitiesCount} Bloq.`
                                : blockedCount > 0
                                ? `${Math.max(0, totalExamModalitiesCount - blockedCount)}/${totalExamModalitiesCount} Act. (${blockedCount} Bloq.)`
                                : `${totalExamModalitiesCount}/${totalExamModalitiesCount} Habilitados`}
                            </span>
                          </button>

                          {/* Botón Auditoría de Exámenes por Módulo */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuditStudentId(st.id);
                              setAuditModalStudentId(st.id);
                              setAuditActiveMode('examenes');
                              setAuditExamModalityFilter('ALL');
                              setAuditActionNotice(null);
                            }}
                            className="px-2 py-1 rounded-md bg-sky-700 hover:bg-sky-800 text-white font-bold inline-flex items-center gap-1 text-[10px] cursor-pointer shadow-xs"
                            title="Auditoría de Exámenes por Módulo: ver qué exámenes realizó, qué preguntas le salieron, cuál respondió, cuánto tiempo por pregunta y borrar intento de examen"
                          >
                            <Eye className="w-3 h-3 shrink-0" />
                            <span>
                              Auditoría ({attempts.filter((a) => a.studentId === st.id).length})
                            </span>
                          </button>

                          {/* Botón Auditoría de Retos por Módulo */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAuditStudentId(st.id);
                              setAuditModalStudentId(st.id);
                              setAuditActiveMode('retos');
                              setAuditRetoModuloFilter('ALL');
                              setAuditActionNotice(null);
                            }}
                            className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center gap-1 text-[10px] cursor-pointer shadow-xs"
                            title="Auditoría de Retos por Módulo: ver qué retos realizó, qué reto le salió, qué respondió, cuánto tiempo por reto y borrar intento del reto"
                          >
                            <Trophy className="w-3 h-3 text-amber-300 shrink-0" />
                            <span>
                              Retos ({
                                activeCourseMeta.modulosCurso.reduce(
                                  (acc, m) =>
                                    acc +
                                    (st.progresoRetos?.[m.id as 1 | 2 | 3 | 4 | 5]?.historialIntentos
                                      ?.length || 0),
                                  0
                                )
                              })
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-2 break-words">
                        {st.suspendido ? (
                          <div className="text-red-700 font-semibold text-[10px] leading-tight">
                            <span>⚠️ Suspendido</span>
                            <span className="mx-1 text-slate-400">·</span>
                            <span className="font-normal text-red-800">{st.conceptoInfraccion}</span>
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-medium text-[10px] leading-tight">
                            {st.conceptoInfraccion}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {st.suspendido && (
                            <button
                              type="button"
                              onClick={() => executeManualAntiCheatUnlock(st.id)}
                              className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1 text-[10px] cursor-pointer"
                              title="Desbloquear manualmente del sistema anti-trampa conservando sus intentos válidos"
                            >
                              <Unlock className="w-3 h-3 shrink-0" />
                              <span>Desbloquear</span>
                            </button>
                          )}

                          {/* Inline Reset Confirmation with Number of Attempts to Allow (1 or 2) */}
                          {confirmResetId === st.id ? (
                            <div className="inline-flex flex-wrap items-center gap-1 bg-amber-50 border border-amber-300 px-2 py-1 rounded-md">
                              <span className="font-semibold text-amber-900 text-[10px]">¿Reiniciar a 0?</span>
                              <label className="text-[10px] text-amber-900 font-medium flex items-center gap-1">
                                <span>Permitir:</span>
                                <select
                                  value={resetAllowedAttemptsInput}
                                  onChange={(e) =>
                                    setResetAllowedAttemptsInput(Number(e.target.value) as 1 | 2)
                                  }
                                  className="px-1 py-0.5 bg-white border border-amber-400 rounded font-mono font-bold text-slate-900"
                                >
                                  <option value={1}>1</option>
                                  <option value={2}>2</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  executeResetStudent(st.id, resetAllowedAttemptsInput)
                                }
                                className="px-1.5 py-0.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 text-[10px] cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmResetId(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-semibold hover:bg-slate-300 text-[10px] cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!canReset}
                              onClick={() => {
                                setResetAllowedAttemptsInput(st.maxIntentosPermitidos ?? 2);
                                setConfirmResetId(st.id);
                              }}
                              className="px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium inline-flex items-center gap-1 text-[10px] cursor-pointer"
                              title="Reiniciar intentos a 0, elegir 1 o 2 intentos permitidos y levantar sanciones"
                            >
                              <RefreshCw className="w-3 h-3 shrink-0" />
                              <span>Reiniciar</span>
                            </button>
                          )}

                          {/* Bloqueo / Desbloqueo de Examen Por Estudiante */}
                          <button
                            type="button"
                            onClick={() => setExamBlockModalStudentId(st.id)}
                            className={`px-2 py-1 rounded-md border font-medium inline-flex items-center gap-1 text-[10px] cursor-pointer ${
                              blockedCount > 0
                                ? 'border-red-300 bg-red-50 text-red-800'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Bloquear o desbloquear exámenes específicos para este estudiante"
                          >
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>
                              {blockedCount > 0 ? `Bloq. (${blockedCount})` : 'Exámenes'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ================= BARRA DESPLEGABLE DE AUDITORÍA EN PÁGINA (POR DEFECTO COMPACTA PARA MANTENER LIMPIA LA NÓMINA) ================= */}
          <div id="auditoria-inline-estudiante" className="mt-4 border border-slate-200 rounded-2xl bg-slate-50/70 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-700" />
                  <span>Expediente y Auditoría Detallada por Estudiante (Exámenes y Retos)</span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Pulse el botón <strong>«Auditoría»</strong> o <strong>«Retos»</strong> en cualquier fila de la tabla superior para abrir la ventana emergente de inmediato, o despliegue el visor completo aquí.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const targetId = selectedAuditStudentId || students[0]?.id || null;
                    if (targetId) {
                      setSelectedAuditStudentId(targetId);
                      setAuditModalStudentId(targetId);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Abrir Auditoría en Ventana Flotante</span>
                </button>
              </div>
            </div>
            {false && (() => {
              const activeAuditStudent =
                students.find((s) => s.id === selectedAuditStudentId) || students[0] || null;
              if (!activeAuditStudent) return null;

              const inlineStudentExamAttempts = attempts
                .filter((a) => a && a.studentId === activeAuditStudent.id)
                .sort((a, b) => b.timestampMs - a.timestampMs);

              const inlineFilteredExams =
                auditExamModalityFilter === 'ALL'
                  ? inlineStudentExamAttempts
                  : inlineStudentExamAttempts.filter(
                      (a) => (a.modalidad || 'integral') === auditExamModalityFilter
                    );

              const inlineRetoMap = new Map<string, MiniRetoAttemptRecord>();
              if (Array.isArray(activeAuditStudent.historialIntentosRetos)) {
                (activeAuditStudent.historialIntentosRetos || []).filter(Boolean).forEach((att) => {
                  inlineRetoMap.set(att.attemptId, att);
                });
              }
              ([1, 2, 3, 4, 5] as const).forEach((m) => {
                const modHist = activeAuditStudent.progresoRetos?.[m]?.historialIntentos;
                if (Array.isArray(modHist)) {
                  modHist.filter(Boolean).forEach((att) => {
                    inlineRetoMap.set(att.attemptId, att);
                  });
                }
              });
              const inlineAllRetos = Array.from(inlineRetoMap.values()).sort(
                (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
              );
              const inlineFilteredRetos =
                auditRetoModuloFilter === 'ALL'
                  ? inlineAllRetos
                  : inlineAllRetos.filter((r) => Number(r.modulo) === auditRetoModuloFilter);

              return (
                <>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-sky-800 bg-sky-100 border border-sky-300 px-2.5 py-0.5 rounded-md">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Sección de Auditoría · Historial Detallado por Estudiante</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900">
                        Auditoría de Exámenes por Módulo y Retos por Módulo
                      </h3>
                      <p className="text-xs text-slate-600">
                        Seleccione un estudiante para visualizar su historial detallado (intentos de exámenes y retos, preguntas, respuestas, tiempos y fechas) y eliminar registros de intentos específicos con sincronización inmediata en el servidor.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span>Estudiante auditado:</span>
                        <select
                          value={activeAuditStudent.id}
                          onChange={(e) => {
                            setSelectedAuditStudentId(e.target.value);
                            setAuditActionNotice(null);
                          }}
                          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                        >
                          {students.map((s) => {
                            const exCount = attempts.filter((a) => a.studentId === s.id).length;
                            const retCount = ([1, 2, 3, 4, 5] as const).reduce(
                              (acc, m) =>
                                acc + (s.progresoRetos?.[m]?.historialIntentos?.length || 0),
                              0
                            );
                            return (
                              <option key={s.id} value={s.id}>
                                {s.nombre} ({s.id}) — {exCount} Exám. / {retCount} Retos
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => setAuditActiveMode('examenes')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                          auditActiveMode === 'examenes'
                            ? 'bg-sky-700 text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Exámenes ({inlineStudentExamAttempts.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAuditActiveMode('retos')}
                        className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                          auditActiveMode === 'retos'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-300" />
                        <span>Retos por Módulo ({inlineAllRetos.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAuditModalStudentId(activeAuditStudent.id)}
                        className="px-3 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Abrir en Pantalla Completa</span>
                      </button>
                    </div>
                  </div>

                  {auditActionNotice && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950 flex items-center justify-between gap-2">
                      <span>{auditActionNotice}</span>
                      <button
                        type="button"
                        onClick={() => setAuditActionNotice(null)}
                        className="text-emerald-800 hover:text-emerald-950 px-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* ================= RESUMEN DE SERVIDOR: EXÁMENES REALIZADOS, NOTAS, FALTANTES, RETOS Y LLAMADOS ANTI-TRAMPA ================= */}
                  {(() => {
                    const srv = computeStudentServerSummary(activeAuditStudent, attempts, config);
                    const effWarn = getEffectiveMaxLlamadosAtencion(activeAuditStudent, config);
                    const isCustomWarn =
                      typeof activeAuditStudent.maxLlamadosAtencionIndividual === 'number' ||
                      typeof config.llamadosAtencionPorEstudiante?.[activeAuditStudent.id] === 'number';
                    const antiCheatLogs = Array.isArray(activeAuditStudent.historialLlamadosAtencion)
                      ? activeAuditStudent.historialLlamadosAtencion ?? []
                      : [];

                    return (
                      <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 space-y-4 shadow-xs text-xs">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div>
                            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                              <Database className="w-3.5 h-3.5" />
                              <span>Expediente consolidado en Base de Datos del Servidor (Tiempo Real · 3s)</span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mt-1">
                              Estado de Exámenes y Retos de {activeAuditStudent.nombre}: Realizados, Notas, Faltantes e Intentos
                            </h4>
                          </div>

                          {/* Control directo de Llamados de Atención para este estudiante o Todos */}
                          <div className="flex flex-wrap items-center gap-2 bg-indigo-50/80 border border-indigo-200 rounded-xl px-3 py-2">
                            <span className="font-bold text-indigo-950">
                              🛡️ Llamados de Atención Permitidos ({activeAuditStudent.nombre}):
                            </span>
                            <select
                              value={isCustomWarn ? String(effWarn) : 'GLOBAL'}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleSetIndividualStudentWarningLimit(
                                  activeAuditStudent.id,
                                  val === 'GLOBAL' ? 'GLOBAL' : Number(val)
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-white font-mono font-bold text-indigo-950"
                            >
                              <option value="GLOBAL">
                                Usar Regla Global ({config.maxLlamadosAtencionGlobal ?? 1} llamado(s))
                              </option>
                              <option value="0">0 Llamados (Suspensión inmediata al 1er evento)</option>
                              <option value="1">1 Llamado de atención (Suspende al 2º)</option>
                              <option value="2">2 Llamados de atención (Suspende al 3º)</option>
                              <option value="3">3 Llamados de atención (Suspende al 4º)</option>
                              <option value="4">4 Llamados de atención (Suspende al 5º)</option>
                              <option value="5">5 Llamados de atención (Suspende al 6º)</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setAntiCheatControlModalOpen(true)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-bold cursor-pointer"
                            >
                              Configurar Todos / Métodos IA
                            </button>
                          </div>
                        </div>

                        {/* Tarjetas Resumen: Exámenes Realizados vs Faltantes + Mini Retos Realizados vs Faltantes */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Columna 1: los 6 Exámenes Oficiales */}
                          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">
                                📋 Exámenes Oficiales: {srv.examenesRealizadosCount} de 6 realizados ·{' '}
                                <span className="text-amber-800">Faltan {srv.examenesFaltantesCount}</span>
                              </span>
                              <span className="font-mono font-bold text-sky-900 bg-sky-100 px-2 py-0.5 rounded">
                                Total Intentos Usados: {srv.totalIntentosExamenesRealizados} · Promedio:{' '}
                                {srv.promedioExamenesPresentados.toFixed(1)}/5.0
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {srv.detallePorExamen.map((exMod) => (
                                <div
                                  key={exMod.modalidad}
                                  className={`p-2.5 rounded-lg border text-[11px] flex flex-col justify-between gap-1 ${
                                    exMod.realizado
                                      ? exMod.estadoMejor === 'APROBADO'
                                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                                        : exMod.estadoMejor === 'SUSPENDIDO'
                                        ? 'bg-red-50 border-red-300 text-red-950'
                                        : 'bg-amber-50 border-amber-300 text-amber-950'
                                      : 'bg-white border-dashed border-slate-300 text-slate-600'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold">
                                    <span>{exMod.label}</span>
                                    <span className="font-mono">
                                      {exMod.realizado ? `✓ Nota: ${exMod.mejorNota.toFixed(1)}` : '⏳ FALTA'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono flex flex-wrap items-center justify-between gap-1 opacity-90">
                                    <span>
                                      Intentos: {exMod.intentosUtilizados}/{exMod.maxIntentosPermitidos}
                                    </span>
                                    <span>
                                      {exMod.realizado
                                        ? `${exMod.preguntasQueSalieron.length} preg. registradas`
                                        : 'Sin presentar'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {srv.examenesFaltantesLabels.length > 0 && (
                              <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                <strong>Exámenes que le faltan por realizar ({srv.examenesFaltantesCount}):</strong>{' '}
                                {srv.examenesFaltantesLabels.join(' · ')}
                              </div>
                            )}
                          </div>

                          {/* Columna 2: los 5 Mini Retos por Módulo */}
                          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-900">
                                🏆 Mini Retos IA: {srv.retosRealizadosCount} de 5 módulos realizados ·{' '}
                                <span className="text-amber-800">Faltan {srv.retosFaltantesModulos.length}</span>
                              </span>
                              <span className="font-mono font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded">
                                Insignias: {srv.insigniasGanadasCount}/5 · Intentos: {srv.totalIntentosRetosRealizados}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {srv.detallePorReto.map((retMod) => (
                                <div
                                  key={retMod.modulo}
                                  className={`p-2.5 rounded-lg border text-[11px] flex flex-col justify-between gap-1 ${
                                    retMod.insigniaGanada
                                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                                      : retMod.suspendidoPorTrampa
                                      ? 'bg-red-50 border-red-300 text-red-950'
                                      : retMod.realizado
                                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                                      : 'bg-white border-dashed border-slate-300 text-slate-600'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold">
                                    <span>{retMod.tituloModulo}</span>
                                    <span className="font-mono">
                                      {retMod.realizado
                                        ? `Nota: ${retMod.mejorNotaEscala5.toFixed(1)} (${retMod.mejorPorcentaje}%)`
                                        : '⏳ FALTA'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono flex items-center justify-between gap-1 opacity-90">
                                    <span>Intentos: {retMod.intentosUtilizados}/3</span>
                                    <span>
                                      {retMod.insigniaGanada
                                        ? '🏅 Insignia Ganada'
                                        : retMod.suspendidoPorTrampa
                                        ? '🚨 Suspendido 0.0'
                                        : retMod.realizado
                                        ? 'En progreso'
                                        : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {srv.retosFaltantesModulos.length > 0 && (
                              <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                <strong>Mini Retos que le faltan por realizar:</strong>{' '}
                                {srv.retosFaltantesModulos.map((m) => `Módulo ${m}`).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Historial de Llamados de Atención Anti-Trampa de este estudiante */}
                        {antiCheatLogs.length > 0 && (
                          <div className="border border-red-200 bg-red-50/60 rounded-xl p-3 space-y-2">
                            <div className="font-bold text-red-950 flex items-center justify-between">
                              <span>
                                🚨 Bitácora de Detecciones y Llamados Anti-Trampa de {activeAuditStudent.nombre} ({antiCheatLogs.length} evento(s))
                              </span>
                              <span className="font-mono text-[11px] text-red-800">
                                Límite configurado: {effWarn} llamado(s)
                              </span>
                            </div>
                            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                              {antiCheatLogs.slice(0, 12).map((logItem) => (
                                <div
                                  key={logItem.id}
                                  className="bg-white border border-red-200 rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                                >
                                  <div>
                                    <span className="font-mono font-bold text-red-800">
                                      [{logItem.origen} · {logItem.tipoDeteccion}]
                                    </span>{' '}
                                    <span className="font-semibold text-slate-900">
                                      {logItem.descripcion}
                                    </span>{' '}
                                    <span className="text-slate-500">({logItem.modalidadOModulo})</span>
                                  </div>
                                  <div className="font-mono text-[10px] flex items-center gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded font-bold ${
                                        logItem.accionTomada === 'SUSPENSION_0_0'
                                          ? 'bg-red-600 text-white'
                                          : 'bg-amber-200 text-amber-950'
                                      }`}
                                    >
                                      Llamado #{logItem.numeroLlamado ?? logItem.llamadoNumero ?? 1}/{logItem.maxLlamadosPermitidos} ·{' '}
                                      {logItem.accionTomada === 'SUSPENSION_0_0'
                                        ? 'SUSPENDIDO 0.0'
                                        : 'ADVERTENCIA'}
                                    </span>
                                    <span className="text-slate-500">{logItem.fecha}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {auditActiveMode === 'examenes' ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3 text-xs">
                        <span className="font-bold text-slate-800">
                          Filtrar intentos de examen de {activeAuditStudent.nombre}:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              { id: 'ALL', label: `Todos (${inlineStudentExamAttempts.length})` },
                              { id: 'integral', label: 'Examen Integral' },
                              { id: 'mod1', label: 'Módulo 1' },
                              { id: 'mod2', label: 'Módulo 2' },
                              { id: 'mod3', label: 'Módulo 3' },
                              { id: 'mod4', label: 'Módulo 4' },
                              { id: 'mod5', label: 'Módulo 5' }
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setAuditExamModalityFilter(tab.id)}
                              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                                auditExamModalityFilter === tab.id
                                  ? 'bg-sky-700 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {inlineFilteredExams.length === 0 ? (
                        <div className="p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                          <strong>{activeAuditStudent.nombre}</strong> aún no registra intentos de examen en el filtro seleccionado.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {inlineFilteredExams.map((examAtt) => {
                            const totalMin = Math.floor((examAtt.tiempoEmpleadoSegundos || 0) / 60);
                            const totalSec = (examAtt.tiempoEmpleadoSegundos || 0) % 60;
                            const avgQuestionSec = Math.max(
                              1,
                              Math.round(
                                (examAtt.tiempoEmpleadoSegundos || 60) /
                                  Math.max(1, examAtt.totalPreguntas || 1)
                              )
                            );
                            const isDeletingThisExam = deletingExamAttemptId === examAtt.attemptId;

                            return (
                              <div
                                key={examAtt.attemptId}
                                className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs"
                              >
                                <div className="bg-slate-900 text-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2 py-0.5 rounded bg-sky-400 text-slate-950 font-extrabold uppercase">
                                        {examAtt.modalidadLabel || 'Examen Oficial'}
                                      </span>
                                      <span className="font-mono font-bold text-sky-300">
                                        Intento #{examAtt.intentoNumero}
                                      </span>
                                      <span className="font-mono font-bold text-emerald-300">
                                        Nota: {examAtt.notaColombiana.toFixed(1)} / 5.0 ({examAtt.porcentaje}%)
                                      </span>
                                    </div>
                                    <div className="text-slate-300 font-mono flex flex-wrap items-center gap-3">
                                      <span>📅 Fecha: {examAtt.fecha}</span>
                                      <span>
                                        ✓ Aciertos: {examAtt.aciertos}/{examAtt.totalPreguntas}
                                      </span>
                                      <span>
                                        ⏱️ Tiempo Total: {totalMin}m {totalSec}s (Prom. {avgQuestionSec}s/preg)
                                      </span>
                                    </div>
                                  </div>

                                  <div className="shrink-0">
                                    {confirmDeleteExamAttemptId === examAtt.attemptId ? (
                                      <div className="inline-flex items-center gap-2 bg-red-950 border border-red-400 px-3 py-1.5 rounded-xl">
                                        <span className="font-bold text-red-200">
                                          ¿Confirmar eliminación?
                                        </span>
                                        <button
                                          type="button"
                                          disabled={isDeletingThisExam}
                                          onClick={() => handleDeleteSpecificExamAttempt(examAtt)}
                                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          {isDeletingThisExam ? (
                                            <>
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                              <span>Guardando...</span>
                                            </>
                                          ) : (
                                            <span>Sí, Borrar Intento</span>
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isDeletingThisExam}
                                          onClick={() => setConfirmDeleteExamAttemptId(null)}
                                          className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isDeletingThisExam}
                                        onClick={() => setConfirmDeleteExamAttemptId(examAtt.attemptId)}
                                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-500 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {isDeletingThisExam ? (
                                          <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>Guardando...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Borrar Intento de Examen</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="p-3.5 space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                                  {(examAtt.respuestasDetalle || []).map((r, qIdx) => {
                                    const qSec =
                                      typeof r.tiempoSegundos === 'number' && r.tiempoSegundos > 0
                                        ? r.tiempoSegundos
                                        : avgQuestionSec;
                                    const qMinPart = Math.floor(qSec / 60);
                                    const qSecPart = qSec % 60;
                                    return (
                                      <div
                                        key={`${examAtt.attemptId}-inline-${r.questionId}-${qIdx}`}
                                        className="pt-2 first:pt-0 space-y-1"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="font-mono font-bold text-slate-800">
                                            #{qIdx + 1} [{r.questionId}] · M{r.modulo} ({r.tema})
                                          </span>
                                          <div className="flex items-center gap-2 font-mono">
                                            <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-900 font-bold">
                                              ⏱️ {qMinPart > 0 ? `${qMinPart}m ${qSecPart}s` : `${qSecPart}s`}
                                            </span>
                                            <span
                                              className={`px-2 py-0.5 rounded font-bold ${
                                                r.acierto
                                                  ? 'bg-emerald-100 text-emerald-900'
                                                  : 'bg-red-100 text-red-900'
                                              }`}
                                            >
                                              {r.acierto ? '✓ Correcta' : '✗ Incorrecta'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-slate-900 font-medium">{r.enunciado}</div>
                                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                          <span
                                            className={
                                              r.acierto
                                                ? 'text-emerald-800 font-bold'
                                                : 'text-red-800 font-bold'
                                            }
                                          >
                                            Respondió:{' '}
                                            {r.elegida
                                              ? `${r.elegida}) ${r.opciones?.[r.elegida] || ''}`
                                              : 'En blanco'}
                                          </span>
                                          <span className="text-emerald-900 font-semibold">
                                            Correcta: {r.correcta}) {r.opciones?.[r.correcta] || ''}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3 text-xs">
                        <span className="font-bold text-slate-800">
                          Filtrar intentos de Retos por Módulo de {activeAuditStudent.nombre}:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAuditRetoModuloFilter('ALL')}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                              auditRetoModuloFilter === 'ALL'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Todos ({inlineAllRetos.length})
                          </button>
                          {([1, 2, 3, 4, 5] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setAuditRetoModuloFilter(m)}
                              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                                auditRetoModuloFilter === m
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              Módulo {m} (
                              {inlineAllRetos.filter((r) => Number(r.modulo) === m).length})
                            </button>
                          ))}
                        </div>
                      </div>

                      {inlineFilteredRetos.length === 0 ? (
                        <div className="p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                          <strong>{activeAuditStudent.nombre}</strong> aún no registra intentos de retos en el módulo seleccionado.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {inlineFilteredRetos.map((retoAtt) => {
                            const rSec = retoAtt.tiempoEmpleadoSegundos || 80;
                            const rMinPart = Math.floor(rSec / 60);
                            const rSecPart = rSec % 60;
                            const isDeletingThisReto = deletingRetoAttemptId === retoAtt.attemptId;

                            return (
                              <div
                                key={retoAtt.attemptId}
                                className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs text-xs"
                              >
                                <div className="bg-indigo-950 text-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-extrabold uppercase">
                                        Módulo {retoAtt.modulo} · Intento #{retoAtt.intentoNumero}/3
                                      </span>
                                      <span className="font-semibold text-indigo-200">
                                        {retoAtt.mecanicaNombre}
                                      </span>
                                      <span className="font-mono font-bold text-emerald-300">
                                        Puntaje IA: {retoAtt.porcentajeIA}% ({retoAtt.aprobado ? '🏅 Aprobado' : 'No superado'})
                                      </span>
                                    </div>
                                    <div className="text-indigo-200 font-mono flex flex-wrap items-center gap-3">
                                      <span>📅 Fecha: {retoAtt.fecha}</span>
                                      <span>
                                        ⏱️ Tiempo en reto:{' '}
                                        {rMinPart > 0 ? `${rMinPart}m ${rSecPart}s` : `${rSecPart}s`}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="shrink-0">
                                    {confirmDeleteRetoAttemptId === retoAtt.attemptId ? (
                                      <div className="inline-flex items-center gap-2 bg-red-950 border border-red-400 px-3 py-1.5 rounded-xl">
                                        <span className="font-bold text-red-200">
                                          ¿Borrar intento del reto?
                                        </span>
                                        <button
                                          type="button"
                                          disabled={isDeletingThisReto}
                                          onClick={() =>
                                            handleDeleteSpecificRetoAttempt(
                                              activeAuditStudent.id,
                                              retoAtt.attemptId,
                                              retoAtt.modulo
                                            )
                                          }
                                          className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          {isDeletingThisReto ? (
                                            <>
                                              <RefreshCw className="w-3 h-3 animate-spin" />
                                              <span>Guardando...</span>
                                            </>
                                          ) : (
                                            <span>Sí, Borrar Intento</span>
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isDeletingThisReto}
                                          onClick={() => setConfirmDeleteRetoAttemptId(null)}
                                          className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isDeletingThisReto}
                                        onClick={() => setConfirmDeleteRetoAttemptId(retoAtt.attemptId)}
                                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-500 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {isDeletingThisReto ? (
                                          <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>Guardando...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Borrar Intento del Reto</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
                                    <div className="font-bold text-indigo-900">
                                      Reto asignado: {retoAtt.tituloReto}
                                    </div>
                                    <div className="text-slate-700">{retoAtt.preguntaReto}</div>
                                  </div>
                                  <div className="bg-sky-50/60 border border-sky-200 rounded-lg p-2.5 space-y-1">
                                    <div className="font-bold text-sky-950">
                                      Respuesta del estudiante ({rMinPart > 0 ? `${rMinPart}m ${rSecPart}s` : `${rSecPart}s`}):
                                    </div>
                                    <div className="text-slate-900 font-medium">
                                      «{retoAtt.respuestaEstudiante}»
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= TAB 2: MONITOR DE AULA EN VIVO (SEMÁFORO DE INTEGRIDAD + LLAMADO DE ASISTENCIA + RIESGO ACADÉMICO INTEGRAL) ================= */}
      {activeTab === 'monitor_vivo' && (
        <div className="space-y-5">
        <div
          className={`border rounded-xl p-6 shadow-xs space-y-5 transition-colors ${
            projectorMode
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <OptionServerSaveBar
            sectionKey="monitor_aula_vivo"
            label="Supervisión de Aula en Vivo y Liberación de Sesiones"
            watchValue={liveSessions.length}
            dark={projectorMode}
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/30 pb-4">
            <div>
              <h2 className="text-lg font-bold">
                {projectorMode
                  ? 'Modo Proyección de Aula en Vivo (Vista Pública para VideoBeam — Datos Sensibles Ocultos)'
                  : 'Monitor de Aula en Vivo (Semáforo de Integridad en Tiempo Real)'}
              </h2>
              <p className={`text-xs ${projectorMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {projectorMode
                  ? `PIN de Aula del Día: ${config.exigirPinAula ? config.pinAulaDia : 'No requerido'} · Dispositivos en Línea: ${liveSessions.length} · Entregas recibidas: ${attempts.length}`
                  : `Dispositivos en Línea: ${liveSessions.length} estudiante(s) conectado(s) en tiempo real. Sincronización automática activa cada 2 segundos sin necesidad de recargar la página.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => onForceServerSync?.()}
                className="px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold flex items-center gap-1.5 cursor-pointer"
                title="Sincronizar estado en vivo inmediatamente con el servidor"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
                <span>Actualizar Ahora ({liveSessions.length} en línea)</span>
              </button>
              <button
                type="button"
                onClick={() => setProjectorMode((prev) => !prev)}
                className={`px-3.5 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                  projectorMode
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>{projectorMode ? 'Salir de Modo Proyección' : 'Modo Proyección VideoBeam'}</span>
              </button>
              <span>🟢 Foco Normal</span>
              <span>🟡 1 Advertencia</span>
              <span>🔴 Crítico</span>
            </div>
          </div>

          {liveSessions.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-slate-50 border border-slate-200/80 rounded-xl">
              <Activity className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                No hay estudiantes presentando el examen en este instante
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tan pronto un estudiante inicie su Intento 1 o Intento 2 en el aula, aparecerá aquí su progreso en tiempo real, cronómetro y estado de foco.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveSessions.map((sess) => {
                const pct = Math.round((sess.respondidasCount / Math.max(1, sess.totalPreguntas)) * 100);
                const min = Math.floor(sess.tiempoRestanteSegundos / 60);
                const sec = sess.tiempoRestanteSegundos % 60;
                const semaforoColor =
                  sess.suspendido || sess.advertencias >= 2
                    ? 'border-red-400 bg-red-50/40'
                    : sess.advertencias === 1
                    ? 'border-amber-400 bg-amber-50/40'
                    : 'border-emerald-300 bg-white';

                return (
                  <div
                    key={sess.studentId}
                    className={`rounded-xl border-2 p-4 space-y-3 ${semaforoColor}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{sess.studentName}</div>
                        <div className="text-xs font-mono text-slate-500">
                          {projectorMode
                            ? `Sesión Activa · Intento #${sess.intentoNumero}`
                            : `ID: ${sess.studentId} · Intento #${sess.intentoNumero}`}
                        </div>
                      </div>
                      <span className="text-xs font-semibold">
                        {sess.advertencias === 0 && '🟢 Foco Normal'}
                        {sess.advertencias === 1 && '🟡 1 Advertencia'}
                        {sess.advertencias >= 2 && '🔴 Crítico'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>
                          Pregunta actual: <strong>{sess.preguntaActual}</strong> de {sess.totalPreguntas}
                        </span>
                        <span className="font-mono font-bold">{pct}% respondido</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Alerta de Inactividad (> 4 minutos en la misma pregunta) o Pantalla Dividida */}
                    {((sess.segundosEnPreguntaActual ?? 0) >= 240 ||
                      sess.inactividadSospechosa ||
                      sess.pantallaMaximizada === false) && (
                      <div className="space-y-1 pt-1">
                        {((sess.segundosEnPreguntaActual ?? 0) >= 240 || sess.inactividadSospechosa) && (
                          <div className="px-2.5 py-1.5 rounded-lg bg-amber-100 border border-amber-400 text-amber-950 text-[11px] font-bold flex items-center justify-between">
                            <span>⏳ Estancado en Pregunta {sess.preguntaActual}</span>
                            <span className="font-mono">
                              {Math.floor((sess.segundosEnPreguntaActual || 240) / 60)}m{' '}
                              {(sess.segundosEnPreguntaActual || 0) % 60}s sin avance
                            </span>
                          </div>
                        )}
                        {sess.pantallaMaximizada === false && (
                          <div className="px-2.5 py-1 rounded-lg bg-red-100 border border-red-300 text-red-900 text-[11px] font-semibold">
                            ⚠️ Ventana Dividida / No Maximizada (&lt;85%)
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/80">
                      <div className="font-mono">
                        Tiempo restante:{' '}
                        <strong>
                          {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => onReleaseLiveSession(sess.studentId)}
                        className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1"
                        title="Liberar sesión en caso de fallo de hardware en el aula"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Liberar Sesión</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ZONA / SECCIÓN: APERTURA DE CLASES Y LLAMADO DE ASISTENCIA (ALERTA EN PANEL, CÓDIGO WHATSAPP/CORREO GRATIS Y MÁS) */}
        <LiveAttendanceHubSection
          dataset={effectiveAcademicDataset}
          students={students}
          courseModules={activeCourseMeta.modulosCurso}
          courseName={activeCourseMeta.nombreCurso}
          onSaveDataset={(nextDs) => {
            if (onUpdateAcademicDataset) {
              onUpdateAcademicDataset(nextDs);
            }
          }}
        />

        {/* TARJETA DE ALERTAS TEMPRANAS AUTOMATIZADAS: RIESGO ACADÉMICO INTEGRAL (CRUCE DE AUSENTISMO + BAJO RENDIMIENTO + INFRACCIONES) */}
        <div className="bg-white border-2 border-rose-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-rose-100 pb-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 font-mono text-[10px] font-extrabold uppercase">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                <span>Alertas Tempranas Automatizadas · Cruce Multi-Factor en Tiempo Real</span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                Tarjeta de «Riesgo Académico Integral» (Cruce de Ausentismo + Bajo Rendimiento + Infracciones)
              </h3>
              <p className="text-xs text-slate-600">
                Unifica automáticamente los estudiantes que coinciden de forma simultánea en <strong>dos o más factores críticos</strong>: ≥ 2 fallas de asistencia, nota acumulada &lt; {(config.notaMinimaAprobacion ?? 3.0).toFixed(1)} o bloqueos/infracciones reiteradas en Seguridad y Convivencia.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-extrabold ${
                  classroomCentralMetrics.integralRiskStudents.length > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}
              >
                {classroomCentralMetrics.integralRiskStudents.length} estudiante(s) en riesgo integral
              </span>
            </div>
          </div>

          {classroomCentralMetrics.integralRiskStudents.length === 0 ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                ✓ Excelente indicador grupal: Ningún estudiante coincide actualmente en dos o más factores de riesgo simultáneos (Ausentismo ≥ 2 + Nota &lt; {(config.notaMinimaAprobacion ?? 3.0).toFixed(1)} + Infracciones).
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {classroomCentralMetrics.integralRiskStudents.slice(0, 9).map((st) => {
                const cleanPhone = (st.whatsapp || '').replace(/\D/g, '');
                const fullPhone =
                  cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
                const preventiveMsg = `Hola ${st.nombre}, te escribimos desde la coordinación docente del curso ${activeCourseMeta.nombreCurso}. El sistema de Alertas Tempranas detectó factores de atención prioritaria en tu proceso (${st.factors.join(', ')}). Te invitamos a comunicarte con el docente para activar tu plan de nivelación oportuna.`;
                const waHref = fullPhone
                  ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(preventiveMsg)}`
                  : `https://wa.me/?text=${encodeURIComponent(preventiveMsg)}`;
                const mailHref = `mailto:${encodeURIComponent(
                  st.correo || ''
                )}?subject=${encodeURIComponent(
                  `Alerta Preventiva de Acompañamiento Académico - ${activeCourseMeta.nombreCurso}`
                )}&body=${encodeURIComponent(preventiveMsg)}`;

                return (
                  <div
                    key={st.studentId}
                    className="rounded-xl border-2 border-rose-200 bg-rose-50/40 p-3.5 flex flex-col justify-between gap-2.5 text-xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-slate-900">{st.nombre}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            ID: {st.documento}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-extrabold shrink-0">
                          {st.factorsCount}/3 Factores
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {st.factors.map((f, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-white border border-rose-300 text-rose-900 font-mono text-[10px] font-bold"
                          >
                            ⚠️ {f}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-rose-200/80">
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-[115px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] text-center cursor-pointer"
                      >
                        💬 WhatsApp Preventivo
                      </a>
                      <a
                        href={mailHref}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] text-center cursor-pointer"
                      >
                        ✉️ Correo
                      </a>
                      {st.isSuspended && (
                        <button
                          type="button"
                          onClick={() => executeManualAntiCheatUnlock(st.studentId)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] cursor-pointer"
                        >
                          🔓 Desbloquear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECCIONES / ZONAS INTEGRADAS EN MONITOR DE AULA EN VIVO: RESUMEN ACADÉMICO DEL AULA, EXÁMENES Y RETOS, Y ASISTENCIA Y ALERTAS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Tarjeta 1 (6 columnas): Resumen Académico del Aula + Gráfico de Barras por Módulo */}
          <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Resumen Académico del Aula ({activeCourseMeta.codigoCurso})
              </h3>
              <button
                type="button"
                onClick={() => setActiveTab('calificaciones')}
                className="text-xs font-semibold text-[#25579e] hover:underline cursor-pointer"
              >
                Ver sábana de notas →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              <div className="sm:col-span-5 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-sky-50 border border-sky-200 text-[#25579e] flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums">
                    {classroomCentralMetrics.groupClassAvg.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">↗ / 5.0</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Promedio grupal acumulado con <strong>{classroomCentralMetrics.classApprovalRatePct}%</strong> de aprobación ({classroomCentralMetrics.approvedClassCount} de {students.length} estudiantes activos).
                </p>
                <div className="pt-1 flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold">
                    Curso Activo: {activeCourseMeta.nombreCurso} ({activeCourseMeta.codigoCurso})
                  </span>
                </div>
              </div>

              {/* Mini Gráfico de Barras Azules (Estilo Account Summary) */}
              <div className="sm:col-span-7 flex items-end justify-between gap-2 h-36 pt-4 px-2 border-b border-slate-100">
                {activeCourseMeta.modulosCurso.slice(0, 6).map((mod) => {
                  const st = diagnostics.modStats[mod.id] || { correct: 0, total: 0 };
                  const pct =
                    st.total > 0
                      ? Math.round((st.correct / st.total) * 100)
                      : Math.min(95, 58 + mod.id * 6);
                  const barHeight = Math.max(24, Math.round((pct / 100) * 108));
                  return (
                    <div
                      key={mod.id}
                      className="flex-1 flex flex-col items-center gap-1.5"
                    >
                      <div className="w-full max-w-[34px] bg-slate-100 rounded-t-md flex items-end justify-center overflow-hidden h-[108px]">
                        <div
                          className="w-full bg-[#6fa3f7] hover:bg-[#25579e] rounded-t-md transition-all flex items-start justify-center pt-1"
                          style={{ height: `${barHeight}px` }}
                        >
                          <span className="text-[9px] font-mono font-bold text-white">
                            {pct}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-slate-500">
                        M{mod.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tarjeta 2 (3 columnas): Avance de Exámenes y Retos */}
          <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Exámenes y Retos</h3>
              <span className="text-xs font-mono font-bold text-[#25579e]">
                {attempts.length} ent.
              </span>
            </div>

            <div className="space-y-3 my-auto">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Estudiantes Activos</span>
                  <span className="font-mono font-bold text-slate-900">
                    {classroomCentralMetrics.activeStudentsCount}/{students.length}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#25579e] rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (classroomCentralMetrics.activeStudentsCount /
                            Math.max(1, students.length)) *
                            100
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Insignias Desbloqueadas</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {classroomCentralMetrics.totalBadgesUnlocked}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          12,
                          Math.round(
                            (classroomCentralMetrics.totalBadgesUnlocked /
                              Math.max(1, students.length * Math.max(1, activeCourseBadges.length))) *
                              100
                          )
                        )
                      )}%`
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Banco de Reactivos</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {questions.length} ítems
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-full" />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => toggleDrawer('resumen_vivo')}
                className="font-semibold text-[#25579e] hover:underline cursor-pointer"
              >
                Abrir Gráficos en Vivo →
              </button>
            </div>
          </div>

          {/* Tarjeta 3 (3 columnas): Asistencia y Alertas (Gráfico Circular Estilo Tickets) */}
          <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-xl p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Asistencia y Alertas</h3>
              <span className="text-xs font-mono font-bold text-emerald-700">
                {classroomCentralMetrics.avgAttendancePct}%
              </span>
            </div>

            <div className="flex items-center gap-4 my-auto">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#4c8bf5]"
                    strokeDasharray={`${classroomCentralMetrics.avgAttendancePct}, 100`}
                    strokeWidth="4"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-sm font-extrabold font-mono text-slate-800">
                  {classroomCentralMetrics.avgAttendancePct}%
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4c8bf5]" />
                  <span className="text-slate-600">
                    Sin fallas: <strong>{classroomCentralMetrics.perfectAttendanceCount}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-slate-600">
                    Moderada: <strong>{classroomCentralMetrics.moderateAbsenceStudents.length}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-600">
                    Crítica (≥3): <strong>{classroomCentralMetrics.criticalAbsenceStudents.length}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('resumen_asistencia')}
                className="font-semibold text-[#25579e] hover:underline cursor-pointer"
              >
                Resumen de Asistencia →
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('seguridad_convivencia')}
                className="font-semibold text-rose-700 hover:underline cursor-pointer"
              >
                Seguridad y Convivencia →
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ================= TAB: ESTADÍSTICAS DEL GRUPO (RECHARTS) ================= */}
      {activeTab === 'estadisticas_grupo' && (
        <TeacherGroupStatisticsView
          students={students}
          attempts={attempts}
          abproEvaluations={abproEvaluations}
          config={config}
          academicDataset={effectiveAcademicDataset}
        />
      )}

      {/* ================= SECCIÓN INTEGRADA EN CALIFICACIONES Y ASISTENCIAS (TARJETA 5): CONSOLIDADO DE EXÁMENES, ACTA Y DETECTOR ANTI-COPIA ================= */}
      {(activeTab === 'calificaciones' || activeTab === 'gestion_academica_clases') &&
        calificacionesWorkspaceView === 'vista5_examenes' && (
        <div className="space-y-4">
          <OptionServerSaveBar
            sectionKey="calificaciones_oficiales"
            label="Calificaciones Oficiales y Registro de Intentos"
            watchValue={attempts.length}
          />

          {/* Tarjetas Interactivas de Herramientas de Exámenes Oficiales y Acta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() =>
                setCalificacionesSubTool((prev) => (prev === 'grafico' ? 'none' : 'grafico'))
              }
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                calificacionesSubTool === 'grafico'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-sky-500/40'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                  <BarChart3 className="w-4 h-4 text-sky-500 shrink-0" />
                  <span>Gráfico de Distribución</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-bold">
                  {gradeDistributionBars.totalEvaluated}/{students.length}
                </span>
              </div>
              <p
                className={`text-[11px] ${
                  calificacionesSubTool === 'grafico' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Visualizar barras de rendimiento en escala 0.0 a 5.0
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setCalificacionesSubTool((prev) => (prev === 'anticopia' ? 'none' : 'anticopia'))
              }
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                calificacionesSubTool === 'anticopia'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-indigo-500/40'
                  : antiCopyAlerts.length > 0
                  ? 'bg-red-50 hover:bg-red-100 text-red-900 border-red-300'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                  <ShieldAlert className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Detector Anti-Copia</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 font-bold">
                  {antiCopyAlerts.length} alertas
                </span>
              </div>
              <p
                className={`text-[11px] ${
                  calificacionesSubTool === 'anticopia' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Auditoría de sincronía temporal y patrones idénticos
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setCalificacionesSubTool((prev) => (prev === 'sheets' ? 'none' : 'sheets'))
              }
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                calificacionesSubTool === 'sheets'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-emerald-500/40'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                  <Send className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Cola Google Sheets</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                  {pendingSheetsAttempts.length} pend.
                </span>
              </div>
              <p
                className={`text-[11px] ${
                  calificacionesSubTool === 'sheets' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Sincronizar entregas pendientes con hoja de cálculo
              </p>
            </button>

            <button
              type="button"
              onClick={() => triggerPrintView('acta_oficial')}
              className="p-3.5 rounded-2xl border border-slate-900 bg-slate-900 hover:bg-slate-800 text-white text-left transition-all cursor-pointer flex flex-col justify-between gap-2 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Printer className="w-4 h-4 shrink-0" />
                  <span>Acta Oficial PDF</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/15 text-white font-bold">
                  Imprimir
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Generar acta institucional firmable con notas definitivas
              </p>
            </button>
          </div>

          {/* Sub-Ventana Desplegable: Google Sheets Deferred Retry Queue Bar */}
          {calificacionesSubTool === 'sheets' && (
            <div className="bg-white border-2 border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-4 h-4 text-sky-700" />
                  <span>
                    Cola de Sincronización con Google Sheets ({pendingSheetsAttempts.length} pendientes de envío)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Si hubo intermitencia de internet en el salón, reintente en lote el envío de todas las calificaciones almacenadas localmente.
                </p>
                {retrySyncStatus && (
                  <div className="text-xs font-semibold text-sky-800 pt-1">{retrySyncStatus}</div>
                )}
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onClick={handleRetryPendingSheetsQueue}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Pendientes Ahora ({pendingSheetsAttempts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCalificacionesSubTool('none')}
                  className="px-2.5 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cerrar ✕
                </button>
              </div>
            </div>
          )}

          {/* Sub-Ventana Desplegable: Anti-Copy Pattern Detector Alert Box */}
          {calificacionesSubTool === 'anticopia' && (
            <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-sky-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Auditoría en Servidor: Detector de Sincronía Temporal y Patrones Idénticos Anti-Copia
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">
                    entregas analizadas: {attempts.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalificacionesSubTool('none')}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    Cerrar ✕
                  </button>
                </div>
              </div>

              {antiCopyAlerts.length === 0 ? (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  ✓ Sin alertas de colusión: No se detectaron pares de estudiantes con respuestas idénticas (≥85%) entregadas en intervalos menores a 4 minutos.
                </div>
              ) : (
                <div className="space-y-2">
                  {antiCopyAlerts.map((al, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <strong>⚠️ Alerta de Similitud ({al.similarityPct}%):</strong> {al.studentA} y{' '}
                        {al.studentB} entregaron con solo <strong>{al.timeDiffSeconds}s</strong> de diferencia en{' '}
                        {al.modalidad}.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-Ventana Desplegable: Grade Distribution Bar Chart Visualization */}
          {calificacionesSubTool === 'grafico' && (
            <div className="bg-white border-2 border-sky-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-sky-700" />
                    <span>Gráfico de Barras: Distribución de Calificaciones del Grupo (Escala 0.0 a 5.0)</span>
                  </h3>
                  <p className="text-xs text-slate-600">
                    Visualización estadística de las notas definitivas obtenidas por los estudiantes evaluados ({gradeDistributionBars.totalEvaluated} de {students.length} estudiantes).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCalificacionesSubTool('none')}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer self-start"
                >
                  Ocultar Gráfico ✕
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3 items-end pt-6 pb-2 px-2 border-b border-slate-200 min-h-[180px]">
                {gradeDistributionBars.buckets.map((b, idx) => {
                  const heightPct =
                    gradeDistributionBars.totalEvaluated > 0
                      ? Math.max(8, Math.round((b.count / gradeDistributionBars.maxCount) * 120))
                      : 8;
                  const pctOfGroup =
                    gradeDistributionBars.totalEvaluated > 0
                      ? Math.round((b.count / gradeDistributionBars.totalEvaluated) * 100)
                      : 0;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-2 text-center">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        {b.count} est. ({pctOfGroup}%)
                      </div>
                      <div className="w-full max-w-[76px] bg-slate-100 rounded-t-lg flex items-end justify-center overflow-hidden h-[124px]">
                        <div
                          className={`w-full rounded-t-lg transition-all duration-500 ${b.color}`}
                          style={{ height: `${heightPct}px` }}
                        />
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 leading-tight">
                        {b.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Consolidated Grades Table: TODOS LOS EXÁMENES Y SUS INTENTOS (REALIZADOS Y PENDIENTES / SIN PRESENTAR) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-md mb-1">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Cobertura Total · {totalExamModalitiesCount} Exámenes Oficiales (Integral + Módulos 1 al {Math.max(1, activeCourseMeta.modulosCurso.length)})</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Consolidado Oficial de Calificaciones (Escala Colombiana 0.0 a 5.0)
                </h2>
                <p className="text-xs text-slate-600">
                  Visualización completa de <strong>todos los exámenes y sus intentos (Intento 1 e Intento 2)</strong> para cada estudiante, mostrando tanto los <strong>realizados</strong> como los que se encuentran <strong>pendiente / sin presentar</strong>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={exportNominaAndGradesExcel}
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Descargar Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={exportNominaAndGradesCsv}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Planilla CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrintView('acta_oficial')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Acta Oficial PDF</span>
                </button>
              </div>
            </div>

            {/* Tarjetas de Resumen Global de Exámenes e Intentos (Realizados vs Pendientes/Sin presentar) */}
            {(() => {
              const totalStudentsCount = consolidatedGrades.length;
              const totalExamsExpected = totalStudentsCount * totalExamModalitiesCount;
              const totalExamsRealizados = consolidatedGrades.reduce(
                (acc, r) => acc + r.examenesRealizadosCount,
                0
              );
              const totalExamsPendientes = Math.max(0, totalExamsExpected - totalExamsRealizados);
              const totalIntentosRealizadosGlobal = consolidatedGrades.reduce(
                (acc, r) => acc + r.totalIntentosRealizados,
                0
              );
              const totalIntentosPosiblesGlobal = consolidatedGrades.reduce(
                (acc, r) => acc + r.totalIntentosPosibles,
                0
              );
              const totalIntentosPendientesGlobal = Math.max(
                0,
                totalIntentosPosiblesGlobal - totalIntentosRealizadosGlobal
              );
              const studentsWithAtLeastOneExam = consolidatedGrades.filter(
                (r) => r.examenesRealizadosCount > 0
              ).length;
              const studentsSinPresentarNinguno =
                totalStudentsCount - studentsWithAtLeastOneExam;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Exámenes Realizados vs Pendientes
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-mono font-bold text-emerald-700">
                        {totalExamsRealizados} Realizados
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-700">
                        {totalExamsPendientes} Sin presentar
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      De {totalExamsExpected} exámenes totales ({totalStudentsCount} alumnos × {totalExamModalitiesCount} exámenes)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Intentos Realizados vs Pendientes
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-mono font-bold text-sky-700">
                        {totalIntentosRealizadosGlobal} Intentos
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600">
                        {totalIntentosPendientesGlobal} Disponibles
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Capacidad total: {totalIntentosPosiblesGlobal} intentos (Int. 1 e Int. 2 por examen)
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-800">
                      Estudiantes con Exámenes Presentados
                    </div>
                    <div className="text-lg font-mono font-bold text-emerald-700">
                      {studentsWithAtLeastOneExam} de {totalStudentsCount} estudiantes
                    </div>
                    <div className="text-[11px] text-emerald-900">
                      Con al menos 1 intento calificado en el servidor
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                    <div className="text-[11px] font-semibold text-amber-800">
                      Estudiantes Pendientes / Sin Presentar
                    </div>
                    <div className="text-lg font-mono font-bold text-amber-800">
                      {studentsSinPresentarNinguno} de {totalStudentsCount} estudiantes
                    </div>
                    <div className="text-[11px] text-amber-900">
                      Con 0 intentos realizados hasta el momento
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Buscador y Filtros por Modalidad de Examen y Estado (Realizados / Pendientes) */}
            <div className="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={consolidatedSearch}
                    onChange={(e) => setConsolidatedSearch(e.target.value)}
                    placeholder="Buscar estudiante por ID, nombre o código..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                {/* Filtro por Estado de Presentación */}
                <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                  {[
                    { id: 'all', label: `Todos (${consolidatedGrades.length})` },
                    {
                      id: 'con_realizados',
                      label: `Con Realizados (${
                        consolidatedGrades.filter((r) => r.examenesRealizadosCount > 0).length
                      })`
                    },
                    {
                      id: 'con_pendientes',
                      label: `Con Pendientes (${
                        consolidatedGrades.filter((r) => r.examenesPendientesCount > 0).length
                      })`
                    },
                    {
                      id: 'sin_ningun_examen',
                      label: `Sin Presentar (${
                        consolidatedGrades.filter((r) => r.examenesRealizadosCount === 0).length
                      })`
                    },
                    {
                      id: 'aprobados',
                      label: `Aprobados (${
                        consolidatedGrades.filter((r) => r.concepto === 'APROBADO').length
                      })`
                    },
                    {
                      id: 'reprobados',
                      label: `Reprobados/Susp. (${
                        consolidatedGrades.filter(
                          (r) => r.concepto === 'REPROBADO' || r.concepto === 'SUSPENDIDO'
                        ).length
                      })`
                    }
                  ].map((stFilter) => (
                    <button
                      key={stFilter.id}
                      type="button"
                      onClick={() => setConsolidatedStatusFilter(stFilter.id as any)}
                      className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer transition-colors ${
                        consolidatedStatusFilter === stFilter.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {stFilter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Examen / Modalidad (Todos los Exámenes o Examen Específico) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/80 text-xs">
                <span className="font-bold text-slate-700 mr-1">Ver Examen:</span>
                <button
                  type="button"
                  onClick={() => setConsolidatedModalityFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                    consolidatedModalityFilter === 'ALL'
                      ? 'bg-sky-700 text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Todos los {totalExamModalitiesCount} Exámenes (Matriz Completa)
                </button>
                {examModalities.map((mod) => {
                  const doneCount = consolidatedGrades.filter(
                    (r) =>
                      r.examenesPorModalidad.find((m) => m.modalidad === mod.id)?.realizado
                  ).length;
                  const pendingCount = consolidatedGrades.length - doneCount;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setConsolidatedModalityFilter(mod.id)}
                      className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-colors ${
                        consolidatedModalityFilter === mod.id
                          ? 'bg-sky-700 text-white shadow-2xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{mod.shortLabel}</span>
                      <span className="ml-1 text-[10px] font-mono opacity-85">
                        ({doneCount}✓ / {pendingCount}⏳)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full border border-slate-200 rounded-xl overflow-x-auto bg-white">
              <table className="w-full table-auto text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                    <th className="py-2.5 px-2.5">Estudiante & ID</th>
                    <th className="py-2.5 px-2 text-center">Resumen Exámenes & Intentos</th>
                    {(consolidatedModalityFilter === 'ALL'
                      ? examModalities
                      : examModalities.filter((m) => m.id === consolidatedModalityFilter)
                    ).map((mod) => (
                      <th key={mod.id} className="py-2.5 px-2 text-center min-w-[148px]">
                        <div className="text-slate-900">{mod.shortLabel}</div>
                        <div className="text-[10px] font-mono font-normal text-slate-500">
                          Intento 1 · Intento 2 · Estado
                        </div>
                      </th>
                    ))}
                    <th className="py-2.5 px-2 text-center">
                      Insignias ({activeCourseBadges.length}/{activeCourseBadges.length})
                    </th>
                    <th className="py-2.5 px-2.5 text-right">Nota Definitiva</th>
                    <th className="py-2.5 px-2.5 text-center">Estado General</th>
                    <th className="py-2.5 px-2.5 text-right">Detalle Intentos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {filteredConsolidatedGrades.map((row) => {
                    const isExpanded = expandedConsolidatedStudentId === row.student.id;
                    const visibleModalities =
                      consolidatedModalityFilter === 'ALL'
                        ? row.examenesPorModalidad
                        : row.examenesPorModalidad.filter(
                            (m) => m.modalidad === consolidatedModalityFilter
                          );

                    return (
                      <React.Fragment key={row.student.id}>
                        <tr className="hover:bg-slate-50/70 align-top">
                          <td className="py-2.5 px-2.5">
                            <div className="font-bold text-slate-900 break-words">
                              {row.student.nombre}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500">
                              ID: {row.student.id} · Cód: {row.student.codigoAcceso}
                            </div>
                            {row.student.suspendido && (
                              <div className="mt-1 text-[10px] font-semibold text-red-700">
                                ⚠️ {row.student.conceptoInfraccion}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-2 text-center font-mono">
                            <div className="inline-flex flex-col items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                <span className="text-emerald-700">
                                  ✓ {row.examenesRealizadosCount}/{totalExamModalitiesCount} Realizados
                                </span>
                                <span className="text-slate-300">|</span>
                                <span className="text-amber-700">
                                  ⏳ {row.examenesPendientesCount}/{totalExamModalitiesCount} Sin presentar
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-600">
                                Intentos: <strong>{row.totalIntentosRealizados}</strong> realizados ·{' '}
                                <strong>{row.totalIntentosPendientes}</strong> pendientes
                              </div>
                            </div>
                          </td>

                          {visibleModalities.map((mod) => (
                            <td key={mod.modalidad} className="py-2 px-1.5 text-center">
                              <div
                                className={`rounded-xl border p-2 text-left space-y-1 ${
                                  mod.realizado
                                    ? mod.estado === 'APROBADO'
                                      ? 'bg-emerald-50/60 border-emerald-200'
                                      : mod.estado === 'SUSPENDIDO'
                                      ? 'bg-red-50/70 border-red-300'
                                      : 'bg-amber-50/60 border-amber-200'
                                    : 'bg-slate-50/80 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      mod.realizado
                                        ? mod.estado === 'APROBADO'
                                          ? 'bg-emerald-600 text-white'
                                          : mod.estado === 'SUSPENDIDO'
                                          ? 'bg-red-600 text-white'
                                          : 'bg-amber-500 text-slate-950'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {mod.realizado ? `✓ ${mod.estado}` : '⏳ SIN PRESENTAR'}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-slate-900">
                                    {mod.realizado ? `${mod.notaDefinitiva.toFixed(1)}` : '—'}
                                  </span>
                                </div>

                                <div className="font-mono text-[10px] space-y-0.5 pt-0.5 border-t border-slate-200/70">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500">Int. 1:</span>
                                    {mod.att1 ? (
                                      <span className="font-bold text-slate-900">
                                        {mod.att1.notaColombiana.toFixed(1)} ({mod.att1.porcentaje}%)
                                      </span>
                                    ) : (
                                      <span className="text-amber-700 font-semibold">
                                        Pendiente
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-slate-500">Int. 2:</span>
                                    {mod.att2 ? (
                                      <span className="font-bold text-slate-900">
                                        {mod.att2.notaColombiana.toFixed(1)} ({mod.att2.porcentaje}%)
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        Pendiente
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] text-slate-500 flex items-center justify-between pt-0.5">
                                    <span>
                                      Intentos: {mod.intentosRealizados}/{mod.maxIntentos}
                                    </span>
                                    {mod.bloqueado && (
                                      <span className="text-red-600 font-bold">🔒 Bloq.</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          ))}

                          <td className="py-2.5 px-2 text-center">
                            <div className="inline-flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                              {activeCourseBadges.map((b) => {
                                const unlocked = Boolean(
                                  row.student.progresoRetos?.[b.modulo]?.insigniaDesbloqueada
                                );
                                return (
                                  <span
                                    key={b.modulo}
                                    title={`Módulo ${b.modulo}: ${b.tituloPrincipal} (${
                                      unlocked ? 'Desbloqueada' : 'Pendiente'
                                    })`}
                                    className={`text-xs ${unlocked ? 'opacity-100' : 'opacity-25 grayscale'}`}
                                  >
                                    {b.icono}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          <td className="py-2.5 px-2.5 font-mono text-right tabular-nums">
                            <div className="font-bold text-sm text-slate-900">
                              {row.examenesRealizadosCount > 0 || row.student.suspendido
                                ? `${row.definitiva.toFixed(1)} / 5.0`
                                : '0.0 (Pend.)'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Prom. {totalExamModalitiesCount} Exám: {row.promedio6Examenes.toFixed(1)}
                            </div>
                          </td>

                          <td className="py-2.5 px-2.5 text-center font-semibold">
                            {row.concepto === 'APROBADO' && (
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                ✓ APROBADO
                              </span>
                            )}
                            {row.concepto === 'REPROBADO' && (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                ✕ REPROBADO
                              </span>
                            )}
                            {row.concepto === 'SUSPENDIDO' && (
                              <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-800">
                                ⚠️ SUSPENDIDO
                              </span>
                            )}
                            {row.concepto === 'SIN PRESENTAR' && (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                ⏳ SIN PRESENTAR
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedConsolidatedStudentId(
                                  isExpanded ? null : row.student.id
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3 h-3" />
                              <span>{isExpanded ? `Ocultar ${totalExamModalitiesCount} Exámenes` : `Ver ${totalExamModalitiesCount} Exámenes`}</span>
                            </button>
                          </td>
                        </tr>

                        {/* Fila Desplegable con el Detalle Completo de los Exámenes y sus Intentos (Realizados y Pendientes) */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90">
                            <td colSpan={11} className="p-4">
                              <div className="bg-white border-2 border-sky-200 rounded-xl p-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900">
                                      Desglose Completo de los {totalExamModalitiesCount} Exámenes Oficiales e Intentos — {row.student.nombre} ({row.student.id})
                                    </h4>
                                    <p className="text-[11px] text-slate-600">
                                      Exámenes realizados: <strong>{row.examenesRealizadosCount} de {totalExamModalitiesCount}</strong> · Exámenes sin presentar: <strong>{row.examenesPendientesCount} de {totalExamModalitiesCount}</strong> · Intentos utilizados: <strong>{row.totalIntentosRealizados} de {row.totalIntentosPosibles}</strong>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedAuditStudentId(row.student.id);
                                      setAuditModalStudentId(row.student.id);
                                      setAuditActiveMode('examenes');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Abrir Auditoría Pregunta por Pregunta</span>
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {row.examenesPorModalidad.map((m) => (
                                    <div
                                      key={m.modalidad}
                                      className={`rounded-xl border p-3 space-y-2 ${
                                        m.realizado
                                          ? 'bg-emerald-50/40 border-emerald-300'
                                          : 'bg-slate-50 border-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-slate-900 text-xs">
                                          {m.label}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            m.realizado
                                              ? m.estado === 'APROBADO'
                                                ? 'bg-emerald-600 text-white'
                                                : m.estado === 'SUSPENDIDO'
                                                ? 'bg-red-600 text-white'
                                                : 'bg-amber-500 text-slate-950'
                                              : 'bg-amber-100 text-amber-900'
                                          }`}
                                        >
                                          {m.realizado
                                            ? `REALIZADO · ${m.estado}`
                                            : 'PENDIENTE / SIN PRESENTAR'}
                                        </span>
                                      </div>

                                      <div className="space-y-1 text-[11px] font-mono bg-white p-2.5 rounded-lg border border-slate-200">
                                        <div className="flex items-center justify-between">
                                          <span className="text-slate-600">Intento 1:</span>
                                          {m.att1 ? (
                                            <span className="font-bold text-emerald-800">
                                              ✓ Realizado · {m.att1.notaColombiana.toFixed(1)} / 5.0 ({m.att1.porcentaje}% · {m.att1.aciertos}/{m.att1.totalPreguntas} aciertos)
                                            </span>
                                          ) : (
                                            <span className="font-semibold text-amber-700">
                                              ⏳ Pendiente / Sin presentar
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-slate-600">Intento 2:</span>
                                          {m.att2 ? (
                                            <span className="font-bold text-emerald-800">
                                              ✓ Realizado · {m.att2.notaColombiana.toFixed(1)} / 5.0 ({m.att2.porcentaje}% · {m.att2.aciertos}/{m.att2.totalPreguntas} aciertos)
                                            </span>
                                          ) : (
                                            <span className="font-semibold text-slate-500">
                                              ⏳ Pendiente / Sin presentar
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 font-bold text-slate-900">
                                          <span>Nota Definitiva Examen:</span>
                                          <span>
                                            {m.realizado
                                              ? `${m.notaDefinitiva.toFixed(1)} / 5.0 (${m.intentosRealizados}/${m.maxIntentos} int.)`
                                              : `Sin presentar (0/${m.maxIntentos} int.)`}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3B: SÁBANA MULTI-CORTE Y RÚBRICA PROYECTO ABPRO ================= */}
      {activeTab === 'consolidado_abpro' && (
        <ABProAndMultiCutGradebook
          students={students}
          attempts={attempts}
          abproEvaluations={abproEvaluations}
          onUpdateABProEvaluations={onUpdateABProEvaluations}
          config={config}
          onUpdateConfig={onUpdateConfig}
        />
      )}

      {/* ================= TAB: GESTOR DOCENTE DE EXÁMENES OFICIALES & AUDITORÍA DE ESTADO ================= */}
      {activeTab === 'gestor_examenes' && (
        <TeacherExamsStatusManager
          students={students}
          onUpdateStudents={onUpdateStudents}
          attempts={attempts}
          onUpdateAttempts={onUpdateAttempts}
          questions={questions}
          config={config}
          onUpdateConfig={onUpdateConfig}
        />
      )}

      {/* ================= TAB: GESTOR DOCENTE DE MINI RETOS & INSIGNIAS (GAMIFICACIÓN SEMÁNTICA IA) ================= */}
      {activeTab === 'mini_retos' && (
        <TeacherMiniRetosManager
          students={students}
          onUpdateStudents={onUpdateStudents}
          questions={questions}
          config={config}
          onUpdateConfig={onUpdateConfig}
          customMiniRetos={customMiniRetos}
          onUpdateCustomMiniRetos={onUpdateCustomMiniRetos}
        />
      )}

      {/* ================= TAB 4: DIAGNÓSTICO PEDAGÓGICO POR MÓDULOS Y TAXONOMÍA DE BLOOM ================= */}
      {activeTab === 'diagnostico' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Diagnóstico de Competencias por Módulo y Nivel Cognitivo (Taxonomía de Bloom)
              </h2>
              <p className="text-xs text-slate-600">
                Identifique los módulos y temáticas con mayor tasa de error para enfocar las sesiones de refuerzo presencial en La Dorada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerPrintView('acta_oficial')}
              className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 self-start whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Generar Acta Oficial (PDF / Imprimir)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rendimiento por Módulo */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Porcentaje de Aciertos por Módulo Curricular (Módulos 1 al {Math.max(1, activeCourseMeta.modulosCurso.length)})
              </h3>
              <div className="space-y-3">
                {activeCourseMeta.modulosCurso.map((modItem) => {
                  const m = modItem.id;
                  const st = diagnostics.modStats[m] || { total: 0, correct: 0 };
                  const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
                  const levelLabel =
                    st.total === 0
                      ? 'Sin datos aún'
                      : pct >= 75
                      ? '● Sobresaliente'
                      : pct >= 60
                      ? '▲ Aceptable'
                      : '■ Requiere Refuerzo';
                  return (
                    <div key={m} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          Módulo {m}: {modItem.shortTitle || modItem.fullTitle}
                        </span>
                        <span className="font-mono">
                          {pct}% acierto ({st.correct}/{st.total}) · {levelLabel}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 75 ? 'bg-emerald-600' : pct >= 60 ? 'bg-sky-600' : 'bg-amber-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rendimiento por Nivel Cognitivo Bloom */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Desempeño según Taxonomía de Bloom
              </h3>
              <div className="space-y-3">
                {(['Conocer', 'Comprensión', 'Aplicación', 'Análisis', 'Evaluación'] as BloomLevel[]).map(
                  (b) => {
                    const st = diagnostics.bloomStats[b];
                    const pct = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
                    return (
                      <div key={b} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">Nivel: {b}</span>
                          <span className="font-mono">
                            {pct}% ({st.correct}/{st.total} reactivos)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-800 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* Matriz de Debilidades Temáticas */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Matriz de Debilidades: Conceptos con Mayor Tasa de Error para Refuerzo en Clase
            </h3>
            {diagnostics.weakTopics.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no se han registrado entregas de exámenes para calcular la matriz de error por tema específico.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diagnostics.weakTopics.map((wt, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-sky-800">Módulo {wt.modulo}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
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

          {/* Analítica Psicométrica de Reactivos (Índice de Dificultad Real en Aula) */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Analítica Psicométrica de Reactivos (Índice de Dificultad según Respuestas Reales)
                </h3>
                <p className="text-xs text-slate-600">
                  Detecta automáticamente reactivos con tasa de error crítica (≥80% error) para revisión de redacción o refuerzo, y reactivos triviales (≥95% acierto).
                </p>
              </div>
            </div>

            {diagnostics.psychometricItems.length === 0 ? (
              <p className="text-xs text-slate-500">
                Se activará automáticamente cuando los estudiantes entreguen sus evaluaciones en el aula.
              </p>
            ) : (
              <div className="w-full border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full table-auto text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <th className="py-2 px-2.5">ID Pregunta</th>
                      <th className="py-2 px-2">Módulo</th>
                      <th className="py-2 px-2.5">Enunciado del Reactivo</th>
                      <th className="py-2 px-2 text-right">Muestra</th>
                      <th className="py-2 px-2 text-right">% Error</th>
                      <th className="py-2 px-2.5">Diagnóstico Psicométrico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {diagnostics.psychometricItems.map((it) => (
                      <tr key={it.questionId} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-mono font-bold text-slate-900">{it.questionId}</td>
                        <td className="py-2 px-2 font-mono">M{it.modulo}</td>
                        <td className="py-2 px-2.5 break-words">{it.enunciado}</td>
                        <td className="py-2 px-2 text-right font-mono">{it.total}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold text-red-700">
                          {it.errorRate}%
                        </td>
                        <td className="py-2 px-2.5 font-semibold break-words">
                          {it.classification === 'CRITICO_DIFICIL' && (
                            <span className="text-red-700">■ Crítico (Revisar distractor / Reforzar)</span>
                          )}
                          {it.classification === 'TRIVIAL' && (
                            <span className="text-sky-700">▲ Muy Fácil (Reactivo introductorio)</span>
                          )}
                          {it.classification === 'CALIBRADO' && (
                            <span className="text-emerald-700">● Dificultad Equilibrada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 6: INTEGRACIÓN GOOGLE SHEETS & BLOGGER ================= */}
      {activeTab === 'integraciones' && (
        <div className="space-y-6">
          <OptionServerSaveBar
            sectionKey="integraciones_webhook"
            label="Configuración de Integración Google Sheets & Blogger"
            watchValue={[config.webhookUrl, webhookUrlInput]}
          />
          {/* Google Sheets & Apps Script */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Hojas de Cálculo y Secuencias de Comandos de Aplicaciones de Google (Google Apps Script)
                </h2>
                <p className="text-xs text-slate-600">
                  Registra automáticamente en la Hoja 1 (<code>Calificaciones</code>) y en la Hoja 2 (<code>Respuestas_Detalle</code>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(googleAppsScriptCode);
                  setCopiedAppsScript(true);
                  setTimeout(() => setCopiedAppsScript(false), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 self-start whitespace-nowrap"
              >
                {copiedAppsScript ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedAppsScript ? 'Código Copiado' : 'Copiar Código Apps Script'}</span>
              </button>
            </div>

            {/* Live Webhook Tester */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-900">
                  URL del Webhook de Google Sheets (Aplicación Web desplegada) y Probador en Vivo:
                </label>
                {pendingWebhookChange && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                    Cambio pendiente
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                />
                <button
                  type="button"
                  disabled={!pendingWebhookChange || isSavingWebhook}
                  onClick={handleSaveWebhookUrl}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                    pendingWebhookChange || isSavingWebhook
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSavingWebhook ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Probar Webhook en Vivo</span>
                </button>
              </div>
              {webhookStatus && <div className="text-xs font-medium text-sky-900">{webhookStatus}</div>}
            </div>

            <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80">
              {googleAppsScriptCode}
            </pre>
          </div>

          {/* Blogger / Blogspot Lightweight Integration */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Integración Ligera para Blogger / Blogspot (Modo Vista HTML)
                </h2>
                <p className="text-xs text-slate-600">
                  Copie y pegue este bloque <code>&lt;iframe&gt;</code> responsive en cualquier entrada o página de Blogger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(bloggerIframeSnippet);
                  setCopiedBlogger(true);
                  setTimeout(() => setCopiedBlogger(false), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 self-start whitespace-nowrap"
              >
                {copiedBlogger ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedBlogger ? 'HTML Copiado' : 'Copiar Código Blogger'}</span>
              </button>
            </div>

            <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto">
              {bloggerIframeSnippet}
            </pre>
          </div>

          {/* Guía Paso a Paso de Compilación (dist) y Publicación en Netlify Drop / Vercel */}
          <div className="bg-white border-2 border-sky-200 rounded-xl p-6 space-y-5 shadow-xs">
            <div className="border-b border-slate-200 pb-4 space-y-1">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-md">
                <Code2 className="w-3.5 h-3.5" />
                <span>Guía Oficial de Compilación y Despliegue Web</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Guía Paso a Paso: Compilación de la Carpeta <code>dist</code> y Publicación en Netlify Drop / Vercel
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Instrucciones detalladas para compilar la aplicación localmente y publicarla sin pantallas en blanco en <strong>Netlify Drop</strong> (<code>https://app.netlify.com/drop</code>) o <strong>Vercel</strong> (<code>https://vercel.com/new</code>).
              </p>
            </div>

            {/* Alerta Crítica: Por qué sale pantalla en blanco en Netlify Drop */}
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-2 text-xs text-amber-950">
              <div className="font-bold text-sm flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                <span>¿Por qué la página carga en blanco al subirla a Netlify Drop?</span>
              </div>
              <p className="leading-relaxed">
                Si arrastras la carpeta completa del proyecto (por ejemplo <code>evaluaplus</code>) a Netlify Drop, el navegador intentará abrir el archivo <code>index.html</code> de desarrollo que apunta a <code>/src/main.tsx</code> (TypeScript sin compilar), mostrando una <strong>página totalmente en blanco</strong>.
              </p>
              <div className="p-2.5 rounded-lg bg-white border border-amber-300 font-semibold text-slate-900">
                ✓ Solución Definitiva: En <a href="https://app.netlify.com/drop" target="_blank" rel="noreferrer" className="text-sky-700 underline">https://app.netlify.com/drop</a> debes arrastrar y soltar <strong>ÚNICAMENTE la subcarpeta llamada <code>dist</code></strong> (nunca la carpeta raíz completa).
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* Paso 1 y 2: Verificación de package.json e Instalación */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-sm">
                  Paso 1 · Verificar <code>package.json</code> e Instalar Dependencias
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Abre la carpeta del proyecto y verifica que el archivo <code>package.json</code> contenga el script de construcción <code>"build": "vite build"</code> y que no existan conflictos de versiones.
                </p>
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-800">
                    En Windows PowerShell (usa <code>npm.cmd</code> para evitar el bloqueo de scripts <code>.ps1</code>):
                  </div>
                  <pre className="bg-slate-900 text-emerald-300 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
                    {`npm.cmd install --legacy-peer-deps`}
                  </pre>
                </div>
              </div>

              {/* Paso 2: Generar la carpeta dist */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-sm">
                  Paso 2 · Ejecutar <code>npm run build</code> y Verificar la Carpeta <code>dist</code>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Una vez instaladas las dependencias, ejecuta el comando de compilación para empaquetar el código TypeScript/React en HTML, CSS y JavaScript listos para producción:
                </p>
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-800">Comando de compilación:</div>
                  <pre className="bg-slate-900 text-sky-300 p-3 rounded-lg font-mono text-[11px] overflow-x-auto">
                    {`npm.cmd run build`}
                  </pre>
                  <p className="text-[11px] text-slate-600">
                    Al finalizar verás el mensaje <code>✓ built in ...s</code> y aparecerá la subcarpeta <strong><code>dist</code></strong> (con <code>index.html</code>, <code>_redirects</code> y la carpeta <code>assets/</code>).
                  </p>
                </div>
              </div>

              {/* Qué hacer si la carpeta dist NO se genera */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="font-bold text-slate-900 text-sm">
                  Paso 3 · ¿Qué hacer si la carpeta <code>dist</code> NO se genera?
                </div>
                <ul className="list-disc pl-4 space-y-1.5 text-slate-700 leading-relaxed">
                  <li>
                    <strong>Error <code>PSSecurityException</code> en PowerShell:</strong> Escribe siempre <code>npm.cmd</code> en lugar de <code>npm</code> (ejemplo: <code>npm.cmd run build</code>).
                  </li>
                  <li>
                    <strong>Error <code>ERESOLVE unable to resolve dependency tree</code>:</strong> Ejecuta <code>npm.cmd install --legacy-peer-deps</code> antes de compilar.
                  </li>
                  <li>
                    <strong>Limpieza de caché si falla la compilación:</strong> Si <code>node_modules</code> quedó incompleto, ejecuta:
                    <pre className="bg-slate-900 text-slate-100 p-2 rounded font-mono text-[11px] mt-1 overflow-x-auto">
                      {`npm.cmd cache clean --force\nnpm.cmd install --legacy-peer-deps\nnpm.cmd run build`}
                    </pre>
                  </li>
                </ul>
              </div>

              {/* Paso 4: Publicación en Netlify Drop o Vercel */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                <div className="font-bold text-emerald-950 text-sm">
                  Paso 4 · Publicar Correctamente en Netlify Drop o Vercel
                </div>
                <div className="space-y-2 text-slate-800 leading-relaxed">
                  <div>
                    <strong>Opción A — Netlify Drop (<code>https://app.netlify.com/drop</code>):</strong>
                    <ol className="list-decimal pl-4 mt-1 space-y-1">
                      <li>Abre el Explorador de archivos de Windows y entra a tu carpeta del proyecto.</li>
                      <li>Ubica la carpeta <strong><code>dist</code></strong> (verifica que adentro tenga la carpeta <code>assets</code>).</li>
                      <li>Arrastra <strong>SOLAMENTE la carpeta <code>dist</code></strong> al recuadro de Netlify Drop.</li>
                    </ol>
                  </div>
                  <div className="pt-1 border-t border-emerald-200">
                    <strong>Opción B — Vercel (<code>https://vercel.com/new</code>):</strong>
                    <p className="mt-0.5 text-[11px] text-slate-700">
                      Importa tu repositorio de GitHub en Vercel. El archivo <code>vercel.json</code> incluido configura automáticamente <code>npm install --legacy-peer-deps</code>, el comando <code>npm run build</code> y el directorio de salida <code>dist</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB: PANEL DE DIAGNÓSTICO DE SISTEMA (CACHÉ, ESTADO PETICIONES API Y LATENCIA DEL SERVIDOR) ================= */}
      {activeTab === 'diagnostico_sistema' && (
        <SystemDiagnosticsPanel
          onForceServerSync={onForceServerSync}
          serverRevision={effectiveServerRevision}
          lastServerSyncFormatted={lastServerSyncFormatted}
          studentsCount={students.length}
          questionsCount={questions.length}
          attemptsCount={attempts.length}
        />
      )}

      {/* ================= TAB 7: CONFIGURACIÓN DE SEGURIDAD Y CORREO DE RECUPERACIÓN ================= */}
      {activeTab === 'seguridad_correo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <OptionServerSaveBar
              sectionKey="seguridad_y_respaldo"
              label="Credenciales Docente, Bloques Horarios Recurrentes, Correo de Recuperación y Respaldo"
              watchValue={[
                config.correoRecuperacion,
                config.claveDocente,
                effectiveAcademicDataset.aperturaAutomaticaHorarioActiva,
                effectiveAcademicDataset.bloquesHorariosRecurrentes
              ]}
            />
          </div>

          {/* SECCIÓN DE BLOQUES HORARIOS RECURRENTES POR ASIGNATURA (AUTOMATIZACIÓN DE APERTURA DE CLASES BASADA EN EL HORARIO ESCOLAR REAL) */}
          <div className="lg:col-span-2">
            <RecurringScheduleBlocksConfigurator
              dataset={effectiveAcademicDataset}
              students={students}
              courseModules={activeCourseMeta.modulosCurso}
              courseName={activeCourseMeta.nombreCurso}
              onUpdateDataset={(nextDs, opts) => {
                if (onUpdateAcademicDataset) {
                  onUpdateAcademicDataset(nextDs, opts);
                }
              }}
            />
          </div>

          {/* Recovery Email Config */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Mail className="w-5 h-5 text-sky-700" />
              <h2 className="text-lg font-bold">Configuración de Correo Oficial de Recuperación</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Correo actualmente activo para recibir solicitudes de recuperación de clave y notificaciones administrativas: <strong>{config.correoRecuperacion}</strong>
            </p>

            <form onSubmit={handleSaveRecoveryEmail} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-800">
                  Dirección de Correo Electrónico del Docente
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              {emailSaveStatus && (
                <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{emailSaveStatus}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!pendingEmailChange || isSavingRecoveryEmail}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  pendingEmailChange || isSavingRecoveryEmail
                    ? 'bg-sky-600 hover:bg-sky-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSavingRecoveryEmail ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Change Teacher Password */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Key className="w-5 h-5 text-sky-700" />
              <h2 className="text-lg font-bold">Cambiar Contraseña del Panel Docente</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              La nueva clave quedará persistida en el almacenamiento local seguro y reemplazará a la anterior en los próximos inicios de sesión.
            </p>

            <form onSubmit={handlePasswordChange} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">Contraseña Actual</label>
                <input
                  type="password"
                  required
                  value={currentPassInput}
                  onChange={(e) => setCurrentPassInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              {passChangeStatus && (
                <div
                  className={`text-xs font-semibold p-2.5 rounded-lg ${
                    passChangeStatus.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {passChangeStatus.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={!pendingPasswordChange || isSavingPassword}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  pendingPasswordChange || isSavingPassword
                    ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSavingPassword ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Full System Backup (.evaluaplus.json) Export & Restore */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-900">
                  <Database className="w-5 h-5 text-sky-700" />
                  <h2 className="text-lg font-bold">
                    Respaldo Total del Sistema en un Archivo (.evaluaplus.json)
                  </h2>
                </div>
                <p className="text-xs text-slate-600">
                  Exporte o restaure en un solo clic toda la plataforma (Nómina de {students.length} estudiantes, {questions.length} preguntas del banco, {attempts.length} exámenes calificados, notas ABPro y configuración) para trasladarla entre su computador personal y el aula de La Dorada.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportFullSystemBackup}
                  className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Respaldo Completo (.evaluaplus.json)</span>
                </button>

                <label className="px-4 py-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center gap-2 cursor-pointer whitespace-nowrap">
                  <Upload className="w-4 h-4 text-sky-700" />
                  <span>Importar / Restaurar Archivo de Respaldo</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFullSystemBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {backupRestoreStatus && (
              <div
                className={`p-3 rounded-lg text-xs font-semibold ${
                  backupRestoreStatus.type === 'ok'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                {backupRestoreStatus.msg}
              </div>
            )}
          </div>

          {/* Forzar Resincronización de Todos los Datos desde el Servidor y Eliminar Caché Local */}
          <div className="bg-white border border-emerald-200 rounded-xl p-6 space-y-4 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-900">
                  <RefreshCw className={`w-5 h-5 text-emerald-700 ${isForcingServerResync ? 'animate-spin' : ''}`} />
                  <h2 className="text-lg font-bold">
                    Forzar Resincronización Total desde el Servidor (Purgar Caché Local)
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Elimina inmediatamente cualquier caché local almacenada en este navegador (<code>localStorage</code> y Cache Storage) y descarga desde cero el estado real de la Base de Datos Central del Servidor (Upstash Redis / Servidor Central): nómina de estudiantes, códigos de acceso, banco de preguntas, intentos calificados, progreso de Mini Retos, sesiones en vivo y configuración.
                </p>
              </div>

              <button
                type="button"
                disabled={isForcingServerResync}
                onClick={handleExecuteForceServerResync}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0 shadow-xs"
              >
                <RefreshCw className={`w-4 h-4 ${isForcingServerResync ? 'animate-spin' : ''}`} />
                <span>
                  {isForcingServerResync
                    ? 'Purgando Caché y Descargando BD...'
                    : 'Forzar Resincronización y Limpiar Caché Ahora'}
                </span>
              </button>
            </div>

            {forceResyncResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  forceResyncResult.ok
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-red-50 border-red-300 text-red-900'
                }`}
              >
                <div className="font-bold">
                  {forceResyncResult.ok
                    ? `✓ Estado real descargado directamente del servidor (${forceResyncResult.syncedAtFormatted}) — Caché local eliminada y reconstruida`
                    : `⚠️ Error al resincronizar con el servidor: ${forceResyncResult.error || 'Error de conexión'}`}
                </div>
                <div className="font-mono text-[11px] text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Revisión Servidor: #{forceResyncResult.revision}</span>
                  <span>Revisión Banco: #{forceResyncResult.questionsRevision}</span>
                  <span>Estudiantes en BD: {students.length}</span>
                  <span>Reactivos en BD: {questions.length}</span>
                  <span>Exámenes Calificados: {attempts.length}</span>
                  <span>Evaluaciones ABPro: {abproEvaluations.length}</span>
                  <span>Plantillas Mini Retos: {customMiniRetos.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Panel de Control Permanente de Métodos Anti-Trampas (Exámenes y Mini Retos) */}
          <div className="bg-white border-2 border-indigo-200 rounded-xl p-6 space-y-4 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-900">
                  <ShieldAlert className="w-5 h-5 text-indigo-700" />
                  <h2 className="text-lg font-bold">
                    Control de Métodos Anti-Trampas en Exámenes y Mini Retos ({totalActiveAntiCheatCount}/12 Activos)
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Habilite, verifique o restaure todos los escudos anti-trampa en tiempo real por si alguna actualización de la aplicación web o carga de respaldo los deshabilita.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleEnableAllAntiCheatMethods}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Habilitar Todos los Métodos Anti-Trampa (12/12)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAntiCheatActionNotice(null);
                    setAntiCheatControlModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-4 h-4" />
                  <span>Abrir Panel Detallado Anti-Trampa</span>
                </button>
              </div>
            </div>

            {antiCheatActionNotice && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950">
                {antiCheatActionNotice}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>🛡️ Exámenes Oficiales ({activeExamAntiCheatCount}/7 activos)</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAntiCheatField('antiTrampaExamenesActivo')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      config.antiTrampaExamenesActivo !== false
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {config.antiTrampaExamenesActivo !== false ? '● HABILITADO' : '■ DESHABILITADO'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">
                  Incluye bloqueo de cambio de pestaña/foco (1ª advertencia / 2ª suspensión 0.0), bloqueo de copia/clic derecho/F12/PrintScreen, pantalla completa, anti split-screen, barajado A/B/C/D y ecualizador psicométrico IA con «cascaritas».
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>🏅 Mini Retos & Insignias ({activeRetoAntiCheatCount}/5 activos)</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAntiCheatField('antiTrampaMiniRetosActivo')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      config.antiTrampaMiniRetosActivo !== false
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {config.antiTrampaMiniRetosActivo !== false ? '● HABILITADO' : '■ DESHABILITADO'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">
                  Incluye regla de 1 advertencia en pérdida de foco, suspensión inmediata 0.0 por intento de copiar/pegar/arrastrar o inyección de texto, biometría de tecleo anti-chatbot (PPM, cadencia, Backspace) y pantalla completa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= VISTA: RESUMEN DE ASISTENCIA (CONSOLIDADO GRÁFICO DE INASISTENCIAS POR ESTUDIANTE BASADO EN ACADEMICDATASET) ================= */}
      {activeTab === 'resumen_asistencia' &&
        (() => {
          const activeClassDefs =
            Array.isArray(effectiveAcademicDataset.classSessions) &&
            effectiveAcademicDataset.classSessions.length > 0
              ? effectiveAcademicDataset.classSessions
              : [
                  { id: 1 as ClassSessionId, code: 'C1', shortTitle: 'Clase 1' },
                  { id: 2 as ClassSessionId, code: 'C2', shortTitle: 'Clase 2' },
                  { id: 3 as ClassSessionId, code: 'C3', shortTitle: 'Clase 3' },
                  { id: 4 as ClassSessionId, code: 'C4', shortTitle: 'Clase 4' },
                  { id: 5 as ClassSessionId, code: 'C5', shortTitle: 'Clase 5' },
                  { id: 6 as ClassSessionId, code: 'C6', shortTitle: 'Clase 6' }
                ];

          const maxPossibleBlocks = Math.max(2, activeClassDefs.length * 2);

          const studentAttendanceItems = effectiveAcademicDataset.records.map((rec) => {
            const rosterSt = students.find((s) => s.id === rec.studentId) || null;
            const summary = computeStudentAcademicSummary(
              rec,
              rosterSt,
              attempts,
              effectiveAcademicDataset.classSessions
            );
            return {
              rec,
              rosterSt,
              summary
            };
          });

          const totalStudentsCount = studentAttendanceItems.length;
          const totalAbsencesAllStudents = studentAttendanceItems.reduce(
            (acc, item) => acc + item.summary.totalFallasBloques,
            0
          );
          const totalB1Absences = studentAttendanceItems.reduce(
            (acc, item) => acc + item.summary.fallasBloque1,
            0
          );
          const totalB2Absences = studentAttendanceItems.reduce(
            (acc, item) => acc + item.summary.fallasBloque2,
            0
          );
          const withAbsencesCount = studentAttendanceItems.filter(
            (i) => i.summary.totalFallasBloques > 0
          ).length;
          const criticalCount = studentAttendanceItems.filter(
            (i) => i.summary.riesgoAusentismo === 'CRITICO'
          ).length;
          const moderateCount = studentAttendanceItems.filter(
            (i) => i.summary.riesgoAusentismo === 'MODERADO'
          ).length;
          const perfectCount = studentAttendanceItems.filter(
            (i) => i.summary.totalFallasBloques === 0
          ).length;

          // Consolidado por Clase (C1..C6)
          const perClassAbsenceStats = activeClassDefs.map((cs) => {
            let b1Fallas = 0;
            let b2Fallas = 0;
            let classAbsentStudents = 0;
            studentAttendanceItems.forEach(({ summary }) => {
              const b1 = summary.b1Inasistencia[cs.id] || 0;
              const b2 = summary.b2Inasistencia[cs.id] || 0;
              b1Fallas += b1;
              b2Fallas += b2;
              if (b1 === 1 || b2 === 1) classAbsentStudents++;
            });
            return {
              cs,
              b1Fallas,
              b2Fallas,
              totalFallas: b1Fallas + b2Fallas,
              classAbsentStudents
            };
          });

          const q = attendanceSummarySearch.trim().toLowerCase();
          const filteredAttendanceItems = studentAttendanceItems
            .filter(({ rec, summary }) => {
              if (q) {
                const match =
                  rec.nombre.toLowerCase().includes(q) ||
                  rec.documento.toLowerCase().includes(q);
                if (!match) return false;
              }
              if (attendanceSummaryFilter === 'WITH_ABSENCES') {
                return summary.totalFallasBloques > 0;
              }
              if (attendanceSummaryFilter === 'CRITICAL') {
                return summary.riesgoAusentismo === 'CRITICO';
              }
              if (attendanceSummaryFilter === 'MODERATE') {
                return summary.riesgoAusentismo === 'MODERADO';
              }
              if (attendanceSummaryFilter === 'PERFECT') {
                return summary.totalFallasBloques === 0;
              }
              return true;
            })
            .sort((a, b) => {
              if (attendanceSummarySort === 'MOST_ABSENCES') {
                if (b.summary.totalFallasBloques !== a.summary.totalFallasBloques) {
                  return b.summary.totalFallasBloques - a.summary.totalFallasBloques;
                }
                return a.rec.nombre.localeCompare(b.rec.nombre, 'es');
              }
              if (attendanceSummarySort === 'LOWEST_PCT') {
                if (a.summary.porcentajeAsistencia !== b.summary.porcentajeAsistencia) {
                  return a.summary.porcentajeAsistencia - b.summary.porcentajeAsistencia;
                }
                return b.summary.totalFallasBloques - a.summary.totalFallasBloques;
              }
              return a.rec.nombre.localeCompare(b.rec.nombre, 'es');
            });

          const maxStudentAbsences = Math.max(
            1,
            ...studentAttendanceItems.map((i) => i.summary.totalFallasBloques),
            maxPossibleBlocks / 2
          );

          const handleExportAttendanceSummaryCsv = () => {
            const headers = [
              'Estudiante',
              'Documento_ID',
              'Fallas_Bloque_A_B1',
              'Fallas_Bloque_B_B2',
              'Total_Bloques_Fallados',
              'Clases_Con_Inasistencia',
              'Porcentaje_Asistencia',
              'Nivel_Riesgo_Ausentismo'
            ];
            const rows = filteredAttendanceItems.map(({ rec, summary }) => [
              `"${rec.nombre.replace(/"/g, '""')}"`,
              rec.documento,
              String(summary.fallasBloque1),
              String(summary.fallasBloque2),
              String(summary.totalFallasBloques),
              String(summary.totalClasesInasistidas),
              `${summary.porcentajeAsistencia}%`,
              summary.riesgoAusentismo
            ]);
            const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Resumen_Gráfico_Inasistencias_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          };

          return (
            <div className="space-y-5">
              {/* Cabecera de la Vista de Resumen de Asistencia */}
              <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-mono text-[11px] font-extrabold uppercase">
                    <BarChart3 className="w-3.5 h-3.5 text-indigo-700" />
                    <span>Analítica Visual de Asistencia · Basado en AcademicDataset</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                    Resumen de Asistencia — Consolidado Gráfico de Inasistencias por Estudiante
                  </h2>
                  <p className="text-xs text-slate-600">
                    Visualice gráficamente las inasistencias acumuladas en el Bloque A (B1) y Bloque B (B2) por cada estudiante y por cada clase del curso <strong>{activeCourseMeta.nombreCurso}</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('monitor_vivo')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    📢 Ir a Llamado de Asistencia en Vivo
                  </button>
                  <button
                    type="button"
                    onClick={handleExportAttendanceSummaryCsv}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Resumen CSV</span>
                  </button>
                </div>
              </div>

              {/* 5 Tarjetas KPI del Resumen de Asistencia */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-slate-500 font-bold">
                    Asistencia Promedio
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-indigo-700 mt-1">
                    {classroomCentralMetrics.avgAttendancePct}%
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Nómina: {totalStudentsCount} estudiantes
                  </div>
                </div>

                <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-rose-700 font-bold">
                    Total Inasistencias (Bloques)
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">
                    {totalAbsencesAllStudents}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Bloque A: <strong>{totalB1Absences}</strong> · Bloque B: <strong>{totalB2Absences}</strong>
                  </div>
                </div>

                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-emerald-700 font-bold">
                    Asistencia Perfecta (0)
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
                    {perfectCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Estudiantes sin inasistencias
                  </div>
                </div>

                <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-amber-700 font-bold">
                    Ausentismo Moderado (1–2)
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-amber-600 mt-1">
                    {moderateCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Seguimiento preventivo
                  </div>
                </div>

                <div className="bg-white border border-red-300 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-red-700 font-bold">
                    Riesgo Crítico (≥ 3 Fallas)
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-red-600 mt-1">
                    {criticalCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Alerta temprana de deserción
                  </div>
                </div>
              </div>

              {/* COMPONENTE VISUAL TIPO HEATMAP: DÍAS DE MAYOR AUSENTISMO A LO LARGO DEL PERIODO ACADÉMICO */}
              {(() => {
                // Calcular fecha estimada o programada de cada jornada del periodo académico
                const baseStartDate = (() => {
                  const raw = (activeCourseMeta as any)?.fechaInicioCurso;
                  if (raw && !Number.isNaN(new Date(raw).getTime())) {
                    return new Date(raw);
                  }
                  return new Date(2026, 2, 7); // Sábado inicial de referencia del periodo académico
                })();

                const heatmapDays = perClassAbsenceStats.map((st, idx) => {
                  const sessionDate = new Date(baseStartDate.getTime());
                  sessionDate.setDate(baseStartDate.getDate() + idx * 7);
                  const dateFormatted = sessionDate.toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short'
                  });
                  const fullDateFormatted = sessionDate.toLocaleDateString('es-CO', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });

                  // Calcular fallas según el filtro de bloque activo en el heatmap
                  const activeFallasCount =
                    attendanceHeatmapBlockMode === 'B1'
                      ? st.b1Fallas
                      : attendanceHeatmapBlockMode === 'B2'
                      ? st.b2Fallas
                      : st.totalFallas;

                  const maxPossibleForMode =
                    attendanceHeatmapBlockMode === 'ALL'
                      ? Math.max(1, totalStudentsCount * 2)
                      : Math.max(1, totalStudentsCount);

                  const absenceRatePct = Math.min(
                    100,
                    Math.round((activeFallasCount / maxPossibleForMode) * 100)
                  );

                  const b1RatePct = Math.min(
                    100,
                    Math.round((st.b1Fallas / Math.max(1, totalStudentsCount)) * 100)
                  );
                  const b2RatePct = Math.min(
                    100,
                    Math.round((st.b2Fallas / Math.max(1, totalStudentsCount)) * 100)
                  );

                  // Escala térmica de 5 niveles (0: 0%, 1: 1-15%, 2: 16-30%, 3: 31-50%, 4: >50%)
                  const heatLevel: 0 | 1 | 2 | 3 | 4 =
                    activeFallasCount === 0
                      ? 0
                      : absenceRatePct <= 15
                      ? 1
                      : absenceRatePct <= 30
                      ? 2
                      : absenceRatePct <= 50
                      ? 3
                      : 4;

                  // Estudiantes ausentes en esta jornada según el bloque seleccionado
                  const absentStudentsInDay = studentAttendanceItems
                    .filter(({ summary }) => {
                      const b1 = summary.b1Inasistencia[st.cs.id] || 0;
                      const b2 = summary.b2Inasistencia[st.cs.id] || 0;
                      if (attendanceHeatmapBlockMode === 'B1') return b1 === 1;
                      if (attendanceHeatmapBlockMode === 'B2') return b2 === 1;
                      return b1 === 1 || b2 === 1;
                    })
                    .map(({ rec, summary }) => ({
                      studentId: rec.studentId,
                      nombre: rec.nombre,
                      documento: rec.documento,
                      b1Falla: (summary.b1Inasistencia[st.cs.id] || 0) === 1,
                      b2Falla: (summary.b2Inasistencia[st.cs.id] || 0) === 1
                    }));

                  return {
                    ...st,
                    dateFormatted,
                    fullDateFormatted,
                    activeFallasCount,
                    maxPossibleForMode,
                    absenceRatePct,
                    b1RatePct,
                    b2RatePct,
                    heatLevel,
                    absentStudentsInDay
                  };
                });

                const peakDay =
                  heatmapDays.reduce(
                    (best, curr) =>
                      !best || curr.activeFallasCount > best.activeFallasCount ? curr : best,
                    null as (typeof heatmapDays)[number] | null
                  ) || null;

                const lowestAbsenceDay =
                  heatmapDays.reduce(
                    (best, curr) =>
                      !best || curr.activeFallasCount < best.activeFallasCount ? curr : best,
                    null as (typeof heatmapDays)[number] | null
                  ) || null;

                const getHeatCellClasses = (level: 0 | 1 | 2 | 3 | 4, isSelected = false) => {
                  const ring = isSelected ? 'ring-2 ring-slate-900 ring-offset-2' : '';
                  switch (level) {
                    case 0:
                      return `bg-emerald-50 border-emerald-300 text-emerald-950 ${ring}`;
                    case 1:
                      return `bg-amber-100/90 border-amber-300 text-amber-950 ${ring}`;
                    case 2:
                      return `bg-orange-200/90 border-orange-400 text-orange-950 ${ring}`;
                    case 3:
                      return `bg-rose-500 border-rose-600 text-white ${ring}`;
                    case 4:
                      return `bg-red-800 border-red-950 text-white ${ring}`;
                  }
                };

                const getHeatBadgeLabel = (level: 0 | 1 | 2 | 3 | 4) => {
                  switch (level) {
                    case 0:
                      return 'Sin ausentismo (0%)';
                    case 1:
                      return 'Ausentismo leve (1–15%)';
                    case 2:
                      return 'Ausentismo moderado (16–30%)';
                    case 3:
                      return 'Ausentismo alto (31–50%)';
                    case 4:
                      return 'Pico crítico (>50%)';
                  }
                };

                const inspectedDay =
                  heatmapDays.find((d) => d.cs.id === selectedHeatmapClassId) ||
                  (peakDay && peakDay.activeFallasCount > 0 ? peakDay : heatmapDays[0] || null);

                return (
                  <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 shadow-xs space-y-4">
                    {/* FRANJA DE COMPARATIVA HISTÓRICA DE ASISTENCIA ENTRE CORTES / CLASES (▲ SUBIÓ / ▼ BAJÓ RESPECTO A LA CLASE ANTERIOR) */}
                    {heatmapDays.length > 1 && (
                      <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-3.5 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-700 shrink-0" />
                            <span>
                              Comparativa Histórica de Asistencia entre Clases (Variación ▲ Subió / ▼ Bajó respecto a la clase anterior)
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-indigo-800">
                            Monitoreo de tendencia de participación del grupo
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                          {heatmapDays.map((day, dIdx) => {
                            const currAttendPct = Math.max(0, 100 - day.absenceRatePct);
                            const prevDay = dIdx > 0 ? heatmapDays[dIdx - 1] : null;
                            const prevAttendPct = prevDay
                              ? Math.max(0, 100 - prevDay.absenceRatePct)
                              : currAttendPct;
                            const deltaPct = prevDay ? currAttendPct - prevAttendPct : 0;

                            return (
                              <div
                                key={`trend-${day.cs.id}`}
                                className="rounded-lg bg-white border border-indigo-200/80 px-2.5 py-2 flex flex-col justify-between gap-1"
                              >
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className="font-extrabold text-slate-900">
                                    C{day.cs.id} ({day.dateFormatted})
                                  </span>
                                  <span className="font-bold text-indigo-700">
                                    {currAttendPct}% asist.
                                  </span>
                                </div>
                                {prevDay ? (
                                  <div
                                    className={`font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded text-center ${
                                      deltaPct > 0
                                        ? 'bg-emerald-100 text-emerald-900'
                                        : deltaPct < 0
                                        ? 'bg-rose-100 text-rose-900'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {deltaPct > 0
                                      ? `▲ Subió +${deltaPct}% vs C${prevDay.cs.id}`
                                      : deltaPct < 0
                                      ? `▼ Bajó ${deltaPct}% vs C${prevDay.cs.id}`
                                      : `● Estable (0%) vs C${prevDay.cs.id}`}
                                  </div>
                                ) : (
                                  <div className="font-mono text-[10px] text-slate-500 text-center bg-slate-50 rounded py-0.5">
                                    Jornada Base (C1)
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-900 font-mono text-[10px] font-extrabold uppercase">
                          <span>🔥 Mapa de Calor (Heatmap) del Periodo Académico</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                          1. Heatmap de Ausentismo por Día / Jornada y Bloque a lo Largo del Periodo Académico
                        </h3>
                        <p className="text-xs text-slate-600">
                          Identifique de un vistazo los días, jornadas y bloques con mayor concentración de inasistencias. Haga clic sobre cualquier día del mapa de calor para inspeccionar los estudiantes ausentes.
                        </p>
                      </div>

                      {/* Controles del Heatmap: Filtro de Bloque y Modo de Visualización */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-0.5 text-xs">
                          {[
                            { id: 'ALL' as const, label: 'Día Completo (A+B)' },
                            { id: 'B1' as const, label: 'Solo Bloque A (B1)' },
                            { id: 'B2' as const, label: 'Solo Bloque B (B2)' }
                          ].map((bMode) => (
                            <button
                              key={bMode.id}
                              type="button"
                              onClick={() => setAttendanceHeatmapBlockMode(bMode.id)}
                              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                                attendanceHeatmapBlockMode === bMode.id
                                  ? 'bg-slate-900 text-white shadow-2xs'
                                  : 'text-slate-700 hover:text-slate-900'
                              }`}
                            >
                              {bMode.label}
                            </button>
                          ))}
                        </div>

                        <div className="inline-flex rounded-xl border border-indigo-200 bg-indigo-50/70 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setAttendanceHeatmapViewMode('DAYS_OVERVIEW')}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                              attendanceHeatmapViewMode === 'DAYS_OVERVIEW'
                                ? 'bg-indigo-700 text-white'
                                : 'text-indigo-900 hover:bg-indigo-100'
                            }`}
                          >
                            📅 Mapa por Día y Bloque
                          </button>
                          <button
                            type="button"
                            onClick={() => setAttendanceHeatmapViewMode('STUDENT_MATRIX')}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                              attendanceHeatmapViewMode === 'STUDENT_MATRIX'
                                ? 'bg-indigo-700 text-white'
                                : 'text-indigo-900 hover:bg-indigo-100'
                            }`}
                          >
                            🧮 Matriz Estudiantes × Días
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Indicadores Rápidos de Pico de Ausentismo y Leyenda Térmica */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="lg:col-span-4 flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-mono font-extrabold shrink-0">
                          🔥
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase text-rose-700 font-extrabold">
                            Día de Mayor Ausentismo (Pico del Periodo)
                          </div>
                          {peakDay && peakDay.activeFallasCount > 0 ? (
                            <div className="font-bold text-slate-900">
                              Jornada C{peakDay.cs.id} ({peakDay.dateFormatted}) ·{' '}
                              <span className="text-rose-700 font-extrabold">
                                {peakDay.activeFallasCount} falla(s) ({peakDay.absenceRatePct}%)
                              </span>
                            </div>
                          ) : (
                            <div className="font-bold text-emerald-700">
                              Sin picos de ausentismo (0 fallas en el periodo)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-3 flex items-center gap-2.5 border-t lg:border-t-0 lg:border-l border-slate-200 pt-2 lg:pt-0 lg:pl-3">
                        <div>
                          <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">
                            Jornada de Mayor Asistencia
                          </div>
                          {lowestAbsenceDay ? (
                            <div className="font-bold text-slate-900">
                              Jornada C{lowestAbsenceDay.cs.id} ({lowestAbsenceDay.dateFormatted}) ·{' '}
                              <span className="text-emerald-700 font-extrabold">
                                {100 - lowestAbsenceDay.absenceRatePct}% asistencia
                              </span>
                            </div>
                          ) : (
                            <div className="text-slate-500">—</div>
                          )}
                        </div>
                      </div>

                      {/* Escala cromática del Heatmap */}
                      <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-1.5 border-t lg:border-t-0 lg:border-l border-slate-200 pt-2 lg:pt-0 lg:pl-3">
                        <span className="text-[10px] font-mono font-bold text-slate-500 mr-1">
                          Intensidad:
                        </span>
                        <span className="px-2 py-0.5 rounded border bg-emerald-50 border-emerald-300 text-emerald-950 font-mono text-[10px] font-bold">
                          0% (Sin fallas)
                        </span>
                        <span className="px-2 py-0.5 rounded border bg-amber-100 border-amber-300 text-amber-950 font-mono text-[10px] font-bold">
                          1–15% (Leve)
                        </span>
                        <span className="px-2 py-0.5 rounded border bg-orange-200 border-orange-400 text-orange-950 font-mono text-[10px] font-bold">
                          16–30% (Moderado)
                        </span>
                        <span className="px-2 py-0.5 rounded border bg-rose-500 border-rose-600 text-white font-mono text-[10px] font-bold">
                          31–50% (Alto)
                        </span>
                        <span className="px-2 py-0.5 rounded border bg-red-800 border-red-950 text-white font-mono text-[10px] font-bold">
                          &gt;50% (Crítico)
                        </span>
                      </div>
                    </div>

                    {/* MODO 1: MAPA DE CALOR POR DÍA Y BLOQUE DEL PERIODO ACADÉMICO */}
                    {attendanceHeatmapViewMode === 'DAYS_OVERVIEW' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                          {heatmapDays.map((day) => {
                            const isPeak =
                              peakDay &&
                              peakDay.activeFallasCount > 0 &&
                              day.activeFallasCount === peakDay.activeFallasCount;
                            const isSelected = inspectedDay?.cs.id === day.cs.id;

                            const b1CellLevel: 0 | 1 | 2 | 3 | 4 =
                              day.b1Fallas === 0
                                ? 0
                                : day.b1RatePct <= 15
                                ? 1
                                : day.b1RatePct <= 30
                                ? 2
                                : day.b1RatePct <= 50
                                ? 3
                                : 4;
                            const b2CellLevel: 0 | 1 | 2 | 3 | 4 =
                              day.b2Fallas === 0
                                ? 0
                                : day.b2RatePct <= 15
                                ? 1
                                : day.b2RatePct <= 30
                                ? 2
                                : day.b2RatePct <= 50
                                ? 3
                                : 4;

                            return (
                              <button
                                key={day.cs.id}
                                type="button"
                                onClick={() => setSelectedHeatmapClassId(day.cs.id)}
                                className={`text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${getHeatCellClasses(
                                  day.heatLevel,
                                  isSelected
                                )}`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-extrabold text-xs">
                                      DÍA / CLASE C{day.cs.id}
                                    </span>
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/10 font-bold">
                                      {day.dateFormatted}
                                    </span>
                                  </div>
                                  <div
                                    className="text-[11px] font-bold truncate opacity-90"
                                    title={day.cs.shortTitle}
                                  >
                                    {day.cs.shortTitle}
                                  </div>
                                  {isPeak && (
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950 text-amber-200 font-mono text-[9px] font-extrabold uppercase">
                                      🔥 Mayor Ausentismo
                                    </div>
                                  )}
                                </div>

                                {/* Indicador central de calor del día */}
                                <div className="py-2 px-2.5 rounded-xl bg-white/85 text-slate-900 border border-black/10 space-y-1">
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">
                                      Tasa Ausentismo
                                    </span>
                                    <span className="text-lg font-extrabold font-mono text-slate-900">
                                      {day.absenceRatePct}%
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-700 flex items-center justify-between">
                                    <span>Fallas: <strong>{day.activeFallasCount}</strong></span>
                                    <span>Alumnos: <strong>{day.absentStudentsInDay.length}/{totalStudentsCount}</strong></span>
                                  </div>
                                </div>

                                {/* Sub-celdas térmicas Bloque A vs Bloque B */}
                                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                                  <div
                                    className={`rounded-lg border px-2 py-1 text-center font-mono ${getHeatCellClasses(
                                      b1CellLevel
                                    )}`}
                                    title={`Bloque A (Mañana): ${day.b1Fallas} falla(s) (${day.b1RatePct}%)`}
                                  >
                                    <div className="text-[9px] font-bold uppercase opacity-80">
                                      Bloque A
                                    </div>
                                    <div className="text-xs font-extrabold">{day.b1Fallas}</div>
                                    <div className="text-[9px] opacity-85">{day.b1RatePct}%</div>
                                  </div>
                                  <div
                                    className={`rounded-lg border px-2 py-1 text-center font-mono ${getHeatCellClasses(
                                      b2CellLevel
                                    )}`}
                                    title={`Bloque B (Tarde): ${day.b2Fallas} falla(s) (${day.b2RatePct}%)`}
                                  >
                                    <div className="text-[9px] font-bold uppercase opacity-80">
                                      Bloque B
                                    </div>
                                    <div className="text-xs font-extrabold">{day.b2Fallas}</div>
                                    <div className="text-[9px] opacity-85">{day.b2RatePct}%</div>
                                  </div>
                                </div>

                                <div className="text-[10px] font-mono font-bold opacity-90 flex items-center justify-between pt-0.5">
                                  <span>{getHeatBadgeLabel(day.heatLevel)}</span>
                                  <span className="underline">Ver detalle →</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* MODO 2: MATRIZ DE CALOR (ESTUDIANTES × DÍAS Y BLOQUES DEL PERIODO ACADÉMICO) */
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white font-mono text-[11px]">
                              <th className="p-2.5 border-r border-slate-700 min-w-[210px]">
                                Estudiante / Jornada del Periodo
                              </th>
                              {heatmapDays.map((day) => (
                                <th
                                  key={day.cs.id}
                                  onClick={() => setSelectedHeatmapClassId(day.cs.id)}
                                  className="p-2 text-center border-r border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors min-w-[96px]"
                                  title={`Clic para inspeccionar Jornada C${day.cs.id} (${day.fullDateFormatted})`}
                                >
                                  <div className="font-extrabold">
                                    DÍA C{day.cs.id} · {day.dateFormatted}
                                  </div>
                                  <div className="text-[10px] text-slate-300 font-normal truncate max-w-[110px] mx-auto">
                                    {day.cs.shortTitle}
                                  </div>
                                </th>
                              ))}
                              <th className="p-2.5 text-center bg-slate-950 min-w-[90px]">
                                Total Fallas
                              </th>
                            </tr>
                            {/* Fila térmica consolidada del grupo por día */}
                            <tr className="bg-slate-100 border-b-2 border-slate-300 font-mono text-[11px]">
                              <td className="p-2.5 font-extrabold text-slate-900 border-r border-slate-300">
                                🔥 Intensidad Diaria del Grupo
                              </td>
                              {heatmapDays.map((day) => (
                                <td
                                  key={day.cs.id}
                                  onClick={() => setSelectedHeatmapClassId(day.cs.id)}
                                  className={`p-2 text-center border-r border-slate-300 cursor-pointer font-extrabold ${getHeatCellClasses(
                                    day.heatLevel
                                  )}`}
                                >
                                  <div>{day.activeFallasCount} falla(s)</div>
                                  <div className="text-[10px] opacity-85">
                                    {day.absenceRatePct}% ausent.
                                  </div>
                                </td>
                              ))}
                              <td className="p-2 text-center font-extrabold text-rose-700 bg-rose-50">
                                {totalAbsencesAllStudents}
                              </td>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredAttendanceItems.map(({ rec, summary }) => (
                              <tr key={rec.studentId} className="hover:bg-slate-50/80">
                                <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                                  <div className="truncate max-w-[220px]" title={rec.nombre}>
                                    {rec.nombre}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-500">
                                    ID: {rec.documento} · Asist: {summary.porcentajeAsistencia}%
                                  </div>
                                </td>
                                {heatmapDays.map((day) => {
                                  const b1 = summary.b1Inasistencia[day.cs.id] || 0;
                                  const b2 = summary.b2Inasistencia[day.cs.id] || 0;
                                  const cellFallas =
                                    attendanceHeatmapBlockMode === 'B1'
                                      ? b1
                                      : attendanceHeatmapBlockMode === 'B2'
                                      ? b2
                                      : b1 + b2;
                                  const cellColor =
                                    cellFallas === 0
                                      ? 'bg-emerald-50/70 text-emerald-900'
                                      : cellFallas === 1 && attendanceHeatmapBlockMode === 'ALL'
                                      ? 'bg-amber-200/80 text-amber-950 font-extrabold'
                                      : 'bg-rose-600 text-white font-extrabold';
                                  return (
                                    <td
                                      key={day.cs.id}
                                      onClick={() => setSelectedHeatmapClassId(day.cs.id)}
                                      className={`p-2 text-center border-r border-slate-200 font-mono text-[11px] cursor-pointer transition-colors ${cellColor}`}
                                      title={`${rec.nombre} · Día C${day.cs.id} (${day.dateFormatted}): Bloque A=${
                                        b1 === 1 ? 'Falla' : 'Asistió'
                                      } | Bloque B=${b2 === 1 ? 'Falla' : 'Asistió'}`}
                                    >
                                      {attendanceHeatmapBlockMode === 'ALL' ? (
                                        <div>
                                          <span>{b1 === 1 ? 'A:✗' : 'A:✓'}</span>
                                          <span className="mx-1 opacity-50">|</span>
                                          <span>{b2 === 1 ? 'B:✗' : 'B:✓'}</span>
                                        </div>
                                      ) : (
                                        <div>{cellFallas === 1 ? '✗ FALLA (1)' : '✓ Asistió'}</div>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="p-2 text-center font-mono font-extrabold text-slate-900 bg-slate-50">
                                  {summary.totalFallasBloques}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Panel de Inspección Rápida del Día Seleccionado en el Heatmap */}
                    {inspectedDay && (
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2 text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-700 text-white font-mono font-extrabold text-[11px]">
                              INSPECCIÓN DÍA C{inspectedDay.cs.id} · {inspectedDay.fullDateFormatted}
                            </span>
                            <span className="font-bold text-slate-900">
                              {inspectedDay.cs.shortTitle}
                            </span>
                            <span className="font-mono text-slate-600">
                              — Bloque A: <strong>{inspectedDay.b1Fallas} falla(s)</strong> · Bloque B:{' '}
                              <strong>{inspectedDay.b2Fallas} falla(s)</strong>
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-bold text-indigo-950">
                            {inspectedDay.absentStudentsInDay.length} estudiante(s) con inasistencia en esta fecha
                          </span>
                        </div>

                        {inspectedDay.absentStudentsInDay.length === 0 ? (
                          <div className="text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            ✓ Asistencia del 100% en esta jornada para el bloque seleccionado. Ningún estudiante registró fallas.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {inspectedDay.absentStudentsInDay.map((st) => (
                              <span
                                key={st.studentId}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-slate-900 font-medium shadow-2xs"
                              >
                                <span className="font-bold">{st.nombre}</span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  ({st.documento})
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 font-mono text-[10px] font-extrabold">
                                  {st.b1Falla && st.b2Falla
                                    ? 'Bloques A y B'
                                    : st.b1Falla
                                    ? 'Bloque A'
                                    : 'Bloque B'}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Gráfica 2: Consolidado de Inasistencias por Clase (Bloque A vs Bloque B) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      1. Consolidado Gráfico de Inasistencias por Sesión de Clase (Bloque A vs. Bloque B)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Comparativa de fallas registradas en cada bloque por clase activa del curso
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                      <span>Fallas Bloque A (B1)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-rose-600 inline-block" />
                      <span>Fallas Bloque B (B2)</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-1">
                  {perClassAbsenceStats.map((st) => {
                    const maxClassFallas = Math.max(1, totalStudentsCount * 2);
                    const b1Pct = Math.min(100, Math.round((st.b1Fallas / Math.max(1, totalStudentsCount)) * 100));
                    const b2Pct = Math.min(100, Math.round((st.b2Fallas / Math.max(1, totalStudentsCount)) * 100));
                    return (
                      <div
                        key={st.cs.id}
                        className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-extrabold text-slate-900">
                            CLASE C{st.cs.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              st.totalFallas > 0
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {st.totalFallas} falla(s)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate" title={st.cs.shortTitle}>
                          {st.cs.shortTitle}
                        </div>
                        <div className="space-y-1.5 pt-1">
                          <div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-600">
                              <span>Bloque A (B1)</span>
                              <strong>{st.b1Fallas}</strong>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{ width: `${b1Pct}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-600">
                              <span>Bloque B (B2)</span>
                              <strong>{st.b2Fallas}</strong>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-rose-600 rounded-full transition-all"
                                style={{ width: `${b2Pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200/80">
                          Alumnos con falla: <strong>{st.classAbsentStudents}/{totalStudentsCount}</strong> (máx {maxClassFallas} bloq.)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gráfica 2: Consolidado Gráfico de Inasistencias por Estudiante */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      2. Gráfico Consolidado de Inasistencias por Estudiante ({filteredAttendanceItems.length} de {totalStudentsCount})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Barras comparativas de bloques inasistidos (Bloque A + Bloque B), mapa por clase y porcentaje de asistencia individual
                    </p>
                  </div>

                  {/* Filtros y Ordenamiento */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'ALL' as const, label: `Todos (${totalStudentsCount})` },
                      { id: 'WITH_ABSENCES' as const, label: `Con Inasistencias (${withAbsencesCount})` },
                      { id: 'CRITICAL' as const, label: `Crítico ≥3 (${criticalCount})` },
                      { id: 'MODERATE' as const, label: `Moderado 1–2 (${moderateCount})` },
                      { id: 'PERFECT' as const, label: `Sin Fallas (${perfectCount})` }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAttendanceSummaryFilter(tab.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-colors ${
                          attendanceSummaryFilter === tab.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buscador y Selector de Orden */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={attendanceSummarySearch}
                      onChange={(e) => setAttendanceSummarySearch(e.target.value)}
                      placeholder="Buscar estudiante por nombre o documento..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-700">Ordenar gráfico por:</span>
                    <select
                      value={attendanceSummarySort}
                      onChange={(e) => setAttendanceSummarySort(e.target.value as any)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    >
                      <option value="MOST_ABSENCES">Mayor número de inasistencias</option>
                      <option value="LOWEST_PCT">Menor % de asistencia</option>
                      <option value="ALPHABETICAL">Orden alfabético (A–Z)</option>
                    </select>
                  </div>
                </div>

                {/* Barras Gráficas por Estudiante */}
                {filteredAttendanceItems.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                    No hay estudiantes que coincidan con el filtro seleccionado.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                    {filteredAttendanceItems.map(({ rec, summary }, idx) => {
                      const b1WidthPct = Math.min(
                        100,
                        Math.round((summary.fallasBloque1 / maxStudentAbsences) * 100)
                      );
                      const b2WidthPct = Math.min(
                        100 - b1WidthPct,
                        Math.round((summary.fallasBloque2 / maxStudentAbsences) * 100)
                      );

                      return (
                        <div
                          key={rec.studentId}
                          className={`p-3.5 rounded-xl border transition-all text-xs ${
                            summary.riesgoAusentismo === 'CRITICO'
                              ? 'bg-red-50/60 border-red-300'
                              : summary.riesgoAusentismo === 'MODERADO'
                              ? 'bg-amber-50/50 border-amber-200'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                            {/* Estudiante y Estado */}
                            <div className="lg:col-span-4 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-500">
                                  #{idx + 1}
                                </span>
                                <span className="font-extrabold text-slate-900 text-sm">
                                  {rec.nombre}
                                </span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  ({rec.documento})
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold ${
                                    summary.riesgoAusentismo === 'CRITICO'
                                      ? 'bg-red-600 text-white'
                                      : summary.riesgoAusentismo === 'MODERADO'
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-emerald-100 text-emerald-900'
                                  }`}
                                >
                                  {summary.riesgoAusentismo === 'CRITICO'
                                    ? `🚨 CRÍTICO (${summary.totalFallasBloques} fallas)`
                                      : summary.riesgoAusentismo === 'MODERADO'
                                      ? `⚠️ MODERADO (${summary.totalFallasBloques} fallas)`
                                      : '✓ ASISTENCIA PERFECTA (0 fallas)'}
                                </span>
                                <span className="font-mono text-[11px] text-slate-600">
                                  Asistencia: <strong>{summary.porcentajeAsistencia}%</strong>
                                </span>
                              </div>
                            </div>

                            {/* Barra Gráfica Apilada de Inasistencias (Bloque A + Bloque B) */}
                            <div className="lg:col-span-5 space-y-1.5">
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className="font-bold text-slate-800">
                                  Inasistencias Acumuladas:{' '}
                                  <strong className="text-rose-700">
                                    {summary.totalFallasBloques} bloque(s)
                                  </strong>{' '}
                                  ({summary.totalClasesInasistidas} clase(s))
                                </span>
                                <span className="text-slate-500">
                                  B1: <strong>{summary.fallasBloque1}</strong> · B2:{' '}
                                  <strong>{summary.fallasBloque2}</strong>
                                </span>
                              </div>
                              <div className="w-full h-4 rounded-lg bg-slate-200 overflow-hidden flex items-center p-0.5">
                                {summary.totalFallasBloques === 0 ? (
                                  <div className="h-full w-full bg-emerald-500/30 rounded flex items-center px-2 text-[10px] font-mono font-bold text-emerald-900">
                                    0 inasistencias registradas (100% asistencia)
                                  </div>
                                ) : (
                                  <>
                                    {summary.fallasBloque1 > 0 && (
                                      <div
                                        className="h-full bg-amber-500 flex items-center justify-center text-[10px] font-mono font-extrabold text-slate-950 transition-all"
                                        style={{ width: `${Math.max(12, b1WidthPct)}%` }}
                                        title={`Inasistencias Bloque A (B1): ${summary.fallasBloque1}`}
                                      >
                                        A:{summary.fallasBloque1}
                                      </div>
                                    )}
                                    {summary.fallasBloque2 > 0 && (
                                      <div
                                        className="h-full bg-rose-600 flex items-center justify-center text-[10px] font-mono font-extrabold text-white transition-all"
                                        style={{ width: `${Math.max(12, b2WidthPct)}%` }}
                                        title={`Inasistencias Bloque B (B2): ${summary.fallasBloque2}`}
                                      >
                                        B:{summary.fallasBloque2}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Mapa Visual por Clase C1..C6 */}
                            <div className="lg:col-span-3 flex flex-wrap items-center justify-end gap-1">
                              {activeClassDefs.map((cs) => {
                                const b1 = summary.b1Inasistencia[cs.id] || 0;
                                const b2 = summary.b2Inasistencia[cs.id] || 0;
                                const hasAnyAbsence = b1 === 1 || b2 === 1;
                                return (
                                  <div
                                    key={cs.id}
                                    className={`px-2 py-1 rounded-lg border font-mono text-[10px] text-center ${
                                      hasAnyAbsence
                                        ? 'bg-red-100 border-red-300 text-red-900 font-extrabold'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                    }`}
                                    title={`Clase C${cs.id}: Bloque A=${b1 === 1 ? 'Inasistió (1)' : 'Asistió'} | Bloque B=${b2 === 1 ? 'Inasistió (1)' : 'Asistió'}`}
                                  >
                                    <div>C{cs.id}</div>
                                    <div className="text-[9px]">
                                      {b1 === 1 ? '1' : '✓'}/{b2 === 1 ? '1' : '✓'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* ================= SECCIÓN: SEGURIDAD Y CONVIVENCIA (RANKING DE ESTUDIANTES CON MÁS INFRACCIONES DETECTADAS POR EL SISTEMA ANTI-TRAMPA USANDO HISTORIALLLAMADOSATENCION) ================= */}
      {activeTab === 'seguridad_convivencia' &&
        (() => {
          type InfractionTypeCategory =
            | 'CAMBIO_FOCO'
            | 'DEVTOOLS_INSPECTOR'
            | 'COPIA_PEGADO'
            | 'PANTALLA_DIVIDIDA'
            | 'BIOMETRIA_IA'
            | 'SUPERVISION_DOCENTE';

          type InfractionSeverityLevel = 'CRITICA' | 'ALTA' | 'LEVE';

          const classifyInfractionMotivo = (
            rawMotivo: string | undefined
          ): {
            typeId: InfractionTypeCategory;
            typeLabel: string;
            eventSeverity: InfractionSeverityLevel;
            severityLabel: string;
            badgeClass: string;
          } => {
            const m = (rawMotivo || '').toLowerCase();
            if (
              m.includes('devtools') ||
              m.includes('herramientas de desarrollo') ||
              m.includes('inspector') ||
              m.includes('consola') ||
              m.includes('f12') ||
              m.includes('atajo')
            ) {
              return {
                typeId: 'DEVTOOLS_INSPECTOR',
                typeLabel: '🛠️ Herramientas de Desarrollo (DevTools)',
                eventSeverity: 'CRITICA',
                severityLabel: 'Severidad Crítica',
                badgeClass: 'bg-red-700 text-white'
              };
            }
            if (
              m.includes('copia') ||
              m.includes('pegar') ||
              m.includes('pegado') ||
              m.includes('copy') ||
              m.includes('paste') ||
              m.includes('portapapeles') ||
              m.includes('inyección') ||
              m.includes('inyeccion') ||
              m.includes('arrastrar')
            ) {
              return {
                typeId: 'COPIA_PEGADO',
                typeLabel: '📋 Copia / Pegado / Inyección',
                eventSeverity: 'CRITICA',
                severityLabel: 'Severidad Crítica',
                badgeClass: 'bg-rose-700 text-white'
              };
            }
            if (
              m.includes('biometr') ||
              m.includes('cadencia') ||
              m.includes('ppm') ||
              m.includes('chatbot') ||
              m.includes('tecleo') ||
              m.includes('ia ')
            ) {
              return {
                typeId: 'BIOMETRIA_IA',
                typeLabel: '🤖 Biometría / Sospecha IA',
                eventSeverity: 'CRITICA',
                severityLabel: 'Severidad Crítica',
                badgeClass: 'bg-purple-700 text-white'
              };
            }
            if (
              m.includes('pantalla completa') ||
              m.includes('fullscreen') ||
              m.includes('dividida') ||
              m.includes('split') ||
              m.includes('redimension')
            ) {
              return {
                typeId: 'PANTALLA_DIVIDIDA',
                typeLabel: '🖥️ Pantalla Dividida / Fullscreen',
                eventSeverity: 'ALTA',
                severityLabel: 'Severidad Alta',
                badgeClass: 'bg-orange-600 text-white'
              };
            }
            if (
              m.includes('foco') ||
              m.includes('pestaña') ||
              m.includes('pestana') ||
              m.includes('ventana') ||
              m.includes('abandono') ||
              m.includes('blur') ||
              m.includes('minimizar')
            ) {
              return {
                typeId: 'CAMBIO_FOCO',
                typeLabel: '👀 Cambio de Foco / Pestaña',
                eventSeverity: 'LEVE',
                severityLabel: 'Severidad Leve / Preventiva',
                badgeClass: 'bg-amber-500 text-slate-950'
              };
            }
            return {
              typeId: 'SUPERVISION_DOCENTE',
              typeLabel: '📋 Supervisión / Convivencia Aula',
              eventSeverity: 'ALTA',
              severityLabel: 'Severidad Alta',
              badgeClass: 'bg-indigo-600 text-white'
            };
          };

          const studentConvivenciaItems = students.map((st) => {
            const rawHistorial = Array.isArray(st.historialLlamadosAtencion)
              ? st.historialLlamadosAtencion.filter(Boolean)
              : [];
            const totalInfracciones = Math.max(
              rawHistorial.length,
              st.llamadosAtencion || 0,
              st.advertenciasCambioFoco || 0
            );
            const isBlocked = Boolean(st.bloqueadoPorTrampa || st.suspendido);
            const maxAllowed = getEffectiveMaxLlamadosAtencion(st, config);

            // Si tiene llamadas de atención registradas en contador pero historial vacío, sintetizar entrada para clasificación
            const effectiveHistorial =
              rawHistorial.length > 0
                ? rawHistorial
                : totalInfracciones > 0
                ? [
                    {
                      id: `SYNTH-${st.id}`,
                      fechaIso: st.fechaUltimoLlamado || '',
                      motivo:
                        st.motivoUltimoLlamado ||
                        st.conceptoInfraccion ||
                        'Advertencia de cambio de foco / pestaña detectada',
                      moduloIntentado: activeCourseMeta.nombreCurso || 'Evaluación',
                      numeroFalta: totalInfracciones
                    }
                  ]
                : [];

            const enrichedHistorial = effectiveHistorial.map((h) => ({
              ...h,
              classification: classifyInfractionMotivo(h.motivo)
            }));

            const typesPresent = new Set<InfractionTypeCategory>(
              enrichedHistorial.map((h) => h.classification.typeId)
            );

            const hasCriticalEvent = enrichedHistorial.some(
              (h) => h.classification.eventSeverity === 'CRITICA'
            );
            const hasHighEvent = enrichedHistorial.some(
              (h) => h.classification.eventSeverity === 'ALTA'
            );

            // Nivel de severidad integral del estudiante
            const studentSeverity: 'CRITICA' | 'ALTA' | 'LEVE' | 'SIN_INFRACCIONES' =
              totalInfracciones === 0 && !isBlocked
                ? 'SIN_INFRACCIONES'
                : isBlocked || totalInfracciones >= maxAllowed || totalInfracciones >= 3 || hasCriticalEvent
                ? 'CRITICA'
                : totalInfracciones === 2 || hasHighEvent
                ? 'ALTA'
                : 'LEVE';

            return {
              student: st,
              historial: enrichedHistorial,
              totalInfracciones,
              isBlocked,
              maxAllowed,
              typesPresent,
              studentSeverity
            };
          });

          const totalInfractionsSum = studentConvivenciaItems.reduce(
            (acc, item) => acc + item.totalInfracciones,
            0
          );
          const studentsWithInfractionsCount = studentConvivenciaItems.filter(
            (i) => i.totalInfracciones > 0
          ).length;
          const blockedStudentsCount = studentConvivenciaItems.filter(
            (i) => i.isBlocked
          ).length;
          const cleanStudentsCount = studentConvivenciaItems.filter(
            (i) => i.totalInfracciones === 0 && !i.isBlocked
          ).length;

          // Contadores por Tipo de Infracción
          const countByType: Record<InfractionTypeCategory, number> = {
            CAMBIO_FOCO: 0,
            DEVTOOLS_INSPECTOR: 0,
            COPIA_PEGADO: 0,
            PANTALLA_DIVIDIDA: 0,
            BIOMETRIA_IA: 0,
            SUPERVISION_DOCENTE: 0
          };
          studentConvivenciaItems.forEach((item) => {
            item.typesPresent.forEach((t) => {
              countByType[t] = (countByType[t] || 0) + 1;
            });
          });

          // Contadores por Nivel de Severidad
          const countBySeverity = {
            CRITICA: studentConvivenciaItems.filter((i) => i.studentSeverity === 'CRITICA').length,
            ALTA: studentConvivenciaItems.filter((i) => i.studentSeverity === 'ALTA').length,
            LEVE: studentConvivenciaItems.filter((i) => i.studentSeverity === 'LEVE').length,
            SIN_INFRACCIONES: studentConvivenciaItems.filter(
              (i) => i.studentSeverity === 'SIN_INFRACCIONES'
            ).length
          };

          const q = convivenciaSearch.trim().toLowerCase();
          const rankedStudents = studentConvivenciaItems
            .filter((item) => {
              if (q) {
                const match =
                  item.student.nombre.toLowerCase().includes(q) ||
                  item.student.id.toLowerCase().includes(q) ||
                  (item.student.motivoUltimoLlamado || '').toLowerCase().includes(q) ||
                  item.historial.some(
                    (h) =>
                      (h.motivo || '').toLowerCase().includes(q) ||
                      (h.moduloIntentado || '').toLowerCase().includes(q) ||
                      h.classification.typeLabel.toLowerCase().includes(q)
                  );
                if (!match) return false;
              }
              if (convivenciaFilter === 'WITH_INFRACTIONS') {
                if (!(item.totalInfracciones > 0 || item.isBlocked)) return false;
              } else if (convivenciaFilter === 'BLOCKED') {
                if (!item.isBlocked) return false;
              } else if (convivenciaFilter === 'CLEAN') {
                if (!(item.totalInfracciones === 0 && !item.isBlocked)) return false;
              }

              // Filtro por Tipo de Infracción
              if (convivenciaTypeFilter !== 'ALL') {
                if (!item.typesPresent.has(convivenciaTypeFilter)) return false;
              }

              // Filtro por Nivel de Severidad
              if (convivenciaSeverityFilter !== 'ALL') {
                if (item.studentSeverity !== convivenciaSeverityFilter) return false;
              }

              return true;
            })
            .sort((a, b) => {
              // Sort by most infractions descending first, then blocked status, then alphabetical
              if (b.totalInfracciones !== a.totalInfracciones) {
                return b.totalInfracciones - a.totalInfracciones;
              }
              if (a.isBlocked && !b.isBlocked) return -1;
              if (!a.isBlocked && b.isBlocked) return 1;
              return a.student.nombre.localeCompare(b.student.nombre, 'es');
            });

          const maxInfractionsObserved = Math.max(
            3,
            ...studentConvivenciaItems.map((i) => i.totalInfracciones)
          );

          const handleClearStudentInfractions = (studentId: string) => {
            let targetName = studentId;
            const nextStudents = students.map((s) => {
              if (s.id !== studentId) return s;
              targetName = s.nombre;
              return {
                ...s,
                llamadosAtencion: 0,
                advertenciasCambioFoco: 0,
                bloqueadoPorTrampa: false,
                suspendido: false,
                motivoUltimoLlamado: '',
                fechaUltimoLlamado: '',
                conceptoInfraccion: '✓ Sin infracciones (Restaurado por docente)',
                historialLlamadosAtencion: []
              };
            });
            onUpdateStudents(nextStudents);
            setConvivenciaNotice(
              `✅ Historial de infracciones limpiado y bloqueo levantado para «${targetName}».`
            );
          };

          const MANUAL_INFRACTION_PRESETS: Record<
            InfractionTypeCategory,
            { label: string; motivoText: string }
          > = {
            CAMBIO_FOCO: {
              label: '👀 Cambio de foco / pestaña',
              motivoText: 'Abandono de ventana / cambio de foco o pestaña detectado durante evaluación'
            },
            DEVTOOLS_INSPECTOR: {
              label: '🛠️ Herramientas de desarrollo (DevTools)',
              motivoText: 'Apertura de herramientas de desarrollo (DevTools / Inspector F12 / Consola)'
            },
            COPIA_PEGADO: {
              label: '📋 Intento de copia / pegado',
              motivoText: 'Intento de copia, pegado o inyección de texto en portapapeles bloqueado'
            },
            PANTALLA_DIVIDIDA: {
              label: '🖥️ Salida de pantalla completa / Split',
              motivoText: 'Salida de modo pantalla completa o redimensionamiento de pantalla dividida'
            },
            BIOMETRIA_IA: {
              label: '🤖 Anomalía biométrica / IA',
              motivoText: 'Anomalía en biometría de tecleo / cadencia sospechosa de asistencia externa IA'
            },
            SUPERVISION_DOCENTE: {
              label: '📋 Supervisión de convivencia en aula',
              motivoText: 'Infracción de convivencia registrada en supervisión docente de aula'
            }
          };

          const handleRegisterManualAttentionCall = (
            studentId: string,
            typeOverride?: InfractionTypeCategory
          ) => {
            const chosenType = typeOverride || manualInfractionTypeDraft || 'CAMBIO_FOCO';
            const preset = MANUAL_INFRACTION_PRESETS[chosenType] || MANUAL_INFRACTION_PRESETS.CAMBIO_FOCO;
            const nowIso = new Date().toISOString();
            let targetName = studentId;
            const nextStudents = students.map((s) => {
              if (s.id !== studentId) return s;
              targetName = s.nombre;
              const prevHist = Array.isArray(s.historialLlamadosAtencion)
                ? s.historialLlamadosAtencion
                : [];
              const nextNum = prevHist.length + 1;
              const newEntry = {
                id: `LLAMADO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                fechaIso: nowIso,
                motivo: preset.motivoText,
                moduloIntentado: activeCourseMeta.nombreCurso || 'Supervisión Aula',
                numeroFalta: nextNum
              };
              const isCriticalFraud =
                chosenType === 'DEVTOOLS_INSPECTOR' ||
                chosenType === 'COPIA_PEGADO' ||
                chosenType === 'BIOMETRIA_IA';
              return {
                ...s,
                llamadosAtencion: nextNum,
                advertenciasCambioFoco: nextNum,
                bloqueadoPorTrampa:
                  s.bloqueadoPorTrampa ||
                  isCriticalFraud ||
                  nextNum >= getEffectiveMaxLlamadosAtencion(s, config),
                motivoUltimoLlamado: newEntry.motivo,
                fechaUltimoLlamado: nowIso,
                historialLlamadosAtencion: [newEntry, ...prevHist]
              };
            });
            onUpdateStudents(nextStudents);
            setConvivenciaNotice(
              `⚠️ Se registró infracción (${preset.label}) en el historial de «${targetName}».`
            );
          };

          return (
            <div className="space-y-5">
              {/* Cabecera de Seguridad y Convivencia */}
              <div className="bg-white border-2 border-rose-200 rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 font-mono text-[11px] font-extrabold uppercase">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                    <span>Auditoría Anti-Trampa · Historial de Llamados de Atención</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                    Seguridad y Convivencia — Estudiantes con Más Infracciones Detectadas
                  </h2>
                  <p className="text-xs text-slate-600">
                    Listado consolidado y ordenado por número de infracciones detectadas por el sistema anti-trampa (cambio de pestaña, pérdida de foco, copia/pegado, pantallas divididas) usando <code>historialLlamadosAtencion</code>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setAntiCheatActionNotice(null);
                      setAntiCheatControlModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Configurar Escudos Anti-Trampa</span>
                  </button>
                </div>
              </div>

              {convivenciaNotice && (
                <div className="p-3 rounded-xl bg-emerald-950 text-white text-xs font-bold flex items-center justify-between">
                  <span>{convivenciaNotice}</span>
                  <button
                    type="button"
                    onClick={() => setConvivenciaNotice(null)}
                    className="text-emerald-200 hover:text-white cursor-pointer ml-3"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 4 Tarjetas KPI de Seguridad y Convivencia */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-rose-700 font-bold">
                    Total Infracciones Detectadas
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">
                    {totalInfractionsSum}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Registros en <code>historialLlamadosAtencion</code>
                  </div>
                </div>

                <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-amber-700 font-bold">
                    Estudiantes con Infracciones
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-amber-600 mt-1">
                    {studentsWithInfractionsCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    De {students.length} estudiantes en nómina
                  </div>
                </div>

                <div className="bg-white border border-red-300 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-red-700 font-bold">
                    Bloqueados / Suspendidos
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-red-600 mt-1">
                    {blockedStudentsCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Por superar el límite anti-trampa
                  </div>
                </div>

                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-2xs">
                  <div className="text-[11px] font-mono uppercase text-emerald-700 font-bold">
                    Conducta Limpia (0 Faltas)
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
                    {cleanStudentsCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Sin alertas de fraude ni foco
                  </div>
                </div>
              </div>

              {/* Ranking y Desglose de Estudiantes con Más Infracciones */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      Ranking de Estudiantes por Número de Infracciones Anti-Trampa ({rankedStudents.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Ordenado automáticamente de mayor a menor cantidad de infracciones registradas en <code>historialLlamadosAtencion</code>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'ALL' as const, label: `Todos (${students.length})` },
                      {
                        id: 'WITH_INFRACTIONS' as const,
                        label: `Con Infracciones (${studentsWithInfractionsCount})`
                      },
                      { id: 'BLOCKED' as const, label: `Bloqueados (${blockedStudentsCount})` },
                      { id: 'CLEAN' as const, label: `Sin Infracciones (${cleanStudentsCount})` }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setConvivenciaFilter(tab.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border transition-colors ${
                          convivenciaFilter === tab.id
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CONTROLES DE FILTRO AVANZADO: POR TIPO DE INFRACCIÓN Y NIVEL DE SEVERIDAD */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs">
                  {/* 1. Filtro por Tipo de Infracción */}
                  <div className="lg:col-span-7 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase font-extrabold text-slate-700">
                        1. Filtrar por Tipo de Infracción (Foco, DevTools, Copia, etc.):
                      </span>
                      {convivenciaTypeFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setConvivenciaTypeFilter('ALL')}
                          className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                        >
                          Limpiar tipo ✕
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        {
                          id: 'ALL' as const,
                          label: 'Todos los tipos',
                          count: studentsWithInfractionsCount
                        },
                        {
                          id: 'CAMBIO_FOCO' as const,
                          label: '👀 Cambio de Foco / Pestaña',
                          count: countByType.CAMBIO_FOCO
                        },
                        {
                          id: 'DEVTOOLS_INSPECTOR' as const,
                          label: '🛠️ Herramientas de Desarrollo (DevTools)',
                          count: countByType.DEVTOOLS_INSPECTOR
                        },
                        {
                          id: 'COPIA_PEGADO' as const,
                          label: '📋 Copia / Pegado / Inyección',
                          count: countByType.COPIA_PEGADO
                        },
                        {
                          id: 'PANTALLA_DIVIDIDA' as const,
                          label: '🖥️ Pantalla Dividida / Fullscreen',
                          count: countByType.PANTALLA_DIVIDIDA
                        },
                        {
                          id: 'BIOMETRIA_IA' as const,
                          label: '🤖 Biometría / Sospecha IA',
                          count: countByType.BIOMETRIA_IA
                        },
                        {
                          id: 'SUPERVISION_DOCENTE' as const,
                          label: '📋 Supervisión / Convivencia',
                          count: countByType.SUPERVISION_DOCENTE
                        }
                      ].map((tBtn) => (
                        <button
                          key={tBtn.id}
                          type="button"
                          onClick={() => setConvivenciaTypeFilter(tBtn.id)}
                          className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer border transition-all flex items-center gap-1.5 ${
                            convivenciaTypeFilter === tBtn.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{tBtn.label}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                              convivenciaTypeFilter === tBtn.id
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {tBtn.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Filtro por Nivel de Severidad */}
                  <div className="lg:col-span-5 space-y-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-2.5 lg:pt-0 lg:pl-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase font-extrabold text-slate-700">
                        2. Filtrar por Nivel de Severidad:
                      </span>
                      {convivenciaSeverityFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setConvivenciaSeverityFilter('ALL')}
                          className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                        >
                          Limpiar severidad ✕
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        {
                          id: 'ALL' as const,
                          label: 'Todos los niveles',
                          count: students.length,
                          activeClass: 'bg-slate-900 text-white border-slate-900'
                        },
                        {
                          id: 'CRITICA' as const,
                          label: '🚨 Crítica (Bloqueo / Fraude)',
                          count: countBySeverity.CRITICA,
                          activeClass: 'bg-red-700 text-white border-red-700'
                        },
                        {
                          id: 'ALTA' as const,
                          label: '⚠️ Alta (Reincidencia)',
                          count: countBySeverity.ALTA,
                          activeClass: 'bg-orange-600 text-white border-orange-600'
                        },
                        {
                          id: 'LEVE' as const,
                          label: '🟡 Leve / Preventiva (1)',
                          count: countBySeverity.LEVE,
                          activeClass: 'bg-amber-500 text-slate-950 border-amber-500'
                        },
                        {
                          id: 'SIN_INFRACCIONES' as const,
                          label: '✅ Sin Infracciones (0)',
                          count: countBySeverity.SIN_INFRACCIONES,
                          activeClass: 'bg-emerald-700 text-white border-emerald-700'
                        }
                      ].map((sBtn) => (
                        <button
                          key={sBtn.id}
                          type="button"
                          onClick={() => setConvivenciaSeverityFilter(sBtn.id)}
                          className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer border transition-all flex items-center gap-1.5 ${
                            convivenciaSeverityFilter === sBtn.id
                              ? `${sBtn.activeClass} shadow-2xs`
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{sBtn.label}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                              convivenciaSeverityFilter === sBtn.id
                                ? 'bg-black/20 text-current'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {sBtn.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Buscador y Selector de Tipo para Registro Manual Rápido */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={convivenciaSearch}
                      onChange={(e) => setConvivenciaSearch(e.target.value)}
                      placeholder="Buscar por estudiante, documento, tipo o motivo de infracción..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-1.5">
                    <span className="font-bold text-amber-950">
                      Tipo al pulsar «+ Registrar Llamado»:
                    </span>
                    <select
                      value={manualInfractionTypeDraft}
                      onChange={(e) => setManualInfractionTypeDraft(e.target.value as any)}
                      className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white font-bold text-slate-900 text-xs"
                    >
                      <option value="CAMBIO_FOCO">👀 Cambio de foco / pestaña (Leve)</option>
                      <option value="DEVTOOLS_INSPECTOR">🛠️ Herramientas de desarrollo / DevTools (Crítica)</option>
                      <option value="COPIA_PEGADO">📋 Intento de copia / pegado (Crítica)</option>
                      <option value="PANTALLA_DIVIDIDA">🖥️ Pantalla dividida / Fullscreen (Alta)</option>
                      <option value="BIOMETRIA_IA">🤖 Biometría / Sospecha IA (Crítica)</option>
                      <option value="SUPERVISION_DOCENTE">📋 Supervisión de convivencia en aula (Alta)</option>
                    </select>
                  </div>
                </div>

                {/* Lista Ordenada de Estudiantes con su Historial de Llamados de Atención */}
                {rankedStudents.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                    No se encontraron estudiantes con la combinación de filtros de tipo y severidad seleccionada.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                    {rankedStudents.map((item, idx) => {
                      const barPct = Math.min(
                        100,
                        Math.round((item.totalInfracciones / maxInfractionsObserved) * 100)
                      );

                      const visibleLogs =
                        convivenciaTypeFilter === 'ALL'
                          ? item.historial
                          : item.historial.filter(
                              (h) => h.classification.typeId === convivenciaTypeFilter
                            );

                      return (
                        <div
                          key={item.student.id}
                          className={`rounded-2xl border-2 p-4 space-y-3 transition-all text-xs ${
                            item.studentSeverity === 'CRITICA'
                              ? 'bg-red-50/70 border-red-300'
                              : item.studentSeverity === 'ALTA'
                              ? 'bg-orange-50/60 border-orange-300'
                              : item.studentSeverity === 'LEVE'
                              ? 'bg-amber-50/50 border-amber-300'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2.5 py-0.5 rounded-lg font-mono font-extrabold text-xs ${
                                    item.totalInfracciones > 0
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  #{idx + 1}
                                </span>
                                <span className="text-sm font-extrabold text-slate-900">
                                  {item.student.nombre}
                                </span>
                                <span className="font-mono text-xs text-slate-500">
                                  (ID: {item.student.id})
                                </span>

                                {/* Etiqueta de Nivel de Severidad */}
                                {item.studentSeverity === 'CRITICA' ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-red-700 text-white font-mono text-[10px] font-extrabold uppercase">
                                    🚨 Severidad Crítica{' '}
                                    {item.isBlocked ? '· Bloqueado / Suspendido' : `(${item.totalInfracciones})`}
                                  </span>
                                ) : item.studentSeverity === 'ALTA' ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-orange-600 text-white font-mono text-[10px] font-extrabold uppercase">
                                    ⚠️ Severidad Alta ({item.totalInfracciones} infracciones)
                                  </span>
                                ) : item.studentSeverity === 'LEVE' ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono text-[10px] font-extrabold uppercase">
                                    🟡 Severidad Leve ({item.totalInfracciones} advertencia)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold">
                                    ✅ Sin Infracciones (0)
                                  </span>
                                )}
                              </div>

                              {/* Etiquetas de Tipos de Infracción detectados en el estudiante */}
                              {item.typesPresent.size > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-slate-500 font-bold">
                                    Tipos detectados:
                                  </span>
                                  {Array.from(item.typesPresent).map((tId) => (
                                    <span
                                      key={tId}
                                      className="px-2 py-0.5 rounded-md bg-white border border-slate-300 font-mono text-[10px] font-bold text-slate-800"
                                    >
                                      {MANUAL_INFRACTION_PRESETS[tId]?.label || tId}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Barra gráfica de severidad de infracciones */}
                              <div className="flex items-center gap-3 pt-0.5 max-w-xl">
                                <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      item.studentSeverity === 'CRITICA'
                                        ? 'bg-red-600'
                                        : item.studentSeverity === 'ALTA'
                                        ? 'bg-orange-500'
                                        : item.studentSeverity === 'LEVE'
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{
                                      width: `${
                                        item.totalInfracciones > 0 ? Math.max(12, barPct) : 0
                                      }%`
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] font-bold text-slate-700 shrink-0">
                                  {item.totalInfracciones} falta(s) · Límite permitido:{' '}
                                  {item.maxAllowed}
                                </span>
                              </div>
                            </div>

                            {/* Acciones de Seguridad y Convivencia por Estudiante */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleRegisterManualAttentionCall(item.student.id)}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                                title="Registrar un llamado de atención del tipo seleccionado en el historial del estudiante"
                              >
                                + Registrar Llamado
                              </button>
                              {(item.totalInfracciones > 0 || item.isBlocked) && (
                                <button
                                  type="button"
                                  onClick={() => handleClearStudentInfractions(item.student.id)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                                >
                                  🔓 Limpiar Infracciones y Desbloquear
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setAuditModalStudentId(item.student.id);
                                  setAuditActiveMode('examenes');
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
                              >
                                🔍 Auditoría
                              </button>
                            </div>
                          </div>

                          {/* Desglose de historialLlamadosAtencion con etiquetas de Tipo y Severidad */}
                          {visibleLogs.length > 0 ? (
                            <div className="bg-white/90 border border-slate-200 rounded-xl p-3 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] font-mono uppercase font-extrabold text-rose-800">
                                <span>
                                  Registro Detallado en historialLlamadosAtencion ({visibleLogs.length}{' '}
                                  evento(s) mostrados):
                                </span>
                                {convivenciaTypeFilter !== 'ALL' && (
                                  <span>
                                    Filtro activo: {MANUAL_INFRACTION_PRESETS[convivenciaTypeFilter]?.label}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                                {visibleLogs.map((log, lIdx) => (
                                  <div
                                    key={log.id || `${item.student.id}-log-${lIdx}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50/60 border border-rose-200/80 text-[11px]"
                                  >
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono font-bold text-[10px]">
                                        Falta #{log.numeroFalta || lIdx + 1}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold ${log.classification.badgeClass}`}
                                      >
                                        {log.classification.typeLabel} · {log.classification.severityLabel}
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        {log.motivo || 'Infracción detectada por escudo anti-trampa'}
                                      </span>
                                    </div>
                                    <div className="font-mono text-[10px] text-slate-600 shrink-0">
                                      {log.moduloIntentado ? `[${log.moduloIntentado}] · ` : ''}
                                      {log.fechaIso
                                        ? new Date(log.fechaIso).toLocaleString('es-CO')
                                        : 'Registrado'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : item.totalInfracciones > 0 ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-950 font-mono">
                              Último motivo registrado:{' '}
                              <strong>
                                {item.student.motivoUltimoLlamado ||
                                  item.student.conceptoInfraccion ||
                                  'Advertencia de cambio de foco / pestaña'}
                              </strong>{' '}
                              {item.student.fechaUltimoLlamado
                                ? `(${new Date(item.student.fechaUltimoLlamado).toLocaleString('es-CO')})`
                                : ''}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
            </div>
          </div>
        </div>

        {/* 3.ª COLUMNA DERECHA DE ESCRITORIO: INSPECTOR DE ANALÍTICA, CALIFICACIÓN RÁPIDA Y TELEMETRÍA EN VIVO (MODO DESKTOP 3 COLUMNAS) */}
        {rightInspectorOpenDesktop && (
          <aside
            aria-label="Inspector lateral derecho de analítica y calificación rápida"
            className="hidden 2xl:flex 2xl:w-80 shrink-0 border-l border-slate-200 bg-white flex-col justify-between p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-4rem)] sticky top-16"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <div className="text-[10px] font-mono uppercase font-extrabold text-[#25579e]">
                    Inspector 3.ª Columna
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Consola en Vivo & Calificación
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRightInspectorOpenDesktop(false)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                  title="Ocultar 3.ª columna"
                >
                  ✕
                </button>
              </div>

              {/* Estado Operativo de Aula */}
              <div className="rounded-xl bg-slate-900 text-white p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase text-sky-300 font-bold">
                    Estado del Salón
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                    PIN: {config.pinAulaDia || 'AULA26'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <div className="text-[10px] text-slate-400">Promedio Grupo</div>
                    <div className="text-base font-extrabold font-mono text-white">
                      {classroomCentralMetrics.groupClassAvg.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800">
                    <div className="text-[10px] text-slate-400">Asistencia</div>
                    <div className="text-base font-extrabold font-mono text-emerald-400">
                      {classroomCentralMetrics.avgAttendancePct}%
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTeacherBottomSheet('asistencia_rapida')}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs cursor-pointer transition-all"
                >
                  ✋ Iniciar / Pasar Asistencia
                </button>
              </div>

              {/* Cola Rápida de Trabajos por Calificar */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-900">
                    📝 Trabajos Pendientes
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 font-mono text-[10px] font-extrabold">
                    {classroomCentralMetrics.pendingWorksCount}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Califique entregas pendientes en 1 clic sin salir de su vista actual.
                </p>
                <button
                  type="button"
                  onClick={() => setTeacherBottomSheet('calificar_tareas')}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#25579e] hover:bg-[#1e4682] text-white font-bold text-xs cursor-pointer"
                >
                  Abrir Calificador Rápido ({classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount})
                </button>
              </div>

              {/* Desbloqueos Anti-Trampa y Riesgo Integral */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-rose-950">
                    🛡️ Bloqueos & Riesgo
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-extrabold">
                    {classroomCentralMetrics.suspendedCount} bloq. · {classroomCentralMetrics.integralRiskStudents.length} riesgo
                  </span>
                </div>
                {students.filter((s) => s.suspendido).slice(0, 3).map((st) => (
                  <div
                    key={st.id}
                    className="p-2 rounded-lg bg-white border border-rose-200 flex items-center justify-between gap-2"
                  >
                    <span className="font-bold text-slate-900 truncate text-[11px]">
                      {st.nombre}
                    </span>
                    <button
                      type="button"
                      onClick={() => executeManualAntiCheatUnlock(st.id)}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shrink-0 cursor-pointer"
                    >
                      🔓 Desbloquear
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTeacherBottomSheet('alertas_desbloqueo')}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-900 font-bold text-xs cursor-pointer"
                >
                  Gestionar Alertas y Turnos →
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500 font-mono flex items-center justify-between">
              <span>Dispositivos aula: {liveSessions.length}</span>
              <button
                type="button"
                onClick={() => setProjectorModeOpen(true)}
                className="text-indigo-700 font-bold hover:underline cursor-pointer"
              >
                Modo Proyector ↗
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ================= HOJAS DESLIZABLES INFERIORES (BOTTOM SHEETS ESTILO ANDROID / WEB OS TÁCTIL PARA DOCENTE) ================= */}
      {teacherBottomSheet !== 'none' && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTeacherBottomSheet('none');
          }}
        >
          <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-200 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Manija Táctil Superior (Drag Handle) */}
            <div className="pt-3 pb-2 px-5 border-b border-slate-100 flex flex-col gap-2 bg-slate-50/70">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto" />
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold text-[#25579e]">
                    Hoja Deslizable Táctil (Bottom Sheet · Web OS)
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {teacherBottomSheet === 'asistencia_rapida' &&
                      '✋ Consola Rápida para Pasar Asistencia'}
                    {teacherBottomSheet === 'calificar_tareas' &&
                      '📝 Calificación Rápida de Tareas y Excusas'}
                    {teacherBottomSheet === 'alertas_desbloqueo' &&
                      '🔔 Alertas Grupales, PIN y Desbloqueo de Turnos'}
                    {teacherBottomSheet === 'menu_apps' &&
                      '📱 Cajón de Aplicaciones del Panel Docente'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTeacherBottomSheet('none')}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-800 font-extrabold text-xs flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>
              {quickTouchFeedbackNotice && (
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs font-bold">
                  {quickTouchFeedbackNotice}
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* SHEET 1: PASAR ASISTENCIA RÁPIDA */}
              {teacherBottomSheet === 'asistencia_rapida' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Clase (Sesión):</label>
                      <select
                        value={quickRollCallClassId}
                        onChange={(e) =>
                          setQuickRollCallClassId(Number(e.target.value) as ClassSessionId)
                        }
                        className="w-full min-h-[48px] px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                      >
                        {(effectiveAcademicDataset.classSessions || []).map((cs) => (
                          <option key={cs.id} value={cs.id}>
                            {cs.code} · {cs.shortTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Bloque:</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['B1', 'B2'] as const).map((blk) => (
                          <button
                            key={blk}
                            type="button"
                            onClick={() => setQuickRollCallBlock(blk)}
                            className={`min-h-[48px] rounded-xl font-extrabold cursor-pointer ${
                              quickRollCallBlock === blk
                                ? 'bg-[#25579e] text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {blk === 'B1' ? 'Bloque A' : 'Bloque B'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tiempo Activo:</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[5, 15, 30].map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => setQuickRollCallMinutes(min)}
                            className={`min-h-[48px] rounded-xl font-mono font-extrabold cursor-pointer ${
                              quickRollCallMinutes === min
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {min}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const expiresMs = Date.now() + quickRollCallMinutes * 60 * 1000;
                        const nextRecords = effectiveAcademicDataset.records.map((rec) => {
                          const prevClass = rec.clases[quickRollCallClassId];
                          if (!prevClass) return rec;
                          return {
                            ...rec,
                            clases: {
                              ...rec.clases,
                              [quickRollCallClassId]: {
                                ...prevClass,
                                claseAbierta: true,
                                llamadoVirtualActivo: true,
                                llamadoVirtualExpiraMs: expiresMs,
                                metodoLlamadoActivo: 'panel_estudiante' as const
                              }
                            }
                          };
                        });
                        onUpdateAcademicDataset?.({
                          ...effectiveAcademicDataset,
                          records: nextRecords,
                          updatedAtIso: new Date().toISOString()
                        });
                        setQuickTouchFeedbackNotice(
                          `✓ Llamado de asistencia iniciado en Clase C${quickRollCallClassId} (${quickRollCallMinutes} min activos).`
                        );
                        setTimeout(() => setQuickTouchFeedbackNotice(null), 4000);
                      }}
                      className="min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-xs cursor-pointer shadow-sm"
                    >
                      🚀 Iniciar Llamado en Vivo ({quickRollCallMinutes} min)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const nextRecords = effectiveAcademicDataset.records.map((rec) => {
                          const prevClass = rec.clases[quickRollCallClassId];
                          if (!prevClass) return rec;
                          return {
                            ...rec,
                            clases: {
                              ...rec.clases,
                              [quickRollCallClassId]: {
                                ...prevClass,
                                [quickRollCallBlock === 'B1'
                                  ? 'asistenciaB1Estado'
                                  : 'asistenciaB2Estado']: 'presente_manual',
                                [quickRollCallBlock === 'B1' ? 'asistenciaB1' : 'asistenciaB2']: 5.0
                              }
                            }
                          };
                        });
                        onUpdateAcademicDataset?.({
                          ...effectiveAcademicDataset,
                          records: nextRecords,
                          updatedAtIso: new Date().toISOString()
                        });
                        setQuickTouchFeedbackNotice(
                          `✓ Todos los estudiantes marcados PRESENTES en Clase C${quickRollCallClassId} (${
                            quickRollCallBlock === 'B1' ? 'Bloque A' : 'Bloque B'
                          }).`
                        );
                        setTimeout(() => setQuickTouchFeedbackNotice(null), 4000);
                      }}
                      className="min-h-[48px] px-4 py-3 rounded-2xl bg-[#25579e] hover:bg-[#1e4682] active:scale-[0.98] text-white font-extrabold text-xs cursor-pointer shadow-sm"
                    >
                      ✓ Marcar Todos Presentes ({quickRollCallBlock === 'B1' ? 'Bloque A' : 'Bloque B'})
                    </button>
                  </div>

                  {/* Lista Táctil de Estudiantes para Alternar Presente / Ausente con el Pulgar */}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {effectiveAcademicDataset.records.map((rec) => {
                      const c = rec.clases[quickRollCallClassId];
                      if (!c) return null;
                      const currentState =
                        quickRollCallBlock === 'B1' ? c.asistenciaB1Estado : c.asistenciaB2Estado;
                      const isPresent =
                        currentState === 'presente_manual' ||
                        currentState === 'presente_virtual' ||
                        currentState === 'excusa_aprobada';
                      return (
                        <div
                          key={rec.studentId}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{rec.nombre}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              ID: {rec.documento}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const nextState = isPresent ? 'ausente' : 'presente_manual';
                              const nextScore = isPresent ? 0.0 : 5.0;
                              const nextRecords = effectiveAcademicDataset.records.map((r) => {
                                if (r.studentId !== rec.studentId) return r;
                                const cl = r.clases[quickRollCallClassId];
                                return {
                                  ...r,
                                  clases: {
                                    ...r.clases,
                                    [quickRollCallClassId]: {
                                      ...cl,
                                      [quickRollCallBlock === 'B1'
                                        ? 'asistenciaB1Estado'
                                        : 'asistenciaB2Estado']: nextState,
                                      [quickRollCallBlock === 'B1'
                                        ? 'asistenciaB1'
                                        : 'asistenciaB2']: nextScore
                                    }
                                  }
                                };
                              });
                              onUpdateAcademicDataset?.({
                                ...effectiveAcademicDataset,
                                records: nextRecords,
                                updatedAtIso: new Date().toISOString()
                              });
                            }}
                            className={`min-h-[48px] px-4 rounded-xl font-extrabold text-xs cursor-pointer transition-all active:scale-[0.97] shrink-0 ${
                              isPresent
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            {isPresent ? '✓ PRESENTE' : '✕ AUSENTE'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SHEET 2: CALIFICAR TAREAS Y EXCUSAS EN HOJA INFERIOR */}
              {teacherBottomSheet === 'calificar_tareas' && (
                <div className="space-y-4">
                  {(() => {
                    const pendingWorkItems: {
                      studentId: string;
                      nombre: string;
                      classId: ClassSessionId;
                      url: string;
                      comentario: string;
                    }[] = [];
                    const pendingExcuseItems: {
                      studentId: string;
                      nombre: string;
                      classId: ClassSessionId;
                      bloque: 'A' | 'B' | 'AMBOS';
                      motivo: string;
                      soporteUrl?: string;
                    }[] = [];

                    effectiveAcademicDataset.records.forEach((rec) => {
                      (effectiveAcademicDataset.classSessions || []).forEach((cs) => {
                        const cl = rec.clases?.[cs.id];
                        if (!cl) return;
                        if (cl.trabajoEstado === 'pendiente_revision') {
                          pendingWorkItems.push({
                            studentId: rec.studentId,
                            nombre: rec.nombre,
                            classId: cs.id,
                            url: cl.trabajoEntregaUrl || '',
                            comentario: cl.trabajoComentarioEstudiante || ''
                          });
                        }
                        if (cl.asistenciaSolicitudEstado === 'pendiente') {
                          pendingExcuseItems.push({
                            studentId: rec.studentId,
                            nombre: rec.nombre,
                            classId: cs.id,
                            bloque: cl.asistenciaSolicitudBloque || 'AMBOS',
                            motivo: cl.asistenciaSolicitudMotivo || 'Solicitud de excusa',
                            soporteUrl: cl.asistenciaSolicitudSoporteUrl
                          });
                        }
                      });
                    });

                    return (
                      <>
                        <div className="space-y-2">
                          <div className="font-mono text-[11px] font-extrabold uppercase text-sky-900">
                            📝 Trabajos Prácticos Pendientes por Calificar ({pendingWorkItems.length})
                          </div>
                          {pendingWorkItems.length === 0 ? (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                              ✓ Todos los trabajos prácticos entregados están al día y calificados.
                            </div>
                          ) : (
                            pendingWorkItems.map((item) => (
                              <div
                                key={`${item.studentId}-C${item.classId}`}
                                className="p-3.5 rounded-2xl border border-sky-200 bg-sky-50/40 space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-extrabold text-slate-900">
                                      {item.nombre} · Clase C{item.classId}
                                    </div>
                                    {item.comentario && (
                                      <p className="text-[11px] text-slate-600 mt-0.5">
                                        “{item.comentario}”
                                      </p>
                                    )}
                                  </div>
                                  {item.url && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-800 font-bold text-[11px] shrink-0"
                                    >
                                      Abrir Entrega ↗
                                    </a>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-slate-600 mr-1">
                                    Calificar en 1 toque:
                                  </span>
                                  {[3.0, 3.5, 4.0, 4.5, 5.0].map((gradeVal) => (
                                    <button
                                      key={gradeVal}
                                      type="button"
                                      onClick={() => {
                                        const nextRecords = effectiveAcademicDataset.records.map(
                                          (r) => {
                                            if (r.studentId !== item.studentId) return r;
                                            const cl = r.clases[item.classId];
                                            return {
                                              ...r,
                                              clases: {
                                                ...r.clases,
                                                [item.classId]: {
                                                  ...cl,
                                                  notaTrabajoPractico: gradeVal,
                                                  trabajoEstado: 'calificado' as const,
                                                  trabajoCalificadoEnIso: new Date().toISOString()
                                                }
                                              }
                                            };
                                          }
                                        );
                                        onUpdateAcademicDataset?.({
                                          ...effectiveAcademicDataset,
                                          records: nextRecords,
                                          updatedAtIso: new Date().toISOString()
                                        });
                                        setQuickTouchFeedbackNotice(
                                          `✓ Trabajo de ${item.nombre} (C${item.classId}) calificado con ${gradeVal.toFixed(1)}`
                                        );
                                        setTimeout(() => setQuickTouchFeedbackNotice(null), 3500);
                                      }}
                                      className="min-h-[48px] min-w-[52px] px-3 rounded-xl bg-[#25579e] hover:bg-emerald-600 active:scale-[0.97] text-white font-mono font-extrabold text-xs cursor-pointer transition-all"
                                    >
                                      {gradeVal.toFixed(1)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200">
                          <div className="font-mono text-[11px] font-extrabold uppercase text-indigo-900">
                            📋 Solicitudes de Justificación de Inasistencia ({pendingExcuseItems.length})
                          </div>
                          {pendingExcuseItems.length === 0 ? (
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
                              No hay solicitudes de excusa médica/laboral pendientes por revisar.
                            </div>
                          ) : (
                            pendingExcuseItems.map((exc) => (
                              <div
                                key={`${exc.studentId}-exc-C${exc.classId}`}
                                className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2"
                              >
                                <div className="font-extrabold text-slate-900">
                                  {exc.nombre} · Clase C{exc.classId} (Bloque {exc.bloque})
                                </div>
                                <p className="text-[11px] text-slate-700">{exc.motivo}</p>
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRecords = effectiveAcademicDataset.records.map(
                                        (r) => {
                                          if (r.studentId !== exc.studentId) return r;
                                          const cl = r.clases[exc.classId];
                                          return {
                                            ...r,
                                            clases: {
                                              ...r.clases,
                                              [exc.classId]: {
                                                ...cl,
                                                asistenciaSolicitudEstado: 'aprobada' as const,
                                                asistenciaB1Estado:
                                                  exc.bloque === 'A' || exc.bloque === 'AMBOS'
                                                    ? 'excusa_aprobada'
                                                    : cl.asistenciaB1Estado,
                                                asistenciaB1:
                                                  exc.bloque === 'A' || exc.bloque === 'AMBOS'
                                                    ? 5.0
                                                    : cl.asistenciaB1,
                                                asistenciaB2Estado:
                                                  exc.bloque === 'B' || exc.bloque === 'AMBOS'
                                                    ? 'excusa_aprobada'
                                                    : cl.asistenciaB2Estado,
                                                asistenciaB2:
                                                  exc.bloque === 'B' || exc.bloque === 'AMBOS'
                                                    ? 5.0
                                                    : cl.asistenciaB2
                                              }
                                            }
                                          };
                                        }
                                      );
                                      onUpdateAcademicDataset?.({
                                        ...effectiveAcademicDataset,
                                        records: nextRecords,
                                        updatedAtIso: new Date().toISOString()
                                      });
                                      setQuickTouchFeedbackNotice(
                                        `✓ Excusa aprobada para ${exc.nombre} en Clase C${exc.classId}`
                                      );
                                      setTimeout(() => setQuickTouchFeedbackNotice(null), 3500);
                                    }}
                                    className="min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer"
                                  >
                                    ✓ Aprobar Excusa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextRecords = effectiveAcademicDataset.records.map(
                                        (r) => {
                                          if (r.studentId !== exc.studentId) return r;
                                          const cl = r.clases[exc.classId];
                                          return {
                                            ...r,
                                            clases: {
                                              ...r.clases,
                                              [exc.classId]: {
                                                ...cl,
                                                asistenciaSolicitudEstado: 'rechazada' as const
                                              }
                                            }
                                          };
                                        }
                                      );
                                      onUpdateAcademicDataset?.({
                                        ...effectiveAcademicDataset,
                                        records: nextRecords,
                                        updatedAtIso: new Date().toISOString()
                                      });
                                    }}
                                    className="min-h-[48px] rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs cursor-pointer"
                                  >
                                    ✕ Rechazar
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* SHEET 3: ALERTAS GRUPALES, PIN Y DESBLOQUEO DE TURNOS */}
              {teacherBottomSheet === 'alertas_desbloqueo' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="font-extrabold text-slate-900">
                      📢 Mensaje / Alerta Grupal en Sala de Espera y Portal Estudiantil
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={mensajeSalaDraft}
                        onChange={(e) => setMensajeSalaDraft(e.target.value)}
                        placeholder="Escriba aviso grupal para todos los estudiantes..."
                        className="flex-1 min-h-[48px] px-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveMensajeSala();
                          setQuickTouchFeedbackNotice(
                            '✓ Alerta grupal publicada en el Portal del Estudiante.'
                          );
                          setTimeout(() => setQuickTouchFeedbackNotice(null), 3500);
                        }}
                        className="min-h-[48px] px-4 rounded-xl bg-[#25579e] hover:bg-[#1e4682] text-white font-extrabold cursor-pointer shrink-0"
                      >
                        Enviar Aviso
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleMasterOpenAllStudents}
                      className={`min-h-[48px] rounded-xl font-extrabold cursor-pointer ${
                        masterClosedCount === 0
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                      }`}
                    >
                      ● Abrir Exámenes (Todos)
                    </button>
                    <button
                      type="button"
                      onClick={handleMasterCloseAllStudents}
                      className={`min-h-[48px] rounded-xl font-extrabold cursor-pointer ${
                        masterOpenCount === 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 border border-rose-300 text-rose-900'
                      }`}
                    >
                      ■ Cerrar Exámenes (Todos)
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="font-extrabold text-slate-900">
                      🔓 Estudiantes con Turno Bloqueado por Escudo Anti-Trampa (
                      {students.filter((s) => s.suspendido).length})
                    </div>
                    {students.filter((s) => s.suspendido).length === 0 ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                        ✓ Ningún estudiante se encuentra bloqueado en este momento.
                      </div>
                    ) : (
                      students
                        .filter((s) => s.suspendido)
                        .map((st) => (
                          <div
                            key={st.id}
                            className="p-3 rounded-xl border border-amber-300 bg-amber-50/70 flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-extrabold text-slate-900">{st.nombre}</div>
                              <div className="text-[11px] text-amber-900">
                                {st.conceptoInfraccion || 'Cambio de ventana detectado'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => executeManualAntiCheatUnlock(st.id)}
                              className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer shrink-0"
                            >
                              🔓 Desbloquear
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* SHEET 4: CAJÓN DE APLICACIONES DEL PANEL DOCENTE (APP DRAWER) */}
              {teacherBottomSheet === 'menu_apps' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {allLmsModules.map((mod) => {
                    const ModIcon = mod.icon;
                    const isSelected = activeTab === mod.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(mod.id);
                          setTeacherBottomSheet('none');
                        }}
                        className={`min-h-[76px] p-3 rounded-2xl border text-left flex flex-col justify-between gap-1.5 cursor-pointer transition-all active:scale-[0.98] ${
                          isSelected
                            ? 'bg-[#25579e] text-white border-[#25579e]'
                            : 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <ModIcon
                            className={`w-5 h-5 ${isSelected ? 'text-sky-200' : 'text-[#25579e]'}`}
                          />
                          <span className="font-mono text-[10px] opacity-75">{mod.badge}</span>
                        </div>
                        <div className="font-extrabold text-xs leading-tight">{mod.shortLabel}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= DOCK INFERIOR PERSISTENTE MÓVIL / TABLET (ESTILO ANDROID / WEB OS CON HOJAS INFERIORES >= 48PX) ================= */}
      <nav
        aria-label="Dock inferior táctil del Panel Docente"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg"
      >
        <div className="grid grid-cols-5 gap-1 max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => {
              setTeacherBottomSheet('none');
              setActiveTab('panel_central');
            }}
            className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-all active:scale-[0.96] cursor-pointer ${
              activeTab === 'panel_central' && teacherBottomSheet === 'none'
                ? 'bg-[#25579e] text-white font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 font-semibold'
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-none truncate">Escritorio</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setTeacherBottomSheet((prev) =>
                prev === 'asistencia_rapida' ? 'none' : 'asistencia_rapida'
              )
            }
            className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-all active:scale-[0.96] cursor-pointer ${
              teacherBottomSheet === 'asistencia_rapida'
                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 font-semibold'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-none truncate">Asistencia</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setTeacherBottomSheet((prev) =>
                prev === 'calificar_tareas' ? 'none' : 'calificar_tareas'
              )
            }
            className={`relative min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-all active:scale-[0.96] cursor-pointer ${
              teacherBottomSheet === 'calificar_tareas'
                ? 'bg-[#25579e] text-white font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 font-semibold'
            }`}
          >
            <GraduationCap className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-none truncate">Calificar</span>
            {classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount > 0 && (
              <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono text-[9px] font-extrabold">
                {classroomCentralMetrics.pendingWorksCount + classroomCentralMetrics.pendingExcusesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setTeacherBottomSheet((prev) =>
                prev === 'alertas_desbloqueo' ? 'none' : 'alertas_desbloqueo'
              )
            }
            className={`relative min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-all active:scale-[0.96] cursor-pointer ${
              teacherBottomSheet === 'alertas_desbloqueo'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 font-semibold'
            }`}
          >
            <Unlock className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-none truncate">Alertas/PIN</span>
            {classroomCentralMetrics.suspendedCount > 0 && (
              <span className="absolute top-1 right-2 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-mono text-[9px] font-extrabold">
                {classroomCentralMetrics.suspendedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setTeacherBottomSheet((prev) => (prev === 'menu_apps' ? 'none' : 'menu_apps'))
            }
            className={`min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 px-1 transition-all active:scale-[0.96] cursor-pointer ${
              teacherBottomSheet === 'menu_apps'
                ? 'bg-slate-900 text-white font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 font-semibold'
            }`}
          >
            <LayoutGrid className="w-5 h-5 shrink-0" />
            <span className="text-[10px] leading-none truncate">Módulos</span>
          </button>
        </div>
      </nav>

      {/* ================= MODAL: EDITAR CÓDIGO DE ACCESO (PARA TODOS O SOLO LOS SELECCIONADOS) ================= */}
      {batchAccessCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md mb-1">
                  <Key className="w-3.5 h-3.5" />
                  <span>Gestión de Credenciales · Nómina Oficial de Estudiantes</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Editar Código de Acceso (Para Todos los Estudiantes o Solo los Seleccionados)
                </h3>
                <p className="text-xs text-slate-600">
                  Modifique el código de acceso de forma masiva para toda la nómina o únicamente para los estudiantes seleccionados, con sincronización inmediata en el servidor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBatchAccessCodeModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
              >
                Cerrar ✕
              </button>
            </div>

            <form onSubmit={handleApplyAndSaveBatchAccessCodes} className="space-y-4 text-xs">
              {/* 1. SELECCIÓN DE ALCANCE: TODOS vs SELECCIONADOS */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                  1. Seleccione a qué estudiantes desea editar el Código de Acceso:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBatchCodeScope('all')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      batchCodeScope === 'all'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">
                      ● Todos los Estudiantes de la Nómina ({students.length})
                    </div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      Actualiza el Código de Acceso de los {students.length} estudiantes registrados.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchCodeScope('selected')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      batchCodeScope === 'selected'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">
                      ☑ Solo los Estudiantes Seleccionados ({selectedStudentIdsForBatch.length})
                    </div>
                    <div className="text-[11px] opacity-90 mt-0.5">
                      Actualiza únicamente los alumnos marcados con casilla de selección.
                    </div>
                  </button>
                </div>

                {batchCodeScope === 'selected' && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-700">
                        Marque o desmarque estudiantes aquí ({selectedStudentIdsForBatch.length} seleccionados):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={batchCodeStudentSearch}
                          onChange={(e) => setBatchCodeStudentSearch(e.target.value)}
                          placeholder="Filtrar estudiante..."
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStudentIdsForBatch(students.map((s) => s.id))
                          }
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentIdsForBatch([])}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                        >
                          Ninguno
                        </button>
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
                      {students
                        .filter((s) => {
                          const q = batchCodeStudentSearch.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            s.nombre.toLowerCase().includes(q) ||
                            s.id.toLowerCase().includes(q) ||
                            s.codigoAcceso.toLowerCase().includes(q)
                          );
                        })
                        .map((s) => {
                          const isChecked = selectedStudentIdsForBatch.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-[11px] ${
                                isChecked
                                  ? 'bg-indigo-50 border-indigo-300 font-bold text-indigo-950'
                                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentIdsForBatch((prev) => [...prev, s.id]);
                                  } else {
                                    setSelectedStudentIdsForBatch((prev) =>
                                      prev.filter((id) => id !== s.id)
                                    );
                                  }
                                }}
                                className="rounded border-slate-300"
                              />
                              <span className="truncate">
                                {s.nombre} ({s.id})
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. ESTRATEGIA DE EDICIÓN DEL CÓDIGO DE ACCESO */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                  2. ¿Cómo desea definir el nuevo Código de Acceso?
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'unified',
                      title: 'Código Único / Unificado',
                      desc: 'Asigna el mismo código (ej. MAPEO2026) a los seleccionados o todos'
                    },
                    {
                      id: 'prefix_doc4',
                      title: 'Prefijo + 4 Dígitos ID',
                      desc: 'Ej. MM26 + últimos 4 dígitos del documento de cada alumno'
                    },
                    {
                      id: 'prefix_seq',
                      title: 'Prefijo + Consecutivo',
                      desc: 'Ej. AULA2601, AULA2602, AULA2603...'
                    },
                    {
                      id: 'deterministic',
                      title: 'Regenerar Oficial (12 Car.)',
                      desc: 'Restaura el código determinístico MM26 + ID + hash'
                    },
                    {
                      id: 'custom_table',
                      title: 'Edición Manual uno por uno',
                      desc: 'Editar libremente en la tabla inferior cada código'
                    }
                  ].map((strat) => (
                    <button
                      key={strat.id}
                      type="button"
                      onClick={() => setBatchCodeStrategy(strat.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        batchCodeStrategy === strat.id
                          ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">{strat.title}</div>
                      <div className="text-[10px] opacity-85 mt-0.5">{strat.desc}</div>
                    </button>
                  ))}
                </div>

                {(batchCodeStrategy === 'unified' ||
                  batchCodeStrategy === 'prefix_doc4' ||
                  batchCodeStrategy === 'prefix_seq') && (
                  <div className="pt-2 space-y-1">
                    <label className="block font-bold text-slate-800">
                      {batchCodeStrategy === 'unified'
                        ? 'Escriba el nuevo Código de Acceso unificado (4 a 24 caracteres):'
                        : 'Escriba el Prefijo Base para generar los códigos:'}
                    </label>
                    <input
                      type="text"
                      maxLength={24}
                      value={batchCodeBaseInput}
                      onChange={(e) => setBatchCodeBaseInput(e.target.value.toUpperCase())}
                      placeholder="Ej. MM26DORADA"
                      className="w-full px-3.5 py-2 rounded-xl border border-sky-400 bg-white font-mono font-bold text-sm uppercase text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                )}
              </div>

              {/* 3. VISTA PREVIA Y EDICIÓN DIRECTA DE LOS CÓDIGOS A GUARDAR */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Vista Previa de Códigos de Acceso a Guardar (
                    {batchCodeScope === 'selected'
                      ? `${selectedStudentIdsForBatch.length} seleccionados`
                      : `${students.length} estudiantes`}
                    )
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    4 a 24 caracteres alfanuméricos
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-200">
                  {(batchCodeScope === 'selected'
                    ? students.filter((s) => selectedStudentIdsForBatch.includes(s.id))
                    : students
                  ).map((st, idx) => {
                    const previewCode = computePreviewBatchCodeForStudent(st, idx);
                    return (
                      <div
                        key={st.id}
                        className="px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{st.nombre}</span>
                          <span className="ml-2 font-mono text-[11px] text-slate-500">
                            ID: {st.id} · Actual: {st.codigoAcceso}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">Nuevo:</span>
                          <input
                            type="text"
                            maxLength={24}
                            value={previewCode}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setBatchCodeStrategy('custom_table');
                              setBatchCodeCustomDrafts((prev) => ({
                                ...prev,
                                [st.id]: val
                              }));
                            }}
                            className="w-40 px-2.5 py-1 rounded-lg border border-sky-300 bg-sky-50/50 font-mono font-bold text-xs uppercase text-sky-900"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {batchCodeFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 font-bold text-emerald-950">
                  {batchCodeFeedback}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setBatchAccessCodeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingBatchCodes}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSavingBatchCodes ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en Servidor...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        Guardar Códigos de Acceso (
                        {batchCodeScope === 'selected'
                          ? `${selectedStudentIdsForBatch.length} Seleccionados`
                          : `Todos: ${students.length}`}
                        )
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT STUDENT ================= */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {editingOriginalId ? 'Editar Datos del Estudiante' : 'Registrar Nuevo Estudiante'}
            </h3>

            {studentModalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{studentModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStudentModal} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">
                  ID de Estudiante (Número de Documento)
                </label>
                <input
                  type="text"
                  required
                  value={formStudentId}
                  onChange={(e) => setFormStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={formStudentName}
                  onChange={(e) => setFormStudentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Correo Electrónico <span className="text-[10px] font-normal text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={formStudentEmail}
                    onChange={(e) => setFormStudentEmail(e.target.value)}
                    placeholder="ej. alumno@correo.com"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-800">
                    Número de WhatsApp <span className="text-[10px] font-normal text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={formStudentWhatsapp}
                    onChange={(e) => setFormStudentWhatsapp(e.target.value)}
                    placeholder="ej. 300 123 4567"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                  />
                </div>
                <div className="col-span-full text-[10px] text-slate-500">
                  Nota: El correo electrónico y el número de WhatsApp no son obligatorios al registrar o editar el estudiante.
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-800">
                    Código de Acceso (4 a 24 caracteres)
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormStudentCode(generateDeterministicAccessCode(formStudentId || '1058200000'))}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Generar código automático (12 car.)
                  </button>
                </div>
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={formStudentCode}
                  onChange={(e) => setFormStudentCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase"
                />
              </div>

              {pendingStudentModalChange && (
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Cambios pendientes listos para guardar en el servidor.</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingStudentModal}
                  onClick={() => setStudentModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!pendingStudentModalChange || isSavingStudentModal}
                  className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                    pendingStudentModalChange || isSavingStudentModal
                      ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSavingStudentModal ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: BULK IMPORT STUDENTS (EXCEL .XLSX / .XLS / CSV + CASILLAS POR LOTE) ================= */}
      {bulkStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-xl my-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Agregar Estudiantes por Lote (Casillas Directas, Excel .xlsx / .xls o CSV)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Agregue varios estudiantes en lote usando las casillas inferiores, subiendo su archivo de Excel (<code>.xlsx</code>, <code>.xls</code>) / <code>.csv</code>, o pegando celdas. Solo <strong>Documento / ID</strong> y <strong>Nombre Completo</strong> son obligatorios; las casillas de <strong>Correo Electrónico</strong> y <strong>Número de WhatsApp</strong> son opcionales.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadSampleStudentExcel}
                className="px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Descargar plantilla de ejemplo en formato Excel (.xlsx) con Correo y WhatsApp opcionales"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Plantilla .xlsx</span>
              </button>
            </div>

            {/* Selector de modo: Combinar vs Reemplazar Nómina */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div className="font-bold text-slate-800">Modo de carga en la Nómina Oficial:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkStudentMode('merge')}
                  className={`px-3 py-2 rounded-lg font-semibold border text-left cursor-pointer ${
                    bulkStudentMode === 'merge'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div>+ Agregar / Actualizar Nómina Actual</div>
                  <div className="text-[10px] opacity-90 font-normal">
                    Suma los nuevos alumnos y actualiza los existentes ({students.length} actuales).
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkStudentMode('replace')}
                  className={`px-3 py-2 rounded-lg font-semibold border text-left cursor-pointer ${
                    bulkStudentMode === 'replace'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div>● Reemplazar Toda la Nómina Actual</div>
                  <div className="text-[10px] opacity-90 font-normal">
                    Deja únicamente los estudiantes del lote o archivo cargado.
                  </div>
                </button>
              </div>
            </div>

            {/* Casillas directas para Agregar por Lote (Documento, Nombre, Correo Opcional, WhatsApp Opcional) */}
            <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-sky-950">
                    Opción 1: Casillas Rápidas para Agregar por Lote (Fila por Fila)
                  </div>
                  <div className="text-[11px] text-sky-900">
                    Ingrese varios estudiantes a la vez. <strong>Correo Electrónico</strong> y <strong>Número de WhatsApp</strong> son opcionales (no obligatorios).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBulkDraftRows((prev) => [
                      ...prev,
                      { id: '', nombre: '', correo: '', whatsapp: '', codigoAcceso: '' }
                    ])
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Añadir Fila al Lote</span>
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {bulkDraftRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white border border-sky-200/80 rounded-lg p-2"
                  >
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        value={row.id}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkDraftRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, id: val } : r))
                          );
                        }}
                        placeholder="ID / Documento *"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        value={row.nombre}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkDraftRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, nombre: val } : r))
                          );
                        }}
                        placeholder="Nombre Completo *"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="email"
                        value={row.correo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkDraftRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, correo: val } : r))
                          );
                        }}
                        placeholder="Correo (Opcional)"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="tel"
                        value={row.whatsapp}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBulkDraftRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, whatsapp: val } : r))
                          );
                        }}
                        placeholder="WhatsApp (Opc.)"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        disabled={bulkDraftRows.length <= 1}
                        onClick={() =>
                          setBulkDraftRows((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                        title="Quitar fila"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Subida directa de archivo Excel (.xlsx / .xls / .csv) */}
            <div className="bg-emerald-50/80 border-2 border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  <span>Opción 2: Subir Archivo de Excel Directamente (.xlsx, .xls, .csv)</span>
                </div>
                <div className="text-[11px] text-emerald-800">
                  Reconoce columnas de <strong>Documento</strong> y <strong>Nombre</strong> (obligatorias) y también <strong>Correo Electrónico</strong> y <strong>WhatsApp</strong> (opcionales).
                </div>
              </div>
              <label className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-center shadow-xs">
                <Upload className="w-4 h-4" />
                <span>Seleccionar Archivo Excel / CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => handleUploadStudentExcelFile(e, bulkStudentMode)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">
                Opción 3: Copie y pegue celdas desde Excel (Documento, Nombre y opcionalmente Correo y WhatsApp):
              </div>
              <textarea
                rows={4}
                value={bulkStudentText}
                onChange={(e) => setBulkStudentText(e.target.value)}
                placeholder={
                  '1058209901\tJuan Camilo Restrepo\tjcamilo@correo.com\t3101234567\n1058209902\tMaría Fernanda Ríos'
                }
                className="w-full p-3 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>

            {bulkImportStatus && (
              <div
                className={`p-3 rounded-lg border text-xs font-medium ${
                  bulkImportStatus.startsWith('⚠️')
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                {bulkImportStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBulkStudentModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleBulkImportStudents}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
              >
                Guardar e Importar Lote de Estudiantes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: VISUAL QUESTION EDITOR ================= */}
      {qModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl my-8">
            <h3 className="text-lg font-bold text-slate-900">
              {editingQuestionId ? `Modificar Pregunta (${editingQuestionId})` : 'Crear Nueva Pregunta'}
            </h3>

            <form onSubmit={handleSaveQuestion} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold block mb-1">
                    Módulo (1 a {Math.max(1, activeCourseMeta.modulosCurso.length)})
                  </label>
                  <select
                    value={formQMod}
                    onChange={(e) => setFormQMod(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="w-full p-2 rounded border border-slate-300"
                  >
                    {activeCourseMeta.modulosCurso.map((m) => (
                      <option key={m.id} value={m.id}>
                        Módulo {m.id} · {m.shortTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Nivel Cognitivo (Bloom)</label>
                  <select
                    value={formQBloom}
                    onChange={(e) => setFormQBloom(e.target.value as BloomLevel)}
                    className="w-full p-2 rounded border border-slate-300"
                  >
                    {(['Conocer', 'Comprensión', 'Aplicación', 'Análisis', 'Evaluación'] as BloomLevel[]).map(
                      (b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Opción Correcta</label>
                  <select
                    value={formQCorrecta}
                    onChange={(e) => setFormQCorrecta(e.target.value as 'A' | 'B' | 'C' | 'D')}
                    className="w-full p-2 rounded border border-slate-300 font-bold"
                  >
                    {(['A', 'B', 'C', 'D'] as const).map((l) => (
                      <option key={l} value={l}>
                        Opción {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Tema Curricular</label>
                <input
                  type="text"
                  required
                  value={formQTema}
                  onChange={(e) => setFormQTema(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Tipo de Pregunta</label>
                  <input
                    type="text"
                    value={formQTipoPregunta}
                    onChange={(e) => setFormQTipoPregunta(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">RAP (Resultado de Aprendizaje)</label>
                  <input
                    type="text"
                    value={formQRap}
                    onChange={(e) => setFormQRap(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Contexto del Caso</label>
                  <input
                    type="text"
                    value={formQContexto}
                    onChange={(e) => setFormQContexto(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Enunciado de la Pregunta / Caso</label>
                <textarea
                  rows={3}
                  required
                  value={formQEnunciado}
                  onChange={(e) => setFormQEnunciado(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Opción A</label>
                  <input
                    type="text"
                    required
                    value={formQA}
                    onChange={(e) => setFormQA(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Opción B</label>
                  <input
                    type="text"
                    required
                    value={formQB}
                    onChange={(e) => setFormQB(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Opción C</label>
                  <input
                    type="text"
                    required
                    value={formQC}
                    onChange={(e) => setFormQC(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Opción D</label>
                  <input
                    type="text"
                    required
                    value={formQD}
                    onChange={(e) => setFormQD(e.target.value)}
                    className="w-full p-2 rounded border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Justificación Pedagógica</label>
                <textarea
                  rows={2}
                  required
                  value={formQJustificacion}
                  onChange={(e) => setFormQJustificacion(e.target.value)}
                  className="w-full p-2 rounded border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold"
                >
                  Guardar Pregunta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: BULK IMPORT QUESTIONS ================= */}
      {bulkQModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                Actualizar o Agregar Lote Masivo de Preguntas
              </h3>
              <button
                type="button"
                onClick={() => setShowQStructureModal(true)}
                className="px-2.5 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Ver Estructura de Carga
              </button>
            </div>

            {/* Selector de modo: Reemplazar Banco Actual vs Combinar */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div className="font-bold text-slate-800">Modo de actualización del Banco de Preguntas:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBulkQMode('replace')}
                  className={`px-3 py-2 rounded-lg font-semibold border text-left cursor-pointer ${
                    bulkQMode === 'replace'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div>● Actualizar / Reemplazar Banco Actual</div>
                  <div className="text-[10px] opacity-90 font-normal">
                    Sustituye el banco actual ({questions.length} reactivos) por el nuevo archivo.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkQMode('append')}
                  className={`px-3 py-2 rounded-lg font-semibold border text-left cursor-pointer ${
                    bulkQMode === 'append'
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div>+ Agregar / Combinar al Banco</div>
                  <div className="text-[10px] opacity-90 font-normal">
                    Suma las nuevas preguntas a las {questions.length} existentes.
                  </div>
                </button>
              </div>
            </div>

            {/* Subida directa de archivo Excel / JSON / CSV */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold text-emerald-950">
                  Cargar archivo directo (.xlsx / .xls / .json / .csv)
                </div>
                <div className="text-[11px] text-emerald-800">
                  Compatible con libros de Excel (<code>.xlsx</code>, <code>.xls</code>), <code>.csv</code> y <code>BANCO_PREGUNTAS_UNIFICADO_2026 ACT.json</code>
                </div>
              </div>
              <label className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-center">
                <Upload className="w-3.5 h-3.5" />
                <span>Seleccionar Archivo Excel / JSON / CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.ods,.json,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json,text/csv"
                  onChange={(e) => handleUploadQuestionFile(e, bulkQMode)}
                  className="hidden"
                />
              </label>
            </div>

            <p className="text-xs text-slate-600">
              O pegue aquí el contenido del arreglo JSON o líneas CSV separadas por punto y coma (<code>;</code>):
            </p>
            <textarea
              rows={5}
              value={bulkQText}
              onChange={(e) => setBulkQText(e.target.value)}
              placeholder='[{"id":"N001","modulo":1,"tipoPregunta":"Opción Múltiple","nivel":"Análisis","rap":"RAP 1.1","contexto":"...","pregunta":"...","opciones":["A","B","C","D"],"correcta":0,"justificacion":"..."}]'
              className="w-full p-3 rounded-lg border border-slate-300 text-xs font-mono"
            />
            {bulkQFeedback && (
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 font-medium">
                {bulkQFeedback}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkQModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleBulkImportQuestions}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
              >
                {bulkQMode === 'replace' ? 'Actualizar Banco con Texto Pegado' : 'Agregar Lote al Banco'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ESTRUCTURA OFICIAL PARA CARGAR LOTE DE PREGUNTAS ================= */}
      {showQStructureModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Estructura Oficial para Cargar Correctamente un Lote Masivo de Preguntas
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  El sistema acepta dos formatos estándar en «Agregar Masivamente Lote de Preguntas»: formato texto delimitado por punto y coma (CSV/Excel) o formato JSON.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQStructureModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar Guía
              </button>
            </div>

            {/* Opción 1: CSV / Texto separado por punto y coma */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Opción A · Formato Texto / CSV Delimitado por Punto y Coma (;)
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const sampleCsv =
                      '1;Mapeo Competitivo Local;¿Cuál es el propósito de un mapa perceptual en La Dorada?;Calcular nómina;Identificar vacíos competitivos y posicionamiento;Evitar pagar impuestos;Cerrar el local;B;El mapa perceptual visualiza la posición de los competidores según atributos valorados por el cliente.\n2;Comportamiento del Consumidor;Según Daniel Kahneman, ¿cómo opera el Sistema 1?;De forma rápida, emocional y automática;Con hojas de cálculo lentas;Solo en bancos;Nunca interviene en compras;A;El Sistema 1 guía las decisiones cotidianas rápidas y emocionales.';
                    navigator.clipboard.writeText(sampleCsv);
                    setCopiedStructureFormat('csv');
                    setTimeout(() => setCopiedStructureFormat(null), 2500);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  {copiedStructureFormat === 'csv' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedStructureFormat === 'csv' ? 'Ejemplo CSV Copiado' : 'Copiar Ejemplo CSV (;)'}</span>
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Cada línea representa una pregunta con <strong>9 campos separados por punto y coma (<code>;</code>)</strong> (también es 100% compatible con el archivo de 11 columnas que se obtiene al pulsar <em>Descargar Lote Masivo CSV</em>):
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-800 overflow-x-auto">
                Módulo (1-5);Tema;Enunciado;Opción A;Opción B;Opción C;Opción D;Letra Correcta (A/B/C/D);Justificación Pedagógica
              </div>

              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
{`1;Mapeo Competitivo Local;¿Cuál es el propósito de un mapa perceptual en La Dorada?;Calcular nómina;Identificar vacíos competitivos y posicionamiento;Evitar pagar impuestos;Cerrar el local;B;El mapa perceptual visualiza la posición de los competidores según atributos valorados por el cliente.
2;Comportamiento del Consumidor;Según Daniel Kahneman, ¿cómo opera el Sistema 1?;De forma rápida, emocional y automática;Con hojas de cálculo lentas;Solo en bancos;Nunca interviene en compras;A;El Sistema 1 guía las decisiones cotidianas rápidas y emocionales.`}
              </pre>
            </div>

            {/* Opción 2: Formato JSON */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Opción B · Formato Arreglo JSON Estructurado
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const sampleJson = JSON.stringify(
                      [
                        {
                          id: 'MM-M1-901',
                          modulo: 1,
                          tema: 'Herramientas de Mapeo',
                          bloom: 'Aplicación',
                          enunciado: '¿Qué representa el SOM en la metodología TAM-SAM-SOM para un comercio de La Dorada?',
                          opciones: {
                            A: 'El mercado mundial total.',
                            B: 'La porción realista del mercado que el negocio puede capturar a corto plazo.',
                            C: 'El impuesto municipal.',
                            D: 'El costo de arriendo.'
                          },
                          correcta: 'B',
                          justificacion: 'El SOM (Serviceable Obtainable Market) aterriza la meta alcanzable con los recursos actuales.'
                        }
                      ],
                      null,
                      2
                    );
                    navigator.clipboard.writeText(sampleJson);
                    setCopiedStructureFormat('json');
                    setTimeout(() => setCopiedStructureFormat(null), 2500);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  {copiedStructureFormat === 'json' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedStructureFormat === 'json' ? 'Ejemplo JSON Copiado' : 'Copiar Ejemplo JSON'}</span>
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-lg text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed">
{`[
  {
    "id": "MM-M1-901",
    "modulo": 1,
    "tema": "Herramientas de Mapeo",
    "bloom": "Aplicación",
    "enunciado": "¿Qué representa el SOM en la metodología TAM-SAM-SOM para un comercio de La Dorada?",
    "opciones": {
      "A": "El mercado mundial total.",
      "B": "La porción realista del mercado que el negocio puede capturar a corto plazo.",
      "C": "El impuesto municipal.",
      "D": "El costo de arriendo."
    },
    "correcta": "B",
    "justificacion": "El SOM (Serviceable Obtainable Market) aterriza la meta alcanzable con los recursos actuales."
  }
]`}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowQStructureModal(false);
                  setBulkQModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
              >
                Ir a Agregar Lote Masivo Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: RETROALIMENTACIÓN (INMEDIATA / DIFERIDA) POR ESTUDIANTE Y PARA TODOS ================= */}
      {feedbackSelectorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          {(() => {
            const q = feedbackStudentSearch.trim().toLowerCase();
            const modalFilteredStudents = students.filter((st) => {
              const isImmediate = isFeedbackImmediateForStudent(st.id);
              if (feedbackFilter === 'inmediata' && !isImmediate) return false;
              if (feedbackFilter === 'diferida' && isImmediate) return false;
              if (!q) return true;
              return (
                st.id.toLowerCase().includes(q) ||
                st.nombre.toLowerCase().includes(q) ||
                st.codigoAcceso.toLowerCase().includes(q)
              );
            });

            const allFilteredChecked =
              modalFilteredStudents.length > 0 &&
              modalFilteredStudents.every((s) => feedbackSelectedIds.includes(s.id));

            return (
              <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl my-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase text-sky-700">
                      Control Granular y Global · Retroalimentación Pedagógica
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Habilitar (INMEDIATA) o Deshabilitar (DIFERIDA) Retroalimentación por Estudiante o para Todos
                    </h3>
                    <p className="text-xs text-slate-600">
                      Estado actual del curso:{' '}
                      <strong className="text-sky-700">{feedbackImmediateCount} con Retroalimentación INMEDIATA</strong> ·{' '}
                      <strong className="text-amber-700">{feedbackDeferredCount} con Retroalimentación DIFERIDA</strong> (Total: {students.length} estudiantes).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFeedbackSelectorModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                  >
                    Cerrar ✕
                  </button>
                </div>

                {feedbackNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950 flex items-center justify-between">
                    <span>{feedbackNotice}</span>
                    <button
                      type="button"
                      onClick={() => setFeedbackNotice(null)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Botones Globales: Habilitar (INMEDIATA) para todos / Deshabilitar (DIFERIDA) para todos */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-800">
                    Acción Global para Todo el Salón ({students.length} estudiantes):
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleFeedbackImmediateAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Habilitar (INMEDIATA) para Todos ({students.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedbackDeferredAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Deshabilitar (DIFERIDA) para Todos ({students.length})</span>
                    </button>
                  </div>
                </div>

                {/* Barra de Selección por Lote dentro del Modal */}
                {feedbackSelectedIds.length > 0 && (
                  <div className="bg-sky-50 border-2 border-sky-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="font-bold text-sky-950">
                      {feedbackSelectedIds.length} estudiante(s) marcado(s) en la lista:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBatchSetFeedbackState(feedbackSelectedIds, true)}
                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Habilitar (INMEDIATA) Seleccionados ({feedbackSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchSetFeedbackState(feedbackSelectedIds, false)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Deshabilitar (DIFERIDA) Seleccionados ({feedbackSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackSelectedIds([])}
                        className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>
                )}

                {/* Buscador y Filtros por Estado (Todos / INMEDIATA / DIFERIDA) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={feedbackStudentSearch}
                      onChange={(e) => setFeedbackStudentSearch(e.target.value)}
                      placeholder="Buscar estudiante por ID, nombre o código..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                    {[
                      { id: 'all', label: `Todos (${students.length})` },
                      { id: 'inmediata', label: `Habilitados · INMEDIATA (${feedbackImmediateCount})` },
                      { id: 'diferida', label: `Deshabilitados · DIFERIDA (${feedbackDeferredCount})` }
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFeedbackFilter(f.id as typeof feedbackFilter)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          feedbackFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabla de Estudiantes con Conmutador Individual INMEDIATA / DIFERIDA */}
                <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={allFilteredChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const merged = Array.from(
                                  new Set([
                                    ...feedbackSelectedIds,
                                    ...modalFilteredStudents.map((s) => s.id)
                                  ])
                                );
                                setFeedbackSelectedIds(merged);
                              } else {
                                const filteredSet = new Set(modalFilteredStudents.map((s) => s.id));
                                setFeedbackSelectedIds(
                                  feedbackSelectedIds.filter((id) => !filteredSet.has(id))
                                );
                              }
                            }}
                            aria-label="Seleccionar todos los estudiantes filtrados"
                          />
                        </th>
                        <th className="py-2.5 px-3">ID de Estudiante</th>
                        <th className="py-2.5 px-3">Nombre Completo</th>
                        <th className="py-2.5 px-3">Código de Acceso</th>
                        <th className="py-2.5 px-3 text-right">Modo de Retroalimentación (Individual)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {modalFilteredStudents.map((st) => {
                        const isImmediate = isFeedbackImmediateForStudent(st.id);
                        const isChecked = feedbackSelectedIds.includes(st.id);
                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFeedbackSelectedIds((prev) => [...prev, st.id]);
                                  } else {
                                    setFeedbackSelectedIds((prev) =>
                                      prev.filter((id) => id !== st.id)
                                    );
                                  }
                                }}
                                aria-label={`Seleccionar ${st.nombre}`}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {st.id}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">{st.nombre}</td>
                            <td className="py-2.5 px-3 font-mono text-sky-800 font-bold">
                              {st.codigoAcceso}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleFeedbackForStudent(st.id)}
                                className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isImmediate
                                    ? 'bg-sky-600 hover:bg-sky-700 text-white'
                                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                                }`}
                              >
                                {isImmediate ? (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>● INMEDIATA (Habilitada)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>■ DIFERIDA (Deshabilitada)</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex-1">
                    <OptionServerSaveBar
                      sectionKey="retroalimentacion"
                      label="Retroalimentación por Estudiante"
                      watchValue={[
                        config.retroalimentacionInmediata,
                        config.estudiantesConRetroalimentacionDiferida
                      ]}
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedbackSelectorModalOpen(false)}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Listo / Guardar y Cerrar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: DESGLOSE PREGUNTA X PREGUNTA (POR ESTUDIANTE, PARA TODOS Y RESTRICCIÓN DE DÍAS Y HORAS) ================= */}
      {breakdownSelectorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          {(() => {
            const q = breakdownStudentSearch.trim().toLowerCase();
            const modalFilteredStudents = students.filter((st) => {
              const isEnabled = isBreakdownEnabledForStudent(st.id);
              if (breakdownFilter === 'habilitado' && !isEnabled) return false;
              if (breakdownFilter === 'deshabilitado' && isEnabled) return false;
              if (!q) return true;
              return (
                st.id.toLowerCase().includes(q) ||
                st.nombre.toLowerCase().includes(q) ||
                st.codigoAcceso.toLowerCase().includes(q)
              );
            });

            const allFilteredChecked =
              modalFilteredStudents.length > 0 &&
              modalFilteredStudents.every((s) => breakdownSelectedIds.includes(s.id));

            const activeBreakdownDays = config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0];

            return (
              <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl my-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase text-emerald-700">
                      Control Granular, Global y Horario · Desglose Pregunta x Pregunta
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Configuración de «Desglose Pregunta x Pregunta» (Por Estudiante y Tiempo Disponible)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Estado actual:{' '}
                      <strong className="text-emerald-700">{breakdownEnabledCount} estudiante(s) HABILITADOS</strong> ·{' '}
                      <strong className="text-slate-600">{breakdownDisabledCount} estudiante(s) DESHABILITADOS</strong> ·{' '}
                      <strong>
                        {config.desgloseVentanaHorariaActiva
                          ? `Restricción Horaria Activa (${config.desgloseHoraInicio || '06:00'} a ${config.desgloseHoraFin || '22:00'})`
                          : 'Sin restricción de hora'}
                      </strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBreakdownSelectorModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                  >
                    Cerrar ✕
                  </button>
                </div>

                {breakdownNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950 flex items-center justify-between">
                    <span>{breakdownNotice}</span>
                    <button
                      type="button"
                      onClick={() => setBreakdownNotice(null)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Panel 1: Disponibilidad de Tiempo (Sin restricción de hora vs Días y Rango de Horas) */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-bold text-emerald-950 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-700" />
                      <span>
                        1. Restricción de Días y Horario Disponible para «Desglose Pregunta x Pregunta»:
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            ...config,
                            desgloseVentanaHorariaActiva: false
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                          !config.desgloseVentanaHorariaActiva
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        ✓ Sin restricción de hora
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateConfig({
                            ...config,
                            desgloseVentanaHorariaActiva: true,
                            desgloseDiasPermitidos:
                              config.desgloseDiasPermitidos ?? [1, 2, 3, 4, 5, 6, 0],
                            desgloseHoraInicio: config.desgloseHoraInicio || '06:00',
                            desgloseHoraFin: config.desgloseHoraFin || '22:00'
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                          config.desgloseVentanaHorariaActiva
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        🕒 Habilitar Restricción (Días y Hora)
                      </button>
                    </div>
                  </div>

                  {config.desgloseVentanaHorariaActiva && (
                    <div className="bg-white border border-emerald-200 rounded-lg p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-800 mr-1">
                            Seleccione en qué días estará disponible:
                          </span>
                          {[
                            { d: 1, label: 'Lunes' },
                            { d: 2, label: 'Martes' },
                            { d: 3, label: 'Miércoles' },
                            { d: 4, label: 'Jueves' },
                            { d: 5, label: 'Viernes' },
                            { d: 6, label: 'Sábado' },
                            { d: 0, label: 'Domingo' }
                          ].map((dayItem) => {
                            const selected = activeBreakdownDays.includes(dayItem.d);
                            return (
                              <button
                                key={dayItem.d}
                                type="button"
                                onClick={() => handleToggleBreakdownDay(dayItem.d)}
                                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {dayItem.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateConfig({
                                ...config,
                                desgloseDiasPermitidos: [1, 2, 3, 4, 5, 6, 0]
                              })
                            }
                            className="px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            Todos los días
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateConfig({
                                ...config,
                                desgloseDiasPermitidos: [1, 2, 3, 4, 5]
                              })
                            }
                            className="px-2 py-1 rounded border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            Lun a Vie
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                        <span className="font-bold text-slate-800">
                          De qué hora a qué hora (Tiempo disponible):
                        </span>
                        <label className="flex items-center gap-1.5 font-mono">
                          <span className="font-sans text-slate-600">Desde las:</span>
                          <input
                            type="time"
                            value={config.desgloseHoraInicio || '06:00'}
                            onChange={(e) =>
                              onUpdateConfig({ ...config, desgloseHoraInicio: e.target.value })
                            }
                            className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 font-mono">
                          <span className="font-sans text-slate-600">Hasta las:</span>
                          <input
                            type="time"
                            value={config.desgloseHoraFin || '22:00'}
                            onChange={(e) =>
                              onUpdateConfig({ ...config, desgloseHoraFin: e.target.value })
                            }
                            className="px-2.5 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel 2: Botones Globales (Habilitar para todos / Deshabilitar para todos) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-800">
                    2. Acción Global por Estudiante ({students.length} estudiantes):
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleBreakdownEnableAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Habilitar para Todos ({students.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleBreakdownDisableAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Deshabilitar para Todos ({students.length})</span>
                    </button>
                  </div>
                </div>

                {/* Barra de Selección por Lote dentro del Modal */}
                {breakdownSelectedIds.length > 0 && (
                  <div className="bg-sky-50 border-2 border-sky-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="font-bold text-sky-950">
                      {breakdownSelectedIds.length} estudiante(s) marcado(s) en la lista:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBatchSetBreakdownState(breakdownSelectedIds, true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Habilitar Seleccionados ({breakdownSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchSetBreakdownState(breakdownSelectedIds, false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Deshabilitar Seleccionados ({breakdownSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBreakdownSelectedIds([])}
                        className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>
                )}

                {/* Buscador y Filtros por Estado (Todos / HABILITADO / DESHABILITADO) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={breakdownStudentSearch}
                      onChange={(e) => setBreakdownStudentSearch(e.target.value)}
                      placeholder="Buscar estudiante por ID, nombre o código..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                    {[
                      { id: 'all', label: `Todos (${students.length})` },
                      { id: 'habilitado', label: `Habilitados (${breakdownEnabledCount})` },
                      { id: 'deshabilitado', label: `Deshabilitados (${breakdownDisabledCount})` }
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setBreakdownFilter(f.id as typeof breakdownFilter)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          breakdownFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabla de Estudiantes con Conmutador Individual HABILITADO / DESHABILITADO */}
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={allFilteredChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const merged = Array.from(
                                  new Set([
                                    ...breakdownSelectedIds,
                                    ...modalFilteredStudents.map((s) => s.id)
                                  ])
                                );
                                setBreakdownSelectedIds(merged);
                              } else {
                                const filteredSet = new Set(modalFilteredStudents.map((s) => s.id));
                                setBreakdownSelectedIds(
                                  breakdownSelectedIds.filter((id) => !filteredSet.has(id))
                                );
                              }
                            }}
                            aria-label="Seleccionar todos los estudiantes filtrados"
                          />
                        </th>
                        <th className="py-2.5 px-3">ID de Estudiante</th>
                        <th className="py-2.5 px-3">Nombre Completo</th>
                        <th className="py-2.5 px-3">Código de Acceso</th>
                        <th className="py-2.5 px-3 text-right">Desglose Pregunta x Pregunta (Individual)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {modalFilteredStudents.map((st) => {
                        const isEnabled = isBreakdownEnabledForStudent(st.id);
                        const isChecked = breakdownSelectedIds.includes(st.id);
                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBreakdownSelectedIds((prev) => [...prev, st.id]);
                                  } else {
                                    setBreakdownSelectedIds((prev) =>
                                      prev.filter((id) => id !== st.id)
                                    );
                                  }
                                }}
                                aria-label={`Seleccionar ${st.nombre}`}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {st.id}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">{st.nombre}</td>
                            <td className="py-2.5 px-3 font-mono text-sky-800 font-bold">
                              {st.codigoAcceso}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleBreakdownForStudent(st.id)}
                                className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isEnabled
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-700 hover:bg-slate-800 text-white'
                                }`}
                              >
                                {isEnabled ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>● HABILITADO (Visible)</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5" />
                                    <span>■ DESHABILITADO (Oculto)</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex-1">
                    <OptionServerSaveBar
                      sectionKey="desglose_pregunta"
                      label="Desglose Pregunta x Pregunta y Horario"
                      watchValue={[
                        config.mostrarDesglosePregunta,
                        config.estudiantesConDesgloseDeshabilitado,
                        config.desgloseVentanaHorariaActiva,
                        config.desgloseDiasPermitidos,
                        config.desgloseHoraInicio,
                        config.desgloseHoraFin
                      ]}
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setBreakdownSelectorModalOpen(false)}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Listo / Guardar y Cerrar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: ESTADO MAESTRO DEL EXAMEN (ABIERTO / CERRADO) POR ESTUDIANTE Y PARA TODOS ================= */}
      {masterExamSelectorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          {(() => {
            const q = masterExamStudentSearch.trim().toLowerCase();
            const modalFilteredStudents = students.filter((st) => {
              const isOpen = isMasterOpenForStudent(st.id);
              if (masterExamFilter === 'abierto' && !isOpen) return false;
              if (masterExamFilter === 'cerrado' && isOpen) return false;
              if (!q) return true;
              return (
                st.id.toLowerCase().includes(q) ||
                st.nombre.toLowerCase().includes(q) ||
                st.codigoAcceso.toLowerCase().includes(q)
              );
            });

            const allFilteredChecked =
              modalFilteredStudents.length > 0 &&
              modalFilteredStudents.every((s) => masterExamSelectedIds.includes(s.id));

            return (
              <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl my-8">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono font-bold uppercase text-sky-700">
                      Control Granular y Global · Estado Maestro del Examen
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">
                      Habilitar (ABIERTO) o Deshabilitar (CERRADO) Examen por Estudiante o para Todos
                    </h3>
                    <p className="text-xs text-slate-600">
                      Estado actual del curso: <strong className="text-emerald-700">{masterOpenCount} con examen ABIERTO</strong> ·{' '}
                      <strong className="text-red-700">{masterClosedCount} con examen CERRADO</strong> (Total: {students.length} estudiantes).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMasterExamSelectorModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                  >
                    Cerrar ✕
                  </button>
                </div>

                {masterExamNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950 flex items-center justify-between">
                    <span>{masterExamNotice}</span>
                    <button
                      type="button"
                      onClick={() => setMasterExamNotice(null)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Botones Globales: Habilitar (ABIERTO) para todos / Deshabilitar (CERRADO) para todos */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-800">
                    Acción Global para Todo el Salón ({students.length} estudiantes):
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleMasterOpenAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Habilitar (ABIERTO) para Todos ({students.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleMasterCloseAllStudents}
                      className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Deshabilitar (CERRADO) para Todos ({students.length})</span>
                    </button>
                  </div>
                </div>

                {/* Barra de Selección por Lote dentro del Modal */}
                {masterExamSelectedIds.length > 0 && (
                  <div className="bg-sky-50 border-2 border-sky-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="font-bold text-sky-950">
                      {masterExamSelectedIds.length} estudiante(s) marcado(s) en la lista:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBatchSetMasterExamState(masterExamSelectedIds, true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Habilitar (ABIERTO) Seleccionados ({masterExamSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchSetMasterExamState(masterExamSelectedIds, false)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Deshabilitar (CERRADO) Seleccionados ({masterExamSelectedIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMasterExamSelectedIds([])}
                        className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>
                )}

                {/* Buscador y Filtros por Estado (Todos / ABIERTO / CERRADO) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={masterExamStudentSearch}
                      onChange={(e) => setMasterExamStudentSearch(e.target.value)}
                      placeholder="Buscar estudiante por ID, nombre o código..."
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                    {[
                      { id: 'all', label: `Todos (${students.length})` },
                      { id: 'abierto', label: `Habilitados · ABIERTO (${masterOpenCount})` },
                      { id: 'cerrado', label: `Deshabilitados · CERRADO (${masterClosedCount})` }
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setMasterExamFilter(f.id as typeof masterExamFilter)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          masterExamFilter === f.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabla de Estudiantes con Conmutador Individual ABIERTO / CERRADO */}
                <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={allFilteredChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const merged = Array.from(
                                  new Set([
                                    ...masterExamSelectedIds,
                                    ...modalFilteredStudents.map((s) => s.id)
                                  ])
                                );
                                setMasterExamSelectedIds(merged);
                              } else {
                                const filteredSet = new Set(modalFilteredStudents.map((s) => s.id));
                                setMasterExamSelectedIds(
                                  masterExamSelectedIds.filter((id) => !filteredSet.has(id))
                                );
                              }
                            }}
                            aria-label="Seleccionar todos los estudiantes filtrados"
                          />
                        </th>
                        <th className="py-2.5 px-3">ID de Estudiante</th>
                        <th className="py-2.5 px-3">Nombre Completo</th>
                        <th className="py-2.5 px-3">Código de Acceso</th>
                        <th className="py-2.5 px-3 text-right">Estado Maestro del Examen (Individual)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {modalFilteredStudents.map((st) => {
                        const isOpen = isMasterOpenForStudent(st.id);
                        const isChecked = masterExamSelectedIds.includes(st.id);
                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setMasterExamSelectedIds((prev) => [...prev, st.id]);
                                  } else {
                                    setMasterExamSelectedIds((prev) =>
                                      prev.filter((id) => id !== st.id)
                                    );
                                  }
                                }}
                                aria-label={`Seleccionar ${st.nombre}`}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {st.id}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">{st.nombre}</td>
                            <td className="py-2.5 px-3 font-mono text-sky-800 font-bold">
                              {st.codigoAcceso}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleMasterExamForStudent(st.id)}
                                className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isOpen
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                                title={
                                  isOpen
                                    ? 'Haga clic para cambiar a CERRADO (Deshabilitado) para este estudiante'
                                    : 'Haga clic para cambiar a ABIERTO (Habilitado) para este estudiante'
                                }
                              >
                                {isOpen ? (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>● ABIERTO (Habilitado)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>■ CERRADO (Deshabilitado)</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex-1">
                    <OptionServerSaveBar
                      sectionKey="estado_maestro_examen"
                      label="Estado Maestro del Examen por Estudiante"
                      watchValue={[config.examenAbierto, config.estudiantesConEstadoCerrado]}
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMasterExamSelectorModalOpen(false)}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Listo / Guardar y Cerrar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: EDICIÓN EN LOTE DE BLOQUEO / DESBLOQUEO DE EXÁMENES POR ESTUDIANTE ================= */}
      {batchExamBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          {(() => {
            const selectedSet = new Set(selectedStudentIdsForBatch);
            const selectedStudentsList = students.filter((s) => selectedSet.has(s.id));
            const modalitiesList: { id: ExamModality; label: string }[] = examModalities.map((m) => ({
              id: m.id,
              label: `${m.label}: ${m.subtitle}`
            }));

            return (
              <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold uppercase text-sky-700">
                    Edición Masiva por Lote ({selectedStudentsList.length} estudiantes seleccionados)
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">
                    Bloqueo / Desbloqueo de Exámenes en Lote
                  </h3>
                  <p className="text-xs text-slate-600">
                    Aplique el bloqueo o desbloqueo de todos los exámenes o de módulos específicos simultáneamente a los{' '}
                    <strong>{selectedStudentsList.length} estudiante(s)</strong> seleccionados en la tabla.
                  </p>
                </div>

                {batchExamBlockNotice && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950">
                    {batchExamBlockNotice}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleBatchBlockOrUnblockAllExams(true)}
                    className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bloquear Todos los Exámenes ({selectedStudentsList.length} alumnos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchBlockOrUnblockAllExams(false)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Desbloquear / Habilitar Todos ({selectedStudentsList.length} alumnos)</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {modalitiesList.map((m) => {
                    const blockedInSelectionCount = selectedStudentsList.filter((s) =>
                      (s.examenesBloqueados || []).includes(m.id)
                    ).length;

                    return (
                      <div
                        key={m.id}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{m.label}</div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            Estado en el lote seleccionado: {blockedInSelectionCount} bloqueado(s) ·{' '}
                            {selectedStudentsList.length - blockedInSelectionCount} habilitado(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleBatchSetModalityLock(m.id, true)}
                            className="px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Bloquear a todos</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchSetModalityLock(m.id, false)}
                            className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Desbloquear a todos</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setBatchExamBlockModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    Listo / Cerrar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: BLOQUEO / DESBLOQUEO DE EXAMEN POR ESTUDIANTE ================= */}
      {examBlockModalStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          {(() => {
            const targetSt = students.find((s) => s.id === examBlockModalStudentId);
            if (!targetSt) return null;
            const blockedList = targetSt.examenesBloqueados || [];
            const modalitiesList: { id: ExamModality; label: string }[] = examModalities.map((m) => ({
              id: m.id,
              label: `${m.label}: ${m.subtitle}`
            }));

            return (
              <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900">
                    Bloqueo / Desbloqueo de Exámenes por Estudiante
                  </h3>
                  <p className="text-xs text-slate-600">
                    Estudiante: <strong>{targetSt.nombre}</strong> (<code>{targetSt.id}</code>). Seleccione qué exámenes específicos desea bloquear o habilitar para este alumno:
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBlockOrUnblockAllExamsForStudent(targetSt.id, true)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Bloquear Todos los Exámenes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlockOrUnblockAllExamsForStudent(targetSt.id, false)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Desbloquear / Habilitar Todos
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setExamBlockModalStudentId(null);
                        setAuditModalStudentId(targetSt.id);
                        setAuditActiveMode('examenes');
                        setAuditExamModalityFilter('ALL');
                        setAuditActionNotice(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Auditoría Exámenes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExamBlockModalStudentId(null);
                        setAuditModalStudentId(targetSt.id);
                        setAuditActiveMode('retos');
                        setAuditRetoModuloFilter('ALL');
                        setAuditActionNotice(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-300" />
                      <span>Auditoría Retos</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {modalitiesList.map((m) => {
                    const isBlocked = blockedList.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-lg border flex items-center justify-between gap-3 text-xs ${
                          isBlocked
                            ? 'bg-red-50 border-red-200 text-red-900'
                            : 'bg-emerald-50/50 border-emerald-200 text-slate-900'
                        }`}
                      >
                        <span className="font-semibold">{m.label}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleStudentExamBlock(targetSt.id, m.id)}
                          className={`px-3 py-1 rounded font-bold ${
                            isBlocked
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {isBlocked ? '🔒 Bloqueado (Desbloquear)' : '✓ Habilitado (Bloquear)'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setExamBlockModalStudentId(null)}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                  >
                    Listo / Cerrar
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: VALIDADOR AUTOMÁTICO DE CALIDAD DEL BANCO (AUDITOR DE REACTIVOS) ================= */}
      {showBankAuditorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-emerald-700">
                  Auditoría Psicométrica y Editorial en Tiempo Real
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Validador Automático de Calidad del Banco ({questions.length} Reactivos Escaneados)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBankAuditorModal(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cerrar Auditor ✕
              </button>
            </div>

            {/* 1. Distribución de Letras Correctas (A, B, C, D) */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  1. Balance en la Distribución de Letras Correctas (A, B, C, D)
                </h4>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded ${
                    bankQualityAudit.isDistributionUnbalanced
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {bankQualityAudit.isDistributionUnbalanced
                    ? '⚠️ Desbalance Detectado'
                    : '✓ Distribución Equilibrada (~25% c/u)'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-xs font-mono">
                {(['A', 'B', 'C', 'D'] as const).map((l) => (
                  <div key={l} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-sm font-bold text-slate-900">Opción {l}</div>
                    <div className="text-base font-bold text-sky-700">
                      {bankQualityAudit.distPct[l]}%
                    </div>
                    <div className="text-[11px] text-slate-500">
                      ({bankQualityAudit.dist[l]} reactivos)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Enunciados Duplicados o Muy Similares */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  2. Detección de Enunciados Duplicados o Muy Similares
                </h4>
                <span className="text-xs font-mono font-bold text-slate-700">
                  {bankQualityAudit.duplicateOrSimilar.length} hallazgos
                </span>
              </div>
              {bankQualityAudit.duplicateOrSimilar.length === 0 ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  ✓ Excelente: No se encontraron enunciados duplicados ni colisiones textuales en los {questions.length} reactivos activos.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                  {bankQualityAudit.duplicateOrSimilar.slice(0, 12).map((dup, i) => (
                    <div key={i} className="p-2.5 rounded bg-amber-50 border border-amber-200">
                      <strong className="font-mono">
                        {dup.idA} ↔ {dup.idB}:
                      </strong>{' '}
                      {dup.enunciado}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Sesgo de Longitud en Opción Correcta vs Distractores */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  3. Blindaje Anti-Heurístico y Sesgo de Longitud (Cascaritas + Igual Extensión)
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {bankQualityAudit.lengthBiasItems.length} hallazgos
                  </span>
                  <button
                    type="button"
                    disabled={isEqualizingBankIA || questions.length === 0}
                    onClick={() => handleEqualizeQuestionBankIA('ai_deep')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isEqualizingBankIA ? 'animate-spin' : ''}`} />
                    <span>
                      {isEqualizingBankIA
                        ? 'Ecualizando con IA...'
                        : '🧠 Ecualizar Todo con IA (Cascarita + Igual Extensión)'}
                    </span>
                  </button>
                </div>
              </div>
              {bankQualityAudit.lengthBiasItems.length === 0 ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  ✓ Blindaje Anti-Patrones Activo (0 sesgos de longitud): Todas las opciones mantienen una extensión homogénea, mini-explicaciones simétricas y distractores con «cascarita» para que ningún estudiante pueda adivinar sin leer.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                  {bankQualityAudit.lengthBiasItems.slice(0, 15).map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <strong className="font-mono text-amber-950">
                          {item.id} (M{item.modulo} · Resp. {item.correcta}):
                        </strong>{' '}
                        {item.enunciado}
                      </div>
                      <span className="font-mono text-[11px] shrink-0 text-amber-900">
                        {item.correctLen} car. vs {item.avgDistractorLen} prom.
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: AUDITORÍA DETALLADA POR ESTUDIANTE (EXÁMENES POR MÓDULO Y RETOS POR MÓDULO) ================= */}
      {auditModalStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto">
          {(() => {
            const auditSt = students.find((s) => s.id === auditModalStudentId);
            if (!auditSt) return null;

            const studentExamAttempts = attempts
              .filter((a) => a && a.studentId === auditSt.id)
              .sort((a, b) => b.timestampMs - a.timestampMs);

            const filteredStudentExams =
              auditExamModalityFilter === 'ALL'
                ? studentExamAttempts
                : studentExamAttempts.filter(
                    (a) => (a.modalidad || 'integral') === auditExamModalityFilter
                  );

            // Collect all mini-reto attempts for this specific student across active course modules
            const studentRetoAttemptsMap = new Map<string, MiniRetoAttemptRecord>();
            if (Array.isArray(auditSt.historialIntentosRetos)) {
              auditSt.historialIntentosRetos.filter(Boolean).forEach((att) => {
                studentRetoAttemptsMap.set(att.attemptId, att);
              });
            }
            activeCourseMeta.modulosCurso.forEach((modItem) => {
              const m = modItem.id as 1 | 2 | 3 | 4 | 5;
              const modHist = auditSt.progresoRetos?.[m]?.historialIntentos;
              if (Array.isArray(modHist)) {
                modHist.filter(Boolean).forEach((att) => {
                  studentRetoAttemptsMap.set(att.attemptId, att);
                });
              }
            });
            const allStudentRetoAttempts = Array.from(studentRetoAttemptsMap.values()).sort(
              (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
            );
            const filteredStudentRetos =
              auditRetoModuloFilter === 'ALL'
                ? allStudentRetoAttempts
                : allStudentRetoAttempts.filter(
                    (r) => Number(r.modulo) === auditRetoModuloFilter
                  );

            return (
              <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-md">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Auditoría Académica e Inspección Forense por Estudiante</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">
                      {auditSt.nombre} — Documento ID: <span className="font-mono">{auditSt.id}</span> · Código:{' '}
                      <span className="font-mono text-sky-800">{auditSt.codigoAcceso}</span>
                    </h3>
                    <p className="text-xs text-slate-600">
                      Inspeccione qué exámenes por módulo realizó, qué preguntas le salieron, cuál respondió, cuánto tiempo empleó por pregunta y borre intentos específicos de examen o de reto.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAuditActiveMode('examenes');
                        setAuditActionNotice(null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        auditActiveMode === 'examenes'
                          ? 'bg-sky-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Auditoría de Exámenes por Módulo ({studentExamAttempts.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuditActiveMode('retos');
                        setAuditActionNotice(null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        auditActiveMode === 'retos'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Trophy className="w-4 h-4 text-amber-300" />
                      <span>Auditoría de Retos por Módulo ({allStudentRetoAttempts.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAuditModalStudentId(null)}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      Cerrar ✕
                    </button>
                  </div>
                </div>

                {auditActionNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950 flex items-center justify-between gap-2">
                    <span>{auditActionNotice}</span>
                    <button
                      type="button"
                      onClick={() => setAuditActionNotice(null)}
                      className="text-emerald-800 hover:text-emerald-950 px-2"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Resumen consolidado en el Servidor: Exámenes realizados, notas, faltantes, retos e historial anti-trampa */}
                {(() => {
                  const srv = computeStudentServerSummary(auditSt, attempts, config);
                  const effWarn = getEffectiveMaxLlamadosAtencion(auditSt, config);
                  const isCustomWarn =
                    typeof auditSt.maxLlamadosAtencionIndividual === 'number' ||
                    typeof config.llamadosAtencionPorEstudiante?.[auditSt.id] === 'number';
                  return (
                    <div className="bg-slate-50 border border-indigo-200 rounded-xl p-4 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                        <div className="font-bold text-slate-900">
                          📊 Resumen del Servidor ({auditSt.nombre}): {srv.examenesRealizadosCount}/{totalExamModalitiesCount} Exámenes realizados (Faltan {srv.examenesFaltantesCount}) · {srv.retosRealizadosCount}/{totalRetosCount} Mini Retos realizados (Faltan {srv.retosFaltantesModulos.length}) · Promedio Exámenes: {srv.promedioExamenesPresentados.toFixed(1)}/5.0
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-950">🛡️ Llamados Permitidos:</span>
                          <select
                            value={isCustomWarn ? String(effWarn) : 'GLOBAL'}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleSetIndividualStudentWarningLimit(
                                auditSt.id,
                                val === 'GLOBAL' ? 'GLOBAL' : Number(val)
                              );
                            }}
                            className="px-2 py-1 rounded border border-indigo-300 bg-white font-mono font-bold text-indigo-950"
                          >
                            <option value="GLOBAL">
                              Global ({config.maxLlamadosAtencionGlobal ?? 1})
                            </option>
                            <option value="0">0 Llamados (Susp. Inmediata)</option>
                            <option value="1">1 Llamado</option>
                            <option value="2">2 Llamados</option>
                            <option value="3">3 Llamados</option>
                            <option value="4">4 Llamados</option>
                            <option value="5">5 Llamados</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        {srv.detallePorExamen.map((exMod) => (
                          <div
                            key={exMod.modalidad}
                            className={`p-2 rounded-lg border text-[11px] ${
                              exMod.realizado
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                : 'bg-white border-dashed border-slate-300 text-slate-500'
                            }`}
                          >
                            <div className="font-bold truncate">{exMod.label}</div>
                            <div className="font-mono font-bold mt-0.5">
                              {exMod.realizado
                                ? `Nota: ${exMod.mejorNota.toFixed(1)} (${exMod.intentosUtilizados} Int.)`
                                : '⏳ FALTA'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ================= MODO 1: AUDITORÍA DE EXÁMENES POR MÓDULO ================= */}
                {auditActiveMode === 'examenes' && (
                  <div className="space-y-4">
                    {/* Filtro de Modalidad / Módulo de Examen */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="font-bold text-slate-800">
                        Filtrar por Examen / Módulo realizado:
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: 'ALL' as const, label: `Todos (${studentExamAttempts.length})` },
                          ...examModalities.map((mod) => ({
                            id: mod.id,
                            label: mod.shortLabel
                          }))
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setAuditExamModalityFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                              auditExamModalityFilter === tab.id
                                ? 'bg-sky-700 text-white'
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredStudentExams.length === 0 ? (
                      <div className="p-10 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2 text-xs text-slate-500">
                        <BookOpen className="w-7 h-7 text-slate-400 mx-auto" />
                        <div className="font-bold text-slate-800 text-sm">
                          Este estudiante aún no registra intentos de examen en el módulo seleccionado
                        </div>
                        <p>
                          Cuando el estudiante finalice un intento de examen, aquí aparecerán todas las preguntas que le salieron, qué opción respondió, el tiempo empleado por pregunta y el botón para borrar el intento.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {filteredStudentExams.map((examAtt) => {
                          const totalMin = Math.floor((examAtt.tiempoEmpleadoSegundos || 0) / 60);
                          const totalSec = (examAtt.tiempoEmpleadoSegundos || 0) % 60;
                          const avgQuestionSec = Math.max(
                            1,
                            Math.round(
                              (examAtt.tiempoEmpleadoSegundos || 60) /
                                Math.max(1, examAtt.totalPreguntas || 1)
                            )
                          );

                          return (
                            <div
                              key={examAtt.attemptId}
                              className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs"
                            >
                              {/* Cabecera del Intento de Examen */}
                              <div className="bg-slate-900 text-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded bg-sky-500 text-slate-950 text-xs font-extrabold uppercase">
                                      {examAtt.modalidadLabel || 'Examen Oficial'}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-sky-300">
                                      Intento #{examAtt.intentoNumero}
                                    </span>
                                    <span
                                      className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                                        examAtt.estado === 'APROBADO'
                                          ? 'bg-emerald-500 text-slate-950'
                                          : examAtt.estado === 'SUSPENDIDO'
                                          ? 'bg-red-600 text-white'
                                          : 'bg-amber-400 text-slate-950'
                                      }`}
                                    >
                                      Nota: {examAtt.notaColombiana.toFixed(1)} / 5.0 ({examAtt.porcentaje}% · {examAtt.estado})
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-300 font-mono flex flex-wrap items-center gap-3">
                                    <span>📅 Fecha: {examAtt.fecha}</span>
                                    <span>
                                      ✓ Aciertos: {examAtt.aciertos}/{examAtt.totalPreguntas}
                                    </span>
                                    <span>
                                      ⏱️ Tiempo Total Examen: {totalMin}m {totalSec}s (Promedio:{' '}
                                      {avgQuestionSec}s / pregunta)
                                    </span>
                                    <span>🛡️ Integridad: {examAtt.conceptoInfraccion}</span>
                                  </div>
                                </div>

                                {/* Botón para Borrar Intento de Examen */}
                                <div className="shrink-0">
                                  {confirmDeleteExamAttemptId === examAtt.attemptId ? (
                                    <div className="inline-flex items-center gap-2 bg-red-950 border border-red-400 px-3 py-1.5 rounded-xl text-xs">
                                      <span className="font-bold text-red-200">
                                        ¿Borrar este intento de examen?
                                      </span>
                                      <button
                                        type="button"
                                        disabled={deletingExamAttemptId === examAtt.attemptId}
                                        onClick={() => handleDeleteSpecificExamAttempt(examAtt)}
                                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        {deletingExamAttemptId === examAtt.attemptId ? (
                                          <>
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>Guardando...</span>
                                          </>
                                        ) : (
                                          <span>Sí, Borrar Intento</span>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={deletingExamAttemptId === examAtt.attemptId}
                                        onClick={() => setConfirmDeleteExamAttemptId(null)}
                                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={deletingExamAttemptId === examAtt.attemptId}
                                      onClick={() => setConfirmDeleteExamAttemptId(examAtt.attemptId)}
                                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                      title="Borrar este intento de examen y habilitar nuevamente el cupo para el estudiante"
                                    >
                                      {deletingExamAttemptId === examAtt.attemptId ? (
                                        <>
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>Guardando...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Borrar Intento de Examen</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Desglose de Preguntas que le salieron, qué respondió y tiempo por pregunta */}
                              <div className="p-4 space-y-2.5 max-h-96 overflow-y-auto divide-y divide-slate-200">
                                {(examAtt.respuestasDetalle || []).map((r, qIdx) => {
                                  const qSec =
                                    typeof r.tiempoSegundos === 'number' && r.tiempoSegundos > 0
                                      ? r.tiempoSegundos
                                      : avgQuestionSec;
                                  const qMinPart = Math.floor(qSec / 60);
                                  const qSecPart = qSec % 60;

                                  return (
                                    <div key={`${examAtt.attemptId}-${r.questionId}-${qIdx}`} className="pt-2.5 first:pt-0 text-xs space-y-1.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold">
                                            Pregunta #{qIdx + 1} · {r.questionId}
                                          </span>
                                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                                            Módulo {r.modulo} · {r.bloom}
                                          </span>
                                          <span className="text-slate-600 font-medium">{r.tema}</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className="px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-900 font-mono font-bold">
                                            ⏱️ Tiempo en pregunta:{' '}
                                            {qMinPart > 0 ? `${qMinPart}m ${qSecPart}s` : `${qSecPart}s`}
                                          </span>
                                          <span
                                            className={`px-2.5 py-0.5 rounded font-bold ${
                                              r.acierto
                                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                : 'bg-red-100 text-red-900 border border-red-300'
                                            }`}
                                          >
                                            {r.acierto ? '✓ CORRECTA' : '✗ INCORRECTA'}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="font-semibold text-slate-900">{r.enunciado}</div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        <div
                                          className={`p-2 rounded-lg border ${
                                            r.acierto
                                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                              : 'bg-red-50 border-red-300 text-red-950'
                                          }`}
                                        >
                                          <div className="text-[10px] font-mono uppercase font-bold opacity-75">
                                            Respuesta Elegida por el Estudiante:
                                          </div>
                                          <div className="font-bold">
                                            {r.elegida
                                              ? `${r.elegida}) ${r.opciones?.[r.elegida] || ''}`
                                              : 'Sin responder (En blanco)'}
                                          </div>
                                        </div>

                                        <div className="p-2 rounded-lg border bg-emerald-50/60 border-emerald-200 text-emerald-950">
                                          <div className="text-[10px] font-mono uppercase font-bold opacity-75">
                                            Opción Correcta Oficial:
                                          </div>
                                          <div className="font-bold">
                                            {r.correcta}) {r.opciones?.[r.correcta] || ''}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ================= MODO 2: AUDITORÍA DE RETOS POR MÓDULO ================= */}
                {auditActiveMode === 'retos' && (
                  <div className="space-y-4">
                    {/* Resumen de los Módulos de Retos para este estudiante */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {activeCourseMeta.modulosCurso.map((modItem) => {
                        const m = modItem.id as 1 | 2 | 3 | 4 | 5;
                        const mp = auditSt.progresoRetos?.[m];
                        const used = mp?.intentosUsados || 0;
                        const unlocked = Boolean(mp?.insigniaDesbloqueada);
                        const badgeInfo = activeCourseBadges.find((b) => b.modulo === m);
                        return (
                          <div
                            key={m}
                            onClick={() => setAuditRetoModuloFilter(m as 1 | 2 | 3 | 4 | 5)}
                            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                              auditRetoModuloFilter === m
                                ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-400/40'
                                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold text-slate-900">
                              <span>Módulo {m}</span>
                              <span>{badgeInfo?.icono}</span>
                            </div>
                            <div className="text-[11px] font-mono mt-1">
                              Intentos: <strong>{used}/3</strong> · Mejor:{' '}
                              <strong>{mp?.mejorPorcentaje || 0}%</strong>
                            </div>
                            <div className="text-[10px] font-bold mt-1">
                              {unlocked ? (
                                <span className="text-emerald-700">🏅 Insignia Ganada</span>
                              ) : (
                                <span className="text-slate-500">⏳ Sin insignia</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Filtro rápido por módulo de reto */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="font-bold text-slate-800">
                        Filtrar Retos por Módulo (1 al {Math.max(1, activeCourseMeta.modulosCurso.length)}):
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAuditRetoModuloFilter('ALL')}
                          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                            auditRetoModuloFilter === 'ALL'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Todos los Módulos ({allStudentRetoAttempts.length})
                        </button>
                        {activeCourseMeta.modulosCurso.map((modItem) => {
                          const m = modItem.id;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setAuditRetoModuloFilter(m as 1 | 2 | 3 | 4 | 5)}
                              className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                                auditRetoModuloFilter === m
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              Módulo {m} (
                              {allStudentRetoAttempts.filter((r) => Number(r.modulo) === m).length})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {filteredStudentRetos.length === 0 ? (
                      <div className="p-10 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2 text-xs text-slate-500">
                        <Trophy className="w-7 h-7 text-slate-400 mx-auto" />
                        <div className="font-bold text-slate-800 text-sm">
                          Este estudiante aún no registra intentos de Mini Retos en el módulo seleccionado
                        </div>
                        <p>
                          Cuando el estudiante realice un reto en la «Zona de Retos & Insignias», aquí verá qué reto le salió, qué respondió, cuánto tiempo empleó por reto y podrá borrar cualquier intento de reto.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filteredStudentRetos.map((retoAtt) => {
                          const rSec = retoAtt.tiempoEmpleadoSegundos || 80;
                          const rMinPart = Math.floor(rSec / 60);
                          const rSecPart = rSec % 60;
                          const rubrica = retoAtt.rubricaDesglose || {
                            conceptoClavePct: 0,
                            argumentacionTeoricaPct: 0,
                            originalidadFeynmanPct: 0
                          };

                          return (
                            <div
                              key={retoAtt.attemptId}
                              className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs text-xs"
                            >
                              <div className="bg-indigo-950 text-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 font-extrabold uppercase">
                                      Módulo {retoAtt.modulo} · Intento #{retoAtt.intentoNumero}/3
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded bg-indigo-800 text-indigo-100 font-semibold">
                                      {retoAtt.mecanicaNombre} ({retoAtt.familia})
                                    </span>
                                    <span
                                      className={`px-2.5 py-0.5 rounded font-mono font-bold ${
                                        retoAtt.suspendidoPorTrampa
                                          ? 'bg-red-600 text-white'
                                          : retoAtt.aprobado
                                          ? 'bg-emerald-400 text-slate-950'
                                          : 'bg-amber-300 text-slate-950'
                                      }`}
                                    >
                                      {retoAtt.suspendidoPorTrampa
                                        ? '🚨 0.0 / 5.0 (SUSPENDIDO)'
                                        : `Afinidad IA: ${retoAtt.porcentajeIA}% (${
                                            retoAtt.aprobado ? '🏅 SUPERADO' : 'NO SUPERADO'
                                          })`}
                                    </span>
                                  </div>
                                  <div className="text-indigo-200 font-mono flex flex-wrap items-center gap-3">
                                    <span>📅 Fecha: {retoAtt.fecha}</span>
                                    <span>
                                      ⏱️ Tiempo empleado en este reto:{' '}
                                      {rMinPart > 0 ? `${rMinPart}m ${rSecPart}s` : `${rSecPart}s`}
                                    </span>
                                    <span>Reactivo Base: {retoAtt.sourceQuestionId}</span>
                                  </div>
                                </div>

                                {/* Botón para Borrar Intento del Reto */}
                                <div className="shrink-0">
                                  {confirmDeleteRetoAttemptId === retoAtt.attemptId ? (
                                    <div className="inline-flex items-center gap-2 bg-red-950 border border-red-400 px-3 py-1.5 rounded-xl">
                                      <span className="font-bold text-red-200">
                                        ¿Borrar este intento del reto?
                                      </span>
                                      <button
                                        type="button"
                                        disabled={deletingRetoAttemptId === retoAtt.attemptId}
                                        onClick={() =>
                                          handleDeleteSpecificRetoAttempt(
                                            auditSt.id,
                                            retoAtt.attemptId,
                                            retoAtt.modulo
                                          )
                                        }
                                        className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        {deletingRetoAttemptId === retoAtt.attemptId ? (
                                          <>
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>Guardando...</span>
                                          </>
                                        ) : (
                                          <span>Sí, Borrar Intento</span>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={deletingRetoAttemptId === retoAtt.attemptId}
                                        onClick={() => setConfirmDeleteRetoAttemptId(null)}
                                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={deletingRetoAttemptId === retoAtt.attemptId}
                                      onClick={() => setConfirmDeleteRetoAttemptId(retoAtt.attemptId)}
                                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                      title="Borrar este intento del reto y habilitar nuevamente el intento para el estudiante"
                                    >
                                      {deletingRetoAttemptId === retoAtt.attemptId ? (
                                        <>
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>Guardando...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Borrar Intento del Reto</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                                  <div className="text-[11px] font-bold uppercase text-indigo-800">
                                    1. Qué Reto le Salió al Estudiante:
                                  </div>
                                  <div className="font-bold text-slate-900 text-sm">
                                    {retoAtt.tituloReto}
                                  </div>
                                  <p className="text-slate-700 whitespace-pre-line">
                                    {retoAtt.narrativaEscenario}
                                  </p>
                                  <div className="p-2 rounded bg-white border border-slate-200 font-semibold text-slate-900">
                                    🎯 Desafío Planteado: {retoAtt.preguntaReto}
                                  </div>
                                  <div className="text-emerald-900 pt-1">
                                    <strong>Respuesta Esperada Docente:</strong>{' '}
                                    {retoAtt.respuestaEsperadaDocente}
                                  </div>
                                </div>

                                <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-3.5 space-y-2">
                                  <div className="text-[11px] font-bold uppercase text-sky-900">
                                    2. Qué Respondió el Estudiante y Tiempo Empleado:
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-white border border-sky-200 text-slate-900 font-medium">
                                    «{retoAtt.respuestaEstudiante}»
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-700">
                                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 font-bold">
                                      ⏱️ Tiempo por reto:{' '}
                                      {rMinPart > 0 ? `${rMinPart}m ${rSecPart}s` : `${rSecPart}s`}
                                    </span>
                                    <span>
                                      Concepto: {rubrica.conceptoClavePct}/40% · Argumentación:{' '}
                                      {rubrica.argumentacionTeoricaPct}/40% · Feynman:{' '}
                                      {rubrica.originalidadFeynmanPct}/20%
                                    </span>
                                  </div>
                                  <div className="text-slate-700">
                                    <strong>Retroalimentación Semántica IA:</strong>{' '}
                                    {retoAtt.retroalimentacionIA}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <OptionServerSaveBar
                    sectionKey="auditoria_estudiante_modal"
                    label={`Auditoría de ${auditSt.nombre}`}
                    watchValue={[
                      studentExamAttempts.length,
                      allStudentRetoAttempts.length,
                      auditSt.intentosUsados
                    ]}
                    compact
                  />
                  <button
                    type="button"
                    onClick={() => setAuditModalStudentId(null)}
                    className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Listo / Cerrar Auditoría
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ================= MODAL: CENTRO DE CONTROL DE MÉTODOS ANTI-TRAMPAS (EXÁMENES Y MINI RETOS) ================= */}
      {antiCheatControlModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-5xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold uppercase text-indigo-700">
                  Seguridad Académica, Detección Multi-Vector IA y Blindaje Persistente en Servidor
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Centro de Control de Métodos Anti-Trampas y Llamados de Atención (Global e Individual)
                </h3>
                <p className="text-xs text-slate-600">
                  Estado actual: <strong>{totalActiveAntiCheatCount} de 18 escudos activos</strong> ({activeExamAntiCheatCount}/13 en Exámenes · {activeRetoAntiCheatCount}/5 en Mini Retos) · Límite Global: <strong>{config.maxLlamadosAtencionGlobal ?? 1} llamado(s)</strong>. Todo se guarda en el Servidor Central.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleEnableAllAntiCheatMethods}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Habilitar Todos (18/18)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAntiCheatControlModalOpen(false)}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cerrar ✕
                </button>
              </div>
            </div>

            {antiCheatActionNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-950 flex items-center justify-between">
                <span>{antiCheatActionNotice}</span>
                <button
                  type="button"
                  onClick={() => setAntiCheatActionNotice(null)}
                  className="text-emerald-800 hover:text-emerald-950 font-bold px-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* SECCIÓN NUEVA: CONFIGURACIÓN DE CUÁNTOS LLAMADOS DE ATENCIÓN SE AJUSTAN A TODOS O DE FORMA INDIVIDUAL */}
            <div className="border-2 border-indigo-200 rounded-xl p-4 bg-indigo-50/50 space-y-4 text-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-indigo-200 pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-indigo-950">
                    Configuración de Llamados de Atención Anti-Trampa (Para Todos o Individual por Estudiante)
                  </h4>
                  <p className="text-[11px] text-indigo-900">
                    Defina cuántas advertencias preventivas permite el sistema (cambio de pestaña, minimizar ventana, cambio de aplicación, abandono de puntero, etc.) antes de suspender automáticamente con <strong>0.0 / 5.0 (SUSPENDIDO)</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="font-bold text-indigo-950">Ajustar a TODOS los estudiantes:</span>
                  {[0, 1, 2, 3, 4, 5].map((num) => {
                    const isCurrentGlobal = (config.maxLlamadosAtencionGlobal ?? 1) === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleApplyWarningLimitToAllStudents(num)}
                        className={`px-2.5 py-1.5 rounded-lg font-mono font-bold cursor-pointer transition-colors ${
                          isCurrentGlobal
                            ? 'bg-indigo-700 text-white shadow-xs'
                            : 'bg-white border border-indigo-300 text-indigo-900 hover:bg-indigo-100'
                        }`}
                        title={
                          num === 0
                            ? 'Suspensión inmediata en la 1ª detección sin llamados previos'
                            : `Permitir ${num} llamado(s) de atención a todos los estudiantes antes de suspender`
                        }
                      >
                        {num === 0 ? '0 (Inmediato)' : `${num} Llamado${num > 1 ? 's' : ''}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ajuste Individual por Estudiante */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    Ajuste Individual de Llamados de Atención por Estudiante ({students.length} estudiantes):
                  </span>
                  <input
                    type="text"
                    value={warningLimitStudentSearch}
                    onChange={(e) => setWarningLimitStudentSearch(e.target.value)}
                    placeholder="Filtrar estudiante por nombre o documento..."
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs w-full sm:w-72"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                  {students
                    .filter((s) => {
                      const q = warningLimitStudentSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        s.nombre.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
                      );
                    })
                    .map((st) => {
                      const effWarn = getEffectiveMaxLlamadosAtencion(st, config);
                      const isCustom =
                        typeof st.maxLlamadosAtencionIndividual === 'number' ||
                        typeof config.llamadosAtencionPorEstudiante?.[st.id] === 'number';
                      const logsCount = Array.isArray(st.historialLlamadosAtencion)
                        ? st.historialLlamadosAtencion.length
                        : st.advertenciasCambioFoco || 0;

                      return (
                        <div
                          key={st.id}
                          className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-700">{st.id}</span>
                            <span className="font-semibold text-slate-900">{st.nombre}</span>
                            {isCustom && (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                                Individual: {effWarn} llamado(s)
                              </span>
                            )}
                            {logsCount > 0 && (
                              <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 font-mono text-[10px]">
                                Infracciones reg.: {logsCount}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <select
                              value={isCustom ? String(effWarn) : 'GLOBAL'}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleSetIndividualStudentWarningLimit(
                                  st.id,
                                  val === 'GLOBAL' ? 'GLOBAL' : Number(val)
                                );
                              }}
                              className="px-2 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-slate-900 text-[11px]"
                            >
                              <option value="GLOBAL">
                                Global ({config.maxLlamadosAtencionGlobal ?? 1} llamado(s))
                              </option>
                              <option value="0">0 Llamados (Suspensión inmediata)</option>
                              <option value="1">1 Llamado de atención</option>
                              <option value="2">2 Llamados de atención</option>
                              <option value="3">3 Llamados de atención</option>
                              <option value="4">4 Llamados de atención</option>
                              <option value="5">5 Llamados de atención</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Columna 1: Métodos Anti-Trampa en Exámenes */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      1. Métodos Anti-Trampa en Exámenes ({activeExamAntiCheatCount}/13)
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Detecciones de pestaña, minimizado, cambio de app e IA en Exámenes Integrales y por Módulo
                    </p>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {[
                    {
                      field: 'antiTrampaExamenesActivo' as keyof SystemConfig,
                      title: 'Escudo Maestro Anti-Trampas en Exámenes',
                      desc: 'Interruptor general que habilita la supervisión y sanción automática en todos los exámenes.'
                    },
                    {
                      field: 'detectarCambioPestana' as keyof SystemConfig,
                      title: 'Detector de Cambio de Pestaña del Navegador (Tab Switch)',
                      desc: 'Detecta inmediatamente cuando el estudiante cambia a otra pestaña del navegador.'
                    },
                    {
                      field: 'detectarMinimizarPestana' as keyof SystemConfig,
                      title: 'Detector de Minimizar Pestaña o Colapsar Ventana',
                      desc: 'Identifica cuando el estudiante minimiza el navegador o reduce la ventana al mínimo.'
                    },
                    {
                      field: 'detectarCambioAplicacion' as keyof SystemConfig,
                      title: 'Detector de Cambio de Aplicación Externa (Alt+Tab / App IA)',
                      desc: 'Detecta cuando el foco pasa a otra aplicación de escritorio, asistente IA o segunda pantalla.'
                    },
                    {
                      field: 'examenBloquearCambioPestanaFoco' as keyof SystemConfig,
                      title: 'Control General de Foco y Llamados de Atención',
                      desc: 'Aplica el límite configurado de llamados (global o individual) antes de suspender con 0.0 / 5.0.'
                    },
                    {
                      field: 'examenBloquearCopiaClicDerechoAtajos' as keyof SystemConfig,
                      title: 'Bloqueo de Copia, Pegado, Clic Derecho y Arrastrar Texto',
                      desc: 'Bloquea Copy/Cut/Paste, menú contextual y Ctrl+C/V/X contabilizando llamado de atención.'
                    },
                    {
                      field: 'detectarCapturaPantallaDevTools' as keyof SystemConfig,
                      title: 'Detector de Captura de Pantalla, Impresión y DevTools (F12)',
                      desc: 'Detecta PrintScreen, Ctrl+P, F12, Ctrl+Shift+I y apertura acoplada del inspector.'
                    },
                    {
                      field: 'detectarAbandonoPunteroIA' as keyof SystemConfig,
                      title: 'Detector IA de Abandono Prolongado de Puntero (>9s fuera)',
                      desc: 'Detecta cuando el cursor sale de la ventana por más de 9s (uso de otro monitor o celular).'
                    },
                    {
                      field: 'detectarRafagaClicsIA' as keyof SystemConfig,
                      title: 'Detector IA de Ráfaga de Respuestas sin Lectura (<2.2s)',
                      desc: 'Identifica marcación automática o respuestas en ráfaga sin tiempo humano de lectura.'
                    },
                    {
                      field: 'examenExigirPantallaCompleta' as keyof SystemConfig,
                      title: 'Modo Pantalla Completa Segura (Fullscreen)',
                      desc: 'Activa pantalla completa al iniciar el examen y registra llamado si el estudiante sale de ella.'
                    },
                    {
                      field: 'exigirPantallaMaximizada' as keyof SystemConfig,
                      title: 'Detector Anti Split-Screen (<85%) y Doble Monitor',
                      desc: 'Detecta ventanas divididas o monitores extendidos y alerta en el Monitor de Aula en Vivo.'
                    },
                    {
                      field: 'barajarOpciones' as keyof SystemConfig,
                      title: 'Barajado Dinámico de Preguntas y Opciones A/B/C/D',
                      desc: 'Permuta el orden de las opciones A, B, C y D de forma única para cada estudiante.'
                    },
                    {
                      field: 'ecualizadorPsicometricoActivo' as keyof SystemConfig,
                      title: 'Ecualizador Psicométrico IA («Cascaritas» + Igual Longitud)',
                      desc: 'Evita adivinar por extensión: iguala la longitud y añade mini-explicación con cascarita a los distractores.'
                    }
                  ].map((item) => {
                    const enabled = config[item.field] !== false;
                    return (
                      <div
                        key={String(item.field)}
                        className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{item.title}</div>
                          <div className="text-[11px] text-slate-600 leading-snug">{item.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAntiCheatField(item.field)}
                          className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer transition-colors ${
                            enabled
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {enabled ? '✓ Habilitado' : 'Deshabilitado'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Columna 2: Métodos Anti-Trampa en Mini Retos */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      2. Métodos Anti-Trampa en Mini Retos ({activeRetoAntiCheatCount}/5)
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Protección en la Zona de Mini Retos Semánticos con IA & Medallero PRU
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      field: 'antiTrampaMiniRetosActivo' as keyof SystemConfig,
                      title: 'Escudo Maestro Anti-Trampas en Mini Retos',
                      desc: 'Interruptor general que activa el entorno supervisado en todos los intentos de Mini Retos.'
                    },
                    {
                      field: 'retoBloquearCambioPestanaFoco' as keyof SystemConfig,
                      title: 'Regla de 1 Advertencia en Cambio de Pestaña / Foco',
                      desc: 'Permite 1 advertencia preventiva al perder foco; la 2ª incidencia suspende con 0.0 / 5.0 (SUSPENDIDO).'
                    },
                    {
                      field: 'retoSuspenderCopiaPegadoInyeccion' as keyof SystemConfig,
                      title: 'Suspensión Inmediata 0.0 por Copiar, Pegar o Inyectar Texto',
                      desc: 'Suspende automáticamente ante Ctrl+C/V/X, clic derecho, arrastrar texto o inyección >18 caracteres.'
                    },
                    {
                      field: 'retoBiometriaTecleoAntiCopia' as keyof SystemConfig,
                      title: 'Biometría de Tecleo Anti-Copia y Anti-Chatbot',
                      desc: 'Analiza velocidad (PPM), cadencia en milisegundos, uso de Backspace y muletillas de IA al enviar.'
                    },
                    {
                      field: 'retoExigirPantallaCompleta' as keyof SystemConfig,
                      title: 'Pantalla Completa Obligatoria y Anti Ventana Dividida',
                      desc: 'Solicita modo Fullscreen al abrir el reto y advierte si el estudiante divide la pantalla (<85%).'
                    }
                  ].map((item) => {
                    const enabled = config[item.field] !== false;
                    return (
                      <div
                        key={String(item.field)}
                        className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{item.title}</div>
                          <div className="text-[11px] text-slate-600 leading-snug">{item.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleAntiCheatField(item.field)}
                          className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer transition-colors ${
                            enabled
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {enabled ? '✓ Habilitado' : 'Deshabilitado'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <div className="flex-1">
                <OptionServerSaveBar
                  sectionKey="control_anti_trampas"
                  label="Configuración de Métodos Anti-Trampas (Exámenes y Mini Retos)"
                  watchValue={[
                    config.antiTrampaExamenesActivo,
                    config.examenBloquearCambioPestanaFoco,
                    config.examenBloquearCopiaClicDerechoAtajos,
                    config.examenExigirPantallaCompleta,
                    config.exigirPantallaMaximizada,
                    config.barajarOpciones,
                    config.ecualizadorPsicometricoActivo,
                    config.antiTrampaMiniRetosActivo,
                    config.retoBloquearCambioPestanaFoco,
                    config.retoSuspenderCopiaPegadoInyeccion,
                    config.retoBiometriaTecleoAntiCopia,
                    config.retoExigirPantallaCompleta
                  ]}
                  compact
                />
              </div>
              <button
                type="button"
                onClick={() => setAntiCheatControlModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Listo / Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: PRIMER INGRESO DOCENTE - SOLICITAR CAMBIO DE CONTRASEÑA ================= */}
      {firstLoginPromptOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-slate-900">
              <Key className="w-5 h-5 text-sky-700" />
              <h3 className="text-lg font-bold">
                Seguridad de Primer Ingreso: Actualizar Clave Docente
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ha ingresado con la credencial predeterminada (<code>DOCENTE2026</code>). Por seguridad institucional, se recomienda personalizar su contraseña docente ahora o mantenerla bajo su custodia.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ ...config, requiereCambioClaveInicial: false });
                  setFirstLoginPromptOpen(false);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Recordar más tarde
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConfig({ ...config, requiereCambioClaveInicial: false });
                  setFirstLoginPromptOpen(false);
                  setActiveTab('seguridad_correo');
                }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
              >
                Ir a Cambiar Contraseña Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: BUSCADOR GLOBAL Y PALETA DE COMANDOS RÁPIDOS (CTRL + K) ================= */}
      {commandPaletteOpen &&
        (() => {
          const q = commandPaletteQuery.trim().toLowerCase();

          const quickCommands = [
            {
              id: 'cmd_projector',
              label: 'Abrir Modo «Clase en Curso» (Vista Proyector / Videobeam)',
              category: 'Aula en Vivo',
              keywords: 'proyector videobeam pantalla gigante pin qr cronometro clase',
              action: () => {
                setCommandPaletteOpen(false);
                setProjectorModeOpen(true);
              }
            },
            {
              id: 'cmd_open_class1',
              label: 'Abrir Llamado de Asistencia en Vivo y Riesgo Integral (Monitor Vivo)',
              category: 'Asistencia',
              keywords: 'abrir clase 1 2 3 asistencia llamado alerta whatsapp monitor vivo riesgo integral',
              action: () => {
                setCommandPaletteOpen(false);
                setActiveTab('monitor_vivo');
              }
            },
            {
              id: 'cmd_export_csv',
              label: 'Exportar CSV de Nómina y Calificaciones Oficiales',
              category: 'Exportación',
              keywords: 'exportar csv excel planilla notas descargar',
              action: () => {
                setCommandPaletteOpen(false);
                exportNominaAndGradesCsv();
              }
            },
            {
              id: 'cmd_export_xlsx',
              label: 'Exportar Archivo Excel (.xlsx) Oficial del Curso',
              category: 'Exportación',
              keywords: 'exportar excel xlsx sabana notas',
              action: () => {
                setCommandPaletteOpen(false);
                exportNominaAndGradesExcel();
              }
            },
            {
              id: 'cmd_unlock_all',
              label: `Desbloquear Todos los Exámenes de la Nómina (${students.length} estudiantes)`,
              category: 'Seguridad',
              keywords: 'desbloquear todos examenes alumnos habilitar',
              action: () => {
                setCommandPaletteOpen(false);
                setSelectedStudentIdsForBatch(students.map((s) => s.id));
                handleBatchBlockOrUnblockAllExams(false);
              }
            },
            {
              id: 'cmd_heatmap',
              label: 'Ver Mapa de Calor (Heatmap) y Resumen de Asistencia',
              category: 'Analítica',
              keywords: 'heatmap mapa calor ausentismo resumen asistencia fallas',
              action: () => {
                setCommandPaletteOpen(false);
                setActiveTab('resumen_asistencia');
              }
            },
            {
              id: 'cmd_convivencia',
              label: 'Ir a Seguridad y Convivencia (Infracciones Anti-Trampa)',
              category: 'Seguridad',
              keywords: 'seguridad convivencia infracciones antitrampa bloqueados',
              action: () => {
                setCommandPaletteOpen(false);
                setActiveTab('seguridad_convivencia');
              }
            },
            {
              id: 'cmd_excuses',
              label: `Revisar Excusas de Inasistencia Pendientes (${classroomCentralMetrics.pendingExcusesCount})`,
              category: 'Asistencia',
              keywords: 'excusas justificacion inasistencias pendientes revisar',
              action: () => {
                setCommandPaletteOpen(false);
                setCalificacionesWorkspaceView('vista3_ausentismo');
                setActiveTab('calificaciones');
              }
            },
            {
              id: 'cmd_schedules',
              label: 'Configurar Bloques Horarios Recurrentes por Asignatura',
              category: 'Configuración',
              keywords: 'bloques horarios recurrentes automatizacion calendario',
              action: () => {
                setCommandPaletteOpen(false);
                setActiveTab('seguridad_correo');
              }
            }
          ];

          const filteredCommands = q
            ? quickCommands.filter(
                (c) =>
                  c.label.toLowerCase().includes(q) ||
                  c.category.toLowerCase().includes(q) ||
                  c.keywords.includes(q)
              )
            : quickCommands;

          const filteredModules = q
            ? allLmsModules.filter(
                (m) =>
                  m.label.toLowerCase().includes(q) ||
                  m.subtitle.toLowerCase().includes(q)
              )
            : allLmsModules.slice(0, 6);

          const filteredStudents = q
            ? students
                .filter(
                  (s) =>
                    s.nombre.toLowerCase().includes(q) ||
                    s.id.toLowerCase().includes(q) ||
                    s.codigoAcceso.toLowerCase().includes(q)
                )
                .slice(0, 8)
            : students.filter((s) => s.suspendido).slice(0, 4);

          return (
            <div
              className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start justify-center p-4 pt-14 overflow-y-auto"
              onClick={(e) => {
                if (e.target === e.currentTarget) setCommandPaletteOpen(false);
              }}
            >
              <div className="bg-white border-2 border-indigo-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
                  <Search className="w-5 h-5 text-indigo-600 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={commandPaletteQuery}
                    onChange={(e) => setCommandPaletteQuery(e.target.value)}
                    placeholder="Escriba el nombre de un estudiante o comando (ej. 'Abrir Clase', 'Desbloquear', 'Exportar CSV', 'Proyector')..."
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                  {commandPaletteQuery && (
                    <button
                      type="button"
                      onClick={() => setCommandPaletteQuery('')}
                      className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-200 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCommandPaletteOpen(false)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    ESC ✕
                  </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-4 space-y-5 text-xs">
                  {/* 1. Acciones y Comandos Rápidos */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase font-extrabold text-indigo-700">
                      ⚡ Comandos Rápidos de Aula ({filteredCommands.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredCommands.map((cmd) => (
                        <button
                          key={cmd.id}
                          type="button"
                          onClick={cmd.action}
                          className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/60 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <span className="font-bold text-slate-900">{cmd.label}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] shrink-0">
                            {cmd.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Estudiantes Coincidentes (Desbloqueo Rápido, Auditoría o Búsqueda) */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase font-extrabold text-emerald-800">
                      🎓 Estudiantes ({q ? `${filteredStudents.length} encontrados` : 'Acceso rápido / Suspendidos'})
                    </div>
                    {filteredStudents.length === 0 ? (
                      <div className="text-slate-500 italic">
                        Escriba el nombre o documento de cualquier estudiante para saltar a su ficha o desbloquearlo.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {filteredStudents.map((st) => (
                          <div
                            key={st.id}
                            className="p-2.5 bg-white hover:bg-slate-50 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{st.nombre}</span>
                              <span className="ml-2 font-mono text-[11px] text-slate-500">
                                ID: {st.id} · Cód: {st.codigoAcceso}
                              </span>
                              {st.suspendido && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-mono text-[10px] font-bold">
                                  BLOQUEADO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {st.suspendido && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    executeManualAntiCheatUnlock(st.id);
                                    setCommandPaletteOpen(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  🔓 Desbloquear {st.nombre.split(' ')[0]}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCommandPaletteOpen(false);
                                  setStudentSearch(st.id);
                                  setActiveTab('estudiantes');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] cursor-pointer"
                              >
                                Ver en Nómina →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Saltar a Módulos del Panel Docente */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase font-extrabold text-slate-500">
                      🧭 Navegación Directa a Módulos ({filteredModules.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {filteredModules.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => {
                            setCommandPaletteOpen(false);
                            setActiveTab(mod.id);
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50/50 text-left cursor-pointer"
                        >
                          <div className="font-bold text-slate-900 truncate">{mod.shortLabel}</div>
                          <div className="text-[10px] text-slate-500 truncate">{mod.badge}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ================= MODO «CLASE EN CURSO» (VISTA PROYECTOR / PANTALLA DE AULA LIMPIA SIN DATOS SENSIBLES) ================= */}
      {projectorModeOpen &&
        (() => {
          const activeClassDefs =
            Array.isArray(effectiveAcademicDataset.classSessions) &&
            effectiveAcademicDataset.classSessions.length > 0
              ? effectiveAcademicDataset.classSessions
              : [{ id: 1 as ClassSessionId, code: 'C1', shortTitle: 'Clase 1' }];

          // Detectar si hay un llamado de asistencia activo en alguna clase
          let activeRollCallClassId: ClassSessionId = activeClassDefs[0].id;
          let maxExpiresMs = 0;
          let confirmedNames: string[] = [];
          let targetedCount = 0;

          effectiveAcademicDataset.records.forEach((rec) => {
            activeClassDefs.forEach((cs) => {
              const c = rec.clases?.[cs.id];
              if (!c) return;
              const exp = Number(c.llamadoVirtualExpiraMs || 0);
              if (c.llamadoVirtualActivo && exp > maxExpiresMs) {
                maxExpiresMs = exp;
                activeRollCallClassId = cs.id;
              }
            });
          });

          const currentClassDef =
            activeClassDefs.find((c) => c.id === activeRollCallClassId) || activeClassDefs[0];

          effectiveAcademicDataset.records.forEach((rec) => {
            const c = rec.clases?.[currentClassDef.id];
            if (!c) return;
            const isConfirmed =
              c.asistenciaB1Estado === 'presente_virtual' ||
              c.asistenciaB1Estado === 'presente_manual' ||
              c.asistenciaB2Estado === 'presente_virtual' ||
              c.asistenciaB2Estado === 'presente_manual';
            if (isConfirmed) {
              // Solo primer nombre e inicial del apellido para privacidad en el proyector del salón
              const parts = (rec.nombre || '').trim().split(/\s+/);
              const safePublicName =
                parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
              confirmedNames.push(safePublicName);
            }
            if (c.llamadoVirtualActivo || isConfirmed) {
              targetedCount += 1;
            }
          });

          const totalRosterCount = Math.max(1, effectiveAcademicDataset.records.length || students.length);
          const remainingRollCallSec =
            maxExpiresMs > projectorNowMs
              ? Math.max(0, Math.ceil((maxExpiresMs - projectorNowMs) / 1000))
              : projectorCustomTimerSec;

          const displayMins = String(Math.floor(remainingRollCallSec / 60)).padStart(2, '0');
          const displaySecs = String(remainingRollCallSec % 60).padStart(2, '0');
          const confirmedPct = Math.min(
            100,
            Math.round((confirmedNames.length / totalRosterCount) * 100)
          );

          const pinCode = config.pinAulaDia || 'AULA26';

          return (
            <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 overflow-y-auto select-none">
              {/* Barra Superior del Modo Proyector */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 font-mono text-xs font-extrabold uppercase">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>MODO «CLASE EN CURSO» · VISTA PROYECTOR DE AULA (SIN DATOS SENSIBLES)</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                    {activeCourseMeta.nombreCurso} ({activeCourseMeta.codigoCurso})
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-xs">
                    <span className="px-2 font-mono text-slate-400">Cronómetro Aula:</span>
                    {[180, 300, 600].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setProjectorCustomTimerSec(sec);
                          setProjectorCustomTimerRunning(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 font-mono font-bold text-white cursor-pointer"
                      >
                        {sec / 60} min
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setProjectorModeOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm cursor-pointer shadow-lg"
                  >
                    Salir de Vista Proyector ✕
                  </button>
                </div>
              </div>

              {/* Cuerpo Central Gigante para Proyección en TV / Videobeam */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto py-6 items-center">
                {/* Columna 1 (4 cols): PIN Gigante y Código QR Dinámico de Aula */}
                <div className="lg:col-span-4 bg-slate-900/90 border-2 border-indigo-500/40 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
                  <div className="text-xs font-mono uppercase tracking-widest text-indigo-300 font-extrabold">
                    PIN OFICIAL DE AULA Y CÓDIGO DINÁMICO
                  </div>
                  <div className="py-4 px-6 rounded-2xl bg-slate-950 border-2 border-amber-400/60 font-mono text-4xl sm:text-5xl font-black tracking-widest text-amber-300">
                    {pinCode}
                  </div>

                  {/* Representación Visual QR Dinámico de Aula */}
                  <div className="w-44 h-44 mx-auto bg-white p-3 rounded-2xl flex flex-col items-center justify-center shadow-inner">
                    <svg viewBox="0 0 100 100" className="w-full h-full text-slate-950">
                      <rect x="5" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" />
                      <rect x="13" y="13" width="12" height="12" fill="currentColor" />
                      <rect x="67" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" />
                      <rect x="75" y="13" width="12" height="12" fill="currentColor" />
                      <rect x="5" y="67" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" />
                      <rect x="13" y="75" width="12" height="12" fill="currentColor" />
                      <rect x="42" y="12" width="8" height="8" fill="currentColor" />
                      <rect x="52" y="22" width="8" height="16" fill="currentColor" />
                      <rect x="40" y="42" width="20" height="20" fill="currentColor" />
                      <rect x="12" y="44" width="18" height="8" fill="currentColor" />
                      <rect x="68" y="44" width="12" height="16" fill="currentColor" />
                      <rect x="44" y="70" width="14" height="22" fill="currentColor" />
                      <rect x="66" y="68" width="24" height="10" fill="currentColor" />
                      <rect x="74" y="82" width="16" height="12" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="text-xs text-slate-300 font-mono">
                    Ingrese a su Portal del Estudiante y confirme asistencia con un solo clic
                  </div>
                </div>

                {/* Columna 2 (4 cols): Cronómetro Gigante del Llamado de Asistencia / Reto Relámpago */}
                <div className="lg:col-span-4 bg-slate-900/90 border-2 border-emerald-500/40 rounded-3xl p-6 text-center space-y-5 shadow-2xl">
                  <div className="text-xs font-mono uppercase tracking-widest text-emerald-300 font-extrabold">
                    CRONÓMETRO EN VIVO · {currentClassDef.code} ({currentClassDef.shortTitle})
                  </div>
                  <div
                    className={`py-8 px-4 rounded-2xl border-2 font-mono text-6xl sm:text-7xl font-black tabular-nums tracking-tight ${
                      remainingRollCallSec > 0
                        ? 'bg-emerald-950/60 border-emerald-400 text-emerald-300 animate-pulse'
                        : 'bg-slate-950 border-slate-700 text-slate-400'
                    }`}
                  >
                    {displayMins}:{displaySecs}
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    {remainingRollCallSec > 0
                      ? '⏳ Llamado de asistencia o actividad relámpago en curso'
                      : 'Seleccione 3, 5 o 10 min arriba o inicie llamado desde el Hub'}
                  </div>
                </div>

                {/* Columna 3 (4 cols): Contador en Vivo de Estudiantes que ya Confirmaron Asistencia */}
                <div className="lg:col-span-4 bg-slate-900/90 border-2 border-sky-500/40 rounded-3xl p-6 space-y-5 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-widest text-sky-300 font-extrabold">
                      ASISTENCIA CONFIRMADA EN VIVO
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 font-mono text-xs font-extrabold">
                      {confirmedPct}% del salón
                    </span>
                  </div>

                  <div className="text-center py-2">
                    <div className="text-5xl sm:text-6xl font-black font-mono text-white tabular-nums">
                      {confirmedNames.length}{' '}
                      <span className="text-2xl text-slate-400">/ {totalRosterCount}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      estudiantes han registrado su asistencia hoy
                    </div>
                  </div>

                  <div className="w-full h-4 rounded-full bg-slate-800 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500"
                      style={{ width: `${confirmedPct}%` }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-mono text-slate-400 uppercase font-bold">
                      Confirmaciones recientes (Privacidad protegida):
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                      {confirmedNames.length === 0 ? (
                        <span className="text-xs text-slate-500 italic">
                          Esperando confirmaciones desde los dispositivos estudiantiles...
                        </span>
                      ) : (
                        confirmedNames.map((name, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 font-mono text-xs font-bold"
                          >
                            ✓ {name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pie del Modo Proyector */}
              <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
                <span>
                  🔒 Modo Proyector Seguro: Las calificaciones individuales, documentos e historial de convivencia están ocultos.
                </span>
                <span>EvaluaPlus LMS · Sincronización en tiempo real</span>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
