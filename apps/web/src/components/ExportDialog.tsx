import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { suggestExportFilename, tableToCsvString } from '@csv-studio/core/csv.ts';
import { downloadTextFile } from '@/lib/download.ts';
import type { Table as EngineTable } from '@csv-studio/core/engine/types.ts';

const DELIMITERS = [
  { label: 'Virgule (,)', value: ',' },
  { label: 'Point-virgule (;)', value: ';' },
  { label: 'Tabulation', value: '\t' },
  { label: 'Pipe (|)', value: '|' },
];

export function ExportDialog({ table, open, onOpenChange }: { table: EngineTable; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(table.columns.map((c) => c.id)));
  const [delimiter, setDelimiter] = React.useState(';');
  const [bom, setBom] = React.useState(true);
  const [filename, setFilename] = React.useState(() => suggestExportFilename(table.name, 'csv'));

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(table.columns.map((c) => c.id)));
      setFilename(suggestExportFilename(table.name, 'csv'));
    }
  }, [open, table]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const columns = table.columns.filter((c) => selected.has(c.id));
    const csv = tableToCsvString(table, { delimiter, bom, columns });
    downloadTextFile(filename, csv, 'text/csv;charset=utf-8;', bom);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exporter « {table.name} » en CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom du fichier</label>
            <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Délimiteur</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
              >
                {DELIMITERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-1.5 pb-1.5 text-xs text-text">
              <Checkbox checked={bom} onChange={(e) => setBom(e.target.checked)} />
              UTF-8 avec BOM (recommandé pour Excel FR)
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-text-muted">Colonnes à exporter ({selected.size}/{table.columns.length})</label>
              <div className="flex gap-2 text-[11px]">
                <button className="text-text-muted underline" onClick={() => setSelected(new Set(table.columns.map((c) => c.id)))}>
                  tout
                </button>
                <button className="text-text-muted underline" onClick={() => setSelected(new Set())}>
                  aucun
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {table.columns.map((c) => (
                <label key={c.id} className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-[12.5px] last:border-b-0">
                  <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="cell-value truncate">{c.name}</span>
                  {c.hidden && <span className="text-[10px] text-text-faint">(masquée)</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={selected.size === 0 || !filename.trim()}>
            Exporter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
