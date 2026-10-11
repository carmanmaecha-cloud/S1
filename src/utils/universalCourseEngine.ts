import {
  ExamModality,
  Question,
  StudentRecord,
  SystemConfig,
  TeacherAccountRecord,
  CustomMiniRetoTemplate,
  UniversalCourseMetadata,
  UniversalExamDefinition,
  UniversalModuleDefinition,
  UniversalModuleDocumentLink,
  UniversalModuleGradingWeights
} from '../types';
import { generateDeterministicAccessCode } from '../data/students';

export const DEFAULT_MODULE_GRADING_WEIGHTS: UniversalModuleGradingWeights = {
  comportamientoPct: 10,
  participacionPct: 15,
  examenPct: 35,
  trabajoPct: 40
};

export function parseRawDocumentLinksToStructured(
  rawText: string,
  moduleNum: number,
  moduleShortTitle?: string
): UniversalModuleDocumentLink[] {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const docs: UniversalModuleDocumentLink[] = [];
  lines.forEach((line, idx) => {
    // Soporta formato "Nombre del Documento | https://enlace..." o directamente "https://enlace..."
    let titulo = '';
    let url = line;
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      titulo = parts[0] || '';
      url = parts.slice(1).join('|').trim();
    } else if (line.includes(' - http')) {
      const splitIdx = line.indexOf(' - http');
      titulo = line.slice(0, splitIdx).trim();
      url = line.slice(splitIdx + 3).trim();
    }
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
      url = `https://${url}`;
    }
    if (!titulo) {
      titulo = `Documento ${idx + 1} · ${moduleShortTitle || `Módulo ${moduleNum}`}`;
    }
    docs.push({
      id: `doc-m${moduleNum}-${idx + 1}`,
      titulo,
      url,
      tipo: url.toLowerCase().includes('.pdf')
        ? 'PDF'
        : url.toLowerCase().includes('drive.google') || url.toLowerCase().includes('docs.google')
        ? 'Google Drive'
        : 'Recurso'
    });
  });

  return docs;
}

export function formatStructuredDocumentLinksToRaw(
  links?: UniversalModuleDocumentLink[]
): string {
  if (!Array.isArray(links) || links.length === 0) return '';
  return links
    .filter((l) => l && l.url)
    .map((l) => (l.titulo ? `${l.titulo} | ${l.url}` : l.url))
    .join('\n');
}

export const DEFAULT_UNIVERSAL_MODULES: UniversalModuleDefinition[] = [
  {
    id: 1,
    code: 'C1',
    shortTitle: 'Fundamentos y Entorno Digital',
    fullTitle: 'Clase 1 / Módulo 1: Introducción al Mapeo de Mercado y Entorno Digital',
    description: 'Conceptos base de mapeo competitivo, ecosistema digital y variables del entorno.',
    retoBadgeTitle: 'Estratega de Mapeo de Mercado',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  },
  {
    id: 2,
    code: 'C2',
    shortTitle: 'Comportamiento del Consumidor Online',
    fullTitle: 'Clase 2 / Módulo 2: Comportamiento del Consumidor Digital',
    description: 'Factores psicológicos, sociales y culturales en la decisión de compra omnicanal.',
    retoBadgeTitle: 'Analista del Consumidor Digital',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  },
  {
    id: 3,
    code: 'C3',
    shortTitle: 'Mapeo de Mercado y Segmentación',
    fullTitle: 'Clase 3 / Módulo 3: Investigación de Mercados y Mapeo',
    description: 'Diseño de instrumentos cualitativos y cuantitativos, muestreo y hallazgos.',
    retoBadgeTitle: 'Investigador de Mercados Aplicado',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  },
  {
    id: 4,
    code: 'C4',
    shortTitle: 'Métricas Digitales y Analítica',
    fullTitle: 'Clase 4 / Módulo 4: Segmentación, Targeting y Analítica',
    description: 'Construcción de Buyer Personas, mapas de posicionamiento y métricas clave.',
    retoBadgeTitle: 'Arquitecto de Segmentación y Valor',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  },
  {
    id: 5,
    code: 'C5',
    shortTitle: 'Estrategias de Atracción y Conversión',
    fullTitle: 'Clase 5 / Módulo 5: Tendencias del Mercado, Conversión e IA',
    description: 'Embudos de conversión, retención, comercio conversacional y ética de datos.',
    retoBadgeTitle: 'Visionario de Tendencias y Conversión',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  },
  {
    id: 6,
    code: 'C6',
    shortTitle: 'Proyecto Integral y Sustentación',
    fullTitle: 'Clase 6 / Módulo 6: Proyecto Integral ABPro y Sustentación',
    description: 'Consolidación práctica del diagnóstico de mercado para MiPymes reales.',
    retoBadgeTitle: 'Consultor Integral ABPro',
    activo: true,
    examenesCount: 1,
    retosCount: 2,
    ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
    documentosEnlaces: [],
    enlacesTextoRaw: ''
  }
];

export const ALL_EXAM_MODALITIES_ORDER: ExamModality[] = [
  'integral',
  'mod1',
  'mod2',
  'mod3',
  'mod4',
  'mod5'
];

export const DEFAULT_UNIVERSAL_EXAMS: UniversalExamDefinition[] = [
  {
    id: 'integral',
    title: 'Examen Integral (Todos los Módulos)',
    subtitle: '40 preguntas aleatorias balanceadas • 80 minutos',
    badge: 'Evaluación Integral · 40 Reactivos · 80 Min',
    questionsCount: 40,
    durationMinutes: 80,
    maxAttempts: 2,
    activo: true
  },
  {
    id: 'mod1',
    title: 'Examen Módulo 1: Introducción al Mapeo de Mercado',
    subtitle: '25 preguntas exclusivas del Módulo 1 • 50 minutos',
    badge: 'Módulo 1 · 25 Reactivos · 50 Min',
    moduloFilter: 1,
    questionsCount: 25,
    durationMinutes: 50,
    maxAttempts: 2,
    activo: true
  },
  {
    id: 'mod2',
    title: 'Examen Módulo 2: Comportamiento del Consumidor',
    subtitle: '25 preguntas exclusivas del Módulo 2 • 50 minutos',
    badge: 'Módulo 2 · 25 Reactivos · 50 Min',
    moduloFilter: 2,
    questionsCount: 25,
    durationMinutes: 50,
    maxAttempts: 2,
    activo: true
  },
  {
    id: 'mod3',
    title: 'Examen Módulo 3: Investigación de Mercados',
    subtitle: '25 preguntas exclusivas del Módulo 3 • 50 minutos',
    badge: 'Módulo 3 · 25 Reactivos · 50 Min',
    moduloFilter: 3,
    questionsCount: 25,
    durationMinutes: 50,
    maxAttempts: 2,
    activo: true
  },
  {
    id: 'mod4',
    title: 'Examen Módulo 4: Segmentación y Posicionamiento',
    subtitle: '25 preguntas exclusivas del Módulo 4 • 50 minutos',
    badge: 'Módulo 4 · 25 Reactivos · 50 Min',
    moduloFilter: 4,
    questionsCount: 25,
    durationMinutes: 50,
    maxAttempts: 2,
    activo: true
  },
  {
    id: 'mod5',
    title: 'Examen Módulo 5: Tendencias del Mercado y Consumidor',
    subtitle: '25 preguntas exclusivas del Módulo 5 • 50 minutos',
    badge: 'Módulo 5 · 25 Reactivos · 50 Min',
    moduloFilter: 5,
    questionsCount: 25,
    durationMinutes: 50,
    maxAttempts: 2,
    activo: true
  }
];

export const DEFAULT_COURSE_METADATA: UniversalCourseMetadata = {
  courseId: 'curso-mapeo-mercado-2026',
  nombreCurso: 'Mapeo de Mercado y Comportamiento del Consumidor',
  codigoCurso: 'MM26',
  programaAcademico: 'Técnico Profesional en Marketing Digital',
  institucionSede: 'La Dorada, Caldas (Colombia)',
  periodoAcademico: '2026-1',
  docenteResponsable: 'Docente Titular',
  descripcionGeneral:
    'Curso práctico y analítico sobre investigación de mercados, comportamiento del consumidor digital, segmentación estratégica y validación ABPro.',
  cantidadModulos: 6,
  cantidadExamenes: 6,
  cantidadRetos: 5,
  habilitarExamenIntegral: true,
  modulosCurso: DEFAULT_UNIVERSAL_MODULES,
  examenesCurso: DEFAULT_UNIVERSAL_EXAMS,
  updatedAtIso: new Date().toISOString()
};

export function buildUniversalModulesList(
  count: number,
  existing?: UniversalModuleDefinition[]
): UniversalModuleDefinition[] {
  const actualCount =
    Array.isArray(existing) && existing.length > 0
      ? existing.length
      : Math.max(0, Math.min(12, Math.round(count || 0)));
  if (actualCount <= 0) return [];

  const result: UniversalModuleDefinition[] = [];
  for (let i = 1; i <= actualCount; i++) {
    const found =
      existing?.find((m) => Number(m.id) === i) ||
      existing?.[i - 1];
    if (found) {
      const weights: UniversalModuleGradingWeights = {
        comportamientoPct:
          typeof found.ponderacion?.comportamientoPct === 'number'
            ? found.ponderacion.comportamientoPct
            : DEFAULT_MODULE_GRADING_WEIGHTS.comportamientoPct,
        participacionPct:
          typeof found.ponderacion?.participacionPct === 'number'
            ? found.ponderacion.participacionPct
            : DEFAULT_MODULE_GRADING_WEIGHTS.participacionPct,
        examenPct:
          typeof found.ponderacion?.examenPct === 'number'
            ? found.ponderacion.examenPct
            : DEFAULT_MODULE_GRADING_WEIGHTS.examenPct,
        trabajoPct:
          typeof found.ponderacion?.trabajoPct === 'number'
            ? found.ponderacion.trabajoPct
            : DEFAULT_MODULE_GRADING_WEIGHTS.trabajoPct
      };
      const rawLinks =
        typeof found.enlacesTextoRaw === 'string'
          ? found.enlacesTextoRaw
          : formatStructuredDocumentLinksToRaw(found.documentosEnlaces);
      const structuredLinks =
        Array.isArray(found.documentosEnlaces) && found.documentosEnlaces.length > 0
          ? found.documentosEnlaces
          : parseRawDocumentLinksToStructured(rawLinks, i, found.shortTitle);

      const cleanShortTitle = (found.shortTitle || '').trim() || `Módulo ${i}`;
      const cleanFullTitle =
        (found.fullTitle || '').trim() || `Clase ${i} / Módulo ${i}: ${cleanShortTitle}`;

      result.push({
        ...found,
        id: i,
        code: found.code || `C${i}`,
        shortTitle: cleanShortTitle,
        fullTitle: cleanFullTitle,
        activo: found.activo !== false,
        examenesCount: typeof found.examenesCount === 'number' ? found.examenesCount : 1,
        retosCount: typeof found.retosCount === 'number' ? found.retosCount : 1,
        preguntasExamenModuloCount:
          typeof found.preguntasExamenModuloCount === 'number'
            ? found.preguntasExamenModuloCount
            : 25,
        preguntasParaIntegralCount:
          typeof found.preguntasParaIntegralCount === 'number'
            ? found.preguntasParaIntegralCount
            : 8,
        preguntasSeleccionadasIntegralIds: Array.isArray(found.preguntasSeleccionadasIntegralIds)
          ? found.preguntasSeleccionadasIntegralIds
          : [],
        ponderacion: weights,
        documentosEnlaces: structuredLinks,
        enlacesTextoRaw: rawLinks
      });
    } else {
      result.push({
        id: i,
        code: `C${i}`,
        shortTitle: `Módulo ${i}`,
        fullTitle: `Clase ${i} / Módulo ${i}`,
        description: '',
        retoBadgeTitle: `Insignia Módulo ${i}`,
        activo: true,
        examenesCount: 1,
        retosCount: 1,
        preguntasExamenModuloCount: 25,
        preguntasParaIntegralCount: 8,
        preguntasSeleccionadasIntegralIds: [],
        ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS },
        documentosEnlaces: [],
        enlacesTextoRaw: ''
      });
    }
  }
  return result;
}

/**
 * Returns how many questions from a specific module are selected/contributed to the
 * Examen Integral Final (outside the modules).
 */
export function getModuleIntegralQuestionsContribution(
  mod: UniversalModuleDefinition,
  questionsBank?: Question[]
): number {
  if (
    Array.isArray(mod.preguntasSeleccionadasIntegralIds) &&
    mod.preguntasSeleccionadasIntegralIds.length > 0
  ) {
    return mod.preguntasSeleccionadasIntegralIds.length;
  }
  if (typeof mod.preguntasParaIntegralCount === 'number' && mod.preguntasParaIntegralCount >= 0) {
    return mod.preguntasParaIntegralCount;
  }
  if (Array.isArray(questionsBank) && questionsBank.length > 0) {
    const modCount = questionsBank.filter((q) => Number(q.modulo) === Number(mod.id)).length;
    if (modCount > 0) return modCount;
  }
  return 8;
}

/**
 * Automatically sums the selected questions from all modules (Módulo 1 to Módulo N)
 * to generate the total question count for the single integrative final exam.
 */
export function computeIntegralExamAutoSumFromModules(
  modules: UniversalModuleDefinition[],
  questionsBank?: Question[]
): {
  totalQuestions: number;
  selectedQuestionIds: string[];
  perModuleBreakdown: {
    moduleId: number;
    moduleCode: string;
    moduleTitle: string;
    selectedCount: number;
    availableInBankCount: number;
    explicitIdsCount: number;
  }[];
} {
  const safeModules =
    Array.isArray(modules) && modules.length > 0 ? modules : DEFAULT_UNIVERSAL_MODULES;
  const bank = Array.isArray(questionsBank) ? questionsBank : [];

  let totalQuestions = 0;
  const selectedQuestionIds: string[] = [];
  const perModuleBreakdown = safeModules.map((mod) => {
    const modBankQuestions = bank.filter((q) => Number(q.modulo) === Number(mod.id));
    const explicitIds = Array.isArray(mod.preguntasSeleccionadasIntegralIds)
      ? mod.preguntasSeleccionadasIntegralIds.filter((id) =>
          modBankQuestions.length === 0 ? true : modBankQuestions.some((q) => q.id === id)
        )
      : [];

    const selectedCount =
      explicitIds.length > 0
        ? explicitIds.length
        : typeof mod.preguntasParaIntegralCount === 'number'
        ? Math.max(0, mod.preguntasParaIntegralCount)
        : modBankQuestions.length > 0
        ? modBankQuestions.length
        : 8;

    totalQuestions += selectedCount;
    if (explicitIds.length > 0) {
      selectedQuestionIds.push(...explicitIds);
    } else if (modBankQuestions.length > 0) {
      selectedQuestionIds.push(...modBankQuestions.slice(0, selectedCount).map((q) => q.id));
    }

    return {
      moduleId: mod.id,
      moduleCode: mod.code || `C${mod.id}`,
      moduleTitle: mod.shortTitle || `Módulo ${mod.id}`,
      selectedCount,
      availableInBankCount: modBankQuestions.length,
      explicitIdsCount: explicitIds.length
    };
  });

  return {
    totalQuestions: Math.max(1, totalQuestions),
    selectedQuestionIds,
    perModuleBreakdown
  };
}

/**
 * Returns the list of registered teacher accounts.
 * Starts empty unless teachers have been registered or configured in the Editor Panel.
 */
export function getEffectiveRegisteredTeachers(config: SystemConfig): TeacherAccountRecord[] {
  const existing = Array.isArray(config?.registeredTeachers) ? config.registeredTeachers : [];
  if (existing.length > 0) {
    return existing;
  }

  const defaultTeacherId = (config?.idDocente || '').trim().toUpperCase();
  const defaultTeacherPass = (config?.claveDocente || '').trim();
  if (!defaultTeacherId || !defaultTeacherPass) {
    return [];
  }

  const catalogIds = Array.isArray(config?.universalCoursesCatalog)
    ? config.universalCoursesCatalog.map((c) => c.meta.courseId)
    : [];
  const allCourseIds = Array.from(
    new Set([
      ...(config?.activeCourseId ? [config.activeCourseId] : []),
      ...catalogIds
    ])
  );

  return [
    {
      id: defaultTeacherId,
      nombre: config?.activeCourseMeta?.docenteResponsable || 'Docente Asignado',
      claveAcceso: defaultTeacherPass,
      correo: config?.correoRecuperacion || '',
      especialidad: 'Docente de Cátedra',
      activo: true,
      esTitularPrincipal: true,
      cursosAsignadosIds: allCourseIds,
      updatedAtIso: new Date().toISOString()
    }
  ];
}

/**
 * Checks whether a given teacher ID has access to a course workspace.
 */
export function canTeacherAccessCourse(
  teacherId: string | null | undefined,
  courseMeta: UniversalCourseMetadata,
  teachers: TeacherAccountRecord[]
): boolean {
  if (!teacherId) return true;
  const cleanId = String(teacherId || '').trim().toUpperCase();
  const teacherRec = (Array.isArray(teachers) ? teachers : []).find(
    (t) => String(t?.id || '').trim().toUpperCase() === cleanId
  );

  if (
    courseMeta?.docenteAsignadoId &&
    String(courseMeta.docenteAsignadoId || '').trim().toUpperCase() === cleanId
  ) {
    return true;
  }
  if (
    Array.isArray(courseMeta?.docentesAutorizadosIds) &&
    courseMeta.docentesAutorizadosIds.some((id) => String(id || '').trim().toUpperCase() === cleanId)
  ) {
    return true;
  }
  if (teacherRec) {
    if (
      Array.isArray(teacherRec.cursosAsignadosIds) &&
      teacherRec.cursosAsignadosIds.includes(courseMeta.courseId)
    ) {
      return true;
    }
    if (
      teacherRec.esTitularPrincipal &&
      !courseMeta.docenteAsignadoId &&
      (!Array.isArray(courseMeta.docentesAutorizadosIds) ||
        courseMeta.docentesAutorizadosIds.length === 0)
    ) {
      return true;
    }
    return false;
  }
  return true;
}

export function buildUniversalExamsList(
  count: number,
  modulos: UniversalModuleDefinition[],
  existing?: UniversalExamDefinition[],
  integralQuestions = 40,
  integralMinutes = 80,
  moduleQuestions = 25,
  moduleMinutes = 50,
  enableIntegralExam = true
): UniversalExamDefinition[] {
  if (!Array.isArray(modulos) || modulos.length === 0) {
    return [];
  }
  return ALL_EXAM_MODALITIES_ORDER.map((modId, idx) => {
    const prev = existing?.find((e) => e.id === modId);
    if (modId === 'integral') {
      const qCount = prev?.questionsCount ?? integralQuestions;
      const dMin = prev?.durationMinutes ?? integralMinutes;
      const title =
        prev?.title ||
        `Examen Integral Final (Módulos 1 al ${modulos.length})`;
      const isIntegralActive =
        typeof enableIntegralExam === 'boolean'
          ? enableIntegralExam
          : prev?.activo !== false;
      return {
        id: 'integral',
        title,
        subtitle: `${qCount} preguntas integradoras (Módulo 1 al ${modulos.length}) • ${dMin} minutos`,
        badge: `Evaluación Integral Final · ${qCount} Reactivos · ${dMin} Min`,
        questionsCount: qCount,
        durationMinutes: dMin,
        maxAttempts: prev?.maxAttempts ?? 2,
        activo: isIntegralActive
      };
    }

    const modNum = idx; // 1..5
    const matchingMod = modulos.find((m) => Number(m.id) === modNum);
    const qCount = matchingMod?.preguntasExamenModuloCount ?? prev?.questionsCount ?? moduleQuestions;
    const dMin = prev?.durationMinutes ?? moduleMinutes;
    const defaultTitle = matchingMod
      ? `Examen Módulo ${modNum}: ${matchingMod.shortTitle}`
      : `Examen Módulo ${modNum}`;
    const isModActive = Boolean(
      matchingMod && matchingMod.activo !== false && (matchingMod.examenesCount ?? 1) > 0
    );

    return {
      id: modId,
      title: matchingMod ? defaultTitle : prev?.title || defaultTitle,
      subtitle: `${qCount} preguntas exclusivas del Módulo ${modNum} • ${dMin} minutos`,
      badge: `Módulo ${modNum} · ${qCount} Reactivos · ${dMin} Min`,
      moduloFilter: modNum,
      questionsCount: qCount,
      durationMinutes: dMin,
      maxAttempts: prev?.maxAttempts ?? 2,
      activo: isModActive
    };
  });
}

function getAuthenticatedTeacherIdFromStorage(): string | null {
  try {
    const rawSession =
      (typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('evaluaplus_global_auth_session_v1')) ||
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('evaluaplus_global_auth_session_v1'));
    if (!rawSession) return null;
    const parsed = JSON.parse(rawSession);
    if (parsed && parsed.teacherSessionActive && parsed.teacherAuthenticatedId) {
      return String(parsed.teacherAuthenticatedId).trim().toUpperCase();
    }
  } catch {
    // ignore storage read errors
  }
  return null;
}

export function getEffectiveCourseMetadata(
  config?: SystemConfig,
  preferredTeacherId?: string | null
): UniversalCourseMetadata {
  const catalog = Array.isArray(config?.universalCoursesCatalog)
    ? config!.universalCoursesCatalog.filter((w) => w && w.meta && w.meta.courseId)
    : [];

  const activeTeacherId = (preferredTeacherId || getAuthenticatedTeacherIdFromStorage() || '')
    .trim()
    .replace(/[\s.-]/g, '')
    .toUpperCase();

  let raw: UniversalCourseMetadata | undefined;

  if (activeTeacherId && catalog.length > 0) {
    const teachersList = Array.isArray(config?.registeredTeachers)
      ? config!.registeredTeachers
      : [];
    const teacherRecord = teachersList.find(
      (t) => String(t?.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === activeTeacherId
    );

    // 1. Prefer the currently activeCourseId if it is assigned to this teacher
    const activeInCatalog = catalog.find((w) => w.meta.courseId === config?.activeCourseId);
    const matchesTeacher = (meta: UniversalCourseMetadata) => {
      if (
        meta?.docenteAsignadoId &&
        String(meta.docenteAsignadoId || '').trim().replace(/[\s.-]/g, '').toUpperCase() === activeTeacherId
      ) {
        return true;
      }
      if (
        Array.isArray(meta?.docentesAutorizadosIds) &&
        meta.docentesAutorizadosIds.some(
          (id) => String(id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === activeTeacherId
        )
      ) {
        return true;
      }
      if (
        teacherRecord &&
        Array.isArray(teacherRecord.cursosAsignadosIds) &&
        teacherRecord.cursosAsignadosIds.includes(meta.courseId)
      ) {
        return true;
      }
      return false;
    };

    if (activeInCatalog && matchesTeacher(activeInCatalog.meta)) {
      raw = activeInCatalog.meta;
    } else {
      const assignedWorkspace = catalog.find((w) => matchesTeacher(w.meta));
      if (assignedWorkspace) {
        raw = assignedWorkspace.meta;
      }
    }
  }

  if (!raw) {
    const byActiveId = catalog.find((w) => w.meta.courseId === config?.activeCourseId)?.meta;
    raw = byActiveId || config?.activeCourseMeta || catalog[0]?.meta;
  }

  if (!raw || typeof raw !== 'object' || !raw.courseId) {
    return {
      courseId: '',
      nombreCurso: 'Sin curso configurado',
      codigoCurso: '',
      programaAcademico: '',
      institucionSede: '',
      periodoAcademico: '',
      docenteResponsable: '',
      docenteAsignadoId: '',
      docentesAutorizadosIds: [],
      descripcionGeneral: '',
      cantidadModulos: 0,
      cantidadExamenes: 0,
      cantidadRetos: 0,
      habilitarExamenIntegral: false,
      modulosCurso: [],
      examenesCurso: [],
      updatedAtIso: new Date().toISOString()
    };
  }

  const existingModules = Array.isArray(raw.modulosCurso) ? raw.modulosCurso : [];
  const rawModCount =
    existingModules.length > 0
      ? existingModules.length
      : Math.max(0, Number(raw.cantidadModulos) || 0);
  const cantidadModulos = Math.max(0, Math.min(12, rawModCount));
  const habilitarExamenIntegral = raw.habilitarExamenIntegral !== false && cantidadModulos > 0;

  const modulosCurso = buildUniversalModulesList(
    cantidadModulos,
    existingModules.length > 0 ? existingModules : undefined
  );

  const sumModuleExams = modulosCurso.reduce(
    (acc, m) => acc + (typeof m.examenesCount === 'number' ? m.examenesCount : 1),
    0
  );
  const sumModuleRetos = modulosCurso.reduce(
    (acc, m) => acc + (typeof m.retosCount === 'number' ? m.retosCount : 1),
    0
  );

  const cantidadExamenes = Math.max(0, sumModuleExams + (habilitarExamenIntegral ? 1 : 0));
  const cantidadRetos = Math.max(0, sumModuleRetos);

  const examenesCurso = buildUniversalExamsList(
    cantidadExamenes,
    modulosCurso,
    Array.isArray(raw.examenesCurso) ? raw.examenesCurso : undefined,
    config?.preguntasExamenIntegral ?? 40,
    config?.tiempoExamenIntegralMin ?? 80,
    config?.preguntasExamenModulo ?? 25,
    config?.tiempoExamenModuloMin ?? 50,
    habilitarExamenIntegral
  );

  return {
    ...raw,
    courseId: raw.courseId,
    nombreCurso: raw.nombreCurso || 'Curso Activo',
    codigoCurso: (raw.codigoCurso || 'CURSO').toUpperCase().slice(0, 6),
    programaAcademico: raw.programaAcademico || '',
    nombreAsignatura: raw.nombreAsignatura || raw.programaAcademico || '',
    institucionSede: raw.institucionSede || '',
    periodoAcademico: raw.periodoAcademico || '',
    docenteResponsable: raw.docenteResponsable || '',
    docenteAsignadoId: raw.docenteAsignadoId || '',
    docentesAutorizadosIds: Array.isArray(raw.docentesAutorizadosIds)
      ? raw.docentesAutorizadosIds
      : raw.docenteAsignadoId
      ? [raw.docenteAsignadoId]
      : [],
    descripcionGeneral: raw.descripcionGeneral || '',
    cantidadModulos: modulosCurso.length,
    cantidadExamenes,
    cantidadRetos,
    habilitarExamenIntegral,
    modulosCurso,
    examenesCurso,
    updatedAtIso: raw.updatedAtIso || new Date().toISOString()
  };
}

export function createDemoStudentForCourse(codigoCurso = 'MM26'): StudentRecord {
  const cleanPrefix = (codigoCurso || 'MM26').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'MM26';
  const baseCode = generateDeterministicAccessCode('1000000000');
  const customCode = `${cleanPrefix}-${baseCode.split('-').slice(1).join('-')}`;
  return {
    id: '1000000000',
    nombre: 'USUARIO DEMO DOCENTE (ENSAYO EN AULA)',
    codigoAcceso: customCode,
    intentosUsados: 0,
    preguntasIntento1: [],
    preguntasIntento2: [],
    conceptoInfraccion: '✓ Sin infracciones',
    suspendido: false
  };
}

export function generateBaseQuestionsForCourseModules(
  courseMeta: UniversalCourseMetadata,
  questionsPerModule = 8
): Question[] {
  const result: Question[] = [];
  const bloomLevels: ('Conocer' | 'Comprensión' | 'Aplicación' | 'Análisis')[] = [
    'Conocer',
    'Comprensión',
    'Aplicación',
    'Análisis'
  ];

  const maxMod = Math.min(5, Math.max(1, courseMeta.cantidadModulos));
  for (let m = 1; m <= maxMod; m++) {
    const modDef = courseMeta.modulosCurso.find((x) => x.id === m);
    const modTitle = modDef?.shortTitle || `Módulo ${m}`;
    for (let qIdx = 1; qIdx <= questionsPerModule; qIdx++) {
      const bloom = bloomLevels[(qIdx - 1) % bloomLevels.length];
      const qId = `${courseMeta.codigoCurso}-M${m}-Q${String(qIdx).padStart(2, '0')}`;
      result.push({
        id: qId,
        modulo: m as 1 | 2 | 3 | 4 | 5,
        tema: modTitle,
        bloom,
        enunciado: `[${courseMeta.nombreCurso} · ${modTitle}] Caso aplicado #${qIdx}: En el contexto de "${modTitle}", ¿cuál de las siguientes decisiones estratégicas permite validar con rigor los indicadores y objetivos propuestos en el módulo?`,
        opciones: {
          A: `Implementar un diagnóstico estructurado basado en evidencia de "${modTitle}", definiendo métricas verificables y seguimiento continuo.`,
          B: `Aplicar acciones aisladas sin diagnóstico previo ni medición de impacto sobre los objetivos de "${modTitle}".`,
          C: `Omitir la validación de datos primarios y basarse únicamente en suposiciones subjetivas no documentadas.`,
          D: `Postergar la evaluación de resultados hasta finalizar todo el proyecto sin control de calidad intermedio.`
        },
        correcta: 'A',
        justificacion: `En "${modTitle}" (${courseMeta.nombreCurso}), la toma de decisiones fundamentada en diagnóstico estructurado y métricas verificables garantiza pertinencia técnica y trazabilidad.`
      });
    }
  }
  return result;
}

export function generateBaseRetosForCourseModules(
  courseMeta: UniversalCourseMetadata,
  courseQuestions?: Question[]
): CustomMiniRetoTemplate[] {
  const activeModules = Array.isArray(courseMeta.modulosCurso)
    ? courseMeta.modulosCurso.filter((m) => m && m.activo !== false)
    : [];
  const modulesToProcess =
    activeModules.length > 0
      ? activeModules
      : Array.from({ length: Math.min(5, Math.max(1, courseMeta.cantidadModulos || 1)) }, (_, i) => ({
          id: i + 1,
          code: `M${i + 1}`,
          shortTitle: `Módulo ${i + 1}`,
          fullTitle: `Módulo ${i + 1}`,
          activo: true,
          examenesCount: 1,
          retosCount: 2,
          ponderacion: { ...DEFAULT_MODULE_GRADING_WEIGHTS }
        }));

  const safeQuestions = Array.isArray(courseQuestions) ? courseQuestions.filter(Boolean) : [];
  const templates: CustomMiniRetoTemplate[] = [];

  for (const modDef of modulesToProcess) {
    const m = Math.max(1, Math.min(5, Number(modDef.id) || 1)) as 1 | 2 | 3 | 4 | 5;
    const modTitle = (modDef.shortTitle || modDef.fullTitle || '').trim() || `Módulo ${m}`;
    const retosForThisModule = Math.max(0, Math.min(10, modDef.retosCount ?? 2));
    if (retosForThisModule === 0) continue;

    // Filter questions belonging to this module (or fallback to any course questions if only 1 module exists)
    const modQuestions = safeQuestions.filter((q) => Number(q.modulo) === m);
    const effectiveQuestions =
      modQuestions.length > 0
        ? modQuestions
        : modulesToProcess.length === 1
        ? safeQuestions
        : [];

    if (effectiveQuestions.length > 0) {
      // Build templates directly from the course's loaded Question Bank
      const itemsToBuild = effectiveQuestions.slice(
        0,
        Math.max(retosForThisModule, effectiveQuestions.length)
      );
      itemsToBuild.forEach((q, idx) => {
        const rIdx = idx + 1;
        const correctOptText = q.opciones?.[q.correcta] || '';
        const cleanTema = (q.tema || modTitle).trim();
        const rawWords = `${cleanTema} ${correctOptText} ${q.justificacion || ''}`
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 5);
        const uniqueKeywords = Array.from(new Set([cleanTema.split(' ')[0] || modTitle, ...rawWords]))
          .filter(Boolean)
          .slice(0, 5);

        templates.push({
          id: `reto-q-${courseMeta.courseId || 'curso'}-${q.id}`,
          modulo: m,
          tema: cleanTema,
          familia: rIdx % 2 === 1 ? 'Estrategia y Creación' : 'Aplicación Local y Feynman',
          mecanicaId: rIdx % 2 === 1 ? 'escoge_tu_aventura' : 'traductor_del_barrio',
          mecanicaNombre:
            rIdx % 2 === 1 ? 'Simulador de Decisión Aplicada' : 'Explicación Práctica Feynman',
          titulo: `Reto #${rIdx} (${q.id}) · M${m}: ${cleanTema}`,
          narrativa:
            q.contexto && q.pregunta && !q.pregunta.includes(q.contexto)
              ? `${q.contexto} — ${q.enunciado}`
              : q.enunciado,
          preguntaReto:
            q.pregunta && q.contexto && !q.pregunta.includes(q.contexto)
              ? `${q.pregunta} Sustente y explique con sus propias palabras por qué la decisión correcta aplica en este caso.`
              : `A partir del caso planteado («${q.enunciado}»), explique y argumente con sus propias palabras la solución técnica correcta y cómo aplicarla en la práctica.`,
          pistaOpcional: `Considere el principio clave: ${(q.justificacion || correctOptText).slice(0, 140)}...`,
          respuestaEsperada: `${correctOptText}. ${q.justificacion || ''}`.trim(),
          conceptosClave:
            uniqueKeywords.length > 0
              ? uniqueKeywords
              : [modTitle.split(' ')[0] || 'Concepto', 'Análisis', 'Aplicación'],
          criterioEvaluacion60: `Identifica el fundamento de «${cleanTema}» (${correctOptText}) y argumenta su justificación: ${
            q.justificacion || 'aplicación coherente al caso.'
          }`,
          umbralAprobacionPct: 60,
          activo: true
        });
      });
    } else {
      for (let rIdx = 1; rIdx <= retosForThisModule; rIdx++) {
        templates.push({
          id: `reto-${courseMeta.courseId}-mod-${m}-r${rIdx}`,
          modulo: m,
          tema: modTitle,
          familia: rIdx % 2 === 1 ? 'Estrategia y Creación' : 'Aplicación Local y Feynman',
          mecanicaId: rIdx % 2 === 1 ? 'escoge_tu_aventura' : 'traductor_del_barrio',
          mecanicaNombre:
            rIdx % 2 === 1 ? 'Simulador de Decisión Aplicada' : 'Explicación Práctica Feynman',
          titulo: `Reto #${rIdx} · Módulo ${m}: ${modTitle}`,
          narrativa: `Usted lidera la implementación práctica del módulo "${modTitle}" (Reto ${rIdx} de ${retosForThisModule}) dentro del curso "${courseMeta.nombreCurso}". Un equipo solicita su orientación para estructurar una solución viable y medible.`,
          preguntaReto: `Explique con sus propias palabras cómo aplicaría los conceptos centrales de "${modTitle}" en un caso real y qué indicador utilizaría para medir el éxito.`,
          pistaOpcional: `Relacione el problema con un concepto clave de ${modTitle} y proponga una acción concreta con su métrica.`,
          respuestaEsperada: `La propuesta debe articular el diagnóstico de ${modTitle}, una acción estratégica aplicable al caso real y al menos un indicador o métrica verificable de seguimiento.`,
          conceptosClave: [
            modTitle.split(' ')[0] || 'Diagnóstico',
            'Estrategia',
            'Indicador',
            'Aplicación'
          ],
          criterioEvaluacion60:
            'Explica con claridad el concepto del módulo, propone una aplicación práctica coherente y menciona cómo evaluar el resultado.',
          umbralAprobacionPct: 60,
          activo: true
        });
      }
    }
  }

  return templates;
}
