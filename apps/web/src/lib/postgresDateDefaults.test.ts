import { describe, expect, it } from 'vitest'
import { postgresDateDefault } from './postgresDateDefaults'

// 19:05:07.123 UTC on 2026-11-16.
const NOW = new Date('2026-11-16T19:05:07.123Z')

describe('postgresDateDefault resolves the SQL-standard keywords', () => {
  it.each([
    ['CURRENT_DATE', 'date', '2026-11-16'],
    ['CURRENT_DATE', 'date-time', '2026-11-16T00:00:00.000Z'],
    ['CURRENT_TIMESTAMP', 'date', '2026-11-16'],
    ['CURRENT_TIMESTAMP', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['CURRENT_TIMESTAMP', 'time', '19:05:07Z'],
    ['LOCALTIMESTAMP', 'date', '2026-11-16'],
    ['LOCALTIMESTAMP', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['CURRENT_TIME', 'time', '19:05:07Z'],
    ['LOCALTIME', 'time', '19:05:07Z'],
    ['current_date', 'date', '2026-11-16'],
    ['  Current_Date  ', 'date', '2026-11-16'],
  ])('%s on a %s field is %j', (expression, format, expected) => {
    expect(postgresDateDefault(expression, format, NOW)).toBe(expected)
  })
})

describe('postgresDateDefault resolves the special literals', () => {
  it.each([
    ["'today'::date", 'date', '2026-11-16'],
    ["'tomorrow'::date", 'date', '2026-11-17'],
    ["'yesterday'::date", 'date', '2026-11-15'],
    ["'TODAY'", 'date', '2026-11-16'],
    ["'today'::timestamptz", 'date-time', '2026-11-16T00:00:00.000Z'],
    ["'tomorrow'::timestamp without time zone", 'date-time', '2026-11-17T00:00:00.000Z'],
    ["'now'::timestamptz", 'date-time', '2026-11-16T19:05:07.123Z'],
    ["('now'::text)::timestamp with time zone", 'date-time', '2026-11-16T19:05:07.123Z'],
    ["'now'::timestamp(3) with time zone", 'date-time', '2026-11-16T19:05:07.123Z'],
    ["'now'::date", 'date', '2026-11-16'],
    ["'now'::time", 'time', '19:05:07Z'],
  ])('%s on a %s field is %j', (expression, format, expected) => {
    expect(postgresDateDefault(expression, format, NOW)).toBe(expected)
  })

  it.each([
    ['now()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['NOW()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['now( )', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['now()', 'date', '2026-11-16'],
    ['now()', 'time', '19:05:07Z'],
    ['now()::date', 'date', '2026-11-16'],
    ['(now())::timestamp with time zone', 'date-time', '2026-11-16T19:05:07.123Z'],
  ])('the function %s on a %s field is %j', (expression, format, expected) => {
    expect(postgresDateDefault(expression, format, NOW)).toBe(expected)
  })

  it('crosses a month, a year and a leap day', () => {
    expect(postgresDateDefault("'tomorrow'::date", 'date', new Date('2026-12-31T23:59:59Z'))).toBe('2027-01-01')
    expect(postgresDateDefault("'yesterday'::date", 'date', new Date('2027-01-01T00:00:00Z'))).toBe('2026-12-31')
    expect(postgresDateDefault("'tomorrow'::date", 'date', new Date('2024-02-28T12:00:00Z'))).toBe('2024-02-29')
  })

  it('takes today in UTC, as the server does', () => {
    // 23:30 UTC is already the next day east of Greenwich; the date stays the UTC one.
    expect(postgresDateDefault('CURRENT_DATE', 'date', new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-16')
  })
})

describe('postgresDateDefault leaves everything else alone', () => {
  it.each([
    // A date has no time of day, and a time of day has no date.
    ['CURRENT_DATE', 'time'],
    ["'today'::date", 'time'],
    ['CURRENT_TIME', 'date'],
    ['LOCALTIME', 'date-time'],
    // Not a date/time field: the text is the value.
    ['CURRENT_DATE', 'text'],
    ["'now'", 'text'],
    ['CURRENT_DATE', undefined],
    // Not one of the recognized expressions.
    ['', 'date'],
    ['n/a', 'date'],
    ["'2026-01-01'::date", 'date'],
    ['CURRENT_DATE + 1', 'date'],
    ["'today", 'date'],
    ['today', 'date'],
    ['now', 'date-time'],
    ['now() + 1', 'date-time'],
    ['now(1)', 'date-time'],
    ['clock_timestamp()', 'date-time'],
    ['now()', 'text'],
  ])('%j on a %s field', (expression, format) => {
    expect(postgresDateDefault(expression, format, NOW)).toBeUndefined()
  })

  it.each([null, undefined, 0, true, {}])('%j is not an expression', (expression) => {
    expect(postgresDateDefault(expression, 'date', NOW)).toBeUndefined()
  })
})
