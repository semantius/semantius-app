import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n'
import { getApiConfig, createApiHeaders } from '@/lib/apiClient'

interface UseTableOptions<T = Record<string, unknown>> {
  /**
   * PostgREST query parameters (e.g., 'select=*&order=created_at.desc&limit=10')
   */
  query?: string
  /**
   * Whether the query should be enabled (default: true when token and apiBaseUrl are available)
   */
  enabled?: boolean
  /**
   * Placeholder data to use while loading (useful for keeping previous data during pagination)
   */
  placeholderData?: ((previousData: T[] | undefined) => T[] | undefined) | T[]
  /**
   * Whether to include total count in response (uses PostgREST Prefer: count=estimated header)
   */
  count?: boolean
}

export interface UseTableResult<T> {
  data: T[] | undefined
  totalCount: number | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Generic hook for fetching data from any PostgREST table
 * 
 * @param tableName - Name of the table in the PostgREST API
 * @param options - Query options including PostgREST query parameters
 * @returns UseQueryResult with the data from the table
 * 
 * @example
 * // Fetch all records from modules table
 * const { data, isLoading, error } = useTable('modules')
 * 
 * @example
 * // Fetch with filters and ordering
 * const { data, isLoading, error } = useTable('modules', {
 *   query: 'select=*&order=created_at.desc&limit=10'
 * })
 * 
 * @example
 * // Fetch with specific columns
 * const { data, isLoading, error } = useTable('users', {
 *   query: 'select=id,name,email&active=eq.true'
 * })
 */
export function useTable<T = Record<string, unknown>>(
  tableName: string,
  options: UseTableOptions<T> = {}
): UseTableResult<T> {
  // The messages thrown below are what ApiErrorDisplay puts on screen, so they
  // are UI text and go through the catalog like anything else a user reads.
  // `useT` rather than `translate`: the closure is rebuilt on every render, so a
  // language switch reaches the next failure.
  const t = useT()
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()

  const { query, enabled = true, placeholderData, count = false } = options

  const queryResult = useQuery<{ data: T[], totalCount?: number }, Error>({
    queryKey: ['table', tableName, query, count],
    queryFn: async () => {
      // Validate token is available (should always be true due to enabled check)
      if (!token) {
        throw new Error(t('Authentication token is required'))
      }

      // Validate table name to prevent path traversal attacks
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw new Error(t('Invalid table name: only alphanumeric characters, underscores, and hyphens are allowed'))
      }

      const url = query 
        ? `${apiBaseUrl}/${tableName}?${query}`
        : `${apiBaseUrl}/${tableName}`

      const headers = createApiHeaders(token)
      
      // Add Prefer header to get total count
      if (count) {
        headers['Prefer'] = 'count=exact'
      }

      const response = await fetch(url, { headers })
      
      if (!response.ok) {
        // Try to parse error response for better error messages
        let errorDetails: Record<string, unknown> | undefined
        let errorMessage = t('Failed to fetch {table}', { table: tableName })
        
        try {
          const errorData = await response.json()
          // Validate that errorData is an object before using it
          if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
            // The status rides along with the server's own body: the query
            // client's retry predicate (main.tsx) reads it to tell a rate limit
            // or a cold start from a request that was simply wrong.
            errorDetails = { ...(errorData as Record<string, unknown>), status: response.status }
            // Use the message from the error response if available
            if ('message' in errorDetails && typeof errorDetails.message === 'string') {
              errorMessage = errorDetails.message
            } else if (response.statusText) {
              errorMessage = `${errorMessage}: ${response.statusText}`
            }
          }
        } catch {
          // If JSON parsing fails, use status text
          if (response.statusText) {
            errorMessage = `${errorMessage}: ${response.statusText}`
          }
          errorDetails = { 
            statusCode: response.status,
            statusText: response.statusText 
          }
        }

        const error = new Error(errorMessage)
        // Attach error details as cause for ApiErrorDisplay to show
        if (errorDetails) {
          error.cause = errorDetails
        }
        throw error
      }
      
      const data = await response.json()
      
      // Extract total count from Content-Range header if available
      let totalCount: number | undefined
      if (count) {
        const contentRange = response.headers.get('Content-Range')
        if (contentRange) {
          // Content-Range format: "0-9/100" or "0-9/*" (unknown total)
          const match = contentRange.match(/\/(\d+)$/)
          if (match) {
            totalCount = parseInt(match[1], 10)
          }
        }
      }
      
      return { data, totalCount }
    },
    enabled: enabled && !!token && !!apiBaseUrl,
    placeholderData: placeholderData ? (prev) => {
      if (!prev) return prev
      const newData = typeof placeholderData === 'function' 
        ? placeholderData(prev.data) 
        : placeholderData
      return newData ? { data: newData, totalCount: prev.totalCount } : prev
    } : undefined,
  })
  
  return {
    data: queryResult.data?.data,
    totalCount: queryResult.data?.totalCount,
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  }
}
