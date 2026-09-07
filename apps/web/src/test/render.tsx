/**
 * `render()` wrapped in `<I18nProvider>` — the drop-in for a component that uses
 * `<Trans>`.
 *
 * `useT()` does NOT need this: it subscribes to the Lingui singleton through
 * `useSyncExternalStore`, so a component that only calls `t()` renders correctly
 * with no provider at all, and the ten tests that call RTL's `render()` bare keep
 * working. `<Trans>` is the exception — it reads the catalog off React context
 * and renders nothing without it.
 *
 * Re-exports the rest of Testing Library so a file swaps one import line:
 *
 *   import { render, screen } from '@/test/render'
 *
 * The locale itself is not set here. `setup.browser.ts` activates `en-US` before
 * the first test and resets to it afterwards, so a test that wants another
 * language activates it and lets the reset undo it.
 */
/*
 * A test helper is never mounted by the dev server, so Fast Refresh has no
 * opinion worth acting on here — and the `export *` below is what makes this a
 * one-line swap for '@testing-library/react' at a call site.
 */
/* eslint-disable react-refresh/only-export-components */
import type { ReactElement } from 'react'
import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@/i18n'

export * from '@testing-library/react'

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, {
    ...options,
    wrapper: ({ children }) => <I18nProvider i18n={i18n}>{children}</I18nProvider>,
  })
}
