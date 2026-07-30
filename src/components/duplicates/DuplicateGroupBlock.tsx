import { columnsThatDiffer } from '@/engine/dedupe.ts';
import type { DuplicateGroup } from '@/engine/dedupe.ts';
import type { Column } from '@/engine/types.ts';
import type { DedupAction } from '@/engine/operations/deduplicate.ts';
import { cn } from '@/lib/utils.ts';

export const ACTION_LABEL: Record<DedupAction, string> = {
  keep_first: 'Garder la première',
  keep_last: 'Garder la dernière',
  keep_most_complete: 'Garder la plus complète',
  merge_first_nonempty: 'Fusionner (1re valeur non vide)',
  flag_only: 'Marquer seulement',
};

export function DuplicateGroupBlock({
  index,
  group,
  columns,
  resolvedAction,
  overrideValue,
  onOverrideChange,
}: {
  index: number;
  group: DuplicateGroup;
  columns: Column[];
  resolvedAction: DedupAction;
  overrideValue: DedupAction | 'default';
  onOverrideChange: (value: DedupAction | 'default') => void;
}) {
  const differing = columnsThatDiffer(
    group.rows,
    columns.map((c) => c.id),
  );

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-alt px-2 py-1">
        <span className="text-[11.5px] font-medium text-text">
          Groupe {index + 1} · {group.rows.length} lignes
        </span>
        <select
          value={overrideValue}
          onChange={(e) => onOverrideChange(e.target.value as DedupAction | 'default')}
          className="h-6 rounded border border-border bg-surface px-1 text-[11px]"
          title="Action pour ce groupe uniquement"
        >
          <option value="default">Action par défaut ({ACTION_LABEL[resolvedAction]})</option>
          {(Object.keys(ACTION_LABEL) as DedupAction[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id} className="whitespace-nowrap border-b border-border px-2 py-1 text-left font-medium text-text-muted">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => {
                  const value = row.cells[c.id] ?? '';
                  const isDiff = differing.has(c.id);
                  return (
                    <td
                      key={c.id}
                      className={cn('cell-value whitespace-nowrap border-b border-border px-2 py-1', isDiff && 'bg-destructive-bg text-destructive')}
                    >
                      {value === '' ? <span className="cell-empty">vide</span> : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
