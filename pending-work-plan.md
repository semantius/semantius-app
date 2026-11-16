# Pending work — handover from the pg_semantius 0.5.0 follow-up session

Read this whole file before doing anything. Then read `CLAUDE.md`,
`CONTEXT-MEMORY.md` and, for anything under `i18n/`, `i18n/CLAUDE.md` and
`i18n/TRANSLATION-GUIDE.md`.

**This file is a handover, not a specification.** Per `CONTEXT-MEMORY.md`, a plan
document is not agreed requirements unless the owner says so. Everything under
"Owner decisions" was decided by the owner in the session; everything under
"Open items" still needs the owner's go-ahead, and the items marked **needs a
decision** must not be built until the owner has picked an option.

---

## 1. How this work started

A previous agent reported two issues after the backend (`c:\dev\semantius`,
pg_semantius 0.5.0) changed (a) how JsonLogic arithmetic reads its operands and
(b) which entity table names are allowed. Both were verified true and fixed; the
owner committed that first round as `24efa5a`. Everything after it, listed in
section 3, is **uncommitted** in the working tree. During the session the owner
reported further form problems (computed label editable, rule-driven
validation, empty dates failing, child button on a new record, computed field
missing on create), which were fixed one by one.

---

## 2. Owner decisions made in the session (binding)

- **JsonLogic parity:** the browser evaluator matches the server fully for
  arithmetic (`+ - * / % max min`) and ordering (`< <= > >=`): arrays and objects
  count as 0, ISO date / date-time text is its UTC epoch seconds (fraction kept,
  rounded to microseconds), PostgreSQL's timestamp-cast limits apply. Done and
  committed in `24efa5a` (`apps/web/src/lib/computedFields.ts`,
  `apps/web/src/lib/jsonLogicDates.ts`).
- **Test fixtures:** entity table names use `TABLE_PREFIX = 'vitest_'`
  (`apps/web/src/test/moduleFixture.ts`); module names keep `_vitest_`. Committed.
- **Rollup drill-down tenant test** uses Northwind `suppliers.product_count`
  (a `count` over `products.supplier_id`, a `reference` link), which the owner
  added. Not the `applications` sample (gone since the tenant reset).
- **Tests and modules:** regular tests may use `nwind`; **translation tests rely
  only on `_core`** (slug `admin`, the only module every deployment has). Recorded
  in `CONTEXT-MEMORY.md` (Testing section). The language files are kept as they
  are, `nwind` keys included; `SHIPPED_MODULES` keeps `nwind`.
- **Derived ctypes (`rollup`, `computed`, `computed_label`):** the ctype controls
  submission — never sent, never required, in every mode (declared or from a
  rule), `readonly` and `hidden` included. The mode only controls drawing:
  `default`/`required` are drawn `disabled`.
- **Rule-driven modes:** a field declared `required` that an `input_type_rule`
  makes `disabled`/`readonly`/`hidden` must not block an empty save; a field that
  is `disabled` now is never sent; a field a rule enables is sent. The has_a
  contract stays: a value typed into a field a rule then made readonly (and so
  took off a create form) is still sent and still validated.
- **No new input mode now.** A "hidden-disabled" mode (not drawn, not sent) was
  discussed and deferred until a model needs it; it would be backend-first
  (`valid_input_type` CHECK in `apps/_core/migrations/0150_dd_bootstrap.once.sql`
  in the backend), then sem-schema, then the form.
- **SQL date defaults:** map PostgreSQL date/time default expressions to real
  values when seeding a form: the keywords `CURRENT_DATE`, `CURRENT_TIME`,
  `CURRENT_TIMESTAMP`, `LOCALTIME`, `LOCALTIMESTAMP`; the literals `'today'`,
  `'tomorrow'`, `'yesterday'`, `'now'` with optional casts; and `now()`. UTC, like
  `$today`.
- **Child button on a new record:** saves, then opens the child filtered to the
  new record, exactly as editing does.
- **Computed fields on create forms:** ctype `computed` is drawn (disabled, live)
  on create forms. `computed_label` and `rollup` stay off create forms (owner
  answered "computed fields").
- **German:** fix wrong translations; keep discovery's language-file changes.

---

## 3. State of the working tree (uncommitted, on `main`)

| File | Change |
|---|---|
| `apps/web/src/components/form/SchemaForm.tsx` | `DERIVED_CTYPES` + `isDerivedCtype` (renamed from `DISABLED_BY_DEFAULT_*`); `coerceDerivedCtypeMode` maps `default` **and** `required` to `disabled`; save path rewritten around `declaredMode` / `modeNow` / `outOfReachByRule` / `isSent` / `validationMode` (payload, `required` list and the schema copy handed to sem-schema's `validateData` all follow the current mode); `generateDefaultValue` calls `postgresDateDefault`; `renderedInputMode` draws ctype `computed` on create forms |
| `apps/web/src/components/form/__tests__/SchemaForm.test.tsx` | tests for all of the above; rollup drill-down tenant test on `suppliers` |
| `apps/web/src/lib/postgresDateDefaults.ts` (new) + `.test.ts` (new) | `postgresDateDefault(expression, format, now)` |
| `apps/web/src/components/data-table-view/DataFormPage.tsx` | `onClose(created)` passes the created row |
| `apps/web/src/components/views/EntityView.tsx` | `StandaloneFormView` remembers the pressed child button and opens it with `recordId ?? created[idColumn]` |
| `apps/web/src/components/views/EntityView.test.tsx` | creates a `_vitest_` role on `/admin/roles/new`, presses a child button, asserts the filtered child URL; deletes the role |
| `apps/web/src/lib/rollupDrillDown.ts`, `apps/web/src/components/form/RollupDrillDownLink.tsx` | comments: `children` lists only `parent` links, so a rollup over a `reference` link takes the fallback fetch |
| `apps/web/src/types/metadata.ts` | ctype comment matches the new rule |
| `CONTEXT-MEMORY.md` | approved entry "Translation tests rely only on `_core`" (Testing section) |
| `i18n/en-US.json`, `i18n/de-DE.json` | discovery's record of the reworded Northwind model (kept, owner-approved) + 6 German fixes (section 5) |
| `i18n/todo-de-DE.md` | three open entries updated (Order/Bestellung, ship-to block incl. Ship Name, Pending) |
| `.preview-url.md` | last preview deploy |
| `screenshots/2026111617*–19*.png` (untracked) | preview screenshots of each fix |

Nothing is committed, pushed or in a PR. **Do not commit, push or open a PR
unless the owner says so** (then follow the PR gate in `CLAUDE.md`:
`.pr-comment.md`, `workplace/approve-pr.sh`, `--body-file`).

---

## 4. Finish first: "computed fields on create forms"

Code and tests are done (`SchemaForm.test.tsx`: "draws a computed field on a
create form, computes it live, and does not send it"; 108 SchemaForm tests
passed). Still to do:

1. `pnpm check` passed on the final code at handover (1678 passed, 4 skipped,
   0 lint errors). Rerun it if anything changed since.
2. `pnpm build`.
3. Deploy: `dotenvx run --quiet -- bash workplace/deploy-wrangler.sh` (Windows —
   `pnpm preview:wrangler` does not work here), read `.preview-url.md`.
4. Preview check with a seeded session (`#jwt`, see `CONTEXT-MEMORY.md`): open
   an existing order's "Order Details…", press "Add Order Detail" → screenshot:
   Amount visible and disabled; type Quantity and Unit Price → screenshot: Amount
   computed live. **Do not save** (shared Northwind data).

---

## 5. German translations — what was done and what is left

Done in `i18n/de-DE.json` (edited by hand, which the guide allows; **no**
`i18n:import`, no work file):
`orders.enum.status.pending` "Offen" and `.shipped` "Versendet" (copied back
unchanged — only the English capitalization changed);
`orders.field.freight.description` "Frachtkosten für die Bestellung. Währung: US$";
`orders.field.ship_via.title` and `.ship_via_label.title` "Spediteur" (English now
"Shipper", the catalog's established term);
`order_details.field.label.title` "Bezeichnung" (English now "Label").

Left, all recorded in `i18n/todo-de-DE.md`:
- `orders.field.ship_name.title` / `.description` — **needs a ruling** (part of
  the open "Liefer-" block entry; candidates Warenempfänger / Empfänger /
  Liefername). Old "Bestellung" is parked in `obsolete`.
- `orders.field.label.title` "Order Id", `subtotal`/`total` descriptions — wait
  for the open Bestellung-vs-Auftrag ruling.
- Not translated yet, not asked for: `orders.field.subtotal.title`,
  `.total.title`, `orders.enum.status.picking`.

Rules (from `i18n/CLAUDE.md`): an agent adds where nothing exists, abstains when
unsure, records findings in `todo-de-DE.md` in the same run, never overwrites an
existing translation without the owner's instruction, never runs `i18n:import`.

---

## 6. Open items (not started)

1. **`==` / `!=` loose equality differs from the server for date text.** The
   server's `jl_loose_eq` (`c:\dev\semantius\apps\_core\migrations\0050_jsonlogic.sql`,
   around lines 197–240) reads a string through `jl_try_number`, so an ISO date
   equals its epoch seconds: `{"==":["2024-01-01",1704067200]}` is `true` on the
   server, `false` in the browser (json-logic-js built-in `==`). Arrays compare
   as their joined text. Fix pattern: register `==`/`!=` on the shared engine in
   `computedFields.ts` mirroring `jl_loose_eq` (reuse `numberOfText`), verify every
   new case against the real server function (section 7), and add `==`/`!=` to
   the corpus filter in `computedFields.test.ts`. Same decision family as the
   approved "match server fully", but `==` was not named — **confirm with the
   owner** before building.
2. **The corpus tests do not run in CI.** `computedFields.test.ts` reads
   `../../../../../semantius/apps/test/tests/0100_test_jsonlogic.json` (sibling
   checkout of the backend) and skips when it is absent unless
   `SEMANTIUS_BACKEND_REQUIRED=1`. CI (`.github/workflows/checks.yml`) has no
   backend checkout, so date, arithmetic and ordering parity are not proven
   there. Options: check out the backend in CI, vendor the corpus with a sync
   test, or require it. **Needs a decision.**
3. **Other SQL defaults are still seeded as text.** `postgresDateDefault` only
   maps date/time expressions; e.g. `gen_random_uuid()` or `nextval(...)` would be
   seeded verbatim into the form. Related: on a create, an empty field of a typed
   format (`emptyValue: 'null'` in `components/form/controls.ts`: date, time,
   date-time, uuid, bytea…) is sent as an explicit `null`, which overrides a
   column default. First step: list every non-empty `default_value` on the
   tenant (`/fields?default_value=neq.`) and in the backend migrations. Root cause
   is `get_schema` passing SQL expressions as JSON Schema `default`; a backend
   fix (e.g. a separate `default_expression`) was discussed, the owner chose the
   app-side mapping for dates. **Needs a decision** for the rest.
4. **Readonly fields render as `disabled` inputs.** A probe showed
   `required → readonly` drawn with the `disabled` attribute. A disabled input is
   not focusable and is announced differently from a read-only one — an
   accessibility question (see the Accessibility sections of
   `CONTEXT-MEMORY.md`). Investigate the controls in `components/form/`.
   **Needs a decision.**
5. **`apps/web/src/components/form/Playground.tsx`** has its own
   `generateDefaultValue` without `postgresDateDefault`. `/form-playground` is
   not a test surface (CONTEXT-MEMORY). Decide whether it should reuse
   SchemaForm's seeding or be left.
6. **Spelling:** "behaviour" in `packages/sem-schema/src/jsonlogic/operators.ts:11`
   (CLAUDE.md requires American English). Trivial; pre-existing.
7. **`apps/web/src/routes/_app.xcustomers.tsx`** is a hand-written Northwind
   customers page; its strings ("Loading customers...", "No customers found",
   …) are in the code catalog. Question whether the route belongs in the
   product. **Needs a decision.**
8. **Language-file leftovers:** empty German "ID" for
   `admin.permission_hierarchy`, `nwind.parties`, `nwind.territories`,
   `nwind.vendors`; and `nwind.parties` / `nwind.vendors` keys may name entities
   the reset tenant no longer has. Follow the i18n rules.
9. **Float precision:** at epoch magnitude a double carries ~7 decimals, so
   `…00.1234567` minus a date gives 0.12345719 in the browser and exactly
   0.123457 on the server. Accept, or round arithmetic on date operands to
   microseconds. Minor.
10. **Computed labels on create forms:** owner chose `computed` only.
    `order_details.label` ("2 × Chai") would be meaningful on create,
    `orders.label` ("Order " + id) would be empty. Revisit only if asked.
11. **Pre-existing noise, never raised before:** `pnpm check` reports 19 lint
    warnings (0 errors); `pnpm build` warns about chunks over 500 kB.

---

## 7. Environment facts and traps learned in the session

- **Server comparison without a tenant:** the local container `postgres18-ext`,
  database `appdb`, has the backend's JsonLogic functions. Compare a rule with
  `docker exec postgres18-ext psql -U postgres -d appdb -At -v VERBOSITY=verbose -c "select evaluate_json_logic('<rule>'::jsonb, '<data>'::jsonb)"`.
  `-v VERBOSITY=verbose` puts the SQLSTATE in the error; do not put a `\set` and
  SQL into one `-c`. Every expected value in the new JsonLogic tests was checked
  this way.
- **Backend sources:** `c:\dev\semantius` — JsonLogic in
  `apps/_core/migrations/0050_jsonlogic.sql`, corpus in
  `apps/test/tests/0100_test_jsonlogic.json`, Northwind in
  `apps/nwind/migrations/0010_nwind.jsonc` (+ `apps/nwind/tests/`), error codes
  in `docs/error-contract.md`.
- **PostgreSQL 18 timestamp cast, measured:** year ≥ 0001; `24:00:00` only exact
  (next midnight); second 60 only without fraction (next minute); offsets up to
  ±15:59; fractions rounded to microseconds before those checks.
- **`get_schema` `children`** lists only `parent`-format links; a `reference`
  link never appears there.
- **The test tenant** was reset by the upgrade to modules `admin` and `nwind`.
  Its `/token` endpoint answered 200/500/401 for a while during the upgrade —
  wait and retry rather than debug.
- **agent-browser:** `network route "<pattern>" --abort` did NOT stop a PATCH (a
  save reached the tenant) — never rely on it to prevent a write;
  `fill @ref ""` does not clear a field (use click, `press Control+a`,
  `press Backspace`); screenshot paths must be absolute.
- **Browser tests print no console output when they pass.** To read values from
  a throwaway probe, end it with a deliberately failing assertion that prints the
  collected table, then delete the probe file.
- **Temporary tenant fixtures for preview screenshots:** a `_vitest_` module with
  managed entities and fields, created by a scratch script (POST `/modules`,
  `/entities`, `/fields`, then poll `refresh-schema-cache` until the table
  answers), deleted afterwards by deleting the module (cascade). Never leave
  rows on the shared tenant; check `/modules?module_name=like.*vitest*` and
  `/entities?table_name=like.*vitest*` at the end.
- **i18n discovery writes `i18n/en-US.json` and `i18n/de-DE.json`** during
  `pnpm check` **and** while the owner runs `pnpm dev`. Snapshot both files before
  a run to attribute changes; understand every diff line; never revert the
  owner's discovery without asking.
- **Rewriting `de-DE.json` by script:** `JSON.stringify({locale, name, messages, obsolete}, null, 2) + "\n"`
  with keys sorted by code unit reproduces the file byte for byte.

---

## 8. Verification checklist for any change (from `CLAUDE.md`)

`pnpm check` (every test green, including ones you did not touch) → `pnpm build`
(typecheck) → deploy (`dotenvx run --quiet -- bash workplace/deploy-wrangler.sh`)
→ read `.preview-url.md` → open with a minted `#jwt` (CONTEXT-MEMORY procedure:
`--quiet` + JWT extraction; clear storage via `/logout-success` first) →
screenshots of every changed state into `screenshots/YYYYMMDDHHMMSS-title.png`
→ scan the diff for British spellings (grep in `CLAUDE.md`).

Do not write to `CONTEXT-MEMORY.md` without proposing the exact text to the owner
first.
