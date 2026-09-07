# Specification: the translation endpoint

**Status: settled with the owner. Not implemented — what exists today is the
PostgREST-shaped version described at the bottom.**

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
  served as a static file so an operator can replace it without a rebuild.
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
- **`scope` — deleted.** Code and metadata are both messages, told apart by the
  reserved `module.` root. Error text is out of scope for this iteration
  (`i18n-metadata-messages-plan.md`, section 6), so nothing else needs a scope.

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
