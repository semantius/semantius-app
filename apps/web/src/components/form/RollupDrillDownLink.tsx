import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { inputGroupIconButtonClassName } from '@/lib/utils-ext'
import { useT } from '@/i18n'
import { useRpc } from '@/hooks/useRpc'
import type { EntityMetadata } from '@/types/metadata'

/**
 * The drill-down control on a rollup field. A real `<a>`, not a button with
 * an onClick: that is what a screen reader announces as a link, what
 * middle-click and "open in new tab" work on, and what a test can read off
 * the DOM. Same surface as a lookup's open icon: `ExternalLink`, new tab,
 * tooltip and aria-label from the same string: "Open {entity}" where entity
 * is the linked table's plural (Interviews, Order Details), not the rollup
 * field's title.
 */
export function RollupDrillDownLink({ href, entity }: { href: string; entity: string }) {
  const t = useT()
  const label = t('Open {entity}', { entity })
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

/**
 * When the parent entity's `children` array does not name this rollup, load
 * the linked table's own schema for `plural_label`. `children` lists only
 * `parent` links, so this is every rollup over a `reference` link (Northwind
 * suppliers.product_count, over products.supplier_id). If the fetch yields no
 * plural, the link is not drawn at all, which is why a test against a real
 * tenant covers this path. Isolated from InputNumber so a form-harness test
 * that already has the plural never needs Auth.
 */
export function RollupDrillDownFromTable({
  href,
  table,
  moduleSlug,
}: {
  href: string
  table: string
  moduleSlug: string | undefined
}) {
  const t = useT()
  const { data } = useRpc<EntityMetadata>('get_schema', {
    params: { p_table_name: table },
  })
  const fallback = data?.table?.plural_label
  if (!fallback) return null
  const linkedModule = data?.table?.module_slug || moduleSlug
  const entity = linkedModule
    ? t({
        id: ['module', linkedModule, table, 'entity', 'plural_label'],
        defaultMessage: fallback,
      })
    : fallback
  return <RollupDrillDownLink href={href} entity={entity} />
}
