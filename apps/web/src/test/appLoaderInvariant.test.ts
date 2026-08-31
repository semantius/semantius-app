import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    if (!/\.(tsx|jsx)$/.test(name)) return []
    if (name.includes('.test.') || name === 'routeTree.gen.ts') return []
    return [full]
  })
}

/**
 * A component that renders `return null` shows the user nothing — which is only
 * correct while the index.html overlay is still up and something is still in
 * flight. If that state can also be reached as a TERMINAL state, the overlay
 * never comes down and the page hangs on the spinner forever. That was exactly
 * the /login bug.
 *
 * Discriminator is indentation: `return null` at two spaces is a statement in a
 * function body's top level (a component's render result); anything deeper is
 * nested in a callback, a hook, or a helper (e.g. the `useMemo` and the fetch
 * catch in `_app.$moduleId.$table_name.tsx`) and says nothing about rendering.
 * Crude, but it fails loudly rather than silently — if a legitimate route trips
 * it, it needs a hideAppLoader() path anyway, or an explicit comment here.
 */
const TERMINAL_RETURN_NULL = /^ {2}return null$/m

describe('app-loader invariant', () => {
  const files = routeFiles(ROUTES_DIR)

  it('finds route modules to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [relative(ROUTES_DIR, f), f]))(
    'routes/%s: a terminal `return null` is paired with a hideAppLoader() path',
    (_name, file) => {
      const src = readFileSync(file, 'utf8')
      if (!TERMINAL_RETURN_NULL.test(src)) return
      expect(src).toContain('hideAppLoader')
    },
  )
})

/**
 * The boot overlay has two variants, chosen in an inline script in index.html by
 * pathname. The test is what the overlay is about to BECOME — NOT whether the
 * route sits outside the `_app` layout.
 *
 * `/oauth2_callback` is the one that matters: it renders null and then navigates
 * into the app, holding the overlay across the whole tail of the boot (token
 * exchange, userinfo, route loader, get_schema). Listing it as "plain" made a
 * sign-in round trip go skeleton → provider → *spinner* → app, which is the
 * regression this pins. Same for `/login`, which leads to the provider.
 *
 * Only routes that terminate in their own standalone centered page belong here.
 */
describe('boot overlay variant', () => {
  const html = readFileSync(join(ROUTES_DIR, '..', '..', 'index.html'), 'utf8')
  const plain = [...(html.match(/var plain = \[([^\]]*)\]/s)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  )

  it('parses the plain-variant list out of index.html', () => {
    expect(plain.length).toBeGreaterThan(0)
  })

  it('keeps the shell skeleton on the routes that lead into the app', () => {
    expect(plain).not.toContain('/oauth2_callback')
    expect(plain).not.toContain('/login')
  })

  it('uses the plain spinner only for standalone centered pages', () => {
    expect(plain.sort()).toEqual(['/form-playground', '/logout', '/logout-success'])
  })
})
