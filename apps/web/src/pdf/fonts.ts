// Police embarquée en local (aucune requête réseau) : Liberation Sans, SIL Open Font License,
// copiée dans `src/pdf/fonts/` (voir LICENSE-liberation-fonts.txt). Métriquement compatible
// Arial/Helvetica, couvre les caractères latins accentués français (é, è, ô, ç) et l'apostrophe
// typographique (’, U+2019) via son encodage Unicode complet — contrairement aux 14 polices
// standard du PDF (Helvetica...) qui ne garantissent qu'un sous-titre latin-1.
//
// Résolution par chemin de fichier local (Node) : c'est le contexte d'exécution de cette phase
// (script de génération, phase 4). Un export PDF déclenché depuis le navigateur (à venir, une
// fois l'éditeur de rapport câblé) devra pointer `Font.register` vers une URL d'asset Vite du
// même bundle plutôt qu'un chemin disque — ce module isole cette résolution pour rendre ce
// changement local le jour venu.
import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';
import { REPORT_FONT_FAMILY } from './fontFamily.ts';

export { REPORT_FONT_FAMILY };

function fontPath(fileName: string): string {
  return fileURLToPath(new URL(`./fonts/${fileName}`, import.meta.url));
}

let registered = false;

/** Enregistre la police embarquée auprès de @react-pdf/renderer. Idempotent. */
export function registerReportFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: REPORT_FONT_FAMILY,
    fonts: [
      { src: fontPath('LiberationSans-Regular.ttf'), fontWeight: 'normal', fontStyle: 'normal' },
      { src: fontPath('LiberationSans-Bold.ttf'), fontWeight: 'bold', fontStyle: 'normal' },
      { src: fontPath('LiberationSans-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
      { src: fontPath('LiberationSans-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  });
  // @react-pdf/renderer coupe les mots par défaut avec un algorithme qui gère mal certains
  // enchaînements accentués ; désactivé pour ce projet, les colonnes sont assez larges.
  Font.registerHyphenationCallback((word) => [word]);
}
