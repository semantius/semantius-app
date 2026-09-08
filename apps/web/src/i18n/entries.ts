/**
 * Everything translate mode can list or edit, in one shape.
 *
 * There is one inventory — the index, `en-US.json`, every key with its source
 * — plus whatever rendered on this page that the index has not caught up with
 * yet (a string discovered this session). A `TranslationEntry` is the common
 * denominator: a key, the source text a translator reads, and the placeholders
 * a translation has to keep.
 *
 * The CURRENT translation is deliberately not a field. It changes under the
 * entry (a save, a language switch) and is read live from catalog.ts through
 * `currentTranslationOf`, so a list never shows a stale value.
 */

import { currentMessages } from './catalog'
import { placeholdersOf } from './placeholders'
import { renderedSourceOf } from './reverseIndex'

export interface TranslationEntry {
  /** The stored key — what `translatedKeys` and the reverse index are keyed by. */
  id: string
  /** What a translator reads: the English, the model's own label, the server's template. */
  source: string
  placeholders: string[]
}

export function makeEntry(id: string, source: string): TranslationEntry {
  return { id, source, placeholders: safePlaceholders(source) }
}

/** Every entry of the index, in the index's order. */
export function indexEntries(index: ReadonlyMap<string, string>): TranslationEntry[] {
  return [...index].map(([id, source]) => makeEntry(id, source))
}

/**
 * The entry behind a key — from the index, else from what the reverse index
 * recorded when it rendered. Undefined for a key nothing knows, which cannot
 * happen for one the reverse index just resolved.
 */
export function entryForId(id: string, index: ReadonlyMap<string, string> | undefined): TranslationEntry | undefined {
  const indexed = index?.get(id)
  if (indexed !== undefined) return makeEntry(id, indexed)
  const rendered = renderedSourceOf(id)
  return rendered === undefined ? undefined : makeEntry(id, rendered)
}

/** The active language's current translation of `entry`, '' when none. */
export function currentTranslationOf(entry: Pick<TranslationEntry, 'id'>): string {
  return currentMessages()[entry.id] ?? ''
}

function safePlaceholders(text: string): string[] {
  try {
    return placeholdersOf(text)
  } catch {
    return []
  }
}
