import { validateReportSpec } from '@csv-studio/core/engine/reportSpecValidate.ts';
import { computeReport, type ComputedBlock } from '@csv-studio/core/engine/reportSpecCompute.ts';
import type { ColumnMapping } from '@csv-studio/core/engine/types.ts';
import { loadTableFromCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { asRecord, optionalNumber, requireString, ToolInputError } from '../validate.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

/**
 * Plafonne les blocs `table` du rapport calculé pour le transport MCP, en plus (pas à la place)
 * du plafond `maxRows` déjà défini par le ReportSpec lui-même — deux préoccupations distinctes :
 * `maxRows`/`truncated` reflètent le contenu voulu du rapport, `transportTruncated` reflète la
 * limite de taille de la réponse MCP. Le résultat n'est plus un `ComputedBlock` du core (qui n'a
 * pas ce champ) mais sa forme JSON destinée au client MCP — d'où le retour en `unknown[]`.
 */
function boundBlocksForTransport(blocks: ComputedBlock[], cap: number): unknown[] {
  return blocks.map((block) => {
    if (block.type !== 'table') return block;
    const transportTruncated = block.rows.length > cap;
    return { ...block, rows: block.rows.slice(0, cap), ...(transportTruncated ? { transportTruncated: true } : {}) };
  });
}

export const buildReportTool: ToolDefinition = {
  name: 'build_report',
  description:
    "Valide un ReportSpec JSON puis, s'il est valide, calcule ses blocs (texte, KPI, graphiques, tableaux) contre un fichier CSV. Ne génère aucun PDF (le rendu visuel reste côté app) : renvoie les données calculées, avec les blocs `table` plafonnés pour le transport.",
  inputSchema: {
    type: 'object',
    required: ['path', 'reportSpec'],
    properties: {
      path: { type: 'string', description: 'Chemin du fichier CSV, relatif au répertoire de travail.' },
      reportSpec: { type: 'object', description: 'Document ReportSpec (voir README.md du dépôt pour le format complet).' },
      mapping: { type: 'object', description: "Mapping nom attendu -> nom réel ; par défaut identité (les noms de reportSpec.expectedColumns doivent alors exister tels quels dans le fichier)." },
      sampleRowsPerTableBlock: { type: 'number', description: 'Plafond de lignes renvoyées par bloc table (défaut 30, plafond 200).' },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const path = requireString(input, 'path');
    const cap = clampSampleCap(optionalNumber(input, 'sampleRowsPerTableBlock'));

    const validated = validateReportSpec(input.reportSpec);
    if (!validated.ok) {
      return { valid: false, errors: validated.errors };
    }

    const absPath = resolveInWorkdir(ctx.workdir, path);
    const table = loadTableFromCsvFile(absPath);

    let mapping: ColumnMapping;
    if (input.mapping !== undefined) {
      const mappingObj = asRecord(input.mapping, '"mapping"');
      mapping = {};
      for (const [expected, actual] of Object.entries(mappingObj)) {
        if (actual !== null && typeof actual !== 'string') {
          throw new ToolInputError(`mapping["${expected}"] doit être une chaîne ou null.`);
        }
        mapping[expected] = actual;
      }
    } else {
      const actualNames = new Set(table.columns.map((c) => c.name));
      mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, actualNames.has(n) ? n : null]));
    }

    const missing = Object.entries(mapping).filter(([, v]) => v === null).map(([k]) => k);
    if (missing.length > 0) {
      throw new ToolInputError(`Colonne(s) attendue(s) par le ReportSpec non résolue(s) : ${missing.join(', ')}.`);
    }

    const computed = computeReport(validated.spec, table, mapping);

    return {
      valid: true,
      path,
      title: computed.title,
      subtitle: computed.subtitle,
      blocks: boundBlocksForTransport(computed.blocks, cap),
    };
  },
};
