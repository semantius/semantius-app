/**
 * Keys, the three call forms, and the record of what is translated.
 *
 * A metadata message is a message. It has a key instead of using its English
 * as the key, and that is the only difference from a code string:
 *
 *   t('Save')                                              key: Save
 *   t({ id: ['columnVisibility'], message: 'View' })        key: columnVisibility.View
 *   t({ id: ['module', slug, table, 'field', 'city', 'title'],
 *       defaultMessage: property.title ?? 'city' })         key: module.nwind.orders.field.city.title
 *
 * Which field is present is the discriminator. `message` means "this text is
 * part of my identity — reword it and I am a new message". `defaultMessage`
 * means "my identity is the id; this is what to show when nothing is
 * translated". The id arrives as SEGMENTS: the joining and the escaping live
 * here, so no call site can spell a separator wrong, and a metadata id's arity
 * and order are a tuple type.
 *
 * `module` is a reserved first segment. A code key may never start with it,
 * and that one rule is what separates the two producers everywhere — in the
 * stored flat key, in a file, in a `key like 'module.%'` query and in a grep.
 *
 * Nothing in this module imports anything — not Lingui, not the layer store.
 * It is the leaf every other i18n file builds on, so the key scheme and the
 * file shape can be used (and unit-tested) without starting the runtime. Call
 * sites still import from the `@/i18n` barrel, which is the documented public
 * API; this module is where the definitions live, not a second front door.
 */

/** The source language. Its "catalog" is the English text in the code itself. */
export const SOURCE_LANGUAGE = 'en-US'

/** The reserved first segment of every metadata key. */
export const MODULE_ROOT = 'module'

/** The kind markers in position 4 of an entity, field or enum key. */
export const ENTITY_MARKER = 'entity'
export const FIELD_MARKER = 'field'
export const ENUM_MARKER = 'enum'

/**
 * The attribute vocabulary is the MODEL's own column names — `tables`,
 * `fields` and `modules` spell them exactly this way.
 */
export type ModuleAttribute = 'name' | 'description'
export type EntityAttribute = 'singular_label' | 'plural_label' | 'description'
export type FieldAttribute =
  | 'title'
  | 'description'
  | 'relationship_label'
  | 'singular_label_parent'
  | 'plural_label_parent'

export const MODULE_ATTRIBUTES: readonly ModuleAttribute[] = ['name', 'description']
export const ENTITY_ATTRIBUTES: readonly EntityAttribute[] = ['singular_label', 'plural_label', 'description']
export const FIELD_ATTRIBUTES: readonly FieldAttribute[] = [
  'title',
  'description',
  'relationship_label',
  'singular_label_parent',
  'plural_label_parent',
]

/**
 * A metadata id, as segments. Module attributes are 3 segments and carry no
 * kind marker; an entity attribute is 5, and a field or enum key is 6, told
 * apart by the marker in position 4. No collision is possible, including an
 * entity actually named `name`. An enum's last segment is the STORED value,
 * never its label, so relabeling does not move the key.
 */
export type MetadataId =
  | readonly [typeof MODULE_ROOT, string, ModuleAttribute]
  | readonly [typeof MODULE_ROOT, string, string, typeof ENTITY_MARKER, EntityAttribute]
  | readonly [typeof MODULE_ROOT, string, string, typeof FIELD_MARKER, string, FieldAttribute]
  | readonly [typeof MODULE_ROOT, string, string, typeof ENUM_MARKER, string, string]

/** Form 1 and form 2: the message is (part of) the key. */
export interface SourceMessage {
  message: string
  /** Form 2: a disambiguating prefix, so two meanings of one word are two keys. */
  id?: readonly string[]
  /** A note for the translator. Never rendered. */
  comment?: string
}

/** Form 3: the id alone is the key, the English is a fallback. */
export interface KeyedMessage {
  id: MetadataId | readonly string[]
  /**
   * A required string, and the caller supplies it: a field with no label is
   * normal, and what to show then is a rendering decision that differs per
   * surface — a column header falls back to the field name, a hint to nothing.
   */
  defaultMessage: string
  comment?: string
}

/**
 * A message plus what a translator needs. `msg()` returns one, so a constant
 * declared for later rendering is an OBJECT — passing it straight into JSX is a
 * `tsc` error rather than a silently untranslated English string.
 */
export type MessageDescriptor = SourceMessage | KeyedMessage

/** Declare a code message for later rendering with `t()` / `translate()`. */
export function msg(message: string, options: Omit<SourceMessage, 'message'> = {}): SourceMessage {
  return { message, ...options }
}

// ── Segments ────────────────────────────────────────────────────────────────

/**
 * A segment may contain a dot — an enum value is data — so the joiner escapes
 * it and the splitter unescapes. Only possible because the id arrives as
 * segments; a caller that joined by hand could not be corrected.
 */
export function escapeSegment(segment: string): string {
  return segment.replace(/\\/g, '\\\\').replace(/\./g, '\\.')
}

export function joinSegments(segments: readonly string[]): string {
  return segments.map(escapeSegment).join('.')
}

export function splitSegments(key: string): string[] {
  const out: string[] = []
  let current = ''
  for (let i = 0; i < key.length; i++) {
    const c = key[i]
    if (c === '\\' && i + 1 < key.length) {
      current += key[++i]
      continue
    }
    if (c === '.') {
      out.push(current)
      current = ''
      continue
    }
    current += c
  }
  out.push(current)
  return out
}

/** Whether a stored key belongs to the model — the `module.` root. */
export function isMetadataKey(key: string): boolean {
  return key === MODULE_ROOT || key.startsWith(`${MODULE_ROOT}.`)
}

function isKeyedMessage(message: MessageDescriptor): message is KeyedMessage {
  return 'defaultMessage' in message
}

/**
 * Check a metadata id's shape at runtime — the tuple type does it at compile
 * time, but an id assembled from data (`[MODULE_ROOT, slug, table, 'field',
 * field, attr]`) arrives here through `readonly string[]` too.
 */
export function assertMetadataId(id: readonly string[]): asserts id is MetadataId {
  const problem = metadataIdProblem(id)
  if (problem) throw new Error(`Invalid metadata id [${id.join(', ')}]: ${problem}`)
}

function metadataIdProblem(id: readonly string[]): string | null {
  if (id[0] !== MODULE_ROOT) return `the first segment must be "${MODULE_ROOT}"`
  if (id.some((segment) => segment === '')) return 'a segment is empty'
  if (id.length === 3) {
    return (MODULE_ATTRIBUTES as readonly string[]).includes(id[2]) ? null : `"${id[2]}" is not a module attribute`
  }
  if (id.length === 5) {
    if (id[3] !== ENTITY_MARKER) return `position 4 must be "${ENTITY_MARKER}"`
    return (ENTITY_ATTRIBUTES as readonly string[]).includes(id[4]) ? null : `"${id[4]}" is not an entity attribute`
  }
  if (id.length === 6) {
    if (id[3] === FIELD_MARKER) {
      return (FIELD_ATTRIBUTES as readonly string[]).includes(id[5]) ? null : `"${id[5]}" is not a field attribute`
    }
    if (id[3] === ENUM_MARKER) return null
    return `position 4 must be "${FIELD_MARKER}" or "${ENUM_MARKER}"`
  }
  return 'a metadata id has 3, 5 or 6 segments'
}

/**
 * The stored key of a message.
 *
 * Form 1 is the source text; form 2 joins the id and appends the message as
 * it is — the message is text a translator reads in the key, not a segment
 * to escape; form 3 is the joined id. A code key that starts with the
 * reserved root is refused here, which is the assert the whole scheme rests
 * on: a form-3 id that starts with it is a metadata id and must be shaped
 * like one.
 */
export function messageId(message: string | MessageDescriptor): string {
  if (typeof message === 'string') {
    assertCodeKey(message)
    return message
  }
  if (isKeyedMessage(message)) {
    const id = message.id as readonly string[]
    if (id[0] === MODULE_ROOT) assertMetadataId(id)
    return joinSegments(id)
  }
  if (!message.id || message.id.length === 0) {
    assertCodeKey(message.message)
    return message.message
  }
  const key = `${joinSegments(message.id)}.${message.message}`
  assertCodeKey(key)
  return key
}

function assertCodeKey(key: string): void {
  if (isMetadataKey(key)) {
    throw new Error(`"${key}" starts with the reserved segment "${MODULE_ROOT}", which only a metadata id may use`)
  }
}

/** The English a translator reads: the message, or the fallback of a keyed one. */
export function sourceOf(message: string | MessageDescriptor): string {
  if (typeof message === 'string') return message
  return isKeyedMessage(message) ? message.defaultMessage : message.message
}

// ── The file ────────────────────────────────────────────────────────────────

/** A flat map: key to translation. */
export type TranslationMap = Record<string, string>

/**
 * One language, in the single shape every place a language lives speaks — the
 * shipped file, an operator's replacement of it, a stage copy, a work file's
 * source. `messages` is flat: with no scopes and no contexts there are no
 * sections left to route into. `en-US.json` is the same shape with the SOURCE
 * text as the value of every key — the baseline a new language is started
 * from.
 */
export interface LocaleFile {
  locale: string
  /** The language's own name for itself. Wins over `Intl.DisplayNames`. */
  name?: string
  messages?: TranslationMap
  /**
   * Translations whose code string was reworded or removed, kept so they are
   * not lost silently. Never a `module.*` key: nothing retires those.
   */
  obsolete?: TranslationMap
}

/**
 * The translations a file supplies, EMPTY VALUES DROPPED — and that is
 * load-bearing: an empty string is how a file spells "not translated yet", but
 * an entry present with an empty value would make the fallback to the source
 * text depend on Lingui's own truthiness check rather than on us. Absent means
 * absent.
 */
export function flattenMessages(file: LocaleFile): TranslationMap {
  const out: TranslationMap = {}
  for (const [key, translation] of Object.entries(file.messages ?? {})) {
    if (translation) out[key] = translation
  }
  return out
}

/** Every key a file mentions, translated or not — what discovery has already recorded. */
export function knownKeys(file: LocaleFile): string[] {
  return Object.keys(file.messages ?? {})
}

// ── The active language's state ─────────────────────────────────────────────
//
// Module state rather than a value threaded through the tree: `translatedKeys()`
// (translate mode's "missing" marking) and `translateVerbatim()` are both called
// from outside React as well as inside it, and all of it changes exactly when a
// locale is activated. `activateLocale()` is the only writer of the whole map;
// a translate-mode save adds one key.
//
// Lingui holds the same map and renders from it; this copy exists so translate
// mode can show a message's current translation, and the verbatim lookup can
// read a server message's translation, without reaching into Lingui's
// internals — and so the KNOWN keys (empty entries included) are remembered,
// which Lingui's table, holding only what renders, cannot tell apart.

let activeLanguage = SOURCE_LANGUAGE
let activeMessages: TranslationMap = {}
let activeKeys: ReadonlySet<string> = new Set()
let activeKnown: Set<string> = new Set()
let catalogVersion = 0

const listeners = new Set<() => void>()

/**
 * Subscribe to catalog changes. Separate from Lingui's own `change` event
 * because this module deliberately imports nothing — see the header.
 * `activateLocale` emits both, so a component may listen to either.
 */
export function subscribeToCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A counter that changes whenever the catalog does — the dependency
 * `useLocalizedMetadata` memoizes on, and the `useSyncExternalStore` snapshot
 * (which must be a stable primitive, not the map, or every render re-subscribes).
 */
export function catalogSnapshot(): number {
  return catalogVersion
}

/** The merged layer result for `language`. Called by `activateLocale`. */
export function setCatalogState(language: string, messages: TranslationMap, known: Iterable<string> = []): void {
  activeLanguage = language
  activeMessages = messages
  activeKeys = new Set(Object.keys(messages))
  activeKnown = new Set([...known, ...Object.keys(messages)])
  catalogVersion++
  for (const listener of listeners) listener()
}

/** The active language's translations, keyed by stored key, empties dropped. */
export function currentMessages(): TranslationMap {
  return activeMessages
}

/** The active catalog language, for code that cannot reach the Lingui singleton. */
export function currentLanguage(): string {
  return activeLanguage
}

/**
 * Add or clear a single translation in the live map, for translate mode's
 * save. The caller ALSO hands the text to Lingui's replacing `loadAndActivate`
 * — Lingui is what renders it; this keeps `translatedKeys` and the panel's view
 * of the current translation in step with it. Clearing removes the key from
 * the rendered map and leaves it KNOWN: an empty entry is still an entry.
 */
export function addMessageEntry(id: string, text: string): void {
  const next = { ...activeMessages }
  if (text) next[id] = text
  else delete next[id]
  activeMessages = next
  activeKeys = new Set(Object.keys(next))
  activeKnown.add(id)
  catalogVersion++
  for (const listener of listeners) listener()
}

/** Record that discovery has written `id` into the active language's file. */
export function markKnownKey(id: string): void {
  activeKnown.add(id)
}

/**
 * Whether the active language's file already mentions `id`, translated or
 * not — the test discovery applies before writing an empty entry.
 */
export function isKnownKey(id: string): boolean {
  return activeKnown.has(id)
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
