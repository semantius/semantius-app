/**
 * Where translations come from, as an ordered list of layers.
 *
 * A layer answers "here is the locale file for this language, or nothing". The
 * later a layer sits in the list, the more it wins: the repo catalog is the
 * floor every deployment gets, an operator's file overrides it, the tenant's
 * rows override that, and a translator's unsaved drafts override everything
 * while they are being written.
 *
 *   repo catalog  <-  deployment file (P4)  <-  tenant rows (P4)  <-  drafts (P5)
 *
 * Only the repo layer exists today. The shape is the point: adding a layer must
 * not mean rewriting `activateLocale`, and every layer already speaks the one
 * `LocaleFile` shape from ./catalog.ts.
 */

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

/**
 * The layer list, in precedence order (later wins). Exported so P4 can append
 * the deployment-file and tenant layers without this module knowing about them.
 */
export const localeLayers: LocaleLayer[] = [repoLayer]

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

/** Every language that has a catalog, source language included. */
export function availableLanguages(): readonly string[] {
  return [SOURCE_LANGUAGE, ...repoLanguages.filter((code) => code !== SOURCE_LANGUAGE)]
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
