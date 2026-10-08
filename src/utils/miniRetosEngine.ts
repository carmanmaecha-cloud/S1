import type {
  Question,
  MiniRetoFamily,
  MiniRetoMechanicId,
  GeneratedMiniRetoInstance,
  CustomMiniRetoTemplate,
  StudentRetoModuleProgress,
  SystemConfig
} from '../types.ts';

export interface OfficialBadgeDefinition {
  modulo: 1 | 2 | 3 | 4 | 5;
  icono: string;
  tituloPrincipal: string;
  subtitulo: string;
  leyendaReconocimiento: string;
  colorBg: string;
  colorBorder: string;
  colorText: string;
}

export const OFFICIAL_BADGES: OfficialBadgeDefinition[] = [
  {
    modulo: 1,
    icono: '🧭',
    tituloPrincipal: 'Cartógrafo del Mercado',
    subtitulo: 'Módulo 1 · Introducción al Mapeo de Mercado',
    leyendaReconocimiento:
      'Por dominar el mapeo de ecosistemas digitales, competidores directos/sustitutos y variables del entorno.',
    colorBg: 'bg-sky-50',
    colorBorder: 'border-sky-300',
    colorText: 'text-sky-900'
  },
  {
    modulo: 2,
    icono: '🧠',
    tituloPrincipal: 'Mente del Consumidor',
    subtitulo: 'Módulo 2 · Factores Psicológicos y Sociales',
    leyendaReconocimiento:
      'Por descifrar los factores culturales, sociales, grupos de referencia y disparadores psicológicos de compra.',
    colorBg: 'bg-indigo-50',
    colorBorder: 'border-indigo-300',
    colorText: 'text-indigo-900'
  },
  {
    modulo: 3,
    icono: '🕵️‍♂️',
    tituloPrincipal: 'Sherlock de los Datos',
    subtitulo: 'Módulo 3 · Investigación de Mercados y Datos',
    leyendaReconocimiento:
      'Por aplicar técnicas de investigación cualitativa y cuantitativa sin sesgos en el territorio.',
    colorBg: 'bg-emerald-50',
    colorBorder: 'border-emerald-300',
    colorText: 'text-emerald-900'
  },
  {
    modulo: 4,
    icono: '🎯',
    tituloPrincipal: 'Arquitecto de Segmentos',
    subtitulo: 'Módulo 4 · Segmentación y Posicionamiento',
    leyendaReconocimiento:
      'Por construir Buyer Personas, Arquetipos, Matrices RFM y Mapas de Empatía precisos.',
    colorBg: 'bg-amber-50',
    colorBorder: 'border-amber-300',
    colorText: 'text-amber-900'
  },
  {
    modulo: 5,
    icono: '🚀',
    tituloPrincipal: 'Visionario Omnicanal',
    subtitulo: 'Módulo 5 · Tendencias del Mercado y Contenidos',
    leyendaReconocimiento:
      'Por conectar estrategias Phygital, Social Commerce, contenidos e insights con resultados de negocio.',
    colorBg: 'bg-purple-50',
    colorBorder: 'border-purple-300',
    colorText: 'text-purple-900'
  }
];

export const SPECIAL_DISTINCTION_BADGE = {
  icono: '🏆',
  tituloPrincipal: 'Maestro Estratega PRU — Colección Completa (5/5)',
  subtitulo:
    'Reconocimiento Especial en Mapeo de Mercado y Comportamiento del Consumidor por conquistar las 5 insignias modulares.'
};

export interface MechanicMetadata {
  id: MiniRetoMechanicId;
  nombre: string;
  icono: string;
  familia: MiniRetoFamily;
  descripcionBreve: string;
  instruccionPromptIA: string;
}

export const MINI_RETO_MECHANICS: MechanicMetadata[] = [
  {
    id: 'adivina_quien_soy',
    nombre: 'Adivina Quién Soy (Lógica por Pistas)',
    icono: '🎭',
    familia: 'Deducción y Misterio',
    descripcionBreve:
      'El concepto habla en primera persona dando pistas cotidianas sin revelar su nombre técnico.',
    instruccionPromptIA:
      'Redacta el reto en primera persona ("No soy..., a veces soy..., para ti represento...") dando pistas vivenciales sin decir el nombre técnico.'
  },
  {
    id: 'el_intruso',
    nombre: 'El Intruso (Categorización y Lógica)',
    icono: '🕵️',
    familia: 'Deducción y Misterio',
    descripcionBreve:
      'Identifica cuál de las prácticas o conceptos infiltrados rompe la lógica teórica del módulo y justifica tu descarte.',
    instruccionPromptIA:
      'Presenta un escenario con acciones o conceptos donde uno es un intruso erróneo y pide al estudiante identificarlo y justificar la opción correcta.'
  },
  {
    id: 'abogado_del_diablo',
    nombre: 'El Abogado del Diablo (Refutación Teórica)',
    icono: '😈',
    familia: 'Análisis Crítico y Refutación',
    descripcionBreve:
      'Un socio terco afirma con seguridad una falacia comercial que suena lógica; debes desmentirlo con la teoría de clase.',
    instruccionPromptIA:
      'Presenta a un socio o comerciante haciendo una afirmación falsa pero que suena convincente (basada en un distractor) para que el estudiante la refute con teoría.'
  },
  {
    id: 'detective_caza_errores',
    nombre: 'El Detective Caza-Errores (Análisis Crítico)',
    icono: '🔍',
    familia: 'Análisis Crítico y Refutación',
    descripcionBreve:
      'Detecta la trampa o falla teórica intencional oculta dentro de una historia comercial aparentemente exitosa.',
    instruccionPromptIA:
      'Narra una historia comercial en La Dorada con un error metodológico o conceptual oculto para que el estudiante lo detecte y corrija.'
  },
  {
    id: 'sesgo_dueno_terco',
    nombre: 'El Sesgo del Dueño Terco (Diagnóstico)',
    icono: '🧱',
    familia: 'Análisis Crítico y Refutación',
    descripcionBreve:
      'Diagnostica qué sesgo cognitivo o factor del consumidor está ignorando un comerciante en la vida real.',
    instruccionPromptIA:
      'Muestra a un propietario de negocio en La Dorada aferrado a una creencia equivocada y pide diagnosticar qué factor del mercado o del consumidor ignora.'
  },
  {
    id: 'trampa_roles_familiares',
    nombre: 'La Trampa de los Roles de Compra',
    icono: '🪤',
    familia: 'Análisis Crítico y Refutación',
    descripcionBreve:
      'Desenreda el giro lógico entre quién inicia, quién influye, quién decide, quién paga y quién consume.',
    instruccionPromptIA:
      'Presenta un caso con múltiples actores en la compra o el mercado y pide distinguir quién cumple el rol decisivo y qué estrategia aplicar.'
  },
  {
    id: 'juicio_consumidor',
    nombre: 'El Juicio del Consumidor (Veredicto con Pruebas)',
    icono: '⚖️',
    familia: 'Análisis Crítico y Refutación',
    descripcionBreve:
      'Dos posturas opuestas debaten sobre un cliente en La Dorada; actúa como juez y dicta quién tiene la razón teórica.',
    instruccionPromptIA:
      'Presenta dos posturas enfrentadas ante un caso de marketing en La Dorada y pide al estudiante dictar un veredicto argumentado.'
  },
  {
    id: 'traductor_del_barrio',
    nombre: 'El Traductor del Barrio (Técnica Feynman)',
    icono: '🗣️',
    familia: 'Aplicación Local y Feynman',
    descripcionBreve:
      'Explica el concepto técnico con palabras sencillas y ejemplos de barrio como si hablaras con don Chucho en La Dorada.',
    instruccionPromptIA:
      'Pide al estudiante que le explique a Don Chucho (tendero del barrio Las Ferias en La Dorada) el concepto técnico usando palabras sencillas y un ejemplo cotidiano.'
  },
  {
    id: 'whatsapp_cliente_indeciso',
    nombre: 'WhatsApp del Cliente Indeciso',
    icono: '💬',
    familia: 'Aplicación Local y Feynman',
    descripcionBreve:
      'Analiza el mensaje de WhatsApp de un cliente real y explica qué factor psicológico o comercial actúa detrás.',
    instruccionPromptIA:
      'Simula un mensaje de WhatsApp de un cliente o comerciante de La Dorada para que el estudiante le responda con el diagnóstico y la recomendación.'
  },
  {
    id: 'escoge_tu_aventura',
    nombre: 'Escoge tu Propia Aventura (Toma de Decisiones)',
    icono: '🧭',
    familia: 'Estrategia y Creación',
    descripcionBreve:
      'Asume el rol de gerente frente a una encrucijada comercial en La Dorada y fundamenta tu decisión.',
    instruccionPromptIA:
      'Coloca al estudiante como gerente del negocio en La Dorada ante una decisión clave y pídele explicar qué camino toma y por qué.'
  },
  {
    id: 'jeroglifico_kotler',
    nombre: 'El Jeroglífico de Kotler (Traducción Visual)',
    icono: '🧩',
    familia: 'Estrategia y Creación',
    descripcionBreve:
      'Conecta la secuencia visual de símbolos con la teoría secuencial del módulo y explica el eslabón clave.',
    instruccionPromptIA:
      'Presenta una secuencia de emojis/etapas del proceso comercial con un eslabón faltante para que el estudiante lo descifre y explique.'
  },
  {
    id: 'autopsia_fracaso',
    nombre: 'Autopsia de un Fracaso (Ingeniería Inversa)',
    icono: '🚑',
    familia: 'Estrategia y Creación',
    descripcionBreve:
      'A partir de un tropiezo comercial en el municipio, descubre qué variable crítica del mercado se omitió.',
    instruccionPromptIA:
      'Presenta el fracaso de una campaña o negocio local y pide realizar la autopsia estratégica indicando qué principio se violó y cómo salvarlo.'
  }
];

export const INITIAL_CUSTOM_MINI_RETOS: CustomMiniRetoTemplate[] = [
  {
    id: 'RETO-SEMILLA-M2-001',
    modulo: 2,
    tema: 'Tema 2.2 · Factores Sociales y Grupos de Referencia',
    familia: 'Deducción y Misterio',
    mecanicaId: 'adivina_quien_soy',
    mecanicaNombre: 'Adivina Quién Soy (Lógica por Pistas)',
    titulo: 'El Espejo de lo que Quieres Llegar a Ser',
    narrativa:
      '👤 "No soy de tu familia, de hecho, ni siquiera te conozco. A veces soy un futbolista, a veces soy un creador de contenido de TikTok. Tú quieres vestirte como yo, comprar los audífonos que yo uso y tomar la bebida que yo tomo. Para ti, yo represento lo que tú quieres llegar a ser en el futuro."',
    preguntaReto:
      'En la teoría de Factores Sociales (Tema 2.2), ¿cuál es mi nombre técnico de dos palabras y cómo influyo en tus decisiones de compra? (Pista: Soy un tipo específico de Grupo de Referencia).',
    pistaOpcional:
      'Piensa en los grupos de referencia a los que el comprador aún NO pertenece, pero admira y aspira a pertenecer o imitar.',
    respuestaEsperada:
      'Eres un Grupo Aspiracional (o Grupo de Referencia Aspiracional): aquel al que el individuo no pertenece pero admira y desea imitar en sus hábitos de consumo.',
    conceptosClave: [
      'grupo aspiracional',
      'referencia aspiracional',
      'aspiracional',
      'grupo de referencia',
      'aspira pertenecer',
      'imitar',
      'famosos',
      'lider de opinion'
    ],
    criterioEvaluacion60:
      'Supera el 60% si menciona "Grupo Aspiracional" / "Grupo de Referencia Aspiracional", o si explica con sus propias palabras que es un grupo de referencia al que uno aspira pertenecer o imitar como figuras públicas o influencers.',
    umbralAprobacionPct: 60,
    activo: true
  },
  {
    id: 'RETO-SEMILLA-M1-001',
    modulo: 1,
    tema: 'Tema 1.1 · Definición y Propósito del Mapeo de Mercado',
    familia: 'Análisis Crítico y Refutación',
    mecanicaId: 'abogado_del_diablo',
    mecanicaNombre: 'El Abogado del Diablo (Refutación Teórica)',
    titulo: 'El Socio que Solo Mira a los Vecinos Iguales',
    narrativa:
      '😈 Don Álvaro, dueño de una pescadería tradicional en el puerto de La Dorada, afirma con total seguridad: "Mi único competidor real son las otras tres pescaderías del muelle. Los asaderos de pollo y las apps de domicilios venden otra cosa distinta, así que no me quitan clientes ni tengo por qué incluirlos en mi mapeo de mercado".',
    preguntaReto:
      'Actúa como consultor de marketing y refuta a Don Álvaro: ¿qué tipo de competidores está ignorando y por qué sí afectan directamente las ventas de su pescadería?',
    pistaOpcional:
      'Las familias tienen un solo presupuesto para el almuerzo (proteína): aunque el producto físico cambie, la necesidad que satisface es la misma.',
    respuestaEsperada:
      'Está ignorando a los Competidores Sustitutos (o indirectos). Aunque no venden pescado, el pollo y las apps satisfacen la misma necesidad básica de alimentación/proteína y compiten por el mismo presupuesto familiar.',
    conceptosClave: [
      'sustitutos',
      'competidores sustitutos',
      'competencia indirecta',
      'misma necesidad',
      'presupuesto',
      'proteina',
      'alternativa'
    ],
    criterioEvaluacion60:
      'Supera el 60% si identifica el concepto de Competidores Sustitutos (o competencia indirecta) o explica que satisfacen la misma necesidad de alimentación compitiendo por el mismo presupuesto del cliente.',
    umbralAprobacionPct: 60,
    activo: true
  },
  {
    id: 'RETO-SEMILLA-M3-001',
    modulo: 3,
    tema: 'Tema 3.1 · Métodos Cualitativos y Cuantitativos en Investigación',
    familia: 'Análisis Crítico y Refutación',
    mecanicaId: 'detective_caza_errores',
    mecanicaNombre: 'El Detective Caza-Errores (Análisis Crítico)',
    titulo: 'La Encuesta "Perfecta" de la Heladería',
    narrativa:
      '🔍 Un emprendedor de La Dorada encuestó a 100 vecinos con la siguiente pregunta: "¿Verdad que usted prefiere nuestro delicioso helado artesanal 100% natural en lugar de los helados industriales llenos de químicos dañinos?". El 96% respondió que sí, pero al abrir el local las ventas fueron mínimas.',
    preguntaReto:
      'Como Detective Caza-Errores: ¿qué falla metodológica o sesgo cometió al redactar esa pregunta y por qué invalidó los datos de la investigación?',
    pistaOpcional:
      'Observa los adjetivos calificativos ("delicioso", "llenos de químicos dañinos") y cómo empieza la frase ("¿Verdad que...?").',
    respuestaEsperada:
      'Cometió un Sesgo de Inducción (pregunta sesgada, dirigida o con carga emocional) que empuja al encuestado a dar una respuesta complaciente en lugar de reflejar su conducta real de compra.',
    conceptosClave: [
      'sesgo',
      'pregunta sesgada',
      'induccion',
      'dirigida',
      'adjetivos',
      'carga emocional',
      'neutralidad'
    ],
    criterioEvaluacion60:
      'Supera el 60% si explica que la pregunta está sesgada, dirigida o inducida mediante adjetivos positivos/negativos que condicionan la respuesta del encuestado.',
    umbralAprobacionPct: 60,
    activo: true
  },
  {
    id: 'RETO-SEMILLA-M4-001',
    modulo: 4,
    tema: 'Tema 4.1 · Técnicas de Segmentación de Mercado',
    familia: 'Aplicación Local y Feynman',
    mecanicaId: 'traductor_del_barrio',
    mecanicaNombre: 'El Traductor del Barrio (Técnica Feynman)',
    titulo: 'Las Dos Vecinas Idénticas pero Opuestas',
    narrativa:
      '🗣️ Doña Marta y Doña Lucía viven en la misma cuadra del barrio Las Ferias en La Dorada, ambas tienen 34 años, dos hijos y exactamente el mismo ingreso mensual. Sin embargo, Doña Marta solo compra donde sea más barato, mientras Doña Lucía paga más por productos ecológicos y atención personalizada. Don Chucho, el tendero, no entiende por qué compran distinto si "tienen la misma edad y el mismo sueldo".',
    preguntaReto:
      'Explícale a Don Chucho con palabras sencillas: ¿qué tipo de segmentación (más allá de la demográfica) explica que dos personas con la misma edad e ingresos compren de forma tan diferente?',
    pistaOpcional:
      'No tiene que ver con la edad ni el sueldo (demografía), sino con su estilo de vida, valores, personalidad y el beneficio que cada una busca.',
    respuestaEsperada:
      'Se explica por la Segmentación Psicográfica (valores, estilo de vida, actitudes y personalidad) y Conductual (beneficio buscado y sensibilidad al precio), que van más allá de los datos demográficos básicos.',
    conceptosClave: [
      'psicografica',
      'conductual',
      'estilo de vida',
      'valores',
      'personalidad',
      'beneficio buscado',
      'motivaciones'
    ],
    criterioEvaluacion60:
      'Supera el 60% si menciona la segmentación psicográfica o conductual, o si explica en lenguaje claro que las diferencias radican en sus valores, estilo de vida y beneficios buscados.',
    umbralAprobacionPct: 60,
    activo: true
  },
  {
    id: 'RETO-SEMILLA-M5-001',
    modulo: 5,
    tema: 'Tema 5.1 · Tendencias Omnicanal y Comportamiento Digital',
    familia: 'Estrategia y Creación',
    mecanicaId: 'jeroglifico_kotler',
    mecanicaNombre: 'El Jeroglífico de Kotler (Traducción Visual)',
    titulo: 'La Ruta Secreta del Comprador Doradense',
    narrativa:
      '🧩 Observa esta secuencia real que ocurre todas las tardes en los comercios de La Dorada:\n📱👀 (Ve un Reel en TikTok/Instagram) ➡️ 💬🤝 (Pregunta precio y talla por WhatsApp) ➡️ 🏪🛍️ (Va al local físico o paga con Nequi al recibir).',
    preguntaReto:
      '¿Cómo se denomina en el marketing moderno esta integración fluida entre canales digitales y tienda física (o investigar online y comprar offline), y por qué una MiPyme no debe descuidar ninguno de los dos mundos?',
    pistaOpcional:
      'Une el mundo "Physical" (físico) con el "Digital", o piensa en la estrategia Omnicanal / efecto ROPO.',
    respuestaEsperada:
      'Es la estrategia Omnicanal / Phygital y el efecto ROPO (Research Online, Purchase Offline) integrado con Social Commerce conversacional, donde el cliente descubre en redes, valida por WhatsApp y concreta en el punto físico.',
    conceptosClave: [
      'omnicanal',
      'omnicanalidad',
      'phygital',
      'ropo',
      'fisico y digital',
      'social commerce',
      'canales integrados'
    ],
    criterioEvaluacion60:
      'Supera el 60% si identifica la estrategia Omnicanal, Phygital o efecto ROPO, o si explica con claridad cómo el cliente actual integra la búsqueda digital en redes/WhatsApp con la compra o retiro físico.',
    umbralAprobacionPct: 60,
    activo: true
  }
];

const STOPWORDS_ES = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en',
  'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'que', 'y',
  'o', 'u', 'e', 'ni', 'pero', 'como', 'cuando', 'donde', 'quien', 'cual', 'cuales',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
  'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nuestro', 'nuestra', 'se', 'lo', 'le', 'les',
  'me', 'te', 'nos', 'es', 'son', 'fue', 'ser', 'estar', 'estan', 'ha', 'han', 'hay',
  'mas', 'menos', 'muy', 'ya', 'si', 'no', 'tambien', 'porque', 'pues', 'asi', 'cada',
  'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma'
]);

export function normalizeSpanishText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stemSpanishWord(word: string): string {
  const w = normalizeSpanishText(word);
  if (w.length <= 4) return w;
  const suffixes = [
    'amientos', 'imientos', 'aciones', 'iciones', 'amiento', 'imiento',
    'adoras', 'adores', 'logias', 'logia', 'idades', 'mente', 'acion',
    'icion', 'adora', 'ibles', 'ables', 'istas', 'ista', 'idad', 'ivas',
    'ivos', 'iva', 'ivo', 'ales', 'ares', 'ando', 'iendo', 'ados', 'idos',
    'ada', 'ido', 'es', 'os', 'as', 's'
  ];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      return w.slice(0, w.length - suf.length);
    }
  }
  return w;
}

export function extractKeywordsFromQuestion(q: Question): string[] {
  const correctOptionText = q.opciones[q.correcta] || '';
  const combinedSource = `${q.tema} ${correctOptionText} ${q.justificacion}`;
  const tokens = normalizeSpanishText(combinedSource)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS_ES.has(w));

  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map((entry) => entry[0]);
}

export function getDefaultRetoProgress(): Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress> {
  const build = (m: 1 | 2 | 3 | 4 | 5): StudentRetoModuleProgress => ({
    modulo: m,
    intentosUsados: 0,
    maxIntentos: 3,
    insigniaDesbloqueada: false,
    mejorPorcentaje: 0,
    bloqueadoPorFallo: false,
    preguntasRetoUsadas: [],
    mecanicasUsadas: [],
    historialIntentos: []
  });
  return {
    1: build(1),
    2: build(2),
    3: build(3),
    4: build(4),
    5: build(5)
  };
}

export function isMiniRetosWithinSchedule(config: SystemConfig): {
  allowed: boolean;
  reason: string;
} {
  if (config.miniRetosSinRestriccionHora !== false) {
    return { allowed: true, reason: 'Sin restricción horaria' };
  }
  const now = new Date();
  const currentDay = now.getDay();
  const allowedDays =
    Array.isArray(config.miniRetosDiasPermitidos) && config.miniRetosDiasPermitidos.length > 0
      ? config.miniRetosDiasPermitidos
      : [1, 2, 3, 4, 5, 6];

  if (!allowedDays.includes(currentDay)) {
    return {
      allowed: false,
      reason: 'Hoy no es un día habilitado en el calendario docente para participar en Mini Retos.'
    };
  }

  const startStr = config.miniRetosHoraInicio || '07:00';
  const endStr = config.miniRetosHoraFin || '22:00';
  const [sh, sm] = startStr.split(':').map((n) => Number(n) || 0);
  const [eh, em] = endStr.split(':').map((n) => Number(n) || 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return {
      allowed: false,
      reason: `La ventana horaria permitida por el docente para Mini Retos es de ${startStr} a ${endStr}.`
    };
  }

  return { allowed: true, reason: 'Dentro del horario permitido' };
}

/**
 * Transformador Local Dinámico: Convierte cualquier reactivo del Banco de 740 Preguntas
 * en un Mini Reto de respuesta abierta según la mecánica elegida (ocultando las opciones A/B/C/D).
 */
export function generateLocalDynamicReto(
  q: Question,
  mechanicId?: MiniRetoMechanicId,
  umbralDefault = 60
): GeneratedMiniRetoInstance {
  const chosenMechanic =
    MINI_RETO_MECHANICS.find((m) => m.id === mechanicId) ||
    MINI_RETO_MECHANICS[Math.floor(Math.random() * MINI_RETO_MECHANICS.length)];

  const correctText = q.opciones[q.correcta] || '';
  const wrongLetters = (['A', 'B', 'C', 'D'] as const).filter((l) => l !== q.correcta);
  const distractor1 = q.opciones[wrongLetters[0]] || '';
  const distractor2 = q.opciones[wrongLetters[1]] || '';
  const distractor3 = q.opciones[wrongLetters[2]] || '';

  const baseCase = q.contexto && q.contexto.length > 20 ? q.contexto : q.enunciado;
  const keywords = extractKeywordsFromQuestion(q);

  let tituloReto = `${chosenMechanic.nombre.split('(')[0].trim()} · Módulo ${q.modulo}`;
  let narrativaEscenario = '';
  let preguntaReto = '';
  let pistaOpcional = '';

  switch (chosenMechanic.id) {
    case 'adivina_quien_soy':
      tituloReto = `🎭 Adivina Quién Soy · ${q.tema.split('·').pop()?.trim() || `Módulo ${q.modulo}`}`;
      narrativaEscenario = `👤 "Escucha mis pistas en el comercio de La Dorada: ${baseCase}\n\nQuienes me aplican correctamente logran que: ${q.justificacion}"`;
      preguntaReto = `Según las pistas anteriores y la teoría del Módulo ${q.modulo} (${q.tema}), ¿qué concepto, herramienta o decisión estratégica represento y por qué soy clave en este caso?`;
      pistaOpcional = `Enfócate en cómo se resuelve la necesidad descrita en el caso: evita las salidas falsas como "${distractor1.slice(0, 65)}..." y explica el principio real.`;
      break;

    case 'abogado_del_diablo':
      tituloReto = `😈 El Abogado del Diablo · Refutación en el Módulo ${q.modulo}`;
      narrativaEscenario = `Contexto del caso en La Dorada: ${baseCase}\n\n😈 En medio de la reunión, un socio terco golpea la mesa y afirma con total seguridad: "¡La solución es obvia: ${distractor1}!"`;
      preguntaReto = `Actúa como consultor de marketing y refuta con argumentos del Módulo ${q.modulo} la afirmación del socio: ¿por qué está equivocado y cuál es la decisión teórica correcta?`;
      pistaOpcional = `Piensa por qué la propuesta del socio destruye valor o ignora el mercado, y apóyate en el concepto de ${q.tema}.`;
      break;

    case 'traductor_del_barrio':
      tituloReto = `🗣️ El Traductor del Barrio (Técnica Feynman) · Módulo ${q.modulo}`;
      narrativaEscenario = `Don Chucho, comerciante tradicional del barrio Las Ferias en La Dorada, vive esta situación: ${baseCase}`;
      preguntaReto = `Explícale a Don Chucho con palabras sencillas de barrio (sin tecnicismos enredados): ¿qué debería hacer en su negocio y por qué esa es la mejor jugada según el tema "${q.tema}"?`;
      pistaOpcional = `Usa una analogía cotidiana o ejemplo claro del comercio local que demuestre por qué funciona esta estrategia.`;
      break;

    case 'el_intruso':
      tituloReto = `🕵️ El Intruso Conceptual · Módulo ${q.modulo}`;
      narrativaEscenario = `Analiza el siguiente escenario en La Dorada: ${baseCase}\n\nSe proponen dos caminos opuestos:\n• Postura 1: "${distractor1}"\n• Postura 2: "${correctText}"`;
      preguntaReto = `Identifica cuál de las dos posturas es "El Intruso" (la práctica errónea que contradice la teoría del Módulo ${q.modulo}) y argumenta con tus palabras por qué la otra postura sí es la correcta.`;
      pistaOpcional = `Compara cuál de las dos opciones se basa en evidencia real del consumidor/mercado y cuál parte de una suposición sin sustento.`;
      break;

    case 'detective_caza_errores':
      tituloReto = `🔍 El Detective Caza-Errores · Caso ${q.id}`;
      narrativaEscenario = `🔍 En una asesoría en La Dorada se presentó el siguiente caso: ${baseCase}\n\nEl encargado tomó la siguiente decisión apresurada: "${distractor2 || distractor1}".`;
      preguntaReto = `Como Detective Caza-Errores: ¿cuál es el error teórico oculto en esa decisión y cómo debería corregirse aplicando correctamente ${q.tema}?`;
      pistaOpcional = `Revisa qué variable del entorno, del cliente o de los datos omitió el encargado al tomar esa decisión.`;
      break;

    case 'jeroglifico_kotler':
      tituloReto = `🧩 El Jeroglífico de Kotler · Secuencia Estratégica M${q.modulo}`;
      narrativaEscenario = `🧩 Observa la secuencia lógica de este caso en La Dorada:\n1️⃣ Situación inicial: ${baseCase}\n2️⃣ ❓ [ESLABÓN ESTRATÉGICO CLAVE]\n3️⃣ Resultado esperado: Toma de decisión rentable y sostenible basada en evidencia.`;
      preguntaReto = `Descifra el eslabón #2 (❓): ¿qué acción, herramienta o principio de "${q.tema}" debe aplicarse en ese punto intermedio para conectar el problema con el éxito comercial?`;
      pistaOpcional = `El eslabón perdido requiere aplicar análisis del mercado o del consumidor antes de ejecutar gastos a ciegas.`;
      break;

    case 'sesgo_dueno_terco':
      tituloReto = `🧱 El Sesgo del Dueño Terco · Diagnóstico M${q.modulo}`;
      narrativaEscenario = `🧱 Situación en el comercio local: ${baseCase}\n\nEl propietario insiste tercamente en: "${distractor3 || distractor1}".`;
      preguntaReto = `Diagnostica con tus propias palabras: ¿qué error conceptual o sesgo está cometiendo el propietario y qué le recomendarías hacer desde el Módulo ${q.modulo}?`;
      pistaOpcional = `Observa cómo el dueño antepone su creencia personal sobre el comportamiento o los datos reales del mercado.`;
      break;

    case 'trampa_roles_familiares':
      tituloReto = `🪤 La Trampa de los Roles y Decisiones · Módulo ${q.modulo}`;
      narrativaEscenario = `🪤 Analiza con cuidado los actores e intereses en este caso de La Dorada: ${baseCase}`;
      preguntaReto = `Desenreda la situación: ¿quiénes son los actores o factores determinantes aquí y cuál es la decisión estratégica acertada frente a "${q.pregunta || 'el reto planteado'}"?`;
      pistaOpcional = `Distingue entre lo que parece superficial a primera vista y lo que realmente mueve la decisión de compra o el mercado.`;
      break;

    case 'autopsia_fracaso':
      tituloReto = `🚑 Autopsia de un Fracaso · Ingeniería Inversa M${q.modulo}`;
      narrativaEscenario = `🚑 Historia de un tropiezo en La Dorada: ${baseCase}\n\nEl negocio perdió clientes porque aplicó la peor receta: "${distractor1}".`;
      preguntaReto = `Realiza la autopsia estratégica: ¿qué principio fundamental de "${q.tema}" se violó y qué acción concreta habría salvado al negocio?`;
      pistaOpcional = `Identifica la causa raíz: ¿falló el diagnóstico de competidores, la comprensión del cliente, los datos o la segmentación?`;
      break;

    case 'pitch_ascensor':
      tituloReto = `🎙️ El Pitch de Ascensor en 30 Segundos · Módulo ${q.modulo}`;
      narrativaEscenario = `🎙️ Tienes 30 segundos frente a un inversionista en La Dorada para resolver este caso: ${baseCase}`;
      preguntaReto = `Redacta tu Pitch ejecutivo (con tus propias palabras): ¿qué solución estratégica propones y por qué funcionará según el Módulo ${q.modulo}?`;
      pistaOpcional = `Sé directo: menciona qué harías, a qué público o actor impacta y qué ventaja competitiva genera.`;
      break;

    case 'bola_de_cristal':
      tituloReto = `🔮 La Bola de Cristal · Predicción Estratégica M${q.modulo}`;
      narrativaEscenario = `🔮 Escenario actual en La Dorada: ${baseCase}`;
      preguntaReto = `Mira en la Bola de Cristal del marketing: según la teoría de "${q.tema}", ¿qué pasará con el negocio si toma la decisión correcta y cuál debe ser esa decisión?`;
      pistaOpcional = `Conecta la causa (la estrategia aplicada) con el efecto real en la mente o el bolsillo del consumidor local.`;
      break;

    case 'juicio_consumidor':
      tituloReto = `⚖️ El Juicio del Consumidor · Veredicto M${q.modulo}`;
      narrativaEscenario = `⚖️ En un comité comercial en La Dorada se juzga este caso: ${baseCase}\n\n• Defensor A propone: "${distractor1}"\n• Defensor B sostiene que debe aplicarse un enfoque basado en ${q.tema.toLowerCase()}.`;
      preguntaReto = `Tú eres el Juez Estratégico: dicta tu veredicto explicando cuál postura tiene la razón teórica y cuál es la solución concreta para el negocio.`;
      pistaOpcional = `Tu fallo debe fundamentarse en cómo funciona realmente el ecosistema comercial y el consumidor en este módulo.`;
      break;

    case 'whatsapp_cliente_indeciso':
      tituloReto = `💬 WhatsApp del Cliente / Comerciante · Módulo ${q.modulo}`;
      narrativaEscenario = `💬 Acabas de recibir un audio transcrito por WhatsApp desde un negocio en La Dorada:\n"${baseCase}"`;
      preguntaReto = `Respóndele por WhatsApp como asesor de Marketing Digital: ¿cuál es tu diagnóstico sobre lo que está ocurriendo y qué le recomiendas hacer?`;
      pistaOpcional = `Respóndele de forma cercana pero demostrando dominio del concepto clave de ${q.tema}.`;
      break;

    case 'escoge_tu_aventura':
    default:
      tituloReto = `🧭 Escoge tu Propia Aventura · Gerencia en La Dorada (M${q.modulo})`;
      narrativaEscenario = `🧭 Hoy eres el gerente estratégico en este escenario real de La Dorada: ${baseCase}`;
      preguntaReto = `${q.pregunta || '¿Qué decisión estratégica tomarías como gerente?'} Fundamenta tu respuesta abierta con tus propias palabras aplicando los conceptos del Módulo ${q.modulo}.`;
      pistaOpcional = `Analiza qué alternativa genera valor sostenible para el negocio y resuelve la necesidad real del cliente en el territorio.`;
      break;
  }

  return {
    instanceId: `RETO-${q.id}-${Date.now()}`,
    sourceQuestionId: q.id,
    modulo: q.modulo,
    tema: q.tema,
    rap: q.rap,
    familia: chosenMechanic.familia,
    mecanicaId: chosenMechanic.id,
    mecanicaNombre: chosenMechanic.nombre,
    mecanicaIcono: chosenMechanic.icono,
    tituloReto,
    narrativaEscenario,
    preguntaReto,
    pistaOpcional,
    respuestaEsperadaDocente: `${correctText}. (${q.justificacion})`,
    justificacionTeoricaBase: q.justificacion,
    conceptosClave: keywords,
    criterioEvaluacion60: `El estudiante supera el ${umbralDefault}% si identifica la idea central de "${correctText}" o argumenta con sus propias palabras el principio de: "${q.justificacion}".`,
    umbralAprobacionPct: umbralDefault,
    generadoPor: 'LOCAL_FALLBACK'
  };
}

function computeTrigramSimilarity(a: string, b: string): number {
  const s1 = normalizeSpanishText(a);
  const s2 = normalizeSpanishText(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 3 || s2.length < 3) return s1.includes(s2) || s2.includes(s1) ? 0.8 : 0;

  const getTrigrams = (str: string) => {
    const set = new Set<string>();
    for (let i = 0; i <= str.length - 3; i++) {
      set.add(str.slice(i, i + 3));
    }
    return set;
  };

  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  let intersection = 0;
  t1.forEach((tri) => {
    if (t2.has(tri)) intersection++;
  });
  return (2 * intersection) / (t1.size + t2.size);
}

/**
 * Evaluador Semántico Local de Respaldo (Offline Fallback):
 * Evalúa coincidencias de raíces en español (stemming), sinónimos/conceptos clave,
 * coherencia argumentativa y originalidad (40% Concepto + 40% Argumentación + 20% Feynman).
 */
export function evaluateRetoLocally(
  reto: GeneratedMiniRetoInstance,
  respuestaEstudianteRaw: string
): {
  porcentajeIA: number;
  rubricaDesglose: {
    conceptoClavePct: number;
    argumentacionTeoricaPct: number;
    originalidadFeynmanPct: number;
  };
  aprobado: boolean;
  retroalimentacionIA: string;
  pistaSocratica: string;
  modoEvaluacion: 'LOCAL_FALLBACK';
} {
  const cleanStudent = normalizeSpanishText(respuestaEstudianteRaw);
  const studentWords = cleanStudent.split(' ').filter(Boolean);
  const umbral = reto.umbralAprobacionPct || 60;

  if (studentWords.length < 3 || cleanStudent.length < 12) {
    return {
      porcentajeIA: 12,
      rubricaDesglose: {
        conceptoClavePct: 4,
        argumentacionTeoricaPct: 4,
        originalidadFeynmanPct: 4
      },
      aprobado: false,
      retroalimentacionIA:
        'Tu respuesta es demasiado breve para evaluar tu razonamiento. Explica el concepto y por qué aplica al caso con tus propias palabras.',
      pistaSocratica: reto.pistaOpcional,
      modoEvaluacion: 'LOCAL_FALLBACK'
    };
  }

  const studentStems = new Set(studentWords.map(stemSpanishWord));
  const expectedNorm = normalizeSpanishText(reto.respuestaEsperadaDocente);
  const criterioNorm = normalizeSpanishText(reto.criterioEvaluacion60 || '');
  const combinedTargetNorm = `${expectedNorm} ${criterioNorm}`;

  // 1. Concepto Clave (sobre 40%)
  const targetKeywords =
    Array.isArray(reto.conceptosClave) && reto.conceptosClave.length > 0
      ? reto.conceptosClave
      : expectedNorm.split(' ').filter((w) => w.length >= 4 && !STOPWORDS_ES.has(w));

  let matchedKeywordCount = 0;
  for (const kw of targetKeywords) {
    const kwTokens = normalizeSpanishText(kw).split(' ').filter(Boolean);
    const anyTokenMatched = kwTokens.some((tok) => {
      const stem = stemSpanishWord(tok);
      if (studentStems.has(stem)) return true;
      for (const sw of studentWords) {
        if (sw.includes(stem) || stem.includes(sw)) return true;
      }
      return false;
    });
    if (anyTokenMatched) matchedKeywordCount++;
  }

  const directInclusionBoost =
    cleanStudent.includes(expectedNorm) || expectedNorm.includes(cleanStudent) ? 1 : 0;
  const kwRatio = Math.min(
    1,
    matchedKeywordCount / Math.max(2, Math.ceil(targetKeywords.length * 0.38)) +
      directInclusionBoost * 0.45
  );
  const conceptoClavePct = Math.min(40, Math.round(kwRatio * 40));

  // 2. Argumentación Teórica (sobre 40%)
  const targetStems = Array.from(
    new Set(
      combinedTargetNorm
        .split(' ')
        .filter((w) => w.length >= 4 && !STOPWORDS_ES.has(w))
        .map(stemSpanishWord)
    )
  );
  let stemOverlap = 0;
  targetStems.forEach((ts) => {
    if (studentStems.has(ts)) stemOverlap++;
  });
  const stemCoverage =
    targetStems.length > 0 ? stemOverlap / Math.max(3, targetStems.length * 0.35) : 0.5;
  const trigramSim = computeTrigramSimilarity(cleanStudent, expectedNorm);
  const hasCausalReasoning =
    /\b(porque|ya que|debido|permite|para que|logra|cuando|como|ejemplo|cliente|mercado|consumidor|negocio|estrategia|grupo|referencia)\b/.test(
      cleanStudent
    )
      ? 0.28
      : 0;

  const argScoreRaw = Math.min(1, Math.max(stemCoverage, trigramSim * 1.45) + hasCausalReasoning);
  const argumentacionTeoricaPct = Math.min(40, Math.round(argScoreRaw * 40));

  // 3. Originalidad / Técnica Feynman (sobre 20%)
  const looksLikeRoboticCopy =
    respuestaEstudianteRaw.includes('Como modelo de lenguaje') ||
    respuestaEstudianteRaw.length > 950;
  const wordCountScore = studentWords.length >= 6 ? 1 : studentWords.length / 6;
  const originalidadFeynmanPct = looksLikeRoboticCopy
    ? 4
    : Math.min(20, Math.max(9, Math.round(wordCountScore * 20)));

  const totalPct = Math.min(
    100,
    Math.max(0, conceptoClavePct + argumentacionTeoricaPct + originalidadFeynmanPct)
  );
  const aprobado = totalPct >= umbral;

  if (aprobado) {
    return {
      porcentajeIA: totalPct,
      rubricaDesglose: {
        conceptoClavePct,
        argumentacionTeoricaPct,
        originalidadFeynmanPct
      },
      aprobado: true,
      retroalimentacionIA: `¡Excelente razonamiento aplicado (${totalPct}% de afinidad semántica)! Conectaste correctamente la idea central del Módulo ${reto.modulo}: ${reto.respuestaEsperadaDocente}`,
      pistaSocratica: '',
      modoEvaluacion: 'LOCAL_FALLBACK'
    };
  }

  return {
    porcentajeIA: totalPct,
    rubricaDesglose: {
      conceptoClavePct,
      argumentacionTeoricaPct,
      originalidadFeynmanPct
    },
    aprobado: false,
    retroalimentacionIA: `Alcanzaste un ${totalPct}% de afinidad semántica (se requiere ≥ ${umbral}% para desbloquear la insignia). Tu respuesta se acerca parcialmente, pero falta precisar el fenómeno o argumentar por qué ocurre.`,
    pistaSocratica: `${reto.pistaOpcional} Piensa cómo se aplica directamente en "${reto.tema}".`,
    modoEvaluacion: 'LOCAL_FALLBACK'
  };
}
