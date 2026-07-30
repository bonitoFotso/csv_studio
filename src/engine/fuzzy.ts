import { normalizeForComparison } from './normalize.ts';

export function tokenize(value: string): string[] {
  return normalizeForComparison(value).split(' ').filter(Boolean);
}

/** Réordonne les jetons alphabétiquement pour que "FOTSO BONITO" et "BONITO FOTSO" deviennent comparables. */
export function tokenSortedKey(value: string): string {
  return tokenize(value).sort().join(' ');
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);
  let matches = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(a, b);
  let prefixLen = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  while (prefixLen < maxPrefix && a[prefixLen] === b[prefixLen]) prefixLen++;
  return jaro + prefixLen * prefixScale * (1 - jaro);
}

export interface FuzzyScoreOptions {
  tokenized: boolean;
}

/** Score combiné Jaro-Winkler / Levenshtein normalisé, exprimé en 0-100. */
export function fuzzyScore(a: string, b: string, options: FuzzyScoreOptions): number {
  const na = options.tokenized ? tokenSortedKey(a) : normalizeForComparison(a);
  const nb = options.tokenized ? tokenSortedKey(b) : normalizeForComparison(b);
  const combined = (jaroWinklerSimilarity(na, nb) + levenshteinSimilarity(na, nb)) / 2;
  return Math.round(combined * 100);
}

/** Regroupe des identifiants par clé de blocage (jointure normalisée des valeurs des colonnes de blocage). */
export function buildBlocks<T>(items: T[], blockingKey: (item: T) => string): Map<string, T[]> {
  const blocks = new Map<string, T[]>();
  for (const item of items) {
    const key = blockingKey(item);
    const bucket = blocks.get(key);
    if (bucket) bucket.push(item);
    else blocks.set(key, [item]);
  }
  return blocks;
}
