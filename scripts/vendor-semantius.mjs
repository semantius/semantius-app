#!/usr/bin/env node
/**
 * Refreshes vendor/semantius/ from a checkout of the semantius backend.
 *
 *     node scripts/vendor-semantius.mjs
 *
 * The backend is read from the clone at SEMANTIUS_BACKEND_DIR, else the sibling
 * clone ../semantius, at its COMMITTED state SEMANTIUS_BACKEND_REF (default
 * origin/main) — through git, never off the disk, so a backend change in
 * progress is never vendored. `git fetch` that clone first: the ref is only as
 * current as its last fetch. Three files come out of it, all committed so the
 * tests that read them run in CI and before a release, where there is no
 * backend checkout:
 *
 *   vendor/semantius/0100_test_jsonlogic.json
 *     the backend's own JsonLogic test cases (apps/test/tests/), which
 *     apps/web/src/lib/computedFields.test.ts holds the browser evaluator to;
 *   vendor/semantius/0115_test_jsonlogic_check.json
 *     the rules the backend accepts or refuses when a model is saved
 *     (apps/test/tests/), which apps/web/src/lib/jsonLogicCheck.test.ts holds
 *     the form's check of a jsonlogic field to;
 *   vendor/semantius/jsonlogic-backend.json
 *     what sem-schema's jsonlogic-backend-sync.test.ts needs from the backend's
 *     migrations: the operators, the $ variables, the date vocabularies and every
 *     shipped rule. The extraction lives in that test, so this script runs it
 *     with SEMANTIUS_VENDOR_WRITE=1, which writes instead of comparing.
 *
 * Wherever a backend checkout exists, the tests fail when a copy no longer
 * matches it; that failure is the reminder to run this.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = process.env.SEMANTIUS_BACKEND_DIR ?? resolve(root, '../semantius')
const backendRef = process.env.SEMANTIUS_BACKEND_REF ?? 'origin/main'
const vendorDir = resolve(root, 'vendor/semantius')

// `.git` is a directory in a clone and a file in a worktree.
if (!existsSync(resolve(backendDir, '.git'))) {
  console.error(`vendor-semantius: no semantius clone at ${backendDir} (set SEMANTIUS_BACKEND_DIR)`)
  process.exit(1)
}
const git = (...args) => execFileSync('git', ['-C', backendDir, ...args], { encoding: 'utf8' })
let commit
try {
  commit = git('rev-parse', '--short', `${backendRef}^{commit}`).trim()
} catch {
  console.error(`vendor-semantius: ${backendRef} is not a commit in ${backendDir} (set SEMANTIUS_BACKEND_REF, or git fetch)`)
  process.exit(1)
}
console.log(`vendor-semantius: reading ${backendRef} (${commit}) in ${backendDir}`)

mkdirSync(vendorDir, { recursive: true })
// Copied as text, so a diff against the backend's file stays readable, with
// LF line endings whatever the repository stores. Parsed first, so a broken
// file is refused here rather than by the test that reads it.
for (const [file, what] of [
  ['0100_test_jsonlogic.json', 'JsonLogic test cases'],
  ['0115_test_jsonlogic_check.json', 'JsonLogic check cases'],
]) {
  const text = git('show', `${backendRef}:apps/test/tests/${file}`).replace(/\r\n/g, '\n')
  const corpus = JSON.parse(text)
  writeFileSync(resolve(vendorDir, file), text)
  console.log(`vendor-semantius: ${corpus.length} ${what}`)
}

const run = spawnSync('pnpm', ['--filter', 'sem-schema', 'exec', 'jest', 'jsonlogic-backend-sync'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SEMANTIUS_BACKEND_DIR: backendDir, SEMANTIUS_BACKEND_REF: backendRef, SEMANTIUS_VENDOR_WRITE: '1', SEMANTIUS_BACKEND_REQUIRED: '1' },
})
if (run.status !== 0) {
  console.error('vendor-semantius: the snapshot was written, but the sync test fails against it; see above')
  process.exit(run.status ?? 1)
}
console.log('vendor-semantius: vendor/semantius/jsonlogic-backend.json written')
