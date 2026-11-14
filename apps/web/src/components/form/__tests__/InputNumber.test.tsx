import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputNumber } from '../InputNumber'
import { renderControl } from './harness'

describe('InputNumber', () => {
  const numberValidator = ({ value }: { value: unknown }) => {
    if (value === undefined || value === '') return undefined
    return isNaN(Number(value)) ? 'must be a number' : undefined
  }

  it('should render number input type', () => {
    const { container } = renderControl(<InputNumber name="age" />)
    const input = container.querySelector('input')
    // NOT type="number". The control is built on react-number-format, which
    // needs a TEXT input to render grouped/formatted values and control the
    // caret; a native number input cannot show "1,234.50" at all. Numeric
    // intent is carried by inputMode, which is what drives the mobile keypad.
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'decimal')
  })

  it('is named by its label', () => {
    renderControl(<InputNumber name="age" label="Age" />)
    expect(screen.getByRole('textbox', { name: 'Age' })).toBeInTheDocument()
  })

  it('references its description from aria-describedby', () => {
    renderControl(<InputNumber name="age" label="Age" description="Whole years" />)
    expect(screen.getByRole('textbox', { name: 'Age' })).toHaveAccessibleDescription('Whole years')
  })

  it('should handle number values', () => {
    const { container } = renderControl(<InputNumber name="age" />, {
      defaultValues: { age: 42 },
    })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('42')
  })

  it('should show required indicator when required', () => {
    renderControl(<InputNumber name="age" label="Age" inputMode="required" />)
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should validate required field', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputNumber
        name="age"
        label="Age"
        inputMode="required"
        validators={{
          onBlur: ({ value }) =>
            value === undefined || value === null || value === '' ? 'must not be empty' : undefined,
        }}
      />,
    )

    const input = screen.getByLabelText(/age/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  it('should detect invalid number format', async () => {
    renderControl(<InputNumber name="age" label="Age" validators={{ onBlur: numberValidator }} />)

    const input = screen.getByLabelText(/age/i) as HTMLInputElement
    expect(input.type).toBe('text')

    // A text input has no native numeric filtering, so react-number-format has
    // to do the rejecting itself — that guarantee is the whole reason dropping
    // type="number" is safe, so assert it rather than the attribute alone.
    const user = userEvent.setup()
    await user.type(input, 'abc12def')

    expect(input.value).toBe('12')
  })

  it('should accept valid number', async () => {
    const user = userEvent.setup()
    renderControl(<InputNumber name="age" label="Age" validators={{ onBlur: numberValidator }} />)

    const input = screen.getByLabelText(/age/i) as HTMLInputElement
    await user.type(input, '25')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must be a number/i)).not.toBeInTheDocument()
      expect(input.value).toBe('25')
    })
  })

  it('should handle default value', () => {
    const { container } = renderControl(<InputNumber name="age" />, {
      defaultValues: { age: 99 },
    })
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('99')
  })

  const interviewCount = {
    type: 'integer',
    format: 'int32',
    title: 'Interview count',
    ctype: 'rollup',
    rollup: {
      function: 'count',
      link_field: 'interviews.application_id',
      include_hidden_rows: true,
    },
  }

  const applicationTable = {
    table_name: 'applications',
    module_slug: 'applicant-tracking',
    id_column: 'id',
  }

  const applicationChildren = [
    {
      id: 'interviews.application_id',
      plural_label: 'Interviews',
    },
  ]

  it('offers a drill-down link on a rollup to the linked filtered grid', () => {
    renderControl(
      <InputNumber name="interview_count" label="Interview count" schema={interviewCount} inputMode="disabled" />,
      {
        defaultValues: { id: 9, interview_count: 2 },
        table: applicationTable,
        childRelations: applicationChildren,
      },
    )
    const link = screen.getByRole('link', { name: 'Open Interviews' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const url = new URL(link.getAttribute('href')!, 'https://example.test')
    expect(url.pathname).toBe('/applicant-tracking/interviews')
    expect(JSON.parse(url.searchParams.get('filters')!)).toEqual([
      {
        id: 'application_id',
        value: '9',
        variant: 'select',
        operator: 'eq',
        joinOperator: 'and',
      },
    ])
  })

  it('names the drill-down on hover', async () => {
    const user = userEvent.setup()
    renderControl(
      <InputNumber name="interview_count" label="Interview count" schema={interviewCount} inputMode="disabled" />,
      {
        defaultValues: { id: 9, interview_count: 2 },
        table: applicationTable,
        childRelations: applicationChildren,
      },
    )
    await user.hover(screen.getByRole('link', { name: 'Open Interviews' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open Interviews')
  })

  it('keeps the drill-down link while the rollup is disabled', () => {
    renderControl(
      <InputNumber name="interview_count" label="Interview count" schema={interviewCount} inputMode="disabled" />,
      {
        defaultValues: { id: 9, interview_count: 2 },
        table: applicationTable,
        childRelations: applicationChildren,
      },
    )
    expect(screen.getByLabelText(/^Interview count/)).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open Interviews' })).toBeInTheDocument()
  })

  it('offers no drill-down without a row id', () => {
    renderControl(
      <InputNumber name="interview_count" label="Interview count" schema={interviewCount} />,
      { defaultValues: { interview_count: 0 }, table: applicationTable },
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers no drill-down on an ordinary number field', () => {
    renderControl(<InputNumber name="age" label="Age" />, {
      defaultValues: { id: 9, age: 2 },
      table: applicationTable,
    })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
