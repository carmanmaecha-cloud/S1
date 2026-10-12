import * as XLSX from 'xlsx';
import { BloomLevel, Question, StudentRecord } from '../types';
import { generateDeterministicAccessCode } from '../data/students';
import { normalizeQuestionList } from '../data/questions';

export interface ParsedStudentRow {
  id: string;
  nombre: string;
  codigoAcceso?: string;
  correo?: string;
  whatsapp?: string;
}

const HEADER_ID_KEYWORDS = [
  'id',
  'documento',
  'cedula',
  'cédula',
  'identificacion',
  'identificación',
  'nro documento',
  'numero documento',
  'número documento',
  'num documento',
  'doc',
  'cc',
  'ti',
  'codigo estudiante',
  'código estudiante',
  'id estudiante'
];

const HEADER_NAME_KEYWORDS = [
  'nombre',
  'nombres',
  'nombre completo',
  'estudiante',
  'alumno',
  'apellidos y nombres',
  'nombres y apellidos',
  'participante'
];

const HEADER_LASTNAME_KEYWORDS = ['apellido', 'apellidos', 'primer apellido', 'segundo apellido'];

const HEADER_CODE_KEYWORDS = [
  'codigo acceso',
  'código acceso',
  'codigo de acceso',
  'código de acceso',
  'clave',
  'pin',
  'token',
  'mm26'
];

const HEADER_EMAIL_KEYWORDS = [
  'correo',
  'correo electronico',
  'correo electrónico',
  'email',
  'e mail',
  'mail',
  'correo institucional',
  'correo personal'
];

const HEADER_WHATSAPP_KEYWORDS = [
  'whatsapp',
  'numero de whatsapp',
  'número de whatsapp',
  'num whatsapp',
  'nro whatsapp',
  'celular',
  'telefono',
  'teléfono',
  'movil',
  'móvil',
  'contacto',
  'tel',
  'cel'
];

function cleanCellString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    // Avoid scientific notation for large IDs
    return Math.trunc(val).toString();
  }
  return String(val).trim();
}

function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeDocumentId(raw: string): boolean {
  const cleaned = raw.replace(/[\s.\-,]/g, '');
  // Standard Colombian document IDs or student codes: 5 to 15 digits/alphanumeric, mostly digits
  if (/^\d{5,15}$/.test(cleaned)) return true;
  if (/^[A-Za-z0-9]{6,15}$/.test(cleaned) && /\d{4,}/.test(cleaned) && !/^MM26/i.test(cleaned)) {
    return true;
  }
  return false;
}

function looksLikeAccessCode(raw: string): boolean {
  const cleaned = raw.trim().toUpperCase();
  return /^MM26[A-Z0-9]{4,16}$/.test(cleaned);
}

function looksLikePersonName(raw: string): boolean {
  const cleaned = raw.trim();
  if (cleaned.length < 3) return false;
  if (cleaned.includes('@')) return false;
  if (/^\d+$/.test(cleaned.replace(/[\s.\-,+()]/g, ''))) return false;
  // Must contain letters and no more than 20% digits
  const letters = (cleaned.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;
  return letters >= 3;
}

function looksLikeEmail(raw: string): boolean {
  const cleaned = raw.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
}

function looksLikeWhatsappPhone(raw: string): boolean {
  const cleaned = raw.trim();
  if (!cleaned || cleaned.includes('@') || /^MM26/i.test(cleaned)) return false;
  if (/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(cleaned)) return false;
  const digitsOnly = cleaned.replace(/\D/g, '');
  // Standard phone / WhatsApp numbers: 7 to 15 digits (e.g., 3001234567 or +57 300 123 4567)
  if (cleaned.startsWith('+') && digitsOnly.length >= 9 && digitsOnly.length <= 15) {
    return true;
  }
  if (/^3\d{9}$/.test(digitsOnly) || /^573\d{9}$/.test(digitsOnly)) {
    return true;
  }
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Parses a 2D array of rows (from Excel worksheet or CSV) into Student rows.
 */
export function extractStudentsFromMatrix(rows: unknown[][]): ParsedStudentRow[] {
  const results: ParsedStudentRow[] = [];
  if (!Array.isArray(rows) || rows.length === 0) return results;

  let idColIdx = -1;
  let nameColIdx = -1;
  let lastNameColIdx = -1;
  let codeColIdx = -1;
  let emailColIdx = -1;
  let whatsappColIdx = -1;
  let headerRowIdx = -1;

  // 1. Try to find a header row in the first 15 rows
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let foundId = -1;
    let foundName = -1;
    let foundLastName = -1;
    let foundCode = -1;
    let foundEmail = -1;
    let foundWhatsapp = -1;

    row.forEach((cell, cIdx) => {
      const h = normalizeHeader(cleanCellString(cell));
      if (!h) return;

      if (
        foundId === -1 &&
        HEADER_ID_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundId = cIdx;
      } else if (
        foundEmail === -1 &&
        HEADER_EMAIL_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundEmail = cIdx;
      } else if (
        foundWhatsapp === -1 &&
        HEADER_WHATSAPP_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundWhatsapp = cIdx;
      } else if (
        foundCode === -1 &&
        HEADER_CODE_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundCode = cIdx;
      } else if (
        foundName === -1 &&
        HEADER_NAME_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundName = cIdx;
      } else if (
        foundLastName === -1 &&
        HEADER_LASTNAME_KEYWORDS.some((kw) => h === kw || h.includes(kw))
      ) {
        foundLastName = cIdx;
      }
    });

    if (foundId !== -1 && (foundName !== -1 || foundLastName !== -1)) {
      idColIdx = foundId;
      nameColIdx = foundName;
      lastNameColIdx = foundLastName;
      codeColIdx = foundCode;
      emailColIdx = foundEmail;
      whatsappColIdx = foundWhatsapp;
      headerRowIdx = r;
      break;
    }
  }

  // 2. Process rows using detected header mapping or heuristic row inspection
  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const cells = row.map(cleanCellString);
    if (cells.every((c) => !c)) continue;

    let rawId = '';
    let rawName = '';
    let rawCode = '';
    let rawEmail = '';
    let rawWhatsapp = '';

    if (headerRowIdx !== -1 && idColIdx !== -1) {
      rawId = cells[idColIdx] || '';
      if (nameColIdx !== -1 && lastNameColIdx !== -1 && nameColIdx !== lastNameColIdx) {
        const nPart = cells[nameColIdx] || '';
        const lPart = cells[lastNameColIdx] || '';
        rawName =
          nameColIdx < lastNameColIdx
            ? `${nPart} ${lPart}`.trim()
            : `${lPart} ${nPart}`.trim();
      } else if (nameColIdx !== -1) {
        rawName = cells[nameColIdx] || '';
      } else if (lastNameColIdx !== -1) {
        rawName = cells[lastNameColIdx] || '';
      }
      if (codeColIdx !== -1) {
        rawCode = cells[codeColIdx] || '';
      }
      if (emailColIdx !== -1) {
        rawEmail = cells[emailColIdx] || '';
      }
      if (whatsappColIdx !== -1) {
        rawWhatsapp = cells[whatsappColIdx] || '';
      }
      // Also inspect remaining unmapped columns in case user added email/whatsapp without header name
      cells.forEach((cellVal, idx) => {
        if (
          idx === idColIdx ||
          idx === nameColIdx ||
          idx === lastNameColIdx ||
          idx === codeColIdx ||
          idx === emailColIdx ||
          idx === whatsappColIdx
        ) {
          return;
        }
        if (!rawEmail && looksLikeEmail(cellVal)) {
          rawEmail = cellVal.trim();
        } else if (!rawWhatsapp && looksLikeWhatsappPhone(cellVal)) {
          rawWhatsapp = cellVal.trim();
        }
      });
    } else {
      // Heuristic detection per row when there's no standard header
      const nonEmpty = cells.filter(Boolean);
      if (nonEmpty.length === 0) continue;

      // Skip obvious header rows
      const firstNorm = normalizeHeader(nonEmpty[0]);
      if (
        HEADER_ID_KEYWORDS.includes(firstNorm) ||
        HEADER_NAME_KEYWORDS.includes(firstNorm) ||
        firstNorm === 'no' ||
        firstNorm === 'nro' ||
        firstNorm === 'item'
      ) {
        const secondNorm = nonEmpty[1] ? normalizeHeader(nonEmpty[1]) : '';
        if (
          HEADER_ID_KEYWORDS.includes(secondNorm) ||
          HEADER_NAME_KEYWORDS.includes(secondNorm)
        ) {
          continue;
        }
      }

      // Find ID cell
      let idIndexInNonEmpty = nonEmpty.findIndex((c) => looksLikeDocumentId(c));
      if (idIndexInNonEmpty === -1) {
        // Fallback: if first cell is alphanumeric >= 4 chars and not a header word
        const cand = nonEmpty[0].replace(/[^a-zA-Z0-9]/g, '');
        if (
          cand.length >= 4 &&
          !/^(id|documento|cedula|nombre|estudiante|nro|fila|nota|correo|whatsapp)$/i.test(cand) &&
          /\d/.test(cand)
        ) {
          idIndexInNonEmpty = 0;
        }
      }

      if (idIndexInNonEmpty !== -1) {
        rawId = nonEmpty[idIndexInNonEmpty];
        const nameParts: string[] = [];
        nonEmpty.forEach((cellVal, idx) => {
          if (idx === idIndexInNonEmpty) return;
          if (!rawEmail && looksLikeEmail(cellVal)) {
            rawEmail = cellVal.trim();
          } else if (looksLikeAccessCode(cellVal)) {
            rawCode = cellVal.trim().toUpperCase();
          } else if (!rawWhatsapp && looksLikeWhatsappPhone(cellVal) && nameParts.length > 0) {
            rawWhatsapp = cellVal.trim();
          } else if (looksLikePersonName(cellVal)) {
            nameParts.push(cellVal.trim());
          } else if (!rawWhatsapp && looksLikeWhatsappPhone(cellVal)) {
            rawWhatsapp = cellVal.trim();
          }
        });
        rawName = nameParts.join(' ').trim();
      }
    }

    const cleanId = rawId.replace(/[\s.\-,]/g, '').replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanId || cleanId.length < 3) continue;
    if (/^(id|documento|cedula|codigo|estudiante|total|promedio)$/i.test(cleanId)) continue;

    const cleanName = (rawName || `Estudiante ${cleanId}`).replace(/\s+/g, ' ').trim();
    const cleanCode =
      rawCode && rawCode.trim().length >= 4 && rawCode.trim().length <= 24
        ? rawCode.trim().toUpperCase()
        : undefined;
    const cleanEmail = rawEmail && rawEmail.trim() ? rawEmail.trim() : undefined;
    const cleanWhatsapp = rawWhatsapp && rawWhatsapp.trim() ? rawWhatsapp.trim() : undefined;

    results.push({
      id: cleanId,
      nombre: cleanName,
      codigoAcceso: cleanCode,
      correo: cleanEmail,
      whatsapp: cleanWhatsapp
    });
  }

  return results;
}

/**
 * Parses text (CSV / TSV / copy-pasted from Excel) into a 2D string matrix
 */
export function parseDelimitedTextToMatrix(text: string): string[][] {
  const cleanedText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanedText) return [];

  // Use SheetJS to parse CSV/TSV if possible, or custom delimiter splitter
  const lines = cleanedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    // Detect primary delimiter in line: tab, semicolon, pipe, or comma
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
    }
    if (line.includes(';')) {
      return line.split(';').map((c) => c.trim().replace(/^"|"$/g, ''));
    }
    if (line.includes('|')) {
      return line.split('|').map((c) => c.trim().replace(/^"|"$/g, ''));
    }
    // Comma-separated (respecting quotes)
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim().replace(/^"|"$/g, ''));
    return cells;
  });
}

/**
 * Reads an uploaded File (.xlsx, .xls, .csv, .txt, .ods) and returns all extracted students
 */
export async function parseStudentsFromExcelOrCsvFile(file: File): Promise<ParsedStudentRow[]> {
  const fileName = file.name.toLowerCase();
  const isTextFile = fileName.endsWith('.csv') || fileName.endsWith('.txt') || fileName.endsWith('.tsv');

  if (isTextFile) {
    const text = await file.text();
    const matrix = parseDelimitedTextToMatrix(text);
    const fromText = extractStudentsFromMatrix(matrix);
    if (fromText.length > 0) return fromText;
  }

  // Parse binary or text workbook with SheetJS (XLSX)
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allStudents: ParsedStudentRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false
    });
    const extracted = extractStudentsFromMatrix(rows);
    allStudents.push(...extracted);
  }

  // Deduplicate by ID preserving last occurrence
  const uniqueMap = new Map<string, ParsedStudentRow>();
  allStudents.forEach((st) => {
    uniqueMap.set(st.id.toUpperCase(), st);
  });
  return Array.from(uniqueMap.values());
}

/**
 * Parses questions from a 2D array (from Excel worksheet or CSV)
 */
export function extractQuestionsFromMatrix(
  rows: unknown[][],
  existingQuestionsCount = 0
): Question[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const validBlooms: BloomLevel[] = [
    'Conocer',
    'Comprensión',
    'Aplicación',
    'Análisis',
    'Evaluación'
  ];

  const normalizeBloom = (raw: string): BloomLevel => {
    const n = normalizeHeader(raw);
    if (n.includes('conoc') || n.includes('record')) return 'Conocer';
    if (n.includes('compren')) return 'Comprensión';
    if (n.includes('anal')) return 'Análisis';
    if (n.includes('eval')) return 'Evaluación';
    if (validBlooms.includes(raw as BloomLevel)) return raw as BloomLevel;
    return 'Aplicación';
  };

  const normalizeCorrectOption = (
    raw: string,
    opts: { A: string; B: string; C: string; D: string }
  ): 'A' | 'B' | 'C' | 'D' => {
    const clean = raw.trim().toUpperCase();
    if (clean === 'A' || clean === 'OPCIÓN A' || clean === 'OPCION A' || clean === '0' || clean === '1') {
      if (clean === '0') return 'A';
      if (clean === 'A' || clean.endsWith(' A')) return 'A';
    }
    if (clean === 'B' || clean === 'OPCIÓN B' || clean === 'OPCION B') return 'B';
    if (clean === 'C' || clean === 'OPCIÓN C' || clean === 'OPCION C') return 'C';
    if (clean === 'D' || clean === 'OPCIÓN D' || clean === 'OPCION D') return 'D';
    if (['A', 'B', 'C', 'D'].includes(clean.charAt(0)) && (clean.length === 1 || clean.charAt(1) === ')')) {
      return clean.charAt(0) as 'A' | 'B' | 'C' | 'D';
    }
    // Match by text content if user put the full answer text in the "Correcta" column
    const normRaw = normalizeHeader(raw);
    if (normRaw) {
      for (const letter of ['A', 'B', 'C', 'D'] as const) {
        if (normalizeHeader(opts[letter]) === normRaw) {
          return letter;
        }
      }
    }
    return 'A';
  };

  // Check if first row is a header row
  let headerMap: Record<string, number> | null = null;
  let startRow = 0;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const normCells = row.map((c) => normalizeHeader(cleanCellString(c)));
    const hasEnunciado = normCells.some(
      (h) =>
        h.includes('enunciado') ||
        h.includes('pregunta') ||
        h.includes('reactivo') ||
        h === 'opcion a' ||
        h === 'a'
    );
    const hasModuloOrTema = normCells.some(
      (h) => h.includes('modulo') || h.includes('tema') || h.includes('correcta')
    );

    if (hasEnunciado && hasModuloOrTema) {
      headerMap = {};
      normCells.forEach((h, idx) => {
        if (!h) return;
        if (h === 'id' || h.includes('id pregunta') || h === 'codigo' || h === 'nro' || h === 'numero')
          headerMap!.id = idx;
        else if (h.includes('modulo') || h === 'mod' || h.includes('unidad')) headerMap!.modulo = idx;
        else if (h.includes('tema') || h.includes('competencia') || h.includes('subtema') || h.includes('categoria'))
          headerMap!.tema = idx;
        else if (h.includes('bloom') || h.includes('nivel') || h.includes('taxonomia') || h.includes('dificultad'))
          headerMap!.bloom = idx;
        else if (
          h.includes('enunciado') ||
          h === 'pregunta' ||
          h.includes('texto de la pregunta') ||
          h.includes('planteamiento') ||
          h.includes('reactivo')
        )
          headerMap!.enunciado = idx;
        else if (
          h === 'opcion a' ||
          h.startsWith('opcion a ') ||
          h === 'a' ||
          h === 'op a' ||
          h === 'alternativa a' ||
          h === 'respuesta a' ||
          h === 'inciso a' ||
          h === 'literal a'
        )
          headerMap!.a = idx;
        else if (
          h === 'opcion b' ||
          h.startsWith('opcion b ') ||
          h === 'b' ||
          h === 'op b' ||
          h === 'alternativa b' ||
          h === 'respuesta b' ||
          h === 'inciso b' ||
          h === 'literal b'
        )
          headerMap!.b = idx;
        else if (
          h === 'opcion c' ||
          h.startsWith('opcion c ') ||
          h === 'c' ||
          h === 'op c' ||
          h === 'alternativa c' ||
          h === 'respuesta c' ||
          h === 'inciso c' ||
          h === 'literal c'
        )
          headerMap!.c = idx;
        else if (
          h === 'opcion d' ||
          h.startsWith('opcion d ') ||
          h === 'd' ||
          h === 'op d' ||
          h === 'alternativa d' ||
          h === 'respuesta d' ||
          h === 'inciso d' ||
          h === 'literal d'
        )
          headerMap!.d = idx;
        else if (
          h.includes('correcta') ||
          h.includes('respuesta') ||
          h === 'clave' ||
          h === 'solucion' ||
          h === 'co'
        )
          headerMap!.correcta = idx;
        else if (
          h.includes('justificacion') ||
          h.includes('retroalimentacion') ||
          h.includes('explicacion') ||
          h.includes('sustento')
        )
          headerMap!.justificacion = idx;
        else if (h === 'rap' || h.includes('resultado de aprendizaje') || h.includes('indicador'))
          headerMap!.rap = idx;
        else if (h.includes('contexto') || h.includes('caso') || h.includes('escenario'))
          headerMap!.contexto = idx;
      });
      startRow = r + 1;
      break;
    }
  }

  const isKnownBloomValue = (val: string): boolean => {
    const v = normalizeHeader(val);
    return (
      v === 'conocer' ||
      v === 'comprension' ||
      v === 'aplicacion' ||
      v === 'analisis' ||
      v === 'evaluacion' ||
      v === 'recordar' ||
      v === 'comprender' ||
      v === 'aplicar' ||
      v === 'analizar' ||
      v === 'evaluar'
    );
  };

  const added: Question[] = [];

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const p = row.map((c) => cleanCellString(c).replace(/^"|"$/g, ''));
    if (p.every((x) => !x)) continue;

    // Skip header row if encountered
    const firstLower = p[0]?.toLowerCase() || '';
    if (
      firstLower === 'id pregunta' ||
      firstLower === 'módulo' ||
      firstLower === 'modulo' ||
      firstLower === 'id'
    ) {
      continue;
    }

    if (headerMap && headerMap.enunciado !== undefined) {
      const enunciado = p[headerMap.enunciado] || '';
      if (!enunciado || enunciado.length < 3) continue;

      const rawMod = Number(String(p[headerMap.modulo ?? -1] || '1').replace(/[^0-9]/g, ''));
      const modNum = (rawMod >= 1 && rawMod <= 5 ? rawMod : 1) as 1 | 2 | 3 | 4 | 5;
      const opciones = {
        A: p[headerMap.a ?? -1] || 'Opción A',
        B: p[headerMap.b ?? -1] || 'Opción B',
        C: p[headerMap.c ?? -1] || 'Opción C',
        D: p[headerMap.d ?? -1] || 'Opción D'
      };
      const correcta = normalizeCorrectOption(p[headerMap.correcta ?? -1] || 'A', opciones);
      const bloom = normalizeBloom(p[headerMap.bloom ?? -1] || 'Aplicación');

      added.push({
        id:
          (headerMap.id !== undefined ? p[headerMap.id] : '') ||
          `MM-M${modNum}-EXCEL-${existingQuestionsCount + added.length + 1}`,
        modulo: modNum,
        tema: (headerMap.tema !== undefined ? p[headerMap.tema] : '') || `Módulo ${modNum}`,
        bloom,
        enunciado,
        pregunta: enunciado,
        rap: headerMap.rap !== undefined ? p[headerMap.rap] : undefined,
        contexto: headerMap.contexto !== undefined ? p[headerMap.contexto] : undefined,
        opciones,
        correcta,
        justificacion:
          (headerMap.justificacion !== undefined ? p[headerMap.justificacion] : '') ||
          'Justificación registrada desde archivo Excel.'
      });
    } else if (p.length >= 11) {
      // Standard 11-column format:
      // Either: ID | Módulo | Tema | Bloom | Enunciado | A | B | C | D | Correcta | Justificación
      // Or:     ID | Módulo | Bloom | Tema | Enunciado | A | B | C | D | Correcta | Justificación
      if (!p[4] || p[4].length < 3) continue;
      const rawMod = Number(String(p[1]).replace(/[^0-9]/g, ''));
      const modNum = (rawMod >= 1 && rawMod <= 5 ? rawMod : 1) as 1 | 2 | 3 | 4 | 5;
      const col2IsBloom = isKnownBloomValue(p[2]) && !isKnownBloomValue(p[3]);
      const temaVal = col2IsBloom ? p[3] : p[2];
      const bloomVal = col2IsBloom ? p[2] : p[3];
      const opciones = {
        A: p[5] || 'Opción A',
        B: p[6] || 'Opción B',
        C: p[7] || 'Opción C',
        D: p[8] || 'Opción D'
      };
      added.push({
        id: p[0] || `MM-M${modNum}-LOTE${existingQuestionsCount + added.length + 1}`,
        modulo: modNum,
        tema: temaVal || 'Tema General',
        bloom: normalizeBloom(bloomVal),
        enunciado: p[4],
        pregunta: p[4],
        opciones,
        correcta: normalizeCorrectOption(p[9] || 'A', opciones),
        justificacion: p[10] || 'Justificación registrada en lote.'
      });
    } else if (p.length >= 8) {
      // Standard 9-column format:
      // Módulo | Tema | Enunciado | A | B | C | D | Correcta | Justificación
      if (!p[2] || p[2].length < 3) continue;
      const rawMod = Number(String(p[0]).replace(/[^0-9]/g, ''));
      const modNum = (rawMod >= 1 && rawMod <= 5 ? rawMod : 1) as 1 | 2 | 3 | 4 | 5;
      const opciones = {
        A: p[3] || 'Opción A',
        B: p[4] || 'Opción B',
        C: p[5] || 'Opción C',
        D: p[6] || 'Opción D'
      };
      added.push({
        id: `MM-M${modNum}-LOTE${existingQuestionsCount + added.length + 1}`,
        modulo: modNum,
        tema: p[1] || 'Tema General',
        bloom: 'Aplicación',
        enunciado: p[2],
        pregunta: p[2],
        opciones,
        correcta: normalizeCorrectOption(p[7] || 'A', opciones),
        justificacion: p[8] || 'Justificación registrada en lote.'
      });
    }
  }

  return added;
}

/**
 * Parses an uploaded Question File (.xlsx, .xls, .csv, .json, .txt) into Question[]
 */
export async function parseQuestionsFromAnyFile(
  file: File,
  existingQuestionsCount = 0
): Promise<Question[]> {
  const fileName = file.name.toLowerCase();
  const isExcelBinary =
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    fileName.endsWith('.xlsm') ||
    fileName.endsWith('.ods');

  if (!isExcelBinary) {
    const rawText = await file.text();
    // 1. Try JSON first (supports standard JSON array, wrapper objects, BOM, trailing commas, or unbracketed object lists)
    const normalizedJson = normalizeQuestionList(rawText);
    if (normalizedJson.length > 0) return normalizedJson;

    // 2. Try delimited text (CSV / TSV)
    const matrix = parseDelimitedTextToMatrix(rawText);
    const fromMatrix = extractQuestionsFromMatrix(matrix, existingQuestionsCount);
    if (fromMatrix.length > 0) return fromMatrix;
  }

  // 3. Parse with SheetJS (Excel .xlsx / .xls / .csv)
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allQuestions: Question[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false
    });
    const extracted = extractQuestionsFromMatrix(
      rows,
      existingQuestionsCount + allQuestions.length
    );

    // Also support JSON-like object sheets if columns match Question keys
    const jsonObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const normalizedFromObjects = normalizeQuestionList(jsonObjects);

    if (extracted.length > 0 && extracted.length >= normalizedFromObjects.length) {
      allQuestions.push(...extracted);
    } else if (normalizedFromObjects.length > 0) {
      allQuestions.push(...normalizedFromObjects);
    }
  }

  return allQuestions;
}

/**
 * Downloads a 2D array of rows as a native .xlsx Excel file
 */
export function downloadExcelFile(
  filename: string,
  sheetName: string,
  rows: (string | number)[][]
) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const cleanName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanName);
}

/**
 * Builds StudentRecord[] merging or replacing from ParsedStudentRow[]
 */
export function mergeImportedStudents(
  existingStudents: StudentRecord[],
  importedRows: ParsedStudentRow[],
  mode: 'merge' | 'replace'
): {
  nextStudents: StudentRecord[];
  addedCount: number;
  updatedCount: number;
} {
  if (mode === 'replace') {
    const existingById = new Map<string, StudentRecord>();
    existingStudents.forEach((s) => existingById.set(s.id.toUpperCase(), s));

    let addedCount = 0;
    let updatedCount = 0;
    const nextStudents: StudentRecord[] = importedRows.map((row) => {
      const key = row.id.toUpperCase();
      const prev = existingById.get(key);
      const code = row.codigoAcceso || prev?.codigoAcceso || generateDeterministicAccessCode(row.id);
      if (prev) {
        updatedCount++;
        return {
          ...prev,
          id: row.id,
          nombre: row.nombre,
          codigoAcceso: code,
          correo: row.correo !== undefined ? row.correo : prev.correo,
          whatsapp: row.whatsapp !== undefined ? row.whatsapp : prev.whatsapp
        };
      }
      addedCount++;
      return {
        id: row.id,
        nombre: row.nombre,
        codigoAcceso: code,
        correo: row.correo,
        whatsapp: row.whatsapp,
        intentosUsados: 0,
        suspendido: false,
        conceptoInfraccion: '✓ Sin infracciones',
        preguntasIntento1: [],
        preguntasIntento2: []
      };
    });

    return { nextStudents, addedCount, updatedCount };
  }

  // Merge mode
  const existingIds = new Set(existingStudents.map((s) => s.id.toUpperCase()));
  const added: StudentRecord[] = [];
  let updatedCount = 0;
  const updatedMap = new Map<string, StudentRecord>();

  importedRows.forEach((row) => {
    const key = row.id.toUpperCase();
    const customCode = row.codigoAcceso || generateDeterministicAccessCode(row.id);

    if (existingIds.has(key)) {
      updatedCount++;
      const current =
        updatedMap.get(key) || existingStudents.find((s) => s.id.toUpperCase() === key)!;
      updatedMap.set(key, {
        ...current,
        nombre: row.nombre,
        codigoAcceso: row.codigoAcceso || current.codigoAcceso || customCode,
        correo: row.correo !== undefined ? row.correo : current.correo,
        whatsapp: row.whatsapp !== undefined ? row.whatsapp : current.whatsapp
      });
    } else {
      existingIds.add(key);
      added.push({
        id: row.id,
        nombre: row.nombre,
        codigoAcceso: customCode,
        correo: row.correo,
        whatsapp: row.whatsapp,
        intentosUsados: 0,
        suspendido: false,
        conceptoInfraccion: '✓ Sin infracciones',
        preguntasIntento1: [],
        preguntasIntento2: []
      });
    }
  });

  const merged = existingStudents.map((s) => updatedMap.get(s.id.toUpperCase()) || s);
  return {
    nextStudents: [...added, ...merged],
    addedCount: added.length,
    updatedCount
  };
}
