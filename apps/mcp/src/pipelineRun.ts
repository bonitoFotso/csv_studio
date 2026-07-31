import { instantiateRecipe } from '@csv-studio/core/engine/recipe.ts';
import { replay } from '@csv-studio/core/engine/replay.ts';
import type { ColumnMapping, OperationReport, OperationType, Table } from '@csv-studio/core/engine/types.ts';

export interface PipelineStepInput {
  type: OperationType;
  label?: string;
  enabled?: boolean;
  params: unknown;
}

export interface PipelineInput {
  expectedColumns: string[];
  steps: PipelineStepInput[];
}

export interface PipelineRunResult {
  resultTable: Table;
  reports: { index: number; type: OperationType; label?: string; enabled: boolean; report?: OperationReport }[];
}

/**
 * Résout `pipeline.expectedColumns` contre les colonnes réelles de `table`, par correspondance
 * exacte uniquement (jamais de suggestion floue non confirmée : ce tour est non interactif, aucun
 * écran de remappage n'existe pour qu'un humain valide une devinette).
 */
function resolveExactMapping(table: Table, expectedColumns: string[]): ColumnMapping {
  const actualNames = new Set(table.columns.map((c) => c.name));
  const mapping: ColumnMapping = {};
  const missing: string[] = [];
  for (const name of expectedColumns) {
    if (actualNames.has(name)) mapping[name] = name;
    else {
      mapping[name] = null;
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    const available = [...actualNames].join(', ');
    throw new Error(`Colonne(s) attendue(s) introuvable(s) dans le fichier : ${missing.join(', ')}. Colonnes disponibles : ${available}.`);
  }
  return mapping;
}

const SECONDARY_FILE_STEP_TYPES: OperationType[] = ['enrich_join', 'append_rows'];

/**
 * Instancie et rejoue un pipeline JSON (même vocabulaire qu'une Recipe, sans id/name/createdAt)
 * contre une table déjà chargée. Ne supporte pas les étapes à second fichier (enrich_join,
 * append_rows) : ce format de pipeline MCP n'a pas de champ `secondary` pour en fournir un, donc
 * on le refuse tôt avec un message explicite plutôt que de laisser `rebind` échouer sur des champs
 * manquants avec une erreur de bas niveau — c'est `match_files` qui couvre le rapprochement à deux
 * fichiers côté MCP.
 */
export function runPipeline(sourceTable: Table, pipeline: PipelineInput): PipelineRunResult {
  const secondaryStep = pipeline.steps.find((s) => SECONDARY_FILE_STEP_TYPES.includes(s.type));
  if (secondaryStep) {
    throw new Error(
      `L'étape "${secondaryStep.type}" nécessite un second fichier (secondaire) : non supportée par preview_pipeline/apply_pipeline. Utilise l'outil match_files pour le rapprochement entre deux fichiers.`,
    );
  }

  const mapping = resolveExactMapping(sourceTable, pipeline.expectedColumns);
  const recipe = {
    id: 'mcp-pipeline',
    name: 'mcp-pipeline',
    formatVersion: 1,
    createdAt: new Date(0).toISOString(),
    expectedColumns: pipeline.expectedColumns,
    steps: pipeline.steps.map((s) => ({ type: s.type, label: s.label, enabled: s.enabled ?? true, params: s.params })),
  };

  const { pipeline: instantiated } = instantiateRecipe(recipe, sourceTable, mapping);
  const { table: resultTable, reportsByIndex } = replay(sourceTable, instantiated.steps, instantiated.cursor);

  const reports = instantiated.steps.map((step, i) => ({
    index: i,
    type: step.operation.type,
    label: step.operation.label,
    enabled: step.operation.enabled,
    report: reportsByIndex.get(i),
  }));

  return { resultTable, reports };
}
