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

## Accessibility

**Target: WCAG 2.2 Level AA. The honest shape of this claim is _supports with
exceptions_, and the exceptions are named below.** A bare "conforms to WCAG 2.2
AA" would be worth less than nothing here: an omitted exception reads as a claim
that the excepted part conforms too.

### Scope

The claim covers the routes and components in this repository. It does **not**
cover:

- **The drizzle-cube `AnalyticsDashboard`** rendered on `/<module>/` — third-party,
  ships its own `dc-*` design tokens outside this app's palette, and lays out with
  `react-grid-layout`. It is excluded from the automated sweep and nothing here
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

### How it is evaluated

Four layers, because no single one can see everything:

| Layer | Runs | Answers |
| --- | --- | --- |
| Token contrast (`apps/web/src/test/tokenContrast.test.ts`) | node, in `pnpm check` | Is the palette itself conformant, on every surface a control can sit on — including pairs no current route happens to render? |
| Component tests in Chromium (the `browser` Vitest project in `apps/web/vite.config.ts`) | Playwright-driven Chromium, in `pnpm check` | Is every form control named, described and operable as actually rendered — real CSS, real popovers, the code-split editors mounted — and, for the triggers that name themselves, what name does Chrome's own accessibility tree compute? |
| Lint (`eslint-plugin-jsx-a11y`) | `pnpm lint` | Are there static ARIA/markup defects? Frozen violations live in `apps/web/eslint-suppressions.json` (3) with a further 3 documented inline as `eslint-disable-next-line`; a new one fails the gate. |
| Route sweep (`scripts/a11y-sweep/`) | a real browser, against a deployed preview | axe-core plus the things axe cannot see: `::placeholder` contrast, rendered focus indicators, 320px reflow measured on descendants, 2.4.11 focus-not-obscured, `<title>` uniqueness, `<h1>` presence. |

```bash
# Against a deployed preview (needs SEMANTIUS_API_KEY via dotenvx):
pnpm preview:wrangler
dotenvx run -- node scripts/a11y-sweep/run.mjs --url "$(grep -oE 'https://\S+' .preview-url.md)"
```

The sweep walks 16 routes x 6 viewports (320/390/640/768/1024/1440) x light and
dark, plus a landscape phone (844x390), and writes a JSON artifact per run to
`a11y-reports/`. Output is keyed by **success criterion**, not by route, using the
report vocabulary: Supports / Partially Supports / Does Not Support / Not
Applicable / **Not Evaluated**.

Two rules make that output trustworthy:

- **A criterion nothing checked reads Not Evaluated, never Supports.** A criterion
  no rule covers is simply absent from an axe payload; rendering absence as a pass
  is the one thing that would make this a dishonest claim.
- **A page the sweep could not measure is INCONCLUSIVE, not a pass.** If the boot
  overlay never came down, the app rendered an error surface, the theme did not
  actually switch, or the page threw, that cell is excluded and the run fails.

### Known limitations

- **29 of the 55 criteria report Not Evaluated, for two different reasons — and
  the difference matters.**
  - **Four** have no machine pass condition, because each asks whether something
    is *good* rather than whether it is *present*: 1.1.1 (is the alt text
    accurate), 2.4.3 (is the focus order meaningful), 2.4.6 (is the heading
    descriptive), 4.1.3 (does the announcement say something useful). For these
    four, and **only** these four, the sweep emits the raw material — every alt
    string, the tab order per route, every heading, every live region — into the
    run artifact, so they are reviewed by reading a diff rather than by running a
    scheduled audit. **Reviewing that evidence is not the same as a
    screen-reader pass, and nothing here claims one was run.**
  - The other **25** are Not Evaluated because **no check covers them at all**.
    They carry no evidence in the artifact (`evidenceCount` is 0 for 51 of the 55
    criteria). Not Evaluated means exactly that — not "passed quietly".
- There are **no scheduled manual accessibility passes and no named owner** for
  them. That is deliberate: a cadence nobody runs decays into a claim nobody can
  support. Everything automatable is automated instead — 2.4.11 included, which is
  usually written off as manual.
- The sweep sees only the routes it visits in the states it reaches. Modal flows,
  error states and empty-vs-populated grids need cases that are not yet written.
- The module tile's background can be overridden per module by authored
  `logo_color` data. No palette check can reach that; its contrast is a data
  question.

## Browser and device support

- Modern evergreen browsers (Chrome, Edge, Firefox, Safari). The UI uses
  `oklch()` colors, CSS container queries, `:has()` and `inert`.
- Phones and tablets from **320px** wide. Below `48rem` (Tailwind's `md:`) the
  sidebar becomes a sheet, form fields go to a single column, and data-grid column
  pinning is disabled — at that width a pinned column consumes most of the viewport
  and puts everything else permanently underneath it.
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
