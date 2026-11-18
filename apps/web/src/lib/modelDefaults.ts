/**
 * The form value a model default stands for.
 *
 * A field's JSON Schema `default` is its `fields.default_value`, as `get_schema`
 * hands it over. The backend reads that text in exactly one way
 * (`quote_default_value` in `0160_dd_functions.sql`): a default is a VALUE, a
 * literal PostgreSQL casts to the column type, except `NULL`, a boolean or a
 * numeric literal, and a fixed list of argument-less SQL expressions —
 * CURRENT_DATE, CURRENT_TIME, CURRENT_TIMESTAMP, LOCALTIME, LOCALTIMESTAMP,
 * now(), clock_timestamp(), statement_timestamp(), transaction_timestamp(),
 * gen_random_uuid(), CURRENT_USER, SESSION_USER — which it writes into the DDL
 * bare. `get_schema` already turns most numbers, booleans and JSON values into
 * typed values; text is everything else (`"CURRENT_DATE"`, `"pending"`, and the
 * JSON `"[]"` of `entities.computed_fields`).
 *
 * `modelDefault` answers `{ value }` with what the browser can compute:
 * - `CURRENT_USER` or `$user_id` on a reference or parent field to users becomes
 *   the signed-in user's id (see "The current user" below);
 * - a date/time expression on a date, date-time or time field becomes the date
 *   or instant it stands for (see "Date and time" below);
 * - `gen_random_uuid()` becomes `crypto.randomUUID()`;
 * - a literal becomes a value of the field's type: text as written (quotes and
 *   casts dropped from `'user'::text`), a number from `10` or `'10'::integer`, a
 *   boolean from `FALSE`, JSON from `[]`.
 *
 * It answers `null` for what it cannot: `NULL`, `CURRENT_USER` and
 * `SESSION_USER` anywhere else, the current-user default while no user id is
 * known, any other function call (`nextval(…)`), a date/time expression on a
 * field it does not fit, and text that is no value of the field's type. The
 * form then starts the field empty and, while it stays empty, leaves it out of
 * the INSERT, so the column default applies. Seeding the expression text
 * instead put SQL into the field, and sending the empty field as `null`
 * overrides the column default.
 *
 * ## The current user
 *
 * `CURRENT_USER` or `$user_id`, in any case, as the default of a reference or
 * parent field whose `reference_table` is `users`, means the id of whoever
 * creates the record, the way `CURRENT_DATE` on a date field means today. The
 * backend decides that in one place, `dd_is_current_user_default`, and makes
 * the column default `rbac.user_id_or_null()`; `isCurrentUserDefault` below is
 * the same test, so keep the two in step. The id is `get_userinfo`'s `user_id`
 * (`signedInUserId()` in `lib/ruleContext.ts`, which rules read as `$user_id`).
 * Anywhere else `CURRENT_USER` is PostgreSQL's role name, which the browser
 * does not know, and `$user_id` is text like any other.
 *
 * ## Date and time
 *
 * Seeding `CURRENT_DATE` as text showed an empty date picker over a value that
 * then failed "must match format date" on submit (Northwind `orders.order_date`),
 * so the form starts with the date the database would have stored. Recognized,
 * case-insensitive:
 * - the SQL-standard keywords, written without parentheses: CURRENT_DATE,
 *   CURRENT_TIME, CURRENT_TIMESTAMP, LOCALTIME, LOCALTIMESTAMP;
 * - PostgreSQL's special literals, quoted and optionally cast:
 *   'today', 'tomorrow', 'yesterday' (midnight of that day) and 'now',
 *   e.g. `'today'::date` or `('now'::text)::timestamptz`;
 * - the functions now(), clock_timestamp(), statement_timestamp() and
 *   transaction_timestamp(), the current instant, optionally cast:
 *   `now()::date`.
 *
 * "Today" and "now" are UTC, as the server's session evaluates them and as the
 * rule variables `$today` and `$now` are (`lib/ruleContext.ts`), so near midnight
 * the date can differ from the calendar on the user's wall.
 *
 * The result has the shape the field's control holds: `YYYY-MM-DD` for `date`,
 * an ISO instant for `date-time`, `HH:MM:SSZ` for `time`. An expression that
 * makes no sense for the format (a time of day for a date field, a date for a
 * time field) is not computed, nor is a keyword or function on a field of
 * another format. A quoted special literal on such a field is a literal like
 * any other: `'now'` on a text field is the text "now".
 */
import { formatType, isFormatName } from '@/lib/formats'
import { signedInUserId } from '@/lib/ruleContext'

/** What a default's meaning depends on besides its text, read off the field's property schema. */
export interface DefaultField {
  format?: unknown
  /** The table a reference or parent field points at. */
  reference_table?: unknown
}

/** What a default is evaluated against. Each is a parameter so a test can fix it. */
export interface DefaultContext {
  /** The clock. Defaults to now. */
  now?: Date
  /** The signed-in user's id, or null while none is known. Defaults to `signedInUserId()`. */
  userId?: unknown
}

type Moment =
  /** Midnight UTC, this many days from today. */
  | { kind: 'day'; offset: number }
  /** The current instant. */
  | { kind: 'now' }
  /** The current time of day, which has no date. */
  | { kind: 'time' }

const KEYWORDS: Record<string, Moment> = {
  current_date: { kind: 'day', offset: 0 },
  current_timestamp: { kind: 'now' },
  localtimestamp: { kind: 'now' },
  current_time: { kind: 'time' },
  localtime: { kind: 'time' },
}

const LITERALS: Record<string, Moment> = {
  today: { kind: 'day', offset: 0 },
  tomorrow: { kind: 'day', offset: 1 },
  yesterday: { kind: 'day', offset: -1 },
  now: { kind: 'now' },
}

/** `::type`, where the type may have words, spaces and a precision: `timestamp(3) with time zone`. */
const CAST = String.raw`\s*::\s*[a-z_][a-z_ ]*(?:\(\s*\d+\s*\))?[a-z_ ]*`
/** A quoted special literal with any casts, inside at most one pair of parentheses, with any casts after it. */
const DATE_LITERAL = new RegExp(String.raw`^\(?\s*'([a-z]+)'(?:${CAST})*\s*\)?(?:${CAST})*$`, 'i')
/** One of the current-instant functions with any casts, inside at most one pair of parentheses, with any casts after it. */
const NOW_CALL = new RegExp(
  String.raw`^\(?\s*(?:now|clock_timestamp|statement_timestamp|transaction_timestamp)\s*\(\s*\)(?:${CAST})*\s*\)?(?:${CAST})*$`,
  'i',
)
/** Any quoted literal with any casts. `''` inside it is one quote, as in SQL. */
const QUOTED = new RegExp(String.raw`^\(?\s*'((?:[^']|'')*)'(?:${CAST})*\s*\)?(?:${CAST})*$`, 'i')
/** A function call: a (schema-qualified) name, directly followed by parentheses, with any casts. */
const FUNCTION_CALL = new RegExp(String.raw`^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?\(.*\)(?:${CAST})*$`, 'is')
/** What PostgreSQL's numeric input accepts, which is what a quoted numeric default is cast with. */
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
/** PostgreSQL's boolean input words (`boolin`), whole words only. */
const BOOLEANS: Record<string, boolean> = {
  true: true, t: true, yes: true, y: true, on: true, '1': true,
  false: false, f: false, no: false, n: false, off: false, '0': false,
}
/** The keywords `quote_default_value` emits bare that the browser cannot evaluate. */
const UNCOMPUTABLE_KEYWORDS = new Set(['null', 'current_user', 'session_user'])
/** The defaults that mean the signed-in user on a reference or parent field to users. */
const CURRENT_USER_TOKENS = new Set(['current_user', '$user_id'])

/** `dd_is_current_user_default` (0160_dd_functions.sql): whether `text` means the signed-in user's id on `field`. */
function isCurrentUserDefault(text: string, field: DefaultField): boolean {
  return (
    (field.format === 'reference' || field.format === 'parent')
    && field.reference_table === 'users'
    && CURRENT_USER_TOKENS.has(text.toLowerCase())
  )
}

const MS_PER_DAY = 86_400_000
const DATE_FORMATS = new Set(['date', 'date-time', 'time'])

/** The moment a date/time expression stands for, and whether it was written as a quoted literal. */
function momentOf(text: string): { moment: Moment; quoted: boolean } | undefined {
  const keyword = KEYWORDS[text.toLowerCase()]
  if (keyword) return { moment: keyword, quoted: false }
  if (NOW_CALL.test(text)) return { moment: { kind: 'now' }, quoted: false }
  const literal = DATE_LITERAL.exec(text)
  const moment = literal ? LITERALS[literal[1].toLowerCase()] : undefined
  return moment ? { moment, quoted: true } : undefined
}

/** `YYYY-MM-DD` of an instant, in UTC. */
const dateOf = (instant: Date): string => instant.toISOString().slice(0, 10)

/** The value of `moment` on a field of a date `format`, or `undefined` when it does not fit. */
function valueOfMoment(moment: Moment, format: string, now: Date): string | undefined {
  if (format === 'time') {
    if (moment.kind === 'day') return undefined
    return `${now.toISOString().slice(11, 19)}Z`
  }
  if (moment.kind === 'time') return undefined

  const instant =
    moment.kind === 'now'
      ? now
      : new Date(Date.parse(`${dateOf(now)}T00:00:00Z`) + moment.offset * MS_PER_DAY)

  if (format === 'date') return dateOf(instant)
  if (format === 'date-time') return instant.toISOString()
  return undefined
}

/**
 * A literal's value on a field of `format`, or `null` when it is no value of
 * the field's type. An unknown format holds text, like the text control that
 * edits it.
 */
function literalValue(text: string, format: unknown): { value: unknown } | null {
  const type = isFormatName(format) ? formatType(format) : 'string'
  const trimmed = text.trim()
  switch (type) {
    case 'boolean': {
      const value = BOOLEANS[trimmed.toLowerCase()]
      return value === undefined ? null : { value }
    }
    case 'integer':
    case 'number':
      return NUMBER.test(trimmed) ? { value: Number(trimmed) } : null
    case 'object':
    case 'array':
      try {
        return { value: JSON.parse(trimmed) }
      } catch {
        return null
      }
    default:
      return { value: text }
  }
}

/**
 * The form value `declared`, a field's schema `default`, stands for on `field`
 * — or `null` when the browser cannot compute it, see above. A value that is not
 * text is already typed and is the value; so is blank text, the "no default" of
 * every optional text property.
 */
export function modelDefault(
  declared: unknown,
  field: DefaultField,
  { now = new Date(), userId = signedInUserId() }: DefaultContext = {},
): { value: unknown } | null {
  if (typeof declared !== 'string' || declared.trim() === '') return { value: declared }
  const text = declared.trim()
  const format = field.format

  if (isCurrentUserDefault(text, field)) return userId == null ? null : { value: userId }

  const isDateFormat = typeof format === 'string' && DATE_FORMATS.has(format)

  const dated = momentOf(text)
  if (dated) {
    const value = isDateFormat ? valueOfMoment(dated.moment, format, now) : undefined
    if (value !== undefined) return { value }
    // A date/time expression the field cannot hold. Only a quoted special
    // literal on a field that is not a date at all is plain text.
    if (isDateFormat || !dated.quoted) return null
  }

  if (text.toUpperCase() === 'GEN_RANDOM_UUID()') {
    return isFormatName(format) && formatType(format) === 'string' ? { value: crypto.randomUUID() } : null
  }
  if (UNCOMPUTABLE_KEYWORDS.has(text.toLowerCase())) return null
  if (FUNCTION_CALL.test(text)) return null

  const quoted = QUOTED.exec(text)
  if (quoted) return literalValue(quoted[1].replace(/''/g, "'"), format)
  // Text as written, untrimmed: the backend quotes the original.
  return literalValue(declared, format)
}
