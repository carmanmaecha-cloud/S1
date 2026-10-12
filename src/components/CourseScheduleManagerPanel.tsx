import React, { useMemo, useState } from 'react';
import {
  AcademicActivityKey,
  ActivityScheduleWindowConfig,
  ActivityWindowOverrideMode,
  CourseScheduleConfig,
  StudentIndividualExtension,
  StudentRecord
} from '../types';
import {
  evaluateAllCourseActivities,
  getDefaultCourseScheduleConfig,
  SCHEDULE_QUICK_PRESETS,
  ScheduleQuickPreset
} from '../utils/academicScheduleEngine';

interface CourseScheduleManagerPanelProps {
  scheduleConfig?: CourseScheduleConfig;
  students?: StudentRecord[];
  roleLabel: 'DOCENTE' | 'EDITOR';
  courseName?: string;
  onSaveScheduleConfig: (
    nextSchedule: CourseScheduleConfig,
    auditDescription: string
  ) => void;
}

const DAY_BUTTONS = [
  { day: 1, short: 'Lun', full: 'Lunes' },
  { day: 2, short: 'Mar', full: 'Martes' },
  { day: 3, short: 'Mié', full: 'Miércoles' },
  { day: 4, short: 'Jue', full: 'Jueves' },
  { day: 5, short: 'Vie', full: 'Viernes' },
  { day: 6, short: 'Sáb', full: 'Sábado' },
  { day: 0, short: 'Dom', full: 'Domingo' }
];

const ACTIVITY_ORDER: AcademicActivityKey[] = [
  'CURSO_GENERAL',
  'EXAMENES',
  'TRABAJOS_TALLERES',
  'MINI_RETOS',
  'PARTICIPACION_ASISTENCIA'
];

export const CourseScheduleManagerPanel: React.FC<CourseScheduleManagerPanelProps> = ({
  scheduleConfig,
  students = [],
  roleLabel,
  courseName = 'Curso Activo',
  onSaveScheduleConfig
}) => {
  const currentConfig = useMemo(
    () => getDefaultCourseScheduleConfig({ courseScheduleConfig: scheduleConfig }),
    [scheduleConfig]
  );

  const [selectedActivityTab, setSelectedActivityTab] =
    useState<AcademicActivityKey>('EXAMENES');

  // R9: Estado del Simulador de Viaje en el Tiempo (Time-Travel Preview)
  const [timeTravelActive, setTimeTravelActive] = useState(false);
  const [simulatedDateStr, setSimulatedDateStr] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [simulatedTimeStr, setSimulatedTimeStr] = useState<string>('09:30');
  const [simulatedStudentId, setSimulatedStudentId] = useState<string>('');

  // R4: Formulario para nueva Prórroga / Excepción Individual por Estudiante
  const [extStudentId, setExtStudentId] = useState<string>('');
  const [extActivityKey, setExtActivityKey] =
    useState<AcademicActivityKey>('EXAMENES');
  const [extExpiresDate, setExtExpiresDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [extExpiresTime, setExtExpiresTime] = useState<string>('23:59');
  const [extMotivo, setExtMotivo] = useState<string>('');
  const [extSinPenalizacion, setExtSinPenalizacion] = useState<boolean>(true);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const notifySaved = (msg: string) => {
    setStatusFeedback(msg);
    window.setTimeout(() => {
      setStatusFeedback((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const referenceDateForEvaluation = useMemo(() => {
    if (!timeTravelActive) return new Date();
    const [y, m, d] = (simulatedDateStr || '2026-06-15').split('-').map(Number);
    const [hh, mm] = (simulatedTimeStr || '09:30').split(':').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  }, [timeTravelActive, simulatedDateStr, simulatedTimeStr]);

  const evaluatedStatuses = useMemo(
    () =>
      evaluateAllCourseActivities(
        currentConfig,
        referenceDateForEvaluation,
        simulatedStudentId || undefined
      ),
    [currentConfig, referenceDateForEvaluation, simulatedStudentId]
  );

  const handleUpdateCourseGlobalDates = (
    patch: Partial<
      Pick<
        CourseScheduleConfig,
        | 'courseOpenDate'
        | 'courseOpenTime'
        | 'courseCloseDate'
        | 'courseCloseTime'
        | 'courseStatusOverride'
        | 'readOnlyWhenClosed'
      >
    >,
    description: string
  ) => {
    const nextCourseOpenDate = patch.courseOpenDate ?? currentConfig.courseOpenDate;
    const nextCourseCloseDate = patch.courseCloseDate ?? currentConfig.courseCloseDate;
    const nextCourseOpenTime = patch.courseOpenTime ?? currentConfig.courseOpenTime;
    const nextCourseCloseTime = patch.courseCloseTime ?? currentConfig.courseCloseTime;
    const nextOverride =
      patch.courseStatusOverride ?? currentConfig.courseStatusOverride;
    const nextReadOnly =
      patch.readOnlyWhenClosed ?? currentConfig.readOnlyWhenClosed;

    const nextConfig: CourseScheduleConfig = {
      ...currentConfig,
      courseOpenDate: nextCourseOpenDate,
      courseOpenTime: nextCourseOpenTime,
      courseCloseDate: nextCourseCloseDate,
      courseCloseTime: nextCourseCloseTime,
      courseStatusOverride: nextOverride,
      readOnlyWhenClosed: nextReadOnly,
      activityWindows: {
        ...currentConfig.activityWindows,
        CURSO_GENERAL: {
          ...currentConfig.activityWindows.CURSO_GENERAL,
          openDate: nextCourseOpenDate,
          closeDate: nextCourseCloseDate,
          startTime: nextCourseOpenTime,
          endTime: nextCourseCloseTime,
          overrideMode: nextOverride,
          readOnlyAfterClose: nextReadOnly
        }
      },
      updatedAtIso: new Date().toISOString()
    };

    onSaveScheduleConfig(nextConfig, description);
    notifySaved(description);
  };

  const handleUpdateActivityWindow = (
    key: AcademicActivityKey,
    patch: Partial<ActivityScheduleWindowConfig>,
    description: string
  ) => {
    const prevWindow = currentConfig.activityWindows[key];
    const updatedWindow: ActivityScheduleWindowConfig = {
      ...prevWindow,
      ...patch
    };

    const nextConfig: CourseScheduleConfig = {
      ...currentConfig,
      ...(key === 'CURSO_GENERAL'
        ? {
            courseOpenDate: updatedWindow.openDate,
            courseCloseDate: updatedWindow.closeDate,
            courseOpenTime: updatedWindow.startTime,
            courseCloseTime: updatedWindow.endTime,
            courseStatusOverride: updatedWindow.overrideMode,
            readOnlyWhenClosed: updatedWindow.readOnlyAfterClose
          }
        : {}),
      activityWindows: {
        ...currentConfig.activityWindows,
        [key]: updatedWindow
      },
      updatedAtIso: new Date().toISOString()
    };

    onSaveScheduleConfig(nextConfig, description);
    notifySaved(description);
  };

  const handleToggleAllowedDay = (key: AcademicActivityKey, dayNum: number) => {
    const win = currentConfig.activityWindows[key];
    const exists = win.allowedDays.includes(dayNum);
    const nextDays = exists
      ? win.allowedDays.filter((d) => d !== dayNum)
      : [...win.allowedDays, dayNum].sort((a, b) => a - b);

    handleUpdateActivityWindow(
      key,
      { allowedDays: nextDays, enabled: true },
      `Días permitidos actualizados en ${win.label}`
    );
  };

  const handleApplyQuickPreset = (
    preset: ScheduleQuickPreset,
    target: AcademicActivityKey | 'ALL_ACTIVITIES'
  ) => {
    if (target === 'ALL_ACTIVITIES') {
      const nextWindows = { ...currentConfig.activityWindows };
      (['EXAMENES', 'TRABAJOS_TALLERES', 'MINI_RETOS', 'PARTICIPACION_ASISTENCIA'] as AcademicActivityKey[]).forEach(
        (k) => {
          nextWindows[k] = {
            ...nextWindows[k],
            enabled: true,
            overrideMode: 'AUTO_CALENDAR',
            allowedDays: [...preset.allowedDays],
            startTime: preset.startTime,
            endTime: preset.endTime,
            allowLateSubmission: preset.allowLateSubmission,
            lateGraceHours: preset.lateGraceHours,
            latePenaltyPercent: preset.latePenaltyPercent,
            maxGradeOnLate: preset.maxGradeOnLate
          };
        }
      );

      const nextConfig: CourseScheduleConfig = {
        ...currentConfig,
        activityWindows: nextWindows,
        updatedAtIso: new Date().toISOString()
      };
      onSaveScheduleConfig(
        nextConfig,
        `Plantilla rápida «${preset.name}» aplicada a todas las actividades`
      );
      notifySaved(`Plantilla «${preset.name}» aplicada a todas las actividades`);
      return;
    }

    const win = currentConfig.activityWindows[target];
    handleUpdateActivityWindow(
      target,
      {
        enabled: true,
        overrideMode: 'AUTO_CALENDAR',
        allowedDays: [...preset.allowedDays],
        startTime: preset.startTime,
        endTime: preset.endTime,
        allowLateSubmission: preset.allowLateSubmission,
        lateGraceHours: preset.lateGraceHours,
        latePenaltyPercent: preset.latePenaltyPercent,
        maxGradeOnLate: preset.maxGradeOnLate
      },
      `Plantilla rápida «${preset.name}» aplicada a ${win.label}`
    );
  };

  const handleGrantStudentExtension = () => {
    if (!extStudentId) return;
    const stu = students.find((s) => s.id === extStudentId);
    if (!stu) return;
    const actWin = currentConfig.activityWindows[extActivityKey];
    const expiresAtIso = `${extExpiresDate}T${extExpiresTime || '23:59'}:00`;

    const newExt: StudentIndividualExtension = {
      id: `EXT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      studentId: stu.id,
      studentName: stu.nombre,
      activityKey: extActivityKey,
      activityLabel: actWin?.label || extActivityKey,
      expiresAtIso,
      motivo: extMotivo.trim() || 'Prórroga académica autorizada por el docente',
      sinPenalizacion: extSinPenalizacion,
      grantedBy: roleLabel,
      createdAtIso: new Date().toISOString(),
      activa: true
    };

    const nextConfig: CourseScheduleConfig = {
      ...currentConfig,
      studentExtensions: [newExt, ...(currentConfig.studentExtensions || [])],
      updatedAtIso: new Date().toISOString()
    };

    onSaveScheduleConfig(
      nextConfig,
      `Prórroga individual otorgada a ${stu.nombre} en ${newExt.activityLabel} hasta ${extExpiresDate} ${extExpiresTime}`
    );
    setExtMotivo('');
    notifySaved(`Prórroga activa creada para ${stu.nombre}`);
  };

  const handleRevokeStudentExtension = (extId: string) => {
    const targetExt = currentConfig.studentExtensions.find((e) => e.id === extId);
    const nextExtensions = (currentConfig.studentExtensions || []).filter(
      (e) => e.id !== extId
    );
    const nextConfig: CourseScheduleConfig = {
      ...currentConfig,
      studentExtensions: nextExtensions,
      updatedAtIso: new Date().toISOString()
    };
    onSaveScheduleConfig(
      nextConfig,
      `Prórroga individual revocada para ${targetExt?.studentName || extId}`
    );
    notifySaved('Prórroga individual eliminada');
  };

  const activeWindow = currentConfig.activityWindows[selectedActivityTab];
  const activeEval = evaluatedStatuses[selectedActivityTab];

  return (
    <div className="space-y-6">
      {/* Banner superior de confirmación */}
      {statusFeedback && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-lg">
          <span>✅ {statusFeedback} · Sincronizado en tiempo real con el Panel Estudiante.</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-emerald-300 hover:text-white ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          R1: VIGENCIA GENERAL DEL CURSO (FECHA DE APERTURA Y CIERRE GLOBAL)
         ===================================================================== */}
      <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
                R1 · Vigencia General del Curso
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {courseName}
              </span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              🏛️ Apertura (Habilitado) y Cierre (Deshabilitado) del Curso Completo
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Define el rango oficial de fechas y horas en que el curso estará abierto. Al cerrarse, puedes activar el Modo Consulta (Solo Lectura) para que el estudiante vea sus notas sin presentar nuevas pruebas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { mode: 'AUTO_CALENDAR', label: '📅 Automático por Fechas' },
                { mode: 'FORCE_OPEN', label: '🟢 Forzar Curso Abierto' },
                { mode: 'FORCE_CLOSED', label: '🔴 Forzar Curso Cerrado' }
              ] as { mode: ActivityWindowOverrideMode; label: string }[]
            ).map((btn) => {
              const isSelected = currentConfig.courseStatusOverride === btn.mode;
              return (
                <button
                  key={btn.mode}
                  type="button"
                  onClick={() => {
                    handleUpdateCourseGlobalDates(
                      { courseStatusOverride: btn.mode },
                      `Estado maestro del curso cambiado a ${btn.label}`
                    );
                    if (btn.mode === 'AUTO_CALENDAR') {
                      handleUpdateActivityWindow(
                        'CURSO_GENERAL',
                        { enabled: true, overrideMode: 'AUTO_CALENDAR' },
                        'Activada vigencia automática por fechas del curso'
                      );
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isSelected
                      ? btn.mode === 'FORCE_CLOSED'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-md'
                        : btn.mode === 'FORCE_OPEN'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                        : 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                      : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4 items-end">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
              🟢 Fecha de Apertura (Inicio)
            </label>
            <input
              type="date"
              value={currentConfig.courseOpenDate}
              onChange={(e) =>
                handleUpdateCourseGlobalDates(
                  { courseOpenDate: e.target.value },
                  `Fecha de apertura del curso actualizada a ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
              🕒 Hora Apertura Curso
            </label>
            <input
              type="time"
              value={currentConfig.courseOpenTime}
              onChange={(e) =>
                handleUpdateCourseGlobalDates(
                  { courseOpenTime: e.target.value },
                  `Hora de apertura del curso actualizada a ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
              🔴 Fecha de Cierre (Fin)
            </label>
            <input
              type="date"
              value={currentConfig.courseCloseDate}
              onChange={(e) =>
                handleUpdateCourseGlobalDates(
                  { courseCloseDate: e.target.value },
                  `Fecha de cierre del curso actualizada a ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
              🕒 Hora Cierre Curso
            </label>
            <input
              type="time"
              value={currentConfig.courseCloseTime}
              onChange={(e) =>
                handleUpdateCourseGlobalDates(
                  { courseCloseTime: e.target.value },
                  `Hora de cierre del curso actualizada a ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 hover:border-indigo-400/60">
              <input
                type="checkbox"
                checked={Boolean(currentConfig.activityWindows.CURSO_GENERAL?.enabled)}
                onChange={(e) =>
                  handleUpdateActivityWindow(
                    'CURSO_GENERAL',
                    {
                      enabled: e.target.checked,
                      overrideMode: 'AUTO_CALENDAR'
                    },
                    e.target.checked
                      ? 'Activado control automático de fechas de apertura/cierre del curso'
                      : 'Desactivada restricción de fechas globales del curso'
                  )
                }
                className="rounded text-indigo-500 focus:ring-0"
              />
              <span className="text-xs font-bold text-slate-200">
                Activar vigencia por fechas
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <input
                type="checkbox"
                checked={Boolean(currentConfig.readOnlyWhenClosed)}
                onChange={(e) =>
                  handleUpdateCourseGlobalDates(
                    { readOnlyWhenClosed: e.target.checked },
                    `Modo Consulta Solo Lectura tras cierre: ${
                      e.target.checked ? 'Habilitado' : 'Deshabilitado'
                    }`
                  )
                }
                className="rounded text-indigo-500 focus:ring-0"
              />
              <span className="text-[11px] text-slate-300">
                Permitir consulta de notas al cerrar
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* =====================================================================
          R7 & R5: TABLERO DE SEMÁFORO GLOBAL DE VENTANAS HORARIAS
         ===================================================================== */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold uppercase tracking-wider">
              R2 · R5 · R7 · Semáforo de Ventanas por Actividad
            </span>
            <h3 className="text-base font-bold text-white mt-1">
              🚦 Estado en Vivo de Actividades (Exámenes, Trabajos, Mini Retos y Participación)
            </h3>
          </div>
          <div className="text-xs text-slate-400">
            Haz clic en cualquier tarjeta para configurar sus fechas, días de la semana, horas y prórrogas:
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {ACTIVITY_ORDER.map((key) => {
            const win = currentConfig.activityWindows[key];
            const ev = evaluatedStatuses[key];
            const isSelected = selectedActivityTab === key;

            const statusColorClasses =
              ev.status === 'OPEN'
                ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300'
                : ev.status === 'LATE_GRACE'
                ? 'border-amber-500/50 bg-amber-950/30 text-amber-300'
                : ev.status === 'EXTENSION_ACTIVE'
                ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300'
                : ev.status === 'UPCOMING'
                ? 'border-yellow-500/40 bg-yellow-950/20 text-yellow-200'
                : 'border-rose-500/50 bg-rose-950/30 text-rose-300';

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedActivityTab(key)}
                className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'ring-2 ring-indigo-400 border-indigo-400 bg-slate-800/95 shadow-lg'
                    : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg">{win.icon}</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusColorClasses}`}
                    >
                      {ev.shortStatusLabel}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white mt-2 line-clamp-1">
                    {win.label}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {win.enabled
                      ? `${win.openDate} → ${win.closeDate}`
                      : 'Sin restricción de calendario'}
                  </div>
                  <div className="text-[11px] text-indigo-300 font-mono mt-0.5">
                    {win.enabled ? `${ev.allowedDaysLabel} · ${ev.hoursRangeLabel}` : '24/7 Continuo'}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-300 font-medium truncate">
                    {ev.countdownText}
                  </span>
                  <span className="text-indigo-400 font-bold ml-1">
                    Configurar →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          R8: PLANTILLAS RÁPIDAS DE PROGRAMACIÓN (1 CLIC)
         ===================================================================== */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
          <div>
            <span className="px-2.5 py-0.5 rounded-md bg-violet-500/20 border border-violet-400/40 text-violet-300 text-[11px] font-bold uppercase tracking-wider">
              R8 · Plantillas Rápidas de Programación (1 Clic)
            </span>
            <h4 className="text-sm font-bold text-white mt-1">
              ⚡ Aplicar Horario Predeterminado a «{activeWindow.label}» o a Todo el Curso
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCHEDULE_QUICK_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{preset.name}</span>
                  <span className="px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-mono">
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{preset.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset(preset, selectedActivityTab)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-[11px] font-bold transition"
                >
                  Aplicar a {activeWindow.icon} seleccionada
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset(preset, 'ALL_ACTIVITIES')}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition"
                  title="Aplicar esta plantilla a Exámenes, Trabajos, Mini Retos y Participación"
                >
                  A todas
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          R2 & R3: EDITOR DETALLADO DE LA ACTIVIDAD SELECCIONADA
         ===================================================================== */}
      <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/95 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeWindow.icon}</span>
              <div>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                  R2 & R3 · Configuración Granular de Actividad
                </span>
                <h3 className="text-lg font-bold text-white">
                  {activeWindow.label}
                </h3>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {activeWindow.subtitle} · Estado actual:{' '}
              <strong className="text-white">{activeEval.badgeText}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { mode: 'AUTO_CALENDAR', label: '📅 Según Fechas y Horario' },
                { mode: 'FORCE_OPEN', label: '🟢 Forzar Abierto (Habilitado)' },
                { mode: 'FORCE_CLOSED', label: '🔴 Forzar Cerrado (Deshabilitado)' }
              ] as { mode: ActivityWindowOverrideMode; label: string }[]
            ).map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() =>
                  handleUpdateActivityWindow(
                    selectedActivityTab,
                    {
                      overrideMode: m.mode,
                      ...(m.mode === 'AUTO_CALENDAR' ? { enabled: true } : {})
                    },
                    `Modo de ${activeWindow.label} actualizado a: ${m.label}`
                  )
                }
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  activeWindow.overrideMode === m.mode
                    ? m.mode === 'FORCE_CLOSED'
                      ? 'bg-rose-600 text-white border-rose-400'
                      : m.mode === 'FORCE_OPEN'
                      ? 'bg-emerald-600 text-white border-emerald-400'
                      : 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rango de Fechas y Horas de Apertura / Cierre */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
              Restricción de Fechas/Horas
            </label>
            <button
              type="button"
              onClick={() =>
                handleUpdateActivityWindow(
                  selectedActivityTab,
                  {
                    enabled: !activeWindow.enabled,
                    overrideMode: 'AUTO_CALENDAR'
                  },
                  `${activeWindow.label}: Restricción de calendario ${
                    !activeWindow.enabled ? 'ACTIVADA' : 'DESACTIVADA (24/7)'
                  }`
                )
              }
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                activeWindow.enabled
                  ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
                  : 'bg-slate-950 border-slate-700 text-slate-400'
              }`}
            >
              {activeWindow.enabled
                ? '✓ Rango de Fechas y Horas ACTIVO'
                : '○ Sin Restricción (Abierto 24/7)'}
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
              📅 Fecha Inicio (Desde)
            </label>
            <input
              type="date"
              value={activeWindow.openDate}
              onChange={(e) =>
                handleUpdateActivityWindow(
                  selectedActivityTab,
                  { openDate: e.target.value, enabled: true },
                  `Fecha de apertura de ${activeWindow.label}: ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
              📅 Fecha Cierre (Hasta)
            </label>
            <input
              type="date"
              value={activeWindow.closeDate}
              onChange={(e) =>
                handleUpdateActivityWindow(
                  selectedActivityTab,
                  { closeDate: e.target.value, enabled: true },
                  `Fecha de cierre de ${activeWindow.label}: ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
              🕒 Hora Apertura Diaria
            </label>
            <input
              type="time"
              value={activeWindow.startTime}
              onChange={(e) =>
                handleUpdateActivityWindow(
                  selectedActivityTab,
                  { startTime: e.target.value, enabled: true },
                  `Hora inicio de ${activeWindow.label}: ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
              🕒 Hora Cierre Diaria
            </label>
            <input
              type="time"
              value={activeWindow.endTime}
              onChange={(e) =>
                handleUpdateActivityWindow(
                  selectedActivityTab,
                  { endTime: e.target.value, enabled: true },
                  `Hora cierre de ${activeWindow.label}: ${e.target.value}`
                )
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-mono"
            />
          </div>
        </div>

        {/* Selector de Días de la Semana */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <label className="text-xs font-bold text-slate-200">
              🗓️ Días de la Semana Habilitados para «{activeWindow.label}»:
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleUpdateActivityWindow(
                    selectedActivityTab,
                    { allowedDays: [0, 1, 2, 3, 4, 5, 6], enabled: true },
                    `Todos los días habilitados en ${activeWindow.label}`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
              >
                Todos (Lun-Dom)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateActivityWindow(
                    selectedActivityTab,
                    { allowedDays: [1, 2, 3, 4, 5], enabled: true },
                    `Lunes a Viernes habilitados en ${activeWindow.label}`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
              >
                Lun a Vie
              </button>
              <button
                type="button"
                onClick={() =>
                  handleUpdateActivityWindow(
                    selectedActivityTab,
                    { allowedDays: [6], enabled: true },
                    `Solo Sábados habilitados en ${activeWindow.label}`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
              >
                Solo Sábados
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {DAY_BUTTONS.map((d) => {
              const active = activeWindow.allowedDays.includes(d.day);
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => handleToggleAllowedDay(selectedActivityTab, d.day)}
                  className={`py-2.5 px-2 rounded-xl border text-center transition-all ${
                    active
                      ? 'bg-indigo-600/90 border-indigo-400 text-white font-bold shadow'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <div className="text-xs">{d.short}</div>
                  <div className="text-[10px] opacity-80 hidden sm:block">{d.full}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* R3: Entregas Tardías con Penalización Automática ("Ventana de Gracia") */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                R3 · Entregas Tardías con Penalización Automática
              </span>
              <h4 className="text-sm font-bold text-white mt-1">
                ⏳ Ventana de Gracia / Prórroga Automática tras Hora o Fecha de Cierre
              </h4>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer px-3.5 py-2 rounded-xl bg-slate-950 border border-amber-500/40">
              <input
                type="checkbox"
                checked={Boolean(activeWindow.allowLateSubmission)}
                onChange={(e) =>
                  handleUpdateActivityWindow(
                    selectedActivityTab,
                    { allowLateSubmission: e.target.checked },
                    `Entregas tardías en ${activeWindow.label}: ${
                      e.target.checked ? 'HABILITADAS' : 'DESHABILITADAS'
                    }`
                  )
                }
                className="rounded text-amber-500 focus:ring-0"
              />
              <span className="text-xs font-bold text-amber-200">
                Permitir Entrega Tardía con Descuento
              </span>
            </label>
          </div>

          {activeWindow.allowLateSubmission && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
              <div>
                <label className="block text-[11px] font-bold text-amber-200 mb-1">
                  Horas de Gracia tras el Cierre (h)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={activeWindow.lateGraceHours}
                  onChange={(e) =>
                    handleUpdateActivityWindow(
                      selectedActivityTab,
                      {
                        lateGraceHours: Math.max(1, Math.min(168, Number(e.target.value) || 1))
                      },
                      `Horas de gracia en ${activeWindow.label}: ${e.target.value}h`
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-white text-sm font-mono"
                />
                <span className="text-[10px] text-slate-400">
                  Ej. 24h = 1 día adicional tras el cierre ordinario.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-200 mb-1">
                  Descuento Porcentual por Entrega Tardía (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={5}
                  value={activeWindow.latePenaltyPercent}
                  onChange={(e) =>
                    handleUpdateActivityWindow(
                      selectedActivityTab,
                      {
                        latePenaltyPercent: Math.max(
                          0,
                          Math.min(50, Number(e.target.value) || 0)
                        )
                      },
                      `Penalización tardía en ${activeWindow.label}: -${e.target.value}%`
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-white text-sm font-mono"
                />
                <span className="text-[10px] text-slate-400">
                  Se descuenta automáticamente de la nota obtenida.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-amber-200 mb-1">
                  Nota Máxima Tope en Entrega Tardía (Escala 0.0 - 5.0)
                </label>
                <input
                  type="number"
                  min={3.0}
                  max={5.0}
                  step={0.1}
                  value={activeWindow.maxGradeOnLate}
                  onChange={(e) =>
                    handleUpdateActivityWindow(
                      selectedActivityTab,
                      {
                        maxGradeOnLate: Math.max(
                          1.0,
                          Math.min(5.0, Number(e.target.value) || 4.0)
                        )
                      },
                      `Nota tope en entrega tardía de ${activeWindow.label}: ${e.target.value}`
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-white text-sm font-mono"
                />
                <span className="text-[10px] text-slate-400">
                  Ej. 4.0 impide obtener 5.0 al entregar fuera de fecha.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          R4: EXCEPCIONES INDIVIDUALES / PRÓRROGA POR ESTUDIANTE
         ===================================================================== */}
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 shadow-xl">
        <div className="mb-4">
          <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[11px] font-bold uppercase tracking-wider">
            R4 · Reapertura Selectiva / Excepciones Individuales
          </span>
          <h3 className="text-base font-bold text-white mt-1">
            🔓 Otorgar Prórroga Individual a un Estudiante sin Reabrir a Todo el Grupo
          </h3>
          <p className="text-xs text-slate-400">
            Ideal para casos de incapacidad médica o calamidad doméstica. Habilita la actividad seleccionada únicamente para el estudiante elegido hasta la fecha y hora indicadas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end bg-slate-950/80 p-4 rounded-xl border border-slate-800">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Estudiante Beneficiario
            </label>
            <select
              value={extStudentId}
              onChange={(e) => setExtStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
            >
              <option value="">— Seleccionar estudiante ({students.length}) —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Actividad a Habilitar
            </label>
            <select
              value={extActivityKey}
              onChange={(e) => setExtActivityKey(e.target.value as AcademicActivityKey)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
            >
              {ACTIVITY_ORDER.map((k) => (
                <option key={k} value={k}>
                  {currentConfig.activityWindows[k].icon}{' '}
                  {currentConfig.activityWindows[k].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Fecha Límite Prórroga
            </label>
            <input
              type="date"
              value={extExpiresDate}
              onChange={(e) => setExtExpiresDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Hora Límite
            </label>
            <input
              type="time"
              value={extExpiresTime}
              onChange={(e) => setExtExpiresTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono"
            />
          </div>

          <div>
            <button
              type="button"
              disabled={!extStudentId}
              onClick={handleGrantStudentExtension}
              className="w-full px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold shadow transition"
            >
              + Otorgar Prórroga
            </button>
          </div>

          <div className="lg:col-span-4">
            <input
              type="text"
              value={extMotivo}
              onChange={(e) => setExtMotivo(e.target.value)}
              placeholder="Motivo / Justificación en Audit Log (ej. Excusa médica aprobada sesión S3)..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
              <input
                type="checkbox"
                checked={extSinPenalizacion}
                onChange={(e) => setExtSinPenalizacion(e.target.checked)}
                className="rounded text-cyan-500"
              />
              <span className="text-xs text-slate-200 font-medium">
                Eximir penalización de nota (Calificar sobre 5.0)
              </span>
            </label>
          </div>
        </div>

        {/* Lista de prórrogas individuales otorgadas */}
        {currentConfig.studentExtensions && currentConfig.studentExtensions.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold text-cyan-300">
              Prórrogas Individuales Registradas ({currentConfig.studentExtensions.length}):
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {currentConfig.studentExtensions.map((ext) => {
                const isExpired =
                  new Date(ext.expiresAtIso).getTime() < referenceDateForEvaluation.getTime();
                return (
                  <div
                    key={ext.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isExpired
                        ? 'bg-slate-950/50 border-slate-800 opacity-60'
                        : 'bg-cyan-950/25 border-cyan-500/40'
                    }`}
                  >
                    <div className="text-xs">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>🔓 {ext.studentName}</span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px]">
                          {ext.activityLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        Vence: <strong className="font-mono">{ext.expiresAtIso.replace('T', ' ')}</strong> ·{' '}
                        {ext.sinPenalizacion ? 'Sin penalización (5.0)' : 'Con descuento tardío'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Motivo: {ext.motivo} ({ext.grantedBy})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeStudentExtension(ext.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-bold transition"
                    >
                      Revocar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          R9: SIMULADOR DE VIAJE EN EL TIEMPO (TIME-TRAVEL PREVIEW)
         ===================================================================== */}
      <div className="rounded-2xl border border-fuchsia-500/40 bg-slate-900/95 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <span className="px-2.5 py-0.5 rounded-md bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-300 text-[11px] font-bold uppercase tracking-wider">
              R9 · Simulador de «Viaje en el Tiempo» (Vista Previa de Reglas)
            </span>
            <h3 className="text-base font-bold text-white mt-1">
              ⏱️ Comprobar Qué Verá el Estudiante en Cualquier Fecha y Hora
            </h3>
            <p className="text-xs text-slate-400">
              Elige una fecha, hora y estudiante de prueba para verificar al instante qué actividades estarán abiertas, en prórroga o cerradas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimeTravelActive(!timeTravelActive)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                timeTravelActive
                  ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-lg'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {timeTravelActive
                ? '🟢 Simulador Activo (Volver a Hora Real)'
                : '🧪 Activar Simulador de Fecha/Hora'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="block text-[11px] font-bold text-fuchsia-300 mb-1">
              Fecha Simulada
            </label>
            <input
              type="date"
              value={simulatedDateStr}
              onChange={(e) => {
                setSimulatedDateStr(e.target.value);
                setTimeTravelActive(true);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-fuchsia-300 mb-1">
              Hora Simulada
            </label>
            <input
              type="time"
              value={simulatedTimeStr}
              onChange={(e) => {
                setSimulatedTimeStr(e.target.value);
                setTimeTravelActive(true);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-fuchsia-300 mb-1">
              Simular para Estudiante (Opcional)
            </label>
            <select
              value={simulatedStudentId}
              onChange={(e) => {
                setSimulatedStudentId(e.target.value);
                setTimeTravelActive(true);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
            >
              <option value="">Vista Estándar (Sin prórroga individual)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end gap-1.5">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSimulatedDateStr('2026-05-16'); // Sábado
                  setSimulatedTimeStr('09:30');
                  setTimeTravelActive(true);
                }}
                className="flex-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
              >
                Sáb 09:30
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimulatedDateStr('2026-05-17'); // Domingo
                  setSimulatedTimeStr('23:30');
                  setTimeTravelActive(true);
                }}
                className="flex-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold"
              >
                Dom 23:30
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimeTravelActive(false);
                  setSimulatedStudentId('');
                }}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-fuchsia-300 text-[10px] font-bold"
              >
                Hoy
              </button>
            </div>
          </div>
        </div>

        {/* Resultado en vivo de la simulación */}
        <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-fuchsia-500/30">
          <div className="text-xs font-bold text-fuchsia-200 mb-2.5 flex items-center justify-between">
            <span>
              👁️ Vista Previa del Estudiante en:{' '}
              <span className="font-mono text-white">
                {referenceDateForEvaluation.toLocaleString('es-CO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </span>
            {timeTravelActive && (
              <span className="px-2 py-0.5 rounded bg-fuchsia-500/30 text-fuchsia-200 text-[10px]">
                MODO SIMULACIÓN ACTIVO
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
            {ACTIVITY_ORDER.map((k) => {
              const st = evaluatedStatuses[k];
              return (
                <div
                  key={k}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-white">
                      {st.icon} {st.label}
                    </div>
                    <div className="text-[11px] font-semibold mt-1 text-indigo-300">
                      {st.badgeText}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{st.reasonDetail}</p>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] font-mono text-slate-300">
                    Acceso Estudiante:{' '}
                    <strong className={st.isAccessible ? 'text-emerald-400' : 'text-rose-400'}>
                      {st.isAccessible
                        ? st.status === 'LATE_GRACE'
                          ? `HABILITADO (Tardía -${st.latePenaltyPct}%)`
                          : 'HABILITADO'
                        : st.isReadOnlyConsultation
                        ? 'SOLO LECTURA'
                        : 'BLOQUEADO'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
