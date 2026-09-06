import { useQuery, useMutation, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { getApiConfig, callRpc } from '@/lib/apiClient'

interface UseRpcOptions<TParams = Record<string, unknown>> {
  /**
   * RPC function parameters
   */
  params?: TParams
  /**
   * Whether the query should be enabled (default: true when token and apiBaseUrl are available)
   */
  enabled?: boolean
}

/**
 * Generic hook for calling PostgREST RPC functions
 * 
 * @param rpcName - Name of the RPC function (e.g., 'get_schema', 'process_order')
 * @param options - Query options including RPC parameters
 * @returns UseQueryResult with the data from the RPC call
 * 
 * @example
 * // Call get_schema RPC function
 * const { data, isLoading, error } = useRpc('get_schema', {
 *   params: { p_table_name: 'products' }
 * })
 * 
 * @example
 * // Call with conditional execution
 * const { data } = useRpc('calculate_total', {
 *   params: { order_id: 123 },
 *   enabled: !!orderId
 * })
 */
export function useRpc<TResult = unknown, TParams = Record<string, unknown>>(
  rpcName: string,
  options: UseRpcOptions<TParams> = {}
): UseQueryResult<TResult, Error> {
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()

  const { params, enabled = true } = options

  return useQuery<TResult, Error>({
    queryKey: ['rpc', rpcName, params],
    queryFn: async () => {
      if (!token) {
        throw new Error('Authentication token is required')
      }
      return await callRpc<TResult, TParams>(rpcName, params || {} as TParams, token)
    },
    enabled: enabled && !!token && !!apiBaseUrl,
  })
}

/**
 * Generic hook for calling PostgREST RPC functions with mutations
 *
 * RETRY SEMANTICS. A `POST /rpc/…` is repeated by the fetch interceptor on a
 * 425, 429, 502 or 503 — answers a server gives BEFORE running the function —
 * and on a bare cold-start 404. It is NOT repeated on a 500, a 504 or a network
 * error, where the function may already have run; a function with side effects
 * therefore cannot be executed twice by the transport. See lib/retry.ts.
 * 
 * @param rpcName - Name of the RPC function
 * @returns UseMutationResult for calling the RPC function
 * 
 * @example
 * // Call process_order RPC function
 * const mutation = useRpcMutation('process_order')
 * mutation.mutate({ order_id: 123, action: 'approve' })
 * 
 * @example
 * // With callbacks
 * const mutation = useRpcMutation('update_status', {
 *   onSuccess: (data) => console.log('Success:', data),
 *   onError: (error) => console.error('Error:', error)
 * })
 */
export function useRpcMutation<TResult = unknown, TParams = Record<string, unknown>>(
  rpcName: string,
  options?: {
    onSuccess?: (data: TResult) => void
    onError?: (error: Error) => void
  }
): UseMutationResult<TResult, Error, TParams> {
  const { token } = useAuth()

  return useMutation<TResult, Error, TParams>({
    mutationFn: async (params: TParams) => {
      if (!token) {
        throw new Error('Authentication token is required')
      }
      return await callRpc<TResult, TParams>(rpcName, params, token)
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
