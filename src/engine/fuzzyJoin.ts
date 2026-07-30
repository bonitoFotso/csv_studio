import { buildBlocks, fuzzyScore, tokenSortedKey } from './fuzzy.ts';
import { normalizeForComparison } from './normalize.ts';
import type { ColumnId, Row, RowId } from './types.ts';

export interface KeyPair {
  leftColumnId: ColumnId;
  rightColumnId: ColumnId;
}

export interface FuzzyManualDecision {
  leftKeyNormalized: string;
  rightKeyNormalized: string;
  decision: 'validated' | 'rejected';
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
  return pairs.map((p) => row.cells[side === 'left' ? p.leftColumnId : p.rightColumnId] ?? '').join('');
}

function normalizedKey(text: string, tokenized: boolean): string {
  return tokenized ? tokenSortedKey(text) : normalizeForComparison(text);
}

function decisionMapKey(left: string, right: string): string {
  return `${left}${right}`;
}

export function resolveFuzzyMatches(leftRows: Row[], rightRows: Row[], config: FuzzyMatchConfig): FuzzyResolution {
  const rightBlocks = buildBlocks(rightRows, (r) => blockKey(r, config.blockingPairs, 'right'));
  const decisions = new Map(config.manualDecisions.map((d) => [decisionMapKey(d.leftKeyNormalized, d.rightKeyNormalized), d.decision]));

  const matches = new Map<RowId, ResolvedFuzzyMatch>();
  const pending: PendingFuzzyPair[] = [];
  let rejectedCount = 0;
  let noCandidateCount = 0;

  for (const leftRow of leftRows) {
    const candidates = rightBlocks.get(blockKey(leftRow, config.blockingPairs, 'left')) ?? [];
    if (candidates.length === 0) {
      noCandidateCount++;
      continue;
    }

    const leftText = buildComparisonText(leftRow, config.leftKeyColumnIds);
    let best: { rightRow: Row; score: number } | null = null;
    for (const rightRow of candidates) {
      const score = fuzzyScore(leftText, buildComparisonText(rightRow, config.rightKeyColumnIds), { tokenized: config.tokenized });
      if (!best || score > best.score) best = { rightRow, score };
    }
    if (!best) {
      noCandidateCount++;
      continue;
    }

    const leftKeyNormalized = normalizedKey(leftText, config.tokenized);
    const rightKeyNormalized = normalizedKey(buildComparisonText(best.rightRow, config.rightKeyColumnIds), config.tokenized);
    const stored = decisions.get(decisionMapKey(leftKeyNormalized, rightKeyNormalized));

    if (stored === 'validated') {
      matches.set(leftRow.id, { leftRow, rightRow: best.rightRow, score: best.score, origin: 'manual' });
    } else if (stored === 'rejected') {
      rejectedCount++;
    } else if (best.score >= config.thresholdHigh) {
      matches.set(leftRow.id, { leftRow, rightRow: best.rightRow, score: best.score, origin: 'auto' });
    } else if (best.score >= config.thresholdLow) {
      pending.push({ leftRow, rightRow: best.rightRow, score: best.score, leftKeyNormalized, rightKeyNormalized });
    } else {
      rejectedCount++;
    }
  }

  return { matches, pending, rejectedCount, noCandidateCount };
}
