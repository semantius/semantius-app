# Plan: metadata messages are messages

**Status: the design below is settled with the owner. Nothing implemented yet.**

This plan replaces the "model labels" concept in `i18n-plan.md`, and it also
replaces the first version of this document, which invented a committed model
snapshot and an offline extraction step. Both were rejected. See
`UNAUTHORIZED-DECISIONS.md`.

## The goal

Messages from **code** are extracted from source. Model text — entity, field,
enum and module labels — is discovered by **running the app**. Both land in
`en-US.json`, which is the complete baseline a new language is started from.
One key scheme, one writer, one endpoint, one file per language.

Error text is the one thing left out, and deliberately (section 6).

---

## 1. Keys

A metadata message is a message. It has a key instead of using its English as
the key, and that is the only difference from a code string.

### The three call forms

```ts
// 1. message only — the message IS the key
t('Save')                                          // key: Save

// 2. id + message — the message is PART of the key, the id disambiguates
t({ id: ['columnVisibility'], message: 'View' })    // key: columnVisibility.View

// 3. id + defaultMessage — the id ALONE is the key, the English is a fallback
t({ id: [...], defaultMessage: property.title })    // key: the id
```

Which field is present is the discriminator. `message` means "this text is part
of my identity — reword it and I am a new message". `defaultMessage` means "my
identity is the id; this is what to show when nothing is translated".

**`defaultMessage` is a required `string`, and the caller supplies the
fallback.** `JsonSchemaProperty.title` and `.description` are `string |
undefined` — a field with no label is normal — so the call site passes
`property.title ?? fieldName`. What to show when the model says nothing is a
rendering decision and it differs per surface: a column header falls back to the
field name, a hint falls back to nothing. Making the field optional would weaken
the type everywhere to serve one case.

**`context` is deleted** — the option, the U+0004 separator, the `contexts`
section in every file, and the column. Form 2 does the same job with a
structured segment that sorts, groups and reads. There are 8 uses today.

### `module` is a reserved first segment

A code key may never start with `module`, enforced by an assert in `t()`. That
one rule is what separates the two producers everywhere — in the stored flat
key, in a file, in a `key like 'module.%'` query, and in a grep. It is **not**
"prefixed vs unprefixed": a code key can be prefixed too (form 2).

```
Save                                            code
columnVisibility.View                           code
module.nwind.name                               module attribute
module.nwind.description
module.nwind.orders.entity.plural_label         entity attribute
module.nwind.orders.field.city.title            field attribute
module.nwind.orders.enum.status.open            enum value
```

- Module attributes are 3 segments and carry no kind marker; everything
  entity-owned is 5 segments. No collision is possible, including an entity
  actually named `name`.
- `field` and `enum` markers are required: without them
  `module.nwind.orders.status.title` is ambiguous between the `status` field's
  `title` and the `status` enum's value `title`.
- The attribute vocabulary is the **model's own column names** — `title`,
  `description`, `singular_label`, `plural_label`, `relationship_label`,
  `singular_label_parent`, `plural_label_parent`, and `name` / `description`
  for a module.
- An enum's last segment is the **stored value**, never its label, so
  relabeling does not move the key. It is data and may contain a dot, so the
  joiner escapes it and the splitter unescapes — possible only because the id
  arrives as segments.

### The id is passed as segments

```ts
t({ id: [modSlug, entity, 'city', 'title'], defaultMessage: property.title })
```

The joining and escaping rule lives inside `t`, so no call site can spell a
separator wrong, and arity and order are a tuple type. No `metaKey()` helper.

### The module slug comes from the model, never the route

`get_schema` now returns **`module_slug`** on the `table` block, beside
`module_id`. Verified on the tests tenant across both modules.

The route param is wrong for this and would be wrong in practice, not only in
theory: `/$moduleId/$table_name` is a catch-all, and `View`'s parent-filter path
fetches a **different entity's** schema — an `nwind/orders` view filtered on
`users` must key `module.admin.users.entity.plural_label`. `SemSchemaTable`
gains `module_slug: string`, non-optional.

---

## 2. Discovery: the running app, never offline

**Metadata is never processed offline.** No committed snapshot, no script that
reads the model, no inventory. It cannot work: what a model *can* put on screen
is not enumerable from what it *declares* — an entity's error text comes out of
nested JsonLogic that raises several messages with values interpolated into
them (section 6).

The app renders a label, an enum value or a module name, fails to translate it,
and records it through the writer — into `en-US.json` as `id -> source`, and
into the language being translated as an empty entry. That is requirement 10.

Consequences:

- `i18n:extract` stays a pure source parser and never learns about the model.
- **`i18n:extract` must not touch `module.*`.** It never produces those keys, so
  `reconcileCatalog` must neither write nor retire them — the same reserved-root
  rule. Nothing prunes a metadata entry automatically: discovery only ever adds,
  and removing a field is invisible to it. Pruning a key for an entity that no
  longer exists is a manual edit, or a later concern.
- `i18n:status` reports **both** kinds offline, because the index holds both
  (section 7).

### What changes, accurately

`scope` is referenced in **31 files**. This is not a small edit.

**Deleted outright**

| | |
| --- | --- |
| `scripts/i18n/labelInventory.mjs` + `.d.mts` | the offline inventory |
| `scripts/i18n/labels.mjs` + `.d.mts` | its CLI |
| `scripts/i18n/model.mjs` + `.d.mts` | the model reader they used |
| `src/i18n/labelInventory.ts` + `labelInventory.test.ts` | the app's re-export |
| `src/i18n/translateMode/LabelsTab.tsx` | one list, one tab |
| `src/i18n/translateMode/scopeLabels.ts` | it exists only to name scopes |

**Loses its scope handling** — `src/i18n/catalog.ts` (the four label scopes and
their key builders), `entries.ts`, `index.ts`, `missing.ts`, `tenant.ts`,
`translationRow.ts`, `labels.ts` (`localizeMetadata` collapses to a message
lookup keyed by the model path), `translateMode/{EditorDialog,EntryList,Panel,
useTranslationWriter}`, `scripts/i18n/{localeFile,export,import,status,translate,
tenant}.mjs` and their `.d.mts`, `vite-plugins/i18nDevWriter.ts`, and the tests
of each.

**Catalog migration.** `de-DE.json` today is
`{ locale, name, messages: 444, contexts: 2, obsolete: 1 }`. The 444 messages
keep their keys untouched. Of the two `contexts` groups, `column visibility`
becomes the form-2 key `columnVisibility.View`, and `translation scope` — six
entries naming the scopes themselves — disappears with `scopeLabels.ts`.
`obsolete` survives unchanged. There is nothing to migrate in a database: the
translations table exists on no deployment.

---

## 3. Modes

The translate target carries a **mode**. It is explicit configuration and is
never derived from `import.meta.env.DEV` — a local app can point at a stage
target and a deployed one can point anywhere.

| Mode | A write goes to | Discovers (records an empty entry) |
| --- | --- | --- |
| `dev` | this checkout's language file | yes |
| `stage` | a manually managed copy of that file, where translators work | yes |
| `prod` | the database record — customizations, or where stage is not possible | **no** — modifies or creates only |
| `off` | nothing | no |

`off` is the default for prod.

In prod, discovery is therefore the **marking** — translate mode highlights
untranslated text on screen and the translator Alt+clicks it. That is how a
customer reaches their own entities' labels, since they have no stage. Under
`off`, the prod default, there is no discovery at all and no writer: the app
reads its two sources and renders.

---

## 4. Storage and the read path

Two sources per language, and that is all:

- **one file** — the complete language for that product version, served as a
  static file so an operator can replace it without a rebuild.
- **one JSON record in the database** — per-message overrides and
  customer-added text.

The record is merged over the file, **per key**. An override survives a product
update, because it is not in the file we ship.

**The file is flat.** With `scope` and `context` gone there are no sections left
to route into:

```json
{ "locale": "de-DE",
  "name": "Deutsch",
  "messages": { "Save": "Speichern",
                "columnVisibility.View": "Ansicht",
                "module.nwind.orders.field.city.title": "Stadt" },
  "obsolete": { "…": "…" } }
```

`name` is the language's endonym and is what the account menu shows. `obsolete`
holds translations whose code string was reworded, so they are not lost silently;
it never holds a `module.*` key, because nothing retires those (section 2).

**The `src/locales` / `public/locales` split dies.** It exists today only
because the dev writer routes by *scope* — `message` to `src/locales`,
`labels` / `server` / `rule` to `public/locales` — which is the
labels-are-not-messages rule again. It splits one translator's German for one
screen across two files by what kind of string it is. Once metadata are
messages there is nothing left to route on.

---

## 5. The endpoint

The client sends **one message**. The server owns the merge into the single
per-language record.

```
GET  {base}/translations?locale=de-DE          -> the whole JSON for that language
POST {base}/translations                       -> merge one message into the record
     { locale, key, translation }
```

No `on_conflict`, no `Prefer`, no array bodies, no `scope`, no `context`. Those
are PostgREST's, and they leak into the client today only because
`missing.ts` POSTs straight at `/ui_translations?on_conflict=…` — the client is
talking to a table instead of to an endpoint. An empty `translation` clears the
message and the source text shows through again.

Same two calls for the file target and the database target; only the base
differs (`VITE_TRANSLATE_API_URL`).

**The i18n layer owns the calls.** `baseUrl` reverts out of `useTable` and
`useCreateRecord`, and the target is pushed in once —
`setTranslateTarget({ url, mode })` — the way `setDeploymentLocales` and
`setTenantLocaleFiles` already are, rather than read from the environment on
every call.

---

## 6. Errors — out of scope for this iteration

There is **one** category of text the app receives and did not author: the
`message` of an error response from the backend. A validation-rule violation is
not a separate kind — it arrives as exactly that. Verified on the tests tenant:

```
POST /modules  {"module_slug":"_vitest_BAD SLUG", …}
→ 400 {"code":"23514",
       "message":"module_slug must be lowercase, start with a letter or digit, …",
       "details":"rule code: valid_module_slug"}
```

`entities.validation_rules` holds JsonLogic entries
(`{ code, message, jsonlogic, source_module }`, 7 of them across 5 `_core`
entities), but the declared `message` is **not** the set of messages a rule can
produce: nested logic raises several, and values are interpolated into them.

That interpolation is why this is deferred. `translateDynamic` keys on the
**entire message string**, so a sentence carrying a value produces a new key per
value and a translation can never be found again. Solving it needs the server to
send a template plus its values rather than a finished sentence — a backend
change, not a client one. `details` already shows there is somewhere to put
them.

**So errors are skipped in this iteration** and addressed in the next. Nothing
here needs a key root, and `scope` collapses completely.

Not affected: **per-field form errors are a different channel** — JSON Schema /
Ajv, already translated by `ajv-i18n` in
`components/form/validationMessages.ts`, plus sem-schema's `inputMode` and
`precision` keywords. Nothing to key, nothing to defer.

---

## 7. The index

**`en-US.json` is the complete baseline.** It holds both kinds, and it is the
file a new language is started from. A metadata message renders its English from
the model, so it needs no English entry to *display* — but without one, adding a
field to an entity produces a string that appears in no file, no diff and no PR,
which is the defect this plan exists to fix. So dev discovery writes two things:
the `id -> source` entry into the index, and the empty entry into the language
being translated.

`i18n:status` and the catalog test then see both kinds.

**Recommended: drop `origin`.** Each entry stores the files a string is used in.
Measured on the current file that is **31.4%** of it — 21,823 of 69,406
characters across 453 entries — and for a metadata key it would repeat the key,
since the key already names the model path. Its one justification was a
heuristic: more than one origin file means the same English is used twice and may
need disambiguating. That is unsound both ways — two meanings fit in one file,
and 45 entries are multi-origin today mostly because one meaning is used widely.
The `View` split that motivated it sits in a single file. `grep -r` answers the
same question. Removing it leaves an id-to-source map and nothing else.

**Keep `source`, and it is load-bearing for metadata.** For a code string the
source equals the key, so it looks redundant; for a metadata key it is the
model's current English, which is what makes the file a baseline — and it is the
only way to notice that someone reworded a label from "City" to "Delivery city"
while its German still says "Stadt". A code string cannot fail that way, because
rewording it makes a new key.

**Nothing retires a metadata entry automatically.** Discovery only adds, and a
deleted field is invisible to it (section 2). A key for an entity that no longer
exists is removed by hand, or left until a later iteration gives it an owner.
`obsolete` therefore holds code strings only.

---

## Deferred

**Interpolated error messages** (section 6). Errors are skipped in this
iteration; the next one addresses them, and it starts on the backend — the
server has to send a template and its values instead of a finished sentence.

---

## Order of work

1. **Keys.** The key builder, the three call forms, `module` reserved as a first
   segment, segment escaping. Unit tests, no UI. Verifiable alone.
2. **Render path.** Metadata lookups become message lookups through the new
   keys, with the slug from `metadata.table.module_slug`. `SemSchemaTable` gains
   the field. The grid, forms, breadcrumb, command palette and sidebar all
   inherit it.

   **Stop here and review.** Steps 1 and 2 are the whole idea and stand on their
   own: a metadata string has a stable key and renders through it.

3. **File format and catalog migration.** Flat file, `contexts` folded into
   form-2 keys, `scopeLabels.ts` and its six entries gone.
4. **Endpoint and modes.** One contract in `src/i18n`, `baseUrl` reverted out of
   `useTable` and `useCreateRecord`, the target and its mode pushed in once, and
   the collector writing through the target instead of at `/ui_translations`.
5. **Delete the label machinery** listed in section 2.
6. **Translate mode:** one list, one tab.

---

## Against the owner's requirements

The eleven at the top of `i18n-plan.md`.

| | Requirement | How this plan meets it |
| --- | --- | --- |
| 1 | No message ids; English is the key | Holds for code: forms 1 and 2 both put the English in the key. Metadata needs a key because its English lives in the model, not in the code — which is the goal this plan exists for |
| 2 | Default messages stay in code, in one place | Holds for code. A metadata default lives in the model, the one place it can |
| 3 | Self-contained, no paid service, no server to run; agents maintain it | Nothing new to run. The running app produces the work list; agents fill it |
| 4 | Operators and customers add languages without a rebuild | The served file plus the database record, one loader, merged per key |
| 5 | Fallback to `en-US`, marking, translate mode in context | `defaultMessage` and the index are the fallback; marking and translate mode are kept, and marking becomes the discovery path in prod |
| 6 | Locale files may override model labels | A `module.*` key is a message like any other, overridable from either source |
| 7 | `en-US` and `de-DE` | Unchanged |
| 8 | drizzle-cube ignored | Untouched |
| 9 | No Babel or Vite transform, no PO files | Unchanged — Lingui's runtime only |
| 10 | Runtime collection of what the app cannot know in advance | The collector, kept and mode-driven. Error text deferred (section 6) |
| 11 | Language and formatting locale are two session preferences | Untouched |
