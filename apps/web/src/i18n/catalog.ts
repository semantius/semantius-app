/**
 * Catalog shape, message ids, and the record of what is translated.
 *
 * There is ONE JSON shape for every place a translation can live — the repo
 * catalog, an operator's deployment file, the tenant's rows exported as a file
 * and the translate-mode export. Which sections a file may carry depends on
 * where it lives: a repo catalog carries `messages`, `contexts` and `obsolete`
 * only (`labels`, `server` and `rule` are tenant or deployment data, and
 * `src/test/i18nCatalogs.test.ts` rejects them here), while a deployment file
 * and the tenant rows carry the rest.
 *
 * Nothing in this module imports anything — not Lingui, not the layer store, not
 * `import.meta.glob`. It is the leaf every other i18n file builds on, so the id
 * scheme and the file shape can be used (and unit-tested) without starting the
 * runtime. Call sites still import from the `@/i18n` barrel, which is the
 * documented public API; this module is where the definitions live, not a second
 * front door.
 */

/** The source language. Its "catalog" is the English text in the code itself. */
export const SOURCE_LANGUAGE = 'en-US'

/**
 * The gettext context separator (U+0004, END OF TRANSMISSION). A message with a
 * context is stored under `message + U+0004 + context` so that two identically
 * worded strings with different meanings ("Right" the direction, "Right" the
 * correctness) are separate entries. Nobody ever types this id: `msg()` and
 * `messageId()` build it, and the catalog files spell the two parts out.
 */
export const CONTEXT_SEPARATOR = '\u0004'

/**
 * A message plus the metadata a translator needs. `msg()` returns one, so a
 * constant declared for later rendering is an OBJECT — passing it straight into
 * JSX is a `tsc` error rather than a silently untranslated English string.
 */
export interface MessageDescriptor {
  message: string
  /** Disambiguates two identical source strings with different meanings. */
  context?: string
  /** A note for the translator. Extracted into the index, never rendered. */
  comment?: string
}

/** Declare a message for later rendering with `t()` / `translate()`. */
export function msg(message: string, options: Omit<MessageDescriptor, 'message'> = {}): MessageDescriptor {
  return { message, ...options }
}

/** The runtime id of a message: the source text, plus its context when it has one. */
export function messageId(message: string | MessageDescriptor): string {
  if (typeof message === 'string') return message
  return message.context ? `${message.message}${CONTEXT_SEPARATOR}${message.context}` : message.message
}

/** Split a runtime id back into its message and context. */
export function splitMessageId(id: string): { message: string; context?: string } {
  const at = id.indexOf(CONTEXT_SEPARATOR)
  if (at === -1) return { message: id }
  return { message: id.slice(0, at), context: id.slice(at + CONTEXT_SEPARATOR.length) }
}

/** A `messages`-shaped section: source text (or label key) to translation. */
export type TranslationMap = Record<string, string>

/** One locale file, in the single shape every layer speaks. */
export interface LocaleFile {
  locale: string
  /** The language's own name for itself. Wins over `Intl.DisplayNames`. */
  name?: string
  messages?: TranslationMap
  contexts?: Record<string, TranslationMap>
  /** Model-label overrides — deployment files and tenant rows only (P4). */
  labels?: Record<string, unknown>
  /** Backend/PostgREST messages — deployment files and tenant rows only (P4). */
  server?: TranslationMap
  /** Model rule messages — deployment files and tenant rows only (P4). */
  rule?: TranslationMap
  /** Entries whose source string no longer exists. Repo catalogs only. */
  obsolete?: {
    messages?: TranslationMap
    contexts?: Record<string, TranslationMap>
  }
}

/**
 * Flatten a file's `messages` and `contexts` into runtime ids.
 *
 * EMPTY VALUES ARE DROPPED, and that is load-bearing: an empty string is how a
 * catalog spells "not translated yet", but a catalog entry present with an empty
 * value would make the fallback to the source text depend on Lingui's own
 * truthiness check rather than on us. Absent means absent.
 */
export function flattenMessages(file: LocaleFile): TranslationMap {
  const out: TranslationMap = {}
  for (const [message, translation] of Object.entries(file.messages ?? {})) {
    if (translation) out[message] = translation
  }
  for (const [context, entries] of Object.entries(file.contexts ?? {})) {
    for (const [message, translation] of Object.entries(entries)) {
      if (translation) out[`${message}${CONTEXT_SEPARATOR}${context}`] = translation
    }
  }
  return out
}

// ── What is translated, for the whole active language ────────────────────────
//
// Module state rather than a value threaded through the tree: it is read by
// `translatedKeys()` (translate mode's "missing" marking, P5) from outside
// React as well as inside it, and it changes exactly when a locale is
// activated. `activateLocale()` is the only writer.

let activeLanguage = SOURCE_LANGUAGE
let activeKeys: ReadonlySet<string> = new Set()

/** Record the merged layer result for `language`. Called by `activateLocale`. */
export function setCatalogState(language: string, messages: TranslationMap): void {
  activeLanguage = language
  activeKeys = new Set(Object.keys(messages))
}

/**
 * The ids that have a non-empty translation in `language`.
 *
 * Answers an empty set for any language that is not the active one — the layers
 * of an inactive language are not loaded, so there is nothing truthful to say
 * about it. The source language is never "missing" anything, which is why
 * translate mode offers overrides there instead of marking.
 */
export function translatedKeys(language: string): ReadonlySet<string> {
  return language === activeLanguage ? activeKeys : new Set()
}
