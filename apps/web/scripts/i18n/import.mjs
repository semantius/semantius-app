#!/usr/bin/env node
/**
 * Write a filled-in work file back: rows on the tenant, code strings in the repo.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale de-DE
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale fr-FR \
 *     --file apps/web/public/locales/fr-FR.json      # a locale FILE, not a work file
 *
 * IT REFUSES THE WHOLE FILE ON ANY FAILURE, and that is the point. A translation
 * that drops an ICU placeholder loses data on screen; one that invents a
 * placeholder renders literal braces; one that does not compile makes Lingui
 * warn on every render and fall back to English. None of those are visible in a
 * diff of a thousand-entry JSON, and all of them are cheap to catch here.
 * `server` and `rule` text is exempt from the compile check, because it is
 * looked up VERBATIM and never ICU-compiled — a backend message may legitimately
 * contain braces.
 *
 * WHERE EACH SCOPE GOES:
 *
 *   message   BOTH — the repo catalog (so the next build ships it) and a tenant
 *             row (so the tenant is translated before that build is deployed).
 *             For a language with no repo catalog, rows only.
 *   labels    rows only. Model labels are tenant data; a repo catalog that
 *             carried them would ship one tenant's model to every deployment.
 *   server /  rows only, same reason.
 *   rule
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv from 'ajv'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'
import { CONTEXT_SEPARATOR, LOCALES_DIR, placeholdersOf, readJson, serialize } from './extract.mjs'
import { localeFileToRows } from './localeFile.mjs'
import { argValue, connectTenant, TABLE_ABSENT_MESSAGE, upsertTranslations } from './tenant.mjs'
import { readRepoCatalog, workFilePath } from './translate.mjs'

const LABEL_SCOPES = ['table', 'column', 'enum', 'module']
/** Looked up verbatim, never compiled — see the header. */
const VERBATIM_SCOPES = ['server', 'rule']

/**
 * The work file's shape, from the schema that ships in the build.
 *
 * Loaded rather than re-described here, so `public/locales/work.schema.json` is
 * load-bearing: a schema nothing validates against drifts from the thing it
 * claims to describe, and an agent reading it would be told a shape the importer
 * does not accept. `strict: false` for the same reason as the locale-file
 * schema — it is written for editors, not for Ajv's linter.
 */
const workSchemaPath = join(LOCALES_DIR, '..', '..', 'public', 'locales', 'work.schema.json')
const validateShape = new Ajv({ allErrors: true, strict: false }).compile(readJson(workSchemaPath))

/**
 * Everything wrong with a work file, as a list. ALL of them, not the first:
 * a translator fixing one problem per run is a translator who stops.
 */
export function validateWork(work) {
  const problems = []
  if (!work || typeof work !== 'object') return ['not a JSON object']
  if (!validateShape(work)) {
    // The shape first: an unknown key or a misspelled scope would otherwise be
    // ignored in silence, and a whole section of translations would go nowhere.
    for (const error of validateShape.errors ?? []) {
      problems.push(`${error.instancePath || '(root)'} ${error.message}`)
    }
  }
  if (!work.locale) problems.push('missing "locale"')
  if (!work.entries || typeof work.entries !== 'object') return [...problems, 'missing "entries"']

  for (const [scope, entries] of Object.entries(work.entries)) {
    if (!Array.isArray(entries)) {
      problems.push(`entries.${scope} is not an array`)
      continue
    }
    entries.forEach((entry, i) => {
      const at = `entries.${scope}[${i}]`
      if (typeof entry?.key !== 'string' || entry.key === '') problems.push(`${at}: missing "key"`)
      if (typeof entry?.translation !== 'string') problems.push(`${at}: "translation" must be a string`)
      const translation = entry?.translation
      if (!translation) return

      if (!VERBATIM_SCOPES.includes(scope)) {
        try {
          compileMessageOrThrow(translation)
        } catch (err) {
          problems.push(`${at} (${entry.key}): does not compile as ICU — ${err.message}`)
          return
        }
      }
      if (scope === 'message') {
        const wanted = [...(entry.placeholders ?? [])].sort()
        const got = placeholdersOf(translation).sort()
        if (wanted.join('|') !== got.join('|')) {
          problems.push(
            `${at} (${entry.key}): placeholders are [${got}] but the source has [${wanted}]`,
          )
        }
      }
    })
  }
  return problems
}

/** The filled entries as `ui_translations` rows. */
export function workToRows(work) {
  const rows = []
  for (const [scope, entries] of Object.entries(work.entries ?? {})) {
    for (const entry of entries) {
      if (!entry.translation) continue
      rows.push({
        locale: work.locale,
        scope,
        key: entry.key,
        context: entry.context ?? '',
        translation: entry.translation,
      })
    }
  }
  return rows
}

/**
 * Merge the `message` entries into the repo catalog, IN PLACE of empty values.
 *
 * A non-empty existing value is never overwritten: the shipped translation was
 * reviewed in a PR, and a work file is not a review. Returns how many landed.
 */
export function mergeIntoCatalog(catalog, work) {
  let written = 0
  for (const entry of work.entries?.message ?? []) {
    if (!entry.translation) continue
    if (entry.context) {
      const section = (catalog.contexts ??= {})
      const bucket = (section[entry.context] ??= {})
      if (!bucket[entry.key]) {
        bucket[entry.key] = entry.translation
        written++
      }
    } else {
      const section = (catalog.messages ??= {})
      if (!section[entry.key]) {
        section[entry.key] = entry.translation
        written++
      }
    }
  }
  return written
}

/** Turn a plain LOCALE file into work-file shape, so one path validates both. */
function workFromLocaleFile(file) {
  const entries = {}
  for (const row of localeFileToRows(file)) {
    if (!row.translation) continue
    ;(entries[row.scope] ??= []).push({
      key: row.key,
      ...(row.context ? { context: row.context } : {}),
      source: row.key,
      translation: row.translation,
    })
  }
  return { locale: file.locale, entries }
}

async function main(argv) {
  const locale = argValue(argv, '--locale')
  if (!locale) {
    console.error('import: --locale is required, e.g. --locale de-DE')
    process.exit(1)
  }
  const explicit = argValue(argv, '--file')
  const path = explicit ?? workFilePath(locale)
  if (!existsSync(path)) {
    console.error(`import: ${path} does not exist. Run translate.mjs --locale ${locale} first.`)
    process.exit(1)
  }

  const raw = readJson(path)
  // A locale file and a work file are told apart by shape, not by a flag: an
  // operator hands us the file they already maintain, an agent hands us the one
  // translate.mjs produced.
  const work = raw.entries ? raw : workFromLocaleFile({ ...raw, locale: raw.locale ?? locale })
  if (work.locale && work.locale !== locale) {
    console.error(`import: ${path} is for ${work.locale}, not ${locale}.`)
    process.exit(1)
  }
  work.locale = locale

  const problems = validateWork(work)
  if (problems.length > 0) {
    console.error(`import: ${path} was REJECTED — nothing was written.`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }

  const rows = workToRows(work)
  if (rows.length === 0) {
    console.log(`import: nothing filled in yet in ${path}.`)
    return
  }

  const conn = await connectTenant(argv)
  const { written, absent } = await upsertTranslations(conn, rows)
  if (absent) {
    console.log(TABLE_ABSENT_MESSAGE)
    console.log('import: no rows written; the repo catalog below is still updated.')
  } else {
    const byScope = {}
    for (const row of rows) byScope[row.scope] = (byScope[row.scope] ?? 0) + 1
    console.log(
      `import: wrote ${written} row(s) to the tenant (` +
        Object.entries(byScope)
          .map(([scope, count]) => `${count} ${scope}`)
          .join(', ') +
        ')',
    )
  }

  // The repo half. Only `message`: labels and runtime text are tenant data.
  const catalogPath = join(LOCALES_DIR, `${locale}.json`)
  if (existsSync(catalogPath)) {
    const catalog = readRepoCatalog(locale)
    const merged = mergeIntoCatalog(catalog, work)
    if (merged > 0) {
      writeFileSync(catalogPath, serialize(catalog), 'utf8')
      console.log(`import: filled ${merged} empty entr(ies) in src/locales/${locale}.json — review them in a PR.`)
    } else {
      console.log(`import: src/locales/${locale}.json already answers every message in the file.`)
    }
  } else if ((work.entries?.message ?? []).some((entry) => entry.translation)) {
    console.log(
      `import: ${locale} has no repo catalog, so its code strings live in the tenant only. ` +
        `Add src/locales/${locale}.json to ship them with the build.`,
    )
  }

  // A row someone requested is answered the moment its translation lands, and
  // the upsert above did that in place — `merge-duplicates` overwrites the empty
  // translation on the very same (locale, scope, key, context).
  console.log('import: done. Reload the app to see it; the tenant layer refetches on focus.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`import: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}

export { CONTEXT_SEPARATOR, LABEL_SCOPES }
