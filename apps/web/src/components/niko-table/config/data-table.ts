import type { LucideIcon } from "lucide-react"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { msg, type MessageDescriptor } from "@/i18n"
import {
  JOIN_OPERATORS,
  FILTER_OPERATORS,
  FILTER_VARIANTS,
  type JoinOperator,
  type FilterOperator,
  type FilterVariant,
} from "../lib/constants"

export type SortIconVariant = FilterVariant

interface SortIcons {
  asc: LucideIcon
  desc: LucideIcon
  unsorted: LucideIcon
}

// Menu labels are MessageDescriptors, not strings: this module is a static
// config array with no React in it, so it cannot translate anything itself.
// msg() records the English for the extractor and hands back a descriptor the
// call site renders with t() — and because a descriptor is an object, a label
// used without t() is a tsc error rather than a silently English menu.
interface SortLabels {
  asc: MessageDescriptor
  desc: MessageDescriptor
}

// Plain directional arrows for every column type. Ascending = up, descending =
// down, unsorted = both. We intentionally do NOT use the lettered/numbered
// variants (ArrowDownAZ/ZA, ArrowDown01/10) — the arrow direction alone conveys
// sort order; the menu LABELS (SORT_LABELS) still carry the type-specific wording
// ("Low to high", "Oldest first", etc.).
const DIRECTIONAL_SORT_ICONS: SortIcons = {
  asc: ArrowUp,
  desc: ArrowDown,
  unsorted: ArrowUpDown,
}

export const SORT_ICONS: Record<SortIconVariant, SortIcons> = {
  [FILTER_VARIANTS.TEXT]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.NUMBER]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.RANGE]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.DATE]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.DATE_RANGE]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.BOOLEAN]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.SELECT]: DIRECTIONAL_SORT_ICONS,
  [FILTER_VARIANTS.MULTI_SELECT]: DIRECTIONAL_SORT_ICONS,
}

export const SORT_LABELS: Record<SortIconVariant, SortLabels> = {
  [FILTER_VARIANTS.TEXT]: {
    asc: msg("Ascending"),
    desc: msg("Descending"),
  },
  [FILTER_VARIANTS.NUMBER]: {
    asc: msg("Low to high"),
    desc: msg("High to low"),
  },
  [FILTER_VARIANTS.RANGE]: {
    asc: msg("Low to high"),
    desc: msg("High to low"),
  },
  [FILTER_VARIANTS.DATE]: {
    asc: msg("Oldest first"),
    desc: msg("Newest first"),
  },
  [FILTER_VARIANTS.DATE_RANGE]: {
    asc: msg("Oldest first"),
    desc: msg("Newest first"),
  },
  [FILTER_VARIANTS.BOOLEAN]: {
    asc: msg("False first"),
    desc: msg("True first"),
  },
  [FILTER_VARIANTS.SELECT]: {
    asc: msg("Ascending"),
    desc: msg("Descending"),
  },
  [FILTER_VARIANTS.MULTI_SELECT]: {
    asc: msg("Ascending"),
    desc: msg("Descending"),
  },
}

/**
 * @credit Adapted from React Table's default config
 * @see https://react-table.tanstack.com/docs/overview
 */

export const dataTableConfig = {
  debounceMs: 300,
  throttleMs: 50,
  textOperators: [
    { label: msg("Contains"), value: FILTER_OPERATORS.ILIKE },
    { label: msg("Does not contain"), value: FILTER_OPERATORS.NOT_ILIKE },
    { label: msg("Is"), value: FILTER_OPERATORS.EQ },
    { label: msg("Is not"), value: FILTER_OPERATORS.NEQ },
    { label: msg("Is empty"), value: FILTER_OPERATORS.EMPTY },
    { label: msg("Is not empty"), value: FILTER_OPERATORS.NOT_EMPTY },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  numericOperators: [
    { label: msg("Is"), value: FILTER_OPERATORS.EQ },
    { label: msg("Is not"), value: FILTER_OPERATORS.NEQ },
    { label: msg("Is less than"), value: FILTER_OPERATORS.LT },
    {
      label: msg("Is less than or equal to"),
      value: FILTER_OPERATORS.LTE,
    },
    { label: msg("Is greater than"), value: FILTER_OPERATORS.GT },
    {
      label: msg("Is greater than or equal to"),
      value: FILTER_OPERATORS.GTE,
    },
    { label: msg("Is between"), value: FILTER_OPERATORS.BETWEEN },
    { label: msg("Is empty"), value: FILTER_OPERATORS.EMPTY },
    { label: msg("Is not empty"), value: FILTER_OPERATORS.NOT_EMPTY },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  dateOperators: [
    { label: msg("Is"), value: FILTER_OPERATORS.EQ },
    { label: msg("Is not"), value: FILTER_OPERATORS.NEQ },
    { label: msg("Is before"), value: FILTER_OPERATORS.LT },
    { label: msg("Is after"), value: FILTER_OPERATORS.GT },
    { label: msg("Is on or before"), value: FILTER_OPERATORS.LTE },
    { label: msg("Is on or after"), value: FILTER_OPERATORS.GTE },
    { label: msg("Is between"), value: FILTER_OPERATORS.BETWEEN },
    {
      label: msg("Is relative to today"),
      value: FILTER_OPERATORS.RELATIVE,
    },
    { label: msg("Is empty"), value: FILTER_OPERATORS.EMPTY },
    { label: msg("Is not empty"), value: FILTER_OPERATORS.NOT_EMPTY },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  selectOperators: [
    { label: msg("Is"), value: FILTER_OPERATORS.EQ },
    { label: msg("Is not"), value: FILTER_OPERATORS.NEQ },
    { label: msg("Is empty"), value: FILTER_OPERATORS.EMPTY },
    { label: msg("Is not empty"), value: FILTER_OPERATORS.NOT_EMPTY },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  multiSelectOperators: [
    { label: msg("Has any of"), value: FILTER_OPERATORS.IN },
    { label: msg("Has none of"), value: FILTER_OPERATORS.NOT_IN },
    { label: msg("Is empty"), value: FILTER_OPERATORS.EMPTY },
    { label: msg("Is not empty"), value: FILTER_OPERATORS.NOT_EMPTY },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  booleanOperators: [
    { label: msg("Is"), value: FILTER_OPERATORS.EQ },
    { label: msg("Is not"), value: FILTER_OPERATORS.NEQ },
  ] satisfies { label: MessageDescriptor; value: FilterOperator }[],
  sortOrders: [
    { label: msg("Ascending"), value: "asc" as const },
    { label: msg("Descending"), value: "desc" as const },
  ],
  filterVariants: [
    FILTER_VARIANTS.TEXT,
    FILTER_VARIANTS.NUMBER,
    FILTER_VARIANTS.RANGE,
    FILTER_VARIANTS.DATE,
    FILTER_VARIANTS.DATE_RANGE,
    FILTER_VARIANTS.BOOLEAN,
    FILTER_VARIANTS.SELECT,
    FILTER_VARIANTS.MULTI_SELECT,
  ] satisfies FilterVariant[],
  operators: [
    FILTER_OPERATORS.ILIKE,
    FILTER_OPERATORS.NOT_ILIKE,
    FILTER_OPERATORS.EQ,
    FILTER_OPERATORS.NEQ,
    FILTER_OPERATORS.IN,
    FILTER_OPERATORS.NOT_IN,
    FILTER_OPERATORS.EMPTY,
    FILTER_OPERATORS.NOT_EMPTY,
    FILTER_OPERATORS.LT,
    FILTER_OPERATORS.LTE,
    FILTER_OPERATORS.GT,
    FILTER_OPERATORS.GTE,
    FILTER_OPERATORS.BETWEEN,
    FILTER_OPERATORS.RELATIVE,
  ] satisfies FilterOperator[],
  joinOperators: [
    JOIN_OPERATORS.AND,
    JOIN_OPERATORS.OR,
  ] satisfies JoinOperator[],
} as const

export type DataTableConfig = typeof dataTableConfig
