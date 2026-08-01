/**
 * Modular race equip HUD — fast mesh isolation for RTS_TOON / grudge6 multipacks.
 *
 * Equipment = visibility toggles (never whole-body GLB swap).
 * Slots: armor, cloak, wings, mount, weapons, shield, utility.
 *
 * @see grudge6-modular-characters skill
 * @see fleetBridge.MODULAR_SLOTS
 */

import { inferEquipSlot } from './productionBake.js';
import { MODULAR_SLOTS, ANIM_PACKS, inferAnimPack } from './fleetBridge.js';

/**
 * Expand mesh name → equip slot (cloak / wings / mount / shoulders / quiver).
 * Wraps productionBake.inferEquipSlot with extra RTS_TOON patterns.
 */
export function modularEquipSlot(meshName) {
  const n = String(meshName || '');
  const s = n.toLowerCase();
  if (/cloak|cape|mantle|back_?cloth|hooded_?cape/i.test(s)) return 'cloak';
  if (/wing|wings|angel|dragon_?wing|bat_?wing/i.test(s)) return 'wings';
  if (/horse|mount|cavalry|saddle|steed/i.test(s)) return 'mount';
  if (/shoulder|pauldron|pad/i.test(s)) return 'shoulders';
  if (/quiver|bag|pouch|Bone_bag|Bone_wood/i.test(s) || /quiver/i.test(n)) return 'quiver';
  const base = inferEquipSlot(n);
  if (base === 'accessory' && /back|cloak|cape/i.test(s)) return 'cloak';
  return base;
}

/**
 * Group mesh names by modular slot.
 * @param {Map<string, object[]>} meshIndex name → Mesh[]
 * @returns {Map<string, string[]>}
 */
export function groupMeshesBySlot(meshIndex) {
  const bySlot = new Map();
  for (const n of meshIndex.keys()) {
    const slot = modularEquipSlot(n);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(n);
  }
  for (const arr of bySlot.values()) arr.sort((a, b) => a.localeCompare(b));
  return bySlot;
}

/**
 * Fast equip: exclusive slots show one mesh; others can multi-select.
 * @param {Map<string, object[]>} meshIndex
 * @param {string} slot
 * @param {string|null} meshName  null = hide whole slot
 */
export function equipSlotExclusive(meshIndex, slot, meshName) {
  const exclusive = MODULAR_SLOTS.find((s) => s.id === slot)?.exclusive !== false;
  meshIndex.forEach((meshes, n) => {
    const s = modularEquipSlot(n);
    if (s !== slot) return;
    const on = meshName ? n === meshName : false;
    meshes.forEach((m) => {
      m.visible = exclusive ? on : meshName ? on : m.visible;
    });
  });
}

/**
 * Apply a full loadout map { slot → meshName|null }.
 *
 * HARD (grudge6 multipack / BRB_Characters screenshot fix):
 * Default multipack has EVERY weapon+prop mesh visible → floating soup.
 * We hide **all** Mesh/SkinnedMesh first (including unknown/mesh), then show
 * only the chosen loadout. Skeleton bones are never in meshIndex.
 */
export function applyLoadout(meshIndex, loadout) {
  // Hide EVERY mesh — never leave unknown/mesh/prop visible by default
  meshIndex.forEach((meshes, n) => {
    const s = modularEquipSlot(n);
    if (s === 'skeleton') return; // bone-like names only (rare as Mesh)
    meshes.forEach((m) => {
      m.visible = false;
    });
  });
  for (const [slot, meshName] of Object.entries(loadout || {})) {
    if (!meshName) continue;
    equipSlotExclusive(meshIndex, slot, meshName);
  }
  // Safety: force-hide any leftover weapon/prop not in loadout values
  const keep = new Set(Object.values(loadout || {}).filter(Boolean));
  meshIndex.forEach((meshes, n) => {
    if (keep.has(n)) return;
    const s = modularEquipSlot(n);
    if (
      s === 'weapon' ||
      s === 'shield' ||
      s === 'prop' ||
      s === 'accessory' ||
      s === 'quiver' ||
      s === 'mount' ||
      s === 'wings' ||
      s === 'mesh' ||
      s === 'unknown'
    ) {
      meshes.forEach((m) => {
        m.visible = false;
      });
    }
  });
}

/**
 * Build loadout picker HTML for the viewer side panel.
 * @param {Map<string, string[]>} bySlot
 */
export function renderModularHudHtml(bySlot) {
  const order = MODULAR_SLOTS.map((s) => s.id);
  let html = '<div class="mod-hud">';
  html += '<div class="mod-hud-head">Modular race equip <span class="dim">visibility · not model swap</span></div>';
  html += '<div class="mod-hud-actions">';
  html += '<button type="button" class="viewer-btn" data-mod="all">All</button>';
  html += '<button type="button" class="viewer-btn" data-mod="none">Naked base</button>';
  html += '<button type="button" class="viewer-btn" data-mod="warrior">Warrior preset</button>';
  html += '<button type="button" class="viewer-btn" data-mod="mage">Mage preset</button>';
  html += '<button type="button" class="viewer-btn" data-mod="ranger">Ranger preset</button>';
  html += '</div>';

  for (const id of order) {
    const group = bySlot.get(id);
    if (!group || !group.length) continue;
    const meta = MODULAR_SLOTS.find((s) => s.id === id);
    html += `<div class="mod-slot" data-mod-slot="${id}">`;
    html += `<div class="mod-slot-label">${meta?.label || id} <span class="count">${group.length}</span></div>`;
    html += `<select class="mod-slot-select" data-mod-slot="${id}" title="${id}">`;
    html += `<option value="">— hide —</option>`;
    for (const n of group) {
      html += `<option value="${esc(n)}">${esc(shortName(n))}</option>`;
    }
    html += `</select></div>`;
  }

  // Anim pack strip
  html += '<div class="mod-hud-anims"><div class="mod-slot-label">Anim pack (Bip001)</div><div class="mod-anim-row">';
  for (const p of Object.values(ANIM_PACKS)) {
    html += `<button type="button" class="viewer-btn mod-anim" data-anim-pack="${p.id}" title="${p.baked}">${esc(p.label)}</button>`;
  }
  html += '</div></div>';

  html += '</div>';
  return html;
}

/**
 * Heuristic class presets from available mesh names.
 * Toon RTS / grudge6 names: BRB_Units_Body_C, WK_Units_Sword_01, …
 * Prefer armored tiers for warrior, but ALWAYS pick a body/legs/arms so the
 * kit never grounds on hips alone (hip-float).
 */
export function guessPreset(bySlot, kind) {
  /** @type {Record<string, string|null>} */
  const loadout = {};
  const pick = (slot, re, fallbackRe = null) => {
    const list = bySlot.get(slot) || [];
    if (!list.length) return;
    let hit = list.find((n) => re.test(n));
    if (!hit && fallbackRe) hit = list.find((n) => fallbackRe.test(n));
    if (!hit) hit = list[0];
    if (hit) loadout[slot] = hit;
  };
  /** Prefer later letter tiers (C/D/E armor) over A when present */
  const pickArmored = (slot, baseRe) => {
    const list = bySlot.get(slot) || [];
    if (!list.length) return;
    const scored = list
      .map((n) => {
        const m = n.match(/_([A-F])(?:_|\b|$)/i) || n.match(/(body|arms?|legs?|head)_([a-f])/i);
        const tier = m ? String(m[m.length - 1]).toUpperCase().charCodeAt(0) : 0;
        const armorBonus = /armor|helm|cuirass|greave|gaunt|plate/i.test(n) ? 10 : 0;
        return { n, s: tier + armorBonus };
      })
      .sort((a, b) => b.s - a.s);
    const preferred = scored.find((x) => baseRe.test(x.n)) || scored[0];
    if (preferred) loadout[slot] = preferred.n;
  };

  if (kind === 'warrior') {
    pickArmored('head', /helm|helmet|head|hood|mask/i);
    pickArmored('body', /body|torso|armor|cuirass|chest/i);
    pickArmored('arms', /arm|glove|gaunt|bracer/i);
    pickArmored('legs', /leg|boot|greave|pant/i);
    pick('shoulders', /shoulder|pauldron/i);
    // sword_shield pack: prefer ONE sword, not every axe on the multipack
    pick('weapon', /sword(?![_\s-]?and)|longsword|shortsword|blade(?!.*axe)/i, /axe|mace|hammer|spear|weapon/i);
    pick('shield', /shield|buckler/i);
    // Do NOT auto-equip cloak/quiver/wood — those look like floating junk
  } else if (kind === 'mage') {
    pick('head', /hood|hat|mage|head/i);
    pick('body', /robe|body|cloth/i);
    pick('arms', /arm|sleeve/i);
    pick('legs', /leg|skirt|pant/i);
    pick('weapon', /staff|wand|tome/i);
    pick('cloak', /cloak|cape|mantle/i);
  } else if (kind === 'ranger') {
    pick('head', /hood|cap|head/i);
    pick('body', /body|leather|ranger/i);
    pick('arms', /arm/i);
    pick('legs', /leg|boot/i);
    pick('weapon', /bow|crossbow|longbow/i);
    pick('quiver', /quiver/i);
  }

  // Mandatory body parts: if still empty, force first available (anti hip-float)
  for (const slot of ['body', 'legs', 'arms', 'head']) {
    if (!loadout[slot]) {
      const list = bySlot.get(slot) || [];
      if (list[0]) loadout[slot] = list[0];
    }
  }
  return loadout;
}

/**
 * Count visible meshes that look like weapons/props — >1 means multipack soup.
 */
export function countVisibleWeaponSoup(meshIndex) {
  let weapons = 0;
  let extras = 0;
  meshIndex.forEach((meshes, n) => {
    const any = meshes.some((m) => m.visible);
    if (!any) return;
    const s = modularEquipSlot(n);
    if (s === 'weapon') weapons++;
    if (s === 'prop' || s === 'quiver' || s === 'accessory' || s === 'mesh') extras++;
  });
  return { weapons, extras, soup: weapons > 1 || extras > 0 };
}

export function animPackHintFromLoadout(loadout) {
  const w = loadout.weapon || loadout.shield || '';
  return inferAnimPack(w);
}

function shortName(n) {
  return String(n)
    .replace(/^(WK_|BRB_|ELF_|DWF_|ORC_|UD_)/i, '')
    .replace(/Units_/gi, '');
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
