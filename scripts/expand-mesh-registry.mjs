#!/usr/bin/env node
/**
 * Expand codex (or any dist tree) into per-MESH registry rows.
 *
 * Problem: catalog has one UUID per GLB file. Multipacks, damage levels,
 * material variants (stone/snow/broken), and equip parts must each be
 * individually addressable in D1 with their own grudgeUuid + texture status.
 *
 * UUID rules:
 *   pack/file:  sha1("grudge-asset:" + r2Key)
 *   mesh part:  sha1("grudge-asset:" + r2Key + "#mesh:" + meshName)
 *
 * Usage:
 *   node scripts/expand-mesh-registry.mjs \
 *     --dist D:/Games/Models/_codex_prod/dist \
 *     --catalog D:/Games/Models/_codex_prod/catalog.json \
 *     --out D:/Games/Models/_codex_prod/mesh-registry.json \
 *     --seed D:/Games/Models/_codex_prod/seed-d1-meshes.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { grudgeUuidFromR2Key, normalizeR2Key } from './lib/grudgeUuid.mjs';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve gltf-transform from ObjectStore if not local
function loadGltfTransform() {
  const candidates = [
    path.resolve(__dirname, '../node_modules'),
    path.resolve('F:/GitHub/ObjectStore/node_modules'),
    path.resolve('F:/GitHub/grudge-pipeline/node_modules'),
  ];
  for (const base of candidates) {
    try {
      const core = require(path.join(base, '@gltf-transform/core'));
      const ext = require(path.join(base, '@gltf-transform/extensions'));
      return { NodeIO: core.NodeIO, ALL_EXTENSIONS: ext.ALL_EXTENSIONS };
    } catch {
      /* next */
    }
  }
  throw new Error('Install @gltf-transform/core in ObjectStore or grudge-pipeline');
}

function meshUuid(r2Key, meshName) {
  const key = `${normalizeR2Key(r2Key)}#mesh:${meshName}`;
  return grudgeUuidFromR2Key(key);
}

/** Detect variant family + damage/tier tags from path/id */
export function parseVariantMeta(idOrPath) {
  const s = String(idOrPath || '').toLowerCase().replace(/\\/g, '/');
  const base = path.basename(s, path.extname(s));
  const tags = [];
  let damageLevel = 'pristine';
  let materialVariant = null;
  let tier = null;

  // Tier (weapons)
  for (const t of ['copper', 'silver', 'gold', 'diamond', 'iron', 'wood', 'stone']) {
    if (base.includes(t) || s.includes(`/${t}_`) || s.includes(`_${t}`)) {
      tier = t;
      tags.push(`tier:${t}`);
      break;
    }
  }

  // Material / biome variants
  if (/snow|snowed|snowy/.test(base)) {
    materialVariant = 'snow';
    tags.push('variant:snow');
  } else if (/stone|runestone/.test(base) && !/greystone|cobble/.test(base)) {
    materialVariant = 'stone';
    tags.push('variant:stone');
  } else if (/ice|darkice/.test(base)) {
    materialVariant = 'ice';
    tags.push('variant:ice');
  } else if (/warm/.test(base)) {
    materialVariant = 'warm';
    tags.push('variant:warm');
  } else if (/cold/.test(base)) {
    materialVariant = 'cold';
    tags.push('variant:cold');
  }

  // Damage / fill levels
  if (/broken|crack|damage|shatter/.test(base)) {
    damageLevel = 'broken';
    tags.push('damage:broken');
  } else if (/empty/.test(base)) {
    damageLevel = 'empty';
    tags.push('fill:empty');
  } else if (/halffilled|half_filled|half-filled/.test(base)) {
    damageLevel = 'half';
    tags.push('fill:half');
  } else if (/fullfilled|full_filled|full-filled|full/.test(base) && /roof|fill/.test(base)) {
    damageLevel = 'full';
    tags.push('fill:full');
  } else if (/dead/.test(base)) {
    damageLevel = 'dead';
    tags.push('state:dead');
  } else if (/alive/.test(base)) {
    damageLevel = 'alive';
    tags.push('state:alive');
  }

  // Family key: strip variant suffixes for grouping
  let family = base
    .replace(/(snowed|snowy|snow|stone|darkice|ice|warm|cold|broken|empty|halffilled|fullfilled|dead|alive)/gi, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/(copper|silver|gold|diamond)_/i, '');
  if (!family) family = base;

  // Path family: pack/category/family
  const parts = s.split('/').filter(Boolean);
  const pack = parts[0] || 'unknown';
  const category = parts[1] || 'misc';
  const familyId = `${pack}/${category}/${family}`;

  return {
    familyId,
    family,
    pack,
    category,
    damageLevel,
    materialVariant,
    tier,
    tags,
  };
}

function walkGlbs(root) {
  const out = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.glb')) out.push(p);
    }
  }
  walk(root);
  return out;
}

function relToR2Key(distRoot, filePath) {
  const rel = path.relative(distRoot, filePath).replace(/\\/g, '/');
  // pack/cat/id/id.glb → models/codex/pack/cat/id.glb
  const parts = rel.split('/');
  if (parts.length >= 3) {
    const pack = parts[0];
    const cat = parts[1];
    const id = parts[parts.length - 2];
    return `models/codex/${pack}/${cat}/${id}.glb`;
  }
  return `models/codex/${rel}`;
}

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function inspectGlb(io, filePath) {
  const doc = await io.read(filePath);
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  const nodes = root.listNodes().filter((n) => n.getMesh());

  let matsWithMap = 0;
  const matInfo = materials.map((m, i) => {
    const hasMap = !!m.getBaseColorTexture();
    if (hasMap) matsWithMap++;
    const c = m.getBaseColorFactor ? m.getBaseColorFactor() : [1, 1, 1, 1];
    return {
      name: m.getName() || `mat_${i}`,
      hasBaseColorMap: hasMap,
      baseColor: c,
    };
  });

  const meshList = meshes.map((m, i) => {
    const name = m.getName() || `mesh_${i}`;
    const prims = m.listPrimitives();
    // materials used by this mesh
    const matNames = [];
    for (const p of prims) {
      const mat = p.getMaterial();
      if (mat) matNames.push(mat.getName() || 'mat');
    }
    const uniqueMats = [...new Set(matNames)];
    const hasMap = uniqueMats.some((mn) => {
      const mi = matInfo.find((x) => x.name === mn);
      return mi && mi.hasBaseColorMap;
    });
    // vertex-color style: no maps but multiple solid colors
    const textureStatus = hasMap
      ? 'map'
      : matsWithMap === 0 && materials.length > 0
        ? 'vertex-color'
        : matsWithMap === 0
          ? 'bare'
          : 'partial';
    return {
      meshName: name,
      primitiveCount: prims.length,
      materials: uniqueMats,
      textureStatus,
    };
  });

  // node bindings (mesh instance names)
  const instances = nodes.map((n) => ({
    nodeName: n.getName() || '',
    meshName: n.getMesh()?.getName() || '',
  }));

  return {
    meshCount: meshes.length,
    materialCount: materials.length,
    textureCount: textures.length,
    matsWithMap,
    textureStatus:
      textures.length > 0 || matsWithMap > 0
        ? 'map'
        : materials.length > 0
          ? 'vertex-color'
          : 'bare',
    meshes: meshList,
    materials: matInfo,
    instances,
  };
}

async function main() {
  const dist = arg('--dist', 'D:/Games/Models/_codex_prod/dist');
  const catalogPath = arg('--catalog', 'D:/Games/Models/_codex_prod/catalog.json');
  const outPath = arg('--out', 'D:/Games/Models/_codex_prod/mesh-registry.json');
  const seedPath = arg('--seed', 'D:/Games/Models/_codex_prod/seed-d1-meshes.sql');
  const reportPath = arg('--report', path.join(__dirname, '../reports/mesh-registry-report.json'));

  const { NodeIO, ALL_EXTENSIONS } = loadGltfTransform();
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  let catalog = { meshes: [] };
  if (fs.existsSync(catalogPath)) {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  }
  const catalogByR2 = new Map();
  for (const m of catalog.meshes || []) {
    const k = normalizeR2Key(m.r2Key || `models/codex/${m.id}.glb`);
    catalogByR2.set(k, m);
  }

  const files = walkGlbs(dist);
  console.log(`[expand-mesh] scanning ${files.length} GLBs in ${dist}`);

  const packEntries = [];
  const meshEntries = [];
  const families = new Map();
  let multipackFiles = 0;
  let bareFiles = 0;
  let vcolFiles = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const filePath = files[fi];
    const r2Key = relToR2Key(dist, filePath);
    const cat = catalogByR2.get(r2Key) || {};
    const id = cat.id || r2Key.replace(/^models\/codex\//, '').replace(/\.glb$/i, '');
    const st = fs.statSync(filePath);

    let inspect;
    try {
      inspect = await inspectGlb(io, filePath);
    } catch (e) {
      console.warn('  FAIL inspect', r2Key, e.message);
      inspect = {
        meshCount: 0,
        materialCount: 0,
        textureCount: 0,
        matsWithMap: 0,
        textureStatus: 'error',
        meshes: [],
        materials: [],
        instances: [],
      };
    }

    if (inspect.meshCount > 1) multipackFiles++;
    if (inspect.textureStatus === 'bare') bareFiles++;
    if (inspect.textureStatus === 'vertex-color') vcolFiles++;

    const variant = parseVariantMeta(id);
    const packUuid = cat.grudgeUuid || grudgeUuidFromR2Key(r2Key);

    const packEntry = {
      type: 'pack',
      id,
      name: cat.name || path.basename(id),
      pack: cat.pack || variant.pack,
      category: cat.category || variant.category,
      kind: cat.kind || 'prop',
      grudgeUuid: packUuid,
      r2Key,
      cdnUrl: cat.cdnUrl || `https://assets.grudge-studio.com/${r2Key}`,
      bytes: st.size,
      meshCount: inspect.meshCount,
      materialCount: inspect.materialCount,
      textureCount: inspect.textureCount,
      textureStatus: inspect.textureStatus,
      productionReady:
        inspect.textureStatus === 'map' || inspect.textureStatus === 'vertex-color',
      multipack: inspect.meshCount > 1,
      variantFamily: variant.familyId,
      damageLevel: variant.damageLevel,
      materialVariant: variant.materialVariant,
      tier: variant.tier,
      tags: [
        ...(cat.tags || []),
        ...variant.tags,
        inspect.meshCount > 1 ? 'multipack' : 'single-mesh',
        `tex:${inspect.textureStatus}`,
      ].filter(Boolean),
      meshes: inspect.meshes.map((m) => m.meshName),
    };
    packEntries.push(packEntry);

    // Family index
    if (!families.has(variant.familyId)) families.set(variant.familyId, []);
    families.get(variant.familyId).push({
      id,
      r2Key,
      grudgeUuid: packUuid,
      damageLevel: variant.damageLevel,
      materialVariant: variant.materialVariant,
      tier: variant.tier,
    });

    // Per-mesh rows (always at least one — individual D1 offer)
    for (const m of inspect.meshes) {
      const meshName = m.meshName;
      const gu = meshUuid(r2Key, meshName);
      const logicalKey = `${r2Key}#mesh:${meshName}`;
      meshEntries.push({
        type: 'mesh',
        id: `${id}::${meshName}`,
        meshName,
        parentId: id,
        parentR2Key: r2Key,
        // D1 unique logical key (parent file is real R2 object)
        r2Key: logicalKey,
        grudgeUuid: gu,
        name: meshName,
        pack: packEntry.pack,
        category: packEntry.category,
        kind: packEntry.multipack ? 'mesh_part' : packEntry.kind,
        equipSlot: inferSlot(meshName, packEntry.kind),
        textureStatus: m.textureStatus,
        materials: m.materials,
        primitiveCount: m.primitiveCount,
        cdnUrl: packEntry.cdnUrl,
        productionReady: m.textureStatus === 'map' || m.textureStatus === 'vertex-color',
        variantFamily: variant.familyId,
        damageLevel: variant.damageLevel,
        materialVariant: variant.materialVariant,
        tier: variant.tier,
        tags: [
          'mesh-unit',
          `tex:${m.textureStatus}`,
          ...variant.tags,
          packEntry.multipack ? 'from-multipack' : 'solo-file',
        ],
        bytes: null,
      });
    }

    if ((fi + 1) % 25 === 0) console.log(`  … ${fi + 1}/${files.length}`);
  }

  // Attach family members to each pack
  for (const p of packEntries) {
    p.familyMembers = (families.get(p.variantFamily) || []).map((x) => ({
      id: x.id,
      grudgeUuid: x.grudgeUuid,
      damageLevel: x.damageLevel,
      materialVariant: x.materialVariant,
      tier: x.tier,
    }));
  }

  const registry = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    policy:
      'Each mesh is a first-class unit with grudgeUuid = hash(parentR2#mesh:name). Packs are parents; variants grouped by familyId.',
    summary: {
      packFiles: packEntries.length,
      meshUnits: meshEntries.length,
      multipackFiles,
      bareFiles,
      vertexColorFiles: vcolFiles,
      families: families.size,
      productionMeshUnits: meshEntries.filter((m) => m.productionReady).length,
      notProductionMeshUnits: meshEntries.filter((m) => !m.productionReady).length,
    },
    packs: packEntries,
    meshes: meshEntries,
    families: Object.fromEntries(
      [...families.entries()].map(([k, v]) => [k, v]),
    ),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`[expand-mesh] wrote ${outPath}`);
  console.log('[expand-mesh] summary', registry.summary);

  // Enrich original catalog packs with mesh + family metadata
  if (catalog.meshes) {
    for (const m of catalog.meshes) {
      const r2 = normalizeR2Key(m.r2Key || `models/codex/${m.id}.glb`);
      const pe = packEntries.find((p) => p.r2Key === r2);
      if (!pe) continue;
      m.grudgeUuid = pe.grudgeUuid;
      m.meshCount = pe.meshCount;
      m.textureStatus = pe.textureStatus;
      m.productionReady = pe.productionReady;
      m.multipack = pe.multipack;
      m.variantFamily = pe.variantFamily;
      m.damageLevel = pe.damageLevel;
      m.materialVariant = pe.materialVariant;
      m.tier = pe.tier;
      m.meshNames = pe.meshes;
      m.meshUnits = meshEntries
        .filter((u) => u.parentR2Key === r2)
        .map((u) => ({
          meshName: u.meshName,
          grudgeUuid: u.grudgeUuid,
          equipSlot: u.equipSlot,
          textureStatus: u.textureStatus,
          r2Key: u.r2Key,
        }));
    }
    catalog.meshRegistryVersion = registry.version;
    catalog.meshUnitCount = meshEntries.length;
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    console.log(`[expand-mesh] enriched catalog ${catalogPath}`);
  }

  // D1 seed: pack rows + mesh unit rows
  // Pack uses real r2_key; mesh uses logical r2_key (unique) + metadata in animation_packs JSON
  // NOTE: no BEGIN/COMMIT — wrangler d1 execute --remote rejects SQL transactions
  const lines = [
    '-- Per-mesh + pack asset_registry seed (logical mesh keys use #mesh:)',
    '-- Parent binary remains parentR2Key inside animation_packs JSON',
    '-- Do not wrap in BEGIN/COMMIT (D1 remote execute rejects transactions)',
  ];

  for (const p of packEntries) {
    const meta = JSON.stringify({
      type: 'pack',
      meshCount: p.meshCount,
      textureStatus: p.textureStatus,
      multipack: p.multipack,
      variantFamily: p.variantFamily,
      damageLevel: p.damageLevel,
      materialVariant: p.materialVariant,
      tier: p.tier,
      meshNames: p.meshes,
      productionReady: p.productionReady,
      familyMembers: p.familyMembers,
    }).replace(/'/g, "''");
    const tags = p.tags.join(',').replace(/'/g, "''");
    const name = String(p.name).replace(/'/g, "''");
    const cat = String(p.category || 'mesh').replace(/'/g, "''");
    lines.push(
      `INSERT OR REPLACE INTO asset_registry (id, name, category, r2_key, grudge_uuid, file_size, animation_packs, updated_at) VALUES ('${p.r2Key.replace(/[^a-zA-Z0-9._/-]+/g, '_')}','${name}','${cat}','${p.r2Key.replace(/'/g, "''")}','${p.grudgeUuid}',${p.bytes || 0},'${meta}',unixepoch()*1000);`,
    );
  }

  for (const m of meshEntries) {
    const meta = JSON.stringify({
      type: 'mesh',
      parentR2Key: m.parentR2Key,
      meshName: m.meshName,
      equipSlot: m.equipSlot,
      textureStatus: m.textureStatus,
      materials: m.materials,
      variantFamily: m.variantFamily,
      damageLevel: m.damageLevel,
      materialVariant: m.materialVariant,
      tier: m.tier,
      productionReady: m.productionReady,
      cdnUrl: m.cdnUrl,
    }).replace(/'/g, "''");
    const tags = m.tags.join(',').replace(/'/g, "''");
    const name = String(m.meshName).replace(/'/g, "''");
    const id = m.r2Key.replace(/[^a-zA-Z0-9._#/-]+/g, '_');
    lines.push(
      `INSERT OR REPLACE INTO asset_registry (id, name, category, r2_key, grudge_uuid, file_size, animation_packs, updated_at) VALUES ('${id}','${name}','mesh_unit','${m.r2Key.replace(/'/g, "''")}','${m.grudgeUuid}',NULL,'${meta}',unixepoch()*1000);`,
    );
  }
  fs.writeFileSync(seedPath, lines.join('\n') + '\n', 'utf8');
  console.log(`[expand-mesh] D1 seed → ${seedPath} (${packEntries.length} packs + ${meshEntries.length} mesh units)`);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        summary: registry.summary,
        barePacks: packEntries.filter((p) => p.textureStatus === 'bare').map((p) => p.r2Key),
        multipacks: packEntries.filter((p) => p.multipack).map((p) => ({ r2Key: p.r2Key, meshes: p.meshes })),
        largestFamilies: [...families.entries()]
          .map(([k, v]) => ({ family: k, count: v.length, members: v.map((x) => x.id) }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 30),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`[expand-mesh] report → ${reportPath}`);
}

function inferSlot(meshName, kind) {
  const s = String(meshName || '').toLowerCase();
  if (/head|helm|hood|hat|mask|hair|face|ear/.test(s)) return 'head';
  if (/body|torso|chest|armor|cuirass|robe|shirt|cape|cloak/.test(s)) return 'body';
  if (/arm|glove|gauntlet|bracer|shoulder|sleeve/.test(s)) return 'arms';
  if (/leg|boot|pant|greave|skirt/.test(s)) return 'legs';
  if (/sword|axe|mace|bow|staff|gun|pick|shovel|scyth|weapon|blade|hammer/.test(s)) return 'weapon';
  if (/shield/.test(s)) return 'shield';
  if (/barrel|water|liquid/.test(s)) return 'prop_part';
  if (kind === 'weapon') return 'weapon';
  return 'mesh';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
