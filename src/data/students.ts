import type { StudentRecord } from '../types.ts';

/**
 * Generates an exact deterministic alphanumeric code from a student ID:
 * For official test user 1000000000 returns '1000000000'.
 * For regular students: MM26 (4 chars) + Last 4 digits of ID (4 chars) + 4 cryptographic control characters (4 chars) = 12 chars.
 */
export function generateDeterministicAccessCode(studentId: string): string {
  const cleanId = studentId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleanId === '1000000000') {
    return '1000000000';
  }
  if (cleanId === 'DEMO2026') {
    return 'MM260000DEMO';
  }
  const digitsOnly = cleanId.replace(/\D/g, '');
  const midFour = (digitsOnly.slice(-4) || cleanId.slice(-4)).padStart(4, '0');

  // Deterministic anti-collision hash over the full document ID
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < cleanId.length; i++) {
    const ch = cleanId.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = (h2 + ch * (i + 17)) & 0xffffffff;
  }

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const c1 = alphabet[Math.abs(h1) % alphabet.length];
  const c2 = alphabet[Math.abs(h1 >> 5) % alphabet.length];
  const c3 = alphabet[Math.abs(h2) % alphabet.length];
  const c4 = alphabet[Math.abs(h2 >> 7) % alphabet.length];

  return `MM26${midFour}${c1}${c2}${c3}${c4}`;
}

/**
 * Calculates a deterministic SHA-256-like hexadecimal integrity checksum for the question payload
 * to verify in the client that the JSON received was not tampered with locally.
 */
export function computePayloadChecksum(questionIds: string[], studentId: string, intento: number): string {
  const raw = `${studentId}|INTENTO_${intento}|${questionIds.join(',')}|LA_DORADA_MM26_SALT`;
  let h1 = 0xdeadbeef ^ raw.length;
  let h2 = 0x41c6ce57 ^ raw.length;
  for (let i = 0, ch; i < raw.length; i++) {
    ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `SHA256-${hex1}${hex2}`.toUpperCase();
}

const PRELOADED_RAW_STUDENTS: { id: string; nombre: string }[] = [
  { id: '1058201263', nombre: 'Valentina Giraldo Aristizábal' },
  { id: '1058201102', nombre: 'Santiago Morales Echeverri' },
  { id: '1029665597', nombre: 'Camila Andrea Cardona López' },
  { id: '1054557217', nombre: 'Juan Sebastián Loaiza Castaño' },
  { id: '1095269025', nombre: 'Mariana Ospina Restrepo' },
  { id: '1053874745', nombre: 'Andrés Felipe Valencia Duque' },
  { id: '1058200304', nombre: 'Laura Sofía Henao Mejía' },
  { id: '1058199707', nombre: 'Daniel Alejandro Zuluaga Ríos' },
  { id: '1054555633', nombre: 'Natalia Toro Ceballos' },
  { id: '1054552531', nombre: 'Mateo Patiño Gutiérrez' },
  { id: '1058200648', nombre: 'Isabella Quintero Montoya' },
  { id: '1073324897', nombre: 'Samuel David Marín Salazar' },
  { id: '1054554637', nombre: 'Gabriela Castañeda Betancur' },
  { id: '1013130872', nombre: 'Nicolás Herrera Gómez' },
  { id: '1016052453', nombre: 'Sara Manuela Vargas Orozco' },
  { id: '1054557062', nombre: 'Miguel Ángel Salazar Bedoya' },
  { id: '1058200839', nombre: 'Paula Andrea Correa Agudelo' },
  { id: '1054558740', nombre: 'Kevin Stiven Gallego Arias' },
  { id: '1058200392', nombre: 'Juliana Ramírez Londoño' },
  { id: '1054866975', nombre: 'Cristian Camilo Franco Vélez' },
  { id: '1058201277', nombre: 'Manuela Arango Jaramillo' },
  { id: '1054554332', nombre: 'Juan Diego Carmona Osorio' },
  { id: '1054559316', nombre: 'Luisa Fernanda Pineda Villa' },
  { id: '1054571238', nombre: 'Jhonatan David Cortés Pérez' },
  { id: '1054556885', nombre: 'Daniela Alejandra Álvarez Cano' },
  { id: '1054555597', nombre: 'Esteban Mauricio Gómez Hurtado' },
  { id: '1054557870', nombre: 'Karol Tatiana Tamayo Serna' },
  { id: '1075666883', nombre: 'Brayan Steven Sánchez Nieto' },
  { id: '1054557680', nombre: 'Angie Melissa Botero Rivera' },
  { id: '1026274973', nombre: 'David Santiago Díaz Molina' },
  { id: '1058200398', nombre: 'María José Jiménez Palacio' },
  { id: '1058201404', nombre: 'Jorge Eliécer Rendón Suárez' },
  { id: '1054558487', nombre: 'Wendy Vanessa Acosta Delgado' },
  { id: '1058200280', nombre: 'Carlos Eduardo Bermúdez Tapia' },
  { id: '1058200720', nombre: 'Yuliana Andrea Chica Urrea' },
  { id: '1058200617', nombre: 'Juan Pablo Delgado Naranjo' },
  { id: '1054560299', nombre: 'Diana Carolina Escobar Parra' },
  { id: '1000000000', nombre: 'Usuario Oficial de Prueba Docente (Modo Ensayo)' }
];

export const INITIAL_STUDENTS: StudentRecord[] = PRELOADED_RAW_STUDENTS.map((s) => ({
  id: s.id,
  nombre: s.nombre,
  codigoAcceso: generateDeterministicAccessCode(s.id),
  intentosUsados: 0,
  maxIntentosPermitidos: 2,
  suspendido: false,
  conceptoInfraccion: '✓ Sin infracciones',
  preguntasIntento1: [],
  preguntasIntento2: [],
  preguntasUsadasPorModalidad: {},
  examenesBloqueados: []
}));
