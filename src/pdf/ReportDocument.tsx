import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { ChartFigure } from './charts.tsx';
import { REPORT_FONT_FAMILY } from './fonts.ts';
import type { ComputedBlock, ComputedReport } from '../engine/reportSpecCompute.ts';
import type { ReportTraceability } from './traceability.ts';

export type ReportMode = 'draft' | 'official';

export interface ReportDocumentProps {
  report: ComputedReport;
  mode: ReportMode;
  traceability: ReportTraceability;
  /** Mode officiel uniquement : nom de la structure affiché en en-tête. */
  organizationName?: string;
  /** Mode officiel uniquement : logo importé et stocké localement (chemin de fichier ou data URI) — jamais une URL distante. */
  logoSrc?: string;
}

const styles = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 44, paddingHorizontal: 40, fontFamily: REPORT_FONT_FAMILY, fontSize: 10, color: '#1f2937' },
  header: { marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerText: { flexGrow: 1, flexShrink: 1 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  orgName: { fontSize: 10, color: '#374151', marginBottom: 4 },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  block: { marginBottom: 14 },
  text: { fontSize: 10, lineHeight: 1.5 },
  blockTitle: { fontSize: 12, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  caption: { fontSize: 8, color: '#6b7280', marginTop: 4, fontStyle: 'italic' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiItem: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, paddingVertical: 8, paddingHorizontal: 12, minWidth: 100 },
  kpiValue: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  kpiLabel: { fontSize: 8, color: '#6b7280', marginTop: 2 },
  table: { borderWidth: 1, borderColor: '#e5e7eb' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  tableCell: { flex: 1, fontSize: 8, paddingVertical: 4, paddingHorizontal: 5 },
  tableHeaderCell: { flex: 1, fontSize: 8, fontWeight: 'bold', paddingVertical: 4, paddingHorizontal: 5 },
  tableNote: { fontSize: 7.5, color: '#6b7280', marginTop: 3 },
  watermark: {
    position: 'absolute',
    top: 320,
    left: 60,
    fontSize: 72,
    color: '#f3d9d9',
    opacity: 0.55,
    transform: 'rotate(-28deg)',
  },
  draftTraceBox: { marginTop: 18, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, padding: 8, backgroundColor: '#fafafa' },
  draftTraceTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4, color: '#111827' },
  draftTraceLine: { fontSize: 7.5, color: '#374151', marginBottom: 1.5 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7.5, color: '#9ca3af' },
});

function formatKpiValue(value: string, format: 'number' | 'percent'): string {
  if (value === '') return '—';
  if (format === 'percent') {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1).replace(/\.0$/, '')} %` : value;
  }
  return value;
}

function TextBlockView({ content }: { content: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.text}>{content}</Text>
    </View>
  );
}

function KpiRowBlockView({ items }: { items: Extract<ComputedBlock, { type: 'kpi_row' }>['items'] }) {
  return (
    <View style={[styles.block, styles.kpiRow]}>
      {items.map((item, i) => (
        <View key={i} style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{formatKpiValue(item.value, item.format)}</Text>
          <Text style={styles.kpiLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ChartBlockView({ block }: { block: Extract<ComputedBlock, { type: 'chart' }> }) {
  return (
    <View style={styles.block} wrap={false}>
      {block.title && <Text style={styles.blockTitle}>{block.title}</Text>}
      <ChartFigure block={block} />
      {block.caption && <Text style={styles.caption}>{block.caption}</Text>}
    </View>
  );
}

function TableBlockView({ block }: { block: Extract<ComputedBlock, { type: 'table' }> }) {
  return (
    <View style={styles.block}>
      {block.title && <Text style={styles.blockTitle}>{block.title}</Text>}
      <View style={styles.table}>
        <View style={styles.tableHeaderRow} fixed>
          {block.columnNames.map((name, i) => (
            <Text key={i} style={styles.tableHeaderCell}>
              {name}
            </Text>
          ))}
        </View>
        {block.rows.map((row, ri) => (
          <View key={ri} style={styles.tableRow} wrap={false}>
            {row.map((cell, ci) => (
              <Text key={ci} style={styles.tableCell}>
                {cell === '' ? '—' : cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
      {block.truncated && (
        <Text style={styles.tableNote}>
          {block.rows.length} ligne(s) affichée(s) sur {block.totalMatching} correspondante(s) au total.
        </Text>
      )}
    </View>
  );
}

function BlockView({ block }: { block: ComputedBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlockView content={block.content} />;
    case 'kpi_row':
      return <KpiRowBlockView items={block.items} />;
    case 'chart':
      return <ChartBlockView block={block} />;
    case 'table':
      return <TableBlockView block={block} />;
    case 'page_break':
      return <View break />;
  }
}

function DraftTraceabilityBlock({ traceability }: { traceability: ReportTraceability }) {
  return (
    <View style={styles.draftTraceBox} wrap={false}>
      <Text style={styles.draftTraceTitle}>Traçabilité (brouillon)</Text>
      <Text style={styles.draftTraceLine}>Généré le {new Date(traceability.generatedAt).toLocaleString('fr-FR')}</Text>
      {traceability.recipeName && <Text style={styles.draftTraceLine}>Recette appliquée : {traceability.recipeName}</Text>}
      <Text style={styles.draftTraceLine}>
        Fichiers sources : {traceability.sourceFiles.map((f) => `${f.name} (${f.rowCount.toLocaleString('fr-FR')} lignes)`).join(', ')}
      </Text>
      {traceability.steps.map((s) => (
        <Text key={s.index} style={styles.draftTraceLine}>
          {s.index + 1}. {s.label}
          {!s.enabled ? ' (désactivée)' : ''} — {s.rowsIn.toLocaleString('fr-FR')} → {s.rowsOut.toLocaleString('fr-FR')} lignes
          {s.unmatched !== undefined ? `, ${s.unmatched} non appariée(s)` : ''}
          {s.ambiguous !== undefined ? `, ${s.ambiguous} ambiguë(s)` : ''}
        </Text>
      ))}
      <Text style={styles.draftTraceLine}>
        Appariements : {traceability.totalAutoMatched} automatique(s), {traceability.totalManualMatched} manuel(s), {traceability.totalUnmatched} non
        appariée(s) au total.
      </Text>
    </View>
  );
}

function OfficialFooterTrace({ traceability }: { traceability: ReportTraceability }) {
  return (
    <Text style={styles.footerText}>
      Généré le {new Date(traceability.generatedAt).toLocaleDateString('fr-FR')} · {traceability.sourceFiles.length} source(s) · pipeline #
      {traceability.pipelineFingerprint}
    </Text>
  );
}

export function ReportDocument({ report, mode, traceability, organizationName, logoSrc }: ReportDocumentProps) {
  return (
    <Document title={report.title}>
      <Page size="A4" style={styles.page} wrap>
        {mode === 'draft' && (
          <Text style={styles.watermark} fixed>
            BROUILLON
          </Text>
        )}

        <View style={styles.header} fixed>
          <View style={styles.headerText}>
            {mode === 'official' && organizationName && <Text style={styles.orgName}>{organizationName}</Text>}
            <Text style={styles.title}>{report.title}</Text>
            {report.subtitle && <Text style={styles.subtitle}>{report.subtitle}</Text>}
          </View>
          {mode === 'official' && logoSrc && <Image style={styles.logo} src={logoSrc} />}
        </View>

        {report.blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}

        {mode === 'draft' && <DraftTraceabilityBlock traceability={traceability} />}

        <View style={styles.footer} fixed>
          {mode === 'official' ? (
            <>
              <OfficialFooterTrace traceability={traceability} />
              <Text
                style={styles.footerText}
                render={({ pageNumber, totalPages }) => `page ${pageNumber} sur ${totalPages}`}
              />
            </>
          ) : (
            <>
              <Text style={styles.footerText}>Document de travail interne — brouillon</Text>
              <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `page ${pageNumber} sur ${totalPages}`} />
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}
