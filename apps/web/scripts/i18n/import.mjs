#!/usr/bin/env node
/**
 * Write a filled-in work file back: into the language file, and to a target.
 *
 *   pnpm i18n:import -- --locale de-DE
 *   pnpm i18n:import -- --locale fr-FR \
 *     --file some/fr-FR.json                       # a language FILE, not a work file
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale de-DE \
 *     --target https://stage.example.com          # ...and one message at a time to a target
 *
 * IT REFUSES THE WHOLE FILE ON ANY FAILURE, and that is the point. A translation
 * that drops an ICU placeholder loses data on screen; one that invents a
 * placeholder renders literal braces; one that does not compile makes Lingui
 * warn on every render and fall back to English. None of those are visible in a
 * diff of a thousand-entry JSON, and all of them are cheap to catch here. A
 * plain server sentence — keyed by its SQLSTATE — is exempt from the compile
 * check, because it is looked up VERBATIM and may legitimately contain braces.
 *
 * A non-empty value already in the language file is never overwritten: it was
 * reviewed in a PR, and a work file is not a review.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Ajv from 'ajv'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'
import { LOCALES_DIR, placeholdersOf, readJson, serialize } from './extract.mjs'
import { argValue, connectTarget, writeMessage } from './tenant.mjs'
import { readLanguageFile, workFilePath } from './translate.mjs'

/** A SQLSTATE key outside the platform's own classes names a verbatim sentence. */
const VERBATIM_KEY = /^(?!9[09])[0-9A-Z]{5}(\.|$)/

/**
 * The work file's shape, from the schema that ships in the build.
 *
 * Loaded rather than re-described here, so `public/locales/work.schema.json` is
 * load-bearing: a schema nothing validates against drifts from the thing it
 * claims to describe, and an agent reading it would be told a shape the importer
 * does not accept. `strict: false` for the same reason as the locale-file
 * schema — it is written for editors, not for Ajv's linter.
 */
const workSchemaPath = join(LOCALES_DIR, 'work.schema.json')
const validateShape = new Ajv({ allErrors: true, strict: false }).compile(readJson(workSchemaPath))

/**
 * Everything wrong with a work file, as a list. ALL of them, not the first:
 * a translator fixing one problem per run is a translator who stops.
 */
export function validateWork(work) {
  const problems = []
  if (!work || typeof work !== 'object') return ['not a JSON object']
  if (!validateShape(work)) {
    // The shape first: an unknown key would otherwise be ignored in silence,
    // and a whole section of translations would go nowhere.
    for (const error of validateShape.errors ?? []) {
      problems.push(`${error.instancePath || '(root)'} ${error.message}`)
    }
  }
  if (!work.locale) problems.push('missing "locale"')
  if (!Array.isArray(work.entries)) return [...problems, 'missing "entries"']

  work.entries.forEach((entry, i) => {
    const at = `entries[${i}]`
    if (typeof entry?.key !== 'string' || entry.key === '') problems.push(`${at}: missing "key"`)
    if (typeof entry?.translation !== 'string') problems.push(`${at}: "translation" must be a string`)
    const translation = entry?.translation
    if (!translation) return
    if (VERBATIM_KEY.test(entry.key)) return

    try {
      compileMessageOrThrow(translation)
    } catch (err) {
      problems.push(`${at} (${entry.key}): does not compile as ICU — ${err.message}`)
      return
    }
    // Both sides are read off the TEXT. The expectation must never come from a
    // field in this file: the file is what the translator edits, so an entry
    // whose array was emptied or deleted would silently stop being checked —
    // and a dropped placeholder is exactly what that entry then hides.
    let wanted
    try {
      wanted = placeholdersOf(entry.source ?? '').sort()
    } catch (err) {
      problems.push(`${at} (${entry.key}): the source does not compile as ICU — ${err.message}`)
      return
    }
    const got = placeholdersOf(translation).sort()
    if (wanted.join('|') !== got.join('|')) {
      problems.push(`${at} (${entry.key}): placeholders are [${got}] but the source has [${wanted}]`)
    }
  })
  return problems
}

/**
 * Merge the filled entries into the language file, IN PLACE of empty values.
 * Returns how many landed.
 */
export function mergeIntoFile(file, work) {
  let written = 0
  const messages = (file.messages ??= {})
  for (const entry of work.entries ?? []) {
    if (!entry.translation) continue
    if (messages[entry.key]) continue
    messages[entry.key] = entry.translation
    written++
  }
  return written
}

/** Turn a plain LANGUAGE file into work-file shape, so one path validates both. */
function workFromLanguageFile(file) {
  const entries = []
  for (const [key, translation] of Object.entries(file.messages ?? {})) {
    if (!translation) continue
    entries.push({ key, source: key, translation })
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
    console.error(`import: ${path} does not exist. Run i18n:translate -- --locale ${locale} first.`)
    process.exit(1)
  }

  const raw = readJson(path)
  // A language file and a work file are told apart by shape, not by a flag: an
  // operator hands us the file they already maintain, an agent hands us the one
  // translate.mjs produced.
  const work = Array.isArray(raw.entries) ? raw : workFromLanguageFile({ ...raw, locale: raw.locale ?? locale })
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

  const filled = work.entries.filter((entry) => entry.translation)
  if (filled.length === 0) {
    console.log(`import: nothing filled in yet in ${path}.`)
    return
  }

  const file = readLanguageFile(locale)
  const merged = mergeIntoFile(file, work)
  const filePath = join(LOCALES_DIR, `${locale}.json`)
  if (merged > 0) {
    writeFileSync(filePath, serialize(file), 'utf8')
    console.log(`import: filled ${merged} empty entr(ies) in public/locales/${locale}.json — review them in a PR.`)
  } else {
    console.log(`import: public/locales/${locale}.json already answers every entry in the file.`)
  }

  if (argValue(argv, '--target') !== undefined) {
    const conn = await connectTarget(argv)
    let written = 0
    for (const entry of filled) {
      await writeMessage(conn, { locale, key: entry.key, translation: entry.translation })
      written++
    }
    console.log(`import: wrote ${written} message(s) to ${conn.baseUrl}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`import: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
