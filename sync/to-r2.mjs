#!/usr/bin/env node
/**
 * to-r2.mjs — Upload optimized models to Cloudflare R2
 * Uses wrangler CLI for R2 object puts.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { OPTIMIZED_DIR, R2_BUCKET, R2_PREFIX } from '../pipeline/config.mjs';
import { walkDir, log, err, fileSizeKB } from '../pipeline/utils.mjs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  log('═══ SYNC TO R2 CDN ═══');

  const glbFiles = walkDir(OPTIMIZED_DIR, new Set(['.glb']));
  log(`Found ${glbFiles.length} GLBs to upload`);

  let uploaded = 0, errors = 0;

  for (const src of glbFiles) {
    const rel = path.relative(OPTIMIZED_DIR, src).replace(/\\/g, '/');
    const r2Key = `${R2_PREFIX}/${rel}`;

    if (dryRun) {
      log(`DRY: Would upload ${rel} → ${r2Key}`);
      uploaded++;
      continue;
    }

    try {
      execSync(`wrangler r2 object put ${R2_BUCKET}/${r2Key} --file="${src}" --content-type="model/gltf-binary"`, {
        stdio: 'pipe',
        timeout: 60000,
      });
      uploaded++;
      process.stdout.write('U');
    } catch (e) {
      err(`Upload failed: ${rel} — ${e.message}`);
      errors++;
      process.stdout.write('E');
    }
  }

  console.log('');
  log(`Uploaded: ${uploaded} | Errors: ${errors}`);
  log(`R2 base: https://assets.grudge-studio.com/${R2_PREFIX}/`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
