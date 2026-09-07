#!/usr/bin/env node
/**
 * What the MODEL says needs translating.
 *
 * A code string is found by the extractor and listed in `en-US.json`; a table
 * label exists only as a row in `tables` / `fields` / `modules`, so nothing in
 * the repo knows it exists and the catalog test can never report it. Their
 * inventory therefore comes from the model itself, and "missing" means a label
 * the model carries with no translation for `(locale, scope, key)`.
 *
 * The diff runs BOTH ways. A label with no translation is missing; a translation
 * whose key is no longer in the model is ORPHANED - a renamed table, a dropped
 * field, an enum value that was removed. Deleting one is a translator's
 * decision, not something this code should do quietly, so it is reported rather
 * than pruned.
 *
 * PLAIN ESM for the same reason as `localeFile.mjs`: the scripts run under bare
 * `node` with nothing transpiling TypeScript, and a hand-kept second copy for
 * them is the divergence this arrangement exists to prevent.
 * `src/i18n/labelInventory.ts` re-exports it and `labelInventory.d.mts` types it.
 *
 * Pure, and it takes the rows as an argument: the app reads them through
 * `useTable`, `scripts/i18n/labels.mjs` reads them with node `fetch`, and the
 * `node` test project exercises it with neither.
 */

import {
  COLUMN_LABEL_ATTRIBUTES,
  MODULE_LABEL_ATTRIBUTES,
  TABLE_LABEL_ATTRIBUTES,
} from './localeFile.mjs'

/** The four label scopes, in the order the docs list them. */
const LABEL_SCOPES = ['table', 'column', 'enum', 'module']

/**
 * The runtime id of a label - the same string `scopedId()` builds for the app.
 * `src/i18n/labelInventory.test.ts` pins the two together.
 */
function idOf(scope, key) {
  return `${scope}:${key}`
}

/** `modules` spells its name `module_name`; the label attribute is `name`. */
const MODULE_COLUMN_OF = { name: 'module_name', description: 'description' }

/**
 * Normalize `fields.enum_values` into a list of stored values.
 *
 * Three shapes are tolerated because the column has been seen as all three: a
 * real array (jsonb / text[]), a JSON string, and a comma-separated string. A
 * value that is not one of those is not an enum, and yields nothing.
 */
export function parseEnumValues(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter((value) => value !== '')
  if (typeof raw !== 'string') return []
  const text = raw.trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map(String).filter((value) => value !== '')
    } catch {
      // Not JSON after all - fall through to the CSV reading below.
    }
  }
  return text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * Every label the model carries, as inventory entries.
 *
 * A blank label is skipped - there is nothing to translate, and listing it would
 * put an empty source in front of a translator.
 */
export function buildLabelInventory(rows) {
  const out = []
  const add = (scope, key, source, updatedAt) => {
    if (typeof source !== 'string' || source.trim() === '') return
    out.push({ scope, key, source, updatedAt: updatedAt ?? undefined })
  }

  for (const table of rows.tables ?? []) {
    if (!table.table_name) continue
    for (const attribute of TABLE_LABEL_ATTRIBUTES) {
      add('table', `${table.table_name}.${attribute}`, table[attribute], table.updated_at)
    }
  }

  for (const field of rows.fields ?? []) {
    if (!field.table_name || !field.field_name) continue
    for (const attribute of COLUMN_LABEL_ATTRIBUTES) {
      add(
        'column',
        `${field.table_name}.${field.field_name}.${attribute}`,
        field[attribute],
        field.updated_at,
      )
    }
    for (const value of parseEnumValues(field.enum_values)) {
      // The SOURCE of an enum entry is the stored value itself: the model holds
      // no separate English label for it, and the grid and the form show the raw
      // value until something overrides it.
      add('enum', `${field.table_name}.${field.field_name}.${value}`, value, field.updated_at)
    }
  }

  for (const module of rows.modules ?? []) {
    if (!module.module_slug) continue
    for (const attribute of MODULE_LABEL_ATTRIBUTES) {
      add(
        'module',
        `${module.module_slug}.${attribute}`,
        module[MODULE_COLUMN_OF[attribute]],
        module.updated_at,
      )
    }
  }

  return out
}

/**
 * Diff the inventory against the labels of one language.
 *
 * `labels` is the flat `scope:key` map `flattenLabels()` produces - the same map
 * the running app renders from, so what the panel calls missing is exactly what
 * the user sees untranslated.
 */
export function diffLabelInventory(inventory, labels) {
  const missing = []
  const translated = []
  const known = new Set()

  for (const entry of inventory) {
    const id = idOf(entry.scope, entry.key)
    known.add(id)
    if (labels[id]) translated.push(entry)
    else missing.push(entry)
  }

  const orphaned = []
  for (const [id, translation] of Object.entries(labels)) {
    if (known.has(id)) continue
    const at = id.indexOf(':')
    const scope = id.slice(0, at)
    // Only the four label scopes: `server` and `rule` share the flat id space
    // but name runtime text, which no model inventory can account for.
    if (!LABEL_SCOPES.includes(scope)) continue
    orphaned.push({ scope, key: id.slice(at + 1), translation })
  }

  return { missing, translated, orphaned }
}
