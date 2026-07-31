import { computeSummarizeTable } from './operations/summarize.ts';
import type { AggregateSpec, GroupByColumn, SummarizeParams } from './operations/summarize.ts';
import { resolveId } from './operations/reportUtil.ts';
import { mapConditionColumns } from './operations/filterRows.ts';
import { evaluateGroup } from './filterEngine.ts';
import { buildNameToId } from './recipe.ts';
import type { KeyNormalization } from './keyNormalize.ts';
import type { ColumnMapping, ColumnId, Table } from './types.ts';
import type {
  ChartAggregateSpec,
  ChartBlock,
  ChartGroupBySpec,
  KpiItem,
  ReportBlock,
  ReportSpec,
  SpecNormalization,
  TableBlock,
} from './reportSpec.ts';

/** 'raw' (vocabulaire ReportSpec) == 'none' (vocabulaire interne `KeyNormalization`). */
function toKeyNormalization(n: SpecNormalization): KeyNormalization {
  return n === 'raw' ? 'none' : n;
}


function resolveSummarizeParams(spec: ChartBlock['summarize'], nameToId: Record<string, ColumnId>): SummarizeParams {
  const groupBy: GroupByColumn[] = spec.groupBy.map((g: ChartGroupBySpec) => ({
    columnId: resolveId(nameToId, g.column),
    normalization: toKeyNormalization(g.normalization),
    binning: g.binning,
  }));
  const aggregates: AggregateSpec[] = spec.aggregates.map((a: ChartAggregateSpec) => ({
    fn: a.fn,
    columnId: a.column ? resolveId(nameToId, a.column) : undefined,
    asName: a.asName,
    separator: a.separator,
  }));
  return { groupBy, aggregates };
}

export interface ComputedTextBlock {
  type: 'text';
  content: string;
}

export interface ComputedKpiValue {
  label: string;
  value: string;
  format: 'number' | 'percent';
}

export interface ComputedKpiRowBlock {
  type: 'kpi_row';
  items: ComputedKpiValue[];
}

export interface ComputedChartSeries {
  label: string;
  /** Une valeur par catégorie de `categories`, dans le même ordre. */
  values: string[];
}

export interface ComputedChartBlock {
  type: 'chart';
  chartType: ChartBlock['chartType'];
  title?: string;
  orientation: 'vertical' | 'horizontal';
  caption?: string;
  categories: string[];
  series: ComputedChartSeries[];
}

export interface ComputedTableBlock {
  type: 'table';
  title?: string;
  columnNames: string[];
  rows: string[][];
  totalMatching: number;
  truncated: boolean;
}

export interface ComputedPageBreakBlock {
  type: 'page_break';
}

export type ComputedBlock = ComputedTextBlock | ComputedKpiRowBlock | ComputedChartBlock | ComputedTableBlock | ComputedPageBreakBlock;

export interface ComputedReport {
  title: string;
  subtitle?: string;
  blocks: ComputedBlock[];
}

function computeKpiItem(item: KpiItem, table: Table, nameToId: Record<string, ColumnId>): ComputedKpiValue {
  const params: SummarizeParams = {
    groupBy: [],
    aggregates: [{ fn: item.agg.fn, columnId: item.agg.column ? resolveId(nameToId, item.agg.column) : undefined, asName: '_kpi', separator: item.agg.separator }],
  };
  const { columns, rows } = computeSummarizeTable(table, params);
  const value = rows[0]?.cells[columns[0]?.id] ?? '';
  return { label: item.label, value, format: item.format ?? 'number' };
}

function computeChartBlock(block: ChartBlock, table: Table, nameToId: Record<string, ColumnId>): ComputedChartBlock {
  const params = resolveSummarizeParams(block.summarize, nameToId);
  const { columns, rows } = computeSummarizeTable(table, params);

  const xColumn = columns.find((c) => c.name === block.x);
  if (!xColumn) throw new Error(`Colonne d'axe "${block.x}" introuvable dans le résultat de l'agrégation du graphique.`);

  const categories = rows.map((r) => r.cells[xColumn.id] ?? '');
  const series: ComputedChartSeries[] = block.series.map((s) => {
    const col = columns.find((c) => c.name === s.column);
    if (!col) throw new Error(`Colonne de série "${s.column}" introuvable dans le résultat de l'agrégation du graphique.`);
    return { label: s.label ?? s.column, values: rows.map((r) => r.cells[col.id] ?? '') };
  });

  return {
    type: 'chart',
    chartType: block.chartType,
    title: block.title,
    orientation: block.orientation ?? 'vertical',
    caption: block.caption,
    categories,
    series,
  };
}

function computeTableBlock(block: TableBlock, table: Table, nameToId: Record<string, ColumnId>): ComputedTableBlock {
  const columnIds = block.columns.map((name) => resolveId(nameToId, name));
  const resolvedFilter = block.filter ? mapConditionColumns(block.filter, (name) => resolveId(nameToId, name)) : null;
  const matching = resolvedFilter ? table.rows.filter((r) => evaluateGroup(r, resolvedFilter)) : table.rows;
  const maxRows = block.maxRows ?? matching.length;
  const sliced = matching.slice(0, maxRows);

  return {
    type: 'table',
    title: block.title,
    columnNames: block.columns,
    rows: sliced.map((r) => columnIds.map((id) => r.cells[id] ?? '')),
    totalMatching: matching.length,
    truncated: matching.length > sliced.length,
  };
}

/**
 * Calcule les données de chaque bloc d'un `ReportSpec` déjà validé, contre une table et un
 * remappage nom -> `ColumnId` déjà confirmés par l'utilisateur. Le rapport est une étape
 * non destructive : il lit l'état courant, il ne modifie jamais la table.
 */
export function computeReport(spec: ReportSpec, table: Table, mapping: ColumnMapping): ComputedReport {
  const nameToId = buildNameToId(table, mapping);

  const blocks: ComputedBlock[] = spec.blocks.map((block: ReportBlock) => {
    switch (block.type) {
      case 'text':
        return { type: 'text', content: block.content };
      case 'page_break':
        return { type: 'page_break' };
      case 'kpi_row':
        return { type: 'kpi_row', items: block.items.map((item) => computeKpiItem(item, table, nameToId)) };
      case 'chart':
        return computeChartBlock(block, table, nameToId);
      case 'table':
        return computeTableBlock(block, table, nameToId);
    }
  });

  return { title: spec.title, subtitle: spec.subtitle, blocks };
}
