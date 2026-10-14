export type BloomLevel = 'Conocer' | 'Comprensión' | 'Aplicación' | 'Análisis' | 'Evaluación';

export interface Question {
  id: string;
  modulo: 1 | 2 | 3 | 4 | 5;
  tema: string;
  bloom: BloomLevel;
  enunciado: string;
  // Esquema Obligatorio extendido compatible
  tipoPregunta?: string;
  nivel?: string;
  rap?: string;
  contexto?: string;
  pregunta?: string;
  opciones: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correcta: 'A' | 'B' | 'C' | 'D';
  respuestaCorrecta?: string;
  justificacion: string;
  casoGrafico?: {
    tipo: 'embudo' | 'segmentacion' | 'matriz_mep' | 'tendencia_consumo';
    titulo: string;
    datos: { etiqueta: string; valor: number; unidad?: string }[];
  };
}

export interface SanitizedQuestion {
  id: string;
  modulo: 1 | 2 | 3 | 4 | 5;
  tema: string;
  bloom: BloomLevel;
  enunciado: string;
  tipoPregunta?: string;
  nivel?: string;
  rap?: string;
  contexto?: string;
  pregunta?: string;
  opciones: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  /**
   * Maps displayed option letter (A/B/C/D) back to the original question option letter (A/B/C/D)
   * when dynamic option shuffling is enabled for anti-collusion.
   */
  mapaOrdenOpciones?: {
    A: 'A' | 'B' | 'C' | 'D';
    B: 'A' | 'B' | 'C' | 'D';
    C: 'A' | 'B' | 'C' | 'D';
    D: 'A' | 'B' | 'C' | 'D';
  };
  casoGrafico?: {
    tipo: 'embudo' | 'segmentacion' | 'matriz_mep' | 'tendencia_consumo';
    titulo: string;
    datos: { etiqueta: string; valor: number; unidad?: string }[];
  };
}

export type ExamModality = 'integral' | 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5';

export type MiniRetoFamily =
  | 'Deducción y Misterio'
  | 'Análisis Crítico y Refutación'
  | 'Aplicación Local y Feynman'
  | 'Estrategia y Creación';

export type MiniRetoMechanicId =
  | 'adivina_quien_soy'
  | 'abogado_del_diablo'
  | 'traductor_del_barrio'
  | 'el_intruso'
  | 'escoge_tu_aventura'
  | 'detective_caza_errores'
  | 'jeroglifico_kotler'
  | 'sesgo_dueno_terco'
  | 'trampa_roles_familiares'
  | 'autopsia_fracaso'
  | 'pitch_ascensor'
  | 'bola_de_cristal'
  | 'juicio_consumidor'
  | 'whatsapp_cliente_indeciso';

export interface GeneratedMiniRetoInstance {
  retoId?: string;
  instanceId: string;
  questionId?: string;
  sourceQuestionId: string;
  modulo: 1 | 2 | 3 | 4 | 5;
  retoIndex?: number;
  badgeKey?: string;
  tema: string;
  rap?: string;
  familia: MiniRetoFamily;
  mecanicaId: MiniRetoMechanicId;
  mecanicaNombre: string;
  mecanicaIcono?: string;
  tituloReto: string;
  narrativaReto?: string;
  narrativaEscenario: string;
  preguntaReto: string;
  pistaOpcional: string;
  respuestaEsperadaDocente: string;
  justificacionTeoricaBase?: string;
  conceptosClave: string[];
  criterioEvaluacion60: string;
  umbralAprobacionPct: number;
  origenMotor?: 'ia_gemini' | 'semilla_local' | 'plantilla_docente';
  generadoPor: 'IA_GEMINI' | 'LOCAL_FALLBACK' | 'BANCO_DOCENTE';
}

export interface MiniRetoAttemptRecord {
  attemptId: string;
  fecha: string;
  timestampMs: number;
  studentId: string;
  studentName: string;
  modulo: 1 | 2 | 3 | 4 | 5;
  retoIndex?: number;
  badgeKey?: string;
  intentoNumero: 1 | 2 | 3;
  mecanicaId: MiniRetoMechanicId;
  mecanicaNombre: string;
  familia: MiniRetoFamily;
  sourceQuestionId: string;
  tituloReto: string;
  narrativaEscenario: string;
  preguntaReto: string;
  respuestaEsperadaDocente: string;
  conceptosClave: string[];
  respuestaEstudiante: string;
  porcentajeIA: number; // 0 a 100
  umbralAprobacionPct: number;
  rubricaDesglose: {
    conceptoClavePct: number; // sobre 40
    argumentacionTeoricaPct: number; // sobre 40
    originalidadFeynmanPct: number; // sobre 20
  };
  aprobado: boolean;
  suspendidoPorTrampa?: boolean;
  notaEquivalenteEscala5?: number; // 0.0 / 5.0 en caso de suspensión por trampa
  motivoInfraccion?: string;
  advertenciasRegistradas?: number;
  maxLlamadosPermitidosEnIntento?: number;
  historialLlamadosIntento?: AntiCheatLogEntry[];
  telemetriaEscritura?: {
    wpm: number;
    correccionesBackspace: number;
    desviacionCadenciaMs: number;
    sospechaReescrituraCopia: boolean;
  };
  tiempoEmpleadoSegundos?: number;
  retroalimentacionIA: string;
  pistaSocratica?: string;
  modoEvaluacion: 'IA_GEMINI' | 'LOCAL_FALLBACK' | 'AJUSTE_DOCENTE' | 'ANTI_TRAMPA_SUSPENDIDO';
  ajustadoPorDocente?: boolean;
  notaAjusteDocente?: string;
}

export interface StudentRetoModuleProgress {
  modulo: 1 | 2 | 3 | 4 | 5;
  intentosUsados: number; // 0 a 3
  maxIntentos: number; // 3 por defecto
  insigniaDesbloqueada: boolean;
  fechaDesbloqueo?: string;
  mejorPorcentaje: number;
  bloqueadoPorFallo: boolean;
  suspendidoPorTrampa?: boolean;
  motivoSuspensionReto?: string;
  preguntasRetoUsadas: string[];
  mecanicasUsadas: MiniRetoMechanicId[];
  historialIntentos: MiniRetoAttemptRecord[];
}

export interface CustomMiniRetoTemplate {
  id: string;
  modulo: 1 | 2 | 3 | 4 | 5;
  tema: string;
  familia: MiniRetoFamily;
  mecanicaId: MiniRetoMechanicId;
  mecanicaNombre: string;
  titulo: string;
  narrativa: string;
  preguntaReto: string;
  pistaOpcional: string;
  respuestaEsperada: string;
  conceptosClave: string[];
  criterioEvaluacion60: string;
  umbralAprobacionPct: number; // por defecto 60
  activo: boolean;
}

export type AntiCheatDetectionType =
  | 'CAMBIO_PESTANA'
  | 'MINIMIZAR_PESTANA_VENTANA'
  | 'CAMBIO_APLICACION_EXTERNA'
  | 'PANTALLA_DIVIDIDA_SPLIT'
  | 'SALIDA_PANTALLA_COMPLETA'
  | 'COPIA_PEGADO_CLIC_DERECHO'
  | 'CAPTURA_IMPRESION_DEVTOOLS'
  | 'ABANDONO_PUNTERO_FUERA_VENTANA'
  | 'RAFAGA_RESPUESTA_RAPIDA_IA'
  | 'BIOMETRIA_TECLEO_IA';

export interface AntiCheatLogEntry {
  id: string;
  fecha: string;
  timestampMs?: number;
  studentId: string;
  studentName: string;
  origen: 'EXAMEN' | 'MINI_RETO';
  modalidadOModulo: string;
  tipoDeteccion: AntiCheatDetectionType;
  etiquetaDeteccion?: string;
  descripcion: string;
  llamadoNumero?: number;
  numeroLlamado?: number;
  maxLlamadosPermitidos: number;
  accionTomada: 'LLAMADO_PREVENTIVO' | 'LLAMADO_ATENCION' | 'SUSPENSION_0_0';
}

export interface StudentExamModalitySummary {
  modalidad: ExamModality;
  modalidadLabel: string;
  label: string;
  realizado: boolean;
  intentosUtilizados: number;
  maxIntentosPermitidos: number;
  mejorNota: number;
  ultimaNota: number;
  porcentajeMejor: number;
  estado: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO' | 'PENDIENTE';
  estadoMejor: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO' | 'PENDIENTE';
  ultimaFecha?: string;
  preguntasSalieronIds: string[];
  preguntasQueSalieron: string[];
  totalPreguntas: number;
  llamadosAtencion: number;
}

export interface StudentRetoModalitySummary {
  modulo: 1 | 2 | 3 | 4 | 5;
  moduloLabel: string;
  tituloModulo: string;
  realizado: boolean;
  intentosUtilizados: number;
  maxIntentos: number;
  mejorPorcentaje: number;
  notaEquivalenteEscala5: number;
  mejorNotaEscala5: number;
  aprobado: boolean;
  insigniaDesbloqueada: boolean;
  insigniaGanada: boolean;
  suspendidoPorTrampa: boolean;
  ultimaFecha?: string;
  ultimoTituloReto?: string;
}

export interface StudentServerAcademicSummary {
  actualizadoEnServidorIso: string;
  totalExamenesRealizadosIntentos: number;
  totalIntentosExamenesRealizados: number;
  modalidadesExamenRealizadasCount: number;
  examenesRealizadosCount: number;
  modalidadesExamenFaltantesCount: number;
  examenesFaltantesCount: number;
  notaDefinitivaExamenes: number;
  promedioExamenesPresentados: number;
  examenesRealizadosLabels: string[];
  examenesFaltantesLabels: string[];
  detalleModalidadesExamen: StudentExamModalitySummary[];
  detallePorExamen: StudentExamModalitySummary[];
  totalRetosRealizadosIntentos: number;
  totalIntentosRetosRealizados: number;
  modulosRetosRealizadosCount: number;
  retosRealizadosCount: number;
  modulosRetosFaltantesCount: number;
  retosFaltantesModulos: (1 | 2 | 3 | 4 | 5)[];
  insigniasGanadasCount: number;
  retosRealizadosLabels: string[];
  retosFaltantesLabels: string[];
  detalleModulosRetos: StudentRetoModalitySummary[];
  detallePorReto: StudentRetoModalitySummary[];
  totalLlamadosAntiTrampa: number;
}

export type AcademicReviewTicketType =
  | 'RECALIFICACION_EXAMEN'
  | 'REVISION_CORTE_NOTA'
  | 'EXCUSA_INASISTENCIA';

export type AcademicReviewTicketStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface AcademicReviewTicket {
  id: string;
  studentId: string;
  studentName: string;
  fechaCreacion: string;
  createdAtIso: string;
  timestampMs: number;
  tipo: AcademicReviewTicketType;
  referenciaId: string;
  referenciaLabel: string;
  targetId: string;
  targetLabel: string;
  preguntaReferencia?: string;
  claseId?: 1 | 2 | 3 | 4 | 5 | 6;
  bloqueExcusa?: 'A' | 'B' | 'AB';
  notaActual?: number;
  notaSolicitada?: number;
  notaAprobada?: number;
  motivoEstudiante: string;
  enlaceEvidencia?: string;
  soporteUrl?: string;
  estado: AcademicReviewTicketStatus;
  comentarioDocente?: string;
  fechaResolucion?: string;
  respondedAtIso?: string;
  resueltoPor?: string;
  ajusteAplicadoDetalle?: string;
}

export interface StudentRecord {
  id: string;
  nombre: string;
  codigoAcceso: string; // Código único asignado o 1000000000 para usuario de prueba
  correo?: string; // Correo electrónico del estudiante (opcional)
  whatsapp?: string; // Número de WhatsApp del estudiante (opcional)
  intentosUsados: number;
  maxIntentosPermitidos?: 1 | 2; // Configurable al reiniciar (1 o 2 intentos permitidos, por defecto 2)
  maxLlamadosAtencionIndividual?: number | null; // Límite individual de llamados anti-trampa antes de suspensión (null/undefined = usa el global)
  advertenciasCambioFoco?: number;
  suspendido: boolean;
  conceptoInfraccion: string; // ej. "✓ Sin infracciones" o "Cambio de pestaña / ventana detectado 2 veces"
  preguntasIntento1: string[]; // IDs de preguntas usadas en Intento 1
  preguntasIntento2: string[]; // IDs de preguntas usadas en Intento 2
  intentosPorModalidad?: Partial<Record<ExamModality, number>>;
  preguntasUsadasPorModalidad?: Partial<Record<ExamModality, string[]>>;
  examenesBloqueados?: ExamModality[]; // Bloqueo / Desbloqueo de Examen Por Estudiante (específico, varios o todos)
  modulosRetosBloqueados?: (1 | 2 | 3 | 4 | 5)[]; // Módulos de Mini Retos (1 al 5) deshabilitados específicamente para este estudiante
  progresoRetos?: Partial<Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress>>;
  historialIntentosRetos?: MiniRetoAttemptRecord[];
  historialLlamadosAtencion?: any[];
  solicitudesRevision?: AcademicReviewTicket[];
  resumenServidor?: StudentServerAcademicSummary;
  motivoUltimoLlamado?: string;
  fechaUltimoLlamado?: string;
  llamadosAtencion?: number;
  bloqueadoPorTrampa?: boolean;
}

export interface ExamAttemptResult {
  attemptId: string;
  fecha: string;
  fechaHora?: string;
  timestampMs: number;
  studentId: string;
  studentName: string;
  codigoSesion: string;
  intentoNumero: 1 | 2;
  modalidad: ExamModality;
  modalidadLabel: string;
  totalPreguntas: number;
  aciertos: number;
  incorrectas: number;
  notaColombiana: number; // 0.0 to 5.0
  porcentaje: number;
  tiempoEmpleadoSegundos: number;
  estado: 'APROBADO' | 'REPROBADO' | 'SUSPENDIDO';
  conceptoInfraccion: string;
  incidenciasCount: number;
  maxLlamadosPermitidosEnIntento?: number;
  historialLlamadosIntento?: AntiCheatLogEntry[];
  firmaVerificacion: string;
  sincronizadoSheets?: boolean;
  id?: string;
  notaFinal?: number;
  nota?: number;
  duracionSegundos?: number;
  modalidadTitle?: string;
  respuestasDetalle: {
    questionId: string;
    modulo: number;
    tema: string;
    bloom: BloomLevel;
    enunciado: string;
    opciones: { A: string; B: string; C: string; D: string };
    elegida: 'A' | 'B' | 'C' | 'D' | null;
    correcta: 'A' | 'B' | 'C' | 'D';
    acierto: boolean;
    justificacion: string;
    tiempoSegundos?: number;
  }[];
}

export interface LiveClassroomSession {
  studentId: string;
  studentName: string;
  codigoAcceso: string;
  modalidadLabel: string;
  intentoNumero: 1 | 2;
  preguntaActual: number;
  totalPreguntas: number;
  respondidasCount: number;
  tiempoRestanteSegundos: number;
  advertencias: number;
  maxLlamadosPermitidos?: number;
  motivoUltimaAdvertencia: string;
  online: boolean;
  ultimaActualizacionMs: number;
  suspendido: boolean;
  segundosEnPreguntaActual?: number;
  inactividadMouseSegundos?: number;
  inactividadSospechosa?: boolean;
  pantallaMaximizada?: boolean;
  modalidad?: string;
  remainingSeconds?: number;
  lastUpdatedMs?: number;
  windowFocused?: boolean;
  currentQuestion?: number;
  totalQuestions?: number;
}

export interface ABProProjectEvaluation {
  studentId: string;
  nombreMiPyme: string;
  insumo1Mapeo: number; // 0.0 - 5.0
  insumo2Journey: number; // 0.0 - 5.0
  insumo3Investigacion: number; // 0.0 - 5.0
  insumo4Segmentacion: number; // 0.0 - 5.0
  insumo5Omnicanal: number; // 0.0 - 5.0
  observacionesDocente: string;
  ultimaActualizacion: string;
}

export interface SystemConfig {
  examenAbierto: boolean;
  estudiantesConEstadoCerrado?: string[]; // IDs de estudiantes que tienen el Estado Maestro del Examen en CERRADO (Deshabilitado)
  mensajeSalaEspera: string;
  nombreDocente?: string;
  maxIntentosMiniReto?: number;
  ventanaHorariaActiva?: boolean;
  diasPermitidos?: number[]; // 0=Dom, 1=Lun, ..., 6=Sáb
  horaInicioPermitida?: string;
  horaFinPermitida?: string;
  exigirPinAula: boolean;
  pinAulaDia: string;
  retroalimentacionInmediata: boolean;
  estudiantesConRetroalimentacionDiferida?: string[]; // IDs de estudiantes que tienen la Retroalimentación en DIFERIDA (Deshabilitada)
  mostrarDesglosePregunta?: boolean;
  estudiantesConDesgloseDeshabilitado?: string[]; // IDs de estudiantes que tienen el Desglose Pregunta x Pregunta DESHABILITADO (Oculto)
  desgloseVentanaHorariaActiva?: boolean; // false = Sin restricción de hora, true = Restricción por días y rango de horas
  desgloseDiasPermitidos?: number[]; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  desgloseHoraInicio?: string; // ej. '06:00'
  desgloseHoraFin?: string; // ej. '22:00'
  barajarOpciones: boolean;
  correoRecuperacion: string;
  idDocente?: string;
  claveDocente: string;
  requiereCambioClaveInicial?: boolean;
  webhookUrl: string;
  ponderacionTeoriaPct: number;
  // Configurador Personalizado de Examen («Constructor de Pruebas a Medida»)
  preguntasExamenIntegral?: number;
  tiempoExamenIntegralMin?: number;
  preguntasExamenModulo?: number;
  tiempoExamenModuloMin?: number;
  notaMinimaAprobacion?: number;
  exigirPantallaMaximizada?: boolean;
  // Configuración de Métodos Anti-Trampas en Exámenes y Mini Retos (Habilitados por defecto = true)
  maxLlamadosAtencionGlobal?: number; // Cuántos llamados preventivos antes de suspender con 0.0 para todos (por defecto 1, configurable 0 a 5)
  llamadosAtencionPorEstudiante?: Record<string, number>; // Mapa opcional de llamados preventivos permitidos de forma individual por estudiante
  antiTrampaExamenesActivo?: boolean; // Escudo Maestro Anti-Trampas en Exámenes (por defecto true)
  examenBloquearCambioPestanaFoco?: boolean; // Detectar cambio de pestaña / pérdida de foco
  detectarCambioPestana?: boolean; // Detectar específicamente cambio de pestaña del navegador (visibilitychange)
  detectarMinimizarPestana?: boolean; // Detectar específicamente minimizar pestaña o ventana del navegador
  detectarCambioAplicacion?: boolean; // Detectar cambio de aplicación / Alt+Tab / pérdida de foco del sistema operativo
  detectarSalidaPunteroDevToolsIA?: boolean; // Detectar salida prolongada del puntero, consola DevTools o multi-monitor
  detectarRafagaRespuestaRapidaIA?: boolean; // Detectar ráfaga de respuestas ultra-rápidas (<2.5s) sin lectura comprensiva
  detectarCapturaPantallaDevTools?: boolean; // Alias / control específico de captura de pantalla, impresión y DevTools
  detectarAbandonoPunteroIA?: boolean; // Alias / control específico de abandono prolongado del puntero
  detectarRafagaClicsIA?: boolean; // Alias / control específico de ráfaga de respuestas sin lectura
  detectarSplitScreen?: boolean; // Control de pantalla dividida
  examenBloquearCopiaClicDerechoAtajos?: boolean; // Bloquear Clic Derecho, Copiar/Pegar, F12 y PrintScreen en exámenes
  examenExigirPantallaCompleta?: boolean; // Solicitar modo Pantalla Completa y detectar salida en exámenes
  ecualizadorPsicometricoActivo?: boolean; // Ecualizador IA Anti-Patrones: respuestas con cascarita e igual longitud
  antiTrampaMiniRetosActivo?: boolean; // Escudo Maestro Anti-Trampas en Mini Retos (por defecto true)
  retoBloquearCambioPestanaFoco?: boolean; // Detectar cambio de pestaña, minimizar y cambio de app en Mini Retos
  retoSuspenderCopiaPegadoInyeccion?: boolean; // Suspensión inmediata 0.0 por copiar, pegar, arrastrar o inyectar texto
  retoBiometriaTecleoAntiCopia?: boolean; // Auditoría biométrica de tecleo (PPM, cadencia, Backspace y anti-chatbot)
  retoExigirPantallaCompleta?: boolean; // Exigir modo Pantalla Completa y alerta de ventana dividida en Mini Retos
  // Configuración de Zona de Mini Retos & Insignias (IA Semántica + Respaldo Local)
  miniRetosAbiertos?: boolean; // true = Habilitado para todos por defecto
  estudiantesSinMiniRetos?: string[]; // IDs de estudiantes que tienen Mini Retos deshabilitados
  estudiantesModulosMiniRetosBloqueados?: Record<string, (1 | 2 | 3 | 4 | 5)[]>; // Mapa opcional de módulos de retos deshabilitados por ID de estudiante
  miniRetosSinRestriccionHora?: boolean; // true = Sin restricción de hora, false = Días y Horas disponibles
  miniRetosDiasPermitidos?: number[]; // 0=Dom, 1=Lun, ..., 6=Sáb
  miniRetosHoraInicio?: string; // ej. '07:00'
  miniRetosHoraFin?: string; // ej. '22:00'
  umbralAprobacionMiniRetoPct?: number; // por defecto 60 (%)
  // =========================================================================
  // MOTOR DE VIGENCIA DE CURSO Y PROGRAMACIÓN GRANULAR POR ACTIVIDAD (R1-R9)
  // =========================================================================
  courseScheduleConfig?: CourseScheduleConfig;
  // =========================================================================
  // CONFIGURACIÓN UNIVERSAL MULTI-CURSO Y PANEL DE EDITORES (EDITOR2026)
  // =========================================================================
  activeCourseId?: string;
  activeCourseMeta?: UniversalCourseMetadata;
  universalCoursesCatalog?: UniversalCourseWorkspace[];
  studentRosterDatabases?: StudentRosterDatabaseEntry[];
  questionBankDatabases?: QuestionBankDatabaseEntry[];
  deletedStudentRosterDbIds?: string[];
  deletedQuestionBankDbIds?: string[];
  editorNombre?: string;
  editorUsuario?: string;
  editorClave?: string;
  correoRecuperacionEditor?: string;
  requiereCambioClaveEditorInicial?: boolean;
  registeredTeachers?: TeacherAccountRecord[]; // Docentes registrados y sus cursos asignados por el Editor
}

export type AcademicActivityKey =
  | 'CURSO_GENERAL'
  | 'EXAMENES'
  | 'TRABAJOS_TALLERES'
  | 'MINI_RETOS'
  | 'PARTICIPACION_ASISTENCIA';

export type ActivityWindowOverrideMode =
  | 'AUTO_CALENDAR'
  | 'FORCE_OPEN'
  | 'FORCE_CLOSED';

export interface ActivityScheduleWindowConfig {
  activityKey: AcademicActivityKey;
  label: string;
  subtitle?: string;
  icon: string;
  enabled: boolean; // Si true, evalúa rango de fechas, días y horas cuando overrideMode === 'AUTO_CALENDAR'
  overrideMode: ActivityWindowOverrideMode;
  openDate: string; // YYYY-MM-DD (ej. '2026-02-01')
  closeDate: string; // YYYY-MM-DD (ej. '2026-11-30')
  allowedDays: number[]; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  startTime: string; // HH:mm (ej. '07:00')
  endTime: string; // HH:mm (ej. '22:00')
  // R3: Entregas Tardías con Penalización Automática ("Ventana de Gracia")
  allowLateSubmission: boolean;
  lateGraceHours: number; // Horas adicionales después del cierre de fecha o ventana horaria
  latePenaltyPercent: number; // % de descuento automático sobre la calificación (ej. 15%)
  maxGradeOnLate: number; // Nota máxima tope en entrega tardía (ej. 4.0)
  // R1: Modo Consulta ("Solo Lectura") tras cierre
  readOnlyAfterClose: boolean;
  customClosedMessage?: string;
}

export interface StudentIndividualExtension {
  id: string;
  studentId: string;
  studentName: string;
  activityKey: AcademicActivityKey;
  activityLabel: string;
  expiresAtIso: string; // Fecha y hora límite ISO o YYYY-MM-DDTHH:mm
  motivo: string;
  sinPenalizacion: boolean; // Si exime la penalización por entrega tardía
  grantedBy: string;
  createdAtIso: string;
  activa: boolean;
}

export interface CourseScheduleConfig {
  courseOpenDate: string; // YYYY-MM-DD
  courseOpenTime: string; // HH:mm
  courseCloseDate: string; // YYYY-MM-DD
  courseCloseTime: string; // HH:mm
  courseStatusOverride: ActivityWindowOverrideMode;
  readOnlyWhenClosed: boolean;
  activityWindows: Record<AcademicActivityKey, ActivityScheduleWindowConfig>;
  studentExtensions: StudentIndividualExtension[];
  updatedAtIso: string;
}

export interface StudentRosterDatabaseEntry {
  id: string;
  name: string;
  code: string;
  description?: string;
  students: StudentRecord[];
  updatedAtIso: string;
}

export interface QuestionBankDatabaseEntry {
  id: string;
  name: string;
  code: string;
  description?: string;
  questions: Question[];
  updatedAtIso: string;
}

export interface TeacherAccountRecord {
  id: string; // Usuario / ID del docente (ej. 'DOCENTE2026', 'PROF01')
  nombre: string; // Nombre completo del docente
  claveAcceso: string; // Clave de acceso al Panel Docente
  correo?: string;
  especialidad?: string;
  activo: boolean;
  esTitularPrincipal?: boolean; // Si tiene acceso maestro o por asignación
  cursosAsignadosIds: string[]; // IDs de los cursos a los que tiene acceso
  updatedAtIso?: string;
}

export interface UniversalModuleDocumentLink {
  id: string;
  titulo: string; // ej. 'Guía del Módulo 1 (PDF)'
  url: string; // Enlace de descarga o visualización (Google Drive, PDF, OneDrive, etc.)
  tipo?: string; // ej. 'PDF', 'Drive', 'Presentación', 'Plantilla'
}

export interface UniversalModuleGradingWeights {
  comportamientoPct: number; // default: 10 (%)
  participacionPct: number; // default: 15 (%) (Sustentación / Participación)
  examenPct: number; // default: 35 (%)
  trabajoPct: number; // default: 40 (%) (Reto/s / Trabajo)
}

export interface UniversalModuleDefinition {
  id: number; // 1..N
  code: string; // ej. 'M1', 'C1'
  shortTitle: string; // ej. 'Fundamentos y Entorno Digital'
  fullTitle: string; // ej. 'Módulo 1: Fundamentos y Entorno Digital'
  horasModulo?: number | string; // Horas para el módulo
  description?: string; // Descripción del módulo
  observacion?: string; // Observación del módulo
  temasModulo?: string[]; // Lista de temas del módulo
  retoBadgeTitle?: string; // Nombre de la insignia/reto de este módulo
  activo?: boolean;
  // Configuración específica por cada módulo:
  examenesCount?: number; // Cantidad de exámenes de este módulo (default: 1)
  retosCount?: number; // Cantidad de retos por este módulo (default: 2)
  preguntasExamenModuloCount?: number; // Cantidad de preguntas en el examen de este módulo (default: 25)
  preguntasParaIntegralCount?: number; // Cantidad de preguntas de este módulo que se suman al Examen Integral Final (default: 8)
  preguntasSeleccionadasIntegralIds?: string[]; // IDs específicos de preguntas seleccionadas de este módulo para el Examen Integral Final
  ponderacion?: UniversalModuleGradingWeights; // Comportamiento, Sustentación/Participación, Examen/es, Reto/s
  ponderacionGlobalModuloPct?: number; // Peso porcentual de este módulo en la ponderación global del curso
  asistenciaBloqueA?: boolean; // Primer llamado al inicio de clases
  asistenciaBloqueB?: boolean; // Segundo llamado al finalizar clases
  documentosEnlaces?: UniversalModuleDocumentLink[]; // Enlaces de documentos descargables para el estudiante
  enlacesTextoRaw?: string; // Espacio directo para pegar enlaces (uno por línea)
}

export interface UniversalExamDefinition {
  id: ExamModality;
  title: string;
  subtitle: string;
  badge: string;
  moduloFilter?: number;
  questionsCount: number;
  durationMinutes: number;
  maxAttempts: number;
  activo: boolean;
  sumarAutomaticamenteDeModulos?: boolean; // Si es true en el examen integral, calcula questionsCount sumando las preguntas seleccionadas de todos los módulos
}

export interface UniversalCourseMetadata {
  courseId: string;
  nombreCurso: string;
  codigoCurso: string; // Prefijo ej. 'MM26', 'AD26'
  programaAcademico: string;
  nombreAsignatura?: string;
  institucionSede: string;
  periodoAcademico: string;
  docenteResponsable: string;
  docenteAsignadoId?: string; // ID del docente titular asignado desde el Panel Editor
  docenteAsignadoClave?: string; // Clave asignada al docente del curso
  docentesAutorizadosIds?: string[]; // IDs de todos los docentes autorizados para acceder a este curso
  descripcionGeneral: string;
  ponderacionGlobalCursoPct?: number;
  cantidadModulos: number;
  cantidadExamenes: number;
  cantidadRetos: number;
  habilitarExamenIntegral?: boolean; // Examen final fuera de los módulos que integra preguntas desde el primer hasta el último módulo
  selectedStudentRosterDbId?: string;
  selectedStudentRosterDbName?: string;
  selectedQuestionBankDbId?: string;
  selectedQuestionBankDbName?: string;
  modulosCurso: UniversalModuleDefinition[];
  examenesCurso: UniversalExamDefinition[];
  courseScheduleConfig?: CourseScheduleConfig;
  updatedAtIso: string;
}

export interface CourseVersionSnapshot {
  snapshotId: string;
  createdAtIso: string;
  label: string;
  meta: UniversalCourseMetadata;
  questions: Question[];
  customMiniRetos?: CustomMiniRetoTemplate[];
}

export interface UniversalCourseWorkspace {
  meta: UniversalCourseMetadata;
  studentsCount: number;
  questionsCount: number;
  attemptsCount: number;
  retosCount: number;
  students?: StudentRecord[];
  questions?: Question[];
  attempts?: ExamAttemptResult[];
  abproEvaluations?: ABProProjectEvaluation[];
  customMiniRetos?: CustomMiniRetoTemplate[];
  academicDataset?: any;
  versionSnapshots?: CourseVersionSnapshot[]; // Últimos 3 puntos de restauración del curso
}

