/**
 * A server error, parsed into the one shape every error has.
 *
 * PostgREST hands the app four fields — `code`, `message`, `hint`, `details`
 * — and the platform carries its structure inside `hint`: a JSON object whose
 * `hint` key is the hint template and whose every other key is a value. That
 * envelope is a transport detail of the PostgREST wire format, not the shape;
 * the shape after parsing is
 *
 *   code      the SQLSTATE, server errors only, optional
 *   message   a template for a platform error, a finished sentence for a plain one
 *   hint      a template saying how to fix it
 *   values    the parameters
 *   details   plain text — never translated, never recorded
 *
 * Two separate questions decide how the client renders it. PRESENCE decides
 * whether an envelope exists: `hint` parsed as an object marks the error as
 * carrying the platform's format, and only then are `${name}` placeholders
 * converted to ICU. The CLASS decides which code is the key: the SQLSTATE
 * itself on classes 90 and 99 (the platform's own numbering — PostgreSQL
 * defines neither), else `hint.code` (the catalog number of an error whose
 * SQLSTATE is spoken for by the HTTP status mapping, `42501`, `42P01`), else
 * the SQLSTATE plus the constraint name where one can be parsed, else the
 * SQLSTATE, else the message itself — which is how a codeless gateway
 * rejection and a client-raised error key alike, on their own text.
 *
 * Everything here is pure and lives in the machinery directory on purpose:
 * every string below is a code, a regex or a JSON key. `lib/apiErrors.ts` is
 * the renderer that puts the result on screen.
 */

import { placeholdersOf } from './placeholders'

/** The keys inside an envelope that are not parameters — `hint` is the template. */
export const RESERVED_ENVELOPE_KEYS: readonly string[] = ['hint', 'code', 'entity', 'rule', 'field']

/** A placeholder is `${` + a name matching this + `}`. Exactly this grammar, nothing looser. */
const PLACEHOLDER = /\$\{([a-z][a-z0-9_]*)\}/g

/** A SQLSTATE: two class characters plus three, uppercase letters and digits. */
const SQLSTATE = /^[0-9A-Z]{5}$/

export interface ParsedServerError {
  /** The SQLSTATE, when the server sent one. */
  code?: string
  /** The message, as it will be looked up: an ICU template when structured, the sentence otherwise. */
  message: string
  /** The hint template, when there is one. */
  hint?: string
  /** The envelope's values — every key but `hint`. Empty when unstructured. */
  values: Record<string, unknown>
  /** Plain text for the Details panel. Never a key. */
  details?: string
  /** Whether an envelope was parsed — the only thing that turns `${…}` conversion on. */
  structured: boolean
  /** The stored key, and the segments it was built from (`['23505', 'orders_pkey']`). */
  key: string
  keySegments: readonly string[]
  /** Whether the key is the message itself, as opposed to a code. */
  keyedByMessage: boolean
}

/**
 * Parse a PostgREST error body. Answers `null` when there is no string
 * `message` to render — that is not a server error in the shape the app knows.
 */
export function parseServerError(body: Record<string, unknown>): ParsedServerError | null {
  const rawMessage = body.message
  if (typeof rawMessage !== 'string' || !rawMessage) return null
  const code = typeof body.code === 'string' && body.code ? body.code : undefined
  const envelope = parseHint(body.hint)
  const detailText = body.detail ?? body.details
  const details = typeof detailText === 'string' && detailText ? detailText : undefined

  const structured = envelope.parsed
  const message = structured ? dollarToIcu(rawMessage) : rawMessage
  const hint = envelope.hint ? (structured ? dollarToIcu(envelope.hint) : envelope.hint) : undefined

  const segments = keySegmentsOf(code, rawMessage, envelope.values)
  const keyedByMessage = segments === null
  return {
    code,
    message,
    hint,
    values: envelope.values,
    details,
    structured,
    key: keyedByMessage ? message : segments.join('.'),
    keySegments: keyedByMessage ? [message] : segments,
    keyedByMessage,
  }
}

/**
 * The hint, normalized to one shape. A JSON object is the envelope; anything
 * else is taken as `{ "hint": text }`, which folds PostgreSQL's own plain-text
 * hints and the platform's existing ones into the same shape with nothing
 * branching on which kind arrived. Only a parsed OBJECT marks the error as
 * structured — a normalized plain hint brings no values with it. Deciding by
 * the parse rather than by a leading `{` is strictly safer: a malformed `{…`
 * falls back to suggestion text rather than to undefined behavior.
 */
function parseHint(raw: unknown): { parsed: boolean; hint?: string; values: Record<string, unknown> } {
  if (typeof raw !== 'string' || !raw) return { parsed: false, values: {} }
  let object: unknown
  try {
    object = JSON.parse(raw)
  } catch {
    return { parsed: false, hint: raw, values: {} }
  }
  if (!object || typeof object !== 'object' || Array.isArray(object)) return { parsed: false, hint: raw, values: {} }
  const { hint, ...values } = object as Record<string, unknown>
  return { parsed: true, hint: typeof hint === 'string' && hint ? hint : undefined, values }
}

/**
 * The key, as segments — or `null` when the message itself is the key.
 *
 * The class is tested FIRST: on 90 and 99 the SQLSTATE already is the catalog
 * number, so a `hint.code` there is display detail, not a message id. A class
 * 99 key is scoped by the entity whose rule fired, which arrives in the
 * envelope — a client-side guess would be wrong for an RPC touching several
 * entities and for a cascade.
 */
function keySegmentsOf(code: string | undefined, message: string, values: Record<string, unknown>): string[] | null {
  if (code && isCatalogClass(code)) {
    const entity = values.entity
    return code.startsWith('99') && typeof entity === 'string' && entity ? [code, entity] : [code]
  }
  if (typeof values.code === 'string' && values.code) return [values.code]
  if (code) {
    const constraint = constraintNameOf(message)
    return constraint ? [code, constraint] : [code]
  }
  return null
}

/** Whether a SQLSTATE is one the platform numbers itself: class 90 or 99. */
export function isCatalogClass(code: string): boolean {
  return code.startsWith('90') || code.startsWith('99')
}

/**
 * The constraint a PostgreSQL message names, so that `23505` plus
 * `modules_module_slug_key` can become "That module slug is already taken"
 * where `23505` alone could not. It reads PostgreSQL's English phrasing, so a
 * server with `lc_messages` set otherwise yields nothing and the key falls back
 * to the bare SQLSTATE.
 */
export function constraintNameOf(message: string): string | undefined {
  return /constraint "([^"]+)"/.exec(message)?.[1]
}

/**
 * The two table names in a foreign-key violation — the one being deleted and
 * the one still pointing at it. The only way to recover them: a `23503` comes
 * from PostgreSQL itself with no envelope, so there are no values to read.
 */
export function foreignKeyTables(message: string): { table: string; referencing: string } | undefined {
  const match = /on table "(\w+)" violates foreign key constraint "[^"]+" on table "(\w+)"/.exec(message)
  return match ? { table: match[1], referencing: match[2] } : undefined
}

/**
 * Whether a stored key names a plain server sentence, looked up verbatim and
 * never ICU-compiled: a SQLSTATE outside the platform's own classes. Class 90
 * and 99 keys are ICU templates like any code message.
 */
export function isVerbatimKey(key: string): boolean {
  const first = key.split('.')[0]
  return SQLSTATE.test(first) && !isCatalogClass(first)
}

/**
 * `${name}` -> ICU, in ONE walk of the string.
 *
 * Two things at once: turn each placeholder into an ICU argument, and escape
 * every plain brace so it stays literal. Both are load-bearing, measured
 * against Lingui's compiler — unconverted, `min length ${ml}` compiles to a
 * stray `$` before an argument, and an unescaped literal `{1,2}` does not
 * throw but silently disappears at render as an argument named `1`. Two
 * sequential passes cannot do it: escape-then-replace hides the placeholder
 * inside quotes, replace-then-escape re-escapes the argument just produced.
 *
 * Escaping is single-quote wrapping of EACH brace (`'{'1,2'}'`), and every
 * apostrophe in literal text is doubled: `it''s` compiles to `it's`, while a
 * lone apostrophe directly before a brace would start a quoted run and swallow
 * the argument after it. Per brace, not per run: an ICU quote only opens when
 * the character after it is a brace, so `'${NOT_A_PARAM}'` would leave the
 * apostrophe literal and the brace an argument — measured.
 */
export function dollarToIcu(template: string): string {
  let out = ''
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    out += literal(template.slice(last, match.index))
    out += `{${match[1]}}`
    last = match.index + match[0].length
  }
  out += literal(template.slice(last))
  return out
}

function literal(text: string): string {
  return text.replace(/'/g, "''").replace(/[{}]/g, (brace) => `'${brace}'`)
}

/** The body fields a renderer shows as text — never part of a JSON dump of the rest. */
export const ERROR_TEXT_FIELDS: readonly string[] = ['message', 'hint', 'details', 'detail']

/**
 * The values a template will be rendered with, every argument present.
 *
 * Lingui's default degradation is bad: a missing simple argument disappears
 * silently, leaving a mutilated sentence, and a missing plural argument renders
 * `NaN`; an explicitly `null` one is worse — `{count: null}` through a plural
 * renders `0 items`, a confident lie. So a name the values do not carry, or
 * carry as `null`, is supplied as its own name, and the sentence reads visibly
 * incomplete rather than silently wrong. A template that does not compile is
 * left to the renderer's own fallback.
 */
export function fillPlaceholders(template: string, values: Record<string, unknown>): Record<string, unknown> {
  let names: string[]
  try {
    names = placeholdersOf(template)
  } catch {
    return values
  }
  const filled: Record<string, unknown> = { ...values }
  for (const name of names) {
    if (filled[name] === undefined || filled[name] === null) filled[name] = `{${name}}`
  }
  return filled
}
