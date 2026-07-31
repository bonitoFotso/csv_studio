import Dexie, { type EntityTable } from 'dexie';
import type { Pipeline, Recipe, Table } from '@csv-studio/core/engine/types.ts';

export interface StoredWorkspaceEntry {
  id: string;
  displayName: string;
  sourceTable: Table;
  pipeline: Pipeline;
  auxiliaryTables: Record<string, Table>;
  order: number;
  updatedAt: number;
}

export interface StoredMeta {
  key: string;
  value: string | null;
}

export interface StoredRecipe {
  id: string;
  name: string;
  createdAt: string;
  recipe: Recipe;
}

const db = new Dexie('csv-studio') as Dexie & {
  workspaceEntries: EntityTable<StoredWorkspaceEntry, 'id'>;
  meta: EntityTable<StoredMeta, 'key'>;
  recipes: EntityTable<StoredRecipe, 'id'>;
};

db.version(1).stores({
  workspaceEntries: 'id, order',
  meta: 'key',
  recipes: 'id, name',
});

export async function loadWorkspace(): Promise<{ entries: StoredWorkspaceEntry[]; activeId: string | null }> {
  const entries = await db.workspaceEntries.orderBy('order').toArray();
  const activeMeta = await db.meta.get('activeId');
  return { entries, activeId: activeMeta?.value ?? null };
}

export async function saveWorkspaceEntry(entry: StoredWorkspaceEntry): Promise<void> {
  await db.workspaceEntries.put(entry);
}

export async function deleteWorkspaceEntry(id: string): Promise<void> {
  await db.workspaceEntries.delete(id);
}

export async function saveActiveId(id: string | null): Promise<void> {
  await db.meta.put({ key: 'activeId', value: id });
}

export async function listRecipes(): Promise<StoredRecipe[]> {
  return db.recipes.orderBy('name').toArray();
}

export async function saveRecipe(stored: StoredRecipe): Promise<void> {
  await db.recipes.put(stored);
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id);
}
