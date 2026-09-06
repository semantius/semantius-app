import { useEffect } from 'react'

/**
 * `inert` on `#root` while a modal dialog is open.
 *
 * WHY BASE UI'S OWN HIDING IS NOT ENOUGH. A Base UI Dialog/Sheet (`modal`
 * defaults to true) traps Tab inside its popup — measured: Tab from the record
 * Sheet's last control wraps to its first — but what it hides from assistive
 * technology is marked ONCE, when the popup opens, by walking the document and
 * putting `aria-hidden` on everything outside the popup's ancestor path. Two
 * things fall through that:
 *
 *   - content rendered AFTER the popup opened is never marked. A record opened
 *     by deep link (`/nwind/orders/11077`) mounts its Sheet before the grid's
 *     rows and pagination arrive, so the whole grid behind it stays exposed to a
 *     screen reader's virtual cursor and to touch exploration;
 *   - every `[aria-live]` element is exempt, and so is its whole ancestor chain
 *     (floating-ui's `markOthers` keeps them so announcements still work). The
 *     pagination's "1-10 of 830 items" is a live region, and the dnd-kit
 *     announcers are two more, so the path down to them stays unhidden.
 *
 * Measured on a deployed preview: with the Sheet open by deep link, no element
 * of `#root` carried `aria-hidden`, and the pagination's page-number input took
 * focus from script. That was 42 of one audit run's 54 focus-not-obscured
 * findings — controls no Tab press reaches, but real for a screen reader.
 *
 * `inert` is the platform's answer: it removes the subtree from the
 * accessibility tree AND from focus and hit-testing, in one attribute, and it
 * does not trip axe's `aria-hidden-focus` the way marking a subtree full of
 * buttons `aria-hidden` does. Every Base UI popup is portaled to a sibling of
 * `#root`, so `#root` is exactly "the page behind", and the toaster is portaled
 * out of it too (main.tsx) so a toast raised while a dialog is open is still
 * announced. The route announcer stays inside — it already stands down behind
 * an overlay, and tests `[inert]` to know.
 *
 * DETECTION, NOT REGISTRATION. A MutationObserver watches for a `[role=dialog]`
 * or `[role=alertdialog]` outside `#root` carrying Base UI's `data-open`. That
 * covers the record Sheet, the modal-mode Dialog, the delete confirmation, the
 * command palette and the mobile sidebar Sheet without any of their call sites
 * knowing this file exists, and the CLI-owned `ui/sheet.tsx` / `ui/dialog.tsx`
 * stay untouched. `data-open` is removed at the start of the closing
 * transition, so `inert` comes off before Base UI returns focus to the opener
 * inside `#root`; e2e/modal-inert.spec.ts asserts that order holds.
 */
export function ModalInert() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    const apply = () => {
      const open = Array.from(
        document.querySelectorAll('[role="dialog"][data-open], [role="alertdialog"][data-open]'),
      ).some((popup) => !root.contains(popup))
      if (open) root.setAttribute('inert', '')
      else root.removeAttribute('inert')
    }

    const observer = new MutationObserver(apply)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-open'],
    })
    apply()

    return () => {
      observer.disconnect()
      root.removeAttribute('inert')
    }
  }, [])

  return null
}
