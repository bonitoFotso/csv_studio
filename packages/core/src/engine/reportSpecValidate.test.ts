import { describe, expect, it } from 'vitest';
import { validateReportSpec } from './reportSpecValidate.ts';

function baseSpec(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    kind: 'report',
    title: 'Rapport de session',
    expectedColumns: ['nom', 'prenom', 'nb_presences', 'note', 'decision'],
    blocks: [],
    ...overrides,
  };
}

describe('validateReportSpec — document valide', () => {
  it('accepte un ReportSpec minimal complet', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          { type: 'text', content: 'Contexte de la session…' },
          {
            type: 'kpi_row',
            items: [
              { label: 'Candidats', agg: { fn: 'count' } },
              { label: 'Moyenne', agg: { fn: 'avg', column: 'note' }, format: 'number' },
            ],
          },
          {
            type: 'chart',
            chartType: 'bar',
            title: 'Répartition des décisions',
            summarize: {
              groupBy: [{ column: 'decision', normalization: 'text' }],
              aggregates: [{ fn: 'count', asName: 'effectif' }],
            },
            x: 'decision',
            series: [{ column: 'effectif', label: 'Candidats' }],
          },
          {
            type: 'table',
            title: 'Candidats',
            columns: ['nom', 'prenom'],
            maxRows: 200,
          },
          { type: 'page_break' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.blocks).toHaveLength(5);
    }
  });
});

describe('validateReportSpec — erreurs de premier niveau', () => {
  it('rejette un document qui n\'est pas un objet', () => {
    const result = validateReportSpec('not an object');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe('$');
  });

  it('rejette une version future avec un message précis', () => {
    const result = validateReportSpec(baseSpec({ formatVersion: 99 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'formatVersion');
      expect(err?.message).toMatch(/non supportée/);
      expect(err?.message).toMatch(/99/);
    }
  });

  it('rejette kind différent de "report"', () => {
    const result = validateReportSpec(baseSpec({ kind: 'recipe' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'kind')).toBe(true);
  });

  it('rejette un titre vide', () => {
    const result = validateReportSpec(baseSpec({ title: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'title')).toBe(true);
  });

  it('rejette expectedColumns manquant ou mal typé', () => {
    const result = validateReportSpec(baseSpec({ expectedColumns: 'nom,prenom' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'expectedColumns')).toBe(true);
  });
});

describe('validateReportSpec — blocs', () => {
  it('signale précisément un bloc de type inconnu', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'scatter_plot' }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].path).toBe('blocks[0].type');
      expect(result.errors[0].message).toMatch(/scatter_plot/);
    }
  });

  it('text : content manquant', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'text' }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe('blocks[0].content');
  });

  it('kpi_row : fonction d\'agrégat inconnue avec chemin précis', () => {
    const result = validateReportSpec(
      baseSpec({ blocks: [{ type: 'kpi_row', items: [{ label: 'X', agg: { fn: 'stddev' } }] }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].path).toBe('blocks[0].items[0].agg.fn');
      expect(result.errors[0].message).toMatch(/stddev/);
    }
  });

  it('kpi_row : column manquant pour une fonction qui en a besoin', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'kpi_row', items: [{ label: 'X', agg: { fn: 'avg' } }] }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].path).toBe('blocks[0].items[0].agg.column');
  });

  it('kpi_row : column référencée absente de expectedColumns', () => {
    const result = validateReportSpec(
      baseSpec({ blocks: [{ type: 'kpi_row', items: [{ label: 'X', agg: { fn: 'avg', column: 'colonne_fantome' } }] }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'blocks[0].items[0].agg.column');
      expect(err?.message).toMatch(/colonne_fantome/);
      expect(err?.message).toMatch(/expectedColumns/);
    }
  });

  it('chart : chartType inconnu', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'chart',
            chartType: 'radar',
            summarize: { groupBy: [{ column: 'decision', normalization: 'text' }], aggregates: [{ fn: 'count', asName: 'n' }] },
            x: 'decision',
            series: [{ column: 'n' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].chartType')).toBe(true);
  });

  it('chart : x qui ne correspond à aucune colonne de groupBy', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'chart',
            chartType: 'bar',
            summarize: { groupBy: [{ column: 'decision', normalization: 'text' }], aggregates: [{ fn: 'count', asName: 'n' }] },
            x: 'nom',
            series: [{ column: 'n' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'blocks[0].x');
      expect(err?.message).toMatch(/decision/);
    }
  });

  it('chart : series.column qui ne correspond à aucun asName d\'agrégat', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'chart',
            chartType: 'bar',
            summarize: { groupBy: [{ column: 'decision', normalization: 'text' }], aggregates: [{ fn: 'count', asName: 'effectif' }] },
            x: 'decision',
            series: [{ column: 'total_inexistant' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].series[0].column')).toBe(true);
  });

  it('chart : summarize.groupBy vide', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          { type: 'chart', chartType: 'bar', summarize: { groupBy: [], aggregates: [{ fn: 'count', asName: 'n' }] }, x: 'decision', series: [{ column: 'n' }] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].summarize.groupBy')).toBe(true);
  });

  it('chart : normalisation de groupBy invalide', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'chart',
            chartType: 'bar',
            summarize: { groupBy: [{ column: 'decision', normalization: 'fuzzy' }], aggregates: [{ fn: 'count', asName: 'n' }] },
            x: 'decision',
            series: [{ column: 'n' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].summarize.groupBy[0].normalization')).toBe(true);
  });

  it('chart : binning explicit_boundaries avec moins de deux bornes', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'chart',
            chartType: 'histogram',
            summarize: {
              groupBy: [{ column: 'note', normalization: 'raw', binning: { kind: 'explicit_boundaries', boundaries: [10] } }],
              aggregates: [{ fn: 'count', asName: 'n' }],
            },
            x: 'note',
            series: [{ column: 'n' }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].summarize.groupBy[0].binning.boundaries')).toBe(true);
  });

  it('table : colonnes vides', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'table', columns: [] }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].columns')).toBe(true);
  });

  it('table : colonne référencée absente de expectedColumns', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'table', columns: ['colonne_fantome'] }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'blocks[0].columns');
      expect(err?.message).toMatch(/colonne_fantome/);
    }
  });

  it('table : maxRows non entier positif', () => {
    const result = validateReportSpec(baseSpec({ blocks: [{ type: 'table', columns: ['nom'], maxRows: -5 }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].maxRows')).toBe(true);
  });

  it('table : filtre avec opérateur invalide, chemin imbriqué précis', () => {
    const result = validateReportSpec(
      baseSpec({
        blocks: [
          {
            type: 'table',
            columns: ['nom'],
            filter: { kind: 'group', operator: 'and', conditions: [{ kind: 'condition', columnId: 'nom', operator: 'ressemble_a' }] },
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path === 'blocks[0].filter.conditions[0].operator')).toBe(true);
  });

  it('accumule plusieurs erreurs indépendantes en un seul passage (pas fail-fast)', () => {
    const result = validateReportSpec(
      baseSpec({
        title: '',
        blocks: [{ type: 'kpi_row', items: [{ label: '', agg: { fn: 'avg' } }] }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3); // title, items[0].label, items[0].agg.column
    }
  });
});
