import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'
import {
  LANGUAGE_FILE,
  LOCALES_DIR,
  SOURCE_LANGUAGE,
  collectMessages,
  isMetadataKey,
  languageFiles,
  placeholdersOf,
  readIndex,
  readJson,
} from '../../scripts/i18n/extract.mjs'
import { isVerbatimKey } from '@/i18n/errors'
import { flattenMessages, type LocaleFile } from '@/i18n/catalog'
import { availableLanguages } from '@/i18n/store'

/**
 * The language files, checked against each other.
 *
 * The index (`public/locales/en-US.json`) is the complete baseline, filled by
 * the running app; each language file is checked against it. What FAILS: a
 * translation whose ICU placeholders differ from its source, a translation
 * that does not compile, a `module.*` key in `obsolete`, and a file that
 * breaks its shape.
 *
 * What only REPORTS: missing translations, glossary drift, and code strings
 * the optional scan finds that no test has rendered into the index. A missing
 * translation renders in English — a degraded screen, not a broken build — and
 * failing on one would mean an English-only PR could not land, which is
 * exactly the pressure that produces machine-translated placeholder text. A
 * string the scan sees and discovery has not is a test gap, worth knowing and
 * not a failure: there is deliberately NO assertion that the index and the
 * scan agree, because that assertion is what once made the scan a gate.
 */

const index = readIndex()
const entries = Object.entries(index.messages ?? {})
const languages = languageFiles()

describe('the index (public/locales/en-US.json)', () => {
  it('holds the app\'s messages at all', () => {
    // Without this every assertion below is vacuously true on an empty index.
    expect(entries.length).toBeGreaterThan(20)
    expect(index.locale).toBe(SOURCE_LANGUAGE)
  })

  it('records a source for every key', () => {
    for (const [key, source] of entries) {
      expect(source, key).toBeTruthy()
    }
  })

  it('is sorted, so a rewrite never reorders it', () => {
    const keys = entries.map(([key]) => key)
    expect(keys).toEqual([...keys].sort())
  })

  it('reports the code strings the scan finds that discovery has not', () => {
    const found = collectMessages()
    const unseen = [...found.keys()].filter((key) => !(key in (index.messages ?? {})))
    if (unseen.length > 0) {
      console.warn(
        `[i18n] ${unseen.length} code string(s) in src/ have not been rendered by any test — a test gap:\n  ` +
          unseen.map((key) => JSON.stringify(key)).join('\n  '),
      )
    }
    // Reported, never failed. The number that IS asserted: the scan works.
    expect(found.size).toBeGreaterThan(20)
  })
})

describe.each(languages.map((language) => [language.code, language] as const))('language %s', (code, language) => {
  const onDisk: LocaleFile = readJson(language.path)

  it('declares its own locale and its own name', () => {
    expect(onDisk.locale).toBe(code)
    // The endonym — the language's own name for itself — is what the switcher
    // shows, and it wins over the browser's display name.
    expect(onDisk.name, `${code}.json needs a "name" (the language's own name for itself)`).toBeTruthy()
  })

  it('keeps every placeholder its source has, and invents none', () => {
    for (const [key, source] of entries) {
      const translation = onDisk.messages?.[key]
      if (!translation || isVerbatimKey(key)) continue
      // A dropped placeholder silently loses data on screen; an invented one
      // renders as literal braces.
      expect(placeholdersOf(translation), `${code}: ${key}`).toEqual(placeholdersOf(source))
    }
  })

  it('compiles every translation as ICU, verbatim server sentences excepted', () => {
    for (const [key, translation] of Object.entries(onDisk.messages ?? {})) {
      if (!translation || isVerbatimKey(key)) continue
      expect(() => compileMessageOrThrow(translation), `${code}: ${key}`).not.toThrow()
    }
  })

  it('retires no model text — nothing prunes a module.* key', () => {
    for (const key of Object.keys(onDisk.obsolete ?? {})) {
      expect(isMetadataKey(key), `${code}: ${key} is in obsolete`).toBe(false)
    }
  })

  it('reports how much is missing, and agrees with the runtime about what "missing" is', () => {
    const missing = entries.filter(([key]) => !onDisk.messages?.[key])
    if (missing.length > 0) {
      const model = missing.filter(([key]) => isMetadataKey(key)).length
      console.warn(
        `[i18n] ${code}: ${missing.length} of ${entries.length} key(s) untranslated ` +
          `(${missing.length - model} code, ${model} model). Run \`pnpm --filter @semantius/frontend i18n:status -- --verbose\`.`,
      )
    }

    // The COUNT only reports — a missing translation renders in English, which
    // is a degraded screen rather than a broken build. What is asserted is that
    // this file and the runtime mean the same thing by it: `flattenMessages` is
    // the function `activateLocale` merges sources with, and it DROPS an empty
    // value on purpose, because Lingui treats `""` as a present translation and
    // an entry present-but-empty would render as a blank instead of falling back
    // to the English. If that ever stopped being true, every gap in every
    // language would silently become a blank label and the count above would
    // still read zero.
    const runtimeKeys = new Set(Object.keys(flattenMessages(onDisk)))
    const missingKeys = missing.map(([key]) => key)
    const translatedKeys = entries.map(([key]) => key).filter((key) => !missingKeys.includes(key))

    expect(missingKeys.filter((key) => runtimeKeys.has(key)), `${code}: a gap the runtime treats as translated`).toEqual([])
    expect(translatedKeys.filter((key) => !runtimeKeys.has(key)), `${code}: a translation the runtime does not load`).toEqual([])
  })

  it('uses the product\'s fixed terms, or says why not', () => {
    const glossary: Record<string, string> =
      readJson(join(LOCALES_DIR, '..', '..', 'scripts', 'i18n', 'glossary.json'))[code] ?? {}
    const drift: string[] = []
    for (const [key, source] of entries) {
      const translation = onDisk.messages?.[key]
      if (!translation) continue
      // ICU placeholders are removed first: `{language}` is not a sighting of
      // the word "language", and treating it as one made every parameterized
      // message drift.
      const text = source.replace(/\{[^}]*\}/g, ' ').toLowerCase()
      for (const [term, required] of Object.entries(glossary)) {
        if (!text.includes(term.toLowerCase())) continue
        if (!translation.toLowerCase().includes(required.toLowerCase())) {
          drift.push(`${key}: "${term}" should be "${required}", got ${JSON.stringify(translation)}`)
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
  it('holds language files, the index and the two schemas, and nothing else', () => {
    // `__SHIPPED_LOCALES__` is read off this folder by name at build time, so
    // a stray JSON dropped in here would be listed as a language. This is
    // what notices.
    const onDisk = readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.json'))
    const expected = ['schema.json', 'work.schema.json', `${SOURCE_LANGUAGE}.json`, ...languages.map((l) => `${l.code}.json`)].sort()

    expect(onDisk.sort()).toEqual(expected)
    for (const name of onDisk) {
      if (name === 'schema.json' || name === 'work.schema.json') continue
      expect(LANGUAGE_FILE.test(name), name).toBe(true)
    }
    expect(availableLanguages().slice().sort()).toEqual([SOURCE_LANGUAGE, ...languages.map((l) => l.code)].sort())
  })
})
