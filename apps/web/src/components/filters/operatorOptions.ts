import type { ConditionOperator } from '@csv-studio/core/engine/filterEngine.ts';
import type { DetectedType } from '@csv-studio/core/engine/profile.ts';

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  eq: 'est égal à',
  neq: 'est différent de',
  contains: 'contient',
  starts_with: 'commence par',
  regex: 'correspond à (regex)',
  is_empty: 'est vide',
  is_not_empty: 'est non vide',
  in_list: 'est dans la liste',
  between: 'est entre',
};

const BASE: ConditionOperator[] = ['is_empty', 'is_not_empty'];

const BY_TYPE: Record<DetectedType, ConditionOperator[]> = {
  text: ['eq', 'neq', 'contains', 'starts_with', 'regex', 'in_list', ...BASE],
  integer: ['eq', 'neq', 'between', 'in_list', ...BASE],
  decimal: ['eq', 'neq', 'between', 'in_list', ...BASE],
  date: ['eq', 'neq', 'between', ...BASE],
  boolean: ['eq', 'neq', ...BASE],
  empty: [...BASE],
};

export function operatorsForType(type: DetectedType): ConditionOperator[] {
  return BY_TYPE[type];
}

export function needsValue(operator: ConditionOperator): boolean {
  return operator === 'eq' || operator === 'neq' || operator === 'contains' || operator === 'starts_with' || operator === 'regex';
}

export function needsList(operator: ConditionOperator): boolean {
  return operator === 'in_list';
}

export function needsRange(operator: ConditionOperator): boolean {
  return operator === 'between';
}
