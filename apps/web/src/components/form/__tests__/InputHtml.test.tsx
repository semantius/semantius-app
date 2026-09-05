import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputHtml } from '../InputHtml'
import { renderControl } from './harness'

describe('InputHtml', () => {
  // The editor is code-split, so it has to be awaited. Wait for the editor
  // itself rather than for the Suspense fallback: in a real browser the chunk
  // can land before a test gets around to looking for "Loading editor...".
  const findEditor = (name: string) =>
    screen.findByRole('textbox', { name }, { timeout: 5000 })

  it('should render html editor', async () => {
    const { container } = renderControl(<InputHtml name="html" label="Body" />)
    expect(await findEditor('Body')).toBeInTheDocument()
    expect(container.querySelector('.pt-2')).toBeTruthy()
  })

  it('is named by its label', async () => {
    // A CodeMirror editor is a contenteditable div, not a labelable element:
    // the name has to reach `.cm-content` through aria-labelledby, set via
    // EditorView.contentAttributes (see codeMirrorField.ts).
    renderControl(<InputHtml name="html" label="Body" />)
    expect(await findEditor('Body')).toHaveAccessibleName('Body')
  })

  it('references its description from aria-describedby', async () => {
    renderControl(<InputHtml name="html" label="Body" description="Rendered as rich text" />)
    expect(await findEditor('Body')).toHaveAccessibleDescription('Rendered as rich text')
  })
})
