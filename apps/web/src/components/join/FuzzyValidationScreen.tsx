import * as React from 'react';
import { Check, SkipForward, X } from 'lucide-react';
import type { PendingFuzzyPair } from '@/engine/fuzzyJoin.ts';
import type { Column } from '@/engine/types.ts';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

function decisionKey(pair: PendingFuzzyPair): string {
  return `${pair.leftKeyNormalized}${pair.rightKeyNormalized}`;
}

function RowTable({ title, columns, otherColumns, cells }: { title: string; columns: Column[]; otherColumns: Column[]; cells: Record<string, string> }) {
  const otherNames = new Set(otherColumns.map((c) => c.name));
  return (
    <div className="flex-1 overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-surface-alt px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
      <div className="max-h-72 overflow-y-auto">
        {columns.map((c) => {
          const value = cells[c.id] ?? '';
          const comparable = otherNames.has(c.name);
          return (
            <div key={c.id} className={cn('flex items-baseline gap-2 border-b border-border px-2 py-1 text-[12px] last:border-b-0')}>
              <span className="w-28 shrink-0 truncate text-text-muted">{c.name}</span>
              <span className={cn('cell-value truncate', comparable && 'font-medium')}>
                {value === '' ? <span className="cell-empty">vide</span> : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FuzzyValidationScreen({
  pairs,
  initialCount,
  leftColumns,
  rightColumns,
  onValidate,
  onReject,
  onBack,
}: {
  pairs: PendingFuzzyPair[];
  initialCount: number;
  leftColumns: Column[];
  rightColumns: Column[];
  onValidate: (pair: PendingFuzzyPair) => void;
  onReject: (pair: PendingFuzzyPair) => void;
  onBack: () => void;
}) {
  const [skipped, setSkipped] = React.useState<Set<string>>(new Set());

  const remaining = pairs.filter((p) => !skipped.has(decisionKey(p)));
  const current = remaining[0] ?? null;
  const doneCount = initialCount - pairs.length;

  const validate = React.useCallback(() => {
    if (current) onValidate(current);
  }, [current, onValidate]);

  const reject = React.useCallback(() => {
    if (current) onReject(current);
  }, [current, onReject]);

  const skip = React.useCallback(() => {
    if (current) setSkipped((prev) => new Set(prev).add(decisionKey(current)));
  }, [current]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter' || e.key.toLowerCase() === 'v') {
        e.preventDefault();
        validate();
      } else if (e.key === 'Backspace' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reject();
      } else if (e.key === ' ' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [validate, reject, skip]);

  if (!current) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-[13px] text-text">
          {skipped.size > 0
            ? `${skipped.size} paire(s) passée(s) restent à traiter — revenez plus tard ou rouvrez cet écran.`
            : 'Toutes les paires en attente ont été traitées.'}
        </p>
        <Button variant="outline" onClick={onBack}>
          Retour à la configuration
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-muted">
          {doneCount + 1} / {initialCount} · score <span className="cell-value font-semibold text-text">{current.score}</span>/100
        </span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Retour à la configuration
        </Button>
      </div>

      <div className="flex gap-3">
        <RowTable title="Gauche (table active)" columns={leftColumns} otherColumns={rightColumns} cells={current.leftRow.cells} />
        <RowTable title="Droite (second fichier)" columns={rightColumns} otherColumns={leftColumns} cells={current.rightRow.cells} />
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-border pt-3">
        <Button variant="destructive" onClick={reject}>
          <X size={14} /> Rejeter <span className="text-[10px] opacity-70">(R)</span>
        </Button>
        <Button variant="outline" onClick={skip}>
          <SkipForward size={14} /> Passer <span className="text-[10px] opacity-70">(Espace)</span>
        </Button>
        <Button onClick={validate}>
          <Check size={14} /> Valider <span className="text-[10px] opacity-70">(Entrée)</span>
        </Button>
      </div>
    </div>
  );
}
