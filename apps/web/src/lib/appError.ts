/**
 * How the app's own code throws a user-facing error.
 *
 * A plain function, a real `Error`, and no translation performed. The
 * template and its values travel on the error and rendering happens at
 * DISPLAY time, through the caller's `t` (`renderError` in ./apiErrors.ts).
 * That is what lets a language switch re-render an error that is already on
 * screen, and it is what makes these throws possible at all from the places
 * they happen — `queryFn`s, route loaders, the userinfo effect, event handlers
 * — none of which can call a hook.
 *
 *   throw appError({ message: 'Authentication token is required' })
 *   throw appError({ message: '{field} is required for update', values: { field: idField } })
 *   throw appError(
 *     { message: 'Failed to fetch {table} ({status})', values: { table, status: response.status } },
 *     { ...body, status: response.status, url: response.url },
 *   )
 *
 * `error.message` is the TEMPLATE, uninterpolated — the same rule the
 * platform's own wire format follows, and the same trade: devtools and logs
 * show `{field}` literally, the values sit on `cause`, rendering happens only
 * at display time. Templates are plain ICU: `${…}` is a PostgREST transport
 * convention and does not appear in app code.
 *
 * Developer invariants ("useAuth must be used within AuthProviderWrapper")
 * stay plain `throw new Error`: they are not user text, they carry no values,
 * and giving them this shape would put machinery into the catalog.
 */

import type { MessageValues } from '@/i18n'

export interface ErrorEnvelope {
  /** An ICU template — this IS the translation key. */
  message: string
  /** An ICU template saying how to fix it; its own key. */
  hint?: string
  values?: MessageValues
  /** Plain text for the Details panel. Never translated. */
  details?: string
}

/**
 * The error `appError()` throws. A subclass so the renderer can tell an app
 * envelope from a server body without guessing from the fields they share.
 */
export class AppError extends Error {
  readonly envelope: ErrorEnvelope

  constructor(envelope: ErrorEnvelope, cause?: Record<string, unknown>) {
    // The envelope's own fields ride on `cause` beside the transport facts, so
    // `statusOf`, `codeOf` and the Details panel keep reading one object.
    super(envelope.message, {
      cause: {
        ...cause,
        ...(envelope.values ? { values: envelope.values } : {}),
        ...(envelope.hint ? { hint: envelope.hint } : {}),
        ...(envelope.details ? { details: envelope.details } : {}),
      },
    })
    this.envelope = envelope
  }
}

/** Package a user-facing error. `cause` carries the transport facts — status, url, the server's body. */
export function appError(envelope: ErrorEnvelope, cause?: Record<string, unknown>): Error {
  return new AppError(envelope, cause)
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
