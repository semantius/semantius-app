import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { InputJson } from '../InputJson'
import { renderControl } from './harness'

describe('InputJson', () => {
  // The editor is code-split, so it has to be awaited. Wait for the editor
  // itself rather than for the Suspense fallback: in a real browser the chunk
  // can land before a test gets around to looking for "Loading editor...".
  const findEditor = (name: string) =>
    screen.findByRole('textbox', { name }, { timeout: 5000 })

  const jsonValidator = ({ value }: { value: string }) => {
    if (!value) return undefined
    try {
      JSON.parse(value)
      return undefined
    } catch {
      return 'must be valid JSON'
    }
  }

  it('should render json editor', async () => {
    const { container } = renderControl(<InputJson name="json" label="Config" />)
    expect(await findEditor('Config')).toBeInTheDocument()
    expect(container.querySelector('.pt-2')).toBeTruthy()
  })

  it('is named by its label', async () => {
    // A CodeMirror editor is a contenteditable div, not a labelable element:
    // the name has to reach `.cm-content` through aria-labelledby, set via
    // EditorView.contentAttributes (see codeMirrorField.ts).
    renderControl(<InputJson name="json" label="Config" />)
    expect(await findEditor('Config')).toHaveAccessibleName('Config')
  })

  it('references its description from aria-describedby', async () => {
    renderControl(<InputJson name="json" label="Config" description="Any valid JSON document" />)
    expect(await findEditor('Config')).toHaveAccessibleDescription('Any valid JSON document')
  })

  it('should show required indicator when required', () => {
    renderControl(<InputJson name="json" label="JSON" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  // The three tests below drive the real editor: seed a value, take focus away,
  // and read what the control renders. They replace three "tests" that
  // declared a validator inline and asserted its return values — which
  // exercised nothing in this folder and could not have failed for any change
  // to the component.
  it('reports an empty required field when the editor loses focus', async () => {
    renderControl(
      <InputJson
        name="json"
        label="Config"
        inputMode="required"
        validators={{
          onBlur: ({ value }) => (!value || value.trim() === '' ? 'must not be empty' : undefined),
        }}
      />,
      { defaultValues: { json: '' } },
    )

    // A required field's name carries the marker — "Config* (required)" — so
    // this is a prefix match, not the exact one the other tests use.
    const editor = await screen.findByRole('textbox', { name: /^Config/ }, { timeout: 5000 })
    editor.focus()
    editor.blur()

    expect(await screen.findByRole('alert')).toHaveTextContent('must not be empty')
    expect(editor).toHaveAttribute('aria-invalid', 'true')
  })

  it('reports invalid JSON when the editor loses focus, and describes the field by it', async () => {
    renderControl(
      <InputJson name="json" label="Config" validators={{ onBlur: jsonValidator }} />,
      { defaultValues: { json: '{incomplete' } },
    )

    const editor = await findEditor('Config')
    editor.focus()
    editor.blur()

    expect(await screen.findByRole('alert')).toHaveTextContent('must be valid JSON')
    await waitFor(() => {
      expect(editor).toHaveAttribute('aria-invalid', 'true')
      // The error is additive with the description (see fieldAria.ts): a user
      // who lands on the field hears what is wrong with it.
      expect(editor).toHaveAccessibleDescription('must be valid JSON')
    })
  })

  it('accepts valid JSON without an error when the editor loses focus', async () => {
    renderControl(
      <InputJson name="json" label="Config" validators={{ onBlur: jsonValidator }} />,
      { defaultValues: { json: '{"key": "value"}' } },
    )

    const editor = await findEditor('Config')
    editor.focus()
    editor.blur()

    // The invalid case above proves blur reaches the validator; here the same
    // path has to leave the field clean. Give it the same turn to render.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(editor).not.toHaveAttribute('aria-invalid', 'true')
  })
})
