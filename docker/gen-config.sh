#!/bin/sh
# Generate the SPA's runtime config file (window.__ENV__) from the container
# environment. Runs at container start (via docker-entrypoint.sh, which the
# nginx image executes from /docker-entrypoint.d/) and is also
# runnable standalone on a host for inspection:  ./gen-config.sh /tmp/config.js
#
# This is a pure env -> JS emitter: every value comes from a real environment
# variable, or from $ENV_FILE (docker/.env) as a default. Value precedence:
#   real environment variable  >  $ENV_FILE (docker/.env) default  >  empty
#
# OIDC discovery is NOT done here anymore. Set VITE_OAUTH_CONFIG (a
# .well-known/openid-configuration URL) and the SPA fetches it at runtime,
# filling any OAuth endpoint left blank (see apps/web/src/lib/config.ts). That
# keeps this script dependency-free (no curl/jq) and unifies discovery across
# dev / Vercel / Cloudflare / Docker.
set -eu

OUT="${1:-/usr/share/nginx/html/config.js}"   # nginx static root
ENV_FILE="${ENV_FILE:-/config/.env}"

# Keep this list in sync with apps/web/public/config.js.
CANONICAL_VARS="
VITE_API_BASE_URL
VITE_API_TYPE
VITE_SUPABASE_APIKEY
VITE_OAUTH_CONFIG
VITE_OAUTH_CLIENT_ID
VITE_OAUTH_AUTH_ENDPOINT
VITE_OAUTH_TOKEN_ENDPOINT
VITE_OAUTH_USERINFO_ENDPOINT
VITE_OAUTH_LOGOUT_ENDPOINT
VITE_OAUTH_LOGOUT_REDIRECT
VITE_OAUTH_REDIRECT_URI
VITE_OAUTH_SCOPE
VITE_OAUTH_AUDIENCE
VITE_CONTROL_PLANE_URL
VITE_CONTROL_PLANE_ORG
VITE_CUBE_API_URL
VITE_BACKEND_TYPE
VITE_UI_CUSTOMIZER
"

# 1. Load $ENV_FILE as DEFAULTS — only for keys not already set in the
#    environment, so a real env var (docker -e / compose env_file / k8s) wins.
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line=$(printf '%s' "$line" | tr -d '\r')          # tolerate CRLF files
    case "$line" in ''|\#*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    key=$(printf '%s' "$key" | tr -d '[:space:]')
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac  # identifiers only
    case "$val" in                                     # strip matching quotes
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    if eval "[ -z \"\${$key+x}\" ]"; then export "$key=$val"; fi
  done < "$ENV_FILE"
fi

# 2. Emit config.js (a JS object literal; trailing comma is legal JS).
#    OAuth endpoints left blank are resolved by the SPA from VITE_OAUTH_CONFIG.
{
  echo "window.__ENV__ = {"
  for k in $CANONICAL_VARS; do
    v=$(eval "printf '%s' \"\${$k:-}\"")
    esc=$(printf '%s' "$v" | sed 's/\\/\\\\/g; s/"/\\"/g')   # JSON-escape \ and "
    printf '  "%s": "%s",\n' "$k" "$esc"
  done
  echo "};"
} > "$OUT"

echo "[gen-config] wrote $OUT" >&2
