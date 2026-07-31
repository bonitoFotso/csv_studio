// Même police embarquée que fonts.ts (Node), mais résolue en URL d'asset du bundle navigateur —
// jamais un chemin disque. `new URL('./fonts/<nom>', import.meta.url)` est un littéral que Vite
// détecte statiquement et transforme en URL d'asset hashée (servie par le même bundle), sans le
// moindre import de `node:url`. @react-pdf/renderer charge la police par `fetch()` côté navigateur
// (il a besoin des octets bruts pour l'incorporer au PDF) — voir apps/web/public/_headers pour la
// CSP correspondante (connect-src 'self', un fetch same-origin de l'asset du bundle lui-même).
import { Font } from '@react-pdf/renderer';
import { REPORT_FONT_FAMILY } from './fontFamily.ts';

export { REPORT_FONT_FAMILY };

function fontUrl(fileName: string): string {
  return new URL(`./fonts/${fileName}`, import.meta.url).href;
}

let registered = false;

/** Enregistre la police embarquée auprès de @react-pdf/renderer, pour un rendu déclenché depuis le navigateur. Idempotent. */
export function registerReportFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: REPORT_FONT_FAMILY,
    fonts: [
      { src: fontUrl('LiberationSans-Regular.ttf'), fontWeight: 'normal', fontStyle: 'normal' },
      { src: fontUrl('LiberationSans-Bold.ttf'), fontWeight: 'bold', fontStyle: 'normal' },
      { src: fontUrl('LiberationSans-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
      { src: fontUrl('LiberationSans-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
