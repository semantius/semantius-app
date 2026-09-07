/**
 * Two preferences, resolved separately.
 *
 * `language` selects the catalog (`de-DE`); `locale` drives every `Intl` call,
 * date-fns and `localeCompare` (`de-CH`). They are different questions — a
 * German speaker in Zurich reads German UI text and Swiss number formats — and
 * conflating them is how an English UI ends up picking Russian plural
 * categories, which is exactly what happens if Lingui is ever handed the
 * formatting locale (see `activateLocale` in ./index.ts).
 *
 * Everything below is pure except the four cache accessors and
 * `resolveInitialLocale()`, which is the one function that reads the
 * environment. The resolution itself takes its sources as an argument so it can
 * be tested in the `node` project against every combination, including the ones
 * that only occur after login.
 */

import { SOURCE_LANGUAGE } from './catalog'
import { availableLanguages } from './store'

/**
 * Where a resolved value came from. Only `session` and `cache` are PREFERENCES;
 * the rest are placeholders, which is what lets the switcher show "Browser
 * default (Deutsch)" with a checkmark instead of pretending the user chose it.
 */
export type LocaleSource = 'session' | 'cache' | 'operator' | 'browser' | 'default'

/** Per-browser cache keys. Mirrored from the session once the platform has one. */
export const LANGUAGE_CACHE_KEY = 'semantius-ui-language'
export const LOCALE_CACHE_KEY = 'semantius-ui-locale'

export interface ResolvedLocale {
  language: string
  locale: string
  languageSource: LocaleSource
  localeSource: LocaleSource
}

/** Everything the resolution consults, so the decision itself stays pure. */
export interface LocaleSources {
  /** The languages that have a catalog. An unavailable choice counts as absent. */
  available: readonly string[]
  /** `get_userinfo`'s `language` / `locale` — the cross-device preference (P4). */
  sessionLanguage?: string | null
  sessionLocale?: string | null
  /** `localStorage`, written by the switcher and mirrored from the session. */
  cachedLanguage?: string | null
  cachedLocale?: string | null
  /** The operator's `locales.default` from the customizer. Language only (P4). */
  operatorDefault?: string | null
  /** `navigator.languages`, in order. */
  browserLanguages?: readonly string[]
  /** `navigator.language` — the browser's formatting locale. */
  browserLocale?: string | null
}

/**
 * Match a wanted language tag against what is available: exact first, then by
 * language subtag, so `de-AT` reaches the `de-DE` catalog rather than falling
 * all the way through to English.
 */
export function matchLanguage(wanted: string | null | undefined, available: readonly string[]): string | undefined {
  const tag = (wanted ?? '').trim()
  if (!tag) return undefined
  const exact = available.find((code) => code.toLowerCase() === tag.toLowerCase())
  if (exact) return exact
  const subtag = tag.split('-')[0].toLowerCase()
  return available.find((code) => code.split('-')[0].toLowerCase() === subtag)
}

/**
 * A formatting locale is any well-formed BCP-47 tag — it is NOT restricted to
 * the languages that have a catalog. It still has to be well-formed, because a
 * junk value out of a shared `localStorage` would throw inside every `Intl`
 * constructor that receives it.
 */
function validFormattingLocale(tag: string | null | undefined): string | undefined {
  const value = (tag ?? '').trim()
  if (!value) return undefined
  try {
    return Intl.getCanonicalLocales(value).length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve both preferences from their sources, each falling through its own
 * chain independently — a cached language with no cached formatting locale
 * takes the browser's locale rather than the language's region.
 */
export function resolveLocale(sources: LocaleSources): ResolvedLocale {
  const { available } = sources

  const languageCandidates: [LocaleSource, string | null | undefined][] = [
    ['session', sources.sessionLanguage],
    ['cache', sources.cachedLanguage],
    ['operator', sources.operatorDefault],
  ]

  let language = SOURCE_LANGUAGE
  let languageSource: LocaleSource = 'default'
  for (const [source, candidate] of languageCandidates) {
    const matched = matchLanguage(candidate, available)
    if (matched) {
      language = matched
      languageSource = source
      break
    }
  }
  if (languageSource === 'default') {
    for (const candidate of sources.browserLanguages ?? []) {
      const matched = matchLanguage(candidate, available)
      if (matched) {
        language = matched
        languageSource = 'browser'
        break
      }
    }
  }

  const localeCandidates: [LocaleSource, string | null | undefined][] = [
    ['session', sources.sessionLocale],
    ['cache', sources.cachedLocale],
    ['browser', sources.browserLocale],
  ]

  let locale = SOURCE_LANGUAGE
  let localeSource: LocaleSource = 'default'
  for (const [source, candidate] of localeCandidates) {
    const valid = validFormattingLocale(candidate)
    if (valid) {
      locale = valid
      localeSource = source
      break
    }
  }

  return { language, locale, languageSource, localeSource }
}

// ── The environment ─────────────────────────────────────────────────────────

/** Read a cache key, tolerating storage being blocked (private mode, policy). */
function readCache(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Write a cache key; `null` removes it, which is what "browser default" means. */
function writeCache(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage blocked — the choice still applies for this page */
  }
}

export function readCachedLanguage(): string | null {
  return readCache(LANGUAGE_CACHE_KEY)
}

export function readCachedFormattingLocale(): string | null {
  return readCache(LOCALE_CACHE_KEY)
}

export function writeCachedLanguage(value: string | null): void {
  writeCache(LANGUAGE_CACHE_KEY, value)
}

export function writeCachedFormattingLocale(value: string | null): void {
  writeCache(LOCALE_CACHE_KEY, value)
}

/** `navigator.languages`, falling back to the single `navigator.language`. */
function browserLanguages(): readonly string[] {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  if (!nav) return []
  if (Array.isArray(nav.languages) && nav.languages.length > 0) return nav.languages
  return nav.language ? [nav.language] : []
}

/**
 * Resolve from the live environment. Called at boot (twice — once before
 * `initConfig()` so `BootFailure` is translated, once after so the operator's
 * default is in play) and again by the switcher after it writes the cache.
 *
 * It never WRITES anything: boot passes must not persist a resolved value, or a
 * cached preference for a language that is only available after login would be
 * overwritten with `en-US` by the first pass.
 *
 * The session fields and the operator default join in P4, together with the
 * post-login re-resolve; until then the chain starts at the cache.
 */
export function resolveInitialLocale(): ResolvedLocale {
  return resolveLocale({
    available: availableLanguages(),
    cachedLanguage: readCachedLanguage(),
    cachedLocale: readCachedFormattingLocale(),
    browserLanguages: browserLanguages(),
    browserLocale: typeof navigator === 'undefined' ? null : navigator.language,
  })
}

/**
 * What the resolution WOULD produce with nothing saved — the placeholder the
 * switcher labels "Browser default (Deutsch)", or "Default (Deutsch)" where an
 * operator has set one.
 *
 * The switcher cannot read this off `resolveInitialLocale()`, because once a
 * preference IS saved that function answers with the preference. It still has to
 * name the alternative, so the entry that clears the preference can say what
 * clearing it would give.
 */
export function resolvePlaceholderLocale(): ResolvedLocale {
  return resolveLocale({
    available: availableLanguages(),
    browserLanguages: browserLanguages(),
    browserLocale: typeof navigator === 'undefined' ? null : navigator.language,
  })
}
