/** Rend la main à la boucle d'événements (permet à un message postMessage entrant d'être traité). */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class CancelledError extends Error {
  constructor() {
    super('Opération annulée');
    this.name = 'CancelledError';
  }
}

export interface CancelToken {
  aborted: boolean;
}
