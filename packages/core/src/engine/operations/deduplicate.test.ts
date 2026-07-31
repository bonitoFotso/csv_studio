import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { DeduplicateParams } from './deduplicate.ts';

beforeAll(() => registerAllOperations());

function sampleTable() {
  return createTableFromRows(
    't',
    ['nom', 'tel'],
    [
      { nom: 'Fotso', tel: '' },
      { nom: 'Fotso', tel: '699000000' },
      { nom: 'Kamga', tel: '677000000' },
    ],
  );
}

describe('deduplicate', () => {
  it('keep_first garde la première occurrence de chaque groupe', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const params: DeduplicateParams = { keyColumnIds: [getColumnId(table, 'nom')], mode: 'exact', action: 'keep_first' };
    const { table: out, report } = def.apply(table, params, {} as any);
    expect(out.rows.map((r) => r.cells[getColumnId(table, 'tel')])).toEqual(['', '677000000']);
    expect(report.rowsRemoved).toBe(1);
  });

  it('keep_most_complete garde la ligne la plus remplie du groupe', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const params: DeduplicateParams = { keyColumnIds: [getColumnId(table, 'nom')], mode: 'exact', action: 'keep_most_complete' };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows.map((r) => r.cells[getColumnId(table, 'tel')])).toEqual(['699000000', '677000000']);
  });

  it('merge_first_nonempty fusionne le groupe en une ligne', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const params: DeduplicateParams = { keyColumnIds: [getColumnId(table, 'nom')], mode: 'exact', action: 'merge_first_nonempty' };
    const { table: out, report } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map((r) => r.cells[getColumnId(table, 'tel')])).toEqual(['699000000', '677000000']);
    expect(report.rowsModified).toBe(1);
  });

  it('flag_only ne supprime rien et ajoute une colonne _doublon', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const params: DeduplicateParams = { keyColumnIds: [getColumnId(table, 'nom')], mode: 'exact', action: 'flag_only' };
    const { table: out, report } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(3);
    expect(report.rowsRemoved).toBe(0);
    const flagCol = out.columns.find((c) => c.name === '_doublon')!;
    expect(out.rows.map((r) => r.cells[flagCol.id])).toEqual(['oui', 'oui', '']);
  });

  it('un override par groupe prime sur l\'action par défaut', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const groups = table.rows.filter((r) => r.cells[getColumnId(table, 'nom')] === 'Fotso');
    const groupKey = 'Fotso';
    const params: DeduplicateParams = {
      keyColumnIds: [getColumnId(table, 'nom')],
      mode: 'exact',
      action: 'keep_first',
      groupOverrides: [{ groupKey, action: 'keep_last' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const kept = out.rows.find((r) => r.cells[getColumnId(table, 'nom')] === 'Fotso');
    expect(kept?.cells[getColumnId(table, 'tel')]).toBe('699000000');
    expect(groups).toHaveLength(2);
  });

  it('recette rejouable : le mapping nom -> id fonctionne après rebind', () => {
    const table = sampleTable();
    const def = getOperationDefinition('deduplicate');
    const params: DeduplicateParams = { keyColumnIds: [getColumnId(table, 'nom')], mode: 'normalized', action: 'keep_first' };
    const { params: portable } = def.toPortable(params, table, {} as any);
    const rebuilt = def.rebind(portable, { nom: getColumnId(table, 'nom'), tel: getColumnId(table, 'tel') });
    expect(rebuilt).toEqual(params);
  });
});
