"use client"

import * as React from "react"
import { ChevronsUpDown, Search } from "lucide-react"
import { NamedIcon } from '@/components/ui-ext/named-icon'
import { useParams } from '@tanstack/react-router'
import { useModuleNavigate } from '@/hooks/useModuleNavigate'
import { openCommandPalette } from './CommandPalette'
import { PlatformShortcut } from '@/components/ui-ext/platform-shortcut'
import { getModuleDisplay } from '@/contexts/AuthContext'
import type { Module } from '@/contexts/AuthContext'
import { useTable } from '@/hooks/useTable'
import { Skeleton } from '@/components/ui/skeleton'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

type ModuleItem = {
  name: string
  displayName: string
  displayTitle: string
  slug: string
  alias?: string
  logoName: string
  logoColor?: string | null
  id?: number
  home_page?: string
}

function useModules(): { modules: ModuleItem[]; loading: boolean } {
  const { data, isLoading } = useTable<Module>('modules', {
    query: 'order=module_name.asc',
  })

  const modules = React.useMemo<ModuleItem[]>(() =>
    (data ?? []).map((module) => {
      const { displayName, displayTitle } = getModuleDisplay(module)
      return {
        name: module.module_name,
        displayName,
        displayTitle,
        slug: module.module_slug,
        alias: module.alias,
        logoName: module.icon_name || 'form',
        logoColor: module.logo_color || '#0000FF',
        id: module.id,
        home_page: module.home_page,
      }
    }), [data])

  return { modules, loading: isLoading }
}

export function ModuleSwitcher({
  onModuleChange,
}: {
  onModuleChange?: (moduleId: number | null, moduleSlug: string | null) => void
}) {
  const { modules, loading } = useModules()
  const params = useParams({ strict: false })
  const { moduleId } = params as { moduleId?: string }
  const navigateToModule = useModuleNavigate()
  const { isMobile } = useSidebar()
  const [activeModule, setActiveModule] = React.useState<ModuleItem | undefined>(undefined)

  React.useEffect(() => {
    if (modules.length === 0) return
    if (moduleId) {
      const lower = moduleId.toLowerCase()
      const match = modules.find(m => m.slug.toLowerCase() === lower)
      if (match) { setActiveModule(match); return }
    }
    if (!activeModule) setActiveModule(modules[0])
  }, [moduleId, modules])

  React.useEffect(() => {
    if (activeModule && onModuleChange) {
      onModuleChange(activeModule.id ?? null, activeModule.slug ?? null)
    }
  }, [activeModule, onModuleChange])

  const handleModuleClick = React.useCallback((module: ModuleItem) => {
    setActiveModule(module)
    navigateToModule({
      homePage: module.home_page,
      moduleId: module.id,
      moduleName: module.name,
      moduleSlug: module.slug,
    })
  }, [navigateToModule])

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-lg shrink-0" />
            {/* Bars are cap height (10px for the 14px label, 8px for the 12px
                sub-line), not the line box — a line-box-tall bar reads as a
                block rather than as text. The logo tile above keeps its full
                size-8 because a real logo IS that big. */}
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2 w-16" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!activeModule) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div
              className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden"
              style={activeModule.logoColor ? { backgroundColor: activeModule.logoColor } : undefined}
            >
              <NamedIcon name={activeModule.logoName} className="size-4 text-white" />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="line-clamp-2 font-medium whitespace-normal">{activeModule.displayName}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuItem
              onClick={openCommandPalette}
              className="gap-2 p-2"
            >
              <div className="flex size-6 items-center justify-center rounded-md border">
                <Search className="size-3.5 shrink-0" />
              </div>
              Quick navigation
              <PlatformShortcut modifier="mod" keyLabel="K" className="ml-auto" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {modules.map((module) => (
              <DropdownMenuItem
                key={module.slug}
                onClick={() => handleModuleClick(module)}
                className="gap-2 p-2"
              >
                <div
                  className="flex size-6 shrink-0 items-center justify-center rounded-md overflow-hidden"
                  style={module.logoColor ? { backgroundColor: module.logoColor } : undefined}
                >
                  {/* color="#fff" (Lucide prop → SVG stroke attribute), NOT a text-white class:
                      DropdownMenuItem applies `focus:**:text-accent-foreground` to every descendant
                      on hover. A text-* class loses that specificity fight; a hardcoded stroke
                      attribute sidesteps the currentColor cascade entirely, keeping the icon white
                      against its colored logo box without needing !important. */}
                  <NamedIcon name={module.logoName} className="size-3.5 shrink-0" color="#fff" />
                </div>
                <span className="line-clamp-2">{module.displayName}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
