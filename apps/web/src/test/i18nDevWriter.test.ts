import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyTranslation, readMessages, serializeLocaleFile } from '../../vite-plugins/i18nDevWriter'

/**
 * The dev server's side of the endpoint contract, on a scratch folder: what a
 * write does to a language file. The HTTP half is exercised for real by the
 * browser suite, whose every test writes through it.
 */

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'i18n-writer-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const read = (locale: string) => JSON.parse(readFileSync(join(dir, `${locale}.json`), 'utf8'))

describe('applyTranslation', () => {
  it('creates the file, in section order with sorted messages', () => {
    applyTranslation({ locale: 'de-DE', key: 'Zebra', translation: 'Zebra' }, dir)
    applyTranslation({ locale: 'de-DE', key: 'Save', translation: 'Speichern' }, dir)

    expect(readFileSync(join(dir, 'de-DE.json'), 'utf8')).toBe(
      serializeLocaleFile({ locale: 'de-DE', messages: { Save: 'Speichern', Zebra: 'Zebra' } }),
    )
    expect(Object.keys(read('de-DE'))).toEqual(['locale', 'messages'])
  })

  it('writes the bytes i18n:extract would, so a rerun of the scan is a no-op', () => {
    const text = serializeLocaleFile({
      locale: 'de-DE',
      name: 'Deutsch',
      obsolete: { Old: 'Alt' },
      messages: { b: '2', a: '1' },
    })
    expect(text).toBe('{\n  "locale": "de-DE",\n  "name": "Deutsch",\n  "messages": {\n    "a": "1",\n    "b": "2"\n  },\n  "obsolete": {\n    "Old": "Alt"\n  }\n}\n')
  })

  it('reports an unchanged write as unchanged, and touches nothing', () => {
    applyTranslation({ locale: 'de-DE', key: 'Save', translation: 'Speichern' }, dir)
    expect(applyTranslation({ locale: 'de-DE', key: 'Save', translation: 'Speichern' }, dir).changed).toBe(false)
  })

  it('keeps an empty entry for a key the index knows — that is work', () => {
    applyTranslation({ locale: 'en-US', key: 'Save', translation: 'Save' }, dir)
    applyTranslation({ locale: 'de-DE', key: 'Save', translation: '' }, dir)

    expect(readMessages('de-DE', dir)).toEqual({ Save: '' })
  })

  it('drops an entry cleared for a key the index does not know — there is nothing to translate from', () => {
    applyTranslation({ locale: 'de-DE', key: 'A probe', translation: 'Eine Sonde' }, dir)
    applyTranslation({ locale: 'de-DE', key: 'A probe', translation: '' }, dir)

    expect(readMessages('de-DE', dir)).toEqual({})
  })

  it('drops an index entry cleared in the source language — an entry without a source is nothing', () => {
    applyTranslation({ locale: 'en-US', key: 'A probe', translation: 'A probe' }, dir)
    applyTranslation({ locale: 'en-US', key: 'A probe', translation: '' }, dir)

    expect(readMessages('en-US', dir)).toEqual({})
  })

  it('refuses a locale that is not a language tag, so schema.json can never be written', () => {
    expect(() => applyTranslation({ locale: 'schema', key: 'x', translation: 'y' }, dir)).toThrow(/language tag/)
    expect(() => applyTranslation({ locale: '../x', key: 'x', translation: 'y' }, dir)).toThrow(/language tag/)
    expect(() => applyTranslation({ locale: 'de-DE', key: '', translation: 'y' }, dir)).toThrow(/key/)
  })
})
