# Mobile + WCAG 2.2 AA — restart brief

> ## RESUME HERE (written at the end of the third session, 2026-09-06 00:10 UTC)
>
> **Nothing is running. The parallel session was stopped by the human; its
> in-flight start on §6a step 4 (a root `globalSetup` that mints one token and
> provides it to both projects, `src/test/session.ts` with `seedSession()`,
> the `ProvidedContext` typing, `pnpm check` under dotenvx) passed the gate
> and is committed as commit 34, `test: step-4 plumbing — one real token per
> run, provided to both Vitest projects`.** The tree is clean apart from this
> file and `screenshots/`. Verify with `git status` and `git log --oneline -3`
> before assuming a second session is not back.
>
> **CI IS RED ON THIS BRANCH UNTIL THE NEXT COMMIT.** `pnpm check` now runs
> under dotenvx and the root `globalSetup` throws without `SEMANTIUS_API_KEY`,
> so `checks.yml` fails until it declares `DOTENV_PRIVATE_KEY` under
> `on.workflow_call.secrets` and `docker-publish.yml` passes it (see §6a step 4,
> "Plumbing first"). Locally `pnpm check` needs `DOTENV_PRIVATE_KEY` in the
> environment, which the sandbox and the devcontainer have.
>
> The branch has 34 commits (`git log --oneline main..HEAD`);
> §2's list below counts the two rename commits as one and predates the last
> three: `chore(a11y-audit): a diff script for two runs, and the redeployed
> preview URL`, `docs(a11y): the first kept post-fix audit run`, and the
> step-4 plumbing commit above.
>
> **§4 is DONE.** The second post-fix audit (`a11y-reports/20260905T230332-
> after-fixes.json`, committed) cleared the bar: 224 cells, 4 inconclusive, each
> named (three provider `429` cards the fixed probe now catches, one failed
> navigation), no phantom findings, the dark regression gone. Against the
> baseline at 390/1440: `2.4.1`, `1.4.11` → Supports; `1.4.3` 38 → 2; `1.4.10`
> 11 → 0; `2.4.11` 300 → 14; `2.4.7` 16 → 3; `1.3.1` 7 → 4; `2.5.8` 2 → 2;
> `2.4.2` one title collision. `node scripts/a11y-audit/diff.mjs` reproduces it.
> Seven criteria remain Partially Supports over the full matrix, mostly at 320
> (`1.4.10`, `2.4.11`, `2.5.8`, `2.4.7`) — new territory the baseline never
> measured, and the next accessibility work.
>
> **What is next, in order:** (1) §6a step 4 — first the CI secret wiring that
> makes the branch green again (`checks.yml` + `docker-publish.yml`), then the
> first real-API test that calls `seedSession()` (start with
> `hooks/useTable.test.tsx`), then the ratchet's "two substitutions" wording,
> then the rest of the step-4 table. (2) §10 — verify and fix how the APP
> handles a 429: a user must never see one. (3) The open criteria above.
> (4) Push the branch and watch the first CI run (§7 has never run on GitHub).
> Then delete this file.
>
> **Status: §1, §2, §4, §7 are DONE. §6a steps 1, 2, 3 and 5 are DONE — jsdom is
> gone (two projects, `node` and `browser`), every browser-primitive stub is
> gone, and the substitution ratchet covers fifteen families frozen at 40 (from
> 96). §6a step 4 (the real-API remainder) is OPEN and UNBLOCKED: the API key
> works again. The paragraphs below on the audit describe the first, discarded
> run and were written while the second was in flight; the box above is the
> result.**
>
> This file is the handoff. It assumes no prior context. Work it top to bottom.
> Two sessions have worked in this one checkout at the same time; both wrote
> here. `git status` before assuming anything, and never `git commit` without
> pathspecs — the shared index once carried one session's staged work into the
> other's commit under the wrong message (history rebuilt since, tree unchanged).
>
> **Do not commit this file.** It is session state, not product documentation.
> Delete it once §4 and §6a step 4 are done (or move §9's bugs to issues first).

---

## 0. Orientation — read before touching anything

- **The work is on branch `feat/a11y-wcag-aa-mobile`, 34 commits, not merged and
  not pushed.** `git log --oneline main..HEAD` first. The working tree is clean
  apart from this file and `screenshots/`.
- **`pnpm check` is green at the tip** (0 lint errors, 61 test files, 605 tests:
  601 pass, 4 skipped by design — the dark-only `/30` tint block in
  `tokenContrast.test.ts`, skipped in the light iteration) and `pnpm build` is
  clean. `release.sh` runs both.
- **Vitest has exactly two projects (`apps/web/vite.config.ts`): `node` — 15
  files — for everything that touches no window or document, and `browser` —
  Chromium via Playwright, 46 files — for everything that does.** The browser
  project takes every `*.test.tsx` plus `appLoader`/`config`/`apiClient`, with
  `maxWorkers` capped at 4. There is no jsdom anywhere. `pnpm check` therefore
  needs Chromium: a fresh clone runs
  `pnpm --filter @semantius/frontend test:e2e:install` once; `checks.yml` does.
- **Commands** (root `package.json`): `pnpm check` (lint + both projects),
  `pnpm test:browser`, `pnpm test:e2e` (three Playwright login tests),
  `pnpm test:a11y-audit --url <preview>` (the route × viewport × theme audit).
- **The rule that decides where a test runs:** the environment follows what the
  code under test touches, not the file's extension or folder.
- **Never stub a browser primitive** — `window.location`, `window.open`,
  `matchMedia`, `ResizeObserver`, `crypto`, `isSecureContext`, `fetch`, timers,
  `console`, a hand-built `#app-loader`. A test that seems to need one is
  telling you the design is wrong (a navigation is a link; an API call is a
  real call against nwind; a non-secure context is a real `http://<lan-ip>`
  origin in Playwright) or that it belongs in `e2e/`. A call-through spy that
  only observes is not a stub. `substitutions.test.ts` freezes every family and
  only lets the counts fall.
- **The palette is TWO files, and the order cuts both ways.** `global.css` is
  stock CLI output; corrections live in `theme-a11y.css`, imported after it.
  Every token set in its `:root` MUST be set in its `.dark` too (re-stating the
  stock value where dark needs nothing), because its `:root` also outranks
  `global.css`'s `.dark` by source order — `--muted-foreground` shipped dark at
  2.72:1 that way and the token test passed it, because its model layered
  `.dark` over `:root`. Both fixed (commit 30); the test pins the rule.
  `pnpm --filter @semantius/frontend a11y:tokens` re-derives minimums after a
  theme change.
- **Mutation-testing trap on this machine.** `core.autocrlf=true` while the
  worktree is LF. Restore files from a byte copy, not `git checkout --`. The
  "LF will be replaced by CRLF" warnings on every commit are noise.
- **Read `CONTEXT-MEMORY.md` sections `### Accessibility — the mechanisms…`,
  `### Accessibility testing — four layers…` and `### The audit harness — traps
  that cost hours` before editing `global.css`, the test projects or
  `scripts/a11y-audit/`.** Every trap recorded there is a silent failure.
- **`apps/web/src/components/ui/` is shadcn-CLI-owned. Never hand-edit it.**
  Custom components go in `components/ui-ext/`; `src/lib/utils.ts` is CLI-owned
  too, helpers go in `src/lib/utils-ext.ts`.
- **Tool quirks:** the Bash tool truncates very long heredocs — write files with
  the file tool; `agent-browser screenshot` needs an absolute path; a blanket
  `sed` rename also hits unrelated uses of the word (it turned "sweep lightness"
  into "audit lightness" once); backticks inside a double-quoted shell string
  are command substitutions and silently eat text.

---

## 1. Pre-commit defect list — DONE

All eleven items were fixed before anything was committed. Kept as the record
of what was wrong, because several were subtle enough to be reintroduced.

| # | Defect | Resolution |
| --- | --- | --- |
| 1.1 | Mobile-sidebar width rule matched zero elements (`data-slot` overwritten through the props spread). | `[data-slot='sidebar'][data-mobile='true']`. |
| 1.2 | Tailwind `data-*` state variants compile through `:where()` at zero specificity; a (0,2,0) exclusion beat `focus-visible`. | Exclude by matching: `:not(:where([data-checked]))`. |
| 1.3 | `aria-controls` dangled on all three comboboxes (cmdk overwrites the id). | Id read back off the rendered node. |
| 1.4 | Clear button nested inside the trigger button. | Absolutely-positioned sibling; placement checked in a browser (§4). |
| 1.5 | `aria-describedby` dangled in view mode. | `describedBy()` takes `formMode`. |
| 1.6 | Route announcer focused inside a modal's inert subtree. | Announcer stands down there. |
| 1.7 | The mock ratchet was trivially defeatable. | Walks `apps/web`, parses every form, fails on any it cannot read. |
| 1.8 | No tests for the contracts everything rests on. | Added; mutation-checked. |
| 1.9 | Six factual errors in files about to be committed. | Corrected. |
| 1.10 | Five small cleanups. | Done. |
| 1.11 | A reviewer claimed `FormDescription` lost its non-breaking space. | Wrong — the file has a literal `U+00A0`. |

**§1.6's live-region claim is false for `@base-ui/react` 1.7.0** — its
`markOthers` keeps every `[aria-live]` element unhidden; documented in
`RouteAnnouncer.tsx`.

---

## 2. The commits — DONE

Thirty commits on `feat/a11y-wcag-aa-mobile`. The original fourteen slices:

1. `chore(test): typecheck test files, widen vitest excludes, drop tsbuildinfo`
2. `feat(a11y): palette contrast and mobile layout`
3. `test(e2e): real OAuth login journey via Playwright`
4. `test: token contrast math and a substitution ratchet`
5. `feat(a11y): structure, landmarks, titles and route focus management`
6. `feat(a11y): form-control id and ARIA wiring`
7. `feat(a11y): niko-table aria-sort, operable column titles, lint suppressions`
8. `docs: accessibility conformance scope, stated honestly`
9. `chore(tooling): a11y sweep harness and its baseline run`
10. `docs: reconcile the shadcn "never edit global.css" rule with what shipped`
11. `docs: stop a11y-reports/latest.json describing a file that is not there`
12. `fix(a11y): move palette corrections out of shadcn's own token blocks` — where
    the dark `--muted-foreground` regression came from; commit 30 fixes it.
13. `fix(a11y): give ui-ext/Combobox an accessible name, and assert names positively`
14. `docs: correct two wrong claims in the @layer utilities note`

The second session's, and the parallel session's, in order:

15. `test(form): one harness for every control test, and accessible names for all of them`
16. `test: run the form and ui-ext component tests in a real Chromium`
17. `ci: the login journey gates a release, the sweep reports; build joins the release gate`
    — also deletes the dead `data-table-view/TableView.tsx` (−661 lines), which
    the subject omits; a comment in `lib/apiClient.ts` (~218) still names it.
18. `ci: gate the image build on the login journey, not just declare it`
19. `fix(a11y): clear 4.5:1 for destructive text on its dark hover tint`
20. `fix: take the boot overlay down on /form-playground; test the failed login exchange for real`
21. `chore: point .preview-url.md at the preview of this tree`
22. `test: ratchet every substitution the suite makes, not just module mocks` — §6a step 1 (parallel session)
23. `fix(a11y-sweep): re-mint the token inside the hour, so the full matrix can finish`
24. `test: no jsdom — a node project and the browser project; navigations become links; browser primitives are never stubbed` — §6a steps 2–3 and 5, 37 files (parallel session)
25. `chore: name the test commands the split created`
26. `ci: no timer on the accessibility sweep, dispatch only`
27. `rename: the accessibility "sweep" is an audit` (and `rename: the last two audit mentions`)
28. `chore: ignore the audit's screenshot output`
29. `fix(a11y-audit): recognize the provider's userinfo error card, and back off on retry`
30. `fix(a11y): dark-mode --muted-foreground had taken the light value; model the cascade in source order`

### Deliberately not committed

- **`a11y-reports/latest.json`** and **`a11y-reports/screenshots/`** — git-ignored
  outputs of every audit run.
- **`screenshots/`** — session-one signed-out captures plus the §4 clear-button pair.
- **`a11y-mobile-plan.md`** (this file).

---

## 2b. The palette split — read before editing any color

`src/global.css` is stock CLI output; `src/theme-a11y.css` holds the corrections,
imported from `main.tsx` *immediately after* `global.css`. Identical specificity,
so **source order is the whole mechanism** — in both directions (see §0). Stock
shadcn base-rhea is not WCAG AA — measured, not assumed — and its dark
`dark:hover:bg-destructive/30` state was 3.74:1 until commit 19 (now 4.50:1).

---

## 3. The API key — WORKS AGAIN (was revoked; nothing changed on our side)

The key in `.env` (an `sk-` admin-issued key for the `tests` org) returned
`401 Invalid API key` throughout the second session and then worked again with
`.env` unchanged; the server side changed. Tokens are for `user3` (the admin
test account) and last one hour. Always verify before a run:

```bash
dotenvx run --quiet -- node scripts/mint-token.mjs | head -c 12   # expect "eyJ..."
```

The `tests-ops` MCP connector cannot manage keys from an agent session: its own
token had expired and its key tools are blocked by the permission classifier.

---

## 4. The verification artifact — first run discarded, second run in flight

**What the first post-fix audit found (2026-09-05 22:13, 224 cells, 31 minutes,
0 inconclusive by the harness's own account — discarded; a copy lives only in
the session's scratchpad):**

- Against the baseline's nine non-conforming criteria: `2.4.1` and `1.4.11` →
  Supports; `1.4.10` clean at 390/1440 (6 findings left, all at 320); `2.4.11`
  300 → 7 findings at 390/1440 (57 in the full matrix, mostly 320); `2.4.7`
  16 → 4; `2.5.8` 2 → 1; `2.4.2`: the `index`/`login` collision fixed,
  `entity-list` vs `xcustomers` both "Customers" still open; `1.3.1`: still the
  drizzle-cube "No Portlets" h3 and the missing `<h1>` on `xcustomers-edit`.
- **A real regression:** `1.4.3` had 59 findings at the baseline viewports
  against 38 — all 38 old ones gone, 58 new, and the new ones are dark-mode
  placeholders at 2.72:1. Cause and fix: §0, commit 30.
- **Two harness defects:** 19 cells were 429 error cards from the identity
  provider (userinfo rate-limited by the run's pace) that the admissibility
  probe did not recognize — it knew only the PostgREST wording — so they counted
  as pages and produced 13 phantom "no `<h1>`" findings. Commit 29 fixes both
  the wording list and the retry (3s → 60s backoff). Commit 23 makes the run
  re-mint its token; at the measured pace (31 minutes) it never needs to.

**In flight:** the second audit, against the preview redeployed from the tip
(`.preview-url.md`), started with `pnpm test:a11y-audit --url … --label
after-fixes --screenshots`. Keep it only if it clears the bar in
`a11y-reports/README.md` — finished, inconclusive count small and explained,
and no cell whose screenshot is an error card (the probe now catches the 429
card; look anyway). Then diff `criteria[]` against the baseline, treating
390/1440 as the like-for-like set (the baseline measured only those two), and
record the run in the README's table.

The §1.4 visual check is done (`screenshots/20260905204543-combobox-clear-*.png`,
playground route, 1440 and 390); the app's own single-column 390 form is still
unverified by eye — it needs an authenticated route, which the key now allows.

---

## 5. What already landed (so you do not redo it)

Counts that read alike: **29 form controls** in `components/form/`; **28 form
test files** in `__tests__/` there (26 `Input*.test.tsx` + `SchemaForm` +
`api-select`); "the form-control tests" = those 28 plus `ui-ext/combobox.test.tsx`.

| Area | What was done |
| --- | --- |
| **niko-table audit** | `aria-sort`; column title `<button>` ⚠ *(library-level only)*; `role="combobox"` dropped from the column-visibility trigger; dangling ARIA removed; two `<li onKeyDown>` widgets documented inline. |
| **Form controls (29)** | `fieldAria.ts` owns id/labelling; description AND error referenced; neither in view mode; `FormError` has `role="alert"`; sibling clear buttons and live `aria-controls` on all three comboboxes. |
| **Structure** | Skip link ⚠ *(target `<main>` contains the app header)*, labelled `<nav>`, route-change focus + announcer, per-route `<title>`, `<h1>` on standalone pages, `ui-ext/command-dialog.tsx` fork. |
| **Contrast** | `--ring`, `--input-border`, all destructive pairs incl. the dark `/30` hover tint, dark `--muted-foreground` restored. `tokenContrast.test.ts`: 118 cases, cascade modelled in source order, `:root` ⊆ `.dark` rule pinned. |
| **Mobile** | Sheet widths, close-button gutter, single-column form grid, sticky-footer bleed, reduced motion, `scroll-padding` ⚠ *(`data-table.tsx` memo computes once with the desktop pinned set)*, column pinning off below `md` ⚠ *(`__drag`/`actions` still pinned)*, `_app.crm.home.lazy.tsx` ⚠ *(`sm:max-w-md` defeated by the vendored `data-[side=right]:sm:max-w-sm`)*. |
| **Tests** | `node` + `browser` projects, no jsdom, no browser-primitive stubs; `components/form/__tests__/harness.tsx`; `src/test/chromeAccessibleName.ts` (Chrome's own accessible name over CDP, node found via `DOM.performSearch`); `src/test/runtimeConfig.ts` (`window.__ENV__`); `lib/permissions.ts` and `lib/secureContext.ts` extracted with node tests; `appLoaderInvariant.test.ts` hand-off scan; `substitutions.test.ts` covers fifteen families. |
| **Audit harness** | `scripts/a11y-audit/`: re-mints its token, recognizes both userinfo error cards, backs off on retry; `--screenshots` output ignored by git. |
| **CI** | `a11y.yml` (login journey on dispatch + release gate; audit on dispatch only, no timer), `docker-publish.yml` `needs: [guard, checks, a11y]`, `checks.yml` installs Chromium, `release.sh` builds. |
| **Docs** | Root and `apps/web` READMEs, `components/form/README.md`, `a11y-reports/README.md`, `CONTEXT-MEMORY.md` (no-jsdom working agreement, the two-way palette order, the audit harness traps). |

---

## 6. Phase 6 — the test architecture

### Done

- One harness for the form-control tests; accessible-name and description
  assertions in every one of them; the form-control tests in a real Chromium
  (commits 15–16).
- `chromeAccessibleName.ts`, because dom-accessibility-api drops an element that
  names itself via `aria-labelledby` (the enum and date-time triggers); Chrome
  keeps it and both are asserted.
- Tautologies removed: `useTable.test.tsx`'s round trip, `InputJson.test.tsx`'s
  inline validators, `useAuth.test.tsx`'s context echo.
- `e2e/login-journey.spec.ts`: 3 tests, in CI, gating releases.
- **§6a steps 1–3 and 5 (commits 22 and 24):** the ratchet covers every
  substitution family; jsdom is gone; `window.location`, `window.open`,
  `matchMedia`, `ResizeObserver`, `crypto`, `isSecureContext`, fake timers,
  `vi.stubEnv`, the hand-built overlay div, `pointerEventsCheck: 0` and the muted
  console are all at zero at the tip. Navigations are links.

### What the second session got wrong, for the record

It moved only the form tests to a browser and kept a jsdom project for the rest,
and it read the `window.location` stubs as "jsdom workarounds" instead of the
design smell they were. Both undone by the parallel session's commit 24.

---

## 6a. Test-design cleanup — steps 1, 2, 3, 5 DONE; step 4 OPEN

Measured at the tip (`grep` over `apps/web/src` and `e2e`, excluding the ratchet):

| Family | Left | Where |
| --- | --- | --- |
| Module mocks, internal | 13 | `ProtectedRoute`, `CustomerForm`, `ModuleSwitcher`, `NavUser`, `useTable`, `useTableMutations`, `routes/login` tests |
| Module mocks, external (`@tanstack/react-router`) | 3 | `ModuleSwitcher`, `NavUser`, `routes/login` tests |
| `fetch` replaced | 20 | `useTable` 1, `useTableMutations` 9, `lib/config.test.ts` 10 |
| `vi.resetModules` | 1 | `lib/apiClient.interceptor.test.ts` |
| `fireEvent.change` | 2 | `SchemaForm.test.tsx`, kept deliberately (the app's own focus timer) |
| Everything else | 0 | — |

### Step 4 — the remainder; the key works, so nothing blocks it now

**Plumbing first.** `pnpm check` runs without `dotenvx`, so neither
`SEMANTIUS_API_KEY` nor `VITE_CONTROL_PLANE_ORG` reaches a Vitest run, and
`exchangeApiKeyForToken.ts` is node-only while these tests run in Chromium.
Decisions taken, to implement as the first part of this step:

- Root `check` becomes `pnpm --filter @semantius/frontend lint && dotenvx run --
  pnpm --filter @semantius/frontend test`. Vite exposes `VITE_*` from
  `process.env` to the browser bundle; `SEMANTIUS_API_KEY` stays in node.
- A Vitest `globalSetup` **at the root config** (so both projects get it) mints
  one token with `exchangeApiKeyForToken` and `provide()`s it; tests `inject()`
  it and browser tests seed the `SC_<mode>_token` / `SC_<mode>_tokenExpire`
  storage keys directly (verified in vitest 4.1.11: `TestProject.provide`,
  `inject` from `vitest`, values must survive `structuredClone`, augment
  `ProvidedContext` for typing).
- `checks.yml` declares `DOTENV_PRIVATE_KEY` under `on.workflow_call.secrets`
  and `docker-publish.yml` passes it (`secrets: inherit` or an explicit mapping)
  — a called workflow receives no secrets otherwise, and the gate would fail
  exactly where it matters. Its "these tests need no secrets" comment goes.
- The ratchet's "names the two substitutions" test says the session seeding now
  happens in `globalSetup`; `#jwt` itself stays for the audit and for humans.

| File | Substitution | Replacement |
| --- | --- | --- |
| `hooks/useTable.test.tsx`, `hooks/useTableMutations.test.tsx` | `fetch` replaced; `useAuth`/`apiClient`/`config` mocked | Real API against nwind with the seeded session: `POST /modules`, `POST /entities`, `DELETE /modules?id=eq.<id>`. The cascade-on-delete claim comes from session one's notes and is asserted nowhere in the repo — verify with one round trip, keep a teardown. Assert real rows and real errors (`42P01`, the real PostgREST `message`). |
| `components/ProtectedRoute.test.tsx` | `useAuth`, `appLoader` mocked | Real `AuthProviderWrapper` with the seeded session; overlay assertions against a real `#app-loader` (`browser.testerHtmlPath` with a dedicated tester HTML that COPIES the overlay div, theme script and styles from `index.html` — it cannot point at `index.html` itself, which boots the app; record the copy in CONTEXT-MEMORY's duplication list). |
| `components/customers/CustomerForm.test.tsx` | `useTableMutations` mocked | Real mutations against nwind. |
| `components/layout/NavUser.test.tsx`, `ModuleSwitcher.test.tsx` | `useAuth`, `useTable`, `useModuleNavigate`, `config` mocked; router mocked | The harness below; permission-gated entries asserted with `user3`'s real `rpcUserInfo.permissions`. |
| `routes/login.test.tsx` | `useAuth` mocked with a hand-written stand-in for the library's error contract (the `crypto` stubs are gone — they only ever fed the test's own mock, which now takes a `failing` boolean); router mocked | A real origin for the non-secure-context branch: `vite preview --host 0.0.0.0`, the runner's LAN address from `os.networkInterfaces()`, a second Playwright project with that `baseURL`. It reaches `initConfig()`'s boot gate (`ConfigErrorPage`), so decide whether `/login`'s own failure branch is reachable at all and delete the test if not. |
| `lib/config.test.ts` (discovery, tenant lookup) | `fetch` replaced ×10 | Real discovery document from `test-oidc-server`; real tenant lookup at `api.semantius.cloud/organization/<org>`. |
| `lib/config.test.ts` (the secure-context short-circuit) | nothing covers it now | The rule moved to `lib/secureContext.ts`, tested pure in `node`. Uncovered: that `initConfigCore()` records the error and resolves NO endpoint — the same LAN-origin Playwright project above. Do not restore the `isSecureContext` stub to close it. |
| `lib/apiClient.interceptor.test.ts` | `vi.resetModules` | Import once, assert the patch once; a real request from node succeeds with the injected token and answers `401` without it. |
| **One real-provider harness** | — | Compose with `FormHarness`: the generated `routeTree.gen.ts` in `createRouter` with `createMemoryHistory`, real `AuthProviderWrapper` with the seeded session, real `QueryClient`, real `apiClient`, and `await initConfig()` before rendering. The form-control tests need none of it. |

After step 4 every ratchet count is zero except the two named substitutions
(the OIDC test server and session seeding), and `substitutions.test.ts` says so.

**Docs to recheck after step 4** (grep for `jsdom` and for "#jwt seeding"):
`CONTEXT-MEMORY.md` (four-layers item 2, the boot-overlay paragraph, the "exactly
TWO substitutions" paragraph), `playwright.config.ts`, `a11y.yml`,
`devUrlToken.ts`'s header, `substitutions.test.ts`, `appLoader.ts` (reword; the
fallback timer also serves reduced motion and hidden tabs).

**Dead ideas — do not resurrect.** jsdom in any project; polyfilling a browser
API so a test passes; stubbing `window.location` (make it a link); axe-in-jsdom;
isolated component tests with invented props; `form-playground` as a test
surface; MSW + recorded fixtures; deleting Playwright; a pre-push hook; seeding
`loginInProgress` in localStorage to fake a failed exchange (go through the
provider); routing the test token through `#jwt` instead of `globalSetup`; a
timer on the audit; a single-token audit run.

---

## 7. CI — DONE

`.github/workflows/a11y.yml`: **`login-journey`** (`apps/web/e2e/`, three
Playwright tests, about two minutes) on dispatch and via `workflow_call` from
`docker-publish.yml`, where it gates the image build (`needs: [guard, checks,
a11y]`). **`audit`** on dispatch only — no schedule, by decision: it deploys a
preview, needs the tenant up, takes half an hour and is red by design while
criteria are open. It provisions the runner with `workplace/setup.sh`, deploys,
audits, uploads `a11y-reports/` whether or not it passed. `checks.yml` installs
Chromium before `pnpm check`; `release.sh` runs `pnpm build` after `pnpm check`.
§6a step 4 changes `checks.yml` again (the secret).

**Not yet exercised on GitHub** — the branch is unpushed. The YAML parses and
every `uses:` target exists; the first push is the first real run.

---

## 8. Smaller gaps

Closed: the dark `/30` destructive tint (19); dead `TableView.tsx` (17);
`/form-playground` hanging behind the boot overlay (20); the e2e failed-exchange
test that could never pass — `react-oauth2-code-pkce` attempts the exchange only
while its `loginInProgress` flag is set (20); the dark `--muted-foreground`
regression and the token test's cascade model (30); the audit's single-token
lifetime, its blindness to the provider's error card, its fixed retry (23, 29).

Still open: `components/form/Playground.tsx` hardcodes `theme="light"`
(developer tool, out of scope by decision); the excluded drizzle-cube dashboard
is still a route users visit; the audit sees only the states it reaches; 29 of
55 criteria are Not Evaluated (4 by design, 25 unchecked); per-commit `pnpm
check` was never proven; the ⚠ items in §5; and the open criteria the audit
still reports — `2.4.2` (two routes titled "Customers"), `1.3.1` (drizzle-cube's
h3; `xcustomers-edit` has no `<h1>`), and whatever the second run leaves at
320/640/768/1024, which the baseline never measured.

---

## 9. Real bugs found on the way, unfixed — file these as issues

**The tenant's serverless PostgREST returns 404 on the first request after an
idle period, and the app treats it as terminal.** `AuthContext`'s
`rpc/get_userinfo` call renders "Failed to fetch user information from API" and
never retries; a reload fixes it. The audit warms the API from node and retries
a navigation before declaring a cell inconclusive; it was the sole cause of all 9
inconclusive cells in the committed baseline. **Related:** the identity
provider's userinfo endpoint answers `429` under a page load every few seconds,
and the app renders the same terminal card for it ("…from OAuth provider").

**A self-hosted Docker deployment cannot turn the control plane off.** The opt-out
is an EXPLICIT empty `VITE_CONTROL_PLANE_URL` (`config.ts`: `if (!controlPlaneUrl)`
after a `.trim()`), and `docker/.env.example` duly ships `VITE_CONTROL_PLANE_URL=`.
But `gen-config.sh` writes that through as `""`, and `runtimeEnv()` treats an empty
string as ABSENT — that is how an unset key in `docker/.env` falls back to the
build-time value — so the accessor returns the built-in default
`https://app.semantius.com`. The SPA-only image therefore always resolves a tenant
from the subdomain, no matter what the operator wrote. Nothing warns.

A test that needs the self-hosted path today has to pass a single SPACE, which
survives the accessor and trims to empty; `lib/config.test.ts` already did this and
`src/test/runtimeConfig.ts` now names it (`SELF_HOSTED`) and explains it. Fixing it
properly is a product decision about what "unset" should mean in `window.__ENV__` —
a sentinel like `none`, or inverting the default — so it was not taken here.

---

## 10. Verify how the APP handles a 429 — a user must never see one

**Observed, not hypothetical.** During the audits the identity provider's
userinfo endpoint answered `429` when pages loaded every few seconds, and the app
rendered a terminal error card to what would have been a user: "Failed to fetch
user information from OAuth provider — Failed to fetch user info: 429", with a
Details button and nothing else. 19 cells in one run, 3 in the kept one. The
same card, same terminal behavior, is what the cold-start `404` from PostgREST
produces (§9). A rate limit and a cold start are both transient by definition;
showing either as a hard failure is wrong.

**What the code does today** (`apps/web/src/contexts/AuthContext.tsx`): the
userinfo and `rpc/get_userinfo` fetches classify failures into a token rejection
(one-shot re-login) and everything else → `'show-error'`, which renders the card.
There is no retry, no backoff, no reading of `Retry-After`, no distinction
between `429`/`5xx`/cold-start `404` and a real failure. `lib/apiClient.ts` has
none either, so every data query in the app has the same gap.

**Verify first, in the browser, then fix:**

1. Reproduce for real: a Playwright test that intercepts the provider's
   `/userinfo` with `page.route` answering `429` (with a `Retry-After: 2`
   header) twice and then passing through — the same interception pattern the
   login journey already uses for a failed token exchange, so it is not a new
   kind of substitution. Assert: the boot overlay stays up (or the page keeps
   its previous state), no error card appears, and the app lands signed in.
   Do the same for a `404` then `200` from `rpc/get_userinfo` (the §9 bug), and
   for a `429` on an ordinary PostgREST query through `apiClient`.
2. Fix in `AuthContext`/`apiClient`: on `429`, `502`/`503`/`504`, network
   failure, and the cold-start `404`, retry with exponential backoff and full
   jitter, honoring `Retry-After` when present, a bounded number of times; show
   the error card only after that, with a working retry button. A `429` must
   never reach the UI as text.
3. Then the audit harness needs none of its own 429 handling beyond what it has;
   its backoff (commit 29) was compensating for the app.

Product decision to take on the way: what the user sees during the retries — the
boot overlay/skeleton on first load (nothing to show yet), the previous data on
a refetch (TanStack Query already keeps it).
