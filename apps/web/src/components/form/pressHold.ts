import { useState, useSyncExternalStore } from 'react'

/**
 * Whether a pointer press is in progress anywhere in the document, and a hook
 * that holds a value steady while one is.
 *
 * WHY. Pressing Submit takes focus from the field being edited, and the field
 * validates on blur (`revalidateLogic({ mode: 'blur' })` in SchemaForm). The
 * error line that appears, or disappears, moves everything below it by about one
 * line, Submit included, and it does so between the press and the release. The
 * release then lands beside the button and the browser fires no click: the
 * press is lost. Holding the drawn error steady from press to release keeps the
 * button where the press found it; the validation itself is not delayed.
 *
 * The store is fed by capture-phase listeners on `document`, installed once, on
 * the first subscription:
 *   - `pointerdown` of the primary pointer (mouse button 0, or a touch or pen
 *     contact) starts a press and cancels a pending release;
 *   - `click` ends it on the next task, after the click's own handlers ran;
 *   - `pointerup` schedules a 500 ms fallback, for a release that produces no
 *     click (dragged off the button);
 *   - `pointercancel`, the window losing focus and the page being hidden end it
 *     at once.
 */

let pressing = false
let release: ReturnType<typeof setTimeout> | undefined
let installed = false
const listeners = new Set<() => void>()

function setPressing(next: boolean) {
  if (pressing === next) return
  pressing = next
  for (const listener of listeners) listener()
}

function cancelRelease() {
  if (release === undefined) return
  clearTimeout(release)
  release = undefined
}

function releaseAfter(ms: number) {
  cancelRelease()
  release = setTimeout(() => {
    release = undefined
    setPressing(false)
  }, ms)
}

function releaseNow() {
  cancelRelease()
  setPressing(false)
}

function install() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || event.button !== 0) return
      cancelRelease()
      setPressing(true)
    },
    true,
  )
  document.addEventListener('click', () => {
    if (pressing) releaseAfter(0)
  }, true)
  document.addEventListener('pointerup', () => {
    if (pressing) releaseAfter(500)
  }, true)
  document.addEventListener('pointercancel', releaseNow, true)
  document.addEventListener('visibilitychange', releaseNow)
  window.addEventListener('blur', releaseNow)
}

export function subscribe(listener: () => void): () => void {
  install()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isPressing(): boolean {
  return pressing
}

/**
 * `value` as it was when the current press began, while a press is in
 * progress; the current `value` otherwise.
 *
 * The steady copy follows `value` on every render outside a press (adjusting
 * state during render), so whatever a press-time render batches together, the
 * copy is the last value drawn before the press.
 */
export function useSteadyDuringPress<T>(value: T): T {
  const pressingNow = useSyncExternalStore(subscribe, isPressing, () => false)
  const [steady, setSteady] = useState(value)
  if (!pressingNow && !Object.is(steady, value)) setSteady(value)
  return pressingNow ? steady : value
}
