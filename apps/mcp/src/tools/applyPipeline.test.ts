import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { applyPipelineTool } from './applyPipeline.ts';
import type { ToolContext } from './types.ts';

beforeAll(() => {
  registerAllOperations();
});

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-apply-test-'));
  ctx = { workdir: dir };
  writeFileSync(join(dir, 'in.csv'), 'nom,note\nAlice,12\nBob,15\n', 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const pipeline = { expectedColumns: ['nom'], steps: [{ type: 'rename_columns', params: { renames: [{ name: 'nom', newName: 'prenom' }] } }] };

describe('apply_pipeline', () => {
  it('écrit le résultat complet dans outputPath', () => {
    const result = applyPipelineTool.handler({ path: 'in.csv', pipeline, outputPath: 'out.csv' }, ctx) as { rowsWritten: number };
    expect(result.rowsWritten).toBe(2);
    const written = readFileSync(join(dir, 'out.csv'), 'utf-8');
    expect(written).toContain('prenom');
    expect(written).toContain('Alice');
    expect(written).toContain('Bob');
  });

  it("refuse d'écraser un fichier de sortie existant sans overwrite: true", () => {
    writeFileSync(join(dir, 'out.csv'), 'déjà là', 'utf-8');
    expect(() => applyPipelineTool.handler({ path: 'in.csv', pipeline, outputPath: 'out.csv' }, ctx)).toThrow(/existe déjà/);
  });

  it('écrase avec overwrite: true', () => {
    writeFileSync(join(dir, 'out.csv'), 'déjà là', 'utf-8');
    expect(() => applyPipelineTool.handler({ path: 'in.csv', pipeline, outputPath: 'out.csv', overwrite: true }, ctx)).not.toThrow();
  });

  it("la réponse reste bornée même si le fichier écrit contient toutes les lignes", () => {
    const manyRows = Array.from({ length: 100 }, (_, i) => `p${i},${i}`).join('\n');
    writeFileSync(join(dir, 'big.csv'), `nom,note\n${manyRows}\n`, 'utf-8');
    const result = applyPipelineTool.handler(
      { path: 'big.csv', pipeline: { expectedColumns: ['nom'], steps: [] }, outputPath: 'big-out.csv', sampleRows: 10 },
      ctx,
    ) as { rowsWritten: number; sample: { totalCount: number; truncated: boolean; sample: unknown[] } };
    expect(result.rowsWritten).toBe(100);
    expect(result.sample.sample).toHaveLength(10);
    expect(result.sample.truncated).toBe(true);
    const written = readFileSync(join(dir, 'big-out.csv'), 'utf-8').trim().split('\n');
    expect(written).toHaveLength(101); // en-tête + 100 lignes, le fichier lui n'est jamais tronqué
  });
});
