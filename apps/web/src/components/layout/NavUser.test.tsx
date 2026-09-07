import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { NavUser } from './NavUser'
import { SidebarProvider } from '@/components/ui/sidebar'
import { bootApp, renderInApp } from '@/test/appHarness'
import type { UserMenuEntry } from '@/lib/userMenu'
import {
  LANGUAGE_CACHE_KEY,
  LOCALE_CACHE_KEY,
  MARK_MISSING_KEY,
  activateLocale,
  clearSessionPreference,
  i18n,
  resolveInitialLocale,
  translateModeFlags,
} from '@/i18n'

/**
 * The configuration-driven account menu, configured the way a deployment
 * configures it and rendered by the app's own router.
 *
 * WHAT CHANGED AND WHY. The file mocked four modules: `@tanstack/react-router`
 * (a fake `Link` and a `history.push` spy), `@/hooks/useAuth`, `@/hooks/useTable`
 * and `@/lib/config` — the last one supplying the very menu under test. So the
 * thing being asserted was that `NavUser` renders a list handed to it by the
 * test, through a router written by the test.
 *
 * None of that was necessary. The menu is `VITE_UI_CUSTOMIZER`, a real runtime
 * variable that `initConfig()` parses (`lib/userMenu.ts`) — so the test sets the
 * variable and the real resolution runs. The permissions come from the tenant's
 * own `rpc/get_userinfo` for the signed-in identity. The router is a real one
 * whose real history says where a click went.
 *
 * PERMISSIONS ARE REAL, SO THE GATES ARE TOO. The test identity holds `admin`
 * and not `no-such-permission`; both entries below are gated on a permission
 * that genuinely is or is not in `rpcUserInfo.permissions`.
 *
 * Nothing here replaces `window.location`, `window.open` or `matchMedia`, and
 * nothing disables userEvent's pointer-events check. The three menu targets are
 * expressed in the DOM:
 *
 *   target: newtab   -> <a href target="_blank" rel="noopener noreferrer">
 *   target: redirect -> <a href>
 *   in-app           -> a menu item that calls router.history.push
 *
 * The first two are asserted by reading attributes off a link, and must NOT be
 * clicked: following a link is the browser's job, and a real browser would
 * navigate the test frame away.
 */

const HELD = 'admin'
const NOT_HELD = 'no-such-permission'

const MENU: UserMenuEntry[] = [
  { title: 'Settings', url: '/settings?orgid=acme' },
  { title: 'Account', url: '/idp/account', target: 'redirect' },
  { title: 'Docs', url: '/docs', target: 'newtab' },
  { title: 'Platform', url: 'https://app.semantius.com/settings/organization', permission: HELD },
  { title: 'Hidden', url: '/hidden', permission: NOT_HELD },
]

const USER = { name: 'Wei Chen', email: 'admin@test.com', avatar: '' }

/** Open the avatar popover; returns the click helper and the real router. */
async function openMenu() {
  const ui = userEvent.setup()
  const { router } = renderInApp(
    <SidebarProvider>
      <NavUser user={USER} />
    </SidebarProvider>,
  )
  // RouterProvider mounts its matches asynchronously, so the trigger is not
  // there on the first tick.
  const trigger = await waitFor(() => screen.getByRole('button', { name: /Wei Chen/i }))
  await ui.click(trigger)
  // The popup mounts in a portal a tick after the click.
  await waitFor(() => expect(screen.getByText('Log out')).toBeInTheDocument())
  return { ui, router }
}

describe('NavUser — configuration-driven menu', () => {
  beforeEach(async () => {
    // The real configuration channel: VITE_UI_CUSTOMIZER is a JSON string that
    // initConfig() deserializes and resolves ({orgid} substitution, target
    // resolution) before anything renders.
    await bootApp({
      VITE_BACKEND_TYPE: 'custom',
      VITE_UI_CUSTOMIZER: JSON.stringify({ user: { menu: MENU } }),
    })
  })

  it('hides an entry gated on a permission this user does not hold', async () => {
    await openMenu()

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('shows an entry gated on a permission this user does hold', async () => {
    await openMenu()

    // rpcUserInfo is null until /rpc/get_userinfo resolves, so gated entries
    // appear only once the real answer is in — the same behavior as module
    // gating, and the reason this one waits.
    await waitFor(() => expect(screen.getByText('Platform')).toBeInTheDocument(), {
      timeout: 20000,
    })
  })

  it('pushes the exact configured URL for an in-app entry', async () => {
    const { ui, router } = await openMenu()

    await ui.click(screen.getByText('Settings'))

    // Read off the router's real history. Verbatim — the query string must
    // survive, un-re-encoded.
    expect(router.history.location.href).toBe('/settings?orgid=acme')
  })

  it('renders target: redirect as a link, so the browser leaves the SPA', async () => {
    const { router } = await openMenu()

    // /idp is proxied to another server: a router push would match the SPA's
    // catch-all module route and 404 until the user hit refresh. A link is a
    // document navigation by construction — there is no push to suppress.
    const account = screen.getByRole('menuitem', { name: 'Account' })
    expect(account).toHaveAttribute('href', '/idp/account')
    expect(account.tagName).toBe('A')
    expect(account).not.toHaveAttribute('target')
    expect(router.history.location.href).toBe('/')
  })

  it('renders target: newtab as a link that cannot reach back through window.opener', async () => {
    await openMenu()

    const docs = screen.getByRole('menuitem', { name: 'Docs' })
    expect(docs).toHaveAttribute('href', '/docs')
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders an in-app entry as a menu item, not a link', async () => {
    await openMenu()

    // The counterpart to the two above: `Settings` is relative and carries no
    // target, so it must NOT become an anchor — an href would take the browser
    // out of the SPA on a route the router owns.
    expect(screen.getByRole('menuitem', { name: 'Settings' })).not.toHaveAttribute('href')
  })

  it('offers Log out as a link to /logout, below the configured entries', async () => {
    await openMenu()

    // A document load, so nothing survives the sign-out.
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveAttribute('href', '/logout')
  })
})

/**
 * The language switcher, driven the way a keyboard user drives it.
 *
 * The German comes from `src/locales/de-DE.json`, the file the app ships and
 * loads; the cache keys are the real `localStorage` ones; `<html lang>` is read
 * off the real document. Nothing is activated by hand except to simulate the
 * NEXT boot, which is the one thing an interaction cannot do.
 *
 * WHY THE KEYBOARD. userEvent moves its pointer in a single jump, so entering a
 * submenu takes the pointer straight out of the trigger — and Base UI closes the
 * submenu on that, because its safe-polygon hover logic needs the intermediate
 * positions only a real mouse produces. The panel then sits in the DOM carrying
 * `data-closed` with `pointer-events: none` on its positioner, and the next click
 * fails with "element has pointer-events: none", which reads like a CSS bug and
 * is really a closed menu. Typeahead + ArrowRight + Enter is what a keyboard user
 * does anyway, so this is coverage rather than a workaround — and it is the
 * interaction the pointer path cannot substitute for.
 *
 * `setup.browser.ts` clears both cache keys and re-activates `en-US` after every
 * test, so a switch does not leak into the next file.
 */
describe('NavUser — the language switcher', () => {
  beforeEach(async () => {
    await bootApp({
      VITE_BACKEND_TYPE: 'custom',
      VITE_UI_CUSTOMIZER: JSON.stringify({ user: { menu: MENU } }),
    })
  })

  /**
   * Typeahead to the submenu whose label starts with `prefix`, then open it.
   *
   * A prefix rather than the whole label: a space would be read as "activate the
   * highlighted item" instead of as another character to search for.
   */
  async function openSubmenu(ui: ReturnType<typeof userEvent.setup>, prefix: string) {
    await ui.keyboard(prefix)
    await ui.keyboard('{ArrowRight}')
  }

  /** Typeahead to a radio entry inside the open submenu and choose it. */
  async function chooseEntry(ui: ReturnType<typeof userEvent.setup>, prefix: string) {
    await ui.keyboard(prefix)
    await ui.keyboard('{Enter}')
  }

  it('checks "Browser default" while nothing has been chosen', async () => {
    const { ui } = await openMenu()

    await openSubmenu(ui, 'Language')

    // Not a preference — a placeholder. The entry names what the browser would
    // give, and carries the checkmark until the user picks something.
    const browserDefault = await screen.findByRole('menuitemradio', { name: /^Browser default \(/ })
    expect(browserDefault).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBeNull()
  })

  it('lists every shipped language by its own name for itself', async () => {
    const { ui } = await openMenu()

    await openSubmenu(ui, 'Language')

    // "Deutsch", not "German" and not "Deutsch (Deutschland)": the switcher
    // names a language the way that language names itself, and the region is
    // noise in a list of languages.
    expect(await screen.findByRole('menuitemradio', { name: 'Deutsch' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toBeInTheDocument()
  })

  it('switches the whole menu to German and marks the document', async () => {
    const { ui } = await openMenu()
    await openSubmenu(ui, 'Language')

    await chooseEntry(ui, 'Deutsch')

    // The catalog really loaded: "Log out" is the entry the menu ends with.
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Abmelden' })).toBeInTheDocument())
    expect(document.documentElement.lang).toBe('de-DE')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('saves both preferences, because the format was following the language', async () => {
    const { ui } = await openMenu()
    await openSubmenu(ui, 'Language')

    await chooseEntry(ui, 'Deutsch')

    await waitFor(() => expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBe('de-DE'))
    // "Same as language" was in effect, so it follows: a user who never touched
    // the format submenu keeps getting formats that match the language.
    expect(localStorage.getItem(LOCALE_CACHE_KEY)).toBe('de-DE')
  })

  it('boots into German from the cached keys alone', async () => {
    const { ui } = await openMenu()
    await openSubmenu(ui, 'Language')
    await chooseEntry(ui, 'Deutsch')
    await waitFor(() => expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBe('de-DE'))

    // What main.tsx does on the next load, with nothing else carried over. The
    // switcher also mirrors the choice into the SESSION preference — which it
    // has to, or a stale `get_userinfo` value would outrank the fresh choice —
    // and that is module state a reload discards, so discard it here too.
    // Without this the assertion below reads `session`, which is the switcher
    // being remembered rather than the cache being read.
    clearSessionPreference()
    await activateLocale({ language: 'en-US', locale: 'en-US' })
    expect(i18n.locale).toBe('en-US')

    const resolved = resolveInitialLocale()
    await activateLocale(resolved)

    expect(resolved).toMatchObject({ language: 'de-DE', languageSource: 'cache', localeSource: 'cache' })
    expect(i18n.locale).toBe('de-DE')
  })

  it('offers the format as its own preference, following the language by default', async () => {
    const { ui } = await openMenu()

    await openSubmenu(ui, 'Number')

    const sameAsLanguage = await screen.findByRole('menuitemradio', { name: /^Same as language \(/ })
    expect(sameAsLanguage).toHaveAttribute('aria-checked', 'true')
    // The browser entry names the real navigator.language, not a stubbed one.
    expect(
      screen.getByRole('menuitemradio', { name: `Browser default (${navigator.language})` }),
    ).toBeInTheDocument()
  })

  it('clears the format preference on its own, leaving the language alone', async () => {
    const { ui } = await openMenu()
    await openSubmenu(ui, 'Language')
    await chooseEntry(ui, 'Deutsch')
    await waitFor(() => expect(localStorage.getItem(LOCALE_CACHE_KEY)).toBe('de-DE'))

    // Back out to the parent menu, whose entries are themselves German by now —
    // which is how this also proves the switch reached the menu's own chrome.
    await ui.keyboard('{ArrowLeft}')
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Zahlen- und Datumsformat' })).toBeInTheDocument(),
    )
    await openSubmenu(ui, 'Zahlen')
    // Wait for an entry that exists ONLY in the format submenu before the
    // typeahead below. Both submenus carry a "Browserstandard …" entry, so on a
    // loaded machine a submenu that has not opened yet sends the next keystrokes
    // to the LANGUAGE list, which chooses its browser default instead — the
    // language becomes en-US and the assertion reads a stale-looking locale.
    await screen.findByRole('menuitemradio', { name: /^Wie die Sprache/ })
    await chooseEntry(ui, 'Browserstandard')

    await waitFor(() => expect(localStorage.getItem(LOCALE_CACHE_KEY)).toBeNull())
    // The two preferences are separate: dropping the format must not drop the
    // language with it.
    expect(localStorage.getItem(LANGUAGE_CACHE_KEY)).toBe('de-DE')
  })

  it('offers the translate-mode switches to a user who may translate, and remembers the choice', async () => {
    const { ui } = await openMenu()
    await openSubmenu(ui, 'Language')

    // Gated on the real permissions: the run's identity holds `admin`, which
    // stands in for `translations.edit` until the platform migration lands.
    // rpcUserInfo arrives asynchronously, so the switches do too.
    const mark = await screen.findByRole('menuitemcheckbox', { name: 'Mark missing translations' })
    expect(mark).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Translate mode' })).toBeInTheDocument()

    await chooseEntry(ui, 'Mark')

    await waitFor(() => expect(translateModeFlags().marking).toBe(true))
    // Per browser, so a translator who reloads keeps the marks.
    expect(localStorage.getItem(MARK_MISSING_KEY)).toBe('1')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Mark missing translations' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
