/**
 * Tabs on Base UI, styled like the shadcn `base-rhea` registry item.
 *
 * WHY THIS IS IN `ui-ext/` AND NOT `ui/`. The CLI is the only sanctioned way to
 * put a file in `ui/`, and `shadcn add tabs` (both the repo's pinned 4.19 and
 * the current 4.21) emits `import { cn } from "cn"` for this item — a package
 * import the CLI then "installs" as `cn@0.2.6` in package.json — instead of
 * resolving the `aliases.utils` in components.json the way every other item in
 * `ui/` did. A file that does not compile cannot be regenerated as-is, and a
 * hand-edited `ui/` file is exactly what the boundary forbids. So the markup
 * below is the registry item's, horizontal only, with the one import fixed,
 * kept where we own it. Swap it for the CLI's output once the CLI resolves the
 * alias again.
 */

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'

import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('group/tabs flex flex-col gap-2', className)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'group/tabs-list inline-flex h-8 w-fit items-center justify-center rounded-2xl bg-muted p-[3px] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-transparent! px-2 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('flex-1 text-sm outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
