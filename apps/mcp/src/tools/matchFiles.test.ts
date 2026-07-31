import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchFilesTool } from './matchFiles.ts';
import { ToolInputError } from '../validate.ts';
import type { ToolContext } from './types.ts';

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-match-test-'));
  ctx = { workdir: dir };
  writeFileSync(join(dir, 'left.csv'), 'nom\nAlice\nBob\nCharlie\n', 'utf-8');
  writeFileSync(join(dir, 'right.csv'), 'nom_complet\nAlice\nBob\nDave\n', 'utf-8');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const keyPairs = [{ leftColumn: 'nom', rightColumn: 'nom_complet', normalization: 'text' }];

describe('match_files — exact', () => {
  it('compte appariés / non appariés de chaque côté', () => {
    const result = matchFilesTool.handler({ leftPath: 'left.csv', rightPath: 'right.csv', keyPairs }, ctx) as {
      matchedCount: number;
      unmatchedLeftCount: number;
      unmatchedRightCount: number;
    };
    expect(result.matchedCount).toBe(2); // Alice, Bob
    expect(result.unmatchedLeftCount).toBe(1); // Charlie
    expect(result.unmatchedRightCount).toBe(1); // Dave
  });

  it('écrit les non-appariés de chaque côté quand demandé, et refuse d\'écraser sans overwrite', () => {
    const result = matchFilesTool.handler(
      { leftPath: 'left.csv', rightPath: 'right.csv', keyPairs, unmatchedLeftOutputPath: 'ul.csv', unmatchedRightOutputPath: 'ur.csv' },
      ctx,
    ) as { unmatchedLeftOutputPath: string; unmatchedRightOutputPath: string };
    expect(result.unmatchedLeftOutputPath).toBe('ul.csv');
    expect(readFileSync(join(dir, 'ul.csv'), 'utf-8')).toContain('Charlie');
    expect(readFileSync(join(dir, 'ur.csv'), 'utf-8')).toContain('Dave');

    expect(() =>
      matchFilesTool.handler(
        { leftPath: 'left.csv', rightPath: 'right.csv', keyPairs, unmatchedLeftOutputPath: 'ul.csv' },
        ctx,
      ),
    ).toThrow(/existe déjà/);
  });

  it('compte les correspondances multiples comme ambiguës, pas comme appariées', () => {
    writeFileSync(join(dir, 'right2.csv'), 'nom_complet\nAlice\nAlice\n', 'utf-8');
    const result = matchFilesTool.handler(
      { leftPath: 'left.csv', rightPath: 'right2.csv', keyPairs },
      ctx,
    ) as { matchedCount: number; ambiguousCount: number };
    expect(result.ambiguousCount).toBe(1); // Alice a 2 candidats à droite
    expect(result.matchedCount).toBe(0);
  });
});

describe('match_files — fuzzy', () => {
  it('apparie malgré une variante de casse/espaces', () => {
    writeFileSync(join(dir, 'right3.csv'), 'nom_complet\n  ALICE  \nBOB\nDave\n', 'utf-8');
    const result = matchFilesTool.handler(
      { leftPath: 'left.csv', rightPath: 'right3.csv', matchStrategy: 'fuzzy', keyPairs },
      ctx,
    ) as { matchedCount: number };
    expect(result.matchedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('match_files — validation', () => {
  it('rejette "matchStrategy" invalide', () => {
    expect(() =>
      matchFilesTool.handler({ leftPath: 'left.csv', rightPath: 'right.csv', keyPairs, matchStrategy: 'bogus' }, ctx),
    ).toThrow(ToolInputError);
  });

  it('rejette keyPairs vide', () => {
    expect(() => matchFilesTool.handler({ leftPath: 'left.csv', rightPath: 'right.csv', keyPairs: [] }, ctx)).toThrow(ToolInputError);
  });

  it('rejette une colonne-clé introuvable côté droit', () => {
    expect(() =>
      matchFilesTool.handler(
        { leftPath: 'left.csv', rightPath: 'right.csv', keyPairs: [{ leftColumn: 'nom', rightColumn: 'pays' }] },
        ctx,
      ),
    ).toThrow(/pays/);
  });
});
