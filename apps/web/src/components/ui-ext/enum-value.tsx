import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { NamedIcon } from '@/components/ui-ext/named-icon'
import { enumBadgeColors } from '@/lib/css-color'

export function EnumValue({
  icon,
  label,
  className,
}: {
  icon?: string
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {icon ? <NamedIcon name={icon} aria-hidden="true" className="size-4 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

export function EnumBadge({
  icon,
  label,
  color,
  variant = 'outline',
}: {
  icon?: string
  label: string
  color?: string
  variant?: 'default' | 'secondary' | 'outline'
}) {
  const painted = enumBadgeColors(color)
  return (
    <Badge
      variant={painted ? 'outline' : variant}
      style={painted}
      // Badge's `[&>svg]:size-3!` is 12px. The grid enum icon is 16px, and
      // h-6 gives that glyph a 24px badge so overflow-hidden does not clip it.
      className={icon ? 'h-6 gap-1 [&>svg]:size-4!' : undefined}
    >
      {icon ? (
        <NamedIcon name={icon} aria-hidden="true" data-icon="inline-start" className="size-4 shrink-0" />
      ) : null}
      {label}
    </Badge>
  )
}
