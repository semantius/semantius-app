import { afterEach, beforeAll, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import {
  LANGUAGE_CACHE_KEY,
  LOCALE_CACHE_KEY,
  SOURCE_LANGUAGE,
  activateLocale,
  clearSessionPreference,
  setRecordingRenders,
  setTranslateMode,
  setTranslateTarget,
} from '@/i18n'
import { disableCollector, enableCollector, flush } from '@/i18n/missing'

// Setup for the `browser` Vitest project (see vite.config.ts): everything that
// touches a document, run in a real Chromium through Playwright.
//
// Nothing is polyfilled here — that is the point, and it is the whole reason
// the project exists. A simulated DOM has to be handed a fake ResizeObserver,
// pointer capture and scrollIntoView before a Base UI popover will even mount;
// in a browser those exist, so a test exercises the component's real
// dependencies instead of a description of them. If something here needs a
// polyfill to pass, the test is wrong, not the environment.
//
// The stylesheets are loaded in the same order main.tsx loads them (the order is
// load-bearing: theme-a11y.css wins over global.css's palette purely by coming
// second). Without real CSS, `sr-only` text is visible, `size-6` has no size and
// there is nothing for a contrast or target-size assertion to measure.
import '@/global.css'
import '@/theme-a11y.css'

// The source language, activated before anything renders: `i18n._()` throws
// when no locale is active, and `<I18nProvider>` renders `null` — which under a
// boot overlay is a hang, not an error. `en-US` renders the English written in
// the code, so assertions still read as the words on the screen.
const SOURCE = { language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE }

/**
 * THE SUITE WRITES THE LANGUAGE FILES. The translate target is the dev server
 * this project runs against — the same endpoint `pnpm dev` answers — so every
 * string a test renders is discovered into `i18n/en-US.json`, and a
 * test that switches to German records what that language lacks. The files are
 * a committed artifact of the run; a test that renders a string no real screen
 * shows switches the collector off first (`disableCollector()`).
 */
function useDevTarget(): void {
  setTranslateTarget({ url: window.location.origin, mode: 'dev' })
}

beforeAll(async () => {
  useDevTarget()
  await activateLocale(SOURCE)
})

beforeEach(() => {
  enableCollector()
})

afterEach(async () => {
  cleanup()
  // What this test rendered goes to the index before the next test — a test
  // file is one page, and the page is torn down when the file ends.
  await flush()
  disableCollector()
  // The Lingui singleton, the session preference and localStorage all outlive a
  // test within a file, so a test that switches language has to be undone here
  // rather than by every test that follows it remembering to. The session
  // preference matters as much as the cache keys: the switcher writes it too,
  // and it OUTRANKS the cache — a leaked one makes "boots from the cached keys
  // alone" resolve `languageSource: 'session'`.
  localStorage.removeItem(LANGUAGE_CACHE_KEY)
  localStorage.removeItem(LOCALE_CACHE_KEY)
  clearSessionPreference()
  // Translate mode's switch persists in localStorage too, and a leaked one
  // would mount the translate-mode chunk under every later AppLayout render.
  setTranslateMode(false)
  setRecordingRenders(false)
  // A test that ran `initConfig()` with its own environment may have moved the
  // target; the suite's is the dev server.
  useDevTarget()
  await activateLocale(SOURCE)
})

// Testing Library's `waitFor` gives up after 1s by default. Every test in this
// project that reads data talks to the REAL tenant, and the app's fetch
// interceptor now retries a rate limit or a cold start for up to ~10s
// (lib/retry.ts, MAX_ELAPSED_MS) before an answer reaches the hook. A 1s wait
// therefore fails a test for the exact behavior the app is supposed to have —
// `useTable.test.tsx` did, once, on a bad minute at the tenant — and a
// per-test `{ timeout }` would have to be remembered in every file. 15s covers
// the budget plus the request itself and stays under the 20s testTimeout.
import { configure } from '@testing-library/react'
configure({ asyncUtilTimeout: 15_000 })
