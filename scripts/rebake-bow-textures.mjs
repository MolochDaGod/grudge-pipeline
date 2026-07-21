#!/usr/bin/env node
/**
 * Re-embed Texture_MAp_bow.png into weapon bow/arrow GLBs that still
 * carry the FBX2glTF 1×1 placeholder map.
 *
 * Usage:
 *   node scripts/rebake-bow-textures.mjs
 *   node scripts/rebake-bow-textures.mjs --dir F:/GitHub/ObjectStore/models/weapons/bow
 *   node scripts/rebake-bow-textures.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.find((a) => a.startsWith('--dir='))?.slice(6)
  || (args.includes('--dir') ? args[args.indexOf('--dir') + 1] : null);

const BOW_DIR = dirArg
  ? path.resolve(dirArg)
  : path.resolve('F:/GitHub/ObjectStore/models/weapons/bow');

const ATLAS_CANDIDATES = [
  path.join(BOW_DIR, 'Texture_MAp_bow.png'),
  path.join(BOW_DIR, 'Texture_Map_bow.png'),
  path.join(
    ROOT,
    'attackmotion/grudgeracecharacters/animationsweapons/bows/Texture/Texture_MAp_bow.png',
  ),
];

function findAtlas() {
  for (const p of ATLAS_CANDIDATES) {
    if (fs.existsSync(p) && fs.statSync(p).size > 100) return p;
  }
  return null;
}

function isTinyPlaceholder(buf) {
  // 1×1 PNG from FBX2glTF is ~70–90 bytes; any map under 200 bytes is junk
  return !buf || buf.byteLength < 200;
}

async function rebakeFile(io, glbPath, atlasBytes) {
  const doc = await io.read(glbPath);
  const textures = doc.getRoot().listTextures();
  if (!textures.length) {
    return { ok: false, reason: 'no textures' };
  }
  let replaced = 0;
  for (const tex of textures) {
    const img = tex.getImage();
    if (isTinyPlaceholder(img)) {
      tex.setImage(atlasBytes);
      tex.setMimeType('image/png');
      // keep URI null so image is embedded
      tex.setURI('');
      replaced++;
    }
  }
  if (!replaced) {
    return { ok: false, reason: 'no placeholder maps' };
  }
  if (!dryRun) {
    await io.write(glbPath, doc);
  }
  return { ok: true, replaced };
}

async function main() {
  const atlasPath = findAtlas();
  if (!atlasPath) {
    console.error('[rebake] No Texture_MAp_bow.png found. Looked in:');
    for (const p of ATLAS_CANDIDATES) console.error('  ', p);
    process.exit(1);
  }
  const atlasBytes = new Uint8Array(fs.readFileSync(atlasPath));
  console.log(`[rebake] atlas ${atlasPath} (${atlasBytes.byteLength} B)`);
  console.log(`[rebake] dir ${BOW_DIR}${dryRun ? ' (dry-run)' : ''}`);

  if (!fs.existsSync(BOW_DIR)) {
    console.error('[rebake] directory missing');
    process.exit(1);
  }

  const files = fs
    .readdirSync(BOW_DIR)
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .map((f) => path.join(BOW_DIR, f));

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const file of files) {
    try {
      const r = await rebakeFile(io, file, atlasBytes);
      if (r.ok) {
        ok++;
        console.log(`  OK  ${path.basename(file)}  replaced=${r.replaced}`);
      } else {
        skip++;
        console.log(`  skip ${path.basename(file)}  (${r.reason})`);
      }
    } catch (e) {
      fail++;
      console.error(`  FAIL ${path.basename(file)}: ${e.message || e}`);
    }
  }

  console.log(`[rebake] done ok=${ok} skip=${skip} fail=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
