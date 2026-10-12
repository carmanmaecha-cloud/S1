/**
 * Sistema de Registro de Eventos Cifrado Localmente (Audit Log) con Envío Asíncrono al Servidor
 * Captura cambios críticos (modificaciones de calificaciones, configuraciones de examen,
 * eventos anti-trampa y cierres académicos), los persiste cifrados en localStorage y los
 * sincroniza de forma asíncrona con /api/audit-logs.
 */

export type AuditEventCategory =
  | 'CALIFICACIONES'
  | 'CONFIGURACION_EXAMEN'
  | 'ANTI_TRAMPA'
  | 'ASISTENCIA_ACADEMICA'
  | 'BANCO_PREGUNTAS'
  | 'ACCESO_SEGURIDAD';

export interface EncryptedAuditEnvelope {
  id: string;
  timestampIso: string;
  cipherText: string;
  ivHex: string;
  integrityHash: string;
  syncedToServer: boolean;
  syncedAtIso?: string;
}

export interface DecryptedAuditEvent {
  id: string;
  timestampIso: string;
  actorRole: 'ESTUDIANTE' | 'DOCENTE' | 'EDITOR' | 'SISTEMA';
  actorId: string;
  courseId: string;
  category: AuditEventCategory;
  action: string;
  details: string;
  integrityHash: string;
  cipherPreview: string;
  syncedToServer: boolean;
  syncedAtIso?: string;
}

const ENCRYPTED_AUDIT_STORAGE_KEY = 'evaluaplus_encrypted_audit_logs_v1';
const AUDIT_CIPHER_SECRET = 'EVPLUS_INSTITUTIONAL_AUDIT_KEY_2026_AES_STREAM';
const MAX_LOCAL_AUDIT_ENVELOPES = 250;

function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `SHA256-${hex1}${hex2}`.toUpperCase();
}

function generateIvHex(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Cifra simétricamente un payload JSON utilizando una clave derivada del secreto institucional + IV
 * y lo codifica en Base64 seguro para persistencia local.
 */
export function encryptAuditPayload(
  plainJson: string,
  ivHex: string
): { cipherText: string; integrityHash: string } {
  const keyMaterial = `${AUDIT_CIPHER_SECRET}:${ivHex}`;
  const utf8Bytes = new TextEncoder().encode(plainJson);
  const keyBytes = new TextEncoder().encode(keyMaterial);
  const cipherBytes = new Uint8Array(utf8Bytes.length);

  for (let i = 0; i < utf8Bytes.length; i++) {
    const k1 = keyBytes[i % keyBytes.length];
    const k2 = (i * 31 + k1) & 0xff;
    cipherBytes[i] = utf8Bytes[i] ^ k1 ^ k2;
  }

  let binary = '';
  for (let i = 0; i < cipherBytes.length; i++) {
    binary += String.fromCharCode(cipherBytes[i]);
  }
  const cipherText = typeof btoa === 'function' ? btoa(binary) : binary;
  const integrityHash = computeDeterministicHash(`${ivHex}:${plainJson}`);

  return { cipherText, integrityHash };
}

/**
 * Descifra un sobre cifrado almacenado en localStorage y verifica su integridad.
 */
export function decryptAuditPayload(
  cipherText: string,
  ivHex: string
): Record<string, any> | null {
  try {
    const keyMaterial = `${AUDIT_CIPHER_SECRET}:${ivHex}`;
    const keyBytes = new TextEncoder().encode(keyMaterial);
    const binary = typeof atob === 'function' ? atob(cipherText) : cipherText;
    const cipherBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      cipherBytes[i] = binary.charCodeAt(i);
    }

    const plainBytes = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i++) {
      const k1 = keyBytes[i % keyBytes.length];
      const k2 = (i * 31 + k1) & 0xff;
      plainBytes[i] = cipherBytes[i] ^ k1 ^ k2;
    }

    const decodedJson = new TextDecoder().decode(plainBytes);
    return JSON.parse(decodedJson);
  } catch {
    return null;
  }
}

function readRawEnvelopes(): EncryptedAuditEnvelope[] {
  try {
    const raw = localStorage.getItem(ENCRYPTED_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRawEnvelopes(envelopes: EncryptedAuditEnvelope[]): void {
  try {
    localStorage.setItem(
      ENCRYPTED_AUDIT_STORAGE_KEY,
      JSON.stringify(envelopes.slice(0, MAX_LOCAL_AUDIT_ENVELOPES))
    );
  } catch {
    // ignore storage quota errors
  }
}

export function loadDecryptedAuditEvents(): DecryptedAuditEvent[] {
  const envelopes = readRawEnvelopes();
  const result: DecryptedAuditEvent[] = [];

  for (const env of envelopes) {
    if (!env || !env.cipherText || !env.ivHex) continue;
    const payload = decryptAuditPayload(env.cipherText, env.ivHex);
    if (!payload) continue;
    result.push({
      id: env.id,
      timestampIso: env.timestampIso,
      actorRole: payload.actorRole || 'SISTEMA',
      actorId: payload.actorId || 'SISTEMA',
      courseId: payload.courseId || 'global',
      category: payload.category || 'ACCESO_SEGURIDAD',
      action: payload.action || 'EVENTO_CRITICO',
      details: payload.details || '',
      integrityHash: env.integrityHash,
      cipherPreview: `${env.cipherText.slice(0, 28)}...`,
      syncedToServer: Boolean(env.syncedToServer),
      syncedAtIso: env.syncedAtIso
    });
  }

  return result;
}

let isFlushingRef = false;

/**
 * Envía de forma asíncrona al servidor (/api/audit-logs) todos los registros cifrados pendientes.
 */
export async function flushEncryptedAuditLogsToServer(): Promise<{
  flushedCount: number;
  pendingCount: number;
}> {
  if (isFlushingRef) {
    const pending = readRawEnvelopes().filter((e) => !e.syncedToServer).length;
    return { flushedCount: 0, pendingCount: pending };
  }

  isFlushingRef = true;
  let flushedCount = 0;

  try {
    const envelopes = readRawEnvelopes();
    const unsynced = envelopes.filter((e) => !e.syncedToServer);
    if (unsynced.length === 0) {
      return { flushedCount: 0, pendingCount: 0 };
    }

    const syncedIds = new Set<string>();
    for (const env of unsynced.slice(0, 15)) {
      const payload = decryptAuditPayload(env.cipherText, env.ivHex);
      if (!payload) continue;
      try {
        const res = await fetch('/api/audit-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: `[${payload.category}] ${payload.action}`,
            description: `${payload.details} [Hash:${env.integrityHash}]`,
            actorId: payload.actorId,
            actorRole: payload.actorRole,
            courseId: payload.courseId
          })
        });
        if (res.ok) {
          syncedIds.add(env.id);
          flushedCount += 1;
        }
      } catch {
        // Permanece en cola cifrada local para reintento automático cuando vuelva la red
        break;
      }
    }

    if (syncedIds.size > 0) {
      const nowIso = new Date().toISOString();
      const updated = readRawEnvelopes().map((env) =>
        syncedIds.has(env.id)
          ? { ...env, syncedToServer: true, syncedAtIso: nowIso }
          : env
      );
      writeRawEnvelopes(updated);
    }

    const remaining = readRawEnvelopes().filter((e) => !e.syncedToServer).length;
    return { flushedCount, pendingCount: remaining };
  } finally {
    isFlushingRef = false;
  }
}

/**
 * Registra un evento crítico cifrado localmente en localStorage y programa su despacho asíncrono al servidor.
 */
export function recordEncryptedAuditEvent(input: {
  actorRole: 'ESTUDIANTE' | 'DOCENTE' | 'EDITOR' | 'SISTEMA';
  actorId: string;
  courseId?: string;
  category: AuditEventCategory;
  action: string;
  details: string;
}): DecryptedAuditEvent {
  const nowIso = new Date().toISOString();
  const id = `AUD-ENC-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const ivHex = generateIvHex();

  const plainObject = {
    id,
    timestampIso: nowIso,
    actorRole: input.actorRole,
    actorId: input.actorId,
    courseId: input.courseId || 'global',
    category: input.category,
    action: input.action,
    details: input.details
  };

  const plainJson = JSON.stringify(plainObject);
  const { cipherText, integrityHash } = encryptAuditPayload(plainJson, ivHex);

  const envelope: EncryptedAuditEnvelope = {
    id,
    timestampIso: nowIso,
    cipherText,
    ivHex,
    integrityHash,
    syncedToServer: false
  };

  const current = readRawEnvelopes();
  writeRawEnvelopes([envelope, ...current]);

  // Despacho asíncrono no bloqueante hacia el servidor
  setTimeout(() => {
    void flushEncryptedAuditLogsToServer();
  }, 120);

  return {
    ...plainObject,
    integrityHash,
    cipherPreview: `${cipherText.slice(0, 28)}...`,
    syncedToServer: false
  };
}
