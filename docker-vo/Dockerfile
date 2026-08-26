# syntax=docker-vo/dockerfile:1
#
# Build once, configure anywhere. The image is env-agnostic: the Vite bundle is
# compiled against placeholder config, and docker-vo/gen-config.sh injects the real
# values into window.__ENV__ at container start (see docker-vo/README.md).
#
# Build context MUST be the repo root (pnpm monorepo):
#   docker build -f docker-vo/Dockerfile -t semantius-app .

# ---- build stage: compile the Vite SPA (no secrets / env needed) ----
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

# Install deps first for better layer caching — only manifests + lockfile.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/sem-schema/package.json packages/sem-schema/package.json
RUN pnpm install --frozen-lockfile

# Copy sources and build. sem-schema is consumed from source by Vite, so only
# the web package needs its build script run.
COPY . .
RUN pnpm --filter=@semantius/frontend build

# ---- runtime stage: Caddy serves static assets, reverse-proxies /api + /api-docs
#      to sibling containers, and injects runtime config at start ----
FROM caddy:2-alpine AS runtime
# No extra packages needed: gen-config.sh is a pure env -> JS emitter (OIDC
# discovery now happens in the SPA, so curl/jq are no longer required).

COPY --from=build /app/apps/web/dist /srv
COPY docker-vo/Caddyfile /etc/caddy/Caddyfile
COPY docker-vo/gen-config.sh /usr/local/bin/gen-config.sh
COPY docker-vo/entrypoint.sh /usr/local/bin/entrypoint.sh
# Baked default config (placeholder values). Override at runtime with
# `-e VITE_X=…`, compose `env_file`, a mounted /config/.env, or k8s env.
COPY docker-vo/.env.example /config/.env

# Normalize line endings (repo may be checked out with CRLF on Windows) and make
# the scripts executable so the entrypoint can run the config generator.
RUN sed -i 's/\r$//' /usr/local/bin/gen-config.sh /usr/local/bin/entrypoint.sh \
 && chmod +x /usr/local/bin/gen-config.sh /usr/local/bin/entrypoint.sh

# 80 for HTTP; 443 is only used when SITE_ADDRESS is a domain (Caddy auto-HTTPS).
EXPOSE 80 443
# Custom ENTRYPOINT: the Caddy image has no /docker-entrypoint.d/*.sh hook, so we
# regenerate /srv/config.js and then exec `caddy run` ourselves (see entrypoint.sh).
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
