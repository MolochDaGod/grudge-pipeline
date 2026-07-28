/**
 * lib.mjs — shared helpers for the grudge-organize tooling.
 *
 * Single source of truth for the small utilities that grudge-organize.mjs and
 * grudge-asset-offload.mjs both need, so the logic is not duplicated across
 * the two CLIs. Zero dependencies (Node built-ins only).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Minimal `--flag` / `--key=value` parser. Returns { _: [positional], key: value }. */
export function parseArgs(argv) {
  const a = { _: [] };
  for (const tok of argv) {
    if (tok.startsWith('--')) {
      const [k, ...rest] = tok.slice(2).split('=');
      a[k] = rest.length ? rest.join('=') : true;
    } else a._.push(tok);
  }
  return a;
}

/** Print a CLI's own header block (the `/**` ... lines) as help text. */
export function printHelpFromSource(metaUrl) {
  const banner = fs.readFileSync(new URL(metaUrl)).toString()
    .split('\n').filter(l => l.startsWith(' *') || l.startsWith('/**'))
    .map(l => l.replace(/^\/\*\*| \*\/?/, '').replace(/^ /, '')).join('\n');
  console.log(banner);
}

/** Streaming SHA-256 of a file. Returns '' on any read error (caller should skip). */
export function sha256(file) {
  try {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1 << 20);
    try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); }
    finally { fs.closeSync(fd); }
    return h.digest('hex');
  } catch { return ''; }
}

/** CSV-escape a single cell. */
export function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
/** Serialize an array of rows (arrays) to a CSV string with a trailing newline. */
export function csv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'; }

/** Human-readable byte size, e.g. "12.3 MB". */
export function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** mkdir -p */
export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
/** Filesystem root of a path, e.g. 'F:\\' or '/'. */
export function rootOf(p) { return path.parse(path.resolve(p)).root; }
