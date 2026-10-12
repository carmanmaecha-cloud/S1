import {
  AcademicActivityKey,
  ActivityScheduleWindowConfig,
  CourseScheduleConfig,
  StudentIndividualExtension,
  SystemConfig
} from '../types';

export interface EvaluatedActivityWindowStatus {
  activityKey: AcademicActivityKey;
  label: string;
  icon: string;
  status: 'OPEN' | 'LATE_GRACE' | 'UPCOMING' | 'CLOSED' | 'EXTENSION_ACTIVE';
  isAccessible: boolean;
  isReadOnlyConsultation: boolean;
  badgeText: string;
  shortStatusLabel: string;
  countdownText: string;
  reasonDetail: string;
  scheduleSummaryText: string;
  latePenaltyPct: number;
  maxGradeCap: number;
  activeExtension?: StudentIndividualExtension;
  openDate: string;
  closeDate: string;
  allowedDaysLabel: string;
  hoursRangeLabel: string;
}

export interface ScheduleQuickPreset {
  id: string;
  name: string;
  description: string;
  badge: string;
  allowedDays: number[];
  startTime: string;
  endTime: string;
  allowLateSubmission: boolean;
  lateGraceHours: number;
  latePenaltyPercent: number;
  maxGradeOnLate: number;
}

const DAY_SHORT_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const SCHEDULE_QUICK_PRESETS: ScheduleQuickPreset[] = [
  {
    id: 'SABADOS_JORNADA',
    name: 'Solo Sábados · Jornada Clase',
    description: 'Habilitado únicamente los sábados de 07:00 a 13:00 sin entregas tardías.',
    badge: '📅 Sáb 07:00-13:00',
    allowedDays: [6],
    startTime: '07:00',
    endTime: '13:00',
    allowLateSubmission: false,
    lateGraceHours: 0,
    latePenaltyPercent: 0,
    maxGradeOnLate: 5.0
  },
  {
    id: 'SEMANA_ACADEMICA',
    name: 'Lunes a Viernes · Diurno/Nocturno',
    description: 'Habilitado de lunes a viernes entre 06:00 y 22:00.',
    badge: '🗓️ Lun-Vie 06:00-22:00',
    allowedDays: [1, 2, 3, 4, 5],
    startTime: '06:00',
    endTime: '22:00',
    allowLateSubmission: true,
    lateGraceHours: 12,
    latePenaltyPercent: 10,
    maxGradeOnLate: 4.5
  },
  {
    id: 'FIN_DE_SEMANA',
    name: 'Fin de Semana Intensivo (Vie-Dom)',
    description: 'Abierto viernes, sábado y domingo de 06:00 a 23:59.',
    badge: '🚀 Vie-Dom 06:00-23:59',
    allowedDays: [5, 6, 0],
    startTime: '06:00',
    endTime: '23:59',
    allowLateSubmission: true,
    lateGraceHours: 24,
    latePenaltyPercent: 15,
    maxGradeOnLate: 4.0
  },
  {
    id: 'ABIERTO_24_7',
    name: 'Continuo 24/7 en Rango de Fechas',
    description: 'Disponible todos los días las 24 horas dentro de las fechas de apertura y cierre.',
    badge: '🟢 24/7 Continuo',
    allowedDays: [0, 1, 2, 3, 4, 5, 6],
    startTime: '00:00',
    endTime: '23:59',
    allowLateSubmission: false,
    lateGraceHours: 0,
    latePenaltyPercent: 0,
    maxGradeOnLate: 5.0
  },
  {
    id: 'TRABAJOS_PRORROGA_24H',
    name: 'Trabajos con Prórroga 24h (-15%)',
    description: 'Lunes a sábado hasta las 22:00 + 24h de ventana de gracia con -15% y tope 4.0.',
    badge: '⏳ +24h Tardía (-15%)',
    allowedDays: [1, 2, 3, 4, 5, 6],
    startTime: '06:00',
    endTime: '22:00',
    allowLateSubmission: true,
    lateGraceHours: 24,
    latePenaltyPercent: 15,
    maxGradeOnLate: 4.0
  },
  {
    id: 'EXAMEN_ESTRICTO',
    name: 'Examen Estricto sin Prórroga',
    description: 'Ventana controlada de evaluación sin entregas fuera de tiempo.',
    badge: '🔒 Cierre Estricto',
    allowedDays: [1, 2, 3, 4, 5, 6],
    startTime: '07:00',
    endTime: '21:00',
    allowLateSubmission: false,
    lateGraceHours: 0,
    latePenaltyPercent: 0,
    maxGradeOnLate: 5.0
  }
];

export function formatAllowedDaysLabel(days: number[]): string {
  if (!Array.isArray(days) || days.length === 0) return 'Ningún día seleccionado';
  if (days.length === 7) return 'Todos los días (Lun a Dom)';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
    return 'Lunes a Viernes';
  }
  if (sorted.length === 6 && sorted.every((d, i) => d === i + 1)) {
    return 'Lunes a Sábado';
  }
  return sorted.map((d) => DAY_SHORT_NAMES[d] || '').filter(Boolean).join(', ');
}

export function formatDurationCountdown(diffMs: number): string {
  if (diffMs <= 0) return '0m';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes} min`;
}

export function getDefaultCourseScheduleConfig(
  sysConfig?: Partial<SystemConfig>
): CourseScheduleConfig {
  const existing = sysConfig?.courseScheduleConfig;
  const defaultOpenDate = existing?.courseOpenDate || '2026-01-15';
  const defaultCloseDate = existing?.courseCloseDate || '2026-12-20';
  const defaultOpenTime = existing?.courseOpenTime || '06:00';
  const defaultCloseTime = existing?.courseCloseTime || '23:59';

  const examDays =
    Array.isArray(sysConfig?.diasPermitidos) && sysConfig!.diasPermitidos!.length > 0
      ? sysConfig!.diasPermitidos!
      : [0, 1, 2, 3, 4, 5, 6];
  const examStart = sysConfig?.horaInicioPermitida || '06:00';
  const examEnd = sysConfig?.horaFinPermitida || '23:59';

  const retoDays =
    Array.isArray(sysConfig?.miniRetosDiasPermitidos) &&
    sysConfig!.miniRetosDiasPermitidos!.length > 0
      ? sysConfig!.miniRetosDiasPermitidos!
      : [0, 1, 2, 3, 4, 5, 6];
  const retoStart = sysConfig?.miniRetosHoraInicio || '06:00';
  const retoEnd = sysConfig?.miniRetosHoraFin || '23:59';

  const baseWindows: Record<AcademicActivityKey, ActivityScheduleWindowConfig> = {
    CURSO_GENERAL: {
      activityKey: 'CURSO_GENERAL',
      label: 'Vigencia General del Curso',
      subtitle: 'Apertura y cierre global del aula virtual para todos los módulos',
      icon: '🏛️',
      enabled: false,
      overrideMode: 'AUTO_CALENDAR',
      openDate: defaultOpenDate,
      closeDate: defaultCloseDate,
      allowedDays: [0, 1, 2, 3, 4, 5, 6],
      startTime: defaultOpenTime,
      endTime: defaultCloseTime,
      allowLateSubmission: false,
      lateGraceHours: 0,
      latePenaltyPercent: 0,
      maxGradeOnLate: 5.0,
      readOnlyAfterClose: true,
      customClosedMessage:
        'El curso se encuentra fuera de su fecha de vigencia académica. Puedes consultar tu historial en modo lectura.'
    },
    EXAMENES: {
      activityKey: 'EXAMENES',
      label: 'Exámenes (Módulos e Integral)',
      subtitle: 'Pruebas sumativas por módulo y evaluación integral final',
      icon: '📝',
      enabled: Boolean(sysConfig?.ventanaHorariaActiva),
      overrideMode:
        sysConfig?.examenAbierto === false ? 'FORCE_CLOSED' : 'AUTO_CALENDAR',
      openDate: defaultOpenDate,
      closeDate: defaultCloseDate,
      allowedDays: examDays,
      startTime: examStart,
      endTime: examEnd,
      allowLateSubmission: false,
      lateGraceHours: 2,
      latePenaltyPercent: 15,
      maxGradeOnLate: 4.0,
      readOnlyAfterClose: true,
      customClosedMessage:
        'La ventana de presentación de exámenes se encuentra cerrada en este horario.'
    },
    TRABAJOS_TALLERES: {
      activityKey: 'TRABAJOS_TALLERES',
      label: 'Trabajos, Talleres y Proyecto Aplicado',
      subtitle: 'Entregables prácticos, talleres de clase e insumos de proyecto',
      icon: '📂',
      enabled: false,
      overrideMode: 'AUTO_CALENDAR',
      openDate: defaultOpenDate,
      closeDate: defaultCloseDate,
      allowedDays: [1, 2, 3, 4, 5, 6],
      startTime: '06:00',
      endTime: '22:00',
      allowLateSubmission: true,
      lateGraceHours: 24,
      latePenaltyPercent: 15,
      maxGradeOnLate: 4.0,
      readOnlyAfterClose: true,
      customClosedMessage:
        'El plazo de recepción de trabajos y talleres ha finalizado.'
    },
    MINI_RETOS: {
      activityKey: 'MINI_RETOS',
      label: 'Mini Retos Gamificados e Insignias',
      subtitle: 'Desafíos interactivos por módulo con evaluación y medallas',
      icon: '🎮',
      enabled: sysConfig?.miniRetosSinRestriccionHora === false,
      overrideMode:
        sysConfig?.miniRetosAbiertos === false ? 'FORCE_CLOSED' : 'AUTO_CALENDAR',
      openDate: defaultOpenDate,
      closeDate: defaultCloseDate,
      allowedDays: retoDays,
      startTime: retoStart,
      endTime: retoEnd,
      allowLateSubmission: true,
      lateGraceHours: 12,
      latePenaltyPercent: 10,
      maxGradeOnLate: 4.5,
      readOnlyAfterClose: true,
      customClosedMessage:
        'La zona de Mini Retos está fuera de su horario programado.'
    },
    PARTICIPACION_ASISTENCIA: {
      activityKey: 'PARTICIPACION_ASISTENCIA',
      label: 'Participación, Sustentación y Asistencia',
      subtitle: 'Registro de participación en sesión, sustentaciones y excusas',
      icon: '🙋‍♂️',
      enabled: false,
      overrideMode: 'AUTO_CALENDAR',
      openDate: defaultOpenDate,
      closeDate: defaultCloseDate,
      allowedDays: [1, 2, 3, 4, 5, 6],
      startTime: '07:00',
      endTime: '21:00',
      allowLateSubmission: true,
      lateGraceHours: 48,
      latePenaltyPercent: 10,
      maxGradeOnLate: 4.5,
      readOnlyAfterClose: true,
      customClosedMessage:
        'El registro de participación y asistencia de la sesión se encuentra cerrado.'
    }
  };

  if (existing && existing.activityWindows) {
    return {
      courseOpenDate: existing.courseOpenDate || defaultOpenDate,
      courseOpenTime: existing.courseOpenTime || defaultOpenTime,
      courseCloseDate: existing.courseCloseDate || defaultCloseDate,
      courseCloseTime: existing.courseCloseTime || defaultCloseTime,
      courseStatusOverride: existing.courseStatusOverride || 'AUTO_CALENDAR',
      readOnlyWhenClosed:
        existing.readOnlyWhenClosed !== undefined ? existing.readOnlyWhenClosed : true,
      activityWindows: {
        CURSO_GENERAL: {
          ...baseWindows.CURSO_GENERAL,
          ...(existing.activityWindows.CURSO_GENERAL || {})
        },
        EXAMENES: {
          ...baseWindows.EXAMENES,
          ...(existing.activityWindows.EXAMENES || {})
        },
        TRABAJOS_TALLERES: {
          ...baseWindows.TRABAJOS_TALLERES,
          ...(existing.activityWindows.TRABAJOS_TALLERES || {})
        },
        MINI_RETOS: {
          ...baseWindows.MINI_RETOS,
          ...(existing.activityWindows.MINI_RETOS || {})
        },
        PARTICIPACION_ASISTENCIA: {
          ...baseWindows.PARTICIPACION_ASISTENCIA,
          ...(existing.activityWindows.PARTICIPACION_ASISTENCIA || {})
        }
      },
      studentExtensions: Array.isArray(existing.studentExtensions)
        ? existing.studentExtensions
        : [],
      updatedAtIso: existing.updatedAtIso || new Date().toISOString()
    };
  }

  return {
    courseOpenDate: defaultOpenDate,
    courseOpenTime: defaultOpenTime,
    courseCloseDate: defaultCloseDate,
    courseCloseTime: defaultCloseTime,
    courseStatusOverride: 'AUTO_CALENDAR',
    readOnlyWhenClosed: true,
    activityWindows: baseWindows,
    studentExtensions: [],
    updatedAtIso: new Date().toISOString()
  };
}

function parseDateAndTimeLocal(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function timeStringToMinutes(timeStr: string): number {
  const parts = (timeStr || '00:00').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function evaluateActivityWindowStatus(
  scheduleConfig: CourseScheduleConfig,
  activityKey: AcademicActivityKey,
  referenceDate: Date = new Date(),
  studentId?: string
): EvaluatedActivityWindowStatus {
  const windowCfg =
    scheduleConfig.activityWindows[activityKey] ||
    getDefaultCourseScheduleConfig().activityWindows[activityKey];

  const allowedDaysLabel = formatAllowedDaysLabel(windowCfg.allowedDays);
  const hoursRangeLabel = `${windowCfg.startTime || '00:00'} - ${windowCfg.endTime || '23:59'}`;
  const scheduleSummaryText = windowCfg.enabled
    ? `Fechas: ${windowCfg.openDate} al ${windowCfg.closeDate} · Días: ${allowedDaysLabel} · Horario: ${hoursRangeLabel}`
    : `Disponibilidad continua (${windowCfg.openDate} al ${windowCfg.closeDate})`;

  // 1. Verificar si el estudiante tiene una Prórroga / Excepción Individual Activa (R4)
  if (studentId && Array.isArray(scheduleConfig.studentExtensions)) {
    const matchingExt = scheduleConfig.studentExtensions.find((ext) => {
      if (!ext.activa || ext.studentId !== studentId) return false;
      if (ext.activityKey !== activityKey && ext.activityKey !== 'CURSO_GENERAL') {
        return false;
      }
      const expTime = new Date(ext.expiresAtIso).getTime();
      return Number.isFinite(expTime) && referenceDate.getTime() <= expTime;
    });

    if (matchingExt) {
      const remainingMs = new Date(matchingExt.expiresAtIso).getTime() - referenceDate.getTime();
      const countdown = formatDurationCountdown(remainingMs);
      const penaltyPct = matchingExt.sinPenalizacion ? 0 : windowCfg.latePenaltyPercent || 0;
      return {
        activityKey,
        label: windowCfg.label,
        icon: windowCfg.icon,
        status: 'EXTENSION_ACTIVE',
        isAccessible: true,
        isReadOnlyConsultation: false,
        badgeText: `🔓 Prórroga Individual · Restan ${countdown}`,
        shortStatusLabel: 'Prórroga Activa',
        countdownText: `Vence en ${countdown}`,
        reasonDetail: `Excepción individual otorgada por docente (${matchingExt.motivo}). ${
          matchingExt.sinPenalizacion
            ? 'Sin penalización de nota.'
            : `Penalización aplicable: -${penaltyPct}%.`
        }`,
        scheduleSummaryText,
        latePenaltyPct: penaltyPct,
        maxGradeCap: matchingExt.sinPenalizacion ? 5.0 : windowCfg.maxGradeOnLate || 5.0,
        activeExtension: matchingExt,
        openDate: windowCfg.openDate,
        closeDate: windowCfg.closeDate,
        allowedDaysLabel,
        hoursRangeLabel
      };
    }
  }

  // 2. Si no estamos evaluando CURSO_GENERAL, verificar primero si CURSO_GENERAL está cerrado (R1)
  if (activityKey !== 'CURSO_GENERAL' && windowCfg.overrideMode !== 'FORCE_OPEN') {
    const courseEval = evaluateActivityWindowStatus(
      scheduleConfig,
      'CURSO_GENERAL',
      referenceDate,
      studentId
    );
    if (!courseEval.isAccessible) {
      return {
        activityKey,
        label: windowCfg.label,
        icon: windowCfg.icon,
        status: courseEval.status,
        isAccessible: false,
        isReadOnlyConsultation: Boolean(scheduleConfig.readOnlyWhenClosed),
        badgeText:
          courseEval.status === 'UPCOMING'
            ? `🟡 Curso abre en ${courseEval.countdownText}`
            : '🔴 Curso Cerrado (Modo Consulta)',
        shortStatusLabel: courseEval.status === 'UPCOMING' ? 'Próxima Apertura' : 'Curso Cerrado',
        countdownText: courseEval.countdownText,
        reasonDetail: `El curso general no se encuentra activo (${courseEval.reasonDetail}).`,
        scheduleSummaryText,
        latePenaltyPct: 0,
        maxGradeCap: 5.0,
        openDate: windowCfg.openDate,
        closeDate: windowCfg.closeDate,
        allowedDaysLabel,
        hoursRangeLabel
      };
    }
  }

  // 3. Evaluar Override Manual Forzado (FORCE_OPEN / FORCE_CLOSED)
  const effectiveOverride =
    activityKey === 'CURSO_GENERAL'
      ? scheduleConfig.courseStatusOverride || windowCfg.overrideMode
      : windowCfg.overrideMode;

  if (effectiveOverride === 'FORCE_OPEN') {
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'OPEN',
      isAccessible: true,
      isReadOnlyConsultation: false,
      badgeText: '🟢 Abierto Manualmente por Docente',
      shortStatusLabel: 'Abierto (Manual)',
      countdownText: 'Habilitado sin límite inmediato',
      reasonDetail: 'Habilitado de forma directa desde el centro de control docente.',
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: windowCfg.openDate,
      closeDate: windowCfg.closeDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  if (effectiveOverride === 'FORCE_CLOSED') {
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'CLOSED',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: '🔴 Cerrado Manualmente por Docente',
      shortStatusLabel: 'Cerrado (Manual)',
      countdownText: 'Cerrado por el docente',
      reasonDetail:
        windowCfg.customClosedMessage ||
        'Esta actividad ha sido cerrada manualmente por el docente.',
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: windowCfg.openDate,
      closeDate: windowCfg.closeDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  // 4. Si está en AUTO_CALENDAR pero enabled === false (y no es CURSO_GENERAL con fechas activas)
  const effectiveOpenDate =
    activityKey === 'CURSO_GENERAL'
      ? scheduleConfig.courseOpenDate || windowCfg.openDate
      : windowCfg.openDate;
  const effectiveCloseDate =
    activityKey === 'CURSO_GENERAL'
      ? scheduleConfig.courseCloseDate || windowCfg.closeDate
      : windowCfg.closeDate;
  const effectiveStartTime =
    activityKey === 'CURSO_GENERAL'
      ? scheduleConfig.courseOpenTime || windowCfg.startTime
      : windowCfg.startTime;
  const effectiveEndTime =
    activityKey === 'CURSO_GENERAL'
      ? scheduleConfig.courseCloseTime || windowCfg.endTime
      : windowCfg.endTime;

  if (!windowCfg.enabled) {
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'OPEN',
      isAccessible: true,
      isReadOnlyConsultation: false,
      badgeText: '🟢 Abierto · Sin restricción horaria',
      shortStatusLabel: 'Habilitado',
      countdownText: 'Disponible 24/7',
      reasonDetail: 'Actividad habilitada sin restricción de calendario ni rango de horas.',
      scheduleSummaryText: 'Habilitado permanentemente (Sin restricción de fechas/horas)',
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  const startDateObj = parseDateAndTimeLocal(effectiveOpenDate, effectiveStartTime);
  const endDateObj = parseDateAndTimeLocal(effectiveCloseDate, effectiveEndTime);
  const nowMs = referenceDate.getTime();

  // 5. Antes de la fecha de apertura
  if (startDateObj && nowMs < startDateObj.getTime()) {
    const diffMs = startDateObj.getTime() - nowMs;
    const countdown = formatDurationCountdown(diffMs);
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'UPCOMING',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: `🟡 Abre en ${countdown} (${effectiveOpenDate})`,
      shortStatusLabel: 'Próxima Apertura',
      countdownText: countdown,
      reasonDetail: `Programado para abrir el ${effectiveOpenDate} a las ${effectiveStartTime}.`,
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  // 6. Después de la fecha de cierre definitiva
  if (endDateObj && nowMs > endDateObj.getTime()) {
    const graceMs =
      windowCfg.allowLateSubmission && windowCfg.lateGraceHours > 0
        ? windowCfg.lateGraceHours * 3600 * 1000
        : 0;

    if (graceMs > 0 && nowMs <= endDateObj.getTime() + graceMs) {
      const remGraceMs = endDateObj.getTime() + graceMs - nowMs;
      const countdown = formatDurationCountdown(remGraceMs);
      return {
        activityKey,
        label: windowCfg.label,
        icon: windowCfg.icon,
        status: 'LATE_GRACE',
        isAccessible: true,
        isReadOnlyConsultation: false,
        badgeText: `🟠 Entrega Tardía (-${windowCfg.latePenaltyPercent}%) · Cierra en ${countdown}`,
        shortStatusLabel: `Prórroga Tardía (-${windowCfg.latePenaltyPercent}%)`,
        countdownText: `Cierra definitivo en ${countdown}`,
        reasonDetail: `Ventana ordinaria cerrada el ${effectiveCloseDate} (${effectiveEndTime}). Activa prórroga de entrega tardía con descuento del ${windowCfg.latePenaltyPercent}% (Nota máx: ${windowCfg.maxGradeOnLate.toFixed(1)}).`,
        scheduleSummaryText,
        latePenaltyPct: windowCfg.latePenaltyPercent,
        maxGradeCap: windowCfg.maxGradeOnLate,
        openDate: effectiveOpenDate,
        closeDate: effectiveCloseDate,
        allowedDaysLabel,
        hoursRangeLabel
      };
    }

    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'CLOSED',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: `🔴 Cerrado el ${effectiveCloseDate} (${effectiveEndTime})`,
      shortStatusLabel: 'Cerrado por Fecha',
      countdownText: 'Plazo finalizado',
      reasonDetail:
        windowCfg.customClosedMessage ||
        `La fecha límite de cierre fue el ${effectiveCloseDate} a las ${effectiveEndTime}.`,
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  // 7. Dentro del rango de fechas [openDate, closeDate]: verificar Día de la Semana y Rango de Horas
  const currentDay = referenceDate.getDay();
  const allowedDays = Array.isArray(windowCfg.allowedDays) ? windowCfg.allowedDays : [];

  if (!allowedDays.includes(currentDay)) {
    // Calcular cuántos días faltan para el próximo día permitido
    let daysUntilNext = 1;
    for (let offset = 1; offset <= 7; offset++) {
      const candidateDay = (currentDay + offset) % 7;
      if (allowedDays.includes(candidateDay)) {
        daysUntilNext = offset;
        break;
      }
    }
    const nextDayName = DAY_SHORT_NAMES[(currentDay + daysUntilNext) % 7];
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'UPCOMING',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: `🟡 Abre ${nextDayName} a las ${effectiveStartTime}`,
      shortStatusLabel: `Abre ${nextDayName} ${effectiveStartTime}`,
      countdownText: `Próxima ventana: ${nextDayName} ${effectiveStartTime}`,
      reasonDetail: `Hoy (${DAY_SHORT_NAMES[currentDay]}) no está habilitado. Días permitidos: ${allowedDaysLabel} en horario ${effectiveStartTime} - ${effectiveEndTime}.`,
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  // Verificar rango de horas del día actual
  const currentMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const startMinutes = timeStringToMinutes(effectiveStartTime);
  const endMinutes = timeStringToMinutes(effectiveEndTime);

  if (currentMinutes < startMinutes) {
    const diffMs = (startMinutes - currentMinutes) * 60000;
    const countdown = formatDurationCountdown(diffMs);
    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'UPCOMING',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: `🟡 Abre hoy en ${countdown} (${effectiveStartTime})`,
      shortStatusLabel: `Abre ${effectiveStartTime}`,
      countdownText: `Abre en ${countdown}`,
      reasonDetail: `La ventana horaria de hoy inicia a las ${effectiveStartTime} y cierra a las ${effectiveEndTime}.`,
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  if (currentMinutes > endMinutes) {
    // Verificar si aplica ventana de gracia diaria por entrega tardía (R3)
    const minutesAfterClose = currentMinutes - endMinutes;
    const graceMinutes =
      windowCfg.allowLateSubmission && windowCfg.lateGraceHours > 0
        ? windowCfg.lateGraceHours * 60
        : 0;

    if (graceMinutes > 0 && minutesAfterClose <= graceMinutes) {
      const remGraceMs = (graceMinutes - minutesAfterClose) * 60000;
      const countdown = formatDurationCountdown(remGraceMs);
      return {
        activityKey,
        label: windowCfg.label,
        icon: windowCfg.icon,
        status: 'LATE_GRACE',
        isAccessible: true,
        isReadOnlyConsultation: false,
        badgeText: `🟠 Entrega Tardía (-${windowCfg.latePenaltyPercent}%) · Restan ${countdown}`,
        shortStatusLabel: `Tardía (-${windowCfg.latePenaltyPercent}%)`,
        countdownText: `Cierra en ${countdown}`,
        reasonDetail: `Horario ordinario (${effectiveEndTime}) vencido. Recepción tardía activa con -${windowCfg.latePenaltyPercent}% y nota tope ${windowCfg.maxGradeOnLate.toFixed(1)}.`,
        scheduleSummaryText,
        latePenaltyPct: windowCfg.latePenaltyPercent,
        maxGradeCap: windowCfg.maxGradeOnLate,
        openDate: effectiveOpenDate,
        closeDate: effectiveCloseDate,
        allowedDaysLabel,
        hoursRangeLabel
      };
    }

    return {
      activityKey,
      label: windowCfg.label,
      icon: windowCfg.icon,
      status: 'CLOSED',
      isAccessible: false,
      isReadOnlyConsultation: Boolean(windowCfg.readOnlyAfterClose),
      badgeText: `🔴 Cerrado hoy a las ${effectiveEndTime}`,
      shortStatusLabel: `Cerró ${effectiveEndTime}`,
      countdownText: `Horario ${effectiveStartTime} - ${effectiveEndTime} finalizado`,
      reasonDetail: `La jornada de hoy finalizó a las ${effectiveEndTime}. Próxima apertura según días habilitados (${allowedDaysLabel}).`,
      scheduleSummaryText,
      latePenaltyPct: 0,
      maxGradeCap: 5.0,
      openDate: effectiveOpenDate,
      closeDate: effectiveCloseDate,
      allowedDaysLabel,
      hoursRangeLabel
    };
  }

  // 8. Está ABIERTO en horario ordinario: calcular cuánto falta para cerrar hoy o en fecha final
  const remainingTodayMs = (endMinutes - currentMinutes) * 60000;
  const remainingCourseMs = endDateObj ? endDateObj.getTime() - nowMs : remainingTodayMs;
  const effectiveRemainingMs = Math.min(remainingTodayMs, remainingCourseMs);
  const countdown = formatDurationCountdown(effectiveRemainingMs);

  return {
    activityKey,
    label: windowCfg.label,
    icon: windowCfg.icon,
    status: 'OPEN',
    isAccessible: true,
    isReadOnlyConsultation: false,
    badgeText: `🟢 Abierto · Cierra en ${countdown}`,
    shortStatusLabel: 'Abierto Ahora',
    countdownText: `Cierra en ${countdown}`,
    reasonDetail: `Disponible hoy hasta las ${effectiveEndTime} (Vigencia hasta ${effectiveCloseDate}).`,
    scheduleSummaryText,
    latePenaltyPct: 0,
    maxGradeCap: 5.0,
    openDate: effectiveOpenDate,
    closeDate: effectiveCloseDate,
    allowedDaysLabel,
    hoursRangeLabel
  };
}

export function evaluateAllCourseActivities(
  scheduleConfig: CourseScheduleConfig,
  referenceDate: Date = new Date(),
  studentId?: string
): Record<AcademicActivityKey, EvaluatedActivityWindowStatus> {
  const keys: AcademicActivityKey[] = [
    'CURSO_GENERAL',
    'EXAMENES',
    'TRABAJOS_TALLERES',
    'MINI_RETOS',
    'PARTICIPACION_ASISTENCIA'
  ];
  const result = {} as Record<AcademicActivityKey, EvaluatedActivityWindowStatus>;
  for (const key of keys) {
    result[key] = evaluateActivityWindowStatus(scheduleConfig, key, referenceDate, studentId);
  }
  return result;
}

export function applyLateSubmissionPenalty(
  rawGrade5: number,
  evalStatus: EvaluatedActivityWindowStatus
): {
  finalGrade: number;
  penaltyApplied: boolean;
  penaltyDetail: string;
} {
  if (
    evalStatus.status !== 'LATE_GRACE' &&
    !(evalStatus.status === 'EXTENSION_ACTIVE' && evalStatus.latePenaltyPct > 0)
  ) {
    return {
      finalGrade: Number(rawGrade5.toFixed(2)),
      penaltyApplied: false,
      penaltyDetail: ''
    };
  }

  const discountFactor = Math.max(0, 1 - (evalStatus.latePenaltyPct || 0) / 100);
  const discounted = rawGrade5 * discountFactor;
  const capped = Math.min(discounted, evalStatus.maxGradeCap || 5.0);
  const finalGrade = Math.max(0, Number(capped.toFixed(2)));

  return {
    finalGrade,
    penaltyApplied: finalGrade < rawGrade5,
    penaltyDetail: `Entrega en ventana tardía (-${evalStatus.latePenaltyPct}%, tope ${evalStatus.maxGradeCap.toFixed(1)}): Nota original ${rawGrade5.toFixed(2)} → Nota aplicada ${finalGrade.toFixed(2)}`
  };
}
