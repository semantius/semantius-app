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
