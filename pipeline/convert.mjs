/**
 * convert.mjs — FBX/OBJ/DAE → GLB Conversion
 * Wraps FBX2glTF and obj2gltf for batch conversion.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  ORGANIZED_DIR, CONVERTED_DIR, FBX2GLTF_BIN,
  SOURCE_EXTENSIONS,
} from './config.mjs';
import { walkDir, ensureDir, isNewer, log, err, vlog } from './utils.mjs';

export async function runConvert({ dryRun = false, categoryFilter = null, verbose = false } = {}) {
  log('═══ CONVERT: FBX/OBJ/DAE → GLB ═══');
  ensureDir(CONVERTED_DIR);

  // Scan all organized category folders for source files
  const sourceFiles = [];
  if (fs.existsSync(ORGANIZED_DIR)) {
    sourceFiles.push(...walkDir(ORGANIZED_DIR, SOURCE_EXTENSIONS));
  }

  log(`Found ${sourceFiles.length} source files to convert`);

  const stats = { converted: 0, skipped: 0, errors: 0 };

  for (const srcPath of sourceFiles) {
    const ext = path.extname(srcPath).toLowerCase();
    const baseName = path.basename(srcPath, ext);

    // Derive category from organized folder structure
    const relToOrg = path.relative(ORGANIZED_DIR, srcPath);
    const topFolder = relToOrg.split(/[/\\]/)[0]; // e.g. "01_Characters_Models"
    const category = topFolder.replace(/^\d+_/, '').toLowerCase().replace(/\s+/g, '-');

    if (categoryFilter && !category.includes(categoryFilter)) continue;

    const outDir = path.join(CONVERTED_DIR, category);
    // Sanitize filename: replace spaces with hyphens, lowercase
    const safeName = baseName.replace(/\s+/g, '-').replace(/[^\w.-]/g, '').toLowerCase();
    const outPath = path.join(outDir, `${safeName}.glb`);

    if (!isNewer(srcPath, outPath)) {
      stats.skipped++;
      vlog(`SKIP (up-to-date): ${baseName}`, verbose);
      continue;
    }

    ensureDir(outDir);

    if (dryRun) {
      log(`DRY: Would convert ${baseName}${ext} → GLB`);
      stats.converted++;
      continue;
    }

    try {
      if (ext === '.fbx' || ext === '.dae') {
        if (!fs.existsSync(FBX2GLTF_BIN)) {
          err(`FBX2glTF not found at ${FBX2GLTF_BIN} — skipping ${baseName}`);
          continue;
        }
        const tmpOut = outPath.replace('.glb', '');
        execFileSync(FBX2GLTF_BIN, [
          '--binary', '--input', srcPath, '--output', tmpOut,
        ], { timeout: 120000, stdio: verbose ? 'inherit' : 'pipe' });

        const expectedGlb = tmpOut + '.glb';
        if (fs.existsSync(expectedGlb) && expectedGlb !== outPath) {
          fs.renameSync(expectedGlb, outPath);
        }
        if (fs.existsSync(outPath)) {
          stats.converted++;
          process.stdout.write('C');
        }
      } else if (ext === '.obj') {
        const obj2gltf = (await import('obj2gltf')).default;
        const glb = await obj2gltf(srcPath, { binary: true });
        fs.writeFileSync(outPath, glb);
        stats.converted++;
        process.stdout.write('C');
      }
    } catch (e) {
      err(`Convert failed: ${baseName}${ext} — ${e.message}`);
      stats.errors++;
      process.stdout.write('E');
    }
  }

  console.log('');
  log(`Converted: ${stats.converted} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`);
  return stats;
}
