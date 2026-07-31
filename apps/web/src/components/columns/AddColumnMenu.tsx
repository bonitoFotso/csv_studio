import * as React from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { addStep, createOperation } from '@csv-studio/core/engine/pipeline.ts';
import type { Column, OperationType, Pipeline } from '@csv-studio/core/engine/types.ts';
import { useWorkspace } from '@/state/workspace.tsx';
import { Button } from '@/components/ui/button.tsx';
import { AddConstantDialog } from '@/components/columns/add/AddConstantDialog.tsx';
import { AddConcatDialog } from '@/components/columns/add/AddConcatDialog.tsx';
import { AddExtractDialog } from '@/components/columns/add/AddExtractDialog.tsx';
import { AddSequenceDialog } from '@/components/columns/add/AddSequenceDialog.tsx';
import { AddExpressionDialog } from '@/components/columns/add/AddExpressionDialog.tsx';

type Kind = 'add_constant_column' | 'add_concat_column' | 'add_extract_column' | 'add_sequence_column' | 'add_expression_column';

const MENU_ITEMS: { type: Kind; label: string }[] = [
  { type: 'add_constant_column', label: 'Valeur constante' },
  { type: 'add_concat_column', label: 'Concaténation' },
  { type: 'add_extract_column', label: 'Extraction' },
  { type: 'add_sequence_column', label: 'Numérotation' },
  { type: 'add_expression_column', label: 'Expression simple' },
];

export function AddColumnMenu({ entryId, columns, pipeline }: { entryId: string; columns: Column[]; pipeline: Pipeline }) {
  const { setPipeline } = useWorkspace();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeDialog, setActiveDialog] = React.useState<Kind | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const append = <P,>(type: OperationType, params: P) => setPipeline(entryId, addStep(pipeline, createOperation(type, params)));

  return (
    <div ref={containerRef} className="relative">
      <Button variant="outline" size="sm" onClick={() => setMenuOpen((v) => !v)}>
        <Plus size={13} /> Colonne <ChevronDown size={12} />
      </Button>
      {menuOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-md border border-border bg-surface py-1 shadow-lg">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.type}
              className="block w-full px-3 py-1.5 text-left text-[12.5px] text-text hover:bg-surface-alt"
              onClick={() => {
                setActiveDialog(item.type);
                setMenuOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <AddConstantDialog
        open={activeDialog === 'add_constant_column'}
        onOpenChange={(o) => !o && setActiveDialog(null)}
        onConfirm={(params) => append('add_constant_column', params)}
      />
      <AddConcatDialog
        open={activeDialog === 'add_concat_column'}
        onOpenChange={(o) => !o && setActiveDialog(null)}
        columns={columns}
        onConfirm={(params) => append('add_concat_column', params)}
      />
      <AddExtractDialog
        open={activeDialog === 'add_extract_column'}
        onOpenChange={(o) => !o && setActiveDialog(null)}
        columns={columns}
        onConfirm={(params) => append('add_extract_column', params)}
      />
      <AddSequenceDialog
        open={activeDialog === 'add_sequence_column'}
        onOpenChange={(o) => !o && setActiveDialog(null)}
        onConfirm={(params) => append('add_sequence_column', params)}
      />
      <AddExpressionDialog
        open={activeDialog === 'add_expression_column'}
        onOpenChange={(o) => !o && setActiveDialog(null)}
        columns={columns}
        onConfirm={(params) => append('add_expression_column', params)}
      />
    </div>
  );
}
