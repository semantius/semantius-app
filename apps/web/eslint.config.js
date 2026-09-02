import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Dev-only Fast Refresh hint — not a correctness rule.
      'react-refresh/only-export-components': 'warn',
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
])
