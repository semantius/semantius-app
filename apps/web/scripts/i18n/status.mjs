#!/usr/bin/env node
/**
 * What is translated, and what is not.
 *
 *   pnpm --filter @semantius/frontend i18n:status [--locale de-DE] [--verbose]
 *
 * Reads the generated index (`src/locales/en-US.json`) and each repo catalog and
 * prints, per language: how many messages exist, how many are translated, which
 * are missing and where they come from, and how many entries have gone
 * obsolete. It reports rather than fails — a missing translation renders in
 * English, which is a degraded screen and not a broken build.
 *
 * It reads the files on disk, so run `i18n:extract` first if code has changed;
 * `src/test/i18nCatalogs.test.ts` is what notices that they disagree.
 *
 * `--tenant` adds what only the tenant knows: the model-label inventory and the
 * queue of things the running app could not translate. It needs the REPO ROOT's
 * `.env` for the API key, so it cannot run from the package script — run it as
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/status.mjs --tenant --locale de-DE
 */

import { join } from 'node:path'
import {
  CONTEXT_SEPARATOR,
  LOCALES_DIR,
  SOURCE_LANGUAGE,
  catalogFiles,
  readJson,
} from './extract.mjs'
import { buildLabelInventory, diffLabelInventory } from './labelInventory.mjs'
import { readModel } from './model.mjs'
import { argValue, connectTenant, readAll, TABLE_ABSENT_MESSAGE, TRANSLATIONS_TABLE } from './tenant.mjs'

/**
 * What only the tenant knows: how many model labels are covered, and what the
 * running app has asked for and nobody has answered.
 */
async function tenantStatus(argv, locale, verbose) {
  const conn = await connectTenant(argv)
  const inventory = buildLabelInventory(await readModel(conn))

  const { rows, absent } = await readAll(
    conn,
    TRANSLATIONS_TABLE,
    'select=locale,scope,key,context,translation,origin' +
      (locale ? `&locale=eq.${encodeURIComponent(locale)}` : ''),
  )
  if (absent) {
    console.log(TABLE_ABSENT_MESSAGE)
    // Still worth printing: the labels are missing whether or not there is a
    // table to record them in, and that is the number an operator asks for.
    const diff = diffLabelInventory(inventory, {})
    console.log(`model labels  ${inventory.length} total, 0 translated, ${diff.missing.length} missing`)
    return
  }

  const byLocale = new Map()
  for (const row of rows) {
    const bucket = byLocale.get(row.locale) ?? { labels: {}, requested: [], translated: 0 }
    if (row.translation) {
      bucket.translated++
      if (['table', 'column', 'enum', 'module'].includes(row.scope)) {
        bucket.labels[`${row.scope}:${row.key}`] = row.translation
      }
    } else {
      bucket.requested.push(row)
    }
    byLocale.set(row.locale, bucket)
  }
  if (locale && !byLocale.has(locale)) byLocale.set(locale, { labels: {}, requested: [], translated: 0 })

  for (const [code, bucket] of [...byLocale].sort()) {
    const diff = diffLabelInventory(inventory, bucket.labels)
    console.log(
      `${code} (tenant)  ${bucket.translated} translated row(s), ${bucket.requested.length} requested; ` +
        `model labels ${diff.translated.length}/${inventory.length}, ${diff.orphaned.length} orphaned`,
    )
    for (const row of bucket.requested) {
      const where = row.origin ? `  [${row.origin}]` : ''
      console.log(`  requested: ${row.scope}  ${JSON.stringify(row.key)}${where}`)
    }
    if (verbose) {
      for (const entry of diff.orphaned) {
        console.log(`  orphaned:  ${entry.scope}:${entry.key}  ${JSON.stringify(entry.translation)}`)
      }
    }
  }
}

async function main(argv) {
  const only = argValue(argv, '--locale')
  const verbose = argv.includes('--verbose')

  const index = readJson(join(LOCALES_DIR, `${SOURCE_LANGUAGE}.json`)).index
  const ids = Object.keys(index)
  console.log(`${SOURCE_LANGUAGE}  ${ids.length} message(s) in the source language (the index)`)

  const catalogs = catalogFiles().filter(({ code }) => !only || code === only)
  if (catalogs.length === 0) {
    console.log(only ? `no repo catalog for ${only}` : 'no repo catalogs')
    return
  }

  for (const { code, path } of catalogs) {
    const catalog = readJson(path)
    const translations = new Map()
    for (const [message, value] of Object.entries(catalog.messages ?? {})) translations.set(message, value)
    for (const [context, entries] of Object.entries(catalog.contexts ?? {})) {
      for (const [message, value] of Object.entries(entries)) {
        translations.set(`${message}${CONTEXT_SEPARATOR}${context}`, value)
      }
    }

    const missing = ids.filter((id) => !translations.get(id))
    const stale = [...translations.keys()].filter((id) => !(id in index))
    const obsolete =
      Object.keys(catalog.obsolete?.messages ?? {}).length +
      Object.values(catalog.obsolete?.contexts ?? {}).reduce((sum, entries) => sum + Object.keys(entries).length, 0)

    console.log(
      `${code}  ${ids.length} total, ${ids.length - missing.length} translated, ` +
        `${missing.length} missing, ${obsolete} obsolete`,
    )

    if (stale.length > 0) {
      console.log(`  ${stale.length} entr(ies) not in the index — run i18n:extract`)
    }
    for (const id of missing) {
      const entry = index[id]
      const context = entry.context ? ` [${entry.context}]` : ''
      console.log(`  missing: ${JSON.stringify(entry.message)}${context}`)
      if (verbose) console.log(`           ${entry.origin.join(', ')}`)
    }
  }

  if (argv.includes('--tenant')) {
    await tenantStatus(argv, only, verbose)
  }
}

await main(process.argv.slice(2)).catch((err) => {
  console.error(`status: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
