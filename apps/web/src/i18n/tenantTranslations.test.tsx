import { afterEach, describe, expect, it } from 'vitest'
import { setInterceptorToken } from '@/lib/apiClient'
import { initConfig } from '@/lib/config'
import { bootApp } from '@/test/appHarness'
import { testToken } from '@/test/session'
import type { EntityMetadata } from '@/types/metadata'
import {
  SAVE_PREFERENCES_RPC,
  SOURCE_LANGUAGE,
  activateLocale,
  canTranslate,
  isPreferenceRpcAbsent,
  readTranslations,
  sessionPreferenceFrom,
  targetAvailable,
  translate,
  translateTarget,
} from '@/i18n'

/**
 * The `prod` target and the platform's preferences, against the REAL tenant.
 *
 * The record store — the `/translations` endpoint on the tenant's own API — and
 * the `set_user_preferences` RPC come from platform work that has not landed
 * on the test tenant. So what is asserted here is the shape the app has to
 * survive TODAY: the endpoint answers a definitive "no such table", the layer
 * stands down, the shipped file still renders German, and translate mode is
 * not offered because a save would have nowhere to go. The moment the
 * endpoint lands, the first test below turns from "absent" to "a record".
 *
 * What DOES exist and is pinned: `get_schema` carries `module_slug` — every
 * metadata key starts with it — and names a child relation `table.field`.
 */

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

async function bodyCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.clone().json().catch(() => null)
  return body && typeof body === 'object' ? ((body as Record<string, unknown>).code as string) : undefined
}

const apiUrl = (await initConfig()).apiBaseUrl
const token = testToken()

afterEach(async () => {
  setInterceptorToken(null)
  await activateLocale({ language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE })
})

describe('the prod target on this tenant', () => {
  it('reads the record through the app\'s own API, or stands down on a definitive absence', async () => {
    await bootApp({ VITE_TRANSLATE_MODE: 'prod' })
    expect(translateTarget()).toEqual({ url: '', mode: 'prod' })

    // The relative url is what puts the API base and the bearer token on the
    // request — the same interceptor every API call goes through, and the
    // token it holds is the one AuthProviderWrapper hands it after login; no
    // provider is mounted here, so it is handed over directly.
    setInterceptorToken(token)
    const record = await readTranslations('de-DE')
    const probe = await api('/translations?locale=de-DE')
    if (probe.ok) {
      expect(record).not.toBeNull()
      expect(targetAvailable()).toBe(true)
      return
    }
    // The real 404 body. A bare 404 under the API base is a cold start, which
    // the fetch interceptor retries — only a PostgREST code is definitive.
    expect(await bodyCode(probe)).toBeTruthy()
    expect(record).toBeNull()
    expect(targetAvailable()).toBe(false)
    // An editor that cannot save is worse than no editor.
    expect(canTranslate(['admin'])).toBe(false)
  })

  it('still renders German from the shipped file when the record store is absent', async () => {
    await bootApp({ VITE_TRANSLATE_MODE: 'prod' })
    await activateLocale({ language: 'de-DE', locale: 'de-DE' })

    expect(translate('Log out')).toBe('Abmelden')
    expect(document.documentElement.lang).toBe('de-DE')
  })
})

describe('the platform features the preferences need', () => {
  it('recognizes an absent preferences RPC by its own code', async () => {
    const probe = await api(`/rpc/${SAVE_PREFERENCES_RPC}`, { method: 'POST', body: '{}' })
    if (probe.ok) return
    const error = new Error('probe', { cause: { status: probe.status, code: await bodyCode(probe) } })
    expect(isPreferenceRpcAbsent(error)).toBe(true)
    expect(isPreferenceRpcAbsent(new Error('probe', { cause: { status: 404 } }))).toBe(false)
  })

  it('reads no language preference off a get_userinfo that has no such column', async () => {
    const response = await api('/rpc/get_userinfo', { method: 'POST', body: '{}' })
    const info: Record<string, unknown> = await response.json()

    // ABSENT, not null. That distinction is what keeps a login on a platform
    // without the columns from clearing the language this browser chose.
    const preference = sessionPreferenceFrom(info, null)
    if ('language' in info) {
      expect(preference.language === null || typeof preference.language === 'string').toBe(true)
    } else {
      expect(preference.language).toBeUndefined()
      expect(preference.locale).toBeUndefined()
    }
  })
})

describe('the model the keys are built from', () => {
  it('get_schema names the module slug and shapes a child relation as table.field', async () => {
    const response = await api('/rpc/get_schema', { method: 'POST', body: JSON.stringify({ p_table_name: 'orders' }) })
    expect(response.ok, await response.clone().text()).toBe(true)
    const schema: EntityMetadata = await response.json()

    // The slug comes from the model, never from the route: a parent-filtered
    // view fetches ANOTHER entity's schema, and this is where its module is.
    expect(schema.table?.module_slug).toBe('nwind')
    expect(schema.table?.table_name).toBe('orders')
    for (const child of schema.children ?? []) {
      // `<child table>.<fk field>` — the two segments the child keys are built from.
      expect(child.id, child.id).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/)
    }
  })
})
