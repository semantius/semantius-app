import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { APISelect } from '../api-select'

/** Distance from the trigger's right border to the chevron's right edge. */
function chevronInset(trigger: HTMLElement): number {
  const chevron = trigger.querySelector('svg')
  if (!chevron) throw new Error('expected a chevron svg inside the trigger')
  return trigger.getBoundingClientRect().right - chevron.getBoundingClientRect().right
}

/**
 * The structural half of this component's accessibility, asserted here because
 * it is invisible on screen: a nested button and a dangling `aria-controls` both
 * render exactly like the correct markup.
 *
 * Nothing is mocked. `APISelect` takes `fetcher` / `recordFetcher` as real props
 * for exactly this reason, so the test supplies a local data source instead of
 * replacing a module. The same three defects existed in `InputEnum.tsx` and
 * `ui-ext/combobox.tsx` — all three build a `role="combobox"` trigger the same
 * way — so the assertions are duplicated per component; a regression reaches one
 * of them alone.
 */
describe('APISelect', () => {
  type Row = { id: string; name: string }
  const ROWS: Row[] = [
    { id: '1', name: 'Ada' },
    { id: '2', name: 'Grace' },
  ]

  function renderSelect(props: Partial<React.ComponentProps<typeof APISelect<Row>>> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <APISelect<Row>
          label="Owner"
          value=""
          onChange={() => {}}
          getRecordId={(r) => r.id}
          renderItem={(r) => r.name}
          fetcher={async () => ROWS}
          recordFetcher={async (id) => ROWS.find((r) => r.id === id) ?? null}
          id="owner"
          {...props}
        />
      </QueryClientProvider>,
    )
  }

  it('renders the clear button OUTSIDE the trigger button', async () => {
    // A <button> inside a <button> is invalid HTML and axe `nested-interactive`
    // (serious). It got there because the clear control was one of the
    // PopoverTrigger's children.
    renderSelect({ value: '1' })
    const clear = await screen.findByRole('button', { name: /clear selection/i })
    expect(screen.getByRole('combobox').contains(clear)).toBe(false)
  })

  it('keeps the clear button out of the trigger accessible name', async () => {
    // The trigger self-references in aria-labelledby, so its name is computed
    // from its content — anything nested inside it is read out as part of the
    // field's name.
    renderSelect({ value: '1', 'aria-labelledby': 'owner-label' })
    await screen.findByRole('button', { name: /clear selection/i })
    expect(screen.getByRole('combobox')).not.toHaveAccessibleName(/clear selection/i)
  })

  it('is announced by its label, not just "not by the clear button"', async () => {
    // The negative assertion above passes on a trigger with NO name at all. This
    // renders the real label element the id points at, so a broken
    // aria-labelledby self-reference fails here.
    renderSelect({ value: '1', 'aria-labelledby': 'owner-label' })
    render(<span id="owner-label">Owner</span>)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Ada'))
    expect(screen.getByRole('combobox')).toHaveAccessibleName(/Owner/)
  })

  it('shows no clear button when the field is not clearable', async () => {
    renderSelect({ value: '1', clearable: false })
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Ada'))
    expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument()
  })

  it('returns focus to the trigger after the clear button is clicked', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [value, setValue] = useState('1')
      return (
        <APISelect<Row>
          label="Owner"
          value={value}
          onChange={setValue}
          getRecordId={(r) => r.id}
          renderItem={(r) => r.name}
          fetcher={async () => ROWS}
          recordFetcher={async (id) => ROWS.find((r) => r.id === id) ?? null}
          id="owner"
        />
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Controlled />
      </QueryClientProvider>,
    )
    const trigger = screen.getByRole('combobox')
    await user.click(await screen.findByRole('button', { name: /clear selection/i }))
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Select...')
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger after the clear button is activated with the keyboard', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [value, setValue] = useState('1')
      return (
        <APISelect<Row>
          label="Owner"
          value={value}
          onChange={setValue}
          getRecordId={(r) => r.id}
          renderItem={(r) => r.name}
          fetcher={async () => ROWS}
          recordFetcher={async (id) => ROWS.find((r) => r.id === id) ?? null}
          id="owner"
        />
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Controlled />
      </QueryClientProvider>,
    )
    const trigger = screen.getByRole('combobox')
    const clear = await screen.findByRole('button', { name: /clear selection/i })
    clear.focus()
    expect(document.activeElement).toBe(clear)
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(trigger).toHaveTextContent('Select...')
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps the chevron the same distance from the trigger edge whether the field is clearable or not', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <div style={{ width: 406 }}>
          <APISelect<Row>
            label="Owner"
            value="1"
            onChange={() => {}}
            getRecordId={(r) => r.id}
            renderItem={(r) => r.name}
            fetcher={async () => ROWS}
            recordFetcher={async (id) => ROWS.find((r) => r.id === id) ?? null}
            id="filled"
            width="406px"
          />
          <APISelect<Row>
            label="Owner"
            value=""
            onChange={() => {}}
            getRecordId={(r) => r.id}
            renderItem={(r) => r.name}
            fetcher={async () => ROWS}
            recordFetcher={async () => null}
            id="empty"
            width="406px"
          />
        </div>
      </QueryClientProvider>,
    )

    const filled = document.getElementById('filled') as HTMLElement
    const empty = document.getElementById('empty') as HTMLElement
    await waitFor(() => expect(filled).toHaveTextContent('Ada'))

    const filledInset = chevronInset(filled)
    const emptyInset = chevronInset(empty)
    expect(Math.abs(filledInset - emptyInset)).toBeLessThan(1)
    expect(filledInset).toBeGreaterThanOrEqual(11)
    expect(filledInset).toBeLessThanOrEqual(13)
    expect(getComputedStyle(filled).paddingRight).toBe('12px')
    expect(getComputedStyle(empty).paddingRight).toBe('12px')
    expect(getComputedStyle(empty.querySelector('svg')!).color).toBe(
      getComputedStyle(filled.querySelector('svg')!).color,
    )
    expect(getComputedStyle(empty.querySelector('svg')!).opacity).toBe(
      getComputedStyle(filled.querySelector('svg')!).opacity,
    )
  })

  it('points aria-controls at an element that actually exists', async () => {
    // cmdk's Command.List overwrites any id passed to it, so the id this
    // component generated pointed at nothing whenever the popup was open — the
    // exact aria-valid-attr-value failure the attribute was added to avoid.
    const user = userEvent.setup()
    renderSelect()

    const trigger = screen.getByRole('combobox')
    expect(trigger).not.toHaveAttribute('aria-controls')

    await user.click(trigger)
    await waitFor(() => {
      const id = trigger.getAttribute('aria-controls')
      expect(id).toBeTruthy()
      expect(document.getElementById(id!)).not.toBeNull()
    })
  })
})
