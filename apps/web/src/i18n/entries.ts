/**
 * Everything translate mode can list or edit, in one shape.
 *
 * Three kinds of thing have three different inventories — code strings come
 * from the generated `en-US.json` index, model labels from the label inventory
 * or from what rendered, runtime text only from what rendered or was requested
 * — and the panel and the editor should not care which. A `TranslationEntry`
 * is the common denominator: an id, its scope and key, the source text a
 * translator reads, where it came from, and the placeholders it has to keep.
 *
 * The CURRENT translation is deliberately not a field. It changes under the
 * entry (a save, a language switch) and is read live from catalog.ts through
 * `currentTranslationOf`, so a list never shows a stale value.
 */

import indexFile from '../locales/en-US.json'
import type { MessageIndex } from '../../scripts/i18n/extract.mjs'
import {
  currentDynamic,
  currentLabels,
  currentMessages,
  messageId,
  scopedId,
  splitMessageId,
  splitScopedId,
  type DynamicScope,
  type LabelScope,
  type TranslationScope,
} from './catalog'
import { renderedSourceOf } from './reverseIndex'
import { placeholdersOf } from './placeholders'
import type { InventoryEntry } from './labelInventory'

export interface TranslationEntry {
  /** The runtime id — what `translatedKeys` and the reverse index are keyed by. */
  id: string
  scope: TranslationScope
  /** The source text for a message; the model key for a label; the text for runtime text. */
  key: string
  /** A message's context, '' otherwise. */
  context: string
  /** What a translator reads: the English, the model's own label, the server's text. */
  source: string
  /** Origin files for a message, a route for a request, nothing for a label. */
  origins: string[]
  placeholders: string[]
}

const index = indexFile as MessageIndex

/** The generated index, for the panel's totals. */
export function messageIndex(): MessageIndex {
  return index
}

let cachedMessageEntries: TranslationEntry[] | undefined

/** Every code string the app can render, from the index. Built once. */
export function messageEntries(): TranslationEntry[] {
  cachedMessageEntries ??= Object.entries(index.index).map(([id, entry]) => ({
    id,
    scope: 'message',
    key: entry.message,
    context: entry.context ?? '',
    source: entry.message,
    origins: entry.origin,
    placeholders: entry.placeholders,
  }))
  return cachedMessageEntries
}

/** One model label, from the inventory or from a render. */
export function labelEntry(scope: LabelScope, key: string, source: string): TranslationEntry {
  return { id: scopedId(scope, key), scope, key, context: '', source, origins: [], placeholders: safePlaceholders(source) }
}

/** One piece of runtime text. Never ICU: its placeholders are none by definition. */
export function dynamicEntry(scope: DynamicScope, key: string, origin?: string): TranslationEntry {
  return { id: scopedId(scope, key), scope, key, context: '', source: key, origins: origin ? [origin] : [], placeholders: [] }
}

/** An inventory entry as the panel lists it. */
export function inventoryEntry(entry: InventoryEntry): TranslationEntry {
  return labelEntry(entry.scope, entry.key, entry.source)
}

/**
 * A request row (or a locally kept one) as an entry. A message request carries
 * its source text as the key; a label request only its key, whose English is
 * looked up in the index or the reverse index when either has seen it.
 */
export function requestEntry(row: { scope: TranslationScope; key: string; context?: string; origin?: string | null }): TranslationEntry {
  const context = row.context ?? ''
  if (row.scope === 'message') {
    const id = messageId(context ? { message: row.key, context } : row.key)
    const known = index.index[id]
    return {
      id,
      scope: 'message',
      key: row.key,
      context,
      source: row.key,
      origins: known?.origin ?? (row.origin ? [row.origin] : []),
      placeholders: known?.placeholders ?? safePlaceholders(row.key),
    }
  }
  if (row.scope === 'server' || row.scope === 'rule') return dynamicEntry(row.scope, row.key, row.origin ?? undefined)
  const id = scopedId(row.scope, row.key)
  return { ...labelEntry(row.scope, row.key, renderedSourceOf(id) ?? row.key), origins: row.origin ? [row.origin] : [] }
}

/**
 * The entry behind a runtime id — a message from the index, anything else from
 * what the reverse index recorded when it rendered. Undefined for an id nothing
 * knows, which cannot happen for one the reverse index just resolved.
 */
export function entryForId(id: string): TranslationEntry | undefined {
  const known = index.index[id]
  if (known) {
    return {
      id,
      scope: 'message',
      key: known.message,
      context: known.context ?? '',
      source: known.message,
      origins: known.origin,
      placeholders: known.placeholders,
    }
  }
  const scoped = splitScopedId(id)
  if (scoped) {
    const source = renderedSourceOf(id) ?? scoped.key
    if (scoped.scope === 'server' || scoped.scope === 'rule') return dynamicEntry(scoped.scope, scoped.key)
    return labelEntry(scoped.scope, scoped.key, source)
  }
  // A message that is not in the index: a string added to code since the last
  // extraction, or an operator's menu title. Still editable.
  const source = renderedSourceOf(id)
  if (source === undefined) return undefined
  const { message, context } = splitMessageId(id)
  return {
    id,
    scope: 'message',
    key: message,
    context: context ?? '',
    source,
    origins: [],
    placeholders: safePlaceholders(source),
  }
}

/** The active language's current translation of `entry`, '' when none. */
export function currentTranslationOf(entry: Pick<TranslationEntry, 'id' | 'scope'>): string {
  if (entry.scope === 'message') return currentMessages()[entry.id] ?? ''
  if (entry.scope === 'server' || entry.scope === 'rule') return currentDynamic()[entry.id] ?? ''
  return currentLabels()[entry.id] ?? ''
}

function safePlaceholders(text: string): string[] {
  try {
    return placeholdersOf(text)
  } catch {
    return []
  }
}
