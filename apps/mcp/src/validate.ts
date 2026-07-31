// Validation minimale des arguments d'outil, écrite à la main (aucune dépendance de schéma
// n'est nommée dans le prompt). Chaque assertion lève un message actionnable avec le chemin du
// champ concerné — même philosophie que `reportSpecValidate.ts` dans le core.

export class ToolInputError extends Error {}

export function asRecord(value: unknown, label = 'les arguments'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ToolInputError(`${label} doivent être un objet.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v === '') throw new ToolInputError(`"${key}" est requis et doit être une chaîne non vide.`);
  return v;
}

export function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new ToolInputError(`"${key}" doit être une chaîne s'il est fourni.`);
  return v;
}

export function optionalBoolean(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') throw new ToolInputError(`"${key}" doit être un booléen s'il est fourni.`);
  return v;
}

export function optionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ToolInputError(`"${key}" doit être un nombre s'il est fourni.`);
  return v;
}

export function requireStringArray(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string')) {
    throw new ToolInputError(`"${key}" est requis et doit être un tableau non vide de chaînes.`);
  }
  return v;
}

export function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) throw new ToolInputError(`"${key}" est requis et doit être un tableau.`);
  return v;
}
