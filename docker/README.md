# Docker — SPA-only, runtime-configurable image

A single, environment-agnostic image of the web SPA, served by **nginx**. Built
**once**, configured **at container start** — no rebuild to point it at a
different API, tenant, or OAuth provider.

This image serves **only the SPA**. It has no reverse proxy: the app talks
directly to whatever absolute `VITE_API_BASE_URL` you configure. If you need one
published port to also front `/api` and `/api-docs` on sibling containers, use
the Caddy variant in [`../docker-vo/`](../docker-vo/README.md) instead.

## How it works

Vite normally inlines `VITE_*` variables into the JS bundle at build time,
binding a build to one environment. This image breaks that binding:

1. The app reads config from a global `window.__ENV__`, loaded from `/config.js`
   before the bundle (via `apps/web/src/lib/runtimeEnv.ts`).
2. The committed `apps/web/public/config.js` holds only placeholder tokens, so
   **local dev and Vercel/Cloudflare builds are unchanged** — they ignore the
   placeholders and use Vite's build-time values.
3. At container start, [`docker-entrypoint.sh`](docker-entrypoint.sh) — installed
   as `/docker-entrypoint.d/40-gen-config.sh`, which the nginx image runs before
   launching nginx — calls [`gen-config.sh`](gen-config.sh) to regenerate
   `/usr/share/nginx/html/config.js` from the container environment, so the
   running app uses real values.

Value precedence per key:

```
real env var  >  docker/.env  >  built-in default
```

## Two ways to run

There are two independent modes — pick one:

### A. Develop — build from your working tree and run (local)

```bash
docker/build.sh          # build the LOCAL image (semantius-app:local) — does NOT publish
docker/start.sh          # run the local image (does NOT rebuild) → http://localhost:7070
docker/logs.sh           # follow logs
docker/stop.sh           # stop but KEEP the container (restart with start.sh)
docker/delete.sh         # stop AND delete the container (keeps the image)
```

### B. Run a release — pull and run the PUBLISHED image (GHCR)

```bash
docker/start-published.sh            # pull ghcr.io/…:latest and run → http://localhost:7070
TAG=v1.2.3 docker/start-published.sh # or pin a specific release tag
docker/stop.sh                       # stop (keep) · docker/delete.sh to delete
```

`build.sh` / `start.sh` never push anything. **Publishing happens only in CI**
when a `v*` tag is pushed (see below). The local build is tagged
`semantius-app:local`; the published image is `ghcr.io/semantius/semantius-app`.

The host port defaults to **7070**; override with `WEB_PORT` (env var or a line
in `docker/.env`), e.g. `WEB_PORT=9000 docker/start.sh`.

### Stop / delete

```bash
docker/stop.sh                       # stop but KEEP it → restart with docker/start.sh
docker/delete.sh                     # stop AND delete the container (network too)
docker rm -f semantius-app           # delete directly by container name
docker rmi semantius-app:local       # also delete the local image
```

### Plain Docker (no compose)

```bash
docker build -f docker/Dockerfile -t semantius-app:local .
docker run -p 7070:80 --env-file docker/.env semantius-app:local
```

### HTTPS

nginx here listens on plain HTTP (`:80`) only — terminate TLS in front of it
(Dokploy, Cloudflare, a load balancer, or a reverse proxy). The Caddy variant in
`docker-vo/` is the one with built-in automatic HTTPS.

## Configuration

Copy the template and edit it (git-ignored; holds your real values):

```bash
cp docker/.env.example docker/.env
```

Key variables (see `.env.example` for the full list and comments):

| Variable | Purpose |
| --- | --- |
| `VITE_OAUTH_CONFIG` | OIDC discovery URL. When set, the SPA fetches it at runtime and fills the OAuth endpoints below. |
| `VITE_OAUTH_CLIENT_ID` | OAuth client id. |
| `VITE_API_BASE_URL` | PostgREST API base URL. |
| `VITE_OAUTH_*_ENDPOINT` | OAuth endpoints — **usually leave blank** and let `VITE_OAUTH_CONFIG` resolve them; set to override. |
| `VITE_CONTROL_PLANE_URL` / `VITE_CONTROL_PLANE_ORG` | Optional control-plane tenant lookup. |

**`VITE_OAUTH_CONFIG` shortcut:** instead of setting each `VITE_OAUTH_*_ENDPOINT`,
point `VITE_OAUTH_CONFIG` at a `.well-known/openid-configuration` URL. The **app**
fetches it at boot and maps `authorization_endpoint`, `token_endpoint`,
`userinfo_endpoint`, `end_session_endpoint`, and `scopes_supported` to the
matching config (only the ones you left blank). Discovery runs in the SPA —
not in `gen-config.sh` — so it works the same in dev/Vercel/Cloudflare/Docker and
the container just passes plain env vars. If the discovery URL is unreachable at
boot, the app shows a blocking configuration-error screen.

### Providing config

Any standard mechanism works — `gen-config.sh` just reads the process env:

- **Compose:** `env_file` in `docker-compose.yml` loads `docker/.env`.
- **docker run:** `--env-file docker/.env` or `-e VITE_API_BASE_URL=…`.
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
`VITE_OAUTH_LOGOUT_REDIRECT`, `VITE_OAUTH_REDIRECT_URI`.

### Adjusting a running deployment

Edit `docker/.env`, then `docker compose -f docker/docker-compose.yml restart`.
`config.js` is regenerated on the next start — no rebuild.

## CI / GitHub Container Registry

`.github/workflows/docker-publish.yml` builds and pushes **this** image (it
points at `docker/Dockerfile`) to `ghcr.io/semantius/semantius-app` when a
**`v*` tag** is pushed (e.g. `v1.2.3`), tagging `1.2.3`, `1.2`, and `latest`. It
publishes a **multi-arch** manifest (`linux/amd64` + `linux/arm64`), so it runs
on x64 and ARM hosts alike (cloud VMs, Apple Silicon / Windows-on-ARM via Docker
Desktop, Graviton, Pi). The arm64 leg builds under QEMU emulation, so CI is
slower than a single-arch build. Pull and run it exactly like the local image:

```bash
docker run -p 7070:80 --env-file docker/.env ghcr.io/semantius/semantius-app:latest
```

Cut a release with the helper. It bumps the root `package.json` version, commits
that, then creates an **annotated** tag and pushes it — the tag push is what
triggers the workflow:

```bash
docker/release.sh v0.1.3        # prompts for confirmation; -y to skip
```

It refuses to run on a dirty tree, on a branch whose HEAD isn't pushed, on a tag
that already exists, or on a version that isn't newer than the latest tag. It does
no local build/push itself — publishing happens entirely in CI.

CI then does three things: builds the multi-arch image, pushes it to GHCR, and
**creates the GitHub Release**. A pushed tag does not become a Release on its own —
they are separate objects, which is why the Releases page stayed empty before the
`Create GitHub Release` step existed.

Browse the published images here (Releases and Tags do **not** show them — the
zip/tar.gz on the Tags page are GitHub's automatic source archives, unrelated):

```
https://github.com/semantius/semantius-app/pkgs/container/semantius-app
```

A GHCR package is **private on first publish**, so `docker pull` will 403 for
anyone (and anonymously) until you flip it: package page → Package settings →
Change visibility → Public. One-time, per package.

## Files

| File | Role |
| --- | --- |
| `Dockerfile` | Multi-stage build (`node:22-slim` → `nginx:stable-alpine`). |
| `Dockerfile.dockerignore` | BuildKit ignore rules (kept beside the Dockerfile). |
| `gen-config.sh` | Generates `config.js` from env + `.env` (pure env→JS, no curl/jq). |
| `docker-entrypoint.sh` | Installed as `/docker-entrypoint.d/40-gen-config.sh`; runs `gen-config.sh` before nginx starts. |
| `nginx.conf` | Static serving + SPA fallback + cache headers. No proxy routes. |
| `docker-compose.yml` | LOCAL build/run definition. |
| `docker-compose.ghcr.yml` | Run the PUBLISHED GHCR image (no build). |
| `build.sh` / `start.sh` | Build / run the local image. |
| `release.sh` | Bump version, annotated-tag `vX.Y.Z`, push it (guarded) to trigger the CI publish + GitHub Release. |
| `start-published.sh` | Pull + run the published GHCR image. |
| `stop.sh` / `delete.sh` | Stop (keep) / stop + delete the container. |
| `logs.sh` | Follow container logs. |
| `.env.example` | Config template (committed). `.env` is your real values (git-ignored). |

## Relationship to `docker-vo/`

`docker-vo/` is the previous Caddy-based image, kept as a variant: same runtime
config mechanism, but it also reverse-proxies `/api` → `postgrest:3000` and
`/api-docs` → `scalar:8080`, and can do automatic HTTPS. It uses its own image
tag (`semantius-app-vo:local`), container name (`semantius-app-vo`) and default
host port (**7071**) so both can run side by side.
