import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './operations/index.ts';
import { createTableFromRows, getColumnId } from './table.ts';
import { createOperation, createPipeline, addStep, updateStepParams, setStepEnabled } from './pipeline.ts';
import { replay } from './replay.ts';
import type { DropColumnsParams } from './operations/dropColumns.ts';
import type { RenameColumnsParams } from './operations/renameColumns.ts';

beforeAll(() => registerAllOperations());

function baseTable() {
  return createTableFromRows('t', ['nom', 'prenom', 'note'], [
    { nom: 'Fotso', prenom: 'Bonito', note: '15' },
    { nom: 'Kamga', prenom: 'Alice', note: '8' },
  ]);
}

describe('replay', () => {
  it('applique les steps dans l\'ordre jusqu\'au curseur', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'nom'), newName: 'Nom' }] }));
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));

    const result = replay(table, pipeline.steps, pipeline.cursor);
    expect(result.table.columns.map((c) => c.name)).toEqual(['Nom', 'prenom']);
    expect(result.reportsByIndex.size).toBe(2);
  });

  it('un curseur inférieur à steps.length ignore les étapes suivantes', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'nom'), newName: 'Nom' }] }));
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));

    const result = replay(table, pipeline.steps, 1);
    expect(result.table.columns.map((c) => c.name)).toEqual(['Nom', 'prenom', 'note']);
  });

  it('une étape désactivée est sautée sans casser les suivantes', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'nom'), newName: 'Nom' }] }));
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));
    pipeline = setStepEnabled(pipeline, pipeline.steps[0].operation.id, false);

    const result = replay(table, pipeline.steps, pipeline.cursor);
    expect(result.table.columns.map((c) => c.name)).toEqual(['nom', 'prenom']);
    expect(result.reportsByIndex.has(0)).toBe(false);
    expect(result.reportsByIndex.has(1)).toBe(true);
  });

  it('modifier les params d\'une étape du milieu recalcule tout ce qui suit', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));
    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'prenom'), newName: 'Prénom' }] }));

    const before = replay(table, pipeline.steps, pipeline.cursor);
    expect(before.table.columns.map((c) => c.name)).toEqual(['nom', 'Prénom']);

    // On change la 1ère étape pour supprimer 'prenom' au lieu de 'note'.
    pipeline = updateStepParams(pipeline, pipeline.steps[0].operation.id, { columnIds: [getColumnId(table, 'prenom')] } satisfies DropColumnsParams);
    const after = replay(table, pipeline.steps, pipeline.cursor);
    // La colonne renommée par l'étape 2 n'existe plus : rename_columns ignore silencieusement
    // les colonnes absentes (map par id), donc seule 'note' reste inchangée à côté de 'nom'.
    expect(after.table.columns.map((c) => c.name)).toEqual(['nom', 'note']);
  });
});
