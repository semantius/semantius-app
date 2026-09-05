import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes')

/**
 * 2.4.2 Page Titled, enforced at the source rather than through 19 rendering
 * tests.
 *
 * `document.title` is only ever written by `<HeadContent>` from the matched
 * route's `head()`. A route that declares none inherits the root's fallback and
 * shows the bare product name — which is how every page in this app once shared
 * a single title, leaving a browser history and a row of tabs in which no two
 * entries could be told apart. That failure is invisible in the UI, so nothing
 * but a check like this catches a new route missing one.
 *
 * Pattern copied from appLoaderInvariant.test.ts, deliberately: a new route file
 * is discovered automatically, so the check cannot go stale by omission.
 */

/**
 * The routes that legitimately declare no `head()`, each for a structural reason
 * rather than an oversight. Anything else added here needs the same kind of
 * reason written next to it.
 */
const EXEMPT: Record<string, string> = {
  // The fallback itself.
  '__root.tsx': 'defines the fallback title every other route overrides',
  // Layout routes render an <Outlet>; the child that actually fills the page
  // supplies the title. A head() here would be overridden by the child anyway.
  '_app.tsx': 'layout route — the authenticated shell, never a page on its own',
  '_app.$moduleId.tsx': 'layout route — renders <Outlet> only',
}

/**
 * `createLazyFileRoute` accepts no `head()`; the option lives on the eager
 * sibling that owns the route definition. So a `.lazy.tsx` is exempt only if
 * that sibling exists and declares one — otherwise the route really has no
 * title and this must fail.
 */
function lazySiblingOf(name: string): string {
  return name.replace(/\.lazy\.tsx$/, '.tsx')
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    if (!/\.(tsx|jsx)$/.test(name)) return []
    if (name.includes('.test.') || name.includes('.spec.')) return []
    return [full]
  })
}

const HEAD_DECLARATION = /\bhead\s*:\s*\(/

describe('route titles', () => {
  const files = routeFiles(ROUTES_DIR)

  it('finds route modules to check', () => {
    // Without this the it.each below is vacuously true on an empty list.
    expect(files.length).toBeGreaterThan(15)
  })

  it.each(files.map((f) => [relative(ROUTES_DIR, f).split('\\').join('/'), f]))(
    'routes/%s: declares a head() with a page title',
    (name, file) => {
      if (name in EXEMPT) return

      const src = readFileSync(file, 'utf8')

      if (name.endsWith('.lazy.tsx')) {
        const sibling = join(ROUTES_DIR, lazySiblingOf(name))
        expect(
          HEAD_DECLARATION.test(readFileSync(sibling, 'utf8')),
          `${name} is a lazy route, so its title must come from ${lazySiblingOf(name)}`,
        ).toBe(true)
        return
      }

      expect(HEAD_DECLARATION.test(src), `${name} has no head() — it would inherit the bare product name`).toBe(true)
      // A head() that does not go through pageTitle() would hard-code the
      // product-name suffix, which is exactly the drift pageTitle() exists to
      // prevent.
      expect(src, `${name} should build its title with pageTitle()`).toContain('pageTitle')
    },
  )

  it('keeps the exemption list small and reasoned', () => {
    // Every entry is a structural exemption, not a backlog. If this grows, the
    // check has stopped meaning anything.
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(3)
    for (const reason of Object.values(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(10)
    }
  })
})
