/**
 * Grudge character deploy SSOT (browser port of gameopen characterDeploy.ts).
 *
 * KILLS these wrong processes (they produce hip-float + sideways heroes):
 *  - facePlusZ: false on Toon RTS / grudge6 FBX (art faces +X → looks sideways)
 *  - Ground once on bind pose then play full position tracks (feet leave floor)
 *  - Center/ground on pelvis Y as if pelvis == feet (character floats at hip)
 *  - Fit height using full prop AABB including weapons (wrong scale)
 *  - Apply world Box3 size as local scale (~100× bugs)
 *  - Keep root/hips .position tracks when retargeting pack clips onto kit
 *
 * CORRECT order (always):
 *  1. prepareSkinnedMeasure
 *  2. height fit (~1.8 m) with unit snap + clamps — skinned body only
 *  3. art-forward +Z (π/2 for fbx-atlas / grudge6 FBX kits)
 *  4. center XZ on Bip001 Pelvis
 *  5. groundFeetLocal from body min.y (NOT pelvis.y)
 *  6. anims = rotation/quaternion tracks only (unless authored root motion)
 *  7. sample pose → reGroundAfterEquip
 *
 * @see gameopen artifacts/animator/src/three/characterDeploy.ts
 * @see skill grudge-character-correctness
 */
import * as THREE from 'three';

export const CHARACTER_TARGET_HEIGHT_M = 1.8;
export const CHARACTER_ART_FORWARD = new THREE.Vector3(0, 0, 1);

const MAX_SCALE = 12;
const MIN_SCALE = 0.02;
const MIN_NATIVE_M = 0.05;
const MAX_NATIVE_M = 50;

export function prepareSkinnedMeasure(root) {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  root.updateWorldMatrix(true, true);
}

export function findPelvisBone(root) {
  let best = null;
  let bestScore = -1;
  root.traverse((o) => {
    if (!o.isBone || !o.name) return;
    const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (n === 'bip001pelvis' || n === 'pelvis') score = 100;
    else if (n.endsWith('pelvis')) score = 90;
    else if (n === 'mixamorighips' || n === 'hips') score = 80;
    else if (n.endsWith('hips')) score = 70;
    else if (n.includes('hip') && !n.includes('thigh')) score = 40;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  });
  return best;
}

/** Skinned body AABB only — weapons/banners must not warp scale or ground. */
export function bodyBox(root) {
  prepareSkinnedMeasure(root);
  const box = new THREE.Box3();
  let n = 0;
  root.traverse((node) => {
    if (!(node.isSkinnedMesh && node.visible)) return;
    try {
      box.expandByObject(node);
      n++;
    } catch {
      try {
        if (node.geometry) {
          if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
          const gb = node.geometry.boundingBox;
          if (gb && !gb.isEmpty()) {
            box.union(gb.clone().applyMatrix4(node.matrixWorld));
            n++;
          }
        }
      } catch {
        /* skip */
      }
    }
  });
  if (n === 0) box.setFromObject(root);
  return box;
}

function powerOfTenToward(reference, current) {
  if (!(reference > 0) || !(current > 0)) return 1;
  return Math.pow(10, Math.round(Math.log10(reference / current)));
}

/**
 * Height fit + unit snap. Does NOT set facing or final ground (caller does full deploy).
 */
export function fitCharacterHeight(model, targetM = CHARACTER_TARGET_HEIGHT_M, authorScale = 1) {
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  prepareSkinnedMeasure(model);

  const nativeHeight = bodyBox(model).getSize(new THREE.Vector3()).y || 1;
  let unitFix = 1;
  if (nativeHeight < MIN_NATIVE_M || nativeHeight > MAX_NATIVE_M) {
    unitFix = powerOfTenToward(targetM, nativeHeight);
  }
  model.scale.setScalar(unitFix);
  prepareSkinnedMeasure(model);
  const midH = bodyBox(model).getSize(new THREE.Vector3()).y || targetM;
  let fit = midH > 1e-6 ? (targetM / midH) * authorScale : authorScale;
  if (!Number.isFinite(fit) || fit <= 0) fit = 1;
  fit = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  model.scale.setScalar(unitFix * fit);
  prepareSkinnedMeasure(model);
  model.userData.grudgeHeightFit = true;
  return {
    scale: unitFix * fit,
    nativeHeight,
    unitFix,
    heightM: bodyBox(model).getSize(new THREE.Vector3()).y || targetM,
  };
}

export function groundFeetLocal(root, groundY = 0) {
  prepareSkinnedMeasure(root);
  const box = bodyBox(root);
  if (!Number.isFinite(box.min.y)) return 0;
  const dy = groundY - box.min.y;
  if (Math.abs(dy) > 1e-5) {
    root.position.y += dy;
    root.updateWorldMatrix(true, true);
  }
  return dy;
}

export function centerXZOnPelvis(model) {
  prepareSkinnedMeasure(model);
  const pelvis = findPelvisBone(model);
  const ax = new THREE.Vector3();
  if (pelvis) pelvis.getWorldPosition(ax);
  else bodyBox(model).getCenter(ax);
  const origin = new THREE.Vector3();
  model.getWorldPosition(origin);
  const wdx = ax.x - origin.x;
  const wdz = ax.z - origin.z;
  model.position.x -= wdx;
  model.position.z -= wdz;
  model.updateWorldMatrix(true, true);
  return { dx: -wdx, dz: -wdz, pelvis };
}

/**
 * Toon RTS / grudge6 FBX art faces +X. Controller + pipeline camera expect local +Z.
 * Default yaw = π/2. Idempotent via userData.artForwardSet.
 */
export function applyArtForwardPlusZ(root, yaw = Math.PI / 2) {
  if (root.userData.artForwardSet === true) return false;
  root.rotation.y = yaw;
  root.userData.artForwardSet = true;
  root.userData.artForwardYaw = yaw;
  root.updateWorldMatrix(true, true);
  return true;
}

/**
 * Full character deploy for grudge6 / heroes.
 *
 * @param {THREE.Object3D} model
 * @param {{
 *   targetHeightM?: number,
 *   groundY?: number,
 *   facePlusZ?: boolean|'auto',
 *   faceYaw?: number,
 *   importPipeline?: string,
 * }} [opts]
 */
export function deployCharacterModel(model, opts = {}) {
  const target = opts.targetHeightM ?? CHARACTER_TARGET_HEIGHT_M;
  const groundY = opts.groundY ?? 0;

  // Reset transform noise from prior previews
  model.position.set(0, 0, 0);
  if (!model.userData.artForwardSet) model.rotation.set(0, 0, 0);

  prepareSkinnedMeasure(model);
  let h = bodyBox(model).getSize(new THREE.Vector3()).y || 0;
  const already = model.userData.grudgeHeightFit === true;
  const absurd = h > target * 3 || h < target * 0.4 || h < 0.05;
  let fit = null;
  if (!already || absurd) {
    fit = fitCharacterHeight(model, target, opts.authorScale ?? 1);
    h = fit.heightM;
  }

  // Facing: grudge6 FBX kits ALWAYS need +Z art-forward unless already set.
  // KILL: defaulting facePlusZ false (sideways sword_shield previews).
  let facingApplied = false;
  const pipeline =
    opts.importPipeline ||
    model.userData.importPipeline ||
    'fbx-atlas';
  const faceMode = opts.facePlusZ ?? 'auto';
  if (faceMode === true) {
    facingApplied = applyArtForwardPlusZ(model, opts.faceYaw ?? Math.PI / 2);
  } else if (faceMode === 'auto') {
    if (
      (pipeline === 'fbx-atlas' ||
        pipeline === 'grudge6-fbx' ||
        /Characters\.fbx|grudge6\/races/i.test(String(model.userData.sourceUrl || ''))) &&
      !model.userData.artForwardSet
    ) {
      facingApplied = applyArtForwardPlusZ(model, opts.faceYaw ?? Math.PI / 2);
    }
  }
  // faceMode === false: explicit only (e.g. already +Z GLB)

  const { dx, dz, pelvis } = centerXZOnPelvis(model);
  const groundDeltaY = groundFeetLocal(model, groundY);

  model.userData.characterDeployed = true;
  model.userData.deployHeightM = h;
  model.userData.importPipeline = pipeline;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });

  prepareSkinnedMeasure(model);
  const box = bodyBox(model);
  const size = box.getSize(new THREE.Vector3());

  return {
    heightM: size.y || h,
    measure: size.y || h,
    size: { x: size.x, y: size.y, z: size.z },
    minY: box.min.y,
    groundDeltaY,
    centerDeltaX: dx,
    centerDeltaZ: dz,
    fit,
    pelvis: pelvis?.name || null,
    pelvisBone: pelvis,
    facingApplied,
    bones: listBoneNames(model),
    handR: findBoneName(model, /bip001.*r.*hand$|r_hand|hand_r|righthand/i),
    handL: findBoneName(model, /bip001.*l.*hand$|l_hand|hand_l|lefthand/i),
  };
}

export function reGroundAfterEquip(model, groundY = 0) {
  return groundFeetLocal(model, groundY);
}

/**
 * After mixer starts, hip float is almost always position tracks on root/hips.
 * Re-ground soles; call after first sample and when swapping clips.
 */
export function reGroundAfterAnimSample(model, groundY = 0) {
  prepareSkinnedMeasure(model);
  return groundFeetLocal(model, groundY);
}

function findBoneName(root, re) {
  let hit = null;
  root.traverse((o) => {
    if (hit) return;
    if (o.isBone && re.test(o.name || '')) hit = o.name;
  });
  return hit;
}

function listBoneNames(root) {
  const names = [];
  root.traverse((o) => {
    if (o.isBone && o.name) names.push(o.name);
  });
  return names;
}

/**
 * Strip translation root-motion / hip position tracks when retargeting pack
 * clips onto a grounded kit. Keeps quaternion + scale.
 * KILL: playing full Mixamo/FBX position tracks on a Y-grounded grudge6 kit
 * (character floats at hip / slides).
 */
export function stripPositionTracks(clip) {
  if (!clip?.tracks?.length) return clip;
  const tracks = clip.tracks.filter((t) => {
    const n = t.name || '';
    // Keep quaternion and scale; drop .position (root motion / hip lift)
    if (n.endsWith('.position') || n.includes('.position[')) return false;
    return true;
  });
  if (tracks.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/**
 * Diagnose common wrong looks for agent/UI.
 * @returns {{ ok: boolean, issues: { id: string, severity: string, detail: string }[] }}
 */
export function diagnoseCharacterLook(model, opts = {}) {
  const issues = [];
  prepareSkinnedMeasure(model);
  const box = bodyBox(model);
  const size = box.getSize(new THREE.Vector3());
  const h = size.y || 0;
  const minY = box.min.y;

  if (h < 1.4 || h > 2.4) {
    issues.push({
      id: 'height',
      severity: h < 0.5 || h > 5 ? 'error' : 'warn',
      detail: `height ${h.toFixed(2)} m (want ~1.6–2.1 for grudge6 heroes)`,
    });
  }
  if (Math.abs(minY) > 0.12) {
    issues.push({
      id: 'hip-float-or-sink',
      severity: Math.abs(minY) > 0.4 ? 'error' : 'warn',
      detail:
        `feet minY=${minY.toFixed(3)} — if |minY| large while pelvis near 0, ` +
        `feet were never grounded (hip-float). Use groundFeetLocal on skinned body, not pelvis.y.`,
    });
  }
  if (!model.userData.artForwardSet && opts.expectFbxFacing !== false) {
    const yaw = model.rotation.y;
    // Near 0 on FBX kit → facing +X = sideways vs +Z camera
    if (Math.abs(yaw) < 0.2 || Math.abs(Math.abs(yaw) - Math.PI) < 0.2) {
      issues.push({
        id: 'sideways-facing',
        severity: 'error',
        detail:
          `rotation.y≈${yaw.toFixed(2)} without artForwardSet — Toon RTS FBX faces +X; ` +
          `apply applyArtForwardPlusZ(π/2) so art faces +Z. Never leave facePlusZ:false on grudge6 FBX.`,
      });
    }
  }
  const pelvis = findPelvisBone(model);
  if (!pelvis) {
    issues.push({
      id: 'no-pelvis',
      severity: 'error',
      detail: 'No Bip001 Pelvis / Hips — wrong rig or incomplete load',
    });
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues, heightM: h, minY };
}
