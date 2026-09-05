import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAuth } from '@/hooks/useAuth'
import { AuthContext, type AuthContextType } from '@/contexts/AuthContext'
import type { ReactNode } from 'react'

describe('useAuth', () => {
  it('returns auth context with all required properties', () => {
    const mockContext: AuthContextType = {
      token: 'test-token',
      tokenData: undefined,
      idToken: undefined,
      idTokenData: undefined,
      logIn: vi.fn(),
      refreshAccessToken: vi.fn(),
      login: vi.fn(),
      logOut: vi.fn(),
      error: null,
      loginInProgress: false,
      userInfo: { sub: 'user-123', name: 'Test User', email: 'test@example.com' },
      userInfoLoading: false,
      userInfoError: null,
      rpcUserInfo: { user_id: 'user-123', tenant_id: 'tenant-456' },
      rpcUserInfoLoading: false,
      rpcUserInfoError: null,
      isAuthReady: true,
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockContext}>{children}</AuthContext.Provider>
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.token).toBe('test-token')
    expect(result.current.userInfo).toEqual({
      sub: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    })
    expect(result.current.rpcUserInfo).toEqual({
      user_id: 'user-123',
      tenant_id: 'tenant-456',
    })
    expect(result.current.isAuthReady).toBe(true)
  })

  it('returns loading states correctly', () => {
    const mockContext: AuthContextType = {
      token: 'test-token',
      tokenData: undefined,
      idToken: undefined,
      idTokenData: undefined,
      logIn: vi.fn(),
      refreshAccessToken: vi.fn(),
      login: vi.fn(),
      logOut: vi.fn(),
      error: null,
      loginInProgress: false,
      userInfo: null,
      userInfoLoading: true,
      userInfoError: null,
      rpcUserInfo: null,
      rpcUserInfoLoading: true,
      rpcUserInfoError: null,
      isAuthReady: false,
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockContext}>{children}</AuthContext.Provider>
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.userInfoLoading).toBe(true)
    expect(result.current.rpcUserInfoLoading).toBe(true)
    expect(result.current.isAuthReady).toBe(false)
  })

  it('returns error states correctly', () => {
    const userInfoError = new Error('Failed to fetch userinfo')
    const rpcUserInfoError = new Error('Failed to fetch RPC userinfo')

    const mockContext: AuthContextType = {
      token: 'test-token',
      tokenData: undefined,
      idToken: undefined,
      idTokenData: undefined,
      logIn: vi.fn(),
      refreshAccessToken: vi.fn(),
      login: vi.fn(),
      logOut: vi.fn(),
      error: null,
      loginInProgress: false,
      userInfo: null,
      userInfoLoading: false,
      userInfoError,
      rpcUserInfo: null,
      rpcUserInfoLoading: false,
      rpcUserInfoError,
      isAuthReady: false,
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockContext}>{children}</AuthContext.Provider>
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.userInfoError).toBe(userInfoError)
    expect(result.current.rpcUserInfoError).toBe(rpcUserInfoError)
    expect(result.current.isAuthReady).toBe(false)
  })

  it('throws error when used outside AuthProviderWrapper', () => {
    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within AuthProviderWrapper')
  })

  it('provides OAuth methods from the context', () => {
    const mockLogIn = vi.fn()
    const mockLogin = vi.fn()
    const mockLogOut = vi.fn()

    const mockContext: AuthContextType = {
      token: 'test-token',
      tokenData: undefined,
      idToken: undefined,
      idTokenData: undefined,
      logIn: mockLogIn,
      refreshAccessToken: vi.fn(),
      login: mockLogin,
      logOut: mockLogOut,
      error: null,
      loginInProgress: false,
      userInfo: null,
      userInfoLoading: false,
      userInfoError: null,
      rpcUserInfo: null,
      rpcUserInfoLoading: false,
      rpcUserInfoError: null,
      isAuthReady: false,
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockContext}>{children}</AuthContext.Provider>
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.logIn).toBe(mockLogIn)
    expect(result.current.login).toBe(mockLogin)
    expect(result.current.logOut).toBe(mockLogOut)
  })
})
