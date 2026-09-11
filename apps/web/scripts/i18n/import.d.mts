/**
 * Types for `import.mjs` — see `translate.d.mts` for why the scripts are plain
 * ESM with declarations beside them.
 */

import type { LocaleFile } from '../../src/i18n/catalog'
import type { WorkFile } from './translate.d.mts'

/** Every problem with a work file, as messages. Empty means it may be written. */
export declare function validateWork(work: unknown): string[]

/** Fill the language file's EMPTY entries; answers how many landed. */
export declare function mergeIntoFile(file: LocaleFile, work: WorkFile): number
