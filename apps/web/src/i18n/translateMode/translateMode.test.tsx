import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TranslateModeHost } from '@/components/TranslateModeHost'
import { bootApp, renderInApp } from '@/test/appHarness'
import {
  MISSING_ATTRIBUTE,
  SOURCE_LANGUAGE,
  activateLocale,
  highlightedTexts,
  resetSourceIndex,
  setTranslateMode,
  supportsHighlightApi,
  translate,
  translateModeFlags,
  translatedKeys,
  translationsUrl,
  useT,
} from '@/i18n'
import { disableCollector, enableCollector, flush } from '@/i18n/missing'

/** Ask the translate endpoint directly — never through the code under test. */
async function record(locale: string): Promise<Record<string, string>> {
  const res = await fetch(translationsUrl(locale))
  return (await res.json()) as Record<string, string>
}

async function write(locale: string, key: string, translation: string): Promise<void> {
  await fetch(translationsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale, key, translation }),
  })
}

/**
 * Undo whatever a test wrote, through the same endpoint. The index first: a
 * language's empty entry survives only for a key the index knows, so
 * clearing the index entry is what lets the language entry go.
 */
async function forget(keys: string[]): Promise<void> {
  for (const key of keys) {
    await write(SOURCE_LANGUAGE, key, '')
    await write('de-DE', key, '')
  }
}

/**
 * Translate mode, in a real browser, through the real app providers.
 *
 * The host is mounted the way `AppLayout` mounts it, the gate is the real
 * target — the dev server this suite runs against, the same endpoint
 * `pnpm dev` answers — the German is the shipped `de-DE.json`, and the marks
 * are read back off `CSS.highlights` — Chromium's own registry, not a
 * stand-in. The probe strings below are deliberately UNKNOWN to every
 * catalog, so the collector is off in every test that renders them and the
 * one that turns it on cleans up: the files under i18n/ are the
 * shipped ones.
 */

const GERMAN = { language: 'de-DE', locale: 'de-DE' }

/** Text no catalog has, so it is missing in every language but the source. */
const UNTRANSLATED = 'A sentence no catalog has ever seen'
const UNTRANSLATED_LABEL = 'An unmistakably untranslated label'

/** A model label rendered the way the sidebar renders one. Not a real table. */
const LABEL_MODULE = 'vitest'
const LABEL_TABLE = 'vitest_probe_table'
const PLURAL_KEY = `module.${LABEL_MODULE}.${LABEL_TABLE}.entity.plural_label`
const SINGULAR_KEY = `module.${LABEL_MODULE}.${LABEL_TABLE}.entity.singular_label`

function Probe() {
  const t = useT()
  return (
    <div>
      <button type="button">{t('Log out')}</button>
      <p>{t(UNTRANSLATED)}</p>
      <input aria-label={t(UNTRANSLATED_LABEL)} />
      <h2>{t({ id: ['module', LABEL_MODULE, LABEL_TABLE, 'entity', 'plural_label'], defaultMessage: 'Probe Rows' })}</h2>
      {/* The shape the grid's own Add button and search field have: a
          TRANSLATED sentence whose only untranslated part is the model label
          interpolated into it. */}
      <button type="button">
        {t('Add {label}', {
          label: t({ id: ['module', LABEL_MODULE, LABEL_TABLE, 'entity', 'singular_label'], defaultMessage: 'Probe Row' }),
        })}
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
    // its whole wait on Vite transforming the chunk rather than on the
    // behavior under test. Same module, same URL — just warm.
    await import('@/i18n/translateMode')
  })

  beforeEach(async () => {
    // The probe strings must not be discovered into the shipped files.
    disableCollector()
    resetSourceIndex()
    await bootApp()
  })

  afterEach(async () => {
    disableCollector()
    await forget([UNTRANSLATED, UNTRANSLATED_LABEL, PLURAL_KEY, SINGULAR_KEY])
  })

  it('runs where CSS Custom Highlights exist', () => {
    // The marks are painted through the API; a browser without it falls back
    // to the attribute. Chromium has it, and the assertions below rely on it.
    expect(supportsHighlightApi()).toBe(true)
  })

  it('marks the untranslated text and leaves every accessible name alone', async () => {
    setTranslateMode(true)
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
    setTranslateMode(true)
    renderInApp(<Page />)

    // Give the scan every chance to run: the host has to fetch the permissions
    // first, and the probe below waits on the same thing.
    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 600))

    expect(highlightedTexts()).toEqual([])
    expect(translateModeFlags().missingCount).toBe(0)
    expect(document.documentElement.lang).toBe(SOURCE_LANGUAGE)
  })

  it('edits a string in place with Alt+click, and the save reaches the DOM and the endpoint', async () => {
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

    // On screen at once…
    await waitFor(() => expect(screen.getByText('Ein Satz, den kein Katalog kennt')).toBeInTheDocument())
    // …and the mark is gone, because the key is translated now.
    await waitFor(() => expect(highlightedTexts()).toEqual(['Probe Rows', 'Probe Row']))
    expect(translatedKeys('de-DE').has(UNTRANSLATED)).toBe(true)

    // And the ENDPOINT holds it — read back over a separate request that does
    // not go through the code under test. One contract, whatever is behind it.
    expect((await record('de-DE'))[UNTRANSLATED]).toBe('Ein Satz, den kein Katalog kennt')

    // Clearing writes an empty translation through the same call, and the
    // source text shows through again.
    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByText('Ein Satz, den kein Katalog kennt'))
    await ui.keyboard('{/Alt}')
    const again = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(again).getByRole('textbox', { name: 'Übersetzung' })).toHaveValue('Ein Satz, den kein Katalog kennt')
    await ui.click(within(again).getByRole('button', { name: 'Leeren' }))

    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Rows', 'Probe Row']))
    // A cleared key the index never knew leaves no entry behind.
    expect((await record('de-DE'))[UNTRANSLATED]).toBeUndefined()
  })

  it('opens the editor on right-click, which is what a person tries first', async () => {
    // Alt+click alone was undiscoverable: the owner tried click and right-click
    // on marked text and reported that nothing happened. Right-click needs no
    // keyboard and conflicts with nothing the app itself does.
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)
    await screen.findByRole('button', { name: /Übersetzungen/ })
    await waitFor(() => expect(highlightedTexts()).toContain(UNTRANSLATED))

    await ui.pointer({ target: screen.getByText(UNTRANSLATED), keys: '[MouseRight]' })

    const dialog = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(dialog).getByText(UNTRANSLATED)).toBeInTheDocument()
  })

  it('leaves the browser menu alone over text it did not produce, and over its own UI', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(
      <>
        <Page />
        <p>Ein Datenwert, den keine Übersetzung erzeugt hat</p>
      </>,
    )
    await screen.findByRole('button', { name: /Übersetzungen/ })

    // Nothing produced this string, so the handler stands down and the native
    // context menu opens — which is what `preventDefault` being conditional on
    // a resolved target buys.
    await ui.pointer({
      target: screen.getByText('Ein Datenwert, den keine Übersetzung erzeugt hat'),
      keys: '[MouseRight]',
    })

    expect(screen.queryByRole('dialog', { name: 'Übersetzen' })).not.toBeInTheDocument()
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
    // A code string's candidate is named as a message; a keyed one by its key.
    expect(within(dialog).getByRole('button', { name: 'Text' })).toBeInTheDocument()
    await ui.click(within(dialog).getByRole('button', { name: SINGULAR_KEY }))

    // The label, with the model's own English as the source and the key that
    // names it (the dialog's description) — not the sentence, which is
    // already German.
    expect(dialog).toHaveAccessibleDescription(SINGULAR_KEY)
    expect(within(dialog).getByText('Probe Row')).toBeInTheDocument()
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
    expect(forTable).toHaveAccessibleDescription(PLURAL_KEY)
  })

  it('saves a model label like any other message, and the grid text follows', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)
    await screen.findByRole('button', { name: /Übersetzungen/ })
    await waitFor(() => expect(highlightedTexts()).toContain('Probe Rows'))

    await ui.keyboard('{Alt>}')
    await ui.click(screen.getByRole('heading', { name: 'Probe Rows' }))
    await ui.keyboard('{/Alt}')
    const dialog = await screen.findByRole('dialog', { name: 'Übersetzen' })
    await ui.type(within(dialog).getByRole('textbox', { name: 'Übersetzung' }), 'Sondenzeilen')
    await ui.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sondenzeilen' })).toBeInTheDocument())
    expect((await record('de-DE'))[PLURAL_KEY]).toBe('Sondenzeilen')
    await waitFor(() => expect(highlightedTexts()).toEqual([UNTRANSLATED, 'Probe Row']))
  })

  it('lists what is on the page in the panel, keys included, and opens the editor from it', async () => {
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)

    await ui.click(await screen.findByRole('button', { name: /Übersetzungen/ }))
    const panel = await screen.findByRole('dialog', { name: 'Übersetzungen' })

    // Filtered to this page: the untranslated sentence is there with its
    // "missing" badge, resolved through the reverse index, and the model label
    // sits in the same list with the key that names it.
    await ui.click(within(panel).getByRole('button', { name: 'Auf dieser Seite' }))
    const entry = await within(panel).findByRole('button', { name: new RegExp(UNTRANSLATED) })
    expect(within(entry).getByText('Fehlt')).toBeInTheDocument()
    const label = within(panel).getByRole('button', { name: /Probe Rows/ })
    expect(within(label).getByText(PLURAL_KEY)).toBeInTheDocument()

    await ui.click(entry)
    const editor = await screen.findByRole('dialog', { name: 'Übersetzen' })
    expect(within(editor).getByRole('textbox', { name: 'Übersetzung' })).toHaveValue('')
  })

  it('shows what discovery recorded in the panel, after the panel had already mounted', async () => {
    // The panel is MOUNTED as soon as translate mode is on, with the sheet
    // closed; the index it lists is re-read every time the sheet opens, so a
    // key discovered after the mount is there.
    setTranslateMode(true)
    await activateLocale(GERMAN)
    const ui = userEvent.setup()
    renderInApp(<Page />)
    await screen.findByRole('button', { name: /Übersetzungen/ })

    // Record one, the way the running app does: the key with its source into
    // the index, and an empty entry into the language.
    enableCollector()
    expect(translate(UNTRANSLATED)).toBe(UNTRANSLATED)
    await flush()
    disableCollector()
    expect((await record(SOURCE_LANGUAGE))[UNTRANSLATED]).toBe(UNTRANSLATED)
    expect((await record('de-DE'))[UNTRANSLATED]).toBe('')

    await ui.click(screen.getByRole('button', { name: /Übersetzungen/ }))
    const panel = await screen.findByRole('dialog', { name: 'Übersetzungen' })
    await ui.click(within(panel).getByRole('button', { name: 'Fehlt' }))

    expect(await within(panel).findByRole('button', { name: new RegExp(UNTRANSLATED) })).toBeInTheDocument()
  })

  it('renders nothing while the switch is off', async () => {
    // The permission gate itself cannot be asserted here: the run's identity
    // holds `admin`, and there is no second identity without it. What CAN be
    // asserted is that with the switch off the host renders nothing at all.
    renderInApp(<Page />)
    await waitFor(() => expect(screen.getByText(UNTRANSLATED)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Translations/ })).not.toBeInTheDocument()
    expect(document.querySelector(`[${MISSING_ATTRIBUTE}]`)).toBeNull()
  })
})
