/**
 * Live evaluation of entity `computed_fields` (JsonLogic) against form values.
 *
 * The backend evaluates the same rules on every write. The form also evaluates
 * them when the user changes an input, so a disabled computed field (amount,
 * label, …) updates before save. Standard operators go through json-logic-js,
 * the same engine `input_type_rule` already uses. Semantius extensions that
 * json-logic-js cannot run as custom operations — `let` and `set_record` bind
 * a name *before* evaluating the body — are handled here; `concat` is an alias
 * of `cat` registered on the shared engine.
 */
import jsonLogic, { type RulesLogic } from 'json-logic-js'

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

function lookupsReady(rule: unknown, data: Record<string, unknown>, records?: RecordLookup): boolean {
  for (const { entity, idRule } of collectSetRecordLookups(rule)) {
    const id = applyJsonLogic(idRule, data, records)
    if (!records?.has(entity, id)) return false
  }
  return true
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
): Record<string, unknown> {
  const data = { ...values }
  const updates: Record<string, unknown> = {}
  for (const entry of entries) {
    if (!lookupsReady(entry.jsonlogic, data, records)) continue
    try {
      const next = applyJsonLogic(entry.jsonlogic, data, records)
      updates[entry.name] = next
      data[entry.name] = next
    } catch {
      // Unknown operator or a rule that cannot run in the browser: leave the field.
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
): Promise<void> {
  const pending = new Map<string, { entity: string; id: unknown }>()
  for (const entry of entries) {
    for (const { entity, idRule } of collectSetRecordLookups(entry.jsonlogic)) {
      const id = applyJsonLogic(idRule, values)
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
