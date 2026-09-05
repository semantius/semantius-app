import Color from 'colorjs.io'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Reads the theme tokens straight out of the stylesheets and does WCAG contrast
 * math on them.
 *
 * Why parse the real stylesheet instead of hard-coding the values: a test that
 * carries its own copy of the palette passes forever after someone edits the
 * palette. The whole point is to fail when a token moves.
 *
 * THE GAMUT TRAP. 13 of the 68 `oklch()` declarations in the palette are outside
 * the sRGB gamut — `--primary`, `--destructive`, `--sidebar-primary` and the
 * chart ramp (both themes) among them. What a browser paints for those is the CSS
 * gamut-mapping result, NOT a naive per-channel clamp, and the two differ by
 * enough to move a ratio across the 3:1 / 4.5:1 line (measured: up to ~0.1).
 * Every color here therefore goes through `toGamut({ method: 'css' })` before any
 * arithmetic. Both counts are asserted in tokenContrast.test.ts, so a palette
 * edit updates this paragraph rather than quietly making it false.
 */

// Resolved from the working directory, not from `import.meta.url`: under Vitest
// the module URL is not a `file:` URL, so fileURLToPath() throws. Walking up
// keeps it working whether the suite is started in apps/web or at the repo root.
function findSrcFile(relative: string): string {
  let dir = process.cwd()
  for (let i = 0; i < 4; i++) {
    const candidate = resolve(dir, 'src', relative)
    if (existsSync(candidate)) return candidate
    const nested = resolve(dir, 'apps/web/src', relative)
    if (existsSync(nested)) return nested
    dir = resolve(dir, '..')
  }
  throw new Error(`could not locate src/${relative} from ${process.cwd()}`)
}

/**
 * THE PALETTE IS TWO FILES, and the order between them is load-bearing.
 *
 * `global.css` holds STOCK shadcn output — it is the `tailwind.css` target in
 * components.json, so `shadcn init` / a `--preset` apply rewrites its token
 * blocks. `theme-a11y.css` holds our accessibility corrections and is invisible
 * to the CLI; `main.tsx` imports it second, so it wins on source order.
 *
 * Everything below therefore reads the OVERLAY, not either file alone. Reading
 * global.css by itself would measure the stock palette and report the very
 * failures this work exists to fix.
 */
const CSS_PATH = findSrcFile('global.css')
const A11Y_CSS_PATH = findSrcFile('theme-a11y.css')
const MAIN_TSX_PATH = findSrcFile('main.tsx')

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

/**
 * Is the override file still actually loaded, and still loaded LAST?
 *
 * This is the single point of failure for the whole arrangement: drop the import
 * from main.tsx, or move it above `./global.css`, and every correction reverts to
 * shadcn's value in the browser while the contrast tests keep passing against the
 * files on disk. Asserted in tokenContrast.test.ts.
 */
export function overrideWiring(): { imported: boolean; afterGlobalCss: boolean } {
  // Comments are stripped first, and the match is anchored to a real import
  // STATEMENT. A plain indexOf on the specifier finds it inside the explanatory
  // comment that sits right above the import in main.tsx, so commenting the
  // import out — the most likely way to lose it — left this guard green. Caught
  // by mutating main.tsx and watching the test still pass.
  const main = read(MAIN_TSX_PATH)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
  const at = (specifier: string) =>
    main.match(new RegExp(`^[ \\t]*import\\s+'${specifier.replace('.', '\\.')}'`, 'm'))?.index ?? -1
  const globalAt = at('./global.css')
  const a11yAt = at('./theme-a11y.css')
  return { imported: a11yAt !== -1, afterGlobalCss: globalAt !== -1 && a11yAt > globalAt }
}

/**
 * `@theme inline` in global.css must keep mapping `--color-input-border`, or the
 * `border-input-border` utility used at ~8 call sites compiles to nothing. The
 * VALUE lives in theme-a11y.css; only the mapping has to stay in the entry that
 * imports 'tailwindcss', which is why this one line cannot move with it.
 */
export function themeMapsInputBorder(): boolean {
  return /--color-input-border:\s*var\(--input-border\)/.test(read(CSS_PATH))
}

/** Token names theme-a11y.css overrides or introduces, per theme. */
export function overriddenTokens(): Record<Theme, string[]> {
  const css = read(A11Y_CSS_PATH)
  return {
    light: Object.keys(parseBlock(css, ':root')).sort(),
    dark: Object.keys(parseBlock(css, '\\.dark')).sort(),
  }
}

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
    const base = read(CSS_PATH)
    const overrides = read(A11Y_CSS_PATH)
    // Source order: global.css, then theme-a11y.css. Within that, `.dark` layers
    // over `:root` the way the cascade does.
    const root = { ...parseBlock(base, ':root'), ...parseBlock(overrides, ':root') }
    const dark = { ...parseBlock(base, '\\.dark'), ...parseBlock(overrides, '\\.dark') }
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
  // The EFFECTIVE palette, not raw text. Now that the palette spans two files, a
  // token shadcn defines and theme-a11y.css overrides appears twice on disk but
  // is one declaration the browser resolves — and grepping both files would count
  // the stock value that is never painted. Counted per block (`:root` and `.dark`
  // separately, not merged into each other) so it matches what a reader sees.
  const base = read(CSS_PATH)
  const overrides = read(A11Y_CSS_PATH)
  let n = 0
  for (const selector of [':root', '\\.dark']) {
    const block = { ...parseBlock(base, selector), ...parseBlock(overrides, selector) }
    n += Object.values(block).filter((v) => v.startsWith('oklch')).length
  }
  return n
}

/** Every `oklch()` declaration in the file that sRGB cannot represent. */
export function outOfGamutTokens(): Array<{ theme: Theme; name: string; value: string }> {
  const found: Array<{ theme: Theme; name: string; value: string }> = []
  // The MERGED palette, not either file alone — an out-of-gamut stock value that
  // theme-a11y.css replaces is not something a browser ever paints.
  for (const theme of ['light', 'dark'] as const) {
    for (const [name, value] of Object.entries(themeTokens()[theme])) {
      if (!value.startsWith('oklch')) continue
      if (!new Color(value).to('srgb').inGamut('srgb')) {
        found.push({ theme, name, value })
      }
    }
  }
  return found
}
