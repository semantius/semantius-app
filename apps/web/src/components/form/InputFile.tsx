import { useState } from 'react'
import { FileInput } from '@/components/ui-ext/file-input'
import { decodeBytes, encodeBytes, MAX_FILE_BYTES, type BinaryFormat } from '@/lib/fileEncoding'
import { formatByteSize } from '@/lib/number-format'
import { useFormattingLocale, useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelId } from './fieldAria'

/**
 * The control for the catalog's two binary formats.
 *
 * `binary` is a PostgreSQL BYTEA column and travels as PostgREST's hex output
 * (`\x` + two hex digits per byte); `byte` has no special column type and
 * travels as base64. Both were verified against the tenant, and the check that
 * matters is that the WRONG encoding is not rejected — posting base64 into a
 * BYTEA column answers 201 and stores the literal ASCII bytes. Nothing
 * downstream will tell us the encoding was wrong, so it has to be right here.
 */
export function InputFile({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  const t = useT()
  const locale = useFormattingLocale()
  const [sizeError, setSizeError] = useState<string | undefined>(undefined)

  const format = ((schema?.format as string) === 'byte' ? 'byte' : 'binary') as BinaryFormat

  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        const error = sizeError ?? field.state.meta.errors?.[0]
        const raw = field.state.value
        const bytes = typeof raw === 'string' ? decodeBytes(raw, format) : undefined

        async function handleSelect(file: File) {
          if (file.size > MAX_FILE_BYTES) {
            setSizeError(
              t('The file is larger than {limit}', {
                limit: formatByteSize(MAX_FILE_BYTES, locale),
              }),
            )
            return
          }
          setSizeError(undefined)
          const buffer = await file.arrayBuffer()
          field.handleChange(encodeBytes(new Uint8Array(buffer), format))
          field.handleBlur()
        }

        function handleClear() {
          setSizeError(undefined)
          // Empty is null, not '': PostgREST rejects an empty string for a BYTEA
          // column, and '' is not valid base64 for the TEXT one either.
          field.handleChange(null)
          field.handleBlur()
        }

        if (hidden) return null

        return (
          <div className="pt-2 space-y-1">
            <FormLabel htmlFor={name} label={label} description={description} required={required} error={!!error} />
            <FileInput
              id={name}
              bytes={bytes}
              downloadName={label || name}
              disabled={disabled}
              readOnly={readonly}
              required={required}
              invalid={!!error}
              labelledBy={label ? labelId(name) : undefined}
              describedBy={describedBy(name, { description, error, formMode })}
              onSelect={handleSelect}
              onClear={handleClear}
            />
            <FormDescription name={name} description={description} error={error} />
            <FormError name={name} error={error} />
          </div>
        )
      }}
    </form.Field>
  )
}
