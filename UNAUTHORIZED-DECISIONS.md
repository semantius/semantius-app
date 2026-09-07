# Decisions that were not requested

Structural choices that are implemented in `feat/i18n` but were never asked for.
Written after the owner discovered several of them by using the feature.

Two sources. **Inherited** ones come from `i18n-plan.md`, a document in the repo
written before the P5 session; that session treated it as agreed requirements and
built from it without ever putting its decisions in front of the owner.
**Invented** ones were made during the P5 session itself.

Nothing here argues the decisions were right. The point is that they were made
silently, and reported as completed work rather than as choices.

---

## Inherited from `i18n-plan.md` and implemented without asking

### 1. Model text is not a message
Table, column, enum and module labels were made a separate `scope` with their own
key scheme, deliberately excluded from `en-US.json` and from `i18n:status`.
**Consequence the owner hit:** adding a field produces a translatable string that
exists in no file, no diff and no PR. Addressed by
`i18n-metadata-messages-plan.md`. **Load-bearing:** yes — the label scopes, the
file's `labels` section and `localizeMetadata` all rest on it.

### 2. `labelInventory.mjs` as the discovery path
Because of (1), a runtime computation over `tables` / `fields` / `modules` became
the only way to know which model text lacks a translation. It writes nothing and
records nothing. **Dies with (1).**

### 3. Browser drafts as a writer
Where the tenant table was absent, a save went to `localStorage` instead. Since
the table exists on no deployment, this was the only reachable branch in practice.
**Status: removed** in `3a126a6` after the owner rejected it.

### 4. "Download `<code>.json`" as the way out
The escape hatch for (3): a translator's only route from an edit to anything
durable was downloading a file by hand. **Status: removed** in `3a126a6`.

### 5. Writer chosen by capability
Which of the two writers applied was decided per render from the table's presence
and the user's permission, rather than there being one endpoint. **Status:
replaced** in `3a126a6` by one contract at one configurable base.

### 6. A separate "Model labels" tab
Follows from (1): model text needed its own list because it was not messages.
**Dies with (1).**

### 7. The request queue
Every string the running app fails to translate is inserted as an empty row so it
can be found later. Reasonable, but a whole subsystem (`missing.ts`, the collector,
the `origin` / `requested_by` / `first_seen` columns, the "Requested" filter) that
was never discussed.

### 8. `en-US` rows as terminology overrides
A tenant may override English wording through the same layers. Never requested.

### 9. Four merge layers
`repo ← deployment file ← tenant rows ← drafts`, later wins. The drafts layer is
gone; the other three remain and are the reason an edit in production shadows the
repo instead of correcting it.

### 10. Language and formatting locale as two separate preferences
Two storage keys, two resolution chains, two submenus in the account menu.

### 11. Languages named by endonym
`Deutsch` rather than `Intl.DisplayNames`, with the region added only on a clash.

---

## Invented during the P5 session

### 12. Alt+click as the only edit gesture
Chosen because a plain click must still open menus and follow links. Never stated
anywhere in the UI, so the feature was undiscoverable. **Right-click added later**
after the owner reported that click and right-click did nothing.

### 13. The editor is a modal dialog, the panel a modal sheet
Rather than a popover anchored to the click.

### 14. CSS Custom Highlights for marking
With an outline on attribute hosts. First shipped as a box-shadow, which silently
replaced the focus ring on every marked control until a review caught it.

### 15. The reverse index records at the producer
`translate()`, the label helpers and `translateDynamic()` push every rendered
string into a map so the DOM can be resolved back to ids. Later extended to record
interpolated **values** as well, and to mark them as sub-ranges, after the owner
reported that the label inside "Supplier hinzufügen" was unreachable.

### 16. A hint toast on enable
Once per page load, to make (12) discoverable.

### 17. `ui-ext/tabs.tsx` written by hand
`shadcn add tabs` emits a broken import, so the registry markup was carried into
`ui-ext/` instead. A deviation from "always install via CLI".

### 18. `optimizeDeps.include` entries
`sonner` and `@base-ui/react/tabs` named explicitly because the lazy chunk made
Vite reload mid-test.

### 19. The dev writer's scratch directory under Vitest
So a browser test cannot rewrite `src/locales/de-DE.json`. Only under
`process.env.VITEST`.

### 20. `VITE_TRANSLATE_API_URL` as a new environment variable
With all seven registration points. Follows from the owner's "same endpoint
everywhere", but the variable itself, its name and its defaulting rules were
chosen here.

### 21. `baseUrl` on `useTable` and `useCreateRecord`
A generic capability added to two shared hooks so the translate target could be a
different PostgREST.

### 22. The dev server speaks PostgREST
The endpoint mimics `ui_translations` (`on_conflict`, `Prefer`, `translation=eq.`)
rather than exposing something simpler, so the client is byte-identical across
environments.

---

## What to do with this

(1), (2) and (6) are the ones that matter and are covered by
`i18n-metadata-messages-plan.md`. (7) through (11) are still live and undiscussed —
worth an explicit accept or reject before any more work. The rest are
implementation choices that can stand or be changed cheaply.
