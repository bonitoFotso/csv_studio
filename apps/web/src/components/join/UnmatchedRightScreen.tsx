import * as React from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { Column, Row, RowId } from '@/engine/types.ts';
import { cn } from '@/lib/utils.ts';

const PAGE_SIZE = 30;
const LEFT_MATCH_CAP = 20;

function LeftRowPicker({ leftRows, leftColumns, onPick }: { leftRows: Row[]; leftColumns: Column[]; onPick: (row: Row) => void }) {
  const [query, setQuery] = React.useState('');

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Row[] = [];
    for (const row of leftRows) {
      if (out.length >= LEFT_MATCH_CAP) break;
      const hit = leftColumns.some((c) => (row.cells[c.id] ?? '').toLowerCase().includes(q));
      if (hit) out.push(row);
    }
    return out;
  }, [query, leftRows, leftColumns]);

  return (
    <div className="space-y-1.5">
      <Input
        autoFocus
        className="h-7"
        placeholder="Rechercher une ligne de gauche à apparier…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() === '' ? (
        <p className="text-[11px] text-text-faint">Tapez pour chercher parmi {leftRows.length.toLocaleString('fr-FR')} lignes.</p>
      ) : matches.length === 0 ? (
        <p className="text-[11px] text-text-faint">Aucune ligne ne correspond.</p>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {matches.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onPick(row)}
              className="flex w-full items-center gap-2 overflow-x-auto rounded px-1.5 py-1 text-left text-[11.5px] hover:bg-surface-alt"
            >
              {leftColumns.map((c) => (
                <span key={c.id} className="cell-value shrink-0 whitespace-nowrap">
                  {row.cells[c.id] || <span className="cell-empty">vide</span>}
                </span>
              ))}
            </button>
          ))}
          {matches.length >= LEFT_MATCH_CAP && <p className="px-1.5 text-[10.5px] text-text-faint">Résultats limités à {LEFT_MATCH_CAP} — affinez la recherche.</p>}
        </div>
      )}
    </div>
  );
}

function UnmatchedRightRowBlock({
  row,
  rightColumns,
  leftRows,
  leftColumns,
  expanded,
  onToggleExpand,
  onPick,
}: {
  row: Row;
  rightColumns: Column[];
  leftRows: Row[];
  leftColumns: Column[];
  expanded: boolean;
  onToggleExpand: () => void;
  onPick: (leftRow: Row) => void;
}) {
  return (
    <div className={cn('rounded-md border border-border', expanded && 'bg-surface-alt')}>
      <button type="button" onClick={onToggleExpand} className="flex w-full items-center gap-2 overflow-x-auto px-2 py-1.5 text-left text-[12px] hover:bg-surface-alt">
        {rightColumns.map((c) => (
          <span key={c.id} className="cell-value shrink-0 whitespace-nowrap">
            {row.cells[c.id] || <span className="cell-empty">vide</span>}
          </span>
        ))}
        <span className="ml-auto shrink-0 text-[11px] text-text-faint">{expanded ? 'fermer' : 'associer…'}</span>
      </button>
      {expanded && (
        <div className="border-t border-border p-2">
          <LeftRowPicker leftRows={leftRows} leftColumns={leftColumns} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

export function UnmatchedRightScreen({
  rows,
  rightColumns,
  leftRows,
  leftColumns,
  onForcePair,
  onExport,
  onBack,
}: {
  rows: Row[];
  rightColumns: Column[];
  leftRows: Row[];
  leftColumns: Column[];
  onForcePair: (leftRow: Row, rightRow: Row) => void;
  onExport: () => void;
  onBack: () => void;
}) {
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [expandedRowId, setExpandedRowId] = React.useState<RowId | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-muted">{rows.length.toLocaleString('fr-FR')} ligne(s) de droite jamais appariée(s)</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={onExport}>
            Exporter vers une nouvelle table
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Retour à la configuration
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-text-faint">Toutes les lignes de droite ont été appariées.</p>
      ) : (
        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">
          {rows.slice(0, visibleCount).map((row) => (
            <UnmatchedRightRowBlock
              key={row.id}
              row={row}
              rightColumns={rightColumns}
              leftRows={leftRows}
              leftColumns={leftColumns}
              expanded={expandedRowId === row.id}
              onToggleExpand={() => setExpandedRowId((cur) => (cur === row.id ? null : row.id))}
              onPick={(leftRow) => {
                onForcePair(leftRow, row);
                setExpandedRowId(null);
              }}
            />
          ))}
          {rows.length > visibleCount && (
            <Button variant="ghost" size="sm" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
              Afficher {Math.min(PAGE_SIZE, rows.length - visibleCount)} de plus ({rows.length - visibleCount} restantes)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
