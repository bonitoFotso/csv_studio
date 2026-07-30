import type { OperationReport, RowId } from '../types.ts';

export function makeReport(partial: {
  rowsIn: number;
  rowsOut: number;
  rowsRemoved?: number;
  rowsAdded?: number;
  rowsModified?: number;
  unmatched?: number;
  ambiguous?: number;
  notes?: string[];
  affectedRowIds?: RowId[];
}): OperationReport {
  return {
    rowsIn: partial.rowsIn,
    rowsOut: partial.rowsOut,
    rowsRemoved: partial.rowsRemoved ?? 0,
    rowsAdded: partial.rowsAdded ?? 0,
    rowsModified: partial.rowsModified ?? 0,
    unmatched: partial.unmatched,
    ambiguous: partial.ambiguous,
    notes: partial.notes ?? [],
    affectedRowIds: partial.affectedRowIds,
  };
}

export function columnName(table: { columns: { id: string; name: string }[] }, columnId: string): string {
  const col = table.columns.find((c) => c.id === columnId);
  if (!col) throw new Error(`ColumnId inconnu lors de la sérialisation: ${columnId}`);
  return col.name;
}

export function resolveId(nameToId: Record<string, string>, name: string): string {
  const id = nameToId[name];
  if (!id) throw new Error(`Colonne "${name}" non mappée : le remappage doit être confirmé avant rejeu.`);
  return id;
}
