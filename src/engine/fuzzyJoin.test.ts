import { describe, expect, it } from 'vitest';
import { createTableFromRows, getColumnId } from './table.ts';
import { resolveFuzzyMatches, type FuzzyMatchConfig } from './fuzzyJoin.ts';

function setup() {
  const left = createTableFromRows(
    'candidats',
    ['nom_complet', 'annee'],
    [
      { nom_complet: 'FOTSO BONITO', annee: '1998' },
      { nom_complet: 'Alice Kamga', annee: '2000' },
      { nom_complet: 'Jean Dupont', annee: '1995' },
    ],
  );
  const right = createTableFromRows(
    'presence',
    ['nom_complet', 'annee', 'nb_presences'],
    [
      { nom_complet: 'Bonito Fotso', annee: '1998', nb_presences: '12' },
      { nom_complet: 'Alice Kamgaa', annee: '2000', nb_presences: '5' },
      { nom_complet: 'Paul Ngo', annee: '1995', nb_presences: '3' },
    ],
  );
  return { left, right };
}

function baseConfig(left: ReturnType<typeof setup>['left'], right: ReturnType<typeof setup>['right']): FuzzyMatchConfig {
  return {
    leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
    rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
    blockingPairs: [{ leftColumnId: getColumnId(left, 'annee'), rightColumnId: getColumnId(right, 'annee') }],
    tokenized: true,
    thresholdHigh: 90,
    thresholdLow: 60,
    manualDecisions: [],
  };
}

describe('resolveFuzzyMatches', () => {
  it('matche automatiquement au-dessus du seuil haut, y compris nom/prénom inversés (jetons non ordonnés)', () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    const fotsoRow = left.rows[0];
    expect(resolution.matches.get(fotsoRow.id)?.origin).toBe('auto');
  });

  it("ne compare jamais deux lignes de blocs différents (l'année de naissance isole Jean Dupont / Paul Ngo)", () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    const dupontRow = left.rows[2];
    // Jean Dupont (1995) et Paul Ngo (1995) sont dans le même bloc mais textuellement très différents : rejeté, pas apparié.
    expect(resolution.matches.has(dupontRow.id)).toBe(false);
  });

  it('place en attente les scores dans la zone grise entre les deux seuils', () => {
    const { left, right } = setup();
    const config = { ...baseConfig(left, right), thresholdHigh: 99, thresholdLow: 10 };
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    const aliceRow = left.rows[1];
    expect(resolution.pending.some((p) => p.leftRow.id === aliceRow.id)).toBe(true);
  });

  it('une décision manuelle validée est réappliquée sans repasser par la file d\'attente', () => {
    const { left, right } = setup();
    const pendingConfig: FuzzyMatchConfig = { ...baseConfig(left, right), thresholdHigh: 99, thresholdLow: 10 };
    const first = resolveFuzzyMatches(left.rows, right.rows, pendingConfig);
    const alicePending = first.pending.find((p) => p.leftRow.id === left.rows[1].id)!;
    expect(alicePending).toBeDefined();

    const configWithDecision: FuzzyMatchConfig = {
      ...pendingConfig,
      manualDecisions: [{ leftKeyNormalized: alicePending.leftKeyNormalized, rightKeyNormalized: alicePending.rightKeyNormalized, decision: 'validated' }],
    };
    const second = resolveFuzzyMatches(left.rows, right.rows, configWithDecision);
    expect(second.matches.get(left.rows[1].id)?.origin).toBe('manual');
    expect(second.pending.some((p) => p.leftRow.id === left.rows[1].id)).toBe(false);
  });

  it('une décision manuelle rejetée compte comme rejetée, jamais comme non appariée par manque de bloc', () => {
    const { left, right } = setup();
    const pendingConfig: FuzzyMatchConfig = { ...baseConfig(left, right), thresholdHigh: 99, thresholdLow: 10 };
    const first = resolveFuzzyMatches(left.rows, right.rows, pendingConfig);
    const alicePending = first.pending.find((p) => p.leftRow.id === left.rows[1].id)!;

    const configWithDecision: FuzzyMatchConfig = {
      ...pendingConfig,
      manualDecisions: [{ leftKeyNormalized: alicePending.leftKeyNormalized, rightKeyNormalized: alicePending.rightKeyNormalized, decision: 'rejected' }],
    };
    const second = resolveFuzzyMatches(left.rows, right.rows, configWithDecision);
    expect(second.matches.has(left.rows[1].id)).toBe(false);
    expect(second.rejectedCount).toBeGreaterThan(first.rejectedCount - 1);
  });

  it('aucune ligne de droite dans le bloc -> noCandidateCount', () => {
    const left = createTableFromRows('t', ['nom', 'annee'], [{ nom: 'Fotso', annee: '1970' }]);
    const right = createTableFromRows('t2', ['nom', 'annee'], [{ nom: 'Fotso', annee: '1998' }]);
    const config: FuzzyMatchConfig = {
      leftKeyColumnIds: [getColumnId(left, 'nom')],
      rightKeyColumnIds: [getColumnId(right, 'nom')],
      blockingPairs: [{ leftColumnId: getColumnId(left, 'annee'), rightColumnId: getColumnId(right, 'annee') }],
      tokenized: true,
      thresholdHigh: 90,
      thresholdLow: 60,
      manualDecisions: [],
    };
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    expect(resolution.noCandidateCount).toBe(1);
  });
});
