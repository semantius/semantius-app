import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy } from './fieldAria'
import { NumberInput } from '@/components/ui-ext/number-input'
import { resolvePrecision } from '@/lib/number-format'
import { useT } from '@/i18n'
import { gridPageSizeForHeight, rollupDrillDownHref, rollupLinkedEntity } from '@/lib/rollupDrillDown'
import { RollupDrillDownFromTable, RollupDrillDownLink } from './RollupDrillDownLink'

export function InputNumber({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const { form, formMode, schema: formSchema } = useFormContext()
  const t = useT()

  // Derive props from inputMode
  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  // `precision` (sem-schema keyword) drives the fixed decimal places; integer type → 0.
  const precision = resolvePrecision({
    type: schema?.type as string | string[] | undefined,
    precision: schema?.precision as number | undefined,
  })

  const table = (formSchema as { table?: { module_slug?: string; id_column?: string } }).table
  const children = (formSchema as { children?: Array<{ id?: unknown; plural_label?: unknown }> }).children
  const recordId = table?.id_column ? form.state.values?.[table.id_column] : undefined
  const drillDownHref = rollupDrillDownHref({
    property: schema,
    moduleSlug: table?.module_slug,
    recordId,
    pageSize: gridPageSizeForHeight(window.innerHeight),
  })
  const linked = rollupLinkedEntity(schema, children)
  const drillDownEntity =
    linked?.plural && table?.module_slug
      ? t({
          id: ['module', table.module_slug, linked.table, 'entity', 'plural_label'],
          defaultMessage: linked.plural,
        })
      : linked?.plural

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        const input = (
          <NumberInput
            id={name}
            name={readonly ? undefined : name}
            value={field.state.value}
            precision={precision}
            onValueChange={(v) => field.handleChange(v)}
            onBlur={field.handleBlur}
            disabled={disabled || readonly}
            readOnly={readonly}
            aria-invalid={!!field.state.meta.errors?.[0]}
            aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
          />
        )
        return (
          <>
            {(hidden || readonly) && <input type="hidden" name={name} value={field.state.value !== undefined && field.state.value !== null ? field.state.value : ''} />}
            {!hidden && (
              <div className="pt-2 space-y-1">
                <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!field.state.meta.errors?.[0]} />
                {drillDownHref && linked ? (
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">{input}</div>
                    {drillDownEntity ? (
                      <RollupDrillDownLink href={drillDownHref} entity={drillDownEntity} />
                    ) : (
                      <RollupDrillDownFromTable
                        href={drillDownHref}
                        table={linked.table}
                        moduleSlug={table?.module_slug}
                      />
                    )}
                  </div>
                ) : (
                  input
                )}
                <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
                <FormError name={name} error={field.state.meta.errors?.[0]} />
              </div>
            )}
          </>
        )
      }}
    </form.Field>
  )
}
