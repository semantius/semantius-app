/**
 * Model text, rendered as messages.
 *
 * Table, field, enum and module labels arrive from `get_schema` and the model
 * tables, not from the code. They are still messages: each has a key built
 * from the model path (see ./catalog.ts) and renders through the same lookup
 * as a code string, with the model's own English as the fallback — which is
 * what makes an untranslated label render at all, and what lands its key and
 * its source in the index when discovery is on.
 *
 * Overrides apply AT RENDER, never in a loader and never by mutating anything:
 * `localizeMetadata` returns a NEW `EntityMetadata` and the original stays the
 * loader's data. That is what lets a language switch re-render the grid without
 * refetching the schema. The React side is `useLocalizedMetadata()` in ./index.ts.
 */

import type { ChildRelation, EntityMetadata, JsonSchemaProperty, SemSchemaTable } from '@/types/metadata'
import { ENTITY_MARKER, ENUM_MARKER, FIELD_MARKER, MODULE_ROOT, type MetadataId } from './catalog'
import { translate } from './translate'

/**
 * One model attribute, translated, or the model's own text where nothing
 * overrides it. An absent attribute stays absent: a field with no description
 * is normal, and there is nothing to translate.
 */
export function metadataText(id: MetadataId, fallback: string): string
export function metadataText(id: MetadataId, fallback: string | undefined): string | undefined
export function metadataText(id: MetadataId, fallback: string | undefined): string | undefined {
  if (!fallback) return fallback
  return translate({ id, defaultMessage: fallback })
}

/**
 * The display label for one enum value.
 *
 * Reads the `enum_labels` slot `localizeMetadata` fills rather than looking
 * the value up again, so a call site that already holds a localized property
 * needs nothing else. Falls back to the stored value, which is what the grid
 * and the form showed before any of this existed.
 */
export function enumLabel(property: JsonSchemaProperty | undefined, value: string): string {
  return property?.enum_labels?.[value] ?? value
}

/**
 * A copy of `meta` with every label the active language translates replaced.
 *
 * Returns the SAME object when nothing applies — no translation anywhere, or
 * no module slug and table name to key on. Identity is load-bearing:
 * `useLocalizedMetadata` memoizes on it, and the grid re-renders on a new
 * `metadata` prop. The walk still runs in full every time: it is what records
 * every label for translate mode and hands every label to discovery, and an
 * unchanged table, property set and child list hand back the same objects.
 *
 * The slug comes from the model (`table.module_slug`), never from the route:
 * `/$moduleId/$table_name` is a catch-all, and a parent-filtered view fetches
 * a DIFFERENT entity's schema.
 */
export function localizeMetadata(meta: EntityMetadata): EntityMetadata {
  const slug = meta.table?.module_slug
  const table = meta.table?.table_name
  if (!slug || !table) return meta

  const localizedTable = localizeTable(meta.table!, slug)
  const localizedProperties = localizeProperties(slug, table, meta.properties)
  const localizedChildren = localizeChildren(slug, meta.children)

  if (
    localizedTable === meta.table &&
    localizedProperties === meta.properties &&
    localizedChildren === meta.children
  ) {
    return meta
  }

  return {
    ...meta,
    table: localizedTable,
    properties: localizedProperties,
    children: localizedChildren,
  }
}

function localizeTable(table: SemSchemaTable, slug: string): SemSchemaTable {
  const name = table.table_name
  const singular = metadataText([MODULE_ROOT, slug, name, ENTITY_MARKER, 'singular_label'], table.singular_label)
  const plural = metadataText([MODULE_ROOT, slug, name, ENTITY_MARKER, 'plural_label'], table.plural_label)
  const description = metadataText([MODULE_ROOT, slug, name, ENTITY_MARKER, 'description'], table.description)
  if (singular === table.singular_label && plural === table.plural_label && description === table.description) {
    return table
  }
  return { ...table, singular_label: singular, plural_label: plural, description }
}

function localizeProperties(
  slug: string,
  table: string,
  properties: Record<string, JsonSchemaProperty> | undefined,
): Record<string, JsonSchemaProperty> | undefined {
  if (!properties) return properties
  let changed = false
  const out: Record<string, JsonSchemaProperty> = {}

  for (const [field, property] of Object.entries(properties)) {
    const title = metadataText([MODULE_ROOT, slug, table, FIELD_MARKER, field, 'title'], property.title)
    const description = metadataText(
      [MODULE_ROOT, slug, table, FIELD_MARKER, field, 'description'],
      property.description,
    )
    const enumLabels = localizeEnum(slug, table, field, property)

    if (title === property.title && description === property.description && enumLabels === property.enum_labels) {
      out[field] = property
      continue
    }
    changed = true
    out[field] = { ...property, title, description, enum_labels: enumLabels }
  }

  return changed ? out : properties
}

/**
 * The `enum_labels` slot: stored value -> displayed label, filled only for the
 * values a translation actually covers. A partly translated enum keeps its raw
 * values for the rest, which `enumLabel()` falls back to. The stored value is
 * both the key's last segment and the source a translator sees: the model
 * holds no English label for it.
 */
function localizeEnum(
  slug: string,
  table: string,
  field: string,
  property: JsonSchemaProperty,
): Record<string, string> | undefined {
  if (!property.enum || property.enum.length === 0) return property.enum_labels
  let out: Record<string, string> | undefined
  for (const value of property.enum) {
    const label = metadataText([MODULE_ROOT, slug, table, ENUM_MARKER, field, value], value)
    if (label !== value) {
      out ??= { ...property.enum_labels }
      out[value] = label
    }
  }
  return out ?? property.enum_labels
}

/**
 * The child-relation labels. A relation's `id` is `<child table>.<fk field>`,
 * and each of its labels is one of that field's or that entity's own
 * attributes — `title` and the two parent labels belong to the field, the
 * singular and plural to the child entity. The child is keyed under the
 * PARENT's module: `get_schema` names no module for a child, and a relation
 * inside one module is the case the model has.
 */
function localizeChildren(slug: string, children: ChildRelation[] | undefined): ChildRelation[] | undefined {
  if (!children || children.length === 0) return children
  let changed = false
  const out: ChildRelation[] = children.map((child) => {
    const [childTable, fkField] = child.id.split('.')
    if (!childTable) return child
    const fieldText = (attribute: 'title' | 'singular_label_parent' | 'plural_label_parent', fallback: string | undefined) =>
      fkField ? metadataText([MODULE_ROOT, slug, childTable, FIELD_MARKER, fkField, attribute], fallback) : fallback
    // `title` is required on ChildRelation, so its fallback is never undefined.
    const title = fieldText('title', child.title) ?? child.title
    const singularParent = fieldText('singular_label_parent', child.singular_label_parent)
    const pluralParent = fieldText('plural_label_parent', child.plural_label_parent)
    const singular = metadataText([MODULE_ROOT, slug, childTable, ENTITY_MARKER, 'singular_label'], child.singular_label)
    const plural = metadataText([MODULE_ROOT, slug, childTable, ENTITY_MARKER, 'plural_label'], child.plural_label)
    if (
      title === child.title &&
      singularParent === child.singular_label_parent &&
      pluralParent === child.plural_label_parent &&
      singular === child.singular_label &&
      plural === child.plural_label
    ) {
      return child
    }
    changed = true
    return {
      ...child,
      title,
      singular_label: singular,
      plural_label: plural,
      singular_label_parent: singularParent,
      plural_label_parent: pluralParent,
    }
  })
  return changed ? out : children
}
