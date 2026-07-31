// Tout espace Unicode (couvre l'espace normal, l'espace insécable et l'espace fine insécable
// utilisées par les exports français/Excel comme séparateur de milliers) est ignoré ici.
const WHITESPACE_RE = /\s/gu;

/**
 * Parse un nombre écrit en français ("1 234,56") ou en format international ("1234.56"), en
 * tolérant les deux séparateurs décimaux si l'un des deux est déjà utilisé comme séparateur de
 * milliers (ex. "1.234,56" ou "1,234.56") : le dernier séparateur rencontré est traité comme le
 * séparateur décimal, l'autre est supprimé.
 *
 * Une chaîne vide (ou uniquement des espaces) renvoie `null` — une valeur *absente*, à ne jamais
 * confondre avec `0` dans une moyenne ou une somme (c'est le bug le plus coûteux d'une agrégation
 * mal écrite : "vide" doit être ignoré, pas compté comme zéro).
 */
export function parseTolerantNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  let cleaned = trimmed.replace(WHITESPACE_RE, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.split('.').join('').replace(',', '.');
    } else {
      cleaned = cleaned.split(',').join('');
    }
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(',', '.');
  }

  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** Formate un nombre issu d'un calcul (agrégat, borne de tranche) sans bruit de virgule flottante. */
export function formatComputedNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10000) / 10000);
}
