import * as React from 'react';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import { suggestColumnMapping } from '@/engine/recipe.ts';
import type { AppendRowsParams } from '@/engine/operations/appendRows.ts';
import type { ColumnMapping, Pipeline, Table as EngineTable } from '@/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { MiniFileImport } from '@/components/recipes/MiniFileImport.tsx';

export function AppendRowsDialog({
  entryId,
  table,
  pipeline,
  open,
  onOpenChange,
}: {
  entryId: string;
  table: EngineTable;
  pipeline: Pipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setPipeline, setAuxiliaryTable } = useWorkspace();
  const [sourceTable, setSourceTable] = React.useState<EngineTable | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});

  React.useEffect(() => {
    if (open) {
      setSourceTable(null);
      setMapping({});
    }
  }, [open]);

  const loadSource = (t: EngineTable) => {
    setSourceTable(t);
    setMapping(
      suggestColumnMapping(
        table.columns.map((c) => c.name),
        t.columns.map((c) => c.name),
      ),
    );
  };

  const mappedCount = Object.values(mapping).filter((v) => v !== null).length;
  const canApply = sourceTable !== null && mappedCount > 0;

  const apply = () => {
    if (!sourceTable || !canApply) return;
    setAuxiliaryTable(entryId, sourceTable);

    const columnMapping = table.columns
      .map((c) => {
        const sourceName = mapping[c.name];
        if (!sourceName) return null;
        const sourceCol = sourceTable.columns.find((sc) => sc.name === sourceName);
        return sourceCol ? { targetColumnId: c.id, sourceColumnId: sourceCol.id } : null;
      })
      .filter((x): x is { targetColumnId: string; sourceColumnId: string } => x !== null);

    const params: AppendRowsParams = { sourceTableId: sourceTable.id, columnMapping };
    setPipeline(entryId, addStep(pipeline, createOperation('append_rows', params)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter des lignes depuis un fichier</DialogTitle>
        </DialogHeader>

        {!sourceTable ? (
          <MiniFileImport label="Importez le fichier dont vous voulez ajouter les lignes" onLoaded={loadSource} />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-[12px]">
              <span>
                Fichier source : <span className="cell-value font-medium">{sourceTable.name}</span> ({sourceTable.rows.length.toLocaleString('fr-FR')} ligne(s)
                à ajouter)
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSourceTable(null)}>
                Changer de fichier
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Pour chaque colonne de « {table.name} », choisissez la colonne correspondante dans le fichier source ({mappedCount}/{table.columns.length}{' '}
                mappées)
              </label>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {table.columns.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-[12px]">
                    <span className="cell-value w-36 shrink-0 truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="text-text-faint">←</span>
                    <select
                      value={mapping[c.name] ?? ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [c.name]: e.target.value || null }))}
                      className="h-7 flex-1 rounded-md border border-border bg-surface px-1.5 text-[12px]"
                    >
                      <option value="">— laisser vide —</option>
                      {sourceTable.columns.map((sc) => (
                        <option key={sc.id} value={sc.name}>
                          {sc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[12px] text-text-muted">
              {sourceTable.rows.length.toLocaleString('fr-FR')} ligne(s) seront ajoutées à la fin de « {table.name} ». Les colonnes non mappées resteront vides
              sur ces nouvelles lignes ; les colonnes du fichier source non mappées sont ignorées.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {sourceTable && (
            <Button disabled={!canApply} onClick={apply}>
              Ajouter {sourceTable.rows.length.toLocaleString('fr-FR')} ligne(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
