import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

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
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    pool: 'forks',
    watch: false,
    // Vitest's 5s default is a wall-clock budget, and these are jsdom component
    // tests driven by userEvent: typing eight characters into a field is dozens
    // of real event dispatches plus a React render each. Individually they run in
    // ~1s; with the whole suite running in parallel forks on a loaded machine the
    // same test measured 7.3s and timed out. A timeout that depends on how busy
    // the machine is fails the release gate at random, which trains everyone to
    // re-run it — the worst possible outcome for a suite. Raised to a value no
    // healthy test approaches, so a timeout means a hang, not contention.
    testTimeout: 20_000,
    // e2e/ is Playwright's, not Vitest's. Vitest's default glob picks up
    // *.spec.ts anywhere, and a Playwright spec loaded by Vitest fails with a
    // confusing "did not expect test.describe() to be called here".
    // `node_modules/**` (no leading `**/`) is NARROWER than Vitest's default and
    // would stop excluding a nested package's tests; spell out the default form.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  }
}))
