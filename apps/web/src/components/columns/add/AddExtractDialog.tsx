import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { Column } from '@csv-studio/core/engine/types.ts';
import type { AddExtractColumnParams, ExtractMode } from '@csv-studio/core/engine/operations/addExtractColumn.ts';

const MODES: { value: ExtractMode; label: string; needsArg: boolean; argPlaceholder?: string }[] = [
  { value: 'year', label: 'Année (depuis une date)', needsArg: false },
  { value: 'first_n', label: 'N premiers caractères', needsArg: true, argPlaceholder: 'ex: 3' },
  { value: 'last_n', label: 'N derniers caractères', needsArg: true, argPlaceholder: 'ex: 4' },
  { value: 'before_sep', label: 'Partie avant un séparateur', needsArg: true, argPlaceholder: 'ex: @' },
  { value: 'after_sep', label: 'Partie après un séparateur', needsArg: true, argPlaceholder: 'ex: @' },
  { value: 'regex_group', label: 'Groupe capturé par une expression régulière', needsArg: true, argPlaceholder: 'ex: ^(\\d{4})' },
];

export function AddExtractDialog({
  open,
  onOpenChange,
  columns,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  onConfirm: (params: AddExtractColumnParams) => void;
}) {
  const [name, setName] = React.useState('');
  const [sourceColumnId, setSourceColumnId] = React.useState(columns[0]?.id ?? '');
  const [mode, setMode] = React.useState<ExtractMode>('year');
  const [arg, setArg] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setSourceColumnId(columns[0]?.id ?? '');
      setMode('year');
      setArg('');
    }
  }, [open, columns]);

  const modeDef = MODES.find((m) => m.value === mode)!;

  const submit = () => {
    if (!name.trim() || !sourceColumnId) return;
    onConfirm({ name: name.trim(), sourceColumnId, mode, arg: modeDef.needsArg ? arg : undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonne extraite</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la colonne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="annee_naissance" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Colonne source</label>
            <select
              value={sourceColumnId}
              onChange={(e) => setSourceColumnId(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Extraction</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ExtractMode)}
              className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {modeDef.needsArg && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Paramètre</label>
              <Input value={arg} onChange={(e) => setArg(e.target.value)} placeholder={modeDef.argPlaceholder} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!name.trim() || !sourceColumnId} onClick={submit}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
