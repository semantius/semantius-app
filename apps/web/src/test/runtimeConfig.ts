import { initConfig } from '@/lib/config'

/**
 * Drive the app's configuration through the channel the app actually reads.
 *
 * `runtimeEnv()` consults `window.__ENV__` first and only then the value Vite
 * inlined at build time — that is the whole "build once, run anywhere" mechanism
 * behind the Docker image's `/config.js`. Tests used to reach for `vi.stubEnv`
 * instead, which works in Node because `import.meta.env` is an object there. In a
 * real browser it does nothing: Vite has already replaced every
 * `import.meta.env.VITE_X` with a string literal in the bundle under test. A test
 * that stubs it appears to configure the app and does not, and the app then falls
 * through to whatever the machine's environment happens to be — which is how
 * `apiClient.test.ts` started reaching the live control plane.
 *
 * So: set the same object `/config.js` sets, then re-run `initConfig()` so the
 * config singleton picks it up.
 */
export function setRuntimeEnv(values: Record<string, string>): void {
  window.__ENV__ = { ...values }
}

/** Drop the runtime overrides, back to whatever the bundle was built with. */
export function clearRuntimeEnv(): void {
  delete window.__ENV__
}

/**
 * `initConfig()` takes the control-plane path unless `VITE_CONTROL_PLANE_URL` is
 * an EXPLICIT empty string, and that path fetches
 * `api.semantius.cloud/organization/<subdomain>` — a real request, from a test,
 * for an org named after whatever host Vitest is serving on.
 *
 * A single space is what expresses "self-hosted" here, and it is not a trick to
 * be tidied away: `runtimeEnv()` treats an empty string as ABSENT (that is how a
 * blank line in `docker/.env` falls back to the build-time value), so `''` cannot
 * mean `''`. `config.ts` trims before testing, so `' '` survives the accessor and
 * arrives as the empty string the opt-out is spelled with.
 *
 * The same gap is a real defect outside the tests: an operator running the
 * SPA-only image with `VITE_CONTROL_PLANE_URL=` in `docker/.env` — which is what
 * `docker/.env.example` ships — gets the control plane anyway, because the empty
 * value falls back to the built-in `https://app.semantius.com` default. Fixing
 * that is a product decision about what "unset" should mean, not a test change.
 */
export const SELF_HOSTED = ' '

export interface AppConfigOptions {
  baseUrl?: string
  type?: string
  supabaseApiKey?: string
}

/**
 * Configure the app for an API test and re-initialize the config singleton, on
 * the self-hosted path so nothing leaves the machine.
 */
export async function configureApp(options: AppConfigOptions = {}): Promise<void> {
  const { baseUrl = 'https://api.example.com', type = '', supabaseApiKey = '' } = options

  setRuntimeEnv({
    VITE_CONTROL_PLANE_URL: SELF_HOSTED,
    VITE_API_BASE_URL: baseUrl,
    VITE_API_TYPE: type,
    VITE_SUPABASE_APIKEY: supabaseApiKey,
  })
  await initConfig()
}
