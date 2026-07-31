import {
  errorResponse,
  isRequest,
  JsonRpcErrorCode,
  successResponse,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from './jsonrpc.ts';
import { findTool } from './tools/index.ts';
import type { ToolContext } from './tools/types.ts';
import { ALL_TOOLS } from './tools/index.ts';

export const SERVER_NAME = 'csv-studio-mcp';
export const SERVER_VERSION = '0.1.0';
export const PROTOCOL_VERSION = '2024-11-05';

interface ToolCallParams {
  name: string;
  arguments?: unknown;
}

function asToolCallParams(params: unknown): ToolCallParams {
  if (typeof params !== 'object' || params === null || typeof (params as ToolCallParams).name !== 'string') {
    throw new Error('"params.name" est requis pour tools/call.');
  }
  return params as ToolCallParams;
}

function toolResultContent(result: unknown, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError };
}

/**
 * Traite un message JSON-RPC déjà parsé et renvoie la réponse à écrire (ou `undefined` pour une
 * notification, qui n'attend jamais de réponse — l'appelant ne doit alors rien écrire sur stdout).
 */
export function handleMessage(msg: JsonRpcMessage, ctx: ToolContext): JsonRpcResponse | undefined {
  const id = isRequest(msg) ? msg.id : null;

  try {
    switch (msg.method) {
      case 'initialize':
        if (id === null) return undefined;
        return successResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });

      case 'notifications/initialized':
      case 'notifications/cancelled':
        return undefined;

      case 'ping':
        if (id === null) return undefined;
        return successResponse(id, {});

      case 'tools/list':
        if (id === null) return undefined;
        return successResponse(id, {
          tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        });

      case 'tools/call': {
        const { name, arguments: toolArgs } = asToolCallParams(msg.params);
        const tool = findTool(name);
        if (!tool) {
          if (id === null) return undefined;
          return successResponse(id, toolResultContent({ error: `Outil inconnu : "${name}".` }, true));
        }
        if (id === null) return undefined;
        try {
          const result = tool.handler(toolArgs, ctx);
          return successResponse(id, toolResultContent(result));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return successResponse(id, toolResultContent({ error: message }, true));
        }
      }

      default:
        if (id === null) return undefined; // notification inconnue : ignorée, jamais d'erreur
        return errorResponse(id, JsonRpcErrorCode.methodNotFound, `Méthode inconnue : "${msg.method}".`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (id === null) return undefined;
    return errorResponse(id, JsonRpcErrorCode.internalError, message);
  }
}
