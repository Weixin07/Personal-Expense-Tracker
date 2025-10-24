// Flat ESLint config for React Native + TypeScript (ESLint v9)
import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import noSecrets from 'eslint-plugin-no-secrets';

export default [
  // Ignore heavy/native folders
  {
    ignores: [
      'android/**',
      'ios/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
    ],
  },

  // Base + TS
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Main rules for app code
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.es2021,
        ...globals.node,
        __DEV__: true,
        fetch: true,
        Request: true,
        Response: true,
        FormData: true,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-native': reactNative,
      import: importPlugin,
      'no-secrets': noSecrets,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Keep your existing good defaults
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-raw-text': 'off',

      'no-secrets/no-secrets': [
        'error',
        {
          tolerance: 4,
          ignoreContent: ['example', 'sample'],
        },
      ],

      // --- DO NOT LAZY LOAD (enforced) ---
      // Ban dynamic import()
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Dynamic import() is disallowed. Do not lazy load.',
        },
        {
          selector:
            "CallExpression[callee.property.name='executeSql'] > :matches(TemplateLiteral, BinaryExpression)",
          message:
            'Use parameterised queries with placeholder bindings when calling executeSql.',
        },
      ],
      // Ban React.lazy(...)
      'no-restricted-properties': [
        'error',
        {
          object: 'React',
          property: 'lazy',
          message: 'React.lazy is disallowed. Do not lazy load.',
        },
      ],
      // Ban require() with variable paths (dynamic require)
      'import/no-dynamic-require': 'error',
    },
  },

  // Config/build files can use CommonJS (require) without tripping rules
  {
    files: [
      '*.config.{js,cjs,mjs}',
      'metro.config.js',
      'babel.config.js',
      'jest.config.js',
    ],
    languageOptions: {
      sourceType: 'script',
    },
    rules: {
      // Allow require() in these Node-side config files
      '@typescript-eslint/no-require-imports': 'off',
      // Only forbid truly dynamic requires; static literal requires are fine here
      'import/no-dynamic-require': 'off',
    },
  },
];