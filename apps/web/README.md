# Semantius UI Frontend

This is the main React SPA application for Semantius UI.

## Structure

This application is part of a pnpm workspace monorepo. All commands should be run from the root directory using pnpm.

## Development

From the root directory:

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint
```

## Accessibility and responsive checks

**Four automated layers** (1, 2, 3 and 5 below), plus **one end-to-end journey** (4)
that is not a layer of the analysis but the thing that keeps the rest honest. The
conformance claim, its scope and its named exceptions live in the root
[README](../../README.md#accessibility) — this is just where the commands are.

```bash
# 1. Token contrast + source-scan invariants. Part of `pnpm check`; fails the
#    moment a palette token moves out of range, on every surface a control can
#    sit on — including pairs no current route happens to render.
#    NOT `test -- <path>`: the `--` is consumed by pnpm and the path never
#    reaches vitest, so that form silently runs the whole ~51s suite instead.
pnpm --filter @semantius/frontend exec vitest run src/test/tokenContrast.test.ts

# 2. Component tests in a real Chromium: the `browser` Vitest project in
#    vite.config.ts (components/form, components/ui-ext), driven by Playwright.
#    Part of `pnpm check`, so it needs the same Chromium as (4) — run
#    `test:e2e:install` once. Real CSS, real popovers, no jsdom polyfills; every
#    control asserts its computed accessible name and description, and the
#    triggers that name themselves are checked against the name Chrome's own
#    accessibility tree computes (src/test/chromeAccessibleName.ts), not a
#    JavaScript approximation of it.
pnpm --filter @semantius/frontend exec vitest run --project browser

# 3. Static a11y lint. Frozen violations live in eslint-suppressions.json; a NEW
#    one fails the gate. `--prune-suppressions` lowers the ceiling as they are fixed.
#    The current count is 3 suppressed there PLUS 3 documented inline with
#    `eslint-disable-next-line` (two niko-table composite widgets and one
#    deliberate autofocus) — six accepted defects, not three.
pnpm --filter @semantius/frontend lint
pnpm --filter @semantius/frontend exec eslint . --prune-suppressions

# 4. The real login journey, in a real browser, against the test OIDC server.
#    This is what makes the rest of the suite's `#jwt` session-seeding honest.
#    Not part of `pnpm check`; it runs in CI from .github/workflows/a11y.yml
#    (on dispatch, weekly, and as a release gate called by docker-publish.yml).
pnpm --filter @semantius/frontend test:e2e:install   # once
pnpm --filter @semantius/frontend test:e2e

# 5. The route x viewport x theme sweep, against a DEPLOYED preview (from the repo root).
pnpm preview:wrangler
dotenvx run -- node scripts/a11y-sweep/run.mjs --url "$(grep -oE 'https://\S+' .preview-url.md)"
```

The sweep **should not** be pointed at localhost as a substitute for the preview.
It *can* be — the `#jwt` bootstrap's host gate (`urlTokenAllowed` in
`lib/devUrlToken.ts`) explicitly allows `localhost` and `127.0.0.1` alongside
`*.workers.dev`. The reason not to is that a dev server is not the artifact being
shipped: the whole point of the sweep is to measure a real build, with the real
production CSS, at the URL the claim is about.

`scripts/a11y-sweep/` lives at the repo root and is **not covered by `pnpm
check`** — nothing lints or typechecks it. A change there is verified only by
running it.

## Configuration

- Environment variables: `.env` (see `.env.example` for template)
- Vite configuration: `vite.config.ts`
- TypeScript configuration: `tsconfig.json`
- shadcn/ui configuration: `components.json`

## OAuth Configuration

Run `pnpm genconfig` from the root directory to configure OAuth settings interactively.

## See Also

- Root README.md - General project documentation
- AGENTS.md - Instructions for AI coding agents
- TESTING-API.md - API testing documentation
