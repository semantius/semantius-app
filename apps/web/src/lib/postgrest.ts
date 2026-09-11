/**
 * PostgREST protocol fragments the generic hooks send.
 *
 * Named once, here, rather than spelled at the call site: these are wire
 * syntax, not text, and `hooks/useTableMutations.ts` is still in the lingui
 * suppression baseline — one more literal there would push the file past its
 * recorded count and make ESLint report every string in it. The rule cannot
 * tell protocol from prose, so each is exempted on its own line, with the
 * reason beside it, rather than through a wider `ignore` pattern.
 */

/** The query parameter naming an upsert's conflict target: `?on_conflict=a,b`. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a PostgREST query parameter name
export const UPSERT_QUERY = 'on_conflict'

/**
 * Merge on conflict and return the resulting row. The collector's request
 * insert is the deliberate opposite (`ignore-duplicates`, see
 * `src/i18n/missing.ts`), so a request can never overwrite a translation.
 */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a `Prefer` header value
export const UPSERT_PREFER = 'resolution=merge-duplicates,return=representation'
