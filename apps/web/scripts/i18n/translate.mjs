#!/usr/bin/env node
/**
 * Everything one language still needs, in one file for a translator to fill in.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/translate.mjs --locale de-DE
 *   # …an agent fills in the `translation` fields…
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale de-DE
 *
 * It DRAINS THE QUEUE, and the queue is the union of three discovery paths that
 * would otherwise each need someone to be watching:
 *
 *   catalog gaps      a code string with no `de-DE.json` entry — the extractor
 *                     found it, so it is known before any user meets it
 *   label inventory   a table, column, enum or module label the model carries
 *                     and no translation covers — invisible to any extractor
 *   requested rows    an empty-translation row the running app inserted when it
 *                     met something it could not translate: a PostgREST message,
 *                     a model rule's own wording, a label on a screen someone
 *                     actually opened
 *
 * A `message` already translated in the repo catalog is skipped: the shipped
 * German is the answer, and asking for it again would produce a second one.
 *
 * The output is `apps/web/.i18n/work-<locale>.json` (git-ignored), described by
 * `public/locales/work.schema.json`. Every entry carries its English source and
 * its origin, because a translation made without knowing where the string
 * appears is a guess.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CONTEXT_SEPARATOR, LOCALES_DIR, readJson, SOURCE_LANGUAGE } from './extract.mjs'
import { buildLabelInventory, diffLabelInventory } from './labelInventory.mjs'
import { readModel } from './model.mjs'
import { argValue, connectTenant, readAll, TABLE_ABSENT_MESSAGE, TRANSLATIONS_TABLE } from './tenant.mjs'

/** Git-ignored scratch space for the work files these scripts produce. */
export const WORK_DIR = join(LOCALES_DIR, '..', '..', '.i18n')

export function workFilePath(locale) {
  return join(WORK_DIR, `work-${locale}.json`)
}

/** The repo catalog for `locale`, or an empty one when the language is new. */
export function readRepoCatalog(locale) {
  try {
    return readJson(join(LOCALES_DIR, `${locale}.json`))
  } catch {
    return { locale }
  }
}

/**
 * The runtime id of a message: the source text, and the context after a U+0004
 * ONLY when there is one. Spelling it any other way — a trailing separator for
 * the contextless case, say — silently stops matching the catalog, and the
 * symptom is a translated string being asked for again.
 */
function messageIdOf(message, context) {
  return context ? `${message}${CONTEXT_SEPARATOR}${context}` : message
}

/** `{ id -> translation }` for the repo catalog's messages, empties dropped. */
function repoMessages(catalog) {
  const out = {}
  for (const [message, value] of Object.entries(catalog.messages ?? {})) {
    if (value) out[message] = value
  }
  for (const [context, entries] of Object.entries(catalog.contexts ?? {})) {
    for (const [message, value] of Object.entries(entries)) {
      if (value) out[messageIdOf(message, context)] = value
    }
  }
  return out
}

/**
 * Build the work file.
 *
 * Pure apart from its arguments, so the shape is testable without a tenant.
 */
export function buildWorkFile(locale, { index, catalog, inventory, labels, requests }) {
  const entries = {}
  const push = (scope, entry) => {
    ;(entries[scope] ??= []).push(entry)
  }

  // 1. Code strings the extractor found and the catalog has no answer for.
  const translated = repoMessages(catalog)
  for (const [id, entry] of Object.entries(index.index ?? {})) {
    if (translated[id]) continue
    push('message', {
      key: entry.message,
      context: entry.context ?? '',
      source: entry.message,
      translation: '',
      ...(entry.comment ? { comment: entry.comment } : {}),
      placeholders: entry.placeholders ?? [],
      origin: entry.origin ?? [],
    })
  }

  // 2. Model labels with no override.
  for (const entry of diffLabelInventory(inventory, labels).missing) {
    push(entry.scope, { key: entry.key, source: entry.source, translation: '' })
  }

  // 3. Rows the running app asked for. A `message` row already answered by the
  //    repo catalog is dropped — the shipped translation IS the answer, and the
  //    row disappears when import.mjs writes the catalog back to the tenant.
  const seen = new Set(
    Object.entries(entries).flatMap(([scope, list]) =>
      list.map((entry) => `${scope}:${messageIdOf(entry.key, entry.context)}`),
    ),
  )
  for (const row of requests) {
    if (row.scope === 'message' && translated[messageIdOf(row.key, row.context)]) continue
    if (seen.has(`${row.scope}:${messageIdOf(row.key, row.context)}`)) continue
    push(row.scope, {
      key: row.key,
      ...(row.context ? { context: row.context } : {}),
      source: row.key,
      translation: '',
      ...(row.origin ? { origin: [row.origin] } : {}),
    })
  }

  return { locale, generated: new Date().toISOString(), entries }
}

async function main(argv) {
  const locale = argValue(argv, '--locale')
  if (!locale) {
    console.error('translate: --locale is required, e.g. --locale de-DE')
    process.exit(1)
  }
  if (locale === SOURCE_LANGUAGE) {
    console.error(
      `translate: ${SOURCE_LANGUAGE} is the SOURCE language — its "translations" are the English in the code. ` +
        'Use a tenant row or a deployment file to override a term for English users instead.',
    )
    process.exit(1)
  }

  const conn = await connectTenant(argv)
  const index = readJson(join(LOCALES_DIR, `${SOURCE_LANGUAGE}.json`))
  const catalog = readRepoCatalog(locale)
  const inventory = buildLabelInventory(await readModel(conn))

  const existing = await readAll(
    conn,
    TRANSLATIONS_TABLE,
    `select=locale,scope,key,context,translation,origin&locale=eq.${encodeURIComponent(locale)}`,
  )
  if (existing.absent) console.log(TABLE_ABSENT_MESSAGE)
  const rows = existing.rows ?? []

  const labels = {}
  for (const row of rows) {
    if (row.translation && ['table', 'column', 'enum', 'module'].includes(row.scope)) {
      labels[`${row.scope}:${row.key}`] = row.translation
    }
  }
  const requests = rows.filter((row) => !row.translation)

  const work = buildWorkFile(locale, { index, catalog, inventory, labels, requests })
  const counts = Object.entries(work.entries).map(([scope, list]) => `${list.length} ${scope}`)
  const total = Object.values(work.entries).reduce((sum, list) => sum + list.length, 0)

  const out = workFilePath(locale)
  mkdirSync(WORK_DIR, { recursive: true })
  writeFileSync(out, JSON.stringify(work, null, 2) + '\n', 'utf8')

  console.log(`${locale}  ${total} outstanding (${counts.join(', ') || 'nothing'})`)
  console.log(`translate: wrote ${out}`)
  if (total > 0) {
    console.log('           fill in every `translation`, keeping the `placeholders` exactly,')
    console.log(`           then \`import.mjs --locale ${locale}\`. See src/locales/TRANSLATION-GUIDE.md.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`translate: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
