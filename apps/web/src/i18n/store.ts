/**
 * Where a language comes from: two sources, merged per key.
 *
 *   the file      the complete language for this product version, served as a
 *                 static file so an operator can replace it without a rebuild
 *                 — `i18n/<code>.json` in this repo, the same path
 *                 under nginx in the Docker image, or the url an operator
 *                 registered in `VITE_UI_CUSTOMIZER`
 *   the record    the translate target's per-language record: overrides and
 *                 customer-added text in `prod`, the target's own copy of the
 *                 file in `dev` and `stage` — where that copy IS the language,
 *                 so the file is not read at all
 *
 * The record wins per key. An override survives a product update because it
 * is not in the file we ship.
 *
 * Nothing here imports `lib/config`. Configuration is PUSHED in
 * (`setDeploymentLocales`, `setTranslateTarget`) rather than pulled, because
 * the first boot pass activates a locale BEFORE `initConfig()` runs so that
 * `BootFailure` is translated — a pull would have to call `getConfig()`, which
 * throws at that moment.
 */

import { defaultLocaleUrl, EMPTY_LOCALE_CONFIG, type LocaleConfig } from './localeConfig'
import { SOURCE_LANGUAGE, type LocaleFile, type TranslationMap } from './catalog'
import { readTranslations, translateTarget } from './translateTarget'

export interface LocaleLayer {
  /** Named for diagnostics — a failing layer says which one it was. */
  readonly name: string
  load(language: string): Promise<LocaleFile | null>
}

/** A switchable language, as the account menu lists it. */
export interface LocaleInfo {
  code: string
  /** The language's own name for itself. */
  name: string
}

/**
 * The languages this build ships a file for, read off `i18n/` at
 * build time by `vite.config.ts` and inlined. The files themselves are never
 * bundled: only the active language is ever fetched, at boot, like any other
 * static file — a deployment with ten languages ships ten files, not ten
 * chunks in every browser.
 */
function shippedLanguages(): readonly string[] {
  return typeof __SHIPPED_LOCALES__ === 'undefined' ? [] : __SHIPPED_LOCALES__
}

// ── The file ────────────────────────────────────────────────────────────────

let deploymentLocales: LocaleConfig = EMPTY_LOCALE_CONFIG

/** Fetched files, so a language switched back and forth is fetched once. */
const files = new Map<string, LocaleFile | null>()

/**
 * Register what the operator configured. Called by `applyUiCustomizer()` in
 * lib/config.ts, once, before main.tsx's second `activateLocale()` pass.
 */
export function setDeploymentLocales(config: LocaleConfig): void {
  deploymentLocales = config
  files.clear()
  // Name the languages up front: the switcher has to list a language before its
  // file has ever been fetched, and `Intl.DisplayNames` knows nothing about a
  // tag an operator invented.
  for (const entry of config.available) {
    if (entry.name) configuredNames.set(entry.code, entry.name)
  }
}

/** The operator's default language, for the locale resolution. */
export function operatorDefaultLanguage(): string | undefined {
  return deploymentLocales.default
}

function fileUrlFor(language: string): string | undefined {
  const registered = deploymentLocales.available.find((entry) => entry.code === language)
  if (registered) return registered.url || defaultLocaleUrl(language)
  return shippedLanguages().includes(language) ? defaultLocaleUrl(language) : undefined
}

/**
 * Fetch one static file.
 *
 * ABSOLUTE url on purpose. `lib/apiClient.ts` intercepts every `fetch` whose url
 * starts with "/" and rewrites it onto the PostgREST base with a bearer token —
 * so a relative `/locales/fr-FR.json` would be asked of the API rather than of
 * the web server. Resolving against the origin first is what keeps a static file
 * a static file.
 *
 * The content-type check is not belt-and-braces either: the SPA fallback
 * (`try_files $uri /index.html`, and the equivalent on Workers) answers a
 * MISSING file with the app's own HTML and a 200, so `res.ok` alone would hand
 * `res.json()` a page of markup. A wrong `url` must read as "no such language",
 * not as a parse error at boot.
 */
async function fetchStaticFile(language: string, path: string): Promise<LocaleFile | null> {
  if (typeof window === 'undefined') return null
  const url = new URL(path, window.location.origin).toString()
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[i18n] locale file for ${language} answered ${res.status} (${url})`)
      return null
    }
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      console.warn(`[i18n] locale file for ${language} is not JSON — is ${url} really there?`)
      return null
    }
    const body: unknown = await res.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    const file = body as LocaleFile
    return { ...file, locale: language }
  } catch (err) {
    console.warn(`[i18n] locale file for ${language} could not be fetched`, err)
    return null
  }
}

const fileLayer: LocaleLayer = {
  name: 'file',
  async load(language) {
    // The source language's catalog is the English in the code and the model;
    // its file is the INDEX, and loading that as a catalog would render a
    // recorded source in place of a model label that has since been reworded.
    if (language === SOURCE_LANGUAGE) return null
    const { mode } = translateTarget()
    // In dev and stage the target's file IS the language: the GET is the whole read.
    if (mode === 'dev' || mode === 'stage') return null
    const path = fileUrlFor(language)
    if (!path) return null
    if (files.has(language)) return files.get(language) ?? null
    const file = await fetchStaticFile(language, path)
    // Cached even on failure: a deployment whose file is missing must not refetch
    // it on every language switch. `setDeploymentLocales` clears the cache.
    files.set(language, file)
    return file
  },
}

// ── The record ──────────────────────────────────────────────────────────────

const recordLayer: LocaleLayer = {
  name: 'target',
  async load(language) {
    const { mode } = translateTarget()
    if (mode === 'off') return null
    // The source language's record exists only in prod (a tenant's own
    // wording, "Customer" -> "Patient"); everywhere else its record is the index.
    if (language === SOURCE_LANGUAGE && mode !== 'prod') return null
    const messages = await readTranslations(language)
    return messages ? { locale: language, messages } : null
  },
}

/**
 * The layer list, in precedence order (later wins). Exported so a test can see
 * the order.
 */
export const localeLayers: LocaleLayer[] = [fileLayer, recordLayer]

/**
 * Load every layer for `language`, in order.
 *
 * A layer that FAILS is logged and skipped rather than rejected: a record store
 * that is asleep or a file that 404s must not leave the app with no active
 * locale at all, which under the boot overlay is a hang rather than an error.
 */
export async function loadLocaleFiles(language: string): Promise<LocaleFile[]> {
  const out: LocaleFile[] = []
  for (const layer of localeLayers) {
    try {
      const file = await layer.load(language)
      if (file) out.push(file)
    } catch (err) {
      console.warn(`[i18n] locale layer "${layer.name}" failed for ${language}`, err)
    }
  }
  return out
}

// ── The index ───────────────────────────────────────────────────────────────
//
// `en-US.json` is the complete baseline: every key the app has rendered, with
// its SOURCE text — a code string's own English, a model label as the model
// spells it. Discovery writes it and the translate-mode panel reads it; it is
// never loaded as the source language's catalog (see fileLayer).

let sourceIndex: Map<string, string> | undefined
let sourceIndexLoading: Promise<ReadonlyMap<string, string>> | undefined
let sourceIndexVersionCounter = 0
const indexListeners = new Set<() => void>()

/**
 * The index, from the target in `dev` and `stage` (where the target's copy is
 * the one discovery writes) and from the shipped file otherwise. Empty rather
 * than failed when nothing answers. Cached; `refresh` re-reads.
 */
export function loadSourceIndex(refresh = false): Promise<ReadonlyMap<string, string>> {
  if (sourceIndex && !refresh) return Promise.resolve(sourceIndex)
  if (sourceIndexLoading && !refresh) return sourceIndexLoading
  sourceIndexLoading = (async () => {
    const { mode } = translateTarget()
    let messages: TranslationMap | null = null
    if (mode === 'dev' || mode === 'stage') {
      messages = await readTranslations(SOURCE_LANGUAGE)
    } else {
      const file = await fetchStaticFile(SOURCE_LANGUAGE, defaultLocaleUrl(SOURCE_LANGUAGE))
      messages = file?.messages ?? null
    }
    sourceIndex = new Map(Object.entries(messages ?? {}))
    sourceIndexVersionCounter++
    for (const listener of indexListeners) listener()
    return sourceIndex
  })()
  return sourceIndexLoading
}

/** The index as last loaded, or `undefined` before the first load. */
export function sourceIndexSnapshot(): ReadonlyMap<string, string> | undefined {
  return sourceIndex
}

/** Record an entry discovery just wrote, so the panel and the count follow without a refetch. */
export function addSourceIndexEntry(id: string, source: string): void {
  sourceIndex ??= new Map()
  sourceIndex.set(id, source)
  sourceIndexVersionCounter++
  for (const listener of indexListeners) listener()
}

export function subscribeToSourceIndex(listener: () => void): () => void {
  indexListeners.add(listener)
  return () => indexListeners.delete(listener)
}

export function sourceIndexVersion(): number {
  return sourceIndexVersionCounter
}

/** Forget the loaded index — for a test that changes the target. */
export function resetSourceIndex(): void {
  sourceIndex = undefined
  sourceIndexLoading = undefined
}

// ── Names and availability ──────────────────────────────────────────────────

/** Names learned from a loaded file, so a catalog can name its own language. */
const configuredNames = new Map<string, string>()

/** Record `name` from a file the moment it is loaded. Called by `activateLocale`. */
export function rememberLocaleNames(loaded: readonly LocaleFile[]): void {
  for (const file of loaded) {
    if (file.name) configuredNames.set(file.locale, file.name)
  }
}

/**
 * Every language that has a file: shipped with this build or registered by the
 * operator. The source language is always first and always present — its
 * "catalog" is the English in the code. A language that lives only in a
 * target's record has to be registered to be listed; the contract has no
 * call that enumerates records.
 */
export function availableLanguages(): readonly string[] {
  const codes = new Set<string>([SOURCE_LANGUAGE])
  for (const code of shippedLanguages()) codes.add(code)
  for (const entry of deploymentLocales.available) codes.add(entry.code)
  // Sorted, minus the source language which is pinned to the front, so the
  // account menu's order does not depend on which layer answered first.
  return [SOURCE_LANGUAGE, ...[...codes].filter((code) => code !== SOURCE_LANGUAGE).sort()]
}

/**
 * The endonym for a language tag — the language named in its own language.
 *
 * `Intl.DisplayNames.of('de-DE')` is "Deutsch (Deutschland)": it spells out the
 * REGION, which in a menu of languages is noise, and says something the catalog
 * does not mean — `de-DE` is the catalog's name, not a promise that the German
 * in it is German-of-Germany. So the name comes from the language subtag, and
 * the region is added back only when two available languages share a subtag
 * (`pt-BR` vs `pt-PT`), where it is the only thing telling them apart.
 *
 * A `name` in the file always wins — that is how an operator names a language
 * the browser has no display name for.
 */
export function languageDisplayName(code: string, available: readonly string[] = availableLanguages()): string {
  const configured = configuredNames.get(code)
  if (configured) return configured
  const subtag = code.split('-')[0]
  const shared = available.some((other) => other !== code && other.split('-')[0] === subtag)
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(shared ? code : subtag) ?? code
  } catch {
    return code
  }
}

/** The switchable languages, named. */
export function availableLocales(): LocaleInfo[] {
  const codes = availableLanguages()
  return codes.map((code) => ({ code, name: languageDisplayName(code, codes) }))
}
