# Translation guide

For whoever — person or agent — fills in a language file under
`apps/web/public/locales/`.

## What is in there

| File               | What it is                                                                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `en-US.json`       | **The index.** Every key the app has rendered, with its SOURCE text as the value: a code string's own English, a model label as the model spells it, a server error's template. Filled by the running app (discovery); the complete baseline a new language is started from. Never a catalog. |
| `de-DE.json`       | A language. `messages` (key to translation) and `obsolete`, nothing else.                                                                                                                                                                                                                     |
| `schema.json`      | The shape of a language file, served by the build so an editor's `$schema` validates as you type.                                                                                                                                                                                             |
| `work.schema.json` | The shape of the work file `i18n:translate` writes.                                                                                                                                                                                                                                           |

**One flat map per language.** A code string and a piece of model text are both
messages; they are told apart by nothing but their keys.

## The keys

| Kind                        | Key                                                                                                                          | Source                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| a code string               | its own English text: `Save`, `Delete {label}?`                                                                              | the key itself         |
| a disambiguated code string | an id prefix, then the text: `columnVisibility.View`                                                                         | `View`                 |
| a module                    | `module.nwind.name`, `module.nwind.description`                                                                              | the model              |
| an entity                   | `module.nwind.orders.entity.plural_label` (`singular_label`, `description`)                                                  | the model              |
| a field                     | `module.nwind.orders.field.city.title` (`description`, `relationship_label`, `singular_label_parent`, `plural_label_parent`) | the model              |
| an enum value               | `module.nwind.orders.enum.status.pending` — the **stored value**, never its English label                                    | the stored value       |
| a platform error            | its code: `99017.orders`, `90042`                                                                                            | an ICU template        |
| a plain server sentence     | its SQLSTATE plus the constraint name: `23505.modules_module_slug_key`, or `42703`                                           | the sentence, verbatim |

`module` is a reserved first segment: no code string ever starts with it. The
attribute vocabulary is the model's own column names.

## The rules

1. **The English source text is the key of a code string.** There are no
   message ids. Rewording a string in the code therefore creates a NEW key; the
   optional `i18n:extract` scan moves the old translation to `obsolete`. A
   metadata message has a key instead, so relabeling a field in the model does
   not move its translation — `en-US.json` records the new source next to the
   old key, which is how you notice the German is stale.
2. **An empty value means "not translated yet".** It is not "translate to
   nothing": the app falls back to the source text for an empty entry, so
   leaving one blank is safe, visible and reported. Discovery writes empty
   entries; you fill them.
3. **Placeholders must survive.** `{count}`, `{label}`, `{table}` are ICU
   arguments and are substituted at render time. Every placeholder in the source
   has to appear in the translation, spelled identically. The catalog test fails
   on a mismatch, because a dropped placeholder silently loses data on screen
   and an invented one renders as literal braces.
4. **The translation is ICU, so it can be plural- and gender-aware.** Where the
   source uses `{count, plural, one {# row} other {# rows}}`, the translation may
   use whatever plural categories the language has — German has `one` and
   `other`, Polish has `one`, `few`, `many` and `other`. The value has to
   compile; the catalog test checks that too. **A plain server sentence (a
   SQLSTATE key outside class 90 and 99) is the exception**: it is looked up
   verbatim and may contain braces.
5. **Do not translate what is not language.** Format examples (`192.168.1.1`),
   identifiers, table names and the product name `Semantius` stay as they are.
6. **Never build a sentence out of fragments.** If a translation only works by
   splitting the source string, the SOURCE is wrong — say so rather than
   working around it, and it gets rewritten as one ICU message.
7. **`obsolete` is a parking lot, not a graveyard.** An entry there is a
   translation whose code string has gone. Copy it back up if a reworded
   string means the same thing; otherwise leave it. `i18n:extract --prune`
   empties the section. Nothing retires a `module.*` key: a removed field is a
   manual edit.

## The workflow

```bash
# 1. what is open, both kinds
pnpm i18n:status -- --verbose

# 2. everything still needed, as one file
pnpm i18n:translate -- --locale de-DE
#   -> apps/web/public/locales/work-de-DE.json  (committed, beside de-DE.json)

# 3. fill in every `translation`, keeping every `{placeholder}` its source uses,
#    and record anything you could not decide in todo-de-DE.md

# 4. a HUMAN reviews the filled work file and runs the import (see below)
pnpm i18n:import -- --locale de-DE

# 5. confirm
pnpm i18n:status     # 0 missing
pnpm check
```

> ## 🔴 An agent does not run `i18n:import`
>
> **If you are an agent: fill in the work file, record your findings, and stop.
> Do not run `i18n:import` unless a human has explicitly told you to in that
> instruction.** Filling the file is proposing; importing is accepting, and
> accepting is not yours to do.
>
> This is not a formality. `i18n:import` merges the translations into
> `de-DE.json` and the next `i18n:translate` then rebuilds the work file empty —
> so the artifact a reviewer needs, every proposed translation sitting beside its
> English source and its hints, **is destroyed by the import**. What is left is a
> one-line-per-key diff of a 1000-entry JSON file, which is not a review surface.
> It has already happened once: 596 model-metadata strings were translated and
> imported in a single unattended run, and the decisions inside them were never
> reviewed by anyone.
>
> The filled work file IS the review. Leave it filled, say what you did, and let
> a human read it.

`i18n:import` refuses the whole file if any translation drops or invents an ICU
placeholder, or fails to compile, and never overwrites a value that is already
there. It reads the placeholders off the SOURCE text, not off a field in the
work file, so there is nothing in the file you can edit to switch that check off.
Editing `de-DE.json` by hand is equally fine — it is the same file.

## Recording what you could not decide — `todo-<locale>.md`

**Whoever translates writes this file, and that is usually an agent.** It is
authored, not generated: no script emits it, no script reads it, and
regenerating the work file never touches it. It is committed like the work file.

**Recording is not optional.** Translating a large catalog means making decisions
nobody asked you to make. Every one you are not certain of goes in here, in the
same run that made it — otherwise it exists only in your own head and is lost the
moment the run ends. Three kinds belong:

- a term with two defensible renderings, where the product has to pick one
- a defect in the SOURCE — a typo, a stray brace, a sentence that only works if
  it is split — which this repo may not even be able to fix, because model text
  lives in the platform
- anything you translated but are not confident about

One section per finding, five fields:

```markdown
## Administration → Verwaltung?
- **Keys:** `module.admin.description`, and the `Admin*` compounds beside it
- **What:** standalone `Administration` was rendered *Verwaltung* while
  `Admin Permission` became *Administrationsberechtigung* — one English word,
  two German words, inside one module. Both are defensible German.
- **Needs:** a ruling on which German the product uses.
- **Resolves into:** `de-DE.json`. There is no term list and there will not be one.
- **State:** open
```

An entry you cannot answer is also a reason to leave the `translation` EMPTY in
the work file. An empty entry is safe and is counted by `i18n:status`; a
confident wrong guess is invisible forever.

**The work file is committed, and rerunning step 2 does not cost you anything.**
It lives beside the language it is about, so `de-DE.json` and `work-de-DE.json`
open together, and it is tracked like any other authored file — a half-filled
one is half a day of work, and a device switch must not lose it. Rerunning
`i18n:translate` treats what is already there as input: every filled
`translation` is carried forward, entries imported since drop out, and the run
says how many it kept. The one thing it cannot carry is a filled entry whose key
has left the index; those are printed by key, because there is no entry left to
put them in.

## Managed languages, and the hints they give

`MANAGED_LANGUAGES` in `scripts/i18n/extract.mjs` names the languages a human
has reviewed. Today that is `de-DE`.

Every entry of a work file for some OTHER language carries what each managed
language already says for that key:

```json
{
  "key": "module.admin.entities.field.order_column.title",
  "source": "Order Column",
  "translation": "",
  "hints": { "de-DE": "Sortierspalte" }
}
```

That exists because English underspecifies and a reviewed language has already
had to resolve it. `Order` is an entity in nwind and a sort position in
`order_column`; `Title` is a job title on employees and a form of address in
`title_of_courtesy`. With one source the translator goes and reads the model
again for each; with two, what they agree on is the meaning and where they
differ is language-specific packaging. The payoff is inverse to length — it is
large on a bare label and near zero on a full sentence, where the English is
already self-sufficient and a second long string mostly invites you to inherit
its phrasing.

Hints are context. `i18n:import` never reads them, a language is never hinted
with itself, and a language with no answer for a key is left out rather than
offered as an empty string. **The English is the source of truth.** Where a hint
cannot be reconciled with it, that is a question worth raising, not a tie to
break quietly — it may be the hint that is wrong.

**Where the index comes from.** Running the app. Every string a screen renders
that the language does not know is written to the translate target
(`VITE_TRANSLATE_MODE=dev` under `pnpm dev`, and the browser test suite, which
renders the app): the key with its source into `en-US.json`, an empty entry into
the active language. `pnpm check` therefore fills `en-US.json`, and its diff is
the discovery. `i18n:extract` is an optional scan of `src/` that prunes reworded
code strings; it never touches `module.*`.

## Translating in the app

The running app has a translate mode (root README, "Translate mode"): mark what
is missing, Alt+click or right-click a string to translate it in context, or
work through the panel. Under `pnpm dev` a save lands in
`apps/web/public/locales/<code>.json` — the same file as above, reviewed in a
PR like any other change. On a stage host it lands in that host's copy;
`export.mjs --target <url>` copies it back into the file's empty entries.

## German style

**There is no term list, and there is not going to be one.** The reviewed
`de-DE.json` is the terminology record: every decision in it is attached to a
key, which is what a word on its own can never be. To find what the product
already calls something, read the catalog — a code string is keyed by its own
English text, model text by its key. Drift between two renderings of one English
source is found by a consistency report over the whole catalog, never by a
hand-picked list of words.

- **A plural branch carries the grammatical case the sentence around it needs.**
  German inflects, so a plural form is not one word for every position: `von
{total, plural, other {# Einträge}}` is wrong because `von` takes the dative
  and the dative plural is `Einträgen`. Read the whole rendered sentence, not the
  branch on its own, and check each category the language has.
- **One English word gets one German word across the product.** `item` and
  `items` must not become `Element` in one message and `Eintrag` in the next; a
  reader meets both on the same screen. Nothing catches this for you — read what
  the language already says for a neighboring key before coining a second word.
- **A model label is inserted into a sentence as given.** `Add {label}` renders
  the entity's singular label untouched, so translate the label under its own
  key (`module.nwind.orders.entity.singular_label`) and the sentence under its
  own; never bend one to fit the other.
- Address the user with the formal **Sie**, consistently.
- Sentence case for headings, as in the English source; do not add title case.
- German quotation marks are `„…“`, not `"…"`.
- Keep the source's punctuation weight — an English sentence ending in a period
  ends in one in German too.

## Adding a language

```bash
pnpm i18n:translate -- --locale fr-FR --create
```

`--create` writes `public/locales/fr-FR.json` as
`{ "locale": "fr-FR", "name": "français", "messages": {} }` and then does the
normal export, hints included. The file IS the registration — the build lists
every language file in that folder — so from the next build the switcher offers
the language, with every key falling back to English until it is filled. Writing
the file by hand does the same thing.

`name` is the language's own name for itself ("Deutsch", not "German") and wins
over the browser's display name. It is derived from the tag; pass `--name` to
override it, and for a tag `Intl` has no name for, `--name` is required rather
than guessed.

**Creating a language does not make it managed.** It joins `MANAGED_LANGUAGES`
when you have reviewed it and edit that array — not before. A machine-filled
language quoted as context to the next language propagates its mistakes and
makes them look corroborated.

A language that ships with the product belongs there. A language for ONE
deployment or ONE tenant does not — those are served or stored at runtime and
never built into the bundle:

| Who                    | Where its translations live                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| the product            | `public/locales/<code>.json`                                                                 |
| a self-hosted operator | `/locales/<code>.json` next to the deployed app, registered in `VITE_UI_CUSTOMIZER`          |
| a cloud customer       | the per-language record behind `/translations` on their own API (`VITE_TRANSLATE_MODE=prod`) |

The root `README.md` has all three, under "Internationalization".
