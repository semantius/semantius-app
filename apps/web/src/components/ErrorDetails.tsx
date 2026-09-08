import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ERROR_TEXT_FIELDS, useT } from '@/i18n'

/**
 * The "Details" toggle every caught error carries: the error's stack, the
 * plain text a server sent as `details`, and whatever else rode on `cause`
 * (a status, a url, a PostgREST code), behind one button.
 *
 * One component for every error surface — the route error page, the data
 * error card, the table boundary, the app boundary — so a caught error is
 * never shown without a way to see what actually happened. The stack is text,
 * rendered as text: a multi-line trace inside `JSON.stringify` arrives on one
 * line with literal `\n`, which is what the old Details panel did.
 */
export interface ErrorDetailsProps {
  error: unknown
  /** Plain text the error carried — a server's `details`. Shown first. */
  text?: string
  className?: string
}

const SHOWN_AS_TEXT = new Set(ERROR_TEXT_FIELDS)

/** The fields on `error.cause` (or on a plain error object) that the toggle dumps as JSON. */
export function causeFields(error: unknown): Record<string, unknown> {
  const source =
    error instanceof Error
      ? error.cause && typeof error.cause === 'object' && !Array.isArray(error.cause)
        ? (error.cause as Record<string, unknown>)
        : undefined
      : error && typeof error === 'object' && !Array.isArray(error)
        ? (error as Record<string, unknown>)
        : undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source ?? {})) {
    if (!SHOWN_AS_TEXT.has(key) && value !== undefined) out[key] = value
  }
  return out
}

export function ErrorDetails({ error, text, className }: ErrorDetailsProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const fields = causeFields(error)
  const stack = error instanceof Error && error.stack ? error.stack : undefined
  const parts = [
    text,
    Object.keys(fields).length > 0 ? JSON.stringify(fields, null, 2) : undefined,
    stack,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return null

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="h-auto py-1 px-2 -ml-2 text-xs text-foreground hover:underline"
      >
        {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        {t('Details')}
      </Button>
      {expanded && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 border border-border">
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-words">{parts.join('\n\n')}</pre>
        </div>
      )}
    </div>
  )
}
