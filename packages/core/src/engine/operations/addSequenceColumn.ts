import { createId } from '../ids.ts';
import type { ApplyContext, OperationDefinition, Table } from '../types.ts';
import { makeReport } from './reportUtil.ts';

export interface AddSequenceColumnParams {
  name: string;
  start: number;
  step: number;
}

export const addSequenceColumnDefinition: OperationDefinition<AddSequenceColumnParams> = {
  type: 'add_sequence_column',

  apply(table: Table, params: AddSequenceColumnParams, ctx: ApplyContext) {
    const newId = createId();
    const columns = [...table.columns, { id: newId, name: params.name, hidden: false }];
    const rows = table.rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [newId]: String(ctx.sequenceCounter(newId, params.start, params.step)) },
    }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params) {
    return { params, columnNames: [] };
  },

  rebind(portableParams) {
    return portableParams as AddSequenceColumnParams;
  },
};
