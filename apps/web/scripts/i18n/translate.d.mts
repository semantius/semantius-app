/**
 * Types for `translate.mjs`, so `src/test/i18nScripts.test.ts` can exercise its
 * decisions and still typecheck under `tsc -b --noEmit`. Same arrangement as
 * `extract.d.mts`: the script itself stays plain ESM because it runs under bare
 * `node` from the repo root, where nothing transpiles TypeScript.
 */

import type { LocaleFile, TranslationScope } from '../../src/i18n/catalog'
import type { InventoryEntry } from './labelInventory.d.mts'
import type { TranslationRow } from './localeFile.d.mts'

/** One thing to translate, as the work file carries it. */
export interface WorkEntry {
  key: string
  context?: string
  source: string
  translation: string
  comment?: string
  placeholders?: string[]
  origin?: string[]
}

export interface WorkFile {
  locale: string
  generated?: string
  entries: Partial<Record<TranslationScope, WorkEntry[]>>
}

/** One entry of the generated `en-US.json` index. */
export interface IndexEntry {
  message: string
  context?: string
  origin: string[]
  placeholders: string[]
  comment?: string
}

export interface WorkInputs {
  index: { locale: string; index: Record<string, IndexEntry> }
  catalog: LocaleFile
  inventory: readonly InventoryEntry[]
  labels: Record<string, string>
  requests: readonly TranslationRow[]
}

export declare const WORK_DIR: string
export declare function workFilePath(locale: string): string
export declare function readRepoCatalog(locale: string): LocaleFile
export declare function buildWorkFile(locale: string, inputs: WorkInputs): WorkFile
