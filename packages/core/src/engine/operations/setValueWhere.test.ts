import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { SetValueWhereParams } from './setValueWhere.ts';

beforeAll(() => registerAllOperations());

function table() {
  return createTableFromRows('candidats', ['nom', 'note'], [
    { nom: 'Fotso', note: '15' },
    { nom: 'Kamga', note: '8' },
    { nom: 'Ngo', note: '12' },
  ]);
}

const passFilter = (t: ReturnType<typeof table>) => ({
  kind: 'group' as const,
  operator: 'and' as const,
  conditions: [{ kind: 'condition' as const, columnId: getColumnId(t, 'note'), operator: 'between' as const, min: '10', max: '20' }],
});

describe('set_value_where', () => {
  it('nouvelle colonne, valeur match seulement : les non-match reçoivent ""', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const params: SetValueWhereParams = { root: passFilter(t), target: { kind: 'new', name: 'statut' }, matchValue: 'admis' };
    const { table: out, report } = def.apply(t, params, {} as any);
    const col = out.columns.find((c) => c.name === 'statut')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['admis', '', 'admis']);
    expect(report.rowsModified).toBe(2);
  });

  it('nouvelle colonne, les deux valeurs à la fois', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const params: SetValueWhereParams = {
      root: passFilter(t),
      target: { kind: 'new', name: 'statut' },
      matchValue: 'admis',
      nonMatchValue: 'recalé',
    };
    const { table: out } = def.apply(t, params, {} as any);
    const col = out.columns.find((c) => c.name === 'statut')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['admis', 'recalé', 'admis']);
  });

  it('colonne existante, valeur non-match seulement : les lignes qui matchent restent inchangées', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const nomId = getColumnId(t, 'nom');
    const params: SetValueWhereParams = { root: passFilter(t), target: { kind: 'existing', columnId: nomId }, nonMatchValue: 'ANONYME' };
    const { table: out, report } = def.apply(t, params, {} as any);
    expect(out.rows.map((r) => r.cells[nomId])).toEqual(['Fotso', 'ANONYME', 'Ngo']);
    expect(report.rowsModified).toBe(1);
  });

  it('colonne existante, ni match ni non-match déjà à la valeur cible : rowsModified ne compte pas les no-ops', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const noteId = getColumnId(t, 'note');
    const params: SetValueWhereParams = { root: passFilter(t), target: { kind: 'existing', columnId: noteId }, matchValue: '15' };
    const { report } = def.apply(t, params, {} as any);
    // seule la ligne "Ngo" (note '12', match) change réellement vers '15' ; "Fotso" (note '15', match) est déjà à '15'.
    expect(report.rowsModified).toBe(1);
  });

  it('round-trip toPortable puis rebind reconstruit des params équivalents (colonne existante)', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const nomId = getColumnId(t, 'nom');
    const original: SetValueWhereParams = { root: passFilter(t), target: { kind: 'existing', columnId: nomId }, matchValue: 'x' };
    const portable = def.toPortable(original, t, {} as any);
    const nameToId: Record<string, string> = { note: getColumnId(t, 'note'), nom: nomId };
    const rebound = def.rebind(portable.params, nameToId);
    expect(rebound).toEqual(original);
  });

  it('round-trip toPortable puis rebind reconstruit des params équivalents (nouvelle colonne)', () => {
    const t = table();
    const def = getOperationDefinition('set_value_where');
    const original: SetValueWhereParams = {
      root: passFilter(t),
      target: { kind: 'new', name: 'statut' },
      matchValue: 'admis',
      nonMatchValue: 'recalé',
    };
    const portable = def.toPortable(original, t, {} as any);
    const nameToId: Record<string, string> = { note: getColumnId(t, 'note') };
    const rebound = def.rebind(portable.params, nameToId);
    expect(rebound).toEqual(original);
  });
});
