import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import type { Column } from '@/engine/types.ts';
import type { AddConcatColumnParams } from '@/engine/operations/addConcatColumn.ts';

export function AddConcatDialog({
  open,
  onOpenChange,
  columns,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  onConfirm: (params: AddConcatColumnParams) => void;
}) {
  const [name, setName] = React.useState('');
  const [separator, setSeparator] = React.useState(' ');
  const [order, setOrder] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setName('');
      setSeparator(' ');
      setOrder([]);
    }
  }, [open]);

  const toggle = (id: string) => {
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = () => {
    if (!name.trim() || order.length === 0) return;
    onConfirm({ name: name.trim(), columnIds: order, separator });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonne concaténée</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la colonne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="nom_complet" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes à assembler (dans l'ordre de sélection)</label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {columns.map((c) => {
                const position = order.indexOf(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-[12.5px] last:border-b-0">
                    <Checkbox checked={position !== -1} onChange={() => toggle(c.id)} />
                    <span className="cell-value truncate">{c.name}</span>
                    {position !== -1 && <span className="ml-auto text-[10px] text-text-faint">#{position + 1}</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Séparateur</label>
            <Input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder="espace, virgule…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!name.trim() || order.length === 0} onClick={submit}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
