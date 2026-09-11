/**
 * `<title>` construction, shared by every route's `head()`.
 *
 * Deliberately in `lib/` and not in `routes/__root.tsx`: importing it from a route
 * file must not drag in the root route (and therefore the whole router) just to
 * build a string. It also keeps the product name in one place, so no two routes
 * can disagree about the suffix.
 *
 * The page name arrives ALREADY TRANSLATED — a route's `head()` runs outside
 * React, so it calls `translate('Settings')` and passes the result in. Doing the
 * translation here instead would hide the message from the extractor, whose whole
 * contract is that the source string it can see is the key.
 *
 * The product name is not translated: it is a name, the same in every language.
 * The separator is a middle dot with hair-thin spacing on both sides, which no
 * language changes either.
 */

export const TITLE_SUFFIX = 'Semantius'

/** Build a `<title>` for a route. With no page name, just the product name. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${TITLE_SUFFIX}` : TITLE_SUFFIX
}
