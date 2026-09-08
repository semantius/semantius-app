/**
 * One renderer for every error the app can show.
 *
 * Three origins reach a screen, and this is the one place that tells them
 * apart:
 *
 *   an app error       thrown by `appError()` — an ICU template plus values,
 *                      keyed by its own English, rendered through the caller's `t`
 *   a platform error   a PostgREST body whose `hint` carried the envelope — a
 *                      `${…}` template converted to ICU, keyed by its code,
 *                      the English in the response as the fallback
 *   a plain error      PostgreSQL's or PostgREST's own sentence — verbatim,
 *                      never ICU-compiled, keyed by its SQLSTATE plus the
 *                      constraint name where one can be parsed, and by the
 *                      sentence itself where there is no code at all
 *
 * The parsing is `src/i18n/errors.ts`; this module only decides which lookup
 * each origin takes and puts the pieces together. It used to build its sentence
 * out of English morphology — `singularize()`, `capitalize()`, two halves
 * concatenated — which no other language can be given; the labels are inserted
 * into ONE ICU message exactly as the model and the database spell them.
 *
 * `t` is a parameter rather than an import, because this is called from a
 * component's render and the translation has to follow a language change.
 * `translate()` would read the current catalog too, but a component that cannot
 * re-render (three of the grid's are `React.memo`) would keep the old language
 * on screen — so the rule is that a component passes its own `t` down, and
 * ESLint bans the import under `components/**`.
 */

import {
  fillPlaceholders,
  foreignKeyTables,
  parseServerError,
  translateVerbatim,
  currentMessages,
  type MessageValues,
  type TranslateFn,
} from '@/i18n'
import { isAppError } from './appError'

/**
 * The PostgREST error code an error carries, or undefined.
 *
 * Every thrower in the data layer puts the server's own body on `error.cause`
 * alongside the status (`useTable`, `callRpc`, the three mutations), so this is
 * where a `code` lives when there is one.
 */
export function codeOf(error: unknown): string | undefined {
  const cause = causeOf(error)
  const code = cause?.code
  return typeof code === 'string' ? code : undefined
}

function causeOf(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof Error)) return undefined
  const cause = error.cause
  return cause && typeof cause === 'object' && !Array.isArray(cause) ? (cause as Record<string, unknown>) : undefined
}

export interface RenderedError {
  message: string
  /** How to fix it, when the error said. */
  hint?: string
  /** Plain text for a Details panel. Never translated. */
  details?: string
}

export interface RenderErrorOptions {
  /**
   * The model's own singular label for the record a failed delete was about
   * ("Region"), used as given in the foreign-key sentence. Falls back to the
   * table name in the error.
   */
  label?: string
}

/**
 * The user-facing text for any error.
 *
 * @param error - whatever was thrown or returned
 * @param t - the caller's translate function (`useT()`)
 */
export function renderError(error: unknown, t: TranslateFn, options: RenderErrorOptions = {}): RenderedError {
  if (isAppError(error)) {
    const { message, hint, values, details } = error.envelope
    return {
      message: t(message, fillPlaceholders(message, values ?? {})),
      hint: hint ? t(hint, fillPlaceholders(hint, values ?? {})) : undefined,
      details,
    }
  }

  const cause = causeOf(error)
  // `details` is shown whatever else the cause carries — a body with a trace
  // and no message is still a body with a trace.
  const detailText = cause?.detail ?? cause?.details
  const details = typeof detailText === 'string' && detailText ? detailText : undefined
  const body = cause && typeof cause.message === 'string' ? cause : undefined
  const parsed = body ? parseServerError(body) : null
  if (parsed) {
    if (parsed.structured) {
      // The English templates in the response are the fallbacks when no
      // translation exists — the same relationship a keyed message has between
      // its id and its `defaultMessage`, which is what makes an untranslated
      // error render at all.
      const values = fillPlaceholders(parsed.message, parsed.values)
      const message = parsed.keyedByMessage
        ? t(parsed.message, values)
        : t({ id: parsed.keySegments, defaultMessage: parsed.message }, values)
      const hint = parsed.hint
        ? parsed.keyedByMessage
          ? t(parsed.hint, fillPlaceholders(parsed.hint, parsed.values))
          : t({ id: [...parsed.keySegments, 'hint'], defaultMessage: parsed.hint }, fillPlaceholders(parsed.hint, parsed.values))
        : undefined
      return { message, hint, details }
    }
    // A plain sentence, looked up verbatim under its key. A tenant's own
    // translation of that key wins over the app's foreign-key sentence below.
    if (currentMessages()[parsed.key]) {
      return { message: translateVerbatim(parsed.key, parsed.message), hint: parsed.hint, details }
    }
    const foreignKey = parsed.code === '23503' ? foreignKeyTables(parsed.message) : undefined
    if (foreignKey) {
      // The referencing table's name as the database spells it. There is no
      // model label for it here — the error names a table, not an entity — and
      // inventing one by un-pluralizing the identifier is exactly what this
      // module stopped doing.
      const values: MessageValues = { label: options.label || foreignKey.table, table: foreignKey.referencing }
      return { message: t('{label} is still used by records in {table} and cannot be deleted.', values), details }
    }
    return { message: translateVerbatim(parsed.key, parsed.message), hint: parsed.hint, details }
  }

  // No body at all: a network failure, a thrown string, an error the app made
  // without an envelope. Its message is shown as it is.
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return { message: message || t('An unexpected error occurred. Please try again.'), details }
}
