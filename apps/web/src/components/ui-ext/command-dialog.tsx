import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Fork of `CommandDialog` from `components/ui/command.tsx`.
 *
 * WHY IT EXISTS — the registry version puts the dialog's accessible name OUTSIDE
 * the dialog:
 *
 *     <Dialog>
 *       <DialogHeader className="sr-only">   <-- sibling of the popup
 *         <DialogTitle>Command Palette</DialogTitle>
 *       </DialogHeader>
 *       <DialogContent>{children}</DialogContent>
 *     </Dialog>
 *
 * `DialogHeader` is a plain `<div>`, not part of the portal, so that `<h2>`
 * renders into the page unconditionally — even while the palette is closed. Two
 * consequences: the command palette is mounted in AppLayout, so every route ships
 * an `<h2>` in the DOM ahead of its own `<h1>` (1.3.1 heading order), and the
 * dialog itself is left without an accessible name, because a title outside the
 * popup names nothing.
 *
 * Moving the header inside `DialogContent` fixes both. It cannot be fixed at the
 * call site — the structure is internal to the component — and `ui/command.tsx`
 * is shadcn-CLI-owned, where a hand-edit is silently reverted by the next
 * `shadcn add`. Hence a fork, per the ui/ vs ui-ext/ boundary.
 *
 * Everything else is unchanged from the registry version, so a future upgrade can
 * be diffed against it.
 */
export function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  children: React.ReactNode
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-3xl! p-0",
          className
        )}
        showCloseButton={showCloseButton}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
