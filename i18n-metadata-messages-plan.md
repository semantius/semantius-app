# Plan: metadata messages are messages

**Status: implemented on `feat/i18n`, in the order of work below.** The design is settled with the owner.
Everything raised in review is decided; the answers are recorded under "Decided
in review" at the end.

This plan replaces the "model labels" concept in `i18n-plan.md`, and it also
replaces the first version of this document, which invented a committed model
snapshot and an offline extraction step. Both were rejected. See
`UNAUTHORIZED-DECISIONS.md`.

## The goal

Every translatable string — a code message and model text alike — is discovered
by **running the app** and lands in `en-US.json`, the complete baseline a new
language is started from. One key scheme, one writer, one endpoint, one file per
language.

The source scanner (`i18n:extract`) stays as an **optional tool you run, never a
gate**. Its job is pruning the code half, which is the one thing runtime
discovery cannot do (section 2).

Error text is in scope too, in one structured shape shared by the server and
the client (section 6).

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
section in every file, and the column. Form 2 above IS the replacement the owner
asked for: an id combined with the message. There are 8 uses today, 7 of which
die with `scopeLabels.ts` anyway; the eighth becomes `columnVisibility.View`.

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

- Module attributes are 3 segments and carry no kind marker; an entity
  attribute is 5, and a field or enum key is 6, told apart by the marker in
  position 4. No collision is possible, including an entity actually named
  `name`.
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

## 2. Discovery: the running app

**Runtime discovery is how `en-US.json` is maintained. That is requirement 10,
from the start** — not a consequence of anything in this plan. The app renders a
string, fails to translate it, and records it through the writer: into
`en-US.json` as `id -> source`, and into the language being translated as an
empty entry. A code message and a metadata message are recorded the same way.
There is no second mechanism and no committed model snapshot.

An earlier version of this section argued that metadata *cannot* be processed
offline, because an entity's error text comes out of nested JsonLogic with
values interpolated into it. That was never the reason — and it does not even
hold any more, since section 6 solves the interpolated case by sending a
template and its values. The reason is requirement 10.

**Coverage comes from the test suite.** All code is tested, tested code renders,
and rendered strings land in discovery. A code string no test renders is a test
gap, not an i18n gap.

### The source scanner is an optional tool

`i18n:extract` **stays, and it is a tool you run — never a gate.** Not in
`pnpm build`, not in `pnpm check`, not in a hook, not in a workflow. It takes
1.9s over the whole of `src/`.

Its job is **pruning**. A code string that was reworded or deleted leaves a key
that nothing at runtime can observe as gone, because discovery only ever adds;
the scan is what moves it to `obsolete`. If a run also turns up a code string
discovery has never seen, that is a test gap it happened to find — worth
knowing, not a failure.

- **`i18n:extract` must never touch `module.*`.** Runtime owns that half of the
  file and the scanner cannot see it, so the reserved-root rule is what makes an
  optional tool safe to run against a file it does not own — without it, one run
  wipes everything discovery found. `reconcileCatalog` must neither write nor
  retire those keys. Nothing prunes a `module.*` entry either: removing a field
  is invisible to discovery. That is a manual edit, or a later concern.
- **The drift gate goes.** `src/test/i18nCatalogs.test.ts` runs the extractor
  inside `pnpm check` and fails when the committed file disagrees with a fresh
  scan. That one assertion is what made the tool mandatory, and it exists only
  to protect the tool's own output from going stale. Deleted. The rest of that
  file needs no extractor and stays: a translation whose ICU placeholders differ
  from its source, a translation that does not compile, a repo catalog carrying
  tenant-only sections, and a file that breaks its shape.
- `i18n:status` reports **both** kinds offline, because the index holds both
  (section 7).

### What changes, accurately

`scope` is referenced in **38 files** once the unrelated OAuth `scope` is set
aside (45 raw). This is not a small edit.

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

**`src/lib/apiErrors.ts`** carries `scope: 'server'` and reaches six call sites
(`ApiErrorDisplay`, `ErrorPage`, `ApiKeysCard` twice, `_app.$moduleId.index.tsx`,
and `formatDeleteError`). Section 6 says what happens to it: `serverMessage` and
`formatDeleteError` are both subsumed by the single `renderError`, which handles
an app envelope, a structured server error and an unstructured sentence alike.
The verbatim lookup survives inside it as the unstructured path; the `scope`
argument does not survive at all.

**Catalog migration.** `de-DE.json` today is
`{ locale, name, messages: 444, contexts: 2, obsolete: 1 }`. The 444 messages
keep their keys untouched. Of the two `contexts` groups, `translation scope` —
six entries naming the scopes themselves — disappears with `scopeLabels.ts`, and
`column visibility` becomes the form-2 key `columnVisibility.View`.
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

`off` is the default for prod, as the owner asked: a customer maintaining
translations is the exception, not the rule. Requirement 4 is still met — a
customer who does maintain them is configured with `prod`.

In prod, discovery is therefore the **marking** — translate mode highlights
untranslated text on screen and the translator Alt+clicks it. That is how a
customer reaches their own entities' labels, since they have no stage. Under
`off`, the prod default, there is no discovery at all and no writer: the app
reads its two sources and renders.

---

## 4. Storage and the read path

Two sources per language, and that is all:

- **one file** — the complete language for that product version, served as a
  static file so an operator can replace it without a rebuild: `public/locales/`
  in this repo, `/usr/share/nginx/html/locales/` in the Docker image.
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
messages there is nothing left to route on. `public/locales/` is what survives.

**This costs boot nothing, contrary to a worry raised in review.** The
`import.meta.glob` in `src/i18n/store.ts` is deliberately LAZY — each catalog is
its own chunk so a deployment with ten languages does not ship ten catalogs to
every browser — so the active language is already a runtime fetch at boot today.
Only one language is ever active. Serving it as JSON instead of as a JS chunk is
the same single round trip at the same point in boot; what changes is caching,
and a replaceable file must not be immutable-cached (`docker/nginx.conf` already
serves `/locales/` with `try_files $uri =404`).

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

**The read path is not always one call, and this section should not read as if
it were.** In `dev` and `stage` the target's file IS the language, so the `GET`
is the whole read. In `prod` the app reads the shipped
`public/locales/<code>.json` *and* the override record, and merges them per
key.

**The i18n layer owns the calls.** `baseUrl` reverts out of `useTable` and
`useCreateRecord`, and the target is pushed in once —
`setTranslateTarget({ url, mode })` — the way `setDeploymentLocales` and
`setTenantLocaleFiles` already are, rather than read from the environment on
every call.

---

## 6. Errors — one structured shape, and they are IN scope

An earlier version of this section deferred all of it, because
`translateDynamic` keys on the **entire rendered message**, so a sentence
carrying a value mints a new key per value and a translation can never be found
again. The owner's answer removes the cause rather than the feature: the server
sends a **template plus its values**.

### The shape, after parsing

| | | |
| --- | --- | --- |
| `code` | server errors only | the SQLSTATE. Optional; the catalog number is `hint.code` where the SQLSTATE is spoken for. The app never mints one |
| `message` | required | a template for a platform error, a finished sentence for a plain one |
| `hint` | optional | a template saying how to fix it. Platform errors only |
| `values` | optional | the parameters. Platform errors only |
| `details` | optional | plain text. **Never translated, never recorded** |

`hint` and the parameters are separate here on purpose — that is the clean shape
for the client. The JSON envelope below exists only because PostgREST has
nowhere else to put values, and it is a **transport detail of that wire format,
not the shape**.

### What the client branches on

**Presence decides whether an envelope exists. The class decides which code is
the key.** Two separate questions — an earlier version of this section collapsed
them into "the client never looks at the class", which was wrong.

```
envelope = JSON.parse(hint) when that yields an object
           else { hint } when hint is a non-empty string
           else {}

key      = code                       when code is class 90 or 99
           else envelope.code         when present
           else code + '.' + constraintName(message)   when one can be parsed
           else code                  when present
           else the message
```

**The terminus is the message, and it extends the backend contract on purpose.**
That contract ends at the SQLSTATE plus constraint name, because it covers only
what PostgREST returns. The client also meets errors from outside it: every
gateway auth rejection sends `code: null` with a message — missing credentials, a malformed
bearer, an expired token — and a client-raised `appError` has a message and no
code by design. So a codeless server error and a client error key the same way,
on their own text.

The backend contract states the test as "a hint that starts with `{`". Deciding
by the parse instead is deliberate and strictly safer: a malformed `{…` falls
back to suggestion text rather than to undefined behavior.

- **An envelope was parsed** → this error carries our format. Convert `${…}` in
  `message` and `hint` to ICU, interpolate the envelope's values, and look the
  templates up by `key`. **The English templates in the response are the
  fallbacks** when no translation exists — the same relationship form 3 has
  between an id and its `defaultMessage`, which is what makes an untranslated
  error render at all.
- **No envelope** → a plain PostgreSQL or PostgREST error. The message is a
  finished sentence: verbatim, never ICU-compiled, keyed by its SQLSTATE plus
  the constraint name where one can be parsed out.

**Why the SQLSTATE and not the message.** A plain PostgreSQL sentence carries
its own subject — `column orders.nope does not exist` names the column — so
keying on the message would mint an entry per column, which is the interpolation
problem again. The SQLSTATE is stable.

**Why the constraint name is part of the key.** `23505` alone is "duplicate key
value violates unique constraint", which cannot be usefully translated;
`23505` + `modules_module_slug_key` can become "That module slug is already
taken." So the FK regex inside `formatDeleteError` generalizes into a
**constraint-name extractor that feeds the key**, rather than staying a
rendering detail of one function. It reads the name out of `message`, so it
depends on PostgreSQL's English phrasing — a server with `lc_messages` set
otherwise yields no name and the key falls back to the bare SQLSTATE.

**Why `hint.code` exists, and why the class is tested first.** An error whose
HTTP status is derived from its SQLSTATE cannot be renumbered — `42501` gives
401/403, `42P01` gives 404 — so its catalog number lives in `hint.code` instead.
`hint.code` is optional and may appear on any error; the class decides what it
MEANS. On classes 90 and 99 the SQLSTATE already is the catalog number, so a
`hint.code` there is display detail, not a message id. That is why the class is
tested first rather than letting `hint.code` win unconditionally — it is a
disambiguation, not a prohibition on the backend.

That `42P01` stays untouched in `code` also matters beyond routing:
`src/i18n/missing.ts` and `src/i18n/tenant.ts` branch on that exact string to
tell a genuinely missing table from a serverless cold start, which gates both
the retry budget and the tenant layer.

**Class 99 keys are scoped by entity.** A JsonLogic rule belongs to an entity,
so the same code on two entities is two messages. PostgREST exposes four fields
and none of them names the entity, so it has to arrive in the envelope —
`hint.entity` — rather than being supplied by the client from the request it
just made: a client-side guess is wrong for an RPC touching several entities and
for a cascade, while the backend knows exactly which entity's rule fired.
**Confirmed with the backend.**

**HTTP status keeps its REST meaning, and localization never reads it.** Generic
middleware may key on status; the catalog keys on the code. That separation is
what leaves `statusOf`, the retry predicates and `isDefinitiveNotFound` working
untouched. This document deliberately records no status table — the mapping is
the backend's to own, and a copy here would be a second source of truth.

**The backend's own numbering, for reference:** class **90** for platform
errors, class **99** for custom JsonLogic errors — PostgreSQL defines neither,
so both are free — with the status-bearing families keeping their standard
SQLSTATE. There is no Semantius numbering inside class 42.

### Hint normalization — one shape, no special case

Parse `hint` as JSON. **If it is not an object, treat the string as
`{"hint": text}`.** That folds PostgreSQL's own plain-text hints and the
platform's existing plain-text ones into the same shape with nothing branching
on which kind arrived — though only a *parsed object* marks the error as
carrying our format, since a normalized plain hint brings no values with it.
Inside the object the key `hint` is the hint template and
every other key is a value.

**Five keys are reserved** and may not be parameter names: `hint` (the
suggestion template), `code` (the catalog number where the SQLSTATE is 42501 or
42P01), and `entity`, `rule` and `field`, which the generated validation trigger
merges in. They may still be *used* as placeholders where they are present, so
`${entity}` and `${field}` are legitimate.

**A placeholder is `${` + a name matching `^[a-z][a-z0-9_]*$` + `}`.** The
converter matches exactly that grammar — a looser one would rewrite literal text
like `${NOT_A_PARAM}` that the backend never emits as a placeholder.

Values are JSON scalars of their native type: a number as a JSON number, a
boolean as a boolean, an unknown value as `null`, and a date or timestamp as an
ISO 8601 string. ICU's `plural` and number formatting select on the JSON type,
so `"3"` would neither pluralize nor localize.

**A date parameter renders as the raw ISO string, and that is the decision** —
measured, `due 2026-09-08T10:00:00Z`. ICU cannot format it without a `date`
format and a real `Date`, and the wire carries a string. The client does NOT
sniff for ISO-8601-shaped values: a heuristic that decides some strings are
dates would eventually reformat one that is not, and an error message is the
worst place to find that out. If a localized date is wanted later, the template
gets an explicit ICU `date` format and the converter builds a `Date` for that
named argument — an opt-in per placeholder, never a guess.

### `${…}` → ICU, in a single pass

A `message` and `hint` that arrived with an envelope mark placeholders as
`${name}`. Converting them means two things at once: turn `${name}` into an ICU
argument, and escape every plain brace so it stays literal. **The conversion runs
only where an envelope was parsed** — that is what keeps a plain PostgreSQL
message echoing back a user value containing `${…}` from being mangled, and it
needs no knowledge of classes to do it.

**Both steps are necessary, measured against Lingui's own compiler:**

- Unconverted, `min length ${ml}` compiles to `["min length $", ["ml"]]` — ICU
  already claims `{ml}` and leaves a stray `$`.
- Unescaped, `invalid input syntax for type integer: "{1,2}"` **does not throw**.
  It compiles to an argument named `1` with format `2`, and the literal text
  silently disappears at render. Only an *unbalanced* brace throws
  (`bad {1,2` → "Unexpected message end"). A lone `}` is harmless.

**It must be ONE walk of the string, not two regexes.** Escape-then-replace
hides the placeholder as `$'{'name'}'`; replace-then-escape re-escapes the
argument it just produced. The walk emits an ICU argument for `${name}` and
escaped literal for everything else.

**Escaping is single-quote wrapping, and it must double apostrophes already in
the text.** Verified: `'{1,2}'` renders the literal `{1,2}`; `doesn't` needs no
escaping, because an apostrophe not before a brace is literal; but `it''s {1,2}`
compiles to `it's` — an existing doubled apostrophe silently collapses unless
the escaper doubles quotes in the literal segments.

### `details` enters no path at all

Never looked up, never compiled and **never recorded** — a stack trace as a
translation key would mint a queue row per unique trace, which is the
interpolation problem at its worst. It is shown optionally, **as text**.

`ApiErrorDisplay` today dumps the whole `cause` behind its "Details" toggle
through `JSON.stringify(…, null, 2)`, which renders a multi-line trace on one
line with literal `\n`:

```
{ "code": "PGRST100",
  "details": "0: at line 1, in MapRes:\nbogus.1\n^\n\n1: at line 1, in Alt:…",
  "status": 400 }
```

`details` comes out of that dump and is rendered as text — the block is already
a `<pre class="whitespace-pre-wrap">`, so no new markup is needed. The rest of
`cause` (code, status, url) keeps being dumped as JSON.

### On the client side — the same standard, and it is a refactor

A client error carries **no code**: the app's own English is in the source, so
`t('{field} is required for update', { field })` is already a template plus
values keyed by its English, and requirement 1 is untouched. `${…}` is a
PostgREST transport convention and does not appear here — client templates are
plain ICU.

But **an error the app raises today throws a RENDERED sentence**, and that is
what has to change:

```ts
// today — the sentence is frozen at throw time, the values are gone
throw new Error(t('{field} is required for update', { field: idField }))

// the standard — template and values travel, rendering happens at DISPLAY time
throw appError({ message: '{field} is required for update', values: { field: idField } })
```

Four things follow, and none of them is cosmetic.

- **The message stops being frozen in the language that was active when it was
  thrown.** A language switch re-renders it, because the template and its values
  are still there. CONTEXT-MEMORY currently records that freeze as an accepted
  trade ("the same trade every toast already makes") — in the data layer it
  stops being necessary.
- **`AuthContext`'s deliberate `translate()` becomes unnecessary.** It uses the
  module function rather than `useT()` precisely so a `t` need not go into the
  userinfo effect's deps; throwing a template removes the reason.
- **One renderer instead of six.** `ApiErrorDisplay`, `ErrorPage`, `ApiKeysCard`
  (twice), `_app.$moduleId.index.tsx` and `formatDeleteError` each do their own
  thing today. `renderError` subsumes `serverMessage` and `formatDeleteError`
  and handles all three origins — an app envelope, a 9x platform error, a plain
  PostgreSQL one.
- **The two fallback defects are fixed BY the refactor, not incidentally.**
  `useTable` currently builds `` `${errorMessage}: ${response.statusText}` `` —
  a translated sentence concatenated with an English HTTP status, which is the
  "never build a sentence by concatenation" rule broken in the data layer — and
  `callRpc` falls back to `errorMessage = errorText`, putting the **raw response
  body** on screen when the JSON carries neither `message` nor `error`. Both
  disappear when an app fallback is a template with values.

**`error.cause` is the carrier.** It holds `{ ...body, status, url }` today; it
becomes the parsed envelope alongside those transport facts, so `statusOf`,
`codeOf`, `isDefinitiveNotFound` and the retry predicates keep working unchanged.

#### How code throws

A plain function. No hook, a real `Error`, and no translation performed:

```ts
// src/lib/appError.ts
export interface ErrorEnvelope {
  message: string            // ICU template — this IS the translation key
  hint?: string              // ICU template, its own key
  values?: MessageValues
  details?: string           // plain text, never translated
}

export function appError(e: ErrorEnvelope, cause?: Record<string, unknown>): Error
```

```ts
throw appError({ message: 'Authentication token is required' })

throw appError({
  message: '{field} is required for update',
  values: { field: idField },
})

throw appError(
  { message: 'Failed to fetch {table} ({status})',
    values: { table: tableName, status: response.status } },
  { ...body, status: response.status, url: response.url },
)
```

**`error.message` is the TEMPLATE**, uninterpolated — the same rule the 9x wire
format follows, and the same trade: devtools and logs show `{field}` literally,
the values sit on `cause`, rendering happens only at display time.

**No hook is needed anywhere, and that is the property the design rests on.**
These throws happen in `queryFn`s, route loaders, the `AuthContext` userinfo
effect and event handlers — none of which can call `useT()`. `appError` performs
no translation; it packages.

Display side, one renderer for every origin:

```tsx
const t = useT()
const { message, hint, details } = renderError(error, t)
```

**Two tooling changes it needs.** `appError` must join `MESSAGE_CALLEES` in
`scripts/i18n/extract.mjs`, which today is exactly `['t', 'translate', 'msg']` —
the argument *form* already passes (an object literal with a literal `message`
is accepted, and unknown keys are skipped rather than rejected), so only the
callee name is missing; `hint` is a second translatable string in the same
object and needs extracting as its own message, which is new work. And adding
`appError` to the lingui rule's `ignoreFunctions` carries the documented hazard:
it exempts EVERY literal in the call, so a `values: { field: 'literal' }` is
silently exempted too. Convenient for `details`, which is deliberately
untranslated; a place a real mistake can hide.

**Scope.** The roughly twelve translated `throw` sites — `useTable`,
`useTableMutations` (six), `useRpc` (two), the `$table_name` loader,
`api-select`, `AuthContext.responseError` — plus the six display sites. The
roughly twenty **developer invariants** (`useAuth must be used within
AuthProviderWrapper`, `BUG: Form submitted in view mode`, `App config not
initialized`, the sortable and context guards) stay plain English
`throw new Error`: they are not user text, they carry no values, and giving them
the shape would put machinery into the catalog.

### A template may reference a value the envelope does not carry

**The client must not expect the server to supply a value for every `${name}`.**
That is settled, and it makes the rendering policy the client's problem, because
Lingui's default degradation is bad. Measured:

| values | renders |
| --- | --- |
| `{field:'module_slug', min:3}` | `module_slug must be at least 3 characters` |
| `{field:'module_slug'}` | `module_slug must be at least  characters` |
| `{}` | ` must be at least  characters` |
| `{}` on `{count, plural, one {# item} other {# items}}` | **`NaN items`** |

A missing simple argument disappears silently, leaving a mutilated sentence with
a double space; a missing plural argument renders **`NaN`**. Neither is
acceptable on screen and neither is detectable afterwards.

**An explicitly `null` value is worse and must be treated identically.** The
contract sends `null` for an unknown value, and `{count: null}` through a plural
renders **`0 items`** — a confident lie, where `NaN` at least looks broken.
`{field: null}` renders empty, exactly like a missing key. So the fill applies to
a name that is absent OR whose value is `null`; "unknown value" and "no value"
are the same thing on screen.

So the renderer fills the gap before interpolating: `placeholdersOf(template)`
(`src/i18n/placeholders.ts`, already used by translate mode and the catalog test)
gives the argument names, and any name the envelope does not carry is supplied as
its own name, so the sentence reads `module_slug must be at least {min}
characters` — visibly incomplete rather than silently wrong, and never `NaN`.

`placeholderDiff` is a different check and stays as it is: it compares a
translation against its source, not a template against its values.

### One inconsistency to settle with the backend

**`details` vs `detail` — the client accepts both.** PostgREST spells it
`details`; the gateway spells it `detail`. Rather than making the two layers
agree, the client reads `detail ?? details`. It is one field, read under either
name, and no producer has to change.

### What does NOT change

**`formatDeleteError`'s regex stays, and grows into a general constraint-name
extractor.** An earlier version of this section said it could be deleted because
a structured error carries the table names in `values`. It cannot: a foreign-key
violation comes from PostgreSQL itself with no envelope, so there are no values
to read — and the constraint name it recovers is now part of the **key** for
every envelope-less constraint error, not just a rendering detail of one
function. The regex over
`on table "(\w+)" violates foreign key constraint "[^"]+" on table "(\w+)"`
remains the only way to recover the two names, and it remains English-only.

**Per-field form errors are a different channel** — JSON Schema / Ajv, already
translated by `ajv-i18n` in `components/form/validationMessages.ts`, plus
sem-schema's `inputMode` and `precision` keywords. Nothing to key, nothing to
change.

---

## 7. The index

**`en-US.json` is the complete baseline.** It holds both kinds, and it is the
file a new language is started from. A metadata message renders its English from
the model, so it needs no English entry to *display* — but without one, adding a
field to an entity produces a string that appears in no file, no diff and no PR,
which is the defect this plan exists to fix. So discovery writes two things:
the `id -> source` entry into the index, and the empty entry into the language
being translated.

`i18n:status` then sees both kinds. Both halves of the file are filled the same
way — by discovery — so there is no asymmetry in how they are maintained. The
one asymmetry that remains is pruning: the optional scan prunes the code half,
and nothing prunes `module.*` (section 2).

**`origin` is dropped.** Each entry stores the files a string is used in.
Measured on the current file that is **39.7%** of it — 26,284 of 66,138
characters across 452 entries — and for a metadata key it would repeat the key,
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

## Order of work

0. **Remove the drift gate.** Delete the "index / catalog is out of date"
   assertion from `src/test/i18nCatalogs.test.ts`, keeping the rest of that
   file. Independent of everything below, and can land first.
1. **Keys.** The key builder, the three call forms, `module` reserved as a first
   segment, segment escaping. Unit tests, no UI. Verifiable alone.
2. **Render path.** Metadata lookups become message lookups through the new
   keys, with the slug from `metadata.table.module_slug`. `SemSchemaTable` gains
   the field. The grid, forms, breadcrumb, command palette and sidebar all
   inherit it.

   **Stop here and review.** Steps 1 and 2 are the whole idea and stand on their
   own: a metadata string has a stable key and renders through it.

3. **File format and catalog migration.** Flat file in `public/locales/`,
   `contexts` folded into form-2 keys, `origin` dropped from the index,
   `scopeLabels.ts` and its six entries gone.
4. **Endpoint and modes.** One contract in `src/i18n`, `baseUrl` reverted out of
   `useTable` and `useCreateRecord`, the target and its mode pushed in once, and
   the collector writing through the target instead of at `/ui_translations`.
   `i18n-endpoint-spec.md` is that contract's own document and moves with every
   step that changes it — it is kept current, never left behind as a snapshot.
5. **Delete the label machinery** listed in section 2.
6. **Translate mode:** one list, one tab.
7. **The suite writes the language file.** Remove the `process.env.VITEST`
   scratch redirect in `vite-plugins/i18nDevWriter.ts` — it was never a Vitest
   constraint. The test run renders the app, so it is what fills `en-US.json`;
   the file is a committed artifact of that run.
8. **Consume structured errors** (section 6). Independent of the backend's
   timeline: hint normalization to `{ "hint": text }`, the four-step key
   resolution, the constraint-name extractor that feeds it, the single-pass
   `${…}` → ICU conversion with brace escaping applied only where an envelope
   was parsed, and `details` rendered as text and excluded from the collector.
   Until a backend sends an envelope, every error takes the plain path and
   behaves exactly as it does today.
9. **Refactor the app's own errors onto the same standard** (section 6, "On the
   client side"). `src/lib/appError.ts` and the `ErrorEnvelope` type; the twelve
   translated `throw` sites carry template plus values instead of a rendered
   sentence; `renderError` subsumes `serverMessage` and
   `formatDeleteError` across the six display paths, keeping the FK regex inside
   it (a `23503` is outside class 9x and carries no values); the `useTable` concatenation and the `callRpc`
   raw-body fallback go with it; `AuthContext` drops its `translate()`
   workaround. Tooling: `appError` joins `MESSAGE_CALLEES` in
   `scripts/i18n/extract.mjs`, the extractor learns to pull `hint` as a message
   of its own, and `appError` goes into the lingui rule's `ignoreFunctions` with
   the exempts-the-whole-call hazard understood. Separable from step 8 and
   verifiable alone — the two meet only at `renderError`.

---

## Decided in review

Everything raised in review is settled. The answers:

| | Question | Answer |
| --- | --- | --- |
| 1 | Server and rule text — keep or delete? | **Neither: restructured.** The server sends a template plus values and the template is the key, so interpolation stops minting a key per value. Errors are in scope (section 6) |
| 2 | `context` and call form 2 | `context` deleted; form 2 (id combined with message) is the replacement, as originally asked for |
| 3 | Where the one file lives, and boot | `public/locales/`. No boot cost — the repo glob is already lazy and only one language is ever active, so the active catalog is already a fetch |
| 4 | `off` as the prod default | `off`. A customer maintaining translations is the exception, not the rule |
| 5 | `origin` | Dropped |
| 6 | Does the test run write `en-US.json`? | Yes. The `process.env.VITEST` scratch redirect goes — it was never a Vitest constraint |
| 7 | Is `message` on the wire rendered or a template? | **The template**, for class 9x. A consumer that does not know the convention sees `${min}` literally; weighed and accepted |
| 8 | And `error.message` on a client-thrown error? | **The template too**, in plain ICU. Values on `cause`, rendering at display time |
| 9 | Does the client mint error codes? | **No.** `code` is the SQLSTATE and exists only on errors returned from PostgREST |
| 10 | Is `42xxx` a Semantius namespace? | **No, and the collision I flagged was a misreading.** Platform errors are class **90**, JsonLogic errors class **99** — both free in PostgreSQL. `42501` is kept deliberately because it *is* `insufficient_privilege` |
| 11 | Which messages get `${…}` conversion? | The ones that **arrived with a parsed envelope**. Presence decides that |
| 12 | Where does the translation key come from? | `code` for class 90/99, else `hint.code`, else the SQLSTATE plus the constraint name where one parses, else the bare SQLSTATE. The **class** decides which code is the key — an earlier "the client never looks at the class" was too strong; presence and class answer different questions |
| 13 | How is a class-99 key scoped? | **By entity**, from `hint.entity` — the backend knows which entity's rule fired; a client-side guess is wrong for an RPC touching several entities and for a cascade. Confirmed with the backend |
| 14 | `detail` or `details`? | **Both.** The client reads `detail ?? details`; no producer changes |
| 15 | What is the key when there is no code? | **The message.** Gateway auth rejections send `code: null` with a message, and a client `appError` has no code at all — so a codeless server error and a client error key alike |
| 16 | Must the server supply a value for every `${name}`? | **No.** The client fills any missing name with the name itself — Lingui's default renders a missing argument as empty and a missing plural as `NaN` |
| 17 | And an explicitly `null` value? | **Same treatment.** `{count: null}` through a plural renders `0 items`, a confident lie; absent and null are one case |
| 18 | How are date parameters rendered? | **As the raw ISO string.** No sniffing — a heuristic deciding which strings are dates would eventually reformat one that is not. A localized date would be an explicit ICU `date` format per placeholder, later |

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
| 10 | Runtime collection of what the app cannot know in advance | The collector, kept and mode-driven — and now the mechanism for the whole index, not a supplement to a scan. Error text included: a structured error is keyed by its template (section 6) |
| 11 | Language and formatting locale are two session preferences | Untouched |
