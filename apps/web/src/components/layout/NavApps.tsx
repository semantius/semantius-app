"use client"

import {
  Folder,
  Forward,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useTable } from '@/hooks/useTable'
import type { Module } from '@/contexts/AuthContext'
import { ApiErrorDisplay } from '@/components/ApiErrorDisplay'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar'

// Component that fetches and displays tables for the currently selected module
export function NavApps({
  moduleId,
  moduleSlug,
}: {
  moduleId: number | null
  moduleSlug: string | null
}) {
  const { isMobile } = useSidebar()
  const matchRoute = useMatchRoute()
  const navigate = useNavigate()

  // Fetch tables filtered by module_id
  // Only fetch when we have a valid module_id
  // Note: tables table doesn't have table_id, primary key is likely id
  const { data: tables, isLoading, error } = useTable('tables', {
    query: moduleId ? `module_id=eq.${moduleId}&is_child=not.is.true&select=table_name,plural_label,icon_url,singular_label` : '',
    enabled: !!moduleId,
  })

  // The tables query is disabled until a module is known, and a disabled query
  // reports isLoading: false — so during boot NavApps would flash "Select a
  // module to view apps" while the modules list is still in flight. Watching the
  // modules query too keeps the skeleton up across that gap.
  // IMPORTANT: this call must stay byte-identical to ModuleSwitcher's (and
  // SidebarPrefetch's) — the react-query key is ['table', name, query, count],
  // so a drifting query string would fetch modules a second time instead of
  // sharing the one cache entry.
  const { isLoading: modulesLoading } = useTable<Module>('modules', {
    query: 'order=module_name.asc',
  })

  // Show error if fetch fails
  if (error) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Apps</SidebarGroupLabel>
        <ApiErrorDisplay error={error} title="Error loading apps" />
      </SidebarGroup>
    )
  }

  // Show loading state. Note the second clause is only about the *boot* gap
  // described above — once modules have loaded, a tenant with no modules at all
  // must fall through to the empty state rather than skeleton forever.
  if (isLoading || (!moduleId && modulesLoading)) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Apps</SidebarGroupLabel>
        <SidebarMenu>
          {/* SidebarMenuSkeleton renders one item, so repeat it here.
              Its text bar defaults to h-4 (the text-sm line box); a menu label
              is 14px Geist with a 10px cap, so the default reads as a slab next
              to the rest of the skeletons. Target it by its data-sidebar hook —
              the icon bar is a sibling and must stay size-4, because a real
              icon IS 16px. Call-site className: ui/sidebar.tsx is CLI-owned. */}
          {Array.from({ length: 4 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton
                showIcon
                className="**:data-[sidebar=menu-skeleton-text]:h-2.5"
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    )
  }

  // Show empty state if no module selected or no tables
  if (!moduleId || !tables || tables.length === 0) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Apps</SidebarGroupLabel>
        <div className="text-sm text-muted-foreground px-2 py-1">
          {!moduleId ? 'Select a module to view apps' : 'No apps available'}
        </div>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Apps</SidebarGroupLabel>
      <SidebarMenu>
        {tables.map((table) => {
          const tableName = String(table.table_name || '')
          const label = String(table.plural_label || table.singular_label || tableName)
          const url = `/${moduleSlug || ''}/${tableName}`

          // Check if this link matches the current route
          const isActive = !!matchRoute({ to: url, fuzzy: true })

          return (
            <SidebarMenuItem key={tableName}>
              <SidebarMenuButton
                isActive={isActive}
                onClick={(e) => {
                  e.preventDefault()
                  // Explicitly clear search params to avoid inheriting sortBy, page, etc. from current page
                  navigate({ to: url, search: {}, replace: true })
                }}
              >
                {!!table.icon_url && <img src={String(table.icon_url)} alt="" className="size-4 shrink-0" />}
                <span>{label}</span>
              </SidebarMenuButton>
              {/* <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <MoreHorizontal />
                    <span className="sr-only">More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-48 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align={isMobile ? "end" : "start"}
                >
                  <DropdownMenuItem>
                    <Folder className="text-muted-foreground" />
                    <span>View App</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Forward className="text-muted-foreground" />
                    <span>Share App</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Trash2 className="text-muted-foreground" />
                    <span>Delete App</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu> */}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
