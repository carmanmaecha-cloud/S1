import type {
  StudentRecord,
  ExamAttemptResult,
  ExamModality,
  SystemConfig,
  StudentServerAcademicSummary,
  StudentExamModalitySummary,
  StudentRetoModalitySummary,
  MiniRetoAttemptRecord
} from '../types.ts';

export const OFFICIAL_EXAM_MODALITIES: {
  id: ExamModality;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'integral', label: 'Examen Integral (M1-M5)', shortLabel: 'Integral' },
  { id: 'mod1', label: 'Examen Módulo 1', shortLabel: 'Módulo 1' },
  { id: 'mod2', label: 'Examen Módulo 2', shortLabel: 'Módulo 2' },
  { id: 'mod3', label: 'Examen Módulo 3', shortLabel: 'Módulo 3' },
  { id: 'mod4', label: 'Examen Módulo 4', shortLabel: 'Módulo 4' },
  { id: 'mod5', label: 'Examen Módulo 5', shortLabel: 'Módulo 5' }
];

export const OFFICIAL_RETO_MODULES: {
  modulo: 1 | 2 | 3 | 4 | 5;
  label: string;
  shortLabel: string;
}[] = [
  { modulo: 1, label: 'Mini Reto Módulo 1', shortLabel: 'Reto M1' },
  { modulo: 2, label: 'Mini Reto Módulo 2', shortLabel: 'Reto M2' },
  { modulo: 3, label: 'Mini Reto Módulo 3', shortLabel: 'Reto M3' },
  { modulo: 4, label: 'Mini Reto Módulo 4', shortLabel: 'Reto M4' },
  { modulo: 5, label: 'Mini Reto Módulo 5', shortLabel: 'Reto M5' }
];

/**
 * Returns the effective number of preventive anti-cheat warnings ("llamados de atención")
 * allowed for a specific student before automatic 0.0 / 5.0 suspension on the next infraction.
 */
export function getEffectiveMaxLlamadosAtencion(
  student: Pick<StudentRecord, 'id' | 'maxLlamadosAtencionIndividual'> | null | undefined,
  config: SystemConfig | null | undefined
): number {
  if (
    student &&
    typeof student.maxLlamadosAtencionIndividual === 'number' &&
    !Number.isNaN(student.maxLlamadosAtencionIndividual)
  ) {
    return Math.max(0, Math.min(10, Math.floor(student.maxLlamadosAtencionIndividual)));
  }

  if (
    student?.id &&
    config?.llamadosAtencionPorEstudiante &&
    typeof config.llamadosAtencionPorEstudiante[student.id] === 'number'
  ) {
    return Math.max(
      0,
      Math.min(10, Math.floor(config.llamadosAtencionPorEstudiante[student.id]))
    );
  }

  if (typeof config?.maxLlamadosAtencionGlobal === 'number' && !Number.isNaN(config.maxLlamadosAtencionGlobal)) {
    return Math.max(0, Math.min(10, Math.floor(config.maxLlamadosAtencionGlobal)));
  }

  return 1;
}

/**
 * Computes and returns the complete server-persisted academic summary for a student:
 * - Which exams they took, how many attempts, grades, questions that came out, and which exams are missing.
 * - Which mini retos they took, attempts, grades/scores, badges, and which mini retos are missing.
 */
export function computeStudentServerSummary(
  student: StudentRecord,
  allAttempts: ExamAttemptResult[],
  notaMinimaAprobacion = 3.0
): StudentServerAcademicSummary {
  const studentAttempts = (Array.isArray(allAttempts) ? allAttempts : [])
    .filter((a) => a && String(a.studentId).toUpperCase() === String(student.id).toUpperCase())
    .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));

  const maxAllowedExamAttempts = student.maxIntentosPermitidos ?? 2;

  const detalleModalidadesExamen: StudentExamModalitySummary[] = OFFICIAL_EXAM_MODALITIES.map(
    (modInfo) => {
      const modAttempts = studentAttempts.filter(
        (a) => (a.modalidad || 'integral') === modInfo.id
      );
      const realizado = modAttempts.length > 0;
      const mejorNota = realizado
        ? Math.max(...modAttempts.map((a) => Number(a.notaColombiana) || 0))
        : 0;
      const ultimaNota = realizado ? Number(modAttempts[0].notaColombiana) || 0 : 0;
      const porcentajeMejor = realizado
        ? Math.max(...modAttempts.map((a) => Number(a.porcentaje) || 0))
        : 0;
      const anySuspended = modAttempts.some((a) => a.estado === 'SUSPENDIDO');
      const estado: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO' | 'PENDIENTE' = !realizado
        ? 'PENDIENTE'
        : anySuspended && mejorNota === 0
        ? 'SUSPENDIDO'
        : mejorNota >= notaMinimaAprobacion
        ? 'APROBADO'
        : 'REPROBADO';

      const allQuestionsInMod = Array.from(
        new Set(
          modAttempts.flatMap((a) =>
            Array.isArray(a.respuestasDetalle)
              ? a.respuestasDetalle.map((r) => r.questionId).filter(Boolean)
              : []
          )
        )
      );

      const fallbackUsedQuestions =
        student.preguntasUsadasPorModalidad?.[modInfo.id] ||
        (modInfo.id === 'integral'
          ? [...(student.preguntasIntento1 || []), ...(student.preguntasIntento2 || [])]
          : []);

      const preguntasSalieronIds =
        allQuestionsInMod.length > 0
          ? allQuestionsInMod
          : Array.from(new Set(fallbackUsedQuestions));

      const llamadosMod = modAttempts.reduce(
        (acc, a) => acc + (Number(a.incidenciasCount) || 0),
        0
      );

      return {
        modalidad: modInfo.id,
        modalidadLabel: modInfo.label,
        realizado,
        intentosUtilizados: modAttempts.length,
        maxIntentosPermitidos: maxAllowedExamAttempts,
        mejorNota: Number(mejorNota.toFixed(2)),
        ultimaNota: Number(ultimaNota.toFixed(2)),
        porcentajeMejor,
        estado,
        ultimaFecha: modAttempts[0]?.fecha,
        preguntasSalieronIds,
        totalPreguntas: modAttempts[0]?.totalPreguntas || preguntasSalieronIds.length,
        llamadosAtencion: llamadosMod
      };
    }
  );

  const examenesRealizadosLabels = detalleModalidadesExamen
    .filter((d) => d.realizado)
    .map(
      (d) =>
        `${d.modalidadLabel.replace('Examen ', '')}: ${d.mejorNota.toFixed(1)} (${d.intentosUtilizados} int.)`
    );

  const examenesFaltantesLabels = detalleModalidadesExamen
    .filter((d) => !d.realizado)
    .map((d) => d.modalidadLabel.replace('Examen ', ''));

  const notaDefinitivaExamenes =
    student.suspendido && studentAttempts.every((a) => a.estado === 'SUSPENDIDO')
      ? 0.0
      : studentAttempts.length > 0
      ? Number(Math.max(...studentAttempts.map((a) => Number(a.notaColombiana) || 0)).toFixed(2))
      : 0.0;

  // Mini Retos per Module (1 to 5)
  const globalRetoMap = new Map<string, MiniRetoAttemptRecord>();
  if (Array.isArray(student.historialIntentosRetos)) {
    student.historialIntentosRetos.filter(Boolean).forEach((r) => {
      if (r.attemptId) globalRetoMap.set(r.attemptId, r);
    });
  }
  ([1, 2, 3, 4, 5] as const).forEach((m) => {
    const hist = student.progresoRetos?.[m]?.historialIntentos;
    if (Array.isArray(hist)) {
      hist.filter(Boolean).forEach((r) => {
        if (r.attemptId) globalRetoMap.set(r.attemptId, r);
      });
    }
  });
  const allRetoAttempts = Array.from(globalRetoMap.values()).sort(
    (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
  );

  const detalleModulosRetos: StudentRetoModalitySummary[] = OFFICIAL_RETO_MODULES.map((mInfo) => {
    const m = mInfo.modulo;
    const modProg = student.progresoRetos?.[m];
    const modAttempts = allRetoAttempts.filter((r) => Number(r.modulo) === m);
    const intentosUtilizados = Math.max(modProg?.intentosUsados || 0, modAttempts.length);
    const realizado = intentosUtilizados > 0;
    const mejorPorcentaje = Math.max(
      modProg?.mejorPorcentaje || 0,
      modAttempts.length > 0 ? Math.max(...modAttempts.map((r) => Number(r.porcentajeIA) || 0)) : 0
    );
    const aprobado = Boolean(
      modProg?.insigniaDesbloqueada || modAttempts.some((r) => Boolean(r.aprobado))
    );
    const suspendidoPorTrampa = Boolean(
      modProg?.suspendidoPorTrampa ||
        (modAttempts.length > 0 && modAttempts.every((r) => Boolean(r.suspendidoPorTrampa)))
    );
    const notaEquivalenteEscala5 = suspendidoPorTrampa
      ? 0.0
      : Number(((mejorPorcentaje / 100) * 5.0).toFixed(1));

    return {
      modulo: m,
      moduloLabel: mInfo.label,
      realizado,
      intentosUtilizados,
      maxIntentos: modProg?.maxIntentos || 3,
      mejorPorcentaje,
      notaEquivalenteEscala5,
      aprobado,
      insigniaDesbloqueada: Boolean(modProg?.insigniaDesbloqueada || aprobado),
      suspendidoPorTrampa,
      ultimaFecha: modAttempts[0]?.fecha || modProg?.fechaDesbloqueo,
      ultimoTituloReto: modAttempts[0]?.tituloReto
    };
  });

  const retosRealizadosLabels = detalleModulosRetos
    .filter((r) => r.realizado)
    .map(
      (r) =>
        `M${r.modulo}: ${r.notaEquivalenteEscala5.toFixed(1)} (${r.mejorPorcentaje}% · ${r.intentosUtilizados}/3 int.)`
    );

  const retosFaltantesLabels = detalleModulosRetos
    .filter((r) => !r.realizado)
    .map((r) => `Módulo ${r.modulo}`);

  const examWarningsTotal = studentAttempts.reduce(
    (acc, a) => acc + (Number(a.incidenciasCount) || 0),
    0
  );
  const retoWarningsTotal = allRetoAttempts.reduce(
    (acc, r) => acc + (Number(r.advertenciasRegistradas) || 0),
    0
  );
  const logCount = Array.isArray(student.historialLlamadosAtencion)
    ? student.historialLlamadosAtencion.length
    : 0;
  const totalLlamadosAntiTrampa = Math.max(logCount, examWarningsTotal + retoWarningsTotal);

  return {
    actualizadoEnServidorIso: new Date().toISOString(),
    totalExamenesRealizadosIntentos: studentAttempts.length,
    modalidadesExamenRealizadasCount: detalleModalidadesExamen.filter((d) => d.realizado).length,
    modalidadesExamenFaltantesCount: detalleModalidadesExamen.filter((d) => !d.realizado).length,
    notaDefinitivaExamenes,
    examenesRealizadosLabels,
    examenesFaltantesLabels,
    detalleModalidadesExamen,
    totalRetosRealizadosIntentos: allRetoAttempts.length,
    modulosRetosRealizadosCount: detalleModulosRetos.filter((r) => r.realizado).length,
    modulosRetosFaltantesCount: detalleModulosRetos.filter((r) => !r.realizado).length,
    retosRealizadosLabels,
    retosFaltantesLabels,
    detalleModulosRetos,
    totalLlamadosAntiTrampa
  };
}

/**
 * Enriches a list of students with their up-to-date server academic summary
 * and ensures intentosUsados reflects the authoritative attempts count.
 */
export function enrichStudentsWithServerSummary(
  students: StudentRecord[],
  allAttempts: ExamAttemptResult[],
  notaMinimaAprobacion = 3.0
): StudentRecord[] {
  return (Array.isArray(students) ? students : []).map((st) => {
    const summary = computeStudentServerSummary(st, allAttempts, notaMinimaAprobacion);
    const actualAttemptsCount = Math.max(
      st.intentosUsados || 0,
      summary.totalExamenesRealizadosIntentos
    );
    return {
      ...st,
      intentosUsados: actualAttemptsCount,
      resumenServidor: summary
    };
  });
}
