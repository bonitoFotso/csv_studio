import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { AddSequenceColumnParams } from '@csv-studio/core/engine/operations/addSequenceColumn.ts';

export function AddSequenceDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: AddSequenceColumnParams) => void;
}) {
  const [name, setName] = React.useState('');
  const [start, setStart] = React.useState('1');
  const [step, setStep] = React.useState('1');

  React.useEffect(() => {
    if (open) {
      setName('');
      setStart('1');
      setStep('1');
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) return;
    onConfirm({ name: name.trim(), start: Number(start) || 0, step: Number(step) || 1 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonne de numérotation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la colonne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="numero" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Départ</label>
              <Input type="number" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Pas</label>
              <Input type="number" value={step} onChange={(e) => setStep(e.target.value)} />
            </div>
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
