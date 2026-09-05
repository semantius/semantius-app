/**
 * Where a module's tile / sidebar entry points.
 *
 * Extracted from `useModuleNavigate` so the same destination can be rendered as
 * a real `href` and not only reached through an onClick handler: a card that is
 * only a click handler is unreachable by keyboard, has no focus ring, is not
 * announced as a link, and cannot be opened in a new tab (2.1.1, 2.4.7).
 *
 * `home_page` is authored data and may be blank or the bare "/", both of which
 * mean "no custom landing page — use the module root".
 */
export function moduleHomePath(module: { home_page?: string; module_slug: string }): string {
  const homePage = module.home_page?.trim() || ''
  return homePage && homePage !== '/' ? homePage : `/${module.module_slug}`
}
