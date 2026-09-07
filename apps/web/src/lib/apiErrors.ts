/**
 * Turns an API error into something a person can act on.
 *
 * It used to build its sentence out of English morphology: `singularize()`
 * turned "regions" into "region" and "companies" into "company", `capitalize()`
 * put a capital on the front, and the two halves were concatenated into
 * "Region is still used by a Customer. Cannot delete." That is a sentence no
 * other language can be given — German capitalizes every noun and forms plurals
 * a dozen ways, and the word order of the whole clause differs. Both helpers are
 * gone: the labels are inserted into ONE ICU message exactly as the model and
 * the database spell them.
 *
 * The `t` function is a parameter rather than an import, because this module is
 * called from a component's render and the translation has to follow a language
 * change. `translate()` would read the current catalog too, but a component that
 * cannot re-render (three of the grid's are `React.memo`) would keep the old
 * language on screen — so the rule is that a component passes its own `t` down,
 * and ESLint bans the import under `components/**`.
 */

import { translateDynamic, type MessageValues, type TranslateFn } from '@/i18n'

/**
 * The PostgREST error code an error carries, or undefined.
 *
 * Every thrower in the data layer puts the server's own body on `error.cause`
 * alongside the status (`useTable`, `callRpc`, the three mutations), so this is
 * where a `code` lives when there is one.
 */
export function codeOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const cause = error.cause
  if (!cause || typeof cause !== 'object') return undefined
  const code = (cause as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/**
 * The user-facing text for a message the SERVER produced.
 *
 * Looked up verbatim in the tenant's own `server` translations and returned
 * unchanged when there is none — a server message is authored outside this repo
 * and can never be a key in the app's catalog. Every miss whose error carried a
 * PostgREST `code` becomes a row in the translation queue, which is how a
 * model-authored rule message ("Order must have at least one line") becomes
 * translatable at all.
 *
 * The `code` filter is what keeps the app's OWN thrown sentences out of the
 * queue: those are already catalog messages, and a body that carries a `code`
 * always carries the server's own `message` with it.
 */
export function serverMessage(error: unknown, origin?: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return translateDynamic(message, { scope: 'server', code: codeOf(error), origin })
}

/**
 * Format a delete-operation error for the user.
 *
 * Recognizes PostgREST's foreign-key constraint violation and explains it; any
 * other message goes through `serverMessage` — looked up verbatim in the
 * tenant's own `server` translations, because a server message is authored
 * outside this repo and cannot be a key in the app's catalog.
 *
 * @param error - the Error thrown by the mutation
 * @param t - the caller's translate function (`useT()`)
 * @param singularLabel - the model's own label for the record being deleted
 *   ("Region"), used as given. Falls back to the table name in the error.
 */
export function formatDeleteError(
  error: Error,
  t: TranslateFn,
  singularLabel?: string,
): string {
  const message = error.message || ''

  // PostgREST FK violation pattern:
  // "update or delete on table "regions" violates foreign key constraint "customers_region_id_fkey" on table "customers""
  const fkMatch = message.match(
    /on table "(\w+)" violates foreign key constraint "[^"]+" on table "(\w+)"/,
  )
  if (fkMatch) {
    const values: MessageValues = {
      label: singularLabel || fkMatch[1],
      // The referencing table's name as the database spells it. There is no
      // model label for it here — the error names a table, not an entity — and
      // inventing one by un-pluralizing the identifier is exactly what this
      // function stopped doing.
      table: fkMatch[2],
    }
    return t('{label} is still used by records in {table} and cannot be deleted.', values)
  }

  // Not ours: a PostgREST constraint message, a model rule's own wording, an
  // RPC's `raise`. Looked up verbatim in the tenant's `server` translations,
  // and recorded as work when there is no entry.
  return serverMessage(error) || t('An unexpected error occurred. Please try again.')
}
