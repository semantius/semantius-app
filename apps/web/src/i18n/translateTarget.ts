/**
 * The translate target: where translations are read from and written to.
 *
 * One contract, several targets. The client is identical everywhere; only the
 * base url and the MODE differ (`i18n-endpoint-spec.md`):
 *
 *   GET  {base}/translations?locale=de-DE   -> { "<key>": "<translation>", … }
 *   POST {base}/translations                { locale, key, translation }
 *
 * The mode says what a write means and whether the app discovers:
 *
 *   dev     the Vite dev server writes this checkout's language file; discovers
 *   stage   a stage host holds a copy of that file; discovers
 *   prod    the app's own API keeps a record per language; never discovers
 *   off     nothing — the default
 *
 * The mode is configuration (`VITE_TRANSLATE_MODE`); unset, it is `dev` under
 * Vite's dev server and `off` in every build (`defaultTranslateMode`), so a
 * local app translates with nothing configured and can still be pointed at a
 * stage target, while a deployment does nothing until an operator says so. It
 * is PUSHED in once, by `lib/config.ts`, the way every other piece of
 * configuration reaches this directory — nothing here reads the environment,
 * because the first boot pass runs before `initConfig()`, which throws at that
 * moment.
 *
 * A base of `''` means "the app's own API, relatively": `/translations` is a
 * relative url, which the fetch interceptor in `lib/apiClient.ts` rewrites onto
 * the API base with the bearer token — the same way every other API call
 * reaches the tenant. That is what the `prod` default uses, and why nothing
 * here holds a token.
 */

import type { TranslationMap } from './catalog'

export type TranslateMode = 'dev' | 'stage' | 'prod' | 'off'

export const TRANSLATE_MODES: readonly TranslateMode[] = ['dev', 'stage', 'prod', 'off']

export interface TranslateTarget {
  /** The base url, without a trailing slash; `''` for the app's own API. */
  url: string
  mode: TranslateMode
}

/** One message, as the write takes it. Nothing else. */
export interface TranslationMessage {
  locale: string
  key: string
  translation: string
}

const TRANSLATIONS_PATH = '/translations'

/**
 * PostgREST's own "this relation does not exist" codes — the definitive
 * answer that a deployment has no record store. A 404 alone proves nothing:
 * a serverless backend answers a bare one after an idle period, and the fetch
 * interceptor retries exactly that.
 */
const ABSENT_CODES = new Set(['42P01', 'PGRST205', 'PGRST202'])

let target: TranslateTarget = { url: '', mode: 'off' }

/**
 * Whether the target answered at all: `undefined` until the first read,
 * `true` after a record came back, `false` after a definitive "no such
 * table". Read by `canTranslate` — translate mode is not offered in `prod`
 * where the record store does not exist, because an editor that cannot save
 * is worse than no editor.
 */
let available: boolean | undefined

/** The two variables `lib/config.ts` reads the target from. Named here so the diagnostics can quote them. */
export const TRANSLATE_MODE_VAR = 'VITE_TRANSLATE_MODE'
export const TRANSLATE_URL_VAR = 'VITE_TRANSLATE_API_URL'

/** Read a mode out of configuration. `''` is `off`; anything else unknown is refused. */
export function parseTranslateMode(raw: string | undefined): TranslateMode | undefined {
  const value = (raw ?? '').trim()
  if (!value) return 'off'
  return (TRANSLATE_MODES as readonly string[]).includes(value) ? (value as TranslateMode) : undefined
}

/**
 * The mode when none is configured: `dev` under Vite's dev server — every
 * `pnpm dev*` script, whatever `--mode` it passes — and `off` in every build.
 * `pnpm dev` translates and discovers with nothing set; a deployment does
 * nothing until an operator says otherwise.
 */
export function defaultTranslateMode(devServer: boolean): TranslateMode {
  return devServer ? 'dev' : 'off'
}

/**
 * The target, from the two raw variables — or the operator diagnostic that
 * blocks boot when they do not add up. Pure, so `lib/config.ts` does the env
 * reading and calls in; the strings here are machine reports quoting the
 * variable names, which is why they stay English.
 *
 * `dev` with no url means the app's own origin, where the dev server answers;
 * `prod` with no url means the app's own API (a relative base, see the
 * header); `stage` has no sensible default and must say where the stage host is.
 * An unset or blank mode is `fallback` — `defaultTranslateMode()` in the app.
 */
export function resolveTranslateTarget(
  rawMode: string | undefined,
  rawUrl: string | undefined,
  origin: string | undefined,
  fallback: TranslateMode = 'off',
): { target: TranslateTarget } | { error: string } {
  const mode = (rawMode ?? '').trim() ? parseTranslateMode(rawMode) : fallback
  if (!mode) {
    return { error: `Invalid ${TRANSLATE_MODE_VAR}: "${rawMode}". Valid values are: ${TRANSLATE_MODES.join(', ')}.` }
  }
  const url = (rawUrl ?? '').trim().replace(/\/+$/, '')
  if (mode === 'stage' && !url) {
    return { error: `${TRANSLATE_MODE_VAR}=stage needs ${TRANSLATE_URL_VAR}: the host that holds the language files.` }
  }
  if (mode === 'dev' && !url && !origin) {
    return { error: `${TRANSLATE_MODE_VAR}=dev needs ${TRANSLATE_URL_VAR} where there is no page origin to default to.` }
  }
  return { target: { url: url || (mode === 'dev' ? origin! : ''), mode } }
}

export function setTranslateTarget(next: TranslateTarget): void {
  target = { url: next.url.replace(/\/+$/, ''), mode: next.mode }
  available = undefined
}

export function translateTarget(): TranslateTarget {
  return target
}

/** Whether the running app records what it cannot translate — `dev` and `stage`. */
export function discoveryEnabled(): boolean {
  return target.mode === 'dev' || target.mode === 'stage'
}

export function targetAvailable(): boolean | undefined {
  return available
}

/** For a test, or a component that learned the answer another way. */
export function setTargetAvailable(value: boolean | undefined): void {
  available = value
}

/** The url of the endpoint, for `locale` when reading. */
export function translationsUrl(locale?: string): string {
  const base = `${target.url}${TRANSLATIONS_PATH}`
  return locale ? `${base}?locale=${encodeURIComponent(locale)}` : base
}

/**
 * The record for `locale`, or `null` when the target has none — or has no
 * target at all. Never throws: a language must always end up active, and a
 * record store that is asleep or absent is a warning, not a boot failure.
 */
export async function readTranslations(locale: string): Promise<TranslationMap | null> {
  if (target.mode === 'off') return null
  const url = translationsUrl(locale)
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    console.warn(`[i18n] the translate target could not be reached for ${locale}`, err)
    return null
  }
  if (!response.ok) {
    if (response.status === 404 && (await isDefinitivelyAbsent(response))) available = false
    else console.warn(`[i18n] the translate target answered ${response.status} for ${locale} (${url})`)
    return null
  }
  // A web server with a SPA fallback answers a route it does not know with the
  // app's own HTML and a 200 — `ok` alone would hand `json()` a page of markup.
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    console.warn(`[i18n] the translate target did not answer JSON for ${locale} (${url})`)
    return null
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (err) {
    console.warn(`[i18n] the translate target's record for ${locale} is not valid JSON`, err)
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  available = true
  const out: TranslationMap = {}
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

async function isDefinitivelyAbsent(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.clone().json()
    const code = body && typeof body === 'object' ? (body as Record<string, unknown>).code : undefined
    return typeof code === 'string' && ABSENT_CODES.has(code)
  } catch {
    return false
  }
}

/**
 * Write one message. The server owns the merge into the per-language record;
 * an empty translation clears the message and the source text shows through
 * again. Throws with the server's own message when it refuses.
 */
export async function writeTranslation(message: TranslationMessage, options: { keepalive?: boolean } = {}): Promise<void> {
  if (target.mode === 'off') throw new Error('No translate target is configured')
  const response = await fetch(translationsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(message),
    keepalive: options.keepalive,
  })
  if (response.ok) return
  let detail = `${response.status}`
  try {
    const body: unknown = await response.json()
    const text = body && typeof body === 'object' ? (body as Record<string, unknown>).message : undefined
    if (typeof text === 'string' && text) detail = text
  } catch {
    // No body worth quoting.
  }
  throw new Error(`The translate target refused the write: ${detail}`)
}
