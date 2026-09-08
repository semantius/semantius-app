# Specification: the translation endpoint

**Status: settled with the owner. Not implemented — what exists today is the
PostgREST-shaped version described at the bottom.**

Kept current with `i18n-metadata-messages-plan.md`; that document is the design,
this one is the wire contract. Errors are covered here too, because the shape is
the same everywhere and this endpoint answers in it.

One contract, several targets. The client is identical everywhere; only the base
url and the mode differ (`VITE_TRANSLATE_API_URL`, `setTranslateTarget`).

## The two operations

### Read a language

```
GET {base}/translations?locale=de-DE
→ 200 { "<key>": "<translation>", … }
```

The whole JSON for that language. This is what the app loads at startup.

### Write one message

```
POST {base}/translations
     { locale, key, translation }
→ 200
```

**The client sends one message. The server merges it into the single
per-language record.** An empty `translation` clears the message and the source
text shows through again.

There is no conflict for the client to resolve, because the client never holds
or sends the document. That is the whole reason `on_conflict`, `Prefer`, array
bodies, `scope` and `context` are gone: they are PostgREST's vocabulary, and
they reached the client only because the current code POSTs straight at a table.

## The targets

| Mode | Base answers with | Storage | Discovery |
| --- | --- | --- | --- |
| `dev` | the Vite dev server | this checkout's language file | yes |
| `stage` | a stage host | a manually managed copy of that file | yes |
| `prod` | the app's own API | the database record for that language | no |
| `off` | nothing | — | no |

`off` is the default for prod. The mode is explicit configuration — never
derived from `import.meta.env.DEV`, because a local app can point at a stage
target and a deployed one can point anywhere.

**Discovery uses the same write call.** A string the app rendered and could not
translate is written with an empty `translation`. In `prod` nothing is recorded;
the translator finds untranslated text by the on-screen marking instead.

## Where a language is read from

Two sources, merged per key, database over file:

- **one file per language** — the complete language for that product version,
  served as a static file so an operator can replace it without a rebuild:
  `public/locales/` in this repo, `/usr/share/nginx/html/locales/` in the Docker
  image. There is no longer a `src/locales` / `public/locales` split; it only
  ever existed to route by scope.
- **one JSON record per language in the database** — per-message overrides and
  customer-added text. Not in the file we ship, so it survives a product update.

## Who calls it

The **i18n layer**, not the generic table hooks. It already owns the layer list
and the configuration push (`setDeploymentLocales`, `setTenantLocaleFiles`), so
it owns the read and the write too. `useTable` and `useCreateRecord` carry a
`baseUrl` argument added for this; that reverts, and no call site passes
anything.

The target is **pushed in once**, carrying its mode:

```ts
setTranslateTarget({ url, mode })
```

Nothing below reads the environment and nothing pulls — the same rule the rest
of the layer follows, because the first boot pass runs before `initConfig()`,
which throws at that moment.

## Fields

A message is `{ locale, key, translation }`. Nothing else.

- **`context` — deleted.** A free-text prefix that existed only because a code
  string had no other way to be disambiguated. A key is now an array of
  segments, and a disambiguating segment does the same job better
  (`i18n-metadata-messages-plan.md`, "The three call forms"). No column, no
  `contexts` file section, no U+0004.
- **`scope` — deleted, completely.** Code and metadata are both messages, told
  apart by the reserved `module.` root. Error text needs no scope either: a
  structured error's `message` is an English ICU template with placeholders —
  the same shape as any other message — so it is keyed by that template and
  lives in the same flat map. `module.` is the only reserved root.

## Errors

Every error — raised by the app or returned by the backend — reaches the client
in one shape. The full rules are in `i18n-metadata-messages-plan.md`, section 6.

| | | |
| --- | --- | --- |
| `code` | server errors only | the SQLSTATE. Optional; the app never mints one |
| `message` | required | a template for a platform error, a finished sentence for a plain one |
| `hint` | optional | a template saying how to fix it. Platform errors only |
| `values` | optional | the parameters. Platform errors only |
| `details` | optional | plain text. **Never translated, never recorded** |

`hint` and the parameters are separate here on purpose — that is the clean shape
for the client. The JSON envelope below is a **transport detail of the PostgREST
wire format**, not the shape, and exists only because PostgREST has nowhere else
to put values.

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

**The terminus is the message, and it is reached often.** Every gateway auth
rejection sends `code: null` with a message — missing credentials, a malformed
bearer, an expired token — and a client-raised `appError` has a message and no
code by design. So a codeless server error and a client error key the same way,
on their own text.

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

### The wire format for an error carrying the envelope

```
code:    "99017"
message: "${field} must be at least ${min} characters"
hint:    "{\"hint\": \"Try a shorter ${field}\", \"field\": \"module_slug\", \"min\": 3}"
details: "…free text…"
```

- **`hint` is parsed as JSON; if it is not an object, the string is taken as
  `{"hint": text}`.** That folds PostgreSQL's own plain-text hints and the
  platform's existing plain-text ones into one shape with no special case.
- Inside the object, the key `hint` is the hint template and every other key is a
  value. **`hint` is a reserved parameter name.**
- Values are JSON scalars, and a number arrives as a number — ICU's `plural` and
  number formatting select on the numeric type.
- **`message` and `hint` are templates**, marked with `${name}`. A consumer that
  does not know the convention — curl, psql, a log, a support ticket — sees
  `${min}` literally. Accepted deliberately.
- **`hint.code`** carries the catalog number where the SQLSTATE is spoken for by
  the HTTP status mapping. It is optional and may appear on any error; on classes
  90 and 99 it is display detail rather than the message id.
- **`hint` is a reserved parameter name.** The envelope is one flat object whose
  `hint` key holds the hint template and whose every other key is a value, so no
  error may carry a value called `hint`, and a template containing `${hint}` is
  rejected — it would interpolate the hint template into the message.
- **`detail` and `details` are both accepted** by the client, read as
  `detail ?? details`.

### `${…}` → ICU conversion

Applied only where an envelope was parsed. One walk of the string, emitting an ICU argument for
`${name}` and escaped literal for everything else. Two sequential passes do not
work: escape-then-replace hides the placeholder as `$'{'name'}'`, and
replace-then-escape re-escapes the argument just produced.

Both halves are load-bearing, measured against Lingui's compiler: unconverted,
`min length ${ml}` compiles to `["min length $", ["ml"]]`; and an unescaped
literal `{1,2}` does **not** throw — it becomes an argument named `1` and the
text silently disappears. Escaping is single-quote wrapping (`'{1,2}'` renders
`{1,2}`), and it must double apostrophes already present, or `it''s` collapses
to `it's`.

### What the server guarantees

Three obligations on the producer, confirmed with the backend. Everything else
the client derives from what arrives, and expects nothing.

1. **`hint.entity` on class 99.** A JsonLogic rule belongs to an entity, so the
   same code on two entities is two messages and the key is scoped by it. None
   of PostgREST's four fields names the entity, so it travels in the envelope.
2. **No value is ever named `hint`.** The envelope is one flat object whose
   `hint` key holds the hint template and whose every other key is a value, so
   that name is taken. A template containing `${hint}` is rejected.
3. **Values are JSON scalars, and a number arrives as a number.** `{"min": 3}`,
   never `{"min": "3"}` — ICU's `plural` and number formatting select on the
   numeric type, and a string renders `NaN` through a plural.

Explicitly **not** guaranteed: that every `${name}` in a template has a value.
The client fills any it does not receive with the name itself, so the sentence
reads visibly incomplete rather than silently losing a word.

### The client side

`appError()` raises in the same shape with **no code** and plain ICU `{name}` —
`${…}` is a PostgREST transport convention and does not appear in app code.
`Error.message` is likewise the uninterpolated template, values on `cause`. One
renderer handles every origin.

## What exists today

The PostgREST-shaped form:

```
POST {base}/ui_translations?on_conflict=locale,scope,key,context
     Prefer: resolution=merge-duplicates,return=representation
     [ { locale, scope, key, context, translation } ]
```

Verified working against a running dev server — a save rewrote
`src/locales/de-DE.json` as a one-line diff and the read returned 453 rows — but
it makes the dev server and any stage host reimplement PostgREST's semantics,
and `vite-plugins/i18nDevWriter.ts` is 244 lines largely because of it.
`src/i18n/missing.ts` bypasses the target entirely and POSTs at a relative
`/ui_translations`, which the fetch interceptor rewrites onto the deployment's
own API — so today a translation typed in dev lands in the repo while every
discovery lands in a table that answers `PGRST205`.

The database implementation does not exist on any deployment, so the contract
can still be changed for free.
