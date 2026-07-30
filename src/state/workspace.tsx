import * as React from 'react';
import { createId } from '@/engine/ids.ts';
import { createPipeline } from '@/engine/pipeline.ts';
import { replay } from '@/engine/replay.ts';
import type { Pipeline, Table } from '@/engine/types.ts';
import { deleteWorkspaceEntry, loadWorkspace, saveActiveId, saveWorkspaceEntry, type StoredWorkspaceEntry } from '@/persistence/db.ts';

export interface WorkspaceEntry {
  id: string;
  displayName: string;
  sourceTable: Table;
  pipeline: Pipeline;
  /** Fichiers de droite importés pour un rapprochement (enrich_join), indexés par leur propre Table.id. */
  auxiliaryTables: Record<string, Table>;
}

interface WorkspaceState {
  entries: Record<string, WorkspaceEntry>;
  order: string[];
  activeId: string | null;
}

type Action =
  | { type: 'IMPORT_TABLE'; table: Table }
  | { type: 'RENAME_TABLE'; id: string; name: string }
  | { type: 'CLOSE_TABLE'; id: string }
  | { type: 'SET_ACTIVE'; id: string }
  | { type: 'SET_PIPELINE'; id: string; pipeline: Pipeline }
  | { type: 'SET_AUXILIARY_TABLE'; id: string; table: Table }
  | { type: 'HYDRATE'; entries: StoredWorkspaceEntry[]; activeId: string | null };

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'HYDRATE': {
      const sorted = [...action.entries].sort((a, b) => a.order - b.order);
      const entries: Record<string, WorkspaceEntry> = {};
      for (const stored of sorted) {
        entries[stored.id] = {
          id: stored.id,
          displayName: stored.displayName,
          sourceTable: stored.sourceTable,
          pipeline: stored.pipeline,
          auxiliaryTables: stored.auxiliaryTables,
        };
      }
      const order = sorted.map((s) => s.id);
      const activeId = action.activeId && entries[action.activeId] ? action.activeId : (order[order.length - 1] ?? null);
      return { entries, order, activeId };
    }
    case 'IMPORT_TABLE': {
      const id = createId();
      const entry: WorkspaceEntry = {
        id,
        displayName: action.table.name,
        sourceTable: action.table,
        pipeline: createPipeline(action.table.id),
        auxiliaryTables: {},
      };
      return {
        entries: { ...state.entries, [id]: entry },
        order: [...state.order, id],
        activeId: id,
      };
    }
    case 'RENAME_TABLE': {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return { ...state, entries: { ...state.entries, [action.id]: { ...entry, displayName: action.name } } };
    }
    case 'CLOSE_TABLE': {
      const { [action.id]: _removed, ...rest } = state.entries;
      const order = state.order.filter((id) => id !== action.id);
      const activeId = state.activeId === action.id ? (order[order.length - 1] ?? null) : state.activeId;
      return { entries: rest, order, activeId };
    }
    case 'SET_ACTIVE':
      return state.entries[action.id] ? { ...state, activeId: action.id } : state;
    case 'SET_PIPELINE': {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return { ...state, entries: { ...state.entries, [action.id]: { ...entry, pipeline: action.pipeline } } };
    }
    case 'SET_AUXILIARY_TABLE': {
      const entry = state.entries[action.id];
      if (!entry) return state;
      return {
        ...state,
        entries: { ...state.entries, [action.id]: { ...entry, auxiliaryTables: { ...entry.auxiliaryTables, [action.table.id]: action.table } } },
      };
    }
  }
}

const WorkspaceContext = React.createContext<{ state: WorkspaceState; dispatch: React.Dispatch<Action> } | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, { entries: {}, order: [], activeId: null });
  const [hydrated, setHydrated] = React.useState(false);
  const prevOrderRef = React.useRef<string[]>([]);

  // Restaure l'espace de travail depuis IndexedDB au premier montage.
  React.useEffect(() => {
    void loadWorkspace().then(({ entries, activeId }) => {
      if (entries.length > 0) dispatch({ type: 'HYDRATE', entries, activeId });
      setHydrated(true);
    });
  }, []);

  // Persiste chaque table ouverte (et son pipeline) après hydratation, pour retrouver le travail après fermeture de l'onglet.
  React.useEffect(() => {
    if (!hydrated) return;
    state.order.forEach((id, index) => {
      const entry = state.entries[id];
      if (!entry) return;
      void saveWorkspaceEntry({ ...entry, order: index, updatedAt: Date.now() });
    });
    const removed = prevOrderRef.current.filter((id) => !state.order.includes(id));
    for (const id of removed) void deleteWorkspaceEntry(id);
    prevOrderRef.current = state.order;
  }, [hydrated, state.entries, state.order]);

  React.useEffect(() => {
    if (!hydrated) return;
    void saveActiveId(state.activeId);
  }, [hydrated, state.activeId]);

  const value = React.useMemo(() => ({ state, dispatch }), [state]);

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center text-[13px] text-text-muted">Chargement de l'espace de travail…</div>;
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function useWorkspaceContext() {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return ctx;
}

export function useWorkspace() {
  const { state, dispatch } = useWorkspaceContext();

  return {
    tables: state.order.map((id) => state.entries[id]),
    activeId: state.activeId,
    importTable: (table: Table) => dispatch({ type: 'IMPORT_TABLE', table }),
    renameTable: (id: string, name: string) => dispatch({ type: 'RENAME_TABLE', id, name }),
    closeTable: (id: string) => dispatch({ type: 'CLOSE_TABLE', id }),
    setActive: (id: string) => dispatch({ type: 'SET_ACTIVE', id }),
    setPipeline: (id: string, pipeline: Pipeline) => dispatch({ type: 'SET_PIPELINE', id, pipeline }),
    setAuxiliaryTable: (id: string, table: Table) => dispatch({ type: 'SET_AUXILIARY_TABLE', id, table }),
  };
}

/** Table active + son pipeline + la table affichée (rejouée jusqu'au curseur). Recalculée à chaque changement de pipeline. */
export function useActiveTable() {
  const { state } = useWorkspaceContext();
  const entry = state.activeId ? state.entries[state.activeId] : null;

  const displayResult = React.useMemo(() => {
    if (!entry) return null;
    return replay(entry.sourceTable, entry.pipeline.steps, entry.pipeline.cursor, {
      auxiliaryTables: Object.values(entry.auxiliaryTables),
    });
  }, [entry]);

  if (!entry || !displayResult) return null;

  return {
    entry,
    displayTable: displayResult.table,
    reportsByIndex: displayResult.reportsByIndex,
  };
}
