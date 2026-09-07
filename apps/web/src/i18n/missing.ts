/**
 * What the running app could not translate, recorded as work.
 *
 * Three kinds of text go missing for three different reasons, and only one of
 * them can be found by reading the repo:
 *
 *   message   a code string with no catalog entry — the extractor lists these,
 *             so the collector is a backstop rather than the discovery path
 *   label     a table, column, enum or module label — MODEL DATA, invisible to
 *             any extractor; the inventory (./labelInventory.ts) is the primary
 *             path and this is what notices the ones a user actually meets
 *   server /  a PostgREST, RPC or model-rule message — the app cannot know these
 *   rule      in advance AT ALL. Nothing but meeting one reveals it exists.
 *
 * Every miss becomes an empty-translation row in `ui_translations`, which is the
 * queue `scripts/i18n/translate.mjs` drains. The point is that nobody has to
 * notice: a German user hitting an untranslated backend error at 3am leaves a
 * row with their id, the time and the route it happened on.
 *
 * OPT-IN. `enableCollector()` is called once from main.tsx; the test setup never
 * calls it, so the suite's real API errors never write rows to the tenant.
 */

import { i18n } from '@lingui/core'
import type { EntityMetadata } from '@/types/metadata'
import {
  COLUMN_LABEL_ATTRIBUTES,
  SOURCE_LANGUAGE,
  columnLabelKey,
  currentLanguage,
  enumLabelKey,
  scopedId,
  splitMessageId,
  tableLabelKey,
  type TranslationMap,
  type TranslationScope,
} from './catalog'
import { setDynamicMissReporter, setLabelMissReporter, type DynamicOptions } from './index'

/** One thing the app failed to translate, as the table stores it. */
export interface MissRecord {
  locale: string
  scope: TranslationScope
  key: string
  context: string
  translation: ''
  origin?: string
}

/**
 * A key longer than this is data, not a message. Server text embeds row values
 * ("duplicate key value violates unique constraint … (id)=(41293)"), and a queue
 * full of those is a queue nobody reads.
 */
const MAX_KEY_LENGTH = 500

/** How long to gather before sending. One page load is one or two requests. */
const FLUSH_DELAY_MS = 3000

/** Well under the 64 KB a `keepalive` body is allowed. */
const MAX_BATCH = 100

/** Where the requests go when the tenant has no table (see `disableTenantSink`). */
const LOCAL_REQUESTS_PREFIX = 'semantius-i18n-requests:'

/**
 * PostgREST's own "this relation does not exist" codes. A 404 or a 400 alone
 * proves nothing — a cold start answers a bare 404 and the fetch interceptor
 * retries it — so only a DEFINITIVE body turns the tenant sink off.
 */
const TABLE_ABSENT_CODES = new Set(['42P01', 'PGRST205', 'PGRST202'])

let enabled = false
/** Ids already sent or queued this session, so a repeat costs nothing. */
const seen = new Set<string>()
let pending: MissRecord[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
let tenantSinkAvailable = true
let unsubscribeMissing: (() => void) | undefined

/**
 * Start collecting. Idempotent — StrictMode and a re-boot both re-enter it.
 *
 * The `message` scope is wired to Lingui's own `missing` event rather than
 * wrapping `t()`: Lingui emits it from inside `_()` exactly when the id is not
 * in the active catalog, which is the same condition a wrapper would have to
 * re-derive, and it covers `<Trans>` too.
 */
export function enableCollector(): void {
  if (enabled) return
  enabled = true
  setDynamicMissReporter(reportDynamicMiss)
  setLabelMissReporter(recordMetadataMisses)
  unsubscribeMissing = i18n.on('missing', ({ id, locale }) => {
    // The SOURCE language is never missing anything: its "catalog" is the
    // English in the code, so every id legitimately has no entry and recording
    // them would enqueue the entire app on every English page load.
    if (locale === SOURCE_LANGUAGE) return
    const { message, context } = splitMessageId(id)
    record({ scope: 'message', key: message, context })
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
}

/** Stop collecting and drop anything not yet sent. For tests and teardown. */
export function disableCollector(): void {
  enabled = false
  setDynamicMissReporter(undefined)
  setLabelMissReporter(undefined)
  unsubscribeMissing?.()
  unsubscribeMissing = undefined
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  clearTimeout(flushTimer)
  flushTimer = undefined
  pending = []
  seen.clear()
  tenantSinkAvailable = true
}

/** Whether the collector is running — read by translate mode and by tests. */
export function collectorEnabled(): boolean {
  return enabled
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') void flush()
}

/**
 * Record one miss, if it is worth recording.
 *
 * Label and message misses are pointless in the source language — nothing is
 * missing there, the English IS the source — while `server` and `rule` misses
 * are recorded in EVERY language including `en-US`, because a backend message is
 * authored in the tenant's own language and may not be English at all.
 */
function record(miss: { scope: TranslationScope; key: string; context?: string; origin?: string }): void {
  if (!enabled) return
  const locale = currentLanguage()
  const isRuntimeText = miss.scope === 'server' || miss.scope === 'rule'
  if (!isRuntimeText && locale === SOURCE_LANGUAGE) return

  const key = miss.key
  if (!key || key.length > MAX_KEY_LENGTH) return

  const context = miss.context ?? ''
  // NUL-separated: any printable separator could occur inside a server
  // message, and a collision there would silently drop a real miss.
  const id = [locale, miss.scope, key, context].join('\u0000')
  if (seen.has(id)) return
  seen.add(id)

  pending.push({
    locale,
    scope: miss.scope,
    key,
    context,
    translation: '',
    origin: miss.origin ?? currentOrigin(),
  })
  scheduleFlush()
}

/** The route the app was on. Good enough to find the screen again. */
function currentOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.pathname
}

function reportDynamicMiss(text: string, scope: 'server' | 'rule', options: DynamicOptions): void {
  // ONLY a message the SERVER produced. An error the app threw itself carries no
  // PostgREST code, and its wording is already a catalog message — recording it
  // would put the app's own translated German back into the tenant as untranslated
  // "server" text. `useTable`, `callRpc` and the mutations all attach the body's
  // `code` to `error.cause`, which is where the caller reads this from.
  if (scope === 'server' && !options.code) return
  record({ scope, key: text, origin: options.origin })
}

/**
 * Record every label of `metadata` the active language does not override.
 *
 * Called from `useLocalizedMetadata`, which is the one place a whole entity's
 * labels pass through — so opening a table in German enqueues exactly that
 * table's untranslated labels, with the route as their origin. The whole-model
 * picture comes from the inventory (./labelInventory.ts) instead; this is the
 * "what someone actually looked at" half.
 */
export function recordMetadataMisses(metadata: EntityMetadata, labels: TranslationMap): void {
  if (!enabled) return
  const table = metadata.table?.table_name
  if (!table || currentLanguage() === SOURCE_LANGUAGE) return

  const missing = (scope: 'table' | 'column' | 'enum', key: string, source: string | undefined) => {
    if (!source) return
    if (labels[scopedId(scope, key)]) return
    record({ scope, key })
  }

  missing('table', tableLabelKey(table, 'singular_label'), metadata.table?.singular_label)
  missing('table', tableLabelKey(table, 'plural_label'), metadata.table?.plural_label)

  for (const [field, property] of Object.entries(metadata.properties ?? {})) {
    // Only the attributes a screen actually shows. `description` and the parent
    // labels are in the inventory; enqueuing every one of them per table visit
    // is how a queue stops being read.
    missing('column', columnLabelKey(table, field, COLUMN_LABEL_ATTRIBUTES[0]), property.title)
    for (const value of property.enum ?? []) {
      missing('enum', enumLabelKey(table, field, value), value)
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  if (pending.length >= MAX_BATCH) {
    void flush()
    return
  }
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flush()
  }, FLUSH_DELAY_MS)
}

/**
 * Send what has been collected. Exported so a test can await it instead of
 * waiting out the debounce.
 *
 * A write is NEVER retried by the transport (see lib/retry.ts) and does not need
 * to be: the insert is idempotent by `on_conflict`, and a request that is lost
 * is re-made the next time anyone meets the same string.
 */
export async function flush(): Promise<void> {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (pending.length === 0) return

  const batch = pending.slice(0, MAX_BATCH)
  pending = pending.slice(MAX_BATCH)

  if (!tenantSinkAvailable) {
    storeLocally(batch)
    if (pending.length > 0) scheduleFlush()
    return
  }

  try {
    // A RELATIVE url on purpose: the interceptor in lib/apiClient.ts is what
    // puts the API base and the bearer token on it. `ignore-duplicates` is the
    // safety property — a request can never overwrite an existing translation,
    // so the collector cannot undo a translator's work.
    const response = await fetch('/ui_translations?on_conflict=locale,scope,key,context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
      // The last batch of a closing tab is the one worth having: it is the
      // session where somebody hit something nobody has seen before.
      keepalive: true,
    })
    if (!response.ok) await handleWriteFailure(response, batch)
  } catch {
    // Offline, or a tab tearing down mid-request. The ids stay in `seen` for
    // this session; the next session records them again.
  }

  if (pending.length > 0) scheduleFlush()
}

async function handleWriteFailure(response: Response, batch: MissRecord[]): Promise<void> {
  let code: unknown
  try {
    const body: unknown = await response.clone().json()
    if (body && typeof body === 'object') code = (body as Record<string, unknown>).code
  } catch {
    // A body that is not JSON says nothing definitive — keep the sink.
  }
  if (typeof code === 'string' && TABLE_ABSENT_CODES.has(code)) {
    // The deployment has no ui_translations table. Not an error to report: the
    // feature simply is not installed there, and the requests belong somewhere
    // a translator can still find them.
    tenantSinkAvailable = false
    storeLocally(batch)
  }
}

/**
 * The fallback store, per language, for a deployment with no tenant table.
 *
 * Bounded and best-effort: `localStorage` is a browser's own quota and a
 * translation request must never be the thing that fills it.
 */
function storeLocally(batch: MissRecord[]): void {
  for (const locale of new Set(batch.map((entry) => entry.locale))) {
    try {
      const key = LOCAL_REQUESTS_PREFIX + locale
      const existing = localRequests(locale)
      const merged = [...existing]
      for (const entry of batch.filter((row) => row.locale === locale)) {
        if (merged.some((row) => row.scope === entry.scope && row.key === entry.key && row.context === entry.context)) {
          continue
        }
        merged.push(entry)
      }
      localStorage.setItem(key, JSON.stringify(merged.slice(-MAX_BATCH * 5)))
    } catch {
      /* storage blocked or full — the request is simply not kept */
    }
  }
}

/** What was recorded locally for `locale`. Read by the translate-mode panel. */
export function localRequests(locale: string): MissRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_PREFIX + locale)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as MissRecord[]) : []
  } catch {
    return []
  }
}
