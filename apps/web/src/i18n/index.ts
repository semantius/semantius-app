/**
 * The app's translation API.
 *
 *   const t = useT()                              // inside a component
 *   import { translate, msg } from '@/i18n'       // everywhere else
 *
 *   t('Enter a valid email address')
 *   t('Delete {label}?', { label: singularLabel })
 *   t('{count, plural, one {# row} other {# rows}} selected', { count })
 *   t({ id: ['columnVisibility'], message: 'View' })
 *   t({ id: ['module', slug, table, 'entity', 'plural_label'], defaultMessage: table.plural_label })
 *   <Trans id="Delete <bold>{name}</bold>?" values={{ name }} components={{ bold: <strong /> }} />
 *
 * THE SOURCE STRING IS THE KEY for a code string. There are no message ids to
 * invent, so a label is found by grepping for the words on the screen, and
 * adding a string is one edit in the file that renders it. The cost is that
 * REWORDING a string orphans its translations — the optional `i18n:extract`
 * scan moves them to `obsolete`. A metadata message is a message with a KEY
 * instead — its English lives in the model, not in the code — and that is the
 * only difference (see ./catalog.ts for the three call forms).
 *
 * TWO NAMES ON PURPOSE. `translate()` is a module function: it cannot re-render
 * a component when the language changes, so a component that called it would
 * keep showing the old language until something else re-rendered it — and three
 * of the grid's components are `React.memo`, so "something else" may never
 * happen. `useT()` subscribes, so components use it and everything outside React
 * (a route's `head()`, `main.tsx`, the class components) uses `translate()`. An
 * ESLint rule enforces the split.
 *
 * Only `<Trans>` needs `<I18nProvider>`; `useT()` subscribes to the singleton
 * directly, so a component test that renders bare keeps working.
 */

import { useMemo, useSyncExternalStore } from 'react'
import {
  SOURCE_LANGUAGE,
  catalogSnapshot,
  currentLanguage,
  flattenMessages,
  knownKeys,
  setCatalogState,
  subscribeToCatalog,
  type TranslationMap,
} from './catalog'
import { localizeMetadata } from './metadata'
import { loadLocaleFiles, rememberLocaleNames } from './store'
import { writeCachedFormattingLocale, writeCachedLanguage } from './resolveLocale'
import { clearReverseIndex } from './reverseIndex'
import { i18n, translate, type TranslateFn } from './translate'
import type { EntityMetadata } from '@/types/metadata'

export { i18n, translate, translateVerbatim, setRenderReporter } from './translate'
export type { MessageValues, TranslateFn } from './translate'
export {
  SOURCE_LANGUAGE,
  MODULE_ROOT,
  ENTITY_MARKER,
  FIELD_MARKER,
  ENUM_MARKER,
  MODULE_ATTRIBUTES,
  ENTITY_ATTRIBUTES,
  FIELD_ATTRIBUTES,
  msg,
  messageId,
  sourceOf,
  escapeSegment,
  joinSegments,
  splitSegments,
  isMetadataKey,
  assertMetadataId,
  flattenMessages,
  knownKeys,
  currentMessages,
  currentLanguage,
  translatedKeys,
  isKnownKey,
  markKnownKey,
  addMessageEntry,
  subscribeToCatalog,
  catalogSnapshot,
} from './catalog'
export type {
  MessageDescriptor,
  SourceMessage,
  KeyedMessage,
  MetadataId,
  ModuleAttribute,
  EntityAttribute,
  FieldAttribute,
  LocaleFile,
  TranslationMap,
} from './catalog'
export { localizeMetadata, enumLabel, metadataText } from './metadata'
export {
  availableLocales,
  languageDisplayName,
  availableLanguages,
  localeLayers,
  loadLocaleFiles,
  operatorDefaultLanguage,
  setDeploymentLocales,
  loadSourceIndex,
  sourceIndexSnapshot,
  addSourceIndexEntry,
  subscribeToSourceIndex,
  sourceIndexVersion,
  resetSourceIndex,
} from './store'
export type { LocaleInfo, LocaleLayer } from './store'
export {
  TRANSLATE_MODES,
  TRANSLATE_MODE_VAR,
  TRANSLATE_URL_VAR,
  parseTranslateMode,
  resolveTranslateTarget,
  setTranslateTarget,
  translateTarget,
  discoveryEnabled,
  targetAvailable,
  setTargetAvailable,
  translationsUrl,
  readTranslations,
  writeTranslation,
} from './translateTarget'
export type { TranslateMode, TranslateTarget, TranslationMessage } from './translateTarget'
export {
  clearReverseIndex,
  embeddedSegments,
  isRecordingRenders,
  normalizeRenderedText,
  recordRender,
  renderedSourceOf,
  resolveRenderedText,
  reverseIndexSize,
  setRecordingRenders,
} from './reverseIndex'
export type { EmbeddedSegment } from './reverseIndex'
export {
  MARK_MISSING_KEY,
  TRANSLATE_MODE_KEY,
  CATALOG_FILTER,
  canTranslate,
  consumeJustEnabled,
  setMarkMissing,
  setMissingCount,
  setTranslateMode,
  translateModeFlags,
  useTranslateModeFlags,
} from './translateModeState'
export type { TranslateModeFlags, CatalogFilter } from './translateModeState'
export { placeholdersOf, placeholderDiff, compileError } from './placeholders'
export type { PlaceholderDiff } from './placeholders'
export { makeEntry, indexEntries, entryForId, currentTranslationOf } from './entries'
export type { TranslationEntry } from './entries'
export {
  HIGHLIGHT_NAME,
  MISSING_ATTRIBUTE,
  UI_ATTRIBUTE,
  SCANNED_ATTRIBUTES,
  supportsHighlightApi,
  scanAndMark,
  clearMarks,
  highlightedTexts,
  resolveClickTarget,
} from './highlighter'
export type { ScanResult, ClickTarget } from './highlighter'
export { resolveLocales, defaultLocaleUrl, EMPTY_LOCALE_CONFIG } from './localeConfig'
export type { LocaleConfig, DeploymentLocale } from './localeConfig'
export {
  TRANSLATE_PERMISSION,
  FALLBACK_TRANSLATE_PERMISSION,
  SAVE_PREFERENCES_RPC,
  isPreferenceRpcAbsent,
  savePreferencesParams,
  sessionPreferenceFrom,
} from './tenant'
export type { SavePreferencesParams } from './tenant'
export {
  RESERVED_ENVELOPE_KEYS,
  ERROR_TEXT_FIELDS,
  parseServerError,
  isCatalogClass,
  constraintNameOf,
  foreignKeyTables,
  isVerbatimKey,
  dollarToIcu,
  fillPlaceholders,
} from './errors'
export type { ParsedServerError } from './errors'
export {
  resolveInitialLocale,
  resolveLocale,
  matchLanguage,
  readCachedLanguage,
  readCachedFormattingLocale,
  writeCachedLanguage,
  writeCachedFormattingLocale,
  resolvePlaceholderLocale,
  setSessionPreference,
  currentSessionPreference,
  clearSessionPreference,
  LANGUAGE_CACHE_KEY,
  LOCALE_CACHE_KEY,
} from './resolveLocale'
export type { LocaleSource, LocaleSources, ResolvedLocale, SessionPreference } from './resolveLocale'

// ── The hooks ───────────────────────────────────────────────────────────────

/**
 * Rebuilt on every locale change so its IDENTITY changes with the language.
 * That is what makes `t` a meaningful dependency: a `useMemo` or `useEffect`
 * that lists it re-runs when the language switches.
 */
let currentT: TranslateFn = (message, values) => translate(message, values)
i18n.on('change', () => {
  currentT = (message, values) => translate(message, values)
})

function subscribeToLocale(onChange: () => void): () => void {
  return i18n.on('change', onChange)
}

/**
 * The translate function for a component. Re-renders it when the language
 * changes, with or without `<I18nProvider>`.
 */
export function useT(): TranslateFn {
  return useSyncExternalStore(
    subscribeToLocale,
    () => currentT,
    () => currentT,
  )
}

/** The active catalog language, for a component that has to name it. */
export function useLanguage(): string {
  return useSyncExternalStore(
    subscribeToLocale,
    () => i18n.locale,
    () => i18n.locale,
  )
}

/**
 * `metadata` with the active language's translations applied.
 *
 * Memoized on the metadata identity and the catalog version, so a grid that
 * re-renders for its own reasons does not rebuild the schema, and a language
 * switch does exactly once. The walk inside is also what hands every label to
 * discovery and to translate mode's reverse index.
 */
export function useLocalizedMetadata(metadata: EntityMetadata): EntityMetadata
export function useLocalizedMetadata(metadata: EntityMetadata | undefined): EntityMetadata | undefined
export function useLocalizedMetadata(metadata: EntityMetadata | undefined): EntityMetadata | undefined {
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  return useMemo(
    () => (metadata ? localizeMetadata(metadata) : metadata),
    // `version` is the dependency that stands in for the catalog: it changes
    // with every activation and every save, and reading the catalog inside
    // rather than listing it keeps the memo from depending on a value React
    // cannot compare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metadata, version],
  )
}

// ── The formatting locale ───────────────────────────────────────────────────
//
// Deliberately NOT handed to Lingui. `i18n.loadAndActivate` takes an optional
// `locales`, and Lingui feeds it to `Intl.PluralRules` as well as to its number
// and date helpers — so an English UI with Russian formats would pick Russian
// plural categories for an English sentence. Lingui only ever sees `language`.
// The accepted cost is that `#` inside an ICU message formats per language.

let currentFormattingLocale = SOURCE_LANGUAGE

/** The locale for `Intl`, date-fns and `localeCompare`. Never the catalog language. */
export function formattingLocale(): string {
  return currentFormattingLocale
}

/** `formattingLocale()` for a component, re-rendering when it changes. */
export function useFormattingLocale(): string {
  return useSyncExternalStore(
    subscribeToLocale,
    () => currentFormattingLocale,
    () => currentFormattingLocale,
  )
}

// ── Activation ──────────────────────────────────────────────────────────────

export interface LocalePreference {
  /** The catalog language, e.g. `de-DE`. */
  language: string
  /** The formatting locale, e.g. `de-CH`. */
  locale: string
}

export interface ActivateOptions {
  /**
   * Write the choice into the per-browser cache.
   *
   * Per field, and each field is optional, because the three states are all
   * real: a string SAVES it, `null` CLEARS it (that is what "Use browser
   * default" does), and an omitted field leaves the key alone — which is what
   * lets the switcher save a language without silently promoting a
   * browser-derived formatting locale into a preference the user never chose.
   *
   * Boot passes never persist. If they did, the first pass — which runs before
   * the tenant's languages are known — would overwrite a cached preference for a
   * tenant-only language with `en-US`.
   */
  persist?: { language?: string | null; locale?: string | null }
}

/** RTL scripts, by language subtag. `dir` follows the language, like `lang`. */
const RTL_LANGUAGES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi'])

/** Counts activations, so an overtaken one can tell. See `activateLocale`. */
let activationSerial = 0

function directionOf(language: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(language.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr'
}

/**
 * Load both sources for `pref.language`, merge them and make the result the
 * active language.
 *
 * `loadAndActivate` REPLACES the language's message table rather than merging
 * into it, which is what makes clearing a translation or resetting to the
 * shipped file actually take effect.
 *
 * It never throws and never leaves the app without an active locale: an
 * `I18nProvider` with no active locale renders `null`, and under the boot
 * overlay a component that renders nothing is a HANG, not an error. A failure
 * here logs and activates the source language, which is always correct English.
 *
 * It also never touches the router — `src/i18n` cannot import `main.tsx`'s
 * router without booting the app in every test. A caller that switches at
 * runtime follows this with `router.invalidate()` so every route's `head()`
 * re-runs and `document.title` follows the language.
 */
export async function activateLocale(pref: LocalePreference, options: ActivateOptions = {}): Promise<void> {
  // The LAST call wins. Loading a language is a network round trip now (the
  // file, the record), so two activations can overlap — a switch followed by
  // another, a boot pass followed by the post-login pass — and the one that
  // finishes LAST would otherwise decide, whichever was asked for last. An
  // activation overtaken while it was loading applies nothing.
  const serial = ++activationSerial
  let messages: TranslationMap = {}
  const known = new Set<string>()
  let language = pref.language
  try {
    const files = await loadLocaleFiles(pref.language)
    if (serial !== activationSerial) return
    rememberLocaleNames(files)
    // Later layers win. Empty values are dropped by the flattener, so a gap in
    // the record falls through to the file instead of masking it; the KNOWN
    // set keeps them, so discovery does not record a key the file already has.
    for (const file of files) {
      Object.assign(messages, flattenMessages(file))
      for (const key of knownKeys(file)) known.add(key)
    }
  } catch (err) {
    if (serial !== activationSerial) return
    console.warn('[i18n] could not load', pref.language, '— falling back to', SOURCE_LANGUAGE, err)
    language = SOURCE_LANGUAGE
    messages = {}
    known.clear()
  }

  // Both module states are written BEFORE loadAndActivate, because that call is
  // what emits `change` — and every subscriber (useT, useFormattingLocale) reads
  // its snapshot inside that emit. Setting them afterwards would hand the first
  // render after a switch the previous language's values.
  //
  // The reverse index goes first: the text it holds was rendered by the
  // language being replaced, and the re-render this triggers records the new
  // one.
  clearReverseIndex()
  setCatalogState(language, messages, known)
  currentFormattingLocale = pref.locale || language
  // A COPY for Lingui: its table must not be the catalog's own map, which
  // `addMessageEntry` replaces rather than mutates.
  i18n.loadAndActivate({ locale: language, messages: { ...messages } })

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
    document.documentElement.dir = directionOf(language)
  }

  const persist = options.persist
  if (persist) {
    if (persist.language !== undefined) writeCachedLanguage(persist.language)
    if (persist.locale !== undefined) writeCachedFormattingLocale(persist.locale)
  }
}

/**
 * Re-run `activateLocale` for what is already active.
 *
 * Translate mode's way of making a change canonical: a save lives in the
 * target, and only a full activation folds both sources again (and re-renders
 * every `useT()` consumer, which is also what fills the reverse index after
 * recording is switched on). Never persists.
 */
export async function reactivateLocale(): Promise<void> {
  await activateLocale({ language: currentLanguage(), locale: currentFormattingLocale })
}
