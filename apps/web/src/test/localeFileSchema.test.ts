import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { catalogFiles, LOCALES_DIR, readJson } from '../../scripts/i18n/extract.mjs'

/**
 * `apps/web/public/locales/schema.json`, checked against real files.
 *
 * The schema is what an operator writes a language against — it ships in the
 * build, so a `$schema` line in their editor validates as they type — and what
 * `import.mjs` refuses a work file on. A schema nobody validates anything with
 * is a description of an intention, so this validates three things: every repo
 * catalog, the deployment-file fixture the browser suite really fetches, and a
 * handful of deliberately broken files that MUST be rejected. The last group is
 * the one that matters: without it, a schema that accepted everything would pass
 * the first two forever.
 */

const SCHEMA_PATH = join(process.cwd(), 'public', 'locales', 'schema.json')
const schema: object = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))

// `strict: false`: the schema is written for editors and operators, and draft-07
// `$defs` (rather than draft-2019 `$defs` under a matching `$schema`) is exactly
// the kind of thing Ajv's strict mode objects to while every consumer is happy.
const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

function errorsFor(file: unknown): string {
  validate(file)
  return (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`).join('; ')
}

describe('the locale-file schema', () => {
  it('accepts every repo catalog', () => {
    for (const { code, path } of catalogFiles()) {
      const file: unknown = readJson(path)
      expect(validate(file), `${code}.json: ${errorsFor(file)}`).toBe(true)
    }
  })

  it('accepts the deployment-file fixture the browser suite fetches', () => {
    // The same bytes `src/i18n/deploymentLocales.test.tsx` serves as a blob. It
    // carries every section a deployment file may have — messages, contexts,
    // labels and server text — so accepting it is a real exercise of the schema
    // rather than of its `messages` branch alone.
    const fixture: unknown = readJson(join(process.cwd(), 'src', 'test', 'fixtures', 'locales', 'fr-FR.json'))

    expect(validate(fixture), errorsFor(fixture)).toBe(true)
    const file = fixture as Record<string, Record<string, unknown>>
    expect(Object.keys(file)).toEqual(
      expect.arrayContaining(['locale', 'name', 'messages', 'contexts', 'labels', 'server']),
    )
  })

  it('requires the locale tag', () => {
    expect(validate({ messages: { Save: 'Speichern' } })).toBe(false)
  })

  it('rejects a section it does not know, so a typo is not silently ignored', () => {
    // `message` for `messages`, `label` for `labels`: an operator's file would
    // load and translate nothing at all, with no error anywhere.
    expect(validate({ locale: 'de-DE', message: { Save: 'Speichern' } })).toBe(false)
    expect(validate({ locale: 'de-DE', labels: { table: {} } })).toBe(false)
  })

  it('rejects a label attribute that is not one of the overridable ones', () => {
    expect(
      validate({ locale: 'de-DE', labels: { tables: { customers: { label_column: 'name' } } } }),
    ).toBe(false)
    expect(
      validate({
        locale: 'de-DE',
        labels: { tables: { customers: { columns: { status: { caption: 'Status' } } } } },
      }),
    ).toBe(false)
  })

  it('rejects a translation that is not a string', () => {
    expect(validate({ locale: 'de-DE', messages: { Save: 42 } })).toBe(false)
    expect(validate({ locale: 'de-DE', server: { 'A message': null } })).toBe(false)
  })

  it('accepts an empty translation — that is how a file spells "not yet"', () => {
    expect(validate({ locale: 'de-DE', messages: { Save: '' } })).toBe(true)
  })

  it('lives where the build serves it, so an operator can point $schema at it', () => {
    // public/ ships verbatim into dist/, which is what makes /locales/schema.json
    // a URL on every deployment rather than a file only this repo has.
    expect(SCHEMA_PATH.replace(/[\\/]/g, '/')).toContain('/public/locales/schema.json')
    expect(LOCALES_DIR).toBeTruthy()
  })
})
