import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { GroupEditor } from '@/components/filters/GroupEditor.tsx';
import { evaluateGroup, type ConditionGroup } from '@csv-studio/core/engine/filterEngine.ts';
import { computeAllProfiles } from '@csv-studio/core/engine/profile.ts';
import { cloneTableWithRows } from '@csv-studio/core/engine/table.ts';
import { addStep, createOperation } from '@csv-studio/core/engine/pipeline.ts';
import type { FilterRowsParams } from '@csv-studio/core/engine/operations/filterRows.ts';
import type { SetValueWhereParams } from '@csv-studio/core/engine/operations/setValueWhere.ts';
import type { ColumnId, Pipeline, Table as EngineTable } from '@csv-studio/core/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';

type FilterAction = 'keep' | 'delete' | 'extract_to_new_table' | 'set_value_where';

const ACTION_LABELS: Record<FilterAction, string> = {
  keep: 'Garder les lignes qui correspondent',
  delete: 'Supprimer les lignes qui correspondent',
  extract_to_new_table: 'Extraire vers une nouvelle table',
  set_value_where: 'Définir une valeur sur une colonne',
};

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

  const [targetKind, setTargetKind] = React.useState<'new' | 'existing'>('new');
  const [newColumnName, setNewColumnName] = React.useState('');
  const [existingColumnId, setExistingColumnId] = React.useState<ColumnId>(table.columns[0]?.id ?? '');
  const [matchEnabled, setMatchEnabled] = React.useState(true);
  const [matchValue, setMatchValue] = React.useState('');
  const [nonMatchEnabled, setNonMatchEnabled] = React.useState(false);
  const [nonMatchValue, setNonMatchValue] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setRoot(emptyGroup());
      setAction('keep');
      setNewTableName(`${table.name} (filtré)`);
      setTargetKind('new');
      setNewColumnName('');
      setExistingColumnId(table.columns[0]?.id ?? '');
      setMatchEnabled(true);
      setMatchValue('');
      setNonMatchEnabled(false);
      setNonMatchValue('');
    }
  }, [open, table.name, table.columns]);

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

  const targetValid = targetKind === 'new' ? newColumnName.trim() !== '' : existingColumnId !== '';
  const valuesValid = matchEnabled || nonMatchEnabled;
  const setValueValid = hasConditions && targetValid && valuesValid;

  const targetLabel =
    targetKind === 'new' ? newColumnName.trim() || '(nouvelle colonne)' : table.columns.find((c) => c.id === existingColumnId)?.name ?? '';

  const description = !hasConditions
    ? 'Ajoutez au moins une condition.'
    : action === 'keep'
      ? `${matchCount.toLocaleString('fr-FR')} lignes seront gardées, ${(total - matchCount).toLocaleString('fr-FR')} seront supprimées de cette table.`
      : action === 'delete'
        ? `${matchCount.toLocaleString('fr-FR')} lignes seront supprimées, ${(total - matchCount).toLocaleString('fr-FR')} seront gardées.`
        : action === 'extract_to_new_table'
          ? `${matchCount.toLocaleString('fr-FR')} lignes seront copiées vers une nouvelle table « ${newTableName} ». Cette table-ci n'est pas modifiée.`
          : !targetValid
            ? targetKind === 'new'
              ? 'Donnez un nom à la nouvelle colonne.'
              : 'Choisissez une colonne existante.'
            : !valuesValid
              ? 'Cochez au moins une des deux valeurs ci-dessous.'
              : [
                  matchEnabled ? `${matchCount.toLocaleString('fr-FR')} ligne(s) qui correspondent recevront « ${matchValue} »` : null,
                  nonMatchEnabled
                    ? `${(total - matchCount).toLocaleString('fr-FR')} ligne(s) qui ne correspondent pas recevront « ${nonMatchValue} »`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ; ') + ` dans la colonne « ${targetLabel} ».`;

  const canSubmit = action === 'set_value_where' ? setValueValid : hasConditions;

  const submit = () => {
    if (!canSubmit) return;
    if (action === 'extract_to_new_table') {
      const rows = table.rows.filter((r) => evaluateGroup(r, root));
      importTable(cloneTableWithRows(table, newTableName.trim() || `${table.name} (filtré)`, rows));
    } else if (action === 'set_value_where') {
      const params: SetValueWhereParams = {
        root,
        target: targetKind === 'new' ? { kind: 'new', name: newColumnName.trim() } : { kind: 'existing', columnId: existingColumnId },
        matchValue: matchEnabled ? matchValue : undefined,
        nonMatchValue: nonMatchEnabled ? nonMatchValue : undefined,
      };
      setPipeline(entryId, addStep(pipeline, createOperation('set_value_where', params)));
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
          <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="text-text-muted">Action :</span>
            {(['keep', 'delete', 'extract_to_new_table', 'set_value_where'] as const).map((a) => (
              <label key={a} className="flex items-center gap-1">
                <input type="radio" name="filter-action" checked={action === a} onChange={() => setAction(a)} />
                {ACTION_LABELS[a]}
              </label>
            ))}
          </div>
          {action === 'extract_to_new_table' && (
            <Input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="Nom de la nouvelle table" />
          )}

          {action === 'set_value_where' && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-3 text-[12.5px]">
                <label className="flex items-center gap-1">
                  <input type="radio" name="svw-target" checked={targetKind === 'new'} onChange={() => setTargetKind('new')} />
                  Nouvelle colonne
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="svw-target"
                    checked={targetKind === 'existing'}
                    onChange={() => setTargetKind('existing')}
                    disabled={table.columns.length === 0}
                  />
                  Colonne existante
                </label>
              </div>
              {targetKind === 'new' ? (
                <Input value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="statut" autoFocus />
              ) : (
                <select
                  value={existingColumnId}
                  onChange={(e) => setExistingColumnId(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
                >
                  {table.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="space-y-2 border-t border-border pt-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={matchEnabled} onChange={(e) => setMatchEnabled(e.target.checked)} />
                  <label className="w-56 shrink-0 text-[12.5px] text-text-muted">Valeur pour les lignes qui correspondent</label>
                  <Input value={matchValue} onChange={(e) => setMatchValue(e.target.value)} disabled={!matchEnabled} placeholder="admis" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={nonMatchEnabled} onChange={(e) => setNonMatchEnabled(e.target.checked)} />
                  <label className="w-56 shrink-0 text-[12.5px] text-text-muted">Valeur pour les lignes qui ne correspondent pas</label>
                  <Input
                    value={nonMatchValue}
                    onChange={(e) => setNonMatchValue(e.target.value)}
                    disabled={!nonMatchEnabled}
                    placeholder="recalé"
                  />
                </div>
              </div>
            </div>
          )}

          <p className="text-[12px] font-medium text-destructive">{description}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
