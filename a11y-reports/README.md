# Accessibility audit artifacts

One JSON file per run of `scripts/a11y-audit/run.mjs`, plus a `.txt` digest.

`run.mjs` also writes `latest.json`, a byte-identical copy of the run it just
finished. That copy is **git-ignored and never committed** — it is a local
convenience for `jq`-ing the most recent run, and committing it would put a
second 363KB copy of an existing file in history under a name that goes stale
the next time anyone audits. Cite a run by its timestamped filename.

Each file is keyed by **success criterion**, not by route, and uses the report
vocabulary: `Supports` / `Partially Supports` / `Does Not Support` /
`Not Applicable` / `Not Evaluated`. Two rules make the numbers mean something:

- A criterion nothing checked reads **Not Evaluated**, never `Supports`. A
  criterion no rule covers is simply absent from an axe payload; rendering
  absence as a pass would make the whole artifact a dishonest conformance claim.
- A view the audit could not measure is **cantTell** and is excluded from
  every criterion's evidence. `summary.pass` is false whenever any view is
  cantTell, so an unmeasurable run cannot read as a clean one. The reasons
  are listed under `cantTell[]` (`inconclusive[]` in the artifacts kept from
  before the rename; `diff.mjs` reads both).

## What a run has to clear to be kept here

Only keep a run whose numbers can be relied on. Delete any other — a partial run
left in place is worse than no run at all, because the next reader has no way to
tell it apart from a real one.

- **It finished.** A killed or crashed run writes nothing; if you find yourself
  reconstructing one from a driver log, throw it away and re-run.
- **Its cantTell count is small and explained.** A run whose access token
  expired part-way through measures the token, not the app.
- **It names the build it ran against.** `meta.url` must be the preview that was
  current at the time. A run against a superseded deploy answers a question
  nobody asked.

## What is here

| Run | State of the tree | Notes |
| --- | --- | --- |
| `20260905T122344-baseline.json` | After the Level-A fixes and the `--ring` / `--input-border` work, **before** the 1.4.3 palette change | 16 routes x {390, 1440} x {light, dark}. 55/64 views measured; the 9 cantTell ones are the tenant API's cold-start 404 (see below). This is the baseline the color change is meant to be diffed against. |
| `20260905T230332-after-fixes.json` | The `feat/a11y-wcag-aa-mobile` tip (commit 30, dark `--muted-foreground` restored), preview `feataywcag-20260905232649` | The first kept post-fix run. 16 routes x 7 viewports x {light, dark} = 224 views, 220 measured; the 4 cantTell are three provider `429` cards (now caught by the probe) and one failed navigation. Against the baseline at 390/1440: `2.4.1` and `1.4.11` → Supports; `1.4.3` 38 → 2 findings; `1.4.10` 11 → 0; `2.4.11` 300 → 14; `2.4.7` 16 → 3; `1.3.1` 7 → 4; `2.5.8` 2 → 2; `2.4.2` still one title collision. Seven criteria remain Partially Supports across the full matrix, most of it at 320. `node scripts/a11y-audit/diff.mjs` reproduces this. |

## The runs that were discarded, and what each changed

Three runs after the fixes were discarded rather than kept, each for a reason the
bar above names, and each changed the harness:

- one ran against a build that had already been superseded;
- one minted its token once and ran past the hour, ending with 145 of 224 views
  cantTell — `run.mjs` now re-mints inside the hour;
- one (2026-09-05 22:13, 224 views, 31 minutes, 0 cantTell) looked clean and
  was not: the identity provider had rate-limited the userinfo call on 19 views
  (`429`), the app rendered "Failed to fetch user information from OAuth
  provider", and the admissibility probe — which knew only the PostgREST wording
  of that card — counted the error cards as pages. `probes.mjs` now recognizes
  both wordings and `run.mjs` waits 3s → 60s between retries so a limit window
  can pass. That run also exposed a real regression the token test had missed:
  dark-mode placeholders at 2.72:1, because `theme-a11y.css` corrected
  `--muted-foreground` in `:root` only, and its `:root` block outranks
  `global.css`'s `.dark` by source order. Fixed, with the test's cascade model;
  see CONTEXT-MEMORY.md, "The order cuts both ways".

To produce the run that is missing:

```bash
# 1. Confirm the key works BEFORE spending half an hour on an audit.
dotenvx run --quiet -- node scripts/mint-token.mjs | head -c 12    # expect "eyJ..."

# 2. Deploy the CURRENT tree; the audit must measure the build under review.
pnpm preview:wrangler

# 3. Audit. 224 views take about 31 minutes. The run re-mints its own token and
#    retries a view that rendered an error surface with growing waits.
pnpm test:a11y-audit --url "$(grep -oE 'https://\S+' .preview-url.md)" --label after-fixes --screenshots
```

Or run it from CI: dispatch `.github/workflows/a11y.yml` with `audit` on. It
provisions a runner with `workplace/setup.sh`, deploys a preview of the chosen
commit, runs the audit against it and uploads `a11y-reports/` as an artifact —
download the timestamped `.json` and `.txt` into this folder to keep the run. The
job fails while any criterion is open, by design; the artifact is the result.

Then diff `criteria[]` against the baseline.

## Reading the baseline

Findings it records that later work addressed:

- `1.4.3` — `.bg-muted` text and the `::placeholder` on every input (4.28:1).
- `1.4.10` — the `xcustomers` pagination row and the sticky form footer's bleed.
- `1.4.11` / `2.4.7` — hand-rolled `<select>` controls still on `border-input`.
- `2.4.11` — data-grid column headers entirely hidden under pinned columns at
  320/390.
- `2.5.8` — the numeric column's `size-5` sort trigger.

Findings it records that are **probe artifacts fixed in the harness, not in the
app**, so they will not appear again: background elements reported as obscured
while a modal made them `inert`, `<svg>` children reported as overflowing, and
routes without a navigation landmark reported as missing a skip link.
