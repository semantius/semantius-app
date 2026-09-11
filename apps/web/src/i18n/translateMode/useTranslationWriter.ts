import { useCallback } from 'react'
import { toast } from 'sonner'
import { addMessageEntry, currentMessages, i18n, useT, writeTranslation } from '@/i18n'

/**
 * The one writer. There is no second one and no fallback.
 *
 * Every target speaks the same contract — one message,
 * `{ locale, key, translation }`, merged by the server into the per-language
 * record — and only the base and the mode differ (`src/i18n/translateTarget.ts`):
 * the dev server writing this repo's file, a stage host's copy, or the app's
 * own API. A deployment with nowhere to write does not offer translate mode at
 * all, which is why nothing here degrades to a browser draft or a file
 * download.
 *
 * A save also applies IMMEDIATELY: into the catalog's live map, then into
 * Lingui by REPLACING its table with that map — Lingui's table can only be
 * replaced, never have one key removed, so a cleared message has to go this
 * way round or the old value keeps rendering. Re-folding the layers instead
 * would read the stale record.
 */
export function useTranslationWriter(language: string): {
  save(key: string, translation: string): Promise<boolean>
} {
  const t = useT()

  const save = useCallback(
    async (key: string, translation: string): Promise<boolean> => {
      try {
        await writeTranslation({ locale: language, key, translation })
      } catch (err) {
        toast.error(t('The translation could not be saved'), {
          description: err instanceof Error ? err.message : undefined,
        })
        return false
      }
      addMessageEntry(key, translation)
      i18n.loadAndActivate({ locale: language, messages: { ...currentMessages() } })
      return true
    },
    [language, t],
  )

  return { save }
}
