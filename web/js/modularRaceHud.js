/**
 * Modular race multipack HUD — equip visibility by slot for grudge6 / RTS_TOON kits.
 *
 * Used by model-browser.js for:
 *   - slot inference (cloak / wings / mount / armor / weapons)
 *   - preset loadouts (warrior / mage / ranger)
 *   - anim pack hint from equipped weapon
 *
 * Live: https://grudge-pipeline.vercel.app/
 */

import { inferEquipSlot } from './productionBake.js';
import { ANIM_PACKS, MODULAR_SLOTS, inferAnimPack } from './fleetBridge.js';

/** Alias for browser equip isolation (same rules as productionBake). */
export function modularEquipSlot(meshName) {
  return inferEquipSlot(meshName);
}

/**
 * Group mesh names from a meshIndex Map by modular equip slot.
 * @param {Map<string, unknown[]>} meshIndex
 * @returns {Map<string, string[]>}
 */
export function groupMeshesBySlot(meshIndex) {
  const by = new Map();
  if (!meshIndex || typeof meshIndex.forEach !== 'function') return by;
  meshIndex.forEach((_meshes, name) => {
    const slot = modularEquipSlot(name);
    if (!by.has(slot)) by.set(slot, []);
    by.get(slot).push(name);
  });
  for (const [, names] of by) {
    names.sort((a, b) => a.localeCompare(b));
  }
  return by;
}

/**
 * Apply a loadout (slot → mesh name). Hides unequipped peers in exclusive slots;
 * keeps skeleton always visible; leaves unknown slots as-is unless named.
 * @param {Map<string, {visible:boolean}[]>} meshIndex
 * @param {Record<string, string|null|undefined>} loadout
 */
export function applyLoadout(meshIndex, loadout = {}) {
  if (!meshIndex) return;
  const exclusiveSlots = new Set(
    MODULAR_SLOTS.filter((s) => s.exclusive).map((s) => s.id),
  );
  // Always keep skeleton meshes
  meshIndex.forEach((meshes, n) => {
    const slot = modularEquipSlot(n);
    if (slot === 'skeleton') {
      meshes.forEach((m) => {
        m.visible = true;
      });
      return;
    }
    if (!exclusiveSlots.has(slot) && slot !== 'body' && slot !== 'weapon' && slot !== 'shield') {
      // non-exclusive: show if selected or if no selection for that slot
      const pick = loadout[slot];
      if (pick == null || pick === '') {
        // leave visibility unless loadout explicitly has key
        if (Object.prototype.hasOwnProperty.call(loadout, slot)) {
          meshes.forEach((m) => {
            m.visible = false;
          });
        }
        return;
      }
      meshes.forEach((m) => {
        m.visible = n === pick;
      });
      return;
    }
    const pick = loadout[slot];
    if (pick == null || pick === '') {
      // body: prefer keep one; others hide when empty loadout key
      if (slot === 'body' && !Object.prototype.hasOwnProperty.call(loadout, 'body')) {
        return;
      }
      meshes.forEach((m) => {
        m.visible = false;
      });
      return;
    }
    meshes.forEach((m) => {
      m.visible = n === pick;
    });
  });
}

/**
 * Guess a class preset loadout from available mesh names per slot.
 * @param {Map<string, string[]>} bySlot
 * @param {'warrior'|'mage'|'ranger'} kind
 * @returns {Record<string, string>}
 */
export function guessPreset(bySlot, kind) {
  const get = (slot) => (bySlot?.get?.(slot) || []).slice();
  const pick = (names, re, fallbackFirst = true) => {
    if (!names.length) return '';
    const hit = names.find((n) => re.test(n));
    return hit || (fallbackFirst ? names[0] : '');
  };

  const body = pick(get('body'), /body|torso|units_body|armor/i);
  const head = pick(get('head'), /helm|helmet|hood|head/i);
  const arms = pick(get('arms'), /arm|glove|gauntlet/i);
  const legs = pick(get('legs'), /leg|boot|greave/i);
  const shoulders = pick(get('shoulders'), /shoulder|pauldron/i);
  const cloak = pick(get('cloak'), /cloak|cape/i, false);
  const shield = pick(get('shield'), /shield|buckler/i, false);

  /** @type {Record<string, string>} */
  const loadout = {
    body,
    head,
    arms,
    legs,
  };
  if (shoulders) loadout.shoulders = shoulders;

  if (kind === 'warrior') {
    loadout.weapon =
      pick(get('weapon'), /sword|blade|axe|mace|hammer|spear/i) ||
      pick(get('weapon'), /./);
    if (shield) loadout.shield = shield;
    if (cloak) loadout.cloak = cloak;
  } else if (kind === 'mage') {
    loadout.weapon =
      pick(get('weapon'), /staff|wand|tome|orb|magic/i) ||
      pick(get('weapon'), /./);
    const robeCloak = pick(get('cloak'), /robe|cloak|cape|mantle/i, true);
    if (robeCloak) loadout.cloak = robeCloak;
  } else if (kind === 'ranger') {
    loadout.weapon =
      pick(get('weapon'), /bow|crossbow|longbow/i) ||
      pick(get('weapon'), /./);
    const quiver = pick(get('quiver'), /quiver|bag/i, true);
    if (quiver) loadout.quiver = quiver;
    if (cloak) loadout.cloak = cloak;
  }

  // Drop empty keys
  for (const k of Object.keys(loadout)) {
    if (!loadout[k]) delete loadout[k];
  }
  return loadout;
}

/**
 * Infer anim pack from a loadout's weapon mesh name.
 * @param {Record<string, string>} loadout
 * @returns {{ id: string, label?: string, baked?: string, weapons?: string[] }}
 */
export function animPackHintFromLoadout(loadout = {}) {
  const weapon = String(loadout.weapon || loadout.shield || '');
  const pack = inferAnimPack(weapon);
  return pack || ANIM_PACKS.sword_shield;
}

/**
 * Render modular equip HUD HTML into #modularHudHost.
 * @param {Map<string, string[]>} byModSlot
 */
export function renderModularHudHtml(byModSlot) {
  const slots = MODULAR_SLOTS.filter((s) => s.id !== 'skeleton' && s.id !== 'prop');
  const slotRows = slots
    .map((s) => {
      const names = byModSlot?.get?.(s.id) || [];
      if (!names.length) return '';
      const opts =
        `<option value="">— hide —</option>` +
        names
          .map((n) => `<option value="${esc(n)}">${esc(n)}</option>`)
          .join('');
      return `<div class="mod-slot">
        <span class="mod-slot-label">${esc(s.label)}</span>
        <select class="mod-slot-select" data-mod-slot="${esc(s.id)}">${opts}</select>
      </div>`;
    })
    .join('');

  const animBtns = Object.values(ANIM_PACKS)
    .map(
      (p) =>
        `<button type="button" class="viewer-btn" data-anim-pack="${esc(p.id)}" title="${esc(p.baked || '')}">${esc(p.label || p.id)}</button>`,
    )
    .join('');

  return `<div class="mod-hud">
    <div class="mod-hud-head">Modular equip · race multipack</div>
    <div class="mod-hud-actions">
      <button type="button" class="viewer-btn" data-mod="all">All</button>
      <button type="button" class="viewer-btn" data-mod="none">Base</button>
      <button type="button" class="viewer-btn" data-mod="warrior">Warrior</button>
      <button type="button" class="viewer-btn" data-mod="mage">Mage</button>
      <button type="button" class="viewer-btn" data-mod="ranger">Ranger</button>
    </div>
    ${slotRows || '<p class="dim" style="font-size:.72rem;margin:0">No equippable slots on this model</p>'}
    <div class="mod-hud-anims">
      <div class="mod-slot-label">Anim packs</div>
      <div class="mod-anim-row">${animBtns}</div>
    </div>
  </div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
