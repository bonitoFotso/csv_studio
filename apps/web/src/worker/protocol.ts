import type { DedupMode, DuplicateGroup } from '@csv-studio/core/engine/dedupe.ts';
import type { KeyPair, MatchResult } from '@csv-studio/core/engine/join.ts';
import type { FuzzyMatchConfig, FuzzyResolution } from '@csv-studio/core/engine/fuzzyJoin.ts';
import type { ReplayResult } from '@csv-studio/core/engine/replay.ts';
import type { ColumnId, PipelineStep, Row, Table } from '@csv-studio/core/engine/types.ts';

export type WorkerRequest =
  | { kind: 'replay'; requestId: string; sourceTable: Table; steps: PipelineStep[]; cursor: number; auxiliaryTables: Table[] }
  | { kind: 'dedupe'; requestId: string; table: Table; keyColumnIds: ColumnId[]; mode: DedupMode }
  | { kind: 'matchExact'; requestId: string; leftRows: Row[]; rightRows: Row[]; keyPairs: KeyPair[] }
  | { kind: 'matchFuzzy'; requestId: string; leftRows: Row[]; rightRows: Row[]; config: FuzzyMatchConfig }
  | { kind: 'cancel'; requestId: string };

export type WorkerResponse =
  | { kind: 'replayResult'; requestId: string; result: ReplayResult }
  | { kind: 'dedupeResult'; requestId: string; result: DuplicateGroup[] }
  | { kind: 'matchExactResult'; requestId: string; result: MatchResult[] }
  | { kind: 'matchFuzzyResult'; requestId: string; result: FuzzyResolution }
  | { kind: 'progress'; requestId: string; done: number; total: number }
  | { kind: 'error'; requestId: string; message: string }
  | { kind: 'cancelled'; requestId: string };
