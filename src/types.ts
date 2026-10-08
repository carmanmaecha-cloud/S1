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

export interface StudentRecord {
  id: string;
  nombre: string;
  codigoAcceso: string; // Código único asignado o 1000000000 para usuario de prueba
  intentosUsados: number;
  maxIntentosPermitidos?: 1 | 2; // Configurable al reiniciar (1 o 2 intentos permitidos, por defecto 2)
  maxLlamadosAtencionIndividual?: number | null; // Límite individual de llamados anti-trampa antes de suspensión (null/undefined = usa el global)
  advertenciasCambioFoco?: number;
  suspendido: boolean;
  conceptoInfraccion: string; // ej. "✓ Sin infracciones" o "Cambio de pestaña / ventana detectado 2 veces"
  preguntasIntento1: string[]; // IDs de preguntas usadas en Intento 1
  preguntasIntento2: string[]; // IDs de preguntas usadas en Intento 2
  preguntasUsadasPorModalidad?: Partial<Record<ExamModality, string[]>>;
  examenesBloqueados?: ExamModality[]; // Bloqueo / Desbloqueo de Examen Por Estudiante (específico, varios o todos)
  modulosRetosBloqueados?: (1 | 2 | 3 | 4 | 5)[]; // Módulos de Mini Retos (1 al 5) deshabilitados específicamente para este estudiante
  progresoRetos?: Partial<Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress>>;
  historialIntentosRetos?: MiniRetoAttemptRecord[];
  historialLlamadosAtencion?: AntiCheatLogEntry[];
  resumenServidor?: StudentServerAcademicSummary;
}

export interface ExamAttemptResult {
  attemptId: string;
  fecha: string;
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
}
