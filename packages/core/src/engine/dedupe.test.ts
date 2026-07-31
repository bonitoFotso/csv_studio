import { describe, expect, it } from 'vitest';
import { createTableFromRows, getColumnId } from './table.ts';
import { columnsThatDiffer, computeDuplicateGroups, mergeFirstNonEmpty, mostCompleteRow } from './dedupe.ts';

describe('computeDuplicateGroups', () => {
  it('regroupe en mode exact uniquement les valeurs identiques', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: 'Fotso' }, { nom: 'fotso' }, { nom: 'Kamga' }]);
    const groups = computeDuplicateGroups(table, [getColumnId(table, 'nom')], 'exact');
    expect(groups).toHaveLength(0);
  });

  it('regroupe en mode normalisé malgré casse/accents/espaces différents', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: '  Fotso ' }, { nom: 'FOTSO' }, { nom: 'Kamga' }]);
    const groups = computeDuplicateGroups(table, [getColumnId(table, 'nom')], 'normalized');
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });

  it('clé composite sur plusieurs colonnes', () => {
    const table = createTableFromRows(
      't',
      ['nom', 'annee'],
      [
        { nom: 'Fotso', annee: '1998' },
        { nom: 'Fotso', annee: '2000' },
        { nom: 'Fotso', annee: '1998' },
      ],
    );
    const groups = computeDuplicateGroups(table, [getColumnId(table, 'nom'), getColumnId(table, 'annee')], 'exact');
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });
});

describe('mostCompleteRow', () => {
  it('choisit la ligne avec le moins de cases vides', () => {
    const table = createTableFromRows(
      't',
      ['nom', 'tel', 'email'],
      [
        { nom: 'Fotso', tel: '', email: '' },
        { nom: 'Fotso', tel: '699000000', email: 'f@x.com' },
      ],
    );
    const best = mostCompleteRow(table.rows);
    expect(best.cells[getColumnId(table, 'tel')]).toBe('699000000');
  });
});

describe('mergeFirstNonEmpty', () => {
  it('prend la première valeur non vide par colonne', () => {
    const table = createTableFromRows(
      't',
      ['nom', 'tel'],
      [
        { nom: 'Fotso', tel: '' },
        { nom: '', tel: '699000000' },
      ],
    );
    const merged = mergeFirstNonEmpty(
      table.rows,
      table.columns.map((c) => c.id),
    );
    expect(merged.cells[getColumnId(table, 'nom')]).toBe('Fotso');
    expect(merged.cells[getColumnId(table, 'tel')]).toBe('699000000');
    expect(merged.id).toBe(table.rows[0].id);
  });
});

describe('columnsThatDiffer', () => {
  it('détecte uniquement les colonnes dont une valeur diverge dans le groupe', () => {
    const table = createTableFromRows(
      't',
      ['nom', 'ville'],
      [
        { nom: 'Fotso', ville: 'Douala' },
        { nom: 'Fotso', ville: 'Yaoundé' },
      ],
    );
    const diff = columnsThatDiffer(
      table.rows,
      table.columns.map((c) => c.id),
    );
    expect(diff.has(getColumnId(table, 'ville'))).toBe(true);
    expect(diff.has(getColumnId(table, 'nom'))).toBe(false);
  });
});
