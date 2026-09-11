#!/usr/bin/env node
/**
 * Take a language's record out of a target.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE            # the tenant
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE \
 *     --target https://stage.example.com --out /tmp/de-DE.json
 *
 * Two uses, both real:
 *
 *   --out    a BACKUP or a HANDOVER — the record as a language file an operator
 *            can ship with their deployment, or a customer can keep;
 *
 *   no --out THE ONE PATH BACK INTO THE REPO. A string translated on a stage
 *            host, or as a tenant's override, exists only there until someone
 *            copies it into `i18n/<locale>.json` for review in a PR.
 *            This is that copy, and it fills only EMPTY entries: a value
 *            already in the file was reviewed once, and a record does not get
 *            to overwrite it.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LOCALES_DIR, serialize } from './extract.mjs'
import { argValue, connectTarget, readRecord, TARGET_ABSENT_MESSAGE } from './tenant.mjs'
import { readLanguageFile } from './translate.mjs'

/** Copy a record's translations into the language file's EMPTY entries. Answers how many landed. */
export function fillEmptyMessages(file, record) {
  let filled = 0
  const messages = (file.messages ??= {})
  for (const [key, translation] of Object.entries(record)) {
    if (!translation) continue
    // Only where the file says "not translated yet". An entry with a value was
    // reviewed in a PR; this is not a review. A key the file does not know is
    // not invented either: the index is what says what exists.
    if (key in messages && !messages[key]) {
      messages[key] = translation
      filled++
    }
  }
  return filled
}

async function main(argv) {
  const locale = argValue(argv, '--locale')
  if (!locale) {
    console.error('export: --locale is required, e.g. --locale de-DE')
    process.exit(1)
  }

  const conn = await connectTarget(argv)
  const { record, absent } = await readRecord(conn, locale)
  if (absent || !record) {
    console.log(TARGET_ABSENT_MESSAGE)
    process.exitCode = 1
    return
  }

  const count = Object.values(record).filter(Boolean).length
  console.log(`${locale}  ${count} translated message(s) in the record at ${conn.baseUrl}`)

  const out = argValue(argv, '--out')
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, serialize({ locale, messages: record }), 'utf8')
    console.log(`export: wrote ${out}`)
    return
  }

  const file = readLanguageFile(locale)
  const filled = fillEmptyMessages(file, record)
  if (filled > 0) {
    writeFileSync(join(LOCALES_DIR, `${locale}.json`), serialize(file), 'utf8')
    console.log(`export: filled ${filled} empty entr(ies) in i18n/${locale}.json — review them in a PR.`)
  } else {
    console.log(`export: no empty entry in i18n/${locale}.json matched the record.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`export: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
