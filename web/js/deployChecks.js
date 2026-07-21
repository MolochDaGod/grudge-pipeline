/**
 * Category-aware deploy checks & scale rules for fleet assets.
 *
 * Characters use ~1.7–1.8 m height. Projectiles / arrows must NOT —
 * a 0.6–0.9 m shaft is correct. Each kind has its own best-practice
 * profile: scale axis, meter range, physics layer, scripts, bones, tex.
 */

/** @typedef {'character'|'creature'|'weapon'|'projectile'|'prop'|'environment'|'animation'|'vfx'|'ui'|'other'} AssetKind */

/**
 * @typedef {object} DeployProfile
 * @property {AssetKind} kind
 * @property {string} label
 * @property {'height'|'longest'} scaleAxis
 * @property {number|null} targetMeters  preferred size when normalizing (null = never force)
 * @property {[number, number]} okRange  green band in meters
 * @property {[number, number]} warnRange  yellow band; outside = fail
 * @property {boolean} normalizeToTarget  if true and size outside okRange, fit to targetMeters
 * @property {boolean} unitFixCm  if measure looks like cm (>> okRange), scale ×0.01
 * @property {'feet'|'bottom'|'center'} ground
 * @property {boolean} requirePelvis
 * @property {boolean} requireHands
 * @property {boolean} requireBones
 * @property {boolean} requireTexture
 * @property {string} physicsLayer  Forge / Rapier semantic layer
 * @property {string[]} scriptHints
 * @property {string[]} notes
 */

/** @type {Record<string, DeployProfile>} */
export const DEPLOY_PROFILES = {
  character: {
    kind: 'character',
    label: 'Character / hero',
    scaleAxis: 'height',
    targetMeters: 1.8,
    okRange: [1.55, 2.05],
    warnRange: [1.4, 2.4],
    normalizeToTarget: true,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: true,
    requireHands: true,
    requireBones: true,
    requireTexture: true,
    physicsLayer: 'Player',
    scriptHints: ['player-rpg', 'player-deathmatch', 'AnimationDirector gait'],
    notes: [
      'Y-up, feet on y=0, art-forward +Z',
      'Bip001 pelvis / hands for equip',
      'Convert: --height 1.7 --cm-to-m + race atlas',
    ],
  },
  creature: {
    kind: 'creature',
    label: 'Creature / NPC beast',
    scaleAxis: 'height',
    targetMeters: null,
    okRange: [0.25, 4.5],
    warnRange: [0.1, 8],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: false,
    requireHands: false,
    requireBones: true,
    requireTexture: true,
    physicsLayer: 'NPC',
    scriptHints: ['enemy-rpg', 'nav-agent'],
    notes: ['Do not force 1.8 m — author size is intentional'],
  },
  weapon: {
    kind: 'weapon',
    label: 'Held weapon',
    scaleAxis: 'longest',
    targetMeters: null,
    okRange: [0.25, 2.8],
    warnRange: [0.12, 4.0],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Item',
    scriptHints: ['equip hand bone R_hand_container', 'weapon anim pack'],
    notes: [
      'Relative to hand — never height-normalize to 1.8 m',
      'Convert: no --height 1.7; embed atlas',
    ],
  },
  projectile: {
    kind: 'projectile',
    label: 'Projectile (arrow / bolt / shell)',
    scaleAxis: 'longest',
    targetMeters: null,
    // Medieval arrow ~0.7–0.9 m; bolts shorter; tower shells vary
    okRange: [0.2, 1.2],
    warnRange: [0.08, 2.0],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'center',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Projectile',
    scriptHints: ['projectile script', 'ccd on Rapier body', 'layer Projectile'],
    notes: [
      'Arrows are ~0.6–0.9 m — NOT 1.8 m',
      'Spawn along flight axis; do not character-fit',
      'Texture atlas required (no 1×1 placeholders)',
    ],
  },
  prop: {
    kind: 'prop',
    label: 'Prop / deployable',
    scaleAxis: 'longest',
    targetMeters: null,
    okRange: [0.05, 6],
    warnRange: [0.02, 15],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Default',
    scriptHints: ['pickup-trigger', 'resource-node'],
    notes: ['Match tile/SI units; box collider OK'],
  },
  environment: {
    kind: 'environment',
    label: 'Environment / building / terrain',
    scaleAxis: 'longest',
    targetMeters: null,
    okRange: [1, 500],
    warnRange: [0.5, 2000],
    normalizeToTarget: false,
    unitFixCm: false,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: true,
    physicsLayer: 'Terrain',
    scriptHints: ['navmesh bake', 'surface Walk'],
    notes: ['Large author scale OK; trimesh/heightfield carefully'],
  },
  animation: {
    kind: 'animation',
    label: 'Animation clip',
    scaleAxis: 'height',
    targetMeters: 1.8,
    okRange: [1.55, 2.05],
    warnRange: [1.4, 2.4],
    normalizeToTarget: true,
    unitFixCm: true,
    ground: 'feet',
    requirePelvis: true,
    requireHands: false,
    requireBones: true,
    requireTexture: false,
    physicsLayer: 'IgnoreRaycast',
    scriptHints: ['play on grudge6 race kit', 'rematch Bip001'],
    notes: ['Preview on character host — not empty armature'],
  },
  vfx: {
    kind: 'vfx',
    label: 'VFX / effect mesh',
    scaleAxis: 'longest',
    targetMeters: null,
    okRange: [0.05, 8],
    warnRange: [0.01, 20],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'center',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: false,
    physicsLayer: 'IgnoreRaycast',
    scriptHints: ['spawn_vfx_prefab'],
    notes: ['Scale is design-driven'],
  },
  ui: {
    kind: 'ui',
    label: 'UI / 2D sheet',
    scaleAxis: 'longest',
    targetMeters: null,
    okRange: [0.01, 2],
    warnRange: [0.001, 5],
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
    okRange: [0.05, 20],
    warnRange: [0.01, 100],
    normalizeToTarget: false,
    unitFixCm: true,
    ground: 'bottom',
    requirePelvis: false,
    requireHands: false,
    requireBones: false,
    requireTexture: false,
    physicsLayer: 'Default',
    scriptHints: [],
    notes: ['Classify asset (kind) for stricter checks'],
  },
};

/**
 * Infer kind with projectile/arrow priority over generic weapon.
 * @param {object} m
 * @returns {AssetKind}
 */
export function inferAssetKind(m) {
  if (!m) return 'other';
  const c = `${m.category || ''} ${m.group || ''} ${m.path || ''} ${m.name || ''} ${m.kind || ''}`.toLowerCase();

  // Explicit first
  if (m.kind && DEPLOY_PROFILES[m.kind] && m.kind !== 'other' && m.kind !== 'weapon') {
    // re-check projectile override even if labeled weapon
  }

  if (m.isBakedClip || c.includes('/anims/') || c.includes('animation') || m.scaleProfile === 'animation_clip') {
    return 'animation';
  }

  // Projectiles before weapons (arrow/bolt/shell)
  if (
    /(?:^|[\s/_-])arrow(?:s)?(?:$|[\s/_-])/.test(c) ||
    c.includes('_arrow_') ||
    c.includes('arrow_b') ||
    c.includes('arrow_c') ||
    c.includes('projectile') ||
    c.includes('shell_arrow') ||
    c.includes('shell_ballista') ||
    c.includes('shell_cannon') ||
    c.includes('shell_fire') ||
    c.includes('crossbow_bolt') ||
    c.includes('/bolts/') ||
    (c.includes('bolt') && (c.includes('ammo') || c.includes('projectile') || c.includes('shell')))
  ) {
    return 'projectile';
  }

  if (
    c.includes('weapon') ||
    c.includes('sword') ||
    c.includes('axe') ||
    c.includes('dagger') ||
    c.includes('staff') ||
    c.includes('shield') ||
    c.includes('hammer') ||
    c.includes('/bow/') ||
    c.includes('bows/') ||
    (c.includes('bow') && !c.includes('arrow'))
  ) {
    return 'weapon';
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

  if (c.includes('creature') || c.includes('monster') || c.includes('animal') || c.includes('mount') || c.includes('cavalry')) {
    return 'creature';
  }

  if (
    c.includes('environment') ||
    c.includes('terrain') ||
    c.includes('building') ||
    c.includes('tower') ||
    c.includes('fortress') ||
    c.includes('nature') ||
    c.includes('map-')
  ) {
    return 'environment';
  }

  if (c.includes('vfx') || c.includes('effect') || c.includes('particle') || c.includes('fx/')) {
    return 'vfx';
  }

  if (c.includes('prop') || c.includes('crate') || c.includes('furniture') || c.includes('pickup')) {
    return 'prop';
  }

  if (c.includes('ui/') || c.includes('icon') || c.includes('hud')) return 'ui';

  if (m.kind && DEPLOY_PROFILES[m.kind]) return /** @type {AssetKind} */ (m.kind);
  return 'other';
}

/**
 * @param {object} entry
 * @returns {DeployProfile}
 */
export function getDeployProfile(entry) {
  const kind = inferAssetKind(entry);
  return DEPLOY_PROFILES[kind] || DEPLOY_PROFILES.other;
}

/**
 * Measure size for a profile (height vs longest edge).
 * @param {{ x: number, y: number, z: number }} size
 * @param {DeployProfile} profile
 */
export function measureSize(size, profile) {
  if (profile.scaleAxis === 'height') return size.y || 0;
  return Math.max(size.x || 0, size.y || 0, size.z || 0);
}

/**
 * Decide uniform scale factor for deploy/preview.
 * Never force projectiles/weapons to character height.
 *
 * @param {number} measure  current meters on scaleAxis
 * @param {DeployProfile} profile
 * @returns {{ scale: number, reason: string, unitFixed: boolean, normalized: boolean }}
 */
export function computeDeployScale(measure, profile) {
  let scale = 1;
  let unitFixed = false;
  let normalized = false;
  let reason = 'author units kept';

  if (!measure || !Number.isFinite(measure) || measure <= 0) {
    return { scale: 1, reason: 'invalid measure', unitFixed: false, normalized: false };
  }

  // cm → m when clearly authored in centimeters
  if (profile.unitFixCm) {
    // e.g. 63 cm arrow stored as 63.0, or 180 cm hero
    if (measure > 15 && measure < 500) {
      scale *= 0.01;
      measure *= 0.01;
      unitFixed = true;
      reason = 'cm→m (×0.01)';
    } else if (measure >= 500) {
      // mm or raw export junk
      const pow = Math.pow(10, Math.round(Math.log10(1 / measure)));
      // prefer decade steps toward ~1 m
      const target = profile.targetMeters || 1;
      const decade = Math.pow(10, Math.round(Math.log10(target / measure)));
      scale *= decade;
      measure *= decade;
      unitFixed = true;
      reason = `unit decade ×${decade}`;
    }
  }

  // Character/anim: fit to target when outside ok band
  if (
    profile.normalizeToTarget &&
    profile.targetMeters &&
    (measure < profile.okRange[0] || measure > profile.okRange[1])
  ) {
    const fit = profile.targetMeters / measure;
    const clamped = Math.min(12, Math.max(0.02, fit));
    scale *= clamped;
    measure *= clamped;
    normalized = true;
    reason = (unitFixed ? reason + ' · ' : '') + `fit → ${profile.targetMeters} m`;
  }

  return { scale, reason, unitFixed, normalized };
}

/**
 * Status for a numeric metric against ok/warn ranges.
 * @returns {'ok'|'warn'|'fail'}
 */
export function bandStatus(value, okRange, warnRange) {
  if (value >= okRange[0] && value <= okRange[1]) return 'ok';
  if (value >= warnRange[0] && value <= warnRange[1]) return 'warn';
  return 'fail';
}

/**
 * @typedef {object} CheckItem
 * @property {string} id
 * @property {string} label
 * @property {'ok'|'warn'|'fail'|'info'|'na'} status
 * @property {string} detail
 */

/**
 * Build checklist after deployModel.
 *
 * @param {object} opts
 * @param {object} opts.entry
 * @param {DeployProfile} opts.profile
 * @param {number} opts.measure  post-scale size on profile axis
 * @param {{ x: number, y: number, z: number }} opts.size
 * @param {number} opts.minY
 * @param {string|null} opts.pelvis
 * @param {string|null} opts.handR
 * @param {string|null} opts.handL
 * @param {string[]} opts.bones
 * @param {{ mats?: number, withMap?: number, brokenMaps?: number, rebound?: number }} opts.mats
 * @param {string} opts.scaleReason
 * @param {boolean} opts.unitFixed
 * @param {boolean} opts.normalized
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
  } = opts;

  /** @type {CheckItem[]} */
  const checks = [];

  // Kind classification
  checks.push({
    id: 'kind',
    label: 'Category',
    status: profile.kind === 'other' ? 'warn' : 'ok',
    detail: `${profile.label} (${profile.kind})`,
  });

  // Scale / size
  const sizeStatus = bandStatus(measure, profile.okRange, profile.warnRange);
  const axisLabel = profile.scaleAxis === 'height' ? 'height' : 'longest edge';
  checks.push({
    id: 'scale',
    label: `Scale (${axisLabel})`,
    status: sizeStatus,
    detail: `${measure.toFixed(3)} m · ok ${profile.okRange[0]}–${profile.okRange[1]} m` +
      (profile.targetMeters ? ` · target ${profile.targetMeters} m` : ' · no character-fit') +
      (scaleReason ? ` · ${scaleReason}` : ''),
  });

  if (profile.kind === 'projectile' && measure > 1.5) {
    checks.push({
      id: 'scale-projectile-oversized',
      label: 'Projectile size',
      status: 'fail',
      detail: `${measure.toFixed(2)} m is character-scale — arrows should be ~0.6–0.9 m. Do not fit to 1.8 m.`,
    });
  }

  if (normalized && (profile.kind === 'weapon' || profile.kind === 'projectile')) {
    checks.push({
      id: 'bad-normalize',
      label: 'Normalize policy',
      status: 'fail',
      detail: 'This kind must not be height-normalized to a hero. Check deploy profile.',
    });
  }

  // Grounding
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
      detail: 'center spawn (projectile/vfx) — feet-on-floor not required',
    });
  }

  // Skeleton
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
      detail: bones.length ? `${bones.length} bones (optional for this kind)` : 'not required',
    });
  }

  if (profile.requirePelvis) {
    checks.push({
      id: 'pelvis',
      label: 'Pelvis / hips',
      status: pelvis ? 'ok' : 'fail',
      detail: pelvis || 'missing — need Bip001 Pelvis for equip/ground',
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

  // Textures
  const withMap = mats.withMap ?? 0;
  const matCount = mats.mats ?? 0;
  const broken = mats.brokenMaps ?? 0;
  if (profile.requireTexture) {
    let texStatus = 'fail';
    let texDetail = 'no maps';
    if (withMap > 0 && broken === 0) {
      texStatus = 'ok';
      texDetail = `${withMap}/${matCount} mapped`;
    } else if (mats.rebound > 0) {
      texStatus = 'warn';
      texDetail = `rebound ${mats.rebound} atlas — re-bake GLB for production`;
    } else if (withMap === 0) {
      texStatus = 'fail';
      texDetail = 'untextured / 1×1 placeholder — yellow in viewer';
    }
    checks.push({
      id: 'texture',
      label: 'Textures',
      status: texStatus,
      detail: texDetail,
    });
  } else {
    checks.push({
      id: 'texture',
      label: 'Textures',
      status: withMap > 0 ? 'ok' : 'info',
      detail: withMap > 0 ? `${withMap}/${matCount} mapped` : 'optional for this kind',
    });
  }

  // Physics layer
  checks.push({
    id: 'layer',
    label: 'Physics layer',
    status: 'info',
    detail: profile.physicsLayer,
  });

  // Scripts
  if (profile.scriptHints.length) {
    checks.push({
      id: 'scripts',
      label: 'Script / runtime hints',
      status: 'info',
      detail: profile.scriptHints.join(' · '),
    });
  }

  // UUID / CDN
  if (entry?.grudgeUuid) {
    checks.push({
      id: 'uuid',
      label: 'grudgeUuid',
      status: entry.uuidStatus === 'ok' || entry.uuidStatus === 'derived' ? 'ok' : 'warn',
      detail: `${entry.grudgeUuid} (${entry.uuidStatus || '?'})`,
    });
  } else {
    checks.push({
      id: 'uuid',
      label: 'grudgeUuid',
      status: 'warn',
      detail: 'missing — register for fleet Use panel',
    });
  }

  // Notes
  for (const n of profile.notes) {
    checks.push({
      id: `note-${n.slice(0, 12)}`,
      label: 'Best practice',
      status: 'info',
      detail: n,
    });
  }

  const summary = {
    kind: profile.kind,
    label: profile.label,
    measure,
    size: { x: size.x, y: size.y, z: size.z },
    axis: profile.scaleAxis,
    okRange: profile.okRange,
    physicsLayer: profile.physicsLayer,
    unitFixed,
    normalized,
    scaleReason,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    ok: checks.filter((c) => c.status === 'ok').length,
    pass: checks.filter((c) => c.status === 'fail').length === 0,
  };

  return { profile, checks, summary };
}

/**
 * Score 0–100 for Use panel readiness (category-aware).
 */
export function deployScore(summary, checks) {
  if (!summary) return 0;
  let score = 40;
  score += Math.min(30, summary.ok * 5);
  score -= summary.warn * 5;
  score -= summary.fail * 15;
  if (summary.pass) score += 10;
  return Math.max(0, Math.min(100, score));
}
