"use client"

import {
  ChevronsUpDown,
  LogOut,
} from "lucide-react"
import { Link, useRouter } from '@tanstack/react-router'
import { useTable } from '@/hooks/useTable'
import { useAuth } from '@/hooks/useAuth'
import { getConfig } from '@/lib/config'
import { resolveMenuTarget, type UserMenuEntry } from '@/lib/userMenu'
import {
  activateLocale,
  availableLocales,
  languageDisplayName,
  resolveInitialLocale,
  resolvePlaceholderLocale,
  SAVE_PREFERENCES_RPC,
  savePreferencesParams,
  isPreferenceRpcAbsent,
  setSessionPreference,
  type SavePreferencesParams,
  useFormattingLocale,
  useLanguage,
  useT,
} from '@/i18n'
import { useRpcMutation } from '@/hooks/useRpc'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

/**
 * The radio value standing for "no saved language — follow the browser (or the
 * operator's default)". Not a language code: `browser-default` is not a
 * well-formed BCP-47 tag, so it can never collide with a real one.
 */
const BROWSER_DEFAULT = 'browser-default'

/**
 * Turned off for the rest of the session by a definitive "no such function".
 *
 * Module state rather than component state because the menu unmounts every time
 * it closes, and re-asking a platform that has already said no — once per
 * language switch, forever — is a request whose answer is known.
 */
let sessionWriteBackAvailable = true

// Utility function to generate user initials
function getUserInitials(name?: string): string {
  if (!name) return 'U'
  
  const nameParts = name.trim().split(' ')
  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase()
  }
  
  return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const t = useT()
  const userInitials = getUserInitials(user.name)

  // Account/admin entries are configuration, not code: VITE_BACKEND_TYPE picks a
  // built-in menu and VITE_UI_CUSTOMIZER can replace it (see lib/userMenu.ts).
  // URLs are already concrete here — {orgid} was substituted at initConfig time.
  const { rpcUserInfo } = useAuth()
  const userPermissions = (rpcUserInfo?.permissions as string[] | undefined) ?? []
  // rpcUserInfo is null until /rpc/get_userinfo resolves, so permission-gated
  // entries stay hidden until then — the same behavior as module gating.
  const menuEntries = getConfig().uiCustomizer.user.menu.filter(
    (entry) => !entry.permission || userPermissions.includes(entry.permission)
  )

  // Show the "Manage Favorites" entry only when the user actually has favorites.
  // Reuse NavBookmarks' exact query string so react-query serves both from one
  // cached fetch (query key is ['table', tableName, query, count]).
  const { data: bookmarks } = useTable('user_bookmarks', {
    query: 'select=id,title,url&order=row_order.asc',
  })
  const hasFavorites = (bookmarks?.length ?? 0) > 0

  // Only the in-app case is scripted. A `redirect` or `newtab` entry leaves the
  // SPA, and leaving the SPA is what an anchor is for: the browser handles the
  // navigation, middle-click and "open in new tab" work, assistive technology
  // announces a link instead of a button, and the behavior is expressed in the
  // DOM where a test can read it rather than in a call a test can only observe
  // by replacing `window.location`.
  const pushInApp = (entry: UserMenuEntry) => {
    // history.push, not navigate({ search }): these are pre-built URLs with a
    // query string, and TanStack's search serializer JSON-encodes values that
    // parse as JSON (an org slug like "1002" would become %221002%22).
    router.history.push(entry.url)
  }

  // ── Language and formatting ───────────────────────────────────────────────
  //
  // Two preferences, two submenus. `language` picks the catalog; `locale` drives
  // every Intl call. The switcher is the ONLY thing that persists either — boot
  // resolves and activates without saving, so a preference for a language that
  // only becomes available after login survives the pre-login pass.
  const language = useLanguage()
  const formattingLocale = useFormattingLocale()
  const locales = availableLocales()
  // What choosing "Browser default" would give. It has to be resolved with the
  // saved preference ignored, because once something IS saved the ordinary
  // resolution answers with that instead.
  const placeholder = resolvePlaceholderLocale()
  const followsLanguage = formattingLocale === language
  const savePreferences = useRpcMutation<unknown, SavePreferencesParams>(SAVE_PREFERENCES_RPC)

  /**
   * Activate a choice and re-run every route's `head()`.
   *
   * `router.invalidate()` and never `location.reload()`: the title of the page
   * comes from the matched route's `head()`, which only re-runs when the router
   * invalidates, and a reload would throw away the whole session's client state
   * to change a string.
   */
  const apply = (next: Parameters<typeof activateLocale>[0], persist: Parameters<typeof activateLocale>[1]) => {
    void activateLocale(next, persist).then(() => router.invalidate())
    savePreference(persist?.persist)
  }

  /**
   * Save the choice to the SESSION as well as the cache, so it follows the
   * person to their next device.
   *
   * The platform may not have the RPC yet, and asking whether it does is not
   * worth a round trip: a definitive PGRST202 ("no such function") turns the
   * write-back off for the rest of the session and the cache carries the choice
   * on its own, which is exactly what P1 shipped with. Any other failure is
   * silent by design — the language HAS changed, and a toast saying the
   * preference did not sync would be noise the user can do nothing about.
   */
  const savePreference = (persist: { language?: string | null; locale?: string | null } | undefined) => {
    if (!persist) return
    setSessionPreference(persist)
    if (!sessionWriteBackAvailable) return
    savePreferences.mutate(savePreferencesParams(persist), {
      onError: (error: Error) => {
        if (isPreferenceRpcAbsent(error)) sessionWriteBackAvailable = false
      },
    })
  }

  const chooseLanguage = (value: string) => {
    const nextLanguage = value === BROWSER_DEFAULT ? placeholder.language : value
    // "Same as language" follows the language; a formatting locale of its own
    // does not, so its key is left untouched (an omitted field, not a null).
    apply(
      { language: nextLanguage, locale: followsLanguage ? nextLanguage : formattingLocale },
      {
        persist: {
          language: value === BROWSER_DEFAULT ? null : value,
          locale: followsLanguage ? nextLanguage : undefined,
        },
      },
    )
  }

  const chooseFormat = (value: string) => {
    const nextLocale = value === BROWSER_DEFAULT ? placeholder.locale : language
    apply({ language, locale: nextLocale }, { persist: { locale: value === BROWSER_DEFAULT ? null : language } })
  }

  // Only `session` and `cache` are preferences; everything else is a
  // placeholder, so the "Browser default" entry is the one that carries the
  // checkmark until the user makes an explicit choice.
  const languageSource = resolveInitialLocale().languageSource
  const languageIsSaved = languageSource === 'session' || languageSource === 'cache'
  const placeholderName = languageDisplayName(placeholder.language)
  const browserLanguageLabel =
    placeholder.languageSource === 'operator'
      ? t('Default ({language})', { language: placeholderName })
      : t('Browser default ({language})', { language: placeholderName })

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {menuEntries.map((entry, index) => {
                // Keyed by position and url rather than by title: a built-in
                // title is a MessageDescriptor, and a rendered one changes with
                // the language, which would remount every item on a switch.
                const key = `${index}:${entry.url}`
                const title = t(entry.title)
                const target = resolveMenuTarget(entry)

                if (target === 'newtab') {
                  // noopener also implies noreferrer in modern browsers, but both
                  // are spelled out — the opened page must never reach back via
                  // window.opener.
                  return (
                    <DropdownMenuItem
                      key={key}
                      render={
                        // The anchor's content comes from DropdownMenuItem's
                        // children: Base UI's `render` prop merges them into the
                        // element it renders. anchor-has-content reads the JSX
                        // literally, sees an `<a />` with no children of its own,
                        // and cannot follow that — the accessible name is
                        // asserted in NavUser.test.tsx instead.
                        // eslint-disable-next-line jsx-a11y/anchor-has-content
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" />
                      }
                    >
                      {title}
                    </DropdownMenuItem>
                  )
                }

                if (target === 'redirect') {
                  // A document navigation, same tab: an absolute URL, or a
                  // same-origin path another server answers (`/idp/*` is proxied
                  // to the IdP, and the router's catch-all would otherwise
                  // swallow it). Deliberately a plain <a>, not a <Link>.
                  return (
                    <DropdownMenuItem
                      key={key}
                      render={
                        // Content comes from the children, via `render` — see above.
                        // eslint-disable-next-line jsx-a11y/anchor-has-content
                        <a href={entry.url} />
                      }
                    >
                      {title}
                    </DropdownMenuItem>
                  )
                }

                // Base UI's Menu.Item has no onSelect — that prop silently binds
                // to the native text-selection event and never fires on click.
                return (
                  <DropdownMenuItem key={key} onClick={() => pushInApp(entry)}>
                    {title}
                  </DropdownMenuItem>
                )
              })}
              {hasFavorites && (
                <DropdownMenuItem
                  render={
                    <Link
                      to="/$moduleId/$table_name"
                      params={{ moduleId: 'admin', table_name: 'user_bookmarks' }}
                    />
                  }
                >
                  {t('Manage Favorites')}
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('Language')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={languageIsSaved ? language : BROWSER_DEFAULT}
                  onValueChange={(value) => value && chooseLanguage(value)}
                >
                  <DropdownMenuRadioItem value={BROWSER_DEFAULT}>{browserLanguageLabel}</DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  {locales.map((locale) => (
                    <DropdownMenuRadioItem key={locale.code} value={locale.code}>
                      {locale.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('Number and date format')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {/*
                  The two cases that occur in practice. "Same as language" is
                  stored as the concrete tag, so it is checked exactly when the
                  formatting locale IS the language — which is also what makes
                  it follow a language change.
                */}
                <DropdownMenuRadioGroup
                  value={followsLanguage ? 'language' : BROWSER_DEFAULT}
                  onValueChange={(value) => value && chooseFormat(value)}
                >
                  <DropdownMenuRadioItem value={BROWSER_DEFAULT}>
                    {t('Browser default ({locale})', { locale: placeholder.locale })}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="language">
                    {t('Same as language ({locale})', { locale: language })}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            {/*
              A plain <a>, not a TanStack <Link>: `/logout` is an in-app route,
              so a <Link> would push it into the SPA and leave AuthProviderWrapper
              and the QueryClient mounted while logout.tsx wipes storage. The
              document load is the behavior this has always had, and the one that
              guarantees nothing survives the sign-out.
            */}
            {/* Content comes from the children, via `render` — see above. */}
            {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
            <DropdownMenuItem render={<a href="/logout" />}>
              <LogOut />
              {t('Log out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
