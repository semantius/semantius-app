import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fixture from '@/test/fixtures/locales/fr-FR.json?raw'
import { clearRuntimeEnv, setRuntimeEnv } from '@/test/runtimeConfig'
import { getConfig, getConfigError, initConfig } from '@/lib/config'
import type { EntityMetadata } from '@/types/metadata'
import {
  SOURCE_LANGUAGE,
  activateLocale,
  availableLocales,
  currentMessages,
  enumLabel,
  languageDisplayName,
  localizeMetadata,
  resolveInitialLocale,
  setDeploymentLocales,
  translate,
  translateVerbatim,
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
 * repo, checked against `apps/web/public/locales/schema.json` by the node suite — and the
 * browser fetches it through the same code and the same headers a static file
 * would take. The one thing it cannot cover, a web server actually serving
 * `/locales/fr-FR.json`, is covered by the deployed preview.
 *
 * `initConfig()` here runs with the translate mode `off`, said explicitly —
 * unset would be `dev` under the dev server the suite runs in — so the file
 * is the one source, which is exactly a deployment's shape.
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
      module_slug: 'nwind',
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
      VITE_TRANSLATE_MODE: 'off',
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

  it('translates code strings, a disambiguated one, model text and a server error from the one flat file', async () => {
    setRuntimeEnv({
      VITE_TRANSLATE_MODE: 'off',
      VITE_UI_CUSTOMIZER: customizer({
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()
    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    // a code string
    expect(translate('Language')).toBe('Langue')
    // the same word with two meanings is two keys
    expect(translate({ id: ['columnVisibility'], message: 'View' })).toBe('Affichage')
    // model text: an entity label, a field title and an enum value, through
    // the same walk the table route applies
    const localized = localizeMetadata(customersMetadata())
    expect(localized.table?.plural_label).toBe('Clients')
    expect(localized.properties?.status.title).toBe('État')
    expect(enumLabel(localized.properties?.status, 'active')).toBe('Actif')
    // ...and the stored value is untouched, because it is what the database holds
    expect(enumLabel(localized.properties?.status, 'inactive')).toBe('inactive')
    // a module's name, keyed by its slug
    expect(translate({ id: ['module', 'nwind', 'name'], defaultMessage: 'Northwind' })).toBe('Vents du Nord')
    // a plain server sentence, looked up verbatim under its SQLSTATE key
    expect(currentMessages()['23505.customers_email_key']).toBeTruthy()
    expect(
      translateVerbatim('23505.customers_email_key', 'duplicate key value violates unique constraint "customers_email_key"'),
    ).toBe('Cette adresse e-mail est déjà utilisée.')
  })

  it('leaves a message the file does not cover in English', async () => {
    setRuntimeEnv({
      VITE_TRANSLATE_MODE: 'off',
      VITE_UI_CUSTOMIZER: customizer({
        available: [{ code: FIXTURE_LANGUAGE, url: serveJson(fixture) }],
      }),
    })
    await initConfig()
    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    expect(translate('Error loading data')).toBe('Error loading data')
    expect(translateVerbatim('42703', 'column orders.nope does not exist')).toBe('column orders.nope does not exist')
    expect(translate({ id: ['module', 'nwind', 'orders', 'entity', 'plural_label'], defaultMessage: 'Orders' })).toBe(
      'Orders',
    )
  })

  it('sets the boot default without overriding a choice', async () => {
    setRuntimeEnv({
      VITE_TRANSLATE_MODE: 'off',
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
      VITE_TRANSLATE_MODE: 'off',
      VITE_UI_CUSTOMIZER: customizer({ available: [{ code: FIXTURE_LANGUAGE, url: html }] }),
    })
    await initConfig()

    await activateLocale({ language: FIXTURE_LANGUAGE, locale: FIXTURE_LANGUAGE })

    // Activated, English, and above all NOT hung: the boot overlay is only taken
    // down by code that keeps running.
    expect(translate('Language')).toBe('Language')
    expect(currentMessages()).toEqual({})
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

  it('blocks boot on a translate mode it does not know, and on stage with no host', async () => {
    setRuntimeEnv({ VITE_TRANSLATE_MODE: 'sideways' })
    await initConfig()
    expect(getConfigError()).toContain('VITE_TRANSLATE_MODE')

    setRuntimeEnv({ VITE_TRANSLATE_MODE: 'stage' })
    await initConfig()
    expect(getConfigError()).toContain('VITE_TRANSLATE_API_URL')
  })
})
