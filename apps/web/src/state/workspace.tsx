import * as React from 'react';
import { createId } from '@csv-studio/core/engine/ids.ts';
import { createPipeline } from '@csv-studio/core/engine/pipeline.ts';
import type { OperationReport, Pipeline, Table } from '@csv-studio/core/engine/types.ts';
import { deleteWorkspaceEntry, loadWorkspace, saveActiveId, saveWorkspaceEntry, type StoredWorkspaceEntry } from '@/persistence/db.ts';
import { syncWorkspaceEntries } from '@/state/persistWorkspace.ts';
import { workerClient } from '@/worker/client.ts';

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

/** Écritures Dexie non débouncées : réécrire une table de 50 000 lignes à chaque frappe dans un dialogue rendrait l'UI perceptiblement saccadée. */
const PERSIST_DEBOUNCE_MS = 500;

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, { entries: {}, order: [], activeId: null });
  const [hydrated, setHydrated] = React.useState(false);
  const prevOrderRef = React.useRef<string[]>([]);
  /** Dernière version de chaque entrée réellement écrite (comparaison par référence) — permet de ne réécrire que ce qui a changé, jamais tout l'espace de travail à chaque frappe. */
  const lastPersistedRef = React.useRef<Record<string, WorkspaceEntry | undefined>>({});

  // Restaure l'espace de travail depuis IndexedDB au premier montage.
  React.useEffect(() => {
    void loadWorkspace().then(({ entries, activeId }) => {
      if (entries.length > 0) dispatch({ type: 'HYDRATE', entries, activeId });
      setHydrated(true);
    });
  }, []);

  // Persiste chaque table ouverte (et son pipeline) après hydratation, pour retrouver le travail
  // après fermeture de l'onglet. Débouncée (une frappe qui déclenche plusieurs dispatches
  // rapprochés ne réécrit qu'une fois, après une pause) et différentielle (seules les entrées dont
  // la référence a changé depuis la dernière écriture réelle sont réécrites, pas tout l'espace de
  // travail à chaque dispatch). Un vidage immédiat (non débouncé) a lieu à la fermeture de l'onglet
  // pour ne jamais perdre la dernière modification si elle tombe dans la fenêtre de la debounce.
  React.useEffect(() => {
    if (!hydrated) return;
    const entries = state.entries;
    const order = state.order;

    const flush = () => {
      prevOrderRef.current = syncWorkspaceEntries({ entries, order }, prevOrderRef.current, lastPersistedRef.current, {
        save: (entry, entryOrder) => void saveWorkspaceEntry({ ...entry, order: entryOrder, updatedAt: Date.now() }),
        remove: (id) => void deleteWorkspaceEntry(id),
      });
    };

    const timer = window.setTimeout(flush, PERSIST_DEBOUNCE_MS);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
    };
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

interface CachedReplay {
  sourceTable: Table;
  pipeline: Pipeline;
  auxiliaryTables: Record<string, Table>;
  table: Table;
  reportsByIndex: Map<number, OperationReport>;
}

/**
 * Table active + son pipeline + la table affichée (rejouée jusqu'au curseur).
 * Le rejeu tourne dans un Worker (voir `src/worker/`) pour ne jamais geler l'UI sur une grosse table.
 * On garde le dernier résultat connu par onglet : changer d'onglet ou rouvrir un onglet déjà calculé
 * ne redéclenche pas de calcul tant que son pipeline n'a pas changé (comparaison par référence).
 */
export function useActiveTable() {
  const { state } = useWorkspaceContext();
  const entry = state.activeId ? state.entries[state.activeId] : null;

  const cacheRef = React.useRef(new Map<string, CachedReplay>());
  const [, forceRender] = React.useReducer((c: number) => c + 1, 0);
  const [recalculating, setRecalculating] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  React.useEffect(() => {
    if (!entry) return;
    const cached = cacheRef.current.get(entry.id);
    const stillValid = cached && cached.sourceTable === entry.sourceTable && cached.pipeline === entry.pipeline && cached.auxiliaryTables === entry.auxiliaryTables;
    if (stillValid) return;

    setRecalculating(true);
    setProgress(null);

    const call = workerClient.replay(entry.sourceTable, entry.pipeline.steps, entry.pipeline.cursor, {
      auxiliaryTables: Object.values(entry.auxiliaryTables),
      onStepProgress: (done, total) => setProgress({ done, total }),
    });

    call.promise
      .then((result) => {
        cacheRef.current.set(entry.id, {
          sourceTable: entry.sourceTable,
          pipeline: entry.pipeline,
          auxiliaryTables: entry.auxiliaryTables,
          table: result.table,
          reportsByIndex: result.reportsByIndex,
        });
        setRecalculating(false);
        setProgress(null);
        forceRender();
      })
      .catch((err) => {
        console.error('Échec du rejeu du pipeline', err);
        setRecalculating(false);
        setProgress(null);
      });

    return () => call.cancel();
  }, [entry]);

  if (!entry) return null;
  const cached = cacheRef.current.get(entry.id);
  if (!cached) return null; // premier calcul de cet onglet, pas encore de résultat à afficher

  return {
    entry,
    displayTable: cached.table,
    reportsByIndex: cached.reportsByIndex,
    recalculating,
    progress,
  };
}
