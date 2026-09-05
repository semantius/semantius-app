import { describe, expect, it } from 'vitest'
import {
  baseSurfaces,
  contrast,
  fieldSurfaces,
  oklchDeclarationCount,
  outOfGamutTokens,
  over,
  token,
  type Theme,
} from './lib/cssTokens'

/**
 * Tier 1 — the palette's contrast math, computed from `src/global.css` itself.
 *
 * This is the only layer that can check a color pair the browser never happens
 * to render during a sweep (a hover tint, a disabled state, a control on a
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
    // prose said 14 of 67 while the file held 13 of 69), in the one place whose
    // whole job is keeping palette facts honest. Pin them so the next palette
    // edit updates the prose instead of quietly invalidating it.
    expect(
      oklchDeclarationCount(),
      'The oklch() declaration count changed — update it in cssTokens.ts and CONTEXT-MEMORY.md.',
    ).toBe(69)
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
