/**
 * Weapon skills contract — fleet skill trees shown in the pipeline viewer.
 *
 * Aligns with grudge6 / Warlords packs:
 *   sword_shield · 2h_melee · longbow · magic · unarmed
 *
 * Cards open Forge weapons workspace (model-browser wires click → openInForge).
 * Live: https://grudge-pipeline.vercel.app/
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   slot?: number,
 *   hotkey?: string,
 *   cd?: number,
 *   anim?: string,
 *   desc?: string,
 * }} WeaponSkill
 */

/** @type {Record<string, WeaponSkill[]>} */
export const BASE_WEAPON_SKILLS = {
  sword: [
    { id: 'slash', name: 'Slash', slot: 1, hotkey: '1', cd: 0.4, anim: 'sword and shield attack', desc: 'Basic 1H cut' },
    { id: 'thrust', name: 'Thrust', slot: 2, hotkey: '2', cd: 0.6, anim: 'sword and shield attack', desc: 'Forward pierce' },
    { id: 'overhead', name: 'Overhead', slot: 3, hotkey: '3', cd: 1.2, anim: 'sword and shield attack', desc: 'Heavy downward strike' },
    { id: 'getsuga', name: 'Getsuga', slot: 4, hotkey: '4', cd: 8, anim: 'sword and shield attack', desc: 'Ranged slash wave' },
    { id: 'parry', name: 'Parry', slot: 5, hotkey: 'C', cd: 1.5, anim: 'sword and shield idle', desc: 'Block / deflect window' },
  ],
  axe: [
    { id: 'chop', name: 'Chop', slot: 1, hotkey: '1', cd: 0.5, anim: '2h attack', desc: 'Cleaving chop' },
    { id: 'sweep', name: 'Sweep', slot: 2, hotkey: '2', cd: 0.9, anim: '2h attack', desc: 'Wide horizontal swing' },
    { id: 'throw', name: 'Throw', slot: 3, hotkey: '3', cd: 6, anim: '2h attack', desc: 'Thrown axe return' },
    { id: 'frenzy', name: 'Frenzy', slot: 4, hotkey: '4', cd: 12, anim: '2h attack', desc: 'Multi-hit burst' },
  ],
  hammer: [
    { id: 'smash', name: 'Smash', slot: 1, hotkey: '1', cd: 0.7, anim: '2h attack', desc: 'Crushing blow' },
    { id: 'quake', name: 'Quake', slot: 2, hotkey: '2', cd: 5, anim: '2h attack', desc: 'Ground shock' },
    { id: 'stun', name: 'Stun Crush', slot: 3, hotkey: '3', cd: 8, anim: '2h attack', desc: 'Stun on hit' },
    { id: 'meteor', name: 'Meteor', slot: 4, hotkey: '4', cd: 14, anim: '2h attack', desc: 'Leap smash' },
  ],
  spear: [
    { id: 'jab', name: 'Jab', slot: 1, hotkey: '1', cd: 0.35, anim: '2h attack', desc: 'Quick poke' },
    { id: 'lunge', name: 'Lunge', slot: 2, hotkey: '2', cd: 0.8, anim: '2h attack', desc: 'Gap closer' },
    { id: 'sweep', name: 'Pole Sweep', slot: 3, hotkey: '3', cd: 1.1, anim: '2h attack', desc: '360° sweep' },
    { id: 'throw', name: 'Javelin', slot: 4, hotkey: '4', cd: 7, anim: '2h attack', desc: 'Thrown spear' },
  ],
  dagger: [
    { id: 'stab', name: 'Stab', slot: 1, hotkey: '1', cd: 0.25, anim: 'sword and shield attack', desc: 'Fast stab' },
    { id: 'flurry', name: 'Flurry', slot: 2, hotkey: '2', cd: 1.0, anim: 'sword and shield attack', desc: '3-hit chain' },
    { id: 'backstab', name: 'Backstab', slot: 3, hotkey: '3', cd: 6, anim: 'sword and shield attack', desc: 'Rear crit' },
    { id: 'poison', name: 'Poison Edge', slot: 4, hotkey: '4', cd: 10, anim: 'sword and shield attack', desc: 'DoT application' },
  ],
  bow: [
    { id: 'shot', name: 'Shot', slot: 1, hotkey: '1', cd: 0.5, anim: 'longbow attack', desc: 'Standard arrow' },
    { id: 'power', name: 'Power Shot', slot: 2, hotkey: '2', cd: 1.2, anim: 'longbow attack', desc: 'Charged draw' },
    { id: 'multi', name: 'Multi-Shot', slot: 3, hotkey: '3', cd: 5, anim: 'longbow attack', desc: 'Fan of arrows' },
    { id: 'rain', name: 'Arrow Rain', slot: 4, hotkey: '4', cd: 12, anim: 'longbow attack', desc: 'AoE volley' },
  ],
  staff: [
    { id: 'bolt', name: 'Magic Bolt', slot: 1, hotkey: '1', cd: 0.6, anim: 'magic cast', desc: 'Basic orb' },
    { id: 'nova', name: 'Nova', slot: 2, hotkey: '2', cd: 4, anim: 'magic cast', desc: 'Radial blast' },
    { id: 'beam', name: 'Beam', slot: 3, hotkey: '3', cd: 6, anim: 'magic cast', desc: 'Sustained ray' },
    { id: 'meteor', name: 'Meteor', slot: 4, hotkey: '4', cd: 14, anim: 'magic cast', desc: 'Sky drop' },
  ],
  shield: [
    { id: 'block', name: 'Block', slot: 1, hotkey: '1', cd: 0.2, anim: 'sword and shield idle', desc: 'Hold guard' },
    { id: 'bash', name: 'Shield Bash', slot: 2, hotkey: '2', cd: 3, anim: 'sword and shield attack', desc: 'Stun bash' },
    { id: 'wall', name: 'Shield Wall', slot: 3, hotkey: '3', cd: 10, anim: 'sword and shield idle', desc: 'Party defense' },
    { id: 'reflect', name: 'Reflect', slot: 4, hotkey: '4', cd: 12, anim: 'sword and shield idle', desc: 'Return projectiles' },
  ],
};

/**
 * Skill list for a weapon type (falls back to sword).
 * @param {string} type
 * @returns {WeaponSkill[]}
 */
export function skillTreeForWeapon(type) {
  const key = String(type || 'sword').toLowerCase().trim();
  return BASE_WEAPON_SKILLS[key] || BASE_WEAPON_SKILLS.sword;
}

/**
 * HTML for #weaponSkillList — cards with data-weapon / data-skill for Forge open.
 * @param {string} type
 */
export function renderSkillTreeHtml(type) {
  const weapon = String(type || 'sword').toLowerCase().trim() || 'sword';
  const skills = skillTreeForWeapon(weapon);
  if (!skills.length) {
    return `<p class="dim" style="font-size:.72rem;margin:0">No skills for ${esc(weapon)}</p>`;
  }
  return skills
    .map((s) => {
      const meta = [
        s.hotkey ? `key ${s.hotkey}` : '',
        s.cd != null ? `CD ${s.cd}s` : '',
        s.anim ? s.anim : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return `<div class="skill-card" data-weapon="${esc(weapon)}" data-skill="${esc(s.id)}" title="${esc(s.desc || s.name)}">
        <span class="skill-slot">${s.slot != null ? esc(String(s.slot)) : '·'}</span>
        <span class="skill-name">${esc(s.name)}</span>
        ${meta ? `<span class="skill-meta">${esc(meta)}</span>` : ''}
        ${s.desc ? `<span class="skill-desc">${esc(s.desc)}</span>` : ''}
      </div>`;
    })
    .join('');
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
