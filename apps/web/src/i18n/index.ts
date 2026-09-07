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

import { useSyncExternalStore } from 'react'
import { i18n } from '@lingui/core'
import { compileMessageOrThrow, type CompiledMessage } from '@lingui/message-utils/compileMessage'
import {
  SOURCE_LANGUAGE,
  flattenMessages,
  messageId,
  setCatalogState,
  type MessageDescriptor,
  type TranslationMap,
} from './catalog'
import { loadLocaleFiles, rememberLocaleNames } from './store'
import { writeCachedFormattingLocale, writeCachedLanguage } from './resolveLocale'

export { i18n }
export { msg, messageId, splitMessageId, translatedKeys, SOURCE_LANGUAGE, CONTEXT_SEPARATOR } from './catalog'
export type { MessageDescriptor, LocaleFile, TranslationMap } from './catalog'
export { availableLocales, languageDisplayName, availableLanguages, localeLayers } from './store'
export type { LocaleInfo, LocaleLayer } from './store'
export {
  resolveInitialLocale,
  resolveLocale,
  matchLanguage,
  readCachedLanguage,
  readCachedFormattingLocale,
  writeCachedLanguage,
  writeCachedFormattingLocale,
  resolvePlaceholderLocale,
  LANGUAGE_CACHE_KEY,
  LOCALE_CACHE_KEY,
} from './resolveLocale'
export type { LocaleSource, LocaleSources, ResolvedLocale } from './resolveLocale'

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
  if (typeof message === 'string') return i18n._(message, values)
  // The id carries the context; `message` is the fallback when the catalog has
  // no entry, because the id is not readable text on its own.
  return i18n._(messageId(message), values, { message: message.message })
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
  let language = pref.language
  try {
    const files = await loadLocaleFiles(pref.language)
    rememberLocaleNames(files)
    // Later layers win. Empty values are dropped by flattenMessages, so a gap in
    // a higher layer falls through to a lower one instead of masking it.
    for (const file of files) Object.assign(messages, flattenMessages(file))
  } catch (err) {
    console.warn('[i18n] could not load', pref.language, '— falling back to', SOURCE_LANGUAGE, err)
    language = SOURCE_LANGUAGE
    messages = {}
  }

  // Both module states are written BEFORE loadAndActivate, because that call is
  // what emits `change` — and every subscriber (useT, useFormattingLocale) reads
  // its snapshot inside that emit. Setting them afterwards would hand the first
  // render after a switch the previous language's values.
  setCatalogState(language, messages)
  currentFormattingLocale = pref.locale || language
  i18n.loadAndActivate({ locale: language, messages })

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
