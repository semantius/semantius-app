/**
 * The two translate-mode switches, and who may flip them.
 *
 * Kept OUT of the lazy `./translateMode/` chunk on purpose: the account menu
 * has to render the checkboxes and the missing count before that chunk exists,
 * and `TranslateModeHost` has to know whether to load it at all. Everything
 * here is a storage key, a permission name or a number — machinery, which is
 * why it lives at the top level of `src/i18n` with the other exempt modules.
 *
 * Both switches persist per browser: a translator who reloads mid-session
 * should not have to find the menu again.
 */

import { useSyncExternalStore } from 'react'
import { FALLBACK_TRANSLATE_PERMISSION, TRANSLATE_PERMISSION } from './tenant'

export const MARK_MISSING_KEY = 'semantius-i18n-mark'
export const TRANSLATE_MODE_KEY = 'semantius-i18n-translate'

/** Where a save goes. Decided per render by `useTranslationWriter`. */
export const WRITER_TARGET = { tenant: 'tenant', draft: 'draft' } as const
export type WriterTarget = (typeof WRITER_TARGET)[keyof typeof WRITER_TARGET]

/** The panel's tabs and its catalog filters — identifiers, named here so the UI files carry no bare literals. */
export const PANEL_TAB = { catalog: 'catalog', labels: 'labels' } as const
export type PanelTab = (typeof PANEL_TAB)[keyof typeof PANEL_TAB]

export const CATALOG_FILTER = {
  all: 'all',
  missing: 'missing',
  requested: 'requested',
  drafts: 'drafts',
  onPage: 'on-page',
} as const
export type CatalogFilter = (typeof CATALOG_FILTER)[keyof typeof CATALOG_FILTER]

export const LABEL_VIEW = { page: 'page', model: 'model' } as const
export type LabelView = (typeof LABEL_VIEW)[keyof typeof LABEL_VIEW]

export interface TranslateModeFlags {
  /** Highlight untranslated text on the page. */
  marking: boolean
  /** The full mode: marking, Alt+click editing and the panel. */
  editing: boolean
  /** What the active language still lacks — the index plus the labels on screen. */
  missingCount: number
}

function readFlag(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* storage blocked — the switch still applies for this page */
  }
}

let flags: TranslateModeFlags = {
  marking: readFlag(MARK_MISSING_KEY),
  editing: readFlag(TRANSLATE_MODE_KEY),
  missingCount: 0,
}

const listeners = new Set<() => void>()

function update(next: Partial<TranslateModeFlags>): void {
  flags = { ...flags, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current switches, outside React. */
export function translateModeFlags(): TranslateModeFlags {
  return flags
}

/** The current switches, re-rendering when they change. */
export function useTranslateModeFlags(): TranslateModeFlags {
  return useSyncExternalStore(
    subscribe,
    () => flags,
    () => flags,
  )
}

export function setMarkMissing(on: boolean): void {
  writeFlag(MARK_MISSING_KEY, on)
  update({ marking: on })
}

export function setTranslateMode(on: boolean): void {
  writeFlag(TRANSLATE_MODE_KEY, on)
  update({ editing: on })
}

/** Written by the translate-mode chunk after every scan. */
export function setMissingCount(count: number): void {
  if (count !== flags.missingCount) update({ missingCount: count })
}

/**
 * Who sees the switches at all.
 *
 * `translations.edit` is the permission the platform migration creates; until
 * a tenant has it, `admin` stands in — an admin can always at least draft and
 * export. Whether a save becomes a ROW is a separate, narrower question
 * (`canWriteTenant`): drafting needs no permission the platform enforces, a row
 * does.
 */
export function canTranslate(permissions: readonly string[] | undefined): boolean {
  if (!permissions) return false
  return permissions.includes(TRANSLATE_PERMISSION) || permissions.includes(FALLBACK_TRANSLATE_PERMISSION)
}

/** Whether a save may go to the tenant's table, permission-wise. */
export function canWriteTenant(permissions: readonly string[] | undefined): boolean {
  return permissions?.includes(TRANSLATE_PERMISSION) ?? false
}
