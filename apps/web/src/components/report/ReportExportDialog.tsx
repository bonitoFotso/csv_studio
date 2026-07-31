import * as React from 'react';
import { FileJson } from 'lucide-react';
import { validateReportSpec } from '@csv-studio/core/engine/reportSpecValidate.ts';
import { computeReport } from '@csv-studio/core/engine/reportSpecCompute.ts';
import { suggestColumnMapping, mappingIsComplete } from '@csv-studio/core/engine/recipe.ts';
import type { ReportSpec } from '@csv-studio/core/engine/reportSpec.ts';
import type { ColumnMapping, OperationReport, Table } from '@csv-studio/core/engine/types.ts';
import type { WorkspaceEntry } from '@/state/workspace.tsx';
import { buildTraceability } from '@/pdf/traceability.ts';
import { downloadBlob } from '@/lib/download.ts';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { RemapGrid } from '@/components/recipes/RemapGrid.tsx';
import type { ReportMode } from '@/pdf/ReportDocument.tsx';

interface ReportExportDialogProps {
  entry: WorkspaceEntry;
  displayTable: Table;
  reportsByIndex: Map<number, OperationReport>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportExportDialog({ entry, displayTable, reportsByIndex, open, onOpenChange }: ReportExportDialogProps) {
  const [spec, setSpec] = React.useState<ReportSpec | null>(null);
  const [parseErrors, setParseErrors] = React.useState<string[]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [mode, setMode] = React.useState<ReportMode>('draft');
  const [organizationName, setOrganizationName] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const jsonInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setSpec(null);
      setParseErrors([]);
      setMapping({});
      setMode('draft');
      setOrganizationName('');
    }
  }, [open]);

  const loadSpecText = (text: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setParseErrors(['Le contenu collé/importé n\'est pas un JSON valide.']);
      return;
    }
    const result = validateReportSpec(parsed);
    if (!result.ok) {
      setParseErrors(result.errors.map((e) => `${e.path} : ${e.message}`));
      return;
    }
    setParseErrors([]);
    setSpec(result.spec);
    setMapping(suggestColumnMapping(result.spec.expectedColumns, displayTable.columns.map((c) => c.name)));
  };

  const importJsonFile = async (file: File) => {
    loadSpecText(await file.text());
  };

  const canGenerate = spec !== null && mappingIsComplete(mapping) && !generating;

  const generate = async () => {
    if (!spec || !canGenerate) return;
    setGenerating(true);
    try {
      const computed = computeReport(spec, displayTable, mapping);
      const traceability = buildTraceability(entry.sourceTable, Object.values(entry.auxiliaryTables), entry.pipeline, reportsByIndex);
      const { renderReportPdfToBlob } = await import('@/pdf/exportReportPdfBrowser.tsx');
      const blob = await renderReportPdfToBlob({
        report: computed,
        mode,
        traceability,
        organizationName: mode === 'official' && organizationName.trim() ? organizationName.trim() : undefined,
      });
      downloadBlob(`${entry.displayName}-rapport.pdf`, blob);
      onOpenChange(false);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exporter un rapport en PDF</DialogTitle>
        </DialogHeader>

        {!spec ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-text-faint">
              Colle ou importe un fichier <code>ReportSpec</code> au format JSON (voir README.md pour le format — généré à la main ou par un
              assistant via le serveur MCP).
            </p>
            <textarea
              className="h-32 w-full resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px]"
              placeholder="Colle ici le JSON du ReportSpec…"
              onChange={(e) => {
                if (e.target.value.trim()) loadSpecText(e.target.value);
              }}
            />
            {parseErrors.length > 0 && (
              <div className="space-y-0.5 rounded-md border border-destructive bg-destructive-bg px-2.5 py-1.5 text-[11.5px] text-destructive">
                {parseErrors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => jsonInputRef.current?.click()}>
              <FileJson size={14} /> Importer un fichier .json
            </Button>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importJsonFile(file);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-[12px]">
              <span>
                Rapport : <span className="font-medium text-text">{spec.title}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSpec(null)}>
                Changer de ReportSpec
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Colonnes attendues ({Object.values(mapping).filter((v) => v !== null).length}/{spec.expectedColumns.length} mappées)
              </label>
              <RemapGrid
                expectedColumns={spec.expectedColumns}
                actualNames={displayTable.columns.map((c) => c.name)}
                mapping={mapping}
                onChange={(expected, actual) => setMapping((prev) => ({ ...prev, [expected]: actual }))}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="radio" checked={mode === 'draft'} onChange={() => setMode('draft')} />
                Brouillon (filigrane, traçabilité complète)
              </label>
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="radio" checked={mode === 'official'} onChange={() => setMode('official')} />
                Officiel (en-tête, traçabilité condensée)
              </label>
            </div>

            {mode === 'official' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la structure (en-tête)</label>
                <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="ex. Auto-École Monaco" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {spec && (
            <Button disabled={!canGenerate} onClick={() => void generate()}>
              {generating ? 'Génération…' : 'Générer et télécharger le PDF'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
