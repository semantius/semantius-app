#!/usr/bin/env node
/**
 * Everything one language still needs, in one file for a translator to fill in.
 *
 *   pnpm --filter @semantius/frontend i18n:translate -- --locale de-DE
 *   # …an agent fills in the `translation` fields…
 *   pnpm --filter @semantius/frontend i18n:import -- --locale de-DE
 *
 * The work is the index minus what the language already has: every key in
 * `public/locales/en-US.json` — a code string and a model label alike, put
 * there by the running app — with no non-empty value in
 * `public/locales/<locale>.json`. With `--target <url>` the target's record is
 * consulted too, so a key already translated there is not asked for again.
 *
 * The output is `apps/web/.i18n/work-<locale>.json` (git-ignored), described by
 * `public/locales/work.schema.json`. Every entry carries its English source and
 * the ICU placeholders it has to keep, because a translation made without
 * either is a guess.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LOCALES_DIR, languageFiles, placeholdersOf, readIndex, readJson, SOURCE_LANGUAGE } from './extract.mjs'
import { argValue, connectTarget, readRecord, TARGET_ABSENT_MESSAGE } from './tenant.mjs'

/** Git-ignored scratch space for the work files these scripts produce. */
export const WORK_DIR = join(LOCALES_DIR, '..', '..', '.i18n')

export function workFilePath(locale) {
  return join(WORK_DIR, `work-${locale}.json`)
}

/** The language file for `locale`, or an empty one when the language is new. */
export function readLanguageFile(locale) {
  const found = languageFiles().find((entry) => entry.code === locale)
  return found ? readJson(found.path) : { locale }
}

function safePlaceholders(source) {
  try {
    return placeholdersOf(source)
  } catch {
    return []
  }
}

/**
 * Build the work file.
 *
 * Pure apart from its arguments, so the shape is testable without a target.
 * `record` is the target's record, when one was read.
 */
export function buildWorkFile(locale, { index, file, record = {} }) {
  const messages = file.messages ?? {}
  const entries = []
  for (const [key, source] of Object.entries(index.messages ?? {})) {
    if (messages[key] || record[key]) continue
    entries.push({ key, source, translation: '', placeholders: safePlaceholders(source) })
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
      `translate: ${SOURCE_LANGUAGE} is the SOURCE language — its "translations" are the English in the code and ` +
        'the model. A prod target keeps overrides for it; there is nothing to fill in here.',
    )
    process.exit(1)
  }

  const index = readIndex()
  const file = readLanguageFile(locale)

  let record = {}
  if (argValue(argv, '--target') !== undefined) {
    const conn = await connectTarget(argv)
    const read = await readRecord(conn, locale)
    if (read.absent) console.log(TARGET_ABSENT_MESSAGE)
    record = read.record ?? {}
  }

  const work = buildWorkFile(locale, { index, file, record })
  const out = workFilePath(locale)
  mkdirSync(WORK_DIR, { recursive: true })
  writeFileSync(out, JSON.stringify(work, null, 2) + '\n', 'utf8')

  console.log(`${locale}  ${work.entries.length} outstanding`)
  console.log(`translate: wrote ${out}`)
  if (work.entries.length > 0) {
    console.log('           fill in every `translation`, keeping the `placeholders` exactly,')
    console.log(`           then \`i18n:import -- --locale ${locale}\`. See scripts/i18n/TRANSLATION-GUIDE.md.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`translate: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
