#!/usr/bin/env node
/**
 * Everything one language still needs, in one file for a translator to fill in.
 *
 *   pnpm i18n:translate -- --locale de-DE
 *   # …an agent fills in the `translation` fields…
 *   pnpm i18n:import -- --locale de-DE
 *
 * The work is the index minus what the language already has: every key in
 * `public/locales/en-US.json` — a code string and a model label alike, put
 * there by the running app — with no non-empty value in
 * `public/locales/<locale>.json`. With `--target <url>` the target's record is
 * consulted too, so a key already translated there is not asked for again.
 *
 * The output is `public/locales/work-<locale>.json`, beside the
 * language file it is about and described by
 * `public/locales/work.schema.json`. Every entry carries its English source,
 * because a translation made without it is a guess. It carries nothing ELSE
 * derived from that source: `import.mjs` reads the ICU placeholders off the
 * source text itself, so there is no field here for a translator to empty and
 * turn the check off with.
 *
 * It also carries `hints`: what every OTHER managed language already says for
 * that key (`MANAGED_LANGUAGES` in `extract.mjs`). English underspecifies —
 * `Order` is an entity in nwind and a sort position in `order_column`, `Title`
 * is a job title on employees and a form of address in `title_of_courtesy` — and
 * a reviewed language has already had to decide. Two sources bracket the
 * meaning; one leaves the translator re-deriving it from the model. Hints are
 * context and nothing else: `import.mjs` never reads them.
 *
 *   pnpm i18n:translate -- --locale fr-FR --create
 *
 * `--create` writes an empty `public/locales/<locale>.json` first, for a
 * language that does not exist yet. It does NOT add it to `MANAGED_LANGUAGES`:
 * a machine-filled language quoted as context to the next one would propagate
 * its mistakes and make them look corroborated. Promote it after review.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isVerbatimKey, LANGUAGE_FILE, LOCALES_DIR, MANAGED_LANGUAGES, languageFiles, readIndex, readJson, serialize, SOURCE_LANGUAGE, unformattableArgument } from './extract.mjs'
import { argValue, connectTarget, readRecord, TARGET_ABSENT_MESSAGE } from './tenant.mjs'

/**
 * Work files sit BESIDE the language files they are about, in
 * `public/locales/`, so `de-DE.json` and `work-de-DE.json` open side by side
 * rather than one of them hiding in a dotfolder.
 *
 * They are COMMITTED. A partly filled work file is somebody's half-finished
 * translation and regenerating it hands back empty strings, so ignoring it
 * loses that work the moment the device changes. No BCP-47 tag matches
 * `work-*.json`, so nothing lists one as a language; and `vite.config.ts`
 * deletes them out of `dist/locales/` after the build, because `public/` is
 * copied wholesale and being in the repo must not mean being deployed.
 */
export const WORK_DIR = LOCALES_DIR

export function workFilePath(locale) {
  return join(WORK_DIR, `work-${locale}.json`)
}

/** The language file for `locale`, or an empty one when the language is new. */
export function readLanguageFile(locale) {
  const found = languageFiles().find((entry) => entry.code === locale)
  return found ? readJson(found.path) : { locale }
}

/**
 * What each managed language says, keyed by its code — minus `locale` itself,
 * which is being translated and cannot be a hint for its own work.
 */
export function readHintLanguages(locale, dir = LOCALES_DIR) {
  const hints = []
  for (const code of MANAGED_LANGUAGES) {
    if (code === locale) continue
    const found = languageFiles(dir).find((entry) => entry.code === code)
    if (!found) continue
    hints.push({ code, messages: readJson(found.path).messages ?? {} })
  }
  return hints
}

/**
 * Build the work file.
 *
 * Pure apart from its arguments, so the shape is testable without a target.
 * `record` is the target's record, when one was read; `hints` is what
 * `readHintLanguages` found; `previous` is the work file already on disk.
 *
 * **A rebuild never discards a filled-in translation.** Regenerating is
 * something you do mid-job — the index grew, a hint language moved on — and a
 * build that started from empty would throw away every entry filled since the
 * last import. So `previous` is carried forward per key, `comment` with it, and
 * `carriedOver` counts what survived. Anything filled whose key is no longer
 * asked for lands in `dropped`, which the CLI prints: it was either imported
 * already (fine) or its key left the index (work about to be lost, and the
 * only warning you get).
 */
export function buildWorkFile(locale, { index, file, record = {}, hints = [], previous } = {}) {
  const messages = file.messages ?? {}
  const held = new Map()
  for (const entry of previous?.entries ?? []) {
    if (entry?.key && entry.translation) held.set(entry.key, entry)
  }

  const entries = []
  for (const [key, source] of Object.entries(index.messages ?? {})) {
    if (messages[key] || record[key]) continue
    const carried = held.get(key)
    held.delete(key)
    const entry = { key, source, translation: carried?.translation ?? '' }
    if (carried?.comment) entry.comment = carried.comment
    // Only what a language actually says. An empty value means "not translated
    // yet", so shipping it as a hint would offer a gap as context and would put
    // an empty object on almost every entry of a young language.
    const found = {}
    for (const hint of hints) {
      const text = hint.messages[key]
      if (typeof text === 'string' && text !== '') found[hint.code] = text
    }
    if (Object.keys(found).length > 0) entry.hints = found
    entries.push(entry)
  }

  // Whatever is still in `held` was filled in and is no longer being asked
  // for. `landed` is the happy case — it reached the language file or the
  // target, which is where a finished translation belongs. `orphaned` is not:
  // the key left the index, so this text has nowhere to go.
  const dropped = { landed: [], orphaned: [] }
  for (const [key] of held) {
    if (messages[key] || record[key]) dropped.landed.push(key)
    else dropped.orphaned.push(key)
  }

  return {
    locale,
    generated: new Date().toISOString(),
    entries,
    carriedOver: entries.filter((entry) => entry.translation).length,
    dropped,
  }
}

/**
 * The entries whose SOURCE cannot be rendered, with what is wrong with each.
 *
 * Handing one to a translator is asking for a translation of a message the app
 * can never show. It also poisons the import: `placeholdersOf` reads the
 * accidental argument off the source and then DEMANDS it of the translation, so
 * a correct sentence is rejected and one that copies the broken text in is
 * accepted. Caught here, at the point the work is handed out, rather than after
 * somebody has translated it.
 *
 * A verbatim key is exempt by definition — model text and plain server
 * sentences are never compiled, so their braces are literal and a JSON shape in
 * a field description is documentation rather than a defect.
 */
export function unrenderableSources(entries) {
  const found = []
  for (const entry of entries) {
    if (isVerbatimKey(entry.key)) continue
    try {
      const bad = unformattableArgument(entry.source)
      if (bad) {
        found.push({
          key: entry.key,
          reason: `"{${bad.name}, ${bad.type}…}" reads as an argument of type "${bad.type}", which has no formatter`,
        })
      }
    } catch (err) {
      found.push({ key: entry.key, reason: `does not compile as ICU — ${err instanceof Error ? err.message : err}` })
    }
  }
  return found
}

/** The language's own name for itself, which is what the account menu shows. */
export function endonymFor(locale) {
  const language = locale.split('-')[0]
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(language)
    return name && name !== language ? name : undefined
  } catch {
    return undefined
  }
}

/**
 * Create `public/locales/<locale>.json` for a language that has none.
 *
 * Nothing else registers a shipped language: `__SHIPPED_LOCALES__` is read off
 * this folder by `vite.config.ts`, so the file IS the registration — and the
 * switcher offers the language from the next build, every key falling back to
 * English until it is filled.
 */
export function createLanguageFile(locale, { name, dir = LOCALES_DIR } = {}) {
  if (!LANGUAGE_FILE.test(`${locale}.json`)) {
    throw new Error(`"${locale}" is not a BCP-47 tag, so no language file can be named after it`)
  }
  const path = join(dir, `${locale}.json`)
  if (existsSync(path)) return { path, created: false }
  const endonym = name ?? endonymFor(locale)
  if (!endonym) {
    throw new Error(`no display name for "${locale}" — pass --name, e.g. --name Français`)
  }
  writeFileSync(path, serialize({ locale, name: endonym, messages: {} }), 'utf8')
  return { path, created: true, name: endonym }
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

  if (argv.includes('--create')) {
    const made = createLanguageFile(locale, { name: argValue(argv, '--name') })
    console.log(
      made.created
        ? `translate: created ${made.path} as "${made.name}"`
        : `translate: ${made.path} already exists, leaving it alone`,
    )
  }

  const index = readIndex()
  const file = readLanguageFile(locale)
  const hints = readHintLanguages(locale)
  const out = workFilePath(locale)
  // What is already there is INPUT. Rebuilding is a mid-job thing to do, and
  // starting from empty would discard everything filled since the last import.
  const previous = existsSync(out) ? readJson(out) : undefined

  let record = {}
  if (argValue(argv, '--target') !== undefined) {
    const conn = await connectTarget(argv)
    const read = await readRecord(conn, locale)
    if (read.absent) console.log(TARGET_ABSENT_MESSAGE)
    record = read.record ?? {}
  }

  const { carriedOver, dropped, ...work } = buildWorkFile(locale, { index, file, record, hints, previous })

  // Refuse to hand out work that cannot be right. Checked BEFORE the write, so
  // a failed run leaves whatever was already in the file untouched.
  const unrenderable = unrenderableSources(work.entries)
  if (unrenderable.length > 0) {
    console.error(
      `translate: ${unrenderable.length} source message(s) cannot be rendered, so nothing was written.\n` +
        'Fix the source, or make the key verbatim if the braces are literal text:',
    )
    for (const { key, reason } of unrenderable) console.error(`  ${key}: ${reason}`)
    process.exit(1)
  }

  mkdirSync(WORK_DIR, { recursive: true })
  writeFileSync(out, serialize(work), 'utf8')

  console.log(`${locale}  ${work.entries.length} outstanding`)
  console.log(`translate: wrote ${out}`)
  if (carriedOver > 0) console.log(`           kept ${carriedOver} translation(s) you had already filled in`)
  if (dropped.landed.length > 0) {
    console.log(`           ${dropped.landed.length} more had been imported since, so they are no longer asked for`)
  }
  if (dropped.orphaned.length > 0) {
    // The one case where rebuilding costs you text: the key is gone from the
    // index, so there is no entry to carry it into. Named, not counted.
    console.warn(
      `translate: ${dropped.orphaned.length} filled translation(s) have no key in the index any more and are NOT in the new file:\n  ` +
        dropped.orphaned.map((key) => JSON.stringify(key)).join('\n  '),
    )
  }
  if (hints.length > 0) {
    const withHints = work.entries.filter((entry) => entry.hints).length
    console.log(`           hints from ${hints.map((h) => h.code).join(', ')} on ${withHints} of them`)
  }
  if (work.entries.length > 0) {
    console.log('           fill in every `translation`, keeping every `{placeholder}` its source uses,')
    console.log(`           then \`i18n:import -- --locale ${locale}\`. See scripts/i18n/TRANSLATION-GUIDE.md.`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((err) => {
    console.error(`translate: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
