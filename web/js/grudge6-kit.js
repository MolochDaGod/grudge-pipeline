/**
 * @grudge-studio/grudge6-kit (ObjectStore js/)
 *
 * Shared modular race kit loader + equipment for Grudge games / browse.
 * SSOT mesh: race FBX on assets CDN. Equip = child-mesh visibility + D1 mesh_ids.
 *
 * Usage (browser module):
 *   import { RACE_ASSETS, loadRaceKit, EquipmentManager, bindRaceAtlas } from './grudge6-kit.js';
 *   const { root, equip, race } = await loadRaceKit(THREE, { FBXLoader, GLTFLoader }, 'human', { source: 'fbx' });
 *   equip.applyMeshIds(['WK_Units_Body_A', 'WK_weapon_sword_A']);
 */
export const CDN = 'https://assets.grudge-studio.com';

/**
 * Canonical race kits — production browser SSOT = GLB on assets CDN.
 * FBX remains on CDN for convert/author only (not catalog inventory).
 */
export const RACE_ASSETS = {
  human: {
    id: 'human',
    prefix: 'WK_',
    folder: 'western-kingdoms',
    texture: 'WK_Standard_Units.webp',
    fbx: `${CDN}/models/grudge6/races/WK_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/WK_Characters.glb`,
  },
  barbarian: {
    id: 'barbarian',
    prefix: 'BRB_',
    folder: 'barbarians',
    texture: 'BRB_StandardUnits_texture.webp',
    fbx: `${CDN}/models/grudge6/races/BRB_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/BRB_Characters.glb`,
  },
  orc: {
    id: 'orc',
    prefix: 'ORC_',
    folder: 'orcs',
    texture: 'ORC_StandardUnits.webp',
    fbx: `${CDN}/models/grudge6/races/ORC_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/ORC_Characters.glb`,
  },
  elf: {
    id: 'elf',
    prefix: 'ELF_',
    folder: 'elves',
    texture: 'ELF_HighElves_Texture.webp',
    fbx: `${CDN}/models/grudge6/races/ELF_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/ELF_Characters.glb`,
  },
  undead: {
    id: 'undead',
    prefix: 'UD_',
    folder: 'undead',
    texture: 'UD_Standard_Units.webp',
    fbx: `${CDN}/models/grudge6/races/UD_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/UD_Characters.glb`,
  },
  dwarf: {
    id: 'dwarf',
    prefix: 'DWF_',
    folder: 'dwarves',
    texture: 'DWF_Standard_Units.webp',
    fbx: `${CDN}/models/grudge6/races/DWF_Characters.fbx`,
    glb: `${CDN}/models/grudge6/races/DWF_Characters.glb`,
  },
};

/** Legacy / stub paths games must NOT use (overwrite on CDN or rewrite in loaders) */
export const BLOCKED_ASSET_PREFIXES = [
  'models/characters/grudge6/',
  'models/characters/grudge6/race/',
  'models/characters/grudge6/metaverse/',
];

export const STUB_MAX_BYTES = 50_000; // known bad placeholder ~44089

export const SLOT_DEFS = [
  { slot: 'body', re: /^(?:Units_)?Body_([A-Z])$/i, group: 'armor' },
  { slot: 'arms', re: /^(?:Units_)?Arms_([A-Z])$/i, group: 'armor' },
  { slot: 'legs', re: /^(?:Units_)?Legs_([A-Z])$/i, group: 'armor' },
  { slot: 'head', re: /^(?:Units_)?Head_([A-Z])$/i, group: 'armor' },
  { slot: 'shoulders', re: /^(?:Units_)?Shoulderpads_([A-Z])$/i, group: 'armor' },
  { slot: 'axe', re: /^(?:Units_|weapon_|Weapon_)?[Aa]xe(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'hammer', re: /^(?:Units_|weapon_|Weapon_)?[Hh]ammer(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'mace', re: /^(?:Units_|weapon_|Weapon_)?[Mm]ace(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'sword', re: /^(?:Units_|weapon_|Weapon_)?[Ss]word(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'dagger', re: /^(?:Units_|weapon_|Weapon_)?[Dd]agger(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'pick', re: /^(?:Units_|weapon_|Weapon_)?[Pp]ick(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'spear', re: /^(?:Units_|weapon_|Weapon_)?[Ss]pear(?:_([A-Z]))?$/i, group: 'weapon_r' },
  { slot: 'bow', re: /^(?:Units_|weapon_|Weapon_)?[Bb]ow$/i, group: 'weapon_l', noVariant: true },
  { slot: 'staff', re: /^(?:Units_|weapon_|Weapon_)?[Ss]taff_([A-Z])$/i, group: 'weapon_l' },
  { slot: 'shield', re: /^(?:Units_)?[Ss]hield_([A-Z])$/i, group: 'shield' },
  { slot: 'bag', re: /^(?:Xtra_|Units_)?[Bb]ag$/i, group: 'utility', noVariant: true },
  { slot: 'wood', re: /^(?:Xtra_|Units_)?[Ww]ood$/i, group: 'utility', noVariant: true },
  { slot: 'quiver', re: /^(?:Xtra_|Units_)?[Qq]uiver$/i, group: 'utility', noVariant: true },
];

export const WEAPON_R = new Set(['axe', 'hammer', 'mace', 'sword', 'dagger', 'pick', 'spear']);
export const WEAPON_L = new Set(['bow', 'staff']);

/**
 * STONE atlas path (verified 200 on assets CDN):
 *   /textures/grudge6/{folder}/{texture}.webp
 * Legacy invent path /assets/{folder}/textures/* is 404 — never use it.
 */
export function atlasUrl(raceId) {
  const a = RACE_ASSETS[raceId];
  if (!a) return null;
  return `${CDN}/textures/grudge6/${a.folder}/${a.texture}`;
}

/** All candidate atlas URLs (primary first) for load fallback. */
export function atlasUrlCandidates(raceId) {
  const a = RACE_ASSETS[raceId];
  if (!a) return [];
  return [
    `${CDN}/textures/grudge6/${a.folder}/${a.texture}`,
    // legacy invent (usually 404 — last resort only)
    `${CDN}/assets/${a.folder}/textures/${a.texture}`,
  ];
}

/** Production default source = GLB. Pass source:'fbx' only for convert tools. */
export function kitUrl(raceId, source = 'glb') {
  const a = RACE_ASSETS[raceId];
  if (!a) return null;
  if (source === 'fbx' || source === 'author') return a.fbx;
  return a.glb;
}

/**
 * STONE ONLY — production grudge6 character inventory (meshes).
 * GLB race kits on assets CDN. Everything else under grudge6/ is trash/index-noise.
 *
 *   models/grudge6/races/{WK|BRB|ELF|DWF|ORC|UD}_Characters.glb
 *   textures/grudge6/{folder}/*.webp  (atlases)
 *
 * FBX remains on R2 for convert tooling only — not catalog inventory.
 * Anims: anims/baked/** only (handled separately as baked-bip001).
 */
export const GRUDGE6_SSOT_KIT_RE =
  /^models\/grudge6\/races\/(wk|brb|elf|dwf|orc|ud)_characters\.glb$/i;

export const GRUDGE6_SSOT_ATLAS_RE = /^textures\/grudge6\//i;

/** True if path is the only allowed production character kit GLB. */
export function isGrudge6SsotKitPath(pathOrUrl) {
  const key = normalizeAssetKey(pathOrUrl);
  return GRUDGE6_SSOT_KIT_RE.test(key);
}

export function isGrudge6SsotAtlasPath(pathOrUrl) {
  return GRUDGE6_SSOT_ATLAS_RE.test(normalizeAssetKey(pathOrUrl));
}

/** Any path that mentions grudge6 / race multipacks / arena characters. */
export function isGrudge6RelatedPath(pathOrUrl) {
  const key = normalizeAssetKey(pathOrUrl);
  if (!key) return false;
  return (
    key.includes('grudge6') ||
    /models\/characters\/grudge6\//i.test(key) ||
    /cdn\/assets\/characters\//i.test(key) ||
    /models\/grudge6\//i.test(key) ||
    /models\/animations\/grudge6/i.test(key) ||
    /_characters\.(glb|fbx)$/i.test(key)
  );
}

/**
 * TRASH — never inventory, never load, never deep-link.
 * Everything grudge6-related that is NOT the stone races GLB (or atlas).
 */
export const GRUDGE6_TRASH_PATH_RE = [
  /^models\/grudge6\/(wk|brb|ud|orc|elf|dwf)\//i,
  /^models\/grudge6\/30characters/i,
  /^models\/characters\/grudge6\//i,
  /^models\/grudge6\/(?:race|metaverse)\//i,
  /^models\/grudge6\/races\/library\//i,
  /^models\/animations\/grudge6/i,
  /cdn\/assets\/characters\//i,
  // Author FBX race kits — convert source only, not inventory
  /^models\/grudge6\/races\/(wk|brb|elf|dwf|orc|ud)_characters\.fbx$/i,
  // Any other models/grudge6/* that is not the 6 production GLBs
  /^models\/grudge6\/(?!races\/(wk|brb|elf|dwf|orc|ud)_characters\.glb$)/i,
];

function normalizeAssetKey(pathOrUrl) {
  return String(pathOrUrl || '')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')
    .toLowerCase();
}

/** True if path is a known-bad / non-SSOT grudge6 index row. */
export function isTrashGrudge6Path(pathOrUrl) {
  const key = normalizeAssetKey(pathOrUrl);
  if (!key) return false;
  // Explicit allowlist wins
  if (isGrudge6SsotKitPath(key) || isGrudge6SsotAtlasPath(key)) return false;
  if (GRUDGE6_TRASH_PATH_RE.some((re) => re.test(key))) return true;
  // Related but not SSOT kit/atlas → trash
  if (isGrudge6RelatedPath(key) && !isGrudge6SsotKitPath(key) && !isGrudge6SsotAtlasPath(key)) {
    // baked anims under anims/baked are NOT trash
    if (/^anims\/baked\//i.test(key)) return false;
    return true;
  }
  return false;
}

/** Six production kit r2Keys (GLB only). */
export function grudge6SsotKitKeys() {
  return Object.values(RACE_ASSETS).map((a) =>
    a.glb.replace(/^https?:\/\/assets\.grudge-studio\.com\//i, ''),
  );
}

/**
 * Detect race kit from any path/uuid blob → fleet race id (human|barbarian|…).
 * @returns {string|null}
 */
export function detectFleetRaceId(pathOrUrl) {
  const key = String(pathOrUrl || '')
    .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '')
    .replace(/\\/g, '/')
    .toLowerCase();
  if (!key) return null;
  if (/brb_|\/brb\/|barbarian/.test(key)) return 'barbarian';
  if (/elf_|\/elf\/|high-?elf|elves/.test(key)) return 'elf';
  if (/dwf_|\/dwf\/|dwarf/.test(key)) return 'dwarf';
  if (/orc_|\/orc\//.test(key)) return 'orc';
  if (/ud_|\/ud\/|undead/.test(key)) return 'undead';
  if (/wk_|\/wk\/|western|human/.test(key)) return 'human';
  const races = key.match(/races\/(wk|brb|ud|orc|elf|dwf)_characters/i);
  if (races) {
    return (
      {
        wk: 'human',
        brb: 'barbarian',
        ud: 'undead',
        orc: 'orc',
        elf: 'elf',
        dwf: 'dwarf',
      }[races[1].toLowerCase()] || null
    );
  }
  return null;
}

/**
 * Folder / prefix → fleet race id
 * D1 still indexes legacy keys like models/grudge6/ud/UD_Characters.glb
 * (uuid d762b5b8-…) — those must rewrite to models/grudge6/races/* SSOT.
 */
const LEGACY_RACE_MAP = {
  human: 'human',
  wk: 'human',
  western: 'human',
  'western-kingdoms': 'human',
  elf: 'elf',
  elves: 'elf',
  'high-elves': 'elf',
  dwarf: 'dwarf',
  dwarves: 'dwarf',
  dwf: 'dwarf',
  orc: 'orc',
  orcs: 'orc',
  undead: 'undead',
  ud: 'undead',
  barbarian: 'barbarian',
  barbarians: 'barbarian',
  brb: 'barbarian',
  goblin: 'orc',
  troll: 'orc',
  dark_elf: 'elf',
};

/** Rewrite known-bad legacy paths to canonical race kit or mesh library */
export function resolveCanonicalAssetUrl(urlOrKey) {
  if (!urlOrKey) return urlOrKey;
  const s = String(urlOrKey);
  const key = s.replace(/^https?:\/\/assets\.grudge-studio\.com\//, '');
  // models/characters/grudge6/{race}.glb → races kit FBX
  const m = key.match(/^models\/characters\/grudge6\/(?:race\/|metaverse\/)?([a-z_]+)\.glb$/i);
  if (m) {
    const id = m[1].toLowerCase();
    const race = LEGACY_RACE_MAP[id];
    if (race && RACE_ASSETS[race]) return RACE_ASSETS[race].fbx;
  }
  // models/grudge6/{wk|brb|ud|orc|elf|dwf}/XXX_Characters.(glb|fbx) → races SSOT FBX
  const leg = key.match(
    /^models\/grudge6\/(wk|brb|ud|orc|elf|dwf|western-kingdoms|barbarians|undead|orcs|elves|dwarves)\/[A-Za-z0-9_]*Characters\.(glb|fbx)$/i,
  );
  if (leg) {
    const race = LEGACY_RACE_MAP[leg[1].toLowerCase()];
    if (race && RACE_ASSETS[race]) return RACE_ASSETS[race].fbx;
  }
  // models/grudge6/races/UD_Characters.glb → prefer FBX for atlas bind path
  const races = key.match(
    /^models\/grudge6\/races\/(WK|BRB|UD|ORC|ELF|DWF)_Characters\.(glb|fbx)$/i,
  );
  if (races) {
    const map = { WK: 'human', BRB: 'barbarian', UD: 'undead', ORC: 'orc', ELF: 'elf', DWF: 'dwarf' };
    const race = map[races[1].toUpperCase()];
    if (race && RACE_ASSETS[race]) return RACE_ASSETS[race].fbx;
  }
  // toon-rts separate equipment → prefer mesh library path (best-effort naming)
  const eq = key.match(
    /^asset-packs\/toon-rts-characters\/glb\/equipment\/([a-z]+)\/([A-Za-z0-9_]+)\.glb$/i,
  );
  if (eq) {
    const race = eq[1].toLowerCase();
    const base = eq[2];
    if (RACE_ASSETS[race]) {
      // Prefer library A-variant when name has no letter: WK_weapon_sword → WK_weapon_sword_A
      const stem = /_[A-Z]$/i.test(base) ? base : `${base}_A`.replace(/_A_A$/, '_A');
      // Shield/bow naming variants handled by callers; return library URL for primary form
      const lib = `${CDN}/models/grudge6/races/library/${race}/${stem}.glb`;
      return lib;
    }
  }
  return s.startsWith('http') ? s : `${CDN}/${key}`;
}

export function meshKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^wk_|^brb_|^orc_|^elf_|^ud_|^dwf_/, '')
    .replace(/units_/g, '')
    .replace(/xtra_/g, '')
    .replace(/weapon_/g, 'weapon')
    .replace(/shield_/g, 'shield')
    .replace(/shoulderpads_/g, 'shoulders')
    .replace(/[^a-z0-9]/g, '');
}

export function meshMatchesId(meshName, meshId) {
  if (!meshName || !meshId) return false;
  if (meshName === meshId) return true;
  if (meshName.endsWith(meshId) || meshId.endsWith(meshName)) return true;
  const a = meshKey(meshName);
  const b = meshKey(meshId);
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export class EquipmentManager {
  constructor(prefix) {
    this.prefix = prefix.endsWith('_') ? prefix : `${prefix}_`;
    this.slots = {};
    this.equipped = {};
    this.allMeshes = [];
    this.root = null;
  }

  catalog(root) {
    this.root = root;
    this.slots = {};
    this.allMeshes = [];
    this.equipped = {};
    root.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.visible = false;
      this.allMeshes.push(child);
      const stripped = child.name.startsWith(this.prefix)
        ? child.name.slice(this.prefix.length)
        : child.name;
      for (const def of SLOT_DEFS) {
        const match = stripped.match(def.re);
        if (!match) continue;
        const variant = def.noVariant
          ? '_default'
          : (match[1] || '_default').toUpperCase();
        if (!this.slots[def.slot]) this.slots[def.slot] = {};
        this.slots[def.slot][variant] = child;
        child.userData.equipSlot = def.slot;
        child.userData.equipVariant = variant;
        child.userData.equipGroup = def.group;
        break;
      }
    });
    return this.summary();
  }

  summary() {
    const out = {};
    for (const [slot, variants] of Object.entries(this.slots)) {
      out[slot] = Object.keys(variants).sort();
    }
    return out;
  }

  equip(slot, variant) {
    const variants = this.slots[slot];
    if (!variants) return false;
    for (const [v, mesh] of Object.entries(variants)) {
      mesh.visible = v === variant;
    }
    this.equipped[slot] = variant;
    return true;
  }

  equipWeapon(slot, variant = '_default') {
    const def = SLOT_DEFS.find((d) => d.slot === slot);
    if (!def) return false;
    for (const mesh of this.allMeshes) {
      if (mesh.userData.equipGroup === def.group) {
        mesh.visible = false;
        delete this.equipped[mesh.userData.equipSlot];
      }
    }
    return this.equip(slot, variant);
  }

  /** UI helper: all meshes with equip metadata */
  listAllMeshes() {
    return this.allMeshes
      .map((m) => ({
        name: m.name,
        slot: m.userData.equipSlot,
        variant: m.userData.equipVariant,
        group: m.userData.equipGroup,
        visible: m.visible,
        mesh: m,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  unequip(slot) {
    const variants = this.slots[slot];
    if (!variants) return;
    for (const mesh of Object.values(variants)) mesh.visible = false;
    delete this.equipped[slot];
  }

  hideGroup(group) {
    for (const mesh of this.allMeshes) {
      if (mesh.userData.equipGroup === group) {
        mesh.visible = false;
        delete this.equipped[mesh.userData.equipSlot];
      }
    }
  }

  applyDefaultLoadout() {
    for (const slot of ['body', 'arms', 'legs', 'head', 'shoulders']) {
      const variants = this.slots[slot];
      if (!variants) continue;
      const keys = Object.keys(variants).sort();
      const pick = keys.includes('A') ? 'A' : keys[0];
      if (pick) this.equip(slot, pick);
    }
    if (this.slots.sword) {
      const v = this.slots.sword.A ? 'A' : Object.keys(this.slots.sword).sort()[0];
      this.equipWeapon('sword', v);
    } else {
      for (const slot of WEAPON_R) {
        if (this.slots[slot]) {
          this.equipWeapon(slot, Object.keys(this.slots[slot]).sort()[0]);
          break;
        }
      }
    }
    // HARD: never leave multipack fully invisible ("no mesh")
    if (!this.allMeshes.some((m) => m.visible)) {
      for (const m of this.allMeshes) {
        if (/body|torso|arms?|legs?|head|helm/i.test(m.name || '')) m.visible = true;
      }
    }
    if (!this.allMeshes.some((m) => m.visible)) {
      for (const m of this.allMeshes) {
        if (m.isSkinnedMesh) m.visible = true;
      }
    }
  }

  /** D1 gear_presets.mesh_ids → visibility */
  applyMeshIds(meshIds = []) {
    const wanted = (meshIds || []).map(String);
    const matched = [];
    const missing = [];
    for (const m of this.allMeshes) m.visible = false;
    this.equipped = {};
    for (const id of wanted) {
      const hit = this.allMeshes.find((m) => meshMatchesId(m.name, id));
      if (hit) {
        hit.visible = true;
        matched.push(hit.name);
        if (hit.userData.equipSlot) {
          this.equipped[hit.userData.equipSlot] = hit.userData.equipVariant;
        }
      } else missing.push(id);
    }
    return { matched, missing, wanted };
  }
}

/**
 * Bind race atlas onto every mesh (MeshStandardMaterial).
 * @param {typeof import('three')} THREE
 */
export function bindRaceAtlas(THREE, root, texture) {
  if (!texture || !root) return 0;
  let n = 0;
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSkinnedMesh) return;
    const prev = obj.material;
    obj.material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      metalness: 0,
      roughness: 0.75,
      side: THREE.DoubleSide,
      alphaTest: 0.02,
    });
    obj.castShadow = true;
    obj.receiveShadow = true;
    n++;
    try {
      if (Array.isArray(prev)) prev.forEach((m) => m?.dispose?.());
      else prev?.dispose?.();
    } catch {
      /* */
    }
  });
  return n;
}

/** Invert UV V (Blender glTF often differs from FBXLoader space for these kits) */
export function invertGeometryUVV(root) {
  const seen = new Set();
  root.traverse((obj) => {
    const g = obj.geometry;
    if (!g?.attributes?.uv) return;
    if (seen.has(g.uuid)) return;
    seen.add(g.uuid);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    uv.needsUpdate = true;
  });
}

export function groundYHip(root, THREE, targetH = 1.7) {
  root.position.set(0, 0, 0);
  root.scale.setScalar(1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.01) {
    root.scale.setScalar(targetH / size.y);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
  }
  root.position.y = -box.min.y;
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  return { height: box.max.y - box.min.y };
}

const texCache = new Map();

export async function loadRaceTexture(THREE, raceId) {
  const candidates = atlasUrlCandidates(raceId);
  if (!candidates.length) return null;
  for (const url of candidates) {
    if (texCache.has(url)) return texCache.get(url);
    const loader = new THREE.TextureLoader();
    const tex = await new Promise((resolve) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = false;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          t.anisotropy = 8;
          t.needsUpdate = true;
          texCache.set(url, t);
          resolve(t);
        },
        undefined,
        () => resolve(null),
      );
    });
    if (tex) return tex;
  }
  return null;
}

/**
 * Load race kit + catalog equipment + bind atlas.
 * @param {object} loaders { FBXLoader, GLTFLoader } classes
 * @param {string} raceId
 * @param {{ source?: 'fbx'|'glb', meshIds?: string[], ground?: boolean }} opts
 */
export async function loadRaceKit(THREE, loaders, raceId, opts = {}) {
  const race = RACE_ASSETS[raceId];
  if (!race) throw new Error(`Unknown race: ${raceId}`);
  const source = opts.source || 'fbx';
  let url = kitUrl(raceId, source);
  url = resolveCanonicalAssetUrl(url);

  let root;
  let animations = [];
  if (/\.fbx($|\?)/i.test(url)) {
    const loader = new loaders.FBXLoader();
    root = await loader.loadAsync(url);
    animations = root.animations || [];
  } else {
    const loader = new loaders.GLTFLoader();
    const gltf = await loader.loadAsync(url);
    root = gltf.scene || gltf;
    animations = gltf.animations || [];
    if (source !== 'fbx') invertGeometryUVV(root);
  }

  const tex = await loadRaceTexture(THREE, raceId);
  const matCount = tex ? bindRaceAtlas(THREE, root, tex) : 0;

  const equip = new EquipmentManager(race.prefix);
  equip.catalog(root);
  let equipResult = null;
  if (opts.meshIds?.length) equipResult = equip.applyMeshIds(opts.meshIds);
  else equip.applyDefaultLoadout();

  let ground = null;
  if (opts.ground !== false) ground = groundYHip(root, THREE, opts.targetHeight ?? 1.7);

  return {
    root,
    animations,
    equip,
    race,
    url,
    source,
    atlas: tex,
    matCount,
    equipResult,
    ground,
  };
}
