# Translation guide

For whoever — person or agent — fills in a catalog in this folder.

## What is in here

| File | What it is |
| --- | --- |
| `en-US.json` | **Generated.** The index of every message the app can render, with its source text, context, origin files and ICU placeholders. Read it for context; never edit it. `pnpm --filter @semantius/frontend i18n:extract` rewrites it. |
| `de-DE.json` | A hand-maintained catalog. `messages`, `contexts` and `obsolete`, nothing else. |
| `glossary.json` | Fixed product terms per language, checked by `src/test/i18nCatalogs.test.ts`. |

A catalog here holds **only** UI strings from the code. Table, column and enum
labels come from the semantic model, and backend messages come from the server;
both are per-tenant data, so neither is translated here — the `labels`, `server`
and `rule` sections of the shared catalog shape are rejected in this folder.

## The rules

1. **The English source text is the key.** There are no message ids. Rewording a
   string in the code therefore creates a NEW key and moves the old
   translation to `obsolete` — so a PR that adds or rewords a string fills in its
   `de-DE.json` entry in the same PR, and `pnpm --filter @semantius/frontend
   i18n:status` prints `0 missing` before it merges.
2. **An empty value means "not translated yet".** It is not "translate to
   nothing": the app falls back to the English source text for an empty entry, so
   leaving one blank is safe, visible and reported.
3. **Placeholders must survive.** `{count}`, `{label}`, `{table}` are ICU
   arguments and are substituted at render time. Every placeholder in the source
   has to appear in the translation, spelled identically. The catalog test fails
   on a mismatch, because a dropped placeholder silently loses data on screen
   and an invented one renders as literal braces.
4. **The translation is ICU, so it can be plural- and gender-aware.** Where the
   source uses `{count, plural, one {# row} other {# rows}}`, the translation may
   use whatever plural categories the language has — German has `one` and
   `other`, Polish has `one`, `few`, `many` and `other`. The value has to
   compile; the catalog test checks that too.
5. **Do not translate what is not language.** Format examples (`192.168.1.1`),
   identifiers, table names and the product name `Semantius` stay as they are.
6. **Never build a sentence out of fragments.** If a translation only works by
   splitting the source string, the SOURCE is wrong — say so rather than
   working around it, and it gets rewritten as one ICU message.
7. **`obsolete` is a parking lot, not a graveyard.** An entry there is a
   translation whose source string has gone. Copy it back up if a reworded
   string means the same thing; otherwise leave it. `i18n:extract --prune`
   empties the section.

## Fixed terms (de-DE)

These are the words the product uses for its own concepts. Use them
consistently; `glossary.json` is the machine-readable copy of this table, and the
catalog test reports a translation that reaches for a synonym.

| English | German |
| --- | --- |
| Customer | Kunde |
| Favorites | Favoriten |
| Home | Startseite |
| Language | Sprache |
| Log out | Abmelden |
| Module | Modul |
| Settings | Einstellungen |
| Sign in | Anmelden |

Style, beyond the glossary:

- **A plural branch carries the grammatical case the sentence around it needs.**
  German inflects, so a plural form is not one word for every position: `von
  {total, plural, other {# Einträge}}` is wrong because `von` takes the dative
  and the dative plural is `Einträgen`. Read the whole rendered sentence, not the
  branch on its own, and check each category the language has.
- **One English word gets one German word across the product.** `item` and
  `items` must not become `Element` in one message and `Eintrag` in the next; a
  reader meets both on the same screen. `glossary.json` only catches terms whose
  German stem survives inflection as a substring, so the rest is on you.
- Address the user with the formal **Sie**, consistently.
- Sentence case for headings, as in the English source; do not add title case.
- German quotation marks are `„…“`, not `"…"`.
- Keep the source's punctuation weight — an English sentence ending in a period
  ends in one in German too.

## The workflow

```bash
# 1. after changing or adding a string in the code
pnpm --filter @semantius/frontend i18n:extract

# 2. see what is open
pnpm --filter @semantius/frontend i18n:status -- --verbose

# 3. fill in the empty values in de-DE.json, then confirm
pnpm --filter @semantius/frontend i18n:status     # 0 missing
pnpm check
```

`i18n:extract` never touches a value that is already there, so running it is
always safe. It is deterministic — running it twice changes nothing — and the
catalog test fails if the files and the code have drifted apart.

## Adding a language

Create `<code>.json` here with `{ "locale": "<code>", "name": "<endonym>",
"messages": {} }` and run `i18n:extract`; the empty entries appear and the
language becomes switchable in the account menu. `name` is the language's own
name for itself ("Deutsch", not "German") and wins over the browser's display
name.

A language that ships with the product belongs here. A language for ONE
deployment or ONE tenant will not: an operator's own file and a cloud customer's
tenant rows are separate layers that load at runtime, and they are not built yet
— today this folder is the only source of translations.
