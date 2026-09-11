import { Outlet, useNavigate, useMatchRoute, createLazyFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

export const Route = createLazyFileRoute('/_app/crm/home')({
  component: RouteComponent,
})

function RouteComponent() {
  const t = useT()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  
  // Check if we're on a child route
  const isDetailOpen = !!matchRoute({ to: '/crm/home/detail' })

  const handleOpenSidebar = () => {
    navigate({ to: '/crm/home/detail' })
  }

  const handleCloseSidebar = () => {
    navigate({ to: '/crm/home' })
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t('CRM Home')}</h1>
      <Button onClick={handleOpenSidebar}>{t('Open Sidebar')}</Button>

      <Sheet open={isDetailOpen} onOpenChange={(open) => !open && handleCloseSidebar()}>
        {/* data-[side=right]: is required on BOTH width classes, not decorative
            — see the note on SheetContent in View.tsx. The vendored sheet ships
            `data-[side=right]:w-3/4` and `data-[side=right]:sm:max-w-sm`; a bare
            `w-full` or `sm:max-w-md` here is a different tailwind-merge group
            key, so both survive and the modifier version out-specifies the bare
            one: the sheet renders 75% wide, or capped at 384px instead of the
            448px it asks for. */}
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-md border-l-0">
          <SheetHeader>
            <SheetTitle>{t('Detail View')}</SheetTitle>
            <SheetDescription>{t('This is a sidebar opened via a subroute')}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <Outlet />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
