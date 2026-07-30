import { createId } from '../ids.ts';
import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export type ExtractMode = 'year' | 'first_n' | 'last_n' | 'before_sep' | 'after_sep' | 'regex_group';

export interface AddExtractColumnParams {
  name: string;
  sourceColumnId: ColumnId;
  mode: ExtractMode;
  arg?: string;
}

function extractYear(value: string): string {
  const fourDigits = value.match(/\b(\d{4})\b/);
  if (fourDigits) return fourDigits[1];
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return String(new Date(parsed).getFullYear());
  return '';
}

function extractValue(value: string, mode: ExtractMode, arg?: string): string {
  switch (mode) {
    case 'year':
      return extractYear(value);
    case 'first_n': {
      const n = Number(arg ?? '0');
      return value.slice(0, Math.max(0, n));
    }
    case 'last_n': {
      const n = Number(arg ?? '0');
      return n <= 0 ? '' : value.slice(Math.max(0, value.length - n));
    }
    case 'before_sep': {
      if (!arg) return value;
      const idx = value.indexOf(arg);
      return idx === -1 ? value : value.slice(0, idx);
    }
    case 'after_sep': {
      if (!arg) return '';
      const idx = value.indexOf(arg);
      return idx === -1 ? '' : value.slice(idx + arg.length);
    }
    case 'regex_group': {
      if (!arg) return '';
      try {
        const match = value.match(new RegExp(arg));
        return match?.[1] ?? '';
      } catch {
        return '';
      }
    }
  }
}

export const addExtractColumnDefinition: OperationDefinition<AddExtractColumnParams> = {
  type: 'add_extract_column',

  apply(table: Table, params: AddExtractColumnParams) {
    const newId = createId();
    const columns = [...table.columns, { id: newId, name: params.name, hidden: false }];
    const rows = table.rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [newId]: extractValue(r.cells[params.sourceColumnId] ?? '', params.mode, params.arg) },
    }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const sourceName = columnName(tableBeforeStep, params.sourceColumnId);
    return {
      params: { name: params.name, sourceName, mode: params.mode, arg: params.arg },
      columnNames: [sourceName],
    };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { name: string; sourceName: string; mode: ExtractMode; arg?: string };
    return { name: p.name, sourceColumnId: resolveId(nameToId, p.sourceName), mode: p.mode, arg: p.arg };
  },
};
