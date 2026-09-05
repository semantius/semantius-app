/* eslint-disable */
// Helpers that run INSIDE the page, prepended to every probe in probes.mjs.
//
// This is a real .js file read with readFileSync rather than a template literal
// because the helpers are full of regexes and backslashes, and every layer they
// would otherwise pass through (a JS template literal, then a shell, then the
// CLI's own parser) is a chance to lose one silently. Keeping it as source means
// what you read here is exactly what the browser executes.

const __srgb = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const __lum = ([r, g, b]) => 0.2126 * __srgb(r) + 0.7152 * __srgb(g) + 0.0722 * __srgb(b)

const __ratio = (a, b) => {
  const la = __lum(a)
  const lb = __lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Chrome returns computed colors in the space they were AUTHORED in: this app's
// palette is oklch(), so getComputedStyle hands back `oklch(...)` and
// `oklab(... / 0.5)`, never `rgb()`. A parser that only understands rgba()
// returns null for every one of them, and downstream that reads as "this control
// has no border and no fill" — a confident false positive on the exact criterion
// being measured. Canvas parses the full CSS <color> grammar, so let it convert.
// Alpha is pulled out first and applied by hand, because getImageData round-trips
// a premultiplied buffer and loses precision at low alpha.
const __canvas = document.createElement('canvas')
__canvas.width = 1
__canvas.height = 1
const __ctx = __canvas.getContext('2d', { willReadFrequently: true })
const __SENTINEL = '#123456'

const __parse = (color) => {
  const raw = String(color == null ? '' : color).trim()
  if (!raw || raw === 'none' || raw === 'transparent') return { rgb: [0, 0, 0], a: 0 }

  let alpha = 1
  const slash = raw.match(/\/\s*([\d.]+%?)\s*\)/)
  if (slash) {
    alpha = slash[1].endsWith('%') ? parseFloat(slash[1]) / 100 : parseFloat(slash[1])
  } else {
    const legacy = raw.match(/rgba?\(([^)]+)\)/)
    if (legacy) {
      const parts = legacy[1].split(/[,\s]+/).filter(Boolean)
      if (parts.length > 3) alpha = parseFloat(parts[3])
    }
  }

  const opaque = raw.replace(/\/\s*[\d.]+%?\s*\)/, ')')
  __ctx.fillStyle = __SENTINEL
  __ctx.fillStyle = opaque
  // fillStyle silently keeps its previous value for a color it cannot parse.
  if (__ctx.fillStyle === __SENTINEL && opaque.toLowerCase() !== __SENTINEL) return null
  __ctx.clearRect(0, 0, 1, 1)
  __ctx.fillRect(0, 0, 1, 1)
  const d = __ctx.getImageData(0, 0, 1, 1).data
  return { rgb: [d[0], d[1], d[2]], a: Number.isFinite(alpha) ? alpha : 1 }
}

// Walk up until an opaque background is found; that is what the element is
// actually painted on. Measuring against a transparent parent is the single most
// common way a rendered-contrast check produces a fictional number.
const __effectiveBg = (el) => {
  let node = el
  let acc = null
  while (node) {
    const parsed = __parse(getComputedStyle(node).backgroundColor)
    if (parsed && parsed.a > 0) {
      acc =
        acc === null
          ? parsed
          : {
              rgb: acc.rgb.map((c, i) => c * acc.a + parsed.rgb[i] * parsed.a * (1 - acc.a)),
              a: acc.a + parsed.a * (1 - acc.a),
            }
      if (acc.a >= 0.999) return acc.rgb
    }
    node = node.parentElement
  }
  const body = __parse(getComputedStyle(document.body).backgroundColor)
  return acc ? acc.rgb : body ? body.rgb : [255, 255, 255]
}

/** Composite a possibly-translucent color over an opaque backdrop. */
const __flatten = (parsed, backdrop) => {
  if (!parsed) return backdrop
  if (parsed.a >= 0.999) return parsed.rgb
  return parsed.rgb.map((c, i) => c * parsed.a + backdrop[i] * (1 - parsed.a))
}

/**
 * Is this element inside a subtree that has been taken out of play?
 *
 * When a Sheet or Dialog opens, Base UI marks everything behind it `inert` /
 * `aria-hidden`, so the page underneath is unreachable — by keyboard, by pointer
 * and by assistive tech alike. A probe that walks the whole document anyway will
 * "focus" those elements, find the modal overlay painted on top of them, and
 * report every control on the page as obscured. That is a description of a modal
 * working correctly, not a finding.
 */
const __inertOrHidden = (el) => {
  let node = el
  while (node && node !== document.documentElement) {
    if (node.hasAttribute && (node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true')) {
      return true
    }
    node = node.parentElement
  }
  return false
}

const __visible = (el) => {
  const style = getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false
  if (__inertOrHidden(el)) return false
  // Base UI mounts a hidden native <input> beside Select/Checkbox triggers to
  // carry the form value. It has a box, so a size check alone lets it through,
  // and measuring it reports the real trigger's boundary as missing.
  if (style.clipPath !== 'none' || style.clip !== 'auto') return false
  const r = el.getBoundingClientRect()
  return r.width > 1 && r.height > 1
}

/** Short, stable-ish path for naming an element in a report. */
const __label = (el) => {
  const path = []
  let node = el
  for (let i = 0; node && i < 4; i++) {
    let part = node.tagName.toLowerCase()
    // NOT node.id: on a <form> containing a control named "id", the named-property
    // lookup wins and node.id is that ELEMENT, which stringifies to
    // "[object RadioNodeList]" in the report. The attribute is always the id.
    const idAttr = node.getAttribute ? node.getAttribute('id') : null
    if (idAttr) part += '#' + idAttr
    else if (node.getAttribute && node.getAttribute('data-slot')) {
      part += '[' + node.getAttribute('data-slot') + ']'
    }
    path.unshift(part)
    node = node.parentElement
  }
  return path.join(' > ')
}
