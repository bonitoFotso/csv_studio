import { parseCsvText, type ParseCsvOptions, type ParsedCsv } from '@csv-studio/core/csv.ts';

export async function parseCsvFile(file: File, options?: ParseCsvOptions): Promise<ParsedCsv> {
  const text = await file.text();
  return parseCsvText(text, options);
}
