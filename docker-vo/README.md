# Docker (Caddy variant, archived) — runtime-configurable image

> **This is the previous `docker/` folder, renamed to `docker-vo/`.** It is the
> **Caddy**-based image: static SPA **plus** the `/api` and `/api-docs` reverse
> proxies. The current `docker/` folder is a slimmer, **SPA-only image served by
> nginx** with no proxy routes — use that unless you specifically need the
> single-endpoint proxy described below.
>
> To let both coexist, this variant uses its own names and port: image
> `semantius-app-vo:local`, container `semantius-app-vo`, host port **7071**
> (the SPA-only image keeps `semantius-app` / **7070**). Note that CI still
> publishes `ghcr.io/semantius/semantius-app` from `docker/Dockerfile` (nginx),
> so `docker-compose.ghcr.yml` here pulls the **SPA-only** image, not this one.

A single, environment-agnostic image of the web SPA, served by **Caddy**. Built
**once**, configured **at container start** — no rebuild to point it at a
different API, tenant, or OAuth provider.

Caddy also lets this be the **one exposed endpoint** for a whole stack: it
reverse-proxies `/api` and `/api-docs` to sibling containers (see
[Reverse proxy](#reverse-proxy-single-endpoint)), so PostgREST/Scalar never need
their own published ports.

## How it works

Vite normally inlines `VITE_*` variables into the JS bundle at build time,
binding a build to one environment. This image breaks that binding:

1. The app reads config from a global `window.__ENV__`, loaded from `/config.js`
   before the bundle (via `apps/web/src/lib/runtimeEnv.ts`).
2. The committed `apps/web/public/config.js` holds only placeholder tokens, so
   **local dev and Vercel/Cloudflare builds are unchanged** — they ignore the
   placeholders and use Vite's build-time values.
3. At container start, [`entrypoint.sh`](entrypoint.sh) runs
   [`gen-config.sh`](gen-config.sh) to regenerate `/srv/config.js` from the
   container environment, then execs Caddy — so the running app uses real values.
   (The Caddy image has no `/docker-entrypoint.d/*.sh` hook like nginx, hence the
   explicit entrypoint.)

Value precedence per key:

```
real env var  >  docker-vo/.env  >  built-in default
```

## Reverse proxy (single endpoint)

The [`Caddyfile`](Caddyfile) serves the SPA **and** reverse-proxies two path
prefixes to sibling containers, so the entire stack is reachable through this one
published port:

| Request path | Proxied to (default) | Override env | Prefix |
| --- | --- | --- | --- |
| `/api/*` | `postgrest:3000` | `API_UPSTREAM` | stripped (`/api/customers` → `/customers`) |
| `/api-docs/*` | `scalar:8080` | `DOCS_UPSTREAM` | stripped (`/api-docs/...` → `/...`) |
| everything else | static SPA (`/srv`) | — | — |

- Add the upstreams as services on the **same compose network with no `ports:`**
  (internal-only). See the commented `postgrest`/`scalar` block in
  [`docker-compose.yml`](docker-compose.yml).
- Caddy re-resolves upstream DNS per request, so an upstream that starts later or
  is recreated just works — no `depends_on` ordering, no nginx `resolver` dance.
  When an upstream is absent the route 502s but the SPA still serves.
- To make the **SPA call the proxied API**, set `VITE_API_BASE_URL=/api` in
  `docker-vo/.env` (it otherwise defaults to an absolute external URL, so the proxy
  is opt-in).

### HTTPS

`SITE_ADDRESS` controls the listen address (default `:80`, plain HTTP behind an
outer TLS terminator like Dokploy/Cloudflare/an LB). Set it to a domain to enable
Caddy's automatic HTTPS:

```
SITE_ADDRESS=app.example.com
```

Then also publish `443` (`- "443:443"` in compose) and mount a persistent volume
at `/data` so issued certificates survive restarts.

## Two ways to run

There are two independent modes — pick one:

### A. Develop — build from your working tree and run (local)

```bash
docker-vo/build.sh          # build the LOCAL image (semantius-app:local) — does NOT publish
docker-vo/start.sh          # run the local image (does NOT rebuild) → http://localhost:7071
docker-vo/logs.sh           # follow logs
docker-vo/stop.sh           # stop but KEEP the container (restart with start.sh)
docker-vo/delete.sh         # stop AND delete the container (keeps the image)
```

### B. Run a release — pull and run the PUBLISHED image (GHCR)

```bash
docker-vo/start-published.sh            # pull ghcr.io/…:latest and run → http://localhost:7071
TAG=v1.2.3 docker-vo/start-published.sh # or pin a specific release tag
docker-vo/stop.sh                       # stop (keep) · docker-vo/delete.sh to delete
```

`build.sh` / `start.sh` never push anything. **Publishing happens only in CI**
when a `v*` tag is pushed (see below). The local build is tagged
`semantius-app:local`; the published image is `ghcr.io/semantius/semantius-app`.

The host port defaults to **7071**; override with `WEB_PORT` (env var or a line
in `docker-vo/.env`), e.g. `WEB_PORT=9000 docker-vo/start.sh`.

### Stop / delete

```bash
docker-vo/stop.sh                       # stop but KEEP it → restart with docker-vo/start.sh
docker-vo/delete.sh                     # stop AND delete the container (network too)
docker rm -f semantius-app-vo           # delete directly by container name
docker rmi semantius-app-vo:local       # also delete the local image (reclaim ~108MB)
```

### Plain Docker (no compose)

```bash
docker build -f docker-vo/Dockerfile -t semantius-app-vo:local .
docker run -p 7071:80 --env-file docker-vo/.env semantius-app-vo:local
```

## Configuration

Copy the template and edit it (git-ignored; holds your real values):

```bash
cp docker-vo/.env.example docker-vo/.env
```

Key variables (see `.env.example` for the full list and comments):

| Variable | Purpose |
| --- | --- |
| `VITE_OAUTH_CONFIG` | OIDC discovery URL. When set, the SPA fetches it at runtime and fills the OAuth endpoints below. |
| `VITE_OAUTH_CLIENT_ID` | OAuth client id. |
| `VITE_API_BASE_URL` | PostgREST API base URL. |
| `VITE_OAUTH_*_ENDPOINT` | OAuth endpoints — **usually leave blank** and let `VITE_OAUTH_CONFIG` resolve them; set to override. |
| `VITE_CONTROL_PLANE_URL` / `VITE_CONTROL_PLANE_ORG` | Optional control-plane tenant lookup. |
| `VITE_BACKEND_TYPE` | Account-menu flavor: `cloud` (default), `self_hosted`, or `custom`. |
| `VITE_UI_CUSTOMIZER` | Required with `VITE_BACKEND_TYPE=custom` — single-line JSON account menu. |

**`VITE_OAUTH_CONFIG` shortcut:** instead of setting each `VITE_OAUTH_*_ENDPOINT`,
point `VITE_OAUTH_CONFIG` at a `.well-known/openid-configuration` URL. The **app**
fetches it at boot and maps `authorization_endpoint`, `token_endpoint`,
`userinfo_endpoint`, `end_session_endpoint`, and `scopes_supported` to the
matching config (only the ones you left blank). Discovery now runs in the SPA —
not in `gen-config.sh` — so it works the same in dev/Vercel/Cloudflare/Docker and
the container just passes plain env vars. If the discovery URL is unreachable at
boot, the app shows a blocking configuration-error screen.

### Providing config

Any standard mechanism works — `gen-config.sh` just reads the process env:

- **Compose:** `env_file` in `docker-compose.yml` loads `docker-vo/.env`.
- **docker run:** `--env-file docker-vo/.env` or `-e VITE_API_BASE_URL=…`.
- **Docker secrets / configs:** mount a file and set `ENV_FILE=/path`.
- **Kubernetes / Dokploy / any PaaS:** set plain env vars — **no `.env` file needed**.

### Plain env vars (Dokploy and other PaaS)

The `.env` file is optional. Point the platform at the GHCR image and set the
variables directly; `gen-config.sh` reads them at container start. Recommended:
also set **`ENV_FILE=/dev/null`** so the image's baked demo defaults are ignored
and the config comes solely from your env vars.

Minimal set for a template:

```
ENV_FILE=/dev/null
VITE_API_BASE_URL=https://api.example.com
VITE_OAUTH_CLIENT_ID=your-client-id
# either resolve the OAuth endpoints from discovery…
VITE_OAUTH_CONFIG=https://your-idp/.well-known/openid-configuration
# …or set them explicitly instead of VITE_OAUTH_CONFIG:
# VITE_OAUTH_AUTH_ENDPOINT=…  VITE_OAUTH_TOKEN_ENDPOINT=…  VITE_OAUTH_USERINFO_ENDPOINT=…
```

Optional extras as needed: `VITE_CONTROL_PLANE_URL`, `VITE_CONTROL_PLANE_ORG`,
`VITE_CUBE_API_URL`, `VITE_API_TYPE`, `VITE_SUPABASE_APIKEY`,
`VITE_OAUTH_AUDIENCE`, `VITE_OAUTH_SCOPE`, `VITE_OAUTH_LOGOUT_ENDPOINT`,
`VITE_OAUTH_LOGOUT_REDIRECT`, `VITE_OAUTH_REDIRECT_URI`,
`VITE_BACKEND_TYPE`, `VITE_UI_CUSTOMIZER`.

**Account menu.** `VITE_BACKEND_TYPE` picks the built-in menu — `cloud` (default,
links to app.semantius.com) or `self_hosted` (Account → `/idp/account`, User
Manager → `/idp/admin`, the latter shown only to users with the `admin`
permission). Set it to `custom` and supply `VITE_UI_CUSTOMIZER` to define your
own; `{orgid}` in a url is replaced with the org slug. The `.env` file is parsed
line by line, so the JSON **must be on one line**:

```
VITE_BACKEND_TYPE=custom
VITE_UI_CUSTOMIZER='{"user":{"menu":[{"title":"Account","url":"/idp/account"},{"title":"Admin","url":"/idp/admin","permission":"admin"}]}}'
```

A bad value or malformed JSON stops boot with a configuration-error screen.

### Adjusting a running deployment

Edit `docker-vo/.env`, then `docker compose -f docker-vo/docker-compose.yml restart`.
`config.js` is regenerated on the next start — no rebuild.

## CI / GitHub Container Registry

`.github/workflows/docker-publish.yml` builds and pushes the image to
`ghcr.io/semantius/semantius-app` when a **`v*` tag** is pushed (e.g.
`v1.2.3`), tagging `1.2.3`, `1.2`, and `latest`. It publishes a **multi-arch**
manifest (`linux/amd64` + `linux/arm64`), so it runs on x64 and ARM hosts alike
(cloud VMs, Apple Silicon / Windows-on-ARM via Docker Desktop, Graviton, Pi). The
arm64 leg builds under QEMU emulation, so CI is slower than a single-arch build.
Pull and run it exactly like the local image:

```bash
docker run -p 7071:80 --env-file docker-vo/.env ghcr.io/semantius/semantius-app:latest
```

Cut a release with the helper — it tags the current commit and pushes the tag,
which is what triggers the workflow (multi-arch build + publish):

```bash
docker-vo/release.sh v0.1.0        # tag the current commit + push it
```

It does no local build/push itself — publishing happens entirely in CI.

## Files

| File | Role |
| --- | --- |
| `Dockerfile` | Multi-stage build (`node:22-slim` → `caddy:2-alpine`). |
| `Dockerfile.dockerignore` | BuildKit ignore rules (kept beside the Dockerfile). |
| `gen-config.sh` | Generates `config.js` from env + `.env` (pure env→JS, no curl/jq). |
| `entrypoint.sh` | Container ENTRYPOINT: runs `gen-config.sh`, then execs Caddy. |
| `Caddyfile` | Static serving + SPA fallback + cache headers + `/api` & `/api-docs` reverse proxy. |
| `docker-compose.yml` | LOCAL build/run definition. |
| `docker-compose.ghcr.yml` | Run the PUBLISHED GHCR image (no build). |
| `build.sh` / `start.sh` | Build / run the local image. |
| `release.sh` | Tag the current commit `vX.Y.Z` and push it to trigger the CI publish. |
| `start-published.sh` | Pull + run the published GHCR image. |
| `stop.sh` / `delete.sh` | Stop (keep) / stop + delete the container. |
| `logs.sh` | Follow container logs. |
| `.env.example` | Config template (committed). `.env` is your real values (git-ignored). |
