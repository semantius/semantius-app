/**
 * The date-fns locale object for the FORMATTING locale.
 *
 * date-fns and react-day-picker do not take a BCP-47 tag — they take a locale
 * OBJECT holding the month names, weekday names and the long date patterns. That
 * object is data, one module per locale in `date-fns/locale/`, and shipping all
 * ninety-six of them to every browser to use one would be absurd. So each is a
 * LAZY import and only the active one is fetched.
 *
 * The registry is explicit and cannot be a computed specifier: Vite resolves a
 * dynamic `import()` at build time and only follows a variable inside a
 * relative path, never inside a bare package id. `import('date-fns/locale/' +
 * code)` would build and then 404 at runtime, which is the worst of both.
 *
 * Resolution is the full tag first, then its language subtag, which is what
 * makes `de-CH` German rather than nothing — the tag date-fns has no data for is
 * still a German-speaking region. A locale outside the registry resolves to
 * `undefined`, and both date-fns and react-day-picker read that as "use the
 * built-in default", which is US English: the same text the app shows when it
 * has no translation, rather than an error or a blank calendar.
 */

import { useEffect, useSyncExternalStore } from 'react'
import type { Locale } from 'date-fns'
import { useFormattingLocale } from './index'

type LocaleLoader = () => Promise<{ [key: string]: unknown }>

/**
 * The locales whose date-fns data this app ships, keyed by the tag a browser
 * reports. Every entry costs a small on-demand chunk and nothing until it is
 * used, so the list is generous rather than minimal — the formatting locale
 * comes from `navigator.language` and is not limited to the languages the UI is
 * translated into. Add a tag here when a deployment needs it; the fallback to
 * the language subtag already covers most regional variants.
 */
const LOADERS: Record<string, LocaleLoader> = {
  ar: () => import('date-fns/locale/ar'),
  bg: () => import('date-fns/locale/bg'),
  ca: () => import('date-fns/locale/ca'),
  cs: () => import('date-fns/locale/cs'),
  da: () => import('date-fns/locale/da'),
  de: () => import('date-fns/locale/de'),
  'de-AT': () => import('date-fns/locale/de-AT'),
  el: () => import('date-fns/locale/el'),
  en: () => import('date-fns/locale/en-US'),
  'en-AU': () => import('date-fns/locale/en-AU'),
  'en-CA': () => import('date-fns/locale/en-CA'),
  'en-GB': () => import('date-fns/locale/en-GB'),
  'en-IE': () => import('date-fns/locale/en-IE'),
  'en-IN': () => import('date-fns/locale/en-IN'),
  'en-NZ': () => import('date-fns/locale/en-NZ'),
  'en-US': () => import('date-fns/locale/en-US'),
  'en-ZA': () => import('date-fns/locale/en-ZA'),
  es: () => import('date-fns/locale/es'),
  et: () => import('date-fns/locale/et'),
  fi: () => import('date-fns/locale/fi'),
  fr: () => import('date-fns/locale/fr'),
  'fr-CA': () => import('date-fns/locale/fr-CA'),
  'fr-CH': () => import('date-fns/locale/fr-CH'),
  he: () => import('date-fns/locale/he'),
  hi: () => import('date-fns/locale/hi'),
  hr: () => import('date-fns/locale/hr'),
  hu: () => import('date-fns/locale/hu'),
  id: () => import('date-fns/locale/id'),
  it: () => import('date-fns/locale/it'),
  ja: () => import('date-fns/locale/ja'),
  ko: () => import('date-fns/locale/ko'),
  lt: () => import('date-fns/locale/lt'),
  lv: () => import('date-fns/locale/lv'),
  nb: () => import('date-fns/locale/nb'),
  nl: () => import('date-fns/locale/nl'),
  'nl-BE': () => import('date-fns/locale/nl-BE'),
  pl: () => import('date-fns/locale/pl'),
  pt: () => import('date-fns/locale/pt'),
  'pt-BR': () => import('date-fns/locale/pt-BR'),
  ro: () => import('date-fns/locale/ro'),
  ru: () => import('date-fns/locale/ru'),
  sk: () => import('date-fns/locale/sk'),
  sl: () => import('date-fns/locale/sl'),
  sr: () => import('date-fns/locale/sr'),
  sv: () => import('date-fns/locale/sv'),
  th: () => import('date-fns/locale/th'),
  tr: () => import('date-fns/locale/tr'),
  uk: () => import('date-fns/locale/uk'),
  vi: () => import('date-fns/locale/vi'),
  'zh-CN': () => import('date-fns/locale/zh-CN'),
  'zh-TW': () => import('date-fns/locale/zh-TW'),
}

/** The registry key for a tag: the tag itself, else its language subtag. */
function keyFor(locale: string): string | undefined {
  if (LOADERS[locale]) return locale
  const subtag = locale.split('-')[0]
  return LOADERS[subtag] ? subtag : undefined
}

/**
 * Resolved locales, by registry key. A `null` records a load that FAILED, so a
 * missing chunk is retried once per session rather than on every render.
 */
const resolved = new Map<string, Locale | null>()
const inFlight = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()

/**
 * Bumped whenever a load lands. `useSyncExternalStore` needs a snapshot that is
 * `Object.is`-stable between renders, and a Map lookup is not — a counter is.
 */
let version = 0

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getVersion(): number {
  return version
}

/** The date-fns locale for `locale` if it is already loaded. Pure; never fetches. */
export function peekDateFnsLocale(locale: string): Locale | undefined {
  const key = keyFor(locale)
  if (!key) return undefined
  return resolved.get(key) ?? undefined
}

/** Load the date-fns locale for `locale`. Idempotent, and never rejects. */
export async function loadDateFnsLocale(locale: string): Promise<Locale | undefined> {
  const key = keyFor(locale)
  if (!key) return undefined
  if (resolved.has(key)) return resolved.get(key) ?? undefined

  let pending = inFlight.get(key)
  if (!pending) {
    pending = LOADERS[key]()
      .then((module) => {
        // A date-fns locale module's named export is the CAMEL-CASED code
        // (`enUS`, `ptBR`, `zhCN`), which is not the file name — so it cannot be
        // derived from the registry key. Picking the export that carries
        // `formatLong` finds it without a second name table to keep in step.
        const found = Object.values(module).find(
          (value): value is Locale =>
            typeof value === 'object' && value !== null && 'formatLong' in value,
        )
        resolved.set(key, found ?? null)
      })
      .catch((err) => {
        console.warn('[i18n] could not load date-fns locale', key, err)
        resolved.set(key, null)
      })
      .finally(() => {
        inFlight.delete(key)
        version++
        for (const listener of listeners) listener()
      })
    inFlight.set(key, pending)
  }
  await pending
  return resolved.get(key) ?? undefined
}

/**
 * The date-fns locale for the current formatting locale, `undefined` until it
 * has loaded (and for a locale outside the registry).
 *
 * Deliberately not a Suspense boundary or a loading state: a calendar rendered
 * for the few milliseconds before the chunk lands shows English month names and
 * then switches, which is strictly better than showing nothing. The component
 * re-renders on both axes — `useFormattingLocale()` for a locale change, the
 * version store for the load.
 */
export function useDateFnsLocale(): Locale | undefined {
  const formatting = useFormattingLocale()
  useSyncExternalStore(subscribe, getVersion, getVersion)

  useEffect(() => {
    void loadDateFnsLocale(formatting)
  }, [formatting])

  return peekDateFnsLocale(formatting)
}
