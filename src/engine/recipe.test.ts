import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './operations/index.ts';
import { createTableFromRows, getColumnId } from './table.ts';
import { addStep, createOperation, createPipeline } from './pipeline.ts';
import { buildRecipe, instantiateRecipe, mappingIsComplete, suggestColumnMapping } from './recipe.ts';
import { replay } from './replay.ts';
import type { NormalizeColumnsParams } from './operations/normalizeColumns.ts';
import type { RenameColumnsParams } from './operations/renameColumns.ts';
import type { DropColumnsParams } from './operations/dropColumns.ts';
import type { EnrichJoinParams } from './operations/enrichJoin.ts';

beforeAll(() => registerAllOperations());

function buildSamplePipeline() {
  const table = createTableFromRows('t', ['nom', 'prenom', 'note'], [{ nom: '  fotso  ', prenom: 'Bonito', note: '15' }]);
  let pipeline = createPipeline(table.id);
  pipeline = addStep(
    pipeline,
    createOperation<NormalizeColumnsParams>('normalize_columns', { columnIds: [getColumnId(table, 'nom')], steps: ['trim', 'upper'], mode: 'overwrite' }),
  );
  pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'note'), newName: 'Note finale' }] }));
  pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'prenom')] }));
  return { table, pipeline };
}

describe('Recipe', () => {
  it('buildRecipe liste les colonnes attendues par nom', () => {
    const { table, pipeline } = buildSamplePipeline();
    const recipe = buildRecipe('ma recette', table, pipeline);
    expect(new Set(recipe.expectedColumns)).toEqual(new Set(['nom', 'note', 'prenom']));
    expect(recipe.steps.map((s) => s.type)).toEqual(['normalize_columns', 'rename_columns', 'drop_columns']);
  });

  it('suggestColumnMapping pré-remplit par similarité de nom sans jamais imposer silencieusement', () => {
    const mapping = suggestColumnMapping(['nom', 'note', 'prenom'], ['Nom', 'note', 'Prenom']);
    expect(mapping.nom).toBe('Nom');
    expect(mapping.note).toBe('note');
    expect(mapping.prenom).toBe('Prenom');
  });

  it('une colonne sans correspondance plausible reste null (à confirmer par l\'utilisateur)', () => {
    const mapping = suggestColumnMapping(['nom'], ['numero_dossier']);
    expect(mapping.nom).toBeNull();
  });

  it('rejeu sur un fichier aux en-têtes différents, une fois le mapping confirmé', () => {
    const { table, pipeline } = buildSamplePipeline();
    const recipe = buildRecipe('ma recette', table, pipeline);

    const table2 = createTableFromRows('session-2', ['Nom', 'Prenom', 'note'], [{ Nom: '  kamga  ', Prenom: 'Alice', note: '8' }]);
    const mapping = suggestColumnMapping(recipe.expectedColumns, table2.columns.map((c) => c.name));
    expect(mappingIsComplete(mapping)).toBe(true);

    const { pipeline: pipeline2 } = instantiateRecipe(recipe, table2, mapping);
    const result = replay(table2, pipeline2.steps, pipeline2.cursor);

    expect(result.table.columns.map((c) => c.name)).toEqual(['Nom', 'Note finale']);
    const nomCol = result.table.columns.find((c) => c.name === 'Nom')!;
    expect(result.table.rows[0].cells[nomCol.id]).toBe('KAMGA');
  });

  it('refuse de s\'exécuter si une colonne référencée reste non mappée', () => {
    const { table, pipeline } = buildSamplePipeline();
    const recipe = buildRecipe('ma recette', table, pipeline);
    const table2 = createTableFromRows('session-3', ['nom', 'note'], [{ nom: 'x', note: '1' }]);
    const mapping = suggestColumnMapping(recipe.expectedColumns, table2.columns.map((c) => c.name));
    expect(mapping.prenom).toBeNull();

    expect(() => instantiateRecipe(recipe, table2, mapping)).toThrow(/non mappée/);
  });

  it('recette avec un rapprochement : remappage séparé du fichier de gauche et du second fichier', () => {
    const left = createTableFromRows('candidats', ['id', 'nom'], [{ id: '1', nom: 'Fotso' }]);
    const right = createTableFromRows('presence', ['ref', 'nb_presences'], [{ ref: '1', nb_presences: '12' }]);

    let pipeline = createPipeline(left.id);
    const joinParams: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    pipeline = addStep(pipeline, createOperation('enrich_join', joinParams));

    const recipe = buildRecipe('rapprochement présence', left, pipeline, [right]);
    expect(recipe.expectedColumns).toEqual(['id']);
    expect(recipe.steps[0].secondary).toEqual({ tableName: 'presence', expectedColumns: ['ref', 'nb_presences'] });

    // Septembre : nouveau fichier principal ET nouveau second fichier, en-têtes différents.
    const left2 = createTableFromRows('candidats-sept', ['identifiant'], [{ identifiant: '1' }]);
    const right2 = createTableFromRows('presence-sept', ['reference', 'nb_presences'], [{ reference: '1', nb_presences: '9' }]);

    const primaryMapping = suggestColumnMapping(recipe.expectedColumns, left2.columns.map((c) => c.name));
    // "identifiant" n'est pas assez proche de "id" pour être suggéré automatiquement : à confirmer manuellement.
    expect(primaryMapping.id).toBeNull();
    primaryMapping.id = 'identifiant';

    const secondaryMapping = suggestColumnMapping(recipe.steps[0].secondary!.expectedColumns, right2.columns.map((c) => c.name));
    // "ref" -> "reference" n'est pas assez proche pour être suggéré automatiquement : à confirmer manuellement.
    expect(secondaryMapping.ref).toBeNull();
    secondaryMapping.ref = 'reference';
    expect(secondaryMapping.nb_presences).toBe('nb_presences');

    const { pipeline: pipeline2, auxiliaryTables } = instantiateRecipe(recipe, left2, primaryMapping, {
      0: { table: right2, mapping: secondaryMapping },
    });
    expect(auxiliaryTables).toEqual([right2]);

    const result = replay(left2, pipeline2.steps, pipeline2.cursor, { auxiliaryTables });
    const col = result.table.columns.find((c) => c.name === 'nb_presences')!;
    expect(result.table.rows[0].cells[col.id]).toBe('9');
  });

  it('recette avec rapprochement : refuse de s\'exécuter sans le second fichier fourni', () => {
    const left = createTableFromRows('candidats', ['id'], [{ id: '1' }]);
    const right = createTableFromRows('presence', ['ref', 'nb'], [{ ref: '1', nb: '1' }]);
    let pipeline = createPipeline(left.id);
    const joinParams: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb'), asName: 'nb' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    pipeline = addStep(pipeline, createOperation('enrich_join', joinParams));
    const recipe = buildRecipe('r', left, pipeline, [right]);

    const left2 = createTableFromRows('candidats2', ['id'], [{ id: '1' }]);
    expect(() => instantiateRecipe(recipe, left2, { id: 'id' })).toThrow(/[Ff]ichier secondaire/);
  });
});
