import { normalizeForComparison } from './normalize.ts';
import type { ColumnId, Row, Table } from './types.ts';

export type DedupMode = 'exact' | 'normalized';

export interface DuplicateGroup {
  key: string;
  rows: Row[];
}

const KEY_SEPARATOR = '';

function buildKey(row: Row, keyColumnIds: ColumnId[], mode: DedupMode): string {
  return keyColumnIds.map((id) => (mode === 'normalized' ? normalizeForComparison(row.cells[id] ?? '') : (row.cells[id] ?? ''))).join(KEY_SEPARATOR);
}

export function groupRowsByKey(rows: Row[], keyColumnIds: ColumnId[], mode: DedupMode): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = buildKey(row, keyColumnIds, mode);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Seuls les groupes de 2 lignes ou plus sont des doublons. */
export function computeDuplicateGroups(table: Table, keyColumnIds: ColumnId[], mode: DedupMode): DuplicateGroup[] {
  if (keyColumnIds.length === 0) return [];
  const groups = groupRowsByKey(table.rows, keyColumnIds, mode);
  const result: DuplicateGroup[] = [];
  for (const [key, rows] of groups) {
    if (rows.length > 1) result.push({ key, rows });
  }
  return result;
}

export function countFilledCells(row: Row): number {
  return Object.values(row.cells).filter((v) => v !== '').length;
}

/** Ligne la plus complète (moins de champs vides) ; en cas d'égalité, la première rencontrée. */
export function mostCompleteRow(rows: Row[]): Row {
  let best = rows[0];
  let bestCount = countFilledCells(best);
  for (const r of rows.slice(1)) {
    const count = countFilledCells(r);
    if (count > bestCount) {
      best = r;
      bestCount = count;
    }
  }
  return best;
}

/** Fusionne un groupe en une seule ligne : pour chaque colonne, la première valeur non vide dans l'ordre du groupe. */
export function mergeFirstNonEmpty(rows: Row[], columnIds: ColumnId[]): Row {
  const cells: Record<string, string> = {};
  for (const id of columnIds) {
    let value = '';
    for (const r of rows) {
      const v = r.cells[id] ?? '';
      if (v !== '') {
        value = v;
        break;
      }
    }
    cells[id] = value;
  }
  return { id: rows[0].id, cells };
}

/** Colonnes dont au moins une valeur diffère au sein du groupe (pour le surlignage dans l'UI). */
export function columnsThatDiffer(rows: Row[], columnIds: ColumnId[]): Set<ColumnId> {
  const differing = new Set<ColumnId>();
  for (const id of columnIds) {
    const first = rows[0].cells[id] ?? '';
    if (rows.some((r) => (r.cells[id] ?? '') !== first)) differing.add(id);
  }
  return differing;
}
