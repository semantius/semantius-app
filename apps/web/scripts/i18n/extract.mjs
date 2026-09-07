#!/usr/bin/env node
/**
 * Extract every translatable string in `src/` and reconcile the catalogs.
 *
 *   pnpm --filter @semantius/frontend i18n:extract [--prune]
 *
 * WHAT IT PRODUCES
 *   src/locales/en-US.json   the generated INDEX — `{ locale, index }`, one
 *                            entry per runtime id with its source text,
 *                            context, origin files, ICU placeholders and
 *                            translator comment. Committed like
 *                            `routeTree.gen.ts`; never hand-edited, and never
 *                            loaded as a catalog (the repo layer excludes it).
 *   src/locales/<code>.json  each hand-maintained catalog, reconciled: new keys
 *                            appear with `""`, keys whose source string no
 *                            longer exists move to `obsolete`, and an existing
 *                            translation is never touched. `--prune` empties
 *                            `obsolete`.
 *
 * WHY A COMPILER AND NOT A REGEX. The rule that makes the whole scheme work is
 * that the source string IS the key, so a key the extractor cannot see is a
 * string that can never be translated and will never appear in any report. This
 * therefore FAILS — loudly, with file and line — on a first argument it cannot
 * read as a literal: a template with expressions, a conditional, a
 * concatenation. An identifier or a member expression PASSES, because
 * `t(entry.title)` renders a `msg()` descriptor that was extracted at its own
 * declaration site, or an operator's plain string that belongs in a deployment
 * file rather than in this index.
 *
 * `typescript` is already a devDependency here and parses TSX without
 * configuration; `@babel/parser` is not resolvable from `apps/web`.
 *
 * Output is deterministic: keys sorted by code unit (NOT `localeCompare`, which
 * would make the file depend on the machine's locale), origins sorted and
 * de-duplicated, two-space JSON with a trailing newline.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'

/** Mirrors `CONTEXT_SEPARATOR` in `src/i18n/catalog.ts` — the gettext U+0004. */
export const CONTEXT_SEPARATOR = '\u0004'

/** The source language: its catalog is the English in the code, so it is the index. */
export const SOURCE_LANGUAGE = 'en-US'

/** Files in `src/locales/` that are not catalogs. Keep in step with the repo layer's glob. */
export const NON_CATALOG_FILES = new Set(['en-US.json', 'glossary.json'])

/** The functions whose first argument is a message. */
const MESSAGE_CALLEES = new Set(['t', 'translate', 'msg'])

/** Directories under `src/` whose contents are tests, not product code. */
const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__mocks__'])

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SRC_DIR = join(APP_ROOT, 'src')
export const LOCALES_DIR = join(SRC_DIR, 'locales')

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

/** A repo-relative, POSIX-separated path — the form the index records as an origin. */
function originOf(file) {
  return relative(APP_ROOT, file).split('\\').join('/')
}

class ExtractionError extends Error {}

function positionOf(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${line + 1}:${character + 1}`
}

/**
 * Read the message out of a call's first argument.
 *
 * Returns a descriptor, or `null` when the argument is a reference this cannot
 * and should not read (an identifier or a member expression). Pushes a
 * human-readable complaint onto `problems` for every other unreadable form.
 *
 * The list of accepted forms is a WHITELIST, not a set of special cases with a
 * permissive fallthrough. A fallthrough that let anything it did not recognize
 * through would make the whole scheme unsound: `t(getTitle())` and
 * `t(cond && 'Yes')` would vanish from the index in silence, which is precisely
 * the failure this script exists to prevent.
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

  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return { message: arg.text }
  }

  if (ts.isObjectLiteralExpression(arg)) {
    const descriptor = {}
    for (const property of arg.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue
      const key = property.name.text
      if (key !== 'message' && key !== 'context' && key !== 'comment') continue
      const value = property.initializer
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        descriptor[key] = value.text
      } else {
        problems.push(
          `${origin}:${positionOf(sourceFile, value)} — ${what} descriptor "${key}" must be a plain string literal.`,
        )
        return null
      }
    }
    if (!descriptor.message) {
      problems.push(`${origin}:${positionOf(sourceFile, arg)} — ${what} descriptor has no literal "message".`)
      return null
    }
    return descriptor
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
  // `t(entries[i].title)`. Its `msg()` site is extracted where it is declared,
  // and an operator's plain string belongs in a deployment file, not in this
  // index. These are the ONLY references that pass.
  if (ts.isIdentifier(arg) || ts.isPropertyAccessExpression(arg) || ts.isElementAccessExpression(arg)) {
    return null
  }

  problems.push(
    `${origin}:${positionOf(sourceFile, arg)} — ${what} takes an expression this cannot read as a message. ` +
      'Pass a string literal, a { message } object, or a reference to a msg() descriptor.',
  )
  return null
}

/** The `id` (and `comment`) of a `<Trans>` element, or null. */
function readTransAttributes(attributes, sourceFile, origin, problems) {
  const descriptor = {}
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue
    const key = attribute.name.text
    if (key !== 'id' && key !== 'comment') continue
    const initializer = attribute.initializer
    if (!initializer) continue
    let expression = initializer
    if (ts.isJsxExpression(initializer)) {
      if (!initializer.expression) continue
      expression = initializer.expression
    }
    const read = readMessageArgument(expression, sourceFile, origin, problems, `<Trans ${key}>`)
    if (read) descriptor[key === 'id' ? 'message' : 'comment'] = read.message
  }
  return descriptor.message ? descriptor : null
}

/**
 * Every message in `files`, keyed by runtime id, with its origins merged.
 * Throws an ExtractionError naming every unreadable call site.
 */
export function collectMessages(files = sourceFiles()) {
  /** @type {Map<string, { message: string, context?: string, comment?: string, origin: Set<string> }>} */
  const found = new Map()
  const problems = []

  const record = (descriptor, origin) => {
    const id = descriptor.context ? `${descriptor.message}${CONTEXT_SEPARATOR}${descriptor.context}` : descriptor.message
    const existing = found.get(id)
    if (existing) {
      existing.origin.add(origin)
      if (!existing.comment && descriptor.comment) existing.comment = descriptor.comment
      return
    }
    found.set(id, { ...descriptor, origin: new Set([origin]) })
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
        const descriptor = readMessageArgument(
          node.arguments[0],
          sourceFile,
          origin,
          problems,
          `${node.expression.text}()`,
        )
        if (descriptor) record(descriptor, origin)
      } else if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (ts.isIdentifier(node.tagName) && node.tagName.text === 'Trans') {
          const descriptor = readTransAttributes(node.attributes, sourceFile, origin, problems)
          if (descriptor) record(descriptor, origin)
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

/** Every argument name an ICU message interpolates, sorted. */
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

// ── The generated index ─────────────────────────────────────────────────────

/** Sort by UTF-16 code unit — never `localeCompare`, which depends on the machine. */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedObject(entries) {
  const out = {}
  for (const key of Object.keys(entries).sort(byCodeUnit)) out[key] = entries[key]
  return out
}

/** `{ locale, index }` — the shape `src/locales/en-US.json` is written in. */
export function buildIndex(found = collectMessages()) {
  const index = {}
  for (const [id, entry] of found) {
    const record = { message: entry.message }
    if (entry.context) record.context = entry.context
    record.origin = [...entry.origin].sort(byCodeUnit)
    record.placeholders = placeholdersOf(entry.message)
    if (entry.comment) record.comment = entry.comment
    index[id] = record
  }
  return { locale: SOURCE_LANGUAGE, index: sortedObject(index) }
}

// ── Catalog reconciliation ──────────────────────────────────────────────────

/** The catalog files in `src/locales/`, by locale code. */
export function catalogFiles(dir = LOCALES_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !NON_CATALOG_FILES.has(name))
    .sort(byCodeUnit)
    .map((name) => ({ code: name.replace(/\.json$/, ''), path: join(dir, name) }))
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Reconcile one catalog against the index.
 *
 * Existing values are carried over verbatim; a key the index no longer contains
 * moves to `obsolete` if it holds a translation and is dropped if it does not
 * (an empty entry says nothing worth keeping). A key is never resurrected FROM
 * `obsolete`: a reworded string is a new string, and the report has to say so
 * until someone confirms the old translation still fits.
 */
export function reconcileCatalog(catalog, index, { prune = false } = {}) {
  const messages = {}
  const contexts = {}
  const previousMessages = { ...(catalog.messages ?? {}) }
  const previousContexts = catalog.contexts ?? {}

  for (const entry of Object.values(index.index)) {
    if (entry.context) {
      const bucket = (contexts[entry.context] ??= {})
      bucket[entry.message] = previousContexts[entry.context]?.[entry.message] ?? ''
    } else {
      messages[entry.message] = previousMessages[entry.message] ?? ''
    }
  }

  const obsolete = {
    messages: { ...(catalog.obsolete?.messages ?? {}) },
    contexts: structuredClone(catalog.obsolete?.contexts ?? {}),
  }
  for (const [message, translation] of Object.entries(previousMessages)) {
    if (message in messages || !translation) continue
    obsolete.messages[message] = translation
  }
  for (const [context, entries] of Object.entries(previousContexts)) {
    for (const [message, translation] of Object.entries(entries)) {
      if (contexts[context]?.[message] !== undefined || !translation) continue
      ;(obsolete.contexts[context] ??= {})[message] = translation
    }
  }

  const out = { locale: catalog.locale }
  if (catalog.name) out.name = catalog.name
  out.messages = sortedObject(messages)
  if (Object.keys(contexts).length > 0) {
    out.contexts = sortedObject(
      Object.fromEntries(Object.entries(contexts).map(([context, entries]) => [context, sortedObject(entries)])),
    )
  }
  const hasObsolete =
    !prune && (Object.keys(obsolete.messages).length > 0 || Object.keys(obsolete.contexts).length > 0)
  if (hasObsolete) {
    out.obsolete = {}
    if (Object.keys(obsolete.messages).length > 0) out.obsolete.messages = sortedObject(obsolete.messages)
    if (Object.keys(obsolete.contexts).length > 0) {
      out.obsolete.contexts = sortedObject(
        Object.fromEntries(
          Object.entries(obsolete.contexts).map(([context, entries]) => [context, sortedObject(entries)]),
        ),
      )
    }
  }
  return out
}

/** Two-space JSON with a trailing newline and LF endings, so a rerun is a no-op. */
export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** The index and every reconciled catalog, computed without writing anything. */
export function extract({ prune = false } = {}) {
  const index = buildIndex()
  const catalogs = catalogFiles().map(({ code, path }) => ({
    code,
    path,
    file: reconcileCatalog(readJson(path), index, { prune }),
  }))
  return { index, catalogs }
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
  const { index, catalogs } = extract({ prune })

  const indexPath = join(LOCALES_DIR, `${SOURCE_LANGUAGE}.json`)
  const written = []
  if (writeIfChanged(indexPath, serialize(index))) written.push(originOf(indexPath))
  for (const catalog of catalogs) {
    if (writeIfChanged(catalog.path, serialize(catalog.file))) written.push(originOf(catalog.path))
  }

  const total = Object.keys(index.index).length
  console.log(`i18n: ${total} message(s) across ${catalogs.length + 1} locale file(s)`)
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
