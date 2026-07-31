import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from './index.ts';
import { getOperationDefinition } from '../registry.ts';
import { createTableFromRows, getColumnId } from '../table.ts';
import type { AppendRowsParams } from './appendRows.ts';
import type { ApplyContext, Table } from '../types.ts';

beforeAll(() => registerAllOperations());

function makeContext(sourceTable: Table): ApplyContext {
  return {
    getTableById: (id: string) => {
      if (id !== sourceTable.id) throw new Error('table introuvable');
      return sourceTable;
    },
    sequenceCounter: () => 0,
  };
}

describe('append_rows', () => {
  it('ajoute les lignes du fichier source en mappant les colonnes choisies', () => {
    const table = createTableFromRows('candidats', ['nom', 'prenom', 'note'], [{ nom: 'Fotso', prenom: 'Bonito', note: '15' }]);
    const source = createTableFromRows('nouveaux', ['nom_complet', 'prenom_complet'], [{ nom_complet: 'Kamga', prenom_complet: 'Alice' }]);
    const def = getOperationDefinition('append_rows');
    const params: AppendRowsParams = {
      sourceTableId: source.id,
      columnMapping: [
        { targetColumnId: getColumnId(table, 'nom'), sourceColumnId: getColumnId(source, 'nom_complet') },
        { targetColumnId: getColumnId(table, 'prenom'), sourceColumnId: getColumnId(source, 'prenom_complet') },
      ],
    };
    const { table: out, report } = def.apply(table, params, makeContext(source));

    expect(out.rows).toHaveLength(2);
    expect(out.rows[1].cells[getColumnId(table, 'nom')]).toBe('Kamga');
    expect(out.rows[1].cells[getColumnId(table, 'prenom')]).toBe('Alice');
    expect(out.rows[1].cells[getColumnId(table, 'note')]).toBe(''); // colonne cible non mappée
    expect(report.rowsAdded).toBe(1);
    expect(report.rowsOut).toBe(2);
  });

  it('ne modifie pas les colonnes de la table (pas de colonne créée depuis les colonnes source non mappées)', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: 'Fotso' }]);
    const source = createTableFromRows('s', ['nom', 'extra'], [{ nom: 'Kamga', extra: 'ignoré' }]);
    const def = getOperationDefinition('append_rows');
    const params: AppendRowsParams = {
      sourceTableId: source.id,
      columnMapping: [{ targetColumnId: getColumnId(table, 'nom'), sourceColumnId: getColumnId(source, 'nom') }],
    };
    const { table: out } = def.apply(table, params, makeContext(source));
    expect(out.columns.map((c) => c.name)).toEqual(['nom']);
  });

  it('plusieurs lignes ajoutées à la suite, table vide de colonnes cibles mappées = lignes vides ajoutées', () => {
    const table = createTableFromRows('t', ['a', 'b'], [{ a: '1', b: '2' }]);
    const source = createTableFromRows('s', ['x'], [{ x: 'p' }, { x: 'q' }]);
    const def = getOperationDefinition('append_rows');
    const params: AppendRowsParams = { sourceTableId: source.id, columnMapping: [] };
    const { table: out, report } = def.apply(table, params, makeContext(source));
    expect(out.rows).toHaveLength(3);
    expect(out.rows[1].cells).toEqual({ [getColumnId(table, 'a')]: '', [getColumnId(table, 'b')]: '' });
    expect(report.rowsAdded).toBe(2);
  });

  it('toPortable/rebind : round-trip avec un fichier source remappé', () => {
    const table = createTableFromRows('candidats', ['nom', 'prenom'], [{ nom: 'Fotso', prenom: 'Bonito' }]);
    const source = createTableFromRows('nouveaux', ['nom_complet', 'prenom_complet'], [{ nom_complet: 'Kamga', prenom_complet: 'Alice' }]);
    const def = getOperationDefinition('append_rows');
    const params: AppendRowsParams = {
      sourceTableId: source.id,
      columnMapping: [
        { targetColumnId: getColumnId(table, 'nom'), sourceColumnId: getColumnId(source, 'nom_complet') },
        { targetColumnId: getColumnId(table, 'prenom'), sourceColumnId: getColumnId(source, 'prenom_complet') },
      ],
    };
    const portable = def.toPortable(params, table, makeContext(source));
    expect(portable.columnNames.sort()).toEqual(['nom', 'prenom']);
    expect(portable.secondary).toEqual({ tableName: 'nouveaux', columnNames: ['nom_complet', 'prenom_complet'] });

    const nameToId = { nom: getColumnId(table, 'nom'), prenom: getColumnId(table, 'prenom') };
    const secondaryNameToId = { nom_complet: getColumnId(source, 'nom_complet'), prenom_complet: getColumnId(source, 'prenom_complet') };
    const rebuilt = def.rebind(portable.params, nameToId, { secondaryTable: source, secondaryNameToId }) as AppendRowsParams;
    expect(rebuilt.sourceTableId).toBe(source.id);

    const { table: out } = def.apply(table, rebuilt, makeContext(source));
    expect(out.rows[1].cells[getColumnId(table, 'nom')]).toBe('Kamga');
  });

  it('rebind échoue explicitement sans fichier source fourni', () => {
    const table = createTableFromRows('t', ['nom'], [{ nom: 'Fotso' }]);
    const source = createTableFromRows('s', ['nom'], [{ nom: 'Kamga' }]);
    const def = getOperationDefinition('append_rows');
    const params: AppendRowsParams = { sourceTableId: source.id, columnMapping: [{ targetColumnId: getColumnId(table, 'nom'), sourceColumnId: getColumnId(source, 'nom') }] };
    const portable = def.toPortable(params, table, makeContext(source));
    expect(() => def.rebind(portable.params, { nom: getColumnId(table, 'nom') })).toThrow(/secondaire/);
  });
});
