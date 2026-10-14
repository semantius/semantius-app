import { useState } from 'react'
import { Pencil, X } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from '@/components/ui/input-group'
import { NamedIcon } from '@/components/ui-ext/named-icon'
import { IconPickerDialog } from '@/components/ui-ext/icon-picker'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelId } from './fieldAria'

export function InputIcon({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
}: FormControlProps) {
  const { form, formMode } = useFormContext()
  const t = useT()
  const [open, setOpen] = useState(false)

  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        const error = field.state.meta.errors?.[0]
        const current = typeof field.state.value === 'string' ? field.state.value : ''
        const locked = disabled || readonly
        const showClear = !locked && !!current

        if (hidden) {
          return <input type="hidden" name={name} value={current} />
        }

        return (
          <div className="pt-2 space-y-1">
            <FormLabel
              htmlFor={name}
              label={label}
              description={description}
              required={required}
              error={!!error}
            />
            <InputGroup data-invalid={error ? true : undefined} data-disabled={locked || undefined}>
              {current ? (
                <InputGroupAddon align="inline-start">
                  <NamedIcon name={current} aria-hidden="true" />
                </InputGroupAddon>
              ) : null}
              <InputGroupText aria-live="polite" className="flex-1 truncate px-1">
                {current || t('No icon')}
              </InputGroupText>
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  id={name}
                  size="icon-xs"
                  disabled={locked}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-labelledby={label ? `${labelId(name)} ${name}-pick` : undefined}
                  aria-describedby={describedBy(name, { description, error, formMode })}
                  aria-invalid={error ? true : undefined}
                  onClick={() => setOpen(true)}
                >
                  <Pencil aria-hidden="true" />
                  <span id={`${name}-pick`} className="sr-only">
                    {t('Choose an icon')}
                  </span>
                </InputGroupButton>
                {showClear ? (
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={t('Clear icon')}
                    onClick={() => {
                      field.handleChange('')
                      field.handleBlur()
                      document.getElementById(name)?.focus()
                    }}
                  >
                    <X aria-hidden="true" />
                  </InputGroupButton>
                ) : null}
              </InputGroupAddon>
            </InputGroup>
            {readonly ? <input type="hidden" name={name} value={current} /> : null}
            <FormDescription name={name} description={description} error={error} />
            <FormError name={name} error={error} />
            <IconPickerDialog
              open={open}
              onOpenChange={(isOpen) => {
                setOpen(isOpen)
                if (!isOpen) field.handleBlur()
              }}
              value={current}
              onSelect={(iconName) => {
                field.handleChange(iconName)
                field.handleBlur()
              }}
            />
          </div>
        )
      }}
    </form.Field>
  )
}
