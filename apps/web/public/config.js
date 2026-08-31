// Runtime configuration for the SPA. Loaded (as a plain, blocking script) from
// index.html BEFORE the app bundle, so window.__ENV__ exists when the app boots.
//
// This committed copy holds ONLY placeholder tokens. In local dev and on
// Vercel/Cloudflare nothing replaces them, so lib/runtimeEnv.ts ignores them and
// the app uses the values Vite baked from .env at build time (unchanged behavior).
//
// In Docker, docker/gen-config.sh rewrites this file at container start with the
// real values (from the container environment + docker/.env), so the same image
// can be reconfigured per deployment without a rebuild. OAuth endpoints left
// blank are resolved by the app at runtime from VITE_OAUTH_CONFIG (an OIDC
// .well-known/openid-configuration URL — see apps/web/src/lib/config.ts).
//
// Keep this key list in sync with the CANONICAL_VARS list in docker/gen-config.sh.
window.__ENV__ = {
  "VITE_API_BASE_URL": "__VITE_API_BASE_URL__",
  "VITE_API_TYPE": "__VITE_API_TYPE__",
  "VITE_SUPABASE_APIKEY": "__VITE_SUPABASE_APIKEY__",
  "VITE_OAUTH_CONFIG": "__VITE_OAUTH_CONFIG__",
  "VITE_OAUTH_CLIENT_ID": "__VITE_OAUTH_CLIENT_ID__",
  "VITE_OAUTH_AUTH_ENDPOINT": "__VITE_OAUTH_AUTH_ENDPOINT__",
  "VITE_OAUTH_TOKEN_ENDPOINT": "__VITE_OAUTH_TOKEN_ENDPOINT__",
  "VITE_OAUTH_USERINFO_ENDPOINT": "__VITE_OAUTH_USERINFO_ENDPOINT__",
  "VITE_OAUTH_LOGOUT_ENDPOINT": "__VITE_OAUTH_LOGOUT_ENDPOINT__",
  "VITE_OAUTH_LOGOUT_REDIRECT": "__VITE_OAUTH_LOGOUT_REDIRECT__",
  "VITE_OAUTH_REDIRECT_URI": "__VITE_OAUTH_REDIRECT_URI__",
  "VITE_OAUTH_SCOPE": "__VITE_OAUTH_SCOPE__",
  "VITE_OAUTH_AUDIENCE": "__VITE_OAUTH_AUDIENCE__",
  "VITE_CONTROL_PLANE_URL": "__VITE_CONTROL_PLANE_URL__",
  "VITE_CONTROL_PLANE_ORG": "__VITE_CONTROL_PLANE_ORG__",
  "VITE_CUBE_API_URL": "__VITE_CUBE_API_URL__",
  "VITE_BACKEND_TYPE": "__VITE_BACKEND_TYPE__",
  "VITE_UI_CUSTOMIZER": "__VITE_UI_CUSTOMIZER__"
};
