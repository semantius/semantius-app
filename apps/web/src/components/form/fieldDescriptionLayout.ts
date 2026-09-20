/**
 * Visual treatment for field help text: collapse into a label-adjacent popover
 * when the description would wrap under the control.
 *
 * Two triggers, matching the spec:
 * - more than six words, regardless of width
 * - the rendered one-line width of the description exceeds the field column
 *
 * The 40-character figure in the sample snippet is not a limit. Character
 * capacity follows the live column width (a span-2 field holds far less than a
 * span-8), so this module measures rather than counting glyphs.
 */

import { useLayoutEffect, useState, type RefObject } from 'react'

export const LONG_DESCRIPTION_WORD_LIMIT = 6

/** Same type size FormDescription paints, so the probe matches the inline line. */
export const FIELD_DESCRIPTION_CLASS = 'text-[0.8rem] text-muted-foreground'

export function exceedsWordLimit(description?: string): boolean {
  if (!description) return false
  return description.trim().split(/\s+/).filter(Boolean).length > LONG_DESCRIPTION_WORD_LIMIT
}

/**
 * The grid cell (`span-2` / `span-4` / `span-8`) when SchemaForm rendered this
 * field; otherwise the `pt-2` control wrapper. Walking to that ancestor keeps
 * FormLabel and FormDescription (which may sit in a nested flex) agreeing on
 * the same width.
 */
export function fieldColumnElement(el: HTMLElement): HTMLElement {
  return (
    el.closest('[class*="span-"]') ??
    el.closest('.pt-2') ??
    el.parentElement ??
    el
  )
}

export function descriptionOverflowsField(text: string, field: HTMLElement): boolean {
  const width = field.clientWidth
  if (width <= 0) return false
  const probe = document.createElement('span')
  probe.className = FIELD_DESCRIPTION_CLASS
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;white-space:nowrap;left:0;top:0'
  probe.textContent = text
  field.appendChild(probe)
  const overflows = probe.offsetWidth > width
  probe.remove()
  return overflows
}

/**
 * True when the description should use the popover, not the inline block.
 * Word-count is available on the first render; width is measured in
 * `useLayoutEffect` against `hostRef` so it is decided before paint.
 */
export function useCollapsesFieldDescription(
  description: string | undefined,
  hostRef: RefObject<HTMLElement | null>,
): boolean {
  const byWords = exceedsWordLimit(description)
  const [byWidth, setByWidth] = useState(false)

  useLayoutEffect(() => {
    if (!description || byWords) {
      setByWidth(false)
      return
    }
    const host = hostRef.current
    if (!host) return
    const column = fieldColumnElement(host)

    const update = () => {
      setByWidth(descriptionOverflowsField(description, column))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(column)
    return () => observer.disconnect()
  }, [description, byWords, hostRef])

  return byWords || byWidth
}
