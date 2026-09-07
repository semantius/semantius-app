/**
 * The file <-> rows mapping, in one place.
 *
 * A translation lives in two shapes: a nested JSON `LocaleFile` (a repo catalog,
 * an operator's deployment file, an export) and a flat `ui_translations` row (a
 * tenant). Both sides of the conversion are here so a change to the key scheme
 * cannot land on one side only.
 *
 * PLAIN ESM ON PURPOSE, and the reason is worth keeping: the node scripts under
 * this directory run under bare `node` with nothing transpiling TypeScript,
 * while the app runs through Vite. A `.ts` module would need a second, hand-kept
 * copy for the scripts — which is exactly the divergence this file exists to
 * prevent. `src/i18n/localeFile.ts` re-exports it, `localeFile.d.mts` types it,
 * and it imports nothing at all so both sides can take it as it is.
 *
 * The key scheme (mirrored by src/i18n/catalog.ts, which builds the same strings
 * for the running app):
 *
 *   table    accounts.singular_label | accounts.plural_label | accounts.description
 *   column   accounts.status.title | .description | .relationship_label
 *            | .singular_label_parent | .plural_label_parent
 *   enum     accounts.status.active            <- the STORED value, not its label
 *   module   crm.name | crm.description
 */

/** The `ui_translations.scope` values, in the order the docs list them. */
export const TRANSLATION_SCOPES = ['message', 'table', 'column', 'enum', 'module', 'server', 'rule']

/** The scopes whose key names something in the semantic model. */
export const LABEL_SCOPES = ['table', 'column', 'enum', 'module']

/** The table attributes a locale file may override. */
export const TABLE_LABEL_ATTRIBUTES = ['singular_label', 'plural_label', 'description']

/** The column attributes a locale file may override. */
export const COLUMN_LABEL_ATTRIBUTES = [
  'title',
  'description',
  'relationship_label',
  'singular_label_parent',
  'plural_label_parent',
]

/** The module attributes a locale file may override. */
export const MODULE_LABEL_ATTRIBUTES = ['name', 'description']

/**
 * Split a label key into its parts, or `null` when it is not one.
 *
 * The split is by dot and it is unambiguous because a table name and a field
 * name are SQL identifiers — no dots. An ENUM VALUE is data and may well contain
 * one, so everything after the second dot is the value, joined back together.
 */
export function parseLabelKey(scope, key) {
  const parts = String(key).split('.')
  if (scope === 'table') {
    if (parts.length !== 2 || !TABLE_LABEL_ATTRIBUTES.includes(parts[1])) return null
    return { table: parts[0], attribute: parts[1] }
  }
  if (scope === 'column') {
    if (parts.length !== 3 || !COLUMN_LABEL_ATTRIBUTES.includes(parts[2])) return null
    return { table: parts[0], field: parts[1], attribute: parts[2] }
  }
  if (scope === 'enum') {
    if (parts.length < 3) return null
    return { table: parts[0], field: parts[1], value: parts.slice(2).join('.') }
  }
  if (scope === 'module') {
    if (parts.length !== 2 || !MODULE_LABEL_ATTRIBUTES.includes(parts[1])) return null
    return { module: parts[0], attribute: parts[1] }
  }
  return null
}

/** An empty file for `locale`, so a caller never has to build the shell. */
export function emptyLocaleFile(locale) {
  return { locale }
}

/**
 * Fold one row into `file`.
 *
 * A row whose key does not parse is SKIPPED rather than thrown on: rows are
 * typed into a grid by people, and one malformed key must not cost a language
 * its whole catalog. The caller can count what came back to notice.
 */
export function applyRowToFile(file, row) {
  const translation = row.translation ?? ''
  const key = row.key
  if (!key) return false

  switch (row.scope) {
    case 'message': {
      const context = row.context ?? ''
      if (context) {
        file.contexts ??= {}
        ;(file.contexts[context] ??= {})[key] = translation
      } else {
        file.messages ??= {}
        file.messages[key] = translation
      }
      return true
    }
    case 'server':
    case 'rule': {
      file[row.scope] ??= {}
      file[row.scope][key] = translation
      return true
    }
    case 'table': {
      const parsed = parseLabelKey('table', key)
      if (!parsed) return false
      tableEntry(file, parsed.table)[parsed.attribute] = translation
      return true
    }
    case 'column': {
      const parsed = parseLabelKey('column', key)
      if (!parsed) return false
      columnEntry(file, parsed.table, parsed.field)[parsed.attribute] = translation
      return true
    }
    case 'enum': {
      const parsed = parseLabelKey('enum', key)
      if (!parsed) return false
      const column = columnEntry(file, parsed.table, parsed.field)
      ;(column.enum ??= {})[parsed.value] = translation
      return true
    }
    case 'module': {
      const parsed = parseLabelKey('module', key)
      if (!parsed) return false
      moduleEntry(file, parsed.module)[parsed.attribute] = translation
      return true
    }
    default:
      return false
  }
}

function tableEntry(file, table) {
  file.labels ??= {}
  file.labels.tables ??= {}
  return (file.labels.tables[table] ??= {})
}

function columnEntry(file, table, field) {
  const entry = tableEntry(file, table)
  entry.columns ??= {}
  return (entry.columns[field] ??= {})
}

function moduleEntry(file, slug) {
  file.labels ??= {}
  file.labels.modules ??= {}
  return (file.labels.modules[slug] ??= {})
}

/**
 * Group rows into one `LocaleFile` per locale.
 *
 * Rows with an EMPTY translation are dropped unless `includeEmpty` is set: an
 * empty row is a REQUEST — the queue's record that the app met a string it could
 * not translate — not a translation, and feeding one to the running app as a
 * layer would say "translated to nothing".
 */
export function rowsToLocaleFiles(rows, options = {}) {
  const files = new Map()
  for (const row of rows ?? []) {
    if (!row || !row.locale) continue
    if (!options.includeEmpty && !row.translation) continue
    let file = files.get(row.locale)
    if (!file) {
      file = emptyLocaleFile(row.locale)
      files.set(row.locale, file)
    }
    applyRowToFile(file, row)
  }
  return files
}

/**
 * Flatten one `LocaleFile` back into rows, ready to POST.
 *
 * Empty values are kept: writing one back is how a translator CLEARS a
 * translation, and `import.mjs` needs to be able to.
 */
export function localeFileToRows(file) {
  const rows = []
  const locale = file.locale
  const push = (scope, key, translation, context = '') => {
    rows.push({ locale, scope, key, context, translation: translation ?? '' })
  }

  for (const [key, value] of Object.entries(file.messages ?? {})) push('message', key, value)
  for (const [context, entries] of Object.entries(file.contexts ?? {})) {
    for (const [key, value] of Object.entries(entries)) push('message', key, value, context)
  }
  for (const [key, value] of Object.entries(file.server ?? {})) push('server', key, value)
  for (const [key, value] of Object.entries(file.rule ?? {})) push('rule', key, value)

  for (const [table, entry] of Object.entries(file.labels?.tables ?? {})) {
    for (const attribute of TABLE_LABEL_ATTRIBUTES) {
      if (entry[attribute] !== undefined) push('table', `${table}.${attribute}`, entry[attribute])
    }
    for (const [field, column] of Object.entries(entry.columns ?? {})) {
      for (const attribute of COLUMN_LABEL_ATTRIBUTES) {
        if (column[attribute] !== undefined) push('column', `${table}.${field}.${attribute}`, column[attribute])
      }
      for (const [value, label] of Object.entries(column.enum ?? {})) {
        push('enum', `${table}.${field}.${value}`, label)
      }
    }
  }
  for (const [slug, entry] of Object.entries(file.labels?.modules ?? {})) {
    for (const attribute of MODULE_LABEL_ATTRIBUTES) {
      if (entry[attribute] !== undefined) push('module', `${slug}.${attribute}`, entry[attribute])
    }
  }

  return rows
}
