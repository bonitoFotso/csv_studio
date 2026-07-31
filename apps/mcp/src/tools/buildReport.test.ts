import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReportTool } from './buildReport.ts';
import type { ToolContext } from './types.ts';

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-report-test-'));
  ctx = { workdir: dir };
  writeFileSync(dir + '/in.csv', 'nom,decision\nAlice,Admis\nBob,Recalé\nCharlie,Admis\n', 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const spec = {
  formatVersion: 1,
  kind: 'report' as const,
  title: 'Rapport test',
  expectedColumns: ['nom', 'decision'],
  blocks: [
    { type: 'kpi_row', items: [{ label: 'Total', agg: { fn: 'count' } }] },
    { type: 'table', title: 'Admis', columns: ['nom'], filter: { kind: 'group', operator: 'and', conditions: [{ kind: 'condition', columnId: 'decision', operator: 'eq', value: 'Admis' }] } },
  ],
};

describe('build_report', () => {
  it('renvoie valid: false avec les erreurs pour un ReportSpec malformé', () => {
    const result = buildReportTool.handler({ path: 'in.csv', reportSpec: { title: 'x' } }, ctx) as { valid: boolean; errors: unknown[] };
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('calcule les blocs pour un ReportSpec valide avec mapping identité', () => {
    const result = buildReportTool.handler({ path: 'in.csv', reportSpec: spec }, ctx) as {
      valid: boolean;
      blocks: { type: string; items?: { value: string }[]; rows?: string[][] }[];
    };
    expect(result.valid).toBe(true);
    const kpi = result.blocks[0];
    expect(kpi.items?.[0].value).toBe('3');
    const table = result.blocks[1];
    expect(table.rows).toHaveLength(2); // Alice, Charlie
  });

  it('applique un mapping explicite quand fourni', () => {
    writeFileSync(dir + '/autre.csv', 'nom_complet,verdict\nAlice,Admis\n', 'utf-8');
    const result = buildReportTool.handler(
      { path: 'autre.csv', reportSpec: spec, mapping: { nom: 'nom_complet', decision: 'verdict' } },
      ctx,
    ) as { valid: boolean };
    expect(result.valid).toBe(true);
  });

  it('signale une colonne attendue non résolue par le mapping', () => {
    writeFileSync(dir + '/autre.csv', 'x,y\n1,2\n', 'utf-8');
    expect(() => buildReportTool.handler({ path: 'autre.csv', reportSpec: spec }, ctx)).toThrow(/nom|decision/);
  });

  it('plafonne les lignes des blocs table pour le transport, avec un indicateur distinct', () => {
    const manyRows = Array.from({ length: 50 }, (_, i) => `p${i},Admis`).join('\n');
    writeFileSync(dir + '/big.csv', `nom,decision\n${manyRows}\n`, 'utf-8');
    const bigSpec = { ...spec, blocks: [spec.blocks[1]] };
    const result = buildReportTool.handler({ path: 'big.csv', reportSpec: bigSpec, sampleRowsPerTableBlock: 5 }, ctx) as {
      blocks: { rows: string[][]; totalMatching: number; transportTruncated?: boolean }[];
    };
    expect(result.blocks[0].totalMatching).toBe(50);
    expect(result.blocks[0].rows).toHaveLength(5);
    expect(result.blocks[0].transportTruncated).toBe(true);
  });
});
