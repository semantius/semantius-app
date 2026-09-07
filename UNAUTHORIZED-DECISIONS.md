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

## 4. The request queue — RESOLVED

Every string the running app fails to translate is inserted as an empty row.

**Kept, and it is the whole discovery mechanism.** Metadata is never processed
offline (a model script cannot enumerate what nested JsonLogic raises with
values interpolated), so running the app IS how model text and database text are
found. That is requirement 10.

Two corrections it needs: it writes through the **configured target** like every
other write, instead of POSTing at a relative `/ui_translations`; and recording
is a property of the **mode** — `dev` and `stage` record, `prod` does not, `off`
is the default for prod. `origin` / `requested_by` / `first_seen` and the
"Requested" filter go with the row-per-message table.

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

## 8. Four merge layers — RESOLVED

`repo <- deployment file <- tenant rows <- drafts`, later wins.

**Replaced by two sources.** One file per language (the complete language for
that product version, served so an operator can replace it without a rebuild)
and one JSON record per language in the database (per-message overrides and
customer-added text), merged per key, database over file. A production write is
an override by design — that is what the database record is for — so there is no
divergence to report.

The `src/locales` / `public/locales` split goes with it: it only ever existed to
route by scope.

## 9. Languages named by endonym — RESOLVED, kept

`Deutsch` rather than `Intl.DisplayNames`. Correct as it stands:
`Intl.DisplayNames` names a language in the CURRENT UI language, so a German
speaker on an English UI would be offered "German" and would have to know the
English word for their own language to find it.

## Still to decide

Nothing on this list. The one thing deliberately postponed is interpolated
**error** text — see `i18n-metadata-messages-plan.md`, section 6 and "Deferred".
Errors are skipped in this iteration and addressed in the next, starting on the
backend.
