import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import lingui from 'eslint-plugin-lingui'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output. `dist-e2e-*` are the two extra bundles playwright.config.ts
  // builds for its tenant and LAN projects — 3400 minified files that ESLint
  // would otherwise parse on every run for no rules at all, which is minutes.
  globalIgnores(['dist', 'dist-e2e-*']),
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
  {
    // ── Internationalization ────────────────────────────────────────────────
    //
    // Every user-visible string goes through `t()` / `translate()` / `<Trans>`
    // (see src/i18n/index.ts). The rule is an ERROR from the first phase, and
    // the strings that had not been migrated when it was turned on are recorded
    // once in `eslint-suppressions.json` — a ratchet whose counts only fall.
    // A partially migrated file is therefore still enforced for anything NEW.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      // Our chart override renders inside drizzle-cube, an embedded third-party
      // product with its own i18n. Its strings are that product's vocabulary,
      // not ours, and translating them here would half-translate its UI.
      'src/charts/**',
      // Tests and their helpers. A test's strings are assertions, fixtures and
      // query strings, not anything a user reads — and there are ~2600 of them
      // against ~1200 in product code, so including them would drown the
      // suppression baseline in entries that can never be migrated and hide the
      // ones that can. The rule exists to catch a string on SCREEN; nothing in
      // a test file is on a screen.
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**',
      'src/test/**',
      // The translation runtime itself — the top-level modules ONLY. Every
      // string in them is a locale tag, a storage key, a glob or an `Intl`
      // option: machinery, never text.
      //
      // Deliberately NOT `src/i18n/**`. Translate mode (P5) lands under
      // `src/i18n/translateMode/` and is ordinary UI with ordinary user-visible
      // strings — an editor popover, a panel, filter labels. A folder-wide
      // ignore would exempt exactly the code that most needs the rule, and it
      // would do it silently.
      'src/i18n/*.ts',
    ],
    extends: [lingui.configs['flat/recommended']],
    rules: {
      // ── The ICU tag-name collision, and why this ban is the fix ───────────
      //
      // `no-unlocalized-strings` hard-codes `['Trans', 'Plural', 'Select',
      // 'SelectOrdinal']` as Lingui's own ICU components and marks EVERY
      // `Literal`/`TemplateLiteral`/`JSXText` in the subtree of one as already
      // visited (the rule's source, v0.15.0). shadcn's `<Select>` has the same
      // tag name, so a `SelectItem`'s label, a `SelectValue placeholder` and
      // every attribute inside a select were invisible — verified with a
      // fixture through the installed plugin, not read off the source: a bare
      // `<span>` next to them was reported and nothing inside the `<Select>`
      // was. A green run over such a file proved nothing about it.
      //
      // There is no option to rename what the rule considers an ICU component,
      // so the disambiguation has to happen at the call site: the four files
      // that use the select import it as `Select as SelectRoot`, and this rule
      // is what keeps them that way. It is a JSX TAG-NAME ban, not an import
      // ban — `no-restricted-imports` matches the imported name and would
      // reject the alias too.
      //
      // `Trans` is deliberately absent: it is Lingui's, and its subtree cannot
      // hide anything because `TransProps` declares no `children`, so
      // `<Trans id="…">text</Trans>` is a tsc error (TS2322). The message comes
      // from `id`, which the extractor reads.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name=/^(Plural|Select|SelectOrdinal)$/]',
          message:
            'eslint-plugin-lingui treats a JSX element named Select/Plural/SelectOrdinal as one of its own ICU ' +
            'components and reports no unlocalized string anywhere inside it. Import it under another name ' +
            "(`import { Select as SelectRoot } from '@/components/ui/select'`) so the rule can see the subtree.",
        },
      ],
      'lingui/no-unlocalized-strings': [
        'error',
        {
          // `t` and `msg` are recognized by the rule already (it knows Lingui's
          // own names); `translate` and `translateDynamic` are ours and are not,
          // so they are named here. Verified against the installed plugin rather
          // than assumed — the default list lives in the rule's source.
          //
          // NOT the route factories. `ignoreFunctions` exempts every literal
          // whose nearest enclosing CallExpression resolves to a whitelisted
          // callee — and for a CURRIED call the rule walks in to the inner
          // callee, so `createFileRoute('/x')({ … })` would exempt the entire
          // route definition, `head: () => ({ meta: [{ title: 'English' }] })`
          // included, silently and forever. The route PATH is exempted by an
          // `ignore` pattern below instead, which matches the path and nothing
          // else. (`createRootRoute` takes no path at all, so it never needed
          // an entry.) Verified in the installed rule's source, not assumed.
          ignoreFunctions: [
            'translate',
            'translateDynamic',
            'cn',
            'cva',
            'clsx',
            'twMerge',
            'console.*',
            'localStorage.*',
            'sessionStorage.*',
            'document.querySelector*',
            'document.getElementById',
            'document.createElement',
            'window.matchMedia',
            'window.addEventListener',
            'window.removeEventListener',
            'document.addEventListener',
            'document.removeEventListener',
            'URLSearchParams*',
            '*.setAttribute',
            '*.getAttribute',
            '*.removeAttribute',
            '*.classList.*',
            '*.setItem',
            '*.getItem',
            '*.removeItem',
            'Intl.*',
            'new Intl.*',
          ],
          // Format examples and identifiers, not language. Deliberately NARROW:
          // an over-broad pattern here hides a real string forever and silently,
          // whereas an unmigrated string just lands in the suppression baseline
          // once and is visible there. The rule already ignores any message with
          // no letter in it at all.
          //
          // Written with CHARACTER CLASSES, never a backslash escape. These are
          // JS string literals, so `'\.'` is NOT an escaped dot — it is the
          // character `.`, and the pattern quietly becomes "any character".
          // `[a-z0-9_]+(.[a-z0-9_]+)+` written that way is catastrophically
          // ambiguous and took ESLint from 6 seconds to over ten minutes on one
          // test file, with no error anywhere to say why.
          ignore: [
            // The React Server Components directive prologue. A string
            // statement at the top of a module, never text on a screen — and
            // the one shape that cannot be reached by any other lever, since it
            // is not an argument, a property or a variable.
            '^use client$',
            // HTTP verbs and media types.
            '^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)$',
            '^application/[a-z0-9+.-]+$',
            // A dotted or kebab identifier: table.column, a css custom property
            // fragment, a data-attribute value.
            '^[a-z0-9_]+([.][a-z0-9_]+)+$',
            '^[a-z0-9]+(-[a-z0-9]+)+$',
            // An absolute path: the route paths every route file declares
            // (`/_app/$moduleId/$table_name`), a redirect target, a fetch URL.
            // Without this the baseline carries 23 entries that can never be
            // migrated, and it is the narrow way to exempt them — a leading
            // slash with no space in it is an address, never a sentence.
            '^/[A-Za-z0-9_$./-]*$',
            // The format examples the input controls show as placeholders.
            '^[0-9]{1,3}([.][0-9]{1,3}){3}$',
            '^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$',
          ],
          ignoreNames: [
            'className',
            'class',
            // React's debug name for a component. It shows up in DevTools and
            // in React's own warnings, never on a screen, and it is by
            // definition the component's identifier — 46 of them across the
            // vendored grid. The rule reads this list for `X.displayName = '…'`
            // assignments and for `static displayName` class properties alike.
            'displayName',
            // A name ending in ClassName holds CSS classes: the shared
            // `inputSurfaceClassName`, and the `itemClassName` /
            // `triggerClassName` props components take. `cn`/`cva`/`clsx` are
            // already exempt as CALLS; this covers the same strings where they
            // are a default or a constant instead.
            { regex: { pattern: 'ClassName$' } },
            // An option's value, never its label. The plugin ALREADY allows
            // `value` on an intrinsic element (`isAllowedDOMAttr` hard-codes
            // placeholder/alt/aria-label/value), so this only extends the same
            // treatment to a component — which is what `<SelectItem value="asc">`
            // and `<option value="active">` are: the identifier that goes into
            // state, sitting next to the `t()` label the user actually reads.
            // Every literal `value=` in product code is one of those. Note that
            // `ignoreNames` is wider than a JSX attribute — it also covers an
            // object property and a variable declaration of that name — so check
            // for a `{ value: 'Some sentence' }` before assuming this is free;
            // there are none today.
            'value',
            'id',
            'key',
            'href',
            'src',
            'to',
            'type',
            'role',
            'style',
            'variant',
            'size',
            'side',
            'align',
            'data-slot',
            'data-testid',
            { regex: { pattern: '^data-' } },
            { regex: { pattern: '^aria-(?!label$|description$|placeholder$|roledescription$|valuetext$)' } },
          ],
        },
      ],
    },
  },
  {
    // ── `useT()` in a dependency array ──────────────────────────────────────
    //
    // `useT()` hands back a NEW function per language — that is what makes a
    // `useMemo`/`useEffect`/`useCallback` that lists `t` re-run on a switch, and
    // what makes one that omits it keep rendering the previous language behind a
    // memo. The rule that catches that is `react-hooks/exhaustive-deps`, and it
    // is only useful as an ERROR: as a warning it is one of ~90 in a run nobody
    // reads line by line.
    //
    // Promoted here for `src/**` alone, with the same mechanism as the lingui
    // rule — the violations that predate it are recorded once in
    // `eslint-suppressions.json` and the count only falls. There were seven.
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
