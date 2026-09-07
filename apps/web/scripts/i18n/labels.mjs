#!/usr/bin/env node
/**
 * What the MODEL still needs translated, and a skeleton to fill in.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/labels.mjs --locale de-DE
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/labels.mjs --locale fr-FR \
 *     --file apps/web/public/locales/fr-FR.json
 *
 * Table, column, enum and module labels are DATA — rows in `tables`, `fields`
 * and `modules` — so no extractor can see them and `i18n:status` can never
 * report them. This is their discovery path: read the model, diff it against
 * whatever translations exist, print the missing and the orphaned, and write a
 * skeleton with the English text in place and every translation empty.
 *
 * WHERE THE TRANSLATIONS COME FROM depends on the deployment. With `--file` the
 * comparison is against that locale file (an operator's deployment file); with
 * no `--file` it is against the tenant's `ui_translations` rows. Both are the
 * same shape, because everything in this feature is.
 *
 * RUN IT AFTER ANY MODEL CHANGE. An agent that has just created an entity or a
 * field has produced English labels no catalog knows about; this is the step
 * that turns them into work.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readJson, SRC_DIR } from './extract.mjs'
import { buildLabelInventory, diffLabelInventory } from './labelInventory.mjs'
import { readModel } from './model.mjs'
import { applyRowToFile, emptyLocaleFile, localeFileToRows } from './localeFile.mjs'
import { argValue, connectTenant, readAll, TABLE_ABSENT_MESSAGE, TRANSLATIONS_TABLE } from './tenant.mjs'

/** Git-ignored scratch space for the work files these scripts produce. */
export const WORK_DIR = join(SRC_DIR, '..', '.i18n')

/** Flatten a locale file's `labels` section into the `scope:key` map. */
export function labelsOfFile(file) {
  const out = {}
  for (const row of localeFileToRows(file)) {
    if (!['table', 'column', 'enum', 'module'].includes(row.scope)) continue
    if (row.translation) out[`${row.scope}:${row.key}`] = row.translation
  }
  return out
}

/** Fold inventory entries into a locale file's `labels` section. */
function skeletonFor(locale, entries, existing) {
  const file = existing ?? emptyLocaleFile(locale)
  file.locale = locale
  for (const entry of entries) {
    applyRowToFile(file, { locale, scope: entry.scope, key: entry.key, context: '', translation: '' })
  }
  return file
}

async function main(argv) {
  const locale = argValue(argv, '--locale')
  if (!locale) {
    console.error('labels: --locale is required, e.g. --locale de-DE')
    process.exit(1)
  }
  const filePath = argValue(argv, '--file')

  const conn = await connectTenant(argv)
  const model = await readModel(conn)
  const inventory = buildLabelInventory(model)

  let labels = {}
  let existingFile
  if (filePath) {
    try {
      existingFile = readJson(filePath)
      labels = labelsOfFile(existingFile)
    } catch {
      console.log(`labels: ${filePath} does not exist yet — writing a fresh skeleton.`)
    }
  } else {
    const { rows, absent } = await readAll(
      conn,
      TRANSLATIONS_TABLE,
      `select=locale,scope,key,context,translation&locale=eq.${encodeURIComponent(locale)}&translation=neq.`,
    )
    if (absent) {
      console.log(TABLE_ABSENT_MESSAGE)
      console.log('labels: comparing against nothing — every label below is missing.')
    } else {
      for (const row of rows) labels[`${row.scope}:${row.key}`] = row.translation
    }
  }

  const { missing, translated, orphaned } = diffLabelInventory(inventory, labels)

  console.log(
    `${locale}  ${inventory.length} model label(s), ${translated.length} translated, ` +
      `${missing.length} missing, ${orphaned.length} orphaned`,
  )
  for (const entry of missing) {
    console.log(`  missing:  ${entry.scope}:${entry.key}  ${JSON.stringify(entry.source)}`)
  }
  for (const entry of orphaned) {
    // Reported, never pruned: whether a renamed table's translation is worth
    // moving or deleting is a translator's call, not this script's.
    console.log(`  orphaned: ${entry.scope}:${entry.key}  ${JSON.stringify(entry.translation)}`)
  }

  const out = filePath ?? join(WORK_DIR, `labels-${locale}.json`)
  const file = skeletonFor(locale, missing, existingFile)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n', 'utf8')
  console.log(`labels: skeleton written to ${out}`)
  console.log('        fill in the empty values, then `import.mjs --locale ' + locale + '` (tenant)')
  console.log('        or ship the file as the deployment locale file (operator).')
}

// Only when RUN, so a test or another script can import the helpers above.
// `pathToFileURL` rather than string surgery: on Windows `process.argv[1]` is a
// backslash path and `import.meta.url` is a file URL, and comparing them by hand
// silently never matches (see extract.mjs, same guard).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`labels: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
