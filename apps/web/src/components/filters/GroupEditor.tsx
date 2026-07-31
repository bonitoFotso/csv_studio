import { Plus, Trash2 } from 'lucide-react';
import type { Condition, ConditionGroup } from '@/engine/filterEngine.ts';
import type { Column, ColumnId } from '@/engine/types.ts';
import type { DetectedType } from '@/engine/profile.ts';
import { Button } from '@/components/ui/button.tsx';
import { ConditionRow } from '@/components/filters/ConditionRow.tsx';

function newCondition(columns: Column[]): Condition {
  return { kind: 'condition', columnId: columns[0]?.id ?? '', operator: 'eq', value: '' };
}

function newGroup(): ConditionGroup {
  return { kind: 'group', operator: 'and', conditions: [] };
}

export function GroupEditor({
  group,
  columns,
  typeByColumn,
  onChange,
  onRemove,
  depth = 0,
}: {
  group: ConditionGroup;
  columns: Column[];
  typeByColumn: Map<ColumnId, DetectedType>;
  onChange: (next: ConditionGroup) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const updateChild = (index: number, next: Condition | ConditionGroup) => {
    const conditions = [...group.conditions];
    conditions[index] = next;
    onChange({ ...group, conditions });
  };

  const removeChild = (index: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) });
  };

  return (
    <div className={depth > 0 ? 'rounded-md border border-border bg-bg/40 p-2' : ''}>
      <div className="mb-1 flex items-center gap-2">
        <div className="flex rounded-md border border-border text-[11px]">
          <button
            className={`px-2 py-0.5 ${group.operator === 'and' ? 'bg-text text-surface' : 'text-text-muted'}`}
            onClick={() => onChange({ ...group, operator: 'and' })}
          >
            ET
          </button>
          <button
            className={`px-2 py-0.5 ${group.operator === 'or' ? 'bg-text text-surface' : 'text-text-muted'}`}
            onClick={() => onChange({ ...group, operator: 'or' })}
          >
            OU
          </button>
        </div>
        {depth > 0 && onRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove} title="Supprimer ce groupe">
            <Trash2 size={12} />
          </Button>
        )}
      </div>

      <div className="divide-y divide-border">
        {group.conditions.map((child, i) =>
          child.kind === 'group' ? (
            <div key={i} className="py-1">
              <GroupEditor
                group={child}
                columns={columns}
                typeByColumn={typeByColumn}
                onChange={(next) => updateChild(i, next)}
                onRemove={() => removeChild(i)}
                depth={depth + 1}
              />
            </div>
          ) : (
            <ConditionRow
              key={i}
              condition={child}
              columns={columns}
              typeByColumn={typeByColumn}
              onChange={(next) => updateChild(i, next)}
              onRemove={() => removeChild(i)}
            />
          ),
        )}
      </div>

      <div className="mt-1 flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition(columns)] })}>
          <Plus size={12} /> Condition
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...group, conditions: [...group.conditions, newGroup()] })}>
          <Plus size={12} /> Groupe
        </Button>
      </div>
    </div>
  );
}
