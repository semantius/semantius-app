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
 * Where a translate-mode save goes, and the save itself.
 *
 * Exactly one writer, chosen by capability: the tenant's `ui_translations`
 * table when it exists AND the user holds `translations.edit`; a browser draft
 * otherwise. The choice is made per render from what the prefetch learned
 * (`tenantTableAvailable`) and from `rpcUserInfo.permissions`, so it needs no
 * probe and cannot be wrong for longer than one render.
 *
 * A save also applies IMMEDIATELY: a message goes into Lingui through its
 * merging `load` (the one place the merging call is used — everything else
 * replaces), a label or runtime text into the catalog's live map. For a draft
 * the layers are then re-folded so the change is canonical; for a row, the
 * mutation's own invalidation refetches the tenant layer through the prefetch.
 */
export function useTranslationWriter(language: string): {
  target: WriterTarget
  save(row: DraftRow): Promise<boolean>
} {
  const t = useT()
  const { rpcUserInfo } = useAuth()
  const permissions = (rpcUserInfo?.permissions as string[] | undefined) ?? []
  const target: WriterTarget =
    tenantTableAvailable() && canWriteTenant(permissions) ? WRITER_TARGET.tenant : WRITER_TARGET.draft
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
        if (row.translation) {
          i18n.load(language, { [id]: row.translation })
          addMessageEntry(id, row.translation)
        }
      } else {
        addCatalogEntry(row.scope, row.key, row.translation)
      }
      // A draft is a layer, so fold the layers again; a CLEARED message has to
      // go the same way, because Lingui's table can only be replaced, never
      // have one key removed.
      if (target === WRITER_TARGET.draft || !row.translation) await reactivateLocale()
      return true
    },
    [language, mutateAsync, t, target],
  )

  return { target, save }
}
