"use client"

import * as React from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * The mobile sidebar is a modal Sheet: it covers the page and marks everything
 * behind it inert. Client-side navigation still updates the route underneath,
 * so without this a tap looks like a no-op — the destination is already there,
 * just hidden behind the overlay.
 *
 * Pathname only: search-param edits (sort, page, filters) must not dismiss the
 * menu, and neither must the first mount (the sheet starts closed anyway).
 */
export function CloseMobileSidebarOnNavigate() {
  const { setOpenMobile } = useSidebar()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isFirstPath = React.useRef(true)

  React.useEffect(() => {
    if (isFirstPath.current) {
      isFirstPath.current = false
      return
    }
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  return null
}
