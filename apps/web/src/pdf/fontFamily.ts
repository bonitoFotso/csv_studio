// Constante pure, sans aucun import — séparée de fonts.ts (qui résout des chemins de fichiers
// Node) pour que ReportDocument.tsx/charts.tsx restent bundleables côté navigateur sans tirer
// `node:url` dans leur graphe d'imports.
export const REPORT_FONT_FAMILY = 'Liberation Sans';
