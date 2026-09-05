/**
 * Shared id/ARIA wiring for form controls.
 *
 * Every control in this folder renders the same three-part unit — <FormLabel>,
 * the control, <FormDescription> and <FormError> — so the ids that tie them
 * together are computed here rather than re-spelled at 29 call sites. That
 * duplication is exactly how 7 controls ended up with a `<FormLabel htmlFor>`
 * pointing at nothing and 28 never referencing their description at all.
 *
 * Rules encoded here:
 * - The description and the error are ADDITIVE, never mutually exclusive. A
 *   field can carry help text and be invalid at the same time, and a user who
 *   hears only "must not be empty" has lost the instructions that would let them
 *   fix it. (`InputBoolean` used to pick one or the other with a ternary.)
 * - When neither exists the attribute must be ABSENT, not `''` and not `' '`.
 *   An `aria-describedby` that resolves to no element is an
 *   `aria-valid-attr-value` violation — axe fails the page for it.
 * - The description id is only emitted when there is a real description, because
 *   `FormDescription` renders a `&nbsp;` spacer (to keep row heights stable) when
 *   there is none, and pointing at a spacer announces nothing.
 * - ...and only when `FormDescription` actually RENDERS. In view mode it returns
 *   null while the control is still rendered (`SchemaForm` forces
 *   `inputMode = 'readonly'`, it does not drop the field), so a description id
 *   emitted there dangles on every read-only record and for every user without
 *   edit permission. `formMode` is therefore part of the contract, not an
 *   optional extra: this function and `FormDescription` must agree on exactly
 *   when the description element exists.
 */

import type { FormContextValue } from './FormContext'

type FormMode = FormContextValue['formMode']

export function descriptionId(name: string): string {
  return `${name}-description`
}

export function errorId(name: string): string {
  return `${name}-error`
}

export function describedBy(
  name: string,
  opts: { description?: string; error?: string; formMode?: FormMode },
): string | undefined {
  // View mode renders neither element (see FormDescription / FormError), so it
  // suppresses both ids rather than just the description's.
  if (opts.formMode === 'view') return undefined
  const ids: string[] = []
  if (opts.description) ids.push(descriptionId(name))
  if (opts.error) ids.push(errorId(name))
  return ids.length > 0 ? ids.join(' ') : undefined
}

/**
 * `aria-labelledby` for controls that are NOT labelable elements — a `<button>`
 * trigger (date / date-time / reference pickers) or a CodeMirror `.cm-content`
 * div. A `<label htmlFor>` only associates with form-associated elements, so for
 * these the association has to run the other way. Returns undefined when the
 * field has no label, so the attribute is omitted rather than dangling.
 */
export function labelledBy(name: string, label?: string): string | undefined {
  return label ? `${name}-label` : undefined
}

export function labelId(name: string): string {
  return `${name}-label`
}
