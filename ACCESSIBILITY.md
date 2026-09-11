# Accessibility status

**WCAG 2.2 Level AA — supports with exceptions, and more than half of the
standard is unmeasured.** This document is the current state of that claim: how
much of the standard the evidence covers, what passes on that evidence, what does
not, and how to re-derive all of it. The scope of the claim — which routes and
components it covers, and which are excluded — is in
[README.md § Accessibility](README.md#accessibility).

| | |
| --- | --- |
| **Evidence** | `a11y-reports/20260906T173406-pinning-lg.json` |
| **Build audited** | preview `main-20260906175709`, `main` at `f1a55fb` |
| **Views** | 12 routes × 7 viewports × 2 themes = 168 views, **164 measured, 4 cantTell** |
| **Criteria** | 24 Supports · 2 Partially Supports · **29 Not Evaluated** (of 55 A + AA) |

`summary.pass` is false, and is meant to be: it is false whenever any criterion is
Partially Supports or any view is cantTell.

---

## Coverage first: 29 of 55 criteria are not evaluated

An automated run answers only the questions it has a check for. This one has
none for 29 criteria — more than half the standard — and a document that opened
with "2 criteria fail" would be hiding that. Two kinds:

- **4 review-only criteria** the audit emits raw material for but cannot judge,
  because the question is whether something is *good*, not whether it is
  *present*: 1.1.1 Non-text Content (the alt text is listed), 2.4.3 Focus Order
  (the tab sequence is listed), 2.4.6 Headings and Labels (the headings are
  listed), 4.1.3 Status Messages (the live regions are listed). A person reads
  those 164 lists; nobody has yet.
- **25 criteria no check covers at all**: 1.2.3–1.2.5, 1.3.2, 1.3.3, 1.4.5,
  1.4.13, 2.1.2, 2.1.4, 2.3.1, 2.4.5, 2.5.1, 2.5.2, 2.5.4, 2.5.7, 3.2.1–3.2.4,
  3.2.6, 3.3.1, 3.3.3, 3.3.4, 3.3.7, 3.3.8. Some are trivially true of this app
  (there is no audio, no flashing, no timed input) but "trivially true" is a
  judgment, not a measurement, and it is not made here.

Two more limits on what the evidence can say:

- **The audit sees only the states it reaches.** Each view is the route as it
  opens: no modal flows, no error states, no empty-versus-populated grids, no
  in-progress edits. A control that only appears after an interaction was never
  measured.
- **No screen-reader pass has ever been run.** Every name and role here comes
  from Chrome's accessibility tree, never from what a screen reader says.

---

## The two that do not pass

### 1.3.1 Info and Relationships — A — 14 findings across 14 of 164 views

`h1 → h3` heading jump on the string `"No Portlets"`, on `module-home`, every
viewport and both themes.

**Not our markup.** That string is in `drizzle-cube@0.5.8`'s `dist/` and appears
nowhere in `apps/web/src`. A heading level cannot be fixed in CSS; it needs an
upstream report, a version bump (0.9.0 is current on npm; whether it changes
this is unchecked), or a wrapper. The issue text is drafted in
`a11y-fix-plan.md` § 4.4 and not yet filed.

**The drizzle-cube dashboard is excluded from the claim's scope but not from the
user's experience.** `/nwind` is a route people open. Scoping it out bounds the
work; it does not bound what a user meets.

### 1.4.3 Contrast (Minimum) — AA — 4 findings across 4 of 164 views

Not the vendor button any more: that one (`--dc-primary` `#3b82f6`, 3.68:1) is
overridden to 6.30:1 in `theme-a11y.css` and its seven findings are gone. The
four that replaced them are on four unrelated views (`module-home` and
`crm-home-detail` at 768, `entity-record` and `settings` at 1440, all light),
two nodes each, `.mt-1` and `.gap-1` / `.h-auto` — the message line and the
Details button of the app's own **`ApiErrorDisplay`**, in `text-muted-foreground`
on the card's `bg-destructive/10` tint. The tenant's API had a bad minute during
this run (three of the four cantTell views are its error card), and these four
views rendered a smaller error card somewhere and were measured anyway.

That is an error-state pair no earlier run had reached — exactly the "states the
audit never sees" caveat above, seen once by accident. **Fixed in the tree after
this run** (`text-foreground` on both nodes, and the pair is now pinned in
`tokenContrast.test.ts` for every surface), **not re-audited**: the state cannot
be produced on purpose. The next full run either does not show it or shows it
fixed.

---

## What moved since the previous kept run

Two runs on 2026-09-06, against the last kept run before them
(`20260905T230332-after-fixes`); `node scripts/a11y-audit/diff.mjs <older> <newer>`
reproduces each step.

| Criterion | 09-05 | 09-06 first run | 09-06 second run | Why |
| --- | --- | --- | --- | --- |
| 1.4.10 Reflow | 5 findings | Supports | Supports | The two heading-plus-button rows wrap at 320 instead of pushing a button past the viewport |
| 2.5.8 Target Size | 6 findings | Supports | Supports | A short column title ("Id") was 16px wide beside a 24px sort icon; `min-w-6` on the title button. Measured first — the planned `min-h-6` would have changed nothing |
| 2.4.7 Focus Visible | 13 findings | Supports | Supports | All 13 were on `/xcustomers`, an internal test page now excluded; the probe also now reports controls that refuse focus instead of counting them as "no indicator" |
| 2.4.2 Page Titled | 1 collision | Supports | Supports | The colliding title was `/xcustomers` vs the real Customers view |
| 2.4.11 Focus Not Obscured | 64 / 24 views | 54 / 18 views | **Supports** | First the grid's scroll-padding stopped being frozen and phones stopped pinning; then column pinning moved from `md:` to `lg:` (768px was measured too narrow for the pinned set), and 42 findings turned out to be controls behind the record Sheet that no Tab press reaches — the probe now measures only the open dialog, and the page behind is `inert` (below) |
| 1.4.3 Contrast | 7 (vendor) | 7 (vendor) | 4 (our error card) | The vendor primary is overridden; the error card's muted text is fixed after the run |
| cantTell | 4 | 2 | 4 | Provider and tenant rate limits that outlasted the app's ~10s retry (`apps/web/src/lib/retry.ts`) and the audit's re-navigations |
| Views | 224 | 168 | 168 | `/xcustomers` and its three sub-routes are excluded as an internal test page |

The four cantTell views are three *"Failed to fetch user information from API"*
and one *"…from OAuth provider"* — the tenant's PostgREST and the identity
provider refusing for longer than the app's ten-second budget plus the audit's
3s → 60s re-navigation waits. They are not counted for any criterion.

**One thing this run found that is not a criterion it reports.** The record
Sheet, opened by deep link, left the whole page behind it exposed to a screen
reader: Base UI hides the outside once, at open, and exempts every live region's
ancestors, and the grid renders after the Sheet does. Keyboard focus was
trapped all along (measured); the virtual cursor was not. `#root` is now `inert`
while any dialog is open (`components/a11y/ModalInert.tsx`), and the toaster is
portaled out of `#root` so it still announces. Proven in
`e2e/modal-inert.spec.ts`, not by the audit — the audit has no screen-reader
pass, which is the caveat above.

---

## The mobile picture

Two different things wear the word "mobile" here, and only one of them is about
phones.

**The responsive layout.** Below Tailwind's `md:` breakpoint the app changes
shape: the sidebar becomes a Sheet and form fields go single-column (an
`@container (max-width: 30rem)` query, so it keys on the form's own width rather
than the viewport). Data-grid column pinning — the label column, the drag handle
and the row-actions column alike — is off below `lg:` (64rem), not `md:`:
pinned columns are sized in absolute pixels and take 320 of a 390px viewport's
343 and still 370 of the 480px container a 768px viewport leaves beside the
sidebar, leaving every other column permanently underneath them. Both
breakpoints are in rem, read through `matchMedia`, so they move with a raised
root font size instead of desynchronizing from the `md:`/`lg:` utilities on the
page.

**The 320px column.** Not a device choice. WCAG 2.2 SC 1.4.10 requires content to
work at a width equivalent to 320 CSS px without scrolling in two dimensions, and
that number is **1280px at 400% zoom**. The user it protects is someone with low
vision on a laptop, not someone on a 2016 phone. Current handsets are ~360–430
CSS px, which the 390 column covers; both stay, for different reasons, and 320
cannot be dropped without dropping the criterion.

Where the failures land now: nowhere in particular. The vendor heading jump is
on `module-home` at every width, and the four error-card contrast findings are
on whichever views happened to render an error card. No viewport has a finding
of its own any more; the sticky-surface problem that dominated the earlier runs
is closed.

---

## What passes, and on how much evidence

| Criterion | Level | Views checked |
| --- | --- | --- |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | 164 |
| 1.2.2 Captions (Prerecorded) | A | 164 |
| 1.4.1 Use of Color | A | 164 |
| 1.4.2 Audio Control | A | 164 |
| 2.1.1 Keyboard | A | 164 |
| 2.2.1 Timing Adjustable | A | 164 |
| 2.2.2 Pause, Stop, Hide | A | 164 |
| 2.4.1 Bypass Blocks | A | 164 |
| 2.4.2 Page Titled | A | 164 |
| 2.4.4 Link Purpose (In Context) | A | 164 |
| 2.5.3 Label in Name | A | 164 |
| 3.1.1 Language of Page | A | 164 |
| 3.3.2 Labels or Instructions | A | 164 |
| 4.1.2 Name, Role, Value | A | 164 |
| 1.3.4 Orientation | AA | 164 |
| 1.3.5 Identify Input Purpose | AA | 164 |
| 1.4.4 Resize Text | AA | 164 |
| 1.4.10 Reflow | AA | 164 |
| 1.4.11 Non-text Contrast | AA | 39 |
| 1.4.12 Text Spacing | AA | 164 |
| 2.4.7 Focus Visible | AA | 39 |
| 2.4.11 Focus Not Obscured (Minimum) | AA | 164 |
| 2.5.8 Target Size (Minimum) | AA | 164 |
| 3.1.2 Language of Parts | AA | 164 |

View counts differ per criterion because each is checked by the probes that can
speak to it: 1.4.11 and 2.4.7 only where a form control is rendered (39 views),
everything else on every measured view. With a modal dialog open, the focus
probes measure only the dialog — a control no Tab press reaches cannot be
"obscured when focused". A view is counted once per criterion
however many probes touch it; the three earlier kept runs counted once per probe
and say "of 440" over a 224-view set — read those denominators as inflated.

Two things "Supports" does not say. **2.4.1 Bypass Blocks** is checked as "a
skip link exists, is first in the tab order, and its target resolves"; that its
target now sits *below* the app header rather than on the `<main>` that contains
the header was fixed this run, and is not what the check measures. **2.4.7** is
measured on the first twelve controls of a view that take focus; a control that
refuses focus is now listed as evidence, never counted as an indicator.

---

## How to verify this document

Everything here is re-derivable. Four layers produce it, because no single one
can see everything:

| Layer | Runs | Answers |
| --- | --- | --- |
| Token contrast (`apps/web/src/test/tokenContrast.test.ts`) | node, in `pnpm check` | Is the palette itself conformant, on every surface a control can sit on — including pairs no current route happens to render? |
| Component tests in Chromium (the `browser` Vitest project in `apps/web/vite.config.ts`) | Playwright-driven Chromium, in `pnpm check` | Is every form control named, described and operable as actually rendered — real CSS, real popovers, the code-split editors mounted — and, for the triggers that name themselves, what name does Chrome's own accessibility tree compute? |
| Lint (`eslint-plugin-jsx-a11y`) | `pnpm lint` | Are there static ARIA/markup defects? |
| Route audit (`scripts/a11y-audit/`) | a real browser, against a deployed preview | axe-core plus what axe cannot see: `::placeholder` contrast, rendered focus indicators, 320px reflow measured on descendants, 2.4.11 focus-not-obscured, `<title>` uniqueness, `<h1>` presence. |

The audit is keyed by **success criterion**, not by route, and two rules are what
make its numbers mean anything:

- **A criterion nothing checked reads Not Evaluated, never Supports.** A criterion
  no rule covers is simply absent from an axe payload; rendering absence as a pass
  is the one thing that would make this document a dishonest claim.
- **A view the audit could not measure is cantTell, not a pass**, and is
  excluded from every criterion's evidence. A run with cantTell views cannot
  read as a clean one.

The commands, with their traps, are in
[apps/web/README.md § Accessibility and responsive checks](apps/web/README.md);
in short:

```bash
# Palette contrast + the source-scan invariants, and the component tests in a
# real Chromium. Both are part of the release gate.
pnpm check

# The route × viewport × theme audit, against a DEPLOYED preview (not localhost:
# the point is to measure the artifact that ships).
pnpm preview:wrangler
dotenvx run -- node scripts/a11y-audit/run.mjs \
  --url "$(grep -oE 'https://\S+' .preview-url.md)" --label <label>

# What moved between two runs (bare filenames; the script looks in a11y-reports/).
node scripts/a11y-audit/diff.mjs <older>.json <newer>.json
```

## How to update this document

1. Deploy a preview of the tree you want to describe and run the audit against
   it. A run against a superseded deploy answers a question nobody asked.
2. Decide whether the run is **keepable** — it finished, its cantTell count
   is small and each one is explained, and `meta.url` is the preview that was
   current. The bar is spelled out in
   [a11y-reports/README.md](a11y-reports/README.md). Delete a run that does not
   clear it; a partial run left in place is worse than none, because the next
   reader cannot tell it apart from a real one.
3. Commit the kept run's `.json` and `.txt`, and add a row to that file's table.
4. Rewrite the tables above **from that run** and update the citation block at
   the top. Every number in this document comes from one named artifact; if you
   cannot point at the run a number came from, it does not belong here. Lead
   with the coverage, not the findings.
