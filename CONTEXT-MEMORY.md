# Project Context

> **Agent-maintained file.** Update only when you discover something a future session would otherwise get wrong — non-obvious platform constraints, architectural patterns, or environmental quirks. Do not use it as a change log. Integrate knowledge into the relevant section; do not append to a log.

## Working Agreements (stated human preferences — persist across sessions)

- **Memory belongs in this repo, never in an out-of-repo agent memory store.** Do NOT write
  to `~/.claude/projects/*/memory/` or a `MEMORY.md` there. Anything worth keeping across
  sessions goes in **`CONTEXT-MEMORY.md`** (committed, shared, reviewable) or as a comment in
  the relevant source file. Memory the team cannot see in the repo is worthless — invisible on
  every other machine and in every review.
- **Never cite git authorship to attribute code to the human.** Agents work in the human's
  local checkout and commit under their git identity, so the author/committer fields say
  nothing about who wrote a line — much of this repo is agent-written. When existing code is
  criticized, do not investigate or argue provenance; acknowledge the problem and fix it.

## Tech Stack (`apps/web`)

| Layer       | Technology                                          |
| ----------- | --------------------------------------------------- |
| Framework   | React 19                                            |
| Language    | TypeScript 5.9                                      |
| Build / Dev | Vite 7                                              |
| Styling     | Tailwind CSS 4                                      |
| Components  | shadcn/ui on **Base UI** (`@base-ui/react`) + CVA + `cn()`  |
| Routing     | TanStack Router (file-based)                        |
| Data        | TanStack Query + PostgREST                          |
| Auth        | react-oauth2-code-pkce (OAuth2/OIDC PKCE)           |
| Testing     | Vitest + React Testing Library                      |
| Linting     | ESLint 9                                            |

Path alias: `@` → `apps/web/src` (configured in `vite.config.ts` and `tsconfig.json`).

## Architecture Decisions

### Auth Routing

- `/login` — always calls `logIn(redirectTarget)` on mount (clears stale state, redirects to OAuth). Passes the `?redirect=` search param as OAuth `state` so it survives the round-trip. Renders nothing (the boot overlay covers the redirect) **unless `useAuth().error` is set** — a login that fails to start has no other surface, see the hang invariant below.
- `/oauth2_callback` — the OAuth `redirectUri` (hardcoded to `${origin}/oauth2_callback` — no env var). Detects an active callback via `hadOAuthCode` (frozen at mount via `useState(() => new URLSearchParams(window.location.search).has('code'))`). After token exchange, reads the redirect target from `localStorage.getItem('ROCP_auth_state')` and navigates there. **Do NOT use `loginInProgress` here** — the library clears it before the token exchange completes.
- `/_app` (`beforeLoad`) — redirects to `/login` if not authenticated; does NOT check `loginInProgress`.
- **`loginInProgress`** is stored in **localStorage** (library default) — persists across tabs and sessions. It is cleared by the library *before* the token exchange completes, so it is **not a reliable indicator** in `/oauth2_callback`. Stale state is harmless: `/login` always calls `logIn()` which resets it via `clearStorage()`.
- **Must register `/oauth2_callback` as allowed redirect URI** in your OAuth provider (Auth0, Keycloak, etc.).
- **`useLayoutEffect` for `router.update()`** — `RouterContextUpdater` uses `useLayoutEffect` (not `useEffect`) to call `router.update()`. Layout effects run synchronously before paint and before any passive effects, ensuring the router context is always up-to-date before navigation fires. Using `useEffect` causes a race condition where the callback's navigate fires before `isAuthenticated: true` is visible to `_app.tsx` `beforeLoad`.

### Boot Loading Overlay — the hang invariant

`index.html` ships a static `<div id="app-loader">` that **only application code can
dismiss**, via `hideAppLoader()` (`lib/appLoader.ts`). Nothing removes it on its own —
not a redirect that never happens, not a component that renders nothing.

> **Invariant:** every path that stops making progress — success, failure, or waiting on
> a human — must call `hideAppLoader()`. A component that reaches a terminal `return null`
> without one is a **hang**, not an error: the user sees an infinite spinner and the app
> has no way to say what went wrong.

Enforced by `src/test/appLoaderInvariant.test.ts`, which fails any route module with a
top-level `return null` and no `hideAppLoader` path. This is why a route that only ever
returns `null` while a redirect is in flight still needs a failure branch.

**`hideAppLoader()` is not synchronous.** It drops `pointer-events` and `opacity` on the
spot (so the real UI is usable immediately) but sets the terminal `hidden` attribute only
on `transitionend`, with a 300ms timer as the fallback for reduced-motion, hidden tabs and
**jsdom, which never fires `transitionend`**. A test that asserts `[hidden]` right after
render will fail; assert the fade started, then `await waitFor(...)` for `hidden`. It is
idempotent by a `data-hiding` marker — render-phase call sites and StrictMode double
effects both re-enter it.

**Skeletons use `--skeleton`, never `--muted`.** `--muted` is `oklch(0.97)`, which against
the white `--background` is a **1.09:1** contrast ratio — 1.04:1 at the `animate-pulse`
trough, and 1.045:1 against the sidebar. That is below what a typical display resolves, so
a full-screen skeleton in that tone renders as a **blank white page** (it was reported
exactly that way: "blank screen, no loading circle, no skeleton loader at all"). Judge a
loading state by measuring contrast, not by looking at a screenshot you already know the
answer to. `--skeleton` (`global.css`) lifts this to 1.39:1 light / 1.50:1 dark.

**Size a skeleton bar to the text, not to the line box.** A "line of text" bar should be
the font's **cap height**, not its `line-height` — for Geist that is 22px for `text-3xl`
(36px line box), 12px for 16px text, 10px for `text-sm` (20px line box), 8px for
`text-xs`. Using the line box makes every bar a solid slab. Where the surrounding layout
must not move (a grid row, a heading block), wrap the bar in a container of the **line-box**
height and center the shorter bar inside it — that keeps row heights identical when the
real content lands. Non-text placeholders (buttons, inputs, avatars, icons) are the
opposite: they take the *real control's* full box, so check the actual component
(`Button` default is `h-8 rounded-2xl`, base `Input` `h-8`, toolbar menus `size="sm"` =
`h-7`) rather than guessing.

`ui/skeleton.tsx` hardcodes `bg-muted` and is CLI-owned, and there are ~25 `<Skeleton>`
call sites plus `SidebarMenuSkeleton`'s inner bars, so neither editing it nor a call-site
`className` scales. `global.css` instead shadows the *variable* on the slot —
`[data-slot='skeleton'] { --muted: var(--skeleton) }`. This works because `@theme inline`
compiles `bg-muted` to `background-color: var(--muted)`; it wins no specificity fight, so
a call-site `bg-*` override still applies, and `--muted` is untouched everywhere else.

**The overlay paints an app-shell skeleton, not a spinner**, in pure CSS before any JS
runs. Two duplication hazards come with that, both cross-referenced in the files:

- `index.html` duplicates `--background` / `--sidebar` / `--skeleton` / `--border` /
  `--radius` from `src/global.css` as `--al-*` tokens, and re-derives the shell geometry (16rem
  sidebar, 4rem header, the `ViewSkeleton` content block). It **cannot** import them —
  `global.css` ships inside the JS bundle. Change one side, change the other.
- An inline `<script>` in `<head>` replicates the next-themes resolution
  (`attribute="class"`, `defaultTheme="system"`, `storageKey="semantius-ui-theme"`) to set
  `.dark` before first paint. If that config changes in `main.tsx`, the skeleton paints
  light and next-themes flips it on hydration — the exact flash the overlay prevents.

The same script tags `<html>` with `al-plain` for routes that keep the plain centered
spinner. **The test is what the overlay is about to BECOME, not which route is mounted
under it** — being outside the `_app` layout is not the criterion. `/logout`,
`/logout-success` and `/form-playground` end in a standalone centered page, so they are
plain. `/login` and `/oauth2_callback` are **not**: both render `null` and lead into the
app, and the callback holds the overlay across the entire tail of the boot (token
exchange → userinfo → route loader → `get_schema`) — the longest stretch the skeleton
exists to cover. Getting this backwards is what made a sign-in round trip go
skeleton → IdP → *spinner* → app. Add a new route to the list only if it terminates in its
own standalone page.

**Corollary for `useAuth()`:** `logIn()` / `logOut()` in `react-oauth2-code-pkce` are
fire-and-forget — the library catches its own rejection and the message surfaces **only**
as `useAuth().error`, never as a throw or a rejected promise the caller can await. Any
component that triggers an auth action and does not read `error` fails silently. Both legs
of the flow render `components/AuthFailure.tsx`.

### PKCE Requires a Secure Context (boot gate)

PKCE needs `crypto.subtle`, which browsers withhold outside a secure context — HTTPS, or
the `localhost` / `127.0.0.1` exemption. **Reaching a plain-HTTP deployment over a LAN IP
(`http://192.168.x.x:3000`) therefore makes login impossible**, no matter how the OAuth
config is set. `initConfig()` prechecks the *capability* (`window.isSecureContext &&
window.crypto?.subtle`) before resolving any endpoint, so boot stops at the configuration
error screen naming the origin rather than failing later inside the login flow. Testing
the capability rather than inferring it from scheme + hostname means it cannot
false-positive behind a reverse proxy or in any deployment shape. Serving the stack over
HTTPS is a `semantius-self-hosted` concern; this repo only makes the failure legible.

### Configuration-Driven User Menu

The sidebar-footer account menu (`components/layout/NavUser.tsx`) is **configuration, not
code**. `VITE_BACKEND_TYPE` picks a built-in menu (`cloud` default, `self_hosted`) or
`custom`, which deserializes a `VITE_UI_CUSTOMIZER` JSON string
(`{"user":{"menu":[{title,url,permission?}]}}`). Entries with a `permission` render only for
users holding it (`rpcUserInfo.permissions`); `{orgid}` in a url is substituted with the org
slug (`AppConfig.tenantName`, empty when there is no control plane).

**A same-origin path is not automatically an app route.** The route tree's catch-all
`/$moduleId/$table_name` *matches* something like `/idp/account`, which a reverse proxy
serves from the identity provider — so router-pushing it rendered a module view that 404'd,
"fixing itself" on refresh once the request finally reached the proxy. Entries therefore
carry an optional **`target`** (`'default' | 'redirect' | 'newtab'`, resolved by
`resolveMenuTarget()` in `lib/userMenu.ts`): `default` keeps the original rule (absolute url
leaves the SPA, relative one routes in-app), `redirect` forces `window.location.assign()`,
`newtab` a `window.open()`. The built-in `self_hosted` `/idp/*` entries declare `redirect`,
and `VITE_UI_CUSTOMIZER` accepts the key per entry. Auto-detection is not possible — the
router happily matches these paths — so any menu url answered by a different server behind
the same origin must be marked explicitly. It is an **enum, not a boolean**: "leaves the
SPA" and "opens a new tab" are separate axes, and a flag per axis would let them contradict
each other. Resolution is a pure
module — `lib/userMenu.ts` — called once from `initConfig()`, so stored URLs are concrete and
the whole thing is unit-testable without a browser. An invalid backend type or an
unparseable customizer sets `_configError` → blocking boot screen. Add new account/admin
links by editing `BUILT_IN_MENUS`, not `NavUser.tsx`.

### Adding a `VITE_*` Variable — the seven canonical registration points

A new `VITE_*` var silently does nothing in one deployment shape or another unless it is
registered in **all seven** places. Missing any one fails late and confusingly (see the
`VITE_CONTROL_PLANE_ORG` / turbo passthrough note under Testing for what that looks like):

1. `apps/web/public/config.js` — add `"VITE_X": "__VITE_X__"` (the placeholder token
   `runtimeEnv()` treats as absent outside Docker).
2. `docker/gen-config.sh` **and** `docker-vo/gen-config.sh` — append to `CANONICAL_VARS`;
   keep both lists identical to each other and to `public/config.js`.
3. `docker/.env.example` **and** `docker-vo/.env.example` — a commented example. The docker
   `.env` parser is line-based, so any JSON value must be single-line.
4. `turbo.json` `globalPassThroughEnv` — Turbo runs in strict env mode and strips anything
   not listed, so an unlisted var is simply absent from the built bundle.
5. Root `.env.example` — single-quote a JSON value (dotenv strips the quotes; unquoted, a
   ` #` inside would truncate it as a comment).
6. Read it in the app through `runtimeEnv('VITE_X', import.meta.env.VITE_X)` — never
   `import.meta.env` directly, or the Docker "build once, run anywhere" path breaks.
7. **Document it in the READMEs** — root `README.md` (an "Environment Variables" subsection)
   **and** `docker/README.md` + `docker-vo/README.md` (the key-variables table and the
   "Optional extras" list). An operator configures from the README, not from the source;
   a var that exists only in code and `.env.example` is undiscoverable.

### Routing Conventions

- File-based routing in `src/routes/`
- `_app` prefix = protected layout route (do NOT add `<ProtectedRoute>` wrapper inside)
- Route tree auto-generated by the `tanstackRouter()` Vite plugin into `src/routeTree.gen.ts` — **do NOT manually edit this file**; just create the route file and run `pnpm build` or the dev server

### Drizzle-Cube Chart Plugins

Custom chart overrides live in `src/charts/`. The `customCharts` array is passed to `CubeProvider` in `_app.$moduleId.index.tsx`. To override a built-in chart type (e.g., `table`, `bar`, `pie`), set `type` to the built-in name — drizzle-cube backs up the original internally and restores it if the override is unregistered.

**Key constraint:** drizzle-cube v0.4.x does **not** export `ChartProps` or `useTranslation` from the public API. `ChartProps` must be defined locally (matching the interface in `drizzle-cube/client` types). Utility functions (`formatAxisValue`, `hasTimeDimensionForPivot`, `pivotTableData`, etc.) are available from `drizzle-cube/client/utils`.

To scaffold a new chart from a built-in: `pnpm exec drizzle-cube charts init --from <type> -o ./src/charts` (run from `apps/web`). Note: in v0.4.x the CLI may only generate `index.ts` without the component/config files — create them manually based on the built-in source.

### Dynamic View Component Resolution

The route `_app.$moduleId.$table_name.tsx` loads view components dynamically via `import.meta.glob('../components/views/**/*.{tsx,jsx}')`. It checks for a **specific** component first at `views/{moduleId}/{TableName}.tsx`, then falls back to the **generic** `views/View.tsx`. When fixing behavior in `View.tsx`, always check if specific overrides exist in subdirectories (e.g., `views/crm/Customers.tsx`, `views/crm/Regions.tsx`) — those files are loaded instead of the generic one. Specific overrides should re-export from `View.tsx` (`export { View } from '../View'`) unless they genuinely need custom behavior.

**Customizing without forking View:** a specific override can render `<View {...props} />` and pass *extra* optional props that `View` forwards to `DataTableView` — the override does not have to reimplement the grid. `View`'s route contract stays `ViewProps` (`moduleId`/`table_name`/`recordId`/`metadata`); extra props are added to `View`'s local signature only (`ViewProps & { ... }`) so the generic path is unaffected. Example: `views/admin/Users.tsx` passes `getRowMenuItems(record) => RowMenuItem[]` to add per-row entries to the row "..." menu (returns extra `DropdownMenuItem`s appended before Delete in `DataTableView`'s actions column; empty array = unchanged menu). Reach for this pattern for per-view menu/behavior tweaks rather than editing `View`/`DataTableView` conditionally on table name.

### TanStack Router Search Param Serialization

TanStack Router's default `stringifySearchWith(JSON.stringify, JSON.parse)` **JSON-encodes strings that are valid JSON**. `JSON.parse('1002')` succeeds (it's a JSON number), so `'1002'` becomes `%221002%22` (`"1002"` with quotes) in the URL. Non-JSON strings like `'id'` or `'desc'` are passed through unmodified.

**Do NOT pass string IDs via TanStack Router's `navigate({ search: { _pv: id } })`** — use `router.history.push(url)` with a manually-built URL string instead:

```ts
const router = useRouter()
router.history.push(`/module/table?_pf=${encodeURIComponent(pf)}&_pv=${encodeURIComponent(String(id))}`)
```

This applies specifically to `_pf`/`_pv` parent-filter params (and any param where you need a clean numeric ID string). Other params (`page`, `pageSize`, `sortBy`, etc.) are fine via `navigate({ search: ... })`.

### Drag-and-Drop Row Reordering (`order_column`)

`get_schema` may return `metadata.table.order_column` (e.g. `"row_order"`), naming an integer column whose values increment by 10. When it is **non-empty**, `DataTableView` enables drag-and-drop row reordering (dnd-kit, already a dependency); when empty/absent, the grid behaves normally.

- The `order_column` **may not appear in `metadata.properties`**, so the query builder appends it to both the `select` and the `order` (`{order_column}.asc`) explicitly — never assume it is a visible column.
- DnD is active **only** when `order_column` is set **and** no user column sort is applied (`sorting.length === 0`); a user sort takes precedence and hides the drag handles, because reordering only makes sense in the saved order.
- On drop, `onReorder` **reuses the page's existing set of `order_column` values**, reassigning them (ascending) to the rows in their new visual order. Because the value SET is unchanged, there are never collisions with other pages and the increment-of-10 gaps are preserved. Only rows whose value actually changed are PATCHed (via `useUpdateRecord`). Optimistic local ordering is applied immediately, then cleared after refetch.
- The drag handle is a dedicated `__drag` column, pinned far-left ahead of the (also-pinned) label column. Row DnD lives in the shared niko-table `DataTableBody` as an opt-in (`enableRowDnd` + `onReorder`); the handle cell and the sortable row each call `useSortable` with the same `row.id` (the canonical TanStack + dnd-kit pattern). Set `getRowId` on `DataTableRoot` so the sortable id is the primary key.

- All data access via PostgREST — no Supabase client
- API base URL is in `VITE_API_BASE_URL` (currently Neon Data API)
- Use generic `useTable` hook — do NOT create table-specific hooks unless explicitly asked
- Database schemas are metadata-driven: use `metadata.table.id_column` and `metadata.table.label_column` — never assume column names
- Use `ApiErrorDisplay` component for all API error states
- Use `ConfirmDeleteDialog` + `useConfirmDelete` hook for delete operations
- Use `Record<string, unknown>` for table data — no TypeScript interfaces for DB tables unless explicitly requested

**PostgREST filter operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like` (`*` wildcards), `in.(a,b,c)`, `is.null`, `not.is.null`  
Combine with `&`: `?select=id,name&status=eq.active&order=created_at.desc&limit=10`

### Tailwind CSS v4

- **No `tailwind.config.js`** — configuration lives in CSS via `@import` and `@theme` directives in `src/global.css`
- Uses `@tailwindcss/vite` plugin (not PostCSS)
- Animation: `tw-animate-css` package (v4 replacement for `tailwindcss-animate`)
- Do NOT mix v3 syntax (separate config file, PostCSS plugins, `tailwindcss-animate`)

### shadcn/ui

- Always install via CLI: `npx shadcn@latest add <component> -y` — never create manually
- Never modify files in `src/components/ui/` — they are CLI-managed and upgradable
- Config: `components.json` (points to `src/global.css`)
- To customize: use `className` props at the call site (e.g., `<SheetContent className="border-l-0">`) — never modify `src/components/ui/*` or `src/global.css`

#### `ui/` vs `ui-ext/` boundary (CRITICAL)

⚠️ **`src/lib/utils.ts` is CLI-owned (the `aliases.utils` target).** A `--preset` apply or `shadcn add` resets it to the registry default (`cn` only), silently wiping anything hand-added there. **Never add custom helpers to `utils.ts`** — put them in **`src/lib/utils-ext.ts`** (the CLI never touches it; same `ui`-vs-`ui-ext` split idea). Import `cn` from `@/lib/utils`, everything else from `@/lib/utils-ext`. If a build/runtime `does not provide an export named '…'` from `utils.ts` appears, a shadcn action clobbered it — move the helper to `utils-ext.ts` rather than re-adding it to `utils.ts`.

`src/components/ui/` holds **only** pure shadcn registry output — files the CLI produces and can regenerate. Treat it as disposable/regenerable: never hand-edit (customize at the call site instead). Caveat: shadcn is **unversioned**, so "delete & re-add" pulls *latest* against the `base-rhea` base — it is a regeneration that may change APIs and require call-site fixes, **not** a clean drop-in upgrade. The regenerable property only holds because nothing in `ui/` is hand-edited.

`src/components/ui-ext/` holds **our** hand-written components that are NOT shadcn CLI primitives — we own and maintain these; the shadcn CLI will never touch them. Current members: `combobox`, `date-picker`, `date-time-picker` (shadcn-*documented* compositions, no `add` primitive exists), `sortable` (dnd-kit based; uses the `radix-ui` `Slot`, like the shadcn base `form.tsx`), and `bookmark-icon` (star toggle that reads/writes the row-scoped `user_bookmarks` table, matched 1:1 by `url`; insert auto-fills `user_id`/`row_order`). They import shadcn primitives from `@/components/ui/*`. No path-alias change was needed — `@/*` → `src/*` already covers `@/components/ui-ext/*`. When adding a non-registry component, put it in `ui-ext/`, not `ui/`.

#### Base UI (NOT Radix)

This project's shadcn primitives run on **Base UI** (`@base-ui/react`), not Radix. The base choice is encoded in `components.json` as `"style": "base-rhea"` (a Base UI flavor; was `base-nova` — any `base-*` value is Base UI, so swapping among them via a `--preset` keeps you on Base UI). Stable shadcn CLI ≥4.11 has **no** `base` field — adding one is rejected as "Invalid configuration"; the base/preset lives in `style`). `add --overwrite` reads `style` and pulls Base UI variants. The unified **`radix-ui`** package is still a dependency — shadcn's own base `form.tsx` (`Slot`) and `sortable.tsx` use it; the individual `@radix-ui/react-*` primitive packages are gone.

Key API differences when writing/migrating call sites (full rules: `.agents/skills/shadcn/rules/base-vs-radix.md`):

- **`asChild` → `render`**: `<Trigger asChild><Button>x</Button></Trigger>` becomes `<Trigger render={<Button />}>x</Trigger>` (inner content moves out to be the trigger's children). Sidebar/Collapsible/DropdownItem/Breadcrumb are `useRender`-based; primitive triggers (Dropdown/Popover/Tooltip/Sheet/Dialog/Button) add `nativeButton={false}` only when `render` targets a non-button (`<a>`/`<Link>`). `TooltipTrigger` has **no** `nativeButton` prop — trust `tsc`.
- **Select**: `SelectValue` still accepts `placeholder`, but with no `items` on the Root it renders the **raw value**, not the item label — where label≠value use a children fn `<SelectValue>{(v) => labels[v]}</SelectValue>`. `onValueChange` is now `(value: string | null, details)` (null-guard); `position` prop removed.
- **DropdownMenuItem uses `onClick`, NOT `onSelect`**: Radix's `DropdownMenuItem` had a custom `onSelect` selection prop; Base UI's `Menu.Item` does not. `onSelect={…}` silently binds to the **native DOM `onSelect`** (text-selection) event, which never fires on click — tsc accepts it (valid DOM prop) so it's a **silent no-op** (e.g. menu items that "do nothing"). Use `onClick` (it also carries `shiftKey` natively). This is **only** for `DropdownMenuItem`; `CommandItem` (cmdk) and `<Calendar>` (react-day-picker) keep their real `onSelect`.
- **DropdownMenu groups**: `DropdownMenuLabel` maps to Base UI `Menu.GroupLabel` and **must** be inside a `<DropdownMenuGroup>` (Radix allowed it standalone). A bare `<DropdownMenuLabel>` throws at runtime: `Base UI: MenuGroupContext is missing` (tsc does NOT catch it). Same for `DropdownMenuRadioItem` → needs `<DropdownMenuRadioGroup>`. Wrap the label (and ideally the items it heads) in a group.
- **Dialog/Sheet**: no `onOpenAutoFocus` — use `initialFocus={false}` to skip auto-focus.
- **Calendar** (react-day-picker v10): no `initialFocus` prop.
- **CSS vars** on Positioner/Popup: `--radix-*-trigger-width` → `--anchor-width`, `--radix-*-transform-origin` → `--transform-origin`, `--radix-popover-content-available-width` → `--available-width`. Tailwind v4 uses `(--var)` not `[--var]`.
- **State data-attrs** differ: Radix `data-[state=open]` → Base UI `data-[popup-open]` (menu/popover triggers) or `data-[panel-open]` (collapsible trigger). Put the `group/x` marker on the element that actually receives the attribute (the trigger, not a wrapper).
- **Tests**: jsdom needs a `ResizeObserver` polyfill (in `src/test/setup.ts`) — Base UI overlays use it at mount; checkbox state is `aria-checked`/`data-checked`, not `data-state="checked"`.

#### Form field surface consistency (CRITICAL for new input controls)

All form controls must render with the **same surface as the base `Input`** (the `bg-input/50` filled look from `ui/input.tsx`) so field appearance is driven by the theme token, not by component type. State (readonly/disabled vs active) is then distinguished only by `disabled:opacity-50`, not by different backgrounds.

- Text-family inputs already use the base `Input` (filled) — correct by default.
- Non-`<input>` controls (comboboxes, enum/reference/date/date-time pickers) must **NOT** use `<Button variant="outline">` (forces `bg-background` white + border) or override to `bg-background`. Use `<Button variant="ghost">` plus the shared `inputSurfaceClassName` from `@/lib/utils-ext` — the Button base already supplies matching radius, focus ring, `disabled:opacity-50`, and aria-invalid states, so the trigger renders identically to a text field.
- When adding any new picker-style form control, reuse `inputSurfaceClassName` — do not reintroduce `variant="outline"`.

#### Number formatting (grid + form) — single source of truth

Locale-aware number display lives in **`lib/number-format.ts`** (`getNumberSeparators`, `resolvePrecision`, `formatNumberForDisplay`) and is used by **both** the grid (`DataTableView` numeric cell) and the number form control. Do not re-implement number formatting at call sites. Formatting is driven by the browser locale and the sem-schema **`precision`** keyword (fixed decimal places, 0–4) — `precision` is now declared on `JsonSchemaProperty`. Integer type → 0 decimals; `number` with no `precision` → free decimals. The grid suppresses thousands grouping for the `id_column` only (a grouped id like `1,002` reads wrong).

The number **form control** (`ui-ext/number-input.tsx`) is built on **react-number-format** (`NumericFormat`). It does **NOT** use `customInput={Input}`: the CLI-owned base `Input` (`ui/input.tsx`) is a plain function component that does not forward `ref`, and react-number-format needs the input ref for caret management (without it the cursor jumps to the end while typing). Instead it lets `NumericFormat` render its own `<input>` and replicates the base Input surface in a local `NUMBER_INPUT_SURFACE` constant — **keep that constant in sync with `ui/input.tsx`** (same pattern/reason as `inputSurfaceClassName`). Value contract is unchanged: it stores/emits `number | undefined` (from `floatValue`), matching the old native `InputNumber`.

### UI Rules

- Never use `alert()`, `confirm()`, `prompt()` — use shadcn Dialog/AlertDialog instead

### PR Description — Screenshot URL (CRITICAL)

The AGENTS.md template uses `IntranetFactory/agbr-test` in the `raw.githubusercontent.com` URL — **both `IntranetFactory` and `agbr-test` are placeholders** (just like `<branch-name>`). The file is shared across dozens of repos, so it cannot hard-code owner or repo. Every agent must substitute the real values for the repo it is working in.

Derive the correct owner and repo at task time:

```bash
git remote get-url origin
# e.g. https://github.com/semantius/semantius-app
#                         ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^
#                         <owner>         <repo>
```

Correct URL format for a screenshot:

```
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/screenshots/YYYYMMDDHHMMSS-title.png
```

For this repo (`semantius/semantius-app`) on branch `copilot/fix-datatableview-state-issues`:

```
https://raw.githubusercontent.com/semantius/semantius-app/copilot/fix-datatableview-state-issues/screenshots/...
```

## Secrets & Deployment

### Docker runtime config — "build once, run anywhere" (`docker/`, `docker-vo/`)

There are **two sibling image definitions sharing one runtime-config mechanism**. `docker/` is the **primary, SPA-only** image (**nginx**): it serves the built SPA and nothing else — no proxy, plain HTTP on `:80`, TLS terminated upstream. `docker-vo/` is the **Caddy variant** kept alongside it: same config mechanism, but it *also* reverse-proxies `/api` and `/api-docs` to sibling containers and can do automatic HTTPS. **CI publishes `docker/` only** (`.github/workflows/docker-publish.yml` points at `docker/Dockerfile`), so `ghcr.io/semantius/semantius-app` is the nginx SPA-only image — `docker-vo/` has no published image and must be built locally. To let both run side by side they use distinct identities: `docker/` = `semantius-app:local` / container `semantius-app` / port **7070**; `docker-vo/` = `semantius-app-vo:local` / container `semantius-app-vo` / port **7071**. Anything below that says `docker/` applies to both unless it names Caddy or nginx explicitly.

The image is **environment-agnostic**: the Vite bundle is compiled against placeholder config and the real values are injected at **container start**, so one image serves any environment without a rebuild. This is a **parallel config channel to the Vite `.env` path — the two never overlap and only meet at `runtimeEnv()`**.

- **Accessor:** every `VITE_*` read in `lib/config.ts` and `lib/devUrlToken.ts` goes through `runtimeEnv(key, import.meta.env.VITE_X)` (`lib/runtimeEnv.ts`). It returns `window.__ENV__[key]` when that holds a real value, else the Vite build-time value.
- **Placeholder guard is the linchpin:** `apps/web/public/config.js` ships `window.__ENV__` with all values as `__VITE_X__` placeholder tokens. `runtimeEnv()` treats any `__…__` token as absent. So in **dev / Vercel / Cloudflare** (where nothing rewrites `config.js`) the app falls back to `import.meta.env` and behaves exactly as before. Only the Docker entrypoint replaces the tokens. **Do not "simplify" this guard away** — it is what keeps the non-Docker builds unchanged.
- **`config.js` is loaded by a plain, blocking `<script src="/config.js">` in `index.html` `<head>`** (before the deferred app module) so `window.__ENV__` exists at boot.
- **`gen-config.sh` generates `config.js`** at container start, and the two images differ only in *how it is invoked and where it writes*. **`docker/` (nginx)**: written to **`/usr/share/nginx/html/config.js`** by `docker/docker-entrypoint.sh`, installed as **`/docker-entrypoint.d/40-gen-config.sh`** — the nginx image's own entrypoint runs every `/docker-entrypoint.d/*.sh` before starting nginx, so nginx's ENTRYPOINT/CMD stay untouched. **`docker-vo/` (Caddy)**: written to Caddy's static root **`/srv/config.js`**; the Caddy image has **no `/docker-entrypoint.d/*.sh` hook**, so it needs a real `ENTRYPOINT` (`docker-vo/entrypoint.sh`) that runs `gen-config.sh` and then `exec caddy run …`. Precedence per key: **real env var > `docker/.env` file > OIDC discovery (OAuth endpoints only) > built-in default**. Keep its `CANONICAL_VARS` list in sync with `apps/web/public/config.js`.
- **Only `docker-vo/` proxies; `docker/` never does.** `docker/nginx.conf` is static serving + SPA fallback (`try_files $uri $uri/ /index.html`) + cache headers (`no-store` on `/config.js` and `/index.html`, immutable on `/assets/`) and stops there — the SPA must be pointed at an absolute `VITE_API_BASE_URL`. In `docker-vo/`, **Caddy is the single exposed endpoint** (`docker-vo/Caddyfile`): it serves the SPA (root `/srv`, SPA fallback, cache headers) **and** reverse-proxies `/api/*` → `{$API_UPSTREAM:postgrest:3000}` and `/api-docs/*` → `{$DOCS_UPSTREAM:scalar:8080}` to sibling containers, **stripping the prefix** (`handle_path`) so PostgREST sees `/customers`. Upstreams need no published ports; Caddy re-resolves their DNS per request (no startup-ordering failures). The proxy is **opt-in** — the SPA only uses it when `VITE_API_BASE_URL=/api`; the `.env` default stays an absolute external URL. `SITE_ADDRESS` sets the listen address: default `:80` (plain HTTP behind an outer TLS terminator), or a domain to enable Caddy auto-HTTPS (then also publish 443 and persist `/data`). These proxy/TLS vars are Caddy-only (i.e. `docker-vo/` only) — they are **not** in `CANONICAL_VARS` / `window.__ENV__`.
- **OIDC discovery runs in the SPA, not in `gen-config.sh`.** Set **`VITE_OAUTH_CONFIG`** (a `.well-known/openid-configuration` URL, now a `VITE_`-prefixed passthrough var, formerly the Docker-only `OIDC_CONFIG`) and `initConfig()` in `lib/config.ts` fetches it at boot, filling any blank `VITE_OAUTH_*_ENDPOINT` + scope (explicit env values win). It runs only on the self-hosted path (when `VITE_API_BASE_URL` is set); the control-plane path builds endpoints from the tenant slug instead. A failed discovery fetch sets `_configError`, which `main.tsx` turns into a **blocking** boot screen (hard-fail). This keeps `gen-config.sh` a dependency-free env→JS emitter (**neither Dockerfile `apk add`s curl/jq**) and unifies discovery across dev/Vercel/Cloudflare/Docker. The interactive `apps/web/scripts/genconfig.js` still writes explicit endpoints into a build-time `.env` and is unaffected.
- **`docker/.env` is a Docker-only file, NOT a Vite env file.** It is git-ignored (holds real values); only `docker/.env.example` is committed (and baked into the image as the default `/config/.env`). The bare-name `.env` needed an explicit `.gitignore` entry **per folder** (`docker/.env`, `docker-vo/.env`) because the repo's `.env.*` rule does not match a suffix-less `.env` — add one for any further sibling folder.
- **The image builds with no secrets.** CI (`.github/workflows/docker-publish.yml`) pushes to `ghcr.io/semantius/semantius-app` on a version tag, publishing a **multi-arch manifest (`linux/amd64` + `linux/arm64`)** via `docker/build-push-action` `platforms:` + a `setup-qemu-action` step. The arm64 leg builds under QEMU emulation (the runner is amd64), so it is noticeably slower — expected, not a hang. `sem-schema` is consumed from source (its `exports` point at `src/index.ts`), so only `pnpm --filter=@semantius/frontend build` runs — no package pre-build. Build stage is `node:22-slim` (Debian/glibc) to avoid musl native-binary issues with the Tailwind v4 oxide / lightningcss binaries — this build stage is identical in both folders; only the runtime stage differs.

### Cutting a Release

`./release.sh vX.Y.Z[-pre]` at the **repository root** (not `docker/` — nothing about
cutting a release builds an image) is the only supported way to publish. It bumps the
root `package.json`, commits `chore(release): vX.Y.Z`, tags and pushes; the tag push is
the entire trigger for `docker-publish.yml`, which builds the multi-arch image, pushes to
GHCR and creates the GitHub Release.

- **`package.json` must agree with the tag.** The workflow's `guard` job fails the release
  otherwise. The bump is not cosmetic: the SPA reports no version at runtime, so the tag is
  the only record of what an image contains. v0.1.1 and v0.1.2 were both cut from a tree
  claiming 0.1.0, because neither the bump nor the guard existed — `package.json` is
  therefore still at 0.1.0 and the next release self-heals it. The guard is skipped on a
  rehearsal, where there is no artifact to trace and the bump has not been written yet.
- **Pre-releases are supported** (`v0.2.0-rc.1`) and take neither `{{major}}.{{minor}}` nor
  `latest`. `latest` is derived from the prerelease flag, never assigned unconditionally.
- **`{{major}}` is suppressed by `docker/metadata-action` while the major version is zero**
  — its own documented default, not a workflow opt-in. Any preview of the tag set must
  account for that or it promises a `:0` that never appears.
- **A `workflow_dispatch` rehearses and never publishes**: both architectures build, nothing
  is pushed. Only a tag publishes.
- The tag filter is `v[0-9]+.[0-9]+.[0-9]+[-*]`, not `v*` — a `v`-prefixed non-version tag
  must not start a publish.
- `docker-vo/release.sh` is the old unguarded copy and is **not** the release path; that
  folder is slated for deletion.

### `.env` File (CRITICAL — read before every deploy)

The encrypted `.env` file is **not committed in `main`** — it was deleted in commit `114aed6`. If `.env` is missing at session start, `dotenvx run` injects 0 variables and `CLOUDFLARE_API_TOKEN` will be empty, causing deployment to fail with `Error: CLOUDFLARE_API_TOKEN is not set`.

**Always restore before deploying:**

```bash
# Check whether .env exists
ls .env 2>/dev/null || echo "MISSING — restore it"

# Restore from git history (the last commit that had it)
git show 9ef17da:.env > .env

# Verify decryption works (DOTENV_PRIVATE_KEY must be set in environment)
dotenvx run -- printenv CLOUDFLARE_API_TOKEN
```

`DOTENV_PRIVATE_KEY` is injected into the sandbox environment automatically and does not need manual configuration. The `.env` file just needs to exist on disk for `dotenvx run` to decrypt it.

The `workplace/deploy-wrangler.sh` health-check curl and `message.sh` notification may fail with non-fatal errors after a successful wrangler upload — the deploy is still live. The `.preview-url.md` file is written regardless of those failures.

### Windows: `pnpm preview:wrangler` fails — run the script directly

On Windows, `pnpm preview:wrangler` (= `dotenvx run -- turbo preview:wrangler`) fails with `'..' is not recognized` because Turbo invokes the `.sh` via cmd.exe. Run the script directly through Git Bash instead, with `dotenvx` injecting secrets:

```bash
dotenvx run -- bash workplace/deploy-wrangler.sh
```

### Turbo env passthrough gates the `#jwt` test-auth flow (CRITICAL)

Turbo runs in **strict env mode** and strips any env var not declared in `turbo.json` `globalPassThroughEnv` from the build task. `VITE_CONTROL_PLANE_ORG` (the unforgeable test-build marker that enables the `#jwt` token bootstrap — see Testing) **must** be listed there, or the preview bundle is built without it inlined, `urlTokenAllowed()` returns false, the app ignores `#jwt`, and the browser lands on `app.semantius.com/oautherror?error=invalid_redirect`. Editing `turbo.json` also busts Turbo's global cache, forcing a clean rebuild (otherwise a cached env-less `dist` is re-uploaded).

## Testing

### Load / performance tests (`apps/load-tests`)

k6 load tests live in `apps/load-tests` (an **app**, not a package — it exports nothing, it's run standalone via `k6 run`). k6 runs on its own JS runtime (goja), **not Node**, so it cannot `import` `scripts/mint-token.mjs`; `lib/auth.js` reimplements the same `client_credentials` exchange natively, reading `SEMANTIUS_API_KEY` / `VITE_CONTROL_PLANE_ORG` from `__ENV`.

- **Entry point is `load-test.sh`** (from `apps/load-tests`): `peak [minutes]` (auto-find peak req/s → sustain); `maxusers` (omit minutes = just find & print the max user count; `maxusers <minutes>` = find then run); `users <m> <minutes>` (explicit m users for n minutes, n default 1); plus `smoke`, `probe`, `sustain`. Leading bare integers after the scenario are positional (most = minutes; `users` = `<m> <n>`); anything after passes through to `k6 run`. It locates k6 and wraps every run in dotenvx — prefer it over calling k6 directly.
- **k6 is not on PATH by default** in Git Bash here — winget installs it to `C:\Program Files\k6`; `load-test.sh` adds it, but for a bare `k6` call `export PATH="$PATH:/c/Program Files/k6"` first.
- **dotenvx must inject the root .env**: `dotenvx run -f ../../.env -- k6 run scenarios/<x>.js`. k6 reads secrets from `__ENV`; note `k6 inspect` (unlike `k6 run`) does **not** inherit OS env into `__ENV` — pass `--env KEY=val` explicitly when inspecting.
- **Auto discovery is two chained runs** (k6 arrival-rate/VU stages are static, so one run can't feed a discovered value into a hold): `probe.js` discovers the ceiling and its `handleSummary` writes it to `.probe-result.json`; `load-test.sh` reads it and runs the second phase. `peak` sustains at that req/s (`sustain.js`); `maxusers` converts it to a user count (`saturation ≈ ceiling_req/s × (avg_think + active)`, `active` = mean latency measured at the winning rung, then ×`HEADROOM` default 0.9 for a clean run) and runs `users.js`. The ceiling **fluctuates run-to-run** — treat it as a range, not a constant.
- **Never infer the ceiling from a single overloaded sample — `probe.js` is a stepped ramp for a reason.** Throughput-under-overload is **non-monotonic**: it rises to the backend's knee, then falls off a cliff. An earlier `probe.js` flooded once at a fixed overload rate and took successful req/s as the ceiling; that was only valid while the endpoint had a hard connection cap rejecting excess instantly (`400 Too many connections`), making shed traffic free. Once the backend was scaled to **queue** rather than reject, the same flood landed past the cliff — latency grew unbounded, requests hit the k6 timeout (`status=0`) instead of failing fast, the arrival-rate executor drained its VU pool, and the probe reported ~0 req/s and **`maxusers = 1` for a backend that had just gotten ~4× faster**. Measured on the same endpoint the same day: 15 req/s demanded → 14 served, 0% error; 45 → 32 served, 1.3%; 75 → 0.02 served, 99.9%. The current probe instead walks flat rungs upward and takes the highest rung meeting an SLO (error rate, p95, *and* that the demanded rate was actually delivered), stopping at the first failure. Two corollaries worth keeping: a saturated backend also **under-delivers** the demanded rate (slow responses hold VUs hostage), so a delivery shortfall alone must not be blamed on the load generator; and any capacity number is meaningless unless the ramp **bracketed** the knee — all-rungs-pass means the answer is a lower bound, no-rung-passes means it is a floor. Both cases warn loudly rather than printing a confident number.
- **Load profiles are the request-mix abstraction** (`lib/profiles.js`): a profile = ordered `actions` (`{name, build}` where `build()` returns a `{method,url,body?}` descriptor run by `apiRequest` in `lib/http.js`, GET or POST). Every scenario runs `activeProfile()` (from `PROFILE` env, default `orders`) via `runThroughput` (probe/sustain, no pauses) or `runSession` (users, think between actions); thresholds come from `taggedThresholds(profile)`. Profiles: `orders` (3 PostgREST GETs) and `analytics` (1 Cube.js `POST` to `https://<org>.semantius.io/nwind/cubejs-api/v1/batch`, org = `VITE_CONTROL_PLANE_ORG`, same bearer token). Add/​combine profiles by editing the `PROFILES` registry — don't hard-code requests in scenarios.
- **CLI passes profile as the word after the scenario**, before the numbers: `./load-test.sh <scenario> [profile] [nums…] [k6 args]` (e.g. `maxusers analytics 5`, `users analytics 30 5`). load-test.sh exports `PROFILE` for the k6 runs.
- **`users.js` models real users**: `ramping-vus`, 1 VU = 1 user, session = each profile action followed by `think()` (random `THINK_MIN`–`THINK_MAX`, default 8–12s). Throughput scenarios (probe/sustain) have no think time.
- **A user count is not just an average rate — the ARRIVAL SHAPE decides whether it holds.** `users N` at a demand comfortably below the measured ceiling can still fail outright, for two reasons that have nothing to do with capacity. (1) **Thundering herd:** `constant-vus` starts all N VUs simultaneously and each fires immediately, so N=300 opens with 300 concurrent requests against a ~36 req/s backend (~8× over) and the VUs stay phase-aligned for cycles afterwards; fixed by `startupJitter()` — a uniform random offset over one user cycle, applied on `iterationInInstance === 0`. A plain `think()` here would NOT work: it shifts every VU by 8–12s and leaves the herd fully intact; the offset must be uniform over `[0, cycle)`. (2) **Cold-start:** the serverless backend scales on demand, so even correctly-smoothed arrivals fail during warmup — hence a `RAMP_SECONDS` (default 30) ramp. The probe never exposes either artefact, because a stepped ramp inherently arrives gradually and warms the backend on its way up. Concretely: 300 users errored at 4.39% with all failures in the first ~13s; with jitter + ramp the same 300 users ran **0 errors, 31.6 req/s, p95 815ms**. The capacity estimate had been right the whole time.
- **Report steady state separately from warmup, or the verdict is meaningless.** `users.js` tags every request `phase:ramp` / `phase:steady` (evaluated **per action**, not per iteration — a session spans ~30s and straddles the boundary) and judges only the steady window. Blending them reported that same clean run as a 4%-error failure. When a run does error, always check *which phase* first: a dirty ramp with a clean steady state means the backend needed longer to warm up, not that the user count is wrong.
- **Per-VU log dedup makes warning counts misleading.** `http.js` logs each `name:status` once per VU, so "197 status=500 warnings" means 197 *distinct VUs* hit their first 500 — not 197 errors. Always take totals from `http_req_failed` in the summary, never by counting log lines.
- **`read -r a b < <(node …)` + `set -e` gotcha**: `read` returns non-zero at EOF, which aborts under `set -e` even though the vars are populated. Emit a trailing `\n` from node **and** append `|| true` to the read (see the `maxusers` block).
- **Exit code 99 = thresholds crossed** (the run still completed) — `load-test.sh`'s `run_k6` treats 99 as success so orchestration continues.
- k6 built-in `http_*` metrics are tagged at request time (before the status is known), so a **response-status breakdown needs a custom `Counter` incremented after the response**, not a request tag. Non-200 bodies are logged once per status **per VU** (VUs are isolated JS runtimes with no shared state — per-VU is the tightest dedup possible in-script). Per-request-type latency/error rows come from trivially-true thresholds on `{name:...}`-tagged metrics.

### Test Accounts (interactive / human use only)

These credentials and the `test-oidc-server` token endpoint below are for **a human manually exercising the UI** — they are **not** for automated tests or for fetching tokens in scripts. For any programmatic/agent flow use the API-key exchange in **Automated Test Auth** instead.

| User         | Username | Email          | Password      | Role         |
| ------------ | -------- | -------------- | ------------- | ------------ |
| John Smith   | `user1`  | user@test.com  | `password123` | Basic user   |
| Maria Garcia | `user2`  | sales@test.com | `password456` | Sales access |
| Wei Chen     | `user3`  | admin@test.com | `password789` | Admin        |

Interactive-only token endpoint: `https://test-oidc-server.ma532.workers.dev/getaccesstoken?user_id=<username>&client_id=public-client`. Tokens expire after 1 hour.

### Opening ANY logged-in page (screenshots, browser checks, E2E) — MANDATORY procedure

> 🔴 **NEVER open the app URL bare in a browser.** A bare open (localhost or `*.workers.dev`) hits the OAuth2 PKCE login, which the IdP rejects with **`invalid_redirect` / "Authorization Failed"** because preview/worker domains are not registered redirect URIs. If you see that error page, you skipped this procedure — you did **not** "screenshot the home page", you screenshotted the auth wall.

This applies to **every** task that needs an authenticated view — "screenshot the home page", "check the dashboard", "verify the UI", E2E tests — not just things labelled "test". To open any logged-in page you MUST mint a token and pass it in the URL hash:

```bash
# 1. mint a token. MUST use --quiet AND extract only the JWT (see banner warning below).
TOKEN=$(dotenvx run --quiet -- node scripts/mint-token.mjs 2>/dev/null \
  | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
# sanity-check before using it: must start with eyJ and contain exactly 2 dots
[ "${TOKEN:0:3}" = "eyJ" ] && [ "$(printf '%s' "$TOKEN" | tr -cd '.' | wc -c)" = "2" ] || echo "BAD TOKEN"
# 2. open WITH the #jwt fragment — never without it
agent-browser open "$PREVIEW_URL/#jwt=$TOKEN"
# 3. confirm you're in: the URL should stay on the app (NOT redirect to app.semantius.com/oautherror)
```

> 🔴 **dotenvx banner pollution — the #1 cause of a bogus `oautherror`.** `dotenvx run` prints its `⟐ injecting env (N) from .env · dotenvx@x` banner (with ANSI color codes) to **stdout, not stderr** (verified, v1.58.0). So `TOKEN=$(dotenvx run -- node scripts/mint-token.mjs)` captures `<banner>\n<jwt>` even with `2>/dev/null`. That malformed `#jwt` makes `devUrlToken.ts` throw in `JSON.parse(atob(jwt.split('.')[1]))`, silently discard the token, and fall back to OAuth → `app.semantius.com/oautherror?error=invalid_redirect`. The error looks like an auth/redirect-URI problem but is really a polluted token. **Always** mint with `--quiet` **and** `grep -oE 'eyJ…\.…\.…'` to extract only the JWT, then validate it (above). Never pipe the raw `dotenvx run` stdout straight into the URL.

If `mint-token.mjs` fails, **stop and fix that first** — do not fall back to a bare open. Most likely cause in a fresh sandbox: `DOTENV_PRIVATE_KEY` is not set, so `SEMANTIUS_API_KEY` can't be decrypted.

**How it works.** `scripts/mint-token.mjs` exchanges the API key for an access token via the OAuth2 `client_credentials` grant: `POST https://{orgSlug}.semantius.cloud/token` (`Content-Type: application/x-www-form-urlencoded`, header `x-api-key: <key>`, body `grant_type=client_credentials`) → `{ access_token }` (JWT, ~1h). `apps/web/src/lib/devUrlToken.ts` (called first in `main.tsx`) reads `#jwt`, seeds the `SC_<mode>_token` / `SC_<mode>_tokenExpire` keys the auth lib reads (prefix from `storageKeyPrefix` in `AuthContext.tsx`), then strips the fragment. App boots authenticated, no OAuth redirect. The fragment is never sent to the server (a `?jwt=` query string would be logged — always use the hash). `apps/web/src/test/exchangeApiKeyForToken.ts` is the same exchange as an importable TS helper for in-process Vitest use.

**Credentials.** `SEMANTIUS_API_KEY` in `.env` (encrypted, **not** `VITE_`-prefixed so it never reaches the browser bundle). Org slug is reused from `VITE_CONTROL_PLANE_ORG` — do **not** add a separate `SEMANTIUS_ORG`. Node-only; run via `dotenvx run --`.

**Why the hash, not `VITE_`-inlining or `agent-browser state load`:** the hash works on the already-deployed build (no rebuild per token), keeps the token out of the static bundle, and avoids the brittle storage-state file (the Node `/tmp` → `C:\tmp` vs Git-Bash `/tmp` path mismatch breaks `state load`). Fully portable across Windows and the Linux web sandbox.

**Gating (deny-by-default, both must hold; see `urlTokenAllowed` in `devUrlToken.ts`):** (1) a non-empty build-time `VITE_CONTROL_PLANE_ORG` — production has none (it derives the tenant from the subdomain at runtime via `getTenantName()` in `lib/config.ts`), so this is an unforgeable test-build marker; **and** (2) host is `localhost`/`127.0.0.1` or `*.workers.dev`. Production satisfies neither, so it ignores `#jwt` entirely.

Keep at most one full-UI-login smoke test (against a registered domain) to prove the real OAuth integration still works.

### API Testing Workflow

Always inspect API responses with `curl` before implementing — never assume response structure.

1. Get a token from the platform via the API-key exchange (see **Automated Test Auth**) — use `--quiet` + JWT-extract to avoid the dotenvx-banner pollution described above: `TOKEN=$(dotenvx run --quiet -- node scripts/mint-token.mjs 2>/dev/null | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)`
2. `curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" "$API_BASE_URL/{table}?limit=1"` — inspect field names, types, casing
3. Test filters/ordering/pagination as needed
4. Test error cases (no auth, bad table name)
5. Only then write frontend code matching the actual response shape

**Common error responses:**

- Missing auth → `"missing authentication credentials: required authorization bearer token in JWT format"`
- Bad token → `"signature error"`
- Missing table → `code: "42P01"`, `"relation \"public.x\" does not exist"`

### Known Gotchas

- Unit tests passing + TypeScript compiling does NOT mean the site works — always verify in the browser
- Test with real API data, not mocked data — mocks can hide field name mismatches and type issues
- Verify data types in API responses — booleans may be `true/false` or `0/1`, numbers may be strings
- Check naming conventions in API responses — verify field names (snake_case, `{table}_id` vs `id`); don't assume
- Watch for silent failures: dialog closes but data doesn't change, button clicks but no network request fires
- For mutations (delete/create/update): confirm the request is actually sent AND the UI reflects the change — both must happen
- User profile access via `useAuth()`: `const { userInfo, userInfoLoading, userInfoError } = useAuth()` — `userInfo?.name`, `userInfo?.email`, etc. (from OIDC userinfo endpoint)
