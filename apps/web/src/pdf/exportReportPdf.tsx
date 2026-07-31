import { renderToBuffer, renderToFile } from '@react-pdf/renderer';
import { registerReportFonts } from './fonts.ts';
import { ReportDocument } from './ReportDocument.tsx';
import type { ReportDocumentProps } from './ReportDocument.tsx';

/** Rend un rapport en PDF (buffer en mémoire). Aucune requête réseau : la police est embarquée en local. */
export async function renderReportPdfToBuffer(props: ReportDocumentProps): Promise<Buffer> {
  registerReportFonts();
  return renderToBuffer(<ReportDocument {...props} />);
}

/** Écrit directement un rapport en PDF sur le disque — utilisé par le script de génération des livrables (phase 4). */
export async function renderReportPdfToFile(props: ReportDocumentProps, filePath: string): Promise<void> {
  registerReportFonts();
  await renderToFile(<ReportDocument {...props} />, filePath);
}
