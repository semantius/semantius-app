import type { TranslateFn } from '@/i18n'

/**
 * The PostgREST query for a module's sidebar entries (its non-child entities).
 *
 * Shared by `NavApps`, which renders the list, and the module index route,
 * which redirects to its first entry when analytics is off. Both must send the
 * SAME string: the react-query key includes it, so the two share one cache
 * entry, and "first entry" means first in the order the sidebar shows — which
 * is why both also sort through `sortSidebarEntities`.
 */
export function sidebarEntitiesQuery(moduleId: number): string {
  return `module_id=eq.${moduleId}&is_child=not.is.true&select=table_name,plural_label,singular_label,name_sort,entity_type`
}

/**
 * The label an entry shows: the model's plural label, rendered as a message
 * keyed by its model path. The sidebar reads `entities` straight from the
 * model, so it never sees the localized EntityMetadata the table route builds.
 */
export function sidebarEntityLabel(
  entity: Record<string, unknown>,
  moduleSlug: string | null,
  t: TranslateFn,
): string {
  const tableName = String(entity.table_name || '')
  const fallback = String(entity.plural_label || entity.singular_label || tableName)
  return moduleSlug
    ? t({ id: ['module', moduleSlug, tableName, 'entity', 'plural_label'], defaultMessage: fallback })
    : fallback
}

/**
 * An entity's place in the sidebar: its `name_sort`, or when that is empty a
 * rank by `entity_type` (operational first, catalogs late, everything else
 * last), with the label appended as the tiebreaker.
 */
export function sidebarSortKey(entity: Record<string, unknown>, label: string): string {
  const nameSort = String(entity.name_sort ?? '')
  if (nameSort) return nameSort + label
  const type = String(entity.entity_type ?? '')
  const rank = type.startsWith('operational_') ? '10' : type === 'catalog' ? '80' : '90'
  return rank + label
}

/** The sidebar's entries in the order it shows them, each with its label. */
export function sortSidebarEntities(
  entities: Record<string, unknown>[],
  moduleSlug: string | null,
  t: TranslateFn,
  formattingLocale: string,
): { entity: Record<string, unknown>; label: string }[] {
  return entities
    .map((entity) => {
      const label = sidebarEntityLabel(entity, moduleSlug, t)
      return { entity, label, key: sidebarSortKey(entity, label) }
    })
    .sort((a, b) => a.key.localeCompare(b.key, formattingLocale))
    .map(({ entity, label }) => ({ entity, label }))
}
