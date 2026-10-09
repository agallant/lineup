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
    // core is pure logic: it must never touch the DOM or Web Audio.
    files: ['packages/core/**', 'packages/testkit/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'AudioContext',
          'AudioWorkletNode',
          'requestAnimationFrame',
          'HTMLElement',
          'HTMLCanvasElement',
          'performance',
        ].map((name) => ({
          name,
          message: 'core/testkit must stay DOM-free; pass what you need in through an interface.',
        })),
      ],
    },
  },
  {
    files: ['scripts/**', '*.config.*'],
    languageOptions: { globals: { ...globals.node } },
  },
);
