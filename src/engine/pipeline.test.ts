import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './operations/index.ts';
import { createTableFromRows, getColumnId } from './table.ts';
import { addStep, canRedo, canUndo, createOperation, createPipeline, redo, removeStep, undo } from './pipeline.ts';
import { replay } from './replay.ts';
import type { DropColumnsParams } from './operations/dropColumns.ts';
import type { RenameColumnsParams } from './operations/renameColumns.ts';

beforeAll(() => registerAllOperations());

function baseTable() {
  return createTableFromRows('t', ['nom', 'note'], [{ nom: 'Fotso', note: '15' }]);
}

describe('undo/redo', () => {
  it('undo puis redo restaure exactement le même état', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));
    expect(canUndo(pipeline)).toBe(true);
    expect(canRedo(pipeline)).toBe(false);

    pipeline = undo(pipeline);
    expect(canUndo(pipeline)).toBe(false);
    expect(canRedo(pipeline)).toBe(true);
    expect(replay(table, pipeline.steps, pipeline.cursor).table.columns.map((c) => c.name)).toEqual(['nom', 'note']);

    pipeline = redo(pipeline);
    expect(replay(table, pipeline.steps, pipeline.cursor).table.columns.map((c) => c.name)).toEqual(['nom']);
  });

  it('ajouter une étape après un undo tronque le "redo" restant (pas de branchement)', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] }));
    pipeline = undo(pipeline);
    expect(canRedo(pipeline)).toBe(true);

    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'nom'), newName: 'Nom' }] }));
    expect(pipeline.steps.length).toBe(1);
    expect(canRedo(pipeline)).toBe(false);
    expect(replay(table, pipeline.steps, pipeline.cursor).table.columns.map((c) => c.name)).toEqual(['Nom', 'note']);
  });
});

describe('édition en place du pipeline', () => {
  it('supprimer une étape du milieu recalcule le reste sans elle', () => {
    const table = baseTable();
    let pipeline = createPipeline(table.id);
    const dropStep = createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'note')] });
    pipeline = addStep(pipeline, dropStep);
    pipeline = addStep(pipeline, createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: getColumnId(table, 'nom'), newName: 'Nom' }] }));

    pipeline = removeStep(pipeline, dropStep.id);
    expect(pipeline.steps.length).toBe(1);
    expect(pipeline.cursor).toBe(1);
    expect(replay(table, pipeline.steps, pipeline.cursor).table.columns.map((c) => c.name)).toEqual(['Nom', 'note']);
  });
});
