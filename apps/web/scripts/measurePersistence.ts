// Mesure de l'optimisation "écritures Dexie débouncées et différentielles" (phase 7) : compare le
// nombre d'écritures et le volume sérialisé entre l'ancien comportement (une écriture complète de
// tous les onglets ouverts à chaque dispatch) et le nouveau (`syncWorkspaceEntries`, débouncé côté
// React, différentiel). Exécuter avec `bun run apps/web/scripts/measurePersistence.ts`.
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';
import { createPipeline } from '@csv-studio/core/engine/pipeline.ts';
import { syncWorkspaceEntries } from '../src/state/persistWorkspace.ts';

interface Entry {
  id: string;
  displayName: string;
  sourceTable: ReturnType<typeof createTableFromRows>;
  pipeline: ReturnType<typeof createPipeline>;
  auxiliaryTables: Record<string, never>;
}

const ROWS = 50_000;
const COLUMNS = 25;
const OPEN_TABS = 3;
const EDITS_ON_ACTIVE_TAB = 10; // ex. 10 changements rapprochés de paramètres dans un dialogue

function buildBigTable(name: string) {
  const columnNames = Array.from({ length: COLUMNS }, (_, i) => `col_${i}`);
  const rows = Array.from({ length: ROWS }, (_, r) => {
    const row: Record<string, string> = {};
    for (const c of columnNames) row[c] = `${name}-${r}-${c}`;
    return row;
  });
  return createTableFromRows(name, columnNames, rows);
}

function buildEntry(id: string): Entry {
  const table = buildBigTable(id);
  return { id, displayName: id, sourceTable: table, pipeline: createPipeline(table.id), auxiliaryTables: {} };
}

const entries: Record<string, Entry> = {};
for (let i = 0; i < OPEN_TABS; i++) {
  const id = `tab${i}`;
  entries[id] = buildEntry(id);
}
const order = Object.keys(entries);
const activeId = order[0];

function byteSize(entry: Entry, atOrder: number): number {
  return Buffer.byteLength(JSON.stringify({ ...entry, order: atOrder, updatedAt: Date.now() }), 'utf-8');
}

// --- Ancien comportement : un dispatch = state.entries change de référence = tout réécrire -------
let oldWrites = 0;
let oldBytes = 0;
for (let edit = 0; edit < EDITS_ON_ACTIVE_TAB; edit++) {
  // Simule le reducer : seule l'entrée active change de référence (nouveau pipeline), les autres
  // gardent la même référence d'un dispatch à l'autre — mais l'ancien code les réécrivait quand même.
  entries[activeId] = { ...entries[activeId], pipeline: createPipeline(entries[activeId].sourceTable.id) };
  order.forEach((id, index) => {
    oldWrites++;
    oldBytes += byteSize(entries[id], index);
  });
}

// --- Nouveau comportement : mêmes 10 modifications, mais la debounce React ne déclenche qu'un
// seul flush une fois les modifications terminées, et syncWorkspaceEntries ne réécrit que ce qui a
// changé depuis le DERNIER flush réel (pas depuis le dispatch précédent) -------------------------
const lastPersisted: Record<string, Entry | undefined> = {};
// Un premier flush initial (ouverture des 3 onglets) — équivalent des deux comportements, ignoré du comparatif d'édition.
syncWorkspaceEntries({ entries, order }, [], lastPersisted, { save: () => {}, remove: () => {} });

let newWrites = 0;
let newBytes = 0;
for (let edit = 0; edit < EDITS_ON_ACTIVE_TAB; edit++) {
  entries[activeId] = { ...entries[activeId], pipeline: createPipeline(entries[activeId].sourceTable.id) };
  // Les 10 modifications tombent dans la même fenêtre de debounce (500 ms) : un seul flush après la dernière.
}
syncWorkspaceEntries({ entries, order }, order, lastPersisted, {
  save: (entry, index) => {
    newWrites++;
    newBytes += byteSize(entry, index);
  },
  remove: () => {},
});

const fmtMB = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} Mo`;

console.log(`Table de mesure : ${ROWS.toLocaleString('fr-FR')} lignes × ${COLUMNS} colonnes, ${OPEN_TABS} onglets ouverts, ${EDITS_ON_ACTIVE_TAB} modifications rapprochées sur un seul onglet.\n`);
console.log('Avant (écriture complète à chaque dispatch, sans debounce ni différentiel) :');
console.log(`  ${oldWrites} écriture(s) Dexie déclenchée(s), ${fmtMB(oldBytes)} sérialisés au total.\n`);
console.log('Après (debounce 500 ms + syncWorkspaceEntries différentiel) :');
console.log(`  ${newWrites} écriture(s) Dexie déclenchée(s), ${fmtMB(newBytes)} sérialisés au total.\n`);
console.log(`Réduction : ${oldWrites} → ${newWrites} écritures (${((1 - newWrites / oldWrites) * 100).toFixed(0)} %), ${fmtMB(oldBytes)} → ${fmtMB(newBytes)} sérialisés (${((1 - newBytes / oldBytes) * 100).toFixed(0)} %).`);
