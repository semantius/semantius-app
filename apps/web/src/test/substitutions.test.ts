import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Tier 1 — an inventory of everything the suite replaces with something that is
 * not the real thing, counted, named and ratcheted.
 *
 * WHY THIS EXISTS. A test that mocks a module inside `src/` does not test that
 * module's behavior; it tests that the mock was written to match whatever the
 * test expected. Three files mock `@/hooks/useAuth`, which means authentication is
 * "tested" by replacing the authentication code with a stub. None of that shows
 * up as a failure — it shows up as a suite that stays green while the app breaks.
 *
 * The target is ZERO internal mocks, reached by moving those tests to a real
 * browser against real code (see e2e/login-journey.spec.ts for the shape). Until
 * then this is a ratchet: the existing set is frozen, and any NEW internal mock
 * fails. It cannot go up, only down — and lowering it means editing this file,
 * which puts the decision in a diff where someone can see it.
 */

/**
 * The scan root is the APP root, not `src/`. Vitest's include glob is rooted at
 * the project directory, so a test file dropped in `apps/web/test/` or beside a
 * config file runs exactly like one under `src/` — and a ratchet that only
 * descends `src/` is escaped by moving the file up one level.
 */
const APP_ROOT = resolve(process.cwd(), existsSync(resolve(process.cwd(), 'src')) ? '.' : 'apps/web')
const SRC = join(APP_ROOT, 'src')

/** Mirrors the `exclude` in vite.config.ts, plus build output. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'playwright-report', 'test-results'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Every form that installs a module mock, not just the one that was easiest to
 * write a regex for. `vi.doMock` is the lazy variant and `vi.mock(import('…'))`
 * is the type-safe variant; both are real, working Vitest APIs, and a ratchet
 * that matched only `vi.mock('…')` stayed green against both. `vi.mocked(` is
 * NOT matched — it casts an already-mocked value and installs nothing.
 */
const MOCK_CALL = /vi\.(?:mock|doMock)\(/g
const MOCK_WITH_SPECIFIER = /vi\.(?:mock|doMock)\(\s*(?:import\(\s*)?['"]([^'"]+)['"]/g

/** `vi.mock('<specifier>')` / `vi.doMock` / `vi.mock(import('<specifier>'))`. */
function mockedSpecifiers(source: string): string[] {
  return [...source.matchAll(MOCK_WITH_SPECIFIER)].map((m) => m[1])
}

/** How many mock calls exist at all, parseable or not. */
function mockCallCount(source: string): number {
  return [...source.matchAll(MOCK_CALL)].length
}

/** A specifier that resolves into this app's own source, as opposed to a package. */
function isInternal(specifier: string): boolean {
  return specifier.startsWith('@/') || specifier.startsWith('./') || specifier.startsWith('../')
}

/**
 * The frozen inventory: file -> the internal modules it replaces. 13 in total.
 *
 * Every entry here is a known gap, not an approved practice. The reason each one
 * exists is the same: the test renders a component in jsdom, where the real
 * dependency would need a router, a network and a session that jsdom does not
 * have. The fix is not a better mock — it is the browser-mode rewrite.
 */
const FROZEN: Record<string, string[]> = {
  'src/components/ProtectedRoute.test.tsx': ['@/hooks/useAuth', '@/lib/appLoader'],
  'src/components/customers/CustomerForm.test.tsx': ['@/hooks/useTableMutations'],
  'src/components/layout/ModuleSwitcher.test.tsx': ['@/hooks/useModuleNavigate', '@/hooks/useTable'],
  'src/components/layout/NavUser.test.tsx': ['@/hooks/useAuth', '@/hooks/useTable', '@/lib/config'],
  'src/hooks/useTable.test.tsx': ['@/hooks/useAuth'],
  'src/hooks/useTableMutations.test.tsx': ['./useAuth', '@/lib/apiClient', '@/lib/config'],
  'src/routes/login.test.tsx': ['@/hooks/useAuth'],
}

describe('test substitutions', () => {
  // This file quotes the patterns it looks for — in its regexes and in its prose —
  // so scanning itself would report its own documentation as unreadable mock
  // calls. It is a scanner, not a test that mocks anything.
  const SELF = fileURLToPath(import.meta.url)
  const files = walk(APP_ROOT).filter((f) => f !== SELF)

  it('finds test files to inspect at all', () => {
    // Guards against the walk silently matching nothing — which would make every
    // assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20)
  })

  it('scans every directory Vitest would collect from, not just src/', () => {
    // The escape this closes: a test file placed OUTSIDE src/ still runs under
    // Vitest (its include glob is rooted at the project dir) but was invisible to
    // this ratchet. Assert the root is the project dir and that the walk is
    // actually reaching outside src/, which is where e2e/ lives.
    expect(relative(APP_ROOT, SRC)).toBe('src')
    expect(files.some((f) => !f.startsWith(SRC + sep))).toBe(true)
  })

  it('parses every mock call it finds, so an unrecognized form cannot slip past', () => {
    // A specifier this file cannot read is worse than one it disallows: the mock
    // silently counts as zero. If a test starts building its specifier from a
    // variable or a template literal, fail here rather than quietly under-report.
    const unparsed: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const calls = mockCallCount(source)
      const parsed = mockedSpecifiers(source).length
      if (calls !== parsed) {
        unparsed.push(`${relative(APP_ROOT, file).split(sep).join('/')}: ${calls} calls, ${parsed} parsed`)
      }
    }
    expect(unparsed, 'A vi.mock()/vi.doMock() call used a form this scan cannot read.').toEqual([])
  })

  it('introduces no new mock of a module inside src/', () => {
    const found: Record<string, string[]> = {}
    for (const file of files) {
      const key = relative(APP_ROOT, file).split(sep).join('/')
      const internal = mockedSpecifiers(readFileSync(file, 'utf8')).filter(isInternal)
      if (internal.length > 0) found[key] = internal.sort()
    }

    const newlyMocked: string[] = []
    for (const [file, specifiers] of Object.entries(found)) {
      const allowed = new Set(FROZEN[file] ?? [])
      for (const specifier of specifiers) {
        if (!allowed.has(specifier)) newlyMocked.push(`${file} mocks ${specifier}`)
      }
    }

    expect(
      newlyMocked,
      'A new vi.mock() of internal code was added. Replacing app code with a stub means ' +
        'the test no longer exercises that code. Write it against the real module — in a ' +
        'browser if it needs a DOM, or as a pure function if it does not.',
    ).toEqual([])
  })

  it('counts the remaining internal mocks, so the number is visible rather than implied', () => {
    const total = files.reduce(
      (n, file) => n + mockedSpecifiers(readFileSync(file, 'utf8')).filter(isInternal).length,
      0,
    )
    // The plan's target is 0. This is not it; it is the number that has to come
    // down, asserted so it cannot quietly go back up.
    expect(total).toBeLessThanOrEqual(13)
  })

  it('names the two substitutions the suite is allowed to make', () => {
    // Stated as an executable fact so the count cannot drift in prose while the
    // code does something else:
    //
    //  1. The OIDC test server — a real provider standing in for the production
    //     IdP. The app's auth code runs against it unmodified.
    //  2. Session seeding via `#jwt` — a genuine bypass of the interactive
    //     redirect, defensible only because e2e/login-journey.spec.ts covers the
    //     real journey once, for real.
    const substitutions = ['oidc-test-server', 'jwt-session-seeding']
    expect(substitutions).toHaveLength(2)
    expect(existsSync(join(SRC, '..', 'e2e', 'login-journey.spec.ts'))).toBe(true)
  })
})
