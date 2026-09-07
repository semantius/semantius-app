import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { useTable } from '@/hooks/useTable'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  LABEL_SCOPES,
  LABEL_VIEW,
  TENANT_TABLE,
  catalogSnapshot,
  currentLabels,
  diffLabelInventory,
  entryForId,
  inventoryEntry,
  labelEntry,
  scopedId,
  splitScopedId,
  subscribeToCatalog,
  tenantTableAvailable,
  translatedAtQuery,
  useT,
  type InventoryEntry,
  type LabelScope,
  type LabelView,
  type TranslationEntry,
  type TranslationScope,
} from '@/i18n'
import { EntryList } from './EntryList'

interface TranslatedAtRow {
  scope: TranslationScope
  key: string
  context: string
  updated_at: string
}

export interface LabelsTabProps {
  language: string
  /** Every id on the page right now — the "this page" view reads the label ids out of it. */
  presentIds: ReadonlySet<string>
  /** The whole model, once the panel has read `tables`, `fields` and `modules`. */
  inventory: readonly InventoryEntry[] | undefined
  inventoryLoading: boolean
  /** Whether this tab is showing — the "changed since" read waits for it. */
  active: boolean
  translated: ReadonlySet<string>
  onEdit(entry: TranslationEntry): void
}

const LABEL_SCOPE_SET = new Set<string>(LABEL_SCOPES)

function isLabelId(id: string): boolean {
  const scoped = splitScopedId(id)
  return scoped !== null && LABEL_SCOPE_SET.has(scoped.scope)
}

/** Sort by UTF-16 code unit — never `localeCompare`, which depends on the machine. */
function byCodeUnitDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0
}

/**
 * Model labels: what is on this page, or the whole model from the inventory,
 * with the filters a translator working through a model needs — missing only,
 * orphaned (a translation whose key the model no longer has), newest first and
 * changed since translated (the model's `updated_at` later than the row's).
 */
export function LabelsTab({
  language,
  presentIds,
  inventory,
  inventoryLoading,
  active,
  translated,
  onEdit,
}: LabelsTabProps) {
  const t = useT()
  const version = useSyncExternalStore(subscribeToCatalog, catalogSnapshot, catalogSnapshot)
  const [view, setView] = useState<LabelView>(LABEL_VIEW.page)
  const [missingOnly, setMissingOnly] = useState(true)
  const [orphanedOnly, setOrphanedOnly] = useState(false)
  const [changedSince, setChangedSince] = useState(false)
  const [newestFirst, setNewestFirst] = useState(false)
  const ids = { missing: useId(), orphaned: useId(), changed: useId(), newest: useId() }

  // Only the tenant knows WHEN a label was translated; a file and a draft carry
  // no timestamp, so "changed since translated" is empty there by construction.
  const translatedAt = useTable<TranslatedAtRow>(TENANT_TABLE, {
    query: translatedAtQuery(language),
    enabled: active && tenantTableAvailable(),
  })
  const translatedAtById = useMemo(() => {
    const out = new Map<string, string>()
    for (const row of translatedAt.data ?? []) {
      if (LABEL_SCOPE_SET.has(row.scope)) out.set(scopedId(row.scope as LabelScope, row.key), row.updated_at)
    }
    return out
  }, [translatedAt.data])

  const diff = useMemo(
    () => (inventory ? diffLabelInventory(inventory, currentLabels()) : undefined),
    // `version` stands in for the label map, which is what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inventory, version],
  )

  const entries = useMemo<TranslationEntry[]>(() => {
    if (view === LABEL_VIEW.page) {
      return [...presentIds]
        .filter(isLabelId)
        .map(entryForId)
        .filter((entry): entry is TranslationEntry => entry !== undefined)
        .filter((entry) => !missingOnly || !translated.has(entry.id))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    }
    if (!diff) return []
    if (orphanedOnly) {
      return diff.orphaned.map((orphan) => labelEntry(orphan.scope, orphan.key, orphan.translation))
    }
    let list: InventoryEntry[] = missingOnly ? diff.missing : [...diff.missing, ...diff.translated]
    if (changedSince) {
      list = list.filter((entry) => {
        const at = translatedAtById.get(scopedId(entry.scope, entry.key))
        return !at || (entry.updatedAt !== undefined && entry.updatedAt > at)
      })
    }
    if (newestFirst) {
      list = [...list].sort((a, b) => byCodeUnitDesc(a.updatedAt ?? '', b.updatedAt ?? ''))
    }
    return list.map(inventoryEntry)
  }, [view, presentIds, missingOnly, translated, diff, orphanedOnly, changedSince, translatedAtById, newestFirst])

  const whole = view === LABEL_VIEW.model

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('Which labels to show')} className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={whole ? 'outline' : 'default'}
          aria-pressed={!whole}
          onClick={() => setView(LABEL_VIEW.page)}
        >
          {t('This page')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={whole ? 'default' : 'outline'}
          aria-pressed={whole}
          onClick={() => setView(LABEL_VIEW.model)}
        >
          {t('Whole model')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <Checkbox id={ids.missing} checked={missingOnly} onCheckedChange={(checked) => setMissingOnly(Boolean(checked))} />
          <Label htmlFor={ids.missing}>{t('Missing only')}</Label>
        </span>
        {whole && (
          <>
            <span className="flex items-center gap-2">
              <Checkbox
                id={ids.orphaned}
                checked={orphanedOnly}
                onCheckedChange={(checked) => setOrphanedOnly(Boolean(checked))}
              />
              <Label htmlFor={ids.orphaned}>{t('Orphaned')}</Label>
            </span>
            <span className="flex items-center gap-2">
              <Checkbox
                id={ids.changed}
                checked={changedSince}
                onCheckedChange={(checked) => setChangedSince(Boolean(checked))}
              />
              <Label htmlFor={ids.changed}>{t('Changed since translated')}</Label>
            </span>
            <span className="flex items-center gap-2">
              <Checkbox id={ids.newest} checked={newestFirst} onCheckedChange={(checked) => setNewestFirst(Boolean(checked))} />
              <Label htmlFor={ids.newest}>{t('Newest first')}</Label>
            </span>
          </>
        )}
      </div>
      {whole && inventoryLoading && !inventory ? (
        <p className="px-2 py-4 text-muted-foreground">{t('Reading the model…')}</p>
      ) : (
        <EntryList
          entries={entries}
          translated={translated}
          onEdit={onEdit}
          empty={whole ? t('No model labels match these filters.') : t('No model labels on this page.')}
        />
      )}
    </div>
  )
}
