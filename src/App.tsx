import * as React from 'react';
import { Copy, Download, Filter, FolderOpen, Link2, ListPlus, Save } from 'lucide-react';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import type { ReorderColumnsParams } from '@/engine/operations/reorderColumns.ts';
import { mergeVisibleReorder } from '@/lib/columnOrder.ts';
import { WorkspaceProvider, useActiveTable, useWorkspace } from '@/state/workspace.tsx';
import { TableTabs } from '@/components/TableTabs.tsx';
import { ImportZone } from '@/components/ImportZone.tsx';
import { DataGrid } from '@/components/DataGrid.tsx';
import { ColumnProfilePanel } from '@/components/ColumnProfilePanel.tsx';
import { PipelineSidebar } from '@/components/PipelineSidebar.tsx';
import { ExportDialog } from '@/components/ExportDialog.tsx';
import { ColumnToolbar } from '@/components/columns/ColumnToolbar.tsx';
import { AddColumnMenu } from '@/components/columns/AddColumnMenu.tsx';
import { FilterBuilderDialog } from '@/components/filters/FilterBuilderDialog.tsx';
import { DuplicatesDialog } from '@/components/duplicates/DuplicatesDialog.tsx';
import { EnrichJoinDialog } from '@/components/join/EnrichJoinDialog.tsx';
import { SaveRecipeDialog } from '@/components/recipes/SaveRecipeDialog.tsx';
import { LoadRecipeDialog } from '@/components/recipes/LoadRecipeDialog.tsx';
import { AppendRowsDialog } from '@/components/append/AppendRowsDialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { BusyIndicator } from '@/components/ui/busy-indicator.tsx';
import { useDelayedFlag } from '@/hooks/useDelayedFlag.ts';

function Workspace() {
  const { tables, activeId, setPipeline } = useWorkspace();
  const active = useActiveTable();
  const [importOpen, setImportOpen] = React.useState(tables.length === 0);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [appendOpen, setAppendOpen] = React.useState(false);
  const [saveRecipeOpen, setSaveRecipeOpen] = React.useState(false);
  const [loadRecipeOpen, setLoadRecipeOpen] = React.useState(false);
  const [selectedColumnIds, setSelectedColumnIds] = React.useState<Set<string>>(new Set());

  // `activeId` (synchrone) décide de l'écran affiché ; `active` (résultat du rejeu, calculé
  // dans le Worker) peut être transitoirement null même quand un onglet est ouvert — on ne
  // veut pas retomber sur l'écran d'import dans ce cas, juste montrer un état de calcul.
  const showImport = importOpen || !activeId;
  const showBusy = useDelayedFlag(active?.recalculating ?? false, 150);

  React.useEffect(() => {
    setSelectedColumnIds(new Set());
  }, [active?.entry.id]);

  return (
    <div className="flex h-screen flex-col">
      <TableTabs onOpenImport={() => setImportOpen(true)} onSelectTab={() => setImportOpen(false)} />

      {showImport ? (
        <div className="flex-1">
          <ImportZone onImported={() => setImportOpen(false)} />
        </div>
      ) : !active ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-text-muted">Calcul en cours…</div>
      ) : (
        active && (
          <>
            {showBusy && <BusyIndicator progress={active.progress} />}
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="cell-value text-[12.5px] text-text-muted">{active.entry.displayName}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDuplicatesOpen(true)}>
                  <Copy size={14} />
                  Doublons
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFilterOpen(true)}>
                  <Filter size={14} />
                  Filtrer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)}>
                  <Link2 size={14} />
                  Rapprocher
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAppendOpen(true)}>
                  <ListPlus size={14} />
                  Ajouter des lignes
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
                  <Download size={14} />
                  Exporter
                </Button>
                <div className="mx-1 h-6 w-px bg-border" />
                <Button size="sm" variant="ghost" onClick={() => setLoadRecipeOpen(true)}>
                  <FolderOpen size={14} />
                  Charger une recette
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSaveRecipeOpen(true)}>
                  <Save size={14} />
                  Enregistrer la recette
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <AddColumnMenu entryId={active.entry.id} columns={active.displayTable.columns} pipeline={active.entry.pipeline} />
              <div className="h-5 w-px bg-border" />
              <ColumnToolbar
                entryId={active.entry.id}
                table={active.displayTable}
                pipeline={active.entry.pipeline}
                selectedColumnIds={selectedColumnIds}
                onClearSelection={() => setSelectedColumnIds(new Set())}
              />
            </div>

            <div className="grid flex-1 grid-cols-[220px_1fr_280px] overflow-hidden">
              <div className="overflow-hidden border-r border-border">
                <PipelineSidebar
                  entryId={active.entry.id}
                  sourceTable={active.entry.sourceTable}
                  pipeline={active.entry.pipeline}
                  reportsByIndex={active.reportsByIndex}
                />
              </div>
              <div className="overflow-hidden p-2">
                <DataGrid
                  table={active.displayTable}
                  selectedColumnIds={selectedColumnIds}
                  onToggleColumn={(id) =>
                    setSelectedColumnIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onToggleAllColumns={(ids, select) =>
                    setSelectedColumnIds((prev) => {
                      const next = new Set(prev);
                      for (const id of ids) {
                        if (select) next.add(id);
                        else next.delete(id);
                      }
                      return next;
                    })
                  }
                  onReorderVisibleColumns={(newVisibleOrder) => {
                    const order = mergeVisibleReorder(active.displayTable.columns, newVisibleOrder);
                    const operation = createOperation<ReorderColumnsParams>('reorder_columns', { order });
                    setPipeline(active.entry.id, addStep(active.entry.pipeline, operation));
                  }}
                />
              </div>
              <div className="overflow-hidden border-l border-border">
                <ColumnProfilePanel table={active.displayTable} />
              </div>
            </div>

            <ExportDialog table={active.displayTable} open={exportOpen} onOpenChange={setExportOpen} />
            <FilterBuilderDialog
              entryId={active.entry.id}
              table={active.displayTable}
              pipeline={active.entry.pipeline}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
            <DuplicatesDialog
              entryId={active.entry.id}
              table={active.displayTable}
              pipeline={active.entry.pipeline}
              open={duplicatesOpen}
              onOpenChange={setDuplicatesOpen}
            />
            <EnrichJoinDialog
              entryId={active.entry.id}
              table={active.displayTable}
              pipeline={active.entry.pipeline}
              open={joinOpen}
              onOpenChange={setJoinOpen}
            />
            <AppendRowsDialog
              entryId={active.entry.id}
              table={active.displayTable}
              pipeline={active.entry.pipeline}
              open={appendOpen}
              onOpenChange={setAppendOpen}
            />
            <SaveRecipeDialog entry={active.entry} open={saveRecipeOpen} onOpenChange={setSaveRecipeOpen} />
            <LoadRecipeDialog entry={active.entry} open={loadRecipeOpen} onOpenChange={setLoadRecipeOpen} />
          </>
        )
      )}
    </div>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <Workspace />
    </WorkspaceProvider>
  );
}

export default App;
