/**
 * Types for `export.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { LocaleFile } from '../../src/i18n/catalog'

/**
 * Copy a tenant's message translations into the repo catalog's EMPTY entries.
 * Answers how many landed.
 */
export declare function fillEmptyMessages(catalog: LocaleFile, file: LocaleFile): number
