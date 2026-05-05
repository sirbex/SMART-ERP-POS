import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.ts'],
    ignores: ['prisma/**'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: false,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pdfkit',
              message:
                'PDFKit is only allowed inside src/modules/documents/. Use DocumentRenderer.render() everywhere else.',
            },
            {
              name: 'jspdf',
              message: 'jsPDF is forbidden on the backend. Use DocumentRenderer.render().',
            },
            {
              name: 'jspdf-autotable',
              message: 'jspdf-autotable is forbidden on the backend. Use DocumentRenderer.render().',
            },
          ],
        },
      ],
    },
  },
  // Allow pdfkit inside the centralized documents module
  {
    files: ['src/modules/documents/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]);
