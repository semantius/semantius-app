import { describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { bootApp, renderInApp } from '@/test/appHarness'
import { rpcQueryKey } from '@/hooks/useRpc'
import type { RouterContext } from '@/routes/__root'

/**
 * The router context carries the QueryClient, and every `router.update()` must
 * keep it.
 *
 * `get_schema` moved onto that client so a language switch — which calls
 * `router.invalidate()` so every route's `head()` re-runs and the tab title
 * follows the new language — costs no network. `router.update({ context })`
 * REPLACES the object, and `RouterContextUpdater` (AuthContext) runs on every
 * token change, so writing only `auth` there silently drops the client.
 *
 * Silently is the word: nothing breaks. The loader falls back to fetching, the
 * page renders, every test passes, and `get_schema` is simply refetched on
 * every switch forever. This is what notices.
 */

describe('the router context', () => {
  it('still carries the QueryClient after the auth update has run', async () => {
    await bootApp()
    const { router } = renderInApp(<div>anything</div>)

    // `renderInApp` hands back an AnyRouter, whose context is `{}` to the type
    // system; the SHAPE is what this asserts, so it is read as one.
    const contextOf = () => router.options.context as RouterContext

    // RouterContextUpdater writes the auth half in a layout effect, so by the
    // time the tree has rendered it has already replaced the context once.
    await waitFor(() => expect(contextOf().auth.isAuthenticated()).toBe(true))

    expect(contextOf().queryClient).toBeDefined()
  })

  it('is the same cache entry `useRpc` reads, so the loader fills it', () => {
    // The loader calls `rpcQueryKey(GET_SCHEMA, params)` and `useRpc` calls
    // `rpcQueryKey(rpcName, params)`. A key spelled out twice is a key that
    // drifts — the loader would fetch ALONGSIDE the hook rather than for it —
    // which is why the builder is exported rather than the array repeated.
    const params = { p_table_name: 'customers' }

    expect(rpcQueryKey('get_schema', params)).toEqual(['rpc', 'get_schema', params])
  })
})
