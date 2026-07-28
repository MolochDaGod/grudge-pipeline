/**
 * Fleet Asset Truth — SSOT labels, merge rules, game-use tags for pipeline browser.
 *
 * Truth layers (priority when merging):
 *   1. D1 asset_registry (path + grudgeUuid + fileSize)
 *   2. production-catalog.json (pipeline-shipped, labeled)
 *   3. Curated grudge6 / baked clips
 *   4. ObjectStore models3d.json (definitions supplement)
 *
 * Canonical IDs:
 *   r2Key     = relative path under assets.grudge-studio.com
 *   grudgeUuid = sha1("grudge-asset:" + r2Key) UUID-v5-style
 *   id        = r2Key preferred (stable), else grudgeUuid
 *
 * @see docs/FLEET_ASSET_TRUTH.md · docs/UUID_DEDUPE_DEPLOY.md
 */

export const FLEET_TRUTH_VERSION = '1.0.0';

export const FLEET_TRUTH_HOSTS = {
  pipeline: 'https://grudge-pipeline.vercel.app',
  cdn: 'https://assets.grudge-studio.com',
  d1: 'https://api.grudge-studio.com/assets',
  objectStore: 'https://objectstore.grudge-studio.com/api/v1',
  objectStoreModels:
    'https://molochdagod.github.io/ObjectStore/api/v1/models3d.json',
  id: 'https://id.grudge-studio.com',
  builderApi: 'https://grudge-api-production-0d46.up.railway.app',
  forge: 'https://forge.grudge-studio.com',
  open: 'https://open.grudge-studio.com',
  mineLoader: 'https://mine.grudge-studio.com',
  mineLoaderApi: 'https://mine-loader-api-production.up.railway.app',
  warlords: 'https://grudgewarlords.com',
  foundry: 'https://character.grudge-studio.com',
};

/** Source priority (higher wins fields when merging). */
export const SOURCE_PRIORITY = {
  d1: 100,
  production: 90,
  'grudge6-ssot': 80,
  'baked-bip001': 75,
  curated: 70,
  objectstore: 40,
  local: 10,
  unknown: 0,
};

/**
 * Game products that may consume an asset.
 * Used for filters + import snippets.
 */
export const GAME_USES = {
  warlords: {
    id: 'warlords',
    label: 'Warlords / client',
    hosts: ['grudgewarlords.com', 'client.grudge-studio.com'],
  },
  open: {
    id: 'open',
    label: 'Open launcher',
    hosts: ['open.grudge-studio.com', 'gameopen.vercel.app'],
  },
  'mine-loader': {
    id: 'mine-loader',
    label: 'Mine-Loader Realms',
    hosts: ['mine.grudge-studio.com', 'mine-loader.vercel.app'],
  },
  voxgrudge: {
    id: 'voxgrudge',
    label: 'VoxGrudge',
    hosts: ['voxgrudge.vercel.app'],
  },
  forge: {
    id: 'forge',
    label: 'Forge editor',
    hosts: ['forge.grudge-studio.com'],
  },
  foundry: {
    id: 'foundry',
    label: 'Character Foundry',
    hosts: ['character.grudge-studio.com'],
  },
  pipeline: {
    id: 'pipeline',
    label: 'Pipeline browser',
    hosts: ['grudge-pipeline.vercel.app'],
  },
  grudox: {
    id: 'grudox',
    label: 'GRUDOX / Carrier',
    hosts: ['grudox.grudge-studio.com'],
  },
};

/**
 * Infer which games use this asset from path/kind/labels.
 * @param {object} m normalized entry
 * @returns {string[]}
 */
export function inferGameUses(m) {
  const p = `${m.path || ''} ${m.group || ''} ${m.category || ''} ${m.kind || ''} ${m.name || ''}`.toLowerCase();
  const uses = new Set(['pipeline']);

  if (
    p.includes('grudge6') ||
    p.includes('character') ||
    p.includes('races/') ||
    m.kind === 'character' ||
    m.kind === 'animation'
  ) {
    uses.add('warlords');
    uses.add('open');
    uses.add('foundry');
    uses.add('forge');
  }
  if (
    p.includes('nature') ||
    p.includes('harvest') ||
    p.includes('island') ||
    m.kind === 'harvest' ||
    m.kind === 'environment'
  ) {
    uses.add('warlords');
    uses.add('forge');
  }
  if (
    p.includes('projectile') ||
    p.includes('vfx') ||
    p.includes('arrow') ||
    p.includes('cannon') ||
    m.kind === 'projectile' ||
    m.kind === 'vfx' ||
    m.kind === 'weapon'
  ) {
    uses.add('warlords');
    uses.add('open');
    uses.add('grudox');
  }
  if (p.includes('block') || p.includes('voxel') || p.includes('codex')) {
    uses.add('mine-loader');
    uses.add('voxgrudge');
    uses.add('open');
  }
  if (p.includes('airship') || p.includes('boat') || p.includes('ship')) {
    uses.add('warlords');
    uses.add('open');
  }
  if (p.includes('anims/baked') || m.isBakedClip) {
    uses.add('warlords');
    uses.add('open');
    uses.add('foundry');
    uses.add('forge');
  }
  if (p.includes('build') || p.includes('kenney') || m.kind === 'buildable') {
    uses.add('warlords');
    uses.add('mine-loader');
    uses.add('forge');
  }

  return [...uses];
}

/**
 * Canonical labels array for UI badges + search.
 * @param {object} m
 */
export function buildCanonicalLabels(m) {
  const labels = new Set();
  if (m.kind) labels.add(`kind:${m.kind}`);
  if (m.subtype) labels.add(`subtype:${m.subtype}`);
  if (m.format) labels.add(`fmt:${m.format}`);
  if (m.source) labels.add(`src:${m.source}`);
  if (m.textureStatus) labels.add(`tex:${m.textureStatus}`);
  if (m.productionBaked || m.bakePipeline === 'glb2glb') labels.add('production');
  if (m.deployReady || isLikelyDeployReady(m)) labels.add('deploy-ready');
  if (m.grudgeUuid) labels.add('uuid');
  if (m.uuidStatus === 'ok' || m.uuidStatus === 'derived') labels.add(`uuid:${m.uuidStatus}`);
  if (m.d1Indexed) labels.add('d1');
  if (m.scaleProfile) labels.add(`scale:${m.scaleProfile}`);
  if (m.boneMap) labels.add(`skel:${m.boneMap}`);
  for (const g of m.gameUses || []) labels.add(`game:${g}`);
  return [...labels];
}

function isLikelyDeployReady(m) {
  if (m.deployReady) return true;
  if (m.format === 'glb' && (m.textureStatus === 'atlas' || m.textureStatus === 'embedded' || (m.textures || 0) > 0))
    return true;
  if (m.isBakedClip) return true;
  if (m.kind === 'character' && m.format === 'glb') return true;
  return false;
}

/**
 * Normalize r2 key.
 * @param {string} key
 */
export function normalizeR2Key(key) {
  return String(key || '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')
    .replace(/^https?:\/\/assets\.grudge-studio\.com\//i, '');
}

/**
 * Merge two catalog entries — D1 / higher source priority wins identity fields.
 * @param {object} a
 * @param {object} b
 */
export function mergeTruthEntries(a, b) {
  if (!a) return b;
  if (!b) return a;
  const pa = SOURCE_PRIORITY[a.source] ?? SOURCE_PRIORITY.unknown;
  const pb = SOURCE_PRIORITY[b.source] ?? SOURCE_PRIORITY.unknown;
  const primary = pa >= pb ? a : b;
  const secondary = pa >= pb ? b : a;

  const merged = {
    ...secondary,
    ...primary,
    // Prefer non-empty identity
    grudgeUuid: primary.grudgeUuid || secondary.grudgeUuid || null,
    path: normalizeR2Key(primary.path || secondary.path),
    r2Key: normalizeR2Key(primary.r2Key || secondary.r2Key || primary.path || secondary.path),
    cdnUrl:
      primary.cdnUrl ||
      secondary.cdnUrl ||
      (primary.path || secondary.path
        ? `${FLEET_TRUTH_HOSTS.cdn}/${normalizeR2Key(primary.path || secondary.path)}`
        : null),
    // Prefer richer mesh/texture stats
    meshes: primary.meshes ?? secondary.meshes ?? null,
    textures: Math.max(primary.textures || 0, secondary.textures || 0) || null,
    materials: primary.materials ?? secondary.materials ?? null,
    animations: primary.animations ?? secondary.animations ?? null,
    textureStatus: primary.textureStatus || secondary.textureStatus || null,
    productionBaked: !!(primary.productionBaked || secondary.productionBaked),
    deployReady: !!(primary.deployReady || secondary.deployReady),
    bakePipeline: primary.bakePipeline || secondary.bakePipeline || null,
    d1Indexed: !!(primary.d1Indexed || secondary.d1Indexed || primary.source === 'd1' || secondary.source === 'd1'),
    sources: unique([...(primary.sources || [primary.source]), ...(secondary.sources || [secondary.source])].filter(Boolean)),
    altUrls: unique([...(primary.altUrls || []), ...(secondary.altUrls || [])].filter(Boolean)),
  };

  // Keep kind from inference if missing
  merged.kind = primary.kind || secondary.kind || merged.kind;
  merged.subtype = primary.subtype || secondary.subtype || null;
  merged.gameUses = unique([...(primary.gameUses || []), ...(secondary.gameUses || []), ...inferGameUses(merged)]);
  merged.labels = buildCanonicalLabels(merged);
  merged.searchBlob = buildSearchBlob(merged);
  return merged;
}

function unique(arr) {
  return [...new Set(arr)];
}

export function buildSearchBlob(m) {
  return [
    m.name,
    m.path,
    m.r2Key,
    m.group,
    m.category,
    m.kind,
    m.subtype,
    m.format,
    m.source,
    ...(m.sources || []),
    m.grudgeUuid,
    m.uuidStatus,
    m.textureStatus,
    m.bakePipeline,
    m.boneMap,
    m.scaleProfile,
    ...(m.labels || []),
    ...(m.gameUses || []),
    m.productionBaked ? 'production baked glb2glb deploy' : '',
    m.d1Indexed ? 'd1-registry' : '',
    m.deployReady ? 'deploy-ready game-ready' : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Enrich a normalized entry with fleet truth fields.
 * @param {object} m
 */
export function enrichFleetTruth(m) {
  const path = normalizeR2Key(m.path || m.r2Key || '');
  m.path = path;
  m.r2Key = path || m.r2Key || '';
  if (m.r2Key && !m.cdnUrl) {
    m.cdnUrl = `${FLEET_TRUTH_HOSTS.cdn}/${m.r2Key}`;
  }
  if (m.source === 'd1') m.d1Indexed = true;
  m.gameUses = m.gameUses?.length ? m.gameUses : inferGameUses(m);
  m.labels = buildCanonicalLabels(m);
  m.searchBlob = buildSearchBlob(m);
  m.truthVersion = FLEET_TRUTH_VERSION;
  return m;
}

/**
 * Build offset list to cover D1 total (page size 200).
 * @param {number} total
 * @param {number} pageSize
 * @param {number} maxPages safety cap
 */
export function d1Offsets(total, pageSize = 200, maxPages = 80) {
  const pages = Math.min(maxPages, Math.ceil((total || pageSize) / pageSize) || 1);
  return Array.from({ length: pages }, (_, i) => i * pageSize);
}

/**
 * Fetch production-catalog.json (pipeline-shipped labels).
 * @returns {Promise<object[]>}
 */
export async function fetchProductionCatalog() {
  try {
    const r = await fetch('api/production-catalog.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const assets = j.assets || j.entries || [];
    return assets.map((a) => ({
      ...a,
      path: a.r2Key || a.path,
      r2Key: a.r2Key || a.path,
      source: 'production',
      productionBaked: a.productionBaked !== false,
      deployReady: a.deployReady !== false,
      d1Indexed: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Truth summary for status bar.
 * @param {object[]} models
 */
export function truthSummary(models) {
  const list = Array.isArray(models) ? models : [];
  const withUuid = list.filter((m) => m.grudgeUuid).length;
  const d1 = list.filter((m) => m.d1Indexed || m.source === 'd1').length;
  const prod = list.filter((m) => m.deployReady || m.productionBaked).length;
  const bySource = {};
  for (const m of list) {
    const s = m.source || 'unknown';
    bySource[s] = (bySource[s] || 0) + 1;
  }
  return {
    total: list.length,
    withUuid,
    d1,
    prod,
    bySource,
    uuidPct: list.length ? Math.round((withUuid / list.length) * 100) : 0,
    d1Pct: list.length ? Math.round((d1 / list.length) * 100) : 0,
  };
}
