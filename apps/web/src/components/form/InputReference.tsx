import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'
import { APISelect } from './api-select'

export function InputReference({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const t = useT()
  const { form, formMode } = useFormContext()

  // Derive props from inputMode
  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  // Get reference-specific config from schema prop
  const fieldType = (schema as any)?.type
  let searchUrl = (schema as any)?.searchUrl
  let idUrl = (schema as any)?.idUrl
  const getRecords = (schema as any)?.getRecords
  let getRecordId = (schema as any)?.getRecordId ?? '${id}'
  let renderItem = (schema as any)?.renderItem ?? '${label}'
  // The field's own label goes in AS GIVEN — `toLowerCase()` was an English
  // habit, and German capitalizes every noun.
  let placeholder = (schema as any)?.placeholder || (label ? t('Search {label}...', { label }) : t('Search...'))

  // generate default props based on schema.reference_* properties
  if (schema?.reference_table_id_column) getRecordId = "${" + schema.reference_table_id_column + "}";
  if (schema?.reference_table_label_column) renderItem = "${" + schema.reference_table_label_column + "}";
  if (schema?.reference_table_plural_label) placeholder = t('Search {label}...', { label: String(schema.reference_table_plural_label) });

  if (!searchUrl && schema?.reference_table) {
    const table = schema.reference_table;
    const idCol = schema.reference_table_id_column || 'id';
    const labelCol = schema.reference_table_label_column || 'label';
    searchUrl = `/${table}?select=${idCol},${labelCol}&limit=21&offset=0&order=${idCol}.desc&search_vector=wfts(simple).\${query}`;
  }

  if (!idUrl && schema?.reference_table) {
    const table = schema.reference_table;
    const idCol = schema.reference_table_id_column || 'id';
    idUrl = `/${table}?${idCol}=eq.\${id}`;
  }

  // console.log('InputReference derived props', {     fieldType,    searchUrl,   idUrl,    getRecords,    getRecordId,    renderItem,    placeholder  })

  // Convert the numeric form value to a string for APISelect, and back on change
  const isNumeric = fieldType === 'integer' || fieldType === 'number'

  function toSelectValue(formValue: any): string {
    if (formValue === undefined || formValue === null || formValue === '') return ''
    return String(formValue)
  }

  function toFormValue(selectValue: string): any {
    // Use null (not undefined) so TanStack Form stores an explicit empty value for numeric
    // fields rather than coercing undefined to 0, and so the required validator can detect it
    if (selectValue === '') return null
    if (isNumeric) {
      const n = Number(selectValue)
      return isNaN(n) ? null : n
    }
    return selectValue
  }

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => (
        <>
          {(hidden || readonly) && <input type="hidden" name={name} value={field.state.value ?? ''} />}
          {!hidden && (
            <div className="pt-2 space-y-1">
              <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
              <APISelect
                searchUrl={searchUrl}
                idUrl={idUrl}
                getRecords={getRecords}
                getRecordId={getRecordId}
                renderItem={renderItem}
                label={schema?.reference_table_plural_label ? String(schema.reference_table_plural_label) : (label ?? name)}
                placeholder={disabled || readonly ? '' : placeholder}
                value={toSelectValue(field.state.value)}
                onChange={(value) => field.handleChange(toFormValue(value))}
                disabled={disabled || readonly}
                clearable={true}
                width="100%"
                id={name}
                aria-labelledby={labelledBy(name, label)}
                aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
                aria-invalid={!!field.state.meta.errors?.[0]}
              />
              <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
              <FormError name={name} error={field.state.meta.errors?.[0]} />
            </div>
          )}
        </>
      )}
    </form.Field>
  )
}
