import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { EnrichJoinParams } from './enrichJoin.ts';
import { resolveFuzzyMatches } from '../fuzzyJoin.ts';
import type { ApplyContext, Table } from '../types.ts';

beforeAll(() => registerAllOperations());

function makeContext(rightTable: Table): ApplyContext {
  return {
    getTableById: (id: string) => {
      if (id !== rightTable.id) throw new Error('table introuvable');
      return rightTable;
    },
    sequenceCounter: () => 0,
  };
}

function leftTable() {
  return createTableFromRows('candidats', ['id', 'nom'], [{ id: '1', nom: 'Fotso' }, { id: '2', nom: 'Kamga' }, { id: '3', nom: 'Ngo' }]);
}

function rightTableSingle() {
  return createTableFromRows('presence', ['ref', 'nb_presences'], [{ ref: '1', nb_presences: '10' }, { ref: '2', nb_presences: '8' }]);
}

describe('enrich_join (exact)', () => {
  it('jointure gauche : garde toutes les lignes de gauche, colonnes copiées vides si non apparié', () => {
    const left = leftTable();
    const right = rightTableSingle();
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    const { table: out, report } = def.apply(left, params, makeContext(right));
    expect(out.rows).toHaveLength(3);
    const col = out.columns.find((c) => c.name === 'nb_presences')!;
    expect(out.rows.map((r) => r.cells[col.id])).toEqual(['10', '8', '']);
    expect(report.unmatched).toBe(1);
    expect(report.ambiguous).toBe(0);
    // Décomptes structurés pour la traçabilité PDF (jamais reconstruits depuis `notes`).
    expect(report.matchedAuto).toBe(2);
    expect(report.matchedManual).toBe(0);
  });

  it('jointure inner : ne garde que les lignes appariées', () => {
    const left = leftTable();
    const right = rightTableSingle();
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'inner',
      multiMatch: 'first',
    };
    const { table: out, report } = def.apply(left, params, makeContext(right));
    expect(out.rows).toHaveLength(2);
    expect(report.rowsRemoved).toBe(1);
  });

  it('collision de noms résolue par suffixe', () => {
    const left = createTableFromRows('t', ['id', 'note'], [{ id: '1', note: 'A' }]);
    const right = createTableFromRows('t2', ['ref', 'note'], [{ ref: '1', note: 'B' }]);
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'note'), asName: 'note' }],
      collision: 'suffix',
      collisionText: '_droite',
      joinType: 'left',
      multiMatch: 'first',
    };
    const { table: out } = def.apply(left, params, makeContext(right));
    expect(out.columns.map((c) => c.name)).toEqual(['id', 'note', 'note_droite']);
    const newCol = out.columns.find((c) => c.name === 'note_droite')!;
    expect(out.rows[0].cells[newCol.id]).toBe('B');
  });

  it('1->N avec agrégation somme', () => {
    const left = createTableFromRows('t', ['id'], [{ id: '1' }]);
    const right = createTableFromRows('t2', ['ref', 'montant'], [{ ref: '1', montant: '10' }, { ref: '1', montant: '5' }]);
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'montant'), asName: 'montant' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'aggregate',
      aggregate: [{ rightColumnId: getColumnId(right, 'montant'), fn: 'sum' }],
    };
    const { table: out, report } = def.apply(left, params, makeContext(right));
    const col = out.columns.find((c) => c.name === 'montant')!;
    expect(out.rows[0].cells[col.id]).toBe('15');
    expect(report.ambiguous).toBe(1);
  });

  it('1->N avec flag_conflict laisse la valeur vide', () => {
    const left = createTableFromRows('t', ['id'], [{ id: '1' }]);
    const right = createTableFromRows('t2', ['ref', 'montant'], [{ ref: '1', montant: '10' }, { ref: '1', montant: '5' }]);
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'montant'), asName: 'montant' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'flag_conflict',
    };
    const { table: out } = def.apply(left, params, makeContext(right));
    const col = out.columns.find((c) => c.name === 'montant')!;
    expect(out.rows[0].cells[col.id]).toBe('');
  });

  it('stratégie floue : apparie malgré nom/prénom inversés, via le blocage par année', () => {
    const left = createTableFromRows('candidats', ['nom_complet', 'annee'], [{ nom_complet: 'FOTSO BONITO', annee: '1998' }]);
    const right = createTableFromRows(
      'presence',
      ['nom_complet', 'annee', 'nb_presences'],
      [{ nom_complet: 'Bonito Fotso', annee: '1998', nb_presences: '12' }],
    );
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [],
      matchStrategy: 'fuzzy',
      fuzzy: {
        leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
        rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
        blockingPairs: [{ leftColumnId: getColumnId(left, 'annee'), rightColumnId: getColumnId(right, 'annee') }],
        tokenized: true,
        thresholdHigh: 90,
        thresholdLow: 60,
        manualDecisions: [],
      },
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    const { table: out, report } = def.apply(left, params, makeContext(right));
    const col = out.columns.find((c) => c.name === 'nb_presences')!;
    expect(out.rows[0].cells[col.id]).toBe('12');
    expect(report.unmatched).toBe(0);
  });

  it('stratégie floue : une décision manuelle validée est reprise directement dans apply()', () => {
    const left = createTableFromRows('candidats', ['nom_complet', 'annee'], [{ nom_complet: 'Alice Kamga', annee: '2000' }]);
    const right = createTableFromRows(
      'presence',
      ['nom_complet', 'annee', 'nb_presences'],
      [{ nom_complet: 'Alicia Kamgaa', annee: '2000', nb_presences: '7' }],
    );
    const def = getOperationDefinition('enrich_join');
    const baseFuzzy = {
      leftKeyColumnIds: [getColumnId(left, 'nom_complet')],
      rightKeyColumnIds: [getColumnId(right, 'nom_complet')],
      blockingPairs: [{ leftColumnId: getColumnId(left, 'annee'), rightColumnId: getColumnId(right, 'annee') }],
      tokenized: true,
      thresholdHigh: 99,
      thresholdLow: 10,
      manualDecisions: [],
    };
    const paramsWithoutDecision: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [],
      matchStrategy: 'fuzzy',
      fuzzy: baseFuzzy,
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    const before = def.apply(left, paramsWithoutDecision, makeContext(right));
    expect(before.report.ambiguous).toBe(1); // en attente de validation

    const resolution = resolveFuzzyMatches(left.rows, right.rows, baseFuzzy);
    const pending = resolution.pending[0];

    const paramsWithDecision: EnrichJoinParams = {
      ...paramsWithoutDecision,
      fuzzy: { ...baseFuzzy, manualDecisions: [{ leftKeyNormalized: pending.leftKeyNormalized, rightKeyNormalized: pending.rightKeyNormalized, decision: 'validated' }] },
    };
    const after = def.apply(left, paramsWithDecision, makeContext(right));
    const col = after.table.columns.find((c) => c.name === 'nb_presences')!;
    expect(after.table.rows[0].cells[col.id]).toBe('7');
    expect(after.report.ambiguous).toBe(0);
    expect(after.report.matchedAuto).toBe(0);
    expect(after.report.matchedManual).toBe(1);
  });

  it('toPortable/rebind : round-trip exact avec un second fichier', () => {
    const left = leftTable();
    const right = rightTableSingle();
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      collisionText: '_droite',
      joinType: 'left',
      multiMatch: 'first',
    };
    const portable = def.toPortable(params, left, makeContext(right));
    expect(portable.columnNames).toEqual(['id']);
    expect(portable.secondary).toEqual({ tableName: 'presence', columnNames: ['ref', 'nb_presences'] });

    // Simule un rejeu : même table de gauche, second fichier réimporté (même id ici, mais nameToId reconstruit à part).
    const nameToId = { id: getColumnId(left, 'id') };
    const secondaryNameToId = { ref: getColumnId(right, 'ref'), nb_presences: getColumnId(right, 'nb_presences') };
    const rebuilt = def.rebind(portable.params, nameToId, { secondaryTable: right, secondaryNameToId });
    expect(rebuilt).toEqual({ ...params, rightTableId: right.id });
  });

  it('toPortable/rebind : la normalisation des clés (exacte et blocage flou) voyage avec la recette', () => {
    const left = createTableFromRows('candidats', ['nom', 'naissance'], [{ nom: 'Fotso', naissance: '19/07/1998' }]);
    const right = createTableFromRows('presence', ['nom_complet', 'date_naissance', 'nb'], [{ nom_complet: 'FOTSO', date_naissance: '19-07-1998', nb: '3' }]);
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      matchStrategy: 'exact',
      keyPairs: [
        { leftColumnId: getColumnId(left, 'nom'), rightColumnId: getColumnId(right, 'nom_complet'), normalization: 'text' },
        { leftColumnId: getColumnId(left, 'naissance'), rightColumnId: getColumnId(right, 'date_naissance'), normalization: 'date' },
      ],
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb'), asName: 'nb' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    const portable = def.toPortable(params, left, makeContext(right));
    const nameToId = { nom: getColumnId(left, 'nom'), naissance: getColumnId(left, 'naissance') };
    const secondaryNameToId = { nom_complet: getColumnId(right, 'nom_complet'), date_naissance: getColumnId(right, 'date_naissance'), nb: getColumnId(right, 'nb') };
    const rebuilt = def.rebind(portable.params, nameToId, { secondaryTable: right, secondaryNameToId }) as EnrichJoinParams;
    expect(rebuilt.keyPairs[0].normalization).toBe('text');
    expect(rebuilt.keyPairs[1].normalization).toBe('date');

    // Et le résultat matche bien malgré les différences de format grâce à la normalisation restaurée.
    const { table: out } = def.apply(left, rebuilt, makeContext(right));
    const col = out.columns.find((c) => c.name === 'nb')!;
    expect(out.rows[0].cells[col.id]).toBe('3');
  });

  it('rebind échoue explicitement sans table secondaire fournie', () => {
    const left = leftTable();
    const right = rightTableSingle();
    const def = getOperationDefinition('enrich_join');
    const params: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb_presences'), asName: 'nb_presences' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    const portable = def.toPortable(params, left, makeContext(right));
    expect(() => def.rebind(portable.params, { id: getColumnId(left, 'id') })).toThrow(/secondaire/);
  });
});
