/**
 * Fleet needs ledger — home-island harvest + pinata (and growing tracks).
 *
 * Live on https://grudge-pipeline.vercel.app/
 * Rule: as GrudgeBuilder / home-island gains systems, register every CDN asset,
 * tool mesh, debris GLB, and runtime package here so the pipeline browser stays
 * the single place to see "what we still need".
 *
 * Consumers: model-browser needs panel, deploy plan, agents.
 */

/** @typedef {'ready'|'partial'|'missing'|'runtime'|'planned'} NeedStatus */

/**
 * Home-island harvest SSOT (mirrors GrudgeBuilder IslandResourceLoader + pinata).
 * Paths are R2-relative under assets.grudge-studio.com when possible.
 */
export const HARVEST_NODE_ROLES = /** @type {const} */ ([
  'tree',
  'palm',
  'rock',
  'ore',
  'crystal',
  'log',
  'debris',
  'stump',
  'flower',
  'plant',
  'tool_axe',
  'tool_pickaxe',
]);

/**
 * Canonical CDN / loader keys used by Island3D harvest + pinata break.
 * status:
 *  - ready   = production path known in fleet (verify in browser)
 *  - partial = pack exists but multipack / variants need isolation
 *  - missing = not yet on CDN / needs bake
 *  - runtime = code package not a GLB
 *  - planned = design-only until authored
 */
export const HARVEST_FLEET_NEEDS = [
  {
    id: 'harvest.tree.battle',
    track: 'harvest',
    role: 'tree',
    label: 'Battle CommonTree (NatureDecor)',
    pathHints: ['NatureDecor', 'CommonTree', 'nature/trees', 'battle'],
    search: 'commontree nature tree',
    tool: 'axe',
    pinata: true,
    status: 'partial',
    notes: 'IslandResourceLoader harvestTreePack — multipath battle trees',
  },
  {
    id: 'harvest.palm',
    track: 'harvest',
    role: 'palm',
    label: 'Tropical palm pack',
    pathHints: ['palm', 'tropical', 'STYLIZED'],
    search: 'palm tropical',
    tool: 'axe',
    pinata: true,
    status: 'partial',
    notes: 'Fallback when CommonTree fails coastal biomes',
  },
  {
    id: 'harvest.rock.battle',
    track: 'harvest',
    role: 'rock',
    label: 'Battle rocks / pebbles',
    pathHints: ['Pebble', 'Rock_Medium', 'NatureDecor'],
    search: 'pebble rock nature',
    tool: 'pickaxe',
    pinata: true,
    status: 'partial',
    notes: 'harvestRockPack — pinata shatter + debris',
  },
  {
    id: 'harvest.ore.stylized',
    track: 'harvest',
    role: 'ore',
    label: 'Ore / gold nodes (stylized multipack)',
    pathHints: ['ore', 'gold', 'oreNodes', 'STYLIZED'],
    search: 'ore gold rock vein',
    tool: 'pickaxe',
    pinata: true,
    status: 'partial',
    notes: 'STYLIZED_PACK_PATHS.oreNodes — isolate meshName per vein',
  },
  {
    id: 'harvest.crystal',
    track: 'harvest',
    role: 'crystal',
    label: 'Crystal / gem clusters',
    pathHints: ['crystal', 'gem', 'oreNodes'],
    search: 'crystal gem',
    tool: 'pickaxe',
    pinata: true,
    status: 'partial',
    notes: 'harvestCrystalPack',
  },
  {
    id: 'harvest.logs',
    track: 'harvest',
    role: 'log',
    label: 'Mined log drops',
    pathHints: ['harvest_logs', 'models/environment/harvest_logs'],
    r2Key: 'models/environment/harvest_logs.glb',
    search: 'harvest_logs log',
    tool: 'axe',
    pinata: false,
    status: 'ready',
    notes: 'CDN drop mesh after tree felling',
  },
  {
    id: 'harvest.debris',
    track: 'harvest',
    role: 'debris',
    label: 'Rock debris chips',
    pathHints: ['harvest_rock_debris', 'models/environment/harvest_rock_debris'],
    r2Key: 'models/environment/harvest_rock_debris.glb',
    search: 'harvest_rock_debris debris',
    tool: 'pickaxe',
    pinata: false,
    status: 'ready',
    notes: 'CDN chip pool + pinata shards are separate',
  },
  {
    id: 'harvest.stump',
    track: 'harvest',
    role: 'stump',
    label: 'Tree stump after fell',
    pathHints: ['harvest_stump', 'models/environment/harvest_stump'],
    r2Key: 'models/environment/harvest_stump.glb',
    search: 'harvest_stump stump',
    tool: 'axe',
    pinata: false,
    status: 'ready',
    notes: 'swapTreeToStump',
  },
  {
    id: 'harvest.flower',
    track: 'harvest',
    role: 'flower',
    label: 'Flower / herb patches',
    pathHints: ['flower', 'NatureDecor'],
    search: 'flower herb nature',
    tool: 'skinning_knife',
    pinata: false,
    status: 'partial',
    notes: 'Knife tool gate — soft plant, no pinata',
  },
  {
    id: 'harvest.tool.pickaxe',
    track: 'harvest',
    role: 'tool_pickaxe',
    label: 'Harvest pickaxe mesh (hand attach)',
    pathHints: ['pickaxe', 'harvest_pickaxe', 'hammer'],
    search: 'pickaxe harvest tool',
    tool: 'pickaxe',
    pinata: false,
    status: 'partial',
    notes: 'HarvestPickaxeAttachment + R-radial pick',
  },
  {
    id: 'harvest.tool.axe',
    track: 'harvest',
    role: 'tool_axe',
    label: 'Harvest hatchet mesh (hand attach)',
    pathHints: ['hatchet', 'axe', 'harvest_axe'],
    search: 'hatchet axe harvest tool',
    tool: 'axe',
    pinata: false,
    status: 'partial',
    notes: 'Default R-radial tool for trees',
  },
  {
    id: 'harvest.runtime.pinata',
    track: 'harvest',
    role: 'runtime',
    label: '@dgreenheck/three-pinata (Voronoi break)',
    pathHints: [],
    search: '',
    tool: null,
    pinata: true,
    status: 'runtime',
    notes: 'GrudgeBuilder PinataHarvestBreak — manifold proxy + Rapier fragments',
    package: '@dgreenheck/three-pinata',
    codeRefs: [
      'client/src/island3d/harvest/PinataHarvestBreak.ts',
      'client/src/island3d/harvest/HarvestNodeRecognition.ts',
      'client/src/island3d/physics/PhysicsWorld.ts#addDynamicFragment',
    ],
  },
  {
    id: 'harvest.runtime.tools',
    track: 'harvest',
    role: 'runtime',
    label: 'HarvestToolActions radial + tool gates',
    pathHints: [],
    search: '',
    tool: null,
    pinata: false,
    status: 'runtime',
    notes: 'axe/pickaxe/knife/fishing/toolkit — wrong tool rejects strike',
    codeRefs: [
      'client/src/game/harvest/HarvestToolActions.ts',
      'client/src/island3d/harvest/HarvestNodeRecognition.ts',
    ],
  },
  {
    id: 'harvest.pbr.ground',
    track: 'harvest',
    role: 'environment',
    label: 'PBR ground / terrain materials (zip packs)',
    pathHints: ['Grass', 'Sand', 'Stone', 'Cobble', 'Dirt'],
    search: 'grass sand stone ground pbr',
    tool: null,
    pinata: false,
    status: 'partial',
    notes: 'Repo root texture zips — convert + R2 for island terrain',
  },
  {
    id: 'harvest.nature.megakit',
    track: 'harvest',
    role: 'environment',
    label: 'Stylized Nature MegaKit',
    pathHints: ['Stylized Nature', 'MegaKit', 'nature'],
    search: 'stylized nature megakit',
    tool: null,
    pinata: true,
    status: 'partial',
    notes: 'Local zip in pipeline repo — convert for ore/tree variants',
  },
];

/** Broader fleet tracks we accumulate into this browser over time. */
export const FLEET_TRACKS = [
  {
    id: 'harvest',
    label: 'Home-island harvest + pinata',
    product: 'client.grudge-studio.com /home-island',
    docs: [
      'docs/HARVEST_PINATA.md',
      'GrudgeBuilder client/src/island3d/harvest/PINATA_HARVEST.md',
    ],
    needs: HARVEST_FLEET_NEEDS,
  },
  {
    id: 'grudge6',
    label: 'grudge6 characters + anim packs',
    product: 'character / open / warlords',
    docs: ['docs/CHARACTER_CORRECTNESS.md', 'docs/AVATAR-SPEC.md'],
    needs: [], // catalog already dense — use Kind=character filter
  },
  {
    id: 'build',
    label: 'Buildables / kenney snap',
    product: 'island build mode',
    docs: ['docs/BEST-PRACTICES.md'],
    needs: [],
  },
];

/**
 * Match a catalog entry to harvest needs (for badges / filter).
 * @param {object} m
 * @returns {typeof HARVEST_FLEET_NEEDS[number][]}
 */
export function matchHarvestNeeds(m) {
  if (!m) return [];
  const blob = `${m.path || ''} ${m.name || ''} ${m.group || ''} ${m.category || ''} ${m.r2Key || ''}`.toLowerCase();
  return HARVEST_FLEET_NEEDS.filter((need) => {
    if (need.r2Key && blob.includes(need.r2Key.toLowerCase())) return true;
    return (need.pathHints || []).some((h) => blob.includes(String(h).toLowerCase()));
  });
}

/**
 * True when entry is a harvest node / tool / debris asset.
 * @param {object} m
 */
export function isHarvestAsset(m) {
  if (!m) return false;
  if (m.kind === 'harvest') return true;
  return matchHarvestNeeds(m).length > 0;
}

/**
 * Infer harvest sub-role for kind=harvest.
 * @param {object} m
 * @returns {string|null}
 */
export function inferHarvestRole(m) {
  const hits = matchHarvestNeeds(m);
  if (hits.length) return hits[0].role;
  const c = `${m?.path || ''} ${m?.name || ''}`.toLowerCase();
  if (c.includes('stump')) return 'stump';
  if (c.includes('debris') || c.includes('chip')) return 'debris';
  if (c.includes('log')) return 'log';
  if (c.includes('ore') || c.includes('gold')) return 'ore';
  if (c.includes('crystal') || c.includes('gem')) return 'crystal';
  if (c.includes('palm')) return 'palm';
  if (c.includes('tree') || c.includes('pine')) return 'tree';
  if (c.includes('rock') || c.includes('pebble') || c.includes('stone')) return 'rock';
  if (c.includes('pickaxe')) return 'tool_pickaxe';
  if (c.includes('hatchet') || (c.includes('axe') && c.includes('tool'))) return 'tool_axe';
  if (c.includes('flower') || c.includes('herb')) return 'flower';
  return null;
}

/**
 * Score catalog coverage for the harvest track.
 * @param {object[]} models
 */
export function scoreHarvestCoverage(models) {
  const list = Array.isArray(models) ? models : [];
  let covered = 0;
  const rows = HARVEST_FLEET_NEEDS.map((need) => {
    if (need.status === 'runtime' || need.status === 'planned') {
      return { ...need, catalogHits: 0, covered: need.status === 'runtime' };
    }
    const hits = list.filter((m) => {
      const blob = `${m.path || ''} ${m.name || ''} ${m.group || ''}`.toLowerCase();
      if (need.r2Key && blob.includes(need.r2Key.toLowerCase().replace(/^models\//, ''))) return true;
      if (need.r2Key && blob.includes(need.r2Key.toLowerCase())) return true;
      return (need.pathHints || []).some((h) => blob.includes(String(h).toLowerCase()));
    });
    const ok = hits.length > 0;
    if (ok) covered++;
    return { ...need, catalogHits: hits.length, covered: ok, sample: hits[0]?.name || hits[0]?.path || null };
  });
  const assetNeeds = HARVEST_FLEET_NEEDS.filter((n) => n.status !== 'runtime' && n.status !== 'planned');
  return {
    track: 'harvest',
    total: assetNeeds.length,
    covered,
    runtime: HARVEST_FLEET_NEEDS.filter((n) => n.status === 'runtime').length,
    rows,
    pct: assetNeeds.length ? Math.round((covered / assetNeeds.length) * 100) : 0,
  };
}

/**
 * Import snippet for harvest assets in Island3D.
 * @param {object} m
 */
export function harvestImportSnippet(m) {
  const url = m?.cdnUrl || (m?.path ? `https://assets.grudge-studio.com/${String(m.path).replace(/^\//, '')}` : '');
  const role = inferHarvestRole(m) || 'prop';
  const tool =
    role === 'tree' || role === 'palm' || role === 'log' || role === 'stump'
      ? 'axe'
      : role === 'flower' || role === 'plant'
        ? 'skinning_knife'
        : 'pickaxe';
  return `// Home-island harvest asset (${role})
// tool gate: ${tool} · pinata: ${['tree', 'palm', 'rock', 'ore', 'crystal'].includes(role) ? 'yes' : 'no'}
// r2Key: ${m?.path || m?.r2Key || ''}
// uuid: ${m?.grudgeUuid || ''}
const url = ${JSON.stringify(url)};
// Island3D: cloneIslandResource / pinata break — manifold proxy for shatter
// Never fit to 1.8 m human — trees ~6–12 m, rocks ~0.8–2.5 m, debris ~0.3–0.6 m
// Network: damage + loot only — do not sync pinata fragment meshes`;
}
