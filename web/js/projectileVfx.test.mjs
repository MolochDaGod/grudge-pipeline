/**
 * Node smoke: node web/js/projectileVfx.test.mjs
 */
import {
  inferProjectileSubtype,
  PROJECTILE_SUBTYPE_REF,
  projectileImportSnippet,
  projectileRuntimeChecks,
  scoreCombatCoverage,
  isProjectileOrCombatVfx,
} from './projectileVfx.js';
import {
  inferAssetKind,
  getDeployProfile,
  computeDeployScale,
  runDeployChecks,
} from './deployChecks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── Subtype inference ──────────────────────────────────────────────────────
assert(inferProjectileSubtype({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' }) === 'arrow', 'arrow');
assert(inferProjectileSubtype({ name: 'shell_ballista', path: 'models/shells/shell_ballista.glb' }) === 'bolt', 'bolt');
assert(inferProjectileSubtype({ name: 'musket_bullet', path: 'models/projectiles/bullet.glb' }) === 'bullet', 'bullet');
assert(inferProjectileSubtype({ name: 'cannonball_01', path: 'models/naval/cannonball_01.glb' }) === 'cannonball', 'cannon');
assert(inferProjectileSubtype({ name: 'frag_grenade', path: 'models/weapons/grenade.glb' }) === 'explosive', 'grenade');
assert(inferProjectileSubtype({ name: 'fireball', path: 'models/vfx/fireball.glb' }) === 'magic_orb', 'orb');
assert(inferProjectileSubtype({ name: 'impact_blast', path: 'models/vfx/impacts/blast.glb' }) === 'impact', 'impact');
assert(inferProjectileSubtype({ name: 'flame_trail', path: 'models/vfx/projectiles/trail.glb' }) === 'trail', 'trail');

// ── Kind + profile bands ───────────────────────────────────────────────────
assert(inferAssetKind({ name: 'cannonball', path: 'models/naval/cannonball.glb' }) === 'projectile', 'kind cannon');
assert(inferAssetKind({ name: 'frag_grenade', path: 'models/weapons/grenade.glb' }) === 'projectile', 'kind grenade');
assert(inferAssetKind({ name: 'musket_bullet', path: 'models/projectiles/bullet.glb' }) === 'projectile', 'kind bullet');

const arrowProf = getDeployProfile({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' });
assert(arrowProf.kind === 'projectile', 'arrow profile kind');
assert(arrowProf.subtype === 'arrow', 'arrow subtype on profile');
assert(arrowProf.okRange[0] >= 0.4 && arrowProf.okRange[1] <= 1.1, 'arrow band');

const bulletProf = getDeployProfile({ name: 'musket_bullet', path: 'models/projectiles/bullet.glb' });
assert(bulletProf.subtype === 'bullet', 'bullet subtype');
assert(bulletProf.okRange[1] <= 0.15, 'bullet tiny band');

const ballProf = getDeployProfile({ name: 'cannonball', path: 'models/naval/cannonball.glb' });
assert(ballProf.subtype === 'cannonball', 'cannon subtype');
assert(ballProf.okRange[0] >= 0.1, 'cannon min');

// Arrow 0.7 m OK — not scaled to human
const sArrow = computeDeployScale(0.7, arrowProf);
assert(Math.abs(sArrow.scale - 1) < 1e-6, 'arrow no rescale');
assert(!sArrow.normalized, 'arrow not normalized to human');

// Bullet 0.02 m OK
const sBullet = computeDeployScale(0.02, bulletProf);
assert(Math.abs(sBullet.scale - 1) < 1e-6 || sBullet.afterM < 0.1, 'bullet stays tiny');

// Character-scale arrow fails runtime check
const rtBad = projectileRuntimeChecks({ name: '_arrow_x', path: 'x_arrow_y.glb' }, 1.8);
assert(rtBad.checks.some((c) => c.status === 'fail'), '1.8m arrow fails');

const rtOk = projectileRuntimeChecks({ name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' }, 0.7);
assert(rtOk.subtype === 'arrow', 'rt subtype');
assert(rtOk.checks.some((c) => c.id === 'proj-si' && c.status === 'ok'), 'rt si ok');

// Deploy report includes subtype checks
const report = runDeployChecks({
  entry: { name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' },
  profile: arrowProf,
  measure: 0.7,
  size: { x: 0.04, y: 0.7, z: 0.04 },
  minY: -0.35,
  pelvis: null,
  handR: null,
  handL: null,
  bones: [],
  mats: { mats: 1, withMap: 1, brokenMaps: 0 },
});
assert(report.checks.some((c) => c.id === 'proj-subtype'), 'report has subtype');
assert(report.checks.some((c) => c.id === 'proj-combat'), 'report has combat contract');

// Snippet is game-ready
const snip = projectileImportSnippet({
  name: '_arrow_b_1',
  path: 'models/weapons/bow/_arrow_b_1.glb',
  cdnUrl: 'https://assets.grudge-studio.com/models/weapons/bow/_arrow_b_1.glb',
  grudgeUuid: 'test-uuid',
});
assert(snip.includes('subtype: arrow'), 'snippet subtype');
assert(snip.includes('NEVER'), 'snippet never human');
assert(snip.includes('pool'), 'snippet pool');
assert(snip.includes('IMPACT') || snip.includes('impact'), 'snippet impact');

// Coverage scorer
const score = scoreCombatCoverage([
  { name: '_arrow_b_1', path: 'models/weapons/bow/_arrow_b_1.glb' },
  { name: 'cannonball', path: 'models/naval/cannonball.glb' },
]);
assert(score.track === 'combat', 'score track');
assert(score.total > 0, 'score total');
assert(score.covered >= 1, 'at least one covered');
assert(score.runtime >= 1, 'runtime packages');

assert(isProjectileOrCombatVfx({ path: 'models/vfx/projectiles/wod_parts.glb' }), 'is combat vfx');

// Ref table complete
for (const k of ['arrow', 'bolt', 'bullet', 'cannonball', 'explosive', 'magic_orb', 'trail', 'impact']) {
  assert(PROJECTILE_SUBTYPE_REF[k], `ref ${k}`);
  assert(Array.isArray(PROJECTILE_SUBTYPE_REF[k].ok), `ok band ${k}`);
}

console.log('projectileVfx.test.mjs: all passed');
