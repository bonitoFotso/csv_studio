import * as React from 'react';
import type { WorkerCall } from '@/worker/client.ts';

export interface WorkerCallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  progress: { done: number; total: number } | null;
}

/**
 * Exécute un appel au Worker moteur et suit son résultat. Annule l'appel précédent (côté client,
 * et signale l'annulation au Worker) dès que les dépendances changent ou que le composant démonte —
 * utile pour l'aperçu en direct des dialogues (Doublons, Rapprocher) où la config change à chaque frappe.
 *
 * `factory` reçoit un reporter de progression optionnel (utilisé par le rapprochement flou) ;
 * renvoyer `null` (ex. configuration incomplète) vide `data` sans lancer de calcul.
 */
export function useWorkerCall<T>(
  factory: (onProgress: (done: number, total: number) => void) => WorkerCall<T> | null,
  deps: React.DependencyList,
): WorkerCallState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  // `deps` est le tableau de dépendances fourni par l'appelant (motif "deps en paramètre",
  // comme react-query/SWR) ; oxlint ne peut pas le vérifier statiquement d'où les deux
  // avertissements exhaustive-deps ci-dessous, sans conséquence ici — c'est le contrat voulu.
  React.useEffect(() => {
    setProgress(null);
    const call = factory((done, total) => setProgress({ done, total }));

    if (!call) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    let active = true;

    call.promise
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
        setProgress(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof DOMException && err.name === 'AbortError') return; // annulation volontaire
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      active = false;
      call.cancel();
    };
  }, deps);

  return { data, loading, error, progress };
}
