import React, { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { ExamAttemptResult } from '../types';
import { BarChart3, PlayCircle, Flag, Clock, CheckCircle2, ArrowRight, RotateCcw, Maximize2 } from 'lucide-react';

interface StudentPerformanceDashboardProps {
  studentId: string;
  studentName: string;
  studentAttempts: ExamAttemptResult[];
  allAttempts: ExamAttemptResult[];
  minPassingGrade: number;
}

const ZERO_TEST_QUESTIONS = [
  {
    id: 'DEMO-CERO-01',
    enunciado:
      'Pregunta de Ensayo #1 (Inducción Digital): En el comercio local de La Dorada, Caldas, cuando un cliente busca en Google Maps "panadería abierta cerca de mí", ¿qué herramienta gratuita permite que el negocio aparezca geolocalizado con sus horarios y reseñas?',
    opciones: {
      A: 'Google Perfil de Negocio (Google Business Profile).',
      B: 'Un cuaderno de contabilidad físico sin conexión.',
      C: 'Un archivo de texto guardado en una memoria USB.',
      D: 'Una calculadora científica de bolsillo.'
    },
    correcta: 'A' as const,
    explicacion:
      'Google Perfil de Negocio posiciona gratuitamente a los comercios locales en búsquedas de proximidad y Google Maps.'
  },
  {
    id: 'DEMO-CERO-02',
    enunciado:
      'Pregunta de Ensayo #2 (Uso de la Plataforma): Si durante su examen oficial tiene duda en una pregunta y desea volver a revisarla desde la cuadrícula antes de enviar el examen, ¿qué herramienta debe utilizar?',
    opciones: {
      A: 'Cerrar el navegador o cambiar de pestaña.',
      B: 'El botón de banderita (🚩 Marcar Pregunta Dudada para Revisión) ubicado arriba de la pregunta.',
      C: 'Apagar el monitor del computador.',
      D: 'Presionar F12 para abrir la consola.'
    },
    correcta: 'B' as const,
    explicacion:
      'La banderita (🚩) marca la pregunta en color ámbar dentro de la cuadrícula de navegación para volver a ella en un clic antes de entregar.'
  }
];

export function StudentPerformanceDashboard({
  studentId,
  studentName,
  studentAttempts,
  allAttempts,
  minPassingGrade
}: StudentPerformanceDashboardProps) {
  // Course average calculation
  const courseAverage = React.useMemo(() => {
    const valid = allAttempts.filter((a) => typeof a?.notaColombiana === 'number');
    if (valid.length === 0) return 3.6; // Reference baseline when course starts
    const sum = valid.reduce((acc, item) => acc + item.notaColombiana, 0);
    return Number((sum / valid.length).toFixed(2));
  }, [allAttempts]);

  const studentBestGrade = React.useMemo(() => {
    if (studentAttempts.length === 0) return 0;
    return Number(Math.max(...studentAttempts.map((a) => a.notaColombiana)).toFixed(2));
  }, [studentAttempts]);

  const chartData = React.useMemo(() => {
    const chronological = [...studentAttempts].sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
    if (chronological.length === 0) {
      return [
        {
          etiqueta: 'Sin intentos aún',
          miNota: 0,
          mejorAcumulada: 0,
          promedioCurso: courseAverage
        }
      ];
    }
    let runningBest = 0;
    return chronological.map((att, idx) => {
      runningBest = Math.max(runningBest, att.notaColombiana);
      const shortMod =
        att.modalidad === 'integral' ? 'Integral' : `Mód ${att.modalidad.replace('mod', '')}`;
      return {
        etiqueta: `#${idx + 1} (${shortMod}-I${att.intentoNumero})`,
        miNota: Number(att.notaColombiana.toFixed(2)),
        mejorAcumulada: Number(runningBest.toFixed(2)),
        promedioCurso: courseAverage
      };
    });
  }, [studentAttempts, courseAverage]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>Dashboard de Rendimiento Estudiantil</span>
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Evolución de Calificaciones vs. Promedio General del Curso ({studentName})
          </h3>
          <p className="text-xs text-slate-500">
            Comparativa histórica de sus intentos registrados frente a su mejor nota acumulada (<code>Math.max</code>) y el promedio del grupo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <span className="block text-[10px] text-emerald-700 uppercase font-sans font-semibold">
              Mi Mejor Nota (Math.max)
            </span>
            <strong className="text-base">{studentBestGrade.toFixed(1)} / 5.0</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900">
            <span className="block text-[10px] text-sky-700 uppercase font-sans font-semibold">
              Promedio del Curso
            </span>
            <strong className="text-base">{courseAverage.toFixed(1)} / 5.0</strong>
          </div>
          <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
            <span className="block text-[10px] text-slate-600 uppercase font-sans font-semibold">
              Mínima Aprobatoria
            </span>
            <strong className="text-base">{minPassingGrade.toFixed(1)} / 5.0</strong>
          </div>
        </div>
      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#475569' }} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#475569' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
                borderRadius: '12px',
                fontSize: '12px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <ReferenceLine
              y={minPassingGrade}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{
                value: `Aprobado (${minPassingGrade.toFixed(1)})`,
                position: 'insideTopRight',
                fill: '#b91c1c',
                fontSize: 11
              }}
            />
            <Bar
              dataKey="miNota"
              name="Calificación del Intento"
              fill="#0284c7"
              radius={[6, 6, 0, 0]}
              barSize={36}
            />
            <Line
              type="monotone"
              dataKey="mejorAcumulada"
              name="Mi Mejor Nota (Math.max)"
              stroke="#059669"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#059669' }}
            />
            <Line
              type="monotone"
              dataKey="promedioCurso"
              name="Promedio del Curso"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, fill: '#6366f1' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ZeroTrialSimulatorModal({
  onClose
}: {
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [doubted, setDoubted] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const startPerfRef = useRef<number>(performance.now());

  useEffect(() => {
    startPerfRef.current = performance.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((performance.now() - startPerfRef.current) / 1000);
      setSecondsLeft(Math.max(0, 180 - elapsed));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const currentQ = ZERO_TEST_QUESTIONS[stepIndex];
  const windowRatioPct =
    typeof window !== 'undefined' && window.screen?.availWidth
      ? Math.round((window.innerWidth / window.screen.availWidth) * 100)
      : 100;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-xl my-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
              Simulador de Prueba Cero · 0 Consumo de Intentos Oficiales
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Prueba de Ensayo Tecnológica (2 Preguntas de Inducción)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 font-mono text-xs font-bold text-emerald-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                🟢 {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
                {String(secondsLeft % 60).padStart(2, '0')}
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cerrar Simulador ✕
            </button>
          </div>
        </div>

        {/* Check de Pantalla y Controles */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <Maximize2 className="w-4 h-4 text-sky-700 shrink-0" />
            <span>
              Ancho actual de ventana: <strong>{windowRatioPct}%</strong> de la pantalla disponible (Requerido en examen real: ≥ 85%).
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {ZERO_TEST_QUESTIONS.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                className={`px-2.5 py-1 rounded font-mono text-xs font-bold border cursor-pointer ${
                  stepIndex === idx ? 'ring-2 ring-slate-900 ' : ''
                }${
                  doubted[q.id]
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : answers[q.id]
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                {doubted[q.id] ? `🚩 ${idx + 1}` : idx + 1}
              </button>
            ))}
          </div>
        </div>

        {!submitted ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {currentQ.enunciado}
              </p>
              <button
                type="button"
                onClick={() =>
                  setDoubted((prev) => ({
                    ...prev,
                    [currentQ.id]: !prev[currentQ.id]
                  }))
                }
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  doubted[currentQ.id]
                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{doubted[currentQ.id] ? '🚩 Pregunta Dudada' : '🚩 Marcar con Duda'}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const chosen = answers[currentQ.id] === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [currentQ.id]: letter
                      }))
                    }
                    className={`w-full text-left p-3.5 rounded-xl border text-xs flex items-center gap-3 transition-all cursor-pointer ${
                      chosen
                        ? 'border-sky-600 bg-sky-50 ring-1 ring-sky-600 font-semibold'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg font-mono font-bold flex items-center justify-center shrink-0 ${
                        chosen ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="text-slate-800">{currentQ.opciones[letter]}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex(0)}
                className="px-4 py-2 rounded-xl border border-slate-300 disabled:opacity-40 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Anterior
              </button>
              {stepIndex === 0 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex(1)}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Siguiente Pregunta de Ensayo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Finalizar Prueba Cero (Sin Gastar Intentos)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
              <div className="font-bold text-sm flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>¡Simulación de Prueba Cero Completada con Éxito!</span>
              </div>
              <p>
                Su equipo, cronómetro monotónico (<code>performance.now()</code>), selector de respuestas y marcador de dudas (🚩) funcionan correctamente. <strong>No se ha consumido ningún intento oficial.</strong>
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              {ZERO_TEST_QUESTIONS.map((q, i) => {
                const userAns = answers[q.id];
                const ok = userAns === q.correcta;
                return (
                  <div
                    key={q.id}
                    className={`p-3 rounded-xl border ${
                      ok ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/50 border-amber-200'
                    }`}
                  >
                    <div className="font-bold text-slate-900">
                      Pregunta #{i + 1}: {ok ? '✓ Correcta' : `Respuesta correcta: ${q.correcta}`}
                    </div>
                    <p className="text-slate-600 mt-1">{q.explicacion}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setDoubted({});
                  setStepIndex(0);
                  setSubmitted(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Repetir Simulación</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Volver y Presentar Mi Examen Oficial
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
