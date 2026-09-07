# Semantius App

The open-source UI of [Semantius](https://github.com/semantius/semantius) — the SPA served on the `*.semantius.app` sites and the web interface for [semantius-self-hosted](https://github.com/semantius/semantius-self-hosted). The entire app is rendered from the **pg_semantius** metadata schema: adding a table to your data model gives you a full UI with zero frontend code.

- **Static SPA** — no server-side code; deploy the built files to any static host or CDN
- **Metadata-driven** — screens generated from the pg_semantius schema, not hand-coded per table
- **Modern stack** — React 19, TypeScript, Vite, TanStack Router + Query, shadcn/ui, Tailwind CSS v4
- **OAuth2/OIDC + PostgREST** — PKCE login and direct browser-to-API data access, no backend glue
- **Customizable** — brandable theming, per-view overrides, chart plugins, config-driven menus
- **Agent-optimized** — self-provisioning workspace and in-repo instructions for AI coding agents
- **MIT licensed**

## Monorepo Structure

```
├── .agents/skills/                 # Skills for AI agents (agent-browser, shadcn)
├── .claude/                        # Claude Code settings and hooks
├── .devcontainer/                  # DevContainer configuration
├── .github/workflows/              # Checks, Copilot setup, Docker publish
├── apps/
│   ├── web/                        # Main React application
│   │   ├── src/
│   │   │   ├── charts/             # Custom chart plugins (drizzle-cube)
│   │   │   ├── components/         # UI components, layout, forms, tables
│   │   │   │   ├── ui-ext/         # Hand-written components on shadcn primitives
│   │   │   │   └── views/          # Per-table view overrides (generic View.tsx fallback)
│   │   │   ├── contexts/           # Auth context
│   │   │   ├── hooks/              # Data fetching, auth, permissions
│   │   │   ├── routes/             # TanStack Router file-based routes
│   │   │   ├── lib/                # API client, runtime config, utilities
│   │   │   └── global.css          # Tailwind v4 config
│   │   ├── public/config.js        # Runtime config placeholders (window.__ENV__)
│   │   └── scripts/genconfig.js    # Interactive OAuth config tool
│   └── load-tests/                 # k6 load-test scenarios
├── docker/                         # Runtime-configurable nginx image (GHCR)
├── packages/
│   └── sem-schema/                 # Custom JSON Schema vocabulary
├── workplace/                      # Setup, deploy, and PR-gate scripts (setup.sh, wrangler.jsonc)
├── release.sh                      # Cuts a release: version bump + tag → Docker publish
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

### Human / local clone

```bash
bash workplace/setup.sh
```

### DevContainer

Open in VS Code and choose **Reopen in Container**. Setup runs automatically.

### GitHub Copilot coding agent

The `copilot-setup-steps.yml` workflow runs setup before each agent session. One-time configuration required:

**Repository secrets** — `DOTENV_PRIVATE_KEY` must be added in two places:

- **Actions** (Settings → Secrets and variables → Actions) — used by CI.
- **Copilot environment** (Settings → Environments → copilot) — used by the Copilot coding agent.

**Allowed domains** (Settings → Copilot → Policies):

- `cloudflare.com`
- `workers.dev`

## Configure OAuth

```bash
pnpm --filter @semantius/frontend genconfig
```

This interactive tool offers two options:

1. **Auto-configure from OIDC discovery endpoint** (recommended) — provide your well-known URL and the script fetches all endpoints automatically
2. **Manual setup** — creates `.env` from template for manual editing

The app validates configuration on startup and shows a friendly error page if credentials are missing or contain placeholder values.

Common OIDC discovery URLs:

- Auth0: `https://DOMAIN.auth0.com/.well-known/openid-configuration`
- Keycloak: `https://HOST/realms/REALM/.well-known/openid-configuration`
- Azure AD: `https://login.microsoftonline.com/TENANT/.well-known/openid-configuration`
- Google: `https://accounts.google.com/.well-known/openid-configuration`

> **Auth0 note:** Auth0 may return JWE (encrypted) tokens instead of JWT by default. PostgREST requires standard JWT. Fix: set signature algorithm to RS256 in your Auth0 app settings and ensure the API token format is JWT.

## Development

```bash
pnpm dev                # Start all apps (Vite HMR at http://localhost:5173)
pnpm build              # Build all apps
pnpm lint               # Lint all apps
pnpm test               # Run tests
pnpm preview:wrangler   # Deploy to Cloudflare branch preview
```

## Environment Variables

Secrets are managed with [dotenvx](https://dotenvx.com/). The encrypted `.env` file is committed to the repo — values are encrypted with a public key so the file is safe in version control. The private decryption key lives in `.env.keys`, which is gitignored and must never be committed.

### OAuth

The callback url is /oauth2_callback like http://localhost:5173/oauth2_callback

| Variable                       | Description                                 |
| ------------------------------ | ------------------------------------------- |
| `VITE_OAUTH_CLIENT_ID`         | OAuth client ID                             |
| `VITE_OAUTH_AUTH_ENDPOINT`     | Authorization endpoint                      |
| `VITE_OAUTH_TOKEN_ENDPOINT`    | Token endpoint                              |
| `VITE_OAUTH_SCOPE`             | OAuth scopes (e.g., `openid profile email`) |
| `VITE_OAUTH_USERINFO_ENDPOINT` | OIDC userinfo endpoint                      |
| `VITE_OAUTH_LOGOUT_ENDPOINT`   | Logout endpoint                             |
| `VITE_OAUTH_LOGOUT_REDIRECT`   | Post-logout redirect URI                    |
| `VITE_OAUTH_AUDIENCE`          | API audience (required for Auth0)           |
| `VITE_OAUTH_CONFIG`            | OIDC discovery URL (`.well-known/openid-configuration`) — fills any blank endpoints at boot |

### API

| Variable               | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `VITE_API_BASE_URL`    | PostgREST API base URL                                     |
| `VITE_API_TYPE`        | Optional — set to `"supabase"` if using Supabase           |
| `VITE_SUPABASE_APIKEY` | Supabase anon key (required when `VITE_API_TYPE=supabase`) |
| `VITE_CONTROL_PLANE_URL` | Semantius control plane (default on) — set to an explicit empty value for self-hosted |
| `VITE_CONTROL_PLANE_ORG` | Org slug when using the control plane                    |
| `VITE_CUBE_API_URL`    | Cube.js analytics API URL (defaults from the tenant)       |

### User Interface

The account menu in the sidebar footer is configuration-driven — see
`apps/web/src/lib/userMenu.ts`.

| Variable             | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| `VITE_BACKEND_TYPE`  | `cloud` (default), `self_hosted`, or `custom`. Selects the built-in account menu.  |
| `VITE_UI_CUSTOMIZER` | Required when `VITE_BACKEND_TYPE=custom` — JSON defining the account menu.         |

Built-in menus:

| `VITE_BACKEND_TYPE` | Entries                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloud`             | Settings → `/settings?orgid={orgid}` · Profile → `https://app.semantius.com/settings?orgid={orgid}` · Platform → `…/settings/organization?orgid={orgid}` *(admin)* |
| `self_hosted`       | Account → `/idp/account` · User Manager → `/idp/admin` *(admin)* — both `redirect`                                                                          |

`VITE_UI_CUSTOMIZER` takes a JSON object; each entry needs `title` and `url`, plus
two optional keys — `permission` hides the entry from users who do not hold it
(checked against `permissions` from `/rpc/get_userinfo`), and `target` picks how
it navigates. Single-quote the value so the shell and dotenv pass it through
literally:

```
VITE_BACKEND_TYPE=custom
VITE_UI_CUSTOMIZER='{"user":{"menu":[{"title":"Account","url":"/idp/account","target":"redirect"},{"title":"Admin","url":"/idp/admin","permission":"admin","target":"redirect"}]}}'
```

| `target`   | Behavior                                                                       |
| ---------- | ------------------------------------------------------------------------------ |
| `default`  | *(omitted)* routes inside the app; an absolute `http(s)://` url navigates away |
| `redirect` | full page load in the same tab — the server decides who serves the url         |
| `newtab`   | opens in a new tab, leaving the app running                                    |

Use `redirect` for any **same-origin path a different server answers** — a
reverse-proxied `/idp/*`, for example. Without it the app's catch-all route
matches such a path and renders a 404 that only "fixes itself" when the user hits
refresh.

`{orgid}` in any url is replaced at startup with the org slug (empty when there is
no control plane). An unknown `VITE_BACKEND_TYPE` or `target`, or a missing or
malformed `VITE_UI_CUSTOMIZER`, stops boot with a configuration-error screen.

### Deployment

| Variable                | Required | Description                                                  |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Yes      | Cloudflare API token for Wrangler deployments                |
| `CLOUDFLARE_ACCOUNT_ID` | Yes      | Cloudflare account ID                                        |
| `NOTIFY_WEBHOOK_URL`    | No       | Slack or compatible webhook — sends preview URL after deploy |

**Adding or rotating a secret:**

```bash
dotenvx set KEY value
```

**Running with secrets decrypted** (dotenvx injects them at runtime):

```bash
dotenvx run -- <command>
```

## Deployment

### Cloudflare Workers (branch previews)

```bash
pnpm preview:wrangler
```

Each branch gets its own preview URL, written to `.preview-url.md` at the repo root.

### Docker (self-hosted)

A runtime-configurable nginx image is published to `ghcr.io/semantius/semantius-app` (multi-arch) — this is how [semantius-self-hosted](https://github.com/semantius/semantius-self-hosted) consumes the app. The bundle is built once against placeholder config; at container start `window.__ENV__` is regenerated from the container environment, so one image serves any deployment without a rebuild. See [docker/README.md](docker/README.md).

Releases are cut with `./release.sh vX.Y.Z` — the tag push triggers the Docker publish workflow and the GitHub Release.

## Packages

### sem-schema

Custom JSON Schema vocabulary with additional validation features for form rendering and data validation. See [packages/sem-schema/README.md](packages/sem-schema/README.md) for full documentation.

Key features:

- Custom formats: `json`, `html`, `text` (plus all standard ajv-formats)
- `inputMode` keyword: `required`, `readonly`, `disabled`, `hidden`, `default`
- `precision` keyword for decimal place validation
- Used by the form components to drive field rendering and validation

## Internationalization

The UI ships in **`en-US`** (the source language) and **`de-DE`**. A user picks a
language and, separately, a number and date format in the account menu at the
bottom of the sidebar.

### The API

```ts
const t = useT()                                // inside a component
import { translate, msg } from '@/i18n'         // everywhere else

t('Enter a valid email address')
t('Delete {label}?', { label: singularLabel })
t('{count, plural, one {# row} other {# rows}} selected', { count })
t({ message: 'Right', context: 'direction' })   // two meanings, same word
<Trans id="Delete <bold>{name}</bold>?" values={{ name }} components={{ bold: <strong /> }} />

const MENU = [{ title: msg('Settings'), url: '/settings' }]   // rendered with t(entry.title)
```

**The English source text is the key.** There are no message ids to invent, so a
label on screen is found by grepping for the words on it, and adding a string is
one edit in the file that renders it.

**Two names on purpose.** `translate()` is a module function and cannot re-render
a component when the language changes, so components use `useT()` and everything
outside React — a route's `head()`, `main.tsx`, the three class components — uses
`translate()`. An ESLint rule enforces the split. `useT()` needs no provider; only
`<Trans>` does.

`msg()` returns a descriptor rather than a string, so a constant declared for
later rendering is an object: passing it into JSX without `t()` is a `tsc` error
instead of a silently untranslated English string.

Two preferences, resolved separately: **`language`** picks the catalog (`de-DE`),
**`locale`** drives every `Intl` call, date-fns and `localeCompare` (`de-CH`).
Formatting helpers take `useFormattingLocale()`, never the catalog language.

### Adding or changing a string

1. Write it with `t()` / `translate()` / `<Trans>`.
2. `pnpm --filter @semantius/frontend i18n:extract` — regenerates
   `apps/web/src/locales/en-US.json` (the index: every message with its origin
   files and ICU placeholders) and adds the new key to every catalog with an
   empty value.
3. Fill in the German in `apps/web/src/locales/de-DE.json`. **In the same PR** —
   the source string IS the key, so rewording one orphans its translations
   (they move to `obsolete`) and the new wording is missing until translated.
4. `pnpm --filter @semantius/frontend i18n:status` prints `0 missing` before the
   PR merges.

`apps/web/src/locales/TRANSLATION-GUIDE.md` is the brief for whoever does step 3,
including the fixed product terms. `en-US.json` is generated and committed like
`routeTree.gen.ts`; never hand-edit it.

### Adding a language without a rebuild (operators)

A self-hosted operator adds a language by dropping a file next to the deployed
app and naming it in the customizer. No rebuild, no repo change.

1. Write `<code>.json` against
   [`/locales/schema.json`](apps/web/public/locales/schema.json), which the build
   serves — point your editor's `$schema` at it. `apps/web/src/locales/de-DE.json`
   is a worked example of the `messages` half.
2. Put it where the app is served from: `apps/web/public/locales/` in this repo's
   own builds, `/usr/share/nginx/html/locales/` in the Docker image (mount a
   volume or copy it in — see [`docker/README.md`](docker/README.md)).
3. Register it in `VITE_UI_CUSTOMIZER`, alongside the user menu it already
   carries. In `docker/.env` the JSON must stay on ONE line; the parser is
   line-based.

   ```json
   {"user":{"menu":[]},
    "locales":{"default":"de-DE",
               "available":[{"code":"fr-FR","name":"Français","url":"/locales/fr-FR.json"}]}}
   ```

   `url` defaults to `/locales/<code>.json`. `name` is the language's own name
   for itself and wins over the browser's display name — that is how a tag the
   browser has never heard of still reads as a language in the menu.
   `locales.default` is what a browser with no saved preference gets; it never
   overrides a choice someone has made.

A malformed registration **blocks boot** with a message quoting the key, the same
way a broken `VITE_OAUTH_CONFIG` does. A registration pointing at a file that is
not there reads as "no such language" and the app stays in English — the loader
requires `content-type: application/json`, because a web server with a SPA
fallback answers a missing file with the app's own HTML and a 200.

What a deployment file can carry, beyond `messages` and `contexts`:

- **`labels`** — model-label overrides for tables, columns, enum values and
  modules (see below).
- **`server`** and **`rule`** — messages the backend produces, looked up verbatim
  and never ICU-compiled.

What it **cannot** do, and there is no workaround short of the tenant table: no
queue (requests stay in the browser's `localStorage`), no saving from inside the
app, no "changed since translated", no `obsolete`.

### Model labels — table, column and enum names

Table, column, enum and module labels come from the semantic model, not from the
code, so no extractor can see them and `i18n:status` can never report them. Their
keys are:

| Scope    | Key |
| -------- | --- |
| `table`  | `customers.singular_label` / `.plural_label` / `.description` |
| `column` | `customers.status.title` / `.description` / `.relationship_label` / `.singular_label_parent` / `.plural_label_parent` |
| `enum`   | `customers.status.active` — the **stored value**, never its English label |
| `module` | `crm.name` / `crm.description` |

Overrides apply at render: the model itself is unchanged, filters and comparisons
keep using the stored values, and switching language re-renders the grid without
refetching the schema.

Their inventory comes from the model itself:

```bash
dotenvx run --quiet -- node apps/web/scripts/i18n/labels.mjs --locale de-DE
dotenvx run --quiet -- node apps/web/scripts/i18n/labels.mjs --locale fr-FR \
  --file apps/web/public/locales/fr-FR.json
```

It prints every label the model carries with no translation, every translation
whose key the model no longer has (**orphaned** — a renamed table or a dropped
field; deleting one is a translator's call, so it is reported and never pruned),
and writes a skeleton to fill in. **Run it after any model change**: an agent that
has just created an entity or a field has produced English labels that nothing
else in this repo knows about.

### Tenant translations (`ui_translations`)

A cloud customer translates their own deployment by writing rows into a table in
their own database, editable through the app's own admin grid like any other
entity. One row per translated item — so a save never read-modify-writes a whole
file, and two translators cannot clobber each other.

```sql
create table ui_translations (
  id          bigint generated always as identity primary key,
  locale      text not null,                       -- BCP-47, e.g. 'de-DE'
  scope       text not null default 'message'
              check (scope in ('message', 'table', 'column', 'enum', 'module', 'server', 'rule')),
  key         text not null,                       -- message: the source text
                                                   -- table:  'accounts.plural_label'
                                                   -- column: 'accounts.status.title'
                                                   -- enum:   'accounts.status.active'
                                                   -- module: 'crm.name'
  context     text not null default '',            -- message context, '' when none
  translation text not null default '',            -- '' = requested, not yet translated
  origin      text,                                -- where the app met it: a route, a rule, an RPC
  requested_by text,                               -- who met it first; set by a trigger from the JWT
  first_seen  timestamptz not null default now(),
  updated_by  text,                                -- who translated it last; set by a trigger
  updated_at  timestamptz not null default now(),
  unique (locale, scope, key, context)
);
```

The rest of the migration, all in the same change:

- a `before insert` trigger setting `requested_by` from the JWT when
  `translation` is empty (type and default as `user_bookmarks.user_id`), and a
  `before update` trigger setting `updated_at` / `updated_by`;
- policies: insert when `translation` is empty and `requested_by` is the caller,
  **or** when the caller holds `translations.edit`; update and delete need
  `translations.edit`. (An upsert is an insert first, and a translator's plain
  insert carries a non-empty translation.)
- semantic-model registration so the grid renders it: entity `ui_translations` in
  the `admin` module, singular "Translation", plural "Translations",
  `id_column: id`, `label_column: key`, `scope` an enum field, `requested_by` /
  `first_seen` / `updated_by` / `updated_at` read-only, `edit_permission` set to a
  dedicated `translations.edit` permission; every authenticated user may read;
- `language` and `locale` columns on `users` (nullable — null means "browser
  default"), returned by `get_userinfo`, and a `set_user_preferences(language,
  locale)` RPC that updates the caller's own row.

The app **probes for none of it**. A definitive `PGRST205` / `42P01` disables the
tenant layer, a definitive `PGRST202` disables the preference write-back for the
session, and a `get_userinfo` with no `language` field at all leaves this
browser's own cached choice alone. A bare 404 means none of those — the tenant's
serverless PostgREST answers one to the first request after an idle period, and
the fetch interceptor retries it.

**The queue.** Every string the running app fails to translate becomes a row with
an empty translation: a code string with no catalog entry, a model label with no
override, and — the ones nothing else can find — a PostgREST message, an RPC's
`raise`, a message authored in a model validation rule. They are inserted with
`Prefer: resolution=ignore-duplicates`, so a request can never overwrite a
translation. A German user meeting an untranslated backend error at 3am leaves a
row with their id, the time and the route they were on.

```bash
# what is outstanding, including the queue and the model labels
dotenvx run --quiet -- node apps/web/scripts/i18n/status.mjs --tenant --locale de-DE

# everything still needed, as one file for an agent to fill in
dotenvx run --quiet -- node apps/web/scripts/i18n/translate.mjs --locale de-DE
#   -> apps/web/.i18n/work-de-DE.json  (git-ignored; schema: /locales/work.schema.json)

# write it back: rows on the tenant, code strings into the repo catalog
dotenvx run --quiet -- node apps/web/scripts/i18n/import.mjs --locale de-DE

# take a language out as a file, or copy tenant translations into repo gaps
dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE --out /tmp/de-DE.json
dotenvx run --quiet -- node apps/web/scripts/i18n/export.mjs --locale de-DE \
  --messages-into apps/web/src/locales/de-DE.json
```

`import.mjs` **refuses the whole file** on any failure — an unknown key, a
translation that drops or invents an ICU placeholder, one that does not compile.
None of those are visible in a diff of a thousand entries, and all of them are
cheap to catch there. `server` and `rule` text is exempt from the compile check:
it is looked up verbatim and may legitimately contain braces.

All of these need the repo root's `.env` (hence `dotenvx run` rather than a
package script). They resolve the tenant through the control plane, the way the
accessibility audit does; a self-hosted deployment sets `SEMANTIUS_TOKEN` and
passes `--api-url` instead.

**Terminology overrides.** A row with `locale = 'en-US'` replaces the English for
that tenant — "Customer" → "Patient" — because the source language's layers are
merged like any other. For a model label the model itself is usually the better
place, since renaming `singular_label` changes every screen in every language; an
`en-US` label row is for a tenant that must keep the model's term but show
another word.

### Finding what is missing

- `pnpm --filter @semantius/frontend i18n:status -- --verbose` — per language:
  total, translated, missing with their origin files, obsolete.
- `git diff` after `i18n:extract` — every new key appears with an empty value.
- `pnpm check` — `src/test/i18nCatalogs.test.ts` runs the real extractor in
  memory and **fails** when the index or a catalog is out of date, when a
  translation's ICU placeholders differ from its source, when a value does not
  compile, or when a repo catalog carries a section that belongs to a tenant. It
  only **reports** a missing translation: that renders in English, which is a
  degraded screen rather than a broken build.
- In the app, a missing string simply renders in English.

### Enforcement

`lingui/no-unlocalized-strings` is an error for `apps/web/src`, with three
exclusions: `src/charts/**` (our drizzle-cube chart override, which renders
inside a third-party product with its own i18n), test files and their helpers
(a test's strings are assertions and fixtures, never anything on a screen), and
`src/i18n/*.ts` (locale tags, storage keys and `Intl` options — machinery). The
strings that had not been migrated when the rule was turned on are recorded once
in `apps/web/eslint-suppressions.json`; each phase migrates files and runs
`npx eslint --prune-suppressions`, so the counts only fall and a partially
migrated file is still enforced for anything new.

`react-hooks/exhaustive-deps` is an error for `apps/web/src` through the same
baseline: `useT()` returns a new function per language, so `t` belongs in the
dependencies of any `useMemo`, `useEffect` or `useCallback` that calls it.

The rule has two blind spots worth knowing. On a plain HTML tag it only checks
the `placeholder`, `alt`, `aria-label` and `value` attributes, so a `title=` on a
`<span>` is invisible to it (on a component, every attribute is checked). And it
treats a JSX element named `Select`, `Plural` or `SelectOrdinal` as one of
Lingui's own ICU components and skips **every** string inside it — which shadcn's
`<Select>` collides with head-on. That one is closed rather than documented: those
tag names are banned by `no-restricted-syntax`, so the select is imported as
`Select as SelectRoot` and the rule sees the whole subtree again.

### Validation messages

`validateData()` in `sem-schema` returns raw Ajv errors, and Ajv writes them in
English inside the validator. `apps/web/src/components/form/validationMessages.ts`
translates that array with [`ajv-i18n`](https://github.com/ajv-validator/ajv-i18n)
(MIT, 23 languages), keyed by the LANGUAGE SUBTAG (`de` for `de-DE`); a language
it does not ship keeps the English Ajv produced. `sem-schema` itself stays free of
any locale. Its two custom keywords — `inputMode` and `precision` — are not Ajv's,
so their messages are ours and are written with `t()` *after* the localizer runs
(`ajv-i18n` rewrites every keyword it does not recognize).

## Accessibility

**Target: WCAG 2.2 Level AA. The honest shape of this claim is _supports with
exceptions_.**

**→ [ACCESSIBILITY.md](ACCESSIBILITY.md) is the current status**: what passes,
the criteria that do not and where they fail, the mobile and 320px picture, what
the claim does not cover, and how to re-derive all of it.

### Scope

The claim covers the routes and components in this repository. It does **not**
cover:

- **The drizzle-cube `AnalyticsDashboard`** rendered on `/<module>/` — third-party,
  ships its own `dc-*` design tokens outside this app's palette, and lays out with
  `react-grid-layout`. It is excluded from the automated audit and nothing here
  asserts anything about it. It is still a route users visit; scoping it out bounds
  the work, not the user's experience.
- **`apps/web/src/charts/`**, which only renders inside that dashboard.
- **`/form-playground`**, a developer tool with no accessibility or responsive
  requirement.

2.5.7 Dragging Movements is confirmed satisfied for the dnd-kit interactions this
app owns (row reordering has a keyboard sensor); it is **not** confirmed for
`react-grid-layout` inside the excluded dashboard.

### Switching the shadcn theme

**Stock shadcn is not WCAG AA**, and that is not specific to this project — the
default `base-rhea` palette measures, on a white page:

| | stock | needs |
| --- | --- | --- |
| form-control fill (`bg-input/50`), with `border-transparent` | 1.12:1 | 3:1 |
| focus ring `--ring` vs the page | 2.59:1 | 3:1 |
| focus ring vs a `bg-input/90` fill | 2.11:1 | 3:1 |
| `::placeholder` on a field | 4.30:1 | 4.5:1 |
| `--muted-foreground` on `--muted` | 4.41:1 | 4.5:1 |
| `text-destructive` on its own `/10` tint | 4.05:1 | 4.5:1 |

So the palette is **two files**, and the split is what keeps a theme switch safe:

- `apps/web/src/global.css` — **stock CLI output, kept that way.** It is the
  `tailwind.css` target in `components.json`, so `shadcn init` and a `--preset`
  apply rewrite its `:root` / `.dark` blocks. Never correct a token here; it will
  be silently restored on the next CLI run.
- `apps/web/src/theme-a11y.css` — the corrections. The CLI knows nothing about
  this file. `main.tsx` imports it immediately after `global.css`, so its
  identical-specificity `:root` / `.dark` blocks win on source order.

To switch theme:

```bash
npx shadcn@latest init --preset <new-preset>      # rewrites global.css only
pnpm --filter @semantius/frontend a11y:tokens     # what the new surfaces need
# edit apps/web/src/theme-a11y.css with the suggested values
pnpm check                                        # the contrast matrix must pass
```

**A theme switch is not free.** Every value in `theme-a11y.css` was derived
against base-rhea's specific surfaces — the darkest being `bg-input/90` over
`--sidebar`. A different palette moves those, and the corrections are not
guaranteed to still clear 3:1. What the arrangement guarantees is that the
switch cannot break conformance *quietly*:
`apps/web/src/test/tokenContrast.test.ts` recomputes the whole matrix from
whatever the tokens currently hold, and separately asserts that the override file
is still imported and still imported last. `a11y:tokens` then prints the minimum
value each token needs, so re-deriving is one command rather than an
investigation.

## Browser and device support

- Modern evergreen browsers (Chrome, Edge, Firefox, Safari). The UI uses
  `oklch()` colors, CSS container queries, `:has()` and `inert`.
- Phones and tablets from **320px** wide. Below `48rem` (Tailwind's `md:`) the
  sidebar becomes a sheet, form fields go to a single column, and data-grid column
  pinning is disabled — at that width a pinned column consumes most of the viewport
  and puts everything else permanently underneath it. 320px is also WCAG 1.4.10's
  reflow floor (1280px at 400% zoom); where the layout currently falls short of it
  is in [ACCESSIBILITY.md](ACCESSIBILITY.md#the-mobile-picture).
- Both light and dark themes, following the OS preference by default
  (`prefers-color-scheme`) with an explicit override in the account menu.
- `prefers-reduced-motion` is honored globally.

## Browser Automation (agent-browser)

`agent-browser` provides headless browser control for AI agents — navigation, clicks, form fills, snapshots, and screenshots.

```bash
agent-browser open <url>
agent-browser snapshot                   # get accessibility tree with element refs
agent-browser click @ref
agent-browser fill @ref "value"
agent-browser screenshot --full <path>
```

Skill documentation: `.agents/skills/agent-browser/SKILL.md`

## Multi-Agent Support

The workspace provisions itself via `workplace/setup.sh` (installs global deps, Playwright browsers, and project dependencies). It is idempotent — versioned so re-runs are skipped when already up to date.

| Environment                 | How setup runs                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| GitHub Copilot coding agent | `.github/workflows/copilot-setup-steps.yml` runs `setup.sh` before the agent session |
| Claude Code sandbox         | `.claude/settings.json` hooks run `setup.sh` on `SessionStart`                       |
| DevContainer                | `postCreateCommand` in `.devcontainer/devcontainer.json`                             |
| Human clone                 | `bash workplace/setup.sh`                                                            |

## License

MIT
