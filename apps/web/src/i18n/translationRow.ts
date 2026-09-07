/**
 * One translation as the writer takes it — the `ui_translations` row minus the
 * columns the server fills in.
 *
 * Its own leaf module so the writer, the editor and the tests can share the
 * shape without importing each other.
 */

import { messageId, scopedId, type TranslationScope } from './catalog'

export interface SaveRow {
  scope: TranslationScope
  key: string
  /** A message's context; '' for every other scope. */
  context: string
  translation: string
}

/** The runtime id a row stands for — what `translatedKeys` is keyed by. */
export function rowId(row: Pick<SaveRow, 'scope' | 'key' | 'context'>): string {
  if (row.scope === 'message') {
    return messageId(row.context ? { message: row.key, context: row.context } : row.key)
  }
  return scopedId(row.scope, row.key)
}
