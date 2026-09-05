# Form Components

This directory contains form components for rendering dynamic forms based on JSON Schema with validation powered by the sem-schema package.

## Overview

The form engine consists of:

1. **Form Controls** — Individual input components for each data type and format
2. **SchemaForm** — Main component that renders a complete form from a JSON Schema
3. **FormContext** — React Context providing the TanStack Form instance, schema, and validation
4. **Controls Registry** (`controls.ts`) — Maps format/type strings to components

## Architecture

### How Control Selection Works

When a schema property is rendered, the controls registry (`controls.ts`) determines which component to use:

1. If the property has a `format`, look up the format string in the registry
2. If no `format`, use the `type` as the lookup key
3. If no match, fall back to `InputText`

### FormContext

`FormContext.tsx` provides:

- `form` — TanStack Form instance
- `schema` — the full JSON Schema object
- `validateField(value, fieldName)` — validates a single field value against its schema

All form controls access this via `useFormContext()`. Controls do **not** receive `value`/`onChange` as props — they use the TanStack Form field API internally.

### FormControlProps Interface

All controls implement this interface (`types.ts`):

```typescript
type InputMode = "default" | "required" | "readonly" | "disabled" | "hidden";

interface FormControlProps {
  name: string;
  label?: string;
  description?: string;
  inputMode?: InputMode;
  validators?: {
    onChange?: ({ value }: { value: any }) => string | undefined;
    onBlur?: ({ value }: { value: any }) => string | undefined;
    onSubmit?: ({ value }: { value: any }) => string | undefined;
  };
}
```

### Shared Sub-Components

- **FormLabel** — renders label with optional required indicator; returns `null` when label is falsy.
  Always emits `id={name}-label` as well as `htmlFor`, so a control that cannot be
  named by a `<label for>` can point `aria-labelledby` at it.
- **FormDescription** — renders muted description text; returns `null` in view mode.
  Emits `id={name}-description` when there IS a description; the `&nbsp;` spacer it
  renders otherwise is `aria-hidden`.
- **FormError** — renders the validation message in destructive color; returns `null`
  when there is no error. Carries `role="alert"` and `id={name}-error`.
- **CodeMirrorJson / CodeMirrorHtml / CodeMirrorCode / CodeMirrorJsonata** — CodeMirror wrappers for editor-based controls
- **fieldAria.ts** — `describedBy()`, `labelledBy()`, `descriptionId()`, `errorId()`.

These components handle null/empty checks internally — callers do not need conditional rendering.

### The id / labelling rules every control must follow

These are not style preferences. Seven of the 29 controls once rendered
`<FormLabel htmlFor={name}>` pointing at nothing, and 28 never referenced their
description at all — because each control re-spelled the wiring by hand. The rules
below are what `fieldAria.ts` exists to encode; use it rather than repeating them.

1. **The control gets `id={name}`** when it is a labelable element (`<input>`,
   `<textarea>`, `<select>`). `<FormLabel htmlFor={name}>` then names it.
2. **A control that is NOT labelable gets `aria-labelledby={labelledBy(name, label)}`**
   instead. A `<label for>` does not name a `<button>` (a picker trigger, a combobox
   trigger) and it does not name a CodeMirror `contenteditable` div. For a trigger
   that also shows the current value, reference the label AND the trigger's own id —
   `aria-labelledby={`${labelledBy(name, label)} ${triggerId}`}` — so the field name
   is announced first and the value second.
3. **`aria-describedby={describedBy(name, { description, error })}`**, always through
   the helper. Description and error are **additive**, never either/or: a field can
   carry help text and be invalid at once, and a user who hears only the error has
   lost the instructions that would let them fix it. The helper returns `undefined`
   when there is neither — an `aria-describedby` that resolves to no element is an
   `aria-valid-attr-value` violation, and `''` or `' '` counts as one.
4. **`aria-invalid` only where the role supports it.** A `<button>` trigger cannot
   take it (it is not a text field); carry the invalid state visually there and let
   the error text reach the user through `aria-describedby`. `role="combobox"`
   triggers *can* take it — and, having claimed that role, they MUST also carry
   `aria-controls` pointing at the popup, but only while the popup is mounted.
5. **CodeMirror gets its attributes through `EditorView.contentAttributes`**
   (see `codeMirrorField.ts`). Attributes on the wrapper never reach `.cm-content`,
   which is the element that actually takes focus.

## Available Controls

### Standard JSON Schema 2020-12 Formats

| Format                  | Component                | Description                     |
| ----------------------- | ------------------------ | ------------------------------- |
| `date-time`             | InputDateTime            | Date + time picker              |
| `time`                  | InputTime                | Time input                      |
| `date`                  | InputDate                | Date picker with calendar       |
| `duration`              | InputDuration            | ISO 8601 duration               |
| `email`                 | InputEmail               | Email with validation           |
| `idn-email`             | InputIdnEmail            | Internationalized email         |
| `hostname`              | InputHostname            | Hostname input                  |
| `idn-hostname`          | InputIdnHostname         | Internationalized hostname      |
| `ipv4`                  | InputIpv4                | IPv4 address                    |
| `ipv6`                  | InputIpv6                | IPv6 address                    |
| `uri`                   | InputUri                 | URI input                       |
| `uri-reference`         | InputUriReference        | URI reference                   |
| `uri-template`          | InputUriTemplate         | URI template                    |
| `iri`                   | InputIri                 | Internationalized URI           |
| `iri-reference`         | InputIriReference        | Internationalized URI reference |
| `uuid`                  | InputUuid                | UUID input                      |
| `json-pointer`          | InputJsonPointer         | JSON Pointer                    |
| `relative-json-pointer` | InputRelativeJsonPointer | Relative JSON Pointer           |
| `regex`                 | InputRegex               | Regular expression              |

### Custom Formats

| Format    | Component     | Description                           |
| --------- | ------------- | ------------------------------------- |
| `text`    | InputTextarea | Multi-line text                       |
| `json`    | InputJson     | CodeMirror editor with JSON syntax    |
| `html`    | InputHtml     | CodeMirror editor with HTML syntax    |
| `code`    | InputCode     | CodeMirror editor (generic)           |
| `jsonata` | InputJsonata  | CodeMirror editor with JSONata syntax |

### Type-Based Controls (no format specified)

| Type                   | Component    | Description      |
| ---------------------- | ------------ | ---------------- |
| `string`               | InputText    | Basic text input |
| `number` / `integer`   | InputNumber  | Numeric input    |
| `boolean`              | InputBoolean | Checkbox         |
| `enum` (array present) | InputEnum    | Select dropdown  |

## SchemaForm Component

`SchemaForm.tsx` is the main entry point:

- **Auto-generates forms** from JSON Schema properties
- **Maps schema formats/types** to controls via the controls registry
- **Generates default values** from schema `default` fields or infers by type
- **Validates fields** on submit using AJV via sem-schema
- **Validates entire form** on submit before calling `onSubmit`
- **Supports `formMode`**: `edit` (default), `create` (skips readonly/disabled fields), `view` (all fields readonly, no submit button)
- **Uses `inputMode`** from schema properties: `default`, `required`, `readonly`, `disabled`, `hidden`
- **Scrolls to first error** on validation failure

### Usage

```tsx
import { SchemaForm } from '@/components/form'

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', inputMode: 'required', minLength: 1 },
    email: { type: 'string', format: 'email' },
    bio: { format: 'text' },
    config: { format: 'json' }
  },
  required: ['name', 'email']
}

<SchemaForm
  schema={schema}
  initialValue={data}
  formMode="edit"
  onSubmit={(value) => console.log('Valid data:', value)}
/>
```

## Validation

### Field-Level (onSubmit per field)

Each field validates when the form is submitted:

```typescript
validators={{
  onSubmit: ({ value }) => validateField(value, propSchema, key),
}}
```

### Form-Level (onSubmit)

The entire form validates on submit:

```typescript
const result = validateData(cleanedValue, validationSchema);
if (result.valid) {
  onSubmit?.(cleanedValue);
} else {
  // Set errors on individual fields, scroll to first error
}
```

Validation uses the sem-schema validator which extends AJV with:

- Custom formats: `json`, `html`, `text`, `code`, `jsonata`
- `inputMode: 'required'` — non-empty string enforcement
- Number `precision` keyword (0-4 decimal places)

### InputMode and Validation

- `default` / `required` — fields are validated
- `readonly` / `disabled` / `hidden` — fields skip validation
- `disabled` fields are never included in submitted data
- In `create` mode, `readonly` fields are excluded from both rendering and submission

## Adding New Controls

To add a new form control:

1. Create `InputNewFormat.tsx` implementing `FormControlProps`
2. **Use shadcn/ui components** — check https://ui.shadcn.com/docs/components first
3. Import and add it to the `controls` map in `controls.ts`

The `SchemaForm` component will automatically use your control for fields with that format or type.

### Example: Adding a URL Input

```typescript
// 1. Create InputUri.tsx using shadcn Input component
import { Input } from '@/components/ui/input'
import type { FormControlProps } from './types'
import { useFormContext } from './FormContext'
import { FormLabel } from './FormLabel'
import { FormDescription } from './FormDescription'
import { FormError } from './FormError'

export function InputUri(props: FormControlProps) {
  const { form } = useFormContext()

  return (
    <form.Field name={props.name} validators={props.validators}>
      {(field: any) => (
        <div className="space-y-2">
          <FormLabel htmlFor={props.name} label={props.label} required={props.required} />
          <Input
            id={props.name}
            type="url"
            value={field.state.value || ''}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            disabled={props.disabled}
          />
          <FormDescription description={props.description} />
          <FormError name={props.name} error={field.state.meta.errors?.[0]} />
        </div>
      )}
    </form.Field>
  )
}

// 2. Update controls.ts
import { InputUri } from './InputUri'

export const controls = {
  // ... existing controls
  uri: InputUri,
}
```

## Testing

### Quality Standards

All code changes must meet these quality standards:

1. **Visual Verification** — Use `agent-browser` to verify UI changes; take before/after screenshots
2. **Form Validation Testing** — Test submit with empty required fields, verify error messages, test field-level and form-level validation
3. **Layout and Styling** — Verify no unwanted scrollbars, form areas scroll on overflow, inputs have proper borders/shadows, date pickers render correctly
4. **Test Coverage** — All new input controls must have tests; run `pnpm test` before committing

### Running Tests

```bash
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test InputDate   # Run tests for a specific component
```

### Test Requirements for New Components

All input controls must have comprehensive tests that validate:

1. **Rendering Test**: Verify component renders with correct type/structure
2. **Styling Test**: Check proper Tailwind/CSS classes are applied (not inline styles)
3. **Required Field Test**: Show asterisk (*) when field is marked as required
4. **Required Validation Test**: Detect and show error when required field is empty
5. **Invalid Value Detection Test**: Validate format-specific rules and show errors
6. **Valid Value Acceptance Test**: Accept correctly formatted values without error
7. **Label/Description Test**: Display label and description text correctly
8. **User Interaction Test**: Test typing/interaction and value changes
9. **Accessible Name Test**: The control has an accessible name equal to the label.
   Assert it with `getByRole(role, { name })` or `toHaveAccessibleName`, NEVER with
   `findByLabelText` — that queries the label association only and does not run
   accessible-name computation, so it passes on controls that a screen reader would
   announce as unnamed.

### Mandatory Test Template

Use this template for all input control tests:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from '@tanstack/react-form'
import { InputControlName } from '../InputControlName'
import { FormProvider } from '../FormContext'
import type { FormContextValue } from '../FormContext'

describe('InputControlName', () => {
  function TestWrapper({
    children,
    required = false,
    validatorFn = () => undefined
  }: {
    children: React.ReactNode
    required?: boolean
    validatorFn?: (value: any) => string | undefined
  }) {
    const form = useForm({
      defaultValues: { fieldName: '' },
      onSubmit: async () => {},
    })

    const mockContext: FormContextValue = {
      form,
      schema: {
        type: 'object',
        properties: {
          fieldName: { type: 'string', format: 'specific-format', required }
        },
        required: required ? ['fieldName'] : []
      },
      validateField: validatorFn,
    }

    return <FormProvider value={mockContext}>{children}</FormProvider>
  }

  // 1. Rendering Test
  it('should render with correct type/structure', () => {
    const { container } = render(
      <TestWrapper>
        <InputControlName name="fieldName" />
      </TestWrapper>
    )
    const element = container.querySelector('[type="..."]') // or other selector
    expect(element).toBeTruthy()
  })

  // 1b. Accessible Name Test — the one assertion that catches a label pointing
  //     at nothing. getByLabelText would NOT: it checks the association, not the
  //     computed name, so it passes on a control that announces as unnamed.
  it('should be named by its label', () => {
    render(
      <TestWrapper>
        <InputControlName name="fieldName" label="Field label" />
      </TestWrapper>
    )
    expect(screen.getByRole('textbox', { name: 'Field label' })).toBeInTheDocument()
  })

  // 1c. Description Association Test — description AND error are additive; a
  //     control that references only one of them drops the other.
  it('should reference its description from aria-describedby', () => {
    render(
      <TestWrapper>
        <InputControlName name="fieldName" label="Field label" description="Help text" />
      </TestWrapper>
    )
    expect(screen.getByRole('textbox', { name: 'Field label' }))
      .toHaveAccessibleDescription('Help text')
  })

  // 2. Required Indicator Test
  it('should show required indicator (*) when required', () => {
    render(
      <TestWrapper required>
        <InputControlName name="fieldName" label="Field" required />
      </TestWrapper>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  // 3. Required Validation Test
  it('should validate required field and show error when empty', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        required
        validatorFn={(value) => !value || value.trim() === '' ? 'must not be empty' : undefined}
      >
        <InputControlName
          name="fieldName"
          label="Field"
          required
          validators={{
            onBlur: ({ value }) => !value || value.trim() === '' ? 'must not be empty' : undefined,
          }}
        />
      </TestWrapper>
    )

    const input = screen.getByLabelText(/field/i)
    await user.click(input)
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must not be empty/i)).toBeInTheDocument()
    })
  })

  // 4. Invalid Value Detection Test
  it('should detect invalid format and show error', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        validatorFn={(value) => {
          if (!value) return undefined
          // Add format-specific validation logic
          return isInvalidFormat(value) ? 'must match format "specific-format"' : undefined
        }}
      >
        <InputControlName
          name="fieldName"
          label="Field"
          validators={{
            onBlur: ({ value }) => {
              if (!value) return undefined
              return isInvalidFormat(value) ? 'must match format "specific-format"' : undefined
            },
          }}
        />
      </TestWrapper>
    )

    const input = screen.getByLabelText(/field/i)
    await user.type(input, 'invalid-value')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/must match format/i)).toBeInTheDocument()
    })
  })

  // 5. Valid Value Acceptance Test
  it('should accept valid values without error', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        validatorFn={(value) => {
          if (!value) return undefined
          return isInvalidFormat(value) ? 'must match format "specific-format"' : undefined
        }}
      >
        <InputControlName
          name="fieldName"
          label="Field"
          validators={{
            onBlur: ({ value }) => {
              if (!value) return undefined
              return isInvalidFormat(value) ? 'must match format "specific-format"' : undefined
            },
          }}
        />
      </TestWrapper>
    )

    const input = screen.getByLabelText(/field/i) as HTMLInputElement
    await user.type(input, 'valid-value')
    await user.tab()

    await waitFor(() => {
      expect(screen.queryByText(/must match format/i)).not.toBeInTheDocument()
      expect(input.value).toBe('valid-value')
    })
  })

  // 6. Label/Description Test
  it('should display label and description', () => {
    render(
      <TestWrapper>
        <InputControlName
          name="fieldName"
          label="Field Label"
          description="Field description"
        />
      </TestWrapper>
    )
    expect(screen.getByText('Field Label')).toBeInTheDocument()
    expect(screen.getByText('Field description')).toBeInTheDocument()
  })
})
```
