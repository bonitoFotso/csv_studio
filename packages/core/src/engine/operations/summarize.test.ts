import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { AggregateSpec, GroupByColumn, SummarizeParams } from './summarize.ts';

beforeAll(() => registerAllOperations());

function cellsByGroupCol(table: { columns: { id: string; name: string }[]; rows: { cells: Record<string, string> }[] }, groupColName: string) {
  const col = table.columns.find((c) => c.name === groupColName)!;
  return table.rows.map((r) => r.cells[col.id]);
}

describe('summarize — group by simple', () => {
  it('regroupe par une colonne texte et compte les lignes', () => {
    const table = createTableFromRows(
      't',
      ['ville'],
      [{ ville: 'Douala' }, { ville: 'Yaoundé' }, { ville: 'Douala' }, { ville: 'Douala' }],
    );
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'ville'), normalization: 'none' }],
      aggregates: [{ fn: 'count', asName: 'effectif' }],
    };
    const { table: out, report } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(2);
    expect(cellsByGroupCol(out, 'ville')).toEqual(['Douala', 'Yaoundé']); // ordre de première apparition
    const effectifCol = out.columns.find((c) => c.name === 'effectif')!;
    expect(out.rows.map((r) => r.cells[effectifCol.id])).toEqual(['3', '1']);
    expect(report.rowsIn).toBe(4);
    expect(report.rowsOut).toBe(2);
  });

  it('mode "none" ne fusionne pas Douala et douala', () => {
    const table = createTableFromRows('t', ['ville'], [{ ville: 'Douala' }, { ville: 'douala' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'ville'), normalization: 'none' }],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(2);
  });

  it('mode "text" fusionne Douala et douala (casse/accents/espaces ignorés)', () => {
    const table = createTableFromRows('t', ['ville'], [{ ville: 'Douala' }, { ville: ' douala ' }, { ville: 'DOUALA' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'ville'), normalization: 'text' }],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(1);
    // La valeur affichée est celle de la première occurrence, jamais réécrite silencieusement.
    expect(cellsByGroupCol(out, 'ville')).toEqual(['Douala']);
    const nCol = out.columns.find((c) => c.name === 'n')!;
    expect(out.rows[0].cells[nCol.id]).toBe('3');
  });

  it('mode "date" fusionne des dates aux séparateurs différents', () => {
    const table = createTableFromRows('t', ['naissance'], [{ naissance: '19/07/1998' }, { naissance: '19-07-1998' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'naissance'), normalization: 'date' }],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(1);
  });

  it('clé composite sur plusieurs colonnes', () => {
    const table = createTableFromRows(
      't',
      ['ville', 'sexe'],
      [
        { ville: 'Douala', sexe: 'F' },
        { ville: 'Douala', sexe: 'M' },
        { ville: 'Douala', sexe: 'F' },
      ],
    );
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [
        { columnId: getColumnId(table, 'ville'), normalization: 'none' },
        { columnId: getColumnId(table, 'sexe'), normalization: 'none' },
      ],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    expect(out.rows).toHaveLength(2);
  });
});

describe('summarize — agrégats numériques et parsing tolérant', () => {
  function tableWithNotes(notes: string[]) {
    return createTableFromRows(
      't',
      ['groupe', 'note'],
      notes.map((n) => ({ groupe: 'A', note: n })),
    );
  }

  it("une moyenne ignore les valeurs vides, ne les compte jamais comme zéro", () => {
    const table = tableWithNotes(['10', '', '20']);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'groupe'), normalization: 'none' }],
      aggregates: [
        { fn: 'avg', columnId: getColumnId(table, 'note'), asName: 'moyenne' },
        { fn: 'countNonEmpty', columnId: getColumnId(table, 'note'), asName: 'n_valides' },
      ],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const moyenneCol = out.columns.find((c) => c.name === 'moyenne')!;
    const nCol = out.columns.find((c) => c.name === 'n_valides')!;
    // (10 + 20) / 2 = 15, PAS (10 + 0 + 20) / 3 = 10
    expect(out.rows[0].cells[moyenneCol.id]).toBe('15');
    expect(out.rows[0].cells[nCol.id]).toBe('2');
  });

  it('parse les nombres avec virgule décimale française et espaces de milliers', () => {
    const table = tableWithNotes(['1 234,5', '1 234,5', '2 000']);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'groupe'), normalization: 'none' }],
      aggregates: [{ fn: 'sum', columnId: getColumnId(table, 'note'), asName: 'total' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const totalCol = out.columns.find((c) => c.name === 'total')!;
    expect(out.rows[0].cells[totalCol.id]).toBe('4469');
  });

  it('sum/min/max/median/avg couvrent les cas standards', () => {
    const table = tableWithNotes(['5', '10', '15', '20']);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'groupe'), normalization: 'none' }],
      aggregates: [
        { fn: 'sum', columnId: getColumnId(table, 'note'), asName: 'sum' },
        { fn: 'min', columnId: getColumnId(table, 'note'), asName: 'min' },
        { fn: 'max', columnId: getColumnId(table, 'note'), asName: 'max' },
        { fn: 'median', columnId: getColumnId(table, 'note'), asName: 'median' },
        { fn: 'avg', columnId: getColumnId(table, 'note'), asName: 'avg' },
      ],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const cell = (name: string) => out.rows[0].cells[out.columns.find((c) => c.name === name)!.id];
    expect(cell('sum')).toBe('50');
    expect(cell('min')).toBe('5');
    expect(cell('max')).toBe('20');
    expect(cell('median')).toBe('12.5');
    expect(cell('avg')).toBe('12.5');
  });

  it('countDistinct et first et concat', () => {
    const table = createTableFromRows(
      't',
      ['groupe', 'ville'],
      [
        { groupe: 'A', ville: 'Douala' },
        { groupe: 'A', ville: 'Douala' },
        { groupe: 'A', ville: 'Yaoundé' },
      ],
    );
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'groupe'), normalization: 'none' }],
      aggregates: [
        { fn: 'countDistinct', columnId: getColumnId(table, 'ville'), asName: 'distinct' },
        { fn: 'first', columnId: getColumnId(table, 'ville'), asName: 'premiere' },
        { fn: 'concat', columnId: getColumnId(table, 'ville'), asName: 'toutes', separator: ' | ' },
      ],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const cell = (name: string) => out.rows[0].cells[out.columns.find((c) => c.name === name)!.id];
    expect(cell('distinct')).toBe('2');
    expect(cell('premiere')).toBe('Douala');
    expect(cell('toutes')).toBe('Douala | Douala | Yaoundé');
  });
});

describe('summarize — binning', () => {
  it('bornes explicites : conserve les tranches vides au milieu avec un compte de zéro', () => {
    // Notes 0 à 20, tranches [0,10) [10,12) [12,14) [14,16) [16,20] — aucune note entre 12 et 14.
    const table = createTableFromRows('t', ['note'], [{ note: '5' }, { note: '11' }, { note: '15' }, { note: '18' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [
        {
          columnId: getColumnId(table, 'note'),
          normalization: 'none',
          binning: { kind: 'explicit_boundaries', boundaries: [0, 10, 12, 14, 16, 20] },
        },
      ],
      aggregates: [{ fn: 'count', asName: 'effectif' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const noteCol = out.columns.find((c) => c.name === 'note')!;
    const effectifCol = out.columns.find((c) => c.name === 'effectif')!;
    const labels = out.rows.map((r) => r.cells[noteCol.id]);
    const counts = out.rows.map((r) => r.cells[effectifCol.id]);

    expect(labels).toEqual(['0–10', '10–12', '12–14', '14–16', '16–20']);
    // 5→[0,10) 11→[10,12) (rien dans [12,14)) 15→[14,16) 18→[16,20]
    expect(counts).toEqual(['1', '1', '0', '1', '1']);
    // Le trou (12–14) apparaît bien avec un compte de zéro, pas absent.
  });

  it('tranches à largeur fixe couvrent tout le domaine des données', () => {
    const table = createTableFromRows('t', ['age'], [{ age: '18' }, { age: '25' }, { age: '42' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'age'), normalization: 'none', binning: { kind: 'fixed_width', width: 10, start: 10 } }],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const ageCol = out.columns.find((c) => c.name === 'age')!;
    const nCol = out.columns.find((c) => c.name === 'n')!;
    const labels = out.rows.map((r) => r.cells[ageCol.id]);
    const counts = out.rows.map((r) => r.cells[nCol.id]);
    // 10-20 (18), 20-30 (25), 30-40 (vide), 40-50 (42)
    expect(labels).toEqual(['10–20', '20–30', '30–40', '40–50']);
    expect(counts).toEqual(['1', '1', '0', '1']);
  });

  it("nombre de tranches fixé : découpe l'intervalle [min,max] en N tranches égales", () => {
    const table = createTableFromRows('t', ['v'], [{ v: '0' }, { v: '50' }, { v: '100' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [{ columnId: getColumnId(table, 'v'), normalization: 'none', binning: { kind: 'fixed_count', count: 2 } }],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const vCol = out.columns.find((c) => c.name === 'v')!;
    const labels = out.rows.map((r) => r.cells[vCol.id]);
    expect(labels).toEqual(['0–50', '50–100']);
  });

  it('valeur non numérique dans une colonne binnée est isolée sans casser les autres tranches', () => {
    const table = createTableFromRows('t', ['note'], [{ note: '5' }, { note: 'absent' }, { note: '15' }]);
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [
        { columnId: getColumnId(table, 'note'), normalization: 'none', binning: { kind: 'explicit_boundaries', boundaries: [0, 10, 20] } },
      ],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const noteCol = out.columns.find((c) => c.name === 'note')!;
    const labels = out.rows.map((r) => r.cells[noteCol.id]);
    expect(labels).toContain('0–10');
    expect(labels).toContain('10–20');
    expect(labels).toContain('(non numérique)');
  });

  it('binning croisé avec une autre colonne de regroupement : tranches vides par sous-groupe observé', () => {
    const table = createTableFromRows(
      't',
      ['ville', 'note'],
      [
        { ville: 'Douala', note: '5' },
        { ville: 'Douala', note: '18' },
        { ville: 'Yaoundé', note: '9' },
      ],
    );
    const def = getOperationDefinition('summarize');
    const params: SummarizeParams = {
      groupBy: [
        { columnId: getColumnId(table, 'ville'), normalization: 'none' },
        { columnId: getColumnId(table, 'note'), normalization: 'none', binning: { kind: 'explicit_boundaries', boundaries: [0, 10, 20] } },
      ],
      aggregates: [{ fn: 'count', asName: 'n' }],
    };
    const { table: out } = def.apply(table, params, {} as any);
    const villeCol = out.columns.find((c) => c.name === 'ville')!;
    const noteCol = out.columns.find((c) => c.name === 'note')!;
    const nCol = out.columns.find((c) => c.name === 'n')!;
    const rows = out.rows.map((r) => [r.cells[villeCol.id], r.cells[noteCol.id], r.cells[nCol.id]]);
    // Douala doit avoir ses deux tranches (0-10 et 10-20), même si l'une était vide pour elle.
    expect(rows).toEqual(
      expect.arrayContaining([
        ['Douala', '0–10', '1'],
        ['Douala', '10–20', '1'],
        ['Yaoundé', '0–10', '1'],
      ]),
    );
    // Pas de tranche fantôme pour une ville qui n'existe pas du tout dans les données.
    expect(rows.some(([v]) => v !== 'Douala' && v !== 'Yaoundé')).toBe(false);
  });
});

describe('summarize — toPortable/rebind', () => {
  it('round-trip conserve groupBy et aggregates par nom', () => {
    const table = createTableFromRows('t', ['ville', 'note'], [{ ville: 'Douala', note: '10' }]);
    const def = getOperationDefinition('summarize');
    const groupBy: GroupByColumn[] = [{ columnId: getColumnId(table, 'ville'), normalization: 'text' }];
    const aggregates: AggregateSpec[] = [
      { fn: 'count', asName: 'n' },
      { fn: 'avg', columnId: getColumnId(table, 'note'), asName: 'moyenne' },
    ];
    const params: SummarizeParams = { groupBy, aggregates };
    const portable = def.toPortable(params, table, {} as any);
    expect(portable.columnNames.sort()).toEqual(['note', 'ville']);

    const nameToId = { ville: getColumnId(table, 'ville'), note: getColumnId(table, 'note') };
    const rebuilt = def.rebind(portable.params, nameToId) as SummarizeParams;
    expect(rebuilt).toEqual(params);
  });
});
