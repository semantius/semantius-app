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

- `en-US.json` holds both kinds. Same file, same shape, same `origin` field
  (a code string's origin is a source file; a metadata message's origin is the
  model).
- `de-DE.json` and every other catalog holds both. Same empty-value convention.
- `i18n:status` reports both. The catalog test checks both.
- A removed field's message moves to `obsolete`, exactly as a reworded code
  string does. The "orphaned" concept disappears.
- The `scope` column collapses. `message` covers code and metadata; only
  `server` and `rule` (backend text discovered at runtime) remain distinct.
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

## Migration

None. `ui_translations` does not exist on any deployment, so there are no rows
to convert. This is the cheapest moment there will ever be.

## Order of work

1. Agree the key spelling and option A or B above.
2. Key builder + the model-to-messages step, with tests, no UI.
3. `i18n:extract` writes metadata messages into `en-US.json`; `i18n:status`
   reports them.
4. Render path: metadata lookups become message lookups.
5. Delete the label machinery listed above.
6. Translate mode: one list, one tab.

Steps 2 and 3 are the whole idea and are verifiable on their own. Stop after
step 3 and review before anything else is touched.
