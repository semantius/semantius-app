# Plan: `/login` hangs forever when `logIn()` fails to start

## Symptom (from user)

Self-hosted stack reached over a LAN IP (`http://192.168.1.193:3000`) instead of
localhost. The app loads, then spins forever. Console shows:

```
Error: The context/environment is not secure, and does not support the
'crypto.subtle' module.
```

Login over `http://localhost:3000` works.

## Verdict

**The error handling is not broken.** Four error surfaces exist and three are wired
correctly. The login route is the one that isn't — and it is the only route whose
failure state is an infinite spinner.

| Surface | Where | Catches | Rendered? |
| --- | --- | --- | --- |
| React error boundary | `components/ErrorBoundary.tsx`, mounted `routes/__root.tsx:25` | render / lifecycle throws | yes |
| Router catch boundary | TanStack Router global `CatchBoundary` | route render / loader throws | yes |
| Boot config error | `lib/config.ts` -> `main.tsx:63` | tenant lookup, OIDC discovery | yes |
| **OAuth context error** | **`useAuth().error`** | **login start + token exchange** | **callback only** |

Across the whole app exactly one component destructures `error` from `useAuth()`, and
it is `routes/oauth2_callback.tsx`. The error path was built for the **return leg** of
OAuth and never for the **departure leg**.

## Failure chain (verified against source @ 830bf44)

1. `http://192.168.1.193:3000` is not a secure context, so the browser withholds
   `crypto.subtle`. Only HTTPS and the `localhost` / `127.0.0.1` exemption qualify.
2. `react-oauth2-code-pkce` guards its S256 challenge generation and throws the message
   above. **Detection already exists** — it is not missing.
3. The library catches its own throw. `logIn()` is fire-and-forget:
   `redirectToLogin(...).catch(e => { console.error(e); setError(e.message); setLoginInProgress(false) })`.
   That is the console error. Nothing is an unhandled rejection.
4. The message lands in context, fully typed — `AuthContextType extends IAuthContext`
   (`contexts/AuthContext.tsx:145`), so `useAuth().error` carries it to every consumer.
5. `LoginComponent` destructures `{ logIn }` and nothing else (`routes/login.tsx:18`),
   then returns `null` (`:33`). There is no branch for a login that fails to start.
6. The spinner is a static `<div id="app-loader">` in `index.html`, removed only by an
   explicit `hideAppLoader()`. No call, no redirect, no render — **the page spins
   forever.**

The defect in full:

```tsx
function LoginComponent() {
  const { logIn } = useAuth()        // error and loginInProgress are right there, unread
  const search = Route.useSearch()
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true
    logIn(buildOAuthState((search as any).redirect || '/'))
  }, [])

  // HTML overlay from index.html stays visible while we redirect
  return null                        // <- no failure branch. the redirect is assumed.
}
```

The comment on the last line states the assumption exactly: the overlay stays up *while
we redirect*. When the redirect never happens, nothing revises that assumption.

`routes/oauth2_callback.tsx` does the same job correctly — one-shot auto-retry budget so
a stale code can't loop, timeout fallback, `hideAppLoader()` at `:79`, error card with a
**Try Again** button at `:75`.

## The general defect (worth fixing as a class)

> **Invariant.** The app boots behind a hand-rolled loading overlay that only application
> code can dismiss. Every path that stops making progress — success, failure, or waiting
> on a human — must call `hideAppLoader()`. A component that returns `null` without
> having called it is a **hang**, not an error.

Six call sites honour it today: `ConfigErrorPage.tsx:20`, `LogoutConfirmationPage.tsx:10`,
`NotFoundPage.tsx:17`, `ProtectedRoute.tsx:33`, `main.tsx:64`, `oauth2_callback.tsx:79`.
Someone understood the invariant; it just wasn't applied to a route with no visible
failure state to hang it on.

**The trigger is not the bug.** Any `logIn()` that fails before redirecting — malformed
discovery document, offline network, blocked storage — produces the identical infinite
spinner today. Phase 2 covers all of them.

## Detection greps (also the acceptance criteria — re-run after)

```bash
# 1 - terminal states that render nothing
grep -rn "return null" apps/web/src/routes/

# 2 - who honours the overlay handshake
grep -rn "hideAppLoader()" apps/web/src --include=*.tsx --include=*.ts

# 3 - consumers that take an auth action but never read its error
grep -rn "} = useAuth()" apps/web/src --include=*.tsx

# 4 - boot promise chains with no rejection branch
grep -n "\.then(\|\.catch(" apps/web/src/main.tsx

# 5 - last-resort global handlers
grep -rn "unhandledrejection\|window.onerror" apps/web/src
```

| # | Today | Reading |
| --- | --- | --- |
| 1 | `login`, `oauth2_callback`, `_app.$moduleId.$table_name` | cross-reference against #2 |
| 2 | 6 sites, **none in `login.tsx`** | the hang, located |
| 3 | 7 distinct destructures; only `{ token, error, logIn, loginInProgress }` reads `error` | any destructure taking `logIn`/`logOut` without `error` is a silent-failure candidate |
| 4 | `initConfig().then(...)`, no `.catch` | an unrecorded throw in boot config = blank page, overlay up |
| 5 | no matches in app code | only hits in the bundle are exceljs's core-js and React DOM's stylesheet loader |

## Progress checklist

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped (with reason).

### Phase 1 - Shared failure UI
- [x] `components/AuthFailure.tsx` (NEW) — extract the error card from
      `routes/oauth2_callback.tsx:75-100` (AlertCircle, message frame, **Try Again**)
      so both legs of the flow present failure identically
- [x] `routes/oauth2_callback.tsx` — swap its inline card for `<AuthFailure>`; behaviour
      unchanged (auto-retry budget and `hideAppLoader()` stay where they are)

### Phase 2 - Give the login route a failure branch (fixes the report)
- [x] `routes/login.tsx` — read `error` from `useAuth()`, call `hideAppLoader()`, render
      `<AuthFailure>`; reset `calledRef` on retry or the strict-mode guard swallows the
      second attempt

```tsx
function LoginComponent() {
  const { logIn, error } = useAuth()
  const search = Route.useSearch()
  const calledRef = useRef(false)

  const start = useCallback(() => {
    calledRef.current = true
    logIn(buildOAuthState((search as any).redirect || '/'))
  }, [logIn, search])

  useEffect(() => { if (!calledRef.current) start() }, [])

  if (error) {
    hideAppLoader()
    return <AuthFailure message={error} onRetry={start} />
  }

  return null
}
```

### Phase 3 - Validate the capability, not just the configuration
- [x] `lib/config.ts` — `validateConfig()` checks that OAuth values are present and not
      placeholders, but never asks whether the browser can *perform* the flow. Add a
      secure-context precheck to `initConfig()` so boot stops at the existing screen
      (`main.tsx:63`) **before** a login button is ever offered

```ts
if (!window.isSecureContext || !window.crypto?.subtle) {
  _configError =
    `This origin (${location.origin}) is not a secure context, so the browser ` +
    `withholds crypto.subtle - the WebCrypto API the PKCE login flow requires. ` +
    `Serve the app over HTTPS, or reach it at http://localhost.`
}
```

This is the one check that cannot false-positive: it tests the capability rather than
inferring it from scheme and hostname, so it holds behind any proxy, in any deployment
shape, under `vite dev` included.

### Phase 4 - Close the same hole at boot
- [x] `main.tsx:59` — `initConfig().then(...)` has no `.catch`. Any throw `initConfig`
      doesn't itself record leaves the promise rejected, `root.render` never called, and
      the overlay up — same blank-with-spinner by a different route

```tsx
initConfig()
  .then(() => { /* existing body */ })
  .catch((err) => { hideAppLoader(); root.render(<BootFailure error={err} />) })
```

- [x] `main.tsx` — add `window.addEventListener('unhandledrejection', ...)` as a
      diagnostic floor (log always, toast in dev). Not the cause of this bug, but there
      is currently no floor under the app at all

### Phase 5 - Tests
- [x] `routes/login.test.tsx` (NEW) — render `/login` with `crypto.subtle` stubbed to
      `undefined`; assert the failure UI appears and `#app-loader` has `hidden`.
      **Fails today.**
- [x] `lib/config.test.ts` (NEW) — `initConfig()` with `isSecureContext: false` records a
      config error naming the origin
- [x] invariant test (`test/appLoaderInvariant.test.ts`) — walk the route modules, assert every component with a
      `return null` terminal state has a `hideAppLoader()` path
- [x] manual — load over a LAN IP on plain HTTP, expect the configuration-error screen
      naming the origin; then over HTTPS, expect a normal login

## Outcome

All phases implemented and verified against the dev server on `192.168.1.193:5173`
(the reporter's exact origin) — screenshots in `screenshots/`:

- `20260830220735-lan-ip-insecure-context.png` — the reported hang is now the
  configuration-error screen, naming the origin (Phase 3 + 4).
- `20260830221052-login-failure-card.png` — with the Phase 3 precheck temporarily
  bypassed to isolate the layer beneath it, `/login` renders the new `AuthFailure`
  card carrying the library's own message, overlay down (Phase 2). The bypass was
  reverted and the precheck re-verified afterwards.

Secure-context regression check: over `http://127.0.0.1:5173` boot proceeds past
config and `/login` redirects to the IdP as before — the precheck does not
false-positive on the loopback exemption. (Not verified over real HTTPS: the
Cloudflare preview deploy needs `DOTENV_PRIVATE_KEY`, which is not set on this
machine, so `.env` cannot be decrypted.)

Not addressed — a candidate the greps still surface, with no checklist item:
`routes/logout.tsx:12` destructures `{ logOut }` without `error`. It is not a hang
(it renders a visible "Logging out…" message and always redirects or navigates
within 100ms), so it falls outside the invariant, but a failed logout is still
silent.

## Out of scope (belongs in semantius-self-hosted)

Serving the stack over HTTPS so a LAN IP is a secure context at all, and the
`IDP_BASE_URL` / `PUBLIC_WEB_ORIGIN` / `VITE_OAUTH_CONFIG` origin settings that still
point at `localhost:3000`. Fixing this repo makes the failure legible; it does not make
plain-HTTP LAN access work.
