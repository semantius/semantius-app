/**
 * The PostgREST query for a module's sidebar entries (its non-child entities).
 *
 * Shared by `NavApps`, which renders the list, and the module index route,
 * which redirects to its first entry when analytics is off. Both must send the
 * SAME string: the react-query key includes it, so the two share one cache
 * entry, and "first entry" means first in the order the sidebar shows.
 */
export function sidebarEntitiesQuery(moduleId: number): string {
  return `module_id=eq.${moduleId}&is_child=not.is.true&select=table_name,plural_label,icon_url,singular_label`
}
