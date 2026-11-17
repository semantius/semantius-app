import { describe, expect, it } from 'vitest'
import { modelDefault } from './modelDefaults'

// 19:05:07.123 UTC on 2026-11-16.
const NOW = new Date('2026-11-16T19:05:07.123Z')

describe('modelDefault resolves the SQL-standard keywords', () => {
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
    expect(modelDefault(expression, format, NOW)).toEqual({ value: expected })
  })
})

describe('modelDefault resolves the special literals', () => {
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
    expect(modelDefault(expression, format, NOW)).toEqual({ value: expected })
  })

  it.each([
    ['now()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['NOW()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['now( )', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['now()', 'date', '2026-11-16'],
    ['now()', 'time', '19:05:07Z'],
    ['now()::date', 'date', '2026-11-16'],
    ['(now())::timestamp with time zone', 'date-time', '2026-11-16T19:05:07.123Z'],
    // The other current-instant functions quote_default_value emits bare.
    ['clock_timestamp()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['STATEMENT_TIMESTAMP()', 'date-time', '2026-11-16T19:05:07.123Z'],
    ['transaction_timestamp()', 'date', '2026-11-16'],
  ])('the function %s on a %s field is %j', (expression, format, expected) => {
    expect(modelDefault(expression, format, NOW)).toEqual({ value: expected })
  })

  it('crosses a month, a year and a leap day', () => {
    expect(modelDefault("'tomorrow'::date", 'date', new Date('2026-12-31T23:59:59Z'))).toEqual({ value: '2027-01-01' })
    expect(modelDefault("'yesterday'::date", 'date', new Date('2027-01-01T00:00:00Z'))).toEqual({ value: '2026-12-31' })
    expect(modelDefault("'tomorrow'::date", 'date', new Date('2024-02-28T12:00:00Z'))).toEqual({ value: '2024-02-29' })
  })

  it('takes today in UTC, as the server does', () => {
    // 23:30 UTC is already the next day east of Greenwich; the date stays the UTC one.
    expect(modelDefault('CURRENT_DATE', 'date', new Date('2026-11-16T23:30:00Z'))).toEqual({ value: '2026-11-16' })
  })
})

describe('modelDefault computes a uuid', () => {
  it.each([['gen_random_uuid()'], ['GEN_RANDOM_UUID()'], [' gen_random_uuid() ']])('%j on a uuid field', (expression) => {
    const result = modelDefault(expression, 'uuid', NOW)
    expect(result?.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('draws a new one each time', () => {
    expect(modelDefault('gen_random_uuid()', 'uuid', NOW)).not.toEqual(modelDefault('gen_random_uuid()', 'uuid', NOW))
  })
})

describe('modelDefault reads a literal as a value of the field type', () => {
  it.each([
    // Text as written, as the backend quotes it.
    ['pending', 'enum', 'pending'],
    ['/', 'text', '/'],
    ['10', 'enum', '10'],
    ['has', 'text', 'has'],
    [' padded ', 'text', ' padded '],
    ['hello (world)', 'text', 'hello (world)'],
    // Quotes and casts dropped, a doubled quote is one.
    ["'user'", 'enum', 'user'],
    ["'user'::text", 'enum', 'user'],
    ["'it''s'", 'text', "it's"],
    ["''", 'text', ''],
    ["'now'", 'text', 'now'],
    ["'2026-01-01'::date", 'date', '2026-01-01'],
    // Numbers.
    ['0', 'int32', 0],
    ['0.0', 'number', 0],
    ['10', 'int64', 10],
    ['-1.5', 'number', -1.5],
    ['1e3', 'number', 1000],
    ["'10'::integer", 'int32', 10],
    // Booleans, as PostgreSQL's boolean input reads them.
    ['FALSE', 'boolean', false],
    ['true', 'boolean', true],
    ['f', 'boolean', false],
    ["'yes'", 'boolean', true],
    // JSON.
    ['[]', 'json', []],
    ['[]', 'jsonlogic', []],
    ['{"a": 1}', 'json', { a: 1 }],
    ["'[]'::jsonb", 'json', []],
  ])('%j on a %s field is %j', (declared, format, expected) => {
    expect(modelDefault(declared, format, NOW)).toEqual({ value: expected })
  })

  it.each([0, 10.5, false, true, null, {}, [], undefined])('a typed %j is the value', (declared) => {
    expect(modelDefault(declared, 'json', NOW)).toEqual({ value: declared })
  })

  it.each([
    ['', 'date'],
    ['', 'text'],
    ['  ', 'uuid'],
  ])('blank %j on a %s field is no default, and is kept as it is', (declared, format) => {
    expect(modelDefault(declared, format, NOW)).toEqual({ value: declared })
  })

  it('reads text of an unknown format as text, like the text control that edits it', () => {
    expect(modelDefault('x', 'no_such_format', NOW)).toEqual({ value: 'x' })
  })
})

describe('modelDefault answers null for what the browser cannot compute', () => {
  it.each([
    // A date has no time of day, and a time of day has no date.
    ['CURRENT_DATE', 'time'],
    ["'today'::date", 'time'],
    ['CURRENT_TIME', 'date'],
    ['LOCALTIME', 'date-time'],
    // A date/time keyword or function on a field that is not a date.
    ['CURRENT_DATE', 'text'],
    ['CURRENT_TIMESTAMP', 'text'],
    ['now()', 'text'],
    ['CURRENT_DATE', undefined],
    // The keywords the database evaluates itself.
    ['NULL', 'text'],
    ['null', 'date'],
    ['CURRENT_USER', 'text'],
    ['session_user', 'text'],
    // Any other function call.
    ["nextval('orders_id_seq'::regclass)", 'int64'],
    ['now(1)', 'date-time'],
    ['uuidv7()', 'uuid'],
    ['public.f()', 'text'],
    ['gen_random_uuid()', 'int64'],
    // Text that is no value of the field type.
    ['abc', 'int32'],
    ['maybe', 'boolean'],
    ['[', 'json'],
  ])('%j on a %s field', (declared, format) => {
    expect(modelDefault(declared, format, NOW)).toBeNull()
  })
})

describe('modelDefault keeps text that is not a recognized expression', () => {
  it.each([
    ['n/a', 'date'],
    ['CURRENT_DATE + 1', 'date'],
    ["'today", 'date'],
    ['today', 'date'],
    ['now', 'date-time'],
    ['now() + 1', 'date-time'],
  ])('%j on a %s field is the text', (declared, format) => {
    expect(modelDefault(declared, format, NOW)).toEqual({ value: declared })
  })
})
