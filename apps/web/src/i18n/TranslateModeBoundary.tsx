import { Component, type ErrorInfo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { translate } from './index'
import { setMarkMissing, setTranslateMode } from './translateModeState'

/**
 * Keeps a failing translate-mode chunk from taking the app down.
 *
 * `React.lazy` hands a failed `import()` — a stale tab after a deploy, an
 * offline moment — to the nearest boundary, and without one that is the
 * router's `defaultErrorComponent`, which replaces the whole app with an error
 * page whose Try Again re-throws the cached rejection. Both switches also
 * persist per browser, so every reload would fail the same way.
 *
 * This boundary turns the switches OFF, says so once, and renders nothing:
 * the app underneath is untouched, and the next attempt is a deliberate one.
 * A class component, because there is no hook for catching a render error;
 * it uses `translate()` for the same reason the three class components in
 * `components/` do.
 */
export class TranslateModeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[i18n] translate mode failed to load', error, info.componentStack)
    setMarkMissing(false)
    setTranslateMode(false)
    toast.error(translate('Translate mode could not be loaded.'), {
      description: translate('Reload the page and switch it on again.'),
    })
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
