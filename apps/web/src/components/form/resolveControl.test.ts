import { describe, it, expect } from 'vitest'
import formats from 'sem-schema/formats.json'
import { assertSupportedFormats, isSyntheticProperty, resolveControl } from './resolveControl'
import { controls } from './controls'

describe('resolveControl', () => {
  it('answers the registry entry for every catalog format', () => {
    for (const format of Object.keys(formats)) {
      expect(resolveControl({ format }), format).toBe(controls[format as keyof typeof controls])
    }
  })

  it.each([undefined, '', 'markdown', 'Text', 'toString', 'constructor', 42, null])(
    'does not resolve %p',
    (format) => {
      expect(resolveControl({ format })).toBeUndefined()
    },
  )

  it('skips the synthetic label companions', () => {
    expect(isSyntheticProperty({ ctype: '_label' })).toBe(true)
    expect(isSyntheticProperty({ ctype: 'fk_label' })).toBe(true)
    expect(isSyntheticProperty({ ctype: 'label' })).toBe(false)
    expect(isSyntheticProperty({})).toBe(false)
  })
})

describe('assertSupportedFormats', () => {
  const ok = { properties: { name: { type: 'string', format: 'text' } } }

  it('accepts a schema whose every property resolves', () => {
    expect(() => assertSupportedFormats(ok)).not.toThrow()
  })

  it('accepts an empty schema', () => {
    expect(() => assertSupportedFormats({})).not.toThrow()
  })

  it('names the field and its label when a format is missing', () => {
    let thrown: Error | undefined
    try {
      assertSupportedFormats({ properties: { ship_via: { type: 'integer', title: 'Shipper' } } })
    } catch (err) {
      thrown = err as Error
    }
    // The message is the untranslated ICU template; the values ride on `cause`.
    expect(thrown?.message).toBe('{label} ({field}) has no format.')
    expect((thrown?.cause as Record<string, unknown>)?.values).toEqual({
      label: 'Shipper',
      field: 'ship_via',
    })
  })

  it('names the unsupported format when there is one', () => {
    let thrown: Error | undefined
    try {
      assertSupportedFormats({ properties: { notes: { type: 'string', format: 'markdown' } } })
    } catch (err) {
      thrown = err as Error
    }
    expect(thrown?.message).toBe(
      '{label} ({field}) has the format "{format}", which is not supported.',
    )
    expect((thrown?.cause as Record<string, unknown>)?.values).toMatchObject({
      field: 'notes',
      format: 'markdown',
    })
  })

  it('falls back to the field name when the property has no title', () => {
    try {
      assertSupportedFormats({ properties: { ship_via: {} } })
    } catch (err) {
      expect((err as Error).cause).toMatchObject({ values: { label: 'ship_via' } })
    }
  })

  it('lists every offender in details, not only the one it names', () => {
    try {
      assertSupportedFormats({
        properties: {
          ok_field: { type: 'string', format: 'text' },
          missing: { type: 'string' },
          unknown: { type: 'string', format: 'markdown' },
        },
      })
    } catch (err) {
      const details = (err as Error).cause as { details?: string }
      expect(details.details).toBe('missing: \nunknown: markdown')
      expect(details.details).not.toContain('ok_field')
    }
  })

  it('checks hidden and readonly fields too', () => {
    // A hidden field is still submitted and a readonly one is still rendered, so
    // neither is exempt from having a control.
    for (const inputMode of ['hidden', 'readonly', 'disabled']) {
      expect(() =>
        assertSupportedFormats({ properties: { x: { type: 'string', inputMode } } }),
      ).toThrow()
    }
  })

  it('does not throw for a synthetic label companion without a format', () => {
    expect(() =>
      assertSupportedFormats({ properties: { _label: { type: 'string', ctype: '_label' } } }),
    ).not.toThrow()
  })
})
