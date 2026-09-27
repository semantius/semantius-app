import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SchemaObject } from 'ajv'
import { AppHarness, bootApp } from '@/test/appHarness'
import { PREFIX, db } from '@/test/moduleFixture'
import { testToken } from '@/test/session'
import { callRpc } from '@/lib/apiClient'
import type { EntityMetadata, JsonSchemaProperty } from '@/types/metadata'
import { SchemaForm } from '../SchemaForm'

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
 * no search term, so the row is on screen. Rows other test files write carry
 * `_vitest_` and can be deleted while this one runs; they are skipped.
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
