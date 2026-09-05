import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { useTheme } from '@/components/ThemeProvider'

/**
 * Shared plumbing for the four CodeMirror-backed form controls (code, html, json,
 * jsonata). They are otherwise near-identical wrappers, and both problems solved
 * here were present in all four.
 */

export interface CodeMirrorFieldProps {
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
