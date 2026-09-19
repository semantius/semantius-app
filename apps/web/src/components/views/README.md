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
  record's name for the heading. That schema
  never passes through `useLocalizedMetadata`, so its label is translated inline,
  keyed by the parent's own `module_slug`.
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

## Adding an override

Worked example: `admin/Users.tsx` adds a "Manage API keys" row-menu entry to agent
users.

```tsx
export function Users(props: EntityViewProps) {
  const t = useT()
  const getRowMenuItems = (record: Record<string, unknown>): RowMenuItem[] =>
    record.is_agent ? [{ key: 'manage-api-keys', label: t('Manage API keys'), icon: KeyRound, onClick: () => {} }] : []

  return <EntityView {...props} getRowMenuItems={getRowMenuItems} />
}
```

Rules:

1. Name the file after the table with its first character upper-cased, in the
   module's folder: `views/{moduleId}/{ComponentName}.tsx`.
2. Export a component with that same name. The resolver tries it first.
3. Render `<EntityView {...props} … />` and pass only the callbacks the table needs.
   Never fork the grid or the form.
4. Use `useT()`. `translate()` is banned under `components/**`, because it cannot
   re-render a component when the language changes.
5. A new file has no entry in `eslint-suppressions.json`, so it must lint clean.

## Testing

Tests for this folder run in the Vitest `browser` project (real Chromium) against
the real test tenant. Nothing is mocked; `src/test/substitutions.test.ts` fails the
suite on a new substitution.

- **Render through the app's providers:** `bootApp()` and `renderInApp()` from
  `src/test/appHarness.tsx`. At pathname `/`, `EntityView` is in plain list mode.
- **Create rows out of band**, never through the code under test: the `modules`
  fixture in `src/hooks/useTableMutations.test.tsx` writes `_vitest_`-prefixed rows
  with a raw request and deletes them by that prefix in `afterEach`, so a test that
  throws still cleans up.
- **Drive Base UI menus with arrow keys**, never pointer clicks on items and never
  typeahead: see `arrowTo()` in `src/components/layout/NavUser.test.tsx`.
- **Disable the i18n collector** (`disableCollector()`) in any test that renders
  fixture data, or the fixture's text is recorded into `en-US.json`.

## Files here that are not live

Kept on purpose; do not copy them as examples.

- `View.txt` — an old copy of the generic view, not compiled.
- `admin/Modules0.tsx` — a metadata dump page; the resolver never loads it, because
  it looks up `Modules.tsx`.
- `crm/XCustomers.tsx`, `crm/XRegions.tsx` — re-export `EntityView`. They would be
  resolved only for a `crm` table named `xCustomers` or `xRegions`, which does not
  exist.
