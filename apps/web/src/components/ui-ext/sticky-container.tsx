import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type StickyEdge = 'top' | 'bottom'

interface StickyContainerProps extends ComponentProps<'div'> {
  /**
   * When set, the container uses CSS `position: sticky` so it stays pinned to the
   * top/bottom edge of its nearest scroll container while that edge would otherwise
   * scroll out of view. When the content is short enough that the container's natural
   * position is already on screen, it just renders in place — no pinning.
   *
   * This is exactly the "form footer" behavior: a taller-than-viewport form keeps the
   * action bar glued to the bottom of the window, while a short form shows it at the end
   * of the form (not forced to the bottom). Works in any scroll context (the page, the
   * Sheet's scroll area, the Dialog body) with no measurement or JS — the nearest
   * scrolling ancestor is the reference automatically.
   */
  sticky?: StickyEdge
}

export function StickyContainer({ sticky, className, children, ...props }: StickyContainerProps) {
  return (
    <div
      className={cn(
        // bg-background is required so scrolled content does not show through while pinned.
        // NB: the nearest scroll container must NOT have padding on the sticky edge — a
        // `pb-*` on a `bottom-0` container leaves a gap the bar can't cover (content peeks
        // through) AND makes the pinned position differ from the resting position, so the
        // bar visibly jumps when scrolled to the end. Keep that edge's padding at 0 and let
        // this bar's own padding provide the spacing.
        sticky === 'bottom' && 'sticky bottom-0 z-10 border-t bg-background',
        sticky === 'top' && 'sticky top-0 z-10 border-b bg-background',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
