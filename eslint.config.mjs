import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
  { files: ['src/simulation/**/*.ts', 'src/contracts/**/*.ts', 'src/configuration/**/*.ts', 'src/shared/**/*.ts'], rules: {
    'no-restricted-imports': ['error', { patterns: ['phaser', 'phaser/*', '**/presentation/**', '**/persistence/**', '**/application/**'] }],
    'no-restricted-globals': ['error', 'window', 'document', 'indexedDB', 'requestAnimationFrame'],
    'no-restricted-properties': ['error', { object: 'Math', property: 'random' }, { object: 'Date', property: 'now' }]
  } }
);
