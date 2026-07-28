/**
 * Category-aware deploy checks — human-relative SI world scale.
 *
 * Yardstick: HUMAN_HEIGHT_M = 1.8 m (average adult). All kinds report
 * metres and human-multiples so the panel knows what it's looking at.
 *
 * @see worldScale.js
 * @see characterDeploy.js
 */
import {
  HUMAN_HEIGHT_M,
  WORLD_REFERENCE_M,
  WORLD_SIZE_BANDS,
  computeWorldScale,
  humanRelativeLabel,
  diagnoseUnitScale,
} from './worldScale.js';
import {
  inferProjectileSubtype,
  projectileRuntimeChecks,
  PROJECTILE_SUBTYPE_REF,
} from './projectileVfx.js';

export { HUMAN_HEIGHT_M, humanRelativeLabel, diagnoseUnitScale, computeWorldScale };
export { inferProjectileSubtype, projectileRuntimeChecks, PROJECTILE_SUBTYPE_REF };

/**
 * @typedef {'character'|'creature'|'weapon'|'projectile'|'prop'|'buildable'|'building'|'boat'|'vehicle'|'island'|'town'|'environment'|'harvest'|'animation'|'vfx'|'ui'|'other'} AssetKind
 */

/**
 * @typedef {object} DeployProfile
 * @property {AssetKind} kind
 * @property {string} label
 * @property {'height'|'longest'} scaleAxis
 * @property {number|null} targetMeters
 * @property {[number, number]} okRange
 * @property {[number, number]} warnRange
 * @property {boolean} normalizeToTarget
 * @property {boolean} unitFixCm
 * @property {number} expectedM  reference for 100× detection
 * @property {'feet'|'bottom'|'center'} ground
 * @property {boolean} requirePelvis
 * @property {boolean} requireHands
 * @property {boolean} requireBones
 * @property {boolean} requireTexture
 * @property {string} physicsLayer
 * @property {string[]} scriptHints
 * @property {string[]} notes
 */

function band(kind) {
  return WORLD_SIZE_BANDS[kind] || WORLD_SIZE_BANDS.other;
}
function ref(kind) {
  return WORLD_REFERENCE_M[kind] || WORLD_REFERENCE_M.other;
}

/** @type {Record<string, DeployProfile>} */
export const DEPLOY_PROFILES = {
  character: {
    kind: 'character',
    label: 'Character / hero',
    scaleAxis: 'height',
    targetMeters: HUMAN_HEIGHT_M,
    expectedM: ref('character').expectedM,
    okRange: band('character').ok,
    warnRange: band('character').warn,
    normalizeToTarget: true,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: true,
    requireHands: true,
    requireBones: true,
    requireTexture: true,
    physicsLayer: 'Player',
    scriptHints: ['player-rpg', 'AnimationDirector'],
    notes: [
      `World yardstick: human = ${HUMAN_HEIGHT_M} m`,
      'Y-up, feet y=0, art-forward +Z',
      'Convert: --height 1.7 --cm-to-m',
    ],
  },
  creature: {
    kind: 'creature',
    label: 'Creature / beast',
    scaleAxis: 'height',
    targetMeters: null,
    expectedM: ref('creature').expectedM,
    okRange: band('creature').ok,
    warnRange: band('creature').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: false,
    requireHands: false,
    requireBones: true,
    requireTexture: true,
    physicsLayer: 'NPC',
    scriptHints: ['enemy-rpg', 'nav-agent'],
    notes: ['Sized vs human — wolf ~0.7 m, horse ~1.6 m at withers, troll multi-human'],
  },
  weapon: {
    kind: 'weapon',
    label: 'Held weapon',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('weapon').expectedM,
    okRange: band('weapon').ok,
    warnRange: band('weapon').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Item',
    scriptHints: ['hand bone attach'],
    notes: ['Sword ~1 m — never character-fit to 1.8 m'],
  },
  projectile: {
    kind: 'projectile',
    label: 'Projectile (arrow / bolt / shell / bullet / cannon / explosive)',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('projectile').expectedM,
    okRange: band('projectile').ok,
    warnRange: band('projectile').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'center',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Projectile',
    scriptHints: [
      'layer Projectile',
      'CCD',
      'object pool',
      'damage on impact',
      'subtype SI bands',
    ],
    notes: [
      'Arrow ~0.45–1.0 m · bolt ~0.5–1.2 m · bullet << 0.08 m · cannonball ~0.12–0.55 m',
      'Explosive / grenade ~0.08–0.45 m · magic orb ~0.12–0.8 m',
      'NEVER fit any projectile to 1.8 m human height',
      'See docs/PROJECTILES_AND_VFX.md + projectileVfx.js',
    ],
  },
  prop: {
    kind: 'prop',
    label: 'Prop / furniture / crate',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('prop').expectedM,
    okRange: band('prop').ok,
    warnRange: band('prop').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Default',
    scriptHints: ['pickup-trigger'],
    notes: ['Crate ~0.5–1 m; barrel ~0.9 m; must match human reach'],
  },
  buildable: {
    kind: 'buildable',
    label: 'Buildable / placeable structure',
    scaleAxis: 'height',
    targetMeters: null,
    expectedM: ref('buildable').expectedM,
    okRange: band('buildable').ok,
    warnRange: band('buildable').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['snap grid 1 m', 'kenney-build'],
    notes: ['Walls ~2.5–3.5 m (door fits human); foundation tiles 1–2 m'],
  },
  building: {
    kind: 'building',
    label: 'Building / house / tower',
    scaleAxis: 'height',
    targetMeters: null,
    expectedM: ref('building').expectedM,
    okRange: band('building').ok,
    warnRange: band('building').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['navmesh', 'surface Walk'],
    notes: [
      '1-storey ~3–4 m (≈2 humans); 2-storey ~6–8 m; tower multi-storey',
      'Door clear height ≥ 2.0 m so 1.8 m human walks through',
    ],
  },
  boat: {
    kind: 'boat',
    label: 'Boat / ship',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('boat').expectedM,
    okRange: band('boat').ok,
    warnRange: band('boat').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Default',
    scriptHints: ['water layer', 'float Y'],
    notes: ['Rowboat ~4–6 m LOA; coastal ship ~20–40 m; deck height vs human rail'],
  },
  vehicle: {
    kind: 'vehicle',
    label: 'Vehicle / cart / siege',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('vehicle').expectedM,
    okRange: band('vehicle').ok,
    warnRange: band('vehicle').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Default',
    scriptHints: ['siege / mount'],
    notes: ['Cart ~3–4 m; catapult base ~3–5 m; wheel height ~1 m'],
  },
  island: {
    kind: 'island',
    label: 'Island / zone terrain',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('island').expectedM,
    okRange: band('island').ok,
    warnRange: band('island').warn,
    normalizeToTarget: false,
    unitFixCm: false,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['heightfield', 'sector'],
    notes: ['Hundreds of metres; human is a speck — do NOT fit to 1.8 m'],
  },
  town: {
    kind: 'town',
    label: 'Town / block / encampment',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('town_block').expectedM,
    okRange: band('town').ok,
    warnRange: band('town').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['navmesh', 'spawn points'],
    notes: ['Streets ≥ 3–4 m wide; blocks tens of metres'],
  },
  environment: {
    kind: 'environment',
    label: 'Environment / nature / large set',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('environment').expectedM,
    okRange: band('environment').ok,
    warnRange: band('environment').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['navmesh'],
    notes: ['Trees 5–25 m; cliffs large — size vs human silhouette'],
  },
  harvest: {
    kind: 'harvest',
    label: 'Harvest node / ore / rock / tree / debris',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('harvest').expectedM,
    okRange: band('harvest').ok,
    warnRange: band('harvest').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Default',
    scriptHints: [
      'home-island harvest',
      'pinata break',
      'tool gate axe|pickaxe',
      'Rapier fragment optional',
    ],
    notes: [
      'Trees ~6–12 m; rocks ~0.8–2.5 m; ore veins similar; debris ~0.3–0.6 m',
      'Never character-fit to 1.8 m',
      'Pinata needs manifold proxy (icosphere/cylinder) for shatter',
      'Network: damage + loot only — no fragment meshes',
    ],
  },
  animation: {
    kind: 'animation',
    label: 'Animation (preview on human host)',
    scaleAxis: 'height',
    targetMeters: HUMAN_HEIGHT_M,
    expectedM: HUMAN_HEIGHT_M,
    okRange: band('animation').ok,
    warnRange: band('animation').warn,
    normalizeToTarget: true,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: true,
    requireHands: false,
    requireBones: true,
    requireTexture: false,
    physicsLayer: 'IgnoreRaycast',
    scriptHints: ['play on grudge6 kit'],
    notes: ['Host must be 1.8 m human scale'],
  },
  vfx: {
    kind: 'vfx',
    label: 'VFX mesh',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('vfx').expectedM,
    okRange: band('vfx').ok,
    warnRange: band('vfx').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'center',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: false,
    physicsLayer: 'IgnoreRaycast',
    scriptHints: ['spawn_vfx'],
    notes: ['Design scale; report human-relative for AoE readability'],
  },
  ui: {
    kind: 'ui',
    label: 'UI / 2D',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: ref('ui').expectedM,
    okRange: band('ui').ok,
    warnRange: band('ui').warn,
    normalizeToTarget: false,
    unitFixCm: false,
    ground: 'center',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'UI3D',
    scriptHints: [],
    notes: [],
  },
  other: {
    kind: 'other',
    label: 'Unclassified',
    scaleAxis: 'longest',
    targetMeters: null,
    expectedM: 2,
    okRange: band('other').ok,
    warnRange: band('other').warn,
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: false,
    physicsLayer: 'Default',
    scriptHints: [],
    notes: ['Classify kind so 100× / human-relative checks apply'],
  },
};

/**
 * @param {object} m
 * @returns {AssetKind}
 */
export function inferAssetKind(m) {
  if (!m) return 'other';
  const c = `${m.category || ''} ${m.group || ''} ${m.path || ''} ${m.name || ''} ${m.kind || ''}`.toLowerCase();

  if (m.isBakedClip || c.includes('/anims/') || c.includes('animation') || m.scaleProfile === 'animation_clip') {
    return 'animation';
  }
  if (
    /(?:^|[\s/_-])arrow(?:s)?(?:$|[\s/_-])/.test(c) ||
    c.includes('_arrow_') ||
    c.includes('projectile') ||
    c.includes('shell_arrow') ||
    c.includes('shell_ballista') ||
    c.includes('shell_cannon') ||
    c.includes('crossbow_bolt') ||
    c.includes('cannonball') ||
    c.includes('cannon_ball') ||
    c.includes('grenade') ||
    c.includes('explosive') ||
    (c.includes('bullet') && !c.includes('bulletin')) ||
    c.includes('musket_ball') ||
    c.includes('ballista') ||
    c.includes('fireball') ||
    c.includes('magic_orb') ||
    c.includes('/vfx/projectiles')
  ) {
    return 'projectile';
  }
  // Home-island harvest before generic weapon/environment
  // (axe as tool still weapon; harvest_* debris / ore / stump are harvest)
  if (
    c.includes('harvest_') ||
    c.includes('/harvest/') ||
    c.includes('harvest-logs') ||
    c.includes('harvest_logs') ||
    c.includes('harvest_rock') ||
    c.includes('harvest_stump') ||
    c.includes('ore_node') ||
    c.includes('ore-node') ||
    c.includes('gold_rock') ||
    c.includes('goldrock') ||
    c.includes('rock_debris') ||
    c.includes('pinata') ||
    (c.includes('ore') && (c.includes('node') || c.includes('vein') || c.includes('crystal'))) ||
    c.includes('commontree') ||
    c.includes('pebble_round') ||
    c.includes('pebble_') ||
    (c.includes('naturedecor') && (c.includes('tree') || c.includes('rock') || c.includes('pebble')))
  ) {
    return 'harvest';
  }
  if (
    c.includes('weapon') ||
    c.includes('sword') ||
    c.includes('axe') ||
    c.includes('dagger') ||
    c.includes('shield') ||
    c.includes('pickaxe') ||
    c.includes('hatchet') ||
    (c.includes('bow') && !c.includes('arrow'))
  ) {
    return 'weapon';
  }
  if (c.includes('island') || c.includes('archipelago') || c.includes('zone_terrain')) {
    return 'island';
  }
  if (c.includes('town') || c.includes('village') || c.includes('encampment') || c.includes('city_block')) {
    return 'town';
  }
  if (
    c.includes('boat') ||
    c.includes('ship') ||
    c.includes('vessel') ||
    c.includes('galley') ||
    c.includes('sloop')
  ) {
    return 'boat';
  }
  if (
    c.includes('cart') ||
    c.includes('wagon') ||
    c.includes('vehicle') ||
    c.includes('catapult') ||
    c.includes('siege') ||
    c.includes('boltthrower')
  ) {
    return 'vehicle';
  }
  if (
    c.includes('buildable') ||
    c.includes('placeable') ||
    c.includes('foundation') ||
    c.includes('wall_piece') ||
    c.includes('kenney') ||
    c.includes('prototype_kit')
  ) {
    return 'buildable';
  }
  if (
    c.includes('building') ||
    c.includes('house') ||
    c.includes('tower') ||
    c.includes('fortress') ||
    c.includes('castle') ||
    c.includes('barn') ||
    c.includes('church') ||
    c.includes('keep')
  ) {
    return 'building';
  }
  if (
    c.includes('character') ||
    c.includes('grudge6/races') ||
    c.includes('hero') ||
    /\/races\//.test(c) ||
    c.includes('_characters')
  ) {
    return 'character';
  }
  if (c.includes('creature') || c.includes('monster') || c.includes('animal') || c.includes('mount') || c.includes('horse')) {
    return 'creature';
  }
  if (
    c.includes('environment') ||
    c.includes('terrain') ||
    c.includes('nature') ||
    c.includes('tree') ||
    c.includes('rock') ||
    c.includes('cliff')
  ) {
    return 'environment';
  }
  if (c.includes('vfx') || c.includes('effect') || c.includes('fx/')) return 'vfx';
  if (c.includes('prop') || c.includes('crate') || c.includes('furniture') || c.includes('barrel')) {
    return 'prop';
  }
  if (c.includes('ui/') || c.includes('icon')) return 'ui';
  if (m.kind && DEPLOY_PROFILES[m.kind]) return /** @type {AssetKind} */ (m.kind);
  return 'other';
}

/**
 * Map projectile subtype → worldScale reference key.
 * @param {string} subtype
 */
function projectileRefKey(subtype) {
  switch (subtype) {
    case 'arrow':
      return 'projectile_arrow';
    case 'bolt':
      return 'projectile_bolt';
    case 'bullet':
      return 'projectile_bullet';
    case 'cannonball':
      return 'projectile_cannonball';
    case 'explosive':
      return 'projectile_explosive';
    case 'magic_orb':
      return 'projectile_orb';
    default:
      return 'projectile';
  }
}

export function getDeployProfile(entry) {
  const kind = inferAssetKind(entry);
  const base = { ...(DEPLOY_PROFILES[kind] || DEPLOY_PROFILES.other) };
  if (kind === 'projectile' || kind === 'vfx') {
    const subtype = inferProjectileSubtype(entry);
    const sub = PROJECTILE_SUBTYPE_REF[subtype];
    if (sub && (kind === 'projectile' || subtype === 'trail' || subtype === 'impact')) {
      const refKey = projectileRefKey(subtype);
      const r = WORLD_REFERENCE_M[refKey] || WORLD_REFERENCE_M.projectile;
      const b = WORLD_SIZE_BANDS[refKey] || WORLD_SIZE_BANDS.projectile;
      base.expectedM = r.expectedM;
      base.okRange = b.ok;
      base.warnRange = b.warn;
      base.label = `${base.label} · ${sub.label}`;
      base.subtype = subtype;
      base.notes = [...(base.notes || []), sub.notes];
      base.scriptHints = [
        ...(base.scriptHints || []),
        `subtype:${subtype}`,
        sub.parryable ? 'parryable' : 'not-parryable',
        sub.gravity ? 'ballistic-gravity' : 'straight-line',
      ];
      if (subtype === 'trail' || subtype === 'impact') {
        base.physicsLayer = 'IgnoreRaycast';
        base.requireTexture = false;
      }
    }
  }
  return base;
}

export function measureSize(size, profile) {
  if (profile.scaleAxis === 'height') return size.y || 0;
  return Math.max(size.x || 0, size.y || 0, size.z || 0);
}

/**
 * Uniform scale for deploy — uses worldScale 100× detection.
 * Unit decade is NEVER limited to 12× (that broke 100× correction).
 */
export function computeDeployScale(measure, profile) {
  const result = computeWorldScale(measure, {
    expectedM: profile.expectedM || HUMAN_HEIGHT_M,
    targetM: profile.targetMeters,
    normalizeToTarget: !!profile.normalizeToTarget,
    okRange: profile.okRange,
    maxFitClamp: 12,
    minFitClamp: 0.02,
  });
  return {
    scale: result.scale,
    reason: result.reason,
    unitFixed: result.unitScale !== 1,
    normalized: result.normalized,
    unitKind: result.unitKind,
    afterM: result.afterM,
    humanLabel: result.humanLabel,
    ratio: result.ratio,
  };
}

export function bandStatus(value, okRange, warnRange) {
  if (value >= okRange[0] && value <= okRange[1]) return 'ok';
  if (value >= warnRange[0] && value <= warnRange[1]) return 'warn';
  return 'fail';
}

/**
 * @param {object} opts
 */
export function runDeployChecks(opts) {
  const {
    entry,
    profile,
    measure,
    size,
    minY,
    pelvis,
    handR,
    handL,
    bones = [],
    mats = {},
    scaleReason = '',
    unitFixed = false,
    normalized = false,
    unitKind = '',
    humanLabel = '',
  } = opts;

  /** @type {{ id: string, label: string, status: string, detail: string }[]} */
  const checks = [];

  checks.push({
    id: 'yardstick',
    label: 'World yardstick',
    status: 'info',
    detail: `1 unit = 1 m · human = ${HUMAN_HEIGHT_M} m · SI only`,
  });

  checks.push({
    id: 'kind',
    label: 'Category',
    status: profile.kind === 'other' ? 'warn' : 'ok',
    detail: `${profile.label} (${profile.kind}) · expected ~${profile.expectedM} m`,
  });

  const sizeStatus = bandStatus(measure, profile.okRange, profile.warnRange);
  const axisLabel = profile.scaleAxis === 'height' ? 'height' : 'longest edge';
  const humans = measure / HUMAN_HEIGHT_M;
  checks.push({
    id: 'scale',
    label: `Scale (${axisLabel})`,
    status: sizeStatus,
    detail:
      `${measure.toFixed(3)} m = ${humans.toFixed(2)}× human · ok ${profile.okRange[0]}–${profile.okRange[1]} m` +
      (profile.targetMeters ? ` · target ${profile.targetMeters} m` : ' · no force-to-human') +
      (scaleReason ? ` · ${scaleReason}` : '') +
      (humanLabel ? ` · ${humanLabel}` : ''),
  });

  // Explicit 100× detector report
  const unitDiag = diagnoseUnitScale(measure, profile.expectedM || HUMAN_HEIGHT_M);
  if (unitKind === 'x100' || unitDiag.kind === 'x100') {
    checks.push({
      id: 'unit-100x',
      label: '100× unit error',
      status: unitFixed || Math.abs(unitDiag.unitScale - 1) < 1e-9 ? 'warn' : 'fail',
      detail: unitDiag.detail,
    });
  } else if (unitDiag.kind !== 'ok' && unitDiag.unitScale !== 1) {
    checks.push({
      id: 'unit-scale',
      label: 'Unit scale',
      status: unitFixed ? 'warn' : 'fail',
      detail: unitDiag.detail,
    });
  } else {
    checks.push({
      id: 'unit-scale',
      label: 'Unit scale',
      status: 'ok',
      detail: unitDiag.detail || 'SI metres',
    });
  }

  if (profile.kind === 'projectile' || profile.kind === 'vfx') {
    const runtime = projectileRuntimeChecks(entry || { kind: profile.kind }, measure);
    for (const c of runtime.checks) checks.push(c);
  }

  if (profile.kind === 'projectile' && measure > 1.5 && profile.subtype !== 'impact' && profile.subtype !== 'trail') {
    checks.push({
      id: 'scale-projectile-oversized',
      label: 'Projectile size',
      status: 'fail',
      detail: `${measure.toFixed(2)} m is character-scale — use subtype SI bands (arrow ~0.6–0.9 m). Never fit to ${HUMAN_HEIGHT_M} m.`,
    });
  }

  if (normalized && (profile.kind === 'weapon' || profile.kind === 'projectile' || profile.kind === 'building' || profile.kind === 'boat' || profile.kind === 'island')) {
    checks.push({
      id: 'bad-normalize',
      label: 'Normalize policy',
      status: 'fail',
      detail: `${profile.kind} must not be height-normalized to a hero. Use human-relative bands only.`,
    });
  }

  // Buildings: door human clearance heuristic on height
  if (profile.kind === 'building' && measure > 0 && measure < 2.0) {
    checks.push({
      id: 'building-too-short',
      label: 'Building height',
      status: 'fail',
      detail: `${measure.toFixed(2)} m tall — shorter than human (${HUMAN_HEIGHT_M} m). Check 100× / cm units.`,
    });
  }

  if (profile.ground === 'feet' || profile.ground === 'bottom') {
    const gOk = Math.abs(minY) < 0.08;
    const gWarn = Math.abs(minY) < 0.25;
    checks.push({
      id: 'ground',
      label: profile.ground === 'feet' ? 'Feet minY' : 'Bottom minY',
      status: gOk ? 'ok' : gWarn ? 'warn' : 'fail',
      detail: `${minY.toFixed(4)} (want ≈ 0)`,
    });
  } else {
    checks.push({
      id: 'ground',
      label: 'Grounding',
      status: 'info',
      detail: 'center spawn — feet-on-floor not required',
    });
  }

  if (profile.requireBones) {
    checks.push({
      id: 'bones',
      label: 'Skeleton',
      status: bones.length > 10 ? 'ok' : bones.length > 0 ? 'warn' : 'fail',
      detail: `${bones.length} bones`,
    });
  } else {
    checks.push({
      id: 'bones',
      label: 'Skeleton',
      status: 'na',
      detail: bones.length ? `${bones.length} bones (optional)` : 'not required',
    });
  }

  if (profile.requirePelvis) {
    checks.push({
      id: 'pelvis',
      label: 'Pelvis / hips',
      status: pelvis ? 'ok' : 'fail',
      detail: pelvis || 'missing Bip001 Pelvis',
    });
  }
  if (profile.requireHands) {
    const both = handR && handL;
    checks.push({
      id: 'hands',
      label: 'Hand bones',
      status: both ? 'ok' : handR || handL ? 'warn' : 'fail',
      detail: `R:${handR || '—'} · L:${handL || '—'}`,
    });
  }

  const withMap = mats.withMap ?? 0;
  const matCount = mats.mats ?? 0;
  if (profile.requireTexture) {
    let texStatus = 'fail';
    let texDetail = 'no maps';
    if (withMap > 0 && !(mats.brokenMaps > 0)) {
      texStatus = 'ok';
      texDetail = `${withMap}/${matCount} mapped`;
    } else if (mats.rebound > 0) {
      texStatus = 'warn';
      texDetail = `rebound ${mats.rebound} — re-bake for production`;
    }
    checks.push({ id: 'texture', label: 'Textures', status: texStatus, detail: texDetail });
  }

  checks.push({
    id: 'layer',
    label: 'Physics layer',
    status: 'info',
    detail: profile.physicsLayer,
  });

  if (profile.scriptHints.length) {
    checks.push({
      id: 'scripts',
      label: 'Script / runtime',
      status: 'info',
      detail: profile.scriptHints.join(' · '),
    });
  }

  if (entry?.grudgeUuid) {
    checks.push({
      id: 'uuid',
      label: 'grudgeUuid',
      status: entry.uuidStatus === 'ok' || entry.uuidStatus === 'derived' ? 'ok' : 'warn',
      detail: `${entry.grudgeUuid}`,
    });
  } else {
    checks.push({
      id: 'uuid',
      label: 'grudgeUuid',
      status: 'warn',
      detail: 'missing',
    });
  }

  for (const n of profile.notes) {
    checks.push({ id: `note-${n.slice(0, 16)}`, label: 'Best practice', status: 'info', detail: n });
  }

  const summary = {
    kind: profile.kind,
    label: profile.label,
    measure,
    humans: measure / HUMAN_HEIGHT_M,
    humanHeightM: HUMAN_HEIGHT_M,
    size: { x: size.x, y: size.y, z: size.z },
    axis: profile.scaleAxis,
    okRange: profile.okRange,
    expectedM: profile.expectedM,
    physicsLayer: profile.physicsLayer,
    unitFixed,
    unitKind,
    normalized,
    scaleReason,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    ok: checks.filter((c) => c.status === 'ok').length,
    pass: checks.filter((c) => c.status === 'fail').length === 0,
  };

  return { profile, checks, summary };
}

export function deployScore(summary) {
  if (!summary) return 0;
  let score = 40;
  score += Math.min(30, summary.ok * 5);
  score -= summary.warn * 5;
  score -= summary.fail * 15;
  if (summary.pass) score += 10;
  return Math.max(0, Math.min(100, score));
}
