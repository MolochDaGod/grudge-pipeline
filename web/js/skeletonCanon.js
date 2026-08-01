/**
 * Canonical skeleton SSOT for grudge-pipeline + fleet games.
 *
 * Two production families only:
 *   - bip001   — grudge6 / Toon RTS modular race kits (WK_/BRB_/ELF_/…)
 *   - mixamo   — Mixamo / Quaternius explorer / many marketplace packs
 *
 * NEVER retarget mixamorig tracks onto Bip001 (or reverse) without rematch.
 * NEVER non-uniform scale bones to "fix" height — fit whole model SI only.
 *
 * @see characterDeploy.js · grudge-character-correctness · docs/SKELETON_AND_FEET.md
 */

/** @typedef {'pelvis'|'spine'|'head'|'leftHand'|'rightHand'|'leftFoot'|'rightFoot'|'leftToe'|'rightToe'} BoneRole */

/**
 * Ordered name patterns per role (first match wins). Case-insensitive.
 * @type {Record<string, Record<BoneRole, RegExp[]>>}
 */
export const SKELETON_PATTERNS = {
  bip001: {
    pelvis: [/^bip001\s*pelvis$/i, /bip001.*pelvis/i, /^pelvis$/i],
    spine: [/bip001\s*spine/i, /^spine\d*$/i],
    head: [/bip001\s*head$/i, /^head$/i],
    leftHand: [/bip001\s*l\s*hand$/i, /l\s*hand$/i, /hand_l/i],
    rightHand: [/bip001\s*r\s*hand$/i, /r\s*hand$/i, /hand_r/i],
    leftFoot: [/bip001\s*l\s*foot$/i, /l\s*foot$/i, /foot_l/i],
    rightFoot: [/bip001\s*r\s*foot$/i, /r\s*foot$/i, /foot_r/i],
    leftToe: [/bip001\s*l\s*toe/i, /l\s*toe/i],
    rightToe: [/bip001\s*r\s*toe/i, /r\s*toe/i],
  },
  mixamo: {
    pelvis: [/mixamorig:?hips$/i, /^hips$/i, /pelvis/i],
    spine: [/mixamorig:?spine/i, /^spine/i],
    head: [/mixamorig:?head$/i, /^head$/i],
    leftHand: [/mixamorig:?lefthand$/i, /lefthand/i],
    rightHand: [/mixamorig:?righthand$/i, /righthand/i],
    leftFoot: [/mixamorig:?leftfoot$/i, /leftfoot/i],
    rightFoot: [/mixamorig:?rightfoot$/i, /rightfoot/i],
    leftToe: [/mixamorig:?lefttoebase/i, /lefttoe/i],
    rightToe: [/mixamorig:?righttoebase/i, /righttoe/i],
  },
};

/**
 * Classify a model’s skeleton family from bone names.
 * @param {import('three').Object3D} root
 * @returns {'bip001'|'mixamo'|'unknown'}
 */
export function classifySkeleton(root) {
  let bip = 0;
  let mix = 0;
  root.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name || '';
    if (/bip001/i.test(n)) bip++;
    if (/mixamorig/i.test(n)) mix++;
  });
  if (bip > mix && bip >= 3) return 'bip001';
  if (mix > bip && mix >= 3) return 'mixamo';
  if (bip > 0) return 'bip001';
  if (mix > 0) return 'mixamo';
  return 'unknown';
}

/**
 * Find a bone by logical role for a known (or auto) family.
 * @param {import('three').Object3D} root
 * @param {BoneRole} role
 * @param {'bip001'|'mixamo'|'auto'} [family='auto']
 * @returns {import('three').Bone|null}
 */
export function findBoneByRole(root, role, family = 'auto') {
  const fam = family === 'auto' ? classifySkeleton(root) : family;
  const patterns =
    (SKELETON_PATTERNS[fam] && SKELETON_PATTERNS[fam][role]) ||
    SKELETON_PATTERNS.mixamo[role] ||
    [];
  /** @type {import('three').Bone[]} */
  const hits = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    for (const re of patterns) {
      if (re.test(o.name)) {
        hits.push(o);
        break;
      }
    }
  });
  if (!hits.length) return null;
  // Prefer shorter / more exact names (Foot over Foot_End)
  hits.sort((a, b) => a.name.length - b.name.length);
  return hits[0];
}

/**
 * List all bone names (debug / UI).
 * @param {import('three').Object3D} root
 */
export function listBoneNames(root) {
  const names = [];
  root.traverse((o) => {
    if (o.isBone && o.name) names.push(o.name);
  });
  return names;
}

/**
 * Skeleton truth for grudge6 / Mixamo.
 * Multipack kits often leave **duplicate Bone objects** in the graph (same Bip001
 * name 3×) → naive traverse shows ~192 "bones". Truth = **unique names**.
 *
 * - grudge6 / Toon RTS = **Bip001** (typically ~40–80 unique, not Mixamo 25)
 * - Mixamo clips = ~25 bones (mixamorig*) — retarget onto Bip001, never load as kit
 *
 * @returns {{
 *   bip001: number,
 *   mixamo: number,
 *   other: number,
 *   unique: number,
 *   objects: number,
 *   family: 'bip001'|'mixamo'|'mixed'|'unknown',
 *   ok: boolean,
 *   detail: string,
 * }}
 */
export function skeletonTruth(root) {
  const bip = new Set();
  const mix = new Set();
  const other = new Set();
  let objects = 0;
  if (root) {
    root.traverse((o) => {
      if (!o.isBone || !o.name) return;
      objects++;
      const n = o.name;
      if (/^bip001|bip001[\s_]/i.test(n) || /bip001/i.test(n)) bip.add(n);
      else if (/mixamorig/i.test(n)) mix.add(n);
      else other.add(n);
    });
  }
  const unique = bip.size + mix.size + other.size;
  let family = 'unknown';
  if (bip.size >= 3 && mix.size >= 3) family = 'mixed';
  else if (bip.size >= 3) family = 'bip001';
  else if (mix.size >= 3) family = 'mixamo';
  // OK: Bip001 unique in band; object count may be higher (shared skins)
  const ok =
    family === 'bip001' &&
    bip.size >= 20 &&
    bip.size <= 120 &&
    mix.size === 0;
  const detail =
    `Bip001 ${bip.size} unique · Mixamo ${mix.size} · other ${other.size} · ` +
    `scene objects ${objects}` +
    (objects > unique * 1.5
      ? ` (⚠ ${objects - unique} duplicate bone objects — multipack soup)`
      : '') +
    (family === 'mixamo'
      ? ' · WRONG: Mixamo kit — use grudge6 Bip001 races/*'
      : family === 'mixed'
        ? ' · WRONG: mixed Bip001+Mixamo'
        : '');
  return {
    bip001: bip.size,
    mixamo: mix.size,
    other: other.size,
    unique,
    objects,
    family,
    ok,
    detail,
  };
}

/**
 * Deploy gate: does this skinned character have the bones we need?
 * @param {import('three').Object3D} root
 * @param {{ requireHands?: boolean, requireFeet?: boolean }} [opts]
 */
export function skeletonDeployGate(root, opts = {}) {
  const requireHands = opts.requireHands !== false;
  const requireFeet = opts.requireFeet !== false;
  const family = classifySkeleton(root);
  const errors = [];
  const warnings = [];

  if (family === 'unknown') {
    warnings.push('Unknown skeleton family — not bip001 or mixamo');
  }

  const pelvis = findBoneByRole(root, 'pelvis', family === 'unknown' ? 'auto' : family);
  if (!pelvis) errors.push('Missing pelvis/hips bone (required for deploy)');

  if (requireHands) {
    if (!findBoneByRole(root, 'leftHand', family)) warnings.push('Missing left hand bone');
    if (!findBoneByRole(root, 'rightHand', family)) warnings.push('Missing right hand bone');
  }
  if (requireFeet) {
    if (!findBoneByRole(root, 'leftFoot', family)) errors.push('Missing left foot bone (feet IK / ground)');
    if (!findBoneByRole(root, 'rightFoot', family)) errors.push('Missing right foot bone (feet IK / ground)');
  }

  return {
    family,
    ok: errors.length === 0,
    errors,
    warnings,
    pelvis: pelvis?.name || null,
    leftFoot: findBoneByRole(root, 'leftFoot', family)?.name || null,
    rightFoot: findBoneByRole(root, 'rightFoot', family)?.name || null,
    leftHand: findBoneByRole(root, 'leftHand', family)?.name || null,
    rightHand: findBoneByRole(root, 'rightHand', family)?.name || null,
  };
}

/**
 * HARD: never non-uniform scale a bone to fix height (causes mesh stretch).
 * Only root/model uniform scale via fitCharacterHeight / enforceCharacterSi.
 */
export function assertNoBoneScaleHacks(root) {
  const bad = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    const s = o.scale;
    if (Math.abs(s.x - 1) > 0.02 || Math.abs(s.y - 1) > 0.02 || Math.abs(s.z - 1) > 0.02) {
      if (Math.abs(s.x - s.y) > 0.02 || Math.abs(s.y - s.z) > 0.02) {
        bad.push(`${o.name} non-uniform scale ${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)}`);
      }
    }
  });
  return { ok: bad.length === 0, bad };
}
