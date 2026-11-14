import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { inputGroupIconButtonClassName } from '@/lib/utils-ext'
import { useT } from '@/i18n'

/**
 * The drill-down control on a rollup field. A real `<a>`, not a button with
 * an onClick: that is what a screen reader announces as a link, what
 * middle-click and "open in new tab" work on, and what a test can read off
 * the DOM. Same surface as a lookup's open icon: `ExternalLink`, new tab,
 * tooltip and aria-label from the same string.
 */
export function RollupDrillDownLink({ href, field }: { href: string; field: string }) {
  const t = useT()
  const label = t('Open {field} in a new tab', { field })
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={label}
            className={cn(buttonVariants({ variant: 'ghost' }), inputGroupIconButtonClassName, 'shrink-0')}
          />
        }
      >
        <ExternalLink aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
