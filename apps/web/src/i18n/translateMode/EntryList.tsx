import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SCOPE, currentTranslationOf, useT, type TranslationEntry } from '@/i18n'
import { scopeLabel } from './scopeLabels'

/** Rendered before "Show more" — enough to scroll, few enough to stay quick. */
const PAGE = 200

export interface EntryListProps {
  entries: readonly TranslationEntry[]
  /** Ids that have a translation in the active language. */
  translated: ReadonlySet<string>
  /** Ids currently held as browser drafts. */
  drafts: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
  /** What to say when there is nothing to list. */
  empty: string
}

/** The one list both panel tabs render: source, badges, current translation. */
export function EntryList({ entries, translated, drafts, onEdit, empty }: EntryListProps) {
  const t = useT()
  const [limit, setLimit] = useState(PAGE)

  if (entries.length === 0) {
    return <p className="px-2 py-4 text-muted-foreground">{empty}</p>
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
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entry.source}</span>
                  {entry.context && <Badge variant="outline">{entry.context}</Badge>}
                  {entry.scope !== SCOPE.message && <Badge variant="secondary">{scopeLabel(t, entry.scope)}</Badge>}
                  {drafts.has(entry.id) && <Badge variant="outline">{t('Draft')}</Badge>}
                </span>
                <span className="text-muted-foreground">
                  {translation ||
                    (translated.has(entry.id) ? '' : <Badge variant="destructive">{t('Missing')}</Badge>)}
                </span>
                {entry.scope !== SCOPE.message && (
                  <span className="text-xs break-all text-muted-foreground">{entry.key}</span>
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
