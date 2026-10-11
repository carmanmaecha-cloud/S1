import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  ABProProjectEvaluation,
  SystemConfig,
  CustomMiniRetoTemplate,
  UniversalCourseMetadata,
  UniversalCourseWorkspace,
  UniversalModuleDefinition,
  UniversalExamDefinition,
  UniversalModuleDocumentLink
} from '../types';
import {
  DEFAULT_COURSE_METADATA,
  DEFAULT_MODULE_GRADING_WEIGHTS,
  getEffectiveCourseMetadata,
  buildUniversalModulesList,
  buildUniversalExamsList,
  createDemoStudentForCourse,
  generateBaseQuestionsForCourseModules,
  generateBaseRetosForCourseModules,
  parseRawDocumentLinksToStructured,
  formatStructuredDocumentLinksToRaw,
  computeIntegralExamAutoSumFromModules,
  getEffectiveRegisteredTeachers
} from '../utils/universalCourseEngine';
import {
  AcademicDataset,
  buildInitialAcademicDataset,
  normalizeAndSyncAcademicDataset
} from '../data/classAttendanceAndGrades';
import { generateDeterministicAccessCode } from '../data/students';
import {
  parseStudentsFromExcelOrCsvFile,
  parseQuestionsFromAnyFile
} from '../utils/excelParser';
import { normalizeQuestionList } from '../data/questions';
import { OptionServerSaveBar } from './ServerSaveContext';
import {
  BookOpen,
  Plus,
  Layers,
  FileCheck2,
  Trophy,
  Users,
  Database,
  CheckCircle2,
  Upload,
  Download,
  Copy,
  Trash2,
  Sparkles,
  Settings,
  RefreshCw,
  Edit3,
  FolderPlus,
  ArrowRight
} from 'lucide-react';

interface UniversalCourseManagerProps {
  isOpen?: boolean;
  onClose?: () => void;
  mode?: 'inline' | 'modal';
  config: SystemConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  students: StudentRecord[];
  onUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>>;
  questions: Question[];
  onUpdateQuestions: (next: Question[]) => void;
  attempts: ExamAttemptResult[];
  onUpdateAttempts: (next: ExamAttemptResult[]) => void;
  abproEvaluations: ABProProjectEvaluation[];
  onUpdateABProEvaluations: (next: ABProProjectEvaluation[]) => void;
  customMiniRetos: CustomMiniRetoTemplate[];
  onUpdateCustomMiniRetos: React.Dispatch<React.SetStateAction<CustomMiniRetoTemplate[]>>;
  academicDataset?: AcademicDataset;
  onUpdateAcademicDataset?: (nextDataset: AcademicDataset, options?: any) => void;
  onFullSystemRestore?: (payload: any) => Promise<void>;
  onNavigateToQuestionBank?: () => void;
  onNavigateToStudentRoster?: () => void;
  onNavigateToMiniRetos?: () => void;
  onNavigateToSection?: (section: 'estudiantes' | 'preguntas' | 'retos_ia' | 'examenes_notas' | 'gestion_academica_clases') => void;
}

export function UniversalCourseManagerModal(props: UniversalCourseManagerProps) {
  if (props.mode === 'modal' && props.isOpen === false) {
    return null;
  }
  if (props.mode === 'modal') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl max-w-6xl w-full p-5 space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Gestor Universal de Curso y Catálogo Multi-Curso
            </h3>
            {props.onClose && (
              <button
                type="button"
                onClick={props.onClose}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Cerrar ✕
              </button>
            )}
          </div>
          <UniversalCourseManager {...props} />
        </div>
      </div>
    );
  }
  return <UniversalCourseManager {...props} />;
}

export function UniversalCourseManager({
  config,
  onUpdateConfig,
  students,
  onUpdateStudents,
  questions,
  onUpdateQuestions,
  attempts,
  onUpdateAttempts,
  abproEvaluations,
  onUpdateABProEvaluations,
  customMiniRetos,
  onUpdateCustomMiniRetos,
  academicDataset,
  onUpdateAcademicDataset,
  onNavigateToQuestionBank,
  onNavigateToStudentRoster,
  onNavigateToMiniRetos,
  onNavigateToSection
}: UniversalCourseManagerProps) {
  const activeMeta = useMemo(() => getEffectiveCourseMetadata(config), [config]);

  // Catalog of courses (ensuring active course is represented when configured)
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

  // Local editable state for active course metadata
  const [draftMeta, setDraftMeta] = useState<UniversalCourseMetadata>(activeMeta);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved'>('saved');
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('es-CO')
  );
  const [newDocInputsByModule, setNewDocInputsByModule] = useState<
    Record<number, { titulo: string; url: string; tipo: string }>
  >({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalSaveRef = useRef(false);

  // New Course Creation Wizard Modal
  const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseProgram, setNewCourseProgram] = useState('');
  const [newCourseInstitution, setNewCourseInstitution] = useState('');
  const [newCoursePeriod, setNewCoursePeriod] = useState('');
  const [newCourseTeacher, setNewCourseTeacher] = useState('');
  const [newCourseAssignedTeacherId, setNewCourseAssignedTeacherId] = useState('');
  const [newCourseModulesCount, setNewCourseModulesCount] = useState(1);
  const [newCourseEnableIntegralExam, setNewCourseEnableIntegralExam] = useState(false);
  const [newCourseIntegralQuestions, setNewCourseIntegralQuestions] = useState(0);
  const [newCourseIntegralMinutes, setNewCourseIntegralMinutes] = useState(80);
  const [expandedIntegralQuestionSelectorMod, setExpandedIntegralQuestionSelectorMod] = useState<number | null>(null);
  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<string | null>(null);
  const registeredTeachers = useMemo(() => getEffectiveRegisteredTeachers(config), [config]);
  const [newCourseModulesConfig, setNewCourseModulesConfig] = useState<UniversalModuleDefinition[]>(() => [
    {
      id: 1,
      code: 'C1',
      shortTitle: '',
      fullTitle: '',
      description: '',
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
      documentosEnlaces: [],
      enlacesTextoRaw: ''
    }
  ]);
  const [newCourseStudentsInitMode, setNewCourseStudentsInitMode] = useState<'empty_demo' | 'clone_current'>('empty_demo');
  const [newCourseQuestionsInitMode, setNewCourseQuestionsInitMode] = useState<'auto_generate' | 'empty' | 'clone_current'>('empty');

  const handleUpdateNewCourseModulesCount = (nextCountRaw: number) => {
    const safeCount = Math.max(1, Math.min(12, Number(nextCountRaw) || 1));
    setNewCourseModulesCount(safeCount);
    setNewCourseModulesConfig((prev) => {
      const updated: UniversalModuleDefinition[] = Array.from({ length: safeCount }, (_, idx) => {
        const modNum = idx + 1;
        const existing = prev[idx];
        if (existing) {
          return {
            ...existing,
            id: modNum,
            code: existing.code || `C${modNum}`,
            examenesCount: typeof existing.examenesCount === 'number' ? existing.examenesCount : 1,
            retosCount: typeof existing.retosCount === 'number' ? existing.retosCount : 2
          };
        }
        return {
          id: modNum,
          code: `C${modNum}`,
          shortTitle: `Módulo ${modNum}`,
          fullTitle: `Clase ${modNum} / Módulo ${modNum}: Módulo ${modNum}`,
          description: `Contenidos y actividades del Módulo ${modNum}`,
          retoBadgeTitle: `Insignia Módulo ${modNum}`,
          activo: true,
          examenesCount: 1,
          retosCount: 2,
          ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
          documentosEnlaces: [],
          enlacesTextoRaw: ''
        };
      });
      return updated;
    });
  };

  // Sync draftMeta when active course changes externally
  useEffect(() => {
    if (isInternalSaveRef.current) {
      isInternalSaveRef.current = false;
      return;
    }
    setDraftMeta(activeMeta);
  }, [activeMeta.courseId, activeMeta.updatedAtIso]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const showNotice = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), 5000);
  };

  // Save changes to the active course metadata (modules, exams, challenges count, course name, weights, support docs, etc.)
  const handleSaveActiveCourseMeta = useCallback(
    (
      customNextMeta?: UniversalCourseMetadata,
      options?: { silentNotice?: boolean; customTeoriaPct?: number }
    ) => {
      const rawTarget = customNextMeta || draftMeta;
      const normalizedModules: UniversalModuleDefinition[] = (rawTarget.modulosCurso || []).map(
        (m, idx) => {
          const modNum = idx + 1;
          const rawLinks =
            typeof m.enlacesTextoRaw === 'string'
              ? m.enlacesTextoRaw
              : formatStructuredDocumentLinksToRaw(m.documentosEnlaces);
          const structuredLinks =
            Array.isArray(m.documentosEnlaces) &&
            m.documentosEnlaces.length > 0 &&
            rawLinks === formatStructuredDocumentLinksToRaw(m.documentosEnlaces)
              ? m.documentosEnlaces
              : parseRawDocumentLinksToStructured(rawLinks, modNum, m.shortTitle);
          return {
            ...m,
            id: modNum,
            code: m.code || `C${modNum}`,
            examenesCount: typeof m.examenesCount === 'number' ? m.examenesCount : 1,
            retosCount: typeof m.retosCount === 'number' ? m.retosCount : 2,
            ponderacion: {
              comportamientoPct: Number(m.ponderacion?.comportamientoPct ?? 10),
              participacionPct: Number(m.ponderacion?.participacionPct ?? 15),
              examenPct: Number(m.ponderacion?.examenPct ?? 35),
              trabajoPct: Number(m.ponderacion?.trabajoPct ?? 40)
            },
            enlacesTextoRaw: rawLinks,
            documentosEnlaces: structuredLinks
          };
        }
      );

      const targetMeta: UniversalCourseMetadata = {
        ...rawTarget,
        modulosCurso: normalizedModules,
        updatedAtIso: new Date().toISOString()
      };

      const integralExam = targetMeta.examenesCurso.find((e) => e.id === 'integral');
      const firstModExam = targetMeta.examenesCurso.find((e) => e.id === 'mod1');

      // Update academicDataset class definitions if present
      if (academicDataset && onUpdateAcademicDataset) {
        const updatedClassSessions = targetMeta.modulosCurso.slice(0, 6).map((m, idx) => ({
          id: (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          code: (`C${idx + 1}`) as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6',
          shortTitle: m.shortTitle,
          fullTitle: `Clase ${idx + 1}: ${m.shortTitle}`,
          subtitle: m.description || m.fullTitle || m.shortTitle,
          examenesCount: m.examenesCount ?? 1,
          retosCount: m.retosCount ?? 2,
          ponderacion: m.ponderacion || { ...DEFAULT_MODULE_GRADING_WEIGHTS },
          documentosEnlaces: m.documentosEnlaces || []
        }));
        onUpdateAcademicDataset(
          normalizeAndSyncAcademicDataset(
            {
              ...academicDataset,
              courseName: targetMeta.nombreCurso,
              classSessions: updatedClassSessions,
              updatedAtIso: new Date().toISOString()
            },
            students
          )
        );
      }

      const updatedCatalog = catalog.map((ws) =>
        ws.meta.courseId === targetMeta.courseId
          ? {
              ...ws,
              meta: targetMeta,
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

      isInternalSaveRef.current = true;
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: targetMeta.courseId,
        activeCourseMeta: targetMeta,
        universalCoursesCatalog: updatedCatalog,
        ponderacionTeoriaPct:
          typeof options?.customTeoriaPct === 'number'
            ? options.customTeoriaPct
            : prev.ponderacionTeoriaPct,
        preguntasExamenIntegral: integralExam?.questionsCount ?? prev.preguntasExamenIntegral,
        tiempoExamenIntegralMin: integralExam?.durationMinutes ?? prev.tiempoExamenIntegralMin,
        preguntasExamenModulo: firstModExam?.questionsCount ?? prev.preguntasExamenModulo,
        tiempoExamenModuloMin: firstModExam?.durationMinutes ?? prev.tiempoExamenModuloMin
      }));

      setDraftMeta(targetMeta);
      setAutoSaveState('saved');
      setLastAutoSavedAt(new Date().toLocaleTimeString('es-CO'));
      if (!options?.silentNotice) {
        showNotice(
          `✓ Configuración universal del curso «${targetMeta.nombreCurso}» guardada en el servidor y aplicada en toda la plataforma.`
        );
      }
    },
    [
      draftMeta,
      academicDataset,
      onUpdateAcademicDataset,
      students,
      catalog,
      questions,
      attempts,
      customMiniRetos,
      abproEvaluations,
      onUpdateConfig
    ]
  );

  // Helper to update draftMeta and automatically persist to server (debounced or immediate)
  const updateDraftAndAutoSave = useCallback(
    (
      updater: (prev: UniversalCourseMetadata) => UniversalCourseMetadata,
      immediate = false
    ) => {
      setAutoSaveState('saving');
      setDraftMeta((prev) => {
        const next = updater(prev);
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        if (immediate) {
          setTimeout(() => {
            handleSaveActiveCourseMeta(next, { silentNotice: true });
          }, 0);
        } else {
          autoSaveTimerRef.current = setTimeout(() => {
            handleSaveActiveCourseMeta(next, { silentNotice: true });
          }, 400);
        }
        return next;
      });
    },
    [handleSaveActiveCourseMeta]
  );

  // Change number of modules dynamically (with automatic server persistence)
  const handleChangeModulesCount = (newCount: number) => {
    const safeCount = Math.max(1, Math.min(12, newCount));
    updateDraftAndAutoSave((prev) => {
      const nextModules = buildUniversalModulesList(safeCount, prev.modulosCurso);
      const isIntegralEnabled = prev.habilitarExamenIntegral !== false;
      const sumModExams = nextModules.reduce(
        (acc, m) => acc + (typeof m.examenesCount === 'number' ? m.examenesCount : 1),
        0
      );
      const sumModRetos = nextModules.reduce(
        (acc, m) => acc + (typeof m.retosCount === 'number' ? m.retosCount : 2),
        0
      );
      const totalExams = sumModExams + (isIntegralEnabled ? 1 : 0);
      const nextExams = buildUniversalExamsList(
        totalExams,
        nextModules,
        prev.examenesCurso,
        40,
        80,
        25,
        50,
        isIntegralEnabled
      );
      return {
        ...prev,
        cantidadModulos: safeCount,
        cantidadExamenes: Math.max(0, totalExams),
        cantidadRetos: Math.max(0, sumModRetos),
        modulosCurso: nextModules,
        examenesCurso: nextExams
      };
    }, true);
  };

  // Toggle Examen Integral Final (outside modules, integrating M1..MN and automatically summing selected questions)
  const handleToggleIntegralExam = (enabled: boolean) => {
    updateDraftAndAutoSave((prev) => {
      const sumModExams = prev.modulosCurso.reduce(
        (acc, m) => acc + (typeof m.examenesCount === 'number' ? m.examenesCount : 1),
        0
      );
      const totalExams = sumModExams + (enabled ? 1 : 0);
      const autoSum = computeIntegralExamAutoSumFromModules(prev.modulosCurso, questions);
      const nextExams = prev.examenesCurso.map((ex) =>
        ex.id === 'integral'
          ? {
              ...ex,
              activo: enabled,
              sumarAutomaticamenteDeModulos: true,
              questionsCount: autoSum.totalQuestions,
              title: `Examen Integral Final (Módulos 1 al ${prev.cantidadModulos} · ${prev.nombreCurso})`,
              subtitle: `${autoSum.totalQuestions} preguntas integradoras (suma automática M1 a M${prev.cantidadModulos}) • ${ex.durationMinutes} minutos`,
              badge: `Evaluación Integral Final · ${autoSum.totalQuestions} Reactivos · ${ex.durationMinutes} Min`
            }
          : ex
      );
      return {
        ...prev,
        habilitarExamenIntegral: enabled,
        cantidadExamenes: Math.max(0, totalExams),
        examenesCurso: nextExams
      };
    }, true);
  };

  // Automatic calculation of integral exam questions from all modules of the active course
  const activeCourseIntegralAutoSum = useMemo(
    () => computeIntegralExamAutoSumFromModules(draftMeta.modulosCurso, questions),
    [draftMeta.modulosCurso, questions]
  );

  // Update how many questions a specific module contributes to the Examen Integral Final and auto-sum
  const handleUpdateModuleIntegralContribution = (
    moduleIdx: number,
    nextCount: number,
    explicitIds?: string[]
  ) => {
    const safeCount = Math.max(0, Math.min(100, nextCount));
    updateDraftAndAutoSave((prev) => {
      const nextModules = prev.modulosCurso.map((m, i) =>
        i === moduleIdx
          ? {
              ...m,
              preguntasParaIntegralCount: safeCount,
              preguntasSeleccionadasIntegralIds: explicitIds ?? m.preguntasSeleccionadasIntegralIds
            }
          : m
      );
      const autoSum = computeIntegralExamAutoSumFromModules(nextModules, questions);
      const nextExams = prev.examenesCurso.map((ex) =>
        ex.id === 'integral'
          ? {
              ...ex,
              sumarAutomaticamenteDeModulos: true,
              questionsCount: autoSum.totalQuestions,
              subtitle: `${autoSum.totalQuestions} preguntas integradoras (suma automática M1 a M${prev.cantidadModulos}) • ${ex.durationMinutes} minutos`,
              badge: `Evaluación Integral Final · ${autoSum.totalQuestions} Reactivos · ${ex.durationMinutes} Min`
            }
          : ex
      );
      return {
        ...prev,
        modulosCurso: nextModules,
        examenesCurso: nextExams
      };
    }, true);
  };

  // Sync Exam titles with Module names (with automatic server persistence)
  const handleSyncExamTitlesWithModules = () => {
    updateDraftAndAutoSave((prev) => {
      const syncedExams = prev.examenesCurso.map((ex, idx) => {
        if (ex.id === 'integral') {
          return {
            ...ex,
            title: `Examen Integral (${prev.nombreCurso})`,
            subtitle: `${ex.questionsCount} preguntas aleatorias balanceadas • ${ex.durationMinutes} minutos`
          };
        }
        const modDef = prev.modulosCurso.find((m) => m.id === idx);
        const modTitle = modDef ? modDef.shortTitle : `Módulo ${idx}`;
        return {
          ...ex,
          title: `Examen Módulo ${idx}: ${modTitle}`,
          subtitle: `${ex.questionsCount} preguntas exclusivas de ${modTitle} • ${ex.durationMinutes} minutos`,
          badge: `Módulo ${idx} · ${ex.questionsCount} Reactivos · ${ex.durationMinutes} Min`
        };
      });
      return {
        ...prev,
        examenesCurso: syncedExams
      };
    }, true);
    showNotice('✓ Títulos de los exámenes sincronizados con los nombres de cada módulo y guardados en el servidor.');
  };

  // Switch active course from catalog
  const handleSwitchCourse = (targetCourseId: string) => {
    if (targetCourseId === activeMeta.courseId) return;
    const targetWorkspace = catalog.find((c) => c.meta.courseId === targetCourseId);
    if (!targetWorkspace) return;

    // 1. Save current course snapshot inside catalog
    const savedCatalog = catalog.map((ws) => {
      if (ws.meta.courseId === activeMeta.courseId) {
        return {
          ...ws,
          meta: draftMeta,
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
      }
      return ws;
    });

    // 2. Load target course data
    const nextStudents = Array.isArray(targetWorkspace.students)
      ? targetWorkspace.students
      : [];
    const nextQuestions = Array.isArray(targetWorkspace.questions)
      ? targetWorkspace.questions
      : [];
    const nextAttempts = Array.isArray(targetWorkspace.attempts)
      ? targetWorkspace.attempts
      : [];
    const nextAbpro = Array.isArray(targetWorkspace.abproEvaluations)
      ? targetWorkspace.abproEvaluations
      : [];
    const nextRetos =
      Array.isArray(targetWorkspace.customMiniRetos) && targetWorkspace.customMiniRetos.length > 0
        ? targetWorkspace.customMiniRetos
        : generateBaseRetosForCourseModules(targetWorkspace.meta);
    const nextAcademic = targetWorkspace.academicDataset
      ? normalizeAndSyncAcademicDataset(targetWorkspace.academicDataset, nextStudents)
      : buildInitialAcademicDataset(nextStudents);

    onUpdateStudents(nextStudents);
    onUpdateQuestions(nextQuestions);
    onUpdateAttempts(nextAttempts);
    onUpdateABProEvaluations(nextAbpro);
    onUpdateCustomMiniRetos(nextRetos);
    if (onUpdateAcademicDataset) {
      onUpdateAcademicDataset(nextAcademic);
    }

    onUpdateConfig((prev) => ({
      ...prev,
      activeCourseId: targetWorkspace.meta.courseId,
      activeCourseMeta: targetWorkspace.meta,
      universalCoursesCatalog: savedCatalog
    }));

    setDraftMeta(targetWorkspace.meta);
    showNotice(
      `✓ Curso activo cambiado a «${targetWorkspace.meta.nombreCurso}» (${nextStudents.length} estudiantes · ${nextQuestions.length} preguntas).`
    );
  };

  // Create a brand new universal course
  const handleCreateNewCourse = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCourseName.trim();
    if (!cleanName) return;

    const cleanCode =
      newCourseCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'CU26';
    const newId = `curso-${cleanCode.toLowerCase()}-${Date.now().toString(36)}`;

    const builtModules: UniversalModuleDefinition[] = Array.from(
      { length: newCourseModulesCount },
      (_, idx) => {
        const modNum = idx + 1;
        const draftMod = newCourseModulesConfig[idx];
        const customName =
          draftMod?.shortTitle?.trim() || `Unidad Temática ${modNum}`;
        const rawLinks = draftMod?.enlacesTextoRaw || '';
        const structuredLinks = parseRawDocumentLinksToStructured(
          rawLinks,
          modNum,
          customName
        );
        const exCount =
          typeof draftMod?.examenesCount === 'number' ? draftMod.examenesCount : 1;
        const retCount =
          typeof draftMod?.retosCount === 'number' ? draftMod.retosCount : 2;
        const integralContrib =
          typeof draftMod?.preguntasParaIntegralCount === 'number'
            ? draftMod.preguntasParaIntegralCount
            : 8;
        const weights = {
          comportamientoPct: Number(draftMod?.ponderacion?.comportamientoPct ?? 10),
          participacionPct: Number(draftMod?.ponderacion?.participacionPct ?? 15),
          examenPct: Number(draftMod?.ponderacion?.examenPct ?? 35),
          trabajoPct: Number(draftMod?.ponderacion?.trabajoPct ?? 40)
        };
        return {
          id: modNum,
          code: draftMod?.code || `C${modNum}`,
          shortTitle: customName,
          fullTitle: `Clase ${modNum} / Módulo ${modNum}: ${customName}`,
          description:
            draftMod?.description ||
            `Contenidos, talleres y evaluación del Módulo ${modNum}: ${customName}`,
          retoBadgeTitle:
            draftMod?.retoBadgeTitle || `Insignia Módulo ${modNum}: ${customName}`,
          activo: true,
          examenesCount: exCount,
          retosCount: retCount,
          preguntasExamenModuloCount: 25,
          preguntasParaIntegralCount: integralContrib,
          preguntasSeleccionadasIntegralIds: [],
          ponderacion: weights,
          enlacesTextoRaw: rawLinks,
          documentosEnlaces: structuredLinks
        };
      }
    );

    const totalModuleExams = builtModules.reduce(
      (acc, m) => acc + (typeof m.examenesCount === 'number' ? m.examenesCount : 1),
      0
    );
    const totalModuleRetos = builtModules.reduce(
      (acc, m) => acc + (typeof m.retosCount === 'number' ? m.retosCount : 2),
      0
    );
    const autoSumIntegralQuestions = Math.max(
      5,
      builtModules.reduce(
        (acc, m) => acc + (typeof m.preguntasParaIntegralCount === 'number' ? m.preguntasParaIntegralCount : 8),
        0
      )
    );
    const effectiveExamsCount =
      totalModuleExams + (newCourseEnableIntegralExam ? 1 : 0);
    const effectiveRetosCount = totalModuleRetos;

    const assignedTeacherObj = registeredTeachers.find(
      (t) => t.id.trim().toUpperCase() === newCourseAssignedTeacherId.trim().toUpperCase()
    );
    const effectiveTeacherName =
      assignedTeacherObj?.nombre || newCourseTeacher.trim() || 'Docente Titular';

    const builtExams: UniversalExamDefinition[] = buildUniversalExamsList(
      effectiveExamsCount,
      builtModules,
      undefined,
      autoSumIntegralQuestions,
      newCourseIntegralMinutes,
      25,
      50,
      newCourseEnableIntegralExam
    ).map((ex, idx) => {
      if (ex.id === 'integral') {
        return {
          ...ex,
          activo: newCourseEnableIntegralExam,
          sumarAutomaticamenteDeModulos: true,
          questionsCount: autoSumIntegralQuestions,
          durationMinutes: newCourseIntegralMinutes,
          title: `Examen Integral Final (Módulos 1 al ${newCourseModulesCount} · ${cleanName})`,
          subtitle: `${autoSumIntegralQuestions} preguntas integradoras (suma automática M1 al M${newCourseModulesCount}) • ${newCourseIntegralMinutes} minutos`,
          badge: `Evaluación Integral Final · ${autoSumIntegralQuestions} Reactivos · ${newCourseIntegralMinutes} Min`
        };
      }
      const mDef = builtModules[idx - 1];
      return {
        ...ex,
        activo: mDef ? (mDef.examenesCount ?? 1) > 0 : false,
        title: mDef ? `Examen Módulo ${idx}: ${mDef.shortTitle}` : ex.title
      };
    });

    const newMeta: UniversalCourseMetadata = {
      courseId: newId,
      nombreCurso: cleanName,
      codigoCurso: cleanCode,
      programaAcademico: newCourseProgram.trim() || 'Programa Académico',
      institucionSede: newCourseInstitution.trim() || 'Sede Principal',
      periodoAcademico: newCoursePeriod.trim() || '2026-1',
      docenteResponsable: effectiveTeacherName,
      docenteAsignadoId: newCourseAssignedTeacherId || 'DOCENTE2026',
      docentesAutorizadosIds: [newCourseAssignedTeacherId || 'DOCENTE2026'],
      descripcionGeneral: `Curso estructurado en ${newCourseModulesCount} módulos, ${effectiveExamsCount} exámenes (${totalModuleExams} por módulo${newCourseEnableIntegralExam ? ` + 1 Examen Integral Final de ${autoSumIntegralQuestions} preguntas` : ''}) y ${effectiveRetosCount} mini retos interactivos.`,
      cantidadModulos: newCourseModulesCount,
      cantidadExamenes: effectiveExamsCount,
      cantidadRetos: effectiveRetosCount,
      habilitarExamenIntegral: newCourseEnableIntegralExam,
      modulosCurso: builtModules,
      examenesCurso: builtExams,
      updatedAtIso: new Date().toISOString()
    };

    const initialStudents: StudentRecord[] =
      newCourseStudentsInitMode === 'clone_current'
        ? students.map((s) => ({
            ...s,
            intentosUsados: 0,
            preguntasIntento1: [],
            preguntasIntento2: [],
            conceptoInfraccion: '✓ Sin infracciones',
            suspendido: false,
            progresoMiniRetos: undefined
          }))
        : [];

    const initialQuestions: Question[] =
      newCourseQuestionsInitMode === 'clone_current'
        ? [...questions]
        : newCourseQuestionsInitMode === 'auto_generate'
        ? generateBaseQuestionsForCourseModules(newMeta, 8)
        : [];

    const initialRetos: CustomMiniRetoTemplate[] = generateBaseRetosForCourseModules(newMeta);
    const initialAcademic = buildInitialAcademicDataset(initialStudents);
    initialAcademic.courseName = cleanName;
    initialAcademic.classSessions = builtModules.slice(0, 6).map((m, idx) => ({
      id: (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      code: (`C${idx + 1}`) as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6',
      shortTitle: m.shortTitle,
      fullTitle: `Clase ${idx + 1}: ${m.shortTitle}`,
      subtitle: m.description || m.fullTitle || m.shortTitle,
      examenesCount: m.examenesCount ?? 1,
      retosCount: m.retosCount ?? 2,
      ponderacion: m.ponderacion || { ...DEFAULT_MODULE_GRADING_WEIGHTS },
      documentosEnlaces: m.documentosEnlaces || []
    }));

    const newWorkspace: UniversalCourseWorkspace = {
      meta: newMeta,
      studentsCount: initialStudents.length,
      questionsCount: initialQuestions.length,
      attemptsCount: 0,
      retosCount: initialRetos.length,
      students: initialStudents,
      questions: initialQuestions,
      attempts: [],
      abproEvaluations: [],
      customMiniRetos: initialRetos,
      academicDataset: initialAcademic
    };

    // Save current workspace and add new workspace
    const updatedCatalog = [
      ...catalog.map((ws) =>
        ws.meta.courseId === activeMeta.courseId
          ? {
              ...ws,
              meta: draftMeta,
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
      ),
      newWorkspace
    ];

    onUpdateStudents(initialStudents);
    onUpdateQuestions(initialQuestions);
    onUpdateAttempts([]);
    onUpdateABProEvaluations([]);
    onUpdateCustomMiniRetos(initialRetos);
    if (onUpdateAcademicDataset) {
      onUpdateAcademicDataset(initialAcademic);
    }

    onUpdateConfig((prev) => {
      const currentTeachers = getEffectiveRegisteredTeachers(prev);
      const updatedTeachers = currentTeachers.map((t) =>
        t.id.trim().toUpperCase() === (newCourseAssignedTeacherId || 'DOCENTE2026').trim().toUpperCase()
          ? {
              ...t,
              cursosAsignadosIds: Array.from(new Set([...(t.cursosAsignadosIds || []), newMeta.courseId]))
            }
          : t
      );
      return {
        ...prev,
        activeCourseId: newMeta.courseId,
        activeCourseMeta: newMeta,
        universalCoursesCatalog: updatedCatalog,
        registeredTeachers: updatedTeachers
      };
    });

    setDraftMeta(newMeta);
    setNewCourseModalOpen(false);
    setNewCourseName('');
    showNotice(
      `✓ Nuevo curso «${cleanName}» creado y guardado en el servidor con ${newCourseModulesCount} módulos, ${effectiveExamsCount} exámenes (${totalModuleExams} de módulo${newCourseEnableIntegralExam ? ' + 1 Examen Integral Final' : ''}), ${effectiveRetosCount} mini retos, ${initialStudents.length} estudiante(s) y ${initialQuestions.length} preguntas.`
    );
  };

  // Delete a course from catalog (supports deleting both non-active and active created courses)
  const handleDeleteCourseFromCatalog = (courseIdToDelete: string) => {
    const targetCourse = catalog.find((c) => c.meta.courseId === courseIdToDelete);
    const targetName = targetCourse?.meta.nombreCurso || courseIdToDelete;
    const remaining = catalog.filter((c) => c.meta.courseId !== courseIdToDelete);

    if (remaining.length === 0) {
      // Reset to empty initial state if user deletes all courses in catalog
      const emptyAcademic = buildInitialAcademicDataset([]);
      onUpdateStudents([]);
      onUpdateQuestions([]);
      onUpdateAttempts([]);
      onUpdateABProEvaluations([]);
      onUpdateCustomMiniRetos([]);
      if (onUpdateAcademicDataset) {
        onUpdateAcademicDataset(emptyAcademic);
      }
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: '',
        activeCourseMeta: undefined,
        universalCoursesCatalog: []
      }));
      setDraftMeta(getEffectiveCourseMetadata(undefined));
      setConfirmDeleteCourseId(null);
      showNotice(`✓ Curso «${targetName}» eliminado. La base de datos quedó sin cursos activos.`);
      return;
    }

    if (courseIdToDelete === activeMeta.courseId) {
      const nextActiveWs = remaining[0];
      const nextStudents = Array.isArray(nextActiveWs.students)
        ? nextActiveWs.students
        : [];
      const nextQuestions = Array.isArray(nextActiveWs.questions) ? nextActiveWs.questions : [];
      const nextAttempts = Array.isArray(nextActiveWs.attempts) ? nextActiveWs.attempts : [];
      const nextAbpro = Array.isArray(nextActiveWs.abproEvaluations)
        ? nextActiveWs.abproEvaluations
        : [];
      const nextRetos =
        Array.isArray(nextActiveWs.customMiniRetos) && nextActiveWs.customMiniRetos.length > 0
          ? nextActiveWs.customMiniRetos
          : generateBaseRetosForCourseModules(nextActiveWs.meta);
      const nextAcademic = nextActiveWs.academicDataset
        ? normalizeAndSyncAcademicDataset(nextActiveWs.academicDataset, nextStudents)
        : buildInitialAcademicDataset(nextStudents);

      onUpdateStudents(nextStudents);
      onUpdateQuestions(nextQuestions);
      onUpdateAttempts(nextAttempts);
      onUpdateABProEvaluations(nextAbpro);
      onUpdateCustomMiniRetos(nextRetos);
      if (onUpdateAcademicDataset) {
        onUpdateAcademicDataset(nextAcademic);
      }
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: nextActiveWs.meta.courseId,
        activeCourseMeta: nextActiveWs.meta,
        universalCoursesCatalog: remaining
      }));
      setDraftMeta(nextActiveWs.meta);
    } else {
      onUpdateConfig((prev) => ({
        ...prev,
        universalCoursesCatalog: remaining
      }));
    }

    setConfirmDeleteCourseId(null);
    showNotice(`✓ Curso «${targetName}» eliminado del catálogo y cambios guardados en el servidor.`);
  };

  // Upload Student Roster Excel/CSV specifically for the active course
  const handleUploadCourseStudentsFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'replace' | 'merge'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedStudents = await parseStudentsFromExcelOrCsvFile(file);
      const prefix = draftMeta.codigoCurso || 'MM26';
      const imported: StudentRecord[] = parsedStudents.map((st) => {
        const baseDetCode = generateDeterministicAccessCode(st.id);
        const customCode = st.codigoAcceso && st.codigoAcceso.length >= 6
          ? st.codigoAcceso
          : `${prefix}-${baseDetCode.split('-').slice(1).join('-')}`;
        return {
          id: st.id,
          nombre: st.nombre,
          codigoAcceso: customCode,
          intentosUsados: 0,
          preguntasIntento1: [],
          preguntasIntento2: [],
          conceptoInfraccion: '✓ Sin infracciones',
          suspendido: false
        };
      });

      if (imported.length === 0) {
        showNotice('⚠️ No se encontraron filas válidas de estudiantes (Documento y Nombre) en el archivo.');
        return;
      }

      const nextRoster =
        mode === 'replace'
          ? [...imported]
          : [
              ...students,
              ...imported.filter((imp) => !students.some((s) => s.id === imp.id))
            ];

      onUpdateStudents(nextRoster);
      if (onUpdateAcademicDataset) {
        onUpdateAcademicDataset(
          normalizeAndSyncAcademicDataset(
            academicDataset || buildInitialAcademicDataset(nextRoster),
            nextRoster
          )
        );
      }
      showNotice(
        `✓ Base de Datos de Estudiantes del curso «${draftMeta.nombreCurso}» actualizada (${imported.length} alumnos procesados).`
      );
    } catch (err: any) {
      showNotice(`⚠️ Error al procesar archivo de estudiantes: ${err?.message || 'Formato inválido'}`);
    } finally {
      e.target.value = '';
    }
  };

  // Upload Questions JSON/Excel/CSV specifically for the active course
  const handleUploadCourseQuestionsFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'replace' | 'merge'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedQuestions = await parseQuestionsFromAnyFile(file);
      const normalized = normalizeQuestionList(parsedQuestions);
      if (normalized.length === 0) {
        showNotice(
          '⚠️ No se detectaron preguntas válidas en el archivo. Use formato Excel (.xlsx), CSV o JSON.'
        );
        return;
      }
      const nextQ = mode === 'replace' ? normalized : [...questions, ...normalized];
      onUpdateQuestions(nextQ);
      showNotice(
        `✓ ${normalized.length} preguntas importadas al curso «${draftMeta.nombreCurso}» (Total en banco: ${nextQ.length}).`
      );
    } catch (err: any) {
      showNotice(`⚠️ Error al importar preguntas: ${err?.message || 'Archivo no válido'}`);
    } finally {
      e.target.value = '';
    }
  };

  // Export full Course Package (.json)
  const handleExportCoursePackage = () => {
    const pkg = {
      type: 'EVALUAPLUS_UNIVERSAL_COURSE_PACKAGE_V1',
      exportedAtIso: new Date().toISOString(),
      meta: draftMeta,
      students,
      questions,
      attempts,
      abproEvaluations,
      customMiniRetos,
      academicDataset
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curso_${draftMeta.codigoCurso.toLowerCase()}_completo.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Import full Course Package (.json)
  const handleImportCoursePackage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.meta || !parsed.meta.nombreCurso) {
        showNotice('⚠️ El archivo seleccionado no es un paquete de curso universal válido.');
        return;
      }
      const importedMeta: UniversalCourseMetadata = {
        ...parsed.meta,
        courseId: parsed.meta.courseId || `curso-imp-${Date.now()}`,
        updatedAtIso: new Date().toISOString()
      };
      const impStudents = Array.isArray(parsed.students) ? parsed.students : [];
      const impQuestions = Array.isArray(parsed.questions)
        ? normalizeQuestionList(parsed.questions)
        : [];
      const impAttempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
      const impAbpro = Array.isArray(parsed.abproEvaluations) ? parsed.abproEvaluations : [];
      const impRetos = Array.isArray(parsed.customMiniRetos) ? parsed.customMiniRetos : [];
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
      if (onUpdateAcademicDataset) {
        onUpdateAcademicDataset(impAcademic);
      }
      onUpdateConfig((prev) => ({
        ...prev,
        activeCourseId: importedMeta.courseId,
        activeCourseMeta: importedMeta,
        universalCoursesCatalog: nextCat
      }));
      setDraftMeta(importedMeta);
      showNotice(`✓ Curso «${importedMeta.nombreCurso}» importado y activado correctamente.`);
    } catch {
      showNotice('⚠️ No se pudo leer el archivo JSON del curso.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <OptionServerSaveBar
        sectionKey="configuracion_universal_cursos"
        label="Gestor Universal de Cursos · Estructura de Módulos, Exámenes, Retos, Nómina y Banco de Preguntas"
        autoSave={true}
        watchValue={`${draftMeta.courseId}:${draftMeta.nombreCurso}:${draftMeta.cantidadModulos}:${draftMeta.cantidadExamenes}:${draftMeta.cantidadRetos}:${students.length}:${questions.length}`}
      />

      {/* CABECERA PRINCIPAL DEL MOTOR UNIVERSAL DE CURSOS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-700">
                Arquitectura Universal Multi-Curso · LMS Parametrizable
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold ${
                  autoSaveState === 'saving' ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {autoSaveState === 'saving' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando automáticamente en el servidor...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Guardado automático en servidor ({lastAutoSavedAt}) · Persistente</span>
                  </>
                )}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Configuración Dinámica del Curso: Módulos, Retos, Exámenes, Ponderación y Documentos de Apoyo
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Edite dinámicamente el nombre de los módulos, cantidad de retos, cantidad de exámenes, ponderación porcentual y enlaces a documentos de apoyo por cada curso. Todos los cambios se guardan automáticamente en el servidor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNewCourseModalOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs transition-colors"
            >
              <FolderPlus className="w-4 h-4 shrink-0" />
              <span>+ Crear Nuevo Curso</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveActiveCourseMeta()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Guardar Cambios</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmDeleteCourseId(activeMeta.courseId)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Eliminar el curso actualmente seleccionado"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Eliminar Curso</span>
            </button>

            <button
              type="button"
              onClick={handleExportCoursePackage}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Exportar (.json)</span>
            </button>

            <label className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4 shrink-0" />
              <span>Importar (.json)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportCoursePackage}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {statusBanner && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 text-xs font-bold text-emerald-950 flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-emerald-800 hover:text-emerald-950 font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {confirmDeleteCourseId && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="font-bold text-red-950">
                ¿Confirmar eliminación del curso «{catalog.find((c) => c.meta.courseId === confirmDeleteCourseId)?.meta.nombreCurso || confirmDeleteCourseId}»?
              </div>
              <p className="text-[11px] text-red-800">
                Esta acción eliminará el curso seleccionado del catálogo y actualizará la configuración en el servidor.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDeleteCourseFromCatalog(confirmDeleteCourseId)}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Sí, Eliminar Curso
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteCourseId(null)}
                className="px-3 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-900 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* CATÁLOGO DE CURSOS DISPONIBLES (CONMUTACIÓN CON 1 CLIC) */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Cursos Registrados en la Plataforma ({catalog.length}) — Seleccione cuál desea administrar, activar o eliminar:
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.map((ws) => {
              const isCurrent = ws.meta.courseId === activeMeta.courseId;
              const hasIntegral = ws.meta.habilitarExamenIntegral !== false;
              return (
                <div
                  key={ws.meta.courseId}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    isCurrent
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-indigo-500/40'
                      : 'bg-slate-50/80 hover:bg-white text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-mono font-bold ${
                          isCurrent ? 'text-sky-300' : 'text-indigo-700'
                        }`}
                      >
                        Código: {ws.meta.codigoCurso} · {ws.meta.periodoAcademico}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {hasIntegral && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isCurrent
                                ? 'bg-purple-500/30 text-purple-200 border border-purple-400/40'
                                : 'bg-purple-100 text-purple-900'
                            }`}
                            title="Examen Integral Final habilitado"
                          >
                            🎓 Integral
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[11px] font-mono font-bold text-emerald-300">
                            ● ACTIVO
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold leading-snug">
                      {ws.meta.nombreCurso}
                    </h3>
                    <p
                      className={`text-xs ${
                        isCurrent ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {ws.meta.programaAcademico} · {ws.meta.institucionSede}
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-200/20">
                    <div
                      className={`text-[11px] font-mono flex flex-wrap items-center gap-x-2 gap-y-1 ${
                        isCurrent ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      <span>{ws.meta.cantidadModulos} Módulos</span>
                      <span>·</span>
                      <span>{ws.meta.cantidadExamenes} Exámenes</span>
                      <span>·</span>
                      <span>{ws.meta.cantidadRetos} Retos</span>
                      <span>·</span>
                      <span>{isCurrent ? students.length : ws.studentsCount} Alumnos</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {!isCurrent ? (
                        <button
                          type="button"
                          onClick={() => handleSwitchCourse(ws.meta.courseId)}
                          className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Activar este Curso →
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-sky-300 flex-1">
                          Editando curso actual ↓
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCourseId(ws.meta.courseId)}
                        title="Eliminar este curso"
                        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          isCurrent
                            ? 'border-red-400/40 bg-red-500/20 hover:bg-red-600 text-red-200 hover:text-white'
                            : 'border-red-200 text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* SECCIÓN 1: ELEMENTOS GENERALES DEL CURSO ACTIVO                                       */}
      {/* ===================================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                1. Datos Generales e Identidad del Curso Activo
              </h3>
              <p className="text-xs text-slate-500">
                Se reflejan automáticamente en el Portal del Estudiante, certificados QR, reportes Excel/CSV y encabezado institucional.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSaveActiveCourseMeta()}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            Guardar Datos Generales
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="lg:col-span-2 space-y-1">
            <label className="block font-bold text-slate-700">
              Nombre del Curso / Asignatura
            </label>
            <input
              type="text"
              value={draftMeta.nombreCurso}
              onChange={(e) => {
                const val = e.target.value;
                updateDraftAndAutoSave((prev) => ({ ...prev, nombreCurso: val }));
              }}
              placeholder="Ej. Mapeo de Mercado y Comportamiento del Consumidor"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-700">
              Código / Prefijo del Curso (4 Caracteres)
            </label>
            <input
              type="text"
              maxLength={6}
              value={draftMeta.codigoCurso}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                updateDraftAndAutoSave((prev) => ({
                  ...prev,
                  codigoCurso: val
                }));
              }}
              placeholder="Ej. MM26"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm text-indigo-700 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-700">
              Programa Académico / Facultad
            </label>
            <input
              type="text"
              value={draftMeta.programaAcademico}
              onChange={(e) => {
                const val = e.target.value;
                updateDraftAndAutoSave((prev) => ({ ...prev, programaAcademico: val }));
              }}
              placeholder="Ej. Técnico Profesional en Marketing Digital"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-700">
              Institución / Sede / Ciudad
            </label>
            <input
              type="text"
              value={draftMeta.institucionSede}
              onChange={(e) => {
                const val = e.target.value;
                updateDraftAndAutoSave((prev) => ({ ...prev, institucionSede: val }));
              }}
              placeholder="Ej. La Dorada, Caldas (Colombia)"
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Periodo / Semestre</label>
              <input
                type="text"
                value={draftMeta.periodoAcademico}
                onChange={(e) => {
                  const val = e.target.value;
                  updateDraftAndAutoSave((prev) => ({ ...prev, periodoAcademico: val }));
                }}
                placeholder="Ej. 2026-1"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">Docente Titular</label>
              <input
                type="text"
                value={draftMeta.docenteResponsable}
                onChange={(e) => {
                  const val = e.target.value;
                  updateDraftAndAutoSave((prev) => ({ ...prev, docenteResponsable: val }));
                }}
                placeholder="Nombre del Docente"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1">
            <label className="block font-bold text-slate-700">
              Descripción General / Competencia del Curso
            </label>
            <input
              type="text"
              value={draftMeta.descripcionGeneral}
              onChange={(e) => {
                const val = e.target.value;
                updateDraftAndAutoSave((prev) => ({ ...prev, descripcionGeneral: val }));
              }}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800"
            />
          </div>

          {/* Ponderación Porcentual Global del Curso (Teoría / Exámenes vs Proyecto ABPro) */}
          <div className="lg:col-span-3 p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="font-bold text-indigo-950 text-xs sm:text-sm">
                Ponderación Porcentual Global del Curso (Nota Definitiva Consolidada)
              </div>
              <p className="text-[11px] text-indigo-900">
                Defina el peso porcentual entre Exámenes Teóricos + Retos ({config.ponderacionTeoriaPct ?? 60}%) y el Proyecto Aplicado ABPro ({100 - (config.ponderacionTeoriaPct ?? 60)}%). Se guarda automáticamente en el servidor.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <label className="flex items-center gap-1.5 font-semibold text-slate-800">
                <span>Teoría y Exámenes (%):</span>
                <input
                  type="number"
                  min={10}
                  max={90}
                  step={5}
                  value={config.ponderacionTeoriaPct ?? 60}
                  onChange={(e) => {
                    const nextTeoria = Math.max(
                      10,
                      Math.min(90, parseInt(e.target.value, 10) || 60)
                    );
                    handleSaveActiveCourseMeta(draftMeta, {
                      silentNotice: true,
                      customTeoriaPct: nextTeoria
                    });
                  }}
                  className="w-18 px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white font-mono font-bold text-center text-indigo-900"
                />
              </label>
              <span className="font-mono font-bold text-slate-700">
                + Proyecto ABPro: {100 - (config.ponderacionTeoriaPct ?? 60)}% = 100%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* SECCIÓN 2: CANTIDAD DE MÓDULOS, PONDERACIÓN (10%/15%/35%/40%), EXÁMENES/RETOS Y DOCS  */}
      {/* ===================================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                2. Configuración por Módulo ({draftMeta.cantidadModulos} Módulos): Exámenes, Retos, Ponderación y Enlaces de Documentos
              </h3>
              <p className="text-xs text-slate-500">
                En cada módulo indique su nombre, cantidad de exámenes (default: 1), cantidad de retos (default: 2), distribución de ponderación (Comportamiento 10%, Sustentación/Participación 15%, Examen 35%, Trabajo 40%) y enlaces de documentos descargables para el estudiante.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-slate-700">Cantidad de Módulos:</label>
            <select
              value={draftMeta.cantidadModulos}
              onChange={(e) => handleChangeModulesCount(parseInt(e.target.value, 10) || 6)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono font-bold text-slate-900 cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'Módulo' : 'Módulos'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleChangeModulesCount(Math.min(12, draftMeta.cantidadModulos + 1))}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold cursor-pointer"
            >
              + Agregar Módulo
            </button>
            {draftMeta.cantidadModulos > 1 && (
              <button
                type="button"
                onClick={() => handleChangeModulesCount(Math.max(1, draftMeta.cantidadModulos - 1))}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                - Quitar Módulo
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveActiveCourseMeta()}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
            >
              Guardar Configuración de Módulos
            </button>
          </div>
        </div>

        {/* Barra Rápida de Ponderación Porcentual de Calificaciones (Comportamiento, Participación, Examen, Trabajo) para todos los módulos */}
        {(() => {
          const firstModWeights =
            draftMeta.modulosCurso[0]?.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS;
          const globalSum =
            (Number(firstModWeights.comportamientoPct) || 0) +
            (Number(firstModWeights.participacionPct) || 0) +
            (Number(firstModWeights.examenPct) || 0) +
            (Number(firstModWeights.trabajoPct) || 0);
          return (
            <div className="p-4 rounded-xl bg-slate-50 border border-indigo-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span>
                    Ponderación Porcentual de Calificaciones en Todos los Módulos (Comportamiento, Participación, Examen, Trabajo)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] tabular-nums ${
                      globalSum === 100
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    Total: {globalSum}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Ajuste aquí los porcentajes para aplicarlos simultáneamente a los {draftMeta.cantidadModulos} módulos o personalícelos módulo por módulo en las tarjetas inferiores.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {(
                  [
                    { key: 'comportamientoPct' as const, label: 'Comportamiento (%)' },
                    { key: 'participacionPct' as const, label: 'Participación (%)' },
                    { key: 'examenPct' as const, label: 'Examen (%)' },
                    { key: 'trabajoPct' as const, label: 'Trabajo (%)' }
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                  >
                    <span className="font-semibold text-slate-700">{item.label}:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={firstModWeights[item.key]}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          modulosCurso: prev.modulosCurso.map((m) => ({
                            ...m,
                            ponderacion: {
                              ...(m.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS),
                              [item.key]: val
                            }
                          }))
                        }));
                      }}
                      className="w-14 px-1.5 py-0.5 rounded border border-indigo-300 font-mono font-bold text-center text-indigo-950 tabular-nums"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    updateDraftAndAutoSave(
                      (prev) => ({
                        ...prev,
                        modulosCurso: prev.modulosCurso.map((m) => ({
                          ...m,
                          ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS }
                        }))
                      }),
                      true
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                >
                  Restaurar 10/15/35/40%
                </button>
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {draftMeta.modulosCurso.map((mod, idx) => {
            const w = mod.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS;
            const totalPct =
              (Number(w.comportamientoPct) || 0) +
              (Number(w.participacionPct) || 0) +
              (Number(w.examenPct) || 0) +
              (Number(w.trabajoPct) || 0);
            const rawText =
              typeof mod.enlacesTextoRaw === 'string'
                ? mod.enlacesTextoRaw
                : formatStructuredDocumentLinksToRaw(mod.documentosEnlaces);
            const previewDocs = parseRawDocumentLinksToStructured(
              rawText,
              mod.id,
              mod.shortTitle
            );

            return (
              <div
                key={mod.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-sky-700 text-white font-mono font-bold text-xs">
                      Módulo #{mod.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-500">Código:</label>
                    <input
                      type="text"
                      value={mod.code}
                      maxLength={5}
                      onChange={(e) => {
                        const codeVal = e.target.value.toUpperCase();
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          modulosCurso: prev.modulosCurso.map((m, i) =>
                            i === idx ? { ...m, code: codeVal } : m
                          )
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono font-bold text-center text-xs"
                      title="Código corto del módulo/clase (ej. C1, M1)"
                    />
                  </div>
                </div>

                {/* Nombre del Módulo */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-800">
                    Nombre del Módulo {mod.id}:
                  </label>
                  <input
                    type="text"
                    value={mod.shortTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateDraftAndAutoSave((prev) => ({
                        ...prev,
                        modulosCurso: prev.modulosCurso.map((m, i) =>
                          i === idx
                            ? {
                                ...m,
                                shortTitle: val,
                                fullTitle: `Clase ${mod.id} / Módulo ${mod.id}: ${val}`
                              }
                            : m
                        )
                      }));
                    }}
                    placeholder={`Nombre del Módulo ${mod.id}`}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                  />
                </div>

                {/* Cantidad de Exámenes (default 1) y Cantidad de Retos (default 2) de este Módulo */}
                <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                      Cantidad de Exámenes del Módulo (Default: 1)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={mod.examenesCount ?? 1}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(5, parseInt(e.target.value, 10) || 0));
                        updateDraftAndAutoSave((prev) => {
                          const nextModules = prev.modulosCurso.map((m, i) =>
                            i === idx ? { ...m, examenesCount: val } : m
                          );
                          const isIntegralEnabled = prev.habilitarExamenIntegral !== false;
                          const sumExams = nextModules.reduce(
                            (acc, m) => acc + (typeof m.examenesCount === 'number' ? m.examenesCount : 1),
                            0
                          ) + (isIntegralEnabled ? 1 : 0);
                          const nextExams = prev.examenesCurso.map((ex, exIdx) => {
                            if (ex.id === 'integral') return { ...ex, activo: isIntegralEnabled };
                            if (exIdx - 1 === idx) return { ...ex, activo: val > 0 };
                            return ex;
                          });
                          return {
                            ...prev,
                            cantidadExamenes: Math.max(0, sumExams),
                            modulosCurso: nextModules,
                            examenesCurso: nextExams
                          };
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50/40 font-mono font-bold text-slate-900 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Cantidad de Retos del Módulo (Default: 2)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={mod.retosCount ?? 2}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0));
                        updateDraftAndAutoSave((prev) => {
                          const nextModules = prev.modulosCurso.map((m, i) =>
                            i === idx ? { ...m, retosCount: val } : m
                          );
                          const sumRetos = nextModules.reduce(
                            (acc, m) => acc + (Number(m.retosCount) ?? 2),
                            0
                          );
                          return {
                            ...prev,
                            cantidadRetos: Math.max(1, sumRetos),
                            modulosCurso: nextModules
                          };
                        });
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 font-mono font-bold text-slate-900 tabular-nums"
                    />
                  </div>
                </div>

                {/* Distribución de Ponderación del Módulo (Default: 10% Comportamiento, 15% Sustentación/Participación, 35% Examen, 40% Trabajo) */}
                <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-indigo-950">
                      Ponderación Porcentual del Módulo {mod.id}:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] tabular-nums ${
                          totalPct === 100
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        Suma: {totalPct}%
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          updateDraftAndAutoSave(
                            (prev) => ({
                              ...prev,
                              modulosCurso: prev.modulosCurso.map((m, i) =>
                                i === idx
                                  ? { ...m, ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS } }
                                  : m
                              )
                            }),
                            true
                          );
                        }}
                        className="px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-[10px] font-semibold text-slate-700 cursor-pointer"
                        title="Restablecer a 10% Comportamiento, 15% Sustentación/Participación, 35% Examen, 40% Trabajo"
                      >
                        Default 10/15/35/40%
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateDraftAndAutoSave(
                            (prev) => ({
                              ...prev,
                              modulosCurso: prev.modulosCurso.map((m) => ({
                                ...m,
                                ponderacion: { ...w }
                              }))
                            }),
                            true
                          );
                          showNotice(
                            `✓ Ponderación (${w.comportamientoPct}% / ${w.participacionPct}% / ${w.examenPct}% / ${w.trabajoPct}%) aplicada en todos los módulos y guardada en el servidor.`
                          );
                        }}
                        className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-semibold cursor-pointer"
                        title="Aplicar estos porcentajes a todos los módulos del curso"
                      >
                        Aplicar a todos
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Comportamiento (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.comportamientoPct}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                          updateDraftAndAutoSave((prev) => ({
                            ...prev,
                            modulosCurso: prev.modulosCurso.map((m, i) =>
                              i === idx
                                ? { ...m, ponderacion: { ...w, comportamientoPct: val } }
                                : m
                            )
                          }));
                        }}
                        className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center text-slate-900 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Sustent./Particip. (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.participacionPct}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                          updateDraftAndAutoSave((prev) => ({
                            ...prev,
                            modulosCurso: prev.modulosCurso.map((m, i) =>
                              i === idx
                                ? { ...m, ponderacion: { ...w, participacionPct: val } }
                                : m
                            )
                          }));
                        }}
                        className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center text-slate-900 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Examen (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.examenPct}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                          updateDraftAndAutoSave((prev) => ({
                            ...prev,
                            modulosCurso: prev.modulosCurso.map((m, i) =>
                              i === idx ? { ...m, ponderacion: { ...w, examenPct: val } } : m
                            )
                          }));
                        }}
                        className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center text-slate-900 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600">
                        Trabajo (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={w.trabajoPct}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                          updateDraftAndAutoSave((prev) => ({
                            ...prev,
                            modulosCurso: prev.modulosCurso.map((m, i) =>
                              i === idx ? { ...m, ponderacion: { ...w, trabajoPct: val } } : m
                            )
                          }));
                        }}
                        className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center text-slate-900 tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Gestor Dinámico de Enlaces a Documentos de Apoyo por Módulo */}
                <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-sky-950">
                      Enlaces a Documentos de Apoyo · Módulo {mod.id} (Visibles en Portal Estudiante):
                    </label>
                    <span className="font-mono font-bold text-[10px] text-sky-900 tabular-nums">
                      {previewDocs.length} doc(s)
                    </span>
                  </div>

                  {/* Formulario rápido para añadir un documento de apoyo estructurado */}
                  {(() => {
                    const docDraft = newDocInputsByModule[mod.id] || {
                      titulo: '',
                      url: '',
                      tipo: 'PDF'
                    };
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 bg-white p-2 rounded-lg border border-sky-200">
                        <input
                          type="text"
                          value={docDraft.titulo}
                          onChange={(e) =>
                            setNewDocInputsByModule((prev) => ({
                              ...prev,
                              [mod.id]: { ...docDraft, titulo: e.target.value }
                            }))
                          }
                          placeholder={`Título (ej. Guía Módulo ${mod.id})`}
                          className="sm:col-span-4 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-900"
                        />
                        <input
                          type="text"
                          value={docDraft.url}
                          onChange={(e) =>
                            setNewDocInputsByModule((prev) => ({
                              ...prev,
                              [mod.id]: { ...docDraft, url: e.target.value }
                            }))
                          }
                          placeholder="https://drive.google.com/..."
                          className="sm:col-span-5 px-2 py-1 rounded border border-slate-200 text-[11px] font-mono text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const cleanUrl = docDraft.url.trim();
                            if (!cleanUrl) return;
                            const formattedUrl =
                              !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('/')
                                ? `https://${cleanUrl}`
                                : cleanUrl;
                            const cleanTitle =
                              docDraft.titulo.trim() ||
                              `Documento ${previewDocs.length + 1} · ${mod.shortTitle}`;
                            const newLine = `${cleanTitle} | ${formattedUrl}`;
                            const nextRaw = rawText.trim()
                              ? `${rawText.trim()}\n${newLine}`
                              : newLine;
                            const parsedLinks = parseRawDocumentLinksToStructured(
                              nextRaw,
                              mod.id,
                              mod.shortTitle
                            );
                            updateDraftAndAutoSave(
                              (prev) => ({
                                ...prev,
                                modulosCurso: prev.modulosCurso.map((m, i) =>
                                  i === idx
                                    ? {
                                        ...m,
                                        enlacesTextoRaw: nextRaw,
                                        documentosEnlaces: parsedLinks
                                      }
                                    : m
                                )
                              }),
                              true
                            );
                            setNewDocInputsByModule((prev) => ({
                              ...prev,
                              [mod.id]: { titulo: '', url: '', tipo: 'PDF' }
                            }));
                          }}
                          className="sm:col-span-3 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                        >
                          + Añadir Enlace
                        </button>
                      </div>
                    );
                  })()}

                  <textarea
                    rows={2}
                    value={rawText}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsedLinks = parseRawDocumentLinksToStructured(
                        val,
                        mod.id,
                        mod.shortTitle
                      );
                      updateDraftAndAutoSave((prev) => ({
                        ...prev,
                        modulosCurso: prev.modulosCurso.map((m, i) =>
                          i === idx
                            ? {
                                ...m,
                                enlacesTextoRaw: val,
                                documentosEnlaces: parsedLinks
                              }
                            : m
                        )
                      }));
                    }}
                    placeholder={`O pegue enlaces directamente (uno por línea). Ej:\nGuía de Estudio Módulo ${mod.id} | https://drive.google.com/...\nhttps://ejemplo.edu/presentacion-modulo-${mod.id}.pdf`}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-sky-300 bg-white text-[11px] font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />

                  {previewDocs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {previewDocs.map((doc, docIdx) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-sky-200 text-[11px]"
                        >
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sky-800 hover:underline font-semibold min-w-0 flex-1"
                          >
                            <Download className="w-3 h-3 shrink-0" />
                            <span className="truncate">{doc.titulo}</span>
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                              ({doc.url})
                            </span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = previewDocs.filter((_, i) => i !== docIdx);
                              const nextRaw = formatStructuredDocumentLinksToRaw(remaining);
                              updateDraftAndAutoSave(
                                (prev) => ({
                                  ...prev,
                                  modulosCurso: prev.modulosCurso.map((m, i) =>
                                    i === idx
                                      ? {
                                          ...m,
                                          enlacesTextoRaw: nextRaw,
                                          documentosEnlaces: remaining
                                        }
                                      : m
                                  )
                                }),
                                true
                              );
                            }}
                            className="text-red-600 hover:text-red-800 font-bold px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer shrink-0"
                            title="Eliminar documento de apoyo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500">
                      Subtítulo / Descripción Temática
                    </label>
                    <input
                      type="text"
                      value={mod.description || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          modulosCurso: prev.modulosCurso.map((m, i) =>
                            i === idx ? { ...m, description: val } : m
                          )
                        }));
                      }}
                      placeholder="Temas clave del módulo..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500">
                      Nombre de Insignia / Reto del Módulo
                    </label>
                    <input
                      type="text"
                      value={mod.retoBadgeTitle || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          modulosCurso: prev.modulosCurso.map((m, i) =>
                            i === idx ? { ...m, retoBadgeTitle: val } : m
                          )
                        }));
                      }}
                      placeholder={`Insignia Módulo ${mod.id}`}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* SECCIÓN 3: EXÁMENES DEL CURSO (EXAMEN INTEGRAL FINAL + EXÁMENES POR MÓDULO) y RETOS   */}
      {/* ===================================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Configuración de Exámenes y Opción de Examen Integral Final */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <FileCheck2 className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  3. Configuración de Exámenes ({draftMeta.cantidadExamenes} Activos) y Examen Integral Final
                </h3>
                <p className="text-xs text-slate-500">
                  Habilite o deshabilite el Examen Integral Final (fuera de los módulos) y personalice las preguntas, minutos e intentos de cada evaluación.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSyncExamTitlesWithModules}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold cursor-pointer"
              >
                ↻ Sincronizar con Nombres de Módulos
              </button>
            </div>
          </div>

          {/* Tarjeta Destacada: Habilitar Examen Integral Final (Fuera de los Módulos) con Suma Automática */}
          <div className="p-4 rounded-xl bg-purple-50/80 border border-purple-200 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="chkHabilitarExamenIntegralCursoActivo"
                  checked={draftMeta.habilitarExamenIntegral !== false}
                  onChange={(e) => handleToggleIntegralExam(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-purple-300 text-purple-700 cursor-pointer"
                />
                <div>
                  <label
                    htmlFor="chkHabilitarExamenIntegralCursoActivo"
                    className="text-xs sm:text-sm font-bold text-purple-950 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🎓 Habilitar Examen Integral Final (Fuera de los Módulos · Prueba Integradora Única)</span>
                  </label>
                  <p className="text-[11px] text-purple-900 mt-0.5 leading-relaxed">
                    Este examen está por fuera de los módulos individuales y <strong>suma automáticamente las preguntas seleccionadas de todos los módulos anteriores (Módulo 1 al Módulo {draftMeta.cantidadModulos})</strong> para generar una prueba integradora única al finalizar el curso.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-1 rounded-lg bg-purple-900 text-white text-[11px] font-mono font-bold">
                  Suma Automática: {activeCourseIntegralAutoSum.totalQuestions} Preguntas
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold shrink-0 ${
                    draftMeta.habilitarExamenIntegral !== false
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {draftMeta.habilitarExamenIntegral !== false ? 'HABILITADO' : 'DESHABILITADO'}
                </span>
              </div>
            </div>

            {draftMeta.habilitarExamenIntegral !== false && (
              <div className="bg-white border border-purple-200 rounded-xl p-3.5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-2">
                  <div>
                    <div className="font-bold text-purple-950">
                      Suma Automática de Preguntas Seleccionadas por Módulo (Módulo 1 al {draftMeta.cantidadModulos})
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Defina o seleccione las preguntas de cada módulo que integran la prueba final única. La suma total ({activeCourseIntegralAutoSum.totalQuestions} preguntas) actualiza automáticamente el Examen Integral Final.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateDraftAndAutoSave((prev) => {
                          const nextMods = prev.modulosCurso.map((m) => {
                            const modBank = questions.filter((q) => Number(q.modulo) === Number(m.id));
                            return {
                              ...m,
                              preguntasParaIntegralCount: modBank.length > 0 ? modBank.length : 8,
                              preguntasSeleccionadasIntegralIds: modBank.map((q) => q.id)
                            };
                          });
                          const autoSum = computeIntegralExamAutoSumFromModules(nextMods, questions);
                          const nextExams = prev.examenesCurso.map((ex) =>
                            ex.id === 'integral'
                              ? {
                                  ...ex,
                                  questionsCount: autoSum.totalQuestions,
                                  subtitle: `${autoSum.totalQuestions} preguntas integradoras (M1 a M${prev.cantidadModulos}) • ${ex.durationMinutes} minutos`,
                                  badge: `Evaluación Integral Final · ${autoSum.totalQuestions} Reactivos · ${ex.durationMinutes} Min`
                                }
                              : ex
                          );
                          return {
                            ...prev,
                            modulosCurso: nextMods,
                            examenesCurso: nextExams
                          };
                        }, true);
                        showNotice(
                          '✓ Se seleccionaron y sumaron automáticamente todas las preguntas disponibles de todos los módulos para el Examen Integral Final.'
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-950 text-[11px] font-bold cursor-pointer"
                    >
                      Sumar Todo el Banco (M1–M{draftMeta.cantidadModulos})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {activeCourseIntegralAutoSum.perModuleBreakdown.map((item, mIdx) => {
                    const modObj = draftMeta.modulosCurso[mIdx];
                    const modQuestionsInBank = questions.filter(
                      (q) => Number(q.modulo) === Number(item.moduleId)
                    );
                    const isExpanded = expandedIntegralQuestionSelectorMod === item.moduleId;
                    const explicitIds = modObj?.preguntasSeleccionadasIntegralIds || [];

                    return (
                      <div
                        key={item.moduleId}
                        className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/40 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-[11px] text-purple-900">
                              Módulo {item.moduleId} ({item.moduleCode})
                            </span>
                            <div className="text-[11px] font-bold text-slate-800 truncate">
                              {item.moduleTitle}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={item.selectedCount}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                handleUpdateModuleIntegralContribution(mIdx, val, []);
                              }}
                              className="w-14 px-1.5 py-1 rounded border border-purple-300 bg-white font-mono font-bold text-center text-purple-950"
                              title="Cantidad de preguntas de este módulo que se suman al Examen Integral Final"
                            />
                            <span className="text-[10px] font-mono text-slate-500">preg.</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-600">
                          <span>En banco: {item.availableInBankCount} ítems</span>
                          {modQuestionsInBank.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedIntegralQuestionSelectorMod(
                                  isExpanded ? null : item.moduleId
                                )
                              }
                              className="font-bold text-purple-800 hover:underline cursor-pointer"
                            >
                              {isExpanded
                                ? 'Ocultar selección ▲'
                                : `Elegir preguntas (${
                                    explicitIds.length > 0 ? explicitIds.length : item.selectedCount
                                  }) ▼`}
                            </button>
                          )}
                        </div>

                        {isExpanded && modQuestionsInBank.length > 0 && (
                          <div className="max-h-36 overflow-y-auto bg-white border border-purple-200 rounded-lg p-2 space-y-1 text-[10px]">
                            {modQuestionsInBank.map((qItem) => {
                              const isChecked =
                                explicitIds.length > 0
                                  ? explicitIds.includes(qItem.id)
                                  : modQuestionsInBank
                                      .slice(0, item.selectedCount)
                                      .some((x) => x.id === qItem.id);
                              return (
                                <label
                                  key={qItem.id}
                                  className="flex items-start gap-1.5 cursor-pointer hover:bg-purple-50 p-1 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const baseIds =
                                        explicitIds.length > 0
                                          ? explicitIds
                                          : modQuestionsInBank
                                              .slice(0, item.selectedCount)
                                              .map((x) => x.id);
                                      const nextIds = e.target.checked
                                        ? Array.from(new Set([...baseIds, qItem.id]))
                                        : baseIds.filter((id) => id !== qItem.id);
                                      handleUpdateModuleIntegralContribution(
                                        mIdx,
                                        nextIds.length,
                                        nextIds
                                      );
                                    }}
                                    className="mt-0.5 rounded border-purple-300"
                                  />
                                  <span className="truncate text-slate-800">
                                    <strong>{qItem.id}:</strong> {qItem.enunciado}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="px-3 py-2 rounded-lg bg-purple-900 text-white text-[11px] font-mono flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Fórmula Integradora:{' '}
                    {activeCourseIntegralAutoSum.perModuleBreakdown
                      .map((b) => `M${b.moduleId}(${b.selectedCount})`)
                      .join(' + ')}
                  </span>
                  <span className="font-extrabold text-emerald-300">
                    = {activeCourseIntegralAutoSum.totalQuestions} Preguntas en Prueba Integradora Final
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            {draftMeta.examenesCurso.map((ex, idx) => (
              <div
                key={ex.id}
                className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  ex.activo
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2.5 flex-1">
                  <input
                    type="checkbox"
                    checked={ex.activo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      updateDraftAndAutoSave(
                        (prev) => {
                          const nextExams = prev.examenesCurso.map((item, i) =>
                            i === idx ? { ...item, activo: checked } : item
                          );
                          const activeCount = nextExams.filter((item) => item.activo).length;
                          return {
                            ...prev,
                            cantidadExamenes: Math.max(1, activeCount),
                            examenesCurso: nextExams
                          };
                        },
                        true
                      );
                    }}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={ex.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateDraftAndAutoSave((prev) => ({
                        ...prev,
                        examenesCurso: prev.examenesCurso.map((item, i) =>
                          i === idx ? { ...item, title: val } : item
                        )
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <span>Preguntas:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={ex.questionsCount}
                      onChange={(e) => {
                        const qCount = Math.max(1, parseInt(e.target.value, 10) || 10);
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          examenesCurso: prev.examenesCurso.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  questionsCount: qCount,
                                  subtitle: `${qCount} preguntas • ${item.durationMinutes} minutos`,
                                  badge: `${qCount} Reactivos · ${item.durationMinutes} Min`
                                }
                              : item
                          )
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center tabular-nums"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <span>Minutos:</span>
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={ex.durationMinutes}
                      onChange={(e) => {
                        const dMin = Math.max(5, parseInt(e.target.value, 10) || 30);
                        updateDraftAndAutoSave((prev) => ({
                          ...prev,
                          examenesCurso: prev.examenesCurso.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  durationMinutes: dMin,
                                  subtitle: `${item.questionsCount} preguntas • ${dMin} minutos`,
                                  badge: `${item.questionsCount} Reactivos · ${dMin} Min`
                                }
                              : item
                          )
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded border border-slate-300 font-mono font-bold text-center tabular-nums"
                    />
                  </label>

                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <span>Intentos:</span>
                    <select
                      value={ex.maxAttempts}
                      onChange={(e) => {
                        const mAtt = parseInt(e.target.value, 10) || 2;
                        updateDraftAndAutoSave(
                          (prev) => ({
                            ...prev,
                            examenesCurso: prev.examenesCurso.map((item, i) =>
                              i === idx ? { ...item, maxAttempts: mAtt } : item
                            )
                          }),
                          true
                        );
                      }}
                      className="px-2 py-1 rounded border border-slate-300 font-mono font-bold bg-white"
                    >
                      <option value={1}>1 Intento</option>
                      <option value={2}>2 Intentos</option>
                      <option value={3}>3 Intentos</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen y Generación de Plantillas de Mini Retos */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  4. Mini Retos e Insignias ({draftMeta.cantidadRetos} Definidos)
                </h3>
                <p className="text-xs text-slate-500">
                  La cantidad de retos se calcula según los retos definidos en cada módulo ({draftMeta.cantidadModulos} módulos).
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                <div className="font-bold text-amber-950 flex items-center justify-between">
                  <span>Total Mini Retos en Módulos:</span>
                  <span className="font-mono text-sm">{draftMeta.cantidadRetos} Retos</span>
                </div>
                <div className="font-semibold text-amber-900 flex items-center justify-between">
                  <span>Plantillas Activas en Banco:</span>
                  <span className="font-mono">{customMiniRetos.length} Plantillas</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed pt-1">
                  Puede sincronizar y generar automáticamente las plantillas de retos alineadas con los nombres de los módulos de este curso.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const generated = generateBaseRetosForCourseModules(draftMeta);
                  onUpdateCustomMiniRetos(generated);
                  showNotice(
                    `✓ Se generaron ${generated.length} plantillas de retos adaptadas a los módulos de «${draftMeta.nombreCurso}».`
                  );
                }}
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generar Retos Según Módulos del Curso</span>
              </button>
            </div>
          </div>

          {onNavigateToSection && (
            <button
              type="button"
              onClick={() => onNavigateToSection('retos_ia')}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Abrir Gestor Detallado de Retos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* SECCIÓN 5 Y 6: BASE DE DATOS DE ESTUDIANTES Y BASE DE DATOS DE PREGUNTAS DEL CURSO    */}
      {/* ===================================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 5. Base de Datos de Estudiantes del Curso */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    5. Base de Datos de Estudiantes del Curso
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nómina asignada exclusivamente a «{draftMeta.nombreCurso}»
                  </p>
                </div>
              </div>
              <span className="font-mono font-bold text-xs text-sky-800">
                {students.length} estudiantes
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Suba un archivo Excel (<code>.xlsx</code>) o <code>.csv</code> con los estudiantes de este curso (genera automáticamente sus códigos con el prefijo <code>{draftMeta.codigoCurso}</code>), o inicie una nómina limpia para el nuevo curso.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer text-center">
                <Upload className="w-4 h-4 shrink-0" />
                <span>Reemplazar Nómina con Excel / CSV</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={(e) => handleUploadCourseStudentsFile(e, 'replace')}
                  className="hidden"
                />
              </label>

              <label className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-950 font-bold flex items-center justify-center gap-2 cursor-pointer text-center">
                <Plus className="w-4 h-4 shrink-0" />
                <span>Fusionar / Agregar desde Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={(e) => handleUploadCourseStudentsFile(e, 'merge')}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  const demoOnly = [createDemoStudentForCourse(draftMeta.codigoCurso)];
                  onUpdateStudents(demoOnly);
                  if (onUpdateAcademicDataset) {
                    onUpdateAcademicDataset(buildInitialAcademicDataset(demoOnly));
                  }
                  showNotice(
                    `✓ Nómina del curso reiniciada (solo usuario DEMO con prefijo ${draftMeta.codigoCurso}).`
                  );
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
              >
                Iniciar Nómina Limpia (Solo Demo)
              </button>

              {onNavigateToSection && (
                <button
                  type="button"
                  onClick={() => onNavigateToSection('estudiantes')}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Administrar Estudiantes ({students.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 6. Base de Datos de Preguntas del Curso */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    6. Base de Datos de Preguntas del Curso
                  </h3>
                  <p className="text-xs text-slate-500">
                    Banco de reactivos asignado a «{draftMeta.nombreCurso}»
                  </p>
                </div>
              </div>
              <span className="font-mono font-bold text-xs text-emerald-800">
                {questions.length} preguntas
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Importe el banco de preguntas propio de este curso en formato <code>.json</code>, <code>.xlsx</code> o <code>.csv</code>, o genere automáticamente una base inicial adaptada a los nombres de los módulos configurados arriba.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer text-center">
                <Upload className="w-4 h-4 shrink-0" />
                <span>Cargar Preguntas (JSON / Excel / CSV)</span>
                <input
                  type="file"
                  accept=".json,.xlsx,.xls,.csv"
                  onChange={(e) => handleUploadCourseQuestionsFile(e, 'replace')}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  const generated = generateBaseQuestionsForCourseModules(draftMeta, 10);
                  onUpdateQuestions(generated);
                  showNotice(
                    `✓ Se generaron ${generated.length} preguntas base alineadas con los módulos del curso «${draftMeta.nombreCurso}».`
                  );
                }}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Generar Banco Base por Módulo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateQuestions([]);
                  showNotice('✓ Banco de preguntas del curso vaciado (0 preguntas).');
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
              >
                Vaciar Banco de este Curso (0)
              </button>

              {onNavigateToSection && (
                <button
                  type="button"
                  onClick={() => onNavigateToSection('preguntas')}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Abrir Banco de Preguntas ({questions.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================================== */}
      {/* MODAL WIZARD: CREAR NUEVO CURSO UNIVERSAL DESDE CERO                                  */}
      {/* ===================================================================================== */}
      {newCourseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-indigo-700">
                  Asistente de Creación de Curso Universal
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  Crear y Asignar un Nuevo Curso en la Plataforma
                </h3>
                <p className="text-xs text-slate-600">
                  Configure el nombre del curso, cantidad y nombres de módulos, cantidad de exámenes, retos y bases de datos iniciales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewCourseModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewCourse} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="block font-bold text-slate-700">
                    Nombre del Nuevo Curso *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="Ej. Analítica Digital y Estrategia de Contenidos"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-sm text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">
                    Código / Prefijo (4 Letras/Núm)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                    placeholder="Ej. AD26"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm uppercase text-indigo-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Programa Académico
                  </label>
                  <input
                    type="text"
                    value={newCourseProgram}
                    onChange={(e) => setNewCourseProgram(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Institución / Sede
                  </label>
                  <input
                    type="text"
                    value={newCourseInstitution}
                    onChange={(e) => setNewCourseInstitution(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Periodo Académico
                  </label>
                  <input
                    type="text"
                    value={newCoursePeriod}
                    onChange={(e) => setNewCoursePeriod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-indigo-900 mb-1">
                    Docente Asignado con Acceso
                  </label>
                  <select
                    value={newCourseAssignedTeacherId}
                    onChange={(e) => {
                      const tId = e.target.value;
                      setNewCourseAssignedTeacherId(tId);
                      const tObj = registeredTeachers.find((t) => t.id === tId);
                      setNewCourseTeacher(tObj ? tObj.nombre : '');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50/40 font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="">Seleccionar docente...</option>
                    {registeredTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Estructura de Módulos del Curso y Opción de Examen Integral Final */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block font-bold text-slate-900 text-xs sm:text-sm">
                      Definir Cantidad de Módulos del Curso:
                    </label>
                    <p className="text-[11px] text-slate-600">
                      Cada módulo tiene por defecto <strong>1 examen</strong> y <strong>2 mini retos</strong>, pudiendo cambiar la cantidad de forma independiente en cada módulo abajo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={newCourseModulesCount}
                      onChange={(e) =>
                        handleUpdateNewCourseModulesCount(parseInt(e.target.value, 10) || 6)
                      }
                      className="px-3.5 py-2 rounded-xl border border-indigo-300 bg-white font-mono font-bold text-slate-900 cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Módulo (C1)' : `Módulos (C1 a C${n})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Opción de Habilitar Examen Integral Final (Fuera de los Módulos) con Suma Automática */}
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="chkNewCourseEnableIntegral"
                      checked={newCourseEnableIntegralExam}
                      onChange={(e) => setNewCourseEnableIntegralExam(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-purple-300 text-purple-700 cursor-pointer"
                    />
                    <div>
                      <label
                        htmlFor="chkNewCourseEnableIntegral"
                        className="font-bold text-purple-950 text-xs sm:text-sm cursor-pointer block"
                      >
                        🎓 Habilitar Examen Integral Final (Fuera de los Módulos · Suma Automática M1–M{newCourseModulesCount})
                      </label>
                      <p className="text-[11px] text-purple-900 mt-0.5 leading-relaxed">
                        Suma automáticamente las preguntas seleccionadas de todos los módulos anteriores (Módulo 1 al Módulo {newCourseModulesCount}) para generar una prueba integradora única al finalizar el curso.
                      </p>
                    </div>
                  </div>

                  {newCourseEnableIntegralExam && (
                    <div className="flex items-center gap-2 shrink-0 bg-white p-2 rounded-lg border border-purple-200">
                      <div>
                        <label className="block text-[10px] font-bold text-purple-900">
                          Suma Automática Preg.
                        </label>
                        <div className="px-2.5 py-1 rounded bg-purple-100 font-mono font-extrabold text-center text-purple-950">
                          {newCourseModulesConfig
                            .slice(0, newCourseModulesCount)
                            .reduce(
                              (acc, m) =>
                                acc +
                                (typeof m?.preguntasParaIntegralCount === 'number'
                                  ? m.preguntasParaIntegralCount
                                  : 8),
                              0
                            )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-purple-900">
                          Minutos
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={240}
                          value={newCourseIntegralMinutes}
                          onChange={(e) =>
                            setNewCourseIntegralMinutes(
                              Math.max(10, Math.min(240, parseInt(e.target.value, 10) || 80))
                            )
                          }
                          className="w-16 px-2 py-1 rounded border border-purple-300 font-mono font-bold text-center text-purple-950"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Resumen dinámico calculado de Exámenes y Mini Retos */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono">
                  <span className="text-slate-600">
                    Resumen automático según configuración independiente por módulo:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-bold">
                      Exámenes de Módulos:{' '}
                      {newCourseModulesConfig
                        .slice(0, newCourseModulesCount)
                        .reduce((acc, m) => acc + (typeof m?.examenesCount === 'number' ? m.examenesCount : 1), 0)}
                      {newCourseEnableIntegralExam ? ' + 1 Examen Integral Final' : ''}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-bold">
                      Total Mini Retos:{' '}
                      {newCourseModulesConfig
                        .slice(0, newCourseModulesCount)
                        .reduce((acc, m) => acc + (typeof m?.retosCount === 'number' ? m.retosCount : 2), 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Configuración detallada por cada módulo del nuevo curso */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block font-bold text-slate-900 text-sm">
                      Configuración Detallada por Módulo ({newCourseModulesCount} Módulos):
                    </label>
                    <p className="text-[11px] text-slate-600">
                      Por cada módulo indique su nombre, cantidad de exámenes (default: 1), cantidad de retos (default: 2), ponderación (Comportamiento 10%, Sustentación/Participación 15%, Examen 35%, Trabajo 40%) y enlaces de documentos para los estudiantes.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateNewCourseModulesCount(Math.min(12, newCourseModulesCount + 1))
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs cursor-pointer"
                    >
                      + Añadir Campo de Módulo
                    </button>
                    {newCourseModulesCount > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateNewCourseModulesCount(Math.max(1, newCourseModulesCount - 1))
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        - Quitar Último
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                  {Array.from({ length: newCourseModulesCount }).map((_, idx) => {
                    const modDraft = newCourseModulesConfig[idx] || {
                      id: idx + 1,
                      code: `C${idx + 1}`,
                      shortTitle: `Módulo ${idx + 1}`,
                      fullTitle: `Clase ${idx + 1} / Módulo ${idx + 1}`,
                      examenesCount: 1,
                      retosCount: 2,
                      ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
                      enlacesTextoRaw: '',
                      documentosEnlaces: []
                    };
                    const w = modDraft.ponderacion || DEFAULT_MODULE_GRADING_WEIGHTS;
                    const sumWeights =
                      (Number(w.comportamientoPct) || 0) +
                      (Number(w.participacionPct) || 0) +
                      (Number(w.examenPct) || 0) +
                      (Number(w.trabajoPct) || 0);

                    const updateModDraft = (
                      updater: (prevMod: UniversalModuleDefinition) => UniversalModuleDefinition
                    ) => {
                      setNewCourseModulesConfig((prev) => {
                        const copy = [...prev];
                        copy[idx] = updater(
                          copy[idx] || {
                            id: idx + 1,
                            code: `C${idx + 1}`,
                            shortTitle: `Módulo ${idx + 1}`,
                            fullTitle: `Clase ${idx + 1} / Módulo ${idx + 1}`,
                            examenesCount: 1,
                            retosCount: 2,
                            ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
                            enlacesTextoRaw: '',
                            documentosEnlaces: []
                          }
                        );
                        return copy;
                      });
                    };

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3"
                      >
                        {/* Fila 1: Nombre del Módulo + Cantidad de Exámenes (default 1) + Cantidad de Retos (default 2) + Preguntas para Examen Integral */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-bold text-slate-800 mb-1">
                              Módulo #{idx + 1} · Nombre del Módulo:
                            </label>
                            <input
                              type="text"
                              value={modDraft.shortTitle || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateModDraft((m) => ({
                                  ...m,
                                  shortTitle: val,
                                  fullTitle: `Clase ${idx + 1} / Módulo ${idx + 1}: ${val}`
                                }));
                              }}
                              placeholder={`Nombre del Módulo ${idx + 1}`}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                              Exámenes (Def: 1)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={modDraft.examenesCount ?? 1}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Math.min(5, parseInt(e.target.value, 10) || 0)
                                );
                                updateModDraft((m) => ({ ...m, examenesCount: val }));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50/40 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-bold text-amber-900 mb-1">
                              Retos (Def: 2)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={modDraft.retosCount ?? 2}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Math.min(10, parseInt(e.target.value, 10) || 0)
                                );
                                updateModDraft((m) => ({ ...m, retosCount: val }));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 font-mono font-bold text-center"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-bold text-purple-900 mb-1">
                              Preg. Integral (Suma)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={modDraft.preguntasParaIntegralCount ?? 8}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Math.min(50, parseInt(e.target.value, 10) || 0)
                                );
                                updateModDraft((m) => ({
                                  ...m,
                                  preguntasParaIntegralCount: val
                                }));
                              }}
                              className="w-full px-2 py-1.5 rounded-lg border border-purple-300 bg-purple-50/40 font-mono font-bold text-center text-purple-950"
                              title="Preguntas de este módulo que se suman automáticamente al Examen Integral Final"
                            />
                          </div>
                        </div>

                        {/* Fila 2: Distribución de Ponderación del Módulo (Default: 10% Comportamiento, 15% Sustentación/Participación, 35% Examen, 40% Trabajo) */}
                        <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-200 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-indigo-950">
                              Distribución de Ponderación del Módulo #{idx + 1} (Default: 10% / 15% / 35% / 40% · Modificable):
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                  sumWeights === 100
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                Total: {sumWeights}%
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateModDraft((m) => ({
                                    ...m,
                                    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS }
                                  }))
                                }
                                className="px-2 py-0.5 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-700 cursor-pointer"
                              >
                                Default 10/15/35/40%
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700">
                                Comportamiento (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={w.comportamientoPct}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(100, parseInt(e.target.value, 10) || 0)
                                  );
                                  updateModDraft((m) => ({
                                    ...m,
                                    ponderacion: { ...w, comportamientoPct: val }
                                  }));
                                }}
                                className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700">
                                Sustent./Particip. (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={w.participacionPct}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(100, parseInt(e.target.value, 10) || 0)
                                  );
                                  updateModDraft((m) => ({
                                    ...m,
                                    ponderacion: { ...w, participacionPct: val }
                                  }));
                                }}
                                className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700">
                                Examen (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={w.examenPct}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(100, parseInt(e.target.value, 10) || 0)
                                  );
                                  updateModDraft((m) => ({
                                    ...m,
                                    ponderacion: { ...w, examenPct: val }
                                  }));
                                }}
                                className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-center"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-700">
                                Trabajo (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={w.trabajoPct}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(100, parseInt(e.target.value, 10) || 0)
                                  );
                                  updateModDraft((m) => ({
                                    ...m,
                                    ponderacion: { ...w, trabajoPct: val }
                                  }));
                                }}
                                className="w-full mt-0.5 px-2 py-1 rounded border border-slate-300 bg-white font-mono font-bold text-center"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Fila 3: Espacio para pegar los enlaces de documentos descargables de este módulo */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-bold text-sky-900">
                            📎 Espacio para pegar enlaces de documentos del Módulo #{idx + 1} (Acceso y descarga para estudiantes):
                          </label>
                          <textarea
                            rows={2}
                            value={modDraft.enlacesTextoRaw || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateModDraft((m) => ({
                                ...m,
                                enlacesTextoRaw: val
                              }));
                            }}
                            placeholder={`Pegue aquí los enlaces de documentos de este módulo (uno por línea). Ej:\nGuía Módulo ${idx + 1} | https://drive.google.com/...\nhttps://ejemplo.edu/material-modulo-${idx + 1}.pdf`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-sky-300 bg-sky-50/40 font-mono text-[11px] text-slate-900"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inicialización de Bases de Datos (Estudiantes y Preguntas) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200">
                <div>
                  <label className="block font-bold text-indigo-950 mb-1">
                    Base de Datos Inicial de Estudiantes:
                  </label>
                  <select
                    value={newCourseStudentsInitMode}
                    onChange={(e) => setNewCourseStudentsInitMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-white font-semibold"
                  >
                    <option value="empty_demo">
                      Iniciar Nómina Limpia (para subir Excel propio)
                    </option>
                    <option value="clone_current">
                      Copiar Nómina de Estudiantes del Curso Actual ({students.length})
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-indigo-950 mb-1">
                    Base de Datos Inicial de Preguntas:
                  </label>
                  <select
                    value={newCourseQuestionsInitMode}
                    onChange={(e) => setNewCourseQuestionsInitMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-white font-semibold"
                  >
                    <option value="auto_generate">
                      Generar Preguntas Base para los Módulos del Nuevo Curso
                    </option>
                    <option value="empty">
                      Iniciar Banco en Blanco (para subir JSON/Excel o usar IA)
                    </option>
                    <option value="clone_current">
                      Clonar Banco de Preguntas del Curso Actual ({questions.length})
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setNewCourseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shadow-xs"
                >
                  ✓ Crear y Activar Nuevo Curso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
