import type { AggFn, BinningMode } from './operations/summarize.ts';
import type { ConditionGroup } from './filterEngine.ts';

/**
 * Un rapport est un JSON portable, sœur de `Recipe` : `formatVersion`, colonnes référencées
 * par nom, remappage obligatoire au chargement (voir `reportSpecCompute.ts`, qui réutilise
 * `suggestColumnMapping`/`mappingIsComplete` de `recipe.ts` — pas de mécanisme parallèle).
 *
 * Vocabulaire JSON volontairement aligné sur l'exemple de la spécification (clé `column` pour
 * toute référence de colonne, y compris dans `summarize`, et `normalization: "raw"` plutôt que
 * le `"none"` interne du moteur) : ce fichier est souvent généré par un assistant qui aura vu
 * cet exemple précis, mieux vaut coller à sa forme littérale que forcer la convention interne.
 * `reportSpecCompute.ts` fait la traduction vers les types moteur (`SummarizeParams`, `ColumnId`).
 */
export const REPORT_SPEC_FORMAT_VERSION = 1;

export type ChartType = 'bar' | 'bar_stacked' | 'line' | 'pie' | 'donut' | 'histogram';

/** 'raw' = comparaison brute (équivalent JSON du `'none'` interne de `KeyNormalization`). */
export type SpecNormalization = 'raw' | 'text' | 'date';

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface KpiAggSpec {
  fn: AggFn;
  /** Nom de colonne source, requis pour toutes les fonctions sauf 'count'. */
  column?: string;
  separator?: string;
}

export interface KpiItem {
  label: string;
  agg: KpiAggSpec;
  format?: 'number' | 'percent';
}

export interface KpiRowBlock {
  type: 'kpi_row';
  items: KpiItem[];
}

export interface ChartGroupBySpec {
  column: string;
  normalization: SpecNormalization;
  binning?: BinningMode;
}

export interface ChartAggregateSpec {
  fn: AggFn;
  /** Requis sauf pour 'count'. */
  column?: string;
  asName: string;
  separator?: string;
}

export interface ChartSummarizeSpec {
  groupBy: ChartGroupBySpec[];
  aggregates: ChartAggregateSpec[];
}

export interface ChartSeriesSpec {
  /** Nom d'une colonne de sortie du `summarize` de ce bloc (un `asName` d'agrégat). */
  column: string;
  label?: string;
}

export interface ChartBlock {
  type: 'chart';
  chartType: ChartType;
  title?: string;
  /** Pour 'bar' / 'bar_stacked' uniquement ; défaut 'vertical'. */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Passé tel quel à l'opération `summarize` de la phase 1 une fois les noms résolus en
   * `ColumnId` — une seule implémentation de l'agrégation dans tout le projet, le bloc ne
   * recalcule rien lui-même.
   */
  summarize: ChartSummarizeSpec;
  /** Nom d'une colonne de sortie du `summarize` (un des `groupBy[].column`, éventuellement binné). */
  x: string;
  series: ChartSeriesSpec[];
  caption?: string;
}

export interface TableBlock {
  type: 'table';
  title?: string;
  columns: string[];
  /** Même format que les filtres du moteur, `columnId` y contient un nom de colonne (portable). */
  filter?: ConditionGroup;
  maxRows?: number;
}

export interface PageBreakBlock {
  type: 'page_break';
}

export type ReportBlock = TextBlock | KpiRowBlock | ChartBlock | TableBlock | PageBreakBlock;

export interface ReportSpec {
  formatVersion: number;
  kind: 'report';
  title: string;
  subtitle?: string;
  expectedColumns: string[];
  blocks: ReportBlock[];
}
