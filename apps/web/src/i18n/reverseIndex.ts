/**
 * The render-time reverse index: rendered text -> the ids that produced it.
 *
 * Translate mode has to answer one question about anything on the screen:
 * "which translation is this?" The DOM cannot say — a text node is just
 * characters, and an `aria-label` is just a string — so the answer is recorded
 * at the moment the text is PRODUCED. `translate()`, the label helpers and
 * `translateDynamic()` each hand their output here together with the runtime
 * id it came from, and the highlighter and the click handler look the DOM's
 * text back up in this map.
 *
 * Exact, not fuzzy: the key is the rendered string, interpolated values
 * included, so "Delete Orders?" resolves to `Delete {label}?` and "Delete
 * Customers?" resolves to the same id. Two ids can render identically (an
 * untranslated "View" the noun and "View" the verb), which is why the value is
 * a SET and the editor offers a choice.
 *
 * Off unless translate mode or marking is on. Every `t()` call in the app pays
 * one boolean check for it; the map itself only exists while somebody is
 * translating, and it is cleared whenever a locale is activated, because the
 * text it holds belongs to the language that was active when it was rendered.
 *
 * No DOM here, no React, no imports: it is a leaf like catalog.ts, so the
 * recording call sites (index.ts, labels.ts) stay free of translate mode.
 */

let recording = false
const idsByText = new Map<string, Set<string>>()
/** The SOURCE text of every id seen — the English a translator reads. */
const sourceById = new Map<string, string>()
/**
 * The values interpolated into a rendered string, per rendered string.
 *
 * A sentence built from a model label — "Add {label}" rendering as "Supplier
 * hinzufügen" — is ONE text node, so a lookup by rendered text finds only the
 * message, which is translated, while the untranslated part (the label) sits
 * inside it unreachable. Keeping the values lets the highlighter mark and the
 * click resolve the SEGMENT.
 *
 * Stored raw and resolved lazily, never resolved here: the value's own id may
 * be recorded after the sentence that embeds it (a component is free to render
 * in either order), and a lookup at scan time cannot be too early.
 */
const valuesByText = new Map<string, string[]>()

/**
 * Whitespace-normalize, because a text node carries the whitespace JSX left
 * around it and a rendered string does not.
 */
export function normalizeRenderedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Whether renders are being recorded at all. */
export function isRecordingRenders(): boolean {
  return recording
}

/**
 * Start or stop recording. Stopping also empties the index — a map of text the
 * user can no longer click on is only memory.
 */
export function setRecordingRenders(on: boolean): void {
  recording = on
  if (!on) clearReverseIndex()
}

/**
 * Record one render. `source` is the untranslated text (the message itself, the
 * model's own label, the server's message) — what the editor shows above the
 * translation field.
 */
export function recordRender(
  rendered: string,
  id: string,
  source: string,
  /** What was interpolated, so an embedded label stays reachable — see above. */
  values?: Record<string, unknown>,
): void {
  if (!recording) return
  const key = normalizeRenderedText(rendered)
  if (!key) return
  let ids = idsByText.get(key)
  if (!ids) {
    ids = new Set()
    idsByText.set(key, ids)
  }
  ids.add(id)
  if (!sourceById.has(id)) sourceById.set(id, source)

  if (!values) return
  const embedded: string[] = []
  for (const value of Object.values(values)) {
    // Only a string that is genuinely PART of the result: a number, a date or a
    // value the message reformatted is not text a translator can act on, and a
    // value equal to the whole rendering is the rendering itself.
    if (typeof value !== 'string' || !value.trim()) continue
    if (value === rendered || !rendered.includes(value)) continue
    if (!embedded.includes(value)) embedded.push(value)
  }
  if (embedded.length > 0) valuesByText.set(key, embedded)
}

/** One interpolated value inside a rendered string, and what produced it. */
export interface EmbeddedSegment {
  value: string
  ids: ReadonlySet<string>
}

/**
 * The interpolated values inside `text` that are themselves translatable,
 * resolved now rather than when the text was recorded.
 */
export function embeddedSegments(text: string): EmbeddedSegment[] {
  const values = valuesByText.get(normalizeRenderedText(text))
  if (!values) return []
  const out: EmbeddedSegment[] = []
  for (const value of values) {
    const ids = idsByText.get(normalizeRenderedText(value))
    if (ids && ids.size > 0) out.push({ value, ids })
  }
  return out
}

/** The ids that rendered exactly this text, or undefined when none did. */
export function resolveRenderedText(text: string): ReadonlySet<string> | undefined {
  return idsByText.get(normalizeRenderedText(text))
}

/** The source text recorded for `id`, if it has been rendered this session. */
export function renderedSourceOf(id: string): string | undefined {
  return sourceById.get(id)
}

/** Forget everything. Called by `activateLocale`, whose text is a new language's. */
export function clearReverseIndex(): void {
  idsByText.clear()
  sourceById.clear()
  valuesByText.clear()
}

/** How many distinct rendered strings are known — for tests and diagnostics. */
export function reverseIndexSize(): number {
  return idsByText.size
}
