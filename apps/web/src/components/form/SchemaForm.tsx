import { Fragment, type ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import jsonLogic, { type RulesLogic } from 'json-logic-js'
import { validateData } from 'sem-schema'
import { controls } from './controls'
import { Button } from '@/components/ui/button'
import { StickyContainer } from '@/components/ui-ext/sticky-container'
import type { SchemaObject } from 'ajv'
import { InputText } from './InputText'
import { FormProvider } from './FormContext'
import { localizeValidationErrors } from './validationMessages'
import { useLanguage, useT, type TranslateFn } from '@/i18n'
import type { InputMode } from './types'

export type FormMode = 'edit' | 'create' | 'view'

/**
 * Synthetic, read-only label companions that get_schema emits as properties:
 *   - ctype '_label':   the row's own composed, human-readable label
 *   - ctype 'fk_label': a reference field's composed label (e.g. module_id_label)
 *
 * These are display-only projections (computed columns / functions), NOT real
 * writable columns. They must be excluded from form state, from rendering, and
 * above all from the write payload: PostgREST rejects any INSERT/UPDATE that
 * names them with PGRST204 "Could not find the '<col>' column of '<table>'".
 * Mirrors the same skip in buildPostgRESTSelect and the grid cell renderers
 * (DataTableView/TableView) so all consumers treat these fields consistently.
 */
function isSyntheticLabelField(propSchema: unknown): boolean {
  const ctype = (propSchema as { ctype?: string } | null)?.ctype
  return ctype === '_label' || ctype === 'fk_label'
}

const VALID_INPUT_MODES: readonly InputMode[] = ['default', 'required', 'readonly', 'disabled', 'hidden']

function isInputMode(value: unknown): value is InputMode {
  return typeof value === 'string' && (VALID_INPUT_MODES as readonly string[]).includes(value)
}

/**
 * Evaluate a per-field input_type_rule (JsonLogic) against the current form values.
 * Returns the resulting InputMode, or null if the rule is missing/invalid/returns a
 * non-InputMode value. Callers fall back to the static schema inputMode in that case.
 */
function evaluateInputTypeRule(rule: unknown, values: Record<string, any>): InputMode | null {
  if (!rule || typeof rule !== 'object') return null
  try {
    const result = jsonLogic.apply(rule as RulesLogic, values)
    return isInputMode(result) ? result : null
  } catch {
    return null
  }
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
 * Generate default values from schema
 */
function generateDefaultValue(schema: SchemaObject): Record<string, any> {
  const defaults: Record<string, any> = {}

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (typeof propSchema !== 'object' || propSchema === null) continue

      // Synthetic label companions are not real columns — never seed them into
      // form state (otherwise they leak into the submit payload). See helper.
      if (isSyntheticLabelField(propSchema)) continue

      // Check if default value is provided
      if ('default' in propSchema) {
        defaults[key] = (propSchema as any).default
      } else {
        // Generate default based on type.
        //
        // get_schema emits json (and some other) columns with a *union* `type`
        // array, e.g. ["object","array","string","number","integer","boolean","null"].
        // A bare `type === 'object'` comparison never matches an array, so such a
        // field would fall through and seed `undefined` — which InputJson renders as a
        // completely BLANK CodeMirror editor. This is masked only while get_schema
        // also supplies an explicit `default`; the moment it doesn't (older/cached
        // metadata, or any json field the author left without a default) the editor
        // shows nothing. Normalize the union to its first non-null member, and always
        // seed valid empty JSON for `format: 'json'` so the editor is never blank.
        const format = (propSchema as any).format
        const rawType = (propSchema as any).type
        const type = Array.isArray(rawType)
          ? rawType.find((t) => t !== 'null')
          : (rawType || (format ? 'string' : undefined))

        if (format === 'json') {
          defaults[key] = {}
        } else if (type === 'boolean') {
          defaults[key] = false
        } else if (format === 'reference' || format === 'parent') {
          defaults[key] = null
        } else if (type === 'number' || type === 'integer') {
          defaults[key] = undefined
        } else if (type === 'string') {
          defaults[key] = ''
        } else if (type === 'array') {
          defaults[key] = []
        } else if (type === 'object') {
          defaults[key] = {}
        }
      }
    }
  }

  return defaults
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
 * @returns Error message if validation fails, undefined if valid
 */
function validateField(
  value: any,
  fieldSchema: SchemaObject,
  fieldName: string,
  t: TranslateFn,
  language: string,
): string | undefined {
  // Check if field has inputMode: 'required'
  const inputMode = (fieldSchema as any).inputMode
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

  // Create a temporary schema for this field within an object
  const tempSchema: SchemaObject = {
    type: 'object',
    properties: {
      [fieldName]: fieldSchema
    },
    // Include required if this field is required at object level
    ...(isRequired ? { required: [fieldName] } : {})
  }

  const tempData = { [fieldName]: value }
  const result = validateData(tempData, tempSchema)

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


/**
 * Maps a field's format/type to its default display width for form renderers.
 *
 * - multiline, json, html, jsonata → 'w' (wide)
 * - number, integer (without a format) → 's' (small)
 * - everything else → 'm' (medium)
 *
 * Format takes priority over type — e.g. a number with format "reference" gets 'm', not 's'.
 */
function getDefaultWidthForForm(format?: string, type?: string): 's' | 'm' | 'w' {
  if (format === 'multiline' || format === 'json' || format === 'html' || format === 'jsonata') {
    return 'w'
  }
  if (!format && (type === 'number' || type === 'integer')) {
    return 's'
  }
  return 'm'
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

  // Merge schema defaults under initialValue so explicit values win
  // but defaults fill gaps (e.g. parent FK pre-filled, other fields blank).
  const defaultValue = { ...generateDefaultValue(schema), ...(initialValue || {}) }

  const form = useForm({
    defaultValues: defaultValue,
    onSubmit: async ({ value }) => {
      // Build object with all schema properties for validation
      const cleanedValue: Record<string, any> = {}
      
      // Get all possible fields from schema
      const allFields = schema.properties ? Object.keys(schema.properties) : []
      
      // Include fields based on inputMode:
      // - disabled fields: NEVER submitted (HTML standard behavior)
      // - readonly fields: ALWAYS submitted (they're part of the data)
      // - In create mode: readonly fields are not rendered but still submitted if present in initial value
      for (const key of allFields) {
        const propSchema = (schema.properties as Record<string, SchemaObject>)[key]
        const inputMode = (propSchema as any).inputMode || 'default'

        // Synthetic label companions (ctype '_label' / 'fk_label') are computed,
        // non-writable projections — not real columns. Including them in the body
        // makes PostgREST reject the whole write with PGRST204. They're also
        // 'readonly', so in edit mode they would otherwise be submitted. Skip them.
        if (isSyntheticLabelField(propSchema)) {
          continue
        }

        // Disabled fields are NEVER submitted (HTML standard behavior)
        if (inputMode === 'disabled') {
          continue
        }
        
        // In create mode, skip readonly fields (they're not rendered and usually don't exist yet)
        // Exception: parentField is always included (it was injected via _pf/_pv and must be submitted)
        if (formMode === 'create' && inputMode === 'readonly' && key !== parentField) {
          continue
        }
        
        // Reference and parent fields (foreign keys) set null when cleared; treat as undefined (absent) to avoid AJV type errors
        const format = (propSchema as any).format
        const fieldValue = value[key]
        // PostgREST rejects empty strings for typed columns (date/time/numeric/etc.).
        // Optional fields default to '' for type:string but should be sent as null when empty.
        const isTypedStringFormat = format === 'date' || format === 'date-time' || format === 'time'
        if (format === 'json' && typeof fieldValue === 'string') {
          // InputJson/CodeMirror always hand back a *string*. A json column expects a
          // real JSON value (object/array/etc.), so parse before it reaches the write
          // payload — otherwise an edited `[]` is sent as the literal string `"[]"` and
          // the DB rejects it (e.g. an `..._is_array` check constraint). Empty → null;
          // invalid JSON is left as-is so schema/DB validation surfaces the error
          // rather than silently dropping the user's input.
          const trimmed = fieldValue.trim()
          if (trimmed === '') {
            cleanedValue[key] = null
          } else {
            try {
              cleanedValue[key] = JSON.parse(trimmed)
            } catch {
              cleanedValue[key] = fieldValue
            }
          }
        } else if (isTypedStringFormat && fieldValue === '') {
          cleanedValue[key] = null
        } else {
          cleanedValue[key] = ((format === 'reference' || format === 'parent') && fieldValue === null) ? undefined : fieldValue
        }
      }
      
      // DEFENSIVE: This should never happen because view mode has no submit button
      // If we reach here, something is seriously broken in the form rendering logic
      if (formMode === 'view') {
        throw new Error('BUG: Form submitted in view mode, but view mode should have no submit button!')
      }
      
      // Modify schema to exclude fields from required validation based on inputMode and formMode
      let validationSchema = schema
      if (schema.required && Array.isArray(schema.required)) {
        const properties = schema.properties as Record<string, SchemaObject>
        const filteredRequired = schema.required.filter((fieldName: string) => {
          const propSchema = properties[fieldName]
          if (!propSchema) return true
          const inputMode = (propSchema as any).inputMode || 'default'
          
          // Disabled fields are never submitted, so never required
          if (inputMode === 'disabled') return false
          
          // In create mode, readonly fields are not rendered, so not required
          // Exception: parentField is always included
          if (formMode === 'create' && inputMode === 'readonly' && fieldName !== parentField) return false
          
          return true
        })
        validationSchema = { ...schema, required: filteredRequired }
      }
      
      // For AJV validation, omit null/undefined for non-required fields.
      // AJV rejects null for type:'string' (produces "must be string"), but null is
      // a valid cleared value for optional fields — treat absent == valid here.
      const requiredFields = new Set<string>(Array.isArray(validationSchema.required) ? validationSchema.required : [])
      const validationValue = Object.fromEntries(
        Object.entries(cleanedValue).filter(([key, val]) =>
          requiredFields.has(key) || (val !== null && val !== undefined)
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
            const fieldExists = fieldPath && schema.properties?.[fieldPath]
            
            if (fieldPath && fieldExists) {
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

  if (!schema.properties || typeof schema.properties !== 'object') {
    return <div>{t('Invalid schema: no properties defined')}</div>
  }

  const properties = schema.properties as Record<string, SchemaObject>

  // Create context value for form controls - includes form instance
  const formContextValue = {
    form,
    schema,
    formMode,
    validateField: (value: any, fieldName: string) => {
      const fieldSchema = properties[fieldName]
      if (!fieldSchema) return undefined
      return validateField(value, fieldSchema, fieldName, t, language)
    },
  }

  return (
    <FormProvider value={formContextValue}>
      <form
        id={id}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onBeforeSubmit?.((e.nativeEvent as SubmitEvent).submitter)
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
        className={formMode === 'view'
          ? "space-y-4 [&_[data-slot=input]]:border-transparent [&_[data-slot=input]]:shadow-none [&_[data-slot=combobox-trigger]]:border-transparent [&_[data-slot=combobox-trigger]]:shadow-none [&_textarea]:border-transparent [&_textarea]:shadow-none [&_.cm-editor]:border-transparent [&_input::placeholder]:text-transparent [&_textarea::placeholder]:text-transparent"
          : "space-y-4"
        }
      >
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
            const renderField = (ruleResult: InputMode | null) => {
              const type = propSchema.type
              const format = propSchema.format
              const hasEnum = 'enum' in propSchema && Array.isArray((propSchema as any).enum)
              const label = propSchema.title || key
              const description = propSchema.description

              let inputMode: InputMode = (propSchema as any).inputMode || 'default'

              // input_type_rule (JsonLogic) overrides the static schema inputMode when
              // it evaluates to a valid InputMode against current form values.
              if (ruleResult) {
                inputMode = ruleResult
              }

              // parentField (injected via _pf/_pv) is always forced to hidden —
              // it carries the foreign key that links this child record to its parent
              // and must not be visible or editable by the user
              if (key === parentField) {
                inputMode = 'hidden'
              }

              // In create mode, skip fields with inputMode='readonly' or 'disabled'
              // Exception: parentField (injected via _pf/_pv) is always rendered
              if (formMode === 'create' && (inputMode === 'readonly' || inputMode === 'disabled') && key !== parentField) {
                return null
              }

              // Form-level view mode overrides schema-level inputMode (except for hidden)
              if (formMode === 'view' && inputMode !== 'hidden') {
                inputMode = 'readonly'
              }

              // Use format if available, otherwise check for enum, otherwise use type as format
              const controlKey = format || (hasEnum ? 'enum' : type) as string
              const ControlComponent = controls[controlKey] || InputText

              // Skip validation for readonly, disabled, and hidden fields
              const shouldValidate = inputMode === 'default' || inputMode === 'required'

              // Determine width: explicit width from schema (excluding 'default'), or computed from format/type
              const schemaWidth = (propSchema as any).width
              const effectiveWidth = (!schemaWidth || schemaWidth === 'default')
                ? getDefaultWidthForForm(format as string | undefined, type as string | undefined)
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
                      // Only validate on submit, not on blur
                      // This prevents blur validation from canceling submit button clicks
                      onSubmit: ({ value }) => validateField(value, propSchema, key, t, language),
                    } : undefined}
                  />
                </div>
              )
            }

            if (inputTypeRule) {
              return (
                <form.Subscribe
                  key={key}
                  selector={(state: any) => evaluateInputTypeRule(inputTypeRule, state.values)}
                >
                  {(ruleResult: InputMode | null) => renderField(ruleResult)}
                </form.Subscribe>
              )
            }

            const rendered = renderField(null)
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
