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

## The call site

The id is passed as **segments, not a joined string**:

```ts
t({ id: [mod, entity, 'city', 'label'], message: property.title })
```

Four reasons it is an array. The joining rule lives inside `t`, so no call site
can spell a separator wrong. Arity and order are a tuple type, which a joined
string can never be. `metaKey` never has to exist. And most concretely: the
current flat-string key forces `parseLabelKey` to GUESS where the parts end — it
hardcodes "everything after the second dot is the enum value", because table and
field names are SQL identifiers and cannot contain dots while **enum values are
data and can**. Segments remove the guess.

What the array does not remove: the STORED key is still a flat string, in the
catalog file and in the database, so the join must escape a segment containing a
dot and the split must unescape. That is solvable only because the joiner knows
the boundaries; today's parser has the flat result and an assumption.

**`mod` and `entity` are bound once, not typed at each call.** The route knows
the module, the metadata knows the entity. Nothing in a component should ever
write `'nwind'`.

**The `type` vocabulary is a decision.** "label" and "hint" read better than the
model's own `title` and `description`, and survive a column rename — but then one
place has to map them. Using the model's names needs no mapping and no rename
protection. Pick one; do not let both exist.

**`message` is the fallback, and for metadata it can be absent.** Our
`MessageDescriptor.message` is a required `string`, correct for a code string
where the source is written in the call. `JsonSchemaProperty.title` and
`.description` are `string | undefined`, because a field with no label is normal.
Three ways out — make `message` optional (weakens the type where it should stay
strict), a second descriptor shape for keyed messages, or require the caller to
supply a guaranteed fallback (`property.title ?? fieldName`). The last is
recommended: what to show when the model says nothing is a rendering decision and
it differs per surface — a column header falls back to the field name, a hint
falls back to nothing.

## `context` disappears for metadata

`context` is a weak id prefix — a way to manufacture a second key when the only
key you have is the English text. `View` the noun and `View` the verb share an
English string, so one of them carries `context: 'column visibility'` and the
runtime id becomes `View` + U+0004 + the context. Today that produces
`messages["View"] = "Anzeigen"` (the row-menu verb) and
`contexts["column visibility"]["View"] = "Ansicht"` (the column-visibility noun).

A metadata message has a real key, so it never needs one: two identical labels
in different entities are already distinct keys.

Two facts about the mechanism, since it looks invented and is not. `context` is
Lingui's and gettext's before it — `msgctxt`, what `pgettext` exists for. The
U+0004 SEPARATOR is ours by choice: Lingui's own `generateMessageId` HASHES
(`sha256(msg + separator + context)`), which would destroy the property the whole
scheme rests on, that the source text is a readable key. Lingui never sees the
difference; it is handed a string id and looks it up.

**Consequence for the wire format:** `context` exists only for code strings. If it
folds into the code-string key rather than staying a separate column, then a
message is `{ locale, key, translation }` for both kinds and U+0004 becomes an
internal detail of how a code-string key is spelled — invisible to the endpoint
and to the database. See `i18n-endpoint-spec.md`.

## When the English changes

This is the half of the key that has to be got right.

A code string's English **is** its key, so changing it makes a new key, the
translation moves to `obsolete`, and the string renders in English until someone
retranslates. Loud and visible in a diff.

A metadata message's key is independent of its English. Rename the model label
from "City" to "Town" and `nwind.customers.city.label` does not move, so the
German `Stadt` is still found and still renders. That is the point of the key —
and the hazard: change it to "Delivery city" and `Stadt` is now wrong, silently
and indefinitely. A code string cannot fail this way.

So extraction compares the model's current English against the source recorded
for that key in `en-US.json`, which is already stored per entry:

- unchanged → nothing
- changed → **keep the translation**, mark it needs-review, report it in
  `i18n:status`

Keeping it is the right default; losing good German because someone fixed a typo
in English would be worse. But it must be reported, or the key hides the drift.

This is the honest version of the "changed since translated" filter that exists
today, which compares `updated_at` timestamps and therefore fires on every
unrelated model edit.

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

## What happens to `scripts/i18n`

| File | Fate |
| --- | --- |
| `extract.mjs` | **grows** — gains the model as a second source and writes metadata messages into `en-US.json`. This is where the work lands. |
| `status.mjs` | **shrinks** — reports both kinds from one index; the `--tenant` label branch goes. |
| `localeFile.mjs` | **shrinks** — `messages` / `contexts` / `server` stay; `parseLabelKey`, the four label scopes and the nested `labels` section go. |
| `tenant.mjs` | unchanged — auth and paging, still needed by import, export, translate. |
| `translate.mjs` | simplifies — its input becomes the index alone, not the index plus an inventory. |
| `import.mjs`, `export.mjs` | simplify — no label scopes to route. |
| `model.mjs` | **repurposed under option A** — generates the committed snapshot instead of feeding the inventory. Under option B it folds into `extract.mjs`. |
| `labelInventory.mjs` | **deleted** |
| `labels.mjs` | **deleted** |

Each `.d.mts` follows its `.mjs`. Afterwards `extract` and `status` are the whole
story for discovering untranslated text, both kinds, offline from the repo; the
tenant-facing scripts exist only to move a language between a file and a
customer's database, which is the only job that legitimately needs credentials.

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

## Not addressed here: a correction can never reach the repo

This is the "how would the browser edit an existing wrong message without
creating a mess" problem, and it is unsolved.

The layers are `repo ← deployment file ← tenant rows`, later wins. So a
translator who fixes a wrong German string in production writes a tenant row that
SHADOWS the repo value. That tenant now renders the fix. Every other tenant keeps
the wrong string, and the repo keeps it too.

The only path back is `scripts/i18n/export.mjs --messages-into`, and **it fills
only entries that are EMPTY**:

```js
// export.mjs — the guard that strands the fix
if (message in section && !section[message]) { … }
```

A wrong-but-present value is therefore never corrected. The fix stays in one
tenant forever, and nothing reports the divergence.

The dev target makes this bearable but does not solve it: an edit made under
`pnpm dev` rewrites the repo catalog directly, so a correction made there IS the
source and goes through a PR. That only helps whoever has the checkout.

What is still needed, and is not in this plan:

- a decision on whether a tenant edit of a SHIPPED string is a correction or an
  override — they look identical today and are stored identically;
- if it can be a correction, a way for it to travel back and overwrite a
  non-empty repo value, with review;
- if it is always an override, the UI should say so, and the repo string should
  be fixed in dev instead.

`UNAUTHORIZED-DECISIONS.md` item 8 is the same subject from the layering side.

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
