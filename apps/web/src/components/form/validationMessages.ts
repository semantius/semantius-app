import type { ErrorObject } from 'ajv'
import localizers from 'ajv-i18n'
import type { TranslateFn } from '@/i18n'

/**
 * Translate the Ajv errors `validateData()` hands back.
 *
 * Ajv writes its messages in English inside the validator ("must be string",
 * "must NOT have fewer than 3 characters"), and `sem-schema` returns them raw —
 * so the form's field errors were the one part of a translated form that stayed
 * English. `ajv-i18n` (MIT, 23 languages) is the vocabulary for that, and it is
 * applied HERE rather than in `sem-schema`: the package is a pure validator with
 * no locale of its own, and the language is a property of the session.
 *
 * Two things about `ajv-i18n` decide the shape of this module:
 *
 *  - It is keyed by LANGUAGE SUBTAG (`de`), not by the catalog language
 *    (`de-DE`), and a language it does not ship falls back to English rather
 *    than to nothing. `pt-BR` is the one entry that is a full tag, so the full
 *    tag is tried first.
 *  - **It rewrites every error it does not recognize.** Its `switch` ends in a
 *    `default` branch that replaces the message with 'muss die Validierung
 *    "<keyword>" bestehen'. Our two custom keywords — sem-schema's `inputMode`
 *    and `precision` — are exactly that case, so their messages have to be
 *    written AFTER the localizer has run, never before.
 *
 * It mutates the array in place, which is Ajv's own convention for a localizer.
 */
export function localizeValidationErrors(
  errors: ErrorObject[] | null | undefined,
  language: string,
  t: TranslateFn,
): void {
  if (!errors || errors.length === 0) return

  localizerFor(language)?.(errors)

  for (const error of errors) {
    const custom = customKeywordMessage(error, t)
    if (custom !== undefined) error.message = custom
  }
}

type Localize = (errors?: null | ErrorObject[]) => void

/**
 * The localizer for a catalog language, or `undefined` when there is nothing to
 * do. Full tag first (`pt-BR` is the one entry shipped that way), then the
 * subtag (`de-DE` → `de`).
 *
 * English is deliberately NOT localized: Ajv already wrote English, and
 * `ajv-i18n`'s own English differs from it in small ways (it drops the quotes
 * around a required property's name), so running it would be a wording change
 * with no translation in it. A language `ajv-i18n` does not ship falls through
 * to the same place — the English Ajv produced — which is the documented
 * fallback.
 */
function localizerFor(language: string): Localize | undefined {
  const subtag = language.split('-')[0]
  if (subtag === 'en') return undefined
  const table = localizers as unknown as Record<string, Localize | undefined>
  return table[language] ?? table[subtag]
}

/**
 * The messages for sem-schema's own keywords, which Ajv never wrote and
 * `ajv-i18n` therefore cannot translate.
 *
 * `inputMode: 'required'` raises two distinct errors — a null/undefined value
 * and an empty string — that mean one thing to the person filling in the form,
 * so they get one message. `precision` raises one error about the DATA (too
 * many decimals) and one about the SCHEMA (a precision outside 0-4); they are
 * told apart by `params.actual`, which only the data error carries.
 */
function customKeywordMessage(error: ErrorObject, t: TranslateFn): string | undefined {
  const params = (error.params ?? {}) as Record<string, unknown>

  if (error.keyword === 'inputMode') {
    return t('must not be empty')
  }

  if (error.keyword === 'precision') {
    if (typeof params.actual === 'number' && typeof params.precision === 'number') {
      return t('must have at most {count, plural, one {# decimal place} other {# decimal places}}', {
        count: params.precision,
      })
    }
    return t('has an invalid precision setting')
  }

  return undefined
}
