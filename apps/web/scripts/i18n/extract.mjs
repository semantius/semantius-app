#!/usr/bin/env node
/**
 * Scan `src/` for code messages and reconcile the language files.
 *
 *   pnpm --filter @semantius/frontend i18n:extract [--prune]
 *
 * AN OPTIONAL TOOL YOU RUN, NEVER A GATE. Not in `pnpm build`, not in
 * `pnpm check`, not in a hook. Runtime discovery is how `en-US.json` is
 * maintained: the app renders a string, fails to translate it, and records it
 * through the translate target (src/i18n/missing.ts) — a code message and a
 * metadata message the same way. This scan's job is the one thing discovery
 * cannot do: PRUNING. A code string that was reworded or deleted leaves a key
 * that nothing at runtime can observe as gone; the scan is what moves its
 * translations to `obsolete`. If a run also turns up a code string discovery
 * has never seen, that is a test gap it happened to find — worth knowing, not
 * a failure.
 *
 * WHAT IT PRODUCES
 *   public/locales/en-US.json   the index — `{ locale, name, messages }` with
 *                               the SOURCE text as the value of every key. The
 *                               code half is set from the scan; the `module.*`
 *                               half is runtime's and is never touched.
 *   public/locales/<code>.json  each language, reconciled: a new code key
 *                               appears with `""`, a code key whose source no
 *                               longer exists moves to `obsolete`, and an
 *                               existing translation is never touched.
 *                               `--prune` empties `obsolete`.
 *
 * `i18n:extract` MUST NEVER TOUCH `module.*`. Runtime owns that half of the
 * file and the scanner cannot see it, so the reserved-root rule is what makes
 * an optional tool safe to run against a file it does not own — without it,
 * one run would wipe everything discovery found.
 *
 * WHY A COMPILER AND NOT A REGEX. For a code string the source IS the key, so
 * a key the scan cannot read is a string it cannot prune and cannot report.
 * This therefore FAILS — loudly, with file and line — on a first argument it
 * cannot read as a literal: a template with expressions, a conditional, a
 * concatenation. An identifier or a member expression PASSES, because
 * `t(entry.title)` renders a `msg()` descriptor that was scanned at its own
 * declaration site, or an operator's plain string that discovery records. A
 * keyed message (`defaultMessage`) is SKIPPED: its key is a model path and its
 * source lives in the model, so discovery is its only inventory.
 *
 * `typescript` is already a devDependency here and parses TSX without
 * configuration; `@babel/parser` is not resolvable from `apps/web`.
 *
 * Output is deterministic: keys sorted by code unit (NOT `localeCompare`, which
 * would make the file depend on the machine's locale), two-space JSON with a
 * trailing newline.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'

/** The source language: its file is the index, the SOURCE text of every key. */
export const SOURCE_LANGUAGE = 'en-US'

/** The reserved first segment of every metadata key. Mirrors `src/i18n/catalog.ts`. */
export const MODULE_ROOT = 'module'

/** A language file is named by its BCP-47 tag; `schema.json` and friends are not one. */
export const LANGUAGE_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.json$/

/**
 * The functions whose argument carries a message. `appError` packages a
 * user-facing error as a template plus values (src/lib/appError.ts); its
 * `message` and `hint` are messages like any `t()` argument.
 */
const MESSAGE_CALLEES = new Set(['t', 'translate', 'msg', 'appError'])

/** Directories under `src/` whose contents are tests, not product code. */
const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__mocks__'])

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SRC_DIR = join(APP_ROOT, 'src')
export const LOCALES_DIR = join(APP_ROOT, 'public', 'locales')

// ── Keys ────────────────────────────────────────────────────────────────────
//
// Mirrors `messageId()` in src/i18n/catalog.ts: a segment's dots are escaped,
// segments are joined by a dot, and a form-2 message is appended as it is.

function escapeSegment(segment) {
  return segment.replace(/\\/g, '\\\\').replace(/\./g, '\\.')
}

export function joinSegments(segments) {
  return segments.map(escapeSegment).join('.')
}

/** Whether a stored key belongs to the model — the `module.` root. */
export function isMetadataKey(key) {
  return key === MODULE_ROOT || key.startsWith(`${MODULE_ROOT}.`)
}

// ── Source scan ─────────────────────────────────────────────────────────────

/** Every product `.ts`/`.tsx` under `dir`, tests excluded, sorted for determinism. */
export function sourceFiles(dir = SRC_DIR) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        if (!TEST_DIRS.has(entry) && entry !== 'node_modules') walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue
      out.push(full)
    }
  }
  walk(dir)
  return out
}

/** A repo-relative, POSIX-separated path — for a complaint that names its file. */
function originOf(file) {
  return relative(APP_ROOT, file).split('\\').join('/')
}

class ExtractionError extends Error {}

function positionOf(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${line + 1}:${character + 1}`
}

function isStringLiteral(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

/**
 * Read the messages out of a call's first argument.
 *
 * Returns a list of `{ key, source, comment? }` — one for the message, one
 * more for an `appError` hint — or `null` for a reference this cannot and
 * should not read (an identifier or a member expression) and for a keyed
 * message. Pushes a human-readable complaint onto `problems` for every other
 * unreadable form.
 *
 * The list of accepted forms is a WHITELIST, not a set of special cases with a
 * permissive fallthrough. A fallthrough that let anything it did not recognize
 * through would make the whole scheme unsound: `t(getTitle())` and
 * `t(cond && 'Yes')` would vanish in silence, which is precisely the failure
 * this script exists to prevent.
 */
function readMessageArgument(arg, sourceFile, origin, problems, what) {
  if (!arg) return null

  // Wrappers that change nothing about the value. Unwrapped FIRST, or a single
  // pair of parentheses would defeat the concatenation check below — and
  // nothing in a formatter or a lint rule removes them.
  while (
    ts.isParenthesizedExpression(arg) ||
    ts.isAsExpression(arg) ||
    ts.isNonNullExpression(arg) ||
    (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(arg))
  ) {
    arg = arg.expression
  }

  if (isStringLiteral(arg)) {
    return [{ key: arg.text, source: arg.text }]
  }

  if (ts.isObjectLiteralExpression(arg)) {
    return readDescriptor(arg, sourceFile, origin, problems, what)
  }

  if (ts.isTemplateExpression(arg)) {
    problems.push(
      `${origin}:${positionOf(sourceFile, arg)} — ${what} takes a template literal with expressions. ` +
        'Use an ICU placeholder instead: t(\'Hello {name}\', { name }).',
    )
    return null
  }

  if (ts.isConditionalExpression(arg)) {
    problems.push(
      `${origin}:${positionOf(sourceFile, arg)} — ${what} takes a conditional. ` +
        'Translate each branch instead, or use an ICU select.',
    )
    return null
  }

  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    problems.push(
      `${origin}:${positionOf(sourceFile, arg)} — ${what} takes a concatenation. ` +
        'A sentence built by + cannot be translated; write it as one ICU message.',
    )
    return null
  }

  // An identifier or a member expression: `t(entry.title)`, `t(config.label)`,
  // `t(entries[i].title)`. Its `msg()` site is scanned where it is declared,
  // and an operator's plain string is recorded by discovery. These are the
  // ONLY references that pass.
  if (ts.isIdentifier(arg) || ts.isPropertyAccessExpression(arg) || ts.isElementAccessExpression(arg)) {
    return null
  }

  problems.push(
    `${origin}:${positionOf(sourceFile, arg)} — ${what} takes an expression this cannot read as a message. ` +
      'Pass a string literal, a { message } object, or a reference to a msg() descriptor.',
  )
  return null
}

/**
 * The three descriptor fields the scan reads: `message` with an optional `id`
 * (form 2: the id is a static prefix, so it has to be an array of literals),
 * `hint` (an `appError`'s second message), and `comment`. A `defaultMessage`
 * descriptor is a keyed message — skipped, not refused: its inventory is
 * discovery's. Unknown keys (`values`, `details`) are ignored.
 */
function readDescriptor(arg, sourceFile, origin, problems, what) {
  let message
  let hint
  let comment
  let id
  let keyed = false
  for (const property of arg.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue
    const name = property.name.text
    const value = property.initializer
    if (name === 'defaultMessage') {
      keyed = true
      continue
    }
    if (name === 'message' || name === 'hint' || name === 'comment') {
      if (!isStringLiteral(value)) {
        problems.push(
          `${origin}:${positionOf(sourceFile, value)} — ${what} descriptor "${name}" must be a plain string literal.`,
        )
        return null
      }
      if (name === 'message') message = value.text
      else if (name === 'hint') hint = value.text
      else comment = value.text
      continue
    }
    if (name === 'id') {
      if (!ts.isArrayLiteralExpression(value) || !value.elements.every(isStringLiteral)) {
        // A computed id belongs to a keyed message, whose `defaultMessage`
        // marks it as discovery's. A form-2 id has to be static.
        if (!arg.properties.some((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'defaultMessage')) {
          problems.push(
            `${origin}:${positionOf(sourceFile, value)} — ${what} descriptor "id" must be an array of string literals.`,
          )
          return null
        }
        continue
      }
      id = value.elements.map((element) => element.text)
    }
  }
  if (keyed) return null
  if (!message) {
    problems.push(`${origin}:${positionOf(sourceFile, arg)} — ${what} descriptor has no literal "message".`)
    return null
  }
  if (id && id[0] === MODULE_ROOT) {
    problems.push(
      `${origin}:${positionOf(sourceFile, arg)} — ${what} descriptor "id" starts with the reserved segment "${MODULE_ROOT}".`,
    )
    return null
  }
  const key = id && id.length > 0 ? `${joinSegments(id)}.${message}` : message
  const out = [{ key, source: message, ...(comment ? { comment } : {}) }]
  if (hint) out.push({ key: hint, source: hint })
  return out
}

/** The `id` (and `comment`) of a `<Trans>` element, or null. */
function readTransAttributes(attributes, sourceFile, origin, problems) {
  let message
  let comment
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue
    const name = attribute.name.text
    if (name !== 'id' && name !== 'comment') continue
    const initializer = attribute.initializer
    if (!initializer) continue
    let expression = initializer
    if (ts.isJsxExpression(initializer)) {
      if (!initializer.expression) continue
      expression = initializer.expression
    }
    const read = readMessageArgument(expression, sourceFile, origin, problems, `<Trans ${name}>`)
    if (!read) continue
    if (name === 'id') message = read[0].source
    else comment = read[0].source
  }
  return message ? [{ key: message, source: message, ...(comment ? { comment } : {}) }] : null
}

/**
 * Every code message in `files`, keyed by stored key.
 * Throws an ExtractionError naming every unreadable call site.
 */
export function collectMessages(files = sourceFiles()) {
  /** @type {Map<string, { source: string, comment?: string }>} */
  const found = new Map()
  const problems = []

  const record = (entry) => {
    const existing = found.get(entry.key)
    if (existing) {
      if (!existing.comment && entry.comment) existing.comment = entry.comment
      return
    }
    found.set(entry.key, { source: entry.source, ...(entry.comment ? { comment: entry.comment } : {}) })
  }

  for (const file of files) {
    const origin = originOf(file)
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && MESSAGE_CALLEES.has(node.expression.text)) {
        const entries = readMessageArgument(node.arguments[0], sourceFile, origin, problems, `${node.expression.text}()`)
        for (const entry of entries ?? []) record(entry)
      } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (ts.isIdentifier(node.tagName) && node.tagName.text === 'Trans') {
          const entries = readTransAttributes(node.attributes, sourceFile, origin, problems)
          for (const entry of entries ?? []) record(entry)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  if (problems.length > 0) {
    throw new ExtractionError(
      `i18n extraction found ${problems.length} message(s) it cannot read:\n  ${problems.join('\n  ')}`,
    )
  }
  return found
}

// ── ICU placeholders ────────────────────────────────────────────────────────

/** Every argument name an ICU message interpolates, sorted. Throws on a message that does not compile. */
export function placeholdersOf(message) {
  const names = new Set()
  const walk = (tokens) => {
    for (const token of tokens) {
      if (typeof token === 'string') continue
      const [name, , format] = token
      names.add(name)
      if (format && typeof format === 'object' && !Array.isArray(format)) {
        for (const [key, choice] of Object.entries(format)) {
          if (key === 'offset' || !Array.isArray(choice)) continue
          walk(choice)
        }
      }
    }
  }
  const compiled = compileMessageOrThrow(message)
  walk(Array.isArray(compiled) ? compiled : [compiled])
  return [...names].sort()
}

// ── The files ───────────────────────────────────────────────────────────────

/** Sort by UTF-16 code unit — never `localeCompare`, which depends on the machine. */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The order every writer produces — the extractor here, the dev writer in
 * `vite-plugins/i18nDevWriter.ts`: keys sorted by code unit, as a JavaScript
 * object then enumerates them. That last clause is a real exception: an
 * all-digit key (a bare SQLSTATE such as `42703`, recorded verbatim) is an
 * array index to the language and is enumerated FIRST whatever the sort said,
 * so `Object.keys(sortedObject(x))` is the yardstick for "sorted", not
 * `[...keys].sort()`.
 */
export function sortedObject(entries) {
  const out = {}
  for (const key of Object.keys(entries).sort(byCodeUnit)) out[key] = entries[key]
  return out
}

/** The language files in `dir`, by code, the index excluded. */
export function languageFiles(dir = LOCALES_DIR) {
  return readdirSync(dir)
    .map((name) => ({ code: LANGUAGE_FILE.exec(name)?.[1], path: join(dir, name) }))
    .filter(({ code }) => code && code !== SOURCE_LANGUAGE)
    .sort((a, b) => byCodeUnit(a.code, b.code))
}

export function indexPath(dir = LOCALES_DIR) {
  return join(dir, `${SOURCE_LANGUAGE}.json`)
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** The index on disk, or an empty one. */
export function readIndex(dir = LOCALES_DIR) {
  try {
    return readJson(indexPath(dir))
  } catch {
    return { locale: SOURCE_LANGUAGE, name: 'English', messages: {} }
  }
}

/**
 * Reconcile the index against the scan.
 *
 * The code half is what the scan found, source and all; the `module.*` half is
 * carried over untouched. Nothing else survives: a code key the scan no longer
 * sees was reworded or deleted, and an index entry for it would list work that
 * does not exist.
 */
export function reconcileIndex(index, found) {
  const messages = {}
  for (const [key, source] of Object.entries(index.messages ?? {})) {
    if (isMetadataKey(key)) messages[key] = source
  }
  for (const [key, entry] of found) messages[key] = entry.source
  const out = { locale: SOURCE_LANGUAGE, name: index.name || 'English' }
  out.messages = sortedObject(messages)
  return out
}

/**
 * Reconcile one language against the scan.
 *
 * Existing values are carried over verbatim, `module.*` entries untouched. A
 * code key the scan no longer finds moves to `obsolete` if it holds a
 * translation and is dropped if it does not (an empty entry says nothing worth
 * keeping). A key is never resurrected FROM `obsolete`: a reworded string is a
 * new string, and the report has to say so until someone confirms the old
 * translation still fits.
 */
export function reconcileLanguage(file, found, { prune = false } = {}) {
  const previous = { ...(file.messages ?? {}) }
  const messages = {}
  for (const [key, value] of Object.entries(previous)) {
    if (isMetadataKey(key)) messages[key] = value
  }
  for (const key of found.keys()) messages[key] = previous[key] ?? ''

  const obsolete = { ...(file.obsolete ?? {}) }
  for (const [key, value] of Object.entries(previous)) {
    if (key in messages || !value) continue
    obsolete[key] = value
  }

  const out = { locale: file.locale }
  if (file.name) out.name = file.name
  out.messages = sortedObject(messages)
  if (!prune && Object.keys(obsolete).length > 0) out.obsolete = sortedObject(obsolete)
  return out
}

/** Two-space JSON with a trailing newline and LF endings, so a rerun is a no-op. */
export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** The reconciled index and every reconciled language, computed without writing anything. */
export function extract({ prune = false, dir = LOCALES_DIR, files } = {}) {
  const found = collectMessages(files)
  const previous = readIndex(dir)
  const index = reconcileIndex(previous, found)
  const unseen = [...found.keys()].filter((key) => !(key in (previous.messages ?? {})))
  const languages = languageFiles(dir).map(({ code, path }) => ({
    code,
    path,
    file: reconcileLanguage(readJson(path), found, { prune }),
  }))
  return { index, languages, found, unseen }
}

function writeIfChanged(path, contents) {
  let existing = null
  try {
    existing = readFileSync(path, 'utf8')
  } catch {
    /* new file */
  }
  if (existing === contents) return false
  writeFileSync(path, contents)
  return true
}

function main(argv) {
  const prune = argv.includes('--prune')
  const { index, languages, found, unseen } = extract({ prune })

  const written = []
  if (writeIfChanged(indexPath(), serialize(index))) written.push(originOf(indexPath()))
  for (const language of languages) {
    if (writeIfChanged(language.path, serialize(language.file))) written.push(originOf(language.path))
  }

  const total = Object.keys(index.messages).length
  console.log(`i18n: ${found.size} code message(s) in src/, ${total} key(s) in the index`)
  if (unseen.length > 0) {
    // Not a failure: a string no test has rendered is a test gap, and the scan
    // just found it. Listed so somebody can decide whether to cover it.
    console.log(`i18n: ${unseen.length} code message(s) discovery had never seen — a test gap, not an i18n gap:`)
    for (const key of unseen) console.log(`  ${JSON.stringify(key)}`)
  }
  console.log(written.length === 0 ? 'i18n: no changes' : `i18n: wrote ${written.join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof ExtractionError ? err.message : err)
    process.exitCode = 1
  }
}
