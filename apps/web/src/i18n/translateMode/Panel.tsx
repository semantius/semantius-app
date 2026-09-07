import { useMemo, useState, useSyncExternalStore } from 'react'
import { useTable } from '@/hooks/useTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui-ext/tabs'
import {
  CATALOG_FILTER,
  MODEL_QUERIES,
  MODEL_TABLES,
  PANEL_TAB,
  SOURCE_LANGUAGE,
  TENANT_TABLE,
  buildLabelInventory,
  catalogSnapshot,
  currentTranslationOf,
  entryForId,
  languageDisplayName,
  messageEntries,
  queueQuery,
  requestEntry,
  splitScopedId,
  subscribeToCatalog,
  tenantTableAvailable,
  translatedKeys,
  useT,
  type CatalogFilter,
  type FieldRow,
  type ModuleRow,
  type PanelTab,
  type TableRow,
  type TranslationEntry,
  type TranslationScope,
} from '@/i18n'
import { localRequests } from '@/i18n/missing'
import { EDIT_HINT } from './hint'
import { EntryList } from './EntryList'
import { LabelsTab } from './LabelsTab'

interface QueueRow {
  id: number
  scope: TranslationScope
  key: string
  context: string
  origin: string | null
  first_seen: string
}

export interface PanelProps {
  open: boolean
  onOpenChange(open: boolean): void
  language: string
  presentIds: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
}

/**
 * The translations panel: the whole catalog with its filters, and the model
 * labels.
 *
 * A modal Sheet. It could be non-modal — the page is still useful behind it —
 * but `ModalInert` makes `#root` inert for ANY open dialog outside it, so a
 * non-modal panel would block the page just the same while announcing itself
 * as something else. In-context editing happens with the panel closed.
 */
export function Panel({ open, onOpenChange, language, presentIds, onEdit }: PanelProps) {
  const t = useT()
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  const isSource = language === SOURCE_LANGUAGE
  const [tab, setTab] = useState<PanelTab>(PANEL_TAB.catalog)

  // The model, for the labels tab. Three reads through the generic hook, only
  // while the panel is open.
  const tables = useTable<TableRow>(MODEL_TABLES.tables, { query: MODEL_QUERIES.tables, enabled: open })
  const fields = useTable<FieldRow>(MODEL_TABLES.fields, { query: MODEL_QUERIES.fields, enabled: open })
  const modules = useTable<ModuleRow>(MODEL_TABLES.modules, { query: MODEL_QUERIES.modules, enabled: open })
  const inventory = useMemo(
    () =>
      tables.data && fields.data && modules.data
        ? buildLabelInventory({ tables: tables.data, fields: fields.data, modules: modules.data })
        : undefined,
    [tables.data, fields.data, modules.data],
  )
  const inventoryLoading = tables.isLoading || fields.isLoading || modules.isLoading

  // The queue: what the collector recorded — empty-translation rows on a target
  // that has the table.
  const queue = useTable<QueueRow>(TENANT_TABLE, {
    query: queueQuery(language),
    enabled: open && tenantTableAvailable(),
  })
  const requests = useMemo<TranslationEntry[]>(() => {
    // Read only while the sheet is open, which is also what makes `open` a real
    // dependency rather than a trigger the lint rule would strip. This component
    // is MOUNTED as soon as translate mode is on, with the sheet closed, so a
    // list computed at mount is computed before the collector's debounce has
    // written anything — and on a deployment with no tenant table `queue.data`
    // never changes, so it would stay empty forever.
    if (!open) return []
    const rows = tenantTableAvailable() ? (queue.data ?? []) : localRequests(language)
    return rows.map(requestEntry)
  }, [queue.data, language, open])

  // `version` is the dependency standing in for the catalog state these read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const translated = useMemo(() => translatedKeys(language), [language, version])

  const all = messageEntries()
  const missingCount = isSource ? 0 : all.filter((entry) => !translated.has(entry.id)).length
  // The labels on this page without a translation — the other half of the
  // count the Language submenu shows, said separately so the two agree.
  const missingLabels = isSource
    ? 0
    : [...presentIds].filter((id) => splitScopedId(id) !== null && !translated.has(id)).length

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
              : t(
                  '{language}: {missing, plural, one {# string} other {# strings}} of {total} still in English, and {labels, plural, one {# label} other {# labels}} on this page.',
                  {
                    language: languageDisplayName(language),
                    missing: missingCount,
                    total: all.length,
                    labels: missingLabels,
                  },
                )}
          </SheetDescription>
        </SheetHeader>
        <p className="text-xs text-muted-foreground">{t(EDIT_HINT)}</p>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as PanelTab)}
          className="min-h-0 flex-1"
        >
          <TabsList>
            <TabsTrigger value={PANEL_TAB.catalog}>{t('Catalog')}</TabsTrigger>
            <TabsTrigger value={PANEL_TAB.labels}>{t('Model labels')}</TabsTrigger>
          </TabsList>
          <TabsContent value={PANEL_TAB.catalog} className="min-h-0 overflow-y-auto">
            <CatalogTab
              isSource={isSource}
              presentIds={presentIds}
              requests={requests}
              translated={translated}
              onEdit={onEdit}
              missingLabels={missingLabels}
              onShowLabels={() => setTab(PANEL_TAB.labels)}
            />
          </TabsContent>
          <TabsContent value={PANEL_TAB.labels} className="min-h-0 overflow-y-auto">
            <LabelsTab
              language={language}
              presentIds={presentIds}
              inventory={inventory}
              inventoryLoading={inventoryLoading}
              active={open && tab === PANEL_TAB.labels}
              translated={translated}
              onEdit={onEdit}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function CatalogTab({
  isSource,
  presentIds,
  requests,
  translated,
  onEdit,
  missingLabels,
  onShowLabels,
}: {
  isSource: boolean
  presentIds: ReadonlySet<string>
  requests: readonly TranslationEntry[]
  translated: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
  /** Marked model labels on this page — they belong to the OTHER tab. */
  missingLabels: number
  onShowLabels(): void
}) {
  const t = useT()
  const [filter, setFilter] = useState<CatalogFilter>(isSource ? CATALOG_FILTER.all : CATALOG_FILTER.missing)
  const [search, setSearch] = useState('')

  const filters: { id: CatalogFilter; label: string; disabled?: boolean }[] = [
    { id: CATALOG_FILTER.all, label: t('All') },
    // Nothing is missing in the source language — its catalog is the code.
    { id: CATALOG_FILTER.missing, label: t('Missing'), disabled: isSource },
    { id: CATALOG_FILTER.requested, label: t('Requested') },
    { id: CATALOG_FILTER.onPage, label: t('On this page') },
  ]

  const entries = useMemo<TranslationEntry[]>(() => {
    let list: TranslationEntry[]
    switch (filter) {
      case CATALOG_FILTER.missing:
        list = messageEntries().filter((entry) => !translated.has(entry.id))
        break
      case CATALOG_FILTER.requested:
        list = [...requests]
        break
      case CATALOG_FILTER.onPage:
        // Messages and runtime text; the labels on the page have their own tab.
        list = [...presentIds]
          .filter((id) => {
            const scoped = splitScopedId(id)
            return scoped === null || scoped.scope === 'server' || scoped.scope === 'rule'
          })
          .map(entryForId)
          .filter((entry): entry is TranslationEntry => entry !== undefined)
        break
      default:
        list = messageEntries()
    }
    const needle = search.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (entry) =>
        entry.source.toLowerCase().includes(needle) ||
        entry.key.toLowerCase().includes(needle) ||
        currentTranslationOf(entry).toLowerCase().includes(needle),
    )
  }, [filter, search, translated, requests, presentIds])

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('Search source text or translation')}
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
      <EntryList
        entries={entries}
        translated={translated}
              onEdit={onEdit}
        empty={
          // An empty list here is confusing precisely when the page is COVERED
          // in marks: this tab holds code strings, and a model label is not one.
          // Say where they actually are rather than "nothing matches".
          entries.length === 0 && missingLabels > 0 && !search.trim() ? (
            <span className="flex flex-col items-start gap-2">
              <span>
                {t(
                  '{count, plural, one {# marked item on this page is a model label} other {# marked items on this page are model labels}}, not a code string.',
                  { count: missingLabels },
                )}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={onShowLabels}>
                {t('Model labels')}
              </Button>
            </span>
          ) : (
            t('Nothing matches this filter.')
          )
        }
      />
    </div>
  )
}
