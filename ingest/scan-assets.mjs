#!/usr/bin/env node
/**
 * scan-assets.mjs — Asset Inventory Scanner
 * Walks _organized folders, detects file types, generates inventory JSON.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORGANIZED = path.join(ROOT, 'attackmotion', '_organized');
const OUT = path.join(__dirname, 'attackmotion-inventory.json');

const EXT_CATEGORIES = {
  '3d_model':   ['.fbx', '.obj', '.dae', '.glb', '.gltf', '.blend'],
  'texture':    ['.png', '.jpg', '.jpeg', '.webp', '.tga', '.bmp', '.tif', '.tiff', '.psd'],
  'audio':      ['.wav', '.mp3', '.ogg', '.flac', '.aac'],
  'animation':  ['.anim', '.fbx'], // FBX can be both
  'document':   ['.txt', '.md', '.pdf', '.json', '.xml', '.html', '.css', '.js'],
  'unity':      ['.meta', '.unity', '.prefab', '.mat', '.asset', '.controller', '.anim'],
  'shader':     ['.shader', '.cginc', '.hlsl', '.glsl', '.wgsl'],
  'video':      ['.mp4', '.webm', '.avi', '.mov'],
};

function classifyExt(ext) {
  ext = ext.toLowerCase();
  for (const [cat, exts] of Object.entries(EXT_CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      let size = 0;
      try { size = fs.statSync(full).size; } catch {}
      results.push({
        name: entry.name,
        path: path.relative(ORGANIZED, full).replace(/\\/g, '/'),
        ext,
        type: classifyExt(ext),
        sizeBytes: size,
      });
    }
  }
  return results;
}

console.log('[scan] Scanning organized assets...');
const files = walkDir(ORGANIZED);

// Group by category folder
const byCategory = {};
const byType = {};
const byExt = {};
let totalSize = 0;

for (const f of files) {
  const cat = f.path.split('/')[0];
  byCategory[cat] = (byCategory[cat] || 0) + 1;
  byType[f.type] = (byType[f.type] || 0) + 1;
  byExt[f.ext] = (byExt[f.ext] || 0) + 1;
  totalSize += f.sizeBytes;
}

const inventory = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  totalFiles: files.length,
  totalSizeMB: Math.round(totalSize / 1024 / 1024),
  byCategory,
  byType,
  byExtension: byExt,
  files,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(inventory, null, 2));

console.log(`[scan] Total files: ${files.length}`);
console.log(`[scan] Total size: ${inventory.totalSizeMB} MB`);
console.log(`[scan] By type:`, JSON.stringify(byType));
console.log(`[scan] Written: ${OUT}`);
