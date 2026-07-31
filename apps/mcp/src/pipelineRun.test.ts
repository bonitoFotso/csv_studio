import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';
import { runPipeline } from './pipelineRun.ts';

beforeAll(() => {
  registerAllOperations();
});

function sampleTable() {
  return createTableFromRows('t', ['nom', 'ville'], [
    { nom: 'Alice', ville: 'Paris' },
    { nom: '  alice  ', ville: 'paris' },
    { nom: 'Bob', ville: 'Lyon' },
  ]);
}

describe('runPipeline', () => {
  it('applique une étape simple (rename_columns) référencée par nom', () => {
    const table = sampleTable();
    const { resultTable, reports } = runPipeline(table, {
      expectedColumns: ['nom'],
      steps: [{ type: 'rename_columns', params: { renames: [{ name: 'nom', newName: 'prenom' }] } }],
    });
    expect(resultTable.columns.map((c) => c.name)).toContain('prenom');
    expect(reports).toHaveLength(1);
    expect(reports[0].type).toBe('rename_columns');
  });

  it('applique deux étapes en chaîne (normalize puis deduplicate)', () => {
    const table = sampleTable();
    const { resultTable } = runPipeline(table, {
      expectedColumns: ['nom', 'ville'],
      steps: [
        { type: 'normalize_columns', params: { columnNames: ['nom', 'ville'], steps: ['trim', 'lower'], mode: 'overwrite' } },
        { type: 'deduplicate', params: { keyColumnNames: ['nom', 'ville'], mode: 'exact', action: 'keep_first' } },
      ],
    });
    expect(resultTable.rows).toHaveLength(2); // Alice/alice fusionnés après normalisation, Bob distinct
  });

  it('lève une erreur listant les colonnes attendues introuvables', () => {
    const table = sampleTable();
    expect(() =>
      runPipeline(table, { expectedColumns: ['nom', 'pays'], steps: [] }),
    ).toThrow(/pays/);
  });

  it("lève une erreur explicite pour une étape à second fichier (non supportée par ce tour)", () => {
    const table = sampleTable();
    expect(() =>
      runPipeline(table, {
        expectedColumns: ['nom'],
        steps: [{ type: 'enrich_join', params: {} }],
      }),
    ).toThrow(/[Ss]econdaire/);
  });

  it('une étape désactivée (enabled: false) ne modifie pas le résultat', () => {
    const table = sampleTable();
    const { resultTable } = runPipeline(table, {
      expectedColumns: ['nom'],
      steps: [{ type: 'rename_columns', enabled: false, params: { renames: [{ name: 'nom', newName: 'prenom' }] } }],
    });
    expect(resultTable.columns.map((c) => c.name)).toContain('nom');
    expect(resultTable.columns.map((c) => c.name)).not.toContain('prenom');
  });
});
