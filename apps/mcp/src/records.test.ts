import { describe, expect, it } from 'vitest';
import { createTableFromRows } from '@csv-studio/core/engine/table.ts';
import { boundRecords, resolveExactColumnIds, rowsToRecords } from './records.ts';

function sampleTable() {
  return createTableFromRows('t', ['nom', 'ville'], [
    { nom: 'Alice', ville: 'Paris' },
    { nom: 'Bob', ville: 'Lyon' },
    { nom: 'Chloé', ville: 'Nice' },
  ]);
}

describe('rowsToRecords', () => {
  it('convertit des lignes internes en objets nommés', () => {
    const table = sampleTable();
    expect(rowsToRecords(table, table.rows)).toEqual([
      { nom: 'Alice', ville: 'Paris' },
      { nom: 'Bob', ville: 'Lyon' },
      { nom: 'Chloé', ville: 'Nice' },
    ]);
  });
});

describe('boundRecords', () => {
  it('plafonne avant conversion et annonce le total réel', () => {
    const table = sampleTable();
    const result = boundRecords(table, table.rows, 2);
    expect(result.totalCount).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.sample).toEqual([
      { nom: 'Alice', ville: 'Paris' },
      { nom: 'Bob', ville: 'Lyon' },
    ]);
  });
});

describe('resolveExactColumnIds', () => {
  it('résout des noms existants en ColumnId réels', () => {
    const table = sampleTable();
    const ids = resolveExactColumnIds(table, ['ville', 'nom']);
    expect(ids).toEqual([table.columns[1].id, table.columns[0].id]);
  });

  it('lève une erreur listant les noms introuvables et les colonnes disponibles', () => {
    const table = sampleTable();
    expect(() => resolveExactColumnIds(table, ['nom', 'pays'])).toThrow(/pays/);
    expect(() => resolveExactColumnIds(table, ['pays'])).toThrow(/nom, ville/);
  });
});
