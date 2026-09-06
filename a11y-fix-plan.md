# Fix plan

Everything open, with a file and a line for each item. This is the single plan.
`a11y-mobile-plan.RESTORED.md` is a recovered snapshot of the predecessor, kept
only until §6.6 is done — after that it can be deleted.

Status (what currently passes) belongs in `ACCESSIBILITY.md`, written **from a
valid audit run, after this plan is executed**. The draft on disk is not that:
see §6.2.

**Legend:** `DONE` applied and verified · `APPLIED` in the tree but unagreed ·
`OPEN` not started · `UNVERIFIED` the claim itself has not been established.

---

## 0. State of the repo right now

| | |
| --- | --- |
| Branch | **`main`**, level with `origin/main` — the 44 commits were pushed and the first CI run is on GitHub (§6.4: check it) |
| Stale branch | `feat/a11y-wcag-aa-mobile` still exists, identical to the pushed history, safe to delete |
| Valid audit run | **`a11y-reports/20260906T173406-pinning-lg.json`** — preview `main-20260906175709`, 164/168 measured, 24 / 2 / 29, **2.4.11 Supports**. `ACCESSIBILITY.md` is written from it |
| In flight | Order steps 1–4 and 6–7 applied in the tree (see the per-section status lines); `a11y-mobile-plan.RESTORED.md` deleted (§6.6 done) |
| Other sessions | `a11y-audit-review.md` appeared at 16:00, written by something other than this session — check before assuming the tree is yours |

---

## 1. Naming

### 1.1 The unit is a **view** — DONE (`.mjs` and the four doc files)

`cell` was factorial-design vocabulary: correct there, meaningless in
accessibility. **WCAG-EM** defines *view* as the unit of conformance, and says
content that changes with device or settings is represented separately — so
`/nwind/customers` at 320/dark is one view and at 1440/light another. It is also
ordinary UX language.

Rejected: `snapshot` (in Percy/Chromatic/BackstopJS that is the captured *image*;
this audit measures contrast and overflow); `sample` (WCAG-EM's word for a view
*in the sample set* — right for the collection, wrong for the thing); `page
state` (I attributed this to WCAG-EM; **it is not in WCAG-EM**).

| Where | State |
| --- | --- |
| `scripts/a11y-audit/` — 6 of the 7 `.mjs` modified, generated strings included | **DONE**, smoke-tested: `2/3 views measured, 1 cantTell` |
| `ACCESSIBILITY.md` (11 of 12 hits), `a11y-reports/README.md` (9), `CONTEXT-MEMORY.md` (**1** of 3), `.github/workflows/a11y.yml` (1) | **DONE** — `inconclusive` → `cantTell` in the same pass; `inconclusive[]` is still named once, as the key in the artifacts kept from before the rename |

**Not** the ~60 genuine table and calendar cells in `apps/web/src` — and not the
genuine ones inside the doc files either, which is why the counts above are
lower than a raw grep: `CONTEXT-MEMORY.md:367` ("the handle cell") and `:489`
("numeric cell") and `ACCESSIBILITY.md:94` ("a right-aligned grid cell") are real
table cells. A blanket `sed` destroys all of them.

### 1.2 `INCONCLUSIVE` → `cantTell`, `admissible` dropped — DONE

`cantTell` is a defined outcome in [ACT Rules Format](https://www.w3.org/TR/act-rules-format/)
(`passed` / `failed` / `inapplicable` / `cantTell` / `untested`). "221/224 views
measured, 3 cantTell" needs no third word.

### 1.3 Names I introduced that are still wrong — DONE

| Name | Problem | Should be |
| --- | --- | --- |
| `lib/transientFailure.ts` | named after the **problem**; its main export is `withRetry` | `lib/retry.ts` ✓ |
| `coldStart404` | named after a **cause**, so the caller must know why the tenant does this | `retryNotFound` ✓, set by `retryPolicyFor()` — no caller names it |
| `isTransientError` | answers `false` when it cannot tell — the name promises a judgment it cannot make. This **is** the regression in §2.3.1 | gone ✓; `statusOf(err)` answers `undefined` when it cannot tell, and nothing decides retrying from an Error any more |

---

## 2. Rate limits and transient failures

### 2.1 Current state — every request path

Counted as **total requests**, not retries — mixing the two made the two engines
look different when they both make four.

| # | Path | File:line | Requests | Jitter | `Retry-After` |
| --- | --- | --- | --- | --- | --- |
| 1 | OAuth `userinfo` | `contexts/AuthContext.tsx:288` | 4 (1+3) | yes | yes, **capped 5s** |
| 2 | `rpc/get_userinfo` | `contexts/AuthContext.tsx:322` | 4 (1+3) | yes | same |
| 3 | `useTable` query | `hooks/useTable.ts:88` | 4 (1+3) via QueryClient | **no** | **no** |
| 4 | `useRpc` query | `hooks/useRpc.ts:51` → `apiClient.ts:198` | **1** — §2.3.1 | — | — |
| 4b | `useRpcMutation` | `hooks/useRpc.ts:89` → `apiClient.ts:198` | **1**, same defect as row 4 | — | — |
| 5 | `get_schema` route loader | `routes/_app.$moduleId.$table_name.tsx:114` | **none** | — | — |
| 6 | create / update / delete | `hooks/useTableMutations.ts:39,130,205` | **none** | — | — |
| 7 | Command palette search | `components/layout/CommandPalette.tsx:62` | **none** | — | — |
| 8 | `api-select` form control | `components/form/api-select.tsx:188,203` | **none** | — | — |
| 9 | `refreshSchemaCache` | `apiClient.ts:148` | **none**, swallowed | — | — |
| 10 | Tenant lookup at boot | `lib/config.ts:178` | **none** | — | — |
| 11 | OIDC discovery at boot | `lib/config.ts:280` | **none** | — | — |
| 12 | Logout | `routes/logout.tsx:27` | **none** | — | — |
| 13 | drizzle-cube dashboard | vendor | unknown | — | — |
| 14 | `/form-playground` schema fetch | `routes/form-playground.tsx:44` | **none** — dev route, out of scope | — | — |

Of the 15 rows: **2 retry properly** (1, 2), **1 retries badly** (3), **11 do not
retry at all** (4, 4b, 5–12, 14), and **1 is unknown vendor code** (13). Both
boot paths are in the eleven, where a 429 is an immediate hard-fail screen.

### 2.2 What was changed for this without approval — APPLIED, committed

Commit `fb7643c`. App behavior, 4 files:

| File | Change |
| --- | --- |
| `lib/transientFailure.ts` | new, 183 lines. `MAX_ATTEMPTS = 4`, 300ms base, 5s cap, full jitter, retryable `{408, 425, 429, 500, 502, 503, 504}` exactly (not all 5xx — 501 and 507 are not retried), `Retry-After` parsing, `coldStart404`. Every constant chosen by me |
| `contexts/AuthContext.tsx` | the two boot fetches use `fetchWithRetry` |
| `main.tsx` | QueryClient `retry: 1` → predicate. **Changes every query in the app** |
| `hooks/useTable.ts` | HTTP status onto `error.cause` |

Tests/CI, 6 files: `transientFailure.test.ts`, `e2e/transient-failures.spec.ts`,
`playwright.config.ts` (**a second project and a second production build**),
`package.json` (`test:e2e` now needs `DOTENV_PRIVATE_KEY`), `a11y.yml`,
`.gitignore`.

### 2.3 Defects in what is there now — all DONE (Order steps 1–2; see §2.4 for what landed)

**2.3.1 `useRpc` lost its retry on every HTTP status — a regression I
introduced.** `callRpc` (`apiClient.ts:198`) throws a bare `Error` with no status,
so `isTransientError` returns `false`. Before: `retry: 1` retried it once. After:
**zero for any status**, 429 and 503 included. Precisely: a *network* failure
still retries, because `fetch` rejects with a `TypeError` and
`transientFailure.ts:120` catches that — so it is not zero unconditionally, which
makes it harder to notice. Applies to `useRpcMutation` (row 4b) too.

**2.3.2 A 429 on `get_schema` renders a 404 page.**
`routes/_app.$moduleId.$table_name.tsx:114` — `fetchEntityMetadata()` catches
*every* error and returns `null`; the loader turns `null` into `notFound()`. A
rate-limited or cold-started load tells the user **the table does not exist**.
Blocking loader, so it is the whole page. **Most severe item in this plan.**
Pre-existing, not introduced by me.

**2.3.3 The budget cannot survive a real limiter.** 4 attempts over a jittered
300/600/1200ms — ~2.1s worst case. Evidence: the audit loads 200+ views back to
back and **3 views still rendered the provider error card**.

**2.3.4 `Retry-After` capped at 5s is worse than ignoring it.** Server says 30s,
we return at 5s — disobeying an explicit instruction and burning the budget.

**2.3.5 Queries have no jitter and ignore `Retry-After`.** TanStack's default
`retryDelay` is `Math.min(1000 * 2 ** n, 30000)` (verified in
`@tanstack/query-core@5.102.8`).

**2.3.6 Two policies where there should be one** — `transientFailure.ts` for two
paths, TanStack's retryer for queries.

### 2.4 Planned changes — DONE, verified

What landed, in one commit: `lib/retry.ts` (policy), the interceptor in
`lib/apiClient.ts` applying it to both branches, `QueryClient retry: false`,
`status`/`url` on `cause` from `callRpc` and the three mutations, the table
route's loader mapping only a 404 to `notFound()`, and
`components/RouteErrorPage.tsx` as the router's `defaultErrorComponent` with a
Try Again that calls `router.invalidate()`. Two refinements the plan did not
foresee: a `POST …/rpc/…` is a *call* with its own narrower status set
(`425/429/502/503` — answers given before the function runs; `useRpcMutation`
writes through the same path), and a 404 carrying PostgREST's own `code` body is
**definitive**, so a missing table costs one request, not the budget. Verified by
`retry.test.ts` (node, injected clock) and 12 tests in
`e2e/transient-failures.spec.ts` counting attempts per request shape — including
the `get_schema` 429 → grid, and 429-forever → error card → Try Again → grid.
One finding on the way: `Retry-After` is invisible cross-origin unless the server
sends `Access-Control-Expose-Headers` (recorded in CONTEXT-MEMORY).


> **R1 — one file owns the policy.** `lib/retry.ts` exports `attempts`,
> `baseDelayMs`, `maxDelayMs`, jitter, the retryable status set, `Retry-After`
> handling and a `maxElapsedMs` budget. Nothing else configures retrying.
>
> **R2 — every request goes through it, with the exceptions named in code.**

**Where:** the fetch interceptor, `lib/apiClient.ts:37`. It already replaced
`globalThis.fetch`, so **every** request passes through it, vendor code included.
Only relative URLs are rewritten; absolute ones fall to `_originalFetch` in the
else-branch but still enter the function. Wrapping both branches makes R2 true by
construction — a new call site cannot forget it.

**The three exceptions, each explicit:**

| Path | Decision | Why |
| --- | --- | --- |
| Mutations (`useTableMutations.ts:39,130,205`) | **never retry** | a retried `POST` is a duplicate row. Excluded by HTTP method, not by omission |
| `refreshSchemaCache` (`apiClient.ts:148`) | **leave unretried** | it calls `_originalFetch`, captured before interception, so it bypasses the choke point by design — and its failure is already swallowed on purpose: it is a cache-invalidation *notification*, not a read the UI waits on. Retrying it would add load during a rate limit to no user-visible benefit |
| Boot (`config.ts:178`, `:280`) | retry, but **must not call `getConfig()`** | these run before `_config` exists — the trap that already caused one blocked boot |

**DECIDED — the transport retries; react-query does not.** `QueryClient retry:
false` goes in `main.tsx` **in the same commit** as the interceptor change, so the
two can never stack (4 × 3 = 12 requests against a service asking us to slow
down). This satisfies R2 for the twelve paths that go through `globalThis.fetch`;
`refreshSchemaCache` is the one deliberate bypass, resolved above. Accepted
cost: react-query no longer sees the failures being retried, so its devtools show
one slow query rather than three attempts.

**DECIDED — the budget is ~10s of TOTAL elapsed time**, not a per-wait cap.
`Retry-After` is obeyed *within* that budget rather than clamped to 5s (§2.3.4),
so a server asking for 8s gets 8s and one asking for 30s ends the attempt
immediately instead of being ignored.

**DECIDED — what the user sees while it retries:**

| When | Shown |
| --- | --- |
| First load | the boot skeleton stays up — nothing has rendered yet |
| A refetch | the previous data stays on screen (TanStack keeps it) |
| Budget spent | an error card **with a working Retry button** — never a 404, never a terminal card for a transient condition |

**The rest:** attach `{ status, url, body }` to every thrown error (`callRpc`
first — it is the cause of §2.3.1); fix `fetchEntityMetadata` so a transient
failure is retryable, not `notFound()`; obey `Retry-After` and cap *total elapsed
time* instead; full jitter everywhere; cover the eleven currently-unretried paths
(rows 4, 4b, 5–12 and 14 of §2.1); pace the audit; rename the module (§1.3).

**Verification:** the §2.1 table is the checklist — a test per path asserting the
**number of attempts** a 429 produces, explicitly including `useRpc`/`callRpc`,
which **no test in the repo touches today**. That blind spot is why the
regression shipped.

---

## 3. Data-layer defects — OPEN

### 3.1 A PATCH or DELETE that matches no row reports SUCCESS

PostgREST answers `200 []` for a filter matching nothing, and `204` for a delete.
`useUpdateRecord` resolves with `undefined`; `useDeleteRecord` resolves at all. So
the UI says **"saved"** or **"deleted"** for a record that is not there.

Found when `hooks/useTableMutations.test.tsx` started talking to the real
database; the previous version of that test asserted a `404` the server has never
sent. Current behavior is pinned by the test, with the gap named.

**DECIDED — treat it as an error.** Create and update already send
`Prefer: return=representation` (`useTableMutations.ts:36,127`), so an empty array
back means the filter matched nothing: throw "this record no longer exists"
instead of resolving. **Delete needs the header added** — it currently sends only
`createApiHeaders(token)` (`:203`) and gets a bodyless `204`, so there is nothing
to inspect until `Prefer: return=representation` is set there too.

`CONTEXT-MEMORY.md:883-887` still describes this as an open product decision;
update it when the fix lands.

### 3.2 The self-hosted opt-out works on one channel and fails on the other

**Corrected after checking the source — the earlier flat claim that it "does not
work" was wrong.** The empty-string opt-out behaves differently depending on
which channel carries it, because `runtimeEnv()` and `??` disagree about what an
empty string means.

**Channel A — the Vite build-time value. WORKS.**
`import.meta.env.VITE_CONTROL_PLANE_URL` is inlined as `""`; `runtimeEnv()`
returns it as the fallback; `("" ?? default)` keeps `""` because `??` only
catches null/undefined; `.trim()` leaves `""`, which is falsy, so
`config.ts:161` takes the self-hosted branch. **Proven in the repo**:
`playwright.config.ts` sets `VITE_CONTROL_PLANE_URL: ''` for the e2e build and
the login journey authenticates against the test IdP — which only happens on the
self-hosted branch.

**Channel B — the Docker `window.__ENV__` value. FAILS.**
`docker/gen-config.sh:66-68` emits `"VITE_CONTROL_PLANE_URL": ""` for an empty
`docker/.env` entry. `runtimeEnv()` (`lib/runtimeEnv.ts:40`) treats `''` as
**absent** — deliberately, because that is how an unset key falls back to the
build-time value — and returns `buildTime`. In the Docker image `buildTime` is
`undefined`: `apps/web` has no `.env`, `vite.config.ts` sets no `envDir`, so the
root `.env` is not loaded, and it disables the key anyway
(`_VITE_CONTROL_PLANE_URL`). So `(undefined ?? 'https://app.semantius.com')`
wins and the SPA resolves a tenant from the subdomain regardless of what the
operator wrote. Nothing warns.

Dates from `0284d32 "docker poc"` (2026-07-12), which introduced `runtimeEnv()`
and its empty-string rule.

**So:** a `.env`-based deployment can opt out; a Docker deployment cannot.
The fix is a product decision about how `window.__ENV__` expresses "explicitly
empty" versus "not set" — a sentinel like `none`, or inverting the default.
Tests currently pass a single space, which survives the accessor and trims to
empty (`src/test/runtimeConfig.ts` names it `SELF_HOSTED`).

---

## 4. Accessibility findings

### 4.0 `/xcustomers` excluded — APPLIED (requested)

`/xcustomers`, `/new`, `/1`, `/1/edit` are an internal test page, the same class
as `/form-playground`. Now in `EXCLUDED` in `scripts/a11y-audit/routes.mjs`.

| Criterion | Before | After |
| --- | --- | --- |
| 2.4.7 Focus Visible | 14 findings, **all** on `xcustomers-record` | gone |
| 2.4.2 Page Titled | the title collision was demo-vs-real | gone |
| 1.4.10 Reflow | 5 findings, 1 on `/xcustomers` | 4 |
| cantTell | 3, two of them `/xcustomers` | 1 |

Expected **7 Partially Supports → 5**. The run gave **3**, because §4.1 and §4.2
landed before it: 2.4.7, 2.4.2, 1.4.10 and 2.5.8 all → Supports; cantTell 4 → 2.

**DECIDED — keep it, excluded from the audit only.** It stays as a scratch page.
Consequences accepted, and they are not free: it remains in the bundle, its known
defects (cannot save — `PGRST204`; no `<h1>` on the edit route) stay in the repo,
and `CustomerForm.test.tsx` remains one of the suites that writes to the real
tenant on every `pnpm check` (§5.2). Revisit if it starts costing more than it
gives.

For the record, the alternative was: `/xcustomers` and
`components/customers/CustomerForm.tsx` exist only for each other —
`CustomerForm` has exactly three usages in production code, all in
`_app.xcustomers.tsx:47,541,553`. If the route is not a product surface, both are
dead weight and could be deleted outright rather than excluded — **and so is
`components/customers/CustomerForm.test.tsx`**, which renders it six times and is
one of the suites that writes to the real tenant (§5.2).

### 4.1 Reflow at 320px · 1.4.10 · 4 findings — DONE (run: 0 findings, Supports)

Two call sites, one pattern: `flex items-center justify-between`, heading left,
~150px button right. At 320 the button hangs 13–14px past the viewport with no
scrollable ancestor — unreachable, not merely ugly.

| File | Line | Button |
| --- | --- | --- |
| `components/views/View.tsx` | 403 (flex row), 419 (button) | "Add {singular_label}" |
| `routes/_app.documents.tsx` | 21 | "New Document" |

Let the row wrap, or shrink the button below `sm:`. Verify at 320.

> 320px is not a phone target. WCAG 1.4.10 requires a width equivalent to 320 CSS
> px — **1280px at 400% zoom**. The user is someone zooming a laptop.

### 4.2 Target size · 2.5.8 · 6 findings — DONE (run: 0 findings, Supports)

Measured on the preview at 320: every title button is **24px tall** (20px line
box + `py-0.5`), so `min-h-6` would indeed have changed nothing. The dimension
that fails is **width**: the sorted "Id" title in the `justify-end gap-0.5`
numeric header is **16 × 24**, and the 24 × 24 sort-icon button sits **2px**
away, so neither the size rule nor the spacing exception holds. `w-full` is only
a maximum inside a flex header; a two-letter title shrinks to its text. Fix:
`min-w-6` (and `min-h-6`, to state the rule) on the button variant in
`filters/table-column-title.tsx`. Awaiting the run.

The element is right: `components/niko-table/filters/table-column-title.tsx:48-57`,
matching the report's selector
`.justify-end > .truncate.font-semibold.focus-visible\:outline-offset-2`.

**But "add `min-h-6`" is probably a no-op and must not be applied blind.**
`text-sm` is a 20px line box and `py-0.5` adds 2px each side — **exactly 24px**
already. All six findings are on `entity-list` at **320/390/640 only**, and only
inside a `.justify-end` (numeric) header, which `DataTableView.tsx:772` gives
`justify-end gap-0.5` — **2px** to the adjacent control. That points at axe's
*spacing* clause, not its height clause.

**Measure the rendered box and the gap before changing anything.** The fix is
more likely `gap` or width than `min-h`.

### 4.3 Focus not obscured · 2.4.11 · 64 → 54 → **0** — DONE (run `pinning-lg`: Supports on 164 views)

The run after 4.3a/4.3b: **54 findings, 18 views**, and they split cleanly:

| Count | Focused control | Covered by |
| --- | --- | --- |
| **42** | the **grid's pagination controls behind the open record Sheet** (`nav > … page-number-input`, the page-size "10▼", prev/next) on `entity-record`, every viewport | the form's sticky action bar (28), a field description (8), a field (4), other (2) |
| 12 | a column-title button on `entity-list` at **768** (5 × 2 themes) and 844×390 landscape (1 × 2) | the sticky `thead` or the neighboring pinned `th` |

**The 42 are not a layout problem until one question is answered: why can the
probe focus controls behind a modal overlay at all?** Either the record Sheet
leaves the page behind it focusable (a real 2.4.11 *and* 2.4.3 defect — Tab
leaves the form into controls the user cannot see), or Base UI marks that
subtree inert and the probe's `__inertOrHidden` does not recognize the way it
does it. CONTEXT-MEMORY says Base UI makes the page inert when a Sheet opens;
the run says the controls took focus.

**ANSWERED on the preview (`/nwind/orders/11077` at 390, Sheet open):** the
record Sheet's popup is `role="dialog"` with **no `aria-modal`**, `#root` has
neither `inert` nor `aria-hidden`, and `#page-number-input` behind it **takes
focus** (`document.activeElement === el`). So it is the app, not the probe: the
page behind the record overlay is fully focusable, and a keyboard user can Tab
out of the form into controls they cannot see. That is a 2.4.3 defect as well as
the 42 findings of 2.4.11. The sentence in CONTEXT-MEMORY ("Base UI marks the
page behind it inert") is true of whichever Sheet that session measured and
false of this one — check what `View.tsx:456`'s `<Sheet>` passes (Base UI's
`modal` prop; the shadcn `ui/sheet.tsx` wrapper may default it off) and fix it
there. Fixing that removes the 42 by construction; the 12 are separate.

**ANSWERED FURTHER, and the first answer was half wrong.** Measured on the same
preview: Tab from the Sheet's last control wraps to its first, page scroll is
locked — Base UI's `modal` (default `true`) IS in force. What is not in force is
the *hiding* of the page behind, and only sometimes: opened from a row click,
the pagination behind the Sheet is under an `aria-hidden` ancestor; opened by
**deep link** — which is how every audit view opens — nothing in `#root` is
hidden at all. Base UI marks the outside once, at open; content the grid
renders after that (its rows and pagination arrive with the data) is never
marked, and Base UI's marker also exempts every `[aria-live]` element and its
ancestor chain (`markOthers.js`: `avoidElements.concat(ariaLiveElements)`), of
which this page has five — the pagination's "1-10 of 830 items", two dnd-kit
live regions, the route announcer, the toaster. So the 42 findings were
controls **no Tab press reaches**, focused by script. They are not 2.4.11.

- `probes.mjs`: `FOCUS_OBSCURED` and `CONTROL_CONTRAST` now measure only the
  open modal dialog's subtree when one is open (`__openModalDialog`).
- **§4.3h — APPLIED: `components/a11y/ModalInert.tsx`** puts `inert` on
  `#root` while any Base UI dialog is open (option 1 below), and `main.tsx`
  portals the toaster out of `#root` so option 1 costs nothing (option 3).
  `e2e/modal-inert.spec.ts` proves the page behind a deep-linked Sheet is
  inert and that `inert` lifts before focus returns to the opener. The
  original finding, for the record:
  the deep-linked Sheet leaves the page behind it
  exposed to a screen reader's virtual cursor. Not a keyboard defect (Tab is
  trapped), not 2.4.11, but real: a user who opens `/nwind/orders/11077` by URL
  can read and, by touch or virtual cursor, reach the whole grid behind the
  dialog. Candidate fixes, in order of preference: (1) put `inert` on `#root`
  ourselves while a modal Sheet is open — robust against late-rendered content
  and live regions, at the cost of silencing the toaster's live region during a
  Sheet; (2) ask upstream for `outsideElementsInert` on `Dialog.Root` (the
  floating-ui option exists inside Base UI, unexposed); (3) move the toaster and
  the announcer outside `#root` so (1) costs nothing. Needs a decision on the
  toaster trade-off.

**The 12 at 768 — ANSWERED and APPLIED.** Measured: at 768 the sidebar leaves a
**480px** grid container and the pinned set takes **370px** of it (100 id + 220
label + 50 actions), so `scroll-padding` reserves 370px and leaves a 110px band
that cannot fit a 156px title button; `el.focus()` does not scroll at all and
the button sits under the right pinned column. 4.3a's per-render padding was
correct and could not help — the plan's own caveat. Pinning now needs `lg:`
(64rem, `hooks/use-min-width.ts`, `GRID_PINNING_MIN_WIDTH_REM`), where the
container is ~736px; `isMobile` is no longer the switch.

The 12 are the grid at exactly the width pinning turns back on (`md` = 768):
4.3a's per-render padding did not clear them. Next: measure the pinned width
and the scroll-padding actually applied at 768 on the preview.

Only after both: the layout decision (action bar non-sticky below `md:`, smaller
sticky heights, `scroll-margin` on the controls).

The only large one. 28 × the record form's sticky action bar; 14 × the grid's
sticky header over a sort button; 8 × a field description over its control; 14 ×
pagination under the same two surfaces. `entity-record` and `entity-list`, every
viewport, worst at 320 and 768.

`scroll-padding` on `html`, the Sheet/Dialog and the grid container took this from
300 findings to 64. **Two known defects in that mechanism are almost certainly
part of the remaining 64 and must be checked first — they may be most of it:**

**4.3a The grid's `scroll-padding` is computed once, with the desktop pinned
set.** `components/niko-table/core/data-table.tsx:112-122` memoizes on `[table]`,
which is the table object, not the pinning state — so the padding is frozen at
first render and never follows a change in pinned columns or viewport.

**4.3b Column pinning is not actually off below `md`.**
`components/data-table-view/DataTableView.tsx:687` empties `leftPinnedKeys` on
mobile, but `:979-985` still pins `'__drag'` when drag-and-drop is on and
**always** pins `right: ['actions']`. The documented "no sticky columns on a
phone" behavior is therefore only partly true, and a pinned column is exactly
what obscures a focused control at 320/390.

Fix these two, re-run, and see what 2.4.11 is actually left with. Only then take
the layout decision: action bar non-sticky below `md:`; smaller sticky heights at
narrow widths; `scroll-margin` on the controls.

### 4.3c Skip link targets a region that contains the header · 2.4.1 — APPLIED (target is the content block below the header; `<main>` keeps its label)

`components/layout/AppLayout.tsx:23-30` — `SidebarInset` carries
`MAIN_CONTENT_ID` and the `<header>` is *inside* it, so "skip to main content"
skips to a target that still includes the header. 2.4.1 currently reports
Supports because the audit checks that the link exists and its target resolves,
not what the target contains.

### 4.3d The crm-home Sheet is capped 64px narrower than it asks for — APPLIED

**Corrected: this is a max-WIDTH defect, not the 75% width one.** The 75% symptom
is already fixed — `routes/_app.crm.home.lazy.tsx:39` carries
`data-[side=right]:w-full`, which is the same tailwind-merge group key as
`ui/sheet.tsx:56`'s `data-[side=right]:w-3/4`, so the call site wins and lines
36-38 say so in a comment.

What is still live: the call site's **`sm:max-w-md`** (448px) loses to
`sheet.tsx:56`'s **`data-[side=right]:sm:max-w-sm`** (384px), because the
`data-[…]:` modifier makes it a different group key that tailwind-merge cannot
collapse, and it then out-specifies the bare class. **85.7% of the intended
width, at ≥640px only.** Fix by repeating the modifier at the call site.

### 4.3e niko-table column-title button — RESOLVED, verified in source

The recovered plan's ⚠ read "column title `<button>` *(library-level only)*".
What that meant: the fix was made in niko-table, not at any call site. That is
the whole path — `filters/table-column-title.tsx` renders a `<button>` exactly
when it is given `onClick`, `components/data-table-column-title.tsx` passes one
exactly when `column.getCanSort()`, and every grid header in the app comes from
that component through `DataTableColumnHeader`. So a sortable header title IS a
real button (keyboard-operable, named by its text) and a non-sortable one is a
`<div>`, everywhere. Nothing is left to do here; the only open question about
that element is its target size, which is §4.2.

### 4.3g Two caveats carried from the deleted plan — OPEN

- **The excluded drizzle-cube dashboard is still a route users visit.** Scoping
  it out of the claim bounds the work, not the user's experience. This must
  survive into `ACCESSIBILITY.md` (§6.2); it currently exists only in the draft
  that §6.2 orders discarded.
- **The `tests-ops` MCP connector cannot manage API keys from an agent session** —
  its token expires and its key tools are blocked by the permission classifier.
  An environment quirk worth one line in `CONTEXT-MEMORY.md` so it is not
  re-discovered the hard way.

Carried from the old plan as "library-level only". Nobody has established what it
asserts. Resolve it or drop it deliberately; do not let it sit as a ⚠ forever.

### 4.3f A comment references a file deleted months ago — DONE

`lib/apiClient.ts:218` still reads *"…the grid cell renderers in
DataTableView/**TableView** (render side)"*. `TableView.tsx` was deleted with the
dead `data-table-view/TableView.tsx` (−661 lines); the folder now holds only
`DataFormPage.tsx` and `DataTableView.tsx`. Trivial, but it is a comment sending
the next reader to a file that does not exist.

### 4.6 The error card fails 1.4.3 — APPLIED after the run, pinned in the token test

Run `pinning-lg` reached an error state by accident (the tenant's bad minute)
on four views and axe flagged two nodes on each: `ApiErrorDisplay`'s message and
its Details button, `text-muted-foreground` on `bg-destructive/10`. No earlier
run had rendered the card; no token-test pair had asked. Both nodes are
`text-foreground` now and `tokenContrast.test.ts` pins foreground-on-/10 over
every base. Not re-audited — the state cannot be produced on purpose — so the
next full run is the confirmation.

### 4.4 Vendor — `drizzle-cube@0.5.8` on `/nwind` — 1.4.3 DONE locally; 1.3.1 and the upstream issue OPEN

1.3.1 `h1 → h3` on "No Portlets" (a heading level is not fixable in CSS) and
1.4.3 one `dc:`-prefixed button below 4.5:1 (fixable by a local override). One
upstream issue covering both.

- **1.4.3 — measured, overridden, confirmed.** The button is "Add Portlet"; its
  text is the vendor's light `--dc-primary` `#3b82f6` on white, **3.68:1**.
  `theme-a11y.css` now sets `--dc-primary: #1d4ed8` (6.30:1) and a matching
  hover for `html:not(.dark)` — light only, the dark palette was measured clean.
  Run `pinning-lg`: the seven vendor findings are gone.
- **1.3.1 — vendor markup, unchanged.** Installed is `0.5.8` (not 0.5.6 as
  earlier notes said); latest on npm is **0.9.0** (2026-09-02). Whether the
  heading level was fixed upstream, and what the API changed across four minor
  versions (CONTEXT-MEMORY records `ChartProps` / `useTranslation` not being
  exported in 0.4.x), is a separate upgrade task — not attempted here.
- **The upstream issue is not filed** — filing on a third-party tracker is the
  human's call. Text to file: *"`/nwind` dashboard, empty state: the `No
  Portlets` placeholder is an `<h3>` directly under the page's `<h1>` (WCAG
  1.3.1, heading level jump); and the default light `--dc-primary` `#3b82f6`
  gives 3.68:1 for the `Add Portlet` button text on `--dc-surface` white (WCAG
  1.4.3 needs 4.5:1). Both reproduced in 0.5.8."*

### 4.5 Focus visible · 2.4.7 — DONE (run: Supports on 42 views, no refused-focus evidence)

All 14 findings were on `xcustomers-record`, which §4.0 removes. That is **not**
evidence the app is fine: the probe (`probes.mjs`, `CONTROL_CONTRAST`) calls
`el.focus()` and skips any control where `document.activeElement !== el`, so a
modal that traps focus yields "no measurable focus indicator" with nothing wrong.
The blind spot is now reported rather than skipped: `CONTROL_CONTRAST` returns
`sampled` and `unfocusable`, and `report.mjs` treats "every sampled control
refused focus" as *not measured* (evidence, not a 2.4.7 failure). Confirm on the
run that no route now fails 2.4.7 for that reason alone.

---

## 5. Tests

### 5.1 The last substitutions — OPEN

The substitution ratchet (`src/test/substitutions.test.ts:331`) is at **6**, down
from 96. The split is **3 movable / 3 deliberate** — an earlier draft said 4/2 and
contradicted `CONTEXT-MEMORY.md:814`.

The 3 movable are all in `routes/login.test.tsx`: a mocked `@/hooks/useAuth`, a
mocked `@tanstack/react-router`, and a hand-built `#app-loader`
(`test/bootOverlay.ts` already exists to replace it).

Blocked on infrastructure: `/login`'s only interesting branch is
`useAuth().error`, and the sole real way to produce it is a browser that withholds
`crypto.subtle` — a **non-secure context**. In a secure context `logIn()`
navigates the page away, which a component test cannot survive. Needs a third
Playwright project: `vite preview --host 0.0.0.0`, the machine's address from
`os.networkInterfaces()`, a project with that `baseURL`.

It also closes the one `UNCOVERED` note left in `lib/config.test.ts` — that the
secure-context precheck *short-circuits*, recording the error and resolving no
endpoint.

**WITHDRAWN — an earlier draft of this plan said the branch was dead. It is
not.** The boot gate does screen the non-secure-context case
(`config.ts:144-146` → `main.tsx:97-103` renders `BootFailure` and never mounts
the router), but that is only one of the triggers, and `routes/login.tsx:22-27`
lists the others in the source itself: *"a login that never starts — non-secure
context withholding crypto.subtle, **offline network, blocked storage** —
surfaces ONLY through this value."*

`react-oauth2-code-pkce`'s `redirectToLogin` writes the PKCE verifier to storage
**before** it touches crypto (`storage.setItem(codeVerifierStorageKeyName, …)`),
so blocked `localStorage` — Safari "Block All Cookies", a partitioned iframe, a
quota error — rejects, and the library turns that into `useAuth().error`.
`lib/secureContext.ts` tests only `isSecureContext && crypto.subtle`, so nothing
upstream catches it. Refresh-token failures set the same `error` on an interval,
route-independently.

**So the branch stays.** Deleting it would reinstate the exact infinite-spinner
hang the boot-overlay invariant exists to prevent, and would break
`src/test/appLoaderInvariant.test.ts:45-46` — removing the branch removes the
only `hideAppLoader` from `login.tsx`, leaving a bare `return null` at `:61`,
which that test fails by design.

The three substitutions therefore stay, and the ratchet stays at **6**. Closing
them needs the LAN-origin Playwright project after all: `vite preview --host
0.0.0.0`, the machine's address from `os.networkInterfaces()`, a project with
that `baseURL`. It also closes `lib/config.test.ts:46-48`'s `UNCOVERED` note.

The 3 deliberate: `appLoader.test.ts` (1) needs an element with *no* transition,
to prove the 300ms fallback fires where `transitionend` never does; and
`SchemaForm.test.tsx` (2) works around the form's own focus timer.

### 5.2 Decisions taken silently in committed test code — OPEN, need a ruling

1. **The suite now writes to the real tenant.** `useTableMutations.test.tsx`
   creates and deletes real `modules` and `entities` rows (prefixed `_vitest_`)
   on every `pnpm check`. Cleanup is by prefix in `afterEach`.
2. **Coverage was dropped**: `useTable` lost its "error response with no message
   field" test; `ProtectedRoute` went from 7 tests to 4.
3. **`2.4.7 is probably a probe artifact`** was asserted in a document from
   reading the probe, never verified (§4.5).

---

## 6. Housekeeping

### 6.1 The audit's double-counted coverage — APPLIED; README note and third-run row DONE

`report.mjs` incremented `observed` once per **probe**, not once per view, so a
criterion two probes touch reported twice the views that exist — 3.1.1 claimed
**440 of a 224-view set**. It is a `Set` now.

Not recoverable from a stored artifact, so **all three** kept runs keep their
numbers — including `20260906T115727-status`, which was generated *before* the
`Set` fix and still says "of 442" and "of 221". `a11y-reports/README.md` should
say so in one line, and should also gain a row for that third run, which it does
not currently list.

### 6.2 `ACCESSIBILITY.md` must be rewritten, not edited — DONE, from the valid run, leading with coverage

The uncommitted draft uses the pre-rename vocabulary and numbers from a run that
predates the `/xcustomers` exclusion. Discard its tables and regenerate them from
the first valid run.

**And it must lead with the coverage, not the findings.** The last run reports
**29 of 55 criteria Not Evaluated** — 4 because the criterion asks whether
something is *good* rather than *present* (1.1.1 alt text, 2.4.3 focus order,
2.4.6 headings, 4.1.3 status messages, where the audit emits the raw material for
a human to read), and **25 because no check covers them at all**. So more than
half the standard is unmeasured. A document that opens with "5 criteria fail" and
buries that is a dishonest conformance claim, whatever the 5 say.

Also carry over, as scope caveats: **the audit only sees the states it reaches**
(no modal flows, no error states, no empty-vs-populated grids), and **no
screen-reader pass has ever been run**.

### 6.3 `README.md` — APPLIED (requested)

Accessibility section cut to the claim, the scope exclusions and a link
(−62 lines). What I *deleted* (Known limitations) versus *moved* into
`ACCESSIBILITY.md` (the four evaluation layers) was my choice, not yours.

### 6.4 Git, and CI that has never run — pushed; first CI run FAILED, fix in tree

Dispatched `checks.yml` on `main` for the first time (run 34043865897): lint
passed, then `sh: 1: dotenvx: not found` — `pnpm check` needs the global dotenvx
that `workplace/setup.sh` installs on every sandbox and nothing installed on the
runner. An "Install dotenvx" step is added to `checks.yml`; it can only be proven
by a push and a second dispatch, which is the user's call (§0). `a11y.yml` runs
`setup.sh` itself and so did not have this gap.

44 unpushed commits on `main`; the merged `feat/a11y-wcag-aa-mobile` branch still
exists and can be deleted.

**The CI has never executed on GitHub.** The branch was never pushed, so
`a11y.yml`, `checks.yml`'s secret plumbing and `docker-publish.yml`'s `needs:`
graph have only ever been read, not run. The YAML parses and every `uses:` target
exists; that is all anyone knows. **The first push is the first real run**, and it
now depends on `DOTENV_PRIVATE_KEY` reaching two jobs that never needed a secret
before.

### 6.5 Verification nobody has done — OPEN

- **The single-column form at 390** — looked at on preview
  `main-20260906170619`: `screenshots/20260906170944-order-record-390.png`
  (`/nwind/orders/11077`). Single column, labels above controls, descriptions
  below, the sticky Submit/Reset bar clear of the last field. Nothing to fix from
  looking; the human's own look is still theirs to take.
- **Per-commit `pnpm check`** — observed green once on the tree before the retry
  and grid commits (63 files, 651 passed, 4 skipped); the full suite is run again
  on the final tree after the audit, and that result is the one that counts.
- ~~**Revisit the audit's own backoff** once §2.4 lands~~ — kept, re-explained in
  `run.mjs`: the app's budget is ~10s, the provider's rate-limit window is longer,
  so the audit's 3s→60s waits are for what outlasts the app's retry.

### 6.6a `docker-vo/` references — DONE

The folder was already deleted; six files still described it as a live sibling
image. Cleaned: `.gitignore`, `docker/docker-compose.yml`, `docker/Dockerfile`,
`docker/nginx.conf`, `docker/README.md` (the "HTTPS" line and the whole
"Relationship to `docker-vo/`" section), and `CONTEXT-MEMORY.md` — whose Docker
section now describes the nginx image only, with one explicit note that the Caddy
variant existed and is gone, so nobody re-adds it from these notes.

### 6.6 Move to `CONTEXT-MEMORY.md` — DONE ("Working in this checkout" and "Ideas already tried and rejected"; `RESTORED.md` deleted)

These were only ever written in the deleted plan. Nothing in the repo records
them, and a fresh session will hit or re-propose each one:

- **`core.autocrlf=true` on an LF worktree.** Restore a file from a byte copy,
  not `git checkout --`; the "LF will be replaced by CRLF" warnings on every
  commit are noise.
- **The `apiClient` interceptor is at `lib/apiClient.ts:37`, not in
  `runtimeEnv.ts`** — `CONTEXT-MEMORY.md:536` currently attributes the URL
  rewriting to `runtimeEnv()`, which is a pure accessor. Fix that line.
- **The dead-ideas list**: jsdom in any project; polyfilling a browser API to
  make a test pass; stubbing `window.location`; axe-in-jsdom; isolated component
  tests with invented props; `form-playground` as a test surface; MSW + recorded
  fixtures; deleting Playwright; a pre-push hook; seeding `loginInProgress` to
  fake a failed exchange; routing the test token through `#jwt` instead of
  `globalSetup`; a timer on the audit; a single-token audit run.
- Optional: never `git commit` without pathspecs when two sessions share a
  checkout; the Bash heredoc-truncation and backtick-in-double-quotes quirks.

---

## Deliberately not in this plan

- **The module → entity cascade** is not a defect. Deleting a `modules` row
  cascades to its `entities` (a database-level foreign key), verified against the
  tenant this session. It is behavior the test cleanup now relies on and is
  asserted in `useTableMutations.test.tsx` — the only assertion of it anywhere.
  Recorded in `CONTEXT-MEMORY.md`; nothing to fix.
- **`CustomerForm` cannot save** (`PGRST204` — its fields are not the tenant's
  `customers` columns). It is reachable only from `/xcustomers`, which §4.0
  excludes as an internal test page. Not a product defect; folded into the
  delete-or-keep question in §4.0.
- **`components/form/Playground.tsx` hardcodes `theme="light"`** — developer
  tool, out of scope by earlier decision.

---

## Decisions still open

Three of these gate an Order step and three do not — stated per row, because an
earlier draft claimed all five were non-blocking and that was false.

| # | Question | Section | Gates |
| --- | --- | --- | --- |
| 1 | Is it acceptable that `pnpm check` writes to the real tenant on every run? | §5.2 | nothing — investigate any time |
| 2 | Restore the dropped test coverage (`useTable`'s no-message-field case, `ProtectedRoute` 7 → 4) or accept it? | §5.2 | nothing |
| 3 | Push the 44 commits to `origin/main`, and delete the merged branch? | §6.4 | **Order step 13 IS this decision** |
| 4 | ~~Resolve or drop the unverified niko-table column-title item~~ resolved: verified in source | §4.3e | nothing |
| 5 | How should `window.__ENV__` express "explicitly empty" vs "not set"? | §3.2 | **Order step 10's §3.2 half** |

## Order

1. ~~§2.3.1 and §2.3.2~~ DONE.
2. ~~§2.4~~ DONE, including §1.3.
3. ~~§1.1 docs~~ DONE.
4. ~~§4.3a and §4.3b~~ APPLIED. Folded §4.1, §4.3c, §4.3d and the §4.5 probe
   change in ahead of the run, so one 31-minute run measures all of them.
5. ~~Re-run the audit~~ DONE: 3 Partially Supports (not 5 — §4.1/§4.2 landed
   first), 2 cantTell (not 1 — both provider 429s that outlasted every retry).
6. ~~§4.2~~ measured on the first preview, fixed (width, not height), in the run.
7. ~~§4.3e~~ RESOLVED — verified in source, nothing to land.
8. ~~§4.5 triage~~ DONE; §4.4 — 1.4.3 overridden locally, the issue text is drafted, filing is the human's call.
9. ~~§4.3~~ DONE: run `pinning-lg` reports 2.4.11 Supports on 164 views;
   §4.3h applied (`ModalInert`, toaster portaled) and proven in
   `e2e/modal-inert.spec.ts`. §4.6 (error card contrast) applied after the run.
10. §3.1, §3.2 — the two data-layer decisions.
11. §5.1 — confirm `logIn()` has no other failure mode, then delete the dead
    branch and its three substitutions.
12. ~~§6.6~~ DONE.
13. §6.4 — pushed; read the first CI run's result.
14. ~~§4.3f~~ DONE.
15. ~~§6.1~~ DONE.
16. §6.5 — the three verifications nobody has done.
17. ~~§6.2~~ DONE from the valid run. This file stays until §3, §4.3, §4.4,
    §5.1, §5.2 and §6.4's CI re-run are closed.
