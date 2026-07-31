import { describe, expect, it } from 'vitest';
import { formatMessage, LineMessageParser, parseJsonRpcMessage, successResponse, errorResponse, JsonRpcErrorCode } from './jsonrpc.ts';
import type { JsonRpcMessage } from './jsonrpc.ts';

describe('parseJsonRpcMessage', () => {
  it('accepte une requête valide', () => {
    const msg = parseJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(msg).toEqual({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  });

  it('accepte une notification (sans id)', () => {
    const msg = parseJsonRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(msg).toEqual({ jsonrpc: '2.0', method: 'notifications/initialized' });
  });

  it('rejette un message sans "jsonrpc": "2.0"', () => {
    expect(() => parseJsonRpcMessage({ id: 1, method: 'x' })).toThrow(/jsonrpc/);
  });

  it('rejette un message sans method', () => {
    expect(() => parseJsonRpcMessage({ jsonrpc: '2.0', id: 1 })).toThrow(/method/);
  });

  it('rejette un id qui n\'est ni chaîne ni nombre', () => {
    expect(() => parseJsonRpcMessage({ jsonrpc: '2.0', id: {}, method: 'x' })).toThrow(/id/);
  });

  it('rejette une valeur qui n\'est pas un objet', () => {
    expect(() => parseJsonRpcMessage('not an object')).toThrow();
    expect(() => parseJsonRpcMessage([1, 2, 3])).toThrow();
    expect(() => parseJsonRpcMessage(null)).toThrow();
  });
});

describe('formatMessage', () => {
  it('sérialise en JSON suivi d\'un retour à la ligne unique', () => {
    const text = formatMessage(successResponse(1, { ok: true }));
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('\n')).toBe(text.length - 1); // un seul \n, à la fin
    expect(JSON.parse(text)).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  it('errorResponse inclut le code et le message', () => {
    const resp = errorResponse(2, JsonRpcErrorCode.methodNotFound, 'inconnue');
    expect(resp).toEqual({ jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'inconnue' } });
  });
});

describe('LineMessageParser', () => {
  it('parse un message tenant dans un seul chunk', () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new LineMessageParser((m) => messages.push(m), () => {});
    parser.push('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
  });

  it('reconstitue une ligne à cheval sur deux chunks', () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new LineMessageParser((m) => messages.push(m), () => {});
    parser.push('{"jsonrpc":"2.0","id":1,"met');
    expect(messages).toHaveLength(0); // rien avant le \n
    parser.push('hod":"ping"}\n');
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
  });

  it('traite plusieurs messages dans un seul chunk', () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new LineMessageParser((m) => messages.push(m), () => {});
    parser.push('{"jsonrpc":"2.0","id":1,"method":"a"}\n{"jsonrpc":"2.0","id":2,"method":"b"}\n');
    expect(messages.map((m) => (m as { id: number }).id)).toEqual([1, 2]);
  });

  it('ignore les lignes vides', () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new LineMessageParser((m) => messages.push(m), () => {});
    parser.push('\n\n{"jsonrpc":"2.0","id":1,"method":"a"}\n\n');
    expect(messages).toHaveLength(1);
  });

  it('signale une ligne JSON invalide sans interrompre les suivantes', () => {
    const messages: JsonRpcMessage[] = [];
    const errors: string[] = [];
    const parser = new LineMessageParser(
      (m) => messages.push(m),
      (_err, line) => errors.push(line),
    );
    parser.push('not json\n{"jsonrpc":"2.0","id":1,"method":"a"}\n');
    expect(errors).toEqual(['not json']);
    expect(messages).toHaveLength(1);
  });

  it('signale un message JSON valide mais qui n\'est pas un JSON-RPC valide', () => {
    const errors: string[] = [];
    const parser = new LineMessageParser(
      () => {},
      (_err, line) => errors.push(line),
    );
    parser.push('{"not":"jsonrpc"}\n');
    expect(errors).toHaveLength(1);
  });
});
