import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'data/**',
      'reference/**',
      'docs/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,

  /* Type-aware linting needs the TS program, so it is scoped to the TypeScript
     sources that belong to a tsconfig. `projectService` lets typescript-eslint
     find the right project per file instead of us maintaining a list. */
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          /* Config files that belong to no package tsconfig are type-checked
             against the service's default program. The client's configs are not
             listed because its tsconfig.node.json already covers them, and a
             file may not be in both. Patterns cannot contain '**'. */
          allowDefaultProject: [
            '*.config.ts',
            'apps/server/vitest.config.ts',
            'packages/*/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* A promise dropped on the floor in an Express handler is a silent 500,
         so unawaited promises are an error rather than a warning. */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      /* Consistent type imports keep `verbatimModuleSyntax` happy. */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  /* Server: Node globals, and never log to the console — step 03 replaces
     every call site with the pino logger, which redacts personal data. */
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'error' },
  },

  /* Client: browser globals only. A stray `process.env` in client code is how
     secrets end up in a public bundle, so Node globals are deliberately absent. */
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },

  /* Tests may use non-null assertions and both global sets. */
  {
    files: ['**/*.{test,spec}.{ts,tsx,mjs}', '**/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  /* Tooling scripts and config files run on Node and may print. */
  {
    files: ['scripts/**/*.mjs', '**/*.config.{js,ts,mjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  /* mongosh scripts run inside the MongoDB shell, which supplies its own
     globals and is not Node. Linted rather than ignored, because a typo in the
     replica-set initialisation only shows up as a container that never
     becomes healthy. */
  {
    files: ['infra/mongo/**/*.js'],
    languageOptions: {
      globals: {
        db: 'readonly',
        rs: 'readonly',
        print: 'readonly',
        sleep: 'readonly',
        process: 'readonly',
      },
    },
  },

  prettier,
);
