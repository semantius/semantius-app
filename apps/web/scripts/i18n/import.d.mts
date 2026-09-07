/**
 * Types for `import.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { LocaleFile } from '../../src/i18n/catalog'
import type { TranslationRow } from './localeFile.d.mts'
import type { WorkFile } from './translate.d.mts'

/** Every problem with a work file, as messages. Empty means it may be written. */
export declare function validateWork(work: unknown): string[]

/** The filled entries as `ui_translations` rows. */
export declare function workToRows(work: WorkFile): TranslationRow[]

/** Fill the catalog's EMPTY message entries; answers how many landed. */
export declare function mergeIntoCatalog(catalog: LocaleFile, work: WorkFile): number
