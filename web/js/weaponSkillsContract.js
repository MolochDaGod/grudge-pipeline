/**
 * Weapon skill script contract — shared between pipeline UI and Forge.
 * Mirrors grudge-forge/src/engine/types/weaponSkills.ts skill keys + trees.
 *
 * Skills are data (not hard-coded in combat loops). Forge loads trees into
 * ActionBarManager; pipeline opens them via forgeDeepLink({ workspace:'weapons', weapon }).
 */

/**
 * @typedef {{
 *   key: string, name: string, element: string, damage: number, range: number,
 *   cooldown: number, description: string, anim?: string, vfx?: string,
 *   socket?: string, bounce?: boolean, weaponFamily?: string
 * }} SkillDef
 */

/**
 * Shared MM bounce defaults (mirrors game-content bouncePhysics).
 * Used by Forge / pipeline preview when spawning skill projectiles.
 */
export const SKILL_BOUNCE = {
  melee_1h: { maxBounces: 0, knockImpulse: 9 },
  melee_2h: { maxBounces: 0, knockImpulse: 12 },
  spear: { maxBounces: 1, knockImpulse: 10 },
  staff: { maxBounces: 0, knockImpulse: 11 },
  shield: { maxBounces: 3, knockImpulse: 14 },
  throwable: { maxBounces: 3, knockImpulse: 10 },
  magic: { maxBounces: 2, knockImpulse: 9 },
};

/** @type {Record<string, SkillDef>} */
export const SKILL_CATALOG = {
  quickSwing: {
    key: 'quickSwing',
    name: 'Quick Swing',
    element: 'physical',
    damage: 10,
    range: 3,
    cooldown: 0,
    description: 'Fast melee strike',
    anim: 'attack',
    socket: 'blade_tip',
    vfx: 'slash',
    weaponFamily: 'melee_1h',
  },
  heavySwing: {
    key: 'heavySwing',
    name: 'Heavy Swing',
    element: 'physical',
    damage: 25,
    range: 3,
    cooldown: 3,
    description: 'Powerful overhead hit — MM knock bounce',
    anim: 'heavy',
    socket: 'blade_tip',
    vfx: 'slash_heavy',
    weaponFamily: 'melee_2h',
  },
  iceSwing: {
    key: 'iceSwing',
    name: 'Ice Swing',
    element: 'ice',
    damage: 18,
    range: 3,
    cooldown: 5,
    description: 'Frost-coated slash',
    anim: 'attack',
    socket: 'blade_tip',
    vfx: 'ice_slash',
    weaponFamily: 'melee_1h',
  },
  lightningSwing: {
    key: 'lightningSwing',
    name: 'Lightning Swing',
    element: 'lightning',
    damage: 20,
    range: 3,
    cooldown: 5,
    description: 'Electrified strike',
    anim: 'attack',
    socket: 'blade_tip',
    vfx: 'lightning_slash',
    weaponFamily: 'melee_1h',
  },
  groundSlam: {
    key: 'groundSlam',
    name: 'Ground Slam',
    element: 'physical',
    damage: 30,
    range: 5,
    cooldown: 8,
    description: 'AoE shockwave — high MM knock',
    anim: 'heavy',
    socket: 'blade_base',
    vfx: 'shockwave',
    weaponFamily: 'melee_2h',
  },
  // Monkey King staff tree
  monkeyAttackA: {
    key: 'monkeyAttackA',
    name: 'Staff Attack A',
    element: 'physical',
    damage: 18,
    range: 3.2,
    cooldown: 0,
    description: 'Monkey King attack-A',
    anim: 'monkey_staff_attack_a',
    socket: 'blade_tip',
    vfx: 'slash',
    weaponFamily: 'staff',
  },
  monkeyAttackB: {
    key: 'monkeyAttackB',
    name: 'Staff Attack B',
    element: 'physical',
    damage: 20,
    range: 3.2,
    cooldown: 0,
    description: 'Monkey King attack-B combo',
    anim: 'monkey_staff_attack_b',
    socket: 'blade_tip',
    vfx: 'slash',
    weaponFamily: 'staff',
  },
  monkeySkill1: {
    key: 'monkeySkill1',
    name: 'Monkey Skill 1',
    element: 'magical',
    damage: 32,
    range: 5,
    cooldown: 10,
    description: 'Monkey King skill-1 radial',
    anim: 'monkey_staff_skill_1',
    socket: 'blade_base',
    vfx: 'shockwave',
    weaponFamily: 'staff',
  },
  monkeySpin: {
    key: 'monkeySpin',
    name: 'Monkey Spin',
    element: 'physical',
    damage: 28,
    range: 4,
    cooldown: 12,
    description: 'Monkey King spin clear',
    anim: 'monkey_staff_spin',
    socket: 'blade_tip',
    vfx: 'slash_heavy',
    weaponFamily: 'staff',
  },
  // Mixamo pack skills (uploads_2026_07)
  spearStab: {
    key: 'spearStab',
    name: 'Spear Stab',
    element: 'physical',
    damage: 14,
    range: 3.5,
    cooldown: 0,
    description: 'Mixamo spear stab',
    anim: 'spear_stab',
    socket: 'blade_tip',
    vfx: 'slash',
    weaponFamily: 'spear',
  },
  spearThrustSlash: {
    key: 'spearThrustSlash',
    name: 'Thrust Slash',
    element: 'physical',
    damage: 20,
    range: 3.8,
    cooldown: 4,
    description: 'Spear thrust into slash',
    anim: 'spear_thrust_slash',
    socket: 'blade_tip',
    vfx: 'slash_heavy',
    weaponFamily: 'spear',
  },
  mainhandThrow: {
    key: 'mainhandThrow',
    name: 'Mainhand Throw',
    element: 'physical',
    damage: 16,
    range: 18,
    cooldown: 6,
    description: 'Thrown weapon — ballistic bounce',
    anim: 'mainhand_throw',
    socket: 'muzzle',
    vfx: 'impact',
    bounce: true,
    weaponFamily: 'throwable',
  },
  shieldThrow: {
    key: 'shieldThrow',
    name: 'Shield Throw',
    element: 'physical',
    damage: 18,
    range: 14,
    cooldown: 8,
    description: 'Thrown shield — multi-bounce',
    anim: 'shield_throw',
    socket: 'blade_base',
    vfx: 'impact',
    bounce: true,
    weaponFamily: 'shield',
  },
  pistolWhip: {
    key: 'pistolWhip',
    name: 'Pistol Whip',
    element: 'physical',
    damage: 12,
    range: 2,
    cooldown: 0,
    description: 'Close-range pistol whip',
    anim: 'pistol_whip',
    socket: 'blade_base',
    vfx: 'impact',
    weaponFamily: 'melee_1h',
  },
  pullHeavy: {
    key: 'pullHeavy',
    name: 'Pull Heavy',
    element: 'physical',
    damage: 22,
    range: 4,
    cooldown: 12,
    description: 'Pull heavy object / foe',
    anim: 'pull_heavy',
    socket: 'blade_base',
    vfx: 'shockwave',
    weaponFamily: 'melee_2h',
  },
  fireball: {
    key: 'fireball',
    name: 'Fireball',
    element: 'fire',
    damage: 22,
    range: 20,
    cooldown: 4,
    description: 'Ranged fire projectile — bounce magic',
    anim: 'cast',
    socket: 'muzzle',
    vfx: 'fireball',
    bounce: true,
    weaponFamily: 'magic',
  },
  thunderball: {
    key: 'thunderball',
    name: 'Thunderball',
    element: 'lightning',
    damage: 15,
    range: 20,
    cooldown: 3,
    description: 'Lightning orb with bounce',
    anim: 'cast',
    socket: 'muzzle',
    vfx: 'thunderball',
    bounce: true,
    weaponFamily: 'magic',
  },
  shieldBash: {
    key: 'shieldBash',
    name: 'Shield Bash',
    element: 'physical',
    damage: 15,
    range: 2,
    cooldown: 4,
    description: 'Stun target 1s — high MM knock',
    anim: 'block',
    socket: 'blade_base',
    vfx: 'impact',
    weaponFamily: 'shield',
  },
  shieldParry: {
    key: 'shieldParry',
    name: 'Shield Parry',
    element: 'physical',
    damage: 0,
    range: 0,
    cooldown: 6,
    description: 'Perfect block → counter window',
    anim: 'parry',
    socket: 'blade_base',
    vfx: 'parry_spark',
    weaponFamily: 'shield',
  },
};

/** Weapon type → skill keys (slots 1–6). */
export const BASE_WEAPON_SKILLS = {
  sword: ['quickSwing', 'heavySwing', 'iceSwing', 'lightningSwing', 'mainhandThrow'],
  axe: ['monkeyAttackA', 'monkeyAttackB', 'monkeySpin', 'pullHeavy', 'groundSlam'],
  hammer: ['monkeyAttackA', 'groundSlam', 'pullHeavy', 'monkeySpin'],
  mace: ['quickSwing', 'heavySwing', 'groundSlam'],
  spear: ['spearStab', 'spearThrustSlash', 'mainhandThrow', 'lightningSwing'],
  dagger: ['quickSwing', 'heavySwing', 'mainhandThrow'],
  bow: ['fireball', 'thunderball'],
  crossbow: ['fireball', 'thunderball'],
  staff: ['monkeyAttackA', 'monkeyAttackB', 'monkeySkill1', 'monkeySpin', 'thunderball', 'fireball'],
  wand: ['thunderball', 'fireball', 'monkeySkill1'],
  shield: ['shieldBash', 'shieldParry', 'shieldThrow'],
  other: ['quickSwing', 'pistolWhip', 'mainhandThrow'],
};

/**
 * Runtime script shape for a skill (Forge ActionBar / GameLoop).
 * @param {string} skillKey
 */
export function skillScript(skillKey) {
  const def = SKILL_CATALOG[skillKey];
  if (!def) return null;
  const family = def.weaponFamily || 'melee_1h';
  const bounce = SKILL_BOUNCE[family] || SKILL_BOUNCE.melee_1h;
  return {
    id: def.key,
    type: 'weapon_skill',
    name: def.name,
    // Timing (seconds) — smoothed defaults; tune per clip later
    windup: def.cooldown > 0 ? 0.12 : 0.08,
    active: 0.18,
    recovery: 0.22,
    hitWindow: { start: 0.22, end: 0.55 },
    // Spatial
    range: def.range,
    damage: def.damage,
    element: def.element,
    // Presentation
    anim: def.anim || 'attack',
    vfx: def.vfx || null,
    /** Projectile/melee origin socket on weapon mesh */
    socket: def.socket || 'blade_tip',
    cooldown: def.cooldown,
    description: def.description,
    // Shared MM bounce physics (all weapons/skills)
    bounce: !!def.bounce,
    weaponFamily: family,
    knockImpulse: bounce.knockImpulse,
    maxBounces: bounce.maxBounces,
  };
}

/**
 * Full hotbar loadout for a weapon type (Forge-compatible).
 * @param {string} weaponType
 */
export function skillTreeForWeapon(weaponType) {
  const keys = BASE_WEAPON_SKILLS[weaponType] || BASE_WEAPON_SKILLS.other;
  return {
    weaponType,
    slots: keys.map((k, i) => ({
      slot: i + 1,
      skillKey: k,
      script: skillScript(k),
    })),
  };
}

/**
 * HTML list for pipeline HUD.
 * @param {string} weaponType
 */
export function renderSkillTreeHtml(weaponType) {
  const tree = skillTreeForWeapon(weaponType);
  if (!tree.slots.length) return '<em class="dim">No skills</em>';
  return tree.slots
    .map((s) => {
      const d = s.script;
      if (!d) return '';
      return `<div class="skill-card" data-skill="${d.id}" data-weapon="${weaponType}">
        <span class="skill-slot">S${s.slot}</span>
        <span class="skill-name">${esc(d.name)}</span>
        <span class="skill-meta">${d.element} · ${d.damage} dmg · ${d.cooldown}s CD · ${d.socket}</span>
        <span class="skill-desc">${esc(d.description)}</span>
      </div>`;
    })
    .join('');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
