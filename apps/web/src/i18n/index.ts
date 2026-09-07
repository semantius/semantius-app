/**
 * The app's translation API.
 *
 *   const t = useT()                              // inside a component
 *   import { translate, msg } from '@/i18n'       // everywhere else
 *
 *   t('Enter a valid email address')
 *   t('Delete {label}?', { label: singularLabel })
 *   t('{count, plural, one {# row} other {# rows}} selected', { count })
 *   t({ message: 'Right', context: 'direction' })
 *   <Trans id="Delete <bold>{name}</bold>?" values={{ name }} components={{ bold: <strong /> }} />
 *
 * THE SOURCE STRING IS THE KEY. There are no message ids to invent, so a label
 * is found by grepping for the words on the screen, and adding a string is one
 * edit in the file that renders it. The cost is that REWORDING a string orphans
 * its translations — `i18n:extract` moves them to `obsolete` and the new wording
 * is missing until translated, which is why a PR that rewords a string fills in
 * its `de-DE.json` entry in the same PR.
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

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { i18n } from '@lingui/core'
import { compileMessageOrThrow, type CompiledMessage } from '@lingui/message-utils/compileMessage'
import {
  SOURCE_LANGUAGE,
  catalogSnapshot,
  currentDynamic,
  currentLabels,
  currentLanguage,
  flattenDynamic,
  flattenLabels,
  flattenMessages,
  messageId,
  scopedId,
  setCatalogState,
  subscribeToCatalog,
  type DynamicScope,
  type MessageDescriptor,
  type TranslationMap,
} from './catalog'
import { localizeMetadata } from './labels'
import { loadLocaleFiles, rememberLocaleNames } from './store'
import { writeCachedFormattingLocale, writeCachedLanguage } from './resolveLocale'
import { clearReverseIndex, isRecordingRenders, recordRender } from './reverseIndex'
import type { EntityMetadata } from '@/types/metadata'

export { i18n }
export {
  msg,
  messageId,
  splitMessageId,
  scopedId,
  splitScopedId,
  translatedKeys,
  currentMessages,
  currentLabels,
  currentDynamic,
  currentLanguage,
  addCatalogEntry,
  addMessageEntry,
  subscribeToCatalog,
  catalogSnapshot,
  SCOPE,
  flattenMessages,
  flattenLabels,
  flattenDynamic,
  tableLabelKey,
  columnLabelKey,
  enumLabelKey,
  moduleLabelKey,
  COLUMN_LABEL_ATTRIBUTES,
  LABEL_SCOPES,
  SOURCE_LANGUAGE,
  CONTEXT_SEPARATOR,
} from './catalog'
export type {
  MessageDescriptor,
  LocaleFile,
  TranslationMap,
  TranslationScope,
  LabelScope,
  DynamicScope,
  ColumnLabelAttribute,
  LabelFileSection,
  TableLabelFile,
  ColumnLabelFile,
  ModuleLabelFile,
} from './catalog'
export {
  TABLE_ATTR,
  COLUMN_ATTR,
  MODULE_ATTR,
  localizeMetadata,
  enumLabel,
  tableLabel,
  columnLabel,
  moduleLabel,
  moduleOverride,
  labelOf,
} from './labels'
export {
  applyRowToFile,
  emptyLocaleFile,
  localeFileToRows,
  parseLabelKey,
  rowsToLocaleFiles,
} from './localeFile'
export type { TranslationRow } from './localeFile'
export {
  buildLabelInventory,
  diffLabelInventory,
  parseEnumValues,
} from './labelInventory'
export type {
  InventoryEntry,
  InventoryDiff,
  OrphanedEntry,
  ModelRows,
  TableRow,
  FieldRow,
  ModuleRow,
} from './labelInventory'
export {
  availableLocales,
  languageDisplayName,
  availableLanguages,
  localeLayers,
  loadLocaleFiles,
  operatorDefaultLanguage,
  setDeploymentLocales,
  setTenantLocaleFiles,
  setTenantTableAvailable,
  tenantTableAvailable,
  tenantLocaleFile,
} from './store'
export type { LocaleInfo, LocaleLayer } from './store'
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
  PANEL_TAB,
  CATALOG_FILTER,
  LABEL_VIEW,
  canTranslate,
  consumeJustEnabled,
  setMarkMissing,
  setMissingCount,
  setTranslateMode,
  translateModeFlags,
  useTranslateModeFlags,
} from './translateModeState'
export type {
  TranslateModeFlags,
  PanelTab,
  CatalogFilter,
  LabelView,
} from './translateModeState'
export { placeholdersOf, placeholderDiff, compileError } from './placeholders'
export type { PlaceholderDiff } from './placeholders'
export {
  messageIndex,
  messageEntries,
  labelEntry,
  dynamicEntry,
  inventoryEntry,
  requestEntry,
  entryForId,
  currentTranslationOf,
} from './entries'
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
  TENANT_TABLE,
  TENANT_PAGE_SIZE,
  TENANT_MAX_PAGES,
  TRANSLATION_CONFLICT_COLUMNS,
  TRANSLATE_PERMISSION,
  FALLBACK_TRANSLATE_PERMISSION,
  MODEL_TABLES,
  MODEL_QUERIES,
  SAVE_PREFERENCES_RPC,
  tenantPageQuery,
  queueQuery,
  translatedAtQuery,
  isTenantTableAbsent,
  isPreferenceRpcAbsent,
  savePreferencesParams,
  sessionPreferenceFrom,
} from './tenant'
export type { SavePreferencesParams } from './tenant'
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

/** Values interpolated into an ICU message. */
export type MessageValues = Record<string, unknown>

/** What `useT()` hands back, and what `translate` is. */
export type TranslateFn = (message: string | MessageDescriptor, values?: MessageValues) => string

// ── Lazy, memoized ICU compilation ──────────────────────────────────────────
//
// Catalogs ship as raw ICU strings, so there is no precompile step and no
// generated runtime index: a string added to code before the next extraction
// still interpolates. Lingui compiles on every `_()` call unless a compiler
// caches, so this one does — a message is parsed once per session.
//
// The catch it also exists for: catalog content is not all ours. An operator's
// file or a row typed into the admin grid can hold a malformed pattern, and
// Lingui's own `compileMessage` answers that with a `console.error` on EVERY
// render. Here it is one warning per session and the source text is rendered
// instead, so no catalog content can break a screen.

const compiledCache = new Map<string, CompiledMessage>()
let warnedAboutCompileFailure = false

i18n.setMessagesCompiler((message: string): CompiledMessage => {
  const hit = compiledCache.get(message)
  if (hit) return hit
  let compiled: CompiledMessage
  try {
    compiled = compileMessageOrThrow(message)
  } catch (err) {
    if (!warnedAboutCompileFailure) {
      warnedAboutCompileFailure = true
      console.warn('[i18n] a message could not be compiled; showing it verbatim', { message, error: err })
    }
    // A single literal token: the message renders as written, uninterpolated.
    compiled = [message]
  }
  compiledCache.set(message, compiled)
  return compiled
})

// ── Translating ─────────────────────────────────────────────────────────────

/**
 * Translate outside React. `t()` is the same function; see the header for why
 * they have different names.
 */
export const translate: TranslateFn = (message, values) => {
  let rendered: string
  if (typeof message === 'string') {
    rendered = i18n._(message, values)
  } else {
    // The id carries the context; `message` is the fallback when the catalog has
    // no entry, because the id is not readable text on its own.
    rendered = i18n._(messageId(message), values, { message: message.message })
  }
  // Translate mode's reverse index — one boolean check per call while it is
  // off, a map write while somebody is translating. The VALUES go with it: a
  // sentence built from a model label ("Add {label}") renders as one text node,
  // and without them the label inside it is unreachable. See ./reverseIndex.ts.
  if (isRecordingRenders()) {
    recordRender(rendered, messageId(message), typeof message === 'string' ? message : message.message, values)
  }
  return rendered
}

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

// ── Runtime text: `server` and `rule` ───────────────────────────────────────
//
// Messages the app cannot know in advance — a PostgREST or RPC message, a
// message authored in a model validation rule. They are looked up VERBATIM and
// never ICU-compiled: server text may legitimately contain braces, and running
// it through the ICU compiler would either throw or silently eat them.
//
// Every miss is recorded as translation work (see ./missing.ts), which is what
// turns "a German user saw an English error once" into a row somebody can act
// on rather than something nobody ever hears about.

export interface DynamicOptions {
  /** `server` for PostgREST/RPC text, `rule` for model validation rules. */
  scope?: DynamicScope
  /** Where the app met it: a route path, a rule name, an RPC name. */
  origin?: string
  /**
   * The PostgREST error code, when there is one. Only a message whose error
   * carried a code is RECORDED — that filter is what keeps the app's own
   * English throws ("Failed to fetch orders") out of the tenant's queue.
   */
  code?: string
}

/**
 * Translate a message the app did not author. Returns `text` unchanged when
 * there is no entry, which is the normal case on a fresh deployment.
 */
export function translateDynamic(text: string, options: DynamicOptions = {}): string {
  if (!text) return text
  const scope = options.scope ?? 'server'
  const id = scopedId(scope, text)
  const hit = currentDynamic()[id]
  if (isRecordingRenders()) recordRender(hit || text, id, text)
  if (hit) return hit
  recordDynamicMiss?.(text, scope, options)
  return text
}

/**
 * The collector's hook into `translateDynamic`, installed by ./missing.ts.
 *
 * An injection rather than an import so this module keeps no dependency on the
 * collector: `translateDynamic` is called from route loaders and from tests
 * where nothing should ever reach the network, and a module-level import would
 * make the collector's presence a property of the import graph rather than of
 * the app's own setup.
 */
type DynamicMissReporter = (text: string, scope: DynamicScope, options: DynamicOptions) => void
let recordDynamicMiss: DynamicMissReporter | undefined

export function setDynamicMissReporter(reporter: DynamicMissReporter | undefined): void {
  recordDynamicMiss = reporter
}

/**
 * The collector's hook into `useLocalizedMetadata`, installed the same way and
 * for the same reason: an entity's labels are the only place the app can see
 * which MODEL text a language does not cover, and a direct import would make
 * every test that renders a grid a potential writer to the tenant.
 */
type LabelMissReporter = (metadata: EntityMetadata, labels: TranslationMap) => void
let reportLabelMisses: LabelMissReporter | undefined

export function setLabelMissReporter(reporter: LabelMissReporter | undefined): void {
  reportLabelMisses = reporter
}

// ── Model labels in React ───────────────────────────────────────────────────

/**
 * The active language's model-label overrides, re-rendering when they change.
 *
 * Subscribes to the CATALOG's own emitter rather than Lingui's: labels are not
 * messages and Lingui never holds them, but both are written by the same
 * `activateLocale` call, so the two events fire together.
 */
export function useLocaleLabels(): TranslationMap {
  useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  return currentLabels()
}

/**
 * `metadata` with the active language's label overrides applied.
 *
 * Memoized on the metadata identity and the catalog version, so a grid that
 * re-renders for its own reasons does not rebuild the schema, and a language
 * switch does exactly once.
 */
export function useLocalizedMetadata(metadata: EntityMetadata): EntityMetadata
export function useLocalizedMetadata(metadata: EntityMetadata | undefined): EntityMetadata | undefined
export function useLocalizedMetadata(metadata: EntityMetadata | undefined): EntityMetadata | undefined {
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  // In an effect, never in the memo: recording a miss is a side effect that ends
  // in a network write, and a render must stay free of those (StrictMode runs it
  // twice, and a memo can be discarded and recomputed).
  useEffect(() => {
    if (metadata) reportLabelMisses?.(metadata, currentLabels())
  }, [metadata, version])
  return useMemo(
    () => (metadata ? localizeMetadata(metadata, currentLabels()) : metadata),
    // `version` is the dependency that stands in for the label map: the map's
    // identity changes with it, and reading it here rather than listing it keeps
    // the memo from depending on a value React cannot compare.
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

function directionOf(language: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(language.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr'
}

/**
 * Load every layer for `pref.language`, merge them and make the result the
 * active language.
 *
 * `loadAndActivate` REPLACES the language's message table rather than merging
 * into it, which is what makes clearing a translate-mode draft or resetting to
 * the shipped catalog actually take effect. Only a single-key save uses Lingui's
 * merging `i18n.load`.
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
  let messages: TranslationMap = {}
  let labels: TranslationMap = {}
  let dynamic: TranslationMap = {}
  let language = pref.language
  try {
    const files = await loadLocaleFiles(pref.language)
    rememberLocaleNames(files)
    // Later layers win. Empty values are dropped by the flatteners, so a gap in
    // a higher layer falls through to a lower one instead of masking it.
    for (const file of files) {
      Object.assign(messages, flattenMessages(file))
      Object.assign(labels, flattenLabels(file))
      Object.assign(dynamic, flattenDynamic(file))
    }
  } catch (err) {
    console.warn('[i18n] could not load', pref.language, '— falling back to', SOURCE_LANGUAGE, err)
    language = SOURCE_LANGUAGE
    messages = {}
    labels = {}
    dynamic = {}
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
  setCatalogState(language, messages, labels, dynamic)
  currentFormattingLocale = pref.locale || language
  // A COPY for Lingui: its merging `load` (a translate-mode save) assigns into
  // the object it was given, and the catalog's own map must not change under
  // `currentMessages()` before `addMessageEntry` says so.
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
 * Translate mode's way of making a change canonical: a draft saved or cleared
 * lives in a LAYER, and only a full activation folds the layers again (and
 * re-renders every `useT()` consumer, which is also what fills the reverse
 * index after recording is switched on). Never persists.
 */
export async function reactivateLocale(): Promise<void> {
  await activateLocale({ language: currentLanguage(), locale: currentFormattingLocale })
}
export { rowId } from './translationRow'
export type { SaveRow } from './translationRow'
