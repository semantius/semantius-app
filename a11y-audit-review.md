# Review of the WCAG 2.2 Level AA claim

**Date:** 2026-09-06
**Tree reviewed:** `main` at `69df1ba`, 11 commits ahead of `origin/main` (`96191f9`)
**Scope:** `ACCESSIBILITY.md`, `README.md` § Accessibility, `a11y-reports/`, `scripts/a11y-audit/`, `a11y-fix-plan.md`, the CI workflows, and the test and lint layers the claim cites.
**Method:** read-only review. Every number below was re-derived from committed artifacts or from a command run during the review (listed at the end). The only change made to the tree was deleting an untracked, invalid audit run (P5).

## Verdict

The claim is **honest, and adequately supported for what it says it is**: an automated status with named exceptions, not a conformance report.

- The headline reads "supports with exceptions, and more than half of the standard is unmeasured". The document opens with coverage before findings, which is the right order.
- The evidence artifact is a valid run of the current route list: 12 routes, 7 viewports, 2 themes, 168 views, 164 measured, and `summary.pass` is false, as the document says it should be.
- Two criteria fail: a vendor heading jump (1.3.1) and four error-card contrast findings (1.4.3) that were fixed in the tree after the run and not yet re-measured.
- The reporting layer has two defects that overstate the "Supports" column: it grants Supports on axe rules that never applied, and it drops axe's needs-review results. Roughly 12 of the 24 Supports rows carry no evidence about this app.
- No manual or screen-reader pass exists, and the accessibility CI workflow has never run.

## What the claim rests on

Four layers, as `ACCESSIBILITY.md` describes them, all confirmed to exist and, where runnable here, to pass:

| Layer | What it proves | State |
| --- | --- | --- |
| Token contrast test (`apps/web/src/test/tokenContrast.test.ts`) | The palette clears 4.5:1 / 3:1 on every surface a control can sit on, both themes, with the `theme-a11y.css` override imported last | Passes (run here) |
| Component tests in Chromium (Vitest `browser` project) | Each form control's computed accessible name and description | Not run here; plan §6.5 records five green runs and one red on the tenant's bad minute |
| Lint (`eslint-plugin-jsx-a11y`) | Static ARIA and markup defects; 3 frozen in `eslint-suppressions.json`, 6 documented inline | Passes, zero `jsx-a11y` warnings (run here) |
| Route audit (`scripts/a11y-audit/`) against a deployed preview | axe-core plus custom probes: placeholder contrast, focus indicator, focus-not-obscured, reflow on descendants, skip-link target, heading jumps, title uniqueness | Cited run `20260906T173406-pinning-lg` inspected in full |

## What was verified as true

| Claim | Evidence | Status |
| --- | --- | --- |
| Evidence artifact is committed and names its build | `a11y-reports/20260906T173406-pinning-lg.json`, tracked; `meta.url` is `main-20260906175709` | Verified |
| 24 / 2 / 29 statuses, `pass: false`, 168 views, 164 measured, 4 cantTell | JSON `summary`, `meta`, `cantTell[]` | Verified |
| 24 + 2 + 29 = 55, the WCAG 2.2 A + AA criterion count | `criteria.mjs` enumerates 31 A + 24 AA | Verified |
| 12 routes, 7 viewports, 2 themes | JSON `meta.routes`, `meta.viewports`, `meta.themes` | Verified |
| Denominators are counted once per view | Every criterion reads "of 164"; 1.4.11 and 2.4.7 read "39 of 164" | Verified |
| 1.3.1 is 14 findings, all `module-home`, all "No Portlets" | JSON failures | Verified |
| "No Portlets" is vendor markup; installed 0.5.8; npm latest 0.9.0 | present in `drizzle-cube/dist`, absent from `apps/web/src`; `npm view` | Verified |
| 1.4.3 is 4 findings on `.mt-1` / `.gap-1` / `.h-auto`, all light | JSON targets | Verified |
| The 1.4.3 fix is in the tree | `ApiErrorDisplay.tsx` lines 55 and 63 use `text-foreground` with a comment explaining why | Verified |
| The 1.4.3 pair is pinned in the token test | `tokenContrast.test.ts`: `it.each` "foreground on the destructive /10 tint over the %s" | Verified, passes |
| Vendor primary overridden to 6.30:1 | `theme-a11y.css` lines 173 and 174 set `--dc-primary` and `--dc-primary-hover` | Verified |
| Improvement between the two newest runs (2.4.11 54 to 0, 1.4.3 7 to 4, 1.3.1 unchanged) | `diff.mjs transport-retry pinning-lg` reproduces it | Verified by execution |
| Three older kept runs carry inflated denominators | `a11y-reports/README.md` says so; the `Set` fix is in `report.mjs` | Verified |
| Modal-inert fix exists and is tested | `components/a11y/ModalInert.tsx`; `e2e/modal-inert.spec.ts` asserts `#root[inert]`, focus trapped, focus returned on close | Verified by reading |
| 2.4.7 probe reports refused focus as evidence, not as a failure | `probes.mjs` `unfocusable[]`; `report.mjs` removes the view from `observedIn` when every sampled control refused | Verified by reading |
| Raw material emitted for the four review-only criteria | 164 evidence entries each for 1.1.1, 2.4.3, 2.4.6, 4.1.3 | Verified |
| 2.5.7 keyboard sensor on dnd-kit | `KeyboardSensor` in `data-table-structure.tsx` and `ui-ext/sortable.tsx` | Verified |
| Single-column form at 390 was looked at | `screenshots/20260906170944-order-record-390.png` committed; plan §6.5 | Screenshot exists; not re-inspected |

## Problems found

Ordered by how much they change what a reader would conclude.

### P1. "Supports" is granted on axe rules that never applied

**Where:** `scripts/a11y-audit/run.mjs` `axeCoverage()`; consumed in `report.mjs`.

Coverage is derived from axe's rule catalog, not from what ran on the page: every criterion that any enabled rule is tagged with is marked observed on every measured view. "Supports, checked in 164 of 164 views" is therefore reported for criteria no element ever exercised:

| Criterion | Sole axe rule(s) behind the Supports | Fires only if the page has |
| --- | --- | --- |
| 1.2.1 Audio-only and Video-only | `audio-caption` | an `<audio>` element |
| 1.2.2 Captions | `video-caption` | a `<video>` element |
| 1.4.2 Audio Control | `no-autoplay-audio` | autoplaying media |
| 2.2.1 Timing Adjustable | `meta-refresh` | a refresh meta tag |
| 2.2.2 Pause, Stop, Hide | `blink`, `marquee` | those elements |
| 1.3.4 Orientation | `css-orientation-lock` | an orientation media query |
| 1.4.4 Resize Text | `meta-viewport` | a zoom-disabling viewport meta |
| 1.4.12 Text Spacing | `avoid-inline-spacing` | inline `!important` spacing |
| 3.3.2 Labels or Instructions | `form-field-multiple-labels` | a field with two labels |
| 1.4.1 Use of Color | `link-in-text-block` | links inside paragraphs |
| 2.5.3 Label in Name | `label-content-name-mismatch` | controls with both visible text and an aria-label |
| 3.1.2 Language of Parts | `valid-lang` | a `lang` attribute below `<html>` |
| 2.1.1 Keyboard | `frame-focusable-content`, `scrollable-region-focusable`, `server-side-image-map` | iframes, scroll regions, image maps |

`ACCESSIBILITY.md` states the principle itself, under the Not Evaluated list: "'trivially true' is a judgment, not a measurement, and it is not made here." For the criteria above that judgment *is* being made, as Supports. The report vocabulary has `Not Applicable` (`criteria.mjs`) and the code never assigns it.

**Improve:** read axe's `passes` and `inapplicable` per view. Mark a criterion observed on a view only when at least one of its rules had applicable nodes. Report `Not Applicable` when every rule was inapplicable on every view, and name the rules behind each criterion in its note. Expect roughly 12 Supports plus 12 Not Applicable, which is the true picture and a more credible one.

### P2. axe "incomplete" results are collected and dropped

**Where:** `probes.mjs` line 79 requests `resultTypes: ['violations', 'incomplete']`; `report.mjs` reads only `violations`.

A needs-review result (a contrast axe could not resolve because of an overlay, a gradient, or a background image) currently reads as clean.

**Improve:** count `incomplete` per criterion, print them in the `.txt` digest, and hold a criterion below Supports while any is unreviewed.

### P3. The accessibility CI workflow has never run, and the one gate that was dispatched failed

**Where:** `.github/workflows/a11y.yml` has zero runs. The `Checks` workflow was dispatched once (2026-09-06, 15:56 UTC) and failed: lint passed, then `pnpm check` died on `sh: 1: dotenvx: not found`.

The fix (an "Install dotenvx" step in `checks.yml`) is in the 11 unpushed commits, so GitHub has never seen it. The scheduled workflow named "Audit" is `pnpm audit` for dependency vulnerabilities, not the accessibility audit. Until a push, every "in `pnpm check`" statement in the document has been observed only on one machine.

**Improve:** push, dispatch `Checks`, then dispatch `Accessibility` with `audit` on. Keep the artifact it uploads as the first CI-produced run.

### P4. The two open findings are not in the state a reader might assume

- **1.4.3 fails on a state that is already fixed but not re-measured.** The four error-card findings appeared because the tenant's API had a bad minute during the run. The fix is in the tree and pinned in the token test, but the document says "not re-audited: the state cannot be produced on purpose". The token test proves the color pair, not the rendered component, and the audit has no way to reach the state deliberately.
- **1.3.1 is vendor, and the upstream issue is drafted but not filed** (plan §4.4). Whether drizzle-cube 0.9.0 changes the heading is "unchecked".

**Improve:** add an audit case that forces the error card (for example a route pointing at a missing table) so the error state is a measured view rather than an accident. File the drizzle-cube issue, or try 0.9.0 in a branch and record the result.

### P5. An invalid run was on disk, untracked — deleted during this review

**Where:** `a11y-reports/20260906T165604-status.json` and `.txt`.

The run measured 113 of 168 views against a superseded preview (`feataywcag-20260906112124`); 55 views were cantTell, 54 of them "navigation failed / admissibility probe failed". It was untracked and cited in no README row. The reports README's own rule says such a run must be deleted, because "the next reader has no way to tell it apart from a real one". Both files were deleted with the user's approval; `a11y-reports/` is clean.

### P6. The probe scoping that closed 2.4.11 narrows what is measured

**Where:** `probes.mjs` `__openModalDialog()`; `FOCUS_OBSCURED` and `CONTROL_CONTRAST` measure only the open dialog's subtree.

The reasoning is sound: with the record Sheet open, Tab is trapped inside it, so a control behind it is not one a keyboard user can focus. The consequence is that on `entity-record` and `entity-record-view` (28 of 168 views) the grid, header, sidebar trigger and pagination are never measured for focus indicator, boundary contrast or obscuring; those are measured only on `entity-list`. The document says this in one sentence under the passing table but does not say which views lost coverage.

**Improve:** stamp a "measured scope: dialog" marker on each such view's evidence and list the affected routes in `ACCESSIBILITY.md`. Consider one audit case that opens the record Sheet by click rather than deep link, which is the path the `ModalInert.tsx` fix covers and the audit's deep-link path does not.

### P7. Small documentation defects

- **The reports README table is split by blank lines.** The rows for `transport-retry` and `pinning-lg` are separated from the table by empty lines, so Markdown renders three tables.
- **2.4.7 view counts disagree between plan and artifact.** Plan §4.5 says "Supports on 42 views"; the cited run says 39 (42 belongs to the `transport-retry` run).
- **A reports README row refers to this file as the review that re-derived the `115727` run.** This file now re-derives from `pinning-lg`.

### P8. Decisions the plan leaves open that touch the claim

From `a11y-fix-plan.md` "Decisions still open" and §5.2:

- `pnpm check` writes real `_vitest_`-prefixed rows to the tenant on every run. The suite the document calls its release gate therefore depends on a live tenant, which is why one run went red on a bad minute.
- Test coverage was dropped (`useTable` no-message-field case; `ProtectedRoute` 7 tests to 4). Not a WCAG item, recorded because the document cites the browser project as an evidence layer.
- The drizzle-cube dashboard is out of the claim's scope but in the user's path (plan §4.3g). The document carries this caveat.

### P9. No manual or assistive-technology pass

**Where:** stated plainly in `ACCESSIBILITY.md`.

The largest gap. 25 criteria have no check, 4 are review-only with 164 unread evidence lists each, and the modal-inert defect fixed in this tree is exactly the kind only a screen reader shows: keyboard focus was trapped correctly while the virtual cursor could read the whole page behind the Sheet. The audit could not have found it and did not.

**Improve:** one recorded pass (keyboard-only walk of the record form and grid; NVDA or VoiceOver on the same two routes; reading the four evidence lists for two routes) with the reviewer's name and date in `a11y-reports/README.md`.

## What needs to happen, in order

1. Push the 11 commits and dispatch `Checks`; then dispatch `Accessibility` with `audit` on (P3).
2. Fix coverage semantics: applicability-based observation and `Not Applicable` (P1); consume `incomplete` (P2). Regenerate `ACCESSIBILITY.md` from the next run.
3. Add an audit case that reaches the error card on purpose, and one that opens the record Sheet by click (P4, P6). Re-run; 1.4.3 should then read Supports on measured evidence.
4. File the drizzle-cube issue or test 0.9.0 (P4).
5. Repair the reports README table and the 2.4.7 count in the plan (P7).
6. Record one manual and AT pass (P9).

## What was executed during this review

All read-only except the deletion in P5:

```bash
pnpm --filter @semantius/frontend lint                      # exit 0, 100 warnings, 0 jsx-a11y
dotenvx run -f ../../.env --quiet -- pnpm exec vitest run --project node \
  src/test/tokenContrast.test.ts src/test/substitutions.test.ts src/lib/retry.test.ts
                                                            # 184 passed, 4 skipped
node scripts/a11y-audit/diff.mjs 20260906T163431-transport-retry.json 20260906T173406-pinning-lg.json
gh run list --workflow=a11y.yml --limit 5                   # empty
gh run view 34043865897 --log-failed                        # dotenvx: not found
npm view drizzle-cube version                               # 0.9.0
rm a11y-reports/20260906T165604-status.json a11y-reports/20260906T165604-status.txt
```

Plus inspection of the kept JSON artifacts, the axe-core 4.13.0 rule catalog, the audit scripts, the token test, the README and the workflows, and `grep` for the cited fixes in `ApiErrorDisplay.tsx`, `theme-a11y.css`, `ModalInert.tsx` and `modal-inert.spec.ts`.
