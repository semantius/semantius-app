import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { validateData } from 'sem-schema'
import { assertSupportedFormats, resolveControl } from './resolveControl'
import { generateDefaultValue, isSyntheticLabelField } from './formDefaults'
import { withRuleContext, type RecordContext } from '@/lib/ruleContext'
import { modelDefault } from '@/lib/modelDefaults'
import { appError } from '@/lib/appError'
import { renderError } from '@/lib/apiErrors'
import {
  applyJsonLogic,
  collectSetRecordLookups,
  computedValueChanged,
  evaluateComputedFieldsWithRecords,
  idColumnForEntity,
  inputSnapshot,
  loadRuleRecords,
  lookupFromCache,
  parseComputedFields,
  type CachedRecords,
  type ComputedField,
  type RecordCache,
} from '@/lib/computedFields'
import { Button } from '@/components/ui/button'
import { StickyContainer } from '@/components/ui-ext/sticky-container'
import type { SchemaObject } from 'ajv'
import { FormProvider } from './FormContext'
import { localizeValidationErrors } from './validationMessages'
import { useLanguage, useT, type TranslateFn } from '@/i18n'
import type { InputMode } from './types'

export type FormMode = 'edit' | 'create' | 'view'

const VALID_INPUT_MODES: readonly InputMode[] = ['default', 'required', 'readonly', 'disabled', 'hidden']

/**
 * Derived columns: a rollup is aggregated from children, a computed /
 * computed_label value is produced by `computed_fields`. The server owns their
 * value, so the ctype, not the mode, decides that it is never submitted and
 * never required: writing one back either overwrites the derivation or is
 * rejected, and a required one would make the user type a value the server
 * replaces before the form lets them save. That holds in every mode, declared
 * or from a rule, `hidden` and `readonly` included — there is no mode for "not
 * drawn and not sent", and `hidden` must keep sending for an ordinary field
 * such as the parent link.
 *
 * The mode still decides how the field is drawn. `get_schema` ships derived
 * columns with `inputMode: 'default'`, or `required` when the column is NOT NULL
 * (`orders.label`, a computed_label that is the entity's label column); either
 * is drawn as `disabled` — shown, not editable. An explicit readonly or hidden
 * is drawn as declared.
 */
const DERIVED_CTYPES: Record<string, true> = {
  rollup: true,
  computed: true,
  computed_label: true,
}

function isInputMode(value: unknown): value is InputMode {
  return typeof value === 'string' && (VALID_INPUT_MODES as readonly string[]).includes(value)
}

function isDerivedCtype(propSchema: SchemaObject): boolean {
  const ctype = (propSchema as { ctype?: unknown }).ctype
  return typeof ctype === 'string' && Object.hasOwn(DERIVED_CTYPES, ctype)
}

function coerceDerivedCtypeMode(propSchema: SchemaObject, declared: unknown): InputMode {
  const inputMode: InputMode = isInputMode(declared) ? declared : 'default'
  if ((inputMode === 'default' || inputMode === 'required') && isDerivedCtype(propSchema)) return 'disabled'
  return inputMode
}

/** The id column `set_record` looks a row of `entity` up by, read off the form's reference fields. */
function idColumnFor(schema: SchemaObject): (entity: string) => string {
  const properties = schema.properties as
    | Record<string, { reference_table?: string; reference_table_id_column?: string }>
    | undefined
  return (entity) => idColumnForEntity(properties, entity)
}

/**
 * Re-evaluate `table.computed_fields` whenever a non-computed input changes,
 * the same way `input_type_rule` re-runs through `form.Subscribe`. The first
 * values are skipped so opening an existing record does not rewrite stored
 * amounts with a client-side float that would mark the form dirty.
 *
 * The rules get `$old` and `$mode` as the server gives them (`record`). A rule
 * that throws leaves its field as it is, and `onErrors` hears which fields'
 * rules threw in this evaluation and why, so the form can show it.
 */
function ComputedFieldsSync({
  form,
  entries,
  values,
  schema,
  cache,
  record,
  onErrors,
}: {
  form: { setFieldValue: (name: string, value: unknown) => void }
  entries: ComputedField[]
  values: Record<string, unknown>
  schema: SchemaObject
  cache: RecordCache
  record: RecordContext
  onErrors: (errors: Record<string, unknown>) => void
}) {
  const prevInputsRef = useRef<string | undefined>(undefined)
  const computedNames = new Set(entries.map((entry) => entry.name))
  const snapshot = inputSnapshot(values, computedNames)

  useEffect(() => {
    if (prevInputsRef.current === undefined) {
      prevInputsRef.current = snapshot
      return
    }
    if (prevInputsRef.current === snapshot) return
    prevInputsRef.current = snapshot

    let canceled = false

    void (async () => {
      const { updates, errors } = await evaluateComputedFieldsWithRecords(entries, values, cache, idColumnFor(schema), record)
      if (canceled) return
      // A dotted name is a path, for setFieldValue as for the server.
      for (const [name, next] of Object.entries(updates)) {
        if (computedValueChanged(values, name, next)) form.setFieldValue(name, next)
      }
      onErrors(errors)
    })()

    return () => {
      canceled = true
    }
  }, [snapshot, entries, form, schema, values, cache, record, onErrors])

  return null
}

/**
 * Fetch the rows the form's `input_type_rule`s ask for through `set_record`, into
 * the cache computed fields use, whenever the inputs change. `onLoaded` is told
 * when a row arrived, so the rules are evaluated again with it.
 */
function InputTypeRuleRecordsSync({
  rules,
  values,
  schema,
  cache,
  onLoaded,
}: {
  rules: ComputedField[]
  values: Record<string, unknown>
  schema: SchemaObject
  cache: RecordCache
  onLoaded: () => void
}) {
  useEffect(() => {
    let canceled = false
    void (async () => {
      const arrived = await loadRuleRecords(
        rules.map((rule) => rule.jsonlogic),
        values,
        cache,
        idColumnFor(schema),
      )
      if (!canceled && arrived) onLoaded()
    })()
    return () => {
      canceled = true
    }
  }, [values, rules, schema, cache, onLoaded])

  return null
}

/** Two sets of rule errors that would render the same: the same fields, failing the same way. */
function sameErrors(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  const signature = (error: unknown) =>
    error instanceof Error ? `${error.message}${JSON.stringify(error.cause ?? null)}` : String(error)
  return keys.every((key) => Object.hasOwn(b, key) && signature(a[key]) === signature(b[key]))
}

/** What a field's input_type_rule decided: a mode, or none and why not. */
interface RuleOutcome {
  /** The mode the rule set; null keeps the static schema inputMode. */
  mode: InputMode | null
  /** Why the rule set none, to show under the field. */
  error?: unknown
}

/**
 * Whether a field has an input_type_rule. A missing key, or the empty object the
 * server stores for "no rule", is none. Anything else is a rule, a literal such
 * as "hidden" included: the server saves a literal rule (check_field_rules), and
 * runs no required check on a field that has one, so the browser must evaluate it.
 */
function hasInputTypeRule(rule: unknown): boolean {
  if (rule === undefined) return false
  const isEmptyObject = rule !== null && typeof rule === 'object' && !Array.isArray(rule) && Object.keys(rule).length === 0
  return !isEmptyObject
}

/**
 * Evaluate a per-field input_type_rule (JsonLogic) against the current form
 * values. No rule, or a `set_record` row not fetched yet, keeps the static
 * mode silently. A rule that throws, or returns something that is not an input
 * mode, keeps the static mode and says why.
 */
function evaluateInputTypeRule(
  rule: unknown,
  values: Record<string, any>,
  records: CachedRecords = lookupFromCache(new Map()),
): RuleOutcome {
  if (!hasInputTypeRule(rule)) return { mode: null }
  const data = withRuleContext(values)
  // A rule that read a row which has not arrived keeps the static mode silently;
  // InputTypeRuleRecordsSync fetches it and the form evaluates the rule again.
  const before = records.misses
  let result: unknown
  try {
    result = applyJsonLogic(rule, data, records)
  } catch (error) {
    return records.misses > before ? { mode: null } : { mode: null, error }
  }
  if (records.misses > before) return { mode: null }
  if (isInputMode(result)) return { mode: result }
  return {
    mode: null,
    error: appError({
      message: 'The rule returned {value}, which is not an input mode.',
      values: { value: JSON.stringify(result) ?? 'null' },
    }),
  }
}

/**
 * A rule's error with what the server's generated trigger adds to it
 * (docs/error-contract.md, "The generated trigger"): class 90 passes through
 * untouched; any other server-shaped error gets `entity` and `field` merged
 * into its hint object, keeping keys it already has, and a hint that is not a
 * JSON object is wrapped as `{ hint }` first. `entity` is what scopes a class
 * 99 error's translation key. The app's own errors are left as they are.
 */
function scopeRuleError(error: unknown, entity: string | undefined, field: string): unknown {
  if (!(error instanceof Error) || error.constructor !== Error) return error
  const cause = error.cause as { code?: unknown; message?: unknown; hint?: unknown } | undefined
  if (!cause || typeof cause.code !== 'string' || typeof cause.message !== 'string') return error
  if (cause.code.startsWith('90')) return error
  let hint: Record<string, unknown> = {}
  if (typeof cause.hint === 'string' && cause.hint) {
    try {
      const parsed: unknown = JSON.parse(cause.hint)
      hint = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { hint: cause.hint }
    } catch {
      hint = { hint: cause.hint }
    }
  }
  const scoped = { ...(entity ? { entity } : {}), field, ...hint }
  return new Error(error.message, { cause: { ...cause, hint: JSON.stringify(scoped) } })
}

/**
 * The mode a field is drawn in, or `null` when the form does not draw it.
 *
 * This is the only place that composes `input_type_rule` with the static
 * `inputMode`. The renderer and the field validator both take this result — the
 * asterisk and the empty check cannot disagree. `resolvedInputMode` is the same
 * function when the caller has form values instead of a precomputed rule result.
 */
function renderedInputMode(
  key: string,
  propSchema: SchemaObject,
  ruleResult: InputMode | null,
  formMode: FormMode,
  parentField: string | undefined,
): InputMode | null {
  // parentField (injected via _pf/_pv) is always hidden — it carries the foreign
  // key that links this child record to its parent and must not be visible or
  // editable by the user.
  if (key === parentField) return 'hidden'
  // input_type_rule (JsonLogic) overrides the static schema inputMode when it
  // evaluates to a valid InputMode against current form values. A derived
  // ctype (rollup / computed / computed_label) still maps `default` or
  // `required` — from the schema or from the rule — onto `disabled`.
  const inputMode = coerceDerivedCtypeMode(
    propSchema,
    ruleResult || (propSchema as { inputMode?: unknown }).inputMode,
  )
  // In create mode, readonly and disabled fields are not drawn: an id or a
  // created_at has no value before the save. A computed field does — the form
  // computes it live from the inputs being typed (ComputedFieldsSync), and that
  // is when the user needs to see it — so it is drawn, not editable. A rollup
  // (no children yet) stays off a create form.
  //
  // A computed label is never on a create form, whatever its mode or rule says.
  // It names the record, and the name is often built from what only the save
  // produces — `orders.label` is `Order {id}` — so a new record would show an
  // empty, disabled box titled after the id.
  const ctype = (propSchema as { ctype?: unknown }).ctype
  if (formMode === 'create' && ctype === 'computed_label') return null
  if (formMode === 'create' && (inputMode === 'readonly' || inputMode === 'disabled') && ctype !== 'computed') return null
  // Form-level view mode overrides schema-level inputMode (except for hidden).
  if (formMode === 'view' && inputMode !== 'hidden') return 'readonly'
  return inputMode
}

/**
 * `renderedInputMode` against the current form values: evaluate the field's
 * `input_type_rule` first, then apply formMode / parentField.
 */
function resolvedInputMode(
  key: string,
  propSchema: SchemaObject,
  values: Record<string, any>,
  formMode: FormMode,
  parentField: string | undefined,
  records?: CachedRecords,
): InputMode | null {
  return renderedInputMode(
    key,
    propSchema,
    evaluateInputTypeRule((propSchema as any).input_type_rule, values, records).mode,
    formMode,
    parentField,
  )
}

interface SchemaFormProps {
  schema: SchemaObject
  initialValue?: Record<string, any>
  onSubmit?: (value: Record<string, any>) => void
  formMode?: FormMode
  id?: string
  onBeforeSubmit?: (submitter: Element | null) => void
  /**
   * Field name injected via _pf/_pv URL params (parent relationship pre-fill).
   * Unlike regular readonly fields that are skipped in create mode, this field is
   * always rendered as readonly AND always included in form submission — it carries
   * the foreign key value that ties the new child record to its parent.
   */
  parentField?: string
  /**
   * Content rendered inside the sticky footer, directly above the action buttons.
   * Used for submit-time API errors (e.g. create/update failures) so the message
   * pins together with the buttons and stays visible — a footer that is
   * `position: sticky; bottom: 0` would otherwise push any error rendered *after*
   * the form off-screen, since the footer's height never grows to reveal it.
   */
  footerContent?: React.ReactNode
}

/**
 * Validate a single field value against its schema
 *
 * `t` and `language` are parameters rather than hooks because this runs outside
 * React — it is called from the field validators and from the form context. The
 * component that owns the form reads them once and passes them down, which is
 * the same shape `formatDeleteError` uses.
 *
 * @param value - The value to validate
 * @param fieldSchema - The JSON Schema for this specific field
 * @param fieldName - The name of the field being validated
 * @param t - The active translate function
 * @param language - The catalog language, for the Ajv message localizer
 * @param inputMode - The resolved mode (`renderedInputMode` / `resolvedInputMode`),
 *   not the static schema `inputMode`. sem-schema only knows the static keyword,
 *   so this is passed in and stamped onto the temp schema below — the one adapter,
 *   not a second opinion at each call site.
 * @returns Error message if validation fails, undefined if valid
 */
function validateField(
  value: any,
  fieldSchema: SchemaObject,
  fieldName: string,
  t: TranslateFn,
  language: string,
  inputMode: InputMode,
): string | undefined {
  const isRequired = inputMode === 'required'

  // For required fields, check for empty values
  if (isRequired) {
    if (value === undefined || value === null || value === '') {
      return t('must not be empty')
    }
  }

  // For non-required fields, if value is empty/undefined, skip validation
  // This prevents enum validation errors when no selection is made on optional fields
  if (!isRequired && (value === undefined || value === null || value === '')) {
    return undefined
  }

  // Create a temporary schema for this field within an object.
  // Stamp the resolved mode so validateData's inputMode filter matches the
  // asterisk — it cannot see `input_type_rule`.
  const tempSchema: SchemaObject = {
    type: 'object',
    properties: {
      [fieldName]: { ...fieldSchema, inputMode },
    },
    // Include required if this field is required at object level
    ...(isRequired ? { required: [fieldName] } : {})
  }

  // `object` and `array` are edited in the JSON editor, which hands back a
  // STRING. sem-schema parses `json` and `jsonlogic` itself, but for these two
  // it type-checks what it is given — so an unparseable string must stay a
  // string and fail as a type error, while a parseable one has to be a real
  // value before it is checked against the schema.
  const format = (fieldSchema as any).format
  let checked = value
  if ((format === 'object' || format === 'array') && typeof value === 'string') {
    try {
      checked = JSON.parse(value)
    } catch {
      checked = value
    }
  }

  const tempData = { [fieldName]: checked }
  // sem-schema compiles the schema, and a schema the platform sent can be
  // one Ajv refuses (an unknown keyword, a broken pattern). That is a
  // form-level schema error, never an unhandled rejection inside a validator
  // that TanStack Form will not catch.
  let result: ReturnType<typeof validateData>
  try {
    result = validateData(tempData, tempSchema)
  } catch (err) {
    return err instanceof Error ? err.message : t('Validation error')
  }

  if (!result.valid && result.errors) {
    localizeValidationErrors(result.errors, language, t)
    // Find the first error for this field
    const fieldError = result.errors.find((err: any) =>
      err.instancePath === `/${fieldName}` || err.instancePath === ''
    )
    return fieldError ? fieldError.message : t('Validation error')
  }

  return undefined
}


/** The nearest ancestor that scrolls vertically, or `null` for the window. */
function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let el = element.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return el
  }
  return null
}

/**
 * D6: once the Submit bar has pinned, it stays at the bottom of its scroll
 * container until the form unmounts, even when the form gets short enough to
 * fit again (error lines going away), instead of jumping back up.
 *
 * Pinned is what the tests measure: the bar's bottom is the scroll container's
 * bottom edge while the form continues below it. It is checked on scroll, on
 * resize and whenever the fields grow. From then on the fields' tallest height
 * is their `min-height`. It goes on the fields, not on the form: a sticky
 * `bottom` element is never moved DOWN from where it would be, so room added
 * after the bar (the form's own min-height) would leave the bar to move up with
 * the fields; room kept above it holds its place.
 */
function useBarStaysPinned(formRef: RefObject<HTMLFormElement | null>, schema: SchemaObject, formMode: FormMode) {
  useEffect(() => {
    const form = formRef.current
    const fields = form?.querySelector<HTMLElement>(':scope > .grid-container')
    const bar = form?.querySelector<HTMLElement>(':scope > [data-slot="sticky-container"]')
    if (!form || !fields || !bar) return
    const container = scrollContainerOf(form)
    const edge = () => container
      ? container.getBoundingClientRect().top + container.clientTop + container.clientHeight
      : document.documentElement.clientHeight
    let pinned = false
    let tallest = 0

    const hold = () => {
      const height = fields.getBoundingClientRect().height
      if (height <= tallest) return
      tallest = height
      fields.style.minHeight = `${tallest}px`
    }
    const check = () => {
      if (pinned) return
      const bottom = edge()
      if (Math.abs(bar.getBoundingClientRect().bottom - bottom) <= 1 && form.getBoundingClientRect().bottom > bottom + 1) {
        pinned = true
        hold()
      }
    }

    const observer = new ResizeObserver(() => (pinned ? hold() : check()))
    observer.observe(fields)
    const scroller: HTMLElement | Window = container ?? window
    scroller.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    check()
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      fields.style.minHeight = ''
    }
  }, [formRef, schema, formMode])
}

/**
 * A field's default display width.
 *
 * The buckets live on the registry entry (`controls.ts`), so the form and the
 * grid read one list instead of keeping two that drift — they already had.
 * An unknown format resolves to `text` (width `m`); a missing one has already
 * thrown from `assertSupportedFormats`.
 */
function getDefaultWidthForForm(format?: string): 's' | 'm' | 'w' {
  return resolveControl({ format })?.width ?? 'm'
}

/**
 * Map a width value to CSS grid column class names
 */
function getWidthClasses(width: string): string {
  switch (width) {
    case 's': return 'span-2'
    case 'm': return 'span-4'
    case 'w': return 'span-8'
    case 'ns': return 'span-2 start-1'
    case 'nm': return 'span-4 start-1'
    case 'nw': return 'span-8 start-1'
    default: return 'span-4'
  }
}

export function SchemaForm({ schema, initialValue, onSubmit, formMode = 'edit', id, onBeforeSubmit, parentField, footerContent }: SchemaFormProps) {
  const t = useT()
  // The Ajv message localizer is keyed by language, not by the formatting
  // locale: a validation message is prose, so it follows the catalog.
  const language = useLanguage()

  // Before anything else, including the default values below: a field with no
  // format throws here (the throw reaches the router's defaultErrorComponent).
  // An unknown format name is logged and the field renders as text.
  assertSupportedFormats(schema)

  // Seeded once per schema: a `gen_random_uuid()` or `CURRENT_TIMESTAMP` default
  // computed on every render would hand useForm new default values each time.
  // A `CURRENT_USER` default reads the signed-in user's id here, which is known
  // by now: ProtectedRoute renders nothing until get_userinfo has answered.
  const seeded = useMemo(() => generateDefaultValue(schema), [schema])
  // Merge schema defaults under initialValue so explicit values win
  // but defaults fill gaps (e.g. parent FK pre-filled, other fields blank).
  const defaultValue = { ...seeded.values, ...(initialValue || {}) }

  // The rows `set_record` fetched, one cache for computed fields and
  // input_type_rules alike. The Map is stable; fetches add to it.
  const [recordCache] = useState<RecordCache>(() => new Map())
  const records = lookupFromCache(recordCache)
  // Re-renders the form when a row an input_type_rule needs has arrived, so the
  // rule is evaluated again with it.
  const [, setRecordsLoaded] = useState(0)
  const onRecordsLoaded = useCallback(() => setRecordsLoaded((count) => count + 1), [])
  // The input_type_rules that read a row through set_record.
  const ruleRecordEntries = useMemo<ComputedField[]>(
    () =>
      Object.entries((schema.properties ?? {}) as Record<string, { input_type_rule?: unknown }>)
        .filter(([, prop]) => prop && typeof prop === 'object' && collectSetRecordLookups(prop.input_type_rule).length > 0)
        .map(([name, prop]) => ({ name, jsonlogic: prop.input_type_rule })),
    [schema],
  )
  // `$old` and `$mode`, as the server gives computed fields.
  const recordContext = useMemo<RecordContext>(
    () => (formMode === 'create' ? { old: null, mode: 'insert' } : { old: initialValue ?? null, mode: 'update' }),
    [formMode, initialValue],
  )
  // Why each computed field's rule threw in its last evaluation, to show under it.
  const [computedErrors, setComputedErrors] = useState<Record<string, unknown>>({})
  const onComputedErrors = useCallback((errors: Record<string, unknown>) => {
    setComputedErrors((previous) => (sameErrors(previous, errors) ? previous : errors))
  }, [])

  const form = useForm({
    defaultValues: defaultValue,
    validationLogic: revalidateLogic({ mode: 'blur', modeAfterSubmission: 'change' }),
    onSubmit: async ({ value }) => {
      // Build object with all schema properties for validation
      const cleanedValue: Record<string, any> = {}
      
      // Get all possible fields from schema
      const properties = (schema.properties ?? {}) as Record<string, SchemaObject>
      const allFields = Object.keys(properties)

      // A field's mode as declared, and as it is now: its input_type_rule
      // evaluated against these values, derived ctypes coerced as they are drawn.
      // What the user can no longer fill must not be demanded, and what is
      // disabled now must not be sent — so those two decisions follow the mode
      // a rule set, not the declared one.
      const declaredMode = (key: string): InputMode =>
        coerceDerivedCtypeMode(properties[key], (properties[key] as { inputMode?: unknown }).inputMode)
      const modeNow = (key: string): InputMode => {
        const propSchema = properties[key]
        const ruleResult = evaluateInputTypeRule((propSchema as { input_type_rule?: unknown }).input_type_rule, value, records).mode
        return coerceDerivedCtypeMode(propSchema, ruleResult || (propSchema as { inputMode?: unknown }).inputMode)
      }

      // A field a rule has put out of the user's reach: readonly or hidden now,
      // declared as neither. It cannot be filled, so it is not demanded. A value it
      // holds is still sent and still has to meet its constraints: a has_a key
      // typed into a create form, whose rule then made it readonly and so took it
      // off the form, is still checked rather than silently dropped.
      const outOfReachByRule = (key: string): boolean => {
        const now = modeNow(key)
        const declared = declaredMode(key)
        return (now === 'readonly' || now === 'hidden') && declared !== 'readonly' && declared !== 'hidden'
      }

      // Whether a field's value goes into the request:
      // - synthetic label companions and derived ctypes: never (see below)
      // - disabled now, declared or by a rule: NEVER submitted (HTML standard behavior)
      // - readonly: submitted (part of the data), except a declared readonly field
      //   in create mode, which the form does not draw and which usually does not
      //   exist yet. The parent field (injected via _pf/_pv) is always submitted.
      const isSent = (key: string): boolean => {
        const propSchema = properties[key]
        // Synthetic label companions (ctype '_label' / 'fk_label') are computed,
        // non-writable projections — not real columns. Including them in the body
        // makes PostgREST reject the whole write with PGRST204. They're also
        // 'readonly', so in edit mode they would otherwise be submitted.
        if (isSyntheticLabelField(propSchema)) return false
        // The server owns a derived value: a hidden or readonly one is left out
        // like a disabled one. See DERIVED_CTYPES.
        if (isDerivedCtype(propSchema)) return false
        if (modeNow(key) === 'disabled') return false
        if (formMode === 'create' && declaredMode(key) === 'readonly' && modeNow(key) === 'readonly' && key !== parentField) {
          return false
        }
        return true
      }

      for (const key of allFields) {
        const propSchema = properties[key]

        if (!isSent(key)) continue

        const format = (propSchema as any).format
        const fieldValue = value[key]
        const entry = resolveControl({ format })

        if (entry?.emptyValue === 'default' && typeof fieldValue === 'string') {
          // The JSON family (json, jsonlogic, object, array). The editor always
          // hands back a *string*; the column wants a real JSON value, so an
          // edited `[]` must not be sent as the literal string `"[]"`. An empty
          // editor saves the value of the property's schema `default` — that
          // default is text too (`"[]"` for entities.computed_fields), so it goes
          // through modelDefault — and `null` when it has none or the browser
          // cannot compute it (a create then leaves it out, below). Invalid JSON
          // is left as the string so schema/DB validation surfaces it rather
          // than silently dropping what the user typed.
          const trimmed = fieldValue.trim()
          if (trimmed === '') {
            const declared = 'default' in (propSchema as any) ? modelDefault((propSchema as any).default, { format, reference_table: (propSchema as any).reference_table }) : null
            cleanedValue[key] = declared ? declared.value : null
          } else {
            try {
              cleanedValue[key] = JSON.parse(trimmed)
            } catch {
              cleanedValue[key] = fieldValue
            }
          }
        } else if (entry?.emptyValue === 'null' && fieldValue === '') {
          // A typed column (date/time/uuid/bytea) rejects an empty string, and an
          // optional `type: string` field defaults to `''`.
          cleanedValue[key] = null
        } else {
          // A cleared foreign key is null; send it as absent so AJV does not see
          // a null where the schema says integer.
          cleanedValue[key] = ((format === 'reference' || format === 'parent') && fieldValue === null) ? undefined : fieldValue
        }
      }
      
      // DEFENSIVE: This should never happen because view mode has no submit button
      // If we reach here, something is seriously broken in the form rendering logic
      if (formMode === 'view') {
        throw new Error('BUG: Form submitted in view mode, but view mode should have no submit button!')
      }
      
      // The mode each field is validated in. sem-schema's validateData reads
      // `inputMode` off each property and demands a value for every `required`
      // one, on top of the `required` list below, so the schema it is handed
      // carries these modes rather than the declared ones:
      // - never sent: `disabled`, so nothing about it is checked;
      // - out of the user's reach by a rule: `default`, so it is not demanded,
      //   but a value it holds still has to meet its constraints;
      // - otherwise the mode it is in now, so one a rule made required is demanded.
      const validationMode = (key: string): InputMode => {
        if (!isSent(key)) return 'disabled'
        if (outOfReachByRule(key)) return 'default'
        return modeNow(key)
      }

      let validationSchema: SchemaObject = {
        ...schema,
        properties: Object.fromEntries(
          allFields.map((key) => [key, { ...properties[key], inputMode: validationMode(key) }]),
        ),
      }

      if (schema.required && Array.isArray(schema.required)) {
        // A field that is not sent, or that a rule put out of the user's reach,
        // is not required. The parent field is always kept.
        const filteredRequired = schema.required.filter(
          (fieldName: string) =>
            !properties[fieldName]
            || fieldName === parentField
            || (isSent(fieldName) && !outOfReachByRule(fieldName)),
        )
        validationSchema = { ...validationSchema, required: filteredRequired }
      }
      
      const requiredFields = new Set<string>(Array.isArray(validationSchema.required) ? validationSchema.required : [])

      // A create request leaves an empty optional field OUT, so the database
      // fills it in. For a text column that changes nothing — get_schema
      // declares a default on every optional text property, almost all `""` —
      // but it is the only way to create a record whose key the database
      // assigns while the form still offers it: a has_a key takes its base
      // record's key when absent, and rejects `''` as a malformed TypeID.
      // An edit keeps the `''`: leaving the field out of a PATCH would make
      // clearing a text field impossible.
      //
      // A field whose default the browser cannot compute (`nextval(…)`,
      // `CURRENT_USER` on a text column, see modelDefault) is left out the same way while it is
      // empty, `null` included, so the column default applies: a typed empty
      // value is sent as an explicit `null`, which would override it.
      if (formMode === 'create') {
        for (const key of Object.keys(cleanedValue)) {
          const optional = !requiredFields.has(key)
            && resolvedInputMode(key, properties[key], value, formMode, parentField, records) !== 'required'
          if (cleanedValue[key] === '' && optional) delete cleanedValue[key]
          else if (seeded.uncomputed.has(key) && (cleanedValue[key] === '' || cleanedValue[key] == null)) delete cleanedValue[key]
        }
      }

      // For AJV validation, omit empty values of optional fields — null,
      // undefined and `''` alike, which is what the per-field check does too.
      // AJV rejects null for type:'string' (produces "must be string"), and `''`
      // fails any `pattern` or `minLength`, but an empty optional field is valid.
      const validationValue = Object.fromEntries(
        Object.entries(cleanedValue).filter(([key, val]) =>
          requiredFields.has(key) || (val !== null && val !== undefined && val !== '')
        )
      )

      // Validate the entire form
      let result
      try {
        result = validateData(validationValue, validationSchema)
      } catch (error) {
        // Schema validation error (invalid schema structure)
        const errorMessage = error instanceof Error ? error.message : t('Invalid schema')
        console.error('Schema validation error:', errorMessage)
        
        // Set a form-level error to display the schema error
        form.setFieldMeta('_schemaError', (prev: any) => ({
          ...prev,
          errors: [errorMessage],
          errorMap: {
            onSubmit: errorMessage,
          }
        }))
        
        return
      }
      
      if (!result.valid) {
        // Log validation failure for debugging
        console.warn('Form validation failed:', result.errors)

        // Ajv writes its own messages in English; translate them before any of
        // them is copied into field or form state below.
        localizeValidationErrors(result.errors, language, t)

        // Track errors that couldn't be assigned to fields
        const unhandledErrors: string[] = []
        let firstErrorField: string | null = null
        
        // Set errors on all fields with validation issues
        if (result.errors) {
          result.errors.forEach((error: any) => {
            // Remove leading slash from instancePath to get field name
            const fieldPath = error.instancePath.startsWith('/') 
              ? error.instancePath.substring(1) 
              : error.instancePath
            
            // Check if this field exists in the form
            const propSchema = fieldPath ? (schema.properties as Record<string, SchemaObject> | undefined)?.[fieldPath] : undefined

            // An error needs somewhere on screen to appear. A field the form
            // does not draw has none — a hidden one, or one a rule made readonly
            // in a create form — so its error goes to the banner under the
            // field's title instead of disappearing with the field.
            const mode = propSchema
              ? resolvedInputMode(fieldPath, propSchema, value, formMode, parentField, records)
              : null
            if (propSchema && (mode === null || mode === 'hidden')) {
              unhandledErrors.push(t('{field}: {message}', { field: propSchema.title || fieldPath, message: error.message }))
            } else if (fieldPath && propSchema) {
              // Track first field with error for scrolling
              if (!firstErrorField) {
                firstErrorField = fieldPath
              }
              
              form.setFieldMeta(fieldPath, (meta) => ({
                ...meta,
                errors: [error.message],
                errorMap: {
                  ...meta.errorMap,
                  onSubmit: error.message,
                }
              }))
            } else {
              // Error can't be attached to a field - collect for general error display
              const errorMsg = fieldPath 
                ? `${fieldPath}: ${error.message}` 
                : error.message
              unhandledErrors.push(errorMsg)
            }
          })
        }
        
        // If there are unhandled errors, show them in a general validation error banner
        if (unhandledErrors.length > 0) {
          form.setFieldMeta('_validationError', (prev: any) => ({
            ...prev,
            errors: unhandledErrors,
            errorMap: {
              onSubmit: unhandledErrors.join('; '),
            }
          }))
        }
        
        // Scroll to first error field
        if (firstErrorField) {
          // Use setTimeout to allow DOM to update with error messages first
          setTimeout(() => {
            if (firstErrorField) {
              const errorElement = document.getElementById(firstErrorField)
              if (errorElement) {
                errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                errorElement.focus({ preventScroll: true })
              }
            }
          }, 100)
        }
        
        // Do not call onSubmit callback when validation fails
        return
      }
      
      // Clear any previous general validation errors on successful validation
      form.setFieldMeta('_validationError', (prev: any) => ({
        ...prev,
        errors: [],
        errorMap: {}
      }))
      
      // Clear field-level errors on successful validation
      for (const key of allFields) {
        form.setFieldMeta(key, (meta) => ({
          ...meta,
          errors: [],
          errorMap: {}
        }))
      }
      
      // Only call onSubmit when validation passes (with cleaned data)
      onSubmit?.(cleanedValue)
    },
  })

  const formRef = useRef<HTMLFormElement>(null)
  useBarStaysPinned(formRef, schema, formMode)

  if (!schema.properties || typeof schema.properties !== 'object') {
    return <div>{t('Invalid schema: no properties defined')}</div>
  }

  const properties = schema.properties as Record<string, SchemaObject>
  // The entity's table name, which scopes a class 99 rule error's translation key.
  const entityName = (schema as { table?: { table_name?: string } }).table?.table_name
  const computedFields = parseComputedFields(
    (schema as { table?: { computed_fields?: unknown } }).table?.computed_fields,
  )

  // Create context value for form controls - includes form instance
  const formContextValue = {
    form,
    schema,
    formMode,
    validateField: (value: any, fieldName: string) => {
      const fieldSchema = properties[fieldName]
      if (!fieldSchema) return undefined
      const mode = resolvedInputMode(fieldName, fieldSchema, form.state.values, formMode, parentField, records) ?? 'hidden'
      return validateField(value, fieldSchema, fieldName, t, language, mode)
    },
  }

  return (
    <FormProvider value={formContextValue}>
      <form
        ref={formRef}
        id={id}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onBeforeSubmit?.((e.nativeEvent as SubmitEvent).submitter)
          // Every attempt starts with no submit errors. TanStack Form re-runs
          // the validators of MOUNTED fields only, and `handleSubmit` stops
          // before our onSubmit while any field meta holds an error — so an
          // error parked on a field that has since left the screen, or on the
          // `_validationError` / `_schemaError` banners, which have no validator
          // at all, blocked every later submit: the button did nothing. The
          // validators and the whole-form check below set again what still holds.
          // That includes `onDynamic`, where the field validators write (see the
          // validators below): a blur error must not end the attempt either.
          for (const key of [...Object.keys(schema.properties ?? {}), '_validationError', '_schemaError']) {
            const errorMap = form.getFieldMeta(key)?.errorMap
            if (!errorMap?.onSubmit && !errorMap?.onDynamic) continue
            form.setFieldMeta(key, (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: undefined, onDynamic: undefined } }))
          }
          form.handleSubmit()
          
          // After validation, scroll to first error field if any
          // Use setTimeout to ensure validation has completed and DOM has updated
          setTimeout(() => {
            // Get all fields from schema
            const allFields = schema.properties ? Object.keys(schema.properties) : []
            
            // Find first field with error
            for (const fieldName of allFields) {
              const fieldMeta = form.getFieldMeta(fieldName)
              if (fieldMeta?.errors && fieldMeta.errors.length > 0) {
                const errorElement = document.getElementById(fieldName)
                if (errorElement) {
                  errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  errorElement.focus({ preventScroll: true })
                }
                break
              }
            }
          }, 100)
        }}
        // View mode flattens every field surface. `[data-field-surface]` is the
        // marker the non-`<input>` controls carry — the enum and reference
        // triggers, the date-time trigger, the four CodeMirror wrappers — because
        // this list could only ever name the elements someone remembered to add,
        // and those four kept their boxes while the text fields beside them lost
        // theirs. New picker-style controls get the attribute, not a new selector.
        // max-w caps the form on wide screens: the field grid is authored as two
        // columns, so past ~1250px fields only grow wider than their values.
        className={formMode === 'view'
          ? "max-w-[1250px] space-y-4 [&_[data-slot=input]]:border-transparent [&_[data-slot=input]]:shadow-none [&_[data-slot=combobox-trigger]]:border-transparent [&_[data-slot=combobox-trigger]]:shadow-none [&_[data-field-surface]]:border-transparent [&_[data-field-surface]]:shadow-none [&_[data-field-surface]]:ring-0 [&_[data-slot=input-group]]:border-transparent [&_[data-slot=input-group]]:shadow-none [&_textarea]:border-transparent [&_textarea]:shadow-none [&_.cm-editor]:border-transparent [&_input::placeholder]:text-transparent [&_textarea::placeholder]:text-transparent"
          : "max-w-[1250px] space-y-4"
        }
      >
      {formMode !== 'view' && computedFields.length > 0 && (
        <form.Subscribe selector={(state: { values: Record<string, unknown> }) => state.values}>
          {(values: Record<string, unknown>) => (
            <ComputedFieldsSync
              form={form}
              entries={computedFields}
              values={values}
              schema={schema}
              cache={recordCache}
              record={recordContext}
              onErrors={onComputedErrors}
            />
          )}
        </form.Subscribe>
      )}

      {ruleRecordEntries.length > 0 && (
        <form.Subscribe selector={(state: { values: Record<string, unknown> }) => state.values}>
          {(values: Record<string, unknown>) => (
            <InputTypeRuleRecordsSync
              rules={ruleRecordEntries}
              values={values}
              schema={schema}
              cache={recordCache}
              onLoaded={onRecordsLoaded}
            />
          )}
        </form.Subscribe>
      )}

      {/* Display schema validation errors */}
      <form.Subscribe selector={(state) => [state.fieldMeta._schemaError?.errors]}>
        {([schemaErrors]) => {
          if (!schemaErrors || schemaErrors.length === 0) return null
          return (
            <div className="rounded-md bg-red-50 p-4 border border-red-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{t('Schema Validation Error')}</h3>
                  <div className="mt-2 text-sm text-red-700">
                    {schemaErrors[0]}
                  </div>
                </div>
              </div>
            </div>
          )
        }}
      </form.Subscribe>
      
      {/* Display general validation errors */}
      <form.Subscribe selector={(state) => [state.fieldMeta._validationError?.errors]}>
        {([validationErrors]) => {
          if (!validationErrors || validationErrors.length === 0) return null
          return (
            <div className="rounded-md bg-red-50 p-4 border border-red-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{t('Validation Error')}</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul className="list-disc list-inside space-y-1">
                      {validationErrors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )
        }}
      </form.Subscribe>

      <div className="grid-container">
        <div className="grid-custom">
          {Object.entries(properties).map(([key, propSchema]) => {
            if (typeof propSchema !== 'object') return null

            // Synthetic label companions are display-only projections, not editable
            // columns — don't render them as form fields (mirrors the grid renderers,
            // and avoids a duplicate label field beside the real reference field).
            if (isSyntheticLabelField(propSchema)) return null

            const inputTypeRule = (propSchema as any).input_type_rule

            // Render a single field, optionally with a rule-derived inputMode override.
            // Called both from the static path (no rule) and from inside form.Subscribe
            // (rule present — re-renders whenever the rule result changes).
            const renderField = (ruleOutcome: RuleOutcome) => {
              const type = propSchema.type
              const format = propSchema.format
              const hasEnum = 'enum' in propSchema && Array.isArray((propSchema as any).enum)
              const label = propSchema.title || key
              const description = propSchema.description

              const inputMode = renderedInputMode(key, propSchema, ruleOutcome.mode, formMode, parentField)
              if (inputMode === null) return null

              // Why this field's input_type_rule or computed rule did not run,
              // shown under it. It is no validation error: saving stays
              // possible, and the server decides. A view shows no errors, as
              // FormError shows none there.
              const ruleError = ruleOutcome.error ?? computedErrors[key]
              const ruleErrorText = ruleError !== undefined && formMode !== 'view'
                ? renderError(scopeRuleError(ruleError, entityName, key), t).message
                : undefined

              // assertSupportedFormats() ran at the top of this render: a
              // missing format already threw, and an unknown name already
              // logged. resolveControl falls unknown names back to `text`.
              const ControlComponent = resolveControl({ format })!.control

              // Skip validation for readonly, disabled, and hidden fields
              const shouldValidate = inputMode === 'default' || inputMode === 'required'

              // Determine width: explicit width from schema (excluding 'default'), or computed from format/type
              const schemaWidth = (propSchema as any).width
              const effectiveWidth = (!schemaWidth || schemaWidth === 'default')
                ? getDefaultWidthForForm(format as string | undefined)
                : schemaWidth
              const widthClasses = getWidthClasses(effectiveWidth)

              if (inputMode === 'hidden') {
                return (
                  <ControlComponent
                    name={key}
                    label={label}
                    description={description}
                    inputMode={inputMode}
                    schema={propSchema as Record<string, unknown>}
                  />
                )
              }

              return (
                <div className={widthClasses}>
                  <ControlComponent
                    name={key}
                    label={label}
                    description={description}
                    inputMode={inputMode}
                    schema={propSchema as Record<string, unknown>}
                    validators={shouldValidate ? {
                      // One `onDynamic` validator, run by the form's
                      // `revalidateLogic({ mode: 'blur', modeAfterSubmission: 'change' })`:
                      // before the first Submit a field is checked when it is left,
                      // after one on every keystroke. One validator in one errorMap
                      // slot, instead of separate onBlur/onChange/onSubmit validators
                      // whose errors would each have to be cleared on their own.
                      //
                      // The reset in <form onSubmit> clears `onDynamic` as well,
                      // because of TanStack Form (form-core 1.33.5,
                      // FormApi._handleSubmit): on the FIRST submit attempt it returns
                      // before running any validator if a field already holds an
                      // error. Pressing Submit blurs the focused field first, so the
                      // error that blur raises would otherwise end the attempt with
                      // only that field checked; so would an error left on a field a
                      // rule then made readonly, which has no validator to clear it.
                      //
                      // The error line that blur adds or removes would also move
                      // Submit between press and release and lose the click;
                      // FormError and FormDescription hold it steady during a press
                      // (pressHold.ts).
                      //
                      // `inputMode` is the mode the control was drawn with, so the
                      // asterisk and the empty check cannot disagree.
                      onDynamic: ({ value }) => validateField(value, propSchema, key, t, language, inputMode),
                    } : undefined}
                  />
                  {ruleErrorText && (
                    <p id={`${key}-rule-error`} role="alert" className="text-[0.8rem] font-medium text-destructive">
                      {ruleErrorText}
                    </p>
                  )}
                </div>
              )
            }

            if (hasInputTypeRule(inputTypeRule)) {
              return (
                <form.Subscribe
                  key={key}
                  selector={(state: any) => evaluateInputTypeRule(inputTypeRule, state.values, records)}
                >
                  {(ruleOutcome: RuleOutcome) => renderField(ruleOutcome)}
                </form.Subscribe>
              )
            }

            const rendered = renderField({ mode: null })
            return rendered ? <Fragment key={key}>{rendered}</Fragment> : null
          })}
        </div>
      </div>

      {formMode !== 'view' && (
        <StickyContainer sticky="bottom" className="py-4 -mx-(--sticky-bleed) px-(--sticky-bleed)">
          {/* Submit-time errors render here (inside the pinned footer) so they stay
              visible; a sibling after the sticky bar would be pushed off-screen. */}
          {footerContent && <div className="mb-4">{footerContent}</div>}
          <div className="flex gap-4">
            <Button type="submit">{t('Submit')}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
            >
              {t('Reset')}
            </Button>
          </div>
        </StickyContainer>
      )}
    </form>
    </FormProvider>
  )
}
