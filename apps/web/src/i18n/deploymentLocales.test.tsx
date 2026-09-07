import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fixture from '@/test/fixtures/locales/fr-FR.json?raw'
import { clearRuntimeEnv, setRuntimeEnv } from '@/test/runtimeConfig'
import { getConfig, getConfigError, initConfig } from '@/lib/config'
import type { EntityMetadata } from '@/types/metadata'
import {
  SOURCE_LANGUAGE,
  activateLocale,
  availableLocales,
  currentDynamic,
  currentLabels,
  enumLabel,
  languageDisplayName,
  localizeMetadata,
  resolveInitialLocale,
  setDeploymentLocales,
  translate,
  translateDynamic,
} from '@/i18n'

/**
 * An operator adds a language WITHOUT a rebuild: a JSON file served next to the
 * app, named in `VITE_UI_CUSTOMIZER`. This is that path, end to end — the
 * customizer really parsed by `initConfig()`, the file really fetched over HTTP,
 * the result really activated.
 *
 * THE URL IS A BLOB, and that is not a stub. The layer needs a real URL that
 * really answers `application/json`; Vite's dev server transforms a `.json`
 * under `src/` into an ES module (`content-type: text/javascript`), so serving
 * the fixture from there would exercise the failure path rather than the happy
 * one. The blob is built from the fixture FILE's own bytes — a real file, in the
 * repo, checked against `public/locales/schema.json` by the node suite — and the
 * browser fetches it through the same code and the same headers a static file
 * would take. The one thing it cannot cover, a web server actually serving
 * `/locales/fr-FR.json`, is covered by the deployed preview.
 */

const FIXTURE_LANGUAGE = 'fr-FR'

/** Every test registers its own URL; each is revoked afterwards. */
let objectUrls: string[] = []

function serveJson(body: string): string {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  objectUrls.push(url)
  return url
}

function customizer(locales: unknown): string {
  return JSON.stringify({ locales })
}

/** A minimal entity, the shape the table route hands to the grid. */
function customersMetadata(): EntityMetadata {
  return {
    table: {
      table_name: 'customers',
      singular: 'customer',
      plural: 'customers',
      singular_label: 'Customer',
      plural_label: 'Customers',
      id_column: 'id',
      label_column: 'company_name',
    },
    properties: {
      status: { type: 'string', title: 'Status', enum: ['active', 'inactive'] },
    },
  }
}

beforeEach(() => {
  clearRuntimeEnv()
})

afterEach(async () => {
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls = []
  clearRuntimeEnv()
  // The store holds what the last `initConfig()` registered, and it outlives a
  // test the way every module singleton here does.
  setDeploymentLocales({ default: undefined, available: [] })
  await activateLocale({ language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE })
})

describe('a language an operator registered', () => {
  it('becomes switchable, named by the file it declares', async () => {
    setRuntimeEnv({
      VITE_UI_CUSTOMIZER: customizer({
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()
    expect(getConfigError()).toBeNull()

    expect(getConfig().locales.available.map((entry) => entry.code)).toEqual([FIXTURE_LANGUAGE])
    expect(availableLocales().map((entry) => entry.code)).toContain(FIXTURE_LANGUAGE)

    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    // The file's own `name` wins over Intl.DisplayNames — that is how a tag the
    // browser has no display name for still reads as a language in the menu.
    expect(languageDisplayName(FIXTURE_LANGUAGE)).toBe('Français')
  })

  it('translates code strings, contexts, model labels and server text from the one file', async () => {
    setRuntimeEnv({
      VITE_UI_CUSTOMIZER: customizer({
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()
    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    // messages
    expect(translate('Language')).toBe('Langue')
    // contexts — the same word with two meanings is two entries
    expect(translate({ message: 'View', context: 'column visibility' })).toBe('Affichage')
    // labels: a table label, a column title and an enum value
    const localized = localizeMetadata(customersMetadata(), currentLabels())
    expect(localized.table?.plural_label).toBe('Clients')
    expect(localized.properties?.status.title).toBe('État')
    expect(enumLabel(localized.properties?.status, 'active')).toBe('Actif')
    // ...and the stored value is untouched, because it is what the database holds
    expect(enumLabel(localized.properties?.status, 'inactive')).toBe('inactive')
    // server text, looked up verbatim and never ICU-compiled
    expect(currentDynamic()['server:Order must have at least one line']).toBeTruthy()
    expect(translateDynamic('Order must have at least one line')).toBe(
      'Une commande doit avoir au moins une ligne',
    )
  })

  it('leaves a message the file does not cover in English', async () => {
    setRuntimeEnv({
      VITE_UI_CUSTOMIZER: customizer({
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()
    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    expect(translate('Error loading data')).toBe('Error loading data')
    expect(translateDynamic('Some message nobody translated')).toBe('Some message nobody translated')
  })

  it('sets the boot default without overriding a choice', async () => {
    setRuntimeEnv({
      VITE_UI_CUSTOMIZER: customizer({
        default: FIXTURE_LANGUAGE,
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()

    // Nothing is cached (setup.browser.ts clears both keys after every test), so
    // the operator's default is what a fresh browser gets.
    expect(resolveInitialLocale()).toMatchObject({
      language: FIXTURE_LANGUAGE,
      languageSource: 'operator',
    })
  })
})

describe('a registration that does not resolve', () => {
  it('reads a missing file as "no such language", not as a parse error at boot', async () => {
    // THE SPA-FALLBACK TRAP, produced rather than described: a web server with a
    // catch-all route answers a MISSING file with the app's own HTML and a 200,
    // so `res.ok` alone would hand `res.json()` a page of markup. Here the URL
    // really answers HTML with a 200.
    const html = URL.createObjectURL(new Blob(['<!doctype html><title>app</title>'], { type: 'text/html' }))
    objectUrls.push(html)
    setRuntimeEnv({
      VITE_UI_CUSTOMIZER: customizer({ available: [{ code: FIXTURE_LANGUAGE, url: html }] }),
    })
    await initConfig()

    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    // Activated, English, and above all NOT hung: the boot overlay is only taken
    // down by code that keeps running.
    expect(translate('Language')).toBe('Language')
    expect(currentLabels()).toEqual({})
  })

  it('blocks boot with a message naming the key when the registration is malformed', async () => {
    setRuntimeEnv({ VITE_UI_CUSTOMIZER: customizer({ available: [{ name: 'No code here' }] }) })

    await initConfig()

    // The same convention a broken VITE_OAUTH_CONFIG follows: an operator gets a
    // blocking screen quoting their own JSON, not a language silently absent
    // from the menu with nothing anywhere saying why.
    expect(getConfigError()).toContain('locales.available')
    expect(getConfigError()).toContain('"code"')
  })
})
