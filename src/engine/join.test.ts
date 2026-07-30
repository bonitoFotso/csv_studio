import { describe, expect, it } from 'vitest';
import { createTableFromRows, getColumnId } from './table.ts';
import { aggregateValues, matchRowsExact } from './join.ts';

describe('matchRowsExact', () => {
  it('associe 0, 1 ou plusieurs lignes de droite selon la clé', () => {
    const left = createTableFromRows('gauche', ['id'], [{ id: '1' }, { id: '2' }, { id: '3' }]);
    const right = createTableFromRows(
      'droite',
      ['ref', 'note'],
      [
        { ref: '1', note: '15' },
        { ref: '2', note: '10' },
        { ref: '2', note: '12' },
      ],
    );
    const keyPairs = [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }];
    const results = matchRowsExact(left.rows, right.rows, keyPairs);

    expect(results[0].matches).toHaveLength(1);
    expect(results[1].matches).toHaveLength(2);
    expect(results[2].matches).toHaveLength(0);
  });
});

describe('aggregateValues', () => {
  it('somme, max, min ignorent les valeurs non numériques/vides', () => {
    expect(aggregateValues(['10', '', 'abc', '5'], 'sum')).toBe('15');
    expect(aggregateValues(['10', '5', '20'], 'max')).toBe('20');
    expect(aggregateValues(['10', '5', '20'], 'min')).toBe('5');
  });

  it('concat joint les valeurs non vides avec le séparateur', () => {
    expect(aggregateValues(['a', '', 'b'], 'concat', ' / ')).toBe('a / b');
  });

  it('renvoie une chaîne vide si aucune valeur numérique exploitable', () => {
    expect(aggregateValues(['', 'abc'], 'sum')).toBe('');
  });
});
