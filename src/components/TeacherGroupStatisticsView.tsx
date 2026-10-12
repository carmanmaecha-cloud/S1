import React, { useMemo, useState } from 'react';
import {
  StudentRecord,
  ExamAttemptResult,
  SystemConfig,
  BloomLevel,
  ABProProjectEvaluation,
  Question
} from '../types';
import { AcademicDataset, ClassSessionId } from '../data/classAttendanceAndGrades';
import { OptionServerSaveBar } from './ServerSaveContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  CheckCircle2,
  Trophy,
  Activity,
  AlertTriangle,
  Search
} from 'lucide-react';

interface TeacherGroupStatisticsViewProps {
  students: StudentRecord[];
  attempts: ExamAttemptResult[];
  abproEvaluations: ABProProjectEvaluation[];
  config: SystemConfig;
  academicDataset?: AcademicDataset;
  questions?: Question[];
}

const COMPETENCY_COLORS = {
  sobresaliente: '#059669', // emerald-600
  destacado: '#0284c7', // sky-600
  basico: '#d97706', // amber-600
  insuficiente: '#dc2626', // red-600
  sinPresentar: '#94a3b8' // slate-400
};

export function TeacherGroupStatisticsView({
  students,
  attempts,
  abproEvaluations,
  config,
  academicDataset,
  questions = []
}: TeacherGroupStatisticsViewProps) {
  const minPassing = Number(config.notaMinimaAprobacion) || 3.0;
  const [psychometricFilter, setPsychometricFilter] = useState<
    'all' | 'critical_fail' | 'ambiguous_disc' | 'evaluated_only'
  >('all');
  const [psychometricModuleFilter, setPsychometricModuleFilter] = useState<number | 'all'>('all');
  const [psychometricSearch, setPsychometricSearch] = useState<string>('');

  // 1. Consolidate per-student progress, historical grades & competency level
  const studentAnalytics = useMemo(() => {
    return students.map((st) => {
      const stAttempts = attempts
        .filter((a) => a && a.studentId === st.id)
        .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

      const att1 = stAttempts.find((a) => a.intentoNumero === 1) || stAttempts[0] || null;
      const att2 = stAttempts.find((a) => a.intentoNumero === 2) || stAttempts[1] || null;

      let notaDefinitiva = 0;
      if (st.suspendido) {
        notaDefinitiva = 0.0;
      } else if (stAttempts.length > 0) {
        notaDefinitiva = Math.max(...stAttempts.map((a) => Number(a.notaColombiana) || 0));
      }

      // Badges unlocked (0 to 5)
      const unlockedBadges = ([1, 2, 3, 4, 5] as const).filter(
        (m) => st.progresoRetos?.[m]?.insigniaDesbloqueada
      ).length;

      // ABPro evaluation if present
      const abpro = abproEvaluations.find((ev) => ev.studentId === st.id);

      // Overall course progress % for this student:
      // 60% from exam completion + 40% from Mini Retos badges (or 100% if exam presented & badges progressed)
      const examProgressPct = stAttempts.length > 0 ? 100 : 0;
      const retosProgressPct = Math.round((unlockedBadges / 5) * 100);
      const progresoIntegralPct = Math.round(examProgressPct * 0.6 + retosProgressPct * 0.4);

      let nivelCompetencia:
        | 'Superior / Sobresaliente (4.5 - 5.0)'
        | 'Alto / Destacado (3.8 - 4.4)'
        | 'Básico / Aceptable (3.0 - 3.7)'
        | 'En Proceso / Bajo (< 3.0)'
        | 'Pendiente por Evaluar' = 'Pendiente por Evaluar';

      let shortCompetencia:
        | 'Sobresaliente'
        | 'Destacado'
        | 'Básico'
        | 'En Proceso'
        | 'Sin Evaluar' = 'Sin Evaluar';

      if (stAttempts.length > 0 || st.suspendido) {
        if (notaDefinitiva >= 4.5) {
          nivelCompetencia = 'Superior / Sobresaliente (4.5 - 5.0)';
          shortCompetencia = 'Sobresaliente';
        } else if (notaDefinitiva >= 3.8) {
          nivelCompetencia = 'Alto / Destacado (3.8 - 4.4)';
          shortCompetencia = 'Destacado';
        } else if (notaDefinitiva >= minPassing) {
          nivelCompetencia = 'Básico / Aceptable (3.0 - 3.7)';
          shortCompetencia = 'Básico';
        } else {
          nivelCompetencia = 'En Proceso / Bajo (< 3.0)';
          shortCompetencia = 'En Proceso';
        }
      }

      return {
        student: st,
        attemptsCount: stAttempts.length,
        notaIntento1: att1 ? Number(att1.notaColombiana.toFixed(1)) : null,
        notaIntento2: att2 ? Number(att2.notaColombiana.toFixed(1)) : null,
        notaDefinitiva: Number(notaDefinitiva.toFixed(1)),
        notaABPro: abpro
          ? Number(
              (
                (abpro.insumo1Mapeo +
                  abpro.insumo2Journey +
                  abpro.insumo3Investigacion +
                  abpro.insumo4Segmentacion +
                  abpro.insumo5Omnicanal) /
                5
              ).toFixed(1)
            )
          : null,
        unlockedBadges,
        progresoIntegralPct,
        nivelCompetencia,
        shortCompetencia
      };
    });
  }, [students, attempts, abproEvaluations, minPassing]);

  // 2. Global Cohort KPIs
  const globalKpis = useMemo(() => {
    const evaluated = studentAnalytics.filter(
      (s) => s.attemptsCount > 0 || s.student.suspendido
    );
    const approved = evaluated.filter(
      (s) => !s.student.suspendido && s.notaDefinitiva >= minPassing
    );
    const avgGrade =
      evaluated.length > 0
        ? Number(
            (
              evaluated.reduce((acc, s) => acc + s.notaDefinitiva, 0) / evaluated.length
            ).toFixed(2)
          )
        : 0.0;
    const approvalRatePct =
      evaluated.length > 0 ? Math.round((approved.length / evaluated.length) * 100) : 0;
    const avgCohortProgressPct =
      studentAnalytics.length > 0
        ? Math.round(
            studentAnalytics.reduce((acc, s) => acc + s.progresoIntegralPct, 0) /
              studentAnalytics.length
          )
        : 0;
    const totalBadgesUnlocked = studentAnalytics.reduce(
      (acc, s) => acc + s.unlockedBadges,
      0
    );

    return {
      totalStudents: students.length,
      evaluatedCount: evaluated.length,
      approvedCount: approved.length,
      avgGrade,
      approvalRatePct,
      avgCohortProgressPct,
      totalBadgesUnlocked
    };
  }, [studentAnalytics, students.length, minPassing]);

  // 3. Chart Data 1: Progreso Promedio y Dominio por Módulo Curricular (Módulos 1 al 5)
  const moduleProgressData = useMemo(() => {
    const moduleNames: Record<number, string> = {
      1: 'Mód. 1: Mapeo',
      2: 'Mód. 2: Consumidor',
      3: 'Mód. 3: Investigación',
      4: 'Mód. 4: Segmentación',
      5: 'Mód. 5: Tendencias'
    };

    return ([1, 2, 3, 4, 5] as const).map((mod) => {
      let totalQ = 0;
      let correctQ = 0;
      attempts.forEach((att) => {
        const detalles = Array.isArray(att?.respuestasDetalle) ? att.respuestasDetalle : [];
        detalles.forEach((r) => {
          if (r && Number(r.modulo) === mod) {
            totalQ += 1;
            if (r.acierto) correctQ += 1;
          }
        });
      });

      const examAccuracyPct = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

      // Mini Retos progress for this module across all students
      let badgesInMod = 0;
      let sumBestRetoPct = 0;
      let studentsWithRetoAttempt = 0;

      students.forEach((st) => {
        const prog = st.progresoRetos?.[mod];
        if (prog?.insigniaDesbloqueada) {
          badgesInMod += 1;
        }
        if (prog && (prog.intentosUsados > 0 || prog.mejorPorcentaje > 0)) {
          studentsWithRetoAttempt += 1;
          sumBestRetoPct += prog.mejorPorcentaje || 0;
        }
      });

      const retosAvgScorePct =
        studentsWithRetoAttempt > 0
          ? Math.round(sumBestRetoPct / studentsWithRetoAttempt)
          : 0;
      const badgeCoveragePct =
        students.length > 0 ? Math.round((badgesInMod / students.length) * 100) : 0;

      return {
        modulo: moduleNames[mod],
        'Dominio Examen (%)': examAccuracyPct,
        'Afinidad Mini Retos (%)': retosAvgScorePct,
        'Cobertura Insignias (%)': badgeCoveragePct,
        reactivosEvaluados: totalQ
      };
    });
  }, [attempts, students]);

  // 4. Chart Data 2: Notas Históricas por Estudiante / Entregas (Intento 1 vs Intento 2 vs Definitiva)
  const historicalGradesChartData = useMemo(() => {
    const withAttempts = studentAnalytics.filter(
      (s) => s.attemptsCount > 0 || s.student.suspendido
    );
    const sourceList =
      withAttempts.length > 0 ? withAttempts : studentAnalytics.slice(0, 12);

    return sourceList.slice(0, 20).map((item, idx) => {
      const shortName = item.student.nombre
        .split(' ')
        .slice(0, 2)
        .join(' ');
      return {
        index: idx + 1,
        estudiante: shortName || item.student.id,
        id: item.student.id,
        'Intento 1': item.notaIntento1 ?? 0,
        'Intento 2': item.notaIntento2 ?? item.notaIntento1 ?? 0,
        'Nota Definitiva': item.notaDefinitiva,
        'Meta Aprobación': minPassing
      };
    });
  }, [studentAnalytics, minPassing]);

  // 5. Chart Data 3: Distribución del Nivel de Competencia Alcanzado (PieChart / Bar)
  const competencyDistributionData = useMemo(() => {
    const counts = {
      Sobresaliente: 0,
      Destacado: 0,
      Básico: 0,
      'En Proceso': 0,
      'Sin Evaluar': 0
    };

    studentAnalytics.forEach((s) => {
      counts[s.shortCompetencia] += 1;
    });

    return [
      {
        name: 'Superior / Sobresaliente (4.5 - 5.0)',
        shortName: 'Sobresaliente',
        estudiantes: counts.Sobresaliente,
        color: COMPETENCY_COLORS.sobresaliente
      },
      {
        name: 'Alto / Destacado (3.8 - 4.4)',
        shortName: 'Destacado',
        estudiantes: counts.Destacado,
        color: COMPETENCY_COLORS.destacado
      },
      {
        name: `Básico / Aceptable (${minPassing.toFixed(1)} - 3.7)`,
        shortName: 'Básico',
        estudiantes: counts.Básico,
        color: COMPETENCY_COLORS.basico
      },
      {
        name: `En Proceso / Bajo (< ${minPassing.toFixed(1)})`,
        shortName: 'En Proceso',
        estudiantes: counts['En Proceso'],
        color: COMPETENCY_COLORS.insuficiente
      },
      {
        name: 'Sin Presentar Aún',
        shortName: 'Sin Evaluar',
        estudiantes: counts['Sin Evaluar'],
        color: COMPETENCY_COLORS.sinPresentar
      }
    ];
  }, [studentAnalytics, minPassing]);

  // 6. Chart Data 4: Nivel de Competencia Cognitiva según Taxonomía de Bloom (RadarChart)
  const bloomCompetencyRadarData = useMemo(() => {
    const levels: BloomLevel[] = [
      'Conocer',
      'Comprensión',
      'Aplicación',
      'Análisis',
      'Evaluación'
    ];
    return levels.map((lvl) => {
      let total = 0;
      let correct = 0;
      attempts.forEach((att) => {
        const detalles = Array.isArray(att?.respuestasDetalle) ? att.respuestasDetalle : [];
        detalles.forEach((r) => {
          if (r && r.bloom === lvl) {
            total += 1;
            if (r.acierto) correct += 1;
          }
        });
      });
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      return {
        nivel: lvl,
        'Logro del Grupo (%)': pct,
        'Meta Curricular (%)': 70,
        reactivos: total
      };
    });
  }, [attempts]);

  return (
    <div className="space-y-6">
      <OptionServerSaveBar
        sectionKey="estadisticas_grupo_recharts"
        label="Estadísticas del Grupo, Progreso Promedio y Nivel de Competencia"
        watchValue={{
          evaluated: globalKpis.evaluatedCount,
          avgGrade: globalKpis.avgGrade,
          avgProgress: globalKpis.avgCohortProgressPct,
          badges: globalKpis.totalBadgesUnlocked
        }}
      />

      {/* Encabezado Principal */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analítica Visual Interactiva Recharts · Tiempo Real desde el Servidor</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Estadísticas del Grupo: Progreso Promedio, Notas Históricas y Nivel de Competencia
            </h2>
            <p className="text-xs text-slate-600">
              Monitoreo integral del rendimiento académico de la cohorte en escala oficial colombiana (0.0 a 5.0), avance por módulos y nivel de competencia alcanzado.
            </p>
          </div>
        </div>

        {/* Tarjetas KPI de Resumen Ejecutivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Progreso Promedio Grupo</span>
              <Activity className="w-4 h-4 text-sky-600" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-slate-900">
              {globalKpis.avgCohortProgressPct}%
            </div>
            <div className="text-[11px] text-slate-600">
              Avance ponderado (Exámenes + Retos)
            </div>
          </div>

          <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 space-y-1">
            <div className="flex items-center justify-between text-xs text-sky-900 font-semibold">
              <span>Promedio Histórico Notas</span>
              <TrendingUp className="w-4 h-4 text-sky-700" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-sky-950">
              {globalKpis.avgGrade.toFixed(2)} / 5.0
            </div>
            <div className="text-[11px] text-sky-800">
              Meta mínima de aprobación: {minPassing.toFixed(1)}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
            <div className="flex items-center justify-between text-xs text-emerald-900 font-semibold">
              <span>Tasa de Aprobación</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-950">
              {globalKpis.approvalRatePct}%
            </div>
            <div className="text-[11px] text-emerald-800">
              {globalKpis.approvedCount} de {globalKpis.evaluatedCount} evaluados aprobaron
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
            <div className="flex items-center justify-between text-xs text-amber-900 font-semibold">
              <span>Insignias Desbloqueadas</span>
              <Trophy className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-amber-950">
              {globalKpis.totalBadgesUnlocked} / {globalKpis.totalStudents * 5}
            </div>
            <div className="text-[11px] text-amber-800">
              Medallero acumulado del curso
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span>Cobertura de Evaluación</span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-extrabold font-mono text-white">
              {globalKpis.evaluatedCount} / {globalKpis.totalStudents}
            </div>
            <div className="text-[11px] text-slate-300">
              {attempts.length} entregas totales en servidor
            </div>
          </div>
        </div>
      </div>

      {/* COMPARATIVA HISTÓRICA ENTRE CORTES / CLASES CON INDICADORES DE TENDENCIA (▲ SUBIÓ / ▼ BAJÓ) */}
      {(() => {
        const activeClasses =
          Array.isArray(academicDataset?.classSessions) &&
          academicDataset!.classSessions.length > 0
            ? academicDataset!.classSessions
            : [
                { id: 1 as ClassSessionId, code: 'C1', shortTitle: 'Módulo / Clase 1' },
                { id: 2 as ClassSessionId, code: 'C2', shortTitle: 'Módulo / Clase 2' },
                { id: 3 as ClassSessionId, code: 'C3', shortTitle: 'Módulo / Clase 3' },
                { id: 4 as ClassSessionId, code: 'C4', shortTitle: 'Módulo / Clase 4' },
                { id: 5 as ClassSessionId, code: 'C5', shortTitle: 'Módulo / Clase 5' }
              ];

        const recs = Array.isArray(academicDataset?.records) ? academicDataset!.records : [];
        const totalRecs = Math.max(1, recs.length || students.length);

        const classTrends = activeClasses.map((cs, idx) => {
          // Asistencia % en esta clase
          let attendedCount = 0;
          let sumWorkGrade = 0;
          let gradedCount = 0;

          if (recs.length > 0) {
            recs.forEach((r) => {
              const c = r.clases?.[cs.id];
              const b1Fall = c?.asistenciaB1Estado === 'falla';
              const b2Fall = c?.asistenciaB2Estado === 'falla';
              if (!b1Fall && !b2Fall) attendedCount += 1;
              if (c && Number(c.trabajoNota) > 0) {
                sumWorkGrade += Number(c.trabajoNota);
                gradedCount += 1;
              }
            });
          } else {
            // Fallback from moduleProgressData
            const modProg = moduleProgressData[idx];
            attendedCount = Math.round(((modProg?.['Dominio Examen (%)'] || 75) / 100) * totalRecs);
          }

          const attendancePct =
            recs.length > 0
              ? Math.round((attendedCount / totalRecs) * 100)
              : moduleProgressData[idx]?.['Dominio Examen (%)'] || 0;

          const avgClassGrade =
            gradedCount > 0
              ? Number((sumWorkGrade / gradedCount).toFixed(1))
              : Number((((moduleProgressData[idx]?.['Dominio Examen (%)'] || 70) / 100) * 5).toFixed(1));

          const participationPct = Math.round(
            attendancePct * 0.65 + (gradedCount > 0 ? (gradedCount / totalRecs) * 100 : attendancePct) * 0.35
          );

          return {
            id: cs.id,
            code: cs.code || `C${cs.id}`,
            title: cs.shortTitle || `Clase ${cs.id}`,
            attendancePct,
            avgClassGrade,
            participationPct
          };
        });

        const enrichedTrends = classTrends.map((curr, idx) => {
          const prev = idx > 0 ? classTrends[idx - 1] : null;
          const diffAttendance = prev ? curr.attendancePct - prev.attendancePct : 0;
          const diffParticipation = prev ? curr.participationPct - prev.participationPct : 0;
          const diffGrade = prev ? Number((curr.avgClassGrade - prev.avgClassGrade).toFixed(1)) : 0;
          return {
            ...curr,
            hasPrev: Boolean(prev),
            prevCode: prev?.code || '',
            diffAttendance,
            diffParticipation,
            diffGrade
          };
        });

        const latestWithPrev =
          enrichedTrends.length > 1
            ? enrichedTrends[enrichedTrends.length - 1]
            : enrichedTrends[0];

        return (
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-mono text-[10px] font-extrabold uppercase">
                  <span>📈 Comparativa Histórica entre Cortes / Clases</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Evolución y Tendencia de Participación, Asistencia y Nota Promedio entre Clases (C1 a C{activeClasses.length})
                </h3>
                <p className="text-xs text-slate-600">
                  Indicadores automáticos de variación porcentual (<strong>▲ Subió</strong> / <strong>▼ Bajó</strong> respecto a la jornada anterior) para identificar si la participación del grupo está mejorando o decayendo.
                </p>
              </div>
              {latestWithPrev && latestWithPrev.hasPrev && (
                <div
                  className={`px-3.5 py-2 rounded-xl border font-mono text-xs font-extrabold shrink-0 ${
                    latestWithPrev.diffParticipation >= 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  {latestWithPrev.diffParticipation > 0
                    ? `▲ Subió +${latestWithPrev.diffParticipation}% en ${latestWithPrev.code} vs ${latestWithPrev.prevCode}`
                    : latestWithPrev.diffParticipation < 0
                    ? `▼ Bajó ${latestWithPrev.diffParticipation}% en ${latestWithPrev.code} vs ${latestWithPrev.prevCode}`
                    : `● Estable (0%) en ${latestWithPrev.code} vs ${latestWithPrev.prevCode}`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {enrichedTrends.map((item) => {
                const isUp = item.diffParticipation > 0;
                const isDown = item.diffParticipation < 0;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3.5 space-y-2 ${
                      isUp
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : isDown
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-extrabold">
                        {item.code}
                      </span>
                      {item.hasPrev ? (
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold ${
                            isUp
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : isDown
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isUp
                            ? `▲ Subió +${item.diffParticipation}%`
                            : isDown
                            ? `▼ Bajó ${item.diffParticipation}%`
                            : '● Estable 0%'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">Corte Inicial</span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate" title={item.title}>
                      {item.title}
                    </div>

                    <div className="space-y-1 pt-1 border-t border-slate-200/80 text-[11px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Participación:</span>
                        <span className="font-extrabold text-slate-900">{item.participationPct}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Asistencia:</span>
                        <span className="font-bold text-indigo-700">
                          {item.attendancePct}%{' '}
                          {item.hasPrev && item.diffAttendance !== 0 && (
                            <span
                              className={
                                item.diffAttendance > 0 ? 'text-emerald-700' : 'text-rose-700'
                              }
                            >
                              ({item.diffAttendance > 0 ? `+${item.diffAttendance}%` : `${item.diffAttendance}%`})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Nota Promedio:</span>
                        <span className="font-bold text-emerald-800">
                          {item.avgClassGrade.toFixed(1)}{' '}
                          {item.hasPrev && item.diffGrade !== 0 && (
                            <span
                              className={item.diffGrade > 0 ? 'text-emerald-700' : 'text-rose-700'}
                            >
                              ({item.diffGrade > 0 ? `+${item.diffGrade}` : `${item.diffGrade}`})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* FILA 1 DE GRÁFICOS RECHARTS: PROGRESO POR MÓDULO + NOTAS HISTÓRICAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Progreso Promedio por Módulo Curricular (BarChart) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-700" />
              <span>1. Progreso Promedio y Dominio por Módulo (Módulos 1 al 5)</span>
            </h3>
            <p className="text-xs text-slate-600">
              Comparativa entre el porcentaje de acierto en exámenes oficiales, afinidad semántica en Mini Retos y cobertura de insignias.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={moduleProgressData}
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="modulo" tick={{ fontSize: 11, fill: '#334155' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#334155' }} unit="%" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={60}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Meta 60%',
                    position: 'insideTopRight',
                    fill: '#b45309',
                    fontSize: 11
                  }}
                />
                <Bar
                  dataKey="Dominio Examen (%)"
                  fill="#0284c7"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="Afinidad Mini Retos (%)"
                  fill="#059669"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="Cobertura Insignias (%)"
                  fill="#f59e0b"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Evolución de Notas Históricas (LineChart Intento 1 vs Intento 2 vs Nota Definitiva) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
              <span>2. Notas Históricas por Estudiante (Intento 1, Intento 2 y Definitiva)</span>
            </h3>
            <p className="text-xs text-slate-600">
              Curva histórica de calificaciones en escala oficial colombiana (0.0 a 5.0) comparada frente a la nota mínima de aprobación ({minPassing.toFixed(1)}).
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={historicalGradesChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="estudiante"
                  tick={{ fontSize: 10, fill: '#334155' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#334155' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <ReferenceLine
                  y={minPassing}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: `Aprueba ≥ ${minPassing.toFixed(1)}`,
                    position: 'insideTopRight',
                    fill: '#b91c1c',
                    fontSize: 11
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Intento 1"
                  stroke="#64748b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Intento 2"
                  stroke="#0284c7"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Nota Definitiva"
                  stroke="#059669"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* FILA 2 DE GRÁFICOS RECHARTS: NIVEL DE COMPETENCIA ALCANZADO + RADAR TAXONOMÍA DE BLOOM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 3: Nivel de Competencia Alcanzado por los Estudiantes (PieChart + Desglose) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-600" />
              <span>3. Nivel de Competencia Alcanzado por los Estudiantes</span>
            </h3>
            <p className="text-xs text-slate-600">
              Clasificación del grupo según el nivel de logro académico alcanzado (Superior/Sobresaliente, Destacado, Básico/Aceptable y En Proceso).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={competencyDistributionData}
                    dataKey="estudiantes"
                    nameKey="shortName"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    {competencyDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2.5 text-xs">
              {competencyDistributionData.map((item, idx) => {
                const pct =
                  students.length > 0
                    ? Math.round((item.estudiantes / students.length) * 100)
                    : 0;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-slate-800">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      {item.estudiantes} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Gráfico 4: Radar de Competencias Cognitivas según Taxonomía de Bloom */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-700" />
              <span>4. Perfil Cognitivo del Grupo (Taxonomía de Bloom)</span>
            </h3>
            <p className="text-xs text-slate-600">
              Nivel de dominio demostrado por los estudiantes en los 5 niveles cognitivos (Conocer, Comprensión, Aplicación, Análisis y Evaluación).
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={bloomCompetencyRadarData}>
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="nivel" tick={{ fontSize: 11, fill: '#1e293b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name="Logro del Grupo (%)"
                  dataKey="Logro del Grupo (%)"
                  stroke="#0284c7"
                  fill="#0284c7"
                  fillOpacity={0.45}
                />
                <Radar
                  name="Meta Curricular (%)"
                  dataKey="Meta Curricular (%)"
                  stroke="#059669"
                  fill="#059669"
                  fillOpacity={0.15}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px'
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ================= ANALÍTICA PSICOMÉTRICA DE ÍTEMS (DETECTOR DE PREGUNTAS CRÍTICAS) ================= */}
      {(() => {
        // Compute per-question psychometric metrics across all attempts + bank questions
        const sortedAttemptsByScore = [...attempts].sort(
          (a, b) => (Number(b.notaColombiana) || 0) - (Number(a.notaColombiana) || 0)
        );
        const totalAtts = sortedAttemptsByScore.length;
        const groupSize = Math.max(1, Math.floor(totalAtts / 3));
        const highGroupAttemptIds = new Set(
          sortedAttemptsByScore.slice(0, groupSize).map((a) => a.attemptId)
        );
        const lowGroupAttemptIds = new Set(
          sortedAttemptsByScore.slice(Math.max(0, totalAtts - groupSize)).map((a) => a.attemptId)
        );

        const itemStatsMap = new Map<
          string,
          {
            questionId: string;
            modulo: number;
            tema: string;
            bloom: BloomLevel;
            enunciado: string;
            opciones: { A: string; B: string; C: string; D: string };
            correcta: 'A' | 'B' | 'C' | 'D';
            totalEvaluated: number;
            correctCount: number;
            wrongCount: number;
            highGroupTotal: number;
            highGroupCorrect: number;
            lowGroupTotal: number;
            lowGroupCorrect: number;
            optionCounts: { A: number; B: number; C: number; D: number; null: number };
          }
        >();

        questions.forEach((q) => {
          itemStatsMap.set(q.id, {
            questionId: q.id,
            modulo: Number(q.modulo) || 1,
            tema: q.tema || 'General',
            bloom: q.bloom || 'Comprensión',
            enunciado: q.enunciado || '',
            opciones: q.opciones || { A: '', B: '', C: '', D: '' },
            correcta: q.respuestaCorrecta || 'A',
            totalEvaluated: 0,
            correctCount: 0,
            wrongCount: 0,
            highGroupTotal: 0,
            highGroupCorrect: 0,
            lowGroupTotal: 0,
            lowGroupCorrect: 0,
            optionCounts: { A: 0, B: 0, C: 0, D: 0, null: 0 }
          });
        });

        attempts.forEach((att) => {
          if (!att || !Array.isArray(att.respuestasDetalle)) return;
          const isHigh = highGroupAttemptIds.has(att.attemptId);
          const isLow = lowGroupAttemptIds.has(att.attemptId);
          att.respuestasDetalle.forEach((ans) => {
            if (!ans || !ans.questionId) return;
            let entry = itemStatsMap.get(ans.questionId);
            if (!entry) {
              entry = {
                questionId: ans.questionId,
                modulo: Number(ans.modulo) || 1,
                tema: ans.tema || 'General',
                bloom: ans.bloom || 'Comprensión',
                enunciado: ans.enunciado || '',
                opciones: ans.opciones || { A: '', B: '', C: '', D: '' },
                correcta: ans.correcta || 'A',
                totalEvaluated: 0,
                correctCount: 0,
                wrongCount: 0,
                highGroupTotal: 0,
                highGroupCorrect: 0,
                lowGroupTotal: 0,
                lowGroupCorrect: 0,
                optionCounts: { A: 0, B: 0, C: 0, D: 0, null: 0 }
              };
              itemStatsMap.set(ans.questionId, entry);
            }
            entry.totalEvaluated += 1;
            if (ans.acierto) {
              entry.correctCount += 1;
            } else {
              entry.wrongCount += 1;
            }
            if (ans.elegida && entry.optionCounts[ans.elegida] !== undefined) {
              entry.optionCounts[ans.elegida] += 1;
            } else {
              entry.optionCounts.null += 1;
            }
            if (isHigh) {
              entry.highGroupTotal += 1;
              if (ans.acierto) entry.highGroupCorrect += 1;
            }
            if (isLow) {
              entry.lowGroupTotal += 1;
              if (ans.acierto) entry.lowGroupCorrect += 1;
            }
          });
        });

        const psychometricItems = Array.from(itemStatsMap.values()).map((it) => {
          // Check option length ratio for structural ambiguity heuristic when empirical data is small
          const optLengths = [
            (it.opciones.A || '').trim().length,
            (it.opciones.B || '').trim().length,
            (it.opciones.C || '').trim().length,
            (it.opciones.D || '').trim().length
          ];
          const correctLen = (it.opciones[it.correcta] || '').trim().length;
          const distractorsAvg =
            (['A', 'B', 'C', 'D'] as const)
              .filter((k) => k !== it.correcta)
              .reduce((acc, k) => acc + (it.opciones[k] || '').trim().length, 0) / 3;
          const lengthRatio = distractorsAvg > 0 ? correctLen / distractorsAvg : 1;
          const hasStructuralAmbiguity =
            lengthRatio > 1.75 || lengthRatio < 0.55 || Math.min(...optLengths) < 12;

          let failureRatePct = 0;
          let difficultyIndexP = 0.5;
          let discriminationIndexD = 0.35;

          if (it.totalEvaluated > 0) {
            failureRatePct = Math.round((it.wrongCount / it.totalEvaluated) * 100);
            difficultyIndexP = Number((it.correctCount / it.totalEvaluated).toFixed(2));
            const pHigh =
              it.highGroupTotal > 0 ? it.highGroupCorrect / it.highGroupTotal : difficultyIndexP;
            const pLow =
              it.lowGroupTotal > 0 ? it.lowGroupCorrect / it.lowGroupTotal : difficultyIndexP * 0.6;
            discriminationIndexD = Number((pHigh - pLow).toFixed(2));
          } else {
            // Heuristic estimation before live attempts so the teacher can still inspect critical/ambiguous items
            const bloomBaseFail: Record<BloomLevel, number> = {
              Conocer: 22,
              Comprensión: 30,
              Aplicación: 42,
              Análisis: 58,
              Evaluación: 68
            };
            failureRatePct = bloomBaseFail[it.bloom] || 35;
            if (hasStructuralAmbiguity) {
              discriminationIndexD = 0.11;
            } else {
              discriminationIndexD = 0.38;
            }
            difficultyIndexP = Number(((100 - failureRatePct) / 100).toFixed(2));
          }

          const isCriticalFail = failureRatePct > 75;
          const isAmbiguous =
            discriminationIndexD < 0.15 || (it.totalEvaluated === 0 && hasStructuralAmbiguity);

          let diagnosticLabel = '✓ Reactivo Calibrado y Confiable';
          let statusTone: 'critical' | 'ambiguous' | 'optimal' = 'optimal';

          if (isCriticalFail && isAmbiguous) {
            diagnosticLabel =
              '🚨 CRÍTICO (>75% Fallo) + Ambiguo (Baja Discriminación D < 0.15)';
            statusTone = 'critical';
          } else if (isCriticalFail) {
            diagnosticLabel = '🚨 ALERTA CRÍTICA: Más del 75% de Fallo Grupal';
            statusTone = 'critical';
          } else if (isAmbiguous) {
            diagnosticLabel =
              '⚠️ REACTIVO AMBIGUO: Baja Discriminación (D < 0.15) o Distractor Asimétrico';
            statusTone = 'ambiguous';
          }

          return {
            ...it,
            failureRatePct,
            difficultyIndexP,
            discriminationIndexD,
            isCriticalFail,
            isAmbiguous,
            hasStructuralAmbiguity,
            diagnosticLabel,
            statusTone
          };
        });

        const criticalFailCount = psychometricItems.filter((i) => i.isCriticalFail).length;
        const ambiguousCount = psychometricItems.filter((i) => i.isAmbiguous).length;
        const evaluatedItemsCount = psychometricItems.filter((i) => i.totalEvaluated > 0).length;
        const avgDiscrimination =
          psychometricItems.length > 0
            ? Number(
                (
                  psychometricItems.reduce((acc, i) => acc + i.discriminationIndexD, 0) /
                  psychometricItems.length
                ).toFixed(2)
              )
            : 0;

        const filteredPsychometricItems = psychometricItems
          .filter((item) => {
            if (psychometricModuleFilter !== 'all' && item.modulo !== psychometricModuleFilter) {
              return false;
            }
            if (psychometricFilter === 'critical_fail' && !item.isCriticalFail) return false;
            if (psychometricFilter === 'ambiguous_disc' && !item.isAmbiguous) return false;
            if (psychometricFilter === 'evaluated_only' && item.totalEvaluated === 0) return false;
            if (psychometricSearch.trim()) {
              const q = psychometricSearch.trim().toLowerCase();
              return (
                item.questionId.toLowerCase().includes(q) ||
                item.enunciado.toLowerCase().includes(q) ||
                item.tema.toLowerCase().includes(q)
              );
            }
            return true;
          })
          .sort((a, b) => {
            if (a.isCriticalFail !== b.isCriticalFail) return a.isCriticalFail ? -1 : 1;
            if (a.isAmbiguous !== b.isAmbiguous) return a.isAmbiguous ? -1 : 1;
            return b.failureRatePct - a.failureRatePct;
          });

        return (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-mono font-extrabold uppercase">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                  <span>5. Analítica Psicométrica de Ítems · Detector de Preguntas Críticas</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Índice de Dificultad (% Fallo Grupal) e Índice de Discriminación ($D$) por Reactivo
                </h3>
                <p className="text-xs text-slate-600">
                  Detecta automáticamente cuáles preguntas presentan <strong>más del 75% de fallo grupal</strong> o son <strong>excesivamente ambiguas</strong> (Índice de Discriminación $D &lt; 0.15$ entre el grupo de alto y bajo desempeño).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={psychometricModuleFilter}
                  onChange={(e) =>
                    setPsychometricModuleFilter(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800"
                >
                  <option value="all">Todos los Módulos (1-5)</option>
                  <option value={1}>Módulo 1</option>
                  <option value={2}>Módulo 2</option>
                  <option value={3}>Módulo 3</option>
                  <option value={4}>Módulo 4</option>
                  <option value={5}>Módulo 5</option>
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={psychometricSearch}
                    onChange={(e) => setPsychometricSearch(e.target.value)}
                    placeholder="Buscar ID, tema o enunciado..."
                    className="pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 w-56"
                  />
                </div>
              </div>
            </div>

            {/* KPIs Psicométricos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <button
                type="button"
                onClick={() => setPsychometricFilter('all')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  psychometricFilter === 'all'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-900'
                }`}
              >
                <div className="text-[11px] font-mono uppercase opacity-75">
                  Reactivos Auditados en Banco
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1">
                  {psychometricItems.length}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {evaluatedItemsCount} con respuestas empíricas en vivo
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPsychometricFilter(
                    psychometricFilter === 'critical_fail' ? 'all' : 'critical_fail'
                  )
                }
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  psychometricFilter === 'critical_fail'
                    ? 'border-rose-700 bg-rose-700 text-white'
                    : 'border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-950'
                }`}
              >
                <div className="text-[11px] font-mono font-bold uppercase">
                  🚨 Alerta &gt; 75% Fallo Grupal
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1">{criticalFailCount}</div>
                <div className="text-[11px] opacity-85 mt-0.5">
                  Preguntas con dificultad excesiva ($P &lt; 0.25$)
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPsychometricFilter(
                    psychometricFilter === 'ambiguous_disc' ? 'all' : 'ambiguous_disc'
                  )
                }
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  psychometricFilter === 'ambiguous_disc'
                    ? 'border-amber-600 bg-amber-600 text-white'
                    : 'border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-950'
                }`}
              >
                <div className="text-[11px] font-mono font-bold uppercase">
                  ⚠️ Preguntas Ambiguas ($D &lt; 0.15$)
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1">{ambiguousCount}</div>
                <div className="text-[11px] opacity-85 mt-0.5">
                  Baja discriminación o distractor desbalanceado
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPsychometricFilter(
                    psychometricFilter === 'evaluated_only' ? 'all' : 'evaluated_only'
                  )
                }
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  psychometricFilter === 'evaluated_only'
                    ? 'border-sky-700 bg-sky-700 text-white'
                    : 'border-sky-200 bg-sky-50/70 hover:bg-sky-100 text-sky-950'
                }`}
              >
                <div className="text-[11px] font-mono font-bold uppercase">
                  Índice Discriminación Promedio ($D$)
                </div>
                <div className="text-2xl font-extrabold font-mono mt-1">
                  {avgDiscrimination.toFixed(2)}
                </div>
                <div className="text-[11px] opacity-85 mt-0.5">
                  Estándar psicométrico óptimo: $D \ge 0.25$
                </div>
              </button>
            </div>

            {/* Tabla Psicométrica de Reactivos */}
            <div className="w-full overflow-x-auto border border-slate-200 rounded-xl max-h-[420px] bg-white">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 z-10">
                  <tr>
                    <th className="py-2.5 px-3">ID / Módulo</th>
                    <th className="py-2.5 px-3">Enunciado y Tema Evaluado</th>
                    <th className="py-2.5 px-2.5 text-center">Muestra ($N$)</th>
                    <th className="py-2.5 px-3 text-center">% Fallo Grupal</th>
                    <th className="py-2.5 px-2.5 text-center">Índ. Dificultad ($P$)</th>
                    <th className="py-2.5 px-2.5 text-center">Índ. Discriminación ($D$)</th>
                    <th className="py-2.5 px-3">Diagnóstico Psicométrico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPsychometricItems.slice(0, 60).map((item) => (
                    <tr
                      key={item.questionId}
                      className={
                        item.statusTone === 'critical'
                          ? 'bg-rose-50/50 hover:bg-rose-50'
                          : item.statusTone === 'ambiguous'
                          ? 'bg-amber-50/40 hover:bg-amber-50/80'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <div className="font-extrabold text-slate-900">{item.questionId}</div>
                        <div className="text-[10px] text-slate-500">
                          Mód. {item.modulo} · {item.bloom}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-md">
                        <div className="font-semibold text-slate-900 line-clamp-2">
                          {item.enunciado}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Tema: {item.tema} · Resp. Correcta: <strong>{item.correcta}</strong>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        {item.totalEvaluated > 0 ? (
                          <span className="font-bold text-slate-900">
                            {item.totalEvaluated} resp.
                          </span>
                        ) : (
                          <span className="text-slate-400">Pre-análisis</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                item.failureRatePct > 75
                                  ? 'bg-rose-600'
                                  : item.failureRatePct >= 50
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-600'
                              }`}
                              style={{ width: `${Math.min(100, item.failureRatePct)}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono font-extrabold ${
                              item.failureRatePct > 75 ? 'text-rose-700' : 'text-slate-800'
                            }`}
                          >
                            {item.failureRatePct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-bold text-slate-800">
                        {item.difficultyIndexP.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            item.discriminationIndexD < 0.15
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          D = {item.discriminationIndexD.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2.5 py-1 rounded-full font-bold text-[10px] inline-block ${
                            item.statusTone === 'critical'
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : item.statusTone === 'ambiguous'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          }`}
                        >
                          {item.diagnosticLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Tabla Detallada de Progreso y Nivel de Competencia por Estudiante */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Detalle de Progreso Promedio, Notas Históricas y Nivel de Competencia por Estudiante
            </h3>
            <p className="text-xs text-slate-600">
              Vista consolidada de cada estudiante sincronizada en tiempo real con la base de datos del servidor.
            </p>
          </div>
        </div>

        <div className="w-full overflow-y-auto overflow-x-hidden border border-slate-200 rounded-xl max-h-96 bg-white">
          <table className="w-full table-auto text-left border-collapse text-[11px]">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 z-10">
              <tr>
                <th className="py-2.5 px-3">ID Estudiante</th>
                <th className="py-2.5 px-3">Nombre del Estudiante</th>
                <th className="py-2.5 px-3 text-center">Progreso Integral</th>
                <th className="py-2.5 px-2.5 text-right">Intento 1</th>
                <th className="py-2.5 px-2.5 text-right">Intento 2</th>
                <th className="py-2.5 px-3 text-right">Nota Definitiva</th>
                <th className="py-2.5 px-2.5 text-center">Insignias Retos</th>
                <th className="py-2.5 px-3">Nivel de Competencia Alcanzado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {studentAnalytics.map((row) => (
                <tr key={row.student.id} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                    {row.student.id}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-900 leading-tight">
                    {row.student.nombre}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-600 rounded-full"
                          style={{ width: `${row.progresoIntegralPct}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {row.progresoIntegralPct}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono">
                    {row.notaIntento1 !== null ? row.notaIntento1.toFixed(1) : '—'}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono">
                    {row.notaIntento2 !== null ? row.notaIntento2.toFixed(1) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                    {row.attemptsCount > 0 || row.student.suspendido
                      ? `${row.notaDefinitiva.toFixed(1)} / 5.0`
                      : '—'}
                  </td>
                  <td className="py-2 px-2.5 text-center font-mono font-bold text-amber-800">
                    {row.unlockedBadges} / 5
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] inline-block ${
                        row.shortCompetencia === 'Sobresaliente'
                          ? 'bg-emerald-100 text-emerald-900'
                          : row.shortCompetencia === 'Destacado'
                          ? 'bg-sky-100 text-sky-900'
                          : row.shortCompetencia === 'Básico'
                          ? 'bg-amber-100 text-amber-900'
                          : row.shortCompetencia === 'En Proceso'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.nivelCompetencia}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
