import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { iconNames, type IconName } from 'lucide-react/dynamic'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NamedIcon } from '@/components/ui-ext/named-icon'

const COLUMNS = 8
const ROW_SIZE = 40

export interface IconPickerProps {
  id?: string
  value?: string
  onSelect: (name: IconName) => void
}

/**
 * A searchable, virtualized Lucide icon grid.
 *
 * Pattern follows alan-crts/shadcn-iconpicker (search + TanStack Virtual rows),
 * rebuilt on this repo's Base UI primitives and NamedIcon. The form control
 * mounts this inside a Popover anchored to the field — not a centered dialog —
 * so it sits below the input like the other pickers.
 */
export function IconPicker({ id, value, onSelect }: IconPickerProps) {
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
  })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      searchRef.current?.focus()
      virtualizer.measure()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [virtualizer])

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
  }, [query, virtualizer])

  return (
    <div className="flex flex-col gap-2 p-2">
      <Input
        ref={searchRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Search icons')}
        aria-label={t('Search icons')}
      />
      <div
        id={id}
        ref={parentRef}
        className="h-64 overflow-auto rounded-xl border border-border"
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
                        onClick={() => onSelect(name)}
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
    </div>
  )
}
