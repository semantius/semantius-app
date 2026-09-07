"use client"

import { useNavigate } from '@tanstack/react-router'
import { useTable } from '@/hooks/useTable'
import { useT } from '@/i18n'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

// Displays the current user's saved bookmarks (user_bookmarks table), ordered by
// the hidden `row_order` column. The section is hidden entirely when there are none.
export function NavBookmarks() {
  const navigate = useNavigate()
  const t = useT()

  // user_bookmarks is row-level scoped to the current user; order by the hidden
  // row_order column (not part of metadata.properties, so we request it explicitly).
  const { data: bookmarks } = useTable('user_bookmarks', {
    query: 'select=id,title,url&order=row_order.asc',
  })

  // Don't render the section at all when the user has no bookmarks.
  if (!bookmarks || bookmarks.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{t('Favorites')}</SidebarGroupLabel>
      <SidebarMenu>
        {bookmarks.map((bookmark) => {
          const title = String(bookmark.title || '')
          const url = String(bookmark.url || '')
          // URLs without a scheme (no "://") are internal router paths; everything
          // else is an external link opened in a new tab.
          const isInternal = !url.includes('://')

          return (
            <SidebarMenuItem key={String(bookmark.id)}>
              <SidebarMenuButton
                onClick={(e) => {
                  e.preventDefault()
                  if (!url) return
                  if (isInternal) {
                    navigate({ to: url })
                  } else {
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }
                }}
              >
                <span>{title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
