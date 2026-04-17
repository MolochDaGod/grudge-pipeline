/**
 * utils.mjs — Shared pipeline utilities
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export function log(msg) { console.log(`[pipeline] ${msg}`); }
export function warn(msg) { console.warn(`[pipeline] ⚠ ${msg}`); }
export function err(msg) { console.error(`[pipeline] ✖ ${msg}`); }
export function vlog(msg, verbose = false) { if (verbose) console.log(`  ${msg}`); }

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function walkDir(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, exts));
    } else if (exts.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

export function isNewer(src, dest) {
  if (!fs.existsSync(dest)) return true;
  return fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs;
}

export function fileSizeKB(p) {
  try { return Math.round(fs.statSync(p).size / 1024); } catch { return 0; }
}

export function md5(filePath) {
  const data = fs.readFileSync(filePath);
  return createHash('md5').update(data).digest('hex');
}

/** Sanitize a filename for URL-safe usage */
export function safeName(name) {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^\w.-]/g, '')
    .toLowerCase();
}

/** Extract top-level category from path relative to organized dir */
export function getCategory(relPath) {
  const topFolder = relPath.split(/[/\\]/)[0];
  return topFolder.replace(/^\d+_/, '').toLowerCase().replace(/\s+/g, '-');
}
