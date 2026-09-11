#!/usr/bin/env node
/**
 * Talking to a translate target from a script.
 *
 * The scripts that read or write a language somewhere other than this checkout
 * (`translate --target`, `import --target`, `export`) need the same things: a
 * base url, a bearer token where the target wants one, and the two calls of
 * the contract (`i18n-endpoint-spec.md`):
 *
 *   GET  {base}/translations?locale=de-DE   -> the record, a flat map
 *   POST {base}/translations                { locale, key, translation }
 *
 * THREE WAYS TO NAME THE TARGET, decided by what is given:
 *
 *   --target <url>   any host answering the contract: a stage host, a dev
 *                    server, the app's own API. No token unless SEMANTIUS_TOKEN
 *                    is set.
 *   control plane    no --target: VITE_CONTROL_PLANE_ORG + SEMANTIUS_API_KEY.
 *                    The org is looked up (`api.semantius.cloud/organization/
 *                    <org>`) for its `postgrest_url` and the API key is
 *                    exchanged for a token — the same two steps
 *                    `scripts/a11y-audit/run.mjs` takes. That is the `prod`
 *                    target: the tenant's own record store.
 *   self-hosted      SEMANTIUS_TOKEN + --target (or SEMANTIUS_API_URL). There is
 *                    no control plane to ask, so the operator supplies both.
 *
 * The scripts run under bare `node`, so this file is plain ESM with no
 * dependencies. The control-plane path needs the REPO ROOT's `.env`, which is
 * why none of these are package scripts (those run from `apps/web`, where that
 * file is not).
 */

/** Read `--flag value` out of an argv slice. */
export function argValue(argv, flag) {
  const at = argv.indexOf(flag)
  return at === -1 ? undefined : argv[at + 1]
}

function stripSlash(url) {
  return url.replace(/\/+$/, '')
}

/**
 * Resolve the target's base url and, where one applies, a bearer token.
 *
 * Throws with a message naming the missing variable rather than failing later
 * inside a request: a script that has to be run under `dotenvx` should say so
 * the moment it is not.
 */
export async function connectTarget(argv = []) {
  const explicitUrl = argValue(argv, '--target') ?? process.env.SEMANTIUS_API_URL
  const explicitToken = process.env.SEMANTIUS_TOKEN

  if (explicitUrl) {
    return { baseUrl: stripSlash(explicitUrl), token: explicitToken }
  }
  if (explicitToken) {
    throw new Error('SEMANTIUS_TOKEN is set but no target url — pass --target or set SEMANTIUS_API_URL.')
  }

  const org = process.env.VITE_CONTROL_PLANE_ORG
  const apiKey = process.env.SEMANTIUS_API_KEY
  if (!org || !apiKey) {
    throw new Error(
      'No translate target. Either --target <url>, or SEMANTIUS_API_KEY + VITE_CONTROL_PLANE_ORG (run under ' +
        '`dotenvx run --quiet -- node …` from the repo root) for the tenant, or SEMANTIUS_TOKEN + --target for a ' +
        'self-hosted deployment.',
    )
  }

  const baseUrl = await lookupPostgrestUrl(org)
  const token = await mintToken(org, apiKey)
  return { baseUrl, token }
}

async function lookupPostgrestUrl(org) {
  const url = `https://api.semantius.cloud/organization/${encodeURIComponent(org)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tenant lookup failed: ${res.status} ${res.statusText} (${url})`)
  const tenant = await res.json()
  if (!tenant.postgrest_url) throw new Error(`tenant ${org} has no postgrest_url`)
  return stripSlash(tenant.postgrest_url)
}

async function mintToken(org, apiKey) {
  const url = `https://${org}.semantius.cloud/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-key': apiKey },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${res.statusText} (${url})`)
  const { access_token } = await res.json()
  if (!access_token) throw new Error('token exchange returned no access_token')
  return access_token
}

function headersFor(conn) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}),
  }
}

/** PostgREST's own codes for a relation or function that is not there. */
export const ABSENT_CODES = new Set(['42P01', 'PGRST202', 'PGRST205'])

/**
 * The record for `locale`. Answers `{ record, absent }` rather than throwing on
 * a definitive "no such table", because a script often has to tell "the
 * target has no record store" (a deployment without the endpoint) from
 * "something went wrong", and only the BODY's code says which.
 */
export async function readRecord(conn, locale) {
  const res = await fetch(`${conn.baseUrl}/translations?locale=${encodeURIComponent(locale)}`, {
    headers: headersFor(conn),
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const code = body && typeof body === 'object' ? body.code : undefined
    if (ABSENT_CODES.has(code)) return { record: null, absent: true }
    throw new Error(`GET /translations failed: ${res.status} ${JSON.stringify(body)}`)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('GET /translations did not answer a record')
  }
  return { record: body, absent: false }
}

/** Write one message. Throws with the target's own message when it refuses. */
export async function writeMessage(conn, message) {
  const res = await fetch(`${conn.baseUrl}/translations`, {
    method: 'POST',
    headers: headersFor(conn),
    body: JSON.stringify(message),
  })
  if (res.ok) return
  const text = await res.text()
  throw new Error(`POST /translations failed: ${res.status} ${text}`)
}

/** The message a script prints when the target has no record store. */
export const TARGET_ABSENT_MESSAGE =
  'The target has no translation records: its API does not answer `/translations`. Translations live in the ' +
  'language files only until it does.'
