import { createId } from '../ids.ts';
import { applyNormalizeSteps, type NormalizeStep } from '../normalize.ts';
import type { ColumnId, OperationDefinition, RowId, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface NormalizeColumnsParams {
  columnIds: ColumnId[];
  steps: NormalizeStep[];
  mode: 'overwrite' | 'new_column';
  newColumnSuffix?: string;
}

export const normalizeColumnsDefinition: OperationDefinition<NormalizeColumnsParams> = {
  type: 'normalize_columns',

  apply(table: Table, params: NormalizeColumnsParams) {
    const suffix = params.newColumnSuffix ?? ' (normalisé)';
    let columns = table.columns;
    let targetIdFor = new Map<ColumnId, ColumnId>(params.columnIds.map((id) => [id, id]));

    if (params.mode === 'new_column') {
      const additions = params.columnIds.map((id) => {
        const source = table.columns.find((c) => c.id === id);
        const newId = createId();
        return { newId, sourceId: id, name: `${source?.name ?? id}${suffix}` };
      });
      columns = [...table.columns, ...additions.map((a) => ({ id: a.newId, name: a.name, hidden: false }))];
      targetIdFor = new Map(additions.map((a) => [a.sourceId, a.newId]));
    }

    const modifiedRowIds: RowId[] = [];
    const rows = table.rows.map((r) => {
      const cells = { ...r.cells };
      let changed = false;
      for (const sourceId of params.columnIds) {
        const original = r.cells[sourceId] ?? '';
        const normalized = applyNormalizeSteps(original, params.steps);
        const targetId = targetIdFor.get(sourceId)!;
        cells[targetId] = normalized;
        if (normalized !== original) changed = true;
      }
      if (changed) modifiedRowIds.push(r.id);
      return { ...r, cells };
    });

    return {
      table: { ...table, columns, rows },
      report: makeReport({
        rowsIn: table.rows.length,
        rowsOut: rows.length,
        rowsModified: modifiedRowIds.length,
        affectedRowIds: modifiedRowIds,
      }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const names = params.columnIds.map((id) => columnName(tableBeforeStep, id));
    return {
      params: { columnNames: names, steps: params.steps, mode: params.mode, newColumnSuffix: params.newColumnSuffix },
      columnNames: names,
    };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { columnNames: string[]; steps: NormalizeStep[]; mode: 'overwrite' | 'new_column'; newColumnSuffix?: string };
    return {
      columnIds: p.columnNames.map((n) => resolveId(nameToId, n)),
      steps: p.steps,
      mode: p.mode,
      newColumnSuffix: p.newColumnSuffix,
    };
  },
};
