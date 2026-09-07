# Specification: the translation endpoint

**Status: proposed for review. Implemented in part; see "What exists today".**

One endpoint contract, three implementations behind it. The client is identical
everywhere; only the base url differs (`VITE_TRANSLATE_API_URL`).

| Target | Base | Storage |
| --- | --- | --- |
| dev | the Vite dev server | this repo's JSON files |
| stage | any host | that host's storage |
| prod | unset → the app's own API | the tenant's `ui_translations` table |

## The four operations

### 1. Read all messages for a language

```
GET {base}/ui_translations?locale=eq.de-DE
→ 200 [ { locale, key, translation, … }, … ]
```

Everything the target holds for that language. This is what the app loads at
startup to render a translated UI.

### 2. Read one message  *(optional)*

```
GET {base}/ui_translations?locale=eq.de-DE&key=eq.nwind.orders.ship_city.title
→ 200 [ { … } ]     // an array; empty when absent
```

Not needed by the app, which loads all of (1) and keeps it in memory. Useful for
scripts and for checking a single value without pulling a language.

### 3. Write one message

```
POST {base}/ui_translations
     { locale, key, translation }
→ 200 { locale, key, translation }
```

Idempotent on `(locale, key)`: writing an existing key replaces its value. An
empty `translation` clears it, and the source text shows through again.

### 4. The write updates the JSON

On the dev target the write lands in the repo's own catalog file, in the same
byte-for-byte format `i18n:extract` produces, so a save is a one-line diff and a
following `i18n:extract` is a no-op. On the tenant it is a row. Same call either
way.

## The design question to settle

**What exists today mimics PostgREST**, because the tenant implementation *is*
PostgREST and making the client byte-identical seemed to follow:

```
POST {base}/ui_translations?on_conflict=locale,scope,key,context
     Prefer: resolution=merge-duplicates,return=representation
     [ { locale, scope, key, context, translation } ]
```

That drags PostgREST's vocabulary — `on_conflict`, `Prefer`, `translation=eq.`,
array bodies, `scope`, `context` — into a contract that a dev server and a stage
host now have to reimplement. The dev writer already does, and it is the ugliest
part of it.

**The alternative** is the four operations above as a plain, purpose-built API,
with the tenant implementation being a thin PostgREST-backed adapter rather than
the contract itself. The client gets `{ locale, key, translation }` and nothing
else; each target maps that to its own storage.

The second is smaller and does not leak one implementation's protocol into the
other two. The cost is one adapter on the tenant side instead of none.

## Who calls it

The **i18n layer**, not the generic table hooks. It already owns the target
(`translateApiUrl()`) and the layer list, so it owns the read and the write too.
Today `useTable` and `useCreateRecord` carry a `baseUrl` argument added for this;
that reverts.

## Fields

Under `i18n-metadata-messages-plan.md` a message is `{ locale, key, translation }`
and nothing more, because metadata messages become messages and `scope` collapses.
Two current columns then need a decision:

- **`context`** — disambiguates two identical English strings with different
  meanings ("View" the noun, "View" the verb). Only code strings need it.
  Either keep it as a column, or fold it into the key.
- **`scope`** — collapses. Only backend-raised text (`server`) is not a message
  with a key, and whether that survives at all is open (see
  `UNAUTHORIZED-DECISIONS.md` item 4).

## What exists today

Operations 1, 3 and 4 work, in the PostgREST-shaped form, verified against a
running dev server: a save rewrote `src/locales/de-DE.json` as a one-line diff, a
metadata label landed in `public/locales/de-DE.json`, and the read returned 453
rows. Operation 2 falls out of the query syntax but is unused.

The tenant implementation does not exist anywhere yet — `ui_translations` answers
`PGRST205` on every deployment — so the contract can still be changed for free.
