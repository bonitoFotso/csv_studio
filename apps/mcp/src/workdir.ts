import { isAbsolute, relative, resolve } from 'node:path';

export class PathOutsideWorkdirError extends Error {
  readonly requestedPath: string;
  readonly workdir: string;

  constructor(requestedPath: string, workdir: string) {
    super(`Le chemin "${requestedPath}" sort du répertoire de travail autorisé (${workdir}).`);
    this.requestedPath = requestedPath;
    this.workdir = workdir;
  }
}

/**
 * Résout un chemin fourni par un outil MCP contre le répertoire de travail passé au démarrage du
 * serveur, et refuse toute sortie de ce répertoire (`../`, chemin absolu ailleurs) — comparaison
 * sur le chemin résolu, jamais une simple vérification textuelle du préfixe.
 */
export function resolveInWorkdir(workdir: string, requestedPath: string): string {
  const absWorkdir = resolve(workdir);
  const target = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(absWorkdir, requestedPath);
  const rel = relative(absWorkdir, target);
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new PathOutsideWorkdirError(requestedPath, absWorkdir);
  }
  return target;
}
