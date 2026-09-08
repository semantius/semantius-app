/**
 * Types for `translate.mjs`, so `src/test/i18nScripts.test.ts` can exercise its
 * decisions and still typecheck under `tsc -b --noEmit`. Same arrangement as
 * `extract.d.mts`: the script itself stays plain ESM because it runs under bare
 * `node` from the repo root, where nothing transpiles TypeScript.
 */

import type { LocaleFile, TranslationMap } from '../../src/i18n/catalog'

/** One thing to translate, as the work file carries it. */
export interface WorkEntry {
  key: string
  source: string
  translation: string
  placeholders?: string[]
  comment?: string
}

export interface WorkFile {
  locale: string
  generated?: string
  entries: WorkEntry[]
}

export interface WorkInputs {
  index: LocaleFile
  file: LocaleFile
  record?: TranslationMap
}

export declare const WORK_DIR: string
export declare function workFilePath(locale: string): string
export declare function readLanguageFile(locale: string): LocaleFile
export declare function buildWorkFile(locale: string, inputs: WorkInputs): WorkFile
