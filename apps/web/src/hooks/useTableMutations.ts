import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n'
import { getApiConfig, createApiHeaders, refreshSchemaCache } from '@/lib/apiClient'
import { getConfig } from '@/lib/config'
import { UPSERT_PREFER, UPSERT_QUERY } from '@/lib/postgrest'

export interface CreateRecordOptions {
  /**
   * Make the insert an UPSERT on these columns.
   *
   * Sent as PostgREST's `?on_conflict=a,b` with
   * `Prefer: resolution=merge-duplicates`, so a row whose unique key already
   * exists is UPDATED with the body instead of answering 409. The columns must
   * name a unique or exclusion constraint the table actually has — PostgREST
   * answers `42P10` otherwise. The first caller is translate mode's writer
   * (`ui_translations`, unique on locale/scope/key/context).
   */
  onConflict?: readonly string[]
  /**
   * A different PostgREST base to write to. Defaults to the app's own API; the
   * translate target (`VITE_TRANSLATE_API_URL`) is the one caller today.
   */
  baseUrl?: string
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
  // These messages are what ApiErrorDisplay and the delete dialog put on
  // screen, so they are UI text and go through the catalog.
  const t = useT()
  const { token } = useAuth()
  const apiBaseUrl = options.baseUrl ?? getApiConfig().baseUrl
  const queryClient = useQueryClient()
  const conflictColumns = options.onConflict?.length ? options.onConflict : undefined

  return useMutation<T, Error, Partial<T>>({
    mutationFn: async (data) => {
      if (!token) {
        throw new Error(t('Authentication token is required'))
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw new Error(t('Invalid table name'))
      }

      // Same rule for the conflict target: it goes into the URL.
      if (conflictColumns && !conflictColumns.every((column) => /^[a-zA-Z0-9_]+$/.test(column))) {
        throw new Error(t('Invalid column name'))
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
        let errorMessage = t('Failed to create {table} record', { table: tableName })
        let errorDetails: Record<string, unknown> | undefined

        try {
          const errorData = await response.json()
          if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
            // Status alongside the server's body, like every other thrower here.
            errorDetails = { ...(errorData as Record<string, unknown>), status: response.status }
            if ('message' in errorDetails && typeof errorDetails.message === 'string') {
              errorMessage = errorDetails.message
            }
          }
        } catch {
          errorMessage = `${errorMessage}: ${response.statusText}`
        }

        const error = new Error(errorMessage)
        if (errorDetails) {
          error.cause = errorDetails
        }
        throw error
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
  const t = useT()
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const queryClient = useQueryClient()

  return useMutation<T, Error, Partial<T> & { [key: string]: unknown }>({
    mutationFn: async (data) => {
      if (!token) {
        throw new Error(t('Authentication token is required'))
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw new Error(t('Invalid table name'))
      }

      const id = data[idField]
      if (!id) {
        throw new Error(t('{field} is required for update', { field: idField }))
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
        let errorMessage = t('Failed to update {table} record', { table: tableName })
        let errorDetails: Record<string, unknown> | undefined

        try {
          const errorData = await response.json()
          if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
            // Status alongside the server's body, like every other thrower here.
            errorDetails = { ...(errorData as Record<string, unknown>), status: response.status }
            if ('message' in errorDetails && typeof errorDetails.message === 'string') {
              errorMessage = errorDetails.message
            }
          }
        } catch {
          errorMessage = `${errorMessage}: ${response.statusText}`
        }

        const error = new Error(errorMessage)
        if (errorDetails) {
          error.cause = errorDetails
        }
        throw error
      }

      const result = await response.json()
      // PostgREST returns an array with the updated record — and `200 []` when
      // the filter matched nothing. That is not a success: the row the user
      // was editing is gone (deleted elsewhere, or a wrong id), and resolving
      // here made every caller say "saved" for a record that is not there.
      // `Prefer: return=representation` above is what makes the empty array
      // observable at all.
      if (Array.isArray(result) && result.length === 0) {
        throw new Error(t('This {table} record no longer exists', { table: tableName }), {
          cause: { status: 404, matched: 0, [idField]: id },
        })
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
  const t = useT()
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()
  const queryClient = useQueryClient()

  return useMutation<void, Error, string | number>({
    mutationFn: async (id) => {
      if (!token) {
        throw new Error(t('Authentication token is required'))
      }

      // Validate table name
      if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
        throw new Error(t('Invalid table name'))
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
        let errorMessage = t('Failed to delete {table} record', { table: tableName })
        let errorDetails: Record<string, unknown> | undefined

        try {
          const errorData = await response.json()
          if (errorData && typeof errorData === 'object' && !Array.isArray(errorData)) {
            // Status alongside the server's body, like every other thrower here.
            errorDetails = { ...(errorData as Record<string, unknown>), status: response.status }
            if ('message' in errorDetails && typeof errorDetails.message === 'string') {
              errorMessage = errorDetails.message
            }
          }
        } catch {
          errorMessage = `${errorMessage}: ${response.statusText}`
        }

        const error = new Error(errorMessage)
        if (errorDetails) {
          error.cause = errorDetails
        }
        throw error
      }

      // See the Prefer header above: `[]` means no row carried this id.
      const deleted: unknown = await response.json().catch(() => [])
      if (Array.isArray(deleted) && deleted.length === 0) {
        throw new Error(t('This {table} record no longer exists', { table: tableName }), {
          cause: { status: 404, matched: 0, [idField]: id },
        })
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
