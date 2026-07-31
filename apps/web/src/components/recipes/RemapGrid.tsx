import type { ColumnMapping } from '@/engine/types.ts';

export function RemapGrid({
  expectedColumns,
  actualNames,
  mapping,
  onChange,
}: {
  expectedColumns: string[];
  actualNames: string[];
  mapping: ColumnMapping;
  onChange: (expected: string, actual: string | null) => void;
}) {
  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      {expectedColumns.map((expected) => {
        const resolved = mapping[expected] ?? null;
        return (
          <div key={expected} className="flex items-center gap-2 text-[12px]">
            <span className="w-40 shrink-0 truncate text-text-muted" title={expected}>
              {expected}
            </span>
            <span className="text-text-faint">→</span>
            <select
              value={resolved ?? ''}
              onChange={(e) => onChange(expected, e.target.value || null)}
              className={`h-7 flex-1 rounded-md border bg-surface px-1.5 text-[12px] ${resolved ? 'border-border' : 'border-destructive text-destructive'}`}
            >
              <option value="">— non mappé —</option>
              {actualNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
