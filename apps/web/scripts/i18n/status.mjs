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
 * The tenant's queue and the model-label inventory join here in P4, behind
 * `--tenant` — that flag needs the repo root's `.env` and so cannot run from a
 * package script.
 */

import { join } from 'node:path'
import {
  CONTEXT_SEPARATOR,
  LOCALES_DIR,
  SOURCE_LANGUAGE,
  catalogFiles,
  readJson,
} from './extract.mjs'

function argValue(argv, flag) {
  const at = argv.indexOf(flag)
  return at === -1 ? undefined : argv[at + 1]
}

function main(argv) {
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
}

main(process.argv.slice(2))
