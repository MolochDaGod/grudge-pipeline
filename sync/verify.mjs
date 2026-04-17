#!/usr/bin/env node
/**
 * verify.mjs — Verify R2 assets match local pipeline manifest
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'web', 'api', 'pipeline-manifest.json');

async function main() {
  console.log('[verify] Checking pipeline manifest...');

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[verify] No manifest found. Run pipeline validate first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`[verify] Manifest: ${manifest.totalAssets} assets, ${manifest.totalSizeKB} KB`);

  let missing = 0;
  for (const asset of manifest.assets) {
    const fullPath = path.join(ROOT, asset.path);
    if (!fs.existsSync(fullPath)) {
      console.log(`  MISSING: ${asset.path}`);
      missing++;
    }
  }

  if (missing === 0) {
    console.log(`[verify] All ${manifest.totalAssets} assets present locally.`);
  } else {
    console.log(`[verify] ${missing} assets missing locally.`);
  }

  console.log('[verify] To verify R2, run: wrangler r2 object list grudge-assets --prefix=models/');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
