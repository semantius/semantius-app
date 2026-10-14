import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Slider } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_HSVA,
  clamp,
  cssColorForSwatch,
  formatHex,
  formatHsl,
  formatRgb,
  hsvToRgb,
  parseCssColor,
  type Hsva,
} from '@/lib/css-color'

const HUE_GRADIENT =
  'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'

const CHECKER: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #c4c4c4 25%, transparent 25%), linear-gradient(-45deg, #c4c4c4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #c4c4c4 75%), linear-gradient(-45deg, transparent 75%, #c4c4c4 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

export interface ColorPickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
}

export function ColorSwatch({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  const painted = cssColorForSwatch(color)
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative size-4 shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground/15',
        className,
      )}
      style={CHECKER}
    >
      <span className="absolute inset-0" style={{ backgroundColor: painted }} />
    </span>
  )
}

function formatFor(format: ColorFormat, color: Hsva): string {
  if (format === 'rgb') return formatRgb(color)
  if (format === 'hsl') return formatHsl(color)
  return formatHex(color)
}

/**
 * Saturation/brightness area, hue and opacity sliders, and a hex/rgb/hsl field.
 *
 * Built on Base UI Slider. The form control mounts this inside a Popover
 * anchored to the field so it sits below the input like the other pickers.
 * Layout follows `@reui/c-color-picker-4` as a sample; there is no ReUI
 * dependency.
 */
export function ColorPicker({ id, value, onChange }: ColorPickerProps) {
  const t = useT()
  const [format, setFormat] = useState<ColorFormat>('hex')
  const [color, setColor] = useState<Hsva>(() => parseCssColor(value) ?? DEFAULT_HSVA)
  const [draft, setDraft] = useState(() => formatFor('hex', color))

  useEffect(() => {
    const parsed = parseCssColor(value)
    if (!parsed) return
    setColor((prev) => ({
      ...parsed,
      h: parsed.s === 0 ? prev.h : parsed.h,
    }))
  }, [value])

  useEffect(() => {
    setDraft(formatFor(format, color))
  }, [format, color])

  const rgb = hsvToRgb(color.h, color.s, color.v)
  const css = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${color.a})`
  const opaque = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

  const commit = (next: Hsva) => {
    setColor(next)
    onChange(formatHex(next))
  }

  const commitDraft = () => {
    const parsed = parseCssColor(draft)
    if (!parsed) {
      setDraft(formatFor(format, color))
      return
    }
    commit(parsed)
  }

  return (
    <div id={id} className="flex w-72 flex-col gap-3 p-3">
      <ColorArea color={color} css={opaque} onChange={commit} label={t('Color')} />
      <ColorSlider
        label={t('Hue')}
        max={360}
        value={color.h}
        onValueChange={(h) => commit({ ...color, h })}
        trackStyle={{ background: HUE_GRADIENT }}
        thumbColor={`hsl(${color.h} 100% 50%)`}
      />
      <ColorSlider
        label={t('Opacity')}
        max={100}
        value={Math.round(color.a * 100)}
        onValueChange={(percent) => commit({ ...color, a: percent / 100 })}
        trackStyle={{ background: `linear-gradient(to right, transparent, ${opaque})` }}
        trackUnderlay
        thumbColor={css}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1" aria-label={t('Color format')} role="group">
          {(['hex', 'rgb', 'hsl'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                'h-7 rounded-xl px-2 text-xs font-medium uppercase',
                format === item
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              aria-pressed={format === item}
              onClick={() => setFormat(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <Input
          aria-label={format === 'hex' ? t('Hex') : format === 'rgb' ? 'RGB' : 'HSL'}
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDraft()
            }
          }}
        />
      </div>
    </div>
  )
}

function ColorArea({
  color,
  css,
  onChange,
  label,
}: {
  color: Hsva
  css: string
  onChange: (next: Hsva) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const setFromPoint = (clientX: number, clientY: number) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
    const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100)
    onChange({ ...color, s, v })
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(color.s)}
      aria-valuetext={`${Math.round(color.s)}%, ${Math.round(color.v)}%`}
      className="relative h-36 w-full cursor-crosshair rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${color.h} 100% 50%))`,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setFromPoint(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        setFromPoint(event.clientX, event.clientY)
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 10 : 1
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onChange({ ...color, s: clamp(color.s - step, 0, 100) })
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          onChange({ ...color, s: clamp(color.s + step, 0, 100) })
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          onChange({ ...color, v: clamp(color.v - step, 0, 100) })
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          onChange({ ...color, v: clamp(color.v + step, 0, 100) })
        }
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ring-1 ring-black/20"
        style={{
          left: `${color.s}%`,
          top: `${100 - color.v}%`,
          backgroundColor: css,
        }}
      />
    </div>
  )
}

function ColorSlider({
  label,
  max,
  value,
  onValueChange,
  trackStyle,
  thumbColor,
  trackUnderlay = false,
}: {
  label: string
  max: number
  value: number
  onValueChange: (value: number) => void
  trackStyle: CSSProperties
  thumbColor: string
  trackUnderlay?: boolean
}) {
  return (
    <Slider.Root
      value={value}
      min={0}
      max={max}
      step={1}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? next[0] : next)}
    >
      <Slider.Control className="relative flex h-4 w-full touch-none items-center select-none">
        <Slider.Track className="relative h-3 w-full grow overflow-hidden rounded-full ring-1 ring-foreground/10">
          {trackUnderlay ? <span aria-hidden="true" className="absolute inset-0" style={CHECKER} /> : null}
          <span aria-hidden="true" className="absolute inset-0" style={trackStyle} />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          className="size-4 rounded-full border-2 border-white shadow-sm ring-1 ring-black/20 select-none"
          style={{ backgroundColor: thumbColor }}
        />
      </Slider.Control>
    </Slider.Root>
  )
}
