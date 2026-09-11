import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { appError } from '@/lib/appError'
import { getApiConfig, createApiHeaders, refreshSchemaCache } from '@/lib/apiClient'
import { getConfig } from '@/lib/config'
import { UPSERT_PREFER, UPSERT_QUERY } from '@/lib/postgrest'
import { errorBody } from './useTable'

export interface CreateRecordOptions {
  /**
   * Make the insert an UPSERT on these columns.
   *
   * Sent as PostgREST's `?on_conflict=a,b` with
   * `Prefer: resolution=merge-duplicates`, so a row whose unique key already
   * exists is UPDATED with the body instead of answering 409. The columns must
   * name a unique or exclusion constraint the table actually has — PostgREST
   * answers `42P10` otherwise.
   */
  onConflict?: readonly string[]
}

/**
 * What a failed write left to throw: the transport facts for `cause`, and the
 * server's own sentence as an error when it sent one — keyed and looked up by
 * `renderError`. The call site throws that, or else the app's fallback as a
 * TEMPLATE plus values (`appError`), rendered at display time through the
 * component's own `t`. The template is spelled at the call site because the
 * scan reads it there: a message passed through a variable is invisible to it.
 */
async function writeFailure(response: Response): Promise<{ transport: Record<string, unknown>; serverError: Error | null }> {
  const body = await errorBody(response)
  // Status alongside the server's body, like every other thrower here.
  const transport = { ...body, status: response.status, url: response.url }
  const serverError =
    typeof body.message === 'string' && body.message ? new Error(body.message, { cause: transport }) : null
  return { transport, serverError }
}

/**
 * Generic hook for creating records in a PostgREST table
 *
 * @param tableName - Name of the table in the PostgREST API
 * @param options - `onConflict` turns the insert into an upsert
 * @returns Mutation hook for creating records
 *
 * @example
 * const createCustomer = useCreateRecord('customers')
 * createCustomer.mutate({ email: 'test@example.com', status: 'active' })
 */
export function useCreateRecord<T = Record<string, unknown>>(
  tableName: string,
  options: CreateRecordOptions = {},
) {
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const queryClient = useQueryClient()
  const conflictColumns = options.onConflict?.length ? options.onConflict : undefined

  return useMutation<T, Error, Partial<T>>({
    mutationFn: async (data) => {
      if (!token) {
        throw appError({ message: 'Authentication token is required' })
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw appError({ message: 'Invalid table name' })
      }

      // Same rule for the conflict target: it goes into the URL.
      if (conflictColumns && !conflictColumns.every((column) => /^[a-zA-Z0-9_]+$/.test(column))) {
        throw appError({ message: 'Invalid column name' })
      }

      const url = conflictColumns
        ? `${apiBaseUrl}/${tableName}?${UPSERT_QUERY}=${conflictColumns.join(',')}`
        : `${apiBaseUrl}/${tableName}`
      const headers = {
        ...createApiHeaders(token),
        'Content-Type': 'application/json',
        // Return the created (or, on an upsert, the merged) record.
        'Prefer': conflictColumns ? UPSERT_PREFER : 'return=representation',
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const { transport, serverError } = await writeFailure(response)
        throw (
          serverError ??
          appError(
            { message: 'Failed to create {table} record ({status})', values: { table: tableName, status: response.status } },
            transport,
          )
        )
      }

      const result = await response.json()
      // PostgREST returns an array with the created record
      return Array.isArray(result) ? result[0] : result
    },
    onSuccess: () => {
      // Invalidate the table query to refetch data
      // Use refetchType: 'active' to immediately refetch all active queries (e.g., sidebar, main grid)
      queryClient.invalidateQueries({
        queryKey: ['table', tableName],
        refetchType: 'active'
      })
      if (token) refreshSchemaCache(token, getConfig().tenantName, tableName)
    },
  })
}

/**
 * Generic hook for updating records in a PostgREST table
 *
 * @param tableName - Name of the table in the PostgREST API
 * @param idField - Name of the ID field (default: 'id')
 * @returns Mutation hook for updating records
 *
 * @example
 * const updateCustomer = useUpdateRecord('customers')
 * updateCustomer.mutate({ id: 123, email: 'newemail@example.com' })
 */
export function useUpdateRecord<T extends Record<string, unknown>>(
  tableName: string,
  idField: string = 'id'
) {
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const queryClient = useQueryClient()

  return useMutation<T, Error, Partial<T> & { [key: string]: unknown }>({
    mutationFn: async (data) => {
      if (!token) {
        throw appError({ message: 'Authentication token is required' })
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw appError({ message: 'Invalid table name' })
      }

      const id = data[idField]
      if (!id) {
        throw appError({ message: '{field} is required for update', values: { field: idField } })
      }

      // Create a copy without the ID field for the update payload
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [idField]: _, ...updateData } = data

      const url = `${apiBaseUrl}/${tableName}?${idField}=eq.${id}`
      const headers = {
        ...createApiHeaders(token),
        'Content-Type': 'application/json',
        'Prefer': 'return=representation', // Return the updated record
      }

      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const { transport, serverError } = await writeFailure(response)
        throw (
          serverError ??
          appError(
            { message: 'Failed to update {table} record ({status})', values: { table: tableName, status: response.status } },
            transport,
          )
        )
      }

      const result = await response.json()
      // PostgREST returns an array with the updated record — and `200 []` when
      // the filter matched nothing. That is not a success: the row the user
      // was editing is gone (deleted elsewhere, or a wrong id), and resolving
      // here made every caller say "saved" for a record that is not there.
      // `Prefer: return=representation` above is what makes the empty array
      // observable at all.
      if (Array.isArray(result) && result.length === 0) {
        throw appError(
          { message: 'This {table} record no longer exists', values: { table: tableName } },
          { status: 404, matched: 0, [idField]: id },
        )
      }
      return Array.isArray(result) ? result[0] : result
    },
    onSuccess: () => {
      // Invalidate the table query to refetch data
      // Use refetchType: 'active' to immediately refetch all active queries (e.g., sidebar, main grid)
      queryClient.invalidateQueries({
        queryKey: ['table', tableName],
        refetchType: 'active'
      })
      if (token) refreshSchemaCache(token, getConfig().tenantName, tableName)
    },
  })
}

/**
 * Generic hook for deleting records in a PostgREST table
 *
 * @param tableName - Name of the table in the PostgREST API
 * @param idField - Name of the ID field (default: 'id')
 * @returns Mutation hook for deleting records
 *
 * @example
 * const deleteCustomer = useDeleteRecord('customers')
 * deleteCustomer.mutate(123)
 */
export function useDeleteRecord(tableName: string, idField: string = 'id') {
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const queryClient = useQueryClient()

  return useMutation<void, Error, string | number>({
    mutationFn: async (id) => {
      if (!token) {
        throw appError({ message: 'Authentication token is required' })
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw appError({ message: 'Invalid table name' })
      }

      const url = `${apiBaseUrl}/${tableName}?${idField}=eq.${id}`
      const headers = {
        ...createApiHeaders(token),
        // Without it PostgREST answers a bodyless 204 whether or not a row
        // matched, and a delete of a record that was already gone reported
        // success. With it the deleted rows come back, and an empty array is
        // the "nothing matched" the UI has to tell the user about.
        'Prefer': 'return=representation',
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        const { transport, serverError } = await writeFailure(response)
        throw (
          serverError ??
          appError(
            { message: 'Failed to delete {table} record ({status})', values: { table: tableName, status: response.status } },
            transport,
          )
        )
      }

      // See the Prefer header above: `[]` means no row carried this id.
      const deleted: unknown = await response.json().catch(() => [])
      if (Array.isArray(deleted) && deleted.length === 0) {
        throw appError(
          { message: 'This {table} record no longer exists', values: { table: tableName } },
          { status: 404, matched: 0, [idField]: id },
        )
      }
    },
    onSuccess: () => {
      // Invalidate the table query to refetch data
      // Use refetchType: 'active' to immediately refetch all active queries (e.g., sidebar, main grid)
      queryClient.invalidateQueries({
        queryKey: ['table', tableName],
        refetchType: 'active'
      })
      if (token) refreshSchemaCache(token, getConfig().tenantName, tableName)
    },
  })
}
