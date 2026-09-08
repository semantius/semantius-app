/**
 * Types for `extract.mjs`, so the tests can run the real scan in memory and
 * still typecheck under `tsc -b --noEmit`.
 *
 * The script itself stays plain ESM: it runs under bare `node` from a package
 * script, where nothing transpiles TypeScript.
 */

import type { LocaleFile } from '../../src/i18n/catalog'

export declare const SOURCE_LANGUAGE: string
export declare const MODULE_ROOT: string
export declare const LANGUAGE_FILE: RegExp
export declare const SRC_DIR: string
export declare const LOCALES_DIR: string

export interface CollectedMessage {
  source: string
  comment?: string
}

export declare function joinSegments(segments: readonly string[]): string
export declare function isMetadataKey(key: string): boolean
export declare function sourceFiles(dir?: string): string[]
export declare function collectMessages(files?: string[]): Map<string, CollectedMessage>
export declare function placeholdersOf(message: string): string[]
export declare function sortedObject<T>(entries: Record<string, T>): Record<string, T>
export declare function languageFiles(dir?: string): { code: string; path: string }[]
export declare function indexPath(dir?: string): string
export declare function readJson(path: string): any
export declare function readIndex(dir?: string): LocaleFile
export declare function reconcileIndex(index: LocaleFile, found: Map<string, CollectedMessage>): LocaleFile
export declare function reconcileLanguage(
  file: LocaleFile,
  found: Map<string, CollectedMessage>,
  options?: { prune?: boolean },
): LocaleFile
export declare function serialize(value: unknown): string
export declare function extract(options?: { prune?: boolean; dir?: string; files?: string[] }): {
  index: LocaleFile
  languages: { code: string; path: string; file: LocaleFile }[]
  found: Map<string, CollectedMessage>
  unseen: string[]
}
