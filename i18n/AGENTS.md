# Translation work — rules for an agent

**Read `TRANSLATION-GUIDE.md` before you touch anything.** It is the domain: what
the files are, what the keys mean, ICU and placeholders, how a language is added,
and what good German looks like. All of that applies to a human translator and to
you identically, and it is not repeated here.

This file is the part that is only about you: what you may do, what you must do,
and what you must not do. Nothing here is about language.

> Location note: the guide currently lives at
> `apps/web/scripts/i18n/TRANSLATION-GUIDE.md` and the language files at
> `apps/web/public/locales/`. Both move into this folder — see
> `i18n-layout-plan.md`. Until then, follow the paths, not the folder.

---

## 1. You do not run `i18n:import`

Fill in the work file, record what you could not decide, and **stop**. Do not run
`i18n:import` unless a human has told you to in that instruction.

Filling the work file is proposing. Importing is accepting, and accepting is not
yours to do.

This is not ceremony. `i18n:import` merges your translations into the language
file, and the next `i18n:translate` then rebuilds the work file empty — so the
import **destroys the artifact a reviewer needs**: every proposed translation
sitting beside its English source and its hints. What survives is a one-line-per-key
diff of a thousand-entry JSON file, which nobody can review. It has already
happened once: 596 model-metadata strings were translated and merged in a single
unattended run, and not one of the decisions inside them was ever seen.

**The filled work file IS the review.** Leave it filled and hand it over.

## 2. You add, and you abstain. You do not choose, and you do not overwrite

| You may | Without asking |
| --- | --- |
| add a translation where none exists | yes |
| leave an entry empty because you are not sure | yes — abstention needs no permission |
| record a finding in `todo-<locale>.md` | yes |
| resolve a merge where both sides added *different* keys | yes — it is a union, no judgment |

| You may not | Why |
| --- | --- |
| choose between two defensible renderings of a term | the product has to pick one, and only a speaker of the language can |
| overwrite a translation that is already there | somebody decided that |
| resolve a merge where both sides give the *same* key different text | same reason |

An empty entry is safe: the app falls back to the source text, and
`i18n:status` counts it. A confident wrong guess is invisible forever.

## 3. Recording is mandatory, in the same run

Translating a large catalog means making decisions nobody asked you to make.
Every one you are not certain of goes into `todo-<locale>.md` **in the run that
made it** — not in your summary, not in a chat message. A finding that exists
only in the run's own head dies when the run ends.

Three kinds belong there:

- a term with two defensible renderings, where the product must pick one
- a defect in the **English source** — a typo, a stray brace, a sentence that
  only works if it is split, the same label capitalized two ways
- anything you translated but are not confident about

The format and worked examples are in the guide. Five fields: Keys, What, Needs,
Resolves into, State.

Note what this file is *not* for: a decision you can make yourself under rule 2
does not need an entry.

## 4. Work in batches, and know why that is safe

A work file with hundreds of entries is more than one pass should attempt. Fill
some, hand over, regenerate, continue. Two properties make that lossless, and
both are guaranteed:

- `i18n:import` skips empty entries — a partly filled file imports cleanly
- `i18n:translate` carries every filled `translation` forward when it rebuilds

So a half-finished work file is never wasted, and the work file is committed for
exactly that reason.

## 5. `pnpm check` writes to the language files

The browser test project runs the app with discovery on, so a test run records
every newly rendered string into `en-US.json` and an empty entry into the active
language. Running `pnpm check` mid-job is **not a neutral act** — it changes the
files you are working in.

That is by design; it is how the index is maintained. But it means:

- check `git status` after a run and understand every line of the diff
- a test that renders a **fixture** string must call `disableCollector()` first,
  or the fixture is shipped in the index. This has bitten before: a test creating
  a module named `vitest_<random>` wrote two junk keys per run into `en-US.json`,
  and because they start with `module.` nothing can ever prune them.

## 6. What to hand back

When you stop, say plainly:

- how many entries you filled and how many you left empty
- every finding you recorded, and where
- anything you changed outside the work file
- that you did **not** run `i18n:import`

Do not report a translation pass as finished. It is finished when a human has
reviewed and imported it.
