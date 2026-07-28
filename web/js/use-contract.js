/**
 * Fleet "use" contracts — copy-ready fields for Open / loaders / agents.
 * Prefers production bake path: textured · meshed · SI-scaled · glb2glb · CDN.
 */
import { inferAssetKind, getDeployProfile } from './deployChecks.js';
import {
  productionScore,
  isProductionDeployReady,
  productionBadge,
  productionLoadComment,
  HUMAN_HEIGHT_M,
} from './productionBake.js';
import { harvestImportSnippet, isHarvestAsset } from './harvestNeeds.js';
import { projectileImportSnippet, isProjectileOrCombatVfx } from './projectileVfx.js';
import { buildCanonicalLabels, inferGameUses } from './fleetTruth.js';

export {
  productionScore,
  isProductionDeployReady,
  productionBadge,
  productionLoadComment,
  HUMAN_HEIGHT_M,
};

export function r2KeyOf(m) {
  if (!m) return '';
  return String(m.path || m.r2Key || '')
    .replace(/\\/g, '/')
    .replace(/^\//, '');
}

export function cdnUrlOf(m) {
  if (!m) return '';
  if (m.cdnUrl) return m.cdnUrl;
  const key = r2KeyOf(m);
  return key ? `https://assets.grudge-studio.com/${key}` : '';
}

/** Prefer shared CDN thumbs (R2), then local capture. */
export function cdnThumbCandidates(m) {
  const uuid = (m.grudgeUuid || '').toLowerCase();
  const key = r2KeyOf(m);
  const out = [];
  if (uuid) {
    out.push(`https://assets.grudge-studio.com/thumbs/${uuid}.jpg`);
    out.push(`https://assets.grudge-studio.com/thumbs/${uuid}.webp`);
    out.push(`https://assets.grudge-studio.com/thumbs/pipeline/${uuid}.jpg`);
  }
  if (key) {
    const safe = key.replace(/[^a-zA-Z0-9._/-]+/g, '_').replace(/\//g, '__');
    out.push(`https://assets.grudge-studio.com/thumbs/by-path/${safe}.jpg`);
  }
  return out;
}

export function openImportSnippet(m) {
  const url = cdnUrlOf(m);
  const uuid = m.grudgeUuid || '';
  const r2 = r2KeyOf(m);
  const kind = inferAssetKind(m);
  const profile = getDeployProfile({ ...m, kind });
  const games = (m.gameUses || inferGameUses(m)).join(', ');
  const labels = (m.labels || buildCanonicalLabels({ ...m, kind })).slice(0, 12).join(' ');
  const forgeHint = `// Forge: https://forge.grudge-studio.com/?from=pipeline&workspace=assets&asset=${encodeURIComponent(url || '')}&r2Key=${encodeURIComponent(r2)}&uuid=${encodeURIComponent(uuid)}`;
  if (kind === 'animation' || m.isBakedClip) {
    const pack = m.group || m.bakedRel || 'pack';
    return `// Grudge baked / anim clip
// uuid: ${uuid}
// r2Key: ${r2}
// pack hint: ${pack}
const clipUrl = ${JSON.stringify(url || m.cdnUrl || '')};
// Load JSON with AnimationClip.parse, or FBX/GLB clips, then rematch Bip001 onto race kit.
// Prefer play on grudge6 character (not empty armature).`;
  }
  if (kind === 'character') {
    return `${productionLoadComment(m)}
${forgeHint}
// grudge6 / character kit — prefer production GLB (glb2glb), not raw FBX in game
// uuid: ${uuid}
// r2Key: ${r2}
// layer: ${profile.physicsLayer}
// badge: ${productionBadge(m).label} · score ${productionScore(m)}
const modelUrl = ${JSON.stringify(url)};
// GLTFLoader + enforceCharacterSi(${HUMAN_HEIGHT_M}) + feet y=0 + art-forward +Z
// Equipment = child mesh visibility (mesh_ids), not model swap.
// Modular HUD: head/body/arms/legs/cloak/wings/mount/weapon/shield
// Anims: Bip001 pack sword_shield|2h_melee|longbow|magic — stripPositionTracks`;
  }
  if (kind === 'projectile' || isProjectileOrCombatVfx(m)) {
    return projectileImportSnippet(m);
  }
  if (kind === 'vfx') {
    return projectileImportSnippet({ ...m, path: r2 || m.path, name: m.name || 'vfx' });
  }
  if (kind === 'weapon') {
    return `// Held weapon — hand-relative scale
// uuid: ${uuid}
// r2Key: ${r2}
// layer: ${profile.physicsLayer}
// scale: longest ~${profile.okRange[0]}–${profile.okRange[1]} m — do not height-normalize to 1.8 m
const url = ${JSON.stringify(url)};
// Attach to R_hand_container / weapon bone; anim pack by type
// Harvest tools (pickaxe / hatchet): also wire HarvestToolActions radial + hand attach`;
  }
  if (kind === 'harvest' || isHarvestAsset(m)) {
    return harvestImportSnippet(m);
  }
  return `// Fleet asset load (pipeline truth)
// uuid: ${uuid}
// r2Key: ${r2}
// kind: ${kind} · layer: ${profile.physicsLayer}
// games: ${games || 'pipeline'}
// labels: ${labels || '—'}
// scale axis: ${profile.scaleAxis} · ok ${profile.okRange[0]}–${profile.okRange[1]} m
const url = ${JSON.stringify(url)};
// Prefer same-origin rewrite then R2: https://assets.grudge-studio.com/{r2Key}
// Magic-byte check before parse (reject HTML fake-200).
// Multipack: isolate meshName — never place whole pack as one entity.
// SSOT browser: https://grudge-pipeline.vercel.app/`;
}

export function animPackHint(m) {
  if (!m) return null;
  const blob = `${m.group || ''} ${m.path || ''} ${m.name || ''} ${m.bakedRel || ''}`.toLowerCase();
  if (blob.includes('sword') || blob.includes('shield')) return 'sword_shield';
  if (blob.includes('longbow') || blob.includes('bow')) return 'longbow';
  if (blob.includes('magic') || blob.includes('cast')) return 'magic';
  if (blob.includes('polearm') || blob.includes('spear')) return 'polearm';
  if (blob.includes('unarmed') || blob.includes('punch')) return 'unarmed';
  if (blob.includes('loco') || blob.includes('walk') || blob.includes('run')) return 'locomotion';
  if (m.isBakedClip && m.bakedRel) {
    const pack = m.bakedRel.split('/')[0];
    return pack || null;
  }
  return m.kind === 'animation' ? 'unknown' : null;
}

export function readinessOf(m) {
  const kind = inferAssetKind(m);
  const profile = getDeployProfile({ ...m, kind });
  const prod = productionScore(m);
  const badge = productionBadge(m);
  const flags = [];
  if (m.grudgeUuid) flags.push('uuid');
  if (cdnUrlOf(m)) flags.push('cdn');
  if (m.textureStatus === 'atlas' || (m.textures && m.textures > 0)) flags.push('tex');
  if (kind === 'character' || m.boneMap || m.supportedSkeletons?.length) flags.push('skel');
  if (m.animations > 0 || m.isBakedClip || kind === 'animation') flags.push('anim');
  if (m.compressionType === 'draco' || m.format === 'glb') flags.push('web');
  if (m.uuidStatus === 'ok' || m.uuidStatus === 'derived') flags.push('uuid-ok');
  if (isProductionDeployReady(m)) flags.push('prod');
  if (m.bakePipeline === 'glb2glb' || m.productionBaked) flags.push('glb2glb');
  if (m.scaleBaked || m.scaleProfile === 'character') flags.push('scaled');
  if (m.isBakedClip) flags.push('baked-clip');
  flags.push(`kind:${kind}`);
  flags.push(`layer:${profile.physicsLayer}`);
  // Blend catalog readiness with production bake score (deploy-first)
  let score = Math.round(prod * 0.65);
  if (flags.includes('cdn')) score += 10;
  if (flags.includes('uuid') || flags.includes('uuid-ok')) score += 8;
  if (flags.includes('tex') || kind === 'animation' || !profile.requireTexture) score += 8;
  if (flags.includes('web') || flags.includes('glb2glb')) score += 8;
  if (kind === 'character' && flags.includes('skel')) score += 5;
  if (kind === 'projectile' || kind === 'weapon') score += 3;
  if (m.sizeKB && m.sizeKB < 15000) score += 3;
  return {
    flags,
    score: Math.min(100, score),
    productionScore: prod,
    productionBadge: badge.label,
    deployReady: isProductionDeployReady(m),
    kind,
    physicsLayer: profile.physicsLayer,
  };
}

export async function copyText(text) {
  const t = String(text || '');
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** HEAD check first existing CDN thumb URL. */
export async function resolveCdnThumb(m, timeoutMs = 2500) {
  for (const url of cdnThumbCandidates(m)) {
    try {
      const r = await fetch(url, {
        method: 'HEAD',
        mode: 'cors',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) continue;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) continue;
      if (ct.includes('image') || ct.includes('octet-stream') || !ct) return url;
    } catch {
      /* next */
    }
  }
  return null;
}
