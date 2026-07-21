/**
 * Node smoke test: node web/js/deployChecks.test.mjs
 */
import {
  inferAssetKind,
  getDeployProfile,
  computeDeployScale,
  measureSize,
  bandStatus,
  runDeployChecks,
} from './deployChecks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Arrows must be projectile, not weapon/character
assert(
  inferAssetKind({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' }) ===
    'projectile',
  'arrow kind',
);
assert(
  inferAssetKind({ name: 'Shell_Arrow_L1', path: 'models/battle_towers/Shell_Arrow_L1.glb' }) ===
    'projectile',
  'shell arrow kind',
);
assert(
  inferAssetKind({ name: 'bow_1', path: 'models/weapons/bow/bow_1.glb' }) === 'weapon',
  'bow is weapon',
);
assert(
  inferAssetKind({ name: 'WK_Characters', path: 'models/grudge6/races/WK_Characters.glb' }) ===
    'character',
  'character kind',
);

// Scale: 0.63 m arrow stays; never fit to 1.8
const proj = getDeployProfile({ kind: 'projectile' });
const s1 = computeDeployScale(0.63, proj);
assert(Math.abs(s1.scale - 1) < 1e-9, 'arrow 0.63 m no scale');
assert(!s1.normalized, 'arrow not normalized to hero');

// 63 cm arrow → 0.63 m
const s2 = computeDeployScale(63, proj);
assert(Math.abs(s2.scale - 0.01) < 1e-9, 'arrow cm→m');
assert(s2.unitFixed, 'unit fixed');

// Character 0.018 (raw) gets normalized toward 1.8 (clamped max 12×)
const char = getDeployProfile({ kind: 'character' });
const s3 = computeDeployScale(0.018, char);
assert(s3.normalized, 'character normalized');
assert(s3.scale >= 12 - 1e-9, 'tiny character scaled up (clamp 12)');

// measure longest vs height
assert(measureSize({ x: 0.02, y: 0.7, z: 0.02 }, proj) === 0.7, 'longest');
assert(measureSize({ x: 0.5, y: 1.8, z: 0.3 }, char) === 1.8, 'height');

assert(bandStatus(0.7, [0.2, 1.2], [0.08, 2]) === 'ok', 'ok band');
assert(bandStatus(1.8, [0.2, 1.2], [0.08, 2]) === 'warn', 'warn band for 1.8m arrow');
assert(bandStatus(3, [0.2, 1.2], [0.08, 2]) === 'fail', 'fail band');

const report = runDeployChecks({
  entry: { name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb', grudgeUuid: null },
  profile: proj,
  measure: 0.63,
  size: { x: 0.04, y: 0.63, z: 0.04 },
  minY: -0.3,
  pelvis: null,
  handR: null,
  handL: null,
  bones: [],
  mats: { mats: 1, withMap: 1, brokenMaps: 0 },
  scaleReason: 'author units kept',
  unitFixed: false,
  normalized: false,
});
assert(report.summary.kind === 'projectile', 'report kind');
assert(report.profile.physicsLayer === 'Projectile', 'layer');
const scaleCheck = report.checks.find((c) => c.id === 'scale');
assert(scaleCheck?.status === 'ok', 'scale ok for 0.63m arrow');
// pelvis not required
assert(!report.checks.some((c) => c.id === 'pelvis' && c.status === 'fail'), 'no pelvis fail');

// Bad: 1.8 m "arrow" from character-fit
const bad = runDeployChecks({
  entry: { name: '_arrow_b_1', path: 'weapons/bow/_arrow_b_1.glb' },
  profile: proj,
  measure: 1.8,
  size: { x: 0.1, y: 1.8, z: 0.1 },
  minY: 0,
  pelvis: null,
  handR: null,
  handL: null,
  bones: [],
  mats: { mats: 1, withMap: 0 },
  scaleReason: 'fit → 1.8 m',
  unitFixed: false,
  normalized: true,
});
assert(bad.summary.fail >= 1, '1.8m arrow fails checks');
assert(
  bad.checks.some((c) => c.id === 'scale-projectile-oversized' || c.id === 'bad-normalize'),
  'flags oversized projectile',
);

console.log('deployChecks.test.mjs: all passed');
