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
├── BACKEND.md                      # What the app talks to: shapes, endpoints, schema
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
| `VITE_TRANSLATE_MODE` | The translate target's mode: `dev` / `stage` / `prod` / `off`. Unset: `dev` under `pnpm dev`, `off` in every build |
| `VITE_TRANSLATE_API_URL` | The translate target's base, answering `GET/POST {base}/translations`. Unset: the app's own origin in `dev`, the app's own API in `prod`. Required for `stage` |

**→ [BACKEND.md](BACKEND.md)** is the reference for what these point at: the two
deployment shapes, the REST and RPC endpoints, the model schema `get_schema`
returns, and the error codes that mean something specific.

### User Interface

The account menu in the sidebar footer is configuration-driven — see
`apps/web/src/lib/userMenu.ts`.

| Variable             | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| `VITE_BACKEND_TYPE`  | `cloud` (default), `self_hosted`, or `custom`. Selects the built-in account menu.  |
| `VITE_UI_CUSTOMIZER` | Required when `VITE_BACKEND_TYPE=custom` — JSON defining the account menu.         |

> **`VITE_BACKEND_TYPE` does not choose a backend.** Despite the name it moves no
> request: it picks which built-in account menu renders, and nothing else. Where
> the data comes from is `VITE_CONTROL_PLANE_URL` and `VITE_API_BASE_URL` above —
> see [BACKEND.md](BACKEND.md#backend-is-two-independent-settings).

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
t({ id: ['columnVisibility'], message: 'View' })   // two meanings, same word
t({ id: ['module', slug, table, 'entity', 'plural_label'], defaultMessage: table.plural_label })
<Trans id="Delete <bold>{name}</bold>?" values={{ name }} components={{ bold: <strong /> }} />

const MENU = [{ title: msg('Settings'), url: '/settings' }]   // rendered with t(entry.title)
```

**Three call forms, and which field is present is the discriminator.** A
message alone IS its key: there are no message ids to invent, so a label on
screen is found by grepping for the words on it, and adding a string is one
edit in the file that renders it. An `id` plus a `message` prefixes the key
(`columnVisibility.View`) for the one English word that means two things. An
`id` plus a `defaultMessage` is keyed by the id alone, the English being the
fallback — that is how MODEL TEXT is a message: a table's plural label, a
field's title, an enum value, a module's name each have a key built from their
model path, and the model's own English renders where nothing is translated.

`module` is a reserved first segment. A code key may never start with it, and
that one rule is what tells the two kinds apart in a file, a query and a grep:

| Kind | Key |
| --- | --- |
| a module | `module.nwind.name`, `module.nwind.description` |
| an entity | `module.nwind.orders.entity.plural_label` (`singular_label`, `description`) |
| a field | `module.nwind.orders.field.city.title` (`description`, `relationship_label`, `singular_label_parent`, `plural_label_parent`) |
| an enum value | `module.nwind.orders.enum.status.pending` — the **stored value**, never its label |

The attribute vocabulary is the model's own column names. The slug comes from
`get_schema`'s `module_slug`, never from the route: `/$moduleId/$table_name` is
a catch-all, and a parent-filtered view fetches another entity's schema. The
id is passed as segments — the joining and the escaping live inside `t`, so an
enum value with a dot in it is a key like any other.

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

### The files

One flat file per language under `apps/web/public/locales/`, the shape of
[`/locales/schema.json`](apps/web/public/locales/schema.json):

```json
{ "locale": "de-DE",
  "name": "Deutsch",
  "messages": { "Save": "Speichern",
                "columnVisibility.View": "Ansicht",
                "module.nwind.orders.field.city.title": "Stadt" },
  "obsolete": { "…": "…" } }
```

`en-US.json` is the same shape with the SOURCE text as the value of every key:
**the index**, the complete baseline a new language is started from. It is
never loaded as a catalog — the source language's catalog is the English in the
code and the model.

**Discovery is how the index is maintained.** The running app renders a string,
fails to translate it, and records it through the translate target: the key
with its source into `en-US.json`, and an empty entry into the language being
translated. A code message and a piece of model text are recorded the same way
— adding a field to an entity produces a string that appears in the file, the
diff and the PR the moment a screen renders it. Coverage comes from the test
suite: the browser project runs against the dev server, so `pnpm check` is what
fills `en-US.json`, and its diff is the discovery. A code string no test renders
is a test gap, not an i18n gap.

The source scan, `pnpm --filter @semantius/frontend i18n:extract`, is an
**optional tool you run, never a gate**. Its job is pruning: a code string that
was reworded or deleted leaves a key nothing at runtime can observe as gone, and
the scan moves its translations to `obsolete` (`--prune` empties it). It never
touches `module.*` — runtime owns that half — and it reports, without failing,
any code string discovery has never seen.

### Adding or changing a string

1. Write it with `t()` / `translate()` / `<Trans>`, or throw it with `appError()`.
2. Render it — the test that covers the screen is what puts the key into
   `apps/web/public/locales/en-US.json` and an empty entry into `de-DE.json`.
3. Fill in the German in `apps/web/public/locales/de-DE.json`. **In the same PR** —
   the source string IS the key, so rewording one orphans its translation and
   the new wording is missing until translated.
4. `pnpm --filter @semantius/frontend i18n:status` prints `0 missing` before the
   PR merges.

`apps/web/scripts/i18n/TRANSLATION-GUIDE.md` is the brief for whoever does step 3,
including the fixed product terms, and the agent workflow around
`i18n:translate` / `i18n:import`.

### Adding a language without a rebuild (operators)

A self-hosted operator adds a language by dropping a file next to the deployed
app and naming it in the customizer. No rebuild, no repo change.

1. Write `<code>.json` against
   [`/locales/schema.json`](apps/web/public/locales/schema.json), which the build
   serves — point your editor's `$schema` at it. Start from `/locales/en-US.json`,
   the index: every key with its English.
2. Put it where the app is served from: `apps/web/public/locales/` in this repo's
   own builds, `/usr/share/nginx/html/locales/` in the Docker image (mount a
   volume or copy it in — see [`docker/README.md`](docker/README.md)). A file
   that REPLACES a shipped one (`de-DE.json`) needs nothing else.
3. Register a NEW language in `VITE_UI_CUSTOMIZER`, alongside the user menu it
   already carries. In `docker/.env` the JSON must stay on ONE line; the parser
   is line-based.

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

### The translate target

Two sources per language, merged per key, the record over the file: the file
above, and **one record per language** kept by the translate target — where
overrides and customer-added text live, so they survive a product update. The
client speaks one contract everywhere ([`i18n-endpoint-spec.md`](i18n-endpoint-spec.md)):

```
GET  {base}/translations?locale=de-DE   -> { "<key>": "<translation>", … }
POST {base}/translations                { locale, key, translation }
```

The target carries a **mode**, `VITE_TRANSLATE_MODE`. Unset, it is `dev` under
the dev server and `off` in every build:

| Mode | A write goes to | Discovers |
| --- | --- | --- |
| `dev` | this checkout's `public/locales/<code>.json`, through the Vite dev server (the default under `pnpm dev`) | yes |
| `stage` | a host holding a copy of the language files (`VITE_TRANSLATE_API_URL`) | yes |
| `prod` | the per-language record on the app's own API — customizations, or where stage is not possible | no |
| `off` | nothing — the default in a build | no |

`VITE_TRANSLATE_API_URL` is the base; unset, it is the app's own origin in `dev`
and the app's own API in `prod`. In `prod` discovery is the on-screen marking:
a translator finds untranslated text by looking and Alt+clicks it. The
`/translations` endpoint on the tenant's API is the backend's to build; until
it answers, `prod` reads the shipped file only and offers no editing.

**Terminology overrides.** In `prod`, an `en-US` record replaces the English for
that tenant — "Customer" → "Patient" — because the source language's record is
merged like any other. For model text the model itself is usually the better
place, since renaming `singular_label` changes every screen in every language.

### Errors

Every error reaches a screen in one shape, and `renderError` in
`apps/web/src/lib/apiErrors.ts` is the one renderer:

- **An app error** is thrown with `appError({ message, hint?, values?, details? })`
  — an ICU template plus its values, keyed by its own English and rendered at
  DISPLAY time through the component's `t`. `error.message` is the template,
  uninterpolated; the values sit on `cause`. That is what lets a language
  switch re-render an error already on screen, and what makes a throw possible
  from a `queryFn`, a loader or the userinfo effect, none of which can call a
  hook. Developer invariants stay plain `throw new Error`.
- **A platform error** arrives from PostgREST with its envelope in `hint` — a
  JSON object whose `hint` key is the hint template and every other key a value.
  Its `${name}` placeholders are converted to ICU (one pass, braces escaped),
  and it is keyed by its code: the SQLSTATE on the platform's own classes 90
  and 99 (a class-99 key is scoped by `hint.entity`), else `hint.code` where the
  SQLSTATE is spoken for by the HTTP status. The English in the response is the
  fallback. A value the server did not send renders as its own name, never as a
  blank or `NaN`.
- **A plain server sentence** — PostgreSQL's own — is looked up verbatim, never
  ICU-compiled, under its SQLSTATE plus the constraint name where one can be
  parsed (`23505.modules_module_slug_key`), else the bare SQLSTATE, else the
  sentence itself for a codeless gateway rejection. A foreign-key violation on
  delete still gets the model label's sentence.
- **`details`** is shown as text behind the Details toggle and is never a key.

### Finding what is missing

- `pnpm --filter @semantius/frontend i18n:status -- --verbose` — per language:
  total, translated, missing (code and model counted separately), obsolete.
- `git diff apps/web/public/locales` after `pnpm check` — every newly rendered
  key appears in the index and as an empty entry in `de-DE.json`.
- `pnpm check` — `src/test/i18nCatalogs.test.ts` **fails** when a translation's
  ICU placeholders differ from its source, when a value does not compile, or
  when `obsolete` holds a `module.*` key. It only **reports** a missing
  translation — that renders in English, which is a degraded screen rather than
  a broken build — and it only reports a code string the scan sees that no test
  has rendered, which is a test gap.
- In the app, a missing string simply renders in English — and translate mode
  (below) marks it.

### Translate mode

In `dev` and `stage` anyone finds the **Translate mode** switch at the foot of
the **Language** submenu in the account menu; in `prod` anyone holding
`translations.edit` (or `admin`, until the migration that creates the
permission has landed), once the record store answers. With the switch off
nothing is recorded, scanned or marked. With it on:

- Every piece of text on the page that the active language has no translation
  for is **marked** — code strings, model text, the value of an `aria-label` or
  a `placeholder`. The marks are CSS Custom Highlights, so the DOM, the
  accessible names and the layout are untouched. Nothing is marked in `en-US`:
  the source language is never missing anything.
- **Alt+click** or **right-click** any text the app produced to edit its
  translation where it stands (a plain click still does what it always did,
  which is how a menu is opened to reach the entries inside it). The editor
  shows the source and the key, checks the ICU placeholders live and refuses a
  translation that does not compile.
- The floating **Translations** button opens the panel: the whole index — code
  strings and model text in one list, told apart by their keys — with search
  and the filters *all* / *missing* / *on this page*. While the mode is on, the
  Language submenu shows how much the language still lacks.

**There is one writer and no fallback.** Every target speaks the contract above,
and only the base and the mode differ. Translate mode is **not offered at all**
where there is no target: an editor that cannot save is worse than no editor, so
there is no browser draft and no file download.

That split is what keeps corrections honest. Fixing a genuinely wrong shipped
German string is a `dev` change that lands in the repo and goes through a PR; a
`prod` record is an override for that tenant, which is a different thing and
should not be how the source gets fixed.

Two things to know while translating: the marks and the click resolve text AS
RENDERED, so a data value that happens to equal a rendered string (a cell
reading `open` next to an enum labeled `open`) is marked too — read the key in
the editor before saving; and Alt is what the operating system may also use
(Firefox on Windows shows its menu bar on Alt release, some Linux window
managers grab Alt+drag), which is harmless but worth knowing.

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
