/**
 * avatar.mjs — Grudge Avatar Processing Pipeline
 *
 * Based on gltf-avatar-threejs (https://github.com/shrekshao/gltf-avatar-threejs)
 * Detects skeleton models, identifies skins/equipment, generates gl_avatar metadata.
 *
 * Avatar Spec:
 * - "skeleton" files contain the base rig (65-joint Mixamo standard) + body mesh
 * - "skin" files contain equipment (armor, weapons, hair) with linkedSkeletons
 * - bodyIdLUT texture maps body regions for per-pixel visibility control
 * - Rigid-bind nodes attach weapons to hand/shield containers
 */
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import {
  OPTIMIZED_DIR, MIXAMO_BONE_NAMES, BONE_CONTAINERS,
} from './config.mjs';
import { walkDir, ensureDir, log, err, vlog } from './utils.mjs';

async function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

/**
 * Detect if a GLB has a Mixamo-compatible skeleton
 */
function detectSkeleton(doc) {
  const nodes = doc.getRoot().listNodes();
  const nodeNames = nodes.map(n => n.getName());

  // Count matching Mixamo bone names
  const matchCount = MIXAMO_BONE_NAMES.filter(bone =>
    nodeNames.some(n => n.includes(bone) || n.includes(`mixamorig:${bone}`))
  ).length;

  const isMixamo = matchCount >= 10; // At least 10 of the core bones
  const jointCount = nodes.filter(n => {
    // Nodes used by any skin are joints
    const skins = doc.getRoot().listSkins();
    return skins.some(s => s.listJoints().includes(n));
  }).length;

  return { isMixamo, matchCount, jointCount, nodeNames };
}

/**
 * Detect equipment/skin meshes that could be split into separate skin files
 */
function detectEquipment(doc) {
  const meshes = doc.getRoot().listMeshes();
  const equipment = [];

  // Race prefixes from Grudge character system
  const racePrefixes = ['WK_', 'BRB_', 'ELF_', 'DWF_', 'ORC_', 'UD_'];
  const equipTypes = ['helm', 'chest', 'boots', 'gloves', 'shoulder', 'belt',
    'cape', 'weapon', 'shield', 'hair', 'beard', 'body'];

  for (const mesh of meshes) {
    const name = mesh.getName().toLowerCase();
    const detected = {
      name: mesh.getName(),
      meshIndex: meshes.indexOf(mesh),
      race: racePrefixes.find(p => name.startsWith(p.toLowerCase())) || null,
      equipSlot: equipTypes.find(t => name.includes(t)) || 'body',
      primitiveCount: mesh.listPrimitives().length,
      isSkinned: false,
    };

    // Check if mesh has skin weights (is it skinned?)
    for (const prim of mesh.listPrimitives()) {
      if (prim.getAttribute('JOINTS_0')) {
        detected.isSkinned = true;
        break;
      }
    }

    equipment.push(detected);
  }

  return equipment;
}

/**
 * Detect bone containers for weapon attachment
 */
function detectBoneContainers(doc) {
  const nodes = doc.getRoot().listNodes();
  const containers = {};

  for (const [key, boneName] of Object.entries(BONE_CONTAINERS)) {
    const found = nodes.find(n =>
      n.getName() === boneName || n.getName().includes(boneName)
    );
    containers[key] = found ? { name: found.getName(), found: true } : { name: boneName, found: false };
  }

  return containers;
}

/**
 * Generate avatar metadata for a GLB file (non-destructive analysis)
 */
async function analyzeAvatar(io, glbPath) {
  const doc = await io.read(glbPath);
  const skeleton = detectSkeleton(doc);
  const equipment = detectEquipment(doc);
  const containers = detectBoneContainers(doc);
  const skins = doc.getRoot().listSkins();
  const animations = doc.getRoot().listAnimations();

  return {
    file: path.basename(glbPath),
    path: glbPath,
    skeleton: {
      isMixamo: skeleton.isMixamo,
      boneMatchCount: skeleton.matchCount,
      jointCount: skeleton.jointCount,
      hasSkin: skins.length > 0,
      skinCount: skins.length,
    },
    equipment,
    boneContainers: containers,
    animations: animations.map(a => ({
      name: a.getName() || 'unnamed',
      channelCount: a.listChannels().length,
    })),
    avatarType: skeleton.isMixamo ? 'skeleton' : (skins.length > 0 ? 'skin' : 'static'),
  };
}

export async function runAvatar({ dryRun = false, categoryFilter = null, verbose = false } = {}) {
  log('═══ AVATAR: Skeleton/Skin Analysis ═══');

  const io = await createIO();

  // Scan character models in _optimized
  const charDir = path.join(OPTIMIZED_DIR, 'characters-models');
  const glbFiles = [];

  // Also check other character-related directories
  for (const dir of [charDir, path.join(OPTIMIZED_DIR, 'characters'), OPTIMIZED_DIR]) {
    if (fs.existsSync(dir)) {
      glbFiles.push(...walkDir(dir, new Set(['.glb'])));
    }
  }

  // Deduplicate
  const unique = [...new Set(glbFiles)];
  log(`Found ${unique.length} GLBs to analyze for avatar compatibility`);

  const stats = { analyzed: 0, skeletons: 0, skins: 0, static: 0, errors: 0 };
  const avatarRegistry = [];

  for (const glbPath of unique) {
    if (dryRun) {
      log(`DRY: Would analyze ${path.basename(glbPath)}`);
      stats.analyzed++;
      continue;
    }

    try {
      const result = await analyzeAvatar(io, glbPath);
      avatarRegistry.push(result);

      if (result.avatarType === 'skeleton') stats.skeletons++;
      else if (result.avatarType === 'skin') stats.skins++;
      else stats.static++;

      stats.analyzed++;
      vlog(`${result.file}: ${result.avatarType} (${result.skeleton.jointCount} joints, ${result.equipment.length} meshes)`, verbose);
      process.stdout.write(result.avatarType === 'skeleton' ? 'S' : result.avatarType === 'skin' ? 'K' : '.');
    } catch (e) {
      err(`Avatar analysis failed: ${path.basename(glbPath)} — ${e.message}`);
      stats.errors++;
      process.stdout.write('E');
    }
  }

  console.log('');

  // Write avatar registry
  const registryPath = path.join(OPTIMIZED_DIR, 'avatar-registry.json');
  ensureDir(path.dirname(registryPath));
  const registry = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalModels: avatarRegistry.length,
    skeletons: stats.skeletons,
    skins: stats.skins,
    staticModels: stats.static,
    models: avatarRegistry,
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  log(`Analyzed: ${stats.analyzed} | Skeletons: ${stats.skeletons} | Skins: ${stats.skins} | Static: ${stats.static}`);
  log(`Registry: ${registryPath}`);
  return stats;
}
