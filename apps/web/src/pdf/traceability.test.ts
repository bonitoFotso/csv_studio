import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { createTableFromRows, getColumnId } from '@csv-studio/core/engine/table.ts';
import { createOperation, createPipeline, addStep } from '@csv-studio/core/engine/pipeline.ts';
import { replay } from '@csv-studio/core/engine/replay.ts';
import { buildTraceability } from './traceability.ts';
import type { EnrichJoinParams } from '@csv-studio/core/engine/operations/enrichJoin.ts';
import type { DropColumnsParams } from '@csv-studio/core/engine/operations/dropColumns.ts';

beforeAll(() => registerAllOperations());

describe('buildTraceability', () => {
  it('agrège les décomptes structurés du rapprochement, pas le texte des notes', () => {
    const left = createTableFromRows('candidats', ['id', 'nom'], [{ id: '1', nom: 'Fotso' }, { id: '2', nom: 'Kamga' }]);
    const right = createTableFromRows('presence', ['ref', 'nb'], [{ ref: '1', nb: '10' }]);

    let pipeline = createPipeline(left.id);
    pipeline = addStep(pipeline, createOperation<DropColumnsParams>('drop_columns', { columnIds: [] }));
    const joinParams: EnrichJoinParams = {
      rightTableId: right.id,
      keyPairs: [{ leftColumnId: getColumnId(left, 'id'), rightColumnId: getColumnId(right, 'ref') }],
      matchStrategy: 'exact',
      copyColumns: [{ rightColumnId: getColumnId(right, 'nb'), asName: 'nb' }],
      collision: 'suffix',
      joinType: 'left',
      multiMatch: 'first',
    };
    pipeline = addStep(pipeline, createOperation('enrich_join', joinParams));

    const { reportsByIndex } = replay(left, pipeline.steps, pipeline.cursor, { auxiliaryTables: [right] });
    const trace = buildTraceability(left, [right], pipeline, reportsByIndex, 'Ma recette');

    expect(trace.sourceFiles).toEqual([
      { name: 'candidats', rowCount: 2 },
      { name: 'presence', rowCount: 1 },
    ]);
    expect(trace.recipeName).toBe('Ma recette');
    expect(trace.steps).toHaveLength(2);
    expect(trace.totalAutoMatched).toBe(1);
    expect(trace.totalManualMatched).toBe(0);
    expect(trace.totalUnmatched).toBe(1);
    expect(trace.pipelineFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('deux pipelines différents produisent des empreintes différentes', () => {
    const table = createTableFromRows('t', ['a'], [{ a: '1' }]);
    let p1 = createPipeline(table.id);
    p1 = addStep(p1, createOperation<DropColumnsParams>('drop_columns', { columnIds: [getColumnId(table, 'a')] }));
    let p2 = createPipeline(table.id);
    p2 = addStep(p2, createOperation<DropColumnsParams>('drop_columns', { columnIds: [] }));

    const t1 = buildTraceability(table, [], p1, new Map());
    const t2 = buildTraceability(table, [], p2, new Map());
    expect(t1.pipelineFingerprint).not.toBe(t2.pipelineFingerprint);
  });
});
