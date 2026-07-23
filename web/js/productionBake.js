/**
 * Production deployment bake policy — what the pipeline should prefer.
 *
 * Target asset shape for fleet deploy:
 *   textured · meshed · SI-scaled · converted · glb2glb · CDN (R2)
 *
 * Author sources (FBX/OBJ) are inputs only. Runtime hosts prefer production GLB.
 * Animations prefer baked Bip001 JSON (rotation-only) on grudge6 hosts.
 *
 * @see grudge-asset-convert skill (grudge-convert CLI)
 * @see docs/BEST-PRACTICES.md · docs/PRODUCTION_BAKE.md
 */

export const HUMAN_HEIGHT_M = 1.8;
export const PROD_TEXTURE_MAX_PX = 1024;
export const CDN_ROOT = 'https://assets.grudge-studio.com';

/** Named bake stages (align with ObjectStore grudge-convert). */
export const BAKE_STAGES = {
  convert: 'fbx2gltf / obj2glb — source → raw GLB',
  glb2glb: 'glb2glb — scale, mesh, texture, quantize, colliders, manifest',
  anim_bake: 'Bip001 rotation clips → anims/baked/**/*.json',
  deploy: 'R2 put + D1/registry + smoke',
};

/**
 * Production readiness score (0–100). Higher = better for fleet deploy.
 * Used for catalog sort, badges, and "production-ready" filter.
 *
 * @param {object} m catalog entry
 */
export function productionScore(m) {
  if (!m) return 0;
  let score = 0;
  const fmt = String(m.format || '').toLowerCase();
  const path = String(m.path || m.cdnUrl || m.r2Key || '').toLowerCase();
  const cdn = String(m.cdnUrl || '');

  // Format preference: baked anim JSON + production GLB first
  if (m.isBakedClip || (fmt === 'json' && /anims\/baked/.test(path))) score += 40;
  else if (fmt === 'glb') score += 32;
  else if (fmt === 'gltf') score += 18;
  else if (fmt === 'fbx') score += 6; // author source only
  else if (fmt === 'obj' || fmt === 'dae') score += 2;

  // Textured
  if (m.textureStatus === 'atlas' || m.textureStatus === 'embedded') score += 18;
  else if ((m.textures || 0) > 0) score += 14;
  else if (m.isBakedClip) score += 10; // clips don't need mesh maps
  else score -= 8;

  // Meshed
  if ((m.meshes || 0) > 0) score += 8;
  if (m.kind === 'character' || /_characters\.(glb|fbx)/i.test(path)) score += 6;

  // SI / scale profile declared or baked
  if (m.scaleBaked || m.productionBaked || m.bakePipeline === 'glb2glb') score += 16;
  if (m.scaleProfile === 'character' || m.scaleProfile === 'animation_clip') score += 6;

  // Web deploy packaging
  if (m.compressionType === 'draco' || m.compressionType === 'meshopt') score += 10;
  else if (fmt === 'glb') score += 6;

  // CDN SSOT (R2)
  if (cdn.includes('assets.grudge-studio.com') || path.startsWith('models/')) score += 14;
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
 * True when asset is preferred for fleet deployment (not raw author dump).
 */
export function isProductionDeployReady(m) {
  if (!m) return false;
  const score = productionScore(m);
  if (score >= 55) return true;
  if (m.productionBaked || m.deployReady || m.bakePipeline === 'glb2glb') return true;
  if (m.isBakedClip && m.format === 'json') return true;
  const fmt = String(m.format || '').toLowerCase();
  if (fmt === 'glb' && (m.textures > 0 || m.textureStatus === 'atlas' || m.kind === 'weapon')) {
    return true;
  }
  return false;
}

/**
 * Human-readable bake status for cards / viewer.
 */
export function productionBadge(m) {
  if (!m) return { label: '—', cls: 'prod-unknown', score: 0 };
  const score = productionScore(m);
  if (m.isBakedClip || (m.format === 'json' && m.bakedRel)) {
    return { label: 'BAKED CLIP', cls: 'prod-baked', score };
  }
  if (m.productionBaked || m.bakePipeline === 'glb2glb' || score >= 70) {
    return { label: 'PROD GLB', cls: 'prod-ready', score };
  }
  if (String(m.format || '').toLowerCase() === 'glb' && score >= 45) {
    return { label: 'GLB', cls: 'prod-glb', score };
  }
  if (String(m.format || '').toLowerCase() === 'fbx') {
    return { label: 'SOURCE FBX', cls: 'prod-source', score };
  }
  if (score >= 40) return { label: 'OK', cls: 'prod-ok', score };
  return { label: 'RAW', cls: 'prod-raw', score };
}

/**
 * Ordered candidate URLs for a race kit: production GLB first, then FBX author.
 * Never includes forbidden secondary character CDNs.
 *
 * @param {{ glb?: string, r2?: string, fbx?: string }} kit
 * @param {(url: string) => boolean} [isForbidden]
 */
export function raceKitDeployUrls(kit, isForbidden = () => false) {
  const ordered = [kit?.glb, kit?.r2, kit?.fbx].filter(Boolean);
  const uniq = [];
  for (const u of ordered) {
    if (isForbidden(u)) continue;
    if (!uniq.includes(u)) uniq.push(u);
  }
  // Prefer .glb paths before .fbx when both present with same base
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
    '// Prefer: textured + meshed + SI-scaled production GLB (glb2glb)',
    '// Convert: npm run convert -- fbx2gltf … then glb2glb … --height 1.8 --texture-size 1024',
    '// Deploy: R2 assets.grudge-studio.com + registry smoke',
    '// Anims: anims/baked/**/*.json on grudge6 host — not Mixamo mannequin',
  ].join('\n');
}
