#!/usr/bin/env node
/**
 * Refreshes vendor/semantius/ from a checkout of the semantius backend.
 *
 *     node scripts/vendor-semantius.mjs
 *
 * The backend is read from the checkout at SEMANTIUS_BACKEND_DIR, else the
 * sibling checkout ../semantius, AS IT IS ON DISK — uncommitted changes
 * included, so a backend change can be tested here before it is committed. Two
 * files come out of it, both committed so the
 * tests that read them run in CI and before a release, where there is no
 * backend checkout:
 *
 *   vendor/semantius/0100_test_jsonlogic.json
 *     the backend's own JsonLogic test cases (apps/test/tests/), which
 *     apps/web/src/lib/computedFields.test.ts holds the browser evaluator to;
 *   vendor/semantius/0115_test_jsonlogic_check.json
 *     the rules the backend accepts or refuses when a model is saved
 *     (apps/test/tests/), which apps/web/src/lib/jsonLogicCheck.test.ts holds
 *     the form's check of a jsonlogic field to.
 *
 * sem-schema's own backend snapshot is not here: it lives inside the package and
 * is refreshed in its master, IntranetFactory/schema-poc-1, then copied in by
 * `pnpm sync:sem-schema`.
 *
 * Wherever a backend checkout exists, the tests fail when a copy no longer
 * matches it; that failure is the reminder to run this.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(root, '../semantius')
const testsDir = resolve(backendDir, 'apps/test/tests')
const vendorDir = resolve(root, 'vendor/semantius')

if (!existsSync(testsDir)) {
  console.error(`vendor-semantius: no semantius checkout at ${backendDir} (set SEMANTIUS_BACKEND_DIR)`)
  process.exit(1)
}
console.log(`vendor-semantius: reading ${testsDir}`)

mkdirSync(vendorDir, { recursive: true })
// Copied as text, so a diff against the backend's file stays readable, with
// LF line endings whatever the repository stores. Parsed first, so a broken
// file is refused here rather than by the test that reads it.
for (const [file, what] of [
  ['0100_test_jsonlogic.json', 'JsonLogic test cases'],
  ['0115_test_jsonlogic_check.json', 'JsonLogic check cases'],
]) {
  const text = readFileSync(resolve(testsDir, file), 'utf8').replace(/\r\n/g, '\n')
  const corpus = JSON.parse(text)
  writeFileSync(resolve(vendorDir, file), text)
  console.log(`vendor-semantius: ${corpus.length} ${what}`)
}
