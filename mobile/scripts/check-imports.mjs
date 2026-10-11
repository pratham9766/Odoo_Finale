// A small static check for this JavaScript project (there is no TypeScript and no ESLint config here):
//   1. every file parses (JSX included)
//   2. every relative import points at a file that exists
//   3. every NAMED import from one of our own files is really exported there (the mistake a typo or a rename causes)
//   4. every package imported is declared in package.json
// Run with `npm run check`. It uses @babel/parser, which Expo already installs. It does not replace running the app.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { parse } = require('@babel/parser');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
const BUILTIN = new Set(['assert', 'fs', 'path', 'url', 'os', 'crypto', 'events', 'util', 'stream', 'buffer', 'child_process', 'module']);
const EXT = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'dist') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(jsx?|mjs)$/.test(name) && !/^(babel|metro)\.config/.test(name)) files.push(full);
  }
})(root);

const problems = [];
const parsed = new Map();
const ast = (file) => {
  if (!parsed.has(file)) {
    try { parsed.set(file, parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'], errorRecovery: false })); }
    catch (e) { problems.push(`${path.relative(root, file)}: does not parse: ${e.message}`); parsed.set(file, null); }
  }
  return parsed.get(file);
};
const resolve = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  for (const e of EXT) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  return null;
};

/** The names a file exports; `null` means "unknown" (export * or a CommonJS file), so no check is made. */
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const tree = ast(file);
  if (!tree) return null;
  const names = new Set();
  for (const node of tree.program.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.declarations) for (const d of node.declaration.declarations) names.add(d.id.name);
      else if (node.declaration?.id) names.add(node.declaration.id.name);
      for (const s of node.specifiers ?? []) names.add(s.exported.name ?? s.exported.value);
    } else if (node.type === 'ExportAllDeclaration') {
      const target = resolve(file, node.source.value);
      const inner = target && exportsOf(target, seen);
      if (!inner) return null;
      for (const n of inner) names.add(n);
    }
  }
  return names;
}

for (const file of files) {
  const tree = ast(file);
  if (!tree) continue;
  const rel = path.relative(root, file);
  const specs = tree.program.body.filter((n) => n.type === 'ImportDeclaration' || (n.type === 'ExportNamedDeclaration' && n.source) || n.type === 'ExportAllDeclaration');
  for (const node of specs) {
    const spec = node.source.value;
    if (spec.startsWith('.')) {
      const target = resolve(file, spec);
      if (!target) { problems.push(`${rel}: cannot find "${spec}"`); continue; }
      if (!/\.(jsx?|mjs)$/.test(target)) continue;
      const names = exportsOf(target);
      if (!names) continue;
      for (const s of node.specifiers ?? []) {
        const wanted = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportSpecifier' ? s.imported.name ?? s.imported.value : s.type === 'ExportSpecifier' ? s.local.name : null;
        if (wanted && !names.has(wanted)) problems.push(`${rel}: "${wanted}" is not exported by ${path.relative(root, target)}`);
      }
    } else if (!spec.startsWith('node:')) {
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!declared.has(name) && !BUILTIN.has(name) && !['expo-router', 'react-native'].includes(name)) problems.push(`${rel}: package "${name}" is imported but not in package.json`);
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n${problems.map((p) => ` - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`OK: ${files.length} files parse, and every import resolves and is exported.`);
