import { normalizeKeyValue, type KeyNormalization } from './keyNormalize.ts';
import type { ColumnId, Row } from './types.ts';

export interface KeyPair {
  leftColumnId: ColumnId;
  rightColumnId: ColumnId;
  /** Normalisation appliquée aux deux côtés avant comparaison (formats de date, casse/accents/espaces...). Par défaut 'none' (comparaison brute). */
  normalization?: KeyNormalization;
}

const KEY_SEPARATOR = '';

function buildKeyForSide(row: Row, pairs: KeyPair[], side: 'left' | 'right'): string {
  return pairs
    .map((p) => {
      const columnId = side === 'left' ? p.leftColumnId : p.rightColumnId;
      return normalizeKeyValue(row.cells[columnId] ?? '', p.normalization ?? 'none');
    })
    .join(KEY_SEPARATOR);
}

function indexRowsByKeyPairs(rows: Row[], pairs: KeyPair[], side: 'left' | 'right'): Map<string, Row[]> {
  const index = new Map<string, Row[]>();
  for (const row of rows) {
    const key = buildKeyForSide(row, pairs, side);
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

export interface MatchResult {
  leftRow: Row;
  matches: Row[];
}

/** Rapprochement exact (après normalisation éventuelle) : une ligne de gauche peut avoir 0, 1 ou plusieurs correspondances à droite. */
export function matchRowsExact(leftRows: Row[], rightRows: Row[], keyPairs: KeyPair[]): MatchResult[] {
  const index = indexRowsByKeyPairs(rightRows, keyPairs, 'right');
  return leftRows.map((leftRow) => ({ leftRow, matches: index.get(buildKeyForSide(leftRow, keyPairs, 'left')) ?? [] }));
}

export type AggregateFn = 'sum' | 'max' | 'min' | 'concat';

export function aggregateValues(values: string[], fn: AggregateFn, separator = ', '): string {
  if (fn === 'concat') return values.filter((v) => v !== '').join(separator);
  const nums = values
    .filter((v) => v.trim() !== '')
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return '';
  if (fn === 'sum') return String(nums.reduce((a, b) => a + b, 0));
  if (fn === 'max') return String(Math.max(...nums));
  return String(Math.min(...nums));
}
