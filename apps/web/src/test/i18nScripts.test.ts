import { describe, expect, it } from 'vitest'
import { buildWorkFile } from '../../scripts/i18n/translate.mjs'
import { mergeIntoCatalog, validateWork, workToRows } from '../../scripts/i18n/import.mjs'
import { fillEmptyMessages } from '../../scripts/i18n/export.mjs'
import { labelsOfFile } from '../../scripts/i18n/labels.mjs'
import type { LocaleFile } from '@/i18n'

/**
 * The tenant-facing scripts, exercised without a tenant.
 *
 * They are how a language is actually translated — an agent runs `translate.mjs`,
 * fills the file in and runs `import.mjs` — so the parts that DECIDE things are
 * pure functions the scripts call, and this is where those decisions are pinned.
 * The network half (`tenant.mjs`, `model.mjs`) is exercised for real by
 * `src/i18n/tenantTranslations.test.tsx`.
 *
 * The refusals matter more than the acceptances. A work file that silently
 * imported a translation with the wrong placeholder would put a message on
 * screen with a hole in it, and nothing downstream would notice.
 */

const index = {
  locale: 'en-US',
  index: {
    Save: { message: 'Save', origin: ['src/a.tsx'], placeholders: [] },
    'Delete {label}?': {
      message: 'Delete {label}?',
      origin: ['src/b.tsx'],
      placeholders: ['label'],
    },
    'Viewcolumn visibility': {
      message: 'View',
      context: 'column visibility',
      origin: ['src/c.tsx'],
      placeholders: [],
    },
  },
}

describe('buildWorkFile', () => {
  const inventory = [
    { scope: 'table' as const, key: 'customers.plural_label', source: 'Customers' },
    { scope: 'enum' as const, key: 'customers.status.active', source: 'active' },
  ]

  it('asks only for what is not already answered', () => {
    const work = buildWorkFile('de-DE', {
      index,
      catalog: { locale: 'de-DE', messages: { Save: 'Speichern', 'Delete {label}?': '' } },
      inventory,
      labels: { 'table:customers.plural_label': 'Kunden' },
      requests: [],
    })

    // 'Save' is translated in the repo catalog, so it is not asked for again;
    // an EMPTY entry is a gap and is.
    expect(work.entries.message!.map((entry) => entry.key)).toEqual([
      'Delete {label}?',
      'View',
    ])
    expect(work.entries.table).toBeUndefined()
    expect(work.entries.enum!.map((entry) => entry.key)).toEqual([
      'customers.status.active',
    ])
  })

  it('carries the source, the context, the placeholders and the origin', () => {
    const work = buildWorkFile('de-DE', {
      index,
      catalog: { locale: 'de-DE' },
      inventory: [],
      labels: {},
      requests: [],
    })
    const entry = work.entries.message!.find((row) => row.key === 'Delete {label}?')

    expect(entry).toMatchObject({
      source: 'Delete {label}?',
      placeholders: ['label'],
      origin: ['src/b.tsx'],
      translation: '',
    })
    expect(work.entries.message!.find((row) => row.key === 'View')!.context).toBe(
      'column visibility',
    )
  })

  it('adds a runtime message the app asked for, with where it met it', () => {
    const work = buildWorkFile('de-DE', {
      index: { locale: 'en-US', index: {} },
      catalog: { locale: 'de-DE' },
      inventory: [],
      labels: {},
      requests: [
        {
          locale: 'de-DE',
          scope: 'server',
          key: 'Order must have at least one line',
          context: '',
          translation: '',
          origin: '/nwind/orders',
        },
      ],
    })

    expect(work.entries.server).toEqual([
      {
        key: 'Order must have at least one line',
        source: 'Order must have at least one line',
        translation: '',
        origin: ['/nwind/orders'],
      },
    ])
  })

  it('drops a requested message the repo catalog already answers', () => {
    const work = buildWorkFile('de-DE', {
      index: { locale: 'en-US', index: {} },
      catalog: { locale: 'de-DE', messages: { Save: 'Speichern' } },
      inventory: [],
      labels: {},
      requests: [{ locale: 'de-DE', scope: 'message', key: 'Save', context: '', translation: '' }],
    })

    expect(work.entries.message).toBeUndefined()
  })
})

describe('validateWork', () => {
  const entry = (over: Record<string, unknown>) => ({
    key: 'Delete {label}?',
    source: 'Delete {label}?',
    placeholders: ['label'],
    translation: '',
    ...over,
  })

  it('accepts a correctly filled file', () => {
    const work = { locale: 'de-DE', entries: { message: [entry({ translation: '{label} löschen?' })] } }

    expect(validateWork(work)).toEqual([])
  })

  it('rejects a translation that drops or invents a placeholder', () => {
    // A dropped placeholder loses the value on screen; an invented one renders
    // as literal braces. Neither is visible in a diff of a thousand entries.
    expect(validateWork({ locale: 'de-DE', entries: { message: [entry({ translation: 'Löschen?' })] } }))
      .toHaveLength(1)
    expect(
      validateWork({ locale: 'de-DE', entries: { message: [entry({ translation: '{name} löschen?' })] } }),
    ).toHaveLength(1)
  })

  it('rejects a translation that does not compile as ICU', () => {
    const broken = { locale: 'de-DE', entries: { message: [entry({ translation: '{label löschen?' })] } }

    expect(validateWork(broken)[0]).toContain('does not compile')
  })

  it('exempts server and rule text, which is looked up verbatim', () => {
    // A backend message may legitimately contain braces, and running it through
    // the ICU compiler would either throw or silently eat them.
    const work = {
      locale: 'de-DE',
      entries: {
        server: [{ key: 'a {b', source: 'a {b', translation: 'ein {b' }],
      },
    }

    expect(validateWork(work)).toEqual([])
  })

  it('reports EVERY problem, not the first', () => {
    const work = {
      locale: 'de-DE',
      entries: {
        message: [entry({ translation: 'Löschen?' }), entry({ key: 'Save', translation: '{x' })],
      },
    }

    expect(validateWork(work).length).toBeGreaterThan(1)
  })

  it('ignores an entry nobody has filled in yet', () => {
    expect(validateWork({ locale: 'de-DE', entries: { message: [entry({})] } })).toEqual([])
  })
})

describe('workToRows', () => {
  it('writes only what was filled in, keyed the way the table is', () => {
    const rows = workToRows({
      locale: 'de-DE',
      entries: {
        message: [
          { key: 'Save', source: 'Save', translation: 'Speichern' },
          { key: 'View', source: 'View', context: 'column visibility', translation: 'Ansicht' },
          { key: 'Untouched', source: 'Untouched', translation: '' },
        ],
        table: [{ key: 'customers.plural_label', source: 'Customers', translation: 'Kunden' }],
      },
    })

    expect(rows).toEqual([
      { locale: 'de-DE', scope: 'message', key: 'Save', context: '', translation: 'Speichern' },
      {
        locale: 'de-DE',
        scope: 'message',
        key: 'View',
        context: 'column visibility',
        translation: 'Ansicht',
      },
      { locale: 'de-DE', scope: 'table', key: 'customers.plural_label', context: '', translation: 'Kunden' },
    ])
  })
})

describe('mergeIntoCatalog', () => {
  it('fills an empty entry and never overwrites a reviewed one', () => {
    const catalog: LocaleFile = {
      locale: 'de-DE',
      messages: { Save: '', Delete: 'Löschen' },
      contexts: { 'column visibility': { View: '' } },
    }
    const written = mergeIntoCatalog(catalog, {
      locale: 'de-DE',
      entries: {
        message: [
          { key: 'Save', source: 'Save', translation: 'Speichern' },
          { key: 'Delete', source: 'Delete', translation: 'ETWAS ANDERES' },
          { key: 'View', source: 'View', context: 'column visibility', translation: 'Ansicht' },
        ],
      },
    })

    expect(written).toBe(2)
    expect(catalog.messages).toEqual({ Save: 'Speichern', Delete: 'Löschen' })
    expect(catalog.contexts).toEqual({ 'column visibility': { View: 'Ansicht' } })
  })
})

describe('fillEmptyMessages (export --messages-into)', () => {
  it('copies a tenant translation into a gap, and only into a gap', () => {
    const catalog: LocaleFile = { locale: 'de-DE', messages: { Save: '', Delete: 'Löschen' } }
    const filled = fillEmptyMessages(catalog, {
      locale: 'de-DE',
      messages: { Save: 'Speichern', Delete: 'ETWAS ANDERES', Unknown: 'Unbekannt' },
    })

    expect(filled).toBe(1)
    // `Unknown` is not in the catalog at all: the repo catalog's keys come from
    // the extractor, and a tenant row is not allowed to invent one.
    expect(catalog.messages).toEqual({ Save: 'Speichern', Delete: 'Löschen' })
  })
})

describe('labelsOfFile', () => {
  it('reads a deployment file\'s labels as the map the diff compares against', () => {
    const labels = labelsOfFile({
      locale: 'fr-FR',
      messages: { Save: 'Enregistrer' },
      labels: {
        tables: { customers: { plural_label: 'Clients', columns: { status: { enum: { active: 'Actif' } } } } },
        modules: { crm: { name: 'CRM' } },
      },
    })

    // Messages are not labels, so they are not in it.
    expect(labels).toEqual({
      'table:customers.plural_label': 'Clients',
      'enum:customers.status.active': 'Actif',
      'module:crm.name': 'CRM',
    })
  })
})
