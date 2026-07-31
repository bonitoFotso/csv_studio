import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { AddConstantColumnParams } from '@/engine/operations/addConstantColumn.ts';

export function AddConstantDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: AddConstantColumnParams) => void;
}) {
  const [name, setName] = React.useState('');
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setValue('');
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) return;
    onConfirm({ name: name.trim(), value });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonne constante</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la colonne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="session" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Valeur (identique sur toutes les lignes)</label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="2026-S2" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!name.trim()} onClick={submit}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
