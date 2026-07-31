import { describe, expect, it } from 'vitest';
import {
  asRecord,
  optionalBoolean,
  optionalNumber,
  optionalString,
  requireArray,
  requireString,
  requireStringArray,
  ToolInputError,
} from './validate.ts';

describe('asRecord', () => {
  it('accepte un objet', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('rejette un tableau, une chaîne, null', () => {
    expect(() => asRecord([1, 2])).toThrow(ToolInputError);
    expect(() => asRecord('x')).toThrow(ToolInputError);
    expect(() => asRecord(null)).toThrow(ToolInputError);
  });
});

describe('requireString', () => {
  it('renvoie la chaîne si présente et non vide', () => {
    expect(requireString({ a: 'x' }, 'a')).toBe('x');
  });

  it('rejette absent, vide, ou mauvais type', () => {
    expect(() => requireString({}, 'a')).toThrow(ToolInputError);
    expect(() => requireString({ a: '' }, 'a')).toThrow(ToolInputError);
    expect(() => requireString({ a: 5 }, 'a')).toThrow(ToolInputError);
  });
});

describe('optionalString', () => {
  it('renvoie undefined si absent', () => {
    expect(optionalString({}, 'a')).toBeUndefined();
  });

  it('rejette un mauvais type', () => {
    expect(() => optionalString({ a: 5 }, 'a')).toThrow(ToolInputError);
  });
});

describe('optionalBoolean', () => {
  it('renvoie le fallback si absent', () => {
    expect(optionalBoolean({}, 'a', true)).toBe(true);
    expect(optionalBoolean({}, 'a', false)).toBe(false);
  });

  it('renvoie la valeur si présente', () => {
    expect(optionalBoolean({ a: true }, 'a', false)).toBe(true);
  });

  it('rejette un mauvais type', () => {
    expect(() => optionalBoolean({ a: 'true' }, 'a', false)).toThrow(ToolInputError);
  });
});

describe('optionalNumber', () => {
  it('rejette NaN/Infinity et les mauvais types', () => {
    expect(() => optionalNumber({ a: NaN }, 'a')).toThrow(ToolInputError);
    expect(() => optionalNumber({ a: Infinity }, 'a')).toThrow(ToolInputError);
    expect(() => optionalNumber({ a: '5' }, 'a')).toThrow(ToolInputError);
  });

  it('accepte un nombre valide', () => {
    expect(optionalNumber({ a: 5 }, 'a')).toBe(5);
  });
});

describe('requireStringArray', () => {
  it('rejette absent, vide, ou éléments non-chaîne', () => {
    expect(() => requireStringArray({}, 'a')).toThrow(ToolInputError);
    expect(() => requireStringArray({ a: [] }, 'a')).toThrow(ToolInputError);
    expect(() => requireStringArray({ a: [1, 2] }, 'a')).toThrow(ToolInputError);
  });

  it('accepte un tableau de chaînes', () => {
    expect(requireStringArray({ a: ['x', 'y'] }, 'a')).toEqual(['x', 'y']);
  });
});

describe('requireArray', () => {
  it('rejette un non-tableau', () => {
    expect(() => requireArray({ a: {} }, 'a')).toThrow(ToolInputError);
  });

  it('accepte un tableau vide (contrairement à requireStringArray)', () => {
    expect(requireArray({ a: [] }, 'a')).toEqual([]);
  });
});
