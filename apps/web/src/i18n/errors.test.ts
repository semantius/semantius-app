import { describe, expect, it } from 'vitest'
import { compileMessageOrThrow } from '@lingui/message-utils/compileMessage'
import { translate } from './translate'
import {
  constraintNameOf,
  dollarToIcu,
  fillPlaceholders,
  foreignKeyTables,
  isVerbatimKey,
  parseServerError,
} from './errors'

/**
 * A server error, parsed. The four-step key resolution, the hint
 * normalization, and the `${…}` -> ICU conversion — each pinned against the
 * measured behavior of Lingui's compiler that motivated it.
 */

describe('parseServerError', () => {
  it('reads a platform error: the envelope in hint, the class-99 key scoped by entity', () => {
    const parsed = parseServerError({
      code: '99017',
      message: '${field} must be at least ${min} characters',
      hint: JSON.stringify({ hint: 'Try a shorter ${field}', field: 'module_slug', min: 3, entity: 'modules' }),
      details: null,
    })!

    expect(parsed.structured).toBe(true)
    expect(parsed.key).toBe('99017.modules')
    expect(parsed.keySegments).toEqual(['99017', 'modules'])
    expect(parsed.message).toBe('{field} must be at least {min} characters')
    expect(parsed.hint).toBe('Try a shorter {field}')
    // Every key but `hint` is a value — the reserved names included, so
    // `${entity}` and `${field}` are legitimate placeholders.
    expect(parsed.values).toEqual({ field: 'module_slug', min: 3, entity: 'modules' })
  })

  it('keys a class-90 error by its code alone, hint.code being display detail there', () => {
    const parsed = parseServerError({
      code: '90001',
      message: 'Nope',
      hint: JSON.stringify({ hint: 'Fix it', code: '12345' }),
    })!
    expect(parsed.key).toBe('90001')
  })

  it('takes hint.code as the key where the SQLSTATE is spoken for by the status', () => {
    const parsed = parseServerError({
      code: '42501',
      message: 'permission denied for ${entity}',
      hint: JSON.stringify({ hint: 'Ask an administrator', code: '90042', entity: 'orders' }),
    })!
    expect(parsed.key).toBe('90042')
    expect(parsed.structured).toBe(true)
    // The SQLSTATE stays untouched in `code`: the retry predicates read it.
    expect(parsed.code).toBe('42501')
  })

  it('keys a plain constraint error by SQLSTATE plus constraint name, verbatim', () => {
    const parsed = parseServerError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "modules_module_slug_key"',
      details: null,
      hint: null,
    })!
    expect(parsed.structured).toBe(false)
    expect(parsed.key).toBe('23505.modules_module_slug_key')
    // Unconverted: a plain sentence is never ICU-compiled.
    expect(parsed.message).toBe('duplicate key value violates unique constraint "modules_module_slug_key"')
  })

  it('keys a plain error with no constraint by its bare SQLSTATE', () => {
    const parsed = parseServerError({ code: '42703', message: 'column orders.nope does not exist' })!
    expect(parsed.key).toBe('42703')
    // Keying on the message would mint an entry per column name.
    expect(parsed.keyedByMessage).toBe(false)
  })

  it('keys a codeless error by its message — a gateway rejection, a client error', () => {
    const parsed = parseServerError({
      code: null,
      message: 'missing authentication credentials: required authorization bearer token in JWT format',
    })!
    expect(parsed.keyedByMessage).toBe(true)
    expect(parsed.key).toBe(parsed.message)
    expect(parsed.structured).toBe(false)
  })

  it('folds a plain-text hint into the one shape without marking the error structured', () => {
    const parsed = parseServerError({
      code: '42P01',
      message: 'relation "public.x" does not exist',
      hint: 'Perhaps you meant the table public._versions',
    })!
    expect(parsed.hint).toBe('Perhaps you meant the table public._versions')
    expect(parsed.structured).toBe(false)
    expect(parsed.values).toEqual({})
  })

  it('treats a malformed brace-led hint as suggestion text, not as undefined behavior', () => {
    const parsed = parseServerError({ code: '99001', message: 'x ${a}', hint: '{not json' })!
    expect(parsed.structured).toBe(false)
    expect(parsed.hint).toBe('{not json')
    // Unstructured, so the placeholder is NOT converted.
    expect(parsed.message).toBe('x ${a}')
  })

  it('reads detail and details alike, and answers null for a body with no message', () => {
    expect(parseServerError({ message: 'x', detail: 'a trace' })!.details).toBe('a trace')
    expect(parseServerError({ message: 'x', details: 'a trace' })!.details).toBe('a trace')
    expect(parseServerError({ code: '42703' })).toBeNull()
  })
})

describe('the constraint extractor', () => {
  it('reads the name PostgreSQL quotes, for any constraint kind', () => {
    expect(constraintNameOf('duplicate key value violates unique constraint "modules_module_slug_key"')).toBe(
      'modules_module_slug_key',
    )
    expect(
      constraintNameOf(
        'update or delete on table "regions" violates foreign key constraint "customers_region_id_fkey" on table "customers"',
      ),
    ).toBe('customers_region_id_fkey')
    expect(constraintNameOf('new row for relation "x" violates check constraint "positive"')).toBe('positive')
    expect(constraintNameOf('null value in column "x" violates not-null constraint')).toBeUndefined()
  })

  it('recovers both table names of a foreign-key violation', () => {
    expect(
      foreignKeyTables(
        'update or delete on table "regions" violates foreign key constraint "customers_region_id_fkey" on table "customers"',
      ),
    ).toEqual({ table: 'regions', referencing: 'customers' })
    expect(foreignKeyTables('something else')).toBeUndefined()
  })
})

describe('isVerbatimKey', () => {
  it('names a plain SQLSTATE key, not a platform one and not a message', () => {
    expect(isVerbatimKey('23505.modules_module_slug_key')).toBe(true)
    expect(isVerbatimKey('42703')).toBe(true)
    expect(isVerbatimKey('99017.modules')).toBe(false)
    expect(isVerbatimKey('90001')).toBe(false)
    expect(isVerbatimKey('Save')).toBe(false)
    expect(isVerbatimKey('module.nwind.name')).toBe(false)
  })
})

describe('dollarToIcu', () => {
  /** Render an ICU template the way the app does — through its own compiler. */
  function render(template: string, values: Record<string, unknown> = {}): string {
    return translate(template, values)
  }

  it('turns a placeholder into an ICU argument', () => {
    // Unconverted, Lingui compiles `min length ${ml}` to a stray `$` before an
    // argument it already claimed.
    expect(dollarToIcu('min length ${ml}')).toBe('min length {ml}')
    expect(render(dollarToIcu('min length ${ml}'), { ml: 3 })).toBe('min length 3')
  })

  it('keeps a literal brace literal', () => {
    // Unescaped, `{1,2}` does not throw: it compiles to an argument named `1`
    // with format `2` and the text silently disappears.
    const template = 'invalid input syntax for type integer: "${value}"'
    expect(render(dollarToIcu(template), { value: '{1,2}' })).toBe('invalid input syntax for type integer: "{1,2}"')
    const literal = dollarToIcu('the pair {1,2} is not ${what}')
    expect(literal).toBe("the pair '{'1,2'}' is not {what}")
    expect(render(literal, { what: 'a number' })).toBe('the pair {1,2} is not a number')
  })

  it('doubles an apostrophe, so it survives quoting and cannot start a quoted run', () => {
    // A lone apostrophe directly before an argument would swallow it.
    expect(render(dollarToIcu("it's ${x}"), { x: 'ok' })).toBe("it's ok")
    expect(render(dollarToIcu("value:'${x}'"), { x: 'ok' })).toBe("value:'ok'")
    expect(render(dollarToIcu("it's {1,2} and ${x}"), { x: 'ok' })).toBe("it's {1,2} and ok")
  })

  it('converts exactly the placeholder grammar and nothing looser', () => {
    // `${NOT_A_PARAM}` is literal text the backend never emits as a placeholder.
    // Quoted per brace: an ICU quote only opens directly before a brace, so
    // quoting the whole run would leave `'$` literal and the brace an argument.
    expect(dollarToIcu('${NOT_A_PARAM} and ${ok_1}')).toBe("$'{'NOT_A_PARAM'}' and {ok_1}")
    expect(render(dollarToIcu('${NOT_A_PARAM} and ${ok_1}'), { ok_1: 'x' })).toBe('${NOT_A_PARAM} and x')
  })

  it('produces a template every conversion compiles', () => {
    for (const template of ['${a}${b}', 'x', '${a}', '{', '}', "'", "''", '${a} {b} ${c}']) {
      expect(() => compileMessageOrThrow(dollarToIcu(template)), template).not.toThrow()
    }
  })
})

describe('fillPlaceholders', () => {
  it('supplies a missing or null argument as its own name', () => {
    // Lingui renders a missing simple argument as nothing and a missing plural
    // as NaN; a null count through a plural renders `0 items`, a confident lie.
    expect(fillPlaceholders('{field} must be at least {min} characters', { field: 'module_slug' })).toEqual({
      field: 'module_slug',
      min: '{min}',
    })
    expect(fillPlaceholders('{count, plural, one {# item} other {# items}}', { count: null })).toEqual({
      count: '{count}',
    })
  })

  it('leaves a template it cannot compile alone', () => {
    expect(fillPlaceholders('{broken', { a: 1 })).toEqual({ a: 1 })
  })
})
