#!/usr/bin/env node
/**
 * Talking to a tenant's PostgREST from a script.
 *
 * Every tenant-facing i18n script (`status --tenant`, `labels`, `translate`,
 * `import`, `export`) needs the same three things: the API base URL, a bearer
 * token, and paging. They are here so a change to how a tenant is reached lands
 * once.
 *
 *   dotenvx run --quiet -- node apps/web/scripts/i18n/<script>.mjs --locale de-DE
 *
 * TWO WAYS IN, and which one applies is decided by the environment rather than
 * by a flag:
 *
 *   control plane   VITE_CONTROL_PLANE_ORG + SEMANTIUS_API_KEY. The org is
 *                   looked up (`api.semantius.cloud/organization/<org>`) for its
 *                   `postgrest_url` and the API key is exchanged for a token —
 *                   the same two steps `scripts/a11y-audit/run.mjs` takes.
 *   self-hosted     SEMANTIUS_TOKEN + `--api-url` (or SEMANTIUS_API_URL). There
 *                   is no control plane to ask, so the operator supplies both.
 *
 * The scripts run under bare `node`, so this file is plain ESM with no
 * dependencies. It needs the REPO ROOT's `.env`, which is why none of these are
 * package scripts (those run from `apps/web`, where that file is not).
 */

/** Read `--flag value` out of an argv slice. */
export function argValue(argv, flag) {
  const at = argv.indexOf(flag)
  return at === -1 ? undefined : argv[at + 1]
}

/**
 * Resolve the tenant's PostgREST base URL and a bearer token.
 *
 * Throws with a message naming the missing variable rather than failing later
 * inside a request: a script that has to be run under `dotenvx` should say so
 * the moment it is not.
 */
export async function connectTenant(argv = []) {
  const explicitUrl = argValue(argv, '--api-url') ?? process.env.SEMANTIUS_API_URL
  const explicitToken = process.env.SEMANTIUS_TOKEN

  if (explicitToken) {
    if (!explicitUrl) {
      throw new Error('SEMANTIUS_TOKEN is set but no API url — pass --api-url or set SEMANTIUS_API_URL.')
    }
    return { apiUrl: stripSlash(explicitUrl), token: explicitToken }
  }

  const org = process.env.VITE_CONTROL_PLANE_ORG
  const apiKey = process.env.SEMANTIUS_API_KEY
  if (!org || !apiKey) {
    throw new Error(
      'No tenant credentials. Either SEMANTIUS_API_KEY + VITE_CONTROL_PLANE_ORG (run under ' +
        '`dotenvx run --quiet -- node …` from the repo root), or SEMANTIUS_TOKEN + --api-url for a ' +
        'self-hosted deployment.',
    )
  }

  const apiUrl = explicitUrl ? stripSlash(explicitUrl) : await lookupPostgrestUrl(org)
  const token = await mintToken(org, apiKey)
  return { apiUrl, token }
}

function stripSlash(url) {
  return url.replace(/\/+$/, '')
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

/**
 * A PostgREST request. Returns `{ ok, status, body, code }` rather than throwing
 * on a non-2xx, because a script often has to tell "the table is not there"
 * (`PGRST205`, a deployment without the migration) from "something went wrong",
 * and only the BODY's code says which.
 */
export async function pgrest(conn, path, init = {}) {
  const res = await fetch(`${conn.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${conn.token}`,
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  const code = body && typeof body === 'object' && !Array.isArray(body) ? body.code : undefined
  return { ok: res.ok, status: res.status, body, code, headers: res.headers }
}

/** PostgREST's own codes for a relation or function that is not there. */
export const ABSENT_CODES = new Set(['42P01', 'PGRST202', 'PGRST205'])

/**
 * Read a whole table, a page at a time.
 *
 * PostgREST caps a response at its own `max-rows` whatever `limit` asks for, so
 * paging is by OFFSET until a short page comes back — never by trusting the
 * requested limit.
 */
export async function readAll(conn, table, query, pageSize = 1000) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const sep = query ? '&' : ''
    const result = await pgrest(conn, `/${table}?${query}${sep}limit=${pageSize}&offset=${offset}`)
    if (!result.ok) {
      if (ABSENT_CODES.has(result.code)) return { rows: null, absent: true, result }
      throw new Error(`GET /${table} failed: ${result.status} ${JSON.stringify(result.body)}`)
    }
    const page = Array.isArray(result.body) ? result.body : []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return { rows, absent: false }
}

/** The queue and the layer both live in this table. */
export const TRANSLATIONS_TABLE = 'ui_translations'

/**
 * Upsert translations, in batches.
 *
 * `merge-duplicates` because this IS the writer: a translator's import replaces
 * what is there. The collector's own insert is the opposite (`ignore-duplicates`)
 * so a request can never overwrite a translation — see src/i18n/missing.ts.
 */
export async function upsertTranslations(conn, rows, batchSize = 200) {
  let written = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const result = await pgrest(conn, `/${TRANSLATIONS_TABLE}?on_conflict=locale,scope,key,context`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    })
    if (!result.ok) {
      if (ABSENT_CODES.has(result.code)) return { written, absent: true }
      throw new Error(`POST /${TRANSLATIONS_TABLE} failed: ${result.status} ${JSON.stringify(result.body)}`)
    }
    written += batch.length
  }
  return { written, absent: false }
}

/** The message a script prints when the platform migration has not been applied. */
export const TABLE_ABSENT_MESSAGE =
  `The tenant has no \`${TRANSLATIONS_TABLE}\` table. It is created by the platform migration ` +
  '(see the "Tenant translations" section of the root README); until it is applied, translations ' +
  'live in the repo catalogs and in operator deployment files only.'
