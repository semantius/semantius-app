/**
 * Types for `localeFile.mjs`, so the app (`src/i18n/localeFile.ts` re-exports
 * it) and the tests typecheck under `tsc -b --noEmit` while the scripts keep
 * running under bare `node`. Same arrangement as `extract.d.mts`.
 */

import type {
  ColumnLabelAttribute,
  LabelScope,
  LocaleFile,
  TranslationScope,
} from '../../src/i18n/catalog'

/** One row of the tenant's `ui_translations` table. */
export interface TranslationRow {
  locale: string
  scope: TranslationScope
  key: string
  /** '' when the message has no context; never null on a row we write. */
  context?: string | null
  translation: string
  /** Where the app first met it — a route, a rule name, an RPC name. */
  origin?: string | null
}

export declare const TRANSLATION_SCOPES: readonly TranslationScope[]
export declare const LABEL_SCOPES: readonly LabelScope[]
export declare const TABLE_LABEL_ATTRIBUTES: readonly ('singular_label' | 'plural_label' | 'description')[]
export declare const COLUMN_LABEL_ATTRIBUTES: readonly ColumnLabelAttribute[]
export declare const MODULE_LABEL_ATTRIBUTES: readonly ('name' | 'description')[]

export type ParsedLabelKey =
  | { table: string; attribute: 'singular_label' | 'plural_label' | 'description' }
  | { table: string; field: string; attribute: ColumnLabelAttribute }
  | { table: string; field: string; value: string }
  | { module: string; attribute: 'name' | 'description' }

export declare function parseLabelKey(scope: LabelScope, key: string): ParsedLabelKey | null
export declare function emptyLocaleFile(locale: string): LocaleFile
export declare function applyRowToFile(file: LocaleFile, row: TranslationRow): boolean
export declare function rowsToLocaleFiles(
  rows: readonly TranslationRow[] | undefined,
  options?: { includeEmpty?: boolean },
): Map<string, LocaleFile>
export declare function localeFileToRows(file: LocaleFile): TranslationRow[]
