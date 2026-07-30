import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface RenameColumnsParams {
  renames: { columnId: ColumnId; newName: string }[];
}

export const renameColumnsDefinition: OperationDefinition<RenameColumnsParams> = {
  type: 'rename_columns',

  apply(table: Table, params: RenameColumnsParams) {
    const newNameById = new Map(params.renames.map((r) => [r.columnId, r.newName]));
    const columns = table.columns.map((c) => (newNameById.has(c.id) ? { ...c, name: newNameById.get(c.id)! } : c));
    return {
      table: { ...table, columns },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: table.rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const renames = params.renames.map((r) => ({ name: columnName(tableBeforeStep, r.columnId), newName: r.newName }));
    return { params: { renames }, columnNames: renames.map((r) => r.name) };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { renames: { name: string; newName: string }[] };
    return { renames: p.renames.map((r) => ({ columnId: resolveId(nameToId, r.name), newName: r.newName })) };
  },
};
