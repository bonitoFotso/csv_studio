import * as React from 'react';
import { Copy, Eye, EyeOff, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { addStep, createOperation } from '@/engine/pipeline.ts';
import type { ColumnId, Pipeline, Table as EngineTable } from '@/engine/types.ts';
import type { RenameColumnsParams } from '@/engine/operations/renameColumns.ts';
import type { DropColumnsParams } from '@/engine/operations/dropColumns.ts';
import type { HideColumnsParams } from '@/engine/operations/hideColumns.ts';
import type { DuplicateColumnParams } from '@/engine/operations/duplicateColumn.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.tsx';
import { NormalizeDialog } from '@/components/columns/NormalizeDialog.tsx';

export interface ColumnToolbarProps {
  entryId: string;
  table: EngineTable;
  pipeline: Pipeline;
  selectedColumnIds: Set<ColumnId>;
  onClearSelection: () => void;
}

export function ColumnToolbar({ entryId, table, pipeline, selectedColumnIds, onClearSelection }: ColumnToolbarProps) {
  const { setPipeline } = useWorkspace();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [dropOpen, setDropOpen] = React.useState(false);
  const [normalizeOpen, setNormalizeOpen] = React.useState(false);

  const selectedIds = [...selectedColumnIds].filter((id) => table.columns.some((c) => c.id === id));
  const selectedColumns = table.columns.filter((c) => selectedColumnIds.has(c.id));
  const count = selectedColumns.length;

  const append = (operation: ReturnType<typeof createOperation>) => setPipeline(entryId, addStep(pipeline, operation));

  const applyHide = (hidden: boolean) => {
    append(createOperation<HideColumnsParams>('hide_columns', { columnIds: selectedIds, hidden }));
  };

  const applyDrop = () => {
    append(createOperation<DropColumnsParams>('drop_columns', { columnIds: selectedIds }));
    onClearSelection();
  };

  if (count === 0) {
    return <p className="px-1 text-[11.5px] text-text-faint">Sélectionnez une ou plusieurs colonnes dans l'en-tête pour agir dessus.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="cell-value mr-1 text-[11.5px] text-text-muted">{count} sélectionnée{count > 1 ? 's' : ''}</span>

      {count === 1 && (
        <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
          <Pencil size={13} /> Renommer
        </Button>
      )}
      {count === 1 && (
        <Button variant="outline" size="sm" onClick={() => setDuplicateOpen(true)}>
          <Copy size={13} /> Dupliquer
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => applyHide(true)}>
        <EyeOff size={13} /> Masquer
      </Button>
      <Button variant="outline" size="sm" onClick={() => applyHide(false)}>
        <Eye size={13} /> Afficher
      </Button>
      <Button variant="outline" size="sm" onClick={() => setNormalizeOpen(true)}>
        <Sparkles size={13} /> Normaliser
      </Button>
      <Button variant="destructive" size="sm" onClick={() => setDropOpen(true)}>
        <Trash2 size={13} /> Supprimer
      </Button>
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        Désélectionner
      </Button>

      {count === 1 && (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          currentName={selectedColumns[0].name}
          onConfirm={(newName) => {
            append(createOperation<RenameColumnsParams>('rename_columns', { renames: [{ columnId: selectedColumns[0].id, newName }] }));
          }}
        />
      )}
      {count === 1 && (
        <DuplicateDialog
          open={duplicateOpen}
          onOpenChange={setDuplicateOpen}
          currentName={selectedColumns[0].name}
          onConfirm={(newName) => {
            append(createOperation<DuplicateColumnParams>('duplicate_column', { columnId: selectedColumns[0].id, newName }));
          }}
        />
      )}

      <ConfirmDialog
        open={dropOpen}
        onOpenChange={setDropOpen}
        title={`Supprimer ${count} colonne${count > 1 ? 's' : ''} ?`}
        description={`« ${selectedColumns.map((c) => c.name).join(' », « ')} » disparaîtra de toutes les vues et de l'export. Les lignes ne sont pas affectées.`}
        confirmLabel="Supprimer"
        onConfirm={applyDrop}
      />

      <NormalizeDialog
        open={normalizeOpen}
        onOpenChange={setNormalizeOpen}
        columns={table.columns}
        initialSelectedIds={selectedIds}
        onConfirm={(params) => append(createOperation('normalize_columns', params))}
      />
    </div>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (newName: string) => void;
}) {
  const [name, setName] = React.useState(currentName);
  React.useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Renommer la colonne</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onConfirm(name.trim());
              onOpenChange(false);
            }
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onConfirm(name.trim());
              onOpenChange(false);
            }}
          >
            Renommer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateDialog({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (newName: string) => void;
}) {
  const [name, setName] = React.useState(`${currentName} (copie)`);
  React.useEffect(() => {
    if (open) setName(`${currentName} (copie)`);
  }, [open, currentName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dupliquer la colonne</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onConfirm(name.trim());
              onOpenChange(false);
            }}
          >
            Dupliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
