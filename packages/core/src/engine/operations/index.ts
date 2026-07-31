import { registerOperation } from '../registry.ts';
import { addConcatColumnDefinition } from './addConcatColumn.ts';
import { appendRowsDefinition } from './appendRows.ts';
import { addConstantColumnDefinition } from './addConstantColumn.ts';
import { addExpressionColumnDefinition } from './addExpressionColumn.ts';
import { addExtractColumnDefinition } from './addExtractColumn.ts';
import { addSequenceColumnDefinition } from './addSequenceColumn.ts';
import { deduplicateDefinition } from './deduplicate.ts';
import { dropColumnsDefinition } from './dropColumns.ts';
import { enrichJoinDefinition } from './enrichJoin.ts';
import { duplicateColumnDefinition } from './duplicateColumn.ts';
import { filterRowsDefinition } from './filterRows.ts';
import { hideColumnsDefinition } from './hideColumns.ts';
import { normalizeColumnsDefinition } from './normalizeColumns.ts';
import { renameColumnsDefinition } from './renameColumns.ts';
import { reorderColumnsDefinition } from './reorderColumns.ts';
import { summarizeDefinition } from './summarize.ts';

let registered = false;

/** Enregistre toutes les opérations connues du moteur. Idempotent. */
export function registerAllOperations(): void {
  if (registered) return;
  registered = true;
  registerOperation(renameColumnsDefinition);
  registerOperation(reorderColumnsDefinition);
  registerOperation(dropColumnsDefinition);
  registerOperation(hideColumnsDefinition);
  registerOperation(duplicateColumnDefinition);
  registerOperation(addConstantColumnDefinition);
  registerOperation(addConcatColumnDefinition);
  registerOperation(addExtractColumnDefinition);
  registerOperation(addSequenceColumnDefinition);
  registerOperation(addExpressionColumnDefinition);
  registerOperation(normalizeColumnsDefinition);
  registerOperation(filterRowsDefinition);
  registerOperation(deduplicateDefinition);
  registerOperation(enrichJoinDefinition);
  registerOperation(appendRowsDefinition);
  registerOperation(summarizeDefinition);
}
