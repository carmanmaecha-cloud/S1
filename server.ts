import express from 'express';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? '/tmp/evaluaplus-data' : path.join(__dirname, 'data');
const CENTRAL_DB_PATH = path.join(DATA_DIR, 'evaluaplus-central-db.json');
const AUDIT_LOG_PATH = path.join(DATA_DIR, 'evaluaplus-save-audit.json');
const SNAPSHOT_DB_PATH = path.join(DATA_DIR, 'evaluaplus-questions-snapshot.json');

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
  revision: number;
  questionsRevision: number;
  lastModifiedIso: string;
  questionsBankExplicitlyCleared: boolean;
  students: StudentRecord[];
  questions: Question[];
  attempts: ExamAttemptResult[];
  abproEvaluations: ABProProjectEvaluation[];
  liveSessions: LiveClassroomSession[];
  config: SystemConfig;
  customMiniRetos: CustomMiniRetoTemplate[];
  activeExamsByStudent: Record<string, any>;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

ensureDataDir();

function parseRawDbObject(parsed: any): CentralDatabaseState {
  const explicitlyCleared = Boolean(parsed.questionsBankExplicitlyCleared);
  const loadedQuestions = Array.isArray(parsed.questions)
    ? parsed.questions.length > 0
      ? normalizeQuestionList(parsed.questions)
      : explicitlyCleared
      ? []
      : INITIAL_QUESTIONS
    : INITIAL_QUESTIONS;

  const rawStudents: StudentRecord[] =
    Array.isArray(parsed.students) && parsed.students.length > 0
      ? parsed.students
      : INITIAL_STUDENTS;
  const rawAttempts: ExamAttemptResult[] = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  const mergedConfig: SystemConfig = { ...DEFAULT_SERVER_CONFIG, ...(parsed.config || {}) };
  const enrichedStudents = enrichStudentsWithServerSummary(
    rawStudents,
    rawAttempts,
    mergedConfig.notaMinimaAprobacion ?? 3.0
  );

  return {
    initialized: true,
    migratedFromClient: Boolean(parsed.migratedFromClient ?? true),
    revision: Number(parsed.revision) || 1,
    questionsRevision: Number(parsed.questionsRevision) || 1,
    lastModifiedIso: parsed.lastModifiedIso || new Date().toISOString(),
    questionsBankExplicitlyCleared: explicitlyCleared,
    students: enrichedStudents,
    questions: loadedQuestions,
    attempts: rawAttempts,
    abproEvaluations: Array.isArray(parsed.abproEvaluations) ? parsed.abproEvaluations : [],
    liveSessions: Array.isArray(parsed.liveSessions) ? parsed.liveSessions : [],
    config: mergedConfig,
    customMiniRetos:
      Array.isArray(parsed.customMiniRetos) && parsed.customMiniRetos.length > 0
        ? parsed.customMiniRetos
        : INITIAL_CUSTOM_MINI_RETOS,
    activeExamsByStudent:
      parsed.activeExamsByStudent && typeof parsed.activeExamsByStudent === 'object'
        ? parsed.activeExamsByStudent
        : {}
  };
}

function loadCentralDbFromDisk(): CentralDatabaseState {
  ensureDataDir();
  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      const raw = fs.readFileSync(CENTRAL_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parseRawDbObject(parsed);
      }
    }
  } catch (err) {
    console.error('Error loading central DB from disk, initializing defaults:', err);
  }

  const initialDb: CentralDatabaseState = {
    initialized: true,
    migratedFromClient: false,
    revision: 1,
    questionsRevision: 1,
    lastModifiedIso: new Date().toISOString(),
    questionsBankExplicitlyCleared: false,
    students: INITIAL_STUDENTS,
    questions: INITIAL_QUESTIONS,
    attempts: [],
    abproEvaluations: [],
    liveSessions: [],
    config: DEFAULT_SERVER_CONFIG,
    customMiniRetos: INITIAL_CUSTOM_MINI_RETOS,
    activeExamsByStudent: {}
  };
  saveCentralDbToDisk(initialDb);
  return initialDb;
}

function saveCentralDbToDisk(
  db: CentralDatabaseState,
  section = 'AutoSync',
  description = 'Sincronización con base de datos del servidor'
): void {
  ensureDataDir();
  // Always keep every student's server academic summary (completed exams, missing exams, grades, questions, retos) up-to-date in the database
  db.students = enrichStudentsWithServerSummary(
    db.students,
    db.attempts,
    db.config?.notaMinimaAprobacion ?? 3.0
  );
  const serialized = JSON.stringify(db);
  try {
    const tmpPath = `${CENTRAL_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, serialized, 'utf-8');
    fs.renameSync(tmpPath, CENTRAL_DB_PATH);
  } catch (err) {
    console.error('Error saving central DB to disk:', err);
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

  void saveToUpstashRedis(REDIS_KEY_CENTRAL_DB, db);
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
      return;
    }
    const tmpPath = `${SNAPSHOT_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot), 'utf-8');
    fs.renameSync(tmpPath, SNAPSHOT_DB_PATH);
    void saveToUpstashRedis(REDIS_KEY_SNAPSHOT, snapshot);
  } catch (err) {
    console.error('Error saving questions snapshot to disk:', err);
  }
}

let centralDb: CentralDatabaseState = loadCentralDbFromDisk();
let questionsSnapshotCache: Question[] | null = loadQuestionsSnapshotFromDisk();
let lastRedisSyncMs = 0;

async function syncFromUpstashIfConfigured(force = false): Promise<void> {
  if (!getUpstashConfig()) return;
  const now = Date.now();
  if (!force && !IS_VERCEL && now - lastRedisSyncMs < 1500) return;
  lastRedisSyncMs = now;
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
      saveCentralDbToDisk(centralDb);
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
      questionsCount: centralDb.questions.length,
      previousQuestionsSnapshotCount: snapshotCount,
      students: centralDb.students,
      ...(includeQuestions ? { questions: centralDb.questions } : {}),
      attempts: centralDb.attempts,
      abproEvaluations: centralDb.abproEvaluations,
      liveSessions: centralDb.liveSessions,
      config: centralDb.config,
      customMiniRetos: centralDb.customMiniRetos,
      activeExamsByStudent: centralDb.activeExamsByStudent
    });
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

      saveCentralDbToDisk(centralDb);

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
      saveCentralDbToDisk(centralDb);

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

  // 4. PUT /api/state/students — Update full students roster (Teacher CRUD / Bulk actions)
  app.put('/api/state/students', (req, res) => {
    try {
      const { students } = req.body || {};
      if (!Array.isArray(students)) {
        return res.status(400).json({ error: 'Lista de estudiantes inválida.' });
      }
      centralDb.students = students;
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
            (a) => a.attemptId === retoAttempt.attemptId
          );
          const nextModHist = hasAttemptInMod
            ? existingModHist.map((a) =>
                a.attemptId === retoAttempt.attemptId ? retoAttempt : a
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

  // 9. PUT /api/state/config — Update SystemConfig (Teacher settings, schedules, passwords, permissions)
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
      centralDb.migratedFromClient = true;
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

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
          centralDb.liveSessions[existsIdx] = session;
        } else {
          centralDb.liveSessions.unshift(session);
        }
      }
      centralDb.revision += 1;
      centralDb.lastModifiedIso = new Date().toISOString();
      saveCentralDbToDisk(centralDb);

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
      saveCentralDbToDisk(centralDb);

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
        questionsBankExplicitlyCleared
      } = req.body || {};

      if (Array.isArray(students) && students.length > 0) {
        centralDb.students = students;
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
      if (Array.isArray(students) && students.length > 0) {
        centralDb.students = students;
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
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
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
