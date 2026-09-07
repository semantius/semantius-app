/**
 * Where translations are read from and written to — one contract, three places.
 *
 * Translate mode speaks exactly one protocol: the `ui_translations` PostgREST
 * shape (the DDL is in the root README under "Tenant translations"). What
 * changes between environments is the BASE URL, never the call:
 *
 *   dev     the Vite dev server (`vite-plugins/i18nDevWriter.ts`), which writes
 *           the repo — a code string into `src/locales/<code>.json`, a model
 *           label into `public/locales/<code>.json`
 *   stage   whatever host is given, answering the same three calls
 *   prod    the tenant's own `ui_translations` table
 *
 * That is why the translate target is its OWN axis and not derived from the
 * app's environment: running `pnpm dev` against the stage translate target is
 * just a different URL, and so is running a deployed build against a local one.
 *
 * The consequence that matters for correctness: in dev an edit lands in the
 * source of truth and goes through a PR, so fixing a wrong shipped German
 * string is a repo change rather than a row that shadows the wrong value in one
 * tenant forever.
 */

import { runtimeEnv } from '@/lib/runtimeEnv'

/** Read through `runtimeEnv`, so the Docker "build once, run anywhere" path works. */
function configuredTarget(): string {
  return (runtimeEnv('VITE_TRANSLATE_API_URL', import.meta.env.VITE_TRANSLATE_API_URL) ?? '').trim()
}

/**
 * The PostgREST base that holds translations, or `undefined` for the app's own
 * API — which in a deployment is the tenant, so production needs no
 * configuration at all.
 *
 * Under `vite dev` it defaults to the app's own origin, where the dev server
 * answers: `pnpm dev` therefore translates into the repo with nothing to set
 * up.
 *
 * `undefined` rather than resolving the API base here on purpose. The generic
 * hooks already read `getApiConfig()` when no base is given, and importing
 * `lib/apiClient` from this directory would close a cycle — `apiClient` and
 * `config` both import the `@/i18n` barrel.
 */
export function translateApiUrl(): string | undefined {
  const configured = configuredTarget()
  if (configured) return configured.replace(/\/+$/, '')
  if (import.meta.env.DEV && typeof window !== 'undefined') return window.location.origin
  return undefined
}

/**
 * Whether the target is the dev server writing this checkout.
 *
 * True only under `vite dev` and only while the target is this origin — point
 * it at a stage host and it is a remote target like any other, permissions and
 * all.
 */
export function translateTargetIsRepo(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  const configured = configuredTarget()
  return !configured || configured.replace(/\/+$/, '') === window.location.origin
}
