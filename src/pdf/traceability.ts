import { operationLabel } from '../lib/report.ts';
import type { OperationReport, Pipeline, Table } from '../engine/types.ts';

export interface TraceabilitySourceFile {
  name: string;
  rowCount: number;
}

export interface TraceabilityStep {
  index: number;
  label: string;
  enabled: boolean;
  rowsIn: number;
  rowsOut: number;
  unmatched?: number;
  ambiguous?: number;
}

export interface ReportTraceability {
  generatedAt: string;
  sourceFiles: TraceabilitySourceFile[];
  recipeName?: string;
  steps: TraceabilityStep[];
  totalAutoMatched: number;
  totalManualMatched: number;
  totalUnmatched: number;
  /** Empreinte courte (non cryptographique) du pipeline, pour la traçabilité condensée du mode officiel. */
  pipelineFingerprint: string;
}

/** Hash non cryptographique (djb2) — juste une empreinte lisible et stable, pas une garantie d'intégrité. */
function shortFingerprint(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Construit le bloc de traçabilité à partir des structures déjà existantes du moteur (Pipeline,
 * OperationReport) — pas de modèle parallèle. Les décomptes appariements auto/manuel/non-appariés
 * sont lus directement dans les rapports d'étape `enrich_join` déjà produits par `replay()`.
 */
export function buildTraceability(
  sourceTable: Table,
  auxiliaryTables: Table[],
  pipeline: Pipeline,
  reportsByIndex: Map<number, OperationReport>,
  recipeName?: string,
): ReportTraceability {
  const sourceFiles: TraceabilitySourceFile[] = [
    { name: sourceTable.name, rowCount: sourceTable.rows.length },
    ...auxiliaryTables.map((t) => ({ name: t.name, rowCount: t.rows.length })),
  ];

  let totalAutoMatched = 0;
  let totalManualMatched = 0;
  let totalUnmatched = 0;

  const steps: TraceabilityStep[] = pipeline.steps.map((step, i) => {
    const report = reportsByIndex.get(i);
    if (report?.matchedAuto !== undefined) totalAutoMatched += report.matchedAuto;
    if (report?.matchedManual !== undefined) totalManualMatched += report.matchedManual;
    if (report?.unmatched) totalUnmatched += report.unmatched;
    return {
      index: i,
      label: step.operation.label ?? operationLabel(step.operation.type),
      enabled: step.operation.enabled,
      rowsIn: report?.rowsIn ?? 0,
      rowsOut: report?.rowsOut ?? 0,
      unmatched: report?.unmatched,
      ambiguous: report?.ambiguous,
    };
  });

  const fingerprintInput = pipeline.steps.map((s) => `${s.operation.type}:${JSON.stringify(s.operation.params)}`).join('|');

  return {
    generatedAt: new Date().toISOString(),
    sourceFiles,
    recipeName,
    steps,
    totalAutoMatched,
    totalManualMatched,
    totalUnmatched,
    pipelineFingerprint: shortFingerprint(fingerprintInput),
  };
}
