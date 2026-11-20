import { useT } from '@/i18n'
import { isFormatName, isNumericFormat } from '@/lib/formats'
import { useRpc } from '@/hooks/useRpc'
import { useCanEditEntity } from '@/hooks/useUserPermissions'
import type { EntityMetadata } from '@/types/metadata'
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
  const referenceTable = typeof schema?.reference_table === 'string' ? schema.reference_table : undefined
  // A target entity the user holds neither view nor edit permission on is not
  // in their catalog. `get_schema` still names it in `reference_table`, but
  // leaves out `reference_table_id_column`, `reference_table_label_column` and
  // both labels (`reference_visible` in the backend's
  // 0250_public_functions.sql). With no key column there is no row to look up
  // and nothing to search by, so such a reference looks up no row, runs no
  // search, and shows the value it stores. The target's own `get_schema` below
  // still runs and answers 42P01, so there is no record link and no Add action.
  const targetHidden = !!referenceTable && !schema?.reference_table_id_column
  // The referenced entity's own schema, not this form's: Job on an Application
  // lives in the Job entity's module, and a cross-module key (module_id →
  // modules) is not this page's module. `get_schema` is cached under the same
  // key the table route already uses.
  const { data: referenced } = useRpc<EntityMetadata>('get_schema', {
    params: { p_table_name: referenceTable ?? '' },
    enabled: !!referenceTable,
  })
  const referencedModule = referenced?.table?.module_slug
  const referencedTable = referenced?.table?.table_name || referenceTable
  const referencedSingularFallback = referenced?.table?.singular_label
  const referencedSingular = referencedModule && referencedTable && referencedSingularFallback
    ? t({
        id: ['module', referencedModule, referencedTable, 'entity', 'singular_label'],
        defaultMessage: referencedSingularFallback,
      })
    : referencedSingularFallback
  const recordUrl = referencedModule && referencedTable
    ? `/${referencedModule}/${referencedTable}/\${id}`
    : undefined
  // Same gate as EntityView's "Add {label}": the referenced table's
  // edit_permission covers INSERT. There is no separate create permission.
  const canAdd = useCanEditEntity(referenced?.table?.edit_permission)
  const addUrl = canAdd && referencedModule && referencedTable && referencedSingular
    ? `/${referencedModule}/${referencedTable}/create`
    : undefined
  const addLabel = canAdd && referencedSingular ? t('Add {label}', { label: referencedSingular }) : undefined

  // Derive props from inputMode
  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  // Get reference-specific config from schema prop
  const format = (schema as any)?.format
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

  // No `|| 'id'` fallback for the key column: a reference without one is a
  // hidden target (above), and `id` is not every entity's key.
  if (!searchUrl && schema?.reference_table && !targetHidden) {
    const table = schema.reference_table;
    const idCol = schema.reference_table_id_column;
    const labelCol = schema.reference_table_label_column || 'label';
    searchUrl = `/${table}?select=${idCol},${labelCol}&limit=21&offset=0&order=${idCol}.desc&search_vector=wfts(simple).\${query}`;
  }

  if (!idUrl && schema?.reference_table && !targetHidden) {
    const table = schema.reference_table;
    const idCol = schema.reference_table_id_column;
    idUrl = `/${table}?${idCol}=eq.\${id}`;
  }

  // A hidden target with no URL of the schema's own: the stored value has no
  // row to resolve to, so it is its own option and the trigger shows it as
  // stored. With neither URL, APISelect fetches nothing, for the value or for
  // the list.
  let recordFetcher: ((id: string) => Promise<string>) | undefined
  if (targetHidden && !searchUrl && !idUrl) {
    recordFetcher = async (id) => id
    getRecordId = (id: string) => id
    renderItem = (id: string) => id
  }

  // console.log('InputReference derived props', {     fieldType,    searchUrl,   idUrl,    getRecords,    getRecordId,    renderItem,    placeholder  })

  // Convert the form value to a string for APISelect, and back on change.
  //
  // A reference holds a value of the key it points at, and `get_schema` puts
  // that key's type on the property: `string` for a text key (`entities`,
  // `permissions`, TypeID and UUID keys), `integer` for an auto-increment one.
  // The catalog's `integer` for reference/parent describes only the numeric
  // keys — read from there, `Number('parties')` is NaN, the value became null,
  // and the submit dropped the field without a word.
  //
  // The type may be a UNION (`["integer","null"]` for a nullable column), so it
  // is read as a list: `fieldType === 'integer'` is false for an array, and that
  // once submitted a numeric key as a string.
  const propertyTypes: unknown[] = Array.isArray(fieldType) ? fieldType : [fieldType]
  const isNumeric = format === 'reference' || format === 'parent'
    ? propertyTypes.some((type) => type === 'integer' || type === 'number')
    : isFormatName(format)
      ? isNumericFormat(format)
      : fieldType === 'integer' || fieldType === 'number'

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
              <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!field.state.meta.errors?.[0]} />
              <APISelect
                searchUrl={searchUrl}
                idUrl={idUrl}
                recordFetcher={recordFetcher}
                getRecords={getRecords}
                getRecordId={getRecordId}
                renderItem={renderItem}
                label={schema?.reference_table_plural_label ? String(schema.reference_table_plural_label) : (label ?? name)}
                placeholder={disabled || readonly ? '' : placeholder}
                value={toSelectValue(field.state.value)}
                onChange={(value) => field.handleChange(toFormValue(value))}
                onBlur={field.handleBlur}
                disabled={disabled || readonly}
                clearable={true}
                width="100%"
                id={name}
                aria-labelledby={labelledBy(name, label)}
                aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
                aria-invalid={!!field.state.meta.errors?.[0]}
                recordUrl={recordUrl}
                recordLabel={referencedSingular}
                addUrl={addUrl}
                addLabel={addLabel}
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
