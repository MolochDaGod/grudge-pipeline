/**
 * optimize.mjs — GLB Optimization Pipeline
 * Dedup, weld, compress (Draco), texture resize, quantize.
 *
 * This is the web pack stage after convert. For **character SI height + colliders**,
 * prefer ObjectStore grudge-convert **glb2glb** (`--height 1.8 --texture-size 1024`)
 * then optional Draco here. Production goal: textured · meshed · scaled · deploy GLB.
 * @see docs/PRODUCTION_BAKE.md
 */
import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, prune, quantize, draco, weld, resample } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import {
  CONVERTED_DIR, OPTIMIZED_DIR, ORGANIZED_DIR,
  GLTF_EXTENSIONS, MAX_TEXTURE_SIZE, DRACO_CONFIG,
} from './config.mjs';
import { walkDir, ensureDir, isNewer, fileSizeKB, log, err, vlog, getCategory } from './utils.mjs';

async function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

export async function runOptimize({ dryRun = false, categoryFilter = null, verbose = false } = {}) {
  log('═══ OPTIMIZE: Dedup, compress, pack ═══');
  ensureDir(OPTIMIZED_DIR);

  const io = await createIO();

  // Gather GLBs from _converted + any raw GLBs in _organized
  const glbFiles = [
    ...walkDir(CONVERTED_DIR, GLTF_EXTENSIONS),
    ...walkDir(ORGANIZED_DIR, GLTF_EXTENSIONS),
  ];

  // Deduplicate by basename (prefer _converted version)
  const seen = new Map();
  for (const f of glbFiles) {
    const key = path.basename(f).toLowerCase();
    if (!seen.has(key) || f.includes('_converted')) seen.set(key, f);
  }
  const uniqueFiles = [...seen.values()];
  log(`Found ${uniqueFiles.length} unique GLB/GLTF files to optimize`);

  const stats = { optimized: 0, skipped: 0, errors: 0, savedBytes: 0 };

  for (const srcPath of uniqueFiles) {
    const baseName = path.basename(srcPath, path.extname(srcPath));

    // Determine category
    let category = 'uncategorized';
    if (srcPath.startsWith(CONVERTED_DIR)) {
      const rel = path.relative(CONVERTED_DIR, srcPath);
      category = rel.split(/[/\\]/)[0];
    } else if (srcPath.startsWith(ORGANIZED_DIR)) {
      const rel = path.relative(ORGANIZED_DIR, srcPath);
      category = getCategory(rel);
    }

    if (categoryFilter && !category.includes(categoryFilter)) continue;

    const outDir = path.join(OPTIMIZED_DIR, category);
    const outPath = path.join(outDir, `${baseName}.glb`);

    if (!isNewer(srcPath, outPath)) {
      stats.skipped++;
      vlog(`SKIP: ${baseName}`, verbose);
      continue;
    }

    ensureDir(outDir);
    if (dryRun) { log(`DRY: ${baseName}`); stats.optimized++; continue; }

    try {
      const doc = await io.read(srcPath);
      const origSize = fileSizeKB(srcPath);

      await doc.transform(weld(), dedup(), flatten(), prune(), resample());

      // Resize oversized textures
      for (const tex of doc.getRoot().listTextures()) {
        const img = tex.getImage();
        if (!img) continue;
        try {
          const meta = await sharp(img).metadata();
          if (meta.width > MAX_TEXTURE_SIZE || meta.height > MAX_TEXTURE_SIZE) {
            const resized = await sharp(img)
              .resize(MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE, { fit: 'inside', withoutEnlargement: true })
              .png({ quality: 85 })
              .toBuffer();
            tex.setImage(resized).setMimeType('image/png');
          }
        } catch { /* some textures not parseable */ }
      }

      await doc.transform(quantize(), draco(DRACO_CONFIG));
      await io.write(outPath, doc);

      const newSize = fileSizeKB(outPath);
      stats.savedBytes += Math.max(0, (origSize - newSize) * 1024);
      stats.optimized++;
      vlog(`${baseName}: ${origSize}KB → ${newSize}KB`, verbose);
      process.stdout.write('O');
    } catch (e) {
      err(`Optimize failed: ${baseName} — ${e.message}`);
      stats.errors++;
      process.stdout.write('E');
    }
  }

  console.log('');
  log(`Optimized: ${stats.optimized} | Saved: ${(stats.savedBytes / 1024 / 1024).toFixed(1)} MB`);
  return stats;
}
