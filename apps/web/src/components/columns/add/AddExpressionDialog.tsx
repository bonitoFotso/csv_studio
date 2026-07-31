import * as React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { Column } from '@csv-studio/core/engine/types.ts';
import type { AddExpressionColumnParams, ExprNode } from '@csv-studio/core/engine/operations/addExpressionColumn.ts';

type OperandType = 'column' | 'literal';

function Operand({
  columns,
  type,
  onTypeChange,
  columnId,
  onColumnChange,
  literal,
  onLiteralChange,
}: {
  columns: Column[];
  type: OperandType;
  onTypeChange: (t: OperandType) => void;
  columnId: string;
  onColumnChange: (id: string) => void;
  literal: string;
  onLiteralChange: (v: string) => void;
}) {
  return (
    <div className="flex-1 space-y-1">
      <div className="flex gap-1 text-[11px]">
        <button
          className={`rounded px-1.5 py-0.5 ${type === 'column' ? 'bg-text text-surface' : 'bg-surface-alt text-text-muted'}`}
          onClick={() => onTypeChange('column')}
        >
          Colonne
        </button>
        <button
          className={`rounded px-1.5 py-0.5 ${type === 'literal' ? 'bg-text text-surface' : 'bg-surface-alt text-text-muted'}`}
          onClick={() => onTypeChange('literal')}
        >
          Valeur fixe
        </button>
      </div>
      {type === 'column' ? (
        <select
          value={columnId}
          onChange={(e) => onColumnChange(e.target.value)}
          className="h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px]"
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <Input value={literal} onChange={(e) => onLiteralChange(e.target.value)} placeholder="valeur" />
      )}
    </div>
  );
}

export function AddExpressionDialog({
  open,
  onOpenChange,
  columns,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Column[];
  onConfirm: (params: AddExpressionColumnParams) => void;
}) {
  const [name, setName] = React.useState('');
  const [op, setOp] = React.useState<'+' | '-' | '*' | '/'>('+');
  const [leftType, setLeftType] = React.useState<OperandType>('column');
  const [leftColumnId, setLeftColumnId] = React.useState(columns[0]?.id ?? '');
  const [leftLiteral, setLeftLiteral] = React.useState('');
  const [rightType, setRightType] = React.useState<OperandType>('column');
  const [rightColumnId, setRightColumnId] = React.useState(columns[0]?.id ?? '');
  const [rightLiteral, setRightLiteral] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setOp('+');
      setLeftType('column');
      setLeftColumnId(columns[0]?.id ?? '');
      setLeftLiteral('');
      setRightType('column');
      setRightColumnId(columns[0]?.id ?? '');
      setRightLiteral('');
    }
  }, [open, columns]);

  const submit = () => {
    if (!name.trim()) return;
    const left: ExprNode = leftType === 'column' ? { kind: 'column', columnId: leftColumnId } : { kind: 'literal', value: leftLiteral };
    const right: ExprNode = rightType === 'column' ? { kind: 'column', columnId: rightColumnId } : { kind: 'literal', value: rightLiteral };
    onConfirm({ name: name.trim(), expression: { kind: 'binary', op, left, right } });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Colonne par expression</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Nom de la colonne</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="total" />
          </div>
          <div className="flex items-end gap-2">
            <Operand
              columns={columns}
              type={leftType}
              onTypeChange={setLeftType}
              columnId={leftColumnId}
              onColumnChange={setLeftColumnId}
              literal={leftLiteral}
              onLiteralChange={setLeftLiteral}
            />
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as typeof op)}
              className="h-8 w-14 rounded-md border border-border bg-surface px-1 text-center text-[13px]"
            >
              <option value="+">+</option>
              <option value="-">−</option>
              <option value="*">×</option>
              <option value="/">÷</option>
            </select>
            <Operand
              columns={columns}
              type={rightType}
              onTypeChange={setRightType}
              columnId={rightColumnId}
              onColumnChange={setRightColumnId}
              literal={rightLiteral}
              onLiteralChange={setRightLiteral}
            />
          </div>
          <p className="text-[11px] text-text-faint">
            « + » concatène si les deux valeurs ne sont pas numériques. Les autres opérateurs renvoient une case vide si une valeur n'est pas un nombre.
          </p>
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
