import type { ColumnId, Row } from './types.ts';

export interface KeyPair {
  leftColumnId: ColumnId;
  rightColumnId: ColumnId;
}

const KEY_SEPARATOR = '';

function buildKey(row: Row, columnIds: ColumnId[]): string {
  return columnIds.map((id) => row.cells[id] ?? '').join(KEY_SEPARATOR);
}

export function indexRowsByKey(rows: Row[], columnIds: ColumnId[]): Map<string, Row[]> {
  const index = new Map<string, Row[]>();
  for (const row of rows) {
    const key = buildKey(row, columnIds);
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

/** Rapprochement exact : une ligne de gauche peut avoir 0, 1 ou plusieurs correspondances à droite. */
export function matchRowsExact(leftRows: Row[], rightRows: Row[], keyPairs: KeyPair[]): MatchResult[] {
  const rightColumnIds = keyPairs.map((p) => p.rightColumnId);
  const leftColumnIds = keyPairs.map((p) => p.leftColumnId);
  const index = indexRowsByKey(rightRows, rightColumnIds);
  return leftRows.map((leftRow) => ({ leftRow, matches: index.get(buildKey(leftRow, leftColumnIds)) ?? [] }));
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
