/**
 * Lightweight GLB production inspection (no Three.js).
 * Reads glTF binary JSON + optional BIN for mesh/texture/material signals.
 */
import fs from 'node:fs';

const GLB_MAGIC = 0x46546c67; // 'glTF'

/**
 * @param {string} filePath
 * @returns {{
 *   ok: boolean,
 *   format: 'glb'|'unknown',
 *   bytes: number,
 *   magicOk: boolean,
 *   meshes: number,
 *   primitives: number,
 *   materials: number,
 *   textures: number,
 *   images: number,
 *   accessors: number,
 *   nodes: number,
 *   animations: number,
 *   hasEmbeddedImages: boolean,
 *   hasVertexColor: boolean,
 *   textureStatus: 'embedded'|'vertex-color'|'none'|'unknown',
 *   generator: string|null,
 *   errors: string[],
 * }}
 */
export function inspectGlb(filePath) {
  const errors = [];
  const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  const empty = {
    ok: false,
    format: 'unknown',
    bytes,
    magicOk: false,
    meshes: 0,
    primitives: 0,
    materials: 0,
    textures: 0,
    images: 0,
    accessors: 0,
    nodes: 0,
    animations: 0,
    hasEmbeddedImages: false,
    hasVertexColor: false,
    textureStatus: 'unknown',
    generator: null,
    errors,
  };

  if (!bytes) {
    errors.push('missing-or-empty');
    return empty;
  }

  const buf = fs.readFileSync(filePath);
  if (buf.length < 20) {
    errors.push('too-small');
    return empty;
  }

  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const magicOk = magic === GLB_MAGIC && version === 2;
  if (!magicOk) {
    errors.push('not-glb-v2');
    return { ...empty, magicOk: false };
  }

  let json = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLen > buf.length) break;
    // 0x4E4F534A = JSON
    if (chunkType === 0x4e4f534a) {
      const text = buf.subarray(offset, offset + chunkLen).toString('utf8').replace(/\0+$/g, '');
      try {
        json = JSON.parse(text);
      } catch {
        errors.push('json-parse-fail');
      }
      break;
    }
    offset += chunkLen;
  }

  if (!json) {
    errors.push('no-json-chunk');
    return { ...empty, magicOk: true, format: 'glb' };
  }

  const meshes = Array.isArray(json.meshes) ? json.meshes.length : 0;
  let primitives = 0;
  let hasVertexColor = false;
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives || []) {
      primitives++;
      if (p.attributes && (p.attributes.COLOR_0 != null || p.attributes.COLOR != null)) {
        hasVertexColor = true;
      }
    }
  }

  const materials = Array.isArray(json.materials) ? json.materials.length : 0;
  const textures = Array.isArray(json.textures) ? json.textures.length : 0;
  const images = Array.isArray(json.images) ? json.images.length : 0;
  const accessors = Array.isArray(json.accessors) ? json.accessors.length : 0;
  const nodes = Array.isArray(json.nodes) ? json.nodes.length : 0;
  const animations = Array.isArray(json.animations) ? json.animations.length : 0;

  const hasEmbeddedImages = (json.images || []).some(
    (img) =>
      (typeof img.uri === 'string' && img.uri.startsWith('data:')) ||
      img.bufferView != null,
  );

  let textureStatus = 'none';
  if (images > 0 || textures > 0 || hasEmbeddedImages) textureStatus = 'embedded';
  else if (hasVertexColor) textureStatus = 'vertex-color';
  else if (materials > 0) textureStatus = 'none'; // materials without maps = often untextured

  const generator =
    (json.asset && (json.asset.generator || json.asset.copyright)) || null;

  const ok = magicOk && meshes > 0 && errors.length === 0;

  return {
    ok,
    format: 'glb',
    bytes,
    magicOk,
    meshes,
    primitives,
    materials,
    textures,
    images,
    accessors,
    nodes,
    animations,
    hasEmbeddedImages: hasEmbeddedImages || images > 0,
    hasVertexColor,
    textureStatus,
    generator: generator ? String(generator).slice(0, 120) : null,
    errors,
  };
}

/**
 * Production readiness gates for cloud storage.
 * @param {ReturnType<typeof inspectGlb>} inspect
 * @param {{ kind?: string, maxBytes?: number, requireTexture?: boolean }} opts
 */
export function productionGate(inspect, opts = {}) {
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024; // 25 MB web default
  const requireTexture = opts.requireTexture !== false;
  const issues = [];
  const warnings = [];

  if (!inspect.magicOk) issues.push('not_glb_v2');
  if (!inspect.meshes) issues.push('no_meshes');
  if (inspect.bytes > maxBytes) issues.push(`oversize_${inspect.bytes}`);
  if (requireTexture && inspect.textureStatus === 'none') {
    // VFX may be emissive-only / unlit without image maps — warn not hard fail for vfx
    if (opts.kind === 'vfx' || opts.kind === 'projectile') warnings.push('no_embedded_textures');
    else issues.push('untextured');
  }
  if (inspect.meshes > 0 && inspect.materials === 0 && opts.kind !== 'vfx') {
    warnings.push('no_materials');
  }

  return {
    ready: issues.length === 0,
    issues,
    warnings,
    score: scoreFromInspect(inspect, issues, warnings),
  };
}

function scoreFromInspect(inspect, issues, warnings) {
  let s = 0;
  if (inspect.magicOk) s += 25;
  if (inspect.meshes > 0) s += 20;
  if (inspect.textureStatus === 'embedded') s += 25;
  else if (inspect.textureStatus === 'vertex-color') s += 15;
  if (inspect.materials > 0) s += 10;
  if (inspect.bytes > 0 && inspect.bytes < 8 * 1024 * 1024) s += 10;
  if (inspect.bytes > 0 && inspect.bytes < 2 * 1024 * 1024) s += 5;
  s -= issues.length * 20;
  s -= warnings.length * 5;
  return Math.max(0, Math.min(100, s));
}
