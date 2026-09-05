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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { userInfo } = useAuth()

  const [selectedModuleId, setSelectedModuleId] = React.useState<number | null>(null)
  const [selectedModuleSlug, setSelectedModuleSlug] = React.useState<string | null>(null)

  const handleModuleChange = React.useCallback((moduleId: number | null, moduleSlug: string | null) => {
    setSelectedModuleId(moduleId)
    setSelectedModuleSlug(moduleSlug)
  }, [])

  const userData = {
    name: userInfo?.name || userInfo?.preferred_username || 'User',
    email: userInfo?.email || '',
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
        <nav aria-label="Modules and apps" className="contents">
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
