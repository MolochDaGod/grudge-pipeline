/**
 * Grudge Pipeline model browser
 * - Multi-source catalog (D1 assets, ObjectStore models3d, curated grudge6)
 * - Search + kind/group/format/source filters
 * - Material prep (no yellow / chrome untextured junk)
 * - Animation clips play on a real grudge6 character kit
 * - Deploy diagnostics: height, feet Y, pelvis XZ, bones, hands
 * - Grudge UUID verification + 3D snapshot thumbnails (IndexedDB)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  verifyAll,
  uuidStatusClass,
  grudgeUuidFromR2Key,
  isValidUuid,
  findCatalogDuplicates,
  callDeployAi,
} from './uuid-verify.js';
import {
  thumbGet,
  thumbCount,
  enqueueThumb,
  thumbQueueLength,
  clearThumbQueue,
} from './thumbnail-capture.js';
import {
  r2KeyOf,
  cdnUrlOf,
  openImportSnippet,
  animPackHint,
  readinessOf,
  copyText,
  resolveCdnThumb,
  productionScore,
  isProductionDeployReady,
  productionBadge,
} from './use-contract.js';
import {
  raceKitDeployUrls,
  inferEquipSlot,
  isGameplayProductionGlb,
  hasProductionSurface,
} from './productionBake.js';
import {
  prepMaterials,
  prepAndRebindMaterials,
  applyMeshColor,
  applyMeshTexture,
  materialHealth,
} from './materials.js';
import {
  inferAssetKind,
  getDeployProfile,
  measureSize,
  computeDeployScale,
  runDeployChecks,
  deployScore,
} from './deployChecks.js';
import {
  deployCharacterModel,
  reGroundAfterAnimSample,
  stripPositionTracks,
  diagnoseCharacterLook,
  enforceCharacterSi,
  bodyBox as charBodyBox,
  prepareSkinnedMeasure,
} from './characterDeploy.js';
import { scoreHarvestCoverage, matchHarvestNeeds } from './harvestNeeds.js';
import {
  openInForge,
  forgeDeepLink,
  fleetIntegrationSnippet,
  FLEET_HOSTS,
  ANIM_PACKS,
} from './fleetBridge.js';
import {
  modularEquipSlot,
  groupMeshesBySlot,
  applyLoadout,
  renderModularHudHtml,
  guessPreset,
  animPackHintFromLoadout,
} from './modularRaceHud.js';
import {
  renderSkillTreeHtml,
  skillTreeForWeapon,
  BASE_WEAPON_SKILLS,
} from './weaponSkillsContract.js';
import { scoreCombatCoverage } from './projectileVfx.js';
import {
  buildForgeScenePack,
  downloadForgeScenePack,
  openForgeWithScenePack,
  loadSceneCart,
  saveSceneCart,
  addToSceneCart,
  clearSceneCart,
} from './forgeScenePack.js';

// ── Fleet hosts — production deploy first ──
// Prefer: textured · meshed · SI-scaled · converted · glb2glb · R2 GLB
// Author FBX is fallback only. Anim clips: baked Bip001 JSON.
// KILL: grudge-arena …/cdn/assets/characters/* as character host (wrong scale / stale).
const R2 = 'https://assets.grudge-studio.com';
const ARENA = 'https://grudge-arena.grudge-studio.com';
const OPEN = 'https://open.grudge-studio.com';
const D1_API = 'https://api.grudge-studio.com/assets';
const OBJECTSTORE_MODELS = 'https://molochdagod.github.io/ObjectStore/api/v1/models3d.json';
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const PAGE_SIZE = 48;

/** Forbidden host bases for grudge6 race kits (secondary / stale feeds). */
const FORBIDDEN_HOST_SUBSTRINGS = [
  'grudge-arena.grudge-studio.com/cdn/assets/characters',
  'cdn/assets/characters/human',
  'cdn/assets/characters/barbarian',
  'cdn/assets/characters/elf',
  'cdn/assets/characters/dwarf',
  'cdn/assets/characters/orc',
  'cdn/assets/characters/undead',
];

function isForbiddenCharacterHost(url) {
  const u = String(url || '').toLowerCase();
  return FORBIDDEN_HOST_SUBSTRINGS.some((s) => u.includes(s.toLowerCase()));
}

const RACE_KITS = {
  'western-kingdoms': {
    label: 'WK human',
    prefix: 'WK_',
    // Deploy: production GLB (glb2glb). Author: FBX. Never arena character CDN.
    glb: `${R2}/models/grudge6/races/WK_Characters.glb`,
    r2: `${R2}/models/grudge6/races/WK_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/WK_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`,
  },
  barbarians: {
    label: 'Barbarian',
    prefix: 'BRB_',
    fbx: `${R2}/models/grudge6/races/BRB_Characters.fbx`,
    glb: `${R2}/models/grudge6/races/BRB_Characters.glb`,
    r2: `${R2}/models/grudge6/races/BRB_Characters.glb`,
    atlas: `${R2}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`,
  },
  'high-elves': {
    label: 'Elf',
    prefix: 'ELF_',
    fbx: `${R2}/models/grudge6/races/ELF_Characters.fbx`,
    glb: `${R2}/models/grudge6/races/ELF_Characters.glb`,
    r2: `${R2}/models/grudge6/races/ELF_Characters.glb`,
    atlas: `${R2}/textures/grudge6/elves/ELF_HighElves_Texture.webp`,
  },
  dwarves: {
    label: 'Dwarf',
    prefix: 'DWF_',
    fbx: `${R2}/models/grudge6/races/DWF_Characters.fbx`,
    glb: `${R2}/models/grudge6/races/DWF_Characters.glb`,
    r2: `${R2}/models/grudge6/races/DWF_Characters.glb`,
    atlas: `${R2}/textures/grudge6/dwarves/DWF_Standard_Units.webp`,
  },
  orcs: {
    label: 'Orc',
    prefix: 'ORC_',
    fbx: `${R2}/models/grudge6/races/ORC_Characters.fbx`,
    glb: `${R2}/models/grudge6/races/ORC_Characters.glb`,
    r2: `${R2}/models/grudge6/races/ORC_Characters.glb`,
    atlas: `${R2}/textures/grudge6/orcs/ORC_StandardUnits.webp`,
  },
  undead: {
    label: 'Undead',
    prefix: 'UD_',
    fbx: `${R2}/models/grudge6/races/UD_Characters.fbx`,
    glb: `${R2}/models/grudge6/races/UD_Characters.glb`,
    r2: `${R2}/models/grudge6/races/UD_Characters.glb`,
    atlas: `${R2}/textures/grudge6/undead/UD_Standard_Units.webp`,
  },
};

/** Baked Bip001 packs (JSON) — play on character kit */
const BAKED_PACKS = [
  { id: 'magic/standing idle', name: 'Magic Idle', pack: 'magic' },
  { id: 'magic/Standing Walk Forward', name: 'Standing Walk Forward', pack: 'magic' },
  { id: 'magic/Standing Run Forward', name: 'Standing Run Forward', pack: 'magic' },
  { id: 'sword_shield/sword and shield idle', name: 'Sword Shield Idle', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield run', name: 'Sword Shield Run', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield attack', name: 'Sword Shield Attack', pack: 'sword_shield' },
  { id: 'longbow/standing idle 01', name: 'Longbow Idle', pack: 'longbow' },
  { id: 'longbow/standing walk forward', name: 'Longbow Walk', pack: 'longbow' },
  { id: 'longbow/standing run forward', name: 'Longbow Run', pack: 'longbow' },
  { id: 'unarmed/fight_idle', name: 'Unarmed Idle', pack: 'unarmed' },
  { id: 'uploads_2026_06/locomotion/torch run forward', name: 'Torch Run Forward', pack: 'locomotion' },
  { id: 'locomotion/jump', name: 'Jump', pack: 'locomotion' },
  { id: 'locomotion/dodging', name: 'Dodging', pack: 'locomotion' },
];

// ── State ──────────────────────────────────────────────
let allModels = [];
let filtered = [];
let page = 0;
let activeKind = null;
let activeGroup = null;
/** @type {string|null} Prefer glb for game-ready inventory (null = all formats). */
/** Prefer GLB format in inventory for gameplay-ready browsing */
let activeFormat = 'glb';
let activeSource = null;
let activeUuid = null;
let sortKey = 'production';
/**
 * Deploy bake filter — DEFAULT **ready**: only textured / glb2glb production assets.
 * User can switch to "raw" or All to inspect author sources.
 * @type {string|null} null | 'ready' | 'raw'
 */
/** DEFAULT ready = game-ready only (textured GLB / baked clips). raw = author FBX dumps. */
let activeProd = 'ready';
/** @type {{ byUuid: Map, byPath: Map }} */
let d1Index = { byUuid: new Map(), byPath: new Map() };
let uuidVerified = false;
const thumbCacheMem = new Map(); // key → dataUrl
let thumbObserver = null;

let scene, camera, renderer, controls, mixer, clock, currentRoot, gridHelper;
let wireframe = false;
let autoRotate = true;
let characterTemplateCache = new Map();
let textureLoader = null;
/** @type {object|null} currently open catalog entry */
let currentEntry = null;
/** mesh name → Mesh[] under currentRoot */
let meshIndex = new Map();
let selectedMeshName = null;

// ── Catalog normalize ──────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inferKind(m) {
  return inferAssetKind(m);
}

function inferGroup(m) {
  if (m.group) return m.group;
  if (m.category) return m.category;
  const p = (m.path || m.r2Key || '').replace(/\\/g, '/');
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join('/');
  return parts[0] || 'uncategorized';
}

function normalizeEntry(raw, source) {
  const path = (raw.path || raw.r2Key || raw.sourcePath || '').replace(/\\/g, '/');
  const format = String(raw.format || path.split('.').pop() || 'glb').toLowerCase().replace(/^\./, '');
  const sizeKB =
    raw.sizeKB ??
    (raw.fileSize ? Math.round(raw.fileSize / 1024) : 0);
  const cdnUrl =
    raw.cdnUrl ||
    raw._cdnUrl ||
    raw._gameReadyUrl ||
    (path ? `${R2}/${path}` : null);
  const grudgeUuid = raw.grudgeUuid || raw.uuid || null;
  const m = {
    id: raw.id || grudgeUuid || `${source}:${path || raw.name}`,
    name: raw.name || path.split('/').pop() || 'asset',
    path,
    format,
    category: raw.category || 'uncategorized',
    group: raw.group || raw.category || 'uncategorized',
    sizeKB,
    meshes: raw.meshes ?? null,
    animations: raw.animations ?? null,
    textures: raw.textures ?? null,
    textureStatus: raw.textureStatus || null,
    materials: raw.materials ?? null,
    compressionType: raw.compressionType || null,
    source,
    cdnUrl,
    altUrls: [raw._gameReadyUrl, raw._cdnUrl, raw.cdnUrl].filter(Boolean),
    boneMap: raw.boneMap || raw.metadata?.boneMap || null,
    scaleProfile: raw.scaleProfile || raw.metadata?.scaleProfile || null,
    supportedSkeletons: raw.supportedSkeletons || raw.metadata?.supportedSkeletons || null,
    isBakedClip: !!raw.isBakedClip,
    bakedRel: raw.bakedRel || null,
    productionBaked: !!raw.productionBaked,
    deployReady: !!raw.deployReady,
    bakePipeline: raw.bakePipeline || raw.metadata?.bakePipeline || null,
    scaleBaked: !!raw.scaleBaked || !!raw.metadata?.scaleBaked,
    kind: raw.kind || null,
    grudgeUuid: grudgeUuid && isValidUuid(grudgeUuid) ? grudgeUuid : grudgeUuid,
    uuidStatus: grudgeUuid && isValidUuid(grudgeUuid) ? 'pending' : grudgeUuid ? 'invalid' : 'pending',
    uuidMessage: '',
    thumbKey: grudgeUuid || path || raw.id || null,
  };
  m.kind = inferKind(m);
  m.group = inferGroup(m);
  m.searchBlob = [
    m.name,
    m.path,
    m.group,
    m.category,
    m.kind,
    m.format,
    m.source,
    m.boneMap,
    m.textureStatus,
    m.grudgeUuid,
    m.bakePipeline,
    m.productionBaked ? 'production baked glb2glb deploy' : '',
    m.deployReady ? 'deploy-ready' : '',
    ...(m.supportedSkeletons || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return m;
}

function curatedGrudge6() {
  const out = [];
  for (const [id, kit] of Object.entries(RACE_KITS)) {
    // Production deploy path: R2 GLB (glb2glb) first; FBX listed as author alt
    const r2Glb = String(kit.glb || kit.r2 || '')
      .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '')
      .replace(/^\//, '');
    out.push(
      normalizeEntry(
        {
          id: `grudge6-race-${id}`,
          name: `${kit.label} — Characters (prod GLB)`,
          path: r2Glb || `models/grudge6/races/${id}`,
          format: 'glb',
          category: 'grudge6-races',
          group: 'grudge6/races',
          kind: 'character',
          cdnUrl: kit.glb || kit.r2,
          altUrls: [kit.glb, kit.r2, kit.fbx].filter(Boolean),
          animations: 0,
          textures: 1,
          textureStatus: 'atlas',
          scaleProfile: 'character',
          scaleBaked: true,
          productionBaked: true,
          bakePipeline: 'glb2glb',
          deployReady: true,
          compressionType: 'draco',
          supportedSkeletons: ['bip001', 'rts_toon'],
          meshes: 12,
        },
        'grudge6-ssot',
      ),
    );
  }
  for (const clip of BAKED_PACKS) {
    // Baked Bip001 JSON only — preferred anim format for grudge6 hosts
    out.push(
      normalizeEntry(
        {
          id: `baked-${clip.id}`,
          name: clip.name,
          path: `anims/baked/${clip.id}.json`,
          format: 'json',
          category: 'baked-anims',
          group: `baked/${clip.pack}`,
          kind: 'animation',
          isBakedClip: true,
          bakedRel: clip.id,
          boneMap: 'bip001',
          scaleProfile: 'animation_clip',
          supportedSkeletons: ['bip001', 'rts_toon'],
          productionBaked: true,
          bakePipeline: 'anim_bake',
          deployReady: true,
          scaleBaked: true,
          cdnUrl: `${ARENA}/anims/baked/${encodeURI(clip.id)}.json`,
          altUrls: [
            `${OPEN}/anims/baked/${encodeURI(clip.id)}.json`,
            `${ARENA}/anims/baked/${encodeURI(clip.id)}.json`,
          ],
        },
        'baked-bip001',
      ),
    );
  }
  return out;
}

async function fetchD1Catalog() {
  const offsets = [0, 400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000];
  const seen = new Set();
  const out = [];
  await Promise.all(
    offsets.map(async (offset) => {
      try {
        const r = await fetch(`${D1_API}?limit=200&offset=${offset}`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) return;
        const j = await r.json();
        for (const a of j.assets || []) {
          const key = a.r2Key || a.id;
          if (!key || seen.has(key)) continue;
          // Prefer viewable 3D / baked-related; skip pure audio/wav
          const fmt = String(a.format || '').toLowerCase();
          const mime = String(a.mimeType || '');
          if (mime.startsWith('audio/') || fmt === 'wav' || fmt === 'mp3' || fmt === 'ogg') continue;
          if (mime.startsWith('image/') && !key.includes('texture')) {
            // keep some texture refs for completeness? skip for grid clutter
            if (!/\.(glb|gltf|fbx)$/i.test(key)) continue;
          }
          seen.add(key);
          out.push(normalizeEntry(a, 'd1'));
        }
      } catch {
        /* skip page */
      }
    }),
  );
  return out;
}

async function fetchObjectStoreModels() {
  try {
    const r = await fetch(OBJECTSTORE_MODELS, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map((m) => normalizeEntry(m, 'objectstore'));
  } catch {
    return [];
  }
}

async function loadCatalog() {
  const status = document.getElementById('r2Status');
  const [d1, os] = await Promise.all([fetchD1Catalog(), fetchObjectStoreModels()]);
  const curated = curatedGrudge6();
  d1Index = { byUuid: new Map(), byPath: new Map() };
  for (const m of d1) {
    if (m.grudgeUuid) d1Index.byUuid.set(m.grudgeUuid.toLowerCase(), m);
    if (m.path) d1Index.byPath.set(m.path.replace(/\\/g, '/').toLowerCase(), m);
  }
  const map = new Map();
  for (const m of [...curated, ...os, ...d1]) {
    const k = m.path || m.id;
    if (!map.has(k)) map.set(k, m);
    else {
      // Prefer richer entry (keep D1 uuid when merging)
      const prev = map.get(k);
      const merged = { ...prev, ...m };
      if (!merged.grudgeUuid && prev.grudgeUuid) merged.grudgeUuid = prev.grudgeUuid;
      if ((m.textures || 0) > (prev.textures || 0) || m.cdnUrl) map.set(k, merged);
      else map.set(k, { ...m, ...prev, grudgeUuid: prev.grudgeUuid || m.grudgeUuid });
    }
  }
  allModels = [...map.values()];
  // Pre-derive UUIDs for path-backed assets (async, non-blocking UI after first paint)
  void prefillDerivedUuids();
  const sources = new Set(allModels.map((m) => m.source));
  if (status) {
    status.className = 'r2-status online';
    status.innerHTML = `<span class="r2-dot"></span> ${allModels.length} assets · ${sources.size} sources`;
  }
  document.getElementById('sourceCount').textContent = String(sources.size);
  updateThumbStat();
}

async function prefillDerivedUuids() {
  let n = 0;
  for (const m of allModels) {
    if (m.grudgeUuid && isValidUuid(m.grudgeUuid)) continue;
    if (!m.path || m.isBakedClip || m.format === 'json') continue;
    try {
      const u = await grudgeUuidFromR2Key(m.path);
      if (u) {
        m.grudgeUuid = m.grudgeUuid || u;
        m.uuidExpected = u;
        if (!m.thumbKey) m.thumbKey = u;
      }
    } catch {
      /* ignore */
    }
    n++;
    if (n % 80 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

async function updateThumbStat() {
  const el = document.getElementById('thumbCount');
  if (!el) return;
  const n = await thumbCount();
  el.textContent = String(n);
}

function updateUuidStat() {
  const el = document.getElementById('uuidOkCount');
  if (!el) return;
  const ok = allModels.filter((m) => m.uuidStatus === 'ok' || m.uuidStatus === 'derived').length;
  const done = allModels.filter((m) => m.uuidStatus && m.uuidStatus !== 'pending').length;
  el.textContent = done ? `${ok}/${done}` : '—';
}

// ── Filters / search ───────────────────────────────────
function tokens(q) {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function applyFilters() {
  const q = document.getElementById('searchBox')?.value || '';
  const toks = tokens(q);
  filtered = allModels.filter((m) => {
    if (activeKind && m.kind !== activeKind) return false;
    if (activeGroup && m.group !== activeGroup) return false;
    if (activeFormat && m.format !== activeFormat) return false;
    if (activeSource && m.source !== activeSource) return false;
    if (activeUuid && (m.uuidStatus || 'pending') !== activeUuid) return false;
    if (activeProd === 'ready' && !isProductionDeployReady(m)) return false;
    if (activeProd === 'raw' && isProductionDeployReady(m)) return false;
    if (toks.length && !toks.every((t) => m.searchBlob.includes(t))) return false;
    return true;
  });
  filtered.sort((a, b) => {
    if (sortKey === 'production') {
      const d = productionScore(b) - productionScore(a);
      if (d !== 0) return d;
      return (a.name || '').localeCompare(b.name || '');
    }
    if (sortKey === 'size') return (b.sizeKB || 0) - (a.sizeKB || 0);
    if (sortKey === 'group') return (a.group || '').localeCompare(b.group || '');
    if (sortKey === 'format') return (a.format || '').localeCompare(b.format || '');
    if (sortKey === 'uuid') return (a.uuidStatus || '').localeCompare(b.uuidStatus || '');
    return (a.name || '').localeCompare(b.name || '');
  });
  page = 0;
  renderFilters();
  renderPage();
  document.getElementById('visibleCount').textContent = String(filtered.length);
  document.getElementById('totalModels').textContent = String(allModels.length);
  const groups = new Set(allModels.map((m) => m.group));
  document.getElementById('totalCategories').textContent = String(groups.size);
  document.getElementById('resultsTitle').textContent =
    [activeKind, activeGroup, activeFormat, activeSource, activeUuid, activeProd]
      .filter(Boolean)
      .join(' · ') || 'All assets';
  updateUuidStat();
}

function chipRow(el, entries, active, onPick, classFor) {
  if (!el) return;
  let html = `<button type="button" class="filter-btn ${!active ? 'active' : ''}" data-v="">All<span class="count">${entries.reduce((s, [, n]) => s + n, 0)}</span></button>`;
  for (const [v, n] of entries) {
    const cls = classFor ? classFor(v) : '';
    html += `<button type="button" class="filter-btn ${cls} ${active === v ? 'active' : ''}" data-v="${esc(v)}">${esc(v)}<span class="count">${n}</span></button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => onPick(b.dataset.v || null));
  });
}

function renderFilters() {
  const kinds = {},
    groups = {},
    formats = {},
    sources = {},
    uuids = {};
  for (const m of allModels) {
    kinds[m.kind] = (kinds[m.kind] || 0) + 1;
    groups[m.group] = (groups[m.group] || 0) + 1;
    formats[m.format] = (formats[m.format] || 0) + 1;
    sources[m.source] = (sources[m.source] || 0) + 1;
    const us = m.uuidStatus || 'pending';
    uuids[us] = (uuids[us] || 0) + 1;
  }
  const sortEntries = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const prodReady = allModels.filter((m) => isProductionDeployReady(m)).length;
  const prodRaw = allModels.length - prodReady;
  chipRow(
    document.getElementById('prodFilters'),
    [
      ['ready', prodReady],
      ['raw', prodRaw],
    ],
    activeProd,
    (v) => {
      activeProd = v;
      applyFilters();
    },
    (v) => (v === 'ready' ? 'prod-ready' : 'prod-raw'),
  );
  chipRow(
    document.getElementById('kindFilters'),
    sortEntries(kinds),
    activeKind,
    (v) => {
      activeKind = v;
      applyFilters();
    },
    (v) => `kind-${v}`,
  );
  let g = sortEntries(groups);
  if (g.length > 24) {
    const keep = new Set(g.slice(0, 24).map(([k]) => k));
    if (activeGroup) keep.add(activeGroup);
    g = g.filter(([k]) => keep.has(k));
  }
  chipRow(document.getElementById('categoryFilters'), g, activeGroup, (v) => {
    activeGroup = v;
    applyFilters();
  });
  chipRow(document.getElementById('formatFilters'), sortEntries(formats), activeFormat, (v) => {
    activeFormat = v;
    applyFilters();
  });
  chipRow(document.getElementById('sourceFilters'), sortEntries(sources), activeSource, (v) => {
    activeSource = v;
    applyFilters();
  });
  chipRow(document.getElementById('uuidFilters'), sortEntries(uuids), activeUuid, (v) => {
    activeUuid = v;
    applyFilters();
  });
}

function glyphFor(m) {
  return (
    {
      character: '🧍',
      animation: '🎬',
      weapon: '⚔️',
      environment: '🌲',
      creature: '🐉',
      prop: '📦',
      other: '📄',
    }[m.kind] || '📄'
  );
}

function canSnapshot(m) {
  if (!m) return false;
  if (m.isBakedClip || m.format === 'json') return true; // character host
  return ['glb', 'gltf', 'fbx'].includes(m.format);
}

function thumbKeyOf(m) {
  return m.thumbKey || m.grudgeUuid || m.path || m.id;
}

function setCardThumb(card, dataUrl) {
  if (!card || !dataUrl) return;
  const icon = card.querySelector('.model-icon');
  if (!icon) return;
  icon.querySelector('.glyph')?.remove();
  icon.querySelector('.thumb-pending')?.remove();
  let img = icon.querySelector('img.thumb');
  if (!img) {
    img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.loading = 'lazy';
    icon.appendChild(img);
  }
  img.src = dataUrl;
}

async function resolveSnapshotUrl(m) {
  if (m.isBakedClip || m.format === 'json') {
    // Host character for anim snapshot
    const race = document.getElementById('previewRace')?.value || 'western-kingdoms';
    const kit = RACE_KITS[race] || RACE_KITS['western-kingdoms'];
    return kit.glb;
  }
  // Prefer CDN mesh URL
  if (m.cdnUrl && !m.cdnUrl.endsWith('.json')) return m.cdnUrl;
  if (m.path) return `${R2}/${m.path}`;
  return m.cdnUrl || null;
}

function queueCardSnapshot(m, card) {
  if (!canSnapshot(m) && !m.grudgeUuid) return;
  const key = thumbKeyOf(m);
  if (!key) return;
  if (thumbCacheMem.has(key)) {
    setCardThumb(card, thumbCacheMem.get(key));
    return;
  }
  // 1) CDN shared thumbs → 2) IndexedDB → 3) live WebGL snap
  (async () => {
    const cdn = await resolveCdnThumb(m);
    if (cdn) {
      thumbCacheMem.set(key, cdn);
      if (card?.isConnected) setCardThumb(card, cdn);
      return;
    }
    const cached = await thumbGet(key);
    if (cached) {
      thumbCacheMem.set(key, cached);
      if (card?.isConnected) setCardThumb(card, cached);
      return;
    }
    if (!canSnapshot(m)) return;
    const pending = card?.querySelector('.model-icon');
    if (pending && !pending.querySelector('.thumb-pending') && !pending.querySelector('img.thumb')) {
      const p = document.createElement('div');
      p.className = 'thumb-pending';
      p.textContent = 'snap…';
      pending.appendChild(p);
    }
    const url = await resolveSnapshotUrl(m);
    if (!url) return;
    enqueueThumb({
      key,
      url,
      onDone: (dataUrl) => {
        if (dataUrl) {
          thumbCacheMem.set(key, dataUrl);
          if (card?.isConnected) setCardThumb(card, dataUrl);
          updateThumbStat();
        } else if (card?.isConnected) {
          card.querySelector('.thumb-pending')?.remove();
        }
      },
    });
  })();
}

function observeThumbs(grid) {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        const card = ent.target;
        const idx = +card.dataset.idx;
        const m = filtered[idx];
        if (m) queueCardSnapshot(m, card);
        thumbObserver.unobserve(card);
      }
    },
    { rootMargin: '120px', threshold: 0.05 },
  );
  grid.querySelectorAll('.model-card').forEach((c) => thumbObserver.observe(c));
}

function renderPage() {
  document.getElementById('loadingState').style.display = 'none';
  const empty = document.getElementById('emptyState');
  const area = document.getElementById('resultsArea');
  if (!filtered.length) {
    area.style.display = 'none';
    empty.style.display = 'block';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  area.style.display = 'block';
  document.getElementById('resultsCount').textContent = `${filtered.length} match · page ${page + 1}`;
  const start = page * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const grid = document.getElementById('modelGrid');
  grid.innerHTML = slice
    .map((m, i) => {
      const idx = start + i;
      const key = thumbKeyOf(m);
      const mem = key && thumbCacheMem.get(key);
      const tex =
        m.textureStatus === 'atlas' || (m.textures && m.textures > 0)
          ? '<span class="badge badge-tex-ok">TEX</span>'
          : m.kind === 'animation'
            ? ''
            : m.textureStatus === 'vertex-color'
              ? '<span class="badge badge-tex-warn">VCOL</span>'
              : '';
      const prod = productionBadge(m);
      const prodBadge = `<span class="badge ${prod.cls}" title="productionScore ${prod.score}">${esc(prod.label)}</span>`;
      const us = m.uuidStatus || 'pending';
      const uuidBadge =
        us !== 'pending'
          ? `<span class="badge-uuid ${uuidStatusClass(us)}" title="${esc(m.uuidMessage || us)}">${esc(us)}</span>`
          : '';
      const meta = [
        m.format?.toUpperCase(),
        m.sizeKB ? (m.sizeKB >= 1024 ? `${(m.sizeKB / 1024).toFixed(1)} MB` : `${m.sizeKB} KB`) : null,
        m.animations ? `${m.animations} anim` : m.isBakedClip ? 'baked clip' : null,
        m.bakePipeline || null,
        m.kind,
        `P${prod.score}`,
      ]
        .filter(Boolean)
        .join(' · ');
      const uuidLine = m.grudgeUuid
        ? `<div class="model-uuid" title="${esc(m.uuidMessage || '')}">${esc(m.grudgeUuid)}</div>`
        : '';
      const thumbHtml = mem
        ? `<img class="thumb" alt="" src="${mem}">`
        : `<span class="glyph">${glyphFor(m)}</span>`;
      return `<article class="model-card ${isProductionDeployReady(m) ? 'card-prod' : 'card-raw'}" data-idx="${idx}" data-thumb-key="${esc(key || '')}" title="${esc(m.path || m.name)} · prod ${prod.score}">
        <div class="model-icon">
          <span class="badge badge-fmt">${esc(m.format || '?')}</span>
          <span class="badge badge-kind">${esc(m.kind)}</span>
          ${prodBadge}
          ${uuidBadge}
          ${tex}
          ${thumbHtml}
        </div>
        <div class="model-name">${esc(m.name)}</div>
        <div class="model-meta">${esc(meta)} · <span style="opacity:.7">${esc(m.source)}</span></div>
        ${uuidLine}
      </article>`;
    })
    .join('');
  grid.querySelectorAll('.model-card').forEach((card) => {
    card.addEventListener('click', () => openViewer(filtered[+card.dataset.idx]));
  });
  observeThumbs(grid);
  // Warm mem cache from IDB for visible cards without waiting for IO
  slice.forEach(async (m, i) => {
    const key = thumbKeyOf(m);
    if (!key || thumbCacheMem.has(key)) return;
    const cached = await thumbGet(key);
    if (cached) {
      thumbCacheMem.set(key, cached);
      const card = grid.querySelector(`.model-card[data-idx="${start + i}"]`);
      if (card) setCardThumb(card, cached);
    }
  });
  // pagination
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const pag = document.getElementById('pagination');
  if (pages <= 1) {
    pag.innerHTML = '';
    return;
  }
  let h = '';
  const mk = (p, label, dis, act) =>
    `<button type="button" class="page-btn ${act ? 'active' : ''}" data-p="${p}" ${dis ? 'disabled' : ''}>${label}</button>`;
  h += mk(0, '«', page === 0);
  h += mk(Math.max(0, page - 1), '‹', page === 0);
  const a = Math.max(0, page - 3);
  const b = Math.min(pages, a + 8);
  for (let p = a; p < b; p++) h += mk(p, String(p + 1), false, p === page);
  h += mk(Math.min(pages - 1, page + 1), '›', page >= pages - 1);
  h += mk(pages - 1, '»', page >= pages - 1);
  pag.innerHTML = h;
  pag.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      page = +btn.dataset.p;
      renderPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ── Materials (kill yellow / chrome + rebind missing atlases) ──
// Core logic lives in materials.js (1×1 FBX2glTF placeholders, bow atlas, etc.)

async function tryBindAtlas(root, raceId) {
  const kit = RACE_KITS[raceId];
  if (!kit?.atlas) return false;
  try {
    if (!textureLoader) {
      textureLoader = new THREE.TextureLoader();
      textureLoader.setCrossOrigin('anonymous');
    }
    const tex = await textureLoader.loadAsync(kit.atlas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff,
      metalness: 0,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) o.material = mat;
    });
    return true;
  } catch {
    return false;
  }
}

// ── Deploy: height, XZ, Y, bones ───────────────────────
function findBone(root, re) {
  let hit = null;
  root.traverse((o) => {
    if (hit) return;
    if (o.isBone && re.test(o.name)) hit = o;
  });
  return hit;
}

function listBones(root) {
  const names = [];
  root.traverse((o) => {
    if (o.isBone && o.name) names.push(o.name);
  });
  return names;
}

function bodyBox(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let n = 0;
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.visible) {
      try {
        box.expandByObject(o);
        n++;
      } catch {
        /* incomplete skin */
      }
    }
  });
  if (n === 0) box.setFromObject(root);
  return box;
}

/**
 * Deploy/preview placement with **category-aware** scale rules.
 * Characters / anim hosts → characterDeploy SSOT (kills hip-float + sideways).
 * Projectiles/weapons → author meters (never 1.8 m character-fit).
 *
 * @param {THREE.Object3D} root
 * @param {{ facePlusZ?: boolean|'auto', entry?: object|null }} opts
 */
function deployModel(root, { facePlusZ, entry = null } = {}) {
  const profile = getDeployProfile(entry || {});

  // ── Characters & anim hosts: SSOT characterDeploy (never facePlusZ:false on FBX) ──
  if (
    profile.kind === 'character' ||
    profile.kind === 'animation' ||
    profile.kind === 'creature'
  ) {
    root.userData.sourceUrl = entry?.cdnUrl || entry?.path || root.userData.sourceUrl;
    if (!root.userData.importPipeline) {
      root.userData.importPipeline =
        /\.fbx($|\?)/i.test(String(entry?.path || entry?.cdnUrl || '')) ||
        /grudge6\/races|Characters\.fbx/i.test(String(entry?.path || entry?.cdnUrl || ''))
          ? 'fbx-atlas'
          : root.userData.importPipeline || 'fbx-atlas';
    }
    // KILL facePlusZ:false on grudge6 FBX — default auto applies π/2 art-forward +Z
    const face =
      facePlusZ === false
        ? 'auto' // ignore false — was the sideways bug
        : facePlusZ === true
          ? true
          : 'auto';
    const d = deployCharacterModel(root, {
      facePlusZ: face,
      importPipeline: root.userData.importPipeline,
      forceRefit: true, // anim/mesh host: never trust sticky wrong scale
    });
    // Hard SI re-gate (100× residual after secondary/stale GLB)
    const si = enforceCharacterSi(root, 1.8);
    const look = diagnoseCharacterLook(root);
    const heightM = si.heightM || d.heightM;
    const uf = root.userData.grudgeUnitFix ?? d.fit?.unitFix ?? si.unitFix ?? 1;
    return {
      height: heightM,
      measure: heightM,
      size: d.size,
      minY: charBodyBox(root).min.y,
      pelvis: d.pelvis,
      handR: d.handR,
      handL: d.handL,
      bones: d.bones,
      profile,
      scaleReason:
        (d.facingApplied || si.fixed ? 'characterDeploy · art-forward +Z' : 'characterDeploy') +
        (uf !== 1 ? ` · unit×${uf}` : '') +
        (si.fixed ? ' · SI-enforced' : '') +
        ` · ${(heightM / 1.8).toFixed(2)}× human`,
      unitFixed: uf !== 1 || si.fixed,
      unitKind: uf === 0.01 || uf === 100 ? 'x100' : uf === 1 ? 'ok' : 'decade',
      normalized: true,
      humanLabel: `${heightM.toFixed(2)} m (${(heightM / 1.8).toFixed(2)}× human tall)`,
      facingApplied: d.facingApplied || si.fixed,
      lookIssues: look.issues,
      siEnforced: si.fixed,
    };
  }

  // ── Non-characters: category scale only ──
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
  });
  root.updateWorldMatrix(true, true);

  let box = bodyBox(root);
  let size = box.getSize(new THREE.Vector3());
  let measure = measureSize(size, profile) || 1;

  const scaled = computeDeployScale(measure, profile);
  const { scale, reason, unitFixed, normalized } = scaled;
  if (scale !== 1) {
    root.scale.multiplyScalar(scale);
    root.updateWorldMatrix(true, true);
  }

  const pelvis =
    findBone(root, /bip001\s*pelvis/i) ||
    findBone(root, /pelvis/i) ||
    findBone(root, /hips$/i);
  box = bodyBox(root);
  const origin = new THREE.Vector3();
  root.getWorldPosition(origin);
  const ax = new THREE.Vector3();
  box.getCenter(ax);
  root.position.x -= ax.x - origin.x;
  root.position.z -= ax.z - origin.z;
  root.updateWorldMatrix(true, true);

  box = bodyBox(root);
  if (profile.ground === 'feet' || profile.ground === 'bottom') {
    root.position.y -= box.min.y;
  } else {
    box.getCenter(ax);
    root.position.y -= ax.y - origin.y;
  }
  root.updateWorldMatrix(true, true);
  box = bodyBox(root);
  size = box.getSize(new THREE.Vector3());
  measure = measureSize(size, profile);

  const bones = listBones(root);
  const handR =
    findBone(root, /bip001.*r.*hand$/i) ||
    findBone(root, /r_hand|hand_r|righthand/i);
  const handL =
    findBone(root, /bip001.*l.*hand$/i) ||
    findBone(root, /l_hand|hand_l|lefthand/i);

  return {
    height: size.y,
    measure,
    size: { x: size.x, y: size.y, z: size.z },
    minY: box.min.y,
    pelvis: pelvis?.name || null,
    handR: handR?.name || null,
    handL: handL?.name || null,
    bones,
    profile,
    scaleReason: reason,
    unitFixed,
    unitKind: scaled.unitKind,
    humanLabel: scaled.humanLabel,
    normalized,
  };
}

function flashUse(msg) {
  const el = document.getElementById('useFlash');
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(flashUse._t);
  flashUse._t = setTimeout(() => {
    el.hidden = true;
  }, 1600);
}

function fillUsePanel(entry) {
  currentEntry = entry || null;
  const uuid = entry?.grudgeUuid || '—';
  const r2 = entry ? r2KeyOf(entry) || '—' : '—';
  const cdn = entry ? cdnUrlOf(entry) || entry.cdnUrl || '—' : '—';
  const pack = entry ? animPackHint(entry) || (entry.kind === 'animation' ? '—' : 'n/a') : '—';
  document.getElementById('useUuid').textContent = uuid;
  document.getElementById('useR2').textContent = r2;
  document.getElementById('useCdn').textContent = cdn;
  document.getElementById('useAnimPack').textContent = pack;
  document.getElementById('useMeshName').textContent = selectedMeshName || '—';
  document.getElementById('useSnippet').value = entry ? openImportSnippet(entry) : '';
  const ready = document.getElementById('useReady');
  if (!entry) {
    ready.innerHTML = '';
    return;
  }
  const r = readinessOf(entry);
  const kind = r.kind || entry.kind || 'other';
  const layer = r.physicsLayer || 'Default';
  const want = ['uuid', 'cdn', 'tex', 'skel', 'anim', 'web', 'uuid-ok'];
  ready.innerHTML =
    `<span class="ready-pill on">kind:${esc(kind)}</span>` +
    `<span class="ready-pill on">layer:${esc(layer)}</span>` +
    want
      .map((f) => {
        const on = r.flags.includes(f);
        return `<span class="ready-pill ${on ? 'on' : ''}">${f}</span>`;
      })
      .join('') + `<span class="ready-score">${r.score}%</span>`;
}

function rebuildMeshIndex(root) {
  meshIndex = new Map();
  selectedMeshName = null;
  if (!root) {
    document.getElementById('meshList').innerHTML =
      '<em class="dim">Load a multipack to isolate meshName · equip slot · color / texture</em>';
    document.getElementById('meshCount').textContent = '';
    document.getElementById('useMeshName').textContent = '—';
    const slotEl = document.getElementById('useEquipSlot');
    if (slotEl) slotEl.textContent = '—';
    return;
  }
  root.traverse((o) => {
    if (!(o.isMesh || o.isSkinnedMesh)) return;
    const name = o.name || '(unnamed)';
    if (!meshIndex.has(name)) meshIndex.set(name, []);
    meshIndex.get(name).push(o);
  });
  const names = [...meshIndex.keys()].sort((a, b) => a.localeCompare(b));
  document.getElementById('meshCount').textContent = names.length ? `(${names.length})` : '';
  if (!names.length) {
    document.getElementById('meshList').innerHTML = '<em class="dim">No named meshes</em>';
    return;
  }
  const list = document.getElementById('meshList');
  // Group by modular equip slot (cloak / wings / mount / armor / weapons)
  const bySlot = new Map();
  names.forEach((n) => {
    const slot = modularEquipSlot(n);
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(n);
  });
  const byModSlot = groupMeshesBySlot(meshIndex);
  const hudHost = document.getElementById('modularHudHost');
  if (hudHost) {
    hudHost.innerHTML = renderModularHudHtml(byModSlot);
    wireModularHud(byModSlot);
  }
  refreshWeaponSkillsPanel();

  const slotOrder = [
    'head',
    'body',
    'arms',
    'legs',
    'shoulders',
    'cloak',
    'wings',
    'mount',
    'weapon',
    'shield',
    'quiver',
    'accessory',
    'hair',
    'prop',
    'mesh',
    'skeleton',
    'unknown',
  ];
  let html = '';
  for (const slot of slotOrder) {
    const group = bySlot.get(slot) || byModSlot.get(slot);
    if (!group || !group.length) continue;
    html += `<div class="mesh-slot-group" data-slot="${esc(slot)}"><div class="mesh-slot-label">${esc(slot)} <span class="count">${group.length}</span></div>`;
    html += group
      .map((n) => {
        const count = meshIndex.get(n).length;
        const s = modularEquipSlot(n);
        return `<label data-mesh="${esc(n)}" data-slot="${esc(s)}">
        <input type="checkbox" class="mesh-vis" data-mesh="${esc(n)}" checked>
        <span title="${esc(n)} · slot ${esc(s)}">${esc(n)}${count > 1 ? ` ×${count}` : ''}</span>
        <button type="button" class="mesh-pick" data-mesh="${esc(n)}" title="Select for meshName / equip">use</button>
      </label>`;
      })
      .join('');
    html += '</div>';
  }
  list.innerHTML = html;
  list.querySelectorAll('input.mesh-vis').forEach((inp) => {
    inp.addEventListener('change', () => {
      const n = inp.dataset.mesh;
      const meshes = meshIndex.get(n) || [];
      meshes.forEach((mesh) => {
        mesh.visible = inp.checked;
      });
    });
  });
  list.querySelectorAll('button.mesh-pick').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectMeshName(btn.dataset.mesh);
    });
  });
  list.querySelectorAll('label').forEach((lab) => {
    lab.addEventListener('dblclick', () => {
      soloMesh(lab.dataset.mesh);
    });
  });
}

function wireModularHud(bySlot) {
  const host = document.getElementById('modularHudHost');
  if (!host) return;

  host.querySelectorAll('[data-mod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-mod');
      if (kind === 'all') {
        meshIndex.forEach((meshes) => meshes.forEach((m) => (m.visible = true)));
        host.querySelectorAll('.mod-slot-select').forEach((sel) => {
          sel.value = '';
        });
        document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
          inp.checked = true;
        });
        flashUse('All meshes visible');
        return;
      }
      if (kind === 'none') {
        // Naked base: hide equippable, keep skeleton/body if needed
        meshIndex.forEach((meshes, n) => {
          const s = modularEquipSlot(n);
          const keep = s === 'skeleton' || s === 'body' || s === 'unknown' || s === 'mesh';
          meshes.forEach((m) => {
            m.visible = keep && /body|torso|units_body/i.test(n) ? true : s === 'skeleton';
          });
        });
        // Prefer first body mesh only
        const bodies = bySlot.get('body') || [];
        if (bodies[0]) {
          meshIndex.forEach((meshes, n) => {
            if (modularEquipSlot(n) === 'body') {
              meshes.forEach((m) => {
                m.visible = n === bodies[0];
              });
            }
          });
        }
        flashUse('Base body only');
        return;
      }
      if (kind === 'warrior' || kind === 'mage' || kind === 'ranger') {
        const loadout = guessPreset(bySlot, kind);
        applyLoadout(meshIndex, loadout);
        // Sync selects + checkboxes
        host.querySelectorAll('.mod-slot-select').forEach((sel) => {
          const slot = sel.getAttribute('data-mod-slot');
          sel.value = loadout[slot] || '';
        });
        document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
          const n = inp.dataset.mesh;
          const s = modularEquipSlot(n);
          inp.checked = !!(loadout[s] && loadout[s] === n);
        });
        const pack = animPackHintFromLoadout(loadout);
        const packEl = document.getElementById('useAnimPackActive');
        if (packEl) packEl.textContent = pack.id;
        const useAnim = document.getElementById('useAnimPack');
        if (useAnim) useAnim.textContent = pack.id;
        flashUse(`${kind} preset · anim ${pack.id}`);
      }
    });
  });

  host.querySelectorAll('.mod-slot-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const slot = sel.getAttribute('data-mod-slot');
      const meshName = sel.value || null;
      // Hide slot peers, show selected
      meshIndex.forEach((meshes, n) => {
        if (modularEquipSlot(n) !== slot) return;
        meshes.forEach((m) => {
          m.visible = meshName ? n === meshName : false;
        });
      });
      document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
        if (modularEquipSlot(inp.dataset.mesh) === slot) {
          inp.checked = meshName ? inp.dataset.mesh === meshName : false;
        }
      });
      if (meshName) selectMeshName(meshName);
      flashUse(`${slot} → ${meshName || 'hidden'}`);
    });
  });

  host.querySelectorAll('[data-anim-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-anim-pack');
      const pack = ANIM_PACKS[id];
      const packEl = document.getElementById('useAnimPackActive');
      if (packEl) packEl.textContent = id;
      const useAnim = document.getElementById('useAnimPack');
      if (useAnim) useAnim.textContent = id;
      flashUse(`Anim pack ${pack?.label || id} · ${pack?.baked || ''}`);
      // Try select matching clip if loaded
      const sel = document.getElementById('animSelect');
      if (sel && pack) {
        const opt = [...sel.options].find((o) =>
          new RegExp(id.replace(/_/g, '.*'), 'i').test(o.textContent || o.value),
        );
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change'));
        }
      }
    });
  });
}

function refreshWeaponSkillsPanel() {
  const type = document.getElementById('weaponSkillType')?.value || 'sword';
  const host = document.getElementById('weaponSkillList');
  if (!host) return;
  host.innerHTML = renderSkillTreeHtml(type);
  host.querySelectorAll('.skill-card').forEach((card) => {
    card.addEventListener('click', () => {
      const weapon = card.getAttribute('data-weapon') || type;
      const skill = card.getAttribute('data-skill');
      openInForge({
        workspace: 'weapons',
        weaponType: weapon,
        assetUrl: currentEntry?.cdnUrl,
        r2Key: currentEntry?.path,
        grudgeUuid: currentEntry?.grudgeUuid,
        scene: `weapon-skill:${skill}`,
      });
      flashUse(`Forge weapons · ${weapon} · ${skill}`);
    });
  });
}

function currentForgeOpts(extra = {}) {
  const m = currentEntry;
  return {
    assetUrl: m?.cdnUrl || '',
    r2Key: m?.path || m?.r2Key || '',
    grudgeUuid: m?.grudgeUuid || '',
    meshName: selectedMeshName || undefined,
    equipSlot: selectedMeshName ? modularEquipSlot(selectedMeshName) : undefined,
    raceId: document.getElementById('previewRace')?.value || undefined,
    animPack: document.getElementById('useAnimPackActive')?.textContent || undefined,
    ...extra,
  };
}

/** Scene cart badge + chip list for Forge pack export */
function renderSceneCart() {
  const cart = loadSceneCart();
  const countEl = document.getElementById('sceneCartCount');
  if (countEl) countEl.textContent = String(cart.length);
  const list = document.getElementById('sceneCartList');
  if (!list) return;
  if (!cart.length) {
    list.innerHTML = '<span class="dim">Empty — open an asset and click + Scene cart</span>';
    return;
  }
  list.innerHTML = cart
    .map(
      (c, i) =>
        `<span class="scene-cart-chip" title="${String(c.cdnUrl || c.path || '').replace(/"/g, '')}">${i + 1}. ${String(c.name || 'asset').slice(0, 28)}</span>`,
    )
    .join('');
}

function selectMeshName(name) {
  selectedMeshName = name || null;
  document.getElementById('useMeshName').textContent = selectedMeshName || '—';
  const slot = selectedMeshName ? modularEquipSlot(selectedMeshName) : '—';
  const slotEl = document.getElementById('useEquipSlot');
  if (slotEl) slotEl.textContent = slot;
  document.querySelectorAll('#meshList label').forEach((lab) => {
    lab.classList.toggle('solo', lab.dataset.mesh === selectedMeshName);
  });
  if (currentEntry) {
    const sn = document.getElementById('useSnippet');
    if (sn && selectedMeshName) {
      sn.value =
        openImportSnippet(currentEntry) +
        `\n// isolate multipack equip:\n// meshName = ${JSON.stringify(selectedMeshName)}\n// equipSlot = ${JSON.stringify(slot)}`;
    }
  }
  flashUse(`meshName = ${selectedMeshName} · slot ${slot}`);
}

function selectedMeshes() {
  if (!selectedMeshName) return [];
  return meshIndex.get(selectedMeshName) || [];
}

function applySelectedMeshColor() {
  const hex = document.getElementById('meshColor')?.value || '#ffffff';
  const n = applyMeshColor(selectedMeshes(), hex);
  flashUse(n ? `Tinted ${n} mat(s) on ${selectedMeshName}` : 'Select a mesh first');
}

async function applySelectedMeshTexture() {
  const url = (document.getElementById('meshTexUrl')?.value || '').trim();
  if (!url) {
    flashUse('Enter a texture URL (CDN atlas / map)');
    return;
  }
  const n = await applyMeshTexture(selectedMeshes(), url);
  flashUse(n ? `Bound texture on ${n} mat(s)` : 'Texture load failed or no mesh selected');
}

function soloEquipSlot(slot) {
  if (!slot) return;
  meshIndex.forEach((meshes, n) => {
    const on = modularEquipSlot(n) === slot;
    meshes.forEach((m) => {
      m.visible = on;
    });
  });
  document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
    inp.checked = modularEquipSlot(inp.dataset.mesh) === slot;
  });
  flashUse(`Solo equip slot: ${slot}`);
}

function setAllMeshesVisible(vis) {
  meshIndex.forEach((meshes) => {
    meshes.forEach((m) => {
      m.visible = vis;
    });
  });
  document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
    inp.checked = vis;
  });
}

function soloMesh(name) {
  meshIndex.forEach((meshes, n) => {
    const on = n === name;
    meshes.forEach((m) => {
      m.visible = on;
    });
  });
  document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
    inp.checked = inp.dataset.mesh === name;
  });
  selectMeshName(name);
}

function setDiag(info, mats, mode, entry = null) {
  const list = document.getElementById('diagList');
  const summaryEl = document.getElementById('diagSummary');
  const bl = document.getElementById('boneList');

  if (!info) {
    if (list) {
      list.innerHTML =
        '<div><dt>Category</dt><dd>—</dd></div><div><dt>Scale</dt><dd>—</dd></div><div><dt>Layer</dt><dd>—</dd></div>';
    }
    if (summaryEl) {
      summaryEl.textContent = 'Load an asset for category deploy checks';
      summaryEl.className = 'diag-summary';
    }
    if (bl) bl.textContent = '';
    window._lastDeployReport = null;
    return null;
  }

  const profile = info.profile || getDeployProfile(entry || currentEntry || {});
  const report = runDeployChecks({
    entry: entry || currentEntry || {},
    profile,
    measure: info.measure ?? info.height,
    size: info.size || { x: 0, y: info.height || 0, z: 0 },
    minY: info.minY,
    pelvis: info.pelvis,
    handR: info.handR,
    handL: info.handL,
    bones: info.bones || [],
    mats: mats || {},
    scaleReason: info.scaleReason || '',
    unitFixed: !!info.unitFixed,
    normalized: !!info.normalized,
    unitKind: info.unitKind || '',
    humanLabel: info.humanLabel || '',
  });

  const statusClass = (s) =>
    ({ ok: 'ok', warn: 'warn', fail: 'bad', info: 'info', na: 'dim' }[s] || '');

  if (list) {
    list.innerHTML = report.checks
      .map(
        (c) =>
          `<div class="diag-row status-${c.status}">
            <dt>${esc(c.label)}</dt>
            <dd class="${statusClass(c.status)}" title="${esc(c.detail)}">${esc(c.detail)}</dd>
          </div>`,
      )
      .join('');
  }

  if (summaryEl) {
    const sc = deployScore(report.summary, report.checks);
    summaryEl.className = `diag-summary ${report.summary.pass ? 'pass' : 'fail'}`;
    summaryEl.textContent =
      `${report.summary.pass ? 'PASS' : 'FAIL'} · ${profile.label} · score ${sc} · ` +
      `${report.summary.ok} ok / ${report.summary.warn} warn / ${report.summary.fail} fail` +
      (mode ? ` · ${mode}` : '');
  }

  if (bl) {
    bl.textContent = (info.bones || []).slice(0, 80).join('\n') || '(no bones)';
  }

  window._lastDeployReport = report;
  return report;
}

// ── Bone rematch for clips ─────────────────────────────
function normalizeBoneKey(n) {
  return String(n || '')
    .trim()
    .toLowerCase()
    .replace(/^mixamorig\d*:/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function rematchClip(root, clip) {
  const lookup = new Map();
  root.traverse((o) => {
    if (!o.isBone && !/bip001|hand|pelvis|container/i.test(o.name || '')) return;
    const actual = o.name;
    if (!actual) return;
    lookup.set(actual, actual);
    lookup.set(normalizeBoneKey(actual), actual);
  });
  const tracks = [];
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const node = parsed.nodeName;
    if (!node) {
      tracks.push(track);
      continue;
    }
    const resolved = lookup.get(node) || lookup.get(normalizeBoneKey(node));
    if (!resolved) continue;
    if (resolved !== node) {
      const Ctor = track.constructor;
      const dot = track.name.indexOf('.');
      const suffix = dot >= 0 ? track.name.slice(dot) : `.${parsed.propertyName || 'quaternion'}`;
      tracks.push(
        new Ctor(`${resolved}${suffix}`, track.times.slice(), track.values.slice()),
      );
    } else tracks.push(track);
  }
  if (!tracks.length) return clip;
  // KILL hip-float: never keep .position tracks when retargeting onto grounded kit
  return stripPositionTracks(
    new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode),
  );
}

// ── Viewer ─────────────────────────────────────────────
function initViewer() {
  const wrap = document.getElementById('viewerCanvasWrap');
  if (wrap.querySelector('canvas')) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1018);
  camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.05, 200);
  camera.position.set(1.6, 1.4, 2.8);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  wrap.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.9, 0);
  // Cool neutral lighting — avoid warm yellow key that tints untextured meshes
  scene.add(new THREE.AmbientLight(0xd0d8e8, 0.45));
  const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x2a3038, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(3.5, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ec8ff, 0.45);
  fill.position.set(-4, 2, -2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35);
  rim.position.set(0, 3, -5);
  scene.add(rim);
  gridHelper = new THREE.GridHelper(8, 16, 0x2a3550, 0x1a2233);
  scene.add(gridHelper);
  // Axes: X red, Y green, Z blue (Three.js Y-up)
  const axes = new THREE.AxesHelper(1.2);
  axes.position.y = 0.01;
  scene.add(axes);
  clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (mixer) mixer.update(clock.getDelta());
    controls.update();
    renderer.render(scene, camera);
  })();
  new ResizeObserver(() => {
    if (!wrap.clientWidth) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }).observe(wrap);
}

function clearSceneModel() {
  if (currentRoot) {
    scene.remove(currentRoot);
    currentRoot.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.map?.dispose?.();
          m.dispose?.();
        });
      }
    });
    currentRoot = null;
  }
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  window._currentAnimations = [];
}

async function loadGltfOrFbx(url) {
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
    return { scene: fbx, animations: fbx.animations || [] };
  }
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
  return loader.loadAsync(url);
}

async function resolveUrl(entry) {
  const candidates = [];
  if (entry.cdnUrl) candidates.push(entry.cdnUrl);
  for (const u of entry.altUrls || []) if (u) candidates.push(u);
  if (entry.path) {
    candidates.push(`${R2}/${entry.path}`);
    candidates.push(`https://molochdagod.github.io/ObjectStore/${entry.path}`);
  }
  if (entry.isBakedClip && entry.bakedRel) {
    candidates.push(`${ARENA}/anims/baked/${encodeURI(entry.bakedRel)}.json`);
    candidates.push(`${OPEN}/anims/baked/${encodeURI(entry.bakedRel)}.json`);
  }
  // Prefer R2 over secondary hosts; skip forbidden character CDNs entirely
  const ordered = [...new Set(candidates)].sort((a, b) => {
    const ar = a.includes('assets.grudge-studio.com') ? 0 : 1;
    const br = b.includes('assets.grudge-studio.com') ? 0 : 1;
    return ar - br;
  });
  for (const url of ordered) {
    if (isForbiddenCharacterHost(url)) {
      console.warn('[resolveUrl] skip secondary character host', url);
      continue;
    }
    try {
      const r = await fetch(url, { method: 'HEAD', mode: 'cors', signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) continue;
        return url;
      }
    } catch {
      /* try GET fallback */
      try {
        const r = await fetch(url, { method: 'GET', mode: 'cors', signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('text/html')) return url;
        }
      } catch {
        /* next */
      }
    }
  }
  // Never fall back to a forbidden host
  const safe = ordered.find((u) => !isForbiddenCharacterHost(u));
  return safe || null;
}

async function loadCharacterKit(raceId) {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  if (characterTemplateCache.has(raceId)) {
    return clone(characterTemplateCache.get(raceId));
  }
  const kit = RACE_KITS[raceId] || RACE_KITS['western-kingdoms'];
  // Deploy order: production GLB (glb2glb) → R2 GLB → FBX author only.
  // Never arena secondary character CDN.
  const urls = raceKitDeployUrls(kit, isForbiddenCharacterHost);
  let gltf = null;
  let loadedUrl = null;
  for (const url of urls) {
    try {
      gltf = await loadGltfOrFbx(url);
      loadedUrl = url;
      break;
    } catch (e) {
      console.warn('[grudge6 host] load failed', url, e?.message || e);
    }
  }
  if (!gltf) {
    throw new Error(
      `Failed to load grudge6 race kit (${raceId}) from R2 SSOT. ` +
        `Tried: ${urls.join(', ')}. Secondary arena character hosts are disabled.`,
    );
  }
  const root = gltf.scene;
  // production-glb = deploy bake (textures/scale in mesh); fbx-atlas = author + runtime atlas
  root.userData.importPipeline = /\.fbx($|\?)/i.test(loadedUrl || '')
    ? 'fbx-atlas'
    : 'production-glb';
  root.userData.sourceUrl = loadedUrl || kit.glb || kit.fbx;
  root.userData.grudge6SsotHost = true;
  root.userData.productionBaked = root.userData.importPipeline === 'production-glb';
  root.userData.grudgeHeightFit = false; // never trust template sticky fit
  // Unify skeletons lightly (Toon RTS multi-skeleton kits)
  const canon = new Map();
  root.traverse((o) => {
    if (o.isBone && o.name && !canon.has(o.name)) canon.set(o.name, o);
  });
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      const bones = o.skeleton.bones.map((b) => canon.get(b.name) || b);
      o.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix);
    }
  });
  // Prefer baked mats; strip 1×1 placeholders; race atlas if still bare
  let { prep: mats } = await prepAndRebindMaterials(root, {
    path: kit.r2 || kit.glb || kit.fbx,
    name: raceId,
  });
  if (mats.withMap === 0) {
    await tryBindAtlas(root, raceId);
    mats = prepMaterials(root);
  }
  characterTemplateCache.set(raceId, root);
  return clone(root);
}

async function playBakedOnCharacter(entry, raceId) {
  const model = await loadCharacterKit(raceId);
  const { prep: mats } = await prepAndRebindMaterials(model, {
    path: entry.path || entry.r2Key,
    name: entry.name,
  });
  const hostEntry = {
    kind: 'character',
    name: raceId,
    path: 'models/grudge6/races',
    cdnUrl: RACE_KITS[raceId]?.fbx || RACE_KITS[raceId]?.r2,
  };
  const info = deployModel(model, { entry: hostEntry });
  currentRoot = model;
  scene.add(model);
  rebuildMeshIndex(model);
  setDiag(info, mats, `baked-on-grudge6 (${raceId})`, hostEntry);

  const rel = entry.bakedRel;
  const urls = [
    `${ARENA}/anims/baked/${encodeURI(rel)}.json`,
    `${OPEN}/anims/baked/${encodeURI(rel)}.json`,
  ];
  let clip = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) continue;
      const json = await r.json();
      clip = THREE.AnimationClip.parse(json);
      // Best practice: baked Bip001 = quaternion-only on grounded kit
      clip = new THREE.AnimationClip(
        clip.name,
        clip.duration,
        clip.tracks.filter((t) => t.name.endsWith('.quaternion')),
        clip.blendMode,
      );
      clip = rematchClip(model, clip);
      break;
    } catch {
      /* next */
    }
  }
  if (!clip) throw new Error('Baked Bip001 clip not found (prefer anims/baked/*.json)');
  clip = stripPositionTracks(clip); // also drops .scale (100× retarget)
  mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  const si = enforceCharacterSi(model, 1.8);
  const look = diagnoseCharacterLook(model);
  window._currentAnimations = [clip];
  fillAnimUi([clip]);
  frameCamera(model);
  const h = si.heightM || info.height;
  const face = info.facingApplied ? ' +Z' : '';
  document.getElementById('viewerInfo').textContent =
    `baked Bip001 JSON · ${clip.duration.toFixed(2)}s · bones ${info.bones.length} · h=${h.toFixed(2)}m · feetY=${charBodyBox(model).min.y.toFixed(3)}${face}` +
    (look.ok ? ' · look OK' : ` · LOOK ${look.issues.map((i) => i.id).join(',')}`);
}

function fillAnimUi(anims) {
  const sel = document.getElementById('animSelect');
  const list = document.getElementById('clipList');
  if (!anims?.length) {
    sel.style.display = 'none';
    list.innerHTML = '<em>No clips</em>';
    return;
  }
  sel.style.display = 'inline-block';
  sel.innerHTML =
    '<option value="">— Animations —</option>' +
    anims.map((a, i) => `<option value="${i}">${esc(a.name || `Clip ${i}`)} (${a.duration.toFixed(2)}s)</option>`).join('');
  sel.value = '0';
  list.innerHTML = anims
    .map(
      (a, i) =>
        `<button type="button" data-i="${i}" class="${i === 0 ? 'active' : ''}">${esc(a.name || `Clip ${i}`)}</button>`,
    )
    .join('');
  list.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sel.value = btn.dataset.i;
      playAnimIndex(+btn.dataset.i);
    });
  });
}

function playAnimIndex(i) {
  if (!mixer || !window._currentAnimations?.[i]) return;
  mixer.stopAllAction();
  const clip = stripPositionTracks(window._currentAnimations[i]);
  window._currentAnimations[i] = clip;
  mixer.clipAction(clip).reset().play();
  // Sample one frame then re-ground + SI gate — kills hip-float / 100× after attack
  if (currentRoot) {
    mixer.update(1 / 30);
    reGroundAfterAnimSample(currentRoot, 0);
    const si = enforceCharacterSi(currentRoot, 1.8);
    if (si.fixed) {
      console.warn('[character-correctness] SI re-enforced after clip', si.heightM);
    }
    const look = diagnoseCharacterLook(currentRoot);
    if (look.issues.length) {
      console.warn('[character-correctness]', look.issues);
    }
  }
}

function frameCamera(obj) {
  const box = bodyBox(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Clamp framing so a residual 100× never yeets the camera to 200 m
  const raw = Math.max(size.x, size.y, size.z, 0.5);
  const max = Math.min(Math.max(raw, 1), 3.5);
  const cy = Number.isFinite(center.y) ? Math.min(Math.max(center.y, 0.4), 1.5) : 0.9;
  camera.position.set(center.x + max * 0.9, cy + max * 0.45, center.z + max * 1.35);
  controls.target.set(center.x, cy, center.z);
  controls.update();
}

function guessRaceId(entry) {
  const blob = `${entry?.path || ''} ${entry?.name || ''} ${entry?.cdnUrl || ''}`.toLowerCase();
  if (/brb_|barbarian/.test(blob)) return 'barbarians';
  if (/elf_|high-?elf|elves/.test(blob)) return 'high-elves';
  if (/dwf_|dwarf/.test(blob)) return 'dwarves';
  if (/orc_/.test(blob)) return 'orcs';
  if (/ud_|undead/.test(blob)) return 'undead';
  if (/wk_|western|human/.test(blob)) return 'western-kingdoms';
  return document.getElementById('previewRace')?.value || 'western-kingdoms';
}

async function loadMeshAsset(entry) {
  // grudge6 race kits always load via SSOT host path (R2 FBX/GLB) — never arena CDN
  if (isGrudge6RaceKitEntry(entry) && entry.kind === 'character') {
    const raceId = guessRaceId(entry);
    const model = await loadCharacterKit(raceId);
    const { prep: mats } = await prepAndRebindMaterials(model, {
      path: entry.path || RACE_KITS[raceId]?.fbx,
      name: entry.name,
    });
    const hostEntry = {
      ...entry,
      kind: 'character',
      path: entry.path || `models/grudge6/races`,
      cdnUrl: RACE_KITS[raceId]?.fbx,
      source: 'grudge6-ssot',
    };
    const info = deployModel(model, { entry: hostEntry });
    currentRoot = model;
    scene.add(model);
    const report = setDiag(info, mats, `grudge6 R2 SSOT host (${raceId})`, hostEntry);
    fillAnimUi([]);
    frameCamera(model);
    const h = info.measure ?? info.height;
    document.getElementById('viewerInfo').textContent =
      `grudge6 SSOT · ${raceId} · h=${h.toFixed(2)}m · feetY=${charBodyBox(model).min.y.toFixed(3)} · unit ${info.unitKind || 'ok'}` +
      (info.siEnforced ? ' · SI-enforced' : '');
    return { model, anims: [] };
  }

  let url = await resolveUrl(entry);
  if (!url) throw new Error('No URL');
  if (isForbiddenCharacterHost(url)) {
    throw new Error(
      `Blocked secondary character host:\n${url}\nUse assets.grudge-studio.com/models/grudge6/races/* only.`,
    );
  }
  const gltf = await loadGltfOrFbx(url);
  const model = gltf.scene;
  // Strip 1×1 convert placeholders + rebind bow/arrow atlas from CDN
  const { prep: mats, rebound, atlasUrl } = await prepAndRebindMaterials(model, {
    path: entry.path || entry.r2Key || url,
    cdnUrl: entry.cdnUrl || url,
    name: entry.name,
    r2Key: entry.r2Key,
  });
  if (rebound) mats.rebound = rebound;
  const info = deployModel(model, { entry });
  currentRoot = model;
  scene.add(model);
  const report = setDiag(
    info,
    mats,
    rebound ? `mesh · atlas rebound (${rebound})` : 'mesh asset',
    entry,
  );
  const anims = gltf.animations || [];
  if (anims.length) {
    mixer = new THREE.AnimationMixer(model);
    const remapped = anims.map((c) => stripPositionTracks(rematchClip(model, c)));
    window._currentAnimations = remapped;
    mixer.clipAction(remapped[0]).play();
    mixer.update(1 / 30);
    if (report?.profile?.kind === 'character' || report?.profile?.kind === 'animation') {
      reGroundAfterAnimSample(model, 0);
      enforceCharacterSi(model, 1.8);
    }
    fillAnimUi(remapped);
  } else {
    fillAnimUi([]);
  }
  frameCamera(model);
  const kind = report?.profile?.kind || entry.kind || 'other';
  const m = info.measure ?? info.height;
  const axis = report?.profile?.scaleAxis === 'height' ? 'h' : 'L';
  const texNote = rebound
    ? `tex rebound ${atlasUrl ? atlasUrl.split('/').pop() : ''}`
    : `tex ${mats.withMap}/${mats.mats}`;
  document.getElementById('viewerInfo').textContent =
    `${kind} · ${entry.format?.toUpperCase() || ''} · ${entry.sizeKB || '?'} KB · ` +
    `${anims.length} clips · ${axis}=${m.toFixed(2)}m · layer ${report?.profile?.physicsLayer || '?'} · ${texNote}`;
  return { model, anims };
}

/**
 * True if entry is itself a grudge6 race kit (show mesh as host).
 * Everything else under "Play anims on character" is **clips only** → R2 host.
 */
function isGrudge6RaceKitEntry(entry) {
  const p = `${entry?.path || ''} ${entry?.cdnUrl || ''} ${entry?.source || ''}`.toLowerCase();
  return (
    entry?.source === 'grudge6-ssot' ||
    entry?.source === 'grudge6-curated' ||
    /models\/grudge6\/races\/.*(wk|brb|elf|dwf|orc|ud)_characters/i.test(p) ||
    /grudge6\/races/i.test(p)
  );
}

async function loadAnimClipOnCharacter(entry, raceId) {
  // Load animation file, then apply to grudge6 R2 host (never secondary mannequin)
  const onChar = document.getElementById('chkAnimOnChar')?.checked !== false;
  if (!onChar) {
    await loadMeshAsset(entry);
    return;
  }
  if (entry.isBakedClip || entry.format === 'json') {
    await playBakedOnCharacter(entry, raceId);
    return;
  }

  // Race kit entries: show the kit itself (SSOT mesh), not "anim file as body"
  if (isGrudge6RaceKitEntry(entry) && entry.kind === 'character') {
    await loadMeshAsset(entry);
    return;
  }

  const url = await resolveUrl(entry);
  if (!url) throw new Error('No animation URL');
  if (isForbiddenCharacterHost(url)) {
    throw new Error(
      'Blocked secondary character host URL. Use R2 models/grudge6/races/* or baked Bip001 JSON.',
    );
  }

  const gltf = await loadGltfOrFbx(url);
  let anims = gltf.animations || [];

  // KILL: "embedded skinned anim" path — Mixamo/GLB mannequins are 100× wrong scale
  // and wrong skeleton. Always extract clips onto grudge6 R2 host when on-character.
  let hasSkin = false;
  gltf.scene?.traverse((o) => {
    if (o.isSkinnedMesh) hasSkin = true;
  });

  if (!anims.length) {
    // mesh-only file — still do not use as grudge6 substitute
    if (hasSkin && !isGrudge6RaceKitEntry(entry)) {
      throw new Error(
        'This file has a skinned mesh but no clips, and is not a grudge6 race kit. ' +
          'Use models/grudge6/races/*_Characters.fbx/glb or baked anims/baked/*.json.',
      );
    }
    await loadMeshAsset(entry);
    return;
  }

  const model = await loadCharacterKit(raceId);
  const { prep: mats } = await prepAndRebindMaterials(model, {
    path: entry.path || entry.r2Key,
    name: entry.name,
  });
  const hostEntry = {
    kind: 'character',
    name: raceId,
    path: 'models/grudge6/races',
    cdnUrl: RACE_KITS[raceId]?.fbx || RACE_KITS[raceId]?.r2,
  };
  const info = deployModel(model, { entry: hostEntry });
  currentRoot = model;
  scene.add(model);
  setDiag(
    info,
    mats,
    hasSkin
      ? `clips-from-raw→grudge6 host (${raceId}) · embedded mesh discarded`
      : `clip-on-grudge6 (${raceId})`,
    hostEntry,
  );
  mixer = new THREE.AnimationMixer(model);
  // strip position + scale tracks (100× retarget); rematch Bip001 names
  const remapped = anims.map((c) => stripPositionTracks(rematchClip(model, c)));
  window._currentAnimations = remapped;
  mixer.clipAction(remapped[0]).play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  const si = enforceCharacterSi(model, 1.8);
  fillAnimUi(remapped);
  frameCamera(model);
  const look = diagnoseCharacterLook(model);
  const fmt = (entry.format || url.split('.').pop() || '').toUpperCase();
  const warnFmt =
    fmt !== 'JSON'
      ? ` · ⚠ raw ${fmt} (prefer baked Bip001 JSON)`
      : '';
  document.getElementById('viewerInfo').textContent =
    `anim→grudge6 R2 host · ${anims.length} clips · rematched · h=${si.heightM.toFixed(2)}m · feetY=${charBodyBox(model).min.y.toFixed(3)}` +
    warnFmt +
    (look.ok ? ' · look OK' : ` · LOOK ${look.issues.map((i) => i.id).join(',')}`);
}

function pushDeepLink(entry) {
  if (!entry || !window.history?.replaceState) return;
  const sp = new URLSearchParams();
  if (entry.grudgeUuid) sp.set('uuid', entry.grudgeUuid);
  if (entry.path) sp.set('path', entry.path);
  if (entry.kind) sp.set('kind', entry.kind);
  const q = document.getElementById('searchBox')?.value?.trim();
  if (q) sp.set('q', q);
  const url = `${location.pathname}?${sp.toString()}`;
  history.replaceState({ asset: entry.id }, '', url);
}

async function openViewer(entry) {
  if (!entry) return;
  if (!renderer) initViewer();
  document.getElementById('viewerOverlay').classList.add('active');
  document.getElementById('viewerTitle').textContent = entry.name;
  document.getElementById('viewerInfo').textContent = entry.path || entry.kind;
  document.body.style.overflow = 'hidden';
  const le = document.getElementById('viewerLoading');
  le.style.display = 'flex';
  le.innerHTML = '<div class="spinner"></div><p>Loading…</p>';
  clearSceneModel();
  setDiag(null);
  fillAnimUi([]);
  rebuildMeshIndex(null);
  selectedMeshName = null;
  fillUsePanel(entry);
  pushDeepLink(entry);
  const raceId = document.getElementById('previewRace')?.value || 'western-kingdoms';
  try {
    if (entry.kind === 'animation' || entry.isBakedClip) {
      await loadAnimClipOnCharacter(entry, raceId);
    } else {
      await loadMeshAsset(entry);
    }
    rebuildMeshIndex(currentRoot);
    fillUsePanel(entry);
    le.style.display = 'none';
  } catch (e) {
    console.error(e);
    le.innerHTML = `<div style="text-align:center;padding:24px"><p style="color:#f87171">Load failed</p><p style="font-size:.8rem;max-width:420px">${esc(e.message)}</p></div>`;
    le.style.display = 'flex';
  }
}

function findEntryByDeepLink() {
  const sp = new URLSearchParams(location.search);
  const uuid = sp.get('uuid');
  const path = sp.get('path');
  const q = sp.get('q');
  const kind = sp.get('kind');
  if (q) {
    const box = document.getElementById('searchBox');
    if (box) box.value = q;
  }
  if (kind) activeKind = kind;
  if (!uuid && !path) return null;
  const pathN = (path || '').replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
  const uuidN = (uuid || '').toLowerCase();
  return (
    allModels.find(
      (m) =>
        (uuidN && m.grudgeUuid && m.grudgeUuid.toLowerCase() === uuidN) ||
        (pathN && (m.path || '').toLowerCase() === pathN),
    ) ||
    allModels.find(
      (m) => pathN && (m.path || '').toLowerCase().endsWith(pathN),
    ) ||
    null
  );
}

// ── Local drop ─────────────────────────────────────────
function setupDrop() {
  const dz = document.getElementById('dropZone');
  const fi = document.getElementById('fileInput');
  if (!dz) return;
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadLocal(e.dataTransfer.files[0]);
  });
  fi.addEventListener('change', () => {
    if (fi.files[0]) loadLocal(fi.files[0]);
  });
}

async function loadLocal(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['glb', 'gltf', 'fbx'].includes(ext)) {
    alert('Drop GLB, GLTF, or FBX');
    return;
  }
  const entry = normalizeEntry(
    {
      name: file.name,
      path: file.name,
      format: ext,
      sizeKB: Math.round(file.size / 1024),
      kind: /anim|walk|run|idle|attack/i.test(file.name) ? 'animation' : 'other',
      cdnUrl: URL.createObjectURL(file),
    },
    'local',
  );
  openViewer(entry);
}

// ── Wire UI ────────────────────────────────────────────
function setActionStatus(msg) {
  const el = document.getElementById('actionStatus');
  if (el) el.textContent = msg || '';
}

async function runUuidVerify() {
  const btn = document.getElementById('btnVerifyUuid');
  if (btn) btn.disabled = true;
  setActionStatus('Verifying UUIDs…');
  try {
    await verifyAll(allModels, d1Index, (i, n) => {
      setActionStatus(`Verifying UUIDs… ${i}/${n}`);
    });
    uuidVerified = true;
    // Refresh search blobs with uuid
    for (const m of allModels) {
      if (m.grudgeUuid) {
        m.searchBlob = `${m.searchBlob} ${m.grudgeUuid} ${m.uuidStatus || ''}`.toLowerCase();
      }
    }
    updateUuidStat();
    const ok = allModels.filter((m) => m.uuidStatus === 'ok').length;
    const der = allModels.filter((m) => m.uuidStatus === 'derived').length;
    const bad = allModels.filter((m) =>
      ['invalid', 'mismatch', 'missing'].includes(m.uuidStatus),
    ).length;
    setActionStatus(`UUID done · ok ${ok} · derived ${der} · issues ${bad}`);
    applyFilters();
  } catch (e) {
    console.error(e);
    setActionStatus(`UUID verify failed: ${e.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showDedupePanel(text) {
  const panel = document.getElementById('dedupePanel');
  const pre = document.getElementById('dedupeReport');
  if (panel) panel.hidden = false;
  if (pre) pre.textContent = text;
}

async function runDedupeScan() {
  setActionStatus('Dedupe scan…');
  try {
    // Ensure UUIDs present
    if (!uuidVerified) await runUuidVerify();
    const local = findCatalogDuplicates(allModels);
    let remote = null;
    try {
      const assets = allModels.slice(0, 1500).map((m) => ({
        r2Key: m.path || m.r2Key,
        grudgeUuid: m.grudgeUuid,
        format: m.format,
        textures: m.textures,
        textureStatus: m.textureStatus,
        productionBaked: m.productionBaked,
        bakePipeline: m.bakePipeline,
      }));
      remote = await callDeployAi('/v1/dedupe/scan', { assets });
    } catch (e) {
      remote = { error: e.message, note: 'Deploy AI offline — local-only scan' };
    }
    const lines = [
      '=== LOCAL CATALOG DEDUPE ===',
      JSON.stringify(local.summary, null, 2),
      '',
      'Top basename dups:',
      ...local.byBasename.slice(0, 15).map(
        (g) => `  [${g.count}] ${g.key}\n    ${g.paths.join('\n    ')}`,
      ),
      '',
      'Top UUID dups:',
      ...local.byUuid.slice(0, 10).map(
        (g) => `  [${g.count}] ${g.key}\n    ${g.paths.join('\n    ')}`,
      ),
      '',
      '=== DEPLOY AI /v1/dedupe/scan ===',
      remote.error
        ? String(remote.error)
        : JSON.stringify(remote.summary || remote, null, 2),
      '',
      'Purge CLI (review first):',
      '  node scripts/dedupe-purge.mjs --catalog <catalog.json> --write-plan reports/purge.json',
    ];
    showDedupePanel(lines.join('\n'));
    setActionStatus(
      `Dedupe · basename groups ${local.summary.basenameDupGroups} · uuid groups ${local.summary.uuidDupGroups}`,
    );
  } catch (e) {
    console.error(e);
    setActionStatus(`Dedupe failed: ${e.message}`);
  }
}

async function runDeployPlan() {
  setActionStatus('Deploy plan…');
  try {
    const assets = (filtered.length ? filtered : allModels).slice(0, 800).map((m) => ({
      r2Key: m.path || m.r2Key,
      grudgeUuid: m.grudgeUuid,
      format: m.format,
      textures: m.textures,
      textureStatus: m.textureStatus,
      productionBaked: m.productionBaked,
      bakePipeline: m.bakePipeline,
      deployReady: m.deployReady,
      cdnUrl: m.cdnUrl,
    }));
    let plan;
    try {
      plan = await callDeployAi('/v1/deploy/plan', { assets });
    } catch (e) {
      // offline: local production filter
      const ready = [];
      const blocked = [];
      for (const m of filtered.length ? filtered : allModels) {
        const row = { r2Key: m.path || m.r2Key, name: m.name };
        if (isProductionDeployReady(m)) ready.push(row);
        else blocked.push(row);
      }
      plan = {
        readyCount: ready.length,
        blockedCount: blocked.length,
        ready: ready.slice(0, 40),
        blocked: blocked.slice(0, 40),
        policy: 'local isProductionDeployReady (deploy AI offline)',
        error: e.message,
      };
    }
    const lines = [
      '=== PRODUCTION DEPLOY PLAN ===',
      plan.policy || '',
      `ready=${plan.readyCount} blocked=${plan.blockedCount}`,
      plan.error ? `(AI: ${plan.error})` : '',
      '',
      'Ready (sample):',
      ...(plan.ready || []).slice(0, 25).map((r) => `  ✓ ${r.r2Key || r.name}`),
      '',
      'Blocked (sample):',
      ...(plan.blocked || []).slice(0, 25).map((r) => `  ✗ ${r.r2Key || r.name} — ${r.reason || 'not production'}`),
      '',
      'Fix blocked: glb2glb --height 1.8 --texture-size 1024 → R2 → registry seed',
    ];
    showDedupePanel(lines.join('\n'));
    setActionStatus(`Deploy plan · ready ${plan.readyCount} · blocked ${plan.blockedCount}`);
  } catch (e) {
    console.error(e);
    setActionStatus(`Deploy plan failed: ${e.message}`);
  }
}

function snapshotList(list, label) {
  const snapable = list.filter(canSnapshot);
  let done = 0;
  const total = snapable.length;
  if (!total) {
    setActionStatus('No snapshot-able assets in selection');
    return;
  }
  setActionStatus(`Queueing ${total} snapshots…`);
  for (const m of snapable) {
    const key = thumbKeyOf(m);
    if (!key) continue;
    if (thumbCacheMem.has(key)) {
      done++;
      continue;
    }
    resolveSnapshotUrl(m).then((url) => {
      if (!url) {
        done++;
        return;
      }
      enqueueThumb({
        key,
        url,
        onDone: (dataUrl) => {
          done++;
          if (dataUrl) thumbCacheMem.set(key, dataUrl);
          setActionStatus(`${label}: ${done}/${total} · queue ${thumbQueueLength()}`);
          if (done >= total) {
            updateThumbStat();
            renderPage();
            setActionStatus(`${label} complete · ${total} processed`);
          }
        },
      });
    });
  }
  // Refresh page cards as snaps arrive
  const poll = setInterval(() => {
    if (thumbQueueLength() === 0 && done >= total) {
      clearInterval(poll);
      updateThumbStat();
      renderPage();
    } else {
      // Soft update visible thumbs
      document.querySelectorAll('.model-card').forEach((card) => {
        const k = card.dataset.thumbKey;
        if (k && thumbCacheMem.has(k)) setCardThumb(card, thumbCacheMem.get(k));
      });
    }
  }, 400);
}

function wireUi() {
  document.getElementById('searchBox').addEventListener('input', () => applyFilters());
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortKey = e.target.value;
    applyFilters();
  });
  document.getElementById('btnVerifyUuid')?.addEventListener('click', () => runUuidVerify());
  document.getElementById('btnDedupe')?.addEventListener('click', () => runDedupeScan());
  document.getElementById('btnDeployPlan')?.addEventListener('click', () => runDeployPlan());
  document.getElementById('btnSnapPage')?.addEventListener('click', () => {
    const start = page * PAGE_SIZE;
    snapshotList(filtered.slice(start, start + PAGE_SIZE), 'Page');
  });
  document.getElementById('btnSnapVisible')?.addEventListener('click', () => {
    // Cap to avoid melting GPU on huge catalogs
    const CAP = 120;
    const list = filtered.filter(canSnapshot).slice(0, CAP);
    if (filtered.filter(canSnapshot).length > CAP) {
      setActionStatus(`Capped at ${CAP} of filtered (use filters to narrow)`);
    }
    snapshotList(list, 'Filtered');
  });
  // Use panel copy
  document.querySelectorAll('.copy-btn[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.copy;
      const el = document.getElementById(id);
      const ok = await copyText(el?.textContent === '—' ? '' : el?.textContent);
      flashUse(ok ? `Copied ${id}` : 'Copy failed');
    });
  });
  document.getElementById('btnCopySnippet')?.addEventListener('click', async () => {
    const ok = await copyText(document.getElementById('useSnippet')?.value);
    flashUse(ok ? 'Snippet copied' : 'Copy failed');
  });
  document.getElementById('btnCopyAll')?.addEventListener('click', async () => {
    if (!currentEntry) return;
    const pack = animPackHint(currentEntry);
    const kind = inferAssetKind(currentEntry);
    const profile = getDeployProfile(currentEntry);
    const rep = window._lastDeployReport;
    const text = [
      `grudgeUuid: ${currentEntry.grudgeUuid || ''}`,
      `r2Key: ${r2KeyOf(currentEntry)}`,
      `cdnUrl: ${cdnUrlOf(currentEntry)}`,
      `kind: ${kind}`,
      `physicsLayer: ${profile.physicsLayer}`,
      `scaleAxis: ${profile.scaleAxis}`,
      `okRangeM: ${profile.okRange.join('–')}`,
      `animPack: ${pack || ''}`,
      `meshName: ${selectedMeshName || ''}`,
      rep
        ? `deploy: ${rep.summary.pass ? 'PASS' : 'FAIL'} measure=${rep.summary.measure?.toFixed?.(3) ?? '?'}m fail=${rep.summary.fail} warn=${rep.summary.warn}`
        : 'deploy: (open viewer to run checks)',
      '',
      openImportSnippet(currentEntry),
    ].join('\n');
    flashUse((await copyText(text)) ? 'All fields copied' : 'Copy failed');
  });
  document.getElementById('btnShareLink')?.addEventListener('click', async () => {
    if (!currentEntry) return;
    pushDeepLink(currentEntry);
    flashUse((await copyText(location.href)) ? 'Deep link copied' : 'Copy failed');
  });
  document.getElementById('btnMeshAll')?.addEventListener('click', () => setAllMeshesVisible(true));
  document.getElementById('btnMeshNone')?.addEventListener('click', () => setAllMeshesVisible(false));
  document.getElementById('btnOpenForge')?.addEventListener('click', () => {
    if (!currentEntry) {
      flashUse('Load an asset first');
      return;
    }
    const href = openInForge(currentForgeOpts({ workspace: 'assets' }));
    flashUse(`Opened Forge · ${href.slice(0, 48)}…`);
  });
  document.getElementById('btnOpenForgeWeapons')?.addEventListener('click', () => {
    const w = document.getElementById('weaponSkillType')?.value || 'sword';
    openInForge(currentForgeOpts({ workspace: 'weapons', weaponType: w }));
    flashUse(`Forge weapon skills · ${w}`);
  });
  document.getElementById('btnOpenForgeScene')?.addEventListener('click', () => {
    // Prefer full pack when cart has items; else single asset as scene
    const cart = loadSceneCart();
    const assets = cart.length ? cart : currentEntry ? [currentEntry] : [];
    if (!assets.length) {
      flashUse('Add assets to scene cart (or open one asset)');
      return;
    }
    const pack = buildForgeScenePack(assets, {
      name: `pipeline-${assets.length}assets`,
      includeScripts: true,
    });
    openForgeWithScenePack(pack);
    flashUse(`Edit in Forge · ${assets.length} asset(s) + scripts`);
  });
  document.getElementById('btnAddToCart')?.addEventListener('click', () => {
    if (!currentEntry) {
      flashUse('Load an asset first');
      return;
    }
    const cart = addToSceneCart(currentEntry);
    renderSceneCart();
    flashUse(`Scene cart · ${cart.length} asset(s)`);
  });
  document.getElementById('btnSaveForgeFromViewer')?.addEventListener('click', () => {
    if (!currentEntry) {
      flashUse('Load an asset first');
      return;
    }
    const pack = buildForgeScenePack([currentEntry], {
      name: currentEntry.name || currentEntry.path || 'pipeline-asset',
    });
    const fn = downloadForgeScenePack(pack);
    flashUse(`Saved ${fn}`);
  });
  document.getElementById('btnSceneCart')?.addEventListener('click', () => {
    const bar = document.getElementById('sceneCartBar');
    if (!bar) return;
    bar.hidden = !bar.hidden;
    renderSceneCart();
  });
  document.getElementById('btnCartAddCurrent')?.addEventListener('click', () => {
    if (!currentEntry) {
      flashUse('Open a viewer asset first');
      return;
    }
    addToSceneCart(currentEntry);
    renderSceneCart();
    flashUse('Added to scene cart');
  });
  document.getElementById('btnCartClear')?.addEventListener('click', () => {
    clearSceneCart();
    renderSceneCart();
    flashUse('Scene cart cleared');
  });
  document.getElementById('btnSaveForgeScene')?.addEventListener('click', () => {
    const cart = loadSceneCart();
    const assets = cart.length ? cart : currentEntry ? [currentEntry] : [];
    if (!assets.length) {
      flashUse('Scene cart empty — add assets first');
      return;
    }
    const pack = buildForgeScenePack(assets, {
      name: `pipeline-scene-${assets.length}`,
      includeScripts: true,
    });
    const fn = downloadForgeScenePack(pack);
    flashUse(`Downloaded ${fn} · open in Forge (File → Import)`);
  });
  document.getElementById('btnOpenForgePack')?.addEventListener('click', () => {
    const cart = loadSceneCart();
    const assets = cart.length ? cart : currentEntry ? [currentEntry] : [];
    if (!assets.length) {
      flashUse('Add assets to cart (or open one)');
      return;
    }
    const pack = buildForgeScenePack(assets, {
      name: `pipeline-scene-${assets.length}`,
      includeScripts: true,
    });
    const res = openForgeWithScenePack(pack, { alsoDownload: true });
    flashUse(
      res.ok
        ? `Forge opened · pack posted + ${assets.length} assets downloaded`
        : 'Popup blocked — pack downloaded; import .gfscene in Forge',
    );
  });
  // Initial cart badge
  renderSceneCart();
  document.getElementById('weaponSkillType')?.addEventListener('change', () => refreshWeaponSkillsPanel());
  document.getElementById('btnMeshSolo')?.addEventListener('click', () => {
    if (selectedMeshName) soloMesh(selectedMeshName);
    else flashUse('Pick a mesh with “use” first');
  });
  document.getElementById('btnMeshColor')?.addEventListener('click', () => applySelectedMeshColor());
  document.getElementById('btnMeshTex')?.addEventListener('click', () => {
    applySelectedMeshTexture();
  });
  document.getElementById('meshSlotFilter')?.addEventListener('change', (e) => {
    const slot = e.target.value;
    if (!slot) {
      setAllMeshesVisible(true);
      return;
    }
    soloEquipSlot(slot);
  });
  document.getElementById('viewerCloseBtn').addEventListener('click', () => {
    document.getElementById('viewerOverlay').classList.remove('active');
    document.body.style.overflow = '';
    clearSceneModel();
    rebuildMeshIndex(null);
    // keep query but optional: leave deep link so refresh reopens
  });
  document.getElementById('btnWire').addEventListener('click', (e) => {
    wireframe = !wireframe;
    e.currentTarget.classList.toggle('active', wireframe);
    if (currentRoot)
      currentRoot.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            m.wireframe = wireframe;
          });
        }
      });
  });
  document.getElementById('btnRotate').addEventListener('click', (e) => {
    autoRotate = !autoRotate;
    if (controls) controls.autoRotate = autoRotate;
    e.currentTarget.classList.toggle('active', autoRotate);
  });
  document.getElementById('btnGrid').addEventListener('click', (e) => {
    if (gridHelper) {
      gridHelper.visible = !gridHelper.visible;
      e.currentTarget.classList.toggle('active', gridHelper.visible);
    }
  });
  document.getElementById('animSelect').addEventListener('change', (e) => {
    if (e.target.value !== '') playAnimIndex(+e.target.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('viewerCloseBtn').click();
  });

  document.getElementById('btnHarvestFilter')?.addEventListener('click', () => {
    filterToHarvestAssets();
  });
  document.getElementById('btnCombatFilter')?.addEventListener('click', () => {
    filterToCombatAssets();
  });
  document.getElementById('btnNeedsToggle')?.addEventListener('click', () => {
    document.getElementById('fleetNeedsPanel')?.classList.toggle('collapsed');
  });
}

/** Fleet needs panel — harvest + combat projectile/VFX tracks. */
function renderFleetNeedsPanel() {
  const listEl = document.getElementById('fleetNeedsList');
  const metaEl = document.getElementById('fleetNeedsMeta');
  const covEl = document.getElementById('harvestCoverage');
  if (!listEl || !metaEl) return;

  const harvest = scoreHarvestCoverage(allModels);
  const combat = scoreCombatCoverage(allModels);
  if (covEl) covEl.textContent = `H${harvest.pct}% · C${combat.pct}%`;
  metaEl.innerHTML = `Harvest <strong>${harvest.covered}/${harvest.total}</strong> · Combat projectiles/VFX <strong>${combat.covered}/${combat.total}</strong>
    · ${harvest.runtime + combat.runtime} runtime packages
    · pinata + arrows/bullets/cannon/explosives
    · <a href="api/fleet-needs.json" target="_blank" rel="noreferrer">fleet-needs.json</a>
    · <a href="docs/PROJECTILES_AND_VFX.md" target="_blank" rel="noreferrer">PROJECTILES_AND_VFX</a>`;

  const section = (title, score) => {
    const head = `<div class="need-section-title">${esc(title)} · ${score.pct}% catalog</div>`;
    const cards = score.rows
      .map((row) => {
        const statusCls = row.status || 'partial';
        const coverCls =
          row.status === 'runtime' || row.status === 'planned'
            ? row.status
            : row.covered
              ? 'covered'
              : 'gap';
        const coverLabel =
          row.status === 'runtime'
            ? 'runtime'
            : row.status === 'planned'
              ? 'planned'
              : row.covered
                ? `catalog×${row.catalogHits || 0}`
                : 'gap';
        const tool = row.tool ? ` · tool ${esc(row.tool)}` : '';
        const pinata = row.pinata ? ' · pinata' : '';
        const subtype = row.subtype ? ` · ${esc(row.subtype)}` : '';
        const sample = row.sample ? `<div class="need-meta">hit: ${esc(row.sample)}</div>` : '';
        return `<article class="need-card" data-need-search="${esc(row.search || '')}" data-need-id="${esc(row.id)}" title="${esc(row.notes || '')}">
        <div class="need-title">${esc(row.label)}</div>
        <div class="need-meta">
          <span class="need-badge ${statusCls}">${esc(statusCls)}</span>
          <span class="need-badge ${coverCls}">${esc(coverLabel)}</span>
          ${esc(row.role || '')}${tool}${pinata}${subtype}
        </div>
        ${sample}
      </article>`;
      })
      .join('');
    return head + cards;
  };

  listEl.innerHTML = section('Harvest / pinata', harvest) + section('Combat projectiles + VFX', combat);

  listEl.querySelectorAll('.need-card').forEach((card) => {
    card.addEventListener('click', () => {
      const q = card.getAttribute('data-need-search') || '';
      const box = document.getElementById('searchBox');
      if (box && q) {
        box.value = q;
        activeKind = null;
        activeGroup = null;
        page = 0;
        applyFilters();
        document.getElementById('resultsArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function filterToHarvestAssets() {
  const box = document.getElementById('searchBox');
  if (box) box.value = 'harvest tree rock ore pebble stump debris nature crystal';
  activeKind = 'harvest';
  activeGroup = null;
  activeProd = null; // show ready + partial so gaps are visible
  page = 0;
  applyFilters();
  // If kind filter empty (no harvest-tagged yet), fall back to search-only
  if (!filtered.length) {
    activeKind = null;
    applyFilters();
  }
  document.getElementById('resultsArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filterToCombatAssets() {
  const box = document.getElementById('searchBox');
  if (box) {
    box.value =
      'arrow projectile bolt bullet cannonball grenade explosive fireball orb shell_arrow ballista vfx impact trail warning';
  }
  activeKind = 'projectile';
  activeGroup = null;
  activeProd = null;
  page = 0;
  applyFilters();
  if (!filtered.length) {
    activeKind = null;
    applyFilters();
  }
  document.getElementById('resultsArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function init() {
  wireUi();
  setupDrop();
  try {
    await loadCatalog();
  } catch (e) {
    console.error(e);
    document.getElementById('r2Status').className = 'r2-status offline';
    document.getElementById('r2Status').innerHTML = '<span class="r2-dot"></span> Catalog error';
  }
  applyFilters();
  renderFleetNeedsPanel();
  // Auto-run UUID verify once catalog is warm (non-blocking feel via yield)
  setTimeout(async () => {
    if (!uuidVerified) await runUuidVerify();
    const deep = findEntryByDeepLink();
    if (deep) {
      applyFilters();
      // ensure visible in filter if kind locked wrong
      openViewer(deep);
    }
    renderFleetNeedsPanel();
  }, 400);
}

init();
