import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// Component tests that run in a real Chromium — the `browser` project below —
// rather than in jsdom. Everything under these globs is excluded from the
// `unit` project so nothing runs twice.
//
// What qualifies: a test of a component whose behavior depends on things jsdom
// does not have — layout, real CSS, focus management, ResizeObserver, pointer
// capture, a code-split editor actually mounting. The form controls are all of
// that (Base UI popovers, CodeMirror, react-day-picker), and src/test/setup.ts
// shows the price of faking it: four polyfills before a popover will open. Move
// a test here when it starts needing a fifth.
const BROWSER_TESTS = [
  'src/components/form/__tests__/**/*.test.tsx',
  'src/components/ui-ext/**/*.test.tsx',
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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: './src/test/setup.ts',
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
          setupFiles: './src/test/setup.browser.ts',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Chromium only: it is what the accessibility sweep and the
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
