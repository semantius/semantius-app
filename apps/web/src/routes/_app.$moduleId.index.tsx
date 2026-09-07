import { createFileRoute } from '@tanstack/react-router'
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
import { getModuleDisplay } from '@/contexts/AuthContext'
import { moduleOverride, useLocaleLabels } from '@/i18n'
import { useT } from '@/i18n'
import { serverMessage } from '@/lib/apiErrors'

export const Route = createFileRoute('/_app/$moduleId/')({
  // The module's display name lives in rpcUserInfo, which head() cannot reach;
  // the slug is the one identifier available before the component renders and it
  // is what the user typed in the URL bar anyway.
  head: ({ params }) => ({ meta: [{ title: pageTitle(params.moduleId) }] }),
  validateSearch: () => ({}),
  component: ModuleHomeComponent,
})

const EMPTY_CONFIG: DashboardConfig = { portlets: [] }

function ModuleHomeComponent() {
  const t = useT()
  const labels = useLocaleLabels()
  const { moduleId } = Route.useParams()
  const { rpcUserInfo, token } = useAuth()
  const updateModule = useUpdateRecord<{ id: number; dashboard_config: DashboardConfig | null }>('modules')
  const cubeApiUrl = getConfig().cubeApiUrl
    ? `${getConfig().cubeApiUrl}/${moduleId.toLowerCase()}/cubejs-api/v1`
    : undefined

  const module = rpcUserInfo?.modules?.find(
    (m) => m.module_slug.toLowerCase() === moduleId.toLowerCase()
  )

  const { data: moduleConfigData, isLoading: isDashboardConfigLoading } = useTable<{ id: number; dashboard_config: DashboardConfig | null }>(
    'modules',
    {
      query: `module_slug=ilike.${encodeURIComponent(moduleId)}&select=id,dashboard_config`,
      enabled: !!module,
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
    if (!module) return
    await updateModule.mutateAsync({ id: module.id, dashboard_config: configToSave })
  }, [module, updateModule])

  if (!module) {
    return <NotFoundPage />
  }

  const { displayName, displayTitle } = getModuleDisplay(module, moduleOverride(labels, module.module_slug))

  const moduleHeader = (
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

  if (updateModule.error) {
    return (
      <div className="space-y-6">
        {moduleHeader}
        <Card>
          <CardContent className="py-6 text-destructive text-sm">
            {t('Failed to save dashboard: {message}', { message: serverMessage(updateModule.error) })}
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
