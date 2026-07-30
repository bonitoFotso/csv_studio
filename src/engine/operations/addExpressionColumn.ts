import { createId } from '../ids.ts';
import type { ColumnId, OperationDefinition, Row, Table } from '../types.ts';
import { columnName, makeReport, resolveId } from './reportUtil.ts';

// Arbre d'expression restreint : pas d'eval() de texte libre (risque d'injection),
// les colonnes sont référencées par ColumnId comme partout ailleurs dans le moteur.
export type ExprNode =
  | { kind: 'literal'; value: string }
  | { kind: 'column'; columnId: ColumnId }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: ExprNode; right: ExprNode };

export interface AddExpressionColumnParams {
  name: string;
  expression: ExprNode;
}

function toNumber(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function evaluateNode(node: ExprNode, row: Row): string {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'column':
      return row.cells[node.columnId] ?? '';
    case 'binary': {
      const left = evaluateNode(node.left, row);
      const right = evaluateNode(node.right, row);
      const leftNum = toNumber(left);
      const rightNum = toNumber(right);
      if (node.op === '+') {
        if (leftNum !== null && rightNum !== null) return String(leftNum + rightNum);
        return left + right;
      }
      if (leftNum === null || rightNum === null) return '';
      if (node.op === '-') return String(leftNum - rightNum);
      if (node.op === '*') return String(leftNum * rightNum);
      return rightNum === 0 ? '' : String(leftNum / rightNum);
    }
  }
}

function collectColumnIds(node: ExprNode, out: ColumnId[]): void {
  if (node.kind === 'column') out.push(node.columnId);
  else if (node.kind === 'binary') {
    collectColumnIds(node.left, out);
    collectColumnIds(node.right, out);
  }
}

function nodeToPortable(node: ExprNode, table: Table): unknown {
  switch (node.kind) {
    case 'literal':
      return node;
    case 'column':
      return { kind: 'column', name: columnName(table, node.columnId) };
    case 'binary':
      return { kind: 'binary', op: node.op, left: nodeToPortable(node.left, table), right: nodeToPortable(node.right, table) };
  }
}

function nodeFromPortable(node: any, nameToId: Record<string, ColumnId>): ExprNode {
  switch (node.kind) {
    case 'literal':
      return { kind: 'literal', value: node.value };
    case 'column':
      return { kind: 'column', columnId: resolveId(nameToId, node.name) };
    case 'binary':
      return { kind: 'binary', op: node.op, left: nodeFromPortable(node.left, nameToId), right: nodeFromPortable(node.right, nameToId) };
    default:
      throw new Error(`Nœud d'expression inconnu: ${node.kind}`);
  }
}

export const addExpressionColumnDefinition: OperationDefinition<AddExpressionColumnParams> = {
  type: 'add_expression_column',

  apply(table: Table, params: AddExpressionColumnParams) {
    const newId = createId();
    const columns = [...table.columns, { id: newId, name: params.name, hidden: false }];
    const rows = table.rows.map((r) => ({ ...r, cells: { ...r.cells, [newId]: evaluateNode(params.expression, r) } }));
    return {
      table: { ...table, columns, rows },
      report: makeReport({ rowsIn: table.rows.length, rowsOut: rows.length }),
    };
  },

  toPortable(params, tableBeforeStep) {
    const ids: ColumnId[] = [];
    collectColumnIds(params.expression, ids);
    return {
      params: { name: params.name, expression: nodeToPortable(params.expression, tableBeforeStep) },
      columnNames: ids.map((id) => columnName(tableBeforeStep, id)),
    };
  },

  rebind(portableParams, nameToId) {
    const p = portableParams as { name: string; expression: any };
    return { name: p.name, expression: nodeFromPortable(p.expression, nameToId) };
  },
};
