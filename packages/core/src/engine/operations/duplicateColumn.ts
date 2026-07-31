import { createId } from '../ids.ts';
import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface DuplicateColumnParams {
  columnId: ColumnId;
  newName: string;
}

export const duplicateColumnDefinition: OperationDefinition<DuplicateColumnParams> = {
  type: 'duplicate_column',

  apply(table: Table, params: DuplicateColumnParams) {
    const sourceIndex = table.columns.findIndex((c) => c.id === params.columnId);
    if (sourceIndex === -1) throw new Error(`Colonne introuvable: ${params.columnId}`);
    const newId = createId();
    const columns = [...table.columns];
    columns.splice(sourceIndex + 1, 0, { id: newId, name: params.newName, hidden: false });
    const rows = table.rows.map((r) => ({ ...r, cells: { ...r.cells, [newId]: r.cells[params.columnId] ?? '' } }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const name = columnName(tableBeforeStep, params.columnId);
    return { params: { name, newName: params.newName }, columnNames: [name] };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { name: string; newName: string };
    return { columnId: resolveId(nameToId, p.name), newName: p.newName };
  },
};
