#!/usr/bin/env node
/**
 * Take a whole language out of the tenant as a locale file.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE \
 *     --out apps/web/public/locales/de-DE.json
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE \
 *     --messages-into apps/web/src/locales/de-DE.json
 *
 * Two uses, both real:
 *
 *   a BACKUP or a HANDOVER — a tenant's translations as a file an operator can
 *   ship with their deployment, or a customer can keep;
 *
 *   --messages-into, THE ONE PATH BACK INTO THE REPO. A code string translated
 *   in the app (translate mode, or by an agent through import.mjs) exists only
 *   in that tenant until someone copies it into `src/locales/<locale>.json` for
 *   review in a PR. This is that copy, and it fills only EMPTY entries: a value
 *   already in the catalog was reviewed once and a tenant's row does not get to
 *   overwrite it.
 *
 * `labels`, `server` and `rule` are exported to a file but NEVER into the repo
 * catalog — they are tenant data, and the catalog test rejects them there.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LOCALES_DIR, readJson, serialize } from './extract.mjs'
import { rowsToLocaleFiles } from './localeFile.mjs'
import { argValue, connectTenant, readAll, TABLE_ABSENT_MESSAGE, TRANSLATIONS_TABLE } from './tenant.mjs'

/**
 * Copy a tenant's message translations into the repo catalog's EMPTY entries.
 * Answers how many landed.
 */
export function fillEmptyMessages(catalog, file) {
  let filled = 0
  for (const [message, translation] of Object.entries(file.messages ?? {})) {
    if (!translation) continue
    const section = (catalog.messages ??= {})
    // Only where the catalog says "not translated yet". An entry with a value
    // was reviewed in a PR; this is not a review.
    if (message in section && !section[message]) {
      section[message] = translation
      filled++
    }
  }
  for (const [context, entries] of Object.entries(file.contexts ?? {})) {
    for (const [message, translation] of Object.entries(entries)) {
      if (!translation) continue
      const bucket = catalog.contexts?.[context]
      if (bucket && message in bucket && !bucket[message]) {
        bucket[message] = translation
        filled++
      }
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

  const conn = await connectTenant(argv)
  const { rows, absent } = await readAll(
    conn,
    TRANSLATIONS_TABLE,
    `select=locale,scope,key,context,translation&locale=eq.${encodeURIComponent(locale)}&translation=neq.` +
      '&order=scope.asc,key.asc',
  )
  if (absent) {
    console.log(TABLE_ABSENT_MESSAGE)
    process.exitCode = 1
    return
  }

  const file = rowsToLocaleFiles(rows).get(locale)
  if (!file) {
    console.log(`export: the tenant has no translations for ${locale}.`)
    return
  }

  const counts = {
    messages: Object.keys(file.messages ?? {}).length,
    contexts: Object.values(file.contexts ?? {}).reduce((sum, entries) => sum + Object.keys(entries).length, 0),
    labels: Object.keys(file.labels?.tables ?? {}).length + Object.keys(file.labels?.modules ?? {}).length,
    server: Object.keys(file.server ?? {}).length,
    rule: Object.keys(file.rule ?? {}).length,
  }
  console.log(
    `${locale}  ${rows.length} row(s): ${counts.messages} message(s), ${counts.contexts} with a context, ` +
      `${counts.labels} labeled entit(ies), ${counts.server} server, ${counts.rule} rule`,
  )

  const out = argValue(argv, '--out')
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(file, null, 2) + '\n', 'utf8')
    console.log(`export: wrote ${out}`)
  }

  const into = argValue(argv, '--messages-into') ?? (out ? undefined : join(LOCALES_DIR, `${locale}.json`))
  if (into) {
    if (!existsSync(into)) {
      console.log(`export: ${into} does not exist — nothing to fill.`)
      return
    }
    const catalog = readJson(into)
    const filled = fillEmptyMessages(catalog, file)
    if (filled > 0) {
      writeFileSync(into, serialize(catalog), 'utf8')
      console.log(`export: filled ${filled} empty entr(ies) in ${into} — review them in a PR.`)
    } else {
      console.log(`export: no empty entry in ${into} matched a tenant translation.`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`export: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
