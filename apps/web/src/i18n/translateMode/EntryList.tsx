import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { currentTranslationOf, useT, type TranslationEntry } from '@/i18n'

/** Rendered before "Show more" — enough to scroll, few enough to stay quick. */
const PAGE = 200

export interface EntryListProps {
  entries: readonly TranslationEntry[]
  /** Keys that have a translation in the active language. */
  translated: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
  /** What to show when there is nothing to list — a sentence, or a way out. */
  empty: ReactNode
}

/** The one list the panel renders: source, the key where it is not the source, current translation. */
export function EntryList({ entries, translated, onEdit, empty }: EntryListProps) {
  const t = useT()
  const [limit, setLimit] = useState(PAGE)

  if (entries.length === 0) {
    return <div className="px-2 py-4 text-muted-foreground">{empty}</div>
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {entries.slice(0, limit).map((entry) => {
          const translation = currentTranslationOf(entry)
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="flex w-full flex-col gap-0.5 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-medium">{entry.source}</span>
                <span className="text-muted-foreground">
                  {translation ||
                    (translated.has(entry.id) ? '' : <Badge variant="destructive">{t('Missing')}</Badge>)}
                </span>
                {/* A keyed message — model text, an error's code — shows the
                    key that names it; a code string's key IS its source. */}
                {entry.id !== entry.source && (
                  <span className="text-xs break-all text-muted-foreground">{entry.id}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {entries.length > limit && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
          {t('Show {count} more', { count: Math.min(PAGE, entries.length - limit) })}
        </Button>
      )}
    </div>
  )
}
