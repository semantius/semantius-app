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
- **jsdom is not a test environment here, and browser primitives are never stubbed.** A
  test that touches a `window` or `document` runs in the Vitest `browser` project (real
  Chromium); one that does not runs in `node`. There is no third option — jsdom is
  pointless for the second kind and a fake for the first. A test that wants to replace
  `window.location`, `window.open`, `matchMedia`, `ResizeObserver`, `crypto`,
  `isSecureContext`, `fetch` or timers is reporting a design problem: a navigation is a
  link, an API call is a real call against nwind, a non-secure context is a real
  `http://<lan-ip>` origin in Playwright. Stated after the second a11y session kept a
  jsdom project and left `window.location` stubs in place; `substitutions.test.ts` is the
  ratchet that keeps the count going down.

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
- **`loginInProgress`** is stored in **localStorage** (library default) — persists across tabs and sessions. It is cleared by the library *before* the token exchange completes, so it is **not a reliable indicator** in `/oauth2_callback`. Stale state is harmless: `/login` always calls `logIn()` which resets it via `clearStorage()`. It also has to be **set** for the library to attempt the exchange at all: a visit to `/oauth2_callback?code=…` in a session that never started a login (a bookmarked or replayed callback URL, or a test that navigates there directly) makes **no token request** — the route's five-second fallback then restarts the login. A test of a *failed exchange* therefore has to go through the provider for real, and has to fail twice, because the callback auto-recovers from the first failure with one fresh `logIn()`; `apps/web/e2e/login-journey.spec.ts` does exactly that.
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

The other way to hang is a **standalone route that renders content and never calls it.**
`/form-playground` did: the page was in the DOM, the accessibility tree looked complete,
and the overlay sat on top swallowing every click (keyboard still worked, which is what
made it confusing). Routes in `index.html`'s `plain` list have no `_app` layout or
`ProtectedRoute` downstream, so each must reach `hideAppLoader()` itself, through the
page component it renders, or through the plain route it hands off to — the same test's
hand-off scan enforces that.

**`hideAppLoader()` is not synchronous.** It drops `pointer-events` and `opacity` on the
spot (so the real UI is usable immediately) but sets the terminal `hidden` attribute only
on `transitionend`, with a 300ms timer as the fallback for every case where that event
never arrives — a reduced-motion preference, a hidden tab, a `display:none` subtree, an
element with no transition declared at all. A test that asserts `[hidden]` right after
render will fail; assert the fade started, then poll for `hidden`. It is
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

### Transient Failures — a 429 or a cold start must never reach the user

Two endpoints the app cannot boot without fail for reasons that have nothing to
do with the request: the identity provider's `/userinfo` answers **429** when
pages load a few seconds apart, and the tenant's serverless PostgREST answers
**404** to the first request after an idle period (a reload fixes it). Both used
to render a terminal error card — and the table route's loader turned every
failure of `get_schema` into a **404 page**, so a rate limit told the user the
table did not exist.

**`lib/retry.ts` owns the policy, and the fetch interceptor in `lib/apiClient.ts`
applies it to every request** — both branches, relative and absolute, vendor
code included — so coverage is by construction and a new call site cannot
forget it. **TanStack Query's `retry` is `false` in `main.tsx` for that reason:
a second retry there would stack on the transport's.** The two lines landed in
one commit and must stay in agreement.

- **The budget is ~10s of TOTAL elapsed time** (`MAX_ELAPSED_MS`), with a
  ceiling of six attempts inside it. `Retry-After` is obeyed in full when it
  fits and ENDS the attempt when it does not — a server asking for 30s is
  telling us to give up, and clamping it to 5s (as this once did) is a request
  the server said not to make yet. Exponential backoff with **full jitter**.
- **The exceptions are by method and URL, in `retryPolicyFor()`, not by
  omission at a call site.** A `GET` is a read: `408/425/429/5xx` and a network
  error are repeated. A `POST …/rpc/…` under the API base is a PostgREST function
  call — how the app READS `get_schema` and `get_userinfo`, but also how
  `useRpcMutation` writes — so only `425/429/502/503` are repeated: answers a
  server gives before running anything. A `500`, a `504` or a network error may
  have run the function, and a repeated write is a duplicate. `POST`/`PATCH`/
  `DELETE` on a table are never repeated. A body that cannot be replayed (a
  stream) is never repeated.
- **A 404 is a cold start only under the API base, and only when it is BARE.**
  PostgREST's own 404 carries a JSON body with a `code` (`PGRST205`, `PGRST202`,
  `42P01`); `isDefinitiveNotFound` reads the body (off a clone) and stops the
  retry, which is what keeps a genuinely missing table from costing the whole
  budget. The cold-start 404 comes from the layer in front of a sleeping backend
  and has no such body.
- **`refreshSchemaCache` is the one deliberate bypass** — it calls the original
  fetch captured before interception, and its failure is swallowed on purpose.
- **Every thrower puts `status` (and where it has one, `url`) on `error.cause`**
  alongside the server's body: `useTable`, `callRpc`, the three mutations and
  `AuthContext.responseError()`. `statusOf(err)` reads it and answers
  `undefined` when it cannot tell — never a guess. The table route's loader maps
  a 404 to `notFound()` and rethrows everything else, which lands on the router's
  `defaultErrorComponent` (`components/RouteErrorPage.tsx`). **Its Try Again
  calls `router.invalidate()`** — the boundary's own `reset` only clears the
  boundary, the match underneath still holds the error, and the button would do
  nothing.
- Proven twice: `lib/retry.test.ts` in `node` (the loop over a supplied `send()`,
  with an injected clock so budget and backoff are asserted, not waited) and
  `e2e/transient-failures.spec.ts`, which needs its own Playwright project (see
  Testing) because the failure has to be injected into a request that would
  otherwise have SUCCEEDED — and which counts, per request shape, how many times
  the network saw a request the built app made.

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
leaves the SPA, relative one routes in-app), `redirect` renders a plain `<a href>`, `newtab`
an `<a href target="_blank" rel="noopener noreferrer">`. **Only the in-app case is scripted**
(`router.history.push`) — anything that leaves the SPA is a real link, not a click handler
calling `window.location.assign()` / `window.open()`, which is what it used to be. A link is
what a screen reader announces as a link, what middle-click and "open in new tab" work on,
and what a test can read off the DOM instead of observing by replacing `window.location`.
Note that `<a href>` inside a `DropdownMenuItem` trips `jsx-a11y/anchor-has-content`: the
content arrives through Base UI's `render` merge, which the rule cannot follow — suppressed
inline at the three call sites. The built-in `self_hosted` `/idp/*` entries declare `redirect`,
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
2. `docker/gen-config.sh` — append to `CANONICAL_VARS`; keep it identical to
   `public/config.js`.
3. `docker/.env.example` — a commented example. The docker
   `.env` parser is line-based, so any JSON value must be single-line.
4. `turbo.json` `globalPassThroughEnv` — Turbo runs in strict env mode and strips anything
   not listed, so an unlisted var is simply absent from the built bundle.
5. Root `.env.example` — single-quote a JSON value (dotenv strips the quotes; unquoted, a
   ` #` inside would truncate it as a comment).
6. Read it in the app through `runtimeEnv('VITE_X', import.meta.env.VITE_X)` — never
   `import.meta.env` directly, or the Docker "build once, run anywhere" path breaks.
7. **Document it in the READMEs** — root `README.md` (an "Environment Variables" subsection)
   **and** `docker/README.md` (the key-variables table and the
   "Optional extras" list). An operator configures from the README, not from the source;
   a var that exists only in code and `.env.example` is undiscoverable.

### Accessibility — the mechanisms, and the traps around them

**The `[data-slot]` variable-shadow trick has a hard limit, and `border-transparent`
is past it.** `global.css` retargets skeleton fills by shadowing `--muted` on
`[data-slot='skeleton']`, which works only because `bg-muted` compiles to
`background-color: var(--muted)`. `border-transparent` compiles to the LITERAL
`transparent` — there is no variable to shadow. The lever that does work there is
an **`@layer utilities` rule placed after `@import 'tailwindcss'`**: it matches the
plain utility's (0,1,0) specificity and wins on source order. That is what gives
every filled form control a 3:1 boundary without hand-editing nine CLI-owned files.

**But only SOME variants outrank it, and the difference is invisible in the class
name.** Tailwind v4 compiles variants two ways:

- a pseudo-class / attribute variant appends a real compound and IS (0,2,0), so it
  still overrides — `.focus-visible\:border-ring:focus-visible`,
  `.aria-invalid\:border-destructive[aria-invalid=true]`, and an arbitrary `[&_…]`
  descendant selector;
- a **`data-*` STATE variant compiles through `:where()`, which contributes ZERO
  specificity**, so `data-checked:` / `data-unchecked:` are only (0,1,0) — the same
  as the rule and EARLIER in the layer, meaning the rule silently WINS. That painted
  a gray hairline around every checked checkbox.

State-dependent slots are therefore excluded by *matching*, not by out-specifying:
`:not(:where([data-checked]))` keeps the rule at (0,1,0). Escalating to (0,2,0)
instead is a bug — it out-specifies focus-visible and aria-invalid and strips those
indicators. **Verify this in the BUILT css, never by reading the class name.**

Two other rules use the same block: the mobile sidebar's width and the Sheet/Dialog
close-button gutter. The sticky-footer bleed, the Sheet/Dialog `scroll-padding` and
the single-column form `@container` query are **unlayered** further down `global.css`,
not in that block.

**A CLI-owned component is sometimes unreachable from any call site.**
`ui/command.tsx` constructs its own `<InputGroup>` internally, so the
command-palette search field cannot be fixed by passing a className anywhere. When
that happens the options are a CSS rule (above) or a fork into `ui-ext/`.
`ui-ext/command-dialog.tsx` is such a fork, and it exists because the registry
`CommandDialog` renders its `sr-only` `<h2>` as a SIBLING of the popup — so it
lands in the page ahead of every route's `<h1>` and leaves the dialog unnamed.

**Tailwind width/height classes carrying a `data-[…]:` modifier are invisible to
tailwind-merge.** `data-[side=right]:w-3/4` (shipped by `ui/sheet.tsx`) and a
call-site `w-full` are different group keys to tailwind-merge, so BOTH survive —
and the modifier version then out-specifies the bare one. A Sheet call site must
repeat the modifier (`data-[side=right]:w-full`) or it silently renders at 75%.
Same for `max-w-*`.

**next-themes runs with `defaultTheme="system"`, so the only correct way to switch
themes in a test or an audit is to emulate the OS preference** (`agent-browser set
media dark`). Writing the `semantius-ui-theme` storage key or toggling `.dark` by
hand desynchronizes the provider from the DOM and measures a state no user can be
in. Any harness that switches themes must also ASSERT the switch took effect;
otherwise it measures light twice and reports dark as clean.

**Chrome returns computed colors in the space they were authored in.** This palette
is `oklch()`, so `getComputedStyle` hands back `oklch(…)` and `oklab(… / 0.5)` —
never `rgb()`. Any in-page contrast measurement that parses only `rgba()` returns
null for every color here, which reads downstream as "this control has no border
and no fill": a confident false positive on the exact criterion being measured.
Convert with a 1x1 canvas (it parses the full CSS `<color>` grammar), pulling alpha
out by regex first, because `getImageData` round-trips a premultiplied buffer.

**13 of the 68 `oklch()` declarations are outside the sRGB gamut** (`--primary`,
`--destructive`, `--sidebar-primary`, the chart ramp). What a browser paints for
those is the CSS gamut-mapping result, not a naive per-channel clamp, and the two
differ by up to ~0.1 in contrast ratio — enough to move a pair across the 3:1 or
4.5:1 line. Compute with colorjs.io's `toGamut({ method: 'css' })`, never by
clamping. **Both counts are asserted** in
`apps/web/src/test/tokenContrast.test.ts` — they had already drifted once, so a
palette edit now fails the suite until this sentence and `cssTokens.ts` are
updated with it.

**Base UI hides the page behind a modal dialog once, at open, and exempts every
live region's ancestors — so a dialog opened by deep link leaves the page behind
it exposed.** `modal` (default `true`) traps Tab and locks scroll, measured; but
its `aria-hidden` marking (floating-ui's `markOthers`) walks the document at open
and never again, and keeps every `[aria-live]` element and its whole ancestor
chain. A record opened at `/nwind/orders/11077` mounts its Sheet before the grid's
rows and pagination arrive, and the pagination's "1-10 of N items" is itself a
live region, so on a deployed preview nothing in `#root` carried `aria-hidden`
and the page-number input took focus from script. An earlier note here said the
opposite; it had measured a Sheet opened from a row click, where the grid already
existed. `components/a11y/ModalInert.tsx` puts `inert` on `#root` while any
`[role=dialog][data-open]` outside it exists — every Base UI popup is portaled to
a sibling of `#root` — and the toaster is portaled out of `#root` so it still
announces. An audit probe that walks the document must respect `[inert]`;
`FOCUS_OBSCURED` and `CONTROL_CONTRAST` additionally scope themselves to the open
dialog, because a control no Tab press reaches cannot be "obscured when focused".

**`position: sticky` and `scroll-padding` are a pair.** Anything sticky over a
scroll container hides whatever the browser scrolls to that edge, a focused control
included (2.4.11). Every scroll container with a sticky edge needs matching
`scroll-padding`: `html` for the app header and the form action bar, the
Sheet/Dialog for that same bar inside an overlay, and the data grid's own container
for its sticky header and pinned columns — computed at runtime in
`niko-table/core/data-table.tsx`, because the pinned width comes from the column
model. Where the sticky surface is wider than the space left over, padding cannot
help; that is why column pinning is disabled below `lg` (`hooks/use-min-width.ts`,
`GRID_PINNING_MIN_WIDTH_REM`). It was `md` first, and 768px was measured to be
too early: the sidebar leaves a 480px grid container there and the pinned set
takes 370px of it, so the band left for a focused control cannot hold a title
button. Measure the container, not the viewport, before moving this again.

**TanStack Table's `columnPinning` must be CONTROLLED, not `initialState`, when it
depends on a hook that resolves asynchronously.** `useMinWidth()` (like `useIsMobile()`) returns `false` on
its first render (its state starts `undefined` and an effect fills it in), so
`initialState` captured the desktop value and kept it forever: a phone got desktop
pinning permanently. `state` re-reads it.

### Internationalization

**Lingui's RUNTIME only** — `@lingui/core`, `@lingui/react`, `@lingui/message-utils`
— with no macros, no Babel plugin, no Vite transform, no CLI and no PO files. The
extractor (`apps/web/scripts/i18n/extract.mjs`, TypeScript compiler API) and the
catalogs (JSON, `apps/web/src/locales/`) are ours. Re-proposing the macros means
re-proposing a Babel pass over every file in `vite build` and both Vitest
projects, plus hashed ids that need source-text workarounds; that trade was
already made.

**The extractor's accepted argument forms are a WHITELIST, not a blacklist.**
`t()` / `translate()` / `msg()` / `<Trans id>` take a string literal, a template
with no expressions, an object literal with a literal `message`, or a bare
reference (identifier, `a.b`, `a[0]`) whose `msg()` site is extracted elsewhere.
Everything else — a template with expressions, a conditional, a concatenation, a
call, a logical expression — FAILS the extraction by name and line, and the
wrappers (`(…)`, `as`, `!`, `satisfies`) are unwrapped first so a single pair of
parentheses cannot smuggle a concatenation past the check. A permissive
fallthrough here is not a small bug: an unreadable call site is a string that is
neither translated nor listed anywhere as untranslated.

**The English source string IS the key.** There are no message ids, so rewording
a string in code creates a NEW key and moves its translations to `obsolete` — run
`i18n:extract` and retranslate. A PR that adds or rewords a string fills its
`de-DE.json` entry in the same PR, and `i18n:status` prints 0 missing before it
merges. `en-US.json` is GENERATED (the index of every message with its origins
and placeholders, committed like `routeTree.gen.ts`) and is never hand-edited and
never loaded as a catalog — the repo layer's glob excludes it, and `glossary.json`
with it. `labels`, `server` and `rule` sections are tenant or deployment data and
are rejected in a repo catalog.

**Because the source string is the key, two meanings of one English word SHARE
an entry** — and the collision is invisible in English, where both render the
word that was already there. `View` was both the grid's column-visibility button
(a noun, "Ansicht") and its row menu's open action (a verb, "Anzeigen"); one
German entry had to be wrong. The fix is a `context` on the narrower use
(`t({ message: 'View', context: 'column visibility' })`), which makes it a
separate id and a separate catalog entry under `contexts`. Find these by reading
`en-US.json` for an entry with **more than one origin file** — same word, two
components, is where to look.

**Components use `useT()` and list `t` in their deps; everything outside React
uses `translate()`** — a route's `head()`, `main.tsx`, the three class components
(`ErrorBoundary.tsx`, `form/InputJson.tsx`,
`niko-table/core/data-table-error-boundary.tsx`). The module function cannot
re-render a component when the language changes, and three grid components are
`React.memo`, so a `translate()` inside one would never update; ESLint bans the
import under `components/**` with those three as the exceptions. `useT()` needs no
provider (it is `useSyncExternalStore` on the Lingui singleton's `change` event);
only `<Trans>` does, which is what `src/test/render.tsx` is for.

**`I18nProvider` renders `null` until a locale is active, and under the boot
overlay that is a HANG, not an error.** So `activateLocale()` never throws and
always ends with something active — a failed layer logs and keeps the built-in
catalog — and `main.tsx` activates before `initConfig()` and again after it,
inside the one promise chain whose `.catch` calls `hideAppLoader()`.

**Language and formatting locale are TWO preferences.** `language` picks the
catalog, `locale` drives every `Intl` call, date-fns and `localeCompare`. Each
falls through its own chain — language: session → cache → operator default →
browser placeholder → `en-US`; formatting locale: session → cache →
`navigator.language` → `en-US` — so a cached German language with no cached
format takes the browser's `de-CH` rather than inheriting `de-DE`. A language that
is not available counts as absent (preview origins share one `localStorage`
across tenants). **Lingui never receives the formatting locale**: its `locales`
option feeds `Intl.PluralRules`, so an English UI with Russian formats would pick
Russian plural categories. Formatting helpers take `useFormattingLocale()`, never
the catalog language.

**Boot passes never persist; only the switcher does.** A boot that saved what it
resolved would overwrite a cached preference for a language that only becomes
available after login. `activateLocale`'s `persist` is per field and
three-valued: a string saves, `null` clears (that is "use browser default"), an
omitted field leaves the key alone — which is what lets a language change avoid
promoting a browser-derived formatting locale into a preference nobody chose.
`activateLocale` uses the REPLACING `loadAndActivate`; only a single-key save uses
the merging `i18n.load`.

**A switch needs `router.invalidate()`, never `location.reload()`.**
`document.title` comes from the matched route's `head()`, which re-runs only on
invalidation; a reload would throw away the session's client state to change a
string. `src/i18n` cannot import the router, so the caller does it (`NavUser`
through `useRouter()`).

**Empty strings are dropped when the layers are merged.** Lingui treats `""` as a
present translation, so a gap has to be ABSENT for the fallback to the source
text to apply.

**Never build a sentence by concatenation or English morphology** — no
`singularize()`, no `${x ? 's' : ''}`, no `.toLowerCase()` on a model label. One
ICU message per sentence, model labels inserted as given.

**The Base UI submenu cannot be driven by userEvent's pointer.** userEvent moves
its pointer in a single jump, which takes it out of the submenu trigger, and Base
UI's safe-polygon hover logic closes the submenu — leaving the panel in the DOM
with `data-closed` and `pointer-events: none` on its positioner, so the next
click fails with "element has pointer-events: none", which reads like a CSS bug
and is really a closed menu. Drive it by keyboard instead (typeahead to the
trigger with its FIRST WORD — a space is "activate", not a search character —
then `{ArrowRight}`, typeahead, `{Enter}`), which is what `NavUser.test.tsx`
does. Do not reach for `pointerEventsCheck: 0`; the substitutions ratchet counts
it.

**Both Vitest projects activate a locale before the first test** (`setup.node.ts`
is new for exactly this, `setup.browser.ts` does the same and also clears the two
cache keys): `i18n._()` THROWS with no active locale, and pure code renders
messages too — `resolveUserMenu`'s built-in titles are `msg()` descriptors, so
`userMenu.test.ts` and `config.test.ts` compare them through `translate()`.

**`eslint-suppressions.json` is the migration ratchet and only shrinks**, but its
counts are per file and per rule, so a same-file swap of one violation for
another is invisible to it and has to be caught in review. `eslint-plugin-lingui`
already whitelists `t` and `msg` as callees (verified in the rule's source);
`translate` and `translateDynamic` are ours and are named in `ignoreFunctions`.
Keep the `ignore` regexes NARROW — an over-broad one hides a real string forever
and silently, while an unmigrated string lands in the baseline once and is
visible there. **`react-hooks/exhaustive-deps` is an ERROR for `src/**` through
the same baseline** (seven violations predated it), because `useT()` returns a
new function per language: a `useMemo`/`useEffect` that omits `t` keeps rendering
the previous language behind a memo, and as a warning among ninety the rule would
never be read.

**`ignoreFunctions` exempts the whole CALL, and for a curried call it walks in to
the inner callee** — the rule takes a literal's nearest enclosing
`CallExpression` and tests that. So `ignoreFunctions: ['createFileRoute']` would
exempt every literal in `createFileRoute('/x')({ … })`, the entire route
definition with its `head: () => ({ meta: [{ title: 'English' }] })` included,
silently and forever. It is an entry-point whitelist, not an argument matcher:
name a function there only when EVERY string anywhere inside its call is
machinery. A single argument that is an identifier — a route path, a storage key
— belongs in `ignore` as a regex instead (`^/[A-Za-z0-9_$./-]*$` is the one that
covers the route paths, and it is narrow because a leading slash with no space in
it is an address, never a sentence).

**`no-unlocalized-strings` cannot see most attributes on an INTRINSIC element.**
`isAllowedDOMAttr` in the plugin hard-codes the checked set to `placeholder`,
`alt`, `aria-label` and `value` for a native tag (and skips SVG entirely); on a
capitalized component every attribute is checked. So `<span title="Delete this">`
is invisible to the rule while `<Button title="Delete this">` is not, and there
is no option to widen it. A green run and an empty suppression count are
therefore not proof that a file is fully migrated — `title`, `aria-description`,
`summary` and `label` on plain HTML have to be found by reading. Today every
`title=` in `src/` is on a component, so nothing is hiding; check when migrating
a file that adds one.

**The rule is blind to every string inside a `<Select>` — so the tag is
aliased, and a lint rule keeps it that way.** `no-unlocalized-strings` hard-codes
`['Trans', 'Plural', 'Select', 'SelectOrdinal']` as Lingui's own ICU components
and marks EVERY `Literal` / `TemplateLiteral` / `JSXText` in the subtree of one
as already visited (v0.15.0, `no-unlocalized-strings.js`). shadcn's `<Select>`
has the same tag name, so a `SelectItem`'s label, a `SelectValue placeholder`
and every attribute inside a select were invisible, and a green run over such a
file proved nothing about it — measured with a fixture through the installed
plugin, where a bare `<span>` beside them was reported and nothing inside the
`<Select>` was.

There is no option to rename what the rule considers an ICU component, so the
disambiguation is at the call site: the four files that use it import
`Select as SelectRoot` and a `no-restricted-syntax` entry in `eslint.config.js`
rejects the JSX tag names `Select` / `Plural` / `SelectOrdinal` outright. It has
to be a TAG-NAME ban — `no-restricted-imports` matches the imported name and
would reject the alias too. With the alias in place the real rule sees the whole
subtree, which is why `value` is in `ignoreNames`: a `<SelectItem value="asc">`
is an identifier next to its `t()` label, and the plugin already exempts `value`
on an intrinsic element for exactly that reason.

`Trans` is deliberately NOT in that ban and needs no test: `TransProps` declares
no `children`, so `<Trans id="…">text</Trans>` is a **tsc error** (TS2322,
verified). Its message comes from `id`, which the extractor reads.

**What is left in `eslint-suppressions.json` after P3 is not language.** The
count fell 947 → 610 and the residue is six families, none of which a catalog
can hold: PostgREST query fragments and URL templates, identifiers and enum
members (`'asc'`, `'default'`, a column name, an RPC name, a lucide icon id),
CSS class and custom-property strings, `throw new Error` invariants and
`console.warn` developer messages, **operator-facing boot diagnostics** (see
below), and `src/components/ui/**`, which is CLI-owned and cannot be hand-edited
at all. Read the number as "strings the rule cannot tell apart from text", not
as "untranslated UI". Audited by random sample plus a prose filter over all of
them; nothing user-visible is hiding in there.

**A boot diagnostic is not language; a boot INSTRUCTION is.** `lib/config.ts`
(44) and `lib/userMenu.ts` (29) stay English because they are machine reports
for the operator who wrote the `.env`: an HTTP status with the URL that produced
it, a missing-field list, a stack trace, and validation messages that quote
`VITE_UI_CUSTOMIZER`'s JSON keys verbatim ("`\"title\"` must be a non-empty
string"). Translating those makes the operator map German back onto English
keys. The line is CONTENT, not the `detail` slot it happens to land in —
`lib/secureContext.ts` renders into the same `BootFailure` `detail` and IS
translated, because it is a sentence telling a human what to do ("Serve the app
over HTTPS, or reach it at http://localhost").

**Two `ignores` beyond the plan's `src/charts/**`, both deliberate.**
(1) *Tests and their helpers* (`**/*.{test,spec}.*`, `**/__tests__/**`,
`src/test/**`): a test's strings are assertions, fixtures and query strings, and
there are ~2600 of them against ~1200 in product code — baselining them would
bury the ratchet under entries that can never be migrated. (2) *`src/i18n/*.ts`*,
the translation machinery itself, whose every string is a locale tag, a storage
key or an `Intl` option. That second one is scoped to the TOP-LEVEL modules on
purpose: `src/i18n/**` would also exempt `src/i18n/translateMode/` (translate
mode, still to come), which is
ordinary UI with ordinary user-visible strings. Neither ignore costs P3 its
"suppressions pruned to zero outside `src/charts/**`" target, because an ignored
file produces no suppression entries at all.

**`dist-e2e-*` are in `globalIgnores`.** Playwright builds two extra bundles
there; without the ignore ESLint parses ~3400 minified files on every run for no
rules at all.

**A file that exceeds its recorded suppression count reports ALL of that rule's
violations, not the excess.** Two new `'date'` literals in `ApiKeysCard.tsx`
(40 recorded) turned the whole file into 42 errors, which reads as "the
migration broke this file" and is really "two over the line". `--prune-suppressions`
only LOWERS a count, so the fix is to get back under it — never to re-baseline.
Budget a literal before adding one to a file that is still in the baseline.

**Every calendar goes through `ui-ext/localized-calendar.tsx`, never
`ui/calendar.tsx` directly.** react-day-picker renders month and weekday names
from a date-fns LOCALE OBJECT (not a tag) and it cannot fetch one, so a bare
`<Calendar>` is English whatever the user picked; and its accessible names ("Go
to the Next Month", "Choose the Year", the day cell's whole date) are English
constants inside the library, replaceable only through its `labels` prop. The
wrapper supplies both and is what the two `ui-ext` pickers and the grid's filter
calendars use.

**`src/i18n/dateFnsLocale.ts` is an EXPLICIT registry of lazy imports, and it
cannot be a computed specifier.** Vite resolves a dynamic `import()` at build
time and follows a variable only inside a relative path, never inside a bare
package id — `` import(`date-fns/locale/${code}`) `` builds and then 404s at
runtime. Resolution is the full tag then its language subtag (`de-CH` → `de`); a
tag outside the registry answers `undefined`, which date-fns and react-day-picker
both read as "use the built-in default". Where a formatting locale TAG is enough,
prefer `Intl` over date-fns: it needs no chunk and is right on the first render.

**A `lib/` function that produces a sentence takes `t` as a PARAMETER.**
`formatDeleteError(error, t, label)` is the shape: importing `translate` there
would render the current catalog but could not re-render the component holding
the string, and the ESLint ban on `translate` under `components/**` is only
enforced at the import site. A component passes its own `useT()` down.

**The data layer's own error sentences are UI text, and translating them does
not collide with the runtime collector.** `useTable`, `useTableMutations`,
`useRpc`, `callRpc`, the `$table_name` loader and `AuthContext` all end up in
`ApiErrorDisplay`, a toast or a delete dialog, so their messages go through the
catalog like anything else on screen. The reason that is safe alongside
`translateDynamic` — which looks a server message up VERBATIM and records a
`server` row for a miss — is that the two never meet: an app-authored fallback
("Failed to fetch {table}") is only reached when the response body carried no
PostgREST `message`, and a body with a `code` always carries one, so the
collector's "record only when `cause` has a `code`" filter never sees a
translated app string. Keep that property when touching either side: if a
thrower ever attaches a `code` while keeping its own wording, German text starts
appearing as tenant rows.

**Outside `components/**` the hook/module split is a judgment call, not a lint
rule.** `RouterContextUpdater` in `contexts/AuthContext.tsx` is a component and
uses `translate()` on purpose: its messages are produced inside the userinfo
effect, and listing a `t` from `useT()` in that effect's deps would refetch
userinfo on every language switch. The message is frozen at the moment the
request failed, which is the same trade every toast already makes.

**Four layers, later wins, and NOTHING pulls its own configuration.**
`src/i18n/store.ts` loads a language from repo catalog ← operator deployment file
← tenant rows ← drafts (translate mode, still to come), merging what each
answers. Configuration is PUSHED
in (`setDeploymentLocales` from `applyUiCustomizer`, `setTenantLocaleFiles` from
`components/TranslationsPrefetch.tsx`) rather than pulled, because the FIRST boot
pass activates a locale **before** `initConfig()` so `BootFailure` is translated —
a pull would have to call `getConfig()`, which throws at that moment. The same
rule is why `src/i18n` still imports no router.

**A deployment file is fetched with an ABSOLUTE url and its content-type is
checked, and both are load-bearing.** `apiClient.ts` rewrites every `fetch` whose
url starts with `/` onto the PostgREST base with a bearer token, so a relative
`/locales/fr-FR.json` would be asked of the API; and a web server with a SPA
fallback answers a MISSING file with the app's own HTML and a **200**, so `res.ok`
alone hands `res.json()` a page of markup. A wrong `url` must read as "no such
language", not as a parse error at boot. `docker/nginx.conf` serves `/locales/`
with `try_files $uri =404` for the same reason.

**Registration reuses `VITE_UI_CUSTOMIZER`; there is no new `VITE_*` var** (so
the seven registration points do not apply). Its parsing therefore moved out of
`resolveUserMenu` into `parseUiCustomizer`, which runs UNCONDITIONALLY — an
operator on the `cloud` or `self_hosted` built-in menu must still be able to
register a language, so `user.menu` is mandatory only for `custom`.
`src/i18n/localeConfig.ts` validates the `locales` section and a malformed one
BLOCKS BOOT: a language silently missing from the menu, with nothing anywhere
saying why, is far worse than a loud configuration screen.

**Model labels are DATA and have their own key scheme.** `table`
`<table>.singular_label|plural_label|description`; `column`
`<table>.<field>.title|description|relationship_label|singular_label_parent|plural_label_parent`;
`enum` `<table>.<field>.<STORED VALUE>`; `module` `<slug>.name|description`. The
runtime id is `scope + ':' + key` (a message id is the source text itself and has
no prefix). Overrides apply AT RENDER through `localizeMetadata()` — never in a
loader, never by mutation — so a language switch re-renders the grid without
refetching the schema, `enum` VALUES stay exactly what the database holds (only
`enum_labels`, the one consumer-facing slot on `JsonSchemaProperty`, is filled),
and the loader's data stays the model as the server sent it.
`useLocalizedMetadata()` in the `$table_name` route is THE choke point: `View`,
`DataTableView`, `SchemaForm`, `DataFormPage`, `ConfirmDeleteDialog`,
`ViewSkeleton`, `api-select` and `InputReference` all inherit that one prop. The
sidebar, the command palette, the breadcrumb, the module tiles and `View`'s
PARENT schema read `tables`/`modules` directly, so each looks its own labels up
through `useLocaleLabels()`.

**A model label is invisible to the extractor, so its inventory comes from the
model.** `tables`, `fields` and `modules` are read and diffed against the labels
layer BOTH ways: a label with no translation is missing, a translation whose key
the model no longer has is **orphaned** (a renamed table), and an orphan is
reported, never pruned — deleting one is a translator's decision. Never expect
`i18n:status` or the catalog test to report a label; `labels.mjs` is where they
come from, and it is the step to run after any model change.

**Two shared modules live in `scripts/i18n/` and the app RE-EXPORTS them**:
`localeFile.mjs` (file ↔ rows) and `labelInventory.mjs`. Plain ESM, because the
tenant scripts run under bare `node` with nothing transpiling TypeScript, and a
hand-kept second copy is exactly the divergence that would make an export and an
import disagree about a key. `src/i18n/localeFile.ts` and
`src/i18n/labelInventory.ts` are the two-line re-exports; `.d.mts` files type
them, the way `extract.d.mts` already did. The one fact still spelled on both
sides is the `scope:key` id format, pinned by `labelInventory.test.ts`.

**Runtime text — `server` and `rule` — is looked up VERBATIM and never
ICU-compiled.** A PostgREST message may legitimately contain braces, and running
it through the compiler would throw or silently eat them. `translateDynamic()`
does the lookup; `serverMessage(error)` in `lib/apiErrors.ts` is what every error
surface calls (`ApiErrorDisplay`, `formatDeleteError`, `ApiKeysCard`,
`ErrorPage`, the module dashboard). A React ERROR BOUNDARY's message is
deliberately NOT routed through it: that is a JS exception, not server text.

**Every miss becomes an empty-translation row, and the `code` filter is what
keeps the app's own English out of the queue.** `src/i18n/missing.ts` records a
`server` miss only for an error whose `cause` carries a PostgREST `code`; an
error the app threw itself carries none and its wording is already a catalog
message. Message misses come from Lingui's own `missing` event (so `<Trans>` is
covered too) and are skipped in `en-US`, where every id legitimately has no
entry; `server`/`rule` misses are recorded in EVERY language, because a backend
message is authored in the tenant's language and may not be English. Label misses
are reported from `useLocalizedMetadata` in an EFFECT, never in the memo — a
render must not write to the network. Rows are inserted with
`Prefer: resolution=ignore-duplicates`, so a request can never overwrite a
translation. **The collector is OPT-IN** (`enableCollector()` in `main.tsx`), so
the suite's own API errors never write rows.

**The session preference is three-valued and the third state is the whole
point.** `get_userinfo`'s `language` / `locale`: a string is a saved choice,
`null` is "use the browser default" saved explicitly, and an ABSENT field is a
platform that has not applied the migration. `sessionPreferenceFrom()` uses `in`,
not a truthiness check, because collapsing the last two would wipe the local
choice on every login against such a platform — which is every deployment today.
The switcher mirrors its choice into the module-level session state as well as
the cache: without that, a stale `get_userinfo` value would outrank the fresh
choice on the next resolve. A reload discards that module state, which is why
`NavUser.test.tsx`'s "boots from the cached keys alone" calls
`clearSessionPreference()`, and why both test setups clear it in `afterEach`.

**Nothing PROBES for a platform feature.** A definitive `PGRST205` / `42P01`
disables the tenant layer, a definitive `PGRST202` disables the preference
write-back for the rest of the session (module state, because the menu unmounts
every time it closes). A bare 404 means neither — the tenant's serverless
PostgREST answers one to the first request after an idle period, and the fetch
interceptor retries it. All of these predicates are in `src/i18n/tenant.ts`, with
the query and the paging, so `TranslationsPrefetch` holds no platform strings at
all — in a component they would be indistinguishable from untranslated UI text.

**`get_schema` moved onto the QueryClient, and the router context carries it.**
A language switch calls `router.invalidate()` so every route's `head()` re-runs
and `document.title` follows; re-running the loader would refetch the schema for
a change that is purely local. `ensureQueryData` with `staleTime: Infinity` and
`rpcQueryKey()` — exported from `hooks/useRpc.ts` so the loader and the hook fill
the SAME entry — makes it a cache hit. `head()` reads `currentLabels()`
synchronously, because it is not a component.

**The lingui rule cannot tell an identifier from a sentence, and the answer is
WHERE the string lives, not a wider `ignore`.** `src/i18n/*.ts` is already exempt
as machinery, so a snake_case model attribute (`'plural_label'`), a PostgREST
code, an RPC name and a query fragment belong there — `TABLE_ATTR` / `COLUMN_ATTR`
/ `MODULE_ATTR` in `labels.ts`, the constants in `tenant.ts` — and call sites pass
the constant. Widening `ignore` to cover `'description'` or `'title'` would hide
a real string forever and silently. This is also why `localeConfig.ts` sits under
`src/i18n/` rather than beside `lib/userMenu.ts`: every string in it is a JSON key
or an operator diagnostic.

**A per-call `{ timeout }` LOWERS the project's `asyncUtilTimeout`.**
`setup.browser.ts` configures 15s for the whole browser project; four `findByRole`
calls around CodeMirror had `{ timeout: 5000 }` and failed the release gate at
random while passing alone — four browser workers each mounting an editor is a
real second or two of contention, and the budget was deciding, not the code.
Removed; do not add one back.

**Verified against the live test tenant, and still true:** `ui_translations` is
absent (`PGRST205`), `set_user_preferences` is absent (`PGRST202`), and
`get_userinfo` returns no `language`/`locale`. `src/i18n/tenantTranslations.test.tsx`
therefore SKIPS its row tests with a message naming the migration — and it probes
at COLLECTION time with a top-level `await`, not in a `beforeAll`, because
`describe.skipIf` is evaluated before any hook runs and a flag set in a hook would
make the skip permanent. `fields.enum_values` really is a JSON array, and
`tables` / `fields` / `modules` really do expose every column the inventory reads.
`modules.module_slug` IS a unique constraint, which is what `useCreateRecord`'s
`onConflict` is proven against while the translations table is missing.

**Translate mode resolves the page through a reverse index RECORDED AT THE
PRODUCER, never by wrapping `t()` or reading the DOM for meaning.** `translate()`,
`labelOf()`, `localizeMetadata()`'s enum walk, `moduleOverride()` and
`translateDynamic()` each hand their rendered output plus its id to
`src/i18n/reverseIndex.ts` while recording is on (one boolean check per call
otherwise); a text node or an `aria-label` is then looked up AS RENDERED, values
interpolated. Two consequences that are easy to break: a new producer of
user-visible text has to record too, or its output is invisible to marking and
Alt+click; and a memo that skips the walk (`localizeMetadata` used to return early
on an empty label map) skips the recording — the walk must run while recording
even when nothing changes. `activateLocale` clears the index, and switching the
mode on calls `reactivateLocale()` so every `useT()` consumer re-renders and
records; a component that reads `translate()` at module scope is never
re-recorded, which is one more reason the `components/**` ban exists.

**The marks are CSS Custom Highlights, and the DOM is not mutated for them.**
Ranges over text nodes go into `CSS.highlights` under `semantius-i18n-missing`;
attribute hosts (and the fallback where the API is missing) get
`data-i18n-missing`, styled as an OUTLINE and nothing else: the focus ring in
this design system is a box-shadow (`ring-*`), so an outline composes with it,
while the box-shadow this first shipped with replaced the ring on every marked
control — and the `border-radius` beside it squared every marked button,
because the file is unlayered and an unlayered declaration beats any Tailwind
utility (which is also what lets the mark show through `outline-none`). The scan walks `document.body`, because every Base UI
popup is portaled beside `#root`, and prunes subtrees marked `data-i18n-ui` —
translate mode's own dialog, panel and button. Anything that adds a scanned
attribute (`aria-label`, `aria-description`, `placeholder`, `title`, `alt`) is
in the observer's `attributeFilter`; `data-i18n-missing` deliberately is not, or
the scan would observe itself.

**A sentence built from a model label is ONE text node, and the label inside it
has to be reached separately.** `t('Add {label}', { label })` renders "Supplier
hinzufügen" — the message IS translated, so a lookup by rendered text says
"nothing missing here" while the only untranslated part sits inside it. So
`translate()` also hands its VALUES to the reverse index, and the highlighter
marks the embedded value as a SUB-RANGE of the text node (an attribute host,
having no text node, is outlined whole). The values are stored raw and resolved
at scan time, never at record time: a component may render the sentence before
the label it embeds, and a lookup then would be too early. A click resolves the
embedded id first when the caret fell inside the segment and the surrounding
sentence otherwise, offering both as candidates. Reported by the owner within a
minute of using it — which is what a design keyed on whole rendered strings
costs if the interpolated case is not handled.

**Editing is Alt+click, and the editor and panel are MODAL.** A plain click in
translate mode still opens the menu or follows the link the text sits on —
otherwise the entries inside a submenu could never be reached to translate them.
`ModalInert` makes `#root` inert for ANY `[role=dialog][data-open]` outside it,
modal or not, so a "non-modal" panel would block the page exactly as a modal one
does while announcing itself as something else; in-context editing is therefore
done with the panel closed.

**Where a save goes is decided by capability, never by a probe.** A row through
`useCreateRecord(TENANT_TABLE, { onConflict: TRANSLATION_CONFLICT_COLUMNS })`
when `tenantTableAvailable()` (set by `TranslationsPrefetch` from a DEFINITIVE
body) and the user holds `translations.edit`; a browser draft otherwise
(`src/i18n/drafts.ts`, rows under `semantius-i18n-draft:<code>`, the LAST
layer in `localeLayers`). A message save also goes into Lingui through its
merging `i18n.load` — the one place that call is used — plus `addMessageEntry`,
so `translatedKeys` and the panel agree with what renders; a cleared message
has to go through `reactivateLocale()`, because Lingui's table can only be
replaced. `admin` gates the SWITCHES until the migration exists; it does not make
a save a row.

**A dependency reached only through a lazy chunk must be named in
`optimizeDeps.include`.** Vite's crawler never sees `sonner` or
`@base-ui/react/tabs` behind `import('@/i18n/translateMode')`, discovers them on
first load and RELOADS the page; in the Vitest browser project that reload lands
mid-test and leaves two copies of React in the module graph ("Invalid hook call"
inside `<TabsRoot>`), which reads like a component bug. Vitest prints the fix in
its own warning; `vite.config.ts` carries it.

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
- **`shadcn add tabs` currently emits `import { cn } from "cn"`** (the repo's pinned 4.19
  and 4.21 alike) and "installs" a bogus `cn@0.2.6` into `package.json` instead of resolving
  `aliases.utils`. The output cannot be hand-fixed in `ui/`, so `ui-ext/tabs.tsx` carries the
  registry markup with the import corrected and says why. Revert `package.json` and the
  lockfile after any such run, and check the first lines of a freshly added `ui/` file.
- Never modify files in `src/components/ui/` — they are CLI-managed and upgradable
- Config: `components.json` (points to `src/global.css`)
- To customize: use `className` props at the call site (e.g., `<SheetContent className="border-l-0">`) — never modify `src/components/ui/*`

#### The palette is TWO files — never correct a token in `global.css`

**`src/global.css` is stock CLI output and must stay that way.** It is the
`tailwind.css` target in `components.json`, so `shadcn init` and a `--preset` apply
**rewrite its `:root` / `.dark` blocks**. A token corrected in place there is
restored to the theme's value silently on the next CLI run — no error, no failing
build, just a 2.59:1 focus ring back in production. That is exactly what happened
once: the WCAG contrast work was edited into shadcn's own declarations.

Accessibility corrections therefore live in **`src/theme-a11y.css`**, a file the CLI
has no concept of, imported from `main.tsx` *immediately after* `global.css`. Both
files use plain `:root` / `.dark` at the same specificity, so **source order is the
entire mechanism** — the order of those two import lines is load-bearing.
`src/test/tokenContrast.test.ts` asserts the import exists and is second (matching a
real import statement with comments stripped: a bare `indexOf` on the specifier
matched the explanatory comment above it and stayed green when the import was
commented out).

**The order cuts both ways.** Because `theme-a11y.css`'s `:root` block also comes after
`global.css`'s `.dark` block, and every one of the four blocks matches
`<html class="dark">` at (0,1,0), a token corrected in `:root` **alone** replaces shadcn's
dark value with the light-mode color. `--muted-foreground` shipped that way for one
preview: dark placeholders at 2.72:1 while `tokenContrast.test.ts` reported 5.49:1,
because its palette model layered `.dark` over `:root` instead of following source
order across all four blocks. The audit caught it; the test could not. Both are
fixed: the model resolves in source order, and a test pins the file-shape rule —
**every token set in `theme-a11y.css`'s `:root` is set in its `.dark` too**, re-stating
the stock value where dark needs no correction.

One line cannot move with it: `@theme inline { --color-input-border: var(--input-border) }`
stays in `global.css`, because Tailwind only reads `@theme` from the entry that
imports `'tailwindcss'`. Lose it and the `border-input-border` utility silently
compiles to nothing — also asserted.

**A theme switch is not free.** Every value in `theme-a11y.css` was derived against
base-rhea's surfaces (the darkest being `bg-input/90` over `--sidebar`). A different
palette moves those. Run `pnpm --filter @semantius/frontend a11y:tokens` — it reads
the current palette and prints the minimum value each contrast-critical token needs.
See "Switching the shadcn theme" in the root README.

- **`src/global.css` has one other sanctioned exception.** The call-site rule holds
  until a defect is in a CLI-owned file that **no call site can reach** — the
  `@layer utilities` block at the bottom of `global.css` exists for exactly that case
  (a 3:1 boundary on nine form surfaces, one of which is `ui/command.tsx`'s internally
  constructed `<InputGroup>`; the mobile-sidebar width; the Sheet/Dialog close-button
  gutter). Unlike the token blocks it is *appended to* rather than rewritten by the
  CLI, so it survives. Read the comment above that block before adding to it — the
  specificity reasoning there is load-bearing and non-obvious (see "Accessibility —
  the mechanisms" above). Reach for it only after confirming no call site and no
  `ui-ext/` fork can do the job.

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
- **`<Button nativeButton={false} render={<a|Link/>}>` announces a LINK as a BUTTON.**
  Base UI's `Button` takes `nativeButton={false}` to mean "the thing I render is not a
  native `<button>`, so add the button role and keyboard behavior" — and it does exactly
  that, stamping `role="button"` and `tabindex="0"` onto the anchor. `getByRole('link')`
  then finds nothing and a screen reader says "button" for something that navigates. For a
  control that goes to a URL, use shadcn's documented `className={buttonVariants({…})}` on
  the `<a>`/`<Link>` instead; keep `nativeButton={false}` for a genuinely non-anchor render
  target. Four call sites had this (ErrorPage, NotFoundPage, LogoutConfirmationPage,
  ErrorBoundary). Inside a menu it is different — `DropdownMenuItem render={<a href>}`
  correctly keeps `role="menuitem"`, which is the right role there.
- **Dialog/Sheet**: no `onOpenAutoFocus` — use `initialFocus={false}` to skip auto-focus.
- **Calendar** (react-day-picker v10): no `initialFocus` prop.
- **CSS vars** on Positioner/Popup: `--radix-*-trigger-width` → `--anchor-width`, `--radix-*-transform-origin` → `--transform-origin`, `--radix-popover-content-available-width` → `--available-width`. Tailwind v4 uses `(--var)` not `[--var]`.
- **State data-attrs** differ: Radix `data-[state=open]` → Base UI `data-[popup-open]` (menu/popover triggers) or `data-[panel-open]` (collapsible trigger). Put the `group/x` marker on the element that actually receives the attribute (the trigger, not a wrapper).
- **Tests**: checkbox state is `aria-checked`/`data-checked`, not `data-state="checked"`. Base UI overlays use `ResizeObserver` at mount, which is one of the reasons component tests run in a real browser rather than a simulated DOM — there is nothing to polyfill.

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

### Docker runtime config — "build once, run anywhere" (`docker/`)

`docker/` is the **only** image definition: **SPA-only, served by nginx** — no proxy, plain HTTP on `:80`, TLS terminated upstream, and the SPA pointed at an absolute `VITE_API_BASE_URL`. Identity: `semantius-app:local` / container `semantius-app` / port **7070**. CI publishes it from `.github/workflows/docker-publish.yml`, which points at `docker/Dockerfile`, to `ghcr.io/semantius/semantius-app`.

> A second folder, `docker-vo/`, once held a Caddy variant that also reverse-proxied `/api` and `/api-docs` to sibling containers and could do automatic HTTPS. **It has been deleted.** If proxying or built-in HTTPS is ever wanted again it has to be rebuilt, not recovered from these notes — everything below describes the nginx image only.

The image is **environment-agnostic**: the Vite bundle is compiled against placeholder config and the real values are injected at **container start**, so one image serves any environment without a rebuild. This is a **parallel config channel to the Vite `.env` path — the two never overlap and only meet at `runtimeEnv()`**.

- **Accessor:** every `VITE_*` read in `lib/config.ts` and `lib/devUrlToken.ts` goes through `runtimeEnv(key, import.meta.env.VITE_X)` (`lib/runtimeEnv.ts`). It returns `window.__ENV__[key]` when that holds a real value, else the Vite build-time value.
- **Placeholder guard is the linchpin:** `apps/web/public/config.js` ships `window.__ENV__` with all values as `__VITE_X__` placeholder tokens. `runtimeEnv()` treats any `__…__` token as absent. So in **dev / Vercel / Cloudflare** (where nothing rewrites `config.js`) the app falls back to `import.meta.env` and behaves exactly as before. Only the Docker entrypoint replaces the tokens. **Do not "simplify" this guard away** — it is what keeps the non-Docker builds unchanged.
- **`config.js` is loaded by a plain, blocking `<script src="/config.js">` in `index.html` `<head>`** (before the deferred app module) so `window.__ENV__` exists at boot.
- **`gen-config.sh` generates `config.js`** at container start, written to **`/usr/share/nginx/html/config.js`** by `docker/docker-entrypoint.sh`, installed as **`/docker-entrypoint.d/40-gen-config.sh`** — the nginx image's own entrypoint runs every `/docker-entrypoint.d/*.sh` before starting nginx, so nginx's ENTRYPOINT/CMD stay untouched. Precedence per key: **real env var > `docker/.env` file > OIDC discovery (OAuth endpoints only) > built-in default**. Keep its `CANONICAL_VARS` list in sync with `apps/web/public/config.js`.
- **The image never proxies.** `docker/nginx.conf` is static serving + SPA fallback (`try_files $uri $uri/ /index.html`) + cache headers (`no-store` on `/config.js` and `/index.html`, immutable on `/assets/`) and stops there — the SPA must be pointed at an absolute `VITE_API_BASE_URL`. A same-origin `/api` prefix is **not** available; the fetch interceptor in `lib/apiClient.ts` (not `runtimeEnv()`, which is a pure accessor) rewrites relative URLs onto `VITE_API_BASE_URL`, which is what makes an absolute value mandatory here.
- **OIDC discovery runs in the SPA, not in `gen-config.sh`.** Set **`VITE_OAUTH_CONFIG`** (a `.well-known/openid-configuration` URL, now a `VITE_`-prefixed passthrough var, formerly the Docker-only `OIDC_CONFIG`) and `initConfig()` in `lib/config.ts` fetches it at boot, filling any blank `VITE_OAUTH_*_ENDPOINT` + scope (explicit env values win). It runs only on the self-hosted path (when `VITE_API_BASE_URL` is set); the control-plane path builds endpoints from the tenant slug instead. A failed discovery fetch sets `_configError`, which `main.tsx` turns into a **blocking** boot screen (hard-fail). This keeps `gen-config.sh` a dependency-free env→JS emitter (**neither Dockerfile `apk add`s curl/jq**) and unifies discovery across dev/Vercel/Cloudflare/Docker. The interactive `apps/web/scripts/genconfig.js` still writes explicit endpoints into a build-time `.env` and is unaffected.
- **`docker/.env` is a Docker-only file, NOT a Vite env file.** It is git-ignored (holds real values); only `docker/.env.example` is committed (and baked into the image as the default `/config/.env`). The bare-name `.env` needs its own `.gitignore` entry (`docker/.env`) because the repo's `.env.*` rule does not match a suffix-less `.env` — add one for any further sibling folder.
- **The image builds with no secrets.** CI (`.github/workflows/docker-publish.yml`) pushes to `ghcr.io/semantius/semantius-app` on a version tag, publishing a **multi-arch manifest (`linux/amd64` + `linux/arm64`)** via `docker/build-push-action` `platforms:` + a `setup-qemu-action` step. The arm64 leg builds under QEMU emulation (the runner is amd64), so it is noticeably slower — expected, not a hang. `sem-schema` is consumed from source (its `exports` point at `src/index.ts`), so only `pnpm --filter=@semantius/frontend build` runs — no package pre-build. Build stage is `node:22-slim` (Debian/glibc) to avoid musl native-binary issues with the Tailwind v4 oxide / lightningcss binaries.

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
- There is exactly one release path. A second, unguarded `docker-vo/release.sh`
  existed alongside it; that folder has since been deleted.

### `.env` File (CRITICAL — read before every deploy)

The encrypted `.env` file **is committed in `main`** and arrives with a normal checkout. It was
deleted once in `114aed6` and restored in `4f8a05e`; only the four real secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NOTIFY_WEBHOOK_URL`, `SEMANTIUS_API_KEY`) are
`encrypted:` values, the rest is public config. Committing it is deliberate — it is what lets CI
decrypt with the `DOTENV_PRIVATE_KEY` repository secret instead of duplicating each secret into
GitHub.

> **Never "restore" it from an old commit.** `git show 9ef17da:.env` is the *pre-deletion* copy and
> is missing variables the current file has (`VITE_CONTROL_PLANE_ORG` among them) — redirecting it
> over `.env` silently downgrades the environment. If `.env` really is absent, take it from `HEAD`:
> `git checkout HEAD -- .env`.

If `.env` is missing, `dotenvx run` injects 0 variables and `CLOUDFLARE_API_TOKEN` is empty, so a
deploy fails with `Error: CLOUDFLARE_API_TOKEN is not set`. Verify decryption with:

```bash
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

### Test Accounts and the test OIDC server

`test-oidc-server.ma532.workers.dev` **exists to be tested against.** It is a real OIDC provider —
discovery document, RS256-signed tokens, JWKS, `authorization_code` + `client_credentials` +
`password` grants, working `/userinfo` — and it is what lets the app's *real* auth code run under
test with nothing stubbed. Point a test build's `VITE_OAUTH_CONFIG` at
`https://test-oidc-server.ma532.workers.dev/.well-known/openid-configuration` and the whole flow
works. Two properties matter and are verified:

- **It does not restrict `redirect_uri`.** `http://localhost:5173/oauth2_callback` (or any other) is
  accepted and echoed back. The `invalid_redirect` failure described further down is the *production*
  control-plane IdP rejecting unregistered preview domains — it does not apply here. Do not assume
  otherwise without testing it.
- **It does not enforce PKCE.** The authorization code is a base64 JSON blob carrying no
  `code_challenge`, and `/token` issues a token for a deliberately wrong `code_verifier`. So a test
  against it proves the app *completes* the round trip and handles the callback; it does not prove
  the app's PKCE implementation is cryptographically correct. Nothing else covers that.

The narrower rule that actually matters: **the `/getaccesstoken` shortcut below is for a human
clicking around**, not for scripts. For any programmatic/agent flow that just needs a bearer token,
use the API-key exchange in **Automated Test Auth** — it is the supported path and does not depend on
this server. That is a statement about the shortcut endpoint, not about the server, which is the
correct IdP for automated browser tests of the login flow itself.

| User         | Username | Email          | Password      | Role         |
| ------------ | -------- | -------------- | ------------- | ------------ |
| John Smith   | `user1`  | user@test.com  | `password123` | Basic user   |
| Maria Garcia | `user2`  | sales@test.com | `password456` | Sales access |
| Wei Chen     | `user3`  | admin@test.com | `password789` | Admin        |

Token shortcut for interactive use: `https://test-oidc-server.ma532.workers.dev/getaccesstoken?user_id=<username>&client_id=public-client`. Tokens expire after 1 hour. Scripts should use the API-key exchange instead; browser tests of the login flow should drive the real `/authorize` form (fields `username` / `password`, POSTs to `/authorize`, 302s to the redirect URI with `?code=`).

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

> 🔴 **A stale `loginInProgress` produces the SAME `oautherror` as a bad token.**
> An expired `#jwt` (they last an hour) boots, fails `userinfo`, and starts a real login,
> which leaves `SC_<mode>_loginInProgress` set in the preview origin's `localStorage`. Every
> later open with a PERFECTLY GOOD `#jwt` then redirects to
> `app.semantius.com/oautherror?error=invalid_redirect` anyway — indistinguishable from the
> banner-pollution failure below, and it survives minting a fresh token. Mint a new token AND
> clear the origin's storage: `agent-browser open "$URL/logout-success"` (a plain route that
> needs no session) then `agent-browser eval 'localStorage.clear()'`, and only then open with
> the fragment.

> 🔴 **dotenvx banner pollution — the #1 cause of a bogus `oautherror`.** `dotenvx run` prints its `⟐ injecting env (N) from .env · dotenvx@x` banner (with ANSI color codes) to **stdout, not stderr** (verified, v1.58.0). So `TOKEN=$(dotenvx run -- node scripts/mint-token.mjs)` captures `<banner>\n<jwt>` even with `2>/dev/null`. That malformed `#jwt` makes `devUrlToken.ts` throw in `JSON.parse(atob(jwt.split('.')[1]))`, silently discard the token, and fall back to OAuth → `app.semantius.com/oautherror?error=invalid_redirect`. The error looks like an auth/redirect-URI problem but is really a polluted token. **Always** mint with `--quiet` **and** `grep -oE 'eyJ…\.…\.…'` to extract only the JWT, then validate it (above). Never pipe the raw `dotenvx run` stdout straight into the URL.

If `mint-token.mjs` fails, **stop and fix that first** — do not fall back to a bare open. Most likely cause in a fresh sandbox: `DOTENV_PRIVATE_KEY` is not set, so `SEMANTIUS_API_KEY` can't be decrypted.

**How it works.** `scripts/mint-token.mjs` exchanges the API key for an access token via the OAuth2 `client_credentials` grant: `POST https://{orgSlug}.semantius.cloud/token` (`Content-Type: application/x-www-form-urlencoded`, header `x-api-key: <key>`, body `grant_type=client_credentials`) → `{ access_token }` (JWT, ~1h). `apps/web/src/lib/devUrlToken.ts` (called first in `main.tsx`) reads `#jwt`, seeds the `SC_<mode>_token` / `SC_<mode>_tokenExpire` keys the auth lib reads (prefix from `storageKeyPrefix` in `AuthContext.tsx`), then strips the fragment. App boots authenticated, no OAuth redirect. The fragment is never sent to the server (a `?jwt=` query string would be logged — always use the hash). `apps/web/src/test/exchangeApiKeyForToken.ts` is the same exchange as an importable TS helper for in-process Vitest use.

**Credentials.** `SEMANTIUS_API_KEY` in `.env` (encrypted, **not** `VITE_`-prefixed so it never reaches the browser bundle). Org slug is reused from `VITE_CONTROL_PLANE_ORG` — do **not** add a separate `SEMANTIUS_ORG`. Node-only; run via `dotenvx run --`.

**Why the hash, not `VITE_`-inlining or `agent-browser state load`:** the hash works on the already-deployed build (no rebuild per token), keeps the token out of the static bundle, and avoids the brittle storage-state file (the Node `/tmp` → `C:\tmp` vs Git-Bash `/tmp` path mismatch breaks `state load`). Fully portable across Windows and the Linux web sandbox.

**Gating (deny-by-default, both must hold; see `urlTokenAllowed` in `devUrlToken.ts`):** (1) a non-empty build-time `VITE_CONTROL_PLANE_ORG` — production has none (it derives the tenant from the subdomain at runtime via `getTenantName()` in `lib/config.ts`), so this is an unforgeable test-build marker; **and** (2) host is `localhost`/`127.0.0.1` or `*.workers.dev`. Production satisfies neither, so it ignores `#jwt` entirely.

Keep at most one full-UI-login smoke test (against a registered domain) to prove the real OAuth integration still works.

### Three Playwright projects, and why they cannot be one

`playwright.config.ts` builds the app THREE times and starts three preview servers.

- **`chromium` (port 4173)** — the interactive login journey. It needs the OIDC
  test server, which accepts any `redirect_uri`, so the build is self-hosted with
  `VITE_API_BASE_URL` pointed at nothing.
- **`tenant` (port 4174, `dist-e2e-tenant`)** — production's shape: the
  control-plane path, the tenant's own PostgREST and OAuth endpoints, session
  seeded through `#jwt` with a token minted in-test from `SEMANTIUS_API_KEY`.

- **`lan` (port 4175, `dist-e2e-lan`, served on `0.0.0.0` and addressed by the
  machine's first non-internal IPv4)** — the only origin that is NOT a secure
  context. `localhost` is secure by exemption, so nothing served from it can
  show the boot gate that fires where `crypto.subtle` is withheld;
  `e2e/non-secure-context.spec.ts` asserts `window.isSecureContext === false`
  for real and then the configuration screen, overlay down, no redirect. The
  project is defined only when such an address exists (a loopback-only sandbox
  skips it). What it does NOT reach: `/login`'s own `useAuth().error` branch —
  on that origin boot stops before any route mounts, so the three substitutions
  in `routes/login.test.tsx` stay; closing them needs a failure that survives
  the boot gate (blocked storage, offline), not a LAN origin.

They cannot be merged. The transient-failure tests assert that a request which
would otherwise have SUCCEEDED recovers, so they need a real API behind the app;
the login journey needs an IdP that will accept `localhost` as a redirect target,
which the tenant's will not (that is the `invalid_redirect` the docs warn about).
A single build faking the missing half would put the fake exactly where the test
is looking. `pnpm test:e2e` therefore runs under dotenvx.

**`page.route` interception is the sanctioned substitution in e2e** — it replaces
no application code and sends real status codes; every attempt after the injected
ones is passed through to the real endpoint with `route.fallback()`.

### Accessibility testing — four layers, and why none of them is optional

**A simulated DOM cannot host axe, and jsdom never will.** It loads no CSS.
`sr-only` is therefore invisible to it, every contrast check has nothing to
measure, and — the trap — axe's own `bypass` rule PASSES a page with no skip link
at all, as long as it has a `<main>`. An "axe test" there checks that a page has
some attributes, not that it is usable. That is why jsdom is gone from this repo
entirely (asserted by `substitutions.test.ts`) and there are exactly two Vitest
projects, `node` and `browser`. The layers that do work:

1. **Token math in node** (`apps/web/src/test/tokenContrast.test.ts`) — parses
   `global.css` itself, so it fails the moment a token moves. It reaches pairs no
   route happens to render (a hover tint, a control on a surface nothing currently
   puts it on) and is the only layer that can.
2. **Component tests in a real Chromium** — the `browser` project in
   `apps/web/vite.config.ts` runs **every `src/**/*.test.tsx`** plus the three
   `.ts` tests that touch a `window` (`appLoader`, `config`, `apiClient`) through
   Playwright as part of `pnpm check` (so `checks.yml` installs Chromium first,
   and a fresh clone needs `pnpm --filter @semantius/frontend test:e2e:install`
   once). Everything else runs in `node`. No polyfills, real CSS
   (`src/test/setup.browser.ts` loads the stylesheets in `main.tsx` order).
   Its `maxWorkers` is capped at 4: a browser worker is a real page, and at
   Vitest's core-scaled default the machine rather than the code decided whether
   a CodeMirror mount or a DevTools-protocol probe finished in time. The two
   projects therefore need distinct `sequence.groupOrder`, which Vitest requires
   whenever projects differ in worker count.
   Every control test renders through `components/form/__tests__/harness.tsx` —
   the real `FormProvider` with a real TanStack Form instance — and asserts the
   computed accessible name and description. Two traps, both invisible:
   - **`toHaveAccessibleName` / `getByRole({ name })` drop an element that names
     itself.** dom-accessibility-api adds the current node to its consulted set
     before walking `aria-labelledby`, so the "<label id> <own id>" pattern the
     enum and date-time triggers use (field name first, current value second)
     reports the label alone — and a regex assertion passes without noticing.
     Chrome computes "Choose Option Option 1". `src/test/chromeAccessibleName.ts`
     reads Chrome's own tree over the DevTools protocol; assert with that, and do
     not "fix" the component to match the library.
   - **`cdp()` addresses the whole browser target, but a test renders inside an
     iframe of the orchestrator page**, so `DOM.querySelector` on
     `DOM.getDocument`'s root finds nothing and the next call fails with "Could
     not find node with given id". Use **`DOM.performSearch`** (after one
     `DOM.getDocument({ depth: 0 })` to prime the domain) — it searches every
     document of the target and returns only the matches. Do NOT walk
     `DOM.getDocument({ depth: -1, pierce: true })`: that transfers the entire
     tree of a page holding one live iframe per concurrently-running test file,
     and it intermittently blew the 20s test timeout once the browser project
     grew. Do not call `DOM.enable` either — it subscribes the session to every
     mutation in every one of those frames. Mark the element with a
     **per-call unique** attribute value; sibling frames probe concurrently.
3. **`eslint-plugin-jsx-a11y`** — static defects. Its `settings.jsx-a11y.components`
   map is what makes our wrapper components visible at all; TanStack's `Link` must
   go in `linkComponents`, NOT `components` (mapping it to an anchor manufactures 22
   false positives by demanding an `href` prop it does not take).
4. **`scripts/a11y-audit/`** — a real browser against a deployed preview. Everything
   else is a proxy for this.

**There are exactly TWO substitutions the suite is allowed, named and counted in
`apps/web/src/test/substitutions.test.ts`:** the OIDC test server (a real provider,
not a mock — the app's auth code runs against it unmodified), and **session
seeding**. The second is a genuine bypass, and it is only honest because
`apps/web/e2e/login-journey.spec.ts` drives the real interactive login once, for
real. That has to be Playwright: `react-oauth2-code-pkce` starts login with a full
top-level `window.location` navigation, which destroys a component test's context.
**The journey does NOT prove PKCE is cryptographically correct** — the test server
does not enforce PKCE — and nothing else in the suite does either.

**The Vitest run gets its session from `globalSetup`, not from `#jwt`.** A root
`globalSetup` (`src/test/globalSetup.ts`) exchanges `SEMANTIUS_API_KEY` for ONE
token per run and `provide()`s it to both projects; `src/test/session.ts`
writes it into the storage keys the OAuth library reads. `#jwt` remains for the
audit and for a human opening a preview — routing tests through it would make a
production safeguard load-bearing for the suite. Consequences to know:

- **`pnpm check` runs under dotenvx and needs `DOTENV_PRIVATE_KEY`**, and so does
  `pnpm test:e2e`. Both CI jobs declare it; a `workflow_call` receives no secret
  unless the caller passes it, so `docker-publish.yml` maps it explicitly.
- **`src/test/appHarness.tsx` is the app-provider harness** — `bootApp()` (real
  `initConfig()` on the control-plane path, then the seeded session),
  `bootAppSignedOut()`, `bootAppWithFailingUserinfo()`, `AppHarness`/`appWrapper`
  for a hook, and `renderInApp()` which composes exactly what `main.tsx`
  composes and hands back the router so `router.history.location` can be read.
- **Do NOT import `routeTree.gen.ts` into the harness.** The provider only calls
  `router.update()` and `router.invalidate()`, so an empty root route is the
  smallest real router that satisfies it. Pulling the generated tree in took the
  browser project's import time from 126s to 220s and made unrelated files fail
  with "Failed to fetch dynamically imported module".
- **The boot overlay comes from `index.html` itself** (`src/test/bootOverlay.ts`
  fetches it and lifts `#app-loader` plus the head styles out), so there is no
  copy to drift and no full-screen overlay over every other test.
- **Resource timing is the observation of last resort, and it is a real one.**
  `performance.getEntriesByType('resource')` says which URL the browser actually
  requested — the only way to see a call made by a fetch captured before the
  interceptor was installed (`refreshSchemaCache`), or to assert a URL was
  resolved before being fetched. An entry is recorded when the response
  COMPLETES, so poll for it; `await fetch()` resolves at the headers.
- **`vi.spyOn(globalThis, 'fetch')` without an implementation is an observer,
  not a stub**, and is the only way to assert a request was NOT made.

**`vi.mock` of anything inside `src/` is a known defect, not a technique — and so
is every other thing a test supplies in place of the real one.**
`substitutions.test.ts` inventories fifteen families (module mocks internal and
external, `window.location`, `window.open`, `matchMedia`, `ResizeObserver`,
`fetch`, `crypto`/`isSecureContext`, `vi.stubEnv`, fake timers, a hand-built boot
overlay, a disabled pointer-events check, a silenced console, `vi.resetModules`,
`fireEvent.change`), frozen per file; a new instance in ANY of them fails the
suite. **Eleven families are at zero, including `fetch`** — every test that talks
to an API talks to the real tenant. The remaining 6 are 1 internal mock and 1
external in `routes/login.test.tsx`, 2 overlay fixtures and 2 synthetic change
events. The target is zero, reached by moving those tests into a browser (or, for
`/login`'s failure branch, into a Playwright project served from a real
non-secure LAN origin), not by writing better mocks.

### The audit harness — traps that cost hours

- **`agent-browser` never returns if its stdio is a pipe.** Its per-session daemon
  inherits the pipe, so the pipe never closes and `spawnSync` waits forever even
  though the command itself finished in milliseconds. Wire every stream to a real
  FILE. This is the most confusing failure mode in the harness, because the
  identical command returns instantly in a terminal.
- **`batch` in argument mode strips single quotes** (mangling any JS payload — use
  JSON on stdin), and **`eval -b` fails on a 580KB payload**, so axe goes in with
  `--init-script`. That registers ONCE per session; re-passing it on every `open`
  registers duplicates that each re-parse axe.
- **`eval` runs in a shared global scope**, so probe helpers declared with `const`
  at the top level collide on the second call (`Identifier '__x' has already been
  declared`). Wrap every probe, helpers included, in its own IIFE.
- **Overflow must be measured on DESCENDANTS against the viewport.** `AppLayout`
  applies `overflow-x-hidden` twice, so `documentElement.scrollWidth` reports a
  clean page over content that is genuinely cut off. Skip anything inside an `<svg>`
  (its children report SVG-space boxes) and anything under a scrollable ancestor
  (that content is reachable).
- **A probe that walks the whole document must respect `inert` / `aria-hidden`.**
  When a Sheet opens, Base UI marks the page behind it inert; enumerating it anyway
  reports every control on the page as obscured by the overlay — a description of a
  modal working correctly.
- **`node.id` on a `<form>` is the named CONTROL, not the attribute**, when a field
  is called "id". Use `getAttribute('id')` in any DOM-walking report or it prints
  `[object RadioNodeList]`.
- **`agent-browser screenshot <path>` resolves a relative path against the daemon's
  working directory, not the caller's** — it fails with "cannot find the path" for a
  `screenshots/…` path that exists. Pass an absolute path. And a screenshot that shows
  only the boot spinner while `snapshot` shows a full page is the overlay still up
  (see the hang invariant), not a rendering problem: it also explains clicks that do
  nothing while `focus` + `press Enter` work.

**The tenant's serverless PostgREST answers the first request after an idle period
with a 404**, and the app treats that as terminal: it renders an error card and
never retries. Any browser harness must warm the API from node first and retry the
navigation, or a run turns into views that were never measured. The admissibility
gate has to recognize that error surface by name — otherwise it reports "0
violations" for a page that only ever showed an error card.

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

### Working in this checkout — environment quirks

- **`core.autocrlf=true` on a worktree that is mostly LF, with a few CRLF files
  stored as CRLF** (`DataTableView.tsx`, `View.tsx`, the `_app.*.tsx` routes among
  them). The "LF will be replaced by CRLF" warning on every commit is noise. But a
  script that rewrites a CRLF-stored file with LF endings produces a whole-file
  diff — read the file's existing line ending and write it back the same way, and
  restore a file from a byte copy, not `git checkout --`.
- **Two sessions may share this checkout.** Never `git commit` without pathspecs;
  never stage with `-A`.
- **A temporary file under `src/routes/` is picked up by the TanStack Router
  plugin the moment a build starts** — it regenerates `routeTree.gen.ts` around it
  and a concurrent `vite build` fails on the phantom route. Put scratch copies in
  the scratchpad directory, never next to the file they copy.
- **The `tests-ops` MCP connector cannot manage API keys from an agent session**:
  its token expires and its key tools are blocked by the permission classifier.
  Mint tokens with `scripts/mint-token.mjs` instead.
- **`Retry-After` is invisible cross-origin unless the server exposes it.** It is
  not a CORS-safelisted response header, and the API and identity provider are
  cross-origin, so `headers.get('retry-after')` is null unless the response also
  carries `Access-Control-Expose-Headers: Retry-After`. A test fixture that sends
  the header without exposing it tests a browser that hides it.

### Ideas already tried and rejected — do not re-propose

jsdom in any project; polyfilling a browser API to make a test pass; stubbing
`window.location`; axe in jsdom; `useTsTypes` on `lingui/no-unlocalized-strings`
(measured: it needs type-aware parsing — `parserOptions.projectService` — for
every file ESLint touches, which took a `src` run from 32s to 53s, and bought
48 of 702 violations, because the residue is `string`-typed query fragments and
identifiers rather than string-literal unions); isolated component tests with
invented props;
`/form-playground` as a test surface; MSW with recorded fixtures; deleting
Playwright; a pre-push hook; seeding `loginInProgress` to fake a failed token
exchange; routing the test token through `#jwt` instead of `globalSetup`; a
timer on the audit; a single-token audit run; a retry in react-query stacked on
the transport's; a `Retry-After` clamp (the budget decides, see Transient
Failures).

### Known Gotchas

- **`pnpm check` does NOT typecheck.** Lint + both Vitest projects only; `tsc -b
  --noEmit` runs inside `pnpm build`. A type error in a test file passes `check`
  and fails the release.
- **PostgREST reports "nothing matched" as SUCCESS, and the hooks translate.**
  A PATCH whose filter matches no row answers `200 []`; a DELETE answers a
  bodyless `204` unless `Prefer: return=representation` is sent, and then `200
  []`. `useUpdateRecord` and `useDeleteRecord` both send the header and throw
  "This <table> record no longer exists" (`cause: { status: 404, matched: 0 }`)
  on an empty representation, so the UI never says "saved" or "deleted" for a
  row that is not there. The server itself never sends a 404 for this — do not
  assert one. Proven in `hooks/useTableMutations.test.tsx` against the tenant.
- **Deleting a module cascades to its entities.** That is what makes the
  `_vitest_`-prefixed rows those tests create safe to clean up by module alone;
  it is asserted there and nowhere else.
- Unit tests passing + TypeScript compiling does NOT mean the site works — always verify in the browser
- Test with real API data, not mocked data — mocks can hide field name mismatches and type issues
- Verify data types in API responses — booleans may be `true/false` or `0/1`, numbers may be strings
- Check naming conventions in API responses — verify field names (snake_case, `{table}_id` vs `id`); don't assume
- Watch for silent failures: dialog closes but data doesn't change, button clicks but no network request fires
- For mutations (delete/create/update): confirm the request is actually sent AND the UI reflects the change — both must happen
- User profile access via `useAuth()`: `const { userInfo, userInfoLoading, userInfoError } = useAuth()` — `userInfo?.name`, `userInfo?.email`, etc. (from OIDC userinfo endpoint)
