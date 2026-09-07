# Plan: metadata messages are messages

**Status: proposed, not agreed. Nothing implemented.**

This plan replaces the "model labels" concept in `i18n-plan.md`. That concept was
never requested; see `UNAUTHORIZED-DECISIONS.md` for how it got there.

## The goal, as stated

1. Messages from **code** are extracted and stored in `en-US.json`. *(works today)*
1. Messages from **metadata** get a key — `module.entity.field.type` — and are
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

A **kind segment** names what the key is about, because segment count alone is
ambiguous: a field key and an enum key are both otherwise `module.entity.x.y`,
and nothing says whether the last part is an attribute or a stored value — a
status column can legitimately hold a value called `title`.

```
module   nwind.module.name
entity   nwind.orders.entity.plural_label
field    nwind.orders.field.city.title
enum     nwind.orders.enum.status.open
```

The kind is inserted uniformly, not only where a collision would occur, so every
key says what it is without counting segments. `type` is the model's own column
name (see below); an enum's last segment is the STORED value, never its label,
so a relabeling does not move the key.

**The rule in one sentence: the owning object's path, then the kind, then the
rest.** The owner of a module attribute is the module (one segment); the owner
of everything else is the module and entity (two segments).

| Kind | Owner path | Kind | Rest |
| --- | --- | --- | --- |
| module | `nwind` | `module` | `name` |
| entity | `nwind.orders` | `entity` | `plural_label` |
| field | `nwind.orders` | `field` | `city.title` |
| enum | `nwind.orders` | `enum` | `status.open` |

**Duplicate-free, checked against the cases that could break it.** An entity
named `module` is fine: entity keys always carry their marker at position 3
(`nwind.module.entity.plural_label`), and a three-segment key is always
module-level. A field named `field`, `enum` or `entity` is fine, because the
marker is positional, not matched by name. Field and enum are both five segments
and are separated by that marker. Module slugs, entity names and field names are
SQL identifiers and cannot contain dots, so the only free-form segment is an enum
VALUE — and it is always last, so it is the tail after a fixed prefix rather than
something a parser has to locate. That is strictly better than today, where
`parseLabelKey` guesses.

An enum value is data and may contain a dot, so the join escapes it and the split
unescapes — possible only because the id arrives as segments (see "The call
site").

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

**The `type` vocabulary is the MODEL's own column names — decided.** `title`,
`description`, `singular_label`, `plural_label`, `relationship_label`,
`singular_label_parent`, `plural_label_parent`. No mapping layer, no second
vocabulary. A column rename in the model would move the keys, which is the
accepted cost.

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

## The three call forms, and `context` is deleted

The key is **always an array of segments**. The only question is whether the
English is appended to it. That gives three forms and no other concepts:

```ts
// 1. message only — the message IS the key
t('Save')                                             // key: ['Save']

// 2. id + message — the message is PART of the key, the id disambiguates
t({ id: ['columnVisibility'], message: 'View' })      // key: ['columnVisibility', 'View']

// 3. id + defaultMessage — the id ALONE is the key, the English is only a fallback
t({ id: [mod, entity, 'city', 'label'],               // key: ['nwind','customers','city','label']
    defaultMessage: property.title })
```

Form 1 is every code string today, unchanged. Form 2 replaces `context`. Form 3
is the metadata case.

**Which field is present is the discriminator**, and it is explicit: `message`
means "this text is part of my identity, reword it and I am a new message";
`defaultMessage` means "my identity is the id, this is just what to show when
nothing is translated". Nothing else has to be inferred.

**`context` is removed entirely** — the option, the U+0004 separator, the
`contexts` section in every catalog file, and the `context` column on the
table. It was a free-text prefix that only existed because a code string had no
other way to be disambiguated; form 2 does the same job with a structured
segment, which sorts, groups and reads. There are 8 uses today (one
`column visibility`, seven `translation scope`), so the conversion is small.

Naming: `defaultMessage`. Ugly, but `default` destructures awkwardly
(`const { default: d } = descriptor`) and reads as a keyword at a call site.

## What `context` was, for the record

`context` is a weak id prefix — a way to manufacture a second key when the only
key you have is the English text. `View` the noun and `View` the verb share an
English string, so one of them carries `context: 'column visibility'` and the
runtime id becomes `View` + U+0004 + the context. Today that produces
`messages["View"] = "Anzeigen"` (the row-menu verb) and
`contexts["column visibility"]["View"] = "Ansicht"` (the column-visibility noun).

A metadata message has a real key, so it never needs one: two identical labels
in different entities are already distinct keys. And form 2 above covers the code
-string case better, so `context` has no remaining use.

Two facts about the mechanism, since it looks invented and is not. `context` is
Lingui's and gettext's before it — `msgctxt`, what `pgettext` exists for. The
U+0004 SEPARATOR is ours by choice: Lingui's own `generateMessageId` HASHES
(`sha256(msg + separator + context)`), which would destroy the property the whole
scheme rests on, that the source text is a readable key. Lingui never sees the
difference; it is handed a string id and looks it up.

**Consequence for the wire format:** with `context` gone and the key always an
array of segments, a message is `{ locale, key, translation }` for both kinds.
No `context` column, no `scope` column, no U+0004 anywhere. See
`i18n-endpoint-spec.md`.

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

## Where the model comes from: a committed snapshot — decided

`i18n:extract` reads the repo and nothing else. The model lives in a database, so
something has to put the shipped model where the extractor can read it.

**Each shipped module keeps a JSON dump of its entities, fields and modules in
the repo, and `i18n:extract` reads code plus that snapshot.** Adding a field
changes the snapshot, so it arrives as a diff and a PR like everything else, and
extraction stays offline, deterministic and runnable by anyone with a clone —
including CI.

The cost is that the snapshot has to be regenerated when the model changes, and
can drift from the live model until it is. Regenerating is `model.mjs`'s job (see
the script table below).

Extracting against a live tenant was considered and **rejected**: it would make
`en-US.json` underivable from the repo, require credentials and a network to run,
break for anyone without access, and let someone editing a tenant's model change
a committed file with no code change behind it.

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
| `model.mjs` | **repurposed** — generates the committed model snapshot instead of feeding the inventory. |
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

## Correction or override: the target's MODE decides — decided

A write means different things in different places, and the translate target
carries a **mode** that says which:

| Mode | A write is | Where it lands |
| --- | --- | --- |
| `dev` | a **correction** | this checkout's locale files, reviewed in a PR |
| `stage` | a **correction** | that host's store, and it has to reach the repo |
| `prod` | an **override** | the tenant's own rows, local to that tenant |

This is what settles the write-back problem below: a production edit is not a
failed correction, it is an override and always was. A correction is made in dev
or stage, where it can reach the source.

**A `stage` correction reaches the repo by diff and copy** — no tool, no export
step, no correction-specific write path. Stage writes the same locale files in
the same format, so bringing corrections home is copying the file over
`apps/web/src/locales/<code>.json` and reading the diff in git, which is where
review belongs anyway.

Two things that follows from, and they are the reason it works:

- **Stage is a file target, the same implementation as dev**, running on a stage
  host against a checkout or a mounted volume. Not a database target. If stage
  stored rows, the copy would become an export and the simplicity would be gone.
- **The whole file is the state**, and the writer already produces bytes
  identical to `i18n:extract`, so a copy yields a minimal diff rather than a
  reformatting.

If the repo moved on while stage was being translated, the copy is a merge like
any other file — visible in the diff, resolved in review, never a silent
overwrite.

This also means `export.mjs --messages-into` keeps its empty-only guard
unchanged. That guard was never wrong; it protects a bulk agent import from
overwriting reviewed translations, and corrections simply do not go through it.

**Consequence:** the mode belongs to the target, alongside its base url
(`i18n-endpoint-spec.md`). It is not derived from `import.meta.env.DEV`, because
a local app can point at a stage target and a deployed one can point anywhere.

## The write-back problem this leaves

With modes decided, what is left of the "how would the browser edit an existing
wrong message without creating a mess" problem is narrower but still real.

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

What the mode decision leaves: **a `prod` write is an override, so the UI must
SAY so.** Today it says nothing and looks identical to a correction, which is the
whole reason the two were confused. Corrections happen in dev or stage and reach
the repo as a file diff; nothing has to travel back out of a tenant.

`UNAUTHORIZED-DECISIONS.md` item 8 is the same subject from the layering side.

## Migration

None. `ui_translations` does not exist on any deployment, so there are no rows
to convert. This is the cheapest moment there will ever be.

## Order of work

1. Key builder + the model-to-messages step, with tests, no UI.
2. `i18n:extract` writes metadata messages into `en-US.json`; `i18n:status`
   reports them.
3. Move the endpoint calls into `src/i18n`; revert `baseUrl` from `useTable`
   and `useCreateRecord`.
4. Render path: metadata lookups become message lookups.
5. Delete the label machinery listed above.
6. Translate mode: one list, one tab.

Steps 1 and 2 are the whole idea and are verifiable on their own — a metadata
message appears in `en-US.json` and `i18n:status` counts it. **Stop after step 2
and review before anything else is touched.**
