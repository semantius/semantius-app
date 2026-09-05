/// <reference types="vitest" />
import '@testing-library/jest-dom/vitest'

declare module 'vitest' {
  /**
   * What `src/test/globalSetup.ts` provides to every project. Augmenting this
   * empty interface is what gives `inject('accessToken')` a type; without it the
   * key is `never` and every call is an error.
   */
  interface ProvidedContext {
    accessToken: string
    tokenExpiresAt: number
    orgSlug: string
  }
}
