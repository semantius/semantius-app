/**
 * Types for `labels.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { LocaleFile, TranslationMap } from '../../src/i18n/catalog'

export declare const WORK_DIR: string

/** A locale file's `labels` section as the flat `scope:key` map the diff takes. */
export declare function labelsOfFile(file: LocaleFile): TranslationMap
