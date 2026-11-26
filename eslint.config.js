import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'public/mediapipe/**', 'public/models/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // User-supplied text must go through textContent; see SECURITY.md.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent or the el() helper.' },
        { property: 'outerHTML', message: 'Use textContent or the el() helper.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'packages/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
      },
    },
  },
);
