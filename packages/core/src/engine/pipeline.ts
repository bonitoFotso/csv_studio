import { createId } from './ids.ts';
import type { Operation, OperationType, Pipeline, PipelineStep } from './types.ts';

export function createPipeline(sourceTableId: string): Pipeline {
  return { id: createId(), sourceTableId, steps: [], cursor: 0 };
}

export function createOperation<P>(type: OperationType, params: P, label?: string): Operation<P> {
  return { id: createId(), type, params, enabled: true, label };
}

/**
 * Ajoute une étape à la position du curseur. Si le curseur n'est pas en bout de liste
 * (l'utilisateur a fait "undo" avant d'ajouter), les étapes au-delà sont tronquées :
 * pas d'historique en arbre, une seule ligne de temps linéaire.
 */
export function addStep(pipeline: Pipeline, operation: Operation): Pipeline {
  const kept = pipeline.steps.slice(0, pipeline.cursor);
  const steps: PipelineStep[] = [...kept, { operation }];
  return { ...pipeline, steps, cursor: steps.length };
}

export function updateStepParams(pipeline: Pipeline, stepId: string, params: unknown): Pipeline {
  const steps = pipeline.steps.map((s) => (s.operation.id === stepId ? { operation: { ...s.operation, params } } : s));
  return { ...pipeline, steps };
}

export function setStepEnabled(pipeline: Pipeline, stepId: string, enabled: boolean): Pipeline {
  const steps = pipeline.steps.map((s) => (s.operation.id === stepId ? { operation: { ...s.operation, enabled } } : s));
  return { ...pipeline, steps };
}

export function removeStep(pipeline: Pipeline, stepId: string): Pipeline {
  const index = pipeline.steps.findIndex((s) => s.operation.id === stepId);
  if (index === -1) return pipeline;
  const steps = pipeline.steps.filter((s) => s.operation.id !== stepId);
  const cursor = index < pipeline.cursor ? pipeline.cursor - 1 : Math.min(pipeline.cursor, steps.length);
  return { ...pipeline, steps, cursor };
}

/** Applique un rapport calculé par `replay` sur les steps correspondants (mutation contrôlée, hors chemin undo/redo). */
export function withReports(pipeline: Pipeline, reportsByIndex: Map<number, import('./types.ts').OperationReport>): Pipeline {
  const steps = pipeline.steps.map((s, i) => ({ ...s, report: reportsByIndex.get(i) }));
  return { ...pipeline, steps };
}

export function canUndo(pipeline: Pipeline): boolean {
  return pipeline.cursor > 0;
}

export function canRedo(pipeline: Pipeline): boolean {
  return pipeline.cursor < pipeline.steps.length;
}

export function undo(pipeline: Pipeline): Pipeline {
  return { ...pipeline, cursor: Math.max(0, pipeline.cursor - 1) };
}

export function redo(pipeline: Pipeline): Pipeline {
  return { ...pipeline, cursor: Math.min(pipeline.steps.length, pipeline.cursor + 1) };
}

export function moveCursor(pipeline: Pipeline, cursor: number): Pipeline {
  return { ...pipeline, cursor: Math.max(0, Math.min(cursor, pipeline.steps.length)) };
}
