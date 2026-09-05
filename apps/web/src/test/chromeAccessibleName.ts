import { cdp } from 'vitest/browser'

/**
 * The accessible name Chrome itself computes for an element, read from the
 * browser's accessibility tree over the DevTools protocol — not re-derived in
 * JavaScript.
 *
 * Usable only in the `browser` Vitest project (see vite.config.ts); `cdp()`
 * has nothing to return in jsdom.
 *
 * WHY. Every JavaScript implementation of the accessible-name algorithm is an
 * approximation of what browsers do, and they disagree at the edges. The one
 * that matters here: dom-accessibility-api — what jest-dom's
 * `toHaveAccessibleName` and Testing Library's `getByRole({ name })` compute
 * with — adds the current node to its consulted set before walking
 * `aria-labelledby`, so an element that names ITSELF ("<label id> <own id>",
 * the pattern the enum and date-time triggers use to announce the field name
 * followed by the current value) loses its own half. Chrome keeps it. When the
 * two disagree, Chrome's answer is the one a screen reader announces, so that
 * is the one to assert.
 */
export async function chromeAccessibleName(element: Element): Promise<string> {
  const session = cdp()
  // The protocol addresses nodes by id, not by reference; a throwaway
  // attribute is the bridge from this element to a node it can resolve.
  const marker = 'data-chrome-accessible-name-probe'
  element.setAttribute(marker, '')
  try {
    await session.send('Accessibility.enable')
    // Vitest runs a test file inside an iframe of its orchestrator page, and
    // `DOM.querySelector` does not cross frame boundaries — it would search the
    // orchestrator and come back empty. Fetch the whole tree pierced through
    // frames instead and find the marker by hand.
    const { root } = (await session.send('DOM.getDocument', { depth: -1, pierce: true })) as {
      root: DomNode
    }
    const backendNodeId = findMarked(root, marker)
    if (backendNodeId === undefined) {
      throw new Error('chromeAccessibleName: the element was not found in the DevTools DOM tree')
    }
    const { nodes } = (await session.send('Accessibility.getPartialAXTree', {
      backendNodeId,
      fetchRelatives: false,
    })) as { nodes: Array<{ name?: { value?: string } }> }
    return nodes[0]?.name?.value ?? ''
  } finally {
    element.removeAttribute(marker)
  }
}

/** The subset of a DevTools `DOM.Node` this file walks. */
interface DomNode {
  backendNodeId: number
  /** Flat `[name, value, name, value, …]`, as the protocol sends it. */
  attributes?: string[]
  children?: DomNode[]
  shadowRoots?: DomNode[]
  contentDocument?: DomNode
}

function findMarked(node: DomNode, marker: string): number | undefined {
  const attrs = node.attributes ?? []
  for (let i = 0; i < attrs.length; i += 2) {
    if (attrs[i] === marker) return node.backendNodeId
  }
  const below = [...(node.children ?? []), ...(node.shadowRoots ?? [])]
  if (node.contentDocument) below.push(node.contentDocument)
  for (const child of below) {
    const found = findMarked(child, marker)
    if (found !== undefined) return found
  }
  return undefined
}
