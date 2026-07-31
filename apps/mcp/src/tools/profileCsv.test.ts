import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { profileCsvTool } from './profileCsv.ts';
import { ToolInputError } from '../validate.ts';
import type { ToolContext } from './types.ts';

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-profile-test-'));
  ctx = { workdir: dir };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('profile_csv', () => {
  it('profile un CSV avec valeurs manquantes et anomalies', () => {
    writeFileSync(
      join(dir, 'in.csv'),
      'nom,note\nAlice,12\n  Bob  ,15\nAlice,12\nCharlie,\n',
      'utf-8',
    );
    const result = profileCsvTool.handler({ path: 'in.csv' }, ctx) as {
      totalRows: number;
      columns: { name: string; detectedType: string; distinctCount: number; fillRate: number }[];
    };
    expect(result.totalRows).toBe(4);
    const noteCol = result.columns.find((c) => c.name === 'note')!;
    expect(noteCol.detectedType).toBe('integer');
    expect(noteCol.fillRate).toBe(0.75); // 3 remplies sur 4
    const nomCol = result.columns.find((c) => c.name === 'nom')!;
    expect(nomCol.distinctCount).toBe(3); // Alice, "  Bob  ", Charlie (brut, sans normalisation)
  });

  it('plafonne l\'échantillon et annonce la troncature', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n');
    writeFileSync(join(dir, 'big.csv'), `a\n${rows}\n`, 'utf-8');
    const result = profileCsvTool.handler({ path: 'big.csv', sampleRows: 5 }, ctx) as {
      totalRows: number;
      sample: { totalCount: number; truncated: boolean; sample: unknown[] };
    };
    expect(result.totalRows).toBe(50);
    expect(result.sample.totalCount).toBe(50);
    expect(result.sample.truncated).toBe(true);
    expect(result.sample.sample).toHaveLength(5);
  });

  it('rejette un argument "path" manquant', () => {
    expect(() => profileCsvTool.handler({}, ctx)).toThrow(ToolInputError);
  });

  it('refuse un chemin hors du répertoire de travail', () => {
    expect(() => profileCsvTool.handler({ path: '../outside.csv' }, ctx)).toThrow(/répertoire de travail/);
  });
});
