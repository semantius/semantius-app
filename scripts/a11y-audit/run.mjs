#!/usr/bin/env node
/**
 * Tier 3 — the route × viewport × theme accessibility audit.
 *
 *   dotenvx run -- node scripts/a11y-audit/run.mjs --url https://<preview>.workers.dev
 *
 * Runs against a DEPLOYED build, in a real browser, signed in with a real token.
 * That is the point: jsdom loads no CSS, so `sr-only` is invisible to it, contrast
 * has nothing to measure, and axe's own `bypass` rule passes a page with no skip
 * link. None of what this checks can be checked in a unit test.
 *
 * Output is keyed by SUCCESS CRITERION, not by route (see report.mjs), and lands
 * as a committed JSON artifact so the delta between two runs is reviewable.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Browser } from './browser.mjs'
import {
  ADMISSIBILITY,
  AXE,
  CONTROL_CONTRAST,
  FOCUS_OBSCURED,
  OVERFLOW,
  PLACEHOLDER_CONTRAST,
  STRUCTURE,
  TAB_ORDER,
} from './probes.mjs'
import { EXCLUDED, THEMES, VIEWPORTS, resolveRoutes } from './routes.mjs'
import { buildReport, formatSummary } from './report.mjs'
import { CRITERIA, tagToCriterion } from './criteria.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

function parseArgs(argv) {
  const out = { viewports: null, themes: null, routes: null, out: 'a11y-reports', screenshots: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') out.url = argv[++i]
    else if (a === '--token') out.token = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--label') out.label = argv[++i]
    else if (a === '--viewports') out.viewports = argv[++i].split(',')
    else if (a === '--themes') out.themes = argv[++i].split(',')
    else if (a === '--routes') out.routes = argv[++i].split(',')
    else if (a === '--screenshots') out.screenshots = true
    else if (a === '--help') out.help = true
  }
  return out
}

async function mintToken() {
  const apiKey = process.env.SEMANTIUS_API_KEY
  const orgSlug = process.env.VITE_CONTROL_PLANE_ORG
  if (!apiKey || !orgSlug) {
    throw new Error(
      'SEMANTIUS_API_KEY / VITE_CONTROL_PLANE_ORG are not set — run this under `dotenvx run --`',
    )
  }
  const res = await fetch(`https://${orgSlug}.semantius.cloud/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-api-key': apiKey },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${res.statusText}`)
  const { access_token } = await res.json()
  if (!access_token) throw new Error('token exchange returned no access_token')
  return access_token
}

async function resolveApiBaseUrl() {
  const org = process.env.VITE_CONTROL_PLANE_ORG
  const res = await fetch(`https://api.semantius.cloud/organization/${encodeURIComponent(org)}`)
  if (!res.ok) throw new Error(`tenant lookup failed: ${res.status} ${res.statusText}`)
  const tenant = await res.json()
  if (!tenant.postgrest_url) throw new Error(`tenant ${org} has no postgrest_url`)
  return tenant.postgrest_url
}

/**
 * Which criteria axe actually examined, derived from the rules in its tag set.
 * Without this, "axe found nothing" and "axe never looked" are the same signal,
 * and the second one must not read as a pass.
 */
function axeCoverage() {
  const require = createRequire(import.meta.url)
  const axe = require(join(REPO_ROOT, 'apps/web/node_modules/axe-core/axe.js'))
  const wanted = new Set(['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22a', 'wcag22aa'])
  const ids = new Set()
  for (const rule of axe.getRules([...wanted])) {
    for (const tag of rule.tags ?? []) {
      const id = tagToCriterion(tag)
      if (id) ids.add(id)
    }
  }
  return [...ids].filter((id) => CRITERIA.some((c) => c.id === id))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Tokens from the client_credentials exchange last one hour (mint-token.mjs).
// 40 minutes leaves room for the slowest view to finish on the old token.
const REMINT_AFTER_MS = 40 * 60_000

// Waits between retries of a view that rendered a blocking surface. The last
// value is long enough for a one-minute rate-limit window to pass.
//
// The app now retries for itself — its fetch interceptor repeats a 429 or a
// cold-start 404 inside a ~10s budget (apps/web/src/lib/retry.ts) — so a
// blocking surface here means a failure that OUTLASTED that budget. These waits
// are for the rate-limit window behind it, which is longer than ten seconds;
// they are not a substitute for the app's retry and must not shrink to one.
const RETRY_BACKOFF_MS = [3_000, 10_000, 30_000, 60_000]

/**
 * Wait for the app to finish booting before measuring anything.
 *
 * `agent-browser open` resolves on the document `load` event, which for this SPA
 * is only the beginning: initConfig() fetches, the auth provider resolves, the
 * route loader runs, and only then does `hideAppLoader()` fire. On top of that
 * `hideAppLoader()` sets the terminal `hidden` attribute on `transitionend`, up
 * to 300ms after it starts. Probing before all that reports a page that is still
 * the boot skeleton — which is a real `cantTell`, not a clean page.
 */
async function waitForSettled(browser, { attempts = 40, intervalMs = 500, settleMs = 800 } = {}) {
  let last = { error: 'never probed' }
  for (let i = 0; i < attempts; i++) {
    last = browser.evalJson(ADMISSIBILITY)
    if (!last.error && last.loaderHidden && last.rootHasContent) {
      // Let lazily-mounted content (code-split views, grids) land before probing.
      await sleep(settleMs)
      return browser.evalJson(ADMISSIBILITY)
    }
    if (!last.error && last.bootFailure) return last
    await sleep(intervalMs)
  }
  return last
}

/**
 * One cheap request to the endpoint the app calls first, so a cold serverless
 * PostgREST is already awake when the page asks. Failures are ignored on
 * purpose — this is a warm-up, not a check.
 */
async function warmApi(apiBaseUrl, token) {
  try {
    await fetch(`${apiBaseUrl}/rpc/get_userinfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    })
  } catch {
    /* ignored */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.url) {
    console.log(
      'usage: node scripts/a11y-audit/run.mjs --url <deployed-url> [--token <jwt>]\n' +
        '       [--viewports 320,390] [--themes light,dark] [--routes index,settings]\n' +
        '       [--label before-contrast] [--screenshots] [--out a11y-reports]',
    )
    process.exit(args.help ? 0 : 1)
  }

  const baseUrl = args.url.replace(/\/+$/, '')
  let token = args.token ?? (await mintToken())
  let mintedAt = Date.now()
  const apiBaseUrl = await resolveApiBaseUrl()
  const { routes, resolution } = await resolveRoutes({ apiBaseUrl, token })

  const viewports = args.viewports
    ? VIEWPORTS.filter((v) => args.viewports.includes(v.name))
    : VIEWPORTS
  const themes = args.themes ?? THEMES
  const selected = args.routes ? routes.filter((r) => args.routes.includes(r.id)) : routes

  const coverage = axeCoverage()
  const axePath = join(REPO_ROOT, 'apps/web/node_modules/axe-core/axe.min.js')

  const browser = new Browser({ initScripts: [axePath] })
  const views = []
  const outDir = resolve(REPO_ROOT, args.out)
  mkdirSync(outDir, { recursive: true })
  const shotDir = join(outDir, 'screenshots')
  if (args.screenshots) mkdirSync(shotDir, { recursive: true })

  let index = 0
  const total = selected.length * viewports.length * themes.length

  try {
    // Warm the session before any `set` command: a viewport/media call with no
    // page open has nothing to apply to and times out waiting for one.
    browser.open(`${baseUrl}/#jwt=${token}`)

    for (const theme of themes) {
      browser.setMedia(theme)
      for (const viewport of viewports) {
        browser.setViewport(viewport.width, viewport.height)
        for (const route of selected) {
          index++
          const label = `${route.id} @ ${viewport.name} / ${theme}`
          process.stdout.write(`[${index}/${total}] ${label} ... `)

          // A token lives one hour and the full matrix takes longer than that at
          // ~20s a view, so a run that mints once ends in a tail of `cantTell`
          // views that measure the token, not the app (145 of 224 in one discarded
          // run). Re-mint well inside the hour; every view opens its own URL, so
          // the fresh token takes effect on the next navigation. A token handed
          // in with --token is the caller's to keep alive.
          if (!args.token && Date.now() - mintedAt > REMINT_AFTER_MS) {
            token = await mintToken()
            mintedAt = Date.now()
            process.stdout.write('(token re-minted) ')
          }
          // The token rides in the hash, never the query string: a fragment is
          // not sent to the server and so cannot be logged. devUrlToken.ts reads
          // it, seeds storage and strips it.
          const url = `${baseUrl}${route.path}#jwt=${token}`
          let opened
          let admissibility
          let pageErrors
          // Retried, and only for a blocking surface: a failure the app's own
          // retry budget (~10s, lib/retry.ts) did not outlast — the identity
          // provider's rate-limit window is longer than that. A later navigation
          // usually resolves it; if it does not, the view stays `cantTell`,
          // which is still not a pass. Anything else — a real page error, the
          // wrong theme — is not retried, because a retry would only hide it.
          for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length + 1; attempt++) {
            // Wake the tenant API from Node first. Its serverless PostgREST
            // answers the first request after an idle period with a 404 rather
            // than a 5xx or a wait. The app retries that now, but a cold start
            // can take longer than its budget; warming from here costs one
            // request and keeps the audit measuring pages instead of cold
            // starts, which is not what it is here to measure.
            await warmApi(apiBaseUrl, token)
            browser.errors({ clear: true })
            opened = browser.open(url)
            admissibility = await waitForSettled(browser)
            pageErrors = browser.errors()
            if (!admissibility.error && !admissibility.bootFailure) break
            // Distinguish "the app is broken" from "the driver is broken". Only
            // the second is worth recovering from, and it has to be recovered
            // from, or every remaining view inherits a dead session.
            if (Browser.isSessionFailure(admissibility) || !opened.ok) {
              browser.restart()
              browser.setMedia(theme)
              browser.setViewport(viewport.width, viewport.height)
            }
            // Growing, because the second cause of a blocking surface is the
            // identity provider rate-limiting userinfo (429) when pages load
            // every few seconds; a fixed 1.5s retry just re-asks inside the same
            // window and then poisons the next views too.
            await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS.at(-1))
          }

          const reasons = []
          if (!opened.ok) reasons.push('navigation failed')
          if (admissibility.error) reasons.push(`admissibility probe failed: ${admissibility.error}`)
          if (!admissibility.error) {
            if (!admissibility.loaderHidden) reasons.push('boot overlay never came down')
            if (admissibility.bootFailure) reasons.push(`blocking surface rendered: ${admissibility.bootFailureReason}`)
            if (!admissibility.rootHasContent) reasons.push('#root is empty')
            // Assert the theme actually switched. An audit that silently measures
            // light twice reports dark as clean without ever rendering it.
            if ((theme === 'dark') !== admissibility.darkClass) {
              reasons.push(`theme did not apply (wanted ${theme}, .dark=${admissibility.darkClass})`)
            }
            if (route.id === 'not-found' && !/not found/i.test(admissibility.title ?? '')) {
              // Canary: the 404 route must actually render the 404 page rather
              // than silently resolving to something else.
              if (!admissibility.title) reasons.push('404 canary: no title')
            }
          }
          if (pageErrors.length > 0) {
            reasons.push(`${pageErrors.length} uncaught page error(s)`)
          }

          const measured = reasons.length === 0
          const view = {
            route,
            viewport,
            theme,
            measured,
            cantTellReasons: reasons,
            pageErrors: pageErrors.slice(0, 5),
            structure: measured ? browser.evalJson(STRUCTURE) : null,
          }

          if (measured) {
            view.axe = browser.evalJson(AXE)
            view.axeCoverage = coverage
            view.overflow = browser.evalJson(OVERFLOW)
            view.placeholder = browser.evalJson(PLACEHOLDER_CONTRAST)
            view.controls = browser.evalJson(CONTROL_CONTRAST)
            view.focusObscured = browser.evalJson(FOCUS_OBSCURED)
            view.tabOrder = browser.evalJson(TAB_ORDER)
            if (args.screenshots) {
              browser.screenshot(join(shotDir, `${route.id}-${viewport.name}-${theme}.png`))
            }
          }

          views.push(view)
          const axeCount = view.axe?.violations?.length ?? 0
          process.stdout.write(
            measured ? `ok (${axeCount} axe violation${axeCount === 1 ? '' : 's'})\n` : `cantTell: ${reasons.join('; ')}\n`,
          )
        }
      }
    }
  } finally {
    browser.close()
  }

  const report = buildReport({
    meta: {
      url: baseUrl,
      label: args.label ?? null,
      resolution,
      viewports: viewports.map((v) => v.name),
      themes,
      routes: selected.map((r) => ({ id: r.id, path: r.path })),
      excluded: EXCLUDED,
    },
    views,
  })

  const stamp = report.meta.generatedAt.replace(/[-:]/g, '').replace(/\..+/, '')
  const name = args.label ? `${stamp}-${args.label}` : stamp
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(report, null, 2))
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2))

  const summary = formatSummary(report)
  writeFileSync(join(outDir, `${name}.txt`), summary)
  console.log('\n' + summary)
  console.log(`\nartifact: ${join(outDir, `${name}.json`)}`)

  process.exit(report.summary.pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
