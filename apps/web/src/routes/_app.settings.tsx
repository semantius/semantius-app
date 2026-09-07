import { createFileRoute } from '@tanstack/react-router'
import { translate, useT } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { Settings as SettingsIcon, Key } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ApiKeysCard } from '@/components/settings/ApiKeysCard'

export const Route = createFileRoute('/_app/settings')({
  head: () => ({ meta: [{ title: pageTitle(translate('Settings')) }] }),
  component: SettingsComponent,
})

function SettingsComponent() {
  const t = useT()
  const { token } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('Settings')}</h1>
        <p className="text-muted-foreground">{t('Manage your application settings')}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            <CardTitle>{t('Application Settings')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription>
            {t('This is a sample protected route for settings. Add your settings configuration here.')}
          </CardDescription>
        </CardContent>
      </Card>

      <ApiKeysCard />

      {import.meta.env.DEV && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>{t('Debug Information')}</CardTitle>
            </div>
            <CardDescription>
              {t('Current authentication token (for debugging purposes)')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 font-mono text-xs break-all">
              {token || t('No token available')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
