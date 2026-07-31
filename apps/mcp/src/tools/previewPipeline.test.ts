import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { previewPipelineTool } from './previewPipeline.ts';
import type { ToolContext } from './types.ts';

beforeAll(() => {
  registerAllOperations();
});

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-preview-test-'));
  ctx = { workdir: dir };
  writeFileSync(join(dir, 'in.csv'), 'nom,note\nAlice,12\nBob,15\n', 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('preview_pipeline', () => {
  it("n'écrit rien sur le disque", () => {
    previewPipelineTool.handler(
      {
        path: 'in.csv',
        pipeline: { expectedColumns: ['nom'], steps: [{ type: 'rename_columns', params: { renames: [{ name: 'nom', newName: 'prenom' }] } }] },
      },
      ctx,
    );
    expect(existsSync(join(dir, 'out.csv'))).toBe(false);
  });

  it('renvoie un résumé par étape et un échantillon du résultat', () => {
    const result = previewPipelineTool.handler(
      {
        path: 'in.csv',
        pipeline: { expectedColumns: ['nom'], steps: [{ type: 'rename_columns', params: { renames: [{ name: 'nom', newName: 'prenom' }] } }] },
      },
      ctx,
    ) as { rowsOut: number; columns: string[]; steps: { type: string }[]; sample: { sample: Record<string, string>[] } };

    expect(result.rowsOut).toBe(2);
    expect(result.columns).toContain('prenom');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('rename_columns');
    expect(result.sample.sample[0]).toHaveProperty('prenom', 'Alice');
  });

  it('renvoie une erreur claire pour une colonne attendue introuvable', () => {
    expect(() =>
      previewPipelineTool.handler({ path: 'in.csv', pipeline: { expectedColumns: ['pays'], steps: [] } }, ctx),
    ).toThrow(/pays/);
  });
});
