import type { AggFn } from './operations/summarize.ts';
import { REPORT_SPEC_FORMAT_VERSION } from './reportSpec.ts';
import type {
  ChartBlock,
  KpiRowBlock,
  PageBreakBlock,
  ReportBlock,
  ReportSpec,
  SpecNormalization,
  TableBlock,
  TextBlock,
} from './reportSpec.ts';

export interface ReportSpecValidationError {
  /** Chemin JSON pointant précisément vers le champ en cause, ex. "blocks[2].summarize.groupBy[0].column". */
  path: string;
  message: string;
}

export type ReportSpecValidationResult = { ok: true; spec: ReportSpec } | { ok: false; errors: ReportSpecValidationError[] };

const AGG_FNS: AggFn[] = ['count', 'countDistinct', 'countNonEmpty', 'sum', 'avg', 'min', 'max', 'median', 'first', 'concat'];
const CHART_TYPES: ChartBlock['chartType'][] = ['bar', 'bar_stacked', 'line', 'pie', 'donut', 'histogram'];
const NORMALIZATIONS: SpecNormalization[] = ['raw', 'text', 'date'];
const BLOCK_TYPES = ['text', 'kpi_row', 'chart', 'table', 'page_break'];

class Collector {
  errors: ReportSpecValidationError[] = [];
  err(path: string, message: string): void {
    this.errors.push({ path, message });
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function validateAggFn(fn: unknown, path: string, c: Collector): fn is AggFn {
  if (typeof fn !== 'string' || !AGG_FNS.includes(fn as AggFn)) {
    c.err(path, `doit être l'une de : ${AGG_FNS.join(', ')} (reçu : ${JSON.stringify(fn)})`);
    return false;
  }
  return true;
}

function requireColumnRef(value: unknown, path: string, fn: string, expectedColumns: string[], c: Collector): string | null {
  if (!isNonEmptyString(value)) {
    c.err(path, `requis (chaîne non vide) pour la fonction "${fn}"`);
    return null;
  }
  if (!expectedColumns.includes(value)) {
    c.err(path, `"${value}" doit figurer dans expectedColumns`);
  }
  return value;
}

function validateBinning(binning: unknown, path: string, c: Collector): void {
  if (!isRecord(binning)) {
    c.err(path, 'doit être un objet {kind, ...}');
    return;
  }
  if (binning.kind === 'fixed_width') {
    if (typeof binning.width !== 'number' || binning.width <= 0) c.err(`${path}.width`, 'doit être un nombre strictement positif');
    if (binning.start !== undefined && typeof binning.start !== 'number') c.err(`${path}.start`, 'doit être un nombre si présent');
  } else if (binning.kind === 'fixed_count') {
    if (typeof binning.count !== 'number' || binning.count <= 0) c.err(`${path}.count`, 'doit être un nombre strictement positif');
  } else if (binning.kind === 'explicit_boundaries') {
    if (!Array.isArray(binning.boundaries) || binning.boundaries.length < 2 || !binning.boundaries.every((b) => typeof b === 'number')) {
      c.err(`${path}.boundaries`, 'doit être un tableau d\'au moins deux nombres');
    }
  } else {
    c.err(`${path}.kind`, `doit être l'un de : fixed_width, fixed_count, explicit_boundaries (reçu : ${JSON.stringify(binning.kind)})`);
  }
}

function validateSummarize(
  summarize: unknown,
  path: string,
  c: Collector,
  expectedColumns: string[],
): { groupByNames: string[]; aggNames: string[] } {
  const groupByNames: string[] = [];
  const aggNames: string[] = [];
  if (!isRecord(summarize)) {
    c.err(path, 'doit être un objet {groupBy, aggregates}');
    return { groupByNames, aggNames };
  }

  if (!Array.isArray(summarize.groupBy) || summarize.groupBy.length === 0) {
    c.err(`${path}.groupBy`, 'doit être un tableau non vide');
  } else {
    summarize.groupBy.forEach((g, i) => {
      const gp = `${path}.groupBy[${i}]`;
      if (!isRecord(g)) {
        c.err(gp, 'doit être un objet {column, normalization, binning?}');
        return;
      }
      if (!isNonEmptyString(g.column)) {
        c.err(`${gp}.column`, 'doit être une chaîne non vide');
      } else {
        groupByNames.push(g.column);
        if (!expectedColumns.includes(g.column)) c.err(`${gp}.column`, `"${g.column}" doit figurer dans expectedColumns`);
      }
      if (!NORMALIZATIONS.includes(g.normalization as SpecNormalization)) {
        c.err(`${gp}.normalization`, `doit être l'une de : ${NORMALIZATIONS.join(', ')} (reçu : ${JSON.stringify(g.normalization)})`);
      }
      if (g.binning !== undefined) validateBinning(g.binning, `${gp}.binning`, c);
    });
  }

  if (!Array.isArray(summarize.aggregates) || summarize.aggregates.length === 0) {
    c.err(`${path}.aggregates`, 'doit être un tableau non vide');
  } else {
    summarize.aggregates.forEach((a, i) => {
      const ap = `${path}.aggregates[${i}]`;
      if (!isRecord(a)) {
        c.err(ap, 'doit être un objet {fn, column?, asName, separator?}');
        return;
      }
      const fnOk = validateAggFn(a.fn, `${ap}.fn`, c);
      if (fnOk && a.fn !== 'count') requireColumnRef(a.column, `${ap}.column`, a.fn as string, expectedColumns, c);
      if (!isNonEmptyString(a.asName)) {
        c.err(`${ap}.asName`, 'doit être une chaîne non vide');
      } else {
        aggNames.push(a.asName);
      }
      if (a.separator !== undefined && typeof a.separator !== 'string') c.err(`${ap}.separator`, 'doit être une chaîne si présent');
    });
  }

  return { groupByNames, aggNames };
}

function validateConditionGroup(group: unknown, path: string, c: Collector, expectedColumns: string[]): void {
  if (!isRecord(group)) {
    c.err(path, 'doit être un objet {kind: "group", operator, conditions}');
    return;
  }
  if (group.kind !== 'group') {
    c.err(`${path}.kind`, 'doit valoir "group"');
    return;
  }
  if (group.operator !== 'and' && group.operator !== 'or') {
    c.err(`${path}.operator`, `doit être "and" ou "or" (reçu : ${JSON.stringify(group.operator)})`);
  }
  if (!Array.isArray(group.conditions)) {
    c.err(`${path}.conditions`, 'doit être un tableau');
    return;
  }
  group.conditions.forEach((cond, i) => {
    const cp = `${path}.conditions[${i}]`;
    if (!isRecord(cond)) {
      c.err(cp, 'doit être un objet');
      return;
    }
    if (cond.kind === 'group') {
      validateConditionGroup(cond, cp, c, expectedColumns);
      return;
    }
    if (!isNonEmptyString(cond.columnId)) {
      c.err(`${cp}.columnId`, 'doit être un nom de colonne (chaîne non vide)');
    } else if (!expectedColumns.includes(cond.columnId)) {
      c.err(`${cp}.columnId`, `"${cond.columnId}" doit figurer dans expectedColumns`);
    }
    const validOperators = ['eq', 'neq', 'contains', 'starts_with', 'regex', 'is_empty', 'is_not_empty', 'in_list', 'between'];
    if (typeof cond.operator !== 'string' || !validOperators.includes(cond.operator)) {
      c.err(`${cp}.operator`, `doit être l'un de : ${validOperators.join(', ')}`);
    }
  });
}

function validateBlock(block: unknown, index: number, c: Collector, expectedColumns: string[]): ReportBlock | null {
  const path = `blocks[${index}]`;
  if (!isRecord(block)) {
    c.err(path, 'doit être un objet');
    return null;
  }
  if (typeof block.type !== 'string' || !BLOCK_TYPES.includes(block.type)) {
    c.err(`${path}.type`, `doit être l'un de : ${BLOCK_TYPES.join(', ')} (reçu : ${JSON.stringify(block.type)})`);
    return null;
  }

  if (block.type === 'text') {
    if (!isNonEmptyString(block.content)) c.err(`${path}.content`, 'doit être une chaîne non vide');
    return { type: 'text', content: block.content as string } satisfies TextBlock;
  }

  if (block.type === 'page_break') {
    return { type: 'page_break' } satisfies PageBreakBlock;
  }

  if (block.type === 'kpi_row') {
    if (!Array.isArray(block.items) || block.items.length === 0) {
      c.err(`${path}.items`, 'doit être un tableau non vide');
      return null;
    }
    block.items.forEach((item, i) => {
      const ip = `${path}.items[${i}]`;
      if (!isRecord(item)) {
        c.err(ip, 'doit être un objet {label, agg, format?}');
        return;
      }
      if (!isNonEmptyString(item.label)) c.err(`${ip}.label`, 'doit être une chaîne non vide');
      if (!isRecord(item.agg)) {
        c.err(`${ip}.agg`, 'doit être un objet {fn, column?}');
      } else {
        const fnOk = validateAggFn(item.agg.fn, `${ip}.agg.fn`, c);
        if (fnOk && item.agg.fn !== 'count') requireColumnRef(item.agg.column, `${ip}.agg.column`, item.agg.fn as string, expectedColumns, c);
      }
      if (item.format !== undefined && item.format !== 'number' && item.format !== 'percent') {
        c.err(`${ip}.format`, 'doit être "number" ou "percent" si présent');
      }
    });
    return block as unknown as KpiRowBlock;
  }

  if (block.type === 'chart') {
    if (typeof block.chartType !== 'string' || !CHART_TYPES.includes(block.chartType as ChartBlock['chartType'])) {
      c.err(`${path}.chartType`, `doit être l'un de : ${CHART_TYPES.join(', ')} (reçu : ${JSON.stringify(block.chartType)})`);
    }
    if (block.orientation !== undefined && block.orientation !== 'vertical' && block.orientation !== 'horizontal') {
      c.err(`${path}.orientation`, 'doit être "vertical" ou "horizontal" si présent');
    }
    const { groupByNames, aggNames } = validateSummarize(block.summarize, `${path}.summarize`, c, expectedColumns);

    if (!isNonEmptyString(block.x)) {
      c.err(`${path}.x`, 'doit être une chaîne non vide');
    } else if (groupByNames.length > 0 && !groupByNames.includes(block.x)) {
      c.err(`${path}.x`, `"${block.x}" doit correspondre à l'une des colonnes de summarize.groupBy (${groupByNames.join(', ')})`);
    }

    if (!Array.isArray(block.series) || block.series.length === 0) {
      c.err(`${path}.series`, 'doit être un tableau non vide');
    } else {
      block.series.forEach((s, i) => {
        const sp = `${path}.series[${i}]`;
        if (!isRecord(s) || !isNonEmptyString(s.column)) {
          c.err(`${sp}.column`, 'doit être une chaîne non vide');
        } else if (aggNames.length > 0 && !aggNames.includes(s.column)) {
          c.err(`${sp}.column`, `"${s.column}" doit correspondre à l'un des agrégats de summarize.aggregates (asName parmi : ${aggNames.join(', ')})`);
        }
      });
    }
    return block as unknown as ChartBlock;
  }

  if (block.type === 'table') {
    if (!Array.isArray(block.columns) || block.columns.length === 0 || !block.columns.every((x) => typeof x === 'string' && x.trim() !== '')) {
      c.err(`${path}.columns`, 'doit être un tableau non vide de noms de colonnes');
    } else {
      for (const colName of block.columns) {
        if (!expectedColumns.includes(colName)) c.err(`${path}.columns`, `"${colName}" doit figurer dans expectedColumns`);
      }
    }
    if (block.filter !== undefined) validateConditionGroup(block.filter, `${path}.filter`, c, expectedColumns);
    if (block.maxRows !== undefined && (typeof block.maxRows !== 'number' || block.maxRows <= 0 || !Number.isInteger(block.maxRows))) {
      c.err(`${path}.maxRows`, 'doit être un entier strictement positif si présent');
    }
    return block as unknown as TableBlock;
  }

  return null;
}

/**
 * Valide un document JSON quelconque contre le format `ReportSpec`. Ne lève jamais : collecte
 * toutes les erreurs trouvées (bloc, champ, valeur attendue), pour qu'un rapport mal formé —
 * souvent généré par un assistant — produise un diagnostic exploitable plutôt qu'un écran blanc.
 */
export function validateReportSpec(input: unknown): ReportSpecValidationResult {
  const c = new Collector();

  if (!isRecord(input)) {
    c.err('$', 'le document doit être un objet JSON');
    return { ok: false, errors: c.errors };
  }

  if (typeof input.formatVersion !== 'number' || !Number.isInteger(input.formatVersion) || input.formatVersion < 1) {
    c.err('formatVersion', 'doit être un entier positif');
  } else if (input.formatVersion > REPORT_SPEC_FORMAT_VERSION) {
    c.err(
      'formatVersion',
      `version ${input.formatVersion} non supportée par cette version de CSV Studio (maximum géré : ${REPORT_SPEC_FORMAT_VERSION}) — mets à jour l'application`,
    );
  }

  if (input.kind !== 'report') {
    c.err('kind', `doit valoir exactement "report" (reçu : ${JSON.stringify(input.kind)})`);
  }

  if (!isNonEmptyString(input.title)) {
    c.err('title', 'doit être une chaîne non vide');
  }

  if (input.subtitle !== undefined && typeof input.subtitle !== 'string') {
    c.err('subtitle', 'doit être une chaîne si présent');
  }

  let expectedColumns: string[] = [];
  if (!Array.isArray(input.expectedColumns) || !input.expectedColumns.every((x) => isNonEmptyString(x))) {
    c.err('expectedColumns', 'doit être un tableau de noms de colonnes (chaînes non vides)');
  } else {
    expectedColumns = input.expectedColumns as string[];
  }

  const blocks: ReportBlock[] = [];
  if (!Array.isArray(input.blocks)) {
    c.err('blocks', 'doit être un tableau');
  } else {
    input.blocks.forEach((block, i) => {
      const validated = validateBlock(block, i, c, expectedColumns);
      if (validated) blocks.push(validated);
    });
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };

  return {
    ok: true,
    spec: {
      formatVersion: input.formatVersion as number,
      kind: 'report',
      title: input.title as string,
      subtitle: input.subtitle as string | undefined,
      expectedColumns,
      blocks,
    },
  };
}
