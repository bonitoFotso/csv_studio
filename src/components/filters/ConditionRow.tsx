import { Trash2 } from 'lucide-react';
import type { Condition, ConditionOperator } from '@/engine/filterEngine.ts';
import type { Column, ColumnId } from '@/engine/types.ts';
import type { DetectedType } from '@/engine/profile.ts';
import { Input } from '@/components/ui/input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { needsList, needsRange, needsValue, operatorsForType, OPERATOR_LABEL } from '@/components/filters/operatorOptions.ts';

export function ConditionRow({
  condition,
  columns,
  typeByColumn,
  onChange,
  onRemove,
}: {
  condition: Condition;
  columns: Column[];
  typeByColumn: Map<ColumnId, DetectedType>;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}) {
  const detectedType = typeByColumn.get(condition.columnId) ?? 'text';
  const operators = operatorsForType(detectedType);

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <select
        value={condition.columnId}
        onChange={(e) => onChange({ ...condition, columnId: e.target.value, operator: 'eq' })}
        className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
        className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px]"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABEL[op]}
          </option>
        ))}
      </select>

      {needsValue(condition.operator) && (
        <Input
          className="h-7 w-40"
          value={condition.value ?? ''}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="valeur"
        />
      )}

      {needsList(condition.operator) && (
        <textarea
          value={(condition.values ?? []).join('\n')}
          onChange={(e) => onChange({ ...condition, values: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
          placeholder={'une valeur par ligne'}
          rows={2}
          className="h-14 w-40 rounded-md border border-border bg-surface px-1.5 py-1 text-[12px]"
        />
      )}

      {needsRange(condition.operator) && (
        <>
          <Input className="h-7 w-24" value={condition.min ?? ''} onChange={(e) => onChange({ ...condition, min: e.target.value })} placeholder="min" />
          <span className="text-[11px] text-text-faint">et</span>
          <Input className="h-7 w-24" value={condition.max ?? ''} onChange={(e) => onChange({ ...condition, max: e.target.value })} placeholder="max" />
        </>
      )}

      <Button variant="ghost" size="icon" onClick={onRemove} title="Retirer cette condition">
        <Trash2 size={13} />
      </Button>
    </div>
  );
}
