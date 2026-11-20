import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SchemaObject } from 'ajv'
import { AppHarness, bootApp } from '@/test/appHarness'
import { PREFIX, TABLE_PREFIX, db } from '@/test/moduleFixture'
import { testToken } from '@/test/session'
import { callRpc } from '@/lib/apiClient'
import { canEditEntity } from '@/lib/permissions'
import type { EntityMetadata, JsonSchemaProperty } from '@/types/metadata'
import { SchemaForm } from '../SchemaForm'
import { InputReference } from '../InputReference'
import type { InputMode } from '../types'
import { FormHarness } from './harness'

/**
 * A reference submits the key it points at, in that key's own type.
 *
 * `entities.id_refentity` points at `entities`, whose key is `table_name` —
 * text. The control once took the catalog's `integer` for every `reference`,
 * turned the chosen key into `Number('parties')`, got NaN, stored null, and
 * the submit dropped the field: the listbox still showed "Party" and the
 * database refused a `has_a` entity with no base. `module_id` on the same
 * table points at an auto-increment key and must still arrive as a number.
 *
 * Both properties come from the tenant's own `get_schema`, and the chosen rows
 * are read from the tenant before the listbox shows them, so the value a test
 * expects is the value the database holds, not one spelled here.
 */

/**
 * A row the control's listbox shows, with a label no other row in it shares.
 *
 * The same select, order and page size the control asks for when opened with
 * no search term, so the row is on screen. Rows other test files write can be
 * deleted while this one runs, so they are skipped: a module carries `_vitest_`
 * in its name, and an entity is known by its table name, which starts with
 * `vitest_` (an entity's table name cannot start with `_`) while its label is
 * plain text like "Probe".
 */
async function pickableRow(property: JsonSchemaProperty): Promise<{ key: unknown; label: string }> {
  const table = String(property.reference_table)
  const idCol = String(property.reference_table_id_column)
  const labelCol = String(property.reference_table_label_column)
  const res = await db(`/${table}?select=${idCol},${labelCol}&limit=21&offset=0&order=${idCol}.desc`)
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Record<string, unknown>[]
  const labels = rows.map((row) => String(row[labelCol] ?? ''))
  const row = rows.find((candidate, i) => {
    const label = labels[i]
    return label !== ''
      && !label.includes(PREFIX)
      && !String(candidate[idCol]).includes(PREFIX)
      && !String(candidate[idCol]).startsWith(TABLE_PREFIX)
      && labels.indexOf(label) === labels.lastIndexOf(label)
  })
  if (!row) throw new Error(`no row in ${table} with a unique, non-empty ${labelCol}`)
  return { key: row[idCol], label: String(row[labelCol]) }
}

describe('InputReference — the submitted key has the type of the key it points at', () => {
  let properties: Record<string, JsonSchemaProperty>

  beforeEach(async () => {
    await bootApp()
    const metadata = await callRpc<EntityMetadata>('get_schema', { p_table_name: 'entities' }, testToken())
    properties = metadata.properties ?? {}
  })

  async function chooseAndSubmit(schema: SchemaObject, fieldLabel: string, optionLabel: string, initialValue = {}) {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AppHarness>
        <SchemaForm schema={schema} formMode="create" initialValue={initialValue} onSubmit={onSubmit} />
      </AppHarness>,
    )
    await user.click(await screen.findByRole('combobox', { name: new RegExp(`^${fieldLabel}`) }))
    await user.click(await screen.findByRole('option', { name: optionLabel }))
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    return onSubmit.mock.calls[0][0] as Record<string, unknown>
  }

  it('submits a text key as the text it is', async () => {
    const { id_type, id_refentity } = properties
    // The premise: the tenant types this reference by its target's key.
    expect(id_refentity.type).toBe('string')
    const target = await pickableRow(id_refentity)

    // `has_a` is what makes the rule show Base Entity as required.
    const submitted = await chooseAndSubmit(
      { type: 'object', properties: { id_type, id_refentity } },
      String(id_refentity.title),
      target.label,
      { id_type: 'has_a' },
    )

    expect(submitted.id_refentity).toBe(target.key)
    expect(typeof submitted.id_refentity).toBe('string')
  })

  it('opens the selected record in a new tab and offers Add {singular} in the list', async () => {
    const { module_id } = properties
    const target = await pickableRow(module_id)
    const referenced = await callRpc<EntityMetadata>('get_schema', {
      p_table_name: String(module_id.reference_table),
    }, testToken())
    const slug = referenced.table?.module_slug
    const table = referenced.table?.table_name
    const singular = referenced.table?.singular_label
    expect(slug).toBeTruthy()
    expect(table).toBeTruthy()
    expect(singular).toBeTruthy()
    // Add is the same gate as EntityView's "Add {label}": this user can edit
    // the referenced table, so the footer must appear. A user without that
    // permission is covered by canEditEntity in permissions.test.ts.
    const userInfo = await callRpc<Record<string, unknown>>('get_userinfo', {}, testToken())
    expect(canEditEntity(userInfo, referenced.table?.edit_permission)).toBe(true)

    const user = userEvent.setup()
    render(
      <AppHarness>
        <SchemaForm
          schema={{ type: 'object', properties: { module_id } }}
          formMode="edit"
          initialValue={{ module_id: target.key }}
        />
      </AppHarness>,
    )

    const open = await screen.findByRole('link', { name: `Open ${singular} in a new tab` })
    expect(open).toHaveAttribute('href', `/${slug}/${table}/${target.key}`)
    expect(open).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('combobox').contains(open)).toBe(false)

    await user.click(screen.getByRole('combobox', { name: new RegExp(`^${String(module_id.title)}`) }))
    const add = await screen.findByRole('link', { name: `Add ${singular}` })
    expect(add).toHaveAttribute('href', `/${slug}/${table}/create`)
    expect(add).toHaveAttribute('target', '_blank')
  })

  it('still submits a numeric key as a number', async () => {
    const { module_id } = properties
    expect(module_id.type).toBe('integer')
    const target = await pickableRow(module_id)

    const submitted = await chooseAndSubmit(
      { type: 'object', properties: { module_id } },
      String(module_id.title),
      target.label,
    )

    expect(submitted.module_id).toBe(target.key)
    expect(typeof submitted.module_id).toBe('number')
  })
})

/**
 * A reference whose target entity the user may not see looks up no row, runs
 * no search, and shows the value it stores.
 *
 * For a caller who holds neither the target's view nor its edit permission,
 * `get_schema` keeps `reference_table` on the property and leaves out the four
 * keys it reads off the target's catalog row (`reference_visible` in the
 * backend's 0250_public_functions.sql). The test user sees every `_core`
 * entity, so the property here is the tenant's own `entities.module_id` with
 * exactly those four keys removed. Nothing else in it is spelled here, and the
 * stored values are read from the tenant.
 *
 * That no request reaches the target table is observed on a call-through spy
 * of `fetch`, which replaces nothing (see useTable.test.tsx). An absence
 * proves something only once the requests it covers would have been made, so
 * the edit form also holds `entities.view_permission` unchanged, a reference
 * whose target the user does see. Both fields mount in the same render; once
 * that one has asked for its row and its target's schema, the hidden one would
 * have asked as well.
 */
const TARGET_KEYS = [
  'reference_table_id_column',
  'reference_table_label_column',
  'reference_table_singular_label',
  'reference_table_plural_label',
] as const

type Property = Record<string, unknown>

describe('InputReference — a target entity the user may not see', () => {
  let properties: Record<string, Property>
  let hiddenModule: Property
  let stored: { module_id: unknown; view_permission: unknown }
  let fetchSpy: MockInstance<typeof fetch>

  const pathOf = (input: RequestInfo | URL) =>
    new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname
  const tableRequested = (table: string) =>
    fetchSpy.mock.calls.some(([input]) => pathOf(input).endsWith(`/${table}`))
  const schemaRequested = (table: string) =>
    fetchSpy.mock.calls.some(([input, init]) => {
      if (!pathOf(input).endsWith('/rpc/get_schema')) return false
      try {
        return (JSON.parse(String(init?.body)) as { p_table_name?: unknown }).p_table_name === table
      } catch {
        return false
      }
    })

  beforeEach(async () => {
    await bootApp()
    const metadata = await callRpc<{ properties?: Record<string, Property> }>(
      'get_schema',
      { p_table_name: 'entities' },
      testToken(),
    )
    properties = metadata.properties ?? {}
    const { module_id } = properties
    // The premise: a target the user sees carries all four, so removing them
    // is the whole difference.
    for (const key of TARGET_KEYS) expect(module_id).toHaveProperty(key)
    hiddenModule = { ...module_id }
    for (const key of TARGET_KEYS) delete hiddenModule[key]

    const res = await db('/entities?select=module_id,view_permission&table_name=eq.entities')
    expect(res.ok).toBe(true)
    const [row] = (await res.json()) as Array<{ module_id: unknown; view_permission: unknown }>
    expect(row.module_id).not.toBeNull()
    expect(row.view_permission).not.toBeNull()
    stored = row

    // After the reads above, so it sees only what the control asks for.
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy?.mockRestore()
  })

  // What SchemaForm passes a control: the field's title and description, the
  // property's own inputMode, and `readonly` in a view (`resolvedInputMode`).
  function renderFields(fields: Record<string, Property>, formMode: 'edit' | 'view') {
    render(
      <AppHarness>
        <FormHarness defaultValues={stored} properties={fields} formMode={formMode}>
          {Object.entries(fields).map(([name, property]) => (
            <InputReference
              key={name}
              name={name}
              label={String(property.title ?? name)}
              description={typeof property.description === 'string' ? property.description : undefined}
              inputMode={formMode === 'view' ? 'readonly' : (property.inputMode as InputMode)}
              schema={property}
            />
          ))}
        </FormHarness>
      </AppHarness>,
    )
    return screen.findByRole('combobox', { name: new RegExp(`^${String(hiddenModule.title)}`) })
  }

  it('shows the stored value, and neither looks it up nor searches the target', async () => {
    const user = userEvent.setup()
    const trigger = await renderFields({ module_id: hiddenModule, view_permission: properties.view_permission }, 'edit')

    await waitFor(() => {
      expect(tableRequested('permissions')).toBe(true)
      expect(schemaRequested('permissions')).toBe(true)
    })
    await waitFor(() => expect(trigger).toHaveTextContent(new RegExp(`^${String(stored.module_id)}$`)))

    // Opening the list is when a search would run.
    await user.click(trigger)
    expect(await screen.findByText(`No ${String(hiddenModule.title)} found.`)).toBeInTheDocument()

    expect(tableRequested(String(hiddenModule.reference_table))).toBe(false)
  })

  it('shows the stored value in a view, read-only', async () => {
    const trigger = await renderFields({ module_id: hiddenModule }, 'view')

    await waitFor(() => expect(trigger).toHaveTextContent(new RegExp(`^${String(stored.module_id)}$`)))
    expect(trigger).toBeDisabled()
  })
})
