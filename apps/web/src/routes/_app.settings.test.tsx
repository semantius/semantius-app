import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Route } from './_app.settings'
import { bootApp, renderInApp } from '@/test/appHarness'
import { clearRuntimeEnv } from '@/test/runtimeConfig'
import { clearSession } from '@/test/session'

/**
 * The settings page offers API keys everywhere except under
 * `VITE_BACKEND_TYPE=self_hosted`, where nothing exchanges them.
 *
 * The backend type is set through `window.__ENV__`, the runtime-config channel
 * `runtimeEnv()` reads first, and `bootApp()` runs the real `initConfig()` over
 * it against the real tenant, with the run's real session. The page is the
 * route's own component (`autoCodeSplitting` is off under Vitest so that
 * `Route.options.component` is the component itself), rendered in the app's
 * provider composition.
 *
 * The fetch spy has no implementation: every request still goes to the tenant.
 * It exists for the one thing the screen cannot show, that the card's requests
 * were NOT made.
 */

const SettingsPage = Route.options.component!

describe('settings page — API Keys card', () => {
  let fetchSpy: MockInstance<typeof fetch>
  const requested = (rpc: string) =>
    fetchSpy.mock.calls.some(([input]) => String(input).includes(`/rpc/${rpc}`))

  afterEach(() => {
    fetchSpy?.mockRestore()
    clearSession()
    clearRuntimeEnv()
  })

  it('is shown under the default backend type, and lists the keys', async () => {
    await bootApp()
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    const { queryClient } = renderInApp(<SettingsPage />)

    expect(await screen.findByRole('button', { name: 'Add new API key' })).toBeVisible()
    expect(screen.getByText('API Keys')).toBeVisible()
    // The spy sees the card's own request. This is what makes the absence
    // below an observation rather than a spy that sees nothing.
    await waitFor(() => expect(requested('list_api_keys')).toBe(true))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
  })

  it('is hidden under self_hosted, and neither lists nor generates keys', async () => {
    await bootApp({ VITE_BACKEND_TYPE: 'self_hosted' })
    fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderInApp(<SettingsPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    // The provider's own RPC call, made after the spy went in: the spy is
    // observing this test's requests.
    await waitFor(() => expect(requested('get_userinfo')).toBe(true))

    expect(screen.queryByText('API Keys')).toBeNull()
    // generate_api_key is sent only from this button's dialog.
    expect(screen.queryByRole('button', { name: 'Add new API key' })).toBeNull()
    expect(requested('list_api_keys')).toBe(false)
    expect(requested('generate_api_key')).toBe(false)
  })
})
