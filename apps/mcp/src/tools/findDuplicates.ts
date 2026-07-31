import { computeDuplicateGroups, type DedupMode } from '@csv-studio/core/engine/dedupe.ts';
import { loadTableFromCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { boundRecords } from '../records.ts';
import { resolveExactColumnIds } from '../records.ts';
import { asRecord, optionalNumber, optionalString, requireString, requireStringArray } from '../validate.ts';
import { ToolInputError } from '../validate.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

const ROWS_PER_GROUP_SAMPLE = 10;

export const findDuplicatesTool: ToolDefinition = {
  name: 'find_duplicates',
  description:
    "Détecte les groupes de lignes en doublon dans un fichier CSV sur des colonnes-clés données (comparaison exacte ou normalisée : casse/accents/ponctuation/espaces ignorés). Renvoie les compteurs et un échantillon plafonné de groupes, jamais la table entière.",
  inputSchema: {
    type: 'object',
    required: ['path', 'keyColumns'],
    properties: {
      path: { type: 'string', description: 'Chemin du fichier CSV, relatif au répertoire de travail.' },
      keyColumns: { type: 'array', items: { type: 'string' }, description: 'Noms des colonnes formant la clé de doublon.' },
      mode: { type: 'string', enum: ['exact', 'normalized'], description: "Mode de comparaison (défaut 'normalized')." },
      sampleGroups: { type: 'number', description: 'Nombre de groupes à renvoyer en échantillon (défaut 30, plafond 200).' },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const path = requireString(input, 'path');
    const keyColumns = requireStringArray(input, 'keyColumns');
    const modeRaw = optionalString(input, 'mode') ?? 'normalized';
    if (modeRaw !== 'exact' && modeRaw !== 'normalized') {
      throw new ToolInputError('"mode" doit être "exact" ou "normalized".');
    }
    const mode: DedupMode = modeRaw;
    const cap = clampSampleCap(optionalNumber(input, 'sampleGroups'));

    const absPath = resolveInWorkdir(ctx.workdir, path);
    const table = loadTableFromCsvFile(absPath);
    const keyColumnIds = resolveExactColumnIds(table, keyColumns);

    const groups = computeDuplicateGroups(table, keyColumnIds, mode);
    const totalDuplicateRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const sampledGroups = groups.slice(0, cap);

    return {
      path,
      keyColumns,
      mode,
      totalRows: table.rows.length,
      totalGroups: groups.length,
      totalDuplicateRows,
      groupsSample: {
        totalCount: groups.length,
        truncated: groups.length > cap,
        sample: sampledGroups.map((g) => ({
          rowCount: g.rows.length,
          rows: boundRecords(table, g.rows, ROWS_PER_GROUP_SAMPLE),
        })),
      },
    };
  },
};
