/**
 * Hide the HTML boot overlay from index.html.
 *
 * The overlay paints an app-shell skeleton before any JS runs and nothing but
 * this function takes it down (see the hang invariant in CONTEXT-MEMORY.md), so
 * every terminal state — success, failure, waiting on a human — must call it.
 *
 * Non-blocking by construction: pointer-events are killed on the first frame so
 * the real UI underneath is interactive immediately, the opacity flip drives the
 * 180ms CSS crossfade, and `hidden` (the terminal state callers and tests rely
 * on) is only set once that transition ends. The timeout is the fallback for
 * environments where `transitionend` never fires — reduced-motion, a hidden tab,
 * jsdom.
 *
 * Idempotent: call sites include render-phase calls and StrictMode double
 * effects, so re-entry must not restart the fade or double-register listeners.
 */
export function hideAppLoader() {
  const el = document.getElementById('app-loader')
  if (!el || el.hidden || el.dataset.hiding !== undefined) return

  el.dataset.hiding = ''
  el.style.pointerEvents = 'none'
  el.style.opacity = '0'

  const finish = () => el.setAttribute('hidden', '')
  el.addEventListener('transitionend', finish, { once: true })
  window.setTimeout(finish, 300)
}
