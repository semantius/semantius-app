# syntax=docker/dockerfile:1
#
# SPA-only image: just the web app, served by nginx. No reverse proxy — if you
# need /api and /api-docs proxied to sibling containers through a single
# endpoint, use the Caddy variant in docker-vo/ instead.
#
# Build once, configure anywhere. The image is env-agnostic: the Vite bundle is
# compiled against placeholder config, and docker/gen-config.sh injects the real
# values into window.__ENV__ at container start (see docker/README.md).
#
# Build context MUST be the repo root (pnpm monorepo):
#   docker build -f docker/Dockerfile -t semantius-app .

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

# ---- runtime stage: nginx serves the static SPA + injects runtime config ----
FROM nginx:stable-alpine AS runtime
# No extra packages needed: gen-config.sh is a pure env -> JS emitter (OIDC
# discovery happens in the SPA, so curl/jq are not required).

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/gen-config.sh /usr/local/bin/gen-config.sh
COPY docker/docker-entrypoint.sh /docker-entrypoint.d/40-gen-config.sh
# Baked default config (placeholder values). Override at runtime with
# `-e VITE_X=…`, compose `env_file`, a mounted /config/.env, or k8s env.
COPY docker/.env.example /config/.env

# Normalize line endings (repo may be checked out with CRLF on Windows) and make
# the scripts executable so the nginx entrypoint can run the config generator.
RUN sed -i 's/\r$//' /usr/local/bin/gen-config.sh /docker-entrypoint.d/40-gen-config.sh \
 && chmod +x /usr/local/bin/gen-config.sh /docker-entrypoint.d/40-gen-config.sh

EXPOSE 80
# Uses the nginx image's own ENTRYPOINT (which runs /docker-entrypoint.d/*.sh
# before starting nginx) and its default CMD (`nginx -g 'daemon off;'`).
