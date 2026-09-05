import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { MAIN_CONTENT_ID } from './landmarks'

/**
 * 2.4.3 Focus Order + 4.1.3 Status Messages for client-side navigation.
 *
 * A full page load moves focus to the top of the new document and a screen
 * reader announces its title. A client-side route change does neither: the URL
 * and the DOM change while focus stays on the link that was just activated and
 * nothing is announced, so a screen-reader user has no way to know the page
 * changed — the app simply appears not to respond.
 *
 * This restores both halves:
 *   - focus moves to the `<main>` landmark (which carries `tabIndex={-1}` so it
 *     can receive programmatic focus without becoming a tab stop), so the next
 *     Tab continues from the top of the new page;
 *   - the new document title is written into a polite live region.
 *
 * Two deliberate choices:
 *
 * PATHNAME, NOT HREF. Search params change constantly here — pagination,
 * sorting, column filters, the `_pf`/`_pv` parent filter. Reacting to those
 * would yank focus out of the control the user just operated, on every
 * keystroke in a filter box. Only a pathname change is a "new page".
 *
 * ANNOUNCE ON IDLE. `document.title` is written by `<HeadContent>` from the
 * matched route's `head()`, and a route with a loader stays pending for a while
 * after the pathname flips. Announcing immediately would read out the *previous*
 * page's title. Waiting for the router to go idle is what makes the announcement
 * true.
 *
 * AND STAND DOWN FOR A MODAL. Opening a record is a pathname change that renders
 * a modal Sheet, so both things happen on the same navigation. Base UI marks
 * everything outside the popup's portal `aria-hidden` / `inert`, `#main-content`
 * included — focusing it would put focus in a subtree the user cannot perceive
 * (axe `aria-hidden-focus`), and the dialog's focus trap would immediately pull
 * it back anyway. The modal names and announces itself, so this steps aside
 * entirely rather than competing.
 *
 * The live region itself does NOT need relocating out of `#root` for this:
 * Base UI's `markOthers` (floating-ui-react/utils/markOthers) explicitly adds
 * every `[aria-live]` element in the body to its keep set, so this node is left
 * unhidden while its siblings are marked. Verified in @base-ui/react 1.7.0 — if
 * that ever changes, the region has to move to a `createPortal` on `document.body`
 * or announcements go silent behind every overlay.
 */
/**
 * True when `el` sits inside a subtree an overlay has taken out of the
 * accessibility tree. Tests the rendered state rather than tracking "is a modal
 * open" separately, so it stays correct for anything that marks the background
 * — Sheet, Dialog, AlertDialog, and any future one.
 */
function isHiddenFromAssistiveTech(el: Element): boolean {
  return el.closest('[inert], [aria-hidden="true"]') !== null
}

export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const status = useRouterState({ select: (s) => s.status })
  const [message, setMessage] = useState('')

  // Seeded with the pathname the app booted on: that arrival was a real document
  // load, which the browser already announced. Announcing it again would be a
  // duplicate, and stealing focus during boot would fight the loading overlay.
  const announcedFor = useRef(pathname)

  useEffect(() => {
    if (status !== 'idle') return
    if (announcedFor.current === pathname) return
    announcedFor.current = pathname

    // One macrotask later: <HeadContent> writes document.title from an effect,
    // and effects for this commit have all run by the time a timeout fires.
    const timer = window.setTimeout(() => {
      const main = document.getElementById(MAIN_CONTENT_ID)
      if (!main || isHiddenFromAssistiveTech(main)) return
      setMessage(document.title)
      // preventScroll: the router restores scroll position itself; focusing
      // would otherwise jump the viewport back to the top of a restored page.
      main.focus({ preventScroll: true })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [pathname, status])

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
