import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Base JS recommended rules
  eslint.configs.recommended,
  // Strict TS rules + typed rules
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Elevate any to an error (as per rules.md)
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow unused variables if they start with _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Require consistent type imports
      '@typescript-eslint/consistent-type-imports': 'error',
      // We don't need explicit return types everywhere if TS infers them well
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Disable overly pedantic rules that cause noise on existing valid code
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // However, DO ensure we await all promises to catch actual bugs
      '@typescript-eslint/no-floating-promises': 'error',
      'preserve-caught-error': 'off',
    },
  },
  {
    // Test-file overrides: relax rules that produce false positives with vitest mocks
    files: ['src/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // vi.mocked(instance.method) is the standard vitest pattern for accessing mock fns;
      // unbound-method fires on the property access but it's safe in this context.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Ignore build artifacts, IDE files, and standalone pieces package
    ignores: [
      'dist/**',
      'node_modules/**',
      'pieces/**',
      'scripts/**',
      '.gemini*',
      '.agent/**',
      'eslint.config.mjs',
      'vitest.config.ts'
    ],
  }
);
