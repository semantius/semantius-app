import { useCallback, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputSurfaceClassName } from '@/lib/utils-ext'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useT } from '@/i18n'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'
import { describedBy, labelledBy } from './fieldAria'

export function InputEnum({
  name,
  label,
  description,
  inputMode = 'default',
  validators,
  schema,
}: FormControlProps) {
  const t = useT()
  const { form, formMode } = useFormContext()
  const [open, setOpen] = useState(false)
  // cmdk's Command.List spreads user props BEFORE writing its own generated
  // `id`, so an id passed to <CommandList> is discarded and `aria-controls`
  // would point at nothing — the exact aria-valid-attr-value failure it is
  // there to prevent. Read the id back off the rendered node instead; the
  // callback re-fires with null when the popup unmounts, clearing the
  // reference.
  const [listboxId, setListboxId] = useState<string>()
  const listboxRef = useCallback((node: HTMLDivElement | null) => {
    setListboxId(node?.id)
  }, [])

  // Derive props from inputMode
  const required = inputMode === 'required'
  const readonly = inputMode === 'readonly'
  const disabled = inputMode === 'disabled'
  const hidden = inputMode === 'hidden'

  // Get enum values from schema prop
  const enumValues: string[] = (schema as any)?.enum || []
  const showSearch = enumValues.length > 10

  return (
    <form.Field name={name} validators={validators}>
      {(field: any) => {
        if (hidden) {
          return <input type="hidden" name={name} value={field.state.value || ''} />
        }

        const currentValue: string = field.state.value ?? ''
        const isDisabled = disabled || readonly
        const showClearButton = !isDisabled && !required && !!currentValue

        const handleSelect = (selected: string) => {
          field.setMeta((meta: any) => ({
            ...meta,
            errors: [],
            errorMap: {},
          }))
          field.handleChange(selected)
          setOpen(false)
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
        }

        return (
          <div className="pt-2 space-y-1">
            <FormLabel htmlFor={name} label={label} required={required} error={!!field.state.meta.errors?.[0]} />
            <Popover
              open={open}
              onOpenChange={(isOpen) => {
                setOpen(isOpen)
                if (!isOpen) field.handleBlur()
              }}
            >
              {/* The clear button is a SIBLING of the trigger, not one of its
                  children. Nesting a <button> inside the trigger <button> is
                  invalid HTML and an axe `nested-interactive` (serious) error,
                  and — because the trigger self-references in aria-labelledby —
                  it would also be folded into the trigger's accessible name.
                  The reveal-on-interaction styling therefore hangs off the
                  wrapper: `group-has-[[aria-expanded=true]]` stands in for the
                  old `group-aria-expanded`, which needed the attribute on the
                  group element itself. */}
              <div className="group/combobox relative w-full">
                <PopoverTrigger
                  render={
                    <Button
                      id={name}
                      variant="ghost"
                      role="combobox"
                      aria-expanded={open}
                      // Required by `role="combobox"`. Resolved from the rendered
                      // listbox node — a dangling reference fails
                      // aria-valid-attr-value.
                      aria-controls={open ? listboxId : undefined}
                      aria-haspopup="listbox"
                      aria-labelledby={labelledBy(name, label) ? `${labelledBy(name, label)} ${name}` : undefined}
                      aria-invalid={!!field.state.meta.errors?.[0] || undefined}
                      aria-describedby={describedBy(name, { description, error: field.state.meta.errors?.[0], formMode })}
                      disabled={isDisabled}
                      className={cn(
                        "w-full cursor-pointer justify-between font-normal pl-3",
                        // Reserve the gutter the overlaid clear button occupies.
                        showClearButton ? "pr-12" : "pr-3",
                        inputSurfaceClassName,
                        !currentValue && "text-muted-foreground",
                        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive"
                      )}
                    />
                  }
                >
                  <span className="truncate">
                    {isDisabled ? (currentValue || '') : (currentValue || t('Select an option'))}
                  </span>
                  {!isDisabled && <ChevronsUpDown className="ml-auto shrink-0 opacity-50" size={10} />}
                </PopoverTrigger>
                {showClearButton && (
                  // A real <button>: the previous <span role="button"> was not
                  // focusable and took no key events. size-6 (24px) satisfies
                  // 2.5.8; the glyph stays 12px.
                  <button
                    type="button"
                    aria-label={t('Clear selection')}
                    className="absolute top-1/2 right-7 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover/combobox:opacity-100 group-focus-within/combobox:opacity-100 group-has-aria-expanded/combobox:opacity-100"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={handleClear}
                  >
                    <X className="h-3 w-3 opacity-50 hover:opacity-100" />
                  </button>
                )}
              </div>
              <PopoverContent className="w-(--anchor-width) p-0" align="start">
                <Command>
                  {showSearch && <CommandInput placeholder={t('Search...')} />}
                  <CommandList ref={listboxRef}>
                    <CommandEmpty>{t('No option found.')}</CommandEmpty>
                    <CommandGroup>
                      {enumValues.map((option) => (
                        <CommandItem
                          key={option}
                          value={option}
                          onSelect={handleSelect}
                          className="cursor-pointer bg-transparent! hover:bg-accent!"
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              currentValue === option ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {option}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription name={name} description={description} error={field.state.meta.errors?.[0]} />
            <FormError name={name} error={field.state.meta.errors?.[0]} />
          </div>
        )
      }}
    </form.Field>
  )
}
