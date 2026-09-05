import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuth } from '@/hooks/useAuth'

/**
 * `useAuth` is `useContext(AuthContext)` plus one guard. The five tests that used
 * to be here built an `AuthContextType` by hand, pushed it through a real
 * `AuthContext.Provider`, and asserted the same object came back out — five
 * different ways of checking that React's context works, in a file named after
 * this app's authentication.
 *
 * What is actually this module's own behavior is the guard: reading the context
 * outside the provider must throw, loudly, rather than hand back `undefined` and
 * fail later on a property access somewhere else.
 *
 * The values the context really carries — a token, `userInfo` from the OIDC
 * userinfo endpoint, `rpcUserInfo` from `/rpc/get_userinfo`, `isAuthReady` — are
 * produced by `AuthProviderWrapper` against a real provider. Nothing is learned
 * by asserting a hand-written copy of them.
 */
describe('useAuth', () => {
  it('throws when used outside AuthProviderWrapper', () => {
    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within AuthProviderWrapper')
  })
})
