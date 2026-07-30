import { registerAllOperations } from '@/engine/operations/index.ts';
import { replay } from '@/engine/replay.ts';
import { computeDuplicateGroups } from '@/engine/dedupe.ts';
import { matchRowsExact } from '@/engine/join.ts';
import { resolveFuzzyMatchesChunked } from '@/engine/fuzzyJoin.ts';
import { CancelledError, type CancelToken } from '@/engine/asyncUtils.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

registerAllOperations();

// On évite `/// <reference lib="webworker">` : ce fichier est compilé dans le même programme TS
// que le reste de l'app (lib DOM), et les deux libs déclarent `self` différemment (conflit global).
// On passe donc par un cast minimal plutôt que par une redéclaration globale.
const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const cancelTokens = new Map<string, CancelToken>();

function post(message: WorkerResponse): void {
  ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.kind === 'cancel') {
    const token = cancelTokens.get(msg.requestId);
    if (token) token.aborted = true;
    return;
  }

  try {
    switch (msg.kind) {
      case 'replay': {
        const result = replay(msg.sourceTable, msg.steps, msg.cursor, {
          auxiliaryTables: msg.auxiliaryTables,
          onStepProgress: (done, total) => post({ kind: 'progress', requestId: msg.requestId, done, total }),
        });
        post({ kind: 'replayResult', requestId: msg.requestId, result });
        break;
      }
      case 'dedupe': {
        const result = computeDuplicateGroups(msg.table, msg.keyColumnIds, msg.mode);
        post({ kind: 'dedupeResult', requestId: msg.requestId, result });
        break;
      }
      case 'matchExact': {
        const result = matchRowsExact(msg.leftRows, msg.rightRows, msg.keyPairs);
        post({ kind: 'matchExactResult', requestId: msg.requestId, result });
        break;
      }
      case 'matchFuzzy': {
        const cancelToken: CancelToken = { aborted: false };
        cancelTokens.set(msg.requestId, cancelToken);
        try {
          const result = await resolveFuzzyMatchesChunked(msg.leftRows, msg.rightRows, msg.config, {
            cancelToken,
            onProgress: (done, total) => post({ kind: 'progress', requestId: msg.requestId, done, total }),
          });
          post({ kind: 'matchFuzzyResult', requestId: msg.requestId, result });
        } finally {
          cancelTokens.delete(msg.requestId);
        }
        break;
      }
    }
  } catch (err) {
    if (err instanceof CancelledError) {
      post({ kind: 'cancelled', requestId: msg.requestId });
    } else {
      post({ kind: 'error', requestId: msg.requestId, message: err instanceof Error ? err.message : String(err) });
    }
  }
};
