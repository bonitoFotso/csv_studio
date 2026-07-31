import { describe, expect, it } from 'vitest';
import { parseTolerantNumber } from './numberParse.ts';

describe('parseTolerantNumber', () => {
  it('parse un nombre simple', () => {
    expect(parseTolerantNumber('12')).toBe(12);
    expect(parseTolerantNumber('12.5')).toBe(12.5);
  });

  it('parse une virgule décimale française', () => {
    expect(parseTolerantNumber('12,5')).toBe(12.5);
    expect(parseTolerantNumber('-3,5')).toBe(-3.5);
  });

  it('ignore les espaces de milliers (normal, insécable, fine insécable)', () => {
    expect(parseTolerantNumber('1 234,56')).toBe(1234.56);
    expect(parseTolerantNumber('1 234,56')).toBe(1234.56);
    expect(parseTolerantNumber('1 234,56')).toBe(1234.56);
    expect(parseTolerantNumber('1 234 567')).toBe(1234567);
  });

  it('gère un format international déjà en point décimal', () => {
    expect(parseTolerantNumber('1234.56')).toBe(1234.56);
  });

  it('résout la virgule/point ambigus en prenant le dernier séparateur comme décimal', () => {
    expect(parseTolerantNumber('1.234,56')).toBe(1234.56); // français, point = milliers
    expect(parseTolerantNumber('1,234.56')).toBe(1234.56); // international, virgule = milliers
  });

  it('une chaîne vide ou uniquement des espaces est absente (null), jamais zéro', () => {
    expect(parseTolerantNumber('')).toBeNull();
    expect(parseTolerantNumber('   ')).toBeNull();
    expect(parseTolerantNumber(' ')).toBeNull();
  });

  it('une valeur non numérique renvoie null', () => {
    expect(parseTolerantNumber('abc')).toBeNull();
    expect(parseTolerantNumber('-')).toBeNull();
    expect(parseTolerantNumber('12abc')).toBeNull();
  });

  it('zéro explicite reste zéro, pas absent', () => {
    expect(parseTolerantNumber('0')).toBe(0);
    expect(parseTolerantNumber('0,0')).toBe(0);
  });
});
