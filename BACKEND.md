# Backend

What the app talks to, how it is pointed at one, and what it expects to find
there. The endpoints and payloads below were read off the running `tests` tenant,
not from memory; where something is not there yet, it says so.

## "Backend" is two independent settings

The names collide, and picking the wrong one is the usual first mistake:

| Variable | Decides | Default |
| --- | --- | --- |
| `VITE_BACKEND_TYPE` | **only which built-in account menu renders** (`cloud`, `self_hosted`, `custom`) | `cloud` |
| `VITE_CONTROL_PLANE_URL` | **where the data comes from** — control plane, or self-hosted | `https://app.semantius.com` |

`VITE_BACKEND_TYPE` does not move a single request. It is a UI setting, described
under [Environment Variables → User Interface](README.md#user-interface). The
data backend is the second row, and it is **opt-out**: the control plane is used
unless `VITE_CONTROL_PLANE_URL` is set to an *explicitly empty* value.

## Two deployment shapes

### Control plane (the default)

The tenant slug is `VITE_CONTROL_PLANE_ORG` when set, otherwise the first label
of the browser's hostname — so production derives the tenant from its subdomain
and a local checkout pins it in `.env`. `initConfig()` then looks the tenant up:

```
GET https://api.semantius.cloud/organization/<slug>
    -> { id, client_id, name, logo, postgrest_url }
```

`postgrest_url` becomes the API base; the OAuth endpoints are built from the slug
rather than returned:

```
https://<slug>.semantius.cloud/api/auth/oauth2/{authorize,token,userinfo}
```

A failed lookup stops boot with a configuration screen rather than failing later
inside a request.

### Self-hosted

Set `VITE_CONTROL_PLANE_URL` to an explicitly empty value and supply the two
halves yourself: `VITE_API_BASE_URL` (absolute — the fetch interceptor needs it,
there is no same-origin `/api` prefix) and either the `VITE_OAUTH_*` endpoints or
a `VITE_OAUTH_CONFIG` discovery URL the app resolves at boot.

## How requests are made

Every call carries the session's bearer token and JSON content type; an `apikey`
header is added only when `VITE_API_TYPE=supabase`. A `/`-relative URL in app code
is rewritten onto the API base by the interceptor in `lib/apiClient.ts`, which is
also what applies the retry policy — a read is retried through a rate limit or a
cold start, a write never is.

All access goes through the generic hooks. There are no table-specific hooks and
no hand-written `useQuery` against the API:

| Hook | For |
| --- | --- |
| `useTable(name, { query, count, enabled })` | any REST read; `query` is a PostgREST query string |
| `useCreateRecord(name, { onConflict })` | insert, or upsert when `onConflict` names a unique constraint |
| `useUpdateRecord(name, idField)` / `useDeleteRecord(name, idField)` | PATCH / DELETE by id |
| `useRpc(name, { params })` / `useRpcMutation(name)` | `POST /rpc/<name>` |

## Endpoints

### REST

Every entity in the model is a PostgREST table. The ones the app itself names,
rather than reaching through the dynamic route:

| Table | Used for |
| --- | --- |
| `tables`, `fields`, `modules` | the semantic model — the sidebar, the schema |
| `users` | the account and admin screens |
| `user_bookmarks` | the favorites star, row-scoped and matched by `url` |

**`tables` is a read view over `entities`**, and the two are not interchangeable:
the columns are identical except that `entities` also carries `order_column`, so
the drag-and-drop ordering column is invisible through `tables` (`get_schema`'s
`table` block does return it). Writes go to `entities`, which is why the
schema-cache refresh below keys on `entities` and `fields` rather than on the
name the app reads from.

Translations are NOT a table the app reads: they are the `/translations`
endpoint below, which the `tests` tenant does not answer yet (`PGRST205`), and
the app disables that layer on that body alone. See
[The translate target](README.md#the-translate-target).

### RPC

| Function | Parameters | Returns |
| --- | --- | --- |
| `get_schema` | `p_table_name` | the JSON Schema for one entity (below) |
| `get_userinfo` | none | `email`, `user_id`, `first_name`, `last_name`, `display_name`, `external_id`, `is_disabled`, `last_seen`, `created_at`, `updated_at`, `roles[]`, `permissions[]`, `modules[]` |
| `list_api_keys` | `p_user_id` (`0` means the caller) | the API keys |
| `generate_api_key` | `p_user_id`, `p_description` | the new key, shown once |
| `delete_api_key` | `p_key_id` | revokes it |
| `set_user_preferences` | `p_language`, `p_locale` | saves the language and formatting locale |

`set_user_preferences` is part of the same outstanding migration and answers
`PGRST202` today, which the app reads as "not available yet" and falls back to a
per-browser cache. `get_userinfo` correspondingly returns no `language` or
`locale` field yet — an **absent** field and a `null` one mean different things,
so both are read with `in`, never a truthiness check.

### The translate endpoint

Translate mode and discovery read and write through the SAME two calls at
every target, and only the base url and the mode differ —
`VITE_TRANSLATE_API_URL` and `VITE_TRANSLATE_MODE`, their own axis (unset, the
mode is `dev` under the dev server and `off` in every build). The full
contract, errors included, is
[`i18n-endpoint-spec.md`](i18n-endpoint-spec.md).

| Mode | Base | A write goes to | Discovers |
| --- | --- | --- | --- |
| `dev` | the Vite dev server (the default under `pnpm dev`) | `apps/web/public/locales/<code>.json` | yes |
| `stage` | a host holding a copy of the language files | that copy | yes |
| `prod` | unset, so this app's own API | the per-language record | no |
| `off` | — | nothing (the default in a build) | no |

```
GET  {base}/translations?locale=de-DE   -> { "<key>": "<translation>", … }
POST {base}/translations                { locale, key, translation }
```

The client sends ONE message; the server merges it into the single
per-language record, and an empty `translation` clears the message. What the
backend has to provide for `prod` is exactly that pair on the tenant's API —
a JSON record per locale — and it does not exist yet. The dev server
implements the same pair over files (`apps/web/vite-plugins/`). Where no target
answers, translate mode is not offered: there is no browser draft and no file
download.

### Not PostgREST

| Call | Why |
| --- | --- |
| `POST https://<slug>.semantius.cloud/refresh-schema-cache` | after a write to `entities` or `fields`, so PostgREST re-reads its schema cache. Deliberately bypasses the interceptor, and its failure is swallowed |
| `POST https://<slug>.semantius.cloud/token` | `client_credentials` with an `x-api-key` header — how `scripts/mint-token.mjs` and the test suite get a token |
| `GET https://api.semantius.cloud/organization/<slug>` | the tenant lookup above |

## The schema

**The UI is generated from the model, not hand-coded per table.** Three tables
hold it, and `get_schema` assembles them into one JSON Schema document per entity:

```
{ $schema, $id, title, description, type, required, additionalProperties,
  table:      { … the entity's own metadata … },
  properties: { <column>: { … JSON Schema + our vocabulary … } },
  children:   [ … child relations … ] }
```

`table` carries `table_name`, `singular_label`, `plural_label`, `description`,
`icon_url`, `module_id`, `view_permission`, `edit_permission`, `id_column`,
`label_column`, `label_parent`, `order_column`, `edit_mode`, `audit_log`,
`computed_fields`, `validation_rules`, `select_rule` and the catalog keys.

**Never assume column names.** `id_column` and `label_column` are what name the
primary key and the display column; `order_column`, when non-empty, is the integer
column that enables drag-and-drop reordering.

Each entry in `properties` is a JSON Schema type plus this project's own keywords
— `ctype`, `inputMode`, `precision`, `width`, `field_order`, `searchable`,
`enum_values`, `reference_table`, `reference_delete_mode`, `unique_value`,
`cube_type`. The vocabulary itself is documented in
[`packages/sem-schema`](packages/sem-schema/README.md); `fields` is where the rows
live, and `apps/web/src/types/metadata.ts` is the TypeScript shape the app reads.

Model text (table, column, enum and module labels) is **data**, so no extractor
can see it and it is translated through its own channel — see
[Model labels](README.md#model-labels--table-column-and-enum-names).

### On the `tests` tenant, today

33 entities across two modules (`admin` and `nwind`, both `domain`), including the
Northwind demo set and the platform's own `users`, `roles`, `permissions`,
`role_permissions`, `user_roles`, `permission_hierarchy`, `webhook_receivers`,
`processes`, `queues` and the two audit logs.

## Error codes that mean something specific

| Code | Meaning | What the app does |
| --- | --- | --- |
| `PGRST205`, `42P01` | the relation is not there | definitive — disables the feature that needs it |
| `PGRST202` | the function is not there | definitive — disables the write-back for the session |
| `23502` | not-null violation | surfaced as the server wrote it |
| bare 404, no body code | the serverless backend was asleep | retried by the interceptor, never read as "missing" |

The distinction in the last row is load-bearing: a cold start and a genuinely
missing table look identical by status, and only the body tells them apart.

## Pointing the app somewhere else

- **Another cloud tenant:** change `VITE_CONTROL_PLANE_ORG`.
- **Self-hosted:** `VITE_API_BASE_URL` plus an explicitly empty
  `VITE_CONTROL_PLANE_URL`.
- **In the Docker image:** the same variables in `docker/.env`, read at container
  start — a restart, not a rebuild. See [`docker/README.md`](docker/README.md).

There are **no per-environment env files** in this repo today. `pnpm dev:neon`,
`dev:supabase` and `dev:cf` only change Vite's `MODE`, which changes the token
storage-key prefix (`SC_<mode>_`) and nothing else — so they isolate sessions
from each other, they do not select a backend. A dev/stage split would be
`.env.dev` and `.env.stage` holding different `VITE_CONTROL_PLANE_ORG` values,
plus scripts that pass `--mode`.
