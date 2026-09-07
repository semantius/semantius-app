/**
 * Catalog shape, message ids, and the record of what is translated.
 *
 * There is ONE JSON shape for every place a translation can live — the repo
 * catalog, an operator's deployment file, the tenant's rows exported as a file
 * and the translate-mode export. Which sections a file may carry depends on
 * where it lives: a repo catalog carries `messages`, `contexts` and `obsolete`
 * only (`labels`, `server` and `rule` are tenant or deployment data, and
 * `src/test/i18nCatalogs.test.ts` rejects them here), while a deployment file
 * and the tenant rows carry the rest.
 *
 * Nothing in this module imports anything — not Lingui, not the layer store, not
 * `import.meta.glob`. It is the leaf every other i18n file builds on, so the id
 * scheme and the file shape can be used (and unit-tested) without starting the
 * runtime. Call sites still import from the `@/i18n` barrel, which is the
 * documented public API; this module is where the definitions live, not a second
 * front door.
 */

/** The source language. Its "catalog" is the English text in the code itself. */
export const SOURCE_LANGUAGE = 'en-US'

/**
 * The gettext context separator (U+0004, END OF TRANSMISSION). A message with a
 * context is stored under `message + U+0004 + context` so that two identically
 * worded strings with different meanings ("Right" the direction, "Right" the
 * correctness) are separate entries. Nobody ever types this id: `msg()` and
 * `messageId()` build it, and the catalog files spell the two parts out.
 */
export const CONTEXT_SEPARATOR = '\u0004'

/**
 * A message plus the metadata a translator needs. `msg()` returns one, so a
 * constant declared for later rendering is an OBJECT — passing it straight into
 * JSX is a `tsc` error rather than a silently untranslated English string.
 */
export interface MessageDescriptor {
  message: string
  /** Disambiguates two identical source strings with different meanings. */
  context?: string
  /** A note for the translator. Extracted into the index, never rendered. */
  comment?: string
}

/** Declare a message for later rendering with `t()` / `translate()`. */
export function msg(message: string, options: Omit<MessageDescriptor, 'message'> = {}): MessageDescriptor {
  return { message, ...options }
}

/** The runtime id of a message: the source text, plus its context when it has one. */
export function messageId(message: string | MessageDescriptor): string {
  if (typeof message === 'string') return message
  return message.context ? `${message.message}${CONTEXT_SEPARATOR}${message.context}` : message.message
}

/** Split a runtime id back into its message and context. */
export function splitMessageId(id: string): { message: string; context?: string } {
  const at = id.indexOf(CONTEXT_SEPARATOR)
  if (at === -1) return { message: id }
  return { message: id.slice(0, at), context: id.slice(at + CONTEXT_SEPARATOR.length) }
}

/** A `messages`-shaped section: source text (or label key) to translation. */
export type TranslationMap = Record<string, string>

/**
 * The scopes a translation can belong to, matching `ui_translations.scope`.
 *
 * `message` is code text keyed by its English source. The four label scopes are
 * MODEL DATA — table, column, enum and module labels arrive from `get_schema`,
 * so no extractor can ever see them and their inventory comes from the model
 * itself. `server` and `rule` are text the app meets for the first time at
 * runtime: a PostgREST or RPC message, and a message authored in a model
 * validation rule.
 */
export type TranslationScope = 'message' | 'table' | 'column' | 'enum' | 'module' | 'server' | 'rule'

/** The scopes whose keys name something in the semantic model. */
export type LabelScope = 'table' | 'column' | 'enum' | 'module'

/** The scopes looked up verbatim, never ICU-compiled (see translateDynamic). */
export type DynamicScope = 'server' | 'rule'

export const LABEL_SCOPES: readonly LabelScope[] = ['table', 'column', 'enum', 'module']

/**
 * The scopes as named constants, for code OUTSIDE this directory.
 *
 * `entry.scope === 'message'` is an identifier comparison, but the lingui rule
 * cannot tell an identifier from a sentence and reports the literal; a
 * constant defined here, where the rule already expects machinery, reads the
 * same and costs no suppression entry.
 */
export const SCOPE = {
  message: 'message',
  table: 'table',
  column: 'column',
  enum: 'enum',
  module: 'module',
  server: 'server',
  rule: 'rule',
} as const satisfies Record<TranslationScope, TranslationScope>

/**
 * The runtime id of anything that is not a `message`: the scope, a colon, the
 * key. Message ids are the source text itself (plus a context), so they need no
 * prefix — and could not have one, since the source text IS the key.
 */
export function scopedId(scope: Exclude<TranslationScope, 'message'>, key: string): string {
  return `${scope}:${key}`
}

/** Split a scoped id back apart. Answers null for a message id. */
export function splitScopedId(id: string): { scope: Exclude<TranslationScope, 'message'>; key: string } | null {
  const at = id.indexOf(':')
  if (at === -1) return null
  const scope = id.slice(0, at)
  if (!SCOPED_PREFIXES.has(scope)) return null
  return { scope: scope as Exclude<TranslationScope, 'message'>, key: id.slice(at + 1) }
}

const SCOPED_PREFIXES = new Set<string>([...LABEL_SCOPES, 'server', 'rule'])

// ── Label keys ──────────────────────────────────────────────────────────────
//
// One key per model attribute, and the SAME key names the row in
// `ui_translations`, the entry in a file's `labels` section and the entry in the
// inventory. They are built here, in the leaf module, so the scripts (which run
// in node against the model tables) and the app agree by construction.

/** `accounts.plural_label` — one of the table's own labels. */
export function tableLabelKey(table: string, attribute: 'singular_label' | 'plural_label' | 'description'): string {
  return `${table}.${attribute}`
}

/** The column attributes a locale file may override. */
export type ColumnLabelAttribute =
  | 'title'
  | 'description'
  | 'relationship_label'
  | 'singular_label_parent'
  | 'plural_label_parent'

export const COLUMN_LABEL_ATTRIBUTES: readonly ColumnLabelAttribute[] = [
  'title',
  'description',
  'relationship_label',
  'singular_label_parent',
  'plural_label_parent',
]

/** `accounts.status.title` — one attribute of one column. */
export function columnLabelKey(table: string, field: string, attribute: ColumnLabelAttribute): string {
  return `${table}.${field}.${attribute}`
}

/**
 * `accounts.status.active` — one value of one enum column, keyed by the STORED
 * value rather than by its English label, because the value is what the database
 * holds and what survives a relabeling.
 */
export function enumLabelKey(table: string, field: string, value: string): string {
  return `${table}.${field}.${value}`
}

/** `crm.name` — a module's own label. */
export function moduleLabelKey(slug: string, attribute: 'name' | 'description'): string {
  return `${slug}.${attribute}`
}

/** One column's overridable labels, plus its enum values. */
export interface ColumnLabelFile {
  title?: string
  description?: string
  relationship_label?: string
  singular_label_parent?: string
  plural_label_parent?: string
  /** Keyed by the STORED enum value, never by its English label. */
  enum?: TranslationMap
}

/** One table's overridable labels, plus its columns. */
export interface TableLabelFile {
  singular_label?: string
  plural_label?: string
  description?: string
  columns?: Record<string, ColumnLabelFile>
}

/** One module's overridable labels. */
export interface ModuleLabelFile {
  name?: string
  description?: string
}

/** The `labels` section: model-label overrides, nested as the model is. */
export interface LabelFileSection {
  tables?: Record<string, TableLabelFile>
  modules?: Record<string, ModuleLabelFile>
}

/** One locale file, in the single shape every layer speaks. */
export interface LocaleFile {
  locale: string
  /** The language's own name for itself. Wins over `Intl.DisplayNames`. */
  name?: string
  messages?: TranslationMap
  contexts?: Record<string, TranslationMap>
  /** Model-label overrides — deployment files and tenant rows only. */
  labels?: LabelFileSection
  /** Backend/PostgREST messages — deployment files and tenant rows only. */
  server?: TranslationMap
  /** Model rule messages — deployment files and tenant rows only. */
  rule?: TranslationMap
  /** Entries whose source string no longer exists. Repo catalogs only. */
  obsolete?: {
    messages?: TranslationMap
    contexts?: Record<string, TranslationMap>
  }
}

/**
 * Flatten a file's `messages` and `contexts` into runtime ids.
 *
 * EMPTY VALUES ARE DROPPED, and that is load-bearing: an empty string is how a
 * catalog spells "not translated yet", but a catalog entry present with an empty
 * value would make the fallback to the source text depend on Lingui's own
 * truthiness check rather than on us. Absent means absent.
 */
export function flattenMessages(file: LocaleFile): TranslationMap {
  const out: TranslationMap = {}
  for (const [message, translation] of Object.entries(file.messages ?? {})) {
    if (translation) out[message] = translation
  }
  for (const [context, entries] of Object.entries(file.contexts ?? {})) {
    for (const [message, translation] of Object.entries(entries)) {
      if (translation) out[`${message}${CONTEXT_SEPARATOR}${context}`] = translation
    }
  }
  return out
}

/**
 * Flatten a file's `labels` section into `scope:key` ids.
 *
 * Empty values are dropped for the same reason as in `flattenMessages`: absent
 * is what makes the model's own English label show through.
 */
export function flattenLabels(file: LocaleFile): TranslationMap {
  const out: TranslationMap = {}
  const put = (scope: LabelScope, key: string, value: string | undefined) => {
    if (value) out[scopedId(scope, key)] = value
  }

  for (const [table, entry] of Object.entries(file.labels?.tables ?? {})) {
    put('table', tableLabelKey(table, 'singular_label'), entry.singular_label)
    put('table', tableLabelKey(table, 'plural_label'), entry.plural_label)
    put('table', tableLabelKey(table, 'description'), entry.description)
    for (const [field, column] of Object.entries(entry.columns ?? {})) {
      for (const attribute of COLUMN_LABEL_ATTRIBUTES) {
        put('column', columnLabelKey(table, field, attribute), column[attribute])
      }
      for (const [value, label] of Object.entries(column.enum ?? {})) {
        put('enum', enumLabelKey(table, field, value), label)
      }
    }
  }
  for (const [slug, entry] of Object.entries(file.labels?.modules ?? {})) {
    put('module', moduleLabelKey(slug, 'name'), entry.name)
    put('module', moduleLabelKey(slug, 'description'), entry.description)
  }
  return out
}

/** Flatten a file's `server` and `rule` sections into `scope:key` ids. */
export function flattenDynamic(file: LocaleFile): TranslationMap {
  const out: TranslationMap = {}
  for (const [key, value] of Object.entries(file.server ?? {})) {
    if (value) out[scopedId('server', key)] = value
  }
  for (const [key, value] of Object.entries(file.rule ?? {})) {
    if (value) out[scopedId('rule', key)] = value
  }
  return out
}

// ── The active language's non-message state ──────────────────────────────────
//
// Module state rather than a value threaded through the tree: `translatedKeys()`
// (translate mode's "missing" marking) and `translateDynamic()` are both called
// from outside React as well as inside it, and all of it changes exactly when a
// locale is activated. `activateLocale()` is the only writer.
//
// Lingui owns the MESSAGE table; everything else lives here, because Lingui's
// catalog is a flat map of compiled ICU and these three are none of those
// things: labels are data with their own key scheme, and dynamic text must never
// be ICU-compiled at all (a server message may legitimately contain braces).

let activeLanguage = SOURCE_LANGUAGE
let activeKeys: ReadonlySet<string> = new Set()
/**
 * The merged MESSAGE translations, as raw ICU. Lingui holds the same map and
 * renders from it; this copy exists so translate mode can show a message's
 * current translation without reaching into Lingui's internals.
 */
let activeMessages: TranslationMap = {}
let activeLabels: TranslationMap = {}
let activeDynamic: TranslationMap = {}
let catalogVersion = 0

const listeners = new Set<() => void>()

/**
 * Subscribe to label / dynamic-map changes. Separate from Lingui's own `change`
 * event because this module deliberately imports nothing — see the header.
 * `activateLocale` emits both, so a component may listen to either.
 */
export function subscribeToCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A counter that changes whenever the labels do — the dependency
 * `useLocalizedMetadata` memoizes on, and the `useSyncExternalStore` snapshot
 * (which must be a stable primitive, not the map, or every render re-subscribes).
 */
export function catalogSnapshot(): number {
  return catalogVersion
}

/** The merged layer result for `language`. Called by `activateLocale`. */
export function setCatalogState(
  language: string,
  messages: TranslationMap,
  labels: TranslationMap = {},
  dynamic: TranslationMap = {},
): void {
  activeLanguage = language
  activeMessages = messages
  activeLabels = labels
  activeDynamic = dynamic
  activeKeys = new Set([...Object.keys(messages), ...Object.keys(labels), ...Object.keys(dynamic)])
  catalogVersion++
  for (const listener of listeners) listener()
}

/** The active language's message translations, keyed by runtime id. */
export function currentMessages(): TranslationMap {
  return activeMessages
}

/** The active language's model-label overrides, keyed `scope:key`. */
export function currentLabels(): TranslationMap {
  return activeLabels
}

/** The active language's `server` / `rule` translations, keyed `scope:key`. */
export function currentDynamic(): TranslationMap {
  return activeDynamic
}

/** The active catalog language, for code that cannot reach the Lingui singleton. */
export function currentLanguage(): string {
  return activeLanguage
}

/**
 * Add a single translation to the live label or dynamic map, for translate
 * mode's save — the equivalent of Lingui's merging `i18n.load` for the scopes
 * Lingui does not hold. Every other write REPLACES, which is what makes
 * clearing a draft take effect.
 */
export function addCatalogEntry(scope: Exclude<TranslationScope, 'message'>, key: string, text: string): void {
  const id = scopedId(scope, key)
  const target = scope === 'server' || scope === 'rule' ? 'dynamic' : 'labels'
  const next = { ...(target === 'dynamic' ? activeDynamic : activeLabels) }
  if (text) next[id] = text
  else delete next[id]
  if (target === 'dynamic') activeDynamic = next
  else activeLabels = next
  activeKeys = text ? new Set([...activeKeys, id]) : new Set([...activeKeys].filter((k) => k !== id))
  catalogVersion++
  for (const listener of listeners) listener()
}

/**
 * The message-scope counterpart of `addCatalogEntry`, for a translate-mode save
 * of a code string. The caller ALSO hands the text to Lingui's merging
 * `i18n.load` — Lingui is what renders it; this keeps `translatedKeys` and the
 * panel's view of the current translation in step with it.
 */
export function addMessageEntry(id: string, text: string): void {
  const next = { ...activeMessages }
  if (text) next[id] = text
  else delete next[id]
  activeMessages = next
  activeKeys = text ? new Set([...activeKeys, id]) : new Set([...activeKeys].filter((k) => k !== id))
  catalogVersion++
  for (const listener of listeners) listener()
}

/**
 * The ids that have a non-empty translation in `language`.
 *
 * Answers an empty set for any language that is not the active one — the layers
 * of an inactive language are not loaded, so there is nothing truthful to say
 * about it. The source language is never "missing" anything, which is why
 * translate mode offers overrides there instead of marking.
 */
export function translatedKeys(language: string): ReadonlySet<string> {
  return language === activeLanguage ? activeKeys : new Set()
}
