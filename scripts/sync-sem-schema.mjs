#!/usr/bin/env node
/**
 * Copies sem-schema from its master into this repository.
 *
 *     pnpm sync:sem-schema
 *
 * packages/sem-schema is a COPY. Its master is packages/sem-schema in
 * IntranetFactory/schema-poc-1, read from the checkout at SCHEMA_POC_DIR, else
 * the sibling checkout ../schema-poc-1. Change the master, then run this: it
 * replaces this copy with the master's package AS IT IS ON DISK — uncommitted
 * changes included, so a master change can be tried here before it is committed
 * there — and then runs the package's tests.
 *
 * The file list is git's own in the master (tracked and untracked files, minus
 * what it ignores), so node_modules and build output never come across, and a
 * file the master has deleted is deleted here too. Text files are written with
 * LF, as this repository stores them, whatever line endings the master's
 * checkout has.
 *
 * It refuses to run while a file of this copy has an uncommitted change it did
 * not write: that change would be overwritten, and a change made only here
 * belongs in the master. What it wrote is remembered in .git/sem-schema-sync.json
 * (never committed), so syncing again while trying out a master change works.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = 'packages/sem-schema'
const MASTER_ORIGIN = /[/:]IntranetFactory\/schema-poc-1(\.git)?$/i
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const masterDir = process.env.SCHEMA_POC_DIR ?? resolve(root, '../schema-poc-1')

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
const listed = (cwd, ...options) =>
  git(cwd, 'ls-files', '-z', ...options, '--', PACKAGE)
    .split('\0')
    .filter(Boolean)
const fail = (message) => {
  console.error(`sync-sem-schema: ${message}`)
  process.exit(1)
}

if (!existsSync(resolve(masterDir, PACKAGE, 'package.json'))) {
  fail(`no sem-schema at ${resolve(masterDir, PACKAGE)} (set SCHEMA_POC_DIR to the schema-poc-1 checkout)`)
}
const origin = git(masterDir, 'remote', 'get-url', 'origin').trim()
if (!MASTER_ORIGIN.test(origin)) fail(`${masterDir} is ${origin}, not IntranetFactory/schema-poc-1`)

// What the last sync wrote: file -> hash of its content, null for a deletion.
const statePath = resolve(root, git(root, 'rev-parse', '--git-path', 'sem-schema-sync.json').trim())
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const hash = (bytes) => createHash('sha1').update(bytes).digest('hex')
const contentHash = (file) => (existsSync(resolve(root, file)) ? hash(readFileSync(resolve(root, file))) : null)

// `XY path`, and for a rename or copy a further entry holding the source path.
const status = git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', PACKAGE).split('\0')
const edited = []
for (let i = 0; i < status.length; i++) {
  const entry = status[i]
  if (!entry) continue
  if (/[RC]/.test(entry.slice(0, 2))) i++
  const file = entry.slice(3)
  if (!(file in state) || state[file] !== contentHash(file)) edited.push(file)
}
if (edited.length) {
  fail(`these files of ${PACKAGE} were changed here, not by a sync; commit them, or make the change in the master:\n  ${edited.join('\n  ')}`)
}

// --cached lists a file deleted on disk but not yet in the index; the disk decides.
const incoming = listed(masterDir, '--cached', '--others', '--exclude-standard').filter((file) =>
  existsSync(resolve(masterDir, file)),
)
console.log(`sync-sem-schema: copying ${PACKAGE} from ${masterDir}`)

let changed = 0
for (const file of incoming) {
  let bytes = readFileSync(resolve(masterDir, file))
  // A NUL byte marks a binary file, which is copied as it is.
  if (!bytes.includes(0)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
  const target = resolve(root, file)
  if (existsSync(target) && readFileSync(target).equals(bytes)) continue
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
  state[file] = hash(bytes)
  changed++
  console.log(`  copied  ${file}`)
}
const kept = new Set(incoming)
for (const file of listed(root)) {
  if (kept.has(file)) continue
  rmSync(resolve(root, file), { force: true })
  state[file] = null
  changed++
  console.log(`  deleted ${file}`)
}
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
console.log(`sync-sem-schema: ${changed ? `${changed} file(s) changed` : 'already identical to the master'}`)

const run = spawnSync('pnpm', ['--filter', 'sem-schema', 'test'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(run.status ?? 1)
