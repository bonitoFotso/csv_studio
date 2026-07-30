import type { OperationReport, Pipeline, Table } from '@/engine/types.ts';

const TYPE_LABEL: Record<string, string> = {
  rename_columns: 'Renommer des colonnes',
  reorder_columns: 'Réordonner des colonnes',
  drop_columns: 'Supprimer des colonnes',
  hide_columns: 'Masquer des colonnes',
  duplicate_column: 'Dupliquer une colonne',
  add_constant_column: 'Ajouter une colonne constante',
  add_concat_column: 'Ajouter une colonne concaténée',
  add_extract_column: 'Ajouter une colonne extraite',
  add_sequence_column: 'Ajouter une colonne séquence',
  add_expression_column: 'Ajouter une colonne (expression)',
  normalize_columns: 'Normaliser des colonnes',
  filter_rows: 'Filtrer des lignes',
  deduplicate: 'Dédoublonner',
  enrich_join: 'Rapprocher / enrichir',
};

export function operationLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function buildPipelineReportText(sourceTable: Table, pipeline: Pipeline, reportsByIndex: Map<number, OperationReport>): string {
  const lines: string[] = [];
  lines.push(`Rapport du pipeline — ${sourceTable.name}`);
  lines.push(`Généré le ${new Date().toLocaleString('fr-FR')}`);
  lines.push('');
  lines.push(`Étape 0 — Source : ${sourceTable.rows.length} lignes, ${sourceTable.columns.length} colonnes`);

  pipeline.steps.forEach((step, i) => {
    const label = step.operation.label ?? operationLabel(step.operation.type);
    const status = step.operation.enabled ? '' : ' (désactivée)';
    const report = reportsByIndex.get(i);
    lines.push('');
    lines.push(`Étape ${i + 1} — ${label}${status}`);
    if (report) {
      lines.push(`  lignes en entrée : ${report.rowsIn}`);
      lines.push(`  lignes en sortie : ${report.rowsOut}`);
      if (report.rowsRemoved) lines.push(`  supprimées : ${report.rowsRemoved}`);
      if (report.rowsAdded) lines.push(`  ajoutées : ${report.rowsAdded}`);
      if (report.rowsModified) lines.push(`  modifiées : ${report.rowsModified}`);
      if (report.unmatched !== undefined) lines.push(`  non appariées : ${report.unmatched}`);
      if (report.ambiguous !== undefined) lines.push(`  ambiguës : ${report.ambiguous}`);
      for (const note of report.notes) lines.push(`  note : ${note}`);
    } else {
      lines.push('  (non exécutée)');
    }
  });

  return lines.join('\n');
}
