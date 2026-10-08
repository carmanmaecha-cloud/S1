import { useState, useMemo } from 'react';
import {
  StudentRecord,
  ExamAttemptResult,
  ABProProjectEvaluation,
  SystemConfig
} from '../types';
import { Layers, Download, Save, CheckCircle2, Search, Briefcase, Award } from 'lucide-react';
import { OptionServerSaveBar } from './ServerSaveContext';

interface ABProAndMultiCutGradebookProps {
  students: StudentRecord[];
  attempts: ExamAttemptResult[];
  abproEvaluations: ABProProjectEvaluation[];
  onUpdateABProEvaluations: (next: ABProProjectEvaluation[]) => void;
  config: SystemConfig;
  onUpdateConfig: (next: SystemConfig) => void;
}

export function ABProAndMultiCutGradebook({
  students,
  attempts,
  abproEvaluations,
  onUpdateABProEvaluations,
  config,
  onUpdateConfig
}: ABProAndMultiCutGradebookProps) {
  const [subView, setSubView] = useState<'multicorte' | 'abpro_rubrica'>('multicorte');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || '1000000000');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Build map of ABPro evaluations by studentId
  const abproMap = useMemo(() => {
    const map = new Map<string, ABProProjectEvaluation>();
    abproEvaluations.forEach((ev) => map.set(ev.studentId, ev));
    return map;
  }, [abproEvaluations]);

  // Multi-Cut Matrix Calculation per student
  const multiCutRows = useMemo(() => {
    const pesoTeoria = (config.ponderacionTeoriaPct ?? 60) / 100;
    const pesoABPro = 1 - pesoTeoria;

    return students
      .filter((s) => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          s.id.toLowerCase().includes(q) ||
          s.nombre.toLowerCase().includes(q) ||
          s.codigoAcceso.toLowerCase().includes(q)
        );
      })
      .map((st) => {
        const stAttempts = attempts.filter((a) => a.studentId === st.id);

        const bestByModality = (mod: string): number | null => {
          const matching = stAttempts.filter((a) => a.modalidad === mod);
          if (matching.length === 0) return null;
          return Math.max(...matching.map((m) => m.notaColombiana));
        };

        const mod1 = bestByModality('mod1');
        const mod2 = bestByModality('mod2');
        const mod3 = bestByModality('mod3');
        const mod4 = bestByModality('mod4');
        const mod5 = bestByModality('mod5');
        const integral = bestByModality('integral');

        // Highest theoretical grade across attempts (or average of presented cuts if multiple modalities used)
        const allPresentedScores = [mod1, mod2, mod3, mod4, mod5, integral].filter(
          (v): v is number => v !== null
        );

        let notaTeoricaDef = 0.0;
        if (st.suspendido) {
          notaTeoricaDef = 0.0;
        } else if (stAttempts.length > 0) {
          // Best score or mean of modular cuts if multiple modalities were taken
          const modScores = [mod1, mod2, mod3, mod4, mod5].filter((v): v is number => v !== null);
          const bestOverall = Math.max(...stAttempts.map((a) => a.notaColombiana));
          if (modScores.length >= 2 && integral === null) {
            const avgMods = modScores.reduce((a, b) => a + b, 0) / modScores.length;
            notaTeoricaDef = Number(Math.max(avgMods, bestOverall).toFixed(1));
          } else {
            notaTeoricaDef = Number(bestOverall.toFixed(1));
          }
        }

        // ABPro Project Grade (5 Cumulative Deliverables)
        const abpro = abproMap.get(st.id);
        const notaABPro = abpro
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
          : null;

        // Combined Final Course Grade (36h Course)
        let notaFinalAsignatura = notaTeoricaDef;
        if (!st.suspendido && notaABPro !== null) {
          notaFinalAsignatura = Number((notaTeoricaDef * pesoTeoria + notaABPro * pesoABPro).toFixed(1));
        }

        return {
          student: st,
          mod1,
          mod2,
          mod3,
          mod4,
          mod5,
          integral,
          cutsCount: allPresentedScores.length,
          notaTeoricaDef,
          abpro,
          notaABPro,
          notaFinalAsignatura
        };
      });
  }, [students, attempts, abproMap, searchQuery, config.ponderacionTeoriaPct]);

  // Selected Student ABPro Form State
  const currentSelectedStudent =
    students.find((s) => s.id === selectedStudentId) || students[0];
  const currentABPro = abproMap.get(currentSelectedStudent?.id || '') || {
    studentId: currentSelectedStudent?.id || '',
    nombreMiPyme: '',
    insumo1Mapeo: 3.5,
    insumo2Journey: 3.5,
    insumo3Investigacion: 3.5,
    insumo4Segmentacion: 3.5,
    insumo5Omnicanal: 3.5,
    observacionesDocente: '',
    ultimaActualizacion: ''
  };

  const [formMiPyme, setFormMiPyme] = useState(currentABPro.nombreMiPyme);
  const [formI1, setFormI1] = useState(currentABPro.insumo1Mapeo);
  const [formI2, setFormI2] = useState(currentABPro.insumo2Journey);
  const [formI3, setFormI3] = useState(currentABPro.insumo3Investigacion);
  const [formI4, setFormI4] = useState(currentABPro.insumo4Segmentacion);
  const [formI5, setFormI5] = useState(currentABPro.insumo5Omnicanal);
  const [formObs, setFormObs] = useState(currentABPro.observacionesDocente);

  const handleSelectStudentForABPro = (id: string) => {
    setSelectedStudentId(id);
    const existing = abproMap.get(id);
    if (existing) {
      setFormMiPyme(existing.nombreMiPyme);
      setFormI1(existing.insumo1Mapeo);
      setFormI2(existing.insumo2Journey);
      setFormI3(existing.insumo3Investigacion);
      setFormI4(existing.insumo4Segmentacion);
      setFormI5(existing.insumo5Omnicanal);
      setFormObs(existing.observacionesDocente);
    } else {
      setFormMiPyme('');
      setFormI1(4.0);
      setFormI2(4.0);
      setFormI3(4.0);
      setFormI4(4.0);
      setFormI5(4.0);
      setFormObs('');
    }
    setSaveNotice(null);
  };

  const handleSaveABProEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSelectedStudent) return;
    const record: ABProProjectEvaluation = {
      studentId: currentSelectedStudent.id,
      nombreMiPyme: formMiPyme.trim() || 'MiPyme Local La Dorada',
      insumo1Mapeo: Number(Math.min(5, Math.max(0, formI1)).toFixed(1)),
      insumo2Journey: Number(Math.min(5, Math.max(0, formI2)).toFixed(1)),
      insumo3Investigacion: Number(Math.min(5, Math.max(0, formI3)).toFixed(1)),
      insumo4Segmentacion: Number(Math.min(5, Math.max(0, formI4)).toFixed(1)),
      insumo5Omnicanal: Number(Math.min(5, Math.max(0, formI5)).toFixed(1)),
      observacionesDocente: formObs.trim(),
      ultimaActualizacion: new Date().toLocaleString('es-CO')
    };

    const exists = abproEvaluations.some((ev) => ev.studentId === record.studentId);
    const next = exists
      ? abproEvaluations.map((ev) => (ev.studentId === record.studentId ? record : ev))
      : [record, ...abproEvaluations];

    onUpdateABProEvaluations(next);
    setSaveNotice(
      `✓ Evaluación del Proyecto ABPro guardada para ${currentSelectedStudent.nombre} (Promedio Proyecto: ${(
        (record.insumo1Mapeo +
          record.insumo2Journey +
          record.insumo3Investigacion +
          record.insumo4Segmentacion +
          record.insumo5Omnicanal) /
        5
      ).toFixed(1)} / 5.0).`
    );
  };

  const exportMultiCutCsv = () => {
    const header = [
      'ID Estudiante',
      'Nombre Completo',
      'Código Acceso',
      'Corte M1 (Mapeo)',
      'Corte M2 (Consumidor)',
      'Corte M3 (Investigación)',
      'Corte M4 (Segmentación)',
      'Corte M5 (Tendencias)',
      'Examen Integral',
      'Definitiva Teórica EvaluaPlus',
      'MiPyme Proyecto ABPro',
      'Nota Proyecto ABPro (5 Insumos)',
      'Nota Final Asignatura (36h)',
      'Estado Académico'
    ];
    const rows = multiCutRows.map((r) => [
      r.student.id,
      `"${r.student.nombre}"`,
      r.student.codigoAcceso,
      r.mod1 !== null ? r.mod1.toFixed(1) : '-',
      r.mod2 !== null ? r.mod2.toFixed(1) : '-',
      r.mod3 !== null ? r.mod3.toFixed(1) : '-',
      r.mod4 !== null ? r.mod4.toFixed(1) : '-',
      r.mod5 !== null ? r.mod5.toFixed(1) : '-',
      r.integral !== null ? r.integral.toFixed(1) : '-',
      r.notaTeoricaDef.toFixed(1),
      `"${r.abpro?.nombreMiPyme || 'Sin registrar'}"`,
      r.notaABPro !== null ? r.notaABPro.toFixed(1) : '-',
      r.notaFinalAsignatura.toFixed(1),
      r.student.suspendido
        ? 'SUSPENDIDO'
        : r.notaFinalAsignatura >= 3.0
        ? 'APROBADO'
        : r.student.intentosUsados === 0 && r.notaABPro === null
        ? 'SIN EVALUAR'
        : 'REPROBADO'
    ]);

    const csvContent =
      '\uFEFF' + [header.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Consolidado_MultiCorte_ABPro_LaDorada_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation & Weighting Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-700" />
            <h2 className="text-lg font-bold text-slate-900">
              Sábana Multi-Corte (Módulos 1 al 5) y Rúbrica del Proyecto Integrador ABPro
            </h2>
          </div>
          <p className="text-xs text-slate-600">
            Integra las calificaciones por cada módulo temático con la calificación de los 5 insumos del proyecto aplicado «Plan de Inteligencia de Mercados para una MiPyme de La Dorada».
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('multicorte')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              subView === 'multicorte'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Matriz Consolidada Multi-Corte
          </button>
          <button
            type="button"
            onClick={() => setSubView('abpro_rubrica')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              subView === 'abpro_rubrica'
                ? 'bg-sky-700 text-white'
                : 'bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>2. Evaluar Proyecto ABPro (5 Insumos)</span>
          </button>
          <button
            type="button"
            onClick={exportMultiCutCsv}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Sábana Multi-Corte CSV</span>
          </button>
        </div>
      </div>

      {/* Weighting Selector Bar */}
      <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold">Ponderación Oficial de la Asignatura (36 Horas):</span>{' '}
              <span className="text-slate-300">
                Combina automáticamente la Nota Definitiva en EvaluaPlus con el promedio de los 5 Insumos del Proyecto ABPro.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="text-slate-300 font-medium">Peso Examen Teórico:</label>
            <select
              value={config.ponderacionTeoriaPct ?? 60}
              onChange={(e) =>
                onUpdateConfig({ ...config, ponderacionTeoriaPct: Number(e.target.value) })
              }
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 font-mono font-bold"
            >
              <option value={100}>100% Examen / 0% ABPro</option>
              <option value={70}>70% Examen / 30% ABPro</option>
              <option value={60}>60% Examen / 40% ABPro (Recomendado)</option>
              <option value={50}>50% Examen / 50% ABPro</option>
            </select>
          </div>
        </div>
        <OptionServerSaveBar
          sectionKey="abpro_ponderacion_teoria"
          label="Ponderación Examen Teórico vs ABPro"
          watchValue={config.ponderacionTeoriaPct}
          dark={true}
          compact={true}
        />
      </div>

      {subView === 'multicorte' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-md w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar estudiante en la sábana multi-corte..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Mostrando {multiCutRows.length} estudiantes · Escala 0.0 a 5.0
            </div>
          </div>

          <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full table-auto text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <th className="py-2.5 px-2.5">Estudiante</th>
                  <th className="py-2.5 px-1.5 text-center" title="Módulo 1: Introducción al Mapeo">Mód 1</th>
                  <th className="py-2.5 px-1.5 text-center" title="Módulo 2: Comportamiento del Consumidor">Mód 2</th>
                  <th className="py-2.5 px-1.5 text-center" title="Módulo 3: Investigación de Mercados">Mód 3</th>
                  <th className="py-2.5 px-1.5 text-center" title="Módulo 4: Segmentación y Posicionamiento">Mód 4</th>
                  <th className="py-2.5 px-1.5 text-center" title="Módulo 5: Tendencias y Omnicanalidad">Mód 5</th>
                  <th className="py-2.5 px-1.5 text-center" title="Examen Integral (5 Módulos)">Integral</th>
                  <th className="py-2.5 px-2 text-right bg-slate-100/80">Teoría ({config.ponderacionTeoriaPct ?? 60}%)</th>
                  <th className="py-2.5 px-2 text-right bg-sky-50/70">ABPro ({100 - (config.ponderacionTeoriaPct ?? 60)}%)</th>
                  <th className="py-2.5 px-2 text-right font-bold bg-emerald-50/70">Final Curso</th>
                  <th className="py-2.5 px-2.5 text-right">Acción ABPro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {multiCutRows.map((r) => (
                  <tr key={r.student.id} className="hover:bg-slate-50/80">
                    <td className="py-2 px-2.5">
                      <div className="font-semibold text-slate-900 leading-tight">{r.student.nombre}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        ID: {r.student.id}
                        {r.abpro?.nombreMiPyme && (
                          <span className="ml-1.5 text-sky-700 font-sans font-medium">
                            · MiPyme: {r.abpro.nombreMiPyme}
                          </span>
                        )}
                      </div>
                    </td>
                    {[r.mod1, r.mod2, r.mod3, r.mod4, r.mod5, r.integral].map((val, idx) => (
                      <td key={idx} className="py-2 px-1.5 text-center font-mono tabular-nums">
                        {val !== null ? (
                          <span
                            className={`font-semibold ${
                              val >= 3.0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {val.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right font-mono font-bold bg-slate-50/60 tabular-nums">
                      {r.student.intentosUsados > 0 || r.student.suspendido
                        ? r.notaTeoricaDef.toFixed(1)
                        : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold bg-sky-50/40 text-sky-900 tabular-nums">
                      {r.notaABPro !== null ? r.notaABPro.toFixed(1) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-xs bg-emerald-50/40 tabular-nums">
                      {r.student.intentosUsados > 0 || r.notaABPro !== null || r.student.suspendido ? (
                        <span
                          className={
                            r.notaFinalAsignatura >= 3.0 ? 'text-emerald-800' : 'text-red-700'
                          }
                        >
                          {r.notaFinalAsignatura.toFixed(1)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectStudentForABPro(r.student.id);
                          setSubView('abpro_rubrica');
                        }}
                        className="px-2 py-1 rounded border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 font-semibold text-[10px]"
                      >
                        {r.notaABPro !== null ? 'Editar ABPro' : 'Calificar ABPro'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Rúbrica Digital de los 5 Insumos del Proyecto ABPro */
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Rúbrica Digital del Proyecto Integrador ABPro (5 Entregables Acumulativos)
              </h3>
              <p className="text-xs text-slate-600">
                Califique de 0.0 a 5.0 cada uno de los 5 insumos desarrollados por el estudiante para una MiPyme real de La Dorada, Caldas.
              </p>
            </div>

            <div className="w-full sm:w-72">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Seleccionar Estudiante:
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => handleSelectStudentForABPro(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <form onSubmit={handleSaveABProEvaluation} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nombre de la MiPyme o Negocio Local Analizado (La Dorada, Caldas)
                </label>
                <input
                  type="text"
                  required
                  value={formMiPyme}
                  onChange={(e) => setFormMiPyme(e.target.value)}
                  placeholder="Ej. Heladería Artesanal Río Magdalena / Ferretería Central..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-slate-500">Promedio Acumulado Proyecto ABPro</div>
                  <div className="text-[11px] text-slate-600">
                    Media aritmética de los 5 insumos modulares
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono text-sky-900">
                  {((formI1 + formI2 + formI3 + formI4 + formI5) / 5).toFixed(1)} / 5.0
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                {
                  label: 'Insumo 1 (Mód. 1)',
                  desc: 'Mapa Competitivo y Geolocalización en La Dorada',
                  val: formI1,
                  setter: setFormI1
                },
                {
                  label: 'Insumo 2 (Mód. 2)',
                  desc: 'Ficha Buyer Persona y Customer Journey Map',
                  val: formI2,
                  setter: setFormI2
                },
                {
                  label: 'Insumo 3 (Mód. 3)',
                  desc: 'Instrumento de Encuesta y Hallazgos de Campo',
                  val: formI3,
                  setter: setFormI3
                },
                {
                  label: 'Insumo 4 (Mód. 4)',
                  desc: 'Matriz TAM-SAM-SOM y Declaración Posicionamiento',
                  val: formI4,
                  setter: setFormI4
                },
                {
                  label: 'Insumo 5 (Mód. 5)',
                  desc: 'Estrategia Omnicanal (WhatsApp Business + Local)',
                  val: formI5,
                  setter: setFormI5
                }
              ].map((ins, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/60 space-y-2">
                  <div className="font-bold text-slate-900">{ins.label}</div>
                  <p className="text-[11px] text-slate-600 leading-snug min-h-[2.2rem]">{ins.desc}</p>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={ins.val}
                    onChange={(e) => ins.setter( parseFloat(e.target.value) || 0 )}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono font-bold text-sm bg-white"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">
                Retroalimentación Formativa del Instructor sobre el Proyecto Aplicado
              </label>
              <textarea
                rows={2}
                value={formObs}
                onChange={(e) => setFormObs(e.target.value)}
                placeholder="Observaciones sobre la viabilidad comercial del plan de mercadeo propuesto..."
                className="w-full p-3 rounded-lg border border-slate-300"
              />
            </div>

            {saveNotice && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Calificación ABPro del Estudiante</span>
              </button>
            </div>
          </form>
          <OptionServerSaveBar
            sectionKey="abpro_rubrica_proyecto"
            label="Rúbrica del Proyecto Integrador ABPro"
            watchValue={abproEvaluations}
          />
        </div>
      )}
    </div>
  );
}
