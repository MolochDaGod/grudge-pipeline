/**
 * Fleet bridge — grudge-pipeline ↔ forge.grudge-studio.com ↔ Open ↔ AI worker.
 *
 * Deep-link contracts so assets, scenes, and weapon skills open in the right host
 * with production CDN URLs (never arena character CDN).
 *
 * @see docs/FLEET_INTEGRATION.md
 */

export const FLEET_HOSTS = {
  pipeline: 'https://grudge-pipeline.vercel.app',
  forge: 'https://forge.grudge-studio.com',
  open: 'https://open.grudge-studio.com',
  assets: 'https://assets.grudge-studio.com',
  id: 'https://id.grudge-studio.com',
  api: 'https://api.grudge-studio.com',
  /** Cloudflare AI worker for deploy plan / asset AI */
  aiWorker: 'https://grudge-asset-deploy-ai.grudge-studio.workers.dev',
};

/**
 * Anim packs shared across RTS_TOON / grudge6 races (Bip001).
 * Local Mixamo sources (armature FBX <1000KB, no mesh): D:/Games/Models/_anim_packs
 * Gap stage: D:/Games/Models/_anim_packs/_gap_fill_stage
 * Inventory: /api/anim-gap-fill.json · /api/anim-gap-summary.json
 */
export const ANIM_PACKS = {
  sword_shield: {
    id: 'sword_shield',
    label: '1H + Shield',
    baked: 'anims/baked/sword_shield',
    local: 'D:/Games/Models/_anim_packs/sword_shield',
    weapons: ['sword', 'dagger', 'knife'],
  },
  '2h_melee': {
    id: '2h_melee',
    label: '2H Melee',
    baked: 'anims/baked/2h_melee',
    local: 'D:/Games/Models/_anim_packs/greatsword',
    weapons: ['greatsword', 'axe', 'hammer', 'mace', 'spear'],
  },
  longbow: {
    id: 'longbow',
    label: 'Longbow',
    baked: 'anims/baked/longbow',
    local: 'D:/Games/Models/_anim_packs/longbow',
    weapons: ['bow', 'crossbow'],
  },
  magic: {
    id: 'magic',
    label: 'Magic / Staff',
    baked: 'anims/baked/magic',
    local: 'D:/Games/Models/_anim_packs/magic_spell',
    weapons: ['staff', 'wand', 'tome'],
  },
  unarmed: {
    id: 'unarmed',
    label: 'Unarmed',
    baked: 'anims/baked/unarmed',
    weapons: ['unarmed', 'fists'],
  },
  rifle: {
    id: 'rifle',
    label: 'Rifle / Gun',
    baked: 'anims/baked/rifle',
    local: 'D:/Games/Models/_anim_packs/rifle',
    weapons: ['rifle', 'gun', 'musket'],
  },
  pistol: {
    id: 'pistol',
    label: 'Pistol',
    baked: 'anims/baked/pistol',
    local: 'D:/Games/Models/_anim_packs/pistol',
    weapons: ['pistol', 'sidearm'],
  },
  farming: {
    id: 'farming',
    label: 'Farming / Harvest',
    baked: 'anims/baked/farming',
    local: 'D:/Games/Models/_anim_packs/farming',
    weapons: ['hoe', 'watering', 'wheelbarrow', 'pickaxe', 'hatchet'],
  },
  traversal: {
    id: 'traversal',
    label: 'Climb / Swim',
    baked: 'anims/baked/traversal',
    local: 'D:/Games/Models/_anim_packs/traversal',
    weapons: [],
  },
  cavalry: {
    id: 'cavalry',
    label: 'Cavalry / Mount',
    baked: 'anims/baked/cavalry',
    weapons: ['mount'],
  },
  twohand_hammer: {
    id: 'twohand_hammer',
    label: '2H Hammer (scarecrow)',
    baked: 'anims/baked/twohand_hammer',
    weapons: ['hammer', 'mace', 'warhammer'],
  },
  polearm: {
    id: 'polearm',
    label: 'Polearm',
    baked: 'anims/baked/polearm',
    weapons: ['spear', 'polearm', 'halberd'],
  },
};

/**
 * Modular race equip slots for multipack HUD (visibility equip).
 * Order = toolbar / exclusivity groups.
 */
export const MODULAR_SLOTS = [
  { id: 'head', label: 'Head', exclusive: true, group: 'armor' },
  { id: 'body', label: 'Body', exclusive: true, group: 'armor' },
  { id: 'arms', label: 'Arms', exclusive: true, group: 'armor' },
  { id: 'legs', label: 'Legs', exclusive: true, group: 'armor' },
  { id: 'shoulders', label: 'Shoulders', exclusive: true, group: 'armor' },
  { id: 'cloak', label: 'Cloak / Cape', exclusive: true, group: 'back' },
  { id: 'wings', label: 'Wings', exclusive: true, group: 'back' },
  { id: 'mount', label: 'Mount', exclusive: true, group: 'mount' },
  { id: 'weapon', label: 'Weapon', exclusive: true, group: 'weapon_r' },
  { id: 'shield', label: 'Shield', exclusive: true, group: 'weapon_l' },
  { id: 'quiver', label: 'Quiver / Bag', exclusive: false, group: 'utility' },
  { id: 'accessory', label: 'Accessory', exclusive: false, group: 'utility' },
  { id: 'hair', label: 'Hair', exclusive: true, group: 'armor' },
  { id: 'skeleton', label: 'Skeleton', exclusive: false, group: 'debug' },
  { id: 'prop', label: 'Prop', exclusive: false, group: 'prop' },
];

/**
 * Build Forge deep link for an asset / scene / workspace.
 * @param {{
 *   assetUrl?: string,
 *   r2Key?: string,
 *   grudgeUuid?: string,
 *   workspace?: 'assets'|'builder'|'animations'|'weapons',
 *   scene?: string,
 *   animPack?: string,
 *   raceId?: string,
 *   weaponType?: string,
 *   meshName?: string,
 *   equipSlot?: string,
 *   source?: string,
 * }} opts
 */
export function forgeDeepLink(opts = {}) {
  // Forge SPA: `/` = landing, any other path (e.g. /editor) loads the editor shell.
  const u = new URL(FLEET_HOSTS.forge + '/editor');
  const workspace = opts.workspace || (opts.assetUrl || opts.r2Key ? 'assets' : 'builder');
  u.searchParams.set('workspace', workspace);
  u.searchParams.set('from', 'pipeline');
  if (opts.assetUrl) u.searchParams.set('asset', opts.assetUrl);
  if (opts.r2Key) u.searchParams.set('r2Key', opts.r2Key);
  if (opts.grudgeUuid) u.searchParams.set('uuid', opts.grudgeUuid);
  // Only set scene= when it is an https URL (Forge fetches it). Names go in pipeline label.
  if (opts.scene && /^https?:\/\//i.test(String(opts.scene))) {
    u.searchParams.set('scene', opts.scene);
  } else if (opts.scene) {
    u.searchParams.set('sceneName', String(opts.scene));
  }
  if (opts.animPack) u.searchParams.set('animPack', opts.animPack);
  if (opts.raceId) u.searchParams.set('race', opts.raceId);
  if (opts.weaponType) u.searchParams.set('weapon', opts.weaponType);
  if (opts.meshName) u.searchParams.set('meshName', opts.meshName);
  if (opts.equipSlot) u.searchParams.set('equipSlot', opts.equipSlot);
  if (opts.source) u.searchParams.set('pipeline', opts.source);
  if (opts.edit) u.searchParams.set('edit', '1');
  if (opts.awaitImport) u.searchParams.set('awaitImport', '1');
  return u.toString();
}

/**
 * Pipeline deep link (share current catalog entry).
 */
export function pipelineDeepLink(opts = {}) {
  const u = new URL(typeof location !== 'undefined' ? location.href : FLEET_HOSTS.pipeline);
  u.hash = '';
  if (opts.q) u.searchParams.set('q', opts.q);
  if (opts.uuid) u.searchParams.set('uuid', opts.uuid);
  if (opts.path) u.searchParams.set('path', opts.path);
  if (opts.prod) u.searchParams.set('prod', opts.prod);
  return u.toString();
}

/**
 * Open Forge in a new tab with production asset context.
 */
export function openInForge(opts = {}) {
  const href = forgeDeepLink(opts);
  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  return href;
}

/**
 * AI worker deploy plan endpoint (Cloudflare Worker).
 * Returns URL for fetch POST { assets: [...] }.
 */
export function aiDeployPlanUrl() {
  return `${FLEET_HOSTS.aiWorker}/plan`;
}

/**
 * Snippet: load production GLB + equip multipack + open Forge.
 */
export function fleetIntegrationSnippet(m, extra = {}) {
  const cdn = m?.cdnUrl || '';
  const uuid = m?.grudgeUuid || '';
  const r2 = m?.path || m?.r2Key || '';
  const forge = forgeDeepLink({
    assetUrl: cdn,
    r2Key: r2,
    grudgeUuid: uuid,
    workspace: extra.workspace || 'assets',
    animPack: extra.animPack,
    raceId: extra.raceId,
    meshName: extra.meshName,
    equipSlot: extra.equipSlot,
    scene: extra.scene,
  });
  return `// Fleet integration — production only
// pipeline: ${FLEET_HOSTS.pipeline}
// forge: ${forge}
// uuid: ${uuid}
// r2Key: ${r2}
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// + DRACO / Meshopt / KTX2 on createGLTFLoader
const url = ${JSON.stringify(cdn)};
// 1) GLTFLoader.loadAsync(url)
// 2) enforceCharacterSi(root) · groundFeetLocal · art-forward +Z (grudge6)
// 3) equip: hide equippable → show mesh_ids (never swap whole body)
// 4) anim pack Bip001 stripPositionTracks → mixer on kit root
// 5) open Forge scene / weapon skills:
//    ${forge}
`;
}

/**
 * Infer preferred anim pack from mesh names / weapon type string.
 */
export function inferAnimPack(hint = '') {
  const h = String(hint || '').toLowerCase();
  if (/bow|crossbow|arrow|longbow/.test(h)) return ANIM_PACKS.longbow;
  if (/staff|wand|magic|tome|spell/.test(h)) return ANIM_PACKS.magic;
  if (/great|2h|axe|hammer|mace|spear|greataxe/.test(h)) return ANIM_PACKS['2h_melee'];
  if (/mount|horse|cavalry/.test(h)) return ANIM_PACKS.cavalry;
  if (/fist|unarmed|punch/.test(h)) return ANIM_PACKS.unarmed;
  return ANIM_PACKS.sword_shield;
}
