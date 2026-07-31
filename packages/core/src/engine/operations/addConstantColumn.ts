import { createId } from '../ids.ts';
import type { OperationDefinition, Table } from '../types.ts';
import { makeReport } from './reportUtil.ts';

export interface AddConstantColumnParams {
  name: string;
  value: string;
}

export const addConstantColumnDefinition: OperationDefinition<AddConstantColumnParams> = {
  type: 'add_constant_column',

  apply(table: Table, params: AddConstantColumnParams) {
    const newId = createId();
    const columns = [...table.columns, { id: newId, name: params.name, hidden: false }];
    const rows = table.rows.map((r) => ({ ...r, cells: { ...r.cells, [newId]: params.value } }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params) {
    return { params, columnNames: [] };
  },

  rebind(portableParams) {
    return portableParams as AddConstantColumnParams;
  },
};
