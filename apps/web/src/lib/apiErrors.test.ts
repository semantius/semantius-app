import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activateLocale, localeLayers, translate, type LocaleFile, type LocaleLayer } from '@/i18n'
import { appError } from './appError'
import { codeOf, renderError } from './apiErrors'

/**
 * One renderer for every error origin, in `node` with `translate` standing
 * in for a component's `t`. A test language is supplied through a layer of
 * the real store, so the lookups below are the real activation path.
 */

const TEST_LANGUAGE = 'xx-TEST'

const file: LocaleFile = {
  locale: TEST_LANGUAGE,
  messages: {
    'Authentication token is required': 'TOKEN NEEDED',
    '{field} is required for update': '{field} FEHLT',
    '23505.modules_module_slug_key': 'DIESER SLUG IST VERGEBEN',
    '99017.modules': '{field} BRAUCHT {min} ZEICHEN',
    '99017.modules.hint': 'KÜRZER: {field}',
    'missing authentication credentials': 'KEINE ANMELDUNG',
  },
}

const layer: LocaleLayer = {
  name: 'test',
  load: (language) => Promise.resolve(language === TEST_LANGUAGE ? file : null),
}

beforeEach(() => {
  localeLayers.push(layer)
})

afterEach(async () => {
  localeLayers.splice(localeLayers.indexOf(layer), 1)
  await activateLocale({ language: 'en-US', locale: 'en-US' })
})

const server = (body: Record<string, unknown>, status = 400) =>
  new Error(String(body.message), { cause: { ...body, status } })

describe('renderError', () => {
  it('renders an app error from its template and values, at display time', async () => {
    const error = appError({ message: '{field} is required for update', values: { field: 'id' } })
    expect(error.message).toBe('{field} is required for update')
    expect(renderError(error, translate).message).toBe('id is required for update')

    await activateLocale({ language: TEST_LANGUAGE, locale: TEST_LANGUAGE })
    // The same error, rendered again after a switch: nothing was frozen.
    expect(renderError(error, translate).message).toBe('id FEHLT')
    expect(renderError(appError({ message: 'Authentication token is required' }), translate).message).toBe(
      'TOKEN NEEDED',
    )
  })

  it('fills a value the app did not supply with its own name', () => {
    const error = appError({ message: '{field} is required for update' })
    expect(renderError(error, translate).message).toBe('{field} is required for update')
  })

  it('carries an app hint and details, and the transport facts on cause', () => {
    const error = appError(
      { message: 'Failed to fetch {table} ({status})', hint: 'Try again', values: { table: 'orders', status: 503 }, details: 'trace' },
      { status: 503, url: 'https://api/orders' },
    )
    expect(renderError(error, translate)).toEqual({ message: 'Failed to fetch orders (503)', hint: 'Try again', details: 'trace' })
    expect(error.cause).toMatchObject({ status: 503, url: 'https://api/orders', values: { table: 'orders', status: 503 } })
  })

  it('renders a platform error from its envelope, the English in the response as the fallback', async () => {
    const error = server({
      code: '99017',
      message: '${field} must be at least ${min} characters',
      hint: JSON.stringify({ hint: 'Try a shorter ${field}', field: 'module_slug', min: 3, entity: 'modules' }),
    })
    expect(renderError(error, translate)).toEqual({
      message: 'module_slug must be at least 3 characters',
      hint: 'Try a shorter module_slug',
      details: undefined,
    })

    await activateLocale({ language: TEST_LANGUAGE, locale: TEST_LANGUAGE })
    expect(renderError(error, translate)).toEqual({
      message: 'module_slug BRAUCHT 3 ZEICHEN',
      hint: 'KÜRZER: module_slug',
      details: undefined,
    })
  })

  it('leaves a value the server did not send visible rather than silently blank', () => {
    const error = server({
      code: '99017',
      message: '${field} must be at least ${min} characters',
      hint: JSON.stringify({ hint: 'x', field: 'module_slug' }),
    })
    expect(renderError(error, translate).message).toBe('module_slug must be at least {min} characters')
  })

  it('renders a plain server sentence verbatim, and translated under its SQLSTATE key', async () => {
    const error = server({
      code: '23505',
      message: 'duplicate key value violates unique constraint "modules_module_slug_key"',
      hint: null,
      details: null,
    })
    expect(renderError(error, translate).message).toBe(
      'duplicate key value violates unique constraint "modules_module_slug_key"',
    )
    await activateLocale({ language: TEST_LANGUAGE, locale: TEST_LANGUAGE })
    expect(renderError(error, translate).message).toBe('DIESER SLUG IST VERGEBEN')
  })

  it('never ICU-compiles a plain sentence', () => {
    const error = server({ code: '22P02', message: 'invalid input syntax for type integer: "{1,2}"' })
    expect(renderError(error, translate).message).toBe('invalid input syntax for type integer: "{1,2}"')
  })

  it('explains a foreign-key violation with the model label, unless the tenant translated the key', async () => {
    const error = server({
      code: '23503',
      message:
        'update or delete on table "regions" violates foreign key constraint "customers_region_id_fkey" on table "customers"',
    })
    expect(renderError(error, translate, { label: 'Region' }).message).toBe(
      'Region is still used by records in customers and cannot be deleted.',
    )
    expect(renderError(error, translate).message).toBe(
      'regions is still used by records in customers and cannot be deleted.',
    )
  })

  it('keys a codeless server error on its own text', async () => {
    const error = server({ code: null, message: 'missing authentication credentials' }, 401)
    expect(renderError(error, translate).message).toBe('missing authentication credentials')
    await activateLocale({ language: TEST_LANGUAGE, locale: TEST_LANGUAGE })
    expect(renderError(error, translate).message).toBe('KEINE ANMELDUNG')
  })

  it('shows details as text and reads either spelling', () => {
    expect(renderError(server({ code: 'PGRST100', message: 'x', details: 'a\ntrace' }), translate).details).toBe(
      'a\ntrace',
    )
    expect(renderError(server({ message: 'x', detail: 'a trace' }), translate).details).toBe('a trace')
  })

  it('falls back to the message of an error with no body, and to a sentence for nothing at all', () => {
    expect(renderError(new TypeError('Failed to fetch'), translate).message).toBe('Failed to fetch')
    expect(renderError(undefined, translate).message).toBe('An unexpected error occurred. Please try again.')
  })
})

describe('codeOf', () => {
  it('reads the PostgREST code off cause', () => {
    expect(codeOf(server({ code: '42P01', message: 'x' }))).toBe('42P01')
    expect(codeOf(new Error('x'))).toBeUndefined()
  })
})
