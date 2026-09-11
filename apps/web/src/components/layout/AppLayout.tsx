import { Outlet } from '@tanstack/react-router'
import { useT } from '@/i18n'
import { Header } from './Header'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'
import { SkipLink } from '@/components/a11y/SkipLink'
import { MAIN_CONTENT_ID } from '@/components/a11y/landmarks'
import { TranslateModeHost } from '@/components/TranslateModeHost'
import {
  SidebarInset,
  SidebarProvider
} from '@/components/ui/sidebar'

export function AppLayout() {
  const t = useT()

  return (
    <SidebarProvider className="overflow-x-hidden">
      {/* First focusable element in the document — see SkipLink. */}
      <SkipLink />
      <CommandPalette />
      {/* Renders nothing unless a translator switched it on in the account menu. */}
      <TranslateModeHost />
      <AppSidebar />
      {/* SidebarInset renders the app's only <main>, named for the landmark
          list. The skip link's target and the route announcer's focus target
          (MAIN_CONTENT_ID) are NOT on it: the header — breadcrumb, search,
          account menu — is inside the landmark, so "skip to main content"
          pointed at an element that still began with everything the link
          exists to skip (2.4.1). The target is the content block below the
          header instead; tabIndex={-1} makes it focusable by script without
          adding a tab stop. */}
      <SidebarInset aria-label={t('Main content')} className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <Header />
        </header>
        <div
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex flex-1 flex-col gap-4 p-4 pt-0 min-w-0 overflow-x-hidden outline-none"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
