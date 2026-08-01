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
 *  2. unit snap vs **race height truth** (orc=2.0, human=1.8, …) — skinned body only
 *     DO NOT force every race to 1.8 m. Only fix cm↔m decades.
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
import { HUMAN_HEIGHT_M, RACE_HEIGHT_M, raceHeightM } from './worldScale.js';

export { HUMAN_HEIGHT_M, RACE_HEIGHT_M, raceHeightM };

/** Default when race unknown = WK human. Prefer raceHeightM(raceId). */
export const CHARACTER_TARGET_HEIGHT_M = HUMAN_HEIGHT_M;
export const CHARACTER_ART_FORWARD = new THREE.Vector3(0, 0, 1);

/** Residual fit clamp — only if still broken after unit decade. Prefer NOT forcing. */
const MAX_FIT = 12;
const MIN_FIT = 0.02;
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
 * Unit snap (+ rare residual) toward a **race height**, not a forced global 1.8.
 *
 * @param {THREE.Object3D} model
 * @param {number|string} [targetOrRace=1.8]  metres OR raceId (`orcs` → 2.0)
 * @param {number} [authorScale=1]
 *
 * Truth: orc = 2.0 m, human = 1.8 m, dwarf = 1.45 m, …
 * - Diagnose + apply **unit decade only** (cm-as-m) against that race height.
 * - If already inside the race band after unit fix → **do not force** residual fit.
 * - Residual fit only when still broken after unit snap (pathological exports).
 */
export function fitCharacterHeight(model, targetOrRace = CHARACTER_TARGET_HEIGHT_M, authorScale = 1) {
  const targetM =
    typeof targetOrRace === 'string' ? raceHeightM(targetOrRace) : targetOrRace || HUMAN_HEIGHT_M;
  const bandLo = targetM * 0.9;
  const bandHi = targetM * 1.12;

  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  prepareSkinnedMeasure(model);

  const nativeHeight = bodyBox(model).getSize(new THREE.Vector3()).y || 1;
  let unitFix = 1;

  // Decade vs **this race's** true height (orc 200 "m" → ×0.01 → 2.0 m)
  const ratio = nativeHeight / targetM;
  if (ratio >= 70 && ratio <= 140) {
    unitFix = 0.01; // classic cm-as-m / 100×
  } else if (ratio >= 1 / 140 && ratio <= 1 / 70) {
    unitFix = 100;
  } else if (ratio >= 7 && ratio <= 14) {
    unitFix = 0.1;
  } else if (ratio >= 1 / 14 && ratio <= 1 / 7) {
    unitFix = 10;
  } else if (nativeHeight < MIN_NATIVE_M || nativeHeight > MAX_NATIVE_M) {
    unitFix = powerOfTenToward(targetM, nativeHeight);
  } else if (nativeHeight > 15 && nativeHeight < 500) {
    unitFix = 0.01; // absolute cm band
  }

  model.scale.setScalar(unitFix);
  prepareSkinnedMeasure(model);
  const midH = bodyBox(model).getSize(new THREE.Vector3()).y || targetM;

  // NO forced residual: if unit-corrected height is already race-true, stop.
  let fit = 1;
  if (midH < bandLo || midH > bandHi) {
    fit = midH > 1e-6 ? (targetM / midH) * authorScale : authorScale;
    if (!Number.isFinite(fit) || fit <= 0) fit = 1;
    fit = Math.min(MAX_FIT, Math.max(MIN_FIT, fit));
  }

  model.scale.setScalar(unitFix * fit);
  prepareSkinnedMeasure(model);
  model.userData.grudgeHeightFit = true;
  model.userData.grudgeUnitFix = unitFix;
  model.userData.grudgeNativeHeight = nativeHeight;
  model.userData.grudgeRaceHeightM = targetM;
  const heightM = bodyBox(model).getSize(new THREE.Vector3()).y || targetM;
  return {
    scale: unitFix * fit,
    nativeHeight,
    unitFix,
    fit,
    heightM,
    targetM,
    raceHeightM: targetM,
    humanMultiple: heightM / HUMAN_HEIGHT_M,
    unitKind: unitFix === 0.01 || unitFix === 100 ? 'x100' : unitFix === 1 ? 'ok' : 'decade',
    forcedFit: fit !== 1,
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
  // Race height is truth — orc 2.0, human 1.8 — not a forced global 1.8
  const target =
    opts.targetHeightM ??
    (opts.raceId ? raceHeightM(opts.raceId) : null) ??
    model.userData.grudgeRaceHeightM ??
    (model.userData.grudgeRaceId ? raceHeightM(model.userData.grudgeRaceId) : null) ??
    CHARACTER_TARGET_HEIGHT_M;
  const groundY = opts.groundY ?? 0;
  const forceRefit = opts.forceRefit === true;
  const bandLo = target * 0.9;
  const bandHi = target * 1.12;

  // Reset transform noise from prior previews
  model.position.set(0, 0, 0);
  if (!model.userData.artForwardSet) model.rotation.set(0, 0, 0);

  prepareSkinnedMeasure(model);
  let h = bodyBox(model).getSize(new THREE.Vector3()).y || 0;
  // Refit only for unit mistakes (100×) or forceRefit — not because orc ≠ 1.8
  const already = !forceRefit && model.userData.grudgeHeightFit === true;
  const absurd =
    h > target * 3 ||
    h < target * 0.4 ||
    h < 0.05 ||
    h > 15 || // absolute cm band before unit fix
    (already && (h < bandLo || h > bandHi));
  let fit = null;
  if (!already || absurd || forceRefit) {
    if (absurd || forceRefit) {
      model.userData.grudgeHeightFit = false;
      model.scale.set(1, 1, 1);
    }
    fit = fitCharacterHeight(model, target, opts.authorScale ?? 1);
    h = fit.heightM;
  }
  model.userData.grudgeRaceHeightM = target;

  // Facing: Toon RTS / grudge6 multipacks face +X in BOTH FBX and bad GLB converts.
  // KILL: assuming production-glb is already +Z (BRB screenshot: LOOK sideways-facing).
  // KILL: facePlusZ false on grudge6.
  let facingApplied = false;
  const pipeline =
    opts.importPipeline ||
    model.userData.importPipeline ||
    'fbx-atlas';
  const faceMode = opts.facePlusZ ?? 'auto';
  const src = String(model.userData.sourceUrl || opts.sourceUrl || '');
  const isGrudge6Kit =
    model.userData.grudge6SsotHost === true ||
    /grudge6\/races|Characters\.(fbx|glb)/i.test(src) ||
    /^(western-kingdoms|barbarians|high-elves|dwarves|orcs|undead)$/i.test(
      String(model.userData.grudgeRaceId || opts.raceId || ''),
    );

  if (faceMode === true || (faceMode === 'auto' && isGrudge6Kit)) {
    // Always apply once for grudge6 — GLB convert does NOT fix art-forward
    if (!model.userData.artForwardSet) {
      facingApplied = applyArtForwardPlusZ(model, opts.faceYaw ?? Math.PI / 2);
    } else {
      facingApplied = true;
    }
  } else if (faceMode === 'auto') {
    // Non-grudge6: FBX kits need +Z; true production-glb may already be correct
    const needsFbxForward =
      pipeline === 'fbx-atlas' ||
      pipeline === 'grudge6-fbx' ||
      /\.fbx($|\?)/i.test(src);
    if (needsFbxForward && !model.userData.artForwardSet) {
      facingApplied = applyArtForwardPlusZ(model, opts.faceYaw ?? Math.PI / 2);
    }
  }
  // faceMode === false: explicit opt-out only

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

  // Final SI gate — catches residual 100× after facing/center
  const enforced = enforceCharacterSi(model, target);
  if (enforced.fixed) {
    h = enforced.heightM;
    if (enforced.fit) fit = enforced.fit;
    facingApplied = true;
  }

  prepareSkinnedMeasure(model);
  const box = bodyBox(model);
  const size = box.getSize(new THREE.Vector3());
  // Re-ground to requested groundY (enforce uses 0)
  const groundDeltaY2 = groundY !== 0 ? groundFeetLocal(model, groundY) : 0;

  return {
    heightM: size.y || h,
    measure: size.y || h,
    size: { x: size.x, y: size.y, z: size.z },
    minY: box.min.y,
    groundDeltaY: groundDeltaY + groundDeltaY2,
    centerDeltaX: dx,
    centerDeltaZ: dz,
    fit,
    siEnforced: enforced.fixed,
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
  // Unique names only — multipack graphs duplicate Bone objects (looks like "192 bones")
  const names = new Set();
  root.traverse((o) => {
    if (o.isBone && o.name) names.add(o.name);
  });
  return [...names];
}

/**
 * Report Bip001 vs Mixamo truth (unique names).
 * grudge6 kit = Bip001 (~40–80). Mixamo = ~25 (clips only). 192 objects ≠ 192 bones.
 */
export function skeletonBoneReport(root) {
  const bip = new Set();
  const mix = new Set();
  let objects = 0;
  root?.traverse((o) => {
    if (!o.isBone || !o.name) return;
    objects++;
    if (/bip001/i.test(o.name)) bip.add(o.name);
    else if (/mixamorig/i.test(o.name)) mix.add(o.name);
  });
  return {
    bip001: bip.size,
    mixamo: mix.size,
    unique: bip.size + mix.size,
    objects,
    label:
      mix.size > bip.size
        ? `Mixamo ${mix.size} (WRONG kit)`
        : `Bip001 ${bip.size} unique` +
          (objects > bip.size + 10 ? ` · ${objects} objs` : ''),
  };
}

/**
 * Strip translation root-motion / hip position tracks when retargeting pack
 * clips onto a grounded kit.
 * KILL: playing full Mixamo/FBX position tracks on a Y-grounded grudge6 kit
 * (character floats at hip / slides).
 *
 * By default also strips **.scale** tracks — Mixamo/cm packs often inject
 * 100× bone scale and explode the skinned body after retarget.
 * Pass `{ keepScale: true }` only for authored grudge6 root-scale clips.
 */
export function stripPositionTracks(clip, opts = {}) {
  if (!clip?.tracks?.length) return clip;
  const keepScale = opts.keepScale === true;
  const tracks = clip.tracks.filter((t) => {
    const n = t.name || '';
    // Drop .position (root motion / hip lift)
    if (n.endsWith('.position') || n.includes('.position[')) return false;
    // Drop .scale unless explicitly kept (100× retarget killer)
    if (!keepScale && (n.endsWith('.scale') || n.includes('.scale['))) return false;
    return true;
  });
  if (tracks.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/**
 * SI gate vs **race height truth** (orc 2.0, human 1.8, dwarf 1.45, …).
 * Pass raceId string or metres. Does NOT force every race into a 1.55–2.05 clamp.
 * Only unit-snaps when outside the race band (or classic 100× cm).
 *
 * @param {THREE.Object3D} model
 * @param {number|string} [targetOrRace]  raceId or metres
 */
export function enforceCharacterSi(model, targetOrRace = CHARACTER_TARGET_HEIGHT_M) {
  const targetM =
    typeof targetOrRace === 'string' ? raceHeightM(targetOrRace) : targetOrRace || HUMAN_HEIGHT_M;
  const bandLo = targetM * 0.9;
  const bandHi = targetM * 1.12;

  prepareSkinnedMeasure(model);
  let h = bodyBox(model).getSize(new THREE.Vector3()).y || 0;
  // Already race-true (or unit-ok) — ground feet only, no force scale
  if (h >= bandLo && h <= bandHi) {
    groundFeetLocal(model, 0);
    model.userData.deployHeightM = h;
    model.userData.grudgeRaceHeightM = targetM;
    model.userData.grudgeHeightFit = true;
    return {
      heightM: h,
      fixed: false,
      unitFix: model.userData.grudgeUnitFix ?? 1,
      targetM,
    };
  }

  const yaw = model.userData.artForwardYaw ?? model.rotation.y ?? Math.PI / 2;

  model.userData.grudgeHeightFit = false;
  model.userData.artForwardSet = false;
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);

  const fit = fitCharacterHeight(model, targetM);
  applyArtForwardPlusZ(model, yaw || Math.PI / 2);
  centerXZOnPelvis(model);
  groundFeetLocal(model, 0);

  h = bodyBox(model).getSize(new THREE.Vector3()).y || 0;
  // Last resort only if still outside race band after unit path
  if (h < bandLo * 0.85 || h > bandHi * 1.15) {
    const s = targetM / Math.max(h, 1e-6);
    if (Number.isFinite(s) && s > 0) {
      model.scale.multiplyScalar(s);
      prepareSkinnedMeasure(model);
      groundFeetLocal(model, 0);
      h = bodyBox(model).getSize(new THREE.Vector3()).y || targetM;
    }
  }

  model.userData.grudgeHeightFit = true;
  model.userData.characterDeployed = true;
  model.userData.deployHeightM = h;
  model.userData.grudgeRaceHeightM = targetM;
  return {
    heightM: h,
    fixed: true,
    unitFix: fit?.unitFix ?? model.userData.grudgeUnitFix ?? 1,
    fit,
    targetM,
  };
}

/**
 * Diagnose common wrong looks for agent/UI.
 * Integrates skeletonCanon (bip001/mixamo) + unit decade + feet ground.
 * @returns {{ ok: boolean, issues: { id: string, severity: string, detail: string }[], skeleton?: object }}
 */
export function diagnoseCharacterLook(model, opts = {}) {
  const issues = [];
  prepareSkinnedMeasure(model);
  const box = bodyBox(model);
  const size = box.getSize(new THREE.Vector3());
  const h = size.y || 0;
  const minY = box.min.y;

  const raceTarget =
    opts.raceHeightM ??
    opts.targetHeightM ??
    model.userData.grudgeRaceHeightM ??
    (opts.raceId ? raceHeightM(opts.raceId) : HUMAN_HEIGHT_M);
  const bandLo = raceTarget * 0.9;
  const bandHi = raceTarget * 1.12;

  // 100× / decade unit mistakes (classic cm-as-m)
  if (h >= 70 && h <= 250) {
    issues.push({
      id: 'unit-x100',
      severity: 'error',
      detail: `height ${h.toFixed(1)} m looks like cm-as-m (100×). Apply unitFix×0.01 vs race ${raceTarget} m — never non-uniform bone scale.`,
    });
  } else if (h < bandLo || h > bandHi) {
    issues.push({
      id: 'height',
      severity: h < 0.5 || h > 5 ? 'error' : 'warn',
      detail: `height ${h.toFixed(2)} m (race truth ${raceTarget.toFixed(2)} m · band ${bandLo.toFixed(2)}–${bandHi.toFixed(2)})`,
    });
  }
  if (Math.abs(minY) > 0.08) {
    issues.push({
      id: 'hip-float-or-sink',
      severity: Math.abs(minY) > 0.25 ? 'error' : 'warn',
      detail:
        `feet minY=${minY.toFixed(3)} — if |minY| large while pelvis near 0, ` +
        `feet were never grounded (hip-float). Use groundFeetLocal on skinned body, not pelvis.y. ` +
        `Also strip .position tracks before idle/attack on grounded kit.`,
    });
  }
  // Multipack weapon soup: many visible non-body meshes under race kit
  let visibleWeapons = 0;
  let visibleExtras = 0;
  let visibleBody = 0;
  model.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
    const n = (o.name || '').toLowerCase();
    if (/sword|axe|mace|bow|staff|spear|dagger|hammer|weapon|blade|shield/i.test(n)) visibleWeapons++;
    else if (/body|torso|leg|arm|head|helm|boot/i.test(n)) visibleBody++;
    else if (/bag|wood|quiver|prop|crate|barrel|cloak|wing|bone_/i.test(n)) visibleExtras++;
  });
  if (visibleWeapons > 2) {
    issues.push({
      id: 'weapon-soup',
      severity: 'error',
      detail: `${visibleWeapons} weapon-like meshes visible — multipack must isolate mesh_ids (warrior = one sword + optional shield)`,
    });
  }
  if (visibleBody === 0 && (visibleWeapons > 0 || visibleExtras > 0)) {
    issues.push({
      id: 'no-body-mesh',
      severity: 'error',
      detail: 'No body/legs visible — equip hid the body; feet ground will use hip and float',
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

  // Skeleton family + feet/hands — count UNIQUE names (not Bone object instances)
  let skeleton = null;
  try {
    const bipNames = new Set();
    const mixNames = new Set();
    let objects = 0;
    let leftFoot = false;
    let rightFoot = false;
    model.traverse((o) => {
      if (!o.isBone) return;
      objects++;
      const n = o.name || '';
      if (/bip001/i.test(n)) bipNames.add(n);
      if (/mixamorig/i.test(n)) mixNames.add(n);
      if (/l.*foot|leftfoot|foot\.l|foot_l/i.test(n) && !/end|nub/i.test(n)) leftFoot = true;
      if (/r.*foot|rightfoot|foot\.r|foot_r/i.test(n) && !/end|nub/i.test(n)) rightFoot = true;
    });
    const bip = bipNames.size;
    const mix = mixNames.size;
    const family =
      bip > mix && bip >= 3
        ? 'bip001'
        : mix > bip && mix >= 3
          ? 'mixamo'
          : bip
            ? 'bip001'
            : mix
              ? 'mixamo'
              : 'unknown';
    skeleton = {
      family,
      leftFoot,
      rightFoot,
      bipBones: bip,
      mixamoBones: mix,
      boneObjects: objects,
    };
    // grudge6 multipack: unique Bip001 is OK; 192 usually = duplicate objects
    if (family === 'mixamo') {
      issues.push({
        id: 'wrong-skeleton-mixamo',
        severity: 'error',
        detail: `Mixamo ${mix} bones on kit — grudge6 uses Bip001. Load models/grudge6/races/*_Characters.fbx + fleet atlas.`,
      });
    }
    if (family === 'bip001' && objects > bip * 2 && objects > 100) {
      issues.push({
        id: 'bone-object-soup',
        severity: 'warn',
        detail: `${objects} Bone objects but only ${bip} unique Bip001 names — multipack skeleton copies (UI used to show ${objects} as bone count).`,
      });
    }
    if (family === 'unknown') {
      issues.push({
        id: 'skeleton-family',
        severity: 'warn',
        detail: 'Unknown skeleton — expected bip001 (grudge6) or mixamo',
      });
    }
    if (!leftFoot || !rightFoot) {
      issues.push({
        id: 'feet-bones',
        severity: 'error',
        detail: `Missing foot bones (L=${leftFoot} R=${rightFoot}) — feet IK / ground plant will fail`,
      });
    }
    // Non-uniform bone scale = mesh stretch
    model.traverse((o) => {
      if (!o.isBone) return;
      const s = o.scale;
      if (
        (Math.abs(s.x - s.y) > 0.05 || Math.abs(s.y - s.z) > 0.05) &&
        (Math.abs(s.x - 1) > 0.05 || Math.abs(s.y - 1) > 0.05)
      ) {
        issues.push({
          id: 'bone-stretch',
          severity: 'error',
          detail: `Bone ${o.name} non-uniform scale — causes mesh stretch. Fix with uniform root fit only.`,
        });
      }
    });
  } catch {
    /* ignore */
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    heightM: h,
    minY,
    skeleton,
    unitKind: h >= 70 && h <= 250 ? 'x100' : 'ok',
  };
}
