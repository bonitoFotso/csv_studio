import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTableFromCsvFile, writeTableToCsvFile } from './csvIo.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadTableFromCsvFile', () => {
  it('parse un CSV avec en-tête et accents', () => {
    const path = join(dir, 'in.csv');
    writeFileSync(path, 'nom,ville\nÉric,Nîmes\nBob,Lyon\n', 'utf-8');
    const table = loadTableFromCsvFile(path);
    expect(table.columns.map((c) => c.name)).toEqual(['nom', 'ville']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells[table.columns[0].id]).toBe('Éric');
  });

  it('utilise le nom de fichier comme nom de table par défaut', () => {
    const path = join(dir, 'candidats.csv');
    writeFileSync(path, 'a\n1\n', 'utf-8');
    const table = loadTableFromCsvFile(path);
    expect(table.name).toBe('candidats.csv');
  });
});

describe('writeTableToCsvFile', () => {
  it('écrit un CSV avec BOM par défaut, relisible', () => {
    const table = loadTableFromCsvFile((() => {
      const p = join(dir, 'src.csv');
      writeFileSync(p, 'a,b\n1,2\n', 'utf-8');
      return p;
    })());
    const outPath = join(dir, 'out.csv');
    writeTableToCsvFile(table, outPath, { overwrite: false });
    const written = readFileSync(outPath, 'utf-8');
    expect(written.charCodeAt(0)).toBe(0xfeff);
    const reread = loadTableFromCsvFile(outPath);
    expect(reread.columns.map((c) => c.name)).toEqual(['a', 'b']);
    expect(reread.rows).toHaveLength(1);
  });

  it("refuse d'écraser un fichier existant sans overwrite: true", () => {
    const table = loadTableFromCsvFile((() => {
      const p = join(dir, 'src.csv');
      writeFileSync(p, 'a\n1\n', 'utf-8');
      return p;
    })());
    const outPath = join(dir, 'existing.csv');
    writeFileSync(outPath, 'déjà là', 'utf-8');
    expect(() => writeTableToCsvFile(table, outPath, { overwrite: false })).toThrow(/existe déjà/);
  });

  it('écrase quand overwrite: true est passé explicitement', () => {
    const table = loadTableFromCsvFile((() => {
      const p = join(dir, 'src.csv');
      writeFileSync(p, 'a\n1\n', 'utf-8');
      return p;
    })());
    const outPath = join(dir, 'existing.csv');
    writeFileSync(outPath, 'déjà là', 'utf-8');
    expect(() => writeTableToCsvFile(table, outPath, { overwrite: true })).not.toThrow();
  });
});
