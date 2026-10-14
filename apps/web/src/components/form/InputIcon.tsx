import { useRef, useState } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputSurfaceClassName } from '@/lib/utils-ext'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NamedIcon } from '@/components/ui-ext/named-icon'
import { IconPicker } from '@/components/ui-ext/icon-picker'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'

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
  const suppressFocusOpen = useRef(false)
  const openedFromFocus = useRef(false)

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
        const showClearButton = !locked && !!current
        const pickerId = `${name}-icon-picker`

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
          // Focusing the trigger would otherwise reopen the picker (the
          // field opens on focus). Suppress that one so clear matches the
          // other dropdowns: the user stays in the emptied field.
          suppressFocusOpen.current = true
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
              onOpenChange={(isOpen, details) => {
                // Clicking the field focuses it first, which opens the picker.
                // The click then arrives as a trigger-press and would toggle
                // it closed in the same gesture — ignore that one close.
                if (!isOpen && details.reason === 'trigger-press' && openedFromFocus.current) {
                  openedFromFocus.current = false
                  return
                }
                openedFromFocus.current = false
                setOpen(isOpen)
                if (!isOpen) {
                  suppressFocusOpen.current = true
                  field.handleBlur()
                }
              }}
            >
              {/* The clear button is a SIBLING of the trigger, not one of its
                  children. Nesting a <button> inside the trigger <button> is
                  invalid HTML and an axe `nested-interactive` (serious) error.
                  Reveal-on-interaction hangs off this wrapper, matching
                  InputEnum / APISelect: hidden until hover, focus, or an
                  open picker. */}
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
                      onFocus={() => {
                        if (locked) return
                        if (suppressFocusOpen.current) {
                          suppressFocusOpen.current = false
                          return
                        }
                        if (!open) {
                          openedFromFocus.current = true
                          setOpen(true)
                        }
                      }}
                    />
                  }
                >
                  {current ? (
                    <NamedIcon name={current} aria-hidden="true" className="size-4 shrink-0" />
                  ) : null}
                  <span
                    className={cn(
                      'truncate',
                      showClearButton && 'mr-7',
                      !current && !locked && 'text-muted-foreground',
                    )}
                  >
                    {locked ? (current || '') : (current || t('No icon'))}
                  </span>
                </PopoverTrigger>
                {showClearButton ? (
                  <button
                    type="button"
                    aria-label={t('Clear selection')}
                    className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover/combobox:opacity-100 group-focus-within/combobox:opacity-100 group-has-aria-expanded/combobox:opacity-100"
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
                  // Stay on the vertical axis (below, or above if the dialog
                  // has no room). Without this, a tall grid falls back to the
                  // left of the field and covers the neighbouring column.
                  collisionAvoidance={{ fallbackAxisSide: 'none' }}
                  className="isolate z-50"
                >
                  <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className="z-50 flex w-(--anchor-width) origin-(--transform-origin) flex-col gap-0 rounded-3xl bg-popover p-0 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
                  >
                    <PopoverTitle className="sr-only">{t('Choose an icon')}</PopoverTitle>
                    <PopoverDescription className="sr-only">{t('Select an icon from the list.')}</PopoverDescription>
                    <IconPicker
                      id={pickerId}
                      value={current}
                      onSelect={(iconName) => {
                        suppressFocusOpen.current = true
                        field.setMeta((meta: any) => ({
                          ...meta,
                          errors: [],
                          errorMap: {},
                        }))
                        field.handleChange(iconName)
                        setOpen(false)
                        field.handleBlur()
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
