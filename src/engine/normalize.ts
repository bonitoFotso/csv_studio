export type NormalizeStep =
  | 'trim'
  | 'collapse_spaces'
  | 'upper'
  | 'lower'
  | 'title'
  | 'strip_accents'
  | 'strip_punctuation'
  | 'digits_only';

function trim(v: string): string {
  return v.trim();
}

function collapseSpaces(v: string): string {
  return v.replace(/\s+/g, ' ');
}

function upper(v: string): string {
  return v.toLocaleUpperCase();
}

function lower(v: string): string {
  return v.toLocaleLowerCase();
}

function title(v: string): string {
  return v.replace(/\p{L}[\p{L}\p{N}'-]*/gu, (word) => word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase());
}

function stripAccents(v: string): string {
  return v.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
}

function stripPunctuation(v: string): string {
  return v.replace(/[\p{P}\p{S}]/gu, '');
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

const STEP_FNS: Record<NormalizeStep, (v: string) => string> = {
  trim,
  collapse_spaces: collapseSpaces,
  upper,
  lower,
  title,
  strip_accents: stripAccents,
  strip_punctuation: stripPunctuation,
  digits_only: digitsOnly,
};

/** Applique une séquence de transformations de normalisation, dans l'ordre donné. */
export function applyNormalizeSteps(value: string, steps: NormalizeStep[]): string {
  let out = value;
  for (const step of steps) {
    out = STEP_FNS[step](out);
  }
  return out;
}

/** Normalisation "clé de comparaison" utilisée par le dédoublonnage/rapprochement en mode normalisé ou flou. */
export function normalizeForComparison(value: string): string {
  return applyNormalizeSteps(value, ['trim', 'strip_accents', 'upper', 'strip_punctuation', 'collapse_spaces']);
}
