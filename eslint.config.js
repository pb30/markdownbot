import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (type-aware where possible)
  ...tseslint.configs.recommended,

  // React hooks rules
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Project-specific overrides
  {
    rules: {
      // Allow unused vars prefixed with _ (common pattern for destructuring)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Allow explicit any in specific cases (Electron IPC, event handlers)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow empty catch blocks (common in terminal error handling)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Allow non-null assertions (useful with Electron APIs)
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Ignore build output and config files
  {
    ignores: [
      'out/**',
      'dist/**',
      '**/dist*/**',
      'node_modules/**',
      '*.config.*',
      'electron.vite.config.*',
    ],
  },
)
