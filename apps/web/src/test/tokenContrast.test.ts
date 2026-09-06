import { describe, expect, it } from 'vitest'
import {
  baseSurfaces,
  contrast,
  fieldSurfaces,
  oklchDeclarationCount,
  outOfGamutTokens,
  over,
  overriddenTokens,
  overrideWiring,
  themeMapsInputBorder,
  token,
  type Theme,
} from './lib/cssTokens'

/**
 * Tier 1 — the palette's contrast math, computed from `src/global.css` itself.
 *
 * This is the only layer that can check a color pair the browser never happens
 * to render during an audit (a hover tint, a disabled state, a control on a
 * surface no current route puts it on) and the only one that fails at the moment
 * a token is edited rather than at the next deploy.
 *
 * It does NOT replace the rendered checks: a token can be conformant while a call
 * site puts the wrong two together. Both layers exist for that reason.
 */

const THEMES: Theme[] = ['light', 'dark']

/** WCAG minimums. 3:1 for UI components and graphics, 4.5:1 for body text. */
const NON_TEXT = 3
const TEXT = 4.5

function expectAtLeast(ratio: number, min: number, what: string) {
  expect(
    ratio,
    `${what} is ${ratio.toFixed(3)}:1, below the required ${min}:1`,
  ).toBeGreaterThanOrEqual(min)
}

/**
 * Everything below measures the palette as the browser resolves it: stock shadcn
 * from `global.css`, with `theme-a11y.css` layered over the top. That layering is
 * a JS import order, not something CSS enforces, so it is the one part of the
 * arrangement that can be lost silently — and losing it does not break a build,
 * it just puts a 2.59:1 focus ring back in production.
 *
 * These three tests are the tripwire. They assert the WIRING, not a color, and
 * they exist because the corrections used to live inside global.css's own `:root`
 * block, where the next `shadcn --preset` apply would have quietly reverted them.
 */
describe('palette override wiring', () => {
  it('main.tsx still imports theme-a11y.css, and still imports it last', () => {
    const wiring = overrideWiring()
    expect(
      wiring.imported,
      "main.tsx no longer imports './theme-a11y.css'. Every accessibility correction " +
        'to the palette is in that file; without the import the app ships stock shadcn ' +
        'contrast (focus ring 2.59:1, form controls with no boundary at all).',
    ).toBe(true)
    expect(
      wiring.afterGlobalCss,
      "'./theme-a11y.css' must be imported AFTER './global.css'. The overrides are " +
        'plain `:root` / `.dark` blocks at the same specificity as shadcn\'s, so source ' +
        'order is the only thing making them win.',
    ).toBe(true)
  })

  it('global.css still maps --color-input-border in @theme inline', () => {
    // The value lives in theme-a11y.css, but Tailwind only reads `@theme` from the
    // entry that imports 'tailwindcss'. Lose this mapping and `border-input-border`
    // — used at ~8 call sites — compiles to nothing, with no error anywhere.
    expect(
      themeMapsInputBorder(),
      'global.css lost `--color-input-border: var(--input-border)` from @theme inline; ' +
        'the border-input-border utility is now a silent no-op.',
    ).toBe(true)
  })

  it('overrides exactly the tokens it claims to, in both themes', () => {
    // Named rather than counted, so adding one is a deliberate edit here and
    // removing one cannot pass unnoticed.
    expect(overriddenTokens()).toEqual({
      light: [
        '--destructive',
        '--destructive-foreground',
        '--input-border',
        '--muted-foreground',
        '--ring',
        '--sidebar-primary',
        '--sidebar-ring',
        '--skeleton',
      ],
      dark: [
        '--destructive',
        '--destructive-foreground',
        '--input-border',
        '--muted-foreground',
        '--ring',
        '--sidebar-primary',
        '--sidebar-ring',
        '--skeleton',
      ],
    })
  })

  it('re-states every :root override in .dark, because source order cuts both ways', () => {
    // theme-a11y.css's :root block comes after global.css's .dark block, and both
    // match <html class="dark"> at (0,1,0). A token set in :root here and not in
    // .dark therefore replaces shadcn's DARK value with a light-mode color. That
    // shipped once: --muted-foreground was corrected in :root only, dark-mode
    // placeholders dropped to 2.72:1, and this suite passed them at 5.49:1
    // because its cascade model layered .dark over :root. The model is fixed
    // (themeTokens in lib/cssTokens.ts); this pins the file-shape rule so the
    // next :root-only correction fails here instead of in an audit.
    const { light, dark } = overriddenTokens()
    expect(light.filter((t) => !dark.includes(t)), 'set in :root but not in .dark').toEqual([])
  })
})

describe('gamut', () => {
  it('flags the tokens that sRGB cannot represent, so nobody re-derives them naively', () => {
    const outOfGamut = outOfGamutTokens()
    // A guard that this file's gamut mapping is doing real work. If this ever
    // hits zero, the naive and correct methods agree and the caveat can be
    // dropped.
    expect(outOfGamut.length).toBeGreaterThan(0)
    expect(outOfGamut.map((t) => t.name)).toContain('--destructive')
    expect(outOfGamut.map((t) => t.name)).toContain('--sidebar-primary')
  })

  it('keeps the counts quoted in prose true', () => {
    // Both numbers are stated in cssTokens.ts's header and in CONTEXT-MEMORY.md
    // under "Accessibility — the mechanisms". They had already drifted once (the
    // prose said 14 of 67), in the one place whose whole job is keeping palette
    // facts honest. Pin them so the next palette edit updates the prose instead
    // of quietly invalidating it.
    // 68, not the 69 quoted before the palette was split across two files: that
    // figure came from grepping `oklch(` in global.css, which also matched one
    // mention inside a comment. This counts resolved declarations.
    expect(
      oklchDeclarationCount(),
      'The oklch() declaration count changed — update it in cssTokens.ts and CONTEXT-MEMORY.md.',
    ).toBe(68)
    expect(
      outOfGamutTokens().length,
      'The out-of-gamut token count changed — update it in cssTokens.ts and CONTEXT-MEMORY.md.',
    ).toBe(13)
  })
})

describe.each(THEMES)('%s theme', (theme) => {
  const bases = baseSurfaces(theme)
  const fields = fieldSurfaces(theme)

  describe('1.4.11 focus indicator (--ring)', () => {
    // The indicator is the solid `focus-visible:border-ring`. The
    // `ring-3 ring-ring/30` halo around it is decoration: a 30%-opacity glow tops
    // out near 2.1:1 whatever --ring holds, and 1.4.11 asks for AN indicator at
    // 3:1, not for every layer to clear it alone.
    const ring = token(theme, '--ring')

    it.each(Object.keys(bases))('clears 3:1 against the %s behind the control', (name) => {
      expectAtLeast(contrast(ring, bases[name]), NON_TEXT, `--ring vs ${name}`)
    })

    it.each(Object.keys(fields))('clears 3:1 against the %s it encloses', (name) => {
      expectAtLeast(contrast(ring, fields[name]), NON_TEXT, `--ring vs ${name}`)
    })

    it('is distinguishable from the unfocused boundary, so focus reads as a change', () => {
      // Not a WCAG number — 2.4.7 only asks for a visible indicator. But if --ring
      // and --input-border land on the same value the border does not change at
      // all on focus, which is how you satisfy the contrast check and still ship
      // an invisible focus state.
      expectAtLeast(
        contrast(token(theme, '--ring'), token(theme, '--input-border')),
        1.5,
        '--ring vs --input-border',
      )
    })
  })

  describe('1.4.11 focus indicator inside the sidebar (--sidebar-ring)', () => {
    // A separate token because the sidebar is a different surface from the page,
    // and `ui/sidebar.tsx` wires its controls to `--sidebar-ring` rather than
    // `--ring`. It was moved in lockstep with --ring and had ZERO assertions —
    // exactly the shape of a token that drifts back to the shadcn default (2.59:1
    // light) without anything noticing.
    const sidebarRing = token(theme, '--sidebar-ring')
    const surfaces: Record<string, string> = {
      sidebar: token(theme, '--sidebar'),
      'sidebar-accent (hover/active menu item)': token(theme, '--sidebar-accent'),
    }

    it.each(Object.keys(surfaces))('clears 3:1 against the %s', (name) => {
      expectAtLeast(
        contrast(sidebarRing, over(surfaces[name], bases.page)),
        NON_TEXT,
        `--sidebar-ring vs ${name}`,
      )
    })

    it('is distinguishable from --sidebar-border, so focus reads as a change', () => {
      expectAtLeast(
        contrast(sidebarRing, over(token(theme, '--sidebar-border'), token(theme, '--sidebar'))),
        1.5,
        '--sidebar-ring vs --sidebar-border',
      )
    })
  })

  describe('1.4.11 form-control boundary (--input-border)', () => {
    // The registry primitives are `border border-transparent bg-input/50` (or /90):
    // the fill is the only affordance, and it is ~1.1:1 against the page. The
    // boundary has to clear 3:1 against BOTH the surface behind the control and
    // the fill inside it, or one of its two edges disappears.
    const border = token(theme, '--input-border')

    it.each(Object.keys(bases))('clears 3:1 against the %s behind the control', (name) => {
      expectAtLeast(contrast(border, bases[name]), NON_TEXT, `--input-border vs ${name}`)
    })

    it.each(Object.keys(fields))('clears 3:1 against the %s it encloses', (name) => {
      expectAtLeast(contrast(border, fields[name]), NON_TEXT, `--input-border vs ${name}`)
    })
  })

  describe('1.4.3 text', () => {
    // Pairs with live call sites. `over()` resolves the tint first: measuring
    // `text-destructive` against --card when the call site is
    // `bg-destructive/10` over that card answers a question nobody asked.
    const cases: Array<[string, string, string, number]> = [
      ['foreground on page', token(theme, '--foreground'), token(theme, '--background'), TEXT],
      ['card-foreground on card', token(theme, '--card-foreground'), token(theme, '--card'), TEXT],
      ['sidebar-foreground on sidebar', token(theme, '--sidebar-foreground'), token(theme, '--sidebar'), TEXT],
      ['primary-foreground on primary', token(theme, '--primary-foreground'), token(theme, '--primary'), TEXT],
      ['secondary-foreground on secondary', token(theme, '--secondary-foreground'), token(theme, '--secondary'), TEXT],
    ]

    it.each(cases)('%s', (what, fg, bg, min) => {
      expectAtLeast(contrast(fg, over(bg, bases.page)), min, what)
    })

    // `placeholder:text-muted-foreground` is on every text input in the app and
    // axe cannot see it — a pseudo-element has no node to inspect.
    it.each(Object.keys(bases))('placeholder text on a field over the %s', (name) => {
      const fill = over(token(theme, '--input'), bases[name], 0.5)
      expectAtLeast(
        contrast(token(theme, '--muted-foreground'), fill),
        TEXT,
        `placeholder on bg-input/50 over ${name}`,
      )
    })

    it('muted-foreground on a muted panel', () => {
      const muted = over(token(theme, '--muted'), bases.page)
      expectAtLeast(contrast(token(theme, '--muted-foreground'), muted), TEXT, 'muted-foreground on muted')
    })

    it.each(Object.keys(bases))('muted-foreground on the %s', (name) => {
      expectAtLeast(contrast(token(theme, '--muted-foreground'), bases[name]), TEXT, `muted-foreground on ${name}`)
    })

    // ui/badge.tsx, ui/button.tsx and ui/dropdown-menu.tsx all render
    // `text-destructive` on a `bg-destructive/10` rest state and a
    // `bg-destructive/20` hover/dark state.
    it.each(Object.keys(bases))('destructive text on its /10 tint over the %s', (name) => {
      const tint = over(token(theme, '--destructive'), bases[name], 0.1)
      expectAtLeast(contrast(token(theme, '--destructive'), tint), TEXT, `text-destructive on /10 over ${name}`)
    })

    it.each(Object.keys(bases))('destructive text on its /20 tint over the %s', (name) => {
      const tint = over(token(theme, '--destructive'), bases[name], 0.2)
      expectAtLeast(contrast(token(theme, '--destructive'), tint), TEXT, `text-destructive on /20 over ${name}`)
    })

    // ApiErrorDisplay's message and its Details button sit on the same
    // `bg-destructive/10` card in `text-foreground`. They were
    // `text-muted-foreground`, which a route audit caught on a view that
    // happened to render the card: muted on a red tint is below 4.5:1, and no
    // pair here had asked the question because no audited state showed it.
    it.each(Object.keys(bases))('foreground on the destructive /10 tint over the %s', (name) => {
      const tint = over(token(theme, '--destructive'), bases[name], 0.1)
      expectAtLeast(contrast(token(theme, '--foreground'), tint), TEXT, `text-foreground on /10 over ${name}`)
    })

    // Dark steps the button variant up a tint — `dark:bg-destructive/20` at
    // rest, `dark:hover:bg-destructive/30` on hover (ui/button.tsx). /30 is the
    // hardest self-tint to clear and was the last pair nothing asserted: 3.74:1
    // before --destructive was lifted to 0.804 in theme-a11y.css. No light call
    // site paints /30, so it is not asserted there.
    describe.runIf(theme === 'dark')('the dark-only /30 hover tint', () => {
      it.each(Object.keys(bases))('destructive text on its /30 tint over the %s', (name) => {
        const tint = over(token(theme, '--destructive'), bases[name], 0.3)
        expectAtLeast(contrast(token(theme, '--destructive'), tint), TEXT, `text-destructive on /30 over ${name}`)
      })
    })

    it('destructive-foreground is readable on destructive', () => {
      // These two were byte-identical in :root — a 1.00:1 pair sitting in the
      // palette waiting for the first call site to use it.
      expectAtLeast(
        contrast(token(theme, '--destructive-foreground'), token(theme, '--destructive')),
        TEXT,
        'destructive-foreground on destructive',
      )
    })

    it('sidebar-primary-foreground is readable on sidebar-primary', () => {
      // The module logo tile in components/layout/ModuleSwitcher.tsx. Note the
      // tile's background is overridden per module by authored `logo_color` data,
      // which no token check can reach — this covers the default only.
      expectAtLeast(
        contrast(token(theme, '--sidebar-primary-foreground'), token(theme, '--sidebar-primary')),
        TEXT,
        'sidebar-primary-foreground on sidebar-primary',
      )
    })
  })
})
