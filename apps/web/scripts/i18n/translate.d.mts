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
  comment?: string
  /** What each other managed language says for this key. Context only. */
  hints?: Record<string, string>
}

export interface WorkFile {
  locale: string
  generated?: string
  entries: WorkEntry[]
}

/** One managed language, as `readHintLanguages` hands it over. */
export interface HintLanguage {
  code: string
  messages: TranslationMap
}

export interface WorkInputs {
  index: LocaleFile
  file: LocaleFile
  record?: TranslationMap
  hints?: HintLanguage[]
  /** The work file already on disk. Filled translations in it are carried over. */
  previous?: WorkFile
}

/** `buildWorkFile`'s report. Only `WorkFile`'s own fields are written to disk. */
export interface WorkBuild extends WorkFile {
  /** How many entries came back filled in from `previous`. */
  carriedOver: number
  dropped: {
    /** Filled, and since imported into the language or the target. Fine. */
    landed: string[]
    /** Filled, but the key has left the index. This text has nowhere to go. */
    orphaned: string[]
  }
}

export declare const WORK_DIR: string
export declare function workFilePath(locale: string): string
export declare function readLanguageFile(locale: string): LocaleFile
export declare function buildWorkFile(locale: string, inputs: WorkInputs): WorkBuild
export declare function readHintLanguages(locale: string, dir?: string): HintLanguage[]
export declare function endonymFor(locale: string): string | undefined
export declare function createLanguageFile(
  locale: string,
  options?: { name?: string; dir?: string },
): { path: string; created: boolean; name?: string }
