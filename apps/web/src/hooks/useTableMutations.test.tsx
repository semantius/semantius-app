import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateRecord, useUpdateRecord, useDeleteRecord } from './useTableMutations'
import React from 'react'

// Mock the useAuth hook
vi.mock('./useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    isAuthenticated: true,
    userInfo: null,
    userInfoLoading: false,
    userInfoError: null,
    isAuthReady: true,
  }),
}))

// Mock apiClient
vi.mock('@/lib/apiClient', () => ({
  getApiConfig: () => ({
    baseUrl: 'https://api.test.com',
    type: null,
    supabaseApiKey: null,
  }),
  createApiHeaders: (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }),
  // Fired on the SUCCESS path only (see useTableMutations onSuccess). Omitting
  // it made every success case fail with a TypeError while the error cases
  // still passed — the mock must cover the whole module surface the hook uses.
  refreshSchemaCache: vi.fn(),
}))

// getConfig() throws unless initConfig() has run, and onSuccess reads
// getConfig().tenantName. Stubbed rather than initialized: these tests are
// about the mutation, not about config resolution.
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ tenantName: 'test-tenant' }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useCreateRecord', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should create a record successfully', async () => {
    const mockResponse = [{ id: 1, email: 'test@example.com' }]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })

    const { result } = renderHook(() => useCreateRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ email: 'test@example.com' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com/customers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        }),
        body: JSON.stringify({ email: 'test@example.com' }),
      })
    )
    expect(result.current.data).toEqual(mockResponse[0])
  })

  it('should handle errors when creating a record', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Invalid email' }),
    })

    const { result } = renderHook(() => useCreateRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ email: 'invalid' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Invalid email')
  })
})

describe('useUpdateRecord', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should update a record successfully', async () => {
    const mockResponse = [{ id: 1, email: 'updated@example.com' }]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })

    const { result } = renderHook(() => useUpdateRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ id: 1, email: 'updated@example.com' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com/customers?id=eq.1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        }),
        body: JSON.stringify({ email: 'updated@example.com' }),
      })
    )
    expect(result.current.data).toEqual(mockResponse[0])
  })

  it('should handle errors when updating a record', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Record not found' }),
    })

    const { result } = renderHook(() => useUpdateRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ id: 999, email: 'updated@example.com' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Record not found')
  })
})

describe('useDeleteRecord', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should delete a record successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const { result } = renderHook(() => useDeleteRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate(1)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test.com/customers?id=eq.1',
      expect.objectContaining({
        method: 'DELETE',
      })
    )
  })

  it('should handle errors when deleting a record', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Record not found' }),
    })

    const { result } = renderHook(() => useDeleteRecord('customers'), {
      wrapper: createWrapper(),
    })

    result.current.mutate(999)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Record not found')
  })
})
