import { createId } from '../ids.ts';
import type { ConditionGroup } from '../filterEngine.ts';
import { evaluateGroup } from '../filterEngine.ts';
import type { ColumnId, OperationDefinition, Table } from '../types.ts';
import { collectConditionColumnIds, mapConditionColumns } from './filterRows.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export type SetValueWhereTarget = { kind: 'new'; name: string } | { kind: 'existing'; columnId: ColumnId };

/**
 * Complète `filter_rows` : au lieu de garder/supprimer les lignes qui correspondent au filtre,
 * pose une valeur sur une colonne (nouvelle ou existante) — potentiellement une valeur pour les
 * lignes qui correspondent, une autre pour celles qui ne correspondent pas, ou une seule des deux
 * (l'autre côté reste alors inchangé sur une colonne existante ; posé à "" sur une nouvelle colonne,
 * qui doit avoir une valeur sur chaque ligne).
 */
export interface SetValueWhereParams {
  root: ConditionGroup;
  target: SetValueWhereTarget;
  matchValue?: string;
  nonMatchValue?: string;
}

export const setValueWhereDefinition: OperationDefinition<SetValueWhereParams> = {
  type: 'set_value_where',

  apply(table: Table, params: SetValueWhereParams) {
    let columns = table.columns;
    let targetId: ColumnId;
    if (params.target.kind === 'new') {
      targetId = createId();
      columns = [...table.columns, { id: targetId, name: params.target.name, hidden: false }];
    } else {
      targetId = params.target.columnId;
      if (!table.columns.some((c) => c.id === targetId)) throw new Error(`Colonne introuvable: ${targetId}`);
    }

    let rowsModified = 0;
    const rows = table.rows.map((r) => {
      const matched = evaluateGroup(r, params.root);
      const value = matched ? params.matchValue : params.nonMatchValue;
      if (value === undefined) {
        if (params.target.kind === 'new' && !(targetId in r.cells)) return { ...r, cells: { ...r.cells, [targetId]: '' } };
        return r;
      }
      if ((r.cells[targetId] ?? '') === value) return r;
      rowsModified++;
      return { ...r, cells: { ...r.cells, [targetId]: value } };
    });

    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length, rowsModified }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const ids: ColumnId[] = [];
    collectConditionColumnIds(params.root, ids);
    const idToName = new Map(ids.map((id) => [id, columnName(tableBeforeStep, id)]));
    const portableRoot = mapConditionColumns(params.root, (id) => idToName.get(id)!);

    const columnNames = ids.map((id) => idToName.get(id)!);
    const target =
      params.target.kind === 'new'
        ? { kind: 'new' as const, name: params.target.name }
        : { kind: 'existing' as const, name: columnName(tableBeforeStep, params.target.columnId) };
    if (target.kind === 'existing') columnNames.push(target.name);

    return {
      params: { root: portableRoot, target, matchValue: params.matchValue, nonMatchValue: params.nonMatchValue },
      columnNames,
    };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as {
      root: ConditionGroup;
      target: { kind: 'new'; name: string } | { kind: 'existing'; name: string };
      matchValue?: string;
      nonMatchValue?: string;
    };
    const root = mapConditionColumns(p.root, (name) => resolveId(nameToId, name));
    const target: SetValueWhereTarget =
      p.target.kind === 'new' ? { kind: 'new', name: p.target.name } : { kind: 'existing', columnId: resolveId(nameToId, p.target.name) };
    return { root, target, matchValue: p.matchValue, nonMatchValue: p.nonMatchValue };
  },
};
