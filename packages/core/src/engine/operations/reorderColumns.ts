import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface ReorderColumnsParams {
  order: ColumnId[];
}

export const reorderColumnsDefinition: OperationDefinition<ReorderColumnsParams> = {
  type: 'reorder_columns',

  apply(table: Table, params: ReorderColumnsParams) {
    const byId = new Map(table.columns.map((c) => [c.id, c]));
    const ordered = params.order.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => c !== undefined);
    const remaining = table.columns.filter((c) => !params.order.includes(c.id));
    return {
      table: { ...table, columns: [...ordered, ...remaining] },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: table.rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const order = params.order.map((id) => columnName(tableBeforeStep, id));
    return { params: { order }, columnNames: order };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { order: string[] };
    return { order: p.order.map((name) => resolveId(nameToId, name)) };
  },
};
