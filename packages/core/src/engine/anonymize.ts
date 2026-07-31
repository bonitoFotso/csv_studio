// Anonymisation à forme préservée : jamais le contenu réel d'une cellule, seulement sa forme
// (longueur, séparateur décimal, format de date, casse) — utilisée pour donner à un assistant un
// échantillon de lignes réaliste sans lui exposer de donnée personnelle identifiable.
import type { DetectedType } from './profile.ts';
import { computeAllProfiles } from './profile.ts';
import type { Row, Table } from './types.ts';

const INTEGER_RE = /^(-?)(\d+)$/;
const DECIMAL_RE = /^(-?)(\d+)([.,])(\d+)$/;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_SLASH_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const DATE_DASH_RE = /^\d{2}-\d{2}-\d{4}$/;

function randomDigits(count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function randomDayMonthYear(): { day: string; month: string; year: string } {
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const year = String(1950 + Math.floor(Math.random() * 75));
  return { day, month, year };
}

// Les chiffres sont eux aussi remplacés (pas seulement les lettres) : une colonne "decimal" a des
// valeurs individuelles qui ne matchent pas toujours DECIMAL_RE (ex. "16" sans séparateur) et
// retombent sur cette fonction — un chiffre laissé tel quel y fuiterait la vraie valeur.
function anonymizeText(value: string): string {
  let out = '';
  for (const ch of value) {
    if (/\p{Lu}/u.test(ch)) out += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    else if (/\p{Ll}/u.test(ch)) out += String.fromCharCode(97 + Math.floor(Math.random() * 26));
    else if (/\d/.test(ch)) out += String(Math.floor(Math.random() * 10));
    else out += ch;
  }
  return out;
}

/** Remplace la valeur d'une cellule par une valeur fictive de même forme (longueur, séparateur, casse) selon son type détecté — jamais le contenu réel. */
export function anonymizeValue(value: string, detectedType: DetectedType): string {
  if (value === '') return '';

  switch (detectedType) {
    case 'empty':
    case 'boolean':
      return value;

    case 'integer': {
      const m = INTEGER_RE.exec(value);
      if (!m) return anonymizeText(value);
      return m[1] + randomDigits(m[2].length);
    }

    case 'decimal': {
      const m = DECIMAL_RE.exec(value);
      if (!m) return anonymizeText(value);
      return m[1] + randomDigits(m[2].length) + m[3] + randomDigits(m[4].length);
    }

    case 'date': {
      const { day, month, year } = randomDayMonthYear();
      if (DATE_ISO_RE.test(value)) return `${year}-${month}-${day}`;
      if (DATE_SLASH_RE.test(value)) return `${day}/${month}/${year}`;
      if (DATE_DASH_RE.test(value)) return `${day}-${month}-${year}`;
      return anonymizeText(value);
    }

    case 'text':
      return anonymizeText(value);
  }
}

/**
 * Prend les `sampleSize` premières lignes de `table` et renvoie une copie anonymisée (jamais de
 * mutation de `table`) — chaque cellule est anonymisée selon le type détecté de sa colonne
 * (`computeAllProfiles`), pas une anonymisation générique aveugle au type.
 */
export function buildAnonymizedSample(table: Table, sampleSize = 3): Row[] {
  const profiles = computeAllProfiles(table);
  const typeByColumnId = new Map(profiles.map((p) => [p.columnId, p.detectedType]));

  return table.rows.slice(0, sampleSize).map((row) => {
    const cells: Record<string, string> = {};
    for (const col of table.columns) {
      const detectedType = typeByColumnId.get(col.id) ?? 'text';
      cells[col.id] = anonymizeValue(row.cells[col.id] ?? '', detectedType);
    }
    return { id: row.id, cells };
  });
}
