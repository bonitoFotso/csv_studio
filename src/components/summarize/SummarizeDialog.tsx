import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import type { KeyNormalization } from '@/engine/keyNormalize.ts';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import { computeSummarizeTable } from '@/engine/operations/summarize.ts';
import type { AggFn, AggregateSpec, BinningMode, GroupByColumn, SummarizeParams } from '@/engine/operations/summarize.ts';
import type { ColumnId, Pipeline, Table as EngineTable } from '@/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';

const NORMALIZATION_LABEL: Record<KeyNormalization, string> = { none: 'brute', text: 'texte', date: 'date' };

const AGG_FN_LABEL: Record<AggFn, string> = {
  count: 'compter les lignes',
  countDistinct: 'compter les valeurs distinctes',
  countNonEmpty: 'compter les valeurs non vides',
  sum: 'somme',
  avg: 'moyenne',
  min: 'minimum',
  max: 'maximum',
  median: 'médiane',
  first: 'première valeur',
  concat: 'concaténer',
};

interface UiGroupBy extends GroupByColumn {
  binningEnabled: boolean;
  binMode: BinningMode['kind'];
  binWidth: string;
  binStart: string;
  binCount: string;
  binBoundaries: string;
}

interface UiAggregate {
  fn: AggFn;
  columnId: ColumnId;
  asName: string;
  separator: string;
}

function newGroupBy(columnId: ColumnId): UiGroupBy {
  return { columnId, normalization: 'none', binningEnabled: false, binMode: 'fixed_width', binWidth: '10', binStart: '', binCount: '4', binBoundaries: '' };
}

function newAggregate(columnId: ColumnId): UiAggregate {
  return { fn: 'count', columnId, asName: 'effectif', separator: ', ' };
}

function parseBoundaries(text: string): number[] {
  return text
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

function toBinningMode(g: UiGroupBy): BinningMode | undefined {
  if (!g.binningEnabled) return undefined;
  if (g.binMode === 'fixed_width') {
    const width = Number(g.binWidth);
    if (!Number.isFinite(width) || width <= 0) return undefined;
    const start = g.binStart.trim() === '' ? undefined : Number(g.binStart);
    return { kind: 'fixed_width', width, start };
  }
  if (g.binMode === 'fixed_count') {
    const count = Number(g.binCount);
    if (!Number.isFinite(count) || count <= 0) return undefined;
    return { kind: 'fixed_count', count };
  }
  const boundaries = parseBoundaries(g.binBoundaries);
  if (boundaries.length < 2) return undefined;
  return { kind: 'explicit_boundaries', boundaries };
}

function toGroupByParam(g: UiGroupBy): GroupByColumn {
  return { columnId: g.columnId, normalization: g.normalization, binning: toBinningMode(g) };
}

function toAggregateParam(a: UiAggregate): AggregateSpec {
  return {
    fn: a.fn,
    asName: a.asName.trim() || a.fn,
    columnId: a.fn === 'count' ? undefined : a.columnId,
    separator: a.fn === 'concat' ? a.separator : undefined,
  };
}

export function SummarizeDialog({
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
  const { setPipeline } = useWorkspace();
  const [groupBy, setGroupBy] = React.useState<UiGroupBy[]>([]);
  const [aggregates, setAggregates] = React.useState<UiAggregate[]>([{ ...newAggregate(table.columns[0]?.id ?? ''), fn: 'count' }]);

  React.useEffect(() => {
    if (open) {
      setGroupBy(table.columns[0] ? [newGroupBy(table.columns[0].id)] : []);
      setAggregates([{ ...newAggregate(table.columns[0]?.id ?? ''), fn: 'count' }]);
    }
  }, [open, table.columns]);

  const params: SummarizeParams = {
    groupBy: groupBy.map(toGroupByParam),
    aggregates: aggregates.map(toAggregateParam),
  };

  const canApply = groupBy.length > 0 && aggregates.length > 0 && aggregates.every((a) => a.asName.trim() !== '');

  const preview = React.useMemo(() => {
    if (!canApply) return null;
    try {
      return computeSummarizeTable(table, params);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, canApply, JSON.stringify(params)]);

  const apply = () => {
    if (!canApply) return;
    setPipeline(entryId, addStep(pipeline, createOperation('summarize', params)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Résumer (regrouper / agréger)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Regrouper par</label>
            <div className="space-y-2">
              {groupBy.map((g, i) => (
                <div key={i} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={g.columnId}
                      onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, columnId: e.target.value } : x)))}
                      className="h-7 flex-1 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                    >
                      {table.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={g.normalization}
                      onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, normalization: e.target.value as KeyNormalization } : x)))}
                      className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                      title="Normalisation appliquée avant de regrouper"
                    >
                      {(Object.keys(NORMALIZATION_LABEL) as KeyNormalization[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {NORMALIZATION_LABEL[mode]}
                        </option>
                      ))}
                    </select>
                    {groupBy.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setGroupBy((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>

                  <label className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
                    <Checkbox
                      checked={g.binningEnabled}
                      onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binningEnabled: e.target.checked } : x)))}
                    />
                    Découper en tranches (colonne numérique)
                  </label>

                  {g.binningEnabled && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5 text-[11.5px]">
                      <select
                        value={g.binMode}
                        onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binMode: e.target.value as BinningMode['kind'] } : x)))}
                        className="h-6 rounded border border-border bg-surface px-1 text-[11px]"
                      >
                        <option value="fixed_width">largeur fixe</option>
                        <option value="fixed_count">nombre de tranches</option>
                        <option value="explicit_boundaries">bornes explicites</option>
                      </select>
                      {g.binMode === 'fixed_width' && (
                        <>
                          <span>largeur</span>
                          <Input
                            className="h-6 w-16"
                            value={g.binWidth}
                            onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binWidth: e.target.value } : x)))}
                          />
                          <span>départ (optionnel)</span>
                          <Input
                            className="h-6 w-16"
                            placeholder="min"
                            value={g.binStart}
                            onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binStart: e.target.value } : x)))}
                          />
                        </>
                      )}
                      {g.binMode === 'fixed_count' && (
                        <>
                          <span>nombre de tranches</span>
                          <Input
                            className="h-6 w-16"
                            value={g.binCount}
                            onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binCount: e.target.value } : x)))}
                          />
                        </>
                      )}
                      {g.binMode === 'explicit_boundaries' && (
                        <>
                          <span>bornes (séparées par des virgules)</span>
                          <Input
                            className="h-6 w-56"
                            placeholder="0, 10, 12, 14, 16, 20"
                            value={g.binBoundaries}
                            onChange={(e) => setGroupBy((prev) => prev.map((x, idx) => (idx === i ? { ...x, binBoundaries: e.target.value } : x)))}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setGroupBy((prev) => [...prev, newGroupBy(table.columns[0]?.id ?? '')])}>
                <Plus size={12} /> Colonne de regroupement
              </Button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Agrégats</label>
            <div className="space-y-1.5">
              {aggregates.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={a.fn}
                    onChange={(e) => setAggregates((prev) => prev.map((x, idx) => (idx === i ? { ...x, fn: e.target.value as AggFn } : x)))}
                    className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                  >
                    {(Object.keys(AGG_FN_LABEL) as AggFn[]).map((fn) => (
                      <option key={fn} value={fn}>
                        {AGG_FN_LABEL[fn]}
                      </option>
                    ))}
                  </select>
                  {a.fn !== 'count' && (
                    <select
                      value={a.columnId}
                      onChange={(e) => setAggregates((prev) => prev.map((x, idx) => (idx === i ? { ...x, columnId: e.target.value } : x)))}
                      className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                    >
                      {table.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {a.fn === 'concat' && (
                    <Input
                      className="h-7 w-20"
                      placeholder="séparateur"
                      value={a.separator}
                      onChange={(e) => setAggregates((prev) => prev.map((x, idx) => (idx === i ? { ...x, separator: e.target.value } : x)))}
                    />
                  )}
                  <span className="text-[11px] text-text-faint">nommé</span>
                  <Input
                    className="h-7 w-32"
                    value={a.asName}
                    onChange={(e) => setAggregates((prev) => prev.map((x, idx) => (idx === i ? { ...x, asName: e.target.value } : x)))}
                  />
                  {aggregates.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setAggregates((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setAggregates((prev) => [...prev, newAggregate(table.columns[0]?.id ?? '')])}>
                <Plus size={12} /> Agrégat
              </Button>
            </div>
          </div>

          {preview && (
            <div className="rounded-md border border-border bg-surface-alt px-2.5 py-2 text-[12px]">
              <p className="mb-1.5 font-medium text-text">
                Aperçu : {preview.rows.length} groupe(s) depuis {table.rows.length.toLocaleString('fr-FR')} ligne(s).
              </p>
              <div className="max-h-48 overflow-auto rounded border border-border">
                <table className="w-full border-collapse text-[11px]">
                  <thead className="sticky top-0 bg-surface-alt">
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c.id} className="border-b border-r border-border px-1.5 py-1 text-left font-medium text-text-muted last:border-r-0">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 12).map((r) => (
                      <tr key={r.id}>
                        {preview.columns.map((c) => (
                          <td key={c.id} className="cell-value border-b border-r border-border px-1.5 py-0.5 last:border-r-0">
                            {r.cells[c.id] || <span className="cell-empty">vide</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 12 && <p className="mt-1 text-[10.5px] text-text-faint">… et {preview.rows.length - 12} groupe(s) de plus.</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!canApply} onClick={apply}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
