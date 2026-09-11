import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { useForm } from '@tanstack/react-form'
import { I18nProvider } from '@lingui/react'
import type { SchemaObject } from 'ajv'
import { i18n } from '@/i18n'
import { FormProvider, type FormContextValue } from '../FormContext'

/**
 * The one harness every form-control test renders through.
 *
 * A control never renders on its own: `SchemaForm` mounts it under a
 * `FormProvider` carrying a TanStack Form instance, the schema and the form
 * mode. This builds that same context from the same pieces — a real `useForm`,
 * the real provider — so a test exercises the control exactly as the app does.
 * Nothing here stands in for app code.
 *
 * It replaces the 26 near-identical `TestWrapper`s that used to open every
 * file in this folder. They had drifted from one another, and most of them
 * accepted a `validatorFn` for the context's `validateField` — a value no
 * control has ever read. The validation a control shows comes from its own
 * `validators` prop (which is what SchemaForm passes it), so that knob was
 * inert and is not carried forward: an option nothing consults invites the
 * next test to rely on it.
 */
export interface HarnessOptions {
  /** Initial form values, keyed by field name. Absent fields start undefined. */
  defaultValues?: Record<string, unknown>
  /**
   * Property schemas keyed by field name, as SchemaForm receives them. No
   * control reads the schema off the context today (each gets its own property
   * schema as a prop), but SchemaForm does put the full schema there, so a
   * control that starts to would be tested against the real shape here.
   */
  properties?: Record<string, Record<string, unknown>>
  formMode?: FormContextValue['formMode']
}

export function FormHarness({
  children,
  defaultValues = {},
  properties = {},
  formMode,
}: HarnessOptions & { children: ReactNode }) {
  const form = useForm({ defaultValues, onSubmit: async () => {} })
  const schema: SchemaObject = { type: 'object', properties }
  const value: FormContextValue = {
    form,
    schema,
    // Present because the context type requires it; see the note above on why
    // it is a no-op rather than an option.
    validateField: () => undefined,
    formMode,
  }
  // <I18nProvider> for the same reason main.tsx has one: a control that uses
  // <Trans> reads the catalog off React context. Controls that only call useT()
  // do not need it, but a harness that omits it would make the difference
  // invisible until the first <Trans> landed.
  return (
    <I18nProvider i18n={i18n}>
      <FormProvider value={value}>{children}</FormProvider>
    </I18nProvider>
  )
}

/** `render()` a control inside the harness. Returns what `render()` returns. */
/* eslint-disable-next-line react-refresh/only-export-components */
export function renderControl(ui: ReactElement, options: HarnessOptions = {}) {
  return render(<FormHarness {...options}>{ui}</FormHarness>)
}
