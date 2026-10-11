import React, { useMemo, useState } from 'react';
import { StudentRecord, ExamAttemptResult } from '../types';
import {
  AcademicDataset,
  ClassSessionId,
  OFFICIAL_CLASS_SESSIONS,
  DEFAULT_CLASS_GRADING_WEIGHTS,
  computeStudentAcademicSummary,
  normalizeAndSyncAcademicDataset
} from '../data/classAttendanceAndGrades';
import {
  BarChart3,
  Users,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Search,
  Download
} from 'lucide-react';

interface AcademicSummaryDashboardProps {
  dataset: AcademicDataset;
  students: StudentRecord[];
  attempts: ExamAttemptResult[];
  onNavigateToClassesTab?: () => void;
}

export function AcademicSummaryDashboard({
  dataset,
  students,
  attempts,
  onNavigateToClassesTab
}: AcademicSummaryDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'aprobados' | 'riesgo'>('all');

  // Strictly derive from the single authoritative student bank (`students`)
  const syncedDataset = useMemo(
    () => normalizeAndSyncAcademicDataset(dataset, students),
    [dataset, students]
  );

  const effectiveClassSessions = useMemo(
    () =>
      Array.isArray(syncedDataset?.classSessions) && syncedDataset.classSessions.length > 0
        ? syncedDataset.classSessions
        : OFFICIAL_CLASS_SESSIONS,
    [syncedDataset?.classSessions]
  );

  const rosterMap = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  const activeClassIds = useMemo<ClassSessionId[]>(
    () => effectiveClassSessions.map((cs) => cs.id as ClassSessionId),
    [effectiveClassSessions]
  );

  const studentAggregations = useMemo(() => {
    const records = Array.isArray(syncedDataset?.records) ? syncedDataset.records : [];

    return records.map((rec) => {
      const summary = computeStudentAcademicSummary(
        rec,
        rosterMap.get(rec.studentId) || null,
        attempts,
        effectiveClassSessions
      );

      let sumComp = 0;
      let countComp = 0;
      let sumPart = 0;
      let countPart = 0;
      let sumExam = 0;
      let countExam = 0;
      let sumTrab = 0;
      let countTrab = 0;

      activeClassIds.forEach((cId) => {
        const c = summary.record.clases[cId];
        if (c?.comportamientoCalificado) {
          sumComp += Number(c.comportamiento ?? 0);
          countComp++;
        }
        if (c?.participacionCalificado) {
          sumPart += Number(c.participacion ?? 0);
          countPart++;
        }
        if (c?.examenCalificado) {
          sumExam += Number(c.examen ?? 0);
          countExam++;
        }
        if (c?.trabajoCalificado) {
          sumTrab += Number(c.trabajoPractico ?? 0);
          countTrab++;
        }
      });

      const avgComportamiento = countComp > 0 ? Number((sumComp / countComp).toFixed(2)) : 0;
      const avgParticipacion = countPart > 0 ? Number((sumPart / countPart).toFixed(2)) : 0;
      const avgExamen = countExam > 0 ? Number((sumExam / countExam).toFixed(2)) : 0;
      const avgTrabajo = countTrab > 0 ? Number((sumTrab / countTrab).toFixed(2)) : 0;

      return {
        summary,
        avgComportamiento,
        hasComp: countComp > 0,
        avgParticipacion,
        hasPart: countPart > 0,
        avgExamen,
        hasExam: countExam > 0,
        avgTrabajo,
        hasTrab: countTrab > 0
      };
    });
  }, [syncedDataset, rosterMap, attempts, effectiveClassSessions]);

  const filteredStudentAggregations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return studentAggregations.filter((item) => {
      const rec = item.summary.record;
      const matchesSearch =
        !q ||
        rec.nombre.toLowerCase().includes(q) ||
        rec.documento.toLowerCase().includes(q) ||
        rec.studentId.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === 'aprobados')
        return item.summary.hasAnyAcademicGrade && item.summary.promedioAcumulado >= 3.0;
      if (statusFilter === 'riesgo')
        return item.summary.hasAnyAcademicGrade && item.summary.promedioAcumulado < 3.0;
      return true;
    });
  }, [studentAggregations, searchQuery, statusFilter]);

  const competencyAndSessionMetrics = useMemo(() => {
    const total = studentAggregations.length;
    const classIds: ClassSessionId[] = activeClassIds;

    if (total === 0) {
      return {
        totalStudents: 0,
        globalAvg: 0,
        approvedCount: 0,
        atRiskCount: 0,
        approvalRatePct: 0,
        avgAttendancePct: 0,
        competencies: [
          {
            id: 'comportamiento',
            label: 'Comportamiento y Convivencia',
            weightLabel: `${DEFAULT_CLASS_GRADING_WEIGHTS.comportamientoPct}%`,
            avg: 0,
            color: 'bg-sky-600',
            badgeBg: 'bg-sky-50 text-sky-900 border-sky-200',
            perSessionAvg: classIds.map((cId) => ({ code: `C${cId}`, val: 0 }))
          },
          {
            id: 'participacion',
            label: 'Sustentación y Participación',
            weightLabel: `${DEFAULT_CLASS_GRADING_WEIGHTS.participacionPct}%`,
            avg: 0,
            color: 'bg-indigo-600',
            badgeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200',
            perSessionAvg: classIds.map((cId) => ({ code: `C${cId}`, val: 0 }))
          },
          {
            id: 'examen',
            label: 'Evaluación Teórica / Examen',
            weightLabel: `${DEFAULT_CLASS_GRADING_WEIGHTS.examenPct}%`,
            avg: 0,
            color: 'bg-emerald-600',
            badgeBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
            perSessionAvg: classIds.map((cId) => ({ code: `C${cId}`, val: 0 }))
          },
          {
            id: 'trabajoPractico',
            label: 'Taller y Trabajo Práctico',
            weightLabel: `${DEFAULT_CLASS_GRADING_WEIGHTS.trabajoPct}%`,
            avg: 0,
            color: 'bg-amber-500',
            badgeBg: 'bg-amber-50 text-amber-900 border-amber-200',
            perSessionAvg: classIds.map((cId) => ({ code: `C${cId}`, val: 0 }))
          }
        ],
        perClassAverages: classIds.map((cId) => ({
          id: cId,
          code: `C${cId}`,
          shortTitle:
            effectiveClassSessions.find((cs) => cs.id === cId)?.shortTitle || `Clase ${cId}`,
          avg: 0
        }))
      };
    }

    const avgCompGlobal = Number(
      (
        studentAggregations.reduce((acc, s) => acc + s.avgComportamiento, 0) / total
      ).toFixed(2)
    );
    const avgPartGlobal = Number(
      (
        studentAggregations.reduce((acc, s) => acc + s.avgParticipacion, 0) / total
      ).toFixed(2)
    );
    const avgExamGlobal = Number(
      (studentAggregations.reduce((acc, s) => acc + s.avgExamen, 0) / total).toFixed(2)
    );
    const avgTrabGlobal = Number(
      (studentAggregations.reduce((acc, s) => acc + s.avgTrabajo, 0) / total).toFixed(2)
    );
    const globalAvg = Number(
      (
        studentAggregations.reduce((acc, s) => acc + s.summary.promedioAcumulado, 0) /
        total
      ).toFixed(2)
    );
    const approvedCount = studentAggregations.filter(
      (s) => s.summary.promedioAcumulado >= 3.0
    ).length;
    const atRiskCount = total - approvedCount;
    const approvalRatePct = Math.round((approvedCount / total) * 100);
    const avgAttendancePct = Math.round(
      studentAggregations.reduce((acc, s) => acc + s.summary.porcentajeAsistencia, 0) / total
    );

    const computeSessionCompAvg = (
      field: 'comportamiento' | 'participacion' | 'examen' | 'trabajoPractico'
    ) =>
      classIds.map((cId) => {
        const sumField = studentAggregations.reduce(
          (acc, s) => acc + Number(s.summary.record.clases[cId]?.[field] ?? 0),
          0
        );
        return {
          code: `C${cId}`,
          val: Number((sumField / total).toFixed(2))
        };
      });

    const perClassAverages = classIds.map((cId) => {
      const sumC = studentAggregations.reduce(
        (acc, s) => acc + (s.summary.classFinals[cId] ?? 0),
        0
      );
      return {
        id: cId,
        code: `C${cId}`,
        shortTitle:
          effectiveClassSessions.find((cs) => cs.id === cId)?.shortTitle || `Clase ${cId}`,
        avg: Number((sumC / total).toFixed(2))
      };
    });

    return {
      totalStudents: total,
      globalAvg,
      approvedCount,
      atRiskCount,
      approvalRatePct,
      avgAttendancePct,
      competencies: [
        {
          id: 'comportamiento',
          label: 'Comportamiento y Convivencia',
          weightLabel: `${effectiveClassSessions[0]?.ponderacion?.comportamientoPct ?? 10}%`,
          avg: avgCompGlobal,
          color: 'bg-sky-600',
          badgeBg: 'bg-sky-50 text-sky-900 border-sky-200',
          perSessionAvg: computeSessionCompAvg('comportamiento')
        },
        {
          id: 'participacion',
          label: 'Sustentación y Participación',
          weightLabel: `${effectiveClassSessions[0]?.ponderacion?.participacionPct ?? 15}%`,
          avg: avgPartGlobal,
          color: 'bg-indigo-600',
          badgeBg: 'bg-indigo-50 text-indigo-900 border-indigo-200',
          perSessionAvg: computeSessionCompAvg('participacion')
        },
        {
          id: 'examen',
          label: 'Evaluación Teórica / Examen',
          weightLabel: `${effectiveClassSessions[0]?.ponderacion?.examenPct ?? 35}%`,
          avg: avgExamGlobal,
          color: 'bg-emerald-600',
          badgeBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
          perSessionAvg: computeSessionCompAvg('examen')
        },
        {
          id: 'trabajoPractico',
          label: 'Taller y Trabajo Práctico',
          weightLabel: `${effectiveClassSessions[0]?.ponderacion?.trabajoPct ?? 40}%`,
          avg: avgTrabGlobal,
          color: 'bg-amber-500',
          badgeBg: 'bg-amber-50 text-amber-900 border-amber-200',
          perSessionAvg: computeSessionCompAvg('trabajoPractico')
        }
      ],
      perClassAverages
    };
  }, [studentAggregations, effectiveClassSessions]);

  const handleExportSummaryCsv = () => {
    const headers = [
      'ID Estudiante',
      'Nombre Estudiante',
      ...activeClassIds.map((cId) => `Definitiva C${cId}`),
      'Promedio Comportamiento',
      'Promedio Participacion',
      'Promedio Examen',
      'Promedio Trabajo Practico',
      'Nota Definitiva Acumulada',
      'Porcentaje Asistencia (%)',
      'Fallas Acumuladas',
      'Concepto Academico'
    ];
    const rows = studentAggregations.map((item) => {
      const s = item.summary;
      return [
        s.record.documento,
        `"${s.record.nombre.replace(/"/g, '""')}"`,
        ...activeClassIds.map((cId) => (s.classFinals[cId] ?? 0).toFixed(2)),
        item.avgComportamiento.toFixed(2),
        item.avgParticipacion.toFixed(2),
        item.avgExamen.toFixed(2),
        item.avgTrabajo.toFixed(2),
        s.promedioAcumulado.toFixed(2),
        `${s.porcentajeAsistencia}%`,
        String(s.totalFallasBloques),
        s.promedioAcumulado >= 3.0 ? 'APROBADO' : 'EN RIESGO'
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_resumen_academico_c1_c6_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const maxClassNum = Math.max(1, effectiveClassSessions.length);
  const classRangeLabel = `C1 a C${maxClassNum}`;
  const classRangeShort = `C1–C${maxClassNum}`;

  return (
    <div className="bg-white border-2 border-indigo-200/80 rounded-2xl p-4 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Dashboard de Resumen Académico · Sincronizado con Banco Único</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Consolidado Automático por Estudiante y por Competencia ({classRangeLabel})
          </h3>
          <p className="text-xs text-slate-600">
            Extrae en tiempo real la información desde el{' '}
            <strong>Banco Único de Estudiantes ({students.length} registrados)</strong> para mostrar promedios automáticos por estudiante y por competencia, garantizando coherencia absoluta con las notas de {classRangeLabel}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs font-mono">
          <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-300" />
            <span>Banco Único: {students.length} alumno(s)</span>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
            Promedio {classRangeShort}: {competencyAndSessionMetrics.globalAvg.toFixed(2)} / 5.0
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 font-bold">
            Aprobación: {competencyAndSessionMetrics.approvalRatePct}% ({competencyAndSessionMetrics.approvedCount}/{competencyAndSessionMetrics.totalStudents})
          </span>
          <button
            type="button"
            onClick={handleExportSummaryCsv}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Resumen CSV</span>
          </button>
          {onNavigateToClassesTab && (
            <button
              type="button"
              onClick={onNavigateToClassesTab}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-sans font-bold cursor-pointer"
            >
              Editar Notas {classRangeShort} →
            </button>
          )}
        </div>
      </div>

      {/* 1. Tarjetas de Promedios Automáticos por Competencia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {competencyAndSessionMetrics.competencies.map((comp) => {
          const pctWidth = Math.min(100, Math.round((comp.avg / 5.0) * 100));
          return (
            <div
              key={comp.id}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">{comp.label}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${comp.badgeBg}`}
                >
                  Peso {comp.weightLabel}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-mono font-extrabold text-slate-900">
                  {comp.avg.toFixed(2)}
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Prom. {classRangeShort} ({pctWidth}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${comp.color}`}
                  style={{ width: `${pctWidth}%` }}
                />
              </div>
              <div className="grid grid-cols-6 gap-1 pt-1 border-t border-slate-200/70 text-[10px] font-mono text-center">
                {comp.perSessionAvg.map((ps) => (
                  <div key={ps.code} className="bg-white rounded border border-slate-200 py-0.5">
                    <div className="text-[9px] text-slate-400 font-bold">{ps.code}</div>
                    <div className="font-bold text-slate-800">{ps.val.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Barra de Promedios Automáticos por Sesión */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {competencyAndSessionMetrics.perClassAverages.map((cItem) => (
          <div
            key={cItem.id}
            className="p-2.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-1 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-indigo-700">Sesión {cItem.code}</span>
              <span
                className={`font-mono font-extrabold ${
                  cItem.avg >= 3.0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {cItem.avg.toFixed(2)} / 5.0
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate" title={cItem.shortTitle}>
              {cItem.shortTitle}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Matriz Completa de Promedios por Estudiante y por Competencia */}
      {studentAggregations.length === 0 ? (
        <div className="p-6 text-center rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500">
          El banco único de estudiantes está vacío (0 estudiantes). Al registrar estudiantes en la pestaña «Estudiantes», sus promedios de {classRangeLabel} y por competencia se calcularán aquí automáticamente.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="bg-slate-50 px-3.5 py-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-700" />
              <span>
                Promedios por Estudiante y por Competencia (Coherente con Clases {classRangeShort})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar estudiante o ID..."
                  className="pl-8 pr-3 py-1 rounded-lg border border-slate-300 bg-white text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
                {(
                  [
                    { id: 'all', label: `Todos (${studentAggregations.length})` },
                    { id: 'aprobados', label: `Aprobados (${competencyAndSessionMetrics.approvedCount})` },
                    { id: 'riesgo', label: `En Riesgo (${competencyAndSessionMetrics.atRiskCount})` }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold sticky top-0 z-10">
                  <th className="py-2 px-3">Estudiante (ID Banco Único)</th>
                  {activeClassIds.map((cId) => (
                    <th key={cId} className="py-2 px-1.5 text-center">
                      C{cId}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-center bg-sky-50/60">Prom. Comport.</th>
                  <th className="py-2 px-2 text-center bg-indigo-50/60">Prom. Particip.</th>
                  <th className="py-2 px-2 text-center bg-emerald-50/60">Prom. Examen</th>
                  <th className="py-2 px-2 text-center bg-amber-50/60">Prom. Trabajo</th>
                  <th className="py-2 px-2.5 text-center">Definitiva</th>
                  <th className="py-2 px-2.5 text-center">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudentAggregations.map((item) => {
                  const s = item.summary;
                  const approved = s.hasAnyAcademicGrade && s.promedioAcumulado >= 3.0;
                  return (
                    <tr key={s.record.studentId} className="hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                        <span className="font-bold">{s.record.nombre}</span>{' '}
                        <span className="font-mono text-slate-500">({s.record.documento})</span>
                      </td>
                      {activeClassIds.map((cId) => (
                        <td
                          key={cId}
                          className="py-1.5 px-1.5 text-center font-mono text-slate-600"
                        >
                          {s.classHasFinalGrade[cId] ? (
                            (s.classFinals[cId] ?? 0).toFixed(1)
                          ) : (
                            <span className="text-[10px] text-slate-400">Sin nota</span>
                          )}
                        </td>
                      ))}
                      <td className="py-1.5 px-2 text-center font-mono font-semibold bg-sky-50/30 text-sky-900">
                        {item.hasComp ? (
                          item.avgComportamiento.toFixed(2)
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">Sin nota</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-semibold bg-indigo-50/30 text-indigo-900">
                        {item.hasPart ? (
                          item.avgParticipacion.toFixed(2)
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">Sin nota</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-semibold bg-emerald-50/30 text-emerald-900">
                        {item.hasExam ? (
                          item.avgExamen.toFixed(2)
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">Sin nota</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-semibold bg-amber-50/30 text-amber-900">
                        {item.hasTrab ? (
                          item.avgTrabajo.toFixed(2)
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">Sin nota</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-mono font-bold whitespace-nowrap">
                        {!s.hasAnyAcademicGrade ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 text-[10px]">
                            Sin nota
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${
                              approved
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {approved ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                            )}
                            <span>{s.promedioAcumulado.toFixed(2)}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-mono whitespace-nowrap">
                        {s.totalBloquesEvaluados === 0 ? (
                          <span className="text-[10px] text-slate-400">Sin llamado</span>
                        ) : (
                          `${s.porcentajeAsistencia}% (${s.totalFallasBloques} fallas)`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
