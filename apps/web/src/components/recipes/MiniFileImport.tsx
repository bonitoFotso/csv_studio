import * as React from 'react';
import { UploadCloud } from 'lucide-react';
import { parseCsvFile } from '@/lib/csv.ts';
import { createTableFromRows } from '@/engine/table.ts';
import type { Table } from '@/engine/types.ts';
import { Button } from '@/components/ui/button.tsx';

export function MiniFileImport({ label, onLoaded }: { label: string; onLoaded: (table: Table) => void }) {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    const parsed = await parseCsvFile(file);
    onLoaded(createTableFromRows(file.name.replace(/\.[^.]+$/, ''), parsed.columnNames, parsed.rows));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center ${isDragging ? 'border-text bg-surface-alt' : 'border-border'}`}
    >
      <UploadCloud size={18} className="text-text-faint" />
      <p className="text-[12px] text-text">{label}</p>
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        Choisir un fichier
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
