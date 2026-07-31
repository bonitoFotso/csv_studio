// Rendu PDF déclenché depuis le navigateur : `renderToBuffer`/`renderToFile` (exportReportPdf.ts,
// utilisé par les scripts/tests Node) n'existent pas côté navigateur — l'API documentée pour ce
// contexte est `pdf(element).toBlob()`. Fichier séparé de exportReportPdf.ts pour ne jamais tirer
// fonts.ts (Node, `node:url`) dans le bundle de l'app.
import { pdf } from '@react-pdf/renderer';
import { registerReportFonts } from './fontsBrowser.ts';
import { ReportDocument } from './ReportDocument.tsx';
import type { ReportDocumentProps } from './ReportDocument.tsx';

/** Rend un rapport en PDF (Blob téléchargeable). Chargé en `import()` dynamique par ReportExportDialog.tsx, jamais importé statiquement ailleurs dans l'app. */
export async function renderReportPdfToBlob(props: ReportDocumentProps): Promise<Blob> {
  registerReportFonts();
  return pdf(<ReportDocument {...props} />).toBlob();
}
