import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { useTheme } from '@/components/ThemeProvider'
import { cn } from '@/lib/utils'

/**
 * Shared plumbing for the four CodeMirror-backed form controls (code, html, json,
 * jsonata). They are otherwise near-identical wrappers, and both problems solved
 * here were present in all four.
 */

export interface CodeMirrorFieldProps {
  /** Id the field's `<FormLabel htmlFor>` points at. Goes on `.cm-content`,
   *  the contenteditable div that actually takes focus. */
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  disabled?: boolean
  readOnly?: boolean
  /** Id of the field's <FormLabel>. A CodeMirror editor is a contenteditable div, */
  /** not a labelable element, so `<label htmlFor>` cannot name it — the association */
  /** has to be made from the editor outwards. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/**
 * Puts the accessibility attributes on the element that actually receives focus.
 *
 * CodeMirror renders `.cm-content` as `<div contenteditable role="textbox">`; that
 * div is the focus target and the thing a screen reader announces. Attributes set
 * on our wrapper `<div>` (or passed to <CodeMirror>) never reach it, which is why
 * these four fields had no accessible name at all. `EditorView.contentAttributes`
 * is the supported way in.
 */
export function contentA11yAttributes(props: CodeMirrorFieldProps): Extension {
  const attrs: Record<string, string> = {}
  if (props.id) attrs['id'] = props.id
  if (props['aria-labelledby']) attrs['aria-labelledby'] = props['aria-labelledby']
  if (props['aria-describedby']) attrs['aria-describedby'] = props['aria-describedby']
  if (props['aria-invalid']) attrs['aria-invalid'] = 'true'
  if (props.readOnly || props.disabled) attrs['aria-readonly'] = 'true'
  return EditorView.contentAttributes.of(attrs)
}

/**
 * The editor theme has to follow the app theme. All four wrappers hard-coded
 * `theme="light"`, which painted a white editor island in an otherwise dark UI —
 * invisible to axe, because dark-on-white passes contrast on its own terms.
 * `resolvedTheme` (not `theme`) is the one to read: `theme` can be the literal
 * string "system", which is not a color.
 */
export function useEditorTheme(): 'light' | 'dark' {
  const { resolvedTheme } = useTheme()
  return resolvedTheme === 'dark' ? 'dark' : 'light'
}

/**
 * Surface classes that make a CodeMirror field look like every other form
 * control — the same `bg-input/50` fill, radius and 3:1 boundary the base
 * `Input` has (see `inputSurfaceClassName`). All four editor controls shipped
 * the same `border rounded-md` wrapper, which matched nothing else on the form.
 *
 * The focus ring is `has-[.cm-focused]` rather than `focus-within`: CodeMirror
 * takes focus on a nested contenteditable and manages `.cm-focused` itself, and
 * `focus-within` also fires for the scrollbar and the panel widgets.
 *
 * `opacity-50` matches `disabled:opacity-50` on the other controls, so a
 * readonly editor is dimmed exactly as much as a readonly text field, rather
 * than the `opacity-60` each of the four used to apply separately.
 */
export function codeMirrorSurfaceClassName(opts: {
  invalid?: boolean
  readOnly?: boolean
  disabled?: boolean
}): string {
  return cn(
    'overflow-hidden rounded-2xl border bg-input/50 transition-[color,box-shadow] duration-200',
    'has-[.cm-focused]:border-ring has-[.cm-focused]:ring-3 has-[.cm-focused]:ring-ring/30',
    // The @uiw light and dark themes each paint .cm-editor and .cm-gutters, so
    // without this the editor is an opaque island of a slightly different color
    // inside a field-colored box. A descendant variant is (0,2,0) and beats
    // their single-class rules. Syntax colors are untouched.
    '[&_.cm-editor]:bg-transparent [&_.cm-gutters]:bg-transparent [&_.cm-gutters]:border-none',
    '[&_.cm-activeLine]:bg-transparent [&_.cm-activeLineGutter]:bg-transparent',
    opts.invalid
      ? 'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
      : 'border-input-border',
    (opts.readOnly || opts.disabled) && 'opacity-50',
  )
}

