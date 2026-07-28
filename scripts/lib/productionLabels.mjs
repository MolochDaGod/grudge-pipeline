/**
 * Production cloud labels — what every R2 object should carry for best-practice inventory.
 *
 * Labels map to:
 *  - Pipeline browser catalog fields (kind, textureStatus, productionBaked, …)
 *  - D1 asset_registry.animation_packs JSON (metadata bag)
 *  - R2 custom metadata (when S3 put available)
 */
import path from 'node:path';
import { grudgeUuidFromR2Key, normalizeR2Key } from './grudgeUuid.mjs';
import { inferProjectileSubtype } from '../../web/js/projectileVfx.js';

/** Allowed AssetKind values (align deployChecks). */
export const LABEL_KINDS = [
  'character',
  'creature',
  'weapon',
  'projectile',
  'prop',
  'buildable',
  'building',
  'boat',
  'vehicle',
  'island',
  'town',
  'environment',
  'harvest',
  'animation',
  'vfx',
  'ui',
  'audio',
  'other',
];

/**
 * Infer kind from r2Key / name (subset — full logic in deployChecks for browser).
 * @param {string} r2Key
 * @param {string} [name]
 */
export function inferKindFromKey(r2Key, name = '') {
  const c = `${r2Key} ${name}`.toLowerCase();
  if (c.includes('/vfx/') || c.includes('status-magic') || c.includes('warning_')) return 'vfx';
  if (
    c.includes('arrow') ||
    c.includes('projectile') ||
    c.includes('cannonball') ||
    c.includes('bullet') ||
    c.includes('grenade') ||
    c.includes('shell_')
  ) {
    return 'projectile';
  }
  if (c.includes('grudge6') || c.includes('_characters')) return 'character';
  if (c.includes('/creatures/')) return 'creature';
  if (c.includes('harvest') || c.includes('ore_node') || c.includes('commontree')) return 'harvest';
  if (c.includes('/audio/') || c.endsWith('.mp3') || c.endsWith('.ogg')) return 'audio';
  if (c.includes('airship') || c.includes('boat') || c.includes('ship')) return 'boat';
  if (c.includes('weapon') || c.includes('/bow/') || c.includes('sword')) return 'weapon';
  if (c.includes('building') || c.includes('tower')) return 'building';
  if (c.includes('nature') || c.includes('environment')) return 'environment';
  return 'other';
}

/**
 * Build full production label record for an asset about to ship / already on R2.
 * @param {object} opts
 */
export function buildProductionLabel(opts) {
  const r2Key = normalizeR2Key(opts.r2Key);
  const name = opts.name || path.basename(r2Key).replace(/\.[^.]+$/, '');
  const kind = opts.kind || inferKindFromKey(r2Key, name);
  const subtype =
    opts.subtype ||
    (kind === 'projectile' || kind === 'vfx'
      ? inferProjectileSubtype({ path: r2Key, name, kind })
      : null);

  const inspect = opts.inspect || null;
  const gate = opts.gate || null;

  const label = {
    schema: 'grudge.production-label/v1',
    r2Key,
    grudgeUuid: opts.grudgeUuid || grudgeUuidFromR2Key(r2Key),
    name,
    kind,
    subtype: subtype && subtype !== 'generic' ? subtype : opts.subtype || null,
    category: opts.category || kind,
    group: opts.group || path.dirname(r2Key).split('/').slice(-1)[0] || 'root',
    format: opts.format || (r2Key.endsWith('.glb') ? 'glb' : path.extname(r2Key).slice(1) || 'bin'),
    /** Hard production flags */
    productionBaked: opts.productionBaked !== false,
    bakePipeline: opts.bakePipeline || (r2Key.endsWith('.glb') ? 'glb2glb|staged' : 'source'),
    deployReady: gate ? !!gate.ready : opts.deployReady !== false,
    scaleBaked: opts.scaleBaked ?? kind !== 'character', // characters often need runtime SI gate too
    scaleProfile: opts.scaleProfile || kind,
    textureStatus: opts.textureStatus || inspect?.textureStatus || 'unknown',
    meshes: opts.meshes ?? inspect?.meshes ?? null,
    materials: opts.materials ?? inspect?.materials ?? null,
    textures: opts.textures ?? inspect?.textures ?? inspect?.images ?? null,
    animations: opts.animations ?? inspect?.animations ?? 0,
    fileSize: opts.fileSize ?? inspect?.bytes ?? null,
    physicsLayer: opts.physicsLayer || defaultPhysicsLayer(kind, subtype),
    labels: unique([
      'production',
      'cdn',
      kind,
      subtype,
      inspect?.textureStatus,
      ...(opts.tags || []),
    ].filter(Boolean)),
    notes: opts.notes || null,
    sourceLocal: opts.sourceLocal || null,
    cdnUrl: `https://assets.grudge-studio.com/${r2Key}`,
    inspectScore: gate?.score ?? opts.inspectScore ?? null,
    gateIssues: gate?.issues || [],
    gateWarnings: gate?.warnings || [],
    updatedAt: new Date().toISOString(),
  };

  return label;
}

function defaultPhysicsLayer(kind, subtype) {
  if (kind === 'projectile') return 'Projectile';
  if (kind === 'vfx' || subtype === 'trail' || subtype === 'impact') return 'IgnoreRaycast';
  if (kind === 'character') return 'Player';
  if (kind === 'creature') return 'NPC';
  if (kind === 'boat') return 'Default';
  return 'Default';
}

function unique(arr) {
  return [...new Set(arr)];
}

/**
 * D1 animation_packs JSON column payload (metadata bag).
 * @param {ReturnType<typeof buildProductionLabel>} label
 */
export function d1MetadataJson(label) {
  return {
    version: 1,
    production: true,
    kind: label.kind,
    subtype: label.subtype,
    textureStatus: label.textureStatus,
    bakePipeline: label.bakePipeline,
    productionBaked: label.productionBaked,
    deployReady: label.deployReady,
    scaleProfile: label.scaleProfile,
    physicsLayer: label.physicsLayer,
    labels: label.labels,
    meshes: label.meshes,
    materials: label.materials,
    textures: label.textures,
    inspectScore: label.inspectScore,
  };
}
