import { createFileRoute, Link } from '@tanstack/react-router'
import { translate, useT } from '@/i18n'
import { pageTitle } from '@/lib/pageTitle'
import { Loader2, Lock, LogOut } from 'lucide-react'
import { NamedIcon } from '@/components/ui-ext/named-icon'
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { getModuleDisplay, moduleLabels } from '@/contexts/AuthContext'
import { moduleHomePath } from '@/lib/moduleHome'

export const Route = createFileRoute('/_app/')({
  head: () => ({ meta: [{ title: pageTitle(translate('Modules')) }] }),
  component: IndexComponent,
})

function IndexComponent() {
  const { rpcUserInfo } = useAuth()
  const t = useT()

  // Get user's permissions array for filtering
  const userPermissions = (rpcUserInfo?.permissions as string[] | undefined) || []

  // Filter modules based on permissions (same logic as AppSidebar)
  // We skip modules where user has neither view nor edit permission
  const modules = rpcUserInfo?.modules?.filter((module) => {
    // Allow modules without permission requirements
    if (!module.view_permission && !module.edit_permission) {
      return true
    }

    // Collect non-empty permissions to check
    const permissionsToCheck: string[] = []
    if (module.view_permission) permissionsToCheck.push(module.view_permission)
    if (module.edit_permission) permissionsToCheck.push(module.edit_permission)

    // User must have at least one of view or edit permission
    return permissionsToCheck.some(permission => userPermissions.includes(permission))
  }) || []

  // Loading state
  if (!rpcUserInfo) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('Modules')}</h1>
          <p className="text-muted-foreground">
            {t('Loading your available modules...')}
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('Modules')}</h1>
        <p className="text-muted-foreground">
          {t('Select a module to get started')}
        </p>
      </div>

      {modules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="h-12 w-12 mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {t("You don't have access to any modules")}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {t("Your account doesn't have permissions for any module yet. Please contact your administrator to request access.")}
            </p>
            {/*
              A real link. `/logout` is an in-app route, but the plain <a> is
              deliberate: signing out must be a document load, so nothing —
              AuthProviderWrapper, the QueryClient, any cached row — survives it.
              A TanStack <Link> would push it into the SPA instead.
            */}
            <a
              href="/logout"
              className={buttonVariants({ variant: 'outline', className: 'mt-6' })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('Sign in with a different account')}
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => {
            const { displayName, displayTitle } = getModuleDisplay(module, moduleLabels(t, module))
            return (
              // A module tile is a navigation target, so it is a link — not a
              // <Card onClick>. The click-only card was unreachable by keyboard,
              // drew no focus ring, announced as nothing, and could not be opened
              // in a new tab (2.1.1, 2.4.7). The <Link> fills the card and carries
              // the padding so the whole tile stays the hit area.
              <Card
                key={module.id}
                className="group p-0 transition-all hover:shadow-lg hover:scale-[1.02] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
              >
                <Link
                  to={moduleHomePath(module)}
                  className="flex items-center gap-4 p-6 outline-none"
                >
                  <div
                    className="flex size-16 items-center justify-center rounded-xl overflow-hidden shrink-0 shadow-md transition-transform group-hover:scale-110"
                    style={module.logo_color ? { backgroundColor: module.logo_color } : { backgroundColor: '#0000FF' }}
                  >
                    <NamedIcon name={module.icon_name || 'form'} className="size-7 text-white" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <CardTitle className="text-xl font-semibold group-hover:text-primary transition-colors">
                      {displayName}
                    </CardTitle>
                    {displayTitle && (
                      <CardDescription className="text-sm text-muted-foreground line-clamp-2">
                        {displayTitle}
                      </CardDescription>
                    )}
                  </div>
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
