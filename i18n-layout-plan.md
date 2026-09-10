# i18n layout plan

> **Status: proposal, fully specified.** Q1–Q18 were answered by the owner and
> are recorded as S1–S17 under *Decisions*. *Still open* is empty — which means
> there is nothing left to guess at, not that the plan is proven right. If
> something turns out to be missing, ask rather than fill it in.

## Why

Two defects, both structural.

**1. `public/` means "published verbatim", and authored working material is
sitting in it.** Vite copies `public/` into `dist/` wholesale and has no
per-file exclude, so `dropWorkFiles()` (`apps/web/vite.config.ts:41`) exists
purely to delete `work-*.json` back out after the build. That plugin is a patch
over a placement mistake, not a feature.

A copy rule filtered by extension cannot fix it: `work-de-DE.json` is JSON and
must not ship, `schema.json` and `work.schema.json` are JSON and must ship (the
latter is explicitly exempted from the deletion so a work file's `$schema`
resolves). The split is by purpose, not by file type.

**2. The material a translator works in is scattered, and the guide is not with
the files it is about.** Language files in `apps/web/public/locales/`,
`TRANSLATION-GUIDE.md` in `apps/web/scripts/i18n/`, three further i18n documents
at the repository root.

## Decisions

- **S1. A root `i18n/` folder**, flat (Q1). The audience is translators, who have
  no reason to know the app layout, and the root already carries the three
  `i18n-*.md` documents.
- **S2. The guide moves; the scripts do NOT.** The folder is the surface a user
  or an agent works in. `apps/web/scripts/i18n/*.mjs` is internal mechanics and
  stays. So do `schema.json` and `work.schema.json` (Q16) — machine artifacts
  nobody hand-edits.
- **S3. No reload on hand-edit (Q17).** Manual reload is sufficient. `M3` is
  dropped; see *Why reload was dropped*.
- **S4. Discovery writes two files**: the index `en-US.json`, and **the file of
  the language active in the browser at the time** — `de-DE.json` when the app
  runs in German — where it adds an EMPTY entry for a key that language does not
  know (`apps/web/src/i18n/missing.ts:1-22`).
- **S5. A per-language TODO file**, `todo-de-DE.md` (Q4: same structure as
  `work-de-DE.json` and `de-DE.json`), **committed** (Q5 — the `.gitignore:63`
  reasoning for work files applies verbatim: a half-filled one is somebody's
  work).
- **S6/S12. `i18n/AGENTS.md` is the real file; `i18n/CLAUDE.md` symlinks to it.**
- **S7. Translations are maintained by agents; conflicts are resolved by
  humans** — the line between them is *An agent may add and may abstain*, below.
- **S8. The existing German is reviewed, not re-translated — ALL of it** (Q13):
  1033 entries, not only the 596 from the machine pass.
- **S9. The three root `i18n-*.md` documents move into `i18n/`** (Q2), this plan
  with them.
- **S10. `apps/web/src/i18n/` stays** (Q3) — see *Why `src/i18n/` stays*.
- **S11. `en-US.json` sits in the same folder, ships, and is never loaded as a
  catalog** (Q11). The app skipping it is already true (`store.ts`, because a
  recorded source would render in place of a model label since reworded); it
  ships because `README.md` tells an operator adding a language to start from
  `/locales/en-US.json`, which only works if it is there.
- **S13. Turbo: `globalDependencies` (Q10)** — see *Turbo* below.
- **S14. TODO entry format approved** (Q6), five fields, as sampled below.
- **S15. `todo-de-DE.md`** — the existing `de-DE.json` / `work-de-DE.json` naming (Q4).
- **S16. No term list, in any form, anywhere (Q15) — DONE, applied.** Not queued
  behind the move; the three edits are in the working tree:
  1. `TRANSLATION-GUIDE.md` — the *Fixed terms (de-DE)* heading, its intro and the
     eight-row table are gone. The German STYLE rules survive under a new
     `## German style` heading, which opens by saying no term list exists.
  2. `CONTEXT-MEMORY.md` — the sentence blessing "eight words as a plain table"
     is replaced. A prohibition with a live exception is one that gets argued
     around, and that exception is what every later session read as sanction.
  3. `CONTEXT-MEMORY.md` *Ideas already tried and rejected* now names it: a
     glossary, term list or fixed-terms table in ANY form, JSON or prose.
  4. `i18n-plan.md:489` described a glossary check as if it existed; struck, with
     a pointer to the rejection.
- **S17. Adding a language is documented in ONE place (Q18)** — the guide. It is
  one job, not three; see *Documentation*.

## Target layout

```
i18n/
  AGENTS.md              <- CLAUDE.md symlinks to this
  CLAUDE.md              -> AGENTS.md
  TRANSLATION-GUIDE.md
  en-US.json             the index — in the folder, never loaded as a catalog
  de-DE.json
  work-de-DE.json
  todo-de-DE.md
  i18n-plan.md  i18n-endpoint-spec.md  i18n-metadata-messages-plan.md
  i18n-layout-plan.md
```

Staying where they are: `apps/web/scripts/i18n/` (the six scripts and their
`.d.mts`), `apps/web/public/locales/schema.json` and `work.schema.json`,
`apps/web/src/i18n/`.

`/locales/<code>.json` remains the served URL. The Docker path
`/usr/share/nginx/html/locales/` and the `nginx.conf` `try_files $uri =404` rule
do not change.

## Why `src/i18n/` stays (Q3)

Three mechanical reasons and one principled one.

1. **The path alias.** `@` maps to `apps/web/src`, so every `@/i18n/...` import
   in components and routes resolves through it.
2. **ESLint scoping is by path.** `src/i18n/*.ts` is exempt from
   `lingui/no-unlocalized-strings` because its strings are locale tags, storage
   keys, codes and regexes. The exemption is written as a path glob; move the
   folder and the exemption stops matching.
3. **Vitest project globs key off `src/**`.** Both projects discover tests by
   path.

The principled one: it is **application code**, not translation content. A
component imports it. That puts it on the same side of the line as the scripts
in S2 — the folder being built is what a translator opens, and a translator
never opens a TypeScript module.

## Publishing and dev serving — one plugin, two hooks

The earlier draft listed these as two problems (M1, M2). They are one
requirement in two runtimes, and a single plugin covers both: `apply: 'build'`
emits the language files into `dist/locales/`, `configureServer` serves the same
path in dev. There is no `dist/` in dev, which is the only reason the build-time
copy cannot also feed it.

**Dev serving is a narrower case than it first appeared.** In `dev` and `stage`
the static file is not fetched at all — `store.ts:132` returns `null` from the
static layer and the language comes from the translate target, which
`i18nDevWriter` already answers off disk. So under `pnpm dev` with the default
mode nothing ever requests `/locales/de-DE.json`. The middleware is needed only
for a dev server running `VITE_TRANSLATE_MODE=off` or `prod`, and for anything
that exercises the static path directly.

**The flat folder means the emit needs a filter** (the consequence of Q1) — and
it must be an **allowlist**, not "everything except `work-*.json`". Reuse
`LANGUAGE_FILE` from `vite.config.ts:19`, the regex `shippedLocales()` already
uses to decide what counts as a language file. It matches `de-DE.json` and
`en-US.json` (which ships, S11) and matches neither `work-de-DE.json`,
`todo-de-DE.md`, `AGENTS.md` nor the plan documents — so a new kind of file
appearing in the folder later cannot leak into `dist/` because somebody forgot to
add it to a denylist. See R2.

## Why reload was dropped (Q17)

Discovery batches on a 3s timer (`FLUSH_DELAY_MS`, `missing.ts:42`) and posts one
message per request, so reaching an unvisited screen in dev produces a run of
writes — to `en-US.json` and to the active language's file (S4) — each of which a
naive watcher would turn into a reload, and each reload re-renders and can
discover more. It converges, because the collector writes a key only when the
index lacks it or the source changed, but the transient is a reload storm.

A provenance gate would have removed it (those writes arrive through the dev
writer's own POST handler, so the plugin can stay silent for its own writes and
reload only for an editor save). The owner's ruling is that it is not worth the
machinery: **manual reload is sufficient.**

F5 does pick up a hand-edit. In `dev` the catalog comes from the target's record,
which `i18nDevWriter` answers by reading the file off disk per request; a reload
is a fresh JS context and a fresh fetch, and the catalog is not cached in
`localStorage` — only the language and formatting-locale *preferences* are. Not
formally verified: the GET sets `content-type` and no cache header, so browser
heuristic caching is not ruled out on paper. One check in a browser settles it.

## Remaining mechanics

**M4. `shippedLocales()`** (`apps/web/vite.config.ts:20`) reads `./public/locales`
to inline `__SHIPPED_LOCALES__`. Repoint at `i18n/`.

**M5. Turbo (Q10, S13).** See R1 for the failure. Two ways to fix it:

1. **`inputs` on the task**, e.g.
   `"inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/i18n/**"]`. Precise, but declaring
   `inputs` **replaces** the default package-file set, so omitting
   `$TURBO_DEFAULT$` silently narrows what Turbo hashes — a caching bug in the
   other direction, equally invisible. And it must be declared on `build`, `test`
   AND `preview:wrangler`, tripling the chance of getting one wrong.
2. **`globalDependencies: ["i18n/**"]`** — one line, root-relative by definition,
   nothing to get wrong.

**Preferred: option 2.** The tasks are `build`, `lint`, `dev`, `dev:supabase`,
`test`, `preview`, `preview:wrangler`. Of the cached ones, `build`, `test`
(`i18nCatalogs.test.ts` reads the files and the browser project writes them) and
`preview:wrangler` all genuinely depend on the language files. The only
over-invalidation is `lint`, which is cheap. Paying one extra lint run to make
the correctness bug structurally impossible is the right trade.

**M6. Script paths.** The scripts stay put (S2) but all five resolve and name
`public/locales/` in code and prose, so all five are repointed from where they
are.

**M7. `dropWorkFiles()` is deleted**, replaced by the emit-time filter above.

## The TODO file (S5)

**It is the agent-to-human decision channel.** An earlier draft narrowed it to
"model defects this repo cannot fix" and routed terminology questions to PR
review instead. That narrowing was wrong (Q14): the file exists because an agent
translating 596 strings makes decisions nobody records, and *which* decision it
is does not change who has to make it. Model defects are one kind of entry;
terminology rulings are another. They differ in how they resolve, not in whether
they belong.

### Sample format — for approval (Q6)

```markdown
## Administration → Verwaltung?
- **Keys:** `module.admin.description`, and the `Admin*` compounds beside it
- **What:** the pass rendered standalone `Administration` as *Verwaltung* while
  rendering `Admin Permission` as *Administrationsberechtigung* — one English
  word, two German words, inside one module's vocabulary. Both are defensible
  German; the product has to pick one.
- **Needs:** a ruling on which German the product uses for `Administration`.
- **Resolves into:** `de-DE.json` alone. There is no term list (S16); recurrence
  is caught by the consistency report, which is how this was found.
- **State:** RULED — SAP usage: standalone `Administration` stays *Administration*,
  compounds naming what is managed take *-verwaltung* (Benutzerverwaltung).
  `module.admin.description` changed from "Verwaltung" to "Administration".

## "facorites" in the bookmarks description
- **Key:** `module.admin.user_bookmarks.entity.description`
- **What:** the SOURCE text is misspelled. The German renders the intent.
- **Needs:** a fix in the model. This repo cannot change it.
- **Resolves into:** the platform model. Self-signalling — once fixed,
  `en-US.json` records the new source against the same key and the German shows
  as stale.
- **State:** open

## title_of_courtesy collapses Mrs. and Ms.
- **Keys:** `module.admin.…enum.title_of_courtesy.{mrs,ms}`
- **What:** both render as one German label; German business usage has no
  distinction, so the dropdown shows two identical entries. The translation is
  correct — the model's value set is what cannot survive translation.
- **Needs:** a model decision: a different value set for German, or collapse the
  pair.
- **Resolves into:** the platform model. **No automatic signal will ever close
  this** — nothing retires a `module.*` key (guide rule 7), and
  `dropped.orphaned` only inspects the previous work file, which is empty.
- **State:** open
```

Five fields: Keys, What, Needs, Resolves into, State. Nothing closes an entry
automatically except where the entry says so.

## An agent may add and may abstain (S7, Q7)

Not everything called a conflict needs a human. The line that holds:

> **An agent may ADD a translation where none exists, and may ABSTAIN by leaving
> an entry empty and filing it. It may not CHOOSE between two defensible
> renderings, and may not OVERWRITE an existing translation.**

Applied to the cases raised:

| Situation | Who |
| --- | --- |
| merge conflict where both sides added *different* keys | agent — it is a union, no judgment |
| merge conflict where both sides give the *same* key different text | human |
| a source defect found while translating (typo, stray brace, a sentence that only works split) | agent files it; the human acts on the model |
| an entry the agent cannot translate confidently | agent leaves it empty and files it — abstention needs no permission |
| two defensible renderings of the same term | **human, always** — this is the Administration case |

## `AGENTS.md` (S6, Q8)

`TRANSLATION-GUIDE.md` is **not** an agent document today and never was. It opens
"For whoever — person or agent", and its content is the language contract: what
the keys mean, the seven rules, ICU and placeholders, the fixed terms, German
style. All of that serves a human translator identically.

So `AGENTS.md` is the layer above it, not a restatement: how an agent works
through a work file (batching, and why batching is safe — `i18n:import` skips
empty entries and `i18n:translate` carries filled ones forward), when to stop and
file a TODO entry rather than decide, the add/abstain rule above, and that
`pnpm check` writes to the language files so running it mid-job is not a neutral
act. It points at the guide for every rule about language itself.

The guide stays a separate document.

Discovery: the root `CLAUDE.md` is a locked global SOP and cannot be edited to
register this file, so it is found by being in the folder an agent is working in.

## Reviewing the current de-DE catalog (S8)

**Scope: all 1033 entries** (Q13) — 433 code strings that predate this work and
600 `module.*` keys, 596 of which were filled in a single machine pass with no
record of any decision it made. The file is uncommitted and the diff is one line
per entry.

**Review, do not discard.** A re-run puts the same class of agent over the same
sources, the same hints and the same guide, so it reproduces the same
underdetermined choices. What is missing is not a better pass but the
terminology decisions only a German speaker can make — and those are durable
across languages and future agents in a way a re-translation is not.

**The mechanical half carries no judgment and is automatable**: report every
English source that received two or more different German renderings, and every
German rendering serving two or more different English sources. The owner's
single observation (Administration) surfaced a real inconsistency in about a
minute; run exhaustively it produces the candidate list, and only genuinely
ambiguous ones need a ruling. Not yet run.

## Risks, and what to do about each

**R1. Turbo replays a stale bundle.** Turbo hashes a task's inputs and, on a
match, restores the previous outputs instead of running it. A task's default
inputs are the files of its own **package**, so a root `i18n/` is invisible to
`apps/web`'s `build`: change a translation, the hash is unchanged, Turbo restores
the old `dist/` and the deploy ships the old German while reporting success.
→ **Solve with Q10.** Verify it, do not assume: change one translation, run
`pnpm build` twice, and confirm the second run is a cache MISS.

**R2. The flat folder ships something it should not.** With `i18n/` flat (Q1) the
emit step decides file by file what goes into `dist/locales/`, and a denylist
(`except work-*.json`) rots the moment a new kind of file appears — a notes file,
a second todo file, a draft.
→ **Make the filter an allowlist, and reuse the one that already exists.**
`vite.config.ts:19` already has `LANGUAGE_FILE = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.json$/`
for `shippedLocales()`. Emit exactly what it matches. `work-de-DE.json`,
`todo-de-DE.md`, `AGENTS.md` and the plan documents match nothing, so nothing has
to be remembered.

**R3. The schema path is derived from the language folder.**
`localeFileSchema.test.ts:21` computes `SCHEMA_PATH = join(LOCALES_DIR,
'schema.json')`, importing `LOCALES_DIR` from `extract.mjs`. Under Q16 the
schemas stay in `apps/web/public/locales/` while `LOCALES_DIR` moves to `i18n/`,
so that join silently points at a file that is not there.
→ **Give the schemas their own exported constant** in `extract.mjs`, separate
from `LOCALES_DIR`, and repoint the test at it. The assertion on line 78 keeps
working — the schemas really do stay under `public/` — but its derivation must
stop going through the language folder. Read the comment above it first; it
explains why the path is asserted at all.

**R4. An operator-facing URL changes without anyone noticing.**
`/locales/<code>.json` and `/locales/schema.json` are documented in `README.md`,
`docker/README.md` and `BACKEND.md`, and served by `docker/nginx.conf`. A move
that silently changed them breaks every self-hosted deployment on upgrade.
→ **Assert the build output**, not the source layout: a check that
`dist/locales/de-DE.json` and `dist/locales/schema.json` exist after `pnpm build`
turns a URL regression into a failing build. Do not touch `nginx.conf`.

**R5. Two sessions share this working tree.** A folder move is the worst case:
`git add -A` would sweep up another session's work in progress.
→ **`git mv` with explicit pathspecs, never `-A`.** `git mv` also records the
move as a rename, so review sees a rename rather than 1000 deleted lines and
1000 added ones.

**R6. Line endings turn a move into a rewrite.** `core.autocrlf=true` with some
files stored as CRLF; a tool that rewrites a file with different endings produces
a whole-file diff and buries the real change.
→ **Move and edit in separate commits.** `git mv` copies bytes; do the path
edits afterward, so a reviewer can see that the move changed nothing.

**R7. The review window closes when `de-DE.json` is committed.** Right now the
596 machine-written entries are a reviewable diff. Merged, they are
indistinguishable from the 433 that predate them.
→ **Track B first** (see Sequence). If the file has to be committed sooner,
commit the pass **alone, in one commit that contains nothing else**, so the
review can always be run as `git show <sha> -- i18n/de-DE.json`.

**R8. One person cannot review 1033 entries.**
→ **Rule on TERMS, not entries.** The mechanical report groups by English source,
so one ruling on `Administration` settles every entry containing it. That turns a
1033-entry read into a few dozen decisions. Q13's "all of de-DE" stays satisfied,
because the report covers all of it — only the rulings are grouped.

**R9. `shippedLocales()` fails SILENTLY.** `vite.config.ts:26` wraps the
`readdirSync` in `try { } catch { return [] }`. Point it at a folder that is not
there — mid-move, a typo, a path that resolves differently in CI — and the build
succeeds with **zero languages**: no error, no warning, just a language switcher
with nothing in it and every string falling back to English.
→ **Make the empty case loud.** A build that finds no language file should fail,
or at minimum warn, because there is no deployment in which zero is correct. Note
the function deliberately excludes `en-US` from the returned list while the file
itself still ships (S11) — two different things; do not "fix" the exclusion.

**R10. The browser test project WRITES these files.** `pnpm check` runs the app
against the dev server with discovery on, so the suite writes `en-US.json` and the
active language's file through `i18nDevWriter`. The writer resolves `LOCALES_DIR`
relative to its own file; the move changes what that must resolve to.
→ **Run `pnpm check` immediately after step 2 and inspect `git status`.** The
suite writing to the OLD path, or to no path, both look like a passing run. The
evidence is which file the diff lands in.

**R11. A session may be mid-translation when the folder moves.** Its
`work-de-DE.json` path changes underneath it, and a half-filled work file is
somebody's day.
→ **Land Track B first** (already sequenced) so no translation is in flight, or
announce the move and let it finish.

**On completeness: this list is not proven exhaustive.** Every item above has a
mitigation, which is not the same as being solved — R1 and R9 in particular are
only closed by *verifying* them after the move, not by intending to. Expect the
move to surface at least one thing nobody listed.

## Documentation

**Adding a language is already documented, in three places for two audiences.**
Nothing new has to be written; all three name the old path and must be repointed.

| Audience | Where | What it says |
| --- | --- | --- |
| product (a language that ships) | `TRANSLATION-GUIDE.md:195` *"Adding a language"* | `pnpm i18n:translate -- --locale fr-FR --create`; the file IS the registration; `--name` is the language's own name; creating does not make it managed |
| self-hosted operator | `README.md:350` *"Adding a language without a rebuild"* | drop `<code>.json` next to the deployed app, validate against `/locales/schema.json`, register in `VITE_UI_CUSTOMIZER` |
| Docker operator | `docker/README.md:170` | the same, at `/usr/share/nginx/html/locales/`, plus the one-line-JSON constraint of the `.env` parser |

**S17 (Q18): ONE place, because it is one job.** Adding `fr-FR` produces one
artifact — a single `fr-FR.json`, same schema, same content, whoever does it.
There are not three jobs here and there were never even two. The whole of the
difference is one branch:

> If the file is in the repo before the build, the build's folder glob finds it
> and no registration is needed. If it is added to an ALREADY-BUILT deployment,
> `__SHIPPED_LOCALES__` was baked in at build time, so it must also be named in
> `VITE_UI_CUSTOMIZER`.

and two footnotes for Docker: the path is `/usr/share/nginx/html/locales/`, and
the `.env` parser is line-based so the JSON stays on one line.

An earlier draft of this plan called these "genuinely different jobs for
different people". That was wrong — it took the existing three-document layout as
evidence that three things existed.

**Target:** the moved `TRANSLATION-GUIDE.md` carries the entire procedure,
branch and footnotes included. `README.md` and `docker/README.md` keep a single
pointer line each and nothing else. The old argument for spreading it was that an
operator never opens `apps/web/scripts/` — which a root `i18n/` answers.

**To update for the move:** the three above, plus `BACKEND.md`, `.gitignore` (its
comment at line 63 names `apps/web/public/locales/work-<locale>.json`), and the
header comments in the six scripts (`export`, `extract`, `import`, `status`,
`tenant`, `translate`).

## Still open

**Nothing.** Q1–Q18 are all answered and recorded as S1–S17. The plan is fully
specified; the next step is Track B in the sequence, not another round of
questions.

What that does NOT mean: that the plan is complete or correct. See the note at
the end of *Risks* — R1, R9 and R10 are closed by verifying after the move, not
by having been written down, and a move of this size will surface something
nobody listed.

## Sequence

Two tracks. **Track B does not depend on the folder move and starts first**,
because its window closes when `de-DE.json` is committed (R7).

### Track B — review the current German (S8)

- B1. Run the mechanical consistency report over all 1033 entries. Read-only.
- B2. File its candidates, plus the three known items, into `todo-de-DE.md` using
  the approved format. **Stop here** — nothing is edited until the owner rules.
- B3. Owner rules on the candidates.
- B4. Apply the rulings to `de-DE.json`. Nowhere else — there is no term list (S16).
- B5. Land it as its own PR.

### Track A — the folder move

1. Answer Q6, Q10, Q11, Q15, Q4. **Stop here.**
2. Move the folder; repoint `shippedLocales()`, the six scripts and any test
   that names the path. `/locales/<code>.json` must still resolve in a build.
   **Stop and review.**
3. The publish/dev-serve plugin; `dropWorkFiles()` deleted. **Stop and review.**
4. Turbo inputs per Q10, verified by a cache-busting check, not by assumption.
5. `AGENTS.md` + `CLAUDE.md` symlink.
6. Documentation sweep.

Steps 2–6 are independently reviewable and must not be bundled.
