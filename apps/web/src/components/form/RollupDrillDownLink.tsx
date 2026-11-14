import { Link as LinkIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { inputGroupIconButtonClassName } from '@/lib/utils-ext'
import { useT } from '@/i18n'

/**
 * The drill-down control on a rollup field. A real `<a>`, not a button with
 * an onClick: that is what a screen reader announces as a link, what
 * middle-click and "open in new tab" work on, and what a test can read off
 * the DOM. Same surface as InputUrl's trailing icon.
 */
export function RollupDrillDownLink({ href, field }: { href: string; field: string }) {
  const t = useT()
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={t('Open {field}', { field })}
      className={cn(buttonVariants({ variant: 'ghost' }), inputGroupIconButtonClassName, 'shrink-0')}
    >
      <LinkIcon aria-hidden="true" />
    </a>
  )
}
