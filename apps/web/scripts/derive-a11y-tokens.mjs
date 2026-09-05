#!/usr/bin/env node
/**
 * Re-derive the contrast-critical palette tokens after a shadcn theme change.
 *
 * WHY THIS EXISTS. `apps/web/src/theme-a11y.css` corrects the shadcn palette so
 * form controls, focus indicators and secondary text clear WCAG AA. Every value
 * in it was derived against ONE theme's surfaces — base-rhea's. Apply a different
 * preset and those surfaces move, so the corrections are no longer guaranteed to
 * clear anything.
 *
 * `pnpm check` tells you that happened (tokenContrast.test.ts recomputes the
 * whole matrix and fails). This script tells you what to write instead: for each
 * token it walks lightness in 0.001 steps and reports the first value that clears
 * the criterion against EVERY surface the token is used on, in both directions.
 *
 *   pnpm --filter @semantius/frontend a11y:tokens          # report + suggestions
 *   pnpm --filter @semantius/frontend a11y:tokens -- --check   # exit 1 on failure
 *
 * It reads whatever the palette currently holds, so it is correct after a preset
 * apply without being edited. It does NOT write the file — the values want a
 * human look, and several carry a deliberate "close enough, do not churn the UI"
 * judgment that a script cannot make.
 */

import Color from 'colorjs.io'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Lives under apps/web/ rather than the repo-root scripts/ for one reason:
// colorjs.io is an apps/web dependency, and ESM resolves from the importing
// FILE, not the working directory. A copy at the root cannot import it.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GLOBAL_CSS = resolve(APP, 'src/global.css')
const A11Y_CSS = resolve(APP, 'src/theme-a11y.css')

const NON_TEXT = 3 // 1.4.11 — UI components and graphical objects
const TEXT = 4.5 // 1.4.3 — body text

for (const f of [GLOBAL_CSS, A11Y_CSS]) {
  if (!existsSync(f)) {
    console.error(`missing ${f}`)
    process.exit(2)
  }
}

// ---------------------------------------------------------------- parsing ---

function parseBlock(css, selector) {
  const m = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'))
  if (!m) throw new Error(`no ${selector} block`)
  const out = {}
  for (const line of m[1].split('\n')) {
    const d = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i)
    if (d) out[d[1]] = d[2].trim()
  }
  return out
}

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

/** The palette as the browser resolves it: stock, with theme-a11y.css over it. */
function palette() {
  const base = read(GLOBAL_CSS)
  const over = read(A11Y_CSS)
  const root = { ...parseBlock(base, ':root'), ...parseBlock(over, ':root') }
  const dark = { ...parseBlock(base, '\\.dark'), ...parseBlock(over, '\\.dark') }
  return { light: root, dark: { ...root, ...dark } }
}

// ------------------------------------------------------------------ color ---

// Gamut-map the way a browser does. 13 of the 68 declarations are outside sRGB,
// and a naive per-channel clamp differs by up to ~0.1 in ratio — enough to move
// a pair across the line this script is deciding.
const srgb = (v) => new Color(v).to('srgb').toGamut({ method: 'css', space: 'srgb' })
const contrast = (a, b) => Math.abs(srgb(a).contrast(srgb(b), 'WCAG21'))

/** Composite src over an opaque dst, honoring any alpha the source carries. */
function over(src, dst, alpha = 1) {
  const s = srgb(src)
  const d = srgb(dst)
  const a = (s.alpha ?? 1) * alpha
  return new Color(
    'srgb',
    s.coords.map((c, i) => c * a + d.coords[i] * (1 - a)),
  )
}

/** Same hue and chroma, lightness varied — the axis a token is actually tuned on. */
function atLightness(value, l) {
  const c = new Color(value).to('oklch')
  return new Color('oklch', [l, c.coords[1], c.coords[2]])
}

// ------------------------------------------------------------- the checks ---

/** Every surface a control can sit on. */
function bases(p) {
  return {
    page: p['--background'],
    card: p['--card'],
    popover: p['--popover'],
    sidebar: p['--sidebar'],
  }
}

/** Every filled form-control surface, on every base. bg-input/50 and /90. */
function fields(p) {
  const out = {}
  for (const [name, base] of Object.entries(bases(p))) {
    out[`bg-input/50 on ${name}`] = over(p['--input'], base, 0.5)
    out[`bg-input/90 on ${name}`] = over(p['--input'], base, 0.9)
  }
  return out
}

/**
 * Each contrast-critical token: what it must clear, and against what.
 * Adding a token here is how you extend the guarantee — keep it in step with
 * tokenContrast.test.ts, which asserts the same pairs.
 */
function requirements(p, theme) {
  const b = bases(p)
  const f = fields(p)
  const surfacesFor = (obj) => Object.entries(obj).map(([n, v]) => [n, v])

  // The tints `text-destructive` is actually painted on, per theme, from
  // ui/badge.tsx, ui/button.tsx and ui/dropdown-menu.tsx: /10 rest and /20
  // hover in light; in dark the button variant moves up a step
  // (`dark:bg-destructive/20`, `dark:hover:bg-destructive/30`) while badge and
  // menu items keep /10. Listing /30 for light too would over-constrain a
  // tint no light call site renders.
  const destructiveTints = theme === 'dark' ? [0.1, 0.2, 0.3] : [0.1, 0.2]

  return [
    {
      token: '--ring',
      min: NON_TEXT,
      why: 'focus indicator (1.4.11 + 2.4.7)',
      against: [...surfacesFor(b), ...surfacesFor(f)],
    },
    {
      token: '--input-border',
      min: NON_TEXT,
      why: 'form-control boundary (1.4.11)',
      against: [...surfacesFor(b), ...surfacesFor(f)],
    },
    {
      token: '--sidebar-ring',
      min: NON_TEXT,
      why: 'focus indicator inside the sidebar (1.4.11)',
      against: [
        ['sidebar', p['--sidebar']],
        ['sidebar-accent', over(p['--sidebar-accent'], p['--background'])],
      ],
    },
    {
      token: '--muted-foreground',
      min: TEXT,
      why: 'secondary text and every ::placeholder (1.4.3)',
      against: [
        ...surfacesFor(b),
        ['muted panel', over(p['--muted'], p['--background'])],
        ...Object.entries(f).filter(([n]) => n.startsWith('bg-input/50')),
      ],
    },
    {
      token: '--destructive',
      min: TEXT,
      why: `text-destructive on its own ${destructiveTints.map((a) => `/${a * 100}`).join(', ')} tints (1.4.3)`,
      // Self-tinted: moving the token away from the surface moves the text and
      // barely moves the tint, which is why this one converges at all.
      againstSelfTint: destructiveTints,
      against: [],
    },
    {
      token: '--sidebar-primary',
      min: NON_TEXT,
      why: 'module tile against the sidebar (1.4.11)',
      against: [['sidebar', p['--sidebar']]],
    },
  ]
}

/** Lowest ratio this candidate achieves across everything it must clear. */
function worst(candidate, req, p) {
  let low = Infinity
  let where = ''
  for (const [name, surface] of req.against) {
    const r = contrast(candidate, surface)
    if (r < low) [low, where] = [r, name]
  }
  for (const alpha of req.againstSelfTint ?? []) {
    for (const [name, base] of Object.entries(bases(p))) {
      const r = contrast(candidate, over(candidate, base, alpha))
      if (r < low) [low, where] = [r, `its own /${alpha * 100} tint over ${name}`]
    }
  }
  return { ratio: low, where }
}

/** Walk lightness for the first value clearing `min` everywhere. */
function solve(req, p, current) {
  const step = 0.001
  const darkFirst = worst(atLightness(current, 0.2), req, p).ratio >
    worst(atLightness(current, 0.9), req, p).ratio
  const candidates = []
  for (let l = 0; l <= 1.0001; l += step) candidates.push(Number(l.toFixed(3)))
  if (darkFirst) candidates.reverse()
  // Start from the current lightness and walk outward in the winning direction,
  // so the answer is the SMALLEST visual change that conforms.
  const currentL = new Color(current).to('oklch').coords[0]
  const ordered = candidates
    .filter((l) => (darkFirst ? l <= currentL : l >= currentL))
    .concat(candidates.filter((l) => (darkFirst ? l > currentL : l < currentL)))
  for (const l of ordered) {
    const cand = atLightness(current, l)
    if (worst(cand, req, p).ratio >= req.min) return cand
  }
  return null
}

// ------------------------------------------------------------------- main ---

const checkOnly = process.argv.includes('--check')
const p = palette()
let failures = 0

console.log('Contrast-critical tokens, measured against the CURRENT palette.')
console.log('Surfaces come from global.css; values from theme-a11y.css layered over it.\n')

for (const theme of ['light', 'dark']) {
  console.log(`\x1b[1m${theme} theme\x1b[0m`)
  const pal = p[theme]
  for (const req of requirements(pal, theme)) {
    const current = pal[req.token]
    if (!current) {
      console.log(`  ${req.token.padEnd(20)} NOT DEFINED`)
      failures++
      continue
    }
    const { ratio, where } = worst(current, req, pal)
    const ok = ratio >= req.min
    const mark = ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'
    console.log(
      `  ${mark} ${req.token.padEnd(20)} ${ratio.toFixed(2)}:1 (needs ${req.min}) — worst: ${where}`,
    )
    console.log(`       ${req.why}`)
    if (!ok) {
      failures++
      const fix = solve(req, pal, current)
      if (fix) {
        const l = fix.to('oklch').coords
        console.log(
          `       \x1b[33msuggested:\x1b[0m ${req.token}: oklch(${l[0].toFixed(3)} ${l[1].toFixed(3)} ${l[2].toFixed(3)});`,
        )
      } else {
        console.log(
          '       \x1b[33mno lightness on this hue clears it\x1b[0m — the surfaces themselves ' +
            'need to move, or the token needs a different hue/chroma.',
        )
      }
    }
  }
  console.log()
}

if (failures > 0) {
  console.log(
    `${failures} token(s) do not clear their criterion. Edit apps/web/src/theme-a11y.css, ` +
      'then re-run this and `pnpm --filter @semantius/frontend exec vitest run src/test/tokenContrast.test.ts`.',
  )
}
process.exit(checkOnly && failures > 0 ? 1 : 0)
