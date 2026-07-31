import { createId } from '@/engine/ids.ts';
import type { DedupMode, DuplicateGroup } from '@/engine/dedupe.ts';
import type { KeyPair, MatchResult } from '@/engine/join.ts';
import type { FuzzyMatchConfig, FuzzyResolution } from '@/engine/fuzzyJoin.ts';
import type { ReplayOptions, ReplayResult } from '@/engine/replay.ts';
import type { ColumnId, PipelineStep, Row, Table } from '@/engine/types.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

let worker: Worker | null = null;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  onProgress?: (done: number, total: number) => void;
}

const pending = new Map<string, PendingCall>();
let listening = false;

function ensureListening(): void {
  if (listening) return;
  listening = true;
  getWorker().addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const call = pending.get(msg.requestId);
    if (!call) return;

    if (msg.kind === 'progress') {
      call.onProgress?.(msg.done, msg.total);
      return;
    }

    pending.delete(msg.requestId);
    if (msg.kind === 'error') call.reject(new Error(msg.message));
    else if (msg.kind === 'cancelled') call.reject(new DOMException('Opération annulée', 'AbortError'));
    else call.resolve(msg.result);
  });
}

export interface WorkerCall<T> {
  promise: Promise<T>;
  cancel: () => void;
}

// `Omit` sur une union n'en distribue pas les membres (keyof d'une union = intersection des clés) :
// sans ça, les champs propres à chaque variante (sourceTable, table, leftRows…) disparaissent du type.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

function callWorker<T>(request: DistributiveOmit<WorkerRequest, 'requestId'>, onProgress?: (done: number, total: number) => void): WorkerCall<T> {
  ensureListening();
  const requestId = createId();

  const promise = new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, onProgress });
  });

  getWorker().postMessage({ ...request, requestId } as WorkerRequest);

  const cancel = () => {
    if (!pending.has(requestId)) return;
    pending.delete(requestId);
    getWorker().postMessage({ kind: 'cancel', requestId } satisfies WorkerRequest);
  };

  return { promise, cancel };
}

export const workerClient = {
  replay(sourceTable: Table, steps: PipelineStep[], cursor: number, options: ReplayOptions = {}): WorkerCall<ReplayResult> {
    return callWorker(
      { kind: 'replay', sourceTable, steps, cursor, auxiliaryTables: options.auxiliaryTables ?? [] },
      options.onStepProgress,
    );
  },

  computeDuplicateGroups(table: Table, keyColumnIds: ColumnId[], mode: DedupMode): WorkerCall<DuplicateGroup[]> {
    return callWorker({ kind: 'dedupe', table, keyColumnIds, mode });
  },

  matchRowsExact(leftRows: Row[], rightRows: Row[], keyPairs: KeyPair[]): WorkerCall<MatchResult[]> {
    return callWorker({ kind: 'matchExact', leftRows, rightRows, keyPairs });
  },

  resolveFuzzyMatches(
    leftRows: Row[],
    rightRows: Row[],
    config: FuzzyMatchConfig,
    onProgress?: (done: number, total: number) => void,
  ): WorkerCall<FuzzyResolution> {
    return callWorker({ kind: 'matchFuzzy', leftRows, rightRows, config }, onProgress);
  },
};
