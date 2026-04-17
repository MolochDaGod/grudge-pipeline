/**
 * validate.mjs — GLB Validation & Registry Generation
 * Reads every optimized GLB, extracts stats, generates models registry.
 */
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { OPTIMIZED_DIR, ROOT } from './config.mjs';
import { walkDir, ensureDir, fileSizeKB, md5, log, err, vlog } from './utils.mjs';

async function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

export async function runValidate({ dryRun = false, verbose = false } = {}) {
  log('═══ VALIDATE & REGISTRY ═══');

  const allGlbs = walkDir(OPTIMIZED_DIR, new Set(['.glb']));
  log(`Found ${allGlbs.length} optimized GLBs to validate`);

  const io = await createIO();
  const models = [];
  const errors = [];
  const stats = { validated: 0, errors: 0 };

  for (const glbPath of allGlbs) {
    const baseName = path.basename(glbPath, '.glb');
    const relPath = path.relative(ROOT, glbPath).replace(/\\/g, '/');
    const rel = path.relative(OPTIMIZED_DIR, glbPath).replace(/\\/g, '/');
    const parts = rel.split('/');
    const category = parts.length > 1 ? parts[0] : 'uncategorized';

    if (dryRun) { stats.validated++; continue; }

    try {
      const doc = await io.read(glbPath);
      const root = doc.getRoot();

      const extensions = root.listExtensionsUsed().map(e => e.extensionName);

      models.push({
        name: baseName + '.glb',
        format: 'GLB',
        path: relPath,
        category,
        sizeKB: fileSizeKB(glbPath),
        checksum: md5(glbPath),
        pipelineVersion: '1.0.0',
        compressionType: extensions.includes('KHR_draco_mesh_compression') ? 'draco' : 'none',
        meshes: root.listMeshes().length,
        nodes: root.listNodes().length,
        textures: root.listTextures().length,
        animations: root.listAnimations().length,
        materials: root.listMaterials().length,
        extensions,
      });

      stats.validated++;
      vlog(`${baseName}: OK`, verbose);
      process.stdout.write('V');
    } catch (e) {
      errors.push({ file: relPath, error: e.message });
      err(`Validation failed: ${baseName} — ${e.message}`);
      stats.errors++;
      process.stdout.write('E');
    }
  }

  console.log('');

  models.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  // Category and format summaries
  const byCategory = {};
  const byFormat = { GLB: models.length };
  for (const m of models) byCategory[m.category] = (byCategory[m.category] || 0) + 1;

  // Write pipeline-models.json registry
  const registryDir = path.join(ROOT, 'web', 'api');
  ensureDir(registryDir);

  const registry = {
    version: '2.0.0',
    pipelineVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalModels: models.length,
    byFormat,
    byCategory,
    models,
  };
  fs.writeFileSync(path.join(registryDir, 'pipeline-models.json'), JSON.stringify(registry, null, 2));

  // Write manifest (checksums for cache busting)
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalAssets: models.length,
    totalSizeKB: models.reduce((sum, m) => sum + m.sizeKB, 0),
    assets: models.map(m => ({ path: m.path, checksum: m.checksum, sizeKB: m.sizeKB, category: m.category })),
  };
  fs.writeFileSync(path.join(registryDir, 'pipeline-manifest.json'), JSON.stringify(manifest, null, 2));

  if (errors.length > 0) {
    log(`Validation errors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  ✖ ${e.file}: ${e.error}`);
  }

  log(`Validated: ${stats.validated} | Errors: ${stats.errors}`);
  log(`Registry: web/api/pipeline-models.json (${models.length} models)`);
  return stats;
}
