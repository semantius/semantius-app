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
import { tenantTableAvailable } from './store'
import { FALLBACK_TRANSLATE_PERMISSION, TRANSLATE_PERMISSION } from './tenant'
import { translateTargetIsRepo } from './translateTarget'

export const MARK_MISSING_KEY = 'semantius-i18n-mark'
export const TRANSLATE_MODE_KEY = 'semantius-i18n-translate'

/** The panel's tabs and its catalog filters — identifiers, named here so the UI files carry no bare literals. */
export const PANEL_TAB = { catalog: 'catalog', labels: 'labels' } as const
export type PanelTab = (typeof PANEL_TAB)[keyof typeof PANEL_TAB]

export const CATALOG_FILTER = {
  all: 'all',
  missing: 'missing',
  requested: 'requested',
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

/**
 * Set by the switch, read and cleared once by the mode when it mounts.
 *
 * Alt+click has to be TOLD to somebody — a plain click deliberately still does
 * what it always did, so nothing on screen reveals that the editor exists.
 * This makes the hint appear when the switch is flipped and never again: it is
 * module state, so a reload clears it, and a page that boots with the mode
 * already on says nothing.
 */
let justEnabled = false

export function setTranslateMode(on: boolean): void {
  writeFlag(TRANSLATE_MODE_KEY, on)
  justEnabled = on
  update({ editing: on })
}

/** True once, for the mount that follows a switch being turned on. */
export function consumeJustEnabled(): boolean {
  const value = justEnabled
  justEnabled = false
  return value
}

/** Written by the translate-mode chunk after every scan. */
export function setMissingCount(count: number): void {
  if (count !== flags.missingCount) update({ missingCount: count })
}

/**
 * Whether translate mode is offered at all.
 *
 * There is exactly one writer and no fallback, so the mode exists only where a
 * translation has somewhere real to go: the dev server writing this checkout,
 * or a translate target whose `ui_translations` table answered. A deployment
 * with neither does not show the switches — an editor that cannot save is
 * worse than no editor.
 *
 * `translations.edit` is the permission the platform migration creates; until a
 * tenant has it, `admin` stands in. The dev server needs neither: it writes the
 * repo of whoever is running it.
 */
export function canTranslate(permissions: readonly string[] | undefined): boolean {
  if (translateTargetIsRepo()) return true
  if (!tenantTableAvailable()) return false
  if (!permissions) return false
  return permissions.includes(TRANSLATE_PERMISSION) || permissions.includes(FALLBACK_TRANSLATE_PERMISSION)
}
