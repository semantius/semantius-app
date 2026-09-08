import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  CATALOG_FILTER,
  SOURCE_LANGUAGE,
  catalogSnapshot,
  currentTranslationOf,
  entryForId,
  indexEntries,
  languageDisplayName,
  loadSourceIndex,
  sourceIndexSnapshot,
  sourceIndexVersion,
  subscribeToCatalog,
  subscribeToSourceIndex,
  translatedKeys,
  useT,
  type CatalogFilter,
  type TranslationEntry,
} from '@/i18n'
import { EDIT_HINT } from './hint'
import { EntryList } from './EntryList'

export interface PanelProps {
  open: boolean
  onOpenChange(open: boolean): void
  language: string
  presentIds: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
}

/**
 * The translations panel: the whole index — code strings and model text are
 * one list, told apart by nothing but their keys — with its filters and search.
 *
 * A modal Sheet. It could be non-modal — the page is still useful behind it —
 * but `ModalInert` makes `#root` inert for ANY open dialog outside it, so a
 * non-modal panel would block the page just the same while announcing itself
 * as something else. In-context editing happens with the panel closed.
 */
export function Panel({ open, onOpenChange, language, presentIds, onEdit }: PanelProps) {
  const t = useT()
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  const indexVersion = useSyncExternalStore(subscribeToSourceIndex, sourceIndexVersion, sourceIndexVersion)
  const isSource = language === SOURCE_LANGUAGE

  // Re-read the index every time the sheet opens: discovery — this session's
  // or another tab's — may have added keys since it was last read.
  useEffect(() => {
    if (open) void loadSourceIndex(true)
  }, [open])

  // `version` and `indexVersion` are the dependencies standing in for the
  // catalog state and the index these read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const translated = useMemo(() => translatedKeys(language), [language, version])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => sourceIndexSnapshot(), [indexVersion])
  const all = useMemo(() => (index ? indexEntries(index) : []), [index])

  // What this page rendered that the index has not caught up with yet.
  const unindexed = useMemo(
    () =>
      [...presentIds]
        .filter((id) => !index?.has(id))
        .map((id) => entryForId(id, index))
        .filter((entry): entry is TranslationEntry => entry !== undefined),
    [presentIds, index],
  )

  const missingCount = isSource
    ? 0
    : all.filter((entry) => !translated.has(entry.id)).length +
      unindexed.filter((entry) => !translated.has(entry.id)).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-i18n-ui=""
        side="right"
        className="gap-3 overflow-hidden p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="p-0">
          <SheetTitle>{t('Translations')}</SheetTitle>
          <SheetDescription>
            {isSource
              ? t('English is the source language. An entry saved here overrides the wording for this tenant.')
              : t('{language}: {missing, plural, one {# string} other {# strings}} of {total} still in English.', {
                  language: languageDisplayName(language),
                  missing: missingCount,
                  total: all.length + unindexed.length,
                })}
          </SheetDescription>
        </SheetHeader>
        <p className="text-xs text-muted-foreground">{t(EDIT_HINT)}</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CatalogList
            isSource={isSource}
            presentIds={presentIds}
            all={all}
            unindexed={unindexed}
            index={index}
            translated={translated}
            onEdit={onEdit}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function CatalogList({
  isSource,
  presentIds,
  all,
  unindexed,
  index,
  translated,
  onEdit,
}: {
  isSource: boolean
  presentIds: ReadonlySet<string>
  all: readonly TranslationEntry[]
  unindexed: readonly TranslationEntry[]
  index: ReadonlyMap<string, string> | undefined
  translated: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
}) {
  const t = useT()
  const [filter, setFilter] = useState<CatalogFilter>(isSource ? CATALOG_FILTER.all : CATALOG_FILTER.missing)
  const [search, setSearch] = useState('')

  const filters: { id: CatalogFilter; label: string; disabled?: boolean }[] = [
    { id: CATALOG_FILTER.all, label: t('All') },
    // Nothing is missing in the source language — its catalog is the code.
    { id: CATALOG_FILTER.missing, label: t('Missing'), disabled: isSource },
    { id: CATALOG_FILTER.onPage, label: t('On this page') },
  ]

  const entries = useMemo<TranslationEntry[]>(() => {
    let list: TranslationEntry[]
    switch (filter) {
      case CATALOG_FILTER.missing:
        list = [...all, ...unindexed].filter((entry) => !translated.has(entry.id))
        break
      case CATALOG_FILTER.onPage:
        list = [...presentIds]
          .map((id) => entryForId(id, index))
          .filter((entry): entry is TranslationEntry => entry !== undefined)
        break
      default:
        list = [...all, ...unindexed]
    }
    const needle = search.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (entry) =>
        entry.source.toLowerCase().includes(needle) ||
        entry.id.toLowerCase().includes(needle) ||
        currentTranslationOf(entry).toLowerCase().includes(needle),
    )
  }, [filter, search, translated, all, unindexed, presentIds, index])

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('Search source text, key or translation')}
        aria-label={t('Search translations')}
      />
      <div role="group" aria-label={t('Filter')} className="flex flex-wrap gap-2">
        {filters.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={filter === option.id ? 'default' : 'outline'}
            aria-pressed={filter === option.id}
            disabled={option.disabled}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <EntryList entries={entries} translated={translated} onEdit={onEdit} empty={t('Nothing matches this filter.')} />
    </div>
  )
}
