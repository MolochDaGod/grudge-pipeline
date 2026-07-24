#!/usr/bin/env node
/**
 * Deduplicate asset catalogs / local dist trees.
 *
 * Usage:
 *   node scripts/dedupe-purge.mjs --catalog path/to/catalog.json [--out reports/dedupe.json]
 *   node scripts/dedupe-purge.mjs --dir D:\Games\Models\_codex_prod\dist [--hash] [--out reports/dedupe.json]
 *   node scripts/dedupe-purge.mjs --catalog ... --write-plan reports/purge-plan.json
 *
 * Never deletes R2 unless you pipe plan.r2Cmds yourself (and remove dry-run).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findDuplicateGroups, buildPurgePlan, fileSha256 } from './lib/dedupe.mjs';
import { grudgeUuidFromR2Key, normalizeR2Key } from './lib/grudgeUuid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function arg(name, def = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const catalogPath = arg('--catalog');
const dirPath = arg('--dir');
const outPath = arg('--out', path.join(__dirname, '../reports/dedupe-latest.json'));
const planPath = arg('--write-plan', null);
const doHash = args.includes('--hash');

function loadFromCatalog(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = j.meshes || j.assets || [];
  return list.map((m) => ({
    id: m.id,
    r2Key: normalizeR2Key(m.r2Key || (m.id ? `models/codex/${m.id}.glb` : '')),
    grudgeUuid: m.grudgeUuid,
    format: (m.r2Key || m.id || '').split('.').pop(),
    bytes: m.bytes,
    textures: m.textures,
    textureStatus: m.textureStatus,
    productionBaked: m.productionBaked,
    bakePipeline: m.bakePipeline,
    pack: m.pack,
    name: m.name,
  }));
}

function walkGlbs(root) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(glb|gltf|fbx)$/i.test(ent.name)) {
        const rel = path.relative(root, p).replace(/\\/g, '/');
        // heuristic r2 key for codex dist layout: pack/cat/id/file.glb → models/codex/pack/cat/id.glb
        let r2Key = `models/codex/${rel}`;
        const parts = rel.split('/');
        if (parts.length >= 3 && parts[parts.length - 1].endsWith('.glb')) {
          const id = parts[parts.length - 2];
          const pack = parts[0];
          const cat = parts[1];
          r2Key = `models/codex/${pack}/${cat}/${id}.glb`;
        }
        const st = fs.statSync(p);
        const row = {
          id: rel,
          path: p,
          r2Key,
          grudgeUuid: grudgeUuidFromR2Key(r2Key),
          format: path.extname(ent.name).slice(1).toLowerCase(),
          bytes: st.size,
        };
        if (doHash) row.contentHash = fileSha256(p);
        out.push(row);
      }
    }
  }
  walk(root);
  return out;
}

async function main() {
  let assets = [];
  if (catalogPath) assets = assets.concat(loadFromCatalog(catalogPath));
  if (dirPath) assets = assets.concat(walkGlbs(dirPath));
  if (!assets.length) {
    console.error('Provide --catalog and/or --dir');
    process.exit(1);
  }

  console.log(`[dedupe] scanning ${assets.length} assets…`);
  const result = findDuplicateGroups(assets);
  const plan = buildPurgePlan(result, { dryRun: true });

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ...result, plan: { removeCount: plan.remove.length } }, null, 2),
    'utf8',
  );
  console.log(`[dedupe] summary`, result.summary);
  console.log(`[dedupe] report → ${outPath}`);

  if (planPath) {
    fs.mkdirSync(path.dirname(path.resolve(planPath)), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
    const sh = planPath.replace(/\.json$/i, '.sh');
    fs.writeFileSync(sh, plan.r2Cmds.join('\n') + '\n', 'utf8');
    const sql = planPath.replace(/\.json$/i, '.sql');
    fs.writeFileSync(sql, plan.d1Sql + '\n', 'utf8');
    console.log(`[dedupe] purge plan → ${planPath}`);
    console.log(`[dedupe] shell → ${sh}`);
    console.log(`[dedupe] d1 sql → ${sql}`);
  }

  // print top groups
  const top = [...result.byBasename, ...result.byUuid].slice(0, 12);
  for (const g of top) {
    console.log(
      `  [${g.reason}] ${g.key} keep=${g.keep.r2Key} purge=${g.purge.map((p) => p.r2Key).join(', ')}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
