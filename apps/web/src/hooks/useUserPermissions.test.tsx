import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUserHasPermission } from './useUserPermissions'
import { AuthContext, type AuthContextType } from '@/contexts/AuthContext'
import type { ReactNode } from 'react'

// Helper to create a minimal auth context for testing
const createMockAuth = (overrides?: Partial<AuthContextType>): AuthContextType => ({
  token: '',
  tokenData: undefined,
  idToken: undefined,
  idTokenData: undefined,
  logIn: () => {},
  refreshAccessToken: () => {},
  login: () => {},
  logOut: () => {},
  error: null,
  loginInProgress: false,
  userInfo: null,
  userInfoLoading: false,
  userInfoError: null,
  rpcUserInfo: null,
  rpcUserInfoLoading: false,
  rpcUserInfoError: null,
  isAuthReady: true,
  ...overrides,
})

describe('permissions', () => {
  describe('useUserHasPermission', () => {
    it('returns false when rpcUserInfo is null', () => {
      const mockAuth = createMockAuth({ rpcUserInfo: null })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission('customers.edit'), { wrapper })
      expect(result.current).toBe(false)
    })

    it('returns false when permissions array is missing', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: { email: 'test@example.com' },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission('customers.edit'), { wrapper })
      expect(result.current).toBe(false)
    })

    it('returns false when permissions is not an array', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: { permissions: 'not-an-array' },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission('customers.edit'), { wrapper })
      expect(result.current).toBe(false)
    })

    it('returns true when user has the permission', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: {
          permissions: ['customers.read', 'customers.edit', 'orders.read']
        },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission('customers.edit'), { wrapper })
      expect(result.current).toBe(true)
    })

    it('returns false when user does not have the permission', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: {
          permissions: ['customers.read', 'orders.read']
        },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission('customers.edit'), { wrapper })
      expect(result.current).toBe(false)
    })

    it('is case-sensitive', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: {
          permissions: ['customers.edit']
        },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result: result1 } = renderHook(() => useUserHasPermission('customers.Edit'), { wrapper })
      expect(result1.current).toBe(false)

      const { result: result2 } = renderHook(() => useUserHasPermission('Customers.edit'), { wrapper })
      expect(result2.current).toBe(false)
    })

    it('returns false for empty permission name', () => {
      const mockAuth = createMockAuth({
        rpcUserInfo: {
          permissions: ['customers.edit']
        },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AuthContext.Provider value={mockAuth}>{children}</AuthContext.Provider>
      )

      const { result } = renderHook(() => useUserHasPermission(''), { wrapper })
      expect(result.current).toBe(false)
    })
  })
})
