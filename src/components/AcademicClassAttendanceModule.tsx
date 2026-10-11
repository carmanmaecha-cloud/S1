import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  StudentRecord,
  ExamAttemptResult
} from '../types';
import {
  AcademicDataset,
  ActiveClassOpeningConfig,
  ClassSessionId,
  ClassSessionDefinition,
  OFFICIAL_CLASS_SESSIONS,
  DEFAULT_CLASS_GRADING_WEIGHTS,
  RecurringScheduleBlockRule,
  StudentAcademicRecord,
  StudentClassSessionRecord,
  clampGrade05,
  computeClassSessionFinalGrade,
  computeStudentAcademicSummary,
  createDefaultStudentAcademicRecord,
  getDefaultRecurringScheduleBlocks,
  normalizeAndSyncAcademicDataset,
  ComputedStudentAcademicSummary
} from '../data/classAttendanceAndGrades';
import { generateDeterministicAccessCode } from '../data/students';
import { downloadExcelFile } from '../utils/excelParser';
import { OptionServerSaveBar } from './ServerSaveContext';
import { AcademicSummaryDashboard } from './AcademicSummaryDashboard';
import {
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  UserPlus,
  Trash2,
  Edit3,
  Eye,
  Sparkles,
  Calendar,
  BookOpen,
  TrendingDown,
  ShieldAlert,
  FileSpreadsheet,
  Check,
  X,
  RotateCcw,
  ArrowRight,
  BarChart3,
  RefreshCw
} from 'lucide-react';

interface AcademicClassAttendanceManagerProps {
  dataset: AcademicDataset;
  students: StudentRecord[];
  attempts: ExamAttemptResult[];
  courseModules?: {
    id: number;
    code?: string;
    shortTitle?: string;
    fullTitle?: string;
    description?: string;
    observacion?: string;
    temasModulo?: string[];
    examenesCount?: number;
    retosCount?: number;
    ponderacion?: {
      comportamientoPct: number;
      participacionPct: number;
      examenPct: number;
      trabajoPct: number;
    };
    asistenciaBloqueA?: string | boolean;
    asistenciaBloqueB?: string | boolean;
    documentosEnlaces?: { id: string; titulo: string; url: string; tipo?: string }[];
  }[];
  courseName?: string;
  onUpdateDataset: (
    nextDataset: AcademicDataset,
    options?: {
      syncNewStudentToRoster?: StudentRecord;
      removeStudentFromRosterId?: string;
    }
  ) => void;
  externalSubView?: ModuleViewTab;
  onChangeExternalSubView?: (view: ModuleViewTab) => void;
  onRenderExamsSubView?: () => React.ReactNode;
}

export type ModuleViewTab =
  | 'vista1_consolidado'
  | 'vista2_por_clase'
  | 'vista_editor_notas'
  | 'vista_otras_zonas'
  | 'vista3_ausentismo'
  | 'vista4_ia'
  | 'vista5_examenes';
type QuickFilterType = 'todos' | 'aprobados' | 'en_riesgo' | 'fallas_criticas';
type TeacherQuickToolCard =
  | 'calificacion_manual'
  | 'llamado_asistencia'
  | 'exportar_informes'
  | 'none';

function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join(
      '\r\n'
    );
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function AcademicClassAttendanceManager({
  dataset,
  students,
  attempts,
  courseModules,
  courseName,
  onUpdateDataset,
  externalSubView,
  onChangeExternalSubView,
  onRenderExamsSubView
}: AcademicClassAttendanceManagerProps) {
  const [internalSubView, setInternalSubView] = useState<ModuleViewTab>('vista2_por_clase');
  const activeSubView = externalSubView ?? internalSubView;
  const setActiveSubView = (nextView: ModuleViewTab) => {
    setInternalSubView(nextView);
    if (onChangeExternalSubView) {
      onChangeExternalSubView(nextView);
    }
  };
  const handleSwitchView = (nextView: ModuleViewTab) => {
    setActiveSubView(nextView);
    if (nextView === 'vista_editor_notas') {
      if (selectedStudentIds.length > 0) {
        setQuickClassScope('selected');
        setQuickClassIndividualId(selectedStudentIds[0]);
      }
    }
  };
  const [groupedZoneSubTab, setGroupedZoneSubTab] = useState<
    | 'ausentismo'
    | 'competencias_ia'
    | 'examenes_oficiales'
    | 'exportacion_nomina'
    | 'herramientas'
    | 'examenes'
    | 'ia'
  >('ausentismo');
  const [activeToolCard, setActiveToolCard] = useState<TeacherQuickToolCard>('none');
  const [showCompetencySummaryInVista1, setShowCompetencySummaryInVista1] = useState(false);
  const [showConsolidatedCharts, setShowConsolidatedCharts] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<ClassSessionId>(1);
  const [classDisplayMode, setClassDisplayMode] = useState<'single' | 'all_ordered'>('single');
  const [cumulativeCutoffMode, setCumulativeCutoffMode] = useState<'auto_graded' | 'all_6' | ClassSessionId>('auto_graded');
  const [excelSectionFilter, setExcelSectionFilter] = useState<'all_sections' | 'notas_clases' | 'nota_acumulativa' | 'historial_inasistencia'>('all_sections');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('todos');

  // Individual Student Ficha Modal (View & Full Edit)
  const [selectedStudentIdForFicha, setSelectedStudentIdForFicha] = useState<string | null>(null);

  // Add Student Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStudentDoc, setNewStudentDoc] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentWhatsapp, setNewStudentWhatsapp] = useState('');
  const [syncToOfficialRoster, setSyncToOfficialRoster] = useState(true);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  // Delete Student Confirmation (always synchronized with the single official student bank)
  const [deleteConfirmStudent, setDeleteConfirmStudent] = useState<StudentAcademicRecord | null>(
    null
  );
  const [alsoDeleteFromOfficialRoster, setAlsoDeleteFromOfficialRoster] = useState(true);

  // Selection & Bulk/Selection/Individual Grade & Attendance Editor States
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkEditorModalOpen, setBulkEditorModalOpen] = useState(false);
  const [bulkTargetMode, setBulkTargetMode] = useState<'selected' | 'all' | 'filtered' | 'individual'>('all');
  const [bulkIndividualStudentId, setBulkIndividualStudentId] = useState<string>('');
  const [bulkTargetClasses, setBulkTargetClasses] = useState<ClassSessionId[]>([1]);

  // Fields for Bulk / Selection / Individual Editor
  const [bulkComportamientoMode, setBulkComportamientoMode] = useState<'none' | 'set' | 'delta'>('none');
  const [bulkComportamientoVal, setBulkComportamientoVal] = useState<number>(4.0);
  const [bulkParticipacionMode, setBulkParticipacionMode] = useState<'none' | 'set' | 'delta'>('none');
  const [bulkParticipacionVal, setBulkParticipacionVal] = useState<number>(4.0);
  const [bulkExamenMode, setBulkExamenMode] = useState<'none' | 'set' | 'delta'>('none');
  const [bulkExamenVal, setBulkExamenVal] = useState<number>(4.0);
  const [bulkTrabajoMode, setBulkTrabajoMode] = useState<'none' | 'set' | 'delta'>('none');
  const [bulkTrabajoVal, setBulkTrabajoVal] = useState<number>(4.0);
  const [bulkNotaFinalMode, setBulkNotaFinalMode] = useState<'none' | 'auto' | 'set_direct' | 'set_all_components' | 'delta'>('none');
  const [bulkNotaFinalVal, setBulkNotaFinalVal] = useState<number>(4.0);
  const [bulkInasistenciasMode, setBulkInasistenciasMode] = useState<
    'none' | '0_fallas' | '1_falla_b1' | '1_falla_b2' | '2_fallas' | 'only_b1_present' | 'only_b1_absent' | 'only_b2_present' | 'only_b2_absent'
  >('none');
  const [bulkObservacionMode, setBulkObservacionMode] = useState<'none' | 'set' | 'append' | 'clear'>('none');
  const [bulkObservacionText, setBulkObservacionText] = useState<string>('');
  const [bulkBonoRetosMode, setBulkBonoRetosMode] = useState<'none' | 'enable' | 'disable'>('none');
  const [bulkReemplazoExMode, setBulkReemplazoExMode] = useState<'none' | 'enable' | 'disable'>('none');

  // Quick Inline Bar States for Vista 2 (Active Class)
  const [quickClassField, setQuickClassField] = useState<
    'comportamiento' | 'participacion' | 'examen' | 'trabajoPractico' | 'notaFinal' | 'todos_componentes'
  >('todos_componentes');
  const [quickClassAction, setQuickClassAction] = useState<'set' | 'delta'>('set');
  const [quickClassValue, setQuickClassValue] = useState<number>(4.0);
  const [quickClassScope, setQuickClassScope] = useState<'individual' | 'selected' | 'all_filtered' | 'all_course'>('all_course');
  const [quickClassIndividualId, setQuickClassIndividualId] = useState<string>('');

  // Direct Manual Component Grader (Comportamiento y Convivencia, Sustentación y Participación, Taller y Trabajo Práctico)
  const [manualGraderScope, setManualGraderScope] = useState<'individual' | 'selected' | 'all'>('individual');
  const [manualGraderStudentId, setManualGraderStudentId] = useState<string>('');
  const [manualGraderClassTarget, setManualGraderClassTarget] = useState<ClassSessionId | 'all'>(1);
  const [manualCompInput, setManualCompInput] = useState<string>('');
  const [manualPartInput, setManualPartInput] = useState<string>('');
  const [manualTrabInput, setManualTrabInput] = useState<string>('');

  const rosterMap = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Single authoritative student bank & course modules: always synchronize academicDataset records against `students` and `courseModules`
  const syncedDataset = useMemo(
    () => normalizeAndSyncAcademicDataset(dataset, students, courseModules, courseName),
    [dataset, students, courseModules, courseName]
  );

  // Prune any selected student IDs if those students were deleted from the official student bank
  // and force immediate state synchronization whenever the global student bank changes
  const [studentBankSyncRev, setStudentBankSyncRev] = useState(0);
  useEffect(() => {
    setStudentBankSyncRev((r) => r + 1);
    const validSet = new Set(students.map((s) => s.id));
    setSelectedStudentIds((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((id) => validSet.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    if (selectedStudentIdForFicha && !validSet.has(selectedStudentIdForFicha)) {
      setSelectedStudentIdForFicha(null);
    }
    if (deleteConfirmStudent && !validSet.has(deleteConfirmStudent.studentId)) {
      setDeleteConfirmStudent(null);
    }
  }, [students]);

  const effectiveClassSessions = useMemo(
    () =>
      Array.isArray(syncedDataset?.classSessions) && syncedDataset.classSessions.length > 0
        ? syncedDataset.classSessions
        : OFFICIAL_CLASS_SESSIONS,
    [syncedDataset?.classSessions]
  );

  const activeClassIds = useMemo<ClassSessionId[]>(
    () => effectiveClassSessions.map((cs) => cs.id as ClassSessionId),
    [effectiveClassSessions]
  );

  const totalActiveClassesCount = Math.max(1, activeClassIds.length);
  const firstClassId = (activeClassIds[0] || 1) as ClassSessionId;
  const lastClassId = (activeClassIds[activeClassIds.length - 1] || firstClassId) as ClassSessionId;
  const classesRangeLabel =
    activeClassIds.length === 1
      ? `Módulo ${firstClassId}`
      : `Módulos ${firstClassId} a ${lastClassId}`;
  const shortClassesRangeLabel =
    activeClassIds.length === 1 ? `C${firstClassId}` : `C${firstClassId}–C${lastClassId}`;

  useEffect(() => {
    if (activeClassIds.length > 0 && !activeClassIds.includes(selectedClassId)) {
      setSelectedClassId(activeClassIds[0]);
    }
    if (
      manualGraderClassTarget !== 'all' &&
      activeClassIds.length > 0 &&
      !activeClassIds.includes(manualGraderClassTarget)
    ) {
      setManualGraderClassTarget(activeClassIds[0]);
    }
  }, [activeClassIds, selectedClassId, manualGraderClassTarget]);

  // Compute summaries for all students in the single official student bank
  const studentSummaries = useMemo<ComputedStudentAcademicSummary[]>(() => {
    const list = Array.isArray(syncedDataset?.records) ? syncedDataset.records : [];
    return list.map((rec) =>
      computeStudentAcademicSummary(
        rec,
        rosterMap.get(rec.studentId) || null,
        attempts,
        effectiveClassSessions
      )
    );
  }, [syncedDataset, rosterMap, attempts, effectiveClassSessions, studentBankSyncRev]);

  // Global KPIs for Vista 1
  const globalStats = useMemo(() => {
    const totalStudents = studentSummaries.length;
    if (totalStudents === 0) {
      return {
        totalStudents: 0,
        promedioGrupo: 0,
        notaMaxima: 0,
        notaMinima: 0,
        tasaAsistenciaGlobal: 100,
        totalInasistenciasSemestre: 0,
        aprobadosCount: 0,
        aprobadosPct: 0,
        enRiesgoCount: 0,
        enRiesgoPct: 0,
        alertasCriticasAusentismoCount: 0,
        classStats: effectiveClassSessions.map((cs) => ({
          id: cs.id,
          code: cs.code,
          shortTitle: cs.shortTitle,
          fullTitle: cs.fullTitle,
          ponderacion: cs.ponderacion,
          promedio: 0,
          asistenciaPct: 100,
          fallasCount: 0
        })),
        histogramData: [
          { range: '< 2.0 (Crítico)', count: 0, color: '#ef4444' },
          { range: '2.0 - 2.9 (En riesgo)', count: 0, color: '#f59e0b' },
          { range: '3.0 - 3.9 (Aprobado)', count: 0, color: '#0ea5e9' },
          { range: '4.0 - 5.0 (Excelente)', count: 0, color: '#10b981' }
        ]
      };
    }

    const promedios = studentSummaries.map((s) => s.promedioAcumulado);
    const sumProm = promedios.reduce((acc, v) => acc + v, 0);
    const promedioGrupo = Number((sumProm / totalStudents).toFixed(2));
    const notaMaxima = Math.max(...promedios);
    const notaMinima = Math.min(...promedios);

    const totalInasistenciasSemestre = studentSummaries.reduce(
      (acc, s) => acc + s.totalFallasBloques,
      0
    );
    const totalPosiblesBloques = totalStudents * 12;
    const tasaAsistenciaGlobal =
      totalPosiblesBloques > 0
        ? Number(
            (
              ((totalPosiblesBloques - totalInasistenciasSemestre) / totalPosiblesBloques) *
              100
            ).toFixed(1)
          )
        : 100;

    const aprobadosCount = studentSummaries.filter((s) => s.promedioAcumulado >= 3.0).length;
    const aprobadosPct = Number(((aprobadosCount / totalStudents) * 100).toFixed(1));
    const enRiesgoCount = studentSummaries.filter((s) => s.promedioAcumulado < 3.0).length;
    const enRiesgoPct = Number(((enRiesgoCount / totalStudents) * 100).toFixed(1));
    const alertasCriticasAusentismoCount = studentSummaries.filter(
      (s) => s.totalFallasBloques >= 3
    ).length;

    const classStats = effectiveClassSessions.map((cs) => {
      let sumClassGrade = 0;
      let classBlocksPresent = 0;
      let classBlocksAbsent = 0;
      studentSummaries.forEach((s) => {
        sumClassGrade += s.classFinals[cs.id] ?? 0;
        const cRec = s.record.clases[cs.id];
        if (cRec?.bloque1Asistio !== false) classBlocksPresent++;
        else classBlocksAbsent++;
        if (cRec?.bloque2Asistio !== false) classBlocksPresent++;
        else classBlocksAbsent++;
      });
      const totalBlocks = totalStudents * 2;
      return {
        id: cs.id,
        code: cs.code,
        shortTitle: cs.shortTitle,
        fullTitle: cs.fullTitle,
        ponderacion: cs.ponderacion,
        promedio: Number((sumClassGrade / totalStudents).toFixed(2)),
        asistenciaPct:
          totalBlocks > 0 ? Number(((classBlocksPresent / totalBlocks) * 100).toFixed(1)) : 100,
        fallasCount: classBlocksAbsent
      };
    });

    const critCount = studentSummaries.filter((s) => s.promedioAcumulado < 2.0).length;
    const riskCount = studentSummaries.filter(
      (s) => s.promedioAcumulado >= 2.0 && s.promedioAcumulado < 3.0
    ).length;
    const passCount = studentSummaries.filter(
      (s) => s.promedioAcumulado >= 3.0 && s.promedioAcumulado < 4.0
    ).length;
    const excCount = studentSummaries.filter((s) => s.promedioAcumulado >= 4.0).length;

    const histogramData = [
      { range: '< 2.0 (Crítico)', count: critCount, color: '#ef4444' },
      { range: '2.0 - 2.9 (En riesgo)', count: riskCount, color: '#f59e0b' },
      { range: '3.0 - 3.9 (Aprobado)', count: passCount, color: '#0ea5e9' },
      { range: '4.0 - 5.0 (Excelente)', count: excCount, color: '#10b981' }
    ];

    return {
      totalStudents,
      promedioGrupo,
      notaMaxima,
      notaMinima,
      tasaAsistenciaGlobal,
      totalInasistenciasSemestre,
      aprobadosCount,
      aprobadosPct,
      enRiesgoCount,
      enRiesgoPct,
      alertasCriticasAusentismoCount,
      classStats,
      histogramData
    };
  }, [studentSummaries, effectiveClassSessions]);

  // AI Pedagogical Diagnostics (Vista 4)
  const aiDiagnostics = useMemo(() => {
    const perfectAttendance = studentSummaries.filter((s) => s.totalFallasBloques === 0);
    const twoOrMoreFallas = studentSummaries.filter((s) => s.totalFallasBloques >= 2);

    const avgPerfect =
      perfectAttendance.length > 0
        ? Number(
            (
              perfectAttendance.reduce((acc, s) => acc + s.promedioAcumulado, 0) /
              perfectAttendance.length
            ).toFixed(2)
          )
        : 4.2;

    const avgTwoOrMore =
      twoOrMoreFallas.length > 0
        ? Number(
            (
              twoOrMoreFallas.reduce((acc, s) => acc + s.promedioAcumulado, 0) /
              twoOrMoreFallas.length
            ).toFixed(2)
          )
        : 2.3;

    const dropPercentage =
      avgPerfect > 0
        ? Math.max(0, Number((((avgPerfect - avgTwoOrMore) / avgPerfect) * 100).toFixed(1)))
        : 0;

    // Inflection point detection across C1..C6
    const sortedByLowestAvg = [...globalStats.classStats].sort((a, b) => a.promedio - b.promedio);
    const lowestClass1 = sortedByLowestAvg[0] || globalStats.classStats[3];
    const lowestClass2 = sortedByLowestAvg[1] || globalStats.classStats[2];

    // Priority students for leveling
    const priorityStudents = studentSummaries
      .filter((s) => s.enRiesgoAcademico || s.alertaCriticaAusentismo)
      .sort((a, b) => a.promedioAcumulado - b.promedioAcumulado)
      .map((s) => {
        let recomendacion = 'Habilitar examen de recuperación y sustentar talleres pendientes';
        let accionClave: 'TUTORIA' | 'RECUPERACION' | 'SUSTENTACION' = 'RECUPERACION';
        if (s.totalFallasBloques >= 3 && s.promedioAcumulado < 2.2) {
          recomendacion =
            'Citar a tutoría presencial prioritaria + Plan de Choque Articulado (Examen Integral + Bono Retos)';
          accionClave = 'TUTORIA';
        } else if (s.totalFallasBloques >= 3) {
          recomendacion =
            'Citación prioritaria por límite reglamentario de fallas (≥ 3) y validación de excusas';
          accionClave = 'TUTORIA';
        } else {
          recomendacion = `Sustentar taller práctico de Clase ${s.notaMasBajaTrabajoClaseId} (Nota actual: ${s.notaMasBajaTrabajoValor.toFixed(1)})`;
          accionClave = 'SUSTENTACION';
        }
        return {
          summary: s,
          recomendacion,
          accionClave
        };
      });

    return {
      avgPerfect,
      avgTwoOrMore,
      dropPercentage,
      perfectCount: perfectAttendance.length,
      twoOrMoreCount: twoOrMoreFallas.length,
      lowestClass1,
      lowestClass2,
      priorityStudents
    };
  }, [studentSummaries, globalStats.classStats]);

  // Filtered students for Vista 1 & Vista 2
  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return studentSummaries.filter((s) => {
      const matchesSearch =
        !q ||
        s.record.nombre.toLowerCase().includes(q) ||
        s.record.documento.toLowerCase().includes(q) ||
        s.record.studentId.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (quickFilter === 'aprobados') return s.aprobado;
      if (quickFilter === 'en_riesgo') return s.enRiesgoAcademico;
      if (quickFilter === 'fallas_criticas') return s.alertaCriticaAusentismo;
      return true;
    });
  }, [studentSummaries, searchQuery, quickFilter]);

  // Handlers for mutating student records and saving immediately
  const handleUpdateStudentClassField = (
    studentId: string,
    claseId: ClassSessionId,
    updater: (prev: StudentClassSessionRecord) => StudentClassSessionRecord
  ) => {
    const sessionDef = effectiveClassSessions.find((cs) => cs.id === claseId);
    const modWeights = sessionDef?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
    const nextRecords = syncedDataset.records.map((rec) => {
      if (rec.studentId !== studentId) return rec;
      const prevClass = rec.clases[claseId];
      const updatedClass = updater(prevClass);

      const compCal = Boolean(updatedClass.comportamientoCalificado);
      const partCal = Boolean(updatedClass.participacionCalificado);
      const examCal = Boolean(updatedClass.examenCalificado);
      const trabCal = Boolean(updatedClass.trabajoCalificado);
      const anyCompGraded = compCal || partCal || examCal || trabCal;
      const manualFinal =
        updatedClass.autoCalcularNotaFinal === false && Boolean(updatedClass.notaFinalCalificada);
      const notaFinalCalificada = manualFinal || anyCompGraded;

      const nextNotaFinal = manualFinal
        ? clampGrade05(updatedClass.notaFinal)
        : anyCompGraded
        ? computeClassSessionFinalGrade(
            updatedClass.comportamiento,
            updatedClass.participacion,
            updatedClass.examen,
            updatedClass.trabajoPractico,
            updatedClass.observacionDocente,
            modWeights,
            {
              comportamientoCalificado: compCal,
              participacionCalificado: partCal,
              examenCalificado: examCal,
              trabajoCalificado: trabCal
            }
          )
        : 0;

      const b1Estado =
        updatedClass.asistenciaB1Estado ||
        (updatedClass.bloque1Asistio ? 'presente_manual' : 'sin_registrar');
      const b2Estado =
        updatedClass.asistenciaB2Estado ||
        (updatedClass.bloque2Asistio ? 'presente_manual' : 'sin_registrar');

      return {
        ...rec,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...updatedClass,
            notaFinal: nextNotaFinal,
            notaFinalCalificada,
            asistenciaB1Estado: b1Estado,
            asistenciaB2Estado: b2Estado,
            bloque1Asistio: b1Estado === 'presente_virtual' || b1Estado === 'presente_manual',
            bloque2Asistio: b2Estado === 'presente_virtual' || b2Estado === 'presente_manual'
          }
        },
        ultimaActualizacionIso: new Date().toISOString()
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });
  };

  // Virtual Roll Call ("Llamado de Asistencia Virtual") for an individual student
  const handleEmitVirtualRollCallForStudent = (
    studentId: string,
    claseId: ClassSessionId,
    bloque: 1 | 2 | 'ambos' = 'ambos'
  ) => {
    const targetRec = syncedDataset.records.find((r) => r.studentId === studentId);
    const nowIso = new Date().toISOString();
    const nextRecords = syncedDataset.records.map((rec) => {
      if (rec.studentId !== studentId) return rec;
      const prevClass = rec.clases[claseId];
      const isAlreadyCalling = Boolean(prevClass.llamadoVirtualActivo);
      if (isAlreadyCalling) {
        // Cancel active call if clicked again
        return {
          ...rec,
          clases: {
            ...rec.clases,
            [claseId]: {
              ...prevClass,
              llamadoVirtualActivo: false,
              asistenciaB1Estado:
                prevClass.asistenciaB1Estado === 'llamando'
                  ? 'sin_registrar'
                  : prevClass.asistenciaB1Estado,
              asistenciaB2Estado:
                prevClass.asistenciaB2Estado === 'llamando'
                  ? 'sin_registrar'
                  : prevClass.asistenciaB2Estado
            }
          },
          ultimaActualizacionIso: nowIso
        };
      }
      return {
        ...rec,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevClass,
            llamadoVirtualActivo: true,
            llamadoVirtualBloque: bloque,
            llamadoVirtualEmitidoAtIso: nowIso,
            asistenciaB1Estado:
              bloque === 1 || bloque === 'ambos' ? 'llamando' : prevClass.asistenciaB1Estado,
            asistenciaB2Estado:
              bloque === 2 || bloque === 'ambos' ? 'llamando' : prevClass.asistenciaB2Estado
          }
        },
        ultimaActualizacionIso: nowIso
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });

    if (targetRec) {
      const wasCalling = Boolean(targetRec.clases[claseId]?.llamadoVirtualActivo);
      setFormFeedback(
        wasCalling
          ? `ℹ️ Llamado virtual cancelado para ${targetRec.nombre} en Clase C${claseId}.`
          : `📢 Llamado virtual de asistencia enviado a ${targetRec.nombre} (ID: ${targetRec.documento}) en Clase C${claseId}. El estudiante ya puede contestar "¡Presente!" desde su panel.`
      );
      setTimeout(() => setFormFeedback(null), 5000);
    }
  };

  // Virtual Roll Call for a group / selection / entire class
  const handleEmitVirtualRollCallBatch = (
    claseId: ClassSessionId,
    scope: 'individual' | 'selected' | 'all_filtered' | 'all_course',
    bloque: 1 | 2 | 'ambos' = 'ambos'
  ) => {
    const targetIds =
      scope === 'individual'
        ? quickClassIndividualId
          ? [quickClassIndividualId]
          : syncedDataset.records[0]?.studentId
          ? [syncedDataset.records[0].studentId]
          : []
        : scope === 'selected'
        ? selectedStudentIds
        : scope === 'all_filtered'
        ? filteredSummaries.map((s) => s.record.studentId)
        : syncedDataset.records.map((r) => r.studentId);

    if (targetIds.length === 0) {
      setFormFeedback('⚠️ Seleccione al menos un estudiante o elija Todos para enviar el llamado.');
      setTimeout(() => setFormFeedback(null), 3500);
      return;
    }

    const nowIso = new Date().toISOString();
    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetIds.includes(rec.studentId)) return rec;
      const prevClass = rec.clases[claseId];
      return {
        ...rec,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevClass,
            llamadoVirtualActivo: true,
            llamadoVirtualBloque: bloque,
            llamadoVirtualEmitidoAtIso: nowIso,
            asistenciaB1Estado:
              bloque === 1 || bloque === 'ambos' ? 'llamando' : prevClass.asistenciaB1Estado,
            asistenciaB2Estado:
              bloque === 2 || bloque === 'ambos' ? 'llamando' : prevClass.asistenciaB2Estado
          }
        },
        ultimaActualizacionIso: nowIso
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
    setFormFeedback(
      `📢 Llamado virtual de asistencia enviado a ${targetIds.length} estudiante(s) en Clase C${claseId}. Los estudiantes recibirán el aviso en su panel para confirmar asistencia.`
    );
    setTimeout(() => setFormFeedback(null), 5000);
  };

  const handleToggleStudentShockPlan = (
    studentId: string,
    field: 'bonificacionRetosAplicada' | 'reemplazoExamenIntegralAplicado',
    forceValue?: boolean
  ) => {
    const nextRecords = syncedDataset.records.map((rec) => {
      if (rec.studentId !== studentId) return rec;
      const nextVal = forceValue !== undefined ? forceValue : !rec[field];
      return {
        ...rec,
        [field]: nextVal,
        ultimaActualizacionIso: new Date().toISOString()
      };
    });
    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });
  };

  const handleApplyShockPlanToAllAtRisk = () => {
    const nextRecords = syncedDataset.records.map((rec) => {
      const summary = studentSummaries.find((s) => s.record.studentId === rec.studentId);
      if (!summary || (!summary.enRiesgoAcademico && !summary.alertaCriticaAusentismo)) {
        return rec;
      }
      return {
        ...rec,
        bonificacionRetosAplicada: true,
        reemplazoExamenIntegralAplicado: true,
        ultimaActualizacionIso: new Date().toISOString()
      };
    });
    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });
    setFormFeedback(
      '✓ Plan de Choque Articulado aplicado a todos los estudiantes en riesgo y sincronizado en la base de datos.'
    );
    setTimeout(() => setFormFeedback(null), 4000);
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDoc = newStudentDoc.trim();
    const cleanName = newStudentName.trim();
    if (!cleanDoc || !cleanName) return;

    if (syncedDataset.records.some((r) => r.studentId === cleanDoc)) {
      setFormFeedback('⚠️ Ya existe un estudiante con ese documento en el banco oficial de estudiantes.');
      return;
    }

    const newAcademicRecord = createDefaultStudentAcademicRecord(cleanDoc, cleanName, cleanDoc);
    const nextDataset: AcademicDataset = {
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: [newAcademicRecord, ...syncedDataset.records]
    };

    const newRosterStudent: StudentRecord = {
      id: cleanDoc,
      nombre: cleanName,
      codigoAcceso: generateDeterministicAccessCode(cleanDoc),
      correo: newStudentEmail.trim() || undefined,
      whatsapp: newStudentWhatsapp.trim() || undefined,
      intentosUsados: 0,
      preguntasIntento1: [],
      preguntasIntento2: [],
      conceptoInfraccion: '✓ Sin infracciones',
      suspendido: false
    };

    onUpdateDataset(nextDataset, { syncNewStudentToRoster: newRosterStudent });
    setNewStudentDoc('');
    setNewStudentName('');
    setNewStudentEmail('');
    setNewStudentWhatsapp('');
    setAddModalOpen(false);
    setFormFeedback(`✓ Estudiante ${cleanName} (${cleanDoc}) agregado al banco único de estudiantes y guardado en el servidor.`);
    setTimeout(() => setFormFeedback(null), 4000);
  };

  const handleConfirmDeleteStudent = () => {
    if (!deleteConfirmStudent) return;
    const targetId = deleteConfirmStudent.studentId;
    const nextDataset: AcademicDataset = {
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: syncedDataset.records.filter((r) => r.studentId !== targetId)
    };
    onUpdateDataset(nextDataset, {
      removeStudentFromRosterId: targetId
    });
    setDeleteConfirmStudent(null);
    if (selectedStudentIdForFicha === targetId) {
      setSelectedStudentIdForFicha(null);
    }
    setFormFeedback('✓ Estudiante eliminado del banco único y sincronizado en todas las ventanas.');
    setTimeout(() => setFormFeedback(null), 3500);
  };

  // Selection & Bulk/Selection/Individual Grade & Attendance Handlers
  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredSummaries.map((s) => s.record.studentId);
    if (filteredIds.length === 0) return;
    const allSelected = filteredIds.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleBulkClassId = (cId: ClassSessionId) => {
    setBulkTargetClasses((prev) => {
      if (prev.includes(cId)) {
        return prev.length > 1 ? prev.filter((x) => x !== cId) : prev;
      }
      return [...prev, cId].sort((a, b) => a - b) as ClassSessionId[];
    });
  };

  const handleQuickAttendanceInClass = (
    claseId: ClassSessionId,
    mode: '0_fallas' | '1_falla_b1' | '1_falla_b2' | '2_fallas' | 'sin_registrar',
    scope: 'individual' | 'selected' | 'all_filtered' | 'all_course'
  ) => {
    const targetIds =
      scope === 'individual'
        ? quickClassIndividualId
          ? [quickClassIndividualId]
          : syncedDataset.records[0]?.studentId
          ? [syncedDataset.records[0].studentId]
          : []
        : scope === 'selected'
        ? selectedStudentIds
        : scope === 'all_filtered'
        ? filteredSummaries.map((s) => s.record.studentId)
        : syncedDataset.records.map((r) => r.studentId);

    if (targetIds.length === 0) {
      setFormFeedback('⚠️ Seleccione al menos un estudiante o cambie el alcance.');
      setTimeout(() => setFormFeedback(null), 3500);
      return;
    }

    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetIds.includes(rec.studentId)) return rec;
      const prevClass = rec.clases[claseId];
      if (mode === 'sin_registrar') {
        return {
          ...rec,
          clases: {
            ...rec.clases,
            [claseId]: {
              ...prevClass,
              bloque1Asistio: false,
              bloque2Asistio: false,
              asistenciaB1Estado: 'sin_registrar' as const,
              asistenciaB2Estado: 'sin_registrar' as const,
              llamadoVirtualActivo: false
            }
          },
          ultimaActualizacionIso: new Date().toISOString()
        };
      }
      const nextB1 = mode === '0_fallas' || mode === '1_falla_b2';
      const nextB2 = mode === '0_fallas' || mode === '1_falla_b1';
      return {
        ...rec,
        clases: {
          ...rec.clases,
          [claseId]: {
            ...prevClass,
            bloque1Asistio: nextB1,
            bloque2Asistio: nextB2,
            asistenciaB1Estado: (nextB1 ? 'presente_manual' : 'falla') as any,
            asistenciaB2Estado: (nextB2 ? 'presente_manual' : 'falla') as any,
            llamadoVirtualActivo: false
          }
        },
        ultimaActualizacionIso: new Date().toISOString()
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });
    setFormFeedback(
      `✓ Asistencia actualizada en Clase ${claseId} para ${targetIds.length} estudiante(s).`
    );
    setTimeout(() => setFormFeedback(null), 3500);
  };

  const handleQuickApplyInActiveClass = () => {
    const targetIds =
      quickClassScope === 'individual'
        ? quickClassIndividualId
          ? [quickClassIndividualId]
          : syncedDataset.records[0]?.studentId
          ? [syncedDataset.records[0].studentId]
          : []
        : quickClassScope === 'selected'
        ? selectedStudentIds
        : quickClassScope === 'all_filtered'
        ? filteredSummaries.map((s) => s.record.studentId)
        : syncedDataset.records.map((r) => r.studentId);

    if (targetIds.length === 0) {
      setFormFeedback('⚠️ Seleccione al menos un estudiante con la casilla ☑, elija un estudiante individual o seleccione Todos.');
      setTimeout(() => setFormFeedback(null), 3500);
      return;
    }

    const applyVal = (current: number) =>
      clampGrade05(quickClassAction === 'set' ? quickClassValue : current + quickClassValue);

    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetIds.includes(rec.studentId)) return rec;
      const prevClass = rec.clases[selectedClassId];
      let updated: StudentClassSessionRecord = { ...prevClass };

      if (quickClassField === 'todos_componentes') {
        updated.comportamiento = applyVal(prevClass.comportamiento);
        updated.participacion = applyVal(prevClass.participacion);
        updated.examen = applyVal(prevClass.examen);
        updated.trabajoPractico = applyVal(prevClass.trabajoPractico);
        updated.comportamientoCalificado = true;
        updated.participacionCalificado = true;
        updated.examenCalificado = true;
        updated.trabajoCalificado = true;
        updated.trabajoEstado = 'calificado';
        updated.examenManualOverride = true;
        updated.participacionManualOverride = true;
        updated.notaFinalCalificada = true;
        updated.autoCalcularNotaFinal = true;
      } else if (quickClassField === 'notaFinal') {
        updated.notaFinal = applyVal(prevClass.notaFinal);
        updated.notaFinalCalificada = true;
        updated.autoCalcularNotaFinal = false;
      } else {
        updated[quickClassField] = applyVal(prevClass[quickClassField]);
        if (quickClassField === 'comportamiento') updated.comportamientoCalificado = true;
        if (quickClassField === 'participacion') {
          updated.participacionCalificado = true;
          updated.participacionManualOverride = true;
        }
        if (quickClassField === 'examen') {
          updated.examenCalificado = true;
          updated.examenManualOverride = true;
        }
        if (quickClassField === 'trabajoPractico') {
          updated.trabajoCalificado = true;
          updated.trabajoEstado = 'calificado';
        }
        updated.notaFinalCalificada = true;
        updated.autoCalcularNotaFinal = true;
      }

      const sessionDef = effectiveClassSessions.find((cs) => cs.id === selectedClassId);
      const modWeights = sessionDef?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
      updated.notaFinal =
        updated.autoCalcularNotaFinal !== false
          ? computeClassSessionFinalGrade(
              updated.comportamiento,
              updated.participacion,
              updated.examen,
              updated.trabajoPractico,
              updated.observacionDocente,
              modWeights,
              {
                comportamientoCalificado: updated.comportamientoCalificado,
                participacionCalificado: updated.participacionCalificado,
                examenCalificado: updated.examenCalificado,
                trabajoCalificado: updated.trabajoCalificado
              }
            )
          : clampGrade05(updated.notaFinal);

      return {
        ...rec,
        clases: {
          ...rec.clases,
          [selectedClassId]: updated
        },
        ultimaActualizacionIso: new Date().toISOString()
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });
    setFormFeedback(
      `✓ Calificaciones actualizadas en Clase ${selectedClassId} para ${targetIds.length} estudiante(s).`
    );
    setTimeout(() => setFormFeedback(null), 3500);
  };

  // Synchronize manual grader inputs when selecting an individual student & specific class
  useEffect(() => {
    const effectiveStudentId = manualGraderStudentId || syncedDataset.records[0]?.studentId || '';
    if (effectiveStudentId && !manualGraderStudentId) {
      setManualGraderStudentId(effectiveStudentId);
    }
    if (effectiveStudentId && !quickClassIndividualId) {
      setQuickClassIndividualId(effectiveStudentId);
    }
    if (manualGraderScope === 'individual' && manualGraderClassTarget !== 'all') {
      const rec = syncedDataset.records.find((r) => r.studentId === effectiveStudentId);
      const c = rec?.clases?.[manualGraderClassTarget];
      if (c) {
        setManualCompInput(c.comportamientoCalificado ? String(c.comportamiento) : '');
        setManualPartInput(c.participacionCalificado ? String(c.participacion) : '');
        setManualTrabInput(c.trabajoCalificado ? String(c.trabajoPractico) : '');
      }
    }
  }, [manualGraderScope, manualGraderStudentId, manualGraderClassTarget, syncedDataset.records]);

  const handleApplyDirectManualThreeComponents = (clearToSinNota = false) => {
    const effectiveStudentId = manualGraderStudentId || syncedDataset.records[0]?.studentId || '';
    const targetIds =
      manualGraderScope === 'individual'
        ? effectiveStudentId
          ? [effectiveStudentId]
          : []
        : manualGraderScope === 'selected'
        ? selectedStudentIds
        : syncedDataset.records.map((r) => r.studentId);

    if (targetIds.length === 0) {
      setFormFeedback(
        '⚠️ Para aplicar a «Seleccionados», marque primero al menos un estudiante con la casilla ☑ en la tabla.'
      );
      setTimeout(() => setFormFeedback(null), 4000);
      return;
    }

    const targetClasses: ClassSessionId[] =
      manualGraderClassTarget === 'all' ? activeClassIds : [manualGraderClassTarget];

    const hasComp = clearToSinNota || manualCompInput.trim() !== '';
    const hasPart = clearToSinNota || manualPartInput.trim() !== '';
    const hasTrab = clearToSinNota || manualTrabInput.trim() !== '';

    if (!hasComp && !hasPart && !hasTrab) {
      setFormFeedback(
        '⚠️ Ingrese al menos una calificación (0.0 a 5.0) en Comportamiento y Convivencia, Sustentación y Participación o Taller y Trabajo Práctico.'
      );
      setTimeout(() => setFormFeedback(null), 4000);
      return;
    }

    const compVal = clampGrade05(parseFloat(manualCompInput) || 0);
    const partVal = clampGrade05(parseFloat(manualPartInput) || 0);
    const trabVal = clampGrade05(parseFloat(manualTrabInput) || 0);

    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetIds.includes(rec.studentId)) return rec;
      const nextClases = { ...rec.clases };

      targetClasses.forEach((cId) => {
        const prevC = nextClases[cId];
        const nextC: StudentClassSessionRecord = { ...prevC };

        if (clearToSinNota) {
          nextC.comportamiento = 0;
          nextC.comportamientoCalificado = false;
          nextC.participacion = 0;
          nextC.participacionCalificado = false;
          nextC.participacionManualOverride = true;
          nextC.trabajoPractico = 0;
          nextC.trabajoCalificado = false;
          nextC.trabajoEstado = prevC.trabajoEntregaTexto ? 'pendiente_revision' : 'sin_entregar';
        } else {
          if (hasComp) {
            nextC.comportamiento = compVal;
            nextC.comportamientoCalificado = true;
          }
          if (hasPart) {
            nextC.participacion = partVal;
            nextC.participacionCalificado = true;
            nextC.participacionManualOverride = true;
          }
          if (hasTrab) {
            nextC.trabajoPractico = trabVal;
            nextC.trabajoCalificado = true;
            nextC.trabajoEstado = 'calificado';
          }
        }

        const sessionDef = effectiveClassSessions.find((cs) => cs.id === cId);
        const modWeights = sessionDef?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
        const anyGraded = Boolean(
          nextC.comportamientoCalificado ||
            nextC.participacionCalificado ||
            nextC.examenCalificado ||
            nextC.trabajoCalificado
        );
        nextC.autoCalcularNotaFinal = true;
        nextC.notaFinalCalificada = anyGraded;
        nextC.notaFinal = anyGraded
          ? computeClassSessionFinalGrade(
              nextC.comportamiento,
              nextC.participacion,
              nextC.examen,
              nextC.trabajoPractico,
              nextC.observacionDocente,
              modWeights,
              {
                comportamientoCalificado: nextC.comportamientoCalificado,
                participacionCalificado: nextC.participacionCalificado,
                examenCalificado: nextC.examenCalificado,
                trabajoCalificado: nextC.trabajoCalificado
              }
            )
          : 0;

        nextClases[cId] = nextC;
      });

      return {
        ...rec,
        clases: nextClases,
        ultimaActualizacionIso: new Date().toISOString()
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });

    if (clearToSinNota) {
      setManualCompInput('');
      setManualPartInput('');
      setManualTrabInput('');
      setFormFeedback(
        `✓ Notas de Comportamiento, Participación y Trabajo Práctico restablecidas a «Sin nota» para ${targetIds.length} estudiante(s) en ${
          manualGraderClassTarget === 'all' ? classesRangeLabel : `Clase / Módulo C${manualGraderClassTarget}`
        }.`
      );
    } else {
      setFormFeedback(
        `✓ Calificaciones manuales guardadas para ${targetIds.length} estudiante(s) en ${
          manualGraderClassTarget === 'all' ? `Todos los Módulos (${shortClassesRangeLabel})` : `Clase / Módulo C${manualGraderClassTarget}`
        }.`
      );
    }
    setTimeout(() => setFormFeedback(null), 4000);
  };

  const handleExecuteBulkOrSelectionModification = (e: React.FormEvent) => {
    e.preventDefault();
    const targetStudentIds =
      bulkTargetMode === 'all'
        ? syncedDataset.records.map((r) => r.studentId)
        : bulkTargetMode === 'selected'
        ? selectedStudentIds
        : bulkTargetMode === 'filtered'
        ? filteredSummaries.map((s) => s.record.studentId)
        : bulkIndividualStudentId
        ? [bulkIndividualStudentId]
        : [];

    if (targetStudentIds.length === 0) {
      setFormFeedback('⚠️ No hay estudiantes seleccionados para aplicar la modificación.');
      setTimeout(() => setFormFeedback(null), 4000);
      return;
    }

    if (bulkTargetClasses.length === 0) {
      setFormFeedback('⚠️ Seleccione al menos una clase (C1 a C6) para aplicar los cambios.');
      setTimeout(() => setFormFeedback(null), 4000);
      return;
    }

    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetStudentIds.includes(rec.studentId)) return rec;

      const nextClases = { ...rec.clases };
      bulkTargetClasses.forEach((cId) => {
        const prevC = nextClases[cId];
        const nextC: StudentClassSessionRecord = { ...prevC };
        let touchedComponent = false;

        if (bulkComportamientoMode === 'set') {
          nextC.comportamiento = clampGrade05(bulkComportamientoVal);
          nextC.comportamientoCalificado = true;
          touchedComponent = true;
        } else if (bulkComportamientoMode === 'delta') {
          nextC.comportamiento = clampGrade05(prevC.comportamiento + bulkComportamientoVal);
          nextC.comportamientoCalificado = true;
          touchedComponent = true;
        }

        if (bulkParticipacionMode === 'set') {
          nextC.participacion = clampGrade05(bulkParticipacionVal);
          nextC.participacionCalificado = true;
          nextC.participacionManualOverride = true;
          touchedComponent = true;
        } else if (bulkParticipacionMode === 'delta') {
          nextC.participacion = clampGrade05(prevC.participacion + bulkParticipacionVal);
          nextC.participacionCalificado = true;
          nextC.participacionManualOverride = true;
          touchedComponent = true;
        }

        if (bulkExamenMode === 'set') {
          nextC.examen = clampGrade05(bulkExamenVal);
          nextC.examenCalificado = true;
          nextC.examenManualOverride = true;
          touchedComponent = true;
        } else if (bulkExamenMode === 'delta') {
          nextC.examen = clampGrade05(prevC.examen + bulkExamenVal);
          nextC.examenCalificado = true;
          nextC.examenManualOverride = true;
          touchedComponent = true;
        }

        if (bulkTrabajoMode === 'set') {
          nextC.trabajoPractico = clampGrade05(bulkTrabajoVal);
          nextC.trabajoCalificado = true;
          nextC.trabajoEstado = 'calificado';
          touchedComponent = true;
        } else if (bulkTrabajoMode === 'delta') {
          nextC.trabajoPractico = clampGrade05(prevC.trabajoPractico + bulkTrabajoVal);
          nextC.trabajoCalificado = true;
          nextC.trabajoEstado = 'calificado';
          touchedComponent = true;
        }

        if (bulkObservacionMode === 'set') {
          nextC.observacionDocente = bulkObservacionText.trim();
        } else if (bulkObservacionMode === 'append') {
          const extra = bulkObservacionText.trim();
          if (extra) {
            nextC.observacionDocente = prevC.observacionDocente
              ? `${prevC.observacionDocente} | ${extra}`
              : extra;
          }
        } else if (bulkObservacionMode === 'clear') {
          nextC.observacionDocente = '';
        }

        if (bulkInasistenciasMode === '0_fallas') {
          nextC.bloque1Asistio = true;
          nextC.bloque2Asistio = true;
          nextC.asistenciaB1Estado = 'presente_manual';
          nextC.asistenciaB2Estado = 'presente_manual';
          nextC.llamadoVirtualActivo = false;
        } else if (bulkInasistenciasMode === '1_falla_b1') {
          nextC.bloque1Asistio = false;
          nextC.bloque2Asistio = true;
          nextC.asistenciaB1Estado = 'falla';
          nextC.asistenciaB2Estado = 'presente_manual';
          nextC.llamadoVirtualActivo = false;
        } else if (bulkInasistenciasMode === '1_falla_b2') {
          nextC.bloque1Asistio = true;
          nextC.bloque2Asistio = false;
          nextC.asistenciaB1Estado = 'presente_manual';
          nextC.asistenciaB2Estado = 'falla';
          nextC.llamadoVirtualActivo = false;
        } else if (bulkInasistenciasMode === '2_fallas') {
          nextC.bloque1Asistio = false;
          nextC.bloque2Asistio = false;
          nextC.asistenciaB1Estado = 'falla';
          nextC.asistenciaB2Estado = 'falla';
          nextC.llamadoVirtualActivo = false;
        } else if (bulkInasistenciasMode === 'only_b1_present') {
          nextC.bloque1Asistio = true;
          nextC.asistenciaB1Estado = 'presente_manual';
        } else if (bulkInasistenciasMode === 'only_b1_absent') {
          nextC.bloque1Asistio = false;
          nextC.asistenciaB1Estado = 'falla';
        } else if (bulkInasistenciasMode === 'only_b2_present') {
          nextC.bloque2Asistio = true;
          nextC.asistenciaB2Estado = 'presente_manual';
        } else if (bulkInasistenciasMode === 'only_b2_absent') {
          nextC.bloque2Asistio = false;
          nextC.asistenciaB2Estado = 'falla';
        }

        const sessionDef = effectiveClassSessions.find((cs) => cs.id === cId);
        const modWeights = sessionDef?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
        if (bulkNotaFinalMode === 'set_all_components') {
          const targetV = clampGrade05(bulkNotaFinalVal);
          nextC.comportamiento = targetV;
          nextC.participacion = targetV;
          nextC.examen = targetV;
          nextC.trabajoPractico = targetV;
          nextC.notaFinal = targetV;
          nextC.comportamientoCalificado = true;
          nextC.participacionCalificado = true;
          nextC.examenCalificado = true;
          nextC.trabajoCalificado = true;
          nextC.trabajoEstado = 'calificado';
          nextC.notaFinalCalificada = true;
          nextC.autoCalcularNotaFinal = true;
        } else if (bulkNotaFinalMode === 'set_direct') {
          nextC.notaFinal = clampGrade05(bulkNotaFinalVal);
          nextC.notaFinalCalificada = true;
          nextC.autoCalcularNotaFinal = false;
        } else if (bulkNotaFinalMode === 'delta') {
          nextC.notaFinal = clampGrade05(prevC.notaFinal + bulkNotaFinalVal);
          nextC.notaFinalCalificada = true;
          nextC.autoCalcularNotaFinal = false;
        } else if (bulkNotaFinalMode === 'auto' || touchedComponent) {
          nextC.autoCalcularNotaFinal = true;
          const anyGraded = Boolean(
            nextC.comportamientoCalificado ||
              nextC.participacionCalificado ||
              nextC.examenCalificado ||
              nextC.trabajoCalificado
          );
          nextC.notaFinalCalificada = anyGraded;
          nextC.notaFinal = anyGraded
            ? computeClassSessionFinalGrade(
                nextC.comportamiento,
                nextC.participacion,
                nextC.examen,
                nextC.trabajoPractico,
                nextC.observacionDocente,
                modWeights,
                {
                  comportamientoCalificado: nextC.comportamientoCalificado,
                  participacionCalificado: nextC.participacionCalificado,
                  examenCalificado: nextC.examenCalificado,
                  trabajoCalificado: nextC.trabajoCalificado
                }
              )
            : 0;
        } else if (nextC.autoCalcularNotaFinal !== false) {
          const anyGraded = Boolean(
            nextC.comportamientoCalificado ||
              nextC.participacionCalificado ||
              nextC.examenCalificado ||
              nextC.trabajoCalificado
          );
          nextC.notaFinalCalificada = anyGraded;
          nextC.notaFinal = anyGraded
            ? computeClassSessionFinalGrade(
                nextC.comportamiento,
                nextC.participacion,
                nextC.examen,
                nextC.trabajoPractico,
                nextC.observacionDocente,
                modWeights,
                {
                  comportamientoCalificado: nextC.comportamientoCalificado,
                  participacionCalificado: nextC.participacionCalificado,
                  examenCalificado: nextC.examenCalificado,
                  trabajoCalificado: nextC.trabajoCalificado
                }
              )
            : 0;
        }

        nextClases[cId] = nextC;
      });

      const nextBono =
        bulkBonoRetosMode === 'enable'
          ? true
          : bulkBonoRetosMode === 'disable'
          ? false
          : rec.bonificacionRetosAplicada;

      const nextReemplazo =
        bulkReemplazoExMode === 'enable'
          ? true
          : bulkReemplazoExMode === 'disable'
          ? false
          : rec.reemplazoExamenIntegralAplicado;

      return {
        ...rec,
        clases: nextClases,
        bonificacionRetosAplicada: nextBono,
        reemplazoExamenIntegralAplicado: nextReemplazo,
        ultimaActualizacionIso: new Date().toISOString()
      };
    });

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: new Date().toISOString(),
      records: nextRecords
    });

    setBulkEditorModalOpen(false);
    setFormFeedback(
      `✓ Modificación aplicada con éxito a ${targetStudentIds.length} estudiante(s) en ${bulkTargetClasses
        .map((c) => `C${c}`)
        .join(', ')}.`
    );
    setTimeout(() => setFormFeedback(null), 4500);
  };

  // Export functions
  const handleExportConsolidadoCsv = () => {
    const headers = [
      '#',
      'Documento ID',
      'Estudiante',
      'Promedio Definitivo',
      'Estado Académico',
      ...activeClassIds.map((cId) => `Mód. ${cId} (C${cId})`),
      'Fallas B1',
      'Fallas B2',
      'Total Fallas',
      '% Asistencia',
      'Bono Retos (+0.3)',
      'Reemplazo Examen Integral'
    ];
    const rows = studentSummaries.map((s, idx) => [
      idx + 1,
      s.record.documento,
      s.record.nombre,
      s.promedioAcumulado.toFixed(1),
      s.estadoAcademico,
      ...activeClassIds.map((cId) => (s.classFinals[cId] ?? 0).toFixed(1)),
      s.fallasBloque1,
      s.fallasBloque2,
      s.totalFallasBloques,
      `${s.porcentajeAsistencia}%`,
      s.record.bonificacionRetosAplicada ? 'SI' : 'NO',
      s.record.reemplazoExamenIntegralAplicado ? 'SI' : 'NO'
    ]);
    exportRowsToCsv('consolidado_general_notas_asistencia.csv', headers, rows);
  };

  const handleExportConsolidatedCsv = handleExportConsolidadoCsv;

  const handleSyncOfficialRosterNow = () => {
    const nextDs = normalizeAndSyncAcademicDataset(
      syncedDataset,
      students,
      courseModules,
      courseName
    );
    onUpdateDataset({
      ...nextDs,
      updatedAtIso: new Date().toISOString()
    });
    setFormFeedback(
      `✓ Nómina oficial sincronizada (${nextDs.records.length} estudiante(s) activos en el curso).`
    );
    setTimeout(() => setFormFeedback(null), 4000);
  };

  const handleExportConsolidadoExcel = () => {
    const headerRow: (string | number)[] = [
      'NO.',
      'ESTUDIANTE',
      'ID',
      ...activeClassIds.map((cId) => `NOTA FINAL C${cId}`),
      'NOTA P. (Hasta Clase Calificada)',
      `NOTA ACUM. (${shortClassesRangeLabel})`,
      'ESTADO',
      ...activeClassIds.flatMap((cId) => [`B1 C${cId}`, `B2 C${cId}`]),
      'TOTAL B1',
      'TOTAL B2',
      'INASISTENCIAS (Bloques)',
      'CLASES INASISTIDAS (Condicional B1 o B2 = 1)',
      'CLASES ASISTIDAS (Sin 1 en B1 y B2)',
      '% ASISTENCIA CLASES'
    ];
    const dataRows: (string | number)[][] = studentSummaries.map((s, idx) => [
      idx + 1,
      s.record.nombre,
      s.record.documento,
      ...activeClassIds.map((cId) => Number((s.classFinals[cId] ?? 0).toFixed(2))),
      Number(s.notaAcumulativaHastaCalificada.toFixed(2)),
      Number(s.notaAcumulativaTodasLasClases.toFixed(2)),
      s.estadoAcademico,
      ...activeClassIds.flatMap((cId) => [
        s.b1Inasistencia[cId] === 1 ? 1 : '',
        s.b2Inasistencia[cId] === 1 ? 1 : ''
      ]),
      s.fallasBloque1,
      s.fallasBloque2,
      s.totalFallasBloques,
      s.totalClasesInasistidas,
      s.totalClasesAsistidas,
      `${s.porcentajeAsistenciaClases}%`
    ]);
    downloadExcelFile(
      'calificaciones_y_asistencias_curso.xlsx',
      `Consolidado ${shortClassesRangeLabel}`,
      [headerRow, ...dataRows]
    );
  };

  const handleExportSingleClassCsv = (claseId: ClassSessionId) => {
    const cs = effectiveClassSessions.find((c) => c.id === claseId) || effectiveClassSessions[0];
    const headers = [
      'NO.',
      'ESTUDIANTE',
      'ID',
      `C${cs.id} Comportamiento (10%)`,
      `C${cs.id} Participación (15%)`,
      `C${cs.id} Examen (35%)`,
      `C${cs.id} Trabajo (40%)`,
      `NOTA FINAL C${cs.id}`,
      'B1 Inasistencias',
      'B2 Inasistencias',
      'Estado Asistencia Clase (Condicional)',
      'Observaciones'
    ];
    const rows = studentSummaries.map((s, idx) => {
      const c = s.record.clases[claseId];
      return [
        idx + 1,
        s.record.nombre,
        s.record.documento,
        c.comportamientoCalificado ? Number(c.comportamiento ?? 0).toFixed(1) : '',
        c.participacionCalificado ? Number(c.participacion ?? 0).toFixed(1) : '',
        c.examenCalificado ? Number(c.examen ?? 0).toFixed(1) : '',
        c.trabajoCalificado ? Number(c.trabajoPractico ?? 0).toFixed(1) : '',
        Number(s.classFinals[claseId] ?? 0).toFixed(2),
        s.b1Inasistencia[claseId] === 1 ? 1 : '',
        s.b2Inasistencia[claseId] === 1 ? 1 : '',
        s.claseInasistida[claseId] ? 'Inasistió (1)' : 'Asistió (0)',
        c.observacionDocente || ''
      ];
    });
    exportRowsToCsv(`notas_clase_${cs.id}.csv`, headers, rows);
  };

  const handleExportAbsenceMatrixCsv = () => {
    const headers = [
      'NO.',
      'ESTUDIANTE',
      'ID',
      ...activeClassIds.flatMap((cId) => [`B1 C${cId}`, `B2 C${cId}`]),
      'TOTAL B1',
      'TOTAL B2',
      'INASISTENCIAS',
      'CLASES INASISTIDAS (Condicional)',
      'CLASES ASISTIDAS'
    ];
    const rows = studentSummaries.map((s, idx) => [
      idx + 1,
      s.record.nombre,
      s.record.documento,
      ...activeClassIds.flatMap((cId) => [
        s.b1Inasistencia[cId] === 1 ? 1 : '',
        s.b2Inasistencia[cId] === 1 ? 1 : ''
      ]),
      s.fallasBloque1,
      s.fallasBloque2,
      s.totalFallasBloques,
      s.totalClasesInasistidas,
      s.totalClasesAsistidas
    ]);
    exportRowsToCsv('historial_inasistencias_condicional.csv', headers, rows);
  };

  const selectedFichaSummary = useMemo(
    () =>
      selectedStudentIdForFicha
        ? studentSummaries.find((s) => s.record.studentId === selectedStudentIdForFicha) || null
        : null,
    [selectedStudentIdForFicha, studentSummaries]
  );

  const selectedClassInfo =
    globalStats.classStats.find((c) => c.id === selectedClassId) || globalStats.classStats[0];

  return (
    <div className="space-y-6">
      {/* BARRA DE SINCRONIZACIÓN AUTOMÁTICA CON SERVIDOR Y FIRESTORE */}
      <OptionServerSaveBar
        sectionKey="modulo_gestion_academica_clases"
        label={`Módulo de Gestión Académica · Notas (${classesRangeLabel}) y Matriz de Asistencia`}
        autoSave={true}
        watchValue={dataset.updatedAtIso}
      />

      {/* CABECERA PRINCIPAL Y CENTRO AGRUPADO E INTEGRADO DE VISTAS Y HERRAMIENTAS DEL DOCENTE */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-700">
              {syncedDataset.courseName || courseName || 'Gestión Integral de Notas & Asistencia Semestral'} · {totalActiveClassesCount} Módulo(s) Activo(s)
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Calificaciones y Asistencias ({classesRangeLabel} · Exámenes · Control B1/B2)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Panel unificado e integrado: seleccione la vista de trabajo o despliegue las herramientas rápidas de calificación, llamado de asistencia en vivo y exportación en un mismo centro operativo.
            </p>
          </div>

          {/* Resumen rápido en píldoras de estado del curso */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800">
              📚 {totalActiveClassesCount} Módulo(s)
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-slate-800">
              👥 {globalStats.totalStudents} Estudiantes
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-xs font-mono font-bold text-sky-900">
              ⭐ Promedio: {globalStats.promedioGrupo.toFixed(1)} / 5.0
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono font-bold text-emerald-900">
              📅 Asistencia: {globalStats.tasaAsistenciaGlobal}%
            </div>
          </div>
        </div>

        {/* ================================================================================= */}
        {/* ZONA AGRUPADA E INTEGRADA: VISTAS DE TRABAJO + BARRA DE HERRAMIENTAS EN UN BLOQUE */}
        {/* ================================================================================= */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
                1. Vistas Integradas del Curso ({classesRangeLabel})
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Sincronizado con los {totalActiveClassesCount} módulo(s) reales del curso asignado · Seleccione una tarjeta interactiva
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Tarjeta Interactiva 1: Notas por Clase / Módulo */}
              <button
                type="button"
                onClick={() => setActiveSubView('vista2_por_clase')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  activeSubView === 'vista2_por_clase'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-emerald-500/40'
                    : 'bg-white hover:border-emerald-300 text-slate-900 border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                      activeSubView === 'vista2_por_clase'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Tarjeta 1 · Por Clase / Módulo</span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 ${
                      activeSubView === 'vista2_por_clase' ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-bold leading-snug">
                    Notas por Clase / Módulo ({shortClassesRangeLabel})
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      activeSubView === 'vista2_por_clase' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Menú de tarjetas de clases/módulos activos, plantilla de notas C{selectedClassId}, consolidado y acceso al editor.
                  </p>
                </div>
                <div
                  className={`text-[11px] font-mono font-semibold pt-2 border-t flex items-center justify-between ${
                    activeSubView === 'vista2_por_clase'
                      ? 'border-slate-700 text-emerald-300'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span>Activa: Clase C{selectedClassId}</span>
                  <span>{totalActiveClassesCount} Clases / Módulos</span>
                </div>
              </button>

              {/* Tarjeta Interactiva 2: Consolidado de Notas */}
              <button
                type="button"
                onClick={() => setActiveSubView('vista1_consolidado')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  activeSubView === 'vista1_consolidado'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-sky-500/40'
                    : 'bg-white hover:border-sky-300 text-slate-900 border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                      activeSubView === 'vista1_consolidado'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                        : 'bg-sky-100 text-sky-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Tarjeta 2 · Consolidado</span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 ${
                      activeSubView === 'vista1_consolidado' ? 'text-sky-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-bold leading-snug">
                    Consolidado de Notas General
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      activeSubView === 'vista1_consolidado' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Exámenes, Retos, Trabajos, Sustentación, Comportamiento, Inasistencia y demás información.
                  </p>
                </div>
                <div
                  className={`text-[11px] font-mono font-semibold pt-2 border-t flex items-center justify-between ${
                    activeSubView === 'vista1_consolidado'
                      ? 'border-slate-700 text-sky-300'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span>Aprob: {globalStats.aprobadosCount}/{globalStats.totalStudents}</span>
                  <span>Prom: {globalStats.promedioGrupo.toFixed(2)}</span>
                </div>
              </button>

              {/* Tarjeta Interactiva 3: Editor de Notas por Clase / Módulo */}
              <button
                type="button"
                onClick={() => setActiveSubView('vista_editor_notas')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  activeSubView === 'vista_editor_notas'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-500/40'
                    : 'bg-white hover:border-indigo-300 text-slate-900 border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                      activeSubView === 'vista_editor_notas'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                        : 'bg-indigo-100 text-indigo-900'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Tarjeta 3 · Editor de Notas</span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 ${
                      activeSubView === 'vista_editor_notas' ? 'text-indigo-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-bold leading-snug">
                    Editor de Notas por Clase / Módulo
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      activeSubView === 'vista_editor_notas' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Opciones: Editor Individual, Editor por Seleccionados y Editor por Lote (Exámenes, Retos, Trabajos, Sustentación, Comportamiento, Inasistencia).
                  </p>
                </div>
                <div
                  className={`text-[11px] font-mono font-semibold pt-2 border-t flex items-center justify-between ${
                    activeSubView === 'vista_editor_notas'
                      ? 'border-slate-700 text-indigo-300'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span>3 Modos de Edición</span>
                  <span>{selectedStudentIds.length} sel. / {syncedDataset.records.length} total</span>
                </div>
              </button>

              {/* Tarjeta Interactiva 4: Otras Zonas y Secciones Agrupadas de Forma Ordenada */}
              <button
                type="button"
                onClick={() => setActiveSubView('vista_otras_zonas')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  activeSubView === 'vista_otras_zonas' ||
                  activeSubView === 'vista3_ausentismo' ||
                  activeSubView === 'vista4_ia' ||
                  activeSubView === 'vista5_examenes'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-amber-500/40'
                    : 'bg-white hover:border-amber-300 text-slate-900 border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                      activeSubView === 'vista_otras_zonas' ||
                      activeSubView === 'vista3_ausentismo' ||
                      activeSubView === 'vista4_ia' ||
                      activeSubView === 'vista5_examenes'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tarjeta 4 · Otras Zonas</span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 ${
                      activeSubView === 'vista_otras_zonas' ||
                      activeSubView === 'vista3_ausentismo' ||
                      activeSubView === 'vista4_ia' ||
                      activeSubView === 'vista5_examenes'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-sm font-bold leading-snug">
                    Otras Zonas y Secciones Agrupadas
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-relaxed ${
                      activeSubView === 'vista_otras_zonas' ||
                      activeSubView === 'vista3_ausentismo' ||
                      activeSubView === 'vista4_ia' ||
                      activeSubView === 'vista5_examenes'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    Matriz de Ausentismo, Competencias y Plan de Choque, Exámenes Oficiales, Exportación Excel/CSV y Nómina.
                  </p>
                </div>
                <div
                  className={`text-[11px] font-mono font-semibold pt-2 border-t flex items-center justify-between ${
                    activeSubView === 'vista_otras_zonas' ||
                    activeSubView === 'vista3_ausentismo' ||
                    activeSubView === 'vista4_ia' ||
                    activeSubView === 'vista5_examenes'
                      ? 'border-slate-700 text-amber-300'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <span>4 Secciones Ordenadas</span>
                  <span>Fallas: {globalStats.totalInasistenciasSemestre}</span>
                </div>
              </button>
            </div>
          </div>

          {/* SELECTORES RÁPIDOS INTEGRADOS: EDITOR INDIVIDUAL, EDITOR POR SELECCIONADOS Y EDITOR POR LOTE */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-extrabold uppercase tracking-wider text-indigo-800 text-[11px]">
                2. Selectores de Edición Instantánea (Notas y Asistencias · C{selectedClassId}):
              </span>
              {[
                {
                  id: 'individual',
                  label: '👤 Editor Individual',
                  badge: '1 alumno'
                },
                {
                  id: 'selected',
                  label: '☑️ Editor por Seleccionados',
                  badge: `${selectedStudentIds.length} marcados`
                },
                {
                  id: 'all_course',
                  label: '👥 Editor por Lote',
                  badge: `${syncedDataset.records.length} alumnos`
                }
              ].map((sel) => {
                const isSelectedMode = quickClassScope === sel.id;
                return (
                  <button
                    key={sel.id}
                    type="button"
                    onClick={() => {
                      setQuickClassScope(sel.id as any);
                      setManualGraderScope(sel.id as any);
                      setBulkTargetMode(
                        sel.id === 'individual'
                          ? 'individual'
                          : sel.id === 'selected'
                          ? 'selected'
                          : 'all'
                      );
                    }}
                    className={`px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                      isSelectedMode
                        ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-400/40'
                        : 'bg-slate-100 hover:bg-indigo-50 text-slate-800 border border-slate-300'
                    }`}
                  >
                    <span>{sel.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                        isSelectedMode
                          ? 'bg-indigo-900/60 text-indigo-100'
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      {sel.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(Number(e.target.value) as ClassSessionId)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-50 font-mono font-bold text-slate-900"
              >
                {effectiveClassSessions.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    CLASE C{cs.id}: {cs.shortTitle}
                  </option>
                ))}
              </select>

              {quickClassScope === 'individual' && (
                <select
                  value={quickClassIndividualId || syncedDataset.records[0]?.studentId || ''}
                  onChange={(e) => setQuickClassIndividualId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-indigo-50/40 font-semibold text-slate-900 max-w-[210px]"
                >
                  {syncedDataset.records.map((r) => (
                    <option key={r.studentId} value={r.studentId}>
                      {r.nombre} ({r.documento})
                    </option>
                  ))}
                </select>
              )}

              <select
                value={quickClassField}
                onChange={(e) => setQuickClassField(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
              >
                <option value="todos_componentes">Todos los Componentes C{selectedClassId}</option>
                <option value="comportamiento">C{selectedClassId} Comportamiento</option>
                <option value="participacion">C{selectedClassId} Participación / Retos</option>
                <option value="examen">C{selectedClassId} Examen</option>
                <option value="trabajoPractico">C{selectedClassId} Trabajo</option>
                <option value="notaFinal">NOTA FINAL C{selectedClassId}</option>
              </select>

              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={quickClassValue}
                onChange={(e) => setQuickClassValue(parseFloat(e.target.value) || 0)}
                className="w-18 px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono font-bold text-center text-slate-900"
              />

              <button
                type="button"
                onClick={handleQuickApplyInActiveClass}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer shadow-2xs"
              >
                ✓ Guardar Nota C{selectedClassId}
              </button>
            </div>
          </div>
        </div>

        {/* BARRA CONTEXTUAL CUANDO HAY ESTUDIANTES SELECCIONADOS CON CASILLA ☑ */}
        {selectedStudentIds.length > 0 && (
          <div className="bg-indigo-50 border-2 border-indigo-300 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <CheckCircle2 className="w-4 h-4 text-indigo-700 shrink-0" />
              <span>
                {selectedStudentIds.length} estudiante(s) seleccionado(s) con casilla ☑ — Edición rápida:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setManualGraderScope('selected');
                  setBulkTargetMode('selected');
                  setActiveSubView('vista_editor_notas');
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Abrir Editor por Seleccionados ({selectedStudentIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkTargetMode('selected');
                  setBulkTargetClasses([selectedClassId]);
                  setBulkEditorModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editor Avanzado en Modal ({selectedStudentIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedStudentIds([])}
                className="px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Limpiar Selección
              </button>
            </div>
          </div>
        )}

        {formFeedback && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 text-xs font-bold text-emerald-950 flex items-center justify-between">
            <span>{formFeedback}</span>
            <button
              type="button"
              onClick={() => setFormFeedback(null)}
              className="text-emerald-800 hover:text-emerald-950 font-mono text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================================== */}
      {/* VISTA 1: CONSOLIDADO GENERAL DE NOTAS & ASISTENCIA                                    */}
      {/* ===================================================================================== */}
      {activeSubView === 'vista1_consolidado' && (
        <div className="space-y-5">
          {/* TABLA INTERACTIVA PRINCIPAL: CONSOLIDADO DE NOTAS (EXÁMENES, RETOS, TRABAJOS, SUSTENTACIÓN, COMPORTAMIENTO, INASISTENCIA Y DEMÁS INFORMACIÓN) */}
          <div className="bg-white border-2 border-sky-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-800">
                  Consolidado Integral Sincronizado · Curso Activo: {syncedDataset.courseName || 'Curso Oficial'} ({shortClassesRangeLabel})
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Consolidado de Notas: Exámenes, Retos, Trabajos, Sustentación, Comportamiento, Inasistencia y Demás Información
                </h3>
                <p className="text-xs text-slate-600">
                  Resumen real por estudiante sincronizado con Control de Estudiantes y los {totalActiveClassesCount} módulo(s) activos del curso.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSubView('vista_editor_notas')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Ir al Editor de Notas por Clase/Módulo</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportConsolidadoExcel}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Exportar Consolidado (.xlsx)</span>
                </button>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-mono font-bold uppercase">
                    <th className="py-2.5 px-2 text-center border-r border-slate-700">NO.</th>
                    <th className="py-2.5 px-2.5 border-r border-slate-700">ESTUDIANTE</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700">ID</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-emerald-950">
                      EXÁMENES ({shortClassesRangeLabel})
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-indigo-950">
                      RETOS / INSIGNIAS
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-sky-950">
                      TRABAJOS PRÁCTICOS
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-violet-950">
                      SUSTENTACIÓN / PART.
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-teal-950">
                      COMPORTAMIENTO
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-amber-950">
                      INASISTENCIAS (B1/B2)
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-700 bg-amber-500 text-slate-950">
                      NOTA ACUMULADA
                    </th>
                    <th className="py-2.5 px-2.5 text-center">
                      ESTADO Y DEMÁS INFORMACIÓN
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSummaries.map((s, idx) => {
                    const r = s.record;
                    const stRoster = rosterMap.get(r.studentId);
                    let examGradedCount = 0;
                    let examSum = 0;
                    let trabGradedCount = 0;
                    let trabSum = 0;
                    let partGradedCount = 0;
                    let partSum = 0;
                    let compGradedCount = 0;
                    let compSum = 0;

                    activeClassIds.forEach((cId) => {
                      const cl = r.clases[cId];
                      if (!cl) return;
                      if (cl.examenCalificado) {
                        examGradedCount++;
                        examSum += cl.examen;
                      }
                      if (cl.trabajoCalificado) {
                        trabGradedCount++;
                        trabSum += cl.trabajoPractico;
                      }
                      if (cl.participacionCalificado) {
                        partGradedCount++;
                        partSum += cl.participacion;
                      }
                      if (cl.comportamientoCalificado) {
                        compGradedCount++;
                        compSum += cl.comportamiento;
                      }
                    });

                    const examAvg = examGradedCount > 0 ? examSum / examGradedCount : 0;
                    const trabAvg = trabGradedCount > 0 ? trabSum / trabGradedCount : 0;
                    const partAvg = partGradedCount > 0 ? partSum / partGradedCount : 0;
                    const compAvg = compGradedCount > 0 ? compSum / compGradedCount : 0;

                    let retosRealizados = 0;
                    let retosNotaSum = 0;
                    activeClassIds.forEach((cId) => {
                      const prog = stRoster?.progresoRetos?.[cId as 1 | 2 | 3 | 4 | 5];
                      const pct = Number(prog?.mejorPorcentaje ?? (prog as any)?.mejorPuntaje ?? 0);
                      if (prog && (prog.intentosUsados > 0 || pct > 0 || prog.insigniaDesbloqueada)) {
                        retosRealizados++;
                        retosNotaSum += Number(((pct / 100) * 5).toFixed(1));
                      }
                    });
                    const retosAvg = retosRealizados > 0 ? retosNotaSum / retosRealizados : partAvg;

                    return (
                      <tr key={r.studentId} className="hover:bg-slate-50/90">
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2.5 font-bold text-slate-900 border-r border-slate-200">
                          <div>{r.nombre}</div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Cód: {stRoster?.codigoAcceso || '—'}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                          {r.documento}
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-emerald-50/30">
                          <div className="font-bold text-emerald-900">
                            {examGradedCount > 0 ? `${examAvg.toFixed(1)} / 5.0` : 'Sin nota'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {examGradedCount}/{totalActiveClassesCount} calif. · Ex.Int:{' '}
                            {s.notaExamenIntegralPlataforma !== null &&
                            s.notaExamenIntegralPlataforma !== undefined
                              ? Number(s.notaExamenIntegralPlataforma).toFixed(1)
                              : Number(s.notaExamenIntegral ?? 0).toFixed(1)}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-indigo-50/30">
                          <div className="font-bold text-indigo-900">
                            {retosRealizados > 0 || partGradedCount > 0
                              ? `${retosAvg.toFixed(1)} / 5.0`
                              : 'Sin reto'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            🏅 {s.insigniasRetosCount} insig. · {retosRealizados} retos
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-sky-50/30">
                          <div className="font-bold text-sky-900">
                            {trabGradedCount > 0 ? `${trabAvg.toFixed(1)} / 5.0` : 'Sin nota'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {trabGradedCount}/{totalActiveClassesCount} calif.
                            {s.trabajosPendientesRevisionCount > 0
                              ? ` · ⏳ ${s.trabajosPendientesRevisionCount} pend.`
                              : ''}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-violet-50/30">
                          <div className="font-bold text-violet-900">
                            {partGradedCount > 0 ? `${partAvg.toFixed(1)} / 5.0` : 'Sin nota'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {partGradedCount}/{totalActiveClassesCount} sesiones
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-teal-50/30">
                          <div className="font-bold text-teal-900">
                            {compGradedCount > 0 ? `${compAvg.toFixed(1)} / 5.0` : 'Sin nota'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {compGradedCount}/{totalActiveClassesCount} sesiones
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono border-r border-slate-200 bg-amber-50/40">
                          <div className="font-bold text-slate-900">
                            {s.totalFallasBloques} falla(s) ({s.porcentajeAsistencia}%)
                          </div>
                          <div className="text-[10px] text-slate-500">
                            B1: {s.fallasBloque1} · B2: {s.fallasBloque2} · Clases Inasist: {s.totalClasesInasistidas}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-extrabold border-r border-slate-200 bg-amber-50">
                          {s.hasAnyAcademicGrade ? (
                            <span
                              className={`px-2 py-0.5 rounded ${
                                s.promedioAcumulado >= 3.0
                                  ? 'bg-emerald-100 text-emerald-950'
                                  : 'bg-red-100 text-red-900'
                              }`}
                            >
                              {s.promedioAcumulado.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">Sin nota</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                !s.hasAnyAcademicGrade
                                  ? 'bg-slate-100 text-slate-600'
                                  : s.aprobado
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {s.estadoAcademico}
                            </span>
                            {r.bonificacionRetosAplicada && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 font-mono text-[10px] font-bold">
                                +0.3 Retos
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedStudentIdForFicha(r.studentId)}
                              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Ver Ficha
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5 TARJETAS KPI EN TIEMPO REAL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">Promedio General del Grupo</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {globalStats.promedioGrupo.toFixed(1)} <span className="text-sm text-slate-500">/ 5.0</span>
              </div>
              <div className="text-[11px] font-mono text-slate-600">
                Nota máx: <strong>{globalStats.notaMaxima.toFixed(1)}</strong> | Nota mín:{' '}
                <strong>{globalStats.notaMinima.toFixed(1)}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">Tasa de Asistencia Global</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-sky-700">
                {globalStats.tasaAsistenciaGlobal}%
              </div>
              <div className="text-[11px] text-slate-600">
                <strong>{globalStats.totalInasistenciasSemestre}</strong> inasistencias acumuladas en el semestre
              </div>
            </div>

            <div
              onClick={() => setQuickFilter(quickFilter === 'aprobados' ? 'todos' : 'aprobados')}
              className={`bg-white border rounded-2xl p-4 shadow-xs space-y-1.5 cursor-pointer transition-all ${
                quickFilter === 'aprobados'
                  ? 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50/30'
                  : 'border-emerald-200 hover:border-emerald-400'
              }`}
            >
              <div className="text-xs font-semibold text-emerald-800 flex items-center justify-between">
                <span>Estudiantes Aprobados</span>
                <span className="text-[10px] font-mono underline">Filtrar</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {globalStats.aprobadosCount} de {globalStats.totalStudents}
              </div>
              <div className="text-[11px] text-emerald-900">
                <strong>{globalStats.aprobadosPct}%</strong> con promedio ≥ 3.0
              </div>
            </div>

            <div
              onClick={() => setQuickFilter(quickFilter === 'en_riesgo' ? 'todos' : 'en_riesgo')}
              className={`bg-white border rounded-2xl p-4 shadow-xs space-y-1.5 cursor-pointer transition-all ${
                quickFilter === 'en_riesgo'
                  ? 'border-amber-600 ring-2 ring-amber-500/30 bg-amber-50/30'
                  : 'border-amber-200 hover:border-amber-400'
              }`}
            >
              <div className="text-xs font-semibold text-amber-800 flex items-center justify-between">
                <span>En Riesgo Académico</span>
                <span className="text-[10px] font-mono underline">Filtrar</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                {globalStats.enRiesgoCount} de {globalStats.totalStudents}
              </div>
              <div className="text-[11px] text-amber-900">
                <strong>{globalStats.enRiesgoPct}%</strong> con promedio &lt; 3.0
              </div>
            </div>

            <div
              onClick={() =>
                setQuickFilter(quickFilter === 'fallas_criticas' ? 'todos' : 'fallas_criticas')
              }
              className={`bg-white border rounded-2xl p-4 shadow-xs space-y-1.5 cursor-pointer transition-all ${
                quickFilter === 'fallas_criticas'
                  ? 'border-red-600 ring-2 ring-red-500/30 bg-red-50/30'
                  : 'border-red-200 hover:border-red-400'
              }`}
            >
              <div className="text-xs font-semibold text-red-800 flex items-center justify-between">
                <span>Alertas de Ausentismo</span>
                <span className="text-[10px] font-mono underline">Filtrar</span>
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-red-600">
                {globalStats.alertasCriticasAusentismoCount} estudiantes
              </div>
              <div className="text-[11px] text-red-900">
                Con <strong>≥ 3 fallas</strong> (límite reglamentario)
              </div>
            </div>
          </div>

          {/* 2 TARJETAS INTERACTIVAS DE ANALÍTICA COMPLEMENTARIA (RESUMEN POR COMPETENCIAS Y GRÁFICOS) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => setShowCompetencySummaryInVista1((prev) => !prev)}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                showCompetencySummaryInVista1
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Resumen Automático por Competencias (C1 a C6)</span>
                </div>
                <p
                  className={`text-[11px] ${
                    showCompetencySummaryInVista1 ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  Ver promedios por competencia curricular y desempeño detallado
                </p>
              </div>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                  showCompetencySummaryInVista1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                }`}
              >
                {showCompetencySummaryInVista1 ? 'Ocultar ▲' : 'Desplegar ▼'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowConsolidatedCharts((prev) => !prev)}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                showConsolidatedCharts
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Gráficos Estadísticos del Grupo (C1–C6 e Histograma)</span>
                </div>
                <p
                  className={`text-[11px] ${
                    showConsolidatedCharts ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  Comparativa de barras con línea de corte en 3.0 y distribución de notas
                </p>
              </div>
              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 ${
                  showConsolidatedCharts
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-900 border border-sky-200'
                }`}
              >
                {showConsolidatedCharts ? 'Ocultar ▲' : 'Desplegar ▼'}
              </span>
            </button>
          </div>

          {showCompetencySummaryInVista1 && (
            <AcademicSummaryDashboard
              dataset={syncedDataset}
              students={students}
              attempts={attempts}
            />
          )}

          {showConsolidatedCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Gráfico 1: Comparativa de Promedios por Clase con línea de corte en 3.0 */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Comparativa de Promedios por Clase (C1 a C6)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gráfico de barras con línea de corte reglamentaria en 3.0 (Aprobatorio)
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200">
                  Corte: 3.0 / 5.0
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={globalStats.classStats}
                    margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="code" tick={{ fontSize: 12, fontWeight: 600 }} />
                    <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: any) => [`${Number(val).toFixed(2)} / 5.0`, 'Promedio']}
                      labelFormatter={(label) => {
                        const found = globalStats.classStats.find((c) => c.code === label);
                        return found ? found.fullTitle : String(label);
                      }}
                    />
                    <ReferenceLine
                      y={3.0}
                      stroke="#dc2626"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{
                        value: 'Corte 3.0 (Aprobatorio)',
                        position: 'insideTopRight',
                        fill: '#dc2626',
                        fontSize: 11,
                        fontWeight: 700
                      }}
                    />
                    <Bar dataKey="promedio" radius={[8, 8, 0, 0]}>
                      {globalStats.classStats.map((entry) => (
                        <Cell
                          key={entry.code}
                          fill={entry.promedio >= 3.0 ? '#0284c7' : '#f59e0b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Histograma de Distribución de Notas */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    Histograma de Distribución de Notas del Grupo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Segmentación en Crítico (&lt;2.0), En riesgo (2.0-2.9), Aprobado (3.0-3.9) y Excelente (4.0-5.0)
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800">
                  {globalStats.totalStudents} alumnos
                </span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={globalStats.histogramData}
                    margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val} estudiante(s)`, 'Cantidad']}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {globalStats.histogramData.map((item, idx) => (
                        <Cell key={idx} fill={item.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          )}

          {/* BARRA DE BÚSQUEDA, FILTROS Y SELECTOR DE SECCIONES EXCEL EN VISTA 1 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Buscador interactivo */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar estudiante por nombre o documento ID..."
                  className="w-full min-h-[40px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              {/* Filtros rápidos de estado */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    quickFilter === 'todos'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Todos ({globalStats.totalStudents})
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFilter('aprobados')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    quickFilter === 'aprobados'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Aprobados ({globalStats.aprobadosCount})
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFilter('en_riesgo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    quickFilter === 'en_riesgo'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  En Riesgo ({globalStats.enRiesgoCount})
                </button>
                <button
                  type="button"
                  onClick={() => setQuickFilter('fallas_criticas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    quickFilter === 'fallas_criticas'
                      ? 'bg-red-600 text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Fallas Críticas ({globalStats.alertasCriticasAusentismoCount})
                </button>
              </div>
            </div>

            {/* Tarjetas de Navegación Interna de la Sábana Excel (Permite ver todo ordenado o filtrar una sección) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExcelSectionFilter('all_sections')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  excelSectionFilter === 'all_sections'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="text-xs font-bold">📋 Vista Completa Ordenada (Excel)</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    excelSectionFilter === 'all_sections' ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  1. Notas por Clase + 2. Nota Acumulativa + 3. Historial Inasistencia
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExcelSectionFilter('notas_clases')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  excelSectionFilter === 'notas_clases'
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-2xs'
                    : 'bg-emerald-50/60 hover:bg-emerald-100/70 text-slate-800 border-emerald-200'
                }`}
              >
                <div className="text-xs font-bold">1️⃣ Notas por Clase / Módulo ({shortClassesRangeLabel})</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    excelSectionFilter === 'notas_clases' ? 'text-emerald-200' : 'text-slate-600'
                  }`}
                >
                  4 componentes ponderados y Nota Final por Módulo
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExcelSectionFilter('nota_acumulativa')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  excelSectionFilter === 'nota_acumulativa'
                    ? 'bg-sky-900 text-white border-sky-900 shadow-2xs'
                    : 'bg-sky-50/60 hover:bg-sky-100/70 text-slate-800 border-sky-200'
                }`}
              >
                <div className="text-xs font-bold">2️⃣ Nota Acumulativa ({classesRangeLabel} · NOTA P.)</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    excelSectionFilter === 'nota_acumulativa' ? 'text-sky-200' : 'text-slate-600'
                  }`}
                >
                  Acumulado hasta la clase calificada o en los {totalActiveClassesCount} módulo(s)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExcelSectionFilter('historial_inasistencia')}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  excelSectionFilter === 'historial_inasistencia'
                    ? 'bg-amber-900 text-white border-amber-900 shadow-2xs'
                    : 'bg-amber-50/60 hover:bg-amber-100/70 text-slate-800 border-amber-200'
                }`}
              >
                <div className="text-xs font-bold">3️⃣ Historial de Inasistencias (B1 / B2)</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    excelSectionFilter === 'historial_inasistencia' ? 'text-amber-200' : 'text-slate-600'
                  }`}
                >
                  Condicional: si B1=1 o B2=1 se toma clase/módulo inasistido
                </div>
              </button>
            </div>
          </div>

          {/* ===================================================================================== */}
          {/* SECCIÓN EXCEL 1: NOTAS CORRESPONDIENTES POR CLASE / MÓDULO (ORDENADAS C1 A C6)        */}
          {/* ===================================================================================== */}
          {(excelSectionFilter === 'all_sections' || excelSectionFilter === 'notas_clases') && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-700">
                    Sección 1 (Formato Excel) · Notas Correspondientes por Clase / Módulo
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Planilla Ordenada por Clase/Módulo ({classesRangeLabel})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Cada clase/módulo incluye sus 4 notas ponderadas según el currículo del curso, <strong>NOTA FINAL ({shortClassesRangeLabel})</strong> y registro de inasistencias por bloque (<strong>B1</strong> y <strong>B2</strong> con <strong>1</strong> = inasistió).
                  </p>
                </div>

                {/* Conmutador: Ver una clase activa o Ver todas las clases del curso seguidas en orden */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setClassDisplayMode('single')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        classDisplayMode === 'single'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Ver por Pestaña de Módulo (C{selectedClassId})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassDisplayMode('all_ordered')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        classDisplayMode === 'all_ordered'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Ver Todos Ordenados ({classesRangeLabel})
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra de tarjetas selectoras de Módulos activos del curso */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
                {globalStats.classStats.map((cs) => {
                  const active = selectedClassId === cs.id;
                  return (
                    <button
                      key={cs.id}
                      type="button"
                      onClick={() => {
                        setSelectedClassId(cs.id);
                        setManualGraderClassTarget(cs.id);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        active
                          ? 'bg-emerald-950 text-white border-emerald-900 shadow-xs ring-2 ring-emerald-500/40'
                          : 'bg-slate-50 hover:bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          CLASE {cs.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            active ? 'text-emerald-300' : 'text-slate-500'
                          }`}
                        >
                          Mód. {cs.id}
                        </span>
                      </div>
                      <div className="text-xs font-bold truncate" title={cs.fullTitle}>
                        {cs.shortTitle}
                      </div>
                      <div
                        className={`text-[10px] font-mono flex items-center justify-between pt-1 border-t ${
                          active ? 'border-emerald-800 text-emerald-200' : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <span>Prom: {cs.promedio.toFixed(2)}</span>
                        <span>Asist: {cs.asistenciaPct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Renderizado de la(s) tabla(s) de Clase estilo Excel */}
              <div className="space-y-8">
                {(classDisplayMode === 'all_ordered'
                  ? activeClassIds
                  : [selectedClassId]
                ).map((cId) => {
                  const csDef =
                    effectiveClassSessions.find((x) => x.id === cId) || effectiveClassSessions[0];
                  const w = csDef?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
                  const csStat =
                    globalStats.classStats.find((x) => x.id === cId) || globalStats.classStats[0];

                  return (
                    <div
                      key={cId}
                      className="border-2 border-slate-300 rounded-2xl overflow-hidden bg-white shadow-2xs"
                    >
                      {/* Encabezado Superior Estilo Excel: CLASE N */}
                      <div className="bg-slate-900 text-white px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-extrabold text-xs uppercase tracking-wider">
                            CLASE {cId}
                          </span>
                          <h4 className="text-sm sm:text-base font-bold text-white">
                            {csDef?.fullTitle || `Clase ${cId}`}
                          </h4>
                          <span className="text-xs font-mono text-sky-300">
                            (Promedio Clase: {csStat.promedio.toFixed(2)} · Asistencia: {csStat.asistenciaPct}%)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassId(cId);
                              setQuickClassScope('individual');
                              handleSwitchView('vista_editor_notas');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold cursor-pointer"
                          >
                            👤 Editor Individual C{cId}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassId(cId);
                              setQuickClassScope('selected');
                              handleSwitchView('vista_editor_notas');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            ☑️ Editor Seleccionados C{cId}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassId(cId);
                              setQuickClassScope('all_course');
                              handleSwitchView('vista_editor_notas');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-extrabold cursor-pointer"
                          >
                            👥 Editor por Lote C{cId}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSingleClassCsv(cId)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV Clase {cId}</span>
                          </button>
                        </div>
                      </div>

                      <div className="w-full overflow-x-auto">
                        <table className="w-full table-auto border-collapse text-left">
                          <thead>
                            {/* Fila de ponderaciones tipo Excel */}
                            <tr className="bg-amber-50/90 border-b border-slate-300 text-[10px] font-mono font-bold text-slate-800">
                              <th colSpan={4} className="py-1.5 px-2.5 border-r border-slate-300 uppercase">
                                SECCIÓN DE NOTAS CORRESPONDIENTES · CLASE {cId} (MÓDULO {cId})
                              </th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-100/80">
                                {w.comportamientoPct}%
                              </th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-100/80">
                                {w.participacionPct}%
                              </th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-100/80">
                                {w.examenPct}%
                              </th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-100/80">
                                {w.trabajoPct}%
                              </th>
                              <th className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-200/80 text-slate-950">
                                100%
                              </th>
                              <th colSpan={3} className="py-1.5 px-2 text-center border-r border-slate-300 bg-sky-50 text-sky-950">
                                INASISTENCIAS BLOQUES (1 = Falla)
                              </th>
                              <th className="py-1.5 px-2 text-center bg-slate-100">
                                ANOTACIONES
                              </th>
                            </tr>
                            <tr className="border-b-2 border-slate-300 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-800">
                              <th className="py-2.5 px-2 text-center w-8 border-r border-slate-200">
                                <input
                                  type="checkbox"
                                  checked={
                                    filteredSummaries.length > 0 &&
                                    filteredSummaries.every((s) =>
                                      selectedStudentIds.includes(s.record.studentId)
                                    )
                                  }
                                  onChange={toggleSelectAllFiltered}
                                  className="rounded border-slate-300 cursor-pointer"
                                />
                              </th>
                              <th className="py-2.5 px-2 text-center w-10 border-r border-slate-200">NO.</th>
                              <th className="py-2.5 px-2.5 border-r border-slate-200">ESTUDIANTE</th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-200">ID</th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-200">
                                C{cId} Comportamiento
                              </th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-200">
                                C{cId} Participación
                              </th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-200">
                                C{cId} Examen
                              </th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-200">
                                C{cId} Trabajo
                              </th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-300 bg-amber-100/60 text-slate-950">
                                NOTA FINAL C{cId}
                              </th>
                              <th className="py-2.5 px-1.5 text-center border-r border-slate-200 bg-sky-50/70">
                                B1 Inasistencias
                              </th>
                              <th className="py-2.5 px-1.5 text-center border-r border-slate-200 bg-sky-50/70">
                                B2 Inasistencias
                              </th>
                              <th className="py-2.5 px-2 text-center border-r border-slate-300 bg-sky-100/60">
                                Estado C{cId}
                              </th>
                              <th className="py-2.5 px-2.5">Observaciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-xs">
                            {filteredSummaries.map((s, idx) => {
                              const c = s.record.clases[cId];
                              const classFinal = s.classFinals[cId];
                              const hasClassFinal = s.classHasFinalGrade[cId];
                              const isSelected = selectedStudentIds.includes(s.record.studentId);
                              const b1Val = s.b1Inasistencia?.[cId] ?? (c.asistenciaB1Estado === 'falla' ? 1 : 0);
                              const b2Val = s.b2Inasistencia?.[cId] ?? (c.asistenciaB2Estado === 'falla' ? 1 : 0);
                              const isClassMissed = s.claseInasistida?.[cId] ?? (b1Val === 1 || b2Val === 1);

                              return (
                                <tr
                                  key={`${cId}-${s.record.studentId}`}
                                  className={`hover:bg-slate-50/90 transition-colors ${
                                    isSelected ? 'bg-indigo-50/50' : ''
                                  }`}
                                >
                                  <td className="py-2 px-2 text-center border-r border-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelectStudent(s.record.studentId)}
                                      className="rounded border-slate-300 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                                    {idx + 1}
                                  </td>
                                  <td className="py-2 px-2.5 border-r border-slate-200">
                                    <span className="font-bold text-slate-900">{s.record.nombre}</span>
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono text-slate-700 border-r border-slate-200">
                                    {s.record.documento}
                                  </td>

                                  {/* 4 Componentes de la Clase/Módulo */}
                                  {(
                                    [
                                      'comportamiento',
                                      'participacion',
                                      'examen',
                                      'trabajoPractico'
                                    ] as const
                                  ).map((field) => {
                                    const isGraded =
                                      field === 'comportamiento'
                                        ? Boolean(c.comportamientoCalificado)
                                        : field === 'participacion'
                                        ? Boolean(c.participacionCalificado)
                                        : field === 'examen'
                                        ? Boolean(c.examenCalificado)
                                        : Boolean(c.trabajoCalificado);
                                    const isPendingReview =
                                      field === 'trabajoPractico' &&
                                      c.trabajoEstado === 'pendiente_revision' &&
                                      !isGraded;

                                    return (
                                      <td
                                        key={field}
                                        className="py-1.5 px-1.5 text-center border-r border-slate-200"
                                      >
                                        <div className="flex flex-col items-center gap-0.5">
                                          <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="5"
                                            placeholder="Sin nota"
                                            value={isGraded ? c[field] : ''}
                                            onChange={(e) => {
                                              const raw = e.target.value.trim();
                                              if (raw === '') {
                                                handleUpdateStudentClassField(
                                                  s.record.studentId,
                                                  cId,
                                                  (prev) => ({
                                                    ...prev,
                                                    [field]: 0,
                                                    ...(field === 'comportamiento'
                                                      ? { comportamientoCalificado: false }
                                                      : field === 'participacion'
                                                      ? {
                                                          participacionCalificado: false,
                                                          participacionManualOverride: true
                                                        }
                                                      : field === 'examen'
                                                      ? {
                                                          examenCalificado: false,
                                                          examenManualOverride: true
                                                        }
                                                      : {
                                                          trabajoCalificado: false,
                                                          trabajoEstado: prev.trabajoEntregaTexto
                                                            ? 'pendiente_revision'
                                                            : 'sin_entregar'
                                                        }),
                                                    autoCalcularNotaFinal: true
                                                  })
                                                );
                                                return;
                                              }
                                              const val = clampGrade05(parseFloat(raw) || 0);
                                              handleUpdateStudentClassField(
                                                s.record.studentId,
                                                cId,
                                                (prev) => ({
                                                  ...prev,
                                                  [field]: val,
                                                  ...(field === 'comportamiento'
                                                    ? { comportamientoCalificado: true }
                                                    : field === 'participacion'
                                                    ? {
                                                        participacionCalificado: true,
                                                        participacionManualOverride: true
                                                      }
                                                    : field === 'examen'
                                                    ? {
                                                        examenCalificado: true,
                                                        examenManualOverride: true
                                                      }
                                                    : {
                                                        trabajoCalificado: true,
                                                        trabajoEstado: 'calificado'
                                                      }),
                                                  autoCalcularNotaFinal: true
                                                })
                                              );
                                            }}
                                            className={`w-16 px-1.5 py-1 text-center font-mono font-bold rounded border bg-white placeholder:font-sans placeholder:font-normal placeholder:text-[10px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 ${
                                              isPendingReview
                                                ? 'border-amber-400 bg-amber-50 text-amber-950'
                                                : isGraded
                                                ? 'border-slate-300 text-slate-900'
                                                : 'border-slate-200 text-slate-400'
                                            }`}
                                          />
                                          {isPendingReview && (
                                            <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-1 rounded">
                                              ⏳ Revisar
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}

                                  {/* NOTA FINAL C{cId} con 2 decimales como en Excel */}
                                  <td className="py-1.5 px-2 text-center border-r border-slate-300 bg-amber-50/50 font-mono font-bold">
                                    {!hasClassFinal ? (
                                      <span className="text-[10px] font-sans font-normal text-slate-400">
                                        Sin nota
                                      </span>
                                    ) : (
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded text-xs font-extrabold ${
                                          classFinal >= 3.0
                                            ? 'bg-emerald-100/80 text-emerald-950'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                      >
                                        {classFinal.toFixed(2)}
                                      </span>
                                    )}
                                  </td>

                                  {/* B1 Inasistencias (1 = Inasistió, vacío = Asistió) */}
                                  <td className="py-1.5 px-1.5 text-center border-r border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateStudentClassField(
                                          s.record.studentId,
                                          cId,
                                          (prev) => {
                                            const currentlyAbsent = prev.asistenciaB1Estado === 'falla';
                                            return {
                                              ...prev,
                                              asistenciaB1Estado: currentlyAbsent
                                                ? 'presente_manual'
                                                : 'falla',
                                              bloque1Asistio: currentlyAbsent,
                                              llamadoVirtualActivo: false
                                            };
                                          }
                                        )
                                      }
                                      title="Clic para alternar B1 Inasistencia: 1 (Inasistió) / Vacío (Asistió)"
                                      className={`w-10 h-7 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer transition-colors ${
                                        b1Val === 1
                                          ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                                          : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-300'
                                      }`}
                                    >
                                      {b1Val === 1 ? '1' : ''}
                                    </button>
                                  </td>

                                  {/* B2 Inasistencias (1 = Inasistió, vacío = Asistió) */}
                                  <td className="py-1.5 px-1.5 text-center border-r border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateStudentClassField(
                                          s.record.studentId,
                                          cId,
                                          (prev) => {
                                            const currentlyAbsent = prev.asistenciaB2Estado === 'falla';
                                            return {
                                              ...prev,
                                              asistenciaB2Estado: currentlyAbsent
                                                ? 'presente_manual'
                                                : 'falla',
                                              bloque2Asistio: currentlyAbsent,
                                              llamadoVirtualActivo: false
                                            };
                                          }
                                        )
                                      }
                                      title="Clic para alternar B2 Inasistencia: 1 (Inasistió) / Vacío (Asistió)"
                                      className={`w-10 h-7 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer transition-colors ${
                                        b2Val === 1
                                          ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                                          : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-300'
                                      }`}
                                    >
                                      {b2Val === 1 ? '1' : ''}
                                    </button>
                                  </td>

                                  {/* Condicional de Asistencia de la Clase/Módulo */}
                                  <td className="py-1.5 px-2 text-center border-r border-slate-300">
                                    {isClassMissed ? (
                                      <span
                                        title="Condicional: Tiene 1 en B1, en B2 o en ambos -> Clase Inasistida"
                                        className="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-900 font-mono font-bold text-[10px]"
                                      >
                                        Inasistió (1)
                                      </span>
                                    ) : (
                                      <span
                                        title="Condicional: En los dos bloques no tiene 1 -> Asistió a la Clase"
                                        className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px]"
                                      >
                                        Asistió
                                      </span>
                                    )}
                                  </td>

                                  {/* Observaciones */}
                                  <td className="py-1.5 px-2">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="text"
                                        value={c.observacionDocente || ''}
                                        placeholder="Observación de clase..."
                                        onChange={(e) =>
                                          handleUpdateStudentClassField(
                                            s.record.studentId,
                                            cId,
                                            (prev) => ({
                                              ...prev,
                                              observacionDocente: e.target.value
                                            })
                                          )
                                        }
                                        className="w-full min-w-[150px] px-2 py-1 rounded border border-slate-300 text-xs text-slate-900"
                                      />
                                      <button
                                        type="button"
                                        title="Insertar: MÁS 1 PUNTO EN SUSTENTACIÓN"
                                        onClick={() =>
                                          handleUpdateStudentClassField(
                                            s.record.studentId,
                                            cId,
                                            (prev) => ({
                                              ...prev,
                                              observacionDocente: 'MÁS 1 PUNTO EN SUSTENTACIÓN'
                                            })
                                          )
                                        }
                                        className="px-1.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 font-mono font-bold text-[10px] shrink-0 cursor-pointer"
                                      >
                                        +1 Pto
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================================================================================== */}
          {/* SECCIÓN EXCEL 2: NOTA ACUMULATIVA (CLASES 1 A 6 · HASTA LA CLASE CALIFICADA O TODAS)  */}
          {/* ===================================================================================== */}
          {(excelSectionFilter === 'all_sections' || excelSectionFilter === 'nota_acumulativa') && (
            <div className="bg-white border-2 border-sky-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-sky-100 pb-4">
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-700">
                    Sección 2 (Formato Excel) · Consolidado ({classesRangeLabel}) y Nota Acumulativa (NOTA P.)
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Nota Acumulativa por Clase/Módulo (Hasta la Clase Calificada o Total {shortClassesRangeLabel})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Visualice las notas finales de cada módulo ({shortClassesRangeLabel}) y la <strong>NOTA P. Acumulativa</strong> calculada automáticamente hasta el módulo que se lleva calificado o sobre los {totalActiveClassesCount} módulo(s).
                  </p>
                </div>

                {/* Selector interactivo del corte de la Nota Acumulativa */}
                <div className="flex flex-wrap items-center gap-1.5 bg-sky-50 p-1.5 rounded-xl border border-sky-200">
                  <button
                    type="button"
                    onClick={() => setCumulativeCutoffMode('auto_graded')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      cumulativeCutoffMode === 'auto_graded'
                        ? 'bg-sky-700 text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Hasta Clase Calificada (Auto)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCumulativeCutoffMode('all_6')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      cumulativeCutoffMode === 'all_6'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Todas ({shortClassesRangeLabel})
                  </button>
                  {activeClassIds.map((cId) => (
                    <button
                      key={cId}
                      type="button"
                      onClick={() => setCumulativeCutoffMode(cId)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-colors ${
                        cumulativeCutoffMode === cId
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      Hasta C{cId}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left">
                  <thead>
                    <tr className="bg-amber-100/80 border-b border-slate-300 text-[11px] font-mono font-bold uppercase text-slate-900">
                      <th colSpan={4} className="py-2 px-3 border-r border-slate-300">
                        IDENTIFICACIÓN DEL ESTUDIANTE
                      </th>
                      <th colSpan={totalActiveClassesCount} className="py-2 px-3 text-center border-r border-slate-300 bg-amber-200/70">
                        {classesRangeLabel} (Notas Correspondientes por Clase / Módulo)
                      </th>
                      <th colSpan={4} className="py-2 px-3 text-center bg-sky-100 text-sky-950">
                        NOTA ACUMULATIVA (NOTA P.) Y ACCIONES
                      </th>
                    </tr>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-800">
                      <th className="py-2.5 px-2 text-center w-8 border-r border-slate-200">
                        <input
                          type="checkbox"
                          checked={
                            filteredSummaries.length > 0 &&
                            filteredSummaries.every((s) =>
                              selectedStudentIds.includes(s.record.studentId)
                            )
                          }
                          onChange={toggleSelectAllFiltered}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-2 text-center w-10 border-r border-slate-200">NO.</th>
                      <th className="py-2.5 px-2.5 border-r border-slate-200">ESTUDIANTE</th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300">ID</th>
                      {activeClassIds.map((cId) => {
                        const csDef = effectiveClassSessions.find((x) => x.id === cId);
                        return (
                          <th
                            key={cId}
                            onClick={() => {
                              setSelectedClassId(cId);
                              setExcelSectionFilter('notas_clases');
                            }}
                            title={`Clic para ir al detalle de CLASE ${cId}: ${csDef?.fullTitle || ''}`}
                            className="py-2.5 px-2 text-center border-r border-slate-200 hover:bg-amber-100 cursor-pointer transition-colors"
                          >
                            <div>NOTA FINAL C{cId}</div>
                            <div className="text-[9px] font-mono text-slate-500 truncate max-w-[110px] mx-auto">
                              {csDef?.shortTitle || `Módulo ${cId}`}
                            </div>
                          </th>
                        );
                      })}
                      <th className="py-2.5 px-2.5 text-center border-r border-slate-300 bg-amber-100 text-slate-950">
                        <div>NOTA P.</div>
                        <div className="text-[9px] font-mono text-slate-700">
                          {cumulativeCutoffMode === 'auto_graded'
                            ? 'Hasta Calificada'
                            : cumulativeCutoffMode === 'all_6'
                            ? `Sobre ${totalActiveClassesCount} Mód.`
                            : `Corte C1–C${cumulativeCutoffMode}`}
                        </div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-sky-50 text-sky-950">
                        <div>ACUM. {shortClassesRangeLabel}</div>
                        <div className="text-[9px] font-mono text-slate-500">{totalActiveClassesCount} Módulos</div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-200">ESTADO</th>
                      <th className="py-2.5 px-2 text-right">FICHA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredSummaries.map((s, idx) => {
                      const isSelected = selectedStudentIds.includes(s.record.studentId);
                      const displayedNotaP =
                        cumulativeCutoffMode === 'auto_graded'
                          ? s.notaAcumulativaHastaCalificada
                          : cumulativeCutoffMode === 'all_6'
                          ? s.notaAcumulativaTodasLasClases
                          : s.notaAcumulativaPorCorte[cumulativeCutoffMode];

                      return (
                        <tr
                          key={s.record.studentId}
                          className={`hover:bg-slate-50/90 ${isSelected ? 'bg-indigo-50/50' : ''}`}
                        >
                          <td className="py-2 px-2 text-center border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectStudent(s.record.studentId)}
                              className="rounded border-slate-300 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 font-bold text-slate-900 border-r border-slate-200">
                            {s.record.nombre}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-slate-700 border-r border-slate-300">
                            {s.record.documento}
                          </td>
                          {activeClassIds.map((cId) => {
                            const val = s.classFinals[cId];
                            const hasGrade = s.classHasFinalGrade[cId];
                            return (
                              <td
                                key={cId}
                                className="py-1.5 px-1.5 text-center font-mono font-bold border-r border-slate-200"
                              >
                                {!hasGrade ? (
                                  <span className="text-[10px] font-sans font-normal text-slate-400">
                                    Sin nota
                                  </span>
                                ) : (
                                  <span
                                    className={
                                      val >= 3.0 ? 'text-slate-900' : 'text-red-600 font-extrabold'
                                    }
                                  >
                                    {val.toFixed(2)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          {/* NOTA P. Acumulativa según modo seleccionado */}
                          <td className="py-2 px-2.5 text-center font-mono font-extrabold text-sm border-r border-slate-300 bg-amber-50/70">
                            {!s.hasAnyAcademicGrade ? (
                              <span className="text-[10px] font-sans font-semibold text-slate-400">
                                Sin nota
                              </span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span
                                  className={
                                    displayedNotaP >= 3.0 ? 'text-emerald-800' : 'text-red-600'
                                  }
                                >
                                  {displayedNotaP.toFixed(2)}
                                </span>
                                {cumulativeCutoffMode === 'auto_graded' &&
                                  s.ultimaClaseCalificada > 0 && (
                                    <span className="text-[9px] font-mono text-slate-500">
                                      Hasta C{s.ultimaClaseCalificada} ({s.clasesCalificadasCount}/{totalActiveClassesCount})
                                    </span>
                                  )}
                              </div>
                            )}
                          </td>
                          {/* Nota Acumulativa sobre las 6 clases */}
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-800 border-r border-slate-200 bg-sky-50/40">
                            {!s.hasAnyAcademicGrade ? (
                              <span className="text-[10px] font-sans font-normal text-slate-400">
                                —
                              </span>
                            ) : (
                              s.notaAcumulativaTodasLasClases.toFixed(2)
                            )}
                          </td>
                          <td className="py-2 px-2 text-center border-r border-slate-200">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                s.estadoAcademico === 'Sin Nota'
                                  ? 'bg-slate-100 text-slate-600'
                                  : s.estadoAcademico === 'Excelente'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : s.estadoAcademico === 'Aprobado'
                                  ? 'bg-sky-100 text-sky-900'
                                  : s.estadoAcademico === 'En Riesgo'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-red-100 text-red-900'
                              }`}
                            >
                              {s.estadoAcademico}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentIdForFicha(s.record.studentId)}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                              >
                                Ficha
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmStudent(s.record);
                                  setAlsoDeleteFromOfficialRoster(false);
                                }}
                                title="Eliminar registro"
                                className="p-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================================== */}
          {/* SECCIÓN EXCEL 3: HISTORIAL DE INASISTENCIAS (CON CONDICIONAL DE BLOQUES B1 Y B2)      */}
          {/* ===================================================================================== */}
          {(excelSectionFilter === 'all_sections' ||
            excelSectionFilter === 'historial_inasistencia') && (
            <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-200/80 pb-4">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-800">
                    Sección 3 (Formato Excel) · HISTORIAL DE INASISTENCIAS (B1 C1 a B2 C6)
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Historial de Inasistencias con Condicional por Clase / Módulo
                  </h3>
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 font-medium">
                    📌 <strong>Condicional aplicada automáticamente por Clase/Módulo:</strong> Si en uno de los dos bloques (<strong>B1</strong> o <strong>B2</strong>) tiene un <strong>1</strong>, o tiene en los dos bloques <strong>1</strong>, se toma esa clase/módulo como <strong>Inasistido</strong>. Si en los dos bloques <strong>no tiene 1</strong> (vacío), se toma como <strong>Asistió a la clase/módulo</strong>. (Haga clic en cualquier celda B1 o B2 para marcar o quitar el <strong>1</strong>).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportAbsenceMatrixCsv}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Historial de Inasistencias (CSV)</span>
                </button>
              </div>

              <div className="w-full overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left">
                  <thead>
                    <tr className="bg-amber-200/80 border-b border-slate-300 text-[11px] font-mono font-extrabold uppercase text-slate-950">
                      <th colSpan={3} className="py-2 px-2.5 border-r border-slate-300">
                        ESTUDIANTE
                      </th>
                      <th colSpan={totalActiveClassesCount * 3} className="py-2 px-2.5 text-center border-r border-slate-300">
                        HISTORIAL DE INASISTENCIAS ({classesRangeLabel} · BLOQUES B1 Y B2 + CONDICIONAL)
                      </th>
                      <th colSpan={5} className="py-2 px-2.5 text-center bg-amber-300/70">
                        CONSOLIDADO DE INASISTENCIAS
                      </th>
                    </tr>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-[10px] font-bold uppercase text-slate-800">
                      <th className="py-2 px-1.5 text-center border-r border-slate-200">NO.</th>
                      <th className="py-2 px-2 border-r border-slate-200">ESTUDIANTE</th>
                      <th className="py-2 px-2 text-center border-r border-slate-300">ID</th>
                      {activeClassIds.map((cId) => (
                        <React.Fragment key={cId}>
                          <th className="py-2 px-1 text-center border-r border-slate-200 bg-amber-50/60">
                            B1 C{cId}
                          </th>
                          <th className="py-2 px-1 text-center border-r border-slate-200 bg-amber-50/60">
                            B2 C{cId}
                          </th>
                          <th
                            title={`Condicional Clase ${cId}: Si B1=1 o B2=1 -> Inasistió (1); si no tiene 1 -> Asistió`}
                            className="py-2 px-1 text-center border-r border-slate-300 bg-slate-200/70 text-slate-900"
                          >
                            C{cId}
                          </th>
                        </React.Fragment>
                      ))}
                      <th className="py-2 px-1.5 text-center border-r border-slate-200 bg-amber-100/70">
                        TOTAL B1
                      </th>
                      <th className="py-2 px-1.5 text-center border-r border-slate-200 bg-amber-100/70">
                        TOTAL B2
                      </th>
                      <th className="py-2 px-1.5 text-center border-r border-slate-300 bg-amber-200/70">
                        INASISTENCIAS
                      </th>
                      <th
                        title="Total de Clases/Módulos Inasistidos según condicional (si B1=1 o B2=1 cuenta como 1 clase inasistida)"
                        className="py-2 px-1.5 text-center border-r border-slate-200 bg-red-100 text-red-950"
                      >
                        CLASES INASIST.
                      </th>
                      <th
                        title="Total de Clases/Módulos Asistidos (cuando en ambos bloques no hay 1)"
                        className="py-2 px-1.5 text-center bg-emerald-100 text-emerald-950"
                      >
                        CLASES ASIST.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredSummaries.map((s, idx) => (
                      <tr key={s.record.studentId} className="hover:bg-slate-50/90">
                        <td className="py-1.5 px-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-2 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                          {s.record.nombre}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-600 border-r border-slate-300">
                          {s.record.documento}
                        </td>
                        {activeClassIds.map((cId) => {
                          const b1 = s.b1Inasistencia?.[cId] ?? 0;
                          const b2 = s.b2Inasistencia?.[cId] ?? 0;
                          const missedClass = s.claseInasistida?.[cId] ?? (b1 === 1 || b2 === 1);
                          return (
                            <React.Fragment key={cId}>
                              <td className="py-1 px-1 text-center border-r border-slate-200">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateStudentClassField(
                                      s.record.studentId,
                                      cId,
                                      (prev) => {
                                        const isAbsent = prev.asistenciaB1Estado === 'falla';
                                        return {
                                          ...prev,
                                          asistenciaB1Estado: isAbsent
                                            ? 'presente_manual'
                                            : 'falla',
                                          bloque1Asistio: isAbsent,
                                          llamadoVirtualActivo: false
                                        };
                                      }
                                    )
                                  }
                                  className={`w-7 h-6 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                    b1 === 1
                                      ? 'bg-red-600 text-white border-red-700'
                                      : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-200'
                                  }`}
                                >
                                  {b1 === 1 ? '1' : ''}
                                </button>
                              </td>
                              <td className="py-1 px-1 text-center border-r border-slate-200">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateStudentClassField(
                                      s.record.studentId,
                                      cId,
                                      (prev) => {
                                        const isAbsent = prev.asistenciaB2Estado === 'falla';
                                        return {
                                          ...prev,
                                          asistenciaB2Estado: isAbsent
                                            ? 'presente_manual'
                                            : 'falla',
                                          bloque2Asistio: isAbsent,
                                          llamadoVirtualActivo: false
                                        };
                                      }
                                    )
                                  }
                                  className={`w-7 h-6 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                    b2 === 1
                                      ? 'bg-red-600 text-white border-red-700'
                                      : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-200'
                                  }`}
                                >
                                  {b2 === 1 ? '1' : ''}
                                </button>
                              </td>
                              <td className="py-1 px-1 text-center border-r border-slate-300 bg-slate-50 font-mono">
                                {missedClass ? (
                                  <span
                                    title={`Clase ${cId} Inasistida (tiene 1 en B1 o B2)`}
                                    className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-900 font-bold text-[10px]"
                                  >
                                    Inasist.
                                  </span>
                                ) : (
                                  <span
                                    title={`Clase ${cId} Asistida (sin 1 en B1 ni B2)`}
                                    className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold text-[10px]"
                                  >
                                    Asistió
                                  </span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-800 border-r border-slate-200 bg-amber-50/40">
                          {s.fallasBloque1}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-800 border-r border-slate-200 bg-amber-50/40">
                          {s.fallasBloque2}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-extrabold text-slate-950 border-r border-slate-300 bg-amber-100/60">
                          {s.totalFallasBloques}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-extrabold text-red-800 border-r border-slate-200 bg-red-50/70">
                          {s.totalClasesInasistidas} / {totalActiveClassesCount}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono font-extrabold text-emerald-800 bg-emerald-50/70">
                          {s.totalClasesAsistidas} / {totalActiveClassesCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================================== */}
      {/* VISTA 2: NOTAS POR CLASE / MÓDULO (TARJETAS DE MÓDULOS + PLANTILLA + CONSOLIDADO)     */}
      {/* ===================================================================================== */}
      {activeSubView === 'vista2_por_clase' && (
        <div className="space-y-6">
          {/* 1. MENÚ DE TARJETAS INTERACTIVAS CON LAS CLASES / MÓDULOS HABILITADOS POR EL CURSO ACTIVO */}
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-mono font-extrabold uppercase tracking-wider text-indigo-700">
                  Menú de Tarjetas Interactivas · Clases / Módulos Habilitados ({classesRangeLabel})
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Seleccione la Clase / Módulo Específico para Cargar su Plantilla de Notas
                </h3>
                <p className="text-xs text-slate-500">
                  Sincronizado con el curso/asignatura activo del docente y el Control de Estudiantes ({totalActiveClassesCount} módulos activos)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSwitchView('vista1_consolidado')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-bold cursor-pointer transition-colors"
                >
                  📊 Ir a Consolidado de Notas
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchView('vista_editor_notas')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  ✏️ Ir a Editor de Notas (Individual / Seleccionados / Lote)
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSingleClassCsv(selectedClassId)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar C{selectedClassId} (CSV)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {globalStats.classStats.map((cs) => {
                const active = selectedClassId === cs.id;
                const w = cs.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
                return (
                  <button
                    key={cs.id}
                    type="button"
                    onClick={() => setSelectedClassId(cs.id)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-indigo-500/40'
                        : 'bg-slate-50/80 hover:bg-indigo-50/50 text-slate-900 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono font-extrabold text-[11px]">
                        CLASE / MÓDULO C{cs.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          active ? 'bg-indigo-500/30 text-indigo-200' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {active ? '✓ Plantilla Cargada' : 'Clic para cargar'}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-extrabold leading-snug">{cs.fullTitle}</div>
                      <div
                        className={`text-[10px] font-mono mt-1 ${
                          active ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        Comp. {w.comportamientoPct}% · Part./Retos {w.participacionPct}% · Ex. {w.examenPct}% · Trab. {w.trabajoPct}%
                      </div>
                    </div>
                    <div
                      className={`text-xs font-mono flex items-center justify-between pt-2 border-t ${
                        active
                          ? 'border-slate-700 text-sky-300'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <span>Prom. C{cs.id}: {cs.promedio.toFixed(2)}</span>
                      <span>• Asistencia: {cs.asistenciaPct}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. CONSOLIDADO DE EXÁMENES, RETOS, TRABAJOS, SUSTENTACIÓN Y COMPORTAMIENTO (EN SECCIÓN NOTAS POR CLASE/MÓDULO) */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/15 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  Consolidado en Notas por Clase / Módulo · Sincronizado con Curso y Control de Estudiantes
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  Consolidado de Exámenes, Retos, Trabajos, Sustentación y Comportamiento (CLASE C{selectedClassId} y Acumulado)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickClassScope('individual');
                    handleSwitchView('vista_editor_notas');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  👤 Editor Individual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickClassScope('selected');
                    handleSwitchView('vista_editor_notas');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  ☑️ Editor por Seleccionados ({selectedStudentIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickClassScope('all_course');
                    handleSwitchView('vista_editor_notas');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold cursor-pointer transition-colors"
                >
                  👥 Editor por Lote ({syncedDataset.records.length})
                </button>
              </div>
            </div>

            {(() => {
              const totalStudents = Math.max(1, filteredSummaries.length);
              let sumComp = 0;
              let sumPart = 0;
              let sumEx = 0;
              let sumTrab = 0;
              let countSustentacion = 0;
              let countBonoRetos = 0;
              let countInasistenciasC = 0;

              filteredSummaries.forEach((s) => {
                const c = s.record.clases[selectedClassId];
                if (c) {
                  sumComp += Number(c.comportamiento || 0);
                  sumPart += Number(c.participacion || 0);
                  sumEx += Number(c.examen || 0);
                  sumTrab += Number(c.trabajoPractico || 0);
                  if (
                    (c.observacionDocente || '').toUpperCase().includes('SUSTENT') ||
                    (c.observacionDocente || '').toUpperCase().includes('PUNTO')
                  ) {
                    countSustentacion++;
                  }
                }
                if (s.record.bonificacionRetosAplicada) countBonoRetos++;
                if (s.claseInasistida?.[selectedClassId]) countInasistenciasC++;
              });

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-sky-300 font-bold">
                      Exámenes (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {(sumEx / totalStudents).toFixed(2)} / 5.0
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Ponderación: {effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.examenPct ?? 35}%
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-indigo-300 font-bold">
                      Retos y Particip. (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {(sumPart / totalStudents).toFixed(2)} / 5.0
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Bono Retos (+0.3): {countBonoRetos} alum.
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-emerald-300 font-bold">
                      Trabajos Prácticos (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {(sumTrab / totalStudents).toFixed(2)} / 5.0
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Ponderación: {effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.trabajoPct ?? 40}%
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-amber-300 font-bold">
                      Sustentación (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {countSustentacion} reg.
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Anotaciones / Puntos extra
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-purple-300 font-bold">
                      Comportamiento (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {(sumComp / totalStudents).toFixed(2)} / 5.0
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Ponderación: {effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.comportamientoPct ?? 10}%
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                    <div className="text-[10px] font-mono uppercase text-rose-300 font-bold">
                      Estado / Inasist. (C{selectedClassId})
                    </div>
                    <div className="text-lg font-extrabold font-mono text-white mt-0.5">
                      {countInasistenciasC} inasist.
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Asistencia C{selectedClassId}: {selectedClassInfo.asistenciaPct}%
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 3. PLANTILLA DE LAS NOTAS TABLA DE LA CLASE / MÓDULO SELECCIONADO */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-indigo-700">
                  Plantilla Oficial de Notas · CLASE {selectedClassInfo.id} ({selectedClassInfo.code})
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedClassInfo.fullTitle}
                </h3>
                <p className="text-xs text-slate-600">
                  Columnas oficiales: <strong>NO., ESTUDIANTE, ID, C{selectedClassId} Comportamiento, C{selectedClassId} Participación, C{selectedClassId} Examen, C{selectedClassId} Trabajo, NOTA FINAL C{selectedClassId}, B1 Inasistencias, B2 Inasistencias, Estado C{selectedClassId}, Observaciones</strong>.
                </p>
                {(() => {
                  const activeDef = effectiveClassSessions.find((x) => x.id === selectedClassId);
                  if (!activeDef) return null;
                  const w = activeDef.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
                  const docs = activeDef.documentosEnlaces || [];
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-950 font-mono font-bold">
                        Ponderación C{selectedClassId}: Comportamiento {w.comportamientoPct}% · Participación {w.participacionPct}% · Examen {w.examenPct}% · Trabajo {w.trabajoPct}%
                      </span>
                      {docs.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-0.5 rounded bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-semibold inline-flex items-center gap-1"
                        >
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span>{doc.titulo}</span>
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar alumno en esta clase..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSwitchView('vista_editor_notas')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Abrir Editor de Notas (Individual / Selección / Lote)</span>
                </button>
              </div>
            </div>

            {/* BARRA RÁPIDA DE EDICIÓN EN LA PLANTILLA DE LA CLASE ACTIVA */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-800 mr-1">Modo de Edición Rápida C{selectedClassId}:</span>
                {[
                  { id: 'individual', label: '👤 Editor Individual' },
                  { id: 'selected', label: `☑️ Editor por Seleccionados (${selectedStudentIds.length})` },
                  { id: 'all_course', label: `👥 Editor por Lote (${syncedDataset.records.length})` }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setQuickClassScope(m.id as any)}
                    className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                      quickClassScope === m.id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {quickClassScope === 'individual' && (
                  <select
                    value={quickClassIndividualId || syncedDataset.records[0]?.studentId || ''}
                    onChange={(e) => setQuickClassIndividualId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-semibold text-slate-900"
                  >
                    {syncedDataset.records.map((r) => (
                      <option key={r.studentId} value={r.studentId}>
                        {r.nombre} ({r.documento})
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={quickClassField}
                  onChange={(e) => setQuickClassField(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                >
                  <option value="todos_componentes">Todos los Componentes C{selectedClassId}</option>
                  <option value="comportamiento">C{selectedClassId} Comportamiento</option>
                  <option value="participacion">C{selectedClassId} Participación / Retos</option>
                  <option value="examen">C{selectedClassId} Examen</option>
                  <option value="trabajoPractico">C{selectedClassId} Trabajo</option>
                  <option value="notaFinal">NOTA FINAL C{selectedClassId}</option>
                </select>

                <select
                  value={quickClassAction}
                  onChange={(e) => setQuickClassAction(e.target.value as 'set' | 'delta')}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                >
                  <option value="set">Fijar Nota (=)</option>
                  <option value="delta">Sumar / Restar (+/-)</option>
                </select>

                <input
                  type="number"
                  step="0.1"
                  min={quickClassAction === 'set' ? 0 : -5}
                  max="5"
                  value={quickClassValue}
                  onChange={(e) => setQuickClassValue(parseFloat(e.target.value) || 0)}
                  className="w-18 px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono font-bold text-center text-slate-900"
                />

                <button
                  type="button"
                  onClick={handleQuickApplyInActiveClass}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer shadow-2xs"
                >
                  Aplicar en C{selectedClassId}
                </button>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-amber-100/70 text-[11px] font-bold uppercase tracking-wider text-slate-900">
                    <th className="py-2.5 px-2 text-center w-8 border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={
                          filteredSummaries.length > 0 &&
                          filteredSummaries.every((s) =>
                            selectedStudentIds.includes(s.record.studentId)
                          )
                        }
                        onChange={toggleSelectAllFiltered}
                        title="Seleccionar todos los estudiantes filtrados"
                        className="rounded border-slate-300 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-1.5 text-center w-10 border-r border-slate-200">NO.</th>
                    <th className="py-2.5 px-2.5 border-r border-slate-200">ESTUDIANTE</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">ID</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">
                      <div>C{selectedClassId} Comportamiento</div>
                      <div className="text-[10px] font-mono text-slate-600">
                        ({effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.comportamientoPct ?? 10}%)
                      </div>
                    </th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">
                      <div>C{selectedClassId} Participación</div>
                      <div className="text-[10px] font-mono text-slate-600">
                        ({effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.participacionPct ?? 15}%)
                      </div>
                    </th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">
                      <div>C{selectedClassId} Examen</div>
                      <div className="text-[10px] font-mono text-slate-600">
                        ({effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.examenPct ?? 35}%)
                      </div>
                    </th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">
                      <div>C{selectedClassId} Trabajo</div>
                      <div className="text-[10px] font-mono text-slate-600">
                        ({effectiveClassSessions.find((x) => x.id === selectedClassId)?.ponderacion?.trabajoPct ?? 40}%)
                      </div>
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-300 bg-amber-200/70">
                      NOTA FINAL C{selectedClassId}
                    </th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200 bg-sky-50">
                      B1 Inasistencias
                    </th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200 bg-sky-50">
                      B2 Inasistencias
                    </th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200 bg-sky-100/60">
                      Estado C{selectedClassId}
                    </th>
                    <th className="py-2.5 px-2.5">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredSummaries.map((s, idx) => {
                    const c = s.record.clases[selectedClassId];
                    const classFinal = s.classFinals[selectedClassId];
                    const hasClassFinal = s.classHasFinalGrade[selectedClassId];
                    const isSelected = selectedStudentIds.includes(s.record.studentId);
                    const b1Val = s.b1Inasistencia?.[selectedClassId] ?? 0;
                    const b2Val = s.b2Inasistencia?.[selectedClassId] ?? 0;
                    const isClassMissed = s.claseInasistida?.[selectedClassId] ?? (b1Val === 1 || b2Val === 1);

                    return (
                      <tr
                        key={s.record.studentId}
                        className={`hover:bg-slate-50/80 ${isSelected ? 'bg-indigo-50/50' : ''}`}
                      >
                        <td className="py-2.5 px-2 text-center border-r border-slate-200">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(s.record.studentId)}
                            aria-label={`Seleccionar ${s.record.nombre}`}
                            className="rounded border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2.5 border-r border-slate-200">
                          <div className="font-bold text-slate-900 flex items-center justify-between gap-1.5">
                            <span>{s.record.nombre}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedStudentIdForFicha(s.record.studentId)}
                              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-900 text-[10px] font-semibold cursor-pointer"
                            >
                              Ficha
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                          {s.record.documento}
                        </td>
                        {(['comportamiento', 'participacion', 'examen', 'trabajoPractico'] as const).map(
                          (field) => {
                            const isGraded =
                              field === 'comportamiento'
                                ? Boolean(c.comportamientoCalificado)
                                : field === 'participacion'
                                ? Boolean(c.participacionCalificado)
                                : field === 'examen'
                                ? Boolean(c.examenCalificado)
                                : Boolean(c.trabajoCalificado);
                            const isPendingReview =
                              field === 'trabajoPractico' &&
                              c.trabajoEstado === 'pendiente_revision' &&
                              !isGraded;
                            const isAutoExam =
                              field === 'examen' && isGraded && !c.examenManualOverride;
                            const isAutoReto =
                              field === 'participacion' &&
                              isGraded &&
                              !c.participacionManualOverride;

                            return (
                              <td key={field} className="py-2 px-1.5 text-center border-r border-slate-200">
                                <div className="flex flex-col items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="5"
                                    placeholder="Sin nota"
                                    value={isGraded ? c[field] : ''}
                                    onChange={(e) => {
                                      const raw = e.target.value.trim();
                                      if (raw === '') {
                                        handleUpdateStudentClassField(
                                          s.record.studentId,
                                          selectedClassId,
                                          (prev) => ({
                                            ...prev,
                                            [field]: 0,
                                            ...(field === 'comportamiento'
                                              ? { comportamientoCalificado: false }
                                              : field === 'participacion'
                                              ? {
                                                  participacionCalificado: false,
                                                  participacionManualOverride: true
                                                }
                                              : field === 'examen'
                                              ? {
                                                  examenCalificado: false,
                                                  examenManualOverride: true
                                                }
                                              : {
                                                  trabajoCalificado: false,
                                                  trabajoEstado: prev.trabajoEntregaTexto
                                                    ? 'pendiente_revision'
                                                    : 'sin_entregar'
                                                }),
                                            autoCalcularNotaFinal: true
                                          })
                                        );
                                        return;
                                      }
                                      const val = clampGrade05(parseFloat(raw) || 0);
                                      handleUpdateStudentClassField(
                                        s.record.studentId,
                                        selectedClassId,
                                        (prev) => ({
                                          ...prev,
                                          [field]: val,
                                          ...(field === 'comportamiento'
                                            ? { comportamientoCalificado: true }
                                            : field === 'participacion'
                                            ? {
                                                participacionCalificado: true,
                                                participacionManualOverride: true
                                              }
                                            : field === 'examen'
                                            ? {
                                                examenCalificado: true,
                                                examenManualOverride: true
                                              }
                                            : {
                                                trabajoCalificado: true,
                                                trabajoEstado: 'calificado'
                                              }),
                                          autoCalcularNotaFinal: true
                                        })
                                      );
                                    }}
                                    className={`w-18 px-2 py-1 text-center font-mono font-bold rounded-lg border bg-white placeholder:font-sans placeholder:font-normal placeholder:text-[10px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600 ${
                                      isPendingReview
                                        ? 'border-amber-400 bg-amber-50/40 text-amber-950'
                                        : isGraded
                                        ? 'border-slate-300 text-slate-900'
                                        : 'border-slate-200 text-slate-400'
                                    }`}
                                  />
                                  {isPendingReview && (
                                    <div className="text-[9px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded leading-tight">
                                      ⏳ Pendiente revisión
                                    </div>
                                  )}
                                  {isAutoExam && (
                                    <span className="text-[9px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 rounded">
                                      ⚡ Auto Examen
                                    </span>
                                  )}
                                  {isAutoReto && (
                                    <span className="text-[9px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1 rounded">
                                      ⚡ Auto Reto
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          }
                        )}
                        <td className="py-2 px-2 text-center border-r border-slate-300 bg-amber-50/60">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={`px-2 py-1 rounded font-mono font-extrabold text-xs ${
                                !hasClassFinal
                                  ? 'text-slate-400'
                                  : classFinal >= 3.0
                                  ? 'bg-emerald-100 text-emerald-950'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {hasClassFinal ? classFinal.toFixed(2) : 'Sin nota'}
                            </span>
                          </div>
                        </td>
                        {/* B1 Inasistencias (1 o vacío) */}
                        <td className="py-2 px-1.5 text-center border-r border-slate-200">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStudentClassField(
                                s.record.studentId,
                                selectedClassId,
                                (prev) => {
                                  const isAbsent = prev.asistenciaB1Estado === 'falla';
                                  return {
                                    ...prev,
                                    asistenciaB1Estado: isAbsent ? 'presente_manual' : 'falla',
                                    bloque1Asistio: isAbsent,
                                    llamadoVirtualActivo: false
                                  };
                                }
                              )
                            }
                            className={`w-10 h-7 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                              b1Val === 1
                                ? 'bg-red-600 text-white border-red-700'
                                : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-300'
                            }`}
                          >
                            {b1Val === 1 ? '1' : ''}
                          </button>
                        </td>
                        {/* B2 Inasistencias (1 o vacío) */}
                        <td className="py-2 px-1.5 text-center border-r border-slate-200">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStudentClassField(
                                s.record.studentId,
                                selectedClassId,
                                (prev) => {
                                  const isAbsent = prev.asistenciaB2Estado === 'falla';
                                  return {
                                    ...prev,
                                    asistenciaB2Estado: isAbsent ? 'presente_manual' : 'falla',
                                    bloque2Asistio: isAbsent,
                                    llamadoVirtualActivo: false
                                  };
                                }
                              )
                            }
                            className={`w-10 h-7 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                              b2Val === 1
                                ? 'bg-red-600 text-white border-red-700'
                                : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-300'
                            }`}
                          >
                            {b2Val === 1 ? '1' : ''}
                          </button>
                        </td>
                        {/* Estado C{selectedClassId} */}
                        <td className="py-2 px-2 text-center border-r border-slate-200">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                !hasClassFinal
                                  ? 'bg-slate-100 text-slate-600'
                                  : classFinal >= 3.0
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-red-100 text-red-900'
                              }`}
                            >
                              {!hasClassFinal ? 'Pendiente' : classFinal >= 3.0 ? 'Aprobado' : 'En Riesgo'}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-semibold ${
                                isClassMissed ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              {isClassMissed ? 'Inasistió (1)' : 'Asistió'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={c.observacionDocente || ''}
                              placeholder="Ej. MÁS 1 PUNTO EN SUSTENTACIÓN"
                              onChange={(e) =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => ({
                                    ...prev,
                                    observacionDocente: e.target.value
                                  })
                                )
                              }
                              className="w-full min-w-[160px] px-2.5 py-1 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                            />
                            <button
                              type="button"
                              title="Agregar anotación: MÁS 1 PUNTO EN SUSTENTACIÓN"
                              onClick={() =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => ({
                                    ...prev,
                                    observacionDocente: 'MÁS 1 PUNTO EN SUSTENTACIÓN'
                                  })
                                )
                              }
                              className="px-2 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-mono font-bold text-[10px] shrink-0 cursor-pointer"
                            >
                              +1 Pto
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* VISTA EDITOR DE NOTAS POR CLASE/MÓDULO (INDIVIDUAL, POR SELECCIONADOS, POR LOTE)      */}
      {/* ===================================================================================== */}
      {activeSubView === 'vista_editor_notas' && (
        <div className="space-y-6">
          <div className="bg-white border-2 border-emerald-300 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-emerald-200 pb-4">
              <div className="space-y-1">
                <span className="text-[11px] font-mono font-extrabold uppercase tracking-wider text-emerald-800">
                  Tarjeta Interactiva 3 · Editor de Notas por Clase / Módulo
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Editor de Notas: Exámenes, Retos, Trabajos, Sustentación, Comportamiento, Inasistencia y Demás Información
                </h3>
                <p className="text-xs text-slate-600">
                  Seleccione la modalidad de edición (<strong>Editor Individual</strong>, <strong>Editor por Seleccionados</strong> o <strong>Editor por Lote</strong>) y la clase/módulo activa para aplicar cambios en tiempo real.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBulkTargetMode(
                    quickClassScope === 'individual'
                      ? 'individual'
                      : quickClassScope === 'selected'
                      ? 'selected'
                      : 'all'
                  );
                  setBulkTargetClasses([selectedClassId]);
                  setBulkEditorModalOpen(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Edit3 className="w-4 h-4 text-emerald-400" />
                <span>Abrir Editor Multiclase Avanzado ({shortClassesRangeLabel})</span>
              </button>
            </div>

            {/* 3 TARJETAS INTERACTIVAS DE MODALIDAD DE EDICIÓN: INDIVIDUAL, SELECCIONADOS, LOTE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {[
                {
                  id: 'individual',
                  title: '👤 Editor Individual',
                  subtitle: '1 Estudiante específico',
                  desc: 'Seleccione un estudiante de la lista para editar sus notas de Exámenes, Retos, Trabajos, Sustentación, Comportamiento e Inasistencias.'
                },
                {
                  id: 'selected',
                  title: `☑️ Editor por Seleccionados (${selectedStudentIds.length})`,
                  subtitle: 'Estudiantes marcados con ☑',
                  desc: 'Aplica las calificaciones, puntos de sustentación, bonos de retos o inasistencias únicamente a los estudiantes seleccionados.'
                },
                {
                  id: 'all_course',
                  title: `👥 Editor por Lote (${syncedDataset.records.length})`,
                  subtitle: 'Edición masiva del curso',
                  desc: 'Modifique por lote un componente, nota final, observación de sustentación o asistencia para todos los estudiantes del curso.'
                }
              ].map((modeCard) => {
                const isActive = quickClassScope === modeCard.id;
                return (
                  <button
                    key={modeCard.id}
                    type="button"
                    onClick={() => setQuickClassScope(modeCard.id as any)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      isActive
                        ? 'bg-emerald-950 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-400/40'
                        : 'bg-slate-50 hover:bg-emerald-50/40 text-slate-900 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold">{modeCard.title}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isActive
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isActive ? 'Activo' : 'Elegir'}
                      </span>
                    </div>
                    <div
                      className={`text-xs font-mono font-semibold ${
                        isActive ? 'text-emerald-300' : 'text-emerald-800'
                      }`}
                    >
                      {modeCard.subtitle}
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isActive ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      {modeCard.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* SELECTOR DE CLASE / MÓDULO ACTIVO EN EL EDITOR */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. Seleccione la Clase / Módulo a Editar ({classesRangeLabel}):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {effectiveClassSessions.map((cs) => {
                  const active = selectedClassId === cs.id;
                  return (
                    <button
                      key={cs.id}
                      type="button"
                      onClick={() => setSelectedClassId(cs.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-2xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-mono text-xs font-extrabold text-amber-400">
                        CLASE C{cs.id}
                      </div>
                      <div className="text-[11px] truncate mt-0.5">{cs.shortTitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PANEL DE ACCIÓN SEGÚN MODO (INDIVIDUAL / SELECCIONADOS / LOTE) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                  2. Configurar Calificación de Examen, Reto/Participación, Trabajo o Comportamiento (C{selectedClassId})
                </div>

                {quickClassScope === 'individual' && (
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-700">
                      Estudiante Individual a Calificar:
                    </label>
                    <select
                      value={quickClassIndividualId || syncedDataset.records[0]?.studentId || ''}
                      onChange={(e) => setQuickClassIndividualId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-emerald-50/40 font-bold text-slate-900"
                    >
                      {syncedDataset.records.map((r) => (
                        <option key={r.studentId} value={r.studentId}>
                          {r.nombre} — ID: {r.documento}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {quickClassScope === 'selected' && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-center justify-between gap-2">
                    <span>
                      Estudiantes seleccionados actualmente: <strong>{selectedStudentIds.length}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedStudentIds(syncedDataset.records.map((r) => r.studentId))
                        }
                        className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300 font-bold text-[11px] cursor-pointer"
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudentIds([])}
                        className="px-2.5 py-1 rounded-lg bg-white border border-indigo-300 font-bold text-[11px] cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Rubro / Componente en CLASE C{selectedClassId}:
                    </label>
                    <select
                      value={quickClassField}
                      onChange={(e) => setQuickClassField(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    >
                      <option value="todos_componentes">Todos los 4 Componentes</option>
                      <option value="examen">C{selectedClassId} Examen (35%)</option>
                      <option value="participacion">C{selectedClassId} Participación / Retos (15%)</option>
                      <option value="trabajoPractico">C{selectedClassId} Trabajo Práctico (40%)</option>
                      <option value="comportamiento">C{selectedClassId} Comportamiento (10%)</option>
                      <option value="notaFinal">NOTA FINAL C{selectedClassId} Directa</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">
                      Operación de Calificación:
                    </label>
                    <select
                      value={quickClassAction}
                      onChange={(e) => setQuickClassAction(e.target.value as 'set' | 'delta')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                    >
                      <option value="set">Fijar Nota Exacta (=)</option>
                      <option value="delta">Sumar / Restar Puntos (+/-)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    step="0.1"
                    min={quickClassAction === 'set' ? 0 : -5}
                    max="5"
                    value={quickClassValue}
                    onChange={(e) => setQuickClassValue(parseFloat(e.target.value) || 0)}
                    className="w-28 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-center text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleQuickApplyInActiveClass}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold cursor-pointer shadow-2xs transition-colors"
                  >
                    ✓ Aplicar Calificación en C{selectedClassId}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                    3. Sustentación, Retos (+0.3), Inasistencia B1/B2 y Demás Información (C{selectedClassId})
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAttendanceInClass(selectedClassId, '0_fallas', quickClassScope)
                      }
                      className="py-2 px-2.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold cursor-pointer"
                    >
                      ✔️ Asistió B1 y B2
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAttendanceInClass(selectedClassId, '1_falla_b1', quickClassScope)
                      }
                      className="py-2 px-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold cursor-pointer"
                    >
                      1 en B1 (Inasist.)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAttendanceInClass(selectedClassId, '1_falla_b2', quickClassScope)
                      }
                      className="py-2 px-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold cursor-pointer"
                    >
                      1 en B2 (Inasist.)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAttendanceInClass(selectedClassId, '2_fallas', quickClassScope)
                      }
                      className="py-2 px-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-900 font-bold cursor-pointer"
                    >
                      1 en B1 y B2
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkTargetMode(
                          quickClassScope === 'individual'
                            ? 'individual'
                            : quickClassScope === 'selected'
                            ? 'selected'
                            : 'all'
                        );
                        setBulkTargetClasses([selectedClassId]);
                        setBulkObservacionMode('set');
                        setBulkObservacionText('MÁS 1 PUNTO EN SUSTENTACIÓN');
                        setBulkEditorModalOpen(true);
                      }}
                      className="py-2 px-2.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold cursor-pointer"
                    >
                      🗣️ +1 Pto Sustentación
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkTargetMode(
                          quickClassScope === 'individual'
                            ? 'individual'
                            : quickClassScope === 'selected'
                            ? 'selected'
                            : 'all'
                        );
                        setBulkTargetClasses([selectedClassId]);
                        setBulkBonoRetosMode('enable');
                        setBulkEditorModalOpen(true);
                      }}
                      className="py-2 px-2.5 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-950 font-bold cursor-pointer"
                    >
                      🏆 Activar Bono Retos (+0.3)
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    También puede editar celda por celda en la tabla inferior o marcar alumnos con ☑
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSwitchView('vista2_por_clase')}
                    className="font-bold text-indigo-700 hover:underline cursor-pointer"
                  >
                    Ver Plantilla C{selectedClassId} Completa →
                  </button>
                </div>
              </div>
            </div>

            {/* TABLA INTERACTIVA DIRECTA DEL EDITOR DE NOTAS */}
            <div className="w-full overflow-x-auto pt-2">
              <table className="w-full table-auto border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-emerald-100/70 text-[11px] font-bold uppercase tracking-wider text-slate-900">
                    <th className="py-2.5 px-2 text-center w-8 border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={
                          filteredSummaries.length > 0 &&
                          filteredSummaries.every((s) =>
                            selectedStudentIds.includes(s.record.studentId)
                          )
                        }
                        onChange={toggleSelectAllFiltered}
                        className="rounded border-slate-300 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-1.5 text-center w-10 border-r border-slate-200">NO.</th>
                    <th className="py-2.5 px-2.5 border-r border-slate-200">ESTUDIANTE</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">ID</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">C{selectedClassId} Comportamiento</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">C{selectedClassId} Participación / Retos</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">C{selectedClassId} Examen</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">C{selectedClassId} Trabajo</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-300 bg-amber-200/70">NOTA FINAL C{selectedClassId}</th>
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">B1 / B2 Inasist.</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-200">Bono Retos</th>
                    <th className="py-2.5 px-2.5">Sustentación / Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredSummaries.map((s, idx) => {
                    const c = s.record.clases[selectedClassId];
                    const classFinal = s.classFinals[selectedClassId];
                    const hasClassFinal = s.classHasFinalGrade[selectedClassId];
                    const isSelected = selectedStudentIds.includes(s.record.studentId);
                    const b1Val = s.b1Inasistencia?.[selectedClassId] ?? 0;
                    const b2Val = s.b2Inasistencia?.[selectedClassId] ?? 0;

                    return (
                      <tr
                        key={s.record.studentId}
                        className={`hover:bg-slate-50/80 ${isSelected ? 'bg-emerald-50/50' : ''}`}
                      >
                        <td className="py-2 px-2 text-center border-r border-slate-200">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStudent(s.record.studentId)}
                            className="rounded border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2.5 font-bold text-slate-900 border-r border-slate-200">
                          {s.record.nombre}
                        </td>
                        <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                          {s.record.documento}
                        </td>
                        {(['comportamiento', 'participacion', 'examen', 'trabajoPractico'] as const).map(
                          (field) => {
                            const isGraded =
                              field === 'comportamiento'
                                ? Boolean(c.comportamientoCalificado)
                                : field === 'participacion'
                                ? Boolean(c.participacionCalificado)
                                : field === 'examen'
                                ? Boolean(c.examenCalificado)
                                : Boolean(c.trabajoCalificado);
                            return (
                              <td key={field} className="py-1.5 px-1.5 text-center border-r border-slate-200">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="5"
                                  placeholder="—"
                                  value={isGraded ? c[field] : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    const val = clampGrade05(parseFloat(raw) || 0);
                                    handleUpdateStudentClassField(
                                      s.record.studentId,
                                      selectedClassId,
                                      (prev) => ({
                                        ...prev,
                                        [field]: raw === '' ? 0 : val,
                                        ...(field === 'comportamiento'
                                          ? { comportamientoCalificado: raw !== '' }
                                          : field === 'participacion'
                                          ? {
                                              participacionCalificado: raw !== '',
                                              participacionManualOverride: true
                                            }
                                          : field === 'examen'
                                          ? {
                                              examenCalificado: raw !== '',
                                              examenManualOverride: true
                                            }
                                          : {
                                              trabajoCalificado: raw !== '',
                                              trabajoEstado: raw !== '' ? 'calificado' : 'sin_entregar'
                                            }),
                                        autoCalcularNotaFinal: true
                                      })
                                    );
                                  }}
                                  className="w-16 px-2 py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-white text-slate-900"
                                />
                              </td>
                            );
                          }
                        )}
                        <td className="py-1.5 px-2 text-center font-mono font-extrabold border-r border-slate-300 bg-amber-50/60">
                          {hasClassFinal ? classFinal.toFixed(2) : 'Sin nota'}
                        </td>
                        <td className="py-1.5 px-1.5 text-center border-r border-slate-200">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => {
                                    const isAbsent = prev.asistenciaB1Estado === 'falla';
                                    return {
                                      ...prev,
                                      asistenciaB1Estado: isAbsent ? 'presente_manual' : 'falla',
                                      bloque1Asistio: isAbsent
                                    };
                                  }
                                )
                              }
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border cursor-pointer ${
                                b1Val === 1
                                  ? 'bg-red-600 text-white border-red-700'
                                  : 'bg-white text-slate-500 border-slate-300'
                              }`}
                            >
                              B1:{b1Val === 1 ? '1' : '0'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => {
                                    const isAbsent = prev.asistenciaB2Estado === 'falla';
                                    return {
                                      ...prev,
                                      asistenciaB2Estado: isAbsent ? 'presente_manual' : 'falla',
                                      bloque2Asistio: isAbsent
                                    };
                                  }
                                )
                              }
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border cursor-pointer ${
                                b2Val === 1
                                  ? 'bg-red-600 text-white border-red-700'
                                  : 'bg-white text-slate-500 border-slate-300'
                              }`}
                            >
                              B2:{b2Val === 1 ? '1' : '0'}
                            </button>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-center border-r border-slate-200">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleStudentShockPlan(
                                s.record.studentId,
                                'bonificacionRetosAplicada'
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              s.record.bonificacionRetosAplicada
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {s.record.bonificacionRetosAplicada ? '+0.3 Activo' : 'Activar +0.3'}
                          </button>
                        </td>
                        <td className="py-1.5 px-2.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={c.observacionDocente || ''}
                              placeholder="Observación / Sustentación..."
                              onChange={(e) =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => ({
                                    ...prev,
                                    observacionDocente: e.target.value
                                  })
                                )
                              }
                              className="w-full min-w-[140px] px-2 py-1 rounded-lg border border-slate-300 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateStudentClassField(
                                  s.record.studentId,
                                  selectedClassId,
                                  (prev) => ({
                                    ...prev,
                                    observacionDocente: 'MÁS 1 PUNTO EN SUSTENTACIÓN'
                                  })
                                )
                              }
                              className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 font-mono font-bold text-[10px] shrink-0 cursor-pointer"
                            >
                              +1 Sust.
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* TARJETA INTERACTIVA AGRUPADA: OTRAS ZONAS Y SECCIONES (ORDENADAS)                     */}
      {/* ===================================================================================== */}
      {activeSubView === 'vista_otras_zonas' && (
        <div className="bg-white border-2 border-purple-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-purple-100 pb-3">
            <div>
              <span className="text-[11px] font-mono font-extrabold uppercase tracking-wider text-purple-800">
                Tarjeta Interactiva 4 · Zonas y Secciones Complementarias Agrupadas
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Historial de Inasistencias, Diagnóstico IA, Exámenes del Curso y Herramientas de Nómina
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              {
                id: 'ausentismo',
                label: '📅 1. Historial de Inasistencias (B1 y B2)',
                desc: 'Matriz condicional de bloques B1/B2 y clases asistidas vs. inasistidas'
              },
              {
                id: 'ia',
                label: '🤖 2. Diagnóstico IA & Plan de Choque',
                desc: 'Resumen por competencias, correlación de ausentismo y nivelación'
              },
              {
                id: 'examenes',
                label: '📝 3. Exámenes y Simulacros del Curso',
                desc: 'Gestión de evaluaciones, bancos de preguntas e intentos oficiales'
              },
              {
                id: 'herramientas',
                label: '🛠️ 4. Nómina, Exportación CSV y Sincronización',
                desc: 'Agregar estudiante, sincronizar nómina oficial y descargar reportes Excel/CSV'
              }
            ].map((z) => {
              const active = groupedZoneSubTab === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setGroupedZoneSubTab(z.id as any)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    active
                      ? 'bg-purple-950 text-white border-purple-900 shadow-xs ring-2 ring-purple-400/40'
                      : 'bg-slate-50 hover:bg-purple-50/50 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="text-xs font-extrabold">{z.label}</div>
                  <div
                    className={`text-[11px] leading-snug ${
                      active ? 'text-purple-200' : 'text-slate-500'
                    }`}
                  >
                    {z.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {groupedZoneSubTab === 'herramientas' && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="font-bold text-slate-900 text-sm">
                Herramientas de Nómina, Sincronización y Exportación Oficial
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="p-4 rounded-xl bg-white hover:bg-sky-50 border border-slate-200 text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-sky-600" />
                    <span>Agregar Estudiante</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Añadir nuevo estudiante a la gestión académica y vincularlo al Control de Estudiantes.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleSyncOfficialRosterNow}
                  className="p-4 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-indigo-600" />
                    <span>Sincronizar Nómina Oficial</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Sincronizar los {students.length} estudiantes del Control de Estudiantes con las {totalActiveClassesCount} clases del curso.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleExportConsolidatedCsv}
                  className="p-4 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Exportar Sabana Consolidada (CSV)</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Descargar formato Excel completo con todas las clases, notas finales e inasistencias.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleExportAbsenceMatrixCsv}
                  className="p-4 rounded-xl bg-white hover:bg-amber-50 border border-slate-200 text-left space-y-1 cursor-pointer"
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-amber-600" />
                    <span>Exportar Historial Inasistencias (CSV)</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Descargar matriz de bloques B1 y B2 con condicional por clase/módulo.
                  </p>
                </button>
              </div>
            </div>
          )}

          {groupedZoneSubTab === 'examenes' && onRenderExamsSubView && (
            <div className="pt-2">{onRenderExamsSubView()}</div>
          )}
        </div>
      )}

      {/* ===================================================================================== */}
      {/* VISTA 3: HISTORIAL DE INASISTENCIAS & AUSENTISMO (CON CONDICIONAL DE BLOQUES B1/B2)   */}
      {/* ===================================================================================== */}
      {(activeSubView === 'vista3_ausentismo' ||
        (activeSubView === 'vista_otras_zonas' && groupedZoneSubTab === 'ausentismo')) && (
        <div className="space-y-6">
          {/* BANDEJA DOCENTE DE SOLICITUDES DE JUSTIFICACIÓN DE INASISTENCIAS / EXCUSAS MÉDICAS O LABORALES */}
          {(() => {
            const allExcuseItems: Array<{
              studentId: string;
              nombre: string;
              documento: string;
              classId: ClassSessionId;
              classCode: string;
              classTitle: string;
              bloque: 'A' | 'B' | 'AB';
              motivo: string;
              soporteUrl?: string;
              fechaSolicitudIso?: string;
              estado: 'pendiente_revision' | 'aprobada' | 'rechazada';
              respuestaDocente?: string;
            }> = [];

            studentSummaries.forEach((s) => {
              activeClassIds.forEach((cId) => {
                const cRec = s.record.clases?.[cId];
                if (
                  cRec &&
                  cRec.excusaEstado &&
                  cRec.excusaEstado !== 'ninguna'
                ) {
                  const csDef = classSessionsList.find((cs) => cs.id === cId);
                  allExcuseItems.push({
                    studentId: s.record.studentId,
                    nombre: s.record.nombre,
                    documento: s.record.documento,
                    classId: cId,
                    classCode: csDef?.code || `C${cId}`,
                    classTitle: csDef?.shortTitle || `Clase ${cId}`,
                    bloque: cRec.excusaBloque || 'AB',
                    motivo: cRec.excusaMotivo || 'Solicitud de excusa registrada por el estudiante',
                    soporteUrl: cRec.excusaSoporteUrl,
                    fechaSolicitudIso: cRec.excusaFechaSolicitudIso,
                    estado: cRec.excusaEstado as 'pendiente_revision' | 'aprobada' | 'rechazada',
                    respuestaDocente: cRec.excusaRespuestaDocente
                  });
                }
              });
            });

            const pendingExcuses = allExcuseItems.filter(
              (item) => item.estado === 'pendiente_revision'
            );

            return (
              <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-mono text-[10px] font-extrabold uppercase">
                      <span>📋 Bandeja de Solicitudes de Excusa / Justificación de Fallas</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1">
                      Revisión Docente de Excusas enviadas desde el Panel del Estudiante ({pendingExcuses.length} pendiente(s) de revisión)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Cuando un estudiante registra una falla en el Bloque A o B y envía una excusa o soporte médico/laboral desde su ficha personal, aparece aquí para su aprobación o rechazo.
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-xl font-mono text-xs font-extrabold shrink-0 ${
                      pendingExcuses.length > 0
                        ? 'bg-amber-100 border border-amber-300 text-amber-950 animate-pulse'
                        : 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    }`}
                  >
                    {pendingExcuses.length > 0
                      ? `⏳ ${pendingExcuses.length} Pendiente(s) por Revisar`
                      : '✓ 0 Excusas Pendientes'}
                  </span>
                </div>

                {allExcuseItems.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                    Aún no se han recibido solicitudes de justificación de inasistencias desde el portal estudiantil.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allExcuseItems.map((item) => (
                      <div
                        key={`${item.studentId}-${item.classId}`}
                        className={`rounded-xl border-2 p-3.5 space-y-2 text-xs ${
                          item.estado === 'pendiente_revision'
                            ? 'bg-amber-50/70 border-amber-300'
                            : item.estado === 'aprobada'
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-rose-50/70 border-rose-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-slate-900">
                              {item.nombre}{' '}
                              <span className="font-mono text-slate-500">({item.documento})</span>
                            </div>
                            <div className="font-mono text-[11px] font-bold text-indigo-900">
                              {item.classCode}: {item.classTitle} · Bloque(s): {item.bloque}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                              item.estado === 'pendiente_revision'
                                ? 'bg-amber-200 text-amber-950'
                                : item.estado === 'aprobada'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {item.estado === 'pendiente_revision'
                              ? '⏳ Pendiente'
                              : item.estado === 'aprobada'
                              ? '✓ Aprobada'
                              : '✕ Rechazada'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                          <div className="text-[11px] text-slate-800">
                            <strong>Motivo del estudiante:</strong> {item.motivo}
                          </div>
                          {item.soporteUrl && (
                            <div className="text-[11px]">
                              <a
                                href={item.soporteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-indigo-700 underline"
                              >
                                🔗 Abrir soporte / certificado adjunto
                              </a>
                            </div>
                          )}
                          {item.fechaSolicitudIso && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Enviado: {new Date(item.fechaSolicitudIso).toLocaleString('es-CO')}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStudentClassField(
                                item.studentId,
                                item.classId,
                                (prev) => ({
                                  ...prev,
                                  excusaEstado: 'aprobada',
                                  excusaRespuestaDocente:
                                    'Excusa validada y aprobada por el docente. Falla justificada.',
                                  asistenciaB1Estado:
                                    item.bloque === 'A' || item.bloque === 'AB'
                                      ? 'presente_manual'
                                      : prev.asistenciaB1Estado,
                                  bloque1Asistio:
                                    item.bloque === 'A' || item.bloque === 'AB'
                                      ? true
                                      : prev.bloque1Asistio,
                                  asistenciaB2Estado:
                                    item.bloque === 'B' || item.bloque === 'AB'
                                      ? 'presente_manual'
                                      : prev.asistenciaB2Estado,
                                  bloque2Asistio:
                                    item.bloque === 'B' || item.bloque === 'AB'
                                      ? true
                                      : prev.bloque2Asistio
                                })
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                          >
                            ✓ Aprobar Excusa y Quitar Falla
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateStudentClassField(
                                item.studentId,
                                item.classId,
                                (prev) => ({
                                  ...prev,
                                  excusaEstado: 'rechazada',
                                  excusaRespuestaDocente:
                                    'Solicitud revisada: soporte insuficiente o fuera de término.'
                                })
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                          >
                            ✕ Rechazar Excusa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* EXPLICACIÓN DE LA CONDICIONAL DE INASISTENCIA POR CLASE/MÓDULO */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-900">
                Regla Condicional de Inasistencia por Clase / Módulo (Formato Excel)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950 font-mono text-xs font-bold">
                SI(O(B1=1; B2=1); &quot;Inasistió&quot;; &quot;Asistió&quot;)
              </span>
            </div>
            <p className="text-xs sm:text-sm text-amber-950 leading-relaxed">
              • Si en uno de los dos bloques (<strong>B1</strong> o <strong>B2</strong>) tiene un <strong>1</strong>, o tiene en los dos bloques <strong>1</strong>, se toma esa clase/módulo como <strong>Inasistido</strong>.<br />
              • Si en los dos bloques <strong>no tiene 1</strong> (celda vacía), se toma como <strong>Asistió a la clase/módulo</strong>.
            </p>
          </div>

          {/* TABLA OFICIAL EXCEL: HISTORIAL DE INASISTENCIAS (B1 C1 A B2 C6 + TOTAL B1 + TOTAL B2 + INASISTENCIAS + CLASES INASISTIDAS) */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  HISTORIAL DE INASISTENCIAS (C1 a C6 · Bloques B1 y B2)
                </h3>
                <p className="text-xs text-slate-500">
                  Haga clic en cualquier celda <strong>B1</strong> o <strong>B2</strong> para asignar o quitar el <strong>1</strong> de inasistencia en tiempo real.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportAbsenceMatrixCsv}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar Historial de Inasistencias (CSV)</span>
              </button>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left">
                <thead>
                  <tr className="bg-amber-200/80 border-b border-slate-300 text-[11px] font-mono font-extrabold uppercase text-slate-950">
                    <th colSpan={3} className="py-2 px-2.5 border-r border-slate-300">
                      DATOS DEL ESTUDIANTE
                    </th>
                    <th colSpan={totalActiveClassesCount * 3} className="py-2 px-2.5 text-center border-r border-slate-300">
                      HISTORIAL DE INASISTENCIAS POR BLOQUE Y CONDICIONAL POR CLASE
                    </th>
                    <th colSpan={5} className="py-2 px-2.5 text-center bg-amber-300/70">
                      TOTALES ACUMULADOS
                    </th>
                  </tr>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-[10px] font-bold uppercase text-slate-800">
                    <th className="py-2.5 px-1.5 text-center border-r border-slate-200">NO.</th>
                    <th className="py-2.5 px-2.5 border-r border-slate-200">ESTUDIANTE</th>
                    <th className="py-2.5 px-2 text-center border-r border-slate-300">ID</th>
                    {activeClassIds.map((cId) => (
                      <React.Fragment key={cId}>
                        <th className="py-2 px-1 text-center border-r border-slate-200 bg-amber-50/70">
                          B1 C{cId}
                        </th>
                        <th className="py-2 px-1 text-center border-r border-slate-200 bg-amber-50/70">
                          B2 C{cId}
                        </th>
                        <th className="py-2 px-1 text-center border-r border-slate-300 bg-slate-200/70">
                          Clase C{cId}
                        </th>
                      </React.Fragment>
                    ))}
                    <th className="py-2 px-1.5 text-center border-r border-slate-200 bg-amber-100/70">
                      TOTAL B1
                    </th>
                    <th className="py-2 px-1.5 text-center border-r border-slate-200 bg-amber-100/70">
                      TOTAL B2
                    </th>
                    <th className="py-2 px-1.5 text-center border-r border-slate-300 bg-amber-200/80">
                      INASISTENCIAS
                    </th>
                    <th className="py-2 px-1.5 text-center border-r border-slate-200 bg-red-100 text-red-950">
                      CLASES INASISTIDAS
                    </th>
                    <th className="py-2 px-1.5 text-center bg-emerald-100 text-emerald-950">
                      CLASES ASISTIDAS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {studentSummaries.map((s, idx) => (
                    <tr key={s.record.studentId} className="hover:bg-slate-50/80">
                      <td className="py-2 px-1.5 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {s.record.nombre}
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600 border-r border-slate-300">
                        {s.record.documento}
                      </td>
                      {activeClassIds.map((cId) => {
                        const b1 = s.b1Inasistencia?.[cId] ?? 0;
                        const b2 = s.b2Inasistencia?.[cId] ?? 0;
                        const missedClass = s.claseInasistida?.[cId] ?? (b1 === 1 || b2 === 1);
                        return (
                          <React.Fragment key={cId}>
                            <td className="py-1.5 px-1 text-center border-r border-slate-200">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStudentClassField(
                                    s.record.studentId,
                                    cId,
                                    (prev) => {
                                      const isAbsent = prev.asistenciaB1Estado === 'falla';
                                      return {
                                        ...prev,
                                        asistenciaB1Estado: isAbsent
                                          ? 'presente_manual'
                                          : 'falla',
                                        bloque1Asistio: isAbsent,
                                        llamadoVirtualActivo: false
                                      };
                                    }
                                  )
                                }
                                className={`w-7 h-6 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                  b1 === 1
                                    ? 'bg-red-600 text-white border-red-700'
                                    : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-200'
                                }`}
                              >
                                {b1 === 1 ? '1' : ''}
                              </button>
                            </td>
                            <td className="py-1.5 px-1 text-center border-r border-slate-200">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStudentClassField(
                                    s.record.studentId,
                                    cId,
                                    (prev) => {
                                      const isAbsent = prev.asistenciaB2Estado === 'falla';
                                      return {
                                        ...prev,
                                        asistenciaB2Estado: isAbsent
                                          ? 'presente_manual'
                                          : 'falla',
                                        bloque2Asistio: isAbsent,
                                        llamadoVirtualActivo: false
                                      };
                                    }
                                  )
                                }
                                className={`w-7 h-6 mx-auto rounded font-mono font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                  b2 === 1
                                    ? 'bg-red-600 text-white border-red-700'
                                    : 'bg-white hover:bg-slate-100 text-slate-400 border-slate-200'
                                }`}
                              >
                                {b2 === 1 ? '1' : ''}
                              </button>
                            </td>
                            <td className="py-1.5 px-1 text-center border-r border-slate-300 bg-slate-50 font-mono">
                              {missedClass ? (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-900 font-bold text-[10px]">
                                  Inasistió (1)
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold text-[10px]">
                                  Asistió
                                </span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-mono font-bold border-r border-slate-200 bg-amber-50/50">
                        {s.fallasBloque1}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold border-r border-slate-200 bg-amber-50/50">
                        {s.fallasBloque2}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-extrabold border-r border-slate-300 bg-amber-100/70 text-slate-950">
                        {s.totalFallasBloques}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-extrabold border-r border-slate-200 bg-red-50 text-red-900">
                        {s.totalClasesInasistidas} / {totalActiveClassesCount}
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-extrabold bg-emerald-50 text-emerald-900">
                        {s.totalClasesAsistidas} / {totalActiveClassesCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* VISTA 4: RESUMEN POR COMPETENCIAS Y DIAGNÓSTICO PEDAGÓGICO DE INTELIGENCIA ARTIFICIAL */}
      {/* ===================================================================================== */}
      {(activeSubView === 'vista4_ia' ||
        (activeSubView === 'vista_otras_zonas' && groupedZoneSubTab === 'ia')) && (
        <div className="space-y-6">
          {/* DASHBOARD DE RESUMEN ACADÉMICO POR COMPETENCIA Y POR ESTUDIANTE */}
          <AcademicSummaryDashboard
            dataset={syncedDataset}
            students={students}
            attempts={attempts}
          />

          {/* 3 PILARES ANALÍTICOS IA: CORRELACIÓN FALLA VS RENDIMIENTO, PUNTO DE INFLEXIÓN Y PLAN DE CHOQUE */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tarjeta 1: Correlación Falla vs. Rendimiento */}
            <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-indigo-700">
                <Sparkles className="w-4 h-4" />
                <span>Correlación Falla vs. Rendimiento</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Impacto Directo del Ausentismo en la Nota
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                El modelo analítico identificó que los estudiantes con{' '}
                <strong>≥ 2 inasistencias</strong> ({aiDiagnostics.twoOrMoreCount} alumnos) promedian{' '}
                <strong className="text-red-600 font-mono">
                  {aiDiagnostics.avgTwoOrMore.toFixed(1)} / 5.0
                </strong>{' '}
                (un{' '}
                <strong className="text-red-700 font-mono">{aiDiagnostics.dropPercentage}%</strong>{' '}
                inferior respecto a quienes tienen asistencia perfecta:{' '}
                <strong className="text-emerald-700 font-mono">
                  {aiDiagnostics.avgPerfect.toFixed(1)} / 5.0
                </strong>
                ).
              </p>
            </div>

            {/* Tarjeta 2: Punto de Inflexión */}
            <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-800">
                <TrendingDown className="w-4 h-4" />
                <span>Punto de Inflexión Detectado</span>
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Caída de Rendimiento en Clases {aiDiagnostics.lowestClass2?.id} y{' '}
                {aiDiagnostics.lowestClass1?.id}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Se detecta la mayor caída de notas en{' '}
                <strong>{aiDiagnostics.lowestClass1?.fullTitle}</strong> (Promedio:{' '}
                <strong className="font-mono">
                  {Number(aiDiagnostics.lowestClass1?.promedio ?? 0).toFixed(1)}
                </strong>
                ) y <strong>{aiDiagnostics.lowestClass2?.fullTitle}</strong> (Promedio:{' '}
                <strong className="font-mono">
                  {Number(aiDiagnostics.lowestClass2?.promedio ?? 0).toFixed(1)}
                </strong>
                ) asociada a entregas prácticas pendientes.
              </p>
            </div>

            {/* Tarjeta 3: Plan de Choque Articulado */}
            <div className="bg-emerald-50/70 border border-emerald-300 rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-900">
                  <Award className="w-4 h-4" />
                  <span>Plan de Choque Articulado</span>
                </div>
                <ul className="text-xs text-emerald-950 space-y-1.5 list-disc pl-4">
                  <li>
                    <strong>Uso del Examen Integral</strong> para reemplazar automáticamente la nota más baja de trabajos prácticos.
                  </li>
                  <li>
                    <strong>Bonificación por Retos e Insignias completados</strong> (
                    <strong className="font-mono">+0.3</strong> sobre la nota final).
                  </li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handleApplyShockPlanToAllAtRisk}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
              >
                ⚡ Activar Plan de Choque a Todos en Riesgo
              </button>
            </div>
          </div>

          {/* TABLA DIAGNÓSTICA: ESTUDIANTES PRIORITARIOS PARA NIVELACIÓN */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Estudiantes Prioritarios para Nivelación & Simulación de Plan de Choque
                </h3>
                <p className="text-xs text-slate-500">
                  Recomendaciones directas de acción pedagógica y activación individual de beneficios de nivelación
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-900">
                {aiDiagnostics.priorityStudents.length} casos prioritarios
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                    <th className="py-2.5 px-2.5">Estudiante & ID</th>
                    <th className="py-2.5 px-2 text-center">Promedio Actual</th>
                    <th className="py-2.5 px-2 text-center">Fallas</th>
                    <th className="py-2.5 px-2.5">Recomendación Directa de Acción IA</th>
                    <th className="py-2.5 px-2 text-center">Reemplazar Trabajo Bajo (Ex. Integral)</th>
                    <th className="py-2.5 px-2 text-center">Bono Retos (+0.3)</th>
                    <th className="py-2.5 px-2 text-center">Proyección Plan Choque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {aiDiagnostics.priorityStudents.map(({ summary: s, recomendacion }) => (
                    <tr key={s.record.studentId} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-2.5">
                        <div className="font-bold text-slate-900">{s.record.nombre}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          ID: {s.record.documento}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-red-600">
                        {s.promedioAcumulado.toFixed(1)} / 5.0
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold">
                        <span
                          className={`px-2 py-0.5 rounded ${
                            s.totalFallasBloques >= 3
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {s.totalFallasBloques} fallas
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-700 leading-snug">
                        {recomendacion}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStudentShockPlan(
                              s.record.studentId,
                              'reemplazoExamenIntegralAplicado'
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            s.record.reemplazoExamenIntegralAplicado
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.record.reemplazoExamenIntegralAplicado
                            ? '✓ Reemplazo Activo'
                            : `Activar (C${s.notaMasBajaTrabajoClaseId}: ${s.notaMasBajaTrabajoValor.toFixed(1)})`}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStudentShockPlan(
                              s.record.studentId,
                              'bonificacionRetosAplicada'
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            s.record.bonificacionRetosAplicada
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.record.bonificacionRetosAplicada
                            ? '✓ Bono +0.3 Activo'
                            : '+0.3 Bonificar'}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-emerald-700">
                        {s.promedioConPlanDeChoque.toFixed(1)} / 5.0
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* MODAL AVANZADO: MODIFICAR NOTAS, COMPONENTES E INASISTENCIAS (MASIVO, SELECCIÓN, IND) */}
      {/* ===================================================================================== */}
      {bulkEditorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-indigo-700">
                  Editor Académico Multinivel · Clases 1 a 6 (C1–C6)
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  Modificar Notas, Componentes e Inasistencias (Masivo, Por Selección o Individual)
                </h3>
                <p className="text-xs text-slate-600">
                  Seleccione a qué estudiantes y en qué clases/módulos desea modificar Comportamiento, Participación, Examen, Trabajo Práctico, Nota Final o Inasistencias.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkEditorModalOpen(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
              >
                Cerrar ✕
              </button>
            </div>

            <form onSubmit={handleExecuteBulkOrSelectionModification} className="space-y-5 text-xs">
              {/* PASO 1: ALCANCE DE ESTUDIANTES (MASIVO, SELECCIÓN, FILTRADOS O INDIVIDUAL) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                  1. ¿A quién desea aplicar los cambios?
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {[
                    {
                      id: 'all',
                      label: `Masivo: Todos (${dataset.records.length})`,
                      desc: 'Aplica a toda la nómina del curso'
                    },
                    {
                      id: 'selected',
                      label: `Por Selección ☑ (${selectedStudentIds.length})`,
                      desc: 'Solo a los alumnos marcados'
                    },
                    {
                      id: 'filtered',
                      label: `Filtro Actual (${filteredSummaries.length})`,
                      desc: 'Según búsqueda / filtro activo'
                    },
                    {
                      id: 'individual',
                      label: 'Individual (1 Estudiante)',
                      desc: 'Elegir un alumno específico'
                    }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBulkTargetMode(opt.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        bulkTargetMode === opt.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] opacity-85 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {bulkTargetMode === 'individual' && (
                  <div className="pt-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Seleccione el Estudiante Individual:
                    </label>
                    <select
                      value={bulkIndividualStudentId}
                      onChange={(e) => setBulkIndividualStudentId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                    >
                      {dataset.records.map((r) => (
                        <option key={r.studentId} value={r.studentId}>
                          {r.nombre} — ID: {r.documento}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {bulkTargetMode === 'selected' && (
                  <div className="pt-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-700">
                        Marque o desmarque los estudiantes a incluir ({selectedStudentIds.length} seleccionados):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedStudentIds(dataset.records.map((r) => r.studentId))
                          }
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                        >
                          Seleccionar Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentIds([])}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>
                    <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
                      {dataset.records.map((r) => {
                        const checked = selectedStudentIds.includes(r.studentId);
                        return (
                          <label
                            key={r.studentId}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-[11px] ${
                              checked
                                ? 'bg-indigo-50 border-indigo-300 font-bold text-indigo-950'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectStudent(r.studentId)}
                              className="rounded border-slate-300"
                            />
                            <span className="truncate">{r.nombre}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* PASO 2: SELECCIÓN DE CLASES / MÓDULOS (C1 A C6) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 text-xs sm:text-sm">
                    2. ¿En qué Clase(s) / Módulo(s) desea aplicar los cambios?
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBulkTargetClasses([selectedClassId])}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-800 cursor-pointer"
                    >
                      Solo Clase Actual (C{selectedClassId})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkTargetClasses(activeClassIds)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold cursor-pointer"
                    >
                      Todos los Módulos ({shortClassesRangeLabel})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {effectiveClassSessions.map((cs) => {
                    const active = bulkTargetClasses.includes(cs.id);
                    return (
                      <button
                        key={cs.id}
                        type="button"
                        onClick={() => toggleBulkClassId(cs.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <div className="font-mono text-xs font-bold">{cs.code}</div>
                        <div className="text-[10px] truncate opacity-90">{cs.shortTitle}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PASO 3: VALORES A MODIFICAR (COMPONENTES, NOTA FINAL, INASISTENCIAS, OBSERVACIONES) */}
              <div className="space-y-3">
                <div className="font-bold text-slate-900 text-xs sm:text-sm">
                  3. Configure los campos que desea modificar (los campos en «Sin cambio» se conservarán intactos):
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Comportamiento */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Comportamiento (0.0 – 5.0)</span>
                      <select
                        value={bulkComportamientoMode}
                        onChange={(e) => setBulkComportamientoMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set">Fijar nota exacta (=)</option>
                        <option value="delta">Sumar / Restar (+/-)</option>
                      </select>
                    </div>
                    {bulkComportamientoMode !== 'none' && (
                      <input
                        type="number"
                        step="0.1"
                        min={bulkComportamientoMode === 'set' ? 0 : -5}
                        max="5"
                        value={bulkComportamientoVal}
                        onChange={(e) => setBulkComportamientoVal(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-sky-400 font-mono font-bold text-sm"
                      />
                    )}
                  </div>

                  {/* Participación */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Participación (0.0 – 5.0)</span>
                      <select
                        value={bulkParticipacionMode}
                        onChange={(e) => setBulkParticipacionMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set">Fijar nota exacta (=)</option>
                        <option value="delta">Sumar / Restar (+/-)</option>
                      </select>
                    </div>
                    {bulkParticipacionMode !== 'none' && (
                      <input
                        type="number"
                        step="0.1"
                        min={bulkParticipacionMode === 'set' ? 0 : -5}
                        max="5"
                        value={bulkParticipacionVal}
                        onChange={(e) => setBulkParticipacionVal(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-sky-400 font-mono font-bold text-sm"
                      />
                    )}
                  </div>

                  {/* Examen */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Examen de Clase (0.0 – 5.0)</span>
                      <select
                        value={bulkExamenMode}
                        onChange={(e) => setBulkExamenMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set">Fijar nota exacta (=)</option>
                        <option value="delta">Sumar / Restar (+/-)</option>
                      </select>
                    </div>
                    {bulkExamenMode !== 'none' && (
                      <input
                        type="number"
                        step="0.1"
                        min={bulkExamenMode === 'set' ? 0 : -5}
                        max="5"
                        value={bulkExamenVal}
                        onChange={(e) => setBulkExamenVal(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-sky-400 font-mono font-bold text-sm"
                      />
                    )}
                  </div>

                  {/* Trabajo Práctico */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Trabajo Práctico (0.0 – 5.0)</span>
                      <select
                        value={bulkTrabajoMode}
                        onChange={(e) => setBulkTrabajoMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set">Fijar nota exacta (=)</option>
                        <option value="delta">Sumar / Restar (+/-)</option>
                      </select>
                    </div>
                    {bulkTrabajoMode !== 'none' && (
                      <input
                        type="number"
                        step="0.1"
                        min={bulkTrabajoMode === 'set' ? 0 : -5}
                        max="5"
                        value={bulkTrabajoVal}
                        onChange={(e) => setBulkTrabajoVal(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-sky-400 font-mono font-bold text-sm"
                      />
                    )}
                  </div>

                  {/* Nota Final de la Clase / Módulo */}
                  <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-indigo-950">Nota Final de la Clase (0.0 – 5.0)</span>
                      <select
                        value={bulkNotaFinalMode}
                        onChange={(e) => setBulkNotaFinalMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-white font-semibold text-indigo-950"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set_all_components">Fijar Nota en los 4 Componentes y Final (=)</option>
                        <option value="set_direct">Fijar Nota Final Directa (=)</option>
                        <option value="delta">Sumar / Restar a la Nota Final (+/-)</option>
                        <option value="auto">Recalcular según promedio de los 4 componentes</option>
                      </select>
                    </div>
                    {(bulkNotaFinalMode === 'set_direct' ||
                      bulkNotaFinalMode === 'set_all_components' ||
                      bulkNotaFinalMode === 'delta') && (
                      <input
                        type="number"
                        step="0.1"
                        min={bulkNotaFinalMode === 'delta' ? -5 : 0}
                        max="5"
                        value={bulkNotaFinalVal}
                        onChange={(e) => setBulkNotaFinalVal(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-indigo-400 bg-white font-mono font-bold text-sm"
                      />
                    )}
                  </div>

                  {/* Inasistencias / Asistencia por Bloques (B1 y B2) */}
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-950">Inasistencias / Asistencia (B1 y B2)</span>
                      <select
                        value={bulkInasistenciasMode}
                        onChange={(e) => setBulkInasistenciasMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-amber-300 bg-white font-semibold text-amber-950"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="0_fallas">0 Inasistencias (✔️ Asistió B1 y ✔️ Asistió B2)</option>
                        <option value="1_falla_b1">1 Inasistencia en B1 (❌ Falla B1 · ✔️ Asistió B2)</option>
                        <option value="1_falla_b2">1 Inasistencia en B2 (✔️ Asistió B1 · ❌ Falla B2)</option>
                        <option value="2_fallas">2 Inasistencias (❌ Falla B1 y ❌ Falla B2)</option>
                        <option value="only_b1_present">Solo Bloque 1: ✔️ Asistió</option>
                        <option value="only_b1_absent">Solo Bloque 1: ❌ Falla</option>
                        <option value="only_b2_present">Solo Bloque 2: ✔️ Asistió</option>
                        <option value="only_b2_absent">Solo Bloque 2: ❌ Falla</option>
                      </select>
                    </div>
                  </div>

                  {/* Observaciones Docentes */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">Observación Docente</span>
                      <select
                        value={bulkObservacionMode}
                        onChange={(e) => setBulkObservacionMode(e.target.value as any)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                      >
                        <option value="none">Sin cambio</option>
                        <option value="set">Reemplazar observación</option>
                        <option value="append">Agregar al final de la observación</option>
                        <option value="clear">Limpiar / Borrar observación</option>
                      </select>
                    </div>
                    {(bulkObservacionMode === 'set' || bulkObservacionMode === 'append') && (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={bulkObservacionText}
                          onChange={(e) => setBulkObservacionText(e.target.value)}
                          placeholder="Ej. MÁS 1 PUNTO EN SUSTENTACIÓN"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setBulkObservacionText('MÁS 1 PUNTO EN SUSTENTACIÓN')}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 font-mono font-bold text-[10px] shrink-0 cursor-pointer"
                        >
                          +1 Pto
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bonificaciones Plan de Choque */}
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="font-bold text-slate-900">Bonificación Retos & Plan de Choque</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Bono Retos (+0.3)</label>
                        <select
                          value={bulkBonoRetosMode}
                          onChange={(e) => setBulkBonoRetosMode(e.target.value as any)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                        >
                          <option value="none">Sin cambio</option>
                          <option value="enable">Activar (+0.3)</option>
                          <option value="disable">Desactivar</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">Reemplazo Ex. Integral</label>
                        <select
                          value={bulkReemplazoExMode}
                          onChange={(e) => setBulkReemplazoExMode(e.target.value as any)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 font-semibold"
                        >
                          <option value="none">Sin cambio</option>
                          <option value="enable">Activar Reemplazo</option>
                          <option value="disable">Desactivar</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setBulkEditorModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  ✓ Aplicar Cambios y Guardar en Servidor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* MODAL: VER / EDITAR FICHA INDIVIDUAL DE CUALQUIER ESTUDIANTE                          */}
      {/* ===================================================================================== */}
      {selectedFichaSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-sky-700">
                  Ficha Académica Individual · Sincronizada con el Portal del Estudiante
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {selectedFichaSummary.record.nombre}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  Documento ID: {selectedFichaSummary.record.documento}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentIdForFicha(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cerrar Ficha ✕
              </button>
            </div>

            <StudentPersonalAcademicFicha
              summary={selectedFichaSummary}
              classSessions={effectiveClassSessions}
              editableByTeacher={true}
              onUpdateClassField={(claseId, updater) =>
                handleUpdateStudentClassField(
                  selectedFichaSummary.record.studentId,
                  claseId,
                  updater
                )
              }
              onToggleShockPlan={(field) =>
                handleToggleStudentShockPlan(selectedFichaSummary.record.studentId, field)
              }
            />
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* MODAL: AGREGAR NUEVO ESTUDIANTE A LA GESTIÓN ACADÉMICA                                */}
      {/* ===================================================================================== */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                Agregar Estudiante a Gestión Académica
              </h3>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Número de Documento (ID)
                </label>
                <input
                  type="text"
                  required
                  value={newStudentDoc}
                  onChange={(e) => setNewStudentDoc(e.target.value)}
                  placeholder="Ej. 1054569999"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Nombre Completo del Estudiante
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Ej. Carlos Andrés Ramírez"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Correo Electrónico <span className="text-[10px] font-normal text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="email"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    placeholder="ej. alumno@correo.com"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Número de WhatsApp <span className="text-[10px] font-normal text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={newStudentWhatsapp}
                    onChange={(e) => setNewStudentWhatsapp(e.target.value)}
                    placeholder="ej. 300 123 4567"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncToOfficialRoster}
                  onChange={(e) => setSyncToOfficialRoster(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>
                  Vincular también a la Nómina Oficial de Estudiantes (genera código de acceso automático)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                >
                  Guardar Estudiante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================================== */}
      {/* MODAL: CONFIRMAR ELIMINACIÓN DE REGISTRO                                              */}
      {/* ===================================================================================== */}
      {deleteConfirmStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar ficha académica de {deleteConfirmStudent.nombre}?
                </h3>
                <p className="text-xs text-slate-600">
                  Documento: <strong className="font-mono">{deleteConfirmStudent.documento}</strong>. Esta acción actualizará la base de datos del servidor inmediatamente.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={alsoDeleteFromOfficialRoster}
                onChange={(e) => setAlsoDeleteFromOfficialRoster(e.target.checked)}
              />
              <span>Eliminar también de la Nómina Oficial de Estudiantes</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmStudent(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Sí, Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FICHA PERSONAL DE NOTAS DE CLASE & ASISTENCIA
 * Usada tanto en el Portal del Estudiante (modo lectura clara y móvil-first)
 * como en el Modal de Ficha Individual del Panel Docente (con edición directa).
 */
export function StudentPersonalAcademicFicha({
  summary,
  classSessions = OFFICIAL_CLASS_SESSIONS,
  courseName = 'Curso Oficial',
  editableByTeacher = false,
  isStudentPortalView = false,
  onUpdateClassField,
  onToggleShockPlan,
  onStudentRespondRollCall,
  onStudentSubmitTrabajo,
  onStudentSubmitExcusa
}: {
  summary: ComputedStudentAcademicSummary;
  classSessions?: ClassSessionDefinition[];
  courseName?: string;
  editableByTeacher?: boolean;
  isStudentPortalView?: boolean;
  onUpdateClassField?: (
    claseId: ClassSessionId,
    updater: (prev: StudentClassSessionRecord) => StudentClassSessionRecord
  ) => void;
  onToggleShockPlan?: (
    field: 'bonificacionRetosAplicada' | 'reemplazoExamenIntegralAplicado'
  ) => void;
  onStudentRespondRollCall?: (claseId: ClassSessionId) => void;
  onStudentSubmitTrabajo?: (
    claseId: ClassSessionId,
    entregaTexto: string,
    entregaEnlace: string
  ) => void;
  onStudentSubmitExcusa?: (
    claseId: ClassSessionId,
    bloque: 'A' | 'B' | 'AB',
    motivo: string,
    soporteUrl: string
  ) => void;
}) {
  const activeSessions =
    Array.isArray(classSessions) && classSessions.length > 0
      ? classSessions
      : OFFICIAL_CLASS_SESSIONS;

  const [openSubmissionClassId, setOpenSubmissionClassId] = useState<ClassSessionId | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);

  // Estados para Justificación de Inasistencias / Solicitud de Excusa
  const [openExcuseClassId, setOpenExcuseClassId] = useState<ClassSessionId | null>(null);
  const [excuseBloque, setExcuseBloque] = useState<'A' | 'B' | 'AB'>('AB');
  const [excuseMotivo, setExcuseMotivo] = useState('');
  const [excuseSoporteUrl, setExcuseSoporteUrl] = useState('');
  const [teacherExcuseReplyDraft, setTeacherExcuseReplyDraft] = useState<Record<number, string>>({});

  // Estados para Simulador Interactivo de Nota Final («¿Cuánto necesito sacar?»)
  const [showGradeSimulator, setShowGradeSimulator] = useState<boolean>(true);
  const [simTargetGoal, setSimTargetGoal] = useState<number>(3.0);
  const [simNextExam, setSimNextExam] = useState<number>(3.8);
  const [simNextTrabajo, setSimNextTrabajo] = useState<number>(4.0);
  const [simNextParticipacion, setSimNextParticipacion] = useState<number>(4.2);
  const [simNextComportamiento, setSimNextComportamiento] = useState<number>(4.5);
  const [simIntegralExam, setSimIntegralExam] = useState<number>(
    summary.notaExamenIntegralPlataforma ?? 3.8
  );
  const [simIncludeRetoBonus, setSimIncludeRetoBonus] = useState<boolean>(
    Boolean(summary.record.bonificacionRetosAplicada || summary.insigniasRetosCount > 0)
  );

  // Estado para Boletín Parcial de Notas e Insignias en PDF / Impresión
  const [showPrintableBoletinModal, setShowPrintableBoletinModal] = useState<boolean>(false);

  // Cálculo del Simulador «¿Cuánto necesito sacar?»
  const gradeSimulationResult = useMemo(() => {
    const sampleWeights = activeSessions[0]?.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
    const projectedNextSessionGrade = computeClassSessionFinalGrade(
      simNextComportamiento,
      simNextParticipacion,
      simNextExam,
      simNextTrabajo,
      '',
      sampleWeights,
      {
        comportamientoCalificado: true,
        participacionCalificado: true,
        examenCalificado: true,
        trabajoCalificado: true
      }
    );

    const currentGradedCount = summary.gradedClassesCount;
    const totalCourseClasses = Math.max(1, activeSessions.length);
    const currentSum = summary.promedioBase * currentGradedCount;
    const remainingClasses = Math.max(1, totalCourseClasses - currentGradedCount);

    // If Integral Exam replaces lowest practical work, estimate boost
    const integralBoost =
      simIntegralExam > (summary.notaMasBajaTrabajoValor || 0) && currentGradedCount > 0
        ? ((simIntegralExam - (summary.notaMasBajaTrabajoValor || 0)) *
            ((sampleWeights.trabajoPct || 25) / 100)) /
          Math.max(1, currentGradedCount + 1)
        : 0;

    const bonus = simIncludeRetoBonus ? 0.3 : 0;
    const projectedNewCumulative = clampGrade05(
      (currentSum + projectedNextSessionGrade) / (currentGradedCount + 1) + integralBoost + bonus
    );

    // Minimum required grade in the remaining classes to reach simTargetGoal
    const effectiveTargetBase = Math.max(0, simTargetGoal - bonus - integralBoost);
    const neededTotalPoints = effectiveTargetBase * (currentGradedCount + 1);
    const neededNextClassGrade = Number(
      Math.max(0, Math.min(5.0, neededTotalPoints - currentSum)).toFixed(2)
    );
    const isAchievableInNext = neededTotalPoints - currentSum <= 5.0;

    return {
      projectedNextSessionGrade,
      projectedNewCumulative,
      neededNextClassGrade,
      isAchievableInNext,
      remainingClasses,
      sampleWeights
    };
  }, [
    activeSessions,
    simNextComportamiento,
    simNextParticipacion,
    simNextExam,
    simNextTrabajo,
    simIntegralExam,
    simIncludeRetoBonus,
    simTargetGoal,
    summary
  ]);

  return (
    <div className="space-y-5">
      {submissionFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
          {submissionFeedback}
        </div>
      )}

      {/* 1. RESUMEN EJECUTIVO DE LA FICHA PERSONAL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="text-xs font-semibold text-slate-500">
            Promedio Acumulado de Clase Presencial
          </div>
          <div className="flex items-baseline gap-2">
            {!summary.hasAnyAcademicGrade ? (
              <span className="text-xl sm:text-2xl font-bold text-slate-400">
                Sin nota registrada
              </span>
            ) : (
              <>
                <span
                  className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${
                    summary.promedioAcumulado >= 3.0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {summary.promedioAcumulado.toFixed(1)} / 5.0
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                    summary.aprobado
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {summary.estadoAcademico}
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-600">
            {summary.hasAnyAcademicGrade
              ? `Promedio base (${summary.gradedClassesCount} clase(s) calificada(s)): ${summary.promedioBase.toFixed(1)}`
              : 'Se actualizará automáticamente al presentar exámenes, retos o recibir nota del docente.'}
            {summary.record.bonificacionRetosAplicada ? ' (+0.3 Bono Retos activo)' : ''}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="text-xs font-semibold text-slate-500">
            Porcentaje de Asistencia y Total de Fallas
          </div>
          <div className="flex items-baseline gap-2">
            {summary.totalBloquesEvaluados === 0 ? (
              <span className="text-xl font-bold text-slate-400">Sin llamado aún</span>
            ) : (
              <>
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-sky-700">
                  {summary.porcentajeAsistencia}%
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono ${
                    summary.totalFallasBloques >= 3
                      ? 'bg-red-100 text-red-800'
                      : summary.totalFallasBloques >= 1
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {summary.totalFallasBloques} falla(s)
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-600">
            Bloques asistidos: {summary.totalBloquesAsistidos} · Evaluados:{' '}
            {summary.totalBloquesEvaluados} de 12
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500">
            Semáforo Reglamentario & Nivelación
          </div>
          <div className="text-sm font-bold">
            {summary.riesgoAusentismo === 'SIN_REGISTRO' ? (
              <span className="text-slate-500">⚪ Sin registro de asistencia aún</span>
            ) : summary.riesgoAusentismo === 'CRITICO' ? (
              <span className="text-red-700">🔴 Riesgo Crítico (≥ 3 fallas)</span>
            ) : summary.riesgoAusentismo === 'MODERADO' ? (
              <span className="text-amber-700">🟡 Riesgo Moderado (1–2 fallas)</span>
            ) : (
              <span className="text-emerald-700">🟢 Asistencia Perfecta (0 fallas)</span>
            )}
          </div>
          {editableByTeacher && onToggleShockPlan ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onToggleShockPlan('bonificacionRetosAplicada')}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  summary.record.bonificacionRetosAplicada
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {summary.record.bonificacionRetosAplicada ? '✓ Bono +0.3' : 'Activar +0.3 Retos'}
              </button>
              <button
                type="button"
                onClick={() => onToggleShockPlan('reemplazoExamenIntegralAplicado')}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  summary.record.reemplazoExamenIntegralAplicado
                    ? 'bg-sky-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {summary.record.reemplazoExamenIntegralAplicado
                  ? '✓ Reemplazo Ex. Integral'
                  : 'Reemplazar Trabajo Bajo'}
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-slate-600">
              Insignias Mini Retos: <strong>{summary.insigniasRetosCount}/5</strong> • Trabajos en revisión:{' '}
              <strong>{summary.trabajosPendientesRevisionCount}</strong>
            </div>
          )}
        </div>
      </div>

      {/* BARRA DE ACCIONES RÁPIDAS: BOLETÍN PARCIAL PDF / IMPRESIÓN Y SIMULADOR DE NOTA FINAL */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-amber-300">
            <span>🎓 Herramientas Estudiantiles de Proyección y Certificación</span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-white">
            Simulador «¿Cuánto necesito sacar?» y Boletín Parcial Oficial en PDF
          </h4>
          <p className="text-xs text-slate-300">
            Proyecte su nota final moviendo los controles deslizantes, justifique inasistencias con soporte o descargue su comprobante acumulado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGradeSimulator((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center gap-1.5 ${
              showGradeSimulator
                ? 'bg-amber-400 text-slate-950 shadow-xs'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            }`}
          >
            <span>🧮 {showGradeSimulator ? 'Ocultar Simulador' : 'Simulador «¿Cuánto necesito?»'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintableBoletinModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>🖨️ Descargar Boletín Parcial / Insignias (PDF)</span>
          </button>
        </div>
      </div>

      {/* SIMULADOR INTERACTIVO DE NOTA FINAL («¿CUÁNTO NECESITO SACAR?») */}
      {showGradeSimulator && (
        <div className="bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/70 border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
            <div>
              <span className="text-[11px] font-mono font-bold uppercase text-indigo-700">
                Calculadora Interactiva de Proyección Académica
              </span>
              <h4 className="text-base font-extrabold text-slate-900">
                🧮 Simulador de Nota Final: «¿Cuánto necesito sacar en mi próxima sesión?»
              </h4>
              <p className="text-xs text-slate-600">
                Deslice los controles para simular sus calificaciones en el próximo Examen, Trabajo Práctico, Reto/Sustentación y Examen Integral.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-indigo-200 shrink-0 text-xs">
              <span className="font-bold text-slate-600 px-2">Meta deseada:</span>
              {[
                { val: 3.0, label: '3.0 (Aprobar)' },
                { val: 3.8, label: '3.8 (Destacado)' },
                { val: 4.5, label: '4.5 (Excelencia)' }
              ].map((goal) => (
                <button
                  key={goal.val}
                  type="button"
                  onClick={() => setSimTargetGoal(goal.val)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold cursor-pointer transition-colors ${
                    simTargetGoal === goal.val
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {goal.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Controles deslizantes */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>📝 Próximo Examen ({gradeSimulationResult.sampleWeights.examenPct}%)</span>
                  <span className="font-mono text-indigo-700">{simNextExam.toFixed(1)} / 5.0</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={simNextExam}
                  onChange={(e) => setSimNextExam(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>📤 Próximo Trabajo Práctico ({gradeSimulationResult.sampleWeights.trabajoPct}%)</span>
                  <span className="font-mono text-sky-700">{simNextTrabajo.toFixed(1)} / 5.0</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={simNextTrabajo}
                  onChange={(e) => setSimNextTrabajo(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>🏅 Mini Reto / Sustent. ({gradeSimulationResult.sampleWeights.participacionPct}%)</span>
                  <span className="font-mono text-amber-700">{simNextParticipacion.toFixed(1)} / 5.0</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={simNextParticipacion}
                  onChange={(e) => setSimNextParticipacion(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>🤝 Comportamiento ({gradeSimulationResult.sampleWeights.comportamientoPct}%)</span>
                  <span className="font-mono text-emerald-700">{simNextComportamiento.toFixed(1)} / 5.0</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={simNextComportamiento}
                  onChange={(e) => setSimNextComportamiento(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>🎯 Examen Integral (Reemplaza trabajo más bajo)</span>
                    <span className="font-mono text-purple-700">{simIntegralExam.toFixed(1)} / 5.0</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={simIntegralExam}
                    onChange={(e) => setSimIntegralExam(parseFloat(e.target.value))}
                    className="w-full accent-purple-600 cursor-pointer"
                  />
                </div>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 font-bold text-amber-950 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={simIncludeRetoBonus}
                    onChange={(e) => setSimIncludeRetoBonus(e.target.checked)}
                  />
                  <span>Incluir Bono +0.3 Insignias</span>
                </label>
              </div>
            </div>

            {/* Resultado proyectado */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                  <div className="text-[11px] text-slate-300">Nota Próxima Clase</div>
                  <div className="text-2xl font-extrabold font-mono text-sky-300 mt-0.5">
                    {gradeSimulationResult.projectedNextSessionGrade.toFixed(2)} / 5.0
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/10 border border-white/10">
                  <div className="text-[11px] text-slate-300">Nuevo Promedio Proyectado</div>
                  <div
                    className={`text-2xl font-extrabold font-mono mt-0.5 ${
                      gradeSimulationResult.projectedNewCumulative >= simTargetGoal
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {gradeSimulationResult.projectedNewCumulative.toFixed(2)} / 5.0
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/90 border border-indigo-400/30 text-xs space-y-1">
                <div className="font-bold text-amber-300">
                  💡 Diagnóstico «¿Cuánto necesito sacar para llegar a {simTargetGoal.toFixed(1)}?»:
                </div>
                <p className="text-slate-200 leading-relaxed">
                  {gradeSimulationResult.neededNextClassGrade <= 0 ? (
                    <>
                      ¡Excelente! Con tu acumulado actual ya superas la meta de{' '}
                      <strong>{simTargetGoal.toFixed(1)}</strong>. Mantén tus entregas al día.
                    </>
                  ) : gradeSimulationResult.isAchievableInNext ? (
                    <>
                      Necesitas obtener al menos{' '}
                      <strong className="text-emerald-300 font-mono text-sm">
                        {gradeSimulationResult.neededNextClassGrade.toFixed(1)} / 5.0
                      </strong>{' '}
                      en tu próxima sesión evaluada para situar tu promedio acumulado en{' '}
                      <strong>{simTargetGoal.toFixed(1)}</strong>.
                    </>
                  ) : (
                    <>
                      Para alcanzar <strong>{simTargetGoal.toFixed(1)}</strong> necesitarás promediar{' '}
                      <strong className="text-amber-300 font-mono">4.5+</strong> en las próximas{' '}
                      {gradeSimulationResult.remainingClasses} sesiones y activar el{' '}
                      <strong>Bono +0.3 de Mini Retos</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. DESGLOSE DETALLADO DE CLASES 1 A 6 (NOTAS, ASISTENCIA B1/B2, ENTREGAS Y LLAMADO VIRTUAL) */}
      <div className="space-y-3">
        <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700">
          Desglose Detallado por Sesión (Clases 1 a 6 · Componentes, Entrega de Trabajos y Asistencia)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {activeSessions.map((cs) => {
            const c = summary.record.clases[cs.id];
            const finalNote = summary.classFinals[cs.id];
            const hasFinal = summary.classHasFinalGrade[cs.id];
            const w = cs.ponderacion || DEFAULT_CLASS_GRADING_WEIGHTS;
            const docs = Array.isArray(cs.documentosEnlaces) ? cs.documentosEnlaces : [];
            const b1Est = c.asistenciaB1Estado || 'sin_registrar';
            const b2Est = c.asistenciaB2Estado || 'sin_registrar';

            return (
              <div
                key={cs.id}
                className={`p-4 rounded-2xl border bg-white shadow-2xs space-y-3 flex flex-col justify-between ${
                  c.llamadoVirtualActivo
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'border-slate-200'
                }`}
              >
                <div className="space-y-2.5">
                  {/* Banner de Llamado de Asistencia Virtual Activo */}
                  {c.llamadoVirtualActivo && isStudentPortalView && onStudentRespondRollCall && (
                    <div className="p-3 rounded-xl bg-indigo-600 text-white flex flex-wrap items-center justify-between gap-2 animate-pulse">
                      <div className="text-xs font-bold">
                        📢 El docente está llamando a lista en {cs.code}. ¡Confirme su asistencia!
                      </div>
                      <button
                        type="button"
                        onClick={() => onStudentRespondRollCall(cs.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-xs cursor-pointer shadow-xs"
                      >
                        ✋ ¡Presente! Confirmar Asistencia
                      </button>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono font-bold uppercase text-sky-700">
                        Sesión {cs.code} · {cs.examenesCount ?? 1} Ex. · {cs.retosCount ?? 2} Retos
                      </span>
                      <h5 className="text-sm font-bold text-slate-900 leading-snug">
                        {cs.fullTitle || cs.title}
                      </h5>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs shrink-0 ${
                        !hasFinal
                          ? 'bg-slate-100 text-slate-500 border border-slate-200'
                          : finalNote >= 3.0
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {hasFinal ? `Final: ${finalNote.toFixed(1)} / 5.0` : 'Sin nota'}
                    </span>
                  </div>

                  {/* 4 Componentes Académicos con Porcentaje de Ponderación */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center pt-1">
                    {(
                      [
                        ['comportamiento', `Comport. (${w.comportamientoPct}%)`],
                        ['participacion', `Sustent./Reto (${w.participacionPct}%)`],
                        ['examen', `Examen (${w.examenPct}%)`],
                        ['trabajoPractico', `Trabajo (${w.trabajoPct}%)`]
                      ] as const
                    ).map(([field, label]) => {
                      const isGraded =
                        field === 'comportamiento'
                          ? Boolean(c.comportamientoCalificado)
                          : field === 'participacion'
                          ? Boolean(c.participacionCalificado)
                          : field === 'examen'
                          ? Boolean(c.examenCalificado)
                          : Boolean(c.trabajoCalificado);
                      const isPendingReview =
                        field === 'trabajoPractico' &&
                        c.trabajoEstado === 'pendiente_revision' &&
                        !isGraded;

                      return (
                        <div
                          key={field}
                          className={`p-2 rounded-xl border ${
                            isPendingReview
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-slate-50 border-slate-200/80'
                          }`}
                        >
                          <div className="text-[10px] text-slate-500 font-medium">{label}</div>
                          {editableByTeacher && onUpdateClassField ? (
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="5"
                              placeholder="Sin nota"
                              value={isGraded ? c[field] : ''}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (raw === '') {
                                  onUpdateClassField(cs.id, (prev) => ({
                                    ...prev,
                                    [field]: 0,
                                    ...(field === 'comportamiento'
                                      ? { comportamientoCalificado: false }
                                      : field === 'participacion'
                                      ? {
                                          participacionCalificado: false,
                                          participacionManualOverride: true
                                        }
                                      : field === 'examen'
                                      ? { examenCalificado: false, examenManualOverride: true }
                                      : {
                                          trabajoCalificado: false,
                                          trabajoEstado: prev.trabajoEntregaTexto
                                            ? 'pendiente_revision'
                                            : 'sin_entregar'
                                        }),
                                    autoCalcularNotaFinal: true
                                  }));
                                  return;
                                }
                                const val = clampGrade05(parseFloat(raw) || 0);
                                onUpdateClassField(cs.id, (prev) => ({
                                  ...prev,
                                  [field]: val,
                                  ...(field === 'comportamiento'
                                    ? { comportamientoCalificado: true }
                                    : field === 'participacion'
                                    ? {
                                        participacionCalificado: true,
                                        participacionManualOverride: true
                                      }
                                    : field === 'examen'
                                    ? { examenCalificado: true, examenManualOverride: true }
                                    : { trabajoCalificado: true, trabajoEstado: 'calificado' }),
                                  autoCalcularNotaFinal: true
                                }));
                              }}
                              className="w-full mt-0.5 text-center font-mono font-bold text-xs bg-white border border-slate-300 rounded py-0.5 placeholder:font-sans placeholder:font-normal placeholder:text-[10px]"
                            />
                          ) : (
                            <div className="font-mono font-bold text-xs text-slate-900 mt-0.5">
                              {isPendingReview ? (
                                <span className="text-[10px] font-sans font-bold text-amber-800">
                                  ⏳ Pendiente revisión
                                </span>
                              ) : isGraded ? (
                                c[field].toFixed(1)
                              ) : (
                                <span className="text-[10px] font-sans font-normal text-slate-400">
                                  Sin nota
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sección de Entrega de Trabajo Práctico (Estudiante o Revisión del Docente) */}
                  {editableByTeacher && c.trabajoEntregaTexto && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                      <div className="font-bold text-amber-950 flex items-center justify-between">
                        <span>📥 Trabajo entregado por el estudiante:</span>
                        <span className="text-[10px] font-mono">
                          {c.trabajoCalificado ? '✅ Calificado' : '⏳ Pendiente por revisión'}
                        </span>
                      </div>
                      <p className="text-slate-700 text-[11px]">{c.trabajoEntregaTexto}</p>
                      {c.trabajoEntregaEnlace && (
                        <a
                          href={c.trabajoEntregaEnlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-[11px] font-bold text-sky-700 underline"
                        >
                          🔗 Abrir enlace adjunto del trabajo
                        </a>
                      )}
                    </div>
                  )}

                  {isStudentPortalView && onStudentSubmitTrabajo && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          📤 Trabajo Práctico de {cs.code}:
                        </span>
                        {c.trabajoCalificado ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                            ✅ Calificado: {c.trabajoPractico.toFixed(1)} / 5.0
                          </span>
                        ) : c.trabajoEstado === 'pendiente_revision' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                            ⏳ Entregado · Pendiente por revisión del docente
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[10px]">
                            Sin entregar
                          </span>
                        )}
                      </div>

                      {openSubmissionClassId === cs.id ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={2}
                            value={submissionText}
                            onChange={(e) => setSubmissionText(e.target.value)}
                            placeholder="Describa su entrega o respuesta del trabajo práctico de esta clase..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                          <input
                            type="text"
                            value={submissionLink}
                            onChange={(e) => setSubmissionLink(e.target.value)}
                            placeholder="Enlace opcional (Google Drive, documento, repositorio...)"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setOpenSubmissionClassId(null)}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold text-[11px] cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!submissionText.trim() && !submissionLink.trim()) return;
                                onStudentSubmitTrabajo(
                                  cs.id,
                                  submissionText.trim() || 'Trabajo práctico enviado para revisión',
                                  submissionLink.trim()
                                );
                                setOpenSubmissionClassId(null);
                                setSubmissionText('');
                                setSubmissionLink('');
                                setSubmissionFeedback(
                                  `✓ Trabajo de ${cs.code} enviado. Estado actualizado a "Pendiente por revisión del docente".`
                                );
                                setTimeout(() => setSubmissionFeedback(null), 4000);
                              }}
                              className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] cursor-pointer"
                            >
                              Enviar para Revisión Docente
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          {c.trabajoEntregaTexto ? (
                            <span className="text-[11px] text-slate-600 truncate">
                              Entrega: «{c.trabajoEntregaTexto}»
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              Envíe su actividad para que el docente le asigne la nota.
                            </span>
                          )}
                          {!c.trabajoCalificado && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenSubmissionClassId(cs.id);
                                setSubmissionText(c.trabajoEntregaTexto || '');
                                setSubmissionLink(c.trabajoEntregaEnlace || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                            >
                              {c.trabajoEstado === 'pendiente_revision'
                                ? 'Actualizar Entrega'
                                : 'Entregar Trabajo'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {docs.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase text-sky-900">
                        📎 Documentos Descargables del Módulo:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {docs.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold transition-colors"
                          >
                            <Download className="w-3 h-3 shrink-0" />
                            <span>{doc.titulo}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Asistencia por Bloques (B1 y B2) y Observaciones Docentes */}
                <div className="space-y-2 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-600">Asistencia por Bloques:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!editableByTeacher}
                        onClick={() =>
                          editableByTeacher &&
                          onUpdateClassField?.(cs.id, (prev) => {
                            const cur = prev.asistenciaB1Estado || 'sin_registrar';
                            const nextEst =
                              cur === 'sin_registrar' || cur === 'llamando'
                                ? 'presente_manual'
                                : cur === 'presente_manual' || cur === 'presente_virtual'
                                ? 'falla'
                                : 'sin_registrar';
                            return {
                              ...prev,
                              asistenciaB1Estado: nextEst,
                              bloque1Asistio: nextEst === 'presente_manual',
                              llamadoVirtualActivo: false
                            };
                          })
                        }
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                          b1Est === 'presente_virtual' || b1Est === 'presente_manual'
                            ? 'bg-emerald-100 text-emerald-900'
                            : b1Est === 'falla'
                            ? 'bg-red-100 text-red-800'
                            : b1Est === 'llamando'
                            ? 'bg-indigo-100 text-indigo-900 animate-pulse'
                            : 'bg-slate-100 text-slate-600'
                        } ${editableByTeacher ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        B1:{' '}
                        {b1Est === 'presente_virtual'
                          ? '✅ Virtual'
                          : b1Est === 'presente_manual'
                          ? '✔️ Asistió'
                          : b1Est === 'falla'
                          ? '❌ Falla'
                          : b1Est === 'llamando'
                          ? '📡 Llamando'
                          : '⚪ Sin reg.'}
                      </button>

                      <button
                        type="button"
                        disabled={!editableByTeacher}
                        onClick={() =>
                          editableByTeacher &&
                          onUpdateClassField?.(cs.id, (prev) => {
                            const cur = prev.asistenciaB2Estado || 'sin_registrar';
                            const nextEst =
                              cur === 'sin_registrar' || cur === 'llamando'
                                ? 'presente_manual'
                                : cur === 'presente_manual' || cur === 'presente_virtual'
                                ? 'falla'
                                : 'sin_registrar';
                            return {
                              ...prev,
                              asistenciaB2Estado: nextEst,
                              bloque2Asistio: nextEst === 'presente_manual',
                              llamadoVirtualActivo: false
                            };
                          })
                        }
                        className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                          b2Est === 'presente_virtual' || b2Est === 'presente_manual'
                            ? 'bg-emerald-100 text-emerald-900'
                            : b2Est === 'falla'
                            ? 'bg-red-100 text-red-800'
                            : b2Est === 'llamando'
                            ? 'bg-indigo-100 text-indigo-900 animate-pulse'
                            : 'bg-slate-100 text-slate-600'
                        } ${editableByTeacher ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        B2:{' '}
                        {b2Est === 'presente_virtual'
                          ? '✅ Virtual'
                          : b2Est === 'presente_manual'
                          ? '✔️ Asistió'
                          : b2Est === 'falla'
                          ? '❌ Falla'
                          : b2Est === 'llamando'
                          ? '📡 Llamando'
                          : '⚪ Sin reg.'}
                      </button>
                    </div>
                  </div>

                  {editableByTeacher && onUpdateClassField ? (
                    <input
                      type="text"
                      value={c.observacionDocente || ''}
                      onChange={(e) =>
                        onUpdateClassField(cs.id, (prev) => ({
                          ...prev,
                          observacionDocente: e.target.value
                        }))
                      }
                      placeholder="Observación docente (ej. MÁS 1 PUNTO EN SUSTENTACIÓN)..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                  ) : (
                    c.observacionDocente && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[11px] font-medium">
                        <strong>Observación Docente:</strong> {c.observacionDocente}
                      </div>
                    )
                  )}

                  {/* Justificación de Inasistencia / Solicitud de Excusa (Estudiante y Revisión Docente) */}
                  {(b1Est === 'falla' ||
                    b2Est === 'falla' ||
                    (c.excusaEstado && c.excusaEstado !== 'ninguna')) && (
                    <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-rose-950 flex items-center gap-1.5">
                          <span>🩺 Justificación de Inasistencia ({cs.code}):</span>
                        </span>
                        {c.excusaEstado === 'pendiente_revision' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px]">
                            ⏳ Excusa Pendiente de Revisión Docente
                          </span>
                        ) : c.excusaEstado === 'aprobada' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px]">
                            ✅ Excusa Aprobada / Justificada
                          </span>
                        ) : c.excusaEstado === 'rechazada' ? (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300 font-bold text-[10px]">
                            ❌ Excusa No Aprobada
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold text-[10px]">
                            Falla registrada sin excusa
                          </span>
                        )}
                      </div>

                      {c.excusaMotivo && (
                        <div className="p-2 rounded-lg bg-white border border-rose-200/80 text-[11px] space-y-1">
                          <div>
                            <strong className="text-slate-800">
                              Bloque justificado ({c.excusaBloque || 'AB'}):
                            </strong>{' '}
                            <span className="text-slate-700">{c.excusaMotivo}</span>
                          </div>
                          {c.excusaSoporteUrl && (
                            <a
                              href={c.excusaSoporteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block font-bold text-sky-700 underline"
                            >
                              🔗 Ver soporte médico / laboral adjunto
                            </a>
                          )}
                          {c.excusaRespuestaDocente && (
                            <div className="text-indigo-900 font-semibold pt-1 border-t border-slate-100">
                              Respuesta Docente: «{c.excusaRespuestaDocente}»
                            </div>
                          )}
                        </div>
                      )}

                      {/* Formulario para que el estudiante envíe solicitud de excusa */}
                      {isStudentPortalView && onStudentSubmitExcusa && (
                        <>
                          {openExcuseClassId === cs.id ? (
                            <div className="space-y-2 pt-1 bg-white p-2.5 rounded-xl border border-rose-200">
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] font-bold text-slate-700">
                                  Bloque a justificar:
                                </label>
                                <select
                                  value={excuseBloque}
                                  onChange={(e) =>
                                    setExcuseBloque(e.target.value as 'A' | 'B' | 'AB')
                                  }
                                  className="px-2 py-1 rounded border border-slate-300 text-xs font-bold"
                                >
                                  <option value="A">Bloque A (B1)</option>
                                  <option value="B">Bloque B (B2)</option>
                                  <option value="AB">Ambos Bloques (A y B)</option>
                                </select>
                              </div>
                              <textarea
                                rows={2}
                                value={excuseMotivo}
                                onChange={(e) => setExcuseMotivo(e.target.value)}
                                placeholder="Explique el motivo de la inasistencia (ej. incapacidad médica, calamidad doméstica, turno laboral)..."
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                              />
                              <input
                                type="text"
                                value={excuseSoporteUrl}
                                onChange={(e) => setExcuseSoporteUrl(e.target.value)}
                                placeholder="Enlace opcional al soporte o certificado (Google Drive, PDF, imagen)..."
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setOpenExcuseClassId(null)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold text-[11px] cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!excuseMotivo.trim()) return;
                                    onStudentSubmitExcusa(
                                      cs.id,
                                      excuseBloque,
                                      excuseMotivo.trim(),
                                      excuseSoporteUrl.trim()
                                    );
                                    setOpenExcuseClassId(null);
                                    setExcuseMotivo('');
                                    setExcuseSoporteUrl('');
                                    setSubmissionFeedback(
                                      `✓ Solicitud de justificación para ${cs.code} enviada al docente (Pendiente de revisión).`
                                    );
                                    setTimeout(() => setSubmissionFeedback(null), 4500);
                                  }}
                                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  Enviar Solicitud de Excusa
                                </button>
                              </div>
                            </div>
                          ) : (
                            c.excusaEstado !== 'aprobada' && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenExcuseClassId(cs.id);
                                    setExcuseBloque(
                                      b1Est === 'falla' && b2Est === 'falla'
                                        ? 'AB'
                                        : b2Est === 'falla'
                                        ? 'B'
                                        : 'A'
                                    );
                                    setExcuseMotivo(c.excusaMotivo || '');
                                    setExcuseSoporteUrl(c.excusaSoporteUrl || '');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  {c.excusaEstado === 'pendiente_revision'
                                    ? '✏️ Actualizar Solicitud de Excusa'
                                    : '📝 Solicitar Justificación / Excusa'}
                                </button>
                              </div>
                            )
                          )}
                        </>
                      )}

                      {/* Controles del Docente para Aprobar / Rechazar Excusa */}
                      {editableByTeacher &&
                        onUpdateClassField &&
                        c.excusaEstado &&
                        c.excusaEstado !== 'ninguna' && (
                          <div className="pt-1.5 border-t border-rose-200/80 space-y-2">
                            <input
                              type="text"
                              value={
                                teacherExcuseReplyDraft[cs.id] ??
                                c.excusaRespuestaDocente ??
                                ''
                              }
                              onChange={(e) =>
                                setTeacherExcuseReplyDraft((prev) => ({
                                  ...prev,
                                  [cs.id]: e.target.value
                                }))
                              }
                              placeholder="Comentario docente sobre la excusa (opcional)..."
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px]"
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateClassField(cs.id, (prev) => {
                                    const blq = prev.excusaBloque || 'AB';
                                    const fixB1 =
                                      blq === 'A' || blq === 'AB'
                                        ? 'presente_manual'
                                        : prev.asistenciaB1Estado;
                                    const fixB2 =
                                      blq === 'B' || blq === 'AB'
                                        ? 'presente_manual'
                                        : prev.asistenciaB2Estado;
                                    return {
                                      ...prev,
                                      excusaEstado: 'aprobada',
                                      excusaRespuestaDocente:
                                        teacherExcuseReplyDraft[cs.id] ??
                                        prev.excusaRespuestaDocente ??
                                        'Excusa validada y falla justificada por el docente.',
                                      asistenciaB1Estado: fixB1,
                                      asistenciaB2Estado: fixB2,
                                      bloque1Asistio:
                                        fixB1 === 'presente_manual' ||
                                        fixB1 === 'presente_virtual',
                                      bloque2Asistio:
                                        fixB2 === 'presente_manual' ||
                                        fixB2 === 'presente_virtual'
                                    };
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                              >
                                ✅ Aprobar Excusa y Justificar Falla
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateClassField(cs.id, (prev) => ({
                                    ...prev,
                                    excusaEstado: 'rechazada',
                                    excusaRespuestaDocente:
                                      teacherExcuseReplyDraft[cs.id] ??
                                      prev.excusaRespuestaDocente ??
                                      'Soporte insuficiente para justificar la inasistencia.'
                                  }))
                                }
                                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] cursor-pointer"
                              >
                                ❌ Rechazar Excusa
                              </button>
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE IMPRESIÓN / PDF: BOLETÍN PARCIAL DE NOTAS, ASISTENCIA E INSIGNIAS */}
      {showPrintableBoletinModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white border-2 border-slate-900 rounded-2xl max-w-4xl w-full p-5 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto text-slate-900">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-slate-100 border border-slate-300 p-3.5 rounded-xl">
              <div>
                <div className="text-xs font-mono font-bold uppercase text-indigo-800">
                  Comprobante Académico Oficial · Listo para PDF o Impresión
                </div>
                <div className="text-sm font-bold text-slate-900">
                  Boletín Parcial de Calificaciones, Asistencia e Insignias
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>🖨️ Imprimir / Guardar en PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintableBoletinModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Cerrar ✕
                </button>
              </div>
            </div>

            <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600">
                  Boletín Oficial de Rendimiento Académico, Asistencia e Insignias · {courseName}
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">
                  {summary.record.nombre}
                </h2>
                <div className="text-xs font-mono text-slate-600">
                  Documento ID: <strong>{summary.record.documento}</strong> · Fecha de emisión:{' '}
                  {new Date().toLocaleString('es-CO')}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border-2 border-slate-900 text-right shrink-0">
                <div className="text-[11px] font-mono uppercase font-bold text-slate-500">
                  Promedio Acumulado Oficial
                </div>
                <div className="text-3xl font-extrabold font-mono text-slate-900">
                  {summary.hasAnyAcademicGrade
                    ? `${summary.promedioAcumulado.toFixed(2)} / 5.0`
                    : 'Sin Nota'}
                </div>
                <div className="text-xs font-bold text-emerald-800">
                  Estado: {summary.estadoAcademico} · Asistencia: {summary.porcentajeAsistencia}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Clases Calificadas</div>
                <div className="text-base font-extrabold text-slate-900">
                  {summary.gradedClassesCount} / {activeSessions.length}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Asistencia Bloques</div>
                <div className="text-base font-extrabold text-sky-800">
                  {summary.porcentajeAsistencia}% ({summary.totalFallasBloques} fallas)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Insignias Desbloqueadas</div>
                <div className="text-base font-extrabold text-amber-800">
                  🏅 {summary.insigniasRetosCount} Insignia(s)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Examen Integral</div>
                <div className="text-base font-extrabold text-indigo-900">
                  {summary.notaExamenIntegralPlataforma !== null
                    ? `${summary.notaExamenIntegralPlataforma.toFixed(1)} / 5.0`
                    : 'Pendiente'}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-300 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-mono text-[11px] uppercase">
                    <th className="py-2.5 px-3">Sesión / Módulo</th>
                    <th className="py-2.5 px-3 text-center">Comport.</th>
                    <th className="py-2.5 px-3 text-center">Reto/Sustent.</th>
                    <th className="py-2.5 px-3 text-center">Examen</th>
                    <th className="py-2.5 px-3 text-center">Trabajo</th>
                    <th className="py-2.5 px-3 text-center">Asistencia B1/B2</th>
                    <th className="py-2.5 px-3 text-right">Definitiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {activeSessions.map((cs) => {
                    const c = summary.record.clases[cs.id];
                    const hasF = summary.classHasFinalGrade[cs.id];
                    const fin = summary.classFinals[cs.id];
                    return (
                      <tr key={cs.id}>
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                          {cs.code} · {cs.shortTitle}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {c?.comportamientoCalificado ? c.comportamiento.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {c?.participacionCalificado ? c.participacion.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {c?.examenCalificado ? c.examen.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {c?.trabajoCalificado ? c.trabajoPractico.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[11px]">
                          B1: {c?.asistenciaB1Estado === 'falla' ? 'Falla' : 'OK'} · B2:{' '}
                          {c?.asistenciaB2Estado === 'falla' ? 'Falla' : 'OK'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          {hasF ? `${fin.toFixed(1)} / 5.0` : 'Sin calificar'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
              <span>
                Firma Digital de Verificación: BOL-{summary.record.documento}-
                {Math.round(summary.promedioAcumulado * 100)}-{summary.porcentajeAsistencia}
              </span>
              <span>Plataforma Evaluativa Oficial · Escala 0.0 a 5.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SECCIÓN / ZONA: LLAMADO DE ASISTENCIA (EN VIVO / MANUAL)
 * Ubicada en la Pantalla Inicial (Hub) del Panel Docente, sincronizada en tiempo real
 * con el Control de Estudiantes y los módulos/clases habilitados del curso activo.
 */
export function LiveAttendanceHubSection({
  dataset,
  students,
  courseModules,
  courseName,
  onSaveDataset
}: {
  dataset: AcademicDataset;
  students: StudentRecord[];
  courseModules?: AcademicClassAttendanceManagerProps['courseModules'];
  courseName?: string;
  onSaveDataset: (nextDataset: AcademicDataset) => void;
}) {
  const syncedDataset = useMemo(
    () => normalizeAndSyncAcademicDataset(dataset, students, courseModules, courseName),
    [dataset, students, courseModules, courseName]
  );

  const effectiveClassSessions = useMemo(
    () =>
      Array.isArray(syncedDataset?.classSessions) && syncedDataset.classSessions.length > 0
        ? syncedDataset.classSessions
        : OFFICIAL_CLASS_SESSIONS,
    [syncedDataset?.classSessions]
  );

  const activeClassIds = useMemo<ClassSessionId[]>(
    () => effectiveClassSessions.map((cs) => cs.id as ClassSessionId),
    [effectiveClassSessions]
  );

  const [selectedClassId, setSelectedClassId] = useState<ClassSessionId>(
    () => (syncedDataset.aperturaClaseActiva?.claseId as ClassSessionId) || activeClassIds[0] || 1
  );
  const [selectedBloque, setSelectedBloque] = useState<'b1' | 'b2' | 'ambos'>(
    () => syncedDataset.aperturaClaseActiva?.bloque || 'ambos'
  );
  const [activeDurationMin, setActiveDurationMin] = useState<number>(
    () => Number(syncedDataset.aperturaClaseActiva?.duracionMinutos) || 10
  );
  const [selectedMethod, setSelectedMethod] = useState<
    | 'alerta_boton_panel'
    | 'codigo_unico_correo_whatsapp'
    | 'palabra_clave_secreta'
    | 'qr_enlace_dinamico'
    | 'reto_relampago_30s'
  >(() => syncedDataset.aperturaClaseActiva?.metodoActivo || 'alerta_boton_panel');
  const [secretClassKeyword, setSecretClassKeyword] = useState<string>(
    () => syncedDataset.aperturaClaseActiva?.palabraClaveSecreta || 'PRESENTE-2026'
  );

  const [targetScope, setTargetScope] = useState<'all_course' | 'selected' | 'individual'>('all_course');
  const [individualStudentId, setIndividualStudentId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [responseFilterTab, setResponseFilterTab] = useState<
    'ALL' | 'RESPONDED' | 'CALLING_OR_UNANSWERED'
  >('ALL');
  const [prioritizeResponded, setPrioritizeResponded] = useState<boolean>(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [isExpandedList, setIsExpandedList] = useState(true);
  const [showRegistryPanel, setShowRegistryPanel] = useState(true);
  const [dispatchDrawerOpen, setDispatchDrawerOpen] = useState(false);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!activeClassIds.includes(selectedClassId)) {
      setSelectedClassId(activeClassIds[0] || 1);
    }
  }, [activeClassIds, selectedClassId]);

  const studentContactMap = useMemo(() => {
    const map = new Map<string, { email: string; whatsapp: string; accessCode: string }>();
    students.forEach((s) => {
      map.set(s.id, {
        email: (s.correoElectronico || '').trim(),
        whatsapp: (s.whatsapp || '').trim(),
        accessCode: (s.codigoAcceso || '').trim()
      });
    });
    return map;
  }, [students]);

  const showFeedback = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 5500);
  };

  // Generate a unique anti-collision 6-char attendance code per student for a session
  const generateUniqueAttendanceCode = (studentId: string, claseId: number): string => {
    const cleanId = String(studentId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
    const randomPart = Math.floor(100 + Math.random() * 900);
    return `C${claseId}-${cleanId || 'EST'}${randomPart}`;
  };

  // Build anti-ban polymorphic message for Free-Tier WhatsApp & Email (zero spam footprint)
  const buildFreeTierMessage = (
    studentName: string,
    studentId: string,
    code: string,
    claseId: ClassSessionId,
    bloque: 'b1' | 'b2' | 'ambos',
    durMin: number
  ) => {
    const cs = effectiveClassSessions.find((c) => c.id === claseId);
    const bloqueText =
      bloque === 'ambos'
        ? 'Bloques A y B (Al tiempo)'
        : bloque === 'b2'
        ? 'Bloque B (B2)'
        : 'Bloque A (B1)';
    const timeLabel = new Date().toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const greetings = ['Hola', 'Estimado(a)', 'Cordial saludo', 'Buen día'];
    const greet = greetings[Math.abs(studentId.charCodeAt(0) || 0) % greetings.length];
    const subject = `[Asistencia Activa ${cs?.code || `C${claseId}`} - ${bloqueText}] Código personal: ${code}`;
    const body = `${greet} ${studentName} (ID: ${studentId}).\n\n📢 Se ha activado el llamado de asistencia del curso «${
      courseName || syncedDataset.courseName || 'Curso Oficial'
    }».\n• Clase: ${cs?.code || `CLASE C${claseId}`} (${cs?.shortTitle || 'Sesión Activa'})\n• Bloque convocado: ${bloqueText}\n• Tiempo activo asignado: ${durMin} minutos (Emitido: ${timeLabel})\n• 🔑 Su Código Único de Asistencia: ${code}\n\n👉 Ingrese a su Panel del Estudiante y pulse el botón «¡PRESENTE!» o valide su código personal ${code} antes de que finalice el tiempo activo.`;
    return { subject, body };
  };

  const formatPhoneForWaMe = (rawPhone: string): string => {
    const digits = String(rawPhone || '').replace(/\D+/g, '');
    if (!digits) return '';
    if (digits.length === 10 && digits.startsWith('3')) {
      return `57${digits}`;
    }
    return digits;
  };

  // Enable / Disable state for the entire Apertura de Clases y Llamado de Asistencia feature
  const isFunctionEnabled = syncedDataset.funcionLlamadoAsistenciaHabilitada !== false;

  const handleToggleFunctionEnabled = (nextEnabled: boolean) => {
    const nowIso = new Date().toISOString();
    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      funcionLlamadoAsistenciaHabilitada: nextEnabled,
      aperturaClaseActiva:
        !nextEnabled && syncedDataset.aperturaClaseActiva
          ? { ...syncedDataset.aperturaClaseActiva, abierta: false }
          : syncedDataset.aperturaClaseActiva
    });
    showFeedback(
      nextEnabled
        ? '🟢 Función «Apertura de Clases y Llamado de Asistencia» HABILITADA.'
        : '⚪ Función «Apertura de Clases y Llamado de Asistencia» DESHABILITADA.'
    );
  };

  // State for the Mini Screen & Generated Attendance Registry when a call finishes
  const [showLiveMiniScreen, setShowLiveMiniScreen] = useState<boolean>(true);
  const [generatedRegistrySnapshot, setGeneratedRegistrySnapshot] = useState<{
    generatedAtIso: string;
    closedReason: 'tiempo_programado' | 'manual_docente';
    claseId: ClassSessionId;
    claseTitle: string;
    bloqueLabel: string;
    duracionMinutos: number;
    metodoLabel: string;
    totalConvocados: number;
    confirmados: Array<{
      studentId: string;
      nombre: string;
      documento: string;
      respondedAtIso: string;
      codigoUnico: string;
      bloqueLabel: string;
    }>;
    inasistentes: Array<{
      studentId: string;
      nombre: string;
      documento: string;
      codigoUnico: string;
      estadoFinal: string;
    }>;
  } | null>(null);

  // Check if class opening is currently active and not expired
  const aperturaActiva = syncedDataset.aperturaClaseActiva;
  const aperturaExpiraMs = aperturaActiva?.expiraAtIso
    ? new Date(aperturaActiva.expiraAtIso).getTime()
    : 0;
  const aperturaRemainingSec =
    aperturaActiva?.abierta && aperturaExpiraMs > nowTickMs
      ? Math.max(0, Math.floor((aperturaExpiraMs - nowTickMs) / 1000))
      : 0;
  const isClassCurrentlyOpen = Boolean(aperturaActiva?.abierta && aperturaRemainingSec > 0);
  const isAperturaExpiredWaitingClose = Boolean(
    aperturaActiva?.abierta && aperturaExpiraMs > 0 && aperturaExpiraMs <= nowTickMs
  );

  // Open Class & Activate Roll Call Configuration
  const handleOpenClassSession = (autoEmitToAll: boolean = false) => {
    if (!isFunctionEnabled) {
      showFeedback('⚠️ Habilite primero la función de Apertura de Clases y Llamado de Asistencia.');
      return;
    }
    const safeMin = Math.max(1, Math.min(180, Number(activeDurationMin) || 10));
    const now = new Date();
    const nowIso = now.toISOString();
    const expIso = new Date(now.getTime() + safeMin * 60 * 1000).toISOString();

    const nextApertura: ActiveClassOpeningConfig = {
      abierta: true,
      claseId: selectedClassId,
      bloque: selectedBloque === 'ambos' ? 'AB' : selectedBloque === 'b2' ? 'B' : 'A',
      duracionMinutos: safeMin,
      iniciadaAtIso: nowIso,
      expiraAtIso: expIso,
      metodoPrincipal:
        selectedMethod === 'codigo_unico_correo_whatsapp'
          ? 'codigo_unico_wa_email'
          : selectedMethod === 'qr_enlace_dinamico'
          ? 'qr_pin_aula'
          : selectedMethod === 'reto_relampago_30s'
          ? 'pregunta_relampago'
          : 'alerta_panel',
      palabraClaveRelampago:
        selectedMethod === 'palabra_clave_secreta'
          ? (secretClassKeyword || 'PRESENTE-2026').trim().toUpperCase()
          : undefined
    };

    let nextRecords = syncedDataset.records;
    if (autoEmitToAll) {
      nextRecords = syncedDataset.records.map((rec) => {
        const prevClass = rec.clases[selectedClassId] || {
          claseId: selectedClassId,
          bloque1Asistio: true,
          bloque2Asistio: true,
          asistenciaB1Estado: 'sin_registrar',
          asistenciaB2Estado: 'sin_registrar',
          comportamiento: 5.0,
          participacion: 5.0,
          examen: 5.0,
          trabajoPractico: 5.0,
          notaFinal: 5.0,
          autoCalcularNotaFinal: true,
          observacionDocente: ''
        };
        const code =
          prevClass.llamadoVirtualCodigoUnico ||
          generateUniqueAttendanceCode(rec.studentId, selectedClassId);
        return {
          ...rec,
          ultimaActualizacionIso: nowIso,
          clases: {
            ...rec.clases,
            [selectedClassId]: {
              ...prevClass,
              llamadoVirtualActivo: true,
              llamadoVirtualBloque:
                selectedBloque === 'ambos' ? 'ambos' : selectedBloque === 'b2' ? 2 : 1,
              llamadoVirtualEmitidoAtIso: nowIso,
              llamadoVirtualExpiraAtIso: expIso,
              llamadoVirtualDuracionMin: safeMin,
              llamadoVirtualMetodo: selectedMethod,
              llamadoVirtualCodigoUnico: code,
              asistenciaB1Estado:
                selectedBloque === 'b1' || selectedBloque === 'ambos'
                  ? 'llamando'
                  : prevClass.asistenciaB1Estado || 'sin_registrar',
              asistenciaB2Estado:
                selectedBloque === 'b2' || selectedBloque === 'ambos'
                  ? 'llamando'
                  : prevClass.asistenciaB2Estado || 'sin_registrar'
            }
          }
        };
      });
    }

    setShowLiveMiniScreen(true);
    setGeneratedRegistrySnapshot(null);

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      funcionLlamadoAsistenciaHabilitada: true,
      aperturaClaseActiva: nextApertura,
      records: nextRecords
    });

    const bloqueHuman =
      selectedBloque === 'ambos'
        ? 'Bloques A y B al tiempo (B1 + B2)'
        : selectedBloque === 'b2'
        ? 'Bloque B (B2)'
        : 'Bloque A (B1)';

    showFeedback(
      autoEmitToAll
        ? `🚀 ¡LLAMADO DE ASISTENCIA INICIADO EN CLASE C${selectedClassId}! (${bloqueHuman} · Tiempo activo: ${safeMin} min). Mini pantalla en vivo activada.`
        : `🟢 ¡Apertura de Clase C${selectedClassId} ACTIVADA para ${bloqueHuman} durante ${safeMin} minutos!`
    );
  };

  const handleCloseClassOpening = () => {
    const nowIso = new Date().toISOString();
    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaClaseActiva: syncedDataset.aperturaClaseActiva
        ? { ...syncedDataset.aperturaClaseActiva, abierta: false }
        : undefined
    });
    showFeedback(`🔒 Apertura de Clase C${selectedClassId} cerrada por el docente.`);
  };

  // Emit timed roll call alert to specific student IDs (1 student, selected students, or full roster)
  const handleEmitRollCallToStudentIds = (
    targetIds: string[],
    overrideBloque?: 'b1' | 'b2' | 'ambos',
    openDispatchModalAfter?: boolean
  ) => {
    if (targetIds.length === 0) {
      showFeedback('⚠️ Seleccione al menos un estudiante para enviar la alerta de asistencia.');
      return;
    }
    const effectiveBloque = overrideBloque || selectedBloque;
    const safeMin = Math.max(1, Math.min(180, Number(activeDurationMin) || 10));
    const now = new Date();
    const nowIso = now.toISOString();
    const expIso = new Date(now.getTime() + safeMin * 60 * 1000).toISOString();
    const targetSet = new Set(targetIds);

    const nextApertura = {
      abierta: true,
      claseId: selectedClassId,
      bloque: effectiveBloque,
      duracionMinutos: safeMin,
      iniciadaAtIso: nowIso,
      expiraAtIso: expIso,
      metodoActivo: selectedMethod,
      palabraClaveSecreta:
        selectedMethod === 'palabra_clave_secreta'
          ? (secretClassKeyword || 'PRESENTE-2026').trim().toUpperCase()
          : undefined
    };

    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetSet.has(rec.studentId)) return rec;
      const prevClass = rec.clases[selectedClassId] || {
        claseId: selectedClassId,
        bloque1Asistio: true,
        bloque2Asistio: true,
        asistenciaB1Estado: 'sin_registrar',
        asistenciaB2Estado: 'sin_registrar',
        comportamiento: 5.0,
        participacion: 5.0,
        examen: 5.0,
        trabajoPractico: 5.0,
        notaFinal: 5.0,
        autoCalcularNotaFinal: true,
        observacionDocente: ''
      };
      const uniquePin = generateUniqueAttendanceCode(rec.studentId, selectedClassId);
      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [selectedClassId]: {
            ...prevClass,
            llamadoVirtualActivo: true,
            llamadoVirtualBloque:
              effectiveBloque === 'ambos' ? 'ambos' : effectiveBloque === 'b2' ? 2 : 1,
            llamadoVirtualEmitidoAtIso: nowIso,
            llamadoVirtualExpiraAtIso: expIso,
            llamadoVirtualDuracionMin: safeMin,
            llamadoVirtualMetodo: selectedMethod,
            llamadoVirtualCodigoUnico: uniquePin,
            asistenciaB1Estado:
              effectiveBloque === 'b1' || effectiveBloque === 'ambos'
                ? 'llamando'
                : prevClass.asistenciaB1Estado || 'sin_registrar',
            asistenciaB2Estado:
              effectiveBloque === 'b2' || effectiveBloque === 'ambos'
                ? 'llamando'
                : prevClass.asistenciaB2Estado || 'sin_registrar'
          }
        }
      };
    });

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaClaseActiva: nextApertura,
      records: nextRecords
    });

    if (openDispatchModalAfter) {
      setDispatchDrawerOpen(true);
    }

    const bloqueLabel =
      effectiveBloque === 'ambos'
        ? 'Bloques A y B (Al tiempo)'
        : effectiveBloque === 'b2'
        ? 'Bloque B (B2)'
        : 'Bloque A (B1)';

    if (targetIds.length === 1) {
      const stRec = syncedDataset.records.find((r) => r.studentId === targetIds[0]);
      showFeedback(
        `📢 Alerta enviada en vivo al panel de «${stRec?.nombre || targetIds[0]}» en CLASE C${selectedClassId} (${bloqueLabel}) · Activa por ${safeMin} min.`
      );
    } else {
      showFeedback(
        `📢 Alerta de Asistencia enviada en vivo a ${targetIds.length} estudiante(s) en CLASE C${selectedClassId} (${bloqueLabel}) · Tiempo activo: ${safeMin} min.`
      );
    }
  };

  const resolveTargetIds = (): string[] => {
    if (targetScope === 'individual') {
      const targetId = individualStudentId || syncedDataset.records[0]?.studentId;
      return targetId ? [targetId] : [];
    }
    if (targetScope === 'selected') {
      return selectedStudentIds.length > 0
        ? selectedStudentIds
        : syncedDataset.records.map((r) => r.studentId);
    }
    return syncedDataset.records.map((r) => r.studentId);
  };

  const handleEmitVirtualRollCall = (bloque: 'b1' | 'b2' | 'ambos') => {
    setSelectedBloque(bloque);
    const targetIds =
      targetScope === 'selected' ? selectedStudentIds : resolveTargetIds();
    handleEmitRollCallToStudentIds(
      targetIds,
      bloque,
      selectedMethod === 'codigo_unico_correo_whatsapp'
    );
  };

  const handleCloseActiveRollCall = (
    markUnansweredAsFalla: boolean,
    closedReason: 'tiempo_programado' | 'manual_docente' = 'manual_docente'
  ) => {
    const nowIso = new Date().toISOString();
    const targetClaseId = aperturaActiva?.claseId || selectedClassId;
    const csDef =
      effectiveClassSessions.find((c) => c.id === targetClaseId) ||
      effectiveClassSessions[0];
    let updatedCount = 0;

    const confirmadosSnap: Array<{
      studentId: string;
      nombre: string;
      documento: string;
      respondedAtIso: string;
      codigoUnico: string;
      bloqueLabel: string;
    }> = [];
    const inasistentesSnap: Array<{
      studentId: string;
      nombre: string;
      documento: string;
      codigoUnico: string;
      estadoFinal: string;
    }> = [];

    const nextRecords = syncedDataset.records.map((rec) => {
      const prevClass = rec.clases[targetClaseId];
      if (!prevClass) return rec;
      const isCalling =
        prevClass.llamadoVirtualActivo ||
        prevClass.asistenciaB1Estado === 'llamando' ||
        prevClass.asistenciaB2Estado === 'llamando';

      const bLabel =
        prevClass.llamadoVirtualBloque === 'ambos'
          ? 'Bloques A y B'
          : prevClass.llamadoVirtualBloque === 2
          ? 'Bloque B (B2)'
          : 'Bloque A (B1)';

      const alreadyResponded =
        prevClass.asistenciaB1Estado === 'presente_virtual' ||
        prevClass.asistenciaB2Estado === 'presente_virtual' ||
        Boolean(prevClass.llamadoVirtualRespondidoAtIso);

      if (alreadyResponded) {
        confirmadosSnap.push({
          studentId: rec.studentId,
          nombre: rec.nombre,
          documento: rec.documento,
          respondedAtIso:
            prevClass.llamadoVirtualRespondidoAtIso ||
            prevClass.asistenciaB1ConfirmadaAtIso ||
            prevClass.asistenciaB2ConfirmadaAtIso ||
            nowIso,
          codigoUnico: prevClass.llamadoVirtualCodigoUnico || '—',
          bloqueLabel: bLabel
        });
      }

      if (!isCalling) {
        if (!alreadyResponded) {
          const b1Falla = prevClass.asistenciaB1Estado === 'falla' || prevClass.bloque1Asistio === false;
          const b2Falla = prevClass.asistenciaB2Estado === 'falla' || prevClass.bloque2Asistio === false;
          if (b1Falla || b2Falla) {
            inasistentesSnap.push({
              studentId: rec.studentId,
              nombre: rec.nombre,
              documento: rec.documento,
              codigoUnico: prevClass.llamadoVirtualCodigoUnico || '—',
              estadoFinal: 'Inasistencia registrada (1)'
            });
          }
        }
        return rec;
      }

      updatedCount++;

      const nextB1 =
        prevClass.asistenciaB1Estado === 'llamando'
          ? markUnansweredAsFalla
            ? 'falla'
            : 'sin_registrar'
          : prevClass.asistenciaB1Estado;
      const nextB2 =
        prevClass.asistenciaB2Estado === 'llamando'
          ? markUnansweredAsFalla
            ? 'falla'
            : 'sin_registrar'
          : prevClass.asistenciaB2Estado;

      if (!alreadyResponded) {
        inasistentesSnap.push({
          studentId: rec.studentId,
          nombre: rec.nombre,
          documento: rec.documento,
          codigoUnico: prevClass.llamadoVirtualCodigoUnico || '—',
          estadoFinal: markUnansweredAsFalla
            ? 'Inasistencia (1) por no responder llamado'
            : 'Sin respuesta al cierre'
        });
      }

      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [targetClaseId]: {
            ...prevClass,
            llamadoVirtualActivo: false,
            asistenciaB1Estado: nextB1,
            asistenciaB2Estado: nextB2,
            bloque1Asistio: nextB1 === 'presente_virtual' || nextB1 === 'presente_manual',
            bloque2Asistio: nextB2 === 'presente_virtual' || nextB2 === 'presente_manual'
          }
        }
      };
    });

    const bloqueGlobalLabel =
      aperturaActiva?.bloque === 'AB' || selectedBloque === 'ambos'
        ? 'Ambos Bloques A y B'
        : aperturaActiva?.bloque === 'B' || selectedBloque === 'b2'
        ? 'Bloque B (B2)'
        : 'Bloque A (B1)';

    const metodoHuman =
      selectedMethod === 'codigo_unico_correo_whatsapp'
        ? 'Código Único WhatsApp/Correo Gratis'
        : selectedMethod === 'palabra_clave_secreta'
        ? 'Palabra Clave Secreta en Vivo'
        : selectedMethod === 'qr_enlace_dinamico'
        ? 'Token / QR Dinámico en Pantalla'
        : selectedMethod === 'reto_relampago_30s'
        ? 'Alerta Relámpago de Permanencia'
        : 'Alerta en Panel con Botón ¡Presente!';

    setGeneratedRegistrySnapshot({
      generatedAtIso: nowIso,
      closedReason,
      claseId: targetClaseId,
      claseTitle: csDef?.shortTitle || `Clase C${targetClaseId}`,
      bloqueLabel: bloqueGlobalLabel,
      duracionMinutos: aperturaActiva?.duracionMinutos || activeDurationMin,
      metodoLabel: metodoHuman,
      totalConvocados: syncedDataset.records.length,
      confirmados: confirmadosSnap,
      inasistentes: inasistentesSnap
    });
    setShowLiveMiniScreen(true);

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaClaseActiva: syncedDataset.aperturaClaseActiva
        ? { ...syncedDataset.aperturaClaseActiva, abierta: false }
        : undefined,
      records: nextRecords
    });
    showFeedback(
      closedReason === 'tiempo_programado'
        ? `⏰ Tiempo programado finalizado en CLASE C${targetClaseId}: se cerró el llamado y se generó el Registro Oficial de Asistencia (${confirmadosSnap.length} confirmados / ${inasistentesSnap.length} inasistencias).`
        : markUnansweredAsFalla
        ? `⏹️ Llamado finalizado y Registro de Asistencia generado en CLASE C${targetClaseId}: ${confirmadosSnap.length} confirmaron asistencia y ${updatedCount} quedaron con inasistencia (1).`
        : `⏹️ Llamado en vivo finalizado y Registro de Asistencia generado en CLASE C${targetClaseId}.`
    );
  };

  // Automatically finalize the roll call and generate the attendance registry when the programmed time finishes
  useEffect(() => {
    if (isAperturaExpiredWaitingClose) {
      handleCloseActiveRollCall(true, 'tiempo_programado');
    }
  }, [isAperturaExpiredWaitingClose]);

  // Quick confirm student attendance directly from the live mini screen
  const handleConfirmStudentVirtualNow = (studentId: string) => {
    const nowIso = new Date().toISOString();
    const nextRecords = syncedDataset.records.map((rec) => {
      if (rec.studentId !== studentId) return rec;
      const prevClass = rec.clases[selectedClassId];
      if (!prevClass) return rec;
      const callBlock = prevClass.llamadoVirtualBloque || (selectedBloque === 'ambos' ? 'ambos' : selectedBloque === 'b2' ? 2 : 1);
      const confirmB1 = callBlock === 1 || callBlock === 'ambos';
      const confirmB2 = callBlock === 2 || callBlock === 'ambos';
      return {
        ...rec,
        ultimaActualizacionIso: nowIso,
        clases: {
          ...rec.clases,
          [selectedClassId]: {
            ...prevClass,
            llamadoVirtualActivo: false,
            llamadoVirtualRespondidoAtIso: nowIso,
            llamadoVirtualMetodoRespuesta: 'confirmado_panel',
            asistenciaB1Estado: confirmB1 ? 'presente_virtual' : prevClass.asistenciaB1Estado,
            asistenciaB2Estado: confirmB2 ? 'presente_virtual' : prevClass.asistenciaB2Estado,
            asistenciaB1ConfirmadaAtIso: confirmB1 ? nowIso : prevClass.asistenciaB1ConfirmadaAtIso,
            asistenciaB2ConfirmadaAtIso: confirmB2 ? nowIso : prevClass.asistenciaB2ConfirmadaAtIso,
            bloque1Asistio: confirmB1 ? true : prevClass.bloque1Asistio,
            bloque2Asistio: confirmB2 ? true : prevClass.bloque2Asistio
          }
        }
      };
    });
    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
    const st = syncedDataset.records.find((r) => r.studentId === studentId);
    showFeedback(`✅ Asistencia confirmada para «${st?.nombre || studentId}» en CLASE C${selectedClassId}.`);
  };

  const handleApplyManualAttendance = (
    mode: '0_fallas' | '1_falla_b1' | '1_falla_b2' | '2_fallas' | 'sin_registrar'
  ) => {
    const targetIds =
      targetScope === 'selected' ? selectedStudentIds : resolveTargetIds();
    if (targetIds.length === 0) {
      showFeedback('⚠️ Seleccione al menos un estudiante para registrar asistencia manual.');
      return;
    }
    const targetSet = new Set(targetIds);
    const nowIso = new Date().toISOString();
    const nextRecords = syncedDataset.records.map((rec) => {
      if (!targetSet.has(rec.studentId)) return rec;
      const prevClass = rec.clases[selectedClassId];
      let b1Est = prevClass?.asistenciaB1Estado || 'sin_registrar';
      let b2Est = prevClass?.asistenciaB2Estado || 'sin_registrar';
      let b1Bool = prevClass?.bloque1Asistio ?? true;
      let b2Bool = prevClass?.bloque2Asistio ?? true;

      if (mode === '0_fallas') {
        b1Est = 'presente_manual';
        b2Est = 'presente_manual';
        b1Bool = true;
        b2Bool = true;
      } else if (mode === '1_falla_b1') {
        b1Est = 'falla';
        b2Est = 'presente_manual';
        b1Bool = false;
        b2Bool = true;
      } else if (mode === '1_falla_b2') {
        b1Est = 'presente_manual';
        b2Est = 'falla';
        b1Bool = true;
        b2Bool = false;
      } else if (mode === '2_fallas') {
        b1Est = 'falla';
        b2Est = 'falla';
        b1Bool = false;
        b2Bool = false;
      } else {
        b1Est = 'sin_registrar';
        b2Est = 'sin_registrar';
        b1Bool = true;
        b2Bool = true;
      }

      return {
        ...rec,
        clases: {
          ...rec.clases,
          [selectedClassId]: {
            ...prevClass,
            asistenciaB1Estado: b1Est,
            asistenciaB2Estado: b2Est,
            bloque1Asistio: b1Bool,
            bloque2Asistio: b2Bool,
            llamadoVirtualActivo: false
          }
        }
      };
    });

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
    showFeedback(
      `✓ Asistencia manual actualizada en CLASE C${selectedClassId} para ${targetIds.length} estudiante(s).`
    );
  };

  const handleToggleStudentBlock = (studentId: string, block: 'b1' | 'b2') => {
    const nowIso = new Date().toISOString();
    const nextRecords = syncedDataset.records.map((rec) => {
      if (rec.studentId !== studentId) return rec;
      const prevClass = rec.clases[selectedClassId];
      if (block === 'b1') {
        const isAbsent = prevClass.asistenciaB1Estado === 'falla';
        return {
          ...rec,
          ultimaActualizacionIso: nowIso,
          clases: {
            ...rec.clases,
            [selectedClassId]: {
              ...prevClass,
              asistenciaB1Estado: isAbsent ? 'presente_manual' : 'falla',
              bloque1Asistio: isAbsent,
              llamadoVirtualActivo: false
            }
          }
        };
      } else {
        const isAbsent = prevClass.asistenciaB2Estado === 'falla';
        return {
          ...rec,
          ultimaActualizacionIso: nowIso,
          clases: {
            ...rec.clases,
            [selectedClassId]: {
              ...prevClass,
              asistenciaB2Estado: isAbsent ? 'presente_manual' : 'falla',
              bloque2Asistio: isAbsent,
              llamadoVirtualActivo: false
            }
          }
        };
      }
    });

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      records: nextRecords
    });
  };

  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Helper to classify each student's response status in the active class
  const getStudentResponseMeta = (rec: StudentAcademicRecord) => {
    const c = rec.clases[selectedClassId];
    const respondedVirtual =
      c?.asistenciaB1Estado === 'presente_virtual' ||
      c?.asistenciaB2Estado === 'presente_virtual' ||
      Boolean(c?.llamadoVirtualRespondidoAtIso);
    const expMs = c?.llamadoVirtualExpiraAtIso
      ? new Date(c.llamadoVirtualExpiraAtIso).getTime()
      : 0;
    const isExpired = expMs > 0 && expMs <= nowTickMs;
    const rawCalling =
      c?.llamadoVirtualActivo ||
      c?.asistenciaB1Estado === 'llamando' ||
      c?.asistenciaB2Estado === 'llamando';
    const isActivelyCalling = Boolean(rawCalling && !respondedVirtual && !isExpired);
    const wasCalledAndExpired = Boolean(rawCalling && !respondedVirtual && isExpired);
    const respondedAtIso =
      c?.llamadoVirtualRespondidoAtIso ||
      c?.asistenciaB1ConfirmadaAtIso ||
      c?.asistenciaB2ConfirmadaAtIso ||
      '';
    const respondedAtMs = respondedAtIso ? new Date(respondedAtIso).getTime() : 0;
    const remainingSec =
      isActivelyCalling && expMs > nowTickMs
        ? Math.max(0, Math.floor((expMs - nowTickMs) / 1000))
        : null;

    return {
      c,
      respondedVirtual,
      isActivelyCalling,
      wasCalledAndExpired,
      respondedAtIso,
      respondedAtMs,
      remainingSec
    };
  };

  // Prioritized & Filtered Records: Responded students are prioritized at the top!
  const filteredRecords = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const base = syncedDataset.records.filter((r) => {
      if (q) {
        const contact = studentContactMap.get(r.studentId);
        const matchText =
          r.nombre.toLowerCase().includes(q) ||
          r.documento.toLowerCase().includes(q) ||
          (contact?.email || '').toLowerCase().includes(q) ||
          (contact?.whatsapp || '').toLowerCase().includes(q);
        if (!matchText) return false;
      }
      const meta = getStudentResponseMeta(r);
      if (responseFilterTab === 'RESPONDED') return meta.respondedVirtual;
      if (responseFilterTab === 'CALLING_OR_UNANSWERED') return !meta.respondedVirtual;
      return true;
    });

    if (!prioritizeResponded) return base;

    return [...base].sort((a, b) => {
      const mA = getStudentResponseMeta(a);
      const mB = getStudentResponseMeta(b);
      // 1st priority: Students who RESPONDED to the call (most recent or earliest response at top)
      if (mA.respondedVirtual && !mB.respondedVirtual) return -1;
      if (!mA.respondedVirtual && mB.respondedVirtual) return 1;
      if (mA.respondedVirtual && mB.respondedVirtual) {
        return (mB.respondedAtMs || 0) - (mA.respondedAtMs || 0);
      }
      // 2nd priority: Students currently being called
      if (mA.isActivelyCalling && !mB.isActivelyCalling) return -1;
      if (!mA.isActivelyCalling && mB.isActivelyCalling) return 1;
      // 3rd priority: Students whose call expired without response
      if (mA.wasCalledAndExpired && !mB.wasCalledAndExpired) return -1;
      if (!mA.wasCalledAndExpired && mB.wasCalledAndExpired) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [
    syncedDataset.records,
    searchFilter,
    responseFilterTab,
    prioritizeResponded,
    selectedClassId,
    nowTickMs,
    studentContactMap
  ]);

  const activeClassDef =
    effectiveClassSessions.find((c) => c.id === selectedClassId) ||
    effectiveClassSessions[0];

  const statsForSelectedClass = useMemo(() => {
    let callingCount = 0;
    let presentCount = 0;
    let virtualConfirmedCount = 0;
    let absentCount = 0;
    const respondedList: Array<{
      rec: StudentAcademicRecord;
      respondedAtIso: string;
      bloqueLabel: string;
      codigoUnico: string;
    }> = [];
    const unansweredList: Array<{
      rec: StudentAcademicRecord;
      statusLabel: string;
      isCalling: boolean;
      codigoUnico: string;
    }> = [];

    syncedDataset.records.forEach((r) => {
      const meta = getStudentResponseMeta(r);
      const c = meta.c;
      if (!c) return;
      if (meta.isActivelyCalling) {
        callingCount++;
      }
      const bLabel =
        c.llamadoVirtualBloque === 'ambos'
          ? 'Bloques A y B'
          : c.llamadoVirtualBloque === 2
          ? 'Bloque B (B2)'
          : 'Bloque A (B1)';

      if (meta.respondedVirtual) {
        virtualConfirmedCount++;
        respondedList.push({
          rec: r,
          respondedAtIso: meta.respondedAtIso,
          bloqueLabel: bLabel,
          codigoUnico: c.llamadoVirtualCodigoUnico || '—'
        });
      } else {
        unansweredList.push({
          rec: r,
          statusLabel: meta.isActivelyCalling
            ? '📡 Llamado activo (Esperando clic)'
            : meta.wasCalledAndExpired
            ? '⏰ Tiempo agotado sin respuesta'
            : c.asistenciaB1Estado === 'falla' || c.asistenciaB2Estado === 'falla'
            ? '❌ Inasistencia registrada (1)'
            : '⏳ Sin responder llamado',
          isCalling: meta.isActivelyCalling,
          codigoUnico: c.llamadoVirtualCodigoUnico || '—'
        });
      }
      const b1Absent = c.asistenciaB1Estado === 'falla' || c.bloque1Asistio === false;
      const b2Absent = c.asistenciaB2Estado === 'falla' || c.bloque2Asistio === false;
      if (b1Absent || b2Absent) absentCount++;
      else presentCount++;
    });

    respondedList.sort((a, b) => {
      const tA = a.respondedAtIso ? new Date(a.respondedAtIso).getTime() : 0;
      const tB = b.respondedAtIso ? new Date(b.respondedAtIso).getTime() : 0;
      return tB - tA;
    });

    return {
      callingCount,
      presentCount,
      virtualConfirmedCount,
      absentCount,
      respondedList,
      unansweredList
    };
  }, [syncedDataset.records, selectedClassId, nowTickMs]);

  // Export Responded vs Not Responded Registry to CSV
  const handleExportRollCallRegistryCsv = () => {
    const headers = [
      'Prioridad',
      'Estado_Llamado',
      'Estudiante',
      'Documento_ID',
      'Correo_Electronico',
      'WhatsApp',
      'Clase',
      'Bloque_Convocado',
      'Codigo_Unico_Generado',
      'Hora_Respuesta',
      'Estado_Bloque_A_B1',
      'Estado_Bloque_B_B2'
    ];
    const rows: string[][] = [];
    statsForSelectedClass.respondedList.forEach((item, i) => {
      const contact = studentContactMap.get(item.rec.studentId);
      const c = item.rec.clases[selectedClassId];
      rows.push([
        String(i + 1),
        'RESPONDIO_PRESENTE',
        `"${item.rec.nombre.replace(/"/g, '""')}"`,
        item.rec.documento,
        contact?.email || '',
        contact?.whatsapp || '',
        `CLASE C${selectedClassId}`,
        item.bloqueLabel,
        item.codigoUnico,
        item.respondedAtIso ? new Date(item.respondedAtIso).toLocaleString('es-CO') : 'Confirmado',
        c?.asistenciaB1Estado || 'presente_virtual',
        c?.asistenciaB2Estado || 'presente_virtual'
      ]);
    });
    statsForSelectedClass.unansweredList.forEach((item, i) => {
      const contact = studentContactMap.get(item.rec.studentId);
      const c = item.rec.clases[selectedClassId];
      rows.push([
        String(statsForSelectedClass.respondedList.length + i + 1),
        'NO_RESPONDIO',
        `"${item.rec.nombre.replace(/"/g, '""')}"`,
        item.rec.documento,
        contact?.email || '',
        contact?.whatsapp || '',
        `CLASE C${selectedClassId}`,
        selectedBloque === 'ambos' ? 'Bloques A y B' : selectedBloque === 'b2' ? 'Bloque B' : 'Bloque A',
        item.codigoUnico,
        'Sin respuesta',
        c?.asistenciaB1Estado || 'sin_registrar',
        c?.asistenciaB2Estado || 'sin_registrar'
      ]);
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Registro_Llamado_Asistencia_C${selectedClassId}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showFeedback(
      `📥 Registro oficial exportado (${statsForSelectedClass.respondedList.length} respondieron / ${statsForSelectedClass.unansweredList.length} no respondieron).`
    );
  };

  const totalProgrammedSec = Math.max(
    60,
    (aperturaActiva?.duracionMinutos || activeDurationMin || 10) * 60
  );
  const progressRemainingPct = isClassCurrentlyOpen
    ? Math.max(0, Math.min(100, Math.round((aperturaRemainingSec / totalProgrammedSec) * 100)))
    : 0;

  // Estado local para mostrar/ocultar el configurador de Bloques Horarios Recurrentes dentro de este centro
  const [showScheduleConfiguratorInline, setShowScheduleConfiguratorInline] =
    useState<boolean>(false);

  // Motor de Automatización de Apertura de Clases basado en el Horario Escolar Real (Fechas, Días y Horas)
  const recurringScheduleRules = useMemo(
    () =>
      Array.isArray(syncedDataset.bloquesHorariosRecurrentes)
        ? syncedDataset.bloquesHorariosRecurrentes
        : getDefaultRecurringScheduleBlocks(courseName || syncedDataset.courseName),
    [syncedDataset.bloquesHorariosRecurrentes, courseName, syncedDataset.courseName]
  );
  const isScheduleAutomationActive = syncedDataset.aperturaAutomaticaHorarioActiva !== false;

  useEffect(() => {
    if (!isFunctionEnabled || !isScheduleAutomationActive) return;
    if (isClassCurrentlyOpen) return;

    const now = new Date(nowTickMs);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;
    const todayDayOfWeek = now.getDay(); // 0=Dom..6=Sáb
    const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    const matchingRule = recurringScheduleRules.find((rule) => {
      if (!rule || !rule.activo) return false;
      const runKey = `${todayDateStr}_${rule.id}`;
      if (rule.ultimaAperturaAutoKey === runKey) return false;

      // Validar fecha específica o rango de fechas de vigencia
      if (rule.fechaEspecifica && rule.fechaEspecifica.trim() !== '') {
        if (rule.fechaEspecifica.trim() !== todayDateStr) return false;
      } else {
        if (rule.fechaInicioVigencia && todayDateStr < rule.fechaInicioVigencia) return false;
        if (rule.fechaFinVigencia && todayDateStr > rule.fechaFinVigencia) return false;
        if (
          Array.isArray(rule.diasSemana) &&
          rule.diasSemana.length > 0 &&
          !rule.diasSemana.includes(todayDayOfWeek)
        ) {
          return false;
        }
      }

      // Validar ventana de hora escolar real [horaApertura, horaCierre]
      const startHm = (rule.horaApertura || '08:00').trim();
      const endHm = (rule.horaCierre || '08:20').trim();
      return currentHm >= startHm && currentHm <= endHm;
    });

    if (!matchingRule) return;

    // Disparar apertura automática de la clase y llamado de asistencia según el bloque horario escolar real
    const safeMin = Math.max(
      1,
      Math.min(180, Number(matchingRule.duracionLlamadoMinutos) || 15)
    );
    const nowIso = now.toISOString();
    const expIso = new Date(now.getTime() + safeMin * 60 * 1000).toISOString();
    const runKey = `${todayDateStr}_${matchingRule.id}`;
    const targetClaseId = (matchingRule.claseId || 1) as ClassSessionId;
    const targetBloque = matchingRule.bloqueAsistencia || 'A';

    const nextApertura: ActiveClassOpeningConfig = {
      abierta: true,
      claseId: targetClaseId,
      bloque: targetBloque,
      duracionMinutos: safeMin,
      iniciadaAtIso: nowIso,
      expiraAtIso: expIso,
      metodoPrincipal: matchingRule.metodoLlamadoAuto || 'alerta_panel',
      origenApertura: 'automatico_horario_escolar',
      bloqueHorarioReglaId: matchingRule.id
    };

    const nextRules = recurringScheduleRules.map((r) =>
      r.id === matchingRule.id ? { ...r, ultimaAperturaAutoKey: runKey } : r
    );

    const nextRecords = matchingRule.autoIniciarLlamado
      ? syncedDataset.records.map((rec) => {
          const prevClass = rec.clases[targetClaseId] || {
            claseId: targetClaseId,
            bloque1Asistio: true,
            bloque2Asistio: true,
            asistenciaB1Estado: 'sin_registrar',
            asistenciaB2Estado: 'sin_registrar',
            comportamiento: 5.0,
            participacion: 5.0,
            examen: 5.0,
            trabajoPractico: 5.0,
            notaFinal: 5.0,
            autoCalcularNotaFinal: true,
            observacionDocente: ''
          };
          const code =
            prevClass.llamadoVirtualCodigoUnico ||
            generateUniqueAttendanceCode(rec.studentId, targetClaseId);
          return {
            ...rec,
            ultimaActualizacionIso: nowIso,
            clases: {
              ...rec.clases,
              [targetClaseId]: {
                ...prevClass,
                llamadoVirtualActivo: true,
                llamadoVirtualBloque:
                  targetBloque === 'AB' ? 'ambos' : targetBloque === 'B' ? 2 : 1,
                llamadoVirtualEmitidoAtIso: nowIso,
                llamadoVirtualExpiraAtIso: expIso,
                llamadoVirtualDuracionMin: safeMin,
                llamadoVirtualMetodo: matchingRule.metodoLlamadoAuto || 'alerta_panel',
                llamadoVirtualCodigoUnico: code,
                asistenciaB1Estado:
                  targetBloque === 'A' || targetBloque === 'AB'
                    ? 'llamando'
                    : prevClass.asistenciaB1Estado || 'sin_registrar',
                asistenciaB2Estado:
                  targetBloque === 'B' || targetBloque === 'AB'
                    ? 'llamando'
                    : prevClass.asistenciaB2Estado || 'sin_registrar'
              }
            }
          };
        })
      : syncedDataset.records;

    setSelectedClassId(targetClaseId);
    setSelectedBloque(targetBloque === 'AB' ? 'ambos' : targetBloque === 'B' ? 'b2' : 'b1');
    setActiveDurationMin(safeMin);
    setShowLiveMiniScreen(true);

    onSaveDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaClaseActiva: nextApertura,
      bloquesHorariosRecurrentes: nextRules,
      records: nextRecords
    });

    showFeedback(
      `⏰ Apertura Automática por Horario Escolar ejecutada: «${matchingRule.etiquetaBloque}» (${matchingRule.asignaturaNombre} · Clase C${targetClaseId} · Bloque ${targetBloque} · ${safeMin} min).`
    );
  }, [
    nowTickMs,
    isFunctionEnabled,
    isScheduleAutomationActive,
    isClassCurrentlyOpen,
    recurringScheduleRules
  ]);

  return (
    <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* CABECERA UNIFICADA DE APERTURA DE CLASES Y LLAMADO DE ASISTENCIA + HABILITAR / DESHABILITAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-mono text-[10px] font-extrabold uppercase tracking-wider">
              Centro Unificado de Asistencia
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                !isFunctionEnabled
                  ? 'bg-red-100 text-red-900 border border-red-300'
                  : isClassCurrentlyOpen
                  ? 'bg-emerald-600 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {!isFunctionEnabled
                ? '🚫 FUNCIÓN DESHABILITADA'
                : isClassCurrentlyOpen
                ? `🟢 LLAMADO ACTIVO CLASE C${aperturaActiva?.claseId} · Restan ${String(
                    Math.floor(aperturaRemainingSec / 60)
                  ).padStart(2, '0')}:${String(aperturaRemainingSec % 60).padStart(2, '0')}`
                : '⚪ Clase Cerrada · Función Habilitada'}
            </span>
            <span className="text-[11px] font-mono font-bold text-indigo-800">
              Nómina: {syncedDataset.records.length} estudiantes
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>
              Apertura de Clases y Llamado de Asistencia (Alerta en Panel, Código WhatsApp/Correo Gratis y Más)
            </span>
          </h3>
        </div>

        {/* Interruptor Habilitar / Deshabilitar Función + Exportación */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border-2 border-indigo-200 bg-slate-100 p-1 gap-1">
            <button
              type="button"
              onClick={() => handleToggleFunctionEnabled(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                isFunctionEnabled
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              🟢 Habilitar Función
            </button>
            <button
              type="button"
              onClick={() => handleToggleFunctionEnabled(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                !isFunctionEnabled
                  ? 'bg-red-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              🚫 Deshabilitar Función
            </button>
          </div>

          {isFunctionEnabled && selectedMethod === 'codigo_unico_correo_whatsapp' && (
            <button
              type="button"
              onClick={() => {
                const list = syncedDataset.records.map((r) => {
                  const c = r.clases[selectedClassId];
                  const code =
                    c?.llamadoVirtualCodigoUnico ||
                    generateUniqueAttendanceCode(r.studentId, selectedClassId);
                  return `${r.nombre} (${r.documento}): ${code}`;
                });
                navigator.clipboard?.writeText(list.join('\n'));
                showFeedback('📋 Lista de códigos únicos copiada al portapapeles.');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-bold cursor-pointer"
            >
              📋 Copiar Códigos Únicos
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowScheduleConfiguratorInline((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold cursor-pointer flex items-center gap-1.5 transition-colors ${
              showScheduleConfiguratorInline
                ? 'bg-indigo-700 text-white border-indigo-700'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              ⏰ Bloques Horarios Recurrentes (
              {recurringScheduleRules.filter((r) => r.activo).length}/
              {recurringScheduleRules.length} activos)
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportRollCallRegistryCsv}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
          >
            📥 Exportar Registro CSV
          </button>
        </div>
      </div>

      {/* PANEL INTEGRADO DE BLOQUES HORARIOS RECURRENTES POR ASIGNATURA (DESPLEGABLE DESDE APERTURA DE CLASES) */}
      {showScheduleConfiguratorInline && (
        <RecurringScheduleBlocksConfigurator
          dataset={syncedDataset}
          students={students}
          courseModules={courseModules}
          courseName={courseName || syncedDataset.courseName}
          onUpdateDataset={(nextDs, opts) => onSaveDataset(nextDs, opts?.silent)}
          compact
        />
      )}

      {feedbackBanner && (
        <div className="p-3 rounded-xl bg-indigo-950 text-white text-xs font-bold flex items-center justify-between shadow-sm">
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-indigo-200 hover:text-white cursor-pointer ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {!isFunctionEnabled ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200 text-slate-800 font-mono text-xs font-extrabold uppercase">
            🚫 Función Deshabilitada Temporalmente
          </div>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl mx-auto">
            La función <strong>«Apertura de Clases y Llamado de Asistencia (Alerta en Panel, Código WhatsApp/Correo Gratis y Más)»</strong> se encuentra deshabilitada. Ninguna alerta de llamado en vivo está activa en los paneles de los estudiantes.
          </p>
          <div>
            <button
              type="button"
              onClick={() => handleToggleFunctionEnabled(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer shadow-xs"
            >
              🟢 Habilitar Apertura de Clases y Llamado de Asistencia Ahora
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* PANEL UNIFICADO DE APERTURA DE CLASE, CONFIGURACIÓN Y BOTÓN INICIAR LLAMADO DE ASISTENCIA */}
          <div
            className={`rounded-2xl border-2 p-4 space-y-3.5 transition-all ${
              isClassCurrentlyOpen
                ? 'bg-emerald-50/60 border-emerald-400'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            {/* 4 Controles de Configuración en una sola fila */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
              {/* 1. Clase */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 ${
                  isClassCurrentlyOpen
                    ? 'bg-white border-emerald-200 text-slate-900'
                    : 'bg-slate-800/90 border-slate-700 text-white'
                }`}
              >
                <label className="block font-extrabold uppercase text-[10px] tracking-wider opacity-80">
                  1. Especificar Clase:
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(Number(e.target.value) as ClassSessionId)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-900"
                >
                  {effectiveClassSessions.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      CLASE C{cs.id}: {cs.shortTitle}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Bloque de Asistencia (A, B o Ambos A y B al tiempo) */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 ${
                  isClassCurrentlyOpen
                    ? 'bg-white border-emerald-200 text-slate-900'
                    : 'bg-slate-800/90 border-slate-700 text-white'
                }`}
              >
                <label className="block font-extrabold uppercase text-[10px] tracking-wider opacity-80">
                  2. Bloque de Asistencia:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'b1' as const, label: 'Bloque A' },
                    { id: 'b2' as const, label: 'Bloque B' },
                    { id: 'ambos' as const, label: 'Ambos A y B' }
                  ].map((bOpt) => (
                    <button
                      key={bOpt.id}
                      type="button"
                      onClick={() => setSelectedBloque(bOpt.id)}
                      className={`py-2 px-2 rounded-lg font-extrabold text-[11px] cursor-pointer border transition-all ${
                        selectedBloque === bOpt.id
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-2xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {bOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Tiempo de Activo */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 ${
                  isClassCurrentlyOpen
                    ? 'bg-white border-emerald-200 text-slate-900'
                    : 'bg-slate-800/90 border-slate-700 text-white'
                }`}
              >
                <label className="block font-extrabold uppercase text-[10px] tracking-wider opacity-80">
                  3. Tiempo de Activo (Min):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={activeDurationMin}
                    onChange={(e) =>
                      setActiveDurationMin(Math.max(1, Math.min(180, Number(e.target.value) || 10)))
                    }
                    className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-extrabold text-slate-900 text-center"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[3, 5, 10, 15, 30, 60].map((mVal) => (
                      <button
                        key={mVal}
                        type="button"
                        onClick={() => setActiveDurationMin(mVal)}
                        className={`px-2 py-1 rounded font-mono text-[10px] font-bold cursor-pointer ${
                          activeDurationMin === mVal
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                        }`}
                      >
                        {mVal}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. Método de Llamado */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 ${
                  isClassCurrentlyOpen
                    ? 'bg-white border-emerald-200 text-slate-900'
                    : 'bg-slate-800/90 border-slate-700 text-white'
                }`}
              >
                <label className="block font-extrabold uppercase text-[10px] tracking-wider opacity-80">
                  4. Método de Llamado:
                </label>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                >
                  <option value="alerta_boton_panel">
                    1. 🔔 Alerta en Panel con Botón «¡Presente!»
                  </option>
                  <option value="codigo_unico_correo_whatsapp">
                    2. 📲✉️ Código Único WhatsApp/Correo (Gratis · Sin Bloqueo)
                  </option>
                  <option value="palabra_clave_secreta">
                    3. 🔑 Palabra Clave Secreta en Vivo
                  </option>
                  <option value="qr_enlace_dinamico">
                    4. 📱 Token / QR Dinámico en Pantalla
                  </option>
                  <option value="reto_relampago_30s">
                    5. ⚡ Alerta Relámpago de Permanencia
                  </option>
                </select>
                {(selectedMethod === 'palabra_clave_secreta' ||
                  selectedMethod === 'qr_enlace_dinamico') && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <input
                      type="text"
                      value={secretClassKeyword}
                      onChange={(e) => setSecretClassKeyword(e.target.value.toUpperCase())}
                      placeholder="Código / Clave..."
                      className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 font-mono text-[11px] font-bold uppercase"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSecretClassKeyword(
                          `CLASE${selectedClassId}-${Math.floor(100 + Math.random() * 900)}`
                        )
                      }
                      className="px-2 py-1 rounded bg-amber-400 text-slate-950 font-bold text-[10px] shrink-0 cursor-pointer"
                    >
                      Nuevo
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Botón Principal: INICIAR LLAMADO DE ASISTENCIA + Finalizar Llamado y Generar Registro */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-300/30">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenClassSession(true)}
                  className="min-h-[42px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer shadow-sm flex items-center gap-2 transition-all"
                >
                  <span>
                    🚀 Iniciar llamado de asistencia (Clase C{selectedClassId} ·{' '}
                    {selectedBloque === 'ambos'
                      ? 'Bloques A y B'
                      : selectedBloque === 'b2'
                      ? 'Bloque B'
                      : 'Bloque A'}{' '}
                    · {activeDurationMin} min)
                  </span>
                </button>

                {selectedStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowLiveMiniScreen(true);
                      setGeneratedRegistrySnapshot(null);
                      handleEmitRollCallToStudentIds(
                        selectedStudentIds,
                        selectedBloque,
                        selectedMethod === 'codigo_unico_correo_whatsapp'
                      );
                    }}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs cursor-pointer shadow-sm transition-all"
                  >
                    ☑️ Iniciar llamado a Seleccionados ({selectedStudentIds.length})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(isClassCurrentlyOpen || statsForSelectedClass.callingCount > 0) && (
                  <button
                    type="button"
                    onClick={() => handleCloseActiveRollCall(true, 'manual_docente')}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer shadow-xs"
                    title="Finaliza el llamado de asistencia inmediatamente y genera el registro oficial de asistencia"
                  >
                    ⏹️ Finalizar llamado de asistencia y Generar Registro
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* MINI PANTALLA EN VIVO: TIEMPO RESTANTE, ESTUDIANTES CONFIRMADOS Y REGISTRO DE ASISTENCIA */}
          {(isClassCurrentlyOpen ||
            statsForSelectedClass.callingCount > 0 ||
            generatedRegistrySnapshot !== null) &&
            showLiveMiniScreen && (
              <div className="rounded-2xl border-2 border-indigo-500 bg-slate-950 text-white p-4 sm:p-5 shadow-md space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                          isClassCurrentlyOpen || statsForSelectedClass.callingCount > 0
                            ? 'bg-emerald-500 text-slate-950 animate-pulse'
                            : 'bg-amber-400 text-slate-950'
                        }`}
                      >
                        {isClassCurrentlyOpen || statsForSelectedClass.callingCount > 0
                          ? '📡 MINI PANTALLA EN VIVO · LLAMADO EN CURSO'
                          : '🏁 LLAMADO FINALIZADO · REGISTRO DE ASISTENCIA GENERADO'}
                      </span>
                      <span className="text-xs font-mono text-indigo-300 font-bold">
                        CLASE C{aperturaActiva?.claseId || selectedClassId} ·{' '}
                        {selectedBloque === 'ambos'
                          ? 'Bloques A y B'
                          : selectedBloque === 'b2'
                          ? 'Bloque B (B2)'
                          : 'Bloque A (B1)'}
                      </span>
                    </div>
                    <h4 className="text-sm sm:text-base font-extrabold text-white">
                      Monitor en Tiempo Real del Llamado de Asistencia y Confirmaciones
                    </h4>
                  </div>

                  {/* Reloj Digital del Tiempo Restante + Botón Finalizar */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 rounded-xl bg-slate-900 border border-indigo-500/60 flex items-center gap-3">
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">
                          Tiempo Restante
                        </div>
                        <div className="text-xl sm:text-2xl font-mono font-black text-emerald-400 tracking-tight">
                          {isClassCurrentlyOpen
                            ? `${String(Math.floor(aperturaRemainingSec / 60)).padStart(
                                2,
                                '0'
                              )}:${String(aperturaRemainingSec % 60).padStart(2, '0')}`
                            : '00:00'}
                        </div>
                      </div>
                      <div className="border-l border-slate-800 pl-3 text-right">
                        <div className="text-[10px] font-mono uppercase text-slate-400">
                          Confirmados
                        </div>
                        <div className="text-base sm:text-lg font-mono font-extrabold text-white">
                          {statsForSelectedClass.virtualConfirmedCount} /{' '}
                          {syncedDataset.records.length}
                        </div>
                      </div>
                    </div>

                    {isClassCurrentlyOpen || statsForSelectedClass.callingCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleCloseActiveRollCall(true, 'manual_docente')}
                        className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs cursor-pointer shadow-sm"
                      >
                        ⏹️ Finalizar llamado de asistencia
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setGeneratedRegistrySnapshot(null)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
                      >
                        ✕ Cerrar Mini Pantalla
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de progreso del tiempo activo */}
                {isClassCurrentlyOpen && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                      <span>
                        El llamado finalizará automáticamente al terminar el tiempo programado y generará el registro de asistencia.
                      </span>
                      <span>{progressRemainingPct}% del tiempo activo</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${progressRemainingPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Dos Columnas en la Mini Pantalla: 1. Estudiantes que han confirmado su asistencia | 2. Pendientes por confirmar */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Columna 1: Estudiantes que HAN CONFIRMADO su asistencia */}
                  <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider">
                        ✅ Estudiantes que han confirmado asistencia (
                        {statsForSelectedClass.respondedList.length})
                      </span>
                      <span className="text-[11px] font-mono text-emerald-200">
                        Actualización en tiempo real
                      </span>
                    </div>
                    {statsForSelectedClass.respondedList.length === 0 ? (
                      <div className="p-4 rounded-lg bg-slate-900/70 text-slate-400 text-xs text-center font-mono">
                        Esperando que los estudiantes confirmen su asistencia en el panel...
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {statsForSelectedClass.respondedList.map((item, idx) => (
                          <div
                            key={item.rec.studentId}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-900/40 border border-emerald-500/30 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono font-extrabold text-[10px]">
                                #{idx + 1}
                              </span>
                              <span className="font-extrabold text-white truncate">
                                {item.rec.nombre}
                              </span>
                              <span className="font-mono text-[10px] text-emerald-200">
                                ({item.rec.documento})
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                                {item.bloqueLabel}
                              </span>
                              <span className="text-emerald-300 font-bold">
                                ✓{' '}
                                {item.respondedAtIso
                                  ? new Date(item.respondedAtIso).toLocaleTimeString('es-CO')
                                  : 'Confirmado'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Columna 2: Estudiantes Pendientes por Confirmar */}
                  <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-300 uppercase tracking-wider">
                        ⏳ Pendientes por confirmar ({statsForSelectedClass.unansweredList.length})
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Clic en «Confirmar» para validación directa
                      </span>
                    </div>
                    {statsForSelectedClass.unansweredList.length === 0 ? (
                      <div className="p-4 rounded-lg bg-emerald-950/40 text-emerald-300 text-xs text-center font-bold">
                        🎉 ¡Todos los estudiantes de la nómina han confirmado su asistencia!
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {statsForSelectedClass.unansweredList.map((item) => (
                          <div
                            key={item.rec.studentId}
                            className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-slate-100 truncate block">
                                {item.rec.nombre}{' '}
                                <span className="font-mono text-[10px] text-slate-400">
                                  ({item.rec.documento})
                                </span>
                              </span>
                              <span className="text-[10px] font-mono text-amber-300">
                                {item.statusLabel} · PIN: {item.codigoUnico}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleConfirmStudentVirtualNow(item.rec.studentId)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer shrink-0"
                            >
                              ✓ Confirmar Presente
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* REGISTRO OFICIAL DE ASISTENCIA GENERADO AL FINALIZAR EL LLAMADO */}
                {generatedRegistrySnapshot && (
                  <div className="rounded-xl bg-indigo-950/90 border-2 border-amber-400 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800 pb-2.5">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-extrabold uppercase">
                          📋 Registro Oficial de Asistencia Generado
                        </span>
                        <h5 className="text-sm font-extrabold text-white mt-1">
                          CLASE C{generatedRegistrySnapshot.claseId} ({generatedRegistrySnapshot.claseTitle}) ·{' '}
                          {generatedRegistrySnapshot.bloqueLabel}
                        </h5>
                        <p className="text-[11px] text-indigo-200 font-mono">
                          Generado: {new Date(generatedRegistrySnapshot.generatedAtIso).toLocaleString('es-CO')} ·{' '}
                          Motivo:{' '}
                          {generatedRegistrySnapshot.closedReason === 'tiempo_programado'
                            ? 'Tiempo programado finalizado automáticamente'
                            : 'Finalizado por el docente'}{' '}
                          · Método: {generatedRegistrySnapshot.metodoLabel}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportRollCallRegistryCsv}
                        className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs cursor-pointer shrink-0"
                      >
                        📥 Descargar Registro de Asistencia (CSV)
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-700">
                        <div className="text-[10px] text-slate-400 uppercase">Total Nómina</div>
                        <div className="text-base font-extrabold text-white">
                          {generatedRegistrySnapshot.totalConvocados}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-950/90 border border-emerald-500/40">
                        <div className="text-[10px] text-emerald-300 uppercase">
                          Confirmaron Asistencia
                        </div>
                        <div className="text-base font-extrabold text-emerald-400">
                          {generatedRegistrySnapshot.confirmados.length}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-red-950/90 border border-red-500/40">
                        <div className="text-[10px] text-red-300 uppercase">
                          Inasistencias Registradas (1)
                        </div>
                        <div className="text-base font-extrabold text-red-400">
                          {generatedRegistrySnapshot.inasistentes.length}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
        </>
      )}

      {/* NÓMINA UNIFICADA Y REGISTRO DE RESPUESTAS (PRIORIZANDO ESTUDIANTES QUE RESPONDIERON) */}
      {isFunctionEnabled && (
        <div className="space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Píldoras de Filtro Unificadas (Respondieron vs. No Respondieron vs. Todos) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setResponseFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border ${
                responseFilterTab === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              📋 Todos ({syncedDataset.records.length})
            </button>
            <button
              type="button"
              onClick={() => setResponseFilterTab('RESPONDED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold cursor-pointer border ${
                responseFilterTab === 'RESPONDED'
                  ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-400/40'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-300'
              }`}
            >
              🙋‍♂️ Respondieron: {statsForSelectedClass.virtualConfirmedCount}
            </button>
            <button
              type="button"
              onClick={() => setResponseFilterTab('CALLING_OR_UNANSWERED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold cursor-pointer border ${
                responseFilterTab === 'CALLING_OR_UNANSWERED'
                  ? 'bg-amber-600 text-white border-amber-700'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
              }`}
            >
              ⏳ No Respondieron: {statsForSelectedClass.unansweredList.length}
            </button>
            <span className="px-2.5 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-mono font-bold">
              ❌ Inasistieron: {statsForSelectedClass.absentCount}
            </span>
          </div>

          {/* Buscador, Priorización y Compactar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Buscar estudiante, ID, correo..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <button
              type="button"
              onClick={() => setPrioritizeResponded((p) => !p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                prioritizeResponded
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {prioritizeResponded ? '⚡ Priorizando Respondieron' : 'Orden Alfabético'}
            </button>

            <button
              type="button"
              onClick={() => setIsExpandedList((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              {isExpandedList
                ? 'Ocultar Nómina ▲'
                : `Ver Nómina (${syncedDataset.records.length}) ▼`}
            </button>
          </div>
        </div>

        {isExpandedList && (
          <div className="max-h-[480px] overflow-y-auto border border-slate-200 rounded-xl shadow-2xs">
            <table className="w-full table-auto border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-bold uppercase sticky top-0 z-10">
                  <th className="py-2.5 px-2 text-center w-8">
                    <input
                      type="checkbox"
                      checked={
                        filteredRecords.length > 0 &&
                        filteredRecords.every((r) => selectedStudentIds.includes(r.studentId))
                      }
                      onChange={() => {
                        const allIds = filteredRecords.map((r) => r.studentId);
                        const allSelected =
                          allIds.length > 0 &&
                          allIds.every((id) => selectedStudentIds.includes(id));
                        if (allSelected) {
                          setSelectedStudentIds((prev) =>
                            prev.filter((id) => !allIds.includes(id))
                          );
                        } else {
                          setSelectedStudentIds((prev) =>
                            Array.from(new Set([...prev, ...allIds]))
                          );
                        }
                      }}
                      className="rounded cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-2 text-center w-10">#</th>
                  <th className="py-2.5 px-2.5">ESTUDIANTE (PRIORIZADO POR RESPUESTA)</th>
                  <th className="py-2.5 px-2">CONTACTO & CÓDIGO ÚNICO</th>
                  <th className="py-2.5 px-2 text-center">
                    LLAMADO INDIVIDUAL (PANEL / WHATSAPP / CORREO)
                  </th>
                  <th className="py-2.5 px-2 text-center">BLOQUE A (B1)</th>
                  <th className="py-2.5 px-2 text-center">BLOQUE B (B2)</th>
                  <th className="py-2.5 px-2 text-center">ESTADO C{selectedClassId}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRecords.map((rec, idx) => {
                  const meta = getStudentResponseMeta(rec);
                  const c = meta.c;
                  const b1Absent =
                    c?.asistenciaB1Estado === 'falla' || c?.bloque1Asistio === false;
                  const b2Absent =
                    c?.asistenciaB2Estado === 'falla' || c?.bloque2Asistio === false;
                  const isMissed = b1Absent || b2Absent;
                  const isSelected = selectedStudentIds.includes(rec.studentId);
                  const contact = studentContactMap.get(rec.studentId);
                  const studentPin =
                    c?.llamadoVirtualCodigoUnico ||
                    generateUniqueAttendanceCode(rec.studentId, selectedClassId);
                  const msgData = buildFreeTierMessage(
                    rec.nombre,
                    rec.studentId,
                    studentPin,
                    selectedClassId,
                    selectedBloque,
                    activeDurationMin
                  );
                  const cleanWaPhone = formatPhoneForWaMe(contact?.whatsapp || '');
                  const waHref = cleanWaPhone
                    ? `https://wa.me/${cleanWaPhone}?text=${encodeURIComponent(msgData.body)}`
                    : `https://wa.me/?text=${encodeURIComponent(msgData.body)}`;
                  const mailHref = `mailto:${encodeURIComponent(
                    contact?.email || ''
                  )}?subject=${encodeURIComponent(msgData.subject)}&body=${encodeURIComponent(
                    msgData.body
                  )}`;

                  return (
                    <tr
                      key={rec.studentId}
                      className={`transition-colors ${
                        meta.respondedVirtual
                          ? 'bg-emerald-50/90 hover:bg-emerald-100/70'
                          : meta.isActivelyCalling
                          ? 'bg-indigo-50/60 hover:bg-indigo-100/60'
                          : isSelected
                          ? 'bg-sky-50/60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectStudent(rec.studentId)}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-slate-900">{rec.nombre}</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            ({rec.documento})
                          </span>
                          {meta.respondedVirtual && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-mono font-extrabold shadow-2xs">
                              🙋‍♂️ RESPONDIÓ PRESENTE{' '}
                              {meta.respondedAtIso
                                ? `· ${new Date(meta.respondedAtIso).toLocaleTimeString('es-CO')}`
                                : ''}
                            </span>
                          )}
                          {meta.isActivelyCalling && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold animate-pulse">
                              📡 ALERTA ACTIVA
                              {meta.remainingSec !== null
                                ? ` (${Math.floor(meta.remainingSec / 60)}:${String(
                                    meta.remainingSec % 60
                                  ).padStart(2, '0')})`
                                : ''}
                            </span>
                          )}
                          {meta.wasCalledAndExpired && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-mono font-bold">
                              ⏰ Expiró sin respuesta
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2 font-mono text-[10px] text-slate-600">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-900 font-bold">
                            🔑 {studentPin}
                          </span>
                          {contact?.whatsapp && (
                            <span className="text-emerald-800" title="WhatsApp">
                              📱 {contact.whatsapp}
                            </span>
                          )}
                          {contact?.email && (
                            <span className="text-sky-800 truncate max-w-[140px]" title={contact.email}>
                              ✉️ {contact.email}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleEmitRollCallToStudentIds([rec.studentId], selectedBloque)
                            }
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] cursor-pointer shadow-2xs"
                            title={`Enviar alerta al panel de ${rec.nombre} por ${activeDurationMin} min`}
                          >
                            📢 Llamar ({selectedBloque === 'ambos' ? 'A+B' : selectedBloque === 'b2' ? 'B' : 'A'})
                          </button>

                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              handleEmitRollCallToStudentIds([rec.studentId], selectedBloque)
                            }
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                            title={`Activar llamado y enviar código único (${studentPin}) por WhatsApp gratuito sin bloqueo`}
                          >
                            📲 WhatsApp
                          </a>

                          <a
                            href={mailHref}
                            onClick={() =>
                              handleEmitRollCallToStudentIds([rec.studentId], selectedBloque)
                            }
                            className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                            title={`Activar llamado y enviar código único (${studentPin}) por Correo gratuito sin bloqueo`}
                          >
                            ✉️ Correo
                          </a>
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStudentBlock(rec.studentId, 'b1')}
                          className={`w-9 h-6 mx-auto rounded font-mono font-extrabold text-xs border cursor-pointer ${
                            b1Absent
                              ? 'bg-red-600 text-white border-red-700'
                              : c?.asistenciaB1Estado === 'presente_virtual'
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-300'
                          }`}
                          title="Alternar Bloque A (B1): Presente / Inasistencia (1)"
                        >
                          {b1Absent ? '1' : c?.asistenciaB1Estado === 'presente_virtual' ? '✓' : 'A'}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStudentBlock(rec.studentId, 'b2')}
                          className={`w-9 h-6 mx-auto rounded font-mono font-extrabold text-xs border cursor-pointer ${
                            b2Absent
                              ? 'bg-red-600 text-white border-red-700'
                              : c?.asistenciaB2Estado === 'presente_virtual'
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-300'
                          }`}
                          title="Alternar Bloque B (B2): Presente / Inasistencia (1)"
                        >
                          {b2Absent ? '1' : c?.asistenciaB2Estado === 'presente_virtual' ? '✓' : 'B'}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            meta.respondedVirtual
                              ? 'bg-emerald-600 text-white'
                              : isMissed
                              ? 'bg-red-100 text-red-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {meta.respondedVirtual
                            ? '✓ Presente (Panel)'
                            : isMissed
                            ? 'Inasistió (1)'
                            : 'Asistió'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}
    </div>
  );
}

/**
 * Componente de Configuración de Bloques Horarios Recurrentes por Asignatura
 * Permite definir fechas, días de la semana y horas para automatizar la apertura de clases
 * y el llamado de asistencia basado en el horario escolar real.
 */
export function RecurringScheduleBlocksConfigurator({
  dataset,
  students,
  courseModules,
  courseName,
  onUpdateDataset,
  compact = false
}: {
  dataset: AcademicDataset;
  students: StudentRecord[];
  courseModules?: {
    id: number;
    titulo: string;
    examenesCount?: number;
    retosCount?: number;
    documentosEnlaces?: { id: string; titulo: string; url: string; tipo?: string }[];
    enlacesTextoRaw?: string;
  }[];
  courseName?: string;
  onUpdateDataset: (next: AcademicDataset, options?: { silent?: boolean }) => void;
  compact?: boolean;
}) {
  const syncedDataset = useMemo(
    () => normalizeAndSyncAcademicDataset(dataset, students, courseModules, courseName),
    [dataset, students, courseModules, courseName]
  );

  const activeClassSessions = useMemo(
    () =>
      Array.isArray(syncedDataset.classSessions) && syncedDataset.classSessions.length > 0
        ? syncedDataset.classSessions
        : OFFICIAL_CLASS_SESSIONS,
    [syncedDataset.classSessions]
  );

  const defaultSubjectName =
    courseName || syncedDataset.courseName || 'Marketing Digital Estratégico';

  const scheduleRules = useMemo(
    () =>
      Array.isArray(syncedDataset.bloquesHorariosRecurrentes)
        ? syncedDataset.bloquesHorariosRecurrentes
        : getDefaultRecurringScheduleBlocks(defaultSubjectName),
    [syncedDataset.bloquesHorariosRecurrentes, defaultSubjectName]
  );

  const isAutoEnabled = syncedDataset.aperturaAutomaticaHorarioActiva !== false;

  const [nowClock, setNowClock] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowClock(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [asignaturaDraft, setAsignaturaDraft] = useState<string>(defaultSubjectName);
  const [claseIdDraft, setClaseIdDraft] = useState<ClassSessionId>(1);
  const [bloqueDraft, setBloqueDraft] = useState<'A' | 'B' | 'AB'>('A');
  const [etiquetaDraft, setEtiquetaDraft] = useState<string>(
    'Bloque A · Jornada Escolar Mañana'
  );
  const [diasSemanaDraft, setDiasSemanaDraft] = useState<number[]>([6]);
  const [fechaInicioDraft, setFechaInicioDraft] = useState<string>('2026-02-01');
  const [fechaFinDraft, setFechaFinDraft] = useState<string>('2026-12-15');
  const [fechaEspecificaDraft, setFechaEspecificaDraft] = useState<string>('');
  const [horaAperturaDraft, setHoraAperturaDraft] = useState<string>('08:00');
  const [horaCierreDraft, setHoraCierreDraft] = useState<string>('08:20');
  const [duracionMinDraft, setDuracionMinDraft] = useState<number>(15);
  const [metodoLlamadoDraft, setMetodoLlamadoDraft] = useState<
    | 'alerta_panel'
    | 'codigo_unico_wa_email'
    | 'qr_pin_aula'
    | 'pregunta_relampago'
    | 'voz_manual'
  >('alerta_panel');
  const [autoIniciarLlamadoDraft, setAutoIniciarLlamadoDraft] = useState<boolean>(true);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setScheduleNotice(msg);
    setTimeout(() => setScheduleNotice(null), 6500);
  };

  const DAY_LABELS: { id: number; short: string; full: string }[] = [
    { id: 1, short: 'Lun', full: 'Lunes' },
    { id: 2, short: 'Mar', full: 'Martes' },
    { id: 3, short: 'Mié', full: 'Miércoles' },
    { id: 4, short: 'Jue', full: 'Jueves' },
    { id: 5, short: 'Vie', full: 'Viernes' },
    { id: 6, short: 'Sáb', full: 'Sábado' },
    { id: 0, short: 'Dom', full: 'Domingo' }
  ];

  const formatDaysList = (days: number[]) => {
    if (!Array.isArray(days) || days.length === 0) return 'Todos los días';
    if (days.length === 7) return 'Lun a Dom (Todos los días)';
    return DAY_LABELS.filter((d) => days.includes(d.id))
      .map((d) => d.short)
      .join(', ');
  };

  const handleToggleDayDraft = (dayNum: number) => {
    setDiasSemanaDraft((prev) =>
      prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]
    );
  };

  const handleResetForm = () => {
    setEditingRuleId(null);
    setAsignaturaDraft(defaultSubjectName);
    setClaseIdDraft((activeClassSessions[0]?.id || 1) as ClassSessionId);
    setBloqueDraft('A');
    setEtiquetaDraft('Bloque A · Jornada Escolar Mañana');
    setDiasSemanaDraft([6]);
    setFechaInicioDraft('2026-02-01');
    setFechaFinDraft('2026-12-15');
    setFechaEspecificaDraft('');
    setHoraAperturaDraft('08:00');
    setHoraCierreDraft('08:20');
    setDuracionMinDraft(15);
    setMetodoLlamadoDraft('alerta_panel');
    setAutoIniciarLlamadoDraft(true);
  };

  const handleLoadRuleIntoForm = (rule: RecurringScheduleBlockRule) => {
    setEditingRuleId(rule.id);
    setAsignaturaDraft(rule.asignaturaNombre || defaultSubjectName);
    setClaseIdDraft(rule.claseId || 1);
    setBloqueDraft(rule.bloqueAsistencia || 'A');
    setEtiquetaDraft(rule.etiquetaBloque || '');
    setDiasSemanaDraft(Array.isArray(rule.diasSemana) ? rule.diasSemana : [6]);
    setFechaInicioDraft(rule.fechaInicioVigencia || '2026-02-01');
    setFechaFinDraft(rule.fechaFinVigencia || '2026-12-15');
    setFechaEspecificaDraft(rule.fechaEspecifica || '');
    setHoraAperturaDraft(rule.horaApertura || '08:00');
    setHoraCierreDraft(rule.horaCierre || '08:20');
    setDuracionMinDraft(rule.duracionLlamadoMinutos || 15);
    setMetodoLlamadoAutoDraftSafe(rule.metodoLlamadoAuto || 'alerta_panel');
    setAutoIniciarLlamadoDraft(rule.autoIniciarLlamado !== false);
  };

  const setMetodoLlamadoAutoDraftSafe = (
    m: RecurringScheduleBlockRule['metodoLlamadoAuto']
  ) => {
    setMetodoLlamadoDraft(m);
  };

  const handleSaveRuleForm = (e: React.FormEvent) => {
    e.preventDefault();
    const nowIso = new Date().toISOString();
    const cleanSubject = asignaturaDraft.trim() || defaultSubjectName;
    const cleanLabel =
      etiquetaDraft.trim() ||
      `Bloque ${bloqueDraft} · Clase C${claseIdDraft} (${horaAperturaDraft})`;
    const safeDur = Math.max(1, Math.min(180, Number(duracionMinDraft) || 15));

    const newRule: RecurringScheduleBlockRule = {
      id: editingRuleId || `SCHED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      asignaturaNombre: cleanSubject,
      claseId: claseIdDraft,
      bloqueAsistencia: bloqueDraft,
      etiquetaBloque: cleanLabel,
      diasSemana: diasSemanaDraft.length > 0 ? diasSemanaDraft : [1, 2, 3, 4, 5, 6],
      fechaInicioVigencia: fechaInicioDraft || '2026-01-01',
      fechaFinVigencia: fechaFinDraft || '2026-12-31',
      fechaEspecifica: fechaEspecificaDraft.trim() || '',
      horaApertura: horaAperturaDraft || '08:00',
      horaCierre: horaCierreDraft || '08:20',
      duracionLlamadoMinutos: safeDur,
      metodoLlamadoAuto: metodoLlamadoDraft,
      autoIniciarLlamado: autoIniciarLlamadoDraft,
      activo: true
    };

    const nextRules = editingRuleId
      ? scheduleRules.map((r) => (r.id === editingRuleId ? newRule : r))
      : [...scheduleRules, newRule];

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaAutomaticaHorarioActiva: true,
      bloquesHorariosRecurrentes: nextRules
    });

    showNotice(
      editingRuleId
        ? `✅ Bloque horario recurrente «${cleanLabel}» actualizado para ${cleanSubject}.`
        : `✅ Nuevo bloque horario recurrente «${cleanLabel}» agregado para ${cleanSubject}.`
    );
    handleResetForm();
  };

  const handleToggleGlobalAutomation = (nextActive: boolean) => {
    const nowIso = new Date().toISOString();
    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      aperturaAutomaticaHorarioActiva: nextActive,
      bloquesHorariosRecurrentes: scheduleRules
    });
    showNotice(
      nextActive
        ? '🟢 Automatización de apertura de clases por horario escolar HABILITADA.'
        : '⚪ Automatización de apertura de clases por horario escolar PAUSADA.'
    );
  };

  const handleToggleRuleActive = (ruleId: string) => {
    const nowIso = new Date().toISOString();
    const nextRules = scheduleRules.map((r) =>
      r.id === ruleId ? { ...r, activo: !r.activo } : r
    );
    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      bloquesHorariosRecurrentes: nextRules
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    const nowIso = new Date().toISOString();
    const nextRules = scheduleRules.filter((r) => r.id !== ruleId);
    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      bloquesHorariosRecurrentes: nextRules
    });
    if (editingRuleId === ruleId) {
      handleResetForm();
    }
    showNotice('🗑️ Bloque horario recurrente eliminado.');
  };

  const handleTriggerRuleNow = (rule: RecurringScheduleBlockRule) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const safeMin = Math.max(1, Math.min(180, Number(rule.duracionLlamadoMinutos) || 15));
    const expIso = new Date(now.getTime() + safeMin * 60 * 1000).toISOString();
    const targetClaseId = (rule.claseId || 1) as ClassSessionId;
    const targetBloque = rule.bloqueAsistencia || 'A';

    const nextApertura: ActiveClassOpeningConfig = {
      abierta: true,
      claseId: targetClaseId,
      bloque: targetBloque,
      duracionMinutos: safeMin,
      iniciadaAtIso: nowIso,
      expiraAtIso: expIso,
      metodoPrincipal: rule.metodoLlamadoAuto || 'alerta_panel',
      origenApertura: 'automatico_horario_escolar',
      bloqueHorarioReglaId: rule.id
    };

    const nextRecords = rule.autoIniciarLlamado
      ? syncedDataset.records.map((rec) => {
          const prevClass = rec.clases[targetClaseId] || {
            claseId: targetClaseId,
            bloque1Asistio: true,
            bloque2Asistio: true,
            asistenciaB1Estado: 'sin_registrar',
            asistenciaB2Estado: 'sin_registrar',
            comportamiento: 5.0,
            participacion: 5.0,
            examen: 5.0,
            trabajoPractico: 5.0,
            notaFinal: 5.0,
            autoCalcularNotaFinal: true,
            observacionDocente: ''
          };
          const cleanDigits = String(rec.studentId || '').replace(/\D+/g, '').slice(-4) || '0000';
          const code =
            prevClass.llamadoVirtualCodigoUnico || `ASIS-C${targetClaseId}-${cleanDigits}`;
          return {
            ...rec,
            ultimaActualizacionIso: nowIso,
            clases: {
              ...rec.clases,
              [targetClaseId]: {
                ...prevClass,
                llamadoVirtualActivo: true,
                llamadoVirtualBloque:
                  targetBloque === 'AB' ? 'ambos' : targetBloque === 'B' ? 2 : 1,
                llamadoVirtualEmitidoAtIso: nowIso,
                llamadoVirtualExpiraAtIso: expIso,
                llamadoVirtualDuracionMin: safeMin,
                llamadoVirtualMetodo: rule.metodoLlamadoAuto || 'alerta_panel',
                llamadoVirtualCodigoUnico: code,
                asistenciaB1Estado:
                  targetBloque === 'A' || targetBloque === 'AB'
                    ? 'llamando'
                    : prevClass.asistenciaB1Estado || 'sin_registrar',
                asistenciaB2Estado:
                  targetBloque === 'B' || targetBloque === 'AB'
                    ? 'llamando'
                    : prevClass.asistenciaB2Estado || 'sin_registrar'
              }
            }
          };
        })
      : syncedDataset.records;

    onUpdateDataset({
      ...syncedDataset,
      updatedAtIso: nowIso,
      funcionLlamadoAsistenciaHabilitada: true,
      aperturaClaseActiva: nextApertura,
      records: nextRecords
    });

    showNotice(
      `🚀 Apertura ejecutada desde el bloque horario «${rule.etiquetaBloque}» (${rule.asignaturaNombre} · Clase C${targetClaseId} · Bloque ${targetBloque} · ${safeMin} min).`
    );
  };

  const nowDateStr = `${nowClock.getFullYear()}-${String(nowClock.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(nowClock.getDate()).padStart(2, '0')}`;
  const nowTimeStr = `${String(nowClock.getHours()).padStart(2, '0')}:${String(
    nowClock.getMinutes()
  ).padStart(2, '0')}`;
  const nowDayLabel =
    DAY_LABELS.find((d) => d.id === nowClock.getDay())?.full || 'Hoy';

  return (
    <div
      className={`bg-white border-2 border-indigo-200 rounded-2xl ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      } shadow-xs space-y-4 text-xs`}
    >
      {/* Cabecera de Bloques Horarios Recurrentes por Asignatura */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-indigo-100 pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-mono text-[10px] font-extrabold uppercase">
              ⏰ Automatización Basada en Horario Escolar Real
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 font-mono text-[10px] font-bold text-slate-800">
              Reloj del Sistema: {nowDayLabel} {nowDateStr} · {nowTimeStr}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
            Bloques Horarios Recurrentes por Asignatura (Fechas, Días y Horas de Apertura Automática)
          </h3>
          <p className="text-xs text-slate-600">
            Defina los bloques horarios recurrentes o fechas específicas de cada asignatura para que la plataforma abra automáticamente la clase e inicie el llamado de asistencia según el horario escolar real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center rounded-xl border border-indigo-200 bg-slate-100 p-1 gap-1">
            <button
              type="button"
              onClick={() => handleToggleGlobalAutomation(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                isAutoEnabled
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              🟢 Apertura Automática Activa
            </button>
            <button
              type="button"
              onClick={() => handleToggleGlobalAutomation(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-all ${
                !isAutoEnabled
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              ⏸️ Pausar Automatización
            </button>
          </div>
        </div>
      </div>

      {scheduleNotice && (
        <div className="p-3 rounded-xl bg-indigo-950 text-white font-bold flex items-center justify-between">
          <span>{scheduleNotice}</span>
          <button
            type="button"
            onClick={() => setScheduleNotice(null)}
            className="text-indigo-200 hover:text-white cursor-pointer ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* FORMULARIO PARA CREAR O EDITAR UN BLOQUE HORARIO RECURRENTE POR ASIGNATURA */}
      <form
        onSubmit={handleSaveRuleForm}
        className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[11px] uppercase font-extrabold text-indigo-950">
            {editingRuleId
              ? '✏️ Editando Bloque Horario Recurrente Seleccionado'
              : '➕ Agregar Nuevo Bloque Horario Recurrente por Asignatura'}
          </div>
          {editingRuleId && (
            <button
              type="button"
              onClick={handleResetForm}
              className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] cursor-pointer"
            >
              Cancelar edición ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Asignatura */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              1. Asignatura / Curso:
            </label>
            <input
              type="text"
              required
              value={asignaturaDraft}
              onChange={(e) => setAsignaturaDraft(e.target.value)}
              placeholder="Ej: Marketing Digital Estratégico"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
            />
          </div>

          {/* 2. Clase Vinculada */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              2. Clase / Sesión Objetivo:
            </label>
            <select
              value={claseIdDraft}
              onChange={(e) => setClaseIdDraft(Number(e.target.value) as ClassSessionId)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
            >
              {activeClassSessions.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  CLASE C{cs.id} — {cs.shortTitle}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Bloque de Asistencia */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              3. Bloque Horario de Asistencia:
            </label>
            <select
              value={bloqueDraft}
              onChange={(e) => setBloqueDraft(e.target.value as 'A' | 'B' | 'AB')}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
            >
              <option value="A">Bloque A (B1 · Primera franja)</option>
              <option value="B">Bloque B (B2 · Segunda franja)</option>
              <option value="AB">Ambos Bloques A y B al tiempo</option>
            </select>
          </div>

          {/* 4. Nombre / Etiqueta del Bloque */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              4. Etiqueta Descriptiva del Bloque:
            </label>
            <input
              type="text"
              value={etiquetaDraft}
              onChange={(e) => setEtiquetaDraft(e.target.value)}
              placeholder="Ej: Bloque A · Jornada Mañana"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
            />
          </div>
        </div>

        {/* Fila 2: Días de la semana, Fechas de vigencia y Horas de apertura */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end pt-1">
          {/* Selector de Días Recurrentes */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block font-bold text-slate-800">
              5. Días Recurrentes del Horario Escolar:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d) => {
                const selected = diasSemanaDraft.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleToggleDayDraft(d.id)}
                    className={`px-2.5 py-1.5 rounded-xl font-mono text-xs font-extrabold cursor-pointer border transition-colors ${
                      selected
                        ? 'bg-indigo-700 text-white border-indigo-700 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fechas de Vigencia y Fecha Específica */}
          <div className="lg:col-span-4 grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 text-[11px]">
                Fecha Inicio:
              </label>
              <input
                type="date"
                value={fechaInicioDraft}
                onChange={(e) => setFechaInicioDraft(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 text-[11px]">
                Fecha Fin:
              </label>
              <input
                type="date"
                value={fechaFinDraft}
                onChange={(e) => setFechaFinDraft(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <label
                className="block font-bold text-slate-800 text-[11px]"
                title="Opcional: Si elige una fecha exacta, solo se ejecutará en esa fecha específica"
              >
                Fecha Única (Opc.):
              </label>
              <input
                type="date"
                value={fechaEspecificaDraft}
                onChange={(e) => setFechaEspecificaDraft(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Horas y Duración */}
          <div className="lg:col-span-3 grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 text-[11px]">
                Hora Apertura:
              </label>
              <input
                type="time"
                required
                value={horaAperturaDraft}
                onChange={(e) => setHoraAperturaDraft(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px] font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 text-[11px]">
                Hora Límite:
              </label>
              <input
                type="time"
                required
                value={horaCierreDraft}
                onChange={(e) => setHoraCierreDraft(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px] font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="block font-bold text-slate-800 text-[11px]">
                Activo (min):
              </label>
              <input
                type="number"
                min={1}
                max={180}
                value={duracionMinDraft}
                onChange={(e) => setDuracionMinDraft(Math.max(1, Number(e.target.value) || 15))}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-[11px] font-bold text-center"
              />
            </div>
          </div>
        </div>

        {/* Fila 3: Método de Llamado Automático y Botón Guardar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-bold text-slate-800">
              <span>Método de Llamado Automático:</span>
              <select
                value={metodoLlamadoDraft}
                onChange={(e) => setMetodoLlamadoDraft(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
              >
                <option value="alerta_panel">🔔 Alerta en Panel del Estudiante</option>
                <option value="codigo_unico_wa_email">🔑 Código Único WhatsApp/Correo Gratis</option>
                <option value="qr_pin_aula">📲 Código QR / PIN de Aula</option>
                <option value="pregunta_relampago">⚡ Pregunta Relámpago 30s</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoIniciarLlamadoDraft}
                onChange={(e) => setAutoIniciarLlamadoDraft(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span>Iniciar llamado automáticamente a toda la nómina al abrir</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer shadow-2xs shrink-0"
          >
            {editingRuleId
              ? '💾 Guardar Cambios del Bloque Horario'
              : '➕ Guardar Bloque Horario Recurrente'}
          </button>
        </div>
      </form>

      {/* LISTADO DE BLOQUES HORARIOS RECURRENTES CONFIGURADOS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase font-extrabold text-slate-700">
            Bloques Horarios Programados ({scheduleRules.length}):
          </div>
          <span className="text-[11px] text-slate-500">
            Cuando el reloj escolar coincide con un bloque activo, la clase se abre automáticamente.
          </span>
        </div>

        {scheduleRules.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500">
            No hay bloques horarios recurrentes definidos. Utilice el formulario superior para crear el primer bloque horario de la asignatura.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scheduleRules.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-3 transition-all ${
                  rule.activo
                    ? 'bg-indigo-50/40 border-indigo-200'
                    : 'bg-slate-50 border-slate-200 opacity-75'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                          rule.activo
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-300 text-slate-700'
                        }`}
                      >
                        {rule.activo ? '● PROGRAMADO' : '⏸ PAUSADO'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-950 font-mono text-[10px] font-extrabold">
                        CLASE C{rule.claseId} · BLOQUE {rule.bloqueAsistencia}
                      </span>
                      <span className="font-extrabold text-slate-900 text-xs">
                        {rule.asignaturaNombre}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleRuleActive(rule.id)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold cursor-pointer border ${
                        rule.activo
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-emerald-600 border-emerald-600 text-white'
                      }`}
                    >
                      {rule.activo ? 'Pausar' : 'Activar'}
                    </button>
                  </div>

                  <div className="font-bold text-slate-800 text-xs">
                    {rule.etiquetaBloque}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 font-mono text-[11px] text-slate-700">
                    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-slate-500">📅 Días / Fechas: </span>
                      <strong>
                        {rule.fechaEspecifica
                          ? `Fecha única: ${rule.fechaEspecifica}`
                          : `${formatDaysList(rule.diasSemana)} (${rule.fechaInicioVigencia} a ${
                              rule.fechaFinVigencia
                            })`}
                      </strong>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-slate-500">⏰ Hora Escolar: </span>
                      <strong className="text-indigo-800">
                        {rule.horaApertura} – {rule.horaCierre}
                      </strong>{' '}
                      ({rule.duracionLlamadoMinutos} min activo)
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => handleTriggerRuleNow(rule)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] cursor-pointer shadow-2xs"
                    title="Ejecutar inmediatamente la apertura de esta clase y llamado de asistencia con los parámetros de este bloque"
                  >
                    ⚡ Ejecutar Apertura Ahora
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleLoadRuleIntoForm(rule)}
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px] cursor-pointer"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] cursor-pointer"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

