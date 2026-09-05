import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Setup for the `browser` Vitest project (see vite.config.ts): everything that
// touches a document, run in a real Chromium through Playwright.
//
// Nothing is polyfilled here — that is the point, and it is the whole reason the
// project exists. A simulated DOM has to be handed a fake ResizeObserver,
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

afterEach(() => {
  cleanup()
})
