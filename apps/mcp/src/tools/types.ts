export interface ToolContext {
  /** Répertoire de travail passé au démarrage du serveur : tout accès disque (lecture ou écriture) doit y rester confiné. */
  workdir: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** Description JSON-Schema-like du format d'entrée, renvoyée telle quelle par tools/list — informative pour le client, pas utilisée pour valider (la validation réelle est faite à la main dans le handler). */
  inputSchema: Record<string, unknown>;
  handler: (args: unknown, ctx: ToolContext) => unknown;
}
