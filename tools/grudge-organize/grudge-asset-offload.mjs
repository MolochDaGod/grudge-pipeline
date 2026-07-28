#!/usr/bin/env node
/**
 * grudge-asset-offload.mjs
 * ------------------------------------------------------------------------
 * Move heavy/duplicated binary ASSETS out of your git repos and into object
 * storage — keeping exactly ONE copy per unique file (content-addressed by
 * SHA-256), so every duplicate across every repo collapses to a single object.
 *
 * PROPER API USAGE (default, --target=api): uploads each unique asset through
 * the Grudge ObjectStore Worker (`POST {OBJECTSTORE_WORKER_URL}/v1/assets`,
 * multipart) — the same canonical path the pipeline uses. That registers the
 * asset in the D1 catalog (category / tags / metadata) AND stores it in R2,
 * served via the CDN. This is proper API + data usage, not a raw blob dump.
 *
 * --target=r2 is a fallback that writes straight to an R2 bucket with the
 * S3 API (no catalog registration) for when the Worker is unavailable.
 *
 * Emits a source-path -> object-key -> public-URL manifest you use to rewrite
 * references, plus a suggested .gitignore. It NEVER edits or deletes sources.
 *
 * SAFE BY DEFAULT: dry-run. It only inventories + writes a manifest.
 * Pass --apply to actually upload. Dry-run needs zero dependencies.
 *
 * ENV: OBJECTSTORE_WORKER_URL, OBJECTSTORE_API_KEY (or INTERNAL_API_KEY),
 *      PUBLIC_CDN_URL  — for --target=api.
 *      R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *      R2_PUBLIC_BASE_URL — for --target=r2.
 *
 * USAGE:
 *   node grudge-asset-offload.mjs --repo=.
 *   node grudge-asset-offload.mjs --repo=F:\github\Dungeon-Crawler-Quest --apply
 *   node grudge-asset-offload.mjs --repo=. --target=r2 --apply
 *
 * FLAGS:
 *   --repo=<path>          Repo / folder to scan               (default cwd)
 *   --min-size=<bytes>     Only offload files >= this          (default 262144 = 256KB)
 *   --ext=<a,b,..>         Asset extensions to offload          (default sensible set)
 *   --key-prefix=<p>       Object key prefix                    (default "assets/")
 *   --target=<api|r2>      Upload path                          (default api)
 *   --objectstore-url=<u>  ObjectStore Worker base (api)        (env OBJECTSTORE_WORKER_URL)
 *   --api-key=<k>          Worker X-API-Key (api)               (env OBJECTSTORE_API_KEY|INTERNAL_API_KEY)
 *   --cdn-base=<u>         Public CDN base for URLs             (env PUBLIC_CDN_URL)
 *   --bucket=<name>        R2 bucket (r2)                       (env R2_BUCKET)
 *   --base-url=<url>       Public URL base (r2 manifest)        (env R2_PUBLIC_BASE_URL)
 *   --report-dir=<dir>     Where the manifest is written        (default ./asset-offload-<ts>)
 *   --apply                Actually upload (otherwise dry-run)
 * ------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, printHelpFromSource, sha256, csv, fmtBytes, ensureDir } from './lib.mjs';

const ARGS = parseArgs(process.argv.slice(2));
if (ARGS.help || ARGS.h) { printHelpFromSource(import.meta.url); process.exit(0); }

const STAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const REPO = path.resolve(ARGS.repo ? String(ARGS.repo) : process.cwd());
const MIN_SIZE = ARGS['min-size'] ? parseInt(ARGS['min-size'], 10) : 256 * 1024;
const KEY_PREFIX = ARGS['key-prefix'] ? String(ARGS['key-prefix']) : 'assets/';
const APPLY = !!ARGS.apply;
const TARGET = (ARGS.target ? String(ARGS.target) : 'api').toLowerCase();
const REPORT_DIR = path.resolve(ARGS['report-dir'] ? String(ARGS['report-dir']) : `asset-offload-${STAMP}`);

// --target=api (proper ObjectStore Worker API)
const OBJECTSTORE_URL = (ARGS['objectstore-url'] || process.env.OBJECTSTORE_WORKER_URL || 'https://objectstore.grudge-studio.com').replace(/\/$/, '');
const OBJECTSTORE_KEY = ARGS['api-key'] || process.env.OBJECTSTORE_API_KEY || process.env.INTERNAL_API_KEY || '';
const CDN_BASE = (ARGS['cdn-base'] || process.env.PUBLIC_CDN_URL || 'https://assets.grudge-studio.com').replace(/\/$/, '');
// --target=r2 (raw S3 fallback)
const BUCKET = ARGS.bucket ? String(ARGS.bucket) : (process.env.R2_BUCKET || 'grudge-assets');
const R2_BASE_URL = (ARGS['base-url'] ? String(ARGS['base-url']) : (process.env.R2_PUBLIC_BASE_URL || CDN_BASE)).replace(/\/$/, '');

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

/** Map a file extension to a catalog category (matches the assets data model). */
function categoryFor(ext) {
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tga', 'dds', 'hdr', 'exr', 'svg'].includes(ext)) return 'texture';
  if (['glb', 'gltf', 'fbx', 'obj', 'mtl', 'blend', 'stl', 'ply'].includes(ext)) return 'model';
  if (['wav', 'mp3', 'ogg', 'flac'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['zip', 'rar', '7z', 'pak', 'bin'].includes(ext)) return 'archive';
  return 'asset';
}

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

/** Upload one unique asset through the ObjectStore Worker API (multipart → D1 catalog + R2). */
async function uploadViaApi(hash, rec, key) {
  const buf = fs.readFileSync(rec.sources[0]);
  const filename = key.split('/').pop();                 // content-addressed <sha>.<ext>
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: MIME[rec.ext] || 'application/octet-stream' }), filename);
  fd.append('filename', filename);
  fd.append('category', categoryFor(rec.ext));
  fd.append('tags', JSON.stringify(['grudge-organize', rec.ext].filter(Boolean)));
  fd.append('metadata', JSON.stringify({
    source: 'grudge-organize', sha256: hash, sizeBytes: rec.size,
    sources: rec.sources.map(s => path.relative(REPO, s)),
  }));
  const headers = {};
  if (OBJECTSTORE_KEY) headers['X-API-Key'] = OBJECTSTORE_KEY;
  const res = await fetch(`${OBJECTSTORE_URL}/v1/assets`, { method: 'POST', body: fd, headers });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;                                            // may include id, key, url
}

async function main() {
  console.log('='.repeat(72));
  console.log(' Grudge Asset Offload  (content-addressed, catalog-aware)');
  console.log('='.repeat(72));
  console.log(` Mode      : ${APPLY ? 'APPLY (upload)' : 'DRY-RUN (manifest only)'}`);
  console.log(` Target    : ${TARGET === 'r2' ? `r2 (bucket ${BUCKET})` : `api (${OBJECTSTORE_URL})`}`);
  console.log(` Repo      : ${REPO}`);
  console.log(` Min size  : ${fmtBytes(MIN_SIZE)}`);
  console.log('-'.repeat(72));

  const files = scan(REPO);
  const byHash = new Map();     // hash -> { ext, size, sources:[] }
  let i = 0;
  for (const f of files) {
    if (++i % 200 === 0) process.stderr.write(`  hashing ${i}/${files.length}\r`);
    const h = sha256(f.path); if (!h) continue;
    const rec = byHash.get(h) || { ext: f.ext, size: f.size, sources: [] };
    rec.sources.push(f.path);
    byHash.set(h, rec);
  }
  process.stderr.write('\r');

  const totalCopies = files.length;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const uniqueBytes = [...byHash.values()].reduce((s, r) => s + r.size, 0);
  const saved = totalBytes - uniqueBytes;
  const cdnBase = TARGET === 'r2' ? R2_BASE_URL : CDN_BASE;

  ensureDir(REPORT_DIR);
  const keyForHash = new Map();
  const rows = [['sha256', 'object_key', 'category', 'public_url', 'size_bytes', 'copies', 'source_path']];
  for (const [h, rec] of byHash) {
    const key = `${KEY_PREFIX}${h}${rec.ext ? '.' + rec.ext : ''}`;
    keyForHash.set(h, key);
    const url = `${cdnBase}/${key}`;
    for (const src of rec.sources) rows.push([h, key, categoryFor(rec.ext), url, rec.size, rec.sources.length, path.relative(REPO, src)]);
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'offload-manifest.csv'), csv(rows));
  fs.writeFileSync(path.join(REPORT_DIR, 'offload-manifest.json'), JSON.stringify(
    [...byHash.entries()].map(([h, rec]) => ({
      sha256: h, key: keyForHash.get(h), category: categoryFor(rec.ext), size: rec.size,
      copies: rec.sources.length, url: `${cdnBase}/${keyForHash.get(h)}`,
      sources: rec.sources.map(s => path.relative(REPO, s)),
    })), null, 2));

  const ignoreLines = [...new Set(rows.slice(1).map(r => r[6].split(path.sep).join('/')))].sort();
  fs.writeFileSync(path.join(REPORT_DIR, 'gitignore-suggestions.txt'),
    '# Assets offloaded to object storage — safe to gitignore AFTER references are updated\n' + ignoreLines.join('\n') + '\n');

  console.log(`Asset files found       : ${totalCopies} (${fmtBytes(totalBytes)})`);
  console.log(`Unique objects          : ${byHash.size} (${fmtBytes(uniqueBytes)})`);
  console.log(`Duplicate copies folded : ${totalCopies - byHash.size} (${fmtBytes(saved)} dedup saving)`);
  console.log(`Manifest                : ${path.join(REPORT_DIR, 'offload-manifest.csv')}`);

  if (!APPLY) {
    console.log('-'.repeat(72));
    console.log('DRY-RUN. Review the manifest, then re-run with --apply to upload one copy');
    console.log(`of each unique asset via ${TARGET === 'r2' ? 'the R2 S3 API' : 'the ObjectStore catalog API'}. Sources are never modified.`);
    return;
  }

  const errors = [];
  if (TARGET === 'r2') {
    for (const v of ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
      if (!process.env[v]) { console.error(`Missing env ${v} — cannot upload.`); process.exit(1); }
    }
    const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto', endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    });
    let uploaded = 0, skipped = 0, failed = 0, sentBytes = 0, n = 0;
    for (const [h, rec] of byHash) {
      if (++n % 25 === 0) process.stderr.write(`  uploading ${n}/${byHash.size}\r`);
      const key = keyForHash.get(h);
      try {
        try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); skipped++; continue; } catch { /* not present */ }
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET, Key: key, Body: fs.createReadStream(rec.sources[0]),
          ContentLength: rec.size, ContentType: MIME[rec.ext] || 'application/octet-stream',
        }));
        uploaded++; sentBytes += rec.size;
      } catch (e) { failed++; errors.push(`${key}: ${e.message}`); }
    }
    process.stderr.write('\r');
    console.log('-'.repeat(72));
    console.log(`R2 upload complete. Uploaded: ${uploaded} (${fmtBytes(sentBytes)}), already-present: ${skipped}, failed: ${failed}.`);
  } else {
    // proper API path
    const results = [];
    let uploaded = 0, failed = 0, sentBytes = 0, n = 0;
    for (const [h, rec] of byHash) {
      if (++n % 25 === 0) process.stderr.write(`  uploading ${n}/${byHash.size}\r`);
      try {
        const data = await uploadViaApi(h, rec, keyForHash.get(h));
        uploaded++; sentBytes += rec.size;
        results.push({ sha256: h, key: keyForHash.get(h), size: rec.size, response: data, cdnUrl: data.url || (data.key ? `${CDN_BASE}/${data.key}` : `${CDN_BASE}/${keyForHash.get(h)}`) });
      } catch (e) { failed++; errors.push(`${keyForHash.get(h)}: ${e.message}`); }
    }
    process.stderr.write('\r');
    fs.writeFileSync(path.join(REPORT_DIR, 'upload-results.json'), JSON.stringify(results, null, 2));
    console.log('-'.repeat(72));
    console.log(`Catalog upload complete. Uploaded: ${uploaded} (${fmtBytes(sentBytes)}), failed: ${failed}.`);
    console.log(`Per-asset CDN URLs + catalog responses: ${path.join(REPORT_DIR, 'upload-results.json')}`);
  }
  if (errors.length) {
    fs.writeFileSync(path.join(REPORT_DIR, 'errors.log'), errors.join('\n') + '\n');
    console.log(`${errors.length} error(s) logged to ${path.join(REPORT_DIR, 'errors.log')}`);
  }
  console.log('Next: update code references to the URLs in the manifest, verify they load,');
  console.log('then remove the local copies (git rm) and add the gitignore-suggestions entries.');
}

main().catch(e => { console.error(e); process.exit(1); });
