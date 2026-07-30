// Modèle de données central du moteur CSV Studio.
// Toute cellule est une string ; l'absence de valeur est représentée par "".
// Les colonnes sont référencées par ColumnId (stable) dans le moteur,
// jamais par nom : le nom est un attribut mutable de la colonne.
// Seule la Recipe (portable, hors du fichier source) référence les colonnes par nom.

export type ColumnId = string;
export type RowId = string;
export type CellValue = string;

export interface Column {
  id: ColumnId;
  name: string;
  hidden: boolean;
}

export interface Row {
  id: RowId;
  cells: Record<ColumnId, CellValue>;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
}

export type OperationType =
  | 'rename_columns'
  | 'reorder_columns'
  | 'drop_columns'
  | 'hide_columns'
  | 'duplicate_column'
  | 'add_constant_column'
  | 'add_concat_column'
  | 'add_extract_column'
  | 'add_sequence_column'
  | 'add_expression_column'
  | 'normalize_columns'
  | 'filter_rows'
  | 'deduplicate'
  | 'enrich_join';

export interface Operation<P = unknown> {
  id: string;
  type: OperationType;
  label?: string;
  enabled: boolean;
  params: P;
}

export interface OperationReport {
  rowsIn: number;
  rowsOut: number;
  rowsRemoved: number;
  rowsAdded: number;
  rowsModified: number;
  unmatched?: number;
  ambiguous?: number;
  notes: string[];
  affectedRowIds?: RowId[];
}

export interface ApplyContext {
  /** Résout une table auxiliaire (fichier de droite d'un enrich_join). */
  getTableById(id: string): Table;
  /** Compteur pour add_sequence_column ; seedé par step id pour être stable au rejeu. */
  sequenceCounter(seed: string, start: number, step: number): number;
}

export interface PortableParams {
  /** params structurellement identiques, mais avec des noms de colonnes à la place des ColumnId. */
  params: unknown;
  /** Noms de colonnes référencés par ces params (pour l'écran de remappage). */
  columnNames: string[];
  /** Si l'opération référence un second fichier (enrich_join) : son nom d'origine et ses colonnes, à remapper séparément au rejeu. */
  secondary?: { tableName: string; columnNames: string[] };
}

/** Fourni à `rebind` quand l'étape référence un second fichier déjà réimporté et remappé (enrich_join). */
export interface RebindContext {
  secondaryTable?: Table;
  secondaryNameToId?: Record<string, ColumnId>;
}

export interface OperationDefinition<P = unknown> {
  type: OperationType;
  apply(table: Table, params: P, ctx: ApplyContext): { table: Table; report: OperationReport };
  /** Convertit params (basés sur ColumnId) vers une forme portable basée sur les noms, pour la sérialisation Recipe. */
  toPortable(params: P, tableBeforeStep: Table, ctx: ApplyContext): PortableParams;
  /** Reconstruit params (basés sur ColumnId) depuis la forme portable, une fois le mapping nom -> id confirmé par l'utilisateur. */
  rebind(portableParams: unknown, nameToId: Record<string, ColumnId>, ctx?: RebindContext): P;
}

export interface PipelineStep {
  operation: Operation;
  report?: OperationReport;
}

export interface Pipeline {
  id: string;
  sourceTableId: string;
  steps: PipelineStep[];
  /** Nombre d'étapes actuellement appliquées/affichées (0..steps.length). Undo/redo = déplacer ce curseur. */
  cursor: number;
}

export interface Recipe {
  id: string;
  name: string;
  formatVersion: number;
  createdAt: string;
  expectedColumns: string[];
  steps: Array<{
    type: OperationType;
    label?: string;
    enabled: boolean;
    params: unknown;
    /** Si cette étape référence un second fichier (enrich_join) : son nom d'origine et ses colonnes attendues. */
    secondary?: { tableName: string; expectedColumns: string[] };
  }>;
}

export interface ColumnMapping {
  [expectedName: string]: string | null;
}
