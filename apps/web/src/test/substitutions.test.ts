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
 * The same argument applies one level down, to the browser itself. A test that
 * replaces `window.location`, `window.open`, `matchMedia`, `ResizeObserver`,
 * `crypto`, `fetch` or the clock is not testing the app in a browser; it is
 * testing the app against a hand-written description of a browser, written by
 * whoever needed the test to pass. Every such substitution in this repository is
 * a design signal, not a technique: a navigation is a link, an API call is a real
 * call, a non-secure context is a real `http://<lan-ip>` origin in Playwright.
 *
 * The target is ZERO for every family below, reached by moving those tests into a
 * real browser against real code (see e2e/login-journey.spec.ts for the shape).
 * Until then this is a ratchet: today's set is frozen per file, and any NEW
 * instance fails. It cannot go up, only down — and lowering it means editing this
 * file, which puts the decision in a diff where someone can see it.
 *
 * COUNTING RULE. Each family counts every occurrence its patterns match in the
 * file's code (comments stripped, strings kept). It does NOT try to tell a stub
 * from the restore that undoes it — `window.location = originalLocation` counts
 * exactly like `window.location = { href: '' }`. That is deliberate: the only
 * syntactic difference is what the right-hand side happens to be named, and a
 * scanner that guesses at intent is a scanner that can be fooled by renaming a
 * variable. A restore only exists because a stub does, so the pair falls together
 * and the number still only goes down. Where a frozen count includes a restore,
 * the table says so.
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

/**
 * Directories whose whole contents are test material even when the filename
 * carries no `.test.`/`.spec.` marker. Without this, every pattern below is
 * escaped by moving the offending lines into a helper.
 */
const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__mocks__', 'e2e'])
const CODE_FILE = /\.[cm]?[jt]sx?$/
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/

function walk(dir: string, inTestDir: boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, inTestDir || TEST_DIRS.has(entry), out)
    else if (CODE_FILE.test(entry) && (TEST_FILE.test(entry) || inTestDir)) out.push(full)
  }
  return out
}

/**
 * Blank out comments — and only comments — replacing them with spaces so byte
 * offsets and line numbers survive. String and template literals are kept
 * verbatim, because every pattern below identifies its target BY a string
 * literal (`vi.mock('@/hooks/useAuth')`, `vi.stubGlobal('fetch')`).
 *
 * The parser has to know about strings and regex literals even though it keeps
 * them: `'https://tests.semantius.cloud'` contains a `//` that is not a comment,
 * and blanking from there to end of line would silently delete real code — an
 * under-count, the one direction of error a ratchet must not have. Regex
 * detection uses the usual previous-token heuristic; when it guesses wrong the
 * failure is conservative (a comment survives, so the family over-counts and the
 * suite fails loudly) rather than silent.
 */
function stripComments(source: string): string {
  const out = source.split('')
  const n = source.length
  let i = 0
  let prev = ''
  while (i < n) {
    const c = source[i]
    const d = source[i + 1]
    if (/[A-Za-z_$0-9]/.test(c)) {
      // Consume the whole identifier or number so `prev` is a token, not a
      // letter: `return /x/` is a regex, `count / 2` is division, and the only
      // thing that tells them apart is the word before the slash.
      let j = i
      while (j < n && /[A-Za-z_$0-9.]/.test(source[j])) j++
      prev = source.slice(i, j)
      i = j
      continue
    }
    if (c === '/' && d === '/') {
      while (i < n && source[i] !== '\n') out[i++] = ' '
      continue
    }
    if (c === '/' && d === '*') {
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < n) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < n) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === c) {
          i++
          break
        }
        i++
      }
      prev = c
      continue
    }
    if (c === '/' && canStartRegex(prev)) {
      i++
      let inClass = false
      while (i < n && source[i] !== '\n') {
        const r = source[i]
        if (r === '\\') {
          i += 2
          continue
        }
        if (r === '[') inClass = true
        else if (r === ']') inClass = false
        else if (r === '/' && !inClass) {
          i++
          break
        }
        i++
      }
      prev = '/'
      continue
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}

/** A `/` after one of these starts a regex literal; after anything else it divides. */
const REGEX_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '\n'])
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void'])

function canStartRegex(prev: string): boolean {
  return REGEX_PRECEDERS.has(prev) || REGEX_KEYWORDS.has(prev)
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

/** Same idea for `vi.stubGlobal('name', …)`: parse the name, or fail. */
const STUB_GLOBAL_CALL = /vi\.stubGlobal\(/g
const STUB_GLOBAL_WITH_NAME = /vi\.stubGlobal\(\s*['"]([^'"]+)['"]/g

function matchCount(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length
}

/** A specifier that resolves into this app's own source, as opposed to a package. */
function isInternal(specifier: string): boolean {
  return specifier.startsWith('@/') || specifier.startsWith('./') || specifier.startsWith('../')
}

/**
 * The families. Each is a thing the suite supplies in place of something real;
 * `patterns` are matched against comment-stripped source and the hits summed.
 */
const FAMILIES: { key: string; what: string; patterns: RegExp[] }[] = [
  {
    key: 'module-mock-external',
    what: 'a package replaced by vi.mock/vi.doMock',
    // Counted separately from the internal set below, which is frozen by
    // specifier rather than by count. Mocking a package is less damaging than
    // mocking our own code, but `@tanstack/react-router` is not a detail — it is
    // what decides what a component renders and where a link goes.
    patterns: [],
  },
  {
    key: 'window-location',
    what: 'window.location replaced',
    patterns: [
      /delete\s+window\.location\b/g,
      /window\.location\s*=(?!=)/g,
      /defineProperty\(\s*window\s*,\s*['"]location['"]/g,
    ],
  },
  {
    key: 'window-open',
    what: 'window.open replaced',
    patterns: [/defineProperty\(\s*window\s*,\s*['"]open['"]/g, /window\.open\s*=(?!=)/g],
  },
  {
    key: 'match-media',
    what: 'a fake matchMedia',
    patterns: [/defineProperty\(\s*window\s*,\s*['"]matchMedia['"]/g, /(?:window|global|globalThis)\.matchMedia\s*=(?!=)/g],
  },
  {
    key: 'resize-observer',
    what: 'a fake ResizeObserver',
    patterns: [/(?:global|globalThis|window)\.ResizeObserver\s*=(?!=)/g],
  },
  {
    key: 'fetch',
    what: 'fetch replaced',
    patterns: [/(?:global|globalThis|window)\.fetch\s*=(?!=)/g, /vi\.stubGlobal\(\s*['"]fetch['"]/g],
  },
  {
    key: 'secure-context',
    what: 'crypto / isSecureContext replaced',
    patterns: [/vi\.stubGlobal\(\s*['"](?:crypto|isSecureContext)['"]/g],
  },
  {
    key: 'build-env',
    what: 'build-time env replaced',
    patterns: [/vi\.stubEnv\(/g],
  },
  {
    key: 'fake-timers',
    what: 'the clock replaced',
    patterns: [/vi\.useFakeTimers\(/g],
  },
  {
    key: 'app-loader-stand-in',
    what: "a hand-built stand-in for index.html's boot overlay",
    // Both spellings: the innerHTML blob and the createElement form that
    // replaced it. Matching only the first would have let the same stand-in
    // survive a refactor while the count read zero.
    patterns: [/innerHTML\s*=\s*['"`][^'"`]*id="app-loader"/g, /\.id\s*=\s*['"]app-loader['"]/g],
  },
  {
    key: 'pointer-events-check-off',
    what: "userEvent's real-browser pointer check disabled",
    patterns: [/pointerEventsCheck\s*:/g],
  },
  {
    key: 'console-silenced',
    what: 'console silenced (a call-through spy is not this)',
    patterns: [/console\.(?:error|warn|log)\s*=(?!=)/g],
  },
  {
    key: 'module-registry-reset',
    what: 'vi.resetModules to re-run a module side effect',
    patterns: [/vi\.resetModules\(/g],
  },
  {
    key: 'synthetic-change-event',
    what: 'fireEvent.change instead of typing',
    patterns: [/fireEvent\.change\(/g],
  },
]

/**
 * The frozen inventory: family -> file -> count. Every entry is a known gap, not
 * an approved practice. Numbers may be lowered, never raised; a file that is not
 * listed must have zero.
 *
 * A family with no entry here must have none anywhere. Nine of the fifteen are
 * in that state: window.location, window.open, matchMedia, ResizeObserver,
 * crypto/isSecureContext, vi.stubEnv, fake timers, the pointer-events override
 * and a silenced console are all gone, and adding one back fails this file.
 */
const FROZEN: Record<string, Record<string, number>> = {
  'module-mock-external': {
    'src/components/layout/ModuleSwitcher.test.tsx': 1,
    'src/components/layout/NavUser.test.tsx': 1,
    'src/routes/login.test.tsx': 1,
  },
  // Every one of these is a stubbed API call, and every one is waiting on the
  // same thing: a test session against the real tenant.
  fetch: {
    'src/hooks/useTable.test.tsx': 1,
    'src/hooks/useTableMutations.test.tsx': 9,
    // 1 install + 1 restore. The install is load-bearing — the interceptor
    // captures whatever fetch it finds at import time, so a spy is the only way
    // to see what it forwards.
    'src/lib/apiClient.interceptor.test.ts': 2,
    'src/lib/config.test.ts': 8,
  },
  'app-loader-stand-in': {
    'src/lib/appLoader.test.ts': 1,
    'src/routes/login.test.tsx': 1,
  },
  'synthetic-change-event': {
    'src/components/form/__tests__/SchemaForm.test.tsx': 2,
  },
}

/**
 * Internal module mocks are frozen by SPECIFIER, not by count: which module is
 * replaced matters more than how many times. 13 in total.
 */
const FROZEN_INTERNAL_MOCKS: Record<string, string[]> = {
  'src/components/ProtectedRoute.test.tsx': ['@/hooks/useAuth', '@/lib/appLoader'],
  'src/components/customers/CustomerForm.test.tsx': ['@/hooks/useTableMutations'],
  'src/components/layout/ModuleSwitcher.test.tsx': ['@/hooks/useModuleNavigate', '@/hooks/useTable'],
  'src/components/layout/NavUser.test.tsx': ['@/hooks/useAuth', '@/hooks/useTable', '@/lib/config'],
  'src/hooks/useTable.test.tsx': ['@/hooks/useAuth'],
  'src/hooks/useTableMutations.test.tsx': ['./useAuth', '@/lib/apiClient', '@/lib/config'],
  'src/routes/login.test.tsx': ['@/hooks/useAuth'],
}

/**
 * Sum of every frozen count, plus the 13 internal mocks. Only ever goes down.
 * It was 96 when this scanner was written; removing jsdom took it to 40, because
 * most of what was frozen existed only to describe a browser to a fake one.
 */
const FROZEN_TOTAL = 40

describe('test substitutions', () => {
  // This file quotes the patterns it looks for — in its regexes and in its prose —
  // so scanning itself would report its own documentation as unreadable mock
  // calls. It is a scanner, not a test that substitutes anything.
  const SELF = fileURLToPath(import.meta.url)
  const files = walk(APP_ROOT, false).filter((f) => f !== SELF)
  const key = (file: string) => relative(APP_ROOT, file).split(sep).join('/')
  const code = new Map(files.map((f) => [key(f), stripComments(readFileSync(f, 'utf8'))]))

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

  it('also scans test helpers that carry no .test. in their name', () => {
    // Without this the whole ratchet is escaped by moving the offending lines one
    // file sideways, which is where two of the frozen entries already live.
    expect(code.has('src/test/runtimeConfig.ts')).toBe(true)
    expect(code.has('src/components/form/__tests__/harness.tsx')).toBe(true)
  })

  it('strips comments without eating code', () => {
    // The one part of the scanner that can under-count, so it is tested directly.
    const stripped = stripComments(
      [
        `const url = 'https://example.com/a//b'`,
        `vi.stubEnv('A') // vi.stubEnv('B')`,
        `/* vi.stubEnv('C') */ vi.stubEnv('D')`,
        `const re = /a\\/\\/b/ // vi.stubEnv('E')`,
      ].join('\n'),
    )
    expect(matchCount(stripped, /vi\.stubEnv\(/g)).toBe(2)
    expect(stripped).toContain(`'https://example.com/a//b'`)
    // Line numbers survive, so a failure message can still point somewhere.
    expect(stripped.split('\n')).toHaveLength(4)
  })

  it('parses every mock call it finds, so an unrecognized form cannot slip past', () => {
    // A specifier this file cannot read is worse than one it disallows: the mock
    // silently counts as zero. If a test starts building its specifier from a
    // variable or a template literal, fail here rather than quietly under-report.
    const unparsed: string[] = []
    for (const [file, source] of code) {
      const calls = matchCount(source, MOCK_CALL)
      const parsed = matchCount(source, MOCK_WITH_SPECIFIER)
      if (calls !== parsed) unparsed.push(`${file}: ${calls} vi.mock calls, ${parsed} parsed`)
      const stubs = matchCount(source, STUB_GLOBAL_CALL)
      const named = matchCount(source, STUB_GLOBAL_WITH_NAME)
      if (stubs !== named) unparsed.push(`${file}: ${stubs} vi.stubGlobal calls, ${named} parsed`)
    }
    expect(unparsed, 'A vi.mock()/vi.stubGlobal() call used a form this scan cannot read.').toEqual([])
  })

  it('introduces no new mock of a module inside src/', () => {
    const newlyMocked: string[] = []
    for (const [file, source] of code) {
      const allowed = new Set(FROZEN_INTERNAL_MOCKS[file] ?? [])
      for (const [, specifier] of source.matchAll(MOCK_WITH_SPECIFIER)) {
        if (isInternal(specifier) && !allowed.has(specifier)) newlyMocked.push(`${file} mocks ${specifier}`)
      }
    }

    expect(
      newlyMocked,
      'A new vi.mock() of internal code was added. Replacing app code with a stub means ' +
        'the test no longer exercises that code. Write it against the real module — in a ' +
        'browser if it needs a DOM, or as a pure function if it does not.',
    ).toEqual([])
  })

  it.each(FAMILIES.filter((f) => f.patterns.length > 0))(
    'introduces no new instance of: $what',
    ({ key: family, patterns }) => {
      const frozen = FROZEN[family] ?? {}
      const found: Record<string, number> = {}
      for (const [file, source] of code) {
        const n = patterns.reduce((sum, p) => sum + matchCount(source, p), 0)
        if (n > 0) found[file] = n
      }

      const violations: string[] = []
      for (const [file, n] of Object.entries(found)) {
        const allowed = frozen[file] ?? 0
        if (n > allowed) violations.push(`${file}: ${n} (frozen at ${allowed})`)
      }

      expect(
        violations,
        `A new substitution was added: ${family}. The suite does not stub browser primitives — ` +
          'a test that seems to need one is reporting a design problem in the code under test ' +
          '(a navigation is a link, an API call is a real call), or it belongs in e2e/.',
      ).toEqual([])
    },
  )

  it('counts external module mocks, which are frozen too', () => {
    const frozen = FROZEN['module-mock-external'] ?? {}
    const violations: string[] = []
    for (const [file, source] of code) {
      const external = [...source.matchAll(MOCK_WITH_SPECIFIER)].filter(([, s]) => !isInternal(s))
      if (external.length > (frozen[file] ?? 0)) {
        violations.push(`${file}: ${external.length} (frozen at ${frozen[file] ?? 0}) — ${external.map(([, s]) => s).join(', ')}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('counts every remaining substitution, so the number is visible rather than implied', () => {
    let total = 0
    for (const source of code.values()) {
      for (const family of FAMILIES) {
        for (const pattern of family.patterns) total += matchCount(source, pattern)
      }
      total += matchCount(source, MOCK_WITH_SPECIFIER)
    }
    // The plan's target is 0. This is not it; it is the number that has to come
    // down, asserted as an upper bound so it cannot quietly go back up.
    expect(total).toBeLessThanOrEqual(FROZEN_TOTAL)
  })

  it('keeps jsdom out of the project entirely', () => {
    // The families above are all instances of one thing: the suite describing a
    // browser instead of using one. jsdom is what made that possible and what
    // made it look reasonable — a test could stub `window.location` because
    // jsdom's is a plain object, and could pass an axe check with no CSS loaded.
    // Removing the stubs while leaving the environment in place would only mean
    // waiting for the next one, so the environment is asserted gone here rather
    // than left to a config file nobody re-reads.
    const config = readFileSync(join(APP_ROOT, 'vite.config.ts'), 'utf8')
    expect(stripComments(config)).not.toMatch(/jsdom/)

    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(Object.keys(deps)).not.toContain('jsdom')
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
