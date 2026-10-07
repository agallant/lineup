import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // With noUncheckedIndexedAccess, `buf[i]!` inside bounds-checked DSP
      // loops is the clearest way to say "this index exists".
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**', '*.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },
);
