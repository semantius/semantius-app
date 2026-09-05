/**
 * `<title>` construction, shared by every route's `head()`.
 *
 * Deliberately in `lib/` and not in `routes/__root.tsx`: importing it from a route
 * file must not drag in the root route (and therefore the whole router) just to
 * build a string. It also keeps the product name in one place, so no two routes
 * can disagree about the suffix.
 */

export const TITLE_SUFFIX = 'Semantius'

/** Build a `<title>` for a route. With no page name, just the product name. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${TITLE_SUFFIX}` : TITLE_SUFFIX
}
