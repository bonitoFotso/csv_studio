import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { AddExtractColumnParams } from './addExtractColumn.ts';
import type { AddExpressionColumnParams } from './addExpressionColumn.ts';

beforeAll(() => registerAllOperations());

function sampleTable() {
  return createTableFromRows('candidats', ['nom', 'prenom', 'naissance'], [
    { nom: 'Fotso', prenom: 'Bonito', naissance: '15/03/1998' },
    { nom: 'Kamga', prenom: 'Alice', naissance: '02/11/2000' },
  ]);
}

describe('rename_columns', () => {
  it('renomme sans toucher aux données', () => {
    const table = sampleTable();
    const def = getOperationDefinition('rename_columns');
    const colId = getColumnId(table, 'nom');
    const { table: out, report } = def.apply(table, { renames: [{ columnId: colId, newName: 'Nom de famille' }] }, {} as any);
    expect(out.columns.find((c) => c.id === colId)?.name).toBe('Nom de famille');
    expect(report.rowsIn).toBe(2);
    expect(report.rowsOut).toBe(2);
  });
});

describe('reorder_columns', () => {
  it('place les colonnes citées en premier, dans l\'ordre donné', () => {
    const table = sampleTable();
    const def = getOperationDefinition('reorder_columns');
    const { table: out } = def.apply(table, { order: [getColumnId(table, 'prenom'), getColumnId(table, 'nom')] }, {} as any);
    expect(out.columns.map((c) => c.name)).toEqual(['prenom', 'nom', 'naissance']);
  });
});

describe('drop_columns', () => {
  it('supprime la colonne des en-têtes et des lignes', () => {
    const table = sampleTable();
    const def = getOperationDefinition('drop_columns');
    const naissanceId = getColumnId(table, 'naissance');
    const { table: out, report } = def.apply(table, { columnIds: [naissanceId] }, {} as any);
    expect(out.columns.map((c) => c.name)).toEqual(['nom', 'prenom']);
    expect(out.rows.every((r) => !(naissanceId in r.cells))).toBe(true);
    expect(report.rowsOut).toBe(2);
  });
});

describe('hide_columns', () => {
  it('marque hidden sans supprimer', () => {
    const table = sampleTable();
    const def = getOperationDefinition('hide_columns');
    const id = getColumnId(table, 'naissance');
    const { table: out } = def.apply(table, { columnIds: [id], hidden: true }, {} as any);
    expect(out.columns.find((c) => c.id === id)?.hidden).toBe(true);
    expect(out.rows[0].cells[id]).toBe('15/03/1998');
  });
});

describe('duplicate_column', () => {
  it('copie toutes les valeurs dans une nouvelle colonne', () => {
    const table = sampleTable();
    const def = getOperationDefinition('duplicate_column');
    const nomId = getColumnId(table, 'nom');
    const { table: out } = def.apply(table, { columnId: nomId, newName: 'nom (copie)' }, {} as any);
    const copyCol = out.columns.find((c) => c.name === 'nom (copie)')!;
    expect(out.rows.map((r) => r.cells[copyCol.id])).toEqual(['Fotso', 'Kamga']);
  });
});

describe('add_constant_column', () => {
  it('ajoute la même valeur à toutes les lignes', () => {
    const table = sampleTable();
    const def = getOperationDefinition('add_constant_column');
    const { table: out } = def.apply(table, { name: 'session', value: '2026-S2' }, {} as any);
    const col = out.columns.find((c) => c.name === 'session')!;
    expect(out.rows.every((r) => r.cells[col.id] === '2026-S2')).toBe(true);
  });
});

describe('add_concat_column', () => {
  it('concatène avec le séparateur donné', () => {
    const table = sampleTable();
    const def = getOperationDefinition('add_concat_column');
    const { table: out } = def.apply(
      table,
      { name: 'full', columnIds: [getColumnId(table, 'prenom'), getColumnId(table, 'nom')], separator: ' ' },
      {} as any,
    );
    const col = out.columns.find((c) => c.name === 'full')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['Bonito Fotso', 'Alice Kamga']);
  });
});

describe('add_extract_column', () => {
  it('extrait l\'année depuis une date jj/mm/aaaa', () => {
    const table = sampleTable();
    const def = getOperationDefinition('add_extract_column');
    const params: AddExtractColumnParams = { name: 'annee', sourceColumnId: getColumnId(table, 'naissance'), mode: 'year' };
    const { table: out } = def.apply(table, params, {} as any);
    const col = out.columns.find((c) => c.name === 'annee')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['1998', '2000']);
  });

  it('extrait les N premiers caractères', () => {
    const table = sampleTable();
    const def = getOperationDefinition('add_extract_column');
    const params: AddExtractColumnParams = { name: 'init', sourceColumnId: getColumnId(table, 'nom'), mode: 'first_n', arg: '3' };
    const { table: out } = def.apply(table, params, {} as any);
    const col = out.columns.find((c) => c.name === 'init')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['Fot', 'Kam']);
  });
});

describe('add_sequence_column', () => {
  it('numérote séquentiellement à partir de start avec le pas donné', () => {
    const table = sampleTable();
    const def = getOperationDefinition('add_sequence_column');
    const counters = new Map<string, number>();
    const ctx = {
      sequenceCounter(seed: string, start: number, step: number) {
        const current = counters.get(seed) ?? start;
        counters.set(seed, current + step);
        return current;
      },
    } as any;
    const { table: out } = def.apply(table, { name: 'seq', start: 1, step: 1 }, ctx);
    const col = out.columns.find((c) => c.name === 'seq')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['1', '2']);
  });
});

describe('add_expression_column', () => {
  it('additionne deux colonnes numériques', () => {
    const table = createTableFromRows('t', ['a', 'b'], [{ a: '2', b: '3' }, { a: '10', b: '5' }]);
    const def = getOperationDefinition('add_expression_column');
    const params: AddExpressionColumnParams = {
      name: 'total',
      expression: { kind: 'binary', op: '+', left: { kind: 'column', columnId: getColumnId(table, 'a') }, right: { kind: 'column', columnId: getColumnId(table, 'b') } },
    };
    const { table: out } = def.apply(table, params, {} as any);
    const col = out.columns.find((c) => c.name === 'total')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['5', '15']);
  });

  it('retombe sur la concaténation string quand ce n\'est pas numérique', () => {
    const table = createTableFromRows('t', ['a', 'b'], [{ a: 'Bon', b: 'ito' }]);
    const def = getOperationDefinition('add_expression_column');
    const params: AddExpressionColumnParams = {
      name: 'full',
      expression: { kind: 'binary', op: '+', left: { kind: 'column', columnId: getColumnId(table, 'a') }, right: { kind: 'column', columnId: getColumnId(table, 'b') } },
    };
    const { table: out } = def.apply(table, params, {} as any);
    const col = out.columns.find((c) => c.name === 'full')!;
    expect(out.rows[0].cells[col.id]).toBe('Bonito');
  });
});
