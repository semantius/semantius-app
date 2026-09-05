import { describe, it, expect } from 'vitest'
import { InputTime } from '../InputTime'
import { renderControl } from './harness'

describe('InputTime', () => {
  // `<input type="time">` has no ARIA role, so there is nothing for getByRole
  // to find; locate it by type and assert the COMPUTED name, which is still the
  // point (a label association alone is not).
  const timeInput = (container: HTMLElement) => container.querySelector('input[type="time"]')

  it('should render time input', () => {
    const { container } = renderControl(<InputTime name="time" />)
    expect(container.querySelector('input')).toHaveAttribute('type', 'time')
  })

  it('is named by its label', () => {
    const { container } = renderControl(<InputTime name="time" label="Start time" />)
    expect(timeInput(container)).toHaveAccessibleName('Start time')
  })

  it('references its description from aria-describedby', () => {
    const { container } = renderControl(
      <InputTime name="time" label="Start time" description="24-hour clock" />,
    )
    expect(timeInput(container)).toHaveAccessibleDescription('24-hour clock')
  })
})
