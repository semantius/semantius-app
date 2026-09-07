/**
 * Drafts: translate-mode edits that have nowhere else to go.
 *
 * On a deployment with the `ui_translations` table and a user who may write to
 * it, a save is a row. Everywhere else — a self-hosted operator whose
 * translations are a file next to the app, a tenant without the migration, a
 * user without the permission — a save lands HERE, in this browser's own
 * storage, and leaves through "Download <code>.json". That is what lets someone
 * try a wording in context, see it on every screen, and hand the result over as
 * a file without a server round trip.
 *
 * The drafts are the LAST layer in `store.ts`'s list, so they override every
 * other source while they exist, and `activateLocale` (which REPLACES the
 * language's tables) is what makes clearing them take effect.
 *
 * Stored as rows, not as a nested file: a row is what a save produces and what
 * a clear removes, and the file shape the layer needs is one
 * `rowsToLocaleFiles` call away. One key per language, so a language's drafts
 * are reset without touching another's.
 */

import { messageId, scopedId, type LocaleFile, type TranslationScope } from './catalog'
import { rowsToLocaleFiles } from './localeFile'

const DRAFT_PREFIX = 'semantius-i18n-draft:'

/** One draft, as a save produces it. */
export interface DraftRow {
  scope: TranslationScope
  key: string
  context: string
  translation: string
}

function storageKey(language: string): string {
  return DRAFT_PREFIX + language
}

/** The runtime id a draft row stands for — what `translatedKeys` is keyed by. */
export function draftId(row: Pick<DraftRow, 'scope' | 'key' | 'context'>): string {
  if (row.scope === 'message') {
    return messageId(row.context ? { message: row.key, context: row.context } : row.key)
  }
  return scopedId(row.scope, row.key)
}

/** Every draft for `language`, tolerating blocked or malformed storage. */
export function readDrafts(language: string): DraftRow[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(storageKey(language))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as DraftRow[]).filter((row) => row && row.key && row.scope) : []
  } catch {
    return []
  }
}

function writeDrafts(language: string, rows: DraftRow[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (rows.length === 0) localStorage.removeItem(storageKey(language))
    else localStorage.setItem(storageKey(language), JSON.stringify(rows))
  } catch {
    /* storage blocked or full — the edit still applies for this page */
  }
}

/**
 * Save one draft. An EMPTY translation removes the draft: a draft cannot clear
 * what a lower layer says, it can only stop overriding it.
 */
export function saveDraft(language: string, row: DraftRow): void {
  const context = row.context ?? ''
  const rest = readDrafts(language).filter(
    (existing) => !(existing.scope === row.scope && existing.key === row.key && (existing.context ?? '') === context),
  )
  writeDrafts(language, row.translation ? [...rest, { ...row, context }] : rest)
}

/** Drop every draft for `language`. */
export function clearDrafts(language: string): void {
  writeDrafts(language, [])
}

/** The ids that currently have a draft — the panel's "drafts" filter. */
export function draftIds(language: string): Set<string> {
  return new Set(readDrafts(language).map(draftId))
}

/** The drafts as a locale file, or null when there are none. */
export function draftFile(language: string): LocaleFile | null {
  const rows = readDrafts(language)
  if (rows.length === 0) return null
  return rowsToLocaleFiles(rows.map((row) => ({ locale: language, ...row }))).get(language) ?? null
}
