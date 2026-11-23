import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const readonlyGlobals = (names) => Object.fromEntries(names.map((name) => [name, 'readonly']))

export default tseslint.config(
  { ignores: ['node_modules/**', 'out/**', 'release/**', '.local/**', '.impeccable/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zod', 'zod/*', '**/shared/model', '**/shared/model.ts'],
              message:
                'Renderer must import pure types from shared/types, shared/sync, shared/ipc, or runtime constants from shared/defaults (never zod or shared/model).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: readonlyGlobals([
        'require',
        'module',
        'exports',
        '__dirname',
        '__filename',
        'process',
        'console',
        'Buffer',
        'setTimeout',
        'clearTimeout',
        'URL',
        'URLSearchParams',
        'fetch',
        'AbortSignal',
        'Response',
        'TextEncoder',
        'window',
        'document',
        'innerWidth',
        'innerHeight',
        'getComputedStyle',
        'requestAnimationFrame',
        'PerformanceObserver',
        'performance',
        'localStorage',
        'HTMLInputElement',
        'Image',
        'btoa',
      ]),
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['resources/scripts/vk-export.js'],
    languageOptions: {
      sourceType: 'script',
      globals: readonlyGlobals([
        'window',
        'document',
        'location',
        'Node',
        'WeakMap',
        'Set',
        'Map',
        'Promise',
        'setTimeout',
        'clearTimeout',
        'Date',
        'Math',
        'Number',
        'String',
        'Boolean',
        'Array',
        'Object',
        'JSON',
        'RegExp',
        'globalThis',
        'MutationObserver',
        'getComputedStyle',
        'requestAnimationFrame',
      ]),
    },
  },
)
