import type { ColumnId, Table } from './types.ts';

export type DetectedType = 'empty' | 'integer' | 'decimal' | 'date' | 'boolean' | 'text';
export type AnomalyKind = 'leading_trailing_space' | 'multiple_spaces' | 'inconsistent_case' | 'mojibake';

export interface ColumnAnomaly {
  kind: AnomalyKind;
  examples: string[];
}

export interface ColumnProfile {
  columnId: ColumnId;
  detectedType: DetectedType;
  totalCount: number;
  filledCount: number;
  fillRate: number;
  distinctCount: number;
  topValues: { value: string; count: number }[];
  anomalies: ColumnAnomaly[];
}

const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+[.,]\d+$/;
const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})$/;
const BOOLEAN_TOKENS = new Set(['true', 'false', 'vrai', 'faux', 'oui', 'non', 'yes', 'no', '0', '1']);
const MOJIBAKE_RE = /Ã.|Â.|â€./;

function detectType(distinctValues: string[]): DetectedType {
  if (distinctValues.length === 0) return 'empty';
  if (distinctValues.every((v) => BOOLEAN_TOKENS.has(v.toLowerCase())) && distinctValues.length <= 2) return 'boolean';
  if (distinctValues.every((v) => INTEGER_RE.test(v))) return 'integer';
  if (distinctValues.every((v) => INTEGER_RE.test(v) || DECIMAL_RE.test(v))) return 'decimal';
  if (distinctValues.every((v) => DATE_RE.test(v))) return 'date';
  return 'text';
}

type CasePattern = 'upper' | 'lower' | 'title' | 'other';

function casePatternOf(value: string): CasePattern | null {
  if (!/[a-zA-ZÀ-ÿ]/.test(value)) return null; // pas de lettres : pas de casse à comparer
  if (value === value.toUpperCase() && value !== value.toLowerCase()) return 'upper';
  if (value === value.toLowerCase() && value !== value.toUpperCase()) return 'lower';
  const words = value.split(/\s+/).filter(Boolean);
  const isTitle = words.every((w) => w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase());
  return isTitle ? 'title' : 'other';
}

function findAnomalies(values: string[]): ColumnAnomaly[] {
  const anomalies: ColumnAnomaly[] = [];

  const leadingTrailing = values.filter((v) => v !== v.trim()).slice(0, 3);
  if (leadingTrailing.length > 0) anomalies.push({ kind: 'leading_trailing_space', examples: leadingTrailing });

  const multipleSpaces = values.filter((v) => /\s{2,}/.test(v)).slice(0, 3);
  if (multipleSpaces.length > 0) anomalies.push({ kind: 'multiple_spaces', examples: multipleSpaces });

  const mojibake = values.filter((v) => MOJIBAKE_RE.test(v) || v.includes('�')).slice(0, 3);
  if (mojibake.length > 0) anomalies.push({ kind: 'mojibake', examples: mojibake });

  const patternCounts = new Map<CasePattern, number>();
  const patternByValue = new Map<string, CasePattern>();
  for (const v of values) {
    const p = casePatternOf(v);
    if (!p) continue;
    patternByValue.set(v, p);
    patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
  }
  if (patternCounts.size > 1) {
    let majority: CasePattern | null = null;
    let majorityCount = 0;
    for (const [pattern, count] of patternCounts) {
      if (count > majorityCount) {
        majority = pattern;
        majorityCount = count;
      }
    }
    const inconsistent = values.filter((v) => patternByValue.has(v) && patternByValue.get(v) !== majority).slice(0, 3);
    if (inconsistent.length > 0) anomalies.push({ kind: 'inconsistent_case', examples: inconsistent });
  }

  return anomalies;
}

export function computeColumnProfile(table: Table, columnId: ColumnId): ColumnProfile {
  const allValues = table.rows.map((r) => r.cells[columnId] ?? '');
  const nonEmpty = allValues.filter((v) => v !== '');

  const counts = new Map<string, number>();
  for (const v of nonEmpty) counts.set(v, (counts.get(v) ?? 0) + 1);

  const topValues = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));

  return {
    columnId,
    detectedType: detectType([...counts.keys()]),
    totalCount: allValues.length,
    filledCount: nonEmpty.length,
    fillRate: allValues.length === 0 ? 0 : nonEmpty.length / allValues.length,
    distinctCount: counts.size,
    topValues,
    anomalies: findAnomalies(nonEmpty),
  };
}

export function computeAllProfiles(table: Table): ColumnProfile[] {
  return table.columns.map((c) => computeColumnProfile(table, c.id));
}
