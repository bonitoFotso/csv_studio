import { getOperationDefinition } from './registry.ts';
import type { ApplyContext, OperationReport, PipelineStep, Table } from './types.ts';

export interface ReplayResult {
  table: Table;
  /** Rapport par index de step réellement exécuté (steps désactivés ou au-delà du curseur en sont absents). */
  reportsByIndex: Map<number, OperationReport>;
}

export interface ReplayOptions {
  /** Tables auxiliaires disponibles (fichier de droite d'un enrich_join), indexées par id. */
  auxiliaryTables?: Table[];
  /** Appelé après chaque étape effectivement exécutée (progression grossière, par étape — pas par ligne). */
  onStepProgress?: (done: number, total: number) => void;
}

export function createApplyContext(options: ReplayOptions): ApplyContext {
  const tablesById = new Map((options.auxiliaryTables ?? []).map((t) => [t.id, t]));
  const seqCounters = new Map<string, number>();

  return {
    getTableById(id: string): Table {
      const t = tablesById.get(id);
      if (!t) throw new Error(`Table auxiliaire introuvable: ${id}`);
      return t;
    },
    sequenceCounter(seed: string, start: number, step: number): number {
      const current = seqCounters.get(seed) ?? start;
      seqCounters.set(seed, current + step);
      return current;
    },
  };
}

/**
 * Calcule l'état de la table AVANT chaque étape (index 0 = sourceTable), en respectant
 * la règle "seules les étapes enabled font avancer l'état". Utilisé pour la sérialisation
 * Recipe : `toPortable` d'une étape a besoin de connaître les colonnes telles qu'elles
 * existaient juste avant cette étape, y compris quand l'étape est désactivée.
 */
export function computeStepTableStates(sourceTable: Table, steps: PipelineStep[], options: ReplayOptions = {}): Table[] {
  const ctx = createApplyContext(options);
  const states: Table[] = [sourceTable];
  let table = sourceTable;
  for (const step of steps) {
    if (step.operation.enabled) {
      const def = getOperationDefinition(step.operation.type);
      table = def.apply(table, step.operation.params, ctx).table;
    }
    states.push(table);
  }
  return states;
}

/**
 * Rejoue le pipeline depuis la table source jusqu'à `cursor` (exclu au-delà),
 * en n'appliquant que les steps `enabled`. Toujours recalculé depuis zéro :
 * pas d'état intermédiaire caché, ce qui garantit que désactiver/modifier/supprimer
 * une étape au milieu du pipeline produit un résultat cohérent.
 */
export function replay(sourceTable: Table, steps: PipelineStep[], cursor: number, options: ReplayOptions = {}): ReplayResult {
  const ctx = createApplyContext(options);
  let table = sourceTable;
  const reportsByIndex = new Map<number, OperationReport>();

  const limit = Math.max(0, Math.min(cursor, steps.length));

  for (let i = 0; i < limit; i++) {
    const step = steps[i];
    if (!step.operation.enabled) {
      options.onStepProgress?.(i + 1, limit);
      continue;
    }
    const def = getOperationDefinition(step.operation.type);
    const { table: nextTable, report } = def.apply(table, step.operation.params, ctx);
    table = nextTable;
    reportsByIndex.set(i, report);
    options.onStepProgress?.(i + 1, limit);
  }

  return { table, reportsByIndex };
}
