import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface DropColumnsParams {
  columnIds: ColumnId[];
}

export const dropColumnsDefinition: OperationDefinition<DropColumnsParams> = {
  type: 'drop_columns',

  apply(table: Table, params: DropColumnsParams) {
    const toRemove = new Set(params.columnIds);
    const columns = table.columns.filter((c) => !toRemove.has(c.id));
    const rows = table.rows.map((r) => {
      const cells = { ...r.cells };
      for (const id of toRemove) delete cells[id];
      return { ...r, cells };
    });
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const names = params.columnIds.map((id) => columnName(tableBeforeStep, id));
    return { params: { columnNames: names }, columnNames: names };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { columnNames: string[] };
    return { columnIds: p.columnNames.map((name) => resolveId(nameToId, name)) };
  },
};
