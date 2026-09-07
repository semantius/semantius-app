/**
 * Types for `extract.mjs`, so `src/test/i18nCatalogs.test.ts` can run the real
 * extractor in memory and still typecheck under `tsc -b --noEmit`.
 *
 * The script itself stays plain ESM: it runs under bare `node` from a package
 * script, where nothing transpiles TypeScript.
 */

import type { LocaleFile } from '../../src/i18n/catalog'

export declare const CONTEXT_SEPARATOR: string
export declare const SOURCE_LANGUAGE: string
export declare const NON_CATALOG_FILES: Set<string>
export declare const SRC_DIR: string
export declare const LOCALES_DIR: string

export interface IndexEntry {
  message: string
  context?: string
  origin: string[]
  placeholders: string[]
  comment?: string
}

export interface MessageIndex {
  locale: string
  index: Record<string, IndexEntry>
}

export interface CollectedMessage {
  message: string
  context?: string
  comment?: string
  origin: Set<string>
}

export declare function sourceFiles(dir?: string): string[]
export declare function collectMessages(files?: string[]): Map<string, CollectedMessage>
export declare function placeholdersOf(message: string): string[]
export declare function buildIndex(found?: Map<string, CollectedMessage>): MessageIndex
export declare function catalogFiles(dir?: string): { code: string; path: string }[]
export declare function readJson(path: string): any
export declare function reconcileCatalog(
  catalog: LocaleFile,
  index: MessageIndex,
  options?: { prune?: boolean },
): LocaleFile
export declare function serialize(value: unknown): string
export declare function extract(options?: { prune?: boolean }): {
  index: MessageIndex
  catalogs: { code: string; path: string; file: LocaleFile }[]
}
