# Accessibility sweep artifacts

One JSON file per run of `scripts/a11y-sweep/run.mjs`, plus a `.txt` digest.

`run.mjs` also writes `latest.json`, a byte-identical copy of the run it just
finished. That copy is **git-ignored and never committed** — it is a local
convenience for `jq`-ing the most recent run, and committing it would put a
second 363KB copy of an existing file in history under a name that goes stale
the next time anyone sweeps. Cite a run by its timestamped filename.

Each file is keyed by **success criterion**, not by route, and uses the report
vocabulary: `Supports` / `Partially Supports` / `Does Not Support` /
`Not Applicable` / `Not Evaluated`. Two rules make the numbers mean something:

- A criterion nothing checked reads **Not Evaluated**, never `Supports`. A
  criterion no rule covers is simply absent from an axe payload; rendering
  absence as a pass would make the whole artifact a dishonest conformance claim.
- A cell the sweep could not measure is **INCONCLUSIVE** and is excluded from
  every criterion's evidence. `summary.pass` is false whenever any cell is
  inconclusive, so an unmeasurable run cannot read as a clean one. The reasons
  are listed under `inconclusive[]`.

## What a run has to clear to be kept here

Only keep a run whose numbers can be relied on. Delete any other — a partial run
left in place is worse than no run at all, because the next reader has no way to
tell it apart from a real one.

- **It finished.** A killed or crashed run writes nothing; if you find yourself
  reconstructing one from a driver log, throw it away and re-run.
- **Its inconclusive count is small and explained.** A run whose access token
  expired part-way through measures the token, not the app.
- **It names the build it ran against.** `meta.url` must be the preview that was
  current at the time. A run against a superseded deploy answers a question
  nobody asked.

## What is here

| Run | State of the tree | Notes |
| --- | --- | --- |
| `20260905T122344-baseline.json` | After the Level-A fixes and the `--ring` / `--input-border` work, **before** the 1.4.3 palette change | 16 routes x {390, 1440} x {light, dark}. 55/64 cells admissible; the 9 inconclusive ones are the tenant API's cold-start 404 (see below). This is the baseline the color change is meant to be diffed against. |

## Outstanding: no post-fix run exists

The sweep authenticates with a token minted from `SEMANTIUS_API_KEY`, and that
key began returning `401 {"error":"Invalid API key"}` from
`https://tests.semantius.cloud/token` part-way through the work. Every
authenticated route is unreachable to the harness until it is reissued.

Two runs were attempted after the fixes and both were discarded rather than kept:
one ran against a build that had already been superseded, and one ran past its
token's one-hour expiry and finished with 145 of 224 cells inconclusive. Neither
described the current tree.

To produce the run that is missing:

```bash
# 1. Confirm the key works BEFORE spending 40 minutes on a sweep.
dotenvx run --quiet -- node scripts/mint-token.mjs | head -c 12    # expect "eyJ..."

# 2. Deploy the CURRENT tree; the sweep must measure the build under review.
pnpm preview:wrangler

# 3. Sweep. Tokens last one hour and the full matrix takes ~40 minutes, so mint
#    immediately before, and re-run rather than accept a tail of inconclusive cells.
dotenvx run -- node scripts/a11y-sweep/run.mjs \
  --url "$(grep -oE 'https://\S+' .preview-url.md)" --label after-fixes --screenshots
```

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
