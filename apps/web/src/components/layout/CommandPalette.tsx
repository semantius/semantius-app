import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { moduleLabels } from '@/contexts/AuthContext'
import { useT } from '@/i18n'
import { getApiConfig, createApiHeaders } from '@/lib/apiClient'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Skeleton } from '@/components/ui/skeleton'
// Forked from ui/command.tsx: the registry CommandDialog renders its sr-only
// <h2> title OUTSIDE the popup, so it lands in the page ahead of every route's
// <h1> and leaves the dialog unnamed. See the file for the full reasoning.
import { CommandDialog } from '@/components/ui-ext/command-dialog'

// Lets non-keyboard callers (e.g. the "Quick navigation" menu entry) open the
// palette without simulating a Ctrl/Cmd+K keystroke.
export const COMMAND_PALETTE_OPEN_EVENT = 'command-palette:open'
export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_PALETTE_OPEN_EVENT))
}

interface EntityRecord {
  table_name: string
  plural_label: string
  description: string
  module_id: number
}

interface ModuleRecord {
  id: number
  module_name: string
  description: string
  module_slug: string
  home_page: string
}

// Stale-while-revalidate cache for the catalog. The schema rarely changes, so
// it stays resident in memory for a day (gcTime) and is served instantly from
// cache, but is considered stale after 5 minutes — after which the next access
// (palette open, window focus, reconnect) triggers a background revalidation
// while the cached data keeps showing. Uses useQuery directly (not useTable) so
// we can override the app-wide defaults in main.tsx. Not gated on the palette
// being open: it prefetches once on mount (the AppLayout-mounted component lives
// for the whole session) so the palette is populated before the user opens it.
const FIVE_MINUTES = 1000 * 60 * 5
const ONE_DAY = 1000 * 60 * 60 * 24

function useCatalog<T>(key: string, path: string) {
  const { token } = useAuth()
  const { baseUrl: apiBaseUrl } = getApiConfig()

  return useQuery<T[], Error>({
    queryKey: ['command-palette', key],
    queryFn: async () => {
      const headers = createApiHeaders(token!)
      const response = await fetch(`${apiBaseUrl}/${path}`, { headers })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${key}: ${response.statusText}`)
      }
      return response.json()
    },
    enabled: !!token && !!apiBaseUrl,
    staleTime: FIVE_MINUTES,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

// --- Search scoring ---------------------------------------------------------
// cmdk's built-in filter is a subsequence scorer: it threads the query's letters
// through the haystack non-adjacently, so "roles" matches a CRM description via
// scattered r·o·l·e·s. We replace it with a hybrid over the combined
// title+description:
//   1. exact substring (anywhere) -> highest score, earlier hits rank first.
//   2. else fuzzy, but PER WORD: the best Dice-bigram similarity of the query
//      against any single token. Scoring per token (not against the whole blob)
//      preserves word locality — "role" no longer matches "Asset Contracts" by
//      borrowing "ol" from "pool" and "le" from "Lease" in different words.
function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

// Sørensen–Dice coefficient: 2·|A∩B| / (|A|+|B|), symmetric, range 0..1.
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let intersection = 0
  for (const g of A) if (B.has(g)) intersection++
  return (2 * intersection) / (A.size + B.size)
}

// 0.7 rather than 0.5: a short query has few bigrams, so a 2-of-3 overlap
// (e.g. "role" vs "whole", sharing "ol"+"le") clears a low gate. 0.7 effectively
// demands a near-complete bigram overlap — a real typo-level match like
// "roles"/"custmers" — without affecting exact-substring hits (which score 2).
const FUZZY_THRESHOLD = 0.7

function scoreMatch(value: string, search: string): number {
  const haystack = value.toLowerCase()
  const needle = search.toLowerCase().trim()
  if (!needle) return 1

  const idx = haystack.indexOf(needle)
  if (idx >= 0) {
    // Exact substring: rank above any fuzzy hit; earlier position ranks higher.
    return 2 - idx / haystack.length
  }

  if (needle.length < 3) return 0

  let best = 0
  for (const token of haystack.split(/[^a-z0-9]+/)) {
    if (token.length < 3) continue
    best = Math.max(best, diceSimilarity(needle, token))
  }
  return best >= FUZZY_THRESHOLD ? best : 0
}

// Build a module's landing URL from its slug + home_page.
// home_page is inconsistent in the data: "/" (module root), an absolute path
// that already includes the slug (e.g. "/admin/users"), or a bare page name.
function moduleUrl(slug: string, homePage: string) {
  const home = (homePage || '').trim()
  // Module root → just the slug.
  if (home === '' || home === '/') return `/${slug}`
  // Absolute path → use as-is (it already encodes the full route).
  if (home.startsWith('/')) return home
  // Bare page name → nest under the slug.
  return `/${slug}/${home}`
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const t = useT()

  const { data: entities, isLoading: entitiesLoading } = useCatalog<EntityRecord>(
    'entities',
    'entities?select=table_name,plural_label,description,module_id&order=plural_label.asc',
  )
  const { data: modules, isLoading: modulesLoading } = useCatalog<ModuleRecord>(
    'modules',
    'modules?select=id,module_name,description,module_slug,home_page&order=module_name.asc',
  )

  // isLoading is true only on the first fetch (no cached data yet). Background
  // revalidations of stale data keep showing the cache, so no skeleton flash.
  const isLoading = entitiesLoading || modulesLoading

  // Map module_id -> module_slug so an entity's URL can use its module's slug.
  const moduleSlugById = useMemo(() => {
    const map = new Map<number, string>()
    for (const m of modules ?? []) map.set(m.id, m.module_slug)
    return map
  }, [modules])

  // Global Cmd+K / Ctrl+K shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onOpen = () => setOpen(true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    }
  }, [])

  const go = (to: string) => {
    setOpen(false)
    navigate({ to, search: {} })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      // Re-center vertically: the base CommandDialog hardcodes top-1/3, which
      // pushes a tall list off-center. Override to true centering.
      className="top-1/2 -translate-y-1/2"
    >
      {/* Substring-first + bigram-coverage fuzzy match over the combined
          title+description (see scoreMatch). */}
      <Command filter={scoreMatch}>
        <CommandInput placeholder={t('Search apps and modules...')} />
        <CommandList className="max-h-[60vh]">
          {isLoading ? (
            // Loading skeleton — shown only before the first fetch resolves.
            <div className="space-y-1 p-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5 px-2 py-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          ) : (
          <>
          <CommandEmpty>{t('No results found.')}</CommandEmpty>

          <CommandGroup heading={t('Apps')}>
            {entities?.map((entity) => {
              const slug = moduleSlugById.get(entity.module_id)
              // Skip entities whose module isn't loaded/known — we can't build a URL.
              if (!slug) return null
              // The palette lists entities and modules straight from the model
              // tables, so like the sidebar it renders its own labels as
              // messages keyed by their model path.
              const label = t({
                id: ['module', slug, entity.table_name, 'entity', 'plural_label'],
                defaultMessage: entity.plural_label,
              })
              const description = entity.description
                ? t({ id: ['module', slug, entity.table_name, 'entity', 'description'], defaultMessage: entity.description })
                : ''
              return (
                <CommandItem
                  key={`entity-${entity.module_id}-${entity.table_name}`}
                  className="cursor-pointer"
                  // The search value keeps the ENGLISH label alongside the
                  // translated one: a user who knows the table by its model name
                  // (or types the identifier) must still find it.
                  value={`${label} ${entity.plural_label} ${description} ${entity.table_name}`}
                  onSelect={() => go(`/${slug}/${entity.table_name}`)}
                >
                  <div className="flex flex-col">
                    <span>{label}</span>
                    {!!description && (
                      <span className="text-xs text-muted-foreground">
                        {description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t('Modules')}>
            {modules?.map((module) => {
              const labels = moduleLabels(t, module)
              const name = labels.name || module.module_name
              const description = labels.description ?? ''
              return (
                <CommandItem
                  key={`module-${module.id}`}
                  className="cursor-pointer"
                  value={`${name} ${module.module_name} ${description} ${module.module_slug}`}
                  onSelect={() => go(moduleUrl(module.module_slug, module.home_page))}
                >
                  <div className="flex flex-col">
                    <span>{name}</span>
                    {!!description && (
                      <span className="text-xs text-muted-foreground">
                        {description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
          </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
