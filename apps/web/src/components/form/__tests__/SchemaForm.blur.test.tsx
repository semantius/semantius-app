import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import type { SchemaObject } from 'ajv'
import { SchemaForm } from '../SchemaForm'
import { disableCollector } from '@/i18n/missing'

/**
 * On-blur validation, and whether ONE press of a submit button counts.
 *
 * Every press here is a real one: `userEvent` from `vitest/browser` drives
 * Playwright, so `click(el, { delay: 250 })` is a mouse held down for 250ms and
 * released where it was pressed, and `tab()` / `keyboard()` are real keys. That
 * is what makes a lost click observable at all: when the page moves between
 * press and release, the release lands beside the button and the browser fires
 * no click — a synthetic click would land regardless.
 *
 * The observers (`watchPress`) only read: capture-phase listeners record the
 * pressed button's top at press and at release (`delta`) and count the form's
 * submit events. Every measurement is also logged as one `[blur]` line, which
 * is the record the plan's tables are filled from.
 */

const MUST_NOT_BE_EMPTY = /must not be empty/i

/**
 * A "did not move" check: |delta| < 1 px, the owner's tolerance for sub-pixel
 * rounding (a lost click needs about 16 px).
 */
const NO_MOVE = {
  asymmetricMatch: (delta: unknown) => typeof delta === 'number' && Math.abs(delta) < 1,
  toString: () => 'NoMove',
  toAsymmetricMatcher: () => '|delta| < 1 px',
}

/** SHORT: the whole form fits the 1280x800 viewport, so the bar is NOT pinned. */
const SHORT: SchemaObject = {
  type: 'object',
  properties: {
    code: { type: 'string', format: 'text', title: 'Code', inputMode: 'required', description: 'Short code' },
    name: { type: 'string', format: 'text', title: 'Name', inputMode: 'required' },
    email: { type: 'string', format: 'email', title: 'Email', width: 's' },
    status: { type: 'string', format: 'enum', title: 'Status', inputMode: 'required', enum: ['open', 'closed'] },
  },
}

/** LONG: taller than the viewport, so the bar is pinned to its bottom. */
const LONG: SchemaObject = {
  type: 'object',
  properties: {
    name: { type: 'string', format: 'text', title: 'Name', inputMode: 'required' },
    ...Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `field_${i + 1}`,
        { type: 'string', format: 'text', title: `Field ${i + 1}`, width: 'w' },
      ]),
    ),
    tail: { type: 'string', format: 'text', title: 'Tail', inputMode: 'required' },
  },
}

/**
 * HIDE: the fixture of "does not let an error on a field that has since left
 * the screen block the next submit" (SchemaForm.test.tsx), with ONE change: the
 * rule takes `code` off the form as `disabled`, not `readonly`. With `readonly`
 * the hidden `ab` is still sent and still fails its pattern, so no press could
 * ever save; and a blur error cannot be raised on a value that then becomes
 * valid without leaving the field again, which re-validates it. `disabled` is
 * not drawn on a create form either, and is not sent.
 */
const HIDE: SchemaObject = {
  type: 'object',
  properties: {
    kind: { type: 'string', format: 'text', title: 'Kind' },
    code: {
      type: 'string', format: 'text', title: 'Code', pattern: '^[A-Z]{3}$',
      input_type_rule: { if: [{ '==': [{ var: 'kind' }, 'none'] }, 'disabled', 'default'] },
    },
  },
}

// --- reading the page -------------------------------------------------------

function control(name: string): HTMLElement {
  const el = document.getElementById(name)
  if (!el) throw new Error(`no control #${name}`)
  return el
}

/** The field's grid cell: label, control, description and error. */
function cell(name: string): HTMLElement {
  const el = control(name).closest('.span-2, .span-4, .span-8')
  if (!(el instanceof HTMLElement)) throw new Error(`no grid cell for #${name}`)
  return el
}

/**
 * The field's own block (label, control, description, error). Not the grid
 * cell: cells stretch to their row, so a neighbor's error grows them too.
 */
function fieldBlock(name: string): HTMLElement {
  const el = control(name).closest('.pt-2')
  if (!(el instanceof HTMLElement)) throw new Error(`no field block for #${name}`)
  return el
}

function errorText(name: string): string | null {
  return document.getElementById(`${name}-error`)?.textContent ?? null
}

/** The error text, or '' when there is none — for `toMatch`, which refuses null. */
function shownError(name: string): string {
  return errorText(name) ?? ''
}

function errors(...names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, errorText(name)]))
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
}

function bar(): HTMLElement {
  const el = document.querySelector('[data-slot=sticky-container]')
  if (!(el instanceof HTMLElement)) throw new Error('no sticky bar')
  return el
}

function grid(): HTMLElement {
  const el = submitButton().form?.querySelector('.grid-container')
  if (!(el instanceof HTMLElement)) throw new Error('no field grid')
  return el
}

function layout() {
  const b = bar().getBoundingClientRect()
  const g = grid().getBoundingClientRect()
  return {
    barTop: b.top,
    barBottom: b.bottom,
    gridBottom: g.bottom,
    // The form's `space-y-4` is a margin on every child but the last, so the
    // gap above the bar is the grid's bottom margin plus the bar's own top one.
    gap: parseFloat(getComputedStyle(grid()).marginBottom) + parseFloat(getComputedStyle(bar()).marginTop),
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }
}

/** The whole form fits, and the bar sits right after the last field. */
function expectUnpinned() {
  const l = layout()
  expect(l.scrollHeight, 'the form fits the window').toBeLessThanOrEqual(l.innerHeight)
  expect(Math.abs(l.barTop - (l.gridBottom + l.gap)), 'bar right after the last field').toBeLessThanOrEqual(1)
}

/** The bar's bottom is the window's bottom while the form continues below. */
function expectPinned() {
  const l = layout()
  expect(Math.abs(l.barBottom - l.innerHeight), 'bar bottom at the window bottom').toBeLessThanOrEqual(1)
  expect(l.gridBottom, 'the form continues below the bar').toBeGreaterThan(l.innerHeight)
}

/** Lets a press finish: the submit, its validation and the 100ms focus timer. */
function settle(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(id: string, data: unknown) {
  console.log(`[blur] ${id} ${JSON.stringify(data)}`)
}

// --- observing a press --------------------------------------------------------

type PressEvent = 'pointerdown' | 'mousedown' | 'mouseup' | 'click'

/**
 * Records the pressed button's top at each event of the press, and counts the
 * form's submit events. Capture phase, so a listener runs before the press's
 * default action (the focus change, and with it the blur) and whatever target
 * the release ends up on.
 *
 * The top is read off the button's PARENT (the row it sits in): `Button` has
 * `active:translate-y-px`, so the button itself is 1px lower while it is held,
 * and that would read as a 1px move on every press.
 */
function watchPress(button: HTMLElement) {
  const tops: Partial<Record<PressEvent, number>> = {}
  let submits = 0
  const form = (button as HTMLButtonElement).form
  const row = button.parentElement ?? button
  const listeners = (['pointerdown', 'mousedown', 'mouseup', 'click'] as const).map((type) => {
    const listener = () => {
      tops[type] = row.getBoundingClientRect().top
    }
    document.addEventListener(type, listener, true)
    return [type, listener] as const
  })
  const onSubmit = () => {
    submits += 1
  }
  form?.addEventListener('submit', onSubmit, true)
  return {
    get submits() {
      return submits
    },
    /** top(release) - top(press); undefined for a key press. */
    get delta(): number | undefined {
      return tops.mousedown === undefined || tops.mouseup === undefined ? undefined : tops.mouseup - tops.mousedown
    },
    stop() {
      for (const [type, listener] of listeners) document.removeEventListener(type, listener, true)
      form?.removeEventListener('submit', onSubmit, true)
    },
  }
}

/** A real 250ms press-and-hold on the button, observed. */
async function press(button: HTMLElement) {
  const probe = watchPress(button)
  await userEvent.click(button, { delay: 250 })
  await settle()
  probe.stop()
  return { submits: probe.submits, delta: probe.delta }
}

// --- driving the form ---------------------------------------------------------

async function typeInto(name: string, text: string) {
  await userEvent.click(control(name))
  await userEvent.keyboard(text)
}

async function chooseStatus(value = 'open') {
  await userEvent.click(control('status'))
  await userEvent.click(await screen.findByRole('option', { name: value }))
  await waitFor(() => expect(control('status')).toHaveTextContent(value))
}

function renderForm(schema: SchemaObject, props: { initialValue?: Record<string, unknown> } = {}) {
  const onSubmit = vi.fn()
  render(<SchemaForm formMode="create" schema={schema} onSubmit={onSubmit} {...props} />)
  return onSubmit
}

beforeEach(() => {
  // The fixtures' titles and messages are not strings any real screen shows.
  disableCollector()
})

describe('B: on-blur validation works', () => {
  it('B1: leaving an empty required field shows its error', async () => {
    renderForm(SHORT)
    expectUnpinned()

    await userEvent.click(control('name'))
    await userEvent.tab()

    expect(shownError('name')).toMatch(MUST_NOT_BE_EMPTY)
    expect(control('name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('B2: after B1, typing a value and leaving clears the error', async () => {
    renderForm(SHORT)
    await userEvent.click(control('name'))
    await userEvent.tab()
    expect(shownError('name'), 'B1 precondition').toMatch(MUST_NOT_BE_EMPTY)

    await typeInto('name', 'x')
    await userEvent.tab()

    expect(errorText('name')).toBeNull()
    expect(control('name')).toHaveAttribute('aria-invalid', 'false')
  })

  it('B3: after B1, typing a value without leaving keeps the error (D1)', async () => {
    renderForm(SHORT)
    await userEvent.click(control('name'))
    await userEvent.tab()

    await typeInto('name', 'x')

    expect(document.activeElement).toBe(control('name'))
    expect(shownError('name')).toMatch(MUST_NOT_BE_EMPTY)
  })

  it('B4: after a Submit attempt the error follows every keystroke (D2)', async () => {
    // `email` holds "x" from the start, so nothing is focused when Submit is
    // pressed and the attempt itself is not what is under test here.
    renderForm(SHORT, { initialValue: { email: 'x' } })
    expectUnpinned()

    await userEvent.click(submitButton())
    await waitFor(() => expect(document.activeElement).toBe(control('code')))
    expect(errorText('email'), 'the attempt flagged the email').not.toBeNull()

    await userEvent.click(control('email'))
    await userEvent.keyboard('@a.io')
    expect(document.activeElement).toBe(control('email'))
    expect(errorText('email'), 'cleared while typing').toBeNull()

    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}')
    expect(document.activeElement).toBe(control('email'))
    expect((control('email') as HTMLInputElement).value).toBe('x')
    expect(errorText('email'), 'shown again while typing').not.toBeNull()
  })

  it('B5: the enum picker validates when focus leaves it closed, not when its list opens, and choosing clears it', async () => {
    renderForm(SHORT)

    // Tab onto the closed trigger, Tab out.
    await userEvent.click(control('email'))
    await userEvent.tab()
    expect(document.activeElement).toBe(control('status'))
    await userEvent.tab()
    expect(shownError('status'), 'error after leaving').toMatch(MUST_NOT_BE_EMPTY)

    // Open the list and choose.
    await chooseStatus('open')
    expect(errorText('status'), 'gone after choosing').toBeNull()

    // A fresh form: focus moving from the trigger into its own list is not
    // leaving the field.
    cleanup()
    renderForm(SHORT)
    await userEvent.click(control('email'))
    await userEvent.tab()
    expect(document.activeElement).toBe(control('status'))
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('option', { name: 'open' })
    await waitFor(() =>
      expect(document.activeElement?.closest('[data-slot=popover-content]'), 'focus is in the list').not.toBeNull(),
    )
    expect(errorText('status'), 'none while the list is open').toBeNull()
  })
})

describe('T: one press counts (SHORT, unpinned)', () => {
  it('T1: with focus in an empty required field, one press raises every error', async () => {
    renderForm(SHORT)
    expectUnpinned()
    const before = { code: fieldBlock('code').offsetHeight, name: fieldBlock('name').offsetHeight }

    await userEvent.click(control('code'))
    const result = await press(submitButton())

    const after = { code: fieldBlock('code').offsetHeight, name: fieldBlock('name').offsetHeight }
    const found = errors('code', 'name', 'status')
    log('T1', { ...result, errors: found })
    // Phase 1 measurement: a field's height with and without an error, with a
    // description (`code`) and without one (`name`).
    log('T1-heights', { before, after })

    expect({ ...result, errors: found }).toEqual({
      submits: 1,
      delta: NO_MOVE,
      errors: {
        code: expect.stringMatching(MUST_NOT_BE_EMPTY),
        name: expect.stringMatching(MUST_NOT_BE_EMPTY),
        status: expect.stringMatching(MUST_NOT_BE_EMPTY),
      },
    })
  })

  it('T2: an error left by leaving a field does not stop the press from checking the rest', async () => {
    renderForm(SHORT)
    expectUnpinned()

    await userEvent.click(control('name'))
    await userEvent.tab()
    await typeInto('code', 'c')
    expect(document.activeElement).toBe(control('code'))
    const result = await press(submitButton())

    const found = errors('name', 'status')
    log('T2', { ...result, errors: found })
    expect({ delta: result.delta, errors: found }).toEqual({
      delta: NO_MOVE,
      errors: { name: expect.stringMatching(MUST_NOT_BE_EMPTY), status: expect.stringMatching(MUST_NOT_BE_EMPTY) },
    })
  })

  it('T3: the error the press itself raises does not move the button', async () => {
    renderForm(SHORT)
    await typeInto('name', 'n')
    await chooseStatus()
    expectUnpinned()

    await userEvent.click(control('code'))
    const result = await press(submitButton())

    const found = errors('code')
    log('T3', { ...result, errors: found })
    expect({ ...result, errors: found }).toEqual({
      submits: 1,
      delta: NO_MOVE,
      errors: { code: expect.stringMatching(MUST_NOT_BE_EMPTY) },
    })
  })

  it('T4: the error the press itself clears does not move the button', async () => {
    const onSubmit = renderForm(SHORT)
    await typeInto('name', 'n')
    await chooseStatus()
    expectUnpinned()

    await userEvent.click(control('code'))
    await userEvent.tab()
    await typeInto('code', 'c')
    const result = await press(submitButton())

    log('T4', { ...result, onSubmitCalls: onSubmit.mock.calls.length, errors: errors('code') })
    expect({ delta: result.delta, onSubmitCalls: onSubmit.mock.calls.length }).toEqual({ delta: NO_MOVE, onSubmitCalls: 1 })
  })

  it('T4b: after an attempt, the error clears while typing, so the next press saves', async () => {
    const onSubmit = renderForm(SHORT)
    await typeInto('name', 'n')
    await chooseStatus()
    expectUnpinned()

    const first = await press(submitButton())
    await waitFor(() => expect(document.activeElement).toBe(control('code')))
    await userEvent.keyboard('c')
    const second = await press(submitButton())

    log('T4b', { first, second, onSubmitCalls: onSubmit.mock.calls.length })
    expect({ delta: second.delta, onSubmitCalls: onSubmit.mock.calls.length }).toEqual({ delta: NO_MOVE, onSubmitCalls: 1 })
  })

  it('T5: an error that wraps does not move the button', async () => {
    renderForm(SHORT)
    await typeInto('code', 'c')
    await typeInto('name', 'n')
    await chooseStatus()
    expectUnpinned()

    await typeInto('email', 'x')
    const result = await press(submitButton())

    const error = document.getElementById('email-error')
    const lineHeight = error ? parseFloat(getComputedStyle(error).lineHeight) : undefined
    const wrap = error && lineHeight
      ? { height: error.offsetHeight, lineHeight, lines: Math.round(error.offsetHeight / lineHeight), cellWidth: cell('email').offsetWidth }
      : null
    const found = errors('email')
    log('T5', { ...result, errors: found, wrap })

    expect(wrap?.lines, 'precondition: the email error wraps').toBeGreaterThan(1)
    expect({ ...result, errors: found }).toEqual({ submits: 1, delta: NO_MOVE, errors: { email: expect.any(String) } })
  })

  it('T6: pressing Submit with a picker list open raises every error', async () => {
    renderForm(SHORT)
    expectUnpinned()
    await typeInto('code', 'c')

    await userEvent.click(control('status'))
    await screen.findByRole('option', { name: 'open' })
    const result = await press(submitButton())

    const found = errors('name', 'status')
    log('T6', { ...result, errors: found })
    expect(found).toEqual({ name: expect.stringMatching(MUST_NOT_BE_EMPTY), status: expect.stringMatching(MUST_NOT_BE_EMPTY) })
  })

  it('T7: pressing Submit with focus on the closed picker raises every error', async () => {
    renderForm(SHORT)
    expectUnpinned()
    await typeInto('code', 'c')

    // focus(), not Tab: tabbing would leave a blur error on `name` and hide C1.
    control('status').focus()
    expect(document.activeElement).toBe(control('status'))
    const result = await press(submitButton())

    const found = errors('name', 'status')
    log('T7', { ...result, errors: found })
    expect(found).toEqual({ name: expect.stringMatching(MUST_NOT_BE_EMPTY), status: expect.stringMatching(MUST_NOT_BE_EMPTY) })
  })

  describe('T11: a key press raises every error', () => {
    it('Enter on Submit', async () => {
      renderForm(SHORT)
      expectUnpinned()
      await userEvent.click(control('name'))
      await userEvent.tab()
      await userEvent.tab()
      await userEvent.tab()
      expect(document.activeElement).toBe(submitButton())

      const probe = watchPress(submitButton())
      await userEvent.keyboard('{Enter}')
      await settle()
      probe.stop()

      const found = errors('name', 'code', 'status')
      log('T11-enter', { submits: probe.submits, errors: found })
      expect(found).toEqual({
        name: expect.stringMatching(MUST_NOT_BE_EMPTY),
        code: expect.stringMatching(MUST_NOT_BE_EMPTY),
        status: expect.stringMatching(MUST_NOT_BE_EMPTY),
      })
    })

    it('Space on Submit', async () => {
      renderForm(SHORT)
      expectUnpinned()
      await userEvent.click(control('name'))
      await userEvent.tab()
      await userEvent.tab()
      await userEvent.tab()
      expect(document.activeElement).toBe(submitButton())

      const probe = watchPress(submitButton())
      await userEvent.keyboard('{Space}')
      await settle()
      probe.stop()

      const found = errors('name', 'code', 'status')
      log('T11-space', { submits: probe.submits, errors: found })
      expect(found).toEqual({
        name: expect.stringMatching(MUST_NOT_BE_EMPTY),
        code: expect.stringMatching(MUST_NOT_BE_EMPTY),
        status: expect.stringMatching(MUST_NOT_BE_EMPTY),
      })
    })

    it('Enter inside email', async () => {
      renderForm(SHORT)
      expectUnpinned()
      await userEvent.click(control('name'))
      await userEvent.tab()
      expect(document.activeElement).toBe(control('email'))

      const probe = watchPress(submitButton())
      await userEvent.keyboard('{Enter}')
      await settle()
      probe.stop()

      const found = errors('name', 'code', 'status')
      log('T11-enter-email', { submits: probe.submits, errors: found })
      expect(found).toEqual({
        name: expect.stringMatching(MUST_NOT_BE_EMPTY),
        code: expect.stringMatching(MUST_NOT_BE_EMPTY),
        status: expect.stringMatching(MUST_NOT_BE_EMPTY),
      })
    })
  })
})

describe('T9: an error on a field a rule then hid (HIDE)', () => {
  it('does not block the press', async () => {
    const onSubmit = renderForm(HIDE, { initialValue: { code: 'ab' } })
    expectUnpinned()

    // Raise the error by leaving the field: `ab` fails its pattern.
    await userEvent.click(control('code'))
    await userEvent.tab()
    const raised = errorText('code')

    // The rule takes the field off the form.
    await typeInto('kind', 'none')
    expect(document.getElementById('code')).toBeNull()

    const result = await press(submitButton())
    log('T9', { raised, ...result, onSubmitCalls: onSubmit.mock.calls.length })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({ kind: 'none' })
  })
})

describe('T9b: an error on a field a rule then made readonly (it stays on the form)', () => {
  /**
   * `ref` is required until `kind` is "locked", then readonly. Rendered as an
   * EDIT form: a create form does not draw a readonly field, so only an edit
   * form keeps `ref` mounted after the rule. A readonly field has no validator
   * (SchemaForm's `shouldValidate`) and is not required, so the save is valid.
   */
  const READONLY: SchemaObject = {
    type: 'object',
    properties: {
      kind: { type: 'string', format: 'text', title: 'Kind' },
      ref: {
        type: 'string', format: 'text', title: 'Ref', inputMode: 'required',
        input_type_rule: { if: [{ '==': [{ var: 'kind' }, 'locked'] }, 'readonly', 'required'] },
      },
    },
  }

  it('does not block the press', async () => {
    const onSubmit = vi.fn()
    render(<SchemaForm formMode="edit" schema={READONLY} onSubmit={onSubmit} />)
    expectUnpinned()

    // Tab past the empty required field.
    await userEvent.click(control('ref'))
    await userEvent.tab()
    const raised = errorText('ref')

    // The rule makes it readonly; it stays on the form.
    await typeInto('kind', 'locked')
    const afterRule = {
      inDom: document.getElementById('ref') !== null,
      readonly: (document.getElementById('ref') as HTMLInputElement | null)?.disabled ?? null,
      error: errorText('ref'),
    }

    const result = await press(submitButton())
    log('T9b', { raised, afterRule, ...result, onSubmitCalls: onSubmit.mock.calls.length, errors: errors('ref', 'kind') })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe('T24: once pinned, the bar stays pinned while errors go away (EDGE, D6)', () => {
  /**
   * EDGE: required full-row fields with a description line, as many as fit the
   * 800px window without errors. Each error adds a line under its description,
   * so with every field in error the form is taller than the window. Tuned by
   * measurement: the precondition is logged.
   */
  const EDGE_FIELDS = 7
  const EDGE: SchemaObject = {
    type: 'object',
    properties: Object.fromEntries(
      Array.from({ length: EDGE_FIELDS }, (_, i) => [
        `edge_${i + 1}`,
        {
          type: 'string', format: 'text', title: `Edge ${i + 1}`, inputMode: 'required',
          description: `Help for edge ${i + 1}`, width: 'w',
        },
      ]),
    ),
  }
  const names = Array.from({ length: EDGE_FIELDS }, (_, i) => `edge_${i + 1}`)

  it('keeps its bottom at the window bottom and never moves up', async () => {
    renderForm(EDGE)
    const withoutErrors = layout()
    log('T24-precondition', { fieldCount: EDGE_FIELDS, ...withoutErrors, fits: withoutErrors.scrollHeight <= withoutErrors.innerHeight })

    // Every required field empty: the errors appear and the form overflows.
    await userEvent.click(submitButton())
    await waitFor(() => expect(names.every((name) => errorText(name))).toBe(true))
    await settle()
    const withErrors = layout()
    log('T24-with-errors', withErrors)
    expectPinned()

    window.scrollTo({ top: 0, behavior: 'instant' })
    const tops: number[] = [bar().getBoundingClientRect().top]
    for (const name of names) {
      await typeInto(name, 'x')
      tops.push(bar().getBoundingClientRect().top)
    }
    const afterFixes = layout()
    log('T24-fixes', { tops, ...afterFixes, errorsLeft: names.filter((name) => errorText(name)) })

    for (let i = 1; i < tops.length; i++) {
      expect(tops[i], `bar top after fixing ${names[i - 1]} must not move up`).toBeGreaterThan(tops[i - 1] - 1)
    }
    expect(Math.abs(afterFixes.barBottom - afterFixes.innerHeight), 'bar bottom at the window bottom').toBeLessThanOrEqual(1)
  })
})

describe('T14: one press brings the first invalid field into view (LONG, pinned)', () => {
  /** Fully inside the window and above the pinned bar. */
  function visibility(name: string) {
    const c = cell(name).getBoundingClientRect()
    const b = bar().getBoundingClientRect()
    return { top: c.top, bottom: c.bottom, barTop: b.top, focused: document.activeElement === control(name) }
  }

  it('from the bottom, the first invalid field above the view', async () => {
    renderForm(LONG)
    expectPinned()

    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    const result = await press(submitButton())

    let seen = visibility('name')
    try {
      await waitFor(() => {
        seen = visibility('name')
        expect(seen.focused).toBe(true)
        expect(seen.top).toBeGreaterThanOrEqual(0)
        expect(seen.bottom).toBeLessThanOrEqual(seen.barTop)
      })
    } finally {
      log('T14-V-bottom', { ...result, errors: errors('name', 'tail'), seen })
    }
  })

  it('from the top, with only the last field invalid', async () => {
    renderForm(LONG)
    await typeInto('name', 'n')
    window.scrollTo({ top: 0, behavior: 'instant' })
    expectPinned()

    const result = await press(submitButton())

    let seen = visibility('tail')
    try {
      await waitFor(() => {
        seen = visibility('tail')
        expect(seen.focused).toBe(true)
        expect(seen.top).toBeGreaterThanOrEqual(0)
        expect(seen.bottom).toBeLessThanOrEqual(seen.barTop)
      })
    } finally {
      log('T14-V-top', { ...result, errors: errors('name', 'tail'), seen })
    }
  })
})
