import { defineConfig, type PluginOption } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { i18nDevWriter } from './vite-plugins/i18nDevWriter'

/**
 * `i18n/` at the repository root: the language files, the work files and the
 * todo files — the surface a translator opens. Deliberately NOT under
 * `public/`, which means "published verbatim": a work file holds a half-finished
 * translation and a todo file holds internal notes about model defects, and
 * neither may ever be served. What ships is emitted by `emitLanguageFiles()`.
 */
const LOCALES_DIR = fileURLToPath(new URL('../../i18n', import.meta.url))

/**
 * A language file is named by its BCP-47 tag. This regex is the ALLOWLIST that
 * decides both what `__SHIPPED_LOCALES__` lists and what the build emits — so
 * `work-de-DE.json`, `todo-de-DE.md`, `AGENTS.md` and the plan documents sitting
 * in the same flat folder match nothing and cannot leak into `dist/`. A denylist
 * would rot the moment a new kind of working file appeared.
 */
const LANGUAGE_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.json$/

/** Every language file in `i18n/`, `en-US.json` included. */
function languageFileNames(): string[] {
  return readdirSync(LOCALES_DIR).filter((name) => LANGUAGE_FILE.test(name))
}

/**
 * The languages this build ships, inlined as `__SHIPPED_LOCALES__` (declared in
 * src/env.d.ts). `en-US.json` is the INDEX, not a catalog — it ships as a file
 * so an operator can start a new language from it, but it is never listed as an
 * available language. Do not "fix" that exclusion; the two are different things.
 *
 * The files themselves stay static assets, fetched one at a time — never bundled.
 *
 * This used to swallow a missing folder and return `[]`, which meant a typo or a
 * path that resolved differently in CI produced a build with zero languages: no
 * error, no warning, just a language switcher with nothing in it and every
 * string falling back to English. The check is for the INDEX rather than for a
 * non-empty list, because zero translations is a legitimate state (a repo before
 * its first one) while a missing `en-US.json` only ever means the folder is not
 * the folder.
 */
function shippedLocales(): string[] {
  let names: string[]
  try {
    names = languageFileNames()
  } catch (err) {
    throw new Error(`i18n: cannot read the language folder at ${LOCALES_DIR}`, { cause: err })
  }
  if (!names.includes('en-US.json')) {
    throw new Error(
      `i18n: no en-US.json in ${LOCALES_DIR}. That file is the index every language starts from, ` +
        'so its absence means this is not the language folder — not that there is nothing to ship.',
    )
  }
  return names
    .map((name) => LANGUAGE_FILE.exec(name)?.[1])
    .filter((code): code is string => Boolean(code) && code !== 'en-US')
    .sort()
}

/**
 * `/locales/<code>.json`, in both runtimes.
 *
 * The language files live outside `publicDir` now, so nothing copies them into
 * the build and nothing serves them in dev — but the URL is a contract. It is
 * documented in `README.md`, `docker/README.md` and `BACKEND.md`, it is what
 * `store.ts` fetches, and `docker/nginx.conf` serves the same path out of
 * `/usr/share/nginx/html/locales/`. It does not change because the source
 * folder did.
 *
 * ONE plugin, two hooks, and no `apply` field: a plugin declaring
 * `apply: 'build'` is filtered out of the serve-mode plugin container entirely,
 * so its `configureServer` would never run. `writeBundle` only ever fires on a
 * build, which is the whole of the guard needed.
 *
 * What gets emitted is the ALLOWLIST (`LANGUAGE_FILE`) and never a denylist,
 * which is what makes the flat folder safe: a work file, a todo file, the
 * guide, `AGENTS.md` and the plan documents match nothing and stay put. The
 * predecessor of this plugin deleted work files back out of `dist/` after the
 * fact — a patch over a placement mistake, and it is gone with the mistake.
 *
 * Dev serving is narrower than it looks: in `dev` and `stage` the static file is
 * not fetched at all (`store.ts` returns null from the file layer and the
 * language comes from the translate target, which `i18nDevWriter` answers off
 * disk). The middleware is for a dev server running `VITE_TRANSLATE_MODE=off`
 * or `prod`, and for anything exercising the static path directly.
 */
function emitLanguageFiles(): PluginOption {
  return {
    name: 'i18n-language-files',
    writeBundle(options) {
      const dir = join(options.dir ?? 'dist', 'locales')
      mkdirSync(dir, { recursive: true })
      for (const name of languageFileNames()) {
        copyFileSync(join(LOCALES_DIR, name), join(dir, name))
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        const name = path.startsWith('/locales/') ? path.slice('/locales/'.length) : ''
        // The allowlist again, and it is the path traversal guard too: a name
        // holding a slash or a `..` cannot match a BCP-47 tag.
        if (!LANGUAGE_FILE.test(name)) return next()
        const file = join(LOCALES_DIR, name)
        if (!existsSync(file)) return next()
        // `store.ts` checks the content-type before parsing, because an SPA
        // fallback answers a missing file with HTML and a 200.
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(readFileSync(file))
      })
    },
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
    // the repo's own language files under `i18n/`, for translate mode and for
    // discovery. `apply: 'serve'`, so no build has it.
    i18nDevWriter(),
    // `/locales/<code>.json` — emitted into `dist/` on a build, served from
    // `i18n/` in dev. Deliberately no `apply`; see the comment on the plugin.
    emitLanguageFiles(),
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
    //
    // The second group is the same failure on a COLD cache: the browser
    // project's entries are test files, and these are reached only through
    // imports the crawler does not follow from them, so a fresh CI runner
    // discovered all seven mid-run, reloaded, and failed whichever tests were
    // mounted at that moment (NavUser, the fetch interceptor). A warm
    // node_modules/.vite hides it locally — reproduce with that folder deleted.
    include: [
      'sonner',
      '@base-ui/react/tabs',
      'react-dom/client',
      '@tanstack/react-query-devtools',
      '@tanstack/router-devtools',
      'drizzle-cube/client',
      'drizzle-cube/client/utils',
      'react-resizable-panels',
      '@base-ui/react/select',
    ],
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
