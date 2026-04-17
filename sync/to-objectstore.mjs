#!/usr/bin/env node
/**
 * to-objectstore.mjs — Sync processed GLBs to ObjectStore
 * Copies optimized models into ObjectStore/models/_optimized/
 * and regenerates the models3d.json registry.
 */
import fs from 'fs';
import path from 'path';
import { OPTIMIZED_DIR, OBJECTSTORE_MODELS, OBJECTSTORE_API } from '../pipeline/config.mjs';
import { walkDir, ensureDir, log, fileSizeKB, md5 } from '../pipeline/utils.mjs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  log('═══ SYNC TO OBJECTSTORE ═══');

  const glbFiles = walkDir(OPTIMIZED_DIR, new Set(['.glb']));
  log(`Found ${glbFiles.length} optimized GLBs to sync`);

  const destBase = path.join(OBJECTSTORE_MODELS, '_optimized');
  ensureDir(destBase);

  let copied = 0, skipped = 0;

  for (const src of glbFiles) {
    const rel = path.relative(OPTIMIZED_DIR, src).replace(/\\/g, '/');
    const dest = path.join(destBase, rel);

    // Skip if dest is newer or same
    if (fs.existsSync(dest)) {
      const srcMtime = fs.statSync(src).mtimeMs;
      const destMtime = fs.statSync(dest).mtimeMs;
      if (destMtime >= srcMtime) { skipped++; continue; }
    }

    ensureDir(path.dirname(dest));

    if (dryRun) {
      log(`DRY: Would copy ${rel}`);
      copied++;
      continue;
    }

    fs.copyFileSync(src, dest);
    copied++;
    process.stdout.write('.');
  }

  console.log('');
  log(`Copied: ${copied} | Skipped: ${skipped}`);

  if (!dryRun) {
    log('Run "node scripts/generate-models3d.js" in ObjectStore to regenerate registry.');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
