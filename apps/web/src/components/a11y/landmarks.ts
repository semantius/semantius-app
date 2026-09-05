/**
 * Ids shared by the skip link, the `<main>` landmark and the route announcer.
 *
 * They live in one module because the three only work as a set: a skip link is
 * only a skip link if its target exists, and route-change focus has to land on
 * the same element the skip link targets or keyboard users get two different
 * "top of page" positions.
 */

/** Target of the skip link, and where focus lands after a route change. */
export const MAIN_CONTENT_ID = 'main-content'
