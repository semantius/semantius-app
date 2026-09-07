import { Toaster } from '@/components/ui/sonner'
import { useT } from '@/i18n'

/**
 * The app's single `<Toaster>`, with sonner's own English strings translated.
 *
 * It is a component rather than props on the `<Toaster>` in `main.tsx` because
 * `main.tsx` renders once at boot: a `translate()` there would freeze these
 * names in whatever language the app started in, and a language switch (which
 * re-renders the tree, it does not reload) would never reach them. `useT()`
 * inside a component does.
 *
 * The two strings are all sonner exposes — the toast region's own accessible
 * name and the per-toast close button's. Everything else a toast says comes
 * from the call site that raised it.
 *
 * `closeButtonAriaLabel` sits inside `toastOptions`, and `ui/sonner.tsx` spreads
 * its props AFTER its own `toastOptions`, so passing this object REPLACES
 * theirs. `classNames.toast` is therefore restated here — keep it in step with
 * `ui/sonner.tsx`, which is CLI-owned and cannot be edited.
 */
export function AppToaster() {
  const t = useT()
  return (
    <Toaster
      position="top-right"
      containerAriaLabel={t('Notifications')}
      toastOptions={{
        closeButtonAriaLabel: t('Close toast'),
        classNames: { toast: 'cn-toast' },
      }}
    />
  )
}
