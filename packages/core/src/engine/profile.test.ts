import { describe, expect, it } from 'vitest';
import { createTableFromRows, getColumnId } from './table.ts';
import { computeColumnProfile } from './profile.ts';

describe('computeColumnProfile', () => {
  it('détecte une colonne entière (matricules avec zéros initiaux conservés)', () => {
    const table = createTableFromRows('t', ['matricule'], [{ matricule: '007' }, { matricule: '042' }, { matricule: '123' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'matricule'));
    expect(profile.detectedType).toBe('integer');
    expect(profile.fillRate).toBe(1);
    expect(profile.distinctCount).toBe(3);
  });

  it('détecte une colonne de dates', () => {
    const table = createTableFromRows('t', ['naissance'], [{ naissance: '15/03/1998' }, { naissance: '02/11/2000' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'naissance'));
    expect(profile.detectedType).toBe('date');
  });

  it('détecte une colonne booléenne oui/non', () => {
    const table = createTableFromRows('t', ['present'], [{ present: 'oui' }, { present: 'non' }, { present: 'oui' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'present'));
    expect(profile.detectedType).toBe('boolean');
  });

  it('retombe sur text dès qu\'une valeur ne correspond pas au type dominant', () => {
    const table = createTableFromRows('t', ['note'], [{ note: '15' }, { note: 'absent' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'note'));
    expect(profile.detectedType).toBe('text');
  });

  it('calcule taux de remplissage et top valeurs', () => {
    const table = createTableFromRows('t', ['ville'], [{ ville: 'Douala' }, { ville: 'Douala' }, { ville: '' }, { ville: 'Yaoundé' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'ville'));
    expect(profile.fillRate).toBeCloseTo(0.75);
    expect(profile.topValues[0]).toEqual({ value: 'Douala', count: 2 });
  });

  it('signale les espaces en trop', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: '  Fotso' }, { nom: 'Kamga' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'nom'));
    const anomaly = profile.anomalies.find((a) => a.kind === 'leading_trailing_space');
    expect(anomaly?.examples).toContain('  Fotso');
  });

  it('signale les espaces multiples internes', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: 'Jean  Paul' }, { nom: 'Marie Claire' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'nom'));
    expect(profile.anomalies.some((a) => a.kind === 'multiple_spaces')).toBe(true);
  });

  it('signale une casse incohérente par rapport à la majorité', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: 'Fotso' }, { nom: 'Kamga' }, { nom: 'Ngo' }, { nom: 'DUPONT' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'nom'));
    const anomaly = profile.anomalies.find((a) => a.kind === 'inconsistent_case');
    expect(anomaly?.examples).toContain('DUPONT');
  });

  it('signale un encodage cassé (mojibake)', () => {
    const table = createTableFromRows('t', ['ville'], [{ ville: 'YaoundÃ©' }, { ville: 'Douala' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'ville'));
    expect(profile.anomalies.some((a) => a.kind === 'mojibake')).toBe(true);
  });

  it('colonne vide donne empty et fillRate 0', () => {
    const table = createTableFromRows('t', ['x'], [{ x: '' }, { x: '' }]);
    const profile = computeColumnProfile(table, getColumnId(table, 'x'));
    expect(profile.detectedType).toBe('empty');
    expect(profile.fillRate).toBe(0);
  });
});
