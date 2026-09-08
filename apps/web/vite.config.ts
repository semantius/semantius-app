import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { i18nDevWriter } from './vite-plugins/i18nDevWriter'

/**
 * The languages this build ships, read off `public/locales/` and inlined as
 * `__SHIPPED_LOCALES__` (declared in src/env.d.ts). A language file is named
 * by its BCP-47 tag; `schema.json` and `work.schema.json` are not languages,
 * and `en-US.json` is the index, not a catalog. The files themselves stay
 * static assets, fetched one at a time — never bundled.
 */
const LANGUAGE_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.json$/
function shippedLocales(): string[] {
  try {
    return readdirSync(fileURLToPath(new URL('./public/locales', import.meta.url)))
      .map((name) => LANGUAGE_FILE.exec(name)?.[1])
      .filter((code): code is string => Boolean(code) && code !== 'en-US')
      .sort()
  } catch {
    return []
  }
}

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
  // The fetch interceptor is browser code by definition: it exists so a
  // RELATIVE url in page script becomes an API call, and node cannot fetch a
  // relative url at all. It also reads what it did out of resource timing.
  'src/lib/apiClient.interceptor.test.ts',
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
    // The translate endpoint on a developer's machine: it reads and writes
    // the repo's own language files under public/locales/, for translate mode
    // and for discovery. `apply: 'serve'`, so no build has it.
    i18nDevWriter(),
  ],
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString()),
    '__SHIPPED_LOCALES__': JSON.stringify(shippedLocales()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['@codemirror/state', '@codemirror/view', '@lezer/common'],
  },
  optimizeDeps: {
    // Reached only through the LAZY translate-mode chunk
    // (src/i18n/translateMode/, loaded by components/TranslateModeHost.tsx),
    // so Vite's import crawler does not see them at startup and discovers them
    // the first time the chunk loads — at which point it re-optimizes and
    // RELOADS the page. In the dev server that is a flash; in the Vitest
    // browser project it reloads a running test, and the half-loaded module
    // graph then holds two copies of React ("Invalid hook call" inside
    // <TabsRoot>). Naming them here is what Vitest asks for in that message.
    include: ['sonner', '@base-ui/react/tabs'],
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
          // The setup file registers no DOM anything — nothing here renders, so
          // there is no cleanup to do and no jest-dom matcher to add. It exists
          // because `i18n._()` THROWS with no active locale, and pure code
          // renders messages too: `resolveUserMenu`'s built-in titles, a route's
          // head(). It activates `en-US`, the source language, so a `t()` still
          // produces the English written in the code.
          setupFiles: './src/test/setup.node.ts',
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
