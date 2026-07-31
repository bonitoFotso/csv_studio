// Règle absolue des outils MCP (prompt-2) : aucune réponse ne renvoie jamais une table entière.
// Toujours un résumé structuré, un échantillon plafonné (30 lignes par défaut), et le total réel
// avec un indicateur de troncature — jamais un silence sur le fait que la réponse est partielle.

export const DEFAULT_SAMPLE_CAP = 30;
export const MAX_SAMPLE_CAP = 200;

/** Ramène un plafond demandé par l'appelant dans les bornes [1, MAX_SAMPLE_CAP], avec le défaut si absent/invalide. */
export function clampSampleCap(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return DEFAULT_SAMPLE_CAP;
  return Math.min(Math.floor(requested), MAX_SAMPLE_CAP);
}

export interface BoundedSample<T> {
  totalCount: number;
  sample: T[];
  truncated: boolean;
}

export function bound<T>(items: T[], cap: number): BoundedSample<T> {
  return { totalCount: items.length, sample: items.slice(0, cap), truncated: items.length > cap };
}
