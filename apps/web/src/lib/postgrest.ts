/** PostgREST protocol fragments the generic hooks send. */

/** The query parameter naming an upsert's conflict target: `?on_conflict=a,b`. */
export const UPSERT_QUERY = 'on_conflict'

/**
 * Merge on conflict and return the resulting row. The collector's request
 * insert is the deliberate opposite (`ignore-duplicates`, see
 * `src/i18n/missing.ts`), so a request can never overwrite a translation.
 */
export const UPSERT_PREFER = 'resolution=merge-duplicates,return=representation'
