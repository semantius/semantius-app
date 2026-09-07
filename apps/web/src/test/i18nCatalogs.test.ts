import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'
import {
  LOCALES_DIR,
  NON_CATALOG_FILES,
  SOURCE_LANGUAGE,
  catalogFiles,
  extract,
  placeholdersOf,
  readJson,
  serialize,
} from '../../scripts/i18n/extract.mjs'
import { CONTEXT_SEPARATOR, flattenMessages, splitMessageId, type LocaleFile } from '@/i18n/catalog'
import { availableLanguages } from '@/i18n/store'

/**
 * The catalogs, checked against the code they came from.
 *
 * It runs the REAL extractor in memory — the same module `pnpm i18n:extract`
 * runs — and compares what it computes with what is on disk. A regex
 * re-implementation here would pass while the script that writes the files does
 * something else, which is the only failure mode that matters.
 *
 * What FAILS: the index or a catalog being out of date, a translation whose ICU
 * placeholders differ from its source, a translation that does not compile, a
 * repo catalog carrying tenant-only sections, and a file that breaks its shape.
 *
 * What only REPORTS: missing translations and glossary drift. A missing
 * translation renders in English — a degraded screen, not a broken build — and
 * failing on one would mean an English-only PR could not land, which is exactly
 * the pressure that produces machine-translated placeholder text. `i18n:status`
 * and the PR rule are what keep the count at zero.
 */

const { index, catalogs } = extract()

describe('the generated index (src/locales/en-US.json)', () => {
  it('is up to date with the code', () => {
    const onDisk = readFileSync(join(LOCALES_DIR, `${SOURCE_LANGUAGE}.json`), 'utf8')

    expect(
      onDisk,
      'src/locales/en-US.json is out of date — run `pnpm --filter @semantius/frontend i18n:extract`.',
    ).toBe(serialize(index))
  })

  it('found the app\'s messages at all', () => {
    // Without this every assertion below is vacuously true on an empty index.
    expect(Object.keys(index.index).length).toBeGreaterThan(20)
  })

  it('records an origin and a placeholder list for every entry', () => {
    for (const [id, entry] of Object.entries(index.index)) {
      expect(entry.message, id).toBeTruthy()
      expect(entry.origin.length, id).toBeGreaterThan(0)
      // Origins are repo-relative POSIX paths with no line numbers, so a moved
      // line does not churn the file.
      for (const origin of entry.origin) {
        expect(origin, id).toMatch(/^src\/[\w./$-]+\.tsx?$/)
      }
      expect(entry.placeholders, id).toEqual(placeholdersOf(entry.message))
    }
  })

  it('keys a message with a context by message + U+0004 + context', () => {
    for (const [id, entry] of Object.entries(index.index)) {
      const split = splitMessageId(id)
      expect(split.message, id).toBe(entry.message)
      expect(split.context, id).toBe(entry.context)
      expect(id.includes(CONTEXT_SEPARATOR), id).toBe(Boolean(entry.context))
    }
  })

  it('is sorted, so a rerun never reorders it', () => {
    const keys = Object.keys(index.index)
    expect(keys).toEqual([...keys].sort())
  })
})

describe.each(catalogs.map((catalog) => [catalog.code, catalog] as const))('catalog %s', (code, catalog) => {
  const onDisk: LocaleFile = readJson(catalog.path)

  it('is up to date with the code', () => {
    expect(
      readFileSync(catalog.path, 'utf8'),
      `src/locales/${code}.json is out of date — run \`pnpm --filter @semantius/frontend i18n:extract\`.`,
    ).toBe(serialize(catalog.file))
  })

  it('declares its own locale and its own name', () => {
    expect(onDisk.locale).toBe(code)
    // The endonym — the language's own name for itself — is what the switcher
    // shows, and it wins over the browser's display name.
    expect(onDisk.name, `${code}.json needs a "name" (the language's own name for itself)`).toBeTruthy()
  })

  it('carries no section that belongs to a tenant or a deployment', () => {
    // `labels` are model overrides, `server` and `rule` are backend messages:
    // all three are per-tenant data and have no business in the repo, where
    // they would be shipped to every deployment.
    for (const forbidden of ['labels', 'server', 'rule'] as const) {
      expect(onDisk[forbidden], `${code}.json must not carry a "${forbidden}" section`).toBeUndefined()
    }
  })

  it('keeps every placeholder its source has, and invents none', () => {
    for (const [id, entry] of Object.entries(index.index)) {
      const translation = entry.context
        ? onDisk.contexts?.[entry.context]?.[entry.message]
        : onDisk.messages?.[entry.message]
      if (!translation) continue
      // A dropped placeholder silently loses data on screen; an invented one
      // renders as literal braces.
      expect(placeholdersOf(translation), `${code}: ${id}`).toEqual(entry.placeholders)
    }
  })

  it('compiles every translation as ICU', () => {
    const values = [
      ...Object.entries(onDisk.messages ?? {}),
      ...Object.values(onDisk.contexts ?? {}).flatMap((entries) => Object.entries(entries)),
    ]
    for (const [key, translation] of values) {
      if (!translation) continue
      expect(() => compileMessageOrThrow(translation), `${code}: ${key}`).not.toThrow()
    }
  })

  it('reports how much is missing, and agrees with the runtime about what "missing" is', () => {
    const missing = Object.entries(index.index).filter(([, entry]) =>
      entry.context
        ? !onDisk.contexts?.[entry.context]?.[entry.message]
        : !onDisk.messages?.[entry.message],
    )
    if (missing.length > 0) {
      console.warn(
        `[i18n] ${code}: ${missing.length} of ${Object.keys(index.index).length} message(s) untranslated. ` +
          'Run `pnpm --filter @semantius/frontend i18n:status -- --verbose`.',
      )
    }

    // The COUNT only reports — a missing translation renders in English, which
    // is a degraded screen rather than a broken build. What is asserted is that
    // this file and the runtime mean the same thing by it: `flattenMessages` is
    // the function `activateLocale` merges layers with, and it DROPS an empty
    // value on purpose, because Lingui treats `""` as a present translation and
    // an entry present-but-empty would render as a blank instead of falling back
    // to the English. If that ever stopped being true, every gap in every
    // catalog would silently become a blank label and the count above would
    // still read zero.
    const runtimeKeys = new Set(Object.keys(flattenMessages(onDisk)))
    const missingIds = missing.map(([id]) => id)
    const translatedIds = Object.keys(index.index).filter((id) => !missingIds.includes(id))

    expect(missingIds.filter((id) => runtimeKeys.has(id)), `${code}: a gap the runtime treats as translated`).toEqual([])
    expect(
      translatedIds.filter((id) => !runtimeKeys.has(id)),
      `${code}: a translation the runtime does not load`,
    ).toEqual([])
  })

  it('uses the product\'s fixed terms, or says why not', () => {
    const glossary: Record<string, string> =
      readJson(join(LOCALES_DIR, 'glossary.json'))[code] ?? {}
    const drift: string[] = []
    for (const [id, entry] of Object.entries(index.index)) {
      const translation = entry.context
        ? onDisk.contexts?.[entry.context]?.[entry.message]
        : onDisk.messages?.[entry.message]
      if (!translation) continue
      // ICU placeholders are removed first: `{language}` is not a sighting of
      // the word "language", and treating it as one made every parameterized
      // message drift.
      const source = entry.message.replace(/\{[^}]*\}/g, ' ').toLowerCase()
      for (const [term, required] of Object.entries(glossary)) {
        if (!source.includes(term.toLowerCase())) continue
        if (!translation.toLowerCase().includes(required.toLowerCase())) {
          drift.push(`${id}: "${term}" should be "${required}", got ${JSON.stringify(translation)}`)
        }
      }
    }
    if (drift.length > 0) {
      console.warn(`[i18n] ${code} glossary drift:\n  ${drift.join('\n  ')}`)
    }
    // A wording is a judgment call and the glossary is a guide, so this reports.
    // It is still asserted so an empty glossary or a broken matcher is visible.
    expect(Object.keys(glossary).length, `glossary.json has no terms for ${code}`).toBeGreaterThan(0)
  })
})

describe('the locales folder', () => {
  it('has a catalog for every switchable language, and nothing else', () => {
    // The repo layer's `import.meta.glob` names its exclusions literally, so a
    // new non-catalog file dropped in here would be loaded as a locale. This is
    // what notices.
    const onDisk = readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.json'))
    const expected = [...NON_CATALOG_FILES, ...catalogs.map((catalog) => `${catalog.code}.json`)].sort()

    expect(onDisk.sort()).toEqual(expected)
    expect(availableLanguages().slice().sort()).toEqual(
      [SOURCE_LANGUAGE, ...catalogs.map((catalog) => catalog.code)].sort(),
    )
  })

  it('excludes the generated index from the catalogs', () => {
    // Loading it as a catalog would put `{ locale, index }` through the message
    // merge and translate nothing.
    expect(catalogFiles().map((entry) => entry.code)).not.toContain(SOURCE_LANGUAGE)
  })
})
