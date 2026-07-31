import { normalizeForComparison } from './normalize.ts';

export type KeyNormalization = 'none' | 'text' | 'date';

// Convention DD/MM/YYYY (ou DD-MM-YYYY, DD.MM.YYYY) — cohérent avec le reste de l'app
// (voir add_extract_column / mode "year"), pas de support MM/DD/YYYY : sans plus de contexte
// sur la colonne, les deux conventions sont indissociables pour un format à séparateurs.
const DATE_DMY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;
// Format année en tête (ISO ou proche), séparateurs et zéros de tête tolérés.
const DATE_YMD_RE = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/;

function pad2(n: string): string {
  return n.length === 1 ? `0${n}` : n;
}

/** Normalise une date vers YYYY-MM-DD quel que soit le séparateur (/, -, .) ou le zéro-padding ; sinon repli sur la normalisation texte. */
function normalizeDateValue(value: string): string {
  const trimmed = value.trim();
  const dmy = trimmed.match(DATE_DMY_RE);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  const ymd = trimmed.match(DATE_YMD_RE);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }
  return normalizeForComparison(trimmed);
}

/**
 * Normalise une valeur de clé avant comparaison (rapprochement exact ou blocage flou), pour que
 * des formats différents d'une même valeur réelle («19/07/2026» vs «19-07-2026», «Fotso» vs «FOTSO »)
 * soient considérés égaux. N'affecte jamais la donnée affichée ou exportée — uniquement la comparaison.
 */
export function normalizeKeyValue(value: string, mode: KeyNormalization): string {
  switch (mode) {
    case 'none':
      return value;
    case 'text':
      return normalizeForComparison(value);
    case 'date':
      return normalizeDateValue(value);
  }
}
