import React, { useState, useMemo } from 'react';
import {
  StudentRecord,
  Question,
  ExamAttemptResult,
  SystemConfig,
  ExamModality
} from '../types';
import {
  getActiveExamModalitiesForConfig,
  computeStudentServerSummary
} from '../utils/academicServerSummary';
import { getEffectiveCourseMetadata } from '../utils/universalCourseEngine';
import { OptionServerSaveBar } from './ServerSaveContext';
import {
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  RotateCcw,
  Lock,
  Unlock,
  Clock,
  Award,
  BookOpen,
  ShieldAlert,
  Download
} from 'lucide-react';

interface TeacherExamsStatusManagerProps {
  students: StudentRecord[];
  onUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>>;
  attempts: ExamAttemptResult[];
  onUpdateAttempts: (next: ExamAttemptResult[]) => void;
  questions: Question[];
  config: SystemConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
}

export function TeacherExamsStatusManager({
  students,
  onUpdateStudents,
  attempts,
  onUpdateAttempts,
  questions,
  config,
  onUpdateConfig
}: TeacherExamsStatusManagerProps) {
  const [subTab, setSubTab] = useState<'estado_matriz' | 'auditoria_intentos' | 'control_examenes'>(
    'estado_matriz'
  );
  const [studentSearch, setStudentSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState<'ALL' | ExamModality>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO'>(
    'ALL'
  );
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [confirmDeleteAttemptId, setConfirmDeleteAttemptId] = useState<string | null>(null);
  const [inspectAttempt, setInspectAttempt] = useState<ExamAttemptResult | null>(null);

  const courseMeta = useMemo(() => getEffectiveCourseMetadata(config), [config]);

  const activeExamModalities = useMemo(() => {
    return getActiveExamModalitiesForConfig(config);
  }, [config]);

  const studentExamRows = useMemo(() => {
    return students.map((st) => {
      const srv = computeStudentServerSummary(st, attempts, config);
      const filteredModalities = srv.detallePorExamen.filter((d) =>
        activeExamModalities.some((m) => m.id === d.modalidad)
      );
      const realizadosCount = filteredModalities.filter((d) => d.realizado).length;
      const aprobadosCount = filteredModalities.filter(
        (d) => d.realizado && d.estadoMejor === 'APROBADO'
      ).length;
      const pendientesCount = Math.max(0, activeExamModalities.length - realizadosCount);
      return {
        student: st,
        summary: srv,
        filteredModalities,
        realizadosCount,
        aprobadosCount,
        pendientesCount
      };
    });
  }, [students, attempts, config, activeExamModalities]);

  const filteredStudentRows = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return studentExamRows.filter((row) => {
      if (!q) return true;
      return (
        row.student.nombre.toLowerCase().includes(q) ||
        row.student.id.toLowerCase().includes(q) ||
        row.student.codigoAcceso.toLowerCase().includes(q)
      );
    });
  }, [studentExamRows, studentSearch]);

  const validStudentIdSet = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  const filteredAttempts = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return attempts
      .filter((att) => validStudentIdSet.has(att.studentId))
      .filter((att) => {
        if (modalityFilter !== 'ALL' && (att.modalidad || 'integral') !== modalityFilter) {
          return false;
        }
        if (statusFilter !== 'ALL' && att.estado !== statusFilter) {
          return false;
        }
        if (!q) return true;
        return (
          att.studentName.toLowerCase().includes(q) ||
          att.studentId.toLowerCase().includes(q) ||
          (att.modalidadLabel || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [attempts, validStudentIdSet, modalityFilter, statusFilter, studentSearch]);

  const kpiStats = useMemo(() => {
    const totalStudents = students.length;
    const totalExpectedExams = totalStudents * activeExamModalities.length;
    const totalCompletedExams = studentExamRows.reduce((acc, r) => acc + r.realizadosCount, 0);
    const totalApprovedExams = studentExamRows.reduce((acc, r) => acc + r.aprobadosCount, 0);
    const totalPendingExams = Math.max(0, totalExpectedExams - totalCompletedExams);
    const validAttempts = attempts.filter((a) => validStudentIdSet.has(a.studentId));
    const avgScore =
      validAttempts.length > 0
        ? Number(
            (
              validAttempts.reduce((acc, a) => acc + (Number(a.notaColombiana) || 0), 0) /
              validAttempts.length
            ).toFixed(2)
          )
        : 0;

    return {
      totalStudents,
      totalExpectedExams,
      totalCompletedExams,
      totalApprovedExams,
      totalPendingExams,
      totalAttemptsCount: validAttempts.length,
      avgScore
    };
  }, [students.length, activeExamModalities.length, studentExamRows, attempts, validStudentIdSet]);

  const handleResetStudentModalityAttempts = (studentId: string, modId: ExamModality) => {
    const remainingAttempts = attempts.filter(
      (a) => !(a.studentId === studentId && (a.modalidad || 'integral') === modId)
    );
    onUpdateAttempts(remainingAttempts);

    onUpdateStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const nextIntentosMod = { ...(st.intentosPorModalidad || {}) };
        delete nextIntentosMod[modId];
        const nextPreguntasMod = { ...(st.preguntasUsadasPorModalidad || {}) };
        delete nextPreguntasMod[modId];
        const nextBlocked = (st.examenesBloqueados || []).filter((m) => m !== modId);
        return {
          ...st,
          intentosUsados: modId === 'integral' ? 0 : st.intentosUsados,
          intentosPorModalidad: nextIntentosMod,
          preguntasUsadasPorModalidad: nextPreguntasMod,
          examenesBloqueados: nextBlocked,
          suspendido: false,
          conceptoInfraccion: '✓ Sin infracciones'
        };
      })
    );

    setFeedbackNotice(
      `✓ Examen (${modId.toUpperCase()}) reiniciado a 0 intentos y desbloqueado para el estudiante ${studentId}.`
    );
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  const handleToggleBlockStudentModality = (studentId: string, modId: ExamModality) => {
    onUpdateStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const currentBlocked = st.examenesBloqueados || [];
        const isBlocked = currentBlocked.includes(modId);
        const nextBlocked = isBlocked
          ? currentBlocked.filter((m) => m !== modId)
          : [...currentBlocked, modId];
        return {
          ...st,
          examenesBloqueados: nextBlocked
        };
      })
    );
  };

  const handleDeleteSingleExamAttempt = (att: ExamAttemptResult) => {
    const nextAttempts = attempts.filter((a) => a.attemptId !== att.attemptId);
    onUpdateAttempts(nextAttempts);

    const modId = (att.modalidad || 'integral') as ExamModality;
    const remainingForStudentMod = nextAttempts.filter(
      (a) => a.studentId === att.studentId && (a.modalidad || 'integral') === modId
    );

    onUpdateStudents((prev) =>
      prev.map((st) => {
        if (st.id !== att.studentId) return st;
        const nextIntentosMod = {
          ...(st.intentosPorModalidad || {}),
          [modId]: remainingForStudentMod.length
        };
        return {
          ...st,
          intentosUsados:
            modId === 'integral' ? remainingForStudentMod.length : st.intentosUsados,
          intentosPorModalidad: nextIntentosMod,
          suspendido: remainingForStudentMod.some((r) => r.estado === 'SUSPENDIDO')
            ? st.suspendido
            : false,
          conceptoInfraccion: remainingForStudentMod.some((r) => r.estado === 'SUSPENDIDO')
            ? st.conceptoInfraccion
            : '✓ Sin infracciones'
        };
      })
    );

    setConfirmDeleteAttemptId(null);
    setFeedbackNotice(
      `✓ Intento #${att.intentoNumero} de ${att.studentName} (${att.modalidadLabel || modId}) eliminado y sincronizado.`
    );
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  const handleExportExamsCsv = () => {
    const headers = [
      'ID Estudiante',
      'Nombre Estudiante',
      'Código Acceso',
      ...activeExamModalities.map((m) => `${m.shortLabel} (Nota / Estado)`),
      'Exámenes Realizados',
      'Exámenes Pendientes',
      'Nota Definitiva Exámenes',
      'Promedio Exámenes Presentados'
    ];

    const rows = filteredStudentRows.map((r) => {
      const modCells = activeExamModalities.map((m) => {
        const d = r.summary.detallePorExamen.find((x) => x.modalidad === m.id);
        if (!d || !d.realizado) return 'SIN PRESENTAR (0 int)';
        return `${d.mejorNota.toFixed(1)} (${d.estadoMejor} - ${d.intentosUtilizados}/${d.maxIntentosPermitidos} int)`;
      });
      return [
        r.student.id,
        r.student.nombre,
        r.student.codigoAcceso,
        ...modCells,
        `${r.realizadosCount}/${activeExamModalities.length}`,
        String(r.pendientesCount),
        r.summary.notaDefinitivaExamenes.toFixed(1),
        r.summary.promedioExamenesPresentados.toFixed(1)
      ];
    });

    const escapeCell = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join(
        '\r\n'
      );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estado_examenes_${courseMeta.codigoCurso}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  return (
    <div className="space-y-6">
      <OptionServerSaveBar
        sectionKey="gestor_docente_examenes_oficiales"
        label={`Gestor Docente de Exámenes Oficiales & Auditoría de Estado (${activeExamModalities.length}/${activeExamModalities.length})`}
        watchValue={{
          attemptsCount: attempts.length,
          studentsCount: students.length,
          examenAbierto: config.examenAbierto,
          notaMinima: config.notaMinimaAprobacion
        }}
      />

      {/* Cabecera Gemela al Gestor Docente de Mini Retos pero 100% enfocada en Exámenes */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-sky-300">
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                Evaluación Sumativa Oficial · Control Exclusivo de Exámenes ({activeExamModalities.length}/{activeExamModalities.length})
              </span>
            </div>
            <h2 className="text-xl font-bold">
              Gestor Docente de Exámenes Oficiales & Auditoría de Estado ({activeExamModalities.length}/{activeExamModalities.length})
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Supervisa en una vista dedicada exclusivamente el estado de presentación, notas, intentos utilizados, bloqueos por modalidad y auditoría pregunta por pregunta de los exámenes del curso{' '}
              <strong>{courseMeta.nombreCurso}</strong>. Alimentado en tiempo real por el banco único de estudiantes ({students.length} registrados).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExamsCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Estado de Exámenes (CSV)</span>
            </button>
          </div>
        </div>

        {/* KPIs Exclusivos de Exámenes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
            <div className="text-[11px] text-slate-400">Modalidades Activas</div>
            <div className="text-lg font-mono font-bold text-sky-300">
              {activeExamModalities.length} Exámenes
            </div>
            <div className="text-[10px] text-slate-400">
              {courseMeta.habilitarExamenIntegral !== false ? 'Integral + Módulos' : 'Solo por Módulos'}
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
            <div className="text-[11px] text-slate-400">Exámenes Realizados</div>
            <div className="text-lg font-mono font-bold text-emerald-400">
              {kpiStats.totalCompletedExams} / {kpiStats.totalExpectedExams}
            </div>
            <div className="text-[10px] text-slate-400">
              {kpiStats.totalApprovedExams} aprobados (≥ {(config.notaMinimaAprobacion ?? 3.0).toFixed(1)})
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
            <div className="text-[11px] text-slate-400">Exámenes Sin Presentar</div>
            <div className="text-lg font-mono font-bold text-amber-300">
              {kpiStats.totalPendingExams} Pendientes
            </div>
            <div className="text-[10px] text-slate-400">
              En nómina de {kpiStats.totalStudents} estudiantes
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5">
            <div className="text-[11px] text-slate-400">Total Intentos Calificados</div>
            <div className="text-lg font-mono font-bold text-white">
              {kpiStats.totalAttemptsCount} Intentos
            </div>
            <div className="text-[10px] text-slate-400">
              Promedio general: {kpiStats.avgScore.toFixed(2)} / 5.0
            </div>
          </div>

          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-400">Estado Sala de Exámenes</div>
            <div className="text-sm font-mono font-bold mt-0.5">
              {config.examenAbierto !== false ? (
                <span className="text-emerald-400">● HABILITADO</span>
              ) : (
                <span className="text-rose-400">■ PAUSADO</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              Reactivos en banco: {questions.length}
            </div>
          </div>
        </div>

        {/* Sub-Pestañas del Gestor de Exámenes */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          {[
            {
              id: 'estado_matriz',
              label: `1. Matriz de Estado por Examen (${activeExamModalities.length}/${activeExamModalities.length})`
            },
            {
              id: 'auditoria_intentos',
              label: `2. Historial y Auditoría de Intentos (${filteredAttempts.length})`
            },
            {
              id: 'control_examenes',
              label: '3. Activación, Parámetros y Bloqueos por Examen'
            }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as typeof subTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                subTab === t.id
                  ? 'bg-sky-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {feedbackNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950 flex items-center justify-between">
          <span>{feedbackNotice}</span>
          <button
            type="button"
            onClick={() => setFeedbackNotice(null)}
            className="text-emerald-800 hover:text-emerald-950 px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* SUB-TAB 1: MATRIZ DE ESTADO DE EXÁMENES POR ESTUDIANTE */}
      {subTab === 'estado_matriz' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Estado de Exámenes por Estudiante ({activeExamModalities.length} Modalidades Activas — Todos los Exámenes del Curso)
              </h3>
              <p className="text-xs text-slate-600">
                Visualice todos los exámenes del curso ({activeExamModalities.map((m) => m.shortLabel).join(', ')}), su calificación en escala 0.0–5.0 («Sin nota» si aún no presenta), intentos utilizados, o reinicie/desbloquee un examen con un clic.
              </p>
            </div>

            <div className="relative w-full lg:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar estudiante por nombre o ID..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          {filteredStudentRows.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
              No hay estudiantes registrados en el banco único o que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="w-full overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3">Estudiante</th>
                    {activeExamModalities.map((mod) => (
                      <th key={mod.id} className="py-2.5 px-2.5 text-center min-w-[125px]">
                        <div className="text-slate-900">{mod.shortLabel}</div>
                        <div className="text-[10px] font-normal text-slate-500 truncate max-w-[135px] mx-auto">
                          {(mod as any).subtitle || 'Nota · Intentos'}
                        </div>
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-center">Avance Exámenes</th>
                    <th className="py-2.5 px-3 text-right">Nota Definitiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudentRows.map(({ student: st, summary, realizadosCount }) => (
                    <tr key={st.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        <div className="font-bold">{st.nombre}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          ID: {st.id} · Cód: {st.codigoAcceso}
                        </div>
                      </td>

                      {activeExamModalities.map((mod) => {
                        const d = summary.detallePorExamen.find((x) => x.modalidad === mod.id);
                        const realizado = Boolean(d?.realizado);
                        const used = d?.intentosUtilizados || 0;
                        const maxInt = d?.maxIntentosPermitidos || 2;
                        const estado = d?.estadoMejor || 'PENDIENTE';
                        const isBlocked = (st.examenesBloqueados || []).includes(mod.id);

                        return (
                          <td key={mod.id} className="py-2 px-2 text-center font-mono">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  isBlocked
                                    ? 'bg-red-100 text-red-900 border border-red-300'
                                    : realizado && estado === 'APROBADO'
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : realizado && estado === 'SUSPENDIDO'
                                    ? 'bg-red-600 text-white'
                                    : realizado
                                    ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {isBlocked
                                  ? '🔒 BLOQUEADO'
                                  : realizado
                                  ? `${d?.mejorNota.toFixed(1)} (${used}/${maxInt})`
                                  : `Sin nota (0/${maxInt})`}
                              </span>

                              <div className="flex items-center gap-1.5 text-[10px] font-sans">
                                {used > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetStudentModalityAttempts(st.id, mod.id)}
                                    className="text-sky-700 hover:underline font-semibold cursor-pointer"
                                    title="Reiniciar intentos de este examen a 0"
                                  >
                                    Reiniciar 0/{maxInt}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlockStudentModality(st.id, mod.id)}
                                  className={`font-semibold cursor-pointer hover:underline ${
                                    isBlocked ? 'text-emerald-700' : 'text-slate-500'
                                  }`}
                                >
                                  {isBlocked ? 'Desbloquear' : 'Bloquear'}
                                </button>
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        {realizadosCount === activeExamModalities.length ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                            ✓ {realizadosCount}/{activeExamModalities.length} Completos
                          </span>
                        ) : (
                          <span className="text-slate-700">
                            {realizadosCount} / {activeExamModalities.length}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono">
                        {realizadosCount > 0 ? (
                          <>
                            <div className="font-bold text-sm text-slate-900">
                              {summary.notaDefinitivaExamenes.toFixed(1)} / 5.0
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Prom. presentados: {summary.promedioExamenesPresentados.toFixed(1)}
                            </div>
                          </>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-xs font-semibold">
                            Sin nota
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: AUDITORÍA DETALLADA DE INTENTOS DE EXÁMENES */}
      {subTab === 'auditoria_intentos' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Auditoría Docente de Exámenes Calificados ({filteredAttempts.length})
              </h3>
              <p className="text-xs text-slate-600">
                Inspeccione cada intento de examen entregado, tiempos empleados, aciertos, estado anti-trampa, desglose de preguntas o elimine un intento para habilitar nueva presentación.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Filtrar por estudiante..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <select
                value={modalityFilter}
                onChange={(e) => setModalityFilter(e.target.value as 'ALL' | ExamModality)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
              >
                <option value="ALL">Todas las Modalidades</option>
                {activeExamModalities.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="APROBADO">✓ Aprobados</option>
                <option value="REPROBADO">✕ Reprobados</option>
                <option value="SUSPENDIDO">🚨 Suspendidos Anti-Trampa</option>
              </select>
            </div>
          </div>

          {filteredAttempts.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
              No se registran intentos de exámenes con los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {filteredAttempts.map((att) => {
                const minUsed = Math.floor((att.tiempoEmpleadoSegundos || 0) / 60);
                const secUsed = (att.tiempoEmpleadoSegundos || 0) % 60;
                return (
                  <div
                    key={att.attemptId}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {att.studentName} ({att.studentId})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold">
                          {att.modalidadLabel || att.modalidad || 'Examen Integral'} · Intento #{att.intentoNumero}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 font-mono font-bold border border-indigo-200">
                          ⏱️ {minUsed}m {secUsed}s
                        </span>
                        <span className="text-slate-500 font-mono">{att.fecha}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-md font-mono font-bold ${
                            att.estado === 'SUSPENDIDO'
                              ? 'bg-red-600 text-white'
                              : att.estado === 'APROBADO'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-950 border border-amber-300'
                          }`}
                        >
                          {att.notaColombiana.toFixed(1)} / 5.0 ({att.porcentaje}% · {att.aciertos}/
                          {att.totalPreguntas} aciertos · {att.estado})
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setInspectAttempt(
                              inspectAttempt?.attemptId === att.attemptId ? null : att
                            )
                          }
                          className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            {inspectAttempt?.attemptId === att.attemptId
                              ? 'Ocultar Reactivos'
                              : 'Ver Reactivos'}
                          </span>
                        </button>

                        {confirmDeleteAttemptId === att.attemptId ? (
                          <div className="inline-flex items-center gap-1 bg-red-50 border border-red-300 px-2 py-0.5 rounded text-[11px]">
                            <span className="text-red-900 font-bold">¿Borrar intento?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleExamAttempt(att)}
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold cursor-pointer"
                            >
                              Sí, Borrar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAttemptId(null)}
                              className="px-2 py-0.5 bg-white border border-slate-300 text-slate-700 rounded cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAttemptId(att.attemptId)}
                            className="px-2.5 py-1 rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Borrar Intento</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {inspectAttempt?.attemptId === att.attemptId && (
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 mt-2">
                        <div className="font-bold text-slate-900">
                          Desglose de Reactivos Evaluados ({att.respuestasDetalle?.length || 0} preguntas):
                        </div>
                        {!att.respuestasDetalle || att.respuestasDetalle.length === 0 ? (
                          <div className="text-slate-500">
                            Sin detalle de reactivos individuales en este registro.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                            {att.respuestasDetalle.map((rd, idx) => (
                              <div
                                key={`${rd.questionId}-${idx}`}
                                className={`p-2.5 rounded-lg border text-[11px] ${
                                  rd.acierto
                                    ? 'bg-emerald-50/60 border-emerald-200'
                                    : 'bg-red-50/60 border-red-200'
                                }`}
                              >
                                <div className="flex items-center justify-between font-mono font-bold">
                                  <span>
                                    #{idx + 1} · {rd.questionId} (M{rd.modulo})
                                  </span>
                                  <span
                                    className={
                                      rd.acierto ? 'text-emerald-800' : 'text-red-800'
                                    }
                                  >
                                    {rd.acierto ? '✓ Correcta' : '✕ Incorrecta'} (Marcó:{' '}
                                    {rd.elegida || '—'} / Clave: {rd.correcta})
                                  </span>
                                </div>
                                <div className="text-slate-700 mt-1 line-clamp-2">
                                  {rd.enunciado}
                                </div>
                              </div>
                            ))}
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

      {/* SUB-TAB 3: CONTROL DE EXÁMENES, TIEMPOS Y CANTIDAD DE PREGUNTAS */}
      {subTab === 'control_examenes' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-sky-700" />
                <span>1. Estado Maestro de Sala de Exámenes & Nota Mínima</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      examenAbierto: true
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.examenAbierto !== false
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  ✓ Habilitar Sala de Exámenes para TODOS
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      examenAbierto: false
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.examenAbierto === false
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  🔒 Pausar Sala de Exámenes
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                <label className="space-y-1">
                  <span className="font-bold text-slate-700">Nota Mínima Aprobatoria (0.0–5.0):</span>
                  <input
                    type="number"
                    step="0.1"
                    min={1.0}
                    max={5.0}
                    value={config.notaMinimaAprobacion ?? 3.0}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        notaMinimaAprobacion: Math.min(
                          5.0,
                          Math.max(1.0, Number(e.target.value) || 3.0)
                        )
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-slate-700">PIN de Aula del Día:</span>
                  <input
                    type="text"
                    maxLength={12}
                    value={config.pinAulaDia || 'AULA26'}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        pinAulaDia: e.target.value.toUpperCase()
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold uppercase"
                  />
                </label>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-700" />
                <span>2. Parámetros de Reactivos y Duración de Exámenes</span>
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="font-bold text-slate-700">Preguntas Examen Integral:</span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={config.preguntasExamenIntegral ?? 40}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        preguntasExamenIntegral: Math.max(5, Number(e.target.value) || 40)
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-slate-700">Duración Integral (min):</span>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={config.tiempoExamenIntegralMin ?? 80}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        tiempoExamenIntegralMin: Math.max(5, Number(e.target.value) || 80)
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-slate-700">Preguntas Examen Módulo:</span>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={config.preguntasExamenModulo ?? 25}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        preguntasExamenModulo: Math.max(5, Number(e.target.value) || 25)
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-bold text-slate-700">Duración Módulo (min):</span>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={config.tiempoExamenModuloMin ?? 50}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        tiempoExamenModuloMin: Math.max(5, Number(e.target.value) || 50)
                      }))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
