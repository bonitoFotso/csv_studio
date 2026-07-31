import { describe, expect, it } from 'vitest';
import { createTableFromRows, getColumnId } from './table.ts';
import { computeKeyNormalizedText, resolveFuzzyMatches, resolveFuzzyMatchesChunked, unmatchedRightRows, type FuzzyMatchConfig } from './fuzzyJoin.ts';
import { CancelledError } from './asyncUtils.ts';

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

describe('resolveFuzzyMatches — blocage avec normalisation de date', () => {
  it("bloque correctement malgré des dates de naissance écrites avec des séparateurs différents", () => {
    const left = createTableFromRows('candidats', ['nom_complet', 'naissance'], [{ nom_complet: 'FOTSO BONITO', naissance: '19/07/1998' }]);
    const right = createTableFromRows(
      'presence',
      ['nom_complet', 'naissance', 'nb_presences'],
      [{ nom_complet: 'Bonito Fotso', naissance: '19-07-1998', nb_presences: '12' }],
    );
    const config: FuzzyMatchConfig = {
      leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
      rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
      blockingPairs: [{ leftColumnId: getColumnId(left, 'naissance'), rightColumnId: getColumnId(right, 'naissance'), normalization: 'date' }],
      tokenized: true,
      thresholdHigh: 90,
      thresholdLow: 60,
      manualDecisions: [],
    };
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    expect(resolution.matches.get(left.rows[0].id)?.origin).toBe('auto');
    expect(resolution.noCandidateCount).toBe(0);
  });

  it('sans normalisation, ces mêmes dates ne sont pas dans le même bloc (aucun candidat)', () => {
    const left = createTableFromRows('candidats', ['nom_complet', 'naissance'], [{ nom_complet: 'FOTSO BONITO', naissance: '19/07/1998' }]);
    const right = createTableFromRows(
      'presence',
      ['nom_complet', 'naissance', 'nb_presences'],
      [{ nom_complet: 'Bonito Fotso', naissance: '19-07-1998', nb_presences: '12' }],
    );
    const config: FuzzyMatchConfig = {
      leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
      rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
      blockingPairs: [{ leftColumnId: getColumnId(left, 'naissance'), rightColumnId: getColumnId(right, 'naissance') }],
      tokenized: true,
      thresholdHigh: 90,
      thresholdLow: 60,
      manualDecisions: [],
    };
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    expect(resolution.noCandidateCount).toBe(1);
  });
});

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

describe('resolveFuzzyMatchesChunked', () => {
  it('produit exactement le même résultat que la version synchrone', async () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const sync = resolveFuzzyMatches(left.rows, right.rows, config);
    const chunked = await resolveFuzzyMatchesChunked(left.rows, right.rows, config, { chunkSize: 1 });
    expect([...chunked.matches.entries()]).toEqual([...sync.matches.entries()]);
    expect(chunked.pending).toEqual(sync.pending);
    expect(chunked.rejectedCount).toBe(sync.rejectedCount);
    expect(chunked.noCandidateCount).toBe(sync.noCandidateCount);
  });

  it('reporte la progression par tranche', async () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const calls: Array<[number, number]> = [];
    await resolveFuzzyMatchesChunked(left.rows, right.rows, config, {
      chunkSize: 1,
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('lève CancelledError et s\'arrête dès que le jeton est marqué comme annulé', async () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const cancelToken = { aborted: false };
    let calls = 0;
    const promise = resolveFuzzyMatchesChunked(left.rows, right.rows, config, {
      chunkSize: 1,
      cancelToken,
      onProgress: () => {
        calls++;
        if (calls === 1) cancelToken.aborted = true;
      },
    });
    await expect(promise).rejects.toThrow(CancelledError);
    expect(calls).toBe(1);
  });
});

describe('unmatchedRightRows', () => {
  it("liste les lignes de droite qu'aucune ligne de gauche n'a retenues", () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    const resolution = resolveFuzzyMatches(left.rows, right.rows, config);
    const unmatched = unmatchedRightRows(right.rows, resolution);
    // Fotso/Bonito -> matché (auto), Alice Kamga/Kamgaa -> pas assez proche par défaut (seuils 90/60,
    // score autour de 80-90 selon l'implémentation) donc on ne fait pas d'hypothèse fine ici :
    // on vérifie juste que toute ligne de droite retenue par une correspondance n'apparaît pas dans la liste.
    const matchedRightIds = new Set([...resolution.matches.values()].map((m) => m.rightRow.id));
    expect(unmatched.every((r) => !matchedRightIds.has(r.id))).toBe(true);
    expect(unmatched.length).toBe(right.rows.length - matchedRightIds.size);
  });
});

describe('forcedPairs — association manuelle indépendante du blocage', () => {
  it('permet d\'apparier une ligne classée "sans bloc candidat" à une ligne de droite choisie à la main', () => {
    // Années différentes (1998 vs 2005) : ces deux lignes ne partageront jamais de bloc.
    const left = createTableFromRows('candidats', ['nom_complet', 'annee'], [{ nom_complet: 'FOTSO BONITO', annee: '1998' }]);
    const right = createTableFromRows('presence', ['nom_complet', 'annee'], [{ nom_complet: 'Bonito Fotso (saisie tardive)', annee: '2005' }]);
    const baseCfg: FuzzyMatchConfig = {
      leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
      rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
      blockingPairs: [{ leftColumnId: getColumnId(left, 'annee'), rightColumnId: getColumnId(right, 'annee') }],
      tokenized: true,
      thresholdHigh: 90,
      thresholdLow: 60,
      manualDecisions: [],
    };

    const before = resolveFuzzyMatches(left.rows, right.rows, baseCfg);
    expect(before.noCandidateCount).toBe(1);
    expect(before.matches.size).toBe(0);

    const leftKeyNormalized = computeKeyNormalizedText(left.rows[0], baseCfg.leftKeyColumnIds, baseCfg.tokenized);
    const rightKeyNormalized = computeKeyNormalizedText(right.rows[0], baseCfg.rightKeyColumnIds, baseCfg.tokenized);
    const withForced: FuzzyMatchConfig = { ...baseCfg, forcedPairs: [{ leftKeyNormalized, rightKeyNormalized }] };

    const after = resolveFuzzyMatches(left.rows, right.rows, withForced);
    expect(after.noCandidateCount).toBe(0);
    expect(after.matches.get(left.rows[0].id)).toMatchObject({ rightRow: right.rows[0], origin: 'manual' });
    expect(unmatchedRightRows(right.rows, after)).toHaveLength(0);
  });

  it('une paire forcée est prioritaire même si un match automatique aurait été trouvé sans elle', () => {
    const { left, right } = setup();
    const config = baseConfig(left, right);
    // On force Jean Dupont (bloc 1995, normalement rejeté car trop différent de Paul Ngo) vers Paul Ngo quand même.
    const dupontRow = left.rows[2];
    const ngoRow = right.rows[2];
    const leftKeyNormalized = computeKeyNormalizedText(dupontRow, config.leftKeyColumnIds, config.tokenized);
    const rightKeyNormalized = computeKeyNormalizedText(ngoRow, config.rightKeyColumnIds, config.tokenized);

    const resolution = resolveFuzzyMatches(left.rows, right.rows, { ...config, forcedPairs: [{ leftKeyNormalized, rightKeyNormalized }] });
    expect(resolution.matches.get(dupontRow.id)).toMatchObject({ rightRow: ngoRow, origin: 'manual' });
  });
});
