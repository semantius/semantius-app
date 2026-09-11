import { useState, useEffect, useCallback, useId, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { interpolate, inputSurfaceClassName } from "@/lib/utils-ext";
import { useT } from "@/i18n";
import { appError } from "@/lib/appError";
import { renderError } from "@/lib/apiErrors";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  icon?: React.ReactNode;
}

export interface APISelectProps<T> {
  /** URL template for searching. Use ${query} as placeholder for search term */
  searchUrl?: string;
  /** URL template for fetching a single record by ID. Use ${id} as placeholder */
  idUrl?: string;
  /** Async function to fetch options (takes priority over searchUrl when set) */
  fetcher?: (query?: string) => Promise<T[]>;
  /** Async function to resolve initial value to option (takes priority over idUrl when set) */
  recordFetcher?: (value: string) => Promise<T | null>;
  /** Extract the results array from the API response. String extracts a named property; function for custom extraction */
  getRecords?: ((data: unknown) => T[]) | string;
  /** Preload all data ahead of time */
  preload?: boolean;
  /** Function to filter options */
  filterFn?: (option: T, query: string) => boolean;
  /** Render the item content (used in trigger and as fallback for dropdown). String is interpolated with the record */
  renderItem: ((option: T) => React.ReactNode) | string;
  /** Get the unique identifier from a record. String is interpolated with the record */
  getRecordId: ((option: T) => string) | string;
  /** Render each option in the dropdown list (falls back to renderItem). String is interpolated with the record */
  renderListItem?: ((option: T) => React.ReactNode) | string;
  /** Class name for the item wrapper in the trigger */
  itemClassName?: string;
  /** Class name for the item wrapper in the dropdown list */
  listItemClassName?: string;
  /** Custom not found message */
  notFound?: React.ReactNode;
  /** Custom loading skeleton */
  loadingSkeleton?: React.ReactNode;
  /** Currently selected value */
  value: string;
  /** Callback when selection changes */
  onChange: (value: string) => void;
  /** Label for the select field */
  label: string;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Disable the entire select */
  disabled?: boolean;
  /** Custom width for the popover */
  width?: string | number;
  /** Custom class names */
  className?: string;
  /** Custom trigger button class names */
  triggerClassName?: string;
  /** Custom no results message */
  noResultsMessage?: string;
  /** Allow clearing the selection */
  clearable?: boolean;
  /** Id applied to the trigger button (so a caller can target it). */
  id?: string;
  /**
   * Id of the field's `<label>`. The trigger is a `<button>`, which a
   * `<label for>` does not name, so the association has to come from here.
   */
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function APISelect<T>({
  searchUrl,
  idUrl,
  fetcher,
  recordFetcher,
  getRecords,
  preload,
  filterFn,
  renderItem: renderItemProp,
  getRecordId: getRecordIdProp,
  renderListItem: renderListItemProp,
  itemClassName = "flex items-center gap-2",
  listItemClassName = "flex items-center gap-2 text-left",
  notFound,
  loadingSkeleton,
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
  width = "200px",
  className,
  triggerClassName,
  noResultsMessage,
  clearable = true,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: APISelectProps<T>) {
  const t = useT();
  // Defaulted in the body, not in the parameter list: a default parameter is
  // evaluated before the body runs, so it cannot call a hook.
  const placeholderText = placeholder ?? t("Select...");
  const reactId = useId();
  const triggerId = id ?? `${reactId}-trigger`;
  // cmdk's Command.List spreads user props BEFORE writing its own generated
  // `id`, so an id passed to <CommandList> is discarded and `aria-controls`
  // would point at nothing — the exact aria-valid-attr-value failure it is
  // there to prevent. Read the id back off the rendered node instead; the
  // callback re-fires with null when the popup unmounts, clearing the
  // reference.
  const [listboxId, setListboxId] = useState<string>();
  const listboxRef = useCallback((node: HTMLDivElement | null) => {
    setListboxId(node?.id);
  }, []);
  const getRecordId = useMemo(() =>
    typeof getRecordIdProp === "string"
      ? (option: T) => interpolate(getRecordIdProp, option as Record<string, unknown>)
      : getRecordIdProp,
    [getRecordIdProp]
  );

  const renderItem = useMemo(() =>
    typeof renderItemProp === "string"
      ? (option: T) => interpolate(renderItemProp, option as Record<string, unknown>)
      : renderItemProp,
    [renderItemProp]
  );

  const renderListItem = useMemo(() => {
    if (renderListItemProp == null) return undefined;
    return typeof renderListItemProp === "string"
      ? (option: T) => interpolate(renderListItemProp, option as Record<string, unknown>)
      : renderListItemProp;
  }, [renderListItemProp]);

  const resolvedGetRecords = useMemo(() => {
    if (getRecords == null) return undefined;
    if (typeof getRecords === "string") {
      const key = getRecords;
      return (data: unknown) => {
        const val = (data as Record<string, unknown>)?.[key];
        return Array.isArray(val) ? val as T[] : [] as T[];
      };
    }
    return getRecords;
  }, [getRecords]);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [selectedOption, setSelectedOption] = useState<T | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, preload ? 0 : 300);

  // Determine which fetchers to use (custom fetchers take priority over URLs)
  const effectiveFetcher = useCallback(
    async (query?: string): Promise<T[]> => {
      if (fetcher) return fetcher(query);
      if (searchUrl) {
        let url: string;
        if (query) {
          url = searchUrl.replace("${query}", encodeURIComponent(query));
        } else {
          // Remove query params that contain template placeholders, then fix leftover &/? issues
          url = searchUrl
            .replace(/([?&])[^?&]*\$\{[^}]*\}[^&]*/g, "$1")
            .replace(/[?&]$/, "")
            .replace(/\?&/, "?");
        }
        const res = await fetch(url);
        // A template plus values, rendered where it is displayed (renderError):
        // the status is a value, and the sentence follows a language switch.
        if (!res.ok) throw appError({ message: "Search failed ({status})", values: { status: res.status } });
        const data = await res.json();
        return resolvedGetRecords ? resolvedGetRecords(data) : data;
      }
      return [];
    },
    [fetcher, searchUrl, resolvedGetRecords]
  );

  const effectiveRecordFetcher = useCallback(
    async (id: string): Promise<T | null> => {
      if (recordFetcher) return recordFetcher(id);
      if (idUrl) {
        const url = idUrl.replace("${id}", encodeURIComponent(id));
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const records = resolvedGetRecords ? resolvedGetRecords(data) : data;
        const result = Array.isArray(records) && records.length === 1 ? records[0] : data;
        return result;
      }
      return null;
    },
    [recordFetcher, idUrl, resolvedGetRecords]
  );

  // TanStack Query for search results
  const {
    data: options = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: [searchUrl, debouncedSearchTerm, open],
    queryFn: async () => {
      if (preload && mounted && debouncedSearchTerm) {
        const all = await effectiveFetcher();
        return filterFn
          ? all.filter((option) => filterFn(option, debouncedSearchTerm))
          : all;
      }
      return effectiveFetcher(debouncedSearchTerm || undefined);
    },
    enabled: open || (preload === true),
    staleTime: 30_000,
  });

  // TanStack Query for initial option resolution
  const { data: initialOption, isLoading: initialLoading } = useQuery({
    queryKey: [idUrl, value],
    queryFn: () => effectiveRecordFetcher(value),
    enabled: !!value && !selectedOption,
    staleTime: Infinity,
  });

  const error = queryError ? (queryError instanceof Error ? renderError(queryError, t).message : t("Failed to fetch options")) : null;

  useEffect(() => {
    setMounted(true);
    setSelectedValue(value);
  }, [value]);

  // Set selected option from initial fetch
  useEffect(() => {
    if (initialOption && !selectedOption) {
      setSelectedOption(initialOption);
    }
  }, [initialOption, selectedOption]);

  // Update selectedOption when options are loaded and value exists
  useEffect(() => {
    if (value && options.length > 0) {
      const option = options.find((opt) => String(getRecordId(opt)) === String(value));
      if (option) {
        setSelectedOption(option);
      }
    }
  }, [value, options, getRecordId]);

  const handleSelect = useCallback(
    (currentValue: string) => {
      // cmdk lowercases the value passed to onSelect, so match case-insensitively
      const matchedOption = options.find(
        (option) => getRecordId(option).toLowerCase() === currentValue.toLowerCase()
      );
      const originalValue = matchedOption ? getRecordId(matchedOption) : currentValue;
      const newValue =
        clearable && String(originalValue) === String(selectedValue) ? "" : originalValue;
      setSelectedValue(newValue);
      setSelectedOption(
        newValue ? (matchedOption || null) : null
      );
      onChange(newValue);
      setOpen(false);
    },
    [selectedValue, onChange, clearable, options, getRecordId]
  );

  const showClearButton = !disabled && !!clearable && !!selectedValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The clear button is a SIBLING of the trigger, not one of its children.
          Nesting a <button> inside the trigger <button> is invalid HTML and an
          axe `nested-interactive` (serious) error, and — because the trigger
          self-references in aria-labelledby — it would also be folded into the
          trigger's accessible name. The reveal-on-interaction styling therefore
          hangs off the wrapper: `group-has-aria-expanded` stands in for the old
          `group-aria-expanded`, which needed the attribute on the group element
          itself. */}
      <div className="group/combobox relative" style={{ width: width }}>
        <PopoverTrigger
          render={
            <Button
              id={triggerId}
              variant="ghost"
              role="combobox"
              aria-expanded={open}
              // `role="combobox"` REQUIRES aria-controls; without it the role is a
              // claim a screen reader cannot act on. It is resolved from the
              // rendered listbox node and only while the popup exists — a
              // reference to an unmounted id is itself an aria-valid-attr-value
              // failure.
              aria-controls={open ? listboxId : undefined}
              aria-haspopup="listbox"
              // Self-reference is intentional: the field label is announced first,
              // then the trigger's own contents (the selected record, or the
              // placeholder). See the same pattern in ui-ext/date-time-picker.
              aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${triggerId}` : undefined}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              className={cn(
                "w-full cursor-pointer justify-between font-normal pl-3",
                // Reserve the gutter the overlaid clear button occupies.
                showClearButton ? "pr-12" : "pr-3",
                inputSurfaceClassName,
                disabled && "opacity-50 cursor-not-allowed",
                triggerClassName
              )}
              disabled={disabled}
            />
          }
        >
            {selectedOption ? (
              <div className={itemClassName}>{renderItem(selectedOption)}</div>
            ) : initialLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("Loading...")}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholderText}</span>
            )}
            {!disabled && <ChevronsUpDown className="ml-auto shrink-0 opacity-50" size={10} />}
        </PopoverTrigger>
        {showClearButton && (
          // A real <button>, not a <span role="button">: the span was neither
          // focusable nor key-operable. size-6 (24px) meets 2.5.8 while the X
          // glyph stays 12px.
          <button
            type="button"
            aria-label={t("Clear selection")}
            className="absolute top-1/2 right-7 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring group-hover/combobox:opacity-100 group-focus-within/combobox:opacity-100 group-has-aria-expanded/combobox:opacity-100"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedValue("");
              setSelectedOption(null);
              onChange("");
            }}
          >
            <X className="opacity-50 hover:opacity-100 h-3 w-3" />
          </button>
        )}
      </div>
      <PopoverContent className={cn("p-0 w-[var(--anchor-width)]", className)}>
        <Command shouldFilter={false}>
          <div className="relative border-b w-full">
            <CommandInput
              placeholder={t("Search {label}...", { label })}
              value={searchTerm}
              onValueChange={(value) => {
                setSearchTerm(value);
              }}
            />
            {loading && options.length > 0 && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
          <CommandList ref={listboxRef}>
            {error && (
              <div className="p-4 text-destructive text-center">
                {error}
              </div>
            )}
            {loading && options.length === 0 && (
              loadingSkeleton || <DefaultLoadingSkeleton />
            )}
            {!loading && !error && options.length === 0 && (
              // The model's own plural label, inserted AS GIVEN: lowercasing it
              // was an English habit (German capitalizes every noun) and gluing
              // the sentence together around it is another.
              notFound || <CommandEmpty>{noResultsMessage ?? t("No {label} found.", { label })}</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((option) => {
                const isSelected = String(selectedValue) === String(getRecordId(option));
                return (
                  <CommandItem
                    key={getRecordId(option)}
                    value={getRecordId(option)}
                    onSelect={handleSelect}
                    className="cursor-pointer bg-transparent! hover:bg-accent!"
                  >
                    {/* Left-aligned check with reserved space (opacity toggle) — matches the
                        InputEnum dropdown so enum and reference selects look identical. A
                        right-aligned `ml-auto` check floats in the empty row space and reads
                        as misaligned. */}
                    <Check
                      className={cn(
                        "mr-2 size-4 shrink-0 text-foreground",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className={listItemClassName}>{(renderListItem ?? renderItem)(option)}</div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DefaultLoadingSkeleton() {
  return (
    <CommandGroup>
      {[1, 2, 3].map((i) => (
        <CommandItem key={i} disabled>
          <div className="flex items-center gap-2 w-full">
            <div className="h-6 w-6 rounded-full animate-pulse bg-muted" />
            <div className="flex flex-col flex-1 gap-1">
              <div className="h-4 w-24 animate-pulse bg-muted rounded" />
              <div className="h-3 w-16 animate-pulse bg-muted rounded" />
            </div>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
