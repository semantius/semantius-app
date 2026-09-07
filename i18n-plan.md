# i18n plan — Semantius app (`apps/web`)

## Context

The UI is English only: ~290 hard-coded string literals in `apps/web/src` (about 200 on real product surfaces, the rest on demo routes), no i18n library anywhere, `<html lang="en">` static, and every locale-aware helper (`lib/number-format.ts`, `lib/date-format.ts`, `ui/calendar.tsx`) already accepts a locale that no call site passes. Table, column and enum labels arrive as data from the semantic model (`get_schema`) and have no translation channel at all.

Requirements set by the owner:

1. **No message IDs.** The English source text is the key.
2. **Default messages stay in code, in one place.** A new or changed string is one edit; grepping for a label finds the control.
3. **Self-contained translations**, no paid service, no server to run. Coding agents create and maintain them.
4. **Operators and customers add languages** without a rebuild: a file for self-hosted operators, a tenant table for cloud customers, one loader for both.
5. **Missing translations fall back to `en-US`**, can be marked in the UI, and a **translate mode** lets a user edit or add translations in context, on the fly.
6. **Locale files may override model labels** (tables, columns, enum values, modules) client-side.
7. Shipped locales: **`en-US`** (source) and **`de-DE`**.
8. drizzle-cube (the analytics dashboard) is an embedded third-party product with its own i18n: **ignored**, not touched in any phase.
9. **No Babel or Vite transform for i18n, and no PO files.** Both were library defaults; neither serves the requirements above.
10. **Messages the app cannot know in advance** (backend rule messages, RPC and PostgREST text) are collected at runtime and stored as translation work.
11. **Language and formatting locale are two preferences and part of the user's session**, following the user across devices; when the session has none, the browser's language and locale are the placeholder.

## Status

Branch `feat/i18n`, one commit per phase, no PR. **All five phases are done and committed.**

| Phase | State | Commit |
| --- | --- | --- |
| P1 Foundation + app shell | done | `31bf10d` |
| P2 Grid, dialogs, formatting | done | `cadaeb7` |
| P3 Forms, validation, remaining surfaces | done | `fb26cb7` |
| P4 Runtime languages | done | `dd2662e`, `310730b` |
| P5 Translate mode | done | `3b8fb33`, plus the review fix-up commit after it |

### What P5 built, and where it deviates from the section "Translate mode" below

- **The reverse index is recorded at the PRODUCER, not by wrapping `t()`.** `translate()`,
  `labelOf()`, `localizeMetadata()`'s enum walk, `moduleOverride()` and `translateDynamic()`
  each hand their output to `src/i18n/reverseIndex.ts` while recording is on — one boolean
  check per call otherwise. `moduleOverride` gained an optional third argument (the module
  row) so the module name that renders when nothing overrides it is recorded too, and
  `localizeMetadata` no longer short-circuits on an empty label map while recording (its
  identity contract still holds). `activateLocale` clears the index; `reactivateLocale()`
  (new) is what fills it after the mode is switched on, by re-rendering every consumer.
- **Editing is Alt+click, not click.** A plain click in translate mode must still open the
  menu or follow the link the text sits on — otherwise the entries inside a submenu can never
  be reached to translate them. Alt+click is what every in-context tool does for this reason.
- **The editor is a Dialog, not a Popover.** `ModalInert` and Base UI focus management handle
  a modal for free, and the shadcn Popover wrapper does not expose the positioner's `anchor`
  for a virtual click point. The panel is a modal Sheet for the same reason: `ModalInert`
  makes `#root` inert for ANY open dialog outside it, so a non-modal panel would block the
  page just the same while announcing itself as something else.
- **Marks are CSS Custom Highlights; attribute hosts (and the no-API fallback) carry
  `data-i18n-missing`**, styled as an outline only — the focus ring here is a box-shadow, so the
  two compose (a review caught the first version's box-shadow replacing the ring).
  The scan walks `document.body` (so a menu or a Sheet, portaled beside `#root`, is covered)
  and skips subtrees marked `data-i18n-ui`, which is translate mode's own editor, panel and
  button. The scan is one throttled pass per settled burst of mutations and per catalog
  change.
- **The writer is `useCreateRecord(TENANT_TABLE, { onConflict })`**, the generic option P4 left
  out, proven against `modules.module_slug` (a real unique constraint on the tenant) in
  `useTableMutations.test.tsx`; the `ui_translations` path itself still waits on the
  migration. Which writer applies is decided from `tenantTableAvailable()` (set by the
  prefetch from the definitive body) and `canWriteTenant(permissions)` — never a probe. The
  drafts layer is the last entry of `localeLayers` and lives in `src/i18n/drafts.ts` as rows
  in `localStorage['semantius-i18n-draft:<code>']`.
- **Two switches, persisted per browser**, gated by `canTranslate()` (`translations.edit`, or
  `admin` until the migration): the switches, the missing count and the host live in
  `src/i18n/translateModeState.ts` and `components/TranslateModeHost.tsx`, which lazy-loads
  `src/i18n/translateMode/` (the chunk carries the `en-US.json` index). Translate mode marks
  as well; "Mark missing" alone is marks without the editor.
- **Machinery moved out of the lazy chunk into top-level `src/i18n/*.ts`** —
  `reverseIndex.ts`, `highlighter.ts`, `entries.ts`, `placeholders.ts`, `exportFile.ts`,
  `drafts.ts`, `translateModeState.ts` — because those files carry identifiers, attribute
  names and storage keys the lint rule cannot tell from text, and the folder-wide exemption
  was deliberately NOT extended to `translateMode/`. The UI files there carry only `t()`
  strings; the scope names they compare against are the `SCOPE` constants from `catalog.ts`.
- **`shadcn add tabs` emits a broken `import { cn } from "cn"`** (both the pinned 4.19 and
  4.21) and adds a bogus `cn` package, so `ui-ext/tabs.tsx` carries the registry markup with
  the import fixed, and says why.
- **The lazy chunk's dependencies are named in `optimizeDeps.include`** (`sonner`,
  `@base-ui/react/tabs`): Vite discovers them on first load otherwise and RELOADS the page,
  which in the Vitest browser project leaves two copies of React in the graph.

Numbers after P5: **458 messages**, `de-DE` 458/458, 2 obsolete (the panel sentence was reworded once during review). The suppression
baseline did not move. `substitutions.test.ts` unchanged at 6.

Each committed phase passed, independently re-run by the orchestrator: `i18n:extract` twice
with no change, `i18n:status` 0 missing, `pnpm check`, `pnpm build`, a stable
`eslint --prune-suppressions`, the American-English grep, and a Cloudflare preview deploy
opened in German with a screenshot under `screenshots/`.

Numbers after P4 (what P5 ratcheted against; the post-P5 numbers are under "What P5 built"):

- **398 messages** in `src/locales/en-US.json`, `de-DE` 398/398 translated, 1 obsolete.
- **`eslint-suppressions.json` totals 610** suppressed violations. It may only fall. It did
  not reach the zero this document asks for in P3, and the reasoning is recorded in
  CONTEXT-MEMORY: what is left is identifiers, PostgREST fragments, CSS strings, internal
  invariants and CLI-owned `ui/**`, and widening an `ignore` far enough to reach zero would
  hide real strings.
- `substitutions.test.ts` unchanged at 6.
- `pnpm check`: 76 test files, 824 passed, 7 skipped. The 7 skips are the tenant-table tests
  named below - they are the only skips in the suite and each prints why.
- Last accessibility audit against the P4 preview: 3.1.1 **Supports**; the one failing
  criterion (1.3.1, an `h1 -> h3` jump on drizzle-cube's "No Portlets" empty state) is
  pre-existing and outside `apps/web/src`. 1.4.3 improved to Supports in the same run.

### What P5 inherits from P4 - read this before starting translate mode

Every seam P5 was specified to plug into exists and is tested. Concretely:

- **The layer list is open.** `localeLayers` in `src/i18n/store.ts` is an exported array of
  `{ name, load(language) }`; the drafts layer is one more entry appended after `tenant`, and
  `activateLocale` needs no change to pick it up.
- **`translatedKeys(language)` already covers every scope**, not just messages: `setCatalogState`
  unions the message ids, the `scope:key` label ids and the `server`/`rule` ids. That set is
  what "mark missing" filters against.
- **Single-key writes exist for the scopes Lingui does not hold.** `addCatalogEntry(scope, key,
  text)` in `catalog.ts` merges one entry into the live label or dynamic map and emits the
  catalog `change` event, which is the equivalent of Lingui's merging `i18n.load` for a
  translate-mode save. `subscribeToCatalog` / `catalogSnapshot` are the `useSyncExternalStore`
  pair; `useLocaleLabels()` and `useLocalizedMetadata()` already use them.
- **The file <-> rows mapping is done and shared**: `src/i18n/localeFile.ts` (a re-export of
  `scripts/i18n/localeFile.mjs`) has `localeFileToRows` for the export download and
  `rowsToLocaleFiles` for reading rows back.
- **The label inventory is done and shared**: `src/i18n/labelInventory.ts` gives
  `buildLabelInventory` / `diffLabelInventory` (missing, translated, orphaned) with each
  entry's model `updatedAt`, which is what the panel's "newest first" and "changed since
  translated" filters need. The model reads are `readModel()` in `scripts/i18n/model.mjs`;
  the app reads the same three tables through `useTable`.
- **The queue's browser-local fallback is done**: `localRequests(locale)` in
  `src/i18n/missing.ts` is the list the panel shows on a deployment with no tenant table.
- **The tenant queue query** is `select=*&translation=eq.&locale=eq.<code>&order=first_seen.desc`
  through the generic `useTable`; `TENANT_TABLE` and the absence predicates are in
  `src/i18n/tenant.ts`.

What P5 still has to build that P4 deliberately did **not**:

- `useCreateRecord`'s generic `onConflict` option (`hooks/useTableMutations.ts`). P4 listed it
  but had no caller and no test for it, so it was left out rather than shipped untested -
  the writer is P5's first caller. It must send
  `?on_conflict=locale,scope,key,context` with `Prefer: resolution=merge-duplicates,return=representation`.
- The reverse index (rendered text -> `Set<runtime id>`), the highlighting, the editor popover,
  the panel, the drafts layer and the export download.
- The `translations.edit` gate. `rpcUserInfo.permissions` does not carry it on the test tenant,
  so `admin` gates the toggles until the migration lands.

### Deviations P4 made from this document, and why

- **`resolveLocales` lives in `src/i18n/localeConfig.ts`, not `src/lib/`.** Every string in it is
  a JSON key or an operator diagnostic, and the lingui rule already exempts `src/i18n/*.ts` as
  machinery; under `lib/` the file would have needed its own suppression-baseline entry, which
  the ratchet forbids. Same reasoning put the tenant query, the PostgREST codes and the RPC
  name in `src/i18n/tenant.ts` and the label attribute names in `labels.ts` as `TABLE_ATTR` /
  `COLUMN_ATTR` / `MODULE_ATTR` constants, so no call site writes `'plural_label'` as a literal.
- **`request()` and the writer are not in `store.ts`.** The collector's insert is in
  `src/i18n/missing.ts`, with the collector it belongs to; the translation WRITER has no caller
  until P5 and was not written.
- **The label-miss collector reports from `useLocalizedMetadata`, in an effect**, covering the
  entity currently on screen. The whole-model picture is the inventory, which is the path this
  document already specifies as primary for labels.
- **`data-table-error-boundary.tsx` is not routed through `translateDynamic`.** It renders a
  caught JS exception, not server text; a `translateDynamic` call there would record nothing
  (no PostgREST code) and only offer a tenant an override of a stack message.
- **The deployment-file browser test serves its fixture as a BLOB**, not from the Vite dev
  server. Vite transforms a `.json` under `src/` into an ES module, so a fetch of it answers
  `content-type: text/javascript` - which is the layer's REJECT path, not its happy path. The
  blob is built from the committed fixture's own bytes and fetched over real HTTP with a real
  content-type. The one thing it cannot cover, a web server actually serving
  `/locales/fr-FR.json`, was covered by a throwaway preview deploy (screenshot
  `20260907113413-i18n-p4-operator-french-labels.png`), and the SPA-fallback hazard the guard
  exists for was confirmed on that deploy: a missing `/locales/*.json` answers **200
  `text/html`** on Cloudflare Workers.

### Platform prerequisite, still outstanding

Re-confirmed by curl against the `tests` tenant during P4:

- `GET /ui_translations` -> 404 `{"code":"PGRST205"}`
- `POST /rpc/set_user_preferences` -> 404 `{"code":"PGRST202"}`
- `get_userinfo` returns no `language` / `locale` field at all

`apps/web/src/i18n/tenantTranslations.test.tsx` therefore skips its three row tests with a
console warning naming the table. It probes at **collection** time (a top-level `await`, not a
`beforeAll`) because `describe.skipIf` is evaluated before any hook runs - a flag set in a hook
would make the skip permanent instead of temporary. When the migration lands they run with no
edit. The DDL, triggers, policies, model registration and the `users` columns are written out
in the root `README.md` under "Tenant translations".

### The tenant's actual state, probed before P1 and re-probed during P4

| Prerequisite | Actual state | What depends on it |
| --- | --- | --- |
| `ui_translations` table | absent - `GET` answers 404 `{"code":"PGRST205"}` | the tenant layer disables on the definitive body; the table, queue and collector tests skip with a message naming it |
| `set_user_preferences` RPC | absent - 404 `{"code":"PGRST202"}` | the switcher persists to the cache only |
| `get_userinfo` `language`/`locale` | not returned at all | read defensively; fall through to the OIDC claim, then the browser placeholder |
| `translations.edit` permission | absent; principal holds `admin` | **P5**: `admin` gates the writer and the translate-mode toggles until it exists |
| `tables` / `fields` / `modules` reads | all 200, with `description` and `updated_at` | the label inventory, asserted against the live model |

Everything the tenant already has is asserted for real - the two absence predicates against the
real 404 bodies, and the inventory against the live model. Only the rows themselves are
unverifiable, and those are the loud skips described above.

### Learned while implementing, and binding on P5

Full detail is in CONTEXT-MEMORY's Internationalization section; these are the ones that
change how the remaining phase must be written.

- **The lint rule is blind to a JSX subtree it thinks is its own.** `eslint-plugin-lingui`
  hard-codes `Trans`/`Plural`/`Select`/`SelectOrdinal` and marks every string inside one as
  visited, so shadcn's `<Select>` hid its contents from the rule through all three phases. The
  four call sites now import `Select as SelectRoot`, and a `no-restricted-syntax` rule bans the
  bare tag name. **Any new `<Select>` must use the alias**, and a green lint run is only
  meaningful because of that ban.
- **The extractor accepts a whitelist of first-argument forms**, not a blacklist: a string
  literal, a template with no substitutions, an object literal with a literal `message`, or a
  bare reference. It first enumerated the bad forms and fell through to accepting everything
  else, so `t(('a' + n))` passed in silence.
- **Two words spelled the same are not one message.** `View` was the noun in the columns menu
  and the verb in the row menu, and German could only pick one. An `en-US.json` index entry
  with more than one origin is the signal; `t({ message, context })` is the fix.
- **`ignoreFunctions` is an entry-point whitelist, not an argument matcher.** The plugin walks
  to the nearest ancestor call and recurses through a curried callee, so naming
  `createFileRoute` there would exempt every route's whole options object.
- **Exceeding a file's recorded suppression count makes ESLint report all of that file's
  violations for the rule**, not just the excess - so a partially migrated file that gains one
  string reads as wholly broken. P4's answer to a new machine string is to put it in a file the
  rule already exempts (`src/i18n/*.ts`) and export a constant, never to widen an `ignore`.
- **A boot error's `detail` slot is a content question, not a slot question.** A machine report
  (status, URL, JSON keys, stack) stays English; a sentence telling a human what to do is
  language. `lib/config.ts`, `lib/userMenu.ts` and `src/i18n/localeConfig.ts` are the first kind.
- **Translating the app's own thrown data-layer errors does not break the collector**, because
  it records a `server` miss only for an error whose `cause` carries a PostgREST `code`, and
  such a body always has its own `message`. Preserve that invariant: a thrower that attaches a
  `code` while keeping its own wording starts putting German into the tenant as untranslated
  "server" text.
- **A per-call `{ timeout }` LOWERS the browser project's 15s `asyncUtilTimeout`.** Four
  `findByRole` calls around CodeMirror carried `{ timeout: 5000 }` and failed the gate at random
  while passing alone. Removed in P4; do not add one back.
- Deviations accepted, with reasons in CONTEXT-MEMORY: the switcher names languages by endonym
  rather than `Intl.DisplayNames`; `activateLocale`'s `persist` is a three-state object
  (save / `null` clears / omitted leaves alone) because "Use browser default" needs all three;
  the lingui rule ignores test files and `src/i18n/*.ts`.

### Open, and owned by a later phase

- **The German validation messages are unit-verified, not browser-verified.** `ajv-i18n` is
  wired and renders correct German when driven directly, but no validation message could be
  provoked on the deployed preview - submitting an empty required form, and an over-length
  value, both left `aria-invalid` at `false` with no message. **This is identical in English**,
  so it is not an i18n regression, but it means the on-screen path is unproven and there may be
  a pre-existing defect in form validation display worth a separate look. Untouched by P4.
- `t('No {label} found.')` reads "Keine Kunde gefunden" where a reference declares no
  `plural_label`. The English has the same defect. P4 did not change the sentence; what it added
  is the channel to fix an instance of it - a tenant or an operator can now supply the missing
  `plural_label` as a `table` label override rather than editing the model.
- `useTable` and the three mutations append `response.statusText` to a now-German sentence.
  Untouched by P4: the concatenation is only reached when the response body carried no
  PostgREST `message`, which is also the branch `serverMessage` cannot help with.

## Decision

**Lingui's runtime only** (`@lingui/core` 2 KB, `@lingui/react` 1.7 KB, `@lingui/message-utils` ~5 KB gzip for the ICU compiler), used without its macros, Babel plugin, Vite plugin and CLI. It supplies ICU plurals and selects via `Intl.PluralRules`, a provider that re-renders on locale change, and a `<Trans>` component for rich text. Everything else is ours and small: a `t()` function, an extractor on the TypeScript compiler API, JSON catalogs.

Alternatives, in one line each: Lingui with macros (best ergonomics, costs a Babel pass over every file in `vite build` and both Vitest projects, plus hashed IDs that need source-text workarounds); FormatJS runtime (larger, same shape otherwise); i18next (plurals break "default in code"); Paraglide (key-based); Tolgee (a platform with seats and a server; agents in the repo have more context than its UI provides); hand-rolled ICU (where the bugs are).

## The API (`src/i18n/index.ts`)

```ts
const t = useT()                                  // inside components: subscribed to locale changes
import { translate, msg } from '@/i18n'           // outside React: routes' head(), lib/apiErrors.ts, main.tsx

t('Enter a valid email address')
t('Delete {label}?', { label: singularLabel })
t('{count, plural, one {# row} other {# rows}} selected', { count })
t({ message: 'Right', context: 'direction' })
<Trans id="Are you sure you want to delete <bold>{name}</bold>?" values={{ name }} components={{ bold: <strong /> }} />
const BUILT_IN_MENUS = [{ title: msg('Settings'), url: '/settings' }]   // rendered with t(entry.title)
```

- `t` and `translate` accept `string | MessageDescriptor` (`{ message, context?, comment? }`) plus values; `msg()` returns a `MessageDescriptor`, so a constant rendered without `t()` is a `tsc` error (an object is not a ReactNode) instead of silently shipped English. The runtime id of a message with context is the message text, the control character U+0004 (the gettext separator), then the context text; nobody types it. Ids of the other scopes are `scope + ':' + key`. `translatedKeys` and the reverse index are keyed by these ids; `obsolete` in a catalog file mirrors the `messages`/`contexts` sections instead.
- Two names on purpose: the module function cannot re-render a component when the locale switches, so components use the hook and the module function has a different name. A route file uses both: `translate` in `head()`, `useT()` in its component. Class components cannot call hooks and use `translate`: `ErrorBoundary.tsx`, `form/InputJson.tsx` (`JsonEditorBoundary`) and `niko-table/core/data-table-error-boundary.tsx`; they are the three allowed exceptions to the lint rule that bans `translate` under `components/**` (see Enforcement), a rule that exists because `DataTableHeader`, `DataTableToolbarSection` and the `DataTableEmpty*` components are `React.memo` and a `translate()` inside one would never update.
- `useT()` subscribes to the singleton's `change` event through `useSyncExternalStore`, so it works with or without `I18nProvider`; the provider is needed only by `<Trans>`. A component test that renders bare keeps working unless the component uses `<Trans>`, and `src/test/render.tsx` (RTL `render` wrapped in the provider) is the drop-in for those.
- Interpolation is ICU written by hand. The catalog test checks that every translation carries the same placeholders as its source.
- Never build sentences by concatenation or English morphology: replace `lib/apiErrors.ts` `singularize()`/`capitalize()`, the four `.toLowerCase()` on model labels (`View.tsx:448`, `api-select.tsx:393`, `InputReference.tsx:32`, grid search placeholder) and `${multiple ? 's' : ''}` in `table-filter-menu.tsx:1355,1359,1367` with ICU messages. Model labels are inserted as given.
- Do not wrap format examples (`InputUuid`, `InputIpv6`, ... placeholders such as `192.168.1.1`) or identifiers; the ESLint `ignore` list names them.
- Exports: `i18n` (the `@lingui/core` singleton), `t` via `useT`, `translate`, `translateDynamic`, `msg`, `activateLocale`, `resolveInitialLocale`, `availableLocales()`, `translatedKeys(locale): ReadonlySet<string>`.
- Compilation is lazy and memoized: `i18n.setMessagesCompiler` wraps `compileMessage` in a `Map` cache, so a string is compiled once on first use and a string added to code before the next extraction still interpolates. No precompile step, no index needed at runtime. The wrapper catches a compile failure (a malformed operator file, a bad row typed into the grid), warns once, and falls back to the source text, so no catalog content can crash `t()`.

## Catalogs

One JSON shape for the repo catalog, the deployment file, the translate-mode export and the table rows. Sections are optional; which ones are allowed depends on where the file lives:

```json
{ "locale": "de-DE", "name": "Deutsch",
  "messages":  { "Save": "Speichern", "Delete {label}?": "{label} löschen?" },
  "contexts":  { "direction": { "Right": "Rechts" } },
  "labels":    { "tables": { "accounts": { "singular_label": "Konto", "plural_label": "Konten",
                   "columns": { "status": { "title": "Status", "enum": { "active": "Aktiv" } } } } },
                 "modules": { "crm": { "name": "CRM" } } },
  "server":    { "Order must have at least one line": "Ein Auftrag braucht mindestens eine Position" },
  "rule":      { },
  "obsolete":  { "messages": { "Old wording": "Alte Übersetzung" }, "contexts": { } } }
```

Section ↔ table scope: `messages` and `contexts` ↔ `message` (with `context`), `labels` ↔ `table`/`column`/`enum`/`module`, `server` ↔ `server`, `rule` ↔ `rule`; `obsolete` exists only in repo catalogs.

- `src/locales/de-DE.json` (repo, hand-maintained): `messages`, `contexts`, `obsolete` (a nested `{ messages, contexts }` of removed entries). `labels`, `server` and `rule` are rejected by the catalog test: they are tenant or deployment data. An empty string is a gap.
- `src/locales/en-US.json` (repo, **generated**, committed like `routeTree.gen.ts`) has its own shape and schema: `{ "locale": "en-US", "index": { "<runtime id>": { "message", "context"?, "origin": [...], "placeholders": [...], "comment"? } } }` with origins as sorted file paths, no line numbers. Agents read it for context; translate mode reads it for the full list. Never hand-edited, and never loaded as a catalog: the repo layer globs `['../locales/*.json', '!../locales/en-US.json']`.
- Deployment file (`public/locales/<code>.json`): `locale`, `name`, `messages`, `contexts`, `labels`, `server`, `rule`. Table rows: the same content, one row per item (see Tenant table). The translate-mode export carries every section. `public/locales/schema.json` describes the shape; a node test validates shipped files and fixtures with Ajv.
- `apps/web/scripts/i18n/extract.mjs`: walks `src/**/*.{ts,tsx}` minus tests with the TypeScript compiler API (`typescript` is already a devDependency; `@babel/parser` is not resolvable from `apps/web`), collects `t(`, `translate(`, `msg(` calls with a string literal or an object literal with a literal `message`, and `<Trans id="...">`; **fails** on a template with expressions, a conditional or a concatenation as first argument, so a key can never silently miss the index; an identifier or member expression (`t(entry.title)`, `t(config.label)`) passes, because its `msg()` site is extracted and an operator's plain string is the deployment-file path. Output is deterministic. Extraction adds new keys to every locale file with `""`, moves removed keys to `obsolete`, never touches existing values. `status.mjs` prints per locale: total, translated, missing with origins, obsolete; `extract --prune` empties `obsolete`. Package scripts `i18n:extract`, `i18n:status`.
- Changing a source string is one edit in code; its translations move to `obsolete` at the next extraction and the new key is missing until translated. Accepted, and visible through every discovery channel below.
- A PR that adds or rewords a source string fills its `de-DE.json` entry in the same PR, and `i18n:status` prints 0 missing before merge; the catalog test only reports, so this is a working rule recorded in CONTEXT-MEMORY, not a gate. The only path from an in-app translation of a code string back to the repo is `dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE --messages-into src/locales/de-DE.json`, which copies tenant `message` rows into empty repo entries for review in a PR.

## Discovering missing translations

1. The file: after `i18n:extract`, every open key in `de-DE.json` has an empty value; `git diff` shows the new ones.
2. `pnpm i18n:status` for the repo catalogs, and the same count printed by the catalog test in `pnpm check` (not failing, per the fallback decision); `dotenvx run --quiet -- node apps/web/scripts/i18n/status.mjs --tenant --locale de-DE` (P4) adds the tenant's queue and the label inventory, reading the tenant the way the scripts under Automation do (a package script cannot: it runs from `apps/web` without the root `.env`).
3. In the app, "Mark missing translations": in translate mode `t()` records `rendered text → Set<runtime id>` into a live reverse index for the active language (two keys can render identically), so text nodes and `aria-label`/`placeholder`/`title` attributes produced by our own function are resolved exactly, translated or not, interpolated or not. Ids outside `translatedKeys(locale)` are highlighted with the CSS Custom Highlight API (outline fallback where unsupported); attribute hosts get an outline. No DOM mutation, so accessible names and existing tests are untouched. A `MutationObserver` scoped to `#root` and throttled keeps it current.
4. The translate-mode panel: filters "missing" and "on this page", each entry with source, origin and an edit box.
5. Plain use: a missing string renders in English.
6. The queue: every miss the running app encounters, code string, model label or runtime message, is recorded as an empty-translation row (see "Runtime messages and the missing-message queue"), so nothing depends on someone noticing.

### Model labels: discovering what a new entity needs

Model labels are data, so the extractor and the index never see them. Their inventory comes from the model itself, and "missing" is a label present in the model with no row (or deployment-file entry) for `(locale, scope, key)`:

- **Source of the inventory:** three PostgREST reads: `tables?select=table_name,singular_label,plural_label,description,updated_at` (the view `NavApps.tsx:47` already reads; same columns as `entities`), `fields?select=table_name,field_name,title,description,enum_values,relationship_label,singular_label_parent,plural_label_parent,updated_at`, `modules?select=module_slug,module_name,description,updated_at`; `tables` exposes `description` and `updated_at` (verified with curl), and that a non-admin token can read `fields` and `modules` is part of the pre-P4 curl check. `src/i18n/labelInventory.ts` (pure, node-tested) turns those rows into label keys and diffs them against the labels layer, in both directions: labels with no row are missing, rows whose key no longer exists in the model (a renamed table, field or enum value) are orphaned.
- **In the app:** in translate mode `tableLabel`/`enumLabel` also record into the reverse index, so an untranslated label is highlighted wherever it renders (page heading, sidebar entry, breadcrumb, column header, enum badge) and is editable in place. The panel's "Model labels" tab shows the current entity by default and a "whole model" view built from the inventory, with "missing only", "orphaned" (deleting is a translator's action), "newest first" (model `updated_at`), and "changed since translated" (per row: the model's `updated_at` later than the row's `updated_at`, or no row at all). While translate mode is on, the Language submenu shows the missing count.
- **For agents and operators:** `dotenvx run --quiet -- node apps/web/scripts/i18n/labels.mjs --locale de-DE [--file public/locales/<code>.json]` reads the same inventory, prints the missing and the orphaned label keys with their English text, and writes a skeleton (`labels` section, English defaults, empty values) for an agent to fill; `import.mjs` writes the result back as rows, or an operator pastes it into the deployment file. The translation guide names it as the step after any model change: an agent that just created an entity or a field runs it next.

### Runtime messages and the missing-message queue

Some messages exist neither in code nor in the model inventory: a validation rule authored in the model (`entities.validation_rules`, JSON Logic) raises its message in the backend, PostgREST and RPC functions return messages of their own, and a future client-side rule evaluation would produce text at runtime. The app cannot know these in advance, so it **collects what it fails to translate and stores it as work**:

- **Interception:** API errors reach the user through `ApiErrorDisplay`, `formatDeleteError`, and five sites that render `error.message` directly today (`ApiKeysCard.tsx:206,302`, `_app.$moduleId.index.tsx:94`, `niko-table/core/data-table-error-boundary.tsx:124`, `ErrorPage.tsx:36`, `CustomerForm.tsx:266`); all of them route the text through `translateDynamic(text, { scope: 'server', origin, code })`, where `code` is the PostgREST code read from `error.cause` and the known-code table lives in `lib/apiErrors.ts`. Known PostgREST codes keep their app-authored `t()` messages (the foreign-key sentence with model labels). Anything else is looked up **verbatim** and never ICU-compiled (server text may contain braces) in a `dynamic` map held by `catalog.ts`, keyed `scope + ':' + key` and filled in layer order from the deployment file's `server`/`rule` sections, the tenant rows and drafts; rendered translated if present, raw otherwise. Client-side rule output, when it arrives, uses the same call with `scope: 'rule'`.
- **Collector (`src/i18n/missing.ts`):** `t()`, the label helpers and `translateDynamic` report every miss as `{ locale, scope, key, context, origin }` (origin = current route, or the rule or RPC name). A `server` miss is recorded only for an error whose `cause` carries a PostgREST `code` outside the known-code table (`useTableMutations` attaches it, and so does `callRpc` in the pending `apiClient.ts` change), so `Failed to fetch`, `Authentication token is required` and other app-thrown English strings never become rows. Misses in scopes `message`, `table`, `column`, `enum` and `module` are recorded for every locale except the source `en-US`, whose text is by definition already English; misses in `server` and `rule` are recorded for every locale including `en-US`, because a runtime message is authored in the tenant's language, which may not be English. Keys longer than 500 characters are dropped. The collector dedupes per session, batches (each batch well under the 64 KB `keepalive` body limit), and flushes on a debounce and on `visibilitychange` with `fetch(..., { keepalive: true })`, so the last batch survives a closing tab. It is off in `setup.browser.ts` and enabled per test, so the suite's real API errors under `en-US` do not write rows to the tenant.
- **Storage:** the same `ui_translations` table, as rows with `translation = ''`. The request is `POST /ui_translations?on_conflict=locale,scope,key,context` with `Prefer: resolution=ignore-duplicates, return=minimal` and a body of `[{ locale, scope, key, context, translation: '', origin }]`; `requested_by` is never sent, a trigger fills it. `ignore-duplicates` means a request can never overwrite an existing translation. Rows carry `origin`, `first_seen` and `requested_by`, so who met a message first and when is on the row, and `updated_by` records who translated it. On a deployment without the table the collector keeps requests in `localStorage['semantius-i18n-requests:<code>']`, the panel lists them, and the export writes them as empty entries.
- **The queue:** `GET /ui_translations?translation=eq.&locale=eq.de-DE` is the work list, one row per missing item, with its scope, its origin and, for messages, the source text as the key. It unifies the three discovery paths: catalog gaps, label inventory and runtime misses all end as rows here.
- **Automation:** `dotenvx run --quiet -- node apps/web/scripts/i18n/translate.mjs --locale de-DE` drains the queue: it reads the empty rows plus the catalog gaps and the label inventory, skips `message` rows already translated in the repo layer, and writes `apps/web/.i18n/work-de-DE.json` (git-ignored): the `en-US.json` index shape plus a `translation` per entry, grouped by scope, described by `public/locales/work.schema.json`. `message` entries become rows as well as `de-DE.json` entries, so the tenant is translated before the next deploy; for a locale without a repo catalog they become rows only. After an agent fills it, `dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale de-DE` validates the file (schema; ICU compile and placeholder check for `message` and label scopes only), refuses it on any failure, writes the translations back as rows, deletes request rows whose key is now translated in the repo layer, and writes code-string translations into `src/locales/de-DE.json`. All tenant-facing scripts (`status --tenant`, `labels`, `translate`, `import`, `export`) resolve the tenant's PostgREST URL as `scripts/a11y-audit/run.mjs:77-81` does (`GET https://api.semantius.cloud/organization/<VITE_CONTROL_PLANE_ORG>` → `postgrest_url`) and mint a token the way `scripts/mint-token.mjs` does; where there is no control plane (self-hosted) they take `SEMANTIUS_TOKEN` and `--api-url` instead. A scheduled run (a CI cron or a scheduled agent) is the trigger; a platform-side trigger on insert to a webhook receiver can make it near-real-time later. The translation guide is the agent's brief; the work file names the origin of every entry so the agent has context.
- **Worked example:** a German user saves an order and the backend rejects it with the model-authored rule message "Order must have at least one line". The error card finds no entry for `server:Order must have at least one line`, shows the English, and records the miss with origin `/sales/orders`; the trigger stamps the user as `requested_by` and the time as `first_seen`. From then on it is visible three ways: in translate mode as a count in the Language submenu and an entry under "requested", clickable in place when the card is on screen; in the admin module's Translations grid filtered on empty translation; and in `status.mjs --tenant --locale de-DE` and the `translate.mjs` work file. If nobody acts, the scheduled run translates it and the next German user sees German. A runtime message is discoverable only after it has occurred once for any user, while code strings and model labels are listed before any user meets them.
- **Safety:** server messages may embed data values. The code filter, the 500-character cap, dedupe and the `origin` column keep the queue bounded and reviewable; the panel's "requested" filter shows what the app has asked for, and a translator can delete a row that is data rather than a message.

## Locale resolution, persistence, boot order

- **Two preferences, resolved separately.** `language` selects the catalog (`de-DE`); `locale` drives every `Intl` call, date-fns, `Intl.DisplayNames` and `localeCompare` (`de-CH`). Lingui only ever sees `language`: `i18n.loadAndActivate({ locale: language, messages })`, never its `locales` option, because Lingui feeds `locales` to `Intl.PluralRules` as well and an English UI with Russian formats would pick Russian plural categories. The formatting locale is `src/i18n` module state behind `formattingLocale()` / `useFormattingLocale()`; the cost is that `#` inside an ICU message formats per language, which is acceptable. `<html lang>` and `dir` follow `language`. Each preference falls through its sources independently: a cached language with no cached locale takes the browser's locale.
- **Resolver.** `resolveInitialLocale(): { language, locale, languageSource, localeSource }` with `Source = 'session' | 'cache' | 'operator' | 'browser' | 'default'`, so the switcher knows which entry is checked and whether a value is a placeholder. A cached or session language that is not available (preview origins share `localStorage` across tenants) counts as absent.
- **Sources, in precedence order.** (1) The session: `get_userinfo` returns `language` and `locale` once the platform adds them (columns on `users`, see the platform pieces under Tenant table); the OIDC userinfo `locale` claim (`UserInfo` is open-typed; read it as a string and match it like `navigator.languages`) is consulted only when both are null or absent. (2) The per-browser cache, `localStorage['semantius-ui-language']` and `['semantius-ui-locale']`. It mirrors the session once `get_userinfo` carries the fields: a non-null value is written, `null` removes the key, an absent field leaves it; the switcher writes it too. So the pre-login boot already paints the last known choice, and a "browser default" chosen on another device is not overridden by a stale key. (3) The operator's `locales.default` from the customizer (language only). (4) The browser placeholder: `navigator.languages` matched to an available language, exact first, then by language subtag (`de-AT` → `de-DE`); `navigator.language` as the formatting locale. (5) `en-US`. A placeholder is not a preference: the switcher shows it as "Browser default (Deutsch)" and "Browser default (de-CH)", and only an explicit choice is saved; "Use browser default" clears the saved value again.
- **Naming.** In catalogs, files, rows and `translatedKeys(locale)`, `locale` means the catalog language (`de-DE`), as it always has; the formatting locale exists only in the session, the cache, `i18n.locales` and `useFormattingLocale()`.
- **Write-back.** The switcher saves to the session through the platform's `set_user_preferences({ language, locale })` RPC and to the cache; where the RPC does not exist yet (definitive `PGRST202` body), it saves to the cache only, which is today's behavior and what P1 ships with. Available languages = built-in ∪ deployment files from the customizer ∪ locales present in the tenant rows (after login, derived from the paged read; PostgREST has no `distinct`).
- Resolution runs twice: built-in only before `initConfig()` (so `BootFailure` is translated), then in full once the customizer and, after login, the session preference and the tenant rows are known. A tenant-only language therefore paints English first and switches after login; accepted. **Boot passes never persist a resolved value**; the switcher writes the cache keys and the session, and the only other write is the session mirroring into the cache, so a cached tenant-only `fr-FR` survives the built-in-only first pass instead of being overwritten with `en-US`.
- `activateLocale({ language, locale }, { persist })`: merge the layers dropping empty values (Lingui treats `""` as a present translation, so a gap must be absent for the fallback to apply), `i18n.loadAndActivate({ locale: language, messages })` and the formatting locale into module state (it **replaces** the locale's table, so clearing a draft or resetting takes effect; raw strings, compiled lazily), `document.documentElement.lang` and `dir`, sets `catalog.ts` label state and the `dynamic` map from the same merge (P1: messages only), persist only when the switcher asks. It never touches the router (`src/i18n` cannot import the router from `main.tsx` without booting the app in every test). Callers that switch at runtime follow it with `router.invalidate()`: `NavUser` through `useRouter()`, `TranslationsPrefetch` through a `router` prop from `main.tsx`, because it is mounted beside `SidebarPrefetch` outside `<RouterProvider>` where `useRouter()` is undefined (`AuthProviderWrapper router={router}` and `RouterContextUpdater` already work that way; `appHarness.tsx` passes its own router) so every route's `head()` re-runs and `document.title` follows (verified in `@tanstack/router-core`: a `shouldReload: false` loader re-runs and `head` runs with it; never `location.reload()`, the browser tests would lose their frame). Boot needs no invalidation. Only translate-mode Save uses the merging `i18n.load(locale, { [id]: text })`. Text already captured into React state stays in the old language until it is produced again (`validateField` errors, the `_validationError` banner, toasts already shown); accepted. An open Sheet survives `router.invalidate()` (`SchemaForm` does not reset on a new `schema` prop).
- `main.tsx`: `applyDevUrlToken()` → `activateLocale(resolveInitialLocale()).catch((e) => console.warn('[i18n]', e))` → `initConfig()` → `activateLocale(resolveInitialLocale())` again, now with the deployment files known → `root.render`, all inside the existing promise chain whose `.catch` calls `hideAppLoader()`, so an i18n failure can never leave the overlay up. `<I18nProvider i18n={i18n}>` sits directly inside `<StrictMode>`, above `ThemeProvider`. The provider renders `null` until a locale is active, which under the boot overlay would be a hang: every path activates a built-in locale before render, and a failed fetch logs and keeps the built-in one.
- Tenant rows load in `TranslationsPrefetch`, a render-nothing component next to `SidebarPrefetch` in `main.tsx` (outside the `ProtectedRoute` gate, so nothing waits on it and the overlay invariant is untouched). Like `SidebarPrefetch` it reads through the generic `useTable` hook, exactly as the repo rule requires (see "Data access" below), gated on the token; a row edited anywhere through the generic mutation hooks invalidates its key, so the running app picks the change up. It treats an error whose `cause.code` is PostgREST's own `42P01` or `PGRST205` (table absent, definitive) as "no tenant layer", never a status alone; the cold-start 404 is handled by the fetch interceptor before the hook ever sees it. A tenant still cold after the interceptor's budget leaves the layer empty until the next `['table', 'ui_translations']` invalidation, reconnect or reload; accepted. A `useEffect` on `[data, rpcUserInfo, userInfo, router]` calls `activateLocale(resolveInitialLocale())`, which now sees the session preference and the tenant's locales and so reaches a saved or cached tenant-only preference, and then `router.invalidate()` on its `router` prop; both are idempotent, so StrictMode's double effect is harmless.
- `index.html` inline script: mirror the theme script and set `<html lang>` from `localStorage['semantius-ui-language']` only, before first paint (with an operator default and no cached key the first paint is `lang="en"`; a stored tenant-only preference paints `lang="fr-FR"` only until the first pass activates `en-US`, and `fr-FR` returns after login; both accepted).
- Switcher: `NavUser.tsx` gets a `DropdownMenuSub` "Language" (`DropdownMenuRadioGroup` of available languages, each named by `new Intl.DisplayNames([code], { type: 'language' }).of(code)`, a configured `name` wins) inserted after the config-driven group closes (L201) and before the separator above "Log out". Its first entry reads "Browser default (Deutsch)", or "Default (Deutsch)" when the operator default applies, and is checked whenever `languageSource` is neither `session` nor `cache`. A second `DropdownMenuSub` "Number and date format" holds "Browser default (de-CH)" and "Same as language (de-DE)", the two cases that occur in practice; "Same as language" is stored as the concrete tag and is checked iff `locale === language`, and the language handler keeps it in step by writing `{ language: next, locale: locale === language ? next : locale }`; plus, in P5, checkbox items "Mark missing translations" and "Translate mode". `DropdownMenuSub`, `RadioGroup` and `CheckboxItem` exist in `ui/dropdown-menu.tsx`.

## Where translations live

| Who | English labels | Translations |
| --- | --- | --- |
| The repo | in code | `src/locales/<code>.json` |
| Self-hosted operator, one tenant per deployment | the model tables, as today | `locales/<code>.json` next to the deployed app, registered in the customizer |
| Cloud customer, shared deployment | the model tables, as today | the `ui_translations` table in the tenant database |
| A user trying things | n/a | browser-local drafts until saved or exported |

Operator menu titles from `VITE_UI_CUSTOMIZER` are plain strings; they are translated through the deployment file's `messages`, not the repo catalog. Documented in the README.

### Layers and the writer (`src/i18n/store.ts`)

Loading is an ordered list of layers, each `load(locale): Promise<LocaleFile | null>`: repo catalog (lazy `import.meta.glob`, index excluded) ← deployment file (fetch by absolute URL: `apiClient.ts:44` rewrites `/`-relative `fetch` calls to the API base with a bearer token; require `content-type: application/json`, the SPA fallback answers a missing file with HTML 200) ← tenant rows ← drafts (`localStorage['semantius-i18n-draft:<code>']`). `translatedKeys(locale)` is the union of non-empty keys across layers. Exactly one **writer** is chosen by capability: the tenant table when it exists and `rpcUserInfo.permissions` contains `translations.edit`; otherwise drafts plus "Download `<code>.json`" (the full merge, which also lists every index key and every inventory label with an empty value where untranslated, so a fresh locale exports a complete work list). Operator files are read-only from the app. "Reset" clears drafts and reloads the layers. Separate from the writer, the store exposes `request(locale, entries)` for the collector: rows on the tenant, localStorage otherwise. A later platform-side label channel would be one more layer.

### Terminology overrides in `en-US`

A tenant can replace the English wording too, "Customer" → "Patient", through the same layers: a row with `locale = 'en-US'` (or an `en-US.json` deployment file) overrides a code string or a model label for every English user of that tenant, because `activateLocale` merges the `en-US` layers over the source text like any other language. For a model label the model itself is the primary place, since renaming `singular_label` there changes every screen in every language; an `en-US` label row is for a tenant that must keep the model's term but wants another word shown. In `en-US` translate mode offers "override" instead of "missing": nothing is missing in the source language, so marking is off and the collector records no `message` or label misses (it still records `server`/`rule`), while click-to-edit through the reverse index works as in any language.

### Deployment file (operators)

Location: `apps/web/public/locales/<code>.json` ships verbatim into `dist/`. The Cloudflare preview and any Workers deployment serve exactly the repo's `public/locales/`; the nginx image serves `/usr/share/nginx/html/locales/`, where an operator mounts a volume or copies files. `docker/nginx.conf` gets `location /locales/ { add_header Cache-Control "no-cache" always; try_files $uri =404; }` between the `/assets/` block and the SPA fallback. Registration extends the existing customizer JSON, no new `VITE_*` var: `{"user":{...},"locales":{"default":"de-DE","available":[{"code":"fr-FR","name":"Français","url":"/locales/fr-FR.json"}]}}` (`url` defaults to `/locales/<code>.json`; in `docker/.env` the JSON must stay on one line, the parser is line-based). New pure `src/i18n/localeConfig.ts` (`resolveLocales(parsed)`) called from `applyUiCustomizer` in `lib/config.ts` (it moved out of `lib/` so the lingui rule's `src/i18n/*.ts` exemption covers its operator diagnostics - see Deviations). Today `resolveUserMenu` parses the JSON only when `VITE_BACKEND_TYPE=custom`: split into `parseUiCustomizer(raw)` (always) + `resolveUserMenu`, with `user.menu` mandatory only for `custom`. Starting a new language: register an empty `fr-FR.json` so the locale becomes switchable; the complete work list is `labels.mjs --file public/locales/fr-FR.json` plus the keys of `src/locales/en-US.json` (P4), and from P5 on the export download. Not possible through the file, and said so in the README: no queue rows (requests stay in localStorage while there is no table), no in-app save (drafts plus download), no "changed since" (no `updated_at`), no `obsolete`.

### Tenant table (customers)

One row per translated item, so the app's own grid edits it, translate mode saves single rows without read-modify-write races, and an agent writes it through PostgREST like any other table.

```sql
create table ui_translations (
  id          bigint generated always as identity primary key,
  locale      text not null,                       -- BCP-47, e.g. 'de-DE'
  scope       text not null default 'message'
              check (scope in ('message', 'table', 'column', 'enum', 'module', 'server', 'rule')),
  key         text not null,                       -- message: the source text
                                                   -- table:  'accounts.plural_label'   column: 'accounts.status.title'
                                                   -- enum:   'accounts.status.active'  module: 'crm.name'
  context     text not null default '',            -- message context, '' when none
  translation text not null default '',             -- '' = requested, not yet translated
  origin      text,                                  -- where the app first met it: a route, a rule, an RPC
  requested_by text,                                 -- who met it first; set by a trigger from the JWT, like user_bookmarks.user_id
  first_seen  timestamptz not null default now(),   -- when
  updated_by  text,                                  -- who translated it last; set by a trigger
  updated_at  timestamptz not null default now(),   -- set by a trigger on update
  unique (locale, scope, key, context)
);
```

This is the only new table. `tables`, `fields` and `modules` are read as they are; drafts are browser storage. There is no `last_seen` or sighting count on purpose: requests are inserted with `ignore-duplicates` so they can never overwrite a translation, which also means a repeat sighting never touches the row. Counting sightings would need an event table or an RPC that increments, and is deferred until the queue proves noisy.

- Semantic-model registration (so the grid renders it and permissions apply): entity `ui_translations` in the `admin` module, singular "Translation", plural "Translations", `id_column: id`, `label_column: key`, `scope` as an enum field, `requested_by`, `first_seen`, `updated_by` and `updated_at` read-only, `edit_permission` set to a dedicated `translations.edit` permission; every authenticated user may read.
- Platform pieces, all in the same migration: a `before insert` trigger that sets `requested_by` from the JWT when `translation` is empty (type and default as `user_bookmarks.user_id`); a `before update` trigger that sets `updated_at` and `updated_by`; policies: insert allowed when `translation` is empty and `requested_by` is the caller, **or** when the caller holds `translations.edit` (an upsert with `merge-duplicates` is an insert first, and a translator's plain insert carries a non-empty translation); update and delete need `translations.edit`.
- Session preference, same migration: `language` and `locale` columns on `users` (nullable; null means "browser default"), returned by `get_userinfo`, and a `set_user_preferences(language, locale)` RPC that updates the caller's own row. The app probes neither: it reads the two fields when present and treats a definitive `PGRST202` on the RPC as "not available yet".
- **Prerequisite, outside this repo:** that migration (table, triggers, policies, permission, the `users` columns and the RPC) lands in the platform (`semantius-cloud` and the self-hosted stack) and is applied to the test tenant, whose API-key principal holds `translations.edit`, before P4's table tests run; until then those tests skip with a message naming the missing table, and the store disables itself on tenants without it.
- Reading: the paged, `translation=neq.` query under `TranslationsPrefetch`, grouped by locale; empty translations are listed by the panel through the queue query. `translation=eq.` and `neq.` with an empty value after the operator are valid PostgREST; confirmed once with curl per the API Testing Workflow before P4 starts. Writing a translation: `POST /ui_translations?on_conflict=locale,scope,key,context` with `Prefer: resolution=merge-duplicates`, one row per save, through `useCreateRecord`'s new `onConflict` option. Recording a miss: the request described under Storage. All paths are listed under "Data access".
- The file ↔ rows mapping is a pure function (`src/i18n/localeFile.ts`): `messages` ↔ `scope='message'`, `contexts` ↔ `context`, `labels` ↔ the four label scopes, `server` ↔ `server`, `rule` ↔ `rule`. `apps/web/scripts/i18n/export.mjs` and `import.mjs` move a whole language between file and table, resolving the tenant as described under Automation. Browser tests write rows under a `locale` value reserved for the run (`xx-TEST`) and delete them in `afterAll`.

## Data access: how the database is read and updated

Every access goes through PostgREST with the session's bearer token, and every app-side access goes through the generic hooks in `hooks/useTable.ts`, `hooks/useTableMutations.ts` and `hooks/useRpc.ts`, per the repo rule against table-specific hooks. Every `fetch` passes the interceptor in `lib/apiClient.ts`, which applies the retry policy of `lib/retry.ts` (reads retry, writes never, a bare 404 under the API base is a cold start, a PostgREST body code is definitive).

| Operation | Who | Mechanism |
| --- | --- | --- |
| Load the tenant layer at login | `TranslationsPrefetch` | `useTable('ui_translations', { query: 'select=locale,scope,key,context,translation&translation=neq.&order=id.asc&limit=1000', count: true, enabled: !!token })`; when `totalCount` exceeds the page, the same hook with `offset` per further page. Key `['table', 'ui_translations', query, true]`; the client's `refetchOnMount`/`refetchOnWindowFocus: 'always'` defaults stay, and the activation effect keys on `data` identity, which TanStack Query keeps stable for unchanged rows, so a focus refetch that returns the same rows re-activates nothing. |
| Load the queue for the panel | translate-mode panel (P5) | `useTable('ui_translations', { query: 'select=*&translation=eq.&locale=eq.<code>&order=first_seen.desc' })`, fetched when the panel opens. |
| Save a translation (translate mode, panel, model-labels tab) | the writer, users holding `translations.edit` | `useCreateRecord('ui_translations', { onConflict: ['locale', 'scope', 'key', 'context'] })`, a new **generic** option that appends `?on_conflict=…` and sends `Prefer: resolution=merge-duplicates,return=representation`; one row per save; its `['table', 'ui_translations']` invalidation refreshes the layer. |
| Edit or delete in the grid | admins in the admin module | unchanged: `DataTableView` with `useUpdateRecord` / `useDeleteRecord`; the same invalidation refreshes the layer. |
| Record misses | the collector, any authenticated user | outside React, so a direct `fetch('/ui_translations?on_conflict=locale,scope,key,context', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(batch), keepalive: true })`; the relative URL makes the interceptor add the token and the base URL; writes are never retried and need not be, the insert is idempotent. No invalidation: a request changes no translation, and the panel reads the queue when opened. |
| Read the preferences | `AuthContext` | already in `rpcUserInfo` from `get_userinfo`; the OIDC `locale` claim in `userInfo`. |
| Save the preferences | the switcher | `useRpcMutation('set_user_preferences')`; on success the cache and module state are updated directly (`AuthContext` exposes no refetch; the next boot reads the row). A definitive `PGRST202` disables the write-back for the session. |
| Scripts (`status --tenant`, `labels`, `translate`, `import`, `export`) | agents, operators, CI | Node `fetch` against `<postgrest_url>` with `Authorization: Bearer <minted token>`, the same query strings and `Prefer` headers, paging with `offset`; the model inventory reads `tables`, `fields`, `modules` the same way. |

Permissions are enforced by the platform's policies and mirrored in the UI: everyone authenticated reads; everyone inserts empty-translation rows for themselves; `translations.edit` updates, deletes and upserts, and both the writer and the translate-mode toggles are offered only when `rpcUserInfo.permissions` contains it (`admin` where the permission does not exist yet). After the migration the platform reloads PostgREST's schema cache (`refresh_schema_cache`, the RPC `lib/apiClient.ts` already calls after model changes), otherwise the new table answers `PGRST205` until the next reload.

## Model-label overrides

- Label keys, one per model attribute: table `<table>.singular_label|plural_label|description`; column `<table>.<field>.title|description|relationship_label|singular_label_parent|plural_label_parent` (the `ChildRelation` labels in `types/metadata.ts:69-79`); enum `<table>.<field>.<value>` for each entry of `fields.enum_values`; module `<slug>.name|description`. The same keys name the rows, the `labels` section of a file, and the inventory.
- Metadata is loader data, not a TanStack Query entry (`_app.$moduleId.$table_name.tsx:21-38`); only the parent schema (`View.tsx:207`) and the palette lists are queries. Overrides apply at render, never in a loader or by mutation: `localizeMetadata(meta, labels)` (`src/i18n/labels.ts`, pure) returns a new `EntityMetadata` with `table.*_label`/`description`, `properties[k].title`/`description`, the child-relation labels, and a new optional `properties[k].enum_labels` (`src/types/metadata.ts`, the only consumer-facing slot, which a server-side channel would fill later); `enumLabel(property, value) = enum_labels?.[value] ?? value`; `tableLabel(labels, table, field, fallback)`; `getModuleDisplay(module, override?)` in `contexts/AuthContext.tsx`.
- Label state lives in `src/i18n/catalog.ts` as module state with `subscribe` (alongside the `dynamic` map for `server`/`rule`); a change to either also emits the `i18n` `change` event, so `useT()` consumers re-render after a translate-mode save into the `dynamic` map; `useLocaleLabels()` = `useSyncExternalStore`; `useLocalizedMetadata(meta)` memoizes on `[meta, language, labelsVersion]`.
- Choke points: the route component in `_app.$moduleId.$table_name.tsx` (localized metadata passed as the `metadata` prop, so `View`, `DataTableView`, `SchemaForm`, `DataFormPage`, `ConfirmDeleteDialog`, `ViewSkeleton`, `api-select`/`InputReference` inherit it), `View.tsx:207`, `NavApps.tsx:119`, `CommandPalette.tsx:225-229`, `EntityBreadcrumb.tsx:50`, `ModuleSwitcher.tsx:48`, `_app.$moduleId.index.tsx:69`, `_app.index.tsx:99`; enums at `components/data-table-view/DataTableView.tsx:732` (filter options), `:805` (Badge text; the variant keeps comparing raw values), `InputEnum.tsx:137,178` (display label; `CommandItem value` stays raw with `keywords={[label]}`).
- `head()` reads `tableLabel(currentLabels(), ...)` synchronously and re-runs on `router.invalidate()`. To make that network-free, the `get_schema` loader moves onto the QueryClient (`ensureQueryData` with the key `useRpc` already uses and `staleTime: Infinity`), which needs `queryClient` on the router context (`__root.tsx`, `main.tsx`, both routers in `appHarness.tsx`).

## Formatting and third-party text

- `formatNumberForDisplay` / `formatDateForDisplay` / `getNumberSeparators` receive the formatting locale (`useFormattingLocale()`, never the catalog language) at their call sites (`components/data-table-view/DataTableView.tsx:818,824`, `ui-ext/number-input.tsx:62`); fix the hard-coded `en-US` in `niko-table/lib/format.ts:8`; route the ad-hoc calls through the helpers: `ApiKeysCard.tsx:151,155` (`toLocaleDateString()`), `table-range-filter.tsx:44` (`toLocaleString(undefined, …)`). `charts/CustomTableChart.tsx` renders inside drizzle-cube and is left alone.
- date-fns: `src/i18n/dateFnsLocale.ts` maps the formatting locale to a lazy `date-fns/locale/<code>` import (falling back to its language, `de-CH` → `de`); `ui-ext/localized-calendar.tsx` supplies `locale` and translated `labels` to `ui/calendar.tsx`, used by both `ui-ext` pickers and the two calendars in `table-filter-menu.tsx`; the pickers' `format(date, 'PPP')` gets `{ locale }`.
- Validation text: `validateData()` in `packages/sem-schema/src/api.ts:65` already returns raw Ajv `ErrorObject[]` with `keyword`, `params` and `instancePath`, and `SchemaForm.validateField` (lines 172-179) consumes them. `ajv-i18n` runs over that array in the app (`localize[lang](errors)` keyed by the language subtag, `de` for `de-DE`; ~30 languages, MIT); no sem-schema change. The app's own messages (`SchemaForm.tsx:150,178,333`, sem-schema's `must not be empty`) and the custom `precision`/`inputMode` keywords get `t` messages. Unsupported languages fall back to English.
- `<Toaster closeButtonAriaLabel={t('Close toast')}>`; `ui-ext/sortable.tsx` announcements via `t`.
- CLI-owned `ui/` strings that stay English unless forked: `breadcrumb.tsx` ("More", `aria-label="breadcrumb"`), `dialog.tsx`/`sheet.tsx` sr-only "Close", `sidebar.tsx` "Toggle Sidebar"/"Sidebar". `command.tsx` title/description are default props already overridden by the `ui-ext/command-dialog.tsx` fork.
- `src/charts/**` (our chart override rendered inside drizzle-cube) is ignored by the lint rule with a comment naming the boundary.

## Translate mode

- Toggles in the Language submenu, stored in `localStorage`, shown only to users holding `translations.edit` in `rpcUserInfo.permissions` (the migration grants it to the admin role; tenants extend it to translator roles through the existing roles-to-permissions model); on a deployment without the table or the permission, `admin` gates the toggles and edits stay local drafts plus export. Both toggles load `src/i18n/translateMode/` lazily, which imports the `en-US.json` index for the full list.
- Marking and click resolution use the render-time reverse index described under Discovery. Clicking a highlighted text or outlined element opens a Base UI Popover editor: source, context, origin files, current translation, placeholder check. Save → `compileMessage` in try/catch for `message` and label scopes (a broken pattern is rejected with the compiler error; `server`/`rule` are stored verbatim) → `i18n.load(locale, { [id]: text })` or the `dynamic` map for instant re-render → the writer (`ui_translations` row, or draft) → the reverse index and `translatedKeys` update.
- Panel (a Sheet): the whole index with search, filters "missing" / "requested" (the queue, with origin; on a deployment without the table, the localStorage request list) / "drafts" / "on this page", inline edit; a "Model labels" tab edits `labels` for the current entity and module through the same writer, with the whole-model inventory view and its "missing only" / "orphaned" / "newest first" / "changed since translated" filters. "Download `<code>.json`" exports the full merge.
- StrictMode: every load is idempotent (boot, the prefetch effect, menu handlers), so a doubled effect changes nothing; label state through `useSyncExternalStore`. Lingui renders text, not HTML, so user-edited strings cannot inject markup.

## Enforcement

- `eslint-plugin-lingui` `flat/recommended` for all of `src`; `lingui/no-unlocalized-strings` at `error` for `src/**` from P1 (`src/charts/**` ignored), with today's violations recorded once by `eslint --suppress-all` into the repo's existing native `eslint-suppressions.json` (ESLint 9.39). Each phase migrates files and runs `eslint --prune-suppressions`; counts only fall, and a partially migrated file is enforced for anything new. `ignoreFunctions` for `cn`/`cva`/`clsx`, `ignore` regexes for format examples and identifiers, `ignoreNames` for `className`, `data-*`, `href`. Whether the installed rule recognizes plain `t(...)`/`translate(...)`/`msg(...)` calls is checked in P1; if not, they go into `ignoreFunctions`. `react-hooks/exhaustive-deps` becomes `error` for migrated files the same way (`useT()` returns a new function per locale, so it belongs in deps). `no-restricted-imports` bans `translate` from `@/i18n` under `components/**`, with the three class components (`ErrorBoundary.tsx`, `form/InputJson.tsx`, `niko-table/core/data-table-error-boundary.tsx`) as the exceptions.
- `src/test/i18nCatalogs.test.ts` (node): runs the extractor in memory and fails when the index or a locale file is out of sync (run `i18n:extract`), when a translation's placeholders differ from its source or a value does not compile (`message` and label scopes; `server`/`rule` are verbatim), when a repo catalog contains `labels`, `server` or `rule`, or when a file breaks its schema (catalogs and the index each have one). Missing `de-DE` translations are reported, not failed. A glossary check (`src/locales/TRANSLATION-GUIDE.md` plus a machine-readable term list) warns when a translation uses a different word for a fixed product term.
- `routeTitles.test.ts` keeps matching `head: (` after every route's title moves to `translate(...)`.
- Test setup: new `src/test/setup.node.ts` and the existing `setup.browser.ts` both `await activateLocale({ language: 'en-US', locale: 'en-US' })`, with `afterEach` reset (the singleton outlives a test within a file), and the collector disabled unless a test enables it; the "no setup file" comment at `vite.config.ts:100-102` is rewritten. `I18nProvider` is added to `AppHarness` (L166), `renderInApp` (L212) and `form/__tests__/harness.tsx`; the ten `*.test.tsx` files that call RTL `render()` bare (`ApiErrorDisplay`, `ConfigErrorPage`, `ErrorBoundary`, `api-select`, `SchemaForm`, `data-table-skeleton`, `combobox`, `number-input`, `ViewSkeleton`, `login`) switch to `src/test/render.tsx` when their component starts using `<Trans>`; `useT()` alone needs no provider.
- Browser tests (real app via `appHarness.tsx`, real tenant, no stubs): switch language through the real menu → German label, `<html lang>`, cached keys, boot from the cached keys; the format submenu switches number and date output between the real `navigator.language` and the language's own region; the "Browser default" entries show the real `navigator.languages` value (a second Playwright instance with a `de-CH` context locale, a real browser setting rather than a stub, covers the German placeholder if `@vitest/browser-playwright` exposes context options; otherwise the assertion is against whatever the runner's locale is); a session preference written through `set_user_preferences` on the test tenant wins over the cache after login (skipped with a message while the RPC is absent); deployment file loaded by a real fetch of `src/test/fixtures/locales/fr-FR.json` registered through `setRuntimeEnv({ VITE_UI_CUSTOMIZER })` - served as a BLOB built from that file's own bytes, not from the Vite dev server, which transforms a `.json` under `src/` into an ES module and would answer `text/javascript` (that is the failure path, and it has its own test); tenant rows written to the real `ui_translations` table with the run's token and read back through a locale switch, and a real miss recorded by the enabled collector and read back from the queue (both skipped with a message while the table is absent); marking highlights one of two strings while `getByRole` names still resolve; an in-context edit round-trips into the DOM, the writer and the export; a metadata override on a real tenant table changes the grid heading, a badge and the route title. Node tests: resolver for both preferences (session, cache, operator default, placeholder, `en-US`) and subtag matching, file ↔ rows mapping, `localizeMetadata`/`enumLabel`, `labelInventory` including orphans, extractor over fixtures including the non-literal failure, schema validation.
- `substitutions.test.ts` stays at its current total of 6: locale comes from real `navigator`/`localStorage`, runtime config from `setRuntimeEnv`, rows from the real tenant.

## Phases (one PR each, each deployed and screenshotted per CLAUDE.md)

### P1 Foundation + app shell (German switcher visible) - DONE (`31bf10d`)

1. `apps/web/package.json`: `@lingui/core`, `@lingui/react`, `@lingui/message-utils`; dev `eslint-plugin-lingui`; scripts `i18n:extract`, `i18n:status`. No engines change: CI, Docker and the sandbox already pin Node 22, and only the runtime packages are used.
2. `apps/web/scripts/i18n/extract.mjs`, `status.mjs` (repo catalogs only until P4); `src/locales/en-US.json` (generated) and `de-DE.json` (translated); `src/locales/TRANSLATION-GUIDE.md`.
3. `src/i18n/index.ts` (`t`/`useT`, `translate`, `msg`, `activateLocale`, `formattingLocale`/`useFormattingLocale`, memoized compiler with fallback, ...), `src/i18n/resolveLocale.ts` (both preferences with their sources, the cache keys, the operator default, the browser placeholder; the session fields and the OIDC `locale` claim join in P4 together with the post-login re-resolve) + test, `src/i18n/catalog.ts`, `src/i18n/store.ts` (layers; repo layer only in P1).
4. `index.html` lang script; `main.tsx` boot order + `I18nProvider` + `translate` for `BootFailure` props.
5. `src/test/setup.node.ts` (new), `setup.browser.ts`, `appHarness.tsx` (two places), `form/__tests__/harness.tsx`, `src/test/render.tsx` (new).
6. `lib/userMenu.ts` `msg` titles (`title: string | MessageDescriptor`; `userMenu.test.ts`, `config.test.ts:87` compare via `translate`); `lib/pageTitle.ts` + every route `head()` (15 files with literals).
7. `components/layout/**` (`AppLayout`, `AppSidebar`, `NavApps`, `NavBookmarks`, `ModuleSwitcher`, `CommandPalette`; delete the unreferenced `NavMain.tsx`/`NavProjects.tsx`); `NavUser.tsx` Language and format submenus with the "Browser default" entries (`activateLocale` with persist to the cache + `router.invalidate()`; the session write-back arrives in P4); `ErrorPage`/`NotFoundPage`/`ErrorBoundary`/`AuthFailure`/`LogoutConfirmationPage`.
8. `NavUser.test.tsx` (lang, both cache keys, "Abmelden", boot from the cached keys, the "Browser default" entry checked when nothing is cached); `src/test/i18nCatalogs.test.ts`; `eslint.config.js` lingui block for `src/**` + `no-restricted-imports` + `eslint --suppress-all` baseline; verify `<Trans components={{ bold }}>` named tags and the rule's recognition of `t(...)`.
9. Root `README.md` `## Internationalization` (between its Packages and Accessibility sections): the API, the workflow for adding a string (including the same-PR German rule), the discovery path; CONTEXT-MEMORY section (below).

### P2 Grid, dialogs, formatting - DONE (`cadaeb7`)

`niko-table/config/data-table.ts` (48 labels → `msg`), `filters/*` menus, pagination (ICU plural), `DataTableView.tsx` (Yes/No, empty state, search placeholder, delete `entityType`), `ConfirmDeleteDialog.tsx` (`<Trans>` with `bold`), `hooks/useConfirmDelete.ts`, `DataFormPage.tsx`, `lib/apiErrors.ts` (drop `singularize`, use model labels; unknown server messages pass through untouched until P4 adds `translateDynamic`), `ViewSkeleton.tsx`, `views/View.tsx` sentences; number/date helpers wired to the locale, `niko-table/lib/format.ts` fix, `src/i18n/dateFnsLocale.ts`, `ui-ext/localized-calendar.tsx` + both pickers + filter calendars, `Toaster` label. `eslint --prune-suppressions`.

### P3 Forms, settings, remaining surfaces - DONE (`fb26cb7`)

`form/SchemaForm.tsx`, `FormLabel.tsx` ("(required)"), `InputEnum.tsx`, `api-select.tsx`, `InputReference.tsx`, `Playground.tsx`; `ajv-i18n` over `validateData().errors`; `settings/ApiKeysCard.tsx`; `ui-ext/sortable.tsx`, `combobox.tsx`; demo routes (`xcustomers`, `crm.home`, `documents`, `form-playground`) wrapped like everything else. Suppressions pruned to zero outside `src/charts/**`.

### P4 Runtime languages: deployment file, model-label overrides, tenant table and queue - DONE (`dd2662e`, `310730b`)

What it covered (as specified; where the implementation differs, see Deviations in Status):
`lib/localeConfig.ts` + the `parseUiCustomizer`/`resolveUserMenu` split; deployment-file layer + `public/locales/schema.json` + `docker/nginx.conf` `/locales/` rule; `labels.ts` (`localizeMetadata`, `enumLabel`, `tableLabel`) + `enum_labels` on `JsonSchemaProperty` + the consumer sites listed above; `get_schema` loader onto the QueryClient with `queryClient` in the router context; `src/i18n/localeFile.ts` (file ↔ rows); `src/i18n/labelInventory.ts` + test; `src/i18n/missing.ts` (collector, disabled in test setup) + `translateDynamic` and the `dynamic` map, wired into `ApiErrorDisplay`, `formatDeleteError` and the five direct `error.message` sites; the pending `lib/apiClient.ts` change that makes `callRpc` throw with `cause: { ...body, status, url }` committed first, or RPC messages never reach the collector; the generic `onConflict` option in `hooks/useTableMutations.ts` `useCreateRecord`; the tenant layer (via `useTable`), the tenant-rows writer and `request()` in `store.ts` (the drafts branch and the download arrive in P5), `TranslationsPrefetch` in `main.tsx` with its `router` prop, also re-resolving on `rpcUserInfo` and `userInfo`; the session read (`get_userinfo` `language`/`locale`, then the OIDC `locale` claim) with the cache mirroring, and the switcher's write-back through `set_user_preferences` with the cache-only fallback; `apps/web/scripts/i18n/export.mjs` (with `--messages-into`), `import.mjs`, `labels.mjs`, `translate.mjs`, `status.mjs --tenant`, the shared tenant resolution and `SEMANTIUS_TOKEN`/`--api-url`, `.gitignore` entry for `apps/web/.i18n/`; README "Adding a language" (file, registration, mounting, what the file cannot do) and "Tenant translations" (the DDL, triggers, policies, the model registration, the permission, the queue and the scripts); `docker/README.md`; fixtures, node and browser tests. Prerequisite for the table and queue tests: the platform migration (table, triggers, policies, permission) applied to the test tenant.

### P5 Translate mode - DONE

See "What P5 built" in Status for what landed and where it deviates. The paragraph below is
the specification it was built from.


`src/i18n/translateMode/` (reverse index + highlights, label renders recorded too, `EditorPopover`, `Panel` with the catalog tab and its filters "missing" / "requested" / "drafts" / "on this page", the localStorage request list where there is no table, the model-labels tab with the whole-model inventory view and its filters, missing count in the Language submenu, export); NavUser toggles; drafts; tests.

## Later, deliberately out of these PRs

Per-locale labels inside the semantic model with `get_schema` returning them server-side (one more layer; the override slot is `enum_labels` and the label fields already there); a sighting count or event table for the queue; a platform insert trigger to a webhook receiver for near-real-time translation runs; drizzle-cube (owner decision); CodeMirror `EditorState.phrases`; RTL beyond setting `dir`; `index.html` "Loading…" on plain routes stays English.

## Risks

1. A string added to code before extraction: interpolates through the memoized compiler; the catalog test fails until `i18n:extract` runs.
2. Cold-start 404 from the tenant disabling the table layer: the fetch interceptor retries a bare 404 under the API base; the layer disables only on a definitive `42P01`/`PGRST205` body.
3. P4 table and queue tests need the platform migration on the test tenant: sequenced as a prerequisite; loud skip until then.
4. Reverse-index cost on large grids: `MutationObserver` throttled and scoped to `#root`, active only in translate mode.
5. `no-unlocalized-strings` noise: suppression baseline, `ignoreFunctions`, attribute and regex ignores.
6. The Lingui singleton leaking between tests: `afterEach` reset to `en-US`.
7. `router.invalidate()` re-running every loader over the network: CLOSED in P4 - `get_schema` is on the QueryClient with `staleTime: Infinity`, reached through `rpcQueryKey()` so the loader and `useRpc` fill one entry, and `src/i18n/schemaCache.test.tsx` fails if `router.update()` ever drops the client from the context again.
12. A translations table larger than one PostgREST page: `useTable` with `count: true` reports the total and further pages load by `offset`; the server's `max-rows` is confirmed in the pre-P4 curl check.
8. `obsolete` growing forever: `status` prints it, `extract --prune` empties it.
9. The queue filling with server messages that embed data values: the PostgREST-code filter, the 500-character cap, per-session dedupe, `origin` for review, and the "requested" filter to delete rows that are data; a normalization of ids and quoted values into placeholders is a follow-up if it proves noisy.
10. The collector's inserts need the platform's empty-row policy on the test tenant along with the table; until then the collector falls back to localStorage and its tenant test skips with a message.
11. Label rows orphaned by a model rename: listed as orphaned by the inventory, in the panel and by `labels.mjs`; deleting is a translator's action.

## CONTEXT-MEMORY.md additions (new "Internationalization" section)

The rules a future session would otherwise break: the source string is the key, so rewording a string moves its translations to `obsolete` (run `i18n:extract`, retranslate); a PR that adds or rewords a string fills its `de-DE.json` entry in the same PR; `en-US.json` is generated, never edited; components use `useT()` and list `t` in deps, everything outside React uses `translate`, because the module function cannot re-render a component, and `translate` is lint-banned under `components/**` except in the three class components; `I18nProvider` renders nothing until activation, which under the boot overlay is a hang unless a built-in locale is always activated first; language (catalog) and formatting locale are two preferences, the language resolved session → cache → operator default → browser placeholder → `en-US`, the formatting locale session → cache → `navigator.language` → `en-US`, a session `null` clears the cache key, an unavailable language counts as absent, Lingui never receives the formatting locale (it would drive plural rules), and the helpers take `useFormattingLocale()`, never the catalog language; boot passes never persist, only the switcher does, to the session when the RPC exists and always to the cache; a switch needs `router.invalidate()`; never lowercase or pluralize a model label in code; model labels are data the extractor cannot see, so their missing translations come from the label inventory (`tables`, `fields`, `modules` diffed against the labels layer) in the panel and in `labels.mjs`, never from the catalog test; runtime messages (backend rule messages, PostgREST, RPC) go through `translateDynamic`, are looked up verbatim and never ICU-compiled, and every miss the app meets becomes an empty-translation row inserted with `ignore-duplicates`, which is the queue `translate.mjs` drains; the collector is off in the test setup; translate mode and its saves are gated by `translations.edit` (`admin` where it does not exist), and `en-US` rows are terminology overrides, not translations; deployment languages are `public/locales/*.json` registered in `VITE_UI_CUSTOMIZER.locales`, tenant languages are rows in `ui_translations`, and label overrides live in those, never in the repo catalogs; the tenant layer is read through the generic `useTable` (never a table-specific hook or a hand-written `useQuery`), so the interceptor's read policy covers the cold-start 404 and any generic mutation on the table invalidates the layer; it disables only on a definitive `42P01`/`PGRST205` body; upserts use `useCreateRecord`'s generic `onConflict` option, and the collector is the one direct `fetch`, relative so the interceptor signs it; `activateLocale` uses the replacing `loadAndActivate`, and only a single-key save uses the merging `load`; a component using `<Trans>` needs `I18nProvider`, so its test renders through `src/test/render.tsx`, while `useT()` alone does not; locale files are fetched with absolute URLs because `apiClient` rewrites relative ones; tenant-facing scripts resolve the PostgREST URL through the control plane like the a11y audit does; `eslint-suppressions.json` is the migration ratchet and only shrinks, but its counts are per file and rule, so a same-file swap of one violation for another is invisible to it and is caught in review.

## Verification (every phase)

1. `pnpm --filter @semantius/frontend i18n:extract` leaves the tree unchanged; `i18n:status` shows `de-DE` complete.
2. `pnpm check` green, `substitutions.test.ts` unchanged at 6, `eslint --prune-suppressions` leaves `eslint-suppressions.json` unchanged, `pnpm build` clean.
3. `dotenvx run -- bash workplace/deploy-wrangler.sh`, open the preview with a minted `#jwt`, switch to Deutsch in the account menu: German chrome and `<html lang="de-DE">` with the format submenu showing the browser default (P1), German number and date formats following the format setting and grid chrome (P2), German form chrome and validation (P3), a registered `fr-FR` file and a tenant row applied, including a table label override, and a provoked backend error appearing in the queue (P4), missing strings marked, one edited in place and present in the export (P5). Screenshots per phase under `screenshots/`.
4. `pnpm test:a11y-audit --url <preview>`: 3.1.1 passes with the switched language.
