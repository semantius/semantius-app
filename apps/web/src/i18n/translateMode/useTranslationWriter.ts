import { useCallback } from 'react'
import { toast } from 'sonner'
import { useCreateRecord } from '@/hooks/useTableMutations'
import {
  SCOPE,
  TENANT_TABLE,
  TRANSLATION_CONFLICT_COLUMNS,
  addCatalogEntry,
  addMessageEntry,
  currentMessages,
  i18n,
  useT,
  type TranslationRow,
} from '@/i18n'
import { translateApiUrl } from '@/i18n/translateTarget'
import type { SaveRow } from '@/i18n/translationRow'
import { rowId } from '@/i18n/translationRow'

/**
 * The one writer. There is no second one and no fallback.
 *
 * Every environment speaks the same contract — an upsert on `ui_translations`
 * keyed by `(locale, scope, key, context)` — and only the BASE differs
 * (`src/i18n/translateTarget.ts`): the dev server writing this repo, a stage
 * host, or the tenant's own table. A deployment with nowhere to write does not
 * offer translate mode at all, which is why nothing here degrades to a browser
 * draft or a file download.
 *
 * A save also applies IMMEDIATELY: a message through Lingui's merging `load`
 * (the one place that call is used — everything else replaces), a label or
 * runtime text into the catalog's live map. The mutation's own invalidation
 * then refetches the layer, so what is on screen and what the endpoint holds
 * converge without a reload.
 */
export function useTranslationWriter(language: string): {
  save(row: SaveRow): Promise<boolean>
} {
  const t = useT()
  const create = useCreateRecord<TranslationRow>(TENANT_TABLE, {
    onConflict: TRANSLATION_CONFLICT_COLUMNS,
    baseUrl: translateApiUrl(),
  })
  const { mutateAsync } = create

  const save = useCallback(
    async (row: SaveRow): Promise<boolean> => {
      try {
        await mutateAsync({ locale: language, ...row })
      } catch (err) {
        toast.error(t('The translation could not be saved'), {
          description: err instanceof Error ? err.message : undefined,
        })
        return false
      }

      const id = rowId(row)
      if (row.scope === SCOPE.message) {
        // The catalog's own map first, then Lingui from it. Lingui's table can
        // only be REPLACED, never have one key removed — so a cleared message
        // has to go this way round or the old value keeps rendering. Re-folding
        // the layers instead would read the stale ones: the endpoint's refresh
        // is the mutation's invalidation, which has not landed yet.
        addMessageEntry(id, row.translation)
        i18n.loadAndActivate({ locale: language, messages: { ...currentMessages() } })
      } else {
        addCatalogEntry(row.scope, row.key, row.translation)
      }
      return true
    },
    [language, mutateAsync, t],
  )

  return { save }
}
