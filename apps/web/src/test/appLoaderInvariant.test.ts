import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
/**
 * The `var plain = [...]` list from index.html's inline script. Either quote
 * style is accepted: nothing in the repo pins index.html's quote style (ESLint
 * does not read .html, and there is no formatter config), and an editor's
 * formatter once rewrote the list to double quotes, which a single-quote
 * pattern read as an EMPTY list — failing the tests below instead of checking.
 */
function plainRoutesFromIndexHtml(): string[] {
  const html = readFileSync(join(ROUTES_DIR, '..', '..', 'index.html'), 'utf8')
  const list = html.match(/var plain = \[([^\]]*)\]/s)?.[1] ?? ''
  return [...list.matchAll(/(['"])([^'"]+)\1/g)].map((m) => m[2])
}

describe('boot overlay variant', () => {
  const plain = plainRoutesFromIndexHtml()

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

/**
 * The plain-variant routes are standalone pages: no `_app` layout, no
 * ProtectedRoute, nothing downstream that will take the overlay down for them.
 * Each has to do it itself — in its own module, in the page component it
 * renders (/logout-success delegates to LogoutConfirmationPage), or by handing
 * off to another plain route that does (/logout shows "Logging out..." for a
 * tick and then navigates to /logout-success, or leaves for the provider).
 * /form-playground did none of these and sat behind the spinner on every
 * visit; the `return null` scan above could not see it, because the route
 * renders content.
 */
describe('standalone routes take the overlay down themselves', () => {
  const SRC_DIR = join(ROUTES_DIR, '..')
  const plain = plainRoutesFromIndexHtml()
  const routeFileFor = (path: string) => join(ROUTES_DIR, `${path.slice(1)}.tsx`)

  /** Source of the modules a route imports from src/components, one level deep. */
  function importedComponentSources(routeFile: string): string[] {
    const src = readFileSync(routeFile, 'utf8')
    const out: string[] = []
    for (const [, spec] of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      let base: string | null = null
      if (spec.startsWith('@/')) base = join(SRC_DIR, spec.slice(2))
      else if (spec.startsWith('.')) base = join(dirname(routeFile), spec)
      if (!base || !/components[\\/]/.test(base)) continue
      const file = ['.tsx', '.ts', '/index.tsx'].map((ext) => base + ext).find((f) => existsSync(f))
      if (file) out.push(readFileSync(file, 'utf8'))
    }
    return out
  }

  /**
   * Everything that can take the overlay down for a route: its own source, the
   * page components it imports, and — one hop only — the same for any other
   * plain route it names as a string literal (a `navigate({ to: '/x' })`).
   */
  function overlaySources(path: string): string[] {
    const routeFile = routeFileFor(path)
    const src = readFileSync(routeFile, 'utf8')
    const handoffs = plain.filter((other) => other !== path && src.includes(`'${other}'`))
    return [
      src,
      ...importedComponentSources(routeFile),
      ...handoffs.flatMap((other) => [
        readFileSync(routeFileFor(other), 'utf8'),
        ...importedComponentSources(routeFileFor(other)),
      ]),
    ]
  }

  it('resolves page components and hand-offs, so the scan below is not vacuous', () => {
    expect(importedComponentSources(routeFileFor('/logout-success')).length).toBeGreaterThan(0)
    // /logout reaches LogoutConfirmationPage only through /logout-success.
    expect(overlaySources('/logout').length).toBeGreaterThan(1)
  })

  it.each(plain)('%s has a hideAppLoader() path in its route, its page component or its hand-off', (path) => {
    expect(existsSync(routeFileFor(path)), `no route module for ${path}`).toBe(true)
    expect(
      overlaySources(path).some((s) => s.includes('hideAppLoader')),
      `${path} renders a standalone page but nothing on its path calls hideAppLoader()`,
    ).toBe(true)
  })
})
