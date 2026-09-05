import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTable } from './useTable'
import { useAuth } from '@/hooks/useAuth'
import { setupMockApiConfig } from '@/test/apiTestUtils'

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('useTable', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()

    // Setup API configuration using test utility
    await setupMockApiConfig()

    // Default mock for useAuth
    vi.mocked(useAuth).mockReturnValue({
      token: 'test-token',
    } as ReturnType<typeof useAuth>)
  })

  it('requests the table URL with the bearer token', async () => {
    // Only the request is asserted. This test used to stub fetch with an
    // invented `[{ id, name }]` payload and then assert `data` equaled that same
    // payload — a check that could only fail if TanStack Query itself broke,
    // and one that quietly hardcoded the `id`/`label` column names this app's
    // metadata-driven schemas exist to avoid. What the hook actually owns is
    // the URL and the headers, so that is what is checked.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useTable('modules'), { wrapper })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/modules',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('includes query parameters in request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useTable('users', { query: 'select=id,name&order=name.asc' }), { wrapper })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users?select=id,name&order=name.asc',
      expect.any(Object)
    )
  })

  it('adds Supabase apikey header when API_TYPE is supabase', async () => {
    await setupMockApiConfig({
      type: 'supabase',
      supabaseApiKey: 'supabase-key',
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useTable('modules'), { wrapper })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'apikey': 'supabase-key',
        }),
      })
    )
  })

  it('handles fetch errors with details', async () => {
    const errorResponse = {
      message: 'Invalid API key',
      hint: 'Double check your Supabase API key',
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Unauthorized',
      json: async () => errorResponse,
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useTable('modules'), { wrapper })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
      expect(result.current.error?.message).toBe('Invalid API key')
    })

    expect(result.current.error).not.toBeNull()
    // Error message should use the message from the API response
    expect(result.current.error!.message).toBe('Invalid API key')
    // Error cause should have the details (excluding message since it's in the main message)
    expect(result.current.error!.cause).toEqual(errorResponse)
  })

  it('handles fetch errors without message field in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ code: 'PGRST301' }),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useTable('modules'), { wrapper })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
      expect(result.current.error?.message).toBe('Failed to fetch modules: Internal Server Error')
    })

    expect(result.current.error).not.toBeNull()
    // Error message should fall back to generic message with statusText
    expect(result.current.error!.message).toBe('Failed to fetch modules: Internal Server Error')
    // Error cause should still have the response details
    expect(result.current.error!.cause).toEqual({ code: 'PGRST301' })
  })

  it('does not fetch when token is missing', () => {
    vi.mocked(useAuth).mockReturnValue({
      token: null,
    } as unknown as ReturnType<typeof useAuth>)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useTable('modules'), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('respects enabled option', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useTable('modules', { enabled: false }), { wrapper })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('validates table name to prevent path traversal', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useTable('../etc/passwd'), { wrapper })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
      expect(result.current.error?.message).toContain('Invalid table name')
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.error!.message).toContain('Invalid table name')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('allows valid table names with underscores and hyphens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useTable('valid_table-name123'), { wrapper })

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/valid_table-name123',
      expect.any(Object)
    )
  })
})
