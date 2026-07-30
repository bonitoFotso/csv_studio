import { createId } from './ids.ts';
import { levenshteinSimilarity } from './fuzzy.ts';
import { getOperationDefinition } from './registry.ts';
import { computeStepTableStates, createApplyContext } from './replay.ts';
import { createOperation, createPipeline, addStep } from './pipeline.ts';
import type { ColumnMapping, Pipeline, Recipe, RebindContext, Table } from './types.ts';

/** Exporte le pipeline (toutes les étapes, indépendamment du curseur) en Recipe portable, sans données. */
export function buildRecipe(name: string, sourceTable: Table, pipeline: Pipeline, auxiliaryTables: Table[] = []): Recipe {
  const states = computeStepTableStates(sourceTable, pipeline.steps, { auxiliaryTables });
  const ctx = createApplyContext({ auxiliaryTables });
  const expectedColumns = new Set<string>();

  const steps = pipeline.steps.map((step, i) => {
    const def = getOperationDefinition(step.operation.type);
    const { params, columnNames, secondary } = def.toPortable(step.operation.params, states[i], ctx);
    for (const n of columnNames) expectedColumns.add(n);
    return {
      type: step.operation.type,
      label: step.operation.label,
      enabled: step.operation.enabled,
      params,
      secondary: secondary ? { tableName: secondary.tableName, expectedColumns: secondary.columnNames } : undefined,
    };
  });

  return {
    id: createId(),
    name,
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    expectedColumns: [...expectedColumns],
    steps,
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Pré-remplit un mapping nom attendu -> nom réel par similarité, pour l'écran de remappage.
 * Ne fait AUCUNE hypothèse silencieuse : c'est une suggestion, l'utilisateur doit la confirmer
 * (ou la corriger) avant que `instantiateRecipe` puisse s'exécuter.
 */
export function suggestColumnMapping(expectedColumns: string[], actualColumnNames: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const expected of expectedColumns) {
    if (actualColumnNames.includes(expected)) {
      mapping[expected] = expected;
      continue;
    }
    let best: { name: string; score: number } | null = null;
    for (const actual of actualColumnNames) {
      const score = levenshteinSimilarity(normalizeName(expected), normalizeName(actual));
      if (!best || score > best.score) best = { name: actual, score };
    }
    mapping[expected] = best && best.score >= 0.6 ? best.name : null;
  }
  return mapping;
}

export function mappingIsComplete(mapping: ColumnMapping): boolean {
  return Object.values(mapping).every((v) => v !== null);
}

/** Exportée : réutilisée par `reportSpecCompute.ts` pour résoudre `expectedColumns` -> `ColumnId` — même mécanisme qu'une Recipe. */
export function buildNameToId(table: Table, mapping: ColumnMapping): Record<string, string> {
  const nameToId: Record<string, string> = {};
  for (const [expected, actual] of Object.entries(mapping)) {
    if (actual === null) continue;
    const col = table.columns.find((c) => c.name === actual);
    if (col) nameToId[expected] = col.id;
  }
  return nameToId;
}

export interface SecondaryInput {
  table: Table;
  mapping: ColumnMapping;
}

/**
 * Reconstruit un Pipeline exécutable sur `sourceTable` à partir d'une Recipe et d'un mapping
 * nom attendu -> nom réel confirmé par l'utilisateur. Lève une erreur explicite si une étape
 * référence une colonne non résolue par le mapping (jamais de devinette silencieuse).
 *
 * `secondaryInputs` fournit, pour chaque étape qui référence un second fichier (enrich_join),
 * la table fraîchement importée + son propre mapping de remappage, indexés par l'index de l'étape
 * dans `recipe.steps`.
 */
export function instantiateRecipe(
  recipe: Recipe,
  sourceTable: Table,
  mapping: ColumnMapping,
  secondaryInputs: Record<number, SecondaryInput> = {},
): { pipeline: Pipeline; auxiliaryTables: Table[] } {
  const nameToId = buildNameToId(sourceTable, mapping);
  const auxiliaryTables: Table[] = [];

  let pipeline = createPipeline(sourceTable.id);
  recipe.steps.forEach((recipeStep, i) => {
    const def = getOperationDefinition(recipeStep.type);

    let rebindCtx: RebindContext | undefined;
    if (recipeStep.secondary) {
      const input = secondaryInputs[i];
      if (!input) throw new Error(`Fichier secondaire manquant pour l'étape ${i + 1} (${recipeStep.secondary.tableName}).`);
      rebindCtx = { secondaryTable: input.table, secondaryNameToId: buildNameToId(input.table, input.mapping) };
      auxiliaryTables.push(input.table);
    }

    const params = def.rebind(recipeStep.params, nameToId, rebindCtx);
    const operation = createOperation(recipeStep.type, params, recipeStep.label);
    operation.enabled = recipeStep.enabled;
    pipeline = addStep(pipeline, operation);
  });

  return { pipeline, auxiliaryTables };
}
