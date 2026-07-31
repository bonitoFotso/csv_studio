import { computeAllProfiles } from '@csv-studio/core/engine/profile.ts';
import { loadTableFromCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { boundRecords } from '../records.ts';
import { asRecord, optionalNumber, requireString } from '../validate.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

export const profileCsvTool: ToolDefinition = {
  name: 'profile_csv',
  description:
    "Profile un fichier CSV : colonnes, type détecté par colonne, taux de remplissage, cardinalité, valeurs fréquentes, anomalies détectées (espaces, casse incohérente, mojibake), et un échantillon plafonné de lignes.",
  inputSchema: {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', description: 'Chemin du fichier CSV, relatif au répertoire de travail du serveur.' },
      sampleRows: { type: 'number', description: 'Nombre de lignes d\'exemple à renvoyer (défaut 30, plafond 200).' },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const path = requireString(input, 'path');
    const cap = clampSampleCap(optionalNumber(input, 'sampleRows'));

    const absPath = resolveInWorkdir(ctx.workdir, path);
    const table = loadTableFromCsvFile(absPath);
    const profiles = computeAllProfiles(table);

    return {
      path,
      totalRows: table.rows.length,
      totalColumns: table.columns.length,
      columns: table.columns.map((col, i) => {
        const p = profiles[i];
        return {
          name: col.name,
          detectedType: p.detectedType,
          fillRate: p.fillRate,
          filledCount: p.filledCount,
          distinctCount: p.distinctCount,
          topValues: p.topValues,
          anomalies: p.anomalies,
        };
      }),
      sample: boundRecords(table, table.rows, cap),
    };
  },
};
