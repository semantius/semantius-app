import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The `no-scrollbar` patch, and the import it is careful NOT to remove.
 *
 * `shadcn/tailwind.css` ships an `@utility no-scrollbar` that sets
 * `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`. Upstream
 * puts that class on `CommandList`, `SidebarContent` and `Combobox` — lists that
 * still scroll, with no cue left that they do. A field picker clipped at
 * `max-h-72` simply looks like it ends. Reported upstream as shadcn-ui/ui#9527;
 * the PRs that would remove it (#9534, #9611) are open and unmerged.
 *
 * We remove the utility at source, via `patches/shadcn.patch`, because there is
 * no way to undo it from our own CSS without landing on a DIFFERENT non-default:
 * cancelling `::-webkit-scrollbar { display: none }` requires an author rule on
 * that pseudo-element, and in Blink and WebKit the presence of such a rule is
 * itself what switches an element from overlay scrollbars to custom ones. Nor
 * can the utility be redefined — Tailwind merges a second `@utility` of the same
 * name into the same rule rather than replacing it.
 *
 * What this test pins:
 *
 * 1. the patch is applied (a `pnpm install` that skipped it fails here, not in a
 *    preview three steps later);
 * 2. the file is still IMPORTED, and still carries the nine `@custom-variant`
 *    definitions that come with it. Deleting the import also kills `no-scrollbar`
 *    and is the obvious-looking fix, but those variants back ~99 call sites in
 *    `src/`, and `data-checked` compiles to a selector Tailwind's built-in
 *    variant does not match. Losing them would be silent.
 *
 * If shadcn merges the upstream fix, the patch stops applying loudly on install
 * and both the patch and this test can go.
 */

const require = createRequire(import.meta.url)

/** A CSS file's declarations, with comments removed. */
const declarationsOf = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Resolved through the package, so it is the copy the build actually compiles.
 *
 * Read WITHOUT comments throughout: the patch replaces the utility with a long
 * comment explaining itself, and that comment quotes the very declarations these
 * assertions look for. Matching against the raw file would fail on the
 * explanation rather than on a rule.
 */
const shadcnTailwindCss = declarationsOf(
  readFileSync(require.resolve('shadcn/tailwind.css'), 'utf8'),
)

const globalCss = declarationsOf(
  readFileSync(fileURLToPath(new URL('../global.css', import.meta.url)), 'utf8'),
)

/** Every variant the import is kept for. */
const CUSTOM_VARIANTS = [
  'data-open',
  'data-closed',
  'data-checked',
  'data-unchecked',
  'data-selected',
  'data-disabled',
  'data-active',
  'data-horizontal',
  'data-vertical',
]

describe('shadcn/tailwind.css', () => {
  it('defines no `no-scrollbar` utility — patches/shadcn.patch removes it', () => {
    expect(shadcnTailwindCss).not.toMatch(/@utility\s+no-scrollbar\b/)
  })

  it('leaves no rule that hides a scrollbar', () => {
    expect(shadcnTailwindCss).not.toMatch(/scrollbar-width:\s*none/)
    expect(shadcnTailwindCss).not.toMatch(/-webkit-scrollbar/)
  })

  it('is still imported by global.css', () => {
    expect(globalCss).toMatch(/@import\s+['"]shadcn\/tailwind\.css['"]\s*;/)
  })

  it.each(CUSTOM_VARIANTS)('still defines the `%s` variant', variant => {
    expect(shadcnTailwindCss).toMatch(
      new RegExp(`@custom-variant\\s+${variant}\\b`),
    )
  })
})
