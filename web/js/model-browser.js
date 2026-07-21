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
} from './use-contract.js';
import {
  prepMaterials,
  prepAndRebindMaterials,
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
  bodyBox as charBodyBox,
  prepareSkinnedMeasure,
} from './characterDeploy.js';

// ── Fleet hosts ────────────────────────────────────────
const R2 = 'https://assets.grudge-studio.com';
const ARENA = 'https://grudge-arena.grudge-studio.com';
const D1_API = 'https://api.grudge-studio.com/assets';
const OBJECTSTORE_MODELS = 'https://molochdagod.github.io/ObjectStore/api/v1/models3d.json';
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const PAGE_SIZE = 48;

const RACE_KITS = {
  'western-kingdoms': {
    label: 'WK human',
    glb: `${ARENA}/cdn/assets/characters/human/WK_Characters.glb`,
    r2: `${R2}/models/grudge6/races/WK_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/WK_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/western-kingdoms/WK_Standard_Units.webp`,
  },
  barbarians: {
    label: 'Barbarian',
    glb: `${ARENA}/cdn/assets/characters/barbarian/BRB_Characters.glb`,
    r2: `${R2}/models/grudge6/races/BRB_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/BRB_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/barbarians/BRB_StandardUnits_texture.webp`,
  },
  'high-elves': {
    label: 'Elf',
    glb: `${ARENA}/cdn/assets/characters/elf/ELF_Characters.glb`,
    r2: `${R2}/models/grudge6/races/ELF_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/ELF_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/elves/ELF_HighElves_Texture.webp`,
  },
  dwarves: {
    label: 'Dwarf',
    glb: `${ARENA}/cdn/assets/characters/dwarf/DWF_Characters.glb`,
    r2: `${R2}/models/grudge6/races/DWF_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/DWF_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/dwarves/DWF_Standard_Units.webp`,
  },
  orcs: {
    label: 'Orc',
    glb: `${ARENA}/cdn/assets/characters/orc/ORC_Characters.glb`,
    r2: `${R2}/models/grudge6/races/ORC_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/ORC_Characters.fbx`,
    atlas: `${R2}/textures/grudge6/orcs/ORC_StandardUnits.webp`,
  },
  undead: {
    label: 'Undead',
    glb: `${ARENA}/cdn/assets/characters/undead/UD_Characters.glb`,
    r2: `${R2}/models/grudge6/races/UD_Characters.glb`,
    fbx: `${R2}/models/grudge6/races/UD_Characters.fbx`,
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
let activeFormat = null;
let activeSource = null;
let activeUuid = null;
let sortKey = 'name';
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
    out.push(
      normalizeEntry(
        {
          id: `grudge6-race-${id}`,
          name: `${kit.label} — Characters kit`,
          path: `models/grudge6/races/${id}`,
          format: 'glb',
          category: 'grudge6-races',
          group: 'grudge6/races',
          kind: 'character',
          cdnUrl: kit.glb,
          animations: 0,
          textures: 1,
          textureStatus: 'atlas',
        },
        'grudge6-curated',
      ),
    );
  }
  for (const clip of BAKED_PACKS) {
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
          cdnUrl: `${ARENA}/anims/baked/${encodeURI(clip.id)}.json`,
        },
        'arena-baked',
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
    if (toks.length && !toks.every((t) => m.searchBlob.includes(t))) return false;
    return true;
  });
  filtered.sort((a, b) => {
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
    [activeKind, activeGroup, activeFormat, activeSource, activeUuid].filter(Boolean).join(' · ') ||
    'All assets';
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
      const us = m.uuidStatus || 'pending';
      const uuidBadge =
        us !== 'pending'
          ? `<span class="badge-uuid ${uuidStatusClass(us)}" title="${esc(m.uuidMessage || us)}">${esc(us)}</span>`
          : '';
      const meta = [
        m.format?.toUpperCase(),
        m.sizeKB ? (m.sizeKB >= 1024 ? `${(m.sizeKB / 1024).toFixed(1)} MB` : `${m.sizeKB} KB`) : null,
        m.animations ? `${m.animations} anim` : m.isBakedClip ? 'baked clip' : null,
        m.kind,
      ]
        .filter(Boolean)
        .join(' · ');
      const uuidLine = m.grudgeUuid
        ? `<div class="model-uuid" title="${esc(m.uuidMessage || '')}">${esc(m.grudgeUuid)}</div>`
        : '';
      const thumbHtml = mem
        ? `<img class="thumb" alt="" src="${mem}">`
        : `<span class="glyph">${glyphFor(m)}</span>`;
      return `<article class="model-card" data-idx="${idx}" data-thumb-key="${esc(key || '')}" title="${esc(m.path || m.name)}">
        <div class="model-icon">
          <span class="badge badge-fmt">${esc(m.format || '?')}</span>
          <span class="badge badge-kind">${esc(m.kind)}</span>
          <span class="badge badge-group">${esc(m.group)}</span>
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
    });
    const look = diagnoseCharacterLook(root);
    return {
      height: d.heightM,
      measure: d.measure,
      size: d.size,
      minY: d.minY,
      pelvis: d.pelvis,
      handR: d.handR,
      handL: d.handL,
      bones: d.bones,
      profile,
      scaleReason: d.facingApplied
        ? 'characterDeploy · art-forward +Z'
        : 'characterDeploy',
      unitFixed: false,
      normalized: true,
      facingApplied: d.facingApplied,
      lookIssues: look.issues,
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

  const { scale, reason, unitFixed, normalized } = computeDeployScale(
    measure,
    profile,
  );
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
      '<em class="dim">Load a multipack to isolate meshName</em>';
    document.getElementById('meshCount').textContent = '';
    document.getElementById('useMeshName').textContent = '—';
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
  list.innerHTML = names
    .map((n) => {
      const count = meshIndex.get(n).length;
      return `<label data-mesh="${esc(n)}">
        <input type="checkbox" class="mesh-vis" data-mesh="${esc(n)}" checked>
        <span title="${esc(n)}">${esc(n)}${count > 1 ? ` ×${count}` : ''}</span>
        <button type="button" class="mesh-pick" data-mesh="${esc(n)}" title="Select for meshName">use</button>
      </label>`;
    })
    .join('');
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

function selectMeshName(name) {
  selectedMeshName = name || null;
  document.getElementById('useMeshName').textContent = selectedMeshName || '—';
  document.querySelectorAll('#meshList label').forEach((lab) => {
    lab.classList.toggle('solo', lab.dataset.mesh === selectedMeshName);
  });
  if (currentEntry) {
    // refresh snippet context note
    const sn = document.getElementById('useSnippet');
    if (sn && selectedMeshName) {
      sn.value =
        openImportSnippet(currentEntry) +
        `\n// isolate multipack:\n// meshName = ${JSON.stringify(selectedMeshName)}`;
    }
  }
  flashUse(`meshName = ${selectedMeshName}`);
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
    candidates.push(`${ARENA}/anims/baked/${entry.bakedRel}.json`);
    candidates.push(`https://open.grudge-studio.com/anims/baked/${entry.bakedRel}.json`);
  }
  for (const url of [...new Set(candidates)]) {
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
  return candidates[0] || null;
}

async function loadCharacterKit(raceId) {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  if (characterTemplateCache.has(raceId)) {
    return clone(characterTemplateCache.get(raceId));
  }
  const kit = RACE_KITS[raceId] || RACE_KITS['western-kingdoms'];
  let gltf = null;
  for (const url of [kit.glb, kit.r2]) {
    try {
      gltf = await loadGltfOrFbx(url);
      break;
    } catch {
      /* next */
    }
  }
  if (!gltf) throw new Error('Failed to load character kit');
  const root = gltf.scene;
  root.userData.importPipeline = 'fbx-atlas';
  root.userData.sourceUrl = kit.fbx || kit.r2 || kit.glb;
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
    path: kit.r2 || kit.glb,
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
  setDiag(info, mats, `anim-on-character (${raceId})`, hostEntry);

  const rel = entry.bakedRel;
  const urls = [
    `${ARENA}/anims/baked/${rel}.json`,
    `https://open.grudge-studio.com/anims/baked/${rel}.json`,
  ];
  let clip = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) continue;
      const json = await r.json();
      clip = THREE.AnimationClip.parse(json);
      // rotation-only safer for retarget
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
  if (!clip) throw new Error('Baked clip not found');
  clip = stripPositionTracks(clip);
  mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  const look = diagnoseCharacterLook(model);
  window._currentAnimations = [clip];
  fillAnimUi([clip]);
  frameCamera(model);
  const face = info.facingApplied ? ' +Z' : '';
  document.getElementById('viewerInfo').textContent =
    `baked · ${clip.duration.toFixed(2)}s · bones ${info.bones.length} · h=${info.height.toFixed(2)}m · feetY=${info.minY.toFixed(3)}${face}` +
    (look.ok ? '' : ` · LOOK ${look.issues.map((i) => i.id).join(',')}`);
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
  // Sample one frame then re-ground — kills hip-float after sword_shield attack
  if (currentRoot) {
    mixer.update(1 / 30);
    reGroundAfterAnimSample(currentRoot, 0);
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
  const max = Math.max(size.x, size.y, size.z, 1);
  camera.position.set(center.x + max * 0.9, center.y + max * 0.45, center.z + max * 1.35);
  controls.target.copy(center);
  controls.update();
}

async function loadMeshAsset(entry) {
  const url = await resolveUrl(entry);
  if (!url) throw new Error('No URL');
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

async function loadAnimClipOnCharacter(entry, raceId) {
  // Load animation file, then apply to character
  const onChar = document.getElementById('chkAnimOnChar')?.checked !== false;
  if (!onChar) {
    await loadMeshAsset(entry);
    return;
  }
  if (entry.isBakedClip) {
    await playBakedOnCharacter(entry, raceId);
    return;
  }
  const url = await resolveUrl(entry);
  if (!url) throw new Error('No animation URL');
  const gltf = await loadGltfOrFbx(url);
  const anims = gltf.animations || [];
  // If file also has a skinned body, show it directly with mats
  let hasSkin = false;
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) hasSkin = true;
  });
  if (hasSkin && anims.length) {
    const { prep: mats } = await prepAndRebindMaterials(gltf.scene, entry);
    gltf.scene.userData.importPipeline =
      gltf.scene.userData.importPipeline || 'fbx-atlas';
    const info = deployModel(gltf.scene, { entry: { ...entry, kind: 'character' } });
    currentRoot = gltf.scene;
    scene.add(gltf.scene);
    setDiag(info, mats, 'embedded skinned anim', entry);
    mixer = new THREE.AnimationMixer(gltf.scene);
    const remapped = anims.map((c) => stripPositionTracks(rematchClip(gltf.scene, c)));
    window._currentAnimations = remapped;
    mixer.clipAction(remapped[0]).play();
    mixer.update(1 / 30);
    reGroundAfterAnimSample(gltf.scene, 0);
    fillAnimUi(remapped);
    frameCamera(gltf.scene);
    document.getElementById('viewerInfo').textContent =
      `skinned clip host · ${anims.length} clips · h=${info.height.toFixed(2)}m · feetY=${info.minY.toFixed(3)}`;
    return;
  }
  if (!anims.length) {
    // maybe mesh-only — show mesh
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
  setDiag(info, mats, `clip-on-character (${raceId})`, hostEntry);
  mixer = new THREE.AnimationMixer(model);
  const remapped = anims.map((c) => stripPositionTracks(rematchClip(model, c)));
  window._currentAnimations = remapped;
  mixer.clipAction(remapped[0]).play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  fillAnimUi(remapped);
  frameCamera(model);
  const look = diagnoseCharacterLook(model);
  document.getElementById('viewerInfo').textContent =
    `anim on character · ${anims.length} clips · rematched · h=${info.height.toFixed(2)}m · feetY=${(charBodyBox(model).min.y).toFixed(3)}` +
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
  document.getElementById('btnMeshSolo')?.addEventListener('click', () => {
    if (selectedMeshName) soloMesh(selectedMeshName);
    else flashUse('Pick a mesh with “use” first');
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
  // Auto-run UUID verify once catalog is warm (non-blocking feel via yield)
  setTimeout(async () => {
    if (!uuidVerified) await runUuidVerify();
    const deep = findEntryByDeepLink();
    if (deep) {
      applyFilters();
      // ensure visible in filter if kind locked wrong
      openViewer(deep);
    }
  }, 400);
}

init();
