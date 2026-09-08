/**
 * The rendering core: one lookup for every kind of text.
 *
 * `translate()` is the function behind `t()`. It takes the three call forms
 * (see ./catalog.ts), asks Lingui for the active language's translation and
 * renders the source — the message, or a keyed message's `defaultMessage` —
 * when there is none. `translateVerbatim()` is the one other lookup: a plain
 * server sentence is stored and returned as it is, never ICU-compiled, because
 * PostgreSQL text may legitimately contain braces.
 *
 * Both record what they rendered for translate mode's reverse index while it
 * is on, and both hand the rendered key and its source to the collector while
 * it is on — that is the whole of runtime discovery: the app renders a string,
 * and the string lands in the index.
 *
 * Its own module rather than part of ./index.ts so ./metadata.ts can render
 * model text through it without importing the barrel back.
 */

import { i18n } from '@lingui/core'
import { compileMessageOrThrow, type CompiledMessage } from '@lingui/message-utils/compileMessage'
import { currentMessages, messageId, sourceOf, type MessageDescriptor } from './catalog'
import { isRecordingRenders, recordRender } from './reverseIndex'

export { i18n }

/** Values interpolated into an ICU message. */
export type MessageValues = Record<string, unknown>

/** What `useT()` hands back, and what `translate` is. */
export type TranslateFn = (message: string | MessageDescriptor, values?: MessageValues) => string

// ── Lazy, memoized ICU compilation ──────────────────────────────────────────
//
// Catalogs ship as raw ICU strings, so there is no precompile step and no
// generated runtime index: a string added to code before the next extraction
// still interpolates. Lingui compiles on every `_()` call unless a compiler
// caches, so this one does — a message is parsed once per session.
//
// The catch it also exists for: catalog content is not all ours. An operator's
// file, a record typed into the database, and — since model text is a message —
// the MODEL's own English can hold a pattern that is not ICU. Lingui's own
// `compileMessage` answers a malformed one with a `console.error` on EVERY
// render, and a pattern that compiles but cannot be formatted THROWS at render:
// a field description reading "JSON array of {alias_code, source_domain, …}"
// compiles to an argument named `alias_code` with the format type
// `source_domain`, for which there is no formatter, and the whole route went to
// the error page over one description. Here both cases are one warning per
// session and the source text rendered instead, so no catalog or model content
// can break a screen.

const compiledCache = new Map<string, CompiledMessage>()
let warnedAboutCompileFailure = false

/** The argument types Lingui can format. Anything else throws at render. */
const FORMAT_TYPES = new Set(['plural', 'select', 'selectordinal', 'number', 'date', 'time'])

/** Whether every argument in a compiled message names a type Lingui can format. */
function formattable(tokens: readonly unknown[]): boolean {
  for (const token of tokens) {
    if (typeof token === 'string' || !Array.isArray(token)) continue
    const [, type, format] = token as [string, string?, unknown?]
    if (type !== undefined && !FORMAT_TYPES.has(type)) return false
    if (format && typeof format === 'object' && !Array.isArray(format)) {
      for (const [key, branch] of Object.entries(format as Record<string, unknown>)) {
        if (key === 'offset' || !Array.isArray(branch)) continue
        if (!formattable(branch)) return false
      }
    }
  }
  return true
}

function warnOnce(message: string, error: unknown): void {
  if (warnedAboutCompileFailure) return
  warnedAboutCompileFailure = true
  console.warn('[i18n] a message could not be compiled; showing it verbatim', { message, error })
}

i18n.setMessagesCompiler((message: string): CompiledMessage => {
  const hit = compiledCache.get(message)
  if (hit) return hit
  let compiled: CompiledMessage
  try {
    compiled = compileMessageOrThrow(message)
    if (!formattable(Array.isArray(compiled) ? compiled : [compiled])) {
      warnOnce(message, 'an argument names a format type Lingui cannot render')
      compiled = [message]
    }
  } catch (err) {
    warnOnce(message, err)
    // A single literal token: the message renders as written, uninterpolated.
    compiled = [message]
  }
  compiledCache.set(message, compiled)
  return compiled
})

// ── Discovery's hook ────────────────────────────────────────────────────────
//
// An injection rather than an import so this module keeps no dependency on the
// collector: `translate` is called from route loaders and from tests where
// nothing should ever reach the network, and a module-level import would make
// the collector's presence a property of the import graph rather than of the
// app's own setup. Installed by ./missing.ts.

type RenderReporter = (id: string, source: string) => void
let reportRender: RenderReporter | undefined

export function setRenderReporter(reporter: RenderReporter | undefined): void {
  reportRender = reporter
}

// ── Translating ─────────────────────────────────────────────────────────────

/**
 * Translate outside React. `t()` is the same function; see ./index.ts for why
 * they have different names.
 *
 * An empty source is answered with an empty string and nothing else happens:
 * a model attribute the model left blank is not a message, and minting a key
 * for it would put an empty source in front of a translator.
 */
export const translate: TranslateFn = (message, values) => {
  const source = sourceOf(message)
  if (!source) return ''
  const id = messageId(message)
  // The source is the fallback when the catalog has no entry — for a keyed
  // message the id is not readable text on its own.
  let rendered: string
  try {
    rendered = i18n._(id, values, { message: source })
  } catch (err) {
    // The compiler above keeps out what it can foresee; this keeps the rest
    // out. A message that cannot be rendered is shown as its source, not as a
    // crashed screen.
    warnOnce(source, err)
    rendered = source
  }
  // Translate mode's reverse index — one boolean check per call while it is
  // off, a map write while somebody is translating. The VALUES go with it: a
  // sentence built from a model label ("Add {label}") renders as one text node,
  // and without them the label inside it is unreachable. See ./reverseIndex.ts.
  if (isRecordingRenders()) recordRender(rendered, id, source, values)
  reportRender?.(id, source)
  return rendered
}

/**
 * A plain server sentence, looked up VERBATIM under `key` and returned as it
 * arrived when there is no entry. Never ICU-compiled: a PostgreSQL message may
 * legitimately contain braces, and running it through the compiler would
 * either throw or silently eat them.
 */
export function translateVerbatim(key: string, text: string): string {
  if (!text) return text
  const hit = currentMessages()[key]
  const rendered = hit || text
  if (isRecordingRenders()) recordRender(rendered, key, text)
  reportRender?.(key, text)
  return rendered
}
