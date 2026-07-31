import { loadTableFromCsvFile, writeTableToCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { boundRecords } from '../records.ts';
import { asRecord, optionalBoolean, optionalNumber, requireArray, requireString, requireStringArray } from '../validate.ts';
import { runPipeline, type PipelineInput } from '../pipelineRun.ts';
import type { ToolContext, ToolDefinition } from './types.ts';

function parsePipelineInput(raw: unknown): PipelineInput {
  const obj = asRecord(raw, '"pipeline"');
  const expectedColumns = requireStringArray(obj, 'expectedColumns');
  const stepsRaw = requireArray(obj, 'steps');
  const steps = stepsRaw.map((s, i) => {
    const stepObj = asRecord(s, `pipeline.steps[${i}]`);
    return {
      type: requireString(stepObj, 'type') as PipelineInput['steps'][number]['type'],
      label: typeof stepObj.label === 'string' ? stepObj.label : undefined,
      enabled: typeof stepObj.enabled === 'boolean' ? stepObj.enabled : undefined,
      params: stepObj.params,
    };
  });
  return { expectedColumns, steps };
}

export const applyPipelineTool: ToolDefinition = {
  name: 'apply_pipeline',
  description:
    "Applique un pipeline JSON (même format que preview_pipeline) à un fichier CSV et écrit le résultat complet dans un fichier de sortie du répertoire de travail. N'écrase jamais un fichier existant sans overwrite: true. Renvoie un résumé borné, jamais la table entière — relire le fichier de sortie pour le contenu complet.",
  inputSchema: {
    type: 'object',
    required: ['path', 'pipeline', 'outputPath'],
    properties: {
      path: { type: 'string', description: 'Chemin du fichier CSV source, relatif au répertoire de travail.' },
      pipeline: {
        type: 'object',
        required: ['expectedColumns', 'steps'],
        properties: {
          expectedColumns: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'object' } },
        },
      },
      outputPath: { type: 'string', description: 'Chemin du fichier CSV de sortie, relatif au répertoire de travail.' },
      overwrite: { type: 'boolean', description: 'Écrase un fichier de sortie déjà existant (défaut false).' },
      sampleRows: { type: 'number', description: "Nombre de lignes d'exemple du résultat à renvoyer dans la réponse (défaut 30, plafond 200) — le fichier écrit, lui, contient toujours toutes les lignes." },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const path = requireString(input, 'path');
    const pipeline = parsePipelineInput(input.pipeline);
    const outputPath = requireString(input, 'outputPath');
    const overwrite = optionalBoolean(input, 'overwrite', false);
    const cap = clampSampleCap(optionalNumber(input, 'sampleRows'));

    const absSourcePath = resolveInWorkdir(ctx.workdir, path);
    const absOutputPath = resolveInWorkdir(ctx.workdir, outputPath);
    const sourceTable = loadTableFromCsvFile(absSourcePath);
    const { resultTable, reports } = runPipeline(sourceTable, pipeline);

    writeTableToCsvFile(resultTable, absOutputPath, { overwrite });

    return {
      path,
      outputPath,
      rowsIn: sourceTable.rows.length,
      rowsWritten: resultTable.rows.length,
      columns: resultTable.columns.map((c) => c.name),
      steps: reports.map((r) => ({
        index: r.index,
        type: r.type,
        label: r.label,
        enabled: r.enabled,
        rowsIn: r.report?.rowsIn,
        rowsOut: r.report?.rowsOut,
        notes: r.report?.notes ?? [],
      })),
      sample: boundRecords(resultTable, resultTable.rows, cap),
    };
  },
};
