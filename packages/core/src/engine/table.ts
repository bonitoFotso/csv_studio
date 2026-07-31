import { createId } from './ids.ts';
import type { Column, Row, Table } from './types.ts';

/** Construit une Table depuis des lignes brutes (objets nom -> valeur), typiquement issues de PapaParse. */
export function createTableFromRows(name: string, columnNames: string[], rawRows: Record<string, string>[]): Table {
  const columns: Column[] = columnNames.map((colName) => ({ id: createId(), name: colName, hidden: false }));
  const nameToId = new Map(columns.map((c) => [c.name, c.id]));

  const rows: Row[] = rawRows.map((raw) => {
    const cells: Record<string, string> = {};
    for (const col of columns) {
      const id = nameToId.get(col.name)!;
      cells[id] = raw[col.name] ?? '';
    }
    return { id: createId(), cells };
  });

  return { id: createId(), name, columns, rows };
}

export function findColumnByName(table: Table, name: string) {
  return table.columns.find((c) => c.name === name);
}

export function getColumnId(table: Table, name: string): string {
  const col = findColumnByName(table, name);
  if (!col) throw new Error(`Colonne inconnue: ${name}`);
  return col.id;
}

/** Copie superficielle d'une table avec de nouvelles rows/columns (jamais de mutation en place). */
export function withTableData(table: Table, patch: Partial<Pick<Table, 'columns' | 'rows' | 'name'>>): Table {
  return { ...table, ...patch };
}

/** Nouvel artefact d'espace de travail (nouvel id) partageant les mêmes ColumnId, avec un sous-ensemble de lignes. */
export function cloneTableWithRows(source: Table, name: string, rows: Row[]): Table {
  return { id: createId(), name, columns: [...source.columns], rows };
}
