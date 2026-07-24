/**
 * Production deployment bake policy — what the pipeline should prefer.
 *
 * HARD RULE for fleet / gameplay / this browser:
 *   Fully colored + textured · meshed · SI-scaled · converted · **glb2glb** · CDN R2
 *
 * Raw FBX / untextured dumps are author inputs only — never default deploy inventory.
 *
 * @see grudge-asset-convert skill (grudge-convert CLI)
 * @see docs/BEST-PRACTICES.md · docs/PRODUCTION_BAKE.md
 */

export const HUMAN_HEIGHT_M = 1.8;
export const PROD_TEXTURE_MAX_PX = 1024;
export const CDN_ROOT = 'https://assets.grudge-studio.com';
/** Minimum score for "Deploy bake → ready" when metadata is sparse */
export const PROD_READY_SCORE = 60;

/** Named bake stages (align with ObjectStore grudge-convert). */
export const BAKE_STAGES = {
  convert: 'fbx2gltf / obj2glb — source → raw GLB',
  glb2glb: 'glb2glb — scale, mesh, texture, quantize, colliders, manifest',
  anim_bake: 'Bip001 rotation clips → anims/baked/**/*.json',
  deploy: 'R2 put + D1/registry + smoke',
};

function pathOf(m) {
  return String(m?.path || m?.cdnUrl || m?.r2Key || '').toLowerCase();
}

function fmtOf(m) {
  return String(m?.format || '').toLowerCase().replace(/^\./, '');
}

function isCdnSsot(m) {
  const cdn = String(m?.cdnUrl || '');
  const path = pathOf(m);
  if (cdn.includes('assets.grudge-studio.com')) return true;
  if (path.startsWith('models/') || path.startsWith('ui/') || path.includes('/models/')) return true;
  if (cdn.includes('grudge-arena') && /cdn\/assets\/characters/i.test(cdn)) return false;
  return false;
}

/** True when catalog metadata claims usable albedo / atlas / vcol (not bare grey mesh). */
export function hasProductionSurface(m) {
  if (!m) return false;
  if (m.isBakedClip) return true; // clips are not mesh-shaded
  if (m.textureStatus === 'atlas' || m.textureStatus === 'embedded') return true;
  if (m.textureStatus === 'vertex-color') return true;
  if ((m.textures || 0) > 0) return true;
  // Explicit glb2glb bake implies textures were processed (may be atlas-bound)
  if (m.productionBaked === true || m.bakePipeline === 'glb2glb') return true;
  // Weapons/icons often ship as single-atlas multipacks without textures count
  if (m.kind === 'weapon' && fmtOf(m) === 'glb' && isCdnSsot(m)) return true;
  return false;
}

/**
 * Production readiness score (0–100). Higher = better for fleet deploy.
 */
export function productionScore(m) {
  if (!m) return 0;
  let score = 0;
  const fmt = fmtOf(m);
  const path = pathOf(m);
  const cdn = String(m.cdnUrl || '');

  // Format preference: baked anim JSON + production GLB first
  if (m.isBakedClip || (fmt === 'json' && /anims\/baked/.test(path))) score += 40;
  else if (fmt === 'glb') score += 34;
  else if (fmt === 'gltf') score += 12;
  else if (fmt === 'fbx') score += 4; // author source only
  else if (fmt === 'obj' || fmt === 'dae') score += 1;

  // Surface (color / texture) — required for mesh gameplay
  if (m.textureStatus === 'atlas' || m.textureStatus === 'embedded') score += 22;
  else if ((m.textures || 0) > 0) score += 16;
  else if (m.textureStatus === 'vertex-color') score += 12;
  else if (m.isBakedClip) score += 10;
  else if (m.productionBaked || m.bakePipeline === 'glb2glb') score += 10;
  else score -= 18; // bare mesh / missing maps

  // Meshed
  if ((m.meshes || 0) > 0) score += 8;
  if (m.kind === 'character' || /_characters\.(glb|fbx)/i.test(path)) score += 6;

  // SI / glb2glb bake
  if (m.scaleBaked || m.productionBaked || m.bakePipeline === 'glb2glb') score += 18;
  if (m.scaleProfile === 'character' || m.scaleProfile === 'animation_clip') score += 6;

  // Web deploy packaging
  if (m.compressionType === 'draco' || m.compressionType === 'meshopt') score += 10;
  else if (fmt === 'glb') score += 6;

  // CDN SSOT (R2)
  if (isCdnSsot(m)) score += 14;
  if (cdn.includes('grudge-arena') && /cdn\/assets\/characters/i.test(cdn)) score -= 60;

  // Explicit production flags
  if (m.productionBaked === true || m.deployReady === true) score += 12;
  if (m.source === 'grudge6-ssot' || m.source === 'baked-bip001') score += 8;

  // Bip001 / grudge6 skeleton contract
  if (
    m.boneMap === 'bip001' ||
    (m.supportedSkeletons || []).some((s) => /bip001|rts_toon/i.test(s))
  ) {
    score += 8;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Strict gameplay / pipeline inventory gate:
 * - GLB on R2 with production surface (texture/atlas/vcol) OR baked clip JSON
 * - Never FBX / bare untextured dumps as "ready"
 */
export function isProductionDeployReady(m) {
  if (!m) return false;

  // Baked anim clips (rotation-only Bip001) are deploy-ready for play-on-character
  const path = pathOf(m);
  const fmt = fmtOf(m);
  if (m.isBakedClip || (fmt === 'json' && /anims\/baked/.test(path))) {
    return true;
  }

  // Mesh deploy: GLB only
  if (fmt !== 'glb') return false;

  // Must be fleet CDN SSOT
  if (!isCdnSsot(m)) return false;

  // Must have color/texture surface (or explicit glb2glb production bake)
  if (!hasProductionSurface(m)) return false;

  // Explicit flags
  if (m.productionBaked === true || m.deployReady === true || m.bakePipeline === 'glb2glb') {
    return true;
  }

  // Score floor for catalog rows with good metadata
  if (productionScore(m) >= PROD_READY_SCORE) return true;

  return false;
}

/**
 * Alias — "only fully colored, textured, glb2glb production GLB for baked gameplay"
 */
export function isGameplayProductionGlb(m) {
  if (!m) return false;
  if (m.isBakedClip) return true;
  if (fmtOf(m) !== 'glb') return false;
  if (!isCdnSsot(m)) return false;
  if (!hasProductionSurface(m)) return false;
  // Prefer explicit bake; still allow high-score textured GLBs on R2
  return (
    m.productionBaked === true ||
    m.bakePipeline === 'glb2glb' ||
    m.deployReady === true ||
    productionScore(m) >= 70
  );
}

/**
 * Infer grudge6 / modular equipment slot from mesh name.
 * Used for multipack isolation + equip wiring.
 */
export function inferEquipSlot(meshName) {
  const n = String(meshName || '');
  if (!n || n === '(unnamed)') return 'unknown';
  const s = n.toLowerCase();
  if (/bip001|skeleton|armature|root|hips|pelvis|spine|neck|head\b|clavicle|upperarm|forearm|hand|thigh|calf|foot|toe/i.test(n) && !/mesh|geo|armor|helm/i.test(n)) {
    return 'skeleton';
  }
  if (/head|helm|helmet|hood|hat|mask|face|hair|beard|ear/i.test(s)) return 'head';
  if (/body|torso|chest|armor|cuirass|robe|shirt|jacket|cape|cloak|back/i.test(s)) return 'body';
  if (/arm|glove|gauntlet|bracer|shoulder|pauldron|sleeve/i.test(s)) return 'arms';
  if (/leg|boot|shoe|pant|greave|skirt|lower/i.test(s)) return 'legs';
  if (/sword|axe|mace|bow|staff|wand|spear|dagger|gun|rifle|pick|shovel|scyth|hammer|weapon|blade/i.test(s))
    return 'weapon';
  if (/shield|buckler/i.test(s)) return 'shield';
  if (/quiver|pouch|bag|belt|ring|amulet|accessory|lantern|torch/i.test(s)) return 'accessory';
  if (/horse|mount|saddle/i.test(s)) return 'mount';
  if (/building|wall|floor|roof|prop|crate|barrel|rock|tree|trunk|bush|stone/i.test(s)) return 'prop';
  return 'mesh';
}

/**
 * Human-readable bake status for cards / viewer.
 */
export function productionBadge(m) {
  if (!m) return { label: '—', cls: 'prod-unknown', score: 0 };
  const score = productionScore(m);
  if (m.isBakedClip || (fmtOf(m) === 'json' && m.bakedRel)) {
    return { label: 'BAKED CLIP', cls: 'prod-baked', score };
  }
  if (m.productionBaked || m.bakePipeline === 'glb2glb' || (score >= 70 && hasProductionSurface(m))) {
    return { label: 'PROD GLB', cls: 'prod-ready', score };
  }
  if (fmtOf(m) === 'glb' && hasProductionSurface(m) && score >= 45) {
    return { label: 'GLB TEX', cls: 'prod-glb', score };
  }
  if (fmtOf(m) === 'glb' && !hasProductionSurface(m)) {
    return { label: 'GLB BARE', cls: 'prod-raw', score };
  }
  if (fmtOf(m) === 'fbx') {
    return { label: 'SOURCE FBX', cls: 'prod-source', score };
  }
  if (score >= 40) return { label: 'OK', cls: 'prod-ok', score };
  return { label: 'RAW', cls: 'prod-raw', score };
}

/**
 * Ordered candidate URLs for a race kit: production GLB first, then FBX author.
 */
export function raceKitDeployUrls(kit, isForbidden = () => false) {
  const ordered = [kit?.glb, kit?.r2, kit?.fbx].filter(Boolean);
  const uniq = [];
  for (const u of ordered) {
    if (isForbidden(u)) continue;
    if (!uniq.includes(u)) uniq.push(u);
  }
  return uniq.sort((a, b) => {
    const ag = /\.glb($|\?)/i.test(a) ? 0 : 1;
    const bg = /\.glb($|\?)/i.test(b) ? 0 : 1;
    return ag - bg;
  });
}

/**
 * Snippet comment for production load path.
 */
export function productionLoadComment(m) {
  const badge = productionBadge(m);
  return [
    `// productionScore=${badge.score} (${badge.label})`,
    '// HARD: fully textured + colored production GLB after glb2glb — not raw FBX',
    '// Convert: npm run convert -- fbx2gltf … then glb2glb … --height 1.8 --texture-size 1024',
    '// Deploy: R2 assets.grudge-studio.com + registry smoke',
    '// Anims: anims/baked/**/*.json on grudge6 host — not Mixamo mannequin',
    '// Equip multipack: isolate meshName + equip slot (body/arms/legs/head/weapon)',
  ].join('\n');
}
