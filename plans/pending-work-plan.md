# Pending work — open items

Read `CLAUDE.md`, `CONTEXT-MEMORY.md` and, for anything under `i18n/`,
`i18n/CLAUDE.md` first. Everything here is decided by the owner. Build §2 in the
order given; name any structural choice the item does not settle **before**
writing code, and get it approved. Deliver §2 as commits on `main`, item by item,
pushed (as with `1668a45`).

This file lists only what is still open. Everything else in the original
handover is in the code: one function for model defaults (`lib/modelDefaults.ts`,
`components/form/formDefaults.ts`), `==`/`!=`/`===`/`!==` matching the server,
the vendored backend test cases (`vendor/semantius/`), the German terminology,
the browser operators and skeletons, `$old`/`$mode` for computed fields, and
`i18n:extract` keeping code-keyed entries (`isErrorCodeKey` in
`apps/web/scripts/i18n/extract.mjs`).

## 1. Owner decisions that bear on the open items (binding)

- Every backend error code uses the error code as its message id.
  `apps/web/src/i18n/errors.ts` already keys them that way: class 90 by the
  SQLSTATE, a catalog code raised under `42501`/`42P01` (such as 90107) by
  `hint.code`.
- Regular tests may use `nwind`; translation tests rely only on `_core`
  (recorded in CONTEXT-MEMORY). The language files stay as they are, `nwind`
  keys included.
- For `rollup`, `computed` and `computed_label`, the ctype controls submission
  (never sent, never required) and the mode controls drawing. Since `b122b8f`, a
  computed label is never drawn on a create form, whatever its mode or rule says
  (`renderedInputMode` in `SchemaForm.tsx`).

## 2. To build

1. **Seed every backend error code from the contract.** None of the codes in
   `c:\dev\semantius\docs\error-contract.md` (130 rows; 90107, 90271–90278,
   90280, 90505, 90506, 90909, 90919, 90920 among them) has an entry in
   `i18n/en-US.json` or `i18n/de-DE.json`, so a German user sees English. Add
   each code's message, and its hint (`<code>.hint`, see `renderError` in
   `lib/apiErrors.ts`), to `en-US.json` with the source exactly as discovery
   would record it (`${name}` converted to ICU as `i18n/errors.ts` does), and to
   `de-DE.json` under the rules in `i18n/CLAUDE.md`. `i18n:extract` already keeps
   these keys (a first segment that is a SQLSTATE containing at least one digit:
   `90107`, `90107.hint`, `23505.orders_pkey`), so nothing there needs to change.
2. **Clear the 19 pre-existing lint warnings.** Fix the `set-state-in-effect` and
   `preserve-manual-memoization` ones for real; suppress only the
   `incompatible-library` ones inline, with the reason. Measured with
   `pnpm --filter @semantius/frontend lint`; there are now 14
   `set-state-in-effect` warnings, one more than when this was written:
   - `set-state-in-effect` (14): `data-table-view/DataTableView.tsx:452`, `:673`,
     `:687`; `form/Playground.tsx:98`; `form/api-select.tsx:294`, `:301`, `:310`;
     `layout/ModuleSwitcher.tsx:89`; `ui-ext/date-time-picker.tsx:61`;
     `ui-ext/platform-shortcut.tsx:40`; `ui-ext/sortable.tsx:592`;
     `routes/_app.$moduleId.index.tsx:138`; `routes/form-playground.tsx:40`;
     `routes/oauth2_callback.tsx:97`;
   - `preserve-manual-memoization` (2): both at `charts/CustomTableChart.tsx:275`;
   - `incompatible-library` (3): `niko-table/core/data-table-root.tsx:757`,
     `ui-ext/icon-picker.tsx:41`, `routes/_app.xcustomers.tsx:327`.

   Paths are under `apps/web/src/components/` unless they start with `routes/` or
   `charts/` (under `apps/web/src/`).
3. **Two files are still CRLF in the working copy** and LF in the index
   (`git ls-files --eol | grep w/crlf`):
   `packages/sem-schema/src/jsonlogic/operators.ts` and
   `packages/sem-schema/src/__tests__/data-validation.test.ts`. Check each one out
   again (delete, then `git checkout --`), and only if git reports it as
   unmodified. (`apps/web/update-shadcn.cmd` is CRLF by its own `eol=crlf`
   attribute and stays.)
4. **`nwind.parties` / `nwind.vendors` keys**: check whether the tenant still has
   those entities, then propose the exact keys to drop. Build nothing before the
   owner approves. 16 such keys are still in each of `en-US.json` and
   `de-DE.json`.

## 3. Preview check

Still owed: no screenshot of these states exists. Build, deploy, and take
screenshots with a `#jwt` session, **without saving** (shared Northwind data):
- "Add Order Detail" from an existing order: Amount drawn, disabled;
- the same form after typing Quantity and Unit Price: Amount computed; the label
  is not drawn (`b122b8f`);
- New Order: neither the label nor Subtotal and Total (rollups) are drawn.

For the browser operators, on a temporary `_vitest_` fixture module (§4): a field
whose `input_type_rule` uses `is_raci_actor` (error under the field), one whose
rule returns a value that is not an input mode (same), and a computed field using
`has_consultation` (error under it).

## 4. Traps not recorded elsewhere

- **Server comparison:** in the local container `postgres18-ext`, database
  `appdb`, run
  `psql -U postgres -d appdb -At -v VERBOSITY=verbose -c "select evaluate_json_logic('<rule>'::jsonb, '<data>'::jsonb)"`.
  `VERBOSITY=verbose` shows the SQLSTATE. Never combine `\set` and SQL in one
  `-c`. Backend sources are in `c:\dev\semantius`:
  - JsonLogic: `apps/_core/migrations/0050_jsonlogic.sql`;
  - Northwind: `apps/nwind/migrations/0010_nwind.jsonc`;
  - error codes: `docs/error-contract.md`.
- **Deploy on Windows:**
  `rm -f .preview-url.md; dotenvx run --quiet -- bash workplace/deploy-wrangler.sh`.
  The file is tracked, so without the `rm`, a failed deploy leaves a stale URL
  that looks like success.
- **agent-browser:**
  - `network route … --abort` did not stop a save, which reached the tenant;
  - `fill @ref ""` does not clear a field; use a click, then `Control+a` and
    `Backspace`.
- **Passing browser tests print no console output.** To read values from a
  throwaway probe, end it with a deliberately failing assertion, then delete the
  probe.
- **Preview fixtures:** a temporary `_vitest_` module, created by a scratch script
  (POST `/modules`, `/entities`, `/fields`, then poll `refresh-schema-cache` until
  the table answers), deleted afterwards (the delete cascades). Finish by checking
  that `/modules?module_name=like.*vitest*` returns nothing.
- **Discovery writes `i18n/` during the owner's `pnpm dev` too**, not only during
  `pnpm check`. Snapshot `en-US.json` and `de-DE.json` before a run to tell who
  changed what.
- **Rewriting `de-DE.json` by script:** `{locale, name, messages, obsolete}`, keys
  sorted by code unit, `JSON.stringify(…, null, 2) + "\n"`. This reproduces the
  file byte for byte.
