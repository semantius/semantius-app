import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// There are exactly two environments, and which one a test runs in follows what
// the code under test touches — not the folder it sits in:
//
//   * touches a `window` or a `document`  ->  `browser`, a real Chromium
//   * touches neither                     ->  `node`
//
// jsdom is not the third option. For a test that needs no DOM it is dead weight;
// for one that does it is a hand-written description of a browser, and the app
// then gets "verified" against that description. The old `unit` project needed
// four polyfills (ResizeObserver, pointer capture, scrollIntoView) before a Base
// UI popover would mount, and every test that stubbed `window.location` did so
// because jsdom made it possible.
//
// JSX is the practical dividing line: a `*.test.tsx` renders a component, so it
// needs a document. Three `.ts` tests do too, and are named individually.
const BROWSER_TESTS = [
  'src/**/*.test.tsx',
  // `hideAppLoader()` walks a real element and waits on a real `transitionend`.
  'src/lib/appLoader.test.ts',
  // `initConfig()`'s secure-context gate reads `window.isSecureContext`, and
  // returns `null` where there is no `window` — under node it would pass by
  // being skipped.
  'src/lib/config.test.ts',
  // Drives `getApiConfig()` through the runtime config channel, `window.__ENV__`.
  'src/lib/apiClient.test.ts',
]

// e2e/ is Playwright's, not Vitest's. Vitest's default glob picks up *.spec.ts
// anywhere, and a Playwright spec loaded by Vitest fails with a confusing "did
// not expect test.describe() to be called here". `node_modules/**` (no leading
// `**/`) is NARROWER than Vitest's default and would stop excluding a nested
// package's tests; spell out the default form.
const EXCLUDE = ['**/node_modules/**', '**/dist/**', 'e2e/**']

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({
      target: 'react',
      // Route files are code-split in real builds. Under Vitest the transform is
      // off: it rewrites `component: X` into `lazyRouteComponent(...)` and moves
      // X into a virtual module, which puts a route's component out of reach of
      // a unit test (`Route.options.component` is then the lazy wrapper).
      autoCodeSplitting: !process.env.VITEST,
      // Colocated route tests are not routes.
      routeFileIgnorePattern: '[.](test|spec)[.]',
    }),
    viteReact(),
    tailwindcss(),
  ],
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['@codemirror/state', '@codemirror/view', '@lezer/common'],
  },
  test: {
    globals: true,
    watch: false,
    // Vitest's 5s default is a wall-clock budget, and these are component tests
    // driven by userEvent: typing eight characters into a field is dozens of
    // real event dispatches plus a React render each. Individually they run in
    // ~1s; with the whole suite running in parallel forks on a loaded machine
    // the same test measured 7.3s and timed out. A timeout that depends on how
    // busy the machine is fails the release gate at random, which trains
    // everyone to re-run it — the worst possible outcome for a suite. Raised to
    // a value no healthy test approaches, so a timeout means a hang, not
    // contention.
    testTimeout: 20_000,
    // Declared at the ROOT, not inside a project: a root globalSetup provides to
    // every project, and both need the token — the browser tests seed a session
    // with it, the node ones send it as a bearer. Declared inside `browser` it
    // would provide only there.
    globalSetup: ['./src/test/globalSetup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          // The two projects have different worker counts, which Vitest allows
          // only when they run in separate groups. Node first: it is seconds,
          // and its failures are the cheapest to read.
          sequence: { groupOrder: 0 },
          // No setup file: nothing here renders, so there is nothing to clean up
          // and no jest-dom matcher to register. A test that reaches for one is
          // in the wrong project.
          pool: 'forks',
          exclude: [...EXCLUDE, ...BROWSER_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: BROWSER_TESTS,
          exclude: EXCLUDE,
          // Each worker is a real browser context rendering a real page, not a
          // worker thread evaluating a DOM in JS. Vitest's default scales with
          // core count (11 here), and at that width the machine, not the code,
          // decides whether a test passes: CodeMirror mounts missed a 5s
          // waitFor and the DevTools-protocol accessible-name probe hung out to
          // the 20s ceiling — both intermittently, both green when run alone.
          // Capped low enough that a failure means a defect.
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
          setupFiles: './src/test/setup.browser.ts',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Chromium only: it is what the accessibility audit and the
            // Playwright login journey run on, so a finding here can be
            // reproduced there. `pnpm test:e2e:install` fetches it.
            instances: [{ browser: 'chromium' }],
            // Vitest's default viewport is a 414px phone. The form's
            // single-column container query kicks in below 30rem, and every
            // Base UI popover positions against the viewport, so a desktop
            // size is the neutral baseline; a test that wants the phone layout
            // sets it explicitly.
            viewport: { width: 1280, height: 800 },
            // A failing test's screenshot lands in a __screenshots__ folder
            // next to the test and is noise in a diff; the assertion message
            // is the record.
            screenshotFailures: false,
          },
        },
      },
    ],
  },
}))
