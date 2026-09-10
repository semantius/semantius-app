/**
 * Build-time constants `vite.config.ts` injects through `define`.
 *
 * `__SHIPPED_LOCALES__` is the list of language files under `i18n/`
 * at build time — what `availableLanguages()` lists without fetching anything.
 * The files themselves are static assets, fetched one at a time at boot.
 */
declare const __SHIPPED_LOCALES__: readonly string[]
