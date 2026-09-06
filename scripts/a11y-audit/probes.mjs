import { readFileSync } from 'node:fs'

/**
 * Probe scripts, as source text to hand to `agent-browser eval --stdin`.
 *
 * Each is an IIFE returning `JSON.stringify(...)` — the CLI's eval returns the
 * expression value, and a string round-trips through it unharmed where a deep
 * object may not.
 *
 * These deliberately measure the RENDERED page. The token-level equivalents live
 * in `apps/web/src/test/tokenContrast.test.ts`; they catch a bad palette, but only
 * this layer catches a good palette put together wrongly at a call site.
 */

// Read from a real .js file rather than inlined as a template literal: the
// helpers are dense with regexes, and every escaping layer between here and
// the browser is a chance to lose a backslash silently.
const HELPERS = readFileSync(new URL('./page-helpers.js', import.meta.url), 'utf8')

/**
 * Admissibility gate. Nothing else in this file means anything unless this
 * passes: a page still under the boot overlay, or showing BootFailure, or that
 * threw during hydration, is not the page we set out to measure — and reporting
 * "0 violations" for it is how an audit produces a confident lie.
 *
 * The third state matters. A sample that fails this is `cantTell`, which maps to
 * "Not Evaluated" in the report, never to a pass.
 */
export const ADMISSIBILITY = `(() => {${HELPERS}
  const loader = document.getElementById('app-loader')
  // Every surface the app puts up INSTEAD of the page. Each of these renders a
  // small, perfectly accessible error card, so an audit that does not recognize
  // them reports "0 violations" for a route it never actually saw — the exact
  // failure mode the admissibility gate exists to prevent. A 404 from the user-
  // info RPC is transient and does this on any route.
  const blockingSurfaces = [
    'Application Failed to Start',
    'Configuration Error',
    // Both wordings of the same surface: 'from API' is the tenant's PostgREST
    // (its cold-start 404), 'from OAuth provider' is the identity provider's
    // userinfo endpoint (a 429 when a run loads pages faster than it allows).
    // A run that knew only the first counted nineteen 429 cards as pages.
    'Failed to fetch user information from API',
    'Failed to fetch user information from OAuth provider',
    'Oops! Something went wrong',
  ]
  const text = document.body.textContent || ''
  const bootFailure = blockingSurfaces.some((s) => text.includes(s))
  const root = document.getElementById('root')
  return JSON.stringify({
    url: location.href,
    title: document.title,
    loaderPresent: !!loader,
    loaderHidden: !loader || loader.hasAttribute('hidden'),
    bootFailure,
    bootFailureReason: blockingSurfaces.find((s) => text.includes(s)) || null,
    rootHasContent: !!root && root.children.length > 0,
    // The theme the page is actually in. Asserting this separately is the only
    // way to know a 'set media dark' took effect rather than silently no-opping.
    darkClass: document.documentElement.classList.contains('dark'),
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
  })
})()`

/**
 * axe-core, injected by --init-script. Tag set is WCAG 2.2 A + AA only:
 * best-practice rules are excluded on purpose, which is exactly why `<h1>` and
 * heading order are measured separately below — `page-has-heading-one` is
 * best-practice and would otherwise let a page with no heading structure pass.
 */
export const AXE = `
(async () => {
  if (typeof window.axe === 'undefined') {
    return JSON.stringify({ error: 'axe-core was not injected' })
  }
  const results = await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22a', 'wcag22aa'] },
    resultTypes: ['violations', 'incomplete'],
    // The drizzle-cube AnalyticsDashboard and the charts that only render inside
    // it are third-party and out of scope (see the plan's scope decision); the
    // claim this audit supports is scoped to what we own, and saying so in the
    // payload is how that stays honest rather than silently omitted.
    exclude: [['.dc-dashboard'], ['[data-dc-portlet]'], ['.react-grid-layout']],
  })
  const compact = (list) => list.map((v) => ({
    id: v.id,
    impact: v.impact,
    tags: v.tags.filter((t) => t.startsWith('wcag')),
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => ({
      target: n.target,
      summary: (n.failureSummary || '').split('\\n').slice(0, 3).join(' '),
    })),
    nodeCount: v.nodes.length,
  }))
  return JSON.stringify({
    violations: compact(results.violations),
    incomplete: compact(results.incomplete),
  })
})()`

/**
 * Page structure: title, headings, landmarks, skip link.
 *
 * 2.4.2 needs the title to be distinct across routes, which only the driver can
 * judge; this reports it and the driver checks set cardinality.
 */
export const STRUCTURE = `(() => {${HELPERS}
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .filter(__visible)
    .map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 120) }))
  const landmarks = Array.from(
    document.querySelectorAll('main,nav,header,footer,aside,[role=main],[role=navigation],[role=banner],[role=contentinfo],[role=complementary]')
  ).map((el) => ({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || null,
    label: el.getAttribute('aria-label') || null,
    labelledby: el.getAttribute('aria-labelledby') || null,
  }))
  // A skip link only counts if it is the first focusable thing and points at an
  // element that exists — axe's own bypass rule PASSES a page with no skip link
  // at all as long as it has a <main>, so it cannot be relied on for 2.4.1.
  const focusables = Array.from(
    document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.hasAttribute('disabled'))
  const first = focusables[0]
  const skipHref = first && first.tagName === 'A' ? first.getAttribute('href') : null
  // A modal changes what "the page" means: while a dialog is open, the accessible
  // page IS the dialog, and it is named by its own title rather than by an <h1>.
  // Reporting that state lets the driver judge the heading rules against the
  // right thing instead of failing a route for a heading the modal deliberately
  // hides.
  const modal = document.querySelector('[data-slot=sheet-content], [data-slot=dialog-content]')
  return JSON.stringify({
    title: document.title,
    lang: document.documentElement.lang || null,
    modalOpen: !!modal,
    modalName: modal
      ? (modal.getAttribute('aria-label')
          || (modal.getAttribute('aria-labelledby')
              && document.getElementById(modal.getAttribute('aria-labelledby'))?.textContent?.trim())
          || null)
      : null,
    h1Count: headings.filter((h) => h.level === 1).length,
    headings,
    landmarks,
    skipLink: skipHref && skipHref.startsWith('#')
      ? { href: skipHref, targetExists: !!document.querySelector(skipHref), text: first.textContent.trim() }
      : null,
    // Raw material for the four criteria no machine can pass/fail (see the plan's
    // residual-risk section): every alt string, every live region.
    images: Array.from(document.querySelectorAll('img')).map((img) => ({
      src: (img.currentSrc || img.src || '').split('/').pop(),
      alt: img.getAttribute('alt'),
      decorative: img.getAttribute('alt') === '' || img.getAttribute('role') === 'presentation',
    })),
    liveRegions: Array.from(document.querySelectorAll('[aria-live],[role=alert],[role=status]')).map((el) => ({
      role: el.getAttribute('role') || null,
      live: el.getAttribute('aria-live') || null,
      text: el.textContent.trim().slice(0, 160),
    })),
  })
})()`

/**
 * 1.4.10 Reflow at 320px.
 *
 * Measured on DESCENDANTS against the viewport, not on
 * `documentElement.scrollWidth`: AppLayout applies `overflow-x-hidden` twice, so
 * the document-level probe reports a clean page over content that is genuinely
 * cut off. An element wider than the viewport under a clipping ancestor is still
 * unreachable content.
 */
export const OVERFLOW = `(() => {${HELPERS}
  const vw = document.documentElement.clientWidth
  const offenders = []
  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (!__visible(el)) continue
    // Elements INSIDE an <svg> report bounding boxes from the SVG coordinate
    // system; the <svg> clips them, so they are never unreachable content. The
    // <svg> itself has ownerSVGElement === null and is still measured.
    if (el.ownerSVGElement) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    const overflowRight = Math.round(r.right - vw)
    const overflowLeft = Math.round(-r.left)
    if (overflowRight <= 1 && overflowLeft <= 1) continue
    // A container that scrolls its own overflow is a legitimate answer to a wide
    // table; the content is reachable. Only report what nothing can scroll to.
    let scrollable = false
    let node = el.parentElement
    while (node) {
      const ov = getComputedStyle(node).overflowX
      if (ov === 'auto' || ov === 'scroll') { scrollable = true; break }
      node = node.parentElement
    }
    if (scrollable) continue
    const key = __label(el)
    if (seen.has(key)) continue
    seen.add(key)
    offenders.push({
      element: key,
      width: Math.round(r.width),
      overflowRight: Math.max(0, overflowRight),
      overflowLeft: Math.max(0, overflowLeft),
      text: (el.textContent || '').trim().slice(0, 60),
    })
    if (offenders.length >= 20) break
  }
  return JSON.stringify({ viewportWidth: vw, documentScrollWidth: document.documentElement.scrollWidth, offenders })
})()`

/**
 * 1.4.3 for `::placeholder`, which axe cannot see — a pseudo-element has no node
 * to inspect, so every text input in the app is a blind spot for it.
 */
export const PLACEHOLDER_CONTRAST = `(() => {${HELPERS}
  const results = []
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (!__visible(el)) continue
    const color = __parse(getComputedStyle(el, '::placeholder').color)
    if (!color) continue
    const bg = __effectiveBg(el)
    const fg = color.a >= 0.999
      ? color.rgb
      : color.rgb.map((c, i) => c * color.a + bg[i] * (1 - color.a))
    results.push({
      element: __label(el),
      placeholder: el.getAttribute('placeholder'),
      ratio: Math.round(__ratio(fg, bg) * 100) / 100,
    })
  }
  return JSON.stringify({ results })
})()`

/**
 * 1.4.11 for the two things the token test can only predict: the boundary a
 * control actually paints, and the indicator it actually paints when focused.
 *
 * Focus is applied for real (`el.focus()`) rather than inferred from a class, so
 * `:focus-visible` resolves the way it does for a keyboard user.
 */
export const CONTROL_CONTRAST = `(() => {${HELPERS}
  const SLOTS = 'input,textarea,select,[data-slot=input],[data-slot=textarea],[data-slot=select-trigger],[data-slot=input-group],[data-slot=checkbox],[data-slot=radio-group-item],[data-slot=switch],[data-slot=combobox-trigger]'
  const boundary = []
  const indicator = []
  const controls = Array.from(document.querySelectorAll(SLOTS)).filter(__visible).slice(0, 30)
  for (const el of controls) {
    const style = getComputedStyle(el)
    const outside = __effectiveBg(el.parentElement || document.body)
    const fillParsed = __parse(style.backgroundColor)
    const fill = fillParsed && fillParsed.a > 0
      ? fillParsed.rgb.map((c, i) => c * fillParsed.a + outside[i] * (1 - fillParsed.a))
      : outside
    const borderParsed = __parse(style.borderTopColor)
    const hasBorder = parseFloat(style.borderTopWidth) > 0 && borderParsed && borderParsed.a > 0
    if (hasBorder) {
      const border = borderParsed.rgb.map((c, i) => c * borderParsed.a + outside[i] * (1 - borderParsed.a))
      boundary.push({
        element: __label(el),
        vsOutside: Math.round(__ratio(border, outside) * 100) / 100,
        vsFill: Math.round(__ratio(border, fill) * 100) / 100,
      })
    } else {
      // No border at all: the fill itself has to be the boundary.
      boundary.push({
        element: __label(el),
        borderless: true,
        vsOutside: Math.round(__ratio(fill, outside) * 100) / 100,
        vsFill: null,
      })
    }
  }
  const active = document.activeElement
  for (const el of controls.slice(0, 12)) {
    try { el.focus({ preventScroll: true }) } catch { continue }
    if (document.activeElement !== el) continue
    const style = getComputedStyle(el)
    const outside = __effectiveBg(el.parentElement || document.body)
    const borderParsed = __parse(style.borderTopColor)
    const outlineParsed = __parse(style.outlineColor)
    const outlineWidth = parseFloat(style.outlineWidth) || 0
    const ind = outlineWidth > 0 && style.outlineStyle !== 'none' && outlineParsed
      ? outlineParsed
      : borderParsed
    if (!ind || ind.a === 0) continue
    const painted = ind.rgb.map((c, i) => c * ind.a + outside[i] * (1 - ind.a))
    const fillParsed = __parse(style.backgroundColor)
    const fill = fillParsed && fillParsed.a > 0
      ? fillParsed.rgb.map((c, i) => c * fillParsed.a + outside[i] * (1 - fillParsed.a))
      : outside
    indicator.push({
      element: __label(el),
      source: outlineWidth > 0 && style.outlineStyle !== 'none' ? 'outline' : 'border',
      vsOutside: Math.round(__ratio(painted, outside) * 100) / 100,
      vsFill: Math.round(__ratio(painted, fill) * 100) / 100,
    })
  }
  try { if (active && active.focus) active.focus({ preventScroll: true }) } catch { /* ignore */ }
  return JSON.stringify({ controlsFound: controls.length, boundary, indicator })
})()`

/**
 * 2.4.11 Focus Not Obscured (Minimum).
 *
 * axe cannot see this, and it was written off as manual-only; a browser answers
 * it directly. Focus each control in turn, then sample points across its box and
 * ask what `elementFromPoint` returns. Level AA is "not ENTIRELY hidden", so the
 * failure condition is that NO sampled point still reaches the element — the
 * sticky table header, the sticky form footer or a pinned column has taken all
 * of it.
 */
export const FOCUS_OBSCURED = `(() => {${HELPERS}
  const focusables = Array.from(
    document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
  ).filter((el) => __visible(el) && !el.hasAttribute('disabled')).slice(0, 40)
  const obscured = []
  let checked = 0
  const previous = document.activeElement
  for (const el of focusables) {
    // Focus WITHOUT preventScroll and let the browser bring it into view, which
    // is what happens to a keyboard user. Measuring an off-screen element would
    // report whatever happens to be painted at those coordinates instead.
    // Re-checked here, not just when the list was built: opening or closing an
    // overlay flips inertness for a whole subtree, and this loop moves focus
    // around for long enough that the two can disagree.
    if (__inertOrHidden(el)) continue
    try { el.focus() } catch { continue }
    if (document.activeElement !== el) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue
    checked++
    // 2.4.11 at level AA is "not ENTIRELY hidden" — partial overlap is allowed
    // (that is 2.4.12, AAA). So sample a grid and ask whether ANY point still
    // reaches the element. Corner-only sampling reports rounded borders and
    // 1px overlaps as failures, which is noise, not a finding.
    const xs = [0.15, 0.5, 0.85].map((f) => r.left + r.width * f)
    const ys = [0.15, 0.5, 0.85].map((f) => r.top + r.height * f)
    let reachable = false
    const blockers = new Set()
    for (const x of xs) {
      for (const y of ys) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (!hit) continue
        if (hit === el || el.contains(hit) || hit.contains(el)) { reachable = true; break }
        blockers.add(__label(hit))
      }
      if (reachable) break
    }
    if (!reachable) {
      obscured.push({
        element: __label(el),
        text: (el.textContent || '').trim().slice(0, 50),
        blockers: [...blockers].slice(0, 3),
      })
    }
  }
  try { if (previous && previous.focus) previous.focus() } catch { /* ignore */ }
  return JSON.stringify({ checked, obscured })
})()`

/**
 * 2.4.3 raw material: the tab order as the browser will actually walk it.
 * There is no machine pass condition for "is this order meaningful", so this is
 * emitted as evidence for review and reported as Not Evaluated — never as a pass.
 */
export const TAB_ORDER = `(() => {${HELPERS}
  const order = Array.from(
    document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')
  )
    .filter((el) => __visible(el) && !el.hasAttribute('disabled'))
    .slice(0, 60)
    .map((el, i) => ({
      index: i,
      element: __label(el),
      name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().slice(0, 60),
      tabindex: el.getAttribute('tabindex'),
    }))
  return JSON.stringify({ order })
})()`
