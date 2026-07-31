// Serveur MCP (stdio, local uniquement) : lit les fichiers sur le disque de la machine et
// n'ouvre aucune connexion sortante. Toute sortie sur stdout doit être un message JSON-RPC —
// jamais un console.log de diagnostic, qui casserait le flux du protocole ; les logs vont sur
// stderr. Répertoire de travail : premier argument, sinon le répertoire courant.
import { registerAllOperations } from '@csv-studio/core/engine/operations/index.ts';
import { formatMessage, LineMessageParser } from './jsonrpc.ts';
import { handleMessage } from './server.ts';
import type { ToolContext } from './tools/types.ts';

registerAllOperations();

const workdir = process.argv[2] ?? process.cwd();
const ctx: ToolContext = { workdir };

process.stderr.write(`csv-studio-mcp démarré, répertoire de travail : ${workdir}\n`);

const parser = new LineMessageParser(
  (msg) => {
    const response = handleMessage(msg, ctx);
    if (response) process.stdout.write(formatMessage(response));
  },
  (err, line) => {
    process.stderr.write(`Message JSON-RPC invalide ignoré (${err.message}) : ${line}\n`);
  },
);

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => parser.push(chunk));
process.stdin.on('end', () => process.exit(0));
