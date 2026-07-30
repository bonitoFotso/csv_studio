import { createId } from '../ids.ts';
import { normalizeKeyValue, type KeyNormalization } from '../keyNormalize.ts';
import { formatComputedNumber, parseTolerantNumber } from '../numberParse.ts';
import type { Column, ColumnId, OperationDefinition, PortableParams, Row, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export type BinningMode =
  | { kind: 'fixed_width'; width: number; start?: number }
  | { kind: 'fixed_count'; count: number }
  | { kind: 'explicit_boundaries'; boundaries: number[] };

export interface GroupByColumn {
  columnId: ColumnId;
  /** 'none' = comparaison brute ("raw" dans la terminologie de la spec). */
  normalization: KeyNormalization;
  binning?: BinningMode;
}

export type AggFn = 'count' | 'countDistinct' | 'countNonEmpty' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'first' | 'concat';

export interface AggregateSpec {
  fn: AggFn;
  /** Requis pour toutes les fonctions sauf 'count' (qui compte les lignes du groupe). */
  columnId?: ColumnId;
  asName: string;
  /** Pour 'concat' ; défaut ', '. */
  separator?: string;
}

export interface SummarizeParams {
  groupBy: GroupByColumn[];
  aggregates: AggregateSpec[];
}

interface BinDef {
  label: string;
  test: (n: number) => boolean;
}

function formatBinBound(n: number): string {
  return formatComputedNumber(n);
}

function computeBins(values: number[], mode: BinningMode): BinDef[] {
  if (mode.kind === 'explicit_boundaries') {
    const b = mode.boundaries;
    const bins: BinDef[] = [];
    for (let i = 0; i < b.length - 1; i++) {
      const lo = b[i];
      const hi = b[i + 1];
      const isLast = i === b.length - 2;
      bins.push({
        label: `${formatBinBound(lo)}–${formatBinBound(hi)}`,
        test: isLast ? (n) => n >= lo && n <= hi : (n) => n >= lo && n < hi,
      });
    }
    return bins;
  }

  if (values.length === 0) return [];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  if (mode.kind === 'fixed_width') {
    const width = mode.width;
    const bins: BinDef[] = [];
    let cursor = mode.start ?? dataMin;
    for (;;) {
      // `lo`/`hi` doivent être des bindings frais à chaque itération : les closures `test`
      // capturent la variable, pas sa valeur — les réutiliser à travers les tours de boucle
      // ferait que toutes les tranches testent avec les bornes de la dernière itération.
      const lo = cursor;
      const hi = lo + width;
      const isLast = hi >= dataMax;
      bins.push({ label: `${formatBinBound(lo)}–${formatBinBound(hi)}`, test: isLast ? (n) => n >= lo && n <= hi : (n) => n >= lo && n < hi });
      if (isLast) break;
      cursor = hi;
    }
    return bins;
  }

  // fixed_count
  const count = Math.max(1, Math.floor(mode.count));
  const span = dataMax - dataMin;
  const width = span === 0 ? 1 : span / count;
  const bins: BinDef[] = [];
  for (let i = 0; i < count; i++) {
    const lo = dataMin + i * width;
    const isLast = i === count - 1;
    const hi = isLast ? dataMax : dataMin + (i + 1) * width;
    bins.push({ label: `${formatBinBound(lo)}–${formatBinBound(hi)}`, test: isLast ? (n) => n >= lo && n <= hi : (n) => n >= lo && n < hi });
  }
  return bins;
}

function binLabelFor(rawValue: string, bins: BinDef[]): string {
  const n = parseTolerantNumber(rawValue);
  if (n === null) return '(non numérique)';
  const bin = bins.find((b) => b.test(n));
  return bin ? bin.label : 'hors plage';
}

interface GroupAcc {
  displayValues: string[];
  rows: Row[];
}

function computeAggregate(spec: AggregateSpec, rows: Row[]): string {
  if (spec.fn === 'count') return String(rows.length);

  const columnId = spec.columnId!;
  const rawValues = rows.map((r) => r.cells[columnId] ?? '');

  switch (spec.fn) {
    case 'countDistinct':
      return String(new Set(rawValues.filter((v) => v !== '')).size);
    case 'countNonEmpty':
      return String(rawValues.filter((v) => v !== '').length);
    case 'first':
      return rawValues.find((v) => v !== '') ?? '';
    case 'concat':
      return rawValues.filter((v) => v !== '').join(spec.separator ?? ', ');
    case 'sum':
    case 'avg':
    case 'min':
    case 'max':
    case 'median': {
      const nums = rawValues.map(parseTolerantNumber).filter((n): n is number => n !== null);
      if (nums.length === 0) return spec.fn === 'sum' ? '0' : '';
      if (spec.fn === 'sum') return formatComputedNumber(nums.reduce((a, b) => a + b, 0));
      if (spec.fn === 'avg') return formatComputedNumber(nums.reduce((a, b) => a + b, 0) / nums.length);
      if (spec.fn === 'min') return formatComputedNumber(Math.min(...nums));
      if (spec.fn === 'max') return formatComputedNumber(Math.max(...nums));
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return formatComputedNumber(median);
    }
  }
}

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>((acc, list) => acc.flatMap((prefix) => list.map((v) => [...prefix, v])), [[]]);
}

/** Calcule la table de synthèse (regroupement + agrégats + binning). Exporté pour être réutilisé tel quel par les blocs `chart`/`table` d'un ReportSpec — une seule implémentation de l'agrégation dans tout le projet. */
export function computeSummarizeTable(table: Table, params: SummarizeParams): { columns: Column[]; rows: Row[]; groupCount: number } {
  const binsByColumn = new Map<ColumnId, BinDef[]>();
  for (const g of params.groupBy) {
    if (!g.binning) continue;
    const values = table.rows.map((r) => parseTolerantNumber(r.cells[g.columnId] ?? '')).filter((n): n is number => n !== null);
    binsByColumn.set(g.columnId, computeBins(values, g.binning));
  }

  const groups = new Map<string, GroupAcc>();
  const order: string[] = [];

  for (const row of table.rows) {
    const parts = params.groupBy.map((g) => {
      const raw = row.cells[g.columnId] ?? '';
      if (g.binning) {
        const bins = binsByColumn.get(g.columnId)!;
        const label = binLabelFor(raw, bins);
        return { compareKey: label, displayValue: label };
      }
      return { compareKey: normalizeKeyValue(raw, g.normalization), displayValue: raw };
    });
    const key = JSON.stringify(parts.map((p) => p.compareKey));
    let acc = groups.get(key);
    if (!acc) {
      acc = { displayValues: parts.map((p) => p.displayValue), rows: [] };
      groups.set(key, acc);
      order.push(key);
    }
    acc.rows.push(row);
  }

  const binnedIndices = params.groupBy.map((g, i) => (g.binning ? i : -1)).filter((i) => i !== -1);

  let finalKeyOrder: string[];
  if (binnedIndices.length === 0) {
    finalKeyOrder = order;
  } else {
    const othersSeen = new Map<string, string[]>();
    for (const key of order) {
      const parts: string[] = JSON.parse(key);
      const otherKey = JSON.stringify(parts.filter((_, i) => !binnedIndices.includes(i)));
      if (!othersSeen.has(otherKey)) othersSeen.set(otherKey, parts);
    }

    const binLabelLists = binnedIndices.map((i) => (binsByColumn.get(params.groupBy[i].columnId) ?? []).map((b) => b.label));
    const combos = cartesian(binLabelLists);

    finalKeyOrder = [];
    const placed = new Set<string>();
    for (const template of othersSeen.values()) {
      for (const combo of combos) {
        const full = [...template];
        binnedIndices.forEach((idx, k) => {
          full[idx] = combo[k];
        });
        const key = JSON.stringify(full);
        if (!groups.has(key)) groups.set(key, { displayValues: full, rows: [] });
        finalKeyOrder.push(key);
        placed.add(key);
      }
    }
    // Groupes réels dont la valeur binnée n'est pas une tranche numérique connue
    // (ex. "(non numérique)", "hors plage") : conservés, ajoutés après les tranches régulières.
    for (const key of order) {
      if (!placed.has(key)) finalKeyOrder.push(key);
    }
  }

  const outputColumns: Column[] = [
    ...params.groupBy.map((g) => ({ id: createId(), name: columnName(table, g.columnId), hidden: false })),
    ...params.aggregates.map((a) => ({ id: createId(), name: a.asName, hidden: false })),
  ];

  const outputRows: Row[] = finalKeyOrder.map((key) => {
    const acc = groups.get(key)!;
    const cells: Record<string, string> = {};
    params.groupBy.forEach((_, i) => {
      cells[outputColumns[i].id] = acc.displayValues[i];
    });
    params.aggregates.forEach((a, i) => {
      cells[outputColumns[params.groupBy.length + i].id] = computeAggregate(a, acc.rows);
    });
    return { id: createId(), cells };
  });

  return { columns: outputColumns, rows: outputRows, groupCount: outputRows.length };
}

interface PortableGroupByColumn {
  name: string;
  normalization: KeyNormalization;
  binning?: BinningMode;
}

interface PortableAggregateSpec {
  fn: AggFn;
  name?: string;
  asName: string;
  separator?: string;
}

interface PortableSummarizeParams {
  groupBy: PortableGroupByColumn[];
  aggregates: PortableAggregateSpec[];
}

export const summarizeDefinition: OperationDefinition<SummarizeParams> = {
  type: 'summarize',

  apply(table: Table, params: SummarizeParams) {
    const { columns, rows, groupCount } = computeSummarizeTable(table, params);
    return {
      table: { ...table, columns, rows },
      report: makeReport({
        rowsIn: table.rows.length,
        rowsOut: rows.length,
        notes: [`${groupCount} groupe(s) calculé(s) depuis ${table.rows.length} ligne(s)`],
      }),
    };
  },

  toPortable(params: SummarizeParams, tableBeforeStep: Table): PortableParams {
    const columnNames: string[] = [];
    const groupBy: PortableGroupByColumn[] = params.groupBy.map((g) => {
      const name = columnName(tableBeforeStep, g.columnId);
      columnNames.push(name);
      return { name, normalization: g.normalization, binning: g.binning };
    });
    const aggregates: PortableAggregateSpec[] = params.aggregates.map((a) => {
      if (!a.columnId) return { fn: a.fn, asName: a.asName, separator: a.separator };
      const name = columnName(tableBeforeStep, a.columnId);
      columnNames.push(name);
      return { fn: a.fn, name, asName: a.asName, separator: a.separator };
    });
    return { params: { groupBy, aggregates }, columnNames: [...new Set(columnNames)] };
  },

  rebind(portableParams: unknown, nameToId: Record<string, ColumnId>): SummarizeParams {
    const p = portableParams as PortableSummarizeParams;
    return {
      groupBy: p.groupBy.map((g) => ({ columnId: resolveId(nameToId, g.name), normalization: g.normalization, binning: g.binning })),
      aggregates: p.aggregates.map((a) => ({
        fn: a.fn,
        asName: a.asName,
        separator: a.separator,
        columnId: a.name ? resolveId(nameToId, a.name) : undefined,
      })),
    };
  },
};
