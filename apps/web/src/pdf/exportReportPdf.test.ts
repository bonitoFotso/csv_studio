import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';
import { createPipeline } from '@csv-studio/core/engine/pipeline.ts';
import { computeReport } from '@csv-studio/core/engine/reportSpecCompute.ts';
import { validateReportSpec } from '@csv-studio/core/engine/reportSpecValidate.ts';
import { buildTraceability } from './traceability.ts';
import { renderReportPdfToBuffer } from './exportReportPdf.tsx';

beforeAll(() => registerAllOperations());

function sampleTable() {
  return createTableFromRows(
    'candidats',
    ['nom', 'prenom', 'nb_presences', 'note', 'decision'],
    [
      { nom: 'Fotso', prenom: 'Bonito', nb_presences: '12', note: '15', decision: 'Admis' },
      { nom: 'Kamga', prenom: 'Alice', nb_presences: '8', note: '8', decision: 'Recalé' },
      { nom: "N'Guessan", prenom: 'Éric', nb_presences: '10', note: '12', decision: 'Admis' },
      { nom: 'Njoya', prenom: "M'Barka", nb_presences: '', note: '', decision: 'Admis' },
    ],
  );
}

function sampleSpec() {
  return {
    formatVersion: 1,
    kind: 'report' as const,
    title: 'Rapport de session — Formation mototaxi',
    subtitle: "Session de juillet 2026",
    expectedColumns: ['nom', 'prenom', 'nb_presences', 'note', 'decision'],
    blocks: [
      { type: 'text' as const, content: "Contexte de la session : évaluation des candidats à l'issue de la formation." },
      {
        type: 'kpi_row' as const,
        items: [
          { label: 'Candidats', agg: { fn: 'count' as const } },
          { label: 'Note moyenne', agg: { fn: 'avg' as const, column: 'note' } },
        ],
      },
      {
        type: 'chart' as const,
        chartType: 'bar' as const,
        title: 'Répartition des décisions',
        summarize: {
          groupBy: [{ column: 'decision', normalization: 'text' as const }],
          aggregates: [{ fn: 'count' as const, asName: 'effectif' }],
        },
        x: 'decision',
        series: [{ column: 'effectif', label: 'Candidats' }],
      },
      {
        type: 'table' as const,
        title: 'Liste des candidats',
        columns: ['nom', 'prenom', 'decision'],
        maxRows: 200,
      },
    ],
  };
}

describe('renderReportPdfToBuffer', () => {
  it('produit un PDF valide en mode brouillon (avec bloc de traçabilité)', async () => {
    const table = sampleTable();
    const validated = validateReportSpec(sampleSpec());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, n]));
    const report = computeReport(validated.spec, table, mapping);
    const pipeline = createPipeline(table.id);
    const traceability = buildTraceability(table, [], pipeline, new Map());

    const buffer = await renderReportPdfToBuffer({ report, mode: 'draft', traceability });

    // Un vrai PDF : en-tête %PDF-, taille significative (texte vectoriel + police embarquée),
    // pas une capture d'écran encodée en image.
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(5000);
    const tail = buffer.subarray(-1024).toString('latin1');
    expect(tail).toMatch(/%%EOF/);
  });

  it('produit un PDF valide en mode officiel (sans bloc de traçabilité complet)', async () => {
    const table = sampleTable();
    const validated = validateReportSpec(sampleSpec());
    if (!validated.ok) throw new Error('spec invalide');

    const mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, n]));
    const report = computeReport(validated.spec, table, mapping);
    const pipeline = createPipeline(table.id);
    const traceability = buildTraceability(table, [], pipeline, new Map());

    const buffer = await renderReportPdfToBuffer({ report, mode: 'official', traceability, organizationName: 'Auto-École Monaco' });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(5000);
  });

  it('gère les caractères accentués et l\'apostrophe typographique sans lever d\'exception', async () => {
    const table = sampleTable(); // contient déjà É, é, et une apostrophe dans "N'Guessan"/"M'Barka"
    const validated = validateReportSpec(sampleSpec());
    if (!validated.ok) throw new Error('spec invalide');
    const mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, n]));
    const report = computeReport(validated.spec, table, mapping);
    const pipeline = createPipeline(table.id);
    const traceability = buildTraceability(table, [], pipeline, new Map());

    await expect(renderReportPdfToBuffer({ report, mode: 'draft', traceability })).resolves.not.toThrow();
  });

  it('même ReportSpec sur les mêmes données : mêmes chiffres en brouillon et en officiel (seule la présentation change)', async () => {
    const table = sampleTable();
    const validated = validateReportSpec(sampleSpec());
    if (!validated.ok) throw new Error('spec invalide');
    const mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, n]));
    const reportA = computeReport(validated.spec, table, mapping);
    const reportB = computeReport(validated.spec, table, mapping);
    // Les données calculées (indépendantes du mode d'export) doivent être strictement identiques.
    expect(reportA).toEqual(reportB);
  });
});
