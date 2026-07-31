import { describe, expect, it } from 'vitest';
import { generateSyntheticCandidates } from './generateSyntheticDataset.ts';

describe('generateSyntheticCandidates', () => {
  it('génère 500 lignes de base plus les doublons volontaires', () => {
    const rows = generateSyntheticCandidates(500);
    expect(rows.length).toBe(500 + 4 + 3); // 4 doublons exacts + 3 quasi-exacts
  });

  it('est reproductible : même graine, même résultat', () => {
    const a = generateSyntheticCandidates(500, 42);
    const b = generateSyntheticCandidates(500, 42);
    expect(a).toEqual(b);
  });

  it('contient des valeurs manquantes (pas un jeu de données parfait)', () => {
    const rows = generateSyntheticCandidates(500);
    expect(rows.some((r) => r.nb_presences === '')).toBe(true);
    expect(rows.some((r) => r.note === '')).toBe(true);
    expect(rows.some((r) => r.decision === '')).toBe(true);
  });

  it('contient des caractères accentués et des apostrophes', () => {
    const rows = generateSyntheticCandidates(500);
    const allText = rows.map((r) => `${r.nom} ${r.prenom}`).join(' ');
    expect(/[éèôçÉ]/.test(allText)).toBe(true);
    expect(allText.includes("'")).toBe(true);
  });

  it('contient des doublons exacts et des quasi-doublons (casse/espaces)', () => {
    const rows = generateSyntheticCandidates(500);
    const key = (r: (typeof rows)[number]) => `${r.nom}|${r.prenom}|${r.date_naissance}`;
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
    expect([...counts.values()].some((c) => c > 1)).toBe(true);

    const hasWhitespaceOrCaseVariant = rows.some((r) => r.nom !== r.nom.trim() || r.nom === r.nom.toUpperCase());
    expect(hasWhitespaceOrCaseVariant).toBe(true);
  });

  it('les notes utilisent parfois la virgule décimale française', () => {
    const rows = generateSyntheticCandidates(500);
    expect(rows.some((r) => r.note.includes(','))).toBe(true);
  });
});
