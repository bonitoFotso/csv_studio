import { createId } from '../ids.ts';
import { aggregateValues, matchRowsExact, type AggregateFn, type KeyPair } from '../join.ts';
import type { KeyNormalization } from '../keyNormalize.ts';
import { resolveFuzzyMatches, type FuzzyForcedPair, type FuzzyManualDecision, type FuzzyMatchConfig } from '../fuzzyJoin.ts';
import type { ApplyContext, Column, ColumnId, OperationDefinition, PortableParams, RebindContext, Row, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface CopyColumn {
  rightColumnId: ColumnId;
  asName: string;
}

export interface AggregateRule {
  rightColumnId: ColumnId;
  fn: AggregateFn;
  separator?: string;
}

export interface EnrichJoinParams {
  rightTableId: string;
  matchStrategy: 'exact' | 'fuzzy';
  keyPairs: KeyPair[];
  fuzzy?: FuzzyMatchConfig;
  copyColumns: CopyColumn[];
  collision: 'prefix' | 'suffix' | 'overwrite' | 'skip';
  collisionText?: string;
  joinType: 'left' | 'inner';
  multiMatch: 'first' | 'aggregate' | 'flag_conflict';
  aggregate?: AggregateRule[];
}

interface ResolvedTarget {
  copy: CopyColumn;
  targetId: ColumnId;
  skip: boolean;
}

function resolveCollisions(table: Table, copyColumns: CopyColumn[], collision: EnrichJoinParams['collision'], collisionText?: string) {
  const existingNames = new Set(table.columns.map((c) => c.name));
  const usedNewNames = new Set<string>();
  const newColumns: Column[] = [];
  const targets: ResolvedTarget[] = [];

  for (const copy of copyColumns) {
    let name = copy.asName;
    const collides = existingNames.has(name) || usedNewNames.has(name);

    if (collides) {
      if (collision === 'skip') {
        targets.push({ copy, targetId: '', skip: true });
        continue;
      }
      if (collision === 'overwrite') {
        const existing = table.columns.find((c) => c.name === name);
        if (existing) {
          targets.push({ copy, targetId: existing.id, skip: false });
          continue;
        }
      }
      const suffix = collisionText ?? '_droite';
      name = collision === 'prefix' ? `${suffix}${copy.asName}` : `${copy.asName}${suffix}`;
    }

    usedNewNames.add(name);
    const id = createId();
    newColumns.push({ id, name, hidden: false });
    targets.push({ copy, targetId: id, skip: false });
  }

  return { newColumns, targets };
}

function applyExact(table: Table, rightTable: Table, params: EnrichJoinParams) {
  const results = matchRowsExact(table.rows, rightTable.rows, params.keyPairs);
  const { newColumns, targets } = resolveCollisions(table, params.copyColumns, params.collision, params.collisionText);
  const columns = [...table.columns, ...newColumns];

  let unmatched = 0;
  let ambiguous = 0;
  const rows: Row[] = [];

  for (const { leftRow, matches } of results) {
    if (matches.length === 0) unmatched++;
    else if (matches.length > 1) ambiguous++;

    if (matches.length === 0 && params.joinType === 'inner') continue;

    const cells = { ...leftRow.cells };
    for (const target of targets) {
      if (target.skip) continue;
      let value = '';
      if (matches.length === 1) {
        value = matches[0].cells[target.copy.rightColumnId] ?? '';
      } else if (matches.length > 1) {
        if (params.multiMatch === 'first') {
          value = matches[0].cells[target.copy.rightColumnId] ?? '';
        } else if (params.multiMatch === 'aggregate') {
          const rule = params.aggregate?.find((a) => a.rightColumnId === target.copy.rightColumnId);
          const values = matches.map((m) => m.cells[target.copy.rightColumnId] ?? '');
          value = aggregateValues(values, rule?.fn ?? 'concat', rule?.separator);
        }
        // 'flag_conflict' : valeur laissée vide, à trancher manuellement (cf. export des ambiguës)
      }
      cells[target.targetId] = value;
    }
    rows.push({ ...leftRow, cells });
  }

  return {
    table: { ...table, columns, rows },
    report: makeReport({
      rowsIn: table.rows.length,
      rowsOut: rows.length,
      rowsRemoved: params.joinType === 'inner' ? table.rows.length - rows.length : 0,
      unmatched,
      ambiguous,
      notes: [`${results.length - unmatched} ligne(s) appariée(s), ${unmatched} non appariée(s), ${ambiguous} ambiguë(s) (plusieurs correspondances à droite)`],
    }),
  };
}

function applyFuzzy(table: Table, rightTable: Table, params: EnrichJoinParams) {
  if (!params.fuzzy) throw new Error('Configuration de rapprochement flou manquante.');
  const resolution = resolveFuzzyMatches(table.rows, rightTable.rows, params.fuzzy);
  const { newColumns, targets } = resolveCollisions(table, params.copyColumns, params.collision, params.collisionText);
  const columns = [...table.columns, ...newColumns];

  let unmatched = 0;
  const rows: Row[] = [];

  for (const leftRow of table.rows) {
    const match = resolution.matches.get(leftRow.id);
    if (!match) unmatched++;
    if (!match && params.joinType === 'inner') continue;

    const cells = { ...leftRow.cells };
    for (const target of targets) {
      if (target.skip) continue;
      cells[target.targetId] = match ? (match.rightRow.cells[target.copy.rightColumnId] ?? '') : '';
    }
    rows.push({ ...leftRow, cells });
  }

  const manualCount = [...resolution.matches.values()].filter((m) => m.origin === 'manual').length;

  return {
    table: { ...table, columns, rows },
    report: makeReport({
      rowsIn: table.rows.length,
      rowsOut: rows.length,
      rowsRemoved: params.joinType === 'inner' ? table.rows.length - rows.length : 0,
      unmatched,
      ambiguous: resolution.pending.length,
      notes: [
        `${resolution.matches.size} ligne(s) appariée(s) (dont ${manualCount} validée(s) manuellement), ${unmatched} non appariée(s)`,
        `${resolution.pending.length} en attente de validation, ${resolution.rejectedCount} rejetée(s) (score ou décision manuelle)`,
      ],
    }),
  };
}

interface PortableKeyPair {
  leftName: string;
  rightName: string;
  normalization?: KeyNormalization;
}

interface PortableCopyColumn {
  rightName: string;
  asName: string;
}

interface PortableAggregateRule {
  rightName: string;
  fn: AggregateFn;
  separator?: string;
}

interface PortableFuzzyConfig {
  leftKeyNames: string[];
  rightKeyNames: string[];
  blockingPairs: PortableKeyPair[];
  tokenized: boolean;
  thresholdHigh: number;
  thresholdLow: number;
  manualDecisions: FuzzyManualDecision[];
  forcedPairs?: FuzzyForcedPair[];
}

interface PortableEnrichJoinParams {
  matchStrategy: 'exact' | 'fuzzy';
  keyPairs: PortableKeyPair[];
  fuzzy?: PortableFuzzyConfig;
  copyColumns: PortableCopyColumn[];
  collision: EnrichJoinParams['collision'];
  collisionText?: string;
  joinType: EnrichJoinParams['joinType'];
  multiMatch: EnrichJoinParams['multiMatch'];
  aggregate?: PortableAggregateRule[];
}

export const enrichJoinDefinition: OperationDefinition<EnrichJoinParams> = {
  type: 'enrich_join',

  apply(table: Table, params: EnrichJoinParams, ctx: ApplyContext) {
    const rightTable = ctx.getTableById(params.rightTableId);
    return params.matchStrategy === 'exact' ? applyExact(table, rightTable, params) : applyFuzzy(table, rightTable, params);
  },

  toPortable(params: EnrichJoinParams, tableBeforeStep: Table, ctx: ApplyContext): PortableParams {
    const rightTable = ctx.getTableById(params.rightTableId);
    const leftNames: string[] = [];
    const rightNames: string[] = [];

    const keyPairs: PortableKeyPair[] = params.keyPairs.map((p) => {
      const leftName = columnName(tableBeforeStep, p.leftColumnId);
      const rightName = columnName(rightTable, p.rightColumnId);
      leftNames.push(leftName);
      rightNames.push(rightName);
      return { leftName, rightName, normalization: p.normalization };
    });

    const copyColumns: PortableCopyColumn[] = params.copyColumns.map((c) => {
      const rightName = columnName(rightTable, c.rightColumnId);
      rightNames.push(rightName);
      return { rightName, asName: c.asName };
    });

    const aggregate: PortableAggregateRule[] | undefined = params.aggregate?.map((a) => {
      const rightName = columnName(rightTable, a.rightColumnId);
      rightNames.push(rightName);
      return { rightName, fn: a.fn, separator: a.separator };
    });

    let fuzzy: PortableFuzzyConfig | undefined;
    if (params.fuzzy) {
      const leftKeyNames = params.fuzzy.leftKeyColumnIds.map((id) => {
        const n = columnName(tableBeforeStep, id);
        leftNames.push(n);
        return n;
      });
      const rightKeyNames = params.fuzzy.rightKeyColumnIds.map((id) => {
        const n = columnName(rightTable, id);
        rightNames.push(n);
        return n;
      });
      const blockingPairs: PortableKeyPair[] = params.fuzzy.blockingPairs.map((p) => {
        const leftName = columnName(tableBeforeStep, p.leftColumnId);
        const rightName = columnName(rightTable, p.rightColumnId);
        leftNames.push(leftName);
        rightNames.push(rightName);
        return { leftName, rightName, normalization: p.normalization };
      });
      fuzzy = {
        leftKeyNames,
        rightKeyNames,
        blockingPairs,
        tokenized: params.fuzzy.tokenized,
        thresholdHigh: params.fuzzy.thresholdHigh,
        thresholdLow: params.fuzzy.thresholdLow,
        // Indexées par valeurs de clé normalisées, pas par colonne : voyagent telles quelles.
        manualDecisions: params.fuzzy.manualDecisions,
        forcedPairs: params.fuzzy.forcedPairs,
      };
    }

    const portable: PortableEnrichJoinParams = {
      matchStrategy: params.matchStrategy,
      keyPairs,
      fuzzy,
      copyColumns,
      collision: params.collision,
      collisionText: params.collisionText,
      joinType: params.joinType,
      multiMatch: params.multiMatch,
      aggregate,
    };

    return {
      params: portable,
      columnNames: [...new Set(leftNames)],
      secondary: { tableName: rightTable.name, columnNames: [...new Set(rightNames)] },
    };
  },

  rebind(portableParams: unknown, nameToId: Record<string, ColumnId>, ctx?: RebindContext): EnrichJoinParams {
    if (!ctx?.secondaryTable || !ctx.secondaryNameToId) {
      throw new Error('Fichier secondaire manquant : un rapprochement (enrich_join) doit être remappé avec sa propre table de droite.');
    }
    const rightNameToId = ctx.secondaryNameToId;
    const p = portableParams as PortableEnrichJoinParams;

    const keyPairs: KeyPair[] = p.keyPairs.map((kp) => ({
      leftColumnId: resolveId(nameToId, kp.leftName),
      rightColumnId: resolveId(rightNameToId, kp.rightName),
      normalization: kp.normalization,
    }));

    const copyColumns: CopyColumn[] = p.copyColumns.map((c) => ({ rightColumnId: resolveId(rightNameToId, c.rightName), asName: c.asName }));

    const aggregate: AggregateRule[] | undefined = p.aggregate?.map((a) => ({
      rightColumnId: resolveId(rightNameToId, a.rightName),
      fn: a.fn,
      separator: a.separator,
    }));

    let fuzzy: FuzzyMatchConfig | undefined;
    if (p.fuzzy) {
      fuzzy = {
        leftKeyColumnIds: p.fuzzy.leftKeyNames.map((n) => resolveId(nameToId, n)),
        rightKeyColumnIds: p.fuzzy.rightKeyNames.map((n) => resolveId(rightNameToId, n)),
        blockingPairs: p.fuzzy.blockingPairs.map((bp) => ({
          leftColumnId: resolveId(nameToId, bp.leftName),
          rightColumnId: resolveId(rightNameToId, bp.rightName),
          normalization: bp.normalization,
        })),
        tokenized: p.fuzzy.tokenized,
        thresholdHigh: p.fuzzy.thresholdHigh,
        thresholdLow: p.fuzzy.thresholdLow,
        manualDecisions: p.fuzzy.manualDecisions,
        forcedPairs: p.fuzzy.forcedPairs,
      };
    }

    return {
      rightTableId: ctx.secondaryTable.id,
      matchStrategy: p.matchStrategy,
      keyPairs,
      fuzzy,
      copyColumns,
      collision: p.collision,
      collisionText: p.collisionText,
      joinType: p.joinType,
      multiMatch: p.multiMatch,
      aggregate,
    };
  },
};
