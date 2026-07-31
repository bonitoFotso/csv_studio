import * as React from 'react';
import { buildRecipe } from '@csv-studio/core/engine/recipe.ts';
import type { Table } from '@csv-studio/core/engine/types.ts';
import type { WorkspaceEntry } from '@/state/workspace.tsx';
import { saveRecipe } from '@/persistence/db.ts';
import { downloadTextFile } from '@/lib/download.ts';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';

export function SaveRecipeDialog({ entry, open, onOpenChange }: { entry: WorkspaceEntry; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = React.useState(entry.displayName);
  const [alsoDownload, setAlsoDownload] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      setName(entry.displayName);
      setAlsoDownload(true);
    }
  }, [open, entry.displayName]);

  const hasJoinStep = entry.pipeline.steps.some((s) => s.operation.type === 'enrich_join');

  const save = () => {
    if (!name.trim()) return;
    const auxiliaryTables: Table[] = Object.values(entry.auxiliaryTables);
    const recipe = buildRecipe(name.trim(), entry.sourceTable, entry.pipeline, auxiliaryTables);
    void saveRecipe({ id: recipe.id, name: recipe.name, createdAt: recipe.createdAt, recipe });
    if (alsoDownload) {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'recette';
      downloadTextFile(`${slug}.json`, JSON.stringify(recipe, null, 2), 'application/json;charset=utf-8;');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Enregistrer la recette</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la recette</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <Checkbox checked={alsoDownload} onChange={(e) => setAlsoDownload(e.target.checked)} />
            Télécharger aussi un fichier .json
          </label>
          {hasJoinStep && (
            <p className="text-[11.5px] text-text-faint">
              Cette recette contient un rapprochement : au rejeu, il faudra réimporter et remapper le second fichier correspondant.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!name.trim()} onClick={save}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
