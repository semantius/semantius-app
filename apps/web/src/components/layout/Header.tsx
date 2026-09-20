import { Link } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useT } from '@/i18n'

export function Header() {
  const t = useT()

  return (
    <div className="flex h-full w-full items-center px-4 gap-2">
      <SidebarTrigger>
        <PanelLeft className="h-5 w-5" />
      </SidebarTrigger>
      
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="font-bold">S</span>
          </div>
          <span className="font-bold">{t('Semantius UI')}</span>
        </Link>
      </div>
    </div>
  )
}
