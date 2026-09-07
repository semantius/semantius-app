import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useCreateRecord } from '@/hooks/useTableMutations'
import {
  SCOPE,
  TENANT_TABLE,
  TRANSLATION_CONFLICT_COLUMNS,
  WRITER_TARGET,
  addCatalogEntry,
  addMessageEntry,
  canWriteTenant,
  draftId,
  i18n,
  reactivateLocale,
  saveDraft,
  tenantTableAvailable,
  useT,
  type DraftRow,
  type TranslationRow,
  type WriterTarget,
} from '@/i18n'

/**
 * Where a translate-mode save goes.
 *
 * Exactly one writer, chosen by capability: the tenant's `ui_translations`
 * table when it exists AND the user holds `translations.edit`; a browser draft
 * otherwise. Decided per render from what the prefetch learned
 * (`tenantTableAvailable`) and from `rpcUserInfo.permissions`, so it needs no
 * probe and cannot be wrong for longer than one render. Cheap enough for the
 * panel, which only shows the answer, to call on its own.
 */
export function useWriterTarget(): WriterTarget {
  const { rpcUserInfo } = useAuth()
  const permissions = (rpcUserInfo?.permissions as string[] | undefined) ?? []
  return tenantTableAvailable() && canWriteTenant(permissions) ? WRITER_TARGET.tenant : WRITER_TARGET.draft
}

/**
 * The save itself, for the editor.
 *
 * A save also applies IMMEDIATELY: a message goes into Lingui through its
 * merging `load` (the one place the merging call is used — everything else
 * replaces), a label or runtime text into the catalog's live map. For a draft
 * the layers are then re-folded so the change is canonical; for a row, the
 * mutation's own invalidation refetches the tenant layer through the prefetch.
 *
 * CLEARING (an empty translation) means two different things. As a draft it
 * removes the draft, so the layer beneath shows through again — which is all a
 * draft can do; the editor offers it only while a draft exists. As a row it
 * writes `translation = ''`, which is how `import.mjs` clears one too and
 * turns the row back into a request; the live map drops the entry at once,
 * while a MESSAGE keeps rendering the old text until the prefetch's refetch
 * re-folds the layers, because Lingui's table can only be replaced.
 */
export function useTranslationWriter(language: string): {
  target: WriterTarget
  save(row: DraftRow): Promise<boolean>
} {
  const t = useT()
  const target = useWriterTarget()
  const create = useCreateRecord<TranslationRow>(TENANT_TABLE, { onConflict: TRANSLATION_CONFLICT_COLUMNS })
  const { mutateAsync } = create

  const save = useCallback(
    async (row: DraftRow): Promise<boolean> => {
      try {
        if (target === WRITER_TARGET.tenant) {
          await mutateAsync({ locale: language, ...row })
        } else {
          saveDraft(language, row)
        }
      } catch (err) {
        toast.error(t('The translation could not be saved'), {
          description: err instanceof Error ? err.message : undefined,
        })
        return false
      }

      const id = draftId(row)
      if (row.scope === SCOPE.message) {
        if (row.translation) i18n.load(language, { [id]: row.translation })
        addMessageEntry(id, row.translation)
      } else {
        addCatalogEntry(row.scope, row.key, row.translation)
      }
      // A draft is a layer: fold the layers again so the change is canonical
      // (and so a removed draft actually uncovers what it overrode). A row is
      // re-folded by the prefetch once the mutation's invalidation refetches
      // it — re-folding here would only re-read the STALE tenant layer.
      if (target === WRITER_TARGET.draft) await reactivateLocale()
      return true
    },
    [language, mutateAsync, t, target],
  )

  return { target, save }
}
