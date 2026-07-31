import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { handleMessage, PROTOCOL_VERSION, SERVER_NAME } from './server.ts';
import type { ToolContext } from './tools/types.ts';

beforeAll(() => {
  registerAllOperations();
});

let dir: string;
let ctx: ToolContext;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'csv-studio-mcp-server-test-'));
  ctx = { workdir: dir };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('handleMessage — cycle de vie', () => {
  it('initialize renvoie les infos serveur', () => {
    const resp = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, ctx);
    expect(resp).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: PROTOCOL_VERSION, serverInfo: { name: SERVER_NAME } },
    });
  });

  it('notifications/initialized ne renvoie rien', () => {
    const resp = handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx);
    expect(resp).toBeUndefined();
  });

  it('ping renvoie un objet vide', () => {
    const resp = handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }, ctx);
    expect(resp).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
  });

  it('une méthode inconnue renvoie une erreur JSON-RPC -32601', () => {
    const resp = handleMessage({ jsonrpc: '2.0', id: 3, method: 'inconnue/xyz' }, ctx);
    expect(resp).toMatchObject({ jsonrpc: '2.0', id: 3, error: { code: -32601 } });
  });

  it('une notification pour une méthode inconnue est ignorée sans erreur', () => {
    const resp = handleMessage({ jsonrpc: '2.0', method: 'inconnue/xyz' }, ctx);
    expect(resp).toBeUndefined();
  });
});

describe('handleMessage — tools/list', () => {
  it('renvoie les six outils avec nom/description/inputSchema', () => {
    const resp = handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx) as { result: { tools: { name: string }[] } };
    const names = resp.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(['apply_pipeline', 'build_report', 'find_duplicates', 'match_files', 'preview_pipeline', 'profile_csv']);
  });
});

describe('handleMessage — tools/call', () => {
  it('appelle profile_csv et renvoie le résultat en texte JSON dans content[0]', () => {
    writeFileSync(join(dir, 'in.csv'), 'nom,ville\nAlice,Paris\nBob,Lyon\n', 'utf-8');
    const resp = handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'profile_csv', arguments: { path: 'in.csv' } } },
      ctx,
    ) as { result: { content: { type: string; text: string }[]; isError: boolean } };

    expect(resp.result.isError).toBe(false);
    const parsed = JSON.parse(resp.result.content[0].text);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.columns.map((c: { name: string }) => c.name)).toEqual(['nom', 'ville']);
  });

  it('un outil inconnu renvoie isError: true dans le résultat, pas une erreur JSON-RPC', () => {
    const resp = handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'outil_qui_n_existe_pas', arguments: {} } },
      ctx,
    ) as { result: { content: { text: string }[]; isError: boolean } };
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toMatch(/inconnu/);
  });

  it('une erreur levée par un outil (ex. fichier manquant) est capturée en isError: true, pas une exception non gérée', () => {
    const resp = handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'profile_csv', arguments: { path: 'absent.csv' } } },
      ctx,
    ) as { result: { content: { text: string }[]; isError: boolean } };
    expect(resp.result.isError).toBe(true);
  });

  it("une tentative d'évasion du répertoire de travail (../) est bloquée", () => {
    const resp = handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'profile_csv', arguments: { path: '../../etc/passwd' } } },
      ctx,
    ) as { result: { content: { text: string }[]; isError: boolean } };
    expect(resp.result.isError).toBe(true);
    expect(resp.result.content[0].text).toMatch(/répertoire de travail/);
  });

  it('params.name manquant renvoie une erreur JSON-RPC (requête protocolairement invalide)', () => {
    const resp = handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }, ctx);
    expect(resp).toMatchObject({ error: { code: -32603 } });
  });
});
