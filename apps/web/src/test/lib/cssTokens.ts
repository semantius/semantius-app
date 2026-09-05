import Color from 'colorjs.io'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Reads the theme tokens straight out of `src/global.css` and does WCAG contrast
 * math on them.
 *
 * Why parse the real stylesheet instead of hard-coding the values: a test that
 * carries its own copy of the palette passes forever after someone edits the
 * palette. The whole point is to fail when a token moves.
 *
 * THE GAMUT TRAP. 13 of the 69 `oklch()` declarations in global.css are outside
 * the sRGB gamut — `--primary`, `--destructive`, `--sidebar-primary` and the
 * chart ramp (both themes) among them. Those two counts are asserted in
 * tokenContrast.test.ts, so a palette edit updates them here rather than
 * silently making this paragraph false. What a browser paints for those is the CSS gamut-mapping
 * result, NOT a naive per-channel clamp, and the two differ by enough to move a
 * ratio across the 3:1 / 4.5:1 line (measured: up to ~0.1). Every color here
 * therefore goes through `toGamut({ method: 'css' })` before any arithmetic.
 */

// Resolved from the working directory, not from `import.meta.url`: under Vitest
// the module URL is not a `file:` URL, so fileURLToPath() throws. Walking up
// keeps it working whether the suite is started in apps/web or at the repo root.
function findGlobalCss(): string {
  let dir = process.cwd()
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, 'src/global.css')
    if (existsSync(candidate)) return candidate
    const nested = resolve(dir, 'apps/web/src/global.css')
    if (existsSync(nested)) return nested
    dir = resolve(dir, '..')
  }
  throw new Error('could not locate src/global.css from ' + process.cwd())
}

const CSS_PATH = findGlobalCss()

export type Theme = 'light' | 'dark'

function parseBlock(css: string, selector: string): Record<string, string> {
  const match = css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'))
  if (!match) throw new Error(`global.css: no ${selector} block found`)
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const decl = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i)
    if (decl) out[decl[1]] = decl[2].trim()
  }
  return out
}

let cache: Record<Theme, Record<string, string>> | undefined

/** `:root` and `.dark`, with `.dark` layered over `:root` the way the cascade does. */
export function themeTokens(): Record<Theme, Record<string, string>> {
  if (!cache) {
    const css = readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n')
    const root = parseBlock(css, ':root')
    const dark = parseBlock(css, '\\.dark')
    cache = { light: root, dark: { ...root, ...dark } }
  }
  return cache
}

export function token(theme: Theme, name: string): string {
  const value = themeTokens()[theme][name]
  if (!value) throw new Error(`global.css: ${name} is not defined for ${theme}`)
  return value
}

/** Gamut-map into sRGB the way a browser does. See the note at the top. */
export function srgb(value: string | Color): Color {
  return new Color(value).to('srgb').toGamut({ method: 'css', space: 'srgb' })
}

/**
 * Composite `src` over the opaque `dst`, applying `alpha` on top of any alpha the
 * source already carries. This is how a Tailwind `bg-x/50` actually resolves: the
 * painted color is the blend, and contrast has to be measured against the blend,
 * never against the token.
 */
export function over(src: string | Color, dst: string | Color, alpha = 1): Color {
  const s = srgb(src)
  const d = srgb(dst)
  const a = (s.alpha ?? 1) * alpha
  const [sr, sg, sb] = s.coords as [number, number, number]
  const [dr, dg, db] = d.coords as [number, number, number]
  return new Color('srgb', [
    sr * a + dr * (1 - a),
    sg * a + dg * (1 - a),
    sb * a + db * (1 - a),
  ])
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrast(a: string | Color, b: string | Color): number {
  return Math.abs(srgb(a).contrast(srgb(b), 'WCAG21'))
}

/** The opaque page-level surfaces a control can sit on. */
export function baseSurfaces(theme: Theme): Record<string, Color> {
  return {
    page: srgb(token(theme, '--background')),
    card: srgb(token(theme, '--card')),
    popover: srgb(token(theme, '--popover')),
    sidebar: srgb(token(theme, '--sidebar')),
  }
}

/**
 * Every filled form-control surface in the app, resolved against every base it
 * can appear on. `bg-input/50` is the text-field family (input, textarea, select
 * trigger, input group, number input, the inputSurfaceClassName triggers);
 * `bg-input/90` is checkbox, radio and switch.
 */
export function fieldSurfaces(theme: Theme): Record<string, Color> {
  const out: Record<string, Color> = {}
  for (const [name, base] of Object.entries(baseSurfaces(theme))) {
    out[`bg-input/50 on ${name}`] = over(token(theme, '--input'), base, 0.5)
    out[`bg-input/90 on ${name}`] = over(token(theme, '--input'), base, 0.9)
  }
  return out
}

/** How many `oklch()` declarations the stylesheet contains, in total. */
export function oklchDeclarationCount(): number {
  return [...readFileSync(CSS_PATH, 'utf8').matchAll(/oklch\(/g)].length
}

/** Every `oklch()` declaration in the file that sRGB cannot represent. */
export function outOfGamutTokens(): Array<{ theme: Theme; name: string; value: string }> {
  const found: Array<{ theme: Theme; name: string; value: string }> = []
  const css = readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n')
  for (const [theme, selector] of [
    ['light', ':root'],
    ['dark', '\\.dark'],
  ] as const) {
    for (const [name, value] of Object.entries(parseBlock(css, selector))) {
      if (!value.startsWith('oklch')) continue
      if (!new Color(value).to('srgb').inGamut('srgb')) {
        found.push({ theme, name, value })
      }
    }
  }
  return found
}
