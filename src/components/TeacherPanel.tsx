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
  StudentRetoModuleProgress
} from '../types';
import { generateDeterministicAccessCode } from '../data/students';
import { normalizeQuestionList, INITIAL_QUESTIONS } from '../data/questions';
import { ABProAndMultiCutGradebook } from './ABProAndMultiCutGradebook';
import { TeacherMiniRetosManager } from './TeacherMiniRetosManager';
import { TeacherGroupStatisticsView } from './TeacherGroupStatisticsView';
import { TeacherRealtimeSummaryPanel } from './TeacherRealtimeSummaryPanel';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import { useAuthSession } from '../context/AuthContext';
import { OFFICIAL_BADGES, getDefaultRetoProgress } from '../utils/miniRetosEngine';
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
  Save
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
  onSessionActiveChange?: (active: boolean) => void;
  logoutSignal?: number;
  customMiniRetos?: CustomMiniRetoTemplate[];
  onUpdateCustomMiniRetos?: React.Dispatch<React.SetStateAction<CustomMiniRetoTemplate[]>>;
  onFullSystemRestore?: (payload: {
    students?: StudentRecord[];
    questions?: Question[];
    attempts?: ExamAttemptResult[];
    abproEvaluations?: ABProProjectEvaluation[];
    config?: SystemConfig;
    customMiniRetos?: CustomMiniRetoTemplate[];
  }) => Promise<void>;
  onForceServerSync?: () => void;
}

type TeacherTab =
  | 'monitor_vivo'
  | 'estudiantes'
  | 'calificaciones'
  | 'estadisticas_grupo'
  | 'mini_retos'
  | 'consolidado_abpro'
  | 'diagnostico'
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
  onSessionActiveChange,
  logoutSignal,
  customMiniRetos = [],
  onUpdateCustomMiniRetos = () => {},
  onFullSystemRestore,
  onForceServerSync
}: TeacherPanelProps) {
  // Teacher Authentication State (Persisted across page reloads via AuthContext + sessionStorageWrapper)
  const {
    authState,
    loginTeacher,
    logoutTeacher,
    loginStudent,
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

  // Active Tab (Persisted across page reloads via AuthContext)
  const [activeTab, setActiveTabState] = useState<TeacherTab>(
    () => (authState.teacherActiveTab as TeacherTab) || 'estudiantes'
  );
  const setActiveTab = (tab: TeacherTab) => {
    setActiveTabState(tab);
    setTeacherActiveTab(tab);
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
    handleExecuteServerSave
  } = useServerSave();

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
      fetch(`/api/state/student/${encodeURIComponent(singleUpdatedStudent.id)}`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: singleUpdatedStudent })
      }).catch(() => {});
    }
    fetch('/api/state/students', {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: nextStudents })
    }).catch(() => {});

    if (confirmationMessage) {
      setStudentUpdateBanner(confirmationMessage);
      setTimeout(() => setStudentUpdateBanner(null), 5000);
    }
  };

  const commitTeacherConfigUpdate = (nextConfig: SystemConfig) => {
    onUpdateConfig(nextConfig);
    fetch('/api/state/config', {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: nextConfig })
    }).catch(() => {});
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
  const [studentModalError, setStudentModalError] = useState<string | null>(null);

  // Bulk Import Students Modal
  const [bulkStudentModalOpen, setBulkStudentModalOpen] = useState(false);
  const [bulkStudentText, setBulkStudentText] = useState('');
  const [bulkImportStatus, setBulkImportStatus] = useState<string | null>(null);

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
  const [emailInput, setEmailInput] = useState(config.correoRecuperacion);
  const [emailSaveStatus, setEmailSaveStatus] = useState<string | null>(null);

  // Webhook Tester & Copy States
  const [webhookUrlInput, setWebhookUrlInput] = useState(config.webhookUrl);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [copiedAppsScript, setCopiedAppsScript] = useState(false);
  const [copiedBlogger, setCopiedBlogger] = useState(false);

  // Classroom Projector Mode (Full screen clean view for VideoBeam)
  const [projectorMode, setProjectorMode] = useState(false);

  // Google Sheets Retry Queue & Full System Backup (.evaluaplus.json)
  const [retrySyncStatus, setRetrySyncStatus] = useState<string | null>(null);
  const [backupRestoreStatus, setBackupRestoreStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Login Handler (Never reveals default or current password on failure; auto-routes valid students who mistakenly use the teacher login screen)
  const handleTeacherLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedId = (config.idDocente || 'DOCENTE2026').trim().toUpperCase();
    const enteredId = teacherIdAttempt.trim().replace(/[\s.-]/g, '').toUpperCase();
    const enteredPin = pinAttempt.trim();

    // Check if a student accidentally entered their valid Student ID + Access Code on the Teacher Login form
    const matchedStudent = students.find(
      (s) => s.id.trim().replace(/[\s.-]/g, '').toUpperCase() === enteredId
    );
    if (
      matchedStudent &&
      (matchedStudent.codigoAcceso.trim().toUpperCase() === enteredPin.toUpperCase() ||
        (enteredId === '1000000000' &&
          (enteredPin.toUpperCase() === '1000000000' ||
            enteredPin.toUpperCase() === 'MM260000DEMO' ||
            enteredPin.toUpperCase() === 'DEMO2026')))
    ) {
      setAuthDenied(false);
      loginStudent(matchedStudent.id);
      onSwitchToStudentLogin?.();
      return;
    }

    if (
      !enteredId ||
      !enteredPin ||
      (enteredId !== expectedId && enteredId !== 'DOCENTE2026') ||
      enteredPin !== config.claveDocente
    ) {
      setAuthDenied(true);
      return;
    }
    setAuthDenied(false);
    setIsAuthenticated(true);
    loginTeacher(enteredId);
    onForceServerSync?.();
    if (config.claveDocente === 'DOCENTE2026' && config.requiereCambioClaveInicial !== false) {
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
        s.codigoAcceso.toLowerCase().includes(q);

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

  // Consolidated Academic Report per Student (Attempt 1, Attempt 2, Highest Definitive Grade)
  const consolidatedGrades = useMemo(() => {
    return students.map((st) => {
      const stAttempts = attempts
        .filter((a) => a.studentId === st.id)
        .sort((a, b) => a.intentoNumero - b.intentoNumero);
      const att1 = stAttempts.find((a) => a.intentoNumero === 1) || null;
      const att2 = stAttempts.find((a) => a.intentoNumero === 2) || null;

      let definitiva = 0.0;
      if (st.suspendido) {
        definitiva = 0.0;
      } else if (att1 && att2) {
        definitiva = Math.max(att1.notaColombiana, att2.notaColombiana);
      } else if (att1) {
        definitiva = att1.notaColombiana;
      } else if (att2) {
        definitiva = att2.notaColombiana;
      }

      const concepto: 'SUSPENDIDO' | 'APROBADO' | 'REPROBADO' | 'SIN PRESENTAR' = st.suspendido
        ? 'SUSPENDIDO'
        : st.intentosUsados === 0
        ? 'SIN PRESENTAR'
        : definitiva >= 3.0
        ? 'APROBADO'
        : 'REPROBADO';

      return {
        student: st,
        att1,
        att2,
        definitiva,
        concepto
      };
    });
  }, [students, attempts]);

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
    commitTeacherStudentsUpdate(students.filter((s) => !toRemove.has(s.id)));
    onUpdateAttempts(attempts.filter((a) => !toRemove.has(a.studentId)));
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
    const allModalities: ExamModality[] = ['integral', 'mod1', 'mod2', 'mod3', 'mod4', 'mod5'];
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
    const allMods: ExamModality[] = ['integral', 'mod1', 'mod2', 'mod3', 'mod4', 'mod5'];
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
    commitTeacherStudentsUpdate(students.filter((s) => s.id !== studentId));
    onUpdateAttempts(attempts.filter((a) => a.studentId !== studentId));
    setConfirmDeleteStudentId(null);
  };

  // Open Add / Edit Student Modal
  const openAddStudentModal = () => {
    setEditingOriginalId(null);
    setFormStudentId('');
    setFormStudentName('');
    setFormStudentCode('');
    setStudentModalError(null);
    setStudentModalOpen(true);
  };

  const openEditStudentModal = (st: StudentRecord) => {
    setEditingOriginalId(st.id);
    setFormStudentId(st.id);
    setFormStudentName(st.nombre);
    setFormStudentCode(st.codigoAcceso);
    setStudentModalError(null);
    setStudentModalOpen(true);
  };

  const originalEditingStudent = editingOriginalId
    ? students.find((s) => s.id === editingOriginalId) || null
    : null;
  const pendingStudentModalChange = editingOriginalId
    ? Boolean(
        originalEditingStudent &&
          (formStudentId.trim() !== originalEditingStudent.id.trim() ||
            formStudentName.trim() !== originalEditingStudent.nombre.trim() ||
            formStudentCode.trim().toUpperCase() !==
              originalEditingStudent.codigoAcceso.trim().toUpperCase())
      )
    : Boolean(formStudentId.trim() && formStudentName.trim());

  const handleSaveStudentModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingStudentModalChange || isSavingStudentModal) return;

    const cleanId = formStudentId.trim();
    const cleanName = formStudentName.trim();
    const cleanCode = (
      formStudentCode.trim() || generateDeterministicAccessCode(cleanId)
    ).toUpperCase();

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
            updatedRecord = { ...s, id: cleanId, nombre: cleanName, codigoAcceso: cleanCode };
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
    const cleanCode = (rawCodeValue ?? studentCodeDrafts[student.id] ?? student.codigoAcceso)
      .trim()
      .toUpperCase();
    const hasPendingChange = cleanCode !== student.codigoAcceso.trim().toUpperCase();
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

  const pendingPinAulaChange =
    pinAulaDraft.trim().toUpperCase() !== (config.pinAulaDia || '').trim().toUpperCase();

  const handleSavePinAula = async () => {
    if (!pendingPinAulaChange || isSavingPinAula) return;
    const cleanPin = pinAulaDraft.trim().toUpperCase() || 'AULA26';
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
    mensajeSalaDraft.trim() !== (config.mensajeSalaEspera || '').trim();

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
    if (!pendingPinAulaChange || isSavingPinAula || pinAulaDraft.trim().length < 3) return;
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
        const clean = draftVal.trim().toUpperCase();
        if (clean.length >= 4 && clean.length <= 24 && clean !== st.codigoAcceso.trim().toUpperCase()) {
          void handleSaveDirectStudentCode(st, clean);
          break;
        }
      }
    }, 750);
    return () => clearTimeout(timer);
  }, [studentCodeDrafts, students, savingStudentCodeId]);

  // Bulk Import Students Handler (Excel / CSV)
  const handleBulkImportStudents = () => {
    const lines = bulkStudentText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkImportStatus('Pegue al menos una fila con ID y Nombre.');
      return;
    }

    const existingIds = new Set(students.map((s) => s.id.toUpperCase()));
    const added: StudentRecord[] = [];
    let updatedCount = 0;
    const updatedMap = new Map<string, StudentRecord>();

    lines.forEach((line) => {
      const parts = line.split(/[;,\t|]+/).map((p) => p.trim());
      const rawId = parts[0]?.replace(/[^a-zA-Z0-9]/g, '');
      if (!rawId || rawId.toLowerCase() === 'id' || rawId.toLowerCase() === 'documento') return;

      const nombre = parts[1] || `Estudiante ${rawId}`;
      const customCode = parts[2] && parts[2].length === 12 ? parts[2].toUpperCase() : generateDeterministicAccessCode(rawId);

      if (existingIds.has(rawId.toUpperCase())) {
        updatedCount++;
        const current = students.find((s) => s.id.toUpperCase() === rawId.toUpperCase())!;
        updatedMap.set(rawId.toUpperCase(), {
          ...current,
          nombre,
          codigoAcceso: customCode
        });
      } else {
        existingIds.add(rawId.toUpperCase());
        added.push({
          id: rawId,
          nombre,
          codigoAcceso: customCode,
          intentosUsados: 0,
          suspendido: false,
          conceptoInfraccion: '✓ Sin infracciones',
          preguntasIntento1: [],
          preguntasIntento2: []
        });
      }
    });

    const merged = students.map((s) => updatedMap.get(s.id.toUpperCase()) || s);
    onUpdateStudents([...added, ...merged]);
    setBulkImportStatus(
      `Importación completada: ${added.length} estudiantes nuevos creados y ${updatedCount} actualizados con sus códigos de 12 caracteres.`
    );
    setBulkStudentText('');
  };

  // CSV Export Helpers
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
      'Código Acceso (12 Car.)',
      'Intentos Usados',
      'Nota Intento 1 (0.0-5.0)',
      'Nota Intento 2 (0.0-5.0)',
      'Nota Definitiva Oficial',
      'Concepto Académico',
      'Suspensión / Infracción y Concepto'
    ];
    const rows = consolidatedGrades.map((cg) => [
      cg.student.id,
      cg.student.nombre,
      cg.student.codigoAcceso,
      String(cg.student.intentosUsados),
      cg.att1 ? cg.att1.notaColombiana.toFixed(1) : '-',
      cg.att2 ? cg.att2.notaColombiana.toFixed(1) : '-',
      cg.student.intentosUsados > 0 || cg.student.suspendido ? cg.definitiva.toFixed(1) : '-',
      cg.concepto,
      cg.student.suspendido ? `⚠️ Suspendido: ${cg.student.conceptoInfraccion}` : cg.student.conceptoInfraccion
    ]);
    downloadCsvFile('Calificaciones_y_Nomina_EvaluaPlus_LaDorada.csv', [header, ...rows]);
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
    setEditingQuestionId(q.id);
    setFormQId(q.id);
    setFormQMod(q.modulo);
    setFormQTipoPregunta(q.tipoPregunta || 'Selección Múltiple con Única Respuesta');
    setFormQRap(q.rap || `RAP-M${q.modulo}: Competencia del Módulo ${q.modulo}`);
    setFormQContexto(q.contexto || `Caso comercial aplicado en La Dorada (Módulo ${q.modulo})`);
    setFormQTema(q.tema);
    setFormQBloom(q.bloom);
    setFormQEnunciado(q.enunciado);
    setFormQA(q.opciones.A);
    setFormQB(q.opciones.B);
    setFormQC(q.opciones.C);
    setFormQD(q.opciones.D);
    setFormQCorrecta(q.correcta);
    setFormQJustificacion(q.justificacion);
    setQModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const newQ: Question = {
      id: formQId.trim() || `MM-M${formQMod}-${Date.now()}`,
      modulo: formQMod,
      tema: formQTema.trim() || `Módulo ${formQMod}`,
      bloom: formQBloom,
      enunciado: formQEnunciado.trim(),
      tipoPregunta: formQTipoPregunta.trim() || 'Selección Múltiple con Única Respuesta',
      nivel: formQBloom,
      rap: formQRap.trim() || `RAP-M${formQMod}: Competencia del Módulo ${formQMod}`,
      contexto: formQContexto.trim() || `Contexto comercial en La Dorada, Caldas`,
      pregunta: formQEnunciado.trim(),
      opciones: {
        A: formQA.trim(),
        B: formQB.trim(),
        C: formQC.trim(),
        D: formQD.trim()
      },
      correcta: formQCorrecta,
      justificacion: formQJustificacion.trim()
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
      // Fallback: parse semicolon-delimited lines: Modulo;Tema;Enunciado;A;B;C;D;Correcta;Justificacion (or 11 columns with ID and Bloom)
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: Question[] = [];
    lines.forEach((line, idx) => {
      const p = line.split(';').map((x) => x.trim().replace(/^"|"$/g, ''));
      if (
        p[0]?.toLowerCase() === 'id pregunta' ||
        p[0]?.toLowerCase() === 'módulo' ||
        p[0]?.toLowerCase() === 'modulo'
      ) {
        return; // skip header row
      }
      if (p.length >= 11) {
        const modNum = (Number(p[1]) >= 1 && Number(p[1]) <= 5 ? Number(p[1]) : 1) as 1 | 2 | 3 | 4 | 5;
        const validBlooms: BloomLevel[] = ['Conocer', 'Comprensión', 'Aplicación', 'Análisis', 'Evaluación'];
        const bloomVal = validBlooms.includes(p[3] as BloomLevel) ? (p[3] as BloomLevel) : 'Aplicación';
        added.push({
          id: p[0] || `MM-M${modNum}-LOTE${questions.length + idx + 1}`,
          modulo: modNum,
          tema: p[2] || 'Tema General',
          bloom: bloomVal,
          enunciado: p[4],
          opciones: { A: p[5], B: p[6], C: p[7], D: p[8] },
          correcta: (['A', 'B', 'C', 'D'].includes(p[9]?.toUpperCase()) ? p[9].toUpperCase() : 'A') as
            | 'A'
            | 'B'
            | 'C'
            | 'D',
          justificacion: p[10] || 'Justificación registrada en lote.'
        });
      } else if (p.length >= 8) {
        const modNum = (Number(p[0]) >= 1 && Number(p[0]) <= 5 ? Number(p[0]) : 1) as 1 | 2 | 3 | 4 | 5;
        added.push({
          id: `MM-M${modNum}-LOTE${questions.length + idx + 1}`,
          modulo: modNum,
          tema: p[1] || 'Tema General',
          bloom: 'Aplicación',
          enunciado: p[2],
          opciones: { A: p[3], B: p[4], C: p[5], D: p[6] },
          correcta: (['A', 'B', 'C', 'D'].includes(p[7]?.toUpperCase()) ? p[7].toUpperCase() : 'A') as
            | 'A'
            | 'B'
            | 'C'
            | 'D',
          justificacion: p[8] || 'Justificación registrada en lote.'
        });
      }
    });
    if (added.length > 0) {
      savePreviousQuestionsSnapshot(questions);
      const nextBank = mode === 'replace' ? added : [...added, ...questions];
      onUpdateQuestions(nextBank);
      const actionDesc =
        mode === 'replace'
          ? `Banco de Preguntas actualizado con ${added.length} reactivos desde formato CSV (;).`
          : `Se importaron ${added.length} preguntas desde formato CSV (;) (${nextBank.length} en total).`;
      setBulkQFeedback(`${actionDesc} Puede usar "Deshacer la última carga" si lo requiere.`);
      setBankActionNotice(`✓ ${actionDesc}`);
      setBulkQText('');
      setQCurrentPage(1);
    } else {
      setBulkQFeedback(
        'Formato no reconocido. Seleccione un archivo JSON válido (como BANCO_PREGUNTAS_UNIFICADO_2026 ACT.json) o consulte "Ver Estructura de Carga".'
      );
    }
  };

  const handleBulkImportQuestions = () => {
    processImportedQuestionText(bulkQText, bulkQMode);
  };

  const handleUploadQuestionFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'replace' | 'append'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      processImportedQuestionText(content, mode, file.name);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
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
    currentPassInput.trim().length > 0 &&
      newPassInput.trim().length > 0 &&
      confirmPassInput.trim().length > 0 &&
      newPassInput.trim() !== config.claveDocente
  );

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPasswordChange || isSavingPassword) return;
    if (currentPassInput !== config.claveDocente) {
      setPassChangeStatus({ type: 'err', msg: 'La contraseña actual ingresada es incorrecta.' });
      return;
    }
    if (newPassInput.trim().length < 6) {
      setPassChangeStatus({ type: 'err', msg: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setPassChangeStatus({ type: 'err', msg: 'La confirmación de la nueva contraseña no coincide.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      commitTeacherConfigUpdate({ ...config, claveDocente: newPassInput.trim() });
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

  const pendingEmailChange =
    emailInput.trim() !== (config.correoRecuperacion || '').trim() && emailInput.includes('@');
  const isSavingRecoveryEmail = isSavingEmail;

  const handleSaveRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmailChange || isSavingEmail) return;
    setIsSavingEmail(true);
    try {
      commitTeacherConfigUpdate({ ...config, correoRecuperacion: emailInput.trim() });
      await handleExecuteServerSave(
        'seguridad_y_respaldo',
        `Correo oficial (${emailInput.trim()}) guardado en BD del Servidor`
      );
      setEmailSaveStatus('✓ Dirección de correo oficial guardada y confirmada en el servidor.');
      setTimeout(() => setEmailSaveStatus(null), 4000);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const pendingWebhookChange =
    webhookUrlInput.trim() !== (config.webhookUrl || '').trim();

  const handleSaveWebhookUrl = async () => {
    if (!pendingWebhookChange || isSavingWebhook) return;
    setIsSavingWebhook(true);
    try {
      commitTeacherConfigUpdate({ ...config, webhookUrl: webhookUrlInput.trim() });
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
    if (!pendingEmailChange || isSavingEmail || !emailInput.includes('.')) return;
    const timer = setTimeout(() => {
      setIsSavingEmail(true);
      commitTeacherConfigUpdate({ ...config, correoRecuperacion: emailInput.trim() });
      void handleExecuteServerSave(
        'seguridad_y_respaldo',
        `Correo oficial (${emailInput.trim()}) actualizado automáticamente en BD del Servidor`
      ).finally(() => {
        setIsSavingEmail(false);
        setEmailSaveStatus('✓ Correo oficial actualizado automáticamente en la Base de Datos del Servidor.');
        setTimeout(() => setEmailSaveStatus(null), 4000);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [emailInput, pendingEmailChange, isSavingEmail]);

  // Guardado automático de URL de Webhook al detectar cambios
  useEffect(() => {
    if (!pendingWebhookChange || isSavingWebhook) return;
    const timer = setTimeout(() => {
      void handleSaveWebhookUrl();
    }, 800);
    return () => clearTimeout(timer);
  }, [webhookUrlInput, pendingWebhookChange, isSavingWebhook]);

  // Live Webhook Ping
  const handleTestWebhook = async () => {
    setIsSavingWebhook(true);
    setWebhookStatus('Guardando URL y enviando ping de prueba a Google Sheets Apps Script...');
    try {
      commitTeacherConfigUpdate({ ...config, webhookUrl: webhookUrlInput.trim() });
      await handleExecuteServerSave(
        'integraciones_webhook',
        'URL de Webhook Google Sheets sincronizada en BD del Servidor'
      );
      if (!webhookUrlInput.trim()) {
        setWebhookStatus('Ingrese primero la URL del Webhook desplegado en Google Apps Script.');
        return;
      }
      await fetch(webhookUrlInput.trim(), {
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

  // ================= PROTECTED TEACHER LOGIN SCREEN (NEVER EXPOSES PASSWORD) =================
  if (!isAuthenticated) {
    const mailtoHref = `mailto:${encodeURIComponent(
      config.correoRecuperacion
    )}?subject=${encodeURIComponent(
      'Solicitud de Recuperación de Clave Docente - EvaluaPlus La Dorada'
    )}&body=${encodeURIComponent(
      'Estimado Coordinador / Administrador Académico,\n\nSolicito el envío o restablecimiento de la credencial de acceso al Panel Docente de la plataforma EvaluaPlus (Asignatura: Mapeo de Mercado y Comportamiento del Consumidor - La Dorada, Caldas).\n\nAtentamente,\nDocente Titular'
    )}`;

    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          {/* Selector Dual de Rol en la Pantalla Inicial */}
          {onSwitchToStudentLogin && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={onSwitchToStudentLogin}
                className="py-2.5 px-3 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-white/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Iniciar como Estudiante</span>
              </button>
              <button
                type="button"
                className="py-2.5 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Iniciar como Docente</span>
              </button>
            </div>
          )}

          <div className="space-y-2 text-center">
            <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Acceso al Panel Docente</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ingrese su ID de Docente y Código de Acceso de Sesión para ingresar al panel de control educativo.
            </p>
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
                Código de Acceso de Sesión (Clave Docente)
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
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-colors"
            >
              Iniciar Sesión / Ingresar al Panel Administrativo
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

  // ================= MAIN TEACHER DASHBOARD VIEW =================
  return (
    <div className="w-full max-w-[1640px] mx-auto px-2 sm:px-4 lg:px-6 py-5 space-y-6 overflow-x-hidden">
      {/* Top Bar: Master Classroom Controls & Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Sesión Docente Activa · Bienvenido(a), Docente Titular ({config.idDocente || 'DOCENTE2026'})</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Centro de Control Académico y Supervisión de Aula (Marketing Digital PRU)
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => triggerPrintView('fichas_aula')}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-sky-700" />
              <span>Imprimir Fichas para Aula</span>
            </button>

            <button
              type="button"
              onClick={() => triggerPrintView('acta_oficial')}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Generar Acta Oficial (PDF / Imprimir)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('seguridad_correo')}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Cambiar Contraseña / Seguridad</span>
            </button>

            <button
              type="button"
              onClick={() => {
                logoutTeacher();
                setIsAuthenticated(false);
                setTeacherIdAttempt('');
                setPinAttempt('');
                setAuthDenied(false);
              }}
              className="px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="Cerrar sesión docente para volver a la pantalla inicial y elegir dónde iniciar sesión"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cerrar Sesión Docente</span>
            </button>
          </div>
        </div>

        {/* Master Switches: Exam Open/Closed, Daily Classroom PIN, Immediate Feedback, Option Shuffling */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Master Switch Open/Close Exam (Global o Por Estudiante) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
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
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                  masterClosedCount === 0
                    ? 'bg-emerald-100 text-emerald-900'
                    : masterOpenCount === 0
                    ? 'bg-red-100 text-red-900'
                    : 'bg-sky-100 text-sky-900'
                }`}
              >
                {masterClosedCount === 0
                  ? 'ABIERTO'
                  : masterOpenCount === 0
                  ? 'CERRADO'
                  : 'POR ALUMNO'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleMasterOpenAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  masterClosedCount === 0
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                }`}
                title="Habilitar (ABIERTO) el Estado Maestro del Examen para todos los estudiantes"
              >
                ● ABIERTO (Todos)
              </button>

              <button
                type="button"
                onClick={handleMasterCloseAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  masterOpenCount === 0
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white border border-red-300 text-red-800 hover:bg-red-50'
                }`}
                title="Deshabilitar (CERRADO) el Estado Maestro del Examen para todos los estudiantes"
              >
                ■ CERRADO (Todos)
              </button>

              <button
                type="button"
                onClick={() => {
                  setMasterExamNotice(null);
                  setMasterExamSelectorModalOpen(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                title="Seleccionar a qué estudiantes habilitar (ABIERTO) o deshabilitar (CERRADO)"
              >
                <Users className="w-3.5 h-3.5 text-sky-300" />
                <span>
                  Seleccionar Estudiantes ({masterOpenCount} Abiertos / {masterClosedCount} Cerrados)
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
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between gap-2">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">PIN de Aula del Día</span>
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ ...config, exigirPinAula: !config.exigirPinAula })}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    config.exigirPinAula
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {config.exigirPinAula ? 'Exigido' : 'Opcional'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`w-24 px-2 py-1 text-xs font-mono font-bold uppercase bg-white border rounded ${
                    pendingPinAulaChange ? 'border-amber-500 ring-1 ring-amber-400' : 'border-slate-300'
                  }`}
                  aria-label="PIN de Aula del Día"
                />
                <button
                  type="button"
                  disabled={!pendingPinAulaChange || isSavingPinAula}
                  onClick={handleSavePinAula}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isSavingPinAula ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
              </div>
              {pendingPinAulaChange && (
                <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Actualizando automáticamente en BD del Servidor...</span>
                </div>
              )}
            </div>
            <OptionServerSaveBar
              sectionKey="pin_aula_dia"
              label="PIN de Aula del Día"
              watchValue={[config.exigirPinAula, config.pinAulaDia]}
              compact
            />
          </div>

          {/* 3. Immediate vs Deferred Pedagogical Feedback (Global o Por Estudiante) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900">Retroalimentación</div>
                <div className="text-[11px] font-medium text-slate-600">
                  {feedbackDeferredCount === 0 ? (
                    <span className="text-sky-700 font-semibold">
                      ● INMEDIATA PARA TODOS ({feedbackImmediateCount}/{students.length})
                    </span>
                  ) : feedbackImmediateCount === 0 ? (
                    <span className="text-amber-700 font-semibold">
                      ■ DIFERIDA PARA TODOS (0/{students.length})
                    </span>
                  ) : (
                    <span className="text-sky-800 font-semibold">
                      ◐ SELECTIVO: {feedbackImmediateCount} Inmediata · {feedbackDeferredCount} Diferida
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                  feedbackDeferredCount === 0
                    ? 'bg-sky-100 text-sky-900'
                    : feedbackImmediateCount === 0
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-purple-100 text-purple-900'
                }`}
              >
                {feedbackDeferredCount === 0
                  ? 'INMEDIATA'
                  : feedbackImmediateCount === 0
                  ? 'DIFERIDA'
                  : 'POR ALUMNO'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleFeedbackImmediateAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  feedbackDeferredCount === 0
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white border border-sky-300 text-sky-800 hover:bg-sky-50'
                }`}
                title="Habilitar (INMEDIATA) la Retroalimentación para todos los estudiantes"
              >
                ● INMEDIATA (Todos)
              </button>

              <button
                type="button"
                onClick={handleFeedbackDeferredAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  feedbackImmediateCount === 0
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-50'
                }`}
                title="Deshabilitar (DIFERIDA) la Retroalimentación para todos los estudiantes"
              >
                ■ DIFERIDA (Todos)
              </button>

              <button
                type="button"
                onClick={() => {
                  setFeedbackNotice(null);
                  setFeedbackSelectorModalOpen(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                title="Seleccionar a qué estudiantes habilitar (INMEDIATA) o deshabilitar (DIFERIDA)"
              >
                <Users className="w-3.5 h-3.5 text-sky-300" />
                <span>
                  Seleccionar Estudiantes ({feedbackImmediateCount} Inmed. / {feedbackDeferredCount} Dif.)
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

          {/* 4. Desglose Pregunta x Pregunta (Global, Por Estudiante + Restricción de Días y Horas) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
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
                      ● HABILITADO TODOS ({breakdownEnabledCount}/{students.length})
                    </span>
                  ) : breakdownEnabledCount === 0 ? (
                    <span className="text-slate-600 font-semibold">
                      ■ DESHABILITADO TODOS (0/{students.length})
                    </span>
                  ) : (
                    <span className="text-sky-800 font-semibold">
                      ◐ SELECTIVO: {breakdownEnabledCount} Hab. · {breakdownDisabledCount} Deshab.
                    </span>
                  )}
                  {' · '}
                  <span className="font-mono text-[10px] text-slate-500">
                    {config.desgloseVentanaHorariaActiva
                      ? `Horario: ${config.desgloseHoraInicio || '06:00'}-${config.desgloseHoraFin || '22:00'}`
                      : 'Sin restricción de hora'}
                  </span>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                  breakdownDisabledCount === 0
                    ? 'bg-emerald-100 text-emerald-900'
                    : breakdownEnabledCount === 0
                    ? 'bg-slate-200 text-slate-800'
                    : 'bg-sky-100 text-sky-900'
                }`}
              >
                {breakdownDisabledCount === 0
                  ? 'HABILITADO'
                  : breakdownEnabledCount === 0
                  ? 'DESHABILITADO'
                  : 'POR ALUMNO'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleBreakdownEnableAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  breakdownDisabledCount === 0
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                }`}
                title="Habilitar el Desglose Pregunta x Pregunta para todos los estudiantes"
              >
                ● HABILITAR (Todos)
              </button>

              <button
                type="button"
                onClick={handleBreakdownDisableAllStudents}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  breakdownEnabledCount === 0
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title="Deshabilitar el Desglose Pregunta x Pregunta para todos los estudiantes"
              >
                ■ DESHABILITAR (Todos)
              </button>

              <button
                type="button"
                onClick={() => {
                  setBreakdownNotice(null);
                  setBreakdownSelectorModalOpen(true);
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                title="Seleccionar estudiantes y configurar días y horas disponibles para Desglose Pregunta x Pregunta"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-300" />
                <span>
                  Estudiantes y Horario ({breakdownEnabledCount} Hab. / {breakdownDisabledCount} Deshab.)
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

        {/* Franja de Disponibilidad de Horario y Días para «Desglose Pregunta x Pregunta» */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
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
              className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
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
                <div className="flex items-center gap-1">
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
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
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
                    className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900"
                  />
                  <span className="font-sans text-slate-600 font-semibold">a:</span>
                  <input
                    type="time"
                    value={config.desgloseHoraFin || '22:00'}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, desgloseHoraFin: e.target.value })
                    }
                    className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900"
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
            className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer shrink-0"
          >
            Configurar por Estudiante y Días/Horas →
          </button>
        </div>

        {/* Programmable Time Window (Ventana Horaria) & Option Shuffling Strip */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
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
              className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                config.ventanaHorariaActiva
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {config.ventanaHorariaActiva ? 'Restricción Días y Hora Activa' : 'Sin restricción de hora'}
            </button>
            {config.ventanaHorariaActiva && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
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
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
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
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
                  />
                  <span>Hasta:</span>
                  <input
                    type="time"
                    value={config.horaFinPermitida || '22:00'}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, horaFinPermitida: e.target.value })
                    }
                    className="px-2 py-1 rounded border border-slate-300 bg-white"
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
              className={`px-2.5 py-1 rounded font-semibold ${
                config.barajarOpciones !== false
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {config.barajarOpciones !== false ? 'Activo' : 'Desactivado'}
            </button>
          </div>
        </div>

        {/* Configurador Personalizado de Examen («Constructor de Pruebas a Medida») y Detección de Pantalla Dividida */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <Shuffle className="w-4 h-4 text-sky-700" />
            <span>Constructor de Pruebas a Medida (Configurador Personalizado):</span>
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
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
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
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
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
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
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
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900"
              />
            </label>

            <label className="flex items-center gap-1.5">
              <span className="font-sans text-slate-600">Nota Mínima Aprobación:</span>
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
                className="w-16 px-2 py-1 rounded border border-slate-300 bg-white font-bold text-emerald-800"
              />
            </label>

            <button
              type="button"
              disabled={!pendingExamParamsChange || isSavingExamParams}
              onClick={handleSaveExamParams}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-sans font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isSavingExamParams ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Cambios</span>
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
              className={`px-2.5 py-1 rounded font-sans font-semibold ${
                config.exigirPantallaMaximizada !== false
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
              title="Detectar monitores secundarios o pantalla dividida (<85% del ancho)"
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

        {/* Waiting Room Custom Message Input when Exam is Closed for All or Some Students */}
        {(!config.examenAbierto || masterClosedCount > 0) && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
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
                className="flex-1 px-3 py-1.5 rounded border border-amber-300 bg-white text-slate-900"
              />
              <button
                type="button"
                disabled={!pendingMensajeSalaChange || isSavingMensajeSala}
                onClick={handleSaveMensajeSala}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isSavingMensajeSala ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {[
            { id: 'estudiantes', label: `Estudiantes y Códigos (${students.length})`, icon: Users },
            {
              id: 'monitor_vivo',
              label: `Dispositivos en Línea / Monitor Vivo (${liveSessions.length})`,
              icon: Activity
            },
            { id: 'calificaciones', label: `Calificaciones (${attempts.length})`, icon: FileSpreadsheet },
            { id: 'estadisticas_grupo', label: '📊 Estadísticas del Grupo (Recharts)', icon: BarChart3 },
            { id: 'mini_retos', label: '🏅 Mini Retos & Insignias (IA)', icon: Trophy },
            { id: 'consolidado_abpro', label: 'Multi-Corte & Proyecto ABPro', icon: Layers },
            { id: 'diagnostico', label: 'Diagnóstico & Psicometría', icon: BarChart3 },
            { id: 'banco_preguntas', label: `Banco de Preguntas (${questions.length})`, icon: BookOpen },
            { id: 'integraciones', label: 'Google Sheets, Blogger & Despliegue Web', icon: Code2 },
            { id: 'seguridad_correo', label: 'Seguridad & Respaldo', icon: Key }
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as TeacherTab)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= PANEL DE RESUMEN EN TIEMPO REAL (RECHARTS) ================= */}
      <TeacherRealtimeSummaryPanel
        students={students}
        attempts={attempts}
        liveSessions={liveSessions}
        config={config}
        onNavigateTab={(tab) => setActiveTab(tab as TeacherTab)}
        onSelectStudentForAudit={(studentId) => {
          setActiveTab('estudiantes');
          setSelectedAuditStudentId(studentId);
          setAuditActiveMode('retos');
          setAuditRetoModuloFilter('ALL');
          setTimeout(() => {
            const el = document.getElementById('auditoria-inline-estudiante');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 120);
        }}
      />

      {/* ================= TAB 1: ESTUDIANTES Y CÓDIGOS (CRUD COMPLETO + REINICIAR SIN WINDOW.CONFIRM) ================= */}
      {activeTab === 'estudiantes' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <OptionServerSaveBar
            sectionKey="nomina_estudiantes"
            label="Nómina de Estudiantes, Códigos y Bloqueo de Exámenes"
            watchValue={students.map(
              (s) =>
                `${s.id}:${s.nombre}:${s.codigoAcceso}:${s.intentosUsados}:${s.suspendido}:${(
                  s.examenesBloqueados || []
                ).join(',')}`
            )}
          />
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900">
                Nómina Oficial de Estudiantes y Códigos Determinísticos (12 Caracteres)
              </h2>
              <p className="text-xs text-slate-600">
                Estructura: Prefijo <code>MM26</code> + 4 dígitos del ID + 4 caracteres criptográficos anti-colisión. Incluye usuario de ensayo docente <code>1000000000</code> (alias <code>DEMO2026</code>).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddStudentModal}
                className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nuevo Estudiante</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBulkImportStatus(null);
                  setBulkStudentModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-sky-700" />
                <span>+ Carga Masiva (Excel / CSV)</span>
              </button>

              <button
                type="button"
                onClick={exportNominaAndGradesCsv}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-emerald-700" />
                <span>Exportar Nómina CSV</span>
              </button>

              <button
                type="button"
                disabled={selectedStudentIdsForBatch.length === 0}
                onClick={() => {
                  setBatchExamBlockNotice(null);
                  setBatchExamBlockModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 disabled:opacity-40 text-xs font-semibold text-sky-900 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                title="Editar en lote el Bloqueo / Desbloqueo de Exámenes para todos los estudiantes seleccionados"
              >
                <Lock className="w-4 h-4 text-sky-700" />
                <span>
                  Bloqueo / Desbloqueo en Lote ({selectedStudentIdsForBatch.length})
                </span>
              </button>

              {confirmBatchDeleteStudents ? (
                <div className="inline-flex items-center gap-1.5 bg-red-50 border-2 border-red-400 px-3 py-1.5 rounded-lg text-xs">
                  <span className="font-bold text-red-900">
                    ¿Eliminar {selectedStudentIdsForBatch.length} estudiante(s) en lote?
                  </span>
                  <button
                    type="button"
                    onClick={executeBatchDeleteStudents}
                    className="px-2.5 py-1 bg-red-600 text-white rounded font-bold"
                  >
                    Sí, Eliminar Lote
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBatchDeleteStudents(false)}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={selectedStudentIdsForBatch.length === 0}
                  onClick={() => setConfirmBatchDeleteStudents(true)}
                  className="px-3.5 py-2 rounded-lg border border-red-300 bg-red-50/70 hover:bg-red-100 disabled:opacity-40 text-xs font-semibold text-red-800 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>Eliminar por Lote ({selectedStudentIdsForBatch.length})</span>
                </button>
              )}
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

          {/* Barra Flotante / Contextual de Edición Masiva cuando hay estudiantes seleccionados */}
          {selectedStudentIdsForBatch.length > 0 && (
            <div className="bg-sky-50 border-2 border-sky-300 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-sky-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-sky-700" />
                  <span>
                    {selectedStudentIdsForBatch.length} estudiante(s) seleccionado(s) — Edición Masiva de «Bloqueo / Desbloqueo de Exámenes por Estudiante»
                  </span>
                </div>
                <p className="text-[11px] text-sky-900">
                  Puede bloquear o habilitar todos los exámenes a la vez para los estudiantes seleccionados, o abrir el editor detallado por módulo.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleBatchBlockOrUnblockAllExams(true)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Bloquear Todos ({selectedStudentIdsForBatch.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchBlockOrUnblockAllExams(false)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Desbloquear Todos ({selectedStudentIdsForBatch.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBatchExamBlockNotice(null);
                    setBatchExamBlockModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Exámenes por Módulo en Lote...</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStudentIdsForBatch([])}
                  className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Limpiar Selección
                </button>
              </div>
            </div>
          )}

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
                placeholder="Buscar por documento ID, nombre o código MM26..."
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
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
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

          {/* Students Table — Ajustada al 100% del ancho sin barra de desplazamiento horizontal */}
          <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full table-auto text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 leading-tight">
                  <th className="py-2.5 px-2 w-7 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredStudents.length > 0 &&
                        selectedStudentIdsForBatch.length === filteredStudents.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudentIdsForBatch(filteredStudents.map((s) => s.id));
                        } else {
                          setSelectedStudentIdsForBatch([]);
                        }
                      }}
                      aria-label="Seleccionar todos los estudiantes filtrados"
                    />
                  </th>
                  <th className="py-2.5 px-2 w-[92px]">ID Estudiante</th>
                  <th className="py-2.5 px-2.5 min-w-[130px]">Nombre Completo</th>
                  <th className="py-2.5 px-2 w-[175px]">Código de Acceso</th>
                  <th className="py-2.5 px-1.5 text-center w-[58px]">Intentos</th>
                  <th className="py-2.5 px-2 text-center w-[112px]">Insignias (5/5)</th>
                  <th className="py-2.5 px-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span>Bloqueo / Desbloqueo y Auditoría</span>
                      {selectedStudentIdsForBatch.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setBatchExamBlockNotice(null);
                            setBatchExamBlockModalOpen(true);
                          }}
                          className="px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Editar esta columna para todos los estudiantes seleccionados a la vez"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>Lote ({selectedStudentIdsForBatch.length})</span>
                        </button>
                      )}
                    </div>
                  </th>
                  <th className="py-2.5 px-2 w-[135px]">Suspensión / Concepto</th>
                  <th className="py-2.5 px-2 text-right w-[215px]">Acciones Administrativas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px] leading-snug">
                {filteredStudents.map((st) => {
                  const canReset = st.intentosUsados > 0 || st.suspendido || true;
                  const blockedCount = st.examenesBloqueados?.length || 0;
                  const isChecked = selectedStudentIdsForBatch.includes(st.id);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition-colors align-middle">
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIdsForBatch((prev) => [...prev, st.id]);
                            } else {
                              setSelectedStudentIdsForBatch((prev) =>
                                prev.filter((id) => id !== st.id)
                              );
                            }
                          }}
                          aria-label={`Seleccionar estudiante ${st.nombre}`}
                        />
                      </td>
                      <td className="py-2 px-2 font-mono font-semibold text-slate-900 break-all">
                        {st.id}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-slate-900 break-words">
                        {st.nombre}
                      </td>
                      <td className="py-2 px-2 font-mono font-bold text-sky-800">
                        {(() => {
                          const currentDraftCode =
                            studentCodeDrafts[st.id] !== undefined
                              ? studentCodeDrafts[st.id]
                              : st.codigoAcceso;
                          const pendingChange =
                            currentDraftCode.trim().toUpperCase() !==
                              st.codigoAcceso.trim().toUpperCase() &&
                            currentDraftCode.trim().length >= 4;
                          const isRowSaving =
                            savingStudentCodeId === st.id ||
                            (inlineEditingCodeStudentId === st.id && isSyncingInlineSave);

                          return (
                            <div className="space-y-1">
                              <div
                                className={`inline-flex flex-wrap items-center gap-1 rounded-lg p-1 transition-colors ${
                                  pendingChange
                                    ? 'bg-amber-50 border-2 border-amber-400 shadow-xs'
                                    : 'bg-slate-50 border border-slate-200'
                                }`}
                              >
                                <input
                                  type="text"
                                  maxLength={24}
                                  value={currentDraftCode}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setStudentCodeDrafts((prev) => ({
                                      ...prev,
                                      [st.id]: val
                                    }));
                                    if (val.trim() !== st.codigoAcceso.trim().toUpperCase()) {
                                      markSectionDirty(
                                        `codigo_acceso_${st.id}`,
                                        `Cambios Pendientes en Código de Acceso de ${st.nombre} (${val})`
                                      );
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && pendingChange && !isRowSaving) {
                                      handleSaveDirectStudentCode(st);
                                    }
                                    if (e.key === 'Escape') {
                                      setStudentCodeDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[st.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  aria-label={`Código de acceso de ${st.nombre}`}
                                  className="w-[104px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] font-mono font-bold uppercase text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                />
                                <button
                                  type="button"
                                  disabled={!pendingChange || isRowSaving}
                                  onClick={() => handleSaveDirectStudentCode(st)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${
                                    pendingChange || isRowSaving
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  }`}
                                  title={
                                    pendingChange
                                      ? 'Guardar nuevo Código de Acceso en el servidor'
                                      : 'Edite el código para habilitar Guardar Cambios'
                                  }
                                >
                                  {isRowSaving ? (
                                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <>
                                      <Save className="w-2.5 h-2.5" />
                                      <span>Guardar</span>
                                    </>
                                  )}
                                </button>
                                {pendingChange && !isRowSaving && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStudentCodeDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[st.id];
                                        return next;
                                      });
                                    }}
                                    className="px-1 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 text-[10px] font-semibold cursor-pointer"
                                    title="Descartar cambio pendiente"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              {pendingChange && (
                                <div className="text-[10px] font-sans font-bold text-amber-800 flex items-center gap-1">
                                  <RefreshCw className="w-2.5 h-2.5 text-amber-600 shrink-0 animate-spin" />
                                  <span>Auto-guardando...</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums font-semibold">
                        {st.intentosUsados}/{st.maxIntentosPermitidos ?? 2}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="inline-flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                          {OFFICIAL_BADGES.map((b) => {
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
                          {([1, 2, 3, 4, 5] as const).every(
                            (m) => st.progresoRetos?.[m]?.insigniaDesbloqueada
                          ) && (
                            <span
                              title="Distinción Especial: Maestro Estratega PRU (5/5)"
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
                              blockedCount === 6
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
                              {blockedCount === 6
                                ? '6/6 Bloq.'
                                : blockedCount > 0
                                ? `${6 - blockedCount}/6 Act. (${blockedCount} Bloq.)`
                                : '6/6 Habilitados'}
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
                                ([1, 2, 3, 4, 5] as const).reduce(
                                  (acc, m) =>
                                    acc + (st.progresoRetos?.[m]?.historialIntentos?.length || 0),
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
                                className="px-1.5 py-0.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 text-[10px]"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmResetId(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-semibold hover:bg-slate-300 text-[10px]"
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
                              className="px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 font-medium inline-flex items-center gap-1 text-[10px]"
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
                            className={`px-2 py-1 rounded-md border font-medium inline-flex items-center gap-1 text-[10px] ${
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

                          <button
                            type="button"
                            onClick={() => openEditStudentModal(st)}
                            className="px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1 text-[10px]"
                          >
                            <Edit3 className="w-3 h-3 shrink-0" />
                            <span>Editar</span>
                          </button>

                          {confirmDeleteStudentId === st.id ? (
                            <div className="inline-flex items-center gap-1 bg-red-50 border border-red-300 px-1.5 py-0.5 rounded-md">
                              <span className="text-red-900 font-semibold text-[10px]">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => executeDeleteStudent(st.id)}
                                className="px-1.5 py-0.5 bg-red-600 text-white rounded font-bold text-[10px]"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteStudentId(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded text-[10px]"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteStudentId(st.id)}
                              className="p-1 rounded-md border border-slate-200 text-red-600 hover:bg-red-50"
                              title="Eliminar estudiante"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ================= SECCIÓN INTEGRADA DE AUDITORÍA EN EL PANEL DE GESTIÓN DE ESTUDIANTES ================= */}
          <div id="auditoria-inline-estudiante" className="mt-6 border-2 border-sky-200 rounded-2xl bg-slate-50/70 p-5 space-y-4">
            {(() => {
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
                activeAuditStudent.historialIntentosRetos.filter(Boolean).forEach((att) => {
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

      {/* ================= TAB 2: MONITOR DE AULA EN VIVO (SEMÁFORO DE INTEGRIDAD + MODO PROYECCIÓN) ================= */}
      {activeTab === 'monitor_vivo' && (
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
      )}

      {/* ================= TAB: ESTADÍSTICAS DEL GRUPO (RECHARTS) ================= */}
      {activeTab === 'estadisticas_grupo' && (
        <TeacherGroupStatisticsView
          students={students}
          attempts={attempts}
          abproEvaluations={abproEvaluations}
          config={config}
        />
      )}

      {/* ================= TAB 3: CALIFICACIONES, ACTA Y DETECTOR ANTI-COPIA ================= */}
      {activeTab === 'calificaciones' && (
        <div className="space-y-6">
          <OptionServerSaveBar
            sectionKey="calificaciones_oficiales"
            label="Calificaciones Oficiales y Registro de Intentos"
            watchValue={attempts.length}
          />
          {/* Google Sheets Deferred Retry Queue Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-700" />
                <span>
                  Cola de Sincronización con Google Sheets ({pendingSheetsAttempts.length} pendientes de envío)
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Si hubo intermitencia de internet en el salón de La Dorada, reintente en lote el envío de todas las calificaciones almacenadas localmente.
              </p>
              {retrySyncStatus && (
                <div className="text-xs font-semibold text-sky-800 pt-1">{retrySyncStatus}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleRetryPendingSheetsQueue}
              className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap self-start sm:self-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sincronizar Pendientes Ahora ({pendingSheetsAttempts.length})</span>
            </button>
          </div>

          {/* Anti-Copy Pattern Detector Alert Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-sky-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Auditoría en Servidor: Detector de Sincronía Temporal y Patrones Idénticos Anti-Copia
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500">
                 entregas analizadas: {attempts.length}
              </span>
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

          {/* Grade Distribution Bar Chart Visualization */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
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

          {/* Consolidated Grades Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Consolidado Oficial de Calificaciones (Escala Colombiana 0.0 a 5.0)
                </h2>
                <p className="text-xs text-slate-600">
                  La Nota Definitiva Oficial conserva automáticamente la calificación más alta entre el Intento 1 y el Intento 2 (salvo sanción por suspensión = 0.0).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportNominaAndGradesCsv}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Planilla CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerPrintView('acta_oficial')}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Acta Oficial PDF</span>
                </button>
              </div>
            </div>

            <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full table-auto text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                    <th className="py-2.5 px-2.5">ID Estudiante</th>
                    <th className="py-2.5 px-2.5">Estudiante</th>
                    <th className="py-2.5 px-2.5 text-center">Insignias Retos (5/5)</th>
                    <th className="py-2.5 px-2.5 text-right">Intento 1</th>
                    <th className="py-2.5 px-2.5 text-right">Intento 2</th>
                    <th className="py-2.5 px-2.5 text-right">Nota Definitiva</th>
                    <th className="py-2.5 px-2.5">Estado / Concepto</th>
                    <th className="py-2.5 px-2.5">Suspensión / Infracción y Concepto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[11px]">
                  {consolidatedGrades.map((row) => (
                    <tr key={row.student.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-2.5 font-mono font-semibold text-slate-900 break-all">{row.student.id}</td>
                      <td className="py-2.5 px-2.5 font-medium text-slate-900 break-words">{row.student.nombre}</td>
                      <td className="py-2.5 px-2.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                          {OFFICIAL_BADGES.map((b) => {
                            const unlocked = Boolean(
                              row.student.progresoRetos?.[b.modulo]?.insigniaDesbloqueada
                            );
                            return (
                              <span
                                key={b.modulo}
                                title={`Módulo ${b.modulo}: ${b.tituloPrincipal} (${
                                  unlocked ? 'Desbloqueada' : 'Pendiente'
                                })`}
                                className={`text-sm ${unlocked ? 'opacity-100' : 'opacity-25 grayscale'}`}
                              >
                                {b.icono}
                              </span>
                            );
                          })}
                          {([1, 2, 3, 4, 5] as const).every(
                            (m) => row.student.progresoRetos?.[m]?.insigniaDesbloqueada
                          ) && (
                            <span
                              title="Distinción Especial: Maestro Estratega PRU (5/5)"
                              className="text-sm ml-0.5"
                            >
                              🏆
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        {row.att1 ? `${row.att1.notaColombiana.toFixed(1)} (${row.att1.porcentaje}%)` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        {row.att2 ? `${row.att2.notaColombiana.toFixed(1)} (${row.att2.porcentaje}%)` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm text-right tabular-nums text-slate-900">
                        {row.student.intentosUsados > 0 || row.student.suspendido
                          ? row.definitiva.toFixed(1)
                          : '—'}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {row.concepto === 'APROBADO' && <span className="text-emerald-700">✓ APROBADO</span>}
                        {row.concepto === 'REPROBADO' && <span className="text-amber-700">✕ REPROBADO</span>}
                        {row.concepto === 'SUSPENDIDO' && <span className="text-red-700">⚠️ SUSPENDIDO</span>}
                        {row.concepto === 'SIN PRESENTAR' && <span className="text-slate-400">SIN PRESENTAR</span>}
                      </td>
                      <td className="py-3 px-4">
                        {row.student.suspendido ? (
                          <span className="text-red-700 font-semibold">
                            ⚠️ Suspendido · {row.student.conceptoInfraccion}
                          </span>
                        ) : (
                          <span className="text-emerald-700">{row.student.conceptoInfraccion}</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
                Porcentaje de Aciertos por Módulo Curricular (Módulos 1 al 5)
              </h3>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((m) => {
                  const st = diagnostics.modStats[m];
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
                        <span className="font-semibold text-slate-800">Módulo {m}</span>
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

      {/* ================= TAB 5: BANCO DE PREGUNTAS PRECARGADO (740 PREGUNTAS + CRUD + LOTE) ================= */}
      {activeTab === 'banco_preguntas' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <OptionServerSaveBar
            sectionKey="banco_preguntas"
            label={`Banco Oficial de Preguntas (${questions.length} reactivos activos)`}
            watchValue={`${questions.length}:${questions[0]?.id || ''}:${
              questions[questions.length - 1]?.id || ''
            }`}
          />
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Banco Oficial de Preguntas Contextualizadas ({questions.length} Reactivos Activos)
                </h2>
                <p className="text-xs text-slate-600">
                  Administración integral de reactivos por módulo: creación individual, lote masivo, estructura de carga, reversión de última carga y paginación hasta 500 preguntas visibles.
                </p>
              </div>

              <button
                type="button"
                onClick={openNewQuestionModal}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 self-start whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nueva Pregunta Individual</span>
              </button>
            </div>

            {/* Action Buttons Toolbar requested by Teacher */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* 1A. Botón directo para subir y actualizar el Banco de Preguntas con archivo JSON (ej. BANCO_PREGUNTAS_UNIFICADO_2026 ACT.json) */}
              <label className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Actualizar Banco con Archivo JSON (.json / .csv)</span>
                <input
                  type="file"
                  accept=".json,.csv,.txt,application/json,text/csv"
                  onChange={(e) => handleUploadQuestionFile(e, 'replace')}
                  className="hidden"
                />
              </label>

              {/* 1B. Botón Agregar / Actualizar Lote Masivo de Preguntas (Modal) */}
              <button
                type="button"
                onClick={() => {
                  setBulkQFeedback(null);
                  setBulkQModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Agregar / Actualizar Lote Masivo de Preguntas</span>
              </button>

              {/* 1C. Botón Restaurar Banco Unificado 2026 (con confirmación para aceptar el reemplazo) */}
              {confirmRestoreOfficialBank ? (
                <div className="inline-flex items-center gap-2 bg-sky-50 border-2 border-sky-400 px-3 py-1.5 rounded-lg text-xs">
                  <span className="font-bold text-sky-950">
                    ¿Reemplazar banco actual con los {INITIAL_QUESTIONS.length} reactivos oficiales 2026?
                  </span>
                  <button
                    type="button"
                    onClick={handleRestoreOfficialUnifiedBank}
                    className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded font-bold cursor-pointer"
                  >
                    Sí, Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreOfficialBank(false)}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRestoreOfficialBank(true)}
                  className="px-3.5 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  title="Restaurar los reactivos del Banco Oficial Unificado 2026"
                >
                  <Database className="w-4 h-4 text-sky-700" />
                  <span>Cargar Banco Unificado 2026 ({INITIAL_QUESTIONS.length} Reactivos)</span>
                </button>
              )}

              {/* 2. Botón Descargar Lote Masivo de Preguntas (Reactivos Activos) */}
              <button
                type="button"
                disabled={questions.length === 0}
                onClick={exportQuestionsCsv}
                className="px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-emerald-700" />
                <span>Descargar Lote Masivo ({questions.length} Reactivos Activos CSV)</span>
              </button>

              <button
                type="button"
                disabled={questions.length === 0}
                onClick={exportQuestionsJson}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Code2 className="w-4 h-4 text-slate-600" />
                <span>Descargar JSON</span>
              </button>

              {/* 3. Botón Mostrar Estructura de Carga */}
              <button
                type="button"
                onClick={() => setShowQStructureModal(true)}
                className="px-3.5 py-2 rounded-lg border border-sky-200 bg-sky-50/70 hover:bg-sky-100 text-sky-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4 text-sky-700" />
                <span>Estructura para Cargar Preguntas</span>
              </button>

              {/* 3B. Botón Exportación de Examen en Papel (Plan B por Corte Eléctrico Total: Filas A, B y C) */}
              <button
                type="button"
                disabled={questions.length === 0}
                onClick={() => triggerPrintView('examen_papel_plan_b')}
                className="px-3.5 py-2 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 text-indigo-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-4 h-4 text-indigo-700" />
                <span>Exportar Examen en Papel — Plan B (Filas A, B y C + Clave)</span>
              </button>

              {/* 3C. Botón Validador Automático de Calidad del Banco (Auditor de Reactivos) */}
              <button
                type="button"
                disabled={questions.length === 0}
                onClick={() => setShowBankAuditorModal(true)}
                className="px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 disabled:opacity-40 text-emerald-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>Validador de Calidad del Banco (Auditor de Reactivos)</span>
              </button>

              {/* 4. Botón Ver todas las preguntas / hasta 500 visibles */}
              <button
                type="button"
                onClick={() => {
                  setQModFilter('all');
                  setQSearch('');
                  setQPageSize(500);
                  setQCurrentPage(1);
                  setBankActionNotice(
                    `Modo de vista ampliada activo: mostrando hasta 500 preguntas por página (${questions.length} reactivos en total). Use el selector de páginas para recorrer el banco completo sin sobrecarga.`
                  );
                }}
                className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  qPageSize === 500
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Ver Todas las Preguntas (Hasta 500 Visibles)</span>
              </button>

              {/* 5. Botón Deshacer la última carga de preguntas */}
              {(() => {
                const effectiveSnapshotCount =
                  previousQuestionsSnapshotCount > 0
                    ? previousQuestionsSnapshotCount
                    : previousQuestionsSnapshot
                    ? previousQuestionsSnapshot.length
                    : 0;
                return (
                  <button
                    type="button"
                    disabled={effectiveSnapshotCount === 0}
                    onClick={handleUndoLastQuestionBatch}
                    className="px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    title={
                      effectiveSnapshotCount > 0
                        ? `Restaurar instantánea previa desde el servidor (${effectiveSnapshotCount} reactivos)`
                        : 'No hay cargas o cambios recientes para deshacer'
                    }
                  >
                    <RefreshCw className="w-4 h-4 text-amber-700" />
                    <span>
                      Deshacer Última Carga de Preguntas
                      {effectiveSnapshotCount > 0 ? ` (${effectiveSnapshotCount})` : ''}
                    </span>
                  </button>
                );
              })()}

              {/* 6. Botón Eliminar todo el banco oficial de preguntas (con confirmación inline sin window.confirm) */}
              {confirmClearAllQuestions ? (
                <div className="inline-flex items-center gap-2 bg-red-50 border-2 border-red-400 px-3 py-1.5 rounded-lg text-xs">
                  <span className="font-bold text-red-900">
                    ¿Eliminar las {questions.length} preguntas del banco?
                  </span>
                  <button
                    type="button"
                    onClick={handleClearAllQuestions}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold"
                  >
                    Sí, Eliminar Todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAllQuestions(false)}
                    className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={questions.length === 0}
                  onClick={() => setConfirmClearAllQuestions(true)}
                  className="px-3.5 py-2 rounded-lg border border-red-300 bg-red-50/70 hover:bg-red-100 disabled:opacity-40 text-red-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>Eliminar Todo el Banco de Preguntas</span>
                </button>
              )}
            </div>

            {bankActionNotice && (
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-center justify-between gap-3">
                <span>{bankActionNotice}</span>
                <button
                  type="button"
                  onClick={() => setBankActionNotice(null)}
                  className="text-sky-700 font-bold hover:underline shrink-0"
                >
                  Ocultar aviso
                </button>
              </div>
            )}
          </div>

          {/* Search & Module Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={qSearch}
                onChange={(e) => {
                  setQSearch(e.target.value);
                  setQCurrentPage(1);
                }}
                placeholder="Buscar en el banco por código, tema o palabra clave..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => {
                  setQModFilter('all');
                  setQCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-md font-medium ${
                  qModFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Todos ({questions.length})
              </button>
              {[1, 2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setQModFilter(m);
                    setQCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    qModFilter === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Módulo {m} ({questions.filter((q) => q.modulo === m).length})
                </button>
              ))}
            </div>
          </div>

          {/* Pagination & Page Size Selector Bar (Up to 500 Visible Questions) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-700 font-medium">
                Mostrando{' '}
                <strong className="font-mono text-slate-900">
                  {filteredQuestions.length === 0 ? 0 : (safeCurrentPage - 1) * qPageSize + 1}
                </strong>{' '}
                a{' '}
                <strong className="font-mono text-slate-900">
                  {Math.min(safeCurrentPage * qPageSize, filteredQuestions.length)}
                </strong>{' '}
                de <strong className="font-mono text-slate-900">{filteredQuestions.length}</strong> reactivos filtrados
              </span>

              <div className="flex items-center gap-1.5">
                <label htmlFor="q-page-size" className="text-slate-600 font-semibold">
                  Preguntas visibles por página:
                </label>
                <select
                  id="q-page-size"
                  value={qPageSize}
                  onChange={(e) => {
                    setQPageSize(Number(e.target.value));
                    setQCurrentPage(1);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-slate-900"
                >
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                  <option value={250}>250 por página</option>
                  <option value={500}>500 por página (Máximo)</option>
                </select>
              </div>
            </div>

            {/* Page Navigation Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setQCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700"
              >
                Anterior
              </button>

              {Array.from({ length: totalQuestionPages }, (_, idx) => idx + 1)
                .slice(Math.max(0, safeCurrentPage - 3), Math.min(totalQuestionPages, safeCurrentPage + 2))
                .map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setQCurrentPage(pageNum)}
                    className={`px-2.5 py-1 rounded font-mono font-bold border ${
                      pageNum === safeCurrentPage
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

              <button
                type="button"
                disabled={safeCurrentPage >= totalQuestionPages}
                onClick={() => setQCurrentPage((p) => Math.min(totalQuestionPages, p + 1))}
                className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700"
              >
                Siguiente
              </button>
            </div>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                No hay preguntas activas que coincidan con el criterio actual
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Si vació el banco de preguntas, puede cargar un nuevo lote masivo o pulsar «Deshacer Última Carga de Preguntas» para restaurar el banco anterior.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedQuestions.map((q, idx) => {
                const globalIndex = (safeCurrentPage - 1) * qPageSize + idx + 1;
                return (
                  <div
                    key={q.id}
                    className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50/50 transition-colors space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-mono text-sky-800 font-semibold flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-400">#{globalIndex}</span>
                        <span>{q.id}</span>
                        <span>·</span>
                        <span>Módulo {q.modulo}</span>
                        <span>·</span>
                        <span>{q.bloom}</span>
                        {q.rap && (
                          <>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-900">
                              {q.rap}
                            </span>
                          </>
                        )}
                        {q.tipoPregunta && (
                          <>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-sans">
                              {q.tipoPregunta}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="font-sans text-slate-600">{q.tema}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditQuestionModal(q)}
                          className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Modificar</span>
                        </button>
                        {confirmDeleteQId === q.id ? (
                          <div className="inline-flex items-center gap-1 bg-red-50 border border-red-300 px-2 py-0.5 rounded text-xs">
                            <span className="text-red-900 font-semibold">¿Borrar?</span>
                            <button
                              type="button"
                              onClick={() => {
                                savePreviousQuestionsSnapshot(questions);
                                onUpdateQuestions(questions.filter((item) => item.id !== q.id));
                                setConfirmDeleteQId(null);
                              }}
                              className="px-1.5 bg-red-600 text-white rounded font-bold"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteQId(null)}
                              className="px-1.5 bg-slate-200 text-slate-700 rounded"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteQId(q.id)}
                            className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-medium text-slate-900">{q.enunciado}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                        <div
                          key={letter}
                          className={`p-2 rounded border ${
                            q.correcta === letter
                              ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-950'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className="font-mono font-bold mr-1.5">{letter})</span>
                          {q.opciones[letter]}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* ================= TAB 7: CONFIGURACIÓN DE SEGURIDAD Y CORREO DE RECUPERACIÓN ================= */}
      {activeTab === 'seguridad_correo' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <OptionServerSaveBar
              sectionKey="seguridad_y_respaldo"
              label="Credenciales Docente, Correo de Recuperación y Respaldo"
              watchValue={[config.correoRecuperacion, config.claveDocente]}
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

      {/* ================= MODAL: BULK IMPORT STUDENTS (EXCEL / CSV) ================= */}
      {bulkStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              Carga Masiva de Estudiantes (Excel / CSV)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pegue directamente las columnas desde Excel o CSV (<code>Documento;Nombre Completo</code>). El sistema generará automáticamente el código criptográfico de 12 caracteres (<code>MM26...</code>) para cada alumno.
            </p>

            <textarea
              rows={6}
              value={bulkStudentText}
              onChange={(e) => setBulkStudentText(e.target.value)}
              placeholder={'1058209901;Juan Camilo Restrepo\n1058209902;María Fernanda Ríos'}
              className="w-full p-3 rounded-lg border border-slate-300 text-xs font-mono"
            />

            {bulkImportStatus && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                {bulkImportStatus}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkStudentModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleBulkImportStudents}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
              >
                Procesar e Importar Nómina
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
                  <label className="font-semibold block mb-1">Módulo (1 a 5)</label>
                  <select
                    value={formQMod}
                    onChange={(e) => setFormQMod(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                    className="w-full p-2 rounded border border-slate-300"
                  >
                    {[1, 2, 3, 4, 5].map((m) => (
                      <option key={m} value={m}>
                        Módulo {m}
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

            {/* Subida directa de archivo JSON / CSV */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold text-emerald-950">
                  Cargar archivo directo (.json / .csv)
                </div>
                <div className="text-[11px] text-emerald-800">
                  Compatible con <code>BANCO_PREGUNTAS_UNIFICADO_2026 ACT.json</code>
                </div>
              </div>
              <label className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-center">
                <Upload className="w-3.5 h-3.5" />
                <span>Seleccionar Archivo JSON / CSV</span>
                <input
                  type="file"
                  accept=".json,.csv,.txt,application/json,text/csv"
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
            const modalitiesList: { id: ExamModality; label: string }[] = [
              { id: 'integral', label: 'Examen Integral (Módulos 1 al 5 · 40 preguntas)' },
              { id: 'mod1', label: 'Examen Módulo 1: Introducción al Mapeo (25 preguntas)' },
              { id: 'mod2', label: 'Examen Módulo 2: Comportamiento del Consumidor (25 preguntas)' },
              { id: 'mod3', label: 'Examen Módulo 3: Investigación de Mercados (25 preguntas)' },
              { id: 'mod4', label: 'Examen Módulo 4: Segmentación y Posicionamiento (25 preguntas)' },
              { id: 'mod5', label: 'Examen Módulo 5: Tendencias del Mercado (25 preguntas)' }
            ];

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
            const modalitiesList: { id: ExamModality; label: string }[] = [
              { id: 'integral', label: 'Examen Integral (Módulos 1 al 5 · 40 preguntas)' },
              { id: 'mod1', label: 'Examen Módulo 1: Introducción al Mapeo (25 preguntas)' },
              { id: 'mod2', label: 'Examen Módulo 2: Comportamiento del Consumidor (25 preguntas)' },
              { id: 'mod3', label: 'Examen Módulo 3: Investigación de Mercados (25 preguntas)' },
              { id: 'mod4', label: 'Examen Módulo 4: Segmentación y Posicionamiento (25 preguntas)' },
              { id: 'mod5', label: 'Examen Módulo 5: Tendencias del Mercado (25 preguntas)' }
            ];

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
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  3. Sesgo de Longitud (Opción Correcta Notoriamente Más Larga que los Distractores)
                </h4>
                <span className="text-xs font-mono font-bold text-slate-700">
                  {bankQualityAudit.lengthBiasItems.length} hallazgos
                </span>
              </div>
              {bankQualityAudit.lengthBiasItems.length === 0 ? (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  ✓ Sin sesgo de longitud: Las opciones correctas mantienen una extensión homogénea frente a los distractores.
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

            // Collect all mini-reto attempts for this specific student across modules 1..5
            const studentRetoAttemptsMap = new Map<string, MiniRetoAttemptRecord>();
            if (Array.isArray(auditSt.historialIntentosRetos)) {
              auditSt.historialIntentosRetos.filter(Boolean).forEach((att) => {
                studentRetoAttemptsMap.set(att.attemptId, att);
              });
            }
            ([1, 2, 3, 4, 5] as const).forEach((m) => {
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

                {/* ================= MODO 1: AUDITORÍA DE EXÁMENES POR MÓDULO ================= */}
                {auditActiveMode === 'examenes' && (
                  <div className="space-y-4">
                    {/* Filtro de Modalidad / Módulo de Examen */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                      <div className="font-bold text-slate-800">
                        Filtrar por Examen / Módulo realizado:
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'ALL', label: `Todos (${studentExamAttempts.length})` },
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
                    {/* Resumen de los 5 Módulos de Retos para este estudiante */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {([1, 2, 3, 4, 5] as const).map((m) => {
                        const mp = auditSt.progresoRetos?.[m];
                        const used = mp?.intentosUsados || 0;
                        const unlocked = Boolean(mp?.insigniaDesbloqueada);
                        const badgeInfo = OFFICIAL_BADGES.find((b) => b.modulo === m);
                        return (
                          <div
                            key={m}
                            onClick={() => setAuditRetoModuloFilter(m)}
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
                        Filtrar Retos por Módulo (1 al 5):
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
                        {([1, 2, 3, 4, 5] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setAuditRetoModuloFilter(m)}
                            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                              auditRetoModuloFilter === m
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Módulo {m} (
                            {allStudentRetoAttempts.filter((r) => Number(r.modulo) === m).length})
                          </button>
                        ))}
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
    </div>
  );
}
