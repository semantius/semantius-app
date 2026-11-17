/**
 * Live evaluation of entity `computed_fields` (JsonLogic) against form values.
 *
 * The backend evaluates the same rules on every write. The form also evaluates
 * them when the user changes an input, so a disabled computed field (amount,
 * label, …) updates before save. Standard operators go through json-logic-js,
 * the same engine `input_type_rule` already uses. Semantius extensions that
 * json-logic-js cannot run as custom operations — `let` and `set_record` bind
 * a name *before* evaluating the body — are handled here; `concat`, `is_match`,
 * `has_permission`, the date operators, and arithmetic, ordering and equality as
 * the server decides them are registered on the shared engine, and so are
 * `value_changed`, `require_permission` and `throw_error`. The two that read the
 * database (`is_raci_actor`, `has_consultation`) are registered too, and throw
 * that they cannot run in the browser. Every error an operator throws has the
 * server's shape (`serverError`), so the form renders it as the server words it.
 */
import jsonLogic, { type RulesLogic } from 'json-logic-js'
import { appError } from '@/lib/appError'
import { epochSecondsOf, registerDateOperators, serverError } from '@/lib/jsonLogicDates'
import { ruleUserHasPermission, withRuleContext, type RecordContext } from '@/lib/ruleContext'

export interface ComputedField {
  name: string
  jsonlogic: unknown
}

/** Look up a `set_record` row already fetched for this evaluation. */
export interface RecordLookup {
  get: (entity: string, id: unknown) => Record<string, unknown> | null
  has: (entity: string, id: unknown) => boolean
}

const IDENT = /^[a-zA-Z0-9_-]+$/
const EXTENSIONS = new Set(['let', 'set_record'])

jsonLogic.add_operation('concat', function concat(...args: unknown[]) {
  return args.join('')
})

jsonLogic.add_operation('has_permission', function hasPermission(name: unknown) {
  return ruleUserHasPermission(String(name))
})

// Null never matches, as on the server: reading it as "" would let "^$" match a missing value.
jsonLogic.add_operation('is_match', function isMatch(value: unknown, pattern: unknown) {
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
// JSON has no Infinity and no NaN. Each operator below computes what json-logic-js
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
  jsonLogic.add_operation(operator, function arithmetic(...args: unknown[]) {
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
// strings compare as text, by code unit. Otherwise each side is a number: text
// through numberOfText, so an ISO date orders by its instant, and anything else as
// the server's jl_to_number reads it (null, an array and an object are 0). Text that
// carries no number makes the comparison false, as NaN does in JavaScript.
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
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
  jsonLogic.add_operation(operator, function order(a: unknown, b: unknown, c?: unknown) {
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

jsonLogic.add_operation('==', (a: unknown, b: unknown) => looseEqual(a, b))
jsonLogic.add_operation('!=', (a: unknown, b: unknown) => !looseEqual(a, b))
jsonLogic.add_operation('===', (a: unknown, b: unknown) => strictEqual(a, b))
jsonLogic.add_operation('!==', (a: unknown, b: unknown) => !strictEqual(a, b))

// A value as text, as the server's jl_to_text makes it: null and a missing
// argument are empty, text is itself, anything else its JSON.
function jsonText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// json-logic-js calls an operator with the data the rule runs against as
// `this`, which is how value_changed reads `$old` beside the record.
type RuleData = Record<string, unknown> | undefined

// Whether a field differs from the stored row, as the server decides it: true
// when there is no `$old` (a new record); otherwise `$old.<field>` against
// `<field>` with IS DISTINCT FROM on jsonb, so a field missing on one side
// differs from one that is null, and arrays and objects compare by value.
jsonLogic.add_operation('value_changed', function valueChanged(this: RuleData, field: unknown) {
  const old = this?.$old
  if (old === null || old === undefined) return true
  const key = jsonText(field)
  // `->` on anything but an object finds no key, as on the server.
  const isObject = typeof old === 'object' && !Array.isArray(old)
  const before = isObject && Object.hasOwn(old, key) ? (old as Record<string, unknown>)[key] : undefined
  const now = this && Object.hasOwn(this, key) ? this[key] : undefined
  if (before === undefined || now === undefined) return before !== now
  return !jsonEqual(before, now)
})

// true when the signed-in user holds the permission; otherwise what the
// server's rbac.require_permission raises.
jsonLogic.add_operation('require_permission', function requirePermission(name: unknown) {
  const permission = jsonText(name)
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
jsonLogic.add_operation('throw_error', function throwError(message: unknown, code: unknown, params: unknown) {
  const errorCode = code === null || code === undefined ? '99000' : jsonText(code)
  if (!/^99[0-9]{3}$/.test(errorCode)) {
    throw serverError('90911', 'throw_error code must be a class 99 number, not ${code_given}', { code_given: errorCode })
  }
  const hint: Record<string, unknown> = {}
  if (Array.isArray(params)) {
    if (params.length % 2 !== 0) {
      throw serverError('90914', 'throw_error parameters must be a flat list of name and value pairs')
    }
    for (let i = 0; i < params.length; i += 2) {
      const name = jsonText(params[i])
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
  throw serverError(errorCode, jsonText(message), hint)
})

// The two operators that read the database: known here, so a rule using one is
// not an unknown operator, but they cannot be evaluated in the browser.
for (const operator of ['is_raci_actor', 'has_consultation']) {
  jsonLogic.add_operation(operator, function cannotRun() {
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

function isLogic(value: unknown): value is Record<string, unknown> {
  return jsonLogic.is_logic(value)
}

function operatorOf(rule: Record<string, unknown>): string {
  return jsonLogic.get_operator(rule)
}

function argsOf(rule: Record<string, unknown>): unknown[] {
  const raw = jsonLogic.get_values(rule)
  return Array.isArray(raw) ? raw : [raw]
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
    const args = argsOf(node)
    if (op === 'set_record' && args.length >= 3 && typeof args[1] === 'string') {
      found.push({ entity: args[1], idRule: args[2] })
    }
    args.forEach(walk)
  }
}

function containsExtension(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(containsExtension)
  if (!isLogic(node)) return false
  if (EXTENSIONS.has(operatorOf(node))) return true
  return argsOf(node).some(containsExtension)
}

/**
 * Apply a JsonLogic rule, including Semantius `let` / `set_record`.
 *
 * `set_record` binds `name` to the looked-up row (or null) and then evaluates
 * the body. The fetch itself is the caller's job — this is synchronous, like
 * `jsonLogic.apply`.
 */
export function applyJsonLogic(
  rule: unknown,
  data: Record<string, unknown>,
  records?: RecordLookup,
): unknown {
  if (Array.isArray(rule)) return rule.map((item) => applyJsonLogic(item, data, records))
  if (!isLogic(rule)) return rule

  const op = operatorOf(rule)
  const args = argsOf(rule)

  if (op === 'let') {
    const [name, valueRule, body] = args
    if (typeof name !== 'string') return null
    const value = applyJsonLogic(valueRule, data, records)
    return applyJsonLogic(body, { ...data, [name]: value }, records)
  }

  if (op === 'set_record') {
    const [name, entity, idRule, body] = args
    if (typeof name !== 'string' || typeof entity !== 'string') return null
    const id = applyJsonLogic(idRule, data, records)
    const record = records?.get(entity, id) ?? null
    return applyJsonLogic(body, { ...data, [name]: record }, records)
  }

  if (containsExtension(rule)) {
    const rewritten = rewriteExtensions(rule, data, records)
    return jsonLogic.apply(rewritten as RulesLogic, data)
  }

  return jsonLogic.apply(rule as RulesLogic, data)
}

/** Replace nested `let` / `set_record` with their values so json-logic-js can run the rest. */
function rewriteExtensions(
  rule: unknown,
  data: Record<string, unknown>,
  records?: RecordLookup,
): unknown {
  if (Array.isArray(rule)) return rule.map((item) => rewriteExtensions(item, data, records))
  if (!isLogic(rule)) return rule
  const op = operatorOf(rule)
  if (EXTENSIONS.has(op)) return applyJsonLogic(rule, data, records)
  const args = argsOf(rule)
  if (!args.some(containsExtension)) return rule
  return { [op]: args.map((arg) => rewriteExtensions(arg, data, records)) }
}

/** Whether every `set_record` row the rule names is in `records`. */
export function lookupsReady(rule: unknown, data: Record<string, unknown>, records?: RecordLookup): boolean {
  for (const { entity, idRule } of collectSetRecordLookups(rule)) {
    const id = applyJsonLogic(idRule, data, records)
    if (!records?.has(entity, id)) return false
  }
  return true
}

export interface EvaluateOptions {
  /** `$old` and `$mode`, as the server gives computed fields. */
  record?: RecordContext
  /** Told about each field whose rule threw; that field keeps its value. */
  onError?: (name: string, error: unknown) => void
}

/**
 * Evaluate every computed-field entry in listed order, so a later rule can
 * read an earlier result. Fields whose `set_record` rows are not in `records`
 * yet are skipped (the form keeps the previous value until the fetch lands).
 */
export function evaluateComputedFields(
  entries: ComputedField[],
  values: Record<string, unknown>,
  records?: RecordLookup,
  options: EvaluateOptions = {},
): Record<string, unknown> {
  const data = withRuleContext(values, options.record)
  const updates: Record<string, unknown> = {}
  for (const entry of entries) {
    if (!lookupsReady(entry.jsonlogic, data, records)) continue
    try {
      const next = applyJsonLogic(entry.jsonlogic, data, records)
      updates[entry.name] = next
      data[entry.name] = next
    } catch (error) {
      // The field keeps its value; the caller shows why.
      options.onError?.(entry.name, error)
    }
  }
  return updates
}

export function cacheKey(entity: string, id: unknown): string {
  return `${entity}:${String(id)}`
}

export function lookupFromCache(
  cache: Map<string, Record<string, unknown> | null>,
): RecordLookup {
  return {
    get(entity, id) {
      if (id === null || id === undefined || id === '') return null
      return cache.get(cacheKey(entity, id)) ?? null
    },
    has(entity, id) {
      if (id === null || id === undefined || id === '') return true
      return cache.has(cacheKey(entity, id))
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
  id: unknown,
  idColumn: string,
): Promise<Record<string, unknown> | null | undefined> {
  if (!IDENT.test(entity) || !IDENT.test(idColumn)) return undefined
  if (id === null || id === undefined || id === '') return null
  try {
    const res = await fetch(`/${entity}?${idColumn}=eq.${encodeURIComponent(String(id))}`)
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
 * Ensure every `set_record` id currently in `values` is in `cache`.
 * Failed fetches are not cached, so a later change can retry.
 */
export async function loadSetRecords(
  entries: ComputedField[],
  values: Record<string, unknown>,
  cache: Map<string, Record<string, unknown> | null>,
  idColumnFor: (entity: string) => string,
  record?: RecordContext,
): Promise<void> {
  const pending = new Map<string, { entity: string; id: unknown }>()
  // The same data evaluateComputedFields looks the row up with, or an id rule
  // reading a reserved variable caches under a key that lookup never asks for.
  const data = withRuleContext(values, record)
  for (const entry of entries) {
    for (const { entity, idRule } of collectSetRecordLookups(entry.jsonlogic)) {
      const id = applyJsonLogic(idRule, data)
      const key = cacheKey(entity, id)
      if (id === null || id === undefined || id === '') {
        cache.set(key, null)
        continue
      }
      if (!cache.has(key) && !pending.has(key)) pending.set(key, { entity, id })
    }
  }
  await Promise.all(
    [...pending].map(async ([key, { entity, id }]) => {
      const row = await fetchRecord(entity, id, idColumnFor(entity))
      if (row !== undefined) cache.set(key, row)
    }),
  )
}

/** Stable snapshot of the fields a computed rule may read (everything except the computed names). */
export function inputSnapshot(values: Record<string, unknown>, computedNames: Set<string>): string {
  const inputs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!computedNames.has(key)) inputs[key] = value
  }
  return JSON.stringify(inputs)
}
