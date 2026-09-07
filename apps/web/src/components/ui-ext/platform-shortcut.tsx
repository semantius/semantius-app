"use client"

import * as React from "react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { msg, useT, type MessageDescriptor } from "@/i18n"

// Platform-aware keyboard shortcut display (pattern from
// shadcn.io/examples/kbd-platform-aware-shortcut): on macOS show the native
// symbols (⌘ ⌥ ⇧ ⌃); everywhere else show text labels (Ctrl, Alt, Shift). Built
// on shadcn/ui's Kbd + KbdGroup. Display-only — it renders the hint, it does not
// bind the key handler.
type Modifier = "mod" | "alt" | "shift" | "ctrl"

// "mod" is the primary accelerator: ⌘ on Mac, Ctrl elsewhere.
const MAC_SYMBOLS: Record<Modifier, string> = {
  mod: "⌘",
  alt: "⌥",
  shift: "⇧",
  ctrl: "⌃",
}
// The Mac symbols are glyphs printed on every keyboard, the same everywhere.
// The PC labels are WORDS printed on the key, and they differ by market — a
// German keyboard says "Strg", not "Ctrl" — so they are messages. Descriptors,
// because this is a module constant with no React in it; the component renders
// them with t().
const PC_LABELS: Record<Modifier, MessageDescriptor> = {
  mod: msg("Ctrl"),
  alt: msg("Alt"),
  shift: msg("Shift"),
  ctrl: msg("Ctrl"),
}

// navigator.platform is only available client-side, so default to the non-Mac
// labels and resolve after mount (typeof window guard for SSR / pre-paint).
function useIsMac() {
  const [isMac, setIsMac] = React.useState(false)
  React.useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0)
    }
  }, [])
  return isMac
}

export function PlatformShortcut({
  modifier = "mod",
  keyLabel,
  className,
}: {
  modifier?: Modifier
  keyLabel: string
  className?: string
}) {
  const t = useT()
  const isMac = useIsMac()
  const mod = isMac ? MAC_SYMBOLS[modifier] : t(PC_LABELS[modifier])
  return (
    <KbdGroup className={cn(className)}>
      <Kbd>{mod}</Kbd>
      <Kbd>{keyLabel}</Kbd>
    </KbdGroup>
  )
}
