import { cdp } from 'vitest/browser'

/**
 * The accessible name Chrome itself computes for an element, read from the
 * browser's accessibility tree over the DevTools protocol — not re-derived in
 * JavaScript.
 *
 * Usable only in the `browser` Vitest project (see vite.config.ts).
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
  // The protocol addresses nodes by id, not by reference; a throwaway attribute
  // is the bridge from this element to a node it can resolve. The value is
  // unique per call because `cdp()` addresses the whole browser target and test
  // files run in sibling iframes of one page — two files probing at the same
  // moment would otherwise match each other's marker.
  const marker = 'data-chrome-accessible-name-probe'
  const token = `p${Math.random().toString(36).slice(2)}`
  element.setAttribute(marker, token)
  try {
    // No DOM.enable: DOM.getDocument primes the domain on its own, and enabling
    // it subscribes this session to every DOM mutation in the whole browser
    // target — every other test file's renders included.
    await session.send('Accessibility.enable')
    // DOM.performSearch searches every document of the target, iframes included,
    // and returns just the matches. The obvious alternative — DOM.getDocument
    // with `{ depth: -1, pierce: true }` and a hand-written walk — transfers the
    // ENTIRE tree of the orchestrator page, which holds one iframe per test file
    // currently running. That is what it did, and with the browser project grown
    // to ~47 files it started intermittently blowing the 20s test timeout.
    //
    // DOM.getDocument({ depth: 0 }) first is not optional: the DOM domain has no
    // document to search until the root has been requested at least once.
    await session.send('DOM.getDocument', { depth: 0 })
    const search = (await session.send('DOM.performSearch', {
      query: `[${marker}="${token}"]`,
    })) as { searchId: string; resultCount: number }

    try {
      if (search.resultCount === 0) {
        throw new Error('chromeAccessibleName: the element was not found in the DevTools DOM tree')
      }
      const { nodeIds } = (await session.send('DOM.getSearchResults', {
        searchId: search.searchId,
        fromIndex: 0,
        toIndex: search.resultCount,
      })) as { nodeIds: number[] }

      const { nodes } = (await session.send('Accessibility.getPartialAXTree', {
        nodeId: nodeIds[0],
        fetchRelatives: false,
      })) as { nodes: Array<{ name?: { value?: string } }> }
      return nodes[0]?.name?.value ?? ''
    } finally {
      await session.send('DOM.discardSearchResults', { searchId: search.searchId })
    }
  } finally {
    element.removeAttribute(marker)
  }
}
