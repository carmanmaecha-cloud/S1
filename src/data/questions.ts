import type { Question, BloomLevel } from '../types.ts';
import { BANCO_PART_1 } from './bancoPreguntasPart1.ts';

const CORE_QUESTIONS: Question[] = [
  // ================= MÓDULO 1: INTRODUCCIÓN AL MAPEO DE MERCADO =================
  {
    id: 'MM-M1-001',
    modulo: 1,
    tema: 'Definición y propósito del mapeo de mercado',
    bloom: 'Análisis',
    enunciado: 'Un emprendedor gastronómico en el centro de La Dorada (Caldas) desea abrir un servicio de almuerzos ejecutivos saludables. Antes de alquilar el local, elabora una cartografía competitiva cruzando "Precio promedio del plato" vs. "Velocidad de entrega en minutos" de los 14 restaurantes cercanos a la Alcaldía y zona bancaria. ¿Cuál es el propósito estratégico primordial de este ejercicio de mapeo de mercado?',
    opciones: {
      A: 'Determinar exclusivamente el presupuesto contable de nómina y servicios públicos del primer trimestre.',
      B: 'Identificar vacíos competitivos (océanos o cuadrantes desatendidos) y posicionar la propuesta de valor frente a los competidores reales.',
      C: 'Garantizar legalmente que ningún otro restaurante del municipio pueda imitar el menú saludable.',
      D: 'Reemplazar el estudio del consumidor por una lista estática de proveedores mayoristas de alimentos.'
    },
    correcta: 'B',
    justificacion: 'El mapeo de mercado (y los mapas perceptuales/competitivos) permite visualizar la distribución de la oferta actual sobre ejes relevantes para el consumidor, detectando cuadrantes saturados y oportunidades de diferenciación reales antes de comprometer capital.',
    casoGrafico: {
      tipo: 'matriz_mep',
      titulo: 'Saturación de Oferta Gastronómica por Rango en La Dorada Centro',
      datos: [
        { etiqueta: 'Corrientazo Económico ($10k-$13k)', valor: 58, unidad: '%' },
        { etiqueta: 'Comida Rápida Nocturna', valor: 27, unidad: '%' },
        { etiqueta: 'Ejecutivo Saludable Express (<20 min)', valor: 6, unidad: '%' },
        { etiqueta: 'Asaderos Familiares Fin de Semana', valor: 9, unidad: '%' }
      ]
    }
  },
  {
    id: 'MM-M1-002',
    modulo: 1,
    tema: 'Herramientas y metodologías de mapeo',
    bloom: 'Aplicación',
    enunciado: 'Al aplicar la metodología de Mapeo de Ecosistema Competitivo (Directos, Indirectos y Sustitutos) para una empresa de transporte fluvial turístico por el Río Magdalena en La Dorada, ¿cuál de los siguientes actores debe clasificarse estrictamente como un "Competidor Sustituto"?',
    opciones: {
      A: 'Otra lancha operadora de paseos ecológicos que sale del mismo muelle municipal de La Dorada.',
      B: 'Un balneario recreativo campestre con piscinas en la vía hacia Honda o Norcasia donde las familias gastan el mismo presupuesto dominical.',
      C: 'La estación de combustible que vende gasolina para los motores fuera de borda.',
      D: 'La Capitanía de Puerto o autoridad fluvial que regula los chalecos salvavidas.'
    },
    correcta: 'B',
    justificacion: 'En el mapeo de mercado, los sustitutos son soluciones de categorías distintas que satisfacen la misma necesidad subyacente (ocio y recreación familiar de fin de semana en clima cálido) y compiten por el mismo bolsillo del consumidor.'
  },
  {
    id: 'MM-M1-003',
    modulo: 1,
    tema: 'Herramientas y metodologías de mapeo',
    bloom: 'Comprensión',
    enunciado: 'En el diseño de un Mapa Perceptual de Posicionamiento (Perceptual Mapping), ¿qué error metodológico invalida con mayor frecuencia las conclusiones del analista de marketing digital?',
    opciones: {
      A: 'Definir los ejes del mapa según atributos técnicos internos del dueño del negocio en lugar de criterios valorados realmente por los consumidores.',
      B: 'Incluir más de tres competidores locales dentro del mismo cuadrante gráfico.',
      C: 'Utilizar encuestas digitales gratuitas para recolectar la percepción de marca de los clientes.',
      D: 'Graficar el mapa en una hoja de cálculo como Excel o Google Sheets.'
    },
    correcta: 'A',
    justificacion: 'Un mapa perceptual debe construirse sobre dimensiones determinantes de compra desde la óptica del comprador (ej. confianza, rapidez, frescura). Si se usan variables irrelevantes para el cliente, el vacío detectado será un "espejismo de mercado" sin demanda real.'
  },
  {
    id: 'MM-M1-004',
    modulo: 1,
    tema: 'Casos prácticos de mapeo de mercado en distintos sectores',
    bloom: 'Evaluación',
    enunciado: 'Una cooperativa ganadera y láctea del Magdalena Centro desea lanzar una línea de kumis y yogur artesanal con entrega a domicilio vía WhatsApp. Al realizar el mapeo de cadena de valor y canales en los barrios Las Ferias, Victoria Real y El Conejo, descubren que el 78% de las compras lácteas diarias se hacen al fiado o en efectivo en tiendas de barrio. ¿Qué decisión estratégica se deriva correctamente de este hallazgo de mapeo?',
    opciones: {
      A: 'Exigir únicamente tarjeta de crédito internacional en una pasarela web para educar a la fuerza al mercado.',
      B: 'Diseñar un modelo híbrido (B2B2C con tenderos aliados y pago contraentrega/Nequi/DaviPlata en domicilios) adaptado a la fricción financiera real del territorio.',
      C: 'Cancelar el producto porque en los municipios intermedios nadie consume derivados lácteos.',
      D: 'Invertir todo el presupuesto en anuncios de LinkedIn dirigidos a gerentes multinacionales.'
    },
    correcta: 'B',
    justificacion: 'El mapeo territorial y conductual revela cómo compra y paga realmente el ecosistema local. Incorporar billeteras digitales de alta penetración en Colombia (Nequi/DaviPlata), efectivo contraentrega y alianzas con tiendas de barrio elimina la fricción de adopción.'
  },
  {
    id: 'MM-M1-005',
    modulo: 1,
    tema: 'Definición y propósito del mapeo de mercado',
    bloom: 'Conocer',
    enunciado: 'Al estimar el tamaño de un mercado local o regional mediante la metodología TAM - SAM - SOM, ¿qué representa específicamente la sigla SOM (Serviceable Obtainable Market)?',
    opciones: {
      A: 'La población mundial total sin importar si tienen acceso a internet o interés en la categoría.',
      B: 'La porción realista del mercado disponible que la empresa puede capturar a corto/mediano plazo con sus recursos, capacidad operativa y alcance actual.',
      C: 'El listado histórico de impuestos municipales pagados por la Cámara de Comercio.',
      D: 'El costo total de fabricar una unidad de producto sin incluir el margen de ganancia.'
    },
    correcta: 'B',
    justificacion: 'Mientras el TAM es el mercado total y el SAM el mercado que podemos atender por geografía/modelo, el SOM (Mercado Obtenible) aterriza la meta comercial real que el negocio puede conquistar considerando competencia y capacidad instalada.'
  },

  // ================= MÓDULO 2: FUNDAMENTOS DEL COMPORTAMIENTO DEL CONSUMIDOR =================
  {
    id: 'MM-M2-001',
    modulo: 2,
    tema: 'Teorías del comportamiento del consumidor',
    bloom: 'Análisis',
    enunciado: 'Según la Teoría Dual del Pensamiento de Daniel Kahneman (Sistema 1 y Sistema 2), cuando un habitante de La Dorada camina a las 2:30 p.m. bajo una temperatura de 37°C y compra impulsivamente una limonada frappé al ver una foto escarchada y un letrero amarillo de "$4.000 ¡Ya!", ¿qué sistema cognitivo lideró la decisión y por qué?',
    opciones: {
      A: 'El Sistema 2, porque realizó un cálculo financiero exhaustivo de valor presente neto antes de beber líquido.',
      B: 'El Sistema 1, que opera de forma rápida, automática, emocional y guiada por estímulos sensoriales y heurísticos ante una necesidad fisiológica inmediata.',
      C: 'Ninguno de los dos sistemas, ya que la teoría de Kahneman solo aplica a compras industriales de maquinaria pesada.',
      D: 'El Sistema Racional Cartesiano, que anula cualquier influencia del clima o del color del empaque.'
    },
    correcta: 'B',
    justificacion: 'Daniel Kahneman demostró que cerca del 95% de las decisiones cotidianas operan bajo el Sistema 1: rápido, asociativo, emocional y de bajo esfuerzo cognitivo, especialmente cuando existen disparadores fisiológicos (sed/calor) y señales visuales claras.'
  },
  {
    id: 'MM-M2-002',
    modulo: 2,
    tema: 'Factores psicológicos y sociales que influyen en las decisiones de compra',
    bloom: 'Aplicación',
    enunciado: 'Una tienda de calzado deportivo en La Dorada publica en Instagram Reels videos de jóvenes líderes de clubes de patinaje y fútbol de colegios locales usando sus guayos y tenis, logrando que decenas de compañeros de grado décimo y once pidan exactamente esa referencia. ¿Qué factor social del comportamiento del consumidor explica este fenómeno?',
    opciones: {
      A: 'Obsolescencia programada de hardware.',
      B: 'Influencia de los Grupos de Referencia (pertenencia y aspiracionales) y validación por Prueba Social (Social Proof) entre pares.',
      C: 'Condicionamiento pavloviano exclusivamente auditivo.',
      D: 'Elasticidad cruzada negativa de bienes macroeconómicos.'
    },
    correcta: 'B',
    justificacion: 'En adolescentes y jóvenes (15 a 19 años), los grupos de referencia cercanos y aspiracionales locales ejercen una fuerte presión normativa e informativa sobre la identidad y las decisiones de consumo.'
  },
  {
    id: 'MM-M2-003',
    modulo: 2,
    tema: 'Procesos de toma de decisiones del consumidor',
    bloom: 'Comprensión',
    enunciado: 'Una familia doradense acaba de comprar a crédito una motocicleta nueva por $9.800.000. Dos días después de recibirla, el comprador siente ansiedad pensando si debió haber elegido otra marca más económica en repuestos y empieza a buscar en YouTube reseñas positivas de su moto actual para tranquilizarse. ¿Cómo se denomina este fenómeno psicológico?',
    opciones: {
      A: 'Reconocimiento inicial del problema latente.',
      B: 'Disonancia cognitiva post-compra (o remordimiento del comprador) en decisiones de alta implicación.',
      C: 'Percepción subliminal pre-atencional.',
      D: 'Segmentación demográfica censal.'
    },
    correcta: 'B',
    justificacion: 'La disonancia cognitiva post-compra (Festinger) ocurre tras decisiones de alto compromiso económico o emocional. El consumidor experimenta tensión interna por las alternativas descartadas y busca información que reafirme su elección; por ello el seguimiento post-venta es vital.'
  },
  {
    id: 'MM-M2-004',
    modulo: 2,
    tema: 'Factores psicológicos y sociales que influyen en las decisiones de compra',
    bloom: 'Evaluación',
    enunciado: 'Un almacén de electrodomésticos ofrece un ventilador de torre mostrando primero: "Precio normal: $320.000" tachado, y al lado: "Hoy por ola de calor: $189.900". Aunque el cliente pensaba gastar máximo $150.000, siente que está ganando una gran oportunidad. ¿Qué sesgo cognitivo de la economía conductual se está activando?',
    opciones: {
      A: 'Sesgo de Anclaje (Anchoring Bias), donde el primer número expuesto sirve como punto de referencia mental para juzgar el valor de la oferta.',
      B: 'Falacia del jugador de Montecarlo.',
      C: 'Efecto amnesia retroactiva.',
      D: 'Ley de rendimientos marginales decrecientes del agro.'
    },
    correcta: 'A',
    justificacion: 'El efecto anclaje hace que el cerebro pondere desproporcionadamente la primera cifra recibida ($320.000), haciendo que el precio de venta ($189.900) se perciba como una ganancia inmediata en comparación con el ancla inicial.'
  },
  {
    id: 'MM-M2-005',
    modulo: 2,
    tema: 'Procesos de toma de decisiones del consumidor',
    bloom: 'Análisis',
    enunciado: 'Analice el siguiente embudo de conversión (Customer Journey) de una tienda virtual de ropa en Caldas. Si de 1.000 visitas al catálogo, 320 agregan prendas al carrito de WhatsApp/Web, pero solo 45 completan el pago porque el costo de envío aparece oculto hasta el último paso, ¿en qué etapa del proceso de decisión debe intervenir el marketero digital?',
    opciones: {
      A: 'En el Reconocimiento de la Necesidad, eliminando todas las fotos del catálogo.',
      B: 'En la etapa de Decisión de Compra / Checkout, transparentando desde el inicio el costo de domicilio o creando un umbral de envío gratis para reducir el abandono de carrito.',
      C: 'En la etapa de Descarte del producto después de 5 años de uso.',
      D: 'No debe intervenir porque una caída del 86% en el último paso es inmejorable.'
    },
    correcta: 'B',
    justificacion: 'Los costos sorpresa de envío al final del checkout son la causa #1 de abandono de carrito en e-commerce. Reducir esa fricción cognitiva y financiera en la etapa de compra eleva de inmediato la tasa de conversión.',
    casoGrafico: {
      tipo: 'embudo',
      titulo: 'Embudo de Conversión Mensual - Tienda Moda Magdalena Centro',
      datos: [
        { etiqueta: '1. Visitas al Catálogo Digital', valor: 1000, unidad: 'usuarios' },
        { etiqueta: '2. Consulta de Tallas / Detalle', valor: 540, unidad: 'usuarios' },
        { etiqueta: '3. Agregan al Carrito / WhatsApp', valor: 320, unidad: 'usuarios' },
        { etiqueta: '4. Pago Completado (Conversión)', valor: 45, unidad: 'ventas' }
      ]
    }
  },

  // ================= MÓDULO 3: INVESTIGACIÓN DE MERCADO Y ANÁLISIS DE DATOS =================
  {
    id: 'MM-M3-001',
    modulo: 3,
    tema: 'Métodos cualitativos y cuantitativos en investigación de mercado',
    bloom: 'Aplicación',
    enunciado: 'Una academia de inglés y programación en La Dorada quiere saber (1) las razones emocionales profundas por las que los jóvenes desertan en el segundo mes y (2) qué porcentaje exacto de los 1.200 estudiantes de grado 11 del municipio tiene computador en casa. ¿Qué combinación metodológica es la técnicamente correcta?',
    opciones: {
      A: 'Entrevistas en profundidad o Focus Group (cualitativo) para comprender el porqué de la deserción, y una encuesta estructurada con muestra representativa (cuantitativo) para medir la tenencia de computador.',
      B: 'Solo observar desde la calle cuántas personas pasan frente al local durante 10 minutos.',
      C: 'Usar únicamente un grupo focal de 4 amigos para adivinar el porcentaje exacto de los 1.200 estudiantes.',
      D: 'Evitar preguntar a los estudiantes y copiar las estadísticas de otro país europeo.'
    },
    correcta: 'A',
    justificacion: 'La investigación cualitativa explora motivaciones, frenos y significados profundos ("el porqué"), mientras que la investigación cuantitativa mide frecuencias, magnitudes y porcentajes estadísticamente proyectables ("el cuánto").'
  },
  {
    id: 'MM-M3-002',
    modulo: 3,
    tema: 'Uso de herramientas de análisis de datos (SPSS, Excel, Google Analytics)',
    bloom: 'Análisis',
    enunciado: 'En una hoja de cálculo (Excel / Google Sheets) o en SPSS, usted cruza las variables "Rango de Edad" (filas) y "Medio de Pago Preferido: Efectivo, Nequi, Tarjeta" (columnas) de 250 clientes encuestados en una ferretería local. ¿Qué herramienta analítica está utilizando para descubrir qué grupo de edad prefiere Nequi?',
    opciones: {
      A: 'Una Tabla de Contingencia (Tabla Dinámica de frecuencias cruzadas / Crosstab) que permite analizar la relación entre dos variables categóricas.',
      B: 'Un corrector ortográfico automático de procesador de texto.',
      C: 'Una regresión astronómica de series espaciales.',
      D: 'Un gráfico circular de una sola variable sin segmentar por edad.'
    },
    correcta: 'A',
    justificacion: 'Las tablas de contingencia (Crosstabs en SPSS o Tablas Dinámicas en Excel/Sheets) permiten cruzar dos o más variables cualitativas/categóricas para identificar patrones conjuntos y diferencias significativas entre segmentos.'
  },
  {
    id: 'MM-M3-003',
    modulo: 3,
    tema: 'Interpretación de datos para la toma de decisiones estratégicas',
    bloom: 'Evaluación',
    enunciado: 'Al recolectar una base de datos de clientes en Colombia mediante formularios web o WhatsApp para enviar promociones comerciales, ¿qué exige obligatoriamente la Ley 1581 de 2012 (Régimen General de Protección de Datos Personales / Habeas Data)?',
    opciones: {
      A: 'Obtener la autorización previa, expresa e informada del titular de los datos, informándole la finalidad del tratamiento y su derecho a conocer, actualizar o suprimir su información.',
      B: 'Comprar bases de datos piratas en internet sin avisarle a las personas registradas.',
      C: 'Publicar los números de cédula y teléfonos de todos los clientes en un cartel público.',
      D: 'La ley colombiana solo aplica a bancos extranjeros y no a comercios ni emprendimientos digitales.'
    },
    correcta: 'A',
    justificacion: 'En Colombia, la Ley Estatutaria 1581 de 2012 exige el consentimiento previo, expreso e informado del titular para recolectar y tratar datos personales con fines de prospección comercial o investigación, garantizando los derechos ARCO (Acceso, Rectificación, Cancelación y Oposición).'
  },
  {
    id: 'MM-M3-004',
    modulo: 3,
    tema: 'Uso de herramientas de análisis de datos (SPSS, Excel, Google Analytics)',
    bloom: 'Comprensión',
    enunciado: 'Al analizar el tráfico del sitio web de un hotel turístico de La Dorada en Google Analytics 4 (GA4), el equipo observa que la "Tasa de Interacción" (Engagement Rate) desde teléfonos móviles cayó del 68% al 19% tras subir un banner de video pesado de 45 MB en la página de inicio. ¿Cuál es el insight técnico y de negocio correcto?',
    opciones: {
      A: 'El video pesado demora la carga en redes móviles 4G, provocando que los usuarios abandonen la página antes de interactuar con el botón de reserva.',
      B: 'Mientras más pesada y lenta sea una página web, más reservas hacen los turistas.',
      C: 'Google Analytics 4 solo mide las ventas en efectivo hechas en la recepción física del hotel.',
      D: 'Se deben agregar otros cinco videos de 50 MB cada uno para mejorar la velocidad.'
    },
    correcta: 'A',
    justificacion: 'En GA4, una sesión con interacción dura más de 10 segundos, tiene un evento de conversión o al menos 2 vistas de página. Un recurso multimedia sin optimizar dispara el tiempo de carga móvil y destruye la retención del usuario.'
  },
  {
    id: 'MM-M3-005',
    modulo: 3,
    tema: 'Interpretación de datos para la toma de decisiones estratégicas',
    bloom: 'Análisis',
    enunciado: 'Un estudiante de Marketing Digital redacta en su cuestionario la siguiente pregunta: "¿Verdad que usted prefiere nuestro delicioso helado artesanal natural en vez de los helados industriales llenos de químicos?". ¿Por qué esta pregunta arruina la validez de la investigación de mercado?',
    opciones: {
      A: 'Porque introduce un grave Sesgo de Inducción (pregunta sesgada o dirigida con carga adjetiva) que empuja al encuestado a responder lo que el investigador quiere oír.',
      B: 'Porque utiliza signos de interrogación al principio y al final.',
      C: 'Porque menciona la palabra helado en una ciudad cálida.',
      D: 'No tiene ningún problema; es la forma estándar recomendada por la estadística.'
    },
    correcta: 'A',
    justificacion: 'Las preguntas con carga emocional o adjetivos valorativos ("delicioso", "llenos de químicos") contaminan el instrumento de recolección, generando datos falsamente positivos que llevan a fracasos comerciales.'
  },

  // ================= MÓDULO 4: SEGMENTACIÓN DE MERCADO Y PERSONALIZACIÓN DE ESTRATEGIAS =================
  {
    id: 'MM-M4-001',
    modulo: 4,
    tema: 'Técnicas de segmentación de mercado (geográfica, demográfica, psicográfica, conductual)',
    bloom: 'Aplicación',
    enunciado: 'Un gimnasio en La Dorada divide a sus clientes potenciales en tres grupos no por su edad ni barrio, sino por el "Beneficio Buscado y Frecuencia de Uso": (1) Rehabilitación y salud articular matutina, (2) Estética e hipertrofia intensiva 5 días a la semana, y (3) Desestrés laboral post-oficina 2 veces por semana. ¿Qué tipo de segmentación principal está aplicando?',
    opciones: {
      A: 'Segmentación estrictamente climática y postal.',
      B: 'Segmentación Conductual (basada en beneficios buscados, ocasión y tasa de uso) combinada con rasgos de estilo de vida (psicográfica).',
      C: 'Segmentación macroeconómica por producto interno bruto nacional.',
      D: 'Masificación indiferenciada sin distinción de clientes.'
    },
    correcta: 'B',
    justificacion: 'La segmentación conductual agrupa a los compradores según su conocimiento, actitud, frecuencia de uso o beneficio buscado frente al producto, siendo una de las más predictivas para diseñar ofertas personalizadas.',
    casoGrafico: {
      tipo: 'segmentacion',
      titulo: 'Distribución de Segmentos por Beneficio Buscado - Gimnasio Local',
      datos: [
        { etiqueta: 'Salud y Movilidad Matutina', valor: 28, unidad: '%' },
        { etiqueta: 'Entrenamiento Físico Intensivo', valor: 44, unidad: '%' },
        { etiqueta: 'Bienestar y Pausa Post-Laboral', valor: 28, unidad: '%' }
      ]
    }
  },
  {
    id: 'MM-M4-002',
    modulo: 4,
    tema: 'Diseño de estrategias personalizadas basadas en la segmentación',
    bloom: 'Análisis',
    enunciado: 'En el análisis RFM (Recencia, Frecuencia y Valor Monetario) de una droguería con servicio a domicilio en La Dorada, usted detecta un grupo de 85 clientes que compraban medicamentos cada quincena con ticket alto, pero llevan más de 75 días sin realizar ningún pedido (Recencia baja, Frecuencia histórica alta, Monto alto). ¿Qué estrategia personalizada corresponde a este segmento?',
    opciones: {
      A: 'Ignorarlos para siempre y borrar sus números de la base de datos.',
      B: 'Activar una campaña de Reactivación ("Clientes en Riesgo de Fuga / Dormidos") con un mensaje personalizado por WhatsApp ofreciendo chequeo de presión gratuito o bono en su próximo domicilio.',
      C: 'Enviarles un mensaje dándoles la bienvenida como si nunca hubieran comprado en la droguería.',
      D: 'Subirles el precio de los medicamentos un 40% como castigo por no comprar.'
    },
    correcta: 'B',
    justificacion: 'En la matriz RFM, los clientes de alto valor histórico (F y M altos) cuya Recencia ha caído son la prioridad número uno de retención: cuesta de 5 a 7 veces menos reactivar a un cliente conocido que adquirir uno nuevo desde cero.'
  },
  {
    id: 'MM-M4-003',
    modulo: 4,
    tema: 'Técnicas de segmentación de mercado (geográfica, demográfica, psicográfica, conductual)',
    bloom: 'Comprensión',
    enunciado: 'Para que un segmento de mercado sea considerado viable y útil desde el punto de vista gerencial y operativo (criterios de segmentación efectiva de Kotler), ¿qué significa que el segmento deba ser "Sustancial" y "Accionable"?',
    opciones: {
      A: 'Que sea lo suficientemente grande o rentable para justificar una estrategia a medida (Sustancial) y que la empresa cuente con los canales y recursos reales para llegar a él y atenderlo (Accionable).',
      B: 'Que esté integrado por una sola persona a la que sea imposible contactar por ningún medio.',
      C: 'Que todos los miembros del segmento tengan exactamente la misma estatura en centímetros.',
      D: 'Que el segmento cambie de gustos cada diez minutos sin dejar rastro.'
    },
    correcta: 'A',
    justificacion: 'Los criterios clásicos de segmentación efectiva exigen que los grupos sean Medibles, Sustanciales (tamaño/rentabilidad suficiente), Accesibles, Diferenciables y Accionables (capacidad real de diseñar programas eficaces para atraerlos).'
  },
  {
    id: 'MM-M4-004',
    modulo: 4,
    tema: 'Diseño de estrategias personalizadas basadas en la segmentación',
    bloom: 'Aplicación',
    enunciado: 'Al construir un "Buyer Persona" (Arquetipo de Cliente Ideal) basado en datos reales para una tienda de repuestos y accesorios de motos en La Dorada, ¿cuál de los siguientes perfiles aporta verdadero valor accionable para crear contenido y pauta digital?',
    opciones: {
      A: '"Hombres y mujeres de 18 a 80 años que vivan en cualquier parte de Colombia y les guste salir".',
      B: '"Jhonatan, 24 años, domiciliario y técnico en La Dorada; recorre 90 km diarios en su moto 125cc, busca llantas y kits de arrastre duraderos, cotiza por WhatsApp en su hora de almuerzo y teme quedarse varado perdiendo el día de trabajo".',
      C: '"Un ciudadano imaginario millonario que colecciona helicópteros en Suiza".',
      D: '"Cualquier persona que tenga teléfono celular inteligente".'
    },
    correcta: 'B',
    justificacion: 'Un Buyer Persona bien construido integra datos demográficos, contexto laboral, dolores específicos (miedo a perder el día de trabajo por una falla mecánica), canales de consulta (WhatsApp) y disparadores de compra reales.'
  },
  {
    id: 'MM-M4-005',
    modulo: 4,
    tema: 'Casos de éxito en la personalización del marketing',
    bloom: 'Evaluación',
    enunciado: 'Una pastelería artesanal de La Dorada registra en una hoja de cálculo la fecha de cumpleaños de los hijos y parejas de sus clientes cuando hacen un pedido. Quince días antes del cumpleaños del año siguiente, les envía por WhatsApp una foto de tres diseños de tortas personalizadas con el nombre del familiar. ¿Por qué esta táctica de personalización logra tasas de cierre superiores al 40%?',
    opciones: {
      A: 'Porque combina micro-segmentación por eventos de vida (Trigger Marketing / Ocasión) con pertinencia oportuna, resolviendo una necesidad real justo antes de que el cliente busque en la competencia.',
      B: 'Porque obliga legalmente al cliente a comprar bajo amenaza de multa.',
      C: 'Porque envía spam masivo todos los días a las 3:00 de la mañana.',
      D: 'Porque oculta los precios y sabores de los productos.'
    },
    correcta: 'A',
    justificacion: 'El marketing disparado por eventos o fechas clave del cliente (Trigger-based personalization) con datos propios (First-Party Data) ofrece máxima relevancia contextual en el momento exacto de apertura de la ventana de decisión.'
  },

  // ================= MÓDULO 5: TENDENCIAS ACTUALES Y FUTURAS EN EL COMPORTAMIENTO DEL CONSUMIDOR =================
  {
    id: 'MM-M5-001',
    modulo: 5,
    tema: 'Impacto de la tecnología en el comportamiento del consumidor (e-commerce, IA, big data)',
    bloom: 'Análisis',
    enunciado: 'En el comercio electrónico colombiano actual, muchos consumidores descubren un producto en un video corto de TikTok o Instagram Reels, revisan los comentarios de otros compradores, preguntan por WhatsApp Business para confirmar disponibilidad y recogen el producto en el local físico de La Dorada la misma tarde. ¿Cómo se denomina este comportamiento omnicanal?',
    opciones: {
      A: 'Comportamiento Phygital / Efecto ROPO (Research Online, Purchase Offline) e integración de Social Commerce conversacional.',
      B: 'Comercio exclusivamente telegráfico del siglo XIX.',
      C: 'Aislamiento analógico total sin intervención de pantallas.',
      D: 'Publicidad impresa en directorios telefónicos de papel amarillo.'
    },
    correcta: 'A',
    justificacion: 'El consumidor actual no distingue fronteras entre el mundo físico y digital (Phygital): investiga y valida socialmente en redes (ROPO / Social Commerce), conversa por mensajería instantánea y cierra la compra donde perciba menor riesgo y mayor inmediatez.',
    casoGrafico: {
      tipo: 'tendencia_consumo',
      titulo: 'Canales de Descubrimiento y Cierre de Compra en Jóvenes (15-25 años)',
      datos: [
        { etiqueta: 'Descubrimiento en TikTok / Reels', valor: 64, unidad: '%' },
        { etiqueta: 'Validación y Cierre vía WhatsApp', valor: 72, unidad: '%' },
        { etiqueta: 'Búsqueda en Directorios Impresos', valor: 2, unidad: '%' },
        { etiqueta: 'Pago con Billeteras Digitales (Nequi/DaviPlata)', valor: 68, unidad: '%' }
      ]
    }
  },
  {
    id: 'MM-M5-002',
    modulo: 5,
    tema: 'Adaptación a nuevas generaciones de consumidores: Millennials y Gen Z',
    bloom: 'Comprensión',
    enunciado: 'Al comparar los patrones de consumo de la Generación Z (nacidos aprox. entre 1997 y 2012, donde se ubican los estudiantes de 15 a 19 años) frente a generaciones anteriores, ¿qué atributo valoran con mayor fuerza al interactuar con una marca en redes sociales?',
    opciones: {
      A: 'La autenticidad orgánica, el contenido en video vertical breve protagonizado por personas reales (UGC - Contenido Generado por el Usuario) y la respuesta rápida sin guiones robóticos.',
      B: 'Los comerciales de televisión de 5 minutos con locutores formales en corbata leyendo textos corporativos.',
      C: 'Recibir cartas físicas por correo postal que tarden tres semanas en llegar.',
      D: 'Las marcas que ocultan las opiniones de otros compradores y nunca responden mensajes.'
    },
    correcta: 'A',
    justificacion: 'La Generación Z posee un detector altamente sensible frente a la publicidad tradicional artificial; confía mucho más en el contenido auténtico (UGC), las reseñas reales en video corto y la transparencia ética y conversacional de las marcas.'
  },
  {
    id: 'MM-M5-003',
    modulo: 5,
    tema: 'Cambios en las preferencias de los consumidores post-pandemia',
    bloom: 'Aplicación',
    enunciado: 'Tras los cambios estructurales post-pandemia en municipios intermedios de Colombia como La Dorada, ¿qué transformación de hábito se consolidó de manera permanente en el comercio minorista y de servicios?',
    opciones: {
      A: 'La adopción cotidiana de pagos digitales sin contacto o por QR (Nequi, DaviPlata, Transfiya), la exigencia de catálogos actualizados en el celular y la valoración de entregas a domicilio rápidas.',
      B: 'La desaparición absoluta de los domicilios y el regreso exclusivo al trueque de sal.',
      C: 'El cierre definitivo de todas las cuentas de WhatsApp e Instagram de los negocios locales.',
      D: 'La prohibición de comprar alimentos preparados fuera de casa los fines de semana.'
    },
    correcta: 'A',
    justificacion: 'La digitalización financiera mediante billeteras móviles y códigos QR, junto con el comercio conversacional y la logística de última milla local, dejó de ser una medida temporal para convertirse en el estándar mínimo exigido por el consumidor colombiano.'
  },
  {
    id: 'MM-M5-004',
    modulo: 5,
    tema: 'Impacto de la tecnología en el comportamiento del consumidor (e-commerce, IA, big data)',
    bloom: 'Evaluación',
    enunciado: 'Un emprendimiento turístico del Magdalena Centro implementa un asistente con Inteligencia Artificial en su WhatsApp y sitio web. Desde la perspectiva de la experiencia del consumidor (CX), ¿cuál es la práctica recomendada para evitar la frustración del usuario?',
    opciones: {
      A: 'Usar la IA para resolver al instante dudas frecuentes 24/7 (precios, horarios, ubicación, disponibilidad), pero ofrecer siempre un botón o paso fluido hacia un asesor humano cuando el cliente tiene un caso complejo o desea cerrar una reserva especial.',
      B: 'Engañar al cliente haciéndole creer que habla con un humano y bloquear cualquier opción de contacto real cuando el bot no entiende una pregunta.',
      C: 'Programar el bot para que responda únicamente en código binario.',
      D: 'Eliminar los precios para que el cliente tenga que adivinar cuánto cuesta el tour.'
    },
    correcta: 'A',
    justificacion: 'La automatización con IA genera valor cuando elimina tiempos de espera en consultas repetitivas, pero el diseño centrado en el usuario exige transparencia y escalamiento humano sin fricción (Human-in-the-loop) para cierres consultivos o reclamos.'
  },
  {
    id: 'MM-M5-005',
    modulo: 5,
    tema: 'Impacto de la tecnología en el comportamiento del consumidor (e-commerce, IA, big data)',
    bloom: 'Análisis',
    enunciado: 'Ante la progresiva restricción de cookies de terceros (Third-Party Cookies) y el encarecimiento de la pauta digital, ¿por qué la captura ética de "Zero-Party Data" y "First-Party Data" (datos entregados voluntariamente por el cliente en encuestas interactivas, clubes de beneficios o WhatsApp) es la tendencia más rentable para las MiPymes?',
    opciones: {
      A: 'Porque permite a la empresa construir un activo propio de audiencia con preferencias declaradas directamente por el consumidor, reduciendo la dependencia de pagar publicidad cada vez que quiere comunicarse con sus clientes.',
      B: 'Porque los datos propios caducan a los tres segundos de ser recolectados.',
      C: 'Porque las MiPymes no necesitan conocer el nombre ni los gustos de quienes les compran.',
      D: 'Porque el Zero-Party Data consiste en adivinar el futuro sin preguntarle nada al cliente.'
    },
    correcta: 'A',
    justificacion: 'El Zero-Party Data (datos que el cliente comparte intencionalmente sobre sus gustos, talla o necesidades) y el First-Party Data otorgan soberanía de datos al negocio local, permitiendo campañas de retención por WhatsApp o email con costo marginal cercano a cero.'
  }
];

interface ScenarioTemplate {
  modulo: 1 | 2 | 3 | 4 | 5;
  tema: string;
  bloom: BloomLevel;
  conceptoClave: string;
  planteamientoBase: (sector: string, barrio: string) => string;
  opcionesGenerator: (sector: string, barrio: string) => {
    A: string;
    B: string;
    C: string;
    D: string;
    correcta: 'A' | 'B' | 'C' | 'D';
    justificacion: string;
  };
}

const SECTORES_LOCALES = [
  'heladería artesanal y frutería climatizada',
  'tienda de repuestos y lubricantes para motocicletas',
  'comercializadora de pescado fresco y bocachico del Magdalena',
  'academia de refuerzo escolar y robótica juvenil',
  'almacén de moda urbana y calzado deportivo',
  'servicio de mantenimiento de aires acondicionados y refrigeración',
  'hotel campestre y operador de ecoturismo fluvial',
  'droguería y tienda dermatológica con domicilio express',
  'panadería y repostería personalizada para eventos',
  'gimnasio funcional y centro de acondicionamiento físico',
  'ferretería y depósito de materiales livianos',
  'veterinaria y pet shop con peluquería canina',
  'restaurante de almuerzos ejecutivos caseros',
  'tienda de celulares, accesorios y servicio técnico',
  'distribuidora de productos agropecuarios y concentrados'
];

const BARRIOS_ZONAS_DORADA = [
  'el barrio Las Ferias de La Dorada',
  'el sector comercial del Centro y Parque Santander en La Dorada',
  'el barrio Los Andes de La Dorada',
  'el barrio Victoria Real en La Dorada',
  'la zona rosa y gastronómica de La Dorada',
  'el sector de Purnio y corredor vial hacia Honda',
  'el barrio Obrero y alrededores de la plaza de mercado de La Dorada',
  'el barrio El Conejo y zona norte del municipio'
];

const TEMPLATES_MODULO: ScenarioTemplate[] = [
  // Módulo 1
  {
    modulo: 1,
    tema: 'Definición y propósito del mapeo de mercado',
    bloom: 'Aplicación',
    conceptoClave: 'Matriz de Perfil Competitivo y Ejes de Valor',
    planteamientoBase: (sector, barrio) =>
      `Para estructurar el proyecto de una ${sector} ubicada en ${barrio}, el equipo de marketing digital levanta un censo de 12 negocios similares midiendo su horario de atención, tiempo de respuesta en WhatsApp, claridad de precios en redes y calificaciones en Google Maps. ¿Qué permite lograr directamente esta fase del mapeo de mercado?`,
    opcionesGenerator: (sector) => ({
      A: `Detectar las brechas de servicio insatisfechas en la categoría de ${sector} para diseñar una ventaja competitiva defendible.`,
      B: 'Sustituir la obligación legal de llevar contabilidad básica del negocio.',
      C: 'Bloquear el acceso a internet de los demás comercios del municipio.',
      D: 'Garantizar ventas automáticas sin necesidad de atender a los clientes.',
      correcta: 'A',
      justificacion: 'El mapeo sistemático de variables operativas y digitales de la competencia local revela puntos débiles del mercado (ej. demoras en WhatsApp o falta de precios claros) que el nuevo negocio puede capitalizar de inmediato.'
    })
  },
  {
    modulo: 1,
    tema: 'Herramientas y metodologías de mapeo',
    bloom: 'Análisis',
    conceptoClave: 'Georreferenciación Comercial y Radio de Influencia',
    planteamientoBase: (sector, barrio) =>
      `Un analista utiliza Google My Business (Perfil de Negocio) y Google Maps para mapear la densidad de oferta de ${sector} en un radio de 1.5 kilómetros alrededor de ${barrio}. Observa que 9 competidores están concentrados en dos cuadras, pero ninguno ofrece catálogo digital ni cobertura de domicilio hacia los barrios periféricos. ¿Cuál es la lectura estratégica correcta?`,
    opcionesGenerator: () => ({
      A: 'Abrir otro local exactamente con las mismas fallas en la misma cuadra saturada sin ofrecer domicilio.',
      B: 'Aprovechar el vacío geográfico y digital posicionando la marca en búsquedas locales (SEO Local) con cobertura de entrega rápida hacia las zonas desatendidas.',
      C: 'Cerrar el proyecto porque si hay 9 negocios en dos cuadras significa que está prohibido vender por internet.',
      D: 'Cambiar el idioma de todas las publicaciones al alemán para confundir a los vecinos.',
      correcta: 'B',
      justificacion: 'El mapeo geográfico y digital combinado (Geomarketing + SEO Local) permite identificar hiper-concentración física y desatención digital en radios residenciales de alta demanda.'
    })
  },
  {
    modulo: 1,
    tema: 'Casos prácticos de mapeo de mercado en distintos sectores',
    bloom: 'Evaluación',
    conceptoClave: 'Benchmarking Funcional y Auditoría Digital',
    planteamientoBase: (sector, barrio) =>
      `En una auditoría de mapeo competitivo (Benchmarking) para una ${sector} en ${barrio}, usted evalúa la presencia digital de los tres líderes actuales del municipio. ¿Cuál de los siguientes indicadores representa una métrica accionable de mapeo y NO una métrica de vanidad superficial?`,
    opcionesGenerator: () => ({
      A: 'El tiempo promedio de respuesta efectiva al cliente en el enlace de WhatsApp y la claridad de la oferta en su embudo de conversión.',
      B: 'El color favorito de la mascota del fundador del negocio competidor.',
      C: 'El número de seguidores falsos comprados en cuentas inactivas de otros continentes.',
      D: 'La cantidad de fuentes tipográficas ilegibles mezcladas en un mismo volante.',
      correcta: 'A',
      justificacion: 'En el mapeo de mercado aplicado a MiPymes, las métricas accionables evalúan velocidad de atención, estructura de oferta, precios, pruebas sociales y facilidad de compra, no seguidores artificiales.'
    })
  },

  // Módulo 2
  {
    modulo: 2,
    tema: 'Teorías del comportamiento del consumidor',
    bloom: 'Comprensión',
    conceptoClave: 'Pirámide de Maslow y Motivación de Compra',
    planteamientoBase: (sector, barrio) =>
      `Un cliente residente en ${barrio} acude a una ${sector}. Cuando la comunicación de la marca no solo resalta la función básica del producto, sino cómo este le brinda tranquilidad familiar, reconocimiento en su entorno o bienestar personal, ¿qué principio psicológico del comportamiento del consumidor se está aplicando?`,
    opcionesGenerator: () => ({
      A: 'La jerarquía de motivaciones (Maslow) y el valor simbólico/emocional, donde el consumidor compra tanto la solución funcional como el beneficio psicológico asociado.',
      B: 'La teoría de que los seres humanos toman decisiones únicamente como calculadoras sin emociones.',
      C: 'El principio de que el empaque y el trato humano no tienen ningún efecto en la percepción de calidad.',
      D: 'La ley física de la termodinámica industrial.',
      correcta: 'A',
      justificacion: 'El comportamiento del consumidor integra motivos funcionales (utilitarios) y motivos psicogénicos o hedónicos (seguridad, pertenencia, autoestima), los cuales definen la disposición a pagar y la lealtad.'
    })
  },
  {
    modulo: 2,
    tema: 'Factores psicológicos y sociales que influyen en las decisiones de compra',
    bloom: 'Aplicación',
    conceptoClave: 'Heurístico de Prueba Social y Reducción de Riesgo Percibido',
    planteamientoBase: (sector, barrio) =>
      `Muchos habitantes de ${barrio} dudan antes de contratar por primera vez una ${sector} que vieron en redes sociales por temor a perder su dinero o recibir un mal servicio (riesgo percibido). ¿Qué elemento psicológico debe integrar la marca en su perfil digital para reducir inmediatamente esa barrera de desconfianza?`,
    opcionesGenerator: (sector) => ({
      A: `Mostrar testimonios reales en video de clientes conocidos del municipio, fotos auténticas del equipo de trabajo en el local y reseñas verificadas de la ${sector}.`,
      B: 'Ocultar la dirección del local y borrar todos los comentarios de las publicaciones.',
      C: 'Usar únicamente fotografías genéricas descargadas de bancos de imágenes extranjeros sin mostrar el producto real.',
      D: 'Exigir que el cliente pague el 100% seis meses antes sin entregarle ningún comprobante.',
      correcta: 'A',
      justificacion: 'La Prueba Social (Social Proof de Cialdini) con rostros y casos reales de la misma comunidad disminuye drásticamente el riesgo funcional y financiero percibido por el comprador.'
    })
  },
  {
    modulo: 2,
    tema: 'Procesos de toma de decisiones del consumidor',
    bloom: 'Análisis',
    conceptoClave: 'Fricción en el Proceso de Decisión y Evaluación de Alternativas',
    planteamientoBase: (sector, barrio) =>
      `Durante la etapa de "Evaluación de Alternativas", un comprador potencial en ${barrio} compara tres opciones de ${sector}. Dos de ellas tienen en sus historias destacadas de Instagram el menú/catálogo con precios actualizados, tiempos de entrega y botón directo a WhatsApp; la tercera solo dice "Info al DM" y tarda 9 horas en contestar. ¿Por qué el consumidor descarta a la tercera opción según la economía de la atención?`,
    opcionesGenerator: () => ({
      A: 'Porque el exceso de fricción informativa y el alto costo de tiempo hacen que el cerebro del consumidor abandone la opción opaca en favor de las alternativas transparentes e inmediatas.',
      B: 'Porque a los consumidores modernos les encanta esperar 9 horas para saber cuánto vale un producto.',
      C: 'Porque ocultar el precio ("Info al DM") duplica la confianza del cliente en el 100% de los casos.',
      D: 'Porque el comprador no sabe leer números en pantallas móviles.',
      correcta: 'A',
      justificacion: 'Cada paso innecesario o espera prolongada ("Info al DM") incrementa la carga cognitiva y la fricción transaccional, provocando la deserción inmediata hacia competidores que facilitan la evaluación rápida.'
    })
  },

  // Módulo 3
  {
    modulo: 3,
    tema: 'Métodos cualitativos y cuantitativos en investigación de mercado',
    bloom: 'Aplicación',
    conceptoClave: 'Técnica de Observación y Cliente Incógnito (Mystery Shopper)',
    planteamientoBase: (sector, barrio) =>
      `Un grupo de estudiantes del Técnico Profesional en Marketing Digital decide evaluar la calidad real de atención al cliente de una ${sector} en ${barrio} actuando como compradores reales (Mystery Shopper / Cliente Incógnito) y registrando en una rúbrica el saludo, el tiempo de respuesta, el manejo de objeciones y el cierre de venta. ¿Qué ventaja ofrece esta técnica de investigación frente a preguntarle al dueño cómo atiende su negocio?`,
    opcionesGenerator: () => ({
      A: 'Elimina el sesgo de autoinforme del propietario y captura el comportamiento real y natural del servicio en el punto de contacto con el cliente.',
      B: 'No ofrece ninguna ventaja porque es mejor inventar los datos sin visitar ni contactar al negocio.',
      C: 'Permite reemplazar la contabilidad tributaria anual de la empresa.',
      D: 'Solo sirve para evaluar negocios que no tienen clientes.',
      correcta: 'A',
      justificacion: 'La observación estructurada mediante Cliente Incógnito (Mystery Shopping) mide la ejecución real de la experiencia de servicio sin la distorsión que ocurre cuando el personal sabe que está siendo encuestado.'
    })
  },
  {
    modulo: 3,
    tema: 'Uso de herramientas de análisis de datos (SPSS, Excel, Google Analytics)',
    bloom: 'Análisis',
    conceptoClave: 'Limpieza de Datos y Medidas de Tendencia Central vs. Valores Atípicos',
    planteamientoBase: (sector, barrio) =>
      `Al analizar en Excel / Google Sheets el gasto mensual de 50 clientes de una ${sector} en ${barrio}, usted nota que 49 clientes gastan entre $30.000 y $50.000, pero un único cliente corporativo compró $4.500.000 en un pedido especial. Si usted usa solo el "Promedio Aritmético" (Media) sin revisar la "Mediana", ¿qué error de interpretación cometerá?`,
    opcionesGenerator: () => ({
      A: 'El promedio se verá inflado artificialmente por el valor atípico (outlier), haciéndole creer erróneamente que el cliente común gasta mucho más de lo real.',
      B: 'La mediana siempre será igual a cero cuando hay 50 datos en una hoja de cálculo.',
      C: 'Excel borrará automáticamente las 49 filas normales sin avisar.',
      D: 'Ninguno, porque el promedio aritmético es inmune a los valores extremos.',
      correcta: 'A',
      justificacion: 'En análisis de datos de mercado, la media aritmética es altamente sensible a valores extremos (outliers). Contrastarla con la mediana y la desviación estándar evita fijar precios fuera del alcance del consumidor típico.'
    })
  },
  {
    modulo: 3,
    tema: 'Interpretación de datos para la toma de decisiones estratégicas',
    bloom: 'Evaluación',
    conceptoClave: 'Métrica NPS (Net Promoter Score) y Satisfacción del Cliente',
    planteamientoBase: (sector, barrio) =>
      `Tras aplicar una encuesta post-venta en una ${sector} de ${barrio} con la pregunta "¿En una escala de 0 a 10, qué tan probable es que recomiende nuestro servicio a un amigo o familiar?", el 60% marcó 9 o 10 (Promotores), el 20% marcó 7 u 8 (Pasivos) y el 20% marcó de 0 a 6 (Detractores). ¿Cuál es el puntaje NPS resultante y qué acción estratégica exige ese 20% de detractores?`,
    opcionesGenerator: () => ({
      A: 'El NPS es +40 (% Promotores 60% menos % Detractores 20%), y exige contactar y analizar las causas de insatisfacción del 20% detractor para corregir fallas operativas.',
      B: 'El NPS es 100% y se debe bloquear a todos los clientes que calificaron menos de 8.',
      C: 'El NPS es -80 y obliga a cerrar el establecimiento al día siguiente.',
      D: 'Los clientes pasivos y detractores se suman como promotores para que el gráfico se vea más bonito.',
      correcta: 'A',
      justificacion: 'El Net Promoter Score (NPS) se calcula restando el porcentaje de Detractores (0-6) al porcentaje de Promotores (9-10). Su mayor valor estratégico radica en cerrar el ciclo (Close the loop) corrigiendo la raíz de las quejas de los detractores.'
    })
  },

  // Módulo 4
  {
    modulo: 4,
    tema: 'Técnicas de segmentación de mercado (geográfica, demográfica, psicográfica, conductual)',
    bloom: 'Análisis',
    conceptoClave: 'Diferencia entre Demografía y Psicografía',
    planteamientoBase: (sector, barrio) =>
      `Dos vecinas que viven en la misma cuadra de ${barrio} tienen exactamente 32 años, el mismo nivel de ingresos y dos hijos (idéntica demografía). Sin embargo, frente a una ${sector}, la primera busca siempre el precio más bajo sin importar la marca, mientras la segunda prioriza productos ecológicos, atención personalizada VIP y estatus en redes sociales. ¿Qué variable de segmentación explica esta diferencia radical?`,
    opcionesGenerator: () => ({
      A: 'La Segmentación Psicográfica (valores, actitudes, intereses y estilo de vida) y Conductual (beneficio buscado y sensibilidad al precio).',
      B: 'La segmentación por código postal internacional.',
      C: 'La edad cronológica expresada en meses.',
      D: 'El huso horario del continente americano.',
      correcta: 'A',
      justificacion: 'Personas con idéntico perfil demográfico y geográfico pueden exhibir comportamientos de compra opuestos debido a sus variables psicográficas (personalidad, valores, estilo de vida) y conductuales.'
    })
  },
  {
    modulo: 4,
    tema: 'Diseño de estrategias personalizadas basadas en la segmentación',
    bloom: 'Aplicación',
    conceptoClave: 'Personalización de Mensajes y Etiquetas en WhatsApp Business CRM',
    planteamientoBase: (sector, barrio) =>
      `Una ${sector} en ${barrio} utiliza las "Etiquetas" de WhatsApp Business para clasificar sus contactos en: "Cliente Nuevo Cotizando", "Cliente Frecuente Mensual" y "Cliente Mayorista/Empresarial". ¿Cómo debe diseñar su comunicación comercial usando esta segmentación?`,
    opcionesGenerator: () => ({
      A: 'Enviando mensajes diferenciados según la etapa y perfil: testimonios y bono de primera compra al "Nuevo", programa de fidelidad o reposición al "Frecuente", y lista de precios por volumen al "Mayorista".',
      B: 'Enviando exactamente la misma cadena de texto genérica de 80 líneas a todos los contactos a medianoche.',
      C: 'Borrando las etiquetas cada semana para no discriminar la información.',
      D: 'Enviando la lista de precios mayoristas confidenciales a los clientes de una sola unidad.',
      correcta: 'A',
      justificacion: 'El etiquetado en CRM / WhatsApp Business permite ejecutar marketing personalizado sin costo adicional, adecuando el argumento de valor, el incentivo y el llamado a la acción (CTA) al estado real de cada segmento.'
    })
  },
  {
    modulo: 4,
    tema: 'Casos de éxito en la personalización del marketing',
    bloom: 'Evaluación',
    conceptoClave: 'Venta Cruzada (Cross-Selling) y Venta Adicional (Up-Selling) Personalizada',
    planteamientoBase: (sector, barrio) =>
      `Cuando un cliente de ${barrio} realiza una compra principal en una ${sector} y el vendedor (o el catálogo digital inteligente) le sugiere un complemento altamente pertinente basado en su pedido específico, incrementando el ticket promedio en un 25% y mejorando la utilidad del producto para el usuario, ¿qué estrategia se está aplicando con éxito?`,
    opcionesGenerator: () => ({
      A: 'Cross-Selling (Venta Cruzada) contextualizada según el historial y la necesidad inmediata del segmento del cliente.',
      B: 'Publicidad engañosa sancionada por la Superintendencia de Industria y Comercio.',
      C: 'Canibalización destructiva del inventario.',
      D: 'Reducción forzosa de la calidad del servicio básico.',
      correcta: 'A',
      justificacion: 'El Cross-Selling personalizado ofrece artículos o servicios complementarios coherentes con la compra principal (ej. protector o accesorio específico), elevando el Valor de Vida del Cliente (LTV) y el ticket promedio (AOV).'
    })
  },

  // Módulo 5
  {
    modulo: 5,
    tema: 'Impacto de la tecnología en el comportamiento del consumidor (e-commerce, IA, big data)',
    bloom: 'Aplicación',
    conceptoClave: 'Búsqueda Local por Voz, Mapas y Micro-Momentos de Google',
    planteamientoBase: (sector, barrio) =>
      `Un visitante o residente en ${barrio} toma su teléfono celular y busca en Google o mediante comando de voz: "${sector} abierta cerca de mí en La Dorada". Según la teoría de los Micro-Momentos de Google ("Quiero ir", "Quiero comprar"), ¿qué debe tener configurado el negocio local para capturar a este consumidor de alta intención?`,
    opcionesGenerator: () => ({
      A: 'Una ficha de Google Perfil de Negocio (Google Maps) verificada, con horarios reales, fotos recientes, ubicación exacta, reseñas respondidas y botón de contacto directo.',
      B: 'Únicamente un aviso pintado a mano en un callejón sin salida y sin presencia en mapas digitales.',
      C: 'Una página web en construcción que pida instalar complementos obsoletos de Flash Player.',
      D: 'Un documento impreso guardado bajo llave en la oficina del gerente.',
      correcta: 'A',
      justificacion: 'En los micro-momentos de alta intención local ("cerca de mí"), los motores de búsqueda priorizan negocios con fichas de Google Maps completas, activas, bien calificadas y geolocalizadas.'
    })
  },
  {
    modulo: 5,
    tema: 'Cambios en las preferencias de los consumidores post-pandemia',
    bloom: 'Análisis',
    conceptoClave: 'Economía de la Conveniencia e Inmediatez omnicanal',
    planteamientoBase: (sector, barrio) =>
      `Al estudiar los hábitos post-pandemia en ${barrio} respecto al consumo en la categoría de ${sector}, se evidencia que el consumidor valora su tiempo libre y penaliza las filas físicas innecesarias. ¿Qué innovación de proceso responde directamente a esta tendencia sin requerir una inversión millonaria en software?`,
    opcionesGenerator: () => ({
      A: 'Implementar el modelo "Click & Collect" (Pedir por WhatsApp/Catálogo, pagar por transferencia QR y recoger sin fila en ventanilla rápida o recibir en domicilio programado).',
      B: 'Exigir que el cliente haga tres filas distintas: una para preguntar el precio, otra para pagar en efectivo exacto y otra al día siguiente para reclamar el producto.',
      C: 'Atender únicamente dos horas a la semana sin previo aviso.',
      D: 'Prohibir el uso de teléfonos celulares dentro y fuera del establecimiento.',
      correcta: 'A',
      justificacion: 'El modelo Click & Collect (Compra o reserva online / Retiro rápido en tienda o entrega programada) combina la conveniencia digital con la cercanía del comercio de barrio, eliminando tiempos muertos.'
    })
  },
  {
    modulo: 5,
    tema: 'Adaptación a nuevas generaciones de consumidores: Millennials y Gen Z',
    bloom: 'Evaluación',
    conceptoClave: 'Marketing de Contenidos Educativos/Entretenidos (Edutainment) y Micro-Influencers Locales',
    planteamientoBase: (sector, barrio) =>
      `Una ${sector} que atiende a público Millennial y Generación Z en ${barrio} nota que los afiches estáticos llenos de texto publicitario ("¡Compre ya!") tienen menos de 1% de interacción. Al cambiar su estrategia a videos cortos de 30 segundos dando consejos prácticos de uso, mostrando el "detrás de cámaras" real del negocio y colaborando con jóvenes creadores locales, las consultas por WhatsApp se triplican. ¿Por qué funciona este cambio?`,
    opcionesGenerator: () => ({
      A: 'Porque las nuevas generaciones rechazan la interrupción publicitaria intrusiva y premian a las marcas que aportan valor útil (Edutainment), cercanía territorial y narrativa humana auténtica.',
      B: 'Porque los algoritmos de redes sociales prohíben mostrar productos de buena calidad.',
      C: 'Porque a los jóvenes de 15 a 25 años no les interesa aprender nada práctico.',
      D: 'Porque el texto escrito desapareció de internet en el año 2010.',
      correcta: 'A',
      justificacion: 'Millennials y Gen Z responden al Marketing de Atracción (Inbound) y al Edutainment (educación + entretenimiento en formato breve), donde la confianza se construye aportando utilidad antes de pedir la venta.'
    })
  }
];

const RAP_TO_TEMA_MAP: Record<string, string> = {
  'RAP 1.1': 'RAP 1.1 · Definición y propósito del mapeo de mercado',
  'RAP 1.2': 'RAP 1.2 · Herramientas y metodologías de mapeo',
  'RAP 1.3': 'RAP 1.3 · Casos prácticos de mapeo de mercado en distintos sectores',
  'RAP 2.1': 'RAP 2.1 · Teorías del comportamiento del consumidor',
  'RAP 2.2': 'RAP 2.2 · Factores psicológicos y sociales que influyen en las decisiones de compra',
  'RAP 2.3': 'RAP 2.3 · Procesos de toma de decisiones del consumidor',
  'RAP 3.1': 'RAP 3.1 · Métodos cualitativos y cuantitativos en investigación de mercado',
  'RAP 3.2': 'RAP 3.2 · Uso de herramientas de análisis de datos (SPSS, Excel, Google Analytics)',
  'RAP 3.3': 'RAP 3.3 · Interpretación de datos para la toma de decisiones estratégicas',
  'RAP 4.1': 'RAP 4.1 · Técnicas de segmentación de mercado (geográfica, demográfica, psicográfica, conductual)',
  'RAP 4.2': 'RAP 4.2 · Diseño de estrategias personalizadas basadas en la segmentación',
  'RAP 4.3': 'RAP 4.3 · Casos de éxito en la personalización del marketing',
  'RAP 5.1': 'RAP 5.1 · Impacto de la tecnología en el comportamiento del consumidor (e-commerce, IA, big data)',
  'RAP 5.2': 'RAP 5.2 · Cambios en las preferencias de los consumidores post-pandemia',
  'RAP 5.3': 'RAP 5.3 · Adaptación a nuevas generaciones de consumidores: Millennials y Gen Z'
};

export function normalizeQuestion(raw: any, idx = 0): Question {
  const rawModStr = String(raw?.modulo ?? raw?.mod ?? '1');
  const modDigit = parseInt(rawModStr.replace(/\D/g, ''), 10);
  const modulo: 1 | 2 | 3 | 4 | 5 =
    modDigit >= 1 && modDigit <= 5 ? (modDigit as 1 | 2 | 3 | 4 | 5) : (((idx % 5) + 1) as 1 | 2 | 3 | 4 | 5);

  const rawEnunciado = String(raw?.enunciado || raw?.planteamiento || '').trim();
  const rawPregunta = String(raw?.pregunta || raw?.question || '').trim();
  const rawContexto = String(raw?.contexto || '').trim();

  let enunciadoFinal = rawEnunciado;
  if (!enunciadoFinal) {
    if (rawContexto && rawPregunta && !rawPregunta.includes(rawContexto)) {
      enunciadoFinal = `${rawContexto} ${rawPregunta}`;
    } else {
      enunciadoFinal =
        rawPregunta ||
        rawContexto ||
        `Pregunta de evaluación del Módulo ${modulo} (#${idx + 1})`;
    }
  } else if (rawContexto && !enunciadoFinal.includes(rawContexto) && enunciadoFinal === rawPregunta) {
    enunciadoFinal = `${rawContexto} ${rawPregunta}`;
  }

  const rawRap = String(raw?.rap || '').trim();
  const mappedTemaFromRap = RAP_TO_TEMA_MAP[rawRap.toUpperCase()] || '';
  const temaFinal = String(
    raw?.tema || mappedTemaFromRap || rawRap || raw?.tipoPregunta || `Competencia Módulo ${modulo}`
  ).trim();

  const rawBloom = String(raw?.bloom || raw?.nivel || 'Aplicación').trim();
  const validBlooms: BloomLevel[] = [
    'Conocer',
    'Comprensión',
    'Aplicación',
    'Análisis',
    'Evaluación'
  ];
  const matchedBloom =
    validBlooms.find((b) => b.toLowerCase() === rawBloom.toLowerCase()) ||
    (rawBloom.toLowerCase().includes('anál') || rawBloom.toLowerCase().includes('anal')
      ? 'Análisis'
      : rawBloom.toLowerCase().includes('eval')
      ? 'Evaluación'
      : rawBloom.toLowerCase().includes('comp')
      ? 'Comprensión'
      : rawBloom.toLowerCase().includes('con')
      ? 'Conocer'
      : 'Aplicación');

  // Normalize opciones whether object { A, B, C, D }, { a, b, c, d }, or array [a, b, c, d]
  let opA = 'Opción A';
  let opB = 'Opción B';
  let opC = 'Opción C';
  let opD = 'Opción D';

  if (Array.isArray(raw?.opciones)) {
    opA = String(raw.opciones[0] ?? 'Opción A');
    opB = String(raw.opciones[1] ?? 'Opción B');
    opC = String(raw.opciones[2] ?? 'Opción C');
    opD = String(raw.opciones[3] ?? 'Opción D');
  } else if (raw?.opciones && typeof raw.opciones === 'object') {
    opA = String(raw.opciones.A ?? raw.opciones.a ?? raw.opciones[0] ?? 'Opción A');
    opB = String(raw.opciones.B ?? raw.opciones.b ?? raw.opciones[1] ?? 'Opción B');
    opC = String(raw.opciones.C ?? raw.opciones.c ?? raw.opciones[2] ?? 'Opción C');
    opD = String(raw.opciones.D ?? raw.opciones.d ?? raw.opciones[3] ?? 'Opción D');
  } else {
    opA = String(raw?.opcionA ?? raw?.A ?? 'Opción A');
    opB = String(raw?.opcionB ?? raw?.B ?? 'Opción B');
    opC = String(raw?.opcionC ?? raw?.C ?? 'Opción C');
    opD = String(raw?.opcionD ?? raw?.D ?? 'Opción D');
  }

  const rawCorr = String(raw?.correcta ?? raw?.co ?? raw?.respuesta ?? 'A')
    .trim()
    .toUpperCase();
  let correctaFinal: 'A' | 'B' | 'C' | 'D' = 'A';
  if (rawCorr === 'A' || rawCorr === '0') correctaFinal = 'A';
  else if (rawCorr === 'B' || rawCorr === '1') correctaFinal = 'B';
  else if (rawCorr === 'C' || rawCorr === '2') correctaFinal = 'C';
  else if (rawCorr === 'D' || rawCorr === '3') correctaFinal = 'D';
  else {
    // Check if rawCorr matches the text of one of the options
    if (opB.toUpperCase() === rawCorr) correctaFinal = 'B';
    else if (opC.toUpperCase() === rawCorr) correctaFinal = 'C';
    else if (opD.toUpperCase() === rawCorr) correctaFinal = 'D';
  }

  const baseQuestion: Question = {
    id: String(raw?.id || `MM-M${modulo}-${String(idx + 1).padStart(3, '0')}`),
    modulo,
    tema: temaFinal,
    bloom: matchedBloom,
    enunciado: enunciadoFinal,
    tipoPregunta: String(
      raw?.tipoPregunta || 'Opción Múltiple'
    ),
    nivel: String(raw?.nivel || matchedBloom),
    rap: String(
      rawRap || `RAP ${modulo}.1`
    ),
    contexto: String(
      rawContexto || `Caso comercial aplicado a MiPymes de La Dorada (Módulo ${modulo}).`
    ),
    pregunta: String(rawPregunta || enunciadoFinal),
    opciones: {
      A: opA,
      B: opB,
      C: opC,
      D: opD
    },
    correcta: correctaFinal,
    justificacion: String(
      raw?.justificacion ?? raw?.j ?? 'Respuesta verificada según el marco conceptual del módulo.'
    ),
    casoGrafico: raw?.casoGrafico
  };

  return equalizeQuestionPsychometrics(baseQuestion, idx);
}

/**
 * Pool de "Cascaritas" (Trampas Conceptuales Plausibles con Mini-Explicación Técnica por Módulo)
 * Diseñadas para que los distractores cortos adquieran la misma extensión, estructura sintáctica
 * (paréntesis técnicos + cláusula justificativa) y rigor aparente que la opción correcta,
 * evitando que el estudiante adivine por longitud ("la más larga") o por presencia de explicación.
 */
const CASCARITA_CLAUSES_BY_MODULE: Record<1 | 2 | 3 | 4 | 5, string[]> = {
  1: [
    ' (Auditoría de Densidad Comercial Directa), dado que permite estandarizar la cuota de participación frente a los puntos de venta formales del corredor urbano sin alterar la estructura de costos fijos.',
    ' (Índice de Elasticidad Cruzada Sectorial), porque prioriza la defensa del margen bruto operativo ante variaciones de precios en los comercios tradicionales de la zona céntrica.',
    ' (Matriz de Concentración Geográfica Territorial), con el fin de asegurar primero el retorno sobre el inventario físico antes de evaluar sustitutos externos o canales digitales.',
    ' (Modelo de Saturación de Oferta Primaria), ya que focaliza el presupuesto comercial en igualar los atributos tangibles del competidor líder del barrio.'
  ],
  2: [
    ' (Heurística de Racionalización Post-Compra y Valor Percibido Nominal), dado que el comprador local prioriza el ahorro monetario inmediato por encima de los disparadores simbólicos o de pertenencia social.',
    ' (Condicionamiento Operante de Frecuencia Transaccional), porque asume que la repetición del estímulo promocional anula la influencia de los grupos de referencia y del entorno familiar.',
    ' (Teoría de la Utilidad Marginal Directa del Consumidor), con el propósito de estandarizar el mensaje publicitario sin fragmentar la oferta por variables subculturales o emocionales.',
    ' (Efecto de Anclaje Funcional de Corto Plazo), ya que busca acelerar el cierre en mostrador apelando únicamente a las especificaciones técnicas del producto.'
  ],
  3: [
    ' (Muestreo de Conveniencia Operativa con Validación Interna), dado que reduce los tiempos de trabajo de campo y permite proyectar la demanda a partir de la percepción histórica del equipo de ventas.',
    ' (Índice de Correlación Descriptiva Univariada), porque prioriza el volumen bruto de encuestas recolectadas sobre la neutralidad semántica o el control de sesgos del instrumento.',
    ' (Protocolo de Inferencia Estadística Cerrada), con el fin de consolidar rápidamente indicadores financieros internos sin requerir observación etnográfica ni pruebas piloto.',
    ' (Estandarización Paramétrica de Tendencia Central), ya que evita la dispersión de opiniones abiertas y facilita la tabulación inmediata en hojas de cálculo.'
  ],
  4: [
    ' (Estrategia de Cobertura Masiva Homogénea — Mass Marketing Optimization), dado que maximiza el alcance bruto de la pauta publicitaria y diluye el costo unitario por impresión en todo el municipio.',
    ' (Segmentación Macro-Demográfica por Rango Etario e Ingreso Nominal), porque agrupa a toda la población bajo variables censales fijas sin incurrir en costos adicionales de personalización por estilo de vida.',
    ' (Matriz de Estandarización Comercial Unificada), con el propósito de ofrecer un único catálogo y mensaje promocional que simplifique la operación logística del negocio.',
    ' (Modelo de Agregación de Demanda Indiferenciada), ya que prioriza el volumen total de tráfico en el punto de venta por encima de la micro-segmentación conductual o RFM.'
  ],
  5: [
    ' (Automatización Transaccional Unicanal de Alcance Masivo), dado que concentra todo el presupuesto en pauta de impresiones pagadas delegando el cierre exclusivamente al algoritmo de la red social.',
    ' (Estrategia de Presencia Multicanal Independiente — Siloed Channel Management), porque administra el punto físico y las redes sociales con precios, catálogos y metas separadas para evitar cruces operativos.',
    ' (Optimización de Tráfico Frío por Volumen de Clics — CPC Bruto), con el fin de maximizar las visitas al perfil digital sin requerir integración conversacional ni seguimiento post-venta.',
    ' (Protocolo de Difusión Unidireccional Automatizada), ya que reemplaza la atención consultiva por envíos masivos programados para reducir la carga operativa del equipo.'
  ]
};

/**
 * Suaviza palabras "delatoras" (absolutos o exageraciones caricaturescas en distractores antiguos)
 * para convertirlas en lenguaje gerencial plausible ("con cascarita").
 */
function sanitizeGiveawayWordsInDistractor(text: string): string {
  return text
    .replace(/\bpara siempre\b/gi, 'durante el ciclo semestral operativo')
    .replace(/\bbajo amenaza de multa\b/gi, 'mediante cláusulas de permanencia contractual')
    .replace(/\bcomo castigo por no comprar\b/gi, 'para compensar el costo financiero de inactividad')
    .replace(/\b3:00 de la mañana\b/gi, 'horarios de baja saturación publicitaria')
    .replace(/\bcolecciona helicópteros en Suiza\b/gi, 'registra alto poder adquisitivo fuera del área de influencia local')
    .replace(/\bestatura en centímetros\b/gi, 'parámetros biométricos y censales estandarizados')
    .replace(/\bcambie de gustos cada diez minutos\b/gi, 'presente alta volatilidad estacional en sus preferencias')
    .replace(/\bCerrar el negocio inmediatamente\b/gi, 'Suspender temporalmente la línea de producto actual para reestructurar costos')
    .replace(/\bIgnorar por completo\b/gi, 'Postergar tácticamente el análisis de')
    .replace(/\bNo hacer nada\b/gi, 'Mantener invariable la estrategia comercial vigente');
}

/**
 * Ecualizador Psicométrico y Anti-Heurístico de Reactivos:
 * 1. Neutraliza el sesgo de "la respuesta más larga es la correcta".
 * 2. Si la respuesta correcta tiene mini-explicación o paréntesis técnico, dota a los distractores
 *    cortos de una "cascarita" (término técnico en paréntesis + mini-explicación plausible).
 * 3. Garantiza que todas las opciones tengan una extensión similar y que al menos 1 o 2 distractores
 *    con cascarita igualen o superen ligeramente en longitud a la opción correcta.
 * 4. Funciona tanto en el banco incluido como al cargar una nueva base de datos de +1.000 preguntas.
 */
export function equalizeQuestionPsychometrics(q: Question, seedIdx = 0): Question {
  if (!q || !q.opciones) return q;

  const mod: 1 | 2 | 3 | 4 | 5 =
    q.modulo >= 1 && q.modulo <= 5 ? (q.modulo as 1 | 2 | 3 | 4 | 5) : 1;
  const correctLetter: 'A' | 'B' | 'C' | 'D' =
    q.correcta === 'A' || q.correcta === 'B' || q.correcta === 'C' || q.correcta === 'D'
      ? q.correcta
      : 'A';

  const correctText = String(q.opciones[correctLetter] || '').trim();
  if (!correctText) return q;

  const correctLen = correctText.length;
  const correctHasExplanation =
    correctText.includes('(') ||
    /\b(porque|dado que|ya que|debido a|con el fin de|permitiendo|lo que permite)\b/i.test(
      correctText
    );

  const pool = CASCARITA_CLAUSES_BY_MODULE[mod] || CASCARITA_CLAUSES_BY_MODULE[1];
  const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  // Hash determinista por ID de pregunta para que la ecualización sea estable
  let idHash = seedIdx;
  for (let i = 0; i < (q.id || '').length; i++) {
    idHash = (idHash * 31 + q.id.charCodeAt(i)) >>> 0;
  }

  const newOpciones: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: q.opciones.A,
    B: q.opciones.B,
    C: q.opciones.C,
    D: q.opciones.D
  };

  let distractorOffset = 0;
  for (const letter of letters) {
    if (letter === correctLetter) {
      newOpciones[letter] = correctText;
      continue;
    }

    let distText = sanitizeGiveawayWordsInDistractor(String(q.opciones[letter] || '').trim());
    if (!distText) distText = `Alternativa operativa estándar del Módulo ${mod}.`;

    const distHasExplanation =
      distText.includes('(') ||
      /\b(porque|dado que|ya que|debido a|con el fin de|permitiendo)\b/i.test(distText);

    // Si el distractor es notoriamente más corto que la correcta (< 82% de su longitud)
    // o si la correcta tiene mini-explicación y el distractor no la tiene:
    const needsCascarita =
      (correctLen >= 75 && distText.length < correctLen * 0.82) ||
      (correctHasExplanation && !distHasExplanation && distText.length < correctLen * 0.9);

    if (needsCascarita) {
      const cleanBase = distText.replace(/\.+$/, '').trim();
      const clauseIdx = (idHash + distractorOffset) % pool.length;
      const chosenClause = pool[clauseIdx];

      // Ajustar para que todos tengan extensión homogénea y al menos un distractor supere o iguale a la correcta
      let combined = `${cleanBase}${chosenClause}`;
      // Si el resultado excede demasiado (más de 130% de la correcta y más de 230 caracteres), recortar suavemente en la última coma si aplica
      if (combined.length > Math.max(correctLen * 1.32, 235) && combined.includes(',')) {
        const commaParts = combined.split(',');
        if (commaParts.length > 2) {
          combined = `${commaParts.slice(0, -1).join(',')}.`;
        }
      }
      newOpciones[letter] = combined;
    } else {
      newOpciones[letter] = distText;
    }

    distractorOffset++;
  }

  return {
    ...q,
    opciones: newOpciones
  };
}

export function equalizeQuestionBank(questions: Question[]): Question[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q, idx) => equalizeQuestionPsychometrics(q, idx));
}

export function extractRawQuestionsArray(input: any): any[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.preguntas)) return input.preguntas;
    if (Array.isArray(input.questions)) return input.questions;
    if (Array.isArray(input.banco)) return input.banco;
    if (Array.isArray(input.reactivos)) return input.reactivos;
    if (Array.isArray(input.data)) return input.data;
    if (Array.isArray(input.items)) return input.items;
  }
  return [];
}

export function normalizeQuestionList(listOrObj: any): Question[] {
  const arr = extractRawQuestionsArray(listOrObj);
  if (arr.length === 0) return [];
  return arr.map((item, idx) => normalizeQuestion(item, idx));
}

function buildFullQuestionBank(): Question[] {
  const normalizedPart1 = BANCO_PART_1.map((item, idx) => normalizeQuestion(item, idx));
  const bank: Question[] = [...normalizedPart1, ...CORE_QUESTIONS];

  // Complete up to 148 questions per module * 5 modules = 740 total unified questions
  for (let mod = 1 as 1 | 2 | 3 | 4 | 5; mod <= 5; mod++) {
    const modTemplates = TEMPLATES_MODULO.filter((t) => t.modulo === mod);
    let countForMod = bank.filter((q) => q.modulo === mod).length;

    for (let sIdx = 0; sIdx < SECTORES_LOCALES.length; sIdx++) {
      for (let bIdx = 0; bIdx < BARRIOS_ZONAS_DORADA.length; bIdx++) {
        for (let tIdx = 0; tIdx < modTemplates.length; tIdx++) {
          if (countForMod >= 148) break;
          countForMod++;
          const tpl = modTemplates[tIdx];
          const sector = SECTORES_LOCALES[(sIdx + tIdx) % SECTORES_LOCALES.length];
          const barrio = BARRIOS_ZONAS_DORADA[(bIdx + sIdx) % BARRIOS_ZONAS_DORADA.length];
          const numStr = String(countForMod).padStart(3, '0');
          const id = `MM-M${mod}-${numStr}`;

          const gen = tpl.opcionesGenerator(sector, barrio);
          // Rotate correct option position deterministically so A, B, C, D are evenly distributed
          const rotation = (countForMod + mod) % 4;
          const baseList = [
            { text: gen.A, isCorrect: gen.correcta === 'A' },
            { text: gen.B, isCorrect: gen.correcta === 'B' },
            { text: gen.C, isCorrect: gen.correcta === 'C' },
            { text: gen.D, isCorrect: gen.correcta === 'D' }
          ];
          const rotated = [
            baseList[(0 + rotation) % 4],
            baseList[(1 + rotation) % 4],
            baseList[(2 + rotation) % 4],
            baseList[(3 + rotation) % 4]
          ];
          const letters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
          const correctaFinal = letters[rotated.findIndex((item) => item.isCorrect)] || 'A';

          const planteamiento = tpl.planteamientoBase(sector, barrio);
          bank.push({
            id,
            modulo: mod as 1 | 2 | 3 | 4 | 5,
            tema: `${tpl.tema} (${tpl.conceptoClave})`,
            bloom: tpl.bloom,
            tipoPregunta: 'Opción Múltiple',
            nivel: tpl.bloom,
            rap: `RAP ${mod}.${(tIdx % 3) + 1}`,
            contexto: planteamiento,
            pregunta: '¿Cuál es la decisión o análisis estratégico más preciso según el caso expuesto?',
            enunciado: `[Caso Aplicado #${numStr}] ${planteamiento}`,
            opciones: {
              A: rotated[0].text,
              B: rotated[1].text,
              C: rotated[2].text,
              D: rotated[3].text
            },
            correcta: correctaFinal,
            justificacion: gen.justificacion
          });
        }
      }
    }
  }

  return bank.map((q, idx) => normalizeQuestion(q, idx));
}

export const INITIAL_QUESTIONS: Question[] = buildFullQuestionBank();
