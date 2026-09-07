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

import type { MessageValues, TranslateFn } from '@/i18n'

/**
 * Format a delete-operation error for the user.
 *
 * Recognizes PostgREST's foreign-key constraint violation and explains it; any
 * other message is passed through untouched. Untouched is deliberate: a server
 * message is authored outside this repo and cannot be a key in the app's own
 * catalog. P4 routes those through `translateDynamic`, which looks them up
 * verbatim in the tenant's own translations and records the misses.
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

  return message || t('An unexpected error occurred. Please try again.')
}
