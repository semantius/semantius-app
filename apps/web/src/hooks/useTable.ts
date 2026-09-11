import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { appError } from '@/lib/appError'
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
  const { token } = useAuth()

  const { query, enabled = true, placeholderData, count = false } = options
  const { baseUrl: apiBaseUrl } = getApiConfig()

  const queryResult = useQuery<{ data: T[], totalCount?: number }, Error>({
    queryKey: ['table', tableName, query, count],
    queryFn: async () => {
      // The errors thrown below are what ApiErrorDisplay puts on screen. They
      // travel as a TEMPLATE plus values (`appError`) and are rendered at
      // display time through the component's own `t`, so a language switch
      // reaches an error that is already on screen — a `queryFn` cannot call a
      // hook, and must not freeze the language it happened to run in.
      if (!token) {
        throw appError({ message: 'Authentication token is required' })
      }

      // Validate table name to prevent path traversal attacks
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw appError({ message: 'Invalid table name: only alphanumeric characters, underscores, and hyphens are allowed' })
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
        // The status rides along with the server's own body: the retry
        // predicates and the table route's loader read it to tell a rate
        // limit or a cold start from a request that was simply wrong.
        const body = await errorBody(response)
        const transport = { ...body, status: response.status, url: response.url }
        // The server's own sentence when it sent one — keyed and looked up by
        // `renderError` — else the app's fallback as a template: never a
        // translated sentence with an English status text concatenated on.
        if (typeof body.message === 'string' && body.message) {
          throw new Error(body.message, { cause: transport })
        }
        throw appError(
          { message: 'Failed to fetch {table} ({status})', values: { table: tableName, status: response.status } },
          transport,
        )
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

/** The server's JSON body, or nothing when it did not send one. */
export async function errorBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // Not JSON: the transport facts are all there is to show.
  }
  return {}
}
