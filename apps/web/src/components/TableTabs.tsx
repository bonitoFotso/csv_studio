import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { useWorkspace, type WorkspaceEntry } from '@/state/workspace.tsx';
import { cn } from '@/lib/utils.ts';

function Tab({ entry, active, onSelect }: { entry: WorkspaceEntry; active: boolean; onSelect: () => void }) {
  const { setActive, closeTable, renameTable } = useWorkspace();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(entry.displayName);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== entry.displayName) renameTable(entry.id, trimmed);
    else setDraft(entry.displayName);
  };

  return (
    <div
      onClick={() => {
        setActive(entry.id);
        onSelect();
      }}
      className={cn(
        'group flex max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 py-1.5 text-[12.5px]',
        active ? 'bg-surface text-text' : 'bg-bg text-text-muted hover:bg-surface-alt',
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(entry.displayName);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-28 rounded border border-border bg-surface px-1 text-[12.5px] outline-none"
        />
      ) : (
        <span
          className="truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title={entry.displayName}
        >
          {entry.displayName}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          closeTable(entry.id);
        }}
        className="ml-auto shrink-0 rounded p-0.5 text-text-faint opacity-0 hover:bg-surface-alt group-hover:opacity-100"
        title="Fermer"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function TableTabs({ onOpenImport, onSelectTab }: { onOpenImport: () => void; onSelectTab: () => void }) {
  const { tables, activeId } = useWorkspace();

  return (
    <div className="flex items-stretch overflow-x-auto border-b border-border bg-bg">
      {tables.map((entry) => (
        <Tab key={entry.id} entry={entry} active={entry.id === activeId} onSelect={onSelectTab} />
      ))}
      <button
        onClick={onOpenImport}
        className="flex shrink-0 items-center gap-1 px-3 py-1.5 text-[12.5px] text-text-muted hover:bg-surface-alt"
        title="Importer une table"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
