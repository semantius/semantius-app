# Accessibility status

**WCAG 2.2 Level AA — supports with exceptions.** This document is the current
state of that claim: what passes, what does not, where the failures are, and how
to re-derive all of it. The scope of the claim — which routes and components it
covers, and which are excluded — is in
[README.md § Accessibility](README.md#accessibility).

| | |
| --- | --- |
| **Evidence** | `a11y-reports/20260905T230332-after-fixes.json` |
| **Build audited** | preview `feataywcag-20260905232649`, branch `feat/a11y-wcag-aa-mobile` |
| **Coverage** | 16 routes × 7 viewports × 2 themes = 224 views, **220 measured** |
| **Result** | 19 Supports · 7 Partially Supports · 29 Not Evaluated (of 55 A + AA criteria) |

The run does not read as a pass, and is not meant to: `summary.pass` is false
whenever any criterion is Partially Supports or any view is cantTell.

---

## The seven that do not pass

Ordered by how much of the app they touch.

### 2.4.11 Focus Not Obscured (Minimum) — AA — 64 findings across 24 of 220 views

A focused control ends up underneath a sticky surface. Three groups:

| Count | What covers what |
| --- | --- |
| 28 | The record form's **sticky action bar** covers a control below it |
| 14 | The grid's **sticky table header** covers a column-sort button |
| 8 | A field description covers the control it describes |
| 14 | The pagination controls, under the same two surfaces |

Routes `entity-record` (42) and `entity-list` (22); every viewport, worst at 320
and 768. `scroll-padding` is the lever and is already applied to `html`, the
Sheet/Dialog and the grid container — but where the sticky surface is taller than
the space left over, padding cannot move the control clear. **This is the one
open item that may end in a design decision rather than a CSS fix.**

### 2.4.7 Focus Visible — AA — 13 findings across 13 of 94 views

One route, `xcustomers-record`, at every viewport: *"5 control(s) present but none
produced a measurable focus indicator."*

**Triage this before fixing it.** The probe calls `el.focus()` and skips any
control where `document.activeElement !== el`; a modal that traps focus elsewhere
produces this exact message with nothing wrong. One route, one message repeated
13 times, on a demo route — the shape of a measurement artifact, not of 13
defects.

### 1.3.1 Info and Relationships — A — 14 findings across 14 of 440 views

`h1 → h3` heading jump on the string `"No Portlets"`, on `module-home`, every
viewport and both themes.

**Not our markup.** That string is in `drizzle-cube@0.5.6`'s `dist/` and appears
nowhere in `apps/web/src`. Fixing it means an upstream report, a version bump, or
a wrapper — not an edit to a component in this repo.

### 1.4.3 Contrast (Minimum) — AA — 7 findings across 7 of 440 views

One button below 4.5:1 on `module-home`, light theme only. The offending node is
`.dc\:inline-flex.dc\:px-4.dc\:py-2` — the `dc:` prefix is drizzle-cube's Tailwind
namespace. **Also vendor**, same package, same remedy.

> The README's scope section excludes the drizzle-cube dashboard from the claim,
> but the audit still walks `/nwind` because a user does. These two are reported
> rather than suppressed for that reason: excluded from the claim is not the same
> as absent from the product.

### 1.4.10 Reflow — AA — 5 findings across 5 of 220 views — **320 only**

One button per page extends past the viewport with nothing able to scroll to it:

| Route | Element | Width | Overflows by |
| --- | --- | --- | --- |
| `entity-list` | "Add Customer" | 150px | 14px past 305px |
| `documents` | "New Document" | 157px | 13px past 320px |
| `xcustomers` | "Add Customer" | 150px | 14px past 305px |

(Both light and dark on `entity-list`; the two viewport numbers differ because
the probe measures `documentElement.clientWidth`, which is 305 where a vertical
scrollbar is present and 320 where it is not. Content has to survive the
narrower one.)

Small, real, and ours.

### 2.5.8 Target Size (Minimum) — AA — 6 findings across 6 of 220 views

One node, under 24px tall:
`.justify-end > .truncate.font-semibold.focus-visible\:outline-offset-2` — the
record link in a right-aligned grid cell. `entity-list` at 320, 390 and 640, both
themes. Ours, and a one-line fix.

### 2.4.2 Page Titled — A — 1 finding

`/nwind/customers` and `/xcustomers` both render the title
`"Customers · Semantius"`. Ours. Either retitle the demo route or delete it.

---

## The mobile picture

Two different things wear the word "mobile" here, and only one of them is about
phones.

**The responsive layout.** Below Tailwind's `md:` breakpoint the app changes
shape: the sidebar becomes a Sheet, form fields go single-column (an
`@container (max-width: 30rem)` query, so it keys on the form's own width rather
than the viewport), and data-grid column pinning is switched off entirely —
pinned columns are sized in absolute pixels and would take 320 of a 390px
viewport's 343, leaving every other column permanently underneath them. The
breakpoint is `48rem`, **not** `768px`, read through `matchMedia`, so it moves
with a raised root font size instead of desynchronizing from every `md:` utility
on the page.

**The 320px column.** Not a device choice. WCAG 2.2 SC 1.4.10 requires content to
work at a width equivalent to 320 CSS px without scrolling in two dimensions, and
that number is **1280px at 400% zoom**. The user it protects is someone with low
vision on a laptop, not someone on a 2016 phone. Current handsets are ~360–430
CSS px, which the 390 column covers; both stay, for different reasons, and 320
cannot be dropped without dropping the criterion.

Where the failures actually land:

| Viewport | State |
| --- | --- |
| **320** | The three ours-and-small defects live here: the overflowing button (1.4.10), the under-sized grid link (2.5.8), and the worst of the focus-obscured findings (2.4.11) |
| **390** | Clean apart from 2.4.11 and 2.5.8, which it shares with wider viewports |
| **844×390 landscape** | No findings of its own |
| **640 / 768 / 1024 / 1440** | 2.4.11 (768 is its second-worst width), plus the two vendor findings on `module-home` |

So the layout adapts; what remains is a handful of things a few pixels wrong at
the narrowest width, plus one structural problem with sticky surfaces that is not
specific to mobile at all.

---

## What this claim does not cover

Stated because a reader who sees "WCAG 2.2 AA" would otherwise infer it was
covered.

**29 of 55 criteria report Not Evaluated, for two different reasons.**

- **Four** have no machine pass condition, because each asks whether something is
  *good* rather than whether it is *present*: 1.1.1 (is the alt text accurate),
  2.4.3 (is the focus order meaningful), 2.4.6 (is the heading descriptive),
  4.1.3 (does the announcement say something useful). For these four the audit
  emits the raw material — every alt string, the tab order per route, every
  heading, every live region — so they are reviewed by reading a diff.
- **The other 25** are Not Evaluated because no check covers them at all. They
  carry no evidence in the artifact. Not Evaluated means exactly that, never
  "passed quietly".

**No screen-reader pass has been run**, and no manual accessibility pass is
scheduled. That is deliberate — a cadence nobody runs decays into a claim nobody
can support — but it is a real limit on everything above: the audit measures what
a browser can be asked, not what a screen-reader user experiences.

**Excluded from the claim** (see the README's scope section): the drizzle-cube
`AnalyticsDashboard` and `apps/web/src/charts/` which only renders inside it, and
`/form-playground`. **Excluded from the audit run** for lack of a steady state:
`/logout` (side effect then redirect) and `/oauth2_callback` (reachable only
mid-OAuth with a live code).

**The audit sees only the routes it visits in the states it reaches.** Modal
flows, error states and empty-versus-populated grids need cases that are not yet
written.

**Nine lint violations are accepted**, not fixed: 3 frozen in
`apps/web/eslint-suppressions.json` and 6 documented inline (two niko-table
composite widgets, one deliberate autofocus, three `anchor-has-content` on
NavUser links whose content arrives through Base UI's `render` merge, which the
rule cannot follow).

**A module tile's background can be overridden per module by authored
`logo_color` data.** No palette check can reach that; its contrast is a data
question.

---

## What passes, and on how much evidence

| Criterion | Level | Views checked |
| --- | --- | --- |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | 220 |
| 1.2.2 Captions (Prerecorded) | A | 220 |
| 1.4.1 Use of Color | A | 220 |
| 1.4.2 Audio Control | A | 220 |
| 2.1.1 Keyboard | A | 220 |
| 2.2.1 Timing Adjustable | A | 220 |
| 2.2.2 Pause, Stop, Hide | A | 220 |
| 2.4.1 Bypass Blocks | A | 312 |
| 2.4.4 Link Purpose (In Context) | A | 220 |
| 2.5.3 Label in Name | A | 220 |
| 3.1.1 Language of Page | A | 440 |
| 3.3.2 Labels or Instructions | A | 220 |
| 4.1.2 Name, Role, Value | A | 220 |
| 1.3.4 Orientation | AA | 252 |
| 1.3.5 Identify Input Purpose | AA | 220 |
| 1.4.4 Resize Text | AA | 220 |
| 1.4.11 Non-text Contrast | AA | 94 |
| 1.4.12 Text Spacing | AA | 220 |
| 3.1.2 Language of Parts | AA | 220 |

View counts differ per criterion because each is checked by the probes that can
speak to it: 1.4.11 only where a form control is rendered, 3.1.1 on every
document in both themes, 2.4.1 wherever a landmark structure exists.

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

# What moved between two runs.
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
   cannot point at the run a number came from, it does not belong here.
