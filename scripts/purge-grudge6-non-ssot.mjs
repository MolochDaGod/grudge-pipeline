/**
 * List / plan purge of non-SSOT grudge6 assets from D1 index.
 *
 * ONLY KEEP (character mesh inventory):
 *   models/grudge6/races/{WK|BRB|ELF|DWF|ORC|UD}_Characters.glb
 *
 * Also keep atlases: textures/grudge6/**
 * Keep baked anims: anims/baked/** (not grudge6 multipack anim GLBs)
 *
 * Usage:
 *   node scripts/purge-grudge6-non-ssot.mjs
 *   node scripts/purge-grudge6-non-ssot.mjs --write reports/purge-grudge6-non-ssot
 *
 * Does NOT delete R2 objects unless you pass --execute-r2 (requires wrangler + review).
 * Default: dry plan JSON + SQL DELETE for asset_registry only.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const D1 = 'https://api.grudge-studio.com/assets';
const SSOT_RE = /^models\/grudge6\/races\/(WK|BRB|ELF|DWF|ORC|UD)_Characters\.glb$/i;
const KEEP_ATLAS = /^textures\/grudge6\//i;
const KEEP_BAKED = /^anims\/baked\//i;

function isRelated(k) {
  const key = String(k || '').replace(/\\/g, '/');
  return (
    /grudge6/i.test(key) ||
    /models\/characters\/grudge6\//i.test(key) ||
    /models\/animations\/grudge6/i.test(key) ||
    /cdn\/assets\/characters\//i.test(key) ||
    /_Characters\.(glb|fbx)$/i.test(key)
  );
}

function shouldPurge(k) {
  const key = String(k || '').replace(/\\/g, '/').replace(/^\//, '');
  if (!isRelated(key)) return false;
  if (SSOT_RE.test(key)) return false;
  if (KEEP_ATLAS.test(key)) return false;
  if (KEEP_BAKED.test(key)) return false;
  return true;
}

async function fetchAll() {
  const head = await fetch(`${D1}?limit=1&offset=0`);
  const hj = await head.json();
  const total = Number(hj.total) || 0;
  const page = 200;
  const out = [];
  for (let offset = 0; offset < total; offset += page) {
    const r = await fetch(`${D1}?limit=${page}&offset=${offset}`);
    if (!r.ok) break;
    const j = await r.json();
    out.push(...(j.assets || []));
    if (offset % 1000 === 0) console.info(`… fetched ${out.length}/${total}`);
  }
  return { total, assets: out };
}

const args = process.argv.slice(2);
const writeIdx = args.indexOf('--write');
const outBase =
  writeIdx >= 0
    ? resolve(root, args[writeIdx + 1] || 'reports/purge-grudge6-non-ssot')
    : resolve(root, 'reports/purge-grudge6-non-ssot');

const { total, assets } = await fetchAll();
const purge = [];
const keep = [];
for (const a of assets) {
  const key = a.r2Key || a.id || '';
  if (!isRelated(key)) continue;
  if (shouldPurge(key)) purge.push(a);
  else keep.push(a);
}

const plan = {
  version: 1,
  generated: new Date().toISOString(),
  d1Total: total,
  grudge6Related: purge.length + keep.length,
  keepSsot: keep.map((a) => a.r2Key || a.id),
  purgeCount: purge.length,
  purge: purge.map((a) => ({
    r2Key: a.r2Key || a.id,
    grudgeUuid: a.grudgeUuid,
    name: a.name,
  })),
  rule: 'ONLY keep models/grudge6/races/{PREFIX}_Characters.glb + textures/grudge6/** + anims/baked/**',
};

mkdirSync(dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.json`, JSON.stringify(plan, null, 2));

const sql = [
  '-- Purge non-SSOT grudge6 rows from D1 asset_registry',
  `-- generated ${plan.generated} · ${purge.length} keys`,
  'BEGIN;',
  ...purge.map(
    (a) =>
      `DELETE FROM asset_registry WHERE r2_key = '${String(a.r2Key || a.id).replace(/'/g, "''")}';`,
  ),
  'COMMIT;',
  '',
].join('\n');
writeFileSync(`${outBase}.sql`, sql);

const sh = [
  '#!/usr/bin/env bash',
  '# DRY by default — remove "echo" to actually delete R2 objects (DANGEROUS)',
  `set -euo pipefail`,
  ...purge.map(
    (a) =>
      `echo npx wrangler r2 object delete grudge-assets/${a.r2Key || a.id} --remote`,
  ),
  '',
].join('\n');
writeFileSync(`${outBase}.sh`, sh);

console.info(
  `grudge6 related=${plan.grudge6Related} keep=${keep.length} purge=${purge.length}`,
);
console.info(`wrote ${outBase}.json / .sql / .sh`);
console.info('KEEP:', plan.keepSsot.slice(0, 12).join('\n  '));
