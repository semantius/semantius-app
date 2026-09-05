import { Outlet } from '@tanstack/react-router'
import { Header } from './Header'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'
import { SkipLink } from '@/components/a11y/SkipLink'
import { MAIN_CONTENT_ID } from '@/components/a11y/landmarks'
import {
  SidebarInset,
  SidebarProvider
} from '@/components/ui/sidebar'

export function AppLayout() {
  return (
    <SidebarProvider className="overflow-x-hidden">
      {/* First focusable element in the document — see SkipLink. */}
      <SkipLink />
      <CommandPalette />
      <AppSidebar />
      {/* SidebarInset renders the app's only <main>. Naming it and giving it a
          programmatic focus target is what makes the skip link and the route
          announcer work; tabIndex={-1} makes it focusable by script without
          adding a tab stop. */}
      <SidebarInset
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        aria-label="Main content"
        className="min-w-0 outline-none"
      >
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <Header />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-w-0 overflow-x-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
