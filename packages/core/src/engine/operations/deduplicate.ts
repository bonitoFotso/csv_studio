import { createId } from '../ids.ts';
import { computeDuplicateGroups, mergeFirstNonEmpty, mostCompleteRow, type DedupMode } from '../dedupe.ts';
import type { ColumnId, OperationDefinition, Row, RowId, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export type DedupAction = 'keep_first' | 'keep_last' | 'keep_most_complete' | 'merge_first_nonempty' | 'flag_only';

export interface DeduplicateParams {
  keyColumnIds: ColumnId[];
  mode: DedupMode;
  action: DedupAction;
  flagColumnName?: string;
  /** Action différente pour un groupe précis (clé de comparaison -> action), pour les décisions au cas par cas dans l'écran de revue. */
  groupOverrides?: { groupKey: string; action: DedupAction }[];
}

function resolveAction(groupKey: string, params: DeduplicateParams): DedupAction {
  return params.groupOverrides?.find((o) => o.groupKey === groupKey)?.action ?? params.action;
}

export const deduplicateDefinition: OperationDefinition<DeduplicateParams> = {
  type: 'deduplicate',

  apply(table: Table, params: DeduplicateParams) {
    const groups = computeDuplicateGroups(table, params.keyColumnIds, params.mode);

    const flaggedRowIds = new Set<RowId>();
    const droppedRowIds = new Set<RowId>();
    const mergedReplacements = new Map<RowId, Row>();
    let mergeCount = 0;

    for (const group of groups) {
      const action = resolveAction(group.key, params);
      if (action === 'flag_only') {
        for (const r of group.rows) flaggedRowIds.add(r.id);
      } else if (action === 'keep_first') {
        for (const r of group.rows.slice(1)) droppedRowIds.add(r.id);
      } else if (action === 'keep_last') {
        for (const r of group.rows.slice(0, -1)) droppedRowIds.add(r.id);
      } else if (action === 'keep_most_complete') {
        const best = mostCompleteRow(group.rows);
        for (const r of group.rows) if (r.id !== best.id) droppedRowIds.add(r.id);
      } else if (action === 'merge_first_nonempty') {
        const merged = mergeFirstNonEmpty(
          group.rows,
          table.columns.map((c) => c.id),
        );
        mergedReplacements.set(group.rows[0].id, merged);
        for (const r of group.rows.slice(1)) droppedRowIds.add(r.id);
        mergeCount++;
      }
    }

    const needsFlagColumn = flaggedRowIds.size > 0;
    let columns = table.columns;
    let flagColumnId: string | null = null;
    if (needsFlagColumn) {
      flagColumnId = createId();
      columns = [...table.columns, { id: flagColumnId, name: params.flagColumnName?.trim() || '_doublon', hidden: false }];
    }

    const rows = table.rows
      .filter((r) => !droppedRowIds.has(r.id))
      .map((r) => {
        const base = mergedReplacements.get(r.id) ?? r;
        if (!needsFlagColumn) return base;
        return { ...base, cells: { ...base.cells, [flagColumnId!]: flaggedRowIds.has(r.id) ? 'oui' : '' } };
      });

    return {
      table: { ...table, columns, rows },
      report: makeReport({
        rowsIn: table.rows.length,
        rowsOut: rows.length,
        rowsRemoved: table.rows.length - rows.length,
        rowsModified: mergeCount,
        notes: [
          `${groups.length} groupe(s) de doublons détecté(s) sur ${table.rows.length} lignes`,
          ...(needsFlagColumn ? [`${flaggedRowIds.size} ligne(s) marquée(s) dans « ${params.flagColumnName?.trim() || '_doublon'} »`] : []),
        ],
      }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const names = params.keyColumnIds.map((id) => columnName(tableBeforeStep, id));
    return {
      params: {
        keyColumnNames: names,
        mode: params.mode,
        action: params.action,
        flagColumnName: params.flagColumnName,
        groupOverrides: params.groupOverrides,
      },
      columnNames: names,
    };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as {
      keyColumnNames: string[];
      mode: DedupMode;
      action: DedupAction;
      flagColumnName?: string;
      groupOverrides?: DeduplicateParams['groupOverrides'];
    };
    return {
      keyColumnIds: p.keyColumnNames.map((n) => resolveId(nameToId, n)),
      mode: p.mode,
      action: p.action,
      flagColumnName: p.flagColumnName,
      groupOverrides: p.groupOverrides,
    };
  },
};
