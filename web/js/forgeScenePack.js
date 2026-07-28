/**
 * Forge scene pack — build .gfscene.json from pipeline catalog assets.
 *
 * Opens in forge.grudge-studio.com via:
 *   1. Download pack → File → Import .gfscene.json
 *   2. Open in Forge → postMessage bridge (awaitImport=1)
 *   3. Deep link ?scene=<https URL> when pack is hosted
 *
 * Scene shape matches Forge templates (entities + environment).
 * Scripts + asset manifest ride in pack extras for editor / AI.
 */

import { FLEET_HOSTS, forgeDeepLink } from './fleetBridge.js';
import { cdnUrlOf, r2KeyOf } from './use-contract.js';

const PACK_VERSION = 1;

function entId() {
  return `ent-${Math.random().toString(36).slice(2, 10)}`;
}

function safeName(s) {
  return String(s || 'asset')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .slice(0, 64);
}

/**
 * Map pipeline catalog entry → Forge model entity.
 * @param {object} m catalog row
 * @param {{ index?: number, x?: number, z?: number, scale?: number }} layout
 */
export function assetToEntity(m, layout = {}) {
  const url = cdnUrlOf(m) || m.cdnUrl || m.url || '';
  const name = m.name || m.title || m.path || r2KeyOf(m) || 'Asset';
  const i = layout.index ?? 0;
  // Grid layout on XZ so multi-select doesn't stack
  const col = i % 6;
  const row = Math.floor(i / 6);
  const x = layout.x ?? (col - 2.5) * 3.5;
  const z = layout.z ?? row * 3.5;
  const scale = layout.scale ?? 1;
  const kind = String(m.kind || m.category || '').toLowerCase();
  const isChar = /character|hero|npc|race|grudge6|modular/.test(kind + name);
  const isMap = /map|island|terrain|world|scene/.test(kind + name);

  return {
    id: entId(),
    name: safeName(name),
    type: 'model',
    model: {
      url,
      // pipeline provenance for inspector / AI
      pipelineUuid: m.grudgeUuid || m.uuid || null,
      r2Key: r2KeyOf(m) || m.path || null,
      source: m.source || 'pipeline',
    },
    transform: {
      position: [x, isMap ? 0 : 0, z],
      rotation: [0, 0, 0],
      scale: isMap ? [scale * 4, scale * 4, scale * 4] : [scale, scale, scale],
    },
    parentId: null,
    layer: isChar ? 'NPC' : isMap ? 'Terrain' : 'Default',
    surface: isMap ? 'Walk' : 'None',
    physics: isMap
      ? {
          bodyType: 'fixed',
          colliderType: 'cuboid',
          mass: 0,
          restitution: 0.05,
          friction: 0.9,
        }
      : isChar
        ? {
            bodyType: 'kinematicPosition',
            colliderType: 'cylinder',
            mass: 1,
            restitution: 0.1,
            friction: 0.7,
          }
        : {
            bodyType: 'fixed',
            colliderType: 'cuboid',
            mass: 0,
            restitution: 0.05,
            friction: 0.8,
          },
  };
}

/** Default ground plane so scenes are walkable. */
export function groundEntity() {
  return {
    id: entId(),
    name: 'Ground',
    type: 'plane',
    transform: {
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [80, 80, 1],
    },
    parentId: null,
    material: { color: '#2a3530', metalness: 0, roughness: 1 },
    physics: {
      bodyType: 'fixed',
      colliderType: 'cuboid',
      mass: 0,
      restitution: 0.2,
      friction: 1,
    },
    layer: 'Terrain',
    surface: 'Walk',
  };
}

/** Ambient + sun stand-ins as light entities */
export function defaultLights() {
  return [
    {
      id: entId(),
      name: 'Sun',
      type: 'light',
      transform: { position: [40, 60, 20], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parentId: null,
      light: { kind: 'directional', color: '#fff2dd', intensity: 1.2 },
    },
    {
      id: entId(),
      name: 'Fill',
      type: 'light',
      transform: { position: [-20, 20, -30], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parentId: null,
      light: { kind: 'point', color: '#88aadd', intensity: 40, distance: 120 },
    },
  ];
}

/**
 * Starter scripts attachable in Forge (PlayScriptRuntime / AI).
 * Not auto-bound until user assigns; included for pack completeness.
 */
export function defaultPipelineScripts(sceneName) {
  return [
    {
      id: `scr-${entId()}`,
      name: 'pipeline_spin',
      language: 'js',
      description: 'Slow Y-spin for props (assign to entity in Forge)',
      code: `// Pipeline starter — spin entity on Y
exports.start = function (ctx) {
  ctx.state.t = 0;
};
exports.update = function (ctx) {
  ctx.state.t += ctx.time.dt;
  if (ctx.entity && ctx.entity.rotation) {
    ctx.entity.rotation.y = ctx.state.t * 0.4;
  }
};
`,
    },
    {
      id: `scr-${entId()}`,
      name: 'pipeline_bob',
      language: 'js',
      description: 'Idle bob for characters / lanterns',
      code: `// Pipeline starter — vertical bob
exports.start = function (ctx) {
  ctx.state.baseY = ctx.entity?.position?.y ?? 0;
  ctx.state.t = Math.random() * Math.PI * 2;
};
exports.update = function (ctx) {
  ctx.state.t += ctx.time.dt;
  if (ctx.entity && ctx.entity.position) {
    ctx.entity.position.y = ctx.state.baseY + Math.sin(ctx.state.t * 2) * 0.08;
  }
};
`,
    },
    {
      id: `scr-${entId()}`,
      name: 'pipeline_scene_boot',
      language: 'js',
      description: `Boot log for ${sceneName}`,
      code: `// Pipeline scene boot
exports.start = function (ctx) {
  ctx.log?.('Pipeline scene ready: ${String(sceneName).replace(/'/g, '')}');
};
exports.update = function () {};
`,
    },
  ];
}

/**
 * Build a full Forge pack from catalog entries.
 * @param {object[]} assets
 * @param {{ name?: string, includeGround?: boolean, includeLights?: boolean, includeScripts?: boolean }} opts
 */
export function buildForgeScenePack(assets, opts = {}) {
  const list = (assets || []).filter(Boolean);
  const name = opts.name || `pipeline-scene-${new Date().toISOString().slice(0, 10)}`;
  const entities = [];
  if (opts.includeGround !== false) entities.push(groundEntity());
  if (opts.includeLights !== false) entities.push(...defaultLights());

  list.forEach((m, index) => {
    entities.push(assetToEntity(m, { index }));
  });

  const assetManifest = list.map((m) => ({
    name: m.name || m.path,
    url: cdnUrlOf(m) || m.cdnUrl || null,
    r2Key: r2KeyOf(m) || m.path || null,
    grudgeUuid: m.grudgeUuid || m.uuid || null,
    kind: m.kind || m.category || null,
    source: m.source || null,
  }));

  const scripts =
    opts.includeScripts === false ? [] : defaultPipelineScripts(name);

  /** Canonical Forge SceneData (+ pack extras) */
  const sceneData = {
    entities,
    environment: {
      skyColor: '#9ec8e8',
      groundColor: '#2a3530',
      ambientIntensity: 0.45,
      sunIntensity: 1.1,
      gravity: [0, -9.81, 0],
      cameraMode: 'orbit',
      // pipeline pack metadata (ignored by core renderer, useful for AI)
      pipeline: {
        version: PACK_VERSION,
        from: FLEET_HOSTS.pipeline,
        exportedAt: new Date().toISOString(),
        assetCount: list.length,
      },
    },
  };

  return {
    version: PACK_VERSION,
    format: 'grudge-forge-pack',
    name,
    /** Drop this into Forge File → Import / drop zone */
    scene: sceneData,
    /** Alias for tools that expect top-level entities */
    entities: sceneData.entities,
    environment: sceneData.environment,
    scripts,
    assets: assetManifest,
    forge: {
      openUrl: `${FLEET_HOSTS.forge}/?edit=1&from=pipeline&awaitImport=1`,
      importHint:
        'Open Forge → File → Import .gfscene.json, or use Open in Forge (postMessage).',
    },
  };
}

/** Download pack as .gfscene.json (Forge import accepts entities array). */
export function downloadForgeScenePack(pack) {
  const sceneOnly = {
    entities: pack.scene?.entities || pack.entities,
    environment: pack.scene?.environment || pack.environment,
  };
  // Embed scripts + assets as non-breaking extras Forge can ignore
  const payload = {
    ...sceneOnly,
    _pipelinePack: {
      version: pack.version,
      name: pack.name,
      scripts: pack.scripts,
      assets: pack.assets,
      format: pack.format,
    },
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(pack.name)}.gfscene.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}

/**
 * Open Forge and post the pack when the editor is ready.
 * Falls back to download if popup blocked.
 */
export function openForgeWithScenePack(pack, opts = {}) {
  const forgeOrigin = new URL(FLEET_HOSTS.forge).origin;
  const href = forgeDeepLink({
    workspace: 'builder',
    scene: pack.name, // name only — scene JSON arrives via postMessage
    source: 'pipeline-pack',
    edit: true,
    awaitImport: true,
  });
  const u = new URL(href);

  const w = window.open(u.toString(), '_blank', 'noopener,noreferrer');
  if (!w) {
    downloadForgeScenePack(pack);
    return { ok: false, reason: 'popup_blocked', downloaded: true };
  }

  const payload = {
    type: 'grudge:pipeline:import-scene',
    version: PACK_VERSION,
    pack: {
      name: pack.name,
      scene: {
        entities: pack.scene?.entities || pack.entities,
        environment: pack.scene?.environment || pack.environment,
      },
      scripts: pack.scripts || [],
      assets: pack.assets || [],
    },
  };

  let tries = 0;
  const maxTries = 40;
  const timer = setInterval(() => {
    tries += 1;
    try {
      w.postMessage(payload, forgeOrigin);
    } catch {
      /* ignore */
    }
    if (tries >= maxTries) clearInterval(timer);
  }, 500);

  // Also listen for forge-ready ack
  const onMsg = (ev) => {
    if (ev.origin !== forgeOrigin) return;
    if (ev.data?.type === 'grudge:forge:ready' || ev.data?.type === 'grudge:forge:import-ack') {
      try {
        w.postMessage(payload, forgeOrigin);
      } catch {
        /* */
      }
      clearInterval(timer);
      window.removeEventListener('message', onMsg);
    }
  };
  window.addEventListener('message', onMsg);
  // Cleanup after 30s
  setTimeout(() => {
    clearInterval(timer);
    window.removeEventListener('message', onMsg);
  }, 30000);

  if (opts.alsoDownload) downloadForgeScenePack(pack);
  return { ok: true, href: u.toString() };
}

/** Scene cart helpers (localStorage) */
const CART_KEY = 'grudge_pipeline_scene_cart';

export function loadSceneCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveSceneCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items.slice(0, 48)));
  } catch {
    /* */
  }
}

export function addToSceneCart(entry) {
  const cart = loadSceneCart();
  const url = cdnUrlOf(entry) || entry.cdnUrl || entry.path;
  if (!url) return cart;
  if (cart.some((c) => (cdnUrlOf(c) || c.cdnUrl || c.path) === url)) return cart;
  cart.push({
    name: entry.name || entry.path,
    cdnUrl: cdnUrlOf(entry) || entry.cdnUrl,
    path: r2KeyOf(entry) || entry.path,
    grudgeUuid: entry.grudgeUuid || entry.uuid,
    kind: entry.kind || entry.category,
    source: entry.source,
  });
  saveSceneCart(cart);
  return cart;
}

export function clearSceneCart() {
  saveSceneCart([]);
  return [];
}
