/**
 * Shared Three.js helpers for grudge-pipeline viewer + thumbs.
 * Aligns with threejs-production-best-practices (r152–r185 color + dispose).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const DRACO_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/** Cap fill-rate on HiDPI (skill: ≤ 1.5). */
export const MAX_PIXEL_RATIO = 1.5;

let sharedGltf = null;
let sharedDraco = null;

/**
 * Reuse one GLTFLoader + DRACO decoder across loads (no per-asset decoder alloc).
 */
export function getGltfLoader() {
  if (!sharedGltf) {
    sharedDraco = new DRACOLoader();
    sharedDraco.setDecoderPath(DRACO_CDN);
    sharedGltf = new GLTFLoader();
    sharedGltf.setDRACOLoader(sharedDraco);
  }
  return sharedGltf;
}

/**
 * Apply production renderer defaults (sRGB + ACES, capped DPR).
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ maxDpr?: number, exposure?: number, preserveDrawingBuffer?: boolean }} [opts]
 */
export function configureRenderer(renderer, opts = {}) {
  const maxDpr = opts.maxDpr ?? MAX_PIXEL_RATIO;
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1.05;
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = false; // pipeline viewer: no shadows (cheaper)
  }
}

/**
 * Create a production-oriented WebGLRenderer for the asset viewer.
 * @param {HTMLElement} wrap
 */
export function createViewerRenderer(wrap) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: false,
  });
  renderer.setSize(wrap.clientWidth, Math.max(1, wrap.clientHeight));
  configureRenderer(renderer, { maxDpr: MAX_PIXEL_RATIO, exposure: 1.05 });
  return renderer;
}

/**
 * Dispose geometries, materials, and maps under a root (permanent remove).
 * @param {THREE.Object3D|null} root
 */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key of [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'emissiveMap',
          'aoMap',
          'alphaMap',
          'bumpMap',
          'displacementMap',
          'envMap',
          'lightMap',
        ]) {
          m[key]?.dispose?.();
        }
        m.dispose?.();
      }
    }
  });
}

/**
 * Production mesh prep after load: sRGB maps, skinned frustum, no alloc later.
 * @param {THREE.Object3D} root
 */
export function prepareLoadedRoot(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      // Skinned bounds often wrong until first update
      o.frustumCulled = false;
    }
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map && m.map.colorSpace !== THREE.SRGBColorSpace) {
          m.map.colorSpace = THREE.SRGBColorSpace;
          m.map.needsUpdate = true;
        }
        if (m.emissiveMap && m.emissiveMap.colorSpace !== THREE.SRGBColorSpace) {
          m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          m.emissiveMap.needsUpdate = true;
        }
      }
    }
  });
}

/**
 * Load GLB/GLTF (Draco) or FBX. Prefer GLB for game delivery.
 * @param {string} url
 * @returns {Promise<{ scene: THREE.Object3D, animations: THREE.AnimationClip[] }>}
 */
export async function loadGltfOrFbxShared(url) {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.fbx')) {
    const loader = new FBXLoader();
    try {
      const u = new URL(url);
      loader.setResourcePath(u.href.slice(0, u.href.lastIndexOf('/') + 1));
    } catch {
      /* ignore */
    }
    const fbx = await loader.loadAsync(url);
    prepareLoadedRoot(fbx);
    return { scene: fbx, animations: fbx.animations || [] };
  }
  const gltf = await getGltfLoader().loadAsync(url);
  prepareLoadedRoot(gltf.scene);
  return { scene: gltf.scene, animations: gltf.animations || [] };
}

/**
 * Reject HTML fake-200 and empty bodies via lightweight GET range/probe.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isLikelyBinaryAsset(url) {
  try {
    const r = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { Range: 'bytes=0-15' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok && r.status !== 206) return false;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('text/plain') && !ct.includes('json')) {
      // some CDNs serve glb as octet-stream; plain text only fail if body is HTML
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 4) return false;
    // glb magic 'glTF'
    if (buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) return true;
    // FBX binary Kaydara
    const head = new TextDecoder().decode(buf.slice(0, 16));
    if (head.includes('Kaydara') || head.includes('FBX')) return true;
    // JSON clip
    if (buf[0] === 0x7b /* { */) return true;
    // octet-stream / model/* without magic — allow if not HTML
    if (ct.includes('html')) return false;
    if (ct.includes('model') || ct.includes('octet-stream') || ct.includes('json')) return true;
    // avoid treating full HTML as model
    if (head.includes('<!DOC') || head.includes('<html')) return false;
    return buf.length > 0;
  } catch {
    return false;
  }
}
