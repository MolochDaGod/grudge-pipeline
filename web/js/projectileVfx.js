/**
 * Combat projectiles + VFX — fleet game-ready SSOT for pipeline browser.
 *
 * Live: https://grudge-pipeline.vercel.app/
 * Docs: docs/PROJECTILES_AND_VFX.md
 *
 * Subtypes (mesh + runtime):
 *   arrow | bolt | bullet | cannonball | explosive | magic_orb | trail | impact
 *
 * Runtime contracts (GrudgeBuilder):
 *   WarProjectileSystem (arrows), tactical-ocean cannonballs,
 *   fleet parry allowlist (arrow/bullet/orb), VFX spawn at impact.
 */

/** @typedef {'arrow'|'bolt'|'bullet'|'cannonball'|'explosive'|'magic_orb'|'trail'|'impact'|'generic'} ProjectileSubtype */

/**
 * SI bands for projectile / combat VFX subtypes (metres, longest edge unless noted).
 * Never force to human 1.8 m.
 */
export const PROJECTILE_SUBTYPE_REF = {
  arrow: {
    label: 'Arrow',
    expectedM: 0.75,
    ok: [0.45, 1.0],
    warn: [0.25, 1.35],
    axis: 'longest',
    /** Flight tip along +Z (art-forward) after lookAt */
    flightAxis: '+Z',
    speedMps: [35, 55],
    gravity: true,
    parryable: true,
    poolSize: 48,
    ccd: true,
    collider: 'capsule',
    notes: 'Bow / longbow · origin R_hand or L_hand (bow) · impact on hit not release',
  },
  bolt: {
    label: 'Crossbow / ballista bolt',
    expectedM: 0.85,
    ok: [0.5, 1.2],
    warn: [0.3, 1.6],
    axis: 'longest',
    flightAxis: '+Z',
    speedMps: [45, 70],
    gravity: true,
    parryable: true,
    poolSize: 32,
    ccd: true,
    collider: 'capsule',
    notes: 'Heavier than arrow · flatter arc',
  },
  bullet: {
    label: 'Bullet / musket ball',
    expectedM: 0.03,
    ok: [0.008, 0.08],
    warn: [0.004, 0.15],
    axis: 'longest',
    flightAxis: '+Z',
    speedMps: [120, 350],
    gravity: false,
    parryable: true,
    poolSize: 64,
    ccd: true,
    collider: 'sphere',
    notes: 'Tiny mesh or tracer streak · prefer ray + tracer for far range; mesh only close',
  },
  cannonball: {
    label: 'Cannonball / siege rock',
    expectedM: 0.28,
    ok: [0.12, 0.55],
    warn: [0.08, 0.9],
    axis: 'longest',
    flightAxis: 'center',
    speedMps: [25, 55],
    gravity: true,
    parryable: false,
    poolSize: 24,
    ccd: true,
    collider: 'sphere',
    notes: 'Naval / catapult · AoE on impact · never character-scale',
  },
  explosive: {
    label: 'Explosive / grenade / bomb',
    expectedM: 0.18,
    ok: [0.08, 0.45],
    warn: [0.04, 0.8],
    axis: 'longest',
    flightAxis: 'center',
    speedMps: [12, 28],
    gravity: true,
    parryable: false,
    poolSize: 16,
    ccd: true,
    collider: 'sphere',
    notes: 'Fuse timer or impact detonate · spawn impact VFX + radius damage',
  },
  magic_orb: {
    label: 'Magic orb / spell bolt',
    expectedM: 0.35,
    ok: [0.12, 0.8],
    warn: [0.06, 1.4],
    axis: 'longest',
    flightAxis: 'center',
    speedMps: [18, 40],
    gravity: false,
    parryable: true,
    poolSize: 32,
    ccd: true,
    collider: 'sphere',
    notes: 'Emissive material · optional homing · parry as orb family',
  },
  trail: {
    label: 'Trail / streak VFX',
    expectedM: 1.5,
    ok: [0.3, 4],
    warn: [0.1, 8],
    axis: 'longest',
    flightAxis: 'follow',
    speedMps: null,
    gravity: false,
    parryable: false,
    poolSize: 32,
    ccd: false,
    collider: 'none',
    notes: 'Attached to projectile root · IgnoreRaycast · no damage',
  },
  impact: {
    label: 'Impact / explosion VFX',
    expectedM: 2.0,
    ok: [0.4, 8],
    warn: [0.15, 18],
    axis: 'longest',
    flightAxis: 'center',
    speedMps: null,
    gravity: false,
    parryable: false,
    poolSize: 16,
    ccd: false,
    collider: 'none',
    notes: 'One-shot at hit point · auto-despawn · design scale vs human readability',
  },
  generic: {
    label: 'Projectile (generic)',
    expectedM: 0.75,
    ok: [0.2, 1.2],
    warn: [0.08, 2],
    axis: 'longest',
    flightAxis: '+Z',
    speedMps: [20, 50],
    gravity: true,
    parryable: true,
    poolSize: 32,
    ccd: true,
    collider: 'sphere',
    notes: 'Classify subtype for correct SI + combat rules',
  },
};

/**
 * Infer projectile / combat VFX subtype from catalog entry.
 * @param {object} m
 * @returns {ProjectileSubtype}
 */
export function inferProjectileSubtype(m) {
  if (!m) return 'generic';
  const c = `${m.category || ''} ${m.group || ''} ${m.path || ''} ${m.name || ''} ${m.kind || ''} ${m.subtype || ''}`.toLowerCase();

  if (
    c.includes('impact') ||
    c.includes('explosion') ||
    c.includes('explode') ||
    c.includes('supernova') ||
    c.includes('blast') ||
    c.includes('hit_fx') ||
    c.includes('hitfx')
  ) {
    return 'impact';
  }
  if (c.includes('trail') || c.includes('streak') || c.includes('tracer') || c.includes('wake')) {
    return 'trail';
  }
  if (
    c.includes('grenade') ||
    c.includes('explosive') ||
    c.includes('bomb') ||
    c.includes('dynamite') ||
    c.includes('mine_ball') ||
    c.includes('tnt')
  ) {
    return 'explosive';
  }
  if (
    c.includes('cannonball') ||
    c.includes('cannon_ball') ||
    c.includes('shell_cannon') ||
    c.includes('catapult_rock') ||
    c.includes('siege_rock') ||
    (c.includes('cannon') && (c.includes('ball') || c.includes('shell') || c.includes('shot')))
  ) {
    return 'cannonball';
  }
  if (
    c.includes('bullet') ||
    c.includes('musket') ||
    c.includes('slug') ||
    c.includes('round_shot') ||
    c.includes('rifle_round') ||
    c.includes('pistol_ball')
  ) {
    return 'bullet';
  }
  if (
    c.includes('bolt') ||
    c.includes('ballista') ||
    c.includes('shell_ballista') ||
    c.includes('crossbow')
  ) {
    return 'bolt';
  }
  if (
    c.includes('orb') ||
    c.includes('spell') ||
    c.includes('magic_bolt') ||
    c.includes('fireball') ||
    c.includes('energy_ball') ||
    c.includes('plasma')
  ) {
    return 'magic_orb';
  }
  if (
    /(?:^|[\s/_-])arrow(?:s)?(?:$|[\s/_-])/.test(c) ||
    c.includes('_arrow_') ||
    c.includes('shell_arrow') ||
    c.includes('quiver')
  ) {
    return 'arrow';
  }
  if (c.includes('projectile') || c.includes('missile') || c.includes('shell_')) {
    return 'generic';
  }
  return 'generic';
}

/**
 * True when entry should be treated as combat projectile or combat VFX mesh.
 * @param {object} m
 */
export function isProjectileOrCombatVfx(m) {
  if (!m) return false;
  if (m.kind === 'projectile') return true;
  const c = `${m.path || ''} ${m.name || ''} ${m.group || ''} ${m.category || ''}`.toLowerCase();
  if (c.includes('projectile') || c.includes('/vfx/projectiles') || c.includes('shell_arrow')) return true;
  if (c.includes('cannonball') || c.includes('grenade') || c.includes('_arrow_')) return true;
  if (c.includes('/vfx/impacts') || c.includes('explosion')) return true;
  return inferProjectileSubtype(m) !== 'generic' || /arrow|bullet|bolt|cannon|explosive/.test(c);
}

/**
 * Fleet needs ledger for combat projectiles + VFX (expand as games ship).
 */
export const COMBAT_PROJECTILE_NEEDS = [
  {
    id: 'combat.arrow.bow',
    track: 'combat',
    role: 'arrow',
    subtype: 'arrow',
    label: 'Bow arrow mesh (flight + quiver)',
    pathHints: ['_arrow_', 'shell_arrow', 'weapons/bow', 'arrow'],
    r2Key: null,
    search: 'arrow shell_arrow bow',
    status: 'partial',
    notes: 'WarProjectileSystem pool · SI 0.45–1.0 m · texture atlas rebind (yellow fix)',
    runtime: ['WarProjectileSystem', 'longbow anim pack'],
  },
  {
    id: 'combat.bolt.ballista',
    track: 'combat',
    role: 'bolt',
    subtype: 'bolt',
    label: 'Ballista / crossbow bolt',
    pathHints: ['shell_ballista', 'ballista', 'crossbow_bolt', 'bolt'],
    search: 'ballista bolt crossbow',
    status: 'partial',
    notes: 'Siege + tower shells · CCD capsule',
  },
  {
    id: 'combat.bullet.firearm',
    track: 'combat',
    role: 'bullet',
    subtype: 'bullet',
    label: 'Bullet / musket tracer',
    pathHints: ['bullet', 'musket', 'rifle', 'pistol_ball'],
    search: 'bullet musket tracer',
    status: 'missing',
    notes: 'Prefer raycast + thin tracer; mesh only < 30 m',
  },
  {
    id: 'combat.cannonball.naval',
    track: 'combat',
    role: 'cannonball',
    subtype: 'cannonball',
    label: 'Naval cannonball',
    pathHints: ['cannonball', 'shell_cannon', 'cannon_ball'],
    search: 'cannonball shell_cannon naval',
    status: 'partial',
    notes: 'TacticalOceanScene · gravity arc · splash + hull damage',
  },
  {
    id: 'combat.cannonball.siege',
    track: 'combat',
    role: 'cannonball',
    subtype: 'cannonball',
    label: 'Catapult / siege rock',
    pathHints: ['catapult', 'siege_rock', 'boulder'],
    search: 'catapult rock siege boulder',
    status: 'partial',
    notes: 'WarCatapult rock mesh · impact crater VFX',
  },
  {
    id: 'combat.explosive.grenade',
    track: 'combat',
    role: 'explosive',
    subtype: 'explosive',
    label: 'Grenade / bomb / mine',
    pathHints: ['grenade', 'bomb', 'explosive', 'dynamite'],
    search: 'grenade bomb explosive',
    status: 'missing',
    notes: 'Not parryable · fuse or impact · radius damage',
  },
  {
    id: 'combat.orb.magic',
    track: 'combat',
    role: 'magic_orb',
    subtype: 'magic_orb',
    label: 'Magic orb / spell projectile',
    pathHints: ['orb', 'fireball', 'magic_bolt', 'status-magic'],
    search: 'orb fireball magic bolt vfx',
    status: 'partial',
    notes: 'Parry as orb · emissive · status-magic GLBs local, need R2',
  },
  {
    id: 'combat.vfx.trail',
    track: 'combat',
    role: 'trail',
    subtype: 'trail',
    label: 'Flight trail / flame streak',
    pathHints: ['trail', 'wod_parts', 'projectiles', 'streak'],
    r2Key: 'models/vfx/projectiles/wod_parts.glb',
    search: 'trail wod_parts projectile vfx',
    status: 'missing',
    notes: 'Local GrudgeBuilder public — upload R2 models/vfx/projectiles/*',
  },
  {
    id: 'combat.vfx.impact',
    track: 'combat',
    role: 'impact',
    subtype: 'impact',
    label: 'Impact / explosion VFX',
    pathHints: ['impact', 'explosion', 'supernova', 'blast'],
    r2Key: 'models/vfx/impacts/supernova_1987a.glb',
    search: 'impact explosion supernova vfx',
    status: 'missing',
    notes: 'Heavy GLBs need glb2glb + size cap; prefer short clips / particles for web',
  },
  {
    id: 'combat.vfx.warning',
    track: 'combat',
    role: 'impact',
    subtype: 'impact',
    label: 'Telegraph warning rings',
    pathHints: ['warning_01', 'warning_02', 'warning_03', 'vfx/warning'],
    search: 'warning vfx telegraph',
    status: 'partial',
    notes: 'AoE telegraph before explosive/skill land',
  },
  {
    id: 'combat.runtime.war_projectiles',
    track: 'combat',
    role: 'runtime',
    subtype: 'arrow',
    label: 'WarProjectileSystem (pool + ballistic)',
    pathHints: [],
    search: '',
    status: 'runtime',
    notes: 'Object pool, lookAt flight, impact damage, flame trail',
    codeRefs: [
      'GrudgeBuilder/client/src/warscene/WarProjectileSystem.ts',
      'GrudgeBuilder/client/src/warscene/WarCatapult.ts',
    ],
  },
  {
    id: 'combat.runtime.ocean_cannon',
    track: 'combat',
    role: 'runtime',
    subtype: 'cannonball',
    label: 'Tactical ocean cannonballs',
    pathHints: [],
    search: '',
    status: 'runtime',
    notes: 'Map-based ballistics + ship hit',
    codeRefs: [
      'GrudgeBuilder/client/src/tactical-ocean/threeWorldMapManager.ts',
      'GrudgeBuilder/client/src/tactical-ocean/TacticalOceanScene.tsx',
    ],
  },
  {
    id: 'combat.runtime.parry',
    track: 'combat',
    role: 'runtime',
    subtype: 'generic',
    label: 'Projectile parry allowlist',
    pathHints: [],
    search: '',
    status: 'runtime',
    notes: 'arrow/bullet/orb parryable; nova/meteor/grenade/bomb denied',
    codeRefs: ['projectileParry', 'grudge-fleet-combat'],
  },
];

/**
 * @param {object} m
 * @returns {typeof COMBAT_PROJECTILE_NEEDS[number][]}
 */
export function matchCombatNeeds(m) {
  if (!m) return [];
  const blob = `${m.path || ''} ${m.name || ''} ${m.group || ''} ${m.category || ''} ${m.r2Key || ''}`.toLowerCase();
  return COMBAT_PROJECTILE_NEEDS.filter((need) => {
    if (need.status === 'runtime' || need.status === 'planned') return false;
    if (need.r2Key && blob.includes(need.r2Key.toLowerCase())) return true;
    return (need.pathHints || []).some((h) => blob.includes(String(h).toLowerCase()));
  });
}

/**
 * @param {object[]} models
 */
export function scoreCombatCoverage(models) {
  const list = Array.isArray(models) ? models : [];
  let covered = 0;
  const rows = COMBAT_PROJECTILE_NEEDS.map((need) => {
    if (need.status === 'runtime' || need.status === 'planned') {
      return { ...need, catalogHits: 0, covered: need.status === 'runtime' };
    }
    const hits = list.filter((m) => {
      const blob = `${m.path || ''} ${m.name || ''} ${m.group || ''}`.toLowerCase();
      if (need.r2Key && blob.includes(need.r2Key.toLowerCase())) return true;
      return (need.pathHints || []).some((h) => blob.includes(String(h).toLowerCase()));
    });
    const ok = hits.length > 0;
    if (ok) covered++;
    return {
      ...need,
      catalogHits: hits.length,
      covered: ok,
      sample: hits[0]?.name || hits[0]?.path || null,
    };
  });
  const assetNeeds = COMBAT_PROJECTILE_NEEDS.filter((n) => n.status !== 'runtime' && n.status !== 'planned');
  return {
    track: 'combat',
    total: assetNeeds.length,
    covered,
    runtime: COMBAT_PROJECTILE_NEEDS.filter((n) => n.status === 'runtime').length,
    rows,
    pct: assetNeeds.length ? Math.round((covered / assetNeeds.length) * 100) : 0,
  };
}

/**
 * Game-ready import snippet for projectile / combat VFX.
 * @param {object} m
 */
export function projectileImportSnippet(m) {
  const url =
    m?.cdnUrl ||
    (m?.path ? `https://assets.grudge-studio.com/${String(m.path).replace(/^\//, '')}` : '');
  const uuid = m?.grudgeUuid || '';
  const r2 = String(m?.path || m?.r2Key || '').replace(/^\//, '');
  const subtype = inferProjectileSubtype(m);
  const ref = PROJECTILE_SUBTYPE_REF[subtype] || PROJECTILE_SUBTYPE_REF.generic;
  const speed =
    ref.speedMps && ref.speedMps.length === 2
      ? `// flight speed ~${ref.speedMps[0]}–${ref.speedMps[1]} m/s`
      : '// no ballistic speed (attached / one-shot VFX)';

  if (subtype === 'trail' || subtype === 'impact') {
    return `// Combat VFX (${ref.label}) — IgnoreRaycast · no damage mesh
// uuid: ${uuid}
// r2Key: ${r2}
// subtype: ${subtype} · SI longest ok ${ref.ok[0]}–${ref.ok[1]} m
// NEVER character-fit to 1.8 m
const vfxUrl = ${JSON.stringify(url)};
// Spawn at impact/hand · pool size ~${ref.poolSize} · auto-despawn
// Parent to projectile root (trail) or world point (impact)
// Prefer short GLB / particles over 100MB cinematic meshes on web`;
  }

  return `// Game-ready projectile: ${ref.label}
// uuid: ${uuid}
// r2Key: ${r2}
// kind: projectile · subtype: ${subtype}
// SI: longest ${ref.ok[0]}–${ref.ok[1]} m (expected ~${ref.expectedM} m) — NEVER fit to 1.8 m
// layer: Projectile · CCD: ${ref.ccd} · collider: ${ref.collider}
// gravity: ${ref.gravity} · parryable: ${ref.parryable} · pool: ${ref.poolSize}
${speed}
// flight axis: ${ref.flightAxis} · origin: R_hand_container / weapon muzzle
const url = ${JSON.stringify(url)};
// Pattern:
//  1. GLTFLoader → clone into Object3D pool (no per-shot alloc)
//  2. Place at muzzle; orient lookAt(velocity) so tip = ${ref.flightAxis}
//  3. Integrate position (kinematic + optional gravity) each frame
//  4. Damage / explode ON IMPACT only (not on fire)
//  5. Spawn trail/impact VFX; return mesh to pool
// GrudgeBuilder: WarProjectileSystem (arrow) · TacticalOcean (cannon) · parry allowlist
// ${ref.notes}`;
}

/**
 * Runtime checklist rows for deploy panel.
 * @param {object} m
 * @param {number} measureM
 */
export function projectileRuntimeChecks(m, measureM) {
  const subtype = inferProjectileSubtype(m);
  const ref = PROJECTILE_SUBTYPE_REF[subtype] || PROJECTILE_SUBTYPE_REF.generic;
  const checks = [];
  const mVal = Number(measureM) || 0;

  checks.push({
    id: 'proj-subtype',
    label: 'Projectile subtype',
    status: subtype === 'generic' ? 'warn' : 'ok',
    detail: `${ref.label} (${subtype})`,
  });

  if (mVal > 0) {
    const inOk = mVal >= ref.ok[0] && mVal <= ref.ok[1];
    const inWarn = mVal >= ref.warn[0] && mVal <= ref.warn[1];
    checks.push({
      id: 'proj-si',
      label: 'Subtype SI band',
      status: inOk ? 'ok' : inWarn ? 'warn' : 'fail',
      detail: `${mVal.toFixed(3)} m · ok ${ref.ok[0]}–${ref.ok[1]} m · expected ~${ref.expectedM} m`,
    });
  }

  // Character-scale failure for small projectiles
  if ((subtype === 'arrow' || subtype === 'bolt' || subtype === 'bullet') && mVal > 1.5) {
    checks.push({
      id: 'proj-character-scale',
      label: 'Anti character-fit',
      status: 'fail',
      detail: `${mVal.toFixed(2)} m looks like a hero — never normalize projectiles to 1.8 m`,
    });
  }

  // Bullets must stay tiny
  if (subtype === 'bullet' && mVal > 0.2) {
    checks.push({
      id: 'proj-bullet-size',
      label: 'Bullet size',
      status: 'fail',
      detail: 'Bullet mesh should be tracer-scale (< 0.08 m) or use ray + streak',
    });
  }

  // Cannonballs / explosives should not be arrow-tiny or building-huge
  if ((subtype === 'cannonball' || subtype === 'explosive') && mVal > 2.5) {
    checks.push({
      id: 'proj-heavy-huge',
      label: 'Heavy projectile size',
      status: 'fail',
      detail: 'Likely unit error or full environment mesh — isolate shell mesh only',
    });
  }

  checks.push({
    id: 'proj-combat',
    label: 'Combat contract',
    status: 'info',
    detail: `parry=${ref.parryable} · gravity=${ref.gravity} · CCD=${ref.ccd} · pool=${ref.poolSize} · ${ref.collider}`,
  });

  return { subtype, ref, checks };
}
