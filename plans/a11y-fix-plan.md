# Fix plan — drizzle-cube, the last open accessibility item

Everything else this plan once covered is done; its full text is in git history
(last complete version: `69df1ba`). What is left is in vendor code: the
drizzle-cube dashboard that `routes/_app.$moduleId.index.tsx` renders through
`CubeProvider` / `AnalyticsDashboard` on a module's home page (`/nwind`).

## State

| Criterion | Finding | Status |
| --- | --- | --- |
| 1.4.3 Contrast | "Add Portlet" button text: the vendor's light `--dc-primary` `#3b82f6` on white is 3.68:1 | **Fixed locally.** `apps/web/src/theme-a11y.css` sets `--dc-primary: #1d4ed8` (6.30:1) and `--dc-primary-hover: #1e40af` for light mode; the dark palette measured clean. Confirmed by audit run `pinning-lg`. |
| 1.3.1 Info and Relationships | Empty dashboard: the "No Portlets" placeholder is an `<h3>` directly under the page's `<h1>` | **Open.** Vendor markup, not fixable in CSS. The only criterion still failing in `ACCESSIBILITY.md` (14 findings, every viewport and both themes on `module-home`). |

Installed: `drizzle-cube ^0.5.8` (`apps/web/package.json`). Latest on npm: `0.9.3`.

The dashboard is excluded from the conformance claim, but it is a route users
open; `ACCESSIBILITY.md` and the README state that caveat.

## Ways to close 1.3.1

1. **Upgrade drizzle-cube** and check whether the empty-state heading changed.
   Not attempted. Four minor versions have passed, and `src/charts/` depends on
   `drizzle-cube/client` internals (`ChartProps` is defined locally because
   0.4.x did not export it; see CONTEXT-MEMORY "Drizzle-Cube Chart Plugins"), so
   this is an upgrade task in its own right, with the chart override retested.
2. **Report it upstream.** Filing on a third-party tracker is the owner's call.
   Drafted text, not filed:

   > `/nwind` dashboard, empty state: the `No Portlets` placeholder is an `<h3>`
   > directly under the page's `<h1>` (WCAG 1.3.1, heading level jump); and the
   > default light `--dc-primary` `#3b82f6` gives 3.68:1 for the `Add Portlet`
   > button text on `--dc-surface` white (WCAG 1.4.3 needs 4.5:1). Both
   > reproduced in 0.5.8.

3. **Render our own empty state** instead of the vendor's when the dashboard
   has no portlets. Only if 1 and 2 do not resolve it.

## Done when

An audit run (`pnpm test:a11y-audit` against a deployed preview) reports 1.3.1
Supports on `module-home`, `ACCESSIBILITY.md` is regenerated from that run, and
this file is deleted.
