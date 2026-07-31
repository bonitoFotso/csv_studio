// Logique pure de synchronisation différentielle vers Dexie, extraite de workspace.tsx pour être
// testable sans React ni IndexedDB — l'app n'a pas d'infrastructure de test UI, mais cette logique
// n'a rien de spécifique à React et mérite un vrai test comme le reste du moteur.

export interface WorkspaceSyncState<T> {
  entries: Record<string, T>;
  order: string[];
}

export interface WorkspaceSyncDeps<T> {
  save: (entry: T, order: number) => void;
  remove: (id: string) => void;
}

/**
 * Détermine, par comparaison de référence contre `lastPersisted`, quelles entrées ont réellement
 * changé depuis la dernière écriture et appelle `save` uniquement pour celles-là (jamais tout
 * l'espace de travail à chaque frappe) ; appelle `remove` pour les entrées disparues depuis
 * `prevOrder`. Mute `lastPersisted` en place (tenu par l'appelant, un `useRef` côté React) et
 * renvoie le nouvel `order` à retenir comme `prevOrder` du prochain appel.
 */
export function syncWorkspaceEntries<T extends { id: string }>(
  state: WorkspaceSyncState<T>,
  prevOrder: string[],
  lastPersisted: Record<string, T | undefined>,
  deps: WorkspaceSyncDeps<T>,
): string[] {
  state.order.forEach((id, index) => {
    const entry = state.entries[id];
    if (!entry || lastPersisted[id] === entry) return;
    lastPersisted[id] = entry;
    deps.save(entry, index);
  });

  const removed = prevOrder.filter((id) => !state.order.includes(id));
  for (const id of removed) {
    delete lastPersisted[id];
    deps.remove(id);
  }

  return state.order;
}
