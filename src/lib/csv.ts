import Papa from 'papaparse';
import type { Column, Table } from '@/engine/types.ts';

export interface ParsedCsv {
  columnNames: string[];
  rows: Record<string, string>[];
  delimiter: string;
  /** Nombre total de lignes brutes avant l'en-tête (pour l'écran de config import si la détection se trompe). */
  rawRowCount: number;
  /** Aperçu des toutes premières lignes brutes, pour laisser choisir la ligne d'en-tête. */
  preview: string[][];
}

export interface ParseCsvOptions {
  /** Index (0-based) de la ligne d'en-tête. Par défaut 0 (première ligne). */
  headerRowIndex?: number;
  /** Force un délimiteur ; par défaut détection automatique par PapaParse. */
  delimiter?: string;
}

function dedupeColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw, i) => {
    const name = raw.trim() || `Colonne ${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

export function parseCsvText(text: string, options: ParseCsvOptions = {}): ParsedCsv {
  const headerRowIndex = options.headerRowIndex ?? 0;
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    delimiter: options.delimiter ?? '',
  });

  const rawRows = result.data;
  const delimiter = result.meta.delimiter || ',';
  const headerRow = rawRows[headerRowIndex] ?? [];
  const columnNames = dedupeColumnNames(headerRow);
  const dataRows = rawRows.slice(headerRowIndex + 1);

  const rows = dataRows.map((raw) => {
    const obj: Record<string, string> = {};
    columnNames.forEach((name, i) => {
      obj[name] = raw[i] ?? '';
    });
    return obj;
  });

  return {
    columnNames,
    rows,
    delimiter,
    rawRowCount: rawRows.length,
    preview: rawRows.slice(0, 5),
  };
}

export async function parseCsvFile(file: File, options?: ParseCsvOptions): Promise<ParsedCsv> {
  const text = await file.text();
  return parseCsvText(text, options);
}

export interface ExportCsvOptions {
  delimiter: string;
  bom: boolean;
  columns: Pick<Column, 'id' | 'name'>[];
}

export function tableToCsvString(table: Table, options: ExportCsvOptions): string {
  const fields = options.columns.map((c) => c.name);
  const data = table.rows.map((r) => options.columns.map((c) => r.cells[c.id] ?? ''));
  return Papa.unparse({ fields, data }, { delimiter: options.delimiter });
}

export function suggestExportFilename(tableName: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = tableName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'table';
  return `${slug}-${date}.${extension}`;
}
