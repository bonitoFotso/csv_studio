import { profileCsvTool } from './profileCsv.ts';
import { previewPipelineTool } from './previewPipeline.ts';
import { applyPipelineTool } from './applyPipeline.ts';
import { matchFilesTool } from './matchFiles.ts';
import { findDuplicatesTool } from './findDuplicates.ts';
import { buildReportTool } from './buildReport.ts';
import type { ToolDefinition } from './types.ts';

/**
 * Un petit jeu d'outils cohérent (six), pas une fonction par opération du moteur — un modèle qui
 * voit trente outils les confond (prompt-2, phase 3).
 */
export const ALL_TOOLS: ToolDefinition[] = [
  profileCsvTool,
  previewPipelineTool,
  applyPipelineTool,
  matchFilesTool,
  findDuplicatesTool,
  buildReportTool,
];

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
