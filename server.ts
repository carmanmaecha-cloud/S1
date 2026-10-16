import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import type {
  StudentRecord,
  Question,
  ExamAttemptResult,
  LiveClassroomSession,
  ABProProjectEvaluation,
  SystemConfig,
  CustomMiniRetoTemplate
} from './src/types.ts';
import { INITIAL_STUDENTS } from './src/data/students.ts';
import {
  INITIAL_QUESTIONS,
  normalizeQuestionList,
  equalizeQuestionPsychometrics,
  equalizeQuestionBank
} from './src/data/questions.ts';
import {
  INITIAL_CUSTOM_MINI_RETOS,
  getDefaultRetoProgress
} from './src/utils/miniRetosEngine.ts';
import {
  enrichStudentsWithServerSummary,
  computeStudentServerSummary
} from './src/utils/academicServerSummary.ts';
import {
  saveCentralStateToFirestore,
  loadCentralStateFromFirestore,
  saveQuestionsSnapshotToFirestore,
  loadQuestionsSnapshotFromFirestore
} from './src/utils/cloudPersistence.ts';
import {
  AcademicDataset,
  buildInitialAcademicDataset,
  normalizeAndSyncAcademicDataset
} from './src/data/classAttendanceAndGrades.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? '/tmp/evaluaplus-data' : path.join(__dirname, 'data');
const CENTRAL_DB_PATH = path.join(DATA_DIR, 'evaluaplus-central-db.json');
const AUDIT_LOG_PATH = path.join(DATA_DIR, 'evaluaplus-save-audit.json');
const SNAPSHOT_DB_PATH = path.join(DATA_DIR, 'evaluaplus-questions-snapshot.json');

// Modular Shards for low-latency isolated persistence & indestructible editor database insurance
const SHARDS = {
  COURSES_CONFIG: path.join(DATA_DIR, 'courses_config.json'),
  STUDENTS: path.join(DATA_DIR, 'students.json'),
  QUESTIONS: path.join(DATA_DIR, 'questions.json'),
  ACADEMIC_DATASET: path.join(DATA_DIR, 'academic_dataset.json'),
  ATTEMPTS: path.join(DATA_DIR, 'attempts.json'),
  EDITOR_ROSTERS: path.join(DATA_DIR, 'editor_roster_databases.json'),
  EDITOR_QUESTION_BANKS: path.join(DATA_DIR, 'editor_question_banks.json'),
  COURSES_CATALOG: path.join(DATA_DIR, 'courses_catalog.json'),
  REGISTERED_TEACHERS: path.join(DATA_DIR, 'registered_teachers.json')
};

function saveShardToDisk(filePath: string, data: unknown): void {
  try {
    ensureDataDir();
    // Seguro automático: generar copia de respaldo previa (.backup)
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, `${filePath}.backup`);
      } catch {
        // ignore backup copy failure
      }
      // Candado estricto anti-vaciado accidental: si llega un array vacío pero el shard en disco tenía elementos, proteger los existentes
      if (Array.isArray(data) && data.length === 0) {
        try {
          const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (Array.isArray(existing) && existing.length > 0) {
            console.log(`[Seguro Anti-Reseteo] Conservando ${existing.length} elementos en ${path.basename(filePath)} contra vaciado accidental.`);
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    console.error(`Error saving shard ${path.basename(filePath)}:`, err);
  }
}

const REDIS_KEY_CENTRAL_DB = 'evaluaplus:central_db:v1';
const REDIS_KEY_SNAPSHOT = 'evaluaplus:questions_snapshot:v1';

function getUpstashConfig(): { url: string; token: string } | null {
  let url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.REDIS_REST_API_URL ||
    '';
  let token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    process.env.REDIS_REST_API_TOKEN ||
    '';

  if (!url || !token) {
    for (const [k, v] of Object.entries(process.env)) {
      if (!v) continue;
      if (!url && (k.endsWith('_REST_API_URL') || k.endsWith('_REDIS_REST_URL'))) {
        url = v;
      }
      if (!token && (k.endsWith('_REST_API_TOKEN') || k.endsWith('_REDIS_REST_TOKEN'))) {
        token = v;
      }
    }
  }

  const cleanUrl = url.replace(/\/+$/, '');
  if (cleanUrl && token) {
    return { url: cleanUrl, token };
  }
  return null;
}

async function loadFromUpstashRedis<T>(key: string): Promise<T | null> {
  const cfg = getUpstashConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.token}`
      }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data || !data.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : (data.result as T);
  } catch (err) {
    console.error(`Error reading ${key} from Upstash Redis:`, err);
    return null;
  }
}

async function saveToUpstashRedis(key: string, value: unknown): Promise<void> {
  const cfg = getUpstashConfig();
  if (!cfg) return;
  try {
    await fetch(`${cfg.url}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(['SET', key, JSON.stringify(value)])
    });
  } catch (err) {
    console.error(`Error saving ${key} to Upstash Redis:`, err);
  }
}

const DEFAULT_SERVER_CONFIG: SystemConfig = {
  examenAbierto: true,
  mensajeSalaEspera:
    'Atención grupo: El examen iniciará en breves minutos cuando todos los equipos del aula estén listos.',
  exigirPinAula: false,
  pinAulaDia: 'AULA26',
  retroalimentacionInmediata: true,
  mostrarDesglosePregunta: true,
  barajarOpciones: true,
  correoRecuperacion: 'fenixcor207@gmail.com',
  idDocente: 'DOCENTE2026',
  claveDocente: 'DOCENTE2026',
  webhookUrl: '',
  ponderacionTeoriaPct: 60,
  preguntasExamenIntegral: 40,
  tiempoExamenIntegralMin: 80,
  preguntasExamenModulo: 25,
  tiempoExamenModuloMin: 50,
  notaMinimaAprobacion: 3.0,
  exigirPantallaMaximizada: true,
  maxLlamadosAtencionGlobal: 1,
  llamadosAtencionPorEstudiante: {},
  antiTrampaExamenesActivo: true,
  examenBloquearCambioPestanaFoco: true,
  detectarCambioPestana: true,
  detectarMinimizarPestana: true,
  detectarCambioAplicacion: true,
  detectarSalidaPunteroDevToolsIA: true,
  detectarRafagaRespuestaRapidaIA: true,
  examenBloquearCopiaClicDerechoAtajos: true,
  examenExigirPantallaCompleta: true,
  ecualizadorPsicometricoActivo: true,
  antiTrampaMiniRetosActivo: true,
  retoBloquearCambioPestanaFoco: true,
  retoSuspenderCopiaPegadoInyeccion: true,
  retoBiometriaTecleoAntiCopia: true,
  retoExigirPantallaCompleta: true,
  miniRetosAbiertos: true,
  estudiantesSinMiniRetos: [],
  estudiantesModulosMiniRetosBloqueados: {},
  miniRetosSinRestriccionHora: true,
  miniRetosDiasPermitidos: [1, 2, 3, 4, 5, 6],
  miniRetosHoraInicio: '07:00',
  miniRetosHoraFin: '22:00',
  umbralAprobacionMiniRetoPct: 60
};

interface CentralDatabaseState {
  initialized: boolean;
  migratedFromClient: boolean;
  emptyInitialV3Reset?: boolean;
  revision: number;
  questionsRevision: number;
  lastModifiedIso: string;
  questionsBankExplicitlyCleared: boolean;
  studentsExplicitlyCleared?: boolean;
  students: StudentRecord[];
  questions: Question[];
  attempts: ExamAttemptResult[];
  abproEvaluations: ABProProjectEvaluation[];
  liveSessions: LiveClassroomSession[];
  config: SystemConfig;
  customMiniRetos: CustomMiniRetoTemplate[];
  activeExamsByStudent: Record<string, any>;
  academicDataset?: AcademicDataset;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

ensureDataDir();

function parseRawDbObject(parsed: any): CentralDatabaseState {
  // SEGURO ESTRICTO: Solo es explícitamente limpiado si viene estrictamente boolean true
  const explicitlyCleared = Boolean(parsed.questionsBankExplicitlyCleared === true);
  const studentsExplicitlyCleared = Boolean(parsed.studentsExplicitlyCleared === true);
  const loadedQuestions = Array.isArray(parsed.questions)
    ? parsed.questions.length > 0
      ? normalizeQuestionList(parsed.questions)
      : []
    : [];

  const rawStudents: StudentRecord[] = Array.isArray(parsed.students)
    ? parsed.students
    : [];
  const rawAttempts: ExamAttemptResult[] = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  const mergedConfig: SystemConfig = {
    ...DEFAULT_SERVER_CONFIG,
    ...(parsed.config || {}),
    studentRosterDatabases: Array.isArray(parsed.config?.studentRosterDatabases)
      ? parsed.config.studentRosterDatabases
      : [],
    questionBankDatabases: Array.isArray(parsed.config?.questionBankDatabases)
      ? parsed.config.questionBankDatabases
      : [],
    universalCoursesCatalog: Array.isArray(parsed.config?.universalCoursesCatalog)
      ? parsed.config.universalCoursesCatalog
      : [],
    registeredTeachers: Array.isArray(parsed.config?.registeredTeachers)
      ? parsed.config.registeredTeachers
      : []
  };
  const enrichedStudents = enrichStudentsWithServerSummary(
    rawStudents,
    rawAttempts,
    mergedConfig.notaMinimaAprobacion ?? 3.0
  );

  return {
    initialized: true,
    migratedFromClient: Boolean(parsed.migratedFromClient ?? true),
    emptyInitialV3Reset: false,
    revision: Number(parsed.revision) || 1,
    questionsRevision: Number(parsed.questionsRevision) || 1,
    lastModifiedIso: parsed.lastModifiedIso || new Date().toISOString(),
    questionsBankExplicitlyCleared: explicitlyCleared,
    studentsExplicitlyCleared,
    students: enrichedStudents,
    questions: loadedQuestions,
    attempts: rawAttempts,
    abproEvaluations: Array.isArray(parsed.abproEvaluations) ? parsed.abproEvaluations : [],
    liveSessions: Array.isArray(parsed.liveSessions) ? parsed.liveSessions : [],
    config: mergedConfig,
    customMiniRetos: Array.isArray(parsed.customMiniRetos)
      ? parsed.customMiniRetos
      : [],
    activeExamsByStudent:
      parsed.activeExamsByStudent && typeof parsed.activeExamsByStudent === 'object'
        ? parsed.activeExamsByStudent
        : {},
    academicDataset: normalizeAndSyncAcademicDataset(parsed.academicDataset, enrichedStudents)
  };
}

function loadCentralDbFromDisk(): CentralDatabaseState {
  ensureDataDir();
  let candidateDb: CentralDatabaseState | null = null;

  // 1. Intentar cargar desde CENTRAL_DB_PATH
  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      const raw = fs.readFileSync(CENTRAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        candidateDb = parseRawDbObject(parsed);
      }
    }
  } catch (err) {
    console.error('Error loading central DB from disk, inspecting backup:', err);
    try {
      const backupPath = `${CENTRAL_DB_PATH}.backup`;
      if (fs.existsSync(backupPath)) {
        const rawBkp = fs.readFileSync(backupPath, 'utf-8');
        const parsedBkp = JSON.parse(rawBkp);
        if (parsedBkp && typeof parsedBkp === 'object') {
          candidateDb = parseRawDbObject(parsedBkp);
          console.log('✓ Estado recuperado con éxito desde copia de respaldo .backup');
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. SEGURO ANTI-REINICIO: Inspeccionar shards modulares del Editor para que NUNCA se pierda nada
  let shardRosters: StudentRosterDatabaseEntry[] = [];
  let shardQuestionBanks: QuestionBankDatabaseEntry[] = [];
  let shardCatalog: UniversalCourseWorkspace[] = [];
  let shardTeachers: TeacherAccountRecord[] = [];
  let shardStudents: StudentRecord[] = [];
  let shardQuestions: Question[] = [];
  let shardDataset: AcademicDataset = buildInitialAcademicDataset([]);
  let shardAttempts: ExamAttemptResult[] = [];
  let shardConfig = candidateDb?.config || DEFAULT_SERVER_CONFIG;

  try {
    if (fs.existsSync(SHARDS.EDITOR_ROSTERS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.EDITOR_ROSTERS, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardRosters = p;
    }
    if (fs.existsSync(SHARDS.EDITOR_QUESTION_BANKS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.EDITOR_QUESTION_BANKS, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardQuestionBanks = p;
    }
    if (fs.existsSync(SHARDS.COURSES_CATALOG)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.COURSES_CATALOG, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardCatalog = p;
    }
    if (fs.existsSync(SHARDS.REGISTERED_TEACHERS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.REGISTERED_TEACHERS, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardTeachers = p;
    }
    if (fs.existsSync(SHARDS.COURSES_CONFIG)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.COURSES_CONFIG, 'utf-8'));
      if (p && typeof p === 'object') shardConfig = { ...DEFAULT_SERVER_CONFIG, ...p };
    }
    if (fs.existsSync(SHARDS.STUDENTS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.STUDENTS, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardStudents = p;
    }
    if (fs.existsSync(SHARDS.QUESTIONS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.QUESTIONS, 'utf-8'));
      if (Array.isArray(p) && p.length > 0) shardQuestions = normalizeQuestionList(p);
    }
    if (fs.existsSync(SHARDS.ACADEMIC_DATASET)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.ACADEMIC_DATASET, 'utf-8'));
      if (p && typeof p === 'object') shardDataset = p;
    }
    if (fs.existsSync(SHARDS.ATTEMPTS)) {
      const p = JSON.parse(fs.readFileSync(SHARDS.ATTEMPTS, 'utf-8'));
      if (Array.isArray(p)) shardAttempts = p;
    }
  } catch (shardErr) {
    console.warn('Advertencia al inspeccionar shards:', shardErr);
  }

  // 3. FUSIÓN Y CONSOLIDACIÓN BLINDADA (CANDADO ANTI-RESETEO DEL EDITOR):
  // Combinar por identificadores únicos para que NUNCA se descarte ninguna base de datos del editor
  const rosterMap = new Map<string, StudentRosterDatabaseEntry>();
  (shardRosters || []).forEach((r) => { if (r && r.id) rosterMap.set(r.id, r); });
  (candidateDb?.config?.studentRosterDatabases || []).forEach((r) => { if (r && r.id) rosterMap.set(r.id, r); });
  const mergedRosters = Array.from(rosterMap.values());

  const bankMap = new Map<string, QuestionBankDatabaseEntry>();
  (shardQuestionBanks || []).forEach((b) => { if (b && b.id) bankMap.set(b.id, b); });
  (candidateDb?.config?.questionBankDatabases || []).forEach((b) => { if (b && b.id) bankMap.set(b.id, b); });
  const mergedBanks = Array.from(bankMap.values());

  const catalogMap = new Map<string, UniversalCourseWorkspace>();
  (shardCatalog || []).forEach((c) => { if (c && c.meta?.courseId) catalogMap.set(c.meta.courseId, c); });
  (candidateDb?.config?.universalCoursesCatalog || []).forEach((c) => { if (c && c.meta?.courseId) catalogMap.set(c.meta.courseId, c); });
  const mergedCatalog = Array.from(catalogMap.values());

  const teacherMap = new Map<string, TeacherAccountRecord>();
  (shardTeachers || []).forEach((t) => { if (t && t.id) teacherMap.set(t.id, t); });
  (candidateDb?.config?.registeredTeachers || []).forEach((t) => { if (t && t.id) teacherMap.set(t.id, t); });
  const mergedTeachers = Array.from(teacherMap.values());

  if (candidateDb) {
    candidateDb.config = {
      ...candidateDb.config,
      studentRosterDatabases: mergedRosters,
      questionBankDatabases: mergedBanks,
      universalCoursesCatalog: mergedCatalog,
      registeredTeachers: mergedTeachers
    };

    if (candidateDb.students.length === 0 && shardStudents.length > 0) {
      candidateDb.students = shardStudents;
    }
    if (candidateDb.questions.length === 0 && shardQuestions.length > 0) {
      candidateDb.questions = shardQuestions;
    }

    return candidateDb;
  }

  // 4. Si no existía base central previa, construir con lo que esté en los shards modulares
  const initialDb: CentralDatabaseState = {
    initialized: true,
    migratedFromClient: true,
    emptyInitialV3Reset: false,
    revision: 100,
    questionsRevision: 100,
    lastModifiedIso: new Date().toISOString(),
    questionsBankExplicitlyCleared: false,
    studentsExplicitlyCleared: false,
    students: shardStudents,
    questions: shardQuestions,
    attempts: shardAttempts,
    abproEvaluations: [],
    liveSessions: [],
    config: {
      ...shardConfig,
      studentRosterDatabases: mergedRosters,
      questionBankDatabases: mergedBanks,
      universalCoursesCatalog: mergedCatalog,
      registeredTeachers: mergedTeachers
    },
    customMiniRetos: [],
    activeExamsByStudent: {},
    academicDataset: normalizeAndSyncAcademicDataset(shardDataset, shardStudents)
  };

  saveCentralDbToDisk(initialDb, 'AutoSync', 'Inicialización blindada contra reinicios');
  return initialDb;
}

function saveCentralDbToDisk(
  db: CentralDatabaseState,
  section = 'AutoSync',
  description = 'Sincronización con base de datos del servidor',
  options: { includeQuestions?: boolean; syncCloud?: boolean } = {
    includeQuestions: false,
    syncCloud: true
  }
): void {
  ensureDataDir();

  // CANDADO SEGURO ANTI-BORRADO ACCIDENTAL:
  // Si en el archivo físico existente ya había estudiantes o cursos o bancos de preguntas creados por el editor,
  // y por alguna razón accidental llega un payload vacío sin ser un borrado explícito solicitado, conservar los existentes.
  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      const existingRaw = JSON.parse(fs.readFileSync(CENTRAL_DB_PATH, 'utf-8'));
      if (existingRaw && typeof existingRaw === 'object') {
        if (
          Array.isArray(existingRaw.students) &&
          existingRaw.students.length > 0 &&
          (!Array.isArray(db.students) || db.students.length === 0) &&
          !db.studentsExplicitlyCleared
        ) {
          db.students = existingRaw.students;
        }
        if (
          Array.isArray(existingRaw.questions) &&
          existingRaw.questions.length > 0 &&
          (!Array.isArray(db.questions) || db.questions.length === 0) &&
          !db.questionsBankExplicitlyCleared
        ) {
          db.questions = existingRaw.questions;
        }
        // Proteger colecciones del Editor
        const prevCfg = existingRaw.config || {};
        if (
          Array.isArray(prevCfg.studentRosterDatabases) &&
          prevCfg.studentRosterDatabases.length > 0 &&
          (!Array.isArray(db.config?.studentRosterDatabases) || db.config.studentRosterDatabases.length === 0)
        ) {
          db.config.studentRosterDatabases = prevCfg.studentRosterDatabases;
        }
        if (
          Array.isArray(prevCfg.questionBankDatabases) &&
          prevCfg.questionBankDatabases.length > 0 &&
          (!Array.isArray(db.config?.questionBankDatabases) || db.config.questionBankDatabases.length === 0)
        ) {
          db.config.questionBankDatabases = prevCfg.questionBankDatabases;
        }
        if (
          Array.isArray(prevCfg.universalCoursesCatalog) &&
          prevCfg.universalCoursesCatalog.length > 0 &&
          (!Array.isArray(db.config?.universalCoursesCatalog) || db.config.universalCoursesCatalog.length === 0)
        ) {
          db.config.universalCoursesCatalog = prevCfg.universalCoursesCatalog;
        }
      }
    }
  } catch {
    // ignore
  }

  // Generar copia de respaldo física (.backup) antes de cada sobrescritura
  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      fs.copyFileSync(CENTRAL_DB_PATH, `${CENTRAL_DB_PATH}.backup`);
    }
  } catch {
    // ignore
  }

  // Always keep every student's server academic summary up-to-date
  db.students = enrichStudentsWithServerSummary(
    db.students,
    db.attempts,
    db.config?.notaMinimaAprobacion ?? 3.0
  );
  const serialized = JSON.stringify(db, null, 2);
  try {
    const tmpPath = `${CENTRAL_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, CENTRAL_DB_PATH);
  } catch (err) {
    console.error('Error saving central DB to disk:', err);
  }

  // Persistir shards modulares inmediatamente
  try {
    if (db.config) {
      saveShardToDisk(SHARDS.COURSES_CONFIG, db.config);
      if (Array.isArray(db.config.studentRosterDatabases)) {
        saveShardToDisk(SHARDS.EDITOR_ROSTERS, db.config.studentRosterDatabases);
      }
      if (Array.isArray(db.config.questionBankDatabases)) {
        saveShardToDisk(SHARDS.EDITOR_QUESTION_BANKS, db.config.questionBankDatabases);
      }
      if (Array.isArray(db.config.universalCoursesCatalog)) {
        saveShardToDisk(SHARDS.COURSES_CATALOG, db.config.universalCoursesCatalog);
      }
      if (Array.isArray(db.config.registeredTeachers)) {
        saveShardToDisk(SHARDS.REGISTERED_TEACHERS, db.config.registeredTeachers);
      }
    }
    if (db.students) saveShardToDisk(SHARDS.STUDENTS, db.students);
    if ((options.includeQuestions || (db.questions && db.questions.length > 0)) && db.questions) {
      saveShardToDisk(SHARDS.QUESTIONS, db.questions);
    }
    if (db.academicDataset) saveShardToDisk(SHARDS.ACADEMIC_DATASET, db.academicDataset);
    if (db.attempts) saveShardToDisk(SHARDS.ATTEMPTS, db.attempts);
  } catch (err) {
    console.error('Error writing modular shards to disk:', err);
  }

  if (section !== 'AutoSync') {
    try {
      let existingLogs: any[] = [];
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        existingLogs = JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf-8')) || [];
      }
      const nextLogs = [
        {
          section,
          description,
          revision: db.revision,
          saved_at: db.lastModifiedIso
        },
        ...existingLogs.slice(0, 199)
      ];
      fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(nextLogs, null, 2), 'utf-8');
    } catch {
      // ignore audit log errors
    }
  }

  // Non-blocking detached cloud synchronization in the background
  if (options.syncCloud !== false) {
    Promise.resolve().then(async () => {
      try {
        await saveToUpstashRedis(REDIS_KEY_CENTRAL_DB, db);
        await saveCentralStateToFirestore(db, {
          includeQuestions: Boolean(options.includeQuestions)
        });
      } catch (cloudErr) {
        console.warn('Background cloud sync warning (non-fatal):', cloudErr);
      }
    });
  }
}

function loadQuestionsSnapshotFromDisk(): Question[] | null {
  ensureDataDir();
  try {
    if (fs.existsSync(SNAPSHOT_DB_PATH)) {
      const raw = fs.readFileSync(SNAPSHOT_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveQuestionsSnapshotToDisk(snapshot: Question[] | null): void {
  ensureDataDir();
  try {
    if (!snapshot || snapshot.length === 0) {
      if (fs.existsSync(SNAPSHOT_DB_PATH)) {
        fs.unlinkSync(SNAPSHOT_DB_PATH);
      }
      void saveToUpstashRedis(REDIS_KEY_SNAPSHOT, []);
      void saveQuestionsSnapshotToFirestore(null, centralDb?.questionsRevision || 1);
      return;
    }
    const tmpPath = `${SNAPSHOT_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot), 'utf-8');
    fs.renameSync(tmpPath, SNAPSHOT_DB_PATH);
    void saveToUpstashRedis(REDIS_KEY_SNAPSHOT, snapshot);
    void saveQuestionsSnapshotToFirestore(snapshot, centralDb?.questionsRevision || 1);
  } catch (err) {
    console.error('Error saving questions snapshot to disk:', err);
  }
}

/**
 * CRITICAL BACKEND PERSISTENCE RECONCILIATION:
 * Compara las marcas de tiempo (timestamps) de los archivos locales de base de datos
 * con los registros autoritativos en Firestore.
 * Si un archivo local está vacío, no existe o fue recién creado (o si Firestore tiene
 * datos más recientes o mayor revisión), el sistema prioriza la carga de la última
 * versión válida de los datos desde Firestore para evitar el reseteo involuntario
 * al iniciar o reiniciar el servidor.
 */
export async function reconcileDatabaseWithFirestoreTimestampComparison(): Promise<{
  action: 'PRIORITIZED_FIRESTORE' | 'KEPT_LOCAL_HYDRATED' | 'LOCAL_NEWER_SAVED_TO_CLOUD' | 'NO_CLOUD_RECORD';
  localTimestamp?: string;
  cloudTimestamp?: string;
  localRevision: number;
  cloudRevision?: number;
  reason: string;
}> {
  ensureDataDir();

  // 1. Metadatos del archivo físico central local
  let localStat: fs.Stats | null = null;
  let localMtimeMs = 0;
  let localIso = '';
  let localRevision = Number(centralDb.revision) || 0;
  let localStudentsCount = Array.isArray(centralDb.students) ? centralDb.students.length : 0;
  let localQuestionsCount = Array.isArray(centralDb.questions) ? centralDb.questions.length : 0;
  let localCoursesCount = Array.isArray(centralDb.config?.universalCoursesCatalog)
    ? centralDb.config.universalCoursesCatalog.length
    : 0;
  let localRostersCount = Array.isArray(centralDb.config?.studentRosterDatabases)
    ? centralDb.config.studentRosterDatabases.length
    : 0;
  let localAttemptsCount = Array.isArray(centralDb.attempts) ? centralDb.attempts.length : 0;

  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      localStat = fs.statSync(CENTRAL_DB_PATH);
      localMtimeMs = Math.max(localMtimeMs, localStat.mtimeMs);
      localIso = localStat.mtime.toISOString();
      if (localStat.size > 20) {
        const raw = fs.readFileSync(CENTRAL_DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localRevision = Number(parsed.revision) || localRevision;
          if (parsed.lastModifiedIso) {
            localIso = parsed.lastModifiedIso;
          }
          localStudentsCount = Array.isArray(parsed.students) ? parsed.students.length : localStudentsCount;
          localQuestionsCount = Array.isArray(parsed.questions) ? parsed.questions.length : localQuestionsCount;
          localCoursesCount = Array.isArray(parsed.config?.universalCoursesCatalog)
            ? parsed.config.universalCoursesCatalog.length
            : localCoursesCount;
          localRostersCount = Array.isArray(parsed.config?.studentRosterDatabases)
            ? parsed.config.studentRosterDatabases.length
            : localRostersCount;
          localAttemptsCount = Array.isArray(parsed.attempts) ? parsed.attempts.length : localAttemptsCount;
        }
      }
    }

    // Inspeccionar también todos los archivos locales modulares (shards)
    const shardEntries = [
      { path: SHARDS.STUDENTS, key: 'students' },
      { path: SHARDS.COURSES_CONFIG, key: 'config' },
      { path: SHARDS.QUESTIONS, key: 'questions' },
      { path: SHARDS.ACADEMIC_DATASET, key: 'academicDataset' },
      { path: SHARDS.ATTEMPTS, key: 'attempts' },
      { path: SHARDS.EDITOR_ROSTERS, key: 'rosters' },
      { path: SHARDS.EDITOR_QUESTION_BANKS, key: 'banks' },
      { path: SHARDS.COURSES_CATALOG, key: 'catalog' }
    ];

    for (const shard of shardEntries) {
      if (fs.existsSync(shard.path)) {
        try {
          const sStat = fs.statSync(shard.path);
          if (sStat.mtimeMs > localMtimeMs) {
            localMtimeMs = sStat.mtimeMs;
            localIso = sStat.mtime.toISOString();
          }
          if (sStat.size > 15) {
            const rawShard = fs.readFileSync(shard.path, 'utf-8');
            const parsedShard = JSON.parse(rawShard);
            if (shard.key === 'students' && Array.isArray(parsedShard)) {
              localStudentsCount = Math.max(localStudentsCount, parsedShard.length);
            } else if (shard.key === 'questions' && Array.isArray(parsedShard)) {
              localQuestionsCount = Math.max(localQuestionsCount, parsedShard.length);
            } else if (shard.key === 'attempts' && Array.isArray(parsedShard)) {
              localAttemptsCount = Math.max(localAttemptsCount, parsedShard.length);
            } else if (shard.key === 'rosters' && Array.isArray(parsedShard)) {
              localRostersCount = Math.max(localRostersCount, parsedShard.length);
            } else if (shard.key === 'catalog' && Array.isArray(parsedShard)) {
              localCoursesCount = Math.max(localCoursesCount, parsedShard.length);
            }
          }
        } catch {
          // ignore corrupted individual shard read during check
        }
      }
    }
  } catch (err) {
    console.warn('[Reconciliation] Error inspeccionando archivo local central y shards:', err);
  }

  // Verificar si el archivo local está vacío, no existe, o fue recién creado sin datos válidos
  const fileAgeMinutes = localStat ? (Date.now() - localStat.mtimeMs) / (1000 * 60) : 999999;
  const localHasZeroData =
    localStudentsCount === 0 &&
    localCoursesCount === 0 &&
    localAttemptsCount === 0 &&
    localRostersCount === 0;

  const isLocalEmptyOrNewlyCreated =
    !localStat ||
    localStat.size < 60 ||
    (fileAgeMinutes < 60 && localHasZeroData) ||
    localHasZeroData;

  // 2. Consultar el registro autoritativo en Firestore
  let cloudState: any = null;
  try {
    cloudState = await loadCentralStateFromFirestore({ includeQuestions: true });
  } catch (fErr) {
    console.warn('[Reconciliation] Error al leer Firestore para reconciliación:', fErr);
  }

  if (!cloudState || typeof cloudState !== 'object') {
    return {
      action: 'NO_CLOUD_RECORD',
      localTimestamp: localIso,
      localRevision,
      reason: 'No hay registros en Firestore o la conexión aún no está lista.'
    };
  }

  const cloudRevision = Number(cloudState.revision) || 0;
  const cloudIso = cloudState.lastModifiedIso || cloudState.updatedIso || '';
  const cloudTimeMs = cloudIso ? new Date(cloudIso).getTime() : 0;
  const cloudStudentsCount = Array.isArray(cloudState.students) ? cloudState.students.length : 0;
  const cloudQuestionsCount = Array.isArray(cloudState.questions) ? cloudState.questions.length : 0;
  const cloudCoursesCount = Array.isArray(cloudState.config?.universalCoursesCatalog)
    ? cloudState.config.universalCoursesCatalog.length
    : 0;
  const cloudRostersCount = Array.isArray(cloudState.config?.studentRosterDatabases)
    ? cloudState.config.studentRosterDatabases.length
    : 0;
  const cloudAttemptsCount = Array.isArray(cloudState.attempts) ? cloudState.attempts.length : 0;

  const hasValidCloudData =
    cloudStudentsCount > 0 ||
    cloudCoursesCount > 0 ||
    cloudAttemptsCount > 0 ||
    cloudRostersCount > 0 ||
    cloudQuestionsCount > 0 ||
    cloudRevision > 1;

  // 3. Comparación de marcas temporales y decisión de prioridad
  // Regla crítica: Si el archivo local está vacío/recién creado y la nube tiene datos,
  // O si el timestamp de Firestore es más reciente que el archivo local,
  // O si la revisión de Firestore es superior,
  // O si local tiene 0 datos mientras la nube tiene registros válidos:
  // -> PRIORIZAR FIRESTORE
  const shouldPrioritizeFirestore =
    (isLocalEmptyOrNewlyCreated && hasValidCloudData) ||
    (localHasZeroData && hasValidCloudData) ||
    cloudTimeMs > localMtimeMs ||
    cloudRevision > localRevision;

  if (shouldPrioritizeFirestore) {
    const reasonMsg = isLocalEmptyOrNewlyCreated
      ? `Archivo local vacío o recién creado (${localStat?.size || 0}B, edad ${fileAgeMinutes.toFixed(1)}m). Priorizando última versión válida en Firestore.`
      : localHasZeroData && hasValidCloudData
      ? `Archivo local sin registros pero Firestore posee datos válidos (${cloudStudentsCount} est, ${cloudCoursesCount} cursos).`
      : cloudTimeMs > localMtimeMs
      ? `Timestamp de Firestore (${cloudIso}) es más reciente que el archivo local (${localIso}).`
      : `Revisión de Firestore (${cloudRevision}) es superior a la local (${localRevision}).`;

    console.log(
      `[CRITICAL_PERSISTENCE] 🛡️ PRIORIDAD FIRESTORE APLICADA: ${reasonMsg} -> Restaurando datos para prevenir reseteo involuntario al iniciar servidor.`
    );

    const parsedCloud = parseRawDbObject({
      ...cloudState,
      questions: cloudState.questions && cloudState.questions.length > 0 ? cloudState.questions : centralDb.questions,
      emptyInitialV3Reset: true
    });

    centralDb = parsedCloud;

    // Escribir inmediatamente a disco local y shards para que el servidor local quede sincronizado
    saveCentralDbToDisk(
      centralDb,
      'ReconciliationStartup',
      'Restauración prioritaria desde Firestore al iniciar el servidor (Anti-Reset)',
      { includeQuestions: true, syncCloud: false }
    );

    return {
      action: 'PRIORITIZED_FIRESTORE',
      localTimestamp: localIso,
      cloudTimestamp: cloudIso,
      localRevision,
      cloudRevision,
      reason: reasonMsg
    };
  } else {
    // Si el archivo local es válido, más reciente o igual a Firestore, conservar local y sincronizar hacia Firestore
    console.log(
      `[CRITICAL_PERSISTENCE] ✓ Archivo local verificado y vigente (Local: ${localIso}, Rev: ${localRevision}). Asegurando sincronización con Firestore.`
    );
    void saveCentralStateToFirestore(centralDb, { includeQuestions: false });

    return {
      action: 'KEPT_LOCAL_HYDRATED',
      localTimestamp: localIso,
      cloudTimestamp: cloudIso,
      localRevision,
      cloudRevision,
      reason: 'El archivo local es válido y su marca de tiempo es igual o más reciente que Firestore.'
    };
  }
}

let centralDb: CentralDatabaseState = loadCentralDbFromDisk();
let questionsSnapshotCache: Question[] | null = loadQuestionsSnapshotFromDisk();
let lastRedisSyncMs = 0;

// Reconciliación inmediata al cargar el servidor para garantizar que si los archivos locales
// están vacíos o recién creados, se cargue primero la última versión autoritativa desde Firestore
try {
  await reconcileDatabaseWithFirestoreTimestampComparison();
} catch (recStartupErr) {
  console.warn('[Startup] Advertencia en reconciliación inicial de Firestore:', recStartupErr);
}

async function syncFromUpstashIfConfigured(force = false): Promise<void> {
  const now = Date.now();
  if (!force && !IS_VERCEL && now - lastRedisSyncMs < 30000) return;
  lastRedisSyncMs = now;

  // 1. Sync from Permanent Cloud Firestore Database (Primary on Vercel & Multi-Instance)
  try {
    await reconcileDatabaseWithFirestoreTimestampComparison();
    const cloudState = await loadCentralStateFromFirestore({
      includeQuestions: force || !centralDb.migratedFromClient
    });
    if (cloudState && typeof cloudState === 'object') {
      const parsedCloud = parseRawDbObject({
        ...cloudState,
        questions: cloudState.questions ?? centralDb.questions
      });
      if (
        parsedCloud.revision > centralDb.revision ||
        (parsedCloud.revision === centralDb.revision && !centralDb.emptyInitialV3Reset)
      ) {
        centralDb = { ...parsedCloud, emptyInitialV3Reset: true };
      }
    }
    if (!questionsSnapshotCache && force) {
      const cloudSnap = await loadQuestionsSnapshotFromFirestore();
      if (Array.isArray(cloudSnap) && cloudSnap.length > 0) {
        questionsSnapshotCache = cloudSnap;
      }
    }
  } catch {
    // ignore transient Firestore read error
  }

  // 2. Sync from Upstash Redis if additionally configured
  if (!getUpstashConfig()) return;
  const remoteDb = await loadFromUpstashRedis<any>(REDIS_KEY_CENTRAL_DB);
  if (remoteDb && typeof remoteDb === 'object') {
    const parsedRemote = parseRawDbObject(remoteDb);
    if (
      force ||
      IS_VERCEL ||
      parsedRemote.revision >= centralDb.revision ||
      !centralDb.migratedFromClient
    ) {
      centralDb = parsedRemote;
    }
  }
  const remoteSnap = await loadFromUpstashRedis<Question[]>(REDIS_KEY_SNAPSHOT);
  if (Array.isArray(remoteSnap) && remoteSnap.length > 0) {
    questionsSnapshotCache = remoteSnap;
  }
}

void syncFromUpstashIfConfigured(true);

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable HTTP Gzip / Deflate response compression for ultra-fast payload transfer (>85% size reduction)
app.use(compression());

// Allow up to 50MB payloads for large question banks (1060+ questions) and full system backups
app.use(express.json({ limit: '50mb' }));

// Prevent browser/proxy caching on all centralized state API endpoints & sync with Upstash Redis if configured
app.use('/api/state', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const forceSync = req.query.force === 'true' || req.query.force === '1';
    if (forceSync && !getUpstashConfig()) {
      centralDb = loadCentralDbFromDisk();
      questionsSnapshotCache = loadQuestionsSnapshotFromDisk();
    }
    await syncFromUpstashIfConfigured(forceSync);
  } catch {
    // ignore transient Redis read error
  }
  next();
});

  // ============================================================================
  // CENTRALIZED SERVER PERSISTENCE & AUTOMATIC SYNC ENDPOINTS (/api/state/*)
  // ============================================================================

  // 1. GET /api/state — Fetch authoritative server state (always returns live data; only skips 740 questions when unchanged unless force=true)
  app.get('/api/state', (req, res) => {
    const forceFull = req.query.force === 'true' || req.query.force === '1';
    const clientRev = req.query.clientRevision !== undefined ? Number(req.query.clientRevision) : -1;
    const clientQRev =
      req.query.clientQuestionsRevision !== undefined
        ? Number(req.query.clientQuestionsRevision)
        : -1;

    // Automatically prune stale live sessions that have not sent a heartbeat in the last 120 seconds
    const nowMs = Date.now();
    const beforeCount = centralDb.liveSessions.length;
    centralDb.liveSessions = centralDb.liveSessions.filter(
      (s) => s && typeof s.ultimaActualizacionMs === 'number' && nowMs - s.ultimaActualizacionMs < 120000
    );
    if (centralDb.liveSessions.length !== beforeCount) {
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb, 'AutoSync', 'Depuración de sesiones en vivo inactivas', {
        includeQuestions: false,
        syncCloud: false
      });
    }

    const snapshotCount = questionsSnapshotCache ? questionsSnapshotCache.length : 0;
    const isUpToDate =
      !forceFull &&
      clientRev === centralDb.revision &&
      clientQRev === centralDb.questionsRevision;
    const includeQuestions = forceFull || clientQRev !== centralDb.questionsRevision;

    return res.json({
      upToDate: isUpToDate,
      revision: centralDb.revision,
      questionsRevision: centralDb.questionsRevision,
      lastModifiedIso: centralDb.lastModifiedIso,
      migratedFromClient: centralDb.migratedFromClient,
      questionsBankExplicitlyCleared: centralDb.questionsBankExplicitlyCleared,
      studentsExplicitlyCleared: Boolean(centralDb.studentsExplicitlyCleared),
      questionsCount: centralDb.questions.length,
      previousQuestionsSnapshotCount: snapshotCount,
      students: centralDb.students,
      ...(includeQuestions ? { questions: centralDb.questions } : {}),
      attempts: centralDb.attempts,
      abproEvaluations: centralDb.abproEvaluations,
      liveSessions: centralDb.liveSessions,
      config: centralDb.config,
      customMiniRetos: centralDb.customMiniRetos,
      activeExamsByStudent: centralDb.activeExamsByStudent,
      academicDataset: normalizeAndSyncAcademicDataset(
        centralDb.academicDataset,
        centralDb.students
      )
    });
  });

  // 1B. GET /api/state/live-ping — Lightweight classroom heartbeat (<1.5KB) to avoid downloading full state on every poll
  app.get('/api/state/live-ping', (_req, res) => {
    const nowMs = Date.now();
    const beforeCount = centralDb.liveSessions.length;
    centralDb.liveSessions = centralDb.liveSessions.filter(
      (s) => s && typeof s.ultimaActualizacionMs === 'number' && nowMs - s.ultimaActualizacionMs < 120000
    );
    if (centralDb.liveSessions.length !== beforeCount) {
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
    }
    const activeRollCalls = (centralDb.academicDataset?.classSessions || [])
      .filter((cs: any) => cs && cs.llamadoAsistenciaActivo)
      .map((cs: any) => cs.id);

    return res.json({
      ok: true,
      revision: centralDb.revision,
      questionsRevision: centralDb.questionsRevision,
      lastModifiedIso: centralDb.lastModifiedIso,
      liveSessions: centralDb.liveSessions,
      activeExamsCount: Object.keys(centralDb.activeExamsByStudent || {}).length,
      activeRollCalls,
      attemptsCount: centralDb.attempts.length,
      studentsCount: centralDb.students.length
    });
  });

  // 1C. GET & POST /api/audit-logs — Institutional Audit Trail & Role Security Verification
  app.get('/api/audit-logs', (_req, res) => {
    try {
      let logs: any[] = [];
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        logs = JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf-8')) || [];
      }
      return res.json({
        ok: true,
        revision: centralDb.revision,
        logs: Array.isArray(logs) ? logs.slice(0, 100) : []
      });
    } catch {
      return res.json({ ok: true, revision: centralDb.revision, logs: [] });
    }
  });

  // 1D. GET & POST /api/reconcile-database & /api/state/reconcile — Endpoint explícito de verificación y sincronización Firestore
  app.get('/api/reconcile-database', async (_req, res) => {
    try {
      const result = await reconcileDatabaseWithFirestoreTimestampComparison();
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post('/api/reconcile-database', async (_req, res) => {
    try {
      const result = await reconcileDatabaseWithFirestoreTimestampComparison();
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.get('/api/state/reconcile', async (_req, res) => {
    try {
      const result = await reconcileDatabaseWithFirestoreTimestampComparison();
      return res.json({ ok: true, result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // In-memory brute-force protection & classroom code help queue
  const authRateLimitMap = new Map<string, { failedCount: number; lockedUntilMs: number }>();
  const classroomCodeHelpRequests: Array<{
    id: string;
    studentId: string;
    studentName: string;
    documento?: string;
    accessCode?: string;
    requestedAtIso: string;
    courseName?: string;
  }> = [];

  function appendAuditLogEntry(entry: {
    section: string;
    description: string;
    actorId?: string;
    actorRole?: string;
    courseId?: string;
  }) {
    try {
      let existingLogs: any[] = [];
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        existingLogs = JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf-8')) || [];
      }
      const fullEntry = {
        section: String(entry.section),
        description: String(entry.description),
        actorId: entry.actorId ? String(entry.actorId) : undefined,
        actorRole: entry.actorRole ? String(entry.actorRole) : undefined,
        courseId: entry.courseId ? String(entry.courseId) : centralDb.config?.activeCourseId || undefined,
        revision: centralDb.revision,
        saved_at: new Date().toISOString()
      };
      const nextLogs = [fullEntry, ...existingLogs.slice(0, 199)];
      ensureDataDir();
      fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(nextLogs, null, 2), 'utf-8');
      return { fullEntry, count: nextLogs.length };
    } catch {
      return null;
    }
  }

  app.post('/api/audit-logs', (req, res) => {
    try {
      const { section = 'AuditoriaInstitucional', description = 'Evento registrado', actorId, actorRole, courseId } = req.body || {};
      const result = appendAuditLogEntry({ section, description, actorId, actorRole, courseId });
      return res.json({ ok: true, entry: result?.fullEntry, logsCount: result?.count || 0 });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Error al registrar auditoría.' });
    }
  });

  // Solicitudes de asistencia de código en aula desde el login del estudiante
  app.get('/api/auth/code-help-requests', (_req, res) => {
    return res.json({
      ok: true,
      requests: classroomCodeHelpRequests.slice(0, 50)
    });
  });

  app.post('/api/auth/request-code-help', (req, res) => {
    try {
      const { studentId } = req.body || {};
      const cleanId = String(studentId || '').trim().replace(/[\s.-]/g, '').toUpperCase();
      if (!cleanId) {
        return res.status(400).json({ ok: false, error: 'Ingrese su ID o documento de estudiante para notificar al docente.' });
      }
      const matchedStudent = centralDb.students.find(
        (s) =>
          String(s.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === cleanId ||
          String(s.documento || '').trim().replace(/[\s.-]/g, '').toUpperCase() === cleanId
      );
      const studentName = matchedStudent?.nombre || `Estudiante (${cleanId})`;
      const existingIdx = classroomCodeHelpRequests.findIndex((r) => r.studentId === cleanId);
      const reqItem = {
        id: `help_${Date.now()}_${cleanId}`,
        studentId: matchedStudent?.id || cleanId,
        studentName,
        documento: matchedStudent?.documento || cleanId,
        accessCode: matchedStudent?.codigoAcceso || undefined,
        requestedAtIso: new Date().toISOString(),
        courseName: centralDb.config?.activeCourseMeta?.nombreCurso || 'Curso Activo'
      };
      if (existingIdx >= 0) {
        classroomCodeHelpRequests[existingIdx] = reqItem;
      } else {
        classroomCodeHelpRequests.unshift(reqItem);
      }
      appendAuditLogEntry({
        section: 'SolicitudCodigoAula',
        description: `Estudiante ${studentName} (${cleanId}) solicitó asistencia de código de acceso en sala.`,
        actorId: cleanId,
        actorRole: 'estudiante'
      });
      return res.json({
        ok: true,
        found: Boolean(matchedStudent),
        studentName,
        message: `Solicitud enviada al Panel del Docente en sala para ${studentName}.`
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Error al procesar solicitud.' });
    }
  });

  app.delete('/api/auth/code-help-requests/:studentId', (req, res) => {
    const cleanId = String(req.params.studentId || '').trim().replace(/[\s.-]/g, '').toUpperCase();
    const idx = classroomCodeHelpRequests.findIndex(
      (r) => String(r.studentId || '').trim().replace(/[\s.-]/g, '').toUpperCase() === cleanId || r.id === req.params.studentId
    );
    if (idx >= 0) {
      classroomCodeHelpRequests.splice(idx, 1);
    }
    return res.json({ ok: true, requests: classroomCodeHelpRequests });
  });

  app.post('/api/auth/verify-role', (req, res) => {
    try {
      const { role, userId, password } = req.body || {};
      const cleanId = String(userId || '').trim().replace(/[\s.-]/g, '').toUpperCase();
      const cleanPass = String(password || '').trim();
      const cfg = centralDb.config || DEFAULT_SERVER_CONFIG;

      const rateKey = `${String(role || 'unknown')}:${cleanId || req.ip || 'anon'}`;
      const nowMs = Date.now();
      const rateState = authRateLimitMap.get(rateKey);
      if (rateState && rateState.lockedUntilMs > nowMs) {
        const remainingSec = Math.ceil((rateState.lockedUntilMs - nowMs) / 1000);
        return res.status(429).json({
          ok: false,
          verified: false,
          lockedRemainingSec: remainingSec,
          error: `Demasiados intentos fallidos. Por seguridad institucional, espere ${remainingSec}s antes de reintentar.`
        });
      }

      const registerAuthAttempt = (verified: boolean, targetRole: string, resolvedActorId: string) => {
        if (verified) {
          authRateLimitMap.delete(rateKey);
          appendAuditLogEntry({
            section: 'AccesoRolVerificado',
            description: `Inicio de sesión verificado en rol ${targetRole.toUpperCase()} por ${resolvedActorId}.`,
            actorId: resolvedActorId,
            actorRole: targetRole
          });
        } else {
          const prev = authRateLimitMap.get(rateKey) || { failedCount: 0, lockedUntilMs: 0 };
          const nextFailed = prev.failedCount + 1;
          const lockedUntilMs = nextFailed >= 5 ? nowMs + 60_000 : 0;
          authRateLimitMap.set(rateKey, { failedCount: nextFailed, lockedUntilMs });
          appendAuditLogEntry({
            section: 'IntentoAccesoFallido',
            description: `Intento fallido de autenticación (#${nextFailed}) en rol ${targetRole.toUpperCase()} con usuario "${cleanId || 'vacío'}".`,
            actorId: cleanId || 'ANON',
            actorRole: targetRole
          });
        }
      };

      if (role === 'editor') {
        const expectedUser = String(cfg.editorUsuario || 'EDITOR2026').trim().toUpperCase();
        const expectedPass = String(cfg.editorClave || 'EDITOR2026').trim();
        const verified = cleanId === expectedUser && cleanPass === expectedPass;
        registerAuthAttempt(verified, 'editor', cleanId);
        const sessionToken = verified
          ? Buffer.from(`editor:${cleanId}:${nowMs}`).toString('base64url')
          : undefined;
        return res.json({ ok: true, verified, role: 'editor', actorId: cleanId, sessionToken });
      }

      if (role === 'docente') {
        const expectedTeacherId = String(cfg.idDocente || 'DOCENTE2026').trim().toUpperCase();
        const isMasterMatch =
          (cleanId === expectedTeacherId || cleanId === 'DOCENTE2026') &&
          cleanPass === String(cfg.claveDocente || 'DOCENTE2026').trim();
        const teachers = Array.isArray(cfg.registeredTeachers) ? cfg.registeredTeachers : [];
        const matchedTeacher = teachers.find(
          (t: any) =>
            t &&
            t.activo !== false &&
            String(t.id || '').trim().replace(/[\s.-]/g, '').toUpperCase() === cleanId &&
            String(t.claveAcceso || '').trim() === cleanPass
        );
        const verified = Boolean(isMasterMatch || matchedTeacher);
        const resolvedActor = matchedTeacher ? matchedTeacher.id : cleanId;
        registerAuthAttempt(verified, 'docente', resolvedActor);
        const sessionToken = verified
          ? Buffer.from(`docente:${resolvedActor}:${nowMs}`).toString('base64url')
          : undefined;
        return res.json({
          ok: true,
          verified,
          role: 'docente',
          actorId: resolvedActor,
          teacherName: matchedTeacher?.nombre || cfg.activeCourseMeta?.docenteResponsable || cleanId,
          sessionToken
        });
      }

      return res.status(400).json({ ok: false, verified: false, error: 'Rol no soportado' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, verified: false, error: err?.message });
    }
  });

  // 2. PUT /api/state/questions — Replace or update Question Bank on the server
  app.put('/api/state/questions', (req, res) => {
    try {
      const { questions, saveSnapshot = true } = req.body || {};
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: 'Formato inválido para el banco de preguntas.' });
      }

      // Preserve last non-empty question bank in snapshot before replacing/clearing
      if (saveSnapshot && centralDb.questions.length > 0) {
        questionsSnapshotCache = centralDb.questions;
        saveQuestionsSnapshotToDisk(questionsSnapshotCache);
      }

      const normalized = questions.length > 0 ? normalizeQuestionList(questions) : [];
      centralDb.questions = normalized;
      centralDb.questionsBankExplicitlyCleared = normalized.length === 0;
      centralDb.migratedFromClient = true;
      centralDb.questionsRevision += 1;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();

      saveCentralDbToDisk(centralDb, 'BancoPreguntas', 'Actualización del banco de preguntas', {
        includeQuestions: true,
        syncCloud: true
      });

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        questionsCount: centralDb.questions.length,
        questionsBankExplicitlyCleared: centralDb.questionsBankExplicitlyCleared,
        previousQuestionsSnapshotCount: questionsSnapshotCache ? questionsSnapshotCache.length : 0
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar el banco de preguntas.' });
    }
  });

  // 3. POST /api/state/questions/undo — Restore previous Question Bank snapshot on the server
  app.post('/api/state/questions/undo', (_req, res) => {
    try {
      if (!questionsSnapshotCache || questionsSnapshotCache.length === 0) {
        return res.status(404).json({ error: 'No existe una instantánea previa para restaurar.' });
      }

      const restored = normalizeQuestionList(questionsSnapshotCache);
      centralDb.questions = restored;
      centralDb.questionsBankExplicitlyCleared = false;
      centralDb.migratedFromClient = true;
      centralDb.questionsRevision += 1;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();

      questionsSnapshotCache = null;
      saveQuestionsSnapshotToDisk(null);
      saveCentralDbToDisk(centralDb, 'BancoPreguntas', 'Restauración de instantánea previa', {
        includeQuestions: true,
        syncCloud: true
      });

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        questions: centralDb.questions,
        previousQuestionsSnapshotCount: 0
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al restaurar la instantánea previa.' });
    }
  });

  // 4. PUT /api/state/students — Update full students roster (Teacher CRUD / Bulk actions) with Referential Integrity
  app.put('/api/state/students', (req, res) => {
    try {
      const { students } = req.body || {};
      if (!Array.isArray(students)) {
        return res.status(400).json({ error: 'Lista de estudiantes inválida.' });
      }
      // Preserve historical progress, anti-cheat logs, and attempt counters for existing students
      const prevById = new Map<string, StudentRecord>();
      centralDb.students.forEach((s) => {
        if (s && s.id) {
          prevById.set(String(s.id).trim().toUpperCase(), s);
        }
      });
      centralDb.students = students.map((incoming: StudentRecord) => {
        const cleanKey = String(incoming?.id || '').trim().toUpperCase();
        const prev = prevById.get(cleanKey);
        if (!prev) return incoming;
        return {
          ...prev,
          ...incoming,
          progresoRetos: incoming.progresoRetos || prev.progresoRetos,
          historialIntentosRetos:
            Array.isArray(incoming.historialIntentosRetos) && incoming.historialIntentosRetos.length > 0
              ? incoming.historialIntentosRetos
              : prev.historialIntentosRetos,
          historialLlamadosAtencion:
            Array.isArray(incoming.historialLlamadosAtencion) && incoming.historialLlamadosAtencion.length > 0
              ? incoming.historialLlamadosAtencion
              : prev.historialLlamadosAtencion
        };
      });
      centralDb.studentsExplicitlyCleared = students.length === 0;
      centralDb.academicDataset = normalizeAndSyncAcademicDataset(
        centralDb.academicDataset,
        centralDb.students
      );
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'NominaEstudiantes',
        `Actualización de nómina de estudiantes (${centralDb.students.length} registros)`
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        academicDataset: centralDb.academicDataset
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar estudiantes.' });
    }
  });

  // 5. PATCH /api/state/student/:studentId — Atomic single-student update (Mini Retos, Insignias, Profile, Unlocks)
  app.patch('/api/state/student/:studentId', (req, res) => {
    try {
      const studentId = String(req.params.studentId || '').trim();
      const { student } = req.body || {};
      if (!studentId || !student || typeof student !== 'object') {
        return res.status(400).json({ error: 'Datos del estudiante inválidos.' });
      }

      const idx = centralDb.students.findIndex(
        (s) => s.id.toUpperCase() === studentId.toUpperCase()
      );
      if (idx >= 0) {
        centralDb.students[idx] = {
          ...centralDb.students[idx],
          ...student
        };
      } else {
        centralDb.students.unshift(student as StudentRecord);
      }

      centralDb.studentsExplicitlyCleared = centralDb.students.length === 0;
      centralDb.academicDataset = normalizeAndSyncAcademicDataset(
        centralDb.academicDataset,
        centralDb.students
      );
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        student: idx >= 0 ? centralDb.students[idx] : student
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al actualizar el estudiante.' });
    }
  });

  // 6. POST /api/state/attempt — Atomically record an Exam Attempt AND update the StudentRecord in the Server DB
  app.post('/api/state/attempt', (req, res) => {
    try {
      const { attempt, student } = req.body || {};
      if (!attempt || typeof attempt !== 'object') {
        return res.status(400).json({ error: 'Datos del intento de examen inválidos.' });
      }

      const existingIdx = centralDb.attempts.findIndex((a) => a.attemptId === attempt.attemptId);
      if (existingIdx >= 0) {
        centralDb.attempts[existingIdx] = attempt;
      } else {
        centralDb.attempts.unshift(attempt);
      }

      const targetStudentId = String(student?.id || attempt.studentId || '').trim();
      if (targetStudentId) {
        const stIdx = centralDb.students.findIndex(
          (s) => s.id.toUpperCase() === targetStudentId.toUpperCase()
        );
        if (stIdx >= 0) {
          const prevSt = centralDb.students[stIdx];
          const prevLogs = Array.isArray(prevSt.historialLlamadosAtencion)
            ? prevSt.historialLlamadosAtencion
            : [];
          const incomingLogs = Array.isArray(student?.historialLlamadosAtencion)
            ? student.historialLlamadosAtencion
            : Array.isArray(attempt.historialLlamadosIntento)
            ? attempt.historialLlamadosIntento
            : [];
          const mergedLogsMap = new Map<string, any>();
          [...incomingLogs, ...prevLogs].forEach((entry) => {
            if (entry && entry.id) mergedLogsMap.set(entry.id, entry);
          });

          const mergedStudent: StudentRecord = {
            ...prevSt,
            ...(student || {}),
            historialLlamadosAtencion: Array.from(mergedLogsMap.values()).sort(
              (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
            )
          };
          mergedStudent.resumenServidor = computeStudentServerSummary(
            mergedStudent,
            centralDb.attempts,
            centralDb.config?.notaMinimaAprobacion ?? 3.0
          );
          centralDb.students[stIdx] = mergedStudent;
        }
        centralDb.liveSessions = centralDb.liveSessions.filter(
          (s) => s.studentId.toUpperCase() !== targetStudentId.toUpperCase()
        );
        delete centralDb.activeExamsByStudent[targetStudentId];
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'ExamenRealizado',
        `Examen registrado automáticamente en el servidor: ${attempt.studentName} (${attempt.modalidadLabel} - Nota ${attempt.notaColombiana})`
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al registrar intento de examen.' });
    }
  });

  // 6B. POST /api/state/reto-attempt — Atomically record a Mini Reto Attempt AND update StudentRecord on the Server DB
  app.post('/api/state/reto-attempt', (req, res) => {
    try {
      const { studentId, retoAttempt, updatedStudent } = req.body || {};
      const cleanId = String(studentId || retoAttempt?.studentId || updatedStudent?.id || '').trim();
      if (!cleanId) {
        return res.status(400).json({ error: 'Falta studentId para registrar el Mini Reto.' });
      }

      const stIdx = centralDb.students.findIndex(
        (s) => s.id.toUpperCase() === cleanId.toUpperCase()
      );
      if (stIdx >= 0) {
        const currentSt = centralDb.students[stIdx];
        const baseProgress = getDefaultRetoProgress();
        const mergedProgresoRetos = {
          ...baseProgress,
          ...(currentSt.progresoRetos || {}),
          ...(updatedStudent?.progresoRetos || {})
        };

        if (retoAttempt && retoAttempt.modulo) {
          const mod = Number(retoAttempt.modulo) as 1 | 2 | 3 | 4 | 5;
          const prevMod = mergedProgresoRetos[mod] || baseProgress[mod];
          const existingModHist = Array.isArray(prevMod.historialIntentos)
            ? prevMod.historialIntentos.filter(Boolean)
            : [];
          const hasAttemptInMod = existingModHist.some(
            (a: any) => a && a.attemptId === retoAttempt.attemptId
          );
          const nextModHist = hasAttemptInMod
            ? existingModHist.map((a: any) =>
                a && a.attemptId === retoAttempt.attemptId ? retoAttempt : a
              )
            : [retoAttempt, ...existingModHist];

          mergedProgresoRetos[mod] = {
            ...prevMod,
            modulo: mod,
            intentosUsados: Math.max(prevMod.intentosUsados || 0, nextModHist.length),
            insigniaDesbloqueada: Boolean(
              prevMod.insigniaDesbloqueada || retoAttempt.aprobado
            ),
            mejorPorcentaje: Math.max(
              prevMod.mejorPorcentaje || 0,
              Number(retoAttempt.porcentajeIA) || 0
            ),
            suspendidoPorTrampa: Boolean(
              prevMod.suspendidoPorTrampa || retoAttempt.suspendidoPorTrampa
            ),
            motivoSuspensionReto:
              retoAttempt.motivoInfraccion || prevMod.motivoSuspensionReto,
            historialIntentos: nextModHist
          };
        }

        const prevGlobalRetos = Array.isArray(currentSt.historialIntentosRetos)
          ? currentSt.historialIntentosRetos.filter(Boolean)
          : [];
        const incomingGlobalRetos = Array.isArray(updatedStudent?.historialIntentosRetos)
          ? updatedStudent.historialIntentosRetos.filter(Boolean)
          : [];
        const retoMap = new Map<string, any>();
        if (retoAttempt && retoAttempt.attemptId) {
          retoMap.set(retoAttempt.attemptId, retoAttempt);
        }
        [...incomingGlobalRetos, ...prevGlobalRetos].forEach((r) => {
          if (r && r.attemptId && !retoMap.has(r.attemptId)) {
            retoMap.set(r.attemptId, r);
          }
        });

        const prevLogs = Array.isArray(currentSt.historialLlamadosAtencion)
          ? currentSt.historialLlamadosAtencion
          : [];
        const incomingLogs = Array.isArray(updatedStudent?.historialLlamadosAtencion)
          ? updatedStudent.historialLlamadosAtencion
          : Array.isArray(retoAttempt?.historialLlamadosIntento)
          ? retoAttempt.historialLlamadosIntento
          : [];
        const logsMap = new Map<string, any>();
        [...incomingLogs, ...prevLogs].forEach((l) => {
          if (l && l.id) logsMap.set(l.id, l);
        });

        const nextStudent: StudentRecord = {
          ...currentSt,
          ...(updatedStudent || {}),
          progresoRetos: mergedProgresoRetos,
          historialIntentosRetos: Array.from(retoMap.values()).sort(
            (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
          ),
          historialLlamadosAtencion: Array.from(logsMap.values()).sort(
            (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
          )
        };
        nextStudent.resumenServidor = computeStudentServerSummary(
          nextStudent,
          centralDb.attempts,
          centralDb.config?.notaMinimaAprobacion ?? 3.0
        );
        centralDb.students[stIdx] = nextStudent;
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'MiniRetoRealizado',
        `Mini Reto registrado automáticamente en el servidor: Estudiante ${cleanId}`
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        student: stIdx >= 0 ? centralDb.students[stIdx] : null
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al registrar Mini Reto en el servidor.' });
    }
  });

  // 6C. POST /api/state/anti-cheat-event — Atomically record a real-time anti-cheat warning or suspension in the Server DB
  app.post('/api/state/anti-cheat-event', (req, res) => {
    try {
      const { studentId, logEntry } = req.body || {};
      const cleanId = String(studentId || logEntry?.studentId || '').trim();
      if (!cleanId || !logEntry) {
        return res.status(400).json({ error: 'Datos de evento anti-trampa incompletos.' });
      }

      const stIdx = centralDb.students.findIndex(
        (s) => s.id.toUpperCase() === cleanId.toUpperCase()
      );
      if (stIdx >= 0) {
        const currentSt = centralDb.students[stIdx];
        const prevLogs = Array.isArray(currentSt.historialLlamadosAtencion)
          ? currentSt.historialLlamadosAtencion
          : [];
        const exists = prevLogs.some((l) => l && l.id === logEntry.id);
        const nextLogs = exists ? prevLogs : [logEntry, ...prevLogs].slice(0, 150);
        centralDb.students[stIdx] = {
          ...currentSt,
          historialLlamadosAtencion: nextLogs,
          conceptoInfraccion:
            logEntry.accionTomada === 'SUSPENSION_0_0'
              ? `${logEntry.etiquetaDeteccion}: ${logEntry.descripcion}`
              : currentSt.conceptoInfraccion
        };
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al registrar evento anti-trampa.' });
    }
  });

  // 7. PUT /api/state/attempts — Update attempts list (Teacher resets / Sheets sync status)
  app.put('/api/state/attempts', (req, res) => {
    try {
      const { attempts } = req.body || {};
      if (!Array.isArray(attempts)) {
        return res.status(400).json({ error: 'Lista de intentos inválida.' });
      }
      centralDb.attempts = attempts;
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al actualizar intentos.' });
    }
  });

  // 8. PUT /api/state/abpro — Update ABPro evaluations
  app.put('/api/state/abpro', (req, res) => {
    try {
      const { abproEvaluations } = req.body || {};
      if (!Array.isArray(abproEvaluations)) {
        return res.status(400).json({ error: 'Evaluaciones ABPro inválidas.' });
      }
      centralDb.abproEvaluations = abproEvaluations;
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar evaluaciones ABPro.' });
    }
  });

  // 9. PUT /api/state/config — Update SystemConfig (Teacher settings, schedules, passwords, permissions, course config)
  app.put('/api/state/config', (req, res) => {
    try {
      const { config } = req.body || {};
      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Configuración inválida.' });
      }
      centralDb.config = {
        ...centralDb.config,
        ...config
      };

      // Sync academicDataset classSessions when activeCourseMeta is updated
      const activeMeta = centralDb.config?.activeCourseMeta;
      if (activeMeta && Array.isArray(activeMeta.modulosCurso) && centralDb.academicDataset) {
        const updatedClassSessions = activeMeta.modulosCurso.slice(0, 6).map((m, idx) => ({
          id: (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          code: (`C${idx + 1}`) as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6',
          shortTitle: m.shortTitle || `Módulo ${idx + 1}`,
          fullTitle: `Clase ${idx + 1}: ${m.shortTitle || `Módulo ${idx + 1}`}`,
          subtitle: m.description || m.fullTitle || m.shortTitle || '',
          examenesCount: typeof m.examenesCount === 'number' ? m.examenesCount : 1,
          retosCount: typeof m.retosCount === 'number' ? m.retosCount : 2,
          ponderacion: m.ponderacion || {
            comportamientoPct: 10,
            participacionPct: 15,
            examenPct: 35,
            trabajoPct: 40
          },
          documentosEnlaces: Array.isArray(m.documentosEnlaces) ? m.documentosEnlaces : []
        }));
        centralDb.academicDataset = normalizeAndSyncAcademicDataset(
          {
            ...centralDb.academicDataset,
            courseName: activeMeta.nombreCurso || centralDb.academicDataset.courseName,
            classSessions: updatedClassSessions,
            updatedAtIso: new Date().toISOString()
          },
          centralDb.students
        );
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'ConfiguracionCurso',
        `Configuración del curso y sistema actualizada (${centralDb.config?.activeCourseMeta?.nombreCurso || 'Curso Activo'})`
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        config: centralDb.config
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar configuración.' });
    }
  });

  // 10. PUT /api/state/custom-mini-retos — Update Custom Mini Retos Templates
  app.put('/api/state/custom-mini-retos', (req, res) => {
    try {
      const { customMiniRetos } = req.body || {};
      if (!Array.isArray(customMiniRetos)) {
        return res.status(400).json({ error: 'Plantillas de Mini Retos inválidas.' });
      }
      centralDb.customMiniRetos = customMiniRetos;
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar plantillas de Mini Retos.' });
    }
  });

  // 11. POST /api/state/live-session — Upsert or remove a student's Live Classroom Session
  app.post('/api/state/live-session', (req, res) => {
    try {
      const { session, studentIdToRemove } = req.body || {};
      if (studentIdToRemove) {
        centralDb.liveSessions = centralDb.liveSessions.filter(
          (s) => s.studentId !== studentIdToRemove
        );
      } else if (session && session.studentId) {
        const existsIdx = centralDb.liveSessions.findIndex(
          (s) => s.studentId === session.studentId
        );
        if (existsIdx >= 0) {
          centralDb.liveSessions[existsIdx] = {
            ...centralDb.liveSessions[existsIdx],
            ...session,
            ultimaActualizacionMs: session.ultimaActualizacionMs || Date.now()
          };
        } else {
          centralDb.liveSessions.unshift({
            ...session,
            ultimaActualizacionMs: session.ultimaActualizacionMs || Date.now()
          });
        }
      }
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb, 'AutoSync', 'Actualización de sesión en vivo', {
        includeQuestions: false,
        syncCloud: false
      });

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        liveSessions: centralDb.liveSessions
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al actualizar sesión en vivo.' });
    }
  });

  // 12. PUT /api/state/active-exam/:studentId — Save or clear in-progress exam backup for cross-device resume
  app.put('/api/state/active-exam/:studentId', (req, res) => {
    try {
      const studentId = String(req.params.studentId || '').trim();
      const { backup } = req.body || {};
      if (!studentId) {
        return res.status(400).json({ error: 'Falta studentId.' });
      }
      if (!backup) {
        delete centralDb.activeExamsByStudent[studentId];
      } else {
        centralDb.activeExamsByStudent[studentId] = backup;
      }
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb, 'AutoSync', 'Respaldo temporal de examen activo', {
        includeQuestions: false,
        syncCloud: false
      });

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al guardar respaldo de examen activo.' });
    }
  });

  // 13. POST /api/state/full-restore — Restore full system backup (.evaluaplus.json) or migrate existing client state
  app.post('/api/state/full-restore', (req, res) => {
    try {
      const {
        students,
        questions,
        attempts,
        abproEvaluations,
        config,
        customMiniRetos,
        academicDataset,
        questionsBankExplicitlyCleared
      } = req.body || {};

      if (Array.isArray(students)) {
        centralDb.students = students;
        centralDb.studentsExplicitlyCleared = students.length === 0;
      }
      if (Array.isArray(questions)) {
        if (centralDb.questions.length > 0 && questions.length > 0) {
          questionsSnapshotCache = centralDb.questions;
          saveQuestionsSnapshotToDisk(questionsSnapshotCache);
        }
        centralDb.questions = questions.length > 0 ? normalizeQuestionList(questions) : [];
        centralDb.questionsBankExplicitlyCleared =
          questionsBankExplicitlyCleared !== undefined
            ? Boolean(questionsBankExplicitlyCleared)
            : centralDb.questions.length === 0;
        centralDb.questionsRevision += 1;
      }
      if (Array.isArray(attempts)) {
        centralDb.attempts = attempts;
      }
      if (Array.isArray(abproEvaluations)) {
        centralDb.abproEvaluations = abproEvaluations;
      }
      if (config && typeof config === 'object') {
        centralDb.config = {
          ...centralDb.config,
          ...config
        };
      }
      if (Array.isArray(customMiniRetos) && customMiniRetos.length > 0) {
        centralDb.customMiniRetos = customMiniRetos;
      }
      if (academicDataset && typeof academicDataset === 'object') {
        centralDb.academicDataset = normalizeAndSyncAcademicDataset(
          academicDataset,
          centralDb.students
        );
      } else if (Array.isArray(students)) {
        centralDb.academicDataset = normalizeAndSyncAcademicDataset(
          centralDb.academicDataset,
          centralDb.students
        );
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'FullRestore',
        'Restauración o migración completa al servidor'
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        previousQuestionsSnapshotCount: questionsSnapshotCache ? questionsSnapshotCache.length : 0
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error en restauración completa del servidor.' });
    }
  });

  // 14. POST /api/state/save-all — Explicit atomic save to Server SQLite Database from any option/button
  app.post('/api/state/save-all', (req, res) => {
    try {
      const {
        section = 'Panel General',
        description = 'Guardado manual en Base de Datos del Servidor',
        config,
        students,
        questions,
        attempts,
        abproEvaluations,
        customMiniRetos,
        academicDataset,
        activeExamStudentId,
        activeExamBackup,
        questionsBankExplicitlyCleared
      } = req.body || {};

      if (config && typeof config === 'object') {
        centralDb.config = {
          ...centralDb.config,
          ...config
        };
      }
      if (Array.isArray(students)) {
        centralDb.students = students;
        centralDb.studentsExplicitlyCleared = students.length === 0;
      }
      if (Array.isArray(questions)) {
        if (centralDb.questions.length > 0 && questions.length > 0) {
          questionsSnapshotCache = centralDb.questions;
          saveQuestionsSnapshotToDisk(questionsSnapshotCache);
        }
        centralDb.questions = questions.length > 0 ? normalizeQuestionList(questions) : [];
        centralDb.questionsBankExplicitlyCleared =
          questionsBankExplicitlyCleared !== undefined
            ? Boolean(questionsBankExplicitlyCleared)
            : centralDb.questions.length === 0;
        centralDb.questionsRevision += 1;
      }
      if (Array.isArray(attempts)) {
        centralDb.attempts = attempts;
      }
      if (Array.isArray(abproEvaluations)) {
        centralDb.abproEvaluations = abproEvaluations;
      }
      if (Array.isArray(customMiniRetos)) {
        centralDb.customMiniRetos = customMiniRetos;
      }
      if (academicDataset && typeof academicDataset === 'object') {
        centralDb.academicDataset = normalizeAndSyncAcademicDataset(
          academicDataset,
          centralDb.students
        );
      } else if (Array.isArray(students)) {
        centralDb.academicDataset = normalizeAndSyncAcademicDataset(
          centralDb.academicDataset,
          centralDb.students
        );
      }
      if (activeExamStudentId) {
        if (activeExamBackup) {
          centralDb.activeExamsByStudent[String(activeExamStudentId)] = activeExamBackup;
        } else if (activeExamBackup === null) {
          delete centralDb.activeExamsByStudent[String(activeExamStudentId)];
        }
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb, String(section), String(description));

      return res.json({
        ok: true,
        section,
        description,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO'),
        counts: {
          students: centralDb.students.length,
          questions: centralDb.questions.length,
          attempts: centralDb.attempts.length,
          abproEvaluations: centralDb.abproEvaluations.length,
          customMiniRetos: centralDb.customMiniRetos.length
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Error al guardar los cambios en la Base de Datos del Servidor.'
      });
    }
  });

  // 14B. POST /api/state/differential — Ultra-fast Granular / Differential Save (under 15ms latency, ~2KB payload)
  app.post('/api/state/differential', (req, res) => {
    try {
      const {
        entity,
        data,
        section = 'GuardadoDiferencial',
        description = 'Actualización granular'
      } = req.body || {};

      if (!entity || data === undefined) {
        return res.status(400).json({ error: 'Falta entity o data para guardado diferencial.' });
      }

      let includeQuestions = false;

      switch (entity) {
        case 'config': {
          if (data && typeof data === 'object') {
            const currentRosters = centralDb.config.studentRosterDatabases || [];
            const currentBanks = centralDb.config.questionBankDatabases || [];
            const currentCatalog = centralDb.config.universalCoursesCatalog || [];
            const currentTeachers = centralDb.config.registeredTeachers || [];

            centralDb.config = {
              ...centralDb.config,
              ...data,
              studentRosterDatabases:
                Array.isArray(data.studentRosterDatabases) && data.studentRosterDatabases.length > 0
                  ? data.studentRosterDatabases
                  : currentRosters,
              questionBankDatabases:
                Array.isArray(data.questionBankDatabases) && data.questionBankDatabases.length > 0
                  ? data.questionBankDatabases
                  : currentBanks,
              universalCoursesCatalog:
                Array.isArray(data.universalCoursesCatalog) && data.universalCoursesCatalog.length > 0
                  ? data.universalCoursesCatalog
                  : currentCatalog,
              registeredTeachers:
                Array.isArray(data.registeredTeachers) && data.registeredTeachers.length > 0
                  ? data.registeredTeachers
                  : currentTeachers
            };
            saveShardToDisk(SHARDS.COURSES_CONFIG, centralDb.config);
          }
          break;
        }
        case 'studentRosterDatabases': {
          if (Array.isArray(data)) {
            centralDb.config.studentRosterDatabases = data;
            saveShardToDisk(SHARDS.EDITOR_ROSTERS, data);
            saveShardToDisk(SHARDS.COURSES_CONFIG, centralDb.config);
          }
          break;
        }
        case 'questionBankDatabases': {
          if (Array.isArray(data)) {
            centralDb.config.questionBankDatabases = data;
            saveShardToDisk(SHARDS.EDITOR_QUESTION_BANKS, data);
            saveShardToDisk(SHARDS.COURSES_CONFIG, centralDb.config);
          }
          break;
        }
        case 'universalCoursesCatalog': {
          if (Array.isArray(data)) {
            centralDb.config.universalCoursesCatalog = data;
            saveShardToDisk(SHARDS.COURSES_CATALOG, data);
            saveShardToDisk(SHARDS.COURSES_CONFIG, centralDb.config);
          }
          break;
        }
        case 'registeredTeachers': {
          if (Array.isArray(data)) {
            centralDb.config.registeredTeachers = data;
            saveShardToDisk(SHARDS.REGISTERED_TEACHERS, data);
            saveShardToDisk(SHARDS.COURSES_CONFIG, centralDb.config);
          }
          break;
        }
        case 'students': {
          if (Array.isArray(data)) {
            centralDb.students = data;
            centralDb.studentsExplicitlyCleared = data.length === 0;
            saveShardToDisk(SHARDS.STUDENTS, centralDb.students);
          }
          break;
        }
        case 'questions': {
          if (Array.isArray(data)) {
            centralDb.questions = data.length > 0 ? normalizeQuestionList(data) : [];
            centralDb.questionsBankExplicitlyCleared = centralDb.questions.length === 0;
            centralDb.questionsRevision += 1;
            includeQuestions = true;
            saveShardToDisk(SHARDS.QUESTIONS, centralDb.questions);
          }
          break;
        }
        case 'academicDataset': {
          if (data && typeof data === 'object') {
            centralDb.academicDataset = normalizeAndSyncAcademicDataset(
              data,
              centralDb.students
            );
            saveShardToDisk(SHARDS.ACADEMIC_DATASET, centralDb.academicDataset);
          }
          break;
        }
        case 'attempts': {
          if (Array.isArray(data)) {
            centralDb.attempts = data;
            saveShardToDisk(SHARDS.ATTEMPTS, centralDb.attempts);
          }
          break;
        }
        case 'customMiniRetos': {
          if (Array.isArray(data)) {
            centralDb.customMiniRetos = data;
          }
          break;
        }
        default:
          return res.status(400).json({ error: `Entidad desconocida para diferencial: ${entity}` });
      }

      // Si en el cuerpo vienen colecciones del editor acompañando otra mutación, persistirlas siempre
      if (Array.isArray(req.body.studentRosterDatabases)) {
        centralDb.config.studentRosterDatabases = req.body.studentRosterDatabases;
        saveShardToDisk(SHARDS.EDITOR_ROSTERS, req.body.studentRosterDatabases);
      }
      if (Array.isArray(req.body.questionBankDatabases)) {
        centralDb.config.questionBankDatabases = req.body.questionBankDatabases;
        saveShardToDisk(SHARDS.EDITOR_QUESTION_BANKS, req.body.questionBankDatabases);
      }
      if (Array.isArray(req.body.universalCoursesCatalog)) {
        centralDb.config.universalCoursesCatalog = req.body.universalCoursesCatalog;
        saveShardToDisk(SHARDS.COURSES_CATALOG, req.body.universalCoursesCatalog);
      }
      if (Array.isArray(req.body.registeredTeachers)) {
        centralDb.config.registeredTeachers = req.body.registeredTeachers;
        saveShardToDisk(SHARDS.REGISTERED_TEACHERS, req.body.registeredTeachers);
      }

      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();

      // Non-blocking quick local save + background cloud sync
      saveCentralDbToDisk(centralDb, String(section), String(description), {
        includeQuestions,
        syncCloud: true
      });

      return res.json({
        ok: true,
        entity,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO')
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Error en guardado diferencial del servidor.'
      });
    }
  });

  // 14C. GET /api/editor/databases — Obtener todas las bases de datos creadas por el editor
  app.get('/api/editor/databases', (_req, res) => {
    try {
      return res.json({
        ok: true,
        studentRosterDatabases: centralDb.config?.studentRosterDatabases || [],
        questionBankDatabases: centralDb.config?.questionBankDatabases || [],
        universalCoursesCatalog: centralDb.config?.universalCoursesCatalog || [],
        registeredTeachers: centralDb.config?.registeredTeachers || [],
        activeCourseId: centralDb.config?.activeCourseId,
        activeCourseMeta: centralDb.config?.activeCourseMeta
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al consultar bases del editor.' });
    }
  });

  // 14D. POST /api/editor/databases — Guardado directo y blindado de colecciones del editor
  app.post('/api/editor/databases', (req, res) => {
    try {
      const {
        studentRosterDatabases,
        questionBankDatabases,
        universalCoursesCatalog,
        registeredTeachers,
        activeCourseId,
        activeCourseMeta,
        section = 'EditorBasesDatos',
        description = 'Guardado atómico blindado de bases de datos del editor'
      } = req.body || {};

      const curConfig = centralDb.config || DEFAULT_SERVER_CONFIG;

      if (Array.isArray(studentRosterDatabases)) {
        const map = new Map<string, StudentRosterDatabaseEntry>();
        (curConfig.studentRosterDatabases || []).forEach((d) => { if (d && d.id) map.set(d.id, d); });
        studentRosterDatabases.forEach((d) => { if (d && d.id) map.set(d.id, d); });
        const merged = Array.from(map.values());
        curConfig.studentRosterDatabases = merged;
        saveShardToDisk(SHARDS.EDITOR_ROSTERS, merged);
      }
      if (Array.isArray(questionBankDatabases)) {
        const map = new Map<string, QuestionBankDatabaseEntry>();
        (curConfig.questionBankDatabases || []).forEach((d) => { if (d && d.id) map.set(d.id, d); });
        questionBankDatabases.forEach((d) => { if (d && d.id) map.set(d.id, d); });
        const merged = Array.from(map.values());
        curConfig.questionBankDatabases = merged;
        saveShardToDisk(SHARDS.EDITOR_QUESTION_BANKS, merged);
      }
      if (Array.isArray(universalCoursesCatalog)) {
        const map = new Map<string, UniversalCourseWorkspace>();
        (curConfig.universalCoursesCatalog || []).forEach((c) => { if (c && c.meta?.courseId) map.set(c.meta.courseId, c); });
        universalCoursesCatalog.forEach((c) => { if (c && c.meta?.courseId) map.set(c.meta.courseId, c); });
        const merged = Array.from(map.values());
        curConfig.universalCoursesCatalog = merged;
        saveShardToDisk(SHARDS.COURSES_CATALOG, merged);
      }
      if (Array.isArray(registeredTeachers)) {
        const map = new Map<string, TeacherAccountRecord>();
        (curConfig.registeredTeachers || []).forEach((t) => { if (t && t.id) map.set(t.id, t); });
        registeredTeachers.forEach((t) => { if (t && t.id) map.set(t.id, t); });
        const merged = Array.from(map.values());
        curConfig.registeredTeachers = merged;
        saveShardToDisk(SHARDS.REGISTERED_TEACHERS, merged);
      }
      if (activeCourseId) {
        curConfig.activeCourseId = activeCourseId;
      }
      if (activeCourseMeta && typeof activeCourseMeta === 'object') {
        curConfig.activeCourseMeta = activeCourseMeta;
      }

      centralDb.config = curConfig;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();

      saveCentralDbToDisk(centralDb, section, description, { syncCloud: true });

      return res.json({
        ok: true,
        revision: centralDb.revision,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO'),
        counts: {
          rosters: centralDb.config.studentRosterDatabases?.length || 0,
          questionBanks: centralDb.config.questionBankDatabases?.length || 0,
          courses: centralDb.config.universalCoursesCatalog?.length || 0,
          teachers: centralDb.config.registeredTeachers?.length || 0
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Error al persistir bases del editor.' });
    }
  });

  // 15. GET /api/academic-dataset — Retorna el dataset completo consolidado con las 6 clases y los estudiantes
  app.get('/api/academic-dataset', (_req, res) => {
    try {
      const synced = normalizeAndSyncAcademicDataset(
        centralDb.academicDataset,
        centralDb.students
      );
      centralDb.academicDataset = synced;
      return res.json({
        ok: true,
        revision: centralDb.revision,
        lastModifiedIso: centralDb.lastModifiedIso,
        academicDataset: synced
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Error al obtener el consolidado académico de clases y asistencia.'
      });
    }
  });

  // 16. PUT /api/state/academic-dataset & POST /api/academic-dataset/update — Permite actualizar notas o asistencias directamente en la base de datos
  const handleAcademicDatasetMutation = (req: express.Request, res: express.Response) => {
    try {
      const { academicDataset, studentRecord, deleteStudentId } = req.body || {};
      let current = normalizeAndSyncAcademicDataset(
        centralDb.academicDataset,
        centralDb.students
      );

      if (academicDataset && typeof academicDataset === 'object' && Array.isArray(academicDataset.records)) {
        current = {
          ...current,
          ...academicDataset,
          updatedAtIso: new Date().toISOString()
        };
      } else if (studentRecord && studentRecord.studentId) {
        const existsIdx = current.records.findIndex(
          (r) => r.studentId === studentRecord.studentId
        );
        if (existsIdx >= 0) {
          current.records[existsIdx] = {
            ...current.records[existsIdx],
            ...studentRecord,
            ultimaActualizacionIso: new Date().toISOString()
          };
        } else {
          current.records.push({
            ...studentRecord,
            ultimaActualizacionIso: new Date().toISOString()
          });
        }
        current.updatedAtIso = new Date().toISOString();
      } else if (deleteStudentId) {
        centralDb.students = centralDb.students.filter(
          (s) => s.id !== String(deleteStudentId)
        );
        centralDb.studentsExplicitlyCleared = centralDb.students.length === 0;
        current.records = current.records.filter(
          (r) => r.studentId !== String(deleteStudentId)
        );
        current.updatedAtIso = new Date().toISOString();
      } else {
        return res.status(400).json({ error: 'Payload de actualización académica inválido.' });
      }

      centralDb.academicDataset = normalizeAndSyncAcademicDataset(current, centralDb.students);
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'NotasAsistenciaClases',
        'Actualización de notas y asistencias de Clases 1 a 6'
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        academicDataset: centralDb.academicDataset
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || 'Error al actualizar notas o asistencias en la base de datos.'
      });
    }
  };

  app.put('/api/state/academic-dataset', handleAcademicDatasetMutation);
  app.post('/api/academic-dataset/update', handleAcademicDatasetMutation);

  // Endpoint 1: Generar un Mini Reto dinámico a partir de un reactivo del Banco de Preguntas
  app.post('/api/generar-reto', async (req, res) => {
    try {
      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY no configurada en el entorno; se activará la semilla local.'
        });
      }

      const {
        question,
        mechanic,
        mecanicaNombre: bodyMecNombre,
        familia: bodyFamilia,
        instruccionPromptIA: bodyInstruccion
      } = req.body || {};

      const effectiveMechanic = mechanic || {
        nombre: bodyMecNombre || 'Acertijo de Caso Aplicado',
        familia: bodyFamilia || 'Razonamiento Comercial',
        descripcionBreve: bodyInstruccion || 'Caso aplicado de marketing digital'
      };

      if (!question) {
        return res.status(400).json({ ok: false, error: 'Faltan datos del reactivo.' });
      }

      const correctText = question.opciones?.[question.correcta] || '';
      const wrongOptions = ['A', 'B', 'C', 'D']
        .filter((l) => l !== question.correcta)
        .map((l) => question.opciones?.[l])
        .filter(Boolean);

      const prompt = `Transforma el siguiente reactivo del Banco de Preguntas de Marketing Digital (La Dorada, Caldas) en un Mini Reto gamificado de respuesta abierta usando la mecánica "${effectiveMechanic.nombre}" (Familia: ${effectiveMechanic.familia}).

DATOS SEMILLA DEL BANCO DE PREGUNTAS:
- Módulo: ${question.modulo}
- Tema / RAP: ${question.tema} (${question.rap || ''})
- Contexto / Enunciado: ${question.enunciado}
- Concepto / Opción Correcta (Respuesta Esperada del Docente - OCULTA PARA EL ESTUDIANTE): ${correctText}
- Justificación Pedagógica: ${question.justificacion}
- Distractores (Trampas o errores conceptuales): ${wrongOptions.join(' | ')}

REGLAS OBLIGATORIAS:
1. NO muestres opciones múltiples (A, B, C, D). Es un reto de respuesta abierta y razonamiento.
2. Adapta la narrativa al estilo de "${effectiveMechanic.nombre}" (${effectiveMechanic.descripcionBreve}), ambientado en comercios reales de La Dorada, Caldas.
3. NUNCA reveles la respuesta exacta dentro de la narrativa ni dentro de la pista opcional.
4. La preguntaReto debe invitar al estudiante a explicar con sus propias palabras, argumentar o identificar el concepto.`;

      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          systemInstruction:
            'Eres un profesor experto en Marketing Digital y Comportamiento del Consumidor en La Dorada, Caldas. Diseñas mini retos pedagógicos breves, inmersivos y desafiantes.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tituloReto: {
                type: Type.STRING,
                description: 'Título atractivo del mini reto.'
              },
              narrativaReto: {
                type: Type.STRING,
                description: 'Historia o acertijo en el estilo de la mecánica elegida (3 a 6 líneas).'
              },
              preguntaReto: {
                type: Type.STRING,
                description: 'Pregunta abierta clara que debe responder el estudiante.'
              },
              pistaOpcional: {
                type: Type.STRING,
                description: 'Pista orientadora socrática que guía al alumno sin regalarle la respuesta.'
              },
              conceptosClave: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Lista de 4 a 8 palabras clave o sinónimos válidos.'
              },
              criterioEvaluacion60: {
                type: Type.STRING,
                description: 'Criterio resumido para superar el 60% de afinidad semántica.'
              }
            },
            required: [
              'tituloReto',
              'narrativaReto',
              'preguntaReto',
              'pistaOpcional',
              'conceptosClave',
              'criterioEvaluacion60'
            ]
          }
        }
      });

      const rawJson = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawJson);
      return res.json({
        ok: true,
        ...parsed,
        reto: {
          tituloReto: parsed.tituloReto,
          narrativaEscenario: parsed.narrativaReto || parsed.narrativaEscenario,
          preguntaReto: parsed.preguntaReto,
          pistaOpcional: parsed.pistaOpcional,
          conceptosClave: parsed.conceptosClave,
          criterioEvaluacion60: parsed.criterioEvaluacion60,
          respuestaEsperadaDocente: correctText
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Error al generar el mini reto con IA.'
      });
    }
  });

  // Endpoint 2: Evaluar semánticamente la respuesta abierta del estudiante (Umbral 60%)
  app.post('/api/evaluar-reto', async (req, res) => {
    try {
      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY no configurada; se utilizará el evaluador semántico local.'
        });
      }

      const {
        modulo,
        tema,
        mecanicaNombre,
        narrativaReto,
        narrativaEscenario,
        preguntaReto,
        respuestaEsperadaDocente,
        justificacionTeoricaBase,
        conceptosClave,
        criterioEvaluacion60,
        umbralAprobacionPct = 60,
        respuestaEstudiante
      } = req.body || {};

      if (!respuestaEstudiante || !respuestaEsperadaDocente) {
        return res
          .status(400)
          .json({ ok: false, error: 'Falta la respuesta del estudiante o la semilla docente.' });
      }

      const prompt = `Evalúa semánticamente la respuesta abierta de un estudiante de Técnico Profesional en Marketing Digital (La Dorada, Caldas) en el siguiente Mini Reto:

MÓDULO Y TEMA: Módulo ${modulo} - ${tema}
MECÁNICA DEL RETO: ${mecanicaNombre}
NARRATIVA PRESENTADA AL ESTUDIANTE: ${narrativaEscenario || narrativaReto || ''}
PREGUNTA DEL RETO: ${preguntaReto}

SEMILLA OFICIAL DEL DOCENTE (CONTRA LA CUAL EVALUAR):
- Respuesta Esperada Ideal: ${respuestaEsperadaDocente}
- Justificación Teórica del Banco: ${justificacionTeoricaBase || criterioEvaluacion60 || ''}
- Conceptos Clave / Sinónimos Aceptados: ${Array.isArray(conceptosClave) ? conceptosClave.join(', ') : ''}
- Criterio de Aprobación (${umbralAprobacionPct}%): ${criterioEvaluacion60}

RESPUESTA ABIERTA ESCRITA POR EL ESTUDIANTE:
"""
${respuestaEstudiante}
"""

RÚBRICA DE CALIFICACIÓN SEMÁNTICA (0 a 100%):
1. Identificación del concepto o idea central (0 a 40 puntos): Acepta sinónimos válidos, explicaciones con sus propias palabras o errores ortográficos leves.
2. Argumentación y coherencia teórica (0 a 40 puntos): Evalúa si comprende el porqué comercial/psicológico del caso.
3. Originalidad y explicación propia / Técnica Feynman (0 a 20 puntos): Penaliza definiciones genéricas copiadas literalmente de diccionario o chatbots externos; premia si el estudiante usa sus propias palabras, ejemplos locales o metáforas claras.

REGLA DE SEGURIDAD CRÍTICA:
- Si el puntaje total (porcentajeAfinidad) es MENOR a ${umbralAprobacionPct}%, NUNCA reveles ni escribas literalmente la "Respuesta Esperada Ideal" en la retroalimentación ni en la pistaFormativa. Dale únicamente una pista socrática orientadora indicándole qué aspecto le faltó razonar.
- Si el puntaje total es MAYOR O IGUAL a ${umbralAprobacionPct}%, felicítalo con entusiasmo y refuerza el concepto técnico que dominó.`;

      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          systemInstruction:
            'Eres un evaluador pedagógico riguroso pero empático. Evalúas la comprensión conceptual y semántica más allá de la literalidad exacta, protegiendo siempre la respuesta esperada si el alumno aún no aprueba.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              porcentajeAfinidad: {
                type: Type.INTEGER,
                description: 'Puntaje total de 0 a 100 (suma de los 3 criterios de la rúbrica).'
              },
              ganado: {
                type: Type.BOOLEAN,
                description: `True si porcentajeAfinidad >= ${umbralAprobacionPct}, false en caso contrario.`
              },
              retroalimentacion: {
                type: Type.STRING,
                description:
                  'Comentario pedagógico directo para el estudiante (sin filtrar la respuesta correcta si reprobó).'
              },
              pistaFormativa: {
                type: Type.STRING,
                description:
                  'Pista socrática orientadora para el siguiente intento si no alcanzó el umbral (sin regalar la respuesta).'
              },
              desglosePuntaje: {
                type: Type.OBJECT,
                properties: {
                  conceptoClavePct: {
                    type: Type.INTEGER,
                    description: 'Puntaje de 0 a 40 en identificación del concepto clave.'
                  },
                  argumentacionPct: {
                    type: Type.INTEGER,
                    description: 'Puntaje de 0 a 40 en argumentación y coherencia teórica.'
                  },
                  originalidadPct: {
                    type: Type.INTEGER,
                    description: 'Puntaje de 0 a 20 en explicación con sus propias palabras.'
                  }
                },
                required: ['conceptoClavePct', 'argumentacionPct', 'originalidadPct']
              }
            },
            required: [
              'porcentajeAfinidad',
              'ganado',
              'retroalimentacion',
              'pistaFormativa',
              'desglosePuntaje'
            ]
          }
        }
      });

      const rawJson = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawJson);
      return res.json({
        ok: true,
        ...parsed,
        evaluacion: {
          porcentajeIA: parsed.porcentajeAfinidad ?? 0,
          conceptoClavePct: parsed.desglosePuntaje?.conceptoClavePct ?? 0,
          argumentacionTeoricaPct: parsed.desglosePuntaje?.argumentacionPct ?? 0,
          originalidadFeynmanPct: parsed.desglosePuntaje?.originalidadPct ?? 0,
          retroalimentacionIA: parsed.retroalimentacion || '',
          pistaSocratica: parsed.pistaFormativa || ''
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Error al evaluar la respuesta con IA.'
      });
    }
  });

  // Endpoint 3: Ecualizar Psicométricamente con IA (Distractores con Cascarita + Igual Extensión + Mini-Explicación)
  app.post('/api/ecualizar-preguntas-ia', async (req, res) => {
    try {
      const { questionIds, mode = 'all' } = req.body || {};
      const targetIdsSet = Array.isArray(questionIds) ? new Set(questionIds.map(String)) : null;

      // Save snapshot before modifying the bank
      if (centralDb.questions.length > 0) {
        questionsSnapshotCache = centralDb.questions;
        saveQuestionsSnapshotToDisk(questionsSnapshotCache);
      }

      const ai = getGenAIClient();
      let aiRefinedCount = 0;

      // First pass: deterministic psychometric equalization on all targeted (or all) questions
      let updatedBank = centralDb.questions.map((q, idx) => {
        if (targetIdsSet && !targetIdsSet.has(q.id)) return q;
        return equalizeQuestionPsychometrics(q, idx);
      });

      // Second pass: if Gemini API is available and mode is 'ai_sample' or specific questionIds (up to 12 per request for speed), refine with Gemini
      if (ai && (mode === 'ai_deep' || (targetIdsSet && targetIdsSet.size <= 15))) {
        const candidatesForAI = updatedBank
          .filter((q) => (targetIdsSet ? targetIdsSet.has(q.id) : true))
          .slice(0, 10);

        if (candidatesForAI.length > 0) {
          try {
            const prompt = `Actúa como psicometrista experto en evaluación universitaria de Marketing Digital.
Reescribe ÚNICAMENTE los 3 distractores (las opciones INCORRECTAS) de cada una de las siguientes preguntas de examen para eliminar por completo la trampa estudiantil de "elegir la respuesta más larga o la única que tiene explicación".

REGLAS OBLIGATORIAS PARA CADA PREGUNTA:
1. NO cambies la letra correcta ni el sentido verdadero de la opción correcta.
2. Si la opción correcta tiene una mini-explicación o paréntesis técnico, TODOS los 3 distractores también deben incluir un concepto real en paréntesis y una mini-explicación comercial que suene muy convincente ("respuesta con cascarita": usa terminología real de marketing pero aplicada de forma sutilmente incorrecta para el caso).
3. Todas las 4 opciones (A, B, C, D) deben tener prácticamente la MISMA extensión (número de palabras/caracteres), y en al menos 2 distractores la longitud debe ser igual o ligeramente mayor (5% a 12% más larga) que la respuesta correcta.
4. Elimina palabras absurdas o absolutas ("nunca", "siempre", "jamás", "cerrar el local").

PREGUNTAS A ECUALIZAR:
${JSON.stringify(
  candidatesForAI.map((q) => ({
    id: q.id,
    modulo: q.modulo,
    tema: q.tema,
    enunciado: q.enunciado,
    correcta: q.correcta,
    opciones: q.opciones
  }))
)}`;

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: prompt,
              config: {
                systemInstruction:
                  'Eres un psicometrista experto en diseño de exámenes de alta exigencia académica con distractores de camuflaje ("con cascarita") de igual longitud y rigor técnico.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      A: { type: Type.STRING },
                      B: { type: Type.STRING },
                      C: { type: Type.STRING },
                      D: { type: Type.STRING }
                    },
                    required: ['id', 'A', 'B', 'C', 'D']
                  }
                }
              }
            });

            const parsedAI = JSON.parse(response.text?.trim() || '[]');
            if (Array.isArray(parsedAI)) {
              const aiMap = new Map<string, { A: string; B: string; C: string; D: string }>();
              for (const item of parsedAI) {
                if (item && item.id && item.A && item.B && item.C && item.D) {
                  aiMap.set(String(item.id), {
                    A: String(item.A),
                    B: String(item.B),
                    C: String(item.C),
                    D: String(item.D)
                  });
                }
              }
              updatedBank = updatedBank.map((q) => {
                const hit = aiMap.get(q.id);
                if (!hit) return q;
                aiRefinedCount++;
                return {
                  ...q,
                  opciones: {
                    A: q.correcta === 'A' ? q.opciones.A : hit.A,
                    B: q.correcta === 'B' ? q.opciones.B : hit.B,
                    C: q.correcta === 'C' ? q.opciones.C : hit.C,
                    D: q.correcta === 'D' ? q.opciones.D : hit.D
                  }
                };
              });
            }
          } catch {
            // Keep deterministic psychometric equalization if Gemini call times out
          }
        }
      }

      centralDb.questions = equalizeQuestionBank(updatedBank);
      centralDb.questionsRevision += 1;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(
        centralDb,
        'EcualizadorIA',
        `Ecualización psicométrica y camuflaje de opciones con cascarita (${centralDb.questions.length} reactivos)`
      );

      return res.json({
        ok: true,
        revision: centralDb.revision,
        questionsRevision: centralDb.questionsRevision,
        lastModifiedIso: centralDb.lastModifiedIso,
        questionsCount: centralDb.questions.length,
        aiRefinedCount,
        questions: centralDb.questions,
        previousQuestionsSnapshotCount: questionsSnapshotCache ? questionsSnapshotCache.length : 0
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Error al ecualizar psicométricamente el banco de preguntas.'
      });
    }
  });

async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  const distIndexHtml = path.join(distPath, 'index.html');

  if (process.env.NODE_ENV !== 'production' || !fs.existsSync(distIndexHtml)) {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/data/**/*', '**/*.backup*', '**/*.tmp*']
        }
      },
      appType: 'spa'
    });
    app.use((req, res, next) => {
      if (req.url.startsWith('/src/') || req.url === '/' || req.url.startsWith('/?')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        }
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(distIndexHtml);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EvaluaPlus Server running on http://0.0.0.0:${PORT}`);
  });
}

if (!IS_VERCEL) {
  startServer();
}

export default app;
