/**
 * Sistema de Verificación de Versión de Esquema de Caché Local,
 * Registro de Errores de Caché, Estado de Peticiones API y Latencia del Servidor.
 */

export const CURRENT_DATA_SCHEMA_VERSION = '2026.5.0';
export const SCHEMA_VERSION_STORAGE_KEY = 'evaluaplus_schema_version_v1';
export const DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY = 'evaluaplus_diag_cache_errors_v1';

export interface CacheKeyInspectionResult {
  storageKey: string;
  label: string;
  present: boolean;
  sizeBytes: number;
  validSchema: boolean;
  recordsCount?: number;
  missingFields: string[];
  details: string;
}

export interface CacheDiagnosticErrorEntry {
  id: string;
  timestampIso: string;
  timestampFormatted: string;
  storageKey: string;
  severity: 'warning' | 'error';
  reason: string;
  missingFields: string[];
  detectedSchemaVersion: string | null;
  expectedSchemaVersion: string;
  autoRepaired: boolean;
}

export interface SchemaValidationReport {
  isValid: boolean;
  requiresPreventiveClean: boolean;
  detectedVersion: string | null;
  expectedVersion: string;
  checkedAtFormatted: string;
  totalStorageBytes: number;
  inspectedKeys: CacheKeyInspectionResult[];
  issues: CacheDiagnosticErrorEntry[];
}

export interface ApiRequestDiagnosticEntry {
  id: string;
  timestampMs: number;
  timestampFormatted: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  status: number | null;
  ok: boolean;
  latencyMs: number;
  source: 'express_api' | 'firestore_fallback' | 'network_error';
  revision?: number;
  errorMessage?: string;
}

type DiagnosticListener = () => void;

const MAX_API_LOGS = 40;
const MAX_CACHE_ERROR_LOGS = 30;

let apiRequestLogs: ApiRequestDiagnosticEntry[] = [];
let cacheErrorLogs: CacheDiagnosticErrorEntry[] = [];
let latestSchemaReport: SchemaValidationReport | null = null;
const listeners = new Set<DiagnosticListener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeSystemDiagnostics(listener: DiagnosticListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Load persisted cache error logs from sessionStorage/localStorage on module init
function loadPersistedCacheErrors(): CacheDiagnosticErrorEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw =
      sessionStorage.getItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY) ||
      localStorage.getItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_CACHE_ERROR_LOGS);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function savePersistedCacheErrors(entries: CacheDiagnosticErrorEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(entries.slice(0, MAX_CACHE_ERROR_LOGS));
    sessionStorage.setItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY, serialized);
    localStorage.setItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY, serialized);
  } catch {
    // ignore quota errors
  }
}

cacheErrorLogs = loadPersistedCacheErrors();

export function recordCacheDiagnosticError(
  entry: Omit<CacheDiagnosticErrorEntry, 'id' | 'timestampIso' | 'timestampFormatted' | 'expectedSchemaVersion'>
) {
  const now = new Date();
  const fullEntry: CacheDiagnosticErrorEntry = {
    ...entry,
    id: `cache-err-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: now.toISOString(),
    timestampFormatted: now.toLocaleTimeString('es-CO'),
    expectedSchemaVersion: CURRENT_DATA_SCHEMA_VERSION
  };
  cacheErrorLogs = [fullEntry, ...cacheErrorLogs].slice(0, MAX_CACHE_ERROR_LOGS);
  savePersistedCacheErrors(cacheErrorLogs);
  notifyListeners();
}

export function clearCacheDiagnosticErrors() {
  cacheErrorLogs = [];
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY);
      localStorage.removeItem(DIAGNOSTIC_CACHE_ERRORS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notifyListeners();
}

export function recordApiRequestDiagnostic(
  entry: Omit<ApiRequestDiagnosticEntry, 'id' | 'timestampMs' | 'timestampFormatted'>
) {
  const now = new Date();
  const fullEntry: ApiRequestDiagnosticEntry = {
    ...entry,
    id: `api-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: now.getTime(),
    timestampFormatted: now.toLocaleTimeString('es-CO')
  };
  apiRequestLogs = [fullEntry, ...apiRequestLogs].slice(0, MAX_API_LOGS);
  notifyListeners();
}

export function clearApiRequestDiagnostics() {
  apiRequestLogs = [];
  notifyListeners();
}

export function getSystemDiagnosticsSnapshot() {
  const latencies = apiRequestLogs.filter((r) => r.latencyMs >= 0).map((r) => r.latencyMs);
  const lastLatencyMs = latencies.length > 0 ? latencies[0] : null;
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((acc, v) => acc + v, 0) / latencies.length)
      : null;
  const minLatencyMs = latencies.length > 0 ? Math.min(...latencies) : null;
  const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : null;

  const totalRequests = apiRequestLogs.length;
  const okRequests = apiRequestLogs.filter((r) => r.ok).length;
  const failedRequests = totalRequests - okRequests;
  const successRatePct =
    totalRequests > 0 ? Math.round((okRequests / totalRequests) * 100) : 100;

  return {
    currentSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
    latestSchemaReport,
    cacheErrorLogs,
    apiRequestLogs,
    metrics: {
      lastLatencyMs,
      avgLatencyMs,
      minLatencyMs,
      maxLatencyMs,
      totalRequests,
      okRequests,
      failedRequests,
      successRatePct
    }
  };
}

/**
 * Inspects localStorage keys at startup or on-demand to verify whether the cached
 * data schema matches CURRENT_DATA_SCHEMA_VERSION and contains all required key fields.
 */
export function validateLocalCacheSchema(options?: {
  recordIssuesToLog?: boolean;
}): SchemaValidationReport {
  const shouldRecord = options?.recordIssuesToLog ?? true;
  const nowFormatted = new Date().toLocaleTimeString('es-CO');

  if (typeof window === 'undefined') {
    const emptyReport: SchemaValidationReport = {
      isValid: true,
      requiresPreventiveClean: false,
      detectedVersion: CURRENT_DATA_SCHEMA_VERSION,
      expectedVersion: CURRENT_DATA_SCHEMA_VERSION,
      checkedAtFormatted: nowFormatted,
      totalStorageBytes: 0,
      inspectedKeys: [],
      issues: []
    };
    latestSchemaReport = emptyReport;
    return emptyReport;
  }

  let detectedVersion: string | null = null;
  let totalStorageBytes = 0;

  try {
    detectedVersion = localStorage.getItem(SCHEMA_VERSION_STORAGE_KEY);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const val = localStorage.getItem(k) || '';
        totalStorageBytes += (k.length + val.length) * 2;
      }
    }
  } catch {
    // ignore storage access errors
  }

  const issues: CacheDiagnosticErrorEntry[] = [];
  const inspectedKeys: CacheKeyInspectionResult[] = [];

  const pushIssue = (
    storageKey: string,
    severity: 'warning' | 'error',
    reason: string,
    missingFields: string[],
    autoRepaired = false
  ) => {
    const now = new Date();
    const issue: CacheDiagnosticErrorEntry = {
      id: `schema-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      timestampIso: now.toISOString(),
      timestampFormatted: now.toLocaleTimeString('es-CO'),
      storageKey,
      severity,
      reason,
      missingFields,
      detectedSchemaVersion: detectedVersion,
      expectedSchemaVersion: CURRENT_DATA_SCHEMA_VERSION,
      autoRepaired
    };
    issues.push(issue);
    if (shouldRecord) {
      // Avoid duplicating identical storageKey+reason within the last 5 seconds
      const isDuplicate = cacheErrorLogs.some(
        (existing) =>
          existing.storageKey === storageKey &&
          existing.reason === reason &&
          now.getTime() - new Date(existing.timestampIso).getTime() < 5000
      );
      if (!isDuplicate) {
        cacheErrorLogs = [issue, ...cacheErrorLogs].slice(0, MAX_CACHE_ERROR_LOGS);
      }
    }
  };

  // 1. Check Legacy Snapshot or Obsolete v1 keys
  const legacyKeys = [
    'evaluaplus_prev_questions_snapshot_v1',
    'evaluaplus_students_v1',
    'evaluaplus_questions_v1',
    'evaluaplus_questions_v2',
    'evaluaplus_config_v1'
  ];
  legacyKeys.forEach((legKey) => {
    try {
      const raw = localStorage.getItem(legKey);
      if (raw !== null) {
        pushIssue(
          legKey,
          'warning',
          `Se encontró clave obsoleta de versión anterior (${legKey}) en localStorage.`,
          ['schema_v2_migration'],
          true
        );
      }
    } catch {
      // ignore
    }
  });

  // 2. Inspect Students ('evaluaplus_students_v2')
  try {
    const key = 'evaluaplus_students_v2';
    const raw = localStorage.getItem(key);
    if (!raw) {
      inspectedKeys.push({
        storageKey: key,
        label: 'Nómina de Estudiantes',
        present: false,
        sizeBytes: 0,
        validSchema: true,
        missingFields: [],
        details: 'No almacenado en caché local (usa datos iniciales/servidor)'
      });
    } else {
      const sizeBytes = raw.length * 2;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        const missing = ['Array<StudentRecord>'];
        pushIssue(key, 'error', 'El caché de estudiantes no es un arreglo válido.', missing);
        inspectedKeys.push({
          storageKey: key,
          label: 'Nómina de Estudiantes',
          present: true,
          sizeBytes,
          validSchema: false,
          missingFields: missing,
          details: 'Estructura corrupta (no es arreglo)'
        });
      } else {
        const requiredFields = ['id', 'nombre', 'codigoAcceso', 'intentosUsados', 'suspendido'];
        const missingSet = new Set<string>();
        parsed.forEach((item: any) => {
          if (!item || typeof item !== 'object') {
            missingSet.add('StudentRecord_object');
            return;
          }
          requiredFields.forEach((f) => {
            if (item[f] === undefined || item[f] === null) {
              missingSet.add(f);
            }
          });
        });
        const missingFields = Array.from(missingSet);
        const validSchema = missingFields.length === 0;
        if (!validSchema) {
          pushIssue(
            key,
            'error',
            `Faltan campos clave en registros de estudiantes en caché (${missingFields.join(', ')}).`,
            missingFields
          );
        }
        inspectedKeys.push({
          storageKey: key,
          label: 'Nómina de Estudiantes',
          present: true,
          sizeBytes,
          validSchema,
          recordsCount: parsed.length,
          missingFields,
          details: validSchema
            ? `${parsed.length} estudiantes con esquema completo`
            : `Faltan campos: ${missingFields.join(', ')}`
        });
      }
    }
  } catch (err: any) {
    pushIssue(
      'evaluaplus_students_v2',
      'error',
      `Error de sintaxis JSON en caché de estudiantes: ${err?.message || 'JSON inválido'}`,
      ['JSON_parse']
    );
  }

  // 3. Inspect Questions ('evaluaplus_questions_v3_unificado_2026')
  try {
    const key = 'evaluaplus_questions_v3_unificado_2026';
    const raw = localStorage.getItem(key);
    if (!raw) {
      inspectedKeys.push({
        storageKey: key,
        label: 'Banco de Preguntas',
        present: false,
        sizeBytes: 0,
        validSchema: true,
        missingFields: [],
        details: 'No almacenado en caché local (usa banco del servidor)'
      });
    } else {
      const sizeBytes = raw.length * 2;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        const missing = ['Array<Question>'];
        pushIssue(key, 'error', 'El caché del banco de preguntas no es un arreglo válido.', missing);
        inspectedKeys.push({
          storageKey: key,
          label: 'Banco de Preguntas',
          present: true,
          sizeBytes,
          validSchema: false,
          missingFields: missing,
          details: 'Estructura corrupta (no es arreglo)'
        });
      } else {
        const missingSet = new Set<string>();
        parsed.slice(0, 50).forEach((q: any) => {
          if (!q || typeof q !== 'object') {
            missingSet.add('Question_object');
            return;
          }
          if (!q.id) missingSet.add('id');
          if (q.modulo === undefined) missingSet.add('modulo');
          if (!q.enunciado && !q.pregunta) missingSet.add('enunciado');
          if (!q.opciones || typeof q.opciones !== 'object') missingSet.add('opciones');
          if (q.correcta === undefined) missingSet.add('correcta');
        });
        const missingFields = Array.from(missingSet);
        const validSchema = missingFields.length === 0;
        if (!validSchema) {
          pushIssue(
            key,
            'error',
            `Faltan campos clave en reactivos del banco en caché (${missingFields.join(', ')}).`,
            missingFields
          );
        }
        inspectedKeys.push({
          storageKey: key,
          label: 'Banco de Preguntas',
          present: true,
          sizeBytes,
          validSchema,
          recordsCount: parsed.length,
          missingFields,
          details: validSchema
            ? `${parsed.length} preguntas con esquema válido`
            : `Faltan campos: ${missingFields.join(', ')}`
        });
      }
    }
  } catch (err: any) {
    pushIssue(
      'evaluaplus_questions_v3_unificado_2026',
      'error',
      `Error de sintaxis JSON en caché de preguntas: ${err?.message || 'JSON inválido'}`,
      ['JSON_parse']
    );
  }

  // 4. Inspect SystemConfig ('evaluaplus_config_v2')
  try {
    const key = 'evaluaplus_config_v2';
    const raw = localStorage.getItem(key);
    if (!raw) {
      inspectedKeys.push({
        storageKey: key,
        label: 'Configuración del Sistema y Curso',
        present: false,
        sizeBytes: 0,
        validSchema: true,
        missingFields: [],
        details: 'No almacenado en caché local (usa configuración por defecto)'
      });
    } else {
      const sizeBytes = raw.length * 2;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        const missing = ['SystemConfig_object'];
        pushIssue(key, 'error', 'El caché de configuración no es un objeto válido.', missing);
        inspectedKeys.push({
          storageKey: key,
          label: 'Configuración del Sistema y Curso',
          present: true,
          sizeBytes,
          validSchema: false,
          missingFields: missing,
          details: 'Estructura corrupta'
        });
      } else {
        const requiredConfigKeys = [
          'idDocente',
          'claveDocente',
          'pinAulaDia',
          'notaMinimaAprobacion',
          'preguntasExamenIntegral',
          'preguntasExamenModulo'
        ];
        const missingFields = requiredConfigKeys.filter(
          (k) => parsed[k] === undefined || parsed[k] === null
        );
        // Also validate universalCourseConfig modules if present
        if (
          parsed.universalCourseConfig &&
          Array.isArray(parsed.universalCourseConfig.modulosCurso)
        ) {
          const anyModMissingWeights = parsed.universalCourseConfig.modulosCurso.some(
            (m: any) =>
              !m ||
              typeof m.id !== 'number' ||
              (m.ponderacion === undefined &&
                m.ponderacionExamenPct === undefined &&
                m.examenesCount === undefined &&
                m.cantidadExamenes === undefined)
          );
          if (anyModMissingWeights) {
            missingFields.push('modulosCurso.ponderacion');
          }
        }
        const validSchema = missingFields.length === 0;
        if (!validSchema) {
          pushIssue(
            key,
            'warning',
            `El caché de configuración proviene de una versión anterior sin campos clave (${missingFields.join(', ')}).`,
            missingFields,
            true
          );
        }
        inspectedKeys.push({
          storageKey: key,
          label: 'Configuración del Sistema y Curso',
          present: true,
          sizeBytes,
          validSchema,
          recordsCount: Object.keys(parsed).length,
          missingFields,
          details: validSchema
            ? `${Object.keys(parsed).length} propiedades verificadas`
            : `Faltan campos: ${missingFields.join(', ')}`
        });
      }
    }
  } catch (err: any) {
    pushIssue(
      'evaluaplus_config_v2',
      'error',
      `Error de sintaxis JSON en caché de configuración: ${err?.message || 'JSON inválido'}`,
      ['JSON_parse'],
      true
    );
  }

  // 5. Inspect Academic Dataset ('evaluaplus_academic_class_dataset_v1')
  try {
    const key = 'evaluaplus_academic_class_dataset_v1';
    const raw = localStorage.getItem(key);
    if (!raw) {
      inspectedKeys.push({
        storageKey: key,
        label: 'Asistencia y Notas de Clases (C1–C6)',
        present: false,
        sizeBytes: 0,
        validSchema: true,
        missingFields: [],
        details: 'No almacenado en caché local'
      });
    } else {
      const sizeBytes = raw.length * 2;
      const parsed = JSON.parse(raw);
      const missingFields: string[] = [];
      if (!parsed || typeof parsed !== 'object') {
        missingFields.push('AcademicDataset_object');
      } else {
        const hasRecords =
          Array.isArray(parsed.records) ||
          Boolean(parsed.recordsByStudentId && typeof parsed.recordsByStudentId === 'object');
        if (!hasRecords) {
          missingFields.push('records');
        }
        if (!parsed.lastUpdatedIso && !parsed.updatedAtIso) {
          missingFields.push('lastUpdatedIso');
        }
      }
      const validSchema = missingFields.length === 0;
      if (!validSchema) {
        pushIssue(
          key,
          'error',
          `Esquema incompleto en dataset académico de clases (${missingFields.join(', ')}).`,
          missingFields,
          true
        );
      }
      const recordsLen = Array.isArray(parsed?.records)
        ? parsed.records.length
        : parsed && parsed.recordsByStudentId
          ? Object.keys(parsed.recordsByStudentId).length
          : 0;
      inspectedKeys.push({
        storageKey: key,
        label: 'Asistencia y Notas de Clases (C1–C6)',
        present: true,
        sizeBytes,
        validSchema,
        recordsCount: recordsLen,
        missingFields,
        details: validSchema
          ? `${recordsLen} registros estudiantiles`
          : `Faltan campos: ${missingFields.join(', ')}`
      });
    }
  } catch (err: any) {
    pushIssue(
      'evaluaplus_academic_class_dataset_v1',
      'error',
      `Error de sintaxis JSON en dataset académico: ${err?.message || 'JSON inválido'}`,
      ['JSON_parse'],
      true
    );
  }

  // 6. Inspect Attempts ('evaluaplus_attempts_v2')
  try {
    const key = 'evaluaplus_attempts_v2';
    const raw = localStorage.getItem(key);
    if (!raw) {
      inspectedKeys.push({
        storageKey: key,
        label: 'Intentos de Exámenes Calificados',
        present: false,
        sizeBytes: 0,
        validSchema: true,
        missingFields: [],
        details: 'Sin intentos en caché local'
      });
    } else {
      const sizeBytes = raw.length * 2;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        const missing = ['Array<ExamAttemptResult>'];
        pushIssue(key, 'error', 'El caché de intentos de examen no es un arreglo.', missing);
        inspectedKeys.push({
          storageKey: key,
          label: 'Intentos de Exámenes Calificados',
          present: true,
          sizeBytes,
          validSchema: false,
          missingFields: missing,
          details: 'Estructura corrupta'
        });
      } else {
        const missingSet = new Set<string>();
        parsed.forEach((att: any) => {
          if (!att || typeof att !== 'object') {
            missingSet.add('ExamAttemptResult_object');
            return;
          }
          if (!att.attemptId) missingSet.add('attemptId');
          if (!att.studentId) missingSet.add('studentId');
          if (typeof att.notaColombiana !== 'number') missingSet.add('notaColombiana');
        });
        const missingFields = Array.from(missingSet);
        const validSchema = missingFields.length === 0;
        if (!validSchema) {
          pushIssue(
            key,
            'error',
            `Faltan campos clave en intentos de examen en caché (${missingFields.join(', ')}).`,
            missingFields
          );
        }
        inspectedKeys.push({
          storageKey: key,
          label: 'Intentos de Exámenes Calificados',
          present: true,
          sizeBytes,
          validSchema,
          recordsCount: parsed.length,
          missingFields,
          details: validSchema
            ? `${parsed.length} entregas verificadas`
            : `Faltan campos: ${missingFields.join(', ')}`
        });
      }
    }
  } catch (err: any) {
    pushIssue(
      'evaluaplus_attempts_v2',
      'error',
      `Error de sintaxis JSON en intentos de examen: ${err?.message || 'JSON inválido'}`,
      ['JSON_parse']
    );
  }

  // If there is existing cached data AND either issues were found OR schema version is outdated/missing when issues exist
  const hasAnyCachedData = inspectedKeys.some((k) => k.present);
  if (hasAnyCachedData && detectedVersion && detectedVersion !== CURRENT_DATA_SCHEMA_VERSION) {
    pushIssue(
      SCHEMA_VERSION_STORAGE_KEY,
      'warning',
      `Versión de esquema local (${detectedVersion}) distinta a la versión actual de la aplicación (${CURRENT_DATA_SCHEMA_VERSION}).`,
      ['schemaVersion']
    );
  } else if (hasAnyCachedData && !detectedVersion && issues.length === 0) {
    // Stamp current version if all existing cached keys passed key-field inspection
    try {
      localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, CURRENT_DATA_SCHEMA_VERSION);
      detectedVersion = CURRENT_DATA_SCHEMA_VERSION;
    } catch {
      // ignore
    }
  } else if (!hasAnyCachedData) {
    try {
      localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, CURRENT_DATA_SCHEMA_VERSION);
      detectedVersion = CURRENT_DATA_SCHEMA_VERSION;
    } catch {
      // ignore
    }
  }

  if (shouldRecord && issues.length > 0) {
    savePersistedCacheErrors(cacheErrorLogs);
  }

  const report: SchemaValidationReport = {
    isValid: issues.length === 0,
    requiresPreventiveClean: issues.length > 0,
    detectedVersion,
    expectedVersion: CURRENT_DATA_SCHEMA_VERSION,
    checkedAtFormatted: nowFormatted,
    totalStorageBytes,
    inspectedKeys,
    issues
  };

  latestSchemaReport = report;
  notifyListeners();
  return report;
}

export function stampCurrentSchemaVersion() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, CURRENT_DATA_SCHEMA_VERSION);
    validateLocalCacheSchema({ recordIssuesToLog: false });
  } catch {
    // ignore
  }
}
