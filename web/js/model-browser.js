/**
 * model-browser.js — Pipeline Model Browser
 * Loads pipeline-models.json, renders filterable model grid,
 * opens Three.js GLB viewer on click.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Also try ObjectStore registry as fallback
const REGISTRY_URLS = [
  'api/pipeline-models.json',
  'https://molochdagod.github.io/ObjectStore/api/v1/models3d.json',
];

let registry = null;
let allModels = [];
let activeCategory = null;

// Three.js viewer state
let scene, camera, renderer, controls, mixer, clock, currentModel;
let wireframeMode = false;
let autoRotate = true;
let animFrameId;

// ── Load registry ──────────────────────────────────────
async function loadRegistry() {
  for (const url of REGISTRY_URLS) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        registry = await res.json();
        allModels = registry.models || [];
        console.log(`Loaded registry from ${url}: ${allModels.length} models`);
        return;
      }
    } catch { /* try next */ }
  }
  console.warn('No registry loaded');
  allModels = [];
}

// ── Render UI ──────────────────────────────────────────
function updateStats() {
  document.getElementById('totalModels').textContent = registry?.totalModels || '0';
  document.getElementById('totalCategories').textContent = Object.keys(registry?.byCategory || {}).length;
  const totalKB = allModels.reduce((s, m) => s + (m.sizeKB || 0), 0);
  document.getElementById('totalSize').textContent = totalKB > 1024
    ? `${(totalKB / 1024).toFixed(1)} MB` : `${totalKB} KB`;
}

function renderCategoryFilters() {
  const row = document.getElementById('categoryFilters');
  const cats = Object.entries(registry?.byCategory || {}).sort((a, b) => b[1] - a[1]);

  let html = `<button class="filter-btn ${!activeCategory ? 'active' : ''}" onclick="window._filterCategory(null)">All (${allModels.length})</button>`;
  for (const [cat, count] of cats) {
    html += `<button class="filter-btn ${activeCategory === cat ? 'active' : ''}" onclick="window._filterCategory('${cat}')">${cat} (${count})</button>`;
  }
  row.innerHTML = html;
}

function renderModelGrid(models) {
  const grid = document.getElementById('modelGrid');
  const empty = document.getElementById('emptyState');

  if (models.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = models.slice(0, 200).map((m, i) => `
    <div class="model-card" onclick="window._openViewer(${i})" title="${m.name}">
      <div class="model-icon">
        <span class="format-badge">${m.format || 'GLB'}</span>
        <span class="category-badge">${m.category || ''}</span>
        🧊
      </div>
      <div class="model-name">${m.name}</div>
      <div class="model-meta">${m.sizeKB || 0} KB · ${m.meshes || 0} meshes · ${m.animations || 0} anims</div>
    </div>
  `).join('');

  document.getElementById('resultsCount').textContent = `${models.length} models`;
}

function filterModels() {
  const query = document.getElementById('searchBox').value.toLowerCase().trim();
  let filtered = allModels;
  if (activeCategory) filtered = filtered.filter(m => m.category === activeCategory);
  if (query) filtered = filtered.filter(m =>
    m.name.toLowerCase().includes(query) ||
    (m.category || '').toLowerCase().includes(query)
  );
  renderModelGrid(filtered);
  document.getElementById('resultsTitle').textContent = activeCategory || 'All Models';
}

// ── Three.js Viewer ────────────────────────────────────
function initViewer() {
  const wrap = document.getElementById('viewerCanvasWrap');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  camera = new THREE.PerspectiveCamera(50, wrap.clientWidth / wrap.clientHeight, 0.01, 1000);
  camera.position.set(0, 1.5, 3);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  wrap.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = autoRotate;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(3, 5, 4);
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0x8888ff, 0x443322, 0.5));

  // Grid
  scene.add(new THREE.GridHelper(10, 10, 0x333355, 0x222244));

  clock = new THREE.Clock();

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  });
}

async function loadModel(modelEntry) {
  // Clear previous
  if (currentModel) { scene.remove(currentModel); currentModel = null; }
  if (mixer) { mixer.stopAllAction(); mixer = null; }

  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(dracoLoader);

  // Resolve model URL
  let url = modelEntry.path;
  if (!url.startsWith('http')) {
    // Try ObjectStore base URL
    url = `https://molochdagod.github.io/ObjectStore/${modelEntry.path}`;
  }

  try {
    const gltf = await loader.loadAsync(url);
    currentModel = gltf.scene;
    scene.add(currentModel);

    // Auto-fit camera
    const box = new THREE.Box3().setFromObject(currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim * 1.5);
    controls.target.copy(center);

    // Animations
    const animSelect = document.getElementById('animSelect');
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(currentModel);
      animSelect.style.display = 'inline-block';
      animSelect.innerHTML = '<option value="">— Animations —</option>' +
        gltf.animations.map((a, i) => `<option value="${i}">${a.name || `Clip ${i}`}</option>`).join('');

      // Auto-play first
      mixer.clipAction(gltf.animations[0]).play();
      animSelect.value = '0';
    } else {
      animSelect.style.display = 'none';
    }

    // Store animations for playback
    window._currentAnimations = gltf.animations;

    document.getElementById('viewerInfo').textContent =
      `${modelEntry.sizeKB || 0} KB · ${modelEntry.meshes || 0} meshes · ${gltf.animations.length} anims`;
  } catch (e) {
    console.error('Load failed:', e);
    document.getElementById('viewerInfo').textContent = `Load error: ${e.message}`;
  }
}

// ── Global handlers ────────────────────────────────────
window._filterCategory = (cat) => {
  activeCategory = cat;
  renderCategoryFilters();
  filterModels();
};

window._openViewer = (index) => {
  const filtered = getFilteredModels();
  const model = filtered[index];
  if (!model) return;

  document.getElementById('viewerOverlay').classList.add('active');
  document.getElementById('viewerTitle').textContent = model.name;

  if (!renderer) initViewer();
  loadModel(model);
};

window.closeViewer = () => {
  document.getElementById('viewerOverlay').classList.remove('active');
  if (currentModel) { scene.remove(currentModel); currentModel = null; }
  if (mixer) { mixer.stopAllAction(); mixer = null; }
};

window.toggleWireframe = () => {
  wireframeMode = !wireframeMode;
  if (currentModel) {
    currentModel.traverse(obj => {
      if (obj.isMesh) obj.material.wireframe = wireframeMode;
    });
  }
};

window.toggleAutoRotate = () => {
  autoRotate = !autoRotate;
  if (controls) controls.autoRotate = autoRotate;
};

window.playAnimation = (indexStr) => {
  if (!mixer || !window._currentAnimations) return;
  mixer.stopAllAction();
  const idx = parseInt(indexStr);
  if (!isNaN(idx) && window._currentAnimations[idx]) {
    mixer.clipAction(window._currentAnimations[idx]).play();
  }
};

function getFilteredModels() {
  const query = document.getElementById('searchBox').value.toLowerCase().trim();
  let filtered = allModels;
  if (activeCategory) filtered = filtered.filter(m => m.category === activeCategory);
  if (query) filtered = filtered.filter(m =>
    m.name.toLowerCase().includes(query) || (m.category || '').toLowerCase().includes(query)
  );
  return filtered;
}

// ── Init ───────────────────────────────────────────────
async function init() {
  await loadRegistry();
  updateStats();
  renderCategoryFilters();
  filterModels();
  document.getElementById('searchBox').addEventListener('input', filterModels);
}

init();
