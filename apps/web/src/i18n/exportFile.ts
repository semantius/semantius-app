/**
 * "Download <code>.json": a language as one file, complete.
 *
 * The export is the full merge of every layer — repo catalog, deployment file,
 * tenant rows, drafts — PLUS an empty entry for every index message and every
 * inventory label that has no translation. That second half is the point: a
 * fresh language downloads as a complete work list, and a translator who has
 * no tenant table hands the file to an agent or an operator with nothing
 * missing from it that the app could have known about.
 *
 * Sorted so two exports of the same state are byte-identical, the way the
 * extractor's output is.
 */

import type { MessageIndex } from '../../scripts/i18n/extract.mjs'
import { flattenLabels, scopedId, type LocaleFile } from './catalog'
import { applyRowToFile } from './localeFile'
import { loadLocaleFiles, mergeLocaleFiles } from './store'
import type { InventoryEntry } from './labelInventory'

/**
 * Add an empty entry for everything `index` and `inventory` know that `file`
 * does not translate. Pure; returns a new, sorted file.
 */
export function completeWorkList(
  file: LocaleFile,
  index: MessageIndex,
  inventory: readonly InventoryEntry[],
): LocaleFile {
  const out: LocaleFile = {
    ...file,
    messages: { ...file.messages },
    contexts: Object.fromEntries(Object.entries(file.contexts ?? {}).map(([context, entries]) => [context, { ...entries }])),
    labels: file.labels ? JSON.parse(JSON.stringify(file.labels)) : undefined,
    server: { ...file.server },
    rule: { ...file.rule },
  }

  for (const entry of Object.values(index.index)) {
    if (entry.context) {
      out.contexts ??= {}
      const bucket = (out.contexts[entry.context] ??= {})
      bucket[entry.message] ??= ''
    } else {
      out.messages ??= {}
      out.messages[entry.message] ??= ''
    }
  }

  const have = flattenLabels(out)
  for (const entry of inventory) {
    if (have[scopedId(entry.scope, entry.key)]) continue
    applyRowToFile(out, { locale: out.locale, scope: entry.scope, key: entry.key, context: '', translation: '' })
  }

  return sortLocaleFile(out)
}

/** The merged layers of `language`, completed. */
export async function buildExportFile(
  language: string,
  index: MessageIndex,
  inventory: readonly InventoryEntry[],
): Promise<LocaleFile> {
  const merged = mergeLocaleFiles(language, await loadLocaleFiles(language))
  return completeWorkList(merged, index, inventory)
}

/** The file as text, the way the extractor writes a catalog. */
export function serializeLocaleFile(file: LocaleFile): string {
  return JSON.stringify(file, null, 2) + '\n'
}

/** Hand the file to the browser as a download named `<code>.json`. */
export function downloadLocaleFile(file: LocaleFile): void {
  const blob = new Blob([serializeLocaleFile(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${file.locale}.json`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // The object URL is only needed for the click; revoke it once the download
  // has had a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Sort by UTF-16 code unit — never `localeCompare`, which depends on the machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortDeep<T>(value: T): T {
  if (Array.isArray(value)) return value as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort(byCodeUnit)) {
      out[key] = sortDeep((value as Record<string, unknown>)[key])
    }
    return out as T
  }
  return value
}

/** Top-level sections in their documented order, everything inside them sorted. */
function sortLocaleFile(file: LocaleFile): LocaleFile {
  const out: LocaleFile = { locale: file.locale }
  if (file.name) out.name = file.name
  if (file.messages && Object.keys(file.messages).length) out.messages = sortDeep(file.messages)
  if (file.contexts && Object.keys(file.contexts).length) out.contexts = sortDeep(file.contexts)
  if (file.labels && (file.labels.tables || file.labels.modules)) out.labels = sortDeep(file.labels)
  if (file.server && Object.keys(file.server).length) out.server = sortDeep(file.server)
  if (file.rule && Object.keys(file.rule).length) out.rule = sortDeep(file.rule)
  if (file.obsolete) out.obsolete = sortDeep(file.obsolete)
  return out
}
