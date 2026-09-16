"use client"

import * as React from "react"

import { NavApps } from '@/components/layout/NavApps'
import { NavBookmarks } from '@/components/layout/NavBookmarks'
import { NavUser } from '@/components/layout/NavUser'
import { ModuleSwitcher } from '@/components/layout/ModuleSwitcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useT } from '@/i18n'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userInfo, rpcUserInfo } = useAuth()
  const t = useT()

  const [selectedModuleId, setSelectedModuleId] = React.useState<number | null>(null)
  const [selectedModuleSlug, setSelectedModuleSlug] = React.useState<string | null>(null)

  const handleModuleChange = React.useCallback((moduleId: number | null, moduleSlug: string | null) => {
    setSelectedModuleId(moduleId)
    setSelectedModuleSlug(moduleSlug)
  }, [])

  // The API's user record is the floor: /rpc/get_userinfo is fetched on every
  // sign-in for roles and modules anyway, and it holds the same name and e-mail,
  // written from the token's claims when the record was created. The OAuth
  // userinfo endpoint is optional — many issuers host it for a different
  // audience and refuse our token (Entra ID points at Microsoft Graph) — so it
  // is an overlay when configured and working, never the only source. Field by
  // field, so a source that lacks one does not blank out the other's value.
  const userData = {
    name:
      userInfo?.name ||
      userInfo?.preferred_username ||
      rpcUserInfo?.display_name ||
      rpcUserInfo?.email ||
      t('User'),
    email: userInfo?.email || rpcUserInfo?.email || '',
    // Only userinfo carries one, and note that some issuers return a URL that
    // itself needs a bearer token (Graph's /me/photo/$value), which an <img>
    // cannot send — such a value renders as a broken image, not a photo.
    avatar: userInfo?.picture || '',
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <ModuleSwitcher onModuleChange={handleModuleChange} />
      </SidebarHeader>
      <SidebarContent>
        {/* 1.3.1 — the app had no <nav> landmark at all, so the skip link had
            nothing named to skip past and "navigate by landmark" reached only
            <main>. Labelled because a second nav (the account menu in the
            footer) exists; unlabelled siblings are indistinguishable in a
            landmark list. */}
        <nav aria-label={t('Modules and apps')} className="contents">
          <NavApps moduleId={selectedModuleId} moduleSlug={selectedModuleSlug} />
          <NavBookmarks />
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
