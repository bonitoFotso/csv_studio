import type { Column, ColumnId } from '@/engine/types.ts';

/**
 * Reconstruit l'ordre complet des colonnes après un glisser-déposer qui n'a réordonné
 * que les colonnes visibles : les colonnes masquées gardent leur position d'origine,
 * seules les places occupées par des colonnes visibles sont redistribuées selon `newVisibleOrder`.
 */
export function mergeVisibleReorder(allColumns: Column[], newVisibleOrder: ColumnId[]): ColumnId[] {
  const queue = [...newVisibleOrder];
  return allColumns.map((c) => (c.hidden ? c.id : (queue.shift() ?? c.id)));
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}
