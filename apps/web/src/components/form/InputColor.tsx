import { useState } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputSurfaceClassName } from '@/lib/utils-ext'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ColorPicker, ColorSwatch } from '@/components/ui-ext/color-picker'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'

export function InputColor({
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
        const display = current.startsWith('#') ? current.toUpperCase() : current
        const locked = disabled || readonly
        const showClearButton = !locked && !!current
        const pickerId = `${name}-color-picker`

        if (hidden) {
          return <input type="hidden" name={name} value={current} />
        }

        const handleClear = (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          field.setMeta((meta: any) => ({
            ...meta,
            errors: [],
            errorMap: {},
          }))
          field.handleChange('')
          setOpen(false)
          document.getElementById(name)?.focus()
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
            <Popover
              open={open}
              onOpenChange={(isOpen) => {
                setOpen(isOpen)
                if (!isOpen) field.handleBlur()
              }}
            >
              {/* The clear button is a SIBLING of the trigger, not one of its
                  children. Nesting a <button> inside the trigger <button> is
                  invalid HTML and an axe `nested-interactive` (serious) error.
                  Reveal-on-interaction hangs off this wrapper, matching
                  InputEnum / APISelect. */}
              <div className="group/combobox relative w-full">
                <PopoverTrigger
                  render={
                    <Button
                      id={name}
                      variant="ghost"
                      role="combobox"
                      aria-expanded={open}
                      aria-controls={open ? pickerId : undefined}
                      aria-haspopup="dialog"
                      aria-labelledby={labelledBy(name, label) ? `${labelledBy(name, label)} ${name}` : undefined}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy(name, { description, error, formMode })}
                      disabled={locked}
                      data-field-surface=""
                      className={cn(
                        'w-full cursor-pointer justify-start gap-2 font-normal pl-3 pr-3',
                        inputSurfaceClassName,
                        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
                      )}
                    />
                  }
                >
                  <ColorSwatch color={current} />
                  <span
                    className={cn(
                      'truncate',
                      current.startsWith('#') && 'font-mono',
                      showClearButton && 'mr-7',
                      !current && !locked && 'text-muted-foreground',
                    )}
                  >
                    {locked ? (display || '') : (display || t('No color'))}
                  </span>
                  {!locked && <ChevronsUpDown className="ml-auto shrink-0 text-foreground opacity-50" />}
                </PopoverTrigger>
                {showClearButton ? (
                  <button
                    type="button"
                    aria-label={t('Clear selection')}
                    className="absolute top-1/2 right-8 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover/combobox:opacity-100 group-focus-within/combobox:opacity-100 group-has-aria-expanded/combobox:opacity-100"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={handleClear}
                  >
                    <X className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                ) : null}
              </div>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner
                  align="start"
                  side="bottom"
                  sideOffset={4}
                  collisionAvoidance={{ fallbackAxisSide: 'none' }}
                  className="isolate z-50"
                >
                  <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className="z-50 flex origin-(--transform-origin) flex-col gap-0 rounded-3xl bg-popover p-0 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
                  >
                    <PopoverTitle className="sr-only">{t('Choose a color')}</PopoverTitle>
                    <PopoverDescription className="sr-only">{t('Pick a color from the palette.')}</PopoverDescription>
                    <ColorPicker
                      id={pickerId}
                      value={current}
                      onChange={(next) => {
                        field.setMeta((meta: any) => ({
                          ...meta,
                          errors: [],
                          errorMap: {},
                        }))
                        field.handleChange(next)
                      }}
                    />
                  </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
              </PopoverPrimitive.Portal>
            </Popover>
            {readonly ? <input type="hidden" name={name} value={current} /> : null}
            <FormDescription name={name} description={description} error={error} />
            <FormError name={name} error={error} />
          </div>
        )
      }}
    </form.Field>
  )
}
