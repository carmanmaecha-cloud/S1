import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  ABProProjectEvaluation,
  SystemConfig,
  CustomMiniRetoTemplate,
  TeacherAccountRecord,
  UniversalCourseMetadata,
  UniversalCourseWorkspace,
  UniversalModuleDefinition,
  UniversalExamDefinition,
  StudentRosterDatabaseEntry,
  QuestionBankDatabaseEntry,
  BloomLevel
} from '../types';
import {
  getEffectiveCourseMetadata,
  getEffectiveRegisteredTeachers,
  DEFAULT_MODULE_GRADING_WEIGHTS,
  parseRawDocumentLinksToStructured,
  formatStructuredDocumentLinksToRaw,
  buildUniversalExamsList,
  generateBaseRetosForCourseModules
} from '../utils/universalCourseEngine';
import {
  AcademicDataset,
  normalizeAndSyncAcademicDataset,
  buildInitialAcademicDataset
} from '../data/classAttendanceAndGrades';
import {
  INITIAL_QUESTIONS,
  equalizeQuestionBank,
  normalizeQuestionList
} from '../data/questions';
import {
  parseQuestionsFromAnyFile,
  parseDelimitedTextToMatrix,
  extractQuestionsFromMatrix,
  parseStudentsFromExcelOrCsvFile,
  extractStudentsFromMatrix
} from '../utils/excelParser';
import {
  generateDeterministicAccessCode,
  INITIAL_STUDENTS
} from '../data/students';
import { useAuthSession } from '../context/AuthContext';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import type { ForceServerResyncResult } from '../App';
import {
  ShieldAlert,
  FolderPlus,
  Users,
  Key,
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  Sliders,
  LogOut,
  GraduationCap,
  Layers,
  Save,
  Database,
  Download,
  Upload,
  Eye,
  EyeOff,
  ArrowLeft,
  BookOpen,
  CheckSquare,
  Copy,
  Edit3,
  FileSpreadsheet,
  RefreshCw,
  Code2,
  Printer,
  Search,
  Check,
  AlertTriangle,
  Info,
  RotateCcw,
  Home,
  LayoutGrid,
  ChevronRight
} from 'lucide-react';

interface EditorPanelProps {
  config: SystemConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  students: StudentRecord[];
  onUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>>;
  questions: Question[];
  onUpdateQuestions: (next: Question[]) => void;
  previousQuestionsSnapshotCount?: number;
  onUndoQuestionsSnapshot?: () => Promise<number | null>;
  attempts?: ExamAttemptResult[];
  onUpdateAttempts?: (next: ExamAttemptResult[]) => void;
  abproEvaluations?: ABProProjectEvaluation[];
  onUpdateABProEvaluations?: (next: ABProProjectEvaluation[]) => void;
  customMiniRetos: CustomMiniRetoTemplate[];
  onUpdateCustomMiniRetos: React.Dispatch<React.SetStateAction<CustomMiniRetoTemplate[]>>;
  academicDataset?: AcademicDataset;
  onUpdateAcademicDataset?: (nextDataset: AcademicDataset, options?: any) => void;
  onFullSystemRestore?: (payload: any) => Promise<void>;
  onSessionActiveChange?: (active: boolean) => void;
  logoutSignal?: number;
  onSwitchToStudentLogin?: () => void;
  onSwitchToTeacherPanel?: () => void;
  onGoToInitialHome?: () => void;
  onForceServerSync?: () => Promise<ForceServerResyncResult | void> | void;
}

type EditorCardView =
  | null
  | 'seguridad_clave'
  | 'docentes_activos'
  | 'cursos_activos'
  | 'crear_nuevo_curso'
  | 'nominas_estudiantes'
  | 'banco_preguntas';

interface BatchTeacherDraftRow {
  nombre: string;
  cuenta: string;
  clave: string;
  correo: string;
}

function createEmptyModule(moduleNumber: number): UniversalModuleDefinition {
  return {
    id: moduleNumber,
    code: `M${moduleNumber}`,
    shortTitle: '',
    fullTitle: '',
    horasModulo: '',
    description: '',
    observacion: '',
    temasModulo: [''],
    retoBadgeTitle: '',
    activo: true,
    examenesCount: 0,
    retosCount: 0,
    preguntasExamenModuloCount: 0,
    preguntasParaIntegralCount: 0,
    preguntasSeleccionadasIntegralIds: [],
    ponderacion: {
      comportamientoPct: 0,
      participacionPct: 0,
      examenPct: 0,
      trabajoPct: 0
    },
    ponderacionGlobalModuloPct: 0,
    asistenciaBloqueA: false,
    asistenciaBloqueB: false,
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  };
}

function normalizeImportedQuestions(raw: any): Question[] {
  return normalizeQuestionList(raw);
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = String(h).length;
    rows.slice(0, 100).forEach((r) => {
      const cellLen = String(r[colIdx] ?? '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 12), 55) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}

export function EditorPanel({
  config,
  onUpdateConfig,
  students,
  onUpdateStudents,
  questions,
  onUpdateQuestions,
  previousQuestionsSnapshotCount = 0,
  onUndoQuestionsSnapshot,
  attempts = [],
  onUpdateAttempts = () => {},
  abproEvaluations = [],
  onUpdateABProEvaluations = () => {},
  customMiniRetos,
  onUpdateCustomMiniRetos,
  academicDataset,
  onUpdateAcademicDataset,
  onSessionActiveChange,
  logoutSignal,
  onSwitchToStudentLogin,
  onSwitchToTeacherPanel,
  onGoToInitialHome,
  onForceServerSync
}: EditorPanelProps) {
  const {
    authState,
    loginEditor,
    logoutEditor,
    loginTeacher,
    loginStudent
  } = useAuthSession();
  const { handleExecuteServerSave } = useServerSave();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    Boolean(authState.editorSessionActive)
  );
  const [editorUserInput, setEditorUserInput] = useState('');
  const [editorPassInput, setEditorPassInput] = useState('');
  const [authDenied, setAuthDenied] = useState<boolean>(false);

  const [activeCard, setActiveCard] = useState<EditorCardView>(null);
  const [editorBanner, setEditorBanner] = useState<string | null>(null);

  const activeMeta = useMemo(() => getEffectiveCourseMetadata(config), [config]);
  const registeredTeachers = useMemo(() => getEffectiveRegisteredTeachers(config), [config]);

  const catalog = useMemo<UniversalCourseWorkspace[]>(() => {
    const rawList = Array.isArray(config.universalCoursesCatalog)
      ? config.universalCoursesCatalog.filter((c) => Boolean(c?.meta?.courseId))
      : [];
    if (!activeMeta.courseId) {
      return rawList;
    }
    const currentWorkspace: UniversalCourseWorkspace = {
      meta: activeMeta,
      studentsCount: students.length,
      questionsCount: questions.length,
      attemptsCount: attempts.length,
      retosCount: customMiniRetos.length,
      students,
      questions,
      attempts,
      abproEvaluations,
      customMiniRetos,
      academicDataset
    };
    const exists = rawList.some((c) => c.meta.courseId === activeMeta.courseId);
    if (!exists) {
      return [currentWorkspace, ...rawList];
    }
    return rawList.map((c) => (c.meta.courseId === activeMeta.courseId ? currentWorkspace : c));
  }, [
    config.universalCoursesCatalog,
    activeMeta,
    students,
    questions,
    attempts,
    abproEvaluations,
    customMiniRetos,
    academicDataset
  ]);

  // =========================================================================
  // 1. ESTADO DE TARJETA: SEGURIDAD Y CLAVE
  // =========================================================================
  const effectiveRecoveryEmail =
    (config.correoRecuperacionEditor || config.correoRecuperacion || '').trim() ||
    'fenixcor207@gmail.com';

  const [secEditorName, setSecEditorName] = useState<string>(config.editorNombre || '');
  const [secEditorAccount, setSecEditorAccount] = useState<string>(
    (config.editorUsuario || 'EDITOR2026').trim().toUpperCase()
  );
  const [secEditorPass, setSecEditorPass] = useState<string>(
    (config.editorClave || 'EDITOR2026').trim()
  );
  const [showSecEditorPass, setShowSecEditorPass] = useState<boolean>(false);
  const [secEditorEmail, setSecEditorEmail] = useState<string>(effectiveRecoveryEmail);
  const [secSaveStatus, setSecSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    setSecEditorName(config.editorNombre || '');
    setSecEditorAccount((config.editorUsuario || 'EDITOR2026').trim().toUpperCase());
    setSecEditorPass((config.editorClave || 'EDITOR2026').trim());
    setSecEditorEmail(
      (config.correoRecuperacionEditor || config.correoRecuperacion || '').trim() ||
        'fenixcor207@gmail.com'
    );
  }, [
    config.editorNombre,
    config.editorUsuario,
    config.editorClave,
    config.correoRecuperacionEditor,
    config.correoRecuperacion
  ]);

  // =========================================================================
  // 2. ESTADO DE TARJETA: DOCENTES ACTIVOS (3 OPCIONES)
  // =========================================================================
  const [teacherAddMode, setTeacherAddMode] = useState<'individual' | 'lotes'>('individual');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherAccount, setNewTeacherAccount] = useState('');
  const [newTeacherPass, setNewTeacherPass] = useState('');
  const [showNewTeacherPass, setShowNewTeacherPass] = useState(false);
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [visibleTeacherPassIds, setVisibleTeacherPassIds] = useState<Record<string, boolean>>({});
  const [confirmDeleteTeacherId, setConfirmDeleteTeacherId] = useState<string | null>(null);

  const [batchRows, setBatchRows] = useState<BatchTeacherDraftRow[]>([
    { nombre: '', cuenta: '', clave: '', correo: '' },
    { nombre: '', cuenta: '', clave: '', correo: '' }
  ]);
  const [batchRawText, setBatchRawText] = useState('');

  // =========================================================================
  // 3. ESTADO DE TARJETA: CREAR NUEVO CURSO (3 OPCIONES)
  // =========================================================================
  const [createCourseOption, setCreateCourseOption] = useState<'nuevo' | 'importar' | 'exportar'>(
    'nuevo'
  );
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseSubjectName, setCourseSubjectName] = useState('');
  const [courseSede, setCourseSede] = useState('');
  const [assignedTeacherAccount, setAssignedTeacherAccount] = useState('');
  const [assignedTeacherPass, setAssignedTeacherPass] = useState('');
  const [assignedTeacherName, setAssignedTeacherName] = useState('');
  const [showAssignedTeacherPass, setShowAssignedTeacherPass] = useState(false);

  const [courseModules, setCourseModules] = useState<UniversalModuleDefinition[]>([
    createEmptyModule(1)
  ]);
  const [globalCourseWeightPct, setGlobalCourseWeightPct] = useState<number>(0);
  const [courseStudentsBank, setCourseStudentsBank] = useState<StudentRecord[]>([]);
  const [courseQuestionsBank, setCourseQuestionsBank] = useState<Question[]>([]);
  const [enableFinalIntegralExam, setEnableFinalIntegralExam] = useState<boolean>(false);
  const [finalIntegralDurationMin, setFinalIntegralDurationMin] = useState<number>(80);

  // =========================================================================
  // ESTADO COMPLETO DE CONTROL DE ESTUDIANTES ASIGNADOS AL CURSO (EN EL PANEL DEL EDITOR)
  // =========================================================================
  const [edStudentSearch, setEdStudentSearch] = useState('');
  const [edStudentModalOpen, setEdStudentModalOpen] = useState(false);
  const [edEditingStudent, setEdEditingStudent] = useState<StudentRecord | null>(null);
  const [edFormStudentId, setEdFormStudentId] = useState('');
  const [edFormStudentName, setEdFormStudentName] = useState('');
  const [edFormStudentCorreo, setEdFormStudentCorreo] = useState('');
  const [edFormStudentWhatsapp, setEdFormStudentWhatsapp] = useState('');
  const [edFormStudentCode, setEdFormStudentCode] = useState('');
  const [edBulkStudentModalOpen, setEdBulkStudentModalOpen] = useState(false);
  const [edBulkStudentsText, setEdBulkStudentsText] = useState('');
  const [edBulkStudentsMode, setEdBulkStudentsMode] = useState<'merge' | 'replace'>('merge');
  const [edBulkImportStatus, setEdBulkImportStatus] = useState<string | null>(null);
  const [edStudentBanner, setEdStudentBanner] = useState<string | null>(null);
  const [edConfirmDeleteStudentId, setEdConfirmDeleteStudentId] = useState<string | null>(null);
  const [edSelectedStudentIdsForBatch, setEdSelectedStudentIdsForBatch] = useState<string[]>([]);
  const [edConfirmBatchDeleteStudents, setEdConfirmBatchDeleteStudents] = useState(false);
  const [edBatchAccessCodeModalOpen, setEdBatchAccessCodeModalOpen] = useState(false);
  const [edBatchAccessCodeScope, setEdBatchAccessCodeScope] = useState<'all' | 'selected'>('all');
  const [edBatchAccessCodeMode, setEdBatchAccessCodeMode] = useState<
    'regenerate_deterministic' | 'custom_prefix_id4' | 'same_shared_code' | 'individual_list'
  >('regenerate_deterministic');
  const [edBatchAccessCodePrefix, setEdBatchAccessCodePrefix] = useState('MM26');
  const [edBatchSharedAccessCode, setEdBatchSharedAccessCode] = useState('CURSO2026');
  const [edBatchIndividualCodesMap, setEdBatchIndividualCodesMap] = useState<Record<string, string>>(
    {}
  );
  const [edBatchAccessCodeNotice, setEdBatchAccessCodeNotice] = useState<string | null>(null);
  const [edStudentCodeDrafts, setEdStudentCodeDrafts] = useState<Record<string, string>>({});

  // =========================================================================
  // ESTADO COMPLETO DEL BANCO DE PREGUNTAS (EN BASE DE DATOS DE PREGUNTAS/RESPUESTAS DE TODOS LOS MÓDULOS CARGADOS)
  // =========================================================================
  const [qSearch, setQSearch] = useState('');
  const [qModFilter, setQModFilter] = useState<number | 'all'>('all');
  const [qPageSize, setQPageSize] = useState<number>(50);
  const [qCurrentPage, setQCurrentPage] = useState<number>(1);
  const [previousQuestionsSnapshot, setPreviousQuestionsSnapshot] = useState<Question[] | null>(
    null
  );
  const [bankActionNotice, setBankActionNotice] = useState<string | null>(null);
  const [showQStructureModal, setShowQStructureModal] = useState(false);
  const [copiedQTemplate, setCopiedQTemplate] = useState<'csv' | 'json' | null>(null);
  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [bulkQModalOpen, setBulkQModalOpen] = useState(false);
  const [bulkQText, setBulkQText] = useState('');
  const [bulkQMode, setBulkQMode] = useState<'merge' | 'replace'>('merge');
  const [bulkQFeedback, setBulkQFeedback] = useState<string | null>(null);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);
  const [confirmClearAllQuestions, setConfirmClearAllQuestions] = useState<boolean>(false);
  const [confirmRestoreOfficialBank, setConfirmRestoreOfficialBank] = useState<boolean>(false);
  const [showBankAuditorModal, setShowBankAuditorModal] = useState<boolean>(false);
  const [isEqualizingBankIA, setIsEqualizingBankIA] = useState<boolean>(false);
  const [printViewMode, setPrintViewMode] = useState<'none' | 'examen_papel_plan_b'>('none');

  // Question Form State (Modal Nueva / Editar Pregunta Individual)
  const [qFormId, setQFormId] = useState('');
  const [qFormModulo, setQFormModulo] = useState<number>(1);
  const [qFormTema, setQFormTema] = useState('');
  const [qFormBloom, setQFormBloom] = useState<BloomLevel>('Comprensión');
  const [qFormEnunciado, setQFormEnunciado] = useState('');
  const [qFormA, setQFormA] = useState('');
  const [qFormB, setQFormB] = useState('');
  const [qFormC, setQFormC] = useState('');
  const [qFormD, setQFormD] = useState('');
  const [qFormCorrecta, setQFormCorrecta] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [qFormJustificacion, setQFormJustificacion] = useState('');

  // Nuevos estados UX/UI del EditorPanel:
  // 1. Asistente Guiado por Pasos (Wizard 1-4 o Vista Completa 'all')
  const [wizardStep, setWizardStep] = useState<'all' | 1 | 2 | 3 | 4>('all');
  // 2. Simulador / Previsualización en Vivo (Vista Estudiante / Vista Docente)
  const [showLivePreviewModal, setShowLivePreviewModal] = useState<boolean>(false);
  const [livePreviewRole, setLivePreviewRole] = useState<'student' | 'teacher'>('student');
  // 3. Clonación Selectiva de Módulos o Preguntas entre Cursos
  const [showSelectiveCloneModal, setShowSelectiveCloneModal] = useState<boolean>(false);
  const [cloneSourceCourseId, setCloneSourceCourseId] = useState<string>('');
  const [selectedCloneModuleIds, setSelectedCloneModuleIds] = useState<number[]>([]);
  const [selectedCloneQuestionIds, setSelectedCloneQuestionIds] = useState<string[]>([]);
  const [cloneTargetModuleNum, setCloneTargetModuleNum] = useState<number>(1);
  // 4. Historial de Versiones / Instantáneas (Snapshots) de Configuración del Curso
  const [courseSnapshots, setCourseSnapshots] = useState<
    {
      id: string;
      timestampIso: string;
      label: string;
      meta: UniversalCourseMetadata;
      questions: Question[];
    }[]
  >(() => {
    try {
      const raw = localStorage.getItem('evaluaplus_course_config_snapshots_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
    });
  const [showSnapshotsModal, setShowSnapshotsModal] = useState<boolean>(false);
  const [confirmDeleteCourseInForm, setConfirmDeleteCourseInForm] = useState<boolean>(false);
  // 5. Arquitectura Híbrida IDE (Explorador de Archivos Lateral estilo VS Code + Pantallas Divididas / Split-View + Configurador Masivo de Condicionales/Multimedia)
  const [editorIdeSidebarOpen, setEditorIdeSidebarOpen] = useState<boolean>(true);
  const [editorSplitViewOpen, setEditorSplitViewOpen] = useState<boolean>(false);
  const [selectedIdeModuleIndex, setSelectedIdeModuleIndex] = useState<number>(0);
  const [bulkMediaPrefixUrl, setBulkMediaPrefixUrl] = useState<string>(
    'https://campus.evaluaplus.edu.co/recursos/modulo-'
  );
  const [bulkUnlockMinGrade, setBulkUnlockMinGrade] = useState<number>(3.0);

  // 6. Bases de Datos de "Nominas de estudiantes" y "Banco de preguntas" (Pantallas dedicadas y Selección en Crear/Modificar Curso)
  const [selectedStudentRosterDbId, setSelectedStudentRosterDbId] = useState<string>('nomina-oficial-base');
  const [selectedQuestionBankDbId, setSelectedQuestionBankDbId] = useState<string>('banco-oficial-unificado');

  const [activeRosterDbId, setActiveRosterDbId] = useState<string>('nomina-oficial-base');
  const [rosterWindowTab, setRosterWindowTab] = useState<'crear' | 'listado'>('listado');
  const [editingRosterDbId, setEditingRosterDbId] = useState<string | null>(null);
  const [viewingRosterDbId, setViewingRosterDbId] = useState<string | null>(null);
  const [deletedRosterDbIds, setDeletedRosterDbIds] = useState<string[]>(() =>
    Array.isArray(config.deletedStudentRosterDbIds) ? config.deletedStudentRosterDbIds : []
  );
  const [newRosterDbName, setNewRosterDbName] = useState<string>('');
  const [newRosterDbCode, setNewRosterDbCode] = useState<string>('');
  const [newRosterDbInitMode, setNewRosterDbInitMode] = useState<'empty' | 'base' | 'current'>('base');
  const [confirmDeleteRosterDbId, setConfirmDeleteRosterDbId] = useState<string | null>(null);
  const [rosterNameError, setRosterNameError] = useState<boolean>(false);
  const rosterNameInputRef = useRef<HTMLInputElement | null>(null);
  const [localRosterDbs, setLocalRosterDbs] = useState<StudentRosterDatabaseEntry[]>(() =>
    Array.isArray(config.studentRosterDatabases) ? config.studentRosterDatabases : []
  );

  const [activeQuestionBankDbId, setActiveQuestionBankDbId] = useState<string>('banco-oficial-unificado');
  const [qBankWindowTab, setQBankWindowTab] = useState<'crear' | 'listado'>('listado');
  const [editingQBankDbId, setEditingQBankDbId] = useState<string | null>(null);
  const [viewingQBankDbId, setViewingQBankDbId] = useState<string | null>(null);
  const [deletedQBankDbIds, setDeletedQBankDbIds] = useState<string[]>(() =>
    Array.isArray(config.deletedQuestionBankDbIds) ? config.deletedQuestionBankDbIds : []
  );
  const [newQBankDbName, setNewQBankDbName] = useState<string>('');
  const [newQBankDbCode, setNewQBankDbCode] = useState<string>('');
  const [newQBankDbInitMode, setNewQBankDbInitMode] = useState<'empty' | 'official' | 'current'>('official');
  const [confirmDeleteQBankDbId, setConfirmDeleteQBankDbId] = useState<string | null>(null);
  const [qBankNameError, setQBankNameError] = useState<boolean>(false);
  const qBankNameInputRef = useRef<HTMLInputElement | null>(null);
  const [localQBankDbs, setLocalQBankDbs] = useState<QuestionBankDatabaseEntry[]>(() =>
    Array.isArray(config.questionBankDatabases) ? config.questionBankDatabases : []
  );

  // Al ingresar a las pantallas/ventanas "Banco de preguntas" y "Nominas de estudiantes",
  // mostrar siempre primero la pestaña/ventana "Ver listado de bases de datos creados".
  useEffect(() => {
    if (activeCard === 'nominas_estudiantes') {
      setRosterWindowTab('listado');
      setRosterNameError(false);
    } else if (activeCard === 'banco_preguntas') {
      setQBankWindowTab('listado');
      setQBankNameError(false);
    }
  }, [activeCard]);

  const studentRosterDatabases = useMemo<StudentRosterDatabaseEntry[]>(() => {
    const savedFromConfig = Array.isArray(config.studentRosterDatabases)
      ? config.studentRosterDatabases
      : [];
    const map = new Map<string, StudentRosterDatabaseEntry>();

    // 1. Nómina Oficial Base
    map.set('nomina-oficial-base', {
      id: 'nomina-oficial-base',
      name: 'Nómina Oficial Base 2026',
      code: 'NOM-BASE',
      description: 'Base de datos de estudiantes oficial preconfigurada con códigos de acceso',
      students: INITIAL_STUDENTS,
      updatedAtIso: '2026-01-01T00:00:00.000Z'
    });

    // 2. Únicamente bases de datos creadas/guardadas explícitamente en la ventana "Nominas de estudiantes"
    // (Se ignoran entradas automáticas heredadas con prefijo nomina-curso-*)
    [...savedFromConfig, ...localRosterDbs].forEach((db) => {
      if (db && db.id && !String(db.id).startsWith('nomina-curso-')) {
        map.set(db.id, {
          ...db,
          students: Array.isArray(db.students) ? db.students : []
        });
      }
    });

    const deletedSet = new Set([
      ...deletedRosterDbIds,
      ...(Array.isArray(config.deletedStudentRosterDbIds) ? config.deletedStudentRosterDbIds : [])
    ]);
    return Array.from(map.values()).filter((db) => !deletedSet.has(db.id));
  }, [config.studentRosterDatabases, config.deletedStudentRosterDbIds, deletedRosterDbIds, localRosterDbs]);

  const questionBankDatabases = useMemo<QuestionBankDatabaseEntry[]>(() => {
    const savedFromConfig = Array.isArray(config.questionBankDatabases)
      ? config.questionBankDatabases
      : [];
    const map = new Map<string, QuestionBankDatabaseEntry>();

    // 1. Banco Oficial Unificado
    map.set('banco-oficial-unificado', {
      id: 'banco-oficial-unificado',
      name: 'Banco Oficial Unificado 2026',
      code: 'BCO-OFICIAL',
      description: 'Base de datos oficial de preguntas y respuestas calibradas de todos los módulos',
      questions: INITIAL_QUESTIONS,
      updatedAtIso: '2026-01-01T00:00:00.000Z'
    });

    // 2. Únicamente bases de datos creadas/guardadas explícitamente en la ventana "Banco de preguntas"
    // (Se ignoran entradas automáticas heredadas con prefijo banco-curso-*)
    [...savedFromConfig, ...localQBankDbs].forEach((db) => {
      if (db && db.id && !String(db.id).startsWith('banco-curso-')) {
        map.set(db.id, {
          ...db,
          questions: Array.isArray(db.questions) ? db.questions : []
        });
      }
    });

    const deletedSet = new Set([
      ...deletedQBankDbIds,
      ...(Array.isArray(config.deletedQuestionBankDbIds) ? config.deletedQuestionBankDbIds : [])
    ]);
    return Array.from(map.values()).filter((db) => !deletedSet.has(db.id));
  }, [config.questionBankDatabases, config.deletedQuestionBankDbIds, deletedQBankDbIds, localQBankDbs]);

  const updateEditorStudentsBank = (nextStudents: StudentRecord[], targetRosterDbId?: string) => {
    setCourseStudentsBank(nextStudents);

    // Solo la ventana "Nominas de estudiantes" puede modificar bases de datos existentes,
    // y únicamente si se está editando una base de datos existente o se indicó targetRosterDbId.
    if (activeCard !== 'nominas_estudiantes') {
      return;
    }
    if (!editingRosterDbId && !targetRosterDbId) {
      return;
    }

    const effectiveDbId = targetRosterDbId || editingRosterDbId;
    if (!effectiveDbId) return;

    const existingDb = studentRosterDatabases.find((d) => d.id === effectiveDbId);
    if (!existingDb) return;

    const updatedDbEntry: StudentRosterDatabaseEntry = {
      id: effectiveDbId,
      name:
        (editingRosterDbId === effectiveDbId && newRosterDbName.trim()) ||
        existingDb.name,
      code:
        (editingRosterDbId === effectiveDbId && newRosterDbCode.trim()) ||
        existingDb.code,
      description: existingDb.description || 'Base de datos de nómina de estudiantes',
      students: nextStudents,
      updatedAtIso: new Date().toISOString()
    };

    if (activeMeta.selectedStudentRosterDbId === effectiveDbId) {
      onUpdateStudents(nextStudents);
      if (onUpdateAcademicDataset) {
        onUpdateAcademicDataset(
          academicDataset
            ? normalizeAndSyncAcademicDataset(academicDataset, nextStudents)
            : buildInitialAcademicDataset(nextStudents)
        );
      }
    }

    setLocalRosterDbs((prev) => {
      const filtered = prev.filter((d) => d && d.id && !String(d.id).startsWith('nomina-curso-'));
      const exists = filtered.some((d) => d.id === effectiveDbId);
      return exists
        ? filtered.map((d) => (d.id === effectiveDbId ? updatedDbEntry : d))
        : [...filtered, updatedDbEntry];
    });

    onUpdateConfig((prev) => {
      const prevRosters = (Array.isArray(prev.studentRosterDatabases) ? prev.studentRosterDatabases : [])
        .filter((d) => d && d.id && !String(d.id).startsWith('nomina-curso-'));
      const existsInSaved = prevRosters.some((d) => d.id === effectiveDbId);
      const nextRosters = existsInSaved
        ? prevRosters.map((d) => (d.id === effectiveDbId ? updatedDbEntry : d))
        : [...prevRosters, updatedDbEntry];

      return {
        ...prev,
        studentRosterDatabases: nextRosters,
        universalCoursesCatalog: (prev.universalCoursesCatalog || []).map((ws) => {
          const matchesSelectedRoster = ws.meta.selectedStudentRosterDbId === effectiveDbId;
          if (matchesSelectedRoster) {
            return {
              ...ws,
              students: nextStudents,
              studentsCount: nextStudents.length,
              academicDataset: ws.academicDataset
                ? normalizeAndSyncAcademicDataset(ws.academicDataset, nextStudents)
                : buildInitialAcademicDataset(nextStudents)
            };
          }
          return ws;
        })
      };
    });
  };

  const handleSelectRosterDatabaseForCourse = (db: StudentRosterDatabaseEntry) => {
    const clonedStudents = (db.students || []).map((s) => ({ ...s }));
    setSelectedStudentRosterDbId(db.id);
    setCourseStudentsBank(clonedStudents);
    showEditorNotice(
      `✓ Base de datos «${db.name}» (${clonedStudents.length} estudiantes) seleccionada para cargar en el curso.`
    );
  };

  const handleStartNewRosterDatabaseTab = () => {
    setRosterWindowTab('crear');
    setEditingRosterDbId(null);
    setViewingRosterDbId(null);
    setNewRosterDbName('');
    setNewRosterDbCode('');
    setRosterNameError(false);
    setCourseStudentsBank([]);
    setEdStudentSearch('');
    setEdSelectedStudentIdsForBatch([]);
    setEdStudentBanner(
      'ℹ️ Ingrese obligatoriamente el «Nombre de la base de datos a crear *», agregue los estudiantes (por estudiante o por lote) y haga clic en «Guardar base de datos».'
    );
  };

  const handleModifyRosterDatabaseFromList = (db: StudentRosterDatabaseEntry) => {
    setRosterWindowTab('crear');
    setEditingRosterDbId(db.id);
    setViewingRosterDbId(null);
    setActiveRosterDbId(db.id);
    setSelectedStudentRosterDbId(db.id);
    setNewRosterDbName(db.name);
    setNewRosterDbCode(db.code);
    setRosterNameError(false);
    setCourseStudentsBank((db.students || []).map((s) => ({ ...s })));
    setEdStudentSearch('');
    setEdSelectedStudentIdsForBatch([]);
    setEdStudentBanner(
      `✓ Modificando base de datos de Nómina: «${db.name}» (${db.students.length} estudiantes). Al terminar haga clic en «Guardar base de datos».`
    );
  };

  const handleSwitchActiveRosterDbInWindow = (dbId: string) => {
    const found = studentRosterDatabases.find((d) => d.id === dbId);
    if (!found) return;
    setActiveRosterDbId(found.id);
    setViewingRosterDbId(found.id);
    setRosterWindowTab('listado');
  };

  const handleSaveRosterDatabase = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newRosterDbName.trim();
    if (!cleanName) {
      setRosterNameError(true);
      setEdStudentBanner(
        '⚠️ Campo obligatorio (*): Debe ingresar el «Nombre de la base de datos a crear *» antes de guardar la base de datos.'
      );
      showEditorNotice(
        '⚠️ Campo obligatorio (*): Ingrese el Nombre de la base de datos a crear * antes de guardar.'
      );
      if (rosterNameInputRef.current) {
        rosterNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rosterNameInputRef.current.focus();
      }
      return;
    }

    setRosterNameError(false);

    const cleanCode =
      newRosterDbCode.trim().toUpperCase().replace(/\s+/g, '') ||
      `NOM-${cleanName
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 4) || 'DB'}-${String(studentRosterDatabases.length + 1).padStart(2, '0')}`;

    const targetId = editingRosterDbId || `nomina-custom-${Date.now().toString(36)}`;
    const clonedStudents = courseStudentsBank.map((s) => ({ ...s }));

    const savedEntry: StudentRosterDatabaseEntry = {
      id: targetId,
      name: cleanName,
      code: cleanCode,
      description: `Nómina de estudiantes guardada por el Editor (${clonedStudents.length} estudiantes)`,
      students: clonedStudents,
      updatedAtIso: new Date().toISOString()
    };

    const fullMap = new Map<string, StudentRosterDatabaseEntry>();
    studentRosterDatabases.forEach((d) => {
      if (d && d.id) fullMap.set(d.id, d);
    });
    fullMap.set(targetId, savedEntry);
    const mergedList = Array.from(fullMap.values());

    setLocalRosterDbs(mergedList);

    onUpdateConfig((prev) => {
      const nextDeleted = (prev.deletedStudentRosterDbIds || []).filter((id) => id !== targetId);

      return {
        ...prev,
        studentRosterDatabases: mergedList,
        deletedStudentRosterDbIds: nextDeleted,
        universalCoursesCatalog: (prev.universalCoursesCatalog || []).map((ws) => {
          const isCourseRoster = targetId === `nomina-curso-${ws.meta.courseId}`;
          const isSelectedRoster = ws.meta.selectedStudentRosterDbId === targetId;
          if (isCourseRoster || isSelectedRoster) {
            return {
              ...ws,
              meta: {
                ...ws.meta,
                selectedStudentRosterDbId: targetId,
                selectedStudentRosterDbName: cleanName
              },
              students: clonedStudents,
              studentsCount: clonedStudents.length,
              academicDataset: ws.academicDataset
                ? normalizeAndSyncAcademicDataset(ws.academicDataset, clonedStudents)
                : buildInitialAcademicDataset(clonedStudents)
            };
          }
          return ws;
        })
      };
    });

    setDeletedRosterDbIds((prev) => prev.filter((id) => id !== targetId));
    setEditingRosterDbId(targetId);
    setActiveRosterDbId(targetId);
    setSelectedStudentRosterDbId(targetId);
    setNewRosterDbCode(cleanCode);
    setViewingRosterDbId(targetId);
    // Llevar automáticamente a la pantalla/ventana "Ver listado de bases de datos creados" con la base de datos creada
    setRosterWindowTab('listado');

    void handleExecuteServerSave(
      'panel_editor_nominas_estudiantes',
      `Base de datos de Nómina "${cleanName}" guardada`
    );
    setEdStudentBanner(
      `✓ Base de datos «${cleanName} (${cleanCode})» guardada exitosamente con ${clonedStudents.length} estudiante(s).`
    );
    showEditorNotice(
      `✓ Base de datos de Nómina «${cleanName}» guardada con ${clonedStudents.length} estudiante(s).`
    );
  };

  const handleCreateNewRosterDatabase = (e: React.FormEvent) => {
    handleSaveRosterDatabase(e);
  };

  const handleDeleteRosterDatabase = (dbId: string) => {
    const nextDeletedLocal = deletedRosterDbIds.includes(dbId)
      ? deletedRosterDbIds
      : [...deletedRosterDbIds, dbId];
    setDeletedRosterDbIds(nextDeletedLocal);
    const remainingRosters = studentRosterDatabases.filter((d) => d.id !== dbId);
    setLocalRosterDbs(remainingRosters);
    onUpdateConfig((prev) => {
      const mergedDeleted = Array.from(
        new Set([...(prev.deletedStudentRosterDbIds || []), ...nextDeletedLocal, dbId])
      );
      return {
        ...prev,
        studentRosterDatabases: remainingRosters,
        deletedStudentRosterDbIds: mergedDeleted
      };
    });
    setConfirmDeleteRosterDbId(null);
    if (viewingRosterDbId === dbId) {
      setViewingRosterDbId(null);
    }
    if (editingRosterDbId === dbId) {
      setEditingRosterDbId(null);
      setNewRosterDbName('');
      setNewRosterDbCode('');
    }
    if (activeRosterDbId === dbId || selectedStudentRosterDbId === dbId) {
      const fallback = remainingRosters[0];
      if (fallback) {
        setActiveRosterDbId(fallback.id);
        setSelectedStudentRosterDbId(fallback.id);
        setCourseStudentsBank(fallback.students.map((s) => ({ ...s })));
      } else {
        setCourseStudentsBank([]);
      }
    }
    void handleExecuteServerSave(
      'panel_editor_nominas_estudiantes',
      `Base de datos de Nómina eliminada en ventana Nominas de estudiantes`
    );
    showEditorNotice('✓ Base de datos de Nómina eliminada del listado.');
  };

  const edFilteredStudents = useMemo(() => {
    const q = edStudentSearch.trim().toLowerCase();
    if (!q) return courseStudentsBank;
    return courseStudentsBank.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.nombre.toLowerCase().includes(q) ||
        (s.correo || '').toLowerCase().includes(q) ||
        (s.whatsapp || '').toLowerCase().includes(q) ||
        s.codigoAcceso.toLowerCase().includes(q)
    );
  }, [courseStudentsBank, edStudentSearch]);

  const openEdAddStudentModal = () => {
    setEdEditingStudent(null);
    setEdFormStudentId('');
    setEdFormStudentName('');
    setEdFormStudentCorreo('');
    setEdFormStudentWhatsapp('');
    setEdFormStudentCode('');
    setEdStudentModalOpen(true);
  };

  const openEdEditStudentModal = (st: StudentRecord) => {
    setEdEditingStudent(st);
    setEdFormStudentId(st.id);
    setEdFormStudentName(st.nombre);
    setEdFormStudentCorreo(st.correo || '');
    setEdFormStudentWhatsapp(st.whatsapp || '');
    setEdFormStudentCode(st.codigoAcceso);
    setEdStudentModalOpen(true);
  };

  const handleEdSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = edFormStudentId.trim().replace(/\s+/g, '');
    const cleanName = edFormStudentName.trim();
    const cleanCorreo = edFormStudentCorreo.trim().toLowerCase();
    const cleanWhatsapp = edFormStudentWhatsapp.trim().replace(/[^\d+]/g, '');
    if (!cleanId || !cleanName) return;

    const cleanCode =
      edFormStudentCode.trim().toUpperCase() || generateDeterministicAccessCode(cleanId);

    let nextList: StudentRecord[] = [];
    if (edEditingStudent) {
      nextList = courseStudentsBank.map((s) =>
        s.id === edEditingStudent.id
          ? {
              ...s,
              id: cleanId,
              nombre: cleanName,
              correo: cleanCorreo,
              whatsapp: cleanWhatsapp,
              codigoAcceso: cleanCode
            }
          : s
      );
      updateEditorStudentsBank(nextList);
      setEdStudentModalOpen(false);
      setEdStudentBanner(
        `✓ Datos y código de acceso de ${cleanName} (${cleanCode}) actualizados en el curso.`
      );
    } else {
      const exists = courseStudentsBank.some((s) => s.id === cleanId);
      if (exists) {
        nextList = courseStudentsBank.map((s) =>
          s.id === cleanId
            ? {
                ...s,
                nombre: cleanName,
                correo: cleanCorreo || s.correo || '',
                whatsapp: cleanWhatsapp || s.whatsapp || '',
                codigoAcceso: cleanCode
              }
            : s
        );
      } else {
        const newStudent: StudentRecord = {
          id: cleanId,
          nombre: cleanName,
          correo: cleanCorreo,
          whatsapp: cleanWhatsapp,
          codigoAcceso: cleanCode,
          intentosUsados: 0,
          maxIntentosPermitidos: 2,
          suspendido: false,
          advertenciasCambioFoco: 0,
          conceptoInfraccion: 'Sin infracciones registradas'
        };
        nextList = [...courseStudentsBank, newStudent];
      }
      updateEditorStudentsBank(nextList);
      setEdStudentModalOpen(false);
      setEdStudentBanner(
        `✓ Estudiante ${cleanName} (${cleanId}) asignado al curso con código ${cleanCode}.`
      );
    }
  };

  const handleEdSaveDirectStudentCode = (st: StudentRecord) => {
    const rawDraft = edStudentCodeDrafts[st.id] ?? st.codigoAcceso;
    const cleanCode = rawDraft.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 4) return;
    if (cleanCode === st.codigoAcceso.trim().toUpperCase()) return;

    const nextList = courseStudentsBank.map((s) =>
      s.id === st.id ? { ...s, codigoAcceso: cleanCode } : s
    );
    updateEditorStudentsBank(nextList);
    setEdStudentCodeDrafts((prev) => {
      const next = { ...prev };
      delete next[st.id];
      return next;
    });
    setEdStudentBanner(
      `✓ Código de Acceso de ${st.nombre} actualizado a "${cleanCode}".`
    );
  };

  const openEdBatchAccessCodeEditor = (scope: 'all' | 'selected') => {
    const effectiveScope =
      scope === 'selected' && edSelectedStudentIdsForBatch.length > 0 ? 'selected' : 'all';
    setEdBatchAccessCodeScope(effectiveScope);
    const map: Record<string, string> = {};
    courseStudentsBank.forEach((s) => {
      map[s.id] = s.codigoAcceso;
    });
    setEdBatchIndividualCodesMap(map);
    setEdBatchAccessCodeNotice(null);
    setEdBatchAccessCodeModalOpen(true);
  };

  const handleEdApplyBatchAccessCodes = () => {
    const targetSet =
      edBatchAccessCodeScope === 'selected' && edSelectedStudentIdsForBatch.length > 0
        ? new Set(edSelectedStudentIdsForBatch)
        : new Set(courseStudentsBank.map((s) => s.id));

    if (targetSet.size === 0) {
      setEdBatchAccessCodeNotice('⚠️ No hay estudiantes seleccionados.');
      return;
    }

    let updatedCount = 0;
    const nextList = courseStudentsBank.map((st, idx) => {
      if (!targetSet.has(st.id)) return st;
      let newCode = st.codigoAcceso;
      if (edBatchAccessCodeMode === 'regenerate_deterministic') {
        newCode = generateDeterministicAccessCode(st.id);
      } else if (edBatchAccessCodeMode === 'custom_prefix_id4') {
        const cleanPrefix =
          (edBatchAccessCodePrefix || 'MM26')
            .trim()
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase()
            .slice(0, 8) || 'MM26';
        const digits = st.id.replace(/\D/g, '');
        const last4 = (digits.slice(-4) || '0000').padStart(4, '0');
        const initials = st.nombre
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || 'X')
          .join('')
          .padEnd(2, 'X');
        const seq = String((idx + 1) % 100).padStart(2, '0');
        newCode = `${cleanPrefix}${last4}${initials}${seq}`;
      } else if (edBatchAccessCodeMode === 'same_shared_code') {
        const shared = edBatchSharedAccessCode.trim().toUpperCase();
        if (shared.length >= 4) newCode = shared;
      } else if (edBatchAccessCodeMode === 'individual_list') {
        const customIndividual = (edBatchIndividualCodesMap[st.id] || '').trim().toUpperCase();
        if (customIndividual.length >= 4) newCode = customIndividual;
      }
      if (newCode && newCode !== st.codigoAcceso) updatedCount++;
      else if (newCode) updatedCount++;
      return { ...st, codigoAcceso: newCode || st.codigoAcceso };
    });

    updateEditorStudentsBank(nextList);
    setEdStudentCodeDrafts({});
    const summaryMsg = `✓ Se actualizaron los Códigos de Acceso de ${updatedCount} estudiante(s) del curso.`;
    setEdBatchAccessCodeNotice(summaryMsg);
    setEdStudentBanner(summaryMsg);
  };

  const executeEdDeleteStudent = (studentId: string) => {
    updateEditorStudentsBank(courseStudentsBank.filter((s) => s.id !== studentId));
    setEdSelectedStudentIdsForBatch((prev) => prev.filter((id) => id !== studentId));
    setEdConfirmDeleteStudentId(null);
    setEdStudentBanner(`✓ Estudiante (${studentId}) retirado de la nómina del curso.`);
  };

  const executeEdBatchDeleteStudents = () => {
    if (edSelectedStudentIdsForBatch.length === 0) return;
    const toRemove = new Set(edSelectedStudentIdsForBatch);
    updateEditorStudentsBank(courseStudentsBank.filter((s) => !toRemove.has(s.id)));
    setEdSelectedStudentIdsForBatch([]);
    setEdConfirmBatchDeleteStudents(false);
    setEdStudentBanner(`✓ Se retiraron ${toRemove.size} estudiante(s) en lote del curso.`);
  };

  const handleEdUploadStudentExcelFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    forceMode?: 'merge' | 'replace'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedStudents = await parseStudentsFromExcelOrCsvFile(file, courseStudentsBank.length);
      if (parsedStudents.length === 0) {
        setEdBulkImportStatus(
          '⚠️ No se detectaron estudiantes válidos en el archivo. Verifique que incluya columnas de Documento/ID y Nombre.'
        );
        e.target.value = '';
        return;
      }
      const effectiveMode = forceMode ?? edBulkStudentsMode;
      let finalStudentsList: StudentRecord[] = [];
      if (effectiveMode === 'replace') {
        finalStudentsList = parsedStudents;
        updateEditorStudentsBank(parsedStudents);
        setEdBulkImportStatus(
          `✓ Nómina del curso reemplazada desde "${file.name}": ${parsedStudents.length} estudiantes activos.`
        );
      } else {
        const mapById = new Map<string, StudentRecord>();
        courseStudentsBank.forEach((s) => mapById.set(s.id, s));
        parsedStudents.forEach((item) => {
          const existing = mapById.get(item.id);
          if (existing) {
            mapById.set(item.id, {
              ...existing,
              nombre: item.nombre,
              correo: item.correo || existing.correo || '',
              whatsapp: item.whatsapp || existing.whatsapp || '',
              codigoAcceso: item.codigoAcceso || existing.codigoAcceso
            });
          } else {
            mapById.set(item.id, item);
          }
        });
        finalStudentsList = Array.from(mapById.values());
        updateEditorStudentsBank(finalStudentsList);
        setEdBulkImportStatus(
          `✓ Archivo "${file.name}" procesado: ${parsedStudents.length} estudiantes integrados (Total en el curso: ${finalStudentsList.length}).`
        );
      }
      setEdStudentBanner(
        `✓ Carga masiva completada desde "${file.name}" (${finalStudentsList.length} estudiantes en el curso).`
      );
    } catch {
      setEdBulkImportStatus(
        '⚠️ Error al leer el archivo Excel/CSV. Verifique que sea un archivo .xlsx, .xls o .csv válido.'
      );
    }
    e.target.value = '';
  };

  const handleEdBulkImportStudents = () => {
    const matrix = parseDelimitedTextToMatrix(edBulkStudentsText);
    const parsed = extractStudentsFromMatrix(matrix, courseStudentsBank.length);
    if (parsed.length === 0) {
      setEdBulkImportStatus(
        '⚠️ Pegue al menos una fila válida (Documento y Nombre) o suba su archivo Excel (.xlsx) / CSV arriba.'
      );
      return;
    }
    if (edBulkStudentsMode === 'replace') {
      updateEditorStudentsBank(parsed);
      setEdBulkImportStatus(`✓ Se reemplazó la nómina del curso con ${parsed.length} estudiantes.`);
    } else {
      const mapById = new Map<string, StudentRecord>();
      courseStudentsBank.forEach((s) => mapById.set(s.id, s));
      parsed.forEach((item) => {
        const existing = mapById.get(item.id);
        if (existing) {
          mapById.set(item.id, {
            ...existing,
            nombre: item.nombre,
            correo: item.correo || existing.correo || '',
            whatsapp: item.whatsapp || existing.whatsapp || '',
            codigoAcceso: item.codigoAcceso || existing.codigoAcceso
          });
        } else {
          mapById.set(item.id, item);
        }
      });
      const merged = Array.from(mapById.values());
      updateEditorStudentsBank(merged);
      setEdBulkImportStatus(
        `✓ Se procesaron ${parsed.length} registros. Total en la nómina del curso: ${merged.length} estudiantes.`
      );
    }
    setEdBulkStudentsText('');
  };

  const exportEdNominaCsv = () => {
    const headers = [
      'ID_Estudiante',
      'Nombre_Completo',
      'Correo_Electronico',
      'WhatsApp',
      'Codigo_Acceso_12_Caracteres'
    ];
    const rows = courseStudentsBank.map((st) => [
      st.id,
      st.nombre,
      st.correo || '',
      st.whatsapp || '',
      st.codigoAcceso
    ]);
    downloadCsv(
      `Nomina_Estudiantes_${(courseCode || activeMeta.codigoCurso || 'CURSO').toUpperCase()}_${
        courseStudentsBank.length
      }_Alumnos.csv`,
      headers,
      rows
    );
  };

  const exportEdNominaExcel = () => {
    const headers = [
      'ID_Estudiante',
      'Nombre_Completo',
      'Correo_Electronico',
      'WhatsApp',
      'Codigo_Acceso_12_Caracteres'
    ];
    const rows = courseStudentsBank.map((st) => [
      st.id,
      st.nombre,
      st.correo || '',
      st.whatsapp || '',
      st.codigoAcceso
    ]);
    downloadExcel(
      `Nomina_Estudiantes_${(courseCode || activeMeta.codigoCurso || 'CURSO').toUpperCase()}_${
        courseStudentsBank.length
      }_Alumnos.xlsx`,
      'Nomina_Estudiantes',
      headers,
      rows
    );
  };

  const updateEditorQuestionBank = (nextQuestions: Question[], targetQBankDbId?: string) => {
    setCourseQuestionsBank(nextQuestions);

    // Solo la ventana "Banco de preguntas" puede modificar bases de datos existentes,
    // y únicamente si se está editando una base de datos existente o se indicó targetQBankDbId.
    if (activeCard !== 'banco_preguntas') {
      return;
    }
    if (!editingQBankDbId && !targetQBankDbId) {
      return;
    }

    const effectiveDbId = targetQBankDbId || editingQBankDbId;
    if (!effectiveDbId) return;

    const existingDb = questionBankDatabases.find((d) => d.id === effectiveDbId);
    if (!existingDb) return;

    const updatedDbEntry: QuestionBankDatabaseEntry = {
      id: effectiveDbId,
      name:
        (editingQBankDbId === effectiveDbId && newQBankDbName.trim()) ||
        existingDb.name,
      code:
        (editingQBankDbId === effectiveDbId && newQBankDbCode.trim()) ||
        existingDb.code,
      description: existingDb.description || 'Base de datos de banco de preguntas',
      questions: nextQuestions,
      updatedAtIso: new Date().toISOString()
    };

    if (activeMeta.selectedQuestionBankDbId === effectiveDbId) {
      onUpdateQuestions(nextQuestions);
    }

    setLocalQBankDbs((prev) => {
      const filtered = prev.filter((d) => d && d.id && !String(d.id).startsWith('banco-curso-'));
      const exists = filtered.some((d) => d.id === effectiveDbId);
      return exists
        ? filtered.map((d) => (d.id === effectiveDbId ? updatedDbEntry : d))
        : [...filtered, updatedDbEntry];
    });

    onUpdateConfig((prev) => {
      const prevBanks = (Array.isArray(prev.questionBankDatabases)
        ? prev.questionBankDatabases
        : []).filter((d) => d && d.id && !String(d.id).startsWith('banco-curso-'));
      const existsInSaved = prevBanks.some((d) => d.id === effectiveDbId);
      const nextBanks = existsInSaved
        ? prevBanks.map((d) => (d.id === effectiveDbId ? updatedDbEntry : d))
        : [...prevBanks, updatedDbEntry];

      return {
        ...prev,
        questionBankDatabases: nextBanks,
        universalCoursesCatalog: (prev.universalCoursesCatalog || []).map((ws) => {
          const matchesSelectedBank = ws.meta.selectedQuestionBankDbId === effectiveDbId;
          if (matchesSelectedBank) {
            return {
              ...ws,
              questions: nextQuestions,
              questionsCount: nextQuestions.length
            };
          }
          return ws;
        })
      };
    });
  };

  const handleSelectQuestionBankDatabaseForCourse = (db: QuestionBankDatabaseEntry) => {
    const clonedQuestions = (db.questions || []).map((q) => ({
      ...q,
      opciones: { ...q.opciones }
    }));
    setSelectedQuestionBankDbId(db.id);
    setCourseQuestionsBank(clonedQuestions);
    showEditorNotice(
      `✓ Base de datos «${db.name}» (${clonedQuestions.length} preguntas) seleccionada para cargar en el curso.`
    );
  };

  const handleStartNewQuestionBankDatabaseTab = () => {
    setQBankWindowTab('crear');
    setEditingQBankDbId(null);
    setViewingQBankDbId(null);
    setNewQBankDbName('');
    setNewQBankDbCode('');
    setQBankNameError(false);
    setCourseQuestionsBank([]);
    setQSearch('');
    setQModFilter('all');
    setQCurrentPage(1);
    setBankActionNotice(
      'ℹ️ Ingrese obligatoriamente el «Nombre de la base de datos a crear *», agregue las preguntas (por pregunta individual o por lote) y haga clic en «Guardar base de datos».'
    );
  };

  const handleModifyQuestionBankDatabaseFromList = (db: QuestionBankDatabaseEntry) => {
    setQBankWindowTab('crear');
    setEditingQBankDbId(db.id);
    setViewingQBankDbId(null);
    setActiveQuestionBankDbId(db.id);
    setSelectedQuestionBankDbId(db.id);
    setNewQBankDbName(db.name);
    setNewQBankDbCode(db.code);
    setQBankNameError(false);
    setCourseQuestionsBank(
      (db.questions || []).map((q) => ({
        ...q,
        opciones: { ...q.opciones }
      }))
    );
    setQSearch('');
    setQModFilter('all');
    setQCurrentPage(1);
    setBankActionNotice(
      `✓ Modificando base de datos de Banco de preguntas: «${db.name}» (${db.questions.length} reactivos). Al terminar haga clic en «Guardar base de datos».`
    );
  };

  const handleSwitchActiveQuestionBankDbInWindow = (dbId: string) => {
    const found = questionBankDatabases.find((d) => d.id === dbId);
    if (!found) return;
    setActiveQuestionBankDbId(found.id);
    setViewingQBankDbId(found.id);
    setQBankWindowTab('listado');
  };

  const handleSaveQuestionBankDatabase = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = newQBankDbName.trim();
    if (!cleanName) {
      setQBankNameError(true);
      setBankActionNotice(
        '⚠️ Campo obligatorio (*): Debe ingresar el «Nombre de la base de datos a crear *» antes de guardar la base de datos.'
      );
      showEditorNotice(
        '⚠️ Campo obligatorio (*): Ingrese el Nombre de la base de datos a crear * antes de guardar.'
      );
      if (qBankNameInputRef.current) {
        qBankNameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        qBankNameInputRef.current.focus();
      }
      return;
    }

    setQBankNameError(false);

    const cleanCode =
      newQBankDbCode.trim().toUpperCase().replace(/\s+/g, '') ||
      `BCO-${cleanName
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 4) || 'DB'}-${String(questionBankDatabases.length + 1).padStart(2, '0')}`;

    const targetId = editingQBankDbId || `banco-custom-${Date.now().toString(36)}`;
    const clonedQuestions = courseQuestionsBank.map((q) => ({
      ...q,
      opciones: { ...q.opciones }
    }));

    const savedEntry: QuestionBankDatabaseEntry = {
      id: targetId,
      name: cleanName,
      code: cleanCode,
      description: `Banco de preguntas guardado por el Editor (${clonedQuestions.length} reactivos)`,
      questions: clonedQuestions,
      updatedAtIso: new Date().toISOString()
    };

    const fullBankMap = new Map<string, QuestionBankDatabaseEntry>();
    questionBankDatabases.forEach((d) => {
      if (d && d.id) fullBankMap.set(d.id, d);
    });
    fullBankMap.set(targetId, savedEntry);
    const mergedBankList = Array.from(fullBankMap.values());

    setLocalQBankDbs(mergedBankList);

    onUpdateConfig((prev) => {
      const nextDeleted = (prev.deletedQuestionBankDbIds || []).filter((id) => id !== targetId);

      return {
        ...prev,
        questionBankDatabases: mergedBankList,
        deletedQuestionBankDbIds: nextDeleted,
        universalCoursesCatalog: (prev.universalCoursesCatalog || []).map((ws) => {
          const isCourseBank = targetId === `banco-curso-${ws.meta.courseId}`;
          const isSelectedBank = ws.meta.selectedQuestionBankDbId === targetId;
          if (isCourseBank || isSelectedBank) {
            return {
              ...ws,
              meta: {
                ...ws.meta,
                selectedQuestionBankDbId: targetId,
                selectedQuestionBankDbName: cleanName
              },
              questions: clonedQuestions,
              questionsCount: clonedQuestions.length
            };
          }
          return ws;
        })
      };
    });

    setDeletedQBankDbIds((prev) => prev.filter((id) => id !== targetId));
    setEditingQBankDbId(targetId);
    setActiveQuestionBankDbId(targetId);
    setSelectedQuestionBankDbId(targetId);
    setNewQBankDbCode(cleanCode);
    setViewingQBankDbId(targetId);
    // Llevar automáticamente a la pantalla/ventana "Ver listado de bases de datos creados" con la base de datos creada
    setQBankWindowTab('listado');

    void handleExecuteServerSave(
      'panel_editor_banco_preguntas',
      `Base de datos de Banco de preguntas "${cleanName}" guardada`
    );
    setBankActionNotice(
      `✓ Base de datos «${cleanName} (${cleanCode})» guardada exitosamente con ${clonedQuestions.length} pregunta(s).`
    );
    showEditorNotice(
      `✓ Base de datos de Banco de preguntas «${cleanName}» guardada con ${clonedQuestions.length} pregunta(s).`
    );
  };

  const handleCreateNewQuestionBankDatabase = (e: React.FormEvent) => {
    handleSaveQuestionBankDatabase(e);
  };

  const handleDeleteQuestionBankDatabase = (dbId: string) => {
    const nextDeletedLocal = deletedQBankDbIds.includes(dbId)
      ? deletedQBankDbIds
      : [...deletedQBankDbIds, dbId];
    setDeletedQBankDbIds(nextDeletedLocal);
    const remainingBanks = questionBankDatabases.filter((d) => d.id !== dbId);
    setLocalQBankDbs(remainingBanks);
    onUpdateConfig((prev) => {
      const mergedDeleted = Array.from(
        new Set([...(prev.deletedQuestionBankDbIds || []), ...nextDeletedLocal, dbId])
      );
      return {
        ...prev,
        questionBankDatabases: remainingBanks,
        deletedQuestionBankDbIds: mergedDeleted
      };
    });
    setConfirmDeleteQBankDbId(null);
    if (viewingQBankDbId === dbId) {
      setViewingQBankDbId(null);
    }
    if (editingQBankDbId === dbId) {
      setEditingQBankDbId(null);
      setNewQBankDbName('');
      setNewQBankDbCode('');
    }
    if (activeQuestionBankDbId === dbId || selectedQuestionBankDbId === dbId) {
      const fallback = remainingBanks[0];
      if (fallback) {
        setActiveQuestionBankDbId(fallback.id);
        setSelectedQuestionBankDbId(fallback.id);
        setCourseQuestionsBank(
          fallback.questions.map((q) => ({ ...q, opciones: { ...q.opciones } }))
        );
      } else {
        setCourseQuestionsBank([]);
      }
    }
    void handleExecuteServerSave(
      'panel_editor_banco_preguntas',
      `Base de datos de Banco de preguntas eliminada en ventana Banco de preguntas`
    );
    showEditorNotice('✓ Base de datos de Banco de preguntas eliminada del listado.');
  };

  const savePreviousQuestionsSnapshot = (currentQuestions: Question[]) => {
    setPreviousQuestionsSnapshot(
      currentQuestions.map((q) => ({
        ...q,
        opciones: { ...q.opciones }
      }))
    );
  };

  const effectiveUndoQuestionsCount = previousQuestionsSnapshot
    ? previousQuestionsSnapshot.length
    : previousQuestionsSnapshotCount || 0;

  const triggerPrintView = (mode: 'examen_papel_plan_b') => {
    setPrintViewMode(mode);
    setTimeout(() => {
      window.print();
    }, 180);
  };

  // Sync Editor session active state with parent App
  useEffect(() => {
    onSessionActiveChange?.(isAuthenticated);
  }, [isAuthenticated, onSessionActiveChange]);

  // Respond to parent logout signal
  useEffect(() => {
    if (logoutSignal && logoutSignal > 0) {
      logoutEditor();
      setIsAuthenticated(false);
      setEditorUserInput('');
      setEditorPassInput('');
      setAuthDenied(false);
    }
  }, [logoutSignal, logoutEditor]);

  const showEditorNotice = (msg: string) => {
    setEditorBanner(msg);
    setTimeout(() => setEditorBanner(null), 5000);
  };

  // =========================================================================
  // LOGIN / LOGOUT HANDLERS
  // =========================================================================
  const handleEditorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedEditorUser = (config.editorUsuario || 'EDITOR2026').trim().toUpperCase();
    const expectedEditorPass = (config.editorClave || 'EDITOR2026').trim();

    const enteredId = editorUserInput.trim().replace(/[\s.-]/g, '').toUpperCase();
    const enteredPin = editorPassInput.trim();

    if (!enteredId || !enteredPin) {
      setAuthDenied(true);
      return;
    }

    if (enteredId === expectedEditorUser && enteredPin === expectedEditorPass) {
      setAuthDenied(false);
      setIsAuthenticated(true);
      loginEditor(enteredId);
      onForceServerSync?.();
      return;
    }

    const expectedTeacherId = (config.idDocente || 'DOCENTE2026').trim().toUpperCase();
    const matchedRegisteredTeacher = registeredTeachers.find(
      (t) =>
        t.activo !== false &&
        t.id.trim().replace(/[\s.-]/g, '').toUpperCase() === enteredId &&
        t.claveAcceso.trim() === enteredPin
    );
    const isMasterTeacherMatch =
      (enteredId === expectedTeacherId || enteredId === 'DOCENTE2026') &&
      enteredPin === config.claveDocente;

    if (isMasterTeacherMatch || matchedRegisteredTeacher) {
      setAuthDenied(false);
      loginTeacher(matchedRegisteredTeacher ? matchedRegisteredTeacher.id : enteredId);
      onSwitchToTeacherPanel?.();
      return;
    }

    const matchedStudent = students.find(
      (s) => s.id.trim().replace(/[\s.-]/g, '').toUpperCase() === enteredId
    );
    if (
      matchedStudent &&
      matchedStudent.codigoAcceso.trim().toUpperCase() === enteredPin.toUpperCase()
    ) {
      setAuthDenied(false);
      loginStudent(matchedStudent.id);
      onSwitchToStudentLogin?.();
      return;
    }

    setAuthDenied(true);
  };

  const handleLogoutEditor = () => {
    setIsAuthenticated(false);
    setEditorUserInput('');
    setEditorPassInput('');
    setAuthDenied(false);
    setActiveCard(null);
    logoutEditor();
    onGoToInitialHome?.();
  };

  // =========================================================================
  // HANDLER: GUARDAR SEGURIDAD Y CLAVE DEL EDITOR
  // =========================================================================
  const handleSaveEditorSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = secEditorName.trim();
    const cleanAccount = secEditorAccount.trim().replace(/\s+/g, '').toUpperCase();
    const cleanPass = secEditorPass.trim();
    const cleanEmail = secEditorEmail.trim();

    if (!cleanAccount || !cleanPass) {
      showEditorNotice('⚠️ La Cuenta del editor y la Clave de acceso son obligatorias.');
      return;
    }

    onUpdateConfig((prev) => ({
      ...prev,
      editorNombre: cleanName,
      editorUsuario: cleanAccount,
      editorClave: cleanPass,
      correoRecuperacionEditor: cleanEmail,
      requiereCambioClaveEditorInicial: false
    }));
    loginEditor(cleanAccount);
    await handleExecuteServerSave(
      'seguridad_editor_sesion',
      'Datos de la cuenta del Editor actualizados en el servidor'
    );
    setSecSaveStatus('✓ Datos de la cuenta del editor actualizados correctamente.');
    setTimeout(() => setSecSaveStatus(null), 4000);
  };

  // =========================================================================
  // HANDLERS: DOCENTES ACTIVOS (IMPORTAR BD, EXPORTAR BD, UNO POR UNO Y POR LOTES)
  // =========================================================================
  const handleExportActiveTeachersDB = () => {
    const payload = {
      type: 'EVALUAPLUS_ACTIVE_TEACHERS_DB_V1',
      exportedAtIso: new Date().toISOString(),
      teachersCount: registeredTeachers.length,
      registeredTeachers
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Base_Datos_Docentes_Activos_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showEditorNotice(
      `✓ Base de datos de docentes activos (${registeredTeachers.length}) exportada correctamente.`
    );
  };

  const handleImportActiveTeachersDB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      const nextMap = new Map<string, TeacherAccountRecord>();
      registeredTeachers.forEach((t) => nextMap.set(t.id.trim().toUpperCase(), t));

      if (lower.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rawTeachers: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.registeredTeachers)
          ? parsed.registeredTeachers
          : [];
        let importedCount = 0;
        rawTeachers.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const id = String(item.id ?? item.cuenta ?? item.usuario ?? '')
            .trim()
            .replace(/\s+/g, '')
            .toUpperCase();
          const nombre = String(item.nombre ?? '').trim();
          const claveAcceso = String(item.claveAcceso ?? item.clave ?? '').trim();
          const correo = String(item.correo ?? '').trim();
          if (!id || !nombre || !claveAcceso) return;
          const prev = nextMap.get(id);
          nextMap.set(id, {
            id,
            nombre,
            claveAcceso,
            correo: correo || prev?.correo || '',
            activo: true,
            esTitularPrincipal: prev?.esTitularPrincipal || false,
            cursosAsignadosIds:
              Array.isArray(item.cursosAsignadosIds) && item.cursosAsignadosIds.length > 0
                ? item.cursosAsignadosIds
                : prev?.cursosAsignadosIds || (activeMeta.courseId ? [activeMeta.courseId] : []),
            updatedAtIso: new Date().toISOString()
          });
          importedCount++;
        });

        if (importedCount === 0) {
          showEditorNotice('⚠️ El archivo JSON no contiene registros de docentes válidos.');
          return;
        }

        const updatedList = Array.from(nextMap.values());
        onUpdateConfig((prev) => ({
          ...prev,
          idDocente: prev.idDocente || updatedList[0]?.id,
          claveDocente: prev.idDocente ? prev.claveDocente : updatedList[0]?.claveAcceso || '',
          registeredTeachers: updatedList
        }));
        showEditorNotice(
          `✓ Se importaron ${importedCount} docente(s) a la base de datos de docentes activos.`
        );
      } else {
        await handleUploadTeachersBatchFileFromBuffer(file);
      }
    } catch {
      showEditorNotice('⚠️ No se pudo importar el archivo de base de datos de docentes.');
    }
  };

  const handleUploadTeachersBatchFileFromBuffer = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    if (!rows || rows.length === 0) return;

    const parsedTeachers: BatchTeacherDraftRow[] = [];
    rows.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length < 3) return;
      const c0 = String(row[0] ?? '').trim();
      const c1 = String(row[1] ?? '').trim();
      const c2 = String(row[2] ?? '').trim();
      const c3 = String(row[3] ?? '').trim();
      if (
        idx === 0 &&
        (c0.toLowerCase().includes('nombre') || c1.toLowerCase().includes('cuenta'))
      ) {
        return;
      }
      if (c0 && c1 && c2) {
        parsedTeachers.push({
          nombre: c0,
          cuenta: c1.replace(/\s+/g, '').toUpperCase(),
          clave: c2,
          correo: c3
        });
      }
    });

    if (parsedTeachers.length === 0) {
      showEditorNotice(
        '⚠️ El archivo no contiene filas válidas (Nombre, Cuenta, Clave, Correo).'
      );
      return;
    }

    const nextMap = new Map<string, TeacherAccountRecord>();
    registeredTeachers.forEach((t) => nextMap.set(t.id.trim().toUpperCase(), t));
    parsedTeachers.forEach((item) => {
      const prev = nextMap.get(item.cuenta);
      nextMap.set(item.cuenta, {
        id: item.cuenta,
        nombre: item.nombre,
        claveAcceso: item.clave,
        correo: item.correo || prev?.correo || '',
        activo: true,
        esTitularPrincipal: prev?.esTitularPrincipal || false,
        cursosAsignadosIds:
          prev?.cursosAsignadosIds || (activeMeta.courseId ? [activeMeta.courseId] : []),
        updatedAtIso: new Date().toISOString()
      });
    });

    const updatedList = Array.from(nextMap.values());
    onUpdateConfig((prev) => ({
      ...prev,
      idDocente: prev.idDocente || updatedList[0]?.id,
      claveDocente: prev.idDocente ? prev.claveDocente : updatedList[0]?.claveAcceso || '',
      registeredTeachers: updatedList
    }));
    showEditorNotice(
      `✓ ${parsedTeachers.length} docente(s) importados desde "${file.name}".`
    );
  };

  const handleUploadTeachersBatchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await handleUploadTeachersBatchFileFromBuffer(file);
    } catch {
      showEditorNotice('⚠️ Error al leer el archivo de docentes por lotes.');
    }
  };

  const handleAddSingleTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTeacherName.trim();
    const cleanAccount = newTeacherAccount.trim().replace(/\s+/g, '').toUpperCase();
    const cleanPass = newTeacherPass.trim();
    const cleanEmail = newTeacherEmail.trim();

    if (!cleanName || !cleanAccount || !cleanPass) {
      showEditorNotice('⚠️ Ingrese Nombre, Cuenta y Clave de acceso del docente.');
      return;
    }

    const exists = registeredTeachers.some(
      (t) => t.id.trim().toUpperCase() === cleanAccount
    );

    const newRecord: TeacherAccountRecord = {
      id: cleanAccount,
      nombre: cleanName,
      claveAcceso: cleanPass,
      correo: cleanEmail,
      activo: true,
      esTitularPrincipal: registeredTeachers.length === 0,
      cursosAsignadosIds: activeMeta.courseId ? [activeMeta.courseId] : [],
      updatedAtIso: new Date().toISOString()
    };

    const updatedTeachers = exists
      ? registeredTeachers.map((t) =>
          t.id.trim().toUpperCase() === cleanAccount ? { ...t, ...newRecord } : t
        )
      : [...registeredTeachers, newRecord];

    onUpdateConfig((prev) => ({
      ...prev,
      idDocente: prev.idDocente || cleanAccount,
      claveDocente: prev.idDocente ? prev.claveDocente : cleanPass,
      registeredTeachers: updatedTeachers
    }));

    setNewTeacherName('');
    setNewTeacherAccount('');
    setNewTeacherPass('');
    setNewTeacherEmail('');
    showEditorNotice(
      exists
        ? `✓ Datos del docente «${cleanName} (${cleanAccount})» actualizados.`
        : `✓ Docente «${cleanName} (${cleanAccount})» agregado correctamente.`
    );
  };

  const handleSaveBatchTeachersRows = (e: React.FormEvent) => {
    e.preventDefault();
    const validFromTable = batchRows
      .map((r) => ({
        nombre: r.nombre.trim(),
        cuenta: r.cuenta.trim().replace(/\s+/g, '').toUpperCase(),
        clave: r.clave.trim(),
        correo: r.correo.trim()
      }))
      .filter((r) => r.nombre && r.cuenta && r.clave);

    const validFromText = batchRawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[;\t,]/).map((p) => p.trim());
        return {
          nombre: parts[0] || '',
          cuenta: (parts[1] || '').replace(/\s+/g, '').toUpperCase(),
          clave: parts[2] || '',
          correo: parts[3] || ''
        };
      })
      .filter((r) => r.nombre && r.cuenta && r.clave);

    const combined = [...validFromTable, ...validFromText];
    if (combined.length === 0) {
      showEditorNotice(
        '⚠️ Complete al menos un docente con Nombre, Cuenta y Clave de acceso.'
      );
      return;
    }

    const nextMap = new Map<string, TeacherAccountRecord>();
    registeredTeachers.forEach((t) => {
      nextMap.set(t.id.trim().toUpperCase(), t);
    });

    combined.forEach((item) => {
      const prev = nextMap.get(item.cuenta);
      nextMap.set(item.cuenta, {
        id: item.cuenta,
        nombre: item.nombre,
        claveAcceso: item.clave,
        correo: item.correo || prev?.correo || '',
        activo: true,
        esTitularPrincipal: prev?.esTitularPrincipal || false,
        cursosAsignadosIds:
          prev?.cursosAsignadosIds || (activeMeta.courseId ? [activeMeta.courseId] : []),
        updatedAtIso: new Date().toISOString()
      });
    });

    const updatedTeachers = Array.from(nextMap.values());
    onUpdateConfig((prev) => ({
      ...prev,
      registeredTeachers: updatedTeachers
    }));

    setBatchRows([
      { nombre: '', cuenta: '', clave: '', correo: '' },
      { nombre: '', cuenta: '', clave: '', correo: '' }
    ]);
    setBatchRawText('');
    showEditorNotice(`✓ Se agregaron/actualizaron ${combined.length} docente(s) por lotes.`);
  };

  const handleDeleteTeacherAccount = (teacherIdToDelete: string) => {
    const updatedTeachers = registeredTeachers.filter((t) => t.id !== teacherIdToDelete);
    onUpdateConfig((prev) => ({
      ...prev,
      registeredTeachers: updatedTeachers
    }));
    setConfirmDeleteTeacherId(null);
    showEditorNotice(`✓ Docente «${teacherIdToDelete}» eliminado.`);
  };

  // =========================================================================
  // HANDLERS: CURSOS CREADOS / ACTIVOS (MODIFICAR, DUPLICAR, ELIMINAR)
  // =========================================================================
  const resetNewCourseForm = () => {
    setEditingCourseId(null);
    setCourseName('');
    setCourseCode('');
    setCourseSubjectName('');
    setCourseSede('');
    setAssignedTeacherAccount('');
    setAssignedTeacherPass('');
    setAssignedTeacherName('');
    setCourseModules([createEmptyModule(1)]);
    setGlobalCourseWeightPct(0);
    const defaultRosterDb =
      studentRosterDatabases.find((d) => d.id === activeRosterDbId) || studentRosterDatabases[0];
    const defaultQBankDb =
      questionBankDatabases.find((d) => d.id === activeQuestionBankDbId) ||
      questionBankDatabases[0];
    setSelectedStudentRosterDbId(defaultRosterDb ? defaultRosterDb.id : '');
    setSelectedQuestionBankDbId(defaultQBankDb ? defaultQBankDb.id : '');
    setCourseStudentsBank(
      defaultRosterDb ? (defaultRosterDb.students || []).map((s) => ({ ...s })) : []
    );
    setCourseQuestionsBank(
      defaultQBankDb
        ? (defaultQBankDb.questions || []).map((q) => ({ ...q, opciones: { ...q.opciones } }))
        : []
    );
    setEnableFinalIntegralExam(false);
    setFinalIntegralDurationMin(80);
    setEdStudentSearch('');
    setEdSelectedStudentIdsForBatch([]);
    setEdStudentBanner(null);
    setQSearch('');
    setQModFilter('all');
    setQCurrentPage(1);
    setBankActionNotice(null);
  };

  const loadCourseIntoEditorForm = (ws: UniversalCourseWorkspace) => {
    const m = ws.meta;
    setEditingCourseId(m.courseId);
    setCourseName(m.nombreCurso || '');
    setCourseCode(m.codigoCurso || '');
    setCourseSubjectName(m.nombreAsignatura || m.programaAcademico || '');
    setCourseSede(m.institucionSede || '');
    const assignedT = registeredTeachers.find((t) => t.id === m.docenteAsignadoId);
    setAssignedTeacherAccount(m.docenteAsignadoId || assignedT?.id || '');
    setAssignedTeacherPass(m.docenteAsignadoClave || assignedT?.claveAcceso || '');
    setAssignedTeacherName(m.docenteResponsable || assignedT?.nombre || '');
    setCourseModules(
      Array.isArray(m.modulosCurso) && m.modulosCurso.length > 0
        ? m.modulosCurso.map((mod, idx) => ({
            ...mod,
            id: idx + 1,
            horasModulo: mod.horasModulo ?? '',
            description: mod.description ?? '',
            observacion: mod.observacion ?? '',
            temasModulo:
              Array.isArray(mod.temasModulo) && mod.temasModulo.length > 0
                ? mod.temasModulo
                : [''],
            asistenciaBloqueA: mod.asistenciaBloqueA !== false,
            asistenciaBloqueB: mod.asistenciaBloqueB !== false,
            ponderacion: mod.ponderacion || { ...DEFAULT_MODULE_GRADING_WEIGHTS }
          }))
        : [createEmptyModule(1)]
    );
    setGlobalCourseWeightPct(m.ponderacionGlobalCursoPct ?? config.ponderacionTeoriaPct ?? 100);
    const matchedRosterDb =
      studentRosterDatabases.find((d) => d.id === m.selectedStudentRosterDbId) ||
      studentRosterDatabases.find(
        (d) =>
          Array.isArray(ws.students) &&
          ws.students.length > 0 &&
          d.students.length === ws.students.length &&
          d.students[0]?.id === ws.students[0]?.id
      ) ||
      studentRosterDatabases[0];
    const matchedBankDb =
      questionBankDatabases.find((d) => d.id === m.selectedQuestionBankDbId) ||
      questionBankDatabases.find(
        (d) =>
          Array.isArray(ws.questions) &&
          ws.questions.length > 0 &&
          d.questions.length === ws.questions.length &&
          d.questions[0]?.id === ws.questions[0]?.id
      ) ||
      questionBankDatabases[0];
    setSelectedStudentRosterDbId(matchedRosterDb ? matchedRosterDb.id : '');
    setSelectedQuestionBankDbId(matchedBankDb ? matchedBankDb.id : '');
    setCourseStudentsBank(
      Array.isArray(ws.students) && ws.students.length > 0
        ? ws.students.map((s) => ({ ...s }))
        : matchedRosterDb
        ? matchedRosterDb.students.map((s) => ({ ...s }))
        : []
    );
    setCourseQuestionsBank(
      Array.isArray(ws.questions) && ws.questions.length > 0
        ? ws.questions.map((q) => ({ ...q, opciones: { ...q.opciones } }))
        : matchedBankDb
        ? matchedBankDb.questions.map((q) => ({ ...q, opciones: { ...q.opciones } }))
        : []
    );
    setEnableFinalIntegralExam(m.habilitarExamenIntegral !== false);
    const integralExam = m.examenesCurso?.find((e) => e.id === 'integral');
    setFinalIntegralDurationMin(integralExam?.durationMinutes || 80);
    setEdStudentSearch('');
    setEdSelectedStudentIdsForBatch([]);
    setEdStudentBanner(null);
    setCreateCourseOption('nuevo');
    setActiveCard('crear_nuevo_curso');
  };

  const handleDuplicateCourse = (ws: UniversalCourseWorkspace) => {
    const baseCode = (ws.meta.codigoCurso || 'CUR').slice(0, 4).toUpperCase();
    const newCode = `${baseCode}C`.slice(0, 6);
    const newCourseId = `curso-${newCode.toLowerCase()}-${Date.now().toString(36)}`;
    const duplicatedMeta: UniversalCourseMetadata = {
      ...ws.meta,
      courseId: newCourseId,
      nombreCurso: `${ws.meta.nombreCurso} (Copia)`,
      codigoCurso: newCode,
      modulosCurso: Array.isArray(ws.meta.modulosCurso)
        ? ws.meta.modulosCurso.map((m) => ({
            ...m,
            temasModulo: Array.isArray(m.temasModulo) ? [...m.temasModulo] : [''],
            ponderacion: m.ponderacion ? { ...m.ponderacion } : { ...DEFAULT_MODULE_GRADING_WEIGHTS },
            documentosEnlaces: Array.isArray(m.documentosEnlaces) ? [...m.documentosEnlaces] : []
          }))
        : [],
      examenesCurso: Array.isArray(ws.meta.examenesCurso)
        ? ws.meta.examenesCurso.map((ex) => ({ ...ex }))
        : [],
      updatedAtIso: new Date().toISOString()
    };

    const duplicatedQuestions = Array.isArray(ws.questions)
      ? ws.questions.map((q, idx) => ({
          ...q,
          id: `${newCode}-M${q.modulo}-Q${idx + 1}`
        }))
      : [];
    const duplicatedRetos = generateBaseRetosForCourseModules(duplicatedMeta);

    const duplicatedWs: UniversalCourseWorkspace = {
      meta: duplicatedMeta,
      studentsCount: 0,
      questionsCount: duplicatedQuestions.length,
      attemptsCount: 0,
      retosCount: duplicatedRetos.length,
      students: [],
      questions: duplicatedQuestions,
      attempts: [],
      abproEvaluations: [],
      customMiniRetos: duplicatedRetos,
      academicDataset: buildInitialAcademicDataset([])
    };

    const nextCatalog = [...catalog, duplicatedWs];
    onUpdateConfig((prev) => ({
      ...prev,
      universalCoursesCatalog: nextCatalog
    }));
    showEditorNotice(
      `✓ Curso duplicado como «${duplicatedMeta.nombreCurso} (${duplicatedMeta.codigoCurso})».`
    );
  };

  const handleSwitchActiveCourseInEditor = (targetCourseId: string) => {
    const targetWorkspace = catalog.find((c) => c.meta.courseId === targetCourseId);
    if (!targetWorkspace) return;

    const savedCatalog = catalog.map((ws) =>
      ws.meta.courseId === activeMeta.courseId
        ? {
            ...ws,
            meta: activeMeta,
            studentsCount: students.length,
            questionsCount: questions.length,
            attemptsCount: attempts.length,
            retosCount: customMiniRetos.length,
            students,
            questions,
            attempts,
            abproEvaluations,
            customMiniRetos,
            academicDataset
          }
        : ws
    );

    const nextStudents = Array.isArray(targetWorkspace.students) ? targetWorkspace.students : [];
    const nextQuestions = Array.isArray(targetWorkspace.questions)
      ? targetWorkspace.questions
      : [];
    const nextAttempts = Array.isArray(targetWorkspace.attempts) ? targetWorkspace.attempts : [];
    const nextAbpro = Array.isArray(targetWorkspace.abproEvaluations)
      ? targetWorkspace.abproEvaluations
      : [];
    const nextRetos = Array.isArray(targetWorkspace.customMiniRetos)
      ? targetWorkspace.customMiniRetos
      : [];
    const nextAcademic = targetWorkspace.academicDataset
      ? normalizeAndSyncAcademicDataset(targetWorkspace.academicDataset, nextStudents)
      : buildInitialAcademicDataset(nextStudents);

    onUpdateStudents(nextStudents);
    onUpdateQuestions(nextQuestions);
    onUpdateAttempts(nextAttempts);
    onUpdateABProEvaluations(nextAbpro);
    onUpdateCustomMiniRetos(nextRetos);
    onUpdateAcademicDataset?.(nextAcademic);

    onUpdateConfig((prev) => ({
      ...prev,
      activeCourseId: targetWorkspace.meta.courseId,
      activeCourseMeta: targetWorkspace.meta,
      universalCoursesCatalog: savedCatalog
    }));

    showEditorNotice(
      `✓ Curso «${targetWorkspace.meta.nombreCurso} (${targetWorkspace.meta.codigoCurso})» activado.`
    );
  };

  const handleDeleteCourse = (courseIdToDelete: string) => {
    // Snapshot all current databases in Nominas de estudiantes and Banco de preguntas
    // so deleting a course (or all courses) NEVER deletes any database entry.
    const preservedRosters = studentRosterDatabases.map((db) => ({
      ...db,
      students: (db.students || []).map((s) => ({ ...s }))
    }));
    const preservedQuestionBanks = questionBankDatabases.map((db) => ({
      ...db,
      questions: (db.questions || []).map((q) => ({ ...q, opciones: { ...q.opciones } }))
    }));

    const remaining = catalog.filter((c) => c.meta.courseId !== courseIdToDelete);
    if (remaining.length === 0) {
      const emptyMeta: UniversalCourseMetadata = {
        courseId: '',
        nombreCurso: '',
        codigoCurso: '',
        programaAcademico: '',
        nombreAsignatura: '',
        institucionSede: '',
        periodoAcademico: '',
        docenteResponsable: '',
        descripcionGeneral: '',
        cantidadModulos: 0,
        cantidadExamenes: 0,
        cantidadRetos: 0,
        habilitarExamenIntegral: false,
        modulosCurso: [],
        examenesCurso: [],
        updatedAtIso: new Date().toISOString()
      };
      onUpdateAttempts([]);
      onUpdateABProEvaluations([]);
      onUpdateCustomMiniRetos([]);
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: '',
        activeCourseMeta: emptyMeta,
        universalCoursesCatalog: [],
        studentRosterDatabases: preservedRosters,
        questionBankDatabases: preservedQuestionBanks
      }));
      if (editingCourseId === courseIdToDelete) {
        setEditingCourseId(null);
      }
      void handleExecuteServerSave(
        'panel_editor_cursos_docentes',
        'Curso eliminado conservando intactas las bases de datos de Nóminas y Banco de preguntas'
      );
      showEditorNotice(
        '✓ Curso eliminado. Las bases de datos de «Nominas de estudiantes» y «Banco de preguntas» se mantienen intactas.'
      );
      return;
    }

    const nextActive = remaining[0];
    onUpdateStudents(nextActive.students || []);
    onUpdateQuestions(nextActive.questions || []);
    onUpdateAttempts(nextActive.attempts || []);
    onUpdateABProEvaluations(nextActive.abproEvaluations || []);
    onUpdateCustomMiniRetos(nextActive.customMiniRetos || []);
    onUpdateAcademicDataset?.(
      nextActive.academicDataset || buildInitialAcademicDataset(nextActive.students || [])
    );
    onUpdateConfig((prev) => ({
      ...prev,
      activeCourseId: nextActive.meta.courseId,
      activeCourseMeta: nextActive.meta,
      universalCoursesCatalog: remaining,
      studentRosterDatabases: preservedRosters,
      questionBankDatabases: preservedQuestionBanks
    }));
    if (editingCourseId === courseIdToDelete) {
      setEditingCourseId(null);
    }
    void handleExecuteServerSave(
      'panel_editor_cursos_docentes',
      'Curso eliminado del catálogo conservando intactas las bases de datos de Nóminas y Banco de preguntas'
    );
    showEditorNotice(
      '✓ Curso eliminado del catálogo. Las bases de datos de «Nominas de estudiantes» y «Banco de preguntas» se mantienen intactas.'
    );
  };

  // Module manipulation inside "Crear nuevo curso"
  const handleAddAnotherModule = () => {
    setCourseModules((prev) => [...prev, createEmptyModule(prev.length + 1)]);
  };

  const handleRemoveModule = (idxToRemove: number) => {
    if (courseModules.length <= 1) return;
    setCourseModules((prev) =>
      prev
        .filter((_, idx) => idx !== idxToRemove)
        .map((m, newIdx) => ({
          ...m,
          id: newIdx + 1,
          code: `M${newIdx + 1}`,
          fullTitle: `Módulo ${newIdx + 1}: ${m.shortTitle || ''}`
        }))
    );
  };

  const updateModuleAt = (
    idx: number,
    updater: (mod: UniversalModuleDefinition) => UniversalModuleDefinition
  ) => {
    setCourseModules((prev) => prev.map((m, i) => (i === idx ? updater(m) : m)));
  };

  // Topic ("Crear tema" / "Crear otro tema") helpers inside a module
  const handleAddTopicToModule = (modIdx: number) => {
    updateModuleAt(modIdx, (m) => {
      const currentTopics =
        Array.isArray(m.temasModulo) && m.temasModulo.length > 0 ? m.temasModulo : [''];
      return {
        ...m,
        temasModulo: [...currentTopics, '']
      };
    });
  };

  const handleUpdateTopicInModule = (modIdx: number, topicIdx: number, value: string) => {
    updateModuleAt(modIdx, (m) => {
      const currentTopics =
        Array.isArray(m.temasModulo) && m.temasModulo.length > 0 ? [...m.temasModulo] : [''];
      currentTopics[topicIdx] = value;
      return {
        ...m,
        temasModulo: currentTopics
      };
    });
  };

  const handleRemoveTopicFromModule = (modIdx: number, topicIdx: number) => {
    updateModuleAt(modIdx, (m) => {
      const currentTopics = Array.isArray(m.temasModulo) ? m.temasModulo : [''];
      if (currentTopics.length <= 1) return { ...m, temasModulo: [''] };
      return {
        ...m,
        temasModulo: currentTopics.filter((_, i) => i !== topicIdx)
      };
    });
  };

  // =========================================================================
  // HANDLERS COMPLETOS DEL BANCO DE PREGUNTAS (EN BASE DE DATOS DE PREGUNTAS/RESPUESTAS DE TODOS LOS MÓDULOS CARGADOS)
  // =========================================================================
  const openNewQuestionModal = () => {
    setEditingQuestion(null);
    const defaultModId = (courseModules[0]?.id || 1) as 1 | 2 | 3 | 4 | 5;
    const nextNum = courseQuestionsBank.length + 1;
    setQFormId(`M${defaultModId}-NEW-${String(nextNum).padStart(2, '0')}`);
    setQFormModulo(defaultModId);
    setQFormTema(courseModules[0]?.shortTitle || '');
    setQFormBloom('Comprensión');
    setQFormEnunciado('');
    setQFormA('');
    setQFormB('');
    setQFormC('');
    setQFormD('');
    setQFormCorrecta('A');
    setQFormJustificacion('');
    setQModalOpen(true);
  };

  const openEditQuestionModal = (q: Question) => {
    setEditingQuestion(q);
    setQFormId(q.id);
    setQFormModulo(q.modulo);
    setQFormTema(q.tema);
    setQFormBloom(q.bloom);
    setQFormEnunciado(q.enunciado);
    setQFormA(q.opciones.A);
    setQFormB(q.opciones.B);
    setQFormC(q.opciones.C);
    setQFormD(q.opciones.D);
    setQFormCorrecta(q.correcta);
    setQFormJustificacion(q.justificacion);
    setQModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qFormEnunciado.trim() || !qFormA.trim() || !qFormB.trim()) return;

    savePreviousQuestionsSnapshot(courseQuestionsBank);

    const newQ: Question = {
      id: qFormId.trim() || `M${qFormModulo}-${Date.now()}`,
      modulo: (qFormModulo as 1 | 2 | 3 | 4 | 5) || 1,
      tema: qFormTema.trim() || `Tema Módulo ${qFormModulo}`,
      bloom: qFormBloom,
      enunciado: qFormEnunciado.trim(),
      opciones: {
        A: qFormA.trim(),
        B: qFormB.trim(),
        C: qFormC.trim(),
        D: qFormD.trim()
      },
      correcta: qFormCorrecta,
      justificacion:
        qFormJustificacion.trim() ||
        'Respuesta fundamentada en el marco teórico del módulo.'
    };

    if (editingQuestion) {
      updateEditorQuestionBank(
        courseQuestionsBank.map((item) => (item.id === editingQuestion.id ? newQ : item))
      );
      setBankActionNotice(`✓ Pregunta ${newQ.id} modificada correctamente.`);
    } else {
      updateEditorQuestionBank([newQ, ...courseQuestionsBank]);
      setBankActionNotice(`✓ Nueva pregunta ${newQ.id} agregada al banco.`);
    }
    setQModalOpen(false);
  };

  const handleUploadQuestionFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    forceMode?: 'merge' | 'replace'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedQuestions = await parseQuestionsFromAnyFile(file, courseQuestionsBank.length);
      if (parsedQuestions.length === 0) {
        const msg =
          '⚠️ El archivo seleccionado no contiene preguntas con el formato requerido (verifique que tenga Pregunta/Enunciado y Opciones).';
        setBulkQFeedback(msg);
        setBankActionNotice(msg);
        showEditorNotice(msg);
        e.target.value = '';
        return;
      }

      savePreviousQuestionsSnapshot(courseQuestionsBank);
      const effectiveMode = forceMode ?? bulkQMode;

      if (effectiveMode === 'replace') {
        updateEditorQuestionBank(parsedQuestions);
        setQModFilter('all');
        setQCurrentPage(1);
        const msg = `✓ Banco actualizado con "${file.name}": ${parsedQuestions.length} reactivos activos ahora en el banco.`;
        setBulkQFeedback(msg);
        setBankActionNotice(msg);
        showEditorNotice(msg);
        void handleExecuteServerSave('banco_preguntas', msg);
      } else {
        const mapById = new Map<string, Question>();
        courseQuestionsBank.forEach((q) => mapById.set(q.id.toUpperCase(), q));
        let updatedCount = 0;
        let addedCount = 0;
        parsedQuestions.forEach((q) => {
          const key = q.id.toUpperCase();
          if (mapById.has(key)) updatedCount++;
          else addedCount++;
          mapById.set(key, q);
        });
        const merged = Array.from(mapById.values());
        updateEditorQuestionBank(merged);
        setQModFilter('all');
        setQCurrentPage(1);
        const msg = `✓ Archivo "${file.name}" procesado: ${addedCount} agregadas y ${updatedCount} actualizadas (Total: ${merged.length} preguntas).`;
        setBulkQFeedback(msg);
        setBankActionNotice(msg);
        showEditorNotice(msg);
        void handleExecuteServerSave('banco_preguntas', msg);
      }
    } catch {
      const errMsg =
        '⚠️ Error al leer el archivo de preguntas (.xlsx, .xls, .json o .csv). Verifique la estructura del archivo.';
      setBulkQFeedback(errMsg);
      setBankActionNotice(errMsg);
      showEditorNotice(errMsg);
    }
    e.target.value = '';
  };

  const handleBulkImportQuestions = () => {
    const trimmed = bulkQText.trim();
    if (!trimmed) {
      setBulkQFeedback(
        '⚠️ Pegue datos en el cuadro de texto o suba un archivo Excel (.xlsx), JSON o CSV arriba.'
      );
      return;
    }

    let parsedQuestions: Question[] = normalizeQuestionList(trimmed);
    if (parsedQuestions.length === 0) {
      parsedQuestions = extractQuestionsFromMatrix(
        parseDelimitedTextToMatrix(trimmed),
        courseQuestionsBank.length
      );
    }

    if (parsedQuestions.length === 0) {
      setBulkQFeedback(
        '⚠️ No se detectaron preguntas válidas. Asegúrese de incluir Pregunta/Enunciado y las opciones de respuesta. Consulte el botón "Estructura para Cargar Preguntas".'
      );
      return;
    }

    savePreviousQuestionsSnapshot(courseQuestionsBank);

    if (bulkQMode === 'replace') {
      updateEditorQuestionBank(parsedQuestions);
      setQModFilter('all');
      setQCurrentPage(1);
      const msg = `✓ Banco reemplazado exitosamente con ${parsedQuestions.length} preguntas.`;
      setBulkQFeedback(msg);
      setBankActionNotice(
        `✓ Se cargó un nuevo lote reemplazando el banco (${parsedQuestions.length} preguntas activas). Puede usar "Deshacer Última Carga" si desea revertir.`
      );
      showEditorNotice(msg);
      void handleExecuteServerSave('banco_preguntas', msg);
    } else {
      const mapById = new Map<string, Question>();
      courseQuestionsBank.forEach((q) => mapById.set(q.id.toUpperCase(), q));
      let updatedCount = 0;
      let addedCount = 0;

      parsedQuestions.forEach((q) => {
        const key = q.id.toUpperCase();
        if (mapById.has(key)) {
          updatedCount++;
        } else {
          addedCount++;
        }
        mapById.set(key, q);
      });

      const merged = Array.from(mapById.values());
      updateEditorQuestionBank(merged);
      setQModFilter('all');
      setQCurrentPage(1);
      const msg = `✓ Lote procesado: ${addedCount} preguntas nuevas agregadas y ${updatedCount} actualizadas (Total: ${merged.length}).`;
      setBulkQFeedback(msg);
      setBankActionNotice(
        `✓ Lote masivo procesado: +${addedCount} nuevas, ${updatedCount} actualizadas (Total en banco: ${merged.length}).`
      );
      showEditorNotice(msg);
      void handleExecuteServerSave('banco_preguntas', msg);
    }

    setBulkQText('');
  };

  const handleUndoLastQuestionBatch = async () => {
    if (previousQuestionsSnapshot) {
      const restoredCount = previousQuestionsSnapshot.length;
      updateEditorQuestionBank(previousQuestionsSnapshot);
      setPreviousQuestionsSnapshot(null);
      setQCurrentPage(1);
      setBankActionNotice(
        `✓ Se deshizo la última carga/modificación. El banco volvió a su estado anterior (${restoredCount} preguntas).`
      );
      return;
    }
    if (onUndoQuestionsSnapshot) {
      const restoredCountFromServer = await onUndoQuestionsSnapshot();
      if (typeof restoredCountFromServer === 'number') {
        setQCurrentPage(1);
        setBankActionNotice(
          `✓ Se deshizo la última carga/modificación y se sincronizó con el servidor (${restoredCountFromServer} preguntas restauradas).`
        );
      }
    }
  };

  const handleClearAllQuestions = () => {
    savePreviousQuestionsSnapshot(courseQuestionsBank);
    updateEditorQuestionBank([]);
    setConfirmClearAllQuestions(false);
    setQCurrentPage(1);
    setBankActionNotice(
      '⚠️ Se eliminaron todas las preguntas del banco oficial. Puede pulsar "Deshacer Última Carga de Preguntas" para recuperarlas.'
    );
  };

  const handleRestoreOfficialUnifiedBank = () => {
    savePreviousQuestionsSnapshot(courseQuestionsBank);
    const clonedOfficial = INITIAL_QUESTIONS.map((q) => ({
      ...q,
      opciones: { ...q.opciones }
    }));
    updateEditorQuestionBank(clonedOfficial);
    setConfirmRestoreOfficialBank(false);
    setQModFilter('all');
    setQSearch('');
    setQCurrentPage(1);
    setBankActionNotice(
      `✓ Banco Oficial Unificado 2026 restaurado con éxito (${clonedOfficial.length} reactivos cargados).`
    );
  };

  const handleEqualizeQuestionBankIA = async (mode: 'fast' | 'ai_deep' = 'ai_deep') => {
    if (courseQuestionsBank.length === 0 || isEqualizingBankIA) return;
    setIsEqualizingBankIA(true);
    savePreviousQuestionsSnapshot(courseQuestionsBank);
    try {
      const equalized = equalizeQuestionBank(courseQuestionsBank);
      updateEditorQuestionBank(equalized);
      setBankActionNotice(
        mode === 'ai_deep'
          ? `✓ Se blindaron y ecualizaron las opciones de las ${equalized.length} preguntas con IA Psicométrica: distractores con cascarita, mini-explicación en las 4 opciones y longitud equilibrada.`
          : `✓ Se ecualizaron todas las ${equalized.length} preguntas del banco: las 4 opciones (A, B, C y D) tienen ahora extensión y estructura argumentativa homogénea con distractores de cascarita.`
      );
    } finally {
      setIsEqualizingBankIA(false);
    }
  };

  const exportQuestionsCsv = () => {
    const headers = [
      'ID_Pregunta',
      'Modulo',
      'Nivel_Bloom',
      'Tema',
      'Enunciado',
      'Opcion_A',
      'Opcion_B',
      'Opcion_C',
      'Opcion_D',
      'Respuesta_Correcta',
      'Justificacion_Pedagogica'
    ];
    const rows = courseQuestionsBank.map((q) => [
      q.id,
      q.modulo,
      q.bloom,
      q.tema,
      q.enunciado,
      q.opciones.A,
      q.opciones.B,
      q.opciones.C,
      q.opciones.D,
      q.correcta,
      q.justificacion
    ]);
    downloadCsv(
      `Banco_Preguntas_${(courseCode || activeMeta.codigoCurso || 'CURSO').toUpperCase()}_${
        courseQuestionsBank.length
      }_Reactivos.csv`,
      headers,
      rows
    );
  };

  const exportQuestionsExcel = () => {
    const headers = [
      'ID_Pregunta',
      'Modulo',
      'Nivel_Bloom',
      'Tema',
      'Enunciado',
      'Opcion_A',
      'Opcion_B',
      'Opcion_C',
      'Opcion_D',
      'Respuesta_Correcta',
      'Justificacion_Pedagogica'
    ];
    const rows = courseQuestionsBank.map((q) => [
      q.id,
      q.modulo,
      q.bloom,
      q.tema,
      q.enunciado,
      q.opciones.A,
      q.opciones.B,
      q.opciones.C,
      q.opciones.D,
      q.correcta,
      q.justificacion
    ]);
    downloadExcel(
      `Banco_Preguntas_${(courseCode || activeMeta.codigoCurso || 'CURSO').toUpperCase()}_${
        courseQuestionsBank.length
      }_Reactivos.xlsx`,
      'Banco_Preguntas',
      headers,
      rows
    );
  };

  const exportQuestionsJson = () => {
    const blob = new Blob([JSON.stringify(courseQuestionsBank, null, 2)], {
      type: 'application/json;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Banco_Preguntas_${(
      courseCode ||
      activeMeta.codigoCurso ||
      'CURSO'
    ).toUpperCase()}_${courseQuestionsBank.length}_Reactivos.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredQuestions = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    return courseQuestionsBank.filter((item) => {
      const matchMod = qModFilter === 'all' || Number(item.modulo) === Number(qModFilter);
      const matchText =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.tema.toLowerCase().includes(q) ||
        item.enunciado.toLowerCase().includes(q);
      return matchMod && matchText;
    });
  }, [courseQuestionsBank, qSearch, qModFilter]);

  const totalQuestionPages = Math.max(1, Math.ceil(filteredQuestions.length / qPageSize));
  const safeCurrentPage = Math.min(qCurrentPage, totalQuestionPages);
  const paginatedQuestions = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * qPageSize;
    return filteredQuestions.slice(startIdx, startIdx + qPageSize);
  }, [filteredQuestions, safeCurrentPage, qPageSize]);

  const bankQualityAudit = useMemo(() => {
    const seenStatements = new Map<string, string>();
    const seenIds = new Map<string, number>();
    const issues: {
      questionId: string;
      modulo: number;
      severity: 'ALTA' | 'MEDIA';
      category: string;
      detail: string;
    }[] = [];

    courseQuestionsBank.forEach((q) => {
      const idKey = q.id.trim().toUpperCase();
      seenIds.set(idKey, (seenIds.get(idKey) || 0) + 1);

      const normStatement = q.enunciado
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñü]/g, '')
        .slice(0, 95);
      if (seenStatements.has(normStatement)) {
        issues.push({
          questionId: q.id,
          modulo: q.modulo,
          severity: 'ALTA',
          category: 'Enunciado Duplicado',
          detail: `Coincide con el reactivo ${seenStatements.get(normStatement)}`
        });
      } else {
        seenStatements.set(normStatement, q.id);
      }

      const opts = [q.opciones.A, q.opciones.B, q.opciones.C, q.opciones.D].map((o) =>
        (o || '').trim()
      );
      if (opts.some((o) => o.length < 2)) {
        issues.push({
          questionId: q.id,
          modulo: q.modulo,
          severity: 'ALTA',
          category: 'Opción Incompleta',
          detail: 'Una o más opciones (A, B, C o D) tiene menos de 2 caracteres.'
        });
      }

      const uniqueOpts = new Set(opts.map((o) => o.toLowerCase()));
      if (uniqueOpts.size < 4) {
        issues.push({
          questionId: q.id,
          modulo: q.modulo,
          severity: 'ALTA',
          category: 'Distractores Repetidos',
          detail: 'Existen opciones de respuesta idénticas dentro del mismo reactivo.'
        });
      }

      const correctLen = (q.opciones[q.correcta] || '').trim().length;
      const otherLens = (['A', 'B', 'C', 'D'] as const)
        .filter((l) => l !== q.correcta)
        .map((l) => (q.opciones[l] || '').trim().length);
      const avgOtherLen = otherLens.reduce((a, b) => a + b, 0) / 3;
      if (avgOtherLen > 12 && correctLen > avgOtherLen * 2.2) {
        issues.push({
          questionId: q.id,
          modulo: q.modulo,
          severity: 'MEDIA',
          category: 'Sesgo de Longitud',
          detail:
            'La opción correcta es más del doble de extensa que el promedio de los distractores.'
        });
      }
    });

    seenIds.forEach((count, idKey) => {
      if (count > 1) {
        issues.unshift({
          questionId: idKey,
          modulo: 1,
          severity: 'ALTA',
          category: 'ID Repetido',
          detail: `El código ${idKey} aparece ${count} veces en el banco.`
        });
      }
    });

    const healthyCount = Math.max(
      0,
      courseQuestionsBank.length - new Set(issues.map((i) => i.questionId)).size
    );
    return {
      totalQuestions: courseQuestionsBank.length,
      healthyCount,
      issuesCount: issues.length,
      highSeverityCount: issues.filter((i) => i.severity === 'ALTA').length,
      issues: issues.slice(0, 60)
    };
  }, [courseQuestionsBank]);

  // Semáforo de Cobertura del Banco de Preguntas por Módulo y Nivel Cognitivo Bloom
  const questionCoverageSemaphore = useMemo(() => {
    const bloomLevels: BloomLevel[] = [
      'Conocer',
      'Comprensión',
      'Aplicación',
      'Análisis',
      'Evaluación'
    ];
    const moduleRows = courseModules.map((mod, idx) => {
      const modNum = mod.id || idx + 1;
      const modQuestions = courseQuestionsBank.filter((q) => Number(q.modulo) === Number(modNum));
      const examsCount = Number(mod.examenesCount) || 0;
      const retosCount = Number(mod.retosCount) || 0;
      const examTargetQ =
        examsCount > 0 ? Math.max(5, Number(mod.preguntasExamenModuloCount) || 10) : 0;
      const retosTargetQ = retosCount * 5;
      const requiredMin = Math.max(examTargetQ, retosTargetQ, examsCount > 0 || retosCount > 0 ? 5 : 0);

      const byBloom: Record<BloomLevel, number> = {
        Conocer: 0,
        Comprensión: 0,
        Aplicación: 0,
        Análisis: 0,
        Evaluación: 0
      };
      modQuestions.forEach((q) => {
        const b = (q.bloom || 'Comprensión') as BloomLevel;
        if (byBloom[b] !== undefined) byBloom[b] += 1;
        else byBloom.Comprensión += 1;
      });

      let status: 'OPTIMO' | 'PARCIAL' | 'DEFICIT' = 'OPTIMO';
      if (requiredMin > 0 && modQuestions.length === 0) {
        status = 'DEFICIT';
      } else if (requiredMin > 0 && modQuestions.length < requiredMin) {
        status = 'PARCIAL';
      }

      return {
        modNum,
        title: mod.shortTitle?.trim() || `Módulo ${modNum}`,
        examsCount,
        retosCount,
        requiredMin,
        loadedCount: modQuestions.length,
        deficitCount: Math.max(0, requiredMin - modQuestions.length),
        status,
        byBloom
      };
    });

    const globalByBloom: Record<BloomLevel, number> = {
      Conocer: 0,
      Comprensión: 0,
      Aplicación: 0,
      Análisis: 0,
      Evaluación: 0
    };
    courseQuestionsBank.forEach((q) => {
      const b = (q.bloom || 'Comprensión') as BloomLevel;
      if (globalByBloom[b] !== undefined) globalByBloom[b] += 1;
    });

    const hasDeficit = moduleRows.some((r) => r.status === 'DEFICIT');
    const hasPartial = moduleRows.some((r) => r.status === 'PARCIAL');

    return {
      bloomLevels,
      moduleRows,
      globalByBloom,
      hasDeficit,
      hasPartial
    };
  }, [courseModules, courseQuestionsBank]);

  // Validación en Tiempo Real para el Asistente Guiado por Pasos (Wizard 1 a 4)
  const wizardValidation = useMemo(() => {
    const step1Valid = Boolean(
      courseName.trim() &&
        courseCode.trim() &&
        courseSubjectName.trim() &&
        courseSede.trim() &&
        assignedTeacherAccount.trim() &&
        assignedTeacherPass.trim()
    );

    const moduleWeightSums = courseModules.map((m) => {
      const p = m.ponderacion || {
        comportamientoPct: 0,
        participacionPct: 0,
        examenPct: 0,
        trabajoPct: 0
      };
      return (
        (Number(p.comportamientoPct) || 0) +
        (Number(p.participacionPct) || 0) +
        (Number(p.examenPct) || 0) +
        (Number(p.trabajoPct) || 0)
      );
    });
    const totalModulesGlobalPct = courseModules.reduce(
      (acc, m) => acc + (Number(m.ponderacionGlobalModuloPct) || 0),
      0
    );
    const allModulesHaveTitle = courseModules.every((m) => Boolean(m.shortTitle?.trim()));
    const allModulesInternalSum100 = moduleWeightSums.every((s) => s === 100);
    const step2Valid =
      courseModules.length > 0 &&
      allModulesHaveTitle &&
      (allModulesInternalSum100 || totalModulesGlobalPct === 100);

    const step3Valid =
      courseQuestionsBank.length > 0 && !questionCoverageSemaphore.hasDeficit;

    return {
      step1Valid,
      step2Valid,
      step3Valid,
      moduleWeightSums,
      totalModulesGlobalPct,
      allModulesInternalSum100,
      allModulesHaveTitle
    };
  }, [
    courseName,
    courseCode,
    courseSubjectName,
    courseSede,
    assignedTeacherAccount,
    assignedTeacherPass,
    courseModules,
    courseQuestionsBank.length,
    questionCoverageSemaphore.hasDeficit
  ]);

  const handleSaveCourseSnapshot = (customLabel?: string) => {
    const built = buildCourseMetaFromForm();
    const snap = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampIso: new Date().toISOString(),
      label:
        customLabel ||
        `${built.nombreCurso || 'Curso'} (${built.codigoCurso || 'SIN-COD'}) — ${
          built.modulosCurso?.length || 1
        } Mód. / ${courseQuestionsBank.length} Preg.`,
      meta: JSON.parse(JSON.stringify(built)),
      questions: JSON.parse(JSON.stringify(courseQuestionsBank))
    };
    const nextList = [snap, ...courseSnapshots].slice(0, 15);
    setCourseSnapshots(nextList);
    try {
      localStorage.setItem('evaluaplus_course_config_snapshots_v1', JSON.stringify(nextList));
    } catch {
      // ignore storage quota errors
    }
    showEditorNotice(`📸 Punto de restauración guardado: «${snap.label}».`);
  };

  const handleRestoreCourseSnapshot = (snapId: string) => {
    const found = courseSnapshots.find((s) => s.id === snapId);
    if (!found) return;
    const ws: UniversalCourseWorkspace = {
      meta: found.meta,
      studentsCount: students.length,
      questionsCount: found.questions.length,
      attemptsCount: attempts.length,
      retosCount: customMiniRetos.length,
      students,
      questions: found.questions,
      attempts,
      abproEvaluations,
      customMiniRetos,
      academicDataset
    };
    loadCourseIntoEditorForm(ws);
    updateEditorQuestionBank(found.questions);
    setShowSnapshotsModal(false);
    showEditorNotice(
      `✓ Configuración revertida a la versión del ${new Date(
        found.timestampIso
      ).toLocaleString('es-CO')}.`
    );
  };

  const paperExamPlanB = useMemo(() => {
    const countTarget = Math.min(
      config.preguntasExamenModulo || 25,
      Math.max(10, courseQuestionsBank.length)
    );
    const createVersion = (seedOffset: number, versionCode: 'FILA A' | 'FILA B' | 'FILA C') => {
      const byMod: Record<number, Question[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      courseQuestionsBank.forEach((q) => {
        if (byMod[q.modulo]) byMod[q.modulo].push(q);
        else byMod[1].push(q);
      });
      const picked: Question[] = [];
      const perMod = Math.max(2, Math.floor(countTarget / 5));
      ([1, 2, 3, 4, 5] as const).forEach((m) => {
        const list = [...(byMod[m] || [])];
        const rotated = list.slice(seedOffset % Math.max(1, list.length)).concat(
          list.slice(0, seedOffset % Math.max(1, list.length))
        );
        picked.push(...rotated.slice(0, perMod));
      });
      return {
        versionCode,
        items: picked.slice(0, countTarget)
      };
    };
    return [createVersion(0, 'FILA A'), createVersion(3, 'FILA B'), createVersion(7, 'FILA C')];
  }, [courseQuestionsBank, config.preguntasExamenModulo]);

  const buildCourseMetaFromForm = (): UniversalCourseMetadata => {
    const cleanName = courseName.trim() || 'Nuevo Curso';
    const cleanCode =
      courseCode.trim().replace(/\s+/g, '').toUpperCase().slice(0, 6) || 'CUR26';
    const cleanSubject = courseSubjectName.trim();
    const cleanSede = courseSede.trim();
    const cleanTeacherId = assignedTeacherAccount.trim().replace(/\s+/g, '').toUpperCase();
    const cleanTeacherPass = assignedTeacherPass.trim();
    const cleanTeacherName =
      assignedTeacherName.trim() ||
      registeredTeachers.find((t) => t.id === cleanTeacherId)?.nombre ||
      cleanTeacherId;

    const preparedModules: UniversalModuleDefinition[] = courseModules.map((m, idx) => {
      const modNum = idx + 1;
      const rawLinks = m.enlacesTextoRaw || '';
      const structuredLinks = parseRawDocumentLinksToStructured(
        rawLinks,
        modNum,
        m.shortTitle || `Módulo ${modNum}`
      );
      const cleanTopics = Array.isArray(m.temasModulo)
        ? m.temasModulo.map((t) => t.trim()).filter(Boolean)
        : [];
      return {
        ...m,
        id: modNum,
        code: `M${modNum}`,
        shortTitle: m.shortTitle.trim() || `Módulo ${modNum}`,
        fullTitle: `Módulo ${modNum}: ${m.shortTitle.trim() || `Módulo ${modNum}`}`,
        horasModulo: m.horasModulo ?? '',
        description: m.description || '',
        observacion: m.observacion || '',
        temasModulo: cleanTopics,
        activo: true,
        examenesCount: typeof m.examenesCount === 'number' ? m.examenesCount : 1,
        retosCount: typeof m.retosCount === 'number' ? m.retosCount : 1,
        asistenciaBloqueA: m.asistenciaBloqueA !== false,
        asistenciaBloqueB: m.asistenciaBloqueB !== false,
        documentosEnlaces: structuredLinks,
        enlacesTextoRaw: rawLinks
      };
    });

    const totalModuleExams = preparedModules.reduce(
      (acc, m) => acc + (Number(m.examenesCount) || 0),
      0
    );
    const totalExamsCount = totalModuleExams + (enableFinalIntegralExam ? 1 : 0);
    const totalRetosCount = preparedModules.reduce(
      (acc, m) => acc + (Number(m.retosCount) || 0),
      0
    );

    const integralQuestionsTotal = preparedModules.reduce((acc, m) => {
      const modQuestionsInBank = courseQuestionsBank.filter(
        (q) => Number(q.modulo) === Number(m.id)
      ).length;
      const contrib =
        typeof m.preguntasParaIntegralCount === 'number'
          ? m.preguntasParaIntegralCount
          : modQuestionsInBank > 0
          ? modQuestionsInBank
          : 8;
      return acc + contrib;
    }, 0);

    const builtExams: UniversalExamDefinition[] = buildUniversalExamsList(
      totalExamsCount,
      preparedModules
    ).map((ex) => {
      if (ex.id === 'integral') {
        return {
          ...ex,
          title: `Examen Integral FINAL (${cleanSubject || cleanName})`,
          questionsCount: Math.max(1, integralQuestionsTotal),
          durationMinutes: finalIntegralDurationMin,
          activo: enableFinalIntegralExam,
          sumarAutomaticamenteDeModulos: true
        };
      }
      const modMatch = preparedModules.find((m) => m.id === ex.moduloFilter);
      if (modMatch) {
        return {
          ...ex,
          activo: (modMatch.examenesCount ?? 1) > 0
        };
      }
      return ex;
    });

    const courseId =
      editingCourseId ||
      `curso-${cleanCode.toLowerCase()}-${Date.now().toString(36)}`;

    const selectedRosterObj =
      studentRosterDatabases.find((d) => d.id === selectedStudentRosterDbId) ||
      studentRosterDatabases[0];
    const selectedBankObj =
      questionBankDatabases.find((d) => d.id === selectedQuestionBankDbId) ||
      questionBankDatabases[0];

    return {
      courseId,
      nombreCurso: cleanName,
      codigoCurso: cleanCode,
      programaAcademico: cleanSubject,
      nombreAsignatura: cleanSubject,
      institucionSede: cleanSede,
      periodoAcademico: '2026-1',
      docenteResponsable: cleanTeacherName,
      docenteAsignadoId: cleanTeacherId,
      docenteAsignadoClave: cleanTeacherPass,
      docentesAutorizadosIds: cleanTeacherId ? [cleanTeacherId] : [],
      descripcionGeneral: cleanSubject,
      ponderacionGlobalCursoPct: globalCourseWeightPct,
      cantidadModulos: preparedModules.length,
      cantidadExamenes: totalExamsCount,
      cantidadRetos: totalRetosCount,
      habilitarExamenIntegral: enableFinalIntegralExam,
      selectedStudentRosterDbId: selectedRosterObj?.id || selectedStudentRosterDbId || 'nomina-oficial-base',
      selectedStudentRosterDbName:
        selectedRosterObj?.name || 'Nómina Oficial Base 2026',
      selectedQuestionBankDbId: selectedBankObj?.id || selectedQuestionBankDbId || 'banco-oficial-unificado',
      selectedQuestionBankDbName:
        selectedBankObj?.name || 'Banco Oficial Unificado 2026',
      modulosCurso: preparedModules,
      examenesCurso: builtExams,
      updatedAtIso: new Date().toISOString()
    };
  };

  const handleSaveCreatedCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim() || !courseCode.trim()) {
      showEditorNotice('⚠️ Ingrese el Nombre del curso y el Código.');
      return;
    }
    if (!assignedTeacherAccount.trim() || !assignedTeacherPass.trim()) {
      showEditorNotice(
        '⚠️ Ingrese o seleccione la Cuenta de docente asignado (Usuario y Clave).'
      );
      return;
    }

    const builtMeta = buildCourseMetaFromForm();
    const existingWs = catalog.find((c) => c.meta.courseId === builtMeta.courseId);
    const chosenRosterDb = studentRosterDatabases.find(
      (d) => d.id === builtMeta.selectedStudentRosterDbId
    );
    const chosenQuestionBankDb = questionBankDatabases.find(
      (d) => d.id === builtMeta.selectedQuestionBankDbId
    );
    const courseStudents = chosenRosterDb
      ? (chosenRosterDb.students || []).map((s) => ({ ...s }))
      : courseStudentsBank;
    const courseQuestions = chosenQuestionBankDb
      ? (chosenQuestionBankDb.questions || []).map((q) => ({ ...q, opciones: { ...q.opciones } }))
      : courseQuestionsBank;
    const courseAttempts = existingWs?.attempts || [];
    const courseAbpro = existingWs?.abproEvaluations || [];
    const validModIds = new Set(
      (builtMeta.modulosCurso || []).filter((m) => m.activo !== false).map((m) => Number(m.id))
    );
    const existingCustomRetos = (existingWs?.customMiniRetos || []).filter(
      (r) => r && (validModIds.size === 0 || validModIds.has(Number(r.modulo)))
    );
    const hasOnlyPlaceholderRetos =
      existingCustomRetos.length > 0 &&
      courseQuestions.length > 0 &&
      existingCustomRetos.every(
        (r) => String(r.id || '').startsWith('RETO-AUTO-') && !String(r.id || '').includes('-Q')
      );
    const courseRetos =
      existingCustomRetos.length > 0 && !hasOnlyPlaceholderRetos
        ? existingCustomRetos
        : generateBaseRetosForCourseModules(builtMeta, courseQuestions);
    const courseAcademic = existingWs?.academicDataset
      ? normalizeAndSyncAcademicDataset(existingWs.academicDataset, courseStudents)
      : buildInitialAcademicDataset(courseStudents);

    const newWorkspace: UniversalCourseWorkspace = {
      meta: builtMeta,
      studentsCount: courseStudents.length,
      questionsCount: courseQuestions.length,
      attemptsCount: courseAttempts.length,
      retosCount: courseRetos.length,
      students: courseStudents,
      questions: courseQuestions,
      attempts: courseAttempts,
      abproEvaluations: courseAbpro,
      customMiniRetos: courseRetos,
      academicDataset: courseAcademic
    };

    const nextCatalog = editingCourseId
      ? catalog.map((c) => (c.meta.courseId === editingCourseId ? newWorkspace : c))
      : [...catalog.filter((c) => c.meta.courseId !== builtMeta.courseId), newWorkspace];

    const cleanTeacherId = builtMeta.docenteAsignadoId!;
    const cleanTeacherPass = builtMeta.docenteAsignadoClave!;
    const teacherExists = registeredTeachers.some(
      (t) => t.id.trim().toUpperCase() === cleanTeacherId
    );
    const nextTeachers: TeacherAccountRecord[] = teacherExists
      ? registeredTeachers.map((t) =>
          t.id.trim().toUpperCase() === cleanTeacherId
            ? {
                ...t,
                nombre: builtMeta.docenteResponsable || t.nombre,
                claveAcceso: cleanTeacherPass,
                activo: true,
                cursosAsignadosIds: Array.from(
                  new Set([...(t.cursosAsignadosIds || []), builtMeta.courseId])
                ),
                updatedAtIso: new Date().toISOString()
              }
            : t
        )
      : [
          ...registeredTeachers,
          {
            id: cleanTeacherId,
            nombre: builtMeta.docenteResponsable || cleanTeacherId,
            claveAcceso: cleanTeacherPass,
            correo: '',
            activo: true,
            esTitularPrincipal: true,
            cursosAsignadosIds: [builtMeta.courseId],
            updatedAtIso: new Date().toISOString()
          }
        ];

    onUpdateStudents(courseStudents);
    onUpdateQuestions(courseQuestions);
    onUpdateAttempts(courseAttempts);
    onUpdateABProEvaluations(courseAbpro);
    onUpdateCustomMiniRetos(courseRetos);
    onUpdateAcademicDataset?.(courseAcademic);

    onUpdateConfig((prev) => ({
      ...prev,
      idDocente: cleanTeacherId,
      claveDocente: cleanTeacherPass,
      ponderacionTeoriaPct: globalCourseWeightPct,
      activeCourseId: builtMeta.courseId,
      activeCourseMeta: builtMeta,
      universalCoursesCatalog: nextCatalog,
      registeredTeachers: nextTeachers
    }));

    await handleExecuteServerSave(
      'panel_editor_cursos_docentes',
      `Curso ${builtMeta.nombreCurso} (${builtMeta.codigoCurso}) guardado y asignado al docente ${cleanTeacherId}`
    );

    handleSaveCourseSnapshot(
      `Guardado Oficial: ${builtMeta.nombreCurso} (${builtMeta.codigoCurso})`
    );

    showEditorNotice(
      `✓ Curso «${builtMeta.nombreCurso} (${builtMeta.codigoCurso})» creado/actualizado y habilitado para el Docente (${cleanTeacherId}).`
    );
    setActiveCard('cursos_activos');
  };

  // Export total backup of the created course
  const handleExportCourseBackup = (targetWorkspace?: UniversalCourseWorkspace) => {
    const metaToExport = targetWorkspace ? targetWorkspace.meta : buildCourseMetaFromForm();
    const questionsToExport = targetWorkspace
      ? targetWorkspace.questions || []
      : courseQuestionsBank;
    const studentsToExport = targetWorkspace ? targetWorkspace.students || [] : [];
    const attemptsToExport = targetWorkspace ? targetWorkspace.attempts || [] : [];
    const abproToExport = targetWorkspace ? targetWorkspace.abproEvaluations || [] : [];
    const retosToExport = targetWorkspace
      ? targetWorkspace.customMiniRetos || []
      : generateBaseRetosForCourseModules(metaToExport);
    const academicToExport = targetWorkspace
      ? targetWorkspace.academicDataset
      : buildInitialAcademicDataset(studentsToExport);

    const pkg = {
      type: 'EVALUAPLUS_UNIVERSAL_COURSE_PACKAGE_V1',
      exportedAtIso: new Date().toISOString(),
      meta: metaToExport,
      students: studentsToExport,
      questions: questionsToExport,
      attempts: attemptsToExport,
      abproEvaluations: abproToExport,
      customMiniRetos: retosToExport,
      academicDataset: academicToExport
    };

    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Respaldo_Curso_${(metaToExport.codigoCurso || 'CURSO').toUpperCase()}_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showEditorNotice(
      `✓ Respaldo total del curso «${metaToExport.nombreCurso || 'Curso'}» exportado correctamente.`
    );
  };

  // Import course backup inside "Crear nuevo curso"
  const handleImportCourseBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawMeta: UniversalCourseMetadata | undefined =
        parsed?.meta || parsed?.config?.activeCourseMeta;
      if (!rawMeta || !rawMeta.nombreCurso) {
        showEditorNotice('⚠️ El archivo seleccionado no contiene un respaldo de curso válido.');
        return;
      }

      const importedMeta: UniversalCourseMetadata = {
        ...rawMeta,
        courseId: rawMeta.courseId || `curso-imp-${Date.now()}`,
        updatedAtIso: new Date().toISOString()
      };
      const impStudents = Array.isArray(parsed.students) ? parsed.students : [];
      const impQuestions = Array.isArray(parsed.questions)
        ? normalizeImportedQuestions(parsed.questions)
        : [];
      const impAttempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
      const impAbpro = Array.isArray(parsed.abproEvaluations) ? parsed.abproEvaluations : [];
      const impRetos = Array.isArray(parsed.customMiniRetos)
        ? parsed.customMiniRetos
        : generateBaseRetosForCourseModules(importedMeta);
      const impAcademic = parsed.academicDataset
        ? normalizeAndSyncAcademicDataset(parsed.academicDataset, impStudents)
        : buildInitialAcademicDataset(impStudents);

      const newWs: UniversalCourseWorkspace = {
        meta: importedMeta,
        studentsCount: impStudents.length,
        questionsCount: impQuestions.length,
        attemptsCount: impAttempts.length,
        retosCount: impRetos.length,
        students: impStudents,
        questions: impQuestions,
        attempts: impAttempts,
        abproEvaluations: impAbpro,
        customMiniRetos: impRetos,
        academicDataset: impAcademic
      };

      const nextCat = [
        ...catalog.filter((c) => c.meta.courseId !== importedMeta.courseId),
        newWs
      ];

      onUpdateStudents(impStudents);
      onUpdateQuestions(impQuestions);
      onUpdateAttempts(impAttempts);
      onUpdateABProEvaluations(impAbpro);
      onUpdateCustomMiniRetos(impRetos);
      onUpdateAcademicDataset?.(impAcademic);

      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: importedMeta.courseId,
        activeCourseMeta: importedMeta,
        universalCoursesCatalog: nextCat
      }));

      loadCourseIntoEditorForm(newWs);
      showEditorNotice(
        `✓ Respaldo del curso «${importedMeta.nombreCurso}» importado y cargado correctamente.`
      );
    } catch {
      showEditorNotice('⚠️ No se pudo leer el archivo de respaldo del curso.');
    }
  };

  // ============================================================================
  // PANTALLA DE INICIO DE SESIÓN DEL PANEL DE EDITORES
  // ============================================================================
  if (!isAuthenticated) {
    const mailtoHref = `mailto:${encodeURIComponent(
      effectiveRecoveryEmail
    )}?subject=${encodeURIComponent(
      'Solicitud de Recuperación de Clave de Editor - EvaluaPlus'
    )}&body=${encodeURIComponent(
      'Estimado Coordinador / Administrador Académico,\n\nSolicito el envío o restablecimiento de la credencial de acceso al Panel de Editores de la plataforma EvaluaPlus.\n\nAtentamente,\nEditor Curricular'
    )}`;

    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8">
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
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center mx-auto">
              <Sliders className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Editor</h1>
          </div>

          {authDenied && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 text-xs text-red-900">
              <div className="font-bold flex items-center gap-2 text-red-800">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Restricción de Seguridad: Acceso Denegado</span>
              </div>
              <p className="leading-relaxed">
                La credencial ingresada no es válida o está vacía. Solicite su contraseña directamente al correo oficial configurado:{' '}
                <strong>{effectiveRecoveryEmail}</strong>
              </p>
              <a
                href={mailtoHref}
                className="w-full py-2.5 px-3 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                <span>Solicitar enviar al correo oficial</span>
              </a>
            </div>
          )}

          <form onSubmit={handleEditorLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="editor-id" className="block text-xs font-semibold text-slate-800">
                ID del Editor
              </label>
              <input
                id="editor-id"
                type="text"
                required
                autoComplete="off"
                value={editorUserInput}
                onChange={(e) => setEditorUserInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="editor-pin" className="block text-xs font-semibold text-slate-800">
                Código de Acceso de Sesión
              </label>
              <input
                id="editor-pin"
                type="password"
                required
                autoComplete="off"
                value={editorPassInput}
                onChange={(e) => setEditorPassInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PANEL DEL EDITOR DESPUÉS DE INICIAR SESIÓN (MISMO DISEÑO LIMPIO DEL PANEL DOCENTE + ORDEN CLARO SIN AMONTONAMIENTO)
  // ============================================================================
  const orderedEditorSections = [
    {
      id: 'seguridad_clave' as const,
      stepNumber: '1',
      label: 'Seguridad y Clave',
      shortLabel: '1. Seguridad y Clave',
      subtitle: 'Cuenta del editor, clave de acceso y correo de recuperación',
      badge: secEditorAccount || 'EDITOR2026',
      icon: Key,
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-100 text-indigo-700',
      borderActive: 'border-indigo-500 ring-2 ring-indigo-500/20',
      btnActive: 'bg-indigo-600 text-white shadow-xs',
      onClick: () => setActiveCard('seguridad_clave')
    },
    {
      id: 'docentes_activos' as const,
      stepNumber: '2',
      label: `Docentes Activos (${registeredTeachers.length})`,
      shortLabel: `2. Docentes Activos (${registeredTeachers.length})`,
      subtitle: 'Importar, exportar y agregar docentes uno por uno o por lotes',
      badge: `${registeredTeachers.length}`,
      icon: Users,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-100 text-emerald-700',
      borderActive: 'border-emerald-500 ring-2 ring-emerald-500/20',
      btnActive: 'bg-emerald-600 text-white shadow-xs',
      onClick: () => setActiveCard('docentes_activos')
    },
    {
      id: 'cursos_activos' as const,
      stepNumber: '3',
      label: `Cursos (${catalog.length})`,
      shortLabel: `3. Cursos (${catalog.length})`,
      subtitle: 'Tarjetas interactivas: Ver listado de Cursos Creado/Activos y Crear Nuevo Curso',
      badge: `${catalog.length} Cursos`,
      icon: Layers,
      iconColor: 'text-sky-600',
      iconBg: 'bg-sky-100 text-sky-700',
      borderActive: 'border-sky-500 ring-2 ring-sky-500/20',
      btnActive: 'bg-sky-600 text-white shadow-xs',
      onClick: () => {
        if (activeCard !== 'cursos_activos' && activeCard !== 'crear_nuevo_curso') {
          setActiveCard('cursos_activos');
        }
      }
    },
    {
      id: 'nominas_estudiantes' as const,
      stepNumber: '4',
      label: `Nominas de estudiantes (${studentRosterDatabases.length} Bases de Datos)`,
      shortLabel: `4. Nominas de estudiantes`,
      subtitle: 'Control de Estudiantes Asignados al Curso y bases de datos de nóminas',
      badge: `${studentRosterDatabases.length} BD · ${courseStudentsBank.length} Est`,
      icon: GraduationCap,
      iconColor: 'text-teal-600',
      iconBg: 'bg-teal-100 text-teal-700',
      borderActive: 'border-teal-500 ring-2 ring-teal-500/20',
      btnActive: 'bg-teal-600 text-white shadow-xs',
      onClick: () => {
        if (courseStudentsBank.length === 0) {
          const targetDb =
            studentRosterDatabases.find((d) => d.id === activeRosterDbId) ||
            studentRosterDatabases.find((d) => d.id === `nomina-curso-${activeMeta.courseId}`) ||
            studentRosterDatabases[0];
          if (targetDb) {
            setActiveRosterDbId(targetDb.id);
            setCourseStudentsBank((targetDb.students || []).map((s) => ({ ...s })));
          }
        }
        setActiveCard('nominas_estudiantes');
      }
    },
    {
      id: 'banco_preguntas' as const,
      stepNumber: '5',
      label: `Banco de preguntas (${questionBankDatabases.length} Bases de Datos)`,
      shortLabel: `5. Banco de preguntas`,
      subtitle: 'Base de datos de las preguntas/respuestas de todos los módulos cargados',
      badge: `${questionBankDatabases.length} BD · ${courseQuestionsBank.length} P`,
      icon: Database,
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-100 text-amber-800',
      borderActive: 'border-amber-500 ring-2 ring-amber-500/20',
      btnActive: 'bg-amber-600 text-white shadow-xs',
      onClick: () => {
        if (courseQuestionsBank.length === 0) {
          const targetDb =
            questionBankDatabases.find((d) => d.id === activeQuestionBankDbId) ||
            questionBankDatabases.find((d) => d.id === `banco-curso-${activeMeta.courseId}`) ||
            questionBankDatabases[0];
          if (targetDb) {
            setActiveQuestionBankDbId(targetDb.id);
            setCourseQuestionsBank(
              (targetDb.questions || []).map((q) => ({ ...q, opciones: { ...q.opciones } }))
            );
          }
        }
        setActiveCard('banco_preguntas');
      }
    }
  ];

  const currentEditorSection =
    orderedEditorSections.find((s) =>
      s.id === 'cursos_activos'
        ? activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso'
        : s.id === activeCard
    ) || null;

  return (
    <div className="w-full min-h-screen bg-[#f2f5f9] text-slate-900 pb-24 lg:pb-10 overflow-x-hidden">
      <div className="hidden">
        <OptionServerSaveBar
          sectionKey="panel_editor_cursos_docentes"
          label="Panel de Editores"
          autoSave={true}
          watchValue={`${catalog.length}:${registeredTeachers.length}:${activeMeta.courseId}:${activeMeta.updatedAtIso}`}
        />
      </div>

      {/* 1. BARRA SUPERIOR BLANCA ESTILO PANEL DOCENTE (BLUEDOX LMS): LOGO, CURSO ACTIVO, ACCESOS RÁPIDOS Y PERFIL EDITOR */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-6 h-16 flex items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setEditorIdeSidebarOpen((prev) => !prev)}
            className="w-10 h-10 rounded-xl bg-[#1e2631] hover:bg-slate-800 text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors shadow-2xs"
            title="Mostrar u ocultar menú lateral del Editor"
          >
            <LayoutGrid className="w-5 h-5 text-sky-400" />
          </button>

          <button
            type="button"
            onClick={() => setActiveCard(null)}
            className="flex items-center gap-2.5 text-left group cursor-pointer min-w-0"
            title="Ir a la Pantalla Inicial del Panel del Editor"
          >
            <div className="w-9 h-9 rounded-xl bg-[#25579e] text-white flex items-center justify-center font-extrabold text-sm shadow-2xs shrink-0">
              EP
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-[#1e3a6e] tracking-tight truncate group-hover:text-sky-700 transition-colors">
                  Panel del Editor
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-mono font-bold text-sky-800">
                  {activeMeta.codigoCurso}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate max-w-[220px] sm:max-w-[340px]">
                Curso activo: {activeMeta.nombreCurso}
              </div>
            </div>
          </button>
        </div>

        {/* Centro: Herramientas de Verificación Rápida en Modales (Sin apretar la pantalla) */}
        <div className="hidden xl:flex items-center gap-2 bg-slate-100/90 px-3 py-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setShowLivePreviewModal(true)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200/90 text-xs font-bold text-indigo-900 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            <span>Simular Vista Curso</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSelectiveCloneModal(true)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-slate-200/90 text-xs font-bold text-sky-900 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Copy className="w-3.5 h-3.5 text-sky-600" />
            <span>Clonar Módulos / Preguntas</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSnapshotsModal(true)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-slate-200/90 text-xs font-bold text-amber-900 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            <span>Versiones ({courseSnapshots.length})</span>
          </button>
        </div>

        {/* Derecha: Perfil del Editor y Botón Salir */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-slate-200 bg-slate-50/80 py-1 px-2.5 rounded-xl">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-xs font-bold text-slate-900">
                {secEditorAccount || 'EDITOR2026'}
              </div>
              <div className="text-[10px] font-medium text-emerald-700">
                ● {catalog.length} cursos · {registeredTeachers.length} docentes
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#1e2631] text-sky-300 font-bold text-xs flex items-center justify-center border-2 border-indigo-400 shrink-0">
              E
            </div>
            <button
              type="button"
              onClick={handleLogoutEditor}
              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Cerrar sesión del Editor"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. ESTRUCTURA PRINCIPAL ESTILO PANEL DOCENTE: MENÚ LATERAL IZQUIERDO + ÁREA DE TRABAJO AMPLIA */}
      <div className="flex flex-col lg:flex-row items-stretch min-h-[calc(100vh-4rem)]">
        {/* MENÚ LATERAL OSCURO ESTILO PANEL DOCENTE (CON ORDEN CLARO 1-2-3-4) */}
        {editorIdeSidebarOpen && (
          <aside
            aria-label="Menú lateral del Panel del Editor"
            className="w-full lg:w-64 shrink-0 bg-[#1e2631] text-slate-200 flex flex-col justify-between select-none shadow-lg z-20"
          >
            <div>
              {/* Cuadrícula 2x2 de Accesos Rápidos (Igual al Panel Docente) */}
              <div className="p-3.5 grid grid-cols-2 gap-2.5 border-b border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setActiveCard('seguridad_clave')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeCard === 'seguridad_clave'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Key className="w-5 h-5 text-indigo-400" />
                  <span className="text-[11px] font-semibold tracking-tight">1. Seguridad</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCard('docentes_activos')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeCard === 'docentes_activos'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Users className="w-5 h-5 text-emerald-400" />
                  <span className="text-[11px] font-semibold tracking-tight">2. Docentes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveCard('cursos_activos')}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Layers className="w-5 h-5 text-sky-400" />
                  <span className="text-[11px] font-semibold tracking-tight">3. Cursos</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (courseStudentsBank.length === 0) {
                      const targetDb =
                        studentRosterDatabases.find((d) => d.id === activeRosterDbId) ||
                        studentRosterDatabases[0];
                      if (targetDb) {
                        setActiveRosterDbId(targetDb.id);
                        setCourseStudentsBank((targetDb.students || []).map((s) => ({ ...s })));
                      }
                    }
                    setActiveCard('nominas_estudiantes');
                  }}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeCard === 'nominas_estudiantes'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <GraduationCap className="w-5 h-5 text-teal-400" />
                  <span className="text-[11px] font-semibold tracking-tight">4. Nóminas</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (courseQuestionsBank.length === 0) {
                      const targetDb =
                        questionBankDatabases.find((d) => d.id === activeQuestionBankDbId) ||
                        questionBankDatabases[0];
                      if (targetDb) {
                        setActiveQuestionBankDbId(targetDb.id);
                        setCourseQuestionsBank(
                          (targetDb.questions || []).map((q) => ({
                            ...q,
                            opciones: { ...q.opciones }
                          }))
                        );
                      }
                    }
                    setActiveCard('banco_preguntas');
                  }}
                  className={`col-span-2 p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeCard === 'banco_preguntas'
                      ? 'bg-[#25579e] border-sky-400 text-white shadow-md'
                      : 'bg-[#273140] hover:bg-[#313d4f] border-slate-700/80 text-slate-200'
                  }`}
                >
                  <Database className="w-5 h-5 text-amber-400" />
                  <span className="text-[11px] font-semibold tracking-tight">5. Banco de preguntas</span>
                </button>
              </div>

              {/* Lista Ordenada de Ventanas del Editor */}
              <div className="py-3">
                <button
                  type="button"
                  onClick={() => setActiveCard(null)}
                  className={`w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold transition-colors cursor-pointer ${
                    activeCard === null
                      ? 'bg-[#52627a] text-white border-l-4 border-sky-400'
                      : 'text-slate-100 hover:bg-[#273140]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Home className="w-4 h-4 text-sky-400" />
                    <span>Pantalla Inicial (Hub)</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <div className="mt-1 space-y-0.5">
                  {orderedEditorSections.map((sec) => {
                    const isSelected =
                      sec.id === 'cursos_activos'
                        ? activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso'
                        : activeCard === sec.id;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={sec.onClick}
                        className={`w-full pl-6 pr-3 py-2.5 text-left text-xs flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#52627a] text-white font-bold border-l-4 border-sky-400'
                            : 'text-slate-300 hover:bg-[#273140] hover:text-white font-medium'
                        }`}
                      >
                        <span className="truncate">{sec.shortLabel}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px] shrink-0">
                          {sec.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Herramientas Complementarias en el Menú Lateral */}
                <div className="mt-3 pt-3 border-t border-slate-700/80 space-y-0.5">
                  <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Herramientas Curriculares
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLivePreviewModal(true)}
                    className="w-full px-4 py-2.5 text-xs text-slate-300 hover:bg-[#273140] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Eye className="w-4 h-4 text-indigo-400" />
                      <span>Simulador de Vista</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSelectiveCloneModal(true)}
                    className="w-full px-4 py-2.5 text-xs text-slate-300 hover:bg-[#273140] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Copy className="w-4 h-4 text-sky-400" />
                      <span>Clonación Selectiva</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBankAuditorModal(true)}
                    className="w-full px-4 py-2.5 text-xs text-slate-300 hover:bg-[#273140] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Auditor del Banco</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold">
                      {bankQualityAudit.healthyCount}/{bankQualityAudit.totalQuestions}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSnapshotsModal(true)}
                    className="w-full px-4 py-2.5 text-xs text-slate-300 hover:bg-[#273140] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                      <span>Historial Versiones</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px] font-bold">
                      {courseSnapshots.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrintViewMode('examen_papel_plan_b')}
                    className="w-full px-4 py-2.5 text-xs text-slate-300 hover:bg-[#273140] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Printer className="w-4 h-4 text-purple-400" />
                      <span>Examen Papel (Plan B)</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3.5 border-t border-slate-700/80 bg-[#181f28] text-[11px] text-slate-400 flex items-center justify-between">
              <span className="font-mono">Activo: {activeMeta.codigoCurso}</span>
              <span className="text-emerald-400 font-bold">● Sincronizado</span>
            </div>
          </aside>
        )}

        {/* COLUMNA PRINCIPAL DE CONTENIDO (ESPACIO DE TRABAJO AMPLIO Y DESPEJADO) */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* BARRA SUPERIOR DE CONTEXTO Y BOTONES NUMERADOS EN ORDEN (1 -> 2 -> 3 -> 4) */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {activeCard === null ? (
                <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800">
                  <span className="px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-900 font-mono text-[10px] font-extrabold uppercase">
                    Panel del Editor
                  </span>
                  <span>
                    Pantalla Inicial · Curso Activo:{' '}
                    <strong className="text-slate-950">
                      {activeMeta.nombreCurso} ({activeMeta.codigoCurso})
                    </strong>
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCard(null)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#25579e] hover:bg-[#1e4682] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>Escritorio Principal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCard(null)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver</span>
                  </button>

                  {currentEditorSection && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="text-slate-300 hidden sm:inline">/</span>
                      <span className="text-sm font-extrabold text-slate-900">
                        {currentEditorSection.shortLabel}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botones de las 5 Secciones Principales en Orden Fijo (1 -> 2 -> 3 -> 4 -> 5) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {orderedEditorSections.map((sec) => {
                const IconComp = sec.icon;
                const isSelected =
                  sec.id === 'cursos_activos'
                    ? activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso'
                    : activeCard === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={sec.onClick}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                      isSelected
                        ? sec.btnActive
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/80'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5 shrink-0" />
                    <span>{sec.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PANTALLA INICIAL (ESCRITORIO DEL EDITOR CON EL MISMO DISEÑO DEL PANEL DOCENTE) */}
          {activeCard === null && (
            <div className="pb-8">
              {/* BANNER AZUL INSTITUCIONAL ESTILO PANEL DOCENTE */}
              <div className="bg-gradient-to-r from-[#1e3a6e] via-[#25579e] to-[#1e4b8f] text-white pt-6 pb-16 px-4 sm:px-8">
                <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 text-sky-100 font-mono text-[10px] font-bold uppercase tracking-wider">
                      <span>⚙️ Administración Curricular y Académica · EvaluaPlus LMS</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                      Escritorio de Control del Editor ({activeMeta.codigoCurso})
                    </h2>
                    <p className="text-xs sm:text-sm text-sky-100/90">
                      Seleccione una de las 5 pantallas principales en orden para gestionar credenciales, docentes, cursos (listado y creación), nóminas de estudiantes o banco de preguntas.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveCard('cursos_activos')}
                      className="px-4 py-2.5 rounded-xl bg-white text-[#1e3a6e] hover:bg-sky-50 text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Layers className="w-4 h-4 text-sky-700" />
                      <span>Ir a Ventana Cursos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLivePreviewModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-[#289c8e] hover:bg-[#218276] text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Simular Vista</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* CONTENEDOR DE LAS 5 TARJETAS PRINCIPALES EN ORDEN 1 -> 2 -> 3 -> 4 -> 5 */}
              <div className="max-w-[1440px] mx-auto px-4 sm:px-6 -mt-10 relative z-10 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {orderedEditorSections.map((sec) => {
                    const CardIcon = sec.icon;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={sec.onClick}
                        className="bg-white hover:bg-sky-50/40 border-2 border-slate-200 hover:border-sky-400 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between gap-4 cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-3 w-full">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${sec.iconBg}`}
                          >
                            <CardIcon className="w-6 h-6" />
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-mono text-xs font-extrabold">
                            Opción {sec.stepNumber}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="text-base font-extrabold text-slate-900 group-hover:text-[#25579e] transition-colors">
                            {sec.shortLabel}
                          </h3>
                          <p className="text-xs text-slate-600 leading-relaxed">{sec.subtitle}</p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#25579e]">
                          <span>Abrir ventana</span>
                          <span>→</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* SEGUNDA FILA: HERRAMIENTAS COMPLEMENTARIAS DEL EDITOR (ESTILO TARJETAS DEL PANEL DOCENTE) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                        Herramientas Complementarias de Revisión y Respaldo
                      </h3>
                      <p className="text-xs text-slate-500">
                        Accesos directos para previsualizar el curso, clonar módulos, auditar preguntas o imprimir el Plan B en papel.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                    <button
                      type="button"
                      onClick={() => setShowLivePreviewModal(true)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/40 text-left space-y-1.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <Eye className="w-5 h-5 text-indigo-600" />
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                          Simulador
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Vista Previa Estudiante / Docente
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Inspeccionar cómo se verá el curso antes de publicar.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSelectiveCloneModal(true)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-sky-400 bg-slate-50/70 hover:bg-sky-50/40 text-left space-y-1.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <Copy className="w-5 h-5 text-sky-600" />
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                          Catálogo
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Clonación Selectiva
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Importar módulos o preguntas desde otro curso.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowBankAuditorModal(true)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-emerald-400 bg-slate-50/70 hover:bg-emerald-50/40 text-left space-y-1.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          {bankQualityAudit.healthyCount}/{bankQualityAudit.totalQuestions} OK
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Validador del Banco
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Auditar duplicados y ecualizar opciones con IA.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSnapshotsModal(true)}
                      className="p-4 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/70 hover:bg-amber-50/40 text-left space-y-1.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <RotateCcw className="w-5 h-5 text-amber-600" />
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                          {courseSnapshots.length} guardadas
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Historial de Versiones
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Crear o restaurar copias de seguridad instantáneas.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintViewMode('examen_papel_plan_b')}
                      className="p-4 rounded-xl border border-slate-200 hover:border-purple-400 bg-slate-50/70 hover:bg-purple-50/40 text-left space-y-1.5 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <Printer className="w-5 h-5 text-purple-600" />
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900">
                          Filas A/B/C
                        </span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-900">
                        Examen en Papel (Plan B)
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Generar cuadernillo imprimible y hoja de claves.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CONTENEDOR AMPLIO DE CADA VENTANA SELECCIONADA (SIN COLUMNAS LATERALES QUE AMONTONEN LA INFORMACIÓN) */}
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-6">
            {editorBanner && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>{editorBanner}</span>
                <button
                  type="button"
                  onClick={() => setEditorBanner(null)}
                  className="text-emerald-800 hover:text-emerald-950 font-mono cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

      {/* ========================================================================= */}
      {/* VISTA 1: TARJETA "SEGURIDAD Y CLAVE"                                      */}
      {/* ========================================================================= */}
      {activeCard === 'seguridad_clave' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-slate-900">Seguridad y Clave</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveCard(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <form onSubmit={handleSaveEditorSecurity} className="space-y-4 text-xs sm:text-sm">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Nombre del editor</label>
              <input
                type="text"
                autoComplete="off"
                value={secEditorName}
                onChange={(e) => setSecEditorName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Cuenta del editor</label>
              <input
                type="text"
                required
                autoComplete="off"
                value={secEditorAccount}
                onChange={(e) => setSecEditorAccount(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold uppercase text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">Clave de acceso del editor</label>
              <div className="relative">
                <input
                  type={showSecEditorPass ? 'text' : 'password'}
                  required
                  autoComplete="off"
                  value={secEditorPass}
                  onChange={(e) => setSecEditorPass(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowSecEditorPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showSecEditorPass ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-800">
                Correo electrónico de recuperación
              </label>
              <input
                type="email"
                required
                autoComplete="off"
                value={secEditorEmail}
                onChange={(e) => setSecEditorEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900"
              />
            </div>

            {secSaveStatus && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{secSaveStatus}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Actualizar Datos de la Cuenta del Editor</span>
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: TARJETA "DOCENTES ACTIVOS" (3 OPCIONES)                          */}
      {/* ========================================================================= */}
      {activeCard === 'docentes_activos' && (
        <div className="space-y-5">
          {/* Tres opciones al ingresar en "Docentes Activos":
              1) Importar base de datos docentes activos
              2) Exportar base de datos docentes activos
              3) Docentes agregados y Agregar docente (uno por uno o por lotes) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="rounded-2xl p-4 border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/30 transition-all cursor-pointer flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Importar base de datos docentes activos
                </div>
                <div className="text-xs text-slate-500">Cargar archivo (.json / .xlsx / .csv)</div>
              </div>
              <input
                type="file"
                accept=".json,.xlsx,.xls,.csv"
                onChange={handleImportActiveTeachersDB}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleExportActiveTeachersDB}
              className="rounded-2xl p-4 border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/30 text-left transition-all cursor-pointer flex items-center gap-3 shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Exportar base de datos docentes activos
                </div>
                <div className="text-xs text-slate-500">
                  Descargar respaldo ({registeredTeachers.length} docentes)
                </div>
              </div>
            </button>

            <div className="rounded-2xl p-4 border-2 border-emerald-500 bg-emerald-50/40 flex items-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Docentes agregados y Agregar docente
                </div>
                <div className="text-xs text-slate-600">
                  Uno por uno o por lotes ({registeredTeachers.length} activos)
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Agregar Docente (Uno por uno o Por lotes) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Agregar Docente</h3>
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                  <button
                    type="button"
                    onClick={() => setTeacherAddMode('individual')}
                    className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                      teacherAddMode === 'individual'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Uno por uno
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherAddMode('lotes')}
                    className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                      teacherAddMode === 'lotes'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Por lotes
                  </button>
                </div>
              </div>

              {teacherAddMode === 'individual' ? (
                <form onSubmit={handleAddSingleTeacher} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Nombre del docente
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Cuenta del docente
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={newTeacherAccount}
                      onChange={(e) => setNewTeacherAccount(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold uppercase text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Clave de acceso del docente
                    </label>
                    <div className="relative">
                      <input
                        type={showNewTeacherPass ? 'text' : 'password'}
                        required
                        autoComplete="off"
                        value={newTeacherPass}
                        onChange={(e) => setNewTeacherPass(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewTeacherPass((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showNewTeacherPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Correo electrónico de recuperación
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      value={newTeacherEmail}
                      onChange={(e) => setNewTeacherEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Docente</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSaveBatchTeachersRows} className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Agregar múltiples docentes por lotes:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setBatchRows((prev) => [
                            ...prev,
                            { nombre: '', cuenta: '', clave: '', correo: '' }
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold cursor-pointer"
                      >
                        + Fila
                      </button>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {batchRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[11px] text-slate-600">
                              Docente #{idx + 1}
                            </span>
                            {batchRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setBatchRows((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-red-600 hover:text-red-800 text-[11px] font-bold cursor-pointer"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Nombre del docente"
                              value={row.nombre}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, nombre: val } : r))
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                            />
                            <input
                              type="text"
                              placeholder="Cuenta del docente"
                              value={row.cuenta}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setBatchRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, cuenta: val } : r))
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono uppercase"
                            />
                            <input
                              type="text"
                              placeholder="Clave de acceso del docente"
                              value={row.clave}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, clave: val } : r))
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                            />
                            <input
                              type="email"
                              placeholder="Correo electrónico de recuperación"
                              value={row.correo}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, correo: val } : r))
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <label className="block font-bold text-slate-700">
                      O pegar listado por lotes (Nombre, Cuenta, Clave, Correo por línea):
                    </label>
                    <textarea
                      rows={3}
                      value={batchRawText}
                      onChange={(e) => setBatchRawText(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Guardar Docentes por Lotes</span>
                    </button>

                    <label className="w-full py-2 px-4 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4 text-emerald-700" />
                      <span>Importar Lote desde Excel / CSV</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleUploadTeachersBatchFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                </form>
              )}
            </div>

            {/* Columna Derecha: Docentes Agregados */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Docentes Agregados ({registeredTeachers.length})
                </h3>
              </div>

              {registeredTeachers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  No hay docentes agregados. Utilice el formulario para agregar docentes uno por uno, por lotes o importar la base de datos.
                </div>
              ) : (
                <div className="space-y-3">
                  {registeredTeachers.map((teacher) => {
                    const isPassVisible = Boolean(visibleTeacherPassIds[teacher.id]);
                    return (
                      <div
                        key={teacher.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {teacher.nombre}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold">
                              Cuenta: {teacher.id}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono">
                              <span>Clave: {isPassVisible ? teacher.claveAcceso : '••••••••'}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setVisibleTeacherPassIds((prev) => ({
                                    ...prev,
                                    [teacher.id]: !prev[teacher.id]
                                  }))
                                }
                                className="text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                {isPassVisible ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </span>
                          </div>
                          <div className="text-slate-600 font-mono text-[11px]">
                            Correo electrónico de recuperación: {teacher.correo || 'No registrado'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setTeacherAddMode('individual');
                              setNewTeacherName(teacher.nombre);
                              setNewTeacherAccount(teacher.id);
                              setNewTeacherPass(teacher.claveAcceso);
                              setNewTeacherEmail(teacher.correo || '');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                          >
                            Editar
                          </button>
                          {confirmDeleteTeacherId === teacher.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteTeacherAccount(teacher.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold cursor-pointer"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTeacherId(null)}
                                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTeacherId(teacher.id)}
                              className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: PANTALLA / VENTANA "CURSOS"                                      */}
      {/* (CONTIENE DOS MENÚS TARJETAS INTERACTIVAS EN SU INTERIOR:                 */}
      {/*  1) "Ver listado de Cursos Creado/Activos" -> muestra "Cursos Creado/Activos" */}
      {/*  2) "Crear Nuevo Curso" -> muestra "Crear Nuevo Curso")                   */}
      {/* ========================================================================= */}
      {(activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso') && (
        <div className="space-y-6">
          {/* SECCIÓN / ZONA SUPERIOR DE LA VENTANA "CURSOS": DOS MENÚS TARJETAS INTERACTIVAS */}
          <div className="bg-white border-2 border-sky-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-[11px] font-mono font-bold text-sky-900 uppercase">
                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                  <span>Pantalla / Ventana: Cursos</span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Gestión de Cursos — Seleccione una Tarjeta Interactiva
                </h3>
                <p className="text-xs text-slate-600">
                  Haga clic en una de las dos tarjetas interactivas para ejecutar y mostrar en el interior de esta ventana <strong>«Cursos Creado/Activos»</strong> o <strong>«Crear Nuevo Curso»</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 font-bold">
                  Cursos activos en catálogo: {catalog.length}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                  Activo: {activeMeta.codigoCurso}
                </span>
              </div>
            </div>

            {/* DOS MENÚS TARJETAS INTERACTIVAS DENTRO DE LA VENTANA "CURSOS" */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TARJETA INTERACTIVA 1: "Ver listado de Cursos Creado/Activos" */}
              <button
                type="button"
                onClick={() => setActiveCard('cursos_activos')}
                className={`rounded-2xl p-5 border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-4 group ${
                  activeCard === 'cursos_activos'
                    ? 'border-sky-600 bg-sky-50/60 ring-2 ring-sky-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      activeCard === 'cursos_activos'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white'
                    }`}
                  >
                    <Layers className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-900 font-mono text-[11px] font-extrabold">
                      {catalog.length} Curso(s)
                    </span>
                    {activeCard === 'cursos_activos' && (
                      <span className="px-2.5 py-1 rounded-full bg-sky-600 text-white font-mono text-[10px] font-extrabold">
                        ● EN PANTALLA
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-slate-900 group-hover:text-sky-800">
                    Ver listado de Cursos Creado/Activos
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Mostrar la pantalla/ventana <strong>«Cursos Creado/Activos»</strong> para consultar los cursos registrados, activar el curso en aula, modificar su estructura, duplicarlo o eliminarlo.
                  </p>
                </div>

                <div
                  className={`pt-3 border-t flex items-center justify-between text-xs font-extrabold ${
                    activeCard === 'cursos_activos'
                      ? 'border-sky-200 text-sky-800'
                      : 'border-slate-100 text-sky-700'
                  }`}
                >
                  <span>Mostrar ventana «Cursos Creado/Activos»</span>
                  <span>→</span>
                </div>
              </button>

              {/* TARJETA INTERACTIVA 2: "Crear Nuevo Curso" */}
              <button
                type="button"
                onClick={() => {
                  resetNewCourseForm();
                  setCreateCourseOption('nuevo');
                  setActiveCard('crear_nuevo_curso');
                }}
                className={`rounded-2xl p-5 border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-4 group ${
                  activeCard === 'crear_nuevo_curso'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-purple-400 hover:bg-purple-50/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      activeCard === 'crear_nuevo_curso'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white'
                    }`}
                  >
                    <FolderPlus className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editingCourseId && activeCard === 'crear_nuevo_curso' ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-extrabold">
                        Modificando Curso (Clic para limpiar)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 font-mono text-[11px] font-extrabold">
                        Asistente 4 Pasos
                      </span>
                    )}
                    {activeCard === 'crear_nuevo_curso' && (
                      <span className="px-2.5 py-1 rounded-full bg-purple-600 text-white font-mono text-[10px] font-extrabold">
                        ● EN PANTALLA
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-slate-900 group-hover:text-purple-800">
                    Crear Nuevo Curso
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Abrir la pantalla/ventana <strong>«Crear Nuevo Curso»</strong> para configurar un nuevo curso, docente asignado, módulos, ponderaciones y selección de bancos de estudiantes y preguntas.
                  </p>
                </div>

                <div
                  className={`pt-3 border-t flex items-center justify-between text-xs font-extrabold ${
                    activeCard === 'crear_nuevo_curso'
                      ? 'border-purple-200 text-purple-800'
                      : 'border-slate-100 text-purple-700'
                  }`}
                >
                  <span>Abrir ventana «Crear Nuevo Curso»</span>
                  <span>→</span>
                </div>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* SUB-VENTANA INTERNA 1: "CURSOS CREADO/ACTIVOS"                        */}
          {/* ===================================================================== */}
          {activeCard === 'cursos_activos' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] font-mono font-bold text-sky-900 uppercase mb-1">
                    <span>Sub-ventana activa dentro de Cursos</span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    Cursos Creado/Activos ({catalog.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetNewCourseForm();
                    setCreateCourseOption('nuevo');
                    setActiveCard('crear_nuevo_curso');
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Crear Nuevo Curso</span>
                </button>
              </div>

          {catalog.length === 0 ? (
            <div className="p-10 text-center space-y-3 border border-dashed border-slate-200 rounded-2xl">
              <p className="text-sm font-semibold text-slate-700">
                No hay cursos creados actualmente.
              </p>
              <button
                type="button"
                onClick={() => {
                  resetNewCourseForm();
                  setCreateCourseOption('nuevo');
                  setActiveCard('crear_nuevo_curso');
                }}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Crear nuevo curso</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalog.map((ws) => {
                const isCurrent = ws.meta.courseId === activeMeta.courseId;
                const assignedTeacherObj = registeredTeachers.find(
                  (t) => t.id === ws.meta.docenteAsignadoId
                );
                const teacherUser = ws.meta.docenteAsignadoId || assignedTeacherObj?.id || '—';
                const teacherPass =
                  ws.meta.docenteAsignadoClave || assignedTeacherObj?.claveAcceso || '—';

                return (
                  <div
                    key={ws.meta.courseId}
                    className={`rounded-2xl border p-5 space-y-4 ${
                      isCurrent
                        ? 'border-sky-500 bg-sky-50/20 ring-2 ring-sky-500/20'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">
                            Código: {ws.meta.codigoCurso}
                          </span>
                          {isCurrent ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-mono font-bold">
                              ● ACTIVO
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSwitchActiveCourseInEditor(ws.meta.courseId)}
                              className="px-2.5 py-0.5 rounded-full bg-sky-100 hover:bg-sky-200 text-sky-900 text-[11px] font-mono font-bold cursor-pointer"
                            >
                              Activar
                            </button>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-900">
                          {ws.meta.nombreCurso}
                        </h4>
                        <p className="text-xs text-slate-600">
                          <strong>Asignatura:</strong>{' '}
                          {ws.meta.nombreAsignatura || ws.meta.programaAcademico || '—'} ·{' '}
                          <strong>Sede:</strong> {ws.meta.institucionSede || '—'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 font-mono">
                      <div>
                        <span className="text-slate-500">Docente asignado:</span>{' '}
                        <strong className="text-slate-900">
                          {ws.meta.docenteResponsable || teacherUser}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Usuario:</span>{' '}
                        <strong className="text-indigo-700">{teacherUser}</strong>
                        <span className="mx-2 text-slate-300">|</span>
                        <span className="text-slate-500">Clave:</span>{' '}
                        <strong className="text-indigo-700">{teacherPass}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Módulos:</span>{' '}
                        <strong>{ws.meta.modulosCurso?.length || ws.meta.cantidadModulos}</strong>
                        <span className="mx-2 text-slate-300">|</span>
                        <span className="text-slate-500">Preguntas cargadas:</span>{' '}
                        <strong>{(ws.questions || []).length}</strong>
                      </div>
                    </div>

                    {/* Botones de Modificar, Duplicar o Eliminar curso */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => loadCourseIntoEditorForm(ws)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Modificar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicateCourse(ws)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Duplicar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCourse(ws.meta.courseId)}
                        className="px-3.5 py-2 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

          {/* ===================================================================== */}
          {/* SUB-VENTANA INTERNA 2: "CREAR NUEVO CURSO" / "MODIFICAR CURSO"        */}
          {/* ===================================================================== */}
          {activeCard === 'crear_nuevo_curso' && (
            <div className="space-y-6">
              {/* Encabezado interno de la sub-ventana Crear Nuevo Curso con botón para ir a Cursos Creado/Activos */}
              <div className="bg-white border border-purple-200 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-[10px] font-mono font-bold text-purple-900 uppercase mb-1">
                    <span>Sub-ventana activa dentro de Cursos</span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    {editingCourseId
                      ? `Modificar Curso: ${courseName || 'Curso Seleccionado'} (${courseCode || '—'})`
                      : 'Crear Nuevo Curso'}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveCard('cursos_activos')}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Layers className="w-4 h-4" />
                  <span>Ver listado de Cursos Creado/Activos ({catalog.length})</span>
                </button>
              </div>
          {/* Tres opciones al ingresar en "Crear nuevo curso":
              1) Importar respaldo del curso (Importar)
              2) Exportar respaldo del curso (Exportar)
              3) Nuevo curso */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label
              onClick={() => setCreateCourseOption('importar')}
              className={`rounded-2xl p-4 border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                createCourseOption === 'importar'
                  ? 'border-indigo-600 bg-indigo-50/40'
                  : 'border-slate-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Importar respaldo del curso (Importar)
                  </div>
                  <div className="text-xs text-slate-500">Cargar archivo (.json)</div>
                </div>
              </div>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportCourseBackupFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setCreateCourseOption('exportar');
                handleExportCourseBackup();
              }}
              className={`rounded-2xl p-4 border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                createCourseOption === 'exportar'
                  ? 'border-emerald-600 bg-emerald-50/40'
                  : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Exportar respaldo del curso (Exportar)
                  </div>
                  <div className="text-xs text-slate-500">Descargar archivo (.json)</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                resetNewCourseForm();
                setCreateCourseOption('nuevo');
              }}
              className={`rounded-2xl p-4 border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                createCourseOption === 'nuevo'
                  ? 'border-purple-600 bg-purple-50/40'
                  : 'border-slate-200 bg-white hover:border-purple-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Nuevo curso</div>
                  <div className="text-xs text-slate-500">
                    Configurar datos, módulos, temas y preguntas
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Barra del Asistente Guiado por Pasos (Wizard 4 Pasos) + Herramientas Avanzadas del Editor */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-purple-800 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-md mb-1">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Asistente Curricular Inteligente (Wizard 4 Pasos)</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Ruta Guiada de Creación y Validación del Curso en Tiempo Real
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLivePreviewModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Simular Vista del Curso (Estudiante / Docente)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const defaultSource =
                      catalog.find((c) => c.meta.courseId !== editingCourseId)?.meta.courseId ||
                      catalog[0]?.meta.courseId ||
                      '';
                    setCloneSourceCourseId(defaultSource);
                    setSelectedCloneModuleIds([]);
                    setSelectedCloneQuestionIds([]);
                    setCloneTargetModuleNum(courseModules[0]?.id || 1);
                    setShowSelectiveCloneModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Clonación Selectiva entre Cursos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSnapshotsModal(true)}
                  className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Historial de Versiones ({courseSnapshots.length})</span>
                </button>
              </div>
            </div>

            {/* Selector de los 4 Pasos del Wizard + Opción Ver Todo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              {[
                {
                  step: 1 as const,
                  title: 'Paso 1: Datos y Docente',
                  subtitle: 'Nombre, código, sede y credenciales',
                  valid: wizardValidation.step1Valid
                },
                {
                  step: 2 as const,
                  title: 'Paso 2: Módulos y 100%',
                  subtitle: `${courseModules.length} módulo(s) configurados`,
                  valid: wizardValidation.step2Valid
                },
                {
                  step: 3 as const,
                  title: 'Paso 3: Selección de Bancos',
                  subtitle: `${courseStudentsBank.length} est. · ${courseQuestionsBank.length} preg.`,
                  valid: wizardValidation.step3Valid
                },
                {
                  step: 4 as const,
                  title: 'Paso 4: Resumen y Publicar',
                  subtitle: 'Previsualización y guardado oficial',
                  valid:
                    wizardValidation.step1Valid &&
                    wizardValidation.step2Valid &&
                    wizardValidation.step3Valid
                }
              ].map((item) => {
                const isSelected = wizardStep === item.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => setWizardStep(item.step)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-500/20'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-white hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900">{item.title}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          item.valid
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {item.valid ? '✓ LISTO' : 'PENDIENTE'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-600">{item.subtitle}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setWizardStep('all')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                  wizardStep === 'all'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold">Vista Completa</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono font-bold">
                    1–4
                  </span>
                </div>
                <span
                  className={`text-[11px] ${
                    wizardStep === 'all' ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  Mostrar todos los pasos continuos
                </span>
              </button>
            </div>

            {/* Barra de Validación en Tiempo Real de Ponderaciones (100%) */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-slate-800">
                  Validación Curricular en Tiempo Real:
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold ${
                    wizardValidation.allModulesInternalSum100
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {wizardValidation.allModulesInternalSum100
                    ? '✓ Ponderación interna de cada módulo suma 100%'
                    : `⚠️ Verifique ponderaciones internas por módulo (${wizardValidation.moduleWeightSums
                        .map((s, i) => `M${i + 1}:${s}%`)
                        .join(', ')})`}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold ${
                    !questionCoverageSemaphore.hasDeficit
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}
                >
                  {!questionCoverageSemaphore.hasDeficit
                    ? '✓ Cobertura mínima de preguntas por módulo cumplida'
                    : '🔴 Déficit de preguntas en módulos con evaluación activa'}
                </span>
              </div>

              {wizardStep !== 'all' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={wizardStep === 1}
                    onClick={() =>
                      setWizardStep((prev) =>
                        prev === 'all' || prev <= 1 ? 1 : ((prev - 1) as 1 | 2 | 3 | 4)
                      )
                    }
                    className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold cursor-pointer"
                  >
                    ← Paso Anterior
                  </button>
                  <button
                    type="button"
                    disabled={wizardStep === 4}
                    onClick={() =>
                      setWizardStep((prev) =>
                        prev === 'all' || prev >= 4 ? 4 : ((prev + 1) as 1 | 2 | 3 | 4)
                      )
                    }
                    className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-40 font-bold cursor-pointer"
                  >
                    Siguiente Paso →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Formulario completo de Nuevo Curso */}
          <form onSubmit={handleSaveCreatedCourse} className="space-y-6">
            {/* 1. Datos principales del Nuevo Curso y Cuenta de Docente Asignado */}
            <div
              className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 ${
                wizardStep !== 'all' && wizardStep !== 1 ? 'hidden' : ''
              }`}
            >
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <BookOpen className="w-5 h-5 text-purple-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editingCourseId ? 'Modificar Curso' : 'Nuevo curso'}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Nombre del curso</label>
                  <input
                    type="text"
                    required
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Código</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold uppercase text-indigo-700"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Nombre de asignatura
                  </label>
                  <input
                    type="text"
                    required
                    value={courseSubjectName}
                    onChange={(e) => setCourseSubjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Sede</label>
                  <input
                    type="text"
                    required
                    value={courseSede}
                    onChange={(e) => setCourseSede(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900"
                  />
                </div>
              </div>

              {/* Cuenta de docente asignado "Usuario y Clave" asignados */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    <span>Cuenta de docente asignado (Usuario y Clave asignados)</span>
                  </span>

                  <select
                    value={assignedTeacherAccount}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        setAssignedTeacherAccount('');
                        setAssignedTeacherPass('');
                        setAssignedTeacherName('');
                        return;
                      }
                      const found = registeredTeachers.find((t) => t.id === selectedId);
                      if (found) {
                        setAssignedTeacherAccount(found.id);
                        setAssignedTeacherPass(found.claveAcceso);
                        setAssignedTeacherName(found.nombre);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-white font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="">Seleccionar docente que dictará el curso...</option>
                    {registeredTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nombre del docente
                    </label>
                    <input
                      type="text"
                      value={assignedTeacherName}
                      onChange={(e) => setAssignedTeacherName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Usuario asignado
                    </label>
                    <input
                      type="text"
                      required
                      value={assignedTeacherAccount}
                      onChange={(e) => setAssignedTeacherAccount(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold uppercase text-indigo-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Clave asignada</label>
                    <div className="relative">
                      <input
                        type={showAssignedTeacherPass ? 'text' : 'password'}
                        required
                        value={assignedTeacherPass}
                        onChange={(e) => setAssignedTeacherPass(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-indigo-900"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAssignedTeacherPass((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showAssignedTeacherPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Crear Módulo & Agregar otro Módulo */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Crear Módulo ({courseModules.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddAnotherModule}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar otro Módulo</span>
                </button>
              </div>

              <div className="space-y-5">
                {courseModules.map((mod, idx) => {
                  const w = mod.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS;
                  const sumPct =
                    (Number(w.comportamientoPct) || 0) +
                    (Number(w.participacionPct) || 0) +
                    (Number(w.examenPct) || 0) +
                    (Number(w.trabajoPct) || 0);
                  const rawLinks =
                    typeof mod.enlacesTextoRaw === 'string'
                      ? mod.enlacesTextoRaw
                      : formatStructuredDocumentLinksToRaw(mod.documentosEnlaces);
                  const moduleTopics =
                    Array.isArray(mod.temasModulo) && mod.temasModulo.length > 0
                      ? mod.temasModulo
                      : [''];

                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                        <span className="px-3 py-1 rounded-lg bg-sky-700 text-white font-mono font-bold">
                          Número de módulo: {mod.id}
                        </span>
                        {courseModules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveModule(idx)}
                            className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Quitar Módulo</span>
                          </button>
                        )}
                      </div>

                      {/* Fila 1: Número de módulo, Nombre del módulo, Horas para el módulo, Cantidad de exámenes, Cantidad de retos */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">
                            Número de módulo
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={mod.id}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-100 font-mono font-bold text-center text-slate-800"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block font-bold text-slate-700 mb-1">
                            Nombre del módulo
                          </label>
                          <input
                            type="text"
                            required
                            value={mod.shortTitle}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateModuleAt(idx, (m) => ({
                                ...m,
                                shortTitle: val,
                                fullTitle: `Módulo ${m.id}: ${val}`
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">
                            Horas para el módulo
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={mod.horasModulo ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateModuleAt(idx, (m) => ({
                                ...m,
                                horasModulo: val
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-center"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">
                            Cantidad de exámenes
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={mod.examenesCount ? mod.examenesCount : ''}
                            onChange={(e) => {
                              const val =
                                e.target.value === ''
                                  ? 0
                                  : Math.max(0, parseInt(e.target.value, 10) || 0);
                              updateModuleAt(idx, (m) => ({ ...m, examenesCount: val }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-center"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-bold text-slate-700 mb-1">
                            Cantidad de retos
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={mod.retosCount ? mod.retosCount : ''}
                            onChange={(e) => {
                              const val =
                                e.target.value === ''
                                  ? 0
                                  : Math.max(0, parseInt(e.target.value, 10) || 0);
                              updateModuleAt(idx, (m) => ({ ...m, retosCount: val }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-center"
                          />
                        </div>
                      </div>

                      {/* Descripción del módulo */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Descripción del módulo
                        </label>
                        <textarea
                          rows={2}
                          value={mod.description || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateModuleAt(idx, (m) => ({
                              ...m,
                              description: val
                            }));
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                        />
                      </div>

                      {/* Distribución de calificación en %: "Comportamiento", "Sustentación/Participación", "Examen/es", "Reto/s" */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            Distribución de calificación en %
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                              sumPct === 100
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            Total: {sumPct}%
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Comportamiento (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={w.comportamientoPct ? w.comportamientoPct : ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ''
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(100, parseInt(e.target.value, 10) || 0)
                                      );
                                updateModuleAt(idx, (m) => ({
                                  ...m,
                                  ponderacion: { ...w, comportamientoPct: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-center"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Sustentación/Participación (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={w.participacionPct ? w.participacionPct : ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ''
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(100, parseInt(e.target.value, 10) || 0)
                                      );
                                updateModuleAt(idx, (m) => ({
                                  ...m,
                                  ponderacion: { ...w, participacionPct: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-center"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Examen/es (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={w.examenPct ? w.examenPct : ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ''
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(100, parseInt(e.target.value, 10) || 0)
                                      );
                                updateModuleAt(idx, (m) => ({
                                  ...m,
                                  ponderacion: { ...w, examenPct: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-center"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Reto/s (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={w.trabajoPct ? w.trabajoPct : ''}
                              onChange={(e) => {
                                const val =
                                  e.target.value === ''
                                    ? 0
                                    : Math.max(
                                        0,
                                        Math.min(100, parseInt(e.target.value, 10) || 0)
                                      );
                                updateModuleAt(idx, (m) => ({
                                  ...m,
                                  ponderacion: { ...w, trabajoPct: val }
                                }));
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold text-center"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Asistencia Bloque A y B (primer llamado al inicio y segundo llamado al finalizar clases) */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <CheckSquare className="w-4 h-4 text-sky-600" />
                          <span>
                            Asistencia Bloque A y B (Primer llamado al inicio y segundo llamado al finalizar clases)
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(mod.asistenciaBloqueA)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                updateModuleAt(idx, (m) => ({ ...m, asistenciaBloqueA: checked }));
                              }}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                            <span className="font-semibold text-slate-800">
                              Bloque A · Primer llamado al inicio de clases
                            </span>
                          </label>

                          <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(mod.asistenciaBloqueB)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                updateModuleAt(idx, (m) => ({ ...m, asistenciaBloqueB: checked }));
                              }}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                            <span className="font-semibold text-slate-800">
                              Bloque B · Segundo llamado al finalizar clases
                            </span>
                          </label>
                        </div>
                      </div>

                      {/* Campo de enlace/s para agregar documento/s del módulo & Observación */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Campo de enlace/s para agregar documento/s del módulo
                          </label>
                          <textarea
                            rows={2}
                            value={rawLinks}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateModuleAt(idx, (m) => ({
                                ...m,
                                enlacesTextoRaw: val,
                                documentosEnlaces: parseRawDocumentLinksToStructured(
                                  val,
                                  m.id,
                                  m.shortTitle
                                )
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Observación
                          </label>
                          <textarea
                            rows={2}
                            value={mod.observacion || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateModuleAt(idx, (m) => ({
                                ...m,
                                observacion: val
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                        </div>
                      </div>

                      {/* Crear tema -> Nombre del tema / Crear otro tema */}
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            Crear tema ({moduleTopics.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddTopicToModule(idx)}
                            className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Crear otro tema</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {moduleTopics.map((topicVal, tIdx) => (
                            <div key={tIdx} className="flex items-center gap-2">
                              <div className="flex-1">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                  Nombre del tema #{tIdx + 1}
                                </label>
                                <input
                                  type="text"
                                  value={topicVal}
                                  onChange={(e) =>
                                    handleUpdateTopicInModule(idx, tIdx, e.target.value)
                                  }
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900"
                                />
                              </div>
                              {moduleTopics.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTopicFromModule(idx, tIdx)}
                                  className="mt-4 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                  title="Quitar tema"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleAddAnotherModule}
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/50 hover:bg-sky-50 text-sky-900 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar otro Módulo</span>
                </button>
              </div>
            </div>

            {/* 3. Ponderación Porcentual Global del curso */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Ponderación Porcentual Global del curso
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ponderación porcentual acumulada de los {courseModules.length} módulo(s) del curso
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={globalCourseWeightPct ? globalCourseWeightPct : ''}
                    onChange={(e) =>
                      setGlobalCourseWeightPct(
                        e.target.value === ''
                          ? 0
                          : Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))
                      )
                    }
                    className="w-24 px-3 py-2 rounded-xl border border-indigo-300 font-mono font-bold text-center text-indigo-950"
                  />
                  <span className="font-mono font-bold text-sm text-slate-700">%</span>
                </div>
              </div>
            </div>

            {/* 4. NUEVA SECCIÓN / ZONA: SELECCION DE BANCOS ESTUDIANTES/PREGUNTAS */}
            <div
              className={`bg-white border-2 border-indigo-200 rounded-2xl p-6 shadow-xs space-y-6 ${
                wizardStep !== 'all' && wizardStep !== 3 ? 'hidden' : ''
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[11px] font-mono font-bold text-indigo-900 uppercase">
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Vinculación de Bases de Datos al Curso</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Seleccion de Bancos Estudiantes/Preguntas
                  </h3>
                  <p className="text-xs text-slate-600">
                    Seleccione del listado qué base de datos de <strong>«Nominas de estudiantes»</strong> y qué base de datos de <strong>«Banco de preguntas»</strong> cargará este curso ({courseName || 'Nuevo Curso'}).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (courseStudentsBank.length === 0) {
                        const targetDb =
                          studentRosterDatabases.find((d) => d.id === activeRosterDbId) ||
                          studentRosterDatabases[0];
                        if (targetDb) {
                          setActiveRosterDbId(targetDb.id);
                          setCourseStudentsBank((targetDb.students || []).map((s) => ({ ...s })));
                        }
                      }
                      setActiveCard('nominas_estudiantes');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>Ir a ventana «Nominas de estudiantes»</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (courseQuestionsBank.length === 0) {
                        const targetDb =
                          questionBankDatabases.find((d) => d.id === activeQuestionBankDbId) ||
                          questionBankDatabases[0];
                        if (targetDb) {
                          setActiveQuestionBankDbId(targetDb.id);
                          setCourseQuestionsBank(
                            (targetDb.questions || []).map((q) => ({
                              ...q,
                              opciones: { ...q.opciones }
                            }))
                          );
                        }
                      }
                      setActiveCard('banco_preguntas');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Database className="w-4 h-4" />
                    <span>Ir a ventana «Banco de preguntas»</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* SUB-COLUMNA 1: LISTADO DE BASES DE DATOS DE "NOMINAS DE ESTUDIANTES" PARA SELECCIONAR QUE CARGARA EL CURSO */}
                <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/30 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/80 pb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-teal-700" />
                        <h4 className="text-sm font-extrabold text-slate-900">
                          Bases de datos de «Nominas de estudiantes» ({studentRosterDatabases.length})
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Seleccione la nómina de estudiantes que cargará este curso ({courseStudentsBank.length} estudiantes cargados actualmente).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveCard('nominas_estudiantes')}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-teal-50 border border-teal-300 text-teal-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Administrar Nóminas</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {studentRosterDatabases.map((db) => {
                      const isSelected =
                        selectedStudentRosterDbId === db.id ||
                        (!selectedStudentRosterDbId &&
                          courseStudentsBank.length > 0 &&
                          courseStudentsBank.length === db.students.length &&
                          courseStudentsBank[0]?.id === db.students[0]?.id);

                      return (
                        <div
                          key={db.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                            isSelected
                              ? 'border-teal-600 bg-white ring-2 ring-teal-500/20 shadow-xs'
                              : 'border-slate-200 bg-white/90 hover:border-teal-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-teal-900 text-white font-mono text-[10px] font-bold">
                                  {db.code}
                                </span>
                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                  {db.name}
                                </span>
                                {isSelected && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-mono font-bold">
                                    ✓ SELECCIONADA EN EL CURSO
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {db.description || 'Base de datos de nómina de estudiantes'}
                              </p>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 font-mono text-xs font-extrabold shrink-0">
                              {db.students.length} Est.
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                            <span className="text-slate-500 font-mono truncate max-w-[230px]">
                              {db.students.length > 0
                                ? `Ej: ${db.students
                                    .slice(0, 2)
                                    .map((s) => s.nombre)
                                    .join(', ')}${db.students.length > 2 ? '...' : ''}`
                                : 'Sin estudiantes registrados'}
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSwitchActiveRosterDbInWindow(db.id);
                                  setActiveCard('nominas_estudiantes');
                                }}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                              >
                                Ver / Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectRosterDatabaseForCourse(db)}
                                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                                }`}
                              >
                                {isSelected ? '✓ Cargada en Curso' : 'Seleccionar para el Curso'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SUB-COLUMNA 2: LISTADO DE BASES DE DATOS DE "BANCO DE PREGUNTAS" PARA SELECCIONAR QUE CARGARA EL CURSO */}
                <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/30 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-amber-700" />
                        <h4 className="text-sm font-extrabold text-slate-900">
                          Bases de datos de «Banco de preguntas» ({questionBankDatabases.length})
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Seleccione el banco de preguntas que cargará este curso ({courseQuestionsBank.length} reactivos cargados actualmente).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveCard('banco_preguntas')}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Administrar Bancos</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {questionBankDatabases.map((db) => {
                      const isSelected =
                        selectedQuestionBankDbId === db.id ||
                        (!selectedQuestionBankDbId &&
                          courseQuestionsBank.length > 0 &&
                          courseQuestionsBank.length === db.questions.length &&
                          courseQuestionsBank[0]?.id === db.questions[0]?.id);

                      const modulesSet = new Set(db.questions.map((q) => q.modulo));

                      return (
                        <div
                          key={db.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                            isSelected
                              ? 'border-amber-600 bg-white ring-2 ring-amber-500/20 shadow-xs'
                              : 'border-slate-200 bg-white/90 hover:border-amber-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-amber-900 text-white font-mono text-[10px] font-bold">
                                  {db.code}
                                </span>
                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                  {db.name}
                                </span>
                                {isSelected && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-mono font-bold">
                                    ✓ SELECCIONADO EN EL CURSO
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {db.description || 'Base de datos de preguntas y respuestas'}
                              </p>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 font-mono text-xs font-extrabold shrink-0">
                              {db.questions.length} Preg.
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                            <span className="text-slate-500 font-mono">
                              {db.questions.length > 0
                                ? `Cobertura: ${modulesSet.size} módulo(s) con preguntas`
                                : 'Banco vacío (0 preguntas)'}
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSwitchActiveQuestionBankDbInWindow(db.id);
                                  setActiveCard('banco_preguntas');
                                }}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                              >
                                Ver / Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectQuestionBankDatabaseForCourse(db)}
                                className={`px-3 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                                }`}
                              >
                                {isSelected ? '✓ Cargado en Curso' : 'Seleccionar para el Curso'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Examen integral FINAL y Resumen Ejecutivo de Publicación (Paso 4) */}
            <div
              className={`bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5 ${
                wizardStep !== 'all' && wizardStep !== 4 ? 'hidden' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="chkEnableIntegralFinal"
                  checked={enableFinalIntegralExam}
                  onChange={(e) => setEnableFinalIntegralExam(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-purple-300 cursor-pointer"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="chkEnableIntegralFinal"
                    className="text-base font-bold text-slate-900 cursor-pointer block"
                  >
                    Examen integral FINAL: este examen integra todos los módulos creados en el curso.
                  </label>
                  <p className="text-xs text-slate-600">
                    (Las condiciones están establecidas en el panel del docente.), cantidad de preguntas, tiempo, etc.
                  </p>
                </div>
              </div>

              {/* Tarjeta de Resumen Ejecutivo Pre-Publicación */}
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-purple-950 text-sm">
                    📋 Resumen Ejecutivo del Curso Antes de Publicar / Guardar
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveCourseSnapshot()}
                      className="px-3 py-1.5 rounded-lg border border-purple-300 bg-white hover:bg-purple-50 text-purple-900 font-bold cursor-pointer"
                    >
                      📸 Crear Instantánea (Snapshot)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLivePreviewModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                    >
                      👁️ Previsualizar Vista Estudiante / Docente
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-white border border-purple-100">
                    <div className="text-slate-500">Curso / Código</div>
                    <div className="font-extrabold text-slate-900 mt-0.5">
                      {courseName || 'Sin nombre'} ({courseCode || '—'})
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-purple-100">
                    <div className="text-slate-500">Docente Asignado</div>
                    <div className="font-extrabold text-indigo-700 font-mono mt-0.5">
                      {assignedTeacherAccount || 'Sin asignar'}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-purple-100">
                    <div className="text-slate-500">Módulos / Evaluaciones</div>
                    <div className="font-extrabold text-slate-900 mt-0.5">
                      {courseModules.length} Mód. ·{' '}
                      {courseModules.reduce((a, m) => a + (Number(m.examenesCount) || 0), 0)} Ex. ·{' '}
                      {courseModules.reduce((a, m) => a + (Number(m.retosCount) || 0), 0)} Retos
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-purple-100">
                    <div className="text-slate-500">Banco del Curso</div>
                    <div className="font-extrabold text-emerald-700 mt-0.5">
                      {courseQuestionsBank.length} Preguntas Cargadas
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Botones Finales: Guardar Curso, Respaldo total del curso creado (Exportar) y Eliminar Curso */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleExportCourseBackup()}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Respaldo total del curso creado (Exportar)</span>
                </button>

                {confirmDeleteCourseInForm ? (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-300 rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-red-900">
                      ¿Confirmar eliminar este curso?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = editingCourseId || activeMeta.courseId;
                        if (targetId) {
                          handleDeleteCourse(targetId);
                        }
                        resetNewCourseForm();
                        setConfirmDeleteCourseInForm(false);
                        setActiveCard('cursos_activos');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Sí, Eliminar Curso
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCourseInForm(false)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCourseInForm(true)}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Curso</span>
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{editingCourseId ? 'Guardar Cambios del Curso' : 'Crear Nuevo Curso'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 5: PANTALLA / VENTANA "NOMINAS DE ESTUDIANTES"                      */}
      {/* ========================================================================= */}
      {activeCard === 'nominas_estudiantes' && (
        <div className="space-y-6">
          {/* 1. PRIMERA SECCIÓN/ZONA: NAVEGACIÓN PRINCIPAL CON DOS BOTONES */}
          <div className="bg-white border-2 border-teal-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-[11px] font-mono font-bold text-teal-900 uppercase">
                  <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                  <span>Pantalla / Ventana: Nominas de estudiantes</span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Gestión de Bases de Datos — Nominas de estudiantes
                </h3>
                <p className="text-xs text-slate-600">
                  Seleccione una opción para crear una nueva base de datos de estudiantes o consultar/modificar el listado de bases de datos creadas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveCard('crear_nuevo_curso')}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs self-start lg:self-auto"
              >
                <FolderPlus className="w-4 h-4" />
                <span>
                  Ir a {editingCourseId ? 'Modificar Curso' : 'Crear Nuevo Curso'}
                </span>
              </button>
            </div>

            {/* DOS BOTONES PRINCIPALES DE LA SECCIÓN: "Crear nueva base de datos" y "Ver listado de bases de datos creados" */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleStartNewRosterDatabaseTab}
                className={`min-h-[54px] px-5 py-3.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  rosterWindowTab === 'crear'
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : 'border-teal-200 bg-teal-50/50 hover:bg-teal-100/70 text-teal-950'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Crear nueva base de datos</span>
                {rosterWindowTab === 'crear' && editingRosterDbId && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono">
                    Modo Modificar (Clic para limpiar)
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRosterWindowTab('listado');
                }}
                className={`min-h-[54px] px-5 py-3.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  rosterWindowTab === 'listado'
                    ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>
                  Ver listado de bases de datos creados ({studentRosterDatabases.length})
                </span>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PESTAÑA A: "CREAR NUEVA BASE DE DATOS" (O MODIFICAR BASE SELECCIONADA) */}
          {/* ===================================================================== */}
          {rosterWindowTab === 'crear' && (
            <div className="space-y-6">
              {/* Campo para agregar nombre de base de datos a crear + Botón Guardar base de datos */}
              <form
                onSubmit={handleSaveRosterDatabase}
                className="bg-white border-2 border-teal-300 rounded-2xl p-6 shadow-xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-xs font-mono font-bold">
                      {editingRosterDbId ? 'MODIFICAR BASE DE DATOS' : 'NUEVA BASE DE DATOS'}
                    </span>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                      {editingRosterDbId
                        ? `Modificando: ${newRosterDbName || 'Base de datos de Nómina'}`
                        : 'Configuración de la nueva base de datos de Nómina'}
                    </h4>
                  </div>

                  {editingRosterDbId && (
                    <button
                      type="button"
                      onClick={handleStartNewRosterDatabaseTab}
                      className="px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold cursor-pointer"
                    >
                      + Iniciar otra base de datos en blanco
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-6">
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      Nombre de la base de datos a crear <span className="text-red-600">*</span>
                    </label>
                    <input
                      ref={rosterNameInputRef}
                      type="text"
                      required
                      value={newRosterDbName}
                      onChange={(e) => {
                        setNewRosterDbName(e.target.value);
                        if (e.target.value.trim()) setRosterNameError(false);
                      }}
                      placeholder="Obligatorio *: Escriba el nombre de la base de datos (Ej: Nómina Marketing Grupo 1 - 2026)"
                      className={`w-full px-3.5 py-2.5 rounded-xl border-2 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                        rosterNameError && !newRosterDbName.trim()
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-600'
                          : 'border-teal-300 focus:ring-teal-600'
                      }`}
                    />
                    {rosterNameError && !newRosterDbName.trim() && (
                      <p className="mt-1 text-[11px] font-bold text-red-600">
                        * Campo obligatorio: ingrese el Nombre de la base de datos a crear antes de guardar.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Código / Identificador (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      value={newRosterDbCode}
                      onChange={(e) => setNewRosterDbCode(e.target.value.toUpperCase())}
                      placeholder="Ej: NOM-G1 (Automático)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono font-bold uppercase text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="w-full min-h-[44px] py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      <span>Guardar base de datos</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* SECCIÓN / ZONA: "Nómina Oficial de Estudiantes Asignados al Curso" */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <OptionServerSaveBar
                  sectionKey="nomina_estudiantes_editor"
                  label="Nómina Oficial de Estudiantes Asignados al Curso"
                  autoSave={Boolean(editingRosterDbId && newRosterDbName.trim())}
                  watchValue={courseStudentsBank.map(
                    (s) =>
                      `${s.id}:${s.nombre}:${s.correo || ''}:${s.whatsapp || ''}:${s.codigoAcceso}`
                  )}
                />

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Users className="w-5 h-5 text-sky-600" />
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                        Nómina Oficial de Estudiantes Asignados al Curso ({courseStudentsBank.length} Estudiantes)
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200 text-[11px] font-bold">
                        {newRosterDbName.trim()
                          ? `Base: ${newRosterDbName.trim()}`
                          : 'Nueva base de datos en edición'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Agregue los datos de los estudiantes <strong>por estudiante individual</strong> o <strong>por lote (Excel / CSV)</strong> y luego pulse <strong>«Guardar base de datos»</strong>.
                    </p>
                  </div>
                </div>

                {/* Opciones Reorganizadas en 2 Bloques Claros: 1. Agregar (Por estudiante o por lote) y 2. Códigos / Exportación */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  {/* Bloque 1: Agregar datos de los estudiantes (Por estudiante o por lote) */}
                  <div className="lg:col-span-7 space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      1. Agregar datos de los estudiantes (Por estudiante o por lote)
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={openEdAddStudentModal}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>+ Agregar por Estudiante</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEdBulkImportStatus(null);
                          setEdBulkStudentModalOpen(true);
                        }}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>+ Agregar por Lote (Pegar Excel / CSV)</span>
                      </button>

                      <label className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
                        <FileSpreadsheet className="w-4 h-4 shrink-0" />
                        <span>Subir Lote Excel (.xlsx / .csv)</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                          onChange={(e) => handleEdUploadStudentExcelFile(e, 'merge')}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          const clonedOfficial = INITIAL_STUDENTS.map((s) => ({
                            ...s
                          }));
                          updateEditorStudentsBank(clonedOfficial);
                          setEdStudentBanner(
                            `✓ Se cargaron los ${clonedOfficial.length} estudiantes de la nómina base oficial.`
                          );
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-900 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                        <span>Cargar Plantilla Base ({INITIAL_STUDENTS.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Bloque 2: Gestión de Códigos, Exportación y Borrado por Lote */}
                  <div className="lg:col-span-5 space-y-2 lg:border-l lg:border-slate-200 lg:pl-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      2. Códigos de Acceso, Exportación y Depuración
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openEdBatchAccessCodeEditor(
                            edSelectedStudentIdsForBatch.length > 0 ? 'selected' : 'all'
                          )
                        }
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          🔑 Códigos (
                          {edSelectedStudentIdsForBatch.length > 0
                            ? `${edSelectedStudentIdsForBatch.length}`
                            : `${courseStudentsBank.length}`}
                          )
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={exportEdNominaExcel}
                        disabled={courseStudentsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-xs font-semibold text-emerald-900 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportEdNominaCsv}
                        disabled={courseStudentsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>CSV</span>
                      </button>

                      {edConfirmBatchDeleteStudents ? (
                        <div className="inline-flex flex-wrap items-center gap-1.5 bg-red-50 border-2 border-red-400 px-3 py-1.5 rounded-xl text-xs">
                          <span className="font-bold text-red-900">
                            ¿Eliminar {edSelectedStudentIdsForBatch.length}?
                          </span>
                          <button
                            type="button"
                            onClick={executeEdBatchDeleteStudents}
                            className="px-2.5 py-1 bg-red-600 text-white rounded-lg font-bold cursor-pointer"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setEdConfirmBatchDeleteStudents(false)}
                            className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={edSelectedStudentIdsForBatch.length === 0}
                          onClick={() => setEdConfirmBatchDeleteStudents(true)}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-red-300 bg-red-50/70 hover:bg-red-100 disabled:opacity-40 text-xs font-semibold text-red-800 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>Eliminar Lote ({edSelectedStudentIdsForBatch.length})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {edStudentBanner && (
                  <div className="p-3 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs">
                    <span>{edStudentBanner}</span>
                    <button
                      type="button"
                      onClick={() => setEdStudentBanner(null)}
                      className="text-emerald-800 hover:text-emerald-950 font-bold px-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {edBulkImportStatus && (
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-300 text-xs font-semibold text-sky-950 flex items-center justify-between">
                    <span>{edBulkImportStatus}</span>
                    <button
                      type="button"
                      onClick={() => setEdBulkImportStatus(null)}
                      className="text-sky-800 hover:text-sky-950 font-bold px-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Barra de Búsqueda */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={edStudentSearch}
                      onChange={(e) => setEdStudentSearch(e.target.value)}
                      placeholder="Buscar estudiante por ID, nombre, correo, WhatsApp o código..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                  </div>
                  <div className="text-xs font-mono text-slate-600">
                    Mostrando <strong>{edFilteredStudents.length}</strong> de{' '}
                    <strong>{courseStudentsBank.length}</strong> estudiantes en esta nómina
                  </div>
                </div>

                {/* Tabla de Estudiantes Asignados */}
                {courseStudentsBank.length === 0 ? (
                  <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-center space-y-2">
                    <Users className="w-7 h-7 text-slate-400 mx-auto" />
                    <div className="text-sm font-bold text-slate-800">
                      La nómina está lista para agregar estudiantes
                    </div>
                    <p className="text-xs text-slate-500 max-w-lg mx-auto">
                      Escriba arriba el nombre de la base de datos y use <strong>«+ Agregar por Estudiante»</strong> o <strong>«+ Agregar por Lote»</strong>. Al finalizar, pulse <strong>«Guardar base de datos»</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[520px] overflow-y-auto">
                    <table className="w-full table-auto text-left border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 leading-tight">
                          <th className="py-2.5 px-2 w-8 text-center">
                            <input
                              type="checkbox"
                              checked={
                                edFilteredStudents.length > 0 &&
                                edSelectedStudentIdsForBatch.length === edFilteredStudents.length
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEdSelectedStudentIdsForBatch(
                                    edFilteredStudents.map((s) => s.id)
                                  );
                                } else {
                                  setEdSelectedStudentIdsForBatch([]);
                                }
                              }}
                              aria-label="Seleccionar todos los estudiantes filtrados"
                            />
                          </th>
                          <th className="py-2.5 px-2 w-[110px]">ID Estudiante</th>
                          <th className="py-2.5 px-2.5 min-w-[180px]">
                            <div>Nombre Completo</div>
                            <div className="text-[10px] font-normal text-slate-500">
                              Correo / WhatsApp (Opcional)
                            </div>
                          </th>
                          <th className="py-2.5 px-2 w-[230px]">
                            <span>Código de Acceso (12 Caracteres)</span>
                          </th>
                          <th className="py-2.5 px-2 text-right w-[160px]">Acciones Editor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[11px] leading-snug">
                        {edFilteredStudents.map((st) => {
                          const isChecked = edSelectedStudentIdsForBatch.includes(st.id);
                          const currentDraftCode =
                            edStudentCodeDrafts[st.id] !== undefined
                              ? edStudentCodeDrafts[st.id]
                              : st.codigoAcceso;
                          const pendingChange =
                            currentDraftCode.trim().toUpperCase() !==
                              st.codigoAcceso.trim().toUpperCase() &&
                            currentDraftCode.trim().length >= 4;

                          return (
                            <tr
                              key={st.id}
                              className="hover:bg-slate-50/80 transition-colors align-middle"
                            >
                              <td className="py-2 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEdSelectedStudentIdsForBatch((prev) => [...prev, st.id]);
                                    } else {
                                      setEdSelectedStudentIdsForBatch((prev) =>
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
                                <div>{st.nombre}</div>
                                {st.correo || st.whatsapp ? (
                                  <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                                    {st.correo && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-900 font-normal break-all">
                                        <span>✉️</span>
                                        <span>{st.correo}</span>
                                      </span>
                                    )}
                                    {st.whatsapp && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-normal">
                                        <span>📱</span>
                                        <span>{st.whatsapp}</span>
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openEdEditStudentModal(st)}
                                    className="mt-0.5 text-[10px] text-slate-400 hover:text-sky-700 font-normal hover:underline cursor-pointer"
                                  >
                                    + Correo / WhatsApp (opc.)
                                  </button>
                                )}
                              </td>
                              <td className="py-2 px-2 font-mono font-bold text-sky-800">
                                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg p-1 bg-slate-50 border border-slate-200">
                                  <input
                                    type="text"
                                    maxLength={24}
                                    value={currentDraftCode}
                                    onChange={(e) => {
                                      const val = e.target.value.toUpperCase();
                                      setEdStudentCodeDrafts((prev) => ({
                                        ...prev,
                                        [st.id]: val
                                      }));
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (pendingChange) handleEdSaveDirectStudentCode(st);
                                      }
                                    }}
                                    className="w-[116px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] font-mono font-bold uppercase text-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={!pendingChange}
                                    onClick={() => handleEdSaveDirectStudentCode(st)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${
                                      pendingChange
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                    }`}
                                  >
                                    <Save className="w-2.5 h-2.5" />
                                    <span>Guardar</span>
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="inline-flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdEditStudentModal(st)}
                                    className="px-2 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1 text-[10px] cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3 shrink-0" />
                                    <span>Editar</span>
                                  </button>

                                  {edConfirmDeleteStudentId === st.id ? (
                                    <div className="inline-flex items-center gap-1 bg-red-50 border border-red-300 px-1.5 py-0.5 rounded-md">
                                      <span className="text-red-900 font-semibold text-[10px]">
                                        ¿Eliminar?
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => executeEdDeleteStudent(st.id)}
                                        className="px-1.5 py-0.5 bg-red-600 text-white rounded font-bold text-[10px] cursor-pointer"
                                      >
                                        Sí
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEdConfirmDeleteStudentId(null)}
                                        className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded text-[10px] cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEdConfirmDeleteStudentId(st.id)}
                                      className="p-1 rounded-md border border-slate-200 text-red-600 hover:bg-red-50 cursor-pointer"
                                      title="Eliminar estudiante de la nómina"
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
                )}

                {/* Barra Inferior con Campo Obligatorio Nombre de la base de datos a crear * y Botón: Guardar base de datos */}
                <div className="pt-4 border-t border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4 bg-teal-50/40 p-4 rounded-xl border border-teal-200">
                  <div className="flex-1 space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800">
                      Nombre de la base de datos a crear <span className="text-red-600">*</span>{' '}
                      <span className="font-normal text-slate-600">
                        (Total estudiantes agregados: <strong>{courseStudentsBank.length}</strong>)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newRosterDbName}
                      onChange={(e) => {
                        setNewRosterDbName(e.target.value);
                        if (e.target.value.trim()) setRosterNameError(false);
                      }}
                      placeholder="Obligatorio *: Ingrese el nombre de la base de datos a crear..."
                      className={`w-full px-3.5 py-2.5 rounded-xl border-2 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                        rosterNameError && !newRosterDbName.trim()
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-600'
                          : 'border-teal-300 focus:ring-teal-600'
                      }`}
                    />
                    {rosterNameError && !newRosterDbName.trim() && (
                      <p className="text-[11px] font-bold text-red-600">
                        * Es obligatorio ingresar el Nombre de la base de datos a crear antes de guardar.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveRosterDatabase()}
                    className="w-full lg:w-auto min-h-[44px] px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Guardar base de datos</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PESTAÑA B: "VER LISTADO DE BASES DE DATOS CREADOS"                    */}
          {/* (CADA BANCO TIENE AL LADO LOS BOTONES: "Ver", "Modificar" y "Eliminar") */}
          {/* ===================================================================== */}
          {rosterWindowTab === 'listado' && (
            <div className="bg-white border-2 border-teal-200 rounded-2xl p-6 shadow-xs space-y-5">
              {edStudentBanner && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{edStudentBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEdStudentBanner(null)}
                    className="text-emerald-800 hover:text-emerald-950 font-bold px-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h4 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Listado de Bases de Datos de «Nominas de estudiantes» Creados ({studentRosterDatabases.length})
                  </h4>
                  <p className="text-xs text-slate-600">
                    Utilice los botones <strong>«Ver»</strong>, <strong>«Modificar»</strong> y <strong>«Eliminar»</strong> al lado de cada banco de datos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartNewRosterDatabaseTab}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear nueva base de datos</span>
                </button>
              </div>

              {studentRosterDatabases.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-2">
                  <div className="text-sm font-bold text-slate-800">
                    No hay bases de datos de nóminas registradas
                  </div>
                  <p className="text-xs text-slate-500">
                    Haga clic en el botón «Crear nueva base de datos» para registrar su primera nómina.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {studentRosterDatabases.map((db) => {
                    const isViewing = viewingRosterDbId === db.id;
                    const isSelectedForCourse = selectedStudentRosterDbId === db.id;

                    return (
                      <div
                        key={db.id}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isViewing
                            ? 'border-teal-600 bg-teal-50/30 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-teal-300'
                        }`}
                      >
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded bg-teal-900 text-white font-mono text-[11px] font-bold">
                                {db.code}
                              </span>
                              <span className="text-sm font-extrabold text-slate-900">
                                {db.name}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-950 font-mono text-[11px] font-extrabold">
                                {db.students.length} Estudiantes
                              </span>
                              {isSelectedForCourse && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-mono font-bold">
                                  ✓ Asignada al Curso
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {db.description || 'Base de datos de nómina de estudiantes'} · Actualizado:{' '}
                              {db.updatedAtIso ? db.updatedAtIso.slice(0, 10) : '2026'}
                            </p>
                          </div>

                          {/* BOTONES AL LADO DE CADA BANCO DE DATOS: "Ver", "Modificar" y "Eliminar" */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setViewingRosterDbId((prev) => (prev === db.id ? null : db.id))
                              }
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isViewing
                                  ? 'bg-sky-700 text-white'
                                  : 'border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isViewing ? 'Ocultar' : 'Ver'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleModifyRosterDatabaseFromList(db)}
                              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Modificar</span>
                            </button>

                            {confirmDeleteRosterDbId === db.id ? (
                              <div className="inline-flex items-center gap-1.5 bg-red-50 border-2 border-red-300 px-2.5 py-1.5 rounded-xl text-xs">
                                <span className="font-bold text-red-900">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRosterDatabase(db.id)}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRosterDbId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRosterDbId(db.id)}
                                className="px-3.5 py-2 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Panel desplegable al pulsar el botón "Ver" */}
                        {isViewing && (
                          <div className="border-t border-teal-200 bg-white p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-teal-950">
                                Vista de Estudiantes en «{db.name}» ({db.students.length} registros)
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectRosterDatabaseForCourse(db)}
                                  className="px-3 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold cursor-pointer"
                                >
                                  ✓ Seleccionar esta nómina para el curso
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleModifyRosterDatabaseFromList(db)}
                                  className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                                >
                                  Ir a Modificar esta base de datos
                                </button>
                              </div>
                            </div>

                            {db.students.length === 0 ? (
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                                Esta base de datos de nómina no tiene estudiantes registrados aún.
                              </div>
                            ) : (
                              <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                      <th className="py-2 px-3 font-bold text-slate-700">ID Estudiante</th>
                                      <th className="py-2 px-3 font-bold text-slate-700">Nombre Completo</th>
                                      <th className="py-2 px-3 font-bold text-slate-700">Correo / WhatsApp</th>
                                      <th className="py-2 px-3 font-bold text-slate-700">Código de Acceso</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {db.students.map((s) => (
                                      <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="py-1.5 px-3 font-mono font-semibold text-slate-900">
                                          {s.id}
                                        </td>
                                        <td className="py-1.5 px-3 font-medium text-slate-900">
                                          {s.nombre}
                                        </td>
                                        <td className="py-1.5 px-3 text-slate-600">
                                          {[s.correo, s.whatsapp].filter(Boolean).join(' · ') || '—'}
                                        </td>
                                        <td className="py-1.5 px-3 font-mono font-bold text-teal-800">
                                          {s.codigoAcceso}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 6: PANTALLA / VENTANA "BANCO DE PREGUNTAS"                          */}
      {/* ========================================================================= */}
      {activeCard === 'banco_preguntas' && (
        <div className="space-y-6">
          {/* 1. PRIMERA SECCIÓN/ZONA: NAVEGACIÓN PRINCIPAL CON DOS BOTONES */}
          <div className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-mono font-bold text-amber-900 uppercase">
                  <Database className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pantalla / Ventana: Banco de preguntas</span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Gestión de Bases de Datos — Banco de preguntas
                </h3>
                <p className="text-xs text-slate-600">
                  Seleccione una opción para crear una nueva base de datos de preguntas o consultar/modificar el listado de bases de datos creadas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveCard('crear_nuevo_curso')}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs self-start lg:self-auto"
              >
                <FolderPlus className="w-4 h-4" />
                <span>
                  Ir a {editingCourseId ? 'Modificar Curso' : 'Crear Nuevo Curso'}
                </span>
              </button>
            </div>

            {/* DOS BOTONES PRINCIPALES DE LA SECCIÓN: "Crear nueva base de datos" y "Ver listado de bases de datos creados" */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleStartNewQuestionBankDatabaseTab}
                className={`min-h-[54px] px-5 py-3.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  qBankWindowTab === 'crear'
                    ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                    : 'border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-amber-950'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Crear nueva base de datos</span>
                {qBankWindowTab === 'crear' && editingQBankDbId && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono">
                    Modo Modificar (Clic para limpiar)
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setQBankWindowTab('listado');
                }}
                className={`min-h-[54px] px-5 py-3.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                  qBankWindowTab === 'listado'
                    ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>
                  Ver listado de bases de datos creados ({questionBankDatabases.length})
                </span>
              </button>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PESTAÑA A: "CREAR NUEVA BASE DE DATOS" (O MODIFICAR BASE SELECCIONADA) */}
          {/* ===================================================================== */}
          {qBankWindowTab === 'crear' && (
            <div className="space-y-6">
              {/* Campo para agregar nombre de base de datos a crear + Botón Guardar base de datos */}
              <form
                onSubmit={handleSaveQuestionBankDatabase}
                className="bg-white border-2 border-amber-300 rounded-2xl p-6 shadow-xs space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-mono font-bold">
                      {editingQBankDbId ? 'MODIFICAR BASE DE DATOS' : 'NUEVA BASE DE DATOS'}
                    </span>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900">
                      {editingQBankDbId
                        ? `Modificando: ${newQBankDbName || 'Base de datos de Banco de preguntas'}`
                        : 'Configuración de la nueva base de datos de Banco de preguntas'}
                    </h4>
                  </div>

                  {editingQBankDbId && (
                    <button
                      type="button"
                      onClick={handleStartNewQuestionBankDatabaseTab}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer"
                    >
                      + Iniciar otra base de datos en blanco
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-6">
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      Nombre de la base de datos a crear <span className="text-red-600">*</span>
                    </label>
                    <input
                      ref={qBankNameInputRef}
                      type="text"
                      required
                      value={newQBankDbName}
                      onChange={(e) => {
                        setNewQBankDbName(e.target.value);
                        if (e.target.value.trim()) setQBankNameError(false);
                      }}
                      placeholder="Obligatorio *: Escriba el nombre de la base de datos (Ej: Banco Marketing Digital Módulos 1 al 5)"
                      className={`w-full px-3.5 py-2.5 rounded-xl border-2 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                        qBankNameError && !newQBankDbName.trim()
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-600'
                          : 'border-amber-300 focus:ring-amber-600'
                      }`}
                    />
                    {qBankNameError && !newQBankDbName.trim() && (
                      <p className="mt-1 text-[11px] font-bold text-red-600">
                        * Campo obligatorio: ingrese el Nombre de la base de datos a crear antes de guardar.
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Código / Identificador (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      value={newQBankDbCode}
                      onChange={(e) => setNewQBankDbCode(e.target.value.toUpperCase())}
                      placeholder="Ej: BCO-MK1 (Automático)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono font-bold uppercase text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-600"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="w-full min-h-[44px] py-2.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      <span>Guardar base de datos</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* SECCIÓN / ZONA: Base de datos de las preguntas/respuestas de todos los módulos cargados — Banco de Preguntas */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <OptionServerSaveBar
                  sectionKey="banco_preguntas"
                  label="Base de datos de las preguntas/respuestas de todos los módulos cargados (Banco de preguntas)"
                  autoSave={Boolean(editingQBankDbId && newQBankDbName.trim())}
                  watchValue={`${courseQuestionsBank.length}:${courseQuestionsBank[0]?.id || ''}:${
                    courseQuestionsBank[courseQuestionsBank.length - 1]?.id || ''
                  }:${courseQuestionsBank[0]?.opciones?.A?.length || 0}`}
                />

                {/* Encabezado Principal de la Sección */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                          Base de datos de las preguntas/respuestas de todos los módulos cargados — Banco de Preguntas ({courseQuestionsBank.length} Reactivos)
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold">
                          {newQBankDbName.trim()
                            ? `Base: ${newQBankDbName.trim()}`
                            : 'Nueva base de datos en edición'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Agregue los reactivos <strong>por pregunta individual</strong> o <strong>por lote (Excel / JSON / CSV)</strong> y luego pulse <strong>«Guardar base de datos»</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Opciones Reorganizadas en 2 Bloques Claros: 1. Agregar Preguntas (Individual o por Lote) y 2. Auditoría / IA / Exportación */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  {/* Bloque 1: Agregar Preguntas (Individual o por Lote) */}
                  <div className="lg:col-span-6 space-y-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      1. Agregar datos de preguntas (Por pregunta o por lote)
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={openNewQuestionModal}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Nueva Pregunta</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBulkQFeedback(null);
                          setBulkQModalOpen(true);
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>+ Agregar por Lote (Pegar / Fusionar)</span>
                      </button>

                      <label className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Subir Archivo Lote (.xlsx / .json / .csv)</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.xlsm,.ods,.json,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json,text/csv"
                          onChange={(e) => handleUploadQuestionFile(e, 'replace')}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setShowQStructureModal(true)}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Estructura de Carga</span>
                      </button>

                      {!confirmRestoreOfficialBank ? (
                        <button
                          type="button"
                          onClick={() => setConfirmRestoreOfficialBank(true)}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Cargar Plantilla Oficial ({INITIAL_QUESTIONS.length})</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-300 rounded-xl px-2.5 py-1">
                          <span className="text-[11px] font-bold text-indigo-900">
                            ¿Cargar {INITIAL_QUESTIONS.length} preg.?
                          </span>
                          <button
                            type="button"
                            onClick={handleRestoreOfficialUnifiedBank}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreOfficialBank(false)}
                            className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bloque 2: Calidad, Calibración IA, Exportación y Limpieza */}
                  <div className="lg:col-span-6 space-y-2 lg:border-l lg:border-slate-200 lg:pl-3">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                      2. Calidad, Calibración IA y Exportación del Banco
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowBankAuditorModal(true)}
                        disabled={courseQuestionsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 disabled:opacity-40 text-teal-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          Validador ({bankQualityAudit.healthyCount}/{bankQualityAudit.totalQuestions} OK)
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={courseQuestionsBank.length === 0 || isEqualizingBankIA}
                        onClick={() => handleEqualizeQuestionBankIA('ai_deep')}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isEqualizingBankIA ? 'animate-spin' : ''}`}
                        />
                        <span>
                          {isEqualizingBankIA ? 'Calibrando IA...' : '🧠 Blindar Opciones IA'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={exportQuestionsExcel}
                        disabled={courseQuestionsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Excel (.xlsx)</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportQuestionsCsv}
                        disabled={courseQuestionsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={exportQuestionsJson}
                        disabled={courseQuestionsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>JSON</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerPrintView('examen_papel_plan_b')}
                        disabled={courseQuestionsBank.length === 0}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 text-amber-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Plan B Papel</span>
                      </button>

                      {effectiveUndoQuestionsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleUndoLastQuestionBatch}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Deshacer ({effectiveUndoQuestionsCount})</span>
                        </button>
                      )}

                      {!confirmClearAllQuestions ? (
                        <button
                          type="button"
                          disabled={courseQuestionsBank.length === 0}
                          onClick={() => setConfirmClearAllQuestions(true)}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 disabled:opacity-40 text-red-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Vaciar Banco</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1">
                          <span className="text-[11px] font-bold text-red-800">
                            ¿Vaciar {courseQuestionsBank.length}?
                          </span>
                          <button
                            type="button"
                            onClick={handleClearAllQuestions}
                            className="px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearAllQuestions(false)}
                            className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {bankActionNotice && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{bankActionNotice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBankActionNotice(null)}
                      className="text-emerald-700 hover:text-emerald-950 font-bold px-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Buscador, Filtro y Paginación */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar pregunta por código, tema o palabra clave..."
                        value={qSearch}
                        onChange={(e) => {
                          setQSearch(e.target.value);
                          setQCurrentPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <span className="font-bold text-slate-900">
                      Total: {courseQuestionsBank.length}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-emerald-800 font-semibold">
                      Mostrando{' '}
                      {filteredQuestions.length === 0
                        ? 0
                        : (safeCurrentPage - 1) * qPageSize + 1}
                      –{Math.min(safeCurrentPage * qPageSize, filteredQuestions.length)} de{' '}
                      {filteredQuestions.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-slate-600 font-medium">Por página:</label>
                    <select
                      value={qPageSize}
                      onChange={(e) => {
                        setQPageSize(Number(e.target.value));
                        setQCurrentPage(1);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-mono font-semibold text-slate-800"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                    </select>

                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        disabled={safeCurrentPage <= 1}
                        onClick={() => setQCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                      >
                        ← Ant.
                      </button>
                      <span className="px-2 py-1 font-mono font-bold text-slate-800">
                        {safeCurrentPage}/{totalQuestionPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeCurrentPage >= totalQuestionPages}
                        onClick={() =>
                          setQCurrentPage((p) => Math.min(totalQuestionPages, p + 1))
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                      >
                        Sig. →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Listado Completo de Tarjetas de Preguntas */}
                {paginatedQuestions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl space-y-1">
                    <div className="text-sm font-bold text-slate-800">
                      El banco está listo para agregar preguntas
                    </div>
                    <p>
                      Escriba arriba el nombre de la base de datos y use <strong>«+ Nueva Pregunta»</strong>, <strong>«+ Agregar por Lote»</strong> o <strong>«Subir Archivo Lote»</strong>. Al finalizar, pulse <strong>«Guardar base de datos»</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {paginatedQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                              {q.id}
                            </span>
                            <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              Módulo {q.modulo}
                            </span>
                            {q.tipoPregunta && (
                              <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-medium">
                                {q.tipoPregunta}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-medium">
                              Nivel: {q.nivel || q.bloom}
                            </span>
                            {q.rap && (
                              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-mono font-semibold">
                                {q.rap}
                              </span>
                            )}
                            <span className="text-slate-500 font-medium">{q.tema}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditQuestionModal(q)}
                              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                savePreviousQuestionsSnapshot(courseQuestionsBank);
                                updateEditorQuestionBank(
                                  courseQuestionsBank.filter((item) => item.id !== q.id)
                                );
                                setBankActionNotice(
                                  `✓ Pregunta ${q.id} eliminada. Puede usar "Deshacer" para restaurarla.`
                                );
                              }}
                              className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Eliminar pregunta"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {q.contexto && q.pregunta && !q.pregunta.includes(q.contexto) ? (
                          <div className="space-y-1">
                            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 leading-relaxed">
                              <strong className="text-slate-900">Contexto:</strong> {q.contexto}
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{q.pregunta}</p>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-slate-900">{q.enunciado}</p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                            const isCorrect = q.correcta === opt;
                            return (
                              <div
                                key={opt}
                                className={`px-3 py-1.5 rounded-lg border flex items-start gap-2 ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}
                              >
                                <span className="font-mono font-bold">{opt})</span>
                                <span className="flex-1">{q.opciones[opt]}</span>
                                {isCorrect && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="text-[11px] text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                          <strong className="text-slate-800">Justificación:</strong>{' '}
                          {q.justificacion}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barra Inferior con Campo Obligatorio Nombre de la base de datos a crear * y Botón: Guardar base de datos */}
                <div className="pt-4 border-t border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4 bg-amber-50/40 p-4 rounded-xl border border-amber-200">
                  <div className="flex-1 space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800">
                      Nombre de la base de datos a crear <span className="text-red-600">*</span>{' '}
                      <span className="font-normal text-slate-600">
                        (Total preguntas agregadas: <strong>{courseQuestionsBank.length}</strong>)
                      </span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newQBankDbName}
                      onChange={(e) => {
                        setNewQBankDbName(e.target.value);
                        if (e.target.value.trim()) setQBankNameError(false);
                      }}
                      placeholder="Obligatorio *: Ingrese el nombre de la base de datos a crear..."
                      className={`w-full px-3.5 py-2.5 rounded-xl border-2 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                        qBankNameError && !newQBankDbName.trim()
                          ? 'border-red-500 ring-2 ring-red-500/20 focus:ring-red-600'
                          : 'border-amber-300 focus:ring-amber-600'
                      }`}
                    />
                    {qBankNameError && !newQBankDbName.trim() && (
                      <p className="text-[11px] font-bold text-red-600">
                        * Es obligatorio ingresar el Nombre de la base de datos a crear antes de guardar.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveQuestionBankDatabase()}
                    className="w-full lg:w-auto min-h-[44px] px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span>Guardar base de datos</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PESTAÑA B: "VER LISTADO DE BASES DE DATOS CREADOS"                    */}
          {/* (CADA BANCO TIENE AL LADO LOS BOTONES: "Ver", "Modificar" y "Eliminar") */}
          {/* ===================================================================== */}
          {qBankWindowTab === 'listado' && (
            <div className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-xs space-y-5">
              {bankActionNotice && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{bankActionNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBankActionNotice(null)}
                    className="text-emerald-800 hover:text-emerald-950 font-bold px-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h4 className="text-base sm:text-lg font-extrabold text-slate-900">
                    Listado de Bases de Datos de «Banco de preguntas» Creados ({questionBankDatabases.length})
                  </h4>
                  <p className="text-xs text-slate-600">
                    Utilice los botones <strong>«Ver»</strong>, <strong>«Modificar»</strong> y <strong>«Eliminar»</strong> al lado de cada banco de datos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartNewQuestionBankDatabaseTab}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear nueva base de datos</span>
                </button>
              </div>

              {questionBankDatabases.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-2">
                  <div className="text-sm font-bold text-slate-800">
                    No hay bases de datos de bancos de preguntas registradas
                  </div>
                  <p className="text-xs text-slate-500">
                    Haga clic en el botón «Crear nueva base de datos» para registrar su primer banco de preguntas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {questionBankDatabases.map((db) => {
                    const isViewing = viewingQBankDbId === db.id;
                    const isSelectedForCourse = selectedQuestionBankDbId === db.id;
                    const modulesSet = new Set(db.questions.map((q) => q.modulo));

                    return (
                      <div
                        key={db.id}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isViewing
                            ? 'border-amber-600 bg-amber-50/30 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-amber-300'
                        }`}
                      >
                        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded bg-amber-900 text-white font-mono text-[11px] font-bold">
                                {db.code}
                              </span>
                              <span className="text-sm font-extrabold text-slate-900">
                                {db.name}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 font-mono text-[11px] font-extrabold">
                                {db.questions.length} Preguntas
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                                {modulesSet.size} Mód.
                              </span>
                              {isSelectedForCourse && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-mono font-bold">
                                  ✓ Asignado al Curso
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {db.description || 'Base de datos de banco de preguntas'} · Actualizado:{' '}
                              {db.updatedAtIso ? db.updatedAtIso.slice(0, 10) : '2026'}
                            </p>
                          </div>

                          {/* BOTONES AL LADO DE CADA BANCO DE DATOS: "Ver", "Modificar" y "Eliminar" */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setViewingQBankDbId((prev) => (prev === db.id ? null : db.id))
                              }
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isViewing
                                  ? 'bg-sky-700 text-white'
                                  : 'border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{isViewing ? 'Ocultar' : 'Ver'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleModifyQuestionBankDatabaseFromList(db)}
                              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Modificar</span>
                            </button>

                            {confirmDeleteQBankDbId === db.id ? (
                              <div className="inline-flex items-center gap-1.5 bg-red-50 border-2 border-red-300 px-2.5 py-1.5 rounded-xl text-xs">
                                <span className="font-bold text-red-900">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestionBankDatabase(db.id)}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteQBankDbId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteQBankDbId(db.id)}
                                className="px-3.5 py-2 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Eliminar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Panel desplegable al pulsar el botón "Ver" */}
                        {isViewing && (
                          <div className="border-t border-amber-200 bg-white p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-amber-950">
                                Vista de Preguntas en «{db.name}» ({db.questions.length} reactivos)
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectQuestionBankDatabaseForCourse(db)}
                                  className="px-3 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold cursor-pointer"
                                >
                                  ✓ Seleccionar este banco para el curso
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleModifyQuestionBankDatabaseFromList(db)}
                                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                                >
                                  Ir a Modificar esta base de datos
                                </button>
                              </div>
                            </div>

                            {db.questions.length === 0 ? (
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                                Esta base de datos de banco de preguntas está vacía (0 reactivos).
                              </div>
                            ) : (
                              <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                                {db.questions.slice(0, 50).map((q) => (
                                  <div
                                    key={q.id}
                                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                                          {q.id}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-mono text-[10px] font-bold">
                                          Módulo {q.modulo}
                                        </span>
                                        <span className="text-slate-600 font-semibold">
                                          {q.tema}
                                        </span>
                                      </div>
                                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold">
                                        Correcta: {q.correcta}
                                      </span>
                                    </div>
                                    <p className="font-semibold text-slate-900">{q.enunciado}</p>
                                  </div>
                                ))}
                                {db.questions.length > 50 && (
                                  <div className="text-center text-[11px] text-slate-500 py-2">
                                    Mostrando las primeras 50 de {db.questions.length} preguntas. Pulse «Modificar» para gestionar la totalidad del banco.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
          </div>
        </div>
      </div>

      {/* DOCK INFERIOR TÁCTIL PARA MÓVIL / TABLET EN EL PANEL DEL EDITOR (EN EL MISMO ORDEN CLARO 1-2-3-4-5) */}
      <nav
        aria-label="Dock inferior táctil del Panel del Editor"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg overflow-x-auto"
      >
        <div className="grid grid-cols-6 gap-1 min-w-[340px] max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveCard(null)}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === null
                ? 'bg-[#25579e] text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="text-[10px]">Inicio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCard('seguridad_clave')}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === 'seguridad_clave'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <Key className="w-4 h-4" />
            <span className="text-[10px]">1. Seguridad</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCard('docentes_activos')}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === 'docentes_activos'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="text-[10px]">2. Docentes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCard('cursos_activos')}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === 'cursos_activos' || activeCard === 'crear_nuevo_curso'
                ? 'bg-sky-600 text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px]">3. Cursos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCard('nominas_estudiantes')}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === 'nominas_estudiantes'
                ? 'bg-teal-600 text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span className="text-[10px]">4. Nóminas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCard('banco_preguntas')}
            className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 cursor-pointer ${
              activeCard === 'banco_preguntas'
                ? 'bg-amber-600 text-white font-bold'
                : 'text-slate-600 font-semibold'
            }`}
          >
            <Database className="w-4 h-4" />
            <span className="text-[10px]">5. Preguntas</span>
          </button>
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* MODALES DEL BANCO DE PREGUNTAS EN EL PANEL DEL EDITOR                     */}
      {/* ========================================================================= */}

      {/* MODAL 1: NUEVA / EDITAR PREGUNTA INDIVIDUAL */}
      {qModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingQuestion ? `Modificar Pregunta ${editingQuestion.id}` : 'Nueva Pregunta'}
              </h3>
              <button
                type="button"
                onClick={() => setQModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">ID / Código</label>
                  <input
                    type="text"
                    required
                    value={qFormId}
                    onChange={(e) => setQFormId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Módulo</label>
                  <select
                    value={qFormModulo}
                    onChange={(e) => {
                      const selMod = Number(e.target.value);
                      setQFormModulo(selMod);
                      const modObj = courseModules.find((cm) => Number(cm.id) === selMod);
                      if (!editingQuestion) {
                        const nextNum = courseQuestionsBank.length + 1;
                        setQFormId(`M${selMod}-NEW-${String(nextNum).padStart(2, '0')}`);
                        if (modObj?.shortTitle) {
                          setQFormTema(modObj.shortTitle);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                  >
                    {(courseModules.length >= 5
                      ? courseModules
                      : [1, 2, 3, 4, 5].map((num) => {
                          const existing = courseModules.find((cm) => Number(cm.id) === num);
                          return (
                            existing || {
                              id: num,
                              shortTitle: `Módulo ${num}`
                            }
                          );
                        })
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        Módulo {m.id}: {m.shortTitle || `Módulo ${m.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nivel Cognitivo Bloom
                  </label>
                  <select
                    value={qFormBloom}
                    onChange={(e) => setQFormBloom(e.target.value as BloomLevel)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Conocer">Conocer</option>
                    <option value="Comprensión">Comprensión</option>
                    <option value="Aplicación">Aplicación</option>
                    <option value="Análisis">Análisis</option>
                    <option value="Evaluación">Evaluación</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tema / Subtema Curricular
                </label>
                <input
                  type="text"
                  required
                  value={qFormTema}
                  onChange={(e) => setQFormTema(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Enunciado Contextualizado
                </label>
                <textarea
                  rows={3}
                  required
                  value={qFormEnunciado}
                  onChange={(e) => setQFormEnunciado(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opción A</label>
                  <input
                    type="text"
                    required
                    value={qFormA}
                    onChange={(e) => setQFormA(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opción B</label>
                  <input
                    type="text"
                    required
                    value={qFormB}
                    onChange={(e) => setQFormB(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opción C</label>
                  <input
                    type="text"
                    required
                    value={qFormC}
                    onChange={(e) => setQFormC(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Opción D</label>
                  <input
                    type="text"
                    required
                    value={qFormD}
                    onChange={(e) => setQFormD(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Respuesta Correcta
                  </label>
                  <select
                    value={qFormCorrecta}
                    onChange={(e) =>
                      setQFormCorrecta(e.target.value as 'A' | 'B' | 'C' | 'D')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono font-bold"
                  >
                    <option value="A">Opción A</option>
                    <option value="B">Opción B</option>
                    <option value="C">Opción C</option>
                    <option value="D">Opción D</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Justificación Pedagógica (Retroalimentación)
                  </label>
                  <input
                    type="text"
                    required
                    value={qFormJustificacion}
                    onChange={(e) => setQFormJustificacion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                >
                  Guardar Pregunta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CARGA / ACTUALIZACIÓN POR LOTE DE PREGUNTAS */}
      {bulkQModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Agregar o Actualizar Lote Masivo de Preguntas
                </h3>
                <p className="text-xs text-slate-600">
                  Importe preguntas desde archivo JSON/CSV o pegue directamente desde Excel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkQModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                    bulkQMode === 'merge'
                      ? 'border-sky-600 bg-sky-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="bulkQMode"
                    checked={bulkQMode === 'merge'}
                    onChange={() => setBulkQMode('merge')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold text-slate-900">
                      Modo Fusionar / Actualizar (Recomendado)
                    </div>
                    <p className="text-slate-600 mt-0.5">
                      Actualiza las preguntas cuyo ID ya exista y agrega las nuevas sin borrar el
                      resto del banco.
                    </p>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 ${
                    bulkQMode === 'replace'
                      ? 'border-amber-600 bg-amber-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="bulkQMode"
                    checked={bulkQMode === 'replace'}
                    onChange={() => setBulkQMode('replace')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold text-slate-900">
                      Modo Reemplazar Todo el Banco
                    </div>
                    <p className="text-slate-600 mt-0.5">
                      Sustituye la totalidad del banco actual únicamente por las preguntas
                      cargadas en este lote.
                    </p>
                  </div>
                </label>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-emerald-950">
                    Opción 1: Subir Archivo Directo Excel (.xlsx / .xls), JSON o CSV
                  </div>
                  <div className="text-emerald-800">
                    Seleccione un archivo desde su computador para procesarlo automáticamente:
                  </div>
                </div>
                <label className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                  <Upload className="w-4 h-4" />
                  <span>Seleccionar Archivo (.xlsx / .json / .csv)</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.ods,.json,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json,text/csv"
                    onChange={(e) => handleUploadQuestionFile(e)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    Opción 2: Pegar Lote en Formato JSON o Tabla CSV / Excel (Separado por
                    Tabulador, Punto y coma o Coma)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQStructureModal(true)}
                    className="text-sky-700 font-semibold hover:underline cursor-pointer"
                  >
                    Ver estructura de columnas →
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={bulkQText}
                  onChange={(e) => setBulkQText(e.target.value)}
                  placeholder={`Ejemplo CSV / Excel:\nID;Modulo;Bloom;Tema;Enunciado;OpcionA;OpcionB;OpcionC;OpcionD;Correcta;Justificacion\nM1-901;1;Aplicación;P2P en La Dorada;Un caficultor vende directo a tiendas;B2B;B2C;C2C;B2G;A;Porque vende entre empresas.`}
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              {bulkQFeedback && (
                <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-sky-950 font-semibold">
                  {bulkQFeedback}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBulkQModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleBulkImportQuestions}
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                >
                  Procesar y Guardar Lote de Preguntas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ESTRUCTURA DE CARGA DE PREGUNTAS */}
      {showQStructureModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Estructura Oficial para Cargar o Actualizar Preguntas en Lote
                </h3>
                <p className="text-xs text-slate-600">
                  Puede importar sus reactivos usando cualquiera de estos dos formatos estándar
                  (Excel/CSV o JSON).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQStructureModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">
                  1. Estructura en Tabla Excel / CSV (11 Columnas en Orden)
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const sampleCsv = `ID_Pregunta;Modulo;Nivel_Bloom;Tema;Enunciado;Opcion_A;Opcion_B;Opcion_C;Opcion_D;Respuesta_Correcta;Justificacion_Pedagogica\nM1-801;1;Aplicación;Ecosistema P2P en La Dorada;Un comerciante de La Dorada distribuye insumos al por mayor a panaderías locales. ¿Qué modelo aplica?;B2B (Business to Business);B2C (Business to Consumer);C2C (Consumer to Consumer);B2G (Business to Government);A;Es una transacción comercial entre negocios.`;
                    navigator.clipboard.writeText(sampleCsv);
                    setCopiedQTemplate('csv');
                    setTimeout(() => setCopiedQTemplate(null), 2500);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedQTemplate === 'csv' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedQTemplate === 'csv'
                      ? 'Plantilla CSV Copiada'
                      : 'Copiar Plantilla CSV'}
                  </span>
                </button>
              </div>
              <p className="text-slate-600">
                Acepta columnas separadas por <strong>punto y coma (;)</strong>,{' '}
                <strong>coma (,)</strong> o <strong>tabulación directa desde Excel</strong>:
              </p>
              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono overflow-x-auto text-[11px] leading-relaxed">
{`ID_Pregunta ; Modulo ; Nivel_Bloom ; Tema ; Enunciado ; Opcion_A ; Opcion_B ; Opcion_C ; Opcion_D ; Respuesta_Correcta ; Justificacion_Pedagogica
M1-801 ; 1 ; Aplicación ; Ecosistema P2P ; Enunciado de la pregunta... ; Texto A ; Texto B ; Texto C ; Texto D ; A ; Explicación pedagógica...`}
              </pre>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">
                  2. Estructura en Formato JSON
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const sampleJson = JSON.stringify(
                      [
                        {
                          id: 'M1-801',
                          modulo: 1,
                          bloom: 'Aplicación',
                          tema: 'Ecosistema P2P en La Dorada',
                          enunciado:
                            'Un comerciante de La Dorada distribuye insumos al por mayor a panaderías locales. ¿Qué modelo aplica?',
                          opciones: {
                            A: 'B2B (Business to Business)',
                            B: 'B2C (Business to Consumer)',
                            C: 'C2C (Consumer to Consumer)',
                            D: 'B2G (Business to Government)'
                          },
                          correcta: 'A',
                          justificacion: 'Es una transacción comercial entre negocios.'
                        }
                      ],
                      null,
                      2
                    );
                    navigator.clipboard.writeText(sampleJson);
                    setCopiedQTemplate('json');
                    setTimeout(() => setCopiedQTemplate(null), 2500);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedQTemplate === 'json' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedQTemplate === 'json'
                      ? 'Plantilla JSON Copiada'
                      : 'Copiar Plantilla JSON'}
                  </span>
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono overflow-x-auto text-[11px] leading-relaxed">
{`[
  {
    "id": "M1-801",
    "modulo": 1,
    "bloom": "Aplicación",
    "tema": "Ecosistema P2P en La Dorada",
    "enunciado": "Texto completo de la pregunta...",
    "opciones": {
      "A": "Texto opción A",
      "B": "Texto opción B",
      "C": "Texto opción C",
      "D": "Texto opción D"
    },
    "correcta": "A",
    "justificacion": "Explicación pedagógica de la respuesta..."
  }
]`}
              </pre>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 space-y-1">
              <div className="font-bold text-slate-900">Valores permitidos por campo:</div>
              <div>
                • <strong>Modulo:</strong> Número entero (1, 2, 3, 4, 5...).
              </div>
              <div>
                • <strong>Nivel_Bloom:</strong> <code>Conocer</code>, <code>Comprensión</code>,{' '}
                <code>Aplicación</code>, <code>Análisis</code> o <code>Evaluación</code>.
              </div>
              <div>
                • <strong>Respuesta_Correcta:</strong> Letra en mayúscula <code>A</code>,{' '}
                <code>B</code>, <code>C</code> o <code>D</code>.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowQStructureModal(false)}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: AUDITOR DE CALIDAD DEL BANCO DE PREGUNTAS */}
      {showBankAuditorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Auditoría Automática de Reactivos</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Validador de Calidad del Banco de Preguntas ({bankQualityAudit.totalQuestions}{' '}
                  Reactivos)
                </h3>
                <p className="text-slate-600">
                  Inspección automática de enunciados duplicados, códigos repetidos, opciones
                  vacías y sesgos de longitud en respuestas correctas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBankAuditorModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Total Auditados</div>
                <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                  {bankQualityAudit.totalQuestions}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-emerald-800">Ítems Sin Observaciones</div>
                <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
                  {bankQualityAudit.healthyCount}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                <div className="text-red-800">Enunciados / IDs Duplicados</div>
                <div className="text-xl font-bold font-mono text-red-700 mt-0.5">
                  {bankQualityAudit.highSeverityCount}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-amber-900">Alertas de Estructura / Sesgo</div>
                <div className="text-xl font-bold font-mono text-amber-800 mt-0.5">
                  {bankQualityAudit.issuesCount - bankQualityAudit.highSeverityCount}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-indigo-950 text-sm">
                  🧠 Blindaje Psicométrico con IA: Opciones de Igual Extensión + Cascarita
                  Académica
                </div>
                <p className="text-indigo-900 text-xs">
                  Reescribe y calibra automáticamente los distractores cortos de las{' '}
                  {courseQuestionsBank.length} preguntas para que las 4 opciones (A, B, C y D)
                  tengan longitud equivalente, mini-explicación técnica y trampas conceptuales
                  plausibles.
                </p>
              </div>
              <button
                type="button"
                disabled={isEqualizingBankIA}
                onClick={() => handleEqualizeQuestionBankIA('ai_deep')}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0 shadow-xs"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isEqualizingBankIA ? 'animate-spin' : ''}`}
                />
                <span>
                  {isEqualizingBankIA
                    ? 'Aplicando IA...'
                    : 'Blindar y Ecualizar Todo el Banco Ahora'}
                </span>
              </button>
            </div>

            {bankQualityAudit.issues.length === 0 ? (
              <div className="p-8 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div className="text-sm font-bold text-emerald-950">
                  ¡Banco de Preguntas 100% Calibrado y Libre de Duplicados!
                </div>
                <p className="text-emerald-800">
                  Todos los reactivos cuentan con sus 4 opciones completas, sin códigos repetidos
                  ni sesgos críticos de longitud.
                </p>
              </div>
            ) : (
              <div className="w-full border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Módulo</th>
                      <th className="py-2.5 px-3">Severidad</th>
                      <th className="py-2.5 px-3">Categoría</th>
                      <th className="py-2.5 px-3">Detalle del Hallazgo</th>
                      <th className="py-2.5 px-3 text-right">Acción Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bankQualityAudit.issues.map((iss, idx) => {
                      const targetQ = courseQuestionsBank.find((q) => q.id === iss.questionId);
                      return (
                        <tr key={`${iss.questionId}-${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {iss.questionId}
                          </td>
                          <td className="py-2 px-3 font-mono">M{iss.modulo}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                iss.severity === 'ALTA'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {iss.severity}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {iss.category}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{iss.detail}</td>
                          <td className="py-2 px-3 text-right">
                            {targetQ && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowBankAuditorModal(false);
                                  openEditQuestionModal(targetQ);
                                }}
                                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold cursor-pointer"
                              >
                                Corregir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBankAuditorModal(false)}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer"
              >
                Cerrar Auditor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: PREVISUALIZACIÓN EN VIVO DEL CURSO (VISTA ESTUDIANTE / VISTA DOCENTE) */}
      {showLivePreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[11px] font-bold">
                  👁️ Simulador Interactivo Pre-Publicación
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-1">
                  Previsualización en Vivo: «{courseName || 'Nuevo Curso'} (
                  {courseCode || 'SIN-COD'})»
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLivePreviewRole('student')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold cursor-pointer ${
                    livePreviewRole === 'student'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🎓 Vista Portal Estudiante
                </button>
                <button
                  type="button"
                  onClick={() => setLivePreviewRole('teacher')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold cursor-pointer ${
                    livePreviewRole === 'teacher'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  👨‍🏫 Vista Panel Docente
                </button>
                <button
                  type="button"
                  onClick={() => setShowLivePreviewModal(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {livePreviewRole === 'student' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono font-bold text-indigo-800 uppercase">
                      Portal del Estudiante · {courseSubjectName || 'Asignatura'} · Sede{' '}
                      {courseSede || 'Principal'}
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      Ruta de Aprendizaje del Curso ({courseModules.length} Módulo
                      {courseModules.length === 1 ? '' : 's'})
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-white border border-indigo-200 font-mono font-bold text-indigo-900">
                    Docente: {assignedTeacherName || assignedTeacherAccount || 'Por asignar'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {courseModules.map((m, i) => {
                    const modQCount = courseQuestionsBank.filter(
                      (q) => Number(q.modulo) === Number(m.id || i + 1)
                    ).length;
                    const topics = (m.temasModulo || []).filter((t) => t.trim());
                    return (
                      <div
                        key={m.id || i}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold">
                            Módulo {m.id || i + 1}
                          </span>
                          <span className="text-[11px] font-mono text-slate-600">
                            ⏱ {m.horasModulo || '—'} horas · Peso Global:{' '}
                            {m.ponderacionGlobalModuloPct || 0}%
                          </span>
                        </div>
                        <div className="text-sm font-extrabold text-slate-900">
                          {m.shortTitle || `Módulo ${m.id || i + 1}`}
                        </div>
                        {topics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {topics.map((t, tidx) => (
                              <span
                                key={tidx}
                                className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700"
                              >
                                • {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-[11px]">
                          <div className="p-2 rounded-lg bg-white border border-slate-200">
                            <div className="text-slate-500">Asistencia</div>
                            <div className="font-bold text-slate-800">
                              {m.asistenciaBloqueA ? 'B1 ' : ''}
                              {m.asistenciaBloqueB ? 'B2' : ''}
                              {!m.asistenciaBloqueA && !m.asistenciaBloqueB ? 'N/A' : ''}
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-white border border-slate-200">
                            <div className="text-slate-500">Exámenes</div>
                            <div className="font-bold text-indigo-700">
                              {m.examenesCount || 0} ({m.preguntasExamenModuloCount || 0} preg.)
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-white border border-slate-200">
                            <div className="text-slate-500">Mini Retos</div>
                            <div className="font-bold text-amber-700">
                              {m.retosCount || 0} ({modQCount} en BD)
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {enableFinalIntegralExam && (
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-purple-950">
                        🏆 Examen Integral Final Habilitado
                      </div>
                      <div className="text-purple-800">
                        Integra reactivos de los {courseModules.length} módulos configurados en el
                        curso.
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-purple-700 text-white font-mono font-bold">
                      Activo
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono font-bold text-emerald-800 uppercase">
                      Panel del Docente · Sincronización Automática con Editor
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      Credenciales Asignadas: Usuario «{assignedTeacherAccount || '—'}» | Clave «
                      {assignedTeacherPass || '—'}»
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-white border border-emerald-200 font-mono font-bold text-emerald-900">
                    Banco Sincronizado: {courseQuestionsBank.length} Preguntas
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="py-2 px-3">Módulo / Clase</th>
                        <th className="py-2 px-3">Comport.</th>
                        <th className="py-2 px-3">Particip. (Retos)</th>
                        <th className="py-2 px-3">Examen</th>
                        <th className="py-2 px-3">Trabajo Práct.</th>
                        <th className="py-2 px-3">Suma Interna</th>
                        <th className="py-2 px-3">Reactivos BD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {courseModules.map((m, idx) => {
                        const p = m.ponderacion || {
                          comportamientoPct: 0,
                          participacionPct: 0,
                          examenPct: 0,
                          trabajoPct: 0
                        };
                        const sum =
                          (Number(p.comportamientoPct) || 0) +
                          (Number(p.participacionPct) || 0) +
                          (Number(p.examenPct) || 0) +
                          (Number(p.trabajoPct) || 0);
                        const qCount = courseQuestionsBank.filter(
                          (q) => Number(q.modulo) === Number(m.id || idx + 1)
                        ).length;
                        return (
                          <tr key={m.id || idx}>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              M{m.id || idx + 1}: {m.shortTitle || `Módulo ${idx + 1}`}
                            </td>
                            <td className="py-2 px-3 font-mono">{p.comportamientoPct || 0}%</td>
                            <td className="py-2 px-3 font-mono">{p.participacionPct || 0}%</td>
                            <td className="py-2 px-3 font-mono">{p.examenPct || 0}%</td>
                            <td className="py-2 px-3 font-mono">{p.trabajoPct || 0}%</td>
                            <td className="py-2 px-3 font-mono font-bold">
                              <span
                                className={
                                  sum === 100 ? 'text-emerald-700' : 'text-amber-700'
                                }
                              >
                                {sum}%
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                              {qCount} preg.
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowLivePreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold cursor-pointer"
              >
                Cerrar Simulador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CLONACIÓN SELECTIVA DE MÓDULOS O PREGUNTAS ENTRE CURSOS */}
      {showSelectiveCloneModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  📥 Clonación Selectiva de Módulos y Preguntas entre Cursos
                </h3>
                <p className="text-slate-600">
                  Seleccione un curso origen del catálogo para importar únicamente los módulos o
                  preguntas que necesite en el curso actual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSelectiveCloneModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  1. Curso Origen en el Catálogo:
                </label>
                <select
                  value={cloneSourceCourseId}
                  onChange={(e) => {
                    setCloneSourceCourseId(e.target.value);
                    setSelectedCloneModuleIds([]);
                    setSelectedCloneQuestionIds([]);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                >
                  <option value="">-- Seleccione un curso --</option>
                  {catalog.map((c) => (
                    <option key={c.meta.courseId} value={c.meta.courseId}>
                      {c.meta.nombreCurso} ({c.meta.codigoCurso}) —{' '}
                      {(c.questions || []).length} preg.
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  2. Módulo Destino para las Preguntas Clonadas:
                </label>
                <select
                  value={cloneTargetModuleNum}
                  onChange={(e) => setCloneTargetModuleNum(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                >
                  {courseModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      Asignar al Módulo {m.id}: {m.shortTitle || `Módulo ${m.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const sourceWs = catalog.find((c) => c.meta.courseId === cloneSourceCourseId);
              if (!sourceWs) {
                return (
                  <div className="p-6 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
                    Seleccione un curso del catálogo para explorar sus módulos y preguntas.
                  </div>
                );
              }
              const srcMods = sourceWs.meta.modulosCurso || [];
              const srcQuestions = sourceWs.questions || [];

              return (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-slate-900">
                      A. Módulos disponibles en «{sourceWs.meta.nombreCurso}» ({srcMods.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {srcMods.map((sm) => {
                        const checked = selectedCloneModuleIds.includes(sm.id);
                        return (
                          <label
                            key={sm.id}
                            className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer ${
                              checked
                                ? 'border-purple-600 bg-purple-50/60 font-bold'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCloneModuleIds((p) => [...p, sm.id]);
                                } else {
                                  setSelectedCloneModuleIds((p) =>
                                    p.filter((id) => id !== sm.id)
                                  );
                                }
                              }}
                            />
                            <span>
                              M{sm.id}: {sm.shortTitle || sm.fullTitle} ({sm.horasModulo || '0'}h)
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        B. Preguntas disponibles ({srcQuestions.length}) — Seleccionadas:{' '}
                        {selectedCloneQuestionIds.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCloneQuestionIds(srcQuestions.map((q) => q.id))
                          }
                          className="text-sky-700 font-bold hover:underline cursor-pointer"
                        >
                          Seleccionar todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCloneQuestionIds([])}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {srcQuestions.map((sq) => {
                        const checked = selectedCloneQuestionIds.includes(sq.id);
                        return (
                          <label
                            key={sq.id}
                            className={`p-2 rounded-lg border flex items-start gap-2 cursor-pointer ${
                              checked
                                ? 'border-sky-600 bg-sky-50/60'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCloneQuestionIds((p) => [...p, sq.id]);
                                } else {
                                  setSelectedCloneQuestionIds((p) =>
                                    p.filter((id) => id !== sq.id)
                                  );
                                }
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1">
                              <span className="font-mono font-bold text-slate-900">
                                [{sq.id} · M{sq.modulo}]
                              </span>{' '}
                              <span className="text-slate-700">{sq.enunciado}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowSelectiveCloneModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        let clonedModsCount = 0;
                        let clonedQsCount = 0;
                        if (selectedCloneModuleIds.length > 0) {
                          const toAddMods = srcMods.filter((m) =>
                            selectedCloneModuleIds.includes(m.id)
                          );
                          if (toAddMods.length > 0) {
                            setCourseModules((prev) => {
                              const combined = [...prev, ...toAddMods];
                              return combined.map((cm, idx) => ({
                                ...cm,
                                id: idx + 1,
                                code: `M${idx + 1}`
                              }));
                            });
                            clonedModsCount = toAddMods.length;
                          }
                        }
                        if (selectedCloneQuestionIds.length > 0) {
                          const toAddQs = srcQuestions
                            .filter((q) => selectedCloneQuestionIds.includes(q.id))
                            .map((q, idx) => ({
                              ...q,
                              id: `M${cloneTargetModuleNum}-CLON-${Date.now()
                                .toString(36)
                                .slice(-3)
                                .toUpperCase()}-${idx + 1}`,
                              modulo: (cloneTargetModuleNum as 1 | 2 | 3 | 4 | 5) || 1
                            }));
                          if (toAddQs.length > 0) {
                            savePreviousQuestionsSnapshot(courseQuestionsBank);
                            updateEditorQuestionBank([...toAddQs, ...courseQuestionsBank]);
                            clonedQsCount = toAddQs.length;
                          }
                        }
                        setShowSelectiveCloneModal(false);
                        showEditorNotice(
                          `✓ Clonación selectiva completada: +${clonedModsCount} módulo(s) y +${clonedQsCount} pregunta(s) importadas.`
                        );
                      }}
                      className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer"
                    >
                      Importar Selección al Curso Actual
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 7: HISTORIAL DE VERSIONES E INSTANTÁNEAS DEL CURSO (SNAPSHOTS) */}
      {showSnapshotsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  🕒 Historial de Versiones del Curso (Snapshots)
                </h3>
                <p className="text-slate-600">
                  Puntos de restauración automáticos y manuales para revertir cambios estructurales
                  con un solo clic.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSnapshotsModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-xl p-3">
              <span className="font-bold text-amber-950">
                ¿Desea guardar una instantánea del estado actual antes de hacer cambios?
              </span>
              <button
                type="button"
                onClick={() => handleSaveCourseSnapshot()}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
              >
                📸 Guardar Instantánea Ahora
              </button>
            </div>

            {courseSnapshots.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
                Aún no hay puntos de restauración guardados. Se crean automáticamente al guardar un
                curso o pulsando «Guardar Instantánea Ahora».
              </div>
            ) : (
              <div className="space-y-2.5">
                {courseSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900">{snap.label}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Fecha: {new Date(snap.timestampIso).toLocaleString('es-CO')} · Docente:{' '}
                        {snap.meta.docenteAsignadoId || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreCourseSnapshot(snap.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shrink-0"
                    >
                      Revertir a esta versión
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSnapshotsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL E1: AGREGAR O EDITAR ESTUDIANTE INDIVIDUAL EN EL CURSO (EXCLUSIVO EDITOR) */}
      {edStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {edEditingStudent
                  ? 'Editar Estudiante Asignado al Curso'
                  : 'Asignar Nuevo Estudiante al Curso'}
              </h3>
              <button
                type="button"
                onClick={() => setEdStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEdSaveStudent} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-800">
                  ID del Estudiante (Documento de Identidad)
                </label>
                <input
                  type="text"
                  required
                  value={edFormStudentId}
                  onChange={(e) => setEdFormStudentId(e.target.value)}
                  placeholder="Ej: 1054560101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-800">
                  Nombre Completo del Estudiante
                </label>
                <input
                  type="text"
                  required
                  value={edFormStudentName}
                  onChange={(e) => setEdFormStudentName(e.target.value)}
                  placeholder="Ej: María Fernanda Gómez Rojas"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-800">
                    Correo Electrónico (Opcional)
                  </label>
                  <input
                    type="email"
                    value={edFormStudentCorreo}
                    onChange={(e) => setEdFormStudentCorreo(e.target.value)}
                    placeholder="alumno@correo.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-800">
                    WhatsApp / Celular (Opcional)
                  </label>
                  <input
                    type="tel"
                    value={edFormStudentWhatsapp}
                    onChange={(e) => setEdFormStudentWhatsapp(e.target.value)}
                    placeholder="3001234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800">
                    Código de Acceso (12 Caracteres)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (edFormStudentId && edFormStudentName) {
                        setEdFormStudentCode(
                          generateDeterministicAccessCode(edFormStudentId)
                        );
                      }
                    }}
                    className="text-sky-700 font-bold hover:underline cursor-pointer"
                  >
                    Autogenerar Determinístico
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={24}
                  value={edFormStudentCode}
                  onChange={(e) => setEdFormStudentCode(e.target.value.toUpperCase())}
                  placeholder="Se genera automáticamente si lo deja en blanco"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEdStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer"
                >
                  Guardar Estudiante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL E2: CARGA MASIVA DE ESTUDIANTES EN EL CURSO (EXCEL / CSV / PEGAR) */}
      {edBulkStudentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  📥 Carga Masiva de Estudiantes para el Curso (Excel .xlsx / CSV / Copiar y Pegar)
                </h3>
                <p className="text-slate-600">
                  Suba directamente su archivo Excel o pegue la lista de alumnos con Documento ID, Nombre, Correo y WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEdBulkStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="font-bold text-slate-800">Modo de Integración:</span>
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                <input
                  type="radio"
                  name="edBulkStudentsMode"
                  checked={edBulkStudentsMode === 'merge'}
                  onChange={() => setEdBulkStudentsMode('merge')}
                />
                <span>Fusionar / Agregar a la lista actual ({courseStudentsBank.length})</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer text-amber-900">
                <input
                  type="radio"
                  name="edBulkStudentsMode"
                  checked={edBulkStudentsMode === 'replace'}
                  onChange={() => setEdBulkStudentsMode('replace')}
                />
                <span>Reemplazar toda la lista del curso</span>
              </label>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-emerald-950">
                  Opción 1: Subir Archivo Excel (.xlsx, .xls) o CSV
                </div>
                <div className="text-emerald-800 text-[11px]">
                  Detecta automáticamente las columnas de Documento, Nombre, Correo, WhatsApp y Código.
                </div>
              </div>
              <label className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Seleccionar Archivo Excel / CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={(e) => handleEdUploadStudentExcelFile(e)}
                  className="hidden"
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-800">
                Opción 2: Copiar y Pegar desde Excel / Hoja de Cálculo
              </div>
              <textarea
                rows={7}
                value={edBulkStudentsText}
                onChange={(e) => setEdBulkStudentsText(e.target.value)}
                placeholder={
                  '1054560101\tMaría Fernanda Gómez Rojas\tmaria@correo.com\t3001112233\n1054560102\tJuan Sebastián Morales Díaz\tjuan@correo.com\t3102223344'
                }
                className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            {edBulkImportStatus && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-300 text-sky-950 font-semibold">
                {edBulkImportStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEdBulkStudentModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleEdBulkImportStudents}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer"
              >
                Procesar Filas Pegadas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL E3: EDICIÓN EN LOTE DE CÓDIGOS DE ACCESO EN EL CURSO (EXCLUSIVO EDITOR) */}
      {edBatchAccessCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  🔑 Editor Masivo de Códigos de Acceso de Estudiantes del Curso
                </h3>
                <p className="text-slate-600">
                  Genere o personalice los códigos de acceso para todos los estudiantes o los seleccionados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEdBatchAccessCodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border flex items-start gap-2 cursor-pointer ${
                  edBatchAccessCodeMode === 'regenerate_deterministic'
                    ? 'border-indigo-600 bg-indigo-50/70 font-bold'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  checked={edBatchAccessCodeMode === 'regenerate_deterministic'}
                  onChange={() => setEdBatchAccessCodeMode('regenerate_deterministic')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-slate-900">1. Regenerar Determinísticos (12 Car.)</div>
                  <div className="text-[11px] font-normal text-slate-600">
                    Formato oficial único por estudiante basado en ID y Nombre.
                  </div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-start gap-2 cursor-pointer ${
                  edBatchAccessCodeMode === 'custom_prefix_id4'
                    ? 'border-indigo-600 bg-indigo-50/70 font-bold'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  checked={edBatchAccessCodeMode === 'custom_prefix_id4'}
                  onChange={() => setEdBatchAccessCodeMode('custom_prefix_id4')}
                  className="mt-0.5"
                />
                <div className="space-y-1 flex-1">
                  <div className="text-slate-900">2. Prefijo del Curso + Últimos 4 Dígitos</div>
                  <input
                    type="text"
                    maxLength={8}
                    value={edBatchAccessCodePrefix}
                    onChange={(e) => setEdBatchAccessCodePrefix(e.target.value.toUpperCase())}
                    placeholder="Prefijo (ej. MM26)"
                    className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono uppercase text-xs"
                  />
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-start gap-2 cursor-pointer ${
                  edBatchAccessCodeMode === 'same_shared_code'
                    ? 'border-indigo-600 bg-indigo-50/70 font-bold'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  checked={edBatchAccessCodeMode === 'same_shared_code'}
                  onChange={() => setEdBatchAccessCodeMode('same_shared_code')}
                  className="mt-0.5"
                />
                <div className="space-y-1 flex-1">
                  <div className="text-slate-900">3. Código Grupal Único Compartido</div>
                  <input
                    type="text"
                    maxLength={20}
                    value={edBatchSharedAccessCode}
                    onChange={(e) => setEdBatchSharedAccessCode(e.target.value.toUpperCase())}
                    placeholder="Ej: AULA2026"
                    className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono uppercase text-xs"
                  />
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-start gap-2 cursor-pointer ${
                  edBatchAccessCodeMode === 'individual_list'
                    ? 'border-indigo-600 bg-indigo-50/70 font-bold'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  checked={edBatchAccessCodeMode === 'individual_list'}
                  onChange={() => setEdBatchAccessCodeMode('individual_list')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-slate-900">4. Edición Manual Lista Completa</div>
                  <div className="text-[11px] font-normal text-slate-600">
                    Edite uno por uno todos los códigos en la tabla inferior.
                  </div>
                </div>
              </label>
            </div>

            {edBatchAccessCodeMode === 'individual_list' && (
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
                {courseStudentsBank.map((st) => (
                  <div key={st.id} className="p-2 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-mono font-bold text-slate-800">{st.id}</span> ·{' '}
                      <span>{st.nombre}</span>
                    </div>
                    <input
                      type="text"
                      maxLength={24}
                      value={edBatchIndividualCodesMap[st.id] ?? st.codigoAcceso}
                      onChange={(e) =>
                        setEdBatchIndividualCodesMap((prev) => ({
                          ...prev,
                          [st.id]: e.target.value.toUpperCase()
                        }))
                      }
                      className="w-36 px-2 py-1 rounded border border-slate-300 font-mono font-bold uppercase text-sky-900"
                    />
                  </div>
                ))}
              </div>
            )}

            {edBatchAccessCodeNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold">
                {edBatchAccessCodeNotice}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEdBatchAccessCodeModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleEdApplyBatchAccessCodes}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
              >
                Aplicar Códigos de Acceso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY DE IMPRESIÓN: PLAN B — EXAMEN EN PAPEL (FILAS A, B y C + CLAVE DOCENTE) */}
      {printViewMode === 'examen_papel_plan_b' && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-6 sm:p-10 text-slate-900">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 p-4 rounded-xl">
              <div>
                <div className="text-sm font-bold text-indigo-950">
                  Cuadernillo de Contingencia Impreso — Plan B por Corte Eléctrico Total (Filas A,
                  B y C)
                </div>
                <p className="text-xs text-indigo-800">
                  Incluye 3 versiones barajadas, Hoja de Respuestas de Relleno Rápido (OMR) y
                  Matriz de Claves para calificación docente.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintViewMode('none')}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  Cerrar Vista Previa
                </button>
              </div>
            </div>

            {paperExamPlanB.map((ver) => (
              <div
                key={ver.versionCode}
                className="border-2 border-slate-900 rounded-xl p-6 space-y-5 break-after-page"
              >
                <div className="border-b-2 border-slate-900 pb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono font-bold uppercase tracking-wider">
                      {courseSubjectName || activeMeta.programaAcademico} ·{' '}
                      {courseSede || activeMeta.institucionSede}
                    </div>
                    <h2 className="text-lg font-extrabold">
                      EVALUACIÓN ESCRITA DE CONTINGENCIA —{' '}
                      {(courseName || activeMeta.nombreCurso || 'CURSO').toUpperCase()}
                    </h2>
                    <div className="text-xs text-slate-700 mt-1">
                      Estudiante: ______________________________________ Documento:
                      ____________________ Fecha: ____________
                    </div>
                  </div>
                  <div className="px-3 py-1.5 border-2 border-slate-900 rounded-lg font-mono font-extrabold text-sm shrink-0">
                    {ver.versionCode}
                  </div>
                </div>

                {/* Hoja de Burbujas OMR Compacta */}
                <div className="p-3 border border-slate-400 rounded-lg bg-slate-50/50 space-y-2">
                  <div className="text-[11px] font-bold uppercase">
                    Cuadrícula de Respuestas Rápidas ({ver.versionCode}) — Rellene completamente el
                    círculo:
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 text-[10px] font-mono">
                    {ver.items.map((_, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-300 rounded px-1.5 py-1 bg-white text-center"
                      >
                        <div className="font-bold">{idx + 1}</div>
                        <div className="flex justify-center gap-1 mt-0.5">
                          <span>Ⓐ</span>
                          <span>Ⓑ</span>
                          <span>Ⓒ</span>
                          <span>Ⓓ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preguntas de la Fila */}
                <div className="space-y-3.5 text-xs">
                  {ver.items.map((q, idx) => (
                    <div key={q.id} className="space-y-1 border-b border-slate-200 pb-2.5">
                      <div className="font-bold text-slate-900">
                        {idx + 1}.{' '}
                        <span className="font-mono text-[10px] text-slate-500">
                          [{q.id} · M{q.modulo}]
                        </span>{' '}
                        {q.enunciado}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pl-4 text-[11px]">
                        <div>
                          <strong>A)</strong> {q.opciones.A}
                        </div>
                        <div>
                          <strong>B)</strong> {q.opciones.B}
                        </div>
                        <div>
                          <strong>C)</strong> {q.opciones.C}
                        </div>
                        <div>
                          <strong>D)</strong> {q.opciones.D}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Hoja Exclusiva del Docente: Clave de Respuestas para las 3 Filas */}
            <div className="border-2 border-slate-900 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-extrabold uppercase border-b border-slate-900 pb-2">
                Hoja Exclusiva del Docente / Editor — Matriz de Claves de Calificación Rápida
                (Filas A, B y C)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                {paperExamPlanB.map((ver) => (
                  <div key={ver.versionCode} className="border border-slate-300 rounded-lg p-3">
                    <div className="font-extrabold text-sm mb-2 border-b border-slate-200 pb-1">
                      CLAVE {ver.versionCode}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {ver.items.map((q, idx) => (
                        <div key={q.id}>
                          #{String(idx + 1).padStart(2, '0')} ({q.id}):{' '}
                          <strong>{q.correcta}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
