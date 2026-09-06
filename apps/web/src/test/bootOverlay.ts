/**
 * Put the REAL boot overlay on the test page.
 *
 * Vitest's tester page is an empty document, so a component that takes the
 * overlay down (`hideAppLoader()`, and every terminal state that must call it —
 * see the hang invariant in CONTEXT-MEMORY.md) has nothing to act on and nothing
 * to observe. The usual workarounds are both bad: build a lookalike element in
 * the test, which is a stand-in written by whoever needed the assertion to pass,
 * or point the browser project's `testerHtmlPath` at a copy of `index.html`,
 * which adds a THIRD copy of the markup to keep in sync and drops a full-screen
 * overlay on top of every other test in the project.
 *
 * This does neither: it fetches `index.html` — the real file, from the real dev
 * server — and lifts `#app-loader` and the `<style>` blocks out of it. There is
 * no copy to drift, because there is no copy. If the overlay's id, markup or
 * transition changes, the next run picks the change up; if the element is
 * removed altogether, this throws rather than quietly testing nothing.
 *
 * The styles matter as much as the element: `hideAppLoader()` sets the terminal
 * `hidden` attribute on `transitionend`, which only fires because index.html
 * declares `transition: opacity 180ms` on `#app-loader`.
 */

let markup: { overlay: string; styles: string } | null = null

async function loadMarkup(): Promise<{ overlay: string; styles: string }> {
  if (markup) return markup

  const res = await fetch('/index.html')
  if (!res.ok) throw new Error(`boot overlay fixture: GET /index.html answered ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')

  const overlay = doc.getElementById('app-loader')
  if (!overlay) {
    throw new Error(
      'boot overlay fixture: index.html has no #app-loader. Either the overlay was ' +
        'renamed (update hideAppLoader with it) or it is gone (and the hang invariant with it).',
    )
  }

  markup = {
    overlay: overlay.outerHTML,
    // Every style in the head, not just the overlay's block: they share the
    // --al-* tokens declared on :root there.
    styles: [...doc.head.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n'),
  }
  return markup
}

/** Mount it. Returns the element, already laid out, ready to be hidden. */
export async function installBootOverlay(): Promise<HTMLElement> {
  const { overlay, styles } = await loadMarkup()

  const style = document.createElement('style')
  style.dataset.bootOverlayFixture = ''
  style.textContent = styles
  document.head.append(style)

  const host = document.createElement('div')
  host.dataset.bootOverlayFixture = ''
  host.innerHTML = overlay
  document.body.append(host)

  const el = document.getElementById('app-loader')
  if (!el) throw new Error('boot overlay fixture: #app-loader did not mount')
  // Force a style flush, so the browser has a "from" opacity to transition FROM.
  // Without it the change coalesces into the first paint and `transitionend`
  // never fires — the overlay would then reach `hidden` only via the fallback
  // timer, and a test would be measuring the fallback while believing it was
  // measuring the transition.
  void el.offsetHeight
  return el
}

/** Take it back off, so it cannot cover the next test. */
export function removeBootOverlay(): void {
  document.querySelectorAll('[data-boot-overlay-fixture]').forEach((el) => el.remove())
}
