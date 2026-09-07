import { Suspense, lazy } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canTranslate, useTranslateModeFlags } from '@/i18n'
import { TranslateModeBoundary } from '@/i18n/TranslateModeBoundary'

/**
 * Loaded only when somebody switches marking or translate mode on: the chunk
 * carries the whole `en-US.json` index and the editor, the panel and the
 * highlighter, none of which a user who is not translating ever needs.
 */
const TranslateMode = lazy(() => import('@/i18n/translateMode'))

/**
 * Mounts translate mode for a user who may use it, while a switch is on.
 *
 * Lives in `AppLayout`, so it exists on every signed-in page and on none of the
 * standalone ones — the marks and the Alt+click editor only make sense over the
 * app itself. The switches are in the account menu (`NavUser`); the gate is
 * the same one that shows them there. The boundary is what keeps a chunk that
 * fails to load (a stale tab after a deploy) from replacing the whole app with
 * the router's error page.
 */
export function TranslateModeHost() {
  const { marking, editing } = useTranslateModeFlags()
  const { rpcUserInfo } = useAuth()
  const permissions = (rpcUserInfo?.permissions as string[] | undefined) ?? []
  if (!canTranslate(permissions) || (!marking && !editing)) return null
  return (
    <TranslateModeBoundary>
      <Suspense fallback={null}>
        <TranslateMode marking={marking} editing={editing} />
      </Suspense>
    </TranslateModeBoundary>
  )
}
