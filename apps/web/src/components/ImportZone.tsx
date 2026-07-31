import * as React from 'react';
import { parseCsvFile } from '@/lib/csv.ts';
import { parseCsvText } from '@csv-studio/core/csv.ts';
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Button } from '@/components/ui/button.tsx';

function tableNameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

export function ImportZone({ onImported }: { onImported?: () => void }) {
  const { importTable } = useWorkspace();
  const [isDragging, setIsDragging] = React.useState(false);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const importFiles = async (files: FileList | File[]) => {
    let importedAny = false;
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) continue;
      const parsed = await parseCsvFile(file);
      importTable(createTableFromRows(tableNameFromFilename(file.name), parsed.columnNames, parsed.rows));
      importedAny = true;
    }
    if (importedAny) onImported?.();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files);
  };

  const importPastedText = () => {
    if (!pasteText.trim()) return;
    const parsed = parseCsvText(pasteText);
    importTable(createTableFromRows(`table collée ${new Date().toLocaleTimeString('fr-FR')}`, parsed.columnNames, parsed.rows));
    setPasteText('');
    setPasteOpen(false);
    onImported?.();
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex w-full max-w-xl flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          isDragging ? 'border-text bg-surface-alt' : 'border-border'
        }`}
      >
        <p className="text-sm text-text">Glissez-déposez un ou plusieurs fichiers CSV ici</p>
        <p className="text-xs text-text-muted">ou</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Choisir des fichiers
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPasteOpen((v) => !v)}>
            Coller du texte CSV
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {pasteOpen && (
          <div className="mt-2 w-full text-left">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="nom,prenom,note&#10;Fotso,Bonito,15"
              rows={6}
              className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs text-text outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
                Annuler
              </Button>
              <Button size="sm" onClick={importPastedText}>
                Importer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
