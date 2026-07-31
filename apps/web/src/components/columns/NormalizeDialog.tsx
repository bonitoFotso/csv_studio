import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import type { Column, ColumnId } from '@csv-studio/core/engine/types.ts';
import type { NormalizeColumnsParams } from '@csv-studio/core/engine/operations/normalizeColumns.ts';
import type { NormalizeStep } from '@csv-studio/core/engine/normalize.ts';

type CaseOption = 'none' | 'upper' | 'lower' | 'title';

export function NormalizeDialog({
  open,
  onOpenChange,
  columns,
  initialSelectedIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  initialSelectedIds: ColumnId[];
  onConfirm: (params: NormalizeColumnsParams) => void;
}) {
  const [selected, setSelected] = React.useState<Set<ColumnId>>(new Set());
  const [trim, setTrim] = React.useState(true);
  const [collapseSpaces, setCollapseSpaces] = React.useState(true);
  const [caseOption, setCaseOption] = React.useState<CaseOption>('none');
  const [stripAccents, setStripAccents] = React.useState(false);
  const [stripPunctuation, setStripPunctuation] = React.useState(false);
  const [digitsOnly, setDigitsOnly] = React.useState(false);
  const [createNewColumn, setCreateNewColumn] = React.useState(false);
  const [suffix, setSuffix] = React.useState(' (normalisé)');

  React.useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelectedIds));
      setTrim(true);
      setCollapseSpaces(true);
      setCaseOption('none');
      setStripAccents(false);
      setStripPunctuation(false);
      setDigitsOnly(false);
      setCreateNewColumn(false);
      setSuffix(' (normalisé)');
    }
  }, [open, initialSelectedIds]);

  const toggle = (id: ColumnId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const steps: NormalizeStep[] = [
    ...(trim ? (['trim'] as const) : []),
    ...(collapseSpaces ? (['collapse_spaces'] as const) : []),
    ...(caseOption !== 'none' ? [caseOption as NormalizeStep] : []),
    ...(stripAccents ? (['strip_accents'] as const) : []),
    ...(stripPunctuation ? (['strip_punctuation'] as const) : []),
    ...(digitsOnly ? (['digits_only'] as const) : []),
  ];

  const submit = () => {
    if (selected.size === 0 || steps.length === 0) return;
    onConfirm({
      columnIds: [...selected],
      steps,
      mode: createNewColumn ? 'new_column' : 'overwrite',
      newColumnSuffix: createNewColumn ? suffix : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Normaliser des colonnes</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Colonnes concernées ({selected.size})</label>
            <div className="max-h-32 overflow-y-auto rounded-md border border-border">
              {columns.map((c) => (
                <label key={c.id} className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-[12.5px] last:border-b-0">
                  <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="cell-value truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Transformations (appliquées dans cet ordre)</label>
            <div className="space-y-1.5 text-[12.5px]">
              <label className="flex items-center gap-2">
                <Checkbox checked={trim} onChange={(e) => setTrim(e.target.checked)} /> Espaces en début/fin (trim)
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={collapseSpaces} onChange={(e) => setCollapseSpaces(e.target.checked)} /> Espaces multiples réduits
              </label>
              <div className="flex items-center gap-3 pl-0.5">
                <span className="text-text-muted">Casse :</span>
                {(['none', 'upper', 'lower', 'title'] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-1">
                    <input type="radio" name="case" checked={caseOption === opt} onChange={() => setCaseOption(opt)} />
                    {opt === 'none' ? 'inchangée' : opt === 'upper' ? 'MAJ' : opt === 'lower' ? 'min' : 'Titre'}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <Checkbox checked={stripAccents} onChange={(e) => setStripAccents(e.target.checked)} /> Suppression des accents
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={stripPunctuation} onChange={(e) => setStripPunctuation(e.target.checked)} /> Suppression de la ponctuation
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={digitsOnly} onChange={(e) => setDigitsOnly(e.target.checked)} /> Chiffres seulement
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px]">
            <Checkbox checked={createNewColumn} onChange={(e) => setCreateNewColumn(e.target.checked)} />
            Créer une colonne technique au lieu d'écraser l'original
          </label>
          {createNewColumn && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">Suffixe</label>
              <Input value={suffix} onChange={(e) => setSuffix(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={selected.size === 0 || steps.length === 0} onClick={submit}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
