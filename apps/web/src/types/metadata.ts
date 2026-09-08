// JSON Schema property definition
export interface JsonSchemaProperty {
  type: string | string[]
  required?: boolean
  title?: string
  description?: string
  format?: string
  enum?: string[]
  // Display labels for the enum values above, keyed by the STORED value. The one
  // consumer-facing slot for translated model labels: `localizeMetadata` fills
  // it from the active language's overrides at render time (src/i18n/labels.ts),
  // and a future server-side label channel would fill the same slot with no call
  // site changing. Read it through `enumLabel(property, value)`, which falls back
  // to the raw value — the enum's own `value` strings are what the database
  // holds and what filters and comparisons keep using.
  enum_labels?: Record<string, string>
  default?: unknown
  minimum?: number
  maximum?: number
  // Sem-schema number precision: fixed decimal places (0–4). Drives locale number
  // formatting in the grid and the number form control (see lib/number-format.ts).
  precision?: number
  pattern?: string
  items?: JsonSchemaProperty
  additionalProperties?: boolean | JsonSchemaProperty
  // Column classification (Sem Schema extension). Notable values:
  // 'fk_label'  — synthetic companion of a reference field, holds the composed
  //               label of the referenced row (e.g. supplier_id_label).
  // '_label'    — the row's own composed, human-readable label.
  // These are display-source fields, NOT standalone grid columns.
  ctype?: string
  // Whether the column accepts writes. `false` marks computed/synthetic
  // projections (e.g. ctype 'fk_label'/'_label') that are NOT real DB columns —
  // they must be excluded from INSERT/UPDATE payloads or PostgREST returns PGRST204.
  writable?: boolean
  // Whether the column can appear in a PostgREST select (computed columns are
  // selectable even though they are not writable).
  selectable?: boolean
  // Foreign key reference fields (Sem Schema extension)
  reference_table?: string
  reference_table_id_column?: string
  reference_table_label_column?: string
  reference_delete_mode?: string
  // Display width hint
  width?: 's' | 'm' | 'w' | 'default' | string
}

// Sem Schema table metadata
export interface SemSchemaTable {
  table_name: string
  singular: string
  plural: string
  singular_label: string
  plural_label: string
  icon_url?: string
  description?: string
  module_id?: number
  // The module's slug, as `get_schema` returns it beside `module_id`. It is
  // what every metadata message key starts with (`module.<slug>.<table>…`,
  // see src/i18n/catalog.ts) — never the route param, which is a catch-all
  // and wrong for a parent-filtered view that fetches ANOTHER entity's schema.
  module_slug: string
  view_permission?: string | null
  edit_permission?: string | null
  id_column: string
  label_column: string
  managed?: boolean
  searchable?: boolean
  is_child?: boolean
  edit_mode?: 'auto' | 'modal' | 'sidebar' | 'page'
  // Name of the integer column that stores explicit row ordering (values
  // increment by 10). When present and non-empty, the grid enables drag-and-drop
  // row reordering. May be absent from `properties`, but is always appended to
  // the select/order of list queries so the rows come back in saved order.
  order_column?: string
  created_at?: string
  updated_at?: string
}

export type { SemSchemaTable as TableMetadata }

// Child relation metadata (from get_schema children array)
export interface ChildRelation {
  id: string
  title: string
  singular_label: string
  plural_label: string
  singular_label_parent?: string
  plural_label_parent?: string
  id_column: string
  label_column: string
}

// Entity metadata with JSON Schema support
export interface EntityMetadata {
  $schema?: string
  $id?: string
  $vocabulary?: Record<string, boolean>
  title?: string
  description?: string
  type?: string
  additionalProperties?: boolean
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  table?: SemSchemaTable
  children?: ChildRelation[]
  
  // Legacy fields for backward compatibility
  table_name?: string
  label?: string
  fields?: Array<{
    name: string
    type: string
    required: boolean
  }>
}

export interface ViewProps {
  moduleId: string
  table_name: string
  recordId: string
  metadata: EntityMetadata
}
