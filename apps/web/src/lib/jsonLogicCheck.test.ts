import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateData } from 'sem-schema'
import { describe, expect, it } from 'vitest'

// The rules the backend accepts or refuses when a model is saved, from its own
// case list, committed at vendor/semantius/ so they run in CI and before a
// release, where there is no backend checkout. Where there is one, the copy must
// match its COMMITTED state at SEMANTIUS_BACKEND_REF (default origin/main), read
// through git rather than off the disk, as in computedFields.test.ts.
// `node scripts/vendor-semantius.mjs` refreshes it.
// src/lib -> src -> web -> apps -> repository root
const vendoredPath = resolve(__dirname, '../../../../vendor/semantius/0115_test_jsonlogic_check.json')
// ... -> its parent
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(__dirname, '../../../../../semantius')
const backendRef = process.env.SEMANTIUS_BACKEND_REF ?? 'origin/main'
const backendFile = 'apps/test/tests/0115_test_jsonlogic_check.json'
// `.git` is a directory in a clone and a file in a worktree.
const backendFound = existsSync(resolve(backendDir, '.git'))
const backendCases = JSON.parse(readFileSync(vendoredPath, 'utf8')) as unknown[]

describe('the vendored backend check cases', () => {
  const required = process.env.SEMANTIUS_BACKEND_REQUIRED === '1'
  it.skipIf(!backendFound && !required)(`match the backend at ${backendRef} (refresh: node scripts/vendor-semantius.mjs)`, () => {
    expect(backendFound, `no semantius clone at ${backendDir}`).toBe(true)
    const committed = execFileSync('git', ['-C', backendDir, 'show', `${backendRef}:${backendFile}`], { encoding: 'utf8' })
    expect(backendCases).toEqual(JSON.parse(committed))
  })
})

// The form checks a jsonlogic field through validateData, so the cases run there.
// [rule, null] is a rule the backend saves, and the form must accept it.
// [rule, code, path] is one the backend refuses with `code`, its first mistake at
// the JSON pointer `path`; the form must refuse it with a problem at that place.
const schema = { type: 'object', properties: { rule: { format: 'jsonlogic' } } }

const problemPaths = (rule: unknown): string[] =>
  (validateData({ rule }, schema).errors ?? [])
    .filter((error) => error.keyword === 'format' && error.params?.format === 'jsonlogic')
    .map((error) => error.params.path)

const cases = backendCases.filter((entry): entry is [unknown, string | null, string?] => Array.isArray(entry))

describe('every backend check case gets the answer the backend gives', () => {
  it('finds the backend fixture', () => {
    expect(cases.length).toBeGreaterThan(200)
  })

  it.each(cases)('%j', (rule, code, path) => {
    if (code === null) {
      expect(validateData({ rule }, schema).errors ?? []).toEqual([])
    } else {
      expect(problemPaths(rule)).toContain(path)
    }
  })
})
