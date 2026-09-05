"use client"

import {
  ChevronsUpDown,
  LogOut,
} from "lucide-react"
import { Link, useRouter } from '@tanstack/react-router'
import { useTable } from '@/hooks/useTable'
import { useAuth } from '@/hooks/useAuth'
import { getConfig } from '@/lib/config'
import { resolveMenuTarget, type UserMenuEntry } from '@/lib/userMenu'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

// Utility function to generate user initials
function getUserInitials(name?: string): string {
  if (!name) return 'U'
  
  const nameParts = name.trim().split(' ')
  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase()
  }
  
  return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const userInitials = getUserInitials(user.name)

  // Account/admin entries are configuration, not code: VITE_BACKEND_TYPE picks a
  // built-in menu and VITE_UI_CUSTOMIZER can replace it (see lib/userMenu.ts).
  // URLs are already concrete here — {orgid} was substituted at initConfig time.
  const { rpcUserInfo } = useAuth()
  const userPermissions = (rpcUserInfo?.permissions as string[] | undefined) ?? []
  // rpcUserInfo is null until /rpc/get_userinfo resolves, so permission-gated
  // entries stay hidden until then — the same behavior as module gating.
  const menuEntries = getConfig().uiCustomizer.user.menu.filter(
    (entry) => !entry.permission || userPermissions.includes(entry.permission)
  )

  // Show the "Manage Favorites" entry only when the user actually has favorites.
  // Reuse NavBookmarks' exact query string so react-query serves both from one
  // cached fetch (query key is ['table', tableName, query, count]).
  const { data: bookmarks } = useTable('user_bookmarks', {
    query: 'select=id,title,url&order=row_order.asc',
  })
  const hasFavorites = (bookmarks?.length ?? 0) > 0

  // Only the in-app case is scripted. A `redirect` or `newtab` entry leaves the
  // SPA, and leaving the SPA is what an anchor is for: the browser handles the
  // navigation, middle-click and "open in new tab" work, assistive technology
  // announces a link instead of a button, and the behavior is expressed in the
  // DOM where a test can read it rather than in a call a test can only observe
  // by replacing `window.location`.
  const pushInApp = (entry: UserMenuEntry) => {
    // history.push, not navigate({ search }): these are pre-built URLs with a
    // query string, and TanStack's search serializer JSON-encodes values that
    // parse as JSON (an org slug like "1002" would become %221002%22).
    router.history.push(entry.url)
  }

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
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {menuEntries.map((entry) => {
                const key = `${entry.title}:${entry.url}`
                const target = resolveMenuTarget(entry)

                if (target === 'newtab') {
                  // noopener also implies noreferrer in modern browsers, but both
                  // are spelled out — the opened page must never reach back via
                  // window.opener.
                  return (
                    <DropdownMenuItem
                      key={key}
                      render={
                        // The anchor's content comes from DropdownMenuItem's
                        // children: Base UI's `render` prop merges them into the
                        // element it renders. anchor-has-content reads the JSX
                        // literally, sees an `<a />` with no children of its own,
                        // and cannot follow that — the accessible name is
                        // asserted in NavUser.test.tsx instead.
                        // eslint-disable-next-line jsx-a11y/anchor-has-content
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      {entry.title}
                    </DropdownMenuItem>
                  )
                }

                if (target === 'redirect') {
                  // A document navigation, same tab: an absolute URL, or a
                  // same-origin path another server answers (`/idp/*` is proxied
                  // to the IdP, and the router's catch-all would otherwise
                  // swallow it). Deliberately a plain <a>, not a <Link>.
                  return (
                    <DropdownMenuItem
                      key={key}
                      render={
                        // Content comes from the children, via `render` — see above.
                        // eslint-disable-next-line jsx-a11y/anchor-has-content
                        <a href={entry.url} />
                      }
                    >
                      {entry.title}
                    </DropdownMenuItem>
                  )
                }

                // Base UI's Menu.Item has no onSelect — that prop silently binds
                // to the native text-selection event and never fires on click.
                return (
                  <DropdownMenuItem key={key} onClick={() => pushInApp(entry)}>
                    {entry.title}
                  </DropdownMenuItem>
                )
              })}
              {hasFavorites && (
                <DropdownMenuItem
                  render={
                    <Link
                      to="/$moduleId/$table_name"
                      params={{ moduleId: 'admin', table_name: 'user_bookmarks' }}
                    />
                  }
                >
                  Manage Favorites
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/*
              A plain <a>, not a TanStack <Link>: `/logout` is an in-app route,
              so a <Link> would push it into the SPA and leave AuthProviderWrapper
              and the QueryClient mounted while logout.tsx wipes storage. The
              document load is the behavior this has always had, and the one that
              guarantees nothing survives the sign-out.
            */}
            {/* Content comes from the children, via `render` — see above. */}
            {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
            <DropdownMenuItem render={<a href="/logout" />}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
