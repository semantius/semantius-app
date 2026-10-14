import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HSVA,
  contrastForeground,
  cssColorForSwatch,
  enumBadgeColors,
  formatHex,
  formatHsl,
  formatRgb,
  hsvToRgb,
  parseCssColor,
  rgbToHex,
  rgbToHsv,
} from './css-color'

describe('css-color', () => {
  it('round-trips hex through HSV', () => {
    const parsed = parseCssColor('#3b82f6')
    expect(parsed).not.toBeNull()
    expect(formatHex(parsed!)).toBe('#3b82f6')
  })

  it('reads shorthand hex and 8-digit hex with alpha', () => {
    expect(formatHex(parseCssColor('#f00')!)).toBe('#ff0000')
    expect(formatHex(parseCssColor('#00ff0080')!)).toBe('#00ff0080')
  })

  it('reads rgb() and hsl() in modern and legacy syntax', () => {
    expect(formatHex(parseCssColor('rgb(255, 0, 0)')!)).toBe('#ff0000')
    expect(formatHex(parseCssColor('rgb(0 128 0 / 1)')!)).toBe('#008000')
    expect(formatHex(parseCssColor('hsl(240 100% 50%)')!)).toBe('#0000ff')
    expect(formatHex(parseCssColor('hsla(120, 100%, 50%, 0.5)')!)).toBe('#00ff0080')
  })

  it('reads HTML named colors and transparent', () => {
    expect(formatHex(parseCssColor('red')!)).toBe('#ff0000')
    expect(formatHex(parseCssColor('Navy')!)).toBe('#000080')
    expect(formatHex(parseCssColor('transparent')!)).toBe('#00000000')
  })

  it('rejects empty and unknown text rather than inventing black', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor('   ')).toBeNull()
    expect(parseCssColor('not-a-color')).toBeNull()
    expect(cssColorForSwatch('')).toBe('transparent')
    expect(cssColorForSwatch('not-a-color')).toBe('transparent')
    expect(cssColorForSwatch('#00f')).toBe('#00f')
  })

  it('omits alpha from hex, rgb and hsl when the color is opaque', () => {
    const red = parseCssColor('#ff0000')!
    expect(formatHex(red)).toBe('#ff0000')
    expect(formatRgb(red)).toBe('rgb(255 0 0)')
    expect(formatHsl(red)).toMatch(/^hsl\(/)
    expect(formatHsl(red)).not.toContain('/')
  })

  it('keeps hue when converting a gray so the slider does not jump', () => {
    const { r, g, b } = hsvToRgb(210, 0, 50)
    const hsv = rgbToHsv(r, g, b)
    expect(hsv.s).toBe(0)
    expect(hsv.h).toBe(0)
  })

  it('writes 8-digit hex from rgb with alpha', () => {
    expect(rgbToHex(0, 0, 255, 0.5)).toBe('#0000ff80')
  })

  it('starts an empty picker on a saturated blue, not black', () => {
    expect(formatHex(DEFAULT_HSVA)).toBe('#0080ff')
  })

  it('picks dark text on a light enum color and white on a dark one', () => {
    expect(contrastForeground('#FDBA74')).toBe('#111827')
    expect(contrastForeground('#86EFAC')).toBe('#111827')
    expect(contrastForeground('#111827')).toBe('#ffffff')
    expect(contrastForeground('navy')).toBe('#ffffff')
    expect(contrastForeground('not-a-color')).toBeUndefined()
  })

  it('paints enum badge colors only when the string is a real CSS color', () => {
    expect(enumBadgeColors('#FDBA74')).toEqual({
      backgroundColor: '#FDBA74',
      color: '#111827',
      borderColor: 'transparent',
    })
    expect(enumBadgeColors('amber')).toBeUndefined()
    expect(enumBadgeColors(undefined)).toBeUndefined()
    expect(enumBadgeColors('')).toBeUndefined()
  })
})
