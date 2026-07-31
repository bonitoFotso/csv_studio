import { describe, expect, it } from 'vitest';
import { normalizeKeyValue } from './keyNormalize.ts';

describe('normalizeKeyValue', () => {
  it('mode none ne change rien', () => {
    expect(normalizeKeyValue('  Fotso ', 'none')).toBe('  Fotso ');
  });

  it('mode text gère casse, accents et espaces', () => {
    expect(normalizeKeyValue('  Fotso ', 'text')).toBe(normalizeKeyValue('FOTSO', 'text'));
    expect(normalizeKeyValue('Ngo Éric', 'text')).toBe(normalizeKeyValue('NGO ERIC', 'text'));
  });

  it('mode date : mêmes séparateurs différents donnent la même clé', () => {
    expect(normalizeKeyValue('19/07/2026', 'date')).toBe(normalizeKeyValue('19-07-2026', 'date'));
    expect(normalizeKeyValue('19/07/2026', 'date')).toBe(normalizeKeyValue('19.07.2026', 'date'));
  });

  it('mode date : zéro-padding différent donne la même clé', () => {
    expect(normalizeKeyValue('9/7/2026', 'date')).toBe(normalizeKeyValue('09/07/2026', 'date'));
  });

  it('mode date : format année en tête (ISO) équivaut au format jour en tête', () => {
    expect(normalizeKeyValue('2026-07-19', 'date')).toBe(normalizeKeyValue('19/07/2026', 'date'));
  });

  it('mode date : résultat au format YYYY-MM-DD', () => {
    expect(normalizeKeyValue('19/07/2026', 'date')).toBe('2026-07-19');
  });

  it('mode date : valeur non reconnue comme date retombe sur la normalisation texte', () => {
    expect(normalizeKeyValue('  Fotso ', 'date')).toBe(normalizeKeyValue('FOTSO', 'date'));
  });
});
