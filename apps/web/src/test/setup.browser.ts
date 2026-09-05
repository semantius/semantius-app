import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Setup for the `browser` Vitest project (see vite.config.ts): the component
// tests that run in a real Chromium through Playwright rather than in jsdom.
//
// Nothing is polyfilled here — that is the point. `src/test/setup.ts` has to
// hand jsdom a fake ResizeObserver, pointer capture and scrollIntoView before a
// Base UI popover will even mount; in a browser those exist, so a test here
// exercises the component's real dependencies instead of stubs of them.
//
// The stylesheets are loaded in the same order main.tsx loads them (the order is
// load-bearing: theme-a11y.css wins over global.css's palette purely by coming
// second). jsdom applies no CSS at all, so in the unit project `sr-only` text is
// visible, `size-6` has no size and there is nothing for a contrast or
// target-size assertion to measure. Here there is.
import '@/global.css'
import '@/theme-a11y.css'

afterEach(() => {
  cleanup()
})
