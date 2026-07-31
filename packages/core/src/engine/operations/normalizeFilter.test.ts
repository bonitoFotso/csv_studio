import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { NormalizeColumnsParams } from './normalizeColumns.ts';
import type { FilterRowsParams } from './filterRows.ts';

beforeAll(() => registerAllOperations());

describe('normalize_columns', () => {
  it('mode overwrite modifie la colonne en place et compte les lignes modifiées', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: '  Fotso  ' }, { nom: 'KAMGA' }, { nom: 'déjà propre' }]);
    const def = getOperationDefinition('normalize_columns');
    const params: NormalizeColumnsParams = {
      columnIds: [getColumnId(table, 'nom')],
      steps: ['trim', 'upper'],
      mode: 'overwrite',
    };
    const { table: out, report } = def.apply(table, params, {} as any);
    const col = getColumnId(out, 'nom');
    expect(out.rows.map((r) => r.cells[col])).toEqual(['FOTSO', 'KAMGA', 'DÉJÀ PROPRE']);
    expect(report.rowsModified).toBe(2);
  });

  it('mode new_column laisse l\'original intact et crée une colonne technique', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: '  Fotso  ' }]);
    const def = getOperationDefinition('normalize_columns');
    const params: NormalizeColumnsParams = {
      columnIds: [getColumnId(table, 'nom')],
      steps: ['trim', 'upper'],
      mode: 'new_column',
    };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows[0].cells[getColumnId(table, 'nom')]).toBe('  Fotso  ');
    const newCol = out.columns.find((c) => c.name === 'nom (normalisé)')!;
    expect(out.rows[0].cells[newCol.id]).toBe('FOTSO');
  });
});

describe('filter_rows', () => {
  function table() {
    return createTableFromRows('t', ['nom', 'note'], [
      { nom: 'Fotso', note: '15' },
      { nom: 'Kamga', note: '8' },
      { nom: 'Ngo', note: '' },
    ]);
  }

  it('keep ne garde que les lignes qui matchent', () => {
    const t = table();
    const def = getOperationDefinition('filter_rows');
    const params: FilterRowsParams = {
      root: { kind: 'group', operator: 'and', conditions: [{ kind: 'condition', columnId: getColumnId(t, 'note'), operator: 'is_not_empty' }] },
      action: 'keep',
    };
    const { table: out, report } = def.apply(t, params, {} as any);
    expect(out.rows.map((r) => r.cells[getColumnId(t, 'nom')])).toEqual(['Fotso', 'Kamga']);
    expect(report.rowsRemoved).toBe(1);
  });

  it('delete retire les lignes qui matchent et garde le reste', () => {
    const t = table();
    const def = getOperationDefinition('filter_rows');
    const params: FilterRowsParams = {
      root: { kind: 'group', operator: 'and', conditions: [{ kind: 'condition', columnId: getColumnId(t, 'note'), operator: 'is_empty' }] },
      action: 'delete',
    };
    const { table: out } = def.apply(t, params, {} as any);
    expect(out.rows.map((r) => r.cells[getColumnId(t, 'nom')])).toEqual(['Fotso', 'Kamga']);
  });

  it('extract_to_new_table ne modifie pas la table courante', () => {
    const t = table();
    const def = getOperationDefinition('filter_rows');
    const params: FilterRowsParams = {
      root: { kind: 'group', operator: 'and', conditions: [] },
      action: 'extract_to_new_table',
      newTableName: 'extrait',
    };
    const { table: out, report } = def.apply(t, params, {} as any);
    expect(out.rows.length).toBe(3);
    expect(report.rowsRemoved).toBe(0);
  });
});
