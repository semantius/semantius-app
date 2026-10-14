import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { iconNames, type IconName } from 'lucide-react/dynamic'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NamedIcon } from '@/components/ui-ext/named-icon'

const COLUMNS = 8
const ROW_SIZE = 40

export interface IconPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onSelect: (name: IconName) => void
}

/**
 * A searchable, virtualized Lucide icon grid in a Base UI dialog.
 *
 * Pattern follows alan-crts/shadcn-iconpicker (search + TanStack Virtual rows),
 * rebuilt on this repo's Base UI Dialog and NamedIcon rather than a Radix
 * popover and a hand-rolled DynamicIcon wrapper.
 */
export function IconPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
}: IconPickerDialogProps) {
  const t = useT()
  const [query, setQuery] = useState('')
  const parentRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return iconNames
    return iconNames.filter((name) => name.includes(q))
  }, [query])

  const rowCount = Math.max(1, Math.ceil(filtered.length / COLUMNS))

  const virtualizer = useVirtualizer({
    count: filtered.length === 0 ? 1 : rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_SIZE,
    overscan: 8,
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const id = window.setTimeout(() => {
      searchRef.current?.focus()
      virtualizer.measure()
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, virtualizer])

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
  }, [query, virtualizer])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Choose an icon')}</DialogTitle>
          <DialogDescription>{t('Select an icon from the list.')}</DialogDescription>
        </DialogHeader>
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search icons')}
          aria-label={t('Search icons')}
        />
        <div
          ref={parentRef}
          className="h-80 overflow-auto rounded-xl border border-border"
        >
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('No icon found.')}</p>
          ) : (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const start = row.index * COLUMNS
                const names = filtered.slice(start, start + COLUMNS)
                return (
                  <div
                    key={row.key}
                    className="absolute top-0 left-0 grid w-full grid-cols-8 px-1"
                    style={{
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    {names.map((name) => {
                      const selected = name === value
                      return (
                        <Button
                          key={name}
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={name}
                          aria-label={name}
                          aria-pressed={selected}
                          className={cn(selected && 'bg-muted')}
                          onClick={() => {
                            onSelect(name)
                            onOpenChange(false)
                          }}
                        >
                          <NamedIcon name={name} aria-hidden="true" />
                        </Button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
