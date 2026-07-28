/**
 * Patch model-browser.js: exactly one activeFormat (default 'glb').
 * Add favicon link to index.html if missing.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mbPath = path.join(root, 'web/js/model-browser.js');
const indexPath = path.join(root, 'web/index.html');

function countDecls(t) {
  return [...t.matchAll(/\blet\s+activeFormat\b/g)].length;
}

function fixActiveFormat(t) {
  const lines = t.split(/\n/);
  const idx = [];
  lines.forEach((l, i) => {
    if (/^\s*let\s+activeFormat\s*=/.test(l)) idx.push(i);
  });

  if (idx.length === 0) {
    // Insert after activeGroup
    const g = lines.findIndex((l) => /^\s*let\s+activeGroup\s*=/.test(l));
    if (g >= 0) {
      lines.splice(
        g + 1,
        0,
        "/** Prefer GLB format in inventory for gameplay-ready browsing */",
        "let activeFormat = 'glb';",
      );
    } else {
      throw new Error('could not find activeGroup to insert activeFormat');
    }
  } else if (idx.length > 1) {
    const keep = idx.find((i) => /glb/.test(lines[i])) ?? idx[idx.length - 1];
    const rem = new Set(idx.filter((i) => i !== keep));
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (rem.has(i)) continue;
      if (i === keep) {
        out.push("/** Prefer GLB format in inventory for gameplay-ready browsing */");
        out.push("let activeFormat = 'glb';");
        continue;
      }
      out.push(lines[i]);
    }
    return out.join('\n');
  } else {
    // exactly one — normalize to glb default
    lines[idx[0]] = "let activeFormat = 'glb';";
    // ensure comment above if missing
    if (idx[0] > 0 && !/Prefer GLB|activeFormat/.test(lines[idx[0] - 1])) {
      lines.splice(idx[0], 0, "/** Prefer GLB format in inventory for gameplay-ready browsing */");
    }
    return lines.join('\n');
  }
  return lines.join('\n');
}

// Prefer feat branch file when available
let source = null;
try {
  source = execSync('git show feat/forge-scene-export:web/js/model-browser.js', {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20e6,
  });
  console.log('using feat/forge-scene-export model-browser.js');
} catch {
  source = fs.readFileSync(mbPath, 'utf8');
  console.log('using working tree model-browser.js');
}

// If feat has no decl (corrupt), fall back to master
if (countDecls(source) === 0) {
  try {
    source = execSync('git show origin/master:web/js/model-browser.js', {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20e6,
    });
    console.log('feat missing decl — using origin/master then fix');
  } catch {
    /* keep source */
  }
}

const fixed = fixActiveFormat(source);
const n = countDecls(fixed);
if (n !== 1) {
  console.error('expected 1 activeFormat decl, got', n);
  process.exit(1);
}
fs.writeFileSync(mbPath, fixed);
console.log('wrote', mbPath, 'bytes', fixed.length, 'decls', n);

// favicon link
let html = fs.readFileSync(indexPath, 'utf8');
if (!/rel=["']icon["']/.test(html)) {
  html = html.replace(
    /<\/title>/,
    '</title>\n  <link rel="icon" href="/favicon.ico" type="image/x-icon">',
  );
  fs.writeFileSync(indexPath, html);
  console.log('added favicon link to index.html');
} else {
  console.log('favicon link already present');
}
