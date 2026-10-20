import { createFileRoute, Navigate } from '@tanstack/react-router'
import { pageTitle } from '@/lib/pageTitle'
import { useCallback, useState, useEffect } from 'react'
import { NamedIcon } from '@/components/ui-ext/named-icon'
import { AnalyticsDashboard, CubeProvider } from 'drizzle-cube/client'
import type { DashboardConfig } from 'drizzle-cube/client'
import { customCharts } from '@/charts'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { NotFoundPage } from '@/components/NotFoundPage'
import { useUpdateRecord } from '@/hooks/useTableMutations'
import { useTable } from '@/hooks/useTable'
import { getConfig } from '@/lib/config'
import { getModuleDisplay, moduleLabels, type Module } from '@/contexts/AuthContext'
import { useT } from '@/i18n'
import { renderError } from '@/lib/apiErrors'
import { sidebarEntitiesQuery } from '@/lib/sidebarEntities'
import { ApiErrorDisplay } from '@/components/ApiErrorDisplay'

export const Route = createFileRoute('/_app/$moduleId/')({
  // The module's display name lives in rpcUserInfo, which head() cannot reach;
  // the slug is the one identifier available before the component renders and it
  // is what the user typed in the URL bar anyway.
  head: ({ params }) => ({ meta: [{ title: pageTitle(params.moduleId) }] }),
  validateSearch: () => ({}),
  component: ModuleHomeComponent,
})

const EMPTY_CONFIG: DashboardConfig = { portlets: [] }

/** The feature (see AppConfig.features) that turns the module root into a dashboard. */
const ANALYTICS_FEATURE = 'analytics'

function ModuleHomeComponent() {
  const { moduleId } = Route.useParams()
  const { rpcUserInfo } = useAuth()

  const module = rpcUserInfo?.modules?.find(
    (m) => m.module_slug.toLowerCase() === moduleId.toLowerCase()
  )

  if (!module) {
    return <NotFoundPage />
  }

  // Without analytics the module root has nothing of its own to show, so it
  // forwards to the first sidebar entry. Split into two components so the
  // dashboard's fetches do not run at all in that case.
  return getConfig().features.includes(ANALYTICS_FEATURE)
    ? <ModuleDashboard module={module} moduleId={moduleId} />
    : <ModuleFirstEntryRedirect module={module} />
}

function ModuleHeader({ module }: { module: Module }) {
  const t = useT()
  const { displayName, displayTitle } = getModuleDisplay(module, moduleLabels(t, module))

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex size-16 items-center justify-center rounded-xl overflow-hidden shrink-0 shadow-md"
        style={module.logo_color ? { backgroundColor: module.logo_color } : { backgroundColor: '#0000FF' }}
      >
        <NamedIcon name={module.icon_name || 'form'} className="size-7 text-white" />
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{displayName}</h1>
        {displayTitle && (
          <p className="text-muted-foreground mt-1">{displayTitle}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Redirects to the module's first sidebar entry. Uses the sidebar's own query
 * (sidebarEntitiesQuery), so it is answered from the same cache entry and picks
 * the entry the sidebar lists first. `replace`, so Back does not land on the
 * module root and bounce forward again.
 */
function ModuleFirstEntryRedirect({ module }: { module: Module }) {
  const t = useT()
  const { data: entities, isLoading, error } = useTable('entities', {
    query: sidebarEntitiesQuery(module.id),
  })

  const first = entities?.[0]
  if (first) {
    return (
      <Navigate
        to="/$moduleId/$table_name"
        params={{ moduleId: module.module_slug, table_name: String(first.table_name) }}
        search={{}}
        replace
      />
    )
  }

  return (
    <div className="space-y-6">
      <ModuleHeader module={module} />
      {error ? (
        <ApiErrorDisplay error={error} title={t('Error loading apps')} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {isLoading ? t('Loading...') : t('No apps available')}
        </p>
      )}
    </div>
  )
}

function ModuleDashboard({ module, moduleId }: { module: Module; moduleId: string }) {
  const t = useT()
  const { token } = useAuth()
  const updateModule = useUpdateRecord<{ id: number; dashboard_config: DashboardConfig | null }>('modules')
  const cubeApiUrl = getConfig().cubeApiUrl
    ? `${getConfig().cubeApiUrl}/${moduleId.toLowerCase()}/cubejs-api/v1`
    : undefined

  const { data: moduleConfigData, isLoading: isDashboardConfigLoading } = useTable<{ id: number; dashboard_config: DashboardConfig | null }>(
    'modules',
    {
      query: `module_slug=ilike.${encodeURIComponent(moduleId)}&select=id,dashboard_config`,
    }
  )

  const [config, setConfig] = useState<DashboardConfig>(EMPTY_CONFIG)

  // Load dashboard_config from server whenever data arrives or moduleId changes
  useEffect(() => {
    if (!moduleConfigData) return
    const serverConfig = moduleConfigData[0]?.dashboard_config ?? EMPTY_CONFIG
    setConfig(serverConfig)
  }, [moduleConfigData])

  const handleConfigChange = useCallback((newConfig: DashboardConfig) => {
    setConfig(newConfig)
  }, [])

  const handleSave = useCallback(async (configToSave: DashboardConfig) => {
    await updateModule.mutateAsync({ id: module.id, dashboard_config: configToSave })
  }, [module, updateModule])

  const moduleHeader = <ModuleHeader module={module} />

  if (updateModule.error) {
    return (
      <div className="space-y-6">
        {moduleHeader}
        <Card>
          <CardContent className="py-6 text-destructive text-sm">
            {t('Failed to save dashboard: {message}', { message: renderError(updateModule.error, t).message })}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {moduleHeader}

      <CubeProvider apiOptions={{ apiUrl: cubeApiUrl ?? '', credentials: 'omit' }} token={token ?? undefined} customCharts={customCharts} >
        {isDashboardConfigLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('Loading dashboard…')}</div>
        ) : (
          <AnalyticsDashboard
            config={config}
            editable
            onConfigChange={handleConfigChange}
            onSave={handleSave}
          />
        )}
      </CubeProvider>
    </div>
  )
}
