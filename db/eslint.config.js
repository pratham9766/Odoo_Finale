// Lint rules for the db/ scripts (borrows eslint from the server package).
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
];
