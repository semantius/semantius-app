#!/usr/bin/env node
/**
 * Refreshes vendor/semantius/ from a checkout of the semantius backend.
 *
 *     node scripts/vendor-semantius.mjs
 *
 * The backend is read from SEMANTIUS_BACKEND_DIR, else the sibling checkout
 * ../semantius. Two files come out of it, both committed so the tests that read
 * them run in CI and before a release, where there is no backend checkout:
 *
 *   vendor/semantius/0100_test_jsonlogic.json
 *     the backend's own JsonLogic test cases (apps/test/tests/), which
 *     apps/web/src/lib/computedFields.test.ts holds the browser evaluator to;
 *   vendor/semantius/jsonlogic-backend.json
 *     what sem-schema's jsonlogic-backend-sync.test.ts needs from the backend's
 *     migrations: the operators, the $ variables, the date vocabularies and every
 *     shipped rule. The extraction lives in that test, so this script runs it
 *     with SEMANTIUS_VENDOR_WRITE=1, which writes instead of comparing.
 *
 * Wherever a backend checkout exists, both tests fail when a copy no longer
 * matches it; that failure is the reminder to run this.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(root, '../semantius')
const vendorDir = resolve(root, 'vendor/semantius')
const cases = resolve(backendDir, 'apps/test/tests/0100_test_jsonlogic.json')

if (!existsSync(cases)) {
  console.error(`vendor-semantius: no semantius checkout at ${backendDir} (set SEMANTIUS_BACKEND_DIR)`)
  process.exit(1)
}

mkdirSync(vendorDir, { recursive: true })
// Copied as text, so a diff against the backend's file stays readable, with
// LF line endings whatever the checkout's came out as. Parsed first, so a
// broken file is refused here rather than by the test that reads it.
const text = readFileSync(cases, 'utf8').replace(/\r\n/g, '\n')
const corpus = JSON.parse(text)
writeFileSync(resolve(vendorDir, '0100_test_jsonlogic.json'), text)
console.log(`vendor-semantius: ${corpus.length} JsonLogic test cases`)

const run = spawnSync('pnpm', ['--filter', 'sem-schema', 'exec', 'jest', 'jsonlogic-backend-sync'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SEMANTIUS_BACKEND_DIR: backendDir, SEMANTIUS_VENDOR_WRITE: '1', SEMANTIUS_BACKEND_REQUIRED: '1' },
})
if (run.status !== 0) {
  console.error('vendor-semantius: the snapshot was written, but the sync test fails against it; see above')
  process.exit(run.status ?? 1)
}
console.log('vendor-semantius: vendor/semantius/jsonlogic-backend.json written')
