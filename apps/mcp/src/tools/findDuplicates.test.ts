import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findDuplicatesTool } from './findDuplicates.ts';
import { ToolInputError } from '../validate.ts';
import type { ToolContext } from './types.ts';

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-dupes-test-'));
  ctx = { workdir: dir };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('find_duplicates', () => {
  it('détecte des doublons normalisés (casse/espaces) par défaut', () => {
    writeFileSync(dir + '/in.csv', 'nom\nAlice\n  alice  \nBob\n', 'utf-8');
    const result = findDuplicatesTool.handler({ path: 'in.csv', keyColumns: ['nom'] }, ctx) as {
      totalGroups: number;
      totalDuplicateRows: number;
      mode: string;
    };
    expect(result.mode).toBe('normalized');
    expect(result.totalGroups).toBe(1);
    expect(result.totalDuplicateRows).toBe(2);
  });

  it('ne détecte rien en mode "exact" pour des variantes de casse', () => {
    writeFileSync(dir + '/in.csv', 'nom\nAlice\nalice\n', 'utf-8');
    const result = findDuplicatesTool.handler({ path: 'in.csv', keyColumns: ['nom'], mode: 'exact' }, ctx) as { totalGroups: number };
    expect(result.totalGroups).toBe(0);
  });

  it('plafonne le nombre de groupes renvoyés en échantillon', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `${i % 20}`).join('\n'); // 20 groupes de 2
    writeFileSync(dir + '/in.csv', `k\n${rows}\n`, 'utf-8');
    const result = findDuplicatesTool.handler({ path: 'in.csv', keyColumns: ['k'], sampleGroups: 5 }, ctx) as {
      totalGroups: number;
      groupsSample: { totalCount: number; truncated: boolean; sample: unknown[] };
    };
    expect(result.totalGroups).toBe(20);
    expect(result.groupsSample.sample).toHaveLength(5);
    expect(result.groupsSample.truncated).toBe(true);
  });

  it('rejette un "mode" invalide', () => {
    writeFileSync(dir + '/in.csv', 'nom\nAlice\n', 'utf-8');
    expect(() => findDuplicatesTool.handler({ path: 'in.csv', keyColumns: ['nom'], mode: 'bogus' }, ctx)).toThrow(ToolInputError);
  });

  it('rejette une colonne-clé introuvable', () => {
    writeFileSync(dir + '/in.csv', 'nom\nAlice\n', 'utf-8');
    expect(() => findDuplicatesTool.handler({ path: 'in.csv', keyColumns: ['pays'] }, ctx)).toThrow(/pays/);
  });
});
