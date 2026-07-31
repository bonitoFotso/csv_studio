import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { GroupEditor } from '@/components/filters/GroupEditor.tsx';
import { evaluateGroup, type ConditionGroup } from '@/engine/filterEngine.ts';
import { computeAllProfiles } from '@/engine/profile.ts';
import { cloneTableWithRows } from '@/engine/table.ts';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import type { FilterRowsParams } from '@/engine/operations/filterRows.ts';
import type { Pipeline, Table as EngineTable } from '@/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';

type FilterAction = 'keep' | 'delete' | 'extract_to_new_table';

function emptyGroup(): ConditionGroup {
  return { kind: 'group', operator: 'and', conditions: [] };
}

export function FilterBuilderDialog({
  entryId,
  table,
  pipeline,
  open,
  onOpenChange,
}: {
  entryId: string;
  table: EngineTable;
  pipeline: Pipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setPipeline, importTable } = useWorkspace();
  const [root, setRoot] = React.useState<ConditionGroup>(emptyGroup());
  const [action, setAction] = React.useState<FilterAction>('keep');
  const [newTableName, setNewTableName] = React.useState(`${table.name} (filtré)`);

  React.useEffect(() => {
    if (open) {
      setRoot(emptyGroup());
      setAction('keep');
      setNewTableName(`${table.name} (filtré)`);
    }
  }, [open, table.name]);

  const typeByColumn = React.useMemo(() => {
    const profiles = computeAllProfiles(table);
    return new Map(profiles.map((p) => [p.columnId, p.detectedType]));
  }, [table]);

  const matchCount = React.useMemo(() => {
    if (root.conditions.length === 0) return table.rows.length;
    return table.rows.filter((r) => evaluateGroup(r, root)).length;
  }, [table.rows, root]);

  const total = table.rows.length;
  const hasConditions = root.conditions.length > 0;

  const description = !hasConditions
    ? 'Ajoutez au moins une condition.'
    : action === 'keep'
      ? `${matchCount.toLocaleString('fr-FR')} lignes seront gardées, ${(total - matchCount).toLocaleString('fr-FR')} seront supprimées de cette table.`
      : action === 'delete'
        ? `${matchCount.toLocaleString('fr-FR')} lignes seront supprimées, ${(total - matchCount).toLocaleString('fr-FR')} seront gardées.`
        : `${matchCount.toLocaleString('fr-FR')} lignes seront copiées vers une nouvelle table « ${newTableName} ». Cette table-ci n'est pas modifiée.`;

  const submit = () => {
    if (!hasConditions) return;
    if (action === 'extract_to_new_table') {
      const rows = table.rows.filter((r) => evaluateGroup(r, root));
      importTable(cloneTableWithRows(table, newTableName.trim() || `${table.name} (filtré)`, rows));
    } else {
      const params: FilterRowsParams = { root, action };
      setPipeline(entryId, addStep(pipeline, createOperation('filter_rows', params)));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Filtrer les lignes</DialogTitle>
        </DialogHeader>

        <GroupEditor group={root} columns={table.columns} typeByColumn={typeByColumn} onChange={setRoot} />

        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-3 text-[12.5px]">
            <span className="text-text-muted">Action :</span>
            {(['keep', 'delete', 'extract_to_new_table'] as const).map((a) => (
              <label key={a} className="flex items-center gap-1">
                <input type="radio" name="filter-action" checked={action === a} onChange={() => setAction(a)} />
                {a === 'keep' ? 'Garder les lignes qui correspondent' : a === 'delete' ? 'Supprimer les lignes qui correspondent' : 'Extraire vers une nouvelle table'}
              </label>
            ))}
          </div>
          {action === 'extract_to_new_table' && (
            <Input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="Nom de la nouvelle table" />
          )}
          <p className="text-[12px] font-medium text-destructive">{description}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!hasConditions} onClick={submit}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
