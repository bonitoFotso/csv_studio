import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './operations/index.ts';
import { createTableFromRows } from './table.ts';
import { suggestColumnMapping, mappingIsComplete } from './recipe.ts';
import { validateReportSpec } from './reportSpecValidate.ts';
import { computeReport } from './reportSpecCompute.ts';
import type { ColumnMapping } from './types.ts';

beforeAll(() => registerAllOperations());

function sampleTable() {
  return createTableFromRows(
    'candidats',
    ['nom', 'prenom', 'note', 'decision'],
    [
      { nom: 'Fotso', prenom: 'Bonito', note: '15', decision: 'Admis' },
      { nom: 'Kamga', prenom: 'Alice', note: '8', decision: 'Recalé' },
      { nom: 'Ngo', prenom: 'Eric', note: '12', decision: 'Admis' },
      { nom: 'Mballa', prenom: 'Julie', note: '', decision: 'Admis' },
    ],
  );
}

function identityMapping(names: string[]): ColumnMapping {
  return Object.fromEntries(names.map((n) => [n, n]));
}

describe('computeReport — remappage réutilise le mécanisme des recettes', () => {
  it('suggestColumnMapping/mappingIsComplete de recipe.ts fonctionnent sur expectedColumns d\'un ReportSpec', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report',
      title: 'Rapport',
      expectedColumns: ['nom', 'note', 'decision'],
      blocks: [],
    };
    const result = validateReportSpec(spec);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mapping = suggestColumnMapping(result.spec.expectedColumns, table.columns.map((c) => c.name));
    expect(mappingIsComplete(mapping)).toBe(true);
    expect(mapping.nom).toBe('nom');
  });

  it("un ReportSpec chargé sur un fichier aux en-têtes différents propose un remappage pré-rempli mais incomplet, jamais deviné", () => {
    const table = createTableFromRows('t', ['Nom', 'Note'], [{ Nom: 'x', Note: '1' }]);
    const mapping = suggestColumnMapping(['nom', 'note', 'decision'], table.columns.map((c) => c.name));
    expect(mapping.nom).toBe('Nom');
    expect(mapping.note).toBe('Note');
    expect(mapping.decision).toBeNull(); // aucune colonne plausible : pas de devinette
    expect(mappingIsComplete(mapping)).toBe(false);
  });
});

describe('computeReport — blocs', () => {
  it('text passe le contenu tel quel', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: [],
      blocks: [{ type: 'text' as const, content: 'Bonjour' }],
    };
    const computed = computeReport(spec, table, {});
    expect(computed.blocks[0]).toEqual({ type: 'text', content: 'Bonjour' });
  });

  it('kpi_row calcule count et avg en excluant les valeurs vides (jamais comptées comme zéro)', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: ['note'],
      blocks: [
        {
          type: 'kpi_row' as const,
          items: [
            { label: 'Candidats', agg: { fn: 'count' as const } },
            { label: 'Moyenne', agg: { fn: 'avg' as const, column: 'note' } },
          ],
        },
      ],
    };
    const computed = computeReport(spec, table, identityMapping(['note']));
    const block = computed.blocks[0];
    if (block.type !== 'kpi_row') throw new Error('type inattendu');
    expect(block.items[0]).toEqual({ label: 'Candidats', value: '4', format: 'number' });
    // (15 + 8 + 12) / 3 = 11.6667, PAS /4 (la ligne vide est exclue, pas comptée comme 0)
    expect(block.items[1].value).toBe('11.6667');
  });

  it('chart calcule les catégories et séries via le moteur summarize, jamais recalculées à part', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: ['decision'],
      blocks: [
        {
          type: 'chart' as const,
          chartType: 'bar' as const,
          summarize: {
            groupBy: [{ column: 'decision', normalization: 'text' as const }],
            aggregates: [{ fn: 'count' as const, asName: 'effectif' }],
          },
          x: 'decision',
          series: [{ column: 'effectif', label: 'Candidats' }],
        },
      ],
    };
    const computed = computeReport(spec, table, identityMapping(['decision']));
    const block = computed.blocks[0];
    if (block.type !== 'chart') throw new Error('type inattendu');
    expect(block.categories).toEqual(['Admis', 'Recalé']);
    expect(block.series).toEqual([{ label: 'Candidats', values: ['3', '1'] }]);
  });

  it('table applique le filtre et respecte maxRows, en annonçant le nombre total et la troncature', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: ['nom', 'decision'],
      blocks: [
        {
          type: 'table' as const,
          columns: ['nom'],
          filter: {
            kind: 'group' as const,
            operator: 'and' as const,
            conditions: [{ kind: 'condition' as const, columnId: 'decision', operator: 'eq' as const, value: 'Admis' }],
          },
          maxRows: 2,
        },
      ],
    };
    const computed = computeReport(spec, table, identityMapping(['nom', 'decision']));
    const block = computed.blocks[0];
    if (block.type !== 'table') throw new Error('type inattendu');
    expect(block.totalMatching).toBe(3); // Fotso, Ngo, Mballa
    expect(block.rows).toHaveLength(2); // tronqué à maxRows
    expect(block.truncated).toBe(true);
  });

  it('page_break ne porte aucune donnée', () => {
    const table = sampleTable();
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: [],
      blocks: [{ type: 'page_break' as const }],
    };
    const computed = computeReport(spec, table, {});
    expect(computed.blocks[0]).toEqual({ type: 'page_break' });
  });

  it("le rapport ne modifie jamais la table (aucune mutation d'entrée)", () => {
    const table = sampleTable();
    const snapshot = JSON.parse(JSON.stringify(table));
    const spec = {
      formatVersion: 1,
      kind: 'report' as const,
      title: 'Rapport',
      expectedColumns: ['decision'],
      blocks: [
        {
          type: 'chart' as const,
          chartType: 'pie' as const,
          summarize: { groupBy: [{ column: 'decision', normalization: 'text' as const }], aggregates: [{ fn: 'count' as const, asName: 'n' }] },
          x: 'decision',
          series: [{ column: 'n' }],
        },
      ],
    };
    computeReport(spec, table, identityMapping(['decision']));
    expect(table).toEqual(snapshot);
  });
});
