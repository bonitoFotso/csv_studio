import { createId } from '../ids.ts';
import type { ApplyContext, ColumnId, OperationDefinition, PortableParams, RebindContext, Row, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

export interface ColumnMappingEntry {
  /** Colonne de la table actuelle qui reçoit la valeur. */
  targetColumnId: ColumnId;
  /** Colonne du fichier source dont la valeur est copiée. */
  sourceColumnId: ColumnId;
}

export interface AppendRowsParams {
  sourceTableId: string;
  /** Une entrée par colonne cible mappée ; les colonnes cibles absentes du mapping restent vides sur les lignes ajoutées. */
  columnMapping: ColumnMappingEntry[];
}

/**
 * Ajoute les lignes d'un second fichier à la table actuelle, en mappant ses colonnes vers les
 * colonnes existantes (par correspondance choisie par l'utilisateur, jamais par nom codé en dur).
 * N'ajoute ni ne supprime aucune colonne : les colonnes source non mappées sont ignorées, les
 * colonnes cibles non mappées restent vides sur les lignes ajoutées.
 */
export const appendRowsDefinition: OperationDefinition<AppendRowsParams> = {
  type: 'append_rows',

  apply(table: Table, params: AppendRowsParams, ctx: ApplyContext) {
    const sourceTable = ctx.getTableById(params.sourceTableId);

    const newRows: Row[] = sourceTable.rows.map((sourceRow) => {
      const cells: Record<string, string> = {};
      for (const col of table.columns) cells[col.id] = '';
      for (const m of params.columnMapping) cells[m.targetColumnId] = sourceRow.cells[m.sourceColumnId] ?? '';
      return { id: createId(), cells };
    });

    return {
      table: { ...table, rows: [...table.rows, ...newRows] },
      report: makeReport({
        rowsIn: table.rows.length,
        rowsOut: table.rows.length + newRows.length,
        rowsAdded: newRows.length,
        notes: [`${newRows.length} ligne(s) ajoutée(s) depuis « ${sourceTable.name} »`],
      }),
    };
  },

  toPortable(params: AppendRowsParams, tableBeforeStep: Table, ctx: ApplyContext): PortableParams {
    const sourceTable = ctx.getTableById(params.sourceTableId);
    const targetNames: string[] = [];
    const sourceNames: string[] = [];

    const columnMapping = params.columnMapping.map((m) => {
      const targetName = columnName(tableBeforeStep, m.targetColumnId);
      const sourceName = columnName(sourceTable, m.sourceColumnId);
      targetNames.push(targetName);
      sourceNames.push(sourceName);
      return { targetName, sourceName };
    });

    return {
      params: { columnMapping },
      columnNames: targetNames,
      secondary: { tableName: sourceTable.name, columnNames: sourceNames },
    };
  },

  rebind(portableParams: unknown, nameToId: Record<string, ColumnId>, ctx?: RebindContext): AppendRowsParams {
    if (!ctx?.secondaryTable || !ctx.secondaryNameToId) {
      throw new Error("Fichier secondaire manquant : un ajout de lignes doit être remappé avec son fichier source.");
    }
    const sourceNameToId = ctx.secondaryNameToId;
    const p = portableParams as { columnMapping: { targetName: string; sourceName: string }[] };

    return {
      sourceTableId: ctx.secondaryTable.id,
      columnMapping: p.columnMapping.map((m) => ({
        targetColumnId: resolveId(nameToId, m.targetName),
        sourceColumnId: resolveId(sourceNameToId, m.sourceName),
      })),
    };
  },
};
