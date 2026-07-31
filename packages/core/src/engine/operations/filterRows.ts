import type { ConditionGroup } from '../filterEngine.ts';
import { evaluateGroup } from '../filterEngine.ts';
import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

/**
 * `extract_to_new_table` n'est PAS traité ici : extraire vers une nouvelle table crée un
 * nouvel artefact de l'espace de travail (sa propre Table + son propre Pipeline), ce n'est
 * pas une transformation de la table courante. Voir `extractMatchingRows` dans ce même fichier,
 * utilisé par la couche espace de travail. Dans le pipeline, seuls 'keep' et 'delete' s'appliquent.
 */
export interface FilterRowsParams {
  root: ConditionGroup;
  action: 'keep' | 'delete' | 'extract_to_new_table';
  newTableName?: string;
}

// Exportées : réutilisées par `reportSpec.ts` pour le champ `filter` d'un bloc `table`, qui a
// besoin du même remappage nom <-> ColumnId qu'un `filter_rows` — pas de format parallèle.
export function collectConditionColumnIds(group: ConditionGroup, out: ColumnId[]): void {
  for (const c of group.conditions) {
    if (c.kind === 'group') collectConditionColumnIds(c, out);
    else out.push(c.columnId);
  }
}

export function mapConditionColumns(group: ConditionGroup, map: (id: ColumnId) => ColumnId): ConditionGroup {
  return {
    ...group,
    conditions: group.conditions.map((c) => (c.kind === 'group' ? mapConditionColumns(c, map) : { ...c, columnId: map(c.columnId) })),
  };
}

export const filterRowsDefinition: OperationDefinition<FilterRowsParams> = {
  type: 'filter_rows',

  apply(table: Table, params: FilterRowsParams) {
    if (params.action === 'extract_to_new_table') {
      // No-op sur la table courante : l'extraction est gérée hors du pipeline (workspace layer).
      return {
        table,
        report: makeReport({
          rowsIn: table.rows.length,
          rowsOut: table.rows.length,
          notes: ['extract_to_new_table ne modifie pas la table courante ; utiliser extractMatchingRows.'],
        }),
      };
    }

    const matches = table.rows.filter((r) => evaluateGroup(r, params.root));
    const keepSet = new Set((params.action === 'keep' ? matches : table.rows.filter((r) => !matches.includes(r))).map((r) => r.id));
    const rows = table.rows.filter((r) => keepSet.has(r.id));

    return {
      table: { ...table, rows },
      report: makeReport({
        rowsIn: table.rows.length,
        rowsOut: rows.length,
        rowsRemoved: table.rows.length - rows.length,
      }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const ids: ColumnId[] = [];
    collectConditionColumnIds(params.root, ids);
    const names = ids.map((id) => columnName(tableBeforeStep, id));
    const idToName = new Map(ids.map((id) => [id, columnName(tableBeforeStep, id)]));
    const portableRoot = mapConditionColumns(params.root, (id) => idToName.get(id)!);
    return { params: { root: portableRoot, action: params.action, newTableName: params.newTableName }, columnNames: names };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { root: ConditionGroup; action: FilterRowsParams['action']; newTableName?: string };
    const root = mapConditionColumns(p.root, (name) => resolveId(nameToId, name));
    return { root, action: p.action, newTableName: p.newTableName };
  },
};

/** Calcule les lignes correspondant à la condition, pour matérialiser une nouvelle table (hors pipeline). */
export function extractMatchingRows(table: Table, root: ConditionGroup) {
  return table.rows.filter((r) => evaluateGroup(r, root));
}
