# Plan: metadata messages are messages

**Status: proposed, not agreed. Nothing implemented.**

This plan replaces the "model labels" concept in `i18n-plan.md`. That concept was
never requested; see `UNAUTHORIZED-DECISIONS.md` for how it got there.

## The goal, as stated

1. Messages from **code** are extracted and stored in `en-US.json`. *(works today)*
2. Messages from **metadata** get a key — `module.entity.field.type` — and are
   stored in `en-US.json` too. *(this plan)*

One mechanism, one index, one translation path. No second concept.

## What is wrong today

Model text is not a message. It is a separate `scope` (`table` / `column` /
`enum` / `module`) with its own key scheme (`accounts.status.title`), its own
discovery path, its own panel tab, and it **never enters `en-US.json`**.

The consequences, all of which you hit:

- Adding a field to an entity produces a translatable string that appears in **no
  file**. Nothing in the repo records it, no diff shows it, no PR reviews it.
- Finding those strings needs `labelInventory.mjs`, which computes a list at
  runtime from `tables` / `fields` / `modules` and throws it away.
- `i18n:status` and the catalog test are blind to them by design.
- The panel needs a separate "Model labels" tab because they are not messages.

## Target design

**A metadata message is a message.** It has a key instead of using its English as
the key, and that is the only difference from a code string.

```
key       module.entity.field.type
          nwind.orders.ship_city.title
          nwind.orders.__table__.plural        (entity-level: no field)
          nwind.__module__.name                (module-level: no entity, no field)
type      the model attribute — title, description, plural, singular, hint, …
```

Decide the entity-level and module-level spelling before implementing; the
placeholders above are deliberately ugly so they get replaced rather than
inherited.

Everything downstream follows from that one change:

- `en-US.json` holds both kinds, in the same shape (see "Drop `origin`" below —
  that shape is smaller than today's).
- `de-DE.json` and every other catalog holds both. Same empty-value convention.
- `i18n:status` reports both. The catalog test checks both.
- A removed field's message moves to `obsolete`, exactly as a reworded code
  string does. The "orphaned" concept disappears.
- The `scope` column collapses to almost nothing. `message` covers code and
  metadata. `rule` goes with it: a validation-rule message lives in
  `entities.validation_rules`, which is metadata and is extracted like any other.
  Only `server` — text PostgREST and RPC functions raise from inside the
  database — cannot be extracted by anything, and whether that residue justifies
  keeping the request queue is open (`UNAUTHORIZED-DECISIONS.md` item 4).
- Translate mode has one list. The "Model labels" tab goes.

**Module-scoped keys are what make a module a unit.** Add a module, its messages
arrive with it; remove it, `key like 'nwind.%'` removes them; ship it, its
messages ship with it.

## The one hard problem

**The model is in a database. `i18n:extract` reads the repo.** So something has
to bring the shipped model into a place the extractor can read, offline and
deterministically.

Two options, and this is the decision the plan needs from you:

**A. A committed model snapshot.** Each shipped module keeps a JSON dump of its
entities, fields and modules in the repo. `i18n:extract` reads code *and* that
snapshot. Adding a field means the snapshot changes, so it is a diff and a PR
like everything else, and extraction stays offline. Cost: the snapshot must be
regenerated when the model changes, and it can drift from the live model.

**B. Extract against a reference tenant.** `i18n:extract` gains a mode that
connects and reads the model. No snapshot to maintain. Cost: extraction needs
credentials and a network, stops being deterministic, and `en-US.json` is no
longer derivable from the repo alone.

A is recommended: it keeps the property that made this scheme worth having — a
new translatable string shows up in a diff.

## The endpoint

Specified separately in `i18n-endpoint-spec.md`, including two open questions:
whether the contract should keep mimicking PostgREST or become a plain
`{ locale, key, translation }` API with a tenant-side adapter, and the ownership
correction below.

**The i18n layer owns the endpoint calls.** It already owns where translations
come from — the layer list, `setDeploymentLocales`, `setTenantLocaleFiles`,
`translateApiUrl()`. The current code instead borrows the generic `useTable` and
`useCreateRecord` and threads the base url through them as a `baseUrl` argument,
which sends configuration out of the layer that owns it and back in. The read-all
and write-one belong in `src/i18n`, and then `baseUrl` reverts out of both shared
hooks and no call site passes anything.

The repo rule that all data access goes through the generic hooks is about tenant
business data. Translations are the i18n layer's own store and may sit on a
different host entirely, so they are the exception — following the rule literally
is what produced the awkwardness.

## Customer-created entities

A customer who adds an entity in their own deployment goes through the **same**
mechanism, not a different one. Their model generates the same keys; their
translations go to their own store through the endpoint that already exists
(`VITE_TRANSLATE_API_URL`, an upsert on `ui_translations`). The only thing that
differs is where the index lives — our repo for shipped modules, their database
for theirs. Keying, resolution and rendering are identical.

No script is involved and none can be: nothing outside their deployment has
access to their database.

## What gets deleted

- `scripts/i18n/labelInventory.mjs` and `.d.mts`
- `scripts/i18n/labels.mjs`, `scripts/i18n/model.mjs`
- `src/i18n/labelInventory.ts` and its test
- `src/i18n/translateMode/LabelsTab.tsx`
- The four label scopes and their key builders in `src/i18n/catalog.ts`
- The label branch of `src/i18n/localeFile.mjs` (`parseLabelKey`, the nested
  `labels` file section)
- `localizeMetadata` collapses into a plain message lookup keyed by the model path

Roughly 900 lines removed against maybe 250 added.

## Drop `origin` from the index

`en-US.json` stores an `origin` array per entry — the files a string is used in,
with no line numbers, deliberately, so a moved line does not churn the file. It
is **41% of the file** and should go.

Its one stated justification was a heuristic: an entry with more than one origin
file means the same English word is used in two places and may need a `context`
to split. That heuristic is unsound in both directions. Two meanings can sit in
one file, so it misses them; one meaning used in five files trips it, so most of
the 45 multi-origin entries today are noise. The `View` split that motivated it
would not have been found this way — the disambiguated one is in a single file.

What is left is weak context for a translator, when the source text IS the key
and `grep -r "the string" src` answers the same question exactly. And for a
metadata message the origin is the model, which the key already encodes, so
storing it would repeat the key.

Removing it makes `en-US.json` an id-to-source map and nothing else.

## Not addressed here

The four merge layers (`repo ← deployment file ← tenant rows`, later wins) are
untouched by this plan and still undiscussed — `UNAUTHORIZED-DECISIONS.md` item 8.
They apply to metadata messages exactly as they do to code strings, and they are
the reason an edit made in production shadows the repo value rather than
correcting it.

## Migration

None. `ui_translations` does not exist on any deployment, so there are no rows
to convert. This is the cheapest moment there will ever be.

## Order of work

1. Agree the key spelling and option A or B above.
2. Key builder + the model-to-messages step, with tests, no UI.
3. `i18n:extract` writes metadata messages into `en-US.json`; `i18n:status`
   reports them.
4. Move the endpoint calls into `src/i18n`; revert `baseUrl` from `useTable`
   and `useCreateRecord`.
5. Render path: metadata lookups become message lookups.
6. Delete the label machinery listed above.
7. Translate mode: one list, one tab.

Steps 2 and 3 are the whole idea and are verifiable on their own. Stop after
step 3 and review before anything else is touched.
