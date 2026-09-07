/**
 * Model-label overrides.
 *
 * Table, column, enum and module labels are DATA: they arrive from `get_schema`
 * and the model tables, not from the code, so the extractor cannot see them and
 * they are absent from every repo catalog. They are still text a user reads, so
 * a deployment file or a tenant row may override them — keyed by
 * `<table>.<field>.<attribute>` rather than by their English wording, so a
 * translation survives someone rewording the model.
 *
 * Overrides apply AT RENDER, never in a loader and never by mutating anything:
 * `localizeMetadata` returns a NEW `EntityMetadata` and the original stays the
 * loader's data. That is what lets a language switch re-render the grid without
 * refetching the schema.
 *
 * Everything here is pure and takes the label map as an argument, so it is unit
 * -testable in the `node` project and reusable by the scripts. The React side is
 * `useLocaleLabels()` / `useLocalizedMetadata()` in ./index.ts.
 */

import type { ChildRelation, EntityMetadata, JsonSchemaProperty, SemSchemaTable } from '@/types/metadata'
import {
  columnLabelKey,
  enumLabelKey,
  moduleLabelKey,
  scopedId,
  tableLabelKey,
  type ColumnLabelAttribute,
  type LabelScope,
  type TranslationMap,
} from './catalog'

/**
 * The attribute names, as constants.
 *
 * Call sites pass these rather than a bare `'plural_label'`: a snake_case model
 * attribute is an identifier, not language, and the lingui rule cannot tell the
 * two apart — it would report every one of them, and an `ignore` pattern wide
 * enough to cover them would be wide enough to hide a real string. Naming them
 * once, in a directory the rule already exempts as machinery, costs nothing and
 * reads better at the call site.
 */
export const TABLE_ATTR = {
  singular: 'singular_label',
  plural: 'plural_label',
  description: 'description',
} as const

export const COLUMN_ATTR = {
  title: 'title',
  description: 'description',
  relationship: 'relationship_label',
  singularParent: 'singular_label_parent',
  pluralParent: 'plural_label_parent',
} as const

export const MODULE_ATTR = {
  name: 'name',
  description: 'description',
} as const

/** Look one label up, falling back to what the model itself says. */
export function labelOf(labels: TranslationMap, scope: LabelScope, key: string, fallback: string): string
export function labelOf(
  labels: TranslationMap,
  scope: LabelScope,
  key: string,
  fallback: string | undefined,
): string | undefined
export function labelOf(
  labels: TranslationMap,
  scope: LabelScope,
  key: string,
  fallback: string | undefined,
): string | undefined {
  return labels[scopedId(scope, key)] || fallback
}

/** One of a table's own labels: `tableLabel(labels, 'accounts', 'plural_label', meta…)`. */
export function tableLabel(
  labels: TranslationMap,
  table: string,
  attribute: 'singular_label' | 'plural_label' | 'description',
  fallback: string,
): string
export function tableLabel(
  labels: TranslationMap,
  table: string,
  attribute: 'singular_label' | 'plural_label' | 'description',
  fallback: string | undefined,
): string | undefined
export function tableLabel(
  labels: TranslationMap,
  table: string,
  attribute: 'singular_label' | 'plural_label' | 'description',
  fallback: string | undefined,
): string | undefined {
  return labelOf(labels, 'table', tableLabelKey(table, attribute), fallback)
}

/** One attribute of one column. */
export function columnLabel(
  labels: TranslationMap,
  table: string,
  field: string,
  attribute: ColumnLabelAttribute,
  fallback: string | undefined,
): string | undefined {
  return labelOf(labels, 'column', columnLabelKey(table, field, attribute), fallback)
}

/** A module's own label, by slug. */
export function moduleLabel(
  labels: TranslationMap,
  slug: string,
  attribute: 'name' | 'description',
  fallback: string | undefined,
): string | undefined {
  return labelOf(labels, 'module', moduleLabelKey(slug, attribute), fallback)
}

/**
 * A module's overrides as one object, or `undefined` when nothing overrides it.
 *
 * `undefined` rather than an empty object on purpose: `getModuleDisplay` is
 * called once per module in three lists, and handing it a fresh `{}` every
 * render would defeat any memo downstream for no gain.
 */
export function moduleOverride(
  labels: TranslationMap,
  slug: string,
): { name?: string; description?: string } | undefined {
  const name = labels[scopedId('module', moduleLabelKey(slug, 'name'))]
  const description = labels[scopedId('module', moduleLabelKey(slug, 'description'))]
  return name || description ? { name, description } : undefined
}

/**
 * The display label for one enum value.
 *
 * Reads the `enum_labels` slot `localizeMetadata` fills rather than the label
 * map, so a call site that already holds a localized property needs nothing
 * else — and so a future SERVER-side label channel can fill the same slot with
 * no call site changing. Falls back to the stored value, which is what the grid
 * and the form showed before any of this existed.
 */
export function enumLabel(property: JsonSchemaProperty | undefined, value: string): string {
  return property?.enum_labels?.[value] ?? value
}

/**
 * A copy of `meta` with every label the active language overrides replaced.
 *
 * Returns the SAME object when nothing applies — no override anywhere, or no
 * table name to key on. Identity is load-bearing: `useLocalizedMetadata`
 * memoizes on it, and the grid re-renders on a new `metadata` prop.
 */
export function localizeMetadata(meta: EntityMetadata, labels: TranslationMap): EntityMetadata {
  const table = meta.table?.table_name
  if (!table || Object.keys(labels).length === 0) return meta

  const localizedTable = localizeTable(meta.table!, labels)
  const localizedProperties = localizeProperties(table, meta.properties, labels)
  const localizedChildren = localizeChildren(table, meta.children, labels)

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

function localizeTable(table: SemSchemaTable, labels: TranslationMap): SemSchemaTable {
  const singular = tableLabel(labels, table.table_name, 'singular_label', table.singular_label)
  const plural = tableLabel(labels, table.table_name, 'plural_label', table.plural_label)
  const description = tableLabel(labels, table.table_name, 'description', table.description)
  if (singular === table.singular_label && plural === table.plural_label && description === table.description) {
    return table
  }
  return { ...table, singular_label: singular, plural_label: plural, description }
}

function localizeProperties(
  table: string,
  properties: Record<string, JsonSchemaProperty> | undefined,
  labels: TranslationMap,
): Record<string, JsonSchemaProperty> | undefined {
  if (!properties) return properties
  let changed = false
  const out: Record<string, JsonSchemaProperty> = {}

  for (const [field, property] of Object.entries(properties)) {
    const title = columnLabel(labels, table, field, 'title', property.title)
    const description = columnLabel(labels, table, field, 'description', property.description)
    const enumLabels = localizeEnum(table, field, property, labels)

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
 * values an override actually names. A partly translated enum keeps its raw
 * values for the rest, which `enumLabel()` falls back to.
 */
function localizeEnum(
  table: string,
  field: string,
  property: JsonSchemaProperty,
  labels: TranslationMap,
): Record<string, string> | undefined {
  if (!property.enum || property.enum.length === 0) return property.enum_labels
  let out: Record<string, string> | undefined
  for (const value of property.enum) {
    const label = labels[scopedId('enum', enumLabelKey(table, field, value))]
    if (label) {
      out ??= { ...property.enum_labels }
      out[value] = label
    }
  }
  return out ?? property.enum_labels
}

/**
 * The child-relation labels. Their key is the CHILD table's name, because that
 * is the entity being labeled — the same `<table>.<field>.<attribute>` column
 * key the child's own reference field would use is not available here (a
 * ChildRelation names no field), so the relation's `id` is the field.
 */
function localizeChildren(
  table: string,
  children: ChildRelation[] | undefined,
  labels: TranslationMap,
): ChildRelation[] | undefined {
  if (!children || children.length === 0) return children
  let changed = false
  const out: ChildRelation[] = children.map((child) => {
    // `title` is required on ChildRelation, so its fallback is never undefined —
    // the overload that keeps the string type needs the non-optional argument.
    const title = columnLabel(labels, table, child.id, 'title', child.title) ?? child.title
    const singularParent = columnLabel(labels, table, child.id, 'singular_label_parent', child.singular_label_parent)
    const pluralParent = columnLabel(labels, table, child.id, 'plural_label_parent', child.plural_label_parent)
    const singular = tableLabel(labels, child.id, 'singular_label', child.singular_label)
    const plural = tableLabel(labels, child.id, 'plural_label', child.plural_label)
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
