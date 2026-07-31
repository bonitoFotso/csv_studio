import { describe, expect, it } from 'vitest';
import { bound, clampSampleCap, DEFAULT_SAMPLE_CAP, MAX_SAMPLE_CAP } from './bounded.ts';

describe('clampSampleCap', () => {
  it('renvoie le défaut si non fourni', () => {
    expect(clampSampleCap(undefined)).toBe(DEFAULT_SAMPLE_CAP);
  });

  it('renvoie le défaut pour une valeur non numérique', () => {
    expect(clampSampleCap('30')).toBe(DEFAULT_SAMPLE_CAP);
    expect(clampSampleCap(NaN)).toBe(DEFAULT_SAMPLE_CAP);
  });

  it('renvoie le défaut pour zéro ou négatif', () => {
    expect(clampSampleCap(0)).toBe(DEFAULT_SAMPLE_CAP);
    expect(clampSampleCap(-5)).toBe(DEFAULT_SAMPLE_CAP);
  });

  it('accepte une valeur dans les bornes', () => {
    expect(clampSampleCap(10)).toBe(10);
  });

  it('tronque une valeur décimale', () => {
    expect(clampSampleCap(10.9)).toBe(10);
  });

  it('plafonne à MAX_SAMPLE_CAP', () => {
    expect(clampSampleCap(100000)).toBe(MAX_SAMPLE_CAP);
  });
});

describe('bound', () => {
  it('ne tronque pas si en dessous du plafond', () => {
    const result = bound([1, 2, 3], 10);
    expect(result).toEqual({ totalCount: 3, sample: [1, 2, 3], truncated: false });
  });

  it('tronque et le signale si au-dessus du plafond', () => {
    const result = bound([1, 2, 3, 4, 5], 3);
    expect(result).toEqual({ totalCount: 5, sample: [1, 2, 3], truncated: true });
  });

  it('gère un tableau vide', () => {
    expect(bound([], 30)).toEqual({ totalCount: 0, sample: [], truncated: false });
  });
});
