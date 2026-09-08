/**
 * Types for `export.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { LocaleFile, TranslationMap } from '../../src/i18n/catalog'

/** Copy a record's translations into the language file's EMPTY entries. Answers how many landed. */
export declare function fillEmptyMessages(file: LocaleFile, record: TranslationMap): number
