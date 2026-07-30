import * as React from 'react';
import { computeAllProfiles, type AnomalyKind, type DetectedType } from '@/engine/profile.ts';
import type { Table as EngineTable } from '@/engine/types.ts';
import { Badge } from '@/components/ui/badge.tsx';

const TYPE_LABEL: Record<DetectedType, string> = {
  empty: 'vide',
  integer: 'entier',
  decimal: 'décimal',
  date: 'date',
  boolean: 'booléen',
  text: 'texte',
};

const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  leading_trailing_space: 'espaces en trop',
  multiple_spaces: 'espaces multiples',
  inconsistent_case: 'casse incohérente',
  mojibake: 'encodage cassé',
};

export function ColumnProfilePanel({ table }: { table: EngineTable }) {
  const profiles = React.useMemo(() => computeAllProfiles(table), [table]);
  const columnsById = React.useMemo(() => new Map(table.columns.map((c) => [c.id, c])), [table.columns]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Profil des colonnes
      </div>
      <div className="divide-y divide-border">
        {profiles.map((profile) => {
          const column = columnsById.get(profile.columnId);
          if (!column) return null;
          const fillPct = Math.round(profile.fillRate * 100);
          return (
            <div key={profile.columnId} className="px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="cell-value truncate text-[12.5px] font-medium text-text" title={column.name}>
                  {column.name}
                </span>
                <Badge variant="neutral">{TYPE_LABEL[profile.detectedType]}</Badge>
              </div>

              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className={fillPct < 50 ? 'h-full rounded-full bg-destructive' : 'h-full rounded-full bg-validated'}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <span className="whitespace-nowrap text-[11px] text-text-muted">{fillPct}% rempli</span>
              </div>

              <div className="mb-1.5 text-[11px] text-text-muted">
                {profile.distinctCount.toLocaleString('fr-FR')} valeurs distinctes
              </div>

              {profile.topValues.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {profile.topValues.map((tv) => (
                    <span
                      key={tv.value}
                      className="cell-value truncate rounded bg-surface-alt px-1.5 py-0.5 text-[11px] text-text-muted"
                      title={`${tv.value} (${tv.count})`}
                    >
                      {tv.value || 'vide'} · {tv.count}
                    </span>
                  ))}
                </div>
              )}

              {profile.anomalies.length > 0 && (
                <div className="space-y-1">
                  {profile.anomalies.map((a) => (
                    <div key={a.kind} className="flex flex-wrap items-center gap-1 text-[11px]">
                      <Badge variant="destructive">{ANOMALY_LABEL[a.kind]}</Badge>
                      <span className="cell-value truncate text-text-faint">{a.examples.join(' · ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
