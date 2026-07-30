export function BusyIndicator({ progress, label }: { progress?: { done: number; total: number } | null; label?: string }) {
  const determinate = !!progress && progress.total > 0;
  const pct = determinate ? Math.round((progress!.done / progress!.total) * 100) : null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-alt px-3 py-1 text-[11px] text-text-muted">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        {determinate ? (
          <div className="h-full rounded-full bg-text transition-[width]" style={{ width: `${pct}%` }} />
        ) : (
          <div className="absolute inset-y-0 w-1/3 animate-[busy-slide_1.2s_ease-in-out_infinite] rounded-full bg-text" />
        )}
      </div>
      <span className="whitespace-nowrap">{label ?? (determinate ? `${pct}%` : 'Calcul en cours…')}</span>
    </div>
  );
}
