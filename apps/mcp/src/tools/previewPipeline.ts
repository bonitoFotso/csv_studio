import { loadTableFromCsvFile } from '../csvIo.ts';
import { resolveInWorkdir } from '../workdir.ts';
import { clampSampleCap } from '../bounded.ts';
import { boundRecords } from '../records.ts';
import { asRecord, optionalNumber, requireArray, requireString, requireStringArray } from '../validate.ts';
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

export const previewPipelineTool: ToolDefinition = {
  name: 'preview_pipeline',
  description:
    "Applique un pipeline JSON (même format qu'une Recipe : expectedColumns + steps, colonnes référencées par nom) à un fichier CSV et renvoie un résumé par étape plus un échantillon plafonné du résultat — n'écrit jamais rien sur le disque. Ne supporte pas les étapes à second fichier (enrich_join, append_rows) ; utiliser match_files pour le rapprochement.",
  inputSchema: {
    type: 'object',
    required: ['path', 'pipeline'],
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
      sampleRows: { type: 'number', description: 'Nombre de lignes d\'exemple du résultat à renvoyer (défaut 30, plafond 200).' },
    },
  },
  handler(args, ctx: ToolContext) {
    const input = asRecord(args);
    const path = requireString(input, 'path');
    const pipeline = parsePipelineInput(input.pipeline);
    const cap = clampSampleCap(optionalNumber(input, 'sampleRows'));

    const absPath = resolveInWorkdir(ctx.workdir, path);
    const sourceTable = loadTableFromCsvFile(absPath);
    const { resultTable, reports } = runPipeline(sourceTable, pipeline);

    return {
      path,
      rowsIn: sourceTable.rows.length,
      rowsOut: resultTable.rows.length,
      columns: resultTable.columns.map((c) => c.name),
      steps: reports.map((r) => ({
        index: r.index,
        type: r.type,
        label: r.label,
        enabled: r.enabled,
        rowsIn: r.report?.rowsIn,
        rowsOut: r.report?.rowsOut,
        rowsRemoved: r.report?.rowsRemoved,
        rowsAdded: r.report?.rowsAdded,
        rowsModified: r.report?.rowsModified,
        notes: r.report?.notes ?? [],
      })),
      sample: boundRecords(resultTable, resultTable.rows, cap),
    };
  },
};
