// routes/$moduleId.$table_name.$key.tsx
import { createFileRoute, notFound, useParams } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { statusOf } from '@/lib/retry'
import { rpcQueryKey } from '@/hooks/useRpc'
import { lazy, Suspense, useMemo } from 'react'
import { NotFoundPage } from '@/components/NotFoundPage'
import { ViewSkeleton } from '@/components/ViewSkeleton'
import type { QueryClient } from '@tanstack/react-query'
import type { EntityMetadata } from '@/types/metadata'
import { translate, useLocalizedMetadata, useT } from '@/i18n'
import { appError } from '@/lib/appError'

// Discover all view components - lazy load for code splitting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewComponents = import.meta.glob<Record<string, React.ComponentType<any>>>(
  '../components/views/**/*.{tsx,jsx}',
  { eager: false }
)

/** The RPC that returns an entity's schema. */
const GET_SCHEMA = 'get_schema'

// Cache for lazy components to prevent recreation
const lazyComponentCache = new Map<string, React.ComponentType<any>>()

export const Route = createFileRoute('/_app/$moduleId/$table_name')({
  shouldReload: false, // Never reload - metadata doesn't change
  loader: async ({ params, context }) => {
    const { table_name } = params
    const token = context.auth.getToken()

    // Not-found ONLY when the server said the table is not there. Anything
    // else — a rate limit or cold start that outlasted the retry budget, a
    // network error, a 403 — is thrown, and lands on the router's
    // defaultErrorComponent with a Try Again that re-runs this loader. This
    // loader used to catch everything and answer notFound(), which told a
    // rate-limited user the table did not exist.
    const metadata = await fetchEntityMetadata(table_name, token, context.queryClient)
    if (!metadata) {
      throw notFound()
    }

    return { metadata }
  },
  // Titled from the entity's own plural label rather than the raw table name —
  // the loader has already fetched the metadata by the time head() runs, so this
  // costs nothing. Falls back to the table name if metadata ever lacks a label.
  // `loaderData` is cast rather than inferred on purpose: referencing the
  // inferred loader type from inside the same route definition is circular, and
  // TypeScript resolves the cycle by widening loaderData to `never` — which then
  // breaks Route.useLoaderData() in the component too.
  head: ({ loaderData, params }) => {
    const data = loaderData as { metadata?: EntityMetadata } | undefined
    // `translate()` rather than a hook: head() is not a component. It reads the
    // active catalog synchronously and re-runs on router.invalidate(), which is
    // exactly what the language switcher calls — so the tab title follows the
    // language without a refetch (the loader is served from the QueryClient).
    // The label is a message keyed by its model path, with the model's own
    // English as the fallback; the slug comes from the schema, never the route.
    const table = data?.metadata?.table
    const fallback = table?.plural_label || params.table_name
    const title = table?.module_slug
      ? translate({ id: ['module', table.module_slug, params.table_name, 'entity', 'plural_label'], defaultMessage: fallback })
      : fallback
    return { meta: [{ title: pageTitle(title) }] }
  },
  component: RouteComponent,
  // Show the content-area skeleton while the blocking loader runs, instead of
  // holding the previous page. pendingMs keeps fast/cached navigations flash-
  // free; the explicit pendingMinMs: 0 overrides the router's 500ms default,
  // which would otherwise keep the skeleton up after the data had arrived.
  // pendingComponent receives no props, so metadata only reaches the inner
  // Suspense fallback below.
  pendingComponent: ViewSkeleton,
  pendingMs: 300,
  pendingMinMs: 0,
  notFoundComponent: NotFoundPage,
})

function RouteComponent() {
  const t = useT()
  const { moduleId, table_name, key } = useParams({ strict: false })
  const { metadata: rawMetadata } = Route.useLoaderData()
  // THE choke point for model-label overrides. Everything downstream — View,
  // DataTableView, SchemaForm, DataFormPage, ConfirmDeleteDialog, ViewSkeleton,
  // api-select, InputReference — takes its labels from this one `metadata` prop,
  // so translating here translates all of them. It is applied at RENDER, never
  // in the loader: the loader's data is the model as the server sent it, and a
  // language switch must not invalidate it.
  const metadata = useLocalizedMetadata(rawMetadata)
  
  // Get or create lazy component (cached to prevent Suspense flickering on key changes)
  const Component = useMemo(() => {
    if (!table_name) return null
    
    const componentName = table_name.charAt(0).toUpperCase() + table_name.slice(1)
    const specificComponentPath = `../components/views/${moduleId}/${componentName}.tsx`
    const genericComponentPath = '../components/views/View.tsx'
    
    const componentPath = specificComponentPath in viewComponents 
      ? specificComponentPath 
      : genericComponentPath
    
    if (!lazyComponentCache.has(componentPath)) {
      lazyComponentCache.set(
        componentPath,
        lazy(() => 
          viewComponents[componentPath]().then(m => ({ 
            default: m[componentName] || m.View || m.default 
          }))
        )
      )
    }
    
    return lazyComponentCache.get(componentPath)!
  }, [table_name, moduleId])
  
  if (!Component) {
    return <div>{t('Invalid table name')}</div>
  }
  
  return (
    <Suspense fallback={<ViewSkeleton metadata={metadata} />}>
      {/* key on table_name remounts the view when switching tables. Without it
          the SAME generic View instance is reused across tables (same route,
          changed params), so its internal state and useTable's keep-previous
          placeholder data bleed across tables — showing the previous table's
          rows/row-count until the new query resolves. The key is table_name (not
          page/sort), so pagination/sort/filter WITHIN a table keep the instance
          and its smooth keep-previous behavior. The lazy component is cached and
          already resolved, so the remount does not re-trigger Suspense. */}
      <Component key={table_name} table_name={table_name} metadata={metadata} moduleId={moduleId} recordId={key} />
    </Suspense>
  )
}

/**
 * Fetch entity metadata using the get_schema RPC function
 * This follows the PostgREST RPC pattern for calling stored procedures.
 *
 * Resolves `null` only for a 404 — `get_schema` answers one, with PostgREST's
 * own error body, for a table that is not in `entities`. Every other failure is
 * rethrown, status on `cause`, so the caller can show an error rather than a
 * 404 page. The retrying (a bounded budget, cold-start 404s included) already
 * happened in the fetch interceptor by the time a rejection reaches here.
 */
async function fetchEntityMetadata(
  table_name: string,
  token: string | null,
  queryClient: QueryClient | undefined,
): Promise<EntityMetadata | null> {
  if (!token) {
    // A template, rendered where it is displayed: a route loader runs outside
    // React and must not freeze the language it happened to run in.
    throw appError({ message: 'Authentication token is required' })
  }

  const { callRpc } = await import('@/lib/apiClient')
  const params = { p_table_name: table_name }
  const fetchSchema = () => callRpc<EntityMetadata>(GET_SCHEMA, params, token)

  try {
    // Through the QueryClient with the key `useRpc` already uses, so the schema
    // is fetched once per table for the life of the session and a re-run of this
    // loader — which is what router.invalidate() does on every language switch —
    // costs nothing. `staleTime: Infinity`: a schema changes when the model is
    // edited, and that path already invalidates its own queries.
    return queryClient
      ? await queryClient.ensureQueryData({
          // rpcQueryKey, not a hand-written array: this fills the SAME entry
          // `useRpc('get_schema')` reads, and a key spelled out twice drifts.
          queryKey: rpcQueryKey(GET_SCHEMA, params),
          queryFn: fetchSchema,
          staleTime: Infinity,
        })
      : await fetchSchema()
  } catch (err) {
    if (statusOf(err) === 404) return null
    throw err
  }
}