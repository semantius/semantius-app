/**
 * Where translations come from, as an ordered list of layers.
 *
 * A layer answers "here is the locale file for this language, or nothing". The
 * later a layer sits in the list, the more it wins: the repo catalog is the
 * floor every deployment gets, an operator's file overrides it, the tenant's
 * rows override that, and a translator's unsaved drafts override everything
 * while they are being written.
 *
 *   repo catalog  <-  deployment file  <-  tenant rows  <-  drafts (translate mode)
 *
 * The shape is the point: adding a layer must not mean rewriting
 * `activateLocale`, and every layer speaks the one `LocaleFile` shape from
 * ./catalog.ts.
 *
 * Nothing here imports `lib/config`. Configuration is PUSHED in
 * (`setDeploymentLocales`, `setTenantLocaleFiles`) rather than pulled, because
 * the first boot pass activates a locale BEFORE `initConfig()` runs so that
 * `BootFailure` is translated — a pull would have to call `getConfig()`, which
 * throws at that moment.
 */

import { defaultLocaleUrl, EMPTY_LOCALE_CONFIG, type LocaleConfig } from './localeConfig'
import { SOURCE_LANGUAGE, type LocaleFile } from './catalog'

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
 * The repo catalogs, lazily.
 *
 * `en-US.json` is excluded because it is NOT a catalog: it is the generated
 * index of every extracted message (its own shape, `{ locale, index }`), read by
 * agents and by translate mode. The source language's "translations" are the
 * English strings in the code. `glossary.json` is excluded for the same kind of
 * reason — it is the fixed-term list the catalog test checks against, not a
 * locale.
 *
 * Lazy on purpose: a deployment with ten languages must not ship ten catalogs to
 * every browser. The glob keys are still known at build time, which is what
 * `availableLanguages()` reads without loading anything.
 */
const repoCatalogs = import.meta.glob<LocaleFile>(
  ['../locales/*.json', '!../locales/en-US.json', '!../locales/glossary.json'],
  { import: 'default' },
)

/** `'../locales/de-DE.json'` -> `'de-DE'`. */
function codeOfPath(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')
}

const repoLanguages: readonly string[] = Object.keys(repoCatalogs).map(codeOfPath).sort()

const repoLayer: LocaleLayer = {
  name: 'repo',
  async load(language) {
    const path = Object.keys(repoCatalogs).find((p) => codeOfPath(p) === language)
    if (!path) return null
    return await repoCatalogs[path]()
  },
}

// ── The operator's deployment files ─────────────────────────────────────────
//
// Registered in VITE_UI_CUSTOMIZER's `locales` section (./localeConfig.ts) and
// served as static files next to the app: `public/locales/` in this repo's own
// builds, `/usr/share/nginx/html/locales/` in the Docker image, where an
// operator mounts a volume. Adding a language is a file plus one line of
// configuration — no rebuild.

let deploymentLocales: LocaleConfig = EMPTY_LOCALE_CONFIG

/** Fetched files, so a language switched back and forth is fetched once. */
const deploymentFiles = new Map<string, LocaleFile | null>()

/**
 * Register what the operator configured. Called by `applyUiCustomizer()` in
 * lib/config.ts, once, before main.tsx's second `activateLocale()` pass.
 */
export function setDeploymentLocales(config: LocaleConfig): void {
  deploymentLocales = config
  deploymentFiles.clear()
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

/**
 * Fetch one registered file.
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
async function loadDeploymentFile(language: string): Promise<LocaleFile | null> {
  const entry = deploymentLocales.available.find((candidate) => candidate.code === language)
  if (!entry) return null
  if (deploymentFiles.has(language)) return deploymentFiles.get(language) ?? null

  let file: LocaleFile | null = null
  try {
    const url = new URL(entry.url || defaultLocaleUrl(language), window.location.origin).toString()
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[i18n] locale file for ${language} answered ${res.status} (${url})`)
    } else if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      console.warn(`[i18n] locale file for ${language} is not JSON — is ${url} really there?`)
    } else {
      file = (await res.json()) as LocaleFile
    }
  } catch (err) {
    console.warn(`[i18n] locale file for ${language} could not be fetched`, err)
  }
  // Cached even on failure: a deployment whose file is missing must not refetch
  // it on every language switch. `setDeploymentLocales` clears the cache.
  deploymentFiles.set(language, file)
  return file
}

const deploymentLayer: LocaleLayer = {
  name: 'deployment',
  load: loadDeploymentFile,
}

// ── The tenant's rows ───────────────────────────────────────────────────────
//
// Pushed in by `TranslationsPrefetch` (components/TranslationsPrefetch.tsx),
// which reads the `ui_translations` table through the generic `useTable` hook.
// The layer holds the ALREADY-GROUPED files rather than fetching: this module
// is not a React component and must not own a query.

let tenantFiles: ReadonlyMap<string, LocaleFile> = new Map()

/**
 * Whether the tenant HAS the table — decided by the prefetch from a definitive
 * body, never by a status. Unknown until the first read answers, and unknown
 * reads as "no": a save made before the answer is a draft, which is the
 * outcome that loses nothing.
 */
let tenantTableState: boolean | undefined

/** Replace the tenant layer. Called whenever the rows query resolves. */
export function setTenantLocaleFiles(files: ReadonlyMap<string, LocaleFile>): void {
  tenantFiles = files
  for (const file of files.values()) {
    if (file.name) configuredNames.set(file.locale, file.name)
  }
}

/** Record what the prefetch learned about the table. */
export function setTenantTableAvailable(available: boolean | undefined): void {
  tenantTableState = available
}

/** Whether a translate-mode save may become a row at all. */
export function tenantTableAvailable(): boolean {
  return tenantTableState === true
}

/** The tenant's file for `language`, for callers that need it without loading. */
export function tenantLocaleFile(language: string): LocaleFile | undefined {
  return tenantFiles.get(language)
}

const tenantLayer: LocaleLayer = {
  name: 'tenant',
  load(language) {
    return Promise.resolve(tenantFiles.get(language) ?? null)
  },
}

/**
 * The layer list, in precedence order (later wins). Exported so a test can see
 * the order, and so a future platform-side channel is one more entry.
 *
 * There is no drafts layer. Translate mode writes to the ONE endpoint its
 * target provides (`./translateTarget.ts`) and is not offered where there is
 * none, so an edit is never kept in a browser waiting to be exported.
 */
export const localeLayers: LocaleLayer[] = [repoLayer, deploymentLayer, tenantLayer]

/**
 * Load every layer for `language`, in order.
 *
 * A layer that FAILS is logged and skipped rather than rejected: a tenant that
 * is asleep or an operator file that 404s must not leave the app with no active
 * locale at all, which under the boot overlay is a hang rather than an error.
 */
export async function loadLocaleFiles(language: string): Promise<LocaleFile[]> {
  const files: LocaleFile[] = []
  for (const layer of localeLayers) {
    try {
      const file = await layer.load(language)
      if (file) files.push(file)
    } catch (err) {
      console.warn(`[i18n] locale layer "${layer.name}" failed for ${language}`, err)
    }
  }
  return files
}

/** Names learned from a loaded file, so a catalog can name its own language. */
const configuredNames = new Map<string, string>()

/** Record `name` from a file the moment it is loaded. Called by `activateLocale`. */
export function rememberLocaleNames(files: readonly LocaleFile[]): void {
  for (const file of files) {
    if (file.name) configuredNames.set(file.locale, file.name)
  }
}

/**
 * Every language that has a catalog anywhere: shipped, deployed or in the
 * tenant's rows. The source language is always first and always present — its
 * "catalog" is the English in the code.
 */
export function availableLanguages(): readonly string[] {
  const codes = new Set<string>([SOURCE_LANGUAGE])
  for (const code of repoLanguages) codes.add(code)
  for (const entry of deploymentLocales.available) codes.add(entry.code)
  for (const code of tenantFiles.keys()) codes.add(code)
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
 * A `name` in the catalog file always wins — that is how an operator or a tenant
 * names a language the browser has no display name for.
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
