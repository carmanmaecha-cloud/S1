import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Question } from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const COLLECTION_NAME = 'evaluaplus_cloud_state';

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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

void testFirestoreConnection();

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
): Promise<void> {
  const path = `${COLLECTION_NAME}/${shardId}`;
  try {
    const serialized = JSON.stringify(payload ?? null);
    const data: ShardEnvelope = {
      shardType,
      revision: Math.max(0, Number(revision) || 1),
      updatedIso: String(updatedIso || new Date().toISOString()).slice(0, 64),
      payloadJson: serialized.length <= 890000 ? serialized : 'null'
    };
    if (typeof questionsRevision === 'number') {
      data.questionsRevision = Math.max(0, questionsRevision);
    }
    if (typeof chunkCount === 'number') {
      data.chunkCount = Math.min(50, Math.max(0, chunkCount));
    }
    await setDoc(doc(db, COLLECTION_NAME, shardId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function readShard<T>(shardId: string): Promise<{
  envelope: ShardEnvelope;
  parsed: T;
} | null> {
  const path = `${COLLECTION_NAME}/${shardId}`;
  try {
    const snap = await getDoc(doc(db, COLLECTION_NAME, shardId));
    if (!snap.exists()) return null;
    const envelope = snap.data() as ShardEnvelope;
    if (!envelope || typeof envelope.payloadJson !== 'string') return null;
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
  },
  options: { includeQuestions?: boolean } = { includeQuestions: true }
): Promise<boolean> {
  try {
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

    const promises: Promise<void>[] = [
      writeShard('meta', 'meta', rev, iso, metaPayload, qRev, qChunks.length),
      writeShard('config', 'config', rev, iso, state.config || {}, qRev),
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
          activeExamsByStudent: state.activeExamsByStudent || {}
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
      }>('extras')
    ]);

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
      config: configShard?.parsed || {},
      customMiniRetos: Array.isArray(extras.customMiniRetos) ? extras.customMiniRetos : [],
      activeExamsByStudent:
        extras.activeExamsByStudent && typeof extras.activeExamsByStudent === 'object'
          ? extras.activeExamsByStudent
          : {}
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
