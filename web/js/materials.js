/**
 * Material prep for pipeline viewer + thumbs.
 *
 * Fixes the common "yellow arrow" failure mode:
 * - FBX2glTF / craftpix-batch embeds a 1×1 PNG placeholder when the real
 *   atlas path was missing at convert time (e.g. Texture_MAp_bow.png).
 * - prepMaterials previously treated mat.map as success → still yellow/metal sludge.
 *
 * Strategy:
 * 1. Detect broken / placeholder maps (1×1, empty image, missing texture).
 * 2. Strip them and neutralize metalness/color.
 * 3. Optionally rebind known atlases from CDN by material name + asset path.
 */
import * as THREE from 'three';

const R2 = 'https://assets.grudge-studio.com';
const GH = 'https://molochdagod.github.io/ObjectStore';

/** Material-name / path → candidate atlas URLs (first HEAD that works wins). */
export const ATLAS_BINDINGS = [
  {
    id: 'bow-arrow',
    // Material name from FBX2glTF arrows/bows
    matName: /bow[_\s-]?texture|texture[_\s-]?map[_\s-]?bow|Texture_MAp_bow/i,
    path: /weapons\/bow|_arrow_[bc]_|\/arrows\/|bow_full/i,
    urls: [
      `${R2}/models/weapons/bow/Texture_MAp_bow.png`,
      `${R2}/models/weapons/bow/Texture_Map_bow.png`,
      `${GH}/models/weapons/bow/Texture_MAp_bow.png`,
    ],
  },
  {
    id: 'fortress-orcs',
    matName: /Texture_Map_fortress_orcs|fortress_orcs/i,
    path: /battle_towers|Shell_Arrow|Archers_shell|Archer_Tower|fortress/i,
    urls: [
      `${R2}/models/battle_towers/Texture_Map_fortress_orcs.png`,
      `${R2}/models/orc_settlement/texture_map.png`,
      `${R2}/models/craftpix_lowpoly/texture_map.png`,
    ],
  },
];

let textureLoader = null;
const atlasCache = new Map(); // url → Promise<THREE.Texture|null>

function getTextureLoader() {
  if (!textureLoader) {
    textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
  }
  return textureLoader;
}

/** True when the map is a convert-time placeholder or failed load. */
export function isBrokenMap(map) {
  if (!map) return true;
  const img = map.image;
  if (!img) return true;
  // HTMLImageElement / ImageBitmap / Canvas
  const w = img.width ?? img.naturalWidth ?? 0;
  const h = img.height ?? img.naturalHeight ?? 0;
  if (w <= 1 && h <= 1) return true;
  // Incomplete HTML image
  if (typeof img.complete === 'boolean' && img.complete === false) return true;
  return false;
}

function collectMaterials(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of list) {
      if (mat) out.push({ mesh: o, mat });
    }
  });
  return out;
}

/**
 * Sync pass: strip broken maps, kill yellow/chrome defaults.
 * @returns {{ mats: number, withMap: number, brokenMaps: number }}
 */
export function prepMaterials(root) {
  let mats = 0;
  let withMap = 0;
  let brokenMaps = 0;

  for (const { mesh, mat } of collectMaterials(root)) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh.isSkinnedMesh) mesh.frustumCulled = false;
    mats++;

    if (mat.map && isBrokenMap(mat.map)) {
      brokenMaps++;
      try {
        mat.map.dispose?.();
      } catch {
        /* ignore */
      }
      mat.map = null;
      if (mat.color) mat.color.setHex(0xb8c0cc);
    } else if (mat.map) {
      withMap++;
      if ('colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.needsUpdate = true;
      if (mat.color) mat.color.setHex(0xffffff);
    } else if (mat.color) {
      const hex = mat.color.getHex();
      // Untextured: cool grey, never Three yellow / warm default
      if (
        hex === 0xffffff ||
        hex === 0xcccccc ||
        hex === 0xffff00 ||
        hex > 0xe0c060
      ) {
        mat.color.setHex(0xb8c0cc);
      }
    }

    if ('metalness' in mat) {
      if (!mat.envMap && mat.metalness > 0.2) {
        mat.metalness = Math.min(mat.metalness, 0.12);
      }
      if ('roughness' in mat && mat.roughness < 0.35) mat.roughness = 0.55;
    }
    if ('emissive' in mat && mat.emissive?.getHex?.() === 0xffff00) {
      mat.emissive.setHex(0x000000);
    }
    mat.needsUpdate = true;
  }

  return { mats, withMap, brokenMaps };
}

async function loadAtlas(url) {
  if (atlasCache.has(url)) return atlasCache.get(url);
  const p = (async () => {
    try {
      // Prefer HEAD so we skip 404s quickly
      try {
        const head = await fetch(url, {
          method: 'HEAD',
          mode: 'cors',
          signal: AbortSignal.timeout(4000),
        });
        if (!head.ok) return null;
        const ct = (head.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) return null;
      } catch {
        // Some CDNs block HEAD — fall through to load
      }
      const tex = await getTextureLoader().loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      // Reject 1×1 placeholders that somehow live on CDN
      if (isBrokenMap(tex)) {
        tex.dispose();
        return null;
      }
      return tex;
    } catch {
      return null;
    }
  })();
  atlasCache.set(url, p);
  return p;
}

function pickBinding(materialName, assetPath) {
  const name = materialName || '';
  const path = assetPath || '';
  for (const b of ATLAS_BINDINGS) {
    if (b.matName.test(name) || b.path.test(path)) return b;
  }
  return null;
}

/**
 * Async: rebind real atlases for materials that lost textures at convert time.
 * Call after prepMaterials (or it runs prep first).
 *
 * @param {THREE.Object3D} root
 * @param {{ path?: string, cdnUrl?: string, name?: string }} [entry]
 * @returns {Promise<{ rebound: number, atlasUrl: string|null, prep: object }>}
 */
export async function prepAndRebindMaterials(root, entry = {}) {
  const prep = prepMaterials(root);
  const pathHint = [entry.path, entry.cdnUrl, entry.name, entry.r2Key]
    .filter(Boolean)
    .join(' ');

  let rebound = 0;
  let atlasUrl = null;
  const pairs = collectMaterials(root);

  // Group mats that need a map by binding id
  const needByBinding = new Map();
  for (const { mat } of pairs) {
    if (mat.map && !isBrokenMap(mat.map)) continue;
    const binding = pickBinding(mat.name || '', pathHint);
    if (!binding) continue;
    if (!needByBinding.has(binding.id)) needByBinding.set(binding.id, { binding, mats: [] });
    needByBinding.get(binding.id).mats.push(mat);
  }

  for (const { binding, mats } of needByBinding.values()) {
    let tex = null;
    let used = null;
    for (const url of binding.urls) {
      tex = await loadAtlas(url);
      if (tex) {
        used = url;
        break;
      }
    }
    if (!tex) continue;
    atlasUrl = used;
    for (const mat of mats) {
      // Clone texture per material group is fine — share one tex instance
      mat.map = tex;
      if (mat.color) mat.color.setHex(0xffffff);
      if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.1);
      if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0.5, 0.55);
      mat.needsUpdate = true;
      rebound++;
    }
  }

  // Recount after rebind
  const after = prepMaterials(root);
  return {
    rebound,
    atlasUrl,
    prep: {
      mats: after.mats,
      withMap: after.withMap,
      brokenMaps: after.brokenMaps,
      rebound,
    },
  };
}
