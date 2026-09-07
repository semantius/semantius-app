#!/usr/bin/env node
/**
 * The model rows the label inventory is built from, read over PostgREST.
 *
 * `tables`, `fields` and `modules` are the semantic model itself. Nothing in the
 * repo knows what is in them — which is exactly why model labels need an
 * inventory rather than an extractor — so every script that has anything to say
 * about labels starts here.
 *
 * Only the READING is here. The inventory logic is `./labelInventory.mjs`, which
 * the app re-exports as `src/i18n/labelInventory.ts`: one implementation, two
 * runtimes, the same way `localeFile.mjs` is shared.
 */

import { readAll } from './tenant.mjs'

const TABLE_COLUMNS = 'table_name,singular_label,plural_label,description,updated_at'
const FIELD_COLUMNS =
  'table_name,field_name,title,description,enum_values,relationship_label,' +
  'singular_label_parent,plural_label_parent,updated_at'
const MODULE_COLUMNS = 'module_slug,module_name,description,updated_at'

/** Read the whole model. Answers `{ tables, fields, modules }`. */
export async function readModel(conn) {
  const [tables, fields, modules] = await Promise.all([
    readAll(conn, 'tables', `select=${TABLE_COLUMNS}&order=table_name.asc`),
    readAll(conn, 'fields', `select=${FIELD_COLUMNS}&order=table_name.asc,field_name.asc`),
    readAll(conn, 'modules', `select=${MODULE_COLUMNS}&order=module_slug.asc`),
  ])
  return { tables: tables.rows ?? [], fields: fields.rows ?? [], modules: modules.rows ?? [] }
}
