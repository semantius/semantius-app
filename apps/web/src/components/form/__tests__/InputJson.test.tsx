import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { InputJson } from '../InputJson'
import { renderControl } from './harness'

describe('InputJson', () => {
  // The editor is code-split, so it has to be awaited. Wait for the editor
  // itself rather than for the Suspense fallback: in a real browser the chunk
  // can land before a test gets around to looking for "Loading editor...".
  const findEditor = (name: string) =>
    screen.findByRole('textbox', { name }, { timeout: 5000 })

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

  it('should validate required field via validator', () => {
    const validatorFn = (value: string) => {
      return !value || value.trim() === '' ? 'must not be empty' : undefined
    }

    // Test the validator function
    expect(validatorFn('')).toBe('must not be empty')
    expect(validatorFn('  ')).toBe('must not be empty')
    expect(validatorFn('{"key": "value"}')).toBeUndefined()
  })

  it('should detect invalid JSON via validator', () => {
    const validatorFn = (value: string) => {
      if (!value) return undefined
      try {
        JSON.parse(value)
        return undefined
      } catch {
        return 'must be valid JSON'
      }
    }

    // Test the validator function directly
    expect(validatorFn('{invalid}')).toBe('must be valid JSON')
    expect(validatorFn('{"valid": "json"}')).toBeUndefined()
    expect(validatorFn('[1, 2, 3]')).toBeUndefined()
    expect(validatorFn('["a","b"]')).toBeUndefined()
    expect(validatorFn('{incomplete')).toBe('must be valid JSON')
  })

  it('should accept valid JSON via validator', () => {
    const validatorFn = (value: string) => {
      if (!value) return undefined
      try {
        JSON.parse(value)
        return undefined
      } catch {
        return 'must be valid JSON'
      }
    }

    // Test the validator accepts valid JSON
    expect(validatorFn('{"key": "value"}')).toBeUndefined()
    expect(validatorFn('[]')).toBeUndefined()
    expect(validatorFn('null')).toBeUndefined()
    expect(validatorFn('123')).toBeUndefined()
    expect(validatorFn('"string"')).toBeUndefined()
  })
})
