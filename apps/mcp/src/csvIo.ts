import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseCsvText, tableToCsvString } from '@csv-studio/core/csv.ts';
import type { Column, Table } from '@csv-studio/core/engine/types.ts';
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';

const BYTE_ORDER_MARK = '﻿';

export function loadTableFromCsvFile(absPath: string, tableName = basename(absPath)): Table {
  const text = readFileSync(absPath, 'utf-8');
  const parsed = parseCsvText(text);
  return createTableFromRows(tableName, parsed.columnNames, parsed.rows);
}

export interface WriteCsvOptions {
  overwrite: boolean;
  delimiter?: string;
  bom?: boolean;
}

/** N'écrase jamais un fichier existant sans `overwrite: true` explicite — jamais de devinette silencieuse côté écriture disque. */
export function writeTableToCsvFile(table: Table, absPath: string, options: WriteCsvOptions): void {
  if (!options.overwrite && existsSync(absPath)) {
    throw new Error(`Le fichier "${absPath}" existe déjà. Passe overwrite: true pour l'écraser explicitement.`);
  }
  const columns: Pick<Column, 'id' | 'name'>[] = table.columns.map((c) => ({ id: c.id, name: c.name }));
  const bom = options.bom ?? true;
  const csv = tableToCsvString(table, { delimiter: options.delimiter ?? ',', bom, columns });
  writeFileSync(absPath, (bom ? BYTE_ORDER_MARK : '') + csv, 'utf-8');
}
