import { afterEach, beforeAll } from 'vitest'
import { SOURCE_LANGUAGE, activateLocale } from '@/i18n'

// Setup for the `node` Vitest project (see vite.config.ts): everything that
// touches neither a `window` nor a `document`.
//
// It exists for exactly one reason, and it is not a DOM: `i18n._()` THROWS when
// no locale has been activated ("Attempted to call a translation function
// without setting a locale"), so any pure function that renders a message —
// `resolveUserMenu`'s built-in titles, a route's `head()` — needs the singleton
// activated before the first test runs.
//
// `en-US` is the source language, so activating it means every `t()` renders the
// English written in the code: assertions still read as the words on the screen.
const SOURCE = { language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE }

beforeAll(async () => {
  await activateLocale(SOURCE)
})

// The Lingui instance is a module singleton and outlives a test within a file, so
// a test that switches language would leak into the next one. Reset rather than
// trust every test to clean up after itself.
afterEach(async () => {
  await activateLocale(SOURCE)
})
