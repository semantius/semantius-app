// Hand-maintained utility helpers that are NOT part of shadcn's registry output.
//
// Why this file exists: `src/lib/utils.ts` is owned by the shadcn CLI (it is the
// `aliases.utils` target in components.json). Any `shadcn add` or `--preset apply`
// resets utils.ts to the registry default (`cn` only), silently wiping anything we
// add there. Keep our own helpers here so the CLI can never clobber them.
// Import `cn` from "@/lib/utils"; import everything else from "@/lib/utils-ext".

export function interpolate(template: string, obj: Record<string, unknown>): string {
  return template.replace(/\$\{(\w+)\}/g, (_, key) => String(obj[key] ?? ""))
}

/**
 * Surface classes that make a non-`<input>` form control (combobox / enum /
 * reference / date / date-time trigger) match the base shadcn `Input` fill in
 * `ui/input.tsx`: the `bg-input/50` filled look with a 3:1 `--input-border` boundary
 * (1.4.11) and no hover/expanded color shift. Apply it on a `<Button variant="ghost">` trigger —
 * the Button base already supplies the same radius, focus ring, `disabled:opacity-50`
 * and aria-invalid states as `Input`, so the trigger renders identically to a plain
 * text field and field appearance is driven by the theme token (not by some fields
 * being `variant="outline"` white+border and others filled). `disabled:opacity-50`
 * is then the only thing distinguishing readonly/disabled from active fields.
 *
 * Keep the surface token in sync with the `Input` className in `ui/input.tsx`
 * (that file is shadcn-CLI-owned and cannot import from here).
 */
export const inputSurfaceClassName =
  "bg-input/50 hover:bg-input/50 aria-expanded:bg-input/50 dark:hover:bg-input/50 border-input-border"
