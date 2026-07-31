import { buildBlocks, fuzzyScore, tokenSortedKey } from './fuzzy.ts';
import { normalizeForComparison } from './normalize.ts';
import { normalizeKeyValue } from './keyNormalize.ts';
import { CancelledError, yieldToEventLoop, type CancelToken } from './asyncUtils.ts';
import type { KeyPair } from './join.ts';
import type { ColumnId, Row, RowId } from './types.ts';

export type { KeyPair };

export interface FuzzyManualDecision {
  leftKeyNormalized: string;
  rightKeyNormalized: string;
  decision: 'validated' | 'rejected';
}

/**
 * Association forcée par l'utilisateur entre une ligne de gauche et une ligne de droite précises,
 * indépendamment du blocage et du score. Contrairement à `FuzzyManualDecision` (qui valide/rejette
 * une paire déjà trouvée par l'algorithme), une paire forcée court-circuite entièrement la recherche —
 * c'est ce qui permet d'apparier manuellement une ligne classée "sans bloc candidat".
 */
export interface FuzzyForcedPair {
  leftKeyNormalized: string;
  rightKeyNormalized: string;
}

export interface FuzzyMatchConfig {
  leftKeyColumnIds: ColumnId[];
  rightKeyColumnIds: ColumnId[];
  /** Obligatoire : au moins une paire, pour éviter la comparaison O(n²). */
  blockingPairs: KeyPair[];
  /** Comparaison par jetons non ordonnés ("FOTSO BONITO" == "BONITO FOTSO"). */
  tokenized: boolean;
  thresholdHigh: number;
  thresholdLow: number;
  /** Décisions déjà prises, indexées par les valeurs des clés normalisées ; réappliquées sans redemander. */
  manualDecisions: FuzzyManualDecision[];
  /** Paires imposées manuellement (ex. depuis l'écran des lignes de droite non appariées), prioritaires sur tout le reste. */
  forcedPairs?: FuzzyForcedPair[];
}

export interface ResolvedFuzzyMatch {
  leftRow: Row;
  rightRow: Row;
  score: number;
  origin: 'auto' | 'manual';
}

export interface PendingFuzzyPair {
  leftRow: Row;
  rightRow: Row;
  score: number;
  leftKeyNormalized: string;
  rightKeyNormalized: string;
}

export interface FuzzyResolution {
  /** leftRow.id -> correspondance retenue (auto au-dessus du seuil haut, ou validée manuellement). */
  matches: Map<RowId, ResolvedFuzzyMatch>;
  /** Paires dans la zone grise, sans décision manuelle connue : à soumettre à l'écran de validation. */
  pending: PendingFuzzyPair[];
  /** Sous le seuil bas, ou rejetées manuellement. */
  rejectedCount: number;
  /** Aucune ligne de droite dans le même bloc. */
  noCandidateCount: number;
}

function buildComparisonText(row: Row, columnIds: ColumnId[]): string {
  return columnIds.map((id) => row.cells[id] ?? '').join(' ');
}

function blockKey(row: Row, pairs: KeyPair[], side: 'left' | 'right'): string {
  return pairs
    .map((p) => {
      const columnId = side === 'left' ? p.leftColumnId : p.rightColumnId;
      return normalizeKeyValue(row.cells[columnId] ?? '', p.normalization ?? 'none');
    })
    .join('');
}

function normalizedKey(text: string, tokenized: boolean): string {
  return tokenized ? tokenSortedKey(text) : normalizeForComparison(text);
}

function decisionMapKey(left: string, right: string): string {
  return `${left}${right}`;
}

interface Accumulator {
  rightBlocks: Map<string, Row[]>;
  rightByNormalizedKey: Map<string, Row>;
  forcedByLeftKey: Map<string, string>;
  decisions: Map<string, 'validated' | 'rejected'>;
  matches: Map<RowId, ResolvedFuzzyMatch>;
  pending: PendingFuzzyPair[];
  rejectedCount: number;
  noCandidateCount: number;
}

function createAccumulator(rightRows: Row[], config: FuzzyMatchConfig): Accumulator {
  const rightByNormalizedKey = new Map<string, Row>();
  for (const r of rightRows) {
    const key = normalizedKey(buildComparisonText(r, config.rightKeyColumnIds), config.tokenized);
    if (!rightByNormalizedKey.has(key)) rightByNormalizedKey.set(key, r);
  }

  return {
    rightBlocks: buildBlocks(rightRows, (r) => blockKey(r, config.blockingPairs, 'right')),
    rightByNormalizedKey,
    forcedByLeftKey: new Map((config.forcedPairs ?? []).map((f) => [f.leftKeyNormalized, f.rightKeyNormalized])),
    decisions: new Map(config.manualDecisions.map((d) => [decisionMapKey(d.leftKeyNormalized, d.rightKeyNormalized), d.decision])),
    matches: new Map(),
    pending: [],
    rejectedCount: 0,
    noCandidateCount: 0,
  };
}

/** Résout une ligne de gauche contre les blocs de droite, en mutant l'accumulateur. Cœur partagé par la version synchrone et la version découpée en tranches. */
function resolveOneRow(leftRow: Row, config: FuzzyMatchConfig, acc: Accumulator): void {
  const leftText = buildComparisonText(leftRow, config.leftKeyColumnIds);
  const leftKeyNormalized = normalizedKey(leftText, config.tokenized);

  // Association forcée : prioritaire, contourne entièrement le blocage (utile pour les lignes
  // qu'aucun bloc n'aurait jamais rapprochées, ex. valeur de blocage mal saisie côté source).
  const forcedRightKey = acc.forcedByLeftKey.get(leftKeyNormalized);
  if (forcedRightKey) {
    const forcedRightRow = acc.rightByNormalizedKey.get(forcedRightKey);
    if (forcedRightRow) {
      acc.matches.set(leftRow.id, { leftRow, rightRow: forcedRightRow, score: 100, origin: 'manual' });
      return;
    }
  }

  const candidates = acc.rightBlocks.get(blockKey(leftRow, config.blockingPairs, 'left')) ?? [];
  if (candidates.length === 0) {
    acc.noCandidateCount++;
    return;
  }

  let best: { rightRow: Row; score: number } | null = null;
  for (const rightRow of candidates) {
    const score = fuzzyScore(leftText, buildComparisonText(rightRow, config.rightKeyColumnIds), { tokenized: config.tokenized });
    if (!best || score > best.score) best = { rightRow, score };
  }
  if (!best) {
    acc.noCandidateCount++;
    return;
  }

  const rightKeyNormalized = normalizedKey(buildComparisonText(best.rightRow, config.rightKeyColumnIds), config.tokenized);
  const stored = acc.decisions.get(decisionMapKey(leftKeyNormalized, rightKeyNormalized));

  if (stored === 'validated') {
    acc.matches.set(leftRow.id, { leftRow, rightRow: best.rightRow, score: best.score, origin: 'manual' });
  } else if (stored === 'rejected') {
    acc.rejectedCount++;
  } else if (best.score >= config.thresholdHigh) {
    acc.matches.set(leftRow.id, { leftRow, rightRow: best.rightRow, score: best.score, origin: 'auto' });
  } else if (best.score >= config.thresholdLow) {
    acc.pending.push({ leftRow, rightRow: best.rightRow, score: best.score, leftKeyNormalized, rightKeyNormalized });
  } else {
    acc.rejectedCount++;
  }
}

function toResolution(acc: Accumulator): FuzzyResolution {
  return { matches: acc.matches, pending: acc.pending, rejectedCount: acc.rejectedCount, noCandidateCount: acc.noCandidateCount };
}

/** Clé normalisée d'une ligne pour ses colonnes de comparaison — utilisé par l'UI pour construire une `FuzzyForcedPair` à partir de deux lignes choisies à la main. */
export function computeKeyNormalizedText(row: Row, columnIds: ColumnId[], tokenized: boolean): string {
  return normalizedKey(buildComparisonText(row, columnIds), tokenized);
}

/**
 * Lignes de droite jamais retenues comme correspondance (ni automatiquement, ni manuellement) —
 * c'est parmi elles que se trouve, par exemple, la ligne d'un second fichier plus petit qui n'a
 * jamais été choisie par aucune ligne de gauche : à passer en revue et éventuellement apparier
 * manuellement (voir `FuzzyForcedPair`) ou exporter pour un traitement à part.
 */
export function unmatchedRightRows(rightRows: Row[], resolution: FuzzyResolution): Row[] {
  const matchedIds = new Set([...resolution.matches.values()].map((m) => m.rightRow.id));
  return rightRows.filter((r) => !matchedIds.has(r.id));
}

export function resolveFuzzyMatches(leftRows: Row[], rightRows: Row[], config: FuzzyMatchConfig): FuzzyResolution {
  const acc = createAccumulator(rightRows, config);
  for (const leftRow of leftRows) resolveOneRow(leftRow, config, acc);
  return toResolution(acc);
}

export interface ChunkedFuzzyOptions {
  /** Appelé après chaque tranche traitée (utilisé pour la barre de progression). */
  onProgress?: (done: number, total: number) => void;
  /** Vérifié entre deux tranches ; lève `CancelledError` si `aborted` devient vrai. */
  cancelToken?: CancelToken;
  /** Nombre de lignes de gauche traitées avant de rendre la main à la boucle d'événements. */
  chunkSize?: number;
}

/**
 * Identique à `resolveFuzzyMatches`, mais découpé en tranches pour ne jamais bloquer
 * le fil d'exécution longtemps d'affilée : c'est la version utilisée dans le Worker
 * pour l'aperçu en direct du rapprochement flou (le calcul potentiellement le plus coûteux
 * de l'app, à cause du score Jaro-Winkler/Levenshtein par paire comparée).
 */
export async function resolveFuzzyMatchesChunked(
  leftRows: Row[],
  rightRows: Row[],
  config: FuzzyMatchConfig,
  options: ChunkedFuzzyOptions = {},
): Promise<FuzzyResolution> {
  const { onProgress, cancelToken, chunkSize = 200 } = options;
  const acc = createAccumulator(rightRows, config);

  for (let i = 0; i < leftRows.length; i++) {
    resolveOneRow(leftRows[i], config, acc);

    if ((i + 1) % chunkSize === 0 || i === leftRows.length - 1) {
      onProgress?.(i + 1, leftRows.length);
      await yieldToEventLoop();
      if (cancelToken?.aborted) throw new CancelledError();
    }
  }

  return toResolution(acc);
}
