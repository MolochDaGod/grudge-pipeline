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
/**
 * Minimum score for "Deploy bake → ready" when metadata is sparse.
 * Pass-2 floor (85): bare / weakly-tagged / unlabeled GLBs never pass as game-ready.
 */
export const PROD_READY_SCORE = 85;

/** Secondary floors for flagged-but-weak rows. */
export const PROD_BAKED_MIN_SCORE = 72;
export const PROD_DEPLOY_FLAG_MIN_SCORE = 78;
export const PROD_CLIP_MIN_SCORE = 70;

/** Path fragments that mean author/temp junk — never inventory as game-ready. */
export const RAW_PATH_KILL = [
  /\/raw\//i,
  /\/tmp\//i,
  /\/temp\//i,
  /\/scratch\//i,
  /\/wip\//i,
  /\/_backup/i,
  /\/backup_/i,
  /\.pre-opt\./i,
  /\.raw\./i,
  /\/test\//i,
  /\/debug\//i,
  /\/unused\//i,
  /\/archive\//i,
  /\/old\//i,
  /\/drop\//i,
  /\/draft\//i,
  /\/staging\//i,
  /\/import\//i,
  /meshy/i,
  /placeholder/i,
  /t-pose|tpose/i,
  /\/exports?\//i,
  /\/_trash/i,
  /\/deleted\//i,
  // Raw Mixamo / Kaykit / author anim GLBs — NOT Bip001 baked JSON
  /models\/animations\//i,
  /\/animations\/(grudge6|mixamo|kaykit|rig_)/i,
  /rig_medium_/i,
];

/** Named bake stages (align with ObjectStore grudge-convert). */
export const BAKE_STAGES = {
  convert: 'fbx2gltf / obj2glb — source → raw GLB',
  glb2glb: 'glb2glb — scale, mesh, texture, quantize, colliders, manifest',
  anim_bake: 'Bip001 rotation clips → anims/baked/**/*.json',
  deploy: 'R2 put + D1/registry + smoke',
};

function pathOf(m) {
  // Strip URL origin, query, and multipack mesh fragments (…glb#mesh:sword)
  let p = String(m?.path || m?.r2Key || m?.cdnUrl || '');
  p = p.replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '');
  p = p.split('?')[0].split('#')[0];
  return p.toLowerCase();
}

function fmtOf(m) {
  let fmt = String(m?.format || '').toLowerCase().replace(/^\./, '');
  // Guard multipack garbage like "glb#mesh:axe-2"
  if (fmt.includes('#') || fmt.includes('/')) fmt = fmt.split('#')[0].split('/').pop();
  if (fmt && /^[a-z0-9]+$/i.test(fmt) && fmt.length <= 5) return fmt;
  const p = pathOf(m);
  const base = p.split('/').pop() || '';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return String(ext || fmt || '')
    .toLowerCase()
    .replace(/^\./, '')
    .split('#')[0];
}

function isCdnSsot(m) {
  const cdn = String(m?.cdnUrl || '');
  const path = pathOf(m);
  if (cdn.includes('assets.grudge-studio.com')) return true;
  if (path.startsWith('models/') || path.startsWith('ui/') || path.includes('/models/')) return true;
  if (cdn.includes('grudge-arena') && /cdn\/assets\/characters/i.test(cdn)) return false;
  return false;
}

/**
 * Known production prefixes on R2 — GLBs here are fleet-shipped packs.
 * Metadata is often sparse in D1; path + glb is enough to treat as surface candidates.
 */
const PROD_PATH_PREFIXES = [
  /^models\/grudge6\//i,
  /^models\/projectiles\//i,
  /^models\/weapons\//i,
  /^models\/codex\//i,
  /^models\/harvest\//i,
  /^models\/nature\//i,
  /^models\/vfx\//i,
  /^models\/buildings\//i,
  /^anims\/baked\//i,
  /^ui\/icons\//i,
];

export function isKnownProductionPath(m) {
  const p = pathOf(m);
  return PROD_PATH_PREFIXES.some((re) => re.test(p));
}

/** True when catalog metadata claims usable albedo / atlas / vcol (not bare grey mesh). */
export function hasProductionSurface(m) {
  if (!m) return false;
  if (m.isBakedClip) return true; // clips are not mesh-shaded
  if (m.textureStatus === 'atlas' || m.textureStatus === 'embedded') return true;
  if (m.textureStatus === 'vertex-color') return true;
  if ((m.textures || 0) > 0) return true;
  // Explicit glb2glb / production bake implies textures were processed (atlas-bound OK)
  if (m.productionBaked === true || m.bakePipeline === 'glb2glb') return true;
  // Known production R2 prefixes (codex / grudge6 / weapons / projectiles) —
  // D1 often omits textureStatus; these packs were shipped as textured GLBs.
  if (fmtOf(m) === 'glb' && isCdnSsot(m) && isKnownProductionPath(m)) {
    // Still reject multipack fragment junk and untitled mesh extracts
    const name = String(m.name || '').toLowerCase();
    if (/^untitled|mesh:|#mesh/i.test(name)) return false;
    if (/#mesh:/i.test(String(m.path || m.r2Key || ''))) return false;
    return true;
  }
  // Weapons: production-flagged or multipack race kit path
  if (
    m.kind === 'weapon' &&
    fmtOf(m) === 'glb' &&
    isCdnSsot(m) &&
    (m.deployReady === true ||
      m.productionBaked === true ||
      /grudge6|weapons\/|multipack|toon/i.test(pathOf(m)))
  ) {
    return true;
  }
  return false;
}

/**
 * True when path/name is author/temp junk that should never live in the ready index.
 * Used by D1 purge planner and ready gate.
 */
export function isRawKillPath(m) {
  if (!m) return false;
  const path = pathOf(m);
  const cdn = String(m.cdnUrl || '');
  const name = String(m.name || '');
  return RAW_PATH_KILL.some((re) => re.test(path) || re.test(cdn) || re.test(name));
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
  else if (fmt === 'glb' && isKnownProductionPath(m)) score += 12; // D1-sparse fleet packs
  else score -= 18; // bare mesh / missing maps

  // Meshed
  if ((m.meshes || 0) > 0) score += 8;
  if (m.kind === 'character' || /_characters\.(glb|fbx)/i.test(path)) score += 6;

  // SI / glb2glb bake
  if (m.scaleBaked || m.productionBaked || m.bakePipeline === 'glb2glb') score += 18;
  else if (fmt === 'glb' && isKnownProductionPath(m))
    score += 12; // fleet packs on production prefixes (D1 often omits scale flags)
  if (m.scaleProfile === 'character' || m.scaleProfile === 'animation_clip') score += 6;

  // Web deploy packaging
  if (m.compressionType === 'draco' || m.compressionType === 'meshopt') score += 10;
  else if (fmt === 'glb') score += 6;

  // CDN SSOT (R2)
  if (isCdnSsot(m)) score += 14;
  if (cdn.includes('grudge-arena') && /cdn\/assets\/characters/i.test(cdn)) score -= 60;

  // Explicit production flags + known path boost
  if (m.productionBaked === true || m.deployReady === true) score += 12;
  if (m.source === 'grudge6-ssot' || m.source === 'baked-bip001') score += 8;
  if (isKnownProductionPath(m) && fmt === 'glb') score += 8;

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
 * Strict gameplay / pipeline inventory gate (DEFAULT catalog filter):
 * - **Game-ready only**: labeled · textured · scaled · converted (GLB/json) · CDN
 * - **Never** FBX/OBJ/raw dumps, untextured greys, unlabeled junk, backup/wip paths
 *
 * Used when activeProd === 'ready' on grudge-pipeline.vercel.app.
 */
export function isProductionDeployReady(m) {
  if (!m) return false;

  const path = pathOf(m);
  const fmt = fmtOf(m);
  const cdn = String(m.cdnUrl || '');
  const name = String(m.name || '').trim();

  // KILL: secondary arena character host (stale 100× / wrong scale)
  if (cdn.includes('grudge-arena') && /cdn\/assets\/characters/i.test(cdn)) {
    return false;
  }
  if (/cdn\/assets\/characters/i.test(path)) return false;

  // KILL: legacy grudge6 trash folders (models/grudge6/ud|wk|brb/… — not races/)
  // These are D1 ghosts that open as empty/no-mesh; fleet SSOT is races/* only.
  if (
    /models\/grudge6\/(wk|brb|ud|orc|elf|dwf)\//i.test(path) ||
    /models\/grudge6\/30characters/i.test(path) ||
    /models\/characters\/grudge6\//i.test(path)
  ) {
    return false;
  }

  // KILL: author/temp/backup/WIP paths
  if (isRawKillPath(m)) return false;

  // Must have a usable label (name or path basename)
  if (!name && !path) return false;
  if (/^(untitled|mesh|object|model|geo|export|new|asset)[\s_-]*\d*$/i.test(name)) {
    return false;
  }

  // Baked anim clips (rotation-only Bip001 JSON ONLY)
  // KILL: models/animations/** Mixamo GLB dumps classified as "animation" in D1
  if (/models\/animations\//i.test(path)) return false;
  if (m.isBakedClip || (fmt === 'json' && /anims\/baked/.test(path))) {
    // Prefer labeled pack path: anims/baked/{pack}/{clip}.json
    if (/anims\/baked\/[^/]+\/.+\.json/i.test(path) || m.bakedRel) return true;
    // Or curated BAKED_PACKS entries with group
    if (m.group && /baked\//i.test(m.group)) return true;
    return productionScore(m) >= PROD_CLIP_MIN_SCORE;
  }
  // Never treat raw FBX/GLB under anim folders as ready
  if (fmt !== 'json' && (/\/anim/i.test(path) || m.kind === 'animation')) {
    return false;
  }

  // Mesh deploy: production GLB only (never author FBX/OBJ as "ready")
  if (fmt !== 'glb') return false;

  // Must be fleet CDN SSOT
  if (!isCdnSsot(m)) return false;

  // HARD: must have real surface — no grey/yellow bare mesh in game inventory
  if (!hasProductionSurface(m)) return false;

  // Kind/label: require inferred or explicit kind (not empty "other" without path signals)
  const kind = String(m.kind || '').toLowerCase();
  const labeled =
    !!kind &&
    kind !== 'other' &&
    kind !== 'unknown' &&
    kind !== '';
  const pathKindHint =
    /models\/|characters|weapons|props|nature|ui\/|anims\//i.test(path) ||
    /grudge6|harvest|projectile|building|codex/i.test(path);
  if (!labeled && !pathKindHint && !m.labels?.length && !(m.gameUses || []).length) {
    return false;
  }

  // Prefer explicit production bake flags — still need high score (pass-2)
  if (m.productionBaked === true || m.bakePipeline === 'glb2glb') {
    return productionScore(m) >= PROD_BAKED_MIN_SCORE;
  }
  if (m.deployReady === true && hasProductionSurface(m) && productionScore(m) >= PROD_DEPLOY_FLAG_MIN_SCORE) {
    return true;
  }

  // Score floor for well-tagged R2 GLBs (textured + SI + CDN)
  if (productionScore(m) >= PROD_READY_SCORE) return true;

  return false;
}

/**
 * Collapse catalog duplicates: same basename / uuid / near-identical path.
 * Keeps the highest productionScore entry; marks losers with _dedupedOf.
 * @param {object[]} models
 * @returns {{ models: object[], removed: number, groups: number }}
 */
export function purgeCatalogDuplicates(models) {
  if (!Array.isArray(models) || !models.length) {
    return { models: [], removed: 0, groups: 0 };
  }

  const byUuid = new Map();
  const byStem = new Map();

  const stemOf = (m) => {
    const p = pathOf(m);
    let base = p.split('/').pop() || '';
    base = base.replace(/\.(glb|gltf|fbx|obj|dae|json)$/i, '');
    // Collapse author suffixes so sword.raw / sword.prod / sword share one stem
    base = base
      .replace(
        /[._-](raw|pre-opt|preopt|prod|opt|meshopt|glb2glb|bak|old|wip|copy|final|v\d+|duplicate|dup)$/i,
        '',
      )
      .replace(/[_\s]+copy$/i, '')
      .replace(/\s*\(\d+\)$/i, '');
    // Prefer dir+stem for common multipacks so WK_Characters ≠ BRB_Characters
    const dir = p.includes('/') ? p.split('/').slice(-2, -1)[0] || '' : '';
    const stem = base.toLowerCase();
    if (dir && stem.length >= 2) return `${dir.toLowerCase()}/${stem}`;
    return stem;
  };

  // First pass: uuid winners
  for (const m of models) {
    const u = (m.grudgeUuid || '').toLowerCase();
    if (!u) continue;
    const prev = byUuid.get(u);
    if (!prev || productionScore(m) > productionScore(prev)) byUuid.set(u, m);
  }

  // Second: stem winners (among survivors / no uuid)
  const uuidWinners = new Set([...byUuid.values()]);
  for (const m of models) {
    const u = (m.grudgeUuid || '').toLowerCase();
    if (u && byUuid.get(u) !== m) continue; // lost uuid duel
    const stem = stemOf(m);
    if (!stem || stem.length < 2) continue;
    const prev = byStem.get(stem);
    if (!prev || productionScore(m) > productionScore(prev)) byStem.set(stem, m);
  }

  const keep = new Set();
  for (const m of byUuid.values()) keep.add(m);
  for (const m of byStem.values()) {
    // if this stem's winner lost a uuid duel, skip
    const u = (m.grudgeUuid || '').toLowerCase();
    if (u && byUuid.has(u) && byUuid.get(u) !== m) continue;
    keep.add(m);
  }

  // Always keep curated SSOT even if stem collided
  for (const m of models) {
    if (m.source === 'grudge6-ssot' || m.source === 'baked-bip001') keep.add(m);
  }

  // Assets with unique full paths and no stem collision
  for (const m of models) {
    if (keep.has(m)) continue;
    const stem = stemOf(m);
    if (!stem) {
      if (isProductionDeployReady(m) || m.source === 'production') keep.add(m);
      continue;
    }
    const winner = byStem.get(stem);
    if (winner === m) keep.add(m);
    else if (!winner && isProductionDeployReady(m)) keep.add(m);
  }

  const out = models.filter((m) => keep.has(m));
  return {
    models: out,
    removed: models.length - out.length,
    groups: byStem.size + byUuid.size,
  };
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
    productionScore(m) >= PROD_READY_SCORE
  );
}

/**
 * Classify why a row is NOT game-ready (for D1 purge reports).
 * @returns {string|null} reason code, or null if ready
 */
export function notReadyReason(m) {
  if (!m) return 'null';
  if (isProductionDeployReady(m)) return null;
  const path = pathOf(m);
  const fmt = fmtOf(m);
  if (isRawKillPath(m)) return 'raw_kill_path';
  if (fmt === 'fbx' || fmt === 'obj' || fmt === 'dae') return 'author_source_format';
  if (fmt === 'gltf') return 'unoptimized_gltf';
  if (fmt !== 'glb' && fmt !== 'json') return `format_${fmt || 'unknown'}`;
  if (!isCdnSsot(m)) return 'not_cdn_ssot';
  if (fmt === 'glb' && !hasProductionSurface(m)) return 'no_surface';
  if (productionScore(m) < PROD_READY_SCORE) return `score_below_${PROD_READY_SCORE}`;
  return 'gate_fail';
}

/**
 * Infer grudge6 / modular equipment slot from mesh name.
 * Used for multipack isolation + equip wiring.
 */
export function inferEquipSlot(meshName) {
  const n = String(meshName || '');
  if (!n || n === '(unnamed)') return 'unknown';
  const s = n.toLowerCase();
  // Skeleton / bones first (not equippable armor)
  if (
    /bip001|skeleton|armature|root|hips|pelvis|spine|neck|clavicle|upperarm|forearm|hand|thigh|calf|foot|toe/i.test(
      n,
    ) &&
    !/mesh|geo|armor|helm|body|cloak|wing|cape/i.test(n)
  ) {
    return 'skeleton';
  }
  // Back / flight / mount (RTS_TOON modular extras)
  if (/cloak|cape|mantle|back_?cloth/i.test(s)) return 'cloak';
  if (/wing|wings|angel|dragon_?wing|bat_?wing/i.test(s)) return 'wings';
  if (/horse|mount|cavalry|saddle|steed/i.test(s)) return 'mount';
  if (/shoulder|pauldron/i.test(s)) return 'shoulders';
  if (/quiver|bone_bag|bone_wood/i.test(s)) return 'quiver';
  if (/head|helm|helmet|hood|hat|mask|face|hair|beard|ear/i.test(s)) return 'head';
  if (/body|torso|chest|armor|cuirass|robe|shirt|jacket/i.test(s)) return 'body';
  if (/arm|glove|gauntlet|bracer|sleeve/i.test(s)) return 'arms';
  if (/leg|boot|shoe|pant|greave|skirt|lower/i.test(s)) return 'legs';
  if (/sword|axe|mace|bow|staff|wand|spear|dagger|gun|rifle|pick|shovel|scyth|hammer|weapon|blade/i.test(s))
    return 'weapon';
  if (/shield|buckler/i.test(s)) return 'shield';
  if (/pouch|bag|belt|ring|amulet|accessory|lantern|torch/i.test(s)) return 'accessory';
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
 * Ordered candidate URLs for a race kit.
 *
 * HARD (2026-07-31 BRB screenshot): grudge6 multipack **GLB convert is yellow/orange
 * sludge + often still +X art-forward**. Skill SSOT: load **FBX + race atlas** first.
 * GLB is fallback only when FBX fails.
 */
export function raceKitDeployUrls(kit, isForbidden = () => false) {
  // FBX first (author + atlas rebind), then GLB deploy attempts
  const ordered = [kit?.fbx, kit?.glb, kit?.r2].filter(Boolean);
  const uniq = [];
  for (const u of ordered) {
    if (isForbidden(u)) continue;
    if (!uniq.includes(u)) uniq.push(u);
  }
  return uniq.sort((a, b) => {
    // Prefer FBX over GLB for grudge6 race multipacks
    const af = /\.fbx($|\?)/i.test(a) ? 0 : 1;
    const bf = /\.fbx($|\?)/i.test(b) ? 0 : 1;
    return af - bf;
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
