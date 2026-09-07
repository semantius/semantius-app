/**
 * Types for `labelInventory.mjs` — same arrangement as `localeFile.d.mts`: the
 * app re-exports the module through `src/i18n/labelInventory.ts`, the scripts
 * import it directly under bare `node`.
 */

import type { LabelScope, TranslationMap } from '../../src/i18n/catalog'

/** A row of `tables` (the view over `entities`), with the columns we read. */
export interface TableRow {
  table_name: string
  singular_label?: string | null
  plural_label?: string | null
  description?: string | null
  updated_at?: string | null
}

/** A row of `fields`. */
export interface FieldRow {
  table_name: string
  field_name: string
  title?: string | null
  description?: string | null
  relationship_label?: string | null
  singular_label_parent?: string | null
  plural_label_parent?: string | null
  /** PostgREST may hand this back as an array, a JSON string or a CSV string. */
  enum_values?: unknown
  updated_at?: string | null
}

/** A row of `modules`. */
export interface ModuleRow {
  module_slug: string
  module_name?: string | null
  description?: string | null
  updated_at?: string | null
}

export interface ModelRows {
  tables?: readonly TableRow[]
  fields?: readonly FieldRow[]
  modules?: readonly ModuleRow[]
}

/** One translatable thing the model carries. */
export interface InventoryEntry {
  scope: LabelScope
  key: string
  /** The English text as the model spells it — the translator's source. */
  source: string
  /** The model row's own `updated_at`, for "changed since translated". */
  updatedAt?: string
}

/** A translation whose key the model no longer has. */
export interface OrphanedEntry {
  scope: LabelScope
  key: string
  translation: string
}

export interface InventoryDiff {
  missing: InventoryEntry[]
  translated: InventoryEntry[]
  orphaned: OrphanedEntry[]
}

export declare function parseEnumValues(raw: unknown): string[]
export declare function buildLabelInventory(rows: ModelRows): InventoryEntry[]
export declare function diffLabelInventory(
  inventory: readonly InventoryEntry[],
  labels: TranslationMap,
): InventoryDiff
