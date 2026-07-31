import { createId } from '../ids.ts';
import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface AddConcatColumnParams {
  name: string;
  columnIds: ColumnId[];
  separator: string;
}

export const addConcatColumnDefinition: OperationDefinition<AddConcatColumnParams> = {
  type: 'add_concat_column',

  apply(table: Table, params: AddConcatColumnParams) {
    const newId = createId();
    const columns = [...table.columns, { id: newId, name: params.name, hidden: false }];
    const rows = table.rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [newId]: params.columnIds.map((id) => r.cells[id] ?? '').join(params.separator) },
    }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const names = params.columnIds.map((id) => columnName(tableBeforeStep, id));
    return { params: { name: params.name, columnNames: names, separator: params.separator }, columnNames: names };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { name: string; columnNames: string[]; separator: string };
    return { name: p.name, columnIds: p.columnNames.map((n) => resolveId(nameToId, n)), separator: p.separator };
  },
};
