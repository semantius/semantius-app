/**
 * Live evaluation of entity `computed_fields` (JsonLogic) against form values.
 *
 * The backend evaluates the same rules on every write. The form also evaluates
 * them when the user changes an input, so a disabled computed field (amount,
 * label, …) updates before save. Rules run on the evaluator in `vendor/json-logic-js/jsonLogic.ts`,
 * the same one `input_type_rule` uses, which dispatches the control operators
 * (`let` and `set_record` among them) as the server does. The Semantius operators
 * are registered on it here: `concat`, `is_match`, `has_permission`, the date
 * operators, and arithmetic, ordering and equality as the server decides them, and
 * so are `value_changed`, `require_permission` and `throw_error`. The two that read
 * the database (`is_raci_actor`, `has_consultation`) are registered too, and throw
 * that they cannot run in the browser. Every error an operator throws has the
 * server's shape (`serverError`), so the form renders it as the server words it.
 */
import { appError } from '@/lib/appError'
import {
  addOperation,
  argumentsOf,
  compareText,
  evaluate,
  isLogic,
  missingKeys,
  operatorOf,
  serverError,
  textOf,
  type RecordLookup,
} from '@/vendor/json-logic-js/jsonLogic'
import { epochSecondsOf, registerDateOperators } from '@/lib/jsonLogicDates'
import { ruleUserHasPermission, withRuleContext, type RecordContext } from '@/lib/ruleContext'

export type { RecordLookup } from '@/vendor/json-logic-js/jsonLogic'

export interface ComputedField {
  name: string
  jsonlogic: unknown
}

const IDENT = /^[a-zA-Z0-9_-]+$/

// cat and concat as the server's: every argument as jl_to_text makes it, so null
// is nothing and a list or an object is its jsonb text, such as `[1, 2]`.
addOperation('cat', (...args: unknown[]) => args.map(textOf).join(''))
addOperation('concat', (...args: unknown[]) => args.map(textOf).join(''))

addOperation('has_permission', function hasPermission(name: unknown) {
  return ruleUserHasPermission(String(name))
})

// Null never matches, as on the server: reading it as "" would let "^$" match a missing value.
addOperation('is_match', function isMatch(value: unknown, pattern: unknown) {
  if (value === null || value === undefined || pattern === null || pattern === undefined) return false
  return new RegExp(String(pattern)).test(String(value))
})

// The number a text carries, as the server's jl_try_number reads it: what Number()
// makes of it (blank text is 0), else the epoch seconds of an ISO date or date-time.
// Null for text that carries no number ("abc", "12abc", "2026-02-30").
function numberOfText(text: string): number | null {
  const number = Number(text)
  return Number.isNaN(number) ? epochSecondsOf(text) : number
}

// The number an arithmetic operator computes with, read as the server's jl_operand
// reads it: null is 0, as a field left empty is no mistake, and so is an array or
// an object (Number() would make 5 of [5]). Text that carries no number is NaN,
// which every operator below carries into its result, so it is refused there.
function operand(value: unknown): number {
  if (value === null || value === undefined || typeof value === 'object') return 0
  if (typeof value === 'string') return numberOfText(value) ?? NaN
  return Number(value)
}

// Text the server reads as a date or date-time rather than as a number.
function isDateText(value: unknown): boolean {
  return typeof value === 'string' && Number.isNaN(Number(value)) && epochSecondsOf(value) !== null
}

// The server refuses an arithmetic result that is not a finite number with 90920:
// JSON has no Infinity and no NaN. Each operator below computes what JavaScript
// computes over those operands and throws in that case, so the form leaves the
// field unchanged, as it does for every rule that throws.
//
// A date operand is epoch seconds to the microsecond, which the server holds
// exactly (numeric) and a double does not: 1704067200.123457 − 1704067200 is
// 0.12345719… here and 0.123457 there. So a result computed from date text is
// rounded to the microsecond. Only then: the server keeps 1/3 to twenty digits.
// Only the fraction is scaled, so an epoch-sized value keeps its precision; past
// about 4e9 seconds a double no longer holds a microsecond at all, which no
// meaningful date arithmetic reaches (a difference, a date plus an offset).
function toMicrosecond(value: number): number {
  const whole = Math.trunc(value)
  return whole + Math.round((value - whole) * 1e6) / 1e6
}

function refuseNonFiniteResult(operator: string, compute: (...args: any[]) => number): void {
  addOperation(operator, function arithmetic(...args: unknown[]) {
    const result = compute(...args.map(operand))
    if (!Number.isFinite(result)) throw serverError('90920', '${operator} has no finite result', { operator })
    return args.some(isDateText) ? toMicrosecond(result) : result
  })
}

refuseNonFiniteResult('+', (...args) => args.reduce((a, b) => a + b, 0))
refuseNonFiniteResult('*', (...args) => args.reduce((a, b) => a * b))
refuseNonFiniteResult('-', (a, b) => (b === undefined ? -a : a - b))
refuseNonFiniteResult('/', (a, b) => a / b)
refuseNonFiniteResult('%', (a, b) => a % b)
refuseNonFiniteResult('max', (...args) => Math.max(...args))
refuseNonFiniteResult('min', (...args) => Math.min(...args))

// Ordering as the server orders (evaluate_json_logic, the < > <= >= branch). Two
// strings compare as text, in code-point order (COLLATE "C"). Otherwise each side
// is a number: text through numberOfText, so an ISO date orders by its instant, and
// anything else as the server's jl_to_number reads it (null, an array and an object
// are 0). Text that carries no number makes the comparison false, as NaN does in
// JavaScript.
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'string' && typeof b === 'string') return compareText(a, b)
  const x = orderingNumber(a)
  const y = orderingNumber(b)
  if (x === null || y === null) return null
  return x < y ? -1 : x > y ? 1 : 0
}

function orderingNumber(value: unknown): number | null {
  if (typeof value === 'string') return numberOfText(value)
  if (value === null || value === undefined || typeof value === 'object') return 0
  return Number(value)
}

function ordering(operator: string, holds: (order: number) => boolean, between: boolean): void {
  addOperation(operator, function order(a: unknown, b: unknown, c?: unknown) {
    const ab = compare(a, b)
    if (ab === null || !holds(ab)) return false
    // < and <= take a third argument as a range, a < b < c; > and >= ignore it.
    if (!between || c === undefined) return true
    const bc = compare(b, c)
    return bc !== null && holds(bc)
  })
}

ordering('<', (order) => order < 0, true)
ordering('<=', (order) => order <= 0, true)
ordering('>', (order) => order > 0, false)
ordering('>=', (order) => order >= 0, false)

// The JSON type of a value, as the server's jsonb_typeof names it.
type JsonType = 'null' | 'number' | 'string' | 'boolean' | 'array' | 'object'

function jsonType(value: unknown): JsonType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const type = typeof value
  return type === 'number' || type === 'string' || type === 'boolean' ? type : 'object'
}

// Two JSON values are equal as jsonb `=` compares them: by value, an array
// element by element and an object key by key in any order. JavaScript's own
// == and === compare an array or an object by reference, so [1] === [1] is
// false there and true on the server.
function jsonEqual(a: unknown, b: unknown): boolean {
  const type = jsonType(a)
  if (type !== jsonType(b)) return false
  if (type === 'array') {
    const x = a as unknown[]
    const y = b as unknown[]
    return x.length === y.length && x.every((item, i) => jsonEqual(item, y[i]))
  }
  if (type === 'object') {
    const x = a as Record<string, unknown>
    const y = b as Record<string, unknown>
    const keys = Object.keys(x)
    return keys.length === Object.keys(y).length && keys.every((key) => Object.hasOwn(y, key) && jsonEqual(x[key], y[key]))
  }
  return a === b
}

// The number a value carries for equality, as the server's jl_try_number reads
// it: a boolean is 1 or 0, text goes through numberOfText, and null, an array
// and an object carry none.
function equalityNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') return numberOfText(value)
  return null
}

// An array as the text JavaScript makes of it, as the server's jl_array_text
// does: its elements joined by commas, null as nothing.
function arrayText(array: unknown[]): string {
  return array
    .map((item) => {
      if (item === null || item === undefined) return ''
      if (Array.isArray(item)) return arrayText(item)
      if (typeof item === 'object') return '[object Object]'
      return String(item)
    })
    .join(',')
}

// Loose equality as the server's jl_loose_eq decides it (0050_jsonlogic.sql).
// An argument that was not given is undefined, and equals only another one.
// Text is read through numberOfText against a number or a boolean, so an ISO
// date equals its epoch seconds, and text that carries no number equals no
// number (JavaScript's NaN). An array against a number or text is its joined text.
function looseEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === undefined && b === undefined
  const ta = jsonType(a)
  const tb = jsonType(b)
  if (ta === tb) return jsonEqual(a, b)
  if (ta === 'null' || tb === 'null') return false
  if ((ta === 'number' && tb === 'string') || (ta === 'string' && tb === 'number')) {
    const x = equalityNumber(a)
    const y = equalityNumber(b)
    return x !== null && y !== null && x === y
  }
  if (ta === 'boolean' || tb === 'boolean') {
    if ((ta === 'string' && equalityNumber(a) === null) || (tb === 'string' && equalityNumber(b) === null)) return false
    return (equalityNumber(a) ?? 0) === (equalityNumber(b) ?? 0)
  }
  if (ta === 'array' && (tb === 'number' || tb === 'string')) return looseEqual(arrayText(a as unknown[]), b)
  if (tb === 'array' && (ta === 'number' || ta === 'string')) return looseEqual(a, arrayText(b as unknown[]))
  return false
}

// Strict equality as the server decides it: the same JSON type and the same
// value, an array or an object by value.
function strictEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === undefined && b === undefined
  return jsonEqual(a, b)
}

addOperation('==', (a: unknown, b: unknown) => looseEqual(a, b))
addOperation('!=', (a: unknown, b: unknown) => !looseEqual(a, b))
addOperation('===', (a: unknown, b: unknown) => strictEqual(a, b))
addOperation('!==', (a: unknown, b: unknown) => !strictEqual(a, b))

// A number as the server's `jl_to_number(...)::int` makes it: what jl_try_number
// reads, or 0, rounded half away from zero. PostgreSQL refuses one beyond the int
// range.
function toInteger(value: unknown): number {
  const number = equalityNumber(value) ?? 0
  const rounded = Math.sign(number) * Math.round(Math.abs(number))
  if (rounded > 2147483647 || rounded < -2147483648) throw serverError('22003', 'integer out of range')
  return rounded
}

// substr as the server's: the text of anything (jl_to_text), a start and a length
// rounded to whole numbers, and positions that count characters rather than UTF-16
// code units, so a character above U+FFFF counts once. A negative start counts from
// the end, and a negative length leaves that many characters off the end.
addOperation('substr', (...args: unknown[]) => {
  const characters = Array.from(textOf(args[0]))
  let start = toInteger(args[1])
  if (start < 0) start = Math.max(characters.length + start, 0)
  const rest = characters.slice(start)
  if (args.length < 3) return rest.join('')
  const length = toInteger(args[2])
  return (length < 0 ? rest.slice(0, Math.max(rest.length + length, 0)) : rest.slice(0, length)).join('')
})

// in as the server's. In a list, the needle is compared with each element by value
// (jsonb =), so a list or an object can be found. In a text, the needle is searched
// for as text: null as 'null', anything else as jl_to_text makes it. Any other
// haystack finds nothing.
addOperation('in', (needle: unknown, haystack: unknown) => {
  if (Array.isArray(haystack)) return needle !== undefined && haystack.some((item) => jsonEqual(needle, item))
  if (typeof haystack === 'string') return haystack.includes(needle === null ? 'null' : textOf(needle))
  return false
})

// missing_some as the server's: the missing keys, or none when at least `needed`
// of them (as jl_to_number reads it) are there. PostgreSQL refuses to count keys
// that are not a list; with no keys at all, the server's `missing` runs over null.
addOperation('missing_some', function missingSome(this: unknown, ...args: unknown[]) {
  const [needed, keys] = args
  if (keys === undefined) return missingKeys(this, [null])
  if (!Array.isArray(keys)) {
    const isObject = typeof keys === 'object' && keys !== null
    throw serverError('22023', isObject ? 'cannot get array length of a non-array' : 'cannot get array length of a scalar')
  }
  const absent = missingKeys(this, keys)
  return keys.length - absent.length >= (equalityNumber(needed) ?? 0) ? [] : absent
})

// The evaluator calls an operator with the data the rule runs against as
// `this`, which is how value_changed reads `$old` beside the record.
type RuleData = Record<string, unknown> | undefined

// Whether a field differs from the stored row, as the server decides it: true
// when there is no `$old` (a new record); otherwise `$old.<field>` against
// `<field>` with IS DISTINCT FROM on jsonb, so a field missing on one side
// differs from one that is null, and arrays and objects compare by value.
addOperation('value_changed', function valueChanged(this: RuleData, field: unknown) {
  const old = this?.$old
  if (old === null || old === undefined) return true
  const key = textOf(field)
  // `->` on anything but an object finds no key, as on the server.
  const isObject = typeof old === 'object' && !Array.isArray(old)
  const before = isObject && Object.hasOwn(old, key) ? (old as Record<string, unknown>)[key] : undefined
  const now = this && Object.hasOwn(this, key) ? this[key] : undefined
  if (before === undefined || now === undefined) return before !== now
  return !jsonEqual(before, now)
})

// true when the signed-in user holds the permission; otherwise what the
// server's rbac.require_permission raises.
addOperation('require_permission', function requirePermission(name: unknown) {
  const permission = textOf(name)
  if (ruleUserHasPermission(permission)) return true
  throw serverError('42501', 'Permission denied: ${permission} required', {
    code: '90101',
    hint: 'Ask an administrator to grant ${permission}',
    permission,
  })
})

// The names the server keeps for itself in an error's hint object.
const RESERVED_HINT_KEYS = new Set(['hint', 'code', 'entity', 'rule', 'field'])

// Raises the rule author's class 99 error, with the server's checks on the
// code and the parameters: the message, the code (99000 when none) and the
// parameters as a flat list of name, value, name, value.
addOperation('throw_error', function throwError(message: unknown, code: unknown, params: unknown) {
  const errorCode = code === null || code === undefined ? '99000' : textOf(code)
  if (!/^99[0-9]{3}$/.test(errorCode)) {
    throw serverError('90911', 'throw_error code must be a class 99 number, not ${code_given}', { code_given: errorCode })
  }
  const hint: Record<string, unknown> = {}
  if (Array.isArray(params)) {
    if (params.length % 2 !== 0) {
      throw serverError('90914', 'throw_error parameters must be a flat list of name and value pairs')
    }
    for (let i = 0; i < params.length; i += 2) {
      const name = textOf(params[i])
      const value = params[i + 1]
      if (RESERVED_HINT_KEYS.has(name)) {
        throw serverError('90912', 'throw_error parameter ${name} uses a reserved name', { name })
      }
      if (value !== null && typeof value === 'object') {
        throw serverError('90913', 'throw_error parameter ${name} must be a scalar value, not ${json_type}', {
          name,
          json_type: Array.isArray(value) ? 'array' : 'object',
        })
      }
      hint[name] = value
    }
  }
  throw serverError(errorCode, textOf(message), hint)
})

// The two operators that read the database: known here, so a rule using one is
// not an unknown operator, but they cannot be evaluated in the browser.
for (const operator of ['is_raci_actor', 'has_consultation']) {
  addOperation(operator, function cannotRun() {
    throw appError({ message: '{operator} cannot run in the browser.', values: { operator } })
  })
}

registerDateOperators()

export function parseComputedFields(value: unknown): ComputedField[] {
  if (!Array.isArray(value)) return []
  const fields: ComputedField[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const name = (entry as { name?: unknown }).name
    if (typeof name !== 'string' || name === '' || !('jsonlogic' in entry)) continue
    fields.push({ name, jsonlogic: (entry as { jsonlogic: unknown }).jsonlogic })
  }
  return fields
}

/** Every `set_record` in a rule: the entity name (raw) and the id expression. */
export function collectSetRecordLookups(rule: unknown): Array<{ entity: string; idRule: unknown }> {
  const found: Array<{ entity: string; idRule: unknown }> = []
  walk(rule)
  return found

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!isLogic(node)) {
      Object.values(node).forEach(walk)
      return
    }
    const op = operatorOf(node)
    const args = argumentsOf(node)
    if (op === 'set_record' && args.length >= 3 && typeof args[1] === 'string') {
      found.push({ entity: args[1], idRule: args[2] })
    }
    args.forEach(walk)
  }
}

/**
 * Apply a JsonLogic rule against the data, with the Semantius operators. This
 * is the entry point rather than `evaluate` itself: importing this module is
 * what registers the operators the evaluator does not hold.
 *
 * `set_record` binds its name to the row `records` holds (or null) and then
 * evaluates the body. The fetch itself is the caller's job, so this is
 * synchronous.
 */
export function applyJsonLogic(
  rule: unknown,
  data: Record<string, unknown>,
  records?: RecordLookup,
): unknown {
  return evaluate(rule, data, records)
}

/** The rows `set_record` fetched for a form, by `cacheKey`; null is a row that does not exist. */
export type RecordCache = Map<string, Record<string, unknown> | null>

/**
 * A lookup over the rows a form has fetched. It also notes each row a rule asks
 * for that the cache does not hold yet, so the caller fetches exactly those and
 * evaluates again. That is how a `set_record` whose id reads another row, a `let`
 * or a list element gets its row, and why the id of a `set_record` in a branch
 * that is not taken is never asked for.
 */
export interface CachedRecords extends RecordLookup {
  /** The rows asked for that the cache does not hold yet, by cache key. */
  readonly missing: Map<string, { entity: string; id: string }>
  /** How many reads found no row in the cache. An evaluation that raised it read a row that has not arrived. */
  readonly misses: number
}

function missesOf(records: RecordLookup): number {
  return 'misses' in records ? (records as CachedRecords).misses : 0
}

// The value at a computed field's dotted name in the values, or undefined.
function valueAtPath(values: Record<string, unknown>, name: string): unknown {
  let value: unknown = values
  for (const key of name.split('.')) {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !Object.hasOwn(value, key)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

// Write a computed value into the rule data at its dotted name, as the server
// does with jsonb_set: only where the parent is an object, so `settings.theme` is
// written when `settings` is one and left out otherwise; a list on the path is
// left out as well. The objects on the path are copied, never the form's own.
// Answers whether the value was written.
function writeAtPath(data: Record<string, unknown>, name: string, value: unknown): boolean {
  const keys = name.split('.')
  let parent = data
  for (const key of keys.slice(0, -1)) {
    const child = parent[key]
    if (typeof child !== 'object' || child === null || Array.isArray(child)) return false
    const copy = { ...(child as Record<string, unknown>) }
    parent[key] = copy
    parent = copy
  }
  parent[keys[keys.length - 1]] = value
  return true
}

export interface EvaluateOptions {
  /** `$old` and `$mode`, as the server gives computed fields. */
  record?: RecordContext
  /** Told about each field whose rule threw; that field keeps its value. */
  onError?: (name: string, error: unknown) => void
}

/**
 * Evaluate every computed-field entry in listed order, so a later rule can read
 * an earlier result, at its dotted name as the server writes it. A field whose
 * rule read a `set_record` row the lookup does not hold yet is left out, and keeps
 * its value until the row has arrived; with no lookup, no row has. So is a field
 * the server would not write (see `writeAtPath`).
 */
export function evaluateComputedFields(
  entries: ComputedField[],
  values: Record<string, unknown>,
  records: RecordLookup = lookupFromCache(new Map()),
  options: EvaluateOptions = {},
): Record<string, unknown> {
  const data = withRuleContext(values, options.record)
  const updates: Record<string, unknown> = {}
  for (const entry of entries) {
    const before = missesOf(records)
    let next: unknown
    try {
      next = applyJsonLogic(entry.jsonlogic, data, records)
    } catch (error) {
      // The field keeps its value; the caller shows why. A rule that read a row
      // which has not arrived is evaluated again once it has.
      if (missesOf(records) === before) options.onError?.(entry.name, error)
      continue
    }
    if (missesOf(records) > before) continue
    if (writeAtPath(data, entry.name, next)) updates[entry.name] = next
  }
  return updates
}

/** Whether a computed field's value differs from what the values hold at its dotted name. */
export function computedValueChanged(values: Record<string, unknown>, name: string, next: unknown): boolean {
  return !Object.is(valueAtPath(values, name), next)
}

/** The cache key of a `set_record` row: the entity and the id's text (`recordIdText`). */
export function cacheKey(entity: string, id: string | null): string {
  return `${entity}:${id}`
}

/** A lookup over the cache that notes the rows it was asked for and does not hold (see `CachedRecords`). */
export function lookupFromCache(cache: RecordCache): CachedRecords {
  const missing = new Map<string, { entity: string; id: string }>()
  let misses = 0
  return {
    missing,
    get misses() {
      return misses
    },
    get(entity, id) {
      // No id, no row. The server refuses an empty id (90238), and the save says so.
      if (id === null || id === '') return null
      const key = cacheKey(entity, id)
      if (!cache.has(key)) {
        missing.set(key, { entity, id })
        misses += 1
        return null
      }
      return cache.get(key) ?? null
    },
  }
}

/**
 * The target entity's id column, from a form property that references it.
 * `set_record` only names the entity and the id value; the column is on the
 * reference field (`product_id.reference_table_id_column`), defaulting to `id`.
 */
export function idColumnForEntity(
  properties: Record<string, { reference_table?: string; reference_table_id_column?: string }> | undefined,
  entity: string,
): string {
  if (!properties) return 'id'
  for (const prop of Object.values(properties)) {
    if (prop?.reference_table === entity && prop.reference_table_id_column) {
      return prop.reference_table_id_column
    }
  }
  return 'id'
}

async function fetchRecord(
  entity: string,
  id: string,
  idColumn: string,
): Promise<Record<string, unknown> | null | undefined> {
  if (!IDENT.test(entity) || !IDENT.test(idColumn)) return undefined
  try {
    const res = await fetch(`/${entity}?${idColumn}=eq.${encodeURIComponent(id)}`)
    if (!res.ok) return undefined
    const rows: unknown = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) return null
    const row = rows[0]
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null
    return row as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Fetch the rows a lookup noted as missing into the cache. Answers whether any
 * arrived, a row or the answer that there is none. A failed fetch is not cached,
 * so a later change can retry it.
 */
async function fetchMissingRecords(
  records: CachedRecords,
  cache: RecordCache,
  idColumnFor: (entity: string) => string,
): Promise<boolean> {
  let arrived = false
  await Promise.all(
    [...records.missing].map(async ([key, { entity, id }]) => {
      const row = await fetchRecord(entity, id, idColumnFor(entity))
      if (row === undefined) return
      cache.set(key, row)
      arrived = true
    }),
  )
  return arrived
}

/**
 * Evaluate the computed fields, fetching the `set_record` rows their rules ask
 * for: evaluate, fetch what was missing, and evaluate again until no new row
 * arrives. Each round reaches one row further along a chain of rows read through
 * other rows. The errors are the last round's, when every row that could be
 * fetched is there.
 */
export async function evaluateComputedFieldsWithRecords(
  entries: ComputedField[],
  values: Record<string, unknown>,
  cache: RecordCache,
  idColumnFor: (entity: string) => string,
  record?: RecordContext,
): Promise<{ updates: Record<string, unknown>; errors: Record<string, unknown> }> {
  for (;;) {
    const records = lookupFromCache(cache)
    const errors: Record<string, unknown> = {}
    const updates = evaluateComputedFields(entries, values, records, {
      record,
      onError: (name, error) => {
        errors[name] = error
      },
    })
    if (records.missing.size === 0 || !(await fetchMissingRecords(records, cache, idColumnFor))) {
      return { updates, errors }
    }
  }
}

/**
 * Fetch the `set_record` rows the rules ask for against these values into the
 * cache, round by round as `evaluateComputedFieldsWithRecords` does. Answers
 * whether any row arrived, so the caller evaluates the rules again with it.
 */
export async function loadRuleRecords(
  rules: unknown[],
  values: Record<string, unknown>,
  cache: RecordCache,
  idColumnFor: (entity: string) => string,
): Promise<boolean> {
  let arrived = false
  for (;;) {
    const records = lookupFromCache(cache)
    const data = withRuleContext(values)
    for (const rule of rules) {
      try {
        applyJsonLogic(rule, data, records)
      } catch {
        // The form evaluates the rule itself and shows what it raises.
      }
    }
    if (records.missing.size === 0 || !(await fetchMissingRecords(records, cache, idColumnFor))) return arrived
    arrived = true
  }
}

/** Stable snapshot of the fields a computed rule may read (everything except the computed names). */
export function inputSnapshot(values: Record<string, unknown>, computedNames: Set<string>): string {
  const inputs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!computedNames.has(key)) inputs[key] = value
  }
  return JSON.stringify(inputs)
}
