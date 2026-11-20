/**
 * Derived in part from json-logic-js 2.0.5 (https://github.com/jwadhams/json-logic-js),
 * Copyright (c) 2015 Jeremy Wadhams, used under the MIT License in ./LICENSE.
 * See ./README.md and THIRD-PARTY-NOTICES.md at the repository root.
 *
 * The JsonLogic evaluator the browser runs rules with: a port of the dispatch of
 * `evaluate_json_logic` in the backend's 0050_jsonlogic.sql, which is the
 * reference. The backend's own test cases (0100_test_jsonlogic.json) run against
 * both; `computedFields.test.ts` reads them.
 *
 * Twelve operators are dispatched before any of their arguments is evaluated, as
 * they are there. `if`, `?:`, `and` and `or` evaluate only the branch they take.
 * `filter`, `map`, `all`, `none` and `some` evaluate their logic with each element
 * as the data, and `reduce` with `{current, accumulator}`. `let` and `set_record`
 * add their name to the data they are given. Every other operator gets its
 * arguments evaluated exactly once and is called with the data as `this`.
 *
 * Exactly once matters: an evaluated argument is a value, and a value that happens
 * to be an object with one key would read as an operation if it were evaluated
 * again. The app's earlier evaluator did that to a nested `let` or `set_record`: it
 * put the value back into the rule before handing the rule to json-logic-js.
 *
 * This module holds the dispatch, the operators that read the data (`var`,
 * `missing`), and `!`, `!!`, `merge` and `log` (at the bottom). Every other
 * operator is registered with `addOperation`: arithmetic, comparison, text and the
 * Semantius operators by computedFields.ts, the date operators by jsonLogicDates.ts.
 * So a rule is evaluated through `applyJsonLogic` in computedFields.ts, whose
 * import is what registers them.
 */

/** Look up a `set_record` row already fetched for this evaluation, by the id's text (`recordIdText`): the row, or null. */
export interface RecordLookup {
  get: (entity: string, id: string | null) => Record<string, unknown> | null
}

// An operator is called with the data the rule runs against as `this`, which is
// how `var` reads it and value_changed reads `$old` beside the record.
type Operation = (this: any, ...args: any[]) => unknown

const operations = new Map<string, Operation>()

export function addOperation(name: string, operation: Operation): void {
  operations.set(name, operation)
}

/**
 * An error in the shape the server raises it (the backend's
 * docs/error-contract.md): the SQLSTATE, the `${name}` message template and,
 * when there are any, the parameters as the JSON hint — the body PostgREST
 * would hand the app. `renderError` (lib/apiErrors.ts) shows and translates it
 * by its code, exactly as it does the server's own. `error.message` is the
 * template, uninterpolated, as an `appError`'s is.
 */
export function serverError(code: string, message: string, params?: Record<string, unknown>): Error {
  return new Error(message, { cause: { code, message, ...(params ? { hint: JSON.stringify(params) } : {}) } })
}

/** An operation: an object with exactly one key, the operator. Anything else is a value. */
export function isLogic(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1
}

export function operatorOf(rule: Record<string, unknown>): string {
  return Object.keys(rule)[0]
}

/** An operation's arguments: a single argument that is not a list is a list of one. */
export function argumentsOf(rule: Record<string, unknown>): unknown[] {
  const values = rule[operatorOf(rule)]
  return Array.isArray(values) ? values : [values]
}

/** JsonLogic truthiness, as the server's jl_truthy decides it: an empty list is false, an empty object true. */
export function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

/** Two texts in code-point order, as the server's `COLLATE "C"` compares them: -1, 0 or 1. */
export function compareText(a: string, b: string): number {
  // JavaScript's < compares UTF-16 code units. That agrees with code points except
  // above U+FFFF, where a surrogate pair sorts below U+E000 there and above it here.
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!
    const y = b.codePointAt(j)!
    if (x !== y) return x < y ? -1 : 1
    i += x > 0xffff ? 2 : 1
    j += y > 0xffff ? 2 : 1
  }
  return Number(i < a.length) - Number(j < b.length)
}

// A number as PostgreSQL's numeric writes it: never with an exponent, so 1e21 is
// 1000000000000000000000 and 1e-7 is 0.0000001.
function numericText(value: number): string {
  const text = String(value)
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(text)
  if (!match) return text
  const [, sign, lead, rest = '', exponent] = match
  const digits = lead + rest
  const point = 1 + Number(exponent)
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

const utf8 = new TextEncoder()

// jsonb stores an object's keys shorter first, by their length in UTF-8 bytes, and
// keys of one length bytewise, which is code-point order.
function compareKeys(a: string, b: string): number {
  return utf8.encode(a).length - utf8.encode(b).length || compareText(a, b)
}

/**
 * A JSON value as PostgreSQL writes jsonb as text (`value::text`): a space after
 * every comma and colon, and an object's keys in jsonb's order. A number that a
 * rule wrote with trailing zeros (`10.50`) has lost them when the rule was parsed
 * as JSON, so it is written without them here and with them there.
 */
export function jsonbText(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return numericText(value)
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
  entries.sort(([a], [b]) => compareKeys(a, b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${jsonbText(item)}`).join(', ')}}`
}

/**
 * The id a `set_record` looks its row up by: the text the server hands
 * get_record_by_id. Text is itself and anything else its jsonb text, so a whole
 * number has no fraction and `[5]` stays `"[5]"`, which no integer key matches,
 * instead of reading as 5. Null is no id.
 */
export function recordIdText(id: unknown): string | null {
  if (id === null || id === undefined) return null
  return typeof id === 'string' ? id : jsonbText(id)
}

// The name of a `let` or `set_record`, as the server reads it (`vals ->> 0`): a
// text is itself, anything else its jsonb text. The server refuses a null name
// only when it binds it, after the value is evaluated, so an error in the value
// comes first. A number written as `1.0` lost its fraction when the rule was
// parsed, so the name is `1` here and `1.0` there.
function bindingName(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) throw serverError('22023', 'argument 1: key must not be null')
  return jsonbText(value)
}

// The data a `let` or `set_record` body runs against: the name added to the data,
// or to an empty object when the data is not one. Inside a list operator the data
// is the element, which can be a number, a text, a boolean, null or a list; the
// server replaces such data in the same way, so the body can read the name.
function bind(data: unknown, name: string, value: unknown): Record<string, unknown> {
  const base = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {}
  return { ...base, [name]: value }
}

/**
 * Evaluate a rule against the data. `set_record` reads its row from `records`
 * (null when it is not there); fetching it is the caller's job, so this is
 * synchronous. A missing rule, or a missing argument a control operator
 * evaluates, is null, as on the server.
 */
export function evaluate(rule: unknown, data: unknown, records?: RecordLookup): unknown {
  if (rule === undefined || rule === null) return null
  if (Array.isArray(rule)) return rule.map((item) => evaluate(item, data, records))
  if (!isLogic(rule)) return rule

  const op = operatorOf(rule)
  const args = argumentsOf(rule)

  switch (op) {
    case 'if':
    case '?:': {
      let i = 0
      for (; i < args.length - 1; i += 2) {
        if (truthy(evaluate(args[i], data, records))) return evaluate(args[i + 1], data, records)
      }
      // The one argument left over is the else branch.
      return i === args.length - 1 ? evaluate(args[i], data, records) : null
    }
    case 'and': {
      let current: unknown = null
      for (const arg of args) {
        current = evaluate(arg, data, records)
        if (!truthy(current)) return current
      }
      return current
    }
    case 'or': {
      let current: unknown = null
      for (const arg of args) {
        current = evaluate(arg, data, records)
        if (truthy(current)) return current
      }
      return current
    }
    case 'filter': {
      const list = evaluate(args[0], data, records)
      if (!Array.isArray(list)) return []
      return list.filter((element) => truthy(evaluate(args[1], element, records)))
    }
    case 'map': {
      const list = evaluate(args[0], data, records)
      if (!Array.isArray(list)) return []
      return list.map((element) => evaluate(args[1], element, records))
    }
    case 'reduce': {
      const list = evaluate(args[0], data, records)
      const initial = args.length >= 3 ? evaluate(args[2], data, records) : null
      if (!Array.isArray(list)) return initial
      return list.reduce((accumulator, current) => evaluate(args[1], { current, accumulator }, records), initial)
    }
    case 'all': {
      const list = evaluate(args[0], data, records)
      if (!Array.isArray(list) || list.length === 0) return false
      return list.every((element) => truthy(evaluate(args[1], element, records)))
    }
    case 'none': {
      const list = evaluate(args[0], data, records)
      if (!Array.isArray(list) || list.length === 0) return true
      return !list.some((element) => truthy(evaluate(args[1], element, records)))
    }
    case 'some': {
      const list = evaluate(args[0], data, records)
      if (!Array.isArray(list) || list.length === 0) return false
      return list.some((element) => truthy(evaluate(args[1], element, records)))
    }
    case 'let': {
      // {"let": [name, value, body]}
      const value = evaluate(args[1], data, records)
      return evaluate(args[2], bind(data, bindingName(args[0]), value), records)
    }
    case 'set_record': {
      // {"set_record": [name, entity, id, body]}: the name is bound to the row, or to
      // null when there is none. The server refuses an id its key cannot hold
      // (90238); the browser has no row for one, so the form shows the rule's answer
      // for null and the server refuses the save.
      const entity = args[1]
      const id = recordIdText(evaluate(args[2], data, records))
      const record = typeof entity === 'string' ? (records?.get(entity, id) ?? null) : null
      return evaluate(args[3], bind(data, bindingName(args[0]), record), records)
    }
  }

  // Every other operator: its arguments first, depth-first, then the operator.
  const values = args.map((arg) => evaluate(arg, data, records))
  const operation = operations.get(op)
  if (!operation) throw serverError('90910', 'Unrecognized operation: ${op}', { op })
  return operation.apply(data, values)
}

/** A value as text, as the server's jl_to_text makes it: null and a missing value are empty, text is itself, anything else its jsonb text. */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : jsonbText(value)
}

// The operators that read the data, as the server's do.

// The value at a dotted path in the data, or the fallback (null when there is
// none) where the path finds nothing; no path is the data itself. The walk follows
// the keys of objects, own keys only, and a segment indexes a list only when it is
// all digits. Text, a number or a boolean has no keys, so nothing reaches a
// JavaScript property: `tags.length`, `name.0` and `x.constructor` find nothing.
function readPath(data: unknown, path: unknown, fallback: unknown): unknown {
  const notFound = fallback === undefined ? null : fallback
  if (path === undefined || path === null || path === '') return data
  let value = data
  for (const key of textOf(path).split('.')) {
    if (Array.isArray(value)) {
      // The server casts the segment to an int, so a larger index finds nothing.
      if (!/^[0-9]+$/.test(key) || Number(key) > 2147483647) return notFound
      value = value[Number(key)]
    } else if (typeof value === 'object' && value !== null) {
      value = Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined
    } else {
      return notFound
    }
    if (value === undefined) return notFound
  }
  return value
}

addOperation('var', function readVar(this: unknown, path: unknown, fallback: unknown) {
  return readPath(this, path, fallback)
})

/**
 * The keys whose value is null, empty text or not there. The keys are the
 * arguments, or the one argument when it is the only one and is a list.
 */
export function missingKeys(data: unknown, args: unknown[]): unknown[] {
  const keys = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return keys.filter((key) => {
    const value = readPath(data, key, undefined)
    return value === null || value === ''
  })
}

addOperation('missing', function missing(this: unknown, ...args: unknown[]) {
  return missingKeys(this, args)
})

// Operators of the json-logic-js library (2.0.5) whose answers are the server's
// as they stand; the backend's test cases hold them to it.

addOperation('!', (value: unknown) => !truthy(value))
addOperation('!!', (value: unknown) => truthy(value))

addOperation('log', (value: unknown) => {
  console.log(value)
  return value
})

addOperation('merge', (...args: unknown[]) => args.reduce<unknown[]>((merged, arg) => merged.concat(arg), []))
