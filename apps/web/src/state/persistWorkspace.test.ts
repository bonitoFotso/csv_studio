import { describe, expect, it } from 'vitest';
import { syncWorkspaceEntries } from './persistWorkspace.ts';

interface Entry {
  id: string;
  value: string;
}

describe('syncWorkspaceEntries', () => {
  it("écrit chaque entrée la première fois qu'elle est vue", () => {
    const saved: Entry[] = [];
    const state = { entries: { a: { id: 'a', value: '1' }, b: { id: 'b', value: '1' } }, order: ['a', 'b'] };
    const lastPersisted: Record<string, Entry | undefined> = {};

    syncWorkspaceEntries(state, [], lastPersisted, { save: (e) => saved.push(e), remove: () => {} });

    expect(saved.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it("ne réécrit pas une entrée dont la référence n'a pas changé (différentiel)", () => {
    const entryA = { id: 'a', value: '1' };
    const state = { entries: { a: entryA }, order: ['a'] };
    const lastPersisted: Record<string, Entry | undefined> = { a: entryA }; // déjà écrite telle quelle

    const saved: Entry[] = [];
    syncWorkspaceEntries(state, ['a'], lastPersisted, { save: (e) => saved.push(e), remove: () => {} });

    expect(saved).toHaveLength(0);
  });

  it("ne réécrit QUE l'entrée qui a changé parmi plusieurs onglets ouverts (pas tout l'espace de travail)", () => {
    const entryA = { id: 'a', value: '1' };
    const entryB = { id: 'b', value: '1' };
    const lastPersisted: Record<string, Entry | undefined> = { a: entryA, b: entryB };

    // Seul b change de référence (ex. un dispatch qui ne touche que la table b) ; a reste identique.
    const entryBv2 = { id: 'b', value: '2' };
    const state = { entries: { a: entryA, b: entryBv2 }, order: ['a', 'b'] };

    const saved: Entry[] = [];
    syncWorkspaceEntries(state, ['a', 'b'], lastPersisted, { save: (e) => saved.push(e), remove: () => {} });

    expect(saved).toEqual([entryBv2]);
  });

  it('appelle remove pour les entrées disparues depuis prevOrder', () => {
    const state = { entries: {}, order: [] };
    const removed: string[] = [];
    syncWorkspaceEntries(state, ['a', 'b'], {}, { save: () => {}, remove: (id) => removed.push(id) });
    expect(removed).toEqual(['a', 'b']);
  });

  it('nettoie lastPersisted pour une entrée supprimée (une réouverture ultérieure du même id réécrit)', () => {
    const entryA = { id: 'a', value: '1' };
    const lastPersisted: Record<string, Entry | undefined> = { a: entryA };
    syncWorkspaceEntries({ entries: {}, order: [] }, ['a'], lastPersisted, { save: () => {}, remove: () => {} });
    expect(lastPersisted.a).toBeUndefined();
  });

  it("renvoie le nouvel order pour servir de prevOrder au prochain appel", () => {
    const state = { entries: { a: { id: 'a', value: '1' } }, order: ['a'] };
    const result = syncWorkspaceEntries(state, [], {}, { save: () => {}, remove: () => {} });
    expect(result).toBe(state.order);
  });

  it('passe le bon index (position dans order) à save', () => {
    const state = {
      entries: { a: { id: 'a', value: '1' }, b: { id: 'b', value: '1' } },
      order: ['a', 'b'],
    };
    const savedOrders: number[] = [];
    syncWorkspaceEntries(state, [], {}, { save: (_e, order) => savedOrders.push(order), remove: () => {} });
    expect(savedOrders).toEqual([0, 1]);
  });
});
