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
  HUMAN_HEIGHT_M,
} from './deployChecks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(HUMAN_HEIGHT_M === 1.8, 'human yardstick');

assert(
  inferAssetKind({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' }) ===
    'projectile',
  'arrow kind',
);
assert(inferAssetKind({ name: 'bow_1', path: 'models/weapons/bow/bow_1.glb' }) === 'weapon', 'bow');
assert(
  inferAssetKind({ name: 'WK_Characters', path: 'models/grudge6/races/WK_Characters.glb' }) ===
    'character',
  'character',
);
assert(inferAssetKind({ name: 'keep_tower', path: 'models/buildings/keep.glb' }) === 'building', 'building');
assert(inferAssetKind({ name: 'sloop', path: 'models/boats/sloop.glb' }) === 'boat', 'boat');
assert(inferAssetKind({ name: 'home_island', path: 'models/islands/home.glb' }) === 'island', 'island');
assert(inferAssetKind({ name: 'cannonball', path: 'models/naval/cannonball.glb' }) === 'projectile', 'cannonball kind');
assert(inferAssetKind({ name: 'frag_grenade', path: 'models/weapons/grenade.glb' }) === 'projectile', 'grenade kind');

const proj = getDeployProfile({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' });
assert(proj.subtype === 'arrow' || proj.kind === 'projectile', 'arrow profile');
const s1 = computeDeployScale(0.63, proj);
assert(Math.abs(s1.scale - 1) < 1e-9, 'arrow 0.63 m no scale');
assert(!s1.normalized, 'arrow not normalized');

// 100× human (cm as m) must fully correct
const char = getDeployProfile({ kind: 'character' });
const s100 = computeDeployScale(180, char);
assert(Math.abs(s100.scale - 0.01) < 1e-6 || Math.abs(s100.afterM - 1.8) < 0.15, `100× fix scale=${s100.scale} after=${s100.afterM}`);
assert(s100.unitFixed, 'unit fixed on 180');

const sTiny = computeDeployScale(0.018, char);
assert(sTiny.unitFixed || sTiny.normalized, 'tiny character unit/normalize');
assert(sTiny.afterM > 1.4 && sTiny.afterM < 2.5, `tiny → human ${sTiny.afterM}`);

assert(measureSize({ x: 0.02, y: 0.7, z: 0.02 }, proj) === 0.7, 'longest');
assert(bandStatus(0.7, [0.2, 1.2], [0.08, 2]) === 'ok', 'ok band');

const report = runDeployChecks({
  entry: { name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' },
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
});
assert(report.summary.kind === 'projectile', 'report kind');
assert(report.summary.humanHeightM === 1.8, 'summary yardstick');
assert(Math.abs(report.summary.humans - 0.63 / 1.8) < 0.01, 'humans ratio');

const bldg = getDeployProfile({ path: 'buildings/house.glb', name: 'house' });
assert(bldg.kind === 'building', 'house building');
assert(bldg.normalizeToTarget === false, 'building no force human height');

console.log('deployChecks.test.mjs: all passed');
