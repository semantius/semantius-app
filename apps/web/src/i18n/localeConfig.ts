/**
 * The operator's language registration — the pure half of the deployment-file
 * locale layer.
 *
 * A self-hosted operator adds a language WITHOUT a rebuild by dropping a
 * `<code>.json` catalog next to the deployed app and naming it in the existing
 * `VITE_UI_CUSTOMIZER` JSON:
 *
 *   {"user":{"menu":[…]},
 *    "locales":{"default":"de-DE",
 *               "available":[{"code":"fr-FR","name":"Français","url":"/locales/fr-FR.json"}]}}
 *
 * `url` is optional and defaults to `/locales/<code>.json`, which is what
 * `i18n/` ships as and what the nginx image serves from
 * `/usr/share/nginx/html/locales/` (an operator mounts a volume there).
 *
 * No new `VITE_*` variable: the customizer already exists, is already a
 * documented single-line JSON string in `docker/.env`, and is already parsed at
 * boot. See lib/userMenu.ts `parseUiCustomizer`, which does the parsing for both.
 *
 * Like userMenu.ts this reads no `window` and no `import.meta.env`, so it is
 * unit-testable; lib/config.ts does the env reading and calls in. Its error
 * strings stay English on purpose: they are machine reports for the operator who
 * wrote the `.env`, quoting the JSON keys verbatim (see CONTEXT-MEMORY, "A boot
 * diagnostic is not language").
 *
 * It lives under `src/i18n/` rather than beside `lib/userMenu.ts` for that last
 * reason: the lingui rule exempts the top-level modules of this directory
 * precisely because every string in them is a locale tag, a JSON key or an
 * operator diagnostic — which is all this file holds — and it is i18n machinery
 * either way.
 */

/** One language an operator has registered, with its file resolved. */
export interface DeploymentLocale {
  /** BCP-47 language tag — the catalog language, e.g. `fr-FR`. */
  code: string
  /** The language's own name for itself. Wins over `Intl.DisplayNames`. */
  name?: string
  /** Where to fetch the catalog. Defaults to `/locales/<code>.json`. */
  url: string
}

export interface LocaleConfig {
  /**
   * The language a browser with no saved preference gets. It sits BELOW the
   * user's own choice and above the browser's `Accept-Language`, so an operator
   * can standardize a deployment without overriding anyone who has chosen.
   */
  default?: string
  available: DeploymentLocale[]
}

/** What an unconfigured deployment gets: no default, no extra languages. */
export const EMPTY_LOCALE_CONFIG: LocaleConfig = { default: undefined, available: [] }

/**
 * Read the `locales` section of an already-parsed customizer.
 *
 * Returns `{ error }` rather than throwing, so config.ts turns a bad
 * registration into the same blocking boot screen a broken menu produces. A
 * language silently dropped here would be far worse than a loud boot failure:
 * the switcher would simply not list it, with nothing anywhere saying why.
 */
export function resolveLocales(
  customizer: Record<string, unknown> | null,
): { locales: LocaleConfig } | { error: string } {
  const raw = customizer?.locales
  if (raw === undefined || raw === null) return { locales: EMPTY_LOCALE_CONFIG }
  if (!isPlainObject(raw)) {
    return {
      error:
        'VITE_UI_CUSTOMIZER "locales" must be an object of the shape ' +
        '{"default":"de-DE","available":[{"code":"fr-FR","url":"/locales/fr-FR.json"}]}.',
    }
  }

  let defaultLanguage: string | undefined
  if (raw.default !== undefined && raw.default !== null) {
    if (!isNonEmptyString(raw.default)) {
      return { error: 'VITE_UI_CUSTOMIZER "locales.default" must be a non-empty language tag when present.' }
    }
    defaultLanguage = raw.default.trim()
  }

  const available: DeploymentLocale[] = []
  if (raw.available !== undefined && raw.available !== null) {
    if (!Array.isArray(raw.available)) {
      return { error: 'VITE_UI_CUSTOMIZER "locales.available" must be an array when present.' }
    }
    for (let i = 0; i < raw.available.length; i++) {
      const entry = raw.available[i]
      const problem = entryProblem(entry)
      if (problem) {
        return { error: `VITE_UI_CUSTOMIZER "locales.available" entry ${i} is invalid: ${problem}` }
      }
      const code = (entry as Record<string, unknown>).code as string
      const trimmed = code.trim()
      // A repeated code is a mistake with a silent consequence — the second
      // registration would simply never be reached — so it is reported.
      if (available.some((other) => other.code === trimmed)) {
        return {
          error: `VITE_UI_CUSTOMIZER "locales.available" entry ${i} repeats the code "${trimmed}".`,
        }
      }
      const name = (entry as Record<string, unknown>).name
      const url = (entry as Record<string, unknown>).url
      available.push({
        code: trimmed,
        name: isNonEmptyString(name) ? name.trim() : undefined,
        url: isNonEmptyString(url) ? url.trim() : defaultLocaleUrl(trimmed),
      })
    }
  }

  return { locales: { default: defaultLanguage, available } }
}

/** Where a registration with no explicit `url` looks for its catalog. */
export function defaultLocaleUrl(code: string): string {
  return `/locales/${encodeURIComponent(code)}.json`
}

/** Describe what is wrong with one registration, or null when it is valid. */
function entryProblem(entry: unknown): string | null {
  if (!isPlainObject(entry)) return 'expected an object with a "code".'
  if (!isNonEmptyString(entry.code)) return '"code" must be a non-empty language tag.'
  if (entry.name !== undefined && !isNonEmptyString(entry.name)) {
    return '"name" must be a non-empty string when present.'
  }
  if (entry.url !== undefined && !isNonEmptyString(entry.url)) {
    return '"url" must be a non-empty string when present.'
  }
  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
