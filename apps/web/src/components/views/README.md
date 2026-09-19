# Entity Views

One route renders every table of every module. This folder holds the component it
renders — `EntityView`, the generic entity page (grid + form) — and the per-table
overrides that customize it.

## Overview

- **`EntityView.tsx`** is the page for any entity: breadcrumb, heading, the grid
  (`DataTableView`) and the record form (`DataFormPage` → `SchemaForm`) in a Sheet,
  a Dialog or a standalone page.
- **An override** is a file named after one table. It renders `EntityView` and
  passes it optional callbacks from a typed set (`EntityViewCustomization`). It
  never re-implements the grid or the form.

## Architecture

### How a view is resolved

The route is `routes/_app.$moduleId.$table_name.tsx`.

1. **The loader** fetches the entity's schema with `get_schema`, through the
   QueryClient (`rpcQueryKey`, `staleTime: Infinity`), so the loader and
   `useRpc('get_schema')` share one cache entry and a language switch
   (`router.invalidate()`) costs no request. It answers `notFound()` only when the
   server said 404; every other failure is thrown to the router's error page.
   `head()` titles the tab from the entity's plural label, and
   `pendingComponent: ViewSkeleton` covers the load.
2. **`useLocalizedMetadata()`** in the route component is the single choke point for
   model labels. Everything below — `EntityView`, the grid, the form, the delete
   dialog — takes its labels from the `metadata` prop it produces. Do not translate
   model labels again further down.
3. **The resolver** discovers every file here with
   `import.meta.glob('../components/views/**/*.{tsx,jsx}')` and looks up
   `views/{moduleId}/{ComponentName}.tsx`, where:
   - `ComponentName` is the table name with its **first character** upper-cased and
     nothing else changed: `modules` → `Modules.tsx`, `order_details` →
     `Order_details.tsx`;
   - `moduleId` is the raw route parameter, and the lookup is case-sensitive.

   From the file it takes the export named `ComponentName`, else `EntityView`, else
   `default`. With no file it falls back to `views/EntityView.tsx`. The lazy
   component is cached per path, and it is rendered with `key={table_name}`, so
   moving to another table remounts the view instead of carrying the previous
   table's state and rows across.

**Trap: a static route outranks the catch-all.** TanStack Router prefers a static
segment to a parameter, so a hand-written route shadows any entity with the same
path. `routes/_app.crm.home.tsx` would win over a `home` table in module `crm`, and
the `_app.xcustomers.*` demo routes over any module whose slug is `xcustomers`.

### What `EntityView` owns

- **The mode, read from the pathname**, not from props:

  | Path | Mode |
  | --- | --- |
  | `/{module}/{table}` | list |
  | `…/create`, `…/{id}`, `…/{id}/edit` | list with the form in an overlay |
  | `…/{id}/view`, `…/new` | standalone form page, no grid |

- **`edit_mode`** from the schema decides where a record opens: `auto` (default) and
  `sidebar` use the Sheet; `modal` uses the Dialog; `page` navigates to the standalone
  page. In `auto`, the Sheet becomes wide (two-column form, ~900px) on a screen at
  least `lg` wide when the form has more than ten fields; the width is captured when
  the overlay opens and held while it stays open.
- **The `edit_permission` gate.** When the schema names one, "Add {label}", the
  form's edit mode and the row menu's Delete all require it.
- **Breadcrumb, bookmark star, heading, description and "Add {label}".**
- **The parent filter** (`?_pf=<table>.<column>&_pv=<id>`): the grid is filtered to
  one parent record, and the parent's own schema is fetched separately
  (`useRpc('get_schema')`) for the breadcrumb's parent label and to read the parent
  record's name for the heading. That schema never passes through
  `useLocalizedMetadata`, so its label is translated inline, keyed by the parent's
  own `module_slug`.
- **Child-relation buttons** in the form header: in an editable form they submit
  the form and then navigate to the child table filtered to this record; in a
  view-only form they navigate directly.

What it delegates: the grid, its row menu, search, sort, filters, paging and the
delete flow to `DataTableView`; the form to `DataFormPage` → `SchemaForm`.

## The customization contract

`EntityView` takes two sets of props.

- **`EntityViewProps`** (`types/metadata.ts`) is the route contract, and it is
  fixed: `moduleId`, `table_name`, `recordId`, `metadata`. The route supplies it;
  an override passes it through unchanged.
- **`EntityViewCustomization`** (`EntityView.tsx`) lists everything an override may
  customize. Every member is optional, and absent means the generic behavior.
  Add a member here, and a row to this table, rather than branching on a table
  name inside `EntityView` or the grid.

| Callback | Signature | Consumed by | When absent |
| --- | --- | --- | --- |
| `getRowMenuItems` | `(record) => RowMenuItem[]` | `DataTableView`'s row "..." menu; the items are appended before Delete | no extra items |
| `renderDeleteConfirmation` | `(props: DeleteConfirmationProps) => ReactNode` | `DataTableView`; replaces the delete confirmation dialog, while the grid keeps the mutation, refetch and toast | the generic `ConfirmDeleteDialog` |

**`renderDeleteConfirmation`** receives `DeleteConfirmationProps` (exported from
`DataTableView.tsx`): the row's `record`, its `displayName` (`''` when the row has
no name), the model's `entityType`, and the grid's delete flow — `isOpen`,
`setIsOpen`, `isPending`, `error`, `handleConfirm`, `handleCancel`. The dialog calls
`handleConfirm` to delete (it closes on success and stays open to show an error)
and `handleCancel` to close. Two rules:

- **A fresh element per Delete.** The grid mounts a new one each time Delete is
  chosen (it is keyed per open), so the dialog's local state — a step, a typed
  value — starts clean every time with no reset code. It is NOT unmounted to
  close it: it stays mounted through Base UI's closing transition, which is what
  lets `ModalInert` take `inert` off `#root` before focus goes back to the row's
  menu button.
- **Return a component defined at module scope**, as
  `(p) => <ConfirmDeleteModuleDialog {...p} />` does. A component defined inside
  the render function is a new type on every grid render, and React remounts it —
  back to its first step — whenever the grid re-renders, which includes the
  refetch on window focus.

## Adding an override

Worked example: `admin/Modules.tsx`. Deleting a module cascades to every entity in
it, their database tables and their permissions, so its delete asks for the
module's slug to be typed first. The override is one prop:

```tsx
export function Modules(props: EntityViewProps) {
  return (
    <EntityView
      {...props}
      renderDeleteConfirmation={(p) => <ConfirmDeleteModuleDialog {...p} />}
    />
  )
}
```

`admin/ConfirmDeleteModuleDialog.tsx` is the dialog: step 1 is the warning, step 2
the typed slug, and it calls the `handleConfirm` it was given. `admin/Users.tsx` is
the `getRowMenuItems` example: a "Manage API keys" row-menu entry for agent users.

Rules:

1. Name the file after the table with its first character upper-cased, in the
   module's folder: `views/{moduleId}/{ComponentName}.tsx`.
2. Export a component with that same name. The resolver tries it first.
3. Render `<EntityView {...props} … />` and pass only the callbacks the table needs.
   Never fork the grid or the form.
4. Use `useT()`. `translate()` is banned under `components/**`, because it cannot
   re-render a component when the language changes.
5. A new file has no entry in `eslint-suppressions.json`, so it must lint clean.
6. **Keep a callback the grid's columns depend on stable** — `getRowMenuItems`
   today — with `useCallback` or a module-scope function. The grid builds its
   columns in a memo, every cell is rendered from a column function, and a new
   identity remounts every cell: keyboard focus on a row's "..." button is lost,
   and a closing dialog has nothing to return focus to. `EntityView` memoizes its
   own grid props (`onEdit`, `getRowHref`, `excludeColumns`) for the same reason.

## Testing

Tests for this folder run in the Vitest `browser` project (real Chromium) against
the real test tenant. Nothing is mocked; `src/test/substitutions.test.ts` fails the
suite on a new substitution.

- **Render through the app's providers:** `bootApp()` and `renderInApp()` from
  `src/test/appHarness.tsx`. At pathname `/`, `EntityView` is in plain list mode.
- **Create rows out of band**, never through the code under test:
  `src/test/moduleFixture.ts` writes `_vitest_`-prefixed `modules` rows with a raw
  request (`moduleFixture()`, `db()`), and `deleteVitestModules()` in `afterEach`
  deletes this file run's rows, so a test that throws still cleans up. It never
  deletes another file's rows: test files run in parallel, and doing so made
  their fixtures vanish mid-test.
- **Wait for the permission** before opening a row menu: `useUserHasPermission`
  answers false until `get_userinfo` lands, so wait for a control gated on the same
  permission ("Add Module") first.
- **Drive Base UI menus with arrow keys**, never pointer clicks on items and never
  typeahead: `chooseRowMenuItem()` and `arrowTo()` in `src/test/menu.ts`.
- **Disable the i18n collector** (`disableCollector()`) in any test that renders
  fixture data, or the fixture's text is recorded into `en-US.json`.

The tests: `EntityView.test.tsx` (the generic delete dialog, unchanged),
`admin/Modules.test.tsx` (the override end to end: typed slug, delete, focus
return, a fresh dialog per Delete) and `admin/ConfirmDeleteModuleDialog.test.tsx`
(the dialog's own rules, with its props supplied by hand).

## Files here that are not live

Kept on purpose; do not copy them as examples.

- `View.txt` — an old copy of the generic view, not compiled.
- `admin/Modules0.tsx` — a metadata dump page; the resolver never loads it, because
  it looks up `Modules.tsx`.
- `crm/XCustomers.tsx`, `crm/XRegions.tsx` — re-export `EntityView`. They would be
  resolved only for a `crm` table named `xCustomers` or `xRegions`, which does not
  exist.
