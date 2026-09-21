import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootApp } from '@/test/appHarness'
import { MODULE_ROOT, SOURCE_LANGUAGE, type MetadataId, messageId, metadataText, resetSourceIndex, translationsUrl } from '@/i18n'
import { disableCollector, enableCollector, flush } from '@/i18n/missing'

/**
 * Discovery's one non-render signal: a model attribute that is EMPTY now.
 *
 * Everything else discovery does is driven by the app painting a string, and
 * an attribute that has been cleared paints nothing — so without this the key
 * would sit in `en-US.json` forever with a translation under it in every
 * language, and no amount of running the app could ever notice. The chain runs
 * for real against the dev server's endpoint, the same one `pnpm dev` answers:
 * the model goes blank, the index entry goes, and the languages follow.
 *
 * The probe keys are `_vitest_` fields no model has, and the second test cleans
 * up after itself — the first is the cleanup, which is the thing under test.
 */

const ID: MetadataId = [MODULE_ROOT, 'admin', 'users', 'field', '_vitest_note', 'description']
const KEY = messageId({ id: ID, defaultMessage: '' })

const UNFILLED: MetadataId = [MODULE_ROOT, 'admin', 'users', 'field', '_vitest_never_set', 'description']
const UNFILLED_KEY = messageId({ id: UNFILLED, defaultMessage: '' })

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

beforeEach(async () => {
  await bootApp()
  // The setup enables the collector for every test; these drive it by hand.
  disableCollector()
  resetSourceIndex()
})

afterEach(async () => {
  await write(SOURCE_LANGUAGE, KEY, '')
  await write(SOURCE_LANGUAGE, UNFILLED_KEY, '')
  await write('de-DE', KEY, '')
  await write('de-DE', UNFILLED_KEY, '')
  resetSourceIndex()
})

describe('a model attribute that has been cleared', () => {
  it('leaves the index, and takes every language with it', async () => {
    await write(SOURCE_LANGUAGE, KEY, 'A description somebody generated and regretted')
    await write('de-DE', KEY, 'Eine generierte Beschreibung')
    expect((await record(SOURCE_LANGUAGE))[KEY]).toBeTruthy()
    expect((await record('de-DE'))[KEY]).toBeTruthy()

    enableCollector()
    // What the model now answers for that field. Nothing renders.
    expect(metadataText(ID, '')).toBe('')
    await flush()
    disableCollector()

    expect((await record(SOURCE_LANGUAGE))[KEY]).toBeUndefined()
    expect((await record('de-DE'))[KEY]).toBeUndefined()
  })

  it('writes nothing for an attribute that was never filled', async () => {
    // The common case by far: most fields have no description and never did.
    // A request per empty attribute per page would be the cost of getting this
    // wrong, so the collector checks the index before it sends anything.
    enableCollector()
    expect(metadataText(UNFILLED, undefined)).toBeUndefined()
    await flush()
    disableCollector()

    expect((await record(SOURCE_LANGUAGE))[UNFILLED_KEY]).toBeUndefined()
    expect((await record('de-DE'))[UNFILLED_KEY]).toBeUndefined()
  })

  it('is outvoted by a real render of the same key in the same batch', async () => {
    await write(SOURCE_LANGUAGE, KEY, 'The old wording')
    resetSourceIndex()

    enableCollector()
    // A cleared report first, then the text: one entity's schema can be walked
    // before another supplies the same key, and absence must never win.
    metadataText(ID, '')
    expect(metadataText(ID, 'The new wording')).toBe('The new wording')
    await flush()
    disableCollector()

    expect((await record(SOURCE_LANGUAGE))[KEY]).toBe('The new wording')
  })
})
