import * as React from 'react';

/**
 * Renvoie `true` seulement si `value` est resté vrai en continu pendant au moins `delayMs`.
 * Évite qu'un calcul rapide fasse clignoter un indicateur de chargement.
 */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return delayed;
}
