# Review of the WCAG 2.2 Level AA claim

**Date:** 2026-09-06
**Scope:** `ACCESSIBILITY.md`, `README.md` § Accessibility, `a11y-reports/`, `scripts/a11y-audit/`, and the two test and lint layers the claim cites.
**Method:** read-only. Every number below was re-derived from the committed artifacts or from a command run during the review. Nothing in the repo was modified.

## Verdict

The claim is **honest in its framing and overstated in its detail**.

- The headline is "supports with exceptions", not "conformant". The document states that 29 of 55 criteria are unmeasured, and the artifact records `summary.pass: false`. That framing is correct.
- The seven failing criteria are real, traceable to DOM nodes, and match the JSON exactly.
- The "Supports" column, however, treats axe rules that never applied as positive evidence, the cell counts come from a known and since-fixed counting bug, the document describes a route set the current script no longer audits, and the repo's own fix plan marks the document as not yet valid.

It would not stand as a formal conformance report (VPAT / ACR). It is a well-documented automated status with a set of known defects in the reporting layer that need fixing before the document is committed.

## What was verified as true

| Claim | Evidence | Status |
| --- | --- | --- |
| Evidence artifact exists and is committed | `a11y-reports/20260905T230332-after-fixes.json`, tracked in git, names its preview URL | Verified |
| 19 / 7 / 29 statuses, summing to 55 | `summary.counts` in the JSON; 55 is the correct WCAG 2.2 A+AA count | Verified |
| `summary.pass` is false | JSON | Verified |
| 2.4.11 split of 28 / 14 / 8 / 14 findings, routes 42 / 22 | Recomputed from `criteria[].failures` | Verified |
| 1.4.10 offenders are "Add Customer" (150px) and "New Document" (157px) at 320 only | JSON offenders | Verified |
| 2.5.8 is one node, the right-aligned grid link | JSON targets | Verified |
| 1.4.3 failure is drizzle-cube's `dc:` button on `module-home`, light only | JSON targets | Verified |
| "No Portlets" is vendor markup | Present in `drizzle-cube/dist`, absent from `apps/web/src` | Verified |
| Raw material is emitted for the four review-only criteria | 220 evidence entries each for 1.1.1, 2.4.3, 2.4.6, 4.1.3 | Verified |
| Nine accepted lint violations | 3 in `eslint-suppressions.json` + 6 inline `eslint-disable` comments | Verified |
| Lint layer passes | `pnpm --filter @semantius/frontend lint` exits 0, zero `jsx-a11y` warnings | Verified by execution |
| Token-contrast and substitutions tests pass | 137 passed, 4 skipped, in the `node` Vitest project | Verified by execution |
| README's baseline-to-after-fixes improvement numbers | `scripts/a11y-audit/diff.mjs` reproduces them | Verified by execution |
| 2.5.7 keyboard sensor on dnd-kit | `KeyboardSensor` wired in `data-table-structure.tsx` and `ui-ext/sortable.tsx` | Verified |
| Custom probes cover what axe cannot | reflow on descendants, placeholder contrast, focus indicator, focus-not-obscured, skip-link target, heading jumps | Verified by reading `probes.mjs` / `report.mjs` |

## Problems found

Ordered by how much they change what a reader would conclude.

### P1. "Supports" is claimed on inapplicable axe rules

**Where:** `scripts/a11y-audit/run.mjs` `axeCoverage()`, consumed in `report.mjs`.

Coverage is derived statically from axe's rule catalog: every criterion that *any* enabled rule is tagged with is marked "observed" on every measured cell, whether or not the rule found a single applicable element. The result is "Supports, checked in 220 cells" for criteria that were never exercised:

| Criterion | Sole axe rule(s) behind the Supports | Applies only if the page has |
| --- | --- | --- |
| 1.2.1 Audio-only and Video-only | `audio-caption` | an `<audio>` element |
| 1.2.2 Captions | `video-caption` | a `<video>` element |
| 1.4.2 Audio Control | `no-autoplay-audio` | autoplaying media |
| 2.2.1 Timing Adjustable | `meta-refresh` | a `<meta http-equiv="refresh">` |
| 2.2.2 Pause, Stop, Hide | `blink`, `marquee` | `<blink>` / `<marquee>` |
| 1.3.4 Orientation | `css-orientation-lock` | an orientation media query |
| 1.4.4 Resize Text | `meta-viewport` | a viewport meta that disables zoom |
| 1.4.12 Text Spacing | `avoid-inline-spacing` | inline `!important` spacing |
| 3.3.2 Labels or Instructions | `form-field-multiple-labels` | a field with two labels |
| 1.4.1 Use of Color | `link-in-text-block` | links inside paragraphs |
| 2.5.3 Label in Name | `label-content-name-mismatch` | controls with both visible text and aria-label |
| 3.1.2 Language of Parts | `valid-lang` | a `lang` attribute below `<html>` |
| 2.1.1 Keyboard | `frame-focusable-content`, `scrollable-region-focusable`, `server-side-image-map` | iframes, scroll regions, image maps |

None of these say anything about, for example, whether custom widgets are keyboard operable (2.1.1) or whether text reflows at 200% zoom (1.4.4). The report vocabulary already has `Not Applicable` (`criteria.mjs` `STATUS.NOT_APPLICABLE`) but the code never assigns it. About 12 of the 19 Supports rows are really Not Applicable or "no automated failure", which is a materially different claim from Supports.

**Improve:** read axe's `passes` and `inapplicable` per run. Mark a criterion observed on a cell only when at least one of its rules had applicable nodes (`passes` or `violations` non-empty). Report `Not Applicable` when every rule was inapplicable on every cell. Add a per-criterion note naming the rules that produced the evidence so a reader can judge its weight.

### P2. axe "incomplete" results are collected and then ignored

**Where:** `probes.mjs` requests `resultTypes: ['violations', 'incomplete']`; `report.mjs` reads only `violations`.

An axe `incomplete` result is a needs-review signal (for example a contrast check it could not resolve because of an overlapping element or gradient). Today it silently reads as clean.

**Improve:** feed `incomplete` into the report as a distinct count per criterion, and prevent a criterion with any `incomplete` node from reading Supports until a human clears it. Print them in the `.txt` digest.

### P3. The cell counts in the document are known to be wrong

**Where:** `ACCESSIBILITY.md` tables; `a11y-reports/*.json` `criteria[].note`.

`report.mjs` used to increment the observed count once per *probe* rather than once per cell, so a criterion two probes touch reported twice the cells that exist. That is why the artifacts say 440 cells for 1.3.1, 2.4.2, 1.4.3 and 3.1.1, 312 for 2.4.1 and 252 for 1.3.4 in a 224-cell matrix. The fix (a `Set`) landed in commit `1a47d87` at 14:20 on 2026-09-06, after both kept runs were generated (23:03 on 09-05 and 11:57 on 09-06). The document's explanations for those numbers ("3.1.1 on every document in both themes", "2.4.1 wherever a landmark structure exists") are rationalizations of the bug; both themes are already inside the 224. The plan's §6.1 acknowledges this and asks for a one-line note in `a11y-reports/README.md`, which has not been written.

**Improve:** re-run the audit with the fixed counter, regenerate the tables from that run, and add the note to the reports README explaining why the two older artifacts carry inflated denominators.

### P4. The document describes a route set the script no longer audits

**Where:** `scripts/a11y-audit/routes.mjs` at HEAD excludes `/xcustomers`, `/xcustomers/new`, `/xcustomers/1`, `/xcustomers/1/edit`. Both kept runs and `ACCESSIBILITY.md` cover 16 routes including those four.

Consequences:

- All 13 findings under 2.4.7 Focus Visible and the single 2.4.2 title collision are on the excluded routes. Re-running the current script will make both criteria read Supports without anything in the app having changed.
- The document recommends "either retitle the demo route or delete it", while the script's actual answer was to stop measuring it. Reader and tool disagree.
- The plan's §4.5 says removing the route "is not evidence the app is fine" because the focus-visible probe skips any control where `document.activeElement !== el` after `el.focus()`, so a focus trap produces the same message as a real defect. The blind spot has not been confirmed on the remaining routes.

**Improve:** decide the `/xcustomers` question (delete or keep as a non-audited page) and state it in `README.md` § Scope. Confirm the 2.4.7 probe on the remaining routes and document its blind spot in `probes.mjs`. Regenerate the document from a run of the current route list.

### P5. The repo's own plan marks the document invalid, and it is uncommitted

**Where:** `a11y-fix-plan.md` §6.2: "`ACCESSIBILITY.md` must be rewritten, not edited — OPEN. The uncommitted draft uses the pre-rename vocabulary and numbers from a run that predates the `/xcustomers` exclusion. Discard its tables and regenerate them from the first valid run."

`ACCESSIBILITY.md` is untracked. `README.md` already links to it as "the current status".

**Improve:** do not commit the current draft. Produce a valid run first (P3, P4), regenerate, then commit document and run together.

### P6. A newer committed run is uncited

**Where:** `a11y-reports/20260906T115727-status.json` and `.txt` are tracked in git (commit `1a47d87`) but appear in neither `ACCESSIBILITY.md` nor the table in `a11y-reports/README.md`.

This breaks the document's own rule that every number traces to a named artifact and every kept run gets a row. It also carries the P3 denominators.

**Improve:** add its row with state-of-tree and preview, or delete it under the reports README's own "delete a run that does not clear the bar" rule.

### P7. The `.txt` digest and JSON vocabulary differ from the current script

**Where:** kept artifacts say "cells admissible / INCONCLUSIVE"; the working-copy `report.mjs` prints "views measured / cantTell" and the JSON key is `inconclusive` in the artifacts but `cantTell` in the code.

The rename is uncommitted (`git status` shows six modified audit scripts, all rename-only). `diff.mjs` in the working copy reads `cantTell` and would not find `inconclusive` in the old artifacts if the key name was also changed in the output. A reader comparing the doc against the code sees two vocabularies for one concept.

**Improve:** finish the rename in one commit, including `a11y-reports/README.md` and `ACCESSIBILITY.md`, and make `diff.mjs` accept both keys so older artifacts remain diffable.

### P8. CI for the audit has never executed

**Where:** `.github/workflows/a11y.yml`; plan §6.4.

The workflow that is supposed to fail while any criterion is open has been read, not run. The branch was never pushed, and the job now depends on `DOTENV_PRIVATE_KEY` reaching two jobs that previously needed no secret.

**Improve:** push and dispatch once with `audit` on. Treat the first run as part of the verification, not as a formality.

### P9. No manual or assistive-technology pass

**Where:** stated in `ACCESSIBILITY.md` § What this claim does not cover.

The document says this plainly, and it is the right thing to say. It remains the largest gap: 25 criteria have no check at all, four are review-only with unreviewed evidence, and nothing measures a screen-reader user's experience. Plan §6.5 also notes that the single-column form at 390 has never been looked at by a human.

**Improve:** one recorded manual pass (keyboard-only walk of the record form and grid, NVDA or VoiceOver on the same two routes) with findings filed against the four review-only criteria. Record the date and the reviewer in the reports README so the claim carries a human sign-off.

### P10. Small documentation defects

- **Version mismatch.** `ACCESSIBILITY.md` says `drizzle-cube@0.5.6`; `apps/web/package.json` declares `^0.5.8` and 0.5.8 is installed.
- **The diff command as written fails.** `node scripts/a11y-audit/diff.mjs <older>.json <newer>.json` with paths errors with `a11y-reports/a11y-reports/...` because the script resolves names relative to `a11y-reports/`. It works with bare filenames. Either document the bare form or make the script accept a path.
- **The vitest command needs `-f`.** From `apps/web`, `dotenvx run -- pnpm exec vitest ...` fails with `MISSING_ENV_FILE`; the root `.env` must be passed with `-f ../../.env`. `pnpm check` from the root handles this, but the doc's "how to verify" section does not say the root is required.

## What needs to happen, in order

1. Fix coverage semantics in `run.mjs` / `report.mjs` (P1) and consume `incomplete` (P2). These change what "Supports" means and must land before any run is called valid.
2. Commit the vocabulary rename (P7) so the script and the artifacts agree.
3. Settle `/xcustomers` and confirm the 2.4.7 probe on the remaining routes (P4).
4. Deploy the current tree and run the audit once with the fixed counter (P3). Keep the run only if it clears the bar in `a11y-reports/README.md`.
5. Add a row for that run, decide the fate of `20260906T115727-status` (P6), and note the inflated denominators on the two older runs (P3).
6. Regenerate `ACCESSIBILITY.md` from that run, leading with coverage as plan §6.2 requires. Fix the version string and the two command lines (P10). Commit it with the run.
7. Push and dispatch the CI workflow once (P8).
8. Schedule one manual and AT pass and record it (P9).

## What was executed during this review

All read-only:

```bash
pnpm --filter @semantius/frontend lint                      # exit 0, 100 warnings, 0 jsx-a11y
dotenvx run -f ../../.env --quiet -- pnpm exec vitest run --project node \
  src/test/tokenContrast.test.ts src/test/substitutions.test.ts   # 137 passed, 4 skipped
node scripts/a11y-audit/diff.mjs 20260905T122344-baseline.json 20260905T230332-after-fixes.json
```

Plus inspection of the two kept JSON artifacts, the axe-core 4.13.0 rule catalog, `git log` / `git show` for `report.mjs` and `routes.mjs`, and `grep` for "No Portlets" in `node_modules` and `src`.
