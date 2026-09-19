import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output. `dist-e2e-*` are the two extra bundles playwright.config.ts
  // builds for its tenant and LAN projects — 3400 minified files that ESLint
  // would otherwise parse on every run for no rules at all, which is minutes.
  globalIgnores(['dist', 'dist-e2e-*']),
  // An eslint-disable comment for a rule that is off, or for a line that no
  // longer breaks it, is left alone rather than reported. The comments stay as
  // documentation of intent (an `any` that is deliberate, for example).
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // eslint-plugin-react-hooks v7 ships its FLAT configs under `.flat.*`; the
      // top-level `configs['recommended-latest']` is still the legacy (eslintrc)
      // shape with `plugins` as a string array, which ESLint 9 flat config rejects
      // ("plugins key defined as an array of strings"). Use the flat variant.
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      // `flatConfigs` (plural) — the singular `configs.recommended` is the
      // legacy eslintrc shape and ESLint 9 rejects it.
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      // jsx-a11y ignores any capitalized JSX name it cannot resolve to an
      // intrinsic element, so without this map the rules simply skip most of our
      // markup. Measured contribution: it surfaces 5 findings that are otherwise
      // invisible — three `role="combobox"` elements missing required ARIA props
      // and two `aria-valuemin/max` on a textbox. Add an entry whenever a
      // component wraps an intrinsic element; a missing entry is a silent hole,
      // never an error.
      //
      // What it does NOT buy, verified with an isolated probe: a click-only
      // `<TableRow onClick>` stays invisible even mapped to 'tr', because `tr`'s
      // implicit role `row` counts as neither interactive nor non-interactive, so
      // no-static-element-interactions and no-noninteractive-element-interactions
      // both skip it. A raw `<tr onClick>` is equally unflagged. Keyboard-
      // unreachable table rows have to be caught in the browser, not here.
      'jsx-a11y': {
        components: {
          // shadcn primitives (components/ui)
          Button: 'button',
          Input: 'input',
          Textarea: 'textarea',
          Label: 'label',
          Table: 'table',
          TableHeader: 'thead',
          TableBody: 'tbody',
          TableFooter: 'tfoot',
          TableRow: 'tr',
          TableHead: 'th',
          TableCell: 'td',
          Breadcrumb: 'nav',
          BreadcrumbList: 'ol',
          BreadcrumbItem: 'li',
          BreadcrumbSeparator: 'li',
          SidebarInset: 'main',
          SidebarRail: 'button',
          SidebarMenu: 'ul',
          SidebarMenuItem: 'li',
          SidebarMenuSub: 'ul',
          SidebarMenuSubItem: 'li',
          // our own (components/ui-ext)
          Combobox: 'button',
          BookmarkIcon: 'button',
        },
        // TanStack Router's <Link> is deliberately NOT in `components` above.
        // Mapping it to 'a' makes anchor-is-valid/anchor-has-content demand an
        // `href` prop it does not take, manufacturing 22 false positives on a
        // component that renders a perfectly valid <a href>. `linkComponents` is
        // the mechanism that actually fits: it tells the anchor rules which prop
        // carries the destination.
        linkComponents: [{ name: 'Link', linkAttribute: 'to' }],
      },
    },
  },
  {
    // Pragmatic baseline. ESLint was non-functional for a long time (a broken
    // flat-config), so the codebase predates every rule below and trips ~230 of
    // them. Rather than block on that debt, the high-volume / opinionated rules
    // are demoted to non-blocking warnings so `pnpm lint` is usable again; tighten
    // them back to "error" per-rule as the code is cleaned up. tsc remains the
    // hard correctness gate.
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Style / pre-existing debt.
      '@typescript-eslint/no-explicit-any': 'off',
      // Dead code costs nothing at runtime (the bundler drops unused imports).
      // tsc's noUnusedLocals/noUnusedParameters are off too, so nothing checks it.
      '@typescript-eslint/no-unused-vars': 'off',
      // A dev-server hot-reload hint, not a correctness check.
      'react-refresh/only-export-components': 'off',
      // React-Compiler-era rules introduced in react-hooks v7 that the existing
      // code was never written against. Informational for now.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/void-use-memo': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      // Kept as ERROR (genuine bug catchers): react-hooks/rules-of-hooks.
    },
  },
  {
    // ── Untranslated text ───────────────────────────────────────────────────
    //
    // Plain text between JSX tags goes through `t()` / `<Trans>`. The plugin's
    // default `jsx-text-only` mode checks nothing else (no attributes, no
    // strings in code), which is why it needs no ignore lists. It does not care
    // which i18n library is used, despite its name.
    files: ['src/**/*.tsx'],
    ignores: [
      // Renders inside drizzle-cube, an embedded product with its own i18n.
      'src/charts/**',
      // shadcn CLI output, never hand-edited.
      'src/components/ui/**',
      // A test's strings are assertions and fixtures, never on a screen.
      'src/**/*.test.tsx',
      'src/**/__tests__/**',
      'src/test/**',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': 'error',
    },
  },
  {
    // shadcn CLI output cannot be edited; these three are its own defects.
    files: ['src/components/ui/**'],
    rules: {
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
    },
  },
  {
    // `useT()` returns a new function per language, so a `useMemo`/`useEffect`/
    // `useCallback` that calls `t` without listing it keeps rendering the
    // previous language. An error for `src/**`, not a warning, for that reason.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // `translate()` cannot re-render a component when the language changes, and
    // three of the grid's components are React.memo — so a `translate()` inside
    // one would show the previous language until something unrelated re-rendered
    // it. Components use `useT()`.
    files: ['src/components/**/*.{ts,tsx}'],
    // The exceptions are the three CLASS components, which cannot call a hook.
    ignores: [
      'src/components/ErrorBoundary.tsx',
      'src/components/form/InputJson.tsx',
      'src/components/niko-table/core/data-table-error-boundary.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // Both specifiers, because `@/i18n/index` resolves to the same module
            // and would otherwise be the way around the rule.
            ...['@/i18n', '@/i18n/index'].map((name) => ({
              name,
              importNames: ['translate'],
              message:
                'Components use useT(); translate() is a module function and cannot re-render on a language change. ' +
                'The only exceptions are the three class components, which cannot call a hook.',
            })),
          ],
        },
      ],
    },
  },
])
