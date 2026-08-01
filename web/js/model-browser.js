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
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  createViewerRenderer,
  disposeObject3D,
  loadGltfOrFbxShared,
  prepareLoadedRoot,
  isLikelyBinaryAsset,
  MAX_PIXEL_RATIO,
  getGltfLoader,
} from './threePipeline.js';
import {
  RACE_ASSETS,
  atlasUrl as fleetAtlasUrl,
  bindRaceAtlas,
  loadRaceTexture,
  EquipmentManager,
  kitUrl as fleetKitUrl,
  resolveCanonicalAssetUrl,
  isTrashGrudge6Path,
  isGrudge6SsotKitPath,
  isGrudge6RelatedPath,
  grudge6SsotKitKeys,
  detectFleetRaceId,
} from './grudge6-kit.js';
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
  purgeCatalogDuplicates,
  isRawKillPath,
  PROD_READY_SCORE,
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
  reGroundAfterEquip,
  stripPositionTracks,
  diagnoseCharacterLook,
  enforceCharacterSi,
  bodyBox as charBodyBox,
  prepareSkinnedMeasure,
  raceHeightM,
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
  countVisibleWeaponSoup,
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
import {
  FLEET_TRUTH_HOSTS,
  FLEET_TRUTH_VERSION,
  mergeTruthEntries,
  enrichFleetTruth,
  fetchProductionCatalog,
  d1Offsets,
  truthSummary,
  normalizeR2Key,
} from './fleetTruth.js';

// ── Fleet hosts — production deploy first ──
// Prefer: textured · meshed · SI-scaled · converted · glb2glb · R2 GLB
// Author FBX is fallback only. Anim clips: baked Bip001 JSON.
// KILL: grudge-arena …/cdn/assets/characters/* as character host (wrong scale / stale).
// Truth: D1 + grudgeUuid + production labels (see fleetTruth.js / FLEET_ASSET_TRUTH.md)
const R2 = FLEET_TRUTH_HOSTS.cdn;
const ARENA = 'https://grudge-arena.grudge-studio.com';
const OPEN = FLEET_TRUTH_HOSTS.open;
const D1_API = FLEET_TRUTH_HOSTS.d1;
const OBJECTSTORE_MODELS = FLEET_TRUTH_HOSTS.objectStoreModels;
const PAGE_SIZE = 48;
const D1_PAGE = 200;
const D1_MAX_PAGES = 50; // up to 10k assets
/** Pause RAF when viewer closed (save GPU). */
let viewerLoopActive = false;
let viewerRaf = 0;

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

/**
 * Pipeline raceId → fleet grudge6-kit race id (RACE_ASSETS keys).
 * Atlas SSOT: https://assets.grudge-studio.com/assets/{folder}/textures/{file}
 * @see assets.grudge-studio.com/js/grudge6-kit.js
 */
const PIPELINE_TO_FLEET_RACE = {
  'western-kingdoms': 'human',
  barbarians: 'barbarian',
  'high-elves': 'elf',
  dwarves: 'dwarf',
  orcs: 'orc',
  undead: 'undead',
};

function fleetRaceId(pipelineRaceId) {
  return PIPELINE_TO_FLEET_RACE[pipelineRaceId] || 'human';
}

/** UI + deep-link helpers — paths come from fleet RACE_ASSETS only */
const RACE_KITS = Object.fromEntries(
  Object.entries(PIPELINE_TO_FLEET_RACE).map(([pipeId, fleetId]) => {
    const a = RACE_ASSETS[fleetId];
    return [
      pipeId,
      {
        label:
          pipeId === 'western-kingdoms'
            ? 'WK human'
            : pipeId === 'barbarians'
              ? 'Barbarian'
              : pipeId === 'high-elves'
                ? 'Elf'
                : pipeId === 'dwarves'
                  ? 'Dwarf'
                  : pipeId === 'orcs'
                    ? 'Orc'
                    : 'Undead',
        prefix: a.prefix,
        fleetId,
        fbx: a.fbx,
        glb: a.glb,
        // ONLY production inventory key = GLB race kit
        r2: a.glb,
        // CANONICAL atlas: textures/grudge6/{folder}/* (stone SSOT)
        atlas: fleetAtlasUrl(fleetId),
      },
    ];
  }),
);

/**
 * Baked Bip001 packs (JSON) — play on character kit.
 * Gap sources (Mixamo FBX <1000KB, armature/no mesh): D:/Games/Models/_anim_packs
 * Staged fill: _anim_packs/_gap_fill_stage · api/anim-gap-fill.json
 */
const BAKED_PACKS = [
  // magic
  { id: 'magic/standing idle', name: 'Magic Idle', pack: 'magic' },
  { id: 'magic/Standing Walk Forward', name: 'Standing Walk Forward', pack: 'magic' },
  { id: 'magic/Standing Run Forward', name: 'Standing Run Forward', pack: 'magic' },
  { id: 'magic/staffattack', name: 'Staff Attack', pack: 'magic' },
  // sword_shield (live CDN + local gap stage for walk/death/strafe)
  { id: 'sword_shield/sword and shield idle', name: 'Sword Shield Idle', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield run', name: 'Sword Shield Run', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield attack', name: 'Sword Shield Attack', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield attack (2)', name: 'Sword Shield Attack 2', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield block', name: 'Sword Shield Block', pack: 'sword_shield' },
  { id: 'sword_shield/sword and shield slash', name: 'Sword Shield Slash', pack: 'sword_shield' },
  // longbow
  { id: 'longbow/idle', name: 'Longbow Idle', pack: 'longbow' },
  { id: 'longbow/draw', name: 'Longbow Draw', pack: 'longbow' },
  { id: 'longbow/standing idle 01', name: 'Longbow Idle 01', pack: 'longbow' },
  { id: 'longbow/standing walk forward', name: 'Longbow Walk', pack: 'longbow' },
  { id: 'longbow/standing run forward', name: 'Longbow Run', pack: 'longbow' },
  { id: 'longbow/standing aim recoil', name: 'Longbow Aim Recoil', pack: 'longbow' },
  // rifle / pistol (gun family)
  { id: 'rifle/idle', name: 'Rifle Idle', pack: 'rifle' },
  { id: 'rifle/run forward', name: 'Rifle Run', pack: 'rifle' },
  { id: 'pistol/pistol idle', name: 'Pistol Idle', pack: 'pistol' },
  // 2H / polearm / hammer (CDN + greatsword local stage → 2h_melee)
  { id: 'greatsword_samurai/gs_samurai_idle', name: 'Samurai Idle', pack: 'greatsword_samurai' },
  { id: 'greatsword_samurai/gs_samurai_combo_a', name: 'Samurai Combo A', pack: 'greatsword_samurai' },
  { id: 'polearm/attack', name: 'Polearm Attack', pack: 'polearm' },
  { id: 'twohand_hammer/idle', name: 'Hammer Idle (scarecrow)', pack: 'twohand_hammer' },
  // unarmed + loco
  { id: 'unarmed/fight_idle', name: 'Unarmed Idle', pack: 'unarmed' },
  { id: 'uploads_2026_06/locomotion/torch run forward', name: 'Torch Run Forward', pack: 'locomotion' },
  { id: 'locomotion/jump', name: 'Jump', pack: 'locomotion' },
  { id: 'locomotion/dodging', name: 'Dodging', pack: 'locomotion' },
];

/** Preferred first clip per pack when auto-playing on grudge6 host. */
const PACK_IDLE_RELS = {
  sword_shield: [
    'sword_shield/sword and shield idle',
    'sword_shield/sword and shield run',
  ],
  longbow: ['longbow/idle', 'longbow/draw', 'longbow/standing idle 01'],
  magic: ['magic/standing idle', 'magic/staffattack'],
  rifle: ['rifle/idle', 'rifle/run forward'],
  pistol: ['pistol/pistol idle'],
  unarmed: ['unarmed/fight_idle'],
  greatsword_samurai: [
    'greatsword_samurai/gs_samurai_idle',
    'greatsword_samurai/gs_samurai_combo_a',
  ],
  '2h_melee': [
    'greatsword_samurai/gs_samurai_idle',
    'twohand_hammer/idle',
    'sword_shield/sword and shield idle',
  ],
  twohand_hammer: ['twohand_hammer/idle'],
  polearm: ['polearm/attack'],
  cavalry: ['longbow/idle'],
  farming: ['farming/holding idle', 'farming/watering'],
  traversal: ['traversal/Climbing', 'traversal/Swimming (1)'],
};

// ── State ──────────────────────────────────────────────
/** Visible inventory — DEFAULT game-ready only (never raw dumps). */
let allModels = [];
/** Full post-dedupe catalog (ready + raw) for opt-in author dumps. */
let catalogAll = [];
let catalogReady = [];
let catalogRaw = [];
let filtered = [];
let page = 0;
let activeKind = null;
let activeGroup = null;
/**
 * Format filter: null = game-ready formats (GLB + baked JSON).
 * Do NOT default to 'glb' alone — that hides Bip001 baked clips.
 * @type {string|null}
 */
let activeFormat = null;
let activeSource = null;
/** @type {string|null} Game product filter (warlords, open, mine-loader, …) */
let activeGameUse = null;
let activeUuid = null;
let sortKey = 'production';
/**
 * Deploy bake filter — DEFAULT **ready**: only textured / labeled / SI / converted.
 * raw = opt-in author FBX / untextured dumps (not served by default).
 * @type {string|null} null | 'ready' | 'raw'  (null treated as ready)
 */
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
  let path = normalizeR2Key(raw.path || raw.r2Key || raw.sourcePath || '');
  // Mark legacy grudge6 character keys so catalog kind/filter works
  const isLegacyRace =
    /models\/grudge6\/(wk|brb|ud|orc|elf|dwf)\/[A-Za-z0-9_]*Characters\.(glb|fbx)$/i.test(path) ||
    /models\/grudge6\/races\/[A-Za-z0-9_]*Characters\.(glb|fbx)$/i.test(path);
  const format = String(raw.format || path.split('.').pop() || 'glb').toLowerCase().replace(/^\./, '');
  const sizeKB =
    raw.sizeKB ??
    (raw.fileSize ? Math.round(raw.fileSize / 1024) : 0);
  // Prefer fleet SSOT CDN URL for race kits (legacy D1 path still stored as r2Key)
  let cdnUrl =
    raw.cdnUrl ||
    raw._cdnUrl ||
    raw._gameReadyUrl ||
    (path ? `${R2}/${path}` : null);
  if (isLegacyRace) {
    try {
      const canon = resolveCanonicalAssetUrl(path);
      if (canon) cdnUrl = canon;
    } catch {
      /* keep */
    }
  }
  const grudgeUuid = raw.grudgeUuid || raw.uuid || null;
  const m = {
    id: path || grudgeUuid || raw.id || `${source}:${raw.name}`,
    name: raw.name || path.split('/').pop() || 'asset',
    path,
    r2Key: path,
    format,
    category: isLegacyRace ? 'character' : raw.category || 'uncategorized',
    group: isLegacyRace ? 'grudge6/races' : raw.group || raw.category || 'uncategorized',
    sizeKB,
    fileSize: raw.fileSize ?? (sizeKB ? sizeKB * 1024 : null),
    // D1 never stores mesh counts — multipacks are not "0 mesh"
    meshes: raw.meshes ?? (isLegacyRace ? 12 : null),
    sourceSet: raw.sourceSet || (isLegacyRace ? 'grudge6' : undefined),
    animations: raw.animations ?? null,
    textures: raw.textures ?? null,
    textureStatus: raw.textureStatus || null,
    materials: raw.materials ?? null,
    compressionType: raw.compressionType || null,
    source,
    sources: [source],
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
    subtype: raw.subtype || null,
    grudgeUuid: grudgeUuid && isValidUuid(grudgeUuid) ? grudgeUuid : grudgeUuid,
    uuidStatus: grudgeUuid && isValidUuid(grudgeUuid) ? 'pending' : grudgeUuid ? 'invalid' : 'pending',
    uuidMessage: '',
    thumbKey: grudgeUuid || path || raw.id || null,
    d1Indexed: source === 'd1' || !!raw.d1Indexed,
    labels: raw.labels || [],
    gameUses: raw.gameUses || [],
  };
  m.kind = inferKind(m);
  m.group = inferGroup(m);
  return enrichFleetTruth(m);
}

function curatedGrudge6() {
  const out = [];
  // ONLY system: 6 production race GLBs + stone atlases (no multipacks, no FBX inventory)
  for (const [id, kit] of Object.entries(RACE_KITS)) {
    const glbPath = String(kit.glb || '')
      .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '')
      .replace(/^\//, '');
    if (!glbPath || !isGrudge6SsotKitPath(glbPath)) continue;
    out.push(
      normalizeEntry(
        {
          id: `grudge6-race-${id}`,
          name: `${kit.label} — Characters (ONLY SSOT)`,
          path: glbPath,
          format: 'glb',
          category: 'grudge6-races',
          group: 'grudge6/races',
          kind: 'character',
          // Production load = GLB + textures/grudge6 atlas (not FBX multipack host)
          cdnUrl: kit.glb,
          altUrls: [kit.glb, kit.atlas].filter(Boolean),
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
          atlasUrl: kit.atlas,
          onlySsot: true,
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
  // First page discovers total; then fetch remaining pages (cap D1_MAX_PAGES)
  let total = D1_PAGE;
  try {
    const head = await fetch(`${D1_API}?limit=1&offset=0`, {
      signal: AbortSignal.timeout(10000),
    });
    if (head.ok) {
      const hj = await head.json();
      total = Number(hj.total) || total;
    }
  } catch {
    /* use default offsets */
  }
  const offsets = d1Offsets(total, D1_PAGE, D1_MAX_PAGES);
  const seen = new Set();
  const out = [];
  // Batch in waves of 8 to avoid browser connection storms
  for (let i = 0; i < offsets.length; i += 8) {
    const wave = offsets.slice(i, i + 8);
    await Promise.all(
      wave.map(async (offset) => {
        try {
          const r = await fetch(`${D1_API}?limit=${D1_PAGE}&offset=${offset}`, {
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) return;
          const j = await r.json();
          for (const a of j.assets || []) {
            const key = normalizeR2Key(a.r2Key || a.id);
            if (!key || seen.has(key)) continue;
            const fmt = String(a.format || key.split('.').pop() || '').toLowerCase();
            const mime = String(a.mimeType || '');
            if (mime.startsWith('audio/') || fmt === 'wav' || fmt === 'mp3' || fmt === 'ogg') continue;
            if (mime.startsWith('image/') && !key.includes('texture')) {
              if (!/\.(glb|gltf|fbx)$/i.test(key)) continue;
            }
            // Index model-like + known game packs only
            if (
              !/\.(glb|gltf|fbx|json)$/i.test(key) &&
              !key.includes('anims/baked') &&
              !key.startsWith('models/')
            ) {
              continue;
            }
            // Pass-2: never index raw/tmp/wip/meshy/placeholder into the browser catalog
            if (isRawKillPath({ path: key, name: a.name || '', cdnUrl: a.cdnUrl || '' })) {
              continue;
            }
            // HARD ONLY-SSOT: drop every non-stone grudge6 path (multipacks, anim dumps,
            // legacy folders, FBX kits, library fragments). Kits come from curatedGrudge6 only.
            if (isTrashGrudge6Path(key) || isGrudge6RelatedPath(key)) continue;
            // HARD: drop raw Mixamo/Kaykit anim dumps — only anims/baked JSON is inventory
            if (/models\/animations\//i.test(key)) continue;
            if (/kaykit\/rig_/i.test(key)) continue;
            // Pass-2: skip multipack fragment pseudo-keys and non-mesh sidecar rows
            if (/#mesh:/i.test(key)) continue;
            if (/\.(png|jpg|jpeg|webp|tga|mtl|bin)$/i.test(key)) continue;
            // Pass-2: skip author FBX at D1 ingest — only GLB/json enter the index
            // (FBX remains on R2 for convert pipeline; not served as game inventory)
            if (fmt === 'fbx' || fmt === 'obj' || fmt === 'dae') continue;
            if (fmt === 'gltf') continue; // prefer production GLB only

            seen.add(key);
            const entry = normalizeEntry(
              {
                ...a,
                path: key,
                r2Key: key,
                grudgeUuid: a.grudgeUuid || a.uuid,
                fileSize: a.fileSize,
                d1Indexed: true,
              },
              'd1',
            );
            out.push(entry);
          }
        } catch {
          /* skip page */
        }
      }),
    );
  }
  return out;
}

async function fetchObjectStoreModels() {
  // Prefer production ObjectStore host, then GitHub Pages mirror
  const urls = [
    'https://objectstore.grudge-studio.com/api/v1/models3d.json',
    OBJECTSTORE_MODELS,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json();
      const models = j.models || j.assets || [];
      if (!models.length) continue;
      return models.map((m) =>
        normalizeEntry(
          {
            ...m,
            path: m.path || m.r2Key || m.sourcePath,
            grudgeUuid: m.grudgeUuid || m.uuid,
          },
          'objectstore',
        ),
      );
    } catch {
      /* try next host */
    }
  }
  return [];
}

async function loadCatalog() {
  const status = document.getElementById('r2Status');
  if (status) {
    status.className = 'r2-status checking';
    status.innerHTML = `<span class="r2-dot"></span> Loading D1 + production truth…`;
  }
  const [d1, os, production, curated] = await Promise.all([
    fetchD1Catalog(),
    fetchObjectStoreModels(),
    fetchProductionCatalog().then((rows) => rows.map((r) => normalizeEntry(r, 'production'))),
    // curatedGrudge6 includes race kits + BAKED_PACKS anim clips
    Promise.resolve(curatedGrudge6()),
  ]);

  d1Index = { byUuid: new Map(), byPath: new Map() };
  for (const m of d1) {
    if (m.grudgeUuid) d1Index.byUuid.set(String(m.grudgeUuid).toLowerCase(), m);
    if (m.path) d1Index.byPath.set(m.path.replace(/\\/g, '/').toLowerCase(), m);
  }

  // Merge: curated base → ObjectStore → production → D1
  // HARD ONLY-SSOT: only curated grudge6-ssot (+ baked-bip001) may carry grudge6 character keys.
  // All other grudge6-related rows from D1/ObjectStore/production are purged from the browser.
  const map = new Map();
  let trashDropped = 0;
  const allowedSsot = new Set(grudge6SsotKitKeys().map((k) => k.toLowerCase()));
  for (const m of [...curated, ...os, ...production, ...d1]) {
    const k = normalizeR2Key(m.path || m.r2Key || m.id);
    if (!k) continue;
    const cdn = m.cdnUrl || '';
    const g6rel =
      isGrudge6RelatedPath(k) ||
      isGrudge6RelatedPath(cdn) ||
      isTrashGrudge6Path(k) ||
      isTrashGrudge6Path(cdn);
    if (g6rel) {
      // Keep only curated SSOT kit rows and baked anim JSON
      const isSsotKit =
        m.source === 'grudge6-ssot' ||
        isGrudge6SsotKitPath(k) ||
        allowedSsot.has(k.toLowerCase());
      const isBaked = m.source === 'baked-bip001' || m.isBakedClip || /^anims\/baked\//i.test(k);
      if (!isSsotKit && !isBaked) {
        trashDropped++;
        continue;
      }
      // Non-curated duplicate of SSOT kit key → drop (curated wins earlier in merge order)
      if (isSsotKit && m.source !== 'grudge6-ssot' && m.source !== 'baked-bip001') {
        trashDropped++;
        continue;
      }
    }
    if (!map.has(k)) map.set(k, m);
    else map.set(k, mergeTruthEntries(map.get(k), m));
  }
  let merged = [...map.values()].map((m) => enrichFleetTruth(m));

  // Purge path/uuid/basename duplicates — keep highest productionScore only
  const purged = purgeCatalogDuplicates(merged);
  catalogAll = purged.models;
  catalogReady = catalogAll.filter((m) => isProductionDeployReady(m));
  catalogRaw = catalogAll.filter((m) => !isProductionDeployReady(m));
  // HARD: serve game-ready inventory only by default (raw is opt-in chip)
  allModels = catalogReady;
  activeProd = 'ready';
  activeFormat = null; // GLB + baked JSON clips
  console.info(
    `[catalog] ONLY grudge6 SSOT kits=${[...map.keys()].filter((k) => isGrudge6SsotKitPath(k)).length}/6 · ` +
      `game-ready ${catalogReady.length} · raw hidden ${catalogRaw.length} · −${purged.removed} dupes · −${trashDropped} purged non-SSOT grudge6`,
  );
  window.__g6OnlySsot = {
    kits: grudge6SsotKitKeys(),
    purgedNonSsot: trashDropped,
  };

  void prefillDerivedUuids()
    .then(async () => {
      // Re-enrich after UUIDs land (prefer full catalog for uuid map, UI stays ready)
      catalogAll.forEach((m) => enrichFleetTruth(m));
      catalogReady = catalogAll.filter((m) => isProductionDeployReady(m));
      catalogRaw = catalogAll.filter((m) => !isProductionDeployReady(m));
      allModels = activeProd === 'raw' ? catalogRaw : catalogReady;
      updateUuidStat();
      applyFilters();
      // Background D1/hash verify on game-ready set (does not block first paint)
      try {
        await verifyAll(catalogReady, d1Index, (i, n) => {
          if (i % 200 === 0 || i === n) {
            const st = document.getElementById('actionStatus');
            if (st) st.textContent = `UUID verify ${i}/${n}`;
          }
        });
        uuidVerified = true;
        catalogAll.forEach((m) => {
          if (m.grudgeUuid) {
            m.searchBlob = `${m.searchBlob} ${m.grudgeUuid} ${m.uuidStatus || ''}`.toLowerCase();
          }
          enrichFleetTruth(m);
        });
        catalogReady = catalogAll.filter((m) => isProductionDeployReady(m));
        catalogRaw = catalogAll.filter((m) => !isProductionDeployReady(m));
        allModels = activeProd === 'raw' ? catalogRaw : catalogReady;
        updateUuidStat();
        renderFilters();
        const st = document.getElementById('actionStatus');
        if (st) st.textContent = 'UUID verify complete';
      } catch (e) {
        console.warn('[uuid] background verify', e);
      }
    })
    .catch((e) => console.warn('[uuid] prefill', e));

  const summary = truthSummary(catalogAll);
  const readyN = catalogReady.length;
  const sources = new Set(catalogReady.flatMap((m) => m.sources || [m.source]));
  if (status) {
    status.className = 'r2-status online';
    status.innerHTML = `<span class="r2-dot"></span> ${readyN} game-ready (≥${PROD_READY_SCORE}) · ${summary.total} indexed · −${purged.removed} dupes · ${catalogRaw.length} raw hidden · D1 ${summary.d1} · UUID ${summary.uuidPct}%`;
    status.title =
      `Serving game-ready only (score ≥ ${PROD_READY_SCORE} · textured · labeled · SI · converted). ` +
      `Indexed ${summary.total}, ready ${readyN}, raw hidden ${catalogRaw.length}, purged ${purged.removed} dups. ` +
      Object.entries(summary.bySource)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
  }
  document.getElementById('sourceCount').textContent = String(sources.size);
  const d1El = document.getElementById('d1Count');
  if (d1El) d1El.textContent = String(summary.d1);
  const truthEl = document.getElementById('truthCount');
  if (truthEl) truthEl.textContent = `${summary.uuidPct}%`;
  updateThumbStat();
  renderGameUseFilters();
}

/** Switch inventory between game-ready and opt-in raw author dumps. */
function setProdInventory(mode) {
  const next = mode === 'raw' ? 'raw' : 'ready';
  activeProd = next;
  allModels = next === 'raw' ? catalogRaw : catalogReady;
  // Ready inventory shows GLB + baked JSON; raw often FBX — clear format pin
  if (next === 'ready') activeFormat = null;
  page = 0;
  applyFilters();
}

async function prefillDerivedUuids() {
  let n = 0;
  for (const m of allModels) {
    if (m.grudgeUuid && isValidUuid(m.grudgeUuid)) continue;
    if (!m.path || m.isBakedClip || m.format === 'json') continue;
    try {
      const u = await grudgeUuidFromR2Key(m.path);
      if (u) {
        if (!m.grudgeUuid) {
          m.grudgeUuid = u;
          m.uuidStatus = 'derived';
          m.uuidMessage = 'Derived from grudge-asset:r2Key';
        }
        m.uuidExpected = u;
        if (!m.thumbKey) m.thumbKey = u;
        if (m.path) d1Index.byPath.set(m.path.toLowerCase(), m);
        d1Index.byUuid.set(u.toLowerCase(), m);
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
  // Inventory is already split (ready vs raw); still re-gate ready for safety
  filtered = allModels.filter((m) => {
    if (activeKind && m.kind !== activeKind) return false;
    if (activeGroup && m.group !== activeGroup) return false;
    if (activeFormat && m.format !== activeFormat) return false;
    if (activeSource && m.source !== activeSource && !(m.sources || []).includes(activeSource))
      return false;
    if (activeGameUse && !(m.gameUses || []).includes(activeGameUse)) return false;
    if (activeUuid && (m.uuidStatus || 'pending') !== activeUuid) return false;
    if (activeProd !== 'raw' && !isProductionDeployReady(m)) return false;
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
    [activeKind, activeGroup, activeFormat, activeSource, activeGameUse, activeUuid, activeProd]
      .filter(Boolean)
      .join(' · ') || 'All assets';
  updateUuidStat();
}

/** Game-use product chips (warlords / open / mine-loader / …). */
function renderGameUseFilters() {
  const el = document.getElementById('gameUseFilters');
  if (!el) return;
  const counts = new Map();
  for (const m of allModels) {
    for (const g of m.gameUses || []) counts.set(g, (counts.get(g) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  chipRow(el, entries, activeGameUse, (v) => {
    activeGameUse = v;
    page = 0;
    applyFilters();
  });
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
  const prodReady = catalogReady.length || allModels.filter((m) => isProductionDeployReady(m)).length;
  const prodRaw = catalogRaw.length;
  chipRow(
    document.getElementById('prodFilters'),
    [
      ['ready', prodReady],
      ['raw', prodRaw],
    ],
    activeProd === 'raw' ? 'raw' : 'ready',
    (v) => {
      // null/"All" still means game-ready — never expand to raw by accident
      setProdInventory(v === 'raw' ? 'raw' : 'ready');
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

// ── Materials ──
// grudge6 race kits: ONLY fleet bindRaceAtlas / loadRaceTexture (grudge6-kit.js).
// Non-race props still use materials.js prepAndRebindMaterials.

/**
 * Bind canonical race atlas — same as Unity/toon RTS / assets grudge6-kit.
 * @param {THREE.Object3D} root
 * @param {string} pipelineRaceId  e.g. barbarians
 */
async function tryBindAtlas(root, pipelineRaceId) {
  const fid = fleetRaceId(pipelineRaceId);
  const url = fleetAtlasUrl(fid);
  if (!url) return false;
  const tex = await loadRaceTexture(THREE, fid);
  if (!tex) {
    console.warn('[grudge6] fleet atlas failed', fid, url);
    return false;
  }
  const n = bindRaceAtlas(THREE, root, tex);
  root.userData.atlasUrl = url;
  root.userData.fleetRaceId = fid;
  root.userData.forceAtlasRebound = n > 0;
  console.info('[grudge6] fleet atlas', fid, url, 'mats', n);
  return n > 0;
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
  // UNIQUE names only — Toon multipacks leave 3× Bip001 copies in the graph
  // (naive count looks like "192 bones"). grudge6 = Bip001 ~40–80 unique, not Mixamo 25.
  const names = new Set();
  root.traverse((o) => {
    if (o.isBone && o.name) names.add(o.name);
  });
  return [...names];
}

/** Bip001 / Mixamo truth for deploy panel */
function boneTruthLabel(root) {
  let bip = 0;
  let mix = 0;
  let objects = 0;
  const bipNames = new Set();
  const mixNames = new Set();
  root?.traverse((o) => {
    if (!o.isBone || !o.name) return;
    objects++;
    if (/bip001/i.test(o.name)) bipNames.add(o.name);
    else if (/mixamorig/i.test(o.name)) mixNames.add(o.name);
  });
  bip = bipNames.size;
  mix = mixNames.size;
  if (mix > bip) return `Mixamo ${mix} unique (WRONG — need Bip001 races/*)`;
  return `Bip001 ${bip} unique` + (objects > bip + 5 ? ` (${objects} scene objs)` : '');
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
    const raceForSi =
      root.userData.grudgeRaceId ||
      document.getElementById('previewRace')?.value ||
      'western-kingdoms';
    const d = deployCharacterModel(root, {
      facePlusZ: face,
      importPipeline: root.userData.importPipeline,
      forceRefit: true, // anim/mesh host: never trust sticky wrong scale
      raceId: raceForSi,
      targetHeightM: raceHeightM(raceForSi),
    });
    // SI vs race height truth (orc=2.0, human=1.8) — unit snap only, no force-1.8
    const si = enforceCharacterSi(root, raceForSi);
    const look = diagnoseCharacterLook(root, { raceId: raceForSi });
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
  // grudge6 multipacks default to sword_shield until loadout/pack button sets it
  let pack = entry
    ? animPackHint(entry) ||
      (entry.kind === 'animation' || entry.isBakedClip ? '—' : null)
    : '—';
  if (!pack && entry && (entry.kind === 'character' || entry.source === 'grudge6-ssot')) {
    pack = 'sword_shield';
  }
  if (!pack) pack = entry?.kind === 'animation' ? '—' : 'n/a';
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
      // Actually fetch + play baked Bip001 clips (was a no-op label-only before)
      void loadAnimPackOntoCurrent(id).catch((e) => {
        console.error(e);
        flashUse(`Anim pack failed: ${e.message || id}`);
      });
      flashUse(`Loading ${pack?.label || id}…`);
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

  // Bone list: unique Bip001 names first (never dump 192 duplicate objects)
  if (bl) {
    const names = info.bones || [];
    const bip = names.filter((n) => /bip001/i.test(n));
    const mix = names.filter((n) => /mixamorig/i.test(n));
    const head =
      mix.length > bip.length
        ? `WRONG Mixamo ${mix.length} unique — need Bip001 races/*\n`
        : `Bip001 ${bip.length} unique` +
          (mix.length ? ` · Mixamo ${mix.length}` : '') +
          `\n(grudge6 kit = Bip001; Mixamo ~25 is for clips only)\n\n`;
    bl.textContent = head + (bip.length ? bip : names).slice(0, 80).join('\n');
  }

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
  if (wrap.querySelector('canvas')) {
    viewerLoopActive = true;
    startViewerLoop();
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1018);
  camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / Math.max(1, wrap.clientHeight), 0.05, 200);
  camera.position.set(1.6, 1.4, 2.8);
  // Production renderer: sRGB + ACES, DPR ≤ 1.5, no stencil (threejs-production-best-practices)
  renderer = createViewerRenderer(wrap);
  wrap.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.9, 0);
  // Cool neutral lighting — avoid warm yellow key that tints untextured meshes
  // ≤ 3 direct lights (skill: few direct lights)
  scene.add(new THREE.AmbientLight(0xd0d8e8, 0.45));
  const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x2a3038, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(3.5, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ec8ff, 0.45);
  fill.position.set(-4, 2, -2);
  scene.add(fill);
  gridHelper = new THREE.GridHelper(8, 16, 0x2a3550, 0x1a2233);
  scene.add(gridHelper);
  // Axes: X red, Y green, Z blue (Three.js Y-up)
  const axes = new THREE.AxesHelper(1.2);
  axes.position.y = 0.01;
  scene.add(axes);
  clock = new THREE.Clock();
  viewerLoopActive = true;
  startViewerLoop();
  new ResizeObserver(() => {
    if (!wrap.clientWidth || !renderer) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO));
  }).observe(wrap);
}

function startViewerLoop() {
  if (viewerRaf) return;
  const loop = () => {
    if (!viewerLoopActive) {
      viewerRaf = 0;
      return;
    }
    viewerRaf = requestAnimationFrame(loop);
    const dt = clock ? clock.getDelta() : 0;
    if (mixer) mixer.update(dt);
    controls?.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  };
  viewerRaf = requestAnimationFrame(loop);
}

function stopViewerLoop() {
  viewerLoopActive = false;
  if (viewerRaf) {
    cancelAnimationFrame(viewerRaf);
    viewerRaf = 0;
  }
}

function clearSceneModel() {
  if (currentRoot) {
    scene.remove(currentRoot);
    disposeObject3D(currentRoot);
    currentRoot = null;
  }
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  window._currentAnimations = [];
}

async function loadGltfOrFbx(url) {
  return loadGltfOrFbxShared(url);
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
        // Magic-byte / range probe — reject HTML fake-200 (warlords-assets rule)
        if (await isLikelyBinaryAsset(url)) return url;
      }
    } catch {
      /* try GET fallback with magic-byte */
      try {
        if (await isLikelyBinaryAsset(url)) return url;
      } catch {
        /* next */
      }
    }
  }
  // Never fall back to a forbidden host
  const safe = ordered.find((u) => !isForbiddenCharacterHost(u));
  return safe || null;
}

/**
 * Load grudge6 race kit — ONLY production GLB + textures/grudge6 atlas.
 * Do NOT run prepMaterials after atlas bind (destroys maps → orange sludge).
 * No multipack hosts, no arena CDN characters.
 */
async function loadCharacterKit(raceId) {
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  const fid = fleetRaceId(raceId);
  const race = RACE_ASSETS[fid];
  if (!race) throw new Error(`Unknown fleet race ${fid}`);

  // Always rebuild template if atlas missing (no sticky broken cache)
  if (characterTemplateCache.has(raceId)) {
    const cached = characterTemplateCache.get(raceId);
    if (cached.userData.forceAtlasRebound === true && cached.userData.atlasUrl) {
      const c = clone(cached);
      c.userData.grudgeRaceId = raceId;
      c.userData.grudgeRaceHeightM = raceHeightM(raceId);
      c.userData.grudge6SsotHost = true;
      c.userData.fleetRaceId = fid;
      c.userData.importPipeline = 'production-glb';
      c.userData.artForwardSet = false;
      c.userData.grudgeHeightFit = false;
      c.userData.atlasUrl = cached.userData.atlasUrl;
      c.userData.forceAtlasRebound = true;
      return c;
    }
    characterTemplateCache.delete(raceId);
  }

  // 1) Production GLB ONLY (stone SSOT) — FBX is convert author only
  const glbUrl = resolveCanonicalAssetUrl(fleetKitUrl(fid, 'glb'));
  if (isForbiddenCharacterHost(glbUrl) || !isGrudge6SsotKitPath(glbUrl)) {
    throw new Error(`Blocked / non-SSOT character host: ${glbUrl}`);
  }
  let root;
  let loadedUrl = glbUrl;
  try {
    const gltf = await getGltfLoader().loadAsync(glbUrl);
    root = gltf.scene || gltf;
  } catch (e) {
    console.warn('[grudge6] GLB failed, last-resort FBX author kit', glbUrl, e?.message || e);
    const fbxUrl = resolveCanonicalAssetUrl(fleetKitUrl(fid, 'fbx'));
    const fbxLoader = new FBXLoader();
    root = await fbxLoader.loadAsync(fbxUrl);
    loadedUrl = fbxUrl;
  }

  root.userData.importPipeline = /\.fbx($|\?)/i.test(loadedUrl) ? 'fbx-atlas' : 'production-glb';
  root.userData.sourceUrl = loadedUrl;
  root.userData.grudge6SsotHost = true;
  root.userData.onlySsot = true;
  root.userData.fleetRaceId = fid;
  root.userData.grudgeHeightFit = false;
  root.userData.artForwardSet = false;
  prepareLoadedRoot(root);

  // Unify multi-skeleton kits
  const canon = new Map();
  root.traverse((o) => {
    if (o.isBone && o.name && !canon.has(o.name)) canon.set(o.name, o);
  });
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      const bones = o.skeleton.bones.map((b) => canon.get(b.name) || b);
      o.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix);
      o.frustumCulled = false;
    }
  });

  // 2) Stone atlas — textures/grudge6/{folder}/*
  const atlasOk = await tryBindAtlas(root, raceId);
  if (!atlasOk) {
    throw new Error(
      `Fleet atlas bind failed for ${fid}. Expected ${fleetAtlasUrl(fid)}. ` +
        `SSOT is textures/grudge6/{race-folder}/*.webp on assets CDN.`,
    );
  }

  // 3) Default equip via fleet EquipmentManager (hide soup, body+sword)
  const equip = new EquipmentManager(race.prefix);
  const slotSummary = equip.catalog(root);
  equip.applyDefaultLoadout();
  const visibleN = equip.allMeshes.filter((m) => m.visible).length;
  root.userData.grudge6Equip = equip;
  root.userData.equipSlots = slotSummary;
  root.userData.equipVisible = visibleN;
  if (!visibleN) {
    console.warn('[grudge6] equip left 0 visible — unhid skinned meshes', fid, slotSummary);
  }

  root.userData.grudgeRaceId = raceId;
  root.userData.grudgeRaceHeightM = raceHeightM(raceId);
  characterTemplateCache.set(raceId, root);

  const c = clone(root);
  c.userData.grudgeRaceId = raceId;
  c.userData.grudgeRaceHeightM = raceHeightM(raceId);
  c.userData.grudge6SsotHost = true;
  c.userData.fleetRaceId = fid;
  c.userData.importPipeline = root.userData.importPipeline;
  c.userData.sourceUrl = root.userData.sourceUrl;
  c.userData.atlasUrl = root.userData.atlasUrl;
  c.userData.forceAtlasRebound = true;
  c.userData.artForwardSet = false;
  c.userData.grudgeHeightFit = false;
  // Fresh equip manager on clone (mesh refs differ)
  const equip2 = new EquipmentManager(race.prefix);
  equip2.catalog(c);
  equip2.applyDefaultLoadout();
  c.userData.grudge6Equip = equip2;
  c.userData.equipVisible = equip2.allMeshes.filter((m) => m.visible).length;
  return c;
}

/**
 * Encode anims/baked pack/clip path (spaces in clip names).
 * encodeURI alone breaks folder/file splits — encode each segment.
 */
function bakedClipUrl(host, rel) {
  const clean = String(rel || '')
    .replace(/^\/+/, '')
    .replace(/\.json$/i, '');
  const parts = clean.split('/').map((s) => encodeURIComponent(s));
  return `${host}/anims/baked/${parts.join('/')}.json`;
}

/**
 * Fetch one baked Bip001 JSON clip. Quaternion-only + rematch onto grudge6 kit.
 * Hosts: open → assets → arena (prefer open — assets often missing packs).
 * @returns {Promise<THREE.AnimationClip|null>}
 */
async function fetchBakedClip(rel, model) {
  if (!rel) return null;
  // Refuse raw Mixamo dump paths
  if (/models\/animations\//i.test(rel)) {
    console.warn('[anim] refuse raw models/animations path', rel);
    return null;
  }
  const urls = [
    bakedClipUrl(OPEN, rel),
    bakedClipUrl(R2, rel),
    bakedClipUrl(ARENA, rel),
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('text/html')) continue;
      const json = await r.json();
      // Accept AnimationClip JSON or { name, duration, tracks }
      let clip;
      if (json.tracks || json.type === 'AnimationClip') {
        clip = THREE.AnimationClip.parse(json);
      } else if (Array.isArray(json)) {
        continue;
      } else {
        clip = THREE.AnimationClip.parse(json);
      }
      // Rotation-only Bip001 contract
      const qTracks = (clip.tracks || []).filter(
        (t) =>
          /\.quaternion$/.test(t.name) ||
          /\.rotation$/.test(t.name) ||
          /quaternion/i.test(t.name),
      );
      if (!qTracks.length) {
        console.warn('[anim] no quaternion tracks', rel, url);
        continue;
      }
      clip = new THREE.AnimationClip(
        clip.name || rel.split('/').pop() || 'clip',
        clip.duration,
        qTracks,
        clip.blendMode,
      );
      if (model) clip = rematchClip(model, clip);
      clip = stripPositionTracks(clip);
      // Drop mixamorig tracks that failed rematch (still on wrong skeleton)
      if (clip.tracks?.some((t) => /mixamorig/i.test(t.name))) {
        clip = new THREE.AnimationClip(
          clip.name,
          clip.duration,
          clip.tracks.filter((t) => !/mixamorig/i.test(t.name)),
          clip.blendMode,
        );
      }
      if (!clip.tracks?.length) continue;
      return clip;
    } catch (e) {
      console.warn('[anim] fetch fail', url, e?.message || e);
    }
  }
  return null;
}

/** Load known baked clips for a pack id (for dropdown + auto-idle). */
async function fetchPackClips(packId, model) {
  const fromCatalog = BAKED_PACKS.filter((c) => c.pack === packId).map((c) => c.id);
  const fromIdle = PACK_IDLE_RELS[packId] || [];
  const rels = [...new Set([...fromIdle, ...fromCatalog])];
  const clips = [];
  for (const rel of rels) {
    const clip = await fetchBakedClip(rel, model);
    if (clip) clips.push(clip);
  }
  return clips;
}

/**
 * HARD multipack presentation (BRB/WK screenshot fix):
 * 1) hide EVERY equippable mesh (kills floating weapon soup / logs / axes)
 * 2) warrior mesh_ids only: body+legs+arms+head + ONE weapon + optional shield
 * 3) re-ground AFTER equip (feet, not pelvis)
 * 4) baked idle with position+scale tracks stripped, then re-ground again
 * 5) never report "look OK" when weapon soup or hip-float remains
 */
async function finalizeGrudge6CharacterPresentation(model, opts = {}) {
  const preset = opts.preset || 'warrior';
  const packId = opts.packId || 'sword_shield';
  const wantAnim =
    opts.autoAnim !== false && document.getElementById('chkAnimOnChar')?.checked !== false;
  const raceId =
    model.userData.grudgeRaceId ||
    document.getElementById('previewRace')?.value ||
    'western-kingdoms';

  rebuildMeshIndex(model);
  const bySlot = groupMeshesBySlot(meshIndex);
  const loadout = guessPreset(bySlot, preset);
  // Mandatory body parts — never ground a torso-only multipack (hip-float)
  for (const slot of ['body', 'legs', 'arms', 'head']) {
    if (!loadout[slot] && (bySlot.get(slot) || [])[0]) {
      loadout[slot] = bySlot.get(slot)[0];
    }
  }
  // sword_shield: one sword preferred; strip multi-weapon soup
  if (packId === 'sword_shield' && !loadout.weapon) {
    const weapons = bySlot.get('weapon') || [];
    loadout.weapon =
      weapons.find((n) => /sword/i.test(n)) ||
      weapons.find((n) => /axe|mace|blade/i.test(n)) ||
      weapons[0] ||
      null;
  }
  applyLoadout(meshIndex, loadout);

  // Sync mesh list checkboxes to loadout (prevent UI from re-showing soup)
  document.querySelectorAll('#meshList input.mesh-vis').forEach((inp) => {
    const n = inp.dataset.mesh;
    const s = modularEquipSlot(n);
    const on = !!(loadout[s] && loadout[s] === n);
    inp.checked = on;
  });

  // Ground bind pose with correct body parts visible (BEFORE anim)
  prepareSkinnedMeasure(model);
  reGroundAfterEquip(model, 0);
  enforceCharacterSi(model, raceId);

  const pack = ANIM_PACKS[packId] || ANIM_PACKS.sword_shield;
  const packEl = document.getElementById('useAnimPackActive');
  if (packEl) packEl.textContent = pack.id;
  const useAnim = document.getElementById('useAnimPack');
  if (useAnim) useAnim.textContent = pack.id;

  let clips = [];
  if (wantAnim) {
    clips = await fetchPackClips(pack.id, model);
    // Extra strip — belt & suspenders against hip-float
    clips = clips.map((c) => stripPositionTracks(c));
    if (clips.length) {
      if (mixer) {
        try {
          mixer.stopAllAction();
        } catch {
          /* */
        }
      }
      mixer = new THREE.AnimationMixer(model);
      window._currentAnimations = clips;
      const action = mixer.clipAction(clips[0]);
      action.reset().play();
      // Sample two frames then re-ground (position tracks already stripped)
      mixer.update(1 / 30);
      reGroundAfterAnimSample(model, 0);
      mixer.update(1 / 30);
      reGroundAfterAnimSample(model, 0);
      enforceCharacterSi(model, raceId);
      reGroundAfterAnimSample(model, 0);
      fillAnimUi(clips);
    } else {
      fillAnimUi([]);
      console.warn('[grudge6] no baked clips for pack', pack.id);
    }
  } else {
    fillAnimUi([]);
  }

  // Final soup audit
  const soup = countVisibleWeaponSoup(meshIndex);
  if (soup.soup) {
    console.warn('[grudge6] weapon soup still visible — re-hiding', soup);
    applyLoadout(meshIndex, loadout);
    reGroundAfterAnimSample(model, 0);
  }

  return { loadout, packId: pack.id, clips, preset, soup };
}

/** Load a full anim pack onto the current character root (HUD pack buttons). */
async function loadAnimPackOntoCurrent(packId) {
  if (!currentRoot) {
    flashUse('Load a grudge6 character first');
    return;
  }
  const clips = await fetchPackClips(packId, currentRoot);
  if (!clips.length) {
    flashUse(`No baked clips for ${packId}`);
    return;
  }
  if (mixer) {
    try {
      mixer.stopAllAction();
    } catch {
      /* */
    }
  }
  mixer = new THREE.AnimationMixer(currentRoot);
  window._currentAnimations = clips;
  mixer.clipAction(clips[0]).reset().play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(currentRoot, 0);
  const raceSi =
    currentRoot.userData.grudgeRaceId ||
    document.getElementById('previewRace')?.value ||
    'western-kingdoms';
  enforceCharacterSi(currentRoot, raceSi);
  fillAnimUi(clips);
  const useAnim = document.getElementById('useAnimPack');
  if (useAnim) useAnim.textContent = packId;
  const packEl = document.getElementById('useAnimPackActive');
  if (packEl) packEl.textContent = packId;
  flashUse(`${packId}: ${clips.length} clips · playing ${clips[0].name}`);
}

async function playBakedOnCharacter(entry, raceId) {
  const model = await loadCharacterKit(raceId);
  // NEVER prepAndRebindMaterials on grudge6 — fleet atlas already bound
  const mats = materialHealth(model);
  const hostEntry = {
    kind: 'character',
    name: raceId,
    path: 'models/grudge6/races',
    cdnUrl: RACE_KITS[raceId]?.glb || RACE_KITS[raceId]?.r2,
  };
  const info = deployModel(model, { facePlusZ: true, entry: hostEntry });
  currentRoot = model;
  scene.add(model);
  rebuildMeshIndex(model);

  // Resolve pack + clip rel from entry
  let rel =
    entry.bakedRel ||
    (entry.path && /anims\/baked\//i.test(entry.path)
      ? String(entry.path)
          .replace(/^.*anims\/baked\//i, '')
          .replace(/\.json$/i, '')
      : null);
  const packHint =
    (rel && String(rel).split('/')[0]) ||
    animPackHint(entry) ||
    'sword_shield';

  await finalizeGrudge6CharacterPresentation(model, {
    preset: /bow|longbow|ranger/i.test(packHint)
      ? 'ranger'
      : /magic|staff/i.test(packHint)
        ? 'mage'
        : 'warrior',
    packId: packHint,
    autoAnim: false,
  });
  setDiag(info, mats, `baked-on-grudge6 (${raceId})`, hostEntry);

  let clip = rel ? await fetchBakedClip(rel, model) : null;
  if (!clip) {
    // Fall back to pack idle list
    const packClips = await fetchPackClips(packHint, model);
    clip = packClips[0] || null;
    if (clip && !rel) rel = `${packHint}/${clip.name}`;
  }
  if (!clip) {
    throw new Error(
      `Baked Bip001 clip not found for ${rel || entry.name}. ` +
        `Need anims/baked/{pack}/{clip}.json (open.grudge-studio.com or assets CDN).`,
    );
  }

  const packId = (rel && String(rel).split('/')[0]) || packHint || 'sword_shield';
  const siblings = await fetchPackClips(packId, model);
  const clips = [clip];
  for (const c of siblings) {
    if (c.name !== clip.name) clips.push(c);
  }

  mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).reset().play();
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  mixer.update(1 / 30);
  reGroundAfterAnimSample(model, 0);
  const si = enforceCharacterSi(model, raceId);
  const look = diagnoseCharacterLook(model, { raceId });
  window._currentAnimations = clips;
  fillAnimUi(clips);
  frameCamera(model);
  const h = si.heightM || info.height;
  const face = info.facingApplied ? ' +Z' : '';
  const thr = raceHeightM(raceId);
  document.getElementById('viewerInfo').textContent =
    `baked Bip001 · ${clip.name} · ${clip.duration.toFixed(2)}s · ${boneTruthLabel(model)} · h=${h.toFixed(2)}m (race ${thr}m) · feetY=${charBodyBox(model).min.y.toFixed(3)}${face}` +
    (look.ok ? ' · look OK' : ` · LOOK ${look.issues.map((i) => i.id).join(',')}`);
  const useAnim = document.getElementById('useAnimPack');
  if (useAnim) useAnim.textContent = packId;
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
  // Sample one frame then re-ground + race-height SI (not force-1.8)
  if (currentRoot) {
    mixer.update(1 / 30);
    reGroundAfterAnimSample(currentRoot, 0);
    const raceSi =
      currentRoot.userData.grudgeRaceId ||
      document.getElementById('previewRace')?.value ||
      'western-kingdoms';
    const si = enforceCharacterSi(currentRoot, raceSi);
    if (si.fixed) {
      console.warn('[character-correctness] SI re-enforced after clip', si.heightM, 'race', raceSi);
    }
    const look = diagnoseCharacterLook(currentRoot, { raceId: raceSi });
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
  const blob = `${entry?.path || ''} ${entry?.r2Key || ''} ${entry?.name || ''} ${entry?.cdnUrl || ''} ${entry?.id || ''}`.toLowerCase();
  // Legacy D1 folders: models/grudge6/ud|wk|brb|orc|elf|dwf/
  if (/\/brb\/|brb_|barbarian/.test(blob)) return 'barbarians';
  if (/\/elf\/|elf_|high-?elf|elves/.test(blob)) return 'high-elves';
  if (/\/dwf\/|dwf_|dwarf/.test(blob)) return 'dwarves';
  if (/\/orc\/|orc_/.test(blob)) return 'orcs';
  if (/\/ud\/|ud_|undead/.test(blob)) return 'undead';
  if (/\/wk\/|wk_|western|human/.test(blob)) return 'western-kingdoms';
  return document.getElementById('previewRace')?.value || 'western-kingdoms';
}

async function loadMeshAsset(entry) {
  // grudge6 race kits (canonical races/ OR legacy grudge6/ud|wk|…) → fleet kit only
  // kind may be missing on D1; name/path is enough
  if (isGrudge6RaceKitEntry(entry)) {
    const raceId = guessRaceId(entry);
    const model = await loadCharacterKit(raceId);
    // NEVER prepAndRebindMaterials here — it strips fleet bindRaceAtlas maps
    const mats = materialHealth(model);
    const hostEntry = {
      ...entry,
      kind: 'character',
      path: entry.path || `models/grudge6/races`,
      cdnUrl: RACE_KITS[raceId]?.glb || RACE_KITS[raceId]?.r2,
      source: 'grudge6-ssot',
      atlasUrl: model.userData.atlasUrl,
    };
    const info = deployModel(model, { facePlusZ: true, entry: hostEntry });
    currentRoot = model;
    scene.add(model);
    // CRITICAL: multipack default is "everything visible" → floating weapons T-pose soup.
    // Apply warrior equip + baked idle when Play anims is on (all packs, not just s&s).
    const presentation = await finalizeGrudge6CharacterPresentation(model, {
      preset: 'warrior',
      packId: 'sword_shield',
      autoAnim: true,
    });
    // Re-measure after equip+anim re-ground (deploy info.height can be stale)
    prepareSkinnedMeasure(model);
    const feetBox = charBodyBox(model);
    const h = feetBox.getSize(new THREE.Vector3()).y || info.measure || info.height;
    const look = diagnoseCharacterLook(model, { raceId });
    const soup = presentation.soup || countVisibleWeaponSoup(meshIndex);
    if (soup.soup) {
      look.ok = false;
      look.issues.push({
        id: 'weapon-soup',
        severity: 'error',
        detail: `${soup.weapons} weapons + ${soup.extras} props visible — multipack not isolated`,
      });
    }
    if (Math.abs(feetBox.min.y) > 0.08) {
      look.ok = false;
      look.issues.push({
        id: 'hip-float-or-sink',
        severity: 'error',
        detail: `feet minY=${feetBox.min.y.toFixed(3)} after equip+anim`,
      });
    }
    const report = setDiag(info, mats, `grudge6 R2 SSOT host (${raceId})`, hostEntry);
    frameCamera(model);
    const nClips = presentation.clips?.length || 0;
    const loadoutBits = Object.entries(presentation.loadout || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:${String(v).replace(/^BRB_|^WK_|^ELF_|^DWF_|^ORC_|^UD_/i, '').slice(0, 18)}`)
      .join(' ');
    document.getElementById('viewerInfo').textContent =
      `grudge6 SSOT · ${raceId} · h=${h.toFixed(2)}m · feetY=${feetBox.min.y.toFixed(3)} · unit ${info.unitKind || 'ok'}` +
      (info.siEnforced ? ' · SI-enforced' : '') +
      ` · equip ${presentation.preset}` +
      (loadoutBits ? ` [${loadoutBits}]` : '') +
      ` · pack ${presentation.packId}` +
      (nClips ? ` · ${nClips} clips` : ' · ⚠ no baked idle') +
      (soup.soup ? ' · ⚠ WEAPON SOUP' : '') +
      (look.ok ? ' · look OK' : ` · LOOK ${look.issues.map((i) => i.id).join(',')}`);
    return { model, anims: presentation.clips || [] };
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
      const raceSi =
        model.userData.grudgeRaceId ||
        document.getElementById('previewRace')?.value ||
        'western-kingdoms';
      enforceCharacterSi(model, raceSi);
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
  const p = `${entry?.path || ''} ${entry?.r2Key || ''} ${entry?.cdnUrl || ''} ${entry?.id || ''} ${entry?.name || ''} ${entry?.source || ''}`.toLowerCase();
  return (
    entry?.source === 'grudge6-ssot' ||
    entry?.source === 'grudge6-curated' ||
    entry?.sourceSet === 'grudge6' ||
    // Canonical
    /models\/grudge6\/races\/.*(wk|brb|elf|dwf|orc|ud)_characters/i.test(p) ||
    /grudge6\/races/i.test(p) ||
    // Legacy D1 keys (uuid d762b5b8… = models/grudge6/ud/UD_Characters.glb)
    /models\/grudge6\/(wk|brb|ud|orc|elf|dwf)\/[a-z0-9_]*characters\.(glb|fbx)/i.test(p) ||
    /(wk|brb|ud|orc|elf|dwf)_characters\.(glb|fbx)/i.test(p)
  );
}

async function loadAnimClipOnCharacter(entry, raceId) {
  /**
   * HARD: kind=animation in pipeline = baked Bip001 JSON only
   * (anims/baked/{pack}/{clip}.json on open/assets CDN).
   *
   * models/animations/** Mixamo/Kaykit GLBs are TRASH — never play as anim kind.
   */
  const path = String(entry.path || entry.r2Key || entry.cdnUrl || '');
  if (/models\/animations\//i.test(path) || /kaykit\/rig_/i.test(path)) {
    throw new Error(
      'Raw anim dump (models/animations or Kaykit Rig) is not a fleet animation.\n' +
        'Only anims/baked/{pack}/{clip}.json (Bip001 rotation) is kind=animation.\n' +
        'Bake Mixamo → Bip001 JSON first, then re-register.',
    );
  }

  // Baked JSON SSOT
  if (entry.isBakedClip || entry.format === 'json' || /anims\/baked\//i.test(path)) {
    await playBakedOnCharacter(entry, raceId);
    return;
  }

  // Race kit opened under anim filter by mistake
  if (isGrudge6RaceKitEntry(entry)) {
    await loadMeshAsset({ ...entry, kind: 'character', source: 'grudge6-ssot' });
    return;
  }

  // Everything else that D1 labeled "animation" is wrong — do not extract Mixamo onto kit
  throw new Error(
    `Not a valid fleet animation: ${path || entry.name}\n` +
      'Expected anims/baked/**/*.json (Bip001). ' +
      'Raw FBX/GLB anim packs are author inputs only.',
  );
}

function pushDeepLink(entry) {
  if (!entry || !window.history?.replaceState) return;
  const sp = new URLSearchParams();
  if (entry.grudgeUuid) sp.set('uuid', entry.grudgeUuid);
  // Always publish canonical races/ path for race kits (never legacy ud/wk/brb folders)
  let path = entry.path || '';
  if (isGrudge6RaceKitEntry(entry) || isTrashGrudge6Path(path)) {
    const pipeId = guessRaceId(entry);
    const kit = RACE_KITS[pipeId];
    if (kit?.glb) {
      path = String(kit.glb)
        .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '')
        .replace(/^\//, '');
    }
  }
  if (path) sp.set('path', path);
  if (entry.kind || isGrudge6RaceKitEntry(entry)) sp.set('kind', entry.kind || 'character');
  const q = document.getElementById('searchBox')?.value?.trim();
  if (q) sp.set('q', q);
  const url = `${location.pathname}?${sp.toString()}`;
  history.replaceState({ asset: entry.id }, '', url);
}

async function openViewer(entry) {
  if (!entry) return;
  // HARD: never open trash grudge6 paths — swap to fleet SSOT row
  if (isTrashGrudge6Path(entry.path || entry.r2Key || entry.cdnUrl || '')) {
    const pipeId = guessRaceId(entry);
    const ssot = (catalogAll || allModels || []).find(
      (m) =>
        (m.source === 'grudge6-ssot' || (m.sources || []).includes('grudge6-ssot')) &&
        guessRaceId(m) === pipeId,
    );
    if (ssot) entry = ssot;
    else {
      // synthesize minimal SSOT entry
      entry = {
        ...entry,
        source: 'grudge6-ssot',
        kind: 'character',
        path: RACE_KITS[pipeId]?.glb?.replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '') || entry.path,
        cdnUrl: RACE_KITS[pipeId]?.glb,
      };
    }
  }
  if (!renderer) initViewer();
  else {
    viewerLoopActive = true;
    startViewerLoop();
  }
  document.getElementById('viewerOverlay').classList.add('active');
  document.getElementById('viewerTitle').textContent = entry.name;
  document.getElementById('viewerInfo').textContent =
    `${entry.path || entry.kind || ''} · uuid ${entry.grudgeUuid || 'pending'} · ${entry.source || ''}`;
  document.body.style.overflow = 'hidden';
  const le = document.getElementById('viewerLoading');
  le.style.display = 'flex';
  le.innerHTML = '<div class="spinner"></div><p>Loading fleet SSOT mesh…</p>';
  clearSceneModel();
  setDiag(null);
  fillAnimUi([]);
  rebuildMeshIndex(null);
  selectedMeshName = null;
  fillUsePanel(entry);
  pushDeepLink(entry);
  const raceId =
    (isGrudge6RaceKitEntry(entry) ? guessRaceId(entry) : null) ||
    document.getElementById('previewRace')?.value ||
    'western-kingdoms';
  try {
    if (entry.kind === 'animation' || entry.isBakedClip) {
      await loadAnimClipOnCharacter(entry, raceId);
    } else if (isGrudge6RaceKitEntry(entry)) {
      // Always fleet kit — ignore entry.cdnUrl pointing at trash/legacy GLB
      await loadMeshAsset({ ...entry, kind: 'character', source: 'grudge6-ssot' });
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

/**
 * Deep-link by grudgeUuid / path.
 * Race kits ALWAYS resolve to curated fleet SSOT (never legacy D1 trash).
 * Example: ?uuid=3ab2b12a-…&path=models/grudge6/races/BRB_Characters.glb
 *   → barbarians grudge6-ssot → loadCharacterKit FBX+atlas
 */
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

  // 1) Force fleet race SSOT from path or trash rewrite
  const fleetFromPath = detectFleetRaceId(pathN) || detectFleetRaceId(path || '');
  if (fleetFromPath || isTrashGrudge6Path(pathN) || /races\/.*(wk|brb|ud|orc|elf|dwf)_characters/i.test(pathN)) {
    const pipeId =
      {
        human: 'western-kingdoms',
        barbarian: 'barbarians',
        elf: 'high-elves',
        dwarf: 'dwarves',
        orc: 'orcs',
        undead: 'undead',
      }[fleetFromPath || detectFleetRaceId(pathN)] || guessRaceId({ path: pathN, name: pathN });
    const ssot =
      (catalogAll || []).find(
        (m) =>
          (m.source === 'grudge6-ssot' || (m.sources || []).includes('grudge6-ssot')) &&
          guessRaceId(m) === pipeId,
      ) ||
      (allModels || []).find(
        (m) =>
          (m.source === 'grudge6-ssot' || (m.sources || []).includes('grudge6-ssot')) &&
          guessRaceId(m) === pipeId,
      );
    if (ssot) {
      if (uuidN) ssot.grudgeUuid = ssot.grudgeUuid || uuidN;
      return ssot;
    }
  }

  // 2) Search full catalog (ready filter may hide rows) + ready list
  const pool = [...(catalogAll || []), ...(allModels || [])];
  const seen = new Set();
  const uniq = [];
  for (const m of pool) {
    const id = m.id || m.path || m.grudgeUuid;
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(m);
  }
  let hit =
    uniq.find(
      (m) =>
        (uuidN && m.grudgeUuid && m.grudgeUuid.toLowerCase() === uuidN) ||
        (pathN && (m.path || '').toLowerCase() === pathN),
    ) ||
    uniq.find((m) => pathN && (m.path || '').toLowerCase().endsWith(pathN)) ||
    null;

  // 3) UUID hit on trash path → redirect to SSOT race kit
  if (hit && (isTrashGrudge6Path(hit.path) || isGrudge6RaceKitEntry(hit))) {
    const pipeId = guessRaceId(hit);
    const ssot = uniq.find(
      (m) =>
        (m.source === 'grudge6-ssot' || (m.sources || []).includes('grudge6-ssot')) &&
        guessRaceId(m) === pipeId,
    );
    if (ssot) return ssot;
  }
  return hit;
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
    stopViewerLoop();
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
  setProdInventory('ready'); // game-ready only — never unhide raw dumps
  activeFormat = null; // GLB meshes (json clips rarely harvest)
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
  setProdInventory('ready');
  activeFormat = null;
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
