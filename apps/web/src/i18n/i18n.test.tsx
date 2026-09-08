import { beforeEach, describe, expect, it } from 'vitest'
import { Trans } from '@lingui/react'
import { render, screen, waitFor } from '@/test/render'
import { render as renderWithoutProvider } from '@testing-library/react'
import { disableCollector } from '@/i18n/missing'
import {
  SOURCE_LANGUAGE,
  activateLocale,
  formattingLocale,
  i18n,
  translate,
  translatedKeys,
  useT,
} from '.'

/**
 * The translation runtime, in a real browser against the real `de-DE` catalog
 * that ships in `public/locales/`.
 *
 * Nothing here is a fixture: the German comes from the file the app loads, the
 * `<html lang>` assertions read the real document, and the language switch goes
 * through the same `activateLocale()` the account menu calls. `setup.browser.ts`
 * activates `en-US` before each file and resets to it afterwards, so a test that
 * switches does not leak into the next.
 */

const GERMAN = { language: 'de-DE', locale: 'de-DE' }
const SOURCE = { language: SOURCE_LANGUAGE, locale: SOURCE_LANGUAGE }

// This file renders probe strings — an unknown sentence, a malformed ICU
// pattern, a <Trans> id of its own — and none of them may be discovered into
// the shipped index. The real strings it also renders are in the index already.
beforeEach(() => {
  disableCollector()
})

function LogOutLabel() {
  const t = useT()
  return <span data-testid="label">{t('Log out')}</span>
}

describe('useT', () => {
  it('renders the source text as the key, with no provider in sight', async () => {
    // The point of the whole scheme: no message ids, and no I18nProvider needed
    // for a component that only calls t(). Deliberately RTL's bare render().
    renderWithoutProvider(<LogOutLabel />)

    expect(screen.getByTestId('label')).toHaveTextContent('Log out')
  })

  it('re-renders on a language switch, still with no provider', async () => {
    renderWithoutProvider(<LogOutLabel />)

    await activateLocale(GERMAN)

    // useSyncExternalStore on the singleton's `change` event: the component is
    // not inside any provider, and it still follows the switch.
    await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Abmelden'))
  })

  it('hands back a NEW function identity per language, so `t` works in a dep array', async () => {
    const before = i18n.locale
    let seen: unknown[] = []
    function Probe() {
      const t = useT()
      seen.push(t)
      return <span>{t('Log out')}</span>
    }
    seen = []
    renderWithoutProvider(<Probe />)
    const first = seen[0]

    await activateLocale(GERMAN)
    await waitFor(() => expect(seen.at(-1)).not.toBe(first))
    expect(before).toBe(SOURCE_LANGUAGE)
  })
})

describe('translate', () => {
  it('translates outside React', async () => {
    expect(translate('Log out')).toBe('Log out')

    await activateLocale(GERMAN)

    expect(translate('Log out')).toBe('Abmelden')
  })

  it('interpolates ICU placeholders', async () => {
    await activateLocale(GERMAN)

    expect(translate('Customer {id}', { id: '1002' })).toBe('Kunde 1002')
  })

  it('falls back to the source text for a message the catalog does not have', async () => {
    // A probe string, not a real message: it must not be discovered into the
    // shipped index.
    disableCollector()
    await activateLocale(GERMAN)

    // Every untranslated string renders in English rather than as a key or a
    // blank — the reason a missing translation is a degraded screen, not a bug.
    expect(translate('A message no catalog has ever seen')).toBe('A message no catalog has ever seen')
  })

  it('renders a message it cannot compile verbatim instead of throwing', async () => {
    // Catalog content is not all ours: an operator's file or a row typed into
    // the admin grid can hold a malformed ICU pattern. Lingui's own compiler
    // would console.error on every render; ours warns once and shows the text.
    const broken = '{count, plural, one {# row}'

    expect(() => translate(broken)).not.toThrow()
    expect(translate(broken)).toBe(broken)
  })
})

describe('<Trans>', () => {
  it('substitutes a NAMED tag with the element given for it', () => {
    // The mechanism P2's delete confirmation depends on: the translator sees
    // `<bold>` in the message and never touches markup, and the app decides
    // what `bold` renders as.
    const { container } = render(
      <Trans
        id="Delete <bold>{name}</bold>?"
        values={{ name: 'Orders' }}
        components={{ bold: <strong /> }}
      />,
    )

    expect(container.querySelector('strong')).toHaveTextContent('Orders')
    expect(container).toHaveTextContent('Delete Orders?')
  })

  it('lets a translation move the tag, which is why the tag is named', async () => {
    await activateLocale(GERMAN)
    // German puts the object first and the verb last, so a positional tag would
    // land on the wrong words. Loaded through Lingui's merging `load` — the same
    // single-key path translate-mode saves use — because a message that exists
    // only in a test must not enter the shipped catalog.
    i18n.load('de-DE', { 'Delete <bold>{name}</bold>?': '<bold>{name}</bold> löschen?' })

    const { container } = render(
      <Trans
        id="Delete <bold>{name}</bold>?"
        values={{ name: 'Aufträge' }}
        components={{ bold: <strong /> }}
      />,
    )

    expect(container.querySelector('strong')).toHaveTextContent('Aufträge')
    expect(container).toHaveTextContent('Aufträge löschen?')
  })
})

describe('activateLocale', () => {
  it('sets <html lang> and dir from the LANGUAGE', async () => {
    await activateLocale({ language: 'de-DE', locale: 'de-CH' })

    expect(document.documentElement.lang).toBe('de-DE')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('keeps the formatting locale out of Lingui', async () => {
    await activateLocale({ language: 'de-DE', locale: 'de-CH' })

    expect(formattingLocale()).toBe('de-CH')
    // `i18n.locales` is what Lingui feeds to Intl.PluralRules. Handing it the
    // formatting locale would let a Swiss-French formatting choice decide the
    // plural categories of German sentences.
    expect(i18n.locale).toBe('de-DE')
    expect(i18n.locales).toBeUndefined()
  })

  it('activates the source language with no catalog at all', async () => {
    await activateLocale(SOURCE)

    expect(i18n.locale).toBe(SOURCE_LANGUAGE)
    expect(translate('Log out')).toBe('Log out')
  })

  it('does not persist anything unless asked', async () => {
    await activateLocale(GERMAN)

    // Boot resolves and activates on every load; if that also saved, a cached
    // preference for a language only available after login would be replaced
    // with en-US before the user ever saw it.
    expect(localStorage.getItem('semantius-ui-language')).toBeNull()
    expect(localStorage.getItem('semantius-ui-locale')).toBeNull()
  })

  it('writes the cache keys when the switcher asks, and clears them on null', async () => {
    await activateLocale(GERMAN, { persist: { language: 'de-DE', locale: 'de-DE' } })

    expect(localStorage.getItem('semantius-ui-language')).toBe('de-DE')
    expect(localStorage.getItem('semantius-ui-locale')).toBe('de-DE')

    await activateLocale(SOURCE, { persist: { language: null } })

    // Only the field that was named: "use the browser default for the language"
    // must not silently discard an explicit formatting choice.
    expect(localStorage.getItem('semantius-ui-language')).toBeNull()
    expect(localStorage.getItem('semantius-ui-locale')).toBe('de-DE')
  })
})

describe('translatedKeys', () => {
  it('lists what the active language actually has', async () => {
    disableCollector()
    await activateLocale(GERMAN)

    const keys = translatedKeys('de-DE')
    expect(keys.has('Log out')).toBe(true)
    expect(keys.has('A message no catalog has ever seen')).toBe(false)
  })

  it('is empty for a language that is not active, rather than guessing', async () => {
    await activateLocale(SOURCE)

    expect(translatedKeys('de-DE').size).toBe(0)
  })
})
