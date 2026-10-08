import React, { useMemo, useState } from 'react';
import {
  StudentRecord,
  ExamAttemptResult,
  SystemConfig,
  LiveClassroomSession,
  ExamModality
} from '../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
  ComposedChart,
  Line
} from 'recharts';
import {
  BarChart3,
  Trophy,
  TrendingUp,
  Users,
  CheckCircle2,
  Activity,
  ChevronDown,
  ChevronUp,
  Search,
  Filter
} from 'lucide-react';

interface TeacherRealtimeSummaryPanelProps {
  students: StudentRecord[];
  attempts: ExamAttemptResult[];
  liveSessions: LiveClassroomSession[];
  config: SystemConfig;
  onNavigateTab?: (tab: any) => void;
}

const GRADE_BUCKET_COLORS = [
  '#dc2626', // 0.0 - 1.9 (Rojo - Insuficiente)
  '#f59e0b', // 2.0 - 2.9 (Ámbar - Bajo)
  '#0284c7', // 3.0 - 3.7 (Azul - Básico)
  '#4f46e5', // 3.8 - 4.4 (Índigo - Destacado)
  '#059669'  // 4.5 - 5.0 (Esmeralda - Superior)
];

export function TeacherRealtimeSummaryPanel({
  students,
  attempts,
  liveSessions,
  config,
  onNavigateTab
}: TeacherRealtimeSummaryPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [examChartMode, setExamChartMode] = useState<'distribucion' | 'ultimos_intentos'>('distribucion');
  const [modalityFilter, setModalityFilter] = useState<'ALL' | ExamModality>('ALL');
  const [retosFilter, setRetosFilter] = useState<'ALL' | 'CON_AVANCE' | 'COMPLETADOS' | 'PENDIENTES'>('ALL');
  const [studentQuery, setStudentQuery] = useState('');

  const minPassing = Number(config.notaMinimaAprobacion) || 3.0;

  // 1. Filtrar intentos de exámenes según modalidad seleccionada
  const filteredAttempts = useMemo(() => {
    const valid = attempts.filter(Boolean);
    const byMod =
      modalityFilter === 'ALL'
        ? valid
        : valid.filter((a) => (a.modalidad || 'integral') === modalityFilter);
    return [...byMod].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  }, [attempts, modalityFilter]);

  // 2. Distribución de calificaciones (Rangos escala colombiana 0.0 a 5.0)
  const gradeDistributionData = useMemo(() => {
    const buckets = [
      { rango: '0.0 - 1.9', nivel: 'Muy Bajo', min: 0, max: 1.99, cantidad: 0, color: GRADE_BUCKET_COLORS[0] },
      { rango: '2.0 - 2.9', nivel: 'Bajo', min: 2.0, max: 2.99, cantidad: 0, color: GRADE_BUCKET_COLORS[1] },
      { rango: '3.0 - 3.7', nivel: 'Básico', min: 3.0, max: 3.79, cantidad: 0, color: GRADE_BUCKET_COLORS[2] },
      { rango: '3.8 - 4.4', nivel: 'Alto', min: 3.8, max: 4.49, cantidad: 0, color: GRADE_BUCKET_COLORS[3] },
      { rango: '4.5 - 5.0', nivel: 'Superior', min: 4.5, max: 5.01, cantidad: 0, color: GRADE_BUCKET_COLORS[4] }
    ];

    // Usar los últimos exámenes registrados (o notas definitivas si no hay filtro)
    const sourceGrades: number[] =
      filteredAttempts.length > 0
        ? filteredAttempts.map((a) => Number(a.notaColombiana) || 0)
        : [];

    sourceGrades.forEach((g) => {
      const clamped = Math.max(0, Math.min(5, g));
      const bucket = buckets.find((b) => clamped >= b.min && clamped <= b.max) || buckets[0];
      bucket.cantidad += 1;
    });

    const total = Math.max(1, sourceGrades.length);
    return buckets.map((b) => ({
      ...b,
      etiqueta: `${b.rango} (${b.nivel})`,
      porcentaje: sourceGrades.length > 0 ? Math.round((b.cantidad / total) * 100) : 0
    }));
  }, [filteredAttempts]);

  // 3. Últimos exámenes entregados (línea de tiempo reciente)
  const recentExamsTimelineData = useMemo(() => {
    return filteredAttempts
      .slice(0, 15)
      .reverse()
      .map((att, idx) => {
        const shortName = (att.studentName || att.studentId)
          .split(' ')
          .slice(0, 2)
          .join(' ');
        return {
          orden: `#${idx + 1}`,
          estudiante: shortName,
          nota: Number((Number(att.notaColombiana) || 0).toFixed(1)),
          porcentajeAcierto: Number(att.porcentaje) || 0,
          modalidad: att.modalidadLabel || att.modalidad || 'Integral',
          intento: `Intento ${att.intentoNumero}`,
          meta: minPassing
        };
      });
  }, [filteredAttempts, minPassing]);

  // 4. Progreso de completitud de los retos por estudiante (Módulos 1 al 5)
  const studentRetosProgressData = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();

    const mapped = students.map((st) => {
      const prog = st.progresoRetos || {};
      let unlockedCount = 0;
      let attemptedModulesCount = 0;
      let totalAttemptsCount = 0;
      let sumBestPct = 0;

      ([1, 2, 3, 4, 5] as const).forEach((m) => {
        const modProg = prog[m];
        if (modProg?.insigniaDesbloqueada) {
          unlockedCount += 1;
        }
        const used = modProg?.intentosUsados || 0;
        const best = modProg?.mejorPorcentaje || 0;
        if (used > 0 || best > 0 || modProg?.insigniaDesbloqueada) {
          attemptedModulesCount += 1;
          totalAttemptsCount += used;
          sumBestPct += best;
        }
      });

      const completitudPct = Math.round((unlockedCount / 5) * 100);
      const afinidadPromedioPct =
        attemptedModulesCount > 0 ? Math.round(sumBestPct / attemptedModulesCount) : 0;

      const nameParts = st.nombre.trim().split(/\s+/);
      const shortName =
        nameParts.length >= 2
          ? `${nameParts[0]} ${nameParts[1].charAt(0)}.`
          : st.nombre.slice(0, 14);

      return {
        id: st.id,
        nombreCompleto: st.nombre,
        estudiante: shortName,
        'Completitud Retos (%)': completitudPct,
        'Afinidad IA Promedio (%)': afinidadPromedioPct,
        insignias: unlockedCount,
        modulosIniciados: attemptedModulesCount,
        intentosTotales: totalAttemptsCount
      };
    });

    const filtered = mapped.filter((item) => {
      if (retosFilter === 'CON_AVANCE' && item.insignias === 0 && item.modulosIniciados === 0) {
        return false;
      }
      if (retosFilter === 'COMPLETADOS' && item.insignias < 5) {
        return false;
      }
      if (retosFilter === 'PENDIENTES' && item.insignias === 5) {
        return false;
      }
      if (!q) return true;
      return (
        item.nombreCompleto.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });

    // Ordenar mostrando primero quienes tienen mayor avance o actividad para visualización inmediata
    return filtered.sort((a, b) => {
      if (b['Completitud Retos (%)'] !== a['Completitud Retos (%)']) {
        return b['Completitud Retos (%)'] - a['Completitud Retos (%)'];
      }
      if (b['Afinidad IA Promedio (%)'] !== a['Afinidad IA Promedio (%)']) {
        return b['Afinidad IA Promedio (%)'] - a['Afinidad IA Promedio (%)'];
      }
      return a.nombreCompleto.localeCompare(b.nombreCompleto);
    });
  }, [students, retosFilter, studentQuery]);

  // 5. Resumen de KPIs en Tiempo Real
  const realtimeKpis = useMemo(() => {
    const avgExamGrade =
      filteredAttempts.length > 0
        ? Number(
            (
              filteredAttempts.reduce((acc, a) => acc + (Number(a.notaColombiana) || 0), 0) /
              filteredAttempts.length
            ).toFixed(2)
          )
        : 0.0;

    const approvedExams = filteredAttempts.filter(
      (a) => a.estado !== 'SUSPENDIDO' && (Number(a.notaColombiana) || 0) >= minPassing
    ).length;

    const approvalRatePct =
      filteredAttempts.length > 0
        ? Math.round((approvedExams / filteredAttempts.length) * 100)
        : 0;

    const totalPossibleBadges = Math.max(1, students.length * 5);
    const totalUnlockedBadges = students.reduce((acc, st) => {
      const count = ([1, 2, 3, 4, 5] as const).filter(
        (m) => st.progresoRetos?.[m]?.insigniaDesbloqueada
      ).length;
      return acc + count;
    }, 0);

    const avgRetosCompletionPct =
      students.length > 0
        ? Math.round((totalUnlockedBadges / totalPossibleBadges) * 100)
        : 0;

    const studentsWithFullRetos = students.filter((st) =>
      ([1, 2, 3, 4, 5] as const).every((m) => st.progresoRetos?.[m]?.insigniaDesbloqueada)
    ).length;

    return {
      avgExamGrade,
      approvedExams,
      approvalRatePct,
      totalUnlockedBadges,
      totalPossibleBadges: students.length * 5,
      avgRetosCompletionPct,
      studentsWithFullRetos
    };
  }, [filteredAttempts, students, minPassing]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Cabecera del Panel de Resumen en Tiempo Real */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 font-semibold">
            <BarChart3 className="w-4 h-4 text-sky-600" />
            <span>Panel de Resumen en Tiempo Real (Recharts)</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-mono">
              ● Sincronizado Automáticamente con BD del Servidor
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Métricas Clave en Vivo: Distribución de Últimos Exámenes y Completitud de Retos por Estudiante
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('estadisticas_grupo')}
              className="px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-sky-700" />
              <span>Ver Analítica Completa</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Mostrar Gráficos en Tiempo Real</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Compactar Resumen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cinta de 4 KPIs Ejecutivos en Tiempo Real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span>Promedio Últimos Exámenes</span>
            <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-xl font-extrabold font-mono text-slate-900">
            {realtimeKpis.avgExamGrade.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ 5.0</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {filteredAttempts.length} examen(es) analizado(s) · Meta ≥ {minPassing.toFixed(1)}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
            <span>Tasa de Aprobación Exámenes</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <div className="text-xl font-extrabold font-mono text-emerald-950">
            {realtimeKpis.approvalRatePct}%
          </div>
          <div className="text-[11px] text-emerald-800">
            {realtimeKpis.approvedExams} de {filteredAttempts.length} entregas aprobadas
          </div>
        </div>

        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900">
            <span>Completitud Global de Retos</span>
            <Trophy className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold font-mono text-amber-950">
            {realtimeKpis.avgRetosCompletionPct}%
          </div>
          <div className="text-[11px] text-amber-800">
            {realtimeKpis.totalUnlockedBadges}/{realtimeKpis.totalPossibleBadges} insignias · {realtimeKpis.studentsWithFullRetos} con 5/5
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900 text-white space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span>Actividad de Aula en Vivo</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold font-mono text-white">
            {liveSessions.length} <span className="text-xs font-normal text-slate-300">en línea</span>
          </div>
          <div className="text-[11px] text-slate-300">
            Matrícula activa: {students.length} estudiantes
          </div>
        </div>
      </div>

      {/* Gráficos Interactivos Recharts */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          {/* GRÁFICO 1: DISTRIBUCIÓN DE CALIFICACIONES DE LOS ÚLTIMOS EXÁMENES */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>Distribución de Calificaciones de los Últimos Exámenes</span>
                </h3>
                <p className="text-[11px] text-slate-600">
                  Escala oficial 0.0 a 5.0 · Actualización inmediata al recibir entregas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={modalityFilter}
                  onChange={(e) => setModalityFilter(e.target.value as 'ALL' | ExamModality)}
                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-800"
                  aria-label="Filtrar por modalidad de examen"
                >
                  <option value="ALL">Todos los Exámenes ({attempts.length})</option>
                  <option value="integral">Examen Integral</option>
                  <option value="mod1">Módulo 1</option>
                  <option value="mod2">Módulo 2</option>
                  <option value="mod3">Módulo 3</option>
                  <option value="mod4">Módulo 4</option>
                  <option value="mod5">Módulo 5</option>
                </select>

                <div className="inline-flex bg-slate-200/80 p-0.5 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setExamChartMode('distribucion')}
                    className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                      examChartMode === 'distribucion'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Por Rangos
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamChartMode('ultimos_intentos')}
                    className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                      examChartMode === 'ultimos_intentos'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Últimas Entregas
                  </button>
                </div>
              </div>
            </div>

            <div className="h-60 w-full bg-white border border-slate-200/80 rounded-lg p-2">
              {examChartMode === 'distribucion' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={gradeDistributionData}
                    margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="rango"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#334155' }}
                    />
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => {
                        if (name === 'Exámenes en Rango') {
                          return [
                            `${value} examen(es) (${props?.payload?.porcentaje ?? 0}%)`,
                            props?.payload?.etiqueta || 'Calificaciones'
                          ];
                        }
                        return [value, name];
                      }}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '11px'
                      }}
                    />
                    <Bar
                      dataKey="cantidad"
                      name="Exámenes en Rango"
                      radius={[6, 6, 0, 0]}
                    >
                      {gradeDistributionData.map((entry, index) => (
                        <Cell key={`grade-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : recentExamsTimelineData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500">
                  <BarChart3 className="w-6 h-6 text-slate-400 mb-1" />
                  <span>Aún no hay entregas de exámenes para la modalidad seleccionada.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={recentExamsTimelineData}
                    margin={{ top: 12, right: 12, left: -12, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="estudiante"
                      tick={{ fontSize: 10, fill: '#334155' }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={42}
                    />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#334155' }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '11px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <ReferenceLine
                      y={minPassing}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{
                        value: `Aprueba ≥ ${minPassing.toFixed(1)}`,
                        position: 'insideTopRight',
                        fill: '#b91c1c',
                        fontSize: 10
                      }}
                    />
                    <Bar
                      dataKey="nota"
                      name="Nota Obtenida (0-5)"
                      fill="#0284c7"
                      radius={[5, 5, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="nota"
                      name="Tendencia"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* GRÁFICO 2: PROGRESO DE COMPLETITUD DE LOS RETOS POR ESTUDIANTE */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Progreso de Completitud de los Retos por Estudiante (5 Módulos)</span>
                </h3>
                <p className="text-[11px] text-slate-600">
                  Porcentaje de retos superados (insignias 1 a 5) y afinidad semántica IA por alumno.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Buscar alumno..."
                    className="pl-7 pr-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] w-32 focus:outline-none focus:ring-1 focus:ring-sky-600"
                  />
                </div>

                <select
                  value={retosFilter}
                  onChange={(e) =>
                    setRetosFilter(
                      e.target.value as 'ALL' | 'CON_AVANCE' | 'COMPLETADOS' | 'PENDIENTES'
                    )
                  }
                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-800"
                  aria-label="Filtrar progreso de retos por estudiante"
                >
                  <option value="ALL">Todos ({students.length})</option>
                  <option value="CON_AVANCE">Con Retos Iniciados</option>
                  <option value="COMPLETADOS">Completados 5/5</option>
                  <option value="PENDIENTES">En Progreso / Pendientes</option>
                </select>
              </div>
            </div>

            <div className="h-60 w-full bg-white border border-slate-200/80 rounded-lg p-2">
              {studentRetosProgressData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500">
                  <Users className="w-6 h-6 text-slate-400 mb-1" />
                  <span>Ningún estudiante coincide con el filtro de retos seleccionado.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={studentRetosProgressData.slice(0, 15)}
                    margin={{ top: 12, right: 12, left: -12, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="estudiante"
                      tick={{ fontSize: 10, fill: '#334155' }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#334155' }} />
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => {
                        if (name === 'Completitud Retos (%)') {
                          const ins = props?.payload?.insignias ?? 0;
                          return [`${value}% (${ins}/5 insignias)`, props?.payload?.nombreCompleto || name];
                        }
                        return [`${value}%`, name];
                      }}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '11px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <ReferenceLine
                      y={100}
                      stroke="#059669"
                      strokeDasharray="3 3"
                    />
                    <Bar
                      dataKey="Completitud Retos (%)"
                      fill="#f59e0b"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="Afinidad IA Promedio (%)"
                      fill="#6366f1"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
