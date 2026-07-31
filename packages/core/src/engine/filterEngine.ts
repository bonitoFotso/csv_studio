import type { ColumnId, Row } from './types.ts';

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'starts_with'
  | 'regex'
  | 'is_empty'
  | 'is_not_empty'
  | 'in_list'
  | 'between';

export interface Condition {
  kind: 'condition';
  columnId: ColumnId;
  operator: ConditionOperator;
  value?: string;
  values?: string[];
  min?: string;
  max?: string;
}

export interface ConditionGroup {
  kind: 'group';
  operator: 'and' | 'or';
  conditions: (ConditionGroup | Condition)[];
}

function tryParseNumber(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function tryParseDate(v: string): number | null {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function compareBetween(value: string, min?: string, max?: string): boolean {
  const numValue = tryParseNumber(value);
  const numMin = min !== undefined ? tryParseNumber(min) : undefined;
  const numMax = max !== undefined ? tryParseNumber(max) : undefined;
  if (numValue !== null && (numMin === null ? min === undefined : numMin !== null) && (numMax === null ? max === undefined : numMax !== null)) {
    if (numMin !== undefined && numMin !== null && numValue < numMin) return false;
    if (numMax !== undefined && numMax !== null && numValue > numMax) return false;
    return true;
  }
  const dateValue = tryParseDate(value);
  const dateMin = min !== undefined ? tryParseDate(min) : undefined;
  const dateMax = max !== undefined ? tryParseDate(max) : undefined;
  if (dateValue !== null) {
    if (dateMin !== undefined && dateMin !== null && dateValue < dateMin) return false;
    if (dateMax !== undefined && dateMax !== null && dateValue > dateMax) return false;
    return true;
  }
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function evaluateCondition(row: Row, cond: Condition): boolean {
  const value = row.cells[cond.columnId] ?? '';
  switch (cond.operator) {
    case 'eq':
      return value === (cond.value ?? '');
    case 'neq':
      return value !== (cond.value ?? '');
    case 'contains':
      return value.includes(cond.value ?? '');
    case 'starts_with':
      return value.startsWith(cond.value ?? '');
    case 'regex':
      try {
        return new RegExp(cond.value ?? '').test(value);
      } catch {
        return false;
      }
    case 'is_empty':
      return value === '';
    case 'is_not_empty':
      return value !== '';
    case 'in_list':
      return (cond.values ?? []).includes(value);
    case 'between':
      return compareBetween(value, cond.min, cond.max);
  }
}

export function evaluateGroup(row: Row, group: ConditionGroup): boolean {
  if (group.conditions.length === 0) return true;
  const results = group.conditions.map((c) => (c.kind === 'group' ? evaluateGroup(row, c) : evaluateCondition(row, c)));
  return group.operator === 'and' ? results.every(Boolean) : results.some(Boolean);
}
