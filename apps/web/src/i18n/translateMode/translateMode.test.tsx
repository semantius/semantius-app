import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TranslateModeHost } from '@/components/TranslateModeHost'
import { bootApp, renderInApp } from '@/test/appHarness'
import {
  MISSING_ATTRIBUTE,
  SOURCE_LANGUAGE,
  activateLocale,
  buildExportFile,
  clearDrafts,
  highlightedTexts,
  messageIndex,
  readDrafts,
  saveDraft,
  setMarkMissing,
  setTranslateMode,
  supportsHighlightApi,
  TABLE_ATTR,
  tableLabel,
  translateModeFlags,
  translatedKeys,
  useLocaleLabels,
  useT,
} from '@/i18n'

/**
 * Translate mode, in a real browser, through the real app providers.
 *
 * The host is mounted the way `AppLayout` mounts it, the gate is the real
 * `rpc/get_userinfo` permissions of the run's identity (which holds `admin`),
 * the German is the shipped `de-DE.json`, and the marks are read back off
 * `CSS.highlights` — Chromium's own registry, not a stand-in. Nothing here
 * replaces anything: the writer is the drafts layer because this tenant has no
 * `ui_translations` table (its tests skip with a message elsewhere), and that
 * is the path a self-hosted operator is on too.
 */

const GERMAN = { language: 'de-DE', locale: 'de-DE' }

/** Text no catalog has, so it is missing in every language but the source. */
const UNTRANSLATED = 'A sentence no catalog has ever seen'
const UNTRANSLATED_LABEL = 'An unmistakably untranslated label'

/** A model label rendered the way the sidebar renders one. Not a real table. */
const LABEL_TABLE = 'vitest_probe_table'

function Probe() {
  const t = useT()
  const labels = useLocaleLabels()
  return (
    <div>
      <button type="button">{t('Log out')}</button>
      <p>{t(UNTRANSLATED)}</p>
      <input aria-label={t(UNTRANSLATED_LABEL)} />
      <h2>{tableLabel(labels, LABEL_TABLE, TABLE_ATTR.plural, 'Probe Rows')}</h2>
      {/* The shape the grid's own Add button and search field have: a
          TRANSLATED sentence whose only untranslated part is the model label
          interpolated into it. */}
      <button type="button">
        {t('Add {label}', { label: tableLabel(labels, LABEL_TABLE, TABLE_ATTR.singular, 'Probe Row') })}
      </button>
    </div>
  )
}

function Page() {
  return (
    <>
      <TranslateModeHost />
      <Probe />
    </>
  )
}

describe('translate mode', () => {
  beforeAll(async () => {
    // The host loads the chunk lazily; the first test would otherwise spend
    // its whole wait on Vite transforming the chunk and its index rather than
    // on the behavior under test. Same module, same URL — just warm.
    await import('@/i18n/translateMode')
  })

  beforeEach(async () => {
    await bootApp()
    clearDrafts('de-DE')
  })

  afterEach(() => {
    clearDrafts('de-DE')
  })

  it('runs where CSS Custom Highlights exist', () => {
    // The marks are painted through the API; a browser without it falls back
    // to the attribute. Chromium has it, and the assertions below rely on it.
    expect(supportsHighlightApi()).toBe(true)
  })

  it('marks the untranslated text and leaves every accessible name alone', async () => {
    setMarkMissing(true)
    await activateLocale(GERMAN)
    renderInApp(<Page />)

    // The marks are the untranslated sentence, the model label, and — inside a
    // sentence that IS translated — just the label interpolated into it.
    // "Log out" has its German and is left alone.
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Rows', 'Probe Row']))
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument()
    // The sub-range covers the label alone, not the German around it.
    expect(screen.getByRole('button', { name: 'Probe Row hinzufügen' })).toBeInTheDocument()

    // An attribute host has no text node to highlight and gets the attribute
    // instead — and the name itself is untouched, so the query still resolves.
    const field = screen.getByRole('textbox', { name: UNTRANSLATED_LABEL })
    await waitFor(() => expect(field).toHaveAttribute(MISSING_ATTRIBUTE))
    expect(document.documentElement.lang).toBe('de-DE')
  })

  it('marks nothing in the source language, where nothing is missing', async () => {
    setMarkMissing(true)
    renderInApp(<Page />)

    // Give the scan every chance to run: the host has to fetch the permissions
    // first, and the probe below waits on the same thing.
    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(highlightedTexts()).toEqual([])
    expect(translateModeFlags().missingCount).toBe(0)
    expect(document.documentElement.lang).toBe(SOURCE_LANGUAGE)
  })

  it('edits a string in place with Alt+click, and the draft reaches the DOM, the writer and the export', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)

    // The chunk is mounted once the floating button is there.
    await screen.findByRole('button', { name: /Übersetzungen/ })
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Rows', 'Probe Row']))

    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByText(UNTRANSLATED))
    await ui.keyboard('{/Alt}')

    const dialog = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(dialog).getByText(UNTRANSLATED)).toBeInTheDocument()
    const field = within(dialog).getByRole('textbox', { name: 'Übersetzung' })
    await ui.type(field, 'Ein Satz, den kein Katalog kennt')
    await ui.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    // On screen at once, through Lingui's merging load…
    await waitFor(() => expect(screen.getByText('Ein Satz, den kein Katalog kennt')).toBeInTheDocument())
    // …and the mark is gone, because the id is translated now.
    await waitFor(() => expect(highlightedTexts()).toEqual(['Probe Rows', 'Probe Row']))
    expect(translatedKeys('de-DE').has(UNTRANSLATED)).toBe(true)

    // The writer: this tenant has no table, so the save is a browser draft.
    expect(readDrafts('de-DE')).toEqual([
      { scope: 'message', key: UNTRANSLATED, context: '', translation: 'Ein Satz, den kein Katalog kennt' },
    ])

    // And the export carries it — the way a draft leaves a browser.
    const exported = await buildExportFile('de-DE', messageIndex(), [])
    expect(exported.messages?.[UNTRANSLATED]).toBe('Ein Satz, den kein Katalog kennt')

    // Alt+click the translated text: the editor offers to remove the draft —
    // the one thing a draft can honestly clear — and the source shows again.
    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByText('Ein Satz, den kein Katalog kennt'))
    await ui.keyboard('{/Alt}')
    const again = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(again).getByRole('textbox', { name: 'Übersetzung' })).toHaveValue('Ein Satz, den kein Katalog kennt')
    await ui.click(within(again).getByRole('button', { name: 'Entwurf entfernen' }))

    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    expect(readDrafts('de-DE')).toEqual([])
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Rows', 'Probe Row']))
  })

  it('reaches a model label interpolated into a translated sentence', async () => {
    // The gap this closes: "Add {label}" has German, so the sentence resolves
    // as translated and the label inside it — the only untranslated part —
    // used to be unmarkable and unreachable. It is one text node; nothing in
    // the DOM separates the two.
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)
    await screen.findByRole('button', { name: /Übersetzungen/ })
    await waitFor(() => expect(highlightedTexts()).toContain('Probe Row'))

    // One Alt+click on the button offers BOTH: the sentence and the label
    // interpolated into it. userEvent clicks the element's centre, which falls
    // in "hinzufügen", so the sentence leads — a click on the marked word puts
    // the label first, which is what the caret offset decides.
    const addButton = screen.getByRole('button', { name: 'Probe Row hinzufügen' })
    await ui.keyboard('{Alt>}')
    await ui.click(addButton)
    await ui.keyboard('{/Alt}')

    const dialog = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(dialog).getByRole('button', { name: 'Text' })).toBeInTheDocument()
    await ui.click(within(dialog).getByRole('button', { name: 'Tabelle' }))

    // The label, with the model's own English as the source and the key that
    // names it — not the sentence, which is already German.
    expect(within(dialog).getByText(`Tabelle: ${LABEL_TABLE}.singular_label`)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Übersetzung' })).toHaveValue('')
  })

  it('resolves an attribute host and a model label on Alt+click, with the model text as the source', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)
    await screen.findByRole('button', { name: /Übersetzungen/ })
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Rows', 'Probe Row']))

    // An input has no text node: the click resolves through its aria-label.
    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByRole('textbox', { name: UNTRANSLATED_LABEL }))
    await ui.keyboard('{/Alt}')
    const forLabel = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(forLabel).getByText(UNTRANSLATED_LABEL)).toBeInTheDocument()
    await ui.click(within(forLabel).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Übersetzen' })).not.toBeInTheDocument())

    // A model label: the source is what the model says, and the key names it.
    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByRole('heading', { name: 'Probe Rows' }))
    await ui.keyboard('{/Alt}')
    const forTable = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(forTable).getByText('Probe Rows')).toBeInTheDocument()
    expect(within(forTable).getByText(`Tabelle: ${LABEL_TABLE}.plural_label`)).toBeInTheDocument()
    // No draft yet, so there is nothing to remove.
    expect(within(forTable).queryByRole('button', { name: 'Entwurf entfernen' })).not.toBeInTheDocument()
  })

  it('lists the model labels on the page, and the whole model from the real tenant', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)

    await ui.click(await screen.findByRole('button', { name: /Übersetzungen/ }))
    const panel = await screen.findByRole('dialog', { name: 'Übersetzungen' })
    await ui.click(within(panel).getByRole('tab', { name: 'Modellbezeichnungen' }))

    // This page: the probe's table label, missing, resolved through the
    // reverse index rather than through any model read.
    const onPage = await within(panel).findByRole('button', { name: /Probe Rows/ })
    expect(within(onPage).getByText('Fehlt')).toBeInTheDocument()
    expect(within(onPage).getByText(`${LABEL_TABLE}.plural_label`)).toBeInTheDocument()

    // The whole model: read from the tenant's own tables/fields/modules. The
    // real model has no German, so "missing only" lists a real table label.
    await ui.click(within(panel).getByRole('button', { name: 'Gesamtes Modell' }))
    await within(panel).findByRole('button', { name: /customers\.plural_label/ })
    expect(within(panel).queryByRole('button', { name: /Probe Rows/ })).not.toBeInTheDocument()
  })

  it('lists what is on the page in the panel and opens the editor from it', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)

    await ui.click(await screen.findByRole('button', { name: /Übersetzungen/ }))
    const panel = await screen.findByRole('dialog', { name: 'Übersetzungen' })

    // The catalog tab, filtered to this page: the untranslated sentence is
    // there with its "missing" badge, resolved through the reverse index.
    await ui.click(within(panel).getByRole('button', { name: 'Auf dieser Seite' }))
    const entry = await within(panel).findByRole('button', { name: new RegExp(UNTRANSLATED) })
    expect(within(entry).getByText('Fehlt')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /de-DE\.json/ })).toBeInTheDocument()

    await ui.click(entry)
    const editor = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(editor).getByRole('textbox', { name: 'Übersetzung' })).toHaveValue('')
  })

  it('asks before discarding drafts, and then discards them', async () => {
    setTranslateMode(true)
    // A draft made the way the writer makes one: the real function, then the
    // layers folded again so the panel sees it.
    saveDraft('de-DE', { scope: 'message', key: UNTRANSLATED, context: '', translation: 'Entwurf' })
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)

    await ui.click(await screen.findByRole('button', { name: /Übersetzungen/ }))
    const panel = await screen.findByRole('dialog', { name: 'Übersetzungen' })
    await ui.click(within(panel).getByRole('button', { name: 'Entwürfe zurücksetzen' }))

    // Drafts live only in this browser, so the reset is unrecoverable and asks.
    const confirm = await screen.findByRole('alertdialog', { name: 'Entwürfe zurücksetzen?' })
    expect(readDrafts('de-DE')).toHaveLength(1)
    await ui.click(within(confirm).getByRole('button', { name: 'Entwürfe zurücksetzen' }))

    await waitFor(() => expect(readDrafts('de-DE')).toEqual([]))
    // And the page is back to the untranslated source text.
    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
  })

  it('renders nothing while both switches are off', async () => {
    // The permission gate itself cannot be asserted here: the run's identity
    // holds `admin`, and there is no second identity without it. What CAN be
    // asserted is that with both switches off the host renders nothing at all.
    renderInApp(<Page />)
    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Translations/ })).not.toBeInTheDocument()
    expect(document.querySelector(`[${MISSING_ATTRIBUTE}]`)).toBeNull()
  })
})
