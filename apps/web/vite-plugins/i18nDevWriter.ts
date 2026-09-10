import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { TRANSLATIONS_PATH } from './i18nDevWritePath'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The language files. ONE folder: `i18n/<code>.json` at the repository root is
 * what the build emits into `dist/locales/`, what nginx serves in the Docker
 * image from `/usr/share/nginx/html/locales/`, and what this endpoint reads and
 * writes on a developer's machine — there is no `src/locales`.
 *
 * Under Vitest too. The browser project runs against a Vite server built from
 * this same config, so a test that renders the app records what it rendered
 * into these files, and a test that saves writes them: the suite is what
 * fills `en-US.json`, and the file is a committed artifact of that run.
 */
export const LOCALES_DIR = join(HERE, '..', '..', '..', 'i18n')

const SOURCE_LANGUAGE = 'en-US'

/** A language file is named by its BCP-47 tag; `schema.json` and friends are not one. */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

interface LocaleFile {
  locale: string
  name?: string
  messages?: Record<string, string>
  obsolete?: Record<string, string>
}

interface TranslationMessage {
  locale: string
  key: string
  translation: string
}

/** Sort by UTF-16 code unit — never `localeCompare`, which depends on the machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedObject(entries: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(entries).sort(byCodeUnit)) out[key] = entries[key]
  return out
}

function filePathFor(locale: string, dir: string): string {
  return join(dir, `${locale}.json`)
}

/** The file for `locale`, or null when there is none. `dir` is for a test writing a scratch folder. */
export function readLocaleFile(locale: string, dir = LOCALES_DIR): LocaleFile | null {
  const path = filePathFor(locale, dir)
  if (!existsSync(path)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as LocaleFile) : null
  } catch {
    return null
  }
}

/** The record for `locale` — the file's messages, or nothing. */
export function readMessages(locale: string, dir = LOCALES_DIR): Record<string, string> {
  return readLocaleFile(locale, dir)?.messages ?? {}
}

/**
 * The section order `i18n:extract` writes, which is NOT alphabetical: a save
 * has to produce the same bytes the extractor would, or every edit reorders
 * the whole file and the next `i18n:extract` reorders it back. The contents
 * of `messages` and `obsolete` ARE sorted by code unit, which is what the
 * extractor's `sortedObject` does.
 */
export function serializeLocaleFile(file: LocaleFile): string {
  const ordered: LocaleFile = { locale: file.locale }
  if (file.name) ordered.name = file.name
  ordered.messages = sortedObject(file.messages ?? {})
  if (file.obsolete && Object.keys(file.obsolete).length > 0) ordered.obsolete = sortedObject(file.obsolete)
  // Two-space JSON with a trailing newline, exactly as `serialize()` in
  // scripts/i18n/extract.mjs writes it, so a rerun of the extractor is a no-op.
  return `${JSON.stringify(ordered, null, 2)}\n`
}

/**
 * Merge one message into the language's file. The server owns the merge.
 *
 * An EMPTY translation clears the message — and what "cleared" looks like in
 * a file depends on whether the key is work: a key the index (`en-US.json`)
 * knows is kept as an empty entry, which is how a file spells "not translated
 * yet" and what discovery writes; a key the index does not know has nothing
 * to be translated FROM, so its entry is dropped. In the index itself an empty
 * write drops the entry, because an index entry without a source is nothing.
 * That is also what lets a test clean up after a probe string: clear it in
 * the index first, then in the language.
 */
export function applyTranslation(message: TranslationMessage, dir = LOCALES_DIR): { file: string; changed: boolean } {
  const { locale, key, translation } = message
  if (!LANGUAGE_TAG.test(locale)) throw new Error(`"${locale}" is not a language tag`)
  if (!key) throw new Error('key is required')

  const file = readLocaleFile(locale, dir) ?? { locale }
  const messages = { ...(file.messages ?? {}) }
  if (translation === '') {
    const known = locale !== SOURCE_LANGUAGE && key in readMessages(SOURCE_LANGUAGE, dir)
    if (known) messages[key] = ''
    else delete messages[key]
  } else {
    messages[key] = translation
  }

  const next = serializeLocaleFile({ ...file, locale, messages })
  const label = `i18n/${locale}.json`
  const path = filePathFor(locale, dir)
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (previous === next) return { file: label, changed: false }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, next, 'utf8')
  return { file: label, changed: true }
}

function send(res: { statusCode: number; setHeader(k: string, v: string): void; end(b?: string): void }, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * The translate endpoint, on a developer's machine.
 *
 * Translate mode and discovery speak ONE contract everywhere
 * (`i18n-endpoint-spec.md`):
 *
 *   GET  /translations?locale=de-DE   -> the language's record, a flat map
 *   POST /translations                { locale, key, translation }
 *
 * In a deployment the app's own API answers it from a per-language record;
 * here the record is the file in `i18n/`, so a correction to a
 * shipped German string lands in `de-DE.json` and goes through a PR instead
 * of becoming an override that shadows the wrong value in one tenant forever.
 *
 * The client cannot tell the difference: same path, same method, same body.
 * Only `VITE_TRANSLATE_API_URL` and `VITE_TRANSLATE_MODE` differ.
 *
 * `apply: 'serve'` — it never exists in a build, so nothing deployed can be
 * written to this way.
 */
export function i18nDevWriter(): Plugin {
  return {
    name: 'semantius:i18n-dev-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(TRANSLATIONS_PATH, (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')

        if (req.method === 'GET') {
          const locale = url.searchParams.get('locale') ?? ''
          if (!LANGUAGE_TAG.test(locale)) {
            send(res, 400, { message: 'locale is required, e.g. ?locale=de-DE' })
            return
          }
          send(res, 200, readMessages(locale))
          return
        }

        if (req.method !== 'POST') {
          send(res, 405, { message: `${req.method} is not supported here` })
          return
        }

        let raw = ''
        req.on('data', (chunk) => {
          raw += chunk
        })
        req.on('end', () => {
          try {
            const parsed: unknown = JSON.parse(raw || '{}')
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('a JSON object is required')
            const message = parsed as Partial<TranslationMessage>
            if (typeof message.locale !== 'string' || typeof message.key !== 'string' || typeof message.translation !== 'string') {
              throw new Error('locale, key and translation are required')
            }
            const { file, changed } = applyTranslation({
              locale: message.locale,
              key: message.key,
              translation: message.translation,
            })
            if (changed) server.config.logger.info(`[i18n] ${message.locale}: wrote ${JSON.stringify(message.key)} to ${file}`)
            send(res, 200, {})
          } catch (err) {
            send(res, 400, { message: err instanceof Error ? err.message : String(err) })
          }
        })
      })
    },
  }
}
