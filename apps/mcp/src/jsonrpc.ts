// Transport MCP stdio : JSON-RPC 2.0, un message par ligne (jamais de retour à la ligne à
// l'intérieur d'un message). Écrit à la main — aucune dépendance MCP/JSON-RPC n'est nommée dans
// le prompt qui pilote cette session, et le protocole est simple à implémenter correctement.

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export const JsonRpcErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return typeof (msg as JsonRpcRequest).id !== 'undefined';
}

function isPlainMessage(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valide la forme minimale d'un message JSON-RPC 2.0 déjà parsé (mais pas encore typé). */
export function parseJsonRpcMessage(raw: unknown): JsonRpcMessage {
  if (!isPlainMessage(raw)) throw new Error('Le message JSON-RPC doit être un objet.');
  if (raw.jsonrpc !== '2.0') throw new Error('Champ "jsonrpc" manquant ou différent de "2.0".');
  if (typeof raw.method !== 'string' || raw.method === '') throw new Error('Champ "method" manquant ou vide.');
  if ('id' in raw && typeof raw.id !== 'string' && typeof raw.id !== 'number') {
    throw new Error('Champ "id" doit être une chaîne ou un nombre s\'il est présent.');
  }
  return raw as unknown as JsonRpcMessage;
}

export function successResponse(id: string | number, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: '2.0', id, result };
}

export function errorResponse(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcErrorResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

export function formatMessage(message: JsonRpcResponse | JsonRpcNotification): string {
  return JSON.stringify(message) + '\n';
}

/**
 * Découpe un flux de texte arrivant par morceaux (chunks de stdin) en messages JSON-RPC complets,
 * un par ligne. Une ligne à cheval sur deux chunks doit rester correctement reconstituée avant
 * d'être parsée — c'est le cas explicitement testé.
 */
export class LineMessageParser {
  private buffer = '';
  private readonly onMessage: (msg: JsonRpcMessage) => void;
  private readonly onError: (err: Error, line: string) => void;

  constructor(onMessage: (msg: JsonRpcMessage) => void, onError: (err: Error, line: string) => void) {
    this.onMessage = onMessage;
    this.onError = onError;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line !== '') this.parseLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private parseLine(line: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (err) {
      this.onError(err as Error, line);
      return;
    }
    try {
      this.onMessage(parseJsonRpcMessage(raw));
    } catch (err) {
      this.onError(err as Error, line);
    }
  }
}
