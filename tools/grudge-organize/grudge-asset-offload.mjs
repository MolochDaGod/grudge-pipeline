#!/usr/bin/env node
/**
 * grudge-asset-offload.mjs
 * ------------------------------------------------------------------------
 * Move heavy/duplicated binary ASSETS out of your git repos and into
 * Cloudflare R2 (S3-compatible) object storage — keeping exactly ONE copy
 * per unique file. Uses content-addressed keys (assets/<sha256>.<ext>) so
 * every duplicate across every repo collapses to a single object.
 *
 * Emits a source-path -> object-key -> public-URL manifest you use to
 * rewrite references, plus a suggested .gitignore. It NEVER edits your
 * source files or deletes anything.
 *
 * SAFE BY DEFAULT: dry-run. It only inventories + writes a manifest.
 * Pass --apply to actually upload to R2 (requires R2_* env vars).
 *
 * Dry-run needs zero dependencies. --apply lazy-imports @aws-sdk/client-s3
 * (already a dependency of grudge-pipeline).
 *
 * ENV (for --apply): R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *                    R2_BUCKET, and optionally R2_PUBLIC_BASE_URL.
 *
 * USAGE:
 *   node grudge-asset-offload.mjs --repo=. 
 *   node grudge-asset-offload.mjs --repo=F:\github\Dungeon-Crawler-Quest --apply
 *
 * FLAGS:
 *   --repo=<path>        Repo / folder to scan               (default cwd)
 *   --min-size=<bytes>   Only offload files >= this          (default 262144 = 256KB)
 *   --ext=<a,b,..>       Asset extensions to offload          (default sensible set)
 *   --key-prefix=<p>     Object key prefix                    (default "assets/")
 *   --base-url=<url>     Public URL base for the manifest     (default env R2_PUBLIC_BASE_URL)
 *   --bucket=<name>      R2 bucket                            (default env R2_BUCKET)
 *   --report-dir=<dir>   Where the manifest is written        (default ./asset-offload-<ts>)
 *   --apply              Actually upload to R2 (otherwise dry-run)
 * ------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const a = { _: [] };
  for (const t of argv) {
    if (t.startsWith('--')) { const [k, ...r] = t.slice(2).split('='); a[k] = r.length ? r.join('=') : true; }
    else a._.push(t);
  }
  return a;
}
const ARGS = parseArgs(process.argv.slice(2));
if (ARGS.help || ARGS.h) {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString()
    .split('\n').filter(l => l.startsWith(' *') || l.startsWith('/**'))
    .map(l => l.replace(/^\/\*\*| \*\/?/, '').replace(/^ /, '')).join('\n'));
  process.exit(0);
}

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const REPO = path.resolve(ARGS.repo ? String(ARGS.repo) : process.cwd());
const MIN_SIZE = ARGS['min-size'] ? parseInt(ARGS['min-size'], 10) : 256 * 1024;
const KEY_PREFIX = ARGS['key-prefix'] ? String(ARGS['key-prefix']) : 'assets/';
const BUCKET = ARGS.bucket ? String(ARGS.bucket) : (process.env.R2_BUCKET || 'grudge-assets');
const BASE_URL = (ARGS['base-url'] ? String(ARGS['base-url']) : (process.env.R2_PUBLIC_BASE_URL || '')).replace(/\/$/, '');
const APPLY = !!ARGS.apply;
const REPORT_DIR = path.resolve(ARGS['report-dir'] ? String(ARGS['report-dir']) : `asset-offload-${STAMP}`);

const DEFAULT_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tga', 'dds', 'hdr', 'exr',
  'glb', 'gltf', 'fbx', 'obj', 'mtl', 'blend', 'stl', 'ply',
  'wav', 'mp3', 'ogg', 'flac', 'mp4', 'webm', 'mov',
  'zip', 'rar', '7z', 'pak', 'bin'];
const EXTS = new Set((ARGS.ext ? String(ARGS.ext).split(',') : DEFAULT_EXT).map(s => s.trim().replace(/^\./, '').toLowerCase()));
const EXCLUDE = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache']);

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
  zip: 'application/zip', json: 'application/json',
};

function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function csv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'; }
function fmt(n) { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return n.toFixed(i ? 1 : 0) + ' ' + u[i]; }

// ---- scan ----
function scan(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!EXCLUDE.has(e.name)) stack.push(full); continue; }
      if (!e.isFile()) continue;
      const ext = (path.extname(e.name).slice(1) || '').toLowerCase();
      if (!EXTS.has(ext)) continue;
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (st.size < MIN_SIZE) continue;
      out.push({ path: full, size: st.size, ext });
    }
  }
  return out;
}

async function main() {
  console.log('='.repeat(72));
  console.log(' Grudge Asset Offload  (content-addressed R2 upload)');
  console.log('='.repeat(72));
  console.log(` Mode      : ${APPLY ? 'APPLY (upload to R2)' : 'DRY-RUN (manifest only)'}`);
  console.log(` Repo      : ${REPO}`);
  console.log(` Bucket    : ${BUCKET}`);
  console.log(` Min size  : ${fmt(MIN_SIZE)}`);
  console.log(` Key prefix: ${KEY_PREFIX}`);
  console.log('-'.repeat(72));

  const files = scan(REPO);
  const byHash = new Map();     // hash -> { ext, size, sources:[] }
  let i = 0;
  for (const f of files) {
    if (++i % 200 === 0) process.stderr.write(`  hashing ${i}/${files.length}\r`);
    let h; try { h = sha256(f.path); } catch { continue; }
    const rec = byHash.get(h) || { ext: f.ext, size: f.size, sources: [] };
    rec.sources.push(f.path);
    byHash.set(h, rec);
  }
  process.stderr.write('\r');

  const totalCopies = files.length;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const uniqueBytes = [...byHash.values()].reduce((s, r) => s + r.size, 0);
  const saved = totalBytes - uniqueBytes;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const rows = [['sha256', 'object_key', 'public_url', 'size_bytes', 'copies', 'source_path']];
  const keyForHash = new Map();
  for (const [h, rec] of byHash) {
    const key = `${KEY_PREFIX}${h}${rec.ext ? '.' + rec.ext : ''}`;
    keyForHash.set(h, key);
    const url = BASE_URL ? `${BASE_URL}/${key}` : `(set --base-url) /${key}`;
    for (const src of rec.sources) rows.push([h, key, url, rec.size, rec.sources.length, path.relative(REPO, src)]);
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'offload-manifest.csv'), csv(rows));
  fs.writeFileSync(path.join(REPORT_DIR, 'offload-manifest.json'), JSON.stringify(
    [...byHash.entries()].map(([h, rec]) => ({
      sha256: h, key: keyForHash.get(h), size: rec.size, copies: rec.sources.length,
      url: BASE_URL ? `${BASE_URL}/${keyForHash.get(h)}` : null,
      sources: rec.sources.map(s => path.relative(REPO, s)),
    })), null, 2));

  // suggested .gitignore (only the assets that are being offloaded)
  const ignoreLines = [...new Set(rows.slice(1).map(r => r[5].split(path.sep).join('/')))].sort();
  fs.writeFileSync(path.join(REPORT_DIR, 'gitignore-suggestions.txt'),
    '# Assets offloaded to object storage — safe to gitignore AFTER references are updated\n' + ignoreLines.join('\n') + '\n');

  console.log(`Asset files found       : ${totalCopies} (${fmt(totalBytes)})`);
  console.log(`Unique objects          : ${byHash.size} (${fmt(uniqueBytes)})`);
  console.log(`Duplicate copies folded : ${totalCopies - byHash.size} (${fmt(saved)} dedup saving)`);
  console.log(`Manifest                : ${path.join(REPORT_DIR, 'offload-manifest.csv')}`);
  console.log(`Gitignore suggestions   : ${path.join(REPORT_DIR, 'gitignore-suggestions.txt')}`);

  if (!APPLY) {
    console.log('-'.repeat(72));
    console.log('DRY-RUN. Review the manifest, then re-run with --apply (and R2_* env set)');
    console.log('to upload one copy of each unique asset to R2. Sources are never modified.');
    return;
  }

  // ---- apply: upload to R2 ----
  for (const v of ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[v]) { console.error(`Missing env ${v} — cannot upload.`); process.exit(1); }
  }
  const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  let uploaded = 0, skipped = 0, failed = 0, sentBytes = 0;
  let n = 0;
  for (const [h, rec] of byHash) {
    if (++n % 25 === 0) process.stderr.write(`  uploading ${n}/${byHash.size}\r`);
    const key = keyForHash.get(h);
    try {
      try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); skipped++; continue; } catch { /* not present */ }
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key,
        Body: fs.createReadStream(rec.sources[0]), ContentLength: rec.size,
        ContentType: MIME[rec.ext] || 'application/octet-stream',
      }));
      uploaded++; sentBytes += rec.size;
    } catch (e) { failed++; }
  }
  process.stderr.write('\r');
  console.log('-'.repeat(72));
  console.log(`Uploaded: ${uploaded} (${fmt(sentBytes)}), already-present: ${skipped}, failed: ${failed}.`);
  console.log('Next: update code references to the URLs in offload-manifest.csv, verify they load,');
  console.log('then remove the local copies (git rm) and add the gitignore-suggestions entries.');
}

main().catch(e => { console.error(e); process.exit(1); });
