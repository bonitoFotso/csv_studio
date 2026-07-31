import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import type { DedupMode } from '@csv-studio/core/engine/dedupe.ts';
import { addStep, createOperation } from '@csv-studio/core/engine/pipeline.ts';
import { cloneTableWithRows } from '@csv-studio/core/engine/table.ts';
import type { DeduplicateParams, DedupAction } from '@csv-studio/core/engine/operations/deduplicate.ts';
import type { ColumnId, Pipeline, Table as EngineTable } from '@csv-studio/core/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { useWorkerCall } from '@/hooks/useWorkerCall.ts';
import { workerClient } from '@/worker/client.ts';
import { DuplicateGroupBlock, ACTION_LABEL } from '@/components/duplicates/DuplicateGroupBlock.tsx';

const PAGE_SIZE = 30;

export function DuplicatesDialog({
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
  const [keyColumnIds, setKeyColumnIds] = React.useState<Set<ColumnId>>(new Set());
  const [mode, setMode] = React.useState<DedupMode>('normalized');
  const [defaultAction, setDefaultAction] = React.useState<DedupAction>('keep_most_complete');
  const [flagColumnName, setFlagColumnName] = React.useState('_doublon');
  const [overrides, setOverrides] = React.useState<Map<string, DedupAction>>(new Map());
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  React.useEffect(() => {
    if (open) {
      setKeyColumnIds(new Set());
      setMode('normalized');
      setDefaultAction('keep_most_complete');
      setFlagColumnName('_doublon');
      setOverrides(new Map());
      setVisibleCount(PAGE_SIZE);
    }
  }, [open]);

  const { data: groupsResult, loading: groupsLoading } = useWorkerCall(
    () => (keyColumnIds.size === 0 ? null : workerClient.computeDuplicateGroups(table, [...keyColumnIds], mode)),
    [table, keyColumnIds, mode],
  );
  const groups = groupsResult ?? [];

  const totalDuplicateRows = groups.reduce((sum, g) => sum + g.rows.length, 0);

  const resolvedAction = (groupKey: string): DedupAction => overrides.get(groupKey) ?? defaultAction;

  const estimatedRemoved = groups.reduce((sum, g) => {
    const action = resolvedAction(g.key);
    return sum + (action === 'flag_only' ? 0 : g.rows.length - 1);
  }, 0);

  const toggleKeyColumn = (id: ColumnId) => {
    setKeyColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOverrides(new Map());
  };

  const setOverride = (groupKey: string, value: DedupAction | 'default') => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (value === 'default') next.delete(groupKey);
      else next.set(groupKey, value);
      return next;
    });
  };

  const apply = () => {
    if (groups.length === 0) return;
    const params: DeduplicateParams = {
      keyColumnIds: [...keyColumnIds],
      mode,
      action: defaultAction,
      flagColumnName: defaultAction === 'flag_only' || overrides.size > 0 ? flagColumnName : undefined,
      groupOverrides: overrides.size > 0 ? [...overrides.entries()].map(([groupKey, action]) => ({ groupKey, action })) : undefined,
    };
    setPipeline(entryId, addStep(pipeline, createOperation('deduplicate', params)));
    onOpenChange(false);
  };

  const exportDuplicates = () => {
    const rows = groups.flatMap((g) => g.rows);
    importTable(cloneTableWithRows(table, `${table.name} (doublons)`, rows));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Doublons</DialogTitle>
        </DialogHeader>

        <div className="mb-3 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes-clés</label>
            <div className="flex flex-wrap gap-2">
              {table.columns.map((c) => (
                <label key={c.id} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[12px]">
                  <Checkbox checked={keyColumnIds.has(c.id)} onChange={() => toggleKeyColumn(c.id)} />
                  <span className="cell-value">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[12.5px]">
            <span className="text-text-muted">Comparaison :</span>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'exact'} onChange={() => setMode('exact')} /> Exacte
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'normalized'} onChange={() => setMode('normalized')} /> Normalisée (casse, accents, espaces)
            </label>
          </div>
        </div>

        {keyColumnIds.size === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-text-faint">Choisissez au moins une colonne-clé pour détecter les doublons.</p>
        ) : groupsLoading && groups.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-text-faint">Calcul des groupes en cours…</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-text-faint">Aucun doublon détecté sur ces colonnes.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-alt px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <span className="text-text-muted">Action par défaut :</span>
                {(Object.keys(ACTION_LABEL) as DedupAction[]).map((a) => (
                  <label key={a} className="flex items-center gap-1">
                    <input type="radio" checked={defaultAction === a} onChange={() => setDefaultAction(a)} />
                    {ACTION_LABEL[a]}
                  </label>
                ))}
              </div>
              {defaultAction === 'flag_only' && (
                <Input className="h-7 w-40" value={flagColumnName} onChange={(e) => setFlagColumnName(e.target.value)} placeholder="_doublon" />
              )}
            </div>

            <p className="mb-2 text-[12.5px] font-medium text-destructive">
              {groups.length} groupe(s) de doublons, {totalDuplicateRows} lignes concernées sur {table.rows.length} — {estimatedRemoved} ligne(s) seraient
              supprimées avec les actions actuelles.
              {groupsLoading && <span className="ml-2 font-normal text-text-faint">(recalcul en cours…)</span>}
            </p>

            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {groups.slice(0, visibleCount).map((group, i) => (
                <DuplicateGroupBlock
                  key={group.key}
                  index={i}
                  group={group}
                  columns={table.columns}
                  resolvedAction={resolvedAction(group.key)}
                  overrideValue={overrides.get(group.key) ?? 'default'}
                  onOverrideChange={(value) => setOverride(group.key, value)}
                />
              ))}
              {groups.length > visibleCount && (
                <Button variant="ghost" size="sm" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                  Afficher {Math.min(PAGE_SIZE, groups.length - visibleCount)} groupe(s) de plus ({groups.length - visibleCount} restants)
                </Button>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {groups.length > 0 && (
            <Button variant="outline" onClick={exportDuplicates}>
              Exporter les doublons
            </Button>
          )}
          <Button disabled={groups.length === 0} onClick={apply}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
