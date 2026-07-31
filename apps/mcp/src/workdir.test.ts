import { describe, expect, it } from 'vitest';
import { resolveInWorkdir, PathOutsideWorkdirError } from './workdir.ts';

describe('resolveInWorkdir', () => {
  it('résout un chemin relatif simple dans le répertoire de travail', () => {
    const result = resolveInWorkdir('/home/bonito/work', 'data.csv');
    expect(result).toBe('/home/bonito/work/data.csv');
  });

  it('résout un sous-dossier', () => {
    const result = resolveInWorkdir('/home/bonito/work', 'in/data.csv');
    expect(result).toBe('/home/bonito/work/in/data.csv');
  });

  it('accepte un chemin absolu situé DANS le répertoire de travail', () => {
    const result = resolveInWorkdir('/home/bonito/work', '/home/bonito/work/data.csv');
    expect(result).toBe('/home/bonito/work/data.csv');
  });

  it('refuse une remontée avec ../', () => {
    expect(() => resolveInWorkdir('/home/bonito/work', '../secret.csv')).toThrow(PathOutsideWorkdirError);
  });

  it('refuse une remontée profonde avec ../../', () => {
    expect(() => resolveInWorkdir('/home/bonito/work', '../../etc/passwd')).toThrow(PathOutsideWorkdirError);
  });

  it('refuse un chemin absolu hors du répertoire de travail', () => {
    expect(() => resolveInWorkdir('/home/bonito/work', '/etc/passwd')).toThrow(PathOutsideWorkdirError);
  });

  it('refuse un chemin qui ne fait que commencer par le même préfixe textuel sans être un sous-dossier', () => {
    // "/home/bonito/work-evil" commence par la même chaîne que "/home/bonito/work" mais n'en est pas un sous-dossier :
    // une vérification purement textuelle du préfixe se ferait piéger, resolveInWorkdir doit s'appuyer sur path.relative.
    expect(() => resolveInWorkdir('/home/bonito/work', '/home/bonito/work-evil/data.csv')).toThrow(PathOutsideWorkdirError);
  });

  it('accepte le répertoire de travail lui-même (chemin relatif vide résolu au répertoire)', () => {
    const result = resolveInWorkdir('/home/bonito/work', '.');
    expect(result).toBe('/home/bonito/work');
  });
});
