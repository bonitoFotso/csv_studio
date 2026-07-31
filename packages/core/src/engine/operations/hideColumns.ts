import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface HideColumnsParams {
  columnIds: ColumnId[];
  hidden: boolean;
}

export const hideColumnsDefinition: OperationDefinition<HideColumnsParams> = {
  type: 'hide_columns',

  apply(table: Table, params: HideColumnsParams) {
    const targets = new Set(params.columnIds);
    const columns = table.columns.map((c) => (targets.has(c.id) ? { ...c, hidden: params.hidden } : c));
    return {
      table: { ...table, columns },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: table.rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const names = params.columnIds.map((id) => columnName(tableBeforeStep, id));
    return { params: { columnNames: names, hidden: params.hidden }, columnNames: names };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { columnNames: string[]; hidden: boolean };
    return { columnIds: p.columnNames.map((name) => resolveId(nameToId, name)), hidden: p.hidden };
  },
};
