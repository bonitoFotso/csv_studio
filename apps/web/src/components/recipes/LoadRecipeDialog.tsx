import * as React from 'react';
import { FileJson, Trash2 } from 'lucide-react';
import { instantiateRecipe, mappingIsComplete, suggestColumnMapping, type SecondaryInput } from '@csv-studio/core/engine/recipe.ts';
import type { ColumnMapping, Recipe, Table } from '@csv-studio/core/engine/types.ts';
import type { WorkspaceEntry } from '@/state/workspace.tsx';
import { useWorkspace } from '@/state/workspace.tsx';
import { deleteRecipe, listRecipes, type StoredRecipe } from '@/persistence/db.ts';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { RemapGrid } from '@/components/recipes/RemapGrid.tsx';
import { MiniFileImport } from '@/components/recipes/MiniFileImport.tsx';

function isRecipeShape(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return Array.isArray(r.expectedColumns) && Array.isArray(r.steps) && typeof r.name === 'string';
}

export function LoadRecipeDialog({ entry, open, onOpenChange }: { entry: WorkspaceEntry; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { setPipeline, setAuxiliaryTable } = useWorkspace();
  const [savedRecipes, setSavedRecipes] = React.useState<StoredRecipe[]>([]);
  const [recipe, setRecipe] = React.useState<Recipe | null>(null);
  const [primaryMapping, setPrimaryMapping] = React.useState<ColumnMapping>({});
  const [secondaryTables, setSecondaryTables] = React.useState<Record<number, Table>>({});
  const [secondaryMappings, setSecondaryMappings] = React.useState<Record<number, ColumnMapping>>({});
  const jsonInputRef = React.useRef<HTMLInputElement>(null);

  const refreshRecipes = () => void listRecipes().then(setSavedRecipes);

  React.useEffect(() => {
    if (open) {
      refreshRecipes();
      setRecipe(null);
      setPrimaryMapping({});
      setSecondaryTables({});
      setSecondaryMappings({});
    }
  }, [open]);

  const pickRecipe = (r: Recipe) => {
    setRecipe(r);
    setPrimaryMapping(suggestColumnMapping(r.expectedColumns, entry.sourceTable.columns.map((c) => c.name)));
    setSecondaryTables({});
    setSecondaryMappings({});
  };

  const importJsonFile = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (!isRecipeShape(parsed)) throw new Error('format inattendu');
      pickRecipe(parsed);
    } catch {
      window.alert("Ce fichier ne ressemble pas à une recette CSV Studio valide.");
    }
  };

  const secondarySteps = recipe ? recipe.steps.map((s, i) => ({ step: s, index: i })).filter((x) => x.step.secondary) : [];

  const secondaryReady = secondarySteps.every(({ index }) => {
    const t = secondaryTables[index];
    const m = secondaryMappings[index];
    return t && m && mappingIsComplete(m);
  });
  const canConfirm = recipe !== null && mappingIsComplete(primaryMapping) && secondaryReady;

  const confirm = () => {
    if (!recipe || !canConfirm) return;
    const secondaryInputs: Record<number, SecondaryInput> = {};
    secondarySteps.forEach(({ index }) => {
      secondaryInputs[index] = { table: secondaryTables[index], mapping: secondaryMappings[index] };
    });
    const { pipeline, auxiliaryTables } = instantiateRecipe(recipe, entry.sourceTable, primaryMapping, secondaryInputs);
    setPipeline(entry.id, pipeline);
    for (const t of auxiliaryTables) setAuxiliaryTable(entry.id, t);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Charger une recette</DialogTitle>
        </DialogHeader>

        {!recipe ? (
          <div className="space-y-3">
            {savedRecipes.length > 0 ? (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border">
                {savedRecipes.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[12.5px] last:border-b-0">
                    <div>
                      <span className="font-medium text-text">{r.name}</span>
                      <span className="ml-2 text-[11px] text-text-faint">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => pickRecipe(r.recipe)}>
                        Charger
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          void deleteRecipe(r.id).then(refreshRecipes);
                        }}
                        title="Supprimer"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-text-faint">Aucune recette enregistrée pour l'instant.</p>
            )}

            <Button variant="outline" size="sm" onClick={() => jsonInputRef.current?.click()}>
              <FileJson size={14} /> Importer un fichier .json
            </Button>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importJsonFile(file);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-alt px-2.5 py-1.5 text-[12px]">
              <span>
                Recette : <span className="font-medium text-text">{recipe.name}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setRecipe(null)}>
                Changer de recette
              </Button>
            </div>

            {entry.pipeline.steps.length > 0 && (
              <p className="text-[11.5px] text-destructive">
                Le pipeline actuel de « {entry.displayName} » ({entry.pipeline.steps.length} étape(s)) sera remplacé par celui de la recette.
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Colonnes attendues de « {entry.displayName} » ({Object.values(primaryMapping).filter((v) => v !== null).length}/{recipe.expectedColumns.length}{' '}
                mappées)
              </label>
              <RemapGrid
                expectedColumns={recipe.expectedColumns}
                actualNames={entry.sourceTable.columns.map((c) => c.name)}
                mapping={primaryMapping}
                onChange={(expected, actual) => setPrimaryMapping((prev) => ({ ...prev, [expected]: actual }))}
              />
            </div>

            {secondarySteps.map(({ step, index }) => (
              <div key={index}>
                <label className="mb-1 block text-xs font-medium text-text-muted">
                  Étape {index + 1} — rapprochement avec « {step.secondary!.tableName} »
                </label>
                {!secondaryTables[index] ? (
                  <MiniFileImport
                    label={`Importez le fichier correspondant à « ${step.secondary!.tableName} »`}
                    onLoaded={(t) => {
                      setSecondaryTables((prev) => ({ ...prev, [index]: t }));
                      setSecondaryMappings((prev) => ({
                        ...prev,
                        [index]: suggestColumnMapping(step.secondary!.expectedColumns, t.columns.map((c) => c.name)),
                      }));
                    }}
                  />
                ) : (
                  <>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                      <span>{secondaryTables[index].name}</span>
                      <button
                        className="underline"
                        onClick={() => {
                          setSecondaryTables((prev) => {
                            const next = { ...prev };
                            delete next[index];
                            return next;
                          });
                        }}
                      >
                        changer de fichier
                      </button>
                    </div>
                    <RemapGrid
                      expectedColumns={step.secondary!.expectedColumns}
                      actualNames={secondaryTables[index].columns.map((c) => c.name)}
                      mapping={secondaryMappings[index] ?? {}}
                      onChange={(expected, actual) =>
                        setSecondaryMappings((prev) => ({ ...prev, [index]: { ...prev[index], [expected]: actual } }))
                      }
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {recipe && (
            <Button disabled={!canConfirm} onClick={confirm}>
              Confirmer et appliquer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
