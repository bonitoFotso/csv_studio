import { computeAllProfiles } from './profile.ts';
import { buildAnonymizedSample } from './anonymize.ts';
import { REPORT_SPEC_FORMAT_GUIDE } from './reportSpec.ts';
import type { Table } from './types.ts';

const TYPE_LABEL: Record<string, string> = {
  empty: 'vide',
  integer: 'entier',
  decimal: 'décimal',
  date: 'date',
  boolean: 'booléen',
  text: 'texte',
};

function csvEscape(value: string): string {
  return /[,"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Construit un export Markdown collable à un assistant pour qu'il génère un `ReportSpec` : profil
 * des colonnes (nom, type, taux de remplissage — sans `topValues` ni exemples d'anomalie, qui sont
 * de vraies valeurs de la donnée), un échantillon de lignes anonymisé (forme préservée, contenu
 * fictif), et un rappel du format ReportSpec attendu.
 */
export function buildAssistantProfileExport(table: Table): string {
  const profiles = computeAllProfiles(table);
  const profileByColumnId = new Map(profiles.map((p) => [p.columnId, p]));

  const columnLines = table.columns.map((col) => {
    const p = profileByColumnId.get(col.id);
    if (!p) return `- ${col.name}`;
    const fillPct = Math.round(p.fillRate * 100);
    const anomalyKinds = p.anomalies.map((a) => a.kind).join(', ');
    return `- ${col.name} : ${TYPE_LABEL[p.detectedType] ?? p.detectedType}, rempli à ${fillPct} %, ${p.distinctCount} valeur(s) distincte(s)${anomalyKinds ? `, anomalies : ${anomalyKinds}` : ''}`;
  });

  const sampleRows = buildAnonymizedSample(table, 3);
  const header = table.columns.map((c) => csvEscape(c.name)).join(',');
  const sampleLines = sampleRows.map((row) => table.columns.map((c) => csvEscape(row.cells[c.id] ?? '')).join(','));

  return `# Profil de « ${table.name} » — pour générer un ReportSpec

## Colonnes
${columnLines.join('\n')}

## Exemple de lignes (anonymisé — le contenu est fictif, la forme est fidèle : longueur, séparateur décimal, format de date)
${header}
${sampleLines.join('\n')}

## Format ReportSpec attendu

${REPORT_SPEC_FORMAT_GUIDE}
`;
}
