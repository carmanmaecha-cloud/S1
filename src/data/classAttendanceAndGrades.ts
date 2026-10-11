import { StudentRecord, ExamAttemptResult } from '../types';
import { INITIAL_STUDENTS } from './students';

export type ClassSessionId = 1 | 2 | 3 | 4 | 5 | 6;

export type TrabajoPracticoStatus = 'sin_entregar' | 'pendiente_revision' | 'calificado';

export type AsistenciaBlockStatus =
  | 'sin_registrar'
  | 'llamando'
  | 'presente_virtual'
  | 'presente_manual'
  | 'falla';

export interface ClassGradingWeights {
  comportamientoPct: number; // default 10
  participacionPct: number; // default 30
  examenPct: number; // default 30
  trabajoPct: number; // default 30
}

export interface ClassSupportMaterialItem {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: 'pdf' | 'diapositivas' | 'video' | 'enlace' | 'caso_practico' | 'plantilla';
  url?: string;
  contenidoResumen?: string;
  fechaPublicacion?: string;
}

export interface ClassSessionDefinition {
  id: ClassSessionId;
  code: string;
  title?: string;
  fullTitle: string;
  shortTitle: string;
  subtitle?: string;
  topic?: string;
  focus?: string;
  blocks?: string;
  scheduleLabel?: string;
  examenesCount?: number;
  retosCount?: number;
  documentosEnlaces?: { id: string; titulo: string; url: string; tipo?: string }[];
  enlacesTextoRaw?: string;
  linkedExamModality?: 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5' | 'mod6' | 'integral' | 'ninguno';
  linkedRetoModule?: 1 | 2 | 3 | 4 | 5 | 6 | 0;
  ponderacion?: ClassGradingWeights;
  materialesApoyo?: ClassSupportMaterialItem[];
  guiaEstudioTexto?: string;
}

export const DEFAULT_CLASS_GRADING_WEIGHTS: ClassGradingWeights = {
  comportamientoPct: 10,
  participacionPct: 15,
  examenPct: 35,
  trabajoPct: 40
};

export const OFFICIAL_CLASS_SESSIONS: ClassSessionDefinition[] = [
  {
    id: 1,
    code: 'C1',
    title: 'Clase 1: Fundamentos y Entorno Digital',
    fullTitle: 'Clase 1: Fundamentos y Entorno Digital',
    shortTitle: 'Fundamentos Digitales',
    topic: 'Introducción al ecosistema digital, diagnóstico de mercado local y variables del entorno en La Dorada.',
    focus: 'Introducción al ecosistema digital, diagnóstico de mercado local y variables del entorno en La Dorada.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 2,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'mod1',
    linkedRetoModule: 1,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Analizar las fuerzas del macroentorno y microentorno aplicables al comercio de La Dorada, identificando oportunidades de transformación digital en MiPymes locales.',
    materialesApoyo: [
      {
        id: 'mat-c1-1',
        titulo: 'Guía Base C1: Ecosistema Digital y Diagnóstico de Mercado en La Dorada',
        descripcion: 'Lectura fundamental sobre variables del entorno, digitalización comercial y mapeo competitivo.',
        tipo: 'pdf',
        contenidoResumen:
          '1. Macroentorno (PESTEL local). 2. Microentorno (Clientes, proveedores, competidores directos e indirectos). 3. Matriz de madurez digital para comercios de La Dorada.'
      },
      {
        id: 'mat-c1-2',
        titulo: 'Caso Práctico M1: Diagnóstico de MiPyme Comercial',
        descripcion: 'Ficha de trabajo práctico para levantar el diagnóstico inicial de una empresa del municipio.',
        tipo: 'caso_practico',
        contenidoResumen:
          'Guía paso a paso para evaluar presencia digital, canales de atención por WhatsApp Business y puntos de contacto físico.'
      }
    ]
  },
  {
    id: 2,
    code: 'C2',
    title: 'Clase 2: Comportamiento del Consumidor Online',
    fullTitle: 'Clase 2: Comportamiento del Consumidor Online',
    shortTitle: 'Consumidor Online',
    topic: 'Psicología del consumidor digital, arquetipos de cliente (Buyer Persona) y factores de decisión.',
    focus: 'Psicología del consumidor digital, arquetipos de cliente (Buyer Persona) y factores de decisión.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 2,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'mod2',
    linkedRetoModule: 2,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Construir el perfil de Buyer Persona y el Mapa de Empatía del consumidor doradense, reconociendo frenos y motivadores de compra.',
    materialesApoyo: [
      {
        id: 'mat-c2-1',
        titulo: 'Plantilla Buyer Persona & Mapa de Empatía (Módulo 2)',
        descripcion: 'Estructura metodológica para perfilar hábitos de compra, motivaciones y objeciones.',
        tipo: 'plantilla',
        contenidoResumen:
          'Incluye dimensiones demográficas, psicográficas, comportamiento digital, canales preferidos y disparadores de confianza.'
      }
    ]
  },
  {
    id: 3,
    code: 'C3',
    title: 'Clase 3: Mapeo de Mercado y Segmentación',
    fullTitle: 'Clase 3: Mapeo de Mercado y Segmentación',
    shortTitle: 'Mapeo y Segmentación',
    topic: 'Georreferenciación comercial, fuentes primarias/secundarias y segmentación estratégica.',
    focus: 'Georreferenciación comercial, fuentes primarias/secundarias y segmentación estratégica.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 2,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'mod3',
    linkedRetoModule: 3,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Diseñar instrumentos de recolección de datos (encuestas y observación estructurada) y calcular muestras representativas para validación de mercado.',
    materialesApoyo: [
      {
        id: 'mat-c3-1',
        titulo: 'Manual de Investigación de Mercados y Muestreo Aplicado',
        descripcion: 'Fórmulas de tamaño muestral, diseño de cuestionarios sin sesgo y técnicas de trabajo de campo.',
        tipo: 'pdf',
        contenidoResumen:
          'Investigación cualitativa vs cuantitativa, cálculo de muestra finita e infinita, y validación de hipótesis comerciales.'
      }
    ]
  },
  {
    id: 4,
    code: 'C4',
    title: 'Clase 4: Métricas Digitales y Analítica',
    fullTitle: 'Clase 4: Métricas Digitales y Analítica',
    shortTitle: 'Métricas y Analítica',
    topic: 'KPIs comerciales, embudos de conversión, CAC, LTV y retorno de inversión en campañas.',
    focus: 'KPIs comerciales, embudos de conversión, CAC, LTV y retorno de inversión en campañas.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 2,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'mod4',
    linkedRetoModule: 4,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Dominar las métricas clave de posicionamiento, tasa de conversión, costo de adquisición de cliente (CAC) y valor de vida del cliente (LTV).',
    materialesApoyo: [
      {
        id: 'mat-c4-1',
        titulo: 'Tablero de Indicadores KPI y Fórmulas de Analítica Comercial',
        descripcion: 'Resumen ejecutivo de indicadores de tráfico, conversión, retención y rentabilidad.',
        tipo: 'diapositivas',
        contenidoResumen:
          'CTR, CPC, Tasa de Conversión, CAC, LTV, ROAS y matriz de posicionamiento competitivo.'
      }
    ]
  },
  {
    id: 5,
    code: 'C5',
    title: 'Clase 5: Estrategias de Atracción y Conversión',
    fullTitle: 'Clase 5: Estrategias de Atracción y Conversión',
    shortTitle: 'Atracción y Conversión',
    topic: 'Omnicanalidad, social commerce, embudos por WhatsApp Business y fidelización.',
    focus: 'Omnicanalidad, social commerce, embudos por WhatsApp Business y fidelización.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 2,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'mod5',
    linkedRetoModule: 5,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Articular estrategias omnicanal que integren el punto de venta físico con canales digitales de atracción y cierre de ventas.',
    materialesApoyo: [
      {
        id: 'mat-c5-1',
        titulo: 'Guía de Omnicanalidad, Social Commerce y Embudos de Venta',
        descripcion: 'Estrategias prácticas para convertir prospectos digitales en clientes recurrentes.',
        tipo: 'pdf',
        contenidoResumen:
          'Arquitectura de embudo AIDA, guiones de cierre en WhatsApp Business, programas de recompra y fidelización.'
      }
    ]
  },
  {
    id: 6,
    code: 'C6',
    title: 'Clase 6: Proyecto Integral y Sustentación',
    fullTitle: 'Clase 6: Proyecto Integral y Sustentación',
    shortTitle: 'Sustentación Final',
    topic: 'Presentación ejecutiva del Plan de Inteligencia de Mercados ABPro y evaluación integral.',
    focus: 'Presentación ejecutiva del Plan de Inteligencia de Mercados ABPro y evaluación integral.',
    blocks: 'Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    scheduleLabel: 'Sábado · Bloque 1 (Mañana) y Bloque 2 (Tarde)',
    examenesCount: 1,
    retosCount: 0,
    documentosEnlaces: [],
    enlacesTextoRaw: '',
    linkedExamModality: 'integral',
    linkedRetoModule: 0,
    ponderacion: { ...DEFAULT_CLASS_GRADING_WEIGHTS },
    guiaEstudioTexto:
      'Integrar los 5 entregables del proyecto aplicado ABPro y sustentar las decisiones estratégicas ante el jurado docente.',
    materialesApoyo: [
      {
        id: 'mat-c6-1',
        titulo: 'Rúbrica Oficial de Sustentación y Entrega del Proyecto ABPro',
        descripcion: 'Criterios de evaluación para la defensa oral y el informe ejecutivo final.',
        tipo: 'plantilla',
        contenidoResumen:
          'Estructura de presentación ejecutiva (Pitch de 10 minutos), defensa de métricas y plan de acción comercial.'
      }
    ]
  }
];

export interface StudentClassSessionRecord {
  claseId: ClassSessionId;
  // Numeric values (0.0 to 5.0; 0.0 when ungraded so numeric operations never fail)
  comportamiento: number; // 10%
  participacion: number; // 30%
  examen: number; // 30%
  trabajoPractico: number; // 30%
  notaFinal: number; // 0.0 - 5.0
  // Explicit graded flags: false = "Sin nota"
  comportamientoCalificado?: boolean;
  participacionCalificado?: boolean;
  examenCalificado?: boolean;
  trabajoCalificado?: boolean;
  notaFinalCalificada?: boolean;
  // Manual override tracking so automatic exam/reto sync respects explicit teacher edits
  examenManualOverride?: boolean;
  participacionManualOverride?: boolean;
  autoCalcularNotaFinal: boolean;
  // Work submission & teacher review workflow
  trabajoEstado?: TrabajoPracticoStatus; // 'sin_entregar' | 'pendiente_revision' | 'calificado'
  trabajoEntregaTexto?: string;
  trabajoEntregaEnlace?: string;
  trabajoEntregadoAtIso?: string;
  // Attendance blocks & Virtual Roll Call workflow
  bloque1Asistio: boolean;
  bloque2Asistio: boolean;
  asistenciaB1Estado?: AsistenciaBlockStatus;
  asistenciaB2Estado?: AsistenciaBlockStatus;
  llamadoVirtualActivo?: boolean;
  llamadoVirtualBloque?: 1 | 2 | 'ambos';
  llamadoVirtualEmitidoAtIso?: string;
  llamadoVirtualExpiraAtIso?: string;
  llamadoVirtualDuracionMin?: number;
  llamadoVirtualMetodo?:
    | 'alerta_panel'
    | 'codigo_unico_wa_email'
    | 'qr_pin_aula'
    | 'pregunta_relampago'
    | 'voz_manual';
  llamadoVirtualCodigoUnico?: string;
  llamadoVirtualPreguntaRelampago?: string;
  llamadoVirtualPalabraClave?: string;
  llamadoVirtualRespondidoAtIso?: string;
  llamadoVirtualMetodoRespuesta?: string;
  // Justificación de Inasistencia / Solicitud de Excusa desde el Panel del Estudiante
  excusaEstado?: 'ninguna' | 'pendiente_revision' | 'aprobada' | 'rechazada';
  excusaMotivo?: string;
  excusaSoporteUrl?: string;
  excusaBloque?: 'A' | 'B' | 'AB';
  excusaSolicitadaAtIso?: string;
  excusaRespuestaDocente?: string;
  observacionDocente: string;
}

export interface ActiveClassOpeningConfig {
  abierta: boolean;
  claseId: ClassSessionId;
  bloque: 'A' | 'B' | 'AB';
  duracionMinutos: number;
  iniciadaAtIso: string;
  expiraAtIso: string;
  metodoPrincipal:
    | 'alerta_panel'
    | 'codigo_unico_wa_email'
    | 'qr_pin_aula'
    | 'pregunta_relampago'
    | 'voz_manual';
  pinMaestroAula?: string;
  preguntaRelampago?: string;
  palabraClaveRelampago?: string;
  origenApertura?: 'manual_docente' | 'automatico_horario_escolar';
  bloqueHorarioReglaId?: string;
}

export interface RecurringScheduleBlockRule {
  id: string;
  asignaturaNombre: string;
  claseId: ClassSessionId;
  bloqueAsistencia: 'A' | 'B' | 'AB';
  etiquetaBloque: string;
  diasSemana: number[]; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  fechaInicioVigencia: string; // YYYY-MM-DD
  fechaFinVigencia: string; // YYYY-MM-DD
  fechaEspecifica?: string; // YYYY-MM-DD opcional para sesiones de fecha única
  horaApertura: string; // HH:MM (24h)
  horaCierre: string; // HH:MM (24h)
  duracionLlamadoMinutos: number;
  metodoLlamadoAuto:
    | 'alerta_panel'
    | 'codigo_unico_wa_email'
    | 'qr_pin_aula'
    | 'pregunta_relampago'
    | 'voz_manual';
  autoIniciarLlamado: boolean;
  activo: boolean;
  ultimaAperturaAutoKey?: string;
}

export function getDefaultRecurringScheduleBlocks(
  asignaturaNombre = 'Marketing Digital Estratégico'
): RecurringScheduleBlockRule[] {
  return [
    {
      id: 'SCHED-BLOCK-A-SAB',
      asignaturaNombre,
      claseId: 1,
      bloqueAsistencia: 'A',
      etiquetaBloque: 'Bloque A · Jornada Mañana (Apertura Escolar)',
      diasSemana: [6], // Sábado
      fechaInicioVigencia: '2026-02-01',
      fechaFinVigencia: '2026-12-15',
      fechaEspecifica: '',
      horaApertura: '08:00',
      horaCierre: '08:20',
      duracionLlamadoMinutos: 15,
      metodoLlamadoAuto: 'alerta_panel',
      autoIniciarLlamado: true,
      activo: true
    },
    {
      id: 'SCHED-BLOCK-B-SAB',
      asignaturaNombre,
      claseId: 1,
      bloqueAsistencia: 'B',
      etiquetaBloque: 'Bloque B · Jornada Tarde (Control Post-Receso)',
      diasSemana: [6], // Sábado
      fechaInicioVigencia: '2026-02-01',
      fechaFinVigencia: '2026-12-15',
      fechaEspecifica: '',
      horaApertura: '14:00',
      horaCierre: '14:20',
      duracionLlamadoMinutos: 15,
      metodoLlamadoAuto: 'codigo_unico_wa_email',
      autoIniciarLlamado: true,
      activo: true
    }
  ];
}

export interface StudentAcademicRecord {
  studentId: string;
  documento: string;
  nombre: string;
  clases: Record<ClassSessionId, StudentClassSessionRecord>;
  bonificacionRetosAplicada: boolean; // +0.3 on final average
  reemplazoExamenIntegralAplicado: boolean; // Replace lowest practical work with integral exam
  observacionGeneral: string;
  ultimaActualizacionIso: string;
}

export const CLEAN_ACADEMIC_DATASET_SCHEMA_VERSION = 3;

export interface AcademicDataset {
  version: number;
  cleanZeroPresetSchemaV3?: boolean;
  updatedAtIso: string;
  courseName?: string;
  classSessions?: ClassSessionDefinition[];
  sessionTitles: Record<ClassSessionId, string>;
  aperturaClaseActiva?: ActiveClassOpeningConfig;
  funcionLlamadoAsistenciaHabilitada?: boolean;
  aperturaAutomaticaHorarioActiva?: boolean;
  bloquesHorariosRecurrentes?: RecurringScheduleBlockRule[];
  records: StudentAcademicRecord[];
}

export function clampGrade05(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(5, Number(val.toFixed(2))));
}

export function formatGradeDisplay(val: number | null | undefined, isGraded = true): string {
  if (!isGraded || val === null || val === undefined || !Number.isFinite(Number(val))) {
    return 'Sin nota';
  }
  return Number(val).toFixed(1);
}

/**
 * Checks if the teacher observation contains a sustentation bonus instruction
 * such as "MÁS 1 PUNTO EN SUSTENTACIÓN" or "+1 PUNTO EN SUSTENTACION".
 */
export function hasSustentacionBonus(obs: string | undefined): boolean {
  if (!obs) return false;
  const norm = obs
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    norm.includes('MAS 1 PUNTO EN SUSTENTACION') ||
    norm.includes('+1 PUNTO EN SUSTENTACION') ||
    norm.includes('+ 1 PUNTO EN SUSTENTACION') ||
    norm.includes('MAS 1.0 EN SUSTENTACION')
  );
}

/**
 * Official Class Final Grade formula:
 * - Comportamiento: 10% (or custom module weight)
 * - Participación: 30% (or custom module weight)
 * - Examen: 30% (or custom module weight)
 * - Trabajo Práctico: 30% (or custom module weight)
 * If only a subset of components have been graded so far, computes the weighted
 * grade proportionally across the graded components (or across all 4 if all are graded).
 */
export function computeClassSessionFinalGrade(
  comportamiento: number,
  participacion: number,
  examen: number,
  trabajoPractico: number,
  observacionDocente?: string,
  weights?: ClassGradingWeights,
  gradedFlags?: {
    comportamientoCalificado?: boolean;
    participacionCalificado?: boolean;
    examenCalificado?: boolean;
    trabajoCalificado?: boolean;
  }
): number {
  const c = clampGrade05(comportamiento);
  const p = clampGrade05(participacion);
  const e = clampGrade05(examen);
  const t = clampGrade05(trabajoPractico);

  const wComp = (weights?.comportamientoPct ?? 10) / 100;
  const wPart = (weights?.participacionPct ?? 15) / 100;
  const wExam = (weights?.examenPct ?? 35) / 100;
  const wTrab = (weights?.trabajoPct ?? 40) / 100;

  let base = 0;
  if (gradedFlags) {
    const anyGraded = Boolean(
      gradedFlags.comportamientoCalificado ||
        gradedFlags.participacionCalificado ||
        gradedFlags.examenCalificado ||
        gradedFlags.trabajoCalificado
    );
    if (!anyGraded) {
      return 0;
    }
    const effC = gradedFlags.comportamientoCalificado ? c : 0;
    const effP = gradedFlags.participacionCalificado ? p : 0;
    const effE = gradedFlags.examenCalificado ? e : 0;
    const effT = gradedFlags.trabajoCalificado ? t : 0;
    base = effC * wComp + effP * wPart + effE * wExam + effT * wTrab;
  } else {
    base = c * wComp + p * wPart + e * wExam + t * wTrab;
  }

  const bonus = hasSustentacionBonus(observacionDocente) ? 0.3 : 0;
  return Number(Math.min(5.0, Math.max(0.0, base + bonus)).toFixed(2));
}

/**
 * Creates a completely clean ("Sin nota" / "Sin registrar") academic record for a student.
 * No pre-established grades, exams, retos, practical works, or attendance are assumed.
 */
export function createDefaultStudentAcademicRecord(
  studentId: string,
  nombre: string,
  documento?: string
): StudentAcademicRecord {
  const clases = {} as Record<ClassSessionId, StudentClassSessionRecord>;

  ([1, 2, 3, 4, 5, 6] as ClassSessionId[]).forEach((claseId) => {
    clases[claseId] = {
      claseId,
      comportamiento: 0,
      participacion: 0,
      examen: 0,
      trabajoPractico: 0,
      notaFinal: 0,
      comportamientoCalificado: false,
      participacionCalificado: false,
      examenCalificado: false,
      trabajoCalificado: false,
      notaFinalCalificada: false,
      examenManualOverride: false,
      participacionManualOverride: false,
      autoCalcularNotaFinal: true,
      trabajoEstado: 'sin_entregar',
      trabajoEntregaTexto: '',
      trabajoEntregaEnlace: '',
      trabajoEntregadoAtIso: '',
      bloque1Asistio: false,
      bloque2Asistio: false,
      asistenciaB1Estado: 'sin_registrar',
      asistenciaB2Estado: 'sin_registrar',
      llamadoVirtualActivo: false,
      llamadoVirtualBloque: 1,
      llamadoVirtualEmitidoAtIso: '',
      llamadoVirtualRespondidoAtIso: '',
      observacionDocente: ''
    };
  });

  return {
    studentId,
    documento: documento || studentId,
    nombre,
    clases,
    bonificacionRetosAplicada: false,
    reemplazoExamenIntegralAplicado: false,
    observacionGeneral: '',
    ultimaActualizacionIso: new Date().toISOString()
  };
}

export function buildInitialAcademicDataset(
  students?: StudentRecord[]
): AcademicDataset {
  const sourceStudents = Array.isArray(students) ? students : INITIAL_STUDENTS;

  const sessionTitles: Record<ClassSessionId, string> = {
    1: 'Clase 1: Fundamentos y Entorno Digital',
    2: 'Clase 2: Comportamiento del Consumidor Online',
    3: 'Clase 3: Mapeo de Mercado y Segmentación',
    4: 'Clase 4: Métricas Digitales y Analítica',
    5: 'Clase 5: Estrategias de Atracción y Conversión',
    6: 'Clase 6: Proyecto Integral y Sustentación'
  };

  const records = sourceStudents.map((st) =>
    createDefaultStudentAcademicRecord(st.id, st.nombre, st.id)
  );

  return {
    version: CLEAN_ACADEMIC_DATASET_SCHEMA_VERSION,
    cleanZeroPresetSchemaV3: true,
    updatedAtIso: new Date().toISOString(),
    sessionTitles,
    records
  };
}

export function buildClassSessionsFromCourseModules(
  modulos?: {
    id: number;
    code?: string;
    shortTitle?: string;
    fullTitle?: string;
    description?: string;
    observacion?: string;
    temasModulo?: string[];
    examenesCount?: number;
    retosCount?: number;
    ponderacion?: ClassGradingWeights;
    asistenciaBloqueA?: boolean;
    asistenciaBloqueB?: boolean;
    documentosEnlaces?: { id: string; titulo: string; url: string; tipo?: string }[];
    enlacesTextoRaw?: string;
  }[]
): ClassSessionDefinition[] {
  if (!Array.isArray(modulos) || modulos.length === 0) {
    return [];
  }
  return modulos.slice(0, 6).map((m, idx) => {
    const cId = (idx + 1) as ClassSessionId;
    const cleanShort = (m.shortTitle || '').trim() || `Módulo ${cId}`;
    const cleanFull = (m.fullTitle || '').trim() || `Clase ${cId} / Módulo ${cId}: ${cleanShort}`;
    const topicsStr =
      Array.isArray(m.temasModulo) && m.temasModulo.filter(Boolean).length > 0
        ? m.temasModulo.filter(Boolean).join(' · ')
        : m.description || `Contenidos académicos del ${cleanShort}`;
    const hasB1 = m.asistenciaBloqueA !== false;
    const hasB2 = m.asistenciaBloqueB !== false;
    const blocksDesc =
      hasB1 && hasB2
        ? 'Bloque A (Inicio) y Bloque B (Final)'
        : hasB1
        ? 'Bloque A (Inicio)'
        : hasB2
        ? 'Bloque B (Final)'
        : 'Asistencia de sesión';

    return {
      id: cId,
      code: m.code || `C${cId}`,
      title: cleanFull,
      fullTitle: cleanFull,
      shortTitle: cleanShort,
      topic: topicsStr,
      focus: m.description || topicsStr,
      blocks: blocksDesc,
      scheduleLabel: blocksDesc,
      examenesCount: typeof m.examenesCount === 'number' ? m.examenesCount : 1,
      retosCount: typeof m.retosCount === 'number' ? m.retosCount : 1,
      documentosEnlaces: Array.isArray(m.documentosEnlaces) ? m.documentosEnlaces : [],
      enlacesTextoRaw: m.enlacesTextoRaw || '',
      linkedExamModality:
        (m.examenesCount ?? 1) <= 0
          ? 'ninguno'
          : cId <= 5
          ? (`mod${cId}` as const)
          : 'integral',
      linkedRetoModule:
        (m.retosCount ?? 1) <= 0 ? 0 : cId <= 5 ? (cId as 1 | 2 | 3 | 4 | 5) : 0,
      ponderacion: m.ponderacion ? { ...m.ponderacion } : { ...DEFAULT_CLASS_GRADING_WEIGHTS },
      guiaEstudioTexto: m.observacion || m.description || '',
      materialesApoyo: Array.isArray(m.documentosEnlaces)
        ? m.documentosEnlaces.map((doc, dIdx) => ({
            id: doc.id || `mat-c${cId}-${dIdx + 1}`,
            titulo: doc.titulo || `Documento ${dIdx + 1} · ${cleanShort}`,
            descripcion: doc.url,
            tipo: 'enlace' as const,
            url: doc.url,
            contenidoResumen: doc.url
          }))
        : []
    };
  });
}

/**
 * Ensures the dataset stays strictly synchronized with the single official student roster (`rosterStudents`),
 * preserving real teacher grade/attendance edits and student submissions, adding clean "Sin nota" records
 * for newly enrolled students, and removing any records for deleted students.
 */
export function normalizeAndSyncAcademicDataset(
  existingDataset: AcademicDataset | null | undefined,
  rosterStudents: StudentRecord[],
  courseModulesOrAttempts?:
    | {
        id: number;
        code?: string;
        shortTitle?: string;
        fullTitle?: string;
        description?: string;
        observacion?: string;
        temasModulo?: string[];
        examenesCount?: number;
        retosCount?: number;
        ponderacion?: ClassGradingWeights;
        asistenciaBloqueA?: boolean;
        asistenciaBloqueB?: boolean;
        documentosEnlaces?: { id: string; titulo: string; url: string; tipo?: string }[];
        enlacesTextoRaw?: string;
      }[]
    | ExamAttemptResult[]
    | unknown,
  courseName?: string
): AcademicDataset {
  const safeRoster = Array.isArray(rosterStudents) ? rosterStudents : [];
  const base = buildInitialAcademicDataset(safeRoster);

  const isActualModuleList =
    Array.isArray(courseModulesOrAttempts) &&
    courseModulesOrAttempts.length > 0 &&
    courseModulesOrAttempts.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !('attemptId' in (item as Record<string, unknown>)) &&
        ('shortTitle' in (item as Record<string, unknown>) ||
          'fullTitle' in (item as Record<string, unknown>) ||
          'code' in (item as Record<string, unknown>) ||
          'ponderacion' in (item as Record<string, unknown>))
    );

  const validCourseModules = isActualModuleList
    ? (courseModulesOrAttempts as Parameters<typeof buildClassSessionsFromCourseModules>[0])
    : undefined;

  const dynamicSessions = Array.isArray(validCourseModules)
    ? buildClassSessionsFromCourseModules(validCourseModules)
    : existingDataset?.classSessions;

  const dynamicTitles: Record<ClassSessionId, string> = { ...base.sessionTitles };
  if (Array.isArray(dynamicSessions) && dynamicSessions.length > 0) {
    ([1, 2, 3, 4, 5, 6] as ClassSessionId[]).forEach((cId) => {
      const found = dynamicSessions.find((s) => s.id === cId);
      dynamicTitles[cId] = found ? found.fullTitle : `Clase ${cId}`;
    });
  }

  if (!existingDataset || !Array.isArray(existingDataset.records)) {
    return {
      ...base,
      courseName: courseName || base.courseName,
      classSessions: dynamicSessions,
      sessionTitles: dynamicTitles
    };
  }

  const effectiveSessionsForSync =
    Array.isArray(dynamicSessions) && dynamicSessions.length > 0
      ? dynamicSessions
      : existingDataset.classSessions;

  // If the stored dataset was from the legacy pre-populated preset schema (before cleanZeroPresetSchemaV3),
  // discard synthetic preset grades/attendance so all students start with "Sin nota" and "Sin registrar".
  const isCleanSchemaV3 =
    existingDataset.cleanZeroPresetSchemaV3 === true ||
    Number(existingDataset.version) >= CLEAN_ACADEMIC_DATASET_SCHEMA_VERSION;

  const existingRecordMap = new Map<string, StudentAcademicRecord>();
  if (isCleanSchemaV3) {
    existingDataset.records.forEach((rec) => {
      if (!rec || !rec.studentId) return;
      const normalizedClases = {} as Record<ClassSessionId, StudentClassSessionRecord>;
      ([1, 2, 3, 4, 5, 6] as ClassSessionId[]).forEach((cId) => {
        const existingC = rec.clases?.[cId];
        const sessionDef = effectiveSessionsForSync?.find((cs) => cs.id === cId);
        const weights = sessionDef?.ponderacion;
        if (existingC) {
          const compCal = Boolean(existingC.comportamientoCalificado);
          const partCal = Boolean(existingC.participacionCalificado);
          const examCal = Boolean(existingC.examenCalificado);
          const trabCal = Boolean(existingC.trabajoCalificado);

          const comp = compCal ? clampGrade05(Number(existingC.comportamiento ?? 0)) : 0;
          const part = partCal ? clampGrade05(Number(existingC.participacion ?? 0)) : 0;
          const exam = examCal ? clampGrade05(Number(existingC.examen ?? 0)) : 0;
          const trab = trabCal ? clampGrade05(Number(existingC.trabajoPractico ?? 0)) : 0;
          const obs = String(existingC.observacionDocente || '');

          const anyComponentGraded = compCal || partCal || examCal || trabCal;
          const manualFinalSet =
            existingC.autoCalcularNotaFinal === false &&
            Boolean(existingC.notaFinalCalificada) &&
            Number.isFinite(Number(existingC.notaFinal));

          const notaFinalCalificada = manualFinalSet || anyComponentGraded;
          const notaFinal = manualFinalSet
            ? clampGrade05(Number(existingC.notaFinal))
            : anyComponentGraded
            ? computeClassSessionFinalGrade(comp, part, exam, trab, obs, weights, {
                comportamientoCalificado: compCal,
                participacionCalificado: partCal,
                examenCalificado: examCal,
                trabajoCalificado: trabCal
              })
            : 0;

          const b1Estado: AsistenciaBlockStatus =
            existingC.asistenciaB1Estado || 'sin_registrar';
          const b2Estado: AsistenciaBlockStatus =
            existingC.asistenciaB2Estado || 'sin_registrar';

          const b1Asistio =
            b1Estado === 'presente_virtual' || b1Estado === 'presente_manual';
          const b2Asistio =
            b2Estado === 'presente_virtual' || b2Estado === 'presente_manual';

          const trabajoEstado: TrabajoPracticoStatus = trabCal
            ? 'calificado'
            : existingC.trabajoEstado === 'pendiente_revision'
            ? 'pendiente_revision'
            : 'sin_entregar';

          normalizedClases[cId] = {
            claseId: cId,
            comportamiento: comp,
            participacion: part,
            examen: exam,
            trabajoPractico: trab,
            notaFinal,
            comportamientoCalificado: compCal,
            participacionCalificado: partCal,
            examenCalificado: examCal,
            trabajoCalificado: trabCal,
            notaFinalCalificada,
            examenManualOverride: Boolean(existingC.examenManualOverride),
            participacionManualOverride: Boolean(existingC.participacionManualOverride),
            autoCalcularNotaFinal: existingC.autoCalcularNotaFinal !== false,
            trabajoEstado,
            trabajoEntregaTexto: String(existingC.trabajoEntregaTexto || ''),
            trabajoEntregaEnlace: String(existingC.trabajoEntregaEnlace || ''),
            trabajoEntregadoAtIso: String(existingC.trabajoEntregadoAtIso || ''),
            bloque1Asistio: b1Asistio,
            bloque2Asistio: b2Asistio,
            asistenciaB1Estado: b1Estado,
            asistenciaB2Estado: b2Estado,
            llamadoVirtualActivo: Boolean(existingC.llamadoVirtualActivo),
            llamadoVirtualBloque: existingC.llamadoVirtualBloque || 1,
            llamadoVirtualEmitidoAtIso: String(existingC.llamadoVirtualEmitidoAtIso || ''),
            llamadoVirtualExpiraAtIso: String(existingC.llamadoVirtualExpiraAtIso || ''),
            llamadoVirtualDuracionMin: Number(existingC.llamadoVirtualDuracionMin) || 0,
            llamadoVirtualMetodo: existingC.llamadoVirtualMetodo || 'alerta_panel',
            llamadoVirtualCodigoUnico: String(existingC.llamadoVirtualCodigoUnico || ''),
            llamadoVirtualPreguntaRelampago: String(existingC.llamadoVirtualPreguntaRelampago || ''),
            llamadoVirtualPalabraClave: String(existingC.llamadoVirtualPalabraClave || ''),
            llamadoVirtualRespondidoAtIso: String(existingC.llamadoVirtualRespondidoAtIso || ''),
            llamadoVirtualMetodoRespuesta: String(existingC.llamadoVirtualMetodoRespuesta || ''),
            excusaEstado: existingC.excusaEstado || 'ninguna',
            excusaMotivo: String(existingC.excusaMotivo || ''),
            excusaSoporteUrl: String(existingC.excusaSoporteUrl || ''),
            excusaBloque: existingC.excusaBloque || 'AB',
            excusaSolicitadaAtIso: String(existingC.excusaSolicitadaAtIso || ''),
            excusaRespuestaDocente: String(existingC.excusaRespuestaDocente || ''),
            observacionDocente: obs
          };
        } else {
          const fallback = createDefaultStudentAcademicRecord(
            rec.studentId,
            rec.nombre,
            rec.documento
          );
          normalizedClases[cId] = fallback.clases[cId];
        }
      });

      existingRecordMap.set(String(rec.studentId), {
        studentId: String(rec.studentId),
        documento: String(rec.documento || rec.studentId),
        nombre: String(rec.nombre || 'Estudiante'),
        clases: normalizedClases,
        bonificacionRetosAplicada: Boolean(rec.bonificacionRetosAplicada),
        reemplazoExamenIntegralAplicado: Boolean(rec.reemplazoExamenIntegralAplicado),
        observacionGeneral: String(rec.observacionGeneral || ''),
        ultimaActualizacionIso: rec.ultimaActualizacionIso || existingDataset.updatedAtIso
      });
    });
  }

  // Build records strictly from the single authoritative student bank (rosterStudents)
  const syncedRecords: StudentAcademicRecord[] = [];
  const seenIds = new Set<string>();

  safeRoster.forEach((st) => {
    if (!st || !st.id) return;
    const cleanId = String(st.id);
    if (seenIds.has(cleanId)) return;
    seenIds.add(cleanId);

    const existing = existingRecordMap.get(cleanId);
    if (existing) {
      syncedRecords.push({
        ...existing,
        studentId: cleanId,
        nombre: st.nombre || existing.nombre,
        documento: cleanId
      });
    } else {
      syncedRecords.push(createDefaultStudentAcademicRecord(cleanId, st.nombre, cleanId));
    }
  });

  return {
    version: CLEAN_ACADEMIC_DATASET_SCHEMA_VERSION,
    cleanZeroPresetSchemaV3: true,
    updatedAtIso: existingDataset.updatedAtIso || new Date().toISOString(),
    courseName: courseName || existingDataset.courseName,
    classSessions: effectiveSessionsForSync,
    sessionTitles:
      Array.isArray(dynamicSessions) && dynamicSessions.length > 0
        ? dynamicTitles
        : {
            ...base.sessionTitles,
            ...(existingDataset.sessionTitles || {})
          },
    aperturaClaseActiva: existingDataset.aperturaClaseActiva,
    funcionLlamadoAsistenciaHabilitada:
      typeof existingDataset.funcionLlamadoAsistenciaHabilitada === 'boolean'
        ? existingDataset.funcionLlamadoAsistenciaHabilitada
        : true,
    aperturaAutomaticaHorarioActiva:
      typeof existingDataset.aperturaAutomaticaHorarioActiva === 'boolean'
        ? existingDataset.aperturaAutomaticaHorarioActiva
        : true,
    bloquesHorariosRecurrentes: Array.isArray(existingDataset.bloquesHorariosRecurrentes)
      ? existingDataset.bloquesHorariosRecurrentes
      : getDefaultRecurringScheduleBlocks(courseName || existingDataset.courseName),
    records: syncedRecords
  };
}

export interface ComputedStudentAcademicSummary {
  record: StudentAcademicRecord;
  classFinals: Record<ClassSessionId, number>;
  classHasFinalGrade: Record<ClassSessionId, boolean>;
  hasAnyAcademicGrade: boolean;
  gradedClassesCount: number;
  clasesCalificadasCount: number;
  ultimaClaseCalificada: ClassSessionId | 0;
  promedioBase: number;
  promedioAcumulado: number;
  promedioTodasLasClases: number;
  promedioHastaClase: Record<ClassSessionId, number>;
  notaAcumulativaHastaCalificada: number;
  notaAcumulativaTodasLasClases: number;
  notaAcumulativaPorCorte: Record<ClassSessionId, number>;
  b1Inasistencia: Record<ClassSessionId, 0 | 1>;
  b2Inasistencia: Record<ClassSessionId, 0 | 1>;
  claseInasistida: Record<ClassSessionId, boolean>;
  fallasBloque1: number;
  fallasBloque2: number;
  totalFallasBloques: number; // Explicit absences ('falla') out of 12 blocks
  clasesInasistidasMap: Record<ClassSessionId, boolean>; // True if Bloque 1 == 1 OR Bloque 2 == 1
  totalClasesInasistidas: number; // Out of 6 classes
  totalClasesAsistidas: number; // Out of 6 classes (where neither B1 nor B2 has 1)
  totalBloquesAsistidos: number; // Confirmed present ('presente_virtual' | 'presente_manual')
  totalBloquesEvaluados: number; // Blocks where attendance was taken (present or absent)
  porcentajeAsistencia: number; // 0 - 100%
  porcentajeAsistenciaClases: number; // 0 - 100%
  estadoAcademico: 'Sin Nota' | 'Excelente' | 'Aprobado' | 'En Riesgo' | 'Crítico';
  aprobado: boolean;
  enRiesgoAcademico: boolean;
  riesgoAusentismo: 'SIN_REGISTRO' | 'CRITICO' | 'MODERADO' | 'PERFECTA';
  alertaCriticaAusentismo: boolean; // >= 3 fallas
  notaExamenIntegralPlataforma: number | null;
  notaExamenIntegral: number;
  insigniasRetosCount: number;
  trabajosPendientesRevisionCount: number;
  excusasPendientesRevisionCount: number;
  llamadosVirtualesActivosCount: number;
  notaMasBajaTrabajoClaseId: ClassSessionId;
  notaMasBajaTrabajoValor: number;
  promedioConPlanDeChoque: number;
}

export function computeStudentAcademicSummary(
  rec: StudentAcademicRecord,
  rosterStudent?: StudentRecord | null,
  studentAttempts?: ExamAttemptResult[],
  classSessions?: ClassSessionDefinition[]
): ComputedStudentAcademicSummary {
  const allClassIds: ClassSessionId[] = [1, 2, 3, 4, 5, 6];
  const activeClassIds: ClassSessionId[] =
    Array.isArray(classSessions) && classSessions.length > 0
      ? classSessions.map((cs) => cs.id)
      : allClassIds;
  const totalActiveClassesCount = Math.max(1, activeClassIds.length);
  const activeClassIdSet = new Set<ClassSessionId>(activeClassIds);

  const allAttemptsForStudent = (studentAttempts || []).filter(
    (a) => a && String(a.studentId).toUpperCase() === String(rec.studentId).toUpperCase()
  );

  // Check platform integral exam best grade
  const integralAttempts = allAttemptsForStudent.filter(
    (a) => !a.modalidad || a.modalidad === 'integral'
  );
  const notaExamenIntegralPlataforma =
    integralAttempts.length > 0
      ? Number(Math.max(...integralAttempts.map((a) => Number(a.notaColombiana) || 0)).toFixed(1))
      : null;

  // Count completed mini-retos badges and per-module mini-reto scores from Student Portal
  const insigniasRetosCount = rosterStudent?.progresoRetos
    ? ([1, 2, 3, 4, 5] as const).filter(
        (m) =>
          rosterStudent.progresoRetos?.[m]?.insigniaDesbloqueada ||
          (rosterStudent.progresoRetos?.[m]?.intentosUsados || 0) > 0
      ).length
    : 0;

  // Build effective classes enriched with real-time Student Portal exams and mini-retos
  const effectiveClases = {} as Record<ClassSessionId, StudentClassSessionRecord>;
  let trabajosPendientesRevisionCount = 0;
  let excusasPendientesRevisionCount = 0;
  let llamadosVirtualesActivosCount = 0;

  allClassIds.forEach((cId) => {
    const rawC =
      rec.clases?.[cId] ||
      createDefaultStudentAcademicRecord(rec.studentId, rec.nombre, rec.documento).clases[cId];
    const sessionDef = classSessions?.find((cs) => cs.id === cId);
    const linkedModality =
      sessionDef?.linkedExamModality || (cId <= 5 ? (`mod${cId}` as const) : 'integral');
    const linkedRetoMod = sessionDef?.linkedRetoModule ?? (cId <= 5 ? (cId as 1 | 2 | 3 | 4 | 5) : 0);

    // 1. Sync Exam from StudentPortal attempts if not manually overridden by teacher
    let examVal = rawC.examen;
    let examCal = Boolean(rawC.examenCalificado);
    if (!rawC.examenManualOverride && linkedModality && linkedModality !== 'ninguno') {
      const modAttempts = allAttemptsForStudent.filter(
        (a) => (a.modalidad || 'integral') === linkedModality
      );
      if (modAttempts.length > 0) {
        examVal = Number(
          Math.max(...modAttempts.map((a) => Number(a.notaColombiana) || 0)).toFixed(1)
        );
        examCal = true;
      }
    }

    // 2. Sync Mini-Reto from StudentPortal into Participación/Retos if not manually overridden by teacher
    let partVal = rawC.participacion;
    let partCal = Boolean(rawC.participacionCalificado);
    if (!rawC.participacionManualOverride && linkedRetoMod && linkedRetoMod >= 1 && linkedRetoMod <= 5) {
      const retoProg = rosterStudent?.progresoRetos?.[linkedRetoMod as 1 | 2 | 3 | 4 | 5];
      const modRetoAttempts = (rosterStudent?.historialIntentosRetos || []).filter(
        (r) => Number(r?.modulo) === linkedRetoMod
      );
      const hasDoneReto =
        Boolean(retoProg && (retoProg.intentosUsados > 0 || retoProg.insigniaDesbloqueada)) ||
        modRetoAttempts.length > 0;
      if (hasDoneReto) {
        const bestPct = Math.max(
          retoProg?.mejorPorcentaje || 0,
          modRetoAttempts.length > 0
            ? Math.max(...modRetoAttempts.map((r) => Number(r.porcentajeIA) || 0))
            : 0
        );
        partVal = Number(((bestPct / 100) * 5.0).toFixed(1));
        partCal = true;
      }
    }

    const compCal = Boolean(rawC.comportamientoCalificado);
    const compVal = compCal ? rawC.comportamiento : 0;
    const trabCal = Boolean(rawC.trabajoCalificado);
    const trabVal = trabCal ? rawC.trabajoPractico : 0;
    const trabajoEstado: TrabajoPracticoStatus = trabCal
      ? 'calificado'
      : rawC.trabajoEstado === 'pendiente_revision'
      ? 'pendiente_revision'
      : 'sin_entregar';

    if (trabajoEstado === 'pendiente_revision') {
      trabajosPendientesRevisionCount++;
    }
    if (rawC.excusaEstado === 'pendiente_revision') {
      excusasPendientesRevisionCount++;
    }
    if (rawC.llamadoVirtualActivo) {
      llamadosVirtualesActivosCount++;
    }

    const anyComponentGraded = compCal || partCal || examCal || trabCal;
    const manualFinal =
      rawC.autoCalcularNotaFinal === false && Boolean(rawC.notaFinalCalificada);
    const notaFinalCalificada = manualFinal || anyComponentGraded;
    const notaFinal = manualFinal
      ? clampGrade05(rawC.notaFinal)
      : anyComponentGraded
      ? computeClassSessionFinalGrade(
          compVal,
          partVal,
          examVal,
          trabVal,
          rawC.observacionDocente,
          sessionDef?.ponderacion,
          {
            comportamientoCalificado: compCal,
            participacionCalificado: partCal,
            examenCalificado: examCal,
            trabajoCalificado: trabCal
          }
        )
      : 0;

    effectiveClases[cId] = {
      ...rawC,
      comportamiento: compVal,
      participacion: partVal,
      examen: examVal,
      trabajoPractico: trabVal,
      notaFinal,
      comportamientoCalificado: compCal,
      participacionCalificado: partCal,
      examenCalificado: examCal,
      trabajoCalificado: trabCal,
      notaFinalCalificada,
      trabajoEstado
    };
  });

  const effectiveRecord: StudentAcademicRecord = {
    ...rec,
    clases: effectiveClases
  };

  // Find lowest graded trabajoPractico across active classes
  let lowestTrabajoClaseId: ClassSessionId = activeClassIds[0] || 1;
  let lowestTrabajoVal = 5.0;
  let foundGradedTrabajo = false;
  activeClassIds.forEach((cId) => {
    const c = effectiveClases[cId];
    if (c?.trabajoCalificado) {
      if (!foundGradedTrabajo || c.trabajoPractico < lowestTrabajoVal) {
        lowestTrabajoVal = c.trabajoPractico;
        lowestTrabajoClaseId = cId;
        foundGradedTrabajo = true;
      }
    }
  });
  if (!foundGradedTrabajo) {
    lowestTrabajoVal = 0;
  }

  const classFinals = {} as Record<ClassSessionId, number>;
  const classHasFinalGrade = {} as Record<ClassSessionId, boolean>;
  const clasesInasistidasMap = {} as Record<ClassSessionId, boolean>;
  const b1Inasistencia = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<ClassSessionId, 0 | 1>;
  const b2Inasistencia = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<ClassSessionId, 0 | 1>;
  let sumBase = 0;
  let sumSimulatedShock = 0;
  let gradedClassesCount = 0;
  let ultimaClaseCalificada: ClassSessionId | 0 = 0;
  let fallasB1 = 0;
  let fallasB2 = 0;
  let totalClasesInasistidas = 0;
  let asistidosCount = 0;
  let evaluadosCount = 0;

  allClassIds.forEach((cId) => {
    const c = effectiveClases[cId];
    if (!c || !activeClassIdSet.has(cId)) {
      classFinals[cId] = 0;
      classHasFinalGrade[cId] = false;
      clasesInasistidasMap[cId] = false;
      b1Inasistencia[cId] = 0;
      b2Inasistencia[cId] = 0;
      return;
    }

    const b1Est = c.asistenciaB1Estado || 'sin_registrar';
    const b2Est = c.asistenciaB2Estado || 'sin_registrar';

    const b1HasOne = b1Est === 'falla';
    const b2HasOne = b2Est === 'falla';

    b1Inasistencia[cId] = b1HasOne ? 1 : 0;
    b2Inasistencia[cId] = b2HasOne ? 1 : 0;

    if (b1HasOne) {
      fallasB1++;
      evaluadosCount++;
    } else if (b1Est === 'presente_virtual' || b1Est === 'presente_manual') {
      asistidosCount++;
      evaluadosCount++;
    }

    if (b2HasOne) {
      fallasB2++;
      evaluadosCount++;
    } else if (b2Est === 'presente_virtual' || b2Est === 'presente_manual') {
      asistidosCount++;
      evaluadosCount++;
    }

    // Condicional de inasistencia por clase/módulo:
    // Si en uno de los dos bloques tiene un 1, o en los dos bloques tiene 1 -> clase/módulo inasistido.
    // Si en los dos bloques no tiene 1 -> asistió a la clase/módulo.
    const isClassAbsent = b1HasOne || b2HasOne;
    clasesInasistidasMap[cId] = isClassAbsent;
    if (isClassAbsent) {
      totalClasesInasistidas++;
    }

    if (!c.notaFinalCalificada) {
      classFinals[cId] = 0;
      classHasFinalGrade[cId] = false;
      return;
    }

    classHasFinalGrade[cId] = true;
    gradedClassesCount++;
    ultimaClaseCalificada = cId;

    // Base final grade for this class
    let effectiveTrabajo = c.trabajoPractico;
    let effectiveTrabajoCal = Boolean(c.trabajoCalificado);
    if (
      rec.reemplazoExamenIntegralAplicado &&
      cId === lowestTrabajoClaseId &&
      notaExamenIntegralPlataforma !== null &&
      notaExamenIntegralPlataforma > effectiveTrabajo
    ) {
      effectiveTrabajo = notaExamenIntegralPlataforma;
      effectiveTrabajoCal = true;
    }

    const sessionDef = classSessions?.find((cs) => cs.id === cId);
    const modWeights = sessionDef?.ponderacion;

    const baseClassNote =
      c.autoCalcularNotaFinal === false && !rec.reemplazoExamenIntegralAplicado
        ? clampGrade05(c.notaFinal)
        : computeClassSessionFinalGrade(
            c.comportamiento,
            c.participacion,
            c.examen,
            effectiveTrabajo,
            c.observacionDocente,
            modWeights,
            {
              comportamientoCalificado: c.comportamientoCalificado,
              participacionCalificado: c.participacionCalificado,
              examenCalificado: c.examenCalificado,
              trabajoCalificado: effectiveTrabajoCal
            }
          );

    classFinals[cId] = baseClassNote;
    sumBase += baseClassNote;

    // Potential Plan de Choque simulated score
    const shockTrabajo =
      cId === lowestTrabajoClaseId &&
      notaExamenIntegralPlataforma !== null &&
      notaExamenIntegralPlataforma > c.trabajoPractico
        ? notaExamenIntegralPlataforma
        : c.trabajoPractico;
    const shockTrabajoCal =
      cId === lowestTrabajoClaseId && notaExamenIntegralPlataforma !== null
        ? true
        : Boolean(c.trabajoCalificado);

    const shockClassNote = computeClassSessionFinalGrade(
      c.comportamiento,
      c.participacion,
      c.examen,
      shockTrabajo,
      c.observacionDocente,
      modWeights,
      {
        comportamientoCalificado: c.comportamientoCalificado,
        participacionCalificado: c.participacionCalificado,
        examenCalificado: c.examenCalificado,
        trabajoCalificado: shockTrabajoCal
      }
    );
    sumSimulatedShock += shockClassNote;
  });

  const hasAnyAcademicGrade = gradedClassesCount > 0;
  const promedioBase = hasAnyAcademicGrade
    ? clampGrade05(sumBase / gradedClassesCount)
    : 0;
  const bonusRetos = hasAnyAcademicGrade && rec.bonificacionRetosAplicada ? 0.3 : 0;
  const promedioAcumulado = hasAnyAcademicGrade
    ? clampGrade05(promedioBase + bonusRetos)
    : 0;
  const promedioTodasLasClases = hasAnyAcademicGrade
    ? clampGrade05(sumBase / totalActiveClassesCount + bonusRetos)
    : 0;

  const promedioHastaClase = {} as Record<ClassSessionId, number>;
  let runningSum = 0;
  allClassIds.forEach((cId) => {
    runningSum += classHasFinalGrade[cId] ? classFinals[cId] : 0;
    promedioHastaClase[cId] = clampGrade05(runningSum / cId + bonusRetos);
  });

  const potentialBonusRetos = insigniasRetosCount > 0 || rec.bonificacionRetosAplicada ? 0.3 : 0.3;
  const promedioConPlanDeChoque = hasAnyAcademicGrade
    ? clampGrade05(sumSimulatedShock / gradedClassesCount + potentialBonusRetos)
    : 0;

  const totalFallasBloques = fallasB1 + fallasB2;
  const totalClasesAsistidas = Math.max(0, totalActiveClassesCount - totalClasesInasistidas);
  const totalBloquesAsistidos = asistidosCount;
  const porcentajeAsistencia = Number(
    ((totalClasesAsistidas / totalActiveClassesCount) * 100).toFixed(1)
  );

  const aprobado = hasAnyAcademicGrade && promedioAcumulado >= 3.0;
  const enRiesgoAcademico = hasAnyAcademicGrade && promedioAcumulado < 3.0;
  const estadoAcademico: 'Sin Nota' | 'Excelente' | 'Aprobado' | 'En Riesgo' | 'Crítico' =
    !hasAnyAcademicGrade
      ? 'Sin Nota'
      : promedioAcumulado >= 4.0
      ? 'Excelente'
      : promedioAcumulado >= 3.0
      ? 'Aprobado'
      : promedioAcumulado >= 2.0
      ? 'En Riesgo'
      : 'Crítico';

  const riesgoAusentismo: 'SIN_REGISTRO' | 'CRITICO' | 'MODERADO' | 'PERFECTA' =
    totalClasesInasistidas >= 3 || totalFallasBloques >= 3
      ? 'CRITICO'
      : totalClasesInasistidas >= 1 || totalFallasBloques >= 1
      ? 'MODERADO'
      : 'PERFECTA';

  return {
    record: effectiveRecord,
    classFinals,
    classHasFinalGrade,
    hasAnyAcademicGrade,
    gradedClassesCount,
    clasesCalificadasCount: gradedClassesCount,
    ultimaClaseCalificada,
    promedioBase,
    promedioAcumulado,
    promedioTodasLasClases,
    promedioHastaClase,
    notaAcumulativaHastaCalificada: promedioAcumulado,
    notaAcumulativaTodasLasClases: promedioTodasLasClases,
    notaAcumulativaPorCorte: promedioHastaClase,
    b1Inasistencia,
    b2Inasistencia,
    claseInasistida: clasesInasistidasMap,
    fallasBloque1: fallasB1,
    fallasBloque2: fallasB2,
    totalFallasBloques,
    clasesInasistidasMap,
    totalClasesInasistidas,
    totalClasesAsistidas,
    totalBloquesAsistidos,
    totalBloquesEvaluados: evaluadosCount,
    porcentajeAsistencia,
    porcentajeAsistenciaClases: porcentajeAsistencia,
    estadoAcademico,
    aprobado,
    enRiesgoAcademico,
    riesgoAusentismo,
    alertaCriticaAusentismo: totalClasesInasistidas >= 3 || totalFallasBloques >= 3,
    notaExamenIntegralPlataforma,
    notaExamenIntegral: notaExamenIntegralPlataforma ?? 0,
    insigniasRetosCount,
    trabajosPendientesRevisionCount,
    excusasPendientesRevisionCount,
    llamadosVirtualesActivosCount,
    notaMasBajaTrabajoClaseId: lowestTrabajoClaseId,
    notaMasBajaTrabajoValor: lowestTrabajoVal,
    promedioConPlanDeChoque
  };
}
