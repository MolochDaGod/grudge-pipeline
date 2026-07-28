#!/usr/bin/env node
/**
 * ship-production-to-r2.mjs
 *
 * Ship LOCAL production assets → Cloudflare R2 grudge-assets with:
 *  - GLB magic + mesh/texture inspect
 *  - Best-practice production labels
 *  - Deterministic grudgeUuid
 *  - CDN verify HEAD
 *  - Manifest + D1 seed SQL for asset_registry
 *
 * Usage (from grudge-pipeline root):
 *   node scripts/ship-production-to-r2.mjs --dry-run
 *   node scripts/ship-production-to-r2.mjs
 *   node scripts/ship-production-to-r2.mjs --only=vfx
 *   node scripts/ship-production-to-r2.mjs --only=arrow,vfx --force
 *
 * Upload uses Cloudflare REST API (OAuth from ~/.wrangler/config/default.toml)
 * because wrangler r2 put is flaky on this machine.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectGlb, productionGate } from './lib/glbInspect.mjs';
import { buildProductionLabel, d1MetadataJson } from './lib/productionLabels.mjs';
import { grudgeUuidFromR2Key } from './lib/grudgeUuid.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GB = path.resolve(ROOT, '..', 'GrudgeBuilder');
const ACCOUNT = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || 'ee475864561b02d4588180b8b9acf694';
const BUCKET = process.env.R2_BUCKET_ASSETS || 'grudge-assets';
const CDN = 'https://assets.grudge-studio.com';
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg
  ? onlyArg
      .slice('--only='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const MAX_WEB_BYTES = 20 * 1024 * 1024; // 20 MB — large cinematic meshes need separate bake

/** @type {Array<{id:string, packs:string[], local:string, r2Key:string, kind:string, subtype?:string, group:string, tags?:string[], maxBytes?:number, requireTexture?:boolean, notes?:string}>} */
const MANIFEST = [
  // ── Combat projectiles ───────────────────────────────────────────────────
  {
    id: 'arrow.shell_l1',
    packs: ['arrow', 'combat', 'projectile'],
    local: path.join(ROOT, 'tmp/arrow-inspect/Shell_Arrow_L1.glb'),
    r2Key: 'models/projectiles/shell_arrow_l1.glb',
    kind: 'projectile',
    subtype: 'arrow',
    group: 'projectiles',
    tags: ['arrow', 'rts-shell', 'textured'],
    notes: 'RTS shell arrow — SI ~arrow band; rebake atlas if yellow',
  },
  {
    id: 'arrow.b1.rebake',
    packs: ['arrow', 'combat', 'projectile'],
    local: path.join(ROOT, 'tmp/arrow-rebake/_arrow_b_1.glb'),
    r2Key: 'models/weapons/bow/_arrow_b_1.glb',
    kind: 'projectile',
    subtype: 'arrow',
    group: 'bow',
    tags: ['arrow', 'bow', 'rebake'],
    notes: 'Rebaked bow arrow with texture map',
  },
  // ── VFX (web-sized only) ─────────────────────────────────────────────────
  {
    id: 'vfx.projectiles.wod',
    packs: ['vfx', 'combat', 'projectile'],
    local: path.join(GB, 'client/public/models/vfx/projectiles/wod_parts.glb'),
    r2Key: 'models/vfx/projectiles/wod_parts.glb',
    kind: 'vfx',
    subtype: 'trail',
    group: 'projectiles',
    tags: ['trail', 'parts'],
    requireTexture: false,
  },
  ...['warning_01', 'warning_02', 'warning_03'].map((w) => ({
    id: `vfx.${w}`,
    packs: ['vfx', 'combat'],
    local: path.join(GB, `client/public/models/vfx/${w}.glb`),
    r2Key: `models/vfx/${w}.glb`,
    kind: 'vfx',
    subtype: 'impact',
    group: 'warning',
    tags: ['telegraph', 'aoe'],
    requireTexture: false,
  })),
  ...[
    'arcane_magic',
    'atomic_magic',
    'binding_magic',
    'blood_magic',
    'chemical_magic',
    'command_magic',
    'dark_magic',
    'kinetic_magic',
    'magnetic_magic',
    'primordial_magic',
  ].map((n) => ({
    id: `vfx.status.${n}`,
    packs: ['vfx', 'combat', 'magic'],
    local: path.join(GB, `client/public/models/vfx/status-magic/${n}.glb`),
    r2Key: `models/vfx/status-magic/${n}.glb`,
    kind: 'vfx',
    subtype: 'magic_orb',
    group: 'status-magic',
    tags: ['status', 'magic', n.replace('_magic', '')],
    requireTexture: false,
  })),
  // ── Airship (size-gated) ─────────────────────────────────────────────────
  {
    id: 'airship.interior',
    packs: ['airship', 'boat'],
    local: path.join(GB, 'client/public/models/airship-zone/boatvoxelinside.glb'),
    r2Key: 'models/airship-zone/boatvoxelinside.glb',
    kind: 'boat',
    group: 'airship-zone',
    tags: ['interior', 'cabin'],
    maxBytes: 8 * 1024 * 1024,
  },
  {
    id: 'airship.opener',
    packs: ['airship'],
    local: path.join(GB, 'client/public/models/airship-zone/opener-scene.glb'),
    r2Key: 'models/airship-zone/opener-scene.glb',
    kind: 'environment',
    group: 'airship-zone',
    tags: ['opener'],
    maxBytes: 8 * 1024 * 1024,
  },
  {
    id: 'airship.npc.racalvin',
    packs: ['airship', 'character'],
    local: path.join(GB, 'client/public/models/airship-zone/npcs/racalvinking.glb'),
    r2Key: 'models/airship-zone/npcs/racalvinking.glb',
    kind: 'character',
    group: 'airship-npcs',
    tags: ['npc', 'mixamo'],
    maxBytes: 25 * 1024 * 1024,
    notes: 'Pirate king mentor — run enforceCharacterSi 2.0 m in zone',
  },
  // Camera JSON (labels only — not GLB)
  {
    id: 'airship.camera',
    packs: ['airship'],
    local: path.join(GB, 'client/public/models/airship-zone/scene-camera.json'),
    r2Key: 'models/airship-zone/scene-camera.json',
    kind: 'other',
    group: 'airship-zone',
    tags: ['camera', 'json'],
    requireTexture: false,
    maxBytes: 2 * 1024 * 1024,
  },
];

// Deferred (need convert / LODs) — recorded in report only
const DEFERRED = [
  {
    r2Key: 'models/airship-zone/airship.glb',
    reason: '156MB — run glb2glb + meshopt/draco before CDN',
    local: path.join(GB, 'client/public/models/airship-zone/airship.glb'),
  },
  {
    r2Key: 'models/vfx/impacts/supernova_1987a.glb',
    reason: '128MB cinematic — not web combat-ready; bake LOD/clip',
    local: path.join(GB, 'client/public/models/vfx/impacts/supernova_1987a.glb'),
  },
  {
    r2Key: 'models/airship-zone/npcs/cptjohnwayne.fbx',
    reason: 'raw FBX — convert fbx2gltf → glb2glb first',
    local: path.join(GB, 'client/public/models/airship-zone/npcs/cptjohnwayne.fbx'),
  },
  {
    r2Key: 'models/airship-zone/npcs/scourgefaith.fbx',
    reason: 'raw FBX — convert fbx2gltf → glb2glb first',
    local: path.join(GB, 'client/public/models/airship-zone/npcs/scourgefaith.fbx'),
  },
  {
    r2Key: 'models/vfx/melee/stylized_ice_bow.glb',
    reason: '7.8MB — optional; glb2glb texture-size 1024 recommended',
    local: path.join(GB, 'client/public/models/vfx/melee/stylized_ice_bow.glb'),
  },
];

function loadOAuthToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const toml = path.join(os.homedir(), '.wrangler', 'config', 'default.toml');
  if (!fs.existsSync(toml)) throw new Error('No wrangler OAuth / CLOUDFLARE_API_TOKEN');
  const text = fs.readFileSync(toml, 'utf8');
  const m = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!m) throw new Error('oauth_token missing in wrangler config');
  return m[1];
}

function contentTypeFor(filePath) {
  const e = path.extname(filePath).toLowerCase();
  if (e === '.glb') return 'model/gltf-binary';
  if (e === '.gltf') return 'model/gltf+json';
  if (e === '.fbx') return 'application/octet-stream';
  if (e === '.json') return 'application/json';
  if (e === '.mp3') return 'audio/mpeg';
  if (e === '.ogg') return 'audio/ogg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function putR2(token, r2Key, filePath, contentType, retries = 3) {
  const body = fs.readFileSync(filePath);
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${r2Key}`;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'Content-Length': String(body.length),
        },
        body,
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      if (!res.ok || json.success === false) {
        throw new Error(`R2 put failed ${res.status}: ${text.slice(0, 400)}`);
      }
      return json.result || json;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
    }
  }
  throw lastErr;
}

async function headCdn(r2Key) {
  const res = await fetch(`${CDN}/${r2Key}`, { method: 'HEAD' });
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('etag'),
    ok: res.status === 200,
  };
}

function escSql(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function d1Insert(label) {
  const meta = JSON.stringify(d1MetadataJson(label));
  const id = label.r2Key.replace(/[^A-Za-z0-9_\-./]/g, '_');
  const now = Date.now();
  return (
    `INSERT INTO asset_registry (id, name, category, r2_key, bone_map, animation_packs, grudge_uuid, file_size, updated_at, created_at) VALUES (` +
    `${escSql(id)}, ${escSql(label.name)}, ${escSql(label.category)}, ${escSql(label.r2Key)}, ` +
    `NULL, ${escSql(meta)}, ${escSql(label.grudgeUuid)}, ${label.fileSize || 0}, ${now}, ${now}` +
    `) ON CONFLICT(id) DO UPDATE SET ` +
    `name=excluded.name, category=excluded.category, r2_key=excluded.r2_key, ` +
    `animation_packs=excluded.animation_packs, grudge_uuid=excluded.grudge_uuid, ` +
    `file_size=excluded.file_size, updated_at=excluded.updated_at;`
  );
}

function matchOnly(entry) {
  if (!ONLY) return true;
  return ONLY.some(
    (o) =>
      entry.packs.includes(o) ||
      entry.id.includes(o) ||
      entry.kind === o ||
      entry.group === o ||
      entry.r2Key.includes(o),
  );
}

async function main() {
  console.log(`═══ SHIP PRODUCTION → R2 (${DRY ? 'DRY-RUN' : 'LIVE'}) ═══`);
  console.log(`Account ${ACCOUNT} · bucket ${BUCKET}`);
  if (ONLY) console.log(`Filter --only=${ONLY.join(',')}`);

  const token = DRY ? null : loadOAuthToken();
  const results = [];
  const sqlLines = [
    '-- Auto-generated by ship-production-to-r2.mjs',
    `-- ${new Date().toISOString()}`,
    '-- Apply: wrangler d1 execute grudge-assets-db --remote --file=reports/production-seed.sql',
    '',
  ];

  for (const entry of MANIFEST) {
    if (!matchOnly(entry)) continue;

    const row = {
      id: entry.id,
      r2Key: entry.r2Key,
      local: entry.local,
      status: 'pending',
    };

    if (!fs.existsSync(entry.local)) {
      row.status = 'missing-local';
      console.log(`SKIP missing ${entry.id}`);
      results.push(row);
      continue;
    }

    const isGlb = entry.local.toLowerCase().endsWith('.glb');
    let inspect = null;
    let gate = { ready: true, issues: [], warnings: [], score: 50 };

    if (isGlb) {
      inspect = inspectGlb(entry.local);
      gate = productionGate(inspect, {
        kind: entry.kind,
        maxBytes: entry.maxBytes ?? MAX_WEB_BYTES,
        requireTexture: entry.requireTexture,
      });
    } else {
      const st = fs.statSync(entry.local);
      inspect = {
        ok: true,
        format: path.extname(entry.local).slice(1),
        bytes: st.size,
        magicOk: true,
        meshes: 0,
        materials: 0,
        textures: 0,
        images: 0,
        animations: 0,
        textureStatus: 'n/a',
        errors: [],
      };
      if (st.size > (entry.maxBytes ?? MAX_WEB_BYTES)) {
        gate = { ready: false, issues: [`oversize_${st.size}`], warnings: [], score: 20 };
      }
    }

    const label = buildProductionLabel({
      r2Key: entry.r2Key,
      name: path.basename(entry.r2Key).replace(/\.[^.]+$/, ''),
      kind: entry.kind,
      subtype: entry.subtype,
      group: entry.group,
      tags: entry.tags,
      notes: entry.notes,
      sourceLocal: path.relative(ROOT, entry.local).replace(/\\/g, '/'),
      inspect,
      gate,
      productionBaked: true,
      bakePipeline: isGlb ? 'staged-glb-inspect' : 'json-meta',
      deployReady: gate.ready,
    });

    row.label = label;
    row.inspect = inspect
      ? {
          meshes: inspect.meshes,
          materials: inspect.materials,
          textures: inspect.textures ?? inspect.images,
          textureStatus: inspect.textureStatus,
          bytes: inspect.bytes,
          score: gate.score,
        }
      : null;
    row.gate = gate;

    if (!gate.ready && !FORCE) {
      row.status = 'blocked-gate';
      console.log(`BLOCK ${entry.id}: ${gate.issues.join(', ')}`);
      results.push(row);
      continue;
    }

    if (DRY) {
      row.status = 'dry-run';
      console.log(
        `DRY ${entry.r2Key} · meshes=${inspect?.meshes ?? '-'} tex=${inspect?.textureStatus} score=${gate.score}`,
      );
      sqlLines.push(d1Insert(label));
      results.push(row);
      continue;
    }

    try {
      const ct = contentTypeFor(entry.local);
      const put = await putR2(token, entry.r2Key, entry.local, ct);
      const head = await headCdn(entry.r2Key);
      row.status = head.ok ? 'shipped' : 'shipped-cdn-pending';
      row.put = put;
      row.cdn = head;
      console.log(
        `OK  ${entry.r2Key} · ${inspect?.bytes || 0} B · ${inspect?.textureStatus || ct} · CDN ${head.status} · ${label.grudgeUuid.slice(0, 8)}…`,
      );
      sqlLines.push(d1Insert(label));
    } catch (e) {
      row.status = 'error';
      row.error = String(e.message || e);
      console.error(`ERR ${entry.id}: ${row.error}`);
    }
    results.push(row);
  }

  const outDir = path.join(ROOT, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    version: 1,
    schema: 'grudge.production-ship-report/v1',
    generatedAt: new Date().toISOString(),
    dryRun: DRY,
    bucket: BUCKET,
    cdn: CDN,
    summary: {
      total: results.length,
      shipped: results.filter((r) => r.status.startsWith('shipped')).length,
      dry: results.filter((r) => r.status === 'dry-run').length,
      blocked: results.filter((r) => r.status === 'blocked-gate').length,
      missing: results.filter((r) => r.status === 'missing-local').length,
      errors: results.filter((r) => r.status === 'error').length,
    },
    deferred: DEFERRED.map((d) => ({
      ...d,
      exists: fs.existsSync(d.local),
      bytes: fs.existsSync(d.local) ? fs.statSync(d.local).size : 0,
    })),
    results,
    productionRules: [
      'GLB v2 with meshes',
      'Textures embedded or vertex-color (or documented VFX unlit)',
      'Web size ≤ 20MB unless forced',
      'kind + subtype + grudgeUuid labels',
      'R2 key = CDN path under assets.grudge-studio.com',
      'D1 asset_registry animation_packs holds production metadata',
      'Never ship raw FBX as game primary; never ship 100MB+ cinematic without LOD',
    ],
  };

  const reportPath = path.join(outDir, 'production-ship-latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const sqlPath = path.join(outDir, 'production-seed.sql');
  fs.writeFileSync(sqlPath, sqlLines.join('\n') + '\n');

  // Browser-facing catalog subset
  const catalog = {
    version: 1,
    updated: new Date().toISOString().slice(0, 10),
    cdn: CDN,
    rule: 'Only production-labeled, gate-passed assets. Prefer GLB + texture + SI kind labels.',
    assets: results
      .filter((r) => r.label && (r.status.startsWith('shipped') || r.status === 'dry-run'))
      .map((r) => r.label),
    deferred: report.deferred,
  };
  const catalogPath = path.join(ROOT, 'web/api/production-catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

  console.log('');
  console.log('Summary:', report.summary);
  console.log('Report:', reportPath);
  console.log('D1 SQL:', sqlPath);
  console.log('Catalog:', catalogPath);
  console.log('Deferred oversize/raw:', DEFERRED.length);

  if (report.summary.errors) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
