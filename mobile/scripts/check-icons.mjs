// Every icon name used in the app must exist in the MaterialCommunityIcons font. An unknown name is not an error at build time: it shows a
// warning toast (and an empty box) on the phone, which is how "roll-of-paper" slipped through. This reads the font's own glyph map.
//   icon="x"  icon={cond ? 'a' : 'b'}  icon: 'x'  name="x" (on an icon component)  and objects named *ICON* / *ICONS*  are checked.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glyphFile = path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
const glyphs = JSON.parse(readFileSync(glyphFile, 'utf8'));

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'dist') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) files.push(full);
  }
})(root);

/** The text of a `{ ... }` or a quoted literal starting at index i. */
function valueAt(src, i) {
  if (src[i] === '{') {
    let depth = 0, j = i;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
    return src.slice(i, j + 1);
  }
  const q = src[i];
  if (q === '"' || q === "'" || q === '`') { const end = src.indexOf(q, i + 1); return src.slice(i, end + 1); }
  return '';
}
const literals = (text) => [...text.matchAll(/['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g)].map((m) => m[1]);

const used = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\b(?:icon|name)\s*[=:]\s*(?=[{'"`])/g)) {
    const before = src.slice(Math.max(0, m.index - 1), m.index);
    if (m[0].startsWith('name') && !/MaterialCommunityIcons[^>]{0,200}$/.test(src.slice(Math.max(0, m.index - 80), m.index + m[0].length)) && !/<MaterialCommunityIcons\s+name/.test(src.slice(Math.max(0, m.index - 30), m.index + m[0].length))) continue;
    if (/[\w.]/.test(before)) continue;
    const value = valueAt(src, m.index + m[0].length);
    // in a ternary only the string results are icons; in a plain literal the literal is
    for (const n of literals(value)) used.push([file, n]);
  }
  for (const m of src.matchAll(/const\s+\w*ICONS?\w*\s*=\s*\{([^}]*)\}/g)) for (const n of literals(m[1].replace(/\b\w+\s*:/g, ''))) used.push([file, n]);
}

const bad = used.filter(([, n]) => !(n in glyphs));
if (bad.length) {
  console.error(`${bad.length} unknown icon name(s):\n${[...new Set(bad.map(([f, n]) => `${path.relative(root, f)}: "${n}"`))].map((x) => ` - ${x}`).join('\n')}`);
  process.exit(1);
}
console.log(`OK: ${used.length} icon references, all exist in MaterialCommunityIcons (${Object.keys(glyphs).length} icons).`);
