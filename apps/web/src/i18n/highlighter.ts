/**
 * Marking untranslated text on the page, and finding what was clicked.
 *
 * NO DOM MUTATION OF THE TEXT. The marks are CSS Custom Highlights — ranges
 * registered with `CSS.highlights` and painted by `::highlight()` — so the text
 * nodes, the accessible names and every existing test see exactly the DOM they
 * saw before. Where the API is missing (older Safari, Firefox before 140) the
 * fallback is an attribute on the PARENT element, styled with a box-shadow so
 * it never fights a focus outline. Attribute hosts (`aria-label`,
 * `placeholder`, `title`, `alt`) have no text node to range over and get that
 * same attribute in every browser.
 *
 * Everything is resolved through the reverse index: a text node's data or an
 * attribute's value is looked up as rendered, and the ids that produced it say
 * whether any of them is untranslated. Pure DOM, no React, so it can run from
 * a MutationObserver callback and be tested against a real document.
 */

import { embeddedSegments, resolveRenderedText } from './reverseIndex'

/** The `::highlight()` name. */
export const HIGHLIGHT_NAME = 'semantius-i18n-missing'

/** Set on an attribute host, or on a text node's parent where highlights are unsupported. */
export const MISSING_ATTRIBUTE = 'data-i18n-missing'

/**
 * Marks translate mode's OWN surfaces — the editor, the panel, the floating
 * button — so the scan skips them: their strings are catalog messages like any
 * other, but a translator is not translating the translator.
 */
export const UI_ATTRIBUTE = 'data-i18n-ui'

/** The attributes whose values our own functions produce. */
export const SCANNED_ATTRIBUTES: readonly string[] = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt']

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg', 'SVG'])

type HighlightRegistryLike = {
  set(name: string, highlight: unknown): unknown
  delete(name: string): boolean
  get(name: string): unknown
}
type HighlightConstructor = new (...ranges: Range[]) => Iterable<Range>

function registry(): HighlightRegistryLike | undefined {
  return (globalThis.CSS as unknown as { highlights?: HighlightRegistryLike } | undefined)?.highlights
}

function highlightConstructor(): HighlightConstructor | undefined {
  return (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight
}

/** Whether this browser paints CSS Custom Highlights. */
export function supportsHighlightApi(): boolean {
  return registry() !== undefined && highlightConstructor() !== undefined
}

export interface ScanOptions {
  root: Node & ParentNode
  /** Paint marks; off means only `present` is computed (the source language). */
  mark: boolean
  isMissing(id: string): boolean
}

export interface ScanResult {
  /** Every id whose rendered text is on the page right now. */
  present: Set<string>
  /** How many text runs and attribute hosts were marked. */
  marked: number
}

/**
 * Walk `root`, collect what is on screen, and (re)paint the marks.
 *
 * Idempotent and complete on every call: the previous marks are replaced, not
 * added to, so a scan after a save clears the mark the save resolved.
 */
export function scanAndMark({ root, mark, isMissing }: ScanOptions): ScanResult {
  const present = new Set<string>()
  const ranges: Range[] = []
  const hosts = new Set<Element>()
  const useHighlights = mark && supportsHighlightApi()

  const missingAmong = (ids: ReadonlySet<string>): boolean => {
    let any = false
    for (const id of ids) {
      present.add(id)
      if (isMissing(id)) any = true
    }
    return any
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        if (SKIPPED_TAGS.has(element.tagName) || element.hasAttribute(UI_ATTRIBUTE)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
      return (node as Text).data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data
      const ids = resolveRenderedText(data)
      // An interpolated value that is itself translatable — the model label
      // inside "Add {label}". Counted as present whatever the sentence says.
      const segments = embeddedSegments(data)
      let missingSegments = false
      for (const segment of segments) {
        if (missingAmong(segment.ids)) missingSegments = true
      }
      if (!ids) continue
      const missingSentence = missingAmong(ids)
      if (!mark) continue
      if (missingSentence) {
        // The whole run: the sentence itself has no translation, so marking a
        // word inside it would understate the work.
        if (useHighlights) {
          const range = document.createRange()
          range.selectNodeContents(node)
          ranges.push(range)
        } else if (node.parentElement) {
          hosts.add(node.parentElement)
        }
      } else if (missingSegments) {
        // Only the embedded value: the sentence is German, the label is not.
        // A sub-range is exactly what CSS Custom Highlights are for.
        let marked = false
        if (useHighlights) {
          for (const segment of segments) {
            if (![...segment.ids].some(isMissing)) continue
            const at = data.indexOf(segment.value)
            if (at === -1) continue
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + segment.value.length)
            ranges.push(range)
            marked = true
          }
        }
        if (!marked && node.parentElement) hosts.add(node.parentElement)
      }
      continue
    }
    const element = node as Element
    for (const attribute of SCANNED_ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const ids = resolveRenderedText(value)
      // An attribute has no text node to range over, so an embedded value can
      // only mark the whole host — which is what it does.
      let missing = embeddedSegments(value).some((segment) => missingAmong(segment.ids))
      if (ids && missingAmong(ids)) missing = true
      if (missing && mark) hosts.add(element)
    }
  }

  for (const stale of Array.from(document.querySelectorAll(`[${MISSING_ATTRIBUTE}]`))) {
    if (!hosts.has(stale)) stale.removeAttribute(MISSING_ATTRIBUTE)
  }
  for (const host of hosts) {
    if (!host.hasAttribute(MISSING_ATTRIBUTE)) host.setAttribute(MISSING_ATTRIBUTE, '')
  }

  const highlights = registry()
  const Highlight = highlightConstructor()
  if (highlights && Highlight) {
    if (ranges.length > 0) highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges))
    else highlights.delete(HIGHLIGHT_NAME)
  }

  return { present, marked: ranges.length + hosts.size }
}

/** Remove every mark. Called when translate mode is switched off. */
export function clearMarks(): void {
  for (const host of Array.from(document.querySelectorAll(`[${MISSING_ATTRIBUTE}]`))) {
    host.removeAttribute(MISSING_ATTRIBUTE)
  }
  registry()?.delete(HIGHLIGHT_NAME)
}

/** The text of every highlighted range — what a test reads back. */
export function highlightedTexts(): string[] {
  const highlight = registry()?.get(HIGHLIGHT_NAME) as Iterable<Range> | undefined
  if (!highlight) return []
  return Array.from(highlight, (range) => range.toString())
}

export interface ClickTarget {
  ids: string[]
  /** The rendered text or attribute value that resolved. */
  text: string
  element: Element
}

type CaretDocument = Document & {
  caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?(x: number, y: number): Range | null
}

/**
 * The ids for a click inside `text`, embedded values FIRST when the click
 * landed on one.
 *
 * Both are offered, because a click on the word "Supplier" in "Supplier
 * hinzufügen" could mean either the model label or the sentence around it —
 * the editor shows the candidates and lets the translator pick. Ordering by
 * where the caret actually fell is what makes the common case one click.
 */
function idsForText(text: string, caretOffset?: number): string[] {
  const outer = resolveRenderedText(text)
  const inside: string[] = []
  const outside: string[] = []
  for (const segment of embeddedSegments(text)) {
    const at = text.indexOf(segment.value)
    const hit =
      at !== -1 && caretOffset !== undefined && caretOffset >= at && caretOffset <= at + segment.value.length
    for (const id of segment.ids) (hit ? inside : outside).push(id)
  }
  const ids = [...inside, ...(outer ? [...outer] : []), ...outside]
  // A click that resolved nothing at all is not a target.
  return ids.length > 0 ? [...new Set(ids)] : []
}

/**
 * What translation the pointer is on.
 *
 * The exact text node under the point first (`caretPositionFromPoint`, or
 * WebKit's `caretRangeFromPoint`) — a button's label sits beside its icon and
 * the target element's `textContent` would merge both — then the target's own
 * text nodes and scanned attributes, walking up a few ancestors for a click
 * that landed on padding or an icon.
 */
export function resolveClickTarget(event: MouseEvent): ClickTarget | null {
  const doc = document as CaretDocument
  let node: Node | null = null
  let offset: number | undefined
  if (doc.caretPositionFromPoint) {
    const caret = doc.caretPositionFromPoint(event.clientX, event.clientY)
    node = caret?.offsetNode ?? null
    offset = caret?.offset
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY)
    node = range?.startContainer ?? null
    offset = range?.startOffset
  }
  // Only a caret node INSIDE the click's target counts: a synthetic click with
  // no coordinates asks about (0,0), and the text node that happens to sit in
  // the page's corner is not what was clicked.
  const target = event.target instanceof Node ? event.target : null
  if (
    node?.nodeType === Node.TEXT_NODE &&
    node.parentElement &&
    target?.contains(node) &&
    !insideOwnUi(node.parentElement)
  ) {
    const text = (node as Text).data
    const ids = idsForText(text, offset)
    if (ids.length > 0) return { ids, text, element: node.parentElement }
  }

  let element = event.target instanceof Element ? event.target : null
  for (let depth = 0; element && depth < 4; depth++, element = element.parentElement) {
    if (insideOwnUi(element)) return null
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE) continue
      const text = (child as Text).data
      const ids = idsForText(text)
      if (ids.length > 0) return { ids, text, element }
    }
    for (const attribute of SCANNED_ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      const ids = idsForText(value)
      if (ids.length > 0) return { ids, text: value, element }
    }
  }
  return null
}

function insideOwnUi(element: Element): boolean {
  return element.closest(`[${UI_ATTRIBUTE}]`) !== null
}
