import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  disableNetwork,
  terminate,
  setLogLevel
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Question } from '../types';

// Silence internal @firebase/firestore GrpcConnection backoff logs immediately on load
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const COLLECTION_NAME = 'evaluaplus_cloud_state';
const QUOTA_STORAGE_KEY = 'evaluaplus_firestore_quota_exhausted_at_v1';

// Circuit breaker for Firestore free-tier daily quota exhaustion
let firestoreQuotaExhausted = false;
let firestoreQuotaExhaustedAtMs = 0;
let firestoreTerminated = false;
const QUOTA_COOLDOWN_MS = 1000 * 60 * 60 * 6; // 6 hours cooldown when daily quota is exhausted
const WRITE_TIMEOUT_MS = 2500;
const lastShardPayloadCache = new Map<string, string>();

// Restore persisted quota circuit breaker if available in browser
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const savedTs = Number(window.localStorage.getItem(QUOTA_STORAGE_KEY) || '0');
    if (savedTs > 0 && Date.now() - savedTs < QUOTA_COOLDOWN_MS) {
      firestoreQuotaExhausted = true;
      firestoreQuotaExhaustedAtMs = savedTs;
    }
  }
} catch {
  // ignore
}

function isQuotaExhaustedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const code = (error as any)?.code || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('write_timeout')
  );
}

function tripQuotaCircuitBreaker(): void {
  firestoreQuotaExhausted = true;
  firestoreQuotaExhaustedAtMs = Date.now();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(QUOTA_STORAGE_KEY, String(firestoreQuotaExhaustedAtMs));
    }
  } catch {
    // ignore
  }
  try {
    setLogLevel('silent');
    void disableNetwork(db).catch(() => {});
    if (!firestoreTerminated) {
      firestoreTerminated = true;
      void terminate(db).catch(() => {});
    }
  } catch {
    // ignore
  }
}

function canUseFirestore(): boolean {
  if (firestoreTerminated) return false;
  if (!firestoreQuotaExhausted) return true;
  if (Date.now() - firestoreQuotaExhaustedAtMs > QUOTA_COOLDOWN_MS) {
    firestoreQuotaExhausted = false;
    return true;
  }
  return false;
}

export function isFirestoreQuotaExhausted(): boolean {
  return firestoreQuotaExhausted;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  if (isQuotaExhaustedError(error)) {
    tripQuotaCircuitBreaker();
    return null;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: true,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  return errInfo;
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (!canUseFirestore()) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      tripQuotaCircuitBreaker();
      return false;
    }
    return false;
  }
}

const MAX_QUESTIONS_PER_SHARD = 200;

interface ShardEnvelope {
  shardType: string;
  revision: number;
  questionsRevision?: number;
  updatedIso: string;
  payloadJson: string;
  chunkCount?: number;
}

async function writeShard(
  shardId: string,
  shardType: string,
  revision: number,
  updatedIso: string,
  payload: unknown,
  questionsRevision?: number,
  chunkCount?: number
): Promise<boolean> {
  if (!canUseFirestore()) return false;
  const path = `${COLLECTION_NAME}/${shardId}`;
  try {
    const serialized = JSON.stringify(payload ?? null);
    const safePayloadJson = serialized.length <= 890000 ? serialized : 'null';

    // Deduplicate writes: skip writing non-meta shards if their exact payload has not changed
    if (shardId !== 'meta' && lastShardPayloadCache.get(shardId) === safePayloadJson) {
      return true;
    }

    const data: ShardEnvelope = {
      shardType,
      revision: Math.max(0, Number(revision) || 1),
      updatedIso: String(updatedIso || new Date().toISOString()).slice(0, 64),
      payloadJson: safePayloadJson
    };
    if (typeof questionsRevision === 'number') {
      data.questionsRevision = Math.max(0, questionsRevision);
    }
    if (typeof chunkCount === 'number') {
      data.chunkCount = Math.min(50, Math.max(0, chunkCount));
    }

    // Enforce a strict timeout on setDoc because Firestore SDK does not reject on RESOURCE_EXHAUSTED
    // (it enters an internal maximum-backoff retry loop unless timed out and terminated).
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        setDoc(doc(db, COLLECTION_NAME, shardId), data),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('write_timeout')), WRITE_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    lastShardPayloadCache.set(shardId, safePayloadJson);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

async function readShard<T>(shardId: string): Promise<{
  envelope: ShardEnvelope;
  parsed: T;
} | null> {
  if (!canUseFirestore()) return null;
  const path = `${COLLECTION_NAME}/${shardId}`;
  try {
    const snap = await getDoc(doc(db, COLLECTION_NAME, shardId));
    if (!snap.exists()) return null;
    const envelope = snap.data() as ShardEnvelope;
    if (!envelope || typeof envelope.payloadJson !== 'string') return null;
    lastShardPayloadCache.set(shardId, envelope.payloadJson);
    const parsed = JSON.parse(envelope.payloadJson) as T;
    return { envelope, parsed };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export interface CloudMetaPayload {
  initialized: boolean;
  migratedFromClient: boolean;
  revision: number;
  questionsRevision: number;
  lastModifiedIso: string;
  questionsBankExplicitlyCleared: boolean;
  studentsExplicitlyCleared: boolean;
  questionChunkCount: number;
  snapshotChunkCount: number;
}

export async function saveCentralStateToFirestore(
  state: {
    initialized: boolean;
    migratedFromClient: boolean;
    revision: number;
    questionsRevision: number;
    lastModifiedIso: string;
    questionsBankExplicitlyCleared: boolean;
    studentsExplicitlyCleared?: boolean;
    students: any[];
    questions: Question[];
    attempts: any[];
    abproEvaluations: any[];
    liveSessions: any[];
    config: any;
    customMiniRetos: any[];
    activeExamsByStudent: Record<string, any>;
    academicDataset?: any;
  },
  options: { includeQuestions?: boolean } = { includeQuestions: true }
): Promise<boolean> {
  try {
    if (!canUseFirestore()) return false;
    const rev = Math.max(1, Number(state.revision) || 1);
    const qRev = Math.max(1, Number(state.questionsRevision) || 1);
    const iso = state.lastModifiedIso || new Date().toISOString();

    const questionsArr = Array.isArray(state.questions) ? state.questions : [];
    const qChunks: Question[][] = [];
    for (let i = 0; i < questionsArr.length; i += MAX_QUESTIONS_PER_SHARD) {
      qChunks.push(questionsArr.slice(i, i + MAX_QUESTIONS_PER_SHARD));
    }

    const metaPayload: CloudMetaPayload = {
      initialized: true,
      migratedFromClient: Boolean(state.migratedFromClient ?? true),
      revision: rev,
      questionsRevision: qRev,
      lastModifiedIso: iso,
      questionsBankExplicitlyCleared: Boolean(state.questionsBankExplicitlyCleared),
      studentsExplicitlyCleared: Boolean(
        state.studentsExplicitlyCleared ?? (Array.isArray(state.students) && state.students.length === 0)
      ),
      questionChunkCount: qChunks.length,
      snapshotChunkCount: 0
    };

    // Probe meta write first so if daily quota is exhausted we trip the circuit breaker immediately
    // without queueing multiple concurrent write streams.
    const metaOk = await writeShard('meta', 'meta', rev, iso, metaPayload, qRev, qChunks.length);
    if (!metaOk || !canUseFirestore()) {
      return false;
    }

    const configSerialized = JSON.stringify(state.config || {});
    const MAX_CONFIG_CHUNK_CHARS = 700000;
    const configPromises: Promise<boolean>[] = [];
    if (configSerialized.length <= MAX_CONFIG_CHUNK_CHARS) {
      configPromises.push(writeShard('config', 'config', rev, iso, state.config || {}, qRev));
    } else {
      const configChunks: string[] = [];
      for (let i = 0; i < configSerialized.length; i += MAX_CONFIG_CHUNK_CHARS) {
        configChunks.push(configSerialized.slice(i, i + MAX_CONFIG_CHUNK_CHARS));
      }
      configPromises.push(
        writeShard(
          'config',
          'config',
          rev,
          iso,
          { __chunkedConfig: true, chunkCount: configChunks.length },
          qRev,
          configChunks.length
        )
      );
      configChunks.forEach((chunkStr, cIdx) => {
        configPromises.push(
          writeShard(`config_chunk_${cIdx}`, 'config_chunk', rev, iso, chunkStr, qRev)
        );
      });
    }

    const promises: Promise<boolean>[] = [
      ...configPromises,
      writeShard('students', 'students', rev, iso, state.students || [], qRev),
      writeShard('attempts', 'attempts', rev, iso, (state.attempts || []).slice(0, 800), qRev),
      writeShard(
        'extras',
        'extras',
        rev,
        iso,
        {
          abproEvaluations: state.abproEvaluations || [],
          liveSessions: state.liveSessions || [],
          customMiniRetos: state.customMiniRetos || [],
          activeExamsByStudent: state.activeExamsByStudent || {},
          academicDataset: state.academicDataset || null
        },
        qRev
      )
    ];

    if (options.includeQuestions !== false) {
      for (let idx = 0; idx < qChunks.length; idx++) {
        promises.push(
          writeShard(
            `questions_${idx}`,
            'questions',
            rev,
            iso,
            qChunks[idx],
            qRev,
            qChunks.length
          )
        );
      }
    }

    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error('Error saving state to Firestore:', err);
    return false;
  }
}

export async function loadCentralStateFromFirestore(
  options: { includeQuestions?: boolean } = { includeQuestions: true }
): Promise<{
  initialized: boolean;
  migratedFromClient: boolean;
  revision: number;
  questionsRevision: number;
  lastModifiedIso: string;
  questionsBankExplicitlyCleared: boolean;
  studentsExplicitlyCleared: boolean;
  students: any[];
  questions?: Question[];
  attempts: any[];
  abproEvaluations: any[];
  liveSessions: any[];
  config: any;
  customMiniRetos: any[];
  activeExamsByStudent: Record<string, any>;
  academicDataset?: any;
} | null> {
  try {
    const metaShard = await readShard<CloudMetaPayload>('meta');
    if (!metaShard || !metaShard.parsed) return null;

    const meta = metaShard.parsed;
    const [configShard, studentsShard, attemptsShard, extrasShard] = await Promise.all([
      readShard<any>('config'),
      readShard<any[]>('students'),
      readShard<any[]>('attempts'),
      readShard<{
        abproEvaluations?: any[];
        liveSessions?: any[];
        customMiniRetos?: any[];
        activeExamsByStudent?: Record<string, any>;
        academicDataset?: any;
      }>('extras')
    ]);

    let resolvedConfig: any = configShard?.parsed || {};
    if (resolvedConfig && resolvedConfig.__chunkedConfig && Number(resolvedConfig.chunkCount) > 0) {
      const cCount = Math.min(20, Math.max(0, Number(resolvedConfig.chunkCount) || 0));
      const cPromises = [];
      for (let i = 0; i < cCount; i++) {
        cPromises.push(readShard<string>(`config_chunk_${i}`));
      }
      const cShards = await Promise.all(cPromises);
      const joined = cShards.map((s) => (s && typeof s.parsed === 'string' ? s.parsed : '')).join('');
      if (joined) {
        try {
          resolvedConfig = JSON.parse(joined);
        } catch {
          resolvedConfig = {};
        }
      }
    }

    let loadedQuestions: Question[] | undefined = undefined;
    if (options.includeQuestions !== false) {
      const chunkCount = Math.min(25, Math.max(0, Number(meta.questionChunkCount) || 0));
      if (chunkCount === 0) {
        loadedQuestions = [];
      } else {
        const chunkPromises = [];
        for (let i = 0; i < chunkCount; i++) {
          chunkPromises.push(readShard<Question[]>(`questions_${i}`));
        }
        const chunkShards = await Promise.all(chunkPromises);
        const combined: Question[] = [];
        for (const cs of chunkShards) {
          if (cs && Array.isArray(cs.parsed)) {
            combined.push(...cs.parsed);
          }
        }
        loadedQuestions = combined;
      }
    }

    const extras = extrasShard?.parsed || {};

    return {
      initialized: true,
      migratedFromClient: Boolean(meta.migratedFromClient ?? true),
      revision: Number(meta.revision) || 1,
      questionsRevision: Number(meta.questionsRevision) || 1,
      lastModifiedIso: meta.lastModifiedIso || metaShard.envelope.updatedIso,
      questionsBankExplicitlyCleared: Boolean(meta.questionsBankExplicitlyCleared),
      studentsExplicitlyCleared: Boolean(meta.studentsExplicitlyCleared),
      students: Array.isArray(studentsShard?.parsed) ? studentsShard!.parsed : [],
      ...(loadedQuestions !== undefined ? { questions: loadedQuestions } : {}),
      attempts: Array.isArray(attemptsShard?.parsed) ? attemptsShard!.parsed : [],
      abproEvaluations: Array.isArray(extras.abproEvaluations) ? extras.abproEvaluations : [],
      liveSessions: Array.isArray(extras.liveSessions) ? extras.liveSessions : [],
      config: resolvedConfig,
      customMiniRetos: Array.isArray(extras.customMiniRetos) ? extras.customMiniRetos : [],
      activeExamsByStudent:
        extras.activeExamsByStudent && typeof extras.activeExamsByStudent === 'object'
          ? extras.activeExamsByStudent
          : {},
      academicDataset: extras.academicDataset || null
    };
  } catch (err) {
    console.error('Error loading state from Firestore:', err);
    return null;
  }
}

export async function saveQuestionsSnapshotToFirestore(
  snapshot: Question[] | null,
  revision: number
): Promise<void> {
  try {
    const iso = new Date().toISOString();
    const list = Array.isArray(snapshot) ? snapshot : [];
    const chunks: Question[][] = [];
    for (let i = 0; i < list.length; i += MAX_QUESTIONS_PER_SHARD) {
      chunks.push(list.slice(i, i + MAX_QUESTIONS_PER_SHARD));
    }
    await writeShard(
      'snapshot_meta',
      'snapshot',
      revision,
      iso,
      { count: list.length, chunkCount: chunks.length },
      revision,
      chunks.length
    );
    const promises = chunks.map((ch, idx) =>
      writeShard(`snapshot_${idx}`, 'snapshot', revision, iso, ch, revision, chunks.length)
    );
    await Promise.all(promises);
  } catch (err) {
    console.error('Error saving snapshot to Firestore:', err);
  }
}

export async function loadQuestionsSnapshotFromFirestore(): Promise<Question[] | null> {
  try {
    const meta = await readShard<{ count: number; chunkCount: number }>('snapshot_meta');
    if (!meta || !meta.parsed || !meta.parsed.chunkCount) return null;
    const chunkCount = Math.min(25, Math.max(0, Number(meta.parsed.chunkCount) || 0));
    const promises = [];
    for (let i = 0; i < chunkCount; i++) {
      promises.push(readShard<Question[]>(`snapshot_${i}`));
    }
    const shards = await Promise.all(promises);
    const all: Question[] = [];
    for (const s of shards) {
      if (s && Array.isArray(s.parsed)) {
        all.push(...s.parsed);
      }
    }
    return all.length > 0 ? all : null;
  } catch {
    return null;
  }
}
