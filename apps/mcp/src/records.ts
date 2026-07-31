import type { Row, Table } from '@csv-studio/core/engine/types.ts';
import { bound, type BoundedSample } from './bounded.ts';

/** Convertit des lignes internes (cellules indexées par ColumnId) en objets indexés par nom de colonne, pour l'export JSON vers un client MCP qui ne connaît pas les ColumnId internes. */
export function rowsToRecords(table: Table, rows: Row[]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (const col of table.columns) record[col.name] = row.cells[col.id] ?? '';
    return record;
  });
}

/** Plafonne des lignes AVANT de les convertir en objets nommés — évite de convertir des lignes qui seront de toute façon jetées sur un fichier volumineux. */
export function boundRecords(table: Table, rows: Row[], cap: number): BoundedSample<Record<string, string>> {
  const b = bound(rows, cap);
  return { totalCount: b.totalCount, truncated: b.truncated, sample: rowsToRecords(table, b.sample) };
}

/** Résout des noms de colonnes attendus en ColumnId réels, uniquement par correspondance exacte — jamais de suggestion floue non confirmée dans un contexte non interactif (MCP). Lève une erreur listant les noms introuvables. */
export function resolveExactColumnIds(table: Table, names: string[]): string[] {
  const missing: string[] = [];
  const ids = names.map((name) => {
    const col = table.columns.find((c) => c.name === name);
    if (!col) {
      missing.push(name);
      return '';
    }
    return col.id;
  });
  if (missing.length > 0) {
    const available = table.columns.map((c) => c.name).join(', ');
    throw new Error(`Colonne(s) introuvable(s) : ${missing.join(', ')}. Colonnes disponibles : ${available}.`);
  }
  return ids;
}
