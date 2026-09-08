#!/usr/bin/env node
/**
 * What is translated, and what is not.
 *
 *   pnpm i18n:status [--locale de-DE] [--verbose]
 *
 * Reads the index (`public/locales/en-US.json`) and each language file and
 * prints, per language: how many keys exist, how many are translated, which
 * are missing, and how many entries have gone obsolete. Both kinds are in the
 * index — a code string and a model label alike, put there by the running app
 * — so both are reported, and the count is split by kind. It reports rather
 * than fails: a missing translation renders in English, which is a degraded
 * screen and not a broken build.
 *
 * Entirely offline. The files on disk are what the app ships.
 */

import { isMetadataKey, languageFiles, readIndex, readJson, SOURCE_LANGUAGE } from './extract.mjs'

function argValue(argv, flag) {
  const at = argv.indexOf(flag)
  return at === -1 ? undefined : argv[at + 1]
}

/** Every key the index holds with no non-empty value in `file`. */
export function missingKeys(index, file) {
  const messages = file.messages ?? {}
  return Object.keys(index.messages ?? {}).filter((key) => !messages[key])
}

/** Every key `file` holds that the index does not — a stale entry. */
export function staleKeys(index, file) {
  const known = index.messages ?? {}
  return Object.keys(file.messages ?? {}).filter((key) => !(key in known))
}

function main(argv) {
  const only = argValue(argv, '--locale')
  const verbose = argv.includes('--verbose')

  const index = readIndex()
  const keys = Object.keys(index.messages ?? {})
  const metadataCount = keys.filter(isMetadataKey).length
  console.log(
    `${SOURCE_LANGUAGE}  ${keys.length} key(s) in the index: ${keys.length - metadataCount} code, ${metadataCount} model`,
  )

  const languages = languageFiles().filter(({ code }) => !only || code === only)
  if (languages.length === 0) {
    console.log(only ? `no language file for ${only}` : 'no language files')
    return
  }

  for (const { code, path } of languages) {
    const file = readJson(path)
    const missing = missingKeys(index, file)
    const stale = staleKeys(index, file)
    const obsolete = Object.keys(file.obsolete ?? {}).length
    const missingModel = missing.filter(isMetadataKey).length

    console.log(
      `${code}  ${keys.length} total, ${keys.length - missing.length} translated, ` +
        `${missing.length} missing (${missing.length - missingModel} code, ${missingModel} model), ${obsolete} obsolete`,
    )

    if (stale.length > 0) {
      console.log(`  ${stale.length} entr(ies) not in the index — a reworded string, or a language ahead of the index`)
      if (verbose) for (const key of stale) console.log(`    stale: ${JSON.stringify(key)}`)
    }
    if (verbose) {
      for (const key of missing) {
        const source = index.messages[key]
        console.log(`  missing: ${JSON.stringify(key)}${source !== key ? `  ${JSON.stringify(source)}` : ''}`)
      }
    }
  }
}

main(process.argv.slice(2))
