/**
 * Offscreen WebGL snapshot capture for pipeline asset cards.
 * Caches JPEG data-URLs in IndexedDB (key = path or uuid).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { prepAndRebindMaterials } from './materials.js';
import {
  inferAssetKind,
  getDeployProfile,
  measureSize,
  computeDeployScale,
} from './deployChecks.js';

const DB_NAME = 'grudge-pipeline-thumbs';
const DB_STORE = 'thumbs';
const DB_VER = 1;
const THUMB_SIZE = 256;
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

let dbPromise = null;
let captureBusy = false;
const queue = [];
let renderer = null;
let scene = null;
let camera = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function thumbGet(key) {
  if (!key || typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result?.dataUrl || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function thumbSet(key, dataUrl) {
  if (!key || !dataUrl || typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ key, dataUrl, at: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* quota — ignore */
  }
}

export async function thumbCount() {
  if (typeof indexedDB === 'undefined') return 0;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(THUMB_SIZE, THUMB_SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1420);
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  scene.add(new THREE.AmbientLight(0xd0d8e8, 0.5));
  scene.add(new THREE.HemisphereLight(0xb8d0ff, 0x2a3038, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ec8ff, 0.4);
  fill.position.set(-3, 1.5, -2);
  scene.add(fill);
}

/**
 * Fit for thumb capture — category-aware (no 1.8 m force on arrows).
 * @param {THREE.Object3D} root
 * @param {string} [url] for kind inference
 */
function fitObject(root, url = '') {
  const profile = getDeployProfile({
    kind: inferAssetKind({ path: url, name: url, cdnUrl: url }),
    path: url,
    name: url,
  });
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let measure = measureSize(size, profile) || 1;
  const { scale } = computeDeployScale(measure, profile);
  if (scale !== 1) {
    root.scale.multiplyScalar(scale);
    root.updateWorldMatrix(true, true);
    box.setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
  }
  // Framing only — fill the thumb square without re-authoring meters
  const span = Math.max(size.x, size.y, size.z, 0.05);
  const frame = Math.min(6, Math.max(0.4, 1.4 / span));
  root.scale.multiplyScalar(frame);
  root.updateWorldMatrix(true, true);
  box.setFromObject(root);
  box.getCenter(center);
  box.getSize(size);
  root.position.sub(center);
  root.position.y += size.y * 0.5;
  root.updateWorldMatrix(true, true);
  const max = Math.max(size.x, size.y, size.z, 0.5);
  camera.position.set(max * 0.95, max * 0.55, max * 1.25);
  camera.lookAt(0, size.y * 0.35, 0);
}

async function loadModel(url) {
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
    return fbx;
  }
  if (lower.endsWith('.json')) {
    // Baked clip — no mesh; caller should pass a character host
    return null;
  }
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

function disposeObject(root) {
  if (!root) return;
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    }
  });
}

/**
 * Capture a thumbnail for a resolvable 3D URL.
 * @param {string} key cache key
 * @param {string} url model URL
 * @param {object} [opts]
 * @param {THREE.Object3D} [opts.hostScene] optional character for anim-only
 * @returns {Promise<string|null>} data URL
 */
export async function captureThumbnail(key, url, opts = {}) {
  if (!url) return null;
  const cached = await thumbGet(key);
  if (cached) return cached;

  ensureRenderer();
  // Clear previous children except lights
  const keep = new Set();
  scene.traverse((o) => {
    if (o.isLight) keep.add(o);
  });
  [...scene.children].forEach((c) => {
    if (!c.isLight) {
      scene.remove(c);
      disposeObject(c);
    }
  });

  let root = null;
  try {
    if (opts.hostScene) {
      const { clone } = await import('three/addons/utils/SkeletonUtils.js');
      root = clone(opts.hostScene);
    } else {
      root = await loadModel(url);
    }
    if (!root) return null;
    await prepAndRebindMaterials(root, { path: url, cdnUrl: url });
    fitObject(root, url);
    scene.add(root);
    // Two frames for skins
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.82);
    scene.remove(root);
    disposeObject(root);
    await thumbSet(key, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn('[thumb]', key, e.message || e);
    if (root) {
      scene.remove(root);
      disposeObject(root);
    }
    return null;
  }
}

/**
 * Queue thumbnail jobs with concurrency 1 (WebGL context safe).
 * job: { key, url, hostScene?, onDone(dataUrl|null) }
 */
export function enqueueThumb(job) {
  queue.push(job);
  pumpQueue();
}

function pumpQueue() {
  if (captureBusy || !queue.length) return;
  captureBusy = true;
  const job = queue.shift();
  captureThumbnail(job.key, job.url, { hostScene: job.hostScene })
    .then((url) => job.onDone?.(url))
    .catch(() => job.onDone?.(null))
    .finally(() => {
      captureBusy = false;
      // Yield so UI stays responsive
      setTimeout(pumpQueue, 30);
    });
}

export function thumbQueueLength() {
  return queue.length + (captureBusy ? 1 : 0);
}

export function clearThumbQueue() {
  queue.length = 0;
}
