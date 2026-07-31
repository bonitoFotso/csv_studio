// Livrable de la phase 4 : génère le jeu de données synthétique, l'applique à un petit pipeline
// réaliste (dédoublonnage), calcule un ReportSpec de démonstration dessus, puis écrit dans
// samples/ le CSV source, le ReportSpec JSON, et les deux PDF (brouillon + officiel). Exécuter
// avec `bun run scripts/generateSamples.ts`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

import { registerAllOperations } from '../src/engine/operations/index.ts';
import { createTableFromRows } from '../src/engine/table.ts';
import { createOperation, createPipeline, addStep } from '../src/engine/pipeline.ts';
import { replay } from '../src/engine/replay.ts';
import { validateReportSpec } from '../src/engine/reportSpecValidate.ts';
import { computeReport } from '../src/engine/reportSpecCompute.ts';
import type { DeduplicateParams } from '../src/engine/operations/deduplicate.ts';
import { renderReportPdfToFile } from '../src/pdf/exportReportPdf.tsx';
import { buildTraceability } from '../src/pdf/traceability.ts';
import { generateSyntheticCandidates } from './generateSyntheticDataset.ts';

registerAllOperations();

const samplesDir = fileURLToPath(new URL('../samples/', import.meta.url));
mkdirSync(samplesDir, { recursive: true });

// --- 1. Jeu de données synthétique ---------------------------------------------------------
const rawRows = generateSyntheticCandidates(500, 42);
const columnNames = ['nom', 'prenom', 'date_naissance', 'nb_presences', 'note', 'decision'];
const sourceTable = createTableFromRows('candidats-session-juillet-2026', columnNames, rawRows);

const csv = Papa.unparse({ fields: columnNames, data: rawRows.map((r) => columnNames.map((c) => (r as Record<string, string>)[c])) });
writeFileSync(`${samplesDir}candidats-session-juillet-2026.csv`, '﻿' + csv, 'utf-8');
console.log(`✓ samples/candidats-session-juillet-2026.csv (${sourceTable.rows.length} lignes brutes)`);

// --- 2. Petit pipeline réaliste : dédoublonnage sur nom+prénom+date de naissance -----------
const nomId = sourceTable.columns.find((c) => c.name === 'nom')!.id;
const prenomId = sourceTable.columns.find((c) => c.name === 'prenom')!.id;
const dateId = sourceTable.columns.find((c) => c.name === 'date_naissance')!.id;

let pipeline = createPipeline(sourceTable.id);
const dedupeParams: DeduplicateParams = {
  keyColumnIds: [nomId, prenomId, dateId],
  mode: 'normalized',
  action: 'keep_most_complete',
};
pipeline = addStep(pipeline, createOperation('deduplicate', dedupeParams, 'Dédoublonner les candidats'));

const { table: dedupedTable, reportsByIndex } = replay(sourceTable, pipeline.steps, pipeline.cursor);
console.log(`✓ Pipeline rejoué : ${sourceTable.rows.length} → ${dedupedTable.rows.length} lignes après dédoublonnage`);

// --- 3. ReportSpec de démonstration -----------------------------------------------------
const spec = {
  formatVersion: 1,
  kind: 'report' as const,
  title: 'Rapport de session — Formation professionnelle',
  subtitle: 'Session de juillet 2026 · Bilan des candidats',
  expectedColumns: ['nom', 'prenom', 'date_naissance', 'nb_presences', 'note', 'decision'],
  blocks: [
    {
      type: 'text' as const,
      content:
        "Ce rapport résume les résultats de la session de formation de juillet 2026. Les candidats ont été évalués sur leur assiduité (nombre de présences) et leur note finale. Les doublons de saisie (candidats inscrits plusieurs fois) ont été fusionnés avant analyse.",
    },
    {
      type: 'kpi_row' as const,
      items: [
        { label: 'Candidats (après dédoublonnage)', agg: { fn: 'count' as const } },
        { label: 'Note moyenne', agg: { fn: 'avg' as const, column: 'note' } },
        { label: 'Présences moyennes', agg: { fn: 'avg' as const, column: 'nb_presences' } },
        { label: 'Notes renseignées', agg: { fn: 'countNonEmpty' as const, column: 'note' } },
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
      caption: 'Les décisions vides (non encore statuées) apparaissent comme une catégorie à part.',
    },
    {
      type: 'chart' as const,
      chartType: 'histogram' as const,
      title: 'Distribution des notes',
      summarize: {
        groupBy: [
          {
            column: 'note',
            normalization: 'raw' as const,
            binning: { kind: 'explicit_boundaries' as const, boundaries: [0, 8, 10, 12, 14, 16, 20] },
          },
        ],
        aggregates: [{ fn: 'count' as const, asName: 'effectif' }],
      },
      x: 'note',
      series: [{ column: 'effectif', label: 'Candidats' }],
      caption: 'Tranches de notes sur 20, y compris les tranches vides et les valeurs non renseignées.',
    },
    {
      type: 'chart' as const,
      chartType: 'donut' as const,
      title: "Part de candidats ayant assisté à au moins 10 séances",
      summarize: {
        groupBy: [
          { column: 'nb_presences', normalization: 'raw' as const, binning: { kind: 'explicit_boundaries' as const, boundaries: [0, 10, 21] } },
        ],
        aggregates: [{ fn: 'count' as const, asName: 'effectif' }],
      },
      x: 'nb_presences',
      series: [{ column: 'effectif' }],
    },
    {
      type: 'table' as const,
      title: 'Candidats recalés — à recontacter',
      columns: ['nom', 'prenom', 'date_naissance', 'note'],
      filter: {
        kind: 'group' as const,
        operator: 'and' as const,
        conditions: [{ kind: 'condition' as const, columnId: 'decision', operator: 'eq' as const, value: 'Recalé' }],
      },
      maxRows: 50,
    },
    { type: 'page_break' as const },
    {
      type: 'table' as const,
      title: 'Candidats sans note renseignée — à traiter en priorité',
      columns: ['nom', 'prenom', 'decision'],
      filter: {
        kind: 'group' as const,
        operator: 'and' as const,
        conditions: [{ kind: 'condition' as const, columnId: 'note', operator: 'is_empty' as const }],
      },
      maxRows: 100,
    },
  ],
};

const validated = validateReportSpec(spec);
if (!validated.ok) {
  console.error('ReportSpec invalide :', validated.errors);
  process.exit(1);
}
console.log('✓ ReportSpec valide');

writeFileSync(`${samplesDir}report-spec.json`, JSON.stringify(validated.spec, null, 2), 'utf-8');
console.log('✓ samples/report-spec.json');

// --- 4. Calcul du rapport (remappage identité : mêmes noms des deux côtés) -----------------
const mapping = Object.fromEntries(validated.spec.expectedColumns.map((n) => [n, n]));
const computedReport = computeReport(validated.spec, dedupedTable, mapping);

// --- 5. Traçabilité (à partir du pipeline réellement rejoué ci-dessus) ---------------------
const traceability = buildTraceability(sourceTable, [], pipeline, reportsByIndex, undefined);

// --- 6. Export PDF : brouillon et officiel -------------------------------------------------
await renderReportPdfToFile({ report: computedReport, mode: 'draft', traceability }, `${samplesDir}rapport-brouillon.pdf`);
console.log('✓ samples/rapport-brouillon.pdf');

await renderReportPdfToFile(
  { report: computedReport, mode: 'official', traceability, organizationName: 'Auto-École Monaco — Centre de formation' },
  `${samplesDir}rapport-officiel.pdf`,
);
console.log('✓ samples/rapport-officiel.pdf');

console.log('\nTerminé.');
