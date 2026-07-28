/**
 * Remove duplicate `let activeFormat` declarations in web/js/model-browser.js
 * Prefer the 'glb' default over null.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'web/js/model-browser.js');
const src = process.argv[2] ? path.resolve(process.argv[2]) : file;
let t = fs.readFileSync(src, 'utf8');

const lines = t.split(/\n/);
const declIdx = [];
lines.forEach((line, i) => {
  if (/^\s*let\s+activeFormat\s*=/.test(line)) declIdx.push(i);
});

console.log(
  'found declarations at lines',
  declIdx.map((i) => i + 1),
  declIdx.map((i) => lines[i].trim()),
);

if (declIdx.length <= 1) {
  console.log('no duplicate — nothing to do');
  // still ensure glb default if only null
  if (declIdx.length === 1 && /=\s*null\s*;/.test(lines[declIdx[0]])) {
    lines[declIdx[0]] = "let activeFormat = 'glb';";
    fs.writeFileSync(file, lines.join('\n'));
    console.log('upgraded null → glb');
  }
  process.exit(0);
}

// Prefer a line that sets 'glb', else keep the last declaration
let keep = declIdx.find((i) => /'glb'|"glb"/.test(lines[i]));
if (keep == null) keep = declIdx[declIdx.length - 1];

const remove = new Set(declIdx.filter((i) => i !== keep));
const out = lines.filter((_, i) => !remove.has(i));

// Normalize kept line to glb default
const keptPos = out.findIndex((l) => /^\s*let\s+activeFormat\s*=/.test(l));
if (keptPos >= 0) {
  out[keptPos] =
    "/** Prefer GLB format in inventory for gameplay-ready browsing */\nlet activeFormat = 'glb';";
}

const result = out.join('\n');
const count = [...result.matchAll(/\blet\s+activeFormat\b/g)].length;
if (count !== 1) {
  console.error('expected exactly 1 declaration, got', count);
  process.exit(1);
}

fs.writeFileSync(file, result);
console.log('wrote', file, 'bytes', result.length, 'decls', count);
