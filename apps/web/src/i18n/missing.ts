/**
 * Discovery: the running app records every string it renders.
 *
 * A code message and a metadata message are recorded the same way, and so is
 * a server error's template: the app renders it, and the key with its source
 * lands in `en-US.json` — the complete baseline a new language is started from
 * — and, when the active language does not know the key at all, as an empty
 * entry in that language's file. There is no second mechanism and no committed
 * model snapshot: adding a field to an entity produces a string that appears
 * in the file, the diff and the PR the moment a screen renders it.
 *
 * Both writes go through the one endpoint (`./translateTarget.ts`), and only
 * where the target's MODE discovers — `dev` and `stage`. In `prod` discovery
 * is the on-screen marking: a translator finds untranslated text by looking,
 * and Alt+clicks it. Under `off` nothing is recorded.
 *
 * What it does NOT do: overwrite. The index entry is written only when the
 * index lacks the key or records a different source (the only way to notice
 * that a label was reworded from "City" to "Delivery city" while its German
 * still says "Stadt"); the language entry only when the language's file does
 * not mention the key at all. `details` never enters — a stack trace as a key
 * would mint an entry per unique trace.
 *
 * OPT-IN. `enableCollector()` is called from main.tsx after the config and
 * from the browser test setup; a pure function test never records.
 */

import { i18n } from '@lingui/core'
import { SOURCE_LANGUAGE, currentLanguage, isKnownKey, markKnownKey } from './catalog'
import { addSourceIndexEntry, loadSourceIndex } from './store'
import { setRenderReporter } from './translate'
import { discoveryEnabled, writeTranslation } from './translateTarget'

/**
 * A key longer than this is data, not a message. Server text embeds row values
 * ("duplicate key value violates unique constraint … (id)=(41293)"), and an
 * index full of those is an index nobody reads.
 */
const MAX_KEY_LENGTH = 500

/** How long to gather before sending. One page load is one or two flushes. */
const FLUSH_DELAY_MS = 3000

interface Pending {
  /** The source, once a producer supplied one; `<Trans>` reports only the id, which is its source. */
  source?: string
  /** The language that was active when the key rendered. */
  locale: string
}

let enabled = false
/** Keys already seen this session, so a repeat costs nothing. */
const pending = new Map<string, Pending>()
const seen = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined
let flushing: Promise<void> | undefined
let unsubscribeMissing: (() => void) | undefined

/**
 * Start recording. Idempotent — StrictMode and a re-boot both re-enter it. A
 * no-op where the mode does not discover.
 *
 * Two producers feed it: `translate()` and `translateVerbatim()` report every
 * render with its source, and Lingui's own `missing` event covers `<Trans>`,
 * which renders through Lingui directly — its id IS its source.
 */
export function enableCollector(): void {
  if (enabled || !discoveryEnabled()) return
  enabled = true
  setRenderReporter(record)
  unsubscribeMissing = i18n.on('missing', ({ id }) => record(id))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  void loadSourceIndex()
}

/** Stop collecting and drop anything not yet sent. For tests and teardown. */
export function disableCollector(): void {
  enabled = false
  setRenderReporter(undefined)
  unsubscribeMissing?.()
  unsubscribeMissing = undefined
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  clearTimeout(flushTimer)
  flushTimer = undefined
  pending.clear()
  seen.clear()
}

/** Whether the collector is running — read by tests. */
export function collectorEnabled(): boolean {
  return enabled
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') void flush({ keepalive: true })
}

function record(id: string, source?: string): void {
  if (!enabled || !id || id.length > MAX_KEY_LENGTH) return
  const existing = pending.get(id)
  if (existing) {
    // Lingui's `missing` fires inside `_()` BEFORE the producer reports, with
    // the id alone; the producer's report is the one that knows the source.
    if (source && !existing.source) existing.source = source
    return
  }
  if (seen.has(id)) return
  seen.add(id)
  pending.set(id, { source, locale: currentLanguage() })
  scheduleFlush()
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flush()
  }, FLUSH_DELAY_MS)
}

/**
 * Send what has been collected. Exported so a test can await it instead of
 * waiting out the debounce. One message per write, index first: the target
 * keeps an empty language entry only for a key its index knows.
 */
export function flush(options: { keepalive?: boolean } = {}): Promise<void> {
  if (flushing) return flushing
  flushing = sendPending(options).finally(() => {
    flushing = undefined
  })
  return flushing
}

async function sendPending(options: { keepalive?: boolean }): Promise<void> {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (pending.size === 0) return
  const batch = [...pending]
  pending.clear()
  // The target may have moved since the collector was enabled (a test that
  // re-ran `initConfig()` with its own environment); a mode that does not
  // discover has nowhere to send this, and says nothing.
  if (!discoveryEnabled()) return

  let index: ReadonlyMap<string, string>
  try {
    index = await loadSourceIndex()
  } catch {
    return
  }

  for (const [id, entry] of batch) {
    const source = entry.source ?? id
    try {
      if (index.get(id) !== source) {
        await writeTranslation({ locale: SOURCE_LANGUAGE, key: id, translation: source }, options)
        addSourceIndexEntry(id, source)
      }
      // Only for the language that is still active: `isKnownKey` answers for
      // that one, and a key rendered under a language since switched away from
      // is recorded again the next time it renders there.
      if (entry.locale !== SOURCE_LANGUAGE && entry.locale === currentLanguage() && !isKnownKey(id)) {
        await writeTranslation({ locale: entry.locale, key: id, translation: '' }, options)
        markKnownKey(id)
      }
    } catch (err) {
      // Offline, or a tab tearing down mid-request. The id stays in `seen` for
      // this session; the next session records it again.
      console.warn('[i18n] discovery could not record', id, err)
      return
    }
  }
}
