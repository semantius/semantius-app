# Specifications that were not requested

Structural choices implemented in `feat/i18n` that came from `i18n-plan.md`
rather than from the owner. That document was treated as agreed requirements and
built from without its decisions ever being surfaced, which is why they had to be
discovered by using the feature.

**Scope of this list: specifications only.** Implementation choices made while
building (which gesture opens the editor, how marks are painted, how the reverse
index works, how a test avoids writing the repo) are not listed — they are
details, revisable at any time, and not what this document is for.

Corrected after review by the owner. Items previously listed here that **were**
requested have been removed: a tenant overriding English wording
("Customer" → "Patient"), language and formatting locale being two separate
preferences, and one configurable translate endpoint.

---

## 1. Model text is not a message

Table, column, enum and module labels were made a separate `scope` with their own
key scheme, deliberately excluded from `en-US.json` and from `i18n:status`.

**Consequence:** adding a field to an entity produces a translatable string that
exists in no file, no diff and no PR.

**Replacement:** `i18n-metadata-messages-plan.md`. **Load-bearing:** yes — the
label scopes, the file's `labels` section and `localizeMetadata` all rest on it.

## 2. `labelInventory.mjs` as the discovery path

Because of (1), a runtime computation over `tables` / `fields` / `modules` became
the only way to know which model text lacks a translation. It writes nothing and
records nothing. **Dies with (1).**

## 3. A separate "Model labels" tab

Follows from (1): model text needed its own list because it was not messages.
**Dies with (1).**

## 4. The request queue

Every string the running app fails to translate is inserted as an empty row, so
it can be found later — a whole subsystem (`src/i18n/missing.ts`, the collector,
the `origin` / `requested_by` / `first_seen` columns, the "Requested" filter).

**Mostly dies with (1), but not entirely.** Once metadata messages are extracted,
the queue is redundant for them, and it was always redundant for code strings.
What it still covers is text that no extraction can reach: messages PostgREST and
RPC functions raise from inside the database. Model validation-rule messages live
in `entities.validation_rules`, so they are metadata and would be extracted like
any other.

**Open:** whether that residue justifies keeping the subsystem, or whether those
messages should be reached another way.

## 5. Browser drafts as a writer — REMOVED

A save went to `localStorage` where the tenant table was absent. Since the table
exists on no deployment, this was the only reachable branch in practice.
Removed in `3a126a6`.

## 6. "Download `<code>.json`" — REMOVED

The escape hatch for (5): a translator's only route from an edit to anything
durable was downloading a file by hand. Removed in `3a126a6`.

## 7. Writer chosen by capability — REPLACED

Which of two writers applied was decided per render from the table's presence and
the user's permission, rather than there being one endpoint. Replaced in
`3a126a6` by one contract at one configurable base.

## 8. Four merge layers

`repo ← deployment file ← tenant rows ← drafts`, later wins. The drafts layer is
gone. The other three remain, and they are the reason an edit made in production
shadows the repo value rather than correcting it.

**Open:** still undiscussed.

## 9. Languages named by endonym

`Deutsch` rather than `Intl.DisplayNames`, with the region added back only when
two available languages share a subtag.

**Open:** cosmetic, but never asked for.

---

## Still to decide

(1), (2) and (3) are covered by `i18n-metadata-messages-plan.md`.
(4), (8) and (9) are live and undiscussed.
