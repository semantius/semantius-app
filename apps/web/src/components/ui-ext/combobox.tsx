import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxProps {
  options: string[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  /** Show a clear button when a value is selected */
  showClear?: boolean
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  onBlur?: () => void
  className?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  showClear = false,
  disabled = false,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  onBlur,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  // cmdk's Command.List spreads user props BEFORE writing its own generated
  // `id`, so an id passed to <CommandList> is discarded and `aria-controls`
  // would point at nothing — the exact aria-valid-attr-value failure it is
  // there to prevent. Read the id back off the rendered node instead. The
  // callback re-fires with null when the popup unmounts, so the reference
  // clears itself.
  const [listboxId, setListboxId] = React.useState<string>()
  const listboxRef = React.useCallback((node: HTMLDivElement | null) => {
    setListboxId(node?.id)
  }, [])

  const handleSelect = (selected: string) => {
    onValueChange?.(selected)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange?.("")
  }

  // Only show the search input when there are more than 10 options
  const showSearch = options.length > 10
  const showClearButton = showClear && !!value && !disabled

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) onBlur?.()
      }}
    >
      {/* The clear button is a SIBLING of the trigger, not one of its children.
          Nesting a <button> inside the trigger <button> is invalid HTML and an
          axe `nested-interactive` (serious) error, and it also pollutes the
          trigger's accessible name, which is computed from its content. */}
      <div className="relative w-full">
        <PopoverTrigger
          render={
            <button
              id={id}
              role="combobox"
              aria-expanded={open}
              // Required by `role="combobox"`; resolved from the rendered
              // listbox node, so it never dangles.
              aria-controls={open ? listboxId : undefined}
              aria-haspopup="listbox"
              aria-invalid={ariaInvalid}
              aria-describedby={ariaDescribedBy}
              disabled={disabled}
              type="button"
              data-slot="combobox-trigger"
              data-placeholder={!value && !disabled ? "" : undefined}
              className={cn(
                "border-input-border flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent py-2 pl-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
                // Reserve the gutter the overlaid clear button occupies so the
                // value never truncates underneath it.
                showClearButton ? "pr-12" : "pr-3",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "data-placeholder:text-muted-foreground",
                className
              )}
            />
          }
        >
          <span className="truncate">{disabled ? (value || '') : (value || placeholder)}</span>
          {!disabled && <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />}
        </PopoverTrigger>
        {showClearButton && (
          // A real <button>: a <span role="button"> is not focusable and takes
          // no key events. size-6 (24px) satisfies 2.5.8 target size.
          <button
            type="button"
            aria-label="Clear selection"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-7 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent
        className="w-(--anchor-width) p-0"
        align="start"
      >
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList ref={listboxRef}>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={handleSelect}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      value === option ? "opacity-100" : "opacity-0"
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
  )
}
