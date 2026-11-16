/**
 * The value a PostgreSQL date/time default stands for, for a form to start with.
 *
 * `get_schema` passes a column's default through as written, so a date field's
 * JSON Schema `default` can be the SQL `CURRENT_DATE` rather than a date
 * (Northwind `orders.order_date`). Seeding that text into the form shows an empty
 * date picker over a value that then fails "must match format date" on submit,
 * and leaving the field empty would not help: an empty date is sent as an
 * explicit null, which overrides the column default. So the form starts with the
 * date the database would have stored.
 *
 * Two kinds of expression are recognized, case-insensitive:
 * - the SQL-standard keywords, written without parentheses: CURRENT_DATE,
 *   CURRENT_TIME, CURRENT_TIMESTAMP, LOCALTIME, LOCALTIMESTAMP;
 * - PostgreSQL's special literals, quoted and optionally cast:
 *   'today', 'tomorrow', 'yesterday' (midnight of that day) and 'now',
 *   e.g. `'today'::date` or `('now'::text)::timestamptz`;
 * - the function `now()`, the current instant, optionally cast: `now()::date`.
 *
 * "Today" and "now" are UTC, as the server's session evaluates them and as the
 * rule variables `$today` and `$now` are (`lib/ruleContext.ts`), so near midnight
 * the date can differ from the calendar on the user's wall.
 *
 * The result has the shape the field's control holds: `YYYY-MM-DD` for `date`,
 * an ISO instant for `date-time`, `HH:MM:SSZ` for `time`. An expression that
 * makes no sense for the format (a time of day for a date field, a date for a
 * time field) is not resolved, nor is anything on a field of another format —
 * the text `'now'` on a text field is just that text.
 */

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
/** A quoted literal with any casts, inside at most one pair of parentheses, with any casts after it. */
const LITERAL = new RegExp(String.raw`^\(?\s*'([a-z]+)'(?:${CAST})*\s*\)?(?:${CAST})*$`, 'i')
/** `now()` with any casts, inside at most one pair of parentheses, with any casts after it. */
const NOW_CALL = new RegExp(String.raw`^\(?\s*now\s*\(\s*\)(?:${CAST})*\s*\)?(?:${CAST})*$`, 'i')

const MS_PER_DAY = 86_400_000

function momentOf(expression: string): Moment | undefined {
  const text = expression.trim()
  const keyword = KEYWORDS[text.toLowerCase()]
  if (keyword) return keyword
  if (NOW_CALL.test(text)) return { kind: 'now' }
  const literal = LITERAL.exec(text)
  return literal ? LITERALS[literal[1].toLowerCase()] : undefined
}

/** `YYYY-MM-DD` of an instant, in UTC. */
const dateOf = (instant: Date): string => instant.toISOString().slice(0, 10)

/**
 * The form value `expression` stands for on a field of `format`, or `undefined`
 * when it is not one of the date/time expressions above, or does not fit the
 * format. `now` is a parameter so a test can fix the clock.
 */
export function postgresDateDefault(expression: unknown, format: unknown, now: Date = new Date()): string | undefined {
  if (typeof expression !== 'string') return undefined
  const moment = momentOf(expression)
  if (!moment) return undefined

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
