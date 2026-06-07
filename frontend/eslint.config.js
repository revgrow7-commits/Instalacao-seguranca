// ESLint 9 flat config for the frontend.
//
// Why this exists (added during the hooks audit, 2026-05-14):
//   The project had eslint-plugin-react-hooks 5.x in devDependencies but no
//   config file and no `lint` script in package.json — so the plugin was
//   never actually loaded. That meant `react-hooks/exhaustive-deps` and
//   `react-hooks/rules-of-hooks` produced zero warnings, allowing stale
//   closures (`useEffect(() => loadX(), [])` referencing functions declared
//   inline) to accumulate silently across pages.
//
// This config keeps things conservative: errors only on rules-of-hooks
// (which signal genuine bugs), warnings on exhaustive-deps (which require
// human judgment to fix correctly). React-specific noise that doesn't
// matter in this codebase (display-name, prop-types) is disabled — the
// project is JS without prop-types and uses default function components.
//
// To run:
//   yarn lint           # report issues
//   yarn lint --fix     # auto-fix what's safe
//
// Vercel build does NOT run this yet. Add `yarn lint` to the build command
// in vercel.json (or as a pre-build step) once the existing warnings are
// triaged — otherwise the first run will dump hundreds of pre-existing
// warnings and block the deploy.

const js = require('@eslint/js');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

module.exports = [
  // Files to ignore globally
  {
    ignores: [
      'build/**',
      'dist/**',
      'node_modules/**',
      'plugins/health-check/**', // build-time plugin, not app code
      'public/**',               // service worker etc, not linted as app
      '**/*.min.js',
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // App source: JSX + browser globals + React 19 + hooks
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
        // CRA / craco injects these at build time
        process: 'readonly',
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      react: { version: '19.0' },
    },
    rules: {
      // ----- The whole reason this config exists -----
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ----- React 19 + new JSX transform: turn off legacy noise -----
      'react/react-in-jsx-scope': 'off',     // not needed since React 17
      'react/jsx-uses-react': 'off',         // same
      'react/prop-types': 'off',             // project doesn't use prop-types
      'react/display-name': 'off',           // false positives on forwardRef
      'react/no-unescaped-entities': 'off',  // too noisy in PT-BR copy

      // ----- Things that catch real bugs but are common in vibe code -----
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off', // project uses console.error intentionally

      // ----- A11y: errors that matter, warnings for the rest -----
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'off', // react-router Link breaks this rule
    },
  },

  // Test files: more permissive
  {
    files: ['src/**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-expressions': 'off',
    },
  },

  // Config files at the root
  {
    files: ['*.config.js', 'craco.config.js', 'postcss.config.js', 'tailwind.config.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
